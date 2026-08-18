CREATE TYPE "public"."company_role_bundle" AS ENUM('company_context_access');--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_context_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_context_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."activity_log_target_type" ADD VALUE 'company_role_assignment';--> statement-breakpoint
ALTER TYPE "public"."workspace_permission" ADD VALUE 'company.assignment.manage';--> statement-breakpoint
CREATE TABLE "company_role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"workspace_membership_id" uuid NOT NULL,
	"bundle" "company_role_bundle" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activity_log_events" DROP CONSTRAINT "activity_log_events_target_shape_check";--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD COLUMN "target_company_role_assignment_id" uuid;--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_membership_fk" FOREIGN KEY ("workspace_id","workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_role_assignments_scope_unique" ON "company_role_assignments" USING btree ("workspace_id","company_id","workspace_membership_id","bundle");--> statement-breakpoint
CREATE UNIQUE INDEX "company_role_assignments_target_unique" ON "company_role_assignments" USING btree ("workspace_id","company_id","workspace_membership_id","id");--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD CONSTRAINT "activity_log_events_target_company_assignment_fk" FOREIGN KEY ("workspace_id","target_company_id","target_workspace_membership_id","target_company_role_assignment_id") REFERENCES "public"."company_role_assignments"("workspace_id","company_id","workspace_membership_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD CONSTRAINT "activity_log_events_target_shape_check" CHECK ((
        ("activity_log_events"."target_type"::text = 'internal_user'
          AND "activity_log_events"."target_internal_user_id" IS NOT NULL
          AND "activity_log_events"."target_workspace_membership_id" IS NOT NULL
          AND "activity_log_events"."target_company_id" IS NULL
          AND "activity_log_events"."target_company_role_assignment_id" IS NULL)
        OR
        ("activity_log_events"."target_type"::text = 'company'
          AND "activity_log_events"."target_internal_user_id" IS NULL
          AND "activity_log_events"."target_workspace_membership_id" IS NULL
          AND "activity_log_events"."target_company_id" IS NOT NULL
          AND "activity_log_events"."target_company_role_assignment_id" IS NULL)
        OR
        ("activity_log_events"."target_type"::text = 'company_role_assignment'
          AND "activity_log_events"."target_internal_user_id" IS NOT NULL
          AND "activity_log_events"."target_workspace_membership_id" IS NOT NULL
          AND "activity_log_events"."target_company_id" IS NOT NULL
          AND "activity_log_events"."target_company_role_assignment_id" IS NOT NULL)
      ));