ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_document_approver_assignment.granted' BEFORE 'company_project_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_document_approver_assignment.revoked' BEFORE 'company_project_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_document_approver' BEFORE 'company_project_access';--> statement-breakpoint
CREATE TABLE "document_version_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"action" text NOT NULL,
	"version_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"related_version_number" integer,
	"actor_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"expected_revision" integer NOT NULL,
	"revision" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_version_commands_state_check" CHECK ((
        "document_version_commands"."expected_revision" >= 1
        AND "document_version_commands"."revision" = "document_version_commands"."expected_revision" + 1
        AND "document_version_commands"."version_number" BETWEEN 1 AND 50
        AND (("document_version_commands"."action" = 'drafted'
            AND "document_version_commands"."related_version_number" IS NOT NULL
            AND "document_version_commands"."related_version_number" BETWEEN 1 AND "document_version_commands"."version_number" - 1)
          OR ("document_version_commands"."action" = 'designated_official'
            AND ("document_version_commands"."related_version_number" IS NULL
              OR "document_version_commands"."related_version_number" BETWEEN 1 AND "document_version_commands"."version_number" - 1)))
      ) IS TRUE)
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "document_versions" DROP CONSTRAINT "document_versions_draft_check";--> statement-breakpoint
DROP INDEX "document_versions_document_unique";--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "number" integer;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "created_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "designated_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "designated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "frozen_title" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "frozen_purpose" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "superseded_by_version_id" uuid;--> statement-breakpoint
-- Every existing Document had exactly one draft Version (the dropped unique
-- index and draft CHECK above). It becomes Version 1 draft, created by the
-- Document's creator at its creation time. No designation is inferred.
UPDATE "document_versions" AS "version"
SET "number" = 1,
    "created_by_membership_id" = "document"."created_by_membership_id",
    "created_at" = "document"."created_at"
FROM "working_documents" AS "document"
WHERE "document"."workspace_id" = "version"."workspace_id"
  AND "document"."company_id" = "version"."company_id"
  AND "document"."id" = "version"."document_id";--> statement-breakpoint
ALTER TABLE "document_versions" ALTER COLUMN "number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "document_versions" ALTER COLUMN "created_by_membership_id" SET NOT NULL;--> statement-breakpoint
-- The Document-scoped key must exist before the foreign keys that reference it.
CREATE UNIQUE INDEX "document_versions_document_scope_unique" ON "document_versions" USING btree ("workspace_id","company_id","document_id","id");--> statement-breakpoint
ALTER TABLE "document_version_commands" ADD CONSTRAINT "document_version_commands_document_fk" FOREIGN KEY ("workspace_id","company_id","document_id") REFERENCES "public"."working_documents"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version_commands" ADD CONSTRAINT "document_version_commands_version_fk" FOREIGN KEY ("workspace_id","company_id","document_id","version_id") REFERENCES "public"."document_versions"("workspace_id","company_id","document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version_commands" ADD CONSTRAINT "document_version_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_version_commands_actor_key_unique" ON "document_version_commands" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "document_version_commands_revision_unique" ON "document_version_commands" USING btree ("workspace_id","company_id","document_id","revision");--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_designator_fk" FOREIGN KEY ("workspace_id","designated_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_successor_fk" FOREIGN KEY ("workspace_id","company_id","document_id","superseded_by_version_id") REFERENCES "public"."document_versions"("workspace_id","company_id","document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_number_unique" ON "document_versions" USING btree ("workspace_id","company_id","document_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_draft_unique" ON "document_versions" USING btree ("workspace_id","company_id","document_id") WHERE "document_versions"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_official_unique" ON "document_versions" USING btree ("workspace_id","company_id","document_id") WHERE "document_versions"."status" = 'official';--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_document_registrar' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_commercial_intake', 'company_project_access') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_commercial_activity_reader') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_commercial_activity_reader')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_number_check" CHECK ("document_versions"."number" BETWEEN 1 AND 50);--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_state_check" CHECK ((
        ("document_versions"."status" = 'draft'
          AND "document_versions"."designated_by_membership_id" IS NULL
          AND "document_versions"."designated_at" IS NULL
          AND "document_versions"."frozen_title" IS NULL
          AND "document_versions"."frozen_purpose" IS NULL
          AND "document_versions"."superseded_at" IS NULL
          AND "document_versions"."superseded_by_version_id" IS NULL)
        OR
        ("document_versions"."status" IN ('official', 'superseded')
          AND "document_versions"."designated_by_membership_id" IS NOT NULL
          AND "document_versions"."designated_at" IS NOT NULL
          AND "document_versions"."frozen_title" IS NOT NULL
          AND "document_versions"."frozen_purpose" IS NOT NULL
          AND (("document_versions"."status" = 'official'
              AND "document_versions"."superseded_at" IS NULL
              AND "document_versions"."superseded_by_version_id" IS NULL)
            OR ("document_versions"."status" = 'superseded'
              AND "document_versions"."superseded_at" IS NOT NULL
              AND "document_versions"."superseded_by_version_id" IS NOT NULL
              AND "document_versions"."superseded_by_version_id" <> "document_versions"."id")))
      ) IS TRUE);--> statement-breakpoint
-- A designated Version is frozen. Identity and creation attribution never
-- change; a draft may only become official; the only change to a designated
-- row is official -> superseded, which records nothing but the supersession.
CREATE FUNCTION guard_document_version_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'A designated Document Version is frozen';
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.id, NEW.workspace_id, NEW.company_id, NEW.document_id, NEW.number,
      NEW.created_by_membership_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.workspace_id, OLD.company_id, OLD.document_id, OLD.number,
      OLD.created_by_membership_id, OLD.created_at) THEN
    RAISE EXCEPTION 'Document Version identity and creation are immutable';
  END IF;
  IF OLD.status = 'draft' THEN
    IF NEW.status NOT IN ('draft', 'official') THEN
      RAISE EXCEPTION 'A draft Document Version can only become official';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'official' AND NEW.status = 'superseded'
     AND (to_jsonb(NEW) - 'status' - 'superseded_at' - 'superseded_by_version_id')
       = (to_jsonb(OLD) - 'status' - 'superseded_at' - 'superseded_by_version_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'A designated Document Version is frozen';
END;
$$;--> statement-breakpoint
CREATE TRIGGER document_versions_frozen BEFORE UPDATE OR DELETE ON document_versions FOR EACH ROW EXECUTE FUNCTION guard_document_version_change();--> statement-breakpoint
-- Only a draft Version's reference may be inserted, corrected or removed.
CREATE FUNCTION guard_document_reference_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF EXISTS (
      SELECT 1 FROM document_versions
      WHERE document_versions.id = OLD.version_id AND document_versions.status <> 'draft'
    ) THEN
      RAISE EXCEPTION 'The reference of a designated Document Version is frozen';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM document_versions
      WHERE document_versions.id = NEW.version_id AND document_versions.status <> 'draft'
    ) THEN
      RAISE EXCEPTION 'The reference of a designated Document Version is frozen';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER document_representations_frozen BEFORE INSERT OR UPDATE OR DELETE ON document_representations FOR EACH ROW EXECUTE FUNCTION guard_document_reference_change();--> statement-breakpoint
CREATE FUNCTION reject_document_version_command_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Document Version command receipts and events are immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER document_version_commands_immutable BEFORE UPDATE OR DELETE ON document_version_commands FOR EACH ROW EXECUTE FUNCTION reject_document_version_command_mutation();
