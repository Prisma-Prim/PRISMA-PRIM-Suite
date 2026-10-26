ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "contract_decisions" DROP CONSTRAINT "contract_decisions_result_check";--> statement-breakpoint
ALTER TABLE "contract_events" DROP CONSTRAINT "contract_events_metadata_check";--> statement-breakpoint
ALTER TABLE "contract_quality_runs" DROP CONSTRAINT "contract_quality_runs_ruleset_check";--> statement-breakpoint
ALTER TABLE "contract_versions" DROP CONSTRAINT "contract_versions_preparation_source_check";--> statement-breakpoint
ALTER TABLE "contract_versions" DROP CONSTRAINT "contract_versions_initial_check";--> statement-breakpoint
ALTER TABLE "contract_versions" DROP CONSTRAINT "contract_versions_template_binding_check";--> statement-breakpoint
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_initial_check";--> statement-breakpoint
ALTER TABLE "contract_decisions" ADD COLUMN "review_basis" text;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD COLUMN "model_source_id" uuid;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD COLUMN "model_source_version_id" uuid;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD COLUMN "model_source_version_number" integer;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD COLUMN "model_source_decision_id" uuid;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD COLUMN "model_source_decision_outcome" text;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD COLUMN "model_generation_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_model_version_fk" FOREIGN KEY ("workspace_id","company_id","model_source_id","model_source_version_id","model_source_version_number") REFERENCES "public"."contract_model_versions"("workspace_id","company_id","model_id","id","version_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_model_decisions_approval_identity_unique" ON "contract_model_decisions" USING btree ("workspace_id","company_id","model_id","version_id","version_number","outcome","id");--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_model_approval_fk" FOREIGN KEY ("workspace_id","company_id","model_source_id","model_source_version_id","model_source_version_number","model_source_decision_outcome","model_source_decision_id") REFERENCES "public"."contract_model_decisions"("workspace_id","company_id","model_id","version_id","version_number","outcome","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_contract_early_preparation', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_deliverable_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_deliverable_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "contract_decisions" ADD CONSTRAINT "contract_decisions_result_check" CHECK (("contract_decisions"."review_basis" IS NULL OR (char_length("contract_decisions"."review_basis") BETWEEN 1 AND 2000 AND btrim("contract_decisions"."review_basis")<>'')) AND "contract_decisions"."result_revision" > 1 AND (("contract_decisions"."kind" = 'APPROVE' AND "contract_decisions"."reason" IS NULL AND "contract_decisions"."quality_run_id" IS NOT NULL AND "contract_decisions"."representation_checksum" ~ '^[0-9a-f]{64}$' AND jsonb_typeof("contract_decisions"."acknowledged_warning_codes") = 'array') OR ("contract_decisions"."kind" = 'REJECT' AND char_length("contract_decisions"."reason") BETWEEN 1 AND 500 AND btrim("contract_decisions"."reason") <> '' AND "contract_decisions"."quality_run_id" IS NULL AND "contract_decisions"."representation_checksum" IS NULL AND "contract_decisions"."acknowledged_warning_codes" IS NULL)) IS TRUE);--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_metadata_check" CHECK ((jsonb_typeof("contract_events"."metadata") = 'object' AND "contract_events"."metadata"->>'contractId' = "contract_events"."contract_id"::text AND (("contract_events"."action" = 'contract_project.linked' AND ("contract_events"."metadata" - ARRAY['contractId','projectId','created']::text[]) = '{}'::jsonb AND "contract_events"."metadata"->'created' IN ('false'::jsonb,'true'::jsonb) AND jsonb_typeof("contract_events"."metadata"->'projectId') = 'string') OR ("contract_events"."action" <> 'contract_project.linked' AND ("contract_events"."metadata" - ARRAY['contractId','contractVersionId','versionNumber','predecessorVersionNumber','illustrativeReference','kind','origin','offerVersionId','pricingSnapshotId','provenance','ruleSetVersion','acknowledgedWarningCodes','evidenceKind','parentContractId','addendumOrdinal']::text[]) = '{}'::jsonb AND (("contract_events"."metadata"->>'kind' = 'CONTRACT' AND "contract_events"."metadata"->>'origin' IN ('ACCEPTED_OFFER','DIRECT','OFFER_PREPARATION') AND (("contract_events"."metadata"->>'origin' = 'DIRECT' AND NOT ("contract_events"."metadata" ? 'offerVersionId')) OR ("contract_events"."metadata"->>'origin' IN ('ACCEPTED_OFFER','OFFER_PREPARATION') AND jsonb_typeof("contract_events"."metadata"->'offerVersionId') = 'string')) AND NOT ("contract_events"."metadata" ?| ARRAY['parentContractId','addendumOrdinal'])) OR ("contract_events"."metadata"->>'kind' = 'PRECONTRACT' AND "contract_events"."metadata"->>'origin' = 'ACCEPTED_OFFER' AND jsonb_typeof("contract_events"."metadata"->'offerVersionId') = 'string' AND NOT ("contract_events"."metadata" ?| ARRAY['parentContractId','addendumOrdinal'])) OR ("contract_events"."metadata"->>'kind' = 'ADDENDUM' AND NOT ("contract_events"."metadata" ?| ARRAY['origin','offerVersionId']) AND jsonb_typeof("contract_events"."metadata"->'parentContractId') = 'string' AND jsonb_typeof("contract_events"."metadata"->'addendumOrdinal') = 'number')) AND "contract_events"."metadata"->>'provenance' = 'ILLUSTRATIVE' AND (CASE WHEN "contract_events"."action" IN ('contract_version.approved','contract_version.signature_recorded') THEN jsonb_typeof("contract_events"."metadata"->'ruleSetVersion') = 'number' AND "contract_events"."metadata"->>'ruleSetVersion' IN ('1','2','3') ELSE NOT ("contract_events"."metadata" ? 'ruleSetVersion') END) AND ("contract_events"."action" <> 'contract_version.signature_recorded' OR "contract_events"."metadata"->>'evidenceKind' = 'SIMULATED')))) IS TRUE OR (jsonb_typeof("contract_events"."metadata")='object' AND "contract_events"."metadata"->>'contractId'="contract_events"."contract_id"::text
        AND "contract_events"."metadata"->>'kind'='CONTRACT' AND "contract_events"."metadata"->>'origin'='COMPANY_MODEL_OFFER'
        AND "contract_events"."metadata"->>'provenance'='COMPANY_MODEL_OFFER'
        AND "contract_events"."action" IN ('contract.created','contract_version.created','contract_version.approved','contract_version.rejected')
        AND ("contract_events"."metadata"-ARRAY['contractId','contractVersionId','versionNumber','predecessorVersionNumber','illustrativeReference','kind','origin','offerVersionId','provenance','ruleSetVersion','acknowledgedWarningCodes','modelVersionId','modelVersionNumber','modelApprovalDecisionId','rendererVersion','contractRevision']::text[])='{}'::jsonb
        AND jsonb_typeof("contract_events"."metadata"->'offerVersionId')='string' AND jsonb_typeof("contract_events"."metadata"->'modelVersionId')='string'
        AND jsonb_typeof("contract_events"."metadata"->'modelApprovalDecisionId')='string' AND ("contract_events"."metadata"->>'modelVersionNumber')::integer>0
        AND "contract_events"."metadata"->'rendererVersion'='1'::jsonb AND ("contract_events"."metadata"->>'contractRevision')::integer>0
        AND (CASE WHEN "contract_events"."action"='contract_version.approved' THEN "contract_events"."metadata"->'ruleSetVersion'='1'::jsonb AND jsonb_typeof("contract_events"."metadata"->'acknowledgedWarningCodes')='array' ELSE NOT ("contract_events"."metadata"?|ARRAY['ruleSetVersion','acknowledgedWarningCodes']) END)) IS TRUE);--> statement-breakpoint
