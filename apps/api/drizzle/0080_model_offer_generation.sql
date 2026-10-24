ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "offer_commands" DROP CONSTRAINT "offer_commands_kind_result_check";--> statement-breakpoint
ALTER TABLE "offer_events" DROP CONSTRAINT "offer_events_metadata_check";--> statement-breakpoint
ALTER TABLE "offer_quality_runs" DROP CONSTRAINT "offer_quality_runs_rule_set_check";--> statement-breakpoint
ALTER TABLE "offer_quality_runs" DROP CONSTRAINT "offer_quality_runs_results_check";--> statement-breakpoint
ALTER TABLE "offer_versions" DROP CONSTRAINT "offer_versions_initial_state_check";--> statement-breakpoint
ALTER TABLE "offer_versions" DROP CONSTRAINT "offer_versions_template_check";--> statement-breakpoint
ALTER TABLE "offer_versions" DROP CONSTRAINT "offer_versions_price_source_check";--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "model_source_id" uuid;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "model_source_version_id" uuid;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "model_source_version_number" integer;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "model_source_decision_id" uuid;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "model_source_decision_outcome" text;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "model_generation_snapshot" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_model_decisions_offer_source_unique" ON "offer_model_decisions" USING btree ("workspace_id","company_id","model_id","version_id","version_number","outcome","id");--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_model_version_fk" FOREIGN KEY ("workspace_id","company_id","model_source_id","model_source_version_id","model_source_version_number") REFERENCES "public"."offer_model_versions"("workspace_id","company_id","model_id","id","version_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_model_approval_fk" FOREIGN KEY ("workspace_id","company_id","model_source_id","model_source_version_id","model_source_version_number","model_source_decision_outcome","model_source_decision_id") REFERENCES "public"."offer_model_decisions"("workspace_id","company_id","model_id","version_id","version_number","outcome","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text = 'company_offer_approver' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_project_template_user' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_deliverable_access', 'company_offer_model_editor', 'company_offer_model_approver') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_deliverable_access', 'company_offer_model_editor', 'company_offer_model_approver')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "offer_commands" ADD CONSTRAINT "offer_commands_kind_result_check" CHECK ((("offer_commands"."kind" IN ('CREATE_OFFER_VERSION', 'CREATE_ESTIMATE_OFFER_VERSION', 'CREATE_MODEL_OFFER_VERSION') AND "offer_commands"."result_version_id" IS NOT NULL AND "offer_commands"."result_offer_revision" IS NOT NULL AND "offer_commands"."result_offer_revision" > 1)
      OR ("offer_commands"."kind" IN ('CREATE_ESTIMATE_OFFER', 'CREATE_MODEL_OFFER') AND "offer_commands"."result_version_id" IS NOT NULL AND "offer_commands"."result_offer_revision" IS NOT NULL AND "offer_commands"."result_offer_revision" = 1)
      OR ("offer_commands"."kind" NOT IN ('CREATE_OFFER_VERSION', 'CREATE_ESTIMATE_OFFER', 'CREATE_ESTIMATE_OFFER_VERSION', 'CREATE_MODEL_OFFER', 'CREATE_MODEL_OFFER_VERSION') AND "offer_commands"."result_version_id" IS NULL AND "offer_commands"."result_offer_revision" IS NULL)) AND (("offer_commands"."kind" IN ('CREATE_OFFER', 'CREATE_OFFER_VERSION', 'CREATE_ESTIMATE_OFFER', 'CREATE_ESTIMATE_OFFER_VERSION', 'CREATE_MODEL_OFFER', 'CREATE_MODEL_OFFER_VERSION') AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NULL AND "offer_commands"."result_client_response_id" IS NULL)
      OR ("offer_commands"."kind" = 'RUN_QUALITY_CHECKS' AND "offer_commands"."result_quality_run_id" IS NOT NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NULL AND "offer_commands"."result_client_response_id" IS NULL)
      OR ("offer_commands"."kind" IN ('APPROVE','REJECT') AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NOT NULL AND "offer_commands"."result_transmission_id" IS NULL AND "offer_commands"."result_client_response_id" IS NULL)
      OR ("offer_commands"."kind" = 'RECORD_TRANSMISSION' AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NOT NULL AND "offer_commands"."result_client_response_id" IS NULL)
      OR ("offer_commands"."kind" = 'RECORD_CLIENT_RESPONSE' AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NULL AND "offer_commands"."result_client_response_id" IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "offer_events" ADD CONSTRAINT "offer_events_metadata_check" CHECK ((CASE
        WHEN jsonb_typeof("offer_events"."metadata") <> 'object' THEN false
        WHEN "offer_events"."metadata"->>'provenance' = 'COMPANY_MODEL_ESTIMATE'
          AND "offer_events"."action" IN ('offer.created', 'offer_version.created') THEN
          "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text AND
          CASE WHEN "offer_events"."action" = 'offer.created' THEN
            "offer_events"."metadata" ?& ARRAY['offerId','illustrativeReference','provenance']
            AND ("offer_events"."metadata" - ARRAY['offerId','illustrativeReference','provenance']::text[]) = '{}'::jsonb
            AND jsonb_typeof("offer_events"."metadata"->'illustrativeReference') = 'number'
            AND "offer_events"."metadata"->>'illustrativeReference' ~ '^[1-9][0-9]*$'
          ELSE
            "offer_events"."metadata" ?& ARRAY['offerId','offerVersionId','versionNumber','recipientKind','provenance','priceSourceKind','estimateVersionId','estimateVersionNumber','approvalDecisionId','modelVersionId','modelVersionNumber','modelApprovalDecisionId']
            AND ("offer_events"."metadata" - ARRAY['offerId','offerVersionId','versionNumber','predecessorVersionNumber','recipientKind','provenance','priceSourceKind','estimateVersionId','estimateVersionNumber','approvalDecisionId','modelVersionId','modelVersionNumber','modelApprovalDecisionId']::text[]) = '{}'::jsonb
            AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
            AND jsonb_typeof("offer_events"."metadata"->'versionNumber') = 'number'
            AND "offer_events"."metadata"->>'versionNumber' ~ '^[1-9][0-9]*$'
            AND (("offer_events"."metadata"->>'versionNumber' = '1' AND NOT ("offer_events"."metadata" ? 'predecessorVersionNumber')) OR (("offer_events"."metadata"->>'versionNumber')::numeric > 1 AND jsonb_typeof("offer_events"."metadata"->'predecessorVersionNumber') = 'number' AND ("offer_events"."metadata"->>'predecessorVersionNumber')::numeric = ("offer_events"."metadata"->>'versionNumber')::numeric - 1))
            AND "offer_events"."metadata"->>'recipientKind' IN ('PRIMARY','ADDITIONAL')
            AND "offer_events"."metadata"->>'priceSourceKind' = 'DIRECTOR_APPROVED_ESTIMATE'
            AND jsonb_typeof("offer_events"."metadata"->'estimateVersionNumber') = 'number'
            AND "offer_events"."metadata"->>'estimateVersionNumber' ~ '^[1-9][0-9]*$'
            AND jsonb_typeof("offer_events"."metadata"->'modelVersionNumber') = 'number'
            AND "offer_events"."metadata"->>'modelVersionNumber' ~ '^[1-9][0-9]*$'
            AND "offer_events"."metadata"->>'estimateVersionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            AND "offer_events"."metadata"->>'approvalDecisionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            AND "offer_events"."metadata"->>'modelVersionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            AND "offer_events"."metadata"->>'modelApprovalDecisionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          END
        WHEN "offer_events"."metadata"->>'provenance' = 'APPROVED_ESTIMATE_INTERNAL_DRAFT' THEN
          "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text AND
          CASE WHEN "offer_events"."action" = 'offer.created' THEN
            "offer_events"."metadata" ?& ARRAY['offerId','illustrativeReference','provenance']
            AND ("offer_events"."metadata" - ARRAY['offerId','illustrativeReference','provenance']::text[]) = '{}'::jsonb
            AND jsonb_typeof("offer_events"."metadata"->'illustrativeReference') = 'number'
            AND "offer_events"."metadata"->>'illustrativeReference' ~ '^[1-9][0-9]*$'
          WHEN "offer_events"."action" = 'offer_version.created' THEN
            "offer_events"."metadata" ?& ARRAY['offerId','offerVersionId','versionNumber','recipientKind','provenance','priceSourceKind','estimateVersionId','estimateVersionNumber','approvalDecisionId']
            AND ("offer_events"."metadata" - ARRAY['offerId','offerVersionId','versionNumber','predecessorVersionNumber','recipientKind','provenance','priceSourceKind','estimateVersionId','estimateVersionNumber','approvalDecisionId']::text[]) = '{}'::jsonb
            AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
            AND jsonb_typeof("offer_events"."metadata"->'versionNumber') = 'number'
            AND "offer_events"."metadata"->>'versionNumber' ~ '^[1-9][0-9]*$'
            AND (("offer_events"."metadata"->>'versionNumber' = '1' AND NOT ("offer_events"."metadata" ? 'predecessorVersionNumber')) OR (("offer_events"."metadata"->>'versionNumber')::numeric > 1 AND jsonb_typeof("offer_events"."metadata"->'predecessorVersionNumber') = 'number' AND ("offer_events"."metadata"->>'predecessorVersionNumber')::numeric = ("offer_events"."metadata"->>'versionNumber')::numeric - 1))
            AND "offer_events"."metadata"->>'recipientKind' IN ('PRIMARY','ADDITIONAL')
            AND "offer_events"."metadata"->>'priceSourceKind' = 'DIRECTOR_APPROVED_ESTIMATE'
            AND jsonb_typeof("offer_events"."metadata"->'estimateVersionNumber') = 'number'
            AND "offer_events"."metadata"->>'estimateVersionNumber' ~ '^[1-9][0-9]*$'
            AND "offer_events"."metadata"->>'estimateVersionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            AND "offer_events"."metadata"->>'approvalDecisionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          WHEN "offer_events"."action" = 'offer_version.rejected' THEN
            "offer_events"."metadata" ?& ARRAY['offerId','offerVersionId','versionNumber','outcome','provenance']
            AND ("offer_events"."metadata" - ARRAY['offerId','offerVersionId','versionNumber','outcome','provenance']::text[]) = '{}'::jsonb
            AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
            AND jsonb_typeof("offer_events"."metadata"->'versionNumber') = 'number'
            AND "offer_events"."metadata"->>'versionNumber' ~ '^[1-9][0-9]*$'
            AND "offer_events"."metadata"->>'outcome' = 'REJECTED'
          ELSE false END
        WHEN "offer_events"."action" = 'offer.created' THEN
          "offer_events"."metadata" ?& ARRAY['offerId', 'illustrativeReference', 'provenance']
          AND ("offer_events"."metadata" - ARRAY['offerId', 'illustrativeReference', 'provenance']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'illustrativeReference') = 'number'
          AND "offer_events"."metadata"->>'illustrativeReference' ~ '^[1-9][0-9]*$'
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
        WHEN "offer_events"."action" = 'offer_version.created' THEN
          "offer_events"."metadata" ?& ARRAY['offerId', 'offerVersionId', 'versionNumber', 'pricingSnapshotId', 'recipientKind', 'provenance']
          AND ("offer_events"."metadata" - ARRAY['offerId', 'offerVersionId', 'versionNumber', 'predecessorVersionNumber', 'pricingSnapshotId', 'recipientKind', 'provenance']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'versionNumber') = 'number'
          AND "offer_events"."metadata"->>'versionNumber' ~ '^[1-9][0-9]*$'
          AND (("offer_events"."metadata"->>'versionNumber' = '1' AND NOT ("offer_events"."metadata" ? 'predecessorVersionNumber')) OR (("offer_events"."metadata"->>'versionNumber')::numeric > 1 AND jsonb_typeof("offer_events"."metadata"->'predecessorVersionNumber') = 'number' AND ("offer_events"."metadata"->>'predecessorVersionNumber')::numeric = ("offer_events"."metadata"->>'versionNumber')::numeric - 1))
          AND jsonb_typeof("offer_events"."metadata"->'pricingSnapshotId') = 'string'
          AND "offer_events"."metadata"->>'pricingSnapshotId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND "offer_events"."metadata"->>'recipientKind' IN ('PRIMARY', 'ADDITIONAL')
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
        WHEN "offer_events"."action" IN ('offer_version.approved','offer_version.rejected') THEN
          "offer_events"."metadata" ?& ARRAY['offerId','offerVersionId','versionNumber','outcome','provenance']
          AND ("offer_events"."metadata" - ARRAY['offerId','offerVersionId','versionNumber','outcome','provenance','ruleSetVersion','acknowledgedWarningCodes']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'versionNumber') = 'number' AND "offer_events"."metadata"->>'versionNumber' ~ '^[1-9][0-9]*$'
          AND "offer_events"."metadata"->>'provenance' IN ('ILLUSTRATIVE', 'COMPANY_MODEL_ESTIMATE')
          AND (("offer_events"."action" = 'offer_version.approved' AND "offer_events"."metadata"->>'outcome' = 'APPROVED' AND jsonb_typeof("offer_events"."metadata"->'ruleSetVersion') = 'number' AND "offer_events"."metadata"->>'ruleSetVersion' IN ('1','2') AND ("offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE' OR "offer_events"."metadata"->>'ruleSetVersion' = '1') AND jsonb_typeof("offer_events"."metadata"->'acknowledgedWarningCodes') = 'array')
          OR ("offer_events"."action" = 'offer_version.rejected' AND "offer_events"."metadata"->>'outcome' = 'REJECTED' AND NOT ("offer_events"."metadata" ?| ARRAY['ruleSetVersion','acknowledgedWarningCodes'])))
        WHEN "offer_events"."action" = 'offer_version.transmission_recorded' THEN
          "offer_events"."metadata" ?& ARRAY['offerId','offerVersionId','versionNumber','channel','provenance','ruleSetVersion','acknowledgedWarningCodes']
          AND ("offer_events"."metadata" - ARRAY['offerId','offerVersionId','versionNumber','channel','provenance','ruleSetVersion','acknowledgedWarningCodes']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'versionNumber') = 'number' AND "offer_events"."metadata"->>'versionNumber' ~ '^[1-9][0-9]*$'
          AND "offer_events"."metadata"->>'channel' = 'SIMULATED'
          AND "offer_events"."metadata"->>'provenance' IN ('ILLUSTRATIVE', 'COMPANY_MODEL_ESTIMATE')
          AND jsonb_typeof("offer_events"."metadata"->'ruleSetVersion') = 'number' AND "offer_events"."metadata"->>'ruleSetVersion' IN ('1','2') AND ("offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE' OR "offer_events"."metadata"->>'ruleSetVersion' = '1')
          AND jsonb_typeof("offer_events"."metadata"->'acknowledgedWarningCodes') = 'array'
        WHEN "offer_events"."action" = 'offer_version.client_response_recorded' THEN
          "offer_events"."metadata" ?& ARRAY['offerId','offerVersionId','versionNumber','evidenceKind','outcome','provenance']
          AND ("offer_events"."metadata" - ARRAY['offerId','offerVersionId','versionNumber','evidenceKind','outcome','provenance']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'versionNumber') = 'number'
          AND "offer_events"."metadata"->>'versionNumber' ~ '^[1-9][0-9]*$'
          AND "offer_events"."metadata"->>'evidenceKind' = 'SIMULATED'
          AND "offer_events"."metadata"->>'outcome' IN ('ACCEPTED','REJECTED','EXPIRED')
          AND "offer_events"."metadata"->>'provenance' IN ('ILLUSTRATIVE', 'COMPANY_MODEL_ESTIMATE')
        ELSE false
      END) IS TRUE);--> statement-breakpoint
ALTER TABLE "offer_quality_runs" ADD CONSTRAINT "offer_quality_runs_rule_set_check" CHECK (("offer_quality_runs"."rule_set" = 'OFFER_QUALITY_ILLUSTRATIVE' AND "offer_quality_runs"."rule_set_version" IN (1, 2))
        OR ("offer_quality_runs"."rule_set" = 'OFFER_QUALITY_COMPANY_MODEL' AND "offer_quality_runs"."rule_set_version" = 1));--> statement-breakpoint
ALTER TABLE "offer_quality_runs" ADD CONSTRAINT "offer_quality_runs_results_check" CHECK ((CASE WHEN jsonb_typeof("offer_quality_runs"."results") <> 'array' THEN false
    WHEN "offer_quality_runs"."rule_set" = 'OFFER_QUALITY_COMPANY_MODEL' THEN
    jsonb_array_length("offer_quality_runs"."results") = 13
    AND "offer_quality_runs"."results"->0->>'code' = 'MODEL_APPROVAL_COHERENT' AND "offer_quality_runs"."results"->0->>'status' IN ('PASS','ERROR')
    AND "offer_quality_runs"."results"->1->>'code' = 'ECONOMIC_SOURCE_COHERENT' AND "offer_quality_runs"."results"->1->>'status' IN ('PASS','ERROR')
    AND "offer_quality_runs"."results"->2->>'code' = 'DECLARED_TOTALS_COHERENT' AND "offer_quality_runs"."results"->2->>'status' IN ('PASS','ERROR')
    AND "offer_quality_runs"."results"->3->>'code' = 'REPRESENTATION_COHERENT' AND "offer_quality_runs"."results"->3->>'status' IN ('PASS','ERROR')
    AND "offer_quality_runs"."results"->4->>'code' = 'VALIDITY_OPEN' AND "offer_quality_runs"."results"->4->>'status' IN ('PASS','ERROR')
    AND "offer_quality_runs"."results"->5->>'code' = 'RECIPIENT_AVAILABLE' AND "offer_quality_runs"."results"->5->>'status' IN ('PASS','ERROR')
    AND "offer_quality_runs"."results"->6->>'code' = 'RECIPIENT_IDENTITY_CURRENT' AND "offer_quality_runs"."results"->6->>'status' IN ('PASS','WARNING')
    AND "offer_quality_runs"."results"->7->>'code' = 'RECIPIENT_TAX_ID_RECORDED' AND "offer_quality_runs"."results"->7->>'status' IN ('PASS','WARNING')
    AND "offer_quality_runs"."results"->8->>'code' = 'CURRENCY_UNCHANGED' AND "offer_quality_runs"."results"->8->>'status' IN ('PASS','WARNING')
    AND "offer_quality_runs"."results"->9->>'code' = 'NON_OFFICIAL_MARKER_PRESENT' AND "offer_quality_runs"."results"->9->>'status' IN ('PASS','ERROR')
    AND "offer_quality_runs"."results"->10->>'code' = 'DECLARED_TAX_UNVERIFIED' AND "offer_quality_runs"."results"->10->>'status' = 'WARNING'
    AND "offer_quality_runs"."results"->11->>'code' = 'NON_OFFICIAL_OFFER' AND "offer_quality_runs"."results"->11->>'status' = 'WARNING'
    AND "offer_quality_runs"."results"->12->>'code' = 'ILLUSTRATIVE_MODEL' AND "offer_quality_runs"."results"->12->>'status' IN ('PASS','WARNING')
    ELSE
    jsonb_array_length("offer_quality_runs"."results") = 8
    AND "offer_quality_runs"."results"->0->>'code' = 'PRICING_SNAPSHOT_COHERENT' AND "offer_quality_runs"."results"->0->>'status' IN ('PASS','ERROR')
    AND "offer_quality_runs"."results"->1->>'code' = 'CURRENCY_UNCHANGED' AND "offer_quality_runs"."results"->1->>'status' IN ('PASS','WARNING')
    AND "offer_quality_runs"."results"->2->>'code' = 'VALIDITY_OPEN' AND "offer_quality_runs"."results"->2->>'status' IN ('PASS','ERROR')
    AND "offer_quality_runs"."results"->3->>'code' = 'RECIPIENT_AVAILABLE' AND "offer_quality_runs"."results"->3->>'status' IN ('PASS','ERROR')
    AND "offer_quality_runs"."results"->4->>'code' = 'RECIPIENT_IDENTITY_CURRENT' AND "offer_quality_runs"."results"->4->>'status' IN ('PASS','WARNING')
    AND "offer_quality_runs"."results"->5->>'code' = 'RECIPIENT_TAX_ID_RECORDED' AND "offer_quality_runs"."results"->5->>'status' IN ('PASS','WARNING')
    AND "offer_quality_runs"."results"->6->>'code' = 'PRICING_CLIENT_CONTEXT_COHERENT' AND "offer_quality_runs"."results"->6->>'status' IN ('PASS','WARNING')
    AND "offer_quality_runs"."results"->7->>'code' = 'PROVISIONAL_MARKER_PRESENT' AND "offer_quality_runs"."results"->7->>'status' IN ('PASS','ERROR') END) IS TRUE);--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_model_source_check" CHECK ((CASE WHEN "offer_versions"."provenance" = 'COMPANY_MODEL_ESTIMATE' THEN
        "offer_versions"."model_source_id" IS NOT NULL AND "offer_versions"."model_source_version_id" IS NOT NULL
        AND "offer_versions"."model_source_version_number" IS NOT NULL AND "offer_versions"."model_source_version_number" > 0
        AND "offer_versions"."model_source_decision_id" IS NOT NULL AND "offer_versions"."model_source_decision_outcome" = 'APPROVE'
        AND jsonb_typeof("offer_versions"."model_generation_snapshot") = 'object'
        AND "offer_versions"."model_generation_snapshot" ?& ARRAY['modelSource','financialDeclaration','representation']
        AND ("offer_versions"."model_generation_snapshot" - ARRAY['modelSource','financialDeclaration','representation']::text[]) = '{}'::jsonb
        ELSE "offer_versions"."model_source_id" IS NULL AND "offer_versions"."model_source_version_id" IS NULL
        AND "offer_versions"."model_source_version_number" IS NULL AND "offer_versions"."model_source_decision_id" IS NULL
        AND "offer_versions"."model_source_decision_outcome" IS NULL AND "offer_versions"."model_generation_snapshot" IS NULL
        END) IS TRUE);--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_initial_state_check" CHECK ("offer_versions"."version_number" >= 1
        AND "offer_versions"."decision_state" = 'PENDING'
        AND "offer_versions"."transmission_state" = 'NOT_TRANSMITTED'
        AND "offer_versions"."client_response_state" = 'NONE'
        AND "offer_versions"."provenance" IN ('ILLUSTRATIVE', 'APPROVED_ESTIMATE_INTERNAL_DRAFT', 'COMPANY_MODEL_ESTIMATE'));--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_template_check" CHECK ((CASE WHEN "offer_versions"."provenance" = 'ILLUSTRATIVE' THEN
        "offer_versions"."template_code" = 'OFFER_ILLUSTRATIVE' AND "offer_versions"."template_version" IN (1, 2)
        ELSE "offer_versions"."provenance" IN ('APPROVED_ESTIMATE_INTERNAL_DRAFT', 'COMPANY_MODEL_ESTIMATE')
          AND "offer_versions"."template_code" IS NULL AND "offer_versions"."template_version" IS NULL
        END) IS TRUE);--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_price_source_check" CHECK ((CASE WHEN "offer_versions"."provenance" = 'ILLUSTRATIVE' THEN
        "offer_versions"."pricing_snapshot_id" IS NOT NULL
        AND "offer_versions"."estimate_source_id" IS NULL AND "offer_versions"."estimate_source_version_id" IS NULL
        AND "offer_versions"."estimate_source_version_number" IS NULL AND "offer_versions"."estimate_source_decision_id" IS NULL
        AND "offer_versions"."estimate_source_decision_code" IS NULL AND "offer_versions"."estimate_source_approved_at" IS NULL
        AND "offer_versions"."estimate_source_amount" IS NULL AND "offer_versions"."estimate_source_currency" IS NULL
        WHEN "offer_versions"."provenance" IN ('APPROVED_ESTIMATE_INTERNAL_DRAFT', 'COMPANY_MODEL_ESTIMATE') THEN
        "offer_versions"."pricing_snapshot_id" IS NULL
        AND "offer_versions"."estimate_source_id" IS NOT NULL AND "offer_versions"."estimate_source_version_id" IS NOT NULL
        AND "offer_versions"."estimate_source_version_number" IS NOT NULL AND "offer_versions"."estimate_source_version_number" > 0
        AND "offer_versions"."estimate_source_decision_id" IS NOT NULL AND "offer_versions"."estimate_source_decision_code" = 'APPROVE'
        AND "offer_versions"."estimate_source_approved_at" IS NOT NULL
        AND "offer_versions"."estimate_source_amount" IS NOT NULL
        AND (("offer_versions"."provenance" = 'APPROVED_ESTIMATE_INTERNAL_DRAFT' AND "offer_versions"."estimate_source_amount" ~ '^(0|[1-9][0-9]*)[.][0-9]{2}$')
          OR ("offer_versions"."provenance" = 'COMPANY_MODEL_ESTIMATE' AND "offer_versions"."estimate_source_amount" ~ '^[0-9]+[.][0-9]{2}$'))
        AND (CASE WHEN "offer_versions"."provenance" = 'APPROVED_ESTIMATE_INTERNAL_DRAFT' THEN "offer_versions"."estimate_source_amount"::numeric > 0 ELSE "offer_versions"."estimate_source_amount" ~ '[1-9]' END)
        AND "offer_versions"."estimate_source_currency" IS NOT NULL AND "offer_versions"."estimate_source_currency" ~ '^[A-Z]{3}$'
        ELSE false END) IS TRUE);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_offer_estimate_price_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_inputs jsonb; approval_instant timestamptz;
