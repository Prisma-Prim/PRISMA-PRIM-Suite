CREATE TABLE "commercial_intake_outcome_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"expected_version" integer NOT NULL,
	"result_version" integer NOT NULL,
	"previous_status" text NOT NULL,
	"new_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_intake_outcome_commands_version_check" CHECK ("commercial_intake_outcome_commands"."expected_version" >= 1 AND "commercial_intake_outcome_commands"."result_version" = ("commercial_intake_outcome_commands"."expected_version")::bigint + 1),
	CONSTRAINT "commercial_intake_outcome_commands_transition_check" CHECK ((
        ("commercial_intake_outcome_commands"."previous_status" = 'OPEN' AND "commercial_intake_outcome_commands"."new_status" IN ('ON_HOLD', 'WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED'))
        OR ("commercial_intake_outcome_commands"."previous_status" = 'ON_HOLD' AND "commercial_intake_outcome_commands"."new_status" IN ('OPEN', 'WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED'))
        OR ("commercial_intake_outcome_commands"."previous_status" IN ('WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED') AND "commercial_intake_outcome_commands"."new_status" = 'OPEN')
      ))
);
--> statement-breakpoint
CREATE TABLE "opportunity_outcome_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"opportunity_version" integer NOT NULL,
	"previous_status" text NOT NULL,
	"new_status" text NOT NULL,
	"loss_reason_code" text,
	"reason" text,
	"note" text,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"actor_display_label" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_outcome_history_version_unique" UNIQUE("workspace_id","opportunity_id","opportunity_version"),
	CONSTRAINT "opportunity_outcome_history_version_check" CHECK ("opportunity_outcome_history"."opportunity_version" >= 2),
	CONSTRAINT "opportunity_outcome_history_transition_check" CHECK ((
        ("opportunity_outcome_history"."previous_status" = 'OPEN' AND "opportunity_outcome_history"."new_status" IN ('ON_HOLD', 'WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED'))
        OR ("opportunity_outcome_history"."previous_status" = 'ON_HOLD' AND "opportunity_outcome_history"."new_status" IN ('OPEN', 'WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED'))
        OR ("opportunity_outcome_history"."previous_status" IN ('WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED') AND "opportunity_outcome_history"."new_status" = 'OPEN')
      )),
	CONSTRAINT "opportunity_outcome_history_input_check" CHECK ((
        ("opportunity_outcome_history"."new_status" = 'LOST'
          AND "opportunity_outcome_history"."loss_reason_code" IS NOT NULL
          AND "opportunity_outcome_history"."reason" IS NULL
          AND ("opportunity_outcome_history"."loss_reason_code" <> 'OTHER' OR "opportunity_outcome_history"."note" IS NOT NULL))
        OR
        (("opportunity_outcome_history"."new_status" IN ('ON_HOLD', 'DISQUALIFIED', 'ARCHIVED')
            OR ("opportunity_outcome_history"."new_status" = 'OPEN' AND "opportunity_outcome_history"."previous_status" <> 'ON_HOLD'))
          AND "opportunity_outcome_history"."loss_reason_code" IS NULL
          AND "opportunity_outcome_history"."note" IS NULL
          AND "opportunity_outcome_history"."reason" IS NOT NULL)
        OR
        (("opportunity_outcome_history"."new_status" = 'WON'
            OR ("opportunity_outcome_history"."new_status" = 'OPEN' AND "opportunity_outcome_history"."previous_status" = 'ON_HOLD'))
          AND "opportunity_outcome_history"."loss_reason_code" IS NULL
          AND "opportunity_outcome_history"."note" IS NULL
          AND "opportunity_outcome_history"."reason" IS NULL)
      )
      AND ("opportunity_outcome_history"."reason" IS NULL OR (length("opportunity_outcome_history"."reason") BETWEEN 1 AND 500 AND length(btrim("opportunity_outcome_history"."reason")) > 0))
      AND ("opportunity_outcome_history"."note" IS NULL OR (length("opportunity_outcome_history"."note") BETWEEN 1 AND 500 AND length(btrim("opportunity_outcome_history"."note")) > 0))),
	CONSTRAINT "opportunity_outcome_history_loss_reason_check" CHECK ("opportunity_outcome_history"."loss_reason_code" IS NULL OR "opportunity_outcome_history"."loss_reason_code" IN ('PRICE', 'DEADLINE', 'COMPETITOR', 'NO_BUDGET', 'POSTPONED', 'CLIENT_WITHDREW', 'OTHER', 'UNKNOWN')),
	CONSTRAINT "opportunity_outcome_history_actor_label_check" CHECK (length(btrim("opportunity_outcome_history"."actor_display_label")) > 0)
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "commercial_intake_events" DROP CONSTRAINT "commercial_intake_events_action_metadata_check";--> statement-breakpoint
ALTER TABLE "opportunities" DROP CONSTRAINT "opportunities_status_check";--> statement-breakpoint
ALTER TABLE "commercial_intake_outcome_commands" ADD CONSTRAINT "commercial_intake_outcome_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_intake_outcome_commands" ADD CONSTRAINT "commercial_intake_outcome_commands_opportunity_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_intake_outcome_commands" ADD CONSTRAINT "commercial_intake_outcome_commands_history_fk" FOREIGN KEY ("workspace_id","opportunity_id","result_version") REFERENCES "public"."opportunity_outcome_history"("workspace_id","opportunity_id","opportunity_version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_outcome_history" ADD CONSTRAINT "opportunity_outcome_history_opportunity_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_outcome_history" ADD CONSTRAINT "opportunity_outcome_history_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_outcome_commands_actor_key_unique" ON "commercial_intake_outcome_commands" USING btree ("workspace_id","company_id","actor_workspace_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_outcome_commands_version_unique" ON "commercial_intake_outcome_commands" USING btree ("workspace_id","opportunity_id","result_version");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_events_outcome_version_unique" ON "commercial_intake_events" USING btree ("workspace_id","opportunity_id",("metadata" ->> 'opportunityVersion')) WHERE "commercial_intake_events"."action" = 'opportunity.outcome.changed';--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text = 'company_opportunity_manager' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director')
          AND "company_role_assignments"."permission_set_version" IS NULL)
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
        OR
        (("commercial_intake_events"."action" = 'opportunity.outcome.changed'
          AND jsonb_typeof("commercial_intake_events"."metadata" -> 'opportunityVersion') = 'number'
          AND ("commercial_intake_events"."metadata" ->> 'opportunityVersion')::integer >= 2
          AND (
            ("commercial_intake_events"."metadata" ->> 'previousStatus' = 'OPEN'
              AND "commercial_intake_events"."metadata" ->> 'newStatus' IN ('ON_HOLD', 'WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED'))
            OR ("commercial_intake_events"."metadata" ->> 'previousStatus' = 'ON_HOLD'
              AND "commercial_intake_events"."metadata" ->> 'newStatus' IN ('OPEN', 'WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED'))
            OR ("commercial_intake_events"."metadata" ->> 'previousStatus' IN ('WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED')
              AND "commercial_intake_events"."metadata" ->> 'newStatus' = 'OPEN'))
          AND (
            ("commercial_intake_events"."metadata" ->> 'newStatus' = 'LOST'
              AND "commercial_intake_events"."metadata" ->> 'lossReasonCode' IN ('PRICE', 'DEADLINE', 'COMPETITOR', 'NO_BUDGET', 'POSTPONED', 'CLIENT_WITHDREW', 'OTHER', 'UNKNOWN')
              AND "commercial_intake_events"."metadata" = jsonb_build_object(
                'opportunityVersion', ("commercial_intake_events"."metadata" ->> 'opportunityVersion')::integer,
                'previousStatus', "commercial_intake_events"."metadata" ->> 'previousStatus',
                'newStatus', 'LOST',
                'lossReasonCode', "commercial_intake_events"."metadata" ->> 'lossReasonCode'))
            OR
            ("commercial_intake_events"."metadata" ->> 'newStatus' <> 'LOST'
              AND "commercial_intake_events"."metadata" = jsonb_build_object(
                'opportunityVersion', ("commercial_intake_events"."metadata" ->> 'opportunityVersion')::integer,
                'previousStatus', "commercial_intake_events"."metadata" ->> 'previousStatus',
                'newStatus', "commercial_intake_events"."metadata" ->> 'newStatus')))) IS TRUE)
      ));--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_status_check" CHECK ("opportunities"."status" IN ('OPEN', 'ON_HOLD', 'WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED'));