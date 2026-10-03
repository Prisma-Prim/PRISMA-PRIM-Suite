CREATE TABLE "commercial_intake_client_association_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"client_request_id" uuid NOT NULL,
	"client_account_id" uuid NOT NULL,
	"expected_version" integer NOT NULL,
	"result_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_intake_client_association_commands_version_check" CHECK ("commercial_intake_client_association_commands"."expected_version" = 1 AND "commercial_intake_client_association_commands"."result_version" = 2)
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "client_requests" DROP CONSTRAINT "client_requests_version_check";--> statement-breakpoint
ALTER TABLE "commercial_intake_events" DROP CONSTRAINT "commercial_intake_events_action_metadata_check";--> statement-breakpoint
ALTER TABLE "commercial_intake_client_association_commands" ADD CONSTRAINT "commercial_intake_client_association_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_intake_client_association_commands" ADD CONSTRAINT "commercial_intake_client_association_commands_request_fk" FOREIGN KEY ("workspace_id","company_id","client_request_id") REFERENCES "public"."client_requests"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_intake_client_association_commands" ADD CONSTRAINT "commercial_intake_client_association_commands_client_fk" FOREIGN KEY ("workspace_id","client_account_id") REFERENCES "public"."client_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_client_association_commands_actor_key_unique" ON "commercial_intake_client_association_commands" USING btree ("workspace_id","company_id","actor_workspace_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_client_association_commands_request_unique" ON "commercial_intake_client_association_commands" USING btree ("workspace_id","company_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_events_client_associated_unique" ON "commercial_intake_events" USING btree ("workspace_id","client_request_id") WHERE "commercial_intake_events"."action" = 'client_request.client_associated';--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_document_registrar' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_commercial_intake' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_project_access' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_version_check" CHECK ((
        "client_requests"."version" = 1
        OR ("client_requests"."version" = 2 AND "client_requests"."client_account_id" IS NOT NULL)
      ));--> statement-breakpoint
ALTER TABLE "commercial_intake_events" ADD CONSTRAINT "commercial_intake_events_action_metadata_check" CHECK ((
        ("commercial_intake_events"."action" = 'client_request.created'
          AND "commercial_intake_events"."metadata" = '{"requestVersion": 1}'::jsonb)
        OR
        ("commercial_intake_events"."action" = 'client_request.client_associated'
          AND "commercial_intake_events"."metadata" = '{"requestVersion": 2}'::jsonb)
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