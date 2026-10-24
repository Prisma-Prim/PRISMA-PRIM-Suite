ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "project_template_task_copies" DROP CONSTRAINT "project_template_task_copies_position_check";--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text = 'company_project_template_user' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_deliverable_access') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_deliverable_access')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "project_template_instances" ADD CONSTRAINT "project_template_instances_pilot_progress_check" CHECK ("project_template_instances"."snapshot"->>'templateKey' <> 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE' OR ("project_template_instances"."stage_revision" = 0 AND "project_template_instances"."current_stage_key" IS NULL));--> statement-breakpoint
ALTER TABLE "project_template_task_copies" ADD CONSTRAINT "project_template_task_copies_position_check" CHECK ("project_template_task_copies"."position" BETWEEN 0 AND 12);
--> statement-breakpoint
-- Keep the original four-position boundary for legacy copies. The new fixed
-- pilot is the only model allowed to occupy positions four through twelve.
CREATE FUNCTION guard_project_template_copy_position() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_key text;
BEGIN
  SELECT snapshot->>'templateKey' INTO source_key
  FROM project_template_instances
  WHERE workspace_id = NEW.workspace_id AND company_id = NEW.company_id
    AND project_id = NEW.project_id;
  IF source_key = 'CONSULTING_PREPARATION_ILLUSTRATIVE' AND NEW.position BETWEEN 0 AND 3 THEN
    RETURN NEW;
  ELSIF source_key = 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE' AND NEW.position BETWEEN 0 AND 12 THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid copied Task position for preserved model' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER project_template_task_copy_position
BEFORE INSERT ON project_template_task_copies
FOR EACH ROW EXECUTE FUNCTION guard_project_template_copy_position();
--> statement-breakpoint
-- Pilot source/intent and its Task mapping are append-only. Legacy stage
-- progression and historical fixtures keep their prior contract unchanged.
CREATE FUNCTION guard_pilot_template_instance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.snapshot->>'templateKey' = 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE'
    OR (TG_OP = 'UPDATE' AND NEW.snapshot->>'templateKey' = 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE') THEN
    RAISE EXCEPTION 'Preserved pilot plan is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER pilot_template_instance_immutable BEFORE UPDATE OR DELETE ON project_template_instances
FOR EACH ROW EXECUTE FUNCTION guard_pilot_template_instance();
--> statement-breakpoint
CREATE FUNCTION guard_pilot_template_task_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM project_template_instances WHERE workspace_id=OLD.workspace_id
    AND company_id=OLD.company_id AND project_id=OLD.project_id
    AND snapshot->>'templateKey'='CONSULTING_MISSION_PILOT_ILLUSTRATIVE')
    OR (TG_OP='UPDATE' AND EXISTS (SELECT 1 FROM project_template_instances WHERE workspace_id=NEW.workspace_id
    AND company_id=NEW.company_id AND project_id=NEW.project_id
    AND snapshot->>'templateKey'='CONSULTING_MISSION_PILOT_ILLUSTRATIVE')) THEN
    RAISE EXCEPTION 'Preserved pilot Task mapping is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER pilot_template_task_mapping_immutable BEFORE UPDATE OR DELETE ON project_template_task_copies
FOR EACH ROW EXECUTE FUNCTION guard_pilot_template_task_mapping();
