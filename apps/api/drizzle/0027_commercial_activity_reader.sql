ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_commercial_activity_reader_assignment.granted' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_commercial_activity_reader_assignment.revoked' BEFORE 'client.created';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_commercial_activity_reader';--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_document_registrar' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_project_access', 'company_commercial_intake', 'company_commercial_activity_reader') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_project_access', 'company_commercial_intake', 'company_commercial_activity_reader')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
