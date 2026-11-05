ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_payment_reader_assignment.granted' BEFORE 'company_invoice_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_payment_reader_assignment.revoked' BEFORE 'company_invoice_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_payment_recorder_assignment.granted' BEFORE 'company_invoice_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_payment_recorder_assignment.revoked' BEFORE 'company_invoice_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_payment_confirmer_assignment.granted' BEFORE 'company_invoice_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_payment_confirmer_assignment.revoked' BEFORE 'company_invoice_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_payment_reverser_assignment.granted' BEFORE 'company_invoice_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_payment_reverser_assignment.revoked' BEFORE 'company_invoice_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_payment_evidence_access_assignment.granted' BEFORE 'company_invoice_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_payment_evidence_access_assignment.revoked' BEFORE 'company_invoice_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_payment_reader' BEFORE 'company_invoice_reader';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_payment_recorder' BEFORE 'company_invoice_reader';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_payment_confirmer' BEFORE 'company_invoice_reader';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_payment_reverser' BEFORE 'company_invoice_reader';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_payment_evidence_access' BEFORE 'company_invoice_reader';--> statement-breakpoint
CREATE TABLE "payment_evidence_document_sources" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"original_client_account_id" uuid NOT NULL,
	"original_client_version" integer NOT NULL,
	"payer_kind" text NOT NULL,
	"payer_legal_entity_id" uuid,
	"payer_legal_name" text NOT NULL,
	"payer_tax_id" text,
	"payer_legal_address" text,
	"receiving_company_label" text NOT NULL,
	"source_description" text NOT NULL,
	"received_on" date,
	"initial_title" text NOT NULL,
	"initial_purpose" text NOT NULL,
	"registered_by_membership_id" uuid NOT NULL,
	"registered_by_internal_user_id" uuid NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payment_evidence_source_values_check" CHECK ("payment_evidence_document_sources"."original_client_version" BETWEEN 1 AND 2147483646 AND length(trim("payment_evidence_document_sources"."source_description")) BETWEEN 1 AND 2000 AND "payment_evidence_document_sources"."source_description"=trim("payment_evidence_document_sources"."source_description") AND length(trim("payment_evidence_document_sources"."initial_title")) BETWEEN 1 AND 200 AND length(trim("payment_evidence_document_sources"."initial_purpose")) BETWEEN 1 AND 2000 AND (("payment_evidence_document_sources"."payer_kind"='PRIMARY' AND "payment_evidence_document_sources"."payer_legal_entity_id" IS NULL) OR ("payment_evidence_document_sources"."payer_kind"='ADDITIONAL' AND "payment_evidence_document_sources"."payer_legal_entity_id" IS NOT NULL)))
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "working_documents" DROP CONSTRAINT "working_documents_state_check";--> statement-breakpoint
ALTER TABLE "payment_evidence_document_sources" ADD CONSTRAINT "payment_evidence_document_scope_fk" FOREIGN KEY ("workspace_id","company_id","document_id") REFERENCES "public"."working_documents"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_evidence_document_sources" ADD CONSTRAINT "payment_evidence_original_client_fk" FOREIGN KEY ("workspace_id","original_client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_evidence_document_sources" ADD CONSTRAINT "payment_evidence_registrar_scope_fk" FOREIGN KEY ("workspace_id","registered_by_membership_id","registered_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_internal_task_manager', 'company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_contract_early_preparation', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_project_next_action_coordinator', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user', 'company_knowledge_source_administrator', 'company_knowledge_evidence_reader', 'company_payment_reader', 'company_payment_recorder', 'company_payment_confirmer', 'company_payment_reverser', 'company_payment_evidence_access', 'company_invoice_reader', 'company_invoice_recorder', 'company_external_invoice_access', 'company_opportunity_follow_up_coordinator') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_internal_task_manager', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_project_next_action_coordinator', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user', 'company_knowledge_source_administrator', 'company_knowledge_evidence_reader', 'company_payment_reader', 'company_payment_recorder', 'company_payment_confirmer', 'company_payment_reverser', 'company_payment_evidence_access', 'company_invoice_reader', 'company_invoice_recorder', 'company_external_invoice_access', 'company_opportunity_follow_up_coordinator')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "working_documents" ADD CONSTRAINT "working_documents_state_check" CHECK ("working_documents"."type" IN ('questionnaire', 'mission-deliverable', 'received-contract', 'external-invoice', 'payment-evidence') AND "working_documents"."confidentiality" = 'company-confidential' AND length(trim("working_documents"."title")) BETWEEN 1 AND 200 AND length(trim("working_documents"."purpose")) BETWEEN 1 AND 2000);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_mission_document_version_pdf() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('official', 'superseded') AND EXISTS (
    SELECT 1 FROM public.working_documents d
    WHERE d.workspace_id = NEW.workspace_id AND d.company_id = NEW.company_id
      AND d.id = NEW.document_id AND d.type IN ('mission-deliverable', 'received-contract', 'external-invoice', 'payment-evidence')
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
  IF (document_type IN ('mission-deliverable', 'received-contract', 'external-invoice', 'payment-evidence') AND (NEW.before_url IS NOT NULL OR NEW.after_url IS NOT NULL))
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
      AND v.id = NEW.version_id AND d.type IN ('mission-deliverable', 'received-contract', 'external-invoice', 'payment-evidence')
  ) THEN
    RAISE EXCEPTION 'Mission deliverables do not accept external references'
      USING ERRCODE = '23514', CONSTRAINT = 'mission_document_external_reference_forbidden';
  END IF;
  RETURN NEW;
