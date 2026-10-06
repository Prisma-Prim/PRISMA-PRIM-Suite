ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_contract_preparer_assignment.granted' BEFORE 'company_offer_approver_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_contract_preparer_assignment.revoked' BEFORE 'company_offer_approver_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_contract_preparer' BEFORE 'company_offer_approver';--> statement-breakpoint
CREATE TABLE "contract_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"result_contract_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"action" text NOT NULL,
	"contract_id" uuid NOT NULL,
	"contract_version_id" uuid,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "contract_events_target_check" CHECK (("contract_events"."action" = 'contract.created' AND "contract_events"."contract_version_id" IS NULL) OR ("contract_events"."action" = 'contract_version.created' AND "contract_events"."contract_version_id" IS NOT NULL)),
	CONSTRAINT "contract_events_metadata_check" CHECK ((jsonb_typeof("contract_events"."metadata") = 'object' AND ("contract_events"."metadata" - ARRAY['contractId','contractVersionId','versionNumber','illustrativeReference','kind','origin','offerVersionId','pricingSnapshotId','provenance']::text[]) = '{}'::jsonb AND "contract_events"."metadata"->>'contractId' = "contract_events"."contract_id"::text AND "contract_events"."metadata"->>'kind' = 'CONTRACT' AND "contract_events"."metadata"->>'origin' = 'ACCEPTED_OFFER' AND "contract_events"."metadata"->>'provenance' = 'ILLUSTRATIVE') IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "contract_reference_counters" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"current_reference" integer NOT NULL,
	CONSTRAINT "contract_reference_counters_check" CHECK ("contract_reference_counters"."kind" = 'CONTRACT' AND "contract_reference_counters"."current_reference" > 0)
);
--> statement-breakpoint
CREATE TABLE "contract_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"pricing_snapshot_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"recipient_client_account_id" uuid NOT NULL,
	"recipient_kind" text NOT NULL,
	"recipient_additional_legal_entity_id" uuid,
	"recipient_legal_name" text NOT NULL,
	"recipient_tax_id" text,
	"recipient_legal_address" text,
	"issuing_company_label" text NOT NULL,
	"scope_note" text,
	"commercial_conditions" text,
	"term_starts_on" date,
	"term_ends_on" date,
	"special_conditions" text,
	"decision_state" text DEFAULT 'PENDING' NOT NULL,
	"execution_state" text DEFAULT 'NOT_EXECUTED' NOT NULL,
	"provenance" text DEFAULT 'ILLUSTRATIVE' NOT NULL,
	"created_by_internal_user_id" uuid NOT NULL,
	"created_by_workspace_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "contract_versions_initial_check" CHECK ("contract_versions"."version_number" = 1 AND "contract_versions"."decision_state" = 'PENDING' AND "contract_versions"."execution_state" = 'NOT_EXECUTED' AND "contract_versions"."provenance" = 'ILLUSTRATIVE'),
	CONSTRAINT "contract_versions_entity_check" CHECK (("contract_versions"."recipient_kind" = 'PRIMARY' AND "contract_versions"."recipient_additional_legal_entity_id" IS NULL) OR ("contract_versions"."recipient_kind" = 'ADDITIONAL' AND "contract_versions"."recipient_additional_legal_entity_id" IS NOT NULL)),
	CONSTRAINT "contract_versions_content_check" CHECK (char_length("contract_versions"."recipient_legal_name") BETWEEN 1 AND 200 AND char_length("contract_versions"."issuing_company_label") > 0 AND ("contract_versions"."scope_note" IS NULL OR char_length("contract_versions"."scope_note") <= 2000) AND ("contract_versions"."commercial_conditions" IS NULL OR char_length("contract_versions"."commercial_conditions") <= 4000) AND ("contract_versions"."special_conditions" IS NULL OR char_length("contract_versions"."special_conditions") <= 4000) AND ("contract_versions"."term_starts_on" IS NULL OR "contract_versions"."term_ends_on" IS NULL OR "contract_versions"."term_ends_on" >= "contract_versions"."term_starts_on"))
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"original_client_account_id" uuid NOT NULL,
	"kind" text DEFAULT 'CONTRACT' NOT NULL,
	"origin" text DEFAULT 'ACCEPTED_OFFER' NOT NULL,
	"source_offer_id" uuid NOT NULL,
	"source_offer_version_id" uuid NOT NULL,
	"illustrative_reference" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by_internal_user_id" uuid NOT NULL,
	"created_by_workspace_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "contracts_initial_check" CHECK ("contracts"."kind" = 'CONTRACT' AND "contracts"."origin" = 'ACCEPTED_OFFER' AND "contracts"."revision" = 1 AND "contracts"."illustrative_reference" > 0)
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
CREATE UNIQUE INDEX "contract_commands_actor_key_unique" ON "contract_commands" USING btree ("workspace_id","company_id","actor_workspace_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_events_created_unique" ON "contract_events" USING btree ("workspace_id","contract_id") WHERE "contract_events"."action" = 'contract.created';--> statement-breakpoint
CREATE UNIQUE INDEX "contract_events_version_created_unique" ON "contract_events" USING btree ("workspace_id","contract_version_id") WHERE "contract_events"."action" = 'contract_version.created';--> statement-breakpoint
CREATE UNIQUE INDEX "contract_reference_counters_scope_unique" ON "contract_reference_counters" USING btree ("workspace_id","company_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_versions_scope_unique" ON "contract_versions" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_versions_number_unique" ON "contract_versions" USING btree ("workspace_id","company_id","contract_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_scope_unique" ON "contracts" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_opportunity_identity_unique" ON "contracts" USING btree ("workspace_id","company_id","opportunity_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_opportunity_unique" ON "contracts" USING btree ("workspace_id","company_id","opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_reference_unique" ON "contracts" USING btree ("workspace_id","company_id","kind","illustrative_reference");--> statement-breakpoint
ALTER TABLE "contract_commands" ADD CONSTRAINT "contract_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_commands" ADD CONSTRAINT "contract_commands_result_fk" FOREIGN KEY ("workspace_id","company_id","result_contract_id") REFERENCES "public"."contracts"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_commands" ADD CONSTRAINT "contract_commands_opportunity_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_contract_fk" FOREIGN KEY ("workspace_id","company_id","contract_id") REFERENCES "public"."contracts"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_version_fk" FOREIGN KEY ("workspace_id","company_id","contract_version_id") REFERENCES "public"."contract_versions"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_reference_counters" ADD CONSTRAINT "contract_reference_counters_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_contract_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id","contract_id") REFERENCES "public"."contracts"("workspace_id","company_id","opportunity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_snapshot_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id","pricing_snapshot_id") REFERENCES "public"."pricing_snapshots"("workspace_id","company_id","opportunity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_client_fk" FOREIGN KEY ("workspace_id","recipient_client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_entity_fk" FOREIGN KEY ("workspace_id","recipient_client_account_id","recipient_additional_legal_entity_id") REFERENCES "public"."client_legal_entities"("workspace_id","client_account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_creator_fk" FOREIGN KEY ("workspace_id","created_by_workspace_membership_id","created_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_opportunity_fk" FOREIGN KEY ("workspace_id","company_id","client_request_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","client_request_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_offer_identity_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id","client_request_id","original_client_account_id","source_offer_id") REFERENCES "public"."offers"("workspace_id","company_id","opportunity_id","client_request_id","original_client_account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_offer_version_fk" FOREIGN KEY ("workspace_id","company_id","source_offer_id","source_offer_version_id") REFERENCES "public"."offer_versions"("workspace_id","company_id","offer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_creator_fk" FOREIGN KEY ("workspace_id","created_by_workspace_membership_id","created_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_document_registrar' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_commercial_intake' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_project_access' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
--> statement-breakpoint
CREATE FUNCTION guard_c1_immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Immutable illustrative Contract record' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contracts_immutable BEFORE UPDATE OR DELETE ON contracts FOR EACH ROW EXECUTE FUNCTION guard_c1_immutable_record();
--> statement-breakpoint
CREATE TRIGGER contract_versions_immutable BEFORE UPDATE OR DELETE ON contract_versions FOR EACH ROW EXECUTE FUNCTION guard_c1_immutable_record();
--> statement-breakpoint
CREATE TRIGGER contract_commands_immutable BEFORE UPDATE OR DELETE ON contract_commands FOR EACH ROW EXECUTE FUNCTION guard_c1_immutable_record();
--> statement-breakpoint
CREATE TRIGGER contract_events_immutable BEFORE UPDATE OR DELETE ON contract_events FOR EACH ROW EXECUTE FUNCTION guard_c1_immutable_record();
