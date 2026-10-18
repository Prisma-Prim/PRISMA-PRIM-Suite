ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_project_stage_advancer_assignment.granted' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_project_stage_advancer_assignment.revoked' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_project_stage_advancer';--> statement-breakpoint
CREATE TABLE "project_stage_commands" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"transition_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_stage_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"stage_revision" integer NOT NULL,
	"from_stage_key" text NOT NULL,
	"from_stage_title" text NOT NULL,
	"to_stage_key" text NOT NULL,
	"to_stage_title" text NOT NULL,
	"required_tasks" jsonb NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_stage_transitions_scope_id_unique" UNIQUE("workspace_id","company_id","project_id","id"),
	CONSTRAINT "project_stage_transitions_revision_unique" UNIQUE("workspace_id","project_id","stage_revision"),
	CONSTRAINT "project_stage_transitions_transition_check" CHECK ("project_stage_transitions"."stage_revision" = 1 AND "project_stage_transitions"."from_stage_key" = 'scoping' AND "project_stage_transitions"."to_stage_key" = 'preparation'),
	CONSTRAINT "project_stage_transitions_proof_check" CHECK (jsonb_typeof("project_stage_transitions"."required_tasks") = 'array' AND jsonb_array_length("project_stage_transitions"."required_tasks") = 2)
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "project_template_instances" ADD COLUMN "current_stage_key" text;--> statement-breakpoint
ALTER TABLE "project_template_instances" ADD COLUMN "stage_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_stage_commands" ADD CONSTRAINT "project_stage_commands_transition_fk" FOREIGN KEY ("workspace_id","company_id","project_id","transition_id") REFERENCES "public"."project_stage_transitions"("workspace_id","company_id","project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stage_commands" ADD CONSTRAINT "project_stage_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stage_transitions" ADD CONSTRAINT "project_stage_transitions_instance_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."project_template_instances"("workspace_id","company_id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stage_transitions" ADD CONSTRAINT "project_stage_transitions_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_stage_commands_actor_key_unique" ON "project_stage_commands" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "project_template_instances" ADD CONSTRAINT "project_template_instances_progress_check" CHECK (("project_template_instances"."stage_revision" = 0 AND "project_template_instances"."current_stage_key" IS NULL) OR ("project_template_instances"."stage_revision" = 1 AND "project_template_instances"."current_stage_key" = 'preparation'));