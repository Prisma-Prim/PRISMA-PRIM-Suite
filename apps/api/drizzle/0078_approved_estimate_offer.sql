ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "offer_commands" DROP CONSTRAINT "offer_commands_kind_result_check";--> statement-breakpoint
ALTER TABLE "offer_events" DROP CONSTRAINT "offer_events_metadata_check";--> statement-breakpoint
ALTER TABLE "offer_versions" DROP CONSTRAINT "offer_versions_initial_state_check";--> statement-breakpoint
ALTER TABLE "offer_versions" DROP CONSTRAINT "offer_versions_template_check";--> statement-breakpoint
ALTER TABLE "offer_versions" ALTER COLUMN "pricing_snapshot_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "offer_versions" ALTER COLUMN "template_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "offer_versions" ALTER COLUMN "template_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "estimate_source_id" uuid;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "estimate_source_version_id" uuid;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "estimate_source_version_number" integer;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "estimate_source_decision_id" uuid;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "estimate_source_decision_code" text;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "estimate_source_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "estimate_source_amount" text;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "estimate_source_currency" text;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_estimate_version_fk" FOREIGN KEY ("workspace_id","company_id","estimate_source_version_id") REFERENCES "public"."profitability_estimate_versions"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_estimate_decisions_offer_source_unique" ON "profitability_estimate_decisions" USING btree ("workspace_id","company_id","estimate_id","opportunity_id","client_request_id","version_id","version_number","code","id");--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_estimate_approval_fk" FOREIGN KEY ("workspace_id","company_id","estimate_source_id","opportunity_id","client_request_id","estimate_source_version_id","estimate_source_version_number","estimate_source_decision_code","estimate_source_decision_id") REFERENCES "public"."profitability_estimate_decisions"("workspace_id","company_id","estimate_id","opportunity_id","client_request_id","version_id","version_number","code","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text = 'company_offer_preparer' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_project_template_user' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_deliverable_access') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_deliverable_access')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "offer_commands" ADD CONSTRAINT "offer_commands_kind_result_check" CHECK ((("offer_commands"."kind" IN ('CREATE_OFFER_VERSION', 'CREATE_ESTIMATE_OFFER_VERSION') AND "offer_commands"."result_version_id" IS NOT NULL AND "offer_commands"."result_offer_revision" IS NOT NULL AND "offer_commands"."result_offer_revision" > 1)
      OR ("offer_commands"."kind" = 'CREATE_ESTIMATE_OFFER' AND "offer_commands"."result_version_id" IS NOT NULL AND "offer_commands"."result_offer_revision" IS NOT NULL AND "offer_commands"."result_offer_revision" = 1)
      OR ("offer_commands"."kind" NOT IN ('CREATE_OFFER_VERSION', 'CREATE_ESTIMATE_OFFER', 'CREATE_ESTIMATE_OFFER_VERSION') AND "offer_commands"."result_version_id" IS NULL AND "offer_commands"."result_offer_revision" IS NULL)) AND (("offer_commands"."kind" IN ('CREATE_OFFER', 'CREATE_OFFER_VERSION', 'CREATE_ESTIMATE_OFFER', 'CREATE_ESTIMATE_OFFER_VERSION') AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NULL AND "offer_commands"."result_client_response_id" IS NULL)
      OR ("offer_commands"."kind" = 'RUN_QUALITY_CHECKS' AND "offer_commands"."result_quality_run_id" IS NOT NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NULL AND "offer_commands"."result_client_response_id" IS NULL)
      OR ("offer_commands"."kind" IN ('APPROVE','REJECT') AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NOT NULL AND "offer_commands"."result_transmission_id" IS NULL AND "offer_commands"."result_client_response_id" IS NULL)
      OR ("offer_commands"."kind" = 'RECORD_TRANSMISSION' AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NOT NULL AND "offer_commands"."result_client_response_id" IS NULL)
      OR ("offer_commands"."kind" = 'RECORD_CLIENT_RESPONSE' AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NULL AND "offer_commands"."result_client_response_id" IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "offer_events" ADD CONSTRAINT "offer_events_metadata_check" CHECK ((CASE
        WHEN jsonb_typeof("offer_events"."metadata") <> 'object' THEN false
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
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
          AND (("offer_events"."action" = 'offer_version.approved' AND "offer_events"."metadata"->>'outcome' = 'APPROVED' AND jsonb_typeof("offer_events"."metadata"->'ruleSetVersion') = 'number' AND "offer_events"."metadata"->>'ruleSetVersion' IN ('1','2') AND jsonb_typeof("offer_events"."metadata"->'acknowledgedWarningCodes') = 'array')
          OR ("offer_events"."action" = 'offer_version.rejected' AND "offer_events"."metadata"->>'outcome' = 'REJECTED' AND NOT ("offer_events"."metadata" ?| ARRAY['ruleSetVersion','acknowledgedWarningCodes'])))
        WHEN "offer_events"."action" = 'offer_version.transmission_recorded' THEN
          "offer_events"."metadata" ?& ARRAY['offerId','offerVersionId','versionNumber','channel','provenance','ruleSetVersion','acknowledgedWarningCodes']
          AND ("offer_events"."metadata" - ARRAY['offerId','offerVersionId','versionNumber','channel','provenance','ruleSetVersion','acknowledgedWarningCodes']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'versionNumber') = 'number' AND "offer_events"."metadata"->>'versionNumber' ~ '^[1-9][0-9]*$'
          AND "offer_events"."metadata"->>'channel' = 'SIMULATED'
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
          AND jsonb_typeof("offer_events"."metadata"->'ruleSetVersion') = 'number' AND "offer_events"."metadata"->>'ruleSetVersion' IN ('1','2')
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
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
        ELSE false
      END) IS TRUE);--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_price_source_check" CHECK ((CASE WHEN "offer_versions"."provenance" = 'ILLUSTRATIVE' THEN
        "offer_versions"."pricing_snapshot_id" IS NOT NULL
        AND "offer_versions"."estimate_source_id" IS NULL AND "offer_versions"."estimate_source_version_id" IS NULL
        AND "offer_versions"."estimate_source_version_number" IS NULL AND "offer_versions"."estimate_source_decision_id" IS NULL
        AND "offer_versions"."estimate_source_decision_code" IS NULL AND "offer_versions"."estimate_source_approved_at" IS NULL
        AND "offer_versions"."estimate_source_amount" IS NULL AND "offer_versions"."estimate_source_currency" IS NULL
        WHEN "offer_versions"."provenance" = 'APPROVED_ESTIMATE_INTERNAL_DRAFT' THEN
        "offer_versions"."pricing_snapshot_id" IS NULL
        AND "offer_versions"."estimate_source_id" IS NOT NULL AND "offer_versions"."estimate_source_version_id" IS NOT NULL
        AND "offer_versions"."estimate_source_version_number" IS NOT NULL AND "offer_versions"."estimate_source_version_number" > 0
        AND "offer_versions"."estimate_source_decision_id" IS NOT NULL AND "offer_versions"."estimate_source_decision_code" = 'APPROVE'
        AND "offer_versions"."estimate_source_approved_at" IS NOT NULL
        AND "offer_versions"."estimate_source_amount" IS NOT NULL AND "offer_versions"."estimate_source_amount" ~ '^(0|[1-9][0-9]*)[.][0-9]{2}$' AND "offer_versions"."estimate_source_amount"::numeric > 0
        AND "offer_versions"."estimate_source_currency" IS NOT NULL AND "offer_versions"."estimate_source_currency" ~ '^[A-Z]{3}$'
        ELSE false END) IS TRUE);--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_initial_state_check" CHECK ("offer_versions"."version_number" >= 1
        AND "offer_versions"."decision_state" = 'PENDING'
        AND "offer_versions"."transmission_state" = 'NOT_TRANSMITTED'
        AND "offer_versions"."client_response_state" = 'NONE'
        AND "offer_versions"."provenance" IN ('ILLUSTRATIVE', 'APPROVED_ESTIMATE_INTERNAL_DRAFT'));--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_template_check" CHECK ((CASE WHEN "offer_versions"."provenance" = 'ILLUSTRATIVE' THEN
        "offer_versions"."template_code" = 'OFFER_ILLUSTRATIVE' AND "offer_versions"."template_version" IN (1, 2)
        ELSE "offer_versions"."provenance" = 'APPROVED_ESTIMATE_INTERNAL_DRAFT'
          AND "offer_versions"."template_code" IS NULL AND "offer_versions"."template_version" IS NULL
        END) IS TRUE);--> statement-breakpoint
