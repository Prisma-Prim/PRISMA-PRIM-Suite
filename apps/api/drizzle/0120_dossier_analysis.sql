CREATE TABLE "dossier_analysis_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"action" text NOT NULL,
	"target_id" uuid NOT NULL,
	"receipt" jsonb NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dossier_analysis_events_shape_check" CHECK ("dossier_analysis_events"."fingerprint" ~ '^[a-f0-9]{64}$' AND "dossier_analysis_events"."action" IN ('source.added','source.removed','run.created','suggestions.imported','suggestion.reviewed'))
);
--> statement-breakpoint
CREATE TABLE "dossier_analysis_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"decision" text NOT NULL,
	"replacement_value" text,
	"actor_display_name" text NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dossier_analysis_reviews_decision_check" CHECK ("dossier_analysis_reviews"."revision" > 0 AND (("dossier_analysis_reviews"."decision" IN ('confirm','reject') AND "dossier_analysis_reviews"."replacement_value" IS NULL) OR ("dossier_analysis_reviews"."decision" = 'correct' AND "dossier_analysis_reviews"."replacement_value" IS NOT NULL AND length(btrim("dossier_analysis_reviews"."replacement_value")) BETWEEN 1 AND 2000)))
);
--> statement-breakpoint
CREATE TABLE "dossier_analysis_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"snapshot_hash" text NOT NULL,
	"cursor_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"snapshot" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dossier_analysis_runs_hash_check" CHECK ("dossier_analysis_runs"."snapshot_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "dossier_analysis_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"representation_id" uuid,
	"case_id" uuid,
	"attachment_id" uuid,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"language" text NOT NULL,
	"sha256" text NOT NULL,
	"size" integer NOT NULL,
	"original" "bytea",
	"scan_engine" text,
	"scanned_at" timestamp with time zone,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "dossier_analysis_sources_identity_check" CHECK ("dossier_analysis_sources"."sha256" ~ '^[a-f0-9]{64}$' AND "dossier_analysis_sources"."size" BETWEEN 1 AND 5242880 AND length("dossier_analysis_sources"."file_name") BETWEEN 1 AND 120 AND "dossier_analysis_sources"."language" IN ('ro','ru','fr','en') AND (("dossier_analysis_sources"."case_id" IS NULL AND "dossier_analysis_sources"."attachment_id" IS NULL) OR ("dossier_analysis_sources"."case_id" IS NOT NULL AND "dossier_analysis_sources"."attachment_id" IS NOT NULL)) AND (("dossier_analysis_sources"."kind" = 'pdf' AND "dossier_analysis_sources"."representation_id" IS NOT NULL AND "dossier_analysis_sources"."original" IS NULL AND "dossier_analysis_sources"."scan_engine" IS NULL AND "dossier_analysis_sources"."scanned_at" IS NULL) OR ("dossier_analysis_sources"."kind" = 'docx' AND "dossier_analysis_sources"."representation_id" IS NULL AND "dossier_analysis_sources"."original" IS NOT NULL AND octet_length("dossier_analysis_sources"."original") = "dossier_analysis_sources"."size" AND "dossier_analysis_sources"."scan_engine" IS NOT NULL AND "dossier_analysis_sources"."scanned_at" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "dossier_analysis_suggestions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"proposal" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dossier_analysis_suggestions_revision_check" CHECK ("dossier_analysis_suggestions"."revision" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dossier_analysis_events_command_unique" ON "dossier_analysis_events" USING btree ("workspace_id","actor_membership_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "dossier_analysis_reviews_revision_unique" ON "dossier_analysis_reviews" USING btree ("workspace_id","company_id","project_id","suggestion_id","revision");
--> statement-breakpoint
CREATE UNIQUE INDEX "dossier_analysis_runs_scope_unique" ON "dossier_analysis_runs" USING btree ("workspace_id","company_id","project_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "dossier_analysis_sources_scope_unique" ON "dossier_analysis_sources" USING btree ("workspace_id","company_id","project_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "dossier_analysis_suggestions_scope_unique" ON "dossier_analysis_suggestions" USING btree ("workspace_id","company_id","project_id","id");
--> statement-breakpoint
ALTER TABLE "dossier_analysis_events" ADD CONSTRAINT "dossier_analysis_events_project_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dossier_analysis_events" ADD CONSTRAINT "dossier_analysis_events_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dossier_analysis_reviews" ADD CONSTRAINT "dossier_analysis_reviews_suggestion_fk" FOREIGN KEY ("workspace_id","company_id","project_id","suggestion_id") REFERENCES "public"."dossier_analysis_suggestions"("workspace_id","company_id","project_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dossier_analysis_reviews" ADD CONSTRAINT "dossier_analysis_reviews_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dossier_analysis_runs" ADD CONSTRAINT "dossier_analysis_runs_project_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dossier_analysis_runs" ADD CONSTRAINT "dossier_analysis_runs_actor_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dossier_analysis_sources" ADD CONSTRAINT "dossier_analysis_sources_project_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dossier_analysis_sources" ADD CONSTRAINT "dossier_analysis_sources_version_fk" FOREIGN KEY ("workspace_id","company_id","document_id","version_id") REFERENCES "public"."document_versions"("workspace_id","company_id","document_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dossier_analysis_sources" ADD CONSTRAINT "dossier_analysis_sources_pdf_fk" FOREIGN KEY ("workspace_id","company_id","document_id","version_id","representation_id") REFERENCES "public"."document_pdfs"("workspace_id","company_id","document_id","version_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dossier_analysis_sources" ADD CONSTRAINT "dossier_analysis_sources_attachment_fk" FOREIGN KEY ("workspace_id","company_id","case_id","attachment_id") REFERENCES "public"."certification_case_documents"("workspace_id","company_id","case_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dossier_analysis_sources" ADD CONSTRAINT "dossier_analysis_sources_actor_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dossier_analysis_suggestions" ADD CONSTRAINT "dossier_analysis_suggestions_run_fk" FOREIGN KEY ("workspace_id","company_id","project_id","run_id") REFERENCES "public"."dossier_analysis_runs"("workspace_id","company_id","project_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dossier_analysis_suggestions" ADD CONSTRAINT "dossier_analysis_suggestions_actor_fk" FOREIGN KEY ("workspace_id","created_by_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION dossier_analysis_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Dossier Analysis history is immutable.' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER dossier_analysis_event_immutable BEFORE UPDATE OR DELETE ON dossier_analysis_events FOR EACH ROW EXECUTE FUNCTION dossier_analysis_history_immutable();
--> statement-breakpoint
CREATE TRIGGER dossier_analysis_review_immutable BEFORE UPDATE OR DELETE ON dossier_analysis_reviews FOR EACH ROW EXECUTE FUNCTION dossier_analysis_history_immutable();
--> statement-breakpoint
CREATE TRIGGER dossier_analysis_run_immutable BEFORE UPDATE OR DELETE ON dossier_analysis_runs FOR EACH ROW EXECUTE FUNCTION dossier_analysis_history_immutable();
--> statement-breakpoint
CREATE FUNCTION dossier_analysis_source_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Dossier Analysis sources are conserved.' USING ERRCODE = '23514';
  END IF;
  IF OLD.removed_at IS NOT NULL OR NEW.removed_at IS NULL
     OR NEW.removed_at < OLD.created_at
     OR (to_jsonb(NEW) - 'removed_at') IS DISTINCT FROM (to_jsonb(OLD) - 'removed_at') THEN
    RAISE EXCEPTION 'Only the first source retirement is permitted.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER dossier_analysis_source_immutable BEFORE UPDATE OR DELETE ON dossier_analysis_sources FOR EACH ROW EXECUTE FUNCTION dossier_analysis_source_immutable();
--> statement-breakpoint
CREATE FUNCTION dossier_analysis_suggestion_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Dossier Analysis suggestions are conserved.' USING ERRCODE = '23514';
  END IF;
  IF NEW.revision <> OLD.revision + 1
     OR (to_jsonb(NEW) - 'revision') IS DISTINCT FROM (to_jsonb(OLD) - 'revision') THEN
    RAISE EXCEPTION 'Only the next suggestion review revision is permitted.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER dossier_analysis_suggestion_immutable BEFORE UPDATE OR DELETE ON dossier_analysis_suggestions FOR EACH ROW EXECUTE FUNCTION dossier_analysis_suggestion_immutable();
