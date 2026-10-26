ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_contract_model_editor_assignment.granted' BEFORE 'company_offer_model_editor_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_contract_model_editor_assignment.revoked' BEFORE 'company_offer_model_approver_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_contract_model_approver_assignment.granted' BEFORE 'company_offer_model_approver_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_contract_model_approver_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_contract_model_editor' BEFORE 'company_offer_model_approver';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_contract_model_approver';--> statement-breakpoint
CREATE TABLE "contract_model_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "contract_model_commands_intent_check" CHECK ("contract_model_commands"."kind" IN ('SUBMIT', 'DECIDE', 'WITHDRAW') AND "contract_model_commands"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "contract_model_commands_result_check" CHECK (jsonb_typeof("contract_model_commands"."result") = 'object' AND ("contract_model_commands"."result"#>'{model,revision}') IS NOT NULL AND jsonb_typeof("contract_model_commands"."result"#>'{model,revision}') = 'number')
);
--> statement-breakpoint
CREATE TABLE "contract_model_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"outcome" text NOT NULL,
	"basis" text NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "contract_model_decisions_outcome_check" CHECK ("contract_model_decisions"."outcome" IN ('APPROVE', 'REJECT') AND length(btrim("contract_model_decisions"."basis")) > 0 AND length("contract_model_decisions"."basis") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "contract_model_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"model_code" text NOT NULL,
	"version_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"revision" integer NOT NULL,
	"action" text NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "contract_model_events_code_check" CHECK ("contract_model_events"."model_code" = 'INTEGRATED_MANAGEMENT_CONSULTING_CONTRACT_RO'),
	CONSTRAINT "contract_model_events_action_check" CHECK ("contract_model_events"."revision" > 0 AND "contract_model_events"."action" IN ('contract_model.version.created', 'contract_model.version.approved', 'contract_model.version.rejected', 'contract_model.version.withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "contract_model_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"predecessor_version_id" uuid,
	"predecessor_version_number" integer,
	"content" jsonb NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "contract_model_versions_lineage_check" CHECK (("contract_model_versions"."version_number" = 1 AND "contract_model_versions"."predecessor_version_id" IS NULL AND "contract_model_versions"."predecessor_version_number" IS NULL) OR ("contract_model_versions"."version_number" > 1 AND "contract_model_versions"."predecessor_version_id" IS NOT NULL AND "contract_model_versions"."predecessor_version_number" IS NOT NULL AND "contract_model_versions"."predecessor_version_number" = "contract_model_versions"."version_number" - 1)),
	CONSTRAINT "contract_model_versions_content_check" CHECK (jsonb_typeof("contract_model_versions"."content") = 'object' AND "contract_model_versions"."content" ? 'sourceKind' AND "contract_model_versions"."content"->'sourceKind' IN ('"ILLUSTRATIVE"'::jsonb, '"COMPANY_SUPPLIED"'::jsonb))
);
--> statement-breakpoint
CREATE TABLE "contract_model_withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"reason" text NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "contract_model_withdrawals_reason_check" CHECK (length(btrim("contract_model_withdrawals"."reason")) > 0 AND length("contract_model_withdrawals"."reason") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "contract_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"language" text NOT NULL,
	"revision" integer NOT NULL,
	"active_version_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "contract_models_family_check" CHECK ("contract_models"."code" = 'INTEGRATED_MANAGEMENT_CONSULTING_CONTRACT_RO' AND "contract_models"."language" = 'ro' AND "contract_models"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
CREATE UNIQUE INDEX "contract_model_commands_actor_key_unique" ON "contract_model_commands" USING btree ("workspace_id","company_id","actor_membership_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_model_decisions_version_unique" ON "contract_model_decisions" USING btree ("workspace_id","company_id","model_id","version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_model_events_revision_unique" ON "contract_model_events" USING btree ("workspace_id","company_id","model_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_model_versions_scoped_id_unique" ON "contract_model_versions" USING btree ("workspace_id","company_id","model_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_model_versions_identity_unique" ON "contract_model_versions" USING btree ("workspace_id","company_id","model_id","id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_model_versions_number_unique" ON "contract_model_versions" USING btree ("workspace_id","company_id","model_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_model_versions_successor_unique" ON "contract_model_versions" USING btree ("workspace_id","company_id","model_id","predecessor_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_model_withdrawals_version_unique" ON "contract_model_withdrawals" USING btree ("workspace_id","company_id","model_id","version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_models_scope_id_unique" ON "contract_models" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_models_company_code_unique" ON "contract_models" USING btree ("workspace_id","company_id","code");--> statement-breakpoint
ALTER TABLE "contract_model_commands" ADD CONSTRAINT "contract_model_commands_model_fk" FOREIGN KEY ("workspace_id","company_id","model_id") REFERENCES "public"."contract_models"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_model_commands" ADD CONSTRAINT "contract_model_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_model_decisions" ADD CONSTRAINT "contract_model_decisions_version_fk" FOREIGN KEY ("workspace_id","company_id","model_id","version_id","version_number") REFERENCES "public"."contract_model_versions"("workspace_id","company_id","model_id","id","version_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_model_decisions" ADD CONSTRAINT "contract_model_decisions_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_model_events" ADD CONSTRAINT "contract_model_events_version_fk" FOREIGN KEY ("workspace_id","company_id","model_id","version_id","version_number") REFERENCES "public"."contract_model_versions"("workspace_id","company_id","model_id","id","version_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_model_events" ADD CONSTRAINT "contract_model_events_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_model_versions" ADD CONSTRAINT "contract_model_versions_model_fk" FOREIGN KEY ("workspace_id","company_id","model_id") REFERENCES "public"."contract_models"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_model_versions" ADD CONSTRAINT "contract_model_versions_predecessor_fk" FOREIGN KEY ("workspace_id","company_id","model_id","predecessor_version_id","predecessor_version_number") REFERENCES "public"."contract_model_versions"("workspace_id","company_id","model_id","id","version_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_model_versions" ADD CONSTRAINT "contract_model_versions_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_model_withdrawals" ADD CONSTRAINT "contract_model_withdrawals_version_fk" FOREIGN KEY ("workspace_id","company_id","model_id","version_id","version_number") REFERENCES "public"."contract_model_versions"("workspace_id","company_id","model_id","id","version_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_model_withdrawals" ADD CONSTRAINT "contract_model_withdrawals_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_models" ADD CONSTRAINT "contract_models_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_models" ADD CONSTRAINT "contract_models_active_version_fk" FOREIGN KEY ("workspace_id","company_id","id","active_version_id") REFERENCES "public"."contract_model_versions"("workspace_id","company_id","model_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text = 'company_offer_approver' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_project_template_user' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_deliverable_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_deliverable_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
--> statement-breakpoint
-- Frozen configuration, decisions, receipts and internal business evidence.
CREATE FUNCTION contract_model_reject_frozen_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Contract model history is immutable' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contract_model_versions_frozen BEFORE UPDATE OR DELETE ON contract_model_versions FOR EACH ROW EXECUTE FUNCTION contract_model_reject_frozen_change();
--> statement-breakpoint
CREATE TRIGGER contract_model_decisions_frozen BEFORE UPDATE OR DELETE ON contract_model_decisions FOR EACH ROW EXECUTE FUNCTION contract_model_reject_frozen_change();
--> statement-breakpoint
CREATE TRIGGER contract_model_withdrawals_frozen BEFORE UPDATE OR DELETE ON contract_model_withdrawals FOR EACH ROW EXECUTE FUNCTION contract_model_reject_frozen_change();
--> statement-breakpoint
CREATE TRIGGER contract_model_commands_frozen BEFORE UPDATE OR DELETE ON contract_model_commands FOR EACH ROW EXECUTE FUNCTION contract_model_reject_frozen_change();
--> statement-breakpoint
CREATE TRIGGER contract_model_events_frozen BEFORE UPDATE OR DELETE ON contract_model_events FOR EACH ROW EXECUTE FUNCTION contract_model_reject_frozen_change();
--> statement-breakpoint
CREATE FUNCTION contract_model_guard_root_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE latest_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Contract model identity cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF (NEW.id, NEW.workspace_id, NEW.company_id, NEW.code, NEW.language, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.workspace_id, OLD.company_id, OLD.code, OLD.language, OLD.created_at)
     OR NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'Invalid Contract model identity or revision change' USING ERRCODE = '23514';
  END IF;
  IF NEW.active_version_id IS NOT NULL AND NEW.active_version_id IS DISTINCT FROM OLD.active_version_id THEN
    SELECT id INTO latest_id FROM contract_model_versions
      WHERE workspace_id = NEW.workspace_id AND company_id = NEW.company_id AND model_id = NEW.id
      ORDER BY version_number DESC LIMIT 1;
    IF NEW.active_version_id IS DISTINCT FROM latest_id OR NOT EXISTS (
      SELECT 1 FROM contract_model_decisions d
      WHERE d.workspace_id = NEW.workspace_id AND d.company_id = NEW.company_id AND d.model_id = NEW.id
        AND d.version_id = NEW.active_version_id AND d.outcome = 'APPROVE'
    ) OR EXISTS (
      SELECT 1 FROM contract_model_withdrawals w
      WHERE w.workspace_id = NEW.workspace_id AND w.company_id = NEW.company_id AND w.model_id = NEW.id
        AND w.version_id = NEW.active_version_id
    ) THEN
      RAISE EXCEPTION 'Only an approved non-withdrawn head can become available' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contract_models_identity_guard BEFORE UPDATE OR DELETE ON contract_models FOR EACH ROW EXECUTE FUNCTION contract_model_guard_root_change();
--> statement-breakpoint
CREATE FUNCTION contract_model_guard_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE latest_id uuid;
BEGIN
  SELECT id INTO latest_id FROM contract_model_versions
    WHERE workspace_id = NEW.workspace_id AND company_id = NEW.company_id AND model_id = NEW.model_id
    ORDER BY version_number DESC LIMIT 1;
  IF NEW.version_id IS DISTINCT FROM latest_id THEN
    RAISE EXCEPTION 'Only the model head can receive a decision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contract_model_decisions_head_guard BEFORE INSERT ON contract_model_decisions FOR EACH ROW EXECUTE FUNCTION contract_model_guard_decision();
--> statement-breakpoint
CREATE FUNCTION contract_model_guard_withdrawal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM contract_models m JOIN contract_model_decisions d
      ON d.workspace_id = m.workspace_id AND d.company_id = m.company_id AND d.model_id = m.id
      AND d.version_id = m.active_version_id AND d.outcome = 'APPROVE'
    WHERE m.workspace_id = NEW.workspace_id AND m.company_id = NEW.company_id AND m.id = NEW.model_id
      AND m.active_version_id = NEW.version_id
  ) THEN
    RAISE EXCEPTION 'Only the active approved model can be withdrawn' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contract_model_withdrawals_selection_guard BEFORE INSERT ON contract_model_withdrawals FOR EACH ROW EXECUTE FUNCTION contract_model_guard_withdrawal();
--> statement-breakpoint
CREATE FUNCTION contract_model_check_committed_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_model contract_models%ROWTYPE; highest integer;
BEGIN
  SELECT * INTO current_model FROM contract_models
    WHERE workspace_id = NEW.workspace_id AND company_id = NEW.company_id AND id = NEW.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract model identity is unavailable' USING ERRCODE = '23514';
  END IF;
  SELECT max(version_number) INTO highest FROM contract_model_versions
    WHERE workspace_id = NEW.workspace_id AND company_id = NEW.company_id AND model_id = NEW.id;
  IF highest IS NULL OR highest > current_model.revision OR NOT EXISTS (
    SELECT 1 FROM contract_model_events e WHERE e.workspace_id = NEW.workspace_id
      AND e.company_id = NEW.company_id AND e.model_id = NEW.id AND e.revision = current_model.revision
  ) THEN
    RAISE EXCEPTION 'Contract model content or recorded revision is incomplete' USING ERRCODE = '23514';
  END IF;
  IF current_model.active_version_id IS NOT NULL AND (
    NOT EXISTS (SELECT 1 FROM contract_model_decisions d WHERE d.workspace_id = NEW.workspace_id
      AND d.company_id = NEW.company_id AND d.model_id = NEW.id
      AND d.version_id = current_model.active_version_id AND d.outcome = 'APPROVE')
    OR EXISTS (SELECT 1 FROM contract_model_withdrawals w WHERE w.workspace_id = NEW.workspace_id
      AND w.company_id = NEW.company_id AND w.model_id = NEW.id AND w.version_id = current_model.active_version_id)
  ) THEN
    RAISE EXCEPTION 'Contract model active selection is invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contract_models_committed_state AFTER INSERT OR UPDATE ON contract_models
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION contract_model_check_committed_state();
