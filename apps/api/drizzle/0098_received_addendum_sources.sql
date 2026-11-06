ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_received_addendum_access_assignment.granted' BEFORE 'company_task_result_recorder_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_received_addendum_access_assignment.revoked' BEFORE 'company_task_result_recorder_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_received_addendum_access' BEFORE 'company_task_result_recorder';--> statement-breakpoint
CREATE TABLE "received_addendum_document_relations" (
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
	"initial_title" text NOT NULL,
	"initial_purpose" text NOT NULL,
	"received_on" date,
	"registered_by_membership_id" uuid NOT NULL,
	"registered_by_internal_user_id" uuid NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	CONSTRAINT "received_addendum_relation_values_check" CHECK ("received_addendum_document_relations"."contract_version_number">0 AND "received_addendum_document_relations"."illustrative_reference">0 AND length(trim("received_addendum_document_relations"."source_description")) BETWEEN 1 AND 2000 AND "received_addendum_document_relations"."source_description"=trim("received_addendum_document_relations"."source_description") AND (("received_addendum_document_relations"."recipient_kind"='PRIMARY' AND "received_addendum_document_relations"."recipient_additional_legal_entity_id" IS NULL) OR ("received_addendum_document_relations"."recipient_kind"='ADDITIONAL' AND "received_addendum_document_relations"."recipient_additional_legal_entity_id" IS NOT NULL)))
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "working_documents" DROP CONSTRAINT "working_documents_state_check";--> statement-breakpoint
ALTER TABLE "received_addendum_document_relations" ADD CONSTRAINT "received_addendum_document_scope_fk" FOREIGN KEY ("workspace_id","company_id","document_id") REFERENCES "public"."working_documents"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "received_addendum_document_relations" ADD CONSTRAINT "received_addendum_contract_version_scope_fk" FOREIGN KEY ("workspace_id","company_id","contract_id","contract_version_id") REFERENCES "public"."contract_versions"("workspace_id","company_id","contract_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "received_addendum_document_relations" ADD CONSTRAINT "received_addendum_registrar_scope_fk" FOREIGN KEY ("workspace_id","registered_by_membership_id","registered_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_internal_task_manager', 'company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_contract_early_preparation', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_project_next_action_coordinator', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_received_addendum_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user', 'company_knowledge_source_administrator', 'company_knowledge_evidence_reader', 'company_payment_reader', 'company_payment_recorder', 'company_payment_confirmer', 'company_payment_reverser', 'company_payment_evidence_access', 'company_invoice_reader', 'company_invoice_recorder', 'company_external_invoice_access', 'company_opportunity_follow_up_coordinator') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_internal_task_manager', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_project_next_action_coordinator', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_received_addendum_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user', 'company_knowledge_source_administrator', 'company_knowledge_evidence_reader', 'company_payment_reader', 'company_payment_recorder', 'company_payment_confirmer', 'company_payment_reverser', 'company_payment_evidence_access', 'company_invoice_reader', 'company_invoice_recorder', 'company_external_invoice_access', 'company_opportunity_follow_up_coordinator')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "working_documents" ADD CONSTRAINT "working_documents_state_check" CHECK ("working_documents"."type" IN ('questionnaire', 'mission-deliverable', 'received-contract', 'external-invoice', 'payment-evidence', 'received-addendum') AND "working_documents"."confidentiality" = 'company-confidential' AND length(trim("working_documents"."title")) BETWEEN 1 AND 200 AND length(trim("working_documents"."purpose")) BETWEEN 1 AND 2000);
--> statement-breakpoint
-- Contract owns the genuine exact executed-parent predicate. The existing native
-- validator conserves approval, declaration, exact signing PDF, receipt and event.
CREATE FUNCTION contract_received_addendum_parent_eligible(w uuid,c uuid,parent uuid,version uuid) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM contracts root JOIN contract_versions v ON v.workspace_id=root.workspace_id AND v.company_id=root.company_id AND v.contract_id=root.id
  JOIN contract_signing_declarations d ON d.workspace_id=v.workspace_id AND d.company_id=v.company_id AND d.contract_id=v.contract_id AND d.contract_version_id=v.id
  WHERE root.workspace_id=w AND root.company_id=c AND root.id=parent AND v.id=version AND root.kind='CONTRACT' AND root.origin='COMPANY_MODEL_OFFER' AND v.provenance='COMPANY_MODEL_OFFER' AND v.decision_state='APPROVED' AND v.execution_state='EXECUTED') THEN RETURN false; END IF;
 PERFORM validate_reported_contract_signing(version);
 RETURN true;
 EXCEPTION WHEN check_violation OR invalid_text_representation OR invalid_parameter_value OR data_exception THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE FUNCTION received_addendum_registration_fingerprint(r received_addendum_document_relations) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT encode(sha256(convert_to(
  '{"companyId":'||to_json(r.company_id::text)::text||',"type":"received-addendum","selection":{"parentContractId":'||to_json(r.contract_id::text)::text||',"parentContractVersionId":'||to_json(r.contract_version_id::text)::text||'},"title":'||to_json(r.initial_title)::text||',"purpose":'||to_json(r.initial_purpose)::text||',"sourceDescription":'||to_json(r.source_description)::text||',"receivedOn":'||coalesce(to_json(r.received_on::text)::text,'null')||'}', 'UTF8')), 'hex')
