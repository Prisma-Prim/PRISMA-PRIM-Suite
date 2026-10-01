ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_profitability_contributor_assignment.granted' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_profitability_contributor_assignment.revoked' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_profitability_director_assignment.granted' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_profitability_director_assignment.revoked' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_profitability_contributor';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_profitability_director';--> statement-breakpoint
CREATE TABLE "profitability_command_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"command_kind" text NOT NULL,
	"request_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profitability_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"estimate_version_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"code" text NOT NULL,
	"decided_by_internal_user_id" uuid NOT NULL,
	"decided_by_workspace_membership_id" uuid NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profitability_decisions_code_check" CHECK ("profitability_decisions"."code" IN ('APPROVE', 'MODIFY', 'REJECT'))
);
--> statement-breakpoint
CREATE TABLE "profitability_direct_cost_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"estimate_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"line_key" text NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(30, 2) NOT NULL,
	CONSTRAINT "profitability_lines_positive_check" CHECK ("profitability_direct_cost_lines"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "profitability_estimate_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"estimate_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"predecessor_version_id" uuid,
	"currency" text NOT NULL,
	"executor_type" text NOT NULL,
	"executor_cost" numeric(30, 2) NOT NULL,
	"fiscal_cost" numeric(30, 2) NOT NULL,
	"allocated_overhead" numeric(30, 2) NOT NULL,
	"target_profitability" text NOT NULL,
	"proposed_price" numeric(30, 2) NOT NULL,
	"pricing_intent" text NOT NULL,
	"strategic_reason" text,
	"cost_complete" text NOT NULL,
	"no_known_duplicate" text NOT NULL,
	"total_cost" numeric(30, 2) NOT NULL,
	"profit" numeric(30, 2) NOT NULL,
	"estimated_profitability" numeric(30, 2) NOT NULL,
	"target_difference" numeric(30, 2) NOT NULL,
	"calculation_rule_id" text NOT NULL,
	"calculation_rule_version" integer NOT NULL,
	"rounding_mode" text NOT NULL,
	"rounding_scale" integer NOT NULL,
	"created_by_internal_user_id" uuid NOT NULL,
	"created_by_workspace_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profitability_versions_fixed_rule_check" CHECK ("profitability_estimate_versions"."calculation_rule_id" = 'CONFIRMED_COST_PROFITABILITY' AND "profitability_estimate_versions"."calculation_rule_version" = 1 AND "profitability_estimate_versions"."rounding_mode" = 'HALF_UP' AND "profitability_estimate_versions"."rounding_scale" = 2),
	CONSTRAINT "profitability_versions_confirmation_check" CHECK ("profitability_estimate_versions"."cost_complete" = 'true' AND "profitability_estimate_versions"."no_known_duplicate" = 'true')
);
--> statement-breakpoint
CREATE TABLE "profitability_estimates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"latest_version_number" integer NOT NULL,
	CONSTRAINT "profitability_estimates_head_check" CHECK ("profitability_estimates"."latest_version_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "profitability_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"action" text NOT NULL,
	"estimate_id" uuid NOT NULL,
	"estimate_version_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "profitability_events_action_check" CHECK ("profitability_events"."action" IN ('profitability_estimate_version.created', 'profitability_estimate_version.decided'))
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "profitability_command_receipts" ADD CONSTRAINT "profitability_receipts_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_command_receipts" ADD CONSTRAINT "profitability_receipts_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_decisions" ADD CONSTRAINT "profitability_decisions_version_fk" FOREIGN KEY ("workspace_id","company_id","estimate_version_id","version_number") REFERENCES "public"."profitability_estimate_versions"("workspace_id","company_id","id","version_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_decisions" ADD CONSTRAINT "profitability_decisions_actor_fk" FOREIGN KEY ("workspace_id","decided_by_workspace_membership_id","decided_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_direct_cost_lines" ADD CONSTRAINT "profitability_lines_version_fk" FOREIGN KEY ("workspace_id","company_id","estimate_version_id") REFERENCES "public"."profitability_estimate_versions"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_estimate_versions" ADD CONSTRAINT "profitability_versions_estimate_fk" FOREIGN KEY ("workspace_id","company_id","estimate_id") REFERENCES "public"."profitability_estimates"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_estimate_versions" ADD CONSTRAINT "profitability_versions_creator_fk" FOREIGN KEY ("workspace_id","created_by_workspace_membership_id","created_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_estimates" ADD CONSTRAINT "profitability_estimates_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_estimates" ADD CONSTRAINT "profitability_estimates_opportunity_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_estimates" ADD CONSTRAINT "profitability_estimates_request_fk" FOREIGN KEY ("workspace_id","company_id","client_request_id") REFERENCES "public"."client_requests"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_events" ADD CONSTRAINT "profitability_events_version_fk" FOREIGN KEY ("workspace_id","company_id","estimate_version_id") REFERENCES "public"."profitability_estimate_versions"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_events" ADD CONSTRAINT "profitability_events_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_receipts_scope_key_unique" ON "profitability_command_receipts" USING btree ("workspace_id","company_id","actor_workspace_membership_id","command_kind","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_decisions_version_unique" ON "profitability_decisions" USING btree ("workspace_id","company_id","estimate_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_lines_position_unique" ON "profitability_direct_cost_lines" USING btree ("workspace_id","company_id","estimate_version_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_lines_key_unique" ON "profitability_direct_cost_lines" USING btree ("workspace_id","company_id","estimate_version_id","line_key");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_versions_scope_id_unique" ON "profitability_estimate_versions" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_versions_scope_id_number_unique" ON "profitability_estimate_versions" USING btree ("workspace_id","company_id","id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_versions_number_unique" ON "profitability_estimate_versions" USING btree ("workspace_id","company_id","estimate_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_estimates_scope_id_unique" ON "profitability_estimates" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_estimates_opportunity_unique" ON "profitability_estimates" USING btree ("workspace_id","company_id","opportunity_id");--> statement-breakpoint
CREATE INDEX "profitability_events_scope_idx" ON "profitability_events" USING btree ("workspace_id","company_id","occurred_at");--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_document_registrar' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_commercial_intake', 'company_project_access') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));