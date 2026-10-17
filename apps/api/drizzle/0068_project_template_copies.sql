ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_project_template_user_assignment.granted' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_project_template_user_assignment.revoked' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_project_template_user';--> statement-breakpoint
CREATE TABLE "project_template_instances" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"client_account_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "project_template_instances_snapshot_check" CHECK (jsonb_typeof("project_template_instances"."snapshot") = 'object')
);
--> statement-breakpoint
CREATE TABLE "project_template_task_copies" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "project_template_task_copies_position_check" CHECK ("project_template_task_copies"."position" BETWEEN 0 AND 3)
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
-- Referenced composite unique keys must exist before their foreign keys.
CREATE UNIQUE INDEX "project_template_instances_scope_project_unique" ON "project_template_instances" USING btree ("workspace_id","company_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_project_scope_id_unique" ON "tasks" USING btree ("workspace_id","company_id","project_id","id");--> statement-breakpoint
ALTER TABLE "project_template_instances" ADD CONSTRAINT "project_template_instances_project_fk" FOREIGN KEY ("workspace_id","company_id","client_account_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","client_account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_instances" ADD CONSTRAINT "project_template_instances_actor_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_task_copies" ADD CONSTRAINT "project_template_task_copies_instance_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."project_template_instances"("workspace_id","company_id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_task_copies" ADD CONSTRAINT "project_template_task_copies_task_fk" FOREIGN KEY ("workspace_id","company_id","project_id","task_id") REFERENCES "public"."tasks"("workspace_id","company_id","project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_template_instances_actor_key_unique" ON "project_template_instances" USING btree ("workspace_id","created_by_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "project_template_task_copies_task_unique" ON "project_template_task_copies" USING btree ("workspace_id","company_id","task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_template_task_copies_position_unique" ON "project_template_task_copies" USING btree ("workspace_id","company_id","project_id","position");--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));