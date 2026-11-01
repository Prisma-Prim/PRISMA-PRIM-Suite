-- Literal representation validators are private to this independent owner.
CREATE FUNCTION ofup_keys(j jsonb,names text[]) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(jsonb_typeof(j)='object' AND (SELECT count(*)=cardinality(names) AND bool_and(k=ANY(names)) FROM jsonb_object_keys(j) k),false);
$$;
--> statement-breakpoint
CREATE FUNCTION ofup_uuid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(jsonb_typeof(j)='string' AND j#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false);
$$;
--> statement-breakpoint
CREATE FUNCTION ofup_revision(j jsonb,minimum bigint DEFAULT 0) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ BEGIN
 RETURN coalesce(jsonb_typeof(j)='number' AND (j#>>'{}') ~ '^(0|[1-9][0-9]*)$' AND (j#>>'{}')::numeric BETWEEN minimum AND 9007199254740991,false);
 EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE FUNCTION ofup_date(j jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ BEGIN
 IF j='null'::jsonb THEN RETURN true; END IF;
 RETURN coalesce(jsonb_typeof(j)='string' AND (j#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND substring(j#>>'{}',1,4)<>'0000' AND to_char((j#>>'{}')::date,'YYYY-MM-DD')=j#>>'{}',false);
 EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE FUNCTION ofup_reason(j jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ DECLARE value text; units integer; BEGIN
 IF j='null'::jsonb THEN RETURN true; END IF;
 IF jsonb_typeof(j) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
 value:=j#>>'{}';
 SELECT coalesce(sum(CASE WHEN ascii(s)>65535 THEN 2 ELSE 1 END),0) INTO units FROM regexp_split_to_table(value,'') s;
 RETURN units BETWEEN 1 AND 500 AND length(btrim(value,chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)))>0;
 EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE FUNCTION ofup_time(j jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ BEGIN
 RETURN coalesce(jsonb_typeof(j)='string' AND (j#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' AND to_char((j#>>'{}')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=j#>>'{}',false);
 EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE FUNCTION ofup_actor(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(ofup_keys(j,ARRAY['workspaceMembershipId','displayLabel']) AND ofup_uuid(j->'workspaceMembershipId') AND jsonb_typeof(j->'displayLabel')='string' AND length(btrim(j->>'displayLabel'))>0,false);
$$;
--> statement-breakpoint
CREATE FUNCTION ofup_fact_valid(j jsonb,allow_absent boolean DEFAULT true) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ BEGIN
 IF j=jsonb_build_object('state','UNRECORDED','revision',0) THEN RETURN allow_absent; END IF;
 RETURN coalesce(ofup_keys(j,ARRAY['state','revision','followUpOn','confirmedEpoch','recordedBy','recordedAt']) AND j->>'state'='RECORDED' AND ofup_revision(j->'revision',1) AND ofup_date(j->'followUpOn') AND j->>'confirmedEpoch' ~ '^(initial|transition):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND ofup_actor(j->'recordedBy') AND ofup_time(j->'recordedAt'),false);
 EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE FUNCTION ofup_receipt_valid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(ofup_keys(j,ARRAY['format','opportunityId','outcome','fact']) AND j->>'format'='opportunity-follow-up.v1' AND ofup_uuid(j->'opportunityId') AND j->>'outcome' IN ('updated','unchanged') AND ofup_fact_valid(j->'fact',false),false);
$$;
--> statement-breakpoint
CREATE FUNCTION ofup_history_valid(j jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ DECLARE previous jsonb; result jsonb; BEGIN
 previous:=j->'before';result:=j->'after';
 RETURN coalesce(ofup_keys(j,ARRAY['format','opportunityId','revision','before','after','reason','commandId','actor','occurredAt']) AND j->>'format'='opportunity-follow-up.v1' AND ofup_uuid(j->'opportunityId') AND ofup_revision(j->'revision',1) AND ofup_fact_valid(previous) AND ofup_fact_valid(result,false) AND (previous->>'revision')::numeric+1=(j->>'revision')::numeric AND result->'revision'=j->'revision' AND ofup_reason(j->'reason') AND ofup_uuid(j->'commandId') AND ofup_actor(j->'actor') AND j->'actor'=result->'recordedBy' AND j->'occurredAt'=result->'recordedAt' AND (previous->>'state'='UNRECORDED' OR (j->'reason'<>'null'::jsonb AND (previous->'followUpOn' IS DISTINCT FROM result->'followUpOn' OR previous->'confirmedEpoch' IS DISTINCT FROM result->'confirmedEpoch'))),false);
 EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
-- Native Commercial owns the epoch: transition identity, never time or version.
CREATE FUNCTION commercial_follow_up_epoch(w uuid,c uuid,o uuid) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE target opportunities%ROWTYPE; h opportunity_outcome_history%ROWTYPE; previous text:='OPEN'; last_id uuid; last_time timestamptz; material_count bigint; distinct_count bigint; first_version integer; last_version integer;
BEGIN
 SELECT * INTO target FROM opportunities WHERE workspace_id=w AND company_id=c AND id=o;
 IF NOT FOUND THEN RETURN NULL; END IF;
 FOR h IN SELECT * FROM opportunity_outcome_history WHERE workspace_id=w AND company_id=c AND opportunity_id=o ORDER BY opportunity_version LOOP
   IF h.previous_status<>previous OR h.opportunity_version>target.version OR NOT EXISTS(SELECT 1 FROM commercial_intake_outcome_commands cmd WHERE cmd.workspace_id=w AND cmd.company_id=c AND cmd.opportunity_id=o AND cmd.result_version=h.opportunity_version AND cmd.previous_status=h.previous_status AND cmd.new_status=h.new_status AND cmd.actor_workspace_membership_id=h.actor_workspace_membership_id) THEN
     RAISE EXCEPTION 'Native Opportunity outcome evidence is unavailable.' USING ERRCODE='23514';
   END IF;
   previous:=h.new_status;last_id:=h.id;last_time:=h.changed_at;
 END LOOP;
 SELECT count(*),count(DISTINCT result_version),min(result_version),max(result_version) INTO material_count,distinct_count,first_version,last_version FROM (
   SELECT result_version FROM commercial_intake_next_action_commands WHERE workspace_id=w AND company_id=c AND opportunity_id=o AND outcome='updated'
   UNION ALL SELECT result_version FROM commercial_intake_responsible_commands WHERE workspace_id=w AND company_id=c AND opportunity_id=o AND outcome='updated'
   UNION ALL SELECT result_version FROM commercial_intake_stage_commands WHERE workspace_id=w AND company_id=c AND opportunity_id=o AND outcome='updated'
   UNION ALL SELECT result_version FROM commercial_intake_outcome_commands WHERE workspace_id=w AND company_id=c AND opportunity_id=o
 ) native_commands;
 IF previous<>target.status OR material_count<>target.version-1 OR distinct_count<>material_count OR (target.version>1 AND (first_version<>2 OR last_version<>target.version)) OR NOT EXISTS(SELECT 1 FROM commercial_intake_commands WHERE workspace_id=w AND company_id=c AND result_client_request_id=target.client_request_id) OR (last_id IS NULL AND (target.status<>'OPEN' OR EXISTS(SELECT 1 FROM commercial_intake_outcome_commands WHERE workspace_id=w AND company_id=c AND opportunity_id=o))) THEN
   RAISE EXCEPTION 'Native Opportunity outcome evidence is unavailable.' USING ERRCODE='23514';
 END IF;
 RETURN CASE WHEN last_id IS NULL THEN 'initial:'||target.id::text ELSE 'transition:'||last_id::text END;
END $$;
--> statement-breakpoint
CREATE VIEW commercial_follow_up_opportunity_state AS SELECT workspace_id,company_id,id AS opportunity_id,client_request_id AS request_id,title,status,version,commercial_follow_up_epoch(workspace_id,company_id,id) AS outcome_epoch FROM opportunities;
--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_opportunity_follow_up_coordinator_assignment.granted' BEFORE 'company_invoice_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_opportunity_follow_up_coordinator_assignment.revoked' BEFORE 'company_invoice_reader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_opportunity_follow_up_coordinator' BEFORE 'company_invoice_reader';--> statement-breakpoint
CREATE TABLE "opportunity_follow_up_commands" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"intake_assignment_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"intent" jsonb NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"response" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ofup_command_check" CHECK ("opportunity_follow_up_commands"."revision">0 AND "opportunity_follow_up_commands"."revision"<=9007199254740991 AND "opportunity_follow_up_commands"."outcome" IN ('updated','unchanged') AND ofup_receipt_valid("opportunity_follow_up_commands"."response") AND length("opportunity_follow_up_commands"."idempotency_key")>0)
);
--> statement-breakpoint
CREATE TABLE "opportunity_follow_up_cursor_keys" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"key" text DEFAULT gen_random_uuid()::text || gen_random_uuid()::text NOT NULL,
	CONSTRAINT "opportunity_follow_up_cursor_keys_workspace_id_company_id_pk" PRIMARY KEY("workspace_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "opportunity_follow_up_events" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"revision" bigint NOT NULL,
	"command_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"action" text NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "opportunity_follow_up_events_workspace_id_company_id_opportunity_id_revision_pk" PRIMARY KEY("workspace_id","company_id","opportunity_id","revision"),
	CONSTRAINT "ofup_event_command_unique" UNIQUE("command_id"),
	CONSTRAINT "ofup_event_check" CHECK ("opportunity_follow_up_events"."action"='opportunity.follow_up.updated' AND "opportunity_follow_up_events"."metadata"=jsonb_build_object('revision',"opportunity_follow_up_events"."revision"))
);
--> statement-breakpoint
CREATE TABLE "opportunity_follow_up_heads" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"revision" bigint NOT NULL,
	"follow_up_on" text,
	"confirmed_epoch" text NOT NULL,
	"fact" jsonb NOT NULL,
	CONSTRAINT "opportunity_follow_up_heads_workspace_id_company_id_opportunity_id_pk" PRIMARY KEY("workspace_id","company_id","opportunity_id"),
	CONSTRAINT "ofup_head_opportunity_unique" UNIQUE("opportunity_id"),
	CONSTRAINT "ofup_head_fact_check" CHECK (ofup_fact_valid("opportunity_follow_up_heads"."fact",false) AND ("opportunity_follow_up_heads"."fact"->>'revision')::bigint="opportunity_follow_up_heads"."revision" AND ("opportunity_follow_up_heads"."fact"->>'followUpOn') IS NOT DISTINCT FROM "opportunity_follow_up_heads"."follow_up_on" AND "opportunity_follow_up_heads"."fact"->>'confirmedEpoch'="opportunity_follow_up_heads"."confirmed_epoch")
);
--> statement-breakpoint
CREATE TABLE "opportunity_follow_up_history" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"revision" bigint NOT NULL,
	"command_id" uuid NOT NULL,
	"fact" jsonb NOT NULL,
	CONSTRAINT "opportunity_follow_up_history_workspace_id_company_id_opportunity_id_revision_pk" PRIMARY KEY("workspace_id","company_id","opportunity_id","revision"),
	CONSTRAINT "ofup_history_command_unique" UNIQUE("command_id"),
	CONSTRAINT "ofup_history_check" CHECK (ofup_history_valid("opportunity_follow_up_history"."fact") AND "opportunity_follow_up_history"."fact"->>'opportunityId'="opportunity_follow_up_history"."opportunity_id"::text AND ("opportunity_follow_up_history"."fact"->>'revision')::bigint="opportunity_follow_up_history"."revision" AND "opportunity_follow_up_history"."fact"->>'commandId'="opportunity_follow_up_history"."command_id"::text)
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_commands" ADD CONSTRAINT "opportunity_follow_up_commands_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."company_role_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_commands" ADD CONSTRAINT "opportunity_follow_up_commands_intake_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("intake_assignment_id") REFERENCES "public"."company_role_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_commands" ADD CONSTRAINT "ofup_command_target_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_commands" ADD CONSTRAINT "ofup_command_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_cursor_keys" ADD CONSTRAINT "ofup_cursor_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_events" ADD CONSTRAINT "opportunity_follow_up_events_command_id_opportunity_follow_up_commands_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."opportunity_follow_up_commands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_events" ADD CONSTRAINT "ofup_event_history_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id","revision") REFERENCES "public"."opportunity_follow_up_history"("workspace_id","company_id","opportunity_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_events" ADD CONSTRAINT "ofup_event_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_heads" ADD CONSTRAINT "ofup_head_target_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_history" ADD CONSTRAINT "opportunity_follow_up_history_command_id_opportunity_follow_up_commands_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."opportunity_follow_up_commands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_follow_up_history" ADD CONSTRAINT "ofup_history_target_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ofup_command_actor_key" ON "opportunity_follow_up_commands" USING btree ("workspace_id","company_id","actor_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ofup_command_material_revision" ON "opportunity_follow_up_commands" USING btree ("workspace_id","company_id","opportunity_id","revision") WHERE "opportunity_follow_up_commands"."outcome"='updated';--> statement-breakpoint
CREATE INDEX "ofup_discovery_idx" ON "opportunity_follow_up_heads" USING btree ("workspace_id","company_id","follow_up_on","opportunity_id");--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_internal_task_manager', 'company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_contract_early_preparation', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_project_next_action_coordinator', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user', 'company_knowledge_source_administrator', 'company_knowledge_evidence_reader', 'company_invoice_reader', 'company_invoice_recorder', 'company_external_invoice_access', 'company_opportunity_follow_up_coordinator') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_internal_task_manager', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_project_next_action_coordinator', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user', 'company_knowledge_source_administrator', 'company_knowledge_evidence_reader', 'company_invoice_reader', 'company_invoice_recorder', 'company_external_invoice_access', 'company_opportunity_follow_up_coordinator')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
--> statement-breakpoint
-- Exact native attribution mirrors Access's existing captured member label.
CREATE FUNCTION ofup_member_reference(member uuid) RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE digits text:='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'; value numeric:=0; result text:=''; hex text:=replace(member::text,'-',''); i integer;
BEGIN
 FOR i IN 1..32 LOOP value:=value*16+strpos('0123456789abcdef',substring(hex,i,1))-1; END LOOP;
 WHILE value>0 LOOP result:=substring(digits,mod(value,36)::integer+1,1)||result;value:=div(value,36);END LOOP;
 RETURN CASE WHEN result='' THEN '0' ELSE result END;
END $$;
--> statement-breakpoint
-- Access-owned native command participant, shared by Access and the Date entry.
CREATE FUNCTION access_require_opportunity_follow_up_command(w uuid,c uuid,membership uuid,internal_user uuid,intake_assignment uuid,coordinator_assignment uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE context_found boolean:=false;
BEGIN
 -- Same Access lock participants: native intake, context, then Coordinator.
 PERFORM 1 FROM company_role_assignments a JOIN workspace_memberships m ON m.workspace_id=a.workspace_id AND m.id=a.workspace_membership_id JOIN internal_users u ON u.id=m.internal_user_id JOIN companies co ON co.workspace_id=a.workspace_id AND co.id=a.company_id
 WHERE a.id=intake_assignment AND a.workspace_id=w AND a.company_id=c AND a.workspace_membership_id=membership AND a.bundle::text='company_commercial_intake' AND a.permission_set_version IN ('v2','v3','v4') AND a.revoked_at IS NULL AND m.internal_user_id=internal_user AND m.status='active' AND u.status='active' AND co.status='active' FOR SHARE OF a,m,u,co;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ofup_native_authority',MESSAGE='Follow-up requires its exact live native capture.'; END IF;
 PERFORM 1 FROM workspace_permission_grants WHERE workspace_id=w AND workspace_membership_id=membership AND permission='company.manage' FOR SHARE;
 context_found:=FOUND;
 IF NOT context_found THEN
   PERFORM 1 FROM company_role_assignments WHERE workspace_id=w AND company_id=c AND workspace_membership_id=membership AND bundle::text IN ('company_document_registrar','company_context_access','company_director_client_access','company_project_access') AND revoked_at IS NULL FOR SHARE;
   context_found:=FOUND;
 END IF;
 IF NOT context_found THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ofup_native_authority',MESSAGE='Follow-up requires live independent Company context.'; END IF;
 PERFORM 1 FROM company_role_assignments WHERE id=coordinator_assignment AND workspace_id=w AND company_id=c AND workspace_membership_id=membership AND bundle::text='company_opportunity_follow_up_coordinator' AND permission_set_version='v1' AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ofup_native_authority',MESSAGE='Follow-up requires its exact live Coordinator capture.'; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION ofup_prepare_command() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE native opportunities%ROWTYPE; previous jsonb; result jsonb; epoch text; label text; stamp text; material boolean; target_request uuid;
BEGIN
 IF NEW.revision<>0 OR NEW.outcome<>'pending' OR NEW.response<>'{}'::jsonb OR NOT coalesce(
   ofup_keys(NEW.intent,ARRAY['format','workspaceId','companyId','actorMembershipId','opportunityId','body']) AND NEW.intent->>'format'='opportunity-follow-up.v1' AND NEW.intent->>'workspaceId'=NEW.workspace_id::text AND NEW.intent->>'companyId'=NEW.company_id::text AND NEW.intent->>'actorMembershipId'=NEW.actor_membership_id::text AND NEW.intent->>'opportunityId'=NEW.opportunity_id::text AND
   ofup_keys(NEW.intent->'body',ARRAY['expectedRevision','observedOpportunityVersion','followUpOn','reason']) AND ofup_revision(NEW.intent->'body'->'expectedRevision') AND ofup_revision(NEW.intent->'body'->'observedOpportunityVersion',1) AND ofup_date(NEW.intent->'body'->'followUpOn') AND ofup_reason(NEW.intent->'body'->'reason') AND length(btrim(NEW.idempotency_key))>0 AND NEW.idempotency_key=btrim(NEW.idempotency_key),false) THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ofup_native_intent',MESSAGE='Follow-up commands require an exact native intent, not invented effects.';
 END IF;
 PERFORM access_require_opportunity_follow_up_command(NEW.workspace_id,NEW.company_id,NEW.actor_membership_id,NEW.actor_internal_user_id,NEW.intake_assignment_id,NEW.assignment_id);
 -- Request before Opportunity, identical to the native outcome participant.
 SELECT client_request_id INTO target_request FROM opportunities WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.opportunity_id;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ofup_native_scope',MESSAGE='Follow-up target is unavailable.'; END IF;
 PERFORM 1 FROM client_requests WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=target_request FOR NO KEY UPDATE;
 SELECT * INTO native FROM opportunities WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.opportunity_id FOR NO KEY UPDATE;
 epoch:=commercial_follow_up_epoch(NEW.workspace_id,NEW.company_id,NEW.opportunity_id);
 SELECT fact INTO previous FROM opportunity_follow_up_heads WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND opportunity_id=NEW.opportunity_id FOR UPDATE;
 previous:=coalesce(previous,jsonb_build_object('state','UNRECORDED','revision',0));
 IF NOT ofup_fact_valid(previous) OR epoch IS NULL OR (NEW.intent->'body'->>'expectedRevision')::numeric<>(previous->>'revision')::numeric OR (NEW.intent->'body'->>'observedOpportunityVersion')::numeric<>native.version OR native.status<>'OPEN' THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ofup_native_observation',MESSAGE='Follow-up native observations are stale or unavailable.';
 END IF;
 material:=previous->>'state'='UNRECORDED' OR previous->'followUpOn' IS DISTINCT FROM NEW.intent->'body'->'followUpOn' OR previous->>'confirmedEpoch' IS DISTINCT FROM epoch;
 IF material THEN
   IF (previous->>'revision')::numeric>=9007199254740991 OR (previous->>'state'='RECORDED' AND NEW.intent->'body'->'reason'='null'::jsonb) THEN
     RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ofup_native_reason',MESSAGE='A later material follow-up requires its literal reason.';
   END IF;
   SELECT u.display_name||' · '||ofup_member_reference(m.id) INTO label FROM workspace_memberships m JOIN internal_users u ON u.id=m.internal_user_id WHERE m.workspace_id=NEW.workspace_id AND m.id=NEW.actor_membership_id;
   NEW.created_at:=date_trunc('milliseconds',clock_timestamp());
   stamp:=to_char(NEW.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
   result:=jsonb_build_object('state','RECORDED','revision',(previous->>'revision')::bigint+1,'followUpOn',NEW.intent->'body'->'followUpOn','confirmedEpoch',epoch,'recordedBy',jsonb_build_object('workspaceMembershipId',NEW.actor_membership_id,'displayLabel',label),'recordedAt',stamp);
 ELSE result:=previous;NEW.created_at:=date_trunc('milliseconds',clock_timestamp());
 END IF;
 NEW.revision:=(result->>'revision')::bigint;NEW.outcome:=CASE WHEN material THEN 'updated' ELSE 'unchanged' END;
 NEW.response:=jsonb_build_object('format','opportunity-follow-up.v1','opportunityId',NEW.opportunity_id,'outcome',NEW.outcome,'fact',result);
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ofup_command_prepare BEFORE INSERT ON opportunity_follow_up_commands FOR EACH ROW EXECUTE FUNCTION ofup_prepare_command();
--> statement-breakpoint
CREATE FUNCTION ofup_construct_effects() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE previous jsonb; entry jsonb; result jsonb:=NEW.response->'fact'; BEGIN
 IF NEW.outcome='unchanged' THEN RETURN NULL; END IF;
 SELECT fact INTO previous FROM opportunity_follow_up_heads WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND opportunity_id=NEW.opportunity_id;
 previous:=coalesce(previous,jsonb_build_object('state','UNRECORDED','revision',0));
 entry:=jsonb_build_object('format','opportunity-follow-up.v1','opportunityId',NEW.opportunity_id,'revision',NEW.revision,'before',previous,'after',result,'reason',NEW.intent->'body'->'reason','commandId',NEW.id,'actor',result->'recordedBy','occurredAt',result->'recordedAt');
 INSERT INTO opportunity_follow_up_history(workspace_id,company_id,opportunity_id,revision,command_id,fact) VALUES(NEW.workspace_id,NEW.company_id,NEW.opportunity_id,NEW.revision,NEW.id,entry);
 IF previous->>'state'='UNRECORDED' THEN
   INSERT INTO opportunity_follow_up_heads(workspace_id,company_id,opportunity_id,revision,follow_up_on,confirmed_epoch,fact) VALUES(NEW.workspace_id,NEW.company_id,NEW.opportunity_id,NEW.revision,result->>'followUpOn',result->>'confirmedEpoch',result);
 ELSE
   UPDATE opportunity_follow_up_heads SET revision=NEW.revision,follow_up_on=result->>'followUpOn',confirmed_epoch=result->>'confirmedEpoch',fact=result WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND opportunity_id=NEW.opportunity_id AND revision=NEW.revision-1;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ofup_native_head_transition',MESSAGE='Follow-up successor requires its exact previous head.'; END IF;
 END IF;
 INSERT INTO opportunity_follow_up_events(workspace_id,company_id,opportunity_id,revision,command_id,actor_membership_id,actor_internal_user_id,occurred_at,action,metadata) VALUES(NEW.workspace_id,NEW.company_id,NEW.opportunity_id,NEW.revision,NEW.id,NEW.actor_membership_id,NEW.actor_internal_user_id,NEW.created_at,'opportunity.follow_up.updated',jsonb_build_object('revision',NEW.revision));
 INSERT INTO opportunity_follow_up_cursor_keys(workspace_id,company_id) VALUES(NEW.workspace_id,NEW.company_id) ON CONFLICT DO NOTHING;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER ofup_command_effects AFTER INSERT ON opportunity_follow_up_commands FOR EACH ROW EXECUTE FUNCTION ofup_construct_effects();
--> statement-breakpoint
CREATE FUNCTION ofup_effect_path_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR pg_trigger_depth()<2 OR (TG_OP='UPDATE' AND TG_TABLE_NAME<>'opportunity_follow_up_heads') THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ofup_native_effect_path',MESSAGE='Follow-up effects require the validated native command path.';
 END IF;
 IF TG_TABLE_NAME='opportunity_follow_up_heads' THEN
   IF (TG_OP='INSERT' AND NEW.revision<>1) OR (TG_OP='UPDATE' AND ((NEW.workspace_id,NEW.company_id,NEW.opportunity_id) IS DISTINCT FROM (OLD.workspace_id,OLD.company_id,OLD.opportunity_id) OR NEW.revision<>OLD.revision+1)) THEN
     RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ofup_native_head_transition',MESSAGE='Follow-up heads require one immutable material successor.';
   END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ofup_head_path BEFORE INSERT OR UPDATE OR DELETE ON opportunity_follow_up_heads FOR EACH ROW EXECUTE FUNCTION ofup_effect_path_guard();
--> statement-breakpoint
CREATE TRIGGER ofup_history_path BEFORE INSERT OR UPDATE OR DELETE ON opportunity_follow_up_history FOR EACH ROW EXECUTE FUNCTION ofup_effect_path_guard();
--> statement-breakpoint
CREATE TRIGGER ofup_event_path BEFORE INSERT OR UPDATE OR DELETE ON opportunity_follow_up_events FOR EACH ROW EXECUTE FUNCTION ofup_effect_path_guard();
--> statement-breakpoint
CREATE TRIGGER ofup_cursor_key_path BEFORE INSERT OR UPDATE OR DELETE ON opportunity_follow_up_cursor_keys FOR EACH ROW EXECUTE FUNCTION ofup_effect_path_guard();
--> statement-breakpoint
CREATE FUNCTION ofup_command_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ofup_command_immutable',MESSAGE='Committed follow-up receipts are immutable.';
END $$;
--> statement-breakpoint
CREATE TRIGGER ofup_command_immutable BEFORE UPDATE OR DELETE ON opportunity_follow_up_commands FOR EACH ROW EXECUTE FUNCTION ofup_command_immutable_guard();
--> statement-breakpoint
CREATE FUNCTION ofup_coupling_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE head opportunity_follow_up_heads%ROWTYPE; h opportunity_follow_up_history%ROWTYPE; previous jsonb:=jsonb_build_object('state','UNRECORDED','revision',0); command opportunity_follow_up_commands%ROWTYPE;
BEGIN
 SELECT * INTO head FROM opportunity_follow_up_heads WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND opportunity_id=NEW.opportunity_id;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ofup_native_coupling',MESSAGE='Missing follow-up head.'; END IF;
 FOR h IN SELECT * FROM opportunity_follow_up_history WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND opportunity_id=NEW.opportunity_id ORDER BY revision LOOP
   SELECT * INTO command FROM opportunity_follow_up_commands WHERE id=h.command_id;
   IF NOT FOUND OR h.fact->'before' IS DISTINCT FROM previous OR h.revision<>(previous->>'revision')::bigint+1 OR command.outcome<>'updated' OR (command.workspace_id,command.company_id,command.opportunity_id,command.revision) IS DISTINCT FROM (h.workspace_id,h.company_id,h.opportunity_id,h.revision) OR command.response->'fact' IS DISTINCT FROM h.fact->'after' OR command.intent->'body'->'followUpOn' IS DISTINCT FROM h.fact->'after'->'followUpOn' OR command.intent->'body'->'reason' IS DISTINCT FROM h.fact->'reason' OR (command.intent->'body'->>'expectedRevision')::bigint<>h.revision-1 OR h.fact->'actor'->>'workspaceMembershipId'<>command.actor_membership_id::text OR (h.fact->>'occurredAt')::timestamptz<>command.created_at OR NOT EXISTS(SELECT 1 FROM opportunity_follow_up_events e WHERE e.command_id=command.id AND e.workspace_id=h.workspace_id AND e.company_id=h.company_id AND e.opportunity_id=h.opportunity_id AND e.revision=h.revision AND e.actor_membership_id=command.actor_membership_id AND e.actor_internal_user_id=command.actor_internal_user_id AND e.occurred_at=command.created_at AND e.metadata=jsonb_build_object('revision',h.revision)) THEN
     RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ofup_native_coupling',MESSAGE='Follow-up history requires its exact chain, intent, receipt and private event.';
   END IF;
   previous:=h.fact->'after';
 END LOOP;
 IF head.fact IS DISTINCT FROM previous OR head.revision<>(previous->>'revision')::bigint OR EXISTS(SELECT 1 FROM opportunity_follow_up_commands c LEFT JOIN opportunity_follow_up_history hist ON hist.command_id=c.id WHERE c.workspace_id=NEW.workspace_id AND c.company_id=NEW.company_id AND c.opportunity_id=NEW.opportunity_id AND c.outcome='updated' AND hist.command_id IS NULL) OR EXISTS(SELECT 1 FROM opportunity_follow_up_commands c WHERE c.workspace_id=NEW.workspace_id AND c.company_id=NEW.company_id AND c.opportunity_id=NEW.opportunity_id AND c.outcome='unchanged' AND (NOT EXISTS(SELECT 1 FROM opportunity_follow_up_history hist WHERE hist.workspace_id=c.workspace_id AND hist.company_id=c.company_id AND hist.opportunity_id=c.opportunity_id AND hist.revision=c.revision AND hist.fact->'after'=c.response->'fact') OR (c.intent->'body'->>'expectedRevision')::bigint<>c.revision OR c.intent->'body'->'followUpOn' IS DISTINCT FROM c.response->'fact'->'followUpOn')) THEN
   RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ofup_native_coupling',MESSAGE='Follow-up head and historical receipts must conserve the complete chain.';
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ofup_command_coupling AFTER INSERT ON opportunity_follow_up_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ofup_coupling_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ofup_head_coupling AFTER INSERT OR UPDATE ON opportunity_follow_up_heads DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ofup_coupling_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ofup_history_coupling AFTER INSERT ON opportunity_follow_up_history DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ofup_coupling_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ofup_event_coupling AFTER INSERT ON opportunity_follow_up_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ofup_coupling_guard();
