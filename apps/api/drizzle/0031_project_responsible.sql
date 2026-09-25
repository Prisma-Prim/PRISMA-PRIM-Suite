CREATE TABLE "project_responsibility_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"expected_revision" integer NOT NULL,
	"result_revision" integer NOT NULL,
	"outcome" text NOT NULL,
	"responsible_membership_id" uuid,
	"responsible_display_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_responsibility_commands_outcome_check" CHECK ("project_responsibility_commands"."expected_revision" >= 0 AND (
        ("project_responsibility_commands"."outcome" = 'changed'
          AND "project_responsibility_commands"."result_revision" = ("project_responsibility_commands"."expected_revision")::bigint + 1)
        OR
        ("project_responsibility_commands"."outcome" = 'unchanged'
          AND "project_responsibility_commands"."result_revision" = "project_responsibility_commands"."expected_revision")
      )),
	CONSTRAINT "project_responsibility_commands_responsible_check" CHECK (("project_responsibility_commands"."responsible_membership_id" IS NULL) = ("project_responsibility_commands"."responsible_display_label" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "project_responsibility_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"before_membership_id" uuid,
	"before_display_label" text,
	"after_membership_id" uuid,
	"after_display_label" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_responsibility_events_revision_check" CHECK ("project_responsibility_events"."revision" >= 1),
	CONSTRAINT "project_responsibility_events_members_check" CHECK (("project_responsibility_events"."before_membership_id" IS NULL) = ("project_responsibility_events"."before_display_label" IS NULL)
        AND ("project_responsibility_events"."after_membership_id" IS NULL) = ("project_responsibility_events"."after_display_label" IS NULL)
        AND "project_responsibility_events"."before_membership_id" IS DISTINCT FROM "project_responsibility_events"."after_membership_id")
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "responsible_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "responsible_display_label" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "responsibility_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "responsibility_changed_by_internal_user_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "responsibility_changed_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "responsibility_changed_by_display_name" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "responsibility_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_responsibility_commands" ADD CONSTRAINT "project_responsibility_commands_project_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_responsibility_commands" ADD CONSTRAINT "project_responsibility_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_responsibility_commands" ADD CONSTRAINT "project_responsibility_commands_responsible_fk" FOREIGN KEY ("workspace_id","responsible_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_responsibility_events" ADD CONSTRAINT "project_responsibility_events_project_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_responsibility_events" ADD CONSTRAINT "project_responsibility_events_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_responsibility_events" ADD CONSTRAINT "project_responsibility_events_before_fk" FOREIGN KEY ("workspace_id","before_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_responsibility_events" ADD CONSTRAINT "project_responsibility_events_after_fk" FOREIGN KEY ("workspace_id","after_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_responsibility_commands_actor_key_unique" ON "project_responsibility_commands" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "project_responsibility_commands_revision_unique" ON "project_responsibility_commands" USING btree ("workspace_id","project_id","result_revision") WHERE "project_responsibility_commands"."outcome" = 'changed';--> statement-breakpoint
CREATE UNIQUE INDEX "project_responsibility_events_revision_unique" ON "project_responsibility_events" USING btree ("workspace_id","project_id","revision");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_responsible_fk" FOREIGN KEY ("workspace_id","responsible_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_responsibility_changed_by_fk" FOREIGN KEY ("workspace_id","responsibility_changed_by_membership_id","responsibility_changed_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_document_registrar', 'company_commercial_intake', 'company_project_access') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_service_catalogue', 'company_commercial_activity_reader') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_commercial_activity_reader')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_responsible_check" CHECK (("projects"."responsible_membership_id" IS NULL) = ("projects"."responsible_display_label" IS NULL));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_responsibility_revision_check" CHECK ((
        ("projects"."responsibility_revision" = 0
          AND "projects"."responsible_membership_id" IS NULL
          AND "projects"."responsibility_changed_by_internal_user_id" IS NULL
          AND "projects"."responsibility_changed_by_membership_id" IS NULL
          AND "projects"."responsibility_changed_by_display_name" IS NULL
          AND "projects"."responsibility_changed_at" IS NULL)
        OR
        ("projects"."responsibility_revision" >= 1
          AND "projects"."responsibility_changed_by_internal_user_id" IS NOT NULL
          AND "projects"."responsibility_changed_by_membership_id" IS NOT NULL
          AND "projects"."responsibility_changed_by_display_name" IS NOT NULL
          AND "projects"."responsibility_changed_at" IS NOT NULL)
      ));