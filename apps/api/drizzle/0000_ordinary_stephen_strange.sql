CREATE TYPE "public"."internal_user_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "internal_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"external_provider" text NOT NULL,
	"external_subject" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"status" "internal_user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton_key" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "internal_users" ADD CONSTRAINT "internal_users_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "internal_users_external_identity_unique" ON "internal_users" USING btree ("external_provider","external_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_singleton_key_unique" ON "workspaces" USING btree ("singleton_key");