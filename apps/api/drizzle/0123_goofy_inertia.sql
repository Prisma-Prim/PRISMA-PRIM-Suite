CREATE TABLE "dossier_intake_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"phase" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dossier_intake_batches_state_check" CHECK (("dossier_intake_batches"."revision" > 0 AND "dossier_intake_batches"."phase" IN ('paused','active','stopped','completed') AND "dossier_intake_batches"."fingerprint" ~ '^[a-f0-9]{64}$' AND length("dossier_intake_batches"."idempotency_key") BETWEEN 1 AND 200 AND jsonb_typeof("dossier_intake_batches"."manifest") = 'object' AND "dossier_intake_batches"."manifest"->>'format' = 'DOCUMENT_INTAKE_STATE/1' AND jsonb_typeof("dossier_intake_batches"."manifest"->'items') = 'array' AND jsonb_array_length("dossier_intake_batches"."manifest"->'items') BETWEEN 1 AND 25 AND octet_length("dossier_intake_batches"."manifest"::text) <= 131072) IS TRUE)
);
--> statement-breakpoint
ALTER TABLE "working_documents" DROP CONSTRAINT "working_documents_state_check";--> statement-breakpoint
ALTER TABLE "dossier_intake_batches" ADD CONSTRAINT "dossier_intake_batches_project_fk" FOREIGN KEY ("workspace_id","company_id","client_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","client_account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_intake_batches" ADD CONSTRAINT "dossier_intake_batches_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dossier_intake_batches_actor_key_unique" ON "dossier_intake_batches" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "working_documents" ADD CONSTRAINT "working_documents_state_check" CHECK ("working_documents"."type" IN ('questionnaire', 'project-source', 'mission-deliverable', 'received-contract', 'external-invoice', 'payment-evidence', 'received-addendum', 'received-audit-source') AND "working_documents"."confidentiality" = 'company-confidential' AND length(trim("working_documents"."title")) BETWEEN 1 AND 200 AND length(trim("working_documents"."purpose")) BETWEEN 1 AND 2000);
--> statement-breakpoint
-- Project association and Knowledge source admission have different family
-- contracts. Keep Knowledge's existing closed allow-list unchanged.
CREATE FUNCTION guard_project_document_use() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM working_documents d WHERE d.workspace_id=NEW.workspace_id AND d.company_id=NEW.company_id AND d.id=NEW.document_id AND d.type IN ('questionnaire','project-source','mission-deliverable','received-contract')) THEN
  RAISE EXCEPTION 'This native source family is ineligible' USING ERRCODE='23514',CONSTRAINT='financial_document_use_forbidden';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER project_financial_document_forbidden ON document_project_events;
--> statement-breakpoint
CREATE TRIGGER project_financial_document_forbidden BEFORE INSERT OR UPDATE ON document_project_events FOR EACH ROW EXECUTE FUNCTION guard_project_document_use();
