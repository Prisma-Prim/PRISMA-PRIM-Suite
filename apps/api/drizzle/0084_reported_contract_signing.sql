ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_contract_signature_declarer_assignment.granted' BEFORE 'company_received_contract_access_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_contract_signature_declarer_assignment.revoked' BEFORE 'company_received_contract_access_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_contract_signature_declarer' BEFORE 'company_received_contract_access';--> statement-breakpoint
CREATE TABLE "contract_signing_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"contract_version_id" uuid NOT NULL,
	"approval_decision_id" uuid NOT NULL,
	"quality_run_id" uuid NOT NULL,
	"representation_checksum" text NOT NULL,
	"document_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"representation_id" uuid NOT NULL,
	"result_revision" integer NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"statement" jsonb NOT NULL,
	"pdf" jsonb NOT NULL,
	CONSTRAINT "contract_signing_declarations_values_check" CHECK ("contract_signing_declarations"."result_revision">2 AND "contract_signing_declarations"."representation_checksum" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("contract_signing_declarations"."statement")='object' AND jsonb_typeof("contract_signing_declarations"."pdf")='object')
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "contract_commands" DROP CONSTRAINT "contract_commands_kind_check";--> statement-breakpoint
ALTER TABLE "contract_events" DROP CONSTRAINT "contract_events_target_check";--> statement-breakpoint
ALTER TABLE "contract_events" DROP CONSTRAINT "contract_events_metadata_check";--> statement-breakpoint
ALTER TABLE "contract_versions" DROP CONSTRAINT "contract_versions_model_source_check";--> statement-breakpoint
ALTER TABLE "contract_signing_declarations" ADD CONSTRAINT "contract_signing_declarations_version_fk" FOREIGN KEY ("workspace_id","company_id","contract_id","contract_version_id") REFERENCES "public"."contract_versions"("workspace_id","company_id","contract_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signing_declarations" ADD CONSTRAINT "contract_signing_declarations_approval_fk" FOREIGN KEY ("workspace_id","company_id","contract_id","approval_decision_id") REFERENCES "public"."contract_decisions"("workspace_id","company_id","contract_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signing_declarations" ADD CONSTRAINT "contract_signing_declarations_quality_fk" FOREIGN KEY ("workspace_id","company_id","contract_id","quality_run_id") REFERENCES "public"."contract_quality_runs"("workspace_id","company_id","contract_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signing_declarations" ADD CONSTRAINT "contract_signing_declarations_pdf_fk" FOREIGN KEY ("workspace_id","company_id","document_id","document_version_id","representation_id") REFERENCES "public"."document_pdfs"("workspace_id","company_id","document_id","version_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signing_declarations" ADD CONSTRAINT "contract_signing_declarations_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_signing_declarations_version_unique" ON "contract_signing_declarations" USING btree ("workspace_id","company_id","contract_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_signing_declarations_scope_unique" ON "contract_signing_declarations" USING btree ("workspace_id","company_id","contract_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_events_signing_declared_unique" ON "contract_events" USING btree ("workspace_id","company_id","contract_version_id") WHERE "contract_events"."action" = 'contract_version.signing_declared';--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_document_registrar' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_commercial_intake' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3', 'v4'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_project_access' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_opportunity_manager' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_offer_preparer' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_contract_preparer' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_contract_approver' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_offer_approver' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_project_template_user' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_contract_early_preparation', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "contract_commands" ADD CONSTRAINT "contract_commands_kind_check" CHECK ((((((((("contract_commands"."kind" = 'CREATE' AND "contract_commands"."result_quality_run_id" IS NULL) OR ("contract_commands"."kind" = 'RUN_QUALITY_CHECKS' AND "contract_commands"."result_quality_run_id" IS NOT NULL)) AND "contract_commands"."result_decision_id" IS NULL OR ("contract_commands"."kind" IN ('APPROVE','REJECT') AND "contract_commands"."result_quality_run_id" IS NULL AND "contract_commands"."result_decision_id" IS NOT NULL)) AND "contract_commands"."result_signature_id" IS NULL) OR ("contract_commands"."kind" = 'RECORD_SIGNATURE' AND "contract_commands"."result_quality_run_id" IS NULL AND "contract_commands"."result_decision_id" IS NULL AND "contract_commands"."result_signature_id" IS NOT NULL)) AND "contract_commands"."result_project_link_id" IS NULL) OR ("contract_commands"."kind" IN ('LINK_PROJECT','CREATE_PROJECT') AND "contract_commands"."result_quality_run_id" IS NULL AND "contract_commands"."result_decision_id" IS NULL AND "contract_commands"."result_signature_id" IS NULL AND "contract_commands"."result_project_link_id" IS NOT NULL)) AND "contract_commands"."result_version_id" IS NULL) OR ("contract_commands"."kind" IN ('CREATE_VERSION','DECLARE_SIGNING') AND "contract_commands"."result_version_id" IS NOT NULL AND "contract_commands"."result_quality_run_id" IS NULL AND "contract_commands"."result_decision_id" IS NULL AND "contract_commands"."result_signature_id" IS NULL AND "contract_commands"."result_project_link_id" IS NULL));--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_target_check" CHECK (("contract_events"."action" IN ('contract.created','contract_project.linked') AND "contract_events"."contract_version_id" IS NULL) OR ("contract_events"."action" IN ('contract_version.created','contract_version.approved','contract_version.rejected','contract_version.signature_recorded','contract_version.signing_declared') AND "contract_events"."contract_version_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_metadata_check" CHECK ((jsonb_typeof("contract_events"."metadata") = 'object' AND "contract_events"."metadata"->>'contractId' = "contract_events"."contract_id"::text AND (("contract_events"."action" = 'contract_project.linked' AND ("contract_events"."metadata" - ARRAY['contractId','projectId','created']::text[]) = '{}'::jsonb AND "contract_events"."metadata"->'created' IN ('false'::jsonb,'true'::jsonb) AND jsonb_typeof("contract_events"."metadata"->'projectId') = 'string') OR ("contract_events"."action" <> 'contract_project.linked' AND ("contract_events"."metadata" - ARRAY['contractId','contractVersionId','versionNumber','predecessorVersionNumber','illustrativeReference','kind','origin','offerVersionId','pricingSnapshotId','provenance','ruleSetVersion','acknowledgedWarningCodes','evidenceKind','parentContractId','addendumOrdinal']::text[]) = '{}'::jsonb AND (("contract_events"."metadata"->>'kind' = 'CONTRACT' AND "contract_events"."metadata"->>'origin' IN ('ACCEPTED_OFFER','DIRECT','OFFER_PREPARATION') AND (("contract_events"."metadata"->>'origin' = 'DIRECT' AND NOT ("contract_events"."metadata" ? 'offerVersionId')) OR ("contract_events"."metadata"->>'origin' IN ('ACCEPTED_OFFER','OFFER_PREPARATION') AND jsonb_typeof("contract_events"."metadata"->'offerVersionId') = 'string')) AND NOT ("contract_events"."metadata" ?| ARRAY['parentContractId','addendumOrdinal'])) OR ("contract_events"."metadata"->>'kind' = 'PRECONTRACT' AND "contract_events"."metadata"->>'origin' = 'ACCEPTED_OFFER' AND jsonb_typeof("contract_events"."metadata"->'offerVersionId') = 'string' AND NOT ("contract_events"."metadata" ?| ARRAY['parentContractId','addendumOrdinal'])) OR ("contract_events"."metadata"->>'kind' = 'ADDENDUM' AND NOT ("contract_events"."metadata" ?| ARRAY['origin','offerVersionId']) AND jsonb_typeof("contract_events"."metadata"->'parentContractId') = 'string' AND jsonb_typeof("contract_events"."metadata"->'addendumOrdinal') = 'number')) AND "contract_events"."metadata"->>'provenance' = 'ILLUSTRATIVE' AND (CASE WHEN "contract_events"."action" IN ('contract_version.approved','contract_version.signature_recorded') THEN jsonb_typeof("contract_events"."metadata"->'ruleSetVersion') = 'number' AND "contract_events"."metadata"->>'ruleSetVersion' IN ('1','2','3') ELSE NOT ("contract_events"."metadata" ? 'ruleSetVersion') END) AND ("contract_events"."action" <> 'contract_version.signature_recorded' OR "contract_events"."metadata"->>'evidenceKind' = 'SIMULATED')))) IS TRUE OR (jsonb_typeof("contract_events"."metadata")='object' AND "contract_events"."metadata"->>'contractId'="contract_events"."contract_id"::text
        AND "contract_events"."metadata"->>'kind'='CONTRACT' AND "contract_events"."metadata"->>'origin'='COMPANY_MODEL_OFFER'
        AND "contract_events"."metadata"->>'provenance'='COMPANY_MODEL_OFFER'
        AND "contract_events"."action" IN ('contract.created','contract_version.created','contract_version.approved','contract_version.rejected')
        AND ("contract_events"."metadata"-ARRAY['contractId','contractVersionId','versionNumber','predecessorVersionNumber','illustrativeReference','kind','origin','offerVersionId','provenance','ruleSetVersion','acknowledgedWarningCodes','modelVersionId','modelVersionNumber','modelApprovalDecisionId','rendererVersion','contractRevision']::text[])='{}'::jsonb
        AND jsonb_typeof("contract_events"."metadata"->'offerVersionId')='string' AND jsonb_typeof("contract_events"."metadata"->'modelVersionId')='string'
        AND jsonb_typeof("contract_events"."metadata"->'modelApprovalDecisionId')='string' AND ("contract_events"."metadata"->>'modelVersionNumber')::integer>0
        AND "contract_events"."metadata"->'rendererVersion'='1'::jsonb AND ("contract_events"."metadata"->>'contractRevision')::integer>0
        AND (CASE WHEN "contract_events"."action"='contract_version.approved' THEN "contract_events"."metadata"->'ruleSetVersion'='1'::jsonb AND jsonb_typeof("contract_events"."metadata"->'acknowledgedWarningCodes')='array' ELSE NOT ("contract_events"."metadata"?|ARRAY['ruleSetVersion','acknowledgedWarningCodes']) END)) IS TRUE OR ("contract_events"."action"='contract_version.signing_declared' AND jsonb_typeof("contract_events"."metadata")='object' AND "contract_events"."metadata"=jsonb_build_object('contractId',"contract_events"."contract_id"::text,'contractVersionId',"contract_events"."contract_version_id"::text,'versionNumber',("contract_events"."metadata"->>'versionNumber')::integer,'provenance','COMPANY_MODEL_OFFER','evidenceKind','DECLARED_RECEIVED_PDF') AND ("contract_events"."metadata"->>'versionNumber')::integer>0) IS TRUE);--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_model_source_check" CHECK ((CASE WHEN "contract_versions"."provenance"='COMPANY_MODEL_OFFER' THEN
      "contract_versions"."template_code"='COMPANY_CONSULTING_CONTRACT_RO'
      AND "contract_versions"."model_source_id" IS NOT NULL AND "contract_versions"."model_source_version_id" IS NOT NULL AND "contract_versions"."model_source_version_number">0
      AND "contract_versions"."model_source_decision_id" IS NOT NULL AND "contract_versions"."model_source_decision_outcome"='APPROVE'
      AND jsonb_typeof("contract_versions"."model_generation_snapshot")='object'
      AND "contract_versions"."model_generation_snapshot" ?& ARRAY['modelSource','offerSource','caseDetails','financials','representation']
      AND ("contract_versions"."model_generation_snapshot"-ARRAY['modelSource','offerSource','caseDetails','financials','representation']::text[])='{}'::jsonb
      ELSE "contract_versions"."model_source_id" IS NULL AND "contract_versions"."model_source_version_id" IS NULL AND "contract_versions"."model_source_version_number" IS NULL
      AND "contract_versions"."model_source_decision_id" IS NULL AND "contract_versions"."model_source_decision_outcome" IS NULL AND "contract_versions"."model_generation_snapshot" IS NULL
      AND "contract_versions"."template_code"<>'COMPANY_CONSULTING_CONTRACT_RO' END) IS TRUE);--> statement-breakpoint
CREATE FUNCTION reported_signing_literal(value jsonb, maximum integer) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT (jsonb_typeof(value)='string' AND btrim(value #>> '{}', U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')<>'' AND
 (SELECT char_length(value #>> '{}') + count(*) FILTER (WHERE ascii(c)>65535) FROM regexp_split_to_table(value #>> '{}','') c) BETWEEN 1 AND maximum) IS TRUE
$$;
--> statement-breakpoint
CREATE FUNCTION reported_signing_signatory(value jsonb, recorded_at timestamptz) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE signed_on text; mandate jsonb:=value->'mandate';
BEGIN
 IF (jsonb_typeof(value)='object' AND value ?& ARRAY['label','signedOn','mandate'] AND (value-ARRAY['label','signedOn','mandate'])='{}'::jsonb AND reported_signing_literal(value->'label',200)
 AND ((mandate=jsonb_build_object('kind','UNKNOWN')) OR (jsonb_typeof(mandate)='object' AND mandate->>'kind'='DECLARED_UNVERIFIED' AND (mandate-ARRAY['kind','basis'])='{}'::jsonb AND reported_signing_literal(mandate->'basis',2000)))) IS NOT TRUE THEN RETURN false; END IF;
 IF value->'signedOn'='null'::jsonb THEN RETURN true; END IF;
 signed_on:=value->>'signedOn';
 RETURN (jsonb_typeof(value->'signedOn')='string' AND signed_on ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND left(signed_on,4)<>'0000' AND to_char(signed_on::date,'YYYY-MM-DD')=signed_on AND signed_on::date <= (recorded_at AT TIME ZONE 'UTC')::date) IS TRUE;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE FUNCTION validate_reported_contract_signing(target_version_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c contracts%ROWTYPE; v contract_versions%ROWTYPE; d contract_decisions%ROWTYPE; s contract_signing_declarations%ROWTYPE; q contract_quality_runs%ROWTYPE; p document_pdfs%ROWTYPE; dv document_versions%ROWTYPE; wd working_documents%ROWTYPE; warnings jsonb; expected_pdf jsonb; statement jsonb;
BEGIN
 SELECT * INTO v FROM contract_versions WHERE id=target_version_id;
 SELECT * INTO c FROM contracts WHERE id=v.contract_id AND workspace_id=v.workspace_id AND company_id=v.company_id;
 IF c.origin IS DISTINCT FROM 'COMPANY_MODEL_OFFER' THEN RETURN; END IF;
 SELECT * INTO s FROM contract_signing_declarations WHERE workspace_id=v.workspace_id AND company_id=v.company_id AND contract_id=v.contract_id AND contract_version_id=v.id;
 IF v.execution_state='NOT_EXECUTED' THEN
  IF s.id IS NOT NULL THEN RAISE EXCEPTION 'Unexpected signing declaration' USING ERRCODE='23514'; END IF;
  RETURN;
 END IF;
 SELECT * INTO d FROM contract_decisions WHERE workspace_id=v.workspace_id AND company_id=v.company_id AND contract_id=v.contract_id AND contract_version_id=v.id AND kind='APPROVE';
 IF s.id IS NULL OR d.id IS NULL OR c.kind<>'CONTRACT' OR v.provenance<>'COMPANY_MODEL_OFFER' OR v.decision_state<>'APPROVED' OR v.superseded_by_version_id IS NOT NULL OR s.approval_decision_id<>d.id OR s.quality_run_id=d.quality_run_id OR s.result_revision<>v.created_contract_revision+2 OR c.revision<>s.result_revision+(SELECT count(*) FROM contract_project_links WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id) OR s.representation_checksum<>d.representation_checksum OR s.representation_checksum IS DISTINCT FROM v.model_generation_snapshot->'representation'->>'sha256' OR s.recorded_at<d.decided_at THEN RAISE EXCEPTION 'Invalid reported signing approval/state' USING ERRCODE='23514'; END IF;
 SELECT * INTO q FROM contract_quality_runs WHERE workspace_id=s.workspace_id AND company_id=s.company_id AND contract_id=s.contract_id AND contract_version_id=s.contract_version_id AND id=s.quality_run_id AND actor_workspace_membership_id=s.actor_workspace_membership_id AND actor_internal_user_id=s.actor_internal_user_id AND evaluated_at=s.recorded_at;
 SELECT coalesce(jsonb_agg(item->>'code' ORDER BY item->>'code'),'[]'::jsonb) INTO warnings FROM jsonb_array_elements(q.results) item WHERE item->>'status'='WARNING';
 statement:=s.statement;
 IF q.id IS NULL OR q.rule_set<>'CONTRACT_QUALITY_COMPANY_MODEL' OR q.rule_set_version<>1 OR EXISTS(SELECT 1 FROM jsonb_array_elements(q.results) item WHERE item->>'status'='ERROR') OR
 (jsonb_typeof(statement)='object' AND statement ?& ARRAY['expectedContractRevision','documentId','documentVersionId','representationId','providerSignatory','clientSignatory','concordanceBasis','acceptanceBasis','acknowledgedWarningCodes'] AND (statement-ARRAY['expectedContractRevision','documentId','documentVersionId','representationId','providerSignatory','clientSignatory','concordanceBasis','acceptanceBasis','acknowledgedWarningCodes'])='{}'::jsonb AND statement->'expectedContractRevision'=to_jsonb(s.result_revision-1) AND statement->>'documentId'=s.document_id::text AND statement->>'documentVersionId'=s.document_version_id::text AND statement->>'representationId'=s.representation_id::text AND reported_signing_signatory(statement->'providerSignatory',s.recorded_at) AND reported_signing_signatory(statement->'clientSignatory',s.recorded_at) AND reported_signing_literal(statement->'concordanceBasis',2000) AND reported_signing_literal(statement->'acceptanceBasis',2000) AND jsonb_typeof(statement->'acknowledgedWarningCodes')='array') IS NOT TRUE THEN RAISE EXCEPTION 'Invalid reported signing statement/checks' USING ERRCODE='23514'; END IF;
 IF (SELECT coalesce(jsonb_agg(code ORDER BY code),'[]'::jsonb) FROM jsonb_array_elements_text(statement->'acknowledgedWarningCodes') code) IS DISTINCT FROM warnings THEN RAISE EXCEPTION 'Invalid complete signing warnings' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM document_pdfs WHERE workspace_id=s.workspace_id AND company_id=s.company_id AND document_id=s.document_id AND version_id=s.document_version_id AND id=s.representation_id;
 SELECT * INTO dv FROM document_versions WHERE workspace_id=s.workspace_id AND company_id=s.company_id AND document_id=s.document_id AND id=s.document_version_id;
 SELECT * INTO wd FROM working_documents WHERE workspace_id=s.workspace_id AND company_id=s.company_id AND id=s.document_id AND client_id=c.original_client_account_id AND type='received-contract';
 IF p.id IS NULL OR dv.id IS NULL OR wd.id IS NULL OR p.scan_outcome<>'clean' OR dv.status NOT IN ('official','superseded') OR dv.frozen_title IS NULL OR NOT EXISTS(SELECT 1 FROM received_contract_document_relations r WHERE r.workspace_id=s.workspace_id AND r.company_id=s.company_id AND r.document_id=s.document_id AND r.contract_id=s.contract_id AND r.contract_version_id=s.contract_version_id AND r.opportunity_id=c.opportunity_id AND r.contract_version_number=v.version_number) THEN RAISE EXCEPTION 'Invalid received signing PDF binding' USING ERRCODE='23514'; END IF;
 expected_pdf:=jsonb_build_object('documentId',p.document_id::text,'documentVersionId',p.version_id::text,'documentVersionNumber',dv.number,'title',dv.frozen_title,'status',s.pdf->>'status','representationId',p.id::text,'fileName',p.file_name,'mediaType',p.media_type,'size',p.size,'sha256',p.sha256,'scanOutcome',p.scan_outcome,'scanEngine',p.scan_engine,'scannedAt',to_char(p.scanned_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'storedByMembershipId',p.stored_by_membership_id::text,'storedAt',to_char(p.stored_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 IF s.pdf IS DISTINCT FROM expected_pdf OR s.pdf->>'status' NOT IN ('official','superseded') THEN RAISE EXCEPTION 'Invalid frozen signing PDF facts' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM contract_commands r WHERE r.workspace_id=s.workspace_id AND r.company_id=s.company_id AND r.result_contract_id=s.contract_id AND r.result_version_id=s.contract_version_id AND r.kind='DECLARE_SIGNING' AND r.opportunity_id=c.opportunity_id AND r.actor_workspace_membership_id=s.actor_workspace_membership_id AND r.created_at=s.recorded_at)
 OR NOT EXISTS(SELECT 1 FROM contract_events e WHERE e.workspace_id=s.workspace_id AND e.company_id=s.company_id AND e.contract_id=s.contract_id AND e.contract_version_id=s.contract_version_id AND e.action='contract_version.signing_declared' AND e.actor_workspace_membership_id=s.actor_workspace_membership_id AND e.actor_internal_user_id=s.actor_internal_user_id AND e.occurred_at=s.recorded_at AND e.metadata=jsonb_build_object('contractId',c.id::text,'contractVersionId',v.id::text,'versionNumber',v.version_number,'provenance','COMPANY_MODEL_OFFER','evidenceKind','DECLARED_RECEIVED_PDF')) THEN RAISE EXCEPTION 'Incomplete reported signing receipt/event' USING ERRCODE='23514'; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION guard_reported_contract_signing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM validate_reported_contract_signing(NEW.contract_version_id);
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contract_signing_declarations_evidence AFTER INSERT ON contract_signing_declarations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_reported_contract_signing();
--> statement-breakpoint
CREATE TRIGGER contract_signing_declarations_immutable BEFORE UPDATE OR DELETE ON contract_signing_declarations FOR EACH ROW EXECUTE FUNCTION guard_c1_immutable_record();

--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_c5_signature_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s contract_signatures%ROWTYPE; d contract_decisions%ROWTYPE; v contract_versions%ROWTYPE; c contracts%ROWTYPE; r contract_quality_runs%ROWTYPE; warning_codes jsonb;
BEGIN
 IF TG_TABLE_NAME='contracts' THEN
  SELECT * INTO c FROM contracts WHERE id=NEW.id;
  SELECT * INTO v FROM contract_versions WHERE contract_id=c.id ORDER BY version_number DESC LIMIT 1;
 ELSIF TG_TABLE_NAME='contract_versions' THEN
  SELECT * INTO v FROM contract_versions WHERE id=NEW.id;
  SELECT * INTO c FROM contracts WHERE id=v.contract_id;
 ELSE
  SELECT * INTO v FROM contract_versions WHERE id=NEW.contract_version_id;
  SELECT * INTO c FROM contracts WHERE id=v.contract_id;
 END IF;
 IF c.origin='COMPANY_MODEL_OFFER' THEN PERFORM validate_reported_contract_signing(v.id); RETURN NULL; END IF;
 SELECT * INTO s FROM contract_signatures WHERE workspace_id=v.workspace_id AND company_id=v.company_id AND contract_version_id=v.id;
 IF v.execution_state='NOT_EXECUTED' THEN
  IF s.id IS NOT NULL THEN RAISE EXCEPTION 'Unexpected Contract signature' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 SELECT * INTO d FROM contract_decisions WHERE workspace_id=v.workspace_id AND company_id=v.company_id AND contract_id=v.contract_id AND contract_version_id=v.id AND kind='APPROVE';
 IF s.id IS NULL OR d.id IS NULL OR s.result_revision <> v.created_contract_revision+2 OR v.superseded_by_version_id IS NOT NULL OR v.decision_state <> 'APPROVED' OR c.revision <> s.result_revision + (SELECT count(*) FROM contract_project_links WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id) OR s.representation_checksum <> d.representation_checksum OR s.recorded_at < d.decided_at OR s.provider_signed_on NOT BETWEEN (d.decided_at AT TIME ZONE 'UTC')::date AND (s.recorded_at AT TIME ZONE 'UTC')::date OR s.client_signed_on NOT BETWEEN (d.decided_at AT TIME ZONE 'UTC')::date AND (s.recorded_at AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'Invalid Contract execution evidence' USING ERRCODE='23514'; END IF;
 SELECT * INTO r FROM contract_quality_runs WHERE id=s.quality_run_id AND workspace_id=s.workspace_id AND company_id=s.company_id AND contract_id=s.contract_id AND contract_version_id=s.contract_version_id AND actor_workspace_membership_id=s.actor_workspace_membership_id AND actor_internal_user_id=s.actor_internal_user_id AND evaluated_at=s.recorded_at;
 SELECT coalesce(jsonb_agg(item->>'code' ORDER BY item->>'code'),'[]'::jsonb) INTO warning_codes FROM jsonb_array_elements(r.results) item WHERE item->>'status'='WARNING' AND NOT (d.acknowledged_warning_codes ? (item->>'code'));
 IF r.id IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.results) item WHERE item->>'status'='ERROR') OR s.acknowledged_warning_codes IS DISTINCT FROM warning_codes THEN RAISE EXCEPTION 'Invalid Contract signature checks' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM contract_commands WHERE result_signature_id=s.id AND workspace_id=s.workspace_id AND company_id=s.company_id AND result_contract_id=s.contract_id AND actor_workspace_membership_id=s.actor_workspace_membership_id AND kind='RECORD_SIGNATURE' AND opportunity_id=c.opportunity_id AND created_at=s.recorded_at) OR NOT EXISTS(SELECT 1 FROM contract_events WHERE contract_version_id=s.contract_version_id AND workspace_id=s.workspace_id AND company_id=s.company_id AND contract_id=s.contract_id AND actor_workspace_membership_id=s.actor_workspace_membership_id AND actor_internal_user_id=s.actor_internal_user_id AND occurred_at=s.recorded_at AND action='contract_version.signature_recorded' AND metadata->>'contractVersionId'=s.contract_version_id::text AND metadata->>'versionNumber'=v.version_number::text AND metadata->'ruleSetVersion'=to_jsonb(r.rule_set_version) AND metadata->'acknowledgedWarningCodes'=s.acknowledged_warning_codes AND metadata->>'evidenceKind'='SIMULATED') THEN RAISE EXCEPTION 'Incomplete Contract signature' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_c8_event_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c contracts%ROWTYPE; v contract_versions%ROWTYPE;
BEGIN
 SELECT * INTO c FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.contract_id;
 IF NEW.action='contract_project.linked' THEN RETURN NEW; END IF;
 IF NEW.action='contract_version.signing_declared' THEN
  SELECT * INTO v FROM contract_versions WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND contract_id=c.id AND id=NEW.contract_version_id;
  IF c.kind<>'CONTRACT' OR c.origin IS DISTINCT FROM 'COMPANY_MODEL_OFFER' OR v.id IS NULL OR v.provenance<>'COMPANY_MODEL_OFFER' OR NEW.metadata IS DISTINCT FROM jsonb_build_object('contractId',c.id::text,'contractVersionId',v.id::text,'versionNumber',v.version_number,'provenance','COMPANY_MODEL_OFFER','evidenceKind','DECLARED_RECEIVED_PDF') THEN RAISE EXCEPTION 'Invalid declared signing event source' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;

 IF NEW.metadata->>'kind' IS DISTINCT FROM c.kind THEN RAISE EXCEPTION 'Invalid Contract event kind' USING ERRCODE='23514'; END IF;
 IF c.kind IN ('CONTRACT','PRECONTRACT') AND (NEW.metadata->>'origin' IS DISTINCT FROM c.origin OR (c.origin='DIRECT' AND NEW.metadata ? 'offerVersionId') OR (c.origin='ACCEPTED_OFFER' AND NEW.metadata->>'offerVersionId' IS DISTINCT FROM c.source_offer_version_id::text)) THEN RAISE EXCEPTION 'Invalid Contract event source' USING ERRCODE='23514'; END IF;
 IF c.kind='ADDENDUM' AND (NEW.metadata->>'parentContractId' IS DISTINCT FROM c.parent_contract_id::text OR NEW.metadata->>'addendumOrdinal' IS DISTINCT FROM c.addendum_ordinal::text) THEN RAISE EXCEPTION 'Invalid Addendum event source' USING ERRCODE='23514'; END IF;
 IF NEW.contract_version_id IS NOT NULL THEN
  SELECT * INTO v FROM contract_versions WHERE id=NEW.contract_version_id AND contract_id=c.id;
  IF v.id IS NULL OR NEW.metadata->>'contractVersionId' IS DISTINCT FROM v.id::text OR NEW.metadata->>'versionNumber' IS DISTINCT FROM v.version_number::text OR (v.pricing_snapshot_id IS NULL AND NEW.metadata ? 'pricingSnapshotId') OR (v.pricing_snapshot_id IS NOT NULL AND NEW.metadata->>'pricingSnapshotId' IS DISTINCT FROM v.pricing_snapshot_id::text) THEN RAISE EXCEPTION 'Invalid Contract version event source' USING ERRCODE='23514'; END IF;
 END IF;
 IF c.origin='OFFER_PREPARATION' AND NEW.metadata->>'offerVersionId' IS DISTINCT FROM (CASE WHEN NEW.contract_version_id IS NULL THEN c.source_offer_version_id ELSE v.source_offer_version_id END)::text THEN RAISE EXCEPTION 'Invalid Contract preparation source event' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_cp1_project_link_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c contracts%ROWTYPE; v contract_versions%ROWTYPE; s contract_signatures%ROWTYPE; declaration contract_signing_declarations%ROWTYPE; links integer;
BEGIN
 SELECT * INTO c FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.contract_id FOR UPDATE;
 SELECT * INTO v FROM contract_versions WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id ORDER BY version_number DESC LIMIT 1;
 SELECT * INTO s FROM contract_signatures WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_version_id=v.id;
 SELECT count(*) INTO links FROM contract_project_links WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id;

 IF c.origin='COMPANY_MODEL_OFFER' THEN
  SELECT * INTO declaration FROM contract_signing_declarations WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id AND contract_version_id=v.id;
  PERFORM validate_reported_contract_signing(v.id);
  IF c.kind<>'CONTRACT' OR v.execution_state<>'EXECUTED' OR declaration.id IS NULL OR links>=50 OR c.revision<>declaration.result_revision+links OR NEW.result_revision<>c.revision+1 THEN RAISE EXCEPTION 'Invalid declared Contract Project link revision' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF c.id IS NULL OR c.kind NOT IN ('CONTRACT','PRECONTRACT') OR v.execution_state<>'EXECUTED' OR links>=50 OR s.id IS NULL OR c.revision<>s.result_revision+links OR NEW.result_revision<>c.revision+1 THEN RAISE EXCEPTION 'Invalid Contract Project link revision' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE FUNCTION guard_reported_signing_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM contract_signing_declarations s WHERE s.workspace_id=NEW.workspace_id AND s.company_id=NEW.company_id AND s.contract_id=NEW.result_contract_id AND s.contract_version_id=NEW.result_version_id AND s.actor_workspace_membership_id=NEW.actor_workspace_membership_id AND s.recorded_at=NEW.created_at) THEN RAISE EXCEPTION 'Missing reported signing receipt result' USING ERRCODE='23514'; END IF;
 PERFORM validate_reported_contract_signing(NEW.result_version_id);
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contract_commands_reported_signing_result AFTER INSERT ON contract_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.kind='DECLARE_SIGNING') EXECUTE FUNCTION guard_reported_signing_receipt();
--> statement-breakpoint
CREATE FUNCTION guard_reported_signing_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM contract_signing_declarations s WHERE s.workspace_id=NEW.workspace_id AND s.company_id=NEW.company_id AND s.contract_id=NEW.contract_id AND s.contract_version_id=NEW.contract_version_id AND s.actor_workspace_membership_id=NEW.actor_workspace_membership_id AND s.actor_internal_user_id=NEW.actor_internal_user_id AND s.recorded_at=NEW.occurred_at) THEN RAISE EXCEPTION 'Missing reported signing event declaration' USING ERRCODE='23514'; END IF;
 PERFORM validate_reported_contract_signing(NEW.contract_version_id);
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contract_events_reported_signing_result AFTER INSERT ON contract_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.action='contract_version.signing_declared') EXECUTE FUNCTION guard_reported_signing_event();
--> statement-breakpoint
CREATE FUNCTION guard_reported_signing_initial_pdf() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM document_versions dv WHERE dv.workspace_id=NEW.workspace_id AND dv.company_id=NEW.company_id AND dv.document_id=NEW.document_id AND dv.id=NEW.document_version_id AND dv.status=NEW.pdf->>'status' AND dv.status IN ('official','superseded')) THEN RAISE EXCEPTION 'Invalid initial reported signing PDF status' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER contract_signing_declarations_initial_pdf BEFORE INSERT ON contract_signing_declarations FOR EACH ROW EXECUTE FUNCTION guard_reported_signing_initial_pdf();
