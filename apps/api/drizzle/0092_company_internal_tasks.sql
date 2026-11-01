CREATE FUNCTION ict_keys(j jsonb, names text[]) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT jsonb_typeof(j)='object' AND (SELECT count(*)=cardinality(names) AND bool_and(k=ANY(names)) FROM jsonb_object_keys(j) k);
$$;
--> statement-breakpoint
CREATE FUNCTION ict_uuid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(jsonb_typeof(j)='string' AND j#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false);
$$;
--> statement-breakpoint
CREATE FUNCTION ict_text(j jsonb, maximum integer, nullable boolean DEFAULT false) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce((nullable AND j='null'::jsonb) OR (jsonb_typeof(j)='string' AND char_length(j#>>'{}') BETWEEN 1 AND maximum AND (j#>>'{}')=btrim(j#>>'{}',chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))),false);
$$;
--> statement-breakpoint
CREATE FUNCTION ict_version(j jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ BEGIN
 RETURN coalesce(jsonb_typeof(j)='number' AND (j#>>'{}') ~ '^[1-9][0-9]*$' AND (j#>>'{}')::numeric BETWEEN 1 AND 2147483647,false);
 EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE FUNCTION ict_date(j jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ BEGIN
 IF j='null'::jsonb THEN RETURN true; END IF;
 RETURN coalesce(jsonb_typeof(j)='string' AND (j#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND substring(j#>>'{}',1,4)<>'0000' AND to_char((j#>>'{}')::date,'YYYY-MM-DD')=j#>>'{}',false);
 EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE FUNCTION ict_time(j jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ BEGIN
 RETURN coalesce(jsonb_typeof(j)='string' AND (j#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' AND to_char((j#>>'{}')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=j#>>'{}',false);
 EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE FUNCTION ict_snapshot_valid(j jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ DECLARE s text; BEGIN
 IF NOT coalesce(ict_keys(j,ARRAY['format','id','workspaceId','companyId','version','title','description','assignee','dueDate','priority','status','createdByMembershipId','createdAt','updatedAt','completion','reason']) AND j->>'format'='company-internal-task-v1' AND ict_uuid(j->'id') AND ict_uuid(j->'workspaceId') AND ict_uuid(j->'companyId') AND ict_uuid(j->'createdByMembershipId') AND ict_version(j->'version') AND ict_text(j->'title',200) AND ict_text(j->'description',2000,true) AND ict_date(j->'dueDate') AND j->>'priority' IN ('normal','important','critical') AND ict_time(j->'createdAt') AND ict_time(j->'updatedAt') AND j->>'updatedAt'>=j->>'createdAt',false) THEN RETURN false; END IF;
 IF j->'assignee'<>'null'::jsonb AND NOT coalesce(ict_keys(j->'assignee',ARRAY['membershipId','displayLabel']) AND ict_uuid(j->'assignee'->'membershipId') AND jsonb_typeof(j->'assignee'->'displayLabel')='string' AND length(j->'assignee'->>'displayLabel')>0,false) THEN RETURN false; END IF;
 s:=j->>'status';
 IF s IN ('todo','in_progress') THEN RETURN coalesce(j->'completion'='null'::jsonb AND j->'reason'='null'::jsonb,false); END IF;
 IF s='done' THEN RETURN coalesce(ict_keys(j->'completion',ARRAY['actorMembershipId','recordedAt']) AND ict_uuid(j->'completion'->'actorMembershipId') AND ict_time(j->'completion'->'recordedAt') AND j->'completion'->>'recordedAt'=j->>'updatedAt' AND j->'reason'='null'::jsonb,false); END IF;
 IF s IN ('blocked','cancelled') THEN RETURN coalesce(j->'completion'='null'::jsonb AND ict_keys(j->'reason',ARRAY['kind','text','actorMembershipId','recordedAt']) AND j->'reason'->>'kind'=CASE s WHEN 'blocked' THEN 'blockage' ELSE 'cancellation' END AND ict_text(j->'reason'->'text',500) AND ict_uuid(j->'reason'->'actorMembershipId') AND ict_time(j->'reason'->'recordedAt') AND j->'reason'->>'recordedAt'<=j->>'updatedAt',false); END IF;
 RETURN false; EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE FUNCTION ict_history_valid(j jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ BEGIN
 IF NOT coalesce(ict_keys(j,ARRAY['format','workspaceId','companyId','taskId','version','kind','actorMembershipId','recordedAt','before','after']) AND j->>'format'='company-internal-task-history-v1' AND ict_uuid(j->'workspaceId') AND ict_uuid(j->'companyId') AND ict_uuid(j->'taskId') AND ict_version(j->'version') AND ict_uuid(j->'actorMembershipId') AND ict_time(j->'recordedAt') AND ict_snapshot_valid(j->'after') AND j->'after'->'workspaceId'=j->'workspaceId' AND j->'after'->'companyId'=j->'companyId' AND j->'after'->'id'=j->'taskId' AND j->'after'->'version'=j->'version' AND j->'after'->'updatedAt'=j->'recordedAt',false) THEN RETURN false; END IF;
 IF j->>'kind'='CREATE' THEN RETURN j->>'version'='1' AND j->'before'='null'::jsonb AND j->'after'->>'status'='todo' AND j->'after'->'createdAt'=j->'recordedAt' AND j->'after'->'createdByMembershipId'=j->'actorMembershipId'; END IF;
 RETURN coalesce(j->>'kind' IN ('EDIT','MOVE') AND ict_snapshot_valid(j->'before') AND (j->'before'->>'version')::bigint+1=(j->>'version')::bigint AND ((j->'before')-ARRAY['version','title','description','assignee','dueDate','priority','status','updatedAt','completion','reason'])=((j->'after')-ARRAY['version','title','description','assignee','dueDate','priority','status','updatedAt','completion','reason']),false);
 EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE FUNCTION ict_receipt_valid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(ict_keys(j,ARRAY['format','task','changed','history']) AND j->>'format'='company-internal-task-command-v1' AND ict_snapshot_valid(j->'task') AND ((j->'changed'='false'::jsonb AND j->'history'='null'::jsonb) OR (j->'changed'='true'::jsonb AND ict_history_valid(j->'history') AND j->'history'->'after'=j->'task')),false);
$$;
--> statement-breakpoint
CREATE FUNCTION ict_input_valid(j jsonb, creation boolean) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ DECLARE k text; BEGIN
 IF jsonb_typeof(j)<>'object' THEN RETURN false; END IF;
 FOR k IN SELECT jsonb_object_keys(j) LOOP
   IF NOT k=ANY(CASE WHEN creation THEN ARRAY['title','description','assigneeMembershipId','dueDate','priority'] ELSE ARRAY['kind','expectedVersion','title','description','assigneeMembershipId','dueDate','priority','status','reason'] END) THEN RETURN false; END IF;
 END LOOP;
 IF creation THEN IF NOT ict_text(j->'title',200) THEN RETURN false; END IF;
 ELSE
   IF NOT ict_version(j->'expectedVersion') THEN RETURN false; END IF;
   IF j->>'kind'='MOVE' THEN
     IF j->>'status' IN ('blocked','cancelled') THEN RETURN coalesce(ict_keys(j,ARRAY['kind','expectedVersion','status','reason']) AND ict_text(j->'reason',500),false); END IF;
     RETURN coalesce(ict_keys(j,ARRAY['kind','expectedVersion','status']) AND j->>'status' IN ('todo','in_progress','done'),false);
   END IF;
   IF j->>'kind' IS DISTINCT FROM 'EDIT' OR j ? 'status' OR j ? 'reason' OR NOT (j ?| ARRAY['title','description','assigneeMembershipId','dueDate','priority']) THEN RETURN false; END IF;
 END IF;
 RETURN coalesce((NOT j ? 'title' OR ict_text(j->'title',200)) AND (NOT j ? 'description' OR ict_text(j->'description',2000,true)) AND (NOT j ? 'assigneeMembershipId' OR j->'assigneeMembershipId'='null'::jsonb OR ict_uuid(j->'assigneeMembershipId')) AND (NOT j ? 'dueDate' OR ict_date(j->'dueDate')) AND (NOT j ? 'priority' OR j->>'priority' IN ('normal','important','critical')),false);
 EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_internal_task_manager_assignment.granted' BEFORE 'company_task_manager_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_internal_task_manager_assignment.revoked' BEFORE 'company_task_manager_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_internal_task_manager' BEFORE 'company_task_manager';--> statement-breakpoint
CREATE TABLE "internal_company_task_commands" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"intent" jsonb NOT NULL,
	"version" integer NOT NULL,
	"changed" integer NOT NULL,
	"response" jsonb NOT NULL,
	CONSTRAINT "ict_command_check" CHECK ("internal_company_task_commands"."changed" IN (0,1) AND "internal_company_task_commands"."version">0 AND length("internal_company_task_commands"."idempotency_key")>0 AND ict_receipt_valid("internal_company_task_commands"."response"))
);
--> statement-breakpoint
CREATE TABLE "internal_company_task_events" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"task_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"action" text NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "ict_event_scope_version_unique" UNIQUE("workspace_id","company_id","task_id","version"),
	CONSTRAINT "ict_event_check" CHECK ("internal_company_task_events"."version">0 AND "internal_company_task_events"."action" IN ('internal_task.created','internal_task.updated','internal_task.status.changed') AND "internal_company_task_events"."metadata"=jsonb_build_object('version',"internal_company_task_events"."version"))
);
--> statement-breakpoint
CREATE TABLE "internal_company_task_history" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"task_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"fact" jsonb NOT NULL,
	CONSTRAINT "ict_history_scope_version_unique" UNIQUE("workspace_id","company_id","task_id","version"),
	CONSTRAINT "ict_history_check" CHECK (ict_history_valid("internal_company_task_history"."fact") AND "internal_company_task_history"."version">0 AND "internal_company_task_history"."fact"->>'workspaceId'="internal_company_task_history"."workspace_id"::text AND "internal_company_task_history"."fact"->>'companyId'="internal_company_task_history"."company_id"::text AND "internal_company_task_history"."fact"->>'taskId'="internal_company_task_history"."task_id"::text AND ("internal_company_task_history"."fact"->>'version')::integer="internal_company_task_history"."version" AND "internal_company_task_history"."fact"->>'actorMembershipId'="internal_company_task_history"."actor_membership_id"::text AND ("internal_company_task_history"."fact"->>'recordedAt')::timestamptz="internal_company_task_history"."recorded_at")
);
--> statement-breakpoint
CREATE TABLE "internal_company_tasks" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"creator_membership_id" uuid NOT NULL,
	"assignee_membership_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "ict_scope_id_unique" UNIQUE("workspace_id","company_id","id"),
	CONSTRAINT "ict_snapshot_check" CHECK (ict_snapshot_valid("internal_company_tasks"."snapshot") AND "internal_company_tasks"."version">0 AND "internal_company_tasks"."snapshot"->>'id'="internal_company_tasks"."id"::text AND "internal_company_tasks"."snapshot"->>'workspaceId'="internal_company_tasks"."workspace_id"::text AND "internal_company_tasks"."snapshot"->>'companyId'="internal_company_tasks"."company_id"::text AND ("internal_company_tasks"."snapshot"->>'version')::integer="internal_company_tasks"."version" AND "internal_company_tasks"."snapshot"->>'createdByMembershipId'="internal_company_tasks"."creator_membership_id"::text AND ("internal_company_tasks"."snapshot"->'assignee'->>'membershipId') IS NOT DISTINCT FROM "internal_company_tasks"."assignee_membership_id"::text AND ("internal_company_tasks"."snapshot"->>'createdAt')::timestamptz="internal_company_tasks"."created_at")
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "internal_company_task_commands" ADD CONSTRAINT "internal_company_task_commands_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."company_role_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_company_task_commands" ADD CONSTRAINT "ict_command_history_fk" FOREIGN KEY ("workspace_id","company_id","task_id","version") REFERENCES "public"."internal_company_task_history"("workspace_id","company_id","task_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_company_task_commands" ADD CONSTRAINT "ict_command_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_company_task_events" ADD CONSTRAINT "ict_event_history_fk" FOREIGN KEY ("workspace_id","company_id","task_id","version") REFERENCES "public"."internal_company_task_history"("workspace_id","company_id","task_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_company_task_events" ADD CONSTRAINT "ict_event_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_company_task_history" ADD CONSTRAINT "ict_history_task_fk" FOREIGN KEY ("workspace_id","company_id","task_id") REFERENCES "public"."internal_company_tasks"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_company_task_history" ADD CONSTRAINT "ict_history_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_company_tasks" ADD CONSTRAINT "ict_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_company_tasks" ADD CONSTRAINT "ict_creator_fk" FOREIGN KEY ("workspace_id","creator_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_company_tasks" ADD CONSTRAINT "ict_assignee_fk" FOREIGN KEY ("workspace_id","assignee_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ict_command_actor_key_unique" ON "internal_company_task_commands" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ict_command_material_unique" ON "internal_company_task_commands" USING btree ("workspace_id","company_id","task_id","version") WHERE "internal_company_task_commands"."changed"=1;--> statement-breakpoint
CREATE INDEX "ict_discovery_idx" ON "internal_company_tasks" USING btree ("workspace_id","company_id","created_at","id");--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text = 'company_offer_preparer' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_contract_preparer' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_contract_approver' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_offer_approver' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_project_template_user' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_internal_task_manager', 'company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_contract_early_preparation', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_project_next_action_coordinator', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user', 'company_knowledge_source_administrator', 'company_knowledge_evidence_reader') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_internal_task_manager', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_project_next_action_coordinator', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user', 'company_knowledge_source_administrator', 'company_knowledge_evidence_reader')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
--> statement-breakpoint
-- Native source-label integrity mirrors Access memberDisplayLabel for a changed
-- assignee only. Existing captured labels are never looked up or rewritten.
-- Access remains the sole owner of candidate permissions and transaction locks.
CREATE FUNCTION ict_member_reference(member uuid) RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE digits text:='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'; hex text:=replace(member::text,'-',''); value numeric:=0; result text:=''; i integer;
BEGIN
 FOR i IN 1..32 LOOP value:=value*16+strpos('0123456789abcdef',substring(hex,i,1))-1; END LOOP;
 WHILE value>0 LOOP result:=substring(digits,mod(value,36)::integer+1,1)||result; value:=div(value,36); END LOOP;
 RETURN CASE WHEN result='' THEN '0' ELSE result END;
END $$;
--> statement-breakpoint
CREATE FUNCTION ict_member_label(workspace uuid, member uuid) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT u.display_name||' · '||ict_member_reference(m.id) FROM workspace_memberships m JOIN internal_users u ON u.id=m.internal_user_id WHERE m.workspace_id=workspace AND m.id=member AND m.status='active' AND u.status='active';
$$;
--> statement-breakpoint
CREATE FUNCTION ict_expected_after(previous jsonb, result jsonb, body jsonb, creation boolean, material boolean, member uuid, at_time timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE expected jsonb; assigned jsonb; label text; stamp jsonb; field text; destination text;
BEGIN
 stamp:=to_jsonb(to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 IF creation THEN
   IF NOT material OR result->>'version'<>'1' OR result->>'status'<>'todo' OR result->'createdAt'<>stamp OR result->'createdByMembershipId'<>to_jsonb(member) THEN RETURN NULL; END IF;
   IF coalesce(body->'assigneeMembershipId','null'::jsonb)='null'::jsonb THEN assigned:='null'::jsonb;
   ELSE label:=ict_member_label((result->>'workspaceId')::uuid,(body->>'assigneeMembershipId')::uuid); IF label IS NULL THEN RETURN NULL; END IF; assigned:=jsonb_build_object('membershipId',body->'assigneeMembershipId','displayLabel',label); END IF;
   RETURN result || jsonb_build_object('title',body->'title','description',coalesce(body->'description','null'::jsonb),'assignee',assigned,'dueDate',coalesce(body->'dueDate','null'::jsonb),'priority',coalesce(body->'priority','"normal"'::jsonb),'completion',NULL,'reason',NULL,'updatedAt',stamp);
 END IF;
 IF NOT ict_snapshot_valid(previous) OR body->'expectedVersion'<>previous->'version' THEN RETURN NULL; END IF;
 expected:=previous;
 IF body->>'kind'='EDIT' THEN
   IF previous->>'status' NOT IN ('todo','in_progress','blocked') THEN RETURN NULL; END IF;
   FOREACH field IN ARRAY ARRAY['title','description','dueDate','priority'] LOOP
     IF body ? field THEN expected:=jsonb_set(expected,ARRAY[field],body->field); END IF;
   END LOOP;
   IF body ? 'assigneeMembershipId' THEN
     IF body->'assigneeMembershipId'='null'::jsonb THEN assigned:='null'::jsonb;
     ELSIF body->'assigneeMembershipId'=previous->'assignee'->'membershipId' THEN assigned:=previous->'assignee';
     ELSE label:=ict_member_label((result->>'workspaceId')::uuid,(body->>'assigneeMembershipId')::uuid); IF label IS NULL THEN RETURN NULL; END IF; assigned:=jsonb_build_object('membershipId',body->'assigneeMembershipId','displayLabel',label); END IF;
     expected:=jsonb_set(expected,ARRAY['assignee'],assigned);
   END IF;
   IF material=(expected=previous) THEN RETURN NULL; END IF;
 ELSE
   destination:=body->>'status';
   IF NOT material OR destination=previous->>'status' OR (previous->>'status' IN ('done','cancelled') AND destination<>'todo') THEN RETURN NULL; END IF;
   expected:=expected || jsonb_build_object('status',destination,'completion',CASE WHEN destination='done' THEN jsonb_build_object('actorMembershipId',member,'recordedAt',stamp) ELSE 'null'::jsonb END,'reason',CASE WHEN destination IN ('blocked','cancelled') THEN jsonb_build_object('kind',CASE destination WHEN 'blocked' THEN 'blockage' ELSE 'cancellation' END,'text',body->'reason','actorMembershipId',member,'recordedAt',stamp) ELSE 'null'::jsonb END);
 END IF;
 IF material THEN
   IF (previous->>'version')::bigint=2147483647 THEN RETURN NULL; END IF;
   expected:=expected || jsonb_build_object('version',(previous->>'version')::bigint+1,'updatedAt',stamp);
 END IF;
 RETURN expected;
END $$;
--> statement-breakpoint
CREATE FUNCTION ict_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT=TG_TABLE_NAME||'_immutable',MESSAGE='Internal Task facts are immutable.';
END $$;
--> statement-breakpoint
CREATE TRIGGER ict_history_immutable BEFORE UPDATE OR DELETE ON internal_company_task_history FOR EACH ROW EXECUTE FUNCTION ict_immutable_guard();
--> statement-breakpoint
CREATE TRIGGER ict_command_immutable BEFORE UPDATE OR DELETE ON internal_company_task_commands FOR EACH ROW EXECUTE FUNCTION ict_immutable_guard();
--> statement-breakpoint
CREATE TRIGGER ict_event_immutable BEFORE UPDATE OR DELETE ON internal_company_task_events FOR EACH ROW EXECUTE FUNCTION ict_immutable_guard();
--> statement-breakpoint
CREATE FUNCTION ict_head_transition_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ict_head_transition',MESSAGE='Internal Tasks cannot be deleted.'; END IF;
 IF (TG_OP='INSERT' AND NEW.version<>1) OR (TG_OP='UPDATE' AND ((NEW.workspace_id,NEW.company_id,NEW.id,NEW.creator_membership_id,NEW.created_at) IS DISTINCT FROM (OLD.workspace_id,OLD.company_id,OLD.id,OLD.creator_membership_id,OLD.created_at) OR NEW.version::bigint<>OLD.version::bigint+1)) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ict_head_transition',MESSAGE='Internal Tasks require an immutable owner and one successor.'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ict_head_transition BEFORE INSERT OR UPDATE OR DELETE ON internal_company_tasks FOR EACH ROW EXECUTE FUNCTION ict_head_transition_guard();
--> statement-breakpoint
CREATE FUNCTION ict_head_commit_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM internal_company_task_history h WHERE h.workspace_id=NEW.workspace_id AND h.company_id=NEW.company_id AND h.task_id=NEW.id AND h.version=NEW.version AND h.fact->'after'=NEW.snapshot) OR EXISTS(SELECT 1 FROM internal_company_task_history h WHERE h.task_id=NEW.id AND h.version>NEW.version) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ict_head_coupling',MESSAGE='Internal Task head and history must agree.'; END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ict_head_coupling AFTER INSERT OR UPDATE ON internal_company_tasks DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ict_head_commit_guard();
--> statement-breakpoint
CREATE FUNCTION ict_history_commit_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE previous jsonb; BEGIN
 IF NEW.version=1 THEN previous:='null'::jsonb;
 ELSE SELECT fact->'after' INTO previous FROM internal_company_task_history WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND task_id=NEW.task_id AND version=NEW.version-1; END IF;
 IF previous IS NULL OR previous IS DISTINCT FROM NEW.fact->'before' OR
   NOT EXISTS(SELECT 1 FROM internal_company_tasks t WHERE t.workspace_id=NEW.workspace_id AND t.company_id=NEW.company_id AND t.id=NEW.task_id AND t.version=NEW.version AND t.snapshot=NEW.fact->'after') OR
   NOT EXISTS(SELECT 1 FROM internal_company_task_commands c WHERE c.workspace_id=NEW.workspace_id AND c.company_id=NEW.company_id AND c.task_id=NEW.task_id AND c.version=NEW.version AND c.changed=1 AND c.actor_membership_id=NEW.actor_membership_id AND c.actor_internal_user_id=NEW.actor_internal_user_id AND c.recorded_at=NEW.recorded_at AND c.response=jsonb_build_object('format','company-internal-task-command-v1','task',NEW.fact->'after','changed',true,'history',NEW.fact)) OR
   NOT EXISTS(SELECT 1 FROM internal_company_task_events e WHERE e.workspace_id=NEW.workspace_id AND e.company_id=NEW.company_id AND e.task_id=NEW.task_id AND e.version=NEW.version AND e.actor_membership_id=NEW.actor_membership_id AND e.actor_internal_user_id=NEW.actor_internal_user_id AND e.recorded_at=NEW.recorded_at AND e.action=CASE NEW.fact->>'kind' WHEN 'CREATE' THEN 'internal_task.created' WHEN 'EDIT' THEN 'internal_task.updated' ELSE 'internal_task.status.changed' END AND e.metadata=jsonb_build_object('version',NEW.version)) THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ict_history_coupling',MESSAGE='Internal Task fact requires its exact predecessor, head, command and event.';
 END IF; RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ict_history_coupling AFTER INSERT ON internal_company_task_history DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ict_history_commit_guard();
--> statement-breakpoint
CREATE FUNCTION ict_command_commit_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE h jsonb; original jsonb; expected jsonb; creation boolean; BEGIN
 creation:=NEW.intent->>'kind'='CREATE';
 IF NOT coalesce(ict_keys(NEW.intent,ARRAY['format','workspaceId','actorMembershipId','companyId','taskId','kind','body']) AND NEW.intent->>'format'='company-internal-task-command-v1' AND NEW.intent->>'workspaceId'=NEW.workspace_id::text AND NEW.intent->>'actorMembershipId'=NEW.actor_membership_id::text AND NEW.intent->>'companyId'=NEW.company_id::text AND NEW.intent->>'taskId'=NEW.task_id::text AND NEW.intent->>'kind' IN ('CREATE','CHANGE') AND ict_input_valid(NEW.intent->'body',creation) AND ict_text(to_jsonb(NEW.idempotency_key),2147483647),false) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ict_command_coupling',MESSAGE='Invalid normalized Internal Task intent.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM company_role_assignments a JOIN workspace_memberships m ON m.workspace_id=a.workspace_id AND m.id=a.workspace_membership_id JOIN internal_users u ON u.id=m.internal_user_id JOIN companies co ON co.workspace_id=a.workspace_id AND co.id=a.company_id WHERE a.id=NEW.assignment_id AND a.workspace_id=NEW.workspace_id AND a.company_id=NEW.company_id AND a.workspace_membership_id=NEW.actor_membership_id AND m.internal_user_id=NEW.actor_internal_user_id AND a.bundle::text='company_internal_task_manager' AND a.permission_set_version='v1' AND a.revoked_at IS NULL AND m.status='active' AND u.status='active' AND co.status='active') THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ict_command_authority',MESSAGE='Internal Task command requires its exact live captured actor.'; END IF;
 SELECT fact INTO h FROM internal_company_task_history WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND task_id=NEW.task_id AND version=NEW.version;
 IF h IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ict_command_coupling',MESSAGE='Missing exact Internal Task version.'; END IF;
 original:=CASE WHEN NEW.changed=1 THEN h->'before' ELSE h->'after' END;
 expected:=ict_expected_after(original,h->'after',NEW.intent->'body',creation,NEW.changed=1,NEW.actor_membership_id,NEW.recorded_at);
 IF expected IS NULL OR expected IS DISTINCT FROM h->'after' OR (NEW.changed=1 AND (h->>'actorMembershipId'<>NEW.actor_membership_id::text OR (h->>'recordedAt')::timestamptz<>NEW.recorded_at OR h->>'kind'<>CASE WHEN creation THEN 'CREATE' ELSE NEW.intent->'body'->>'kind' END)) OR
   NOT EXISTS(SELECT 1 FROM internal_company_tasks t WHERE t.workspace_id=NEW.workspace_id AND t.company_id=NEW.company_id AND t.id=NEW.task_id AND t.version=NEW.version AND t.snapshot=h->'after') OR
   NEW.response IS DISTINCT FROM jsonb_build_object('format','company-internal-task-command-v1','task',h->'after','changed',NEW.changed=1,'history',CASE WHEN NEW.changed=1 THEN h ELSE 'null'::jsonb END) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ict_command_coupling',MESSAGE='Internal Task command must match its exact legal result.'; END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ict_command_coupling AFTER INSERT ON internal_company_task_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ict_command_commit_guard();
--> statement-breakpoint
CREATE FUNCTION ict_event_commit_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM internal_company_task_history h WHERE h.workspace_id=NEW.workspace_id AND h.company_id=NEW.company_id AND h.task_id=NEW.task_id AND h.version=NEW.version AND h.actor_membership_id=NEW.actor_membership_id AND h.actor_internal_user_id=NEW.actor_internal_user_id AND h.recorded_at=NEW.recorded_at AND NEW.action=CASE h.fact->>'kind' WHEN 'CREATE' THEN 'internal_task.created' WHEN 'EDIT' THEN 'internal_task.updated' ELSE 'internal_task.status.changed' END) THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ict_event_coupling',MESSAGE='Internal Task event must match its exact fact.'; END IF; RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ict_event_coupling AFTER INSERT ON internal_company_task_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ict_event_commit_guard();
