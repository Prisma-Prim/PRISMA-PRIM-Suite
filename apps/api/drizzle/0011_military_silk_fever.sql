ALTER TABLE "activity_log_events" DROP CONSTRAINT "activity_log_events_target_shape_check";--> statement-breakpoint
UPDATE "activity_log_events" AS "event"
SET "target_company_id" = "command"."company_id"
FROM "client_account_correction_commands" AS "command"
WHERE "event"."action"::text = 'client.corrected'
  AND "event"."target_company_id" IS NULL
  AND "event"."workspace_id" = "command"."workspace_id"
  AND "event"."actor_workspace_membership_id" = "command"."actor_workspace_membership_id"
  AND "event"."target_client_account_id" = "command"."client_account_id"
  AND "event"."idempotency_key" =
    'client.corrected:' || "command"."client_account_id"::text || ':' || "command"."id"::text;--> statement-breakpoint
ALTER TABLE "activity_log_events" ADD CONSTRAINT "activity_log_events_target_shape_check" CHECK ((
        ("activity_log_events"."target_type"::text = 'internal_user'
          AND "activity_log_events"."target_internal_user_id" IS NOT NULL
          AND "activity_log_events"."target_workspace_membership_id" IS NOT NULL
          AND "activity_log_events"."target_company_id" IS NULL
          AND "activity_log_events"."target_company_role_assignment_id" IS NULL
          AND "activity_log_events"."target_client_account_id" IS NULL
          AND "activity_log_events"."target_client_company_relationship_id" IS NULL)
        OR
        ("activity_log_events"."target_type"::text = 'company'
          AND "activity_log_events"."target_internal_user_id" IS NULL
          AND "activity_log_events"."target_workspace_membership_id" IS NULL
          AND "activity_log_events"."target_company_id" IS NOT NULL
          AND "activity_log_events"."target_company_role_assignment_id" IS NULL
          AND "activity_log_events"."target_client_account_id" IS NULL
          AND "activity_log_events"."target_client_company_relationship_id" IS NULL)
        OR
        ("activity_log_events"."target_type"::text = 'company_role_assignment'
          AND "activity_log_events"."target_internal_user_id" IS NOT NULL
          AND "activity_log_events"."target_workspace_membership_id" IS NOT NULL
          AND "activity_log_events"."target_company_id" IS NOT NULL
          AND "activity_log_events"."target_company_role_assignment_id" IS NOT NULL
          AND "activity_log_events"."target_client_account_id" IS NULL
          AND "activity_log_events"."target_client_company_relationship_id" IS NULL)
        OR
        ("activity_log_events"."target_type"::text = 'client_account'
          AND "activity_log_events"."target_internal_user_id" IS NULL
          AND "activity_log_events"."target_workspace_membership_id" IS NULL
          AND (
            ("activity_log_events"."action"::text = 'client.corrected'
              AND "activity_log_events"."target_company_id" IS NOT NULL)
            OR
            ("activity_log_events"."action"::text <> 'client.corrected'
              AND "activity_log_events"."target_company_id" IS NULL))
          AND "activity_log_events"."target_company_role_assignment_id" IS NULL
          AND "activity_log_events"."target_client_account_id" IS NOT NULL
          AND "activity_log_events"."target_client_company_relationship_id" IS NULL)
        OR
        ("activity_log_events"."target_type"::text = 'client_company_relationship'
          AND "activity_log_events"."target_internal_user_id" IS NULL
          AND "activity_log_events"."target_workspace_membership_id" IS NULL
          AND "activity_log_events"."target_company_id" IS NOT NULL
          AND "activity_log_events"."target_company_role_assignment_id" IS NULL
          AND "activity_log_events"."target_client_account_id" IS NOT NULL
          AND "activity_log_events"."target_client_company_relationship_id" IS NOT NULL)
      ));
