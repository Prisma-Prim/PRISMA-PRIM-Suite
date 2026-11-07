CREATE TABLE "certification_case_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"case_revision" integer NOT NULL,
	"role" text NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"representation_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"source_title" text NOT NULL,
	"file_name" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"note" text,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"attached_at" timestamp with time zone NOT NULL,
	CONSTRAINT "certification_case_documents_role_check" CHECK ("certification_case_documents"."role" IN ('questionnaire', 'iso22000_annex', 'agreement', 'plan', 'participant_list', 'report', 'evidence', 'certificate', 'other') AND "certification_case_documents"."case_revision" > 1 AND "certification_case_documents"."version_number" > 0 AND "certification_case_documents"."size_bytes" > 0 AND "certification_case_documents"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "certification_case_documents_note_check" CHECK ("certification_case_documents"."note" IS NULL OR length(btrim("certification_case_documents"."note")) BETWEEN 1 AND 1000)
);
--> statement-breakpoint
ALTER TABLE "certification_events" DROP CONSTRAINT "certification_events_action_check";--> statement-breakpoint
ALTER TABLE "certification_receipts" DROP CONSTRAINT "certification_receipts_kind_check";--> statement-breakpoint
ALTER TABLE "certification_step_versions" DROP CONSTRAINT "certification_step_versions_step_check";--> statement-breakpoint
ALTER TABLE "certification_case_documents" ADD CONSTRAINT "certification_case_documents_case_fk" FOREIGN KEY ("workspace_id","company_id","case_id") REFERENCES "public"."certification_cases"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_case_documents" ADD CONSTRAINT "certification_case_documents_pdf_fk" FOREIGN KEY ("workspace_id","company_id","document_id","version_id","representation_id") REFERENCES "public"."document_pdfs"("workspace_id","company_id","document_id","version_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_case_documents" ADD CONSTRAINT "certification_case_documents_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "certification_case_documents_scope_unique" ON "certification_case_documents" USING btree ("workspace_id","company_id","case_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_case_documents_tuple_unique" ON "certification_case_documents" USING btree ("workspace_id","company_id","case_id","document_id","version_id","representation_id");--> statement-breakpoint
ALTER TABLE "certification_events" ADD CONSTRAINT "certification_events_action_check" CHECK ("certification_events"."action" IN ('certification_case.opened', 'certification_case.application_recorded', 'certification_case.application_reviewed', 'certification_case.duration_confirmed', 'certification_case.document_attached', 'certification_case.agreement_recorded') AND "certification_events"."revision" > 0 AND jsonb_typeof("certification_events"."metadata") = 'object');--> statement-breakpoint
ALTER TABLE "certification_receipts" ADD CONSTRAINT "certification_receipts_kind_check" CHECK ("certification_receipts"."command_kind" IN ('open', 'application', 'application_review', 'duration', 'document', 'agreement'));--> statement-breakpoint
ALTER TABLE "certification_step_versions" ADD CONSTRAINT "certification_step_versions_step_check" CHECK ("certification_step_versions"."step" IN ('application', 'application_review', 'duration', 'agreement') AND "certification_step_versions"."version" > 0 AND "certification_step_versions"."case_revision" > 1);--> statement-breakpoint
CREATE TRIGGER certification_case_document_immutable BEFORE UPDATE OR DELETE ON certification_case_documents FOR EACH ROW EXECUTE FUNCTION certification_record_immutable();
