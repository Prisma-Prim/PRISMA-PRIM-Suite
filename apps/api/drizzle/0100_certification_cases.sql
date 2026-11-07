ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_certification_reader_assignment.granted' BEFORE 'company_working_evidence_case_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_certification_reader_assignment.revoked' BEFORE 'company_working_evidence_case_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_certification_programme_manager_assignment.granted' BEFORE 'company_working_evidence_case_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_certification_programme_manager_assignment.revoked' BEFORE 'company_working_evidence_case_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_certification_reader' BEFORE 'company_working_evidence_case_reader';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_certification_programme_manager' BEFORE 'company_working_evidence_case_reader';--> statement-breakpoint
CREATE TABLE "certification_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"client_account_id" uuid NOT NULL,
	"client_legal_entity_id" uuid NOT NULL,
	"order_reference" text NOT NULL,
	"standard" text NOT NULL,
	"audit_type" text NOT NULL,
	"status" text NOT NULL,
	"revision" integer NOT NULL,
	"opened_by_membership_id" uuid NOT NULL,
	"opened_by_internal_user_id" uuid NOT NULL,
	"opened_by_display_name" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	CONSTRAINT "certification_cases_revision_check" CHECK ("certification_cases"."revision" > 0),
	CONSTRAINT "certification_cases_kind_check" CHECK ("certification_cases"."standard" = 'iso_22000_2018' AND "certification_cases"."audit_type" = 'initial_certification' AND "certification_cases"."status" IN ('open', 'rejected')),
	CONSTRAINT "certification_cases_order_reference_check" CHECK (length(btrim("certification_cases"."order_reference")) BETWEEN 1 AND 64)
);
--> statement-breakpoint
CREATE TABLE "certification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"action" text NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "certification_events_action_check" CHECK ("certification_events"."action" IN ('certification_case.opened', 'certification_case.application_recorded', 'certification_case.application_reviewed') AND "certification_events"."revision" > 0 AND jsonb_typeof("certification_events"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "certification_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"command_kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"case_id" uuid NOT NULL,
	"response" jsonb NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "certification_receipts_kind_check" CHECK ("certification_receipts"."command_kind" IN ('open', 'application', 'application_review'))
);
--> statement-breakpoint
CREATE TABLE "certification_step_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"step" text NOT NULL,
	"version" integer NOT NULL,
	"case_revision" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"reason" text,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "certification_step_versions_reason_check" CHECK (("certification_step_versions"."version" = 1 AND "certification_step_versions"."reason" IS NULL) OR ("certification_step_versions"."version" > 1 AND length(btrim("certification_step_versions"."reason")) > 0)),
	CONSTRAINT "certification_step_versions_step_check" CHECK ("certification_step_versions"."step" IN ('application', 'application_review') AND "certification_step_versions"."version" > 0 AND "certification_step_versions"."case_revision" > 1),
	CONSTRAINT "certification_step_versions_payload_check" CHECK (jsonb_typeof("certification_step_versions"."payload") = 'object')
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
CREATE UNIQUE INDEX "certification_cases_scope_id_unique" ON "certification_cases" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_cases_order_reference_unique" ON "certification_cases" USING btree ("workspace_id","company_id","order_reference");--> statement-breakpoint
CREATE INDEX "certification_cases_project_idx" ON "certification_cases" USING btree ("workspace_id","company_id","project_id","opened_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_events_revision_unique" ON "certification_events" USING btree ("workspace_id","company_id","case_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_receipts_actor_key_unique" ON "certification_receipts" USING btree ("workspace_id","company_id","actor_membership_id","command_kind","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_step_versions_number_unique" ON "certification_step_versions" USING btree ("workspace_id","company_id","case_id","step","version");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_step_versions_case_revision_unique" ON "certification_step_versions" USING btree ("workspace_id","company_id","case_id","case_revision");--> statement-breakpoint
ALTER TABLE "certification_cases" ADD CONSTRAINT "certification_cases_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_cases" ADD CONSTRAINT "certification_cases_project_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_cases" ADD CONSTRAINT "certification_cases_client_fk" FOREIGN KEY ("workspace_id","client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_cases" ADD CONSTRAINT "certification_cases_legal_entity_fk" FOREIGN KEY ("workspace_id","client_account_id","client_legal_entity_id") REFERENCES "public"."client_legal_entities"("workspace_id","client_account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_cases" ADD CONSTRAINT "certification_cases_opener_fk" FOREIGN KEY ("workspace_id","opened_by_membership_id","opened_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_events" ADD CONSTRAINT "certification_events_case_fk" FOREIGN KEY ("workspace_id","company_id","case_id") REFERENCES "public"."certification_cases"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_events" ADD CONSTRAINT "certification_events_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_receipts" ADD CONSTRAINT "certification_receipts_case_fk" FOREIGN KEY ("workspace_id","company_id","case_id") REFERENCES "public"."certification_cases"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_receipts" ADD CONSTRAINT "certification_receipts_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_step_versions" ADD CONSTRAINT "certification_step_versions_case_fk" FOREIGN KEY ("workspace_id","company_id","case_id") REFERENCES "public"."certification_cases"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_step_versions" ADD CONSTRAINT "certification_step_versions_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_internal_task_manager', 'company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_contract_early_preparation', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_project_next_action_coordinator', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_received_addendum_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user', 'company_knowledge_source_administrator', 'company_knowledge_evidence_reader', 'company_payment_reader', 'company_payment_recorder', 'company_payment_confirmer', 'company_payment_reverser', 'company_payment_evidence_access', 'company_invoice_reader', 'company_invoice_recorder', 'company_external_invoice_access', 'company_opportunity_follow_up_coordinator', 'company_working_evidence_case_reader', 'company_working_evidence_case_recorder', 'company_received_audit_source_access', 'company_certification_reader', 'company_certification_programme_manager') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_internal_task_manager', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_project_next_action_coordinator', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_received_addendum_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user', 'company_knowledge_source_administrator', 'company_knowledge_evidence_reader', 'company_payment_reader', 'company_payment_recorder', 'company_payment_confirmer', 'company_payment_reverser', 'company_payment_evidence_access', 'company_invoice_reader', 'company_invoice_recorder', 'company_external_invoice_access', 'company_opportunity_follow_up_coordinator', 'company_working_evidence_case_reader', 'company_working_evidence_case_recorder', 'company_received_audit_source_access', 'company_certification_reader', 'company_certification_programme_manager')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
-- Recorded steps, receipts and events are append-only; a Case is never deleted.
CREATE FUNCTION certification_record_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='certification_record_immutable',MESSAGE='Recorded certification history is immutable.';
END $$;
--> statement-breakpoint
CREATE TRIGGER certification_step_version_immutable BEFORE UPDATE OR DELETE ON certification_step_versions FOR EACH ROW EXECUTE FUNCTION certification_record_immutable();
--> statement-breakpoint
CREATE TRIGGER certification_receipt_immutable BEFORE UPDATE OR DELETE ON certification_receipts FOR EACH ROW EXECUTE FUNCTION certification_record_immutable();
--> statement-breakpoint
CREATE TRIGGER certification_event_immutable BEFORE UPDATE OR DELETE ON certification_events FOR EACH ROW EXECUTE FUNCTION certification_record_immutable();
--> statement-breakpoint
CREATE TRIGGER certification_case_not_deleted BEFORE DELETE ON certification_cases FOR EACH ROW EXECUTE FUNCTION certification_record_immutable();
