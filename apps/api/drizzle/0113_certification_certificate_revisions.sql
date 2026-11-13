CREATE TABLE "certification_certificate_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"case_revision" integer NOT NULL,
	"reason" text NOT NULL,
	"revised_on" date NOT NULL,
	"attachment_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"decision_version_id" uuid NOT NULL,
	"certificate_data_version_id" uuid NOT NULL,
	"texts" jsonb NOT NULL,
	"revision_marked" boolean NOT NULL,
	"independence_attested" boolean NOT NULL,
	"on_behalf" jsonb,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "certification_certificate_revisions_values_check" CHECK ("certification_certificate_revisions"."index" > 0 AND "certification_certificate_revisions"."case_revision" > 1 AND length(btrim("certification_certificate_revisions"."reason")) BETWEEN 1 AND 2000 AND "certification_certificate_revisions"."independence_attested" = true AND jsonb_typeof("certification_certificate_revisions"."texts") = 'array' AND ("certification_certificate_revisions"."on_behalf" IS NULL OR jsonb_typeof("certification_certificate_revisions"."on_behalf") = 'object'))
);
--> statement-breakpoint
ALTER TABLE "certification_events" DROP CONSTRAINT "certification_events_action_check";--> statement-breakpoint
ALTER TABLE "certification_receipts" DROP CONSTRAINT "certification_receipts_kind_check";--> statement-breakpoint
ALTER TABLE "certification_certificate_revisions" ADD CONSTRAINT "certification_certificate_revisions_certificate_fk" FOREIGN KEY ("workspace_id","company_id","case_id") REFERENCES "public"."certification_certificates"("workspace_id","company_id","case_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_certificate_revisions" ADD CONSTRAINT "certification_certificate_revisions_attachment_fk" FOREIGN KEY ("workspace_id","company_id","case_id","attachment_id") REFERENCES "public"."certification_case_documents"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_certificate_revisions" ADD CONSTRAINT "certification_certificate_revisions_decision_fk" FOREIGN KEY ("workspace_id","company_id","case_id","decision_version_id") REFERENCES "public"."certification_step_versions"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_certificate_revisions" ADD CONSTRAINT "certification_certificate_revisions_data_fk" FOREIGN KEY ("workspace_id","company_id","case_id","certificate_data_version_id") REFERENCES "public"."certification_step_versions"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_certificate_revisions" ADD CONSTRAINT "certification_certificate_revisions_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "certification_certificate_revisions_index_unique" ON "certification_certificate_revisions" USING btree ("workspace_id","company_id","case_id","index");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_certificate_revisions_case_revision_unique" ON "certification_certificate_revisions" USING btree ("workspace_id","company_id","case_id","case_revision");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_certificate_revisions_pdf_unique" ON "certification_certificate_revisions" USING btree ("workspace_id","company_id","case_id","document_version_id");--> statement-breakpoint
ALTER TABLE "certification_events" ADD CONSTRAINT "certification_events_action_check" CHECK ("certification_events"."action" IN ('certification_case.opened', 'certification_case.application_recorded', 'certification_case.application_reviewed', 'certification_case.duration_confirmed', 'certification_case.document_attached', 'certification_case.agreement_recorded', 'certification_case.team_proposed', 'certification_case.team_decided', 'certification_case.stage_planned', 'certification_case.stage_reported', 'certification_case.finding_recorded', 'certification_case.finding_corrected', 'certification_case.finding_reclassified', 'certification_case.nonconformity_response_recorded', 'certification_case.nonconformity_plan_judged', 'certification_case.nonconformity_verified', 'certification_case.recommendation_recorded', 'certification_case.dossier_reviewed', 'certification_case.decision_recorded', 'certification_case.certificate_data_agreed', 'certification_case.certificate_recorded', 'certification_case.certificate_revised', 'certification_case.certificate_draft_recorded', 'certification_case.client_opinion_recorded', 'certification_case.certificate_draft_approved', 'certification_case.discrepancy_recorded', 'certification_case.discrepancy_resolved', 'certification_case.exchange_recorded', 'certification_case.reverification_item_added', 'certification_case.reverification_item_withdrawn') AND "certification_events"."revision" > 0 AND jsonb_typeof("certification_events"."metadata") = 'object');--> statement-breakpoint
ALTER TABLE "certification_receipts" ADD CONSTRAINT "certification_receipts_kind_check" CHECK ("certification_receipts"."command_kind" IN ('open', 'application', 'application_review', 'duration', 'document', 'agreement', 'team', 'team_decision', 'stage_plan', 'stage_report', 'finding', 'finding_record', 'recommendation', 'dossier_review', 'decision', 'certificate_data', 'certificate', 'certificate_revision', 'certificate_draft', 'client_opinion', 'certificate_draft_approval', 'discrepancy', 'discrepancy_resolution', 'exchange', 'reverification_item', 'reverification_withdrawal'));
--> statement-breakpoint
CREATE TRIGGER certification_certificate_revision_immutable BEFORE UPDATE OR DELETE ON certification_certificate_revisions FOR EACH ROW EXECUTE FUNCTION certification_record_immutable();
