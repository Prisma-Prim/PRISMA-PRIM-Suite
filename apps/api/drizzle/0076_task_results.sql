ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_task_result_recorder_assignment.granted' BEFORE 'company_document_content_reader_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_task_result_recorder_assignment.revoked' BEFORE 'company_document_content_uploader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_task_result_recorder';--> statement-breakpoint
CREATE TABLE "task_result_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"command" text NOT NULL,
	"action" text NOT NULL,
	"result_id" uuid NOT NULL,
	CONSTRAINT "task_result_commands_action_check" CHECK ("task_result_commands"."action" IN ('recorded', 'corrected', 'unchanged'))
);
--> statement-breakpoint
CREATE TABLE "task_result_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"declaration" text NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"pdf_id" uuid NOT NULL,
	"predecessor_id" uuid,
	"reason" text,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_result_declarations_revision_check" CHECK ("task_result_declarations"."revision" >= 1),
	CONSTRAINT "task_result_declarations_text_check" CHECK (length("task_result_declarations"."declaration") BETWEEN 1 AND 2000 AND "task_result_declarations"."declaration" = btrim("task_result_declarations"."declaration")),
	CONSTRAINT "task_result_declarations_correction_check" CHECK (("task_result_declarations"."revision" = 1 AND "task_result_declarations"."predecessor_id" IS NULL AND "task_result_declarations"."reason" IS NULL) OR ("task_result_declarations"."revision" > 1 AND "task_result_declarations"."predecessor_id" IS NOT NULL AND "task_result_declarations"."reason" IS NOT NULL AND length("task_result_declarations"."reason") BETWEEN 1 AND 500 AND "task_result_declarations"."reason" = btrim("task_result_declarations"."reason")))
);
--> statement-breakpoint
CREATE TABLE "task_result_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"result_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"action" text NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "task_result_events_meaning_check" CHECK ("task_result_events"."revision" >= 1 AND (("task_result_events"."revision" = 1 AND "task_result_events"."action" = 'task.result.recorded') OR ("task_result_events"."revision" > 1 AND "task_result_events"."action" = 'task.result.corrected')) AND "task_result_events"."metadata" = jsonb_build_object('revision', "task_result_events"."revision"))
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
CREATE UNIQUE INDEX "task_result_commands_actor_key_unique" ON "task_result_commands" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "task_result_declarations_revision_unique" ON "task_result_declarations" USING btree ("workspace_id","company_id","task_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "task_result_declarations_scope_unique" ON "task_result_declarations" USING btree ("workspace_id","company_id","task_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_result_events_result_unique" ON "task_result_events" USING btree ("result_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_pdfs_content_scope_unique" ON "document_pdfs" USING btree ("workspace_id","company_id","document_id","version_id","id");--> statement-breakpoint
ALTER TABLE "task_result_commands" ADD CONSTRAINT "task_result_commands_result_fk" FOREIGN KEY ("workspace_id","company_id","task_id","result_id") REFERENCES "public"."task_result_declarations"("workspace_id","company_id","task_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_result_commands" ADD CONSTRAINT "task_result_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_result_declarations" ADD CONSTRAINT "task_result_declarations_task_fk" FOREIGN KEY ("workspace_id","company_id","task_id") REFERENCES "public"."tasks"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_result_declarations" ADD CONSTRAINT "task_result_declarations_pdf_fk" FOREIGN KEY ("workspace_id","company_id","document_id","version_id","pdf_id") REFERENCES "public"."document_pdfs"("workspace_id","company_id","document_id","version_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_result_declarations" ADD CONSTRAINT "task_result_declarations_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_result_events" ADD CONSTRAINT "task_result_events_result_fk" FOREIGN KEY ("workspace_id","company_id","task_id","result_id") REFERENCES "public"."task_result_declarations"("workspace_id","company_id","task_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_result_events" ADD CONSTRAINT "task_result_events_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_deliverable_access') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_deliverable_access')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
--> statement-breakpoint
CREATE FUNCTION task_result_declaration_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior_id uuid; prior_revision integer;
BEGIN
  PERFORM id FROM tasks
    WHERE workspace_id = NEW.workspace_id AND company_id = NEW.company_id AND id = NEW.task_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid Task result target' USING ERRCODE = '23514', CONSTRAINT = 'task_result_declarations_reference_guard';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tasks t
    JOIN working_documents d ON d.workspace_id=t.workspace_id AND d.company_id=t.company_id
      AND d.id=NEW.document_id AND d.client_id=t.client_account_id AND d.project_id=t.project_id
      AND d.type='mission-deliverable'
    JOIN document_versions v ON v.workspace_id=d.workspace_id AND v.company_id=d.company_id
      AND v.document_id=d.id AND v.id=NEW.version_id AND v.status IN ('official','superseded')
      AND v.frozen_title IS NOT NULL
    JOIN document_pdfs p ON p.workspace_id=v.workspace_id AND p.company_id=v.company_id
      AND p.document_id=v.document_id AND p.version_id=v.id AND p.id=NEW.pdf_id AND p.scan_outcome='clean'
    WHERE t.workspace_id=NEW.workspace_id AND t.company_id=NEW.company_id AND t.id=NEW.task_id
      AND t.status IN ('todo','in_progress','blocked')
      AND p.id=(SELECT current_pdf.id FROM document_pdfs current_pdf
        WHERE current_pdf.workspace_id=v.workspace_id AND current_pdf.company_id=v.company_id
          AND current_pdf.document_id=v.document_id AND current_pdf.version_id=v.id
        ORDER BY current_pdf.upload_revision DESC LIMIT 1)
  ) THEN
    RAISE EXCEPTION 'Invalid frozen mission Task result reference' USING ERRCODE = '23514', CONSTRAINT = 'task_result_declarations_reference_guard';
  END IF;
  SELECT id, revision INTO prior_id, prior_revision FROM task_result_declarations
    WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND task_id=NEW.task_id
    ORDER BY revision DESC LIMIT 1;
  IF NEW.revision <> COALESCE(prior_revision,0)+1 OR NEW.predecessor_id IS DISTINCT FROM prior_id THEN
    RAISE EXCEPTION 'Invalid Task result predecessor' USING ERRCODE = '23514', CONSTRAINT = 'task_result_declarations_predecessor_guard';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER task_result_declaration_guard BEFORE INSERT ON task_result_declarations
  FOR EACH ROW EXECUTE FUNCTION task_result_declaration_guard();