$$;
--> statement-breakpoint
CREATE FUNCTION received_addendum_registration_authorized(w uuid,c uuid,m uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM companies co WHERE co.workspace_id=w AND co.id=c AND co.status='active')
 AND EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m AND a.bundle::text='company_document_registrar' AND a.permission_set_version IN ('v1','v2','v3') AND a.revoked_at IS NULL)
 AND EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m AND a.bundle::text='company_received_addendum_access' AND a.permission_set_version='v1' AND a.revoked_at IS NULL)
 AND (EXISTS(SELECT 1 FROM workspace_permission_grants g WHERE g.workspace_id=w AND g.workspace_membership_id=m AND g.permission::text='client.manage')
  OR EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m AND a.bundle::text='company_director_client_access' AND a.permission_set_version IN ('v1','v2') AND a.revoked_at IS NULL))
 AND EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m AND a.bundle::text IN ('company_contract_preparer','company_contract_approver') AND a.permission_set_version IN ('v1','v2') AND a.revoked_at IS NULL)
 AND EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m AND a.bundle::text='company_commercial_intake' AND a.permission_set_version IN ('v1','v2','v3','v4') AND a.revoked_at IS NULL)
$$;
--> statement-breakpoint
CREATE FUNCTION guard_received_addendum_relation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d working_documents%ROWTYPE; v contract_versions%ROWTYPE; c contracts%ROWTYPE; member workspace_memberships%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_addendum_immutable',MESSAGE='Received Addendum sources and attribution are immutable.'; END IF;
 SELECT * INTO d FROM working_documents WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.document_id;
 SELECT * INTO c FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.contract_id;
 SELECT * INTO v FROM contract_versions WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND contract_id=NEW.contract_id AND id=NEW.contract_version_id;
 SELECT * INTO member FROM workspace_memberships WHERE workspace_id=d.workspace_id AND id=d.created_by_membership_id;
 IF d.id IS NULL OR d.type<>'received-addendum' OR c.id IS NULL OR v.id IS NULL
 OR d.client_id IS DISTINCT FROM c.original_client_account_id OR NEW.opportunity_id IS DISTINCT FROM c.opportunity_id
 OR NEW.contract_version_number IS DISTINCT FROM v.version_number OR NEW.illustrative_reference IS DISTINCT FROM c.illustrative_reference
 OR (NEW.recipient_kind,NEW.recipient_additional_legal_entity_id,NEW.recipient_legal_name,NEW.recipient_tax_id,NEW.recipient_legal_address)
 IS DISTINCT FROM (v.recipient_kind,v.recipient_additional_legal_entity_id,v.recipient_legal_name,v.recipient_tax_id,v.recipient_legal_address)
 OR NEW.registered_by_membership_id IS DISTINCT FROM d.created_by_membership_id OR NEW.registered_by_internal_user_id IS DISTINCT FROM member.internal_user_id
 OR NOT received_addendum_registration_authorized(d.workspace_id,d.company_id,d.created_by_membership_id)
 OR d.request_fingerprint IS DISTINCT FROM received_addendum_registration_fingerprint(NEW)
 OR NEW.registered_at IS DISTINCT FROM d.created_at OR NEW.initial_title IS DISTINCT FROM d.title OR NEW.initial_purpose IS DISTINCT FROM d.purpose
 OR NOT external_invoice_metadata_valid(NEW.source_description,2000) OR NOT external_invoice_metadata_valid(NEW.initial_title,200) OR NOT external_invoice_metadata_valid(NEW.initial_purpose,2000)
 OR (NEW.received_on IS NOT NULL AND (NEW.received_on<'0001-01-01'::date OR NEW.received_on>'9999-12-31'::date))
 OR NOT EXISTS(SELECT 1 FROM client_accounts client JOIN client_company_relationships rel ON rel.workspace_id=client.workspace_id AND rel.client_account_id=client.id AND rel.company_id=d.company_id AND rel.status='active' WHERE client.workspace_id=d.workspace_id AND client.id=d.client_id AND client.status='active')
 OR member.status<>'active' OR NOT EXISTS(SELECT 1 FROM internal_users u WHERE u.id=member.internal_user_id AND u.status='active')
 OR NOT contract_received_addendum_parent_eligible(NEW.workspace_id,NEW.company_id,NEW.contract_id,NEW.contract_version_id)
 THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_addendum_exact_parent',MESSAGE='Received Addendum requires its exact original executed parent and attributable source.'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER received_addendum_relation_guard BEFORE INSERT OR UPDATE OR DELETE ON received_addendum_document_relations FOR EACH ROW EXECUTE FUNCTION guard_received_addendum_relation();
