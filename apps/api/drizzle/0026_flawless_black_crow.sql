ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_commercial_intake_assignment.granted' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_commercial_intake_assignment.revoked' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_commercial_intake';--> statement-breakpoint
CREATE TABLE "client_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"client_account_id" uuid,
	"original_text" text NOT NULL,
	"source_kind" text DEFAULT 'MANUAL_TEXT' NOT NULL,
	"source_label" text,
	"reported_received_at" timestamp with time zone,
	"subject" text,
	"captured_by_internal_user_id" uuid NOT NULL,
	"captured_by_workspace_membership_id" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "client_requests_original_text_check" CHECK (length("client_requests"."original_text") BETWEEN 1 AND 20000 AND length(btrim("client_requests"."original_text")) > 0),
	CONSTRAINT "client_requests_source_label_check" CHECK ("client_requests"."source_label" IS NULL OR length("client_requests"."source_label") <= 120),
	CONSTRAINT "client_requests_subject_check" CHECK ("client_requests"."subject" IS NULL OR length("client_requests"."subject") <= 200),
	CONSTRAINT "client_requests_source_kind_check" CHECK ("client_requests"."source_kind" = 'MANUAL_TEXT'),
	CONSTRAINT "client_requests_version_check" CHECK ("client_requests"."version" = 1)
);
--> statement-breakpoint
CREATE TABLE "commercial_intake_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"result_client_request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_intake_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"action" text NOT NULL,
	"client_request_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "commercial_intake_events_action_metadata_check" CHECK ((
        ("commercial_intake_events"."action" = 'client_request.created'
          AND "commercial_intake_events"."metadata" = '{"requestVersion": 1}'::jsonb)
        OR
        ("commercial_intake_events"."action" = 'opportunity.created'
          AND "commercial_intake_events"."metadata" = '{"opportunityVersion": 1}'::jsonb)
      ))
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"initial" boolean DEFAULT true NOT NULL,
	"title" text NOT NULL,
	"scope" text,
	"next_action" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"responsible_internal_user_id" uuid NOT NULL,
	"responsible_workspace_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "opportunities_title_check" CHECK (length("opportunities"."title") BETWEEN 1 AND 160 AND length(btrim("opportunities"."title")) > 0),
	CONSTRAINT "opportunities_scope_check" CHECK ("opportunities"."scope" IS NULL OR length("opportunities"."scope") <= 2000),
	CONSTRAINT "opportunities_next_action_check" CHECK (length("opportunities"."next_action") BETWEEN 1 AND 500 AND length(btrim("opportunities"."next_action")) > 0),
	CONSTRAINT "opportunities_status_check" CHECK ("opportunities"."status" = 'OPEN'),
	CONSTRAINT "opportunities_version_check" CHECK ("opportunities"."version" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "client_requests_workspace_id_id_unique" ON "client_requests" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_requests_scope_id_unique" ON "client_requests" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE INDEX "client_requests_company_newest_index" ON "client_requests" USING btree ("workspace_id","company_id","captured_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_workspace_id_id_unique" ON "opportunities" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_scope_id_unique" ON "opportunities" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_request_identity_unique" ON "opportunities" USING btree ("workspace_id","company_id","client_request_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_initial_request_unique" ON "opportunities" USING btree ("workspace_id","company_id","client_request_id") WHERE "opportunities"."initial" = true;--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_client_fk" FOREIGN KEY ("workspace_id","client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_creator_fk" FOREIGN KEY ("workspace_id","captured_by_workspace_membership_id","captured_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_intake_commands" ADD CONSTRAINT "commercial_intake_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_intake_commands" ADD CONSTRAINT "commercial_intake_commands_result_fk" FOREIGN KEY ("workspace_id","company_id","result_client_request_id") REFERENCES "public"."client_requests"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_intake_events" ADD CONSTRAINT "commercial_intake_events_request_fk" FOREIGN KEY ("workspace_id","company_id","client_request_id") REFERENCES "public"."client_requests"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_intake_events" ADD CONSTRAINT "commercial_intake_events_opportunity_fk" FOREIGN KEY ("workspace_id","company_id","client_request_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","client_request_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_intake_events" ADD CONSTRAINT "commercial_intake_events_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_request_fk" FOREIGN KEY ("workspace_id","company_id","client_request_id") REFERENCES "public"."client_requests"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_responsible_fk" FOREIGN KEY ("workspace_id","responsible_workspace_membership_id","responsible_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_commands_actor_key_unique" ON "commercial_intake_commands" USING btree ("workspace_id","company_id","actor_workspace_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_events_request_created_unique" ON "commercial_intake_events" USING btree ("workspace_id","client_request_id") WHERE "commercial_intake_events"."action" = 'client_request.created';--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_events_opportunity_created_unique" ON "commercial_intake_events" USING btree ("workspace_id","opportunity_id") WHERE "commercial_intake_events"."action" = 'opportunity.created';--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_document_registrar' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_project_access', 'company_commercial_intake') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_project_access', 'company_commercial_intake')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