--> statement-breakpoint
CREATE FUNCTION task_result_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM task_result_declarations d
    WHERE d.workspace_id=NEW.workspace_id AND d.company_id=NEW.company_id AND d.task_id=NEW.task_id
      AND d.id=NEW.result_id AND d.revision=NEW.revision
      AND d.actor_internal_user_id=NEW.actor_internal_user_id AND d.actor_membership_id=NEW.actor_membership_id
      AND d.occurred_at=NEW.occurred_at) THEN
    RAISE EXCEPTION 'Invalid Task result event attribution' USING ERRCODE='23514', CONSTRAINT='task_result_events_declaration_guard';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER task_result_event_guard BEFORE INSERT ON task_result_events
  FOR EACH ROW EXECUTE FUNCTION task_result_event_guard();
--> statement-breakpoint
CREATE FUNCTION task_result_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Task result records are immutable' USING ERRCODE='23514', CONSTRAINT='task_result_records_immutable';
END $$;
--> statement-breakpoint
CREATE TRIGGER task_result_declarations_immutable BEFORE UPDATE OR DELETE ON task_result_declarations
  FOR EACH ROW EXECUTE FUNCTION task_result_immutable();
--> statement-breakpoint
CREATE TRIGGER task_result_commands_immutable BEFORE UPDATE OR DELETE ON task_result_commands
  FOR EACH ROW EXECUTE FUNCTION task_result_immutable();
--> statement-breakpoint
CREATE TRIGGER task_result_events_immutable BEFORE UPDATE OR DELETE ON task_result_events
  FOR EACH ROW EXECUTE FUNCTION task_result_immutable();
