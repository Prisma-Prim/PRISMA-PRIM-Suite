CREATE TYPE "public"."invitation_command_operation" AS ENUM('issue', 'revoke');--> statement-breakpoint
CREATE TYPE "public"."invitation_delivery_status" AS ENUM('uncertain', 'pending', 'accepted', 'revoked', 'expired', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'workspace_invitation.issued' BEFORE 'internal_user.provisioned';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'workspace_invitation.revoked' BEFORE 'internal_user.provisioned';--> statement-breakpoint
ALTER TYPE "public"."activity_log_target_type" ADD VALUE 'workspace_invitation' BEFORE 'internal_user';--> statement-breakpoint
ALTER TYPE "public"."workspace_permission" ADD VALUE 'member.invite' BEFORE 'company.manage';--> statement-breakpoint
CREATE TABLE "workspace_invitation_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"operation" "invitation_command_operation" NOT NULL,
	"invitation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"issued_by_workspace_membership_id" uuid NOT NULL,
	"email" text NOT NULL,
	"expires_in_days" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"delivery_status" "invitation_delivery_status" DEFAULT 'uncertain' NOT NULL,
	"provider_id" text,
	"revoked_at" timestamp with time zone,
	"sync_claim" uuid,
	"sync_after" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_invitations_expiry_check" CHECK ("workspace_invitations"."expires_in_days" BETWEEN 1 AND 30),
	CONSTRAINT "workspace_invitations_provider_check" CHECK ("workspace_invitations"."delivery_status" IN ('uncertain', 'rejected') OR "workspace_invitations"."provider_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "activity_log_events" DROP CONSTRAINT "activity_log_events_target_shape_check";--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD COLUMN "target_workspace_invitation_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invitation_commands_actor_key_unique" ON "workspace_invitation_commands" USING btree ("workspace_id","actor_workspace_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invitations_scope_unique" ON "workspace_invitations" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invitations_provider_unique" ON "workspace_invitations" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "workspace_invitations_listing" ON "workspace_invitations" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "workspace_invitation_commands" ADD CONSTRAINT "workspace_invitation_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitation_commands" ADD CONSTRAINT "workspace_invitation_commands_invitation_fk" FOREIGN KEY ("workspace_id","invitation_id") REFERENCES "public"."workspace_invitations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_issuer_fk" FOREIGN KEY ("workspace_id","issued_by_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD CONSTRAINT "activity_log_events_invitation_fk" FOREIGN KEY ("workspace_id","target_workspace_invitation_id") REFERENCES "public"."workspace_invitations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD CONSTRAINT "activity_log_events_invitation_target_check" CHECK (("activity_log_events"."target_type"::text = 'workspace_invitation') = ("activity_log_events"."target_workspace_invitation_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD CONSTRAINT "activity_log_events_target_shape_check" CHECK ((
        ("activity_log_events"."target_type"::text = 'workspace_invitation'
          AND "activity_log_events"."target_internal_user_id" IS NULL
          AND "activity_log_events"."target_workspace_membership_id" IS NULL
          AND "activity_log_events"."target_company_id" IS NULL
          AND "activity_log_events"."target_company_role_assignment_id" IS NULL
          AND "activity_log_events"."target_client_account_id" IS NULL
          AND "activity_log_events"."target_client_company_relationship_id" IS NULL)
        OR
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