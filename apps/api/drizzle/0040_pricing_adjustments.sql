ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_pricing_adjustment_assignment.granted' BEFORE 'company_commercial_activity_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_pricing_adjustment_assignment.revoked' BEFORE 'company_commercial_activity_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_pricing_adjustment' BEFORE 'company_commercial_activity_reader';--> statement-breakpoint
CREATE TABLE "pricing_snapshot_adjustments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"snapshot_line_id" uuid NOT NULL,
	"type" text NOT NULL,
	"net_reduction" numeric(24, 2) NOT NULL,
	"reason" text NOT NULL,
	"original_line_net" numeric(24, 2) NOT NULL,
	"original_raw_line_tax" numeric(28, 7) NOT NULL,
	"original_line_tax" numeric(24, 2) NOT NULL,
	"tax_rate_percent" numeric(5, 2) NOT NULL,
	"adjusted_line_net" numeric(24, 2) NOT NULL,
	"adjusted_raw_line_tax" numeric(28, 7) NOT NULL,
	"adjusted_line_tax" numeric(24, 2) NOT NULL,
	"tax_reduction" numeric(24, 2) NOT NULL,
	"applied_by_internal_user_id" uuid NOT NULL,
	"applied_by_workspace_membership_id" uuid NOT NULL,
	"applied_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pricing_snapshot_adjustments_trace_check" CHECK ("pricing_snapshot_adjustments"."type" = 'FIXED_NET_DISCOUNT'
        AND "pricing_snapshot_adjustments"."net_reduction" > 0
        AND char_length("pricing_snapshot_adjustments"."reason") BETWEEN 1 AND 500
        AND "pricing_snapshot_adjustments"."reason" ~ '[^[:space:]]'
        AND "pricing_snapshot_adjustments"."net_reduction" <= "pricing_snapshot_adjustments"."original_line_net"
        AND "pricing_snapshot_adjustments"."original_raw_line_tax" = "pricing_snapshot_adjustments"."original_line_net" * "pricing_snapshot_adjustments"."tax_rate_percent" / 100
        AND "pricing_snapshot_adjustments"."original_line_tax" = round("pricing_snapshot_adjustments"."original_raw_line_tax", 2)
        AND "pricing_snapshot_adjustments"."adjusted_line_net" = "pricing_snapshot_adjustments"."original_line_net" - "pricing_snapshot_adjustments"."net_reduction"
        AND "pricing_snapshot_adjustments"."adjusted_raw_line_tax" = "pricing_snapshot_adjustments"."adjusted_line_net" * "pricing_snapshot_adjustments"."tax_rate_percent" / 100
        AND "pricing_snapshot_adjustments"."adjusted_line_tax" = round("pricing_snapshot_adjustments"."adjusted_raw_line_tax", 2)
        AND "pricing_snapshot_adjustments"."tax_reduction" = "pricing_snapshot_adjustments"."original_line_tax" - "pricing_snapshot_adjustments"."adjusted_line_tax"
        AND "pricing_snapshot_adjustments"."tax_reduction" >= 0)
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "pricing_configuration_events" DROP CONSTRAINT "pricing_configuration_events_action_metadata_check";--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_snapshot_lines_adjustment_target_unique" ON "pricing_snapshot_lines" USING btree ("workspace_id","company_id","snapshot_id","id","line_net","raw_line_tax","line_tax","tax_rate_percent");--> statement-breakpoint
ALTER TABLE "pricing_snapshot_adjustments" ADD CONSTRAINT "pricing_snapshot_adjustments_line_fk" FOREIGN KEY ("workspace_id","company_id","snapshot_id","snapshot_line_id","original_line_net","original_raw_line_tax","original_line_tax","tax_rate_percent") REFERENCES "public"."pricing_snapshot_lines"("workspace_id","company_id","snapshot_id","id","line_net","raw_line_tax","line_tax","tax_rate_percent") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_snapshot_adjustments" ADD CONSTRAINT "pricing_snapshot_adjustments_actor_fk" FOREIGN KEY ("workspace_id","applied_by_workspace_membership_id","applied_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_snapshot_adjustments_line_unique" ON "pricing_snapshot_adjustments" USING btree ("workspace_id","company_id","snapshot_id","snapshot_line_id");--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_document_registrar' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_commercial_intake', 'company_project_access') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_commercial_activity_reader', 'company_project_approver') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_commercial_activity_reader', 'company_project_approver')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "pricing_configuration_events" ADD CONSTRAINT "pricing_configuration_events_action_metadata_check" CHECK ((
        "pricing_configuration_events"."action" = 'pricing_rule_version.published'
          AND "pricing_configuration_events"."metadata" - 'pricingRuleVersionId' - 'versionNumber' - 'provenance' = '{}'::jsonb
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'pricingRuleVersionId') = 'string'
          AND "pricing_configuration_events"."metadata" ->> 'pricingRuleVersionId' = "pricing_configuration_events"."pricing_rule_version_id"::text
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'versionNumber') = 'number'
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'provenance') = 'string'
          AND "pricing_configuration_events"."metadata" ->> 'provenance' = 'ILLUSTRATIVE'
          AND "pricing_configuration_events"."pricing_snapshot_id" IS NULL
      ) IS TRUE
      OR (
        "pricing_configuration_events"."action" = 'tariff_version.published'
          AND "pricing_configuration_events"."metadata" - 'tariffVersionId' - 'offeringId' - 'versionNumber' - 'provenance' - 'currency' = '{}'::jsonb
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'tariffVersionId') = 'string'
          AND "pricing_configuration_events"."metadata" ->> 'tariffVersionId' = "pricing_configuration_events"."tariff_version_id"::text
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'offeringId') = 'string'
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'versionNumber') = 'number'
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'provenance') = 'string'
          AND "pricing_configuration_events"."metadata" ->> 'provenance' = 'ILLUSTRATIVE'
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'currency') = 'string'
          AND "pricing_configuration_events"."metadata" ->> 'currency' IN ('MDL', 'EUR', 'RON', 'USD')
          AND "pricing_configuration_events"."pricing_snapshot_id" IS NULL
      ) IS TRUE
      OR (
        "pricing_configuration_events"."action" = 'pricing_snapshot.created'
          AND "pricing_configuration_events"."metadata" - 'pricingSnapshotId' - 'opportunityId' - 'lineCount' - 'adjustmentCount' - 'provenance' - 'currency' = '{}'::jsonb
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'pricingSnapshotId') = 'string'
          AND "pricing_configuration_events"."metadata" ->> 'pricingSnapshotId' = "pricing_configuration_events"."pricing_snapshot_id"::text
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'opportunityId') = 'string'
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'lineCount') = 'number'
          AND ("pricing_configuration_events"."metadata" ->> 'lineCount')::integer BETWEEN 1 AND 20
          AND (
            NOT ("pricing_configuration_events"."metadata" ? 'adjustmentCount')
            OR (
              jsonb_typeof("pricing_configuration_events"."metadata" -> 'adjustmentCount') = 'number'
              AND "pricing_configuration_events"."metadata" ->> 'adjustmentCount' ~ '^(0|[1-9][0-9]*)$'
              AND ("pricing_configuration_events"."metadata" ->> 'adjustmentCount')::integer BETWEEN 0 AND 20
            )
          )
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'provenance') = 'string'
          AND "pricing_configuration_events"."metadata" ->> 'provenance' = 'ILLUSTRATIVE'
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'currency') = 'string'
          AND "pricing_configuration_events"."metadata" ->> 'currency' IN ('MDL', 'EUR', 'RON', 'USD')
      ) IS TRUE);
