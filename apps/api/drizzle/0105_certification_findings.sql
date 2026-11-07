CREATE TABLE "certification_finding_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"finding_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" integer NOT NULL,
	"case_revision" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"reason" text,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "certification_finding_records_values_check" CHECK ("certification_finding_records"."kind" IN ('statement', 'classification', 'response', 'plan_judgment', 'verification') AND "certification_finding_records"."version" > 0 AND "certification_finding_records"."case_revision" > 1 AND jsonb_typeof("certification_finding_records"."payload") = 'object'),
	CONSTRAINT "certification_finding_records_reason_check" CHECK (("certification_finding_records"."kind" IN ('statement', 'classification') AND (("certification_finding_records"."version" = 1 AND "certification_finding_records"."reason" IS NULL) OR ("certification_finding_records"."version" > 1 AND length(btrim("certification_finding_records"."reason")) > 0))) OR ("certification_finding_records"."kind" NOT IN ('statement', 'classification') AND "certification_finding_records"."reason" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "certification_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"sequence" integer NOT NULL,
	"case_revision" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "certification_findings_values_check" CHECK ("certification_findings"."stage" IN ('stage_1', 'stage_2') AND "certification_findings"."sequence" > 0 AND "certification_findings"."case_revision" > 1)
);
--> statement-breakpoint
ALTER TABLE "certification_events" DROP CONSTRAINT "certification_events_action_check";--> statement-breakpoint
ALTER TABLE "certification_receipts" DROP CONSTRAINT "certification_receipts_kind_check";--> statement-breakpoint
CREATE UNIQUE INDEX "certification_finding_records_number_unique" ON "certification_finding_records" USING btree ("workspace_id","company_id","case_id","finding_id","kind","version");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_findings_scope_unique" ON "certification_findings" USING btree ("workspace_id","company_id","case_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_findings_sequence_unique" ON "certification_findings" USING btree ("workspace_id","company_id","case_id","sequence");--> statement-breakpoint
ALTER TABLE "certification_finding_records" ADD CONSTRAINT "certification_finding_records_finding_fk" FOREIGN KEY ("workspace_id","company_id","case_id","finding_id") REFERENCES "public"."certification_findings"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_finding_records" ADD CONSTRAINT "certification_finding_records_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_findings" ADD CONSTRAINT "certification_findings_case_fk" FOREIGN KEY ("workspace_id","company_id","case_id") REFERENCES "public"."certification_cases"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_events" ADD CONSTRAINT "certification_events_action_check" CHECK ("certification_events"."action" IN ('certification_case.opened', 'certification_case.application_recorded', 'certification_case.application_reviewed', 'certification_case.duration_confirmed', 'certification_case.document_attached', 'certification_case.agreement_recorded', 'certification_case.team_proposed', 'certification_case.team_decided', 'certification_case.stage_planned', 'certification_case.stage_reported', 'certification_case.finding_recorded', 'certification_case.finding_corrected', 'certification_case.finding_reclassified', 'certification_case.nonconformity_response_recorded', 'certification_case.nonconformity_plan_judged', 'certification_case.nonconformity_verified') AND "certification_events"."revision" > 0 AND jsonb_typeof("certification_events"."metadata") = 'object');--> statement-breakpoint
ALTER TABLE "certification_receipts" ADD CONSTRAINT "certification_receipts_kind_check" CHECK ("certification_receipts"."command_kind" IN ('open', 'application', 'application_review', 'duration', 'document', 'agreement', 'team', 'team_decision', 'stage_plan', 'stage_report', 'finding', 'finding_record'));--> statement-breakpoint
CREATE TRIGGER certification_finding_immutable BEFORE UPDATE OR DELETE ON certification_findings FOR EACH ROW EXECUTE FUNCTION certification_record_immutable();
--> statement-breakpoint
CREATE TRIGGER certification_finding_record_immutable BEFORE UPDATE OR DELETE ON certification_finding_records FOR EACH ROW EXECUTE FUNCTION certification_record_immutable();
