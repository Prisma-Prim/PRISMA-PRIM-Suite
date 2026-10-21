ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_operational_risk_reader_assignment.granted' BEFORE 'company_sales_stage_configuration_assignment.granted' ;
--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_operational_risk_reader_assignment.revoked' BEFORE 'company_sales_stage_configuration_assignment.granted' ;
--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_operational_risk_reader' ;
--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_operational_risk_recorder_assignment.granted' BEFORE 'company_sales_stage_configuration_assignment.granted' ;
--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_operational_risk_recorder_assignment.revoked' BEFORE 'company_sales_stage_configuration_assignment.granted' ;
--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_operational_risk_recorder' ;
--> statement-breakpoint
CREATE TABLE "operational_risks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "current_intake_revision" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "operational_risks_revision_check" CHECK (revision > 0 AND current_intake_revision > 0 AND current_intake_revision <= revision),
  CONSTRAINT "operational_risks_company_fk" FOREIGN KEY (workspace_id, company_id) REFERENCES companies(workspace_id, id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "operational_risks_scope_id_unique" ON "operational_risks" (workspace_id, company_id, id);
--> statement-breakpoint
CREATE INDEX "operational_risks_company_page_idx" ON "operational_risks" (workspace_id, company_id, created_at, id);
--> statement-breakpoint
CREATE TABLE "operational_risk_entries" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  risk_id uuid NOT NULL,
  revision integer NOT NULL,
  kind text NOT NULL,
  predecessor_id uuid,
  predecessor_revision integer,
  payload jsonb NOT NULL,
  actor_internal_user_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,
  actor_display_name text NOT NULL,
  recorded_at timestamp with time zone NOT NULL,
  CONSTRAINT operational_risk_entries_risk_fk FOREIGN KEY (workspace_id, company_id, risk_id) REFERENCES operational_risks(workspace_id, company_id, id),
  CONSTRAINT operational_risk_entries_actor_fk FOREIGN KEY (workspace_id, actor_membership_id, actor_internal_user_id) REFERENCES workspace_memberships(workspace_id, id, internal_user_id),
  CONSTRAINT operational_risk_entries_kind_check CHECK (kind IN ('intake-recorded', 'intake-corrected', 'observation', 'reassessment') AND revision > 0 AND jsonb_typeof(payload) = 'object'),
  CONSTRAINT operational_risk_entries_predecessor_check CHECK ((
    (kind = 'intake-recorded' AND revision = 1 AND predecessor_id IS NULL AND predecessor_revision IS NULL)
    OR (kind = 'intake-corrected' AND predecessor_id IS NOT NULL AND predecessor_revision > 0 AND predecessor_revision < revision)
    OR (kind IN ('observation', 'reassessment') AND revision > 1 AND predecessor_id IS NULL AND predecessor_revision IS NULL)
  ) IS TRUE)
);
--> statement-breakpoint
CREATE UNIQUE INDEX operational_risk_entries_revision_unique ON operational_risk_entries (workspace_id, company_id, risk_id, revision);
--> statement-breakpoint
CREATE UNIQUE INDEX operational_risk_entries_identity_unique ON operational_risk_entries (workspace_id, company_id, risk_id, id, revision);
--> statement-breakpoint
CREATE UNIQUE INDEX operational_risk_entries_successor_unique ON operational_risk_entries (workspace_id, company_id, risk_id, predecessor_id) WHERE kind = 'intake-corrected';
--> statement-breakpoint
ALTER TABLE operational_risk_entries ADD CONSTRAINT operational_risk_entries_predecessor_fk FOREIGN KEY (workspace_id, company_id, risk_id, predecessor_id, predecessor_revision) REFERENCES operational_risk_entries(workspace_id, company_id, risk_id, id, revision);
--> statement-breakpoint
CREATE TABLE operational_risk_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,
  command_kind text NOT NULL,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  risk_id uuid NOT NULL,
  response jsonb NOT NULL,
  recorded_at timestamp with time zone NOT NULL,
  CONSTRAINT operational_risk_receipts_risk_fk FOREIGN KEY (workspace_id, company_id, risk_id) REFERENCES operational_risks(workspace_id, company_id, id),
  CONSTRAINT operational_risk_receipts_actor_fk FOREIGN KEY (workspace_id, actor_membership_id) REFERENCES workspace_memberships(workspace_id, id),
  CONSTRAINT operational_risk_receipts_shape_check CHECK (command_kind IN ('record', 'journal', 'correct') AND length(idempotency_key) > 0 AND length(fingerprint) = 64 AND jsonb_typeof(response) = 'object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX operational_risk_receipts_command_unique ON operational_risk_receipts (workspace_id, company_id, actor_membership_id, command_kind, idempotency_key);
--> statement-breakpoint
CREATE TABLE operational_risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  risk_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  revision integer NOT NULL,
  action text NOT NULL,
  actor_internal_user_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,
  recorded_at timestamp with time zone NOT NULL,
  metadata jsonb NOT NULL,
  CONSTRAINT operational_risk_events_entry_fk FOREIGN KEY (workspace_id, company_id, risk_id, entry_id, revision) REFERENCES operational_risk_entries(workspace_id, company_id, risk_id, id, revision),
  CONSTRAINT operational_risk_events_actor_fk FOREIGN KEY (workspace_id, actor_membership_id, actor_internal_user_id) REFERENCES workspace_memberships(workspace_id, id, internal_user_id),
  CONSTRAINT operational_risk_events_metadata_check CHECK ((CASE
    WHEN action IN ('operational_risk.recorded', 'operational_risk.intake.corrected') THEN metadata = jsonb_build_object('revision', revision)
    WHEN action = 'operational_risk.journal.recorded' THEN metadata->>'kind' IN ('observation', 'reassessment') AND metadata = jsonb_build_object('revision', revision, 'kind', metadata->>'kind')
    ELSE false END) IS TRUE)
);
--> statement-breakpoint
CREATE UNIQUE INDEX operational_risk_events_revision_unique ON operational_risk_events (workspace_id, company_id, risk_id, revision);
--> statement-breakpoint
ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check;
--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_operational_risk_reader', 'company_operational_risk_recorder') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_operational_risk_reader', 'company_operational_risk_recorder')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
--> statement-breakpoint
CREATE FUNCTION operational_risk_preserve_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Operational Risk history is immutable'; END
$$;
--> statement-breakpoint
CREATE TRIGGER operational_risk_entries_immutable BEFORE UPDATE OR DELETE ON operational_risk_entries FOR EACH ROW EXECUTE FUNCTION operational_risk_preserve_history();
--> statement-breakpoint
CREATE TRIGGER operational_risk_receipts_immutable BEFORE UPDATE OR DELETE ON operational_risk_receipts FOR EACH ROW EXECUTE FUNCTION operational_risk_preserve_history();
--> statement-breakpoint
CREATE TRIGGER operational_risk_events_immutable BEFORE UPDATE OR DELETE ON operational_risk_events FOR EACH ROW EXECUTE FUNCTION operational_risk_preserve_history();
--> statement-breakpoint
CREATE FUNCTION operational_risk_preserve_head() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Operational Risk identity is preserved';
  END IF;
  IF ROW(NEW.id, NEW.workspace_id, NEW.company_id, NEW.created_at) IS DISTINCT FROM ROW(OLD.id, OLD.workspace_id, OLD.company_id, OLD.created_at)
     OR NEW.revision <> OLD.revision + 1
     OR NEW.current_intake_revision NOT IN (OLD.current_intake_revision, NEW.revision) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Operational Risk revision is invalid';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER operational_risks_preserve_head BEFORE UPDATE OR DELETE ON operational_risks FOR EACH ROW EXECUTE FUNCTION operational_risk_preserve_head();
--> statement-breakpoint
CREATE FUNCTION operational_risk_require_committed_head() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM operational_risk_entries e
    WHERE e.workspace_id = NEW.workspace_id AND e.company_id = NEW.company_id AND e.risk_id = NEW.id AND e.revision = NEW.revision
  ) OR NOT EXISTS (
    SELECT 1 FROM operational_risk_entries e
    WHERE e.workspace_id = NEW.workspace_id AND e.company_id = NEW.company_id AND e.risk_id = NEW.id
      AND e.revision = NEW.current_intake_revision AND e.kind IN ('intake-recorded', 'intake-corrected')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Operational Risk committed history is incomplete';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER operational_risks_complete_history AFTER INSERT OR UPDATE ON operational_risks DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION operational_risk_require_committed_head();
