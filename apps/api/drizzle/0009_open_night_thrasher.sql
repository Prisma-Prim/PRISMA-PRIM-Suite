CREATE TYPE "public"."client_account_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."client_company_relationship_status" AS ENUM('active', 'archived');--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'client_company_relationship.established';--> statement-breakpoint
ALTER TYPE "public"."activity_log_target_type" ADD VALUE 'client_account';--> statement-breakpoint
ALTER TYPE "public"."activity_log_target_type" ADD VALUE 'client_company_relationship';--> statement-breakpoint
ALTER TYPE "public"."workspace_permission" ADD VALUE 'client.manage';--> statement-breakpoint
CREATE TABLE "client_account_registration_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"display_name" text NOT NULL,
	"company_id" uuid NOT NULL,
	"result_client_account_id" uuid,
	"result_relationship_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_registration_commands_result_shape_check" CHECK ((
        ("client_account_registration_commands"."result_client_account_id" IS NULL AND "client_account_registration_commands"."result_relationship_id" IS NULL)
        OR
        ("client_account_registration_commands"."result_client_account_id" IS NOT NULL AND "client_account_registration_commands"."result_relationship_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "client_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"status" "client_account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_internal_user_id" uuid NOT NULL,
	"created_by_workspace_membership_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_company_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_account_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"status" "client_company_relationship_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_internal_user_id" uuid NOT NULL,
	"created_by_workspace_membership_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log_events" DROP CONSTRAINT "activity_log_events_target_shape_check";--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD COLUMN "target_client_account_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD COLUMN "target_client_company_relationship_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "client_registration_commands_actor_key_unique" ON "client_account_registration_commands" USING btree ("workspace_id","actor_workspace_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "client_accounts_workspace_id_id_unique" ON "client_accounts" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_company_relationships_scope_unique" ON "client_company_relationships" USING btree ("workspace_id","client_account_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_company_relationships_target_unique" ON "client_company_relationships" USING btree ("workspace_id","client_account_id","company_id","id");--> statement-breakpoint
ALTER TABLE "client_account_registration_commands" ADD CONSTRAINT "client_registration_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_account_registration_commands" ADD CONSTRAINT "client_registration_commands_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_account_registration_commands" ADD CONSTRAINT "client_registration_commands_client_fk" FOREIGN KEY ("workspace_id","result_client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_account_registration_commands" ADD CONSTRAINT "client_registration_commands_relationship_fk" FOREIGN KEY ("workspace_id","result_client_account_id","company_id","result_relationship_id") REFERENCES "public"."client_company_relationships"("workspace_id","client_account_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_workspace_membership_id","created_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_company_relationships" ADD CONSTRAINT "client_company_relationships_client_fk" FOREIGN KEY ("workspace_id","client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_company_relationships" ADD CONSTRAINT "client_company_relationships_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_company_relationships" ADD CONSTRAINT "client_company_relationships_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_workspace_membership_id","created_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD CONSTRAINT "activity_log_events_target_client_fk" FOREIGN KEY ("workspace_id","target_client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD CONSTRAINT "activity_log_events_target_client_relationship_fk" FOREIGN KEY ("workspace_id","target_client_account_id","target_company_id","target_client_company_relationship_id") REFERENCES "public"."client_company_relationships"("workspace_id","client_account_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD CONSTRAINT "activity_log_events_target_shape_check" CHECK ((
        ("activity_log_events"."target_type"::text = 'internal_user'
          AND "activity_log_events"."target_internal_user_id" IS NOT NULL
          AND "activity_log_events"."target_workspace_membership_id" IS NOT NULL
          AND "activity_log_events"."target_company_id" IS NULL
          AND "activity_log_events"."target_company_role_assignment_id" IS NULL
          AND "activity_log_events"."target_client_account_id" IS NULL
          AND "activity_log_events"."target_client_company_relationship_id" IS NULL)
        OR
        ("activity_log_events"."target_type"::text = 'company'
          AND "activity_log_events"."target_internal_user_id" IS NULL
          AND "activity_log_events"."target_workspace_membership_id" IS NULL
          AND "activity_log_events"."target_company_id" IS NOT NULL
          AND "activity_log_events"."target_company_role_assignment_id" IS NULL
          AND "activity_log_events"."target_client_account_id" IS NULL
          AND "activity_log_events"."target_client_company_relationship_id" IS NULL)
        OR
        ("activity_log_events"."target_type"::text = 'company_role_assignment'
          AND "activity_log_events"."target_internal_user_id" IS NOT NULL
          AND "activity_log_events"."target_workspace_membership_id" IS NOT NULL
          AND "activity_log_events"."target_company_id" IS NOT NULL
          AND "activity_log_events"."target_company_role_assignment_id" IS NOT NULL
          AND "activity_log_events"."target_client_account_id" IS NULL
          AND "activity_log_events"."target_client_company_relationship_id" IS NULL)
        OR
        ("activity_log_events"."target_type"::text = 'client_account'
          AND "activity_log_events"."target_internal_user_id" IS NULL
          AND "activity_log_events"."target_workspace_membership_id" IS NULL
          AND "activity_log_events"."target_company_id" IS NULL
          AND "activity_log_events"."target_company_role_assignment_id" IS NULL
          AND "activity_log_events"."target_client_account_id" IS NOT NULL
          AND "activity_log_events"."target_client_company_relationship_id" IS NULL)
        OR
        ("activity_log_events"."target_type"::text = 'client_company_relationship'
          AND "activity_log_events"."target_internal_user_id" IS NULL
          AND "activity_log_events"."target_workspace_membership_id" IS NULL
          AND "activity_log_events"."target_company_id" IS NOT NULL
          AND "activity_log_events"."target_company_role_assignment_id" IS NULL
          AND "activity_log_events"."target_client_account_id" IS NOT NULL
          AND "activity_log_events"."target_client_company_relationship_id" IS NOT NULL)
      ));