-- The copied commercial projection must agree with its immutable approved source.
-- Composite foreign keys above prove the full tenant/Opportunity/Version identity.
CREATE FUNCTION guard_offer_estimate_price_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_inputs jsonb; approval_instant timestamptz;
BEGIN
  IF NEW.provenance <> 'APPROVED_ESTIMATE_INTERNAL_DRAFT' THEN RETURN NEW; END IF;
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
CREATE TRIGGER offer_versions_estimate_source_valid BEFORE INSERT ON offer_versions
  FOR EACH ROW EXECUTE FUNCTION guard_offer_estimate_price_source();
--> statement-breakpoint
-- Internal content has no execution/representation binding. Rejection is the
-- only permitted decision; no other evidence can manufacture eligibility.
CREATE FUNCTION guard_internal_offer_execution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM offer_versions v WHERE v.id = NEW.offer_version_id
    AND v.workspace_id = NEW.workspace_id AND v.company_id = NEW.company_id
    AND v.provenance = 'APPROVED_ESTIMATE_INTERNAL_DRAFT') THEN
    IF TG_TABLE_NAME = 'offer_decisions' THEN
      IF NEW.state = 'REJECTED' THEN RETURN NEW; END IF;
    END IF;
    RAISE EXCEPTION 'Internal Offer draft is ineligible for execution' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER offer_quality_runs_internal_guard BEFORE INSERT ON offer_quality_runs
  FOR EACH ROW EXECUTE FUNCTION guard_internal_offer_execution();