ALTER TABLE "contract_quality_runs" ADD CONSTRAINT "contract_quality_runs_ruleset_check" CHECK ((("contract_quality_runs"."rule_set" = 'CONTRACT_QUALITY_ILLUSTRATIVE' AND "contract_quality_runs"."rule_set_version" IN (1, 2, 3)) OR ("contract_quality_runs"."rule_set"='CONTRACT_QUALITY_COMPANY_MODEL' AND "contract_quality_runs"."rule_set_version"=1)) AND jsonb_typeof("contract_quality_runs"."results") = 'array');--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_model_source_check" CHECK ((CASE WHEN "contract_versions"."provenance"='COMPANY_MODEL_OFFER' THEN
      "contract_versions"."template_code"='COMPANY_CONSULTING_CONTRACT_RO' AND "contract_versions"."execution_state"='NOT_EXECUTED'
      AND "contract_versions"."model_source_id" IS NOT NULL AND "contract_versions"."model_source_version_id" IS NOT NULL AND "contract_versions"."model_source_version_number">0
      AND "contract_versions"."model_source_decision_id" IS NOT NULL AND "contract_versions"."model_source_decision_outcome"='APPROVE'
      AND jsonb_typeof("contract_versions"."model_generation_snapshot")='object'
      AND "contract_versions"."model_generation_snapshot" ?& ARRAY['modelSource','offerSource','caseDetails','financials','representation']
      AND ("contract_versions"."model_generation_snapshot"-ARRAY['modelSource','offerSource','caseDetails','financials','representation']::text[])='{}'::jsonb
      ELSE "contract_versions"."model_source_id" IS NULL AND "contract_versions"."model_source_version_id" IS NULL AND "contract_versions"."model_source_version_number" IS NULL
      AND "contract_versions"."model_source_decision_id" IS NULL AND "contract_versions"."model_source_decision_outcome" IS NULL AND "contract_versions"."model_generation_snapshot" IS NULL
      AND "contract_versions"."template_code"<>'COMPANY_CONSULTING_CONTRACT_RO' END) IS TRUE);--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_preparation_source_check" CHECK (("contract_versions"."template_code" IN ('CONTRACT_PREPARATION_ILLUSTRATIVE','COMPANY_CONSULTING_CONTRACT_RO')) = ("contract_versions"."source_offer_version_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_initial_check" CHECK ("contract_versions"."version_number" > 0 AND "contract_versions"."decision_state" IN ('PENDING', 'APPROVED', 'REJECTED') AND "contract_versions"."execution_state" IN ('NOT_EXECUTED','EXECUTED') AND ("contract_versions"."execution_state" <> 'EXECUTED' OR "contract_versions"."decision_state" = 'APPROVED') AND "contract_versions"."provenance" IN ('ILLUSTRATIVE','COMPANY_MODEL_OFFER'));--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_template_binding_check" CHECK ("contract_versions"."template_version" = 1 AND (("contract_versions"."template_code" = 'COMPANY_CONSULTING_CONTRACT_RO' AND "contract_versions"."provenance"='COMPANY_MODEL_OFFER' AND "contract_versions"."clause_versions"='[]'::jsonb AND "contract_versions"."pricing_snapshot_id" IS NULL AND "contract_versions"."change_summary" IS NULL AND "contract_versions"."preliminary_work_scope" IS NULL AND "contract_versions"."preliminary_financial_conditions" IS NULL AND "contract_versions"."preliminary_limits" IS NULL) OR ("contract_versions"."template_code" IN ('CONTRACT_ILLUSTRATIVE','CONTRACT_PREPARATION_ILLUSTRATIVE') AND "contract_versions"."clause_versions" = '[{"code":"CL_SUBJECT","version":1},{"code":"CL_PRICE","version":1},{"code":"CL_TERM","version":1},{"code":"CL_CONDITIONS","version":1},{"code":"CL_GENERAL","version":1}]'::jsonb AND "contract_versions"."pricing_snapshot_id" IS NOT NULL AND "contract_versions"."change_summary" IS NULL AND "contract_versions"."preliminary_work_scope" IS NULL AND "contract_versions"."preliminary_financial_conditions" IS NULL AND "contract_versions"."preliminary_limits" IS NULL) OR ("contract_versions"."template_code" = 'PRECONTRACT_ILLUSTRATIVE' AND "contract_versions"."clause_versions" = '[{"code":"CL_SUBJECT","version":1},{"code":"CL_PRICE","version":1},{"code":"CL_TERM","version":1},{"code":"CL_CONDITIONS","version":1},{"code":"CL_PRELIMINARY_WORK","version":1},{"code":"CL_GENERAL","version":1}]'::jsonb AND "contract_versions"."pricing_snapshot_id" IS NOT NULL AND "contract_versions"."change_summary" IS NULL AND "contract_versions"."term_ends_on" IS NOT NULL AND char_length("contract_versions"."preliminary_work_scope") BETWEEN 1 AND 2000 AND btrim("contract_versions"."preliminary_work_scope") <> '' AND char_length("contract_versions"."preliminary_financial_conditions") BETWEEN 1 AND 2000 AND btrim("contract_versions"."preliminary_financial_conditions") <> '' AND char_length("contract_versions"."preliminary_limits") BETWEEN 1 AND 2000 AND btrim("contract_versions"."preliminary_limits") <> '') OR ("contract_versions"."template_code" = 'ADDENDUM_ILLUSTRATIVE' AND "contract_versions"."clause_versions" = '[{"code":"CL_SUBJECT","version":1},{"code":"CL_PRICE","version":1},{"code":"CL_TERM","version":1},{"code":"CL_CONDITIONS","version":1},{"code":"CL_CHANGE","version":1},{"code":"CL_GENERAL","version":1}]'::jsonb AND char_length("contract_versions"."change_summary") BETWEEN 1 AND 4000 AND btrim("contract_versions"."change_summary") <> '' AND "contract_versions"."scope_note" IS NULL AND "contract_versions"."commercial_conditions" IS NULL AND "contract_versions"."special_conditions" IS NULL AND "contract_versions"."term_starts_on" IS NULL AND "contract_versions"."preliminary_work_scope" IS NULL AND "contract_versions"."preliminary_financial_conditions" IS NULL AND "contract_versions"."preliminary_limits" IS NULL)) IS TRUE);--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_initial_check" CHECK (("contracts"."revision" > 0 AND "contracts"."illustrative_reference" > 0 AND (("contracts"."kind" IN ('CONTRACT','PRECONTRACT') AND ((("contracts"."origin" = 'ACCEPTED_OFFER' OR ("contracts"."kind" = 'CONTRACT' AND "contracts"."origin" IN ('OFFER_PREPARATION','COMPANY_MODEL_OFFER'))) AND "contracts"."source_offer_id" IS NOT NULL AND "contracts"."source_offer_version_id" IS NOT NULL AND "contracts"."direct_reason" IS NULL) OR ("contracts"."kind" = 'CONTRACT' AND "contracts"."origin" = 'DIRECT' AND "contracts"."source_offer_id" IS NULL AND "contracts"."source_offer_version_id" IS NULL AND char_length("contracts"."direct_reason") BETWEEN 1 AND 500 AND btrim("contracts"."direct_reason") <> '')) AND "contracts"."parent_contract_id" IS NULL AND "contracts"."addendum_ordinal" IS NULL AND ("contracts"."precontract_id" IS NULL OR ("contracts"."kind" = 'CONTRACT' AND "contracts"."precontract_id" <> "contracts"."id"))) OR ("contracts"."kind" = 'ADDENDUM' AND "contracts"."direct_reason" IS NULL AND "contracts"."origin" IS NULL AND "contracts"."source_offer_id" IS NULL AND "contracts"."source_offer_version_id" IS NULL AND "contracts"."parent_contract_id" IS NOT NULL AND "contracts"."parent_contract_id" <> "contracts"."id" AND "contracts"."addendum_ordinal" > 0 AND "contracts"."precontract_id" IS NULL))) IS TRUE);
