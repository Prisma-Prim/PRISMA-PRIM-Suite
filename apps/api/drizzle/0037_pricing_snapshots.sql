CREATE TABLE "pricing_snapshot_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"service_definition_id" uuid NOT NULL,
	"service_code" text NOT NULL,
	"service_name" text NOT NULL,
	"offering_id" uuid NOT NULL,
	"commercial_label" text,
	"tariff_version_id" uuid NOT NULL,
	"tariff_version_number" integer NOT NULL,
	"unit" text NOT NULL,
	"unit_amount" numeric(11, 4) NOT NULL,
	"currency" text NOT NULL,
	"tax_rate_percent" numeric(5, 2) NOT NULL,
	"tax_label" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"quantity_input" text NOT NULL,
	"rule_shape" text NOT NULL,
	"raw_line_amount" numeric(28, 7) NOT NULL,
	"line_net" numeric(24, 2) NOT NULL,
	"raw_line_tax" numeric(28, 7) NOT NULL,
	"line_tax" numeric(24, 2) NOT NULL,
	CONSTRAINT "pricing_snapshot_lines_trace_check" CHECK ("pricing_snapshot_lines"."line_number" BETWEEN 1 AND 20
        AND "pricing_snapshot_lines"."tariff_version_number" >= 1
        AND "pricing_snapshot_lines"."rule_shape" = 'UNIT_PRICE_TIMES_QUANTITY'
        AND "pricing_snapshot_lines"."unit_amount" > 0
        AND "pricing_snapshot_lines"."quantity" > 0
        AND "pricing_snapshot_lines"."quantity_input"::numeric = "pricing_snapshot_lines"."quantity"
        AND "pricing_snapshot_lines"."tax_rate_percent" BETWEEN 0 AND 100
        AND "pricing_snapshot_lines"."raw_line_amount" >= 0
        AND "pricing_snapshot_lines"."line_net" >= 0
        AND "pricing_snapshot_lines"."raw_line_tax" >= 0
        AND "pricing_snapshot_lines"."line_tax" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pricing_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"original_client_account_id" uuid,
	"pricing_rule_version_id" uuid NOT NULL,
	"pricing_rule_version_number" integer NOT NULL,
	"rule_shape" text NOT NULL,
	"rounding_mode" text NOT NULL,
	"rounding_scale" integer NOT NULL,
	"tax_application" text NOT NULL,
	"currency" text NOT NULL,
	"subtotal" numeric(24, 2) NOT NULL,
	"tax_total" numeric(24, 2) NOT NULL,
	"total" numeric(24, 2) NOT NULL,
	"calculated_by_internal_user_id" uuid NOT NULL,
	"calculated_by_workspace_membership_id" uuid NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	"committed_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"provenance" text DEFAULT 'ILLUSTRATIVE' NOT NULL,
	CONSTRAINT "pricing_snapshots_trace_check" CHECK ("pricing_snapshots"."version" = 1
        AND "pricing_snapshots"."provenance" = 'ILLUSTRATIVE'
        AND "pricing_snapshots"."rule_shape" = 'UNIT_PRICE_TIMES_QUANTITY'
        AND "pricing_snapshots"."rounding_mode" = 'HALF_UP'
        AND "pricing_snapshots"."rounding_scale" = 2
        AND "pricing_snapshots"."tax_application" = 'PER_LINE'
        AND "pricing_snapshots"."pricing_rule_version_number" >= 1
        AND "pricing_snapshots"."committed_at" >= "pricing_snapshots"."calculated_at"
        AND "pricing_snapshots"."subtotal" >= 0
        AND "pricing_snapshots"."tax_total" >= 0
        AND "pricing_snapshots"."total" = "pricing_snapshots"."subtotal" + "pricing_snapshots"."tax_total")
);
--> statement-breakpoint
ALTER TABLE "pricing_configuration_commands" DROP CONSTRAINT "pricing_configuration_commands_result_check";--> statement-breakpoint
ALTER TABLE "pricing_configuration_events" DROP CONSTRAINT "pricing_configuration_events_reference_check";--> statement-breakpoint
ALTER TABLE "pricing_configuration_events" DROP CONSTRAINT "pricing_configuration_events_action_metadata_check";--> statement-breakpoint
ALTER TABLE "pricing_configuration_commands" ADD COLUMN "result_pricing_snapshot_id" uuid;--> statement-breakpoint
ALTER TABLE "pricing_configuration_events" ADD COLUMN "pricing_snapshot_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "company_service_offerings_scope_id_definition_unique" ON "company_service_offerings" USING btree ("workspace_id","company_id","id","service_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_snapshots_scope_id_unique" ON "pricing_snapshots" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_snapshots_line_trace_unique" ON "pricing_snapshots" USING btree ("workspace_id","company_id","id","currency","rule_shape");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_rule_versions_scope_id_number_unique" ON "pricing_rule_versions" USING btree ("workspace_id","company_id","id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "tariff_versions_offering_id_number_unique" ON "tariff_versions" USING btree ("workspace_id","company_id","offering_id","id","version_number");--> statement-breakpoint
ALTER TABLE "pricing_snapshot_lines" ADD CONSTRAINT "pricing_snapshot_lines_snapshot_fk" FOREIGN KEY ("workspace_id","company_id","snapshot_id","currency","rule_shape") REFERENCES "public"."pricing_snapshots"("workspace_id","company_id","id","currency","rule_shape") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_snapshot_lines" ADD CONSTRAINT "pricing_snapshot_lines_definition_fk" FOREIGN KEY ("workspace_id","service_definition_id") REFERENCES "public"."service_definitions"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_snapshot_lines" ADD CONSTRAINT "pricing_snapshot_lines_offering_definition_fk" FOREIGN KEY ("workspace_id","company_id","offering_id","service_definition_id") REFERENCES "public"."company_service_offerings"("workspace_id","company_id","id","service_definition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_snapshot_lines" ADD CONSTRAINT "pricing_snapshot_lines_tariff_version_fk" FOREIGN KEY ("workspace_id","company_id","offering_id","tariff_version_id","tariff_version_number") REFERENCES "public"."tariff_versions"("workspace_id","company_id","offering_id","id","version_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_snapshots" ADD CONSTRAINT "pricing_snapshots_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_snapshots" ADD CONSTRAINT "pricing_snapshots_opportunity_fk" FOREIGN KEY ("workspace_id","company_id","client_request_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","client_request_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_snapshots" ADD CONSTRAINT "pricing_snapshots_request_fk" FOREIGN KEY ("workspace_id","company_id","client_request_id") REFERENCES "public"."client_requests"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_snapshots" ADD CONSTRAINT "pricing_snapshots_original_client_fk" FOREIGN KEY ("workspace_id","original_client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_snapshots" ADD CONSTRAINT "pricing_snapshots_rule_version_fk" FOREIGN KEY ("workspace_id","company_id","pricing_rule_version_id","pricing_rule_version_number") REFERENCES "public"."pricing_rule_versions"("workspace_id","company_id","id","version_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_snapshots" ADD CONSTRAINT "pricing_snapshots_calculator_fk" FOREIGN KEY ("workspace_id","calculated_by_workspace_membership_id","calculated_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_snapshot_lines_order_unique" ON "pricing_snapshot_lines" USING btree ("workspace_id","company_id","snapshot_id","line_number");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_snapshot_lines_offering_unique" ON "pricing_snapshot_lines" USING btree ("workspace_id","company_id","snapshot_id","offering_id");--> statement-breakpoint
CREATE INDEX "pricing_snapshots_opportunity_newest_index" ON "pricing_snapshots" USING btree ("workspace_id","company_id","opportunity_id","calculated_at","id");--> statement-breakpoint
ALTER TABLE "pricing_configuration_commands" ADD CONSTRAINT "pricing_configuration_commands_snapshot_fk" FOREIGN KEY ("workspace_id","company_id","result_pricing_snapshot_id") REFERENCES "public"."pricing_snapshots"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_configuration_events" ADD CONSTRAINT "pricing_configuration_events_snapshot_fk" FOREIGN KEY ("workspace_id","company_id","pricing_snapshot_id") REFERENCES "public"."pricing_snapshots"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_configuration_commands_snapshot_unique" ON "pricing_configuration_commands" USING btree ("workspace_id","company_id","result_pricing_snapshot_id") WHERE "pricing_configuration_commands"."command" = 'pricing_snapshot.calculate';--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_configuration_events_snapshot_created_unique" ON "pricing_configuration_events" USING btree ("workspace_id","pricing_snapshot_id") WHERE "pricing_configuration_events"."action" = 'pricing_snapshot.created';--> statement-breakpoint
ALTER TABLE "pricing_configuration_commands" ADD CONSTRAINT "pricing_configuration_commands_result_check" CHECK ((
        ("pricing_configuration_commands"."command" = 'pricing_rule_version.publish'
          AND "pricing_configuration_commands"."outcome" IN ('PUBLISHED', 'UNCHANGED')
          AND "pricing_configuration_commands"."result_pricing_rule_version_id" IS NOT NULL
          AND "pricing_configuration_commands"."result_tariff_version_id" IS NULL
          AND "pricing_configuration_commands"."result_pricing_snapshot_id" IS NULL)
        OR
        ("pricing_configuration_commands"."command" = 'tariff_version.publish'
          AND "pricing_configuration_commands"."outcome" IN ('PUBLISHED', 'UNCHANGED')
          AND "pricing_configuration_commands"."result_tariff_version_id" IS NOT NULL
          AND "pricing_configuration_commands"."result_pricing_rule_version_id" IS NULL
          AND "pricing_configuration_commands"."result_pricing_snapshot_id" IS NULL)
        OR
        ("pricing_configuration_commands"."command" = 'pricing_snapshot.calculate'
          AND "pricing_configuration_commands"."outcome" = 'CREATED'
          AND "pricing_configuration_commands"."result_pricing_snapshot_id" IS NOT NULL
          AND "pricing_configuration_commands"."result_pricing_rule_version_id" IS NULL
          AND "pricing_configuration_commands"."result_tariff_version_id" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "pricing_configuration_events" ADD CONSTRAINT "pricing_configuration_events_reference_check" CHECK ((
        ("pricing_configuration_events"."action" = 'pricing_rule_version.published'
          AND "pricing_configuration_events"."pricing_rule_version_id" IS NOT NULL
          AND "pricing_configuration_events"."tariff_version_id" IS NULL
          AND "pricing_configuration_events"."pricing_snapshot_id" IS NULL)
        OR
        ("pricing_configuration_events"."action" = 'tariff_version.published'
          AND "pricing_configuration_events"."tariff_version_id" IS NOT NULL
          AND "pricing_configuration_events"."pricing_rule_version_id" IS NULL
          AND "pricing_configuration_events"."pricing_snapshot_id" IS NULL)
        OR
        ("pricing_configuration_events"."action" = 'pricing_snapshot.created'
          AND "pricing_configuration_events"."pricing_snapshot_id" IS NOT NULL
          AND "pricing_configuration_events"."pricing_rule_version_id" IS NULL
          AND "pricing_configuration_events"."tariff_version_id" IS NULL)
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
          AND "pricing_configuration_events"."metadata" - 'pricingSnapshotId' - 'opportunityId' - 'lineCount' - 'provenance' - 'currency' = '{}'::jsonb
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'pricingSnapshotId') = 'string'
          AND "pricing_configuration_events"."metadata" ->> 'pricingSnapshotId' = "pricing_configuration_events"."pricing_snapshot_id"::text
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'opportunityId') = 'string'
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'lineCount') = 'number'
          AND ("pricing_configuration_events"."metadata" ->> 'lineCount')::integer BETWEEN 1 AND 20
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'provenance') = 'string'
          AND "pricing_configuration_events"."metadata" ->> 'provenance' = 'ILLUSTRATIVE'
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'currency') = 'string'
          AND "pricing_configuration_events"."metadata" ->> 'currency' IN ('MDL', 'EUR', 'RON', 'USD')
      ) IS TRUE);
