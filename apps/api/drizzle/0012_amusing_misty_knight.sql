ALTER TABLE "activity_log_events" DROP CONSTRAINT "activity_log_events_target_shape_check";--> statement-breakpoint
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