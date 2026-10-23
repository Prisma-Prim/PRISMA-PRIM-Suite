ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_mission_deliverable_access_assignment.granted' BEFORE 'company_document_content_reader_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_mission_deliverable_access_assignment.revoked' BEFORE 'company_document_content_uploader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_mission_deliverable_access';--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "working_documents" DROP CONSTRAINT "working_documents_state_check";--> statement-breakpoint
ALTER TABLE "document_correction_commands" ALTER COLUMN "before_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document_correction_commands" ALTER COLUMN "after_url" DROP NOT NULL;--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_mission_deliverable_access') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_mission_deliverable_access')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "document_correction_commands" ADD CONSTRAINT "document_correction_commands_url_pair_check" CHECK (("document_correction_commands"."before_url" IS NULL) = ("document_correction_commands"."after_url" IS NULL));--> statement-breakpoint
ALTER TABLE "working_documents" ADD CONSTRAINT "working_documents_state_check" CHECK ("working_documents"."type" IN ('questionnaire', 'mission-deliverable') AND "working_documents"."confidentiality" = 'company-confidential' AND length(trim("working_documents"."title")) BETWEEN 1 AND 200 AND length(trim("working_documents"."purpose")) BETWEEN 1 AND 2000);
--> statement-breakpoint
CREATE FUNCTION guard_mission_document_version_pdf() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('official', 'superseded') AND EXISTS (
    SELECT 1 FROM public.working_documents d
    WHERE d.workspace_id = NEW.workspace_id AND d.company_id = NEW.company_id
      AND d.id = NEW.document_id AND d.type = 'mission-deliverable'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.document_pdfs p
    WHERE p.workspace_id = NEW.workspace_id AND p.company_id = NEW.company_id
      AND p.document_id = NEW.document_id AND p.version_id = NEW.id
      AND p.scan_outcome = 'clean'
  ) THEN
    RAISE EXCEPTION 'An official mission Document Version requires preserved clean PDF content'
      USING ERRCODE = '23514', CONSTRAINT = 'mission_document_version_pdf_required';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER document_versions_mission_pdf_guard BEFORE INSERT OR UPDATE ON public.document_versions
FOR EACH ROW EXECUTE FUNCTION guard_mission_document_version_pdf();

--> statement-breakpoint
CREATE FUNCTION guard_document_correction_family_reference() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE document_type text;
BEGIN
  SELECT d.type INTO document_type FROM public.working_documents d
  WHERE d.workspace_id = NEW.workspace_id AND d.company_id = NEW.company_id AND d.id = NEW.document_id;
  IF (document_type = 'mission-deliverable' AND (NEW.before_url IS NOT NULL OR NEW.after_url IS NOT NULL))
    OR (document_type = 'questionnaire' AND (NEW.before_url IS NULL OR NEW.after_url IS NULL)) THEN
    RAISE EXCEPTION 'Correction reference values must match the immutable Document family'
      USING ERRCODE = '23514', CONSTRAINT = 'document_correction_family_reference';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER document_correction_commands_family_reference BEFORE INSERT ON public.document_correction_commands
FOR EACH ROW EXECUTE FUNCTION guard_document_correction_family_reference();

--> statement-breakpoint
CREATE FUNCTION guard_document_family_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'The Document family is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'document_family_immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER working_documents_family_immutable BEFORE UPDATE ON public.working_documents
FOR EACH ROW EXECUTE FUNCTION guard_document_family_immutable();
--> statement-breakpoint
CREATE FUNCTION guard_mission_document_external_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.document_versions v
    JOIN public.working_documents d ON d.workspace_id = v.workspace_id
      AND d.company_id = v.company_id AND d.id = v.document_id
    WHERE v.workspace_id = NEW.workspace_id AND v.company_id = NEW.company_id
      AND v.id = NEW.version_id AND d.type = 'mission-deliverable'
  ) THEN
    RAISE EXCEPTION 'Mission deliverables do not accept external references'
      USING ERRCODE = '23514', CONSTRAINT = 'mission_document_external_reference_forbidden';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER document_representations_mission_reference_guard BEFORE INSERT OR UPDATE ON public.document_representations
FOR EACH ROW EXECUTE FUNCTION guard_mission_document_external_reference();
