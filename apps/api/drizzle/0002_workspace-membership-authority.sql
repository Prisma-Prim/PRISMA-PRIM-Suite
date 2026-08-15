CREATE TYPE "public"."workspace_membership_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "workspace_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"internal_user_id" uuid NOT NULL,
	"status" "workspace_membership_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD COLUMN "actor_workspace_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD COLUMN "target_workspace_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_internal_user_id_internal_users_id_fk" FOREIGN KEY ("internal_user_id") REFERENCES "public"."internal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_memberships_workspace_user_unique" ON "workspace_memberships" USING btree ("workspace_id","internal_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_memberships_workspace_id_user_unique" ON "workspace_memberships" USING btree ("workspace_id","id","internal_user_id");--> statement-breakpoint
INSERT INTO "workspace_memberships" (
	"workspace_id", "internal_user_id", "status", "created_at", "updated_at"
)
SELECT "workspace_id", "id", "status"::text::"workspace_membership_status", "created_at", "updated_at"
FROM "internal_users"
ON CONFLICT ("workspace_id", "internal_user_id") DO NOTHING;--> statement-breakpoint
UPDATE "activity_log_events" AS event
SET "actor_workspace_membership_id" = membership."id"
FROM "workspace_memberships" AS membership
WHERE membership."workspace_id" = event."workspace_id"
	AND membership."internal_user_id" = event."actor_internal_user_id";--> statement-breakpoint
UPDATE "activity_log_events" AS event
SET "target_workspace_membership_id" = membership."id"
FROM "workspace_memberships" AS membership
WHERE membership."workspace_id" = event."workspace_id"
	AND membership."internal_user_id" = event."target_internal_user_id";--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD CONSTRAINT "activity_log_events_actor_membership_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD CONSTRAINT "activity_log_events_target_membership_fk" FOREIGN KEY ("workspace_id","target_workspace_membership_id","target_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log_events" DROP CONSTRAINT "activity_log_events_actor_workspace_fk";--> statement-breakpoint
ALTER TABLE "activity_log_events" DROP CONSTRAINT "activity_log_events_target_workspace_fk";--> statement-breakpoint
CREATE FUNCTION "maintain_membership_for_legacy_internal_user"() RETURNS trigger AS $$
BEGIN
	INSERT INTO "workspace_memberships" (
		"workspace_id", "internal_user_id", "status", "created_at", "updated_at"
	) VALUES (
		NEW."workspace_id", NEW."id",
		NEW."status"::text::"workspace_membership_status",
		NEW."created_at", NEW."updated_at"
	)
	ON CONFLICT ("workspace_id", "internal_user_id") DO UPDATE
	SET "status" = excluded."status", "updated_at" = excluded."updated_at";
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "internal_users_legacy_membership_insert"
AFTER INSERT ON "internal_users"
FOR EACH ROW EXECUTE FUNCTION "maintain_membership_for_legacy_internal_user"();--> statement-breakpoint
CREATE TRIGGER "internal_users_legacy_membership_status_update"
AFTER UPDATE OF "status" ON "internal_users"
FOR EACH ROW EXECUTE FUNCTION "maintain_membership_for_legacy_internal_user"();--> statement-breakpoint
CREATE FUNCTION "maintain_membership_references_for_legacy_activity_event"() RETURNS trigger AS $$
BEGIN
	IF NEW."actor_workspace_membership_id" IS NULL THEN
		SELECT "id" INTO NEW."actor_workspace_membership_id"
		FROM "workspace_memberships"
		WHERE "workspace_id" = NEW."workspace_id"
			AND "internal_user_id" = NEW."actor_internal_user_id";
	END IF;
	IF NEW."actor_workspace_membership_id" IS NULL THEN
		RAISE EXCEPTION 'Activity Log actor requires a Workspace Membership'
			USING ERRCODE = 'foreign_key_violation';
	END IF;
	IF NEW."target_workspace_membership_id" IS NULL THEN
		SELECT "id" INTO NEW."target_workspace_membership_id"
		FROM "workspace_memberships"
		WHERE "workspace_id" = NEW."workspace_id"
			AND "internal_user_id" = NEW."target_internal_user_id";
	END IF;
	IF NEW."target_workspace_membership_id" IS NULL THEN
		RAISE EXCEPTION 'Activity Log target requires a Workspace Membership'
			USING ERRCODE = 'foreign_key_violation';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "activity_log_events_legacy_membership_references"
BEFORE INSERT ON "activity_log_events"
FOR EACH ROW EXECUTE FUNCTION "maintain_membership_references_for_legacy_activity_event"();--> statement-breakpoint
ALTER TABLE "activity_log_events" ALTER COLUMN "actor_workspace_membership_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_log_events" ALTER COLUMN "target_workspace_membership_id" SET NOT NULL;--> statement-breakpoint
COMMENT ON COLUMN "internal_users"."workspace_id" IS
'Deprecated expand/backfill compatibility field. Workspace Membership is authoritative.';--> statement-breakpoint
COMMENT ON COLUMN "workspaces"."singleton_key" IS
'Deprecated expand/backfill compatibility key. Access authority never comes from this field.';
