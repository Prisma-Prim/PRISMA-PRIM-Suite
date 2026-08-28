ALTER TYPE "public"."activity_log_action" ADD VALUE 'workspace_membership.suspended' BEFORE 'company.registered';--> statement-breakpoint
ALTER TYPE "public"."activity_log_target_type" ADD VALUE 'workspace_membership' BEFORE 'company';--> statement-breakpoint
CREATE TABLE "workspace_membership_suspension_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"target_workspace_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log_events" DROP CONSTRAINT "activity_log_events_target_shape_check";--> statement-breakpoint
ALTER TABLE "workspace_membership_suspension_commands" ADD CONSTRAINT "workspace_membership_suspension_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_membership_suspension_commands" ADD CONSTRAINT "workspace_membership_suspension_commands_target_fk" FOREIGN KEY ("workspace_id","target_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_membership_suspension_commands_actor_key_unique" ON "workspace_membership_suspension_commands" USING btree ("workspace_id","actor_workspace_membership_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD CONSTRAINT "activity_log_events_target_shape_check" CHECK ((
        ("activity_log_events"."target_type"::text = 'internal_user'
          AND "activity_log_events"."target_internal_user_id" IS NOT NULL
          AND "activity_log_events"."target_workspace_membership_id" IS NOT NULL
          AND "activity_log_events"."target_company_id" IS NULL
          AND "activity_log_events"."target_company_role_assignment_id" IS NULL
          AND "activity_log_events"."target_client_account_id" IS NULL
          AND "activity_log_events"."target_client_company_relationship_id" IS NULL)
        OR
        ("activity_log_events"."target_type"::text = 'workspace_membership'
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