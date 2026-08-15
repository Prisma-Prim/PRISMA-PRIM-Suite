CREATE TYPE "public"."activity_log_action" AS ENUM('internal_user.provisioned');--> statement-breakpoint
CREATE TYPE "public"."activity_log_target_type" AS ENUM('internal_user');--> statement-breakpoint
CREATE TABLE "activity_log_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"action" "activity_log_action" NOT NULL,
	"target_type" "activity_log_target_type" NOT NULL,
	"target_internal_user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb NOT NULL,
	"idempotency_key" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD CONSTRAINT "activity_log_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD CONSTRAINT "activity_log_events_actor_internal_user_id_internal_users_id_fk" FOREIGN KEY ("actor_internal_user_id") REFERENCES "public"."internal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD CONSTRAINT "activity_log_events_target_internal_user_id_internal_users_id_fk" FOREIGN KEY ("target_internal_user_id") REFERENCES "public"."internal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_log_events_idempotency_key_unique" ON "activity_log_events" USING btree ("idempotency_key");