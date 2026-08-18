CREATE TYPE "public"."company_context_assignment_operation" AS ENUM('grant', 'revoke');--> statement-breakpoint
CREATE TABLE "company_context_assignment_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"operation" "company_context_assignment_operation" NOT NULL,
	"target_workspace_membership_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"result_assignment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_context_assignment_commands" ADD CONSTRAINT "company_context_assignment_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_context_assignment_commands" ADD CONSTRAINT "company_context_assignment_commands_target_membership_fk" FOREIGN KEY ("workspace_id","target_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_context_assignment_commands" ADD CONSTRAINT "company_context_assignment_commands_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_context_assignment_commands" ADD CONSTRAINT "company_context_assignment_commands_result_fk" FOREIGN KEY ("workspace_id","company_id","target_workspace_membership_id","result_assignment_id") REFERENCES "public"."company_role_assignments"("workspace_id","company_id","workspace_membership_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_context_assignment_commands_actor_key_unique" ON "company_context_assignment_commands" USING btree ("workspace_id","actor_workspace_membership_id","idempotency_key");