--> statement-breakpoint
CREATE FUNCTION guard_received_addendum_presence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d working_documents%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='working_documents' THEN SELECT * INTO d FROM working_documents WHERE id=NEW.id; ELSE SELECT * INTO d FROM working_documents WHERE id=NEW.document_id; END IF;
 IF FOUND AND (d.type='received-addendum') IS DISTINCT FROM EXISTS(SELECT 1 FROM received_addendum_document_relations r WHERE r.workspace_id=d.workspace_id AND r.company_id=d.company_id AND r.document_id=d.id) THEN
 RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_addendum_relation_required',MESSAGE='Received Addendum family requires its immutable relation.'; END IF;
 IF d.type='received-addendum' AND (NOT EXISTS(SELECT 1 FROM document_versions v WHERE v.workspace_id=d.workspace_id AND v.company_id=d.company_id AND v.document_id=d.id AND v.number=1 AND v.created_by_membership_id=d.created_by_membership_id AND v.created_at=date_trunc('milliseconds',d.created_at)) OR NOT EXISTS(SELECT 1 FROM document_registration_events e WHERE e.workspace_id=d.workspace_id AND e.company_id=d.company_id AND e.document_id=d.id AND e.actor_membership_id=d.created_by_membership_id AND e.occurred_at=d.created_at)) THEN
 RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_addendum_registration_coupling',MESSAGE='Received Addendum requires its native initial Version and registration event.'; END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER working_documents_received_addendum_required AFTER INSERT OR UPDATE ON working_documents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_received_addendum_presence();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER received_addendum_relation_presence AFTER INSERT ON received_addendum_document_relations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_received_addendum_presence();
--> statement-breakpoint
CREATE FUNCTION guard_received_addendum_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.type='received-addendum' THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_addendum_identity',MESSAGE='Received Addendum originals are retained.'; END IF;
 IF TG_OP='UPDATE' AND (OLD.type='received-addendum' OR NEW.type='received-addendum') AND (NEW.id,NEW.workspace_id,NEW.company_id,NEW.client_id,NEW.type,NEW.confidentiality,NEW.created_by_membership_id,NEW.created_at,NEW.idempotency_key,NEW.request_fingerprint) IS DISTINCT FROM (OLD.id,OLD.workspace_id,OLD.company_id,OLD.client_id,OLD.type,OLD.confidentiality,OLD.created_by_membership_id,OLD.created_at,OLD.idempotency_key,OLD.request_fingerprint) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_addendum_identity',MESSAGE='Received Addendum registration identity is immutable.'; END IF;
 IF TG_OP<>'DELETE' AND NEW.type='received-addendum' AND (NEW.project_id IS NOT NULL OR NEW.project_revision<>0 OR NOT external_invoice_metadata_valid(NEW.title,200) OR NOT external_invoice_metadata_valid(NEW.purpose,2000)) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_addendum_identity',MESSAGE='Received Addendum permits only native title and purpose corrections.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER working_documents_received_addendum_identity BEFORE INSERT OR UPDATE OR DELETE ON working_documents FOR EACH ROW EXECUTE FUNCTION guard_received_addendum_identity();
--> statement-breakpoint
-- Separate new-family guards leave every applied Source/Payment function intact.
CREATE FUNCTION guard_received_addendum_pdf() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status IN ('official','superseded') AND EXISTS(SELECT 1 FROM working_documents d WHERE d.workspace_id=NEW.workspace_id AND d.company_id=NEW.company_id AND d.id=NEW.document_id AND d.type='received-addendum') AND NOT EXISTS(SELECT 1 FROM document_pdfs p WHERE p.workspace_id=NEW.workspace_id AND p.company_id=NEW.company_id AND p.document_id=NEW.document_id AND p.version_id=NEW.id AND p.scan_outcome='clean') THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_addendum_clean_pdf',MESSAGE='Official received Addendum content requires a preserved clean PDF.'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER received_addendum_version_pdf BEFORE INSERT OR UPDATE ON document_versions FOR EACH ROW EXECUTE FUNCTION guard_received_addendum_pdf();
--> statement-breakpoint
CREATE FUNCTION guard_received_addendum_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM document_versions v JOIN working_documents d ON d.workspace_id=v.workspace_id AND d.company_id=v.company_id AND d.id=v.document_id WHERE v.workspace_id=NEW.workspace_id AND v.company_id=NEW.company_id AND v.id=NEW.version_id AND d.type='received-addendum') THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_addendum_no_external_reference',MESSAGE='Received Addendum sources preserve PDF content only.'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER received_addendum_no_reference BEFORE INSERT OR UPDATE ON document_representations FOR EACH ROW EXECUTE FUNCTION guard_received_addendum_reference();
--> statement-breakpoint
CREATE FUNCTION guard_received_addendum_correction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM working_documents d WHERE d.workspace_id=NEW.workspace_id AND d.company_id=NEW.company_id AND d.id=NEW.document_id AND d.type='received-addendum') AND (NEW.before_url IS NOT NULL OR NEW.after_url IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_addendum_correction',MESSAGE='Received Addendum corrections change title and purpose only.'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER received_addendum_correction BEFORE INSERT ON document_correction_commands FOR EACH ROW EXECUTE FUNCTION guard_received_addendum_correction();
