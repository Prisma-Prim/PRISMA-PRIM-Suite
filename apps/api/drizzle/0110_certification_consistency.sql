-- Dossier Consistency Check (#1292): manual Discrepancies and human resolutions, both append-only.
CREATE TABLE "certification_discrepancy_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"case_revision" integer NOT NULL,
	"discrepancy_id" text NOT NULL,
	"rule_code" text NOT NULL,
	"manual_discrepancy_id" uuid,
	"kind" text NOT NULL,
	"verdict" text NOT NULL,
	"reason" text NOT NULL,
	"compared_values" jsonb NOT NULL,
	"corrected_by_attachment_id" uuid,
	"corrected_by_step_version_id" uuid,
	"rule_set_version" text NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "certification_discrepancy_resolutions_values_check" CHECK ("certification_discrepancy_resolutions"."rule_code" IN ('R01', 'R02', 'R03', 'R04', 'R05', 'R08', 'R09', 'R10', 'R11', 'R12', 'R14', 'manual') AND "certification_discrepancy_resolutions"."kind" IN ('accepted', 'corrected') AND "certification_discrepancy_resolutions"."verdict" IN ('critical', 'error', 'to_clarify') AND "certification_discrepancy_resolutions"."case_revision" > 1 AND length(btrim("certification_discrepancy_resolutions"."reason")) BETWEEN 1 AND 2000 AND length(btrim("certification_discrepancy_resolutions"."rule_set_version")) BETWEEN 1 AND 64 AND jsonb_typeof("certification_discrepancy_resolutions"."compared_values") = 'object' AND "certification_discrepancy_resolutions"."discrepancy_id" ~ '^(R[0-9]{2}:[0-9a-f]{32}|manual:[0-9a-f-]{36})$'),
	CONSTRAINT "certification_discrepancy_resolutions_kind_check" CHECK ((("certification_discrepancy_resolutions"."rule_code" = 'manual') = ("certification_discrepancy_resolutions"."manual_discrepancy_id" IS NOT NULL)) AND ("certification_discrepancy_resolutions"."kind" = 'accepted' OR ("certification_discrepancy_resolutions"."rule_code" = 'manual' AND num_nonnulls("certification_discrepancy_resolutions"."corrected_by_attachment_id", "certification_discrepancy_resolutions"."corrected_by_step_version_id") = 1)) AND ("certification_discrepancy_resolutions"."kind" = 'corrected' OR num_nonnulls("certification_discrepancy_resolutions"."corrected_by_attachment_id", "certification_discrepancy_resolutions"."corrected_by_step_version_id") = 0) AND ("certification_discrepancy_resolutions"."kind" = 'corrected' OR "certification_discrepancy_resolutions"."verdict" <> 'critical'))
);
--> statement-breakpoint
CREATE TABLE "certification_manual_discrepancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"case_revision" integer NOT NULL,
	"sequence" integer NOT NULL,
	"verdict" text NOT NULL,
	"subject" text NOT NULL,
	"left_value" text NOT NULL,
	"left_attachment_id" uuid NOT NULL,
	"left_location" text,
	"right_value" text NOT NULL,
	"right_attachment_id" uuid NOT NULL,
	"right_location" text,
	"note" text,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "certification_manual_discrepancies_values_check" CHECK ("certification_manual_discrepancies"."verdict" IN ('critical', 'error', 'to_clarify') AND "certification_manual_discrepancies"."sequence" > 0 AND "certification_manual_discrepancies"."case_revision" > 1 AND length(btrim("certification_manual_discrepancies"."subject")) BETWEEN 1 AND 200 AND length(btrim("certification_manual_discrepancies"."left_value")) BETWEEN 1 AND 1000 AND length(btrim("certification_manual_discrepancies"."right_value")) BETWEEN 1 AND 1000 AND ("certification_manual_discrepancies"."left_location" IS NULL OR length(btrim("certification_manual_discrepancies"."left_location")) BETWEEN 1 AND 200) AND ("certification_manual_discrepancies"."right_location" IS NULL OR length(btrim("certification_manual_discrepancies"."right_location")) BETWEEN 1 AND 200) AND ("certification_manual_discrepancies"."note" IS NULL OR length(btrim("certification_manual_discrepancies"."note")) BETWEEN 1 AND 2000))
);
--> statement-breakpoint
ALTER TABLE "certification_events" DROP CONSTRAINT "certification_events_action_check";--> statement-breakpoint
ALTER TABLE "certification_receipts" DROP CONSTRAINT "certification_receipts_kind_check";--> statement-breakpoint
-- The composite foreign keys below reference these scope keys, so they come first.
CREATE UNIQUE INDEX "certification_step_versions_scope_unique" ON "certification_step_versions" USING btree ("workspace_id","company_id","case_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_manual_discrepancies_scope_unique" ON "certification_manual_discrepancies" USING btree ("workspace_id","company_id","case_id","id");--> statement-breakpoint
ALTER TABLE "certification_discrepancy_resolutions" ADD CONSTRAINT "certification_discrepancy_resolutions_case_fk" FOREIGN KEY ("workspace_id","company_id","case_id") REFERENCES "public"."certification_cases"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_discrepancy_resolutions" ADD CONSTRAINT "certification_discrepancy_resolutions_manual_fk" FOREIGN KEY ("workspace_id","company_id","case_id","manual_discrepancy_id") REFERENCES "public"."certification_manual_discrepancies"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_discrepancy_resolutions" ADD CONSTRAINT "certification_discrepancy_resolutions_attachment_fk" FOREIGN KEY ("workspace_id","company_id","case_id","corrected_by_attachment_id") REFERENCES "public"."certification_case_documents"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_discrepancy_resolutions" ADD CONSTRAINT "certification_discrepancy_resolutions_step_fk" FOREIGN KEY ("workspace_id","company_id","case_id","corrected_by_step_version_id") REFERENCES "public"."certification_step_versions"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_discrepancy_resolutions" ADD CONSTRAINT "certification_discrepancy_resolutions_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_manual_discrepancies" ADD CONSTRAINT "certification_manual_discrepancies_case_fk" FOREIGN KEY ("workspace_id","company_id","case_id") REFERENCES "public"."certification_cases"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_manual_discrepancies" ADD CONSTRAINT "certification_manual_discrepancies_left_fk" FOREIGN KEY ("workspace_id","company_id","case_id","left_attachment_id") REFERENCES "public"."certification_case_documents"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_manual_discrepancies" ADD CONSTRAINT "certification_manual_discrepancies_right_fk" FOREIGN KEY ("workspace_id","company_id","case_id","right_attachment_id") REFERENCES "public"."certification_case_documents"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_manual_discrepancies" ADD CONSTRAINT "certification_manual_discrepancies_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "certification_discrepancy_resolutions_identity_unique" ON "certification_discrepancy_resolutions" USING btree ("workspace_id","company_id","case_id","discrepancy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_manual_discrepancies_sequence_unique" ON "certification_manual_discrepancies" USING btree ("workspace_id","company_id","case_id","sequence");--> statement-breakpoint
ALTER TABLE "certification_events" ADD CONSTRAINT "certification_events_action_check" CHECK ("certification_events"."action" IN ('certification_case.opened', 'certification_case.application_recorded', 'certification_case.application_reviewed', 'certification_case.duration_confirmed', 'certification_case.document_attached', 'certification_case.agreement_recorded', 'certification_case.team_proposed', 'certification_case.team_decided', 'certification_case.stage_planned', 'certification_case.stage_reported', 'certification_case.finding_recorded', 'certification_case.finding_corrected', 'certification_case.finding_reclassified', 'certification_case.nonconformity_response_recorded', 'certification_case.nonconformity_plan_judged', 'certification_case.nonconformity_verified', 'certification_case.recommendation_recorded', 'certification_case.dossier_reviewed', 'certification_case.decision_recorded', 'certification_case.certificate_data_agreed', 'certification_case.certificate_recorded', 'certification_case.discrepancy_recorded', 'certification_case.discrepancy_resolved') AND "certification_events"."revision" > 0 AND jsonb_typeof("certification_events"."metadata") = 'object');--> statement-breakpoint
ALTER TABLE "certification_receipts" ADD CONSTRAINT "certification_receipts_kind_check" CHECK ("certification_receipts"."command_kind" IN ('open', 'application', 'application_review', 'duration', 'document', 'agreement', 'team', 'team_decision', 'stage_plan', 'stage_report', 'finding', 'finding_record', 'recommendation', 'dossier_review', 'decision', 'certificate_data', 'certificate', 'discrepancy', 'discrepancy_resolution'));--> statement-breakpoint
CREATE TRIGGER certification_manual_discrepancy_immutable BEFORE UPDATE OR DELETE ON certification_manual_discrepancies FOR EACH ROW EXECUTE FUNCTION certification_record_immutable();--> statement-breakpoint
CREATE TRIGGER certification_discrepancy_resolution_immutable BEFORE UPDATE OR DELETE ON certification_discrepancy_resolutions FOR EACH ROW EXECUTE FUNCTION certification_record_immutable();
