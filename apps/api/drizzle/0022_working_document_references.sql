ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_document_registrar_assignment.granted' BEFORE 'company_project_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_document_registrar_assignment.revoked' BEFORE 'company_project_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_document_registrar' BEFORE 'company_project_access';--> statement-breakpoint
CREATE TABLE "document_registration_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_representations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"url" text NOT NULL,
	"kind" text DEFAULT 'external-reference' NOT NULL,
	"verification" text DEFAULT 'unverified' NOT NULL,
	CONSTRAINT "document_representations_state_check" CHECK ("document_representations"."kind" = 'external-reference' AND "document_representations"."verification" = 'unverified' AND "document_representations"."url" LIKE 'https://%')
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	CONSTRAINT "document_versions_draft_check" CHECK ("document_versions"."status" = 'draft')
);
--> statement-breakpoint
CREATE TABLE "working_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"purpose" text NOT NULL,
	"type" text DEFAULT 'questionnaire' NOT NULL,
	"confidentiality" text DEFAULT 'company-confidential' NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	CONSTRAINT "working_documents_state_check" CHECK ("working_documents"."type" = 'questionnaire' AND "working_documents"."confidentiality" = 'company-confidential' AND length(trim("working_documents"."title")) BETWEEN 1 AND 200 AND length(trim("working_documents"."purpose")) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "document_registration_events_document_unique" ON "document_registration_events" USING btree ("workspace_id","company_id","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_representations_version_unique" ON "document_representations" USING btree ("workspace_id","company_id","version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_document_unique" ON "document_versions" USING btree ("workspace_id","company_id","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_scope_unique" ON "document_versions" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "working_documents_scope_unique" ON "working_documents" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "working_documents_command_unique" ON "working_documents" USING btree ("workspace_id","created_by_membership_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "document_registration_events" ADD CONSTRAINT "document_registration_events_document_fk" FOREIGN KEY ("workspace_id","company_id","document_id") REFERENCES "public"."working_documents"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_registration_events" ADD CONSTRAINT "document_registration_events_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_representations" ADD CONSTRAINT "document_representations_version_fk" FOREIGN KEY ("workspace_id","company_id","version_id") REFERENCES "public"."document_versions"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_fk" FOREIGN KEY ("workspace_id","company_id","document_id") REFERENCES "public"."working_documents"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_documents" ADD CONSTRAINT "working_documents_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_documents" ADD CONSTRAINT "working_documents_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_documents" ADD CONSTRAINT "working_documents_creator_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_document_registrar', 'company_project_access') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_document_registrar', 'company_project_access')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
--> statement-breakpoint
CREATE FUNCTION reject_document_history_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Working Document registration history is append-only'; END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER document_registration_events_immutable BEFORE UPDATE OR DELETE ON document_registration_events FOR EACH ROW EXECUTE FUNCTION reject_document_history_mutation();
