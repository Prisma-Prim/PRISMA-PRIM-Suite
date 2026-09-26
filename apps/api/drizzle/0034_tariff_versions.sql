CREATE TABLE "tariff_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"offering_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"unit" text NOT NULL,
	"unit_amount" numeric(11, 4) NOT NULL,
	"currency" text NOT NULL,
	"tax_rate_percent" numeric(5, 2) NOT NULL,
	"tax_label" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"provenance" text DEFAULT 'ILLUSTRATIVE' NOT NULL,
	"created_by_internal_user_id" uuid NOT NULL,
	"created_by_workspace_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"superseded_by_version_id" uuid,
	"superseded_at" timestamp with time zone,
	"superseded_from" timestamp with time zone,
	CONSTRAINT "tariff_versions_version_number_check" CHECK ("tariff_versions"."version_number" >= 1),
	CONSTRAINT "tariff_versions_unit_check" CHECK (length("tariff_versions"."unit") BETWEEN 1 AND 24 AND length(btrim("tariff_versions"."unit")) > 0),
	CONSTRAINT "tariff_versions_tax_label_check" CHECK (length("tariff_versions"."tax_label") BETWEEN 1 AND 60 AND length(btrim("tariff_versions"."tax_label")) > 0),
	CONSTRAINT "tariff_versions_unit_amount_check" CHECK ("tariff_versions"."unit_amount" > 0),
	CONSTRAINT "tariff_versions_tax_rate_percent_check" CHECK ("tariff_versions"."tax_rate_percent" BETWEEN 0 AND 100),
	CONSTRAINT "tariff_versions_currency_check" CHECK ("tariff_versions"."currency" IN ('MDL', 'EUR', 'RON', 'USD')),
	CONSTRAINT "tariff_versions_window_check" CHECK ("tariff_versions"."effective_to" IS NULL OR "tariff_versions"."effective_to" > "tariff_versions"."effective_from"),
	CONSTRAINT "tariff_versions_provenance_check" CHECK ("tariff_versions"."provenance" = 'ILLUSTRATIVE'),
	CONSTRAINT "tariff_versions_supersession_check" CHECK ((
        ("tariff_versions"."superseded_by_version_id" IS NULL
          AND "tariff_versions"."superseded_at" IS NULL
          AND "tariff_versions"."superseded_from" IS NULL)
        OR
        ("tariff_versions"."superseded_by_version_id" IS NOT NULL
          AND "tariff_versions"."superseded_at" IS NOT NULL
          AND "tariff_versions"."superseded_from" IS NOT NULL
          AND "tariff_versions"."superseded_by_version_id" <> "tariff_versions"."id"
          AND "tariff_versions"."superseded_from" > "tariff_versions"."effective_from")
      ))
);
--> statement-breakpoint
ALTER TABLE "pricing_configuration_events" DROP CONSTRAINT "pricing_configuration_events_action_metadata_check";--> statement-breakpoint
ALTER TABLE "pricing_configuration_commands" ALTER COLUMN "result_pricing_rule_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing_configuration_events" ALTER COLUMN "pricing_rule_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing_configuration_commands" ADD COLUMN "result_tariff_version_id" uuid;--> statement-breakpoint
ALTER TABLE "pricing_configuration_events" ADD COLUMN "tariff_version_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "tariff_versions_company_id_unique" ON "tariff_versions" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "tariff_versions_offering_id_unique" ON "tariff_versions" USING btree ("workspace_id","company_id","offering_id","id");--> statement-breakpoint
ALTER TABLE "tariff_versions" ADD CONSTRAINT "tariff_versions_offering_fk" FOREIGN KEY ("workspace_id","company_id","offering_id") REFERENCES "public"."company_service_offerings"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_versions" ADD CONSTRAINT "tariff_versions_creator_fk" FOREIGN KEY ("workspace_id","created_by_workspace_membership_id","created_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_versions" ADD CONSTRAINT "tariff_versions_successor_fk" FOREIGN KEY ("workspace_id","company_id","offering_id","superseded_by_version_id") REFERENCES "public"."tariff_versions"("workspace_id","company_id","offering_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE UNIQUE INDEX "tariff_versions_number_unique" ON "tariff_versions" USING btree ("workspace_id","company_id","offering_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "tariff_versions_head_unique" ON "tariff_versions" USING btree ("workspace_id","company_id","offering_id") WHERE "tariff_versions"."superseded_by_version_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tariff_versions_successor_unique" ON "tariff_versions" USING btree ("workspace_id","company_id","offering_id","superseded_by_version_id") WHERE "tariff_versions"."superseded_by_version_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing_configuration_commands" ADD CONSTRAINT "pricing_configuration_commands_tariff_version_fk" FOREIGN KEY ("workspace_id","company_id","result_tariff_version_id") REFERENCES "public"."tariff_versions"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_configuration_events" ADD CONSTRAINT "pricing_configuration_events_tariff_version_fk" FOREIGN KEY ("workspace_id","company_id","tariff_version_id") REFERENCES "public"."tariff_versions"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_configuration_commands_tariff_published_unique" ON "pricing_configuration_commands" USING btree ("workspace_id","company_id","result_tariff_version_id") WHERE "pricing_configuration_commands"."outcome" = 'PUBLISHED';--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_configuration_events_tariff_published_unique" ON "pricing_configuration_events" USING btree ("workspace_id","tariff_version_id") WHERE "pricing_configuration_events"."action" = 'tariff_version.published';--> statement-breakpoint
ALTER TABLE "pricing_configuration_commands" ADD CONSTRAINT "pricing_configuration_commands_result_check" CHECK ((
        ("pricing_configuration_commands"."command" = 'pricing_rule_version.publish'
          AND "pricing_configuration_commands"."result_pricing_rule_version_id" IS NOT NULL
          AND "pricing_configuration_commands"."result_tariff_version_id" IS NULL)
        OR
        ("pricing_configuration_commands"."command" = 'tariff_version.publish'
          AND "pricing_configuration_commands"."result_tariff_version_id" IS NOT NULL
          AND "pricing_configuration_commands"."result_pricing_rule_version_id" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "pricing_configuration_events" ADD CONSTRAINT "pricing_configuration_events_reference_check" CHECK ((
        ("pricing_configuration_events"."action" = 'pricing_rule_version.published'
          AND "pricing_configuration_events"."pricing_rule_version_id" IS NOT NULL
          AND "pricing_configuration_events"."tariff_version_id" IS NULL)
        OR
        ("pricing_configuration_events"."action" = 'tariff_version.published'
          AND "pricing_configuration_events"."tariff_version_id" IS NOT NULL
          AND "pricing_configuration_events"."pricing_rule_version_id" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "pricing_configuration_events" ADD CONSTRAINT "pricing_configuration_events_action_metadata_check" CHECK ((
        "pricing_configuration_events"."action" = 'pricing_rule_version.published'
          AND "pricing_configuration_events"."metadata" - 'pricingRuleVersionId' - 'versionNumber' - 'provenance' = '{}'::jsonb
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'pricingRuleVersionId') = 'string'
          AND "pricing_configuration_events"."metadata" ->> 'pricingRuleVersionId' = "pricing_configuration_events"."pricing_rule_version_id"::text
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'versionNumber') = 'number'
          AND jsonb_typeof("pricing_configuration_events"."metadata" -> 'provenance') = 'string'
          AND "pricing_configuration_events"."metadata" ->> 'provenance' = 'ILLUSTRATIVE'
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
      ) IS TRUE);