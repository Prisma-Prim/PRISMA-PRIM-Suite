ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_offer_preparer_assignment.granted' BEFORE 'company_pricing_adjustment_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_offer_preparer_assignment.revoked' BEFORE 'company_pricing_adjustment_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_offer_preparer' BEFORE 'company_pricing_adjustment';--> statement-breakpoint
CREATE TABLE "offer_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"result_offer_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
CREATE TABLE "offer_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"action" text NOT NULL,
	"offer_id" uuid NOT NULL,
	"offer_version_id" uuid,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "offer_events_target_check" CHECK (("offer_events"."action" = 'offer.created' AND "offer_events"."offer_version_id" IS NULL)
        OR ("offer_events"."action" = 'offer_version.created' AND "offer_events"."offer_version_id" IS NOT NULL)),
	CONSTRAINT "offer_events_metadata_check" CHECK ((CASE
        WHEN jsonb_typeof("offer_events"."metadata") <> 'object' THEN false
        WHEN "offer_events"."action" = 'offer.created' THEN
          "offer_events"."metadata" ?& ARRAY['offerId', 'illustrativeReference', 'provenance']
          AND ("offer_events"."metadata" - ARRAY['offerId', 'illustrativeReference', 'provenance']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'illustrativeReference') = 'number'
          AND "offer_events"."metadata"->>'illustrativeReference' ~ '^[1-9][0-9]*$'
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
        WHEN "offer_events"."action" = 'offer_version.created' THEN
          "offer_events"."metadata" ?& ARRAY['offerId', 'offerVersionId', 'versionNumber', 'pricingSnapshotId', 'recipientKind', 'provenance']
          AND ("offer_events"."metadata" - ARRAY['offerId', 'offerVersionId', 'versionNumber', 'pricingSnapshotId', 'recipientKind', 'provenance']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'versionNumber') = 'number'
          AND "offer_events"."metadata"->>'versionNumber' = '1'
          AND jsonb_typeof("offer_events"."metadata"->'pricingSnapshotId') = 'string'
          AND "offer_events"."metadata"->>'pricingSnapshotId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND "offer_events"."metadata"->>'recipientKind' IN ('PRIMARY', 'ADDITIONAL')
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
        ELSE false
      END) IS TRUE)
);--> statement-breakpoint
CREATE TABLE "offer_reference_counters" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"current_reference" integer NOT NULL,
	CONSTRAINT "offer_reference_counters_positive_check" CHECK ("offer_reference_counters"."current_reference" > 0)
);--> statement-breakpoint
CREATE TABLE "offer_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"original_client_account_id" uuid NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"pricing_snapshot_id" uuid NOT NULL,
	"recipient_client_account_id" uuid NOT NULL,
	"recipient_kind" text NOT NULL,
	"recipient_additional_legal_entity_id" uuid,
	"recipient_legal_name" text NOT NULL,
	"recipient_tax_id" text,
	"recipient_legal_address" text,
	"issuing_company_label" text NOT NULL,
	"validity_days" integer NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"scope_note" text,
	"commercial_conditions" text,
	"decision_state" text DEFAULT 'PENDING' NOT NULL,
	"transmission_state" text DEFAULT 'NOT_TRANSMITTED' NOT NULL,
	"client_response_state" text DEFAULT 'NONE' NOT NULL,
	"provenance" text DEFAULT 'ILLUSTRATIVE' NOT NULL,
	"created_by_internal_user_id" uuid NOT NULL,
	"created_by_workspace_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "offer_versions_initial_state_check" CHECK ("offer_versions"."version_number" = 1
        AND "offer_versions"."decision_state" = 'PENDING'
        AND "offer_versions"."transmission_state" = 'NOT_TRANSMITTED'
        AND "offer_versions"."client_response_state" = 'NONE'
        AND "offer_versions"."provenance" = 'ILLUSTRATIVE'),
	CONSTRAINT "offer_versions_recipient_kind_check" CHECK (("offer_versions"."recipient_kind" = 'PRIMARY' AND "offer_versions"."recipient_additional_legal_entity_id" IS NULL)
        OR ("offer_versions"."recipient_kind" = 'ADDITIONAL' AND "offer_versions"."recipient_additional_legal_entity_id" IS NOT NULL)),
	CONSTRAINT "offer_versions_content_check" CHECK (char_length("offer_versions"."recipient_legal_name") BETWEEN 1 AND 200
        AND ("offer_versions"."recipient_tax_id" IS NULL OR char_length("offer_versions"."recipient_tax_id") BETWEEN 1 AND 500)
        AND ("offer_versions"."recipient_legal_address" IS NULL OR char_length("offer_versions"."recipient_legal_address") BETWEEN 1 AND 2000)
        AND char_length("offer_versions"."issuing_company_label") > 0
        AND "offer_versions"."validity_days" BETWEEN 1 AND 365
        AND "offer_versions"."valid_until" = "offer_versions"."created_at" + ("offer_versions"."validity_days" * interval '24 hours')
        AND ("offer_versions"."scope_note" IS NULL OR char_length("offer_versions"."scope_note") <= 2000)
        AND ("offer_versions"."commercial_conditions" IS NULL OR char_length("offer_versions"."commercial_conditions") <= 4000))
);--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"original_client_account_id" uuid NOT NULL,
	"illustrative_reference" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by_internal_user_id" uuid NOT NULL,
	"created_by_workspace_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "offers_initial_state_check" CHECK ("offers"."illustrative_reference" > 0 AND "offers"."revision" = 1)
);--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
CREATE UNIQUE INDEX "offer_commands_actor_key_unique" ON "offer_commands" USING btree ("workspace_id","company_id","actor_workspace_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_events_offer_created_unique" ON "offer_events" USING btree ("workspace_id","offer_id") WHERE "offer_events"."action" = 'offer.created';--> statement-breakpoint
CREATE UNIQUE INDEX "offer_events_version_created_unique" ON "offer_events" USING btree ("workspace_id","offer_version_id") WHERE "offer_events"."action" = 'offer_version.created';--> statement-breakpoint
CREATE UNIQUE INDEX "offer_reference_counters_company_unique" ON "offer_reference_counters" USING btree ("workspace_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_versions_scope_id_unique" ON "offer_versions" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_versions_number_unique" ON "offer_versions" USING btree ("workspace_id","company_id","offer_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_scope_id_unique" ON "offers" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_complete_identity_unique" ON "offers" USING btree ("workspace_id","company_id","opportunity_id","client_request_id","original_client_account_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_opportunity_unique" ON "offers" USING btree ("workspace_id","company_id","opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_company_reference_unique" ON "offers" USING btree ("workspace_id","company_id","illustrative_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "client_requests_offer_client_unique" ON "client_requests" USING btree ("workspace_id","company_id","id","client_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_snapshots_offer_reference_unique" ON "pricing_snapshots" USING btree ("workspace_id","company_id","opportunity_id","id");--> statement-breakpoint
ALTER TABLE "offer_commands" ADD CONSTRAINT "offer_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_commands" ADD CONSTRAINT "offer_commands_opportunity_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_commands" ADD CONSTRAINT "offer_commands_result_fk" FOREIGN KEY ("workspace_id","company_id","result_offer_id") REFERENCES "public"."offers"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_events" ADD CONSTRAINT "offer_events_offer_fk" FOREIGN KEY ("workspace_id","company_id","offer_id") REFERENCES "public"."offers"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_events" ADD CONSTRAINT "offer_events_version_fk" FOREIGN KEY ("workspace_id","company_id","offer_version_id") REFERENCES "public"."offer_versions"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_events" ADD CONSTRAINT "offer_events_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_reference_counters" ADD CONSTRAINT "offer_reference_counters_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_offer_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id","client_request_id","original_client_account_id","offer_id") REFERENCES "public"."offers"("workspace_id","company_id","opportunity_id","client_request_id","original_client_account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_snapshot_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id","pricing_snapshot_id") REFERENCES "public"."pricing_snapshots"("workspace_id","company_id","opportunity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_recipient_client_fk" FOREIGN KEY ("workspace_id","recipient_client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_additional_entity_fk" FOREIGN KEY ("workspace_id","recipient_client_account_id","recipient_additional_legal_entity_id") REFERENCES "public"."client_legal_entities"("workspace_id","client_account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_creator_fk" FOREIGN KEY ("workspace_id","created_by_workspace_membership_id","created_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_opportunity_fk" FOREIGN KEY ("workspace_id","company_id","client_request_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","client_request_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_request_client_fk" FOREIGN KEY ("workspace_id","company_id","client_request_id","original_client_account_id") REFERENCES "public"."client_requests"("workspace_id","company_id","id","client_account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_original_client_fk" FOREIGN KEY ("workspace_id","original_client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_creator_fk" FOREIGN KEY ("workspace_id","created_by_workspace_membership_id","created_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_document_registrar' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_commercial_intake', 'company_project_access') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