-- Model Contract generation guards (#868). Legacy paths retain their guards.
CREATE FUNCTION model_contract_event_metadata(c contracts, v contract_versions, revision integer)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('contractId',c.id::text,'kind','CONTRACT','origin','COMPANY_MODEL_OFFER',
 'offerVersionId',v.source_offer_version_id::text,'provenance','COMPANY_MODEL_OFFER',
 'modelVersionId',v.model_source_version_id::text,'modelVersionNumber',v.model_source_version_number,
 'modelApprovalDecisionId',v.model_source_decision_id::text,'rendererVersion',1,'contractRevision',revision)
$$;

--> statement-breakpoint

CREATE FUNCTION model_contract_validate_version(c contracts, v contract_versions, previous contract_versions)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE ov offer_versions%ROWTYPE; o offers%ROWTYPE; m contract_models%ROWTYPE;
 mv contract_model_versions%ROWTYPE; md contract_model_decisions%ROWTYPE;
 s jsonb:=v.model_generation_snapshot; expected_model jsonb; expected_offer jsonb; ofm jsonb; ofd jsonb; recipient jsonb;
BEGIN
 SELECT * INTO ov FROM offer_versions WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND id=v.source_offer_version_id FOR SHARE;
 SELECT * INTO o FROM offers WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND id=c.source_offer_id;
 SELECT * INTO m FROM contract_models WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND id=v.model_source_id FOR UPDATE;
 SELECT * INTO mv FROM contract_model_versions WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND model_id=m.id AND id=v.model_source_version_id AND version_number=v.model_source_version_number;
 SELECT * INTO md FROM contract_model_decisions WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND model_id=m.id AND version_id=mv.id AND id=v.model_source_decision_id AND outcome='APPROVE';
 IF (c.kind='CONTRACT' AND c.origin='COMPANY_MODEL_OFFER' AND v.provenance='COMPANY_MODEL_OFFER'
  AND v.template_code='COMPANY_CONSULTING_CONTRACT_RO' AND v.template_version=1 AND v.clause_versions='[]'::jsonb
  AND ov.id IS NOT NULL AND o.id IS NOT NULL AND m.id IS NOT NULL AND mv.id IS NOT NULL AND md.id IS NOT NULL
  AND m.active_version_id=mv.id AND ov.offer_id=o.id AND o.opportunity_id=c.opportunity_id
  AND o.original_client_account_id=c.original_client_account_id AND o.client_request_id=c.client_request_id
  AND ov.provenance='COMPANY_MODEL_ESTIMATE' AND ov.superseded_by_version_id IS NULL AND ov.valid_until>v.created_at
  AND EXISTS(SELECT 1 FROM offer_decisions WHERE workspace_id=ov.workspace_id AND company_id=ov.company_id AND offer_version_id=ov.id AND state='APPROVED')
  AND EXISTS(SELECT 1 FROM offer_transmissions WHERE workspace_id=ov.workspace_id AND company_id=ov.company_id AND offer_version_id=ov.id)
  AND NOT EXISTS(SELECT 1 FROM offer_client_responses WHERE workspace_id=ov.workspace_id AND company_id=ov.company_id AND offer_version_id=ov.id AND outcome<>'ACCEPTED')
  AND EXISTS(SELECT 1 FROM opportunities WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND id=c.opportunity_id AND status='OPEN')
  AND v.recipient_kind=ov.recipient_kind AND v.recipient_additional_legal_entity_id IS NOT DISTINCT FROM ov.recipient_additional_legal_entity_id
  AND v.scope_note IS NOT DISTINCT FROM ov.scope_note AND v.commercial_conditions IS NOT DISTINCT FROM ov.commercial_conditions
  AND (previous.id IS NOT NULL OR v.source_offer_version_id=c.source_offer_version_id)) IS NOT TRUE THEN
  RAISE EXCEPTION 'Invalid model Contract selection or source' USING ERRCODE='23514'; END IF;
 expected_model:=jsonb_build_object('kind','APPROVED_COMPANY_CONTRACT_MODEL','modelId',m.id::text,'code',m.code,'language',m.language,
  'versionId',mv.id::text,'versionNumber',mv.version_number,'approvalDecisionId',md.id::text,
  'approvedAt',to_char(md.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'approvedBy',jsonb_build_object('workspaceMembershipId',md.actor_membership_id::text,'internalUserId',md.actor_internal_user_id::text),'content',mv.content);
 ofm:=ov.model_generation_snapshot->'modelSource'; ofd:=ov.model_generation_snapshot->'financialDeclaration';
 recipient:=jsonb_build_object('kind',ov.recipient_kind,'legalName',ov.recipient_legal_name,'taxId',ov.recipient_tax_id,'legalAddress',ov.recipient_legal_address)
  ||CASE WHEN ov.recipient_kind='ADDITIONAL' THEN jsonb_build_object('additionalLegalEntityId',ov.recipient_additional_legal_entity_id::text) ELSE '{}'::jsonb END;
 expected_offer:=jsonb_build_object('workspaceId',o.workspace_id::text,'companyId',o.company_id::text,'opportunityId',o.opportunity_id::text,
  'originalClientAccountId',o.original_client_account_id::text,'clientRequestId',o.client_request_id::text,'offerId',o.id::text,
  'offerVersionId',ov.id::text,'offerVersionNumber',ov.version_number,'illustrativeReference',o.illustrative_reference,
  'representationSha256',ov.model_generation_snapshot->'representation'->>'sha256','recipient',recipient,
  'scopeNote',ov.scope_note,'commercialConditions',ov.commercial_conditions,
  'model',jsonb_build_object('modelId',ofm->'modelId','versionId',ofm->'versionId','versionNumber',ofm->'versionNumber',
   'approvalDecisionId',ofm->'approvalDecisionId','approvedAt',ofm->'approvedAt','approvedBy',ofm->'approvedBy',
   'issuer',ofm->'content'->'issuer','serviceTitle',ofm->'content'->'serviceTitle','frameworks',ofm->'content'->'frameworks'),
  'priceSource',jsonb_build_object('kind','DIRECTOR_APPROVED_ESTIMATE','estimateId',ov.estimate_source_id::text,
   'estimateVersionId',ov.estimate_source_version_id::text,'estimateVersionNumber',ov.estimate_source_version_number,
   'approvalDecisionId',ov.estimate_source_decision_id::text,'approvedAt',to_char(ov.estimate_source_approved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'amount',ov.estimate_source_amount,'currency',ov.estimate_source_currency),
  'financials',jsonb_build_object('netAmount',ofd->'netAmount','taxAmount',ofd->'taxAmount','grossAmount',ofd->'grossAmount','taxLabel',ofd->'taxLabel','currency',ofd->'currency'));
 IF s->'modelSource' IS DISTINCT FROM expected_model OR s->'offerSource' IS DISTINCT FROM expected_offer
  OR s->'financials' IS DISTINCT FROM expected_offer->'financials'
  OR ((s->'caseDetails')-ARRAY['documentDate','clientDetails','termStartsOn','termEndsOn','specialConditions','sourceConcordanceDeclaration','sourceConcordanceBasis']::text[])<>'{}'::jsonb
  OR (s->'caseDetails' ?& ARRAY['documentDate','clientDetails','termStartsOn','termEndsOn','specialConditions','sourceConcordanceDeclaration','sourceConcordanceBasis']) IS NOT TRUE
  OR s->'caseDetails'->'sourceConcordanceDeclaration' IS DISTINCT FROM 'true'::jsonb
  OR (char_length(s->'caseDetails'->>'clientDetails') BETWEEN 1 AND 4000 AND btrim(s->'caseDetails'->>'clientDetails')<>''
    AND char_length(s->'caseDetails'->>'sourceConcordanceBasis') BETWEEN 1 AND 2000 AND btrim(s->'caseDetails'->>'sourceConcordanceBasis')<>''
    AND (s->'caseDetails'->>'documentDate') ~ '^\d{4}-\d{2}-\d{2}$'
    AND (s->'caseDetails'->>'documentDate')::date IS NOT NULL) IS NOT TRUE
  OR s->'caseDetails'->>'termStartsOn' IS DISTINCT FROM v.term_starts_on::text
  OR s->'caseDetails'->>'termEndsOn' IS DISTINCT FROM v.term_ends_on::text
  OR s->'caseDetails'->>'specialConditions' IS DISTINCT FROM v.special_conditions
  OR ((s->'representation')-ARRAY['rendererCode','rendererVersion','html','sha256']::text[])<>'{}'::jsonb
  OR s->'representation'->>'rendererCode' IS DISTINCT FROM 'COMPANY_CONSULTING_CONTRACT_RO'
  OR s->'representation'->'rendererVersion' IS DISTINCT FROM '1'::jsonb
  OR s->'representation'->>'sha256' IS DISTINCT FROM encode(sha256(convert_to(s->'representation'->>'html','UTF8')),'hex') THEN
  RAISE EXCEPTION 'Invalid frozen model Contract content' USING ERRCODE='23514'; END IF;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_c6_version_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE c contracts%ROWTYPE; p contract_versions%ROWTYPE;
BEGIN
 SELECT * INTO c FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.contract_id FOR UPDATE;
 SELECT * INTO p FROM contract_versions WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id ORDER BY version_number DESC LIMIT 1;
 IF c.origin='COMPANY_MODEL_OFFER' THEN
  PERFORM model_contract_validate_version(c,NEW,p);
 ELSE
 IF (c.kind='CONTRACT' AND (NEW.template_code IS DISTINCT FROM CASE WHEN c.origin='OFFER_PREPARATION' THEN 'CONTRACT_PREPARATION_ILLUSTRATIVE' ELSE 'CONTRACT_ILLUSTRATIVE' END OR NEW.change_summary IS NOT NULL OR NEW.pricing_snapshot_id IS NULL)) OR (c.kind='PRECONTRACT' AND (NEW.template_code<>'PRECONTRACT_ILLUSTRATIVE' OR c.origin IS DISTINCT FROM 'ACCEPTED_OFFER')) OR (c.kind='ADDENDUM' AND NEW.template_code<>'ADDENDUM_ILLUSTRATIVE') THEN RAISE EXCEPTION 'Contract kind generation mismatch' USING ERRCODE='23514'; END IF;
 IF c.origin='OFFER_PREPARATION' THEN
  IF NOT EXISTS(SELECT 1 FROM offer_versions ov WHERE ov.workspace_id=c.workspace_id AND ov.company_id=c.company_id AND ov.offer_id=c.source_offer_id AND ov.opportunity_id=c.opportunity_id AND ov.original_client_account_id=c.original_client_account_id AND ov.id=NEW.source_offer_version_id AND ov.superseded_by_version_id IS NULL AND ov.provenance='ILLUSTRATIVE' AND ov.pricing_snapshot_id=NEW.pricing_snapshot_id AND ov.scope_note IS NOT DISTINCT FROM NEW.scope_note AND ov.commercial_conditions IS NOT DISTINCT FROM NEW.commercial_conditions AND ov.recipient_legal_name=NEW.recipient_legal_name AND ov.recipient_tax_id IS NOT DISTINCT FROM NEW.recipient_tax_id AND ov.recipient_legal_address IS NOT DISTINCT FROM NEW.recipient_legal_address AND ov.recipient_kind=NEW.recipient_kind AND ov.recipient_additional_legal_entity_id IS NOT DISTINCT FROM NEW.recipient_additional_legal_entity_id AND ((p.id IS NOT NULL AND EXISTS(SELECT 1 FROM offer_client_responses r WHERE r.workspace_id=ov.workspace_id AND r.company_id=ov.company_id AND r.offer_version_id=ov.id AND r.outcome='ACCEPTED')) OR (NOT EXISTS(SELECT 1 FROM offer_client_responses r WHERE r.workspace_id=ov.workspace_id AND r.company_id=ov.company_id AND r.offer_version_id=ov.id) AND ov.valid_until>NEW.created_at AND EXISTS(SELECT 1 FROM offer_decisions d WHERE d.workspace_id=ov.workspace_id AND d.company_id=ov.company_id AND d.offer_version_id=ov.id AND d.state='APPROVED') AND EXISTS(SELECT 1 FROM offer_transmissions t WHERE t.workspace_id=ov.workspace_id AND t.company_id=ov.company_id AND t.offer_version_id=ov.id) AND EXISTS(SELECT 1 FROM opportunities o WHERE o.workspace_id=c.workspace_id AND o.company_id=c.company_id AND o.id=c.opportunity_id AND o.status='OPEN')))) OR (p.id IS NULL AND NEW.source_offer_version_id IS DISTINCT FROM c.source_offer_version_id) THEN RAISE EXCEPTION 'Invalid Contract preparation source' USING ERRCODE='23514'; END IF;
 ELSIF NEW.source_offer_version_id IS NOT NULL THEN RAISE EXCEPTION 'Unexpected version source' USING ERRCODE='23514'; END IF;

 END IF;
 IF c.kind='ADDENDUM' AND NOT EXISTS(SELECT 1 FROM contracts pc JOIN contract_versions pv ON pv.contract_id=pc.id WHERE pc.workspace_id=c.workspace_id AND pc.company_id=c.company_id AND pc.id=c.parent_contract_id AND pc.kind IN ('CONTRACT','PRECONTRACT') AND pv.execution_state='EXECUTED' AND pv.recipient_kind=NEW.recipient_kind AND pv.recipient_additional_legal_entity_id IS NOT DISTINCT FROM NEW.recipient_additional_legal_entity_id) THEN RAISE EXCEPTION 'Invalid Addendum party' USING ERRCODE='23514'; END IF;
 IF c.origin='DIRECT' AND (char_length(NEW.scope_note) BETWEEN 1 AND 2000 AND btrim(NEW.scope_note)<>'' AND (NEW.commercial_conditions IS NULL OR char_length(NEW.commercial_conditions)<=4000)) IS NOT TRUE THEN RAISE EXCEPTION 'Invalid direct Contract content' USING ERRCODE='23514'; END IF;
 IF NEW.decision_state<>'PENDING' OR NEW.execution_state<>'NOT_EXECUTED' OR NEW.superseded_by_version_id IS NOT NULL OR NEW.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'Invalid new Contract Version' USING ERRCODE='23514'; END IF;
 IF p.id IS NULL THEN
  IF NEW.version_number<>1 OR NEW.created_contract_revision<>1 OR NEW.predecessor_version_id IS NOT NULL OR c.revision<>1 THEN RAISE EXCEPTION 'Invalid initial Contract Version' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.version_number<>p.version_number+1 OR NEW.predecessor_version_id IS DISTINCT FROM p.id OR NEW.created_contract_revision<>c.revision+1 OR p.superseded_by_version_id IS NOT NULL OR EXISTS(SELECT 1 FROM contract_versions WHERE contract_id=c.id AND execution_state='EXECUTED') OR (c.origin='ACCEPTED_OFFER' AND NEW.pricing_snapshot_id IS DISTINCT FROM p.pricing_snapshot_id) OR NEW.recipient_kind<>p.recipient_kind OR NEW.recipient_additional_legal_entity_id IS DISTINCT FROM p.recipient_additional_legal_entity_id OR (c.origin='ACCEPTED_OFFER' AND (NEW.scope_note IS DISTINCT FROM p.scope_note OR NEW.commercial_conditions IS DISTINCT FROM p.commercial_conditions)) OR (c.origin<>'COMPANY_MODEL_OFFER' AND NEW.issuing_company_label<>p.issuing_company_label) THEN RAISE EXCEPTION 'Invalid Contract successor' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $function$

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_contract_offer_price_source()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_TABLE_NAME='contracts' THEN
    IF NEW.origin='COMPANY_MODEL_OFFER' THEN RETURN NEW; END IF;
  ELSIF NEW.provenance='COMPANY_MODEL_OFFER' AND EXISTS(SELECT 1 FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.contract_id AND origin='COMPANY_MODEL_OFFER') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM offer_versions v WHERE v.id = NEW.source_offer_version_id
    AND v.workspace_id = NEW.workspace_id AND v.company_id = NEW.company_id
    AND v.provenance IN ('APPROVED_ESTIMATE_INTERNAL_DRAFT', 'COMPANY_MODEL_ESTIMATE')) THEN
    RAISE EXCEPTION 'Offer source is ineligible for this Contract journey' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $function$

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_c6_version_chain()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE c contracts%ROWTYPE; v contract_versions%ROWTYPE; s contract_signatures%ROWTYPE; links integer;
BEGIN
 IF TG_TABLE_NAME='contracts' THEN SELECT * INTO c FROM contracts WHERE id=NEW.id;
 ELSE SELECT * INTO c FROM contracts WHERE id=NEW.contract_id; END IF;
 SELECT * INTO v FROM contract_versions WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id ORDER BY version_number DESC LIMIT 1;
 SELECT * INTO s FROM contract_signatures WHERE contract_version_id=v.id;
 SELECT count(*) INTO links FROM contract_project_links WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id;
 IF v.id IS NULL OR c.revision <> v.created_contract_revision + (CASE WHEN v.decision_state='PENDING' THEN 0 ELSE 1 END) + (CASE WHEN v.execution_state='EXECUTED' THEN 1 ELSE 0 END) + links OR v.superseded_by_version_id IS NOT NULL OR v.version_number<>(SELECT count(*) FROM contract_versions WHERE contract_id=c.id) THEN RAISE EXCEPTION 'Invalid Contract head revision' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM contract_versions p LEFT JOIN contract_versions n ON n.predecessor_version_id=p.id WHERE p.contract_id=c.id AND ((p.id<>v.id AND (n.id IS NULL OR p.superseded_by_version_id IS DISTINCT FROM n.id OR p.superseded_at IS DISTINCT FROM n.created_at OR n.version_number<>p.version_number+1 OR n.created_contract_revision<>p.created_contract_revision+CASE WHEN p.decision_state='PENDING' THEN 1 ELSE 2 END)) OR (p.id=v.id AND (n.id IS NOT NULL OR p.superseded_by_version_id IS NOT NULL)))) THEN RAISE EXCEPTION 'Invalid Contract lineage' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM contract_versions n WHERE n.contract_id=c.id AND n.version_number>1 AND (NOT EXISTS(SELECT 1 FROM contract_commands r WHERE r.workspace_id=n.workspace_id AND r.company_id=n.company_id AND r.result_contract_id=n.contract_id AND r.result_version_id=n.id AND r.kind='CREATE_VERSION' AND r.opportunity_id=c.opportunity_id AND r.actor_workspace_membership_id=n.created_by_workspace_membership_id AND r.created_at=n.created_at) OR NOT EXISTS(SELECT 1 FROM contract_events e WHERE e.workspace_id=n.workspace_id AND e.company_id=n.company_id AND e.contract_id=n.contract_id AND e.contract_version_id=n.id AND e.action='contract_version.created' AND e.actor_workspace_membership_id=n.created_by_workspace_membership_id AND e.actor_internal_user_id=n.created_by_internal_user_id AND e.occurred_at=n.created_at AND e.metadata=(jsonb_build_object('contractId',c.id::text,'contractVersionId',n.id::text,'versionNumber',n.version_number,'predecessorVersionNumber',n.version_number-1,'kind',c.kind,'provenance',n.provenance) || CASE WHEN c.kind='ADDENDUM' THEN jsonb_build_object('parentContractId',c.parent_contract_id::text,'addendumOrdinal',c.addendum_ordinal) WHEN c.origin='DIRECT' THEN jsonb_build_object('origin','DIRECT') ELSE jsonb_build_object('origin',c.origin,'offerVersionId',CASE WHEN c.origin IN ('OFFER_PREPARATION','COMPANY_MODEL_OFFER') THEN n.source_offer_version_id::text ELSE c.source_offer_version_id::text END) END || CASE WHEN c.origin='COMPANY_MODEL_OFFER' THEN jsonb_build_object('modelVersionId',n.model_source_version_id::text,'modelVersionNumber',n.model_source_version_number,'modelApprovalDecisionId',n.model_source_decision_id::text,'rendererVersion',1,'contractRevision',n.created_contract_revision) ELSE '{}'::jsonb END || CASE WHEN n.pricing_snapshot_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('pricingSnapshotId',n.pricing_snapshot_id::text) END)))) THEN RAISE EXCEPTION 'Incomplete Contract version evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $function$

