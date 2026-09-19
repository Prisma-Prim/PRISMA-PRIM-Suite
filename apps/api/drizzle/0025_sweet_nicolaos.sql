CREATE TABLE "document_correction_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"expected_revision" integer NOT NULL,
	"revision" integer NOT NULL,
	"outcome" text NOT NULL,
	"before_title" text NOT NULL,
	"before_purpose" text NOT NULL,
	"before_url" text NOT NULL,
	"after_title" text NOT NULL,
	"after_purpose" text NOT NULL,
	"after_url" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_correction_commands_state_check" CHECK ("document_correction_commands"."expected_revision" >= 1 AND (("document_correction_commands"."outcome" = 'corrected' AND "document_correction_commands"."revision" = "document_correction_commands"."expected_revision" + 1) OR ("document_correction_commands"."outcome" = 'unchanged' AND "document_correction_commands"."revision" = "document_correction_commands"."expected_revision")))
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "working_documents" ADD COLUMN "working_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "document_correction_commands" ADD CONSTRAINT "document_correction_commands_document_fk" FOREIGN KEY ("workspace_id","company_id","document_id") REFERENCES "public"."working_documents"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_correction_commands" ADD CONSTRAINT "document_correction_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_correction_commands_actor_key_unique" ON "document_correction_commands" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "document_correction_commands_revision_unique" ON "document_correction_commands" USING btree ("workspace_id","company_id","document_id","revision") WHERE "document_correction_commands"."outcome" = 'corrected';--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_document_registrar' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_project_access') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_project_access')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "working_documents" ADD CONSTRAINT "working_documents_working_revision_check" CHECK ("working_documents"."working_revision" >= 1);--> statement-breakpoint
CREATE FUNCTION reject_document_correction_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Document correction history and command receipts are immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER document_correction_commands_immutable BEFORE UPDATE OR DELETE ON document_correction_commands FOR EACH ROW EXECUTE FUNCTION reject_document_correction_history_mutation();
