CREATE TABLE "certification_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"case_revision" integer NOT NULL,
	"number" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_until" date NOT NULL,
	"first_surveillance_by" date NOT NULL,
	"texts" jsonb NOT NULL,
	"signed_by" text,
	"signed_by_function" text,
	"attachment_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "certification_certificates_values_check" CHECK (length(btrim("certification_certificates"."number")) BETWEEN 1 AND 64 AND "certification_certificates"."valid_from" < "certification_certificates"."valid_until" AND "certification_certificates"."valid_from" < "certification_certificates"."first_surveillance_by" AND "certification_certificates"."case_revision" > 1 AND jsonb_typeof("certification_certificates"."texts") = 'array')
);
--> statement-breakpoint
ALTER TABLE "certification_case_documents" DROP CONSTRAINT "certification_case_documents_role_check";--> statement-breakpoint
ALTER TABLE "certification_cases" DROP CONSTRAINT "certification_cases_kind_check";--> statement-breakpoint
ALTER TABLE "certification_events" DROP CONSTRAINT "certification_events_action_check";--> statement-breakpoint
ALTER TABLE "certification_receipts" DROP CONSTRAINT "certification_receipts_kind_check";--> statement-breakpoint
ALTER TABLE "certification_step_versions" DROP CONSTRAINT "certification_step_versions_step_check";--> statement-breakpoint
ALTER TABLE "certification_certificates" ADD CONSTRAINT "certification_certificates_case_fk" FOREIGN KEY ("workspace_id","company_id","case_id") REFERENCES "public"."certification_cases"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_certificates" ADD CONSTRAINT "certification_certificates_attachment_fk" FOREIGN KEY ("workspace_id","company_id","case_id","attachment_id") REFERENCES "public"."certification_case_documents"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_certificates" ADD CONSTRAINT "certification_certificates_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "certification_certificates_case_unique" ON "certification_certificates" USING btree ("workspace_id","company_id","case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_certificates_number_unique" ON "certification_certificates" USING btree ("workspace_id","company_id","number");--> statement-breakpoint
ALTER TABLE "certification_case_documents" ADD CONSTRAINT "certification_case_documents_role_check" CHECK ("certification_case_documents"."role" IN ('questionnaire', 'iso22000_annex', 'agreement', 'plan', 'participant_list', 'report', 'evidence', 'certificate', 'certificate_data', 'decision_form', 'other') AND "certification_case_documents"."case_revision" > 1 AND "certification_case_documents"."version_number" > 0 AND "certification_case_documents"."size_bytes" > 0 AND "certification_case_documents"."sha256" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "certification_cases" ADD CONSTRAINT "certification_cases_kind_check" CHECK ("certification_cases"."standard" = 'iso_22000_2018' AND "certification_cases"."audit_type" = 'initial_certification' AND "certification_cases"."status" IN ('open', 'rejected', 'refused', 'certified'));--> statement-breakpoint
ALTER TABLE "certification_events" ADD CONSTRAINT "certification_events_action_check" CHECK ("certification_events"."action" IN ('certification_case.opened', 'certification_case.application_recorded', 'certification_case.application_reviewed', 'certification_case.duration_confirmed', 'certification_case.document_attached', 'certification_case.agreement_recorded', 'certification_case.team_proposed', 'certification_case.team_decided', 'certification_case.stage_planned', 'certification_case.stage_reported', 'certification_case.finding_recorded', 'certification_case.finding_corrected', 'certification_case.finding_reclassified', 'certification_case.nonconformity_response_recorded', 'certification_case.nonconformity_plan_judged', 'certification_case.nonconformity_verified', 'certification_case.recommendation_recorded', 'certification_case.dossier_reviewed', 'certification_case.decision_recorded', 'certification_case.certificate_data_agreed', 'certification_case.certificate_recorded') AND "certification_events"."revision" > 0 AND jsonb_typeof("certification_events"."metadata") = 'object');--> statement-breakpoint
ALTER TABLE "certification_receipts" ADD CONSTRAINT "certification_receipts_kind_check" CHECK ("certification_receipts"."command_kind" IN ('open', 'application', 'application_review', 'duration', 'document', 'agreement', 'team', 'team_decision', 'stage_plan', 'stage_report', 'finding', 'finding_record', 'recommendation', 'dossier_review', 'decision', 'certificate_data', 'certificate'));--> statement-breakpoint
ALTER TABLE "certification_step_versions" ADD CONSTRAINT "certification_step_versions_step_check" CHECK ("certification_step_versions"."step" IN ('application', 'application_review', 'duration', 'agreement', 'team', 'team_decision', 'stage_1_plan', 'stage_1_report', 'stage_2_plan', 'stage_2_report', 'recommendation', 'dossier_review', 'decision', 'certificate_data') AND "certification_step_versions"."version" > 0 AND "certification_step_versions"."case_revision" > 1);--> statement-breakpoint
CREATE TRIGGER certification_certificate_immutable BEFORE UPDATE OR DELETE ON certification_certificates FOR EACH ROW EXECUTE FUNCTION certification_record_immutable();
