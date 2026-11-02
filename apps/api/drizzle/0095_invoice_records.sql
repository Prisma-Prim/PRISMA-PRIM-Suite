CREATE FUNCTION invoice_keys(j jsonb,names text[]) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(jsonb_typeof(j)='object' AND (SELECT count(*)=cardinality(names) AND bool_and(k=ANY(names)) FROM jsonb_object_keys(j) k),false);
$$;

--> statement-breakpoint
CREATE FUNCTION invoice_uuid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(jsonb_typeof(j)='string' AND j#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false);
$$;

--> statement-breakpoint
CREATE FUNCTION invoice_date(j jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ BEGIN
 IF j='null'::jsonb THEN RETURN true; END IF;
 RETURN coalesce(jsonb_typeof(j)='string' AND (j#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND substring(j#>>'{}',1,4)<>'0000' AND to_char((j#>>'{}')::date,'YYYY-MM-DD')=j#>>'{}',false);
 EXCEPTION WHEN OTHERS THEN RETURN false; END $$;

--> statement-breakpoint
CREATE FUNCTION invoice_time(j jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ BEGIN
 RETURN coalesce(jsonb_typeof(j)='string' AND (j#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' AND to_char((j#>>'{}')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=j#>>'{}',false);
 EXCEPTION WHEN OTHERS THEN RETURN false; END $$;

--> statement-breakpoint
CREATE FUNCTION invoice_text(j jsonb,maximum integer) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE value text; units integer; invalid boolean;
BEGIN
 IF jsonb_typeof(j) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
 value:=j#>>'{}';
 SELECT coalesce(sum(CASE WHEN ascii(s)>65535 THEN 2 ELSE 1 END),0),coalesce(bool_or(ascii(s)<32 OR ascii(s) BETWEEN 127 AND 159),false) INTO units,invalid FROM regexp_split_to_table(value,'') s;
 RETURN NOT invalid AND units BETWEEN 1 AND maximum AND length(btrim(value,chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)))>0;
 EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE FUNCTION invoice_number(j jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ BEGIN
 RETURN coalesce(jsonb_typeof(j)='number' AND (j#>>'{}') ~ '^[1-9][0-9]*$' AND (j#>>'{}')::numeric BETWEEN 1 AND 2147483647,false);
 EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE FUNCTION invoice_minor(j jsonb,positive boolean) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(jsonb_typeof(j)='string' AND (j#>>'{}') ~ CASE WHEN positive THEN '^[1-9][0-9]{0,13}$' ELSE '^(0|[1-9][0-9]{0,13})$' END,false);
$$;
--> statement-breakpoint
CREATE FUNCTION invoice_values_valid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(invoice_keys(j,ARRAY['externalSystem','externalNumber','issuedOn','dueOn','currency','grossMinor','netMinor','taxMinor']) AND invoice_text(j->'externalSystem',120) AND invoice_text(j->'externalNumber',200) AND j->'issuedOn'<>'null'::jsonb AND invoice_date(j->'issuedOn') AND invoice_date(j->'dueOn') AND j->>'currency' IN ('MDL','EUR','RON','USD') AND invoice_minor(j->'grossMinor',true) AND (j->'netMinor'='null'::jsonb OR invoice_minor(j->'netMinor',false)) AND (j->'taxMinor'='null'::jsonb OR invoice_minor(j->'taxMinor',false)),false);
$$;
--> statement-breakpoint
CREATE FUNCTION invoice_source_valid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(invoice_keys(j,ARRAY['documentId','documentVersionId','representationId']) AND invoice_uuid(j->'documentId') AND invoice_uuid(j->'documentVersionId') AND invoice_uuid(j->'representationId'),false);
$$;
--> statement-breakpoint
CREATE FUNCTION invoice_fact_valid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(invoice_keys(j,ARRAY['entryState','values']) AND j->>'entryState' IN ('RECORDED','WITHDRAWN') AND invoice_values_valid(j->'values'),false);
$$;
--> statement-breakpoint
CREATE FUNCTION invoice_receipt_valid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(invoice_keys(j,ARRAY['format','commandId','recordId','revision','action','recordedAt']) AND j->>'format'='EXTERNAL_INVOICE_COMMAND/1' AND invoice_uuid(j->'commandId') AND invoice_uuid(j->'recordId') AND invoice_number(j->'revision') AND j->>'action' IN ('CREATE','CORRECT','WITHDRAW_ENTRY') AND invoice_time(j->'recordedAt'),false);
$$;
--> statement-breakpoint
CREATE FUNCTION invoice_revision_valid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(invoice_keys(j,ARRAY['format','recordId','revision','action','commandId','actor','recordedAt','before','after','reason']) AND j->>'format'='EXTERNAL_INVOICE_REVISION/1' AND invoice_uuid(j->'recordId') AND invoice_number(j->'revision') AND j->>'action' IN ('CREATE','CORRECT','WITHDRAW_ENTRY') AND invoice_uuid(j->'commandId') AND invoice_keys(j->'actor',ARRAY['membershipId','displayName']) AND invoice_uuid(j->'actor'->'membershipId') AND invoice_text(j->'actor'->'displayName',1000) AND invoice_time(j->'recordedAt') AND invoice_fact_valid(j->'after') AND
 CASE j->>'action' WHEN 'CREATE' THEN j->>'revision'='1' AND j->'before'='null'::jsonb AND j->'reason'='null'::jsonb AND j->'after'->>'entryState'='RECORDED'
 WHEN 'CORRECT' THEN (j->>'revision')::numeric>1 AND invoice_fact_valid(j->'before') AND j->'before'->>'entryState'='RECORDED' AND j->'after'->>'entryState'='RECORDED' AND j->'before'->'values' IS DISTINCT FROM j->'after'->'values' AND invoice_text(j->'reason',2000)
 ELSE (j->>'revision')::numeric>1 AND invoice_fact_valid(j->'before') AND j->'before'->>'entryState'='RECORDED' AND j->'after'->>'entryState'='WITHDRAWN' AND j->'before'->'values'=j->'after'->'values' AND invoice_text(j->'reason',2000) END,false);
$$;
--> statement-breakpoint
CREATE TABLE "invoice_record_commands" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"assignment_id" uuid NOT NULL,
	"source_captures" jsonb,
	"idempotency_key" text NOT NULL,
	"intent" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"response" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_command_actor_label_check" CHECK (invoice_text(to_jsonb("invoice_record_commands"."actor_display_name"),1000)),
	CONSTRAINT "invoice_command_receipt_check" CHECK (invoice_receipt_valid("invoice_record_commands"."response") AND "invoice_record_commands"."revision" BETWEEN 1 AND 2147483647 AND length("invoice_record_commands"."idempotency_key") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "invoice_record_cursor_keys" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"key" text DEFAULT gen_random_uuid()::text || gen_random_uuid()::text NOT NULL,
	CONSTRAINT "invoice_record_cursor_keys_workspace_id_company_id_pk" PRIMARY KEY("workspace_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "invoice_record_events" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"command_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"action" text NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "invoice_record_events_workspace_id_company_id_record_id_revision_pk" PRIMARY KEY("workspace_id","company_id","record_id","revision"),
	CONSTRAINT "invoice_event_check" CHECK ("invoice_record_events"."action" IN ('invoice_record.created','invoice_record.transcription.corrected','invoice_record.entry.withdrawn') AND "invoice_record_events"."metadata"=jsonb_build_object('revision',"invoice_record_events"."revision"))
);
--> statement-breakpoint
CREATE TABLE "invoice_record_history" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"command_id" uuid NOT NULL,
	"fact" jsonb NOT NULL,
	CONSTRAINT "invoice_record_history_workspace_id_company_id_record_id_revision_pk" PRIMARY KEY("workspace_id","company_id","record_id","revision"),
	CONSTRAINT "invoice_history_fact_check" CHECK (invoice_revision_valid("invoice_record_history"."fact") AND "invoice_record_history"."fact"->>'recordId'="invoice_record_history"."record_id"::text AND ("invoice_record_history"."fact"->>'revision')::integer="invoice_record_history"."revision" AND "invoice_record_history"."fact"->>'commandId'="invoice_record_history"."command_id"::text)
);
--> statement-breakpoint
CREATE TABLE "invoice_records" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"created_sequence" bigint GENERATED ALWAYS AS IDENTITY (sequence name "invoice_records_created_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"document_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"representation_id" uuid NOT NULL,
	"source_snapshot" jsonb NOT NULL,
	"replaces_withdrawn_record_id" uuid,
	"revision" integer NOT NULL,
	"entry_state" text NOT NULL,
	"values" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "invoice_record_head_check" CHECK ("invoice_records"."revision" BETWEEN 1 AND 2147483647 AND "invoice_records"."entry_state" IN ('RECORDED','WITHDRAWN') AND invoice_values_valid("invoice_records"."values") AND jsonb_typeof("invoice_records"."source_snapshot")='object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_record_scope_unique" ON "invoice_records" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
ALTER TABLE "invoice_record_commands" ADD CONSTRAINT "invoice_record_commands_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."company_role_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_record_commands" ADD CONSTRAINT "invoice_command_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_record_commands" ADD CONSTRAINT "invoice_command_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_record_cursor_keys" ADD CONSTRAINT "invoice_cursor_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_record_events" ADD CONSTRAINT "invoice_record_events_command_id_invoice_record_commands_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."invoice_record_commands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_record_events" ADD CONSTRAINT "invoice_event_history_fk" FOREIGN KEY ("workspace_id","company_id","record_id","revision") REFERENCES "public"."invoice_record_history"("workspace_id","company_id","record_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_record_events" ADD CONSTRAINT "invoice_event_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_record_history" ADD CONSTRAINT "invoice_record_history_command_id_invoice_record_commands_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."invoice_record_commands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_record_history" ADD CONSTRAINT "invoice_history_record_fk" FOREIGN KEY ("workspace_id","company_id","record_id") REFERENCES "public"."invoice_records"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_records" ADD CONSTRAINT "invoice_record_source_fk" FOREIGN KEY ("workspace_id","company_id","document_id","document_version_id","representation_id") REFERENCES "public"."document_pdfs"("workspace_id","company_id","document_id","version_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_command_actor_key" ON "invoice_record_commands" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_command_record_revision" ON "invoice_record_commands" USING btree ("workspace_id","company_id","record_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_event_command_unique" ON "invoice_record_events" USING btree ("command_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_history_command_unique" ON "invoice_record_history" USING btree ("command_id");--> statement-breakpoint

CREATE UNIQUE INDEX "invoice_record_active_document_unique" ON "invoice_records" USING btree ("workspace_id","company_id","document_id") WHERE "invoice_records"."entry_state"='RECORDED';--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_record_direct_replacement_unique" ON "invoice_records" USING btree ("replaces_withdrawn_record_id");--> statement-breakpoint
CREATE INDEX "invoice_record_inventory_idx" ON "invoice_records" USING btree ("workspace_id","company_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
-- Access-owned participant: financial capture never implies a source-family grant.
CREATE FUNCTION access_require_invoice_record_command(w uuid,c uuid,member_id uuid,user_id uuid,finance_id uuid,captures jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE name text; capture jsonb; context_found boolean;
BEGIN
 PERFORM 1 FROM company_role_assignments a JOIN workspace_memberships m ON (m.workspace_id,m.id)=(a.workspace_id,a.workspace_membership_id) JOIN internal_users u ON u.id=m.internal_user_id JOIN companies co ON (co.workspace_id,co.id)=(a.workspace_id,a.company_id)
 WHERE a.id=finance_id AND a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=member_id AND a.bundle::text='company_invoice_recorder' AND a.permission_set_version='v1' AND a.revoked_at IS NULL AND m.internal_user_id=user_id AND m.status='active' AND u.status='active' AND co.status='active' FOR SHARE OF a,m,u,co;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_authority',MESSAGE='Invoice command requires its exact live financial capture.'; END IF;
 PERFORM 1 FROM workspace_permission_grants WHERE workspace_id=w AND workspace_membership_id=member_id AND permission='company.manage' FOR SHARE;
 context_found:=FOUND;
 IF NOT context_found THEN
  PERFORM 1 FROM company_role_assignments WHERE workspace_id=w AND company_id=c AND workspace_membership_id=member_id AND bundle::text IN ('company_document_registrar','company_context_access','company_director_client_access','company_project_access') AND revoked_at IS NULL FOR SHARE;
  context_found:=FOUND;
 END IF;
 IF NOT context_found THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_authority',MESSAGE='Invoice command requires independent live Company context.'; END IF;
 IF captures IS NULL THEN RETURN; END IF;
 IF NOT invoice_keys(captures,ARRAY['family','registrar','content','contract','intake','client']) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_source_authority',MESSAGE='Source authority captures are closed.'; END IF;
 FOREACH name IN ARRAY ARRAY['family','registrar','content','contract','intake','client'] LOOP
  capture:=captures->name;
  IF name='client' AND capture='null'::jsonb THEN
   PERFORM 1 FROM workspace_permission_grants WHERE workspace_id=w AND workspace_membership_id=member_id AND permission='client.manage' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_source_authority',MESSAGE='Source requires current original Client authority.'; END IF;
   CONTINUE;
  END IF;
  IF NOT invoice_keys(capture,ARRAY['assignmentId','bundle','version']) OR NOT invoice_uuid(capture->'assignmentId') OR NOT coalesce(CASE name
   WHEN 'family' THEN capture->>'bundle'='company_external_invoice_access' AND capture->>'version'='v1'
   WHEN 'registrar' THEN capture->>'bundle'='company_document_registrar' AND capture->>'version' IN ('v1','v2','v3')
   WHEN 'content' THEN capture->>'bundle'='company_document_content_reader' AND capture->>'version'='v1'
   WHEN 'contract' THEN capture->>'bundle' IN ('company_contract_preparer','company_contract_approver') AND capture->>'version' IN ('v1','v2')
   WHEN 'intake' THEN capture->>'bundle'='company_commercial_intake' AND capture->>'version' IN ('v1','v2','v3','v4')
   WHEN 'client' THEN capture->>'bundle'='company_director_client_access' AND capture->>'version' IN ('v1','v2') END,false) THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_source_authority',MESSAGE='Source requires exact native captures.';
  END IF;
  PERFORM 1 FROM company_role_assignments a WHERE a.id=(capture->>'assignmentId')::uuid AND a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=member_id AND a.bundle::text=capture->>'bundle' AND a.permission_set_version=capture->>'version' AND a.revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_source_authority',MESSAGE='Source capture is no longer current.'; END IF;
 END LOOP;
END $$;
--> statement-breakpoint
-- Client-owned native new-use participant, matching the public reference fence.
CREATE FUNCTION client_require_invoice_record_new_use(w uuid,c uuid,original_client uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM client_accounts WHERE workspace_id=w AND id=original_client AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_source',MESSAGE='A new invoice use requires its active original Client.'; END IF;
 PERFORM 1 FROM client_company_relationships WHERE workspace_id=w AND company_id=c AND client_account_id=original_client AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_source',MESSAGE='A new invoice use requires its active original Company relationship.'; END IF;
END $$;
--> statement-breakpoint
-- Document-owned caller-transaction source participant, including native Contract validation.
CREATE FUNCTION documents_invoice_record_source(w uuid,c uuid,source jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb; cv_id uuid; source_client uuid;
BEGIN
 IF NOT invoice_source_valid(source) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_source',MESSAGE='An exact source tuple is required.'; END IF;
 SELECT client_id INTO source_client FROM working_documents WHERE workspace_id=w AND company_id=c AND id=(source->>'documentId')::uuid FOR UPDATE;
 PERFORM client_require_invoice_record_new_use(w,c,source_client);
 PERFORM 1 FROM document_versions WHERE workspace_id=w AND company_id=c AND document_id=(source->>'documentId')::uuid AND id=(source->>'documentVersionId')::uuid FOR SHARE;
 SELECT jsonb_build_object('source',source,'originalClientId',d.client_id,'opportunityId',r.opportunity_id,'contractId',r.contract_id,'contractVersionId',r.contract_version_id,'receivingPartyAdditionalId',r.recipient_additional_legal_entity_id,'byteLength',p.size,'sha256',p.sha256,'copiedContext',jsonb_build_object('companyLabel',co.display_name,'contractReference',r.illustrative_reference::text,'contractVersionNumber',r.contract_version_number,'receivingParty',jsonb_build_object('kind',r.recipient_kind,'legalName',r.recipient_legal_name,'taxIdentifier',r.recipient_tax_id,'address',r.recipient_legal_address))),cv.id INTO result,cv_id
 FROM working_documents d JOIN companies co ON (co.workspace_id,co.id)=(d.workspace_id,d.company_id) JOIN document_versions v ON (v.workspace_id,v.company_id,v.document_id)=(d.workspace_id,d.company_id,d.id) JOIN document_pdfs p ON (p.workspace_id,p.company_id,p.document_id,p.version_id)=(v.workspace_id,v.company_id,v.document_id,v.id) JOIN external_invoice_document_relations r ON (r.workspace_id,r.company_id,r.document_id)=(d.workspace_id,d.company_id,d.id) JOIN contracts ct ON (ct.workspace_id,ct.company_id,ct.id)=(r.workspace_id,r.company_id,r.contract_id) JOIN contract_versions cv ON (cv.workspace_id,cv.company_id,cv.contract_id,cv.id)=(r.workspace_id,r.company_id,r.contract_id,r.contract_version_id) JOIN contract_signing_declarations sd ON (sd.workspace_id,sd.company_id,sd.contract_id,sd.contract_version_id)=(cv.workspace_id,cv.company_id,cv.contract_id,cv.id) JOIN client_accounts cl ON (cl.workspace_id,cl.id)=(d.workspace_id,d.client_id) JOIN client_company_relationships cr ON (cr.workspace_id,cr.company_id,cr.client_account_id)=(d.workspace_id,d.company_id,d.client_id)
 WHERE d.workspace_id=w AND d.company_id=c AND d.id=(source->>'documentId')::uuid AND d.type='external-invoice' AND v.id=(source->>'documentVersionId')::uuid AND v.status IN ('official','superseded') AND p.id=(source->>'representationId')::uuid AND p.scan_outcome='clean' AND p.size=octet_length(p.content) AND p.sha256=encode(sha256(p.content),'hex')
 AND cl.status='active' AND cr.status='active' AND ct.kind='CONTRACT' AND ct.origin='COMPANY_MODEL_OFFER' AND ct.opportunity_id=r.opportunity_id AND ct.original_client_account_id=d.client_id AND cv.provenance='COMPANY_MODEL_OFFER' AND cv.decision_state='APPROVED' AND cv.execution_state='EXECUTED' AND cv.recipient_client_account_id=d.client_id AND (cv.recipient_kind,cv.recipient_additional_legal_entity_id,cv.recipient_legal_name,cv.recipient_tax_id,cv.recipient_legal_address) IS NOT DISTINCT FROM (r.recipient_kind,r.recipient_additional_legal_entity_id,r.recipient_legal_name,r.recipient_tax_id,r.recipient_legal_address);
 IF result IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_source',MESSAGE='The native source is not eligible for a new financial use.'; END IF;
 PERFORM validate_reported_contract_signing(cv_id);
 RETURN result;
END $$;
--> statement-breakpoint
CREATE FUNCTION invoice_prepare_command() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE body jsonb:=NEW.intent->'body'; operation text:=body->>'action'; root invoice_records%ROWTYPE; predecessor invoice_records%ROWTYPE; stamp text; latest_id uuid;
BEGIN
 IF NEW.revision<>0 OR NEW.response<>'{}'::jsonb OR length(NEW.idempotency_key) NOT BETWEEN 1 AND 200 OR NEW.idempotency_key<>btrim(NEW.idempotency_key) OR NOT coalesce(invoice_keys(NEW.intent,ARRAY['format','workspaceId','companyId','actorMembershipId','recordId','body']) AND NEW.intent->>'format'='EXTERNAL_INVOICE_INTENT/1' AND NEW.intent->>'workspaceId'=NEW.workspace_id::text AND NEW.intent->>'companyId'=NEW.company_id::text AND NEW.intent->>'actorMembershipId'=NEW.actor_membership_id::text AND NEW.intent->>'recordId'=NEW.record_id::text,false) THEN
  RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_intent',MESSAGE='Invoice commands require their exact native intent.';
 END IF;
 IF NOT coalesce(CASE operation WHEN 'CREATE' THEN invoice_keys(body,ARRAY['action','source','values','acknowledgeExternalDeclaration','replacesWithdrawnRecordId']) AND invoice_source_valid(body->'source') AND invoice_values_valid(body->'values') AND body->'acknowledgeExternalDeclaration'='true'::jsonb AND (body->'replacesWithdrawnRecordId'='null'::jsonb OR invoice_uuid(body->'replacesWithdrawnRecordId'))
 WHEN 'CORRECT' THEN invoice_keys(body,ARRAY['action','expectedRevision','values','reason']) AND invoice_number(body->'expectedRevision') AND invoice_values_valid(body->'values') AND invoice_text(body->'reason',2000)
 WHEN 'WITHDRAW_ENTRY' THEN invoice_keys(body,ARRAY['action','expectedRevision','reason']) AND invoice_number(body->'expectedRevision') AND invoice_text(body->'reason',2000) ELSE false END,false) OR (operation='WITHDRAW_ENTRY') IS DISTINCT FROM (NEW.source_captures IS NULL) THEN
  RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_intent',MESSAGE='Invoice intent has an invalid action or closed format.';
 END IF;
 PERFORM access_require_invoice_record_command(NEW.workspace_id,NEW.company_id,NEW.actor_membership_id,NEW.actor_internal_user_id,NEW.assignment_id,NEW.source_captures);
 IF operation='CREATE' THEN
  PERFORM documents_invoice_record_source(NEW.workspace_id,NEW.company_id,body->'source');
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-source:'||NEW.workspace_id||':'||NEW.company_id||':'||(body->'source'->>'documentId'),0));
  IF EXISTS(SELECT 1 FROM invoice_records WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND document_id=(body->'source'->>'documentId')::uuid AND entry_state='RECORDED') THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_source_active',MESSAGE='This Document already has an active financial record.';
  END IF;
  SELECT id INTO latest_id FROM invoice_records WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND document_id=(body->'source'->>'documentId')::uuid ORDER BY created_sequence DESC LIMIT 1;
  IF latest_id IS NOT NULL AND latest_id IS DISTINCT FROM (body->>'replacesWithdrawnRecordId')::uuid THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_predecessor',MESSAGE='Reusing a source requires its latest withdrawn predecessor.';
  END IF;
  IF body->>'replacesWithdrawnRecordId' IS NOT NULL THEN
   SELECT * INTO predecessor FROM invoice_records WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=(body->>'replacesWithdrawnRecordId')::uuid FOR UPDATE;
   IF NOT FOUND OR predecessor.entry_state<>'WITHDRAWN' OR EXISTS(SELECT 1 FROM invoice_records WHERE replaces_withdrawn_record_id=predecessor.id) THEN
    RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_predecessor',MESSAGE='A withdrawn entry may have exactly one explicit replacement.';
   END IF;
  END IF;
  NEW.revision:=1;
 ELSE
  -- Source commands and withdrawal share exact scoped record serialization.
  SELECT * INTO root FROM invoice_records WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.record_id FOR UPDATE;
  IF NOT FOUND OR root.entry_state<>'RECORDED' OR root.revision<>(body->>'expectedRevision')::integer OR root.revision=2147483647 THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_transition',MESSAGE='The financial entry is withdrawn, stale or exhausted.';
  END IF;
  IF operation='CORRECT' THEN
   PERFORM documents_invoice_record_source(NEW.workspace_id,NEW.company_id,root.source_snapshot->'source');
   IF root.values=body->'values' THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_no_change',MESSAGE='A correction requires a material transcription change.'; END IF;
  END IF;
  NEW.revision:=root.revision+1;
 END IF;
 NEW.created_at:=date_trunc('milliseconds',clock_timestamp());
 stamp:=to_char(NEW.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 NEW.response:=jsonb_build_object('format','EXTERNAL_INVOICE_COMMAND/1','commandId',NEW.id,'recordId',NEW.record_id,'revision',NEW.revision,'action',operation,'recordedAt',stamp);
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER invoice_command_prepare BEFORE INSERT ON invoice_record_commands FOR EACH ROW EXECUTE FUNCTION invoice_prepare_command();
--> statement-breakpoint
CREATE FUNCTION invoice_construct_effects() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE body jsonb:=NEW.intent->'body'; operation text:=body->>'action'; root invoice_records%ROWTYPE; source jsonb; previous jsonb:='null'::jsonb; result jsonb; fact jsonb;
BEGIN
 IF operation='CREATE' THEN
  source:=documents_invoice_record_source(NEW.workspace_id,NEW.company_id,body->'source');
  INSERT INTO invoice_records(workspace_id,company_id,id,document_id,document_version_id,representation_id,source_snapshot,replaces_withdrawn_record_id,revision,entry_state,"values",created_at) VALUES(NEW.workspace_id,NEW.company_id,NEW.record_id,(body->'source'->>'documentId')::uuid,(body->'source'->>'documentVersionId')::uuid,(body->'source'->>'representationId')::uuid,source,(body->>'replacesWithdrawnRecordId')::uuid,1,'RECORDED',body->'values',NEW.created_at);
  result:=jsonb_build_object('entryState','RECORDED','values',body->'values');
 ELSE
  SELECT * INTO root FROM invoice_records WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.record_id;
  previous:=jsonb_build_object('entryState',root.entry_state,'values',root.values);
  result:=jsonb_build_object('entryState',CASE WHEN operation='WITHDRAW_ENTRY' THEN 'WITHDRAWN' ELSE 'RECORDED' END,'values',CASE WHEN operation='WITHDRAW_ENTRY' THEN root.values ELSE body->'values' END);
  UPDATE invoice_records SET revision=NEW.revision,entry_state=result->>'entryState',"values"=result->'values' WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.record_id AND revision=NEW.revision-1;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_transition',MESSAGE='The predecessor revision is required.'; END IF;
 END IF;
 fact:=jsonb_build_object('format','EXTERNAL_INVOICE_REVISION/1','recordId',NEW.record_id,'revision',NEW.revision,'action',operation,'commandId',NEW.id,'actor',jsonb_build_object('membershipId',NEW.actor_membership_id,'displayName',NEW.actor_display_name),'recordedAt',NEW.response->'recordedAt','before',previous,'after',result,'reason',CASE WHEN operation='CREATE' THEN 'null'::jsonb ELSE body->'reason' END);
 INSERT INTO invoice_record_history(workspace_id,company_id,record_id,revision,command_id,fact) VALUES(NEW.workspace_id,NEW.company_id,NEW.record_id,NEW.revision,NEW.id,fact);
 INSERT INTO invoice_record_cursor_keys(workspace_id,company_id) VALUES(NEW.workspace_id,NEW.company_id) ON CONFLICT DO NOTHING;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER invoice_command_effects AFTER INSERT ON invoice_record_commands FOR EACH ROW EXECUTE FUNCTION invoice_construct_effects();
--> statement-breakpoint
CREATE FUNCTION invoice_effect_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR pg_trigger_depth()<2 OR (TG_OP='UPDATE' AND TG_TABLE_NAME<>'invoice_records') THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_effect_path',MESSAGE='Invoice effects require their validated native command.'; END IF;
 IF TG_TABLE_NAME='invoice_records' THEN
 IF TG_OP='UPDATE' AND ((NEW.workspace_id,NEW.company_id,NEW.id,NEW.created_sequence,NEW.document_id,NEW.document_version_id,NEW.representation_id,NEW.source_snapshot,NEW.replaces_withdrawn_record_id,NEW.created_at) IS DISTINCT FROM (OLD.workspace_id,OLD.company_id,OLD.id,OLD.created_sequence,OLD.document_id,OLD.document_version_id,OLD.representation_id,OLD.source_snapshot,OLD.replaces_withdrawn_record_id,OLD.created_at) OR NEW.revision<>OLD.revision+1 OR OLD.entry_state<>'RECORDED') THEN
  RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_root_immutable',MESSAGE='Copied source context is immutable and withdrawal is terminal.';
 END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER invoice_root_path BEFORE INSERT OR UPDATE OR DELETE ON invoice_records FOR EACH ROW EXECUTE FUNCTION invoice_effect_guard();
--> statement-breakpoint
CREATE TRIGGER invoice_history_path BEFORE INSERT OR UPDATE OR DELETE ON invoice_record_history FOR EACH ROW EXECUTE FUNCTION invoice_effect_guard();
--> statement-breakpoint
CREATE FUNCTION invoice_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_immutable',MESSAGE='Committed invoice history, receipts and events are retained.'; END $$;
--> statement-breakpoint
CREATE TRIGGER invoice_command_immutable BEFORE UPDATE OR DELETE ON invoice_record_commands FOR EACH ROW EXECUTE FUNCTION invoice_immutable_guard();
--> statement-breakpoint
CREATE TRIGGER invoice_event_immutable BEFORE UPDATE OR DELETE ON invoice_record_events FOR EACH ROW EXECUTE FUNCTION invoice_immutable_guard();
--> statement-breakpoint
CREATE TRIGGER invoice_cursor_immutable BEFORE UPDATE OR DELETE ON invoice_record_cursor_keys FOR EACH ROW EXECUTE FUNCTION invoice_immutable_guard();
--> statement-breakpoint
-- Deferred reconstruction checks the entire intent→before→after→receipt→typed event chain.
CREATE FUNCTION invoice_coupling_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root invoice_records%ROWTYPE; h invoice_record_history%ROWTYPE; command invoice_record_commands%ROWTYPE; previous jsonb:='null'::jsonb; expected integer:=1; operation text; expected_after jsonb; expected_action text;
BEGIN
 SELECT * INTO root FROM invoice_records WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.record_id;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_coupling',MESSAGE='Missing Invoice Record.'; END IF;
 FOR h IN SELECT * FROM invoice_record_history WHERE workspace_id=root.workspace_id AND company_id=root.company_id AND record_id=root.id ORDER BY revision LOOP
  SELECT * INTO command FROM invoice_record_commands WHERE id=h.command_id;
  operation:=command.intent->'body'->>'action';
  expected_after:=jsonb_build_object('entryState',CASE WHEN operation='WITHDRAW_ENTRY' THEN 'WITHDRAWN' ELSE 'RECORDED' END,'values',CASE WHEN operation='WITHDRAW_ENTRY' THEN previous->'values' ELSE command.intent->'body'->'values' END);
  expected_action:=CASE operation WHEN 'CREATE' THEN 'invoice_record.created' WHEN 'CORRECT' THEN 'invoice_record.transcription.corrected' ELSE 'invoice_record.entry.withdrawn' END;
  IF command.id IS NULL OR h.revision<>expected OR h.fact->'before' IS DISTINCT FROM previous OR h.fact->'after' IS DISTINCT FROM expected_after OR h.fact->>'action' IS DISTINCT FROM operation OR (command.workspace_id,command.company_id,command.record_id,command.revision) IS DISTINCT FROM (h.workspace_id,h.company_id,h.record_id,h.revision) OR command.response IS DISTINCT FROM jsonb_build_object('format','EXTERNAL_INVOICE_COMMAND/1','commandId',command.id,'recordId',root.id,'revision',h.revision,'action',operation,'recordedAt',h.fact->'recordedAt') OR h.fact->'actor'->>'membershipId'<>command.actor_membership_id::text OR h.fact->'actor'->>'displayName' IS DISTINCT FROM command.actor_display_name OR (h.fact->>'recordedAt')::timestamptz<>command.created_at OR h.fact->'reason' IS DISTINCT FROM (CASE WHEN operation='CREATE' THEN 'null'::jsonb ELSE command.intent->'body'->'reason' END) OR (expected=1) IS DISTINCT FROM (operation='CREATE') OR (expected>1 AND ((command.intent->'body'->>'expectedRevision')::integer<>expected-1 OR previous->>'entryState'<>'RECORDED')) OR NOT EXISTS(SELECT 1 FROM invoice_record_events e WHERE e.workspace_id=h.workspace_id AND e.company_id=h.company_id AND e.record_id=h.record_id AND e.revision=h.revision AND e.command_id=command.id AND e.actor_membership_id=command.actor_membership_id AND e.actor_internal_user_id=command.actor_internal_user_id AND e.occurred_at=command.created_at AND e.action=expected_action AND e.metadata=jsonb_build_object('revision',h.revision)) THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_coupling',MESSAGE='Invoice history requires its exact coupled native intent, receipt and private event.';
  END IF;
  IF expected=1 THEN
   IF root.source_snapshot->'source' IS DISTINCT FROM command.intent->'body'->'source' OR root.replaces_withdrawn_record_id IS DISTINCT FROM (command.intent->'body'->>'replacesWithdrawnRecordId')::uuid OR root.created_at<>command.created_at THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_coupling',MESSAGE='Copied context must derive from the exact initial source.'; END IF;
  END IF;
  previous:=h.fact->'after';expected:=expected+1;
 END LOOP;
 IF root.revision<>expected-1 OR jsonb_build_object('entryState',root.entry_state,'values',root.values) IS DISTINCT FROM previous OR EXISTS(SELECT 1 FROM invoice_record_commands c LEFT JOIN invoice_record_history missing_history ON missing_history.command_id=c.id WHERE c.workspace_id=root.workspace_id AND c.company_id=root.company_id AND c.record_id=root.id AND missing_history.command_id IS NULL) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='invoice_native_coupling',MESSAGE='The current invoice head must conserve its complete history.'; END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER invoice_command_coupling AFTER INSERT ON invoice_record_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_coupling_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER invoice_history_coupling AFTER INSERT ON invoice_record_history DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_coupling_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER invoice_event_coupling AFTER INSERT ON invoice_record_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_coupling_guard();
