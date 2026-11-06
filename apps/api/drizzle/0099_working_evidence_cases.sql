ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_working_evidence_case_reader_assignment.granted' BEFORE 'company_opportunity_follow_up_coordinator_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_working_evidence_case_reader_assignment.revoked' BEFORE 'company_opportunity_follow_up_coordinator_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_working_evidence_case_recorder_assignment.granted' BEFORE 'company_opportunity_follow_up_coordinator_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_working_evidence_case_recorder_assignment.revoked' BEFORE 'company_opportunity_follow_up_coordinator_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_received_audit_source_access_assignment.granted' BEFORE 'company_opportunity_follow_up_coordinator_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_received_audit_source_access_assignment.revoked' BEFORE 'company_opportunity_follow_up_coordinator_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_working_evidence_case_reader' BEFORE 'company_opportunity_follow_up_coordinator';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_working_evidence_case_recorder' BEFORE 'company_opportunity_follow_up_coordinator';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_received_audit_source_access' BEFORE 'company_opportunity_follow_up_coordinator';--> statement-breakpoint
CREATE TABLE "received_audit_source_registrations" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"original_client_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	"original_title" text NOT NULL,
	"original_purpose" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "working_evidence_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"original_client_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"current_revision_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "working_evidence_cases_revision_check" CHECK ("working_evidence_cases"."revision" BETWEEN 1 AND 2147483647)
);
--> statement-breakpoint
CREATE TABLE "working_evidence_events" (
	"revision_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"action" text NOT NULL,
	"metadata" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "working_evidence_outputs" (
	"revision_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"statement" "bytea" NOT NULL,
	"statement_sha256" text NOT NULL,
	"annex" "bytea" NOT NULL,
	"annex_sha256" text NOT NULL,
	CONSTRAINT "working_evidence_output_bounds_check" CHECK (octet_length("working_evidence_outputs"."statement") BETWEEN 1 AND 262144 AND octet_length("working_evidence_outputs"."annex") BETWEEN 1 AND 16777216 AND "working_evidence_outputs"."statement_sha256"=encode(sha256("working_evidence_outputs"."statement"),'hex') AND "working_evidence_outputs"."annex_sha256"=encode(sha256("working_evidence_outputs"."annex"),'hex'))
);
--> statement-breakpoint
CREATE TABLE "working_evidence_receipts" (
	"command_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"intent" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"receipt" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "working_evidence_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"previous_revision_id" uuid,
	"action" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"reason" text,
	"title" text NOT NULL,
	"declared_context" text,
	"process" text NOT NULL,
	"statement" text NOT NULL,
	"observation_note" text,
	"client_version_before" integer NOT NULL,
	CONSTRAINT "working_evidence_revisions_action_check" CHECK (("working_evidence_revisions"."action"='RECORD' AND "working_evidence_revisions"."revision_number"=1 AND "working_evidence_revisions"."previous_revision_id" IS NULL AND "working_evidence_revisions"."reason" IS NULL) OR ("working_evidence_revisions"."action"='CORRECT' AND "working_evidence_revisions"."revision_number">1 AND "working_evidence_revisions"."previous_revision_id" IS NOT NULL AND "working_evidence_revisions"."reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "working_evidence_supports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"representation_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "working_evidence_support_position_check" CHECK ("working_evidence_supports"."position" BETWEEN 1 AND 3)
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "working_documents" DROP CONSTRAINT "working_documents_state_check";--> statement-breakpoint
CREATE UNIQUE INDEX "working_evidence_cases_scope_unique" ON "working_evidence_cases" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "working_evidence_receipt_key_unique" ON "working_evidence_receipts" USING btree ("workspace_id","actor_membership_id","command_id");--> statement-breakpoint
CREATE UNIQUE INDEX "working_evidence_receipt_revision_unique" ON "working_evidence_receipts" USING btree ("revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "working_evidence_revisions_scope_unique" ON "working_evidence_revisions" USING btree ("workspace_id","company_id","case_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "working_evidence_revisions_number_unique" ON "working_evidence_revisions" USING btree ("workspace_id","company_id","case_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "working_evidence_support_position_unique" ON "working_evidence_supports" USING btree ("revision_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "working_evidence_support_tuple_unique" ON "working_evidence_supports" USING btree ("revision_id","document_id","version_id","representation_id");--> statement-breakpoint
ALTER TABLE "received_audit_source_registrations" ADD CONSTRAINT "received_audit_source_document_fk" FOREIGN KEY ("workspace_id","company_id","document_id") REFERENCES "public"."working_documents"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_evidence_cases" ADD CONSTRAINT "working_evidence_cases_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_evidence_cases" ADD CONSTRAINT "working_evidence_cases_project_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_evidence_cases" ADD CONSTRAINT "working_evidence_cases_client_fk" FOREIGN KEY ("workspace_id","original_client_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_evidence_events" ADD CONSTRAINT "working_evidence_event_revision_fk" FOREIGN KEY ("workspace_id","company_id","case_id","revision_id") REFERENCES "public"."working_evidence_revisions"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_evidence_outputs" ADD CONSTRAINT "working_evidence_output_revision_fk" FOREIGN KEY ("workspace_id","company_id","case_id","revision_id") REFERENCES "public"."working_evidence_revisions"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_evidence_receipts" ADD CONSTRAINT "working_evidence_receipt_revision_fk" FOREIGN KEY ("workspace_id","company_id","case_id","revision_id") REFERENCES "public"."working_evidence_revisions"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_evidence_revisions" ADD CONSTRAINT "working_evidence_revisions_case_fk" FOREIGN KEY ("workspace_id","company_id","case_id") REFERENCES "public"."working_evidence_cases"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_evidence_revisions" ADD CONSTRAINT "working_evidence_revisions_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_evidence_supports" ADD CONSTRAINT "working_evidence_support_revision_fk" FOREIGN KEY ("workspace_id","company_id","case_id","revision_id") REFERENCES "public"."working_evidence_revisions"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_evidence_supports" ADD CONSTRAINT "working_evidence_support_pdf_fk" FOREIGN KEY ("workspace_id","company_id","document_id","version_id","representation_id") REFERENCES "public"."document_pdfs"("workspace_id","company_id","document_id","version_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_internal_task_manager', 'company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_contract_early_preparation', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_project_next_action_coordinator', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_received_addendum_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user', 'company_knowledge_source_administrator', 'company_knowledge_evidence_reader', 'company_payment_reader', 'company_payment_recorder', 'company_payment_confirmer', 'company_payment_reverser', 'company_payment_evidence_access', 'company_invoice_reader', 'company_invoice_recorder', 'company_external_invoice_access', 'company_opportunity_follow_up_coordinator', 'company_working_evidence_case_reader', 'company_working_evidence_case_recorder', 'company_received_audit_source_access') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_internal_task_manager', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_project_next_action_coordinator', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_received_addendum_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user', 'company_knowledge_source_administrator', 'company_knowledge_evidence_reader', 'company_payment_reader', 'company_payment_recorder', 'company_payment_confirmer', 'company_payment_reverser', 'company_payment_evidence_access', 'company_invoice_reader', 'company_invoice_recorder', 'company_external_invoice_access', 'company_opportunity_follow_up_coordinator', 'company_working_evidence_case_reader', 'company_working_evidence_case_recorder', 'company_received_audit_source_access')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "working_documents" ADD CONSTRAINT "working_documents_state_check" CHECK ("working_documents"."type" IN ('questionnaire', 'mission-deliverable', 'received-contract', 'external-invoice', 'payment-evidence', 'received-addendum', 'received-audit-source') AND "working_documents"."confidentiality" = 'company-confidential' AND length(trim("working_documents"."title")) BETWEEN 1 AND 200 AND length(trim("working_documents"."purpose")) BETWEEN 1 AND 2000);--> statement-breakpoint
-- New source facts and Case facts are append-only; old families and captures are untouched.
CREATE FUNCTION working_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='working_evidence_immutable',MESSAGE='Preserved working evidence is immutable.';
END $$;
--> statement-breakpoint
CREATE FUNCTION working_evidence_text_valid(value text,maximum integer) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT value IS NOT NULL AND external_invoice_metadata_valid(value,maximum) AND value=trim(value)
$$;
--> statement-breakpoint
CREATE FUNCTION guard_received_audit_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d working_documents%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_audit_source_immutable',MESSAGE='Received originals are retained.'; END IF;
 SELECT * INTO d FROM working_documents WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.document_id;
 IF d.id IS NULL OR d.type<>'received-audit-source' OR d.client_id<>NEW.original_client_id OR d.created_by_membership_id<>NEW.actor_membership_id OR d.created_at<>NEW.registered_at
 OR NEW.original_title<>d.title OR NEW.original_purpose<>d.purpose OR NOT working_evidence_text_valid(NEW.original_title,200) OR NOT working_evidence_text_valid(NEW.original_purpose,2000)
 THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_audit_source_identity',MESSAGE='A source requires its original native scope and attribution.'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER received_audit_source_guard BEFORE INSERT OR UPDATE OR DELETE ON received_audit_source_registrations FOR EACH ROW EXECUTE FUNCTION guard_received_audit_source();
--> statement-breakpoint
CREATE FUNCTION guard_received_audit_source_presence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d working_documents%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='working_documents' THEN SELECT * INTO d FROM working_documents WHERE id=NEW.id; ELSE SELECT * INTO d FROM working_documents WHERE id=NEW.document_id; END IF;
 IF d.id IS NOT NULL AND ((d.type='received-audit-source') IS DISTINCT FROM EXISTS(SELECT 1 FROM received_audit_source_registrations s WHERE s.workspace_id=d.workspace_id AND s.company_id=d.company_id AND s.document_id=d.id)) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_audit_source_presence',MESSAGE='The source family requires immutable native registration.'; END IF;
 IF d.type='received-audit-source' AND (d.project_id IS NOT NULL OR d.project_revision<>0 OR NOT EXISTS(SELECT 1 FROM document_versions v WHERE v.workspace_id=d.workspace_id AND v.company_id=d.company_id AND v.document_id=d.id AND v.number=1 AND v.created_by_membership_id=d.created_by_membership_id) OR NOT EXISTS(SELECT 1 FROM document_registration_events e WHERE e.workspace_id=d.workspace_id AND e.company_id=d.company_id AND e.document_id=d.id AND e.actor_membership_id=d.created_by_membership_id AND e.occurred_at=d.created_at)) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_audit_source_native_coupling',MESSAGE='The source requires its native registration and initial Version.'; END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER received_audit_source_document_presence AFTER INSERT OR UPDATE ON working_documents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_received_audit_source_presence();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER received_audit_source_registration_presence AFTER INSERT ON received_audit_source_registrations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_received_audit_source_presence();
--> statement-breakpoint
CREATE FUNCTION guard_received_audit_source_native() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d working_documents%ROWTYPE; source_id uuid;
BEGIN
 IF TG_TABLE_NAME='working_documents' THEN
  IF TG_OP='DELETE' AND OLD.type='received-audit-source' THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_audit_source_retained',MESSAGE='Received originals are retained.'; END IF;
  IF TG_OP='UPDATE' AND (OLD.type='received-audit-source' OR NEW.type='received-audit-source') AND (NEW.type,NEW.workspace_id,NEW.company_id,NEW.client_id,NEW.created_by_membership_id,NEW.created_at,NEW.idempotency_key,NEW.request_fingerprint,NEW.project_id,NEW.project_revision) IS DISTINCT FROM (OLD.type,OLD.workspace_id,OLD.company_id,OLD.client_id,OLD.created_by_membership_id,OLD.created_at,OLD.idempotency_key,OLD.request_fingerprint,OLD.project_id,OLD.project_revision) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_audit_source_identity',MESSAGE='Source identity is immutable.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='document_representations' THEN SELECT document_id INTO source_id FROM document_versions WHERE id=NEW.version_id; ELSE source_id=NEW.document_id; END IF;
 SELECT * INTO d FROM working_documents WHERE id=source_id;
 IF d.type<>'received-audit-source' OR d.id IS NULL THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='document_representations' THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_audit_source_no_reference',MESSAGE='Received sources preserve only native PDFs.'; END IF;
 IF TG_TABLE_NAME='document_correction_commands' THEN IF (NEW.before_url IS NOT NULL OR NEW.after_url IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_audit_source_no_url',MESSAGE='Source correction retains its exact identity.'; END IF; END IF;
 IF TG_TABLE_NAME='document_versions' THEN IF NEW.status IN ('official','superseded') AND NOT EXISTS(SELECT 1 FROM document_pdfs p WHERE p.workspace_id=NEW.workspace_id AND p.company_id=NEW.company_id AND p.document_id=NEW.document_id AND p.version_id=NEW.id AND p.scan_outcome='clean') THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_audit_source_pdf_required',MESSAGE='Source designation requires preserved clean content.'; END IF; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER received_audit_source_native_identity BEFORE UPDATE OR DELETE ON working_documents FOR EACH ROW EXECUTE FUNCTION guard_received_audit_source_native();
--> statement-breakpoint
CREATE TRIGGER received_audit_source_no_reference BEFORE INSERT OR UPDATE ON document_representations FOR EACH ROW EXECUTE FUNCTION guard_received_audit_source_native();
--> statement-breakpoint
CREATE TRIGGER received_audit_source_correction BEFORE INSERT ON document_correction_commands FOR EACH ROW EXECUTE FUNCTION guard_received_audit_source_native();
--> statement-breakpoint
CREATE TRIGGER received_audit_source_designation BEFORE INSERT OR UPDATE ON document_versions FOR EACH ROW EXECUTE FUNCTION guard_received_audit_source_native();
--> statement-breakpoint
CREATE FUNCTION guard_working_evidence_case_head() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND ((NEW.id,NEW.workspace_id,NEW.company_id,NEW.project_id,NEW.original_client_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.workspace_id,OLD.company_id,OLD.project_id,OLD.original_client_id,OLD.created_at) OR NEW.revision<>OLD.revision+1 OR NEW.current_revision_id=OLD.current_revision_id)) OR (TG_OP='INSERT' AND NEW.revision<>1) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='working_evidence_case_head',MESSAGE='A Case advances one complete immutable revision.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM projects p WHERE p.workspace_id=NEW.workspace_id AND p.company_id=NEW.company_id AND p.id=NEW.project_id AND p.client_account_id=NEW.original_client_id AND p.status IN ('preparatory','active','on_hold')) OR NOT EXISTS(SELECT 1 FROM client_accounts c JOIN client_company_relationships r ON r.workspace_id=c.workspace_id AND r.client_account_id=c.id AND r.company_id=NEW.company_id AND r.status='active' WHERE c.workspace_id=NEW.workspace_id AND c.id=NEW.original_client_id AND c.status='active') THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='working_evidence_original_context',MESSAGE='New use requires its active original context.'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER working_evidence_case_head BEFORE INSERT OR UPDATE OR DELETE ON working_evidence_cases FOR EACH ROW EXECUTE FUNCTION guard_working_evidence_case_head();
--> statement-breakpoint
CREATE FUNCTION working_evidence_actor_authorized(w uuid,c uuid,m uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM workspace_memberships wm JOIN internal_users u ON u.id=wm.internal_user_id WHERE wm.workspace_id=w AND wm.id=m AND wm.status='active' AND u.status='active')
 AND EXISTS(SELECT 1 FROM companies co WHERE co.workspace_id=w AND co.id=c AND co.status='active')
 AND NOT EXISTS(SELECT b FROM unnest(ARRAY['company_working_evidence_case_recorder','company_received_audit_source_access','company_document_content_reader']) b WHERE NOT EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m AND a.bundle::text=b AND a.permission_set_version='v1' AND a.revoked_at IS NULL))
 AND EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m AND a.bundle::text='company_project_access' AND a.permission_set_version IN ('v1','v2') AND a.revoked_at IS NULL)
 AND EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m AND a.bundle::text='company_document_registrar' AND a.permission_set_version IN ('v1','v2','v3') AND a.revoked_at IS NULL)
 AND (EXISTS(SELECT 1 FROM workspace_permission_grants g WHERE g.workspace_id=w AND g.workspace_membership_id=m AND g.permission::text='client.manage') OR EXISTS(SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m AND a.bundle::text='company_director_client_access' AND a.permission_set_version IN ('v1','v2') AND a.revoked_at IS NULL))
$$;
--> statement-breakpoint
CREATE FUNCTION guard_working_evidence_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h working_evidence_cases%ROWTYPE; prior working_evidence_revisions%ROWTYPE;
BEGIN
 SELECT * INTO h FROM working_evidence_cases WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.case_id;
 IF NEW.previous_revision_id IS NOT NULL THEN SELECT * INTO prior FROM working_evidence_revisions WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND case_id=NEW.case_id AND id=NEW.previous_revision_id; END IF;
 IF h.id IS NULL OR NOT working_evidence_actor_authorized(NEW.workspace_id,NEW.company_id,NEW.actor_membership_id) OR NOT working_evidence_text_valid(NEW.title,200) OR NOT working_evidence_text_valid(NEW.process,200) OR NOT working_evidence_text_valid(NEW.statement,2000) OR (NEW.declared_context IS NOT NULL AND NOT working_evidence_text_valid(NEW.declared_context,2000)) OR (NEW.observation_note IS NOT NULL AND NOT working_evidence_text_valid(NEW.observation_note,2000)) OR (NEW.reason IS NOT NULL AND NOT working_evidence_text_valid(NEW.reason,2000)) OR NEW.client_version_before<1 OR NEW.client_version_before IS DISTINCT FROM (SELECT version FROM client_accounts WHERE workspace_id=h.workspace_id AND id=h.original_client_id)
 OR (NEW.revision_number=1 AND (h.revision<>1 OR h.current_revision_id<>NEW.id OR NEW.recorded_at<>h.created_at))
 OR (NEW.revision_number>1 AND (prior.id IS NULL OR prior.revision_number<>NEW.revision_number-1 OR h.current_revision_id<>prior.id OR h.revision<>prior.revision_number))
 THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='working_evidence_revision_integrity',MESSAGE='A complete attributable revision is required.'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER working_evidence_revision_insert BEFORE INSERT ON working_evidence_revisions FOR EACH ROW EXECUTE FUNCTION guard_working_evidence_revision();
--> statement-breakpoint
CREATE FUNCTION guard_working_evidence_support() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h working_evidence_cases%ROWTYPE; d working_documents%ROWTYPE; v document_versions%ROWTYPE; p document_pdfs%ROWTYPE; actual jsonb;
BEGIN
 SELECT c.* INTO h FROM working_evidence_cases c JOIN working_evidence_revisions r ON r.workspace_id=c.workspace_id AND r.company_id=c.company_id AND r.case_id=c.id WHERE r.id=NEW.revision_id AND r.workspace_id=NEW.workspace_id AND r.company_id=NEW.company_id AND r.case_id=NEW.case_id;
 SELECT * INTO d FROM working_documents WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.document_id;
 SELECT * INTO v FROM document_versions WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND document_id=NEW.document_id AND id=NEW.version_id;
 SELECT * INTO p FROM document_pdfs WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND document_id=NEW.document_id AND version_id=NEW.version_id AND id=NEW.representation_id;
 actual=jsonb_build_object('evidenceId',NEW.id,'documentId',NEW.document_id,'versionId',NEW.version_id,'versionNumber',v.number,'representationId',NEW.representation_id,'sourceTitle',v.frozen_title,'sourcePurpose',v.frozen_purpose,'filename',p.file_name,'mediaType',p.media_type,'sizeBytes',p.size,'sha256',p.sha256,'locator',NEW.snapshot->'locator','supportNote',NEW.snapshot->'supportNote');
 IF h.id IS NULL OR d.id IS NULL OR d.type<>'received-audit-source' OR d.client_id<>h.original_client_id OR d.project_id IS NOT NULL OR v.id IS NULL OR v.status NOT IN ('official','superseded') OR p.id IS NULL OR p.scan_outcome<>'clean' OR p.upload_revision<>(SELECT max(x.upload_revision) FROM document_pdfs x WHERE x.workspace_id=p.workspace_id AND x.company_id=p.company_id AND x.document_id=p.document_id AND x.version_id=p.version_id) OR p.sha256<>encode(sha256(p.content),'hex') OR p.size<>octet_length(p.content) OR NEW.snapshot IS DISTINCT FROM actual OR NOT working_evidence_text_valid(NEW.snapshot->>'supportNote',2000) OR ((NEW.snapshot->'locator')<>'null'::jsonb AND NOT working_evidence_text_valid(NEW.snapshot->>'locator',500)) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='working_evidence_exact_support',MESSAGE='An exact frozen native original is required.'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER working_evidence_support_insert BEFORE INSERT ON working_evidence_supports FOR EACH ROW EXECUTE FUNCTION guard_working_evidence_support();
--> statement-breakpoint
CREATE FUNCTION guard_working_evidence_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h working_evidence_cases%ROWTYPE; r working_evidence_revisions%ROWTYPE; k working_evidence_receipts%ROWTYPE; e working_evidence_events%ROWTYPE; support_count integer; last_position integer; client_version integer; selected_revision uuid; expected_intent jsonb;
BEGIN
 IF TG_TABLE_NAME='working_evidence_cases' THEN SELECT * INTO h FROM working_evidence_cases WHERE id=NEW.id;
 ELSE SELECT * INTO h FROM working_evidence_cases WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.case_id; END IF;
 SELECT * INTO r FROM working_evidence_revisions WHERE workspace_id=h.workspace_id AND company_id=h.company_id AND case_id=h.id AND id=h.current_revision_id;
 IF h.id IS NULL OR r.id IS NULL OR r.revision_number<>h.revision OR (SELECT count(*) FROM working_evidence_revisions WHERE workspace_id=h.workspace_id AND company_id=h.company_id AND case_id=h.id)<>h.revision THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='working_evidence_complete_head',MESSAGE='The Case requires its complete contiguous head.'; END IF;
 IF TG_TABLE_NAME<>'working_evidence_cases' THEN
 IF TG_TABLE_NAME='working_evidence_revisions' THEN selected_revision=NEW.id; ELSE selected_revision=NEW.revision_id; END IF;
 SELECT * INTO r FROM working_evidence_revisions WHERE workspace_id=h.workspace_id AND company_id=h.company_id AND case_id=h.id AND id=selected_revision; END IF;
 SELECT * INTO k FROM working_evidence_receipts WHERE workspace_id=r.workspace_id AND company_id=r.company_id AND case_id=r.case_id AND revision_id=r.id;
 SELECT * INTO e FROM working_evidence_events WHERE workspace_id=r.workspace_id AND company_id=r.company_id AND case_id=r.case_id AND revision_id=r.id;
 SELECT count(*),max(position) INTO support_count,last_position FROM working_evidence_supports WHERE workspace_id=r.workspace_id AND company_id=r.company_id AND case_id=r.case_id AND revision_id=r.id;
 expected_intent=jsonb_build_object('format','WORKING_EVIDENCE_CASE_INTENT/1','companyId',h.company_id,'action',r.action,'target',CASE WHEN r.action='RECORD' THEN h.project_id ELSE h.id END,'expectedRevision',r.revision_number-1,'reason',r.reason,'values',jsonb_build_object('title',r.title,'declaredContext',r.declared_context,'process',r.process,'statement',r.statement,'observationNote',r.observation_note,'supports',(SELECT jsonb_agg(jsonb_build_object('documentId',s.document_id,'versionId',s.version_id,'representationId',s.representation_id,'locator',s.snapshot->'locator','supportNote',s.snapshot->'supportNote') ORDER BY s.position) FROM working_evidence_supports s WHERE s.revision_id=r.id)));
 SELECT version INTO client_version FROM client_accounts WHERE workspace_id=h.workspace_id AND id=h.original_client_id;
 IF support_count NOT BETWEEN 1 AND 3 OR last_position<>support_count OR k.revision_id IS NULL OR e.revision_id IS NULL OR client_version<=r.client_version_before OR NOT EXISTS(SELECT 1 FROM working_evidence_outputs o WHERE o.workspace_id=r.workspace_id AND o.company_id=r.company_id AND o.case_id=r.case_id AND o.revision_id=r.id)
 OR (k.actor_membership_id,e.actor_membership_id,e.recorded_at) IS DISTINCT FROM (r.actor_membership_id,r.actor_membership_id,r.recorded_at)
 OR NOT EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=e.workspace_id AND m.id=e.actor_membership_id AND m.internal_user_id=e.actor_internal_user_id)
 OR e.action<>(CASE r.action WHEN 'RECORD' THEN 'working_evidence_case.recorded' ELSE 'working_evidence_case.corrected' END) OR e.metadata<>jsonb_build_object('caseId',r.case_id,'revisionNumber',r.revision_number)
 OR k.intent IS DISTINCT FROM expected_intent OR k.fingerprint<>encode(sha256(convert_to(k.intent::text,'UTF8')),'hex')
 OR k.receipt<>jsonb_build_object('format','WORKING_EVIDENCE_CASE_RECEIPT/1','commandId',k.command_id,'caseId',r.case_id,'revisionId',r.id,'revisionNumber',r.revision_number,'action',r.action,'recordedAt',to_char(r.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
 THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='working_evidence_complete_revision',MESSAGE='A revision requires its immutable supports, outputs, receipt, event and Client fence.'; END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER working_evidence_case_complete AFTER INSERT OR UPDATE ON working_evidence_cases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_working_evidence_complete();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER working_evidence_revision_complete AFTER INSERT ON working_evidence_revisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_working_evidence_complete();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER working_evidence_receipt_complete AFTER INSERT ON working_evidence_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_working_evidence_complete();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER working_evidence_output_complete AFTER INSERT ON working_evidence_outputs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_working_evidence_complete();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER working_evidence_support_complete AFTER INSERT ON working_evidence_supports DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_working_evidence_complete();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER working_evidence_event_complete AFTER INSERT ON working_evidence_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_working_evidence_complete();
--> statement-breakpoint
CREATE TRIGGER working_evidence_revision_immutable BEFORE UPDATE OR DELETE ON working_evidence_revisions FOR EACH ROW EXECUTE FUNCTION working_evidence_immutable();
--> statement-breakpoint
CREATE TRIGGER working_evidence_support_immutable BEFORE UPDATE OR DELETE ON working_evidence_supports FOR EACH ROW EXECUTE FUNCTION working_evidence_immutable();
--> statement-breakpoint
CREATE TRIGGER working_evidence_output_immutable BEFORE UPDATE OR DELETE ON working_evidence_outputs FOR EACH ROW EXECUTE FUNCTION working_evidence_immutable();
--> statement-breakpoint
CREATE TRIGGER working_evidence_receipt_immutable BEFORE UPDATE OR DELETE ON working_evidence_receipts FOR EACH ROW EXECUTE FUNCTION working_evidence_immutable();
--> statement-breakpoint
CREATE TRIGGER working_evidence_event_immutable BEFORE UPDATE OR DELETE ON working_evidence_events FOR EACH ROW EXECUTE FUNCTION working_evidence_immutable();
-- Source-family exclusion remains with the existing closed native owners:
-- document_project_events / knowledge_sources: guard_financial_document_use
--   (0093) accepts only questionnaire, mission-deliverable, received-contract.
-- task_result_declarations: task_result_declaration_guard (0076) requires
--   mission-deliverable and its exact frozen PDF.
-- contract_signing_declarations: validate_reported_contract_signing (0084)
--   requires received-contract and its exact original Contract relation.
-- invoice_records / invoice_record_commands: documents_invoice_record_source
--   and invoice coupling (0095) require external-invoice and its native relation.
-- payments / payment_commands: documents_payment_source and the conserved
--   source/coupling owners (0097) require payment-evidence and its native relation.
-- None admits received-audit-source. Do not replace their functions or add
-- redundant triggers to predecessor tables.

CREATE FUNCTION received_audit_source_registration_fingerprint(r received_audit_source_registrations)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT encode(sha256(convert_to(
   '{"companyId":'||to_json(r.company_id::text)::text||
   ',"type":"received-audit-source","clientId":'||to_json(r.original_client_id::text)::text||
   ',"title":'||to_json(r.original_title)::text||
   ',"purpose":'||to_json(r.original_purpose)::text||'}', 'UTF8')), 'hex')
$$;
--> statement-breakpoint
CREATE FUNCTION received_audit_source_require_registration_authority(w uuid,c uuid,m uuid,original_client uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 -- The native API already owns these same locks. Direct SQL must establish
 -- current membership, Internal User and responsible Company too.
 PERFORM membership.id
 FROM workspace_memberships membership
 JOIN internal_users u ON u.id=membership.internal_user_id AND u.status='active'
 JOIN companies company ON company.workspace_id=membership.workspace_id AND company.id=c AND company.status='active'
 WHERE membership.workspace_id=w AND membership.id=m AND membership.status='active'
 FOR SHARE OF membership,u,company;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_audit_source_registration_authority',MESSAGE='Current native source registration authority is required.';
 END IF;

 -- Every supported native Registrar capture authorizes Company context as
 -- well as its existing metadata/reference/register permissions. The source
 -- gate supplies none of those permissions and is checked independently.
 PERFORM a.id FROM company_role_assignments a
 WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m
  AND a.bundle::text='company_document_registrar'
  AND a.permission_set_version IN ('v1','v2','v3') AND a.revoked_at IS NULL
 ORDER BY a.id LIMIT 1 FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_audit_source_registration_authority',MESSAGE='Current native source registration authority is required.';
 END IF;
 PERFORM a.id FROM company_role_assignments a
 WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m
  AND a.bundle::text='company_received_audit_source_access'
  AND a.permission_set_version='v1' AND a.revoked_at IS NULL
 ORDER BY a.id LIMIT 1 FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_audit_source_registration_authority',MESSAGE='Current native source registration authority is required.';
 END IF;

 -- Preserve the real Workspace Client-manager alternative; a valid manager
 -- is not required to hold an invented extra Company Client capture.
 PERFORM g.id FROM workspace_permission_grants g
 WHERE g.workspace_id=w AND g.workspace_membership_id=m AND g.permission::text='client.manage'
 ORDER BY g.id LIMIT 1 FOR SHARE;
 IF NOT FOUND THEN
  PERFORM a.id FROM company_role_assignments a
  WHERE a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=m
   AND a.bundle::text='company_director_client_access'
   AND a.permission_set_version IN ('v1','v2') AND a.revoked_at IS NULL
  ORDER BY a.id LIMIT 1 FOR SHARE;
  IF NOT FOUND THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_audit_source_registration_authority',MESSAGE='Current native source registration authority is required.';
  END IF;
 END IF;

 -- Match Client's identity-before-relationship order. Registration is new
 -- native use; historical reads and exact receipt replay never call this.
 PERFORM client.id FROM client_accounts client
 WHERE client.workspace_id=w AND client.id=original_client AND client.status='active'
 FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_audit_source_registration_authority',MESSAGE='Current native source registration authority is required.';
 END IF;
 PERFORM relationship.id FROM client_company_relationships relationship
 WHERE relationship.workspace_id=w AND relationship.company_id=c
  AND relationship.client_account_id=original_client AND relationship.status='active'
 FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_audit_source_registration_authority',MESSAGE='Current native source registration authority is required.';
 END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION guard_received_audit_source_registration_intent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE document working_documents%ROWTYPE;
BEGIN
 SELECT * INTO document FROM working_documents
 WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.document_id;
 IF document.id IS NULL OR document.type<>'received-audit-source'
  OR document.request_fingerprint IS DISTINCT FROM received_audit_source_registration_fingerprint(NEW)
 THEN
  RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='received_audit_source_registration_intent',MESSAGE='Native source registration must conserve its complete original intent.';
 END IF;
 PERFORM received_audit_source_require_registration_authority(
  NEW.workspace_id,NEW.company_id,NEW.actor_membership_id,NEW.original_client_id);
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER received_audit_source_registration_intent
BEFORE INSERT ON received_audit_source_registrations
FOR EACH ROW EXECUTE FUNCTION guard_received_audit_source_registration_intent();
