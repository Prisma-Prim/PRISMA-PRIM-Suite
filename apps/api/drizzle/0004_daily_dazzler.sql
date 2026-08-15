ALTER TYPE "public"."activity_log_action" ADD VALUE 'company.registered';--> statement-breakpoint
ALTER TYPE "public"."activity_log_target_type" ADD VALUE 'company';--> statement-breakpoint
ALTER TABLE "activity_log_events" ALTER COLUMN "target_internal_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_log_events" ALTER COLUMN "target_workspace_membership_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD COLUMN "target_company_id" uuid;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "maintain_membership_references_for_legacy_activity_event"() RETURNS trigger AS $$
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
	IF NEW."target_type" = 'internal_user' THEN
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
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD CONSTRAINT "activity_log_events_target_company_fk" FOREIGN KEY ("workspace_id","target_company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD CONSTRAINT "activity_log_events_target_shape_check" CHECK ((
        ("activity_log_events"."target_type"::text = 'internal_user'
          AND "activity_log_events"."target_internal_user_id" IS NOT NULL
          AND "activity_log_events"."target_workspace_membership_id" IS NOT NULL
          AND "activity_log_events"."target_company_id" IS NULL)
        OR
        ("activity_log_events"."target_type"::text = 'company'
          AND "activity_log_events"."target_internal_user_id" IS NULL
          AND "activity_log_events"."target_workspace_membership_id" IS NULL
          AND "activity_log_events"."target_company_id" IS NOT NULL)
      ));
