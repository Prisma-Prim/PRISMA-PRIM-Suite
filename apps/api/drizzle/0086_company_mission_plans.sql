ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_mission_plan_configuration_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_mission_plan_configuration_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_mission_plan_user_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_mission_plan_user_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_mission_plan_configuration';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_mission_plan_user';--> statement-breakpoint
CREATE TABLE "mission_plan_activities" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"activity_key" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"activity" text NOT NULL,
	"intended_result" text NOT NULL,
	CONSTRAINT "mission_plan_activities_version_id_activity_key_pk" PRIMARY KEY("version_id","activity_key"),
	CONSTRAINT "mpa_exact_row" UNIQUE("workspace_id","company_id","version_id","activity_key","position"),
	CONSTRAINT "mpa_content_check" CHECK ("mission_plan_activities"."position" BETWEEN 0 AND 49 AND char_length("mission_plan_activities"."title") BETWEEN 1 AND 200 AND "mission_plan_activities"."title"=btrim("mission_plan_activities"."title") AND char_length("mission_plan_activities"."activity") BETWEEN 1 AND 2000 AND char_length(btrim("mission_plan_activities"."activity"))>0 AND char_length("mission_plan_activities"."intended_result") BETWEEN 1 AND 2000 AND char_length(btrim("mission_plan_activities"."intended_result"))>0)
);
--> statement-breakpoint
CREATE TABLE "mission_plan_commands" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"version_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mission_plan_instances" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"client_account_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	CONSTRAINT "mpi_project_version" UNIQUE("workspace_id","company_id","project_id","version_id")
);
--> statement-breakpoint
CREATE TABLE "mission_plan_task_copies" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"activity_key" uuid NOT NULL,
	"position" integer NOT NULL,
	"task_id" uuid NOT NULL,
	CONSTRAINT "mptc_position_check" CHECK ("mission_plan_task_copies"."position" BETWEEN 0 AND 49)
);
--> statement-breakpoint
CREATE TABLE "mission_plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"title" text NOT NULL,
	"activity_count" integer NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mpv_scope_id" UNIQUE("workspace_id","company_id","id"),
	CONSTRAINT "mpv_scope_plan_id" UNIQUE("workspace_id","company_id","plan_id","id"),
	CONSTRAINT "mpv_content_check" CHECK ("mission_plan_versions"."version_number">=1 AND "mission_plan_versions"."activity_count" BETWEEN 1 AND 50 AND char_length("mission_plan_versions"."title") BETWEEN 1 AND 200 AND "mission_plan_versions"."title"=btrim("mission_plan_versions"."title"))
);
--> statement-breakpoint
CREATE TABLE "mission_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mp_scope_id" UNIQUE("workspace_id","company_id","id")
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "mission_plan_activities" ADD CONSTRAINT "mpa_version_fk" FOREIGN KEY ("workspace_id","company_id","version_id") REFERENCES "public"."mission_plan_versions"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_plan_commands" ADD CONSTRAINT "mpcmd_version_fk" FOREIGN KEY ("workspace_id","company_id","version_id") REFERENCES "public"."mission_plan_versions"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_plan_commands" ADD CONSTRAINT "mpcmd_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_plan_instances" ADD CONSTRAINT "mpi_project_fk" FOREIGN KEY ("workspace_id","company_id","client_account_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","client_account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_plan_instances" ADD CONSTRAINT "mpi_source_fk" FOREIGN KEY ("workspace_id","company_id","plan_id","version_id") REFERENCES "public"."mission_plan_versions"("workspace_id","company_id","plan_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_plan_instances" ADD CONSTRAINT "mpi_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_plan_task_copies" ADD CONSTRAINT "mptc_instance_fk" FOREIGN KEY ("workspace_id","company_id","project_id","version_id") REFERENCES "public"."mission_plan_instances"("workspace_id","company_id","project_id","version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_plan_task_copies" ADD CONSTRAINT "mptc_source_row_fk" FOREIGN KEY ("workspace_id","company_id","version_id","activity_key","position") REFERENCES "public"."mission_plan_activities"("workspace_id","company_id","version_id","activity_key","position") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_plan_task_copies" ADD CONSTRAINT "mptc_task_fk" FOREIGN KEY ("workspace_id","company_id","project_id","task_id") REFERENCES "public"."tasks"("workspace_id","company_id","project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_plan_versions" ADD CONSTRAINT "mpv_plan_fk" FOREIGN KEY ("workspace_id","company_id","plan_id") REFERENCES "public"."mission_plans"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_plan_versions" ADD CONSTRAINT "mpv_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_plans" ADD CONSTRAINT "mp_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mpa_version_position" ON "mission_plan_activities" USING btree ("workspace_id","company_id","version_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "mpcmd_actor_key" ON "mission_plan_commands" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "mpcmd_exact_version" ON "mission_plan_commands" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mpi_actor_key" ON "mission_plan_instances" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "mptc_position" ON "mission_plan_task_copies" USING btree ("workspace_id","company_id","project_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "mptc_activity" ON "mission_plan_task_copies" USING btree ("workspace_id","company_id","project_id","activity_key");--> statement-breakpoint
CREATE UNIQUE INDEX "mptc_task" ON "mission_plan_task_copies" USING btree ("workspace_id","company_id","task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mpv_plan_number" ON "mission_plan_versions" USING btree ("workspace_id","company_id","plan_id","version_number");--> statement-breakpoint
CREATE INDEX "mp_catalogue" ON "mission_plans" USING btree ("workspace_id","company_id","created_at","id");--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text = 'company_offer_preparer' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_contract_preparer' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_contract_approver' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_offer_approver' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_project_template_user' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_contract_early_preparation', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
--> statement-breakpoint
-- Publications and copies are append-only. The selected source remains its own
-- immutable Version; no current-head lookup or second mutable snapshot exists.
CREATE FUNCTION mp_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Mission-plan source, receipt and copy rows are immutable' USING ERRCODE='23514';
END; $$;
--> statement-breakpoint
CREATE TRIGGER mp_immutable BEFORE UPDATE OR DELETE ON mission_plans FOR EACH ROW EXECUTE FUNCTION mp_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER mpv_immutable BEFORE UPDATE OR DELETE ON mission_plan_versions FOR EACH ROW EXECUTE FUNCTION mp_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER mpa_immutable BEFORE UPDATE OR DELETE ON mission_plan_activities FOR EACH ROW EXECUTE FUNCTION mp_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER mpcmd_immutable BEFORE UPDATE OR DELETE ON mission_plan_commands FOR EACH ROW EXECUTE FUNCTION mp_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER mpi_immutable BEFORE UPDATE OR DELETE ON mission_plan_instances FOR EACH ROW EXECUTE FUNCTION mp_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER mptc_immutable BEFORE UPDATE OR DELETE ON mission_plan_task_copies FOR EACH ROW EXECUTE FUNCTION mp_reject_mutation();
--> statement-breakpoint
CREATE FUNCTION mp_reject_sealed_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM mission_plan_commands WHERE version_id=NEW.version_id) THEN
  RAISE EXCEPTION 'Published mission-plan activities are sealed' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER mpa_sealed BEFORE INSERT ON mission_plan_activities FOR EACH ROW EXECUTE FUNCTION mp_reject_sealed_activity();
--> statement-breakpoint
CREATE FUNCTION mp_require_complete_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v mission_plan_versions%ROWTYPE; actual_count integer; first_position integer; last_position integer;
BEGIN
 IF TG_TABLE_NAME='mission_plans' THEN
  SELECT * INTO v FROM mission_plan_versions WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND plan_id=NEW.id AND version_number=1;
 ELSE
  SELECT * INTO v FROM mission_plan_versions WHERE id=NEW.id;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'A mission plan requires its first published Version' USING ERRCODE='23514'; END IF;
 SELECT count(*),min(position),max(position) INTO actual_count,first_position,last_position FROM mission_plan_activities WHERE workspace_id=v.workspace_id AND company_id=v.company_id AND version_id=v.id;
 IF actual_count<>v.activity_count OR first_position<>0 OR last_position<>actual_count-1 OR NOT EXISTS(SELECT 1 FROM mission_plan_commands WHERE workspace_id=v.workspace_id AND company_id=v.company_id AND version_id=v.id AND actor_membership_id=v.actor_membership_id) THEN
  RAISE EXCEPTION 'Mission-plan publication requires complete ordered activities and its original receipt' USING ERRCODE='23514';
 END IF;
 IF v.version_number>1 AND NOT EXISTS(SELECT 1 FROM mission_plan_versions WHERE workspace_id=v.workspace_id AND company_id=v.company_id AND plan_id=v.plan_id AND version_number=v.version_number-1) THEN
  RAISE EXCEPTION 'Mission-plan Version lineage must be consecutive' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER mp_complete AFTER INSERT ON mission_plans DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mp_require_complete_source();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER mpv_complete AFTER INSERT ON mission_plan_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mp_require_complete_source();
--> statement-breakpoint
CREATE FUNCTION mp_require_complete_copy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_count integer; actual_count integer; first_position integer; last_position integer;
BEGIN
 SELECT activity_count INTO expected_count FROM mission_plan_versions WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.version_id;
 SELECT count(*),min(position),max(position) INTO actual_count,first_position,last_position FROM mission_plan_task_copies WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND project_id=NEW.project_id AND version_id=NEW.version_id;
 IF expected_count IS NULL OR actual_count<>expected_count OR first_position<>0 OR last_position<>actual_count-1 THEN
  RAISE EXCEPTION 'Mission-plan copies require every exact source activity once' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER mpi_complete AFTER INSERT ON mission_plan_instances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mp_require_complete_copy();
