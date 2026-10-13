ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_sales_stage_configuration_assignment.granted' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_sales_stage_configuration_assignment.revoked' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_sales_stage_configuration';--> statement-breakpoint
CREATE TABLE "sales_stage_configuration_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"operation" text NOT NULL,
	"sales_stage_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"expected_revision" integer NOT NULL,
	"result_revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_stage_configuration_commands_revision_check" CHECK ("sales_stage_configuration_commands"."expected_revision" >= 0 AND "sales_stage_configuration_commands"."result_revision" = ("sales_stage_configuration_commands"."expected_revision")::bigint + 1),
	CONSTRAINT "sales_stage_configuration_commands_operation_check" CHECK ("sales_stage_configuration_commands"."operation" = 'CREATED')
);
--> statement-breakpoint
CREATE TABLE "sales_stage_configurations" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_stage_configurations_pk" PRIMARY KEY("workspace_id","company_id"),
	CONSTRAINT "sales_stage_configurations_revision_check" CHECK ("sales_stage_configurations"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "sales_stage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"sales_stage_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "sales_stage_events_action_metadata_check" CHECK ((("sales_stage_events"."action" = 'sales_stage.configured'
        AND "sales_stage_events"."metadata" ->> 'operation' = 'CREATED'
        AND jsonb_typeof("sales_stage_events"."metadata" -> 'configurationRevision') = 'number'
        AND jsonb_typeof("sales_stage_events"."metadata" -> 'label') = 'string'
        AND "sales_stage_events"."metadata" = jsonb_build_object(
          'operation', 'CREATED',
          'configurationRevision', ("sales_stage_events"."metadata" ->> 'configurationRevision')::integer,
          'label', "sales_stage_events"."metadata" ->> 'label')
        AND ("sales_stage_events"."metadata" ->> 'configurationRevision')::integer >= 1
        AND length("sales_stage_events"."metadata" ->> 'label') BETWEEN 1 AND 80
        AND length(btrim("sales_stage_events"."metadata" ->> 'label')) > 0) IS TRUE))
);
--> statement-breakpoint
CREATE TABLE "sales_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by_internal_user_id" uuid NOT NULL,
	"created_by_workspace_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_stages_scope_id_unique" UNIQUE("workspace_id","company_id","id"),
	CONSTRAINT "sales_stages_position_unique" UNIQUE("workspace_id","company_id","position"),
	CONSTRAINT "sales_stages_label_check" CHECK (length("sales_stages"."label") BETWEEN 1 AND 80 AND length(btrim("sales_stages"."label")) > 0),
	CONSTRAINT "sales_stages_position_check" CHECK ("sales_stages"."position" BETWEEN 1 AND 30),
	CONSTRAINT "sales_stages_state_check" CHECK ("sales_stages"."state" = 'ACTIVE')
);
--> statement-breakpoint
CREATE TABLE "commercial_intake_stage_commands" (
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
	"sales_stage_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_intake_stage_commands_outcome_check" CHECK ("commercial_intake_stage_commands"."expected_version" >= 1 AND (
        ("commercial_intake_stage_commands"."outcome" = 'updated'
          AND "commercial_intake_stage_commands"."result_version" = ("commercial_intake_stage_commands"."expected_version")::bigint + 1)
        OR
        ("commercial_intake_stage_commands"."outcome" = 'unchanged'
          AND "commercial_intake_stage_commands"."result_version" = "commercial_intake_stage_commands"."expected_version")
      ))
);
--> statement-breakpoint
CREATE TABLE "opportunity_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"opportunity_version" integer NOT NULL,
	"previous_sales_stage_id" uuid,
	"previous_label" text,
	"new_sales_stage_id" uuid,
	"new_label" text,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"actor_display_label" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_stage_history_version_unique" UNIQUE("workspace_id","opportunity_id","opportunity_version"),
	CONSTRAINT "opportunity_stage_history_version_check" CHECK ("opportunity_stage_history"."opportunity_version" >= 2),
	CONSTRAINT "opportunity_stage_history_stage_check" CHECK (("opportunity_stage_history"."previous_sales_stage_id" IS NULL) = ("opportunity_stage_history"."previous_label" IS NULL)
        AND ("opportunity_stage_history"."new_sales_stage_id" IS NULL) = ("opportunity_stage_history"."new_label" IS NULL)
        AND "opportunity_stage_history"."previous_sales_stage_id" IS DISTINCT FROM "opportunity_stage_history"."new_sales_stage_id"
        AND ("opportunity_stage_history"."previous_label" IS NULL OR (length("opportunity_stage_history"."previous_label") BETWEEN 1 AND 80 AND length(btrim("opportunity_stage_history"."previous_label")) > 0))
        AND ("opportunity_stage_history"."new_label" IS NULL OR (length("opportunity_stage_history"."new_label") BETWEEN 1 AND 80 AND length(btrim("opportunity_stage_history"."new_label")) > 0))),
	CONSTRAINT "opportunity_stage_history_actor_label_check" CHECK (length(btrim("opportunity_stage_history"."actor_display_label")) > 0)
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "commercial_intake_events" DROP CONSTRAINT "commercial_intake_events_action_metadata_check";--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "sales_stage_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_stage_configuration_commands" ADD CONSTRAINT "sales_stage_configuration_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_stage_configuration_commands" ADD CONSTRAINT "sales_stage_configuration_commands_stage_fk" FOREIGN KEY ("workspace_id","company_id","sales_stage_id") REFERENCES "public"."sales_stages"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_stage_configurations" ADD CONSTRAINT "sales_stage_configurations_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_stage_events" ADD CONSTRAINT "sales_stage_events_stage_fk" FOREIGN KEY ("workspace_id","company_id","sales_stage_id") REFERENCES "public"."sales_stages"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_stage_events" ADD CONSTRAINT "sales_stage_events_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_stages" ADD CONSTRAINT "sales_stages_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_stages" ADD CONSTRAINT "sales_stages_creator_fk" FOREIGN KEY ("workspace_id","created_by_workspace_membership_id","created_by_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_intake_stage_commands" ADD CONSTRAINT "commercial_intake_stage_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_intake_stage_commands" ADD CONSTRAINT "commercial_intake_stage_commands_opportunity_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_intake_stage_commands" ADD CONSTRAINT "commercial_intake_stage_commands_stage_fk" FOREIGN KEY ("workspace_id","company_id","sales_stage_id") REFERENCES "public"."sales_stages"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_opportunity_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_previous_stage_fk" FOREIGN KEY ("workspace_id","company_id","previous_sales_stage_id") REFERENCES "public"."sales_stages"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_new_stage_fk" FOREIGN KEY ("workspace_id","company_id","new_sales_stage_id") REFERENCES "public"."sales_stages"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_stage_configuration_commands_actor_key_unique" ON "sales_stage_configuration_commands" USING btree ("workspace_id","company_id","actor_workspace_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_stage_configuration_commands_revision_unique" ON "sales_stage_configuration_commands" USING btree ("workspace_id","company_id","result_revision");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_stage_events_revision_unique" ON "sales_stage_events" USING btree ("workspace_id","company_id",("metadata" ->> 'configurationRevision'));--> statement-breakpoint
CREATE UNIQUE INDEX "sales_stages_label_unique" ON "sales_stages" USING btree ("workspace_id","company_id",lower("label"));--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_stage_commands_actor_key_unique" ON "commercial_intake_stage_commands" USING btree ("workspace_id","company_id","actor_workspace_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_stage_commands_version_unique" ON "commercial_intake_stage_commands" USING btree ("workspace_id","opportunity_id","result_version") WHERE "commercial_intake_stage_commands"."outcome" = 'updated';--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_sales_stage_fk" FOREIGN KEY ("workspace_id","company_id","sales_stage_id") REFERENCES "public"."sales_stages"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_intake_events_stage_version_unique" ON "commercial_intake_events" USING btree ("workspace_id","opportunity_id",("metadata" ->> 'opportunityVersion')) WHERE "commercial_intake_events"."action" = 'opportunity.stage.changed';--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration')
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
        OR
        (("commercial_intake_events"."action" = 'opportunity.stage.changed'
          AND jsonb_typeof("commercial_intake_events"."metadata" -> 'opportunityVersion') = 'number'
          AND ("commercial_intake_events"."metadata" ->> 'opportunityVersion')::integer >= 2
          AND (jsonb_typeof("commercial_intake_events"."metadata" -> 'previousStage') = 'null'
            OR (jsonb_typeof("commercial_intake_events"."metadata" #> '{previousStage,salesStageId}') = 'string'
              AND jsonb_typeof("commercial_intake_events"."metadata" #> '{previousStage,label}') = 'string'
              AND "commercial_intake_events"."metadata" -> 'previousStage' = jsonb_build_object(
                'salesStageId', "commercial_intake_events"."metadata" #>> '{previousStage,salesStageId}',
                'label', "commercial_intake_events"."metadata" #>> '{previousStage,label}')
              AND length("commercial_intake_events"."metadata" #>> '{previousStage,label}') BETWEEN 1 AND 80
              AND length(btrim("commercial_intake_events"."metadata" #>> '{previousStage,label}')) > 0))
          AND (jsonb_typeof("commercial_intake_events"."metadata" -> 'newStage') = 'null'
            OR (jsonb_typeof("commercial_intake_events"."metadata" #> '{newStage,salesStageId}') = 'string'
              AND jsonb_typeof("commercial_intake_events"."metadata" #> '{newStage,label}') = 'string'
              AND "commercial_intake_events"."metadata" -> 'newStage' = jsonb_build_object(
                'salesStageId', "commercial_intake_events"."metadata" #>> '{newStage,salesStageId}',
                'label', "commercial_intake_events"."metadata" #>> '{newStage,label}')
              AND length("commercial_intake_events"."metadata" #>> '{newStage,label}') BETWEEN 1 AND 80
              AND length(btrim("commercial_intake_events"."metadata" #>> '{newStage,label}')) > 0))
          AND "commercial_intake_events"."metadata" = jsonb_build_object(
            'opportunityVersion', ("commercial_intake_events"."metadata" ->> 'opportunityVersion')::integer,
            'previousStage', "commercial_intake_events"."metadata" -> 'previousStage',
            'newStage', "commercial_intake_events"."metadata" -> 'newStage')
          AND ("commercial_intake_events"."metadata" #>> '{previousStage,salesStageId}')
            IS DISTINCT FROM ("commercial_intake_events"."metadata" #>> '{newStage,salesStageId}')) IS TRUE)
      ));