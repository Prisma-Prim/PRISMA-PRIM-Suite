ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_invoice_reader_assignment.granted' BEFORE 'workspace_invitation.issued';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_invoice_reader_assignment.revoked' BEFORE 'workspace_invitation.issued';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_invoice_recorder_assignment.granted' BEFORE 'workspace_invitation.issued';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_invoice_recorder_assignment.revoked' BEFORE 'workspace_invitation.issued';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_external_invoice_access_assignment.granted' BEFORE 'workspace_invitation.issued';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_external_invoice_access_assignment.revoked' BEFORE 'workspace_invitation.issued';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_invoice_reader' BEFORE 'company_internal_task_manager';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_invoice_recorder' BEFORE 'company_internal_task_manager';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_external_invoice_access' BEFORE 'company_internal_task_manager';--> statement-breakpoint
CREATE TABLE "external_invoice_document_relations" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"contract_version_id" uuid NOT NULL,
	"contract_version_number" integer NOT NULL,
	"illustrative_reference" integer NOT NULL,
	"recipient_kind" text NOT NULL,
	"recipient_additional_legal_entity_id" uuid,
	"recipient_legal_name" text NOT NULL,
	"recipient_tax_id" text,
	"recipient_legal_address" text,
	"source_description" text NOT NULL,
	"received_on" date,
	"registered_by_membership_id" uuid NOT NULL,
	"registered_by_internal_user_id" uuid NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	CONSTRAINT "external_invoice_relation_values_check" CHECK ("external_invoice_document_relations"."contract_version_number">0 AND "external_invoice_document_relations"."illustrative_reference">0 AND length(trim("external_invoice_document_relations"."source_description")) BETWEEN 1 AND 2000 AND "external_invoice_document_relations"."source_description"=trim("external_invoice_document_relations"."source_description") AND (("external_invoice_document_relations"."recipient_kind"='PRIMARY' AND "external_invoice_document_relations"."recipient_additional_legal_entity_id" IS NULL) OR ("external_invoice_document_relations"."recipient_kind"='ADDITIONAL' AND "external_invoice_document_relations"."recipient_additional_legal_entity_id" IS NOT NULL)))
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "working_documents" DROP CONSTRAINT "working_documents_state_check";--> statement-breakpoint
ALTER TABLE "external_invoice_document_relations" ADD CONSTRAINT "external_invoice_document_scope_fk" FOREIGN KEY ("workspace_id","company_id","document_id") REFERENCES "public"."working_documents"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_invoice_document_relations" ADD CONSTRAINT "external_invoice_contract_version_scope_fk" FOREIGN KEY ("workspace_id","company_id","contract_id","contract_version_id") REFERENCES "public"."contract_versions"("workspace_id","company_id","contract_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_invoice_document_relations" ADD CONSTRAINT "external_invoice_registrar_scope_fk" FOREIGN KEY ("workspace_id","registered_by_membership_id","registered_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_internal_task_manager', 'company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_contract_early_preparation', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_project_next_action_coordinator', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user', 'company_knowledge_source_administrator', 'company_knowledge_evidence_reader', 'company_invoice_reader', 'company_invoice_recorder', 'company_external_invoice_access') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_internal_task_manager', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_project_next_action_coordinator', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user', 'company_knowledge_source_administrator', 'company_knowledge_evidence_reader', 'company_invoice_reader', 'company_invoice_recorder', 'company_external_invoice_access')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "working_documents" ADD CONSTRAINT "working_documents_state_check" CHECK ("working_documents"."type" IN ('questionnaire', 'mission-deliverable', 'received-contract', 'external-invoice') AND "working_documents"."confidentiality" = 'company-confidential' AND length(trim("working_documents"."title")) BETWEEN 1 AND 200 AND length(trim("working_documents"."purpose")) BETWEEN 1 AND 2000);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_mission_document_version_pdf() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('official', 'superseded') AND EXISTS (
    SELECT 1 FROM public.working_documents d
    WHERE d.workspace_id = NEW.workspace_id AND d.company_id = NEW.company_id
      AND d.id = NEW.document_id AND d.type IN ('mission-deliverable', 'received-contract', 'external-invoice')
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
CREATE OR REPLACE FUNCTION guard_document_correction_family_reference() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE document_type text;
BEGIN
  SELECT d.type INTO document_type FROM public.working_documents d
  WHERE d.workspace_id = NEW.workspace_id AND d.company_id = NEW.company_id AND d.id = NEW.document_id;
  IF (document_type IN ('mission-deliverable', 'received-contract', 'external-invoice') AND (NEW.before_url IS NOT NULL OR NEW.after_url IS NOT NULL))
    OR (document_type = 'questionnaire' AND (NEW.before_url IS NULL OR NEW.after_url IS NULL)) THEN
    RAISE EXCEPTION 'Correction reference values must match the immutable Document family'
      USING ERRCODE = '23514', CONSTRAINT = 'document_correction_family_reference';
  END IF;
  RETURN NEW;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_mission_document_external_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.document_versions v
    JOIN public.working_documents d ON d.workspace_id = v.workspace_id
      AND d.company_id = v.company_id AND d.id = v.document_id
    WHERE v.workspace_id = NEW.workspace_id AND v.company_id = NEW.company_id
      AND v.id = NEW.version_id AND d.type IN ('mission-deliverable', 'received-contract', 'external-invoice')
  ) THEN
    RAISE EXCEPTION 'Mission deliverables do not accept external references'
      USING ERRCODE = '23514', CONSTRAINT = 'mission_document_external_reference_forbidden';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION external_invoice_metadata_valid(value text, maximum integer) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT (reported_signing_literal(to_jsonb(value),maximum) AND value=btrim(value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) IS TRUE
$$;
--> statement-breakpoint
CREATE FUNCTION guard_external_invoice_relation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN
  RAISE EXCEPTION 'External invoice source context is immutable' USING ERRCODE='23514',CONSTRAINT='external_invoice_relation_immutable';
 END IF;
 IF NEW.source_description IS NOT NULL AND NOT external_invoice_metadata_valid(NEW.source_description,2000) THEN
  RAISE EXCEPTION 'External invoice source text must match its closed native grammar' USING ERRCODE='23514',CONSTRAINT='external_invoice_relation_values_check';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM working_documents d
  JOIN contracts c ON c.workspace_id=d.workspace_id AND c.company_id=d.company_id AND c.id=NEW.contract_id AND c.opportunity_id=NEW.opportunity_id AND c.original_client_account_id=d.client_id AND c.kind='CONTRACT' AND c.origin='COMPANY_MODEL_OFFER'
  JOIN contract_versions v ON v.workspace_id=c.workspace_id AND v.company_id=c.company_id AND v.contract_id=c.id AND v.id=NEW.contract_version_id AND v.provenance='COMPANY_MODEL_OFFER' AND v.decision_state='APPROVED' AND v.execution_state='EXECUTED'
  JOIN contract_signing_declarations sd ON sd.workspace_id=v.workspace_id AND sd.company_id=v.company_id AND sd.contract_id=v.contract_id AND sd.contract_version_id=v.id
  JOIN workspace_memberships m ON m.workspace_id=d.workspace_id AND m.id=d.created_by_membership_id
  WHERE d.id=NEW.document_id AND d.workspace_id=NEW.workspace_id AND d.company_id=NEW.company_id AND d.type='external-invoice' AND d.project_id IS NULL AND d.project_revision=0
   AND NEW.contract_version_number=v.version_number AND NEW.illustrative_reference=c.illustrative_reference
   AND (NEW.recipient_kind,NEW.recipient_additional_legal_entity_id,NEW.recipient_legal_name,NEW.recipient_tax_id,NEW.recipient_legal_address) IS NOT DISTINCT FROM (v.recipient_kind,v.recipient_additional_legal_entity_id,v.recipient_legal_name,v.recipient_tax_id,v.recipient_legal_address)
   AND NEW.registered_by_membership_id=d.created_by_membership_id AND NEW.registered_by_internal_user_id=m.internal_user_id AND NEW.registered_at=d.created_at
 ) OR (NEW.received_on IS NOT NULL AND (NEW.received_on < DATE '0001-01-01' OR NEW.received_on > DATE '9999-12-31')) THEN
  RAISE EXCEPTION 'External invoice source must copy its exact declared Contract and original party' USING ERRCODE='23514',CONSTRAINT='external_invoice_relation_binding';
 END IF;
 PERFORM validate_reported_contract_signing(NEW.contract_version_id);
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER external_invoice_relation_binding BEFORE INSERT OR UPDATE OR DELETE ON external_invoice_document_relations FOR EACH ROW EXECUTE FUNCTION guard_external_invoice_relation();
--> statement-breakpoint
CREATE FUNCTION guard_external_invoice_presence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d working_documents;
BEGIN
 SELECT * INTO d FROM working_documents WHERE id=NEW.id;
 IF FOUND AND (d.type='external-invoice') IS DISTINCT FROM EXISTS (SELECT 1 FROM external_invoice_document_relations r WHERE r.document_id=d.id AND r.workspace_id=d.workspace_id AND r.company_id=d.company_id) THEN
  RAISE EXCEPTION 'External invoice family requires its immutable relation' USING ERRCODE='23514',CONSTRAINT='external_invoice_relation_required';
 END IF;
 IF d.type='external-invoice' AND (NOT EXISTS(SELECT 1 FROM document_versions v WHERE v.workspace_id=d.workspace_id AND v.company_id=d.company_id AND v.document_id=d.id AND v.number=1 AND v.created_by_membership_id=d.created_by_membership_id AND v.created_at=date_trunc('milliseconds',d.created_at)) OR NOT EXISTS(SELECT 1 FROM document_registration_events e WHERE e.workspace_id=d.workspace_id AND e.company_id=d.company_id AND e.document_id=d.id AND e.actor_membership_id=d.created_by_membership_id AND e.occurred_at=d.created_at)) THEN
  RAISE EXCEPTION 'External invoice registration requires its exact initial Version and event' USING ERRCODE='23514',CONSTRAINT='external_invoice_registration_coupling';
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER working_documents_external_invoice_required AFTER INSERT OR UPDATE ON working_documents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_external_invoice_presence();
--> statement-breakpoint
CREATE FUNCTION guard_external_invoice_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.type='external-invoice' THEN RAISE EXCEPTION 'External invoice originals are retained' USING ERRCODE='23514',CONSTRAINT='external_invoice_identity_immutable'; END IF;
 IF TG_OP='UPDATE' AND (OLD.type='external-invoice' OR NEW.type='external-invoice') AND (NEW.id,NEW.workspace_id,NEW.company_id,NEW.client_id,NEW.type,NEW.confidentiality,NEW.created_by_membership_id,NEW.created_at,NEW.idempotency_key,NEW.request_fingerprint) IS DISTINCT FROM (OLD.id,OLD.workspace_id,OLD.company_id,OLD.client_id,OLD.type,OLD.confidentiality,OLD.created_by_membership_id,OLD.created_at,OLD.idempotency_key,OLD.request_fingerprint) THEN
  RAISE EXCEPTION 'External invoice owner and registration are immutable' USING ERRCODE='23514',CONSTRAINT='external_invoice_identity_immutable';
 END IF;
 IF TG_OP <> 'DELETE' AND NEW.type='external-invoice' AND (NOT external_invoice_metadata_valid(NEW.title,200) OR NOT external_invoice_metadata_valid(NEW.purpose,2000)) THEN RAISE EXCEPTION 'External invoice metadata must match its native grammar' USING ERRCODE='23514',CONSTRAINT='external_invoice_metadata_values_check'; END IF;
 IF TG_OP <> 'DELETE' AND NEW.type='external-invoice' AND (NEW.project_id IS NOT NULL OR NEW.project_revision<>0) THEN RAISE EXCEPTION 'External invoice sources cannot be Project attachments' USING ERRCODE='23514',CONSTRAINT='external_invoice_project_forbidden'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER working_documents_external_invoice_identity BEFORE INSERT OR UPDATE OR DELETE ON working_documents FOR EACH ROW EXECUTE FUNCTION guard_external_invoice_identity();
--> statement-breakpoint
CREATE FUNCTION guard_financial_document_use() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM working_documents d WHERE d.workspace_id=NEW.workspace_id AND d.company_id=NEW.company_id AND d.id=NEW.document_id AND d.type IN ('questionnaire','mission-deliverable','received-contract')) THEN
  RAISE EXCEPTION 'This native source family is ineligible' USING ERRCODE='23514',CONSTRAINT='financial_document_use_forbidden';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER knowledge_financial_source_forbidden BEFORE INSERT OR UPDATE ON knowledge_sources FOR EACH ROW EXECUTE FUNCTION guard_financial_document_use();
--> statement-breakpoint
CREATE TRIGGER project_financial_document_forbidden BEFORE INSERT OR UPDATE ON document_project_events FOR EACH ROW EXECUTE FUNCTION guard_financial_document_use();
