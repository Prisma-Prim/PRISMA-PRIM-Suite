DROP TRIGGER "activity_log_events_legacy_membership_references" ON "activity_log_events";--> statement-breakpoint
DROP FUNCTION "maintain_membership_references_for_legacy_activity_event"();--> statement-breakpoint
DROP TRIGGER "internal_users_legacy_membership_status_update" ON "internal_users";--> statement-breakpoint
DROP TRIGGER "internal_users_legacy_membership_insert" ON "internal_users";--> statement-breakpoint
DROP FUNCTION "maintain_membership_for_legacy_internal_user"();--> statement-breakpoint
ALTER TABLE "internal_users" DROP CONSTRAINT "internal_users_workspace_id_workspaces_id_fk";
--> statement-breakpoint
DROP INDEX "internal_users_workspace_id_id_unique";--> statement-breakpoint
DROP INDEX "workspaces_singleton_key_unique";--> statement-breakpoint
ALTER TABLE "internal_users" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "singleton_key";
