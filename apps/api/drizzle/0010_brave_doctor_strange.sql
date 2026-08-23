ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_director_client_assignment.granted' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_director_client_assignment.revoked' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'client.corrected';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_director_client_access';--> statement-breakpoint
CREATE TABLE "client_account_correction_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"client_account_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"expected_version" integer NOT NULL,
	"changes" jsonb NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_correction_commands_positive_version_check" CHECK ("client_account_correction_commands"."expected_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "company_context_assignment_commands" DROP CONSTRAINT "company_context_assignment_commands_result_fk";
--> statement-breakpoint
ALTER TABLE "client_account_registration_commands" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "client_account_registration_commands" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "client_account_registration_commands" ADD COLUMN "telephone" text;--> statement-breakpoint
ALTER TABLE "client_account_registration_commands" ADD COLUMN "general_email" text;--> statement-breakpoint
ALTER TABLE "client_account_registration_commands" ADD COLUMN "contacts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "client_account_registration_commands" ADD COLUMN "business_activity" text;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "telephone" text;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "general_email" text;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "contacts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "business_activity" text;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "company_context_assignment_commands" ADD COLUMN "bundle" "company_role_bundle" DEFAULT 'company_context_access' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_account_correction_commands" ADD CONSTRAINT "client_correction_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_account_correction_commands" ADD CONSTRAINT "client_correction_commands_client_fk" FOREIGN KEY ("workspace_id","client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_account_correction_commands" ADD CONSTRAINT "client_correction_commands_relationship_fk" FOREIGN KEY ("workspace_id","client_account_id","company_id") REFERENCES "public"."client_company_relationships"("workspace_id","client_account_id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_correction_commands_actor_key_unique" ON "client_account_correction_commands" USING btree ("workspace_id","actor_workspace_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "company_role_assignments_bundle_target_unique" ON "company_role_assignments" USING btree ("workspace_id","company_id","workspace_membership_id","bundle","id");--> statement-breakpoint
ALTER TABLE "company_context_assignment_commands" ADD CONSTRAINT "company_context_assignment_commands_result_fk" FOREIGN KEY ("workspace_id","company_id","target_workspace_membership_id","bundle","result_assignment_id") REFERENCES "public"."company_role_assignments"("workspace_id","company_id","workspace_membership_id","bundle","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_positive_version_check" CHECK ("client_accounts"."version" > 0);
