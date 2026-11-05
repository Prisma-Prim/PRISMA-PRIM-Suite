CREATE FUNCTION payment_keys(j jsonb,names text[]) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(jsonb_typeof(j)='object' AND (SELECT count(*)=cardinality(names) AND bool_and(k=ANY(names)) FROM jsonb_object_keys(j) k),false);
$$;

--> statement-breakpoint
CREATE FUNCTION payment_uuid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(jsonb_typeof(j)='string' AND j#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false);
$$;

--> statement-breakpoint
CREATE FUNCTION payment_date(j jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ BEGIN
 IF j='null'::jsonb THEN RETURN true; END IF;
 RETURN coalesce(jsonb_typeof(j)='string' AND (j#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND substring(j#>>'{}',1,4)<>'0000' AND to_char((j#>>'{}')::date,'YYYY-MM-DD')=j#>>'{}',false);
 EXCEPTION WHEN OTHERS THEN RETURN false; END $$;

--> statement-breakpoint
CREATE FUNCTION payment_time(j jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ BEGIN
 RETURN coalesce(jsonb_typeof(j)='string' AND (j#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' AND to_char((j#>>'{}')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=j#>>'{}',false);
 EXCEPTION WHEN OTHERS THEN RETURN false; END $$;

--> statement-breakpoint
CREATE FUNCTION payment_text(j jsonb,maximum integer) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE value text; units integer; invalid boolean;
BEGIN
 IF jsonb_typeof(j) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
 value:=j#>>'{}';
 SELECT coalesce(sum(CASE WHEN ascii(s)>65535 THEN 2 ELSE 1 END),0),coalesce(bool_or(ascii(s)<32 OR ascii(s) BETWEEN 127 AND 159),false) INTO units,invalid FROM regexp_split_to_table(value,'') s;
 RETURN NOT invalid AND units BETWEEN 1 AND maximum AND length(btrim(value,chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)))>0;
 EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE FUNCTION payment_native_text(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(jsonb_typeof(j)='string' AND length(btrim(j#>>'{}',chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)))>0,false);
$$;
--> statement-breakpoint
CREATE FUNCTION payment_number(j jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ BEGIN
 RETURN coalesce(jsonb_typeof(j)='number' AND (j#>>'{}') ~ '^[1-9][0-9]*$' AND (j#>>'{}')::numeric BETWEEN 1 AND 2147483647,false);
 EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE FUNCTION payment_minor(j jsonb,positive boolean) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(jsonb_typeof(j)='string' AND (j#>>'{}') ~ CASE WHEN positive THEN '^[1-9][0-9]{0,13}$' ELSE '^(0|[1-9][0-9]{0,13})$' END,false);
$$;
--> statement-breakpoint
CREATE FUNCTION payment_values_valid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(payment_keys(j,ARRAY['amountMinor','currency','effectiveOn','method','externalReference','observationBasis']) AND payment_minor(j->'amountMinor',true) AND j->>'currency' IN ('MDL','EUR','RON','USD') AND j->'effectiveOn'<>'null'::jsonb AND payment_date(j->'effectiveOn') AND payment_text(j->'method',120) AND (j->'externalReference'='null'::jsonb OR payment_text(j->'externalReference',200)) AND payment_text(j->'observationBasis',2000),false);
$$;
--> statement-breakpoint
CREATE FUNCTION payment_source_valid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(payment_keys(j,ARRAY['documentId','documentVersionId','representationId']) AND payment_uuid(j->'documentId') AND payment_uuid(j->'documentVersionId') AND payment_uuid(j->'representationId'),false);
$$;
--> statement-breakpoint
CREATE FUNCTION payment_actor_valid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(payment_keys(j,ARRAY['membershipId','displayName']) AND payment_uuid(j->'membershipId') AND payment_native_text(j->'displayName'),false);
$$;
--> statement-breakpoint
CREATE FUNCTION payment_confirmation_valid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(payment_keys(j,ARRAY['actor','recordedAt','note']) AND payment_actor_valid(j->'actor') AND payment_time(j->'recordedAt') AND payment_text(j->'note',2000),false);
$$;
--> statement-breakpoint
CREATE FUNCTION payment_fact_valid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(payment_keys(j,ARRAY['state','values','confirmation']) AND payment_values_valid(j->'values') AND CASE WHEN j->>'state' IN ('DRAFT','WITHDRAWN') THEN j->'confirmation'='null'::jsonb WHEN j->>'state' IN ('CONFIRMED','REVERSED') THEN payment_confirmation_valid(j->'confirmation') ELSE false END,false);
$$;
--> statement-breakpoint
CREATE FUNCTION payment_receipt_valid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(payment_keys(j,ARRAY['format','commandId','paymentId','revision','action','recordedAt']) AND j->>'format'='PAYMENT_COMMAND/1' AND payment_uuid(j->'commandId') AND payment_uuid(j->'paymentId') AND payment_number(j->'revision') AND j->>'action' IN ('CREATE','CORRECT_DRAFT','WITHDRAW_DRAFT','CONFIRM','REVERSE') AND payment_time(j->'recordedAt'),false);
$$;
--> statement-breakpoint
CREATE FUNCTION payment_revision_valid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(payment_keys(j,ARRAY['format','paymentId','revision','action','commandId','actor','recordedAt','before','after','reason']) AND j->>'format'='PAYMENT_REVISION/1' AND payment_uuid(j->'paymentId') AND payment_number(j->'revision') AND payment_uuid(j->'commandId') AND payment_actor_valid(j->'actor') AND payment_time(j->'recordedAt') AND payment_fact_valid(j->'after') AND
 CASE j->>'action'
 WHEN 'CREATE' THEN j->>'revision'='1' AND j->'before'='null'::jsonb AND j->'reason'='null'::jsonb AND j->'after'->>'state'='DRAFT'
 WHEN 'CORRECT_DRAFT' THEN (j->>'revision')::numeric>1 AND payment_fact_valid(j->'before') AND j->'before'->>'state'='DRAFT' AND j->'after'->>'state'='DRAFT' AND j->'before'->'values' IS DISTINCT FROM j->'after'->'values' AND payment_text(j->'reason',2000)
 WHEN 'WITHDRAW_DRAFT' THEN (j->>'revision')::numeric>1 AND payment_fact_valid(j->'before') AND j->'before'->>'state'='DRAFT' AND j->'after'->>'state'='WITHDRAWN' AND j->'before'->'values'=j->'after'->'values' AND payment_text(j->'reason',2000)
 WHEN 'CONFIRM' THEN (j->>'revision')::numeric>1 AND payment_fact_valid(j->'before') AND j->'before'->>'state'='DRAFT' AND j->'after'->>'state'='CONFIRMED' AND j->'before'->'values'=j->'after'->'values' AND j->'reason'='null'::jsonb AND j->'after'->'confirmation'->'actor'=j->'actor' AND j->'after'->'confirmation'->'recordedAt'=j->'recordedAt'
 WHEN 'REVERSE' THEN (j->>'revision')::numeric>1 AND payment_fact_valid(j->'before') AND j->'before'->>'state'='CONFIRMED' AND j->'after'->>'state'='REVERSED' AND j->'before'->'values'=j->'after'->'values' AND j->'before'->'confirmation'=j->'after'->'confirmation' AND payment_text(j->'reason',2000)
 ELSE false END,false);
$$;
--> statement-breakpoint
CREATE TABLE "payment_commands" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
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
	CONSTRAINT "payment_command_actor_label_check" CHECK (payment_native_text(to_jsonb("payment_commands"."actor_display_name"))),
	CONSTRAINT "payment_command_receipt_check" CHECK (payment_receipt_valid("payment_commands"."response") AND "payment_commands"."revision" BETWEEN 1 AND 2147483647 AND length("payment_commands"."idempotency_key") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "payment_cursor_keys" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"key" text DEFAULT gen_random_uuid()::text || gen_random_uuid()::text NOT NULL,
	CONSTRAINT "payment_cursor_keys_workspace_id_company_id_pk" PRIMARY KEY("workspace_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"command_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"action" text NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "payment_events_workspace_id_company_id_payment_id_revision_pk" PRIMARY KEY("workspace_id","company_id","payment_id","revision"),
	CONSTRAINT "payment_event_check" CHECK ("payment_events"."action" IN ('payment.observation.recorded','payment.draft.corrected','payment.draft.withdrawn','payment.confirmed','payment.reversed') AND "payment_events"."metadata"=jsonb_build_object('revision',"payment_events"."revision"))
);
--> statement-breakpoint
CREATE TABLE "payment_history" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"command_id" uuid NOT NULL,
	"fact" jsonb NOT NULL,
	CONSTRAINT "payment_history_workspace_id_company_id_payment_id_revision_pk" PRIMARY KEY("workspace_id","company_id","payment_id","revision"),
	CONSTRAINT "payment_history_fact_check" CHECK (payment_revision_valid("payment_history"."fact") AND "payment_history"."fact"->>'paymentId'="payment_history"."payment_id"::text AND ("payment_history"."fact"->>'revision')::integer="payment_history"."revision" AND "payment_history"."fact"->>'commandId'="payment_history"."command_id"::text)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"created_sequence" bigint GENERATED ALWAYS AS IDENTITY (sequence name "payments_created_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"document_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"representation_id" uuid NOT NULL,
	"source_snapshot" jsonb NOT NULL,
	"replaces_closed_payment_id" uuid,
	"revision" integer NOT NULL,
	"state" text NOT NULL,
	"values" jsonb NOT NULL,
	"confirmation" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payment_head_check" CHECK ("payments"."revision" BETWEEN 1 AND 2147483647 AND "payments"."state" IN ('DRAFT','CONFIRMED','WITHDRAWN','REVERSED') AND payment_values_valid("payments"."values") AND jsonb_typeof("payments"."source_snapshot")='object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_scope_unique" ON "payments" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
ALTER TABLE "payment_commands" ADD CONSTRAINT "payment_commands_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."company_role_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_commands" ADD CONSTRAINT "payment_command_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_commands" ADD CONSTRAINT "payment_command_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_cursor_keys" ADD CONSTRAINT "payment_cursor_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_command_id_payment_commands_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."payment_commands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_event_history_fk" FOREIGN KEY ("workspace_id","company_id","payment_id","revision") REFERENCES "public"."payment_history"("workspace_id","company_id","payment_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_event_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_command_id_payment_commands_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."payment_commands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_record_fk" FOREIGN KEY ("workspace_id","company_id","payment_id") REFERENCES "public"."payments"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payment_source_fk" FOREIGN KEY ("workspace_id","company_id","document_id","document_version_id","representation_id") REFERENCES "public"."document_pdfs"("workspace_id","company_id","document_id","version_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_command_actor_key" ON "payment_commands" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_command_record_revision" ON "payment_commands" USING btree ("workspace_id","company_id","payment_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_event_command_unique" ON "payment_events" USING btree ("command_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_history_command_unique" ON "payment_history" USING btree ("command_id");--> statement-breakpoint

CREATE UNIQUE INDEX "payment_direct_replacement_unique" ON "payments" USING btree ("replaces_closed_payment_id");--> statement-breakpoint
CREATE INDEX "payment_inventory_idx" ON "payments" USING btree ("workspace_id","company_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
-- Access owns current captured authority, independent of source read and Recorder.
CREATE FUNCTION access_require_payment_command(w uuid,c uuid,member_id uuid,user_id uuid,assignment uuid,operation text,captures jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE required_bundle text; name text; capture jsonb; supported boolean;
BEGIN
 required_bundle:=CASE operation WHEN 'CONFIRM' THEN 'company_payment_confirmer' WHEN 'REVERSE' THEN 'company_payment_reverser' ELSE 'company_payment_recorder' END;
 PERFORM 1 FROM company_role_assignments a JOIN workspace_memberships m ON (m.workspace_id,m.id)=(a.workspace_id,a.workspace_membership_id) JOIN internal_users u ON u.id=m.internal_user_id JOIN companies co ON (co.workspace_id,co.id)=(a.workspace_id,a.company_id)
 WHERE a.id=assignment AND a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=member_id AND a.bundle::text=required_bundle AND a.permission_set_version='v1' AND a.revoked_at IS NULL AND m.internal_user_id=user_id AND m.status='active' AND u.status='active' AND co.status='active' FOR SHARE OF a,m,u,co;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_authority',MESSAGE='Payment requires its exact live action capture.'; END IF;
 PERFORM 1 FROM workspace_permission_grants WHERE workspace_id=w AND workspace_membership_id=member_id AND permission='company.manage' FOR SHARE;
 IF NOT FOUND THEN
  PERFORM 1 FROM company_role_assignments WHERE workspace_id=w AND company_id=c AND workspace_membership_id=member_id AND revoked_at IS NULL AND ((bundle::text='company_context_access' AND permission_set_version IS NULL) OR (bundle::text='company_document_registrar' AND permission_set_version IN ('v1','v2','v3')) OR (bundle::text IN ('company_director_client_access','company_project_access') AND permission_set_version IN ('v1','v2'))) ORDER BY CASE bundle::text WHEN 'company_context_access' THEN 0 WHEN 'company_project_access' THEN 1 ELSE 2 END,id LIMIT 1 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_authority',MESSAGE='Independent current Company context is required.'; END IF;
 END IF;
 IF operation IN ('WITHDRAW_DRAFT','REVERSE') THEN
  IF captures IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_source_authority',MESSAGE='Source-free actions consume only Payment authority.'; END IF;
  RETURN;
 END IF;
 IF NOT payment_keys(captures,ARRAY['family','context','reference','registrar','content','identity','client']) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_source_authority',MESSAGE='Exact Source captures are required.'; END IF;
 FOREACH name IN ARRAY ARRAY['family','registrar','content','client','identity'] LOOP
  capture:=captures->name;
  IF name='identity' AND operation<>'CREATE' THEN CONTINUE; END IF;
  IF name='client' AND capture='null'::jsonb THEN
   PERFORM 1 FROM workspace_permission_grants WHERE workspace_id=w AND workspace_membership_id=member_id AND permission='client.manage' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_source_authority',MESSAGE='Original Client read is required.'; END IF;
   CONTINUE;
  END IF;
  supported:=CASE name WHEN 'family' THEN payment_keys(capture,ARRAY['bundle','assignmentId','permissionSetVersion']) AND capture->>'bundle'='company_payment_evidence_access' AND capture->>'permissionSetVersion'='v1'
   WHEN 'registrar' THEN payment_keys(capture,ARRAY['assignmentId','bundle','version']) AND capture->>'bundle'='company_document_registrar' AND capture->>'version' IN ('v1','v2','v3')
   WHEN 'content' THEN payment_keys(capture,ARRAY['assignmentId','bundle','version']) AND capture->>'bundle'='company_document_content_reader' AND capture->>'version'='v1'
   ELSE payment_keys(capture,ARRAY['assignmentId','bundle','version']) AND capture->>'bundle'='company_director_client_access' AND capture->>'version' IN ('v1','v2') END;
  IF NOT coalesce(supported AND payment_uuid(capture->'assignmentId'),false) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_source_authority',MESSAGE='Required Source capture is unsupported.'; END IF;
  PERFORM 1 FROM company_role_assignments WHERE id=(capture->>'assignmentId')::uuid AND workspace_id=w AND company_id=c AND workspace_membership_id=member_id AND bundle::text=capture->>'bundle' AND permission_set_version=coalesce(capture->>'version',capture->>'permissionSetVersion') AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_source_authority',MESSAGE='Required Source capture is no longer current.'; END IF;
 END LOOP;
END $$;
--> statement-breakpoint
-- Client owns the readable original reference before Source Document locks.
-- FOR UPDATE from the outset avoids a SHARE-to-UPDATE promotion cycle between
-- Payment commands. It does not advance the Client fence or impose new-use life.
CREATE FUNCTION client_require_payment_original_reference(w uuid,c uuid,original_client uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM client_accounts WHERE workspace_id=w AND id=original_client AND status IN ('active','superseded') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_source',MESSAGE='A readable original Client is required.'; END IF;
 PERFORM 1 FROM client_company_relationships WHERE workspace_id=w AND company_id=c AND client_account_id=original_client AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_source',MESSAGE='The original Company relationship is required.'; END IF;
END $$;
--> statement-breakpoint
-- Client-owned original new-use participant. It never follows a union or recopies live identity.
CREATE FUNCTION client_require_payment_new_use(w uuid,c uuid,original_client uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM client_accounts WHERE workspace_id=w AND id=original_client AND status='active' AND version<2147483647 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_source',MESSAGE='An eligible active original Client is required.'; END IF;
 PERFORM 1 FROM client_company_relationships WHERE workspace_id=w AND company_id=c AND client_account_id=original_client AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_source',MESSAGE='The original Company relationship is required.'; END IF;
END $$;
--> statement-breakpoint
-- Document owns exact frozen Version/current clean Representation/context qualification.
CREATE FUNCTION documents_payment_source(w uuid,c uuid,source jsonb,new_use boolean) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb; original_client uuid;
BEGIN
 IF NOT payment_source_valid(source) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_source',MESSAGE='Select one exact Payment Evidence source.'; END IF;
 SELECT client_id INTO original_client FROM working_documents WHERE workspace_id=w AND company_id=c AND id=(source->>'documentId')::uuid AND type='payment-evidence';
 IF new_use THEN PERFORM client_require_payment_new_use(w,c,original_client);
 ELSE PERFORM client_require_payment_original_reference(w,c,original_client); END IF;
 PERFORM 1 FROM working_documents WHERE workspace_id=w AND company_id=c AND id=(source->>'documentId')::uuid FOR SHARE;
 PERFORM 1 FROM document_versions WHERE workspace_id=w AND company_id=c AND document_id=(source->>'documentId')::uuid AND id=(source->>'documentVersionId')::uuid FOR SHARE;
 SELECT jsonb_build_object('source',source,'originalClientId',d.client_id,'payerAdditionalId',s.payer_legal_entity_id,'byteLength',p.size,'sha256',p.sha256,'copiedContext',jsonb_build_object('companyLabel',s.receiving_company_label,'payer',jsonb_build_object('kind',s.payer_kind,'legalName',s.payer_legal_name,'taxId',s.payer_tax_id,'legalAddress',s.payer_legal_address))) INTO result
 FROM working_documents d JOIN payment_evidence_document_sources s ON (s.workspace_id,s.company_id,s.document_id)=(d.workspace_id,d.company_id,d.id)
 JOIN document_versions v ON (v.workspace_id,v.company_id,v.document_id)=(d.workspace_id,d.company_id,d.id)
 JOIN document_pdfs p ON (p.workspace_id,p.company_id,p.document_id,p.version_id)=(v.workspace_id,v.company_id,v.document_id,v.id)
 JOIN client_accounts cl ON (cl.workspace_id,cl.id)=(d.workspace_id,d.client_id)
 JOIN client_company_relationships cr ON (cr.workspace_id,cr.company_id,cr.client_account_id)=(d.workspace_id,d.company_id,d.client_id)
 WHERE d.workspace_id=w AND d.company_id=c AND d.id=(source->>'documentId')::uuid AND d.type='payment-evidence' AND d.confidentiality='company-confidential'
 AND s.original_client_account_id=d.client_id AND v.id=(source->>'documentVersionId')::uuid AND v.status IN ('official','superseded')
 AND p.id=(source->>'representationId')::uuid AND p.scan_outcome='clean' AND p.media_type='application/pdf' AND p.size BETWEEN 1 AND 5242880 AND p.size=octet_length(p.content) AND p.sha256=encode(sha256(p.content),'hex')
 AND NOT EXISTS(SELECT 1 FROM document_pdfs later WHERE (later.workspace_id,later.company_id,later.document_id,later.version_id)=(p.workspace_id,p.company_id,p.document_id,p.version_id) AND later.upload_revision>p.upload_revision)
 AND cl.status IN ('active','superseded') AND cr.status='active';
 IF result IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_source',MESSAGE='The selected exact source is unavailable or ineligible.'; END IF;
 RETURN result;
END $$;
--> statement-breakpoint
CREATE FUNCTION payment_intent_valid(body jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(CASE body->>'action'
 WHEN 'CREATE' THEN payment_keys(body,ARRAY['action','source','values','acknowledgeObservedDeclaration','replacesClosedPaymentId']) AND payment_source_valid(body->'source') AND payment_values_valid(body->'values') AND body->'acknowledgeObservedDeclaration'='true'::jsonb AND (body->'replacesClosedPaymentId'='null'::jsonb OR payment_uuid(body->'replacesClosedPaymentId'))
 WHEN 'CORRECT_DRAFT' THEN payment_keys(body,ARRAY['action','expectedRevision','values','reason']) AND payment_number(body->'expectedRevision') AND payment_values_valid(body->'values') AND payment_text(body->'reason',2000)
 WHEN 'WITHDRAW_DRAFT' THEN payment_keys(body,ARRAY['action','expectedRevision','reason']) AND payment_number(body->'expectedRevision') AND payment_text(body->'reason',2000)
 WHEN 'REVERSE' THEN payment_keys(body,ARRAY['action','expectedRevision','reason']) AND payment_number(body->'expectedRevision') AND payment_text(body->'reason',2000)
 WHEN 'CONFIRM' THEN payment_keys(body,ARRAY['action','expectedRevision','acknowledgeReviewedObservation','confirmationNote']) AND payment_number(body->'expectedRevision') AND body->'acknowledgeReviewedObservation'='true'::jsonb AND payment_text(body->'confirmationNote',2000)
 ELSE false END,false);
$$;
--> statement-breakpoint
CREATE FUNCTION payment_next_fact(body jsonb,previous jsonb,public_actor jsonb,stamp jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT jsonb_build_object('state',CASE body->>'action' WHEN 'CREATE' THEN 'DRAFT' WHEN 'CORRECT_DRAFT' THEN 'DRAFT' WHEN 'WITHDRAW_DRAFT' THEN 'WITHDRAWN' WHEN 'CONFIRM' THEN 'CONFIRMED' ELSE 'REVERSED' END,
 'values',CASE WHEN body->>'action' IN ('CREATE','CORRECT_DRAFT') THEN body->'values' ELSE previous->'values' END,
 'confirmation',CASE WHEN body->>'action' IN ('CREATE','CORRECT_DRAFT','WITHDRAW_DRAFT') THEN 'null'::jsonb WHEN body->>'action'='CONFIRM' THEN jsonb_build_object('actor',public_actor,'recordedAt',stamp,'note',body->'confirmationNote') ELSE previous->'confirmation' END);
$$;
--> statement-breakpoint
CREATE FUNCTION payment_prepare_command() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE body jsonb:=NEW.intent->'body'; operation text:=body->>'action'; root payments%ROWTYPE; predecessor payments%ROWTYPE; source jsonb; stamp text;
BEGIN
 IF NEW.revision<>0 OR NEW.response<>'{}'::jsonb OR length(NEW.idempotency_key) NOT BETWEEN 1 AND 200 OR NEW.idempotency_key<>btrim(NEW.idempotency_key) OR NOT coalesce(payment_keys(NEW.intent,ARRAY['format','workspaceId','companyId','actorMembershipId','paymentId','body']) AND NEW.intent->>'format'='PAYMENT_INTENT/1' AND NEW.intent->>'workspaceId'=NEW.workspace_id::text AND NEW.intent->>'companyId'=NEW.company_id::text AND NEW.intent->>'actorMembershipId'=NEW.actor_membership_id::text AND NEW.intent->>'paymentId'=NEW.payment_id::text AND payment_intent_valid(body),false) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_intent',MESSAGE='Payment requires its complete closed intent.'; END IF;
 PERFORM access_require_payment_command(NEW.workspace_id,NEW.company_id,NEW.actor_membership_id,NEW.actor_internal_user_id,NEW.assignment_id,operation,NEW.source_captures);
 IF NEW.actor_display_name IS DISTINCT FROM (SELECT display_name FROM internal_users WHERE id=NEW.actor_internal_user_id) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_authority',MESSAGE='The public actor must match the captured native human.'; END IF;
 IF operation='CREATE' THEN source:=documents_payment_source(NEW.workspace_id,NEW.company_id,body->'source',true);
 ELSE
  SELECT source_snapshot INTO source FROM payments WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.payment_id;
  IF operation IN ('CORRECT_DRAFT','CONFIRM') THEN source:=documents_payment_source(NEW.workspace_id,NEW.company_id,source->'source',true); END IF;
 END IF;
 IF operation='CREATE' THEN
  IF body->>'replacesClosedPaymentId' IS NOT NULL THEN
   SELECT * INTO predecessor FROM payments WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=(body->>'replacesClosedPaymentId')::uuid FOR UPDATE;
   IF NOT FOUND OR predecessor.state NOT IN ('WITHDRAWN','REVERSED') OR EXISTS(SELECT 1 FROM payments WHERE replaces_closed_payment_id=predecessor.id) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_predecessor',MESSAGE='A terminal observation may have one direct replacement.'; END IF;
  END IF;
  NEW.revision:=1;
 ELSE
  SELECT * INTO root FROM payments WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.payment_id FOR UPDATE;
  IF NOT FOUND OR root.revision<>(body->>'expectedRevision')::integer OR root.revision=2147483647 OR (operation='REVERSE' AND root.state<>'CONFIRMED') OR (operation<>'REVERSE' AND root.state<>'DRAFT') THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_transition',MESSAGE='Reload the stale, terminal or exhausted observation.'; END IF;
  IF operation='CORRECT_DRAFT' AND root.values=body->'values' THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_no_change',MESSAGE='A material correction is required.'; END IF;
  -- Stable Internal User is disqualified by every material draft authorship, including superseded revisions.
  IF operation='CONFIRM' AND EXISTS(SELECT 1 FROM payment_commands c WHERE c.workspace_id=NEW.workspace_id AND c.company_id=NEW.company_id AND c.payment_id=NEW.payment_id AND c.intent->'body'->>'action' IN ('CREATE','CORRECT_DRAFT') AND c.actor_internal_user_id=NEW.actor_internal_user_id) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_self_confirmation',MESSAGE='A draft author cannot confirm this observation.'; END IF;
  NEW.revision:=root.revision+1;
 END IF;
 NEW.created_at:=date_trunc('milliseconds',clock_timestamp());
 stamp:=to_char(NEW.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 NEW.response:=jsonb_build_object('format','PAYMENT_COMMAND/1','commandId',NEW.id,'paymentId',NEW.payment_id,'revision',NEW.revision,'action',operation,'recordedAt',stamp);
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payment_command_prepare BEFORE INSERT ON payment_commands FOR EACH ROW EXECUTE FUNCTION payment_prepare_command();
--> statement-breakpoint
CREATE FUNCTION payment_construct_effects() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE body jsonb:=NEW.intent->'body'; operation text:=body->>'action'; root payments%ROWTYPE; source jsonb; previous jsonb:='null'::jsonb; result jsonb; fact jsonb;
BEGIN
 IF operation='CREATE' THEN
  source:=documents_payment_source(NEW.workspace_id,NEW.company_id,body->'source',true);
  result:=payment_next_fact(body,previous,jsonb_build_object('membershipId',NEW.actor_membership_id,'displayName',NEW.actor_display_name),NEW.response->'recordedAt');
  INSERT INTO payments(workspace_id,company_id,id,document_id,document_version_id,representation_id,source_snapshot,replaces_closed_payment_id,revision,state,"values",confirmation,created_at) VALUES(NEW.workspace_id,NEW.company_id,NEW.payment_id,(body->'source'->>'documentId')::uuid,(body->'source'->>'documentVersionId')::uuid,(body->'source'->>'representationId')::uuid,source,(body->>'replacesClosedPaymentId')::uuid,1,result->>'state',result->'values',result->'confirmation',NEW.created_at);
 ELSE
  SELECT * INTO root FROM payments WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.payment_id;
  source:=root.source_snapshot;
  previous:=jsonb_build_object('state',root.state,'values',root.values,'confirmation',root.confirmation);
  result:=payment_next_fact(body,previous,jsonb_build_object('membershipId',NEW.actor_membership_id,'displayName',NEW.actor_display_name),NEW.response->'recordedAt');
  UPDATE payments SET revision=NEW.revision,state=result->>'state',"values"=result->'values',confirmation=result->'confirmation' WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.payment_id AND revision=NEW.revision-1;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_transition',MESSAGE='The exact predecessor revision is required.'; END IF;
 END IF;
 IF operation IN ('CREATE','CORRECT_DRAFT','CONFIRM') THEN
  UPDATE client_accounts SET version=version+1,updated_at=now() WHERE workspace_id=NEW.workspace_id AND id=(source->>'originalClientId')::uuid AND status='active' AND version<2147483647;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_source',MESSAGE='Required Client fence could not advance.'; END IF;
 END IF;
 fact:=jsonb_build_object('format','PAYMENT_REVISION/1','paymentId',NEW.payment_id,'revision',NEW.revision,'action',operation,'commandId',NEW.id,'actor',jsonb_build_object('membershipId',NEW.actor_membership_id,'displayName',NEW.actor_display_name),'recordedAt',NEW.response->'recordedAt','before',previous,'after',result,'reason',CASE WHEN operation IN ('CREATE','CONFIRM') THEN 'null'::jsonb ELSE body->'reason' END);
 INSERT INTO payment_history(workspace_id,company_id,payment_id,revision,command_id,fact) VALUES(NEW.workspace_id,NEW.company_id,NEW.payment_id,NEW.revision,NEW.id,fact);
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER payment_command_effects AFTER INSERT ON payment_commands FOR EACH ROW EXECUTE FUNCTION payment_construct_effects();
--> statement-breakpoint
CREATE FUNCTION payment_effect_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR pg_trigger_depth()<2 OR (TG_OP='UPDATE' AND TG_TABLE_NAME<>'payments') THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_effect_path',MESSAGE='Payment effects require their native command.'; END IF;
 IF TG_TABLE_NAME='payments' AND TG_OP='UPDATE' THEN
  IF (NEW.workspace_id,NEW.company_id,NEW.id,NEW.created_sequence,NEW.document_id,NEW.document_version_id,NEW.representation_id,NEW.source_snapshot,NEW.replaces_closed_payment_id,NEW.created_at) IS DISTINCT FROM (OLD.workspace_id,OLD.company_id,OLD.id,OLD.created_sequence,OLD.document_id,OLD.document_version_id,OLD.representation_id,OLD.source_snapshot,OLD.replaces_closed_payment_id,OLD.created_at) OR NEW.revision<>OLD.revision+1 OR OLD.state NOT IN ('DRAFT','CONFIRMED') THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_root_immutable',MESSAGE='Source context and terminal observations are immutable.'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payment_root_path BEFORE INSERT OR UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION payment_effect_guard();
--> statement-breakpoint
CREATE TRIGGER payment_history_path BEFORE INSERT OR UPDATE OR DELETE ON payment_history FOR EACH ROW EXECUTE FUNCTION payment_effect_guard();
--> statement-breakpoint
CREATE FUNCTION payment_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_immutable',MESSAGE='Committed Payment commands/history/events are immutable.'; END $$;
--> statement-breakpoint
CREATE TRIGGER payment_command_immutable BEFORE UPDATE OR DELETE ON payment_commands FOR EACH ROW EXECUTE FUNCTION payment_immutable_guard();
--> statement-breakpoint
CREATE TRIGGER payment_event_immutable BEFORE UPDATE OR DELETE ON payment_events FOR EACH ROW EXECUTE FUNCTION payment_immutable_guard();
--> statement-breakpoint
CREATE TRIGGER payment_cursor_immutable BEFORE UPDATE OR DELETE ON payment_cursor_keys FOR EACH ROW EXECUTE FUNCTION payment_immutable_guard();
--> statement-breakpoint
-- Continuation keys are infrastructure provisioned at Company creation, never on a Payment read.
INSERT INTO payment_cursor_keys(workspace_id,company_id) SELECT workspace_id,id FROM companies;
--> statement-breakpoint
CREATE FUNCTION payment_company_cursor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO payment_cursor_keys(workspace_id,company_id) VALUES(NEW.workspace_id,NEW.id); RETURN NEW; END $$;
--> statement-breakpoint
CREATE TRIGGER payment_company_cursor AFTER INSERT ON companies FOR EACH ROW EXECUTE FUNCTION payment_company_cursor();

--> statement-breakpoint
-- Historical reconstruction uses immutable source facts without live access/new-use predicates.
CREATE FUNCTION documents_payment_conserved_source(w uuid,c uuid,source jsonb) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('source',source,'originalClientId',d.client_id,'payerAdditionalId',s.payer_legal_entity_id,'byteLength',p.size,'sha256',p.sha256,'copiedContext',jsonb_build_object('companyLabel',s.receiving_company_label,'payer',jsonb_build_object('kind',s.payer_kind,'legalName',s.payer_legal_name,'taxId',s.payer_tax_id,'legalAddress',s.payer_legal_address)))
 FROM working_documents d JOIN payment_evidence_document_sources s ON (s.workspace_id,s.company_id,s.document_id)=(d.workspace_id,d.company_id,d.id)
 JOIN document_versions v ON (v.workspace_id,v.company_id,v.document_id)=(d.workspace_id,d.company_id,d.id)
 JOIN document_pdfs p ON (p.workspace_id,p.company_id,p.document_id,p.version_id)=(v.workspace_id,v.company_id,v.document_id,v.id)
 WHERE d.workspace_id=w AND d.company_id=c AND d.id=(source->>'documentId')::uuid AND d.type='payment-evidence' AND s.original_client_account_id=d.client_id AND v.id=(source->>'documentVersionId')::uuid AND v.status IN ('official','superseded') AND p.id=(source->>'representationId')::uuid AND p.scan_outcome='clean' AND p.size=octet_length(p.content) AND p.sha256=encode(sha256(p.content),'hex')
 AND NOT EXISTS(SELECT 1 FROM document_pdfs later WHERE (later.workspace_id,later.company_id,later.document_id,later.version_id)=(p.workspace_id,p.company_id,p.document_id,p.version_id) AND later.upload_revision>p.upload_revision);
$$;
--> statement-breakpoint
-- Reconstruct every before→intent→after→receipt→event, stable authorship and lineage at commit.
CREATE FUNCTION payment_coupling_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root payments%ROWTYPE; h payment_history%ROWTYPE; command payment_commands%ROWTYPE; previous jsonb:='null'::jsonb; expected bigint:=1; operation text; expected_after jsonb; expected_event text; authors uuid[]:=ARRAY[]::uuid[]; public_actor jsonb; predecessor payments%ROWTYPE; root_id uuid;
BEGIN
 IF TG_TABLE_NAME='payments' THEN root_id:=NEW.id; ELSE root_id:=NEW.payment_id; END IF;
 SELECT * INTO root FROM payments WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=root_id;
 IF NOT FOUND OR root.source_snapshot IS DISTINCT FROM documents_payment_conserved_source(root.workspace_id,root.company_id,root.source_snapshot->'source') OR root.source_snapshot->'source' IS DISTINCT FROM jsonb_build_object('documentId',root.document_id,'documentVersionId',root.document_version_id,'representationId',root.representation_id) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_coupling',MESSAGE='Payment requires its exact conserved Source context.'; END IF;
 FOR h IN SELECT * FROM payment_history WHERE workspace_id=root.workspace_id AND company_id=root.company_id AND payment_id=root.id ORDER BY revision LOOP
  SELECT * INTO command FROM payment_commands WHERE id=h.command_id;
  operation:=command.intent->'body'->>'action';
  public_actor:=jsonb_build_object('membershipId',command.actor_membership_id,'displayName',command.actor_display_name);
  expected_after:=payment_next_fact(command.intent->'body',previous,public_actor,h.fact->'recordedAt');
  expected_event:=CASE operation WHEN 'CREATE' THEN 'payment.observation.recorded' WHEN 'CORRECT_DRAFT' THEN 'payment.draft.corrected' WHEN 'WITHDRAW_DRAFT' THEN 'payment.draft.withdrawn' WHEN 'CONFIRM' THEN 'payment.confirmed' WHEN 'REVERSE' THEN 'payment.reversed' END;
  IF command.id IS NULL OR h.revision<>expected OR h.fact->'before' IS DISTINCT FROM previous OR h.fact->'after' IS DISTINCT FROM expected_after OR h.fact->>'action' IS DISTINCT FROM operation OR NOT payment_intent_valid(command.intent->'body') OR (command.workspace_id,command.company_id,command.payment_id,command.revision) IS DISTINCT FROM (h.workspace_id,h.company_id,h.payment_id,h.revision) OR command.intent->>'workspaceId' IS DISTINCT FROM root.workspace_id::text OR command.intent->>'companyId' IS DISTINCT FROM root.company_id::text OR command.intent->>'paymentId' IS DISTINCT FROM root.id::text OR command.intent->>'actorMembershipId' IS DISTINCT FROM command.actor_membership_id::text OR command.response IS DISTINCT FROM jsonb_build_object('format','PAYMENT_COMMAND/1','commandId',command.id,'paymentId',root.id,'revision',h.revision,'action',operation,'recordedAt',h.fact->'recordedAt') OR h.fact->'actor' IS DISTINCT FROM public_actor OR (h.fact->>'recordedAt')::timestamptz<>command.created_at OR h.fact->'reason' IS DISTINCT FROM (CASE WHEN operation IN ('CREATE','CONFIRM') THEN 'null'::jsonb ELSE command.intent->'body'->'reason' END) OR (expected=1) IS DISTINCT FROM (operation='CREATE') OR (expected>1 AND ((command.intent->'body'->>'expectedRevision')::integer<>expected-1 OR (operation='REVERSE' AND previous->>'state'<>'CONFIRMED') OR (operation<>'REVERSE' AND previous->>'state'<>'DRAFT'))) OR NOT EXISTS(SELECT 1 FROM payment_events e WHERE e.workspace_id=h.workspace_id AND e.company_id=h.company_id AND e.payment_id=h.payment_id AND e.revision=h.revision AND e.command_id=command.id AND e.actor_membership_id=command.actor_membership_id AND e.actor_internal_user_id=command.actor_internal_user_id AND e.occurred_at=command.created_at AND e.action=expected_event AND e.metadata=jsonb_build_object('revision',h.revision)) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_coupling',MESSAGE='Payment history requires its exact native intent, receipt and restricted event.'; END IF;
  IF operation='CONFIRM' AND command.actor_internal_user_id=ANY(authors) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_self_confirmation',MESSAGE='Every material draft author is disqualified.'; END IF;
  IF operation IN ('CREATE','CORRECT_DRAFT') THEN authors:=array_append(authors,command.actor_internal_user_id); END IF;
  IF expected=1 THEN
   IF root.source_snapshot->'source' IS DISTINCT FROM command.intent->'body'->'source' OR root.replaces_closed_payment_id IS DISTINCT FROM (command.intent->'body'->>'replacesClosedPaymentId')::uuid OR root.created_at<>command.created_at THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_coupling',MESSAGE='Root context must conserve its initial declaration.'; END IF;
   IF root.replaces_closed_payment_id IS NOT NULL THEN
    SELECT * INTO predecessor FROM payments WHERE workspace_id=root.workspace_id AND company_id=root.company_id AND id=root.replaces_closed_payment_id;
    IF NOT FOUND OR predecessor.state NOT IN ('WITHDRAWN','REVERSED') OR predecessor.created_sequence>=root.created_sequence THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_predecessor',MESSAGE='Lineage requires an earlier terminal same-Company predecessor.'; END IF;
   END IF;
  END IF;
  previous:=h.fact->'after';expected:=expected+1;
 END LOOP;
 IF root.revision<>expected-1 OR jsonb_build_object('state',root.state,'values',root.values,'confirmation',root.confirmation) IS DISTINCT FROM previous OR EXISTS(SELECT 1 FROM payment_commands c LEFT JOIN payment_history missing_history ON missing_history.command_id=c.id WHERE c.workspace_id=root.workspace_id AND c.company_id=root.company_id AND c.payment_id=root.id AND missing_history.command_id IS NULL) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='payment_native_coupling',MESSAGE='Payment head requires its complete conserved history.'; END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER payment_command_coupling AFTER INSERT ON payment_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payment_coupling_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER payment_history_coupling AFTER INSERT ON payment_history DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payment_coupling_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER payment_event_coupling AFTER INSERT ON payment_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payment_coupling_guard();

--> statement-breakpoint
CREATE CONSTRAINT TRIGGER payment_root_coupling AFTER INSERT OR UPDATE ON payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payment_coupling_guard();
