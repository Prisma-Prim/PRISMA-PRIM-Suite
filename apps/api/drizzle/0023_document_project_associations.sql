ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_document_project_organizer_assignment.granted' BEFORE 'company_document_registrar_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_document_project_organizer_assignment.revoked' BEFORE 'company_document_registrar_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_document_project_organizer' BEFORE 'company_document_registrar';--> statement-breakpoint
CREATE TABLE "document_project_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"action" text NOT NULL,
	"expected_revision" integer NOT NULL,
	"revision" integer NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_project_events_state_check" CHECK ("document_project_events"."action" IN ('link', 'unlink') AND "document_project_events"."expected_revision" >= 0 AND "document_project_events"."revision" = "document_project_events"."expected_revision" + 1)
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "working_documents" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "working_documents" ADD COLUMN "project_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "document_project_events" ADD CONSTRAINT "document_project_events_document_fk" FOREIGN KEY ("workspace_id","company_id","document_id") REFERENCES "public"."working_documents"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_project_events" ADD CONSTRAINT "document_project_events_project_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_project_events" ADD CONSTRAINT "document_project_events_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_project_events_actor_key_unique" ON "document_project_events" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "document_project_events_revision_unique" ON "document_project_events" USING btree ("workspace_id","company_id","document_id","revision");--> statement-breakpoint
ALTER TABLE "working_documents" ADD CONSTRAINT "working_documents_project_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_document_project_organizer', 'company_document_registrar', 'company_project_access') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_document_project_organizer', 'company_document_registrar', 'company_project_access')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "working_documents" ADD CONSTRAINT "working_documents_project_revision_check" CHECK ("working_documents"."project_revision" >= 0);
--> statement-breakpoint
CREATE TRIGGER document_project_events_immutable BEFORE UPDATE OR DELETE ON document_project_events FOR EACH ROW EXECUTE FUNCTION reject_document_history_mutation();
