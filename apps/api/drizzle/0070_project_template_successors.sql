ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_project_template_configuration_assignment.granted' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_project_template_configuration_assignment.revoked' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_project_template_configuration';--> statement-breakpoint
CREATE TABLE "project_template_version_commands" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"version_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"template_key" text NOT NULL,
	"version" integer NOT NULL,
	"source_version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_template_versions_scope_id_unique" UNIQUE("workspace_id","company_id","id"),
	CONSTRAINT "project_template_versions_scope_version_unique" UNIQUE("workspace_id","company_id","template_key","version"),
	CONSTRAINT "project_template_versions_lineage_check" CHECK ("project_template_versions"."template_key" = 'CONSULTING_PREPARATION_ILLUSTRATIVE' AND "project_template_versions"."version" > 1 AND "project_template_versions"."source_version" = "project_template_versions"."version" - 1),
	CONSTRAINT "project_template_versions_snapshot_check" CHECK (jsonb_typeof("project_template_versions"."snapshot") = 'object')
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "project_template_version_commands" ADD CONSTRAINT "project_template_version_commands_version_fk" FOREIGN KEY ("workspace_id","company_id","version_id") REFERENCES "public"."project_template_versions"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_version_commands" ADD CONSTRAINT "project_template_version_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_versions" ADD CONSTRAINT "project_template_versions_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_versions" ADD CONSTRAINT "project_template_versions_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_template_version_commands_actor_key_unique" ON "project_template_version_commands" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));