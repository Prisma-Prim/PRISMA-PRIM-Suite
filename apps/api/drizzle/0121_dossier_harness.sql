CREATE TABLE "dossier_harness_authorizations" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"encrypted" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dossier_harness_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"output" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dossier_harness_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"identity_key" text NOT NULL,
	"label" text NOT NULL,
	"encrypted" text,
	"epoch" integer NOT NULL,
	"auth_revision" integer DEFAULT 0 NOT NULL,
	"refresh_lease" uuid,
	"refresh_until" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dossier_harness_connection_epoch_check" CHECK ("dossier_harness_connections"."epoch" > 0)
);
--> statement-breakpoint
CREATE TABLE "dossier_harness_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"snapshot_hash" text NOT NULL,
	"connection_id" uuid NOT NULL,
	"connection_epoch" integer NOT NULL,
	"connection_identity_key" text NOT NULL,
	"model" text NOT NULL,
	"language" text NOT NULL,
	"pipeline_version" text NOT NULL,
	"state" text NOT NULL,
	"next_batch" integer NOT NULL,
	"total_batches" integer NOT NULL,
	"cache_hits" integer NOT NULL,
	"checkpoint" jsonb NOT NULL,
	"lease" uuid,
	"lease_until" timestamp with time zone,
	"command_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dossier_harness_job_progress_check" CHECK ("dossier_harness_jobs"."next_batch" >= 0 AND "dossier_harness_jobs"."total_batches" >= "dossier_harness_jobs"."next_batch" AND "dossier_harness_jobs"."cache_hits" >= 0 AND "dossier_harness_jobs"."connection_epoch" > 0),
	CONSTRAINT "dossier_harness_job_state_check" CHECK ("dossier_harness_jobs"."state" IN ('queued','running','pausing','paused','quota','reauth','failed','uncertain','completed','cancelled') AND (("dossier_harness_jobs"."state" IN ('running','pausing') AND "dossier_harness_jobs"."lease" IS NOT NULL AND "dossier_harness_jobs"."lease_until" IS NOT NULL) OR ("dossier_harness_jobs"."state" NOT IN ('running','pausing') AND "dossier_harness_jobs"."lease" IS NULL AND "dossier_harness_jobs"."lease_until" IS NULL)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dossier_harness_connection_actor_unique" ON "dossier_harness_connections" USING btree ("workspace_id","company_id","actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dossier_harness_connection_scope_unique" ON "dossier_harness_connections" USING btree ("workspace_id","company_id","actor_id","id");--> statement-breakpoint
ALTER TABLE "dossier_harness_authorizations" ADD CONSTRAINT "dossier_harness_authorizations_workspace_id_company_id_project_id_projects_workspace_id_company_id_id_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_harness_authorizations" ADD CONSTRAINT "dossier_harness_authorizations_workspace_id_actor_id_workspace_memberships_workspace_id_id_fk" FOREIGN KEY ("workspace_id","actor_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_harness_cache" ADD CONSTRAINT "dossier_harness_cache_workspace_id_company_id_project_id_projects_workspace_id_company_id_id_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_harness_cache" ADD CONSTRAINT "dossier_harness_cache_workspace_id_actor_id_workspace_memberships_workspace_id_id_fk" FOREIGN KEY ("workspace_id","actor_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_harness_connections" ADD CONSTRAINT "dossier_harness_connections_workspace_id_actor_id_workspace_memberships_workspace_id_id_fk" FOREIGN KEY ("workspace_id","actor_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_harness_jobs" ADD CONSTRAINT "dossier_harness_jobs_workspace_id_company_id_project_id_run_id_dossier_analysis_runs_workspace_id_company_id_project_id_id_fk" FOREIGN KEY ("workspace_id","company_id","project_id","run_id") REFERENCES "public"."dossier_analysis_runs"("workspace_id","company_id","project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_harness_jobs" ADD CONSTRAINT "dossier_harness_jobs_workspace_id_company_id_actor_id_connection_id_dossier_harness_connections_workspace_id_company_id_actor_id_id_fk" FOREIGN KEY ("workspace_id","company_id","actor_id","connection_id") REFERENCES "public"."dossier_harness_connections"("workspace_id","company_id","actor_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dossier_harness_job_command_unique" ON "dossier_harness_jobs" USING btree ("workspace_id","company_id","actor_id","command_key");