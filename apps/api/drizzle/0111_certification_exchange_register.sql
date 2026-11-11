-- Exchange register (#1293): Exchange Records, Re-verification Items and their withdrawals, the Company procedure deadline set and its events, all append-only.
CREATE TABLE "certification_deadline_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"stage_plan_sent_days" integer,
	"audit_dossier_transmitted_days" integer,
	"stage_2_report_released_days" integer,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "certification_deadline_sets_values_check" CHECK ("certification_deadline_sets"."version" > 0 AND ("certification_deadline_sets"."stage_plan_sent_days" IS NULL OR "certification_deadline_sets"."stage_plan_sent_days" BETWEEN 0 AND 365) AND ("certification_deadline_sets"."audit_dossier_transmitted_days" IS NULL OR "certification_deadline_sets"."audit_dossier_transmitted_days" BETWEEN 0 AND 365) AND ("certification_deadline_sets"."stage_2_report_released_days" IS NULL OR "certification_deadline_sets"."stage_2_report_released_days" BETWEEN 0 AND 365) AND length("certification_deadline_sets"."idempotency_key") BETWEEN 1 AND 255 AND "certification_deadline_sets"."fingerprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "certification_exchange_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"version" integer NOT NULL,
	"case_revision" integer NOT NULL,
	"direction" text NOT NULL,
	"item_kind" text NOT NULL,
	"counterpart_kind" text NOT NULL,
	"counterpart_name" text NOT NULL,
	"business_date" date NOT NULL,
	"channel" text NOT NULL,
	"reference" text,
	"note" text,
	"attachment_ids" jsonb NOT NULL,
	"reason" text,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "certification_exchange_records_values_check" CHECK ("certification_exchange_records"."direction" IN ('received', 'sent') AND "certification_exchange_records"."item_kind" IN ('application', 'agreement', 'team_notice', 'stage_plan', 'stage_report', 'participant_list', 'nonconformity_response', 'client_data_confirmation', 'audit_dossier', 'certificate_data_form', 'certificate_draft', 'client_opinion', 'decision_form', 'certificate', 'other') AND "certification_exchange_records"."counterpart_kind" IN ('client', 'certification_body', 'audit_team_member', 'other') AND "certification_exchange_records"."channel" IN ('email', 'platform', 'courier', 'hand_delivery', 'other') AND "certification_exchange_records"."sequence" > 0 AND "certification_exchange_records"."version" > 0 AND "certification_exchange_records"."case_revision" > 1 AND length(btrim("certification_exchange_records"."counterpart_name")) BETWEEN 1 AND 200 AND ("certification_exchange_records"."reference" IS NULL OR length(btrim("certification_exchange_records"."reference")) BETWEEN 1 AND 64) AND ("certification_exchange_records"."note" IS NULL OR length(btrim("certification_exchange_records"."note")) BETWEEN 1 AND 2000) AND ("certification_exchange_records"."channel" <> 'other' OR "certification_exchange_records"."note" IS NOT NULL) AND jsonb_typeof("certification_exchange_records"."attachment_ids") = 'array' AND jsonb_array_length("certification_exchange_records"."attachment_ids") BETWEEN 1 AND 20),
	CONSTRAINT "certification_exchange_records_reason_check" CHECK (("certification_exchange_records"."version" = 1 AND "certification_exchange_records"."reason" IS NULL) OR ("certification_exchange_records"."version" > 1 AND length(btrim("certification_exchange_records"."reason")) BETWEEN 1 AND 2000))
);
--> statement-breakpoint
CREATE TABLE "certification_procedure_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"action" text NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "certification_procedure_events_values_check" CHECK ("certification_procedure_events"."action" IN ('certification_procedure.deadlines_configured') AND "certification_procedure_events"."version" > 0 AND jsonb_typeof("certification_procedure_events"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "certification_reverification_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"case_revision" integer NOT NULL,
	"sequence" integer NOT NULL,
	"origin" text NOT NULL,
	"text" text NOT NULL,
	"source_kind" text,
	"source_finding_id" uuid,
	"source_discrepancy_id" text,
	"source_exchange_sequence" integer,
	"source_attachment_id" uuid,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "certification_reverification_items_values_check" CHECK ("certification_reverification_items"."origin" IN ('manual', 'discrepancy') AND "certification_reverification_items"."sequence" > 0 AND "certification_reverification_items"."case_revision" > 1 AND length(btrim("certification_reverification_items"."text")) BETWEEN 1 AND 2000 AND ("certification_reverification_items"."source_exchange_sequence" IS NULL OR "certification_reverification_items"."source_exchange_sequence" > 0) AND ("certification_reverification_items"."source_discrepancy_id" IS NULL OR "certification_reverification_items"."source_discrepancy_id" ~ '^(R[0-9]{2}:[0-9a-f]{32}|manual:[0-9a-f-]{36})$')),
	CONSTRAINT "certification_reverification_items_source_check" CHECK (num_nonnulls("certification_reverification_items"."source_finding_id", "certification_reverification_items"."source_discrepancy_id", "certification_reverification_items"."source_exchange_sequence", "certification_reverification_items"."source_attachment_id") = (CASE WHEN "certification_reverification_items"."source_kind" IS NULL THEN 0 ELSE 1 END) AND ("certification_reverification_items"."source_kind" IS NULL OR ("certification_reverification_items"."source_kind" = 'finding' AND "certification_reverification_items"."source_finding_id" IS NOT NULL) OR ("certification_reverification_items"."source_kind" = 'discrepancy' AND "certification_reverification_items"."source_discrepancy_id" IS NOT NULL) OR ("certification_reverification_items"."source_kind" = 'exchange' AND "certification_reverification_items"."source_exchange_sequence" IS NOT NULL) OR ("certification_reverification_items"."source_kind" = 'attachment' AND "certification_reverification_items"."source_attachment_id" IS NOT NULL)) AND ("certification_reverification_items"."origin" = 'manual' OR "certification_reverification_items"."source_kind" = 'discrepancy'))
);
--> statement-breakpoint
CREATE TABLE "certification_reverification_withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"case_revision" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "certification_reverification_withdrawals_values_check" CHECK ("certification_reverification_withdrawals"."case_revision" > 1 AND length(btrim("certification_reverification_withdrawals"."reason")) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
ALTER TABLE "certification_case_documents" DROP CONSTRAINT "certification_case_documents_role_check";--> statement-breakpoint
ALTER TABLE "certification_discrepancy_resolutions" DROP CONSTRAINT "certification_discrepancy_resolutions_values_check";--> statement-breakpoint
ALTER TABLE "certification_events" DROP CONSTRAINT "certification_events_action_check";--> statement-breakpoint
ALTER TABLE "certification_receipts" DROP CONSTRAINT "certification_receipts_kind_check";--> statement-breakpoint
-- The withdrawal foreign key below references this scope key, so it comes first.
CREATE UNIQUE INDEX "certification_reverification_items_scope_unique" ON "certification_reverification_items" USING btree ("workspace_id","company_id","case_id","id");--> statement-breakpoint
ALTER TABLE "certification_deadline_sets" ADD CONSTRAINT "certification_deadline_sets_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_deadline_sets" ADD CONSTRAINT "certification_deadline_sets_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_exchange_records" ADD CONSTRAINT "certification_exchange_records_case_fk" FOREIGN KEY ("workspace_id","company_id","case_id") REFERENCES "public"."certification_cases"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_exchange_records" ADD CONSTRAINT "certification_exchange_records_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_procedure_events" ADD CONSTRAINT "certification_procedure_events_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_procedure_events" ADD CONSTRAINT "certification_procedure_events_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_reverification_items" ADD CONSTRAINT "certification_reverification_items_case_fk" FOREIGN KEY ("workspace_id","company_id","case_id") REFERENCES "public"."certification_cases"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_reverification_items" ADD CONSTRAINT "certification_reverification_items_finding_fk" FOREIGN KEY ("workspace_id","company_id","case_id","source_finding_id") REFERENCES "public"."certification_findings"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_reverification_items" ADD CONSTRAINT "certification_reverification_items_attachment_fk" FOREIGN KEY ("workspace_id","company_id","case_id","source_attachment_id") REFERENCES "public"."certification_case_documents"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_reverification_items" ADD CONSTRAINT "certification_reverification_items_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_reverification_withdrawals" ADD CONSTRAINT "certification_reverification_withdrawals_case_fk" FOREIGN KEY ("workspace_id","company_id","case_id") REFERENCES "public"."certification_cases"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_reverification_withdrawals" ADD CONSTRAINT "certification_reverification_withdrawals_item_fk" FOREIGN KEY ("workspace_id","company_id","case_id","item_id") REFERENCES "public"."certification_reverification_items"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_reverification_withdrawals" ADD CONSTRAINT "certification_reverification_withdrawals_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "certification_deadline_sets_version_unique" ON "certification_deadline_sets" USING btree ("workspace_id","company_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_deadline_sets_actor_key_unique" ON "certification_deadline_sets" USING btree ("workspace_id","company_id","actor_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_exchange_records_scope_unique" ON "certification_exchange_records" USING btree ("workspace_id","company_id","case_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_exchange_records_number_unique" ON "certification_exchange_records" USING btree ("workspace_id","company_id","case_id","sequence","version");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_procedure_events_version_unique" ON "certification_procedure_events" USING btree ("workspace_id","company_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_reverification_items_sequence_unique" ON "certification_reverification_items" USING btree ("workspace_id","company_id","case_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_reverification_withdrawals_item_unique" ON "certification_reverification_withdrawals" USING btree ("workspace_id","company_id","case_id","item_id");--> statement-breakpoint
ALTER TABLE "certification_case_documents" ADD CONSTRAINT "certification_case_documents_role_check" CHECK ("certification_case_documents"."role" IN ('questionnaire', 'iso22000_annex', 'agreement', 'plan', 'participant_list', 'report', 'evidence', 'certificate', 'certificate_data', 'decision_form', 'correspondence', 'other') AND "certification_case_documents"."case_revision" > 1 AND "certification_case_documents"."version_number" > 0 AND "certification_case_documents"."size_bytes" > 0 AND "certification_case_documents"."sha256" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "certification_discrepancy_resolutions" ADD CONSTRAINT "certification_discrepancy_resolutions_values_check" CHECK ("certification_discrepancy_resolutions"."rule_code" IN ('R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10', 'R11', 'R12', 'R14', 'R15', 'R16', 'manual') AND "certification_discrepancy_resolutions"."kind" IN ('accepted', 'corrected') AND "certification_discrepancy_resolutions"."verdict" IN ('critical', 'error', 'to_clarify') AND "certification_discrepancy_resolutions"."case_revision" > 1 AND length(btrim("certification_discrepancy_resolutions"."reason")) BETWEEN 1 AND 2000 AND length(btrim("certification_discrepancy_resolutions"."rule_set_version")) BETWEEN 1 AND 64 AND jsonb_typeof("certification_discrepancy_resolutions"."compared_values") = 'object' AND "certification_discrepancy_resolutions"."discrepancy_id" ~ '^(R[0-9]{2}:[0-9a-f]{32}|manual:[0-9a-f-]{36})$');--> statement-breakpoint
ALTER TABLE "certification_events" ADD CONSTRAINT "certification_events_action_check" CHECK ("certification_events"."action" IN ('certification_case.opened', 'certification_case.application_recorded', 'certification_case.application_reviewed', 'certification_case.duration_confirmed', 'certification_case.document_attached', 'certification_case.agreement_recorded', 'certification_case.team_proposed', 'certification_case.team_decided', 'certification_case.stage_planned', 'certification_case.stage_reported', 'certification_case.finding_recorded', 'certification_case.finding_corrected', 'certification_case.finding_reclassified', 'certification_case.nonconformity_response_recorded', 'certification_case.nonconformity_plan_judged', 'certification_case.nonconformity_verified', 'certification_case.recommendation_recorded', 'certification_case.dossier_reviewed', 'certification_case.decision_recorded', 'certification_case.certificate_data_agreed', 'certification_case.certificate_recorded', 'certification_case.discrepancy_recorded', 'certification_case.discrepancy_resolved', 'certification_case.exchange_recorded', 'certification_case.reverification_item_added', 'certification_case.reverification_item_withdrawn') AND "certification_events"."revision" > 0 AND jsonb_typeof("certification_events"."metadata") = 'object');--> statement-breakpoint
ALTER TABLE "certification_receipts" ADD CONSTRAINT "certification_receipts_kind_check" CHECK ("certification_receipts"."command_kind" IN ('open', 'application', 'application_review', 'duration', 'document', 'agreement', 'team', 'team_decision', 'stage_plan', 'stage_report', 'finding', 'finding_record', 'recommendation', 'dossier_review', 'decision', 'certificate_data', 'certificate', 'discrepancy', 'discrepancy_resolution', 'exchange', 'reverification_item', 'reverification_withdrawal'));--> statement-breakpoint
CREATE TRIGGER certification_exchange_record_immutable BEFORE UPDATE OR DELETE ON certification_exchange_records FOR EACH ROW EXECUTE FUNCTION certification_record_immutable();--> statement-breakpoint
CREATE TRIGGER certification_reverification_item_immutable BEFORE UPDATE OR DELETE ON certification_reverification_items FOR EACH ROW EXECUTE FUNCTION certification_record_immutable();--> statement-breakpoint
CREATE TRIGGER certification_reverification_withdrawal_immutable BEFORE UPDATE OR DELETE ON certification_reverification_withdrawals FOR EACH ROW EXECUTE FUNCTION certification_record_immutable();--> statement-breakpoint
CREATE TRIGGER certification_deadline_set_immutable BEFORE UPDATE OR DELETE ON certification_deadline_sets FOR EACH ROW EXECUTE FUNCTION certification_record_immutable();--> statement-breakpoint
CREATE TRIGGER certification_procedure_event_immutable BEFORE UPDATE OR DELETE ON certification_procedure_events FOR EACH ROW EXECUTE FUNCTION certification_record_immutable();
