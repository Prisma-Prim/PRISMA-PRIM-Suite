ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_ideas_reader_assignment.granted' BEFORE 'company_profitability_contributor_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_ideas_reader_assignment.revoked' BEFORE 'company_profitability_contributor_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_ideas_recorder_assignment.granted' BEFORE 'company_profitability_contributor_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_ideas_recorder_assignment.revoked' BEFORE 'company_profitability_contributor_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_ideas_reviewer_assignment.granted' BEFORE 'company_profitability_contributor_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_ideas_reviewer_assignment.revoked' BEFORE 'company_profitability_contributor_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_ideas_reader';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_ideas_recorder';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_ideas_reviewer';--> statement-breakpoint
CREATE TABLE "idea_dispositions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"idea_id" uuid NOT NULL,
	"preceding_revision" integer NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"reconsideration_date" date,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idea_dispositions_revision_check" CHECK ("idea_dispositions"."preceding_revision" > 0 AND "idea_dispositions"."revision" = "idea_dispositions"."preceding_revision" + 1),
	CONSTRAINT "idea_dispositions_kind_check" CHECK ("idea_dispositions"."kind" IN ('deferred','rejected') AND ("idea_dispositions"."kind" = 'deferred' OR "idea_dispositions"."reconsideration_date" IS NULL)),
	CONSTRAINT "idea_dispositions_reason_check" CHECK (length(btrim("idea_dispositions"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "idea_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"idea_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"action" text NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "idea_events_metadata_check" CHECK ((("idea_events"."action" = 'idea.recorded' AND "idea_events"."revision" = 1 AND "idea_events"."metadata" = jsonb_build_object('revision', "idea_events"."revision")) OR ("idea_events"."action" = 'idea.disposition.recorded' AND "idea_events"."revision" > 1 AND "idea_events"."metadata"->>'disposition' IN ('deferred','rejected') AND "idea_events"."metadata" = jsonb_build_object('revision', "idea_events"."revision", 'disposition', "idea_events"."metadata"->>'disposition'))) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "idea_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"command_kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"idea_id" uuid NOT NULL,
	"response" jsonb NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idea_receipts_kind_check" CHECK ("idea_receipts"."command_kind" IN ('record','disposition'))
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"description" text NOT NULL,
	"origin" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"disposition" text DEFAULT 'new' NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ideas_revision_check" CHECK ("ideas"."revision" > 0 AND (("ideas"."revision" = 1 AND "ideas"."disposition" = 'new') OR ("ideas"."revision" > 1 AND "ideas"."disposition" IN ('deferred', 'rejected')))),
	CONSTRAINT "ideas_text_check" CHECK (length(btrim("ideas"."description")) > 0 AND length(btrim("ideas"."origin")) > 0)
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
CREATE UNIQUE INDEX "ideas_scope_id_unique" ON "ideas" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
ALTER TABLE "idea_dispositions" ADD CONSTRAINT "idea_dispositions_idea_fk" FOREIGN KEY ("workspace_id","company_id","idea_id") REFERENCES "public"."ideas"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_dispositions" ADD CONSTRAINT "idea_dispositions_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_events" ADD CONSTRAINT "idea_events_idea_fk" FOREIGN KEY ("workspace_id","company_id","idea_id") REFERENCES "public"."ideas"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_events" ADD CONSTRAINT "idea_events_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_receipts" ADD CONSTRAINT "idea_receipts_idea_fk" FOREIGN KEY ("workspace_id","company_id","idea_id") REFERENCES "public"."ideas"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_receipts" ADD CONSTRAINT "idea_receipts_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idea_dispositions_revision_unique" ON "idea_dispositions" USING btree ("workspace_id","company_id","idea_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "idea_dispositions_scope_id_unique" ON "idea_dispositions" USING btree ("workspace_id","company_id","idea_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "idea_events_revision_unique" ON "idea_events" USING btree ("workspace_id","company_id","idea_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "idea_receipts_actor_key_unique" ON "idea_receipts" USING btree ("workspace_id","company_id","actor_membership_id","command_kind","idempotency_key");--> statement-breakpoint
CREATE INDEX "ideas_list_idx" ON "ideas" USING btree ("workspace_id","company_id","submitted_at","id");--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
--> statement-breakpoint
CREATE FUNCTION ideas_preserve_original() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Idea history is immutable'; END IF;
  IF ROW(NEW.id, NEW.workspace_id, NEW.company_id, NEW.description, NEW.origin,
      NEW.actor_membership_id, NEW.actor_internal_user_id, NEW.actor_display_name, NEW.submitted_at)
    IS DISTINCT FROM ROW(OLD.id, OLD.workspace_id, OLD.company_id, OLD.description, OLD.origin,
      OLD.actor_membership_id, OLD.actor_internal_user_id, OLD.actor_display_name, OLD.submitted_at)
    OR NEW.revision <> OLD.revision + 1 OR NEW.disposition NOT IN ('deferred','rejected')
  THEN RAISE EXCEPTION 'Idea original is immutable'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ideas_preserve_original BEFORE UPDATE OR DELETE ON ideas FOR EACH ROW EXECUTE FUNCTION ideas_preserve_original();
--> statement-breakpoint
CREATE FUNCTION ideas_preserve_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Idea history is immutable'; END $$;
--> statement-breakpoint
CREATE TRIGGER idea_dispositions_preserve_history BEFORE UPDATE OR DELETE ON idea_dispositions FOR EACH ROW EXECUTE FUNCTION ideas_preserve_history();
--> statement-breakpoint
CREATE TRIGGER idea_events_preserve_history BEFORE UPDATE OR DELETE ON idea_events FOR EACH ROW EXECUTE FUNCTION ideas_preserve_history();
--> statement-breakpoint
CREATE TRIGGER idea_receipts_preserve_history BEFORE UPDATE OR DELETE ON idea_receipts FOR EACH ROW EXECUTE FUNCTION ideas_preserve_history();
