ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_task_manager_assignment.granted' BEFORE 'company_document_project_organizer_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_task_manager_assignment.revoked' BEFORE 'company_document_project_organizer_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_task_manager' BEFORE 'company_context_access';--> statement-breakpoint
CREATE TABLE "task_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"command" text NOT NULL,
	"result" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"meaning" jsonb NOT NULL,
	CONSTRAINT "task_events_version_check" CHECK ("task_events"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"client_account_id" uuid NOT NULL,
	"title" text NOT NULL,
	"assignee_membership_id" uuid,
	"assignee_display_label" text,
	"due_date" date,
	"status" text DEFAULT 'todo' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_internal_user_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_by_display_name" text NOT NULL,
	"completed_by_internal_user_id" uuid,
	"completed_by_membership_id" uuid,
	"completed_by_display_name" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_title_check" CHECK (length("tasks"."title") BETWEEN 1 AND 200 AND "tasks"."title" = btrim("tasks"."title")),
	CONSTRAINT "tasks_version_check" CHECK ("tasks"."version" >= 1),
	CONSTRAINT "tasks_assignee_check" CHECK (("tasks"."assignee_membership_id" IS NULL) = ("tasks"."assignee_display_label" IS NULL)),
	CONSTRAINT "tasks_date_check" CHECK ("tasks"."due_date" IS NULL OR ("tasks"."due_date" >= DATE '0001-01-01' AND "tasks"."due_date" <= DATE '9999-12-31')),
	CONSTRAINT "tasks_state_check" CHECK (("tasks"."status" = 'todo' AND "tasks"."completed_at" IS NULL AND "tasks"."completed_by_membership_id" IS NULL AND "tasks"."completed_by_internal_user_id" IS NULL AND "tasks"."completed_by_display_name" IS NULL) OR ("tasks"."status" = 'done' AND "tasks"."completed_at" IS NOT NULL AND "tasks"."completed_by_membership_id" IS NOT NULL AND "tasks"."completed_by_internal_user_id" IS NOT NULL AND "tasks"."completed_by_display_name" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_scope_id_unique" ON "tasks" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_original_scope_id_unique" ON "projects" USING btree ("workspace_id","company_id","client_account_id","id");--> statement-breakpoint
ALTER TABLE "task_commands" ADD CONSTRAINT "task_commands_task_fk" FOREIGN KEY ("workspace_id","company_id","task_id") REFERENCES "public"."tasks"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_commands" ADD CONSTRAINT "task_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_fk" FOREIGN KEY ("workspace_id","company_id","task_id") REFERENCES "public"."tasks"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_fk" FOREIGN KEY ("workspace_id","company_id","client_account_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","client_account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_fk" FOREIGN KEY ("workspace_id","assignee_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id","created_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completion_actor_fk" FOREIGN KEY ("workspace_id","completed_by_membership_id","completed_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_commands_actor_key_unique" ON "task_commands" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "task_events_version_unique" ON "task_events" USING btree ("workspace_id","task_id","version");--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_project_access') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_project_access')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
--> statement-breakpoint
CREATE FUNCTION reject_task_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Task history and command receipts are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER task_events_immutable BEFORE UPDATE OR DELETE ON task_events FOR EACH ROW EXECUTE FUNCTION reject_task_history_mutation();
--> statement-breakpoint
CREATE TRIGGER task_commands_immutable BEFORE UPDATE OR DELETE ON task_commands FOR EACH ROW EXECUTE FUNCTION reject_task_history_mutation();
--> statement-breakpoint
CREATE FUNCTION preserve_task_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Tasks cannot be deleted';
  END IF;
  IF ROW(NEW.id, NEW.workspace_id, NEW.company_id, NEW.project_id, NEW.client_account_id, NEW.created_by_internal_user_id, NEW.created_by_membership_id, NEW.created_by_display_name, NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id, OLD.workspace_id, OLD.company_id, OLD.project_id, OLD.client_account_id, OLD.created_by_internal_user_id, OLD.created_by_membership_id, OLD.created_by_display_name, OLD.created_at) THEN
    RAISE EXCEPTION 'Task ownership and creation attribution are immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER tasks_preserve_identity BEFORE UPDATE OR DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION preserve_task_identity();