END;
$$;

--> statement-breakpoint
CREATE FUNCTION payment_evidence_registration_fingerprint(s payment_evidence_document_sources) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT encode(sha256(convert_to(
  '{"companyId":'||to_json(s.company_id::text)::text||',"type":"payment-evidence","clientId":'||to_json(s.original_client_account_id::text)::text||',"payer":'||
  CASE WHEN s.payer_kind='PRIMARY' THEN '{"kind":"PRIMARY"}' ELSE '{"kind":"ADDITIONAL","legalEntityId":'||to_json(s.payer_legal_entity_id::text)::text||'}' END||
  ',"title":'||to_json(s.initial_title)::text||',"purpose":'||to_json(s.initial_purpose)::text||',"sourceDescription":'||to_json(s.source_description)::text||',"receivedOn":'||coalesce(to_json(s.received_on::text)::text,'null')||'}', 'UTF8')), 'hex')
$$;
--> statement-breakpoint
CREATE FUNCTION guard_payment_evidence_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Conserved Payment Evidence context is immutable' USING ERRCODE='23514',CONSTRAINT='payment_evidence_source_immutable'; END IF;
 IF NOT external_invoice_metadata_valid(NEW.source_description,2000) OR NOT external_invoice_metadata_valid(NEW.initial_title,200) OR NOT external_invoice_metadata_valid(NEW.initial_purpose,2000)
 OR (NEW.received_on IS NOT NULL AND (NEW.received_on<DATE '0001-01-01' OR NEW.received_on>DATE '9999-12-31'))
 OR NOT EXISTS (
  SELECT 1 FROM working_documents d
  JOIN client_accounts c ON c.workspace_id=d.workspace_id AND c.id=d.client_id AND c.status='active'
  JOIN client_company_relationships cr ON cr.workspace_id=c.workspace_id AND cr.client_account_id=c.id AND cr.company_id=d.company_id AND cr.status='active'
  JOIN companies co ON co.workspace_id=d.workspace_id AND co.id=d.company_id AND co.status='active'
  JOIN workspace_memberships m ON m.workspace_id=d.workspace_id AND m.id=d.created_by_membership_id AND m.status='active'
  JOIN internal_users u ON u.id=m.internal_user_id AND u.status='active'
  WHERE d.id=NEW.document_id AND d.workspace_id=NEW.workspace_id AND d.company_id=NEW.company_id AND d.type='payment-evidence'
   AND NEW.original_client_account_id=d.client_id AND NEW.original_client_version=c.version-1
   AND NEW.initial_title=d.title AND NEW.initial_purpose=d.purpose AND NEW.receiving_company_label=co.display_name
   AND NEW.registered_by_membership_id=d.created_by_membership_id AND NEW.registered_by_internal_user_id=m.internal_user_id AND NEW.registered_at=d.created_at
   AND d.request_fingerprint=payment_evidence_registration_fingerprint(NEW)
   AND EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=d.workspace_id AND a.company_id=d.company_id AND a.workspace_membership_id=m.id AND a.bundle::text='company_director_client_access' AND a.permission_set_version IN ('v1','v2') AND a.revoked_at IS NULL)
   AND EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=d.workspace_id AND a.company_id=d.company_id AND a.workspace_membership_id=m.id AND a.bundle::text='company_payment_recorder' AND a.permission_set_version='v1' AND a.revoked_at IS NULL)
   AND EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=d.workspace_id AND a.company_id=d.company_id AND a.workspace_membership_id=m.id AND a.bundle::text='company_payment_evidence_access' AND a.permission_set_version='v1' AND a.revoked_at IS NULL)
   AND EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=d.workspace_id AND a.company_id=d.company_id AND a.workspace_membership_id=m.id AND a.bundle::text='company_document_registrar' AND a.permission_set_version IN ('v1','v2','v3') AND a.revoked_at IS NULL)
   AND ((NEW.payer_kind='PRIMARY' AND NEW.payer_legal_entity_id IS NULL AND NEW.payer_legal_name=c.display_name AND NEW.payer_tax_id IS NOT DISTINCT FROM c.tax_id AND NEW.payer_legal_address IS NOT DISTINCT FROM c.address)
     OR (NEW.payer_kind='ADDITIONAL' AND EXISTS(SELECT 1 FROM client_legal_entities e WHERE e.workspace_id=c.workspace_id AND e.client_account_id=c.id AND e.id=NEW.payer_legal_entity_id AND NEW.payer_legal_name=e.legal_name AND NEW.payer_tax_id IS NOT DISTINCT FROM e.tax_id AND NEW.payer_legal_address IS NOT DISTINCT FROM e.legal_address)))
 ) THEN RAISE EXCEPTION 'Payment Evidence must conserve its exact native original payer and registration' USING ERRCODE='23514',CONSTRAINT='payment_evidence_source_binding'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payment_evidence_source_binding BEFORE INSERT OR UPDATE OR DELETE ON payment_evidence_document_sources FOR EACH ROW EXECUTE FUNCTION guard_payment_evidence_source();