BEGIN
  IF NEW.provenance NOT IN ('APPROVED_ESTIMATE_INTERNAL_DRAFT', 'COMPANY_MODEL_ESTIMATE') THEN RETURN NEW; END IF;
  SELECT v.inputs, d.decided_at INTO source_inputs, approval_instant
    FROM profitability_estimate_versions v
    JOIN profitability_estimate_decisions d
      ON d.workspace_id = v.workspace_id AND d.company_id = v.company_id
      AND d.version_id = v.id AND d.code = 'APPROVE'
    WHERE v.workspace_id = NEW.workspace_id AND v.company_id = NEW.company_id
      AND v.id = NEW.estimate_source_version_id AND d.id = NEW.estimate_source_decision_id;
  IF NOT FOUND OR NEW.estimate_source_amount IS DISTINCT FROM source_inputs->>'proposedPrice'
    OR NEW.estimate_source_currency IS DISTINCT FROM source_inputs->>'currency'
    OR NEW.estimate_source_approved_at IS DISTINCT FROM approval_instant THEN
    RAISE EXCEPTION 'Invalid approved estimate commercial projection' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_contract_offer_price_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM offer_versions v WHERE v.id = NEW.source_offer_version_id
    AND v.workspace_id = NEW.workspace_id AND v.company_id = NEW.company_id
    AND v.provenance IN ('APPROVED_ESTIMATE_INTERNAL_DRAFT', 'COMPANY_MODEL_ESTIMATE')) THEN
    RAISE EXCEPTION 'Offer source is ineligible for this Contract journey' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- Exact scale-two addition without imposing a numeric precision/range on text facts.
