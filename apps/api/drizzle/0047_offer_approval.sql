ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_offer_approver_assignment.granted' BEFORE 'company_offer_preparer_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_offer_approver_assignment.revoked' BEFORE 'company_pricing_adjustment_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_offer_approver' BEFORE 'company_pricing_adjustment';--> statement-breakpoint
CREATE TABLE "offer_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"offer_version_id" uuid NOT NULL,
	"state" text NOT NULL,
	"offer_revision" integer NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"quality_run_id" uuid,
	"acknowledged_warning_codes" jsonb,
	"representation_sha256" text,
	"reason" text,
	CONSTRAINT "offer_decisions_state_check" CHECK ("offer_decisions"."offer_revision" > 1 AND (("offer_decisions"."state" = 'APPROVED' AND "offer_decisions"."quality_run_id" IS NOT NULL AND "offer_decisions"."acknowledged_warning_codes" IS NOT NULL AND jsonb_typeof("offer_decisions"."acknowledged_warning_codes") = 'array' AND "offer_decisions"."representation_sha256" IS NOT NULL AND "offer_decisions"."representation_sha256" ~ '^[0-9a-f]{64}$' AND "offer_decisions"."reason" IS NULL) OR ("offer_decisions"."state" = 'REJECTED' AND "offer_decisions"."quality_run_id" IS NULL AND "offer_decisions"."acknowledged_warning_codes" IS NULL AND "offer_decisions"."representation_sha256" IS NULL AND "offer_decisions"."reason" IS NOT NULL AND char_length("offer_decisions"."reason") BETWEEN 1 AND 500)))
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "offer_commands" DROP CONSTRAINT "offer_commands_kind_result_check";--> statement-breakpoint
ALTER TABLE "offer_events" DROP CONSTRAINT "offer_events_target_check";--> statement-breakpoint
ALTER TABLE "offer_events" DROP CONSTRAINT "offer_events_metadata_check";--> statement-breakpoint
ALTER TABLE "offers" DROP CONSTRAINT "offers_initial_state_check";--> statement-breakpoint
ALTER TABLE "offer_commands" ADD COLUMN "result_decision_id" uuid;--> statement-breakpoint
ALTER TABLE "offer_decisions" ADD CONSTRAINT "offer_decisions_version_fk" FOREIGN KEY ("workspace_id","company_id","offer_id","offer_version_id") REFERENCES "public"."offer_versions"("workspace_id","company_id","offer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_quality_runs_version_id_unique" ON "offer_quality_runs" USING btree ("workspace_id","company_id","offer_id","offer_version_id","id");--> statement-breakpoint
ALTER TABLE "offer_decisions" ADD CONSTRAINT "offer_decisions_run_fk" FOREIGN KEY ("workspace_id","company_id","offer_id","offer_version_id","quality_run_id") REFERENCES "public"."offer_quality_runs"("workspace_id","company_id","offer_id","offer_version_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_decisions" ADD CONSTRAINT "offer_decisions_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_decisions_version_unique" ON "offer_decisions" USING btree ("workspace_id","company_id","offer_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_decisions_scope_unique" ON "offer_decisions" USING btree ("workspace_id","company_id","offer_id","id");--> statement-breakpoint
ALTER TABLE "offer_commands" ADD CONSTRAINT "offer_commands_decision_result_fk" FOREIGN KEY ("workspace_id","company_id","result_offer_id","result_decision_id") REFERENCES "public"."offer_decisions"("workspace_id","company_id","offer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_events_version_decision_unique" ON "offer_events" USING btree ("workspace_id","offer_version_id") WHERE "offer_events"."action" IN ('offer_version.approved','offer_version.rejected');--> statement-breakpoint

ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_document_registrar' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_commercial_intake' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_project_access' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "offer_commands" ADD CONSTRAINT "offer_commands_kind_result_check" CHECK (("offer_commands"."kind" = 'CREATE_OFFER' AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NULL)
      OR ("offer_commands"."kind" = 'RUN_QUALITY_CHECKS' AND "offer_commands"."result_quality_run_id" IS NOT NULL AND "offer_commands"."result_decision_id" IS NULL)
      OR ("offer_commands"."kind" IN ('APPROVE','REJECT') AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "offer_events" ADD CONSTRAINT "offer_events_target_check" CHECK (("offer_events"."action" = 'offer.created' AND "offer_events"."offer_version_id" IS NULL)
        OR ("offer_events"."action" IN ('offer_version.created','offer_version.approved','offer_version.rejected') AND "offer_events"."offer_version_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "offer_events" ADD CONSTRAINT "offer_events_metadata_check" CHECK ((CASE
        WHEN jsonb_typeof("offer_events"."metadata") <> 'object' THEN false
        WHEN "offer_events"."action" = 'offer.created' THEN
          "offer_events"."metadata" ?& ARRAY['offerId', 'illustrativeReference', 'provenance']
          AND ("offer_events"."metadata" - ARRAY['offerId', 'illustrativeReference', 'provenance']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'illustrativeReference') = 'number'
          AND "offer_events"."metadata"->>'illustrativeReference' ~ '^[1-9][0-9]*$'
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
        WHEN "offer_events"."action" = 'offer_version.created' THEN
          "offer_events"."metadata" ?& ARRAY['offerId', 'offerVersionId', 'versionNumber', 'pricingSnapshotId', 'recipientKind', 'provenance']
          AND ("offer_events"."metadata" - ARRAY['offerId', 'offerVersionId', 'versionNumber', 'pricingSnapshotId', 'recipientKind', 'provenance']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'versionNumber') = 'number'
          AND "offer_events"."metadata"->>'versionNumber' = '1'
          AND jsonb_typeof("offer_events"."metadata"->'pricingSnapshotId') = 'string'
          AND "offer_events"."metadata"->>'pricingSnapshotId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND "offer_events"."metadata"->>'recipientKind' IN ('PRIMARY', 'ADDITIONAL')
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
        WHEN "offer_events"."action" IN ('offer_version.approved','offer_version.rejected') THEN
          "offer_events"."metadata" ?& ARRAY['offerId','offerVersionId','versionNumber','outcome','provenance']
          AND ("offer_events"."metadata" - ARRAY['offerId','offerVersionId','versionNumber','outcome','provenance','ruleSetVersion','acknowledgedWarningCodes']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
          AND "offer_events"."metadata"->>'versionNumber' = '1'
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
          AND (("offer_events"."action" = 'offer_version.approved' AND "offer_events"."metadata"->>'outcome' = 'APPROVED' AND "offer_events"."metadata"->>'ruleSetVersion' = '1' AND jsonb_typeof("offer_events"."metadata"->'acknowledgedWarningCodes') = 'array')
          OR ("offer_events"."action" = 'offer_version.rejected' AND "offer_events"."metadata"->>'outcome' = 'REJECTED' AND NOT ("offer_events"."metadata" ?| ARRAY['ruleSetVersion','acknowledgedWarningCodes'])))
        ELSE false
      END) IS TRUE);--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_initial_state_check" CHECK ("offers"."illustrative_reference" > 0 AND "offers"."revision" > 0);
--> statement-breakpoint
CREATE FUNCTION prevent_offer_decision_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Offer decisions are immutable.' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER offer_decisions_immutable BEFORE UPDATE OR DELETE ON offer_decisions
FOR EACH ROW EXECUTE FUNCTION prevent_offer_decision_change();
--> statement-breakpoint
CREATE FUNCTION validate_offer_approval_run() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  recorded_run offer_quality_runs%ROWTYPE;
  warnings jsonb;
BEGIN
  IF NEW.state = 'APPROVED' THEN
    SELECT * INTO recorded_run FROM offer_quality_runs WHERE id = NEW.quality_run_id;
    IF NOT FOUND OR recorded_run.offer_version_id <> NEW.offer_version_id
       OR recorded_run.actor_workspace_membership_id <> NEW.actor_workspace_membership_id
       OR recorded_run.actor_internal_user_id <> NEW.actor_internal_user_id
       OR recorded_run.evaluated_at <> NEW.decided_at
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(recorded_run.results) r WHERE r->>'status' = 'ERROR') THEN
      RAISE EXCEPTION 'Approval requires its exact decision run.' USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(jsonb_agg(r->'code' ORDER BY r->>'code'), '[]'::jsonb) INTO warnings
    FROM jsonb_array_elements(recorded_run.results) r WHERE r->>'status' = 'WARNING';
    IF (SELECT COALESCE(jsonb_agg(c ORDER BY c), '[]'::jsonb) FROM jsonb_array_elements(NEW.acknowledged_warning_codes) c) IS DISTINCT FROM warnings THEN
      RAISE EXCEPTION 'Approval requires the exact warning set.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER offer_approval_run_checked BEFORE INSERT ON offer_decisions
FOR EACH ROW EXECUTE FUNCTION validate_offer_approval_run();