--> statement-breakpoint
CREATE TRIGGER offer_decisions_internal_guard BEFORE INSERT ON offer_decisions
  FOR EACH ROW EXECUTE FUNCTION guard_internal_offer_execution();
--> statement-breakpoint
CREATE TRIGGER offer_transmissions_internal_guard BEFORE INSERT ON offer_transmissions
  FOR EACH ROW EXECUTE FUNCTION guard_internal_offer_execution();
--> statement-breakpoint
CREATE TRIGGER offer_client_responses_internal_guard BEFORE INSERT ON offer_client_responses
  FOR EACH ROW EXECUTE FUNCTION guard_internal_offer_execution();
--> statement-breakpoint
CREATE FUNCTION guard_contract_offer_price_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM offer_versions v WHERE v.id = NEW.source_offer_version_id
    AND v.workspace_id = NEW.workspace_id AND v.company_id = NEW.company_id
    AND v.provenance = 'APPROVED_ESTIMATE_INTERNAL_DRAFT') THEN
    RAISE EXCEPTION 'Internal Offer draft is ineligible as a Contract source' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER contracts_internal_offer_guard BEFORE INSERT ON contracts
  FOR EACH ROW EXECUTE FUNCTION guard_contract_offer_price_source();
--> statement-breakpoint
CREATE TRIGGER contract_versions_internal_offer_guard BEFORE INSERT ON contract_versions
  FOR EACH ROW EXECUTE FUNCTION guard_contract_offer_price_source();