--> statement-breakpoint

CREATE FUNCTION model_contract_check_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c contracts%ROWTYPE; v contract_versions%ROWTYPE; d contract_decisions%ROWTYPE; expected jsonb;
BEGIN
 IF TG_TABLE_NAME='contracts' THEN SELECT * INTO c FROM contracts WHERE id=NEW.id;
 ELSE SELECT * INTO c FROM contracts WHERE id=NEW.contract_id; END IF;
 IF c.origin IS DISTINCT FROM 'COMPANY_MODEL_OFFER' THEN RETURN NULL; END IF;
 SELECT * INTO v FROM contract_versions WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id AND version_number=1;
 IF v.id IS NULL THEN RAISE EXCEPTION 'Missing initial model Contract Version' USING ERRCODE='23514'; END IF;
 expected:=model_contract_event_metadata(c,v,1);
 IF NOT EXISTS(SELECT 1 FROM contract_commands r WHERE r.workspace_id=c.workspace_id AND r.company_id=c.company_id AND r.opportunity_id=c.opportunity_id AND r.result_contract_id=c.id AND r.result_version_id IS NULL AND r.kind='CREATE' AND r.actor_workspace_membership_id=c.created_by_workspace_membership_id AND r.created_at=c.created_at)
  OR NOT EXISTS(SELECT 1 FROM contract_events e WHERE e.workspace_id=c.workspace_id AND e.company_id=c.company_id AND e.contract_id=c.id AND e.action='contract.created' AND e.actor_workspace_membership_id=c.created_by_workspace_membership_id AND e.actor_internal_user_id=c.created_by_internal_user_id AND e.occurred_at=c.created_at AND e.metadata=expected||jsonb_build_object('illustrativeReference',c.illustrative_reference))
  OR NOT EXISTS(SELECT 1 FROM contract_events e WHERE e.workspace_id=c.workspace_id AND e.company_id=c.company_id AND e.contract_id=c.id AND e.contract_version_id=v.id AND e.action='contract_version.created' AND e.actor_workspace_membership_id=v.created_by_workspace_membership_id AND e.actor_internal_user_id=v.created_by_internal_user_id AND e.occurred_at=v.created_at AND e.metadata=expected||jsonb_build_object('contractVersionId',v.id::text,'versionNumber',1)) THEN
  RAISE EXCEPTION 'Incomplete model Contract creation evidence' USING ERRCODE='23514'; END IF;
 FOR d IN SELECT * FROM contract_decisions WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id LOOP
  SELECT * INTO v FROM contract_versions WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id AND id=d.contract_version_id;
  IF (d.kind='APPROVE' AND (char_length(d.review_basis) BETWEEN 1 AND 2000 AND btrim(d.review_basis)<>'' AND d.representation_checksum=v.model_generation_snapshot->'representation'->>'sha256' AND EXISTS(SELECT 1 FROM contract_quality_runs WHERE id=d.quality_run_id AND rule_set='CONTRACT_QUALITY_COMPANY_MODEL' AND rule_set_version=1)) IS NOT TRUE)
   OR (d.kind='REJECT' AND d.review_basis IS NOT NULL) THEN RAISE EXCEPTION 'Invalid model Contract review evidence' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NULL;
