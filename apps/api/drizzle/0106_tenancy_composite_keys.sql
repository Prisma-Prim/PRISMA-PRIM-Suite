-- Issue #1105 (ADR 0006): every Company-owned reference carries workspace_id
-- and company_id in its foreign key. Each replaced foreign key is re-added
-- below under the same name; the procedural guards stay unchanged.
-- 1. Drop the single-scope foreign keys, before the keys they depend on.
ALTER TABLE "workspace_invitation_proofs" DROP CONSTRAINT "workspace_invitation_proofs_invitation_id_workspace_invitations_id_fk";--> statement-breakpoint
ALTER TABLE "project_lifecycle_commands" DROP CONSTRAINT "project_lifecycle_commands_transition_fk";--> statement-breakpoint
ALTER TABLE "commercial_intake_outcome_commands" DROP CONSTRAINT "commercial_intake_outcome_commands_history_fk";--> statement-breakpoint
ALTER TABLE "mission_result_review_batches" DROP CONSTRAINT "mission_result_review_batches_reviewer_assignment_id_company_role_assignments_id_fk";--> statement-breakpoint
ALTER TABLE "mission_applicability_facts" DROP CONSTRAINT "mission_applicability_facts_assignment_id_company_role_assignments_id_fk";--> statement-breakpoint
ALTER TABLE "project_next_action_commands" DROP CONSTRAINT "project_next_action_commands_assignment_id_company_role_assignments_id_fk";--> statement-breakpoint
ALTER TABLE "project_next_action_history" DROP CONSTRAINT "project_next_action_history_assignment_id_company_role_assignments_id_fk";--> statement-breakpoint
ALTER TABLE "internal_company_task_commands" DROP CONSTRAINT "internal_company_task_commands_assignment_id_company_role_assignments_id_fk";--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_commands" DROP CONSTRAINT "opportunity_follow_up_commands_assignment_id_company_role_assignments_id_fk";--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_commands" DROP CONSTRAINT "opportunity_follow_up_commands_intake_assignment_id_company_role_assignments_id_fk";--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_events" DROP CONSTRAINT "opportunity_follow_up_events_command_id_opportunity_follow_up_commands_id_fk";--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_history" DROP CONSTRAINT "opportunity_follow_up_history_command_id_opportunity_follow_up_commands_id_fk";--> statement-breakpoint
ALTER TABLE "invoice_record_commands" DROP CONSTRAINT "invoice_record_commands_assignment_id_company_role_assignments_id_fk";--> statement-breakpoint
ALTER TABLE "invoice_record_events" DROP CONSTRAINT "invoice_record_events_command_id_invoice_record_commands_id_fk";--> statement-breakpoint
ALTER TABLE "invoice_record_history" DROP CONSTRAINT "invoice_record_history_command_id_invoice_record_commands_id_fk";--> statement-breakpoint
ALTER TABLE "payment_commands" DROP CONSTRAINT "payment_commands_assignment_id_company_role_assignments_id_fk";--> statement-breakpoint
ALTER TABLE "payment_events" DROP CONSTRAINT "payment_events_command_id_payment_commands_id_fk";--> statement-breakpoint
ALTER TABLE "payment_history" DROP CONSTRAINT "payment_history_command_id_payment_commands_id_fk";--> statement-breakpoint
-- 2. Parent keys that include company_id. A Project or an Opportunity has one
-- Company, so the widened keys accept exactly the rows the old ones did.
ALTER TABLE "project_lifecycle_transitions" DROP CONSTRAINT "project_lifecycle_transitions_revision_unique";--> statement-breakpoint
ALTER TABLE "project_lifecycle_transitions" ADD CONSTRAINT "project_lifecycle_transitions_revision_unique" UNIQUE("workspace_id","company_id","project_id","lifecycle_revision");--> statement-breakpoint
ALTER TABLE "opportunity_outcome_history" DROP CONSTRAINT "opportunity_outcome_history_version_unique";--> statement-breakpoint
ALTER TABLE "opportunity_outcome_history" ADD CONSTRAINT "opportunity_outcome_history_version_unique" UNIQUE("workspace_id","company_id","opportunity_id","opportunity_version");--> statement-breakpoint
CREATE UNIQUE INDEX "company_role_assignments_scope_unique" ON "company_role_assignments" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ofup_command_scope_unique" ON "opportunity_follow_up_commands" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_command_scope_unique" ON "invoice_record_commands" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_command_scope_unique" ON "payment_commands" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
-- 3. Expand and backfill the proof's Workspace from its own invitation; every
-- proof has one, so SET NOT NULL fails only on a row it could not resolve.
ALTER TABLE "workspace_invitation_proofs" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
UPDATE "workspace_invitation_proofs" AS p SET "workspace_id" = i."workspace_id" FROM "workspace_invitations" AS i WHERE i."id" = p."invitation_id";--> statement-breakpoint
ALTER TABLE "workspace_invitation_proofs" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
-- 4. Re-add every foreign key with its full scope.
ALTER TABLE "workspace_invitation_proofs" ADD CONSTRAINT "workspace_invitation_proofs_invitation_id_workspace_invitations_id_fk" FOREIGN KEY ("workspace_id","invitation_id") REFERENCES "public"."workspace_invitations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_lifecycle_commands" ADD CONSTRAINT "project_lifecycle_commands_transition_fk" FOREIGN KEY ("workspace_id","company_id","project_id","result_revision") REFERENCES "public"."project_lifecycle_transitions"("workspace_id","company_id","project_id","lifecycle_revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_intake_outcome_commands" ADD CONSTRAINT "commercial_intake_outcome_commands_history_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id","result_version") REFERENCES "public"."opportunity_outcome_history"("workspace_id","company_id","opportunity_id","opportunity_version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_result_review_batches" ADD CONSTRAINT "mission_result_review_batches_reviewer_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("workspace_id","company_id","reviewer_assignment_id") REFERENCES "public"."company_role_assignments"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_applicability_facts" ADD CONSTRAINT "mission_applicability_facts_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("workspace_id","company_id","assignment_id") REFERENCES "public"."company_role_assignments"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_next_action_commands" ADD CONSTRAINT "project_next_action_commands_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("workspace_id","company_id","assignment_id") REFERENCES "public"."company_role_assignments"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_next_action_history" ADD CONSTRAINT "project_next_action_history_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("workspace_id","company_id","assignment_id") REFERENCES "public"."company_role_assignments"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_company_task_commands" ADD CONSTRAINT "internal_company_task_commands_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("workspace_id","company_id","assignment_id") REFERENCES "public"."company_role_assignments"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_commands" ADD CONSTRAINT "opportunity_follow_up_commands_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("workspace_id","company_id","assignment_id") REFERENCES "public"."company_role_assignments"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_commands" ADD CONSTRAINT "opportunity_follow_up_commands_intake_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("workspace_id","company_id","intake_assignment_id") REFERENCES "public"."company_role_assignments"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_events" ADD CONSTRAINT "opportunity_follow_up_events_command_id_opportunity_follow_up_commands_id_fk" FOREIGN KEY ("workspace_id","company_id","command_id") REFERENCES "public"."opportunity_follow_up_commands"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_history" ADD CONSTRAINT "opportunity_follow_up_history_command_id_opportunity_follow_up_commands_id_fk" FOREIGN KEY ("workspace_id","company_id","command_id") REFERENCES "public"."opportunity_follow_up_commands"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_record_commands" ADD CONSTRAINT "invoice_record_commands_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("workspace_id","company_id","assignment_id") REFERENCES "public"."company_role_assignments"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_record_events" ADD CONSTRAINT "invoice_record_events_command_id_invoice_record_commands_id_fk" FOREIGN KEY ("workspace_id","company_id","command_id") REFERENCES "public"."invoice_record_commands"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_record_history" ADD CONSTRAINT "invoice_record_history_command_id_invoice_record_commands_id_fk" FOREIGN KEY ("workspace_id","company_id","command_id") REFERENCES "public"."invoice_record_commands"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_commands" ADD CONSTRAINT "payment_commands_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("workspace_id","company_id","assignment_id") REFERENCES "public"."company_role_assignments"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_command_id_payment_commands_id_fk" FOREIGN KEY ("workspace_id","company_id","command_id") REFERENCES "public"."payment_commands"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_command_id_payment_commands_id_fk" FOREIGN KEY ("workspace_id","company_id","command_id") REFERENCES "public"."payment_commands"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;