CREATE FUNCTION offer_model_declared_gross(net text, tax text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE a text := replace(net, '.', ''); b text := replace(tax, '.', '');
  i integer; carry integer := 0; digit integer; total text := '';
BEGIN
  IF net !~ '^[0-9]+[.][0-9]{2}$' OR tax !~ '^[0-9]+[.][0-9]{2}$' THEN
    RAISE EXCEPTION 'Invalid declared amount' USING ERRCODE = '23514';
  END IF;
  a := lpad(a, greatest(length(a), length(b)), '0');
  b := lpad(b, length(a), '0');
  FOR i IN REVERSE length(a)..1 LOOP
    digit := substr(a, i, 1)::integer + substr(b, i, 1)::integer + carry;
    total := (digit % 10)::text || total; carry := digit / 10;
  END LOOP;
  total := ltrim(carry::text || total, '0');
  total := lpad(total, greatest(3, length(total)), '0');
  RETURN left(total, length(total) - 2) || '.' || right(total, 2);
END $$;
--> statement-breakpoint
CREATE FUNCTION guard_offer_model_generation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE model_content jsonb; approval offer_model_decisions%ROWTYPE;
  source jsonb := NEW.model_generation_snapshot->'modelSource';
  financial jsonb := NEW.model_generation_snapshot->'financialDeclaration';
  representation jsonb := NEW.model_generation_snapshot->'representation';
BEGIN
  IF NEW.provenance <> 'COMPANY_MODEL_ESTIMATE' THEN RETURN NEW; END IF;
  -- A writer must serialize with model approval, replacement and withdrawal.
  PERFORM 1 FROM offer_models m WHERE m.workspace_id = NEW.workspace_id
    AND m.company_id = NEW.company_id AND m.id = NEW.model_source_id
    AND m.active_version_id = NEW.model_source_version_id
    AND m.code = 'INTEGRATED_MANAGEMENT_CONSULTING_RO' AND m.language = 'ro' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable model selection' USING ERRCODE = '23514'; END IF;
  SELECT content INTO STRICT model_content FROM offer_model_versions WHERE workspace_id = NEW.workspace_id
    AND company_id = NEW.company_id AND model_id = NEW.model_source_id AND id = NEW.model_source_version_id;
  SELECT * INTO STRICT approval FROM offer_model_decisions WHERE workspace_id = NEW.workspace_id
    AND company_id = NEW.company_id AND model_id = NEW.model_source_id AND id = NEW.model_source_decision_id
    AND version_id = NEW.model_source_version_id AND version_number = NEW.model_source_version_number AND outcome = 'APPROVE';
  IF (jsonb_typeof(source) = 'object'
    AND source ?& ARRAY['kind','modelId','code','language','versionId','versionNumber','approvalDecisionId','approvedAt','approvedBy','content']
    AND (source - ARRAY['kind','modelId','code','language','versionId','versionNumber','approvalDecisionId','approvedAt','approvedBy','content']::text[]) = '{}'
    AND source->>'kind' = 'APPROVED_COMPANY_OFFER_MODEL'
    AND source->>'code' = 'INTEGRATED_MANAGEMENT_CONSULTING_RO' AND source->>'language' = 'ro'
    AND source->>'modelId' = NEW.model_source_id::text AND source->>'versionId' = NEW.model_source_version_id::text
    AND source->'versionNumber' = to_jsonb(NEW.model_source_version_number)
    AND source->>'approvalDecisionId' = approval.id::text AND (source->>'approvedAt')::timestamptz = approval.recorded_at
    AND source->'approvedBy' = jsonb_build_object('workspaceMembershipId', approval.actor_membership_id, 'internalUserId', approval.actor_internal_user_id)
    AND source->'content' = model_content) IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid frozen approved model' USING ERRCODE = '23514';
  END IF;
  IF (jsonb_typeof(financial) = 'object'
    AND financial ?& ARRAY['kind','netAmountConfirmed','taxAmount','taxLabel','basis','netAmount','grossAmount','currency','declaredBy','declaredAt']
    AND (financial - ARRAY['kind','netAmountConfirmed','taxAmount','taxLabel','basis','netAmount','grossAmount','currency','declaredBy','declaredAt']::text[]) = '{}'
    AND financial->>'kind' = 'NET_PLUS_DECLARED_TAX' AND financial->'netAmountConfirmed' = 'true'::jsonb
    AND jsonb_typeof(financial->'netAmount') = 'string' AND financial->>'netAmount' = NEW.estimate_source_amount
    AND jsonb_typeof(financial->'taxAmount') = 'string' AND financial->>'taxAmount' ~ '^[0-9]+[.][0-9]{2}$'
    AND jsonb_typeof(financial->'grossAmount') = 'string'
    AND financial->>'grossAmount' = offer_model_declared_gross(NEW.estimate_source_amount, financial->>'taxAmount')
    AND financial->>'currency' = NEW.estimate_source_currency
    AND jsonb_typeof(financial->'taxLabel') = 'string' AND length(btrim(financial->>'taxLabel')) > 0 AND length(financial->>'taxLabel') <= 200
    AND jsonb_typeof(financial->'basis') = 'string' AND length(btrim(financial->>'basis')) > 0 AND length(financial->>'basis') <= 2000
    AND financial->'declaredBy' = jsonb_build_object('workspaceMembershipId', NEW.created_by_workspace_membership_id, 'internalUserId', NEW.created_by_internal_user_id)
    AND (financial->>'declaredAt')::timestamptz = NEW.created_at) IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid frozen financial declaration' USING ERRCODE = '23514';
  END IF;
  IF (jsonb_typeof(representation) = 'object'
    AND representation ?& ARRAY['rendererCode','rendererVersion','html','sha256']
    AND (representation - ARRAY['rendererCode','rendererVersion','html','sha256']::text[]) = '{}'
    AND representation->>'rendererCode' = 'OFFER_COMPANY_CONSULTING_RO' AND representation->'rendererVersion' = '1'::jsonb
    AND jsonb_typeof(representation->'html') = 'string'
    AND representation->>'sha256' = encode(sha256(convert_to(representation->>'html', 'UTF8')), 'hex')) IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid frozen model Offer representation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER offer_versions_model_generation_guard BEFORE INSERT ON offer_versions
  FOR EACH ROW EXECUTE FUNCTION guard_offer_model_generation();

--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_offer_quality_run_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM offer_versions bound
     WHERE bound.workspace_id = NEW.workspace_id AND bound.company_id = NEW.company_id
       AND bound.offer_id = NEW.offer_id AND bound.id = NEW.offer_version_id
       AND ((bound.provenance = 'ILLUSTRATIVE' AND NEW.rule_set = 'OFFER_QUALITY_ILLUSTRATIVE' AND bound.template_version = NEW.rule_set_version)
         OR (bound.provenance = 'COMPANY_MODEL_ESTIMATE' AND NEW.rule_set = 'OFFER_QUALITY_COMPANY_MODEL' AND NEW.rule_set_version = 1))
  ) THEN
    RAISE EXCEPTION 'Offer Quality Check runs use the rule set bound to their version.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_offer_event_rule_set_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action IN ('offer_version.approved', 'offer_version.transmission_recorded')
     AND NOT EXISTS (
       SELECT 1 FROM offer_versions bound
        WHERE bound.workspace_id = NEW.workspace_id AND bound.company_id = NEW.company_id
          AND bound.offer_id = NEW.offer_id AND bound.id = NEW.offer_version_id
          AND bound.provenance = NEW.metadata->>'provenance'
          AND ((bound.provenance = 'ILLUSTRATIVE' AND bound.template_version::text = NEW.metadata->>'ruleSetVersion')
            OR (bound.provenance = 'COMPANY_MODEL_ESTIMATE' AND NEW.metadata->>'ruleSetVersion' = '1'))
     ) THEN
    RAISE EXCEPTION 'Offer events record the rule set bound to their version.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
