CREATE TYPE "public"."company_status" AS ENUM('active');--> statement-breakpoint
CREATE TYPE "public"."workspace_permission" AS ENUM('company.manage');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"status" "company_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_internal_user_id" uuid NOT NULL,
	"created_by_workspace_membership_id" uuid NOT NULL,
	"registration_idempotency_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_permission_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"workspace_membership_id" uuid NOT NULL,
	"permission" "workspace_permission" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_memberships_workspace_id_id_unique" ON "workspace_memberships" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_workspace_membership_id","created_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_permission_grants" ADD CONSTRAINT "workspace_permission_grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_permission_grants" ADD CONSTRAINT "workspace_permission_grants_membership_fk" FOREIGN KEY ("workspace_id","workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_workspace_id_id_unique" ON "companies" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_workspace_registration_key_unique" ON "companies" USING btree ("workspace_id","registration_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_permission_grants_scope_unique" ON "workspace_permission_grants" USING btree ("workspace_id","workspace_membership_id","permission");
