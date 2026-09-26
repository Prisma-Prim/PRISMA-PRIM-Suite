ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_opportunity_manager_assignment.granted' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_opportunity_manager_assignment.revoked' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_opportunity_manager';--> statement-breakpoint
CREATE TABLE "commercial_intake_responsible_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"expected_version" integer NOT NULL,
	"result_version" integer NOT NULL,
	"outcome" text NOT NULL,
	"responsible_workspace_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_intake_responsible_commands_outcome_check" CHECK ("commercial_intake_responsible_commands"."expected_version" >= 1 AND (
        ("commercial_intake_responsible_commands"."outcome" = 'updated'
          AND "commercial_intake_responsible_commands"."result_version" = ("commercial_intake_responsible_commands"."expected_version")::bigint + 1)
        OR
        ("commercial_intake_responsible_commands"."outcome" = 'unchanged'
          AND "commercial_intake_responsible_commands"."result_version" = "commercial_intake_responsible_commands"."expected_version")
      ))
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "commercial_intake_events" DROP CONSTRAINT "commercial_intake_events_action_metadata_check";--> statement-breakpoint
ALTER TABLE "commercial_intake_responsible_commands" ADD CONSTRAINT "commercial_intake_responsible_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_intake_responsible_commands" ADD CONSTRAINT "commercial_intake_responsible_commands_opportunity_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_intake_responsible_commands" ADD CONSTRAINT "commercial_intake_responsible_commands_responsible_fk" FOREIGN KEY ("workspace_id","responsible_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_responsible_commands_actor_key_unique" ON "commercial_intake_responsible_commands" USING btree ("workspace_id","company_id","actor_workspace_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_responsible_commands_version_unique" ON "commercial_intake_responsible_commands" USING btree ("workspace_id","opportunity_id","result_version") WHERE "commercial_intake_responsible_commands"."outcome" = 'updated';--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_events_responsible_version_unique" ON "commercial_intake_events" USING btree ("workspace_id","opportunity_id",("metadata" ->> 'opportunityVersion')) WHERE "commercial_intake_events"."action" = 'opportunity.responsible.changed';--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_document_registrar', 'company_commercial_intake', 'company_project_access') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_service_catalogue', 'company_pricing_configuration', 'company_commercial_activity_reader', 'company_opportunity_manager') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_commercial_activity_reader', 'company_opportunity_manager')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "commercial_intake_events" ADD CONSTRAINT "commercial_intake_events_action_metadata_check" CHECK ((
        ("commercial_intake_events"."action" = 'client_request.created'
          AND "commercial_intake_events"."metadata" = '{"requestVersion": 1}'::jsonb)
        OR
        ("commercial_intake_events"."action" = 'opportunity.created'
          AND "commercial_intake_events"."metadata" = '{"opportunityVersion": 1}'::jsonb)
        OR
        ("commercial_intake_events"."action" = 'opportunity.next_action.updated'
          AND jsonb_typeof("commercial_intake_events"."metadata" -> 'opportunityVersion') = 'number'
          AND "commercial_intake_events"."metadata" = jsonb_build_object('opportunityVersion', ("commercial_intake_events"."metadata" ->> 'opportunityVersion')::integer)
          AND ("commercial_intake_events"."metadata" ->> 'opportunityVersion')::integer >= 2)
        OR
        (("commercial_intake_events"."action" = 'opportunity.responsible.changed'
          AND jsonb_typeof("commercial_intake_events"."metadata" -> 'opportunityVersion') = 'number'
          AND jsonb_typeof("commercial_intake_events"."metadata" #> '{before,workspaceMembershipId}') = 'string'
          AND jsonb_typeof("commercial_intake_events"."metadata" #> '{before,displayLabel}') = 'string'
          AND jsonb_typeof("commercial_intake_events"."metadata" #> '{after,workspaceMembershipId}') = 'string'
          AND jsonb_typeof("commercial_intake_events"."metadata" #> '{after,displayLabel}') = 'string'
          AND "commercial_intake_events"."metadata" = jsonb_build_object(
            'opportunityVersion', ("commercial_intake_events"."metadata" ->> 'opportunityVersion')::integer,
            'before', jsonb_build_object(
              'workspaceMembershipId', "commercial_intake_events"."metadata" #>> '{before,workspaceMembershipId}',
              'displayLabel', "commercial_intake_events"."metadata" #>> '{before,displayLabel}'),
            'after', jsonb_build_object(
              'workspaceMembershipId', "commercial_intake_events"."metadata" #>> '{after,workspaceMembershipId}',
              'displayLabel', "commercial_intake_events"."metadata" #>> '{after,displayLabel}'))
          AND ("commercial_intake_events"."metadata" ->> 'opportunityVersion')::integer >= 2
          AND length(btrim("commercial_intake_events"."metadata" #>> '{before,displayLabel}')) > 0
          AND length(btrim("commercial_intake_events"."metadata" #>> '{after,displayLabel}')) > 0
          AND "commercial_intake_events"."metadata" #>> '{before,workspaceMembershipId}'
            <> "commercial_intake_events"."metadata" #>> '{after,workspaceMembershipId}') IS TRUE)
      ));