END $$;

--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contracts_model_generation_evidence AFTER INSERT OR UPDATE ON contracts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION model_contract_check_evidence();

--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contract_versions_model_generation_evidence AFTER INSERT OR UPDATE ON contract_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION model_contract_check_evidence();

--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contract_decisions_model_generation_evidence AFTER INSERT ON contract_decisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION model_contract_check_evidence();

--> statement-breakpoint

CREATE FUNCTION model_contract_validate_quality(r contract_quality_runs) RETURNS void LANGUAGE plpgsql AS $$
DECLARE codes text[]:=ARRAY['SOURCE_COMPANY_MATCHES','PARTY_AVAILABLE','PARTY_MATCHES_SOURCE','PARTY_TAX_ID_RECORDED','PARTY_IDENTITY_MATCHES_SOURCE','PARTY_IDENTITY_CURRENT','ISSUER_MATCHES_SOURCE','SERVICE_MATCHES_SOURCE','FINANCIALS_MATCH_SOURCE','CONDITIONS_MATCH_SOURCE','SOURCE_OFFER_READY','MODEL_APPROVAL_PRESERVED','MODEL_WORDING_REVIEWED','ANNEX_SCOPE_REVIEWED','ADDED_CONDITIONS_CONFIRMED','TERM_END_NOT_PASSED','PROVISIONAL_MARKER_PRESENT'];
 item jsonb; code text; severity text; idx integer:=0; ready boolean;
BEGIN
 IF r.rule_set<>'CONTRACT_QUALITY_COMPANY_MODEL' OR r.rule_set_version<>1 OR jsonb_typeof(r.results)<>'array' OR jsonb_array_length(r.results)<>cardinality(codes) THEN RAISE EXCEPTION 'Invalid model Contract rule binding or results' USING ERRCODE='23514'; END IF;
 SELECT EXISTS(SELECT 1 FROM contract_versions cv JOIN contracts c ON c.id=cv.contract_id AND c.workspace_id=cv.workspace_id AND c.company_id=cv.company_id
  JOIN offer_versions ov ON ov.workspace_id=cv.workspace_id AND ov.company_id=cv.company_id AND ov.id=cv.source_offer_version_id AND ov.offer_id=c.source_offer_id
  JOIN opportunities op ON op.workspace_id=c.workspace_id AND op.company_id=c.company_id AND op.id=c.opportunity_id
  WHERE cv.id=r.contract_version_id AND cv.workspace_id=r.workspace_id AND cv.company_id=r.company_id
  AND ov.provenance='COMPANY_MODEL_ESTIMATE' AND ov.superseded_by_version_id IS NULL AND ov.valid_until>r.evaluated_at AND op.status='OPEN'
  AND EXISTS(SELECT 1 FROM offer_decisions d WHERE d.workspace_id=ov.workspace_id AND d.company_id=ov.company_id AND d.offer_version_id=ov.id AND d.state='APPROVED')
  AND EXISTS(SELECT 1 FROM offer_transmissions t WHERE t.workspace_id=ov.workspace_id AND t.company_id=ov.company_id AND t.offer_version_id=ov.id)
  AND NOT EXISTS(SELECT 1 FROM offer_client_responses cr WHERE cr.workspace_id=ov.workspace_id AND cr.company_id=ov.company_id AND cr.offer_version_id=ov.id AND cr.outcome<>'ACCEPTED')) INTO ready;
 FOREACH code IN ARRAY codes LOOP
  item:=r.results->idx;
  severity:=CASE WHEN code IN ('PARTY_IDENTITY_MATCHES_SOURCE','PARTY_IDENTITY_CURRENT','MODEL_WORDING_REVIEWED','ANNEX_SCOPE_REVIEWED','ADDED_CONDITIONS_CONFIRMED','TERM_END_NOT_PASSED') THEN 'WARNING' ELSE 'ERROR' END;
  IF (jsonb_typeof(item)='object' AND (item-ARRAY['code','status']::text[])='{}'::jsonb AND item->>'code'=code AND item->>'status' IN ('PASS',severity)
   AND (code NOT IN ('MODEL_WORDING_REVIEWED','ANNEX_SCOPE_REVIEWED') OR item->>'status'='WARNING')
   AND (code<>'SOURCE_OFFER_READY' OR item->>'status'=CASE WHEN ready THEN 'PASS' ELSE 'ERROR' END)) IS NOT TRUE THEN RAISE EXCEPTION 'Invalid model Contract result' USING ERRCODE='23514'; END IF;
  idx:=idx+1;
 END LOOP;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_c3_quality_results()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE codes text[] := ARRAY['SOURCE_COMPANY_MATCHES','PARTY_AVAILABLE','PARTY_MATCHES_SOURCE','PARTY_IDENTITY_MATCHES_SOURCE','PARTY_IDENTITY_CURRENT','PARTY_TAX_ID_RECORDED','PRICE_MATCHES_ACCEPTED_OFFER','PRICING_SNAPSHOT_COHERENT','CONDITIONS_MATCH_ACCEPTED_OFFER','ADDED_CONDITIONS_CONFIRMED'];
 term_end date;
 template text;
 origin text;
 snapshot uuid;
 item jsonb;
 code text;
 severity text;
 idx integer := 0;
BEGIN
 SELECT term_ends_on,template_code,pricing_snapshot_id INTO term_end,template,snapshot FROM contract_versions WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND contract_id=NEW.contract_id AND id=NEW.contract_version_id;
 SELECT c.origin INTO origin FROM contracts c WHERE c.workspace_id=NEW.workspace_id AND c.company_id=NEW.company_id AND c.id=NEW.contract_id;
 IF origin='COMPANY_MODEL_OFFER' THEN PERFORM model_contract_validate_quality(NEW); RETURN NEW; END IF;
 IF origin='OFFER_PREPARATION' THEN codes:=array_replace(array_replace(codes,'PRICE_MATCHES_ACCEPTED_OFFER','PRICE_MATCHES_SOURCE_OFFER'),'CONDITIONS_MATCH_ACCEPTED_OFFER','CONDITIONS_MATCH_SOURCE_OFFER'); codes:=array_append(codes,'SOURCE_OFFER_ACCEPTED'); END IF;
 IF origin='DIRECT' THEN codes:=ARRAY['SOURCE_COMPANY_MATCHES','PARTY_AVAILABLE','PARTY_IDENTITY_CURRENT','PARTY_TAX_ID_RECORDED','PRICING_SNAPSHOT_COHERENT','DIRECT_ORIGIN_REVIEWED']; END IF;
 IF template='ADDENDUM_ILLUSTRATIVE' THEN
  codes:=ARRAY['SOURCE_COMPANY_MATCHES','PARTY_AVAILABLE','PARTY_MATCHES_SOURCE','PARTY_IDENTITY_MATCHES_SOURCE','PARTY_IDENTITY_CURRENT','PARTY_TAX_ID_RECORDED'];
  IF snapshot IS NOT NULL THEN codes:=array_append(codes,'PRICING_SNAPSHOT_COHERENT'); END IF;
  codes:=array_append(codes,'PARENT_EXECUTED');
  IF snapshot IS NOT NULL THEN codes:=array_append(codes,'CURRENCY_MATCHES_PARENT'); END IF;
 END IF;
 IF term_end IS NOT NULL THEN codes := array_append(codes,'TERM_END_NOT_PASSED'); END IF;
 codes := array_append(codes,'PROVISIONAL_MARKER_PRESENT');
 IF jsonb_typeof(NEW.results) <> 'array' OR jsonb_array_length(NEW.results) <> cardinality(codes) THEN RAISE EXCEPTION 'Invalid Contract Quality Check results' USING ERRCODE='23514'; END IF;
 FOREACH code IN ARRAY codes LOOP
  item := NEW.results->idx;
  severity := CASE WHEN code IN ('PARTY_IDENTITY_MATCHES_SOURCE','PARTY_IDENTITY_CURRENT','ADDED_CONDITIONS_CONFIRMED','TERM_END_NOT_PASSED','CURRENCY_MATCHES_PARENT','DIRECT_ORIGIN_REVIEWED') THEN 'WARNING' ELSE 'ERROR' END;
  IF (jsonb_typeof(item)='object' AND (item-ARRAY['code','status']::text[])='{}'::jsonb AND item->>'code'=code AND item->>'status' IN ('PASS',severity) AND (code<>'DIRECT_ORIGIN_REVIEWED' OR item->>'status'='WARNING') AND (code<>'ADDED_CONDITIONS_CONFIRMED' OR template<>'PRECONTRACT_ILLUSTRATIVE' OR item->>'status'='WARNING')) IS NOT TRUE THEN RAISE EXCEPTION 'Invalid Contract Quality Check result' USING ERRCODE='23514'; END IF;
  IF code='SOURCE_OFFER_ACCEPTED' AND item->>'status' IS DISTINCT FROM (CASE WHEN EXISTS(SELECT 1 FROM contract_versions cv JOIN offer_versions ov ON ov.workspace_id=cv.workspace_id AND ov.company_id=cv.company_id AND ov.id=cv.source_offer_version_id JOIN offer_client_responses r ON r.workspace_id=ov.workspace_id AND r.company_id=ov.company_id AND r.offer_version_id=ov.id WHERE cv.id=NEW.contract_version_id AND cv.workspace_id=NEW.workspace_id AND cv.company_id=NEW.company_id AND ov.superseded_by_version_id IS NULL AND r.outcome='ACCEPTED') THEN 'PASS' ELSE 'ERROR' END) THEN RAISE EXCEPTION 'Invalid preparation acceptance check' USING ERRCODE='23514'; END IF;
  idx := idx + 1;
 END LOOP;
 RETURN NEW;
END;
$function$

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_contract_quality_run_binding()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.rule_set IS DISTINCT FROM (CASE WHEN EXISTS(SELECT 1 FROM contract_versions WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.contract_version_id AND provenance='COMPANY_MODEL_OFFER') THEN 'CONTRACT_QUALITY_COMPANY_MODEL' ELSE 'CONTRACT_QUALITY_ILLUSTRATIVE' END) THEN RAISE EXCEPTION 'Invalid Contract quality provenance binding' USING ERRCODE='23514'; END IF;
  IF NEW.rule_set_version IS DISTINCT FROM contract_version_quality_rule_set(NEW.workspace_id, NEW.company_id, NEW.contract_version_id) THEN
    RAISE EXCEPTION 'Contract Quality Check runs use the rule set bound to their version.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$
