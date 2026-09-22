ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_service_catalogue_assignment.granted' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_service_catalogue_assignment.revoked' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_service_catalogue';--> statement-breakpoint
CREATE TABLE "commercial_catalogue_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"command" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"outcome" text NOT NULL,
	"result_service_definition_id" uuid,
	"result_offering_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_catalogue_commands_result_shape_check" CHECK ((
        ("commercial_catalogue_commands"."command" = 'service_definition.create'
          AND "commercial_catalogue_commands"."result_service_definition_id" IS NOT NULL
          AND "commercial_catalogue_commands"."result_offering_id" IS NULL)
        OR
        ("commercial_catalogue_commands"."command" = 'company_service_offering.create'
          AND "commercial_catalogue_commands"."result_service_definition_id" IS NULL
          AND "commercial_catalogue_commands"."result_offering_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "commercial_catalogue_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"action" text NOT NULL,
	"service_definition_id" uuid NOT NULL,
	"offering_id" uuid,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "commercial_catalogue_events_action_metadata_check" CHECK ((
        ("commercial_catalogue_events"."action" = 'service_definition.created'
          AND "commercial_catalogue_events"."offering_id" IS NULL
          AND "commercial_catalogue_events"."metadata" - 'serviceDefinitionId' - 'code' - 'provenance' = '{}'::jsonb
          AND "commercial_catalogue_events"."metadata" ->> 'serviceDefinitionId' = "commercial_catalogue_events"."service_definition_id"::text
          AND "commercial_catalogue_events"."metadata" ->> 'provenance' = 'ILLUSTRATIVE')
        OR
        ("commercial_catalogue_events"."action" = 'company_service_offering.created'
          AND "commercial_catalogue_events"."offering_id" IS NOT NULL
          AND "commercial_catalogue_events"."metadata" - 'serviceDefinitionId' - 'offeringId' - 'code' - 'provenance' = '{}'::jsonb
          AND "commercial_catalogue_events"."metadata" ->> 'serviceDefinitionId' = "commercial_catalogue_events"."service_definition_id"::text
          AND "commercial_catalogue_events"."metadata" ->> 'offeringId' = "commercial_catalogue_events"."offering_id"::text
          AND "commercial_catalogue_events"."metadata" ->> 'provenance' = 'ILLUSTRATIVE')
      ))
);
--> statement-breakpoint
CREATE TABLE "company_service_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"service_definition_id" uuid NOT NULL,
	"commercial_label" text,
	"availability" text DEFAULT 'AVAILABLE' NOT NULL,
	"provenance" text DEFAULT 'ILLUSTRATIVE' NOT NULL,
	"created_by_internal_user_id" uuid NOT NULL,
	"created_by_workspace_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_service_offerings_label_check" CHECK ("company_service_offerings"."commercial_label" IS NULL OR length("company_service_offerings"."commercial_label") <= 160),
	CONSTRAINT "company_service_offerings_availability_check" CHECK ("company_service_offerings"."availability" = 'AVAILABLE'),
	CONSTRAINT "company_service_offerings_provenance_check" CHECK ("company_service_offerings"."provenance" = 'ILLUSTRATIVE')
);
--> statement-breakpoint
CREATE TABLE "service_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"provenance" text DEFAULT 'ILLUSTRATIVE' NOT NULL,
	"created_by_internal_user_id" uuid NOT NULL,
	"created_by_workspace_membership_id" uuid NOT NULL,
	"created_in_company_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_definitions_code_check" CHECK ("service_definitions"."code" ~ '^[A-Z0-9_-]{1,40}$'),
	CONSTRAINT "service_definitions_name_check" CHECK (length("service_definitions"."name") BETWEEN 1 AND 160 AND length(btrim("service_definitions"."name")) > 0),
	CONSTRAINT "service_definitions_description_check" CHECK ("service_definitions"."description" IS NULL OR length("service_definitions"."description") <= 2000),
	CONSTRAINT "service_definitions_provenance_check" CHECK ("service_definitions"."provenance" = 'ILLUSTRATIVE')
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
CREATE UNIQUE INDEX "company_service_offerings_scope_id_unique" ON "company_service_offerings" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_definitions_workspace_id_id_unique" ON "service_definitions" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "commercial_catalogue_commands" ADD CONSTRAINT "commercial_catalogue_commands_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_catalogue_commands" ADD CONSTRAINT "commercial_catalogue_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_catalogue_commands" ADD CONSTRAINT "commercial_catalogue_commands_definition_fk" FOREIGN KEY ("workspace_id","result_service_definition_id") REFERENCES "public"."service_definitions"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_catalogue_commands" ADD CONSTRAINT "commercial_catalogue_commands_offering_fk" FOREIGN KEY ("workspace_id","company_id","result_offering_id") REFERENCES "public"."company_service_offerings"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_catalogue_events" ADD CONSTRAINT "commercial_catalogue_events_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_catalogue_events" ADD CONSTRAINT "commercial_catalogue_events_definition_fk" FOREIGN KEY ("workspace_id","service_definition_id") REFERENCES "public"."service_definitions"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_catalogue_events" ADD CONSTRAINT "commercial_catalogue_events_offering_fk" FOREIGN KEY ("workspace_id","company_id","offering_id") REFERENCES "public"."company_service_offerings"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_catalogue_events" ADD CONSTRAINT "commercial_catalogue_events_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_service_offerings" ADD CONSTRAINT "company_service_offerings_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_service_offerings" ADD CONSTRAINT "company_service_offerings_definition_fk" FOREIGN KEY ("workspace_id","service_definition_id") REFERENCES "public"."service_definitions"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_service_offerings" ADD CONSTRAINT "company_service_offerings_creator_fk" FOREIGN KEY ("workspace_id","created_by_workspace_membership_id","created_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_definitions" ADD CONSTRAINT "service_definitions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_definitions" ADD CONSTRAINT "service_definitions_creator_fk" FOREIGN KEY ("workspace_id","created_by_workspace_membership_id","created_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_definitions" ADD CONSTRAINT "service_definitions_created_in_company_fk" FOREIGN KEY ("workspace_id","created_in_company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_catalogue_commands_actor_key_unique" ON "commercial_catalogue_commands" USING btree ("workspace_id","company_id","actor_workspace_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_catalogue_events_definition_created_unique" ON "commercial_catalogue_events" USING btree ("workspace_id","service_definition_id") WHERE "commercial_catalogue_events"."action" = 'service_definition.created';--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_catalogue_events_offering_created_unique" ON "commercial_catalogue_events" USING btree ("workspace_id","offering_id") WHERE "commercial_catalogue_events"."action" = 'company_service_offering.created';--> statement-breakpoint
CREATE UNIQUE INDEX "company_service_offerings_definition_unique" ON "company_service_offerings" USING btree ("workspace_id","company_id","service_definition_id","provenance");--> statement-breakpoint
CREATE INDEX "company_service_offerings_company_newest_index" ON "company_service_offerings" USING btree ("workspace_id","company_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_definitions_workspace_code_unique" ON "service_definitions" USING btree ("workspace_id","code");--> statement-breakpoint
CREATE INDEX "service_definitions_workspace_newest_index" ON "service_definitions" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_document_registrar' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));