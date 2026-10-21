ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_complaints_reader_assignment.granted' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_complaints_reader_assignment.revoked' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_complaints_recorder_assignment.granted' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_complaints_recorder_assignment.revoked' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_complaints_reader';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_complaints_recorder';--> statement-breakpoint
CREATE TABLE "complaint_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"complaint_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"action" text NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "complaint_events_metadata_check" CHECK ((
        (("complaint_events"."action" = 'complaint.recorded' AND "complaint_events"."revision" = 1)
          OR ("complaint_events"."action" = 'complaint.intake.corrected' AND "complaint_events"."revision" > 1))
          AND "complaint_events"."metadata" = jsonb_build_object('revision', "complaint_events"."revision")
      ) OR (
        "complaint_events"."action" = 'complaint.journal.recorded' AND "complaint_events"."revision" > 1
        AND "complaint_events"."metadata"->>'kind' IS NOT NULL
        AND "complaint_events"."metadata"->>'kind' IN ('action', 'response', 'correction')
        AND "complaint_events"."metadata" = jsonb_build_object('revision', "complaint_events"."revision", 'kind', "complaint_events"."metadata"->>'kind')
      ))
);
--> statement-breakpoint
CREATE TABLE "complaint_intake_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"complaint_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"intake" jsonb NOT NULL,
	"reason" text,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_label" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "complaint_intake_versions_payload_check" CHECK (jsonb_typeof("complaint_intake_versions"."intake") = 'object' AND "complaint_intake_versions"."revision" >= 1 AND (("complaint_intake_versions"."revision" = 1 AND "complaint_intake_versions"."reason" IS NULL) OR ("complaint_intake_versions"."revision" > 1 AND "complaint_intake_versions"."reason" IS NOT NULL AND length(btrim("complaint_intake_versions"."reason")) BETWEEN 1 AND 1000)))
);
--> statement-breakpoint
CREATE TABLE "complaint_journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"complaint_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"original_entry_id" uuid,
	"original_kind" text,
	"factual_text" text NOT NULL,
	"declared_date" date,
	"reason" text,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_label" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "complaint_journal_entries_payload_check" CHECK (
      "complaint_journal_entries"."revision" > 1 AND length(btrim("complaint_journal_entries"."factual_text")) BETWEEN 1 AND 5000
      AND (
        ("complaint_journal_entries"."kind" IN ('action', 'response') AND "complaint_journal_entries"."original_entry_id" IS NULL
          AND "complaint_journal_entries"."original_kind" IS NULL AND "complaint_journal_entries"."reason" IS NULL)
        OR ("complaint_journal_entries"."kind" = 'correction' AND "complaint_journal_entries"."original_entry_id" IS NOT NULL
          AND "complaint_journal_entries"."original_kind" IS NOT NULL AND "complaint_journal_entries"."original_kind" IN ('action', 'response')
          AND "complaint_journal_entries"."reason" IS NOT NULL AND length(btrim("complaint_journal_entries"."reason")) BETWEEN 1 AND 1000)
      ))
);
--> statement-breakpoint
CREATE TABLE "complaint_receipts" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"complaint_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"response" jsonb NOT NULL,
	CONSTRAINT "complaint_receipts_response_check" CHECK (jsonb_typeof("complaint_receipts"."response") = 'object' AND length("complaint_receipts"."fingerprint") = 64)
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"client_account_id" uuid NOT NULL,
	"project_id" uuid,
	"responsible_membership_id" uuid NOT NULL,
	"responsible_display_label" text NOT NULL,
	"created_by_internal_user_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"latest_intake_revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "complaints_revision_check" CHECK ("complaints"."revision" >= 1 AND "complaints"."latest_intake_revision" >= 1 AND "complaints"."latest_intake_revision" <= "complaints"."revision")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "complaints_scope_id_unique" ON "complaints" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "complaint_journal_entries_scope_kind_unique" ON "complaint_journal_entries" USING btree ("workspace_id","company_id","complaint_id","id","kind");--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "complaint_events" ADD CONSTRAINT "complaint_events_complaint_fk" FOREIGN KEY ("workspace_id","company_id","complaint_id") REFERENCES "public"."complaints"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_events" ADD CONSTRAINT "complaint_events_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_intake_versions" ADD CONSTRAINT "complaint_intake_versions_complaint_fk" FOREIGN KEY ("workspace_id","company_id","complaint_id") REFERENCES "public"."complaints"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_intake_versions" ADD CONSTRAINT "complaint_intake_versions_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_journal_entries" ADD CONSTRAINT "complaint_journal_entries_complaint_fk" FOREIGN KEY ("workspace_id","company_id","complaint_id") REFERENCES "public"."complaints"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_journal_entries" ADD CONSTRAINT "complaint_journal_entries_original_fk" FOREIGN KEY ("workspace_id","company_id","complaint_id","original_entry_id","original_kind") REFERENCES "public"."complaint_journal_entries"("workspace_id","company_id","complaint_id","id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_journal_entries" ADD CONSTRAINT "complaint_journal_entries_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_receipts" ADD CONSTRAINT "complaint_receipts_complaint_fk" FOREIGN KEY ("workspace_id","company_id","complaint_id") REFERENCES "public"."complaints"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_receipts" ADD CONSTRAINT "complaint_receipts_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_original_client_relationship_fk" FOREIGN KEY ("workspace_id","client_account_id","company_id") REFERENCES "public"."client_company_relationships"("workspace_id","client_account_id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_original_project_fk" FOREIGN KEY ("workspace_id","company_id","client_account_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","client_account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_responsible_actor_fk" FOREIGN KEY ("workspace_id","responsible_membership_id","created_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "complaint_events_revision_unique" ON "complaint_events" USING btree ("workspace_id","company_id","complaint_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "complaint_intake_versions_revision_unique" ON "complaint_intake_versions" USING btree ("workspace_id","company_id","complaint_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "complaint_journal_entries_revision_unique" ON "complaint_journal_entries" USING btree ("workspace_id","company_id","complaint_id","revision");--> statement-breakpoint
CREATE INDEX "complaint_journal_entries_history_idx" ON "complaint_journal_entries" USING btree ("workspace_id","company_id","complaint_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "complaint_journal_entries_original_idx" ON "complaint_journal_entries" USING btree ("workspace_id","company_id","complaint_id","original_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "complaint_receipts_actor_key_unique" ON "complaint_receipts" USING btree ("workspace_id","company_id","actor_membership_id","idempotency_key");--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_complaints_reader', 'company_complaints_recorder') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_complaints_reader', 'company_complaints_recorder')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));