--> statement-breakpoint
CREATE FUNCTION guard_payment_evidence_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.type='payment-evidence' THEN RAISE EXCEPTION 'Original Payment Evidence is retained' USING ERRCODE='23514',CONSTRAINT='payment_evidence_identity_immutable'; END IF;
 IF TG_OP='UPDATE' AND (OLD.type='payment-evidence' OR NEW.type='payment-evidence') AND
  (NEW.id,NEW.workspace_id,NEW.company_id,NEW.client_id,NEW.type,NEW.confidentiality,NEW.created_by_membership_id,NEW.created_at,NEW.idempotency_key,NEW.request_fingerprint) IS DISTINCT FROM
  (OLD.id,OLD.workspace_id,OLD.company_id,OLD.client_id,OLD.type,OLD.confidentiality,OLD.created_by_membership_id,OLD.created_at,OLD.idempotency_key,OLD.request_fingerprint)
 THEN RAISE EXCEPTION 'Original Payment Evidence identity is immutable' USING ERRCODE='23514',CONSTRAINT='payment_evidence_identity_immutable'; END IF;
 IF TG_OP<>'DELETE' AND NEW.type='payment-evidence' AND
  (NEW.project_id IS NOT NULL OR NEW.project_revision<>0 OR NOT external_invoice_metadata_valid(NEW.title,200) OR NOT external_invoice_metadata_valid(NEW.purpose,2000))
 THEN RAISE EXCEPTION 'Payment Evidence requires native metadata and forbids Project association' USING ERRCODE='23514',CONSTRAINT='payment_evidence_metadata_project_check'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
--> statement-breakpoint
CREATE TRIGGER working_documents_payment_evidence_identity BEFORE INSERT OR UPDATE OR DELETE ON working_documents FOR EACH ROW EXECUTE FUNCTION guard_payment_evidence_identity();
--> statement-breakpoint
CREATE FUNCTION guard_payment_evidence_presence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d working_documents; target uuid;
BEGIN
 IF TG_TABLE_NAME='working_documents' THEN target:=NEW.id; ELSE target:=NEW.document_id; END IF;
 SELECT * INTO d FROM working_documents WHERE id=target;
 IF FOUND AND (d.type='payment-evidence') IS DISTINCT FROM EXISTS(SELECT 1 FROM payment_evidence_document_sources s WHERE s.document_id=d.id AND s.workspace_id=d.workspace_id AND s.company_id=d.company_id) THEN
  RAISE EXCEPTION 'Payment Evidence requires its immutable native context' USING ERRCODE='23514',CONSTRAINT='payment_evidence_source_required'; END IF;
 IF d.type='payment-evidence' AND (NOT EXISTS(SELECT 1 FROM document_versions v WHERE v.workspace_id=d.workspace_id AND v.company_id=d.company_id AND v.document_id=d.id AND v.number=1 AND v.created_by_membership_id=d.created_by_membership_id AND v.created_at=date_trunc('milliseconds',d.created_at)) OR NOT EXISTS(SELECT 1 FROM document_registration_events e WHERE e.workspace_id=d.workspace_id AND e.company_id=d.company_id AND e.document_id=d.id AND e.actor_membership_id=d.created_by_membership_id AND e.occurred_at=d.created_at)) THEN
  RAISE EXCEPTION 'Payment Evidence registration requires its native initial Version and event' USING ERRCODE='23514',CONSTRAINT='payment_evidence_registration_coupling'; END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER working_documents_payment_evidence_required AFTER INSERT OR UPDATE ON working_documents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.type='payment-evidence') EXECUTE FUNCTION guard_payment_evidence_presence();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER payment_evidence_source_presence AFTER INSERT ON payment_evidence_document_sources DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_payment_evidence_presence();

