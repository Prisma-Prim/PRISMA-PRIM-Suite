ALTER TABLE "document_representations" DROP CONSTRAINT "document_representations_state_check";--> statement-breakpoint
ALTER TABLE "document_version_commands" DROP CONSTRAINT "document_version_commands_state_check";--> statement-breakpoint
DROP INDEX "document_representations_version_unique";--> statement-breakpoint
ALTER TABLE "document_representations" ADD COLUMN "position" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "document_representations" ADD COLUMN "form" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_representations" ADD COLUMN "added_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "document_representations" ADD COLUMN "added_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document_representations" ADD COLUMN "appended_after_designation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document_representations" ADD COLUMN "removed_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "document_representations" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document_version_commands" ADD COLUMN "representation_id" uuid;--> statement-breakpoint
ALTER TABLE "document_version_commands" ADD COLUMN "representation_form" text;--> statement-breakpoint
ALTER TABLE "document_version_commands" ADD COLUMN "appended_after_designation" boolean;--> statement-breakpoint
-- Migration-scoped only: the 0036 trigger rejects updates to designated
-- references, including this attribution backfill. The table's migration DDL
-- lock prevents concurrent writes, and the trigger is recreated below before
-- this migration transaction can commit.
DROP TRIGGER "document_representations_frozen" ON "document_representations";--> statement-breakpoint
-- Existing references were created with their Version. Preserve that actor and
-- time rather than inventing migration-time attribution.
UPDATE "document_representations" AS "representation"
SET "added_by_membership_id" = "version"."created_by_membership_id",
    "added_at" = "version"."created_at"
FROM "document_versions" AS "version"
WHERE "version"."workspace_id" = "representation"."workspace_id"
  AND "version"."company_id" = "representation"."company_id"
  AND "version"."id" = "representation"."version_id";--> statement-breakpoint
ALTER TABLE "document_representations" ALTER COLUMN "added_by_membership_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "document_representations" ALTER COLUMN "added_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "document_representations" ALTER COLUMN "added_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "document_representations" ADD CONSTRAINT "document_representations_adder_fk" FOREIGN KEY ("workspace_id","added_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_representations" ADD CONSTRAINT "document_representations_remover_fk" FOREIGN KEY ("workspace_id","removed_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_representations_version_position_unique" ON "document_representations" USING btree ("workspace_id","company_id","version_id","position");--> statement-breakpoint
ALTER TABLE "document_representations" ADD CONSTRAINT "document_representations_state_check" CHECK ("document_representations"."kind" = 'external-reference' AND "document_representations"."verification" = 'unverified' AND "document_representations"."url" LIKE 'https://%' AND "document_representations"."position" >= 1 AND "document_representations"."form" IN ('editable', 'rendered', 'signed', 'other') AND (("document_representations"."removed_at" IS NULL AND "document_representations"."removed_by_membership_id" IS NULL) OR ("document_representations"."removed_at" IS NOT NULL AND "document_representations"."removed_by_membership_id" IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "document_version_commands" ADD CONSTRAINT "document_version_commands_state_check" CHECK ((
        "document_version_commands"."expected_revision" >= 1
        AND "document_version_commands"."revision" = "document_version_commands"."expected_revision" + 1
        AND "document_version_commands"."version_number" BETWEEN 1 AND 50
        AND (("document_version_commands"."action" = 'drafted'
            AND "document_version_commands"."related_version_number" IS NOT NULL
            AND "document_version_commands"."related_version_number" BETWEEN 1 AND "document_version_commands"."version_number" - 1
            AND "document_version_commands"."representation_id" IS NULL
            AND "document_version_commands"."representation_form" IS NULL
            AND "document_version_commands"."appended_after_designation" IS NULL)
          OR ("document_version_commands"."action" = 'designated_official'
            AND ("document_version_commands"."related_version_number" IS NULL
              OR "document_version_commands"."related_version_number" BETWEEN 1 AND "document_version_commands"."version_number" - 1)
            AND "document_version_commands"."representation_id" IS NULL
            AND "document_version_commands"."representation_form" IS NULL
            AND "document_version_commands"."appended_after_designation" IS NULL)
          OR ("document_version_commands"."action" = 'representation_added'
            AND "document_version_commands"."related_version_number" IS NULL
            AND "document_version_commands"."representation_id" IS NOT NULL
            AND "document_version_commands"."representation_form" IN ('editable', 'rendered', 'signed', 'other')
            AND "document_version_commands"."appended_after_designation" IS NOT NULL)
          OR ("document_version_commands"."action" = 'representation_removed'
            AND "document_version_commands"."related_version_number" IS NULL
            AND "document_version_commands"."representation_id" IS NOT NULL
            AND "document_version_commands"."representation_form" IN ('editable', 'rendered', 'signed', 'other')
            AND "document_version_commands"."appended_after_designation" IS NULL))
      ) IS TRUE);
--> statement-breakpoint
-- A draft reference remains mutable. A current official Version accepts only
-- a new append explicitly marked as post-designation. Superseded references,
-- and every update or delete of a designated Version reference, stay frozen.
CREATE OR REPLACE FUNCTION guard_document_reference_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source_status text;
  target_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO target_status FROM document_versions WHERE id = NEW.version_id;
    IF target_status = 'draft' THEN
      RETURN NEW;
    END IF;
    IF target_status = 'official' AND NEW.appended_after_designation IS TRUE THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'The reference of a designated Document Version is frozen';
  END IF;

  SELECT status INTO source_status FROM document_versions WHERE id = OLD.version_id;
  IF source_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'The reference of a designated Document Version is frozen';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT status INTO target_status FROM document_versions WHERE id = NEW.version_id;
    IF target_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'The reference of a designated Document Version is frozen';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Document references are retained when removed';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER document_representations_frozen BEFORE INSERT OR UPDATE OR DELETE ON document_representations FOR EACH ROW EXECUTE FUNCTION guard_document_reference_change();
