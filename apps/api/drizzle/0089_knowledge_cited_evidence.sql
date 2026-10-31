ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_knowledge_source_administrator_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_knowledge_source_administrator_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_knowledge_evidence_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_knowledge_evidence_reader_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_knowledge_source_administrator';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_knowledge_evidence_reader';--> statement-breakpoint
CREATE TABLE "knowledge_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"capability_version" text NOT NULL,
	"operation" text NOT NULL,
	"source_references" jsonb NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_passages" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"locator" text NOT NULL,
	"text" text NOT NULL,
	"sha256" text NOT NULL,
	CONSTRAINT "knowledge_passages_literal_check" CHECK ("knowledge_passages"."position" BETWEEN 1 AND 20 AND length("knowledge_passages"."locator") BETWEEN 1 AND 120 AND "knowledge_passages"."locator" NOT IN ('.','..') AND length("knowledge_passages"."text") BETWEEN 1 AND 16384 AND "knowledge_passages"."sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "knowledge_source_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"source_id" uuid NOT NULL,
	"result" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_source_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"action" text NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"command_fingerprint" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "knowledge_source_events_revision_check" CHECK ("knowledge_source_events"."revision" >= 1 AND "knowledge_source_events"."action" IN ('drafted','admitted','revoked') AND "knowledge_source_events"."command_fingerprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"representation_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"source_sha256" text NOT NULL,
	"projection_sha256" text NOT NULL,
	"language" text NOT NULL,
	"owner_reference" text NOT NULL,
	"provenance" text NOT NULL,
	"rights_evidence_reference" text NOT NULL,
	"permitted_purpose" text NOT NULL,
	"confidentiality" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "knowledge_sources_state_check" CHECK ("knowledge_sources"."revision" >= 1 AND "knowledge_sources"."state" IN ('draft', 'admitted', 'revoked') AND "knowledge_sources"."language" IN ('ro','ru','en') AND "knowledge_sources"."permitted_purpose" = 'cited-evidence' AND "knowledge_sources"."confidentiality" = 'company-confidential' AND "knowledge_sources"."effective_until" > "knowledge_sources"."effective_from" AND "knowledge_sources"."source_sha256" ~ '^[a-f0-9]{64}$' AND "knowledge_sources"."projection_sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sources_scope_unique" ON "knowledge_sources" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
ALTER TABLE "knowledge_interactions" ADD CONSTRAINT "knowledge_interactions_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_interactions" ADD CONSTRAINT "knowledge_interactions_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_passages" ADD CONSTRAINT "knowledge_passages_source_fk" FOREIGN KEY ("workspace_id","company_id","source_id") REFERENCES "public"."knowledge_sources"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_commands" ADD CONSTRAINT "knowledge_source_commands_source_fk" FOREIGN KEY ("workspace_id","company_id","source_id") REFERENCES "public"."knowledge_sources"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_commands" ADD CONSTRAINT "knowledge_source_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_events" ADD CONSTRAINT "knowledge_source_events_source_fk" FOREIGN KEY ("workspace_id","company_id","source_id") REFERENCES "public"."knowledge_sources"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_events" ADD CONSTRAINT "knowledge_source_events_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_version_fk" FOREIGN KEY ("workspace_id","company_id","document_id","document_version_id") REFERENCES "public"."document_versions"("workspace_id","company_id","document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_pdf_fk" FOREIGN KEY ("workspace_id","company_id","document_id","document_version_id","representation_id") REFERENCES "public"."document_pdfs"("workspace_id","company_id","document_id","version_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_actor_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_passages_position_unique" ON "knowledge_passages" USING btree ("workspace_id","company_id","source_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_passages_identity_unique" ON "knowledge_passages" USING btree ("workspace_id","company_id","source_id","locator");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_source_commands_key_unique" ON "knowledge_source_commands" USING btree ("workspace_id","actor_membership_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_source_events_revision_unique" ON "knowledge_source_events" USING btree ("workspace_id","company_id","source_id","revision");--> statement-breakpoint
CREATE INDEX "knowledge_sources_company_page" ON "knowledge_sources" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_contract_early_preparation', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user', 'company_knowledge_source_administrator', 'company_knowledge_evidence_reader') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user', 'company_knowledge_source_administrator', 'company_knowledge_evidence_reader')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
--> statement-breakpoint
CREATE FUNCTION knowledge_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'knowledge_sources' THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Knowledge Sources are retained' USING ERRCODE = '23514'; END IF;
    IF (to_jsonb(NEW) - ARRAY['state','revision']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','revision'])
      OR NEW.revision <> OLD.revision + 1
      OR NOT ((OLD.state = 'draft' AND NEW.state IN ('admitted','revoked')) OR (OLD.state = 'admitted' AND NEW.state = 'revoked')) THEN
      RAISE EXCEPTION 'Invalid immutable Knowledge Source transition' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN RAISE EXCEPTION 'Knowledge evidence is append only' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME = 'knowledge_passages' THEN
    IF EXISTS (SELECT 1 FROM knowledge_source_events WHERE workspace_id = NEW.workspace_id AND company_id = NEW.company_id AND source_id = NEW.source_id) THEN
      RAISE EXCEPTION 'A recorded projection is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'knowledge_source_events' THEN
    IF NOT EXISTS (SELECT 1 FROM workspace_memberships WHERE workspace_id = NEW.workspace_id AND id = NEW.actor_membership_id AND internal_user_id = NEW.actor_internal_user_id) THEN
      RAISE EXCEPTION 'The source event actor differs' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER knowledge_source_immutable BEFORE UPDATE OR DELETE ON knowledge_sources FOR EACH ROW EXECUTE FUNCTION knowledge_immutable_guard();
--> statement-breakpoint
CREATE TRIGGER knowledge_passage_immutable BEFORE INSERT OR UPDATE OR DELETE ON knowledge_passages FOR EACH ROW EXECUTE FUNCTION knowledge_immutable_guard();
--> statement-breakpoint
CREATE TRIGGER knowledge_event_immutable BEFORE INSERT OR UPDATE OR DELETE ON knowledge_source_events FOR EACH ROW EXECUTE FUNCTION knowledge_immutable_guard();
--> statement-breakpoint
CREATE TRIGGER knowledge_command_immutable BEFORE UPDATE OR DELETE ON knowledge_source_commands FOR EACH ROW EXECUTE FUNCTION knowledge_immutable_guard();
--> statement-breakpoint
CREATE TRIGGER knowledge_interaction_immutable BEFORE UPDATE OR DELETE ON knowledge_interactions FOR EACH ROW EXECUTE FUNCTION knowledge_immutable_guard();
--> statement-breakpoint
CREATE FUNCTION knowledge_source_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_row knowledge_sources%ROWTYPE; source_key uuid;
BEGIN
  IF TG_TABLE_NAME = 'knowledge_sources' THEN source_key := NEW.id; ELSE source_key := NEW.source_id; END IF;
  SELECT * INTO source_row FROM knowledge_sources WHERE workspace_id = NEW.workspace_id AND company_id = NEW.company_id AND id = source_key;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM knowledge_source_events WHERE workspace_id = source_row.workspace_id AND company_id = source_row.company_id AND source_id = source_row.id
      AND revision = source_row.revision AND action = CASE source_row.state WHEN 'draft' THEN 'drafted' WHEN 'admitted' THEN 'admitted' ELSE 'revoked' END
  ) OR (SELECT count(*) FROM knowledge_source_events WHERE workspace_id = source_row.workspace_id AND company_id = source_row.company_id AND source_id = source_row.id) <> source_row.revision
    OR (SELECT max(revision) FROM knowledge_source_events WHERE workspace_id = source_row.workspace_id AND company_id = source_row.company_id AND source_id = source_row.id) <> source_row.revision
    OR (SELECT count(*) FROM knowledge_passages WHERE workspace_id = source_row.workspace_id AND company_id = source_row.company_id AND source_id = source_row.id) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Incomplete Knowledge Source attribution or projection' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER knowledge_source_head AFTER INSERT OR UPDATE ON knowledge_sources DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION knowledge_source_head_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER knowledge_source_event_head AFTER INSERT ON knowledge_source_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION knowledge_source_head_guard();
