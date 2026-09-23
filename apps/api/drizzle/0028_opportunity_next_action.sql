CREATE TABLE "commercial_intake_next_action_commands" (
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
	"next_action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_intake_next_action_commands_outcome_check" CHECK ("commercial_intake_next_action_commands"."expected_version" >= 1 AND (
        ("commercial_intake_next_action_commands"."outcome" = 'updated'
          AND "commercial_intake_next_action_commands"."result_version" = ("commercial_intake_next_action_commands"."expected_version")::bigint + 1)
        OR
        ("commercial_intake_next_action_commands"."outcome" = 'unchanged'
          AND "commercial_intake_next_action_commands"."result_version" = "commercial_intake_next_action_commands"."expected_version")
      )),
	CONSTRAINT "commercial_intake_next_action_commands_next_action_check" CHECK (length("commercial_intake_next_action_commands"."next_action") BETWEEN 1 AND 500 AND length(btrim("commercial_intake_next_action_commands"."next_action")) > 0)
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "commercial_intake_events" DROP CONSTRAINT "commercial_intake_events_action_metadata_check";--> statement-breakpoint
ALTER TABLE "opportunities" DROP CONSTRAINT "opportunities_version_check";--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "last_updated_by_internal_user_id" uuid;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "last_updated_by_workspace_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "last_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commercial_intake_next_action_commands" ADD CONSTRAINT "commercial_intake_next_action_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_intake_next_action_commands" ADD CONSTRAINT "commercial_intake_next_action_commands_opportunity_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_next_action_commands_actor_key_unique" ON "commercial_intake_next_action_commands" USING btree ("workspace_id","company_id","actor_workspace_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_next_action_commands_version_unique" ON "commercial_intake_next_action_commands" USING btree ("workspace_id","opportunity_id","result_version") WHERE "commercial_intake_next_action_commands"."outcome" = 'updated';--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_last_updated_by_fk" FOREIGN KEY ("workspace_id","last_updated_by_workspace_membership_id","last_updated_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_events_next_action_version_unique" ON "commercial_intake_events" USING btree ("workspace_id","opportunity_id",("metadata" ->> 'opportunityVersion')) WHERE "commercial_intake_events"."action" = 'opportunity.next_action.updated';--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_document_registrar', 'company_commercial_intake') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_project_access', 'company_commercial_activity_reader') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_project_access', 'company_commercial_intake', 'company_commercial_activity_reader')
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
      ));--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_last_update_check" CHECK ((
        ("opportunities"."version" = 1
          AND "opportunities"."last_updated_by_internal_user_id" IS NULL
          AND "opportunities"."last_updated_by_workspace_membership_id" IS NULL
          AND "opportunities"."last_updated_at" IS NULL)
        OR
        ("opportunities"."version" >= 2
          AND "opportunities"."last_updated_by_internal_user_id" IS NOT NULL
          AND "opportunities"."last_updated_by_workspace_membership_id" IS NOT NULL
          AND "opportunities"."last_updated_at" IS NOT NULL)
      ));--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_version_check" CHECK ("opportunities"."version" >= 1);