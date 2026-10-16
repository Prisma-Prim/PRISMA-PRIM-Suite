ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_document_content_reader_assignment.granted' BEFORE 'company_project_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_document_content_reader_assignment.revoked' BEFORE 'company_project_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_document_content_uploader_assignment.granted' BEFORE 'company_project_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_document_content_uploader_assignment.revoked' BEFORE 'company_project_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_document_content_reader';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_document_content_uploader';--> statement-breakpoint
CREATE TABLE "document_pdfs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"upload_revision" integer NOT NULL,
	"content" "bytea" NOT NULL,
	"file_name" text NOT NULL,
	"media_type" text DEFAULT 'application/pdf' NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"scan_outcome" text DEFAULT 'clean' NOT NULL,
	"scan_engine" text NOT NULL,
	"scanned_at" timestamp with time zone NOT NULL,
	"stored_by_membership_id" uuid NOT NULL,
	"stored_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_pdfs_content_check" CHECK ("document_pdfs"."upload_revision" >= 2 AND "document_pdfs"."size" BETWEEN 1 AND 5242880 AND octet_length("document_pdfs"."content") = "document_pdfs"."size" AND "document_pdfs"."sha256" ~ '^[a-f0-9]{64}$' AND "document_pdfs"."media_type" = 'application/pdf' AND "document_pdfs"."scan_outcome" = 'clean' AND length("document_pdfs"."scan_engine") BETWEEN 1 AND 200 AND length("document_pdfs"."file_name") BETWEEN 1 AND 120)
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "document_pdfs" ADD CONSTRAINT "document_pdfs_version_fk" FOREIGN KEY ("workspace_id","company_id","document_id","version_id") REFERENCES "public"."document_versions"("workspace_id","company_id","document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_pdfs" ADD CONSTRAINT "document_pdfs_actor_fk" FOREIGN KEY ("workspace_id","stored_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_pdfs_revision_unique" ON "document_pdfs" USING btree ("workspace_id","company_id","document_id","upload_revision");--> statement-breakpoint
CREATE INDEX "document_pdfs_version_order" ON "document_pdfs" USING btree ("workspace_id","company_id","version_id","upload_revision" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_document_registrar' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_commercial_intake' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3', 'v4'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_project_access' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_opportunity_manager' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
--> statement-breakpoint
-- Every preserved upload is append-only, including superseded draft uploads.
-- Lock the Document before its Version, matching the public command order.
CREATE FUNCTION guard_document_pdf_preservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  document_revision integer;
  version_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Preserved Document PDF content is immutable' USING ERRCODE = '23514';
  END IF;
  SELECT working_revision INTO document_revision FROM working_documents
    WHERE workspace_id = NEW.workspace_id AND company_id = NEW.company_id
      AND id = NEW.document_id FOR UPDATE;
  SELECT status INTO version_status FROM document_versions
    WHERE workspace_id = NEW.workspace_id AND company_id = NEW.company_id
      AND document_id = NEW.document_id AND id = NEW.version_id FOR SHARE;
  -- Missing identities remain the composite foreign keys' responsibility.
  IF FOUND AND version_status <> 'draft' THEN
    RAISE EXCEPTION 'PDF content can only be preserved in a draft Version' USING ERRCODE = '23514';
  END IF;
  IF document_revision IS NOT NULL AND NEW.upload_revision::bigint <> document_revision::bigint + 1 THEN
    RAISE EXCEPTION 'PDF upload must produce the next Document revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER document_pdfs_preservation_guard
  BEFORE INSERT OR UPDATE OR DELETE ON document_pdfs
  FOR EACH ROW EXECUTE FUNCTION guard_document_pdf_preservation();
