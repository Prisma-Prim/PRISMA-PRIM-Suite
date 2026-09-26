ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_project_approver_assignment.granted' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_project_approver_assignment.revoked' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_project_approver';--> statement-breakpoint
CREATE TABLE "project_lifecycle_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"command" text NOT NULL,
	"result_revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_lifecycle_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"lifecycle_revision" integer NOT NULL,
	"action" text NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"reason" text,
	"note" text,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_lifecycle_transitions_revision_unique" UNIQUE("workspace_id","project_id","lifecycle_revision"),
	CONSTRAINT "project_lifecycle_transitions_revision_check" CHECK ("project_lifecycle_transitions"."lifecycle_revision" >= 1),
	CONSTRAINT "project_lifecycle_transitions_action_check" CHECK ((
        ("project_lifecycle_transitions"."action" = 'activate' AND "project_lifecycle_transitions"."from_status" = 'preparatory' AND "project_lifecycle_transitions"."to_status" = 'active')
        OR ("project_lifecycle_transitions"."action" = 'hold' AND "project_lifecycle_transitions"."from_status" = 'active' AND "project_lifecycle_transitions"."to_status" = 'on_hold')
        OR ("project_lifecycle_transitions"."action" = 'resume' AND "project_lifecycle_transitions"."from_status" = 'on_hold' AND "project_lifecycle_transitions"."to_status" = 'active')
        OR ("project_lifecycle_transitions"."action" = 'complete' AND "project_lifecycle_transitions"."from_status" = 'active' AND "project_lifecycle_transitions"."to_status" = 'completed')
        OR ("project_lifecycle_transitions"."action" = 'cancel' AND "project_lifecycle_transitions"."from_status" IN ('preparatory', 'active', 'on_hold') AND "project_lifecycle_transitions"."to_status" = 'cancelled')
      )),
	CONSTRAINT "project_lifecycle_transitions_text_check" CHECK ((
        ("project_lifecycle_transitions"."action" IN ('hold', 'cancel') AND "project_lifecycle_transitions"."reason" IS NOT NULL AND "project_lifecycle_transitions"."note" IS NULL)
        OR ("project_lifecycle_transitions"."action" = 'complete' AND "project_lifecycle_transitions"."note" IS NOT NULL AND "project_lifecycle_transitions"."reason" IS NULL)
        OR ("project_lifecycle_transitions"."action" IN ('activate', 'resume') AND "project_lifecycle_transitions"."reason" IS NULL AND "project_lifecycle_transitions"."note" IS NULL)
      )
      AND ("project_lifecycle_transitions"."reason" IS NULL OR (length("project_lifecycle_transitions"."reason") BETWEEN 1 AND 500 AND "project_lifecycle_transitions"."reason" = btrim("project_lifecycle_transitions"."reason")))
      AND ("project_lifecycle_transitions"."note" IS NULL OR (length("project_lifecycle_transitions"."note") BETWEEN 1 AND 500 AND "project_lifecycle_transitions"."note" = btrim("project_lifecycle_transitions"."note"))))
);
--> statement-breakpoint
CREATE TABLE "project_start_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"approved_offer" text NOT NULL,
	"contract_or_precontract" text NOT NULL,
	"project_plan" text NOT NULL,
	"initial_documents" text NOT NULL,
	"deadlines" text NOT NULL,
	"financial_conditions" text NOT NULL,
	"risks" text NOT NULL,
	"exception_reason" text,
	"completion_membership_id" uuid,
	"completion_display_label" text,
	"completion_due_date" date,
	"declared_by_internal_user_id" uuid NOT NULL,
	"declared_by_membership_id" uuid NOT NULL,
	"declared_by_display_name" text NOT NULL,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_start_declarations_items_check" CHECK ("project_start_declarations"."approved_offer" IN ('present', 'missing')
        AND "project_start_declarations"."contract_or_precontract" IN ('present', 'missing')
        AND "project_start_declarations"."project_plan" IN ('present', 'missing')
        AND "project_start_declarations"."initial_documents" IN ('present', 'missing')
        AND "project_start_declarations"."deadlines" IN ('present', 'missing')
        AND "project_start_declarations"."financial_conditions" IN ('present', 'missing')
        AND "project_start_declarations"."risks" IN ('present', 'missing')),
	CONSTRAINT "project_start_declarations_exception_check" CHECK ((
        "project_start_declarations"."approved_offer" = 'missing'
        OR "project_start_declarations"."contract_or_precontract" = 'missing'
        OR "project_start_declarations"."project_plan" = 'missing'
        OR "project_start_declarations"."initial_documents" = 'missing'
        OR "project_start_declarations"."deadlines" = 'missing'
        OR "project_start_declarations"."financial_conditions" = 'missing'
        OR "project_start_declarations"."risks" = 'missing'
      ) = ("project_start_declarations"."exception_reason" IS NOT NULL)
      AND ("project_start_declarations"."exception_reason" IS NULL) = ("project_start_declarations"."completion_membership_id" IS NULL)
      AND ("project_start_declarations"."exception_reason" IS NULL) = ("project_start_declarations"."completion_display_label" IS NULL)
      AND ("project_start_declarations"."exception_reason" IS NULL) = ("project_start_declarations"."completion_due_date" IS NULL)
      AND ("project_start_declarations"."exception_reason" IS NULL OR (length("project_start_declarations"."exception_reason") BETWEEN 1 AND 500 AND "project_start_declarations"."exception_reason" = btrim("project_start_declarations"."exception_reason")))
      AND ("project_start_declarations"."completion_due_date" IS NULL OR ("project_start_declarations"."completion_due_date" >= DATE '0001-01-01' AND "project_start_declarations"."completion_due_date" <= DATE '9999-12-31')))
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_preparatory_check";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "lifecycle_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_lifecycle_commands" ADD CONSTRAINT "project_lifecycle_commands_project_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_lifecycle_commands" ADD CONSTRAINT "project_lifecycle_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_lifecycle_commands" ADD CONSTRAINT "project_lifecycle_commands_transition_fk" FOREIGN KEY ("workspace_id","project_id","result_revision") REFERENCES "public"."project_lifecycle_transitions"("workspace_id","project_id","lifecycle_revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_lifecycle_transitions" ADD CONSTRAINT "project_lifecycle_transitions_project_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_lifecycle_transitions" ADD CONSTRAINT "project_lifecycle_transitions_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_start_declarations" ADD CONSTRAINT "project_start_declarations_project_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_start_declarations" ADD CONSTRAINT "project_start_declarations_declared_by_fk" FOREIGN KEY ("workspace_id","declared_by_membership_id","declared_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_start_declarations" ADD CONSTRAINT "project_start_declarations_completion_fk" FOREIGN KEY ("workspace_id","completion_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_lifecycle_commands_actor_key_unique" ON "project_lifecycle_commands" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "project_lifecycle_commands_result_unique" ON "project_lifecycle_commands" USING btree ("workspace_id","project_id","result_revision");--> statement-breakpoint
CREATE UNIQUE INDEX "project_start_declarations_project_unique" ON "project_start_declarations" USING btree ("workspace_id","project_id");--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_document_registrar', 'company_commercial_intake', 'company_project_access') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_service_catalogue', 'company_pricing_configuration', 'company_commercial_activity_reader', 'company_project_approver') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_commercial_activity_reader', 'company_project_approver')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_status_check" CHECK ("projects"."status" IN ('preparatory', 'active', 'on_hold', 'completed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lifecycle_revision_check" CHECK ("projects"."lifecycle_revision" >= 0 AND ("projects"."status" = 'preparatory') = ("projects"."lifecycle_revision" = 0));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lifecycle_responsible_check" CHECK ("projects"."status" NOT IN ('active', 'on_hold') OR "projects"."responsible_membership_id" IS NOT NULL);