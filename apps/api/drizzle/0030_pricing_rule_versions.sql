ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_pricing_configuration_assignment.granted' BEFORE 'company_commercial_activity_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_pricing_configuration_assignment.revoked' BEFORE 'company_commercial_activity_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_pricing_configuration' BEFORE 'company_commercial_activity_reader';--> statement-breakpoint
CREATE TABLE "pricing_configuration_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"command" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"outcome" text NOT NULL,
	"result_pricing_rule_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_configuration_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"action" text NOT NULL,
	"pricing_rule_version_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "pricing_configuration_events_action_metadata_check" CHECK ((
        "pricing_configuration_events"."action" = 'pricing_rule_version.published'
          AND "pricing_configuration_events"."metadata" - 'pricingRuleVersionId' - 'versionNumber' - 'provenance' = '{}'::jsonb
          AND "pricing_configuration_events"."metadata" ->> 'pricingRuleVersionId' = "pricing_configuration_events"."pricing_rule_version_id"::text
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'versionNumber') = 'number'
          AND "pricing_configuration_events"."metadata" ->> 'provenance' = 'ILLUSTRATIVE'
      ))
);
--> statement-breakpoint
CREATE TABLE "pricing_rule_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"label" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"rule_shape" text DEFAULT 'UNIT_PRICE_TIMES_QUANTITY' NOT NULL,
	"rounding_mode" text DEFAULT 'HALF_UP' NOT NULL,
	"rounding_scale" integer DEFAULT 2 NOT NULL,
	"tax_application" text DEFAULT 'PER_LINE' NOT NULL,
	"provenance" text DEFAULT 'ILLUSTRATIVE' NOT NULL,
	"created_by_internal_user_id" uuid NOT NULL,
	"created_by_workspace_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"superseded_by_version_id" uuid,
	"superseded_at" timestamp with time zone,
	"superseded_from" timestamp with time zone,
	CONSTRAINT "pricing_rule_versions_version_number_check" CHECK ("pricing_rule_versions"."version_number" >= 1),
	CONSTRAINT "pricing_rule_versions_label_check" CHECK (length("pricing_rule_versions"."label") BETWEEN 1 AND 120 AND length(btrim("pricing_rule_versions"."label")) > 0),
	CONSTRAINT "pricing_rule_versions_window_check" CHECK ("pricing_rule_versions"."effective_to" IS NULL OR "pricing_rule_versions"."effective_to" > "pricing_rule_versions"."effective_from"),
	CONSTRAINT "pricing_rule_versions_rule_check" CHECK ("pricing_rule_versions"."rule_shape" = 'UNIT_PRICE_TIMES_QUANTITY'
        AND "pricing_rule_versions"."rounding_mode" = 'HALF_UP'
        AND "pricing_rule_versions"."rounding_scale" = 2
        AND "pricing_rule_versions"."tax_application" = 'PER_LINE'),
	CONSTRAINT "pricing_rule_versions_provenance_check" CHECK ("pricing_rule_versions"."provenance" = 'ILLUSTRATIVE'),
	CONSTRAINT "pricing_rule_versions_supersession_check" CHECK ((
        ("pricing_rule_versions"."superseded_by_version_id" IS NULL
          AND "pricing_rule_versions"."superseded_at" IS NULL
          AND "pricing_rule_versions"."superseded_from" IS NULL)
        OR
        ("pricing_rule_versions"."superseded_by_version_id" IS NOT NULL
          AND "pricing_rule_versions"."superseded_at" IS NOT NULL
          AND "pricing_rule_versions"."superseded_from" IS NOT NULL
          AND "pricing_rule_versions"."superseded_by_version_id" <> "pricing_rule_versions"."id"
          AND "pricing_rule_versions"."superseded_from" > "pricing_rule_versions"."effective_from")
      ))
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_rule_versions_scope_id_unique" ON "pricing_rule_versions" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
ALTER TABLE "pricing_configuration_commands" ADD CONSTRAINT "pricing_configuration_commands_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_configuration_commands" ADD CONSTRAINT "pricing_configuration_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_configuration_commands" ADD CONSTRAINT "pricing_configuration_commands_rule_version_fk" FOREIGN KEY ("workspace_id","company_id","result_pricing_rule_version_id") REFERENCES "public"."pricing_rule_versions"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_configuration_events" ADD CONSTRAINT "pricing_configuration_events_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_configuration_events" ADD CONSTRAINT "pricing_configuration_events_rule_version_fk" FOREIGN KEY ("workspace_id","company_id","pricing_rule_version_id") REFERENCES "public"."pricing_rule_versions"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_configuration_events" ADD CONSTRAINT "pricing_configuration_events_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rule_versions" ADD CONSTRAINT "pricing_rule_versions_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rule_versions" ADD CONSTRAINT "pricing_rule_versions_creator_fk" FOREIGN KEY ("workspace_id","created_by_workspace_membership_id","created_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rule_versions" ADD CONSTRAINT "pricing_rule_versions_successor_fk" FOREIGN KEY ("workspace_id","company_id","superseded_by_version_id") REFERENCES "public"."pricing_rule_versions"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_configuration_commands_actor_key_unique" ON "pricing_configuration_commands" USING btree ("workspace_id","company_id","actor_workspace_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_configuration_commands_published_unique" ON "pricing_configuration_commands" USING btree ("workspace_id","company_id","result_pricing_rule_version_id") WHERE "pricing_configuration_commands"."outcome" = 'PUBLISHED';--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_configuration_events_rule_published_unique" ON "pricing_configuration_events" USING btree ("workspace_id","pricing_rule_version_id") WHERE "pricing_configuration_events"."action" = 'pricing_rule_version.published';--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_rule_versions_number_unique" ON "pricing_rule_versions" USING btree ("workspace_id","company_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_rule_versions_head_unique" ON "pricing_rule_versions" USING btree ("workspace_id","company_id") WHERE "pricing_rule_versions"."superseded_by_version_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_rule_versions_successor_unique" ON "pricing_rule_versions" USING btree ("workspace_id","company_id","superseded_by_version_id") WHERE "pricing_rule_versions"."superseded_by_version_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_document_registrar', 'company_commercial_intake') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_project_access', 'company_service_catalogue', 'company_pricing_configuration', 'company_commercial_activity_reader') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_commercial_activity_reader')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));