--> statement-breakpoint
CREATE FUNCTION access_require_payment_evidence_mutation(w uuid,c uuid,m uuid,operation text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE registrar_versions text[];
BEGIN
 IF operation NOT IN ('correct','drafted','designated_official','representation_added') THEN
  RAISE EXCEPTION 'Payment Evidence has no external-reference command' USING ERRCODE='23514',CONSTRAINT='payment_evidence_native_command_forbidden'; END IF;
 registrar_versions:=CASE WHEN operation IN ('drafted','representation_added') THEN ARRAY['v3'] WHEN operation='correct' THEN ARRAY['v2','v3'] ELSE ARRAY['v1','v2','v3'] END;
 IF NOT EXISTS(SELECT 1 FROM workspace_memberships membership JOIN internal_users u ON u.id=membership.internal_user_id JOIN companies company ON company.workspace_id=membership.workspace_id AND company.id=c WHERE membership.workspace_id=w AND membership.id=m AND membership.status='active' AND u.status='active' AND company.status='active')
 OR NOT EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m AND a.bundle::text='company_payment_recorder' AND a.permission_set_version='v1' AND a.revoked_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m AND a.bundle::text='company_payment_evidence_access' AND a.permission_set_version='v1' AND a.revoked_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m AND a.bundle::text='company_document_registrar' AND a.permission_set_version=ANY(registrar_versions) AND a.revoked_at IS NULL)
 OR NOT (EXISTS(SELECT 1 FROM workspace_permission_grants g WHERE g.workspace_id=w AND g.workspace_membership_id=m AND g.permission::text='client.manage') OR EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m AND a.bundle::text='company_director_client_access' AND a.permission_set_version IN ('v1','v2') AND a.revoked_at IS NULL))
 OR (operation='designated_official' AND NOT EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m AND a.bundle::text='company_document_approver' AND a.permission_set_version='v1' AND a.revoked_at IS NULL))
 OR (operation='representation_added' AND (NOT EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m AND a.bundle::text='company_document_content_reader' AND a.permission_set_version='v1' AND a.revoked_at IS NULL) OR NOT EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m AND a.bundle::text='company_document_content_uploader' AND a.permission_set_version='v1' AND a.revoked_at IS NULL)))
 THEN RAISE EXCEPTION 'Current independent Payment Evidence mutation authority is required' USING ERRCODE='23514',CONSTRAINT='payment_evidence_native_authority'; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION guard_payment_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM working_documents d WHERE d.workspace_id=NEW.workspace_id AND d.company_id=NEW.company_id AND d.id=NEW.document_id AND d.type='payment-evidence') THEN
  IF TG_TABLE_NAME='document_correction_commands' THEN PERFORM access_require_payment_evidence_mutation(NEW.workspace_id,NEW.company_id,NEW.actor_membership_id,'correct');
  ELSE PERFORM access_require_payment_evidence_mutation(NEW.workspace_id,NEW.company_id,NEW.actor_membership_id,NEW.action); END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER document_version_commands_payment_evidence_authority BEFORE INSERT ON document_version_commands FOR EACH ROW EXECUTE FUNCTION guard_payment_evidence_mutation();
--> statement-breakpoint
CREATE TRIGGER document_correction_commands_payment_evidence_authority BEFORE INSERT ON document_correction_commands FOR EACH ROW EXECUTE FUNCTION guard_payment_evidence_mutation();
