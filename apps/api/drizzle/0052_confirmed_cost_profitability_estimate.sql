ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_profitability_contributor_assignment.granted' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_profitability_contributor_assignment.revoked' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_profitability_director_assignment.granted' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_profitability_director_assignment.revoked' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_profitability_contributor';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_profitability_director';--> statement-breakpoint
CREATE TABLE "profitability_estimate_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"estimate_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"code" text NOT NULL,
	"decided_by_workspace_membership_id" uuid NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profitability_estimate_decisions_code_check" CHECK ("profitability_estimate_decisions"."code" IN ('APPROVE', 'MODIFY', 'REJECT'))
);
--> statement-breakpoint
CREATE TABLE "profitability_estimate_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"estimate_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "profitability_estimate_events_metadata_check" CHECK ((CASE
      WHEN "profitability_estimate_events"."action" = 'profitability_estimate_version.created' THEN
        "profitability_estimate_events"."metadata" = jsonb_build_object('estimateId', "profitability_estimate_events"."estimate_id"::text, 'versionNumber', "profitability_estimate_events"."version_number")
      WHEN "profitability_estimate_events"."action" = 'profitability_estimate_version.decided' THEN
        "profitability_estimate_events"."metadata"->>'decisionCode' IN ('APPROVE', 'MODIFY', 'REJECT')
        AND "profitability_estimate_events"."metadata" = jsonb_build_object('estimateId', "profitability_estimate_events"."estimate_id"::text, 'versionNumber', "profitability_estimate_events"."version_number", 'decisionCode', "profitability_estimate_events"."metadata"->>'decisionCode')
      ELSE false END) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "profitability_estimate_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"command_kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profitability_estimate_receipts_shape_check" CHECK ("profitability_estimate_receipts"."command_kind" IN ('create', 'decide')
      AND length("profitability_estimate_receipts"."idempotency_key") > 0 AND length("profitability_estimate_receipts"."fingerprint") > 0
      AND jsonb_typeof("profitability_estimate_receipts"."response") = 'object')
);
--> statement-breakpoint
CREATE TABLE "profitability_estimate_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"estimate_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"predecessor_version_id" uuid,
	"predecessor_version_number" integer,
	"inputs" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"calculation_rule" jsonb NOT NULL,
	"created_by_workspace_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profitability_estimate_versions_predecessor_check" CHECK ((
      ("profitability_estimate_versions"."version_number" = 1 AND "profitability_estimate_versions"."predecessor_version_id" IS NULL AND "profitability_estimate_versions"."predecessor_version_number" IS NULL)
      OR ("profitability_estimate_versions"."version_number" > 1 AND "profitability_estimate_versions"."predecessor_version_id" IS NOT NULL
        AND "profitability_estimate_versions"."predecessor_version_number" IS NOT NULL
        AND "profitability_estimate_versions"."predecessor_version_number" = "profitability_estimate_versions"."version_number" - 1)
    )),
	CONSTRAINT "profitability_estimate_versions_payload_check" CHECK (jsonb_typeof("profitability_estimate_versions"."inputs") = 'object'
      AND jsonb_typeof("profitability_estimate_versions"."results") = 'object'
      AND "profitability_estimate_versions"."calculation_rule" = '{"id":"CONFIRMED_COST_PROFITABILITY","version":1,"monetaryScale":2,"percentageScale":2,"rounding":"HALF_UP"}'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "profitability_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"latest_version_number" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profitability_estimates_head_check" CHECK ("profitability_estimates"."latest_version_number" >= 0)
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_estimate_decisions_version_unique" ON "profitability_estimate_decisions" USING btree ("workspace_id","company_id","version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_estimate_events_version_action_unique" ON "profitability_estimate_events" USING btree ("workspace_id","company_id","version_id","action");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_estimate_receipts_actor_key_unique" ON "profitability_estimate_receipts" USING btree ("workspace_id","company_id","actor_workspace_membership_id","command_kind","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_estimate_versions_number_unique" ON "profitability_estimate_versions" USING btree ("workspace_id","company_id","estimate_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_estimate_versions_scope_id_unique" ON "profitability_estimate_versions" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_estimate_versions_opportunity_id_unique" ON "profitability_estimate_versions" USING btree ("workspace_id","company_id","opportunity_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_estimate_versions_identity_unique" ON "profitability_estimate_versions" USING btree ("workspace_id","company_id","estimate_id","opportunity_id","client_request_id","id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_estimate_versions_predecessor_unique" ON "profitability_estimate_versions" USING btree ("workspace_id","company_id","estimate_id","id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_estimates_opportunity_unique" ON "profitability_estimates" USING btree ("workspace_id","company_id","opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_estimates_scope_id_unique" ON "profitability_estimates" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_estimates_identity_unique" ON "profitability_estimates" USING btree ("workspace_id","company_id","opportunity_id","client_request_id","id");--> statement-breakpoint
ALTER TABLE "profitability_estimate_decisions" ADD CONSTRAINT "profitability_estimate_decisions_version_fk" FOREIGN KEY ("workspace_id","company_id","estimate_id","opportunity_id","client_request_id","version_id","version_number") REFERENCES "public"."profitability_estimate_versions"("workspace_id","company_id","estimate_id","opportunity_id","client_request_id","id","version_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_estimate_decisions" ADD CONSTRAINT "profitability_estimate_decisions_actor_fk" FOREIGN KEY ("workspace_id","decided_by_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_estimate_events" ADD CONSTRAINT "profitability_estimate_events_version_fk" FOREIGN KEY ("workspace_id","company_id","estimate_id","opportunity_id","client_request_id","version_id","version_number") REFERENCES "public"."profitability_estimate_versions"("workspace_id","company_id","estimate_id","opportunity_id","client_request_id","id","version_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_estimate_events" ADD CONSTRAINT "profitability_estimate_events_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_estimate_receipts" ADD CONSTRAINT "profitability_estimate_receipts_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_estimate_receipts" ADD CONSTRAINT "profitability_estimate_receipts_opportunity_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_estimate_receipts" ADD CONSTRAINT "profitability_estimate_receipts_version_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id","version_id") REFERENCES "public"."profitability_estimate_versions"("workspace_id","company_id","opportunity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_estimate_versions" ADD CONSTRAINT "profitability_estimate_versions_estimate_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id","client_request_id","estimate_id") REFERENCES "public"."profitability_estimates"("workspace_id","company_id","opportunity_id","client_request_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_estimate_versions" ADD CONSTRAINT "profitability_estimate_versions_predecessor_fk" FOREIGN KEY ("workspace_id","company_id","estimate_id","predecessor_version_id","predecessor_version_number") REFERENCES "public"."profitability_estimate_versions"("workspace_id","company_id","estimate_id","id","version_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_estimate_versions" ADD CONSTRAINT "profitability_estimate_versions_creator_fk" FOREIGN KEY ("workspace_id","created_by_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_estimates" ADD CONSTRAINT "profitability_estimates_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_estimates" ADD CONSTRAINT "profitability_estimates_opportunity_fk" FOREIGN KEY ("workspace_id","company_id","client_request_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","client_request_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
--> statement-breakpoint
-- Frozen history, decisions, receipts and private events are append-only.
CREATE FUNCTION profitability_estimate_refuse_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Profitability history is immutable.' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER profitability_versions_immutable
BEFORE UPDATE OR DELETE ON profitability_estimate_versions
FOR EACH ROW EXECUTE FUNCTION profitability_estimate_refuse_mutation();
--> statement-breakpoint
CREATE TRIGGER profitability_decisions_immutable
BEFORE UPDATE OR DELETE ON profitability_estimate_decisions
FOR EACH ROW EXECUTE FUNCTION profitability_estimate_refuse_mutation();
--> statement-breakpoint
CREATE TRIGGER profitability_receipts_immutable
BEFORE UPDATE OR DELETE ON profitability_estimate_receipts
FOR EACH ROW EXECUTE FUNCTION profitability_estimate_refuse_mutation();
--> statement-breakpoint
CREATE TRIGGER profitability_events_immutable
BEFORE UPDATE OR DELETE ON profitability_estimate_events
FOR EACH ROW EXECUTE FUNCTION profitability_estimate_refuse_mutation();
--> statement-breakpoint
-- Identity may only advance its append head by exactly one.
CREATE FUNCTION profitability_estimate_protect_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Profitability identity is immutable.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.latest_version_number <> 0 THEN
      RAISE EXCEPTION 'Profitability identity requires initial head zero.' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF (to_jsonb(NEW) - 'latest_version_number') IS DISTINCT FROM
       (to_jsonb(OLD) - 'latest_version_number')
       OR NEW.latest_version_number::bigint <> OLD.latest_version_number::bigint + 1 THEN
      RAISE EXCEPTION 'Profitability identity only permits the next head.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER profitability_estimates_identity_guard
BEFORE INSERT OR UPDATE OR DELETE ON profitability_estimates
FOR EACH ROW EXECUTE FUNCTION profitability_estimate_protect_identity();
--> statement-breakpoint
-- The initial zero and record/head write ordering are transaction-local only.
-- Deferred checks inspect the final committed head and full version chain.
CREATE FUNCTION profitability_estimate_check_committed_head() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  affected_estimate_id uuid;
  valid_head boolean;
BEGIN
  IF TG_TABLE_NAME = 'profitability_estimates' THEN
    affected_estimate_id := NEW.id;
  ELSE
    affected_estimate_id := NEW.estimate_id;
  END IF;
  SELECT e.latest_version_number > 0
    AND e.latest_version_number = (
      SELECT max(v.version_number) FROM profitability_estimate_versions v
      WHERE v.workspace_id = e.workspace_id AND v.company_id = e.company_id
        AND v.estimate_id = e.id
    )
    INTO valid_head FROM profitability_estimates e WHERE e.id = affected_estimate_id;
  IF valid_head IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Profitability head must name its latest immutable version.' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER profitability_estimates_committed_head
AFTER INSERT OR UPDATE ON profitability_estimates
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION profitability_estimate_check_committed_head();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER profitability_versions_committed_head
AFTER INSERT ON profitability_estimate_versions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION profitability_estimate_check_committed_head();
