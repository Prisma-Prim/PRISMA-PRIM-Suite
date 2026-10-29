ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_mission_applicability_coordinator_assignment.granted' BEFORE 'company_document_content_reader_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_mission_applicability_approver_assignment.granted' BEFORE 'company_document_content_reader_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_mission_applicability_coordinator_assignment.revoked' BEFORE 'company_document_content_uploader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_mission_applicability_approver_assignment.revoked' BEFORE 'company_document_content_uploader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_mission_applicability_coordinator' BEFORE 'company_offer_model_editor';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_mission_applicability_approver' BEFORE 'company_offer_model_editor';--> statement-breakpoint
CREATE TABLE "mission_applicability_commands" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"command" text NOT NULL,
	"fact_id" uuid NOT NULL,
	"applicability_revision" integer NOT NULL,
	"action" text NOT NULL,
	CONSTRAINT "ma_commands_meaning_check" CHECK ("mission_applicability_commands"."action" IN ('recorded','unchanged') AND char_length("mission_applicability_commands"."idempotency_key") BETWEEN 1 AND 200 AND octet_length("mission_applicability_commands"."command") <= 50000 AND jsonb_typeof("mission_applicability_commands"."command"::jsonb)='object')
);
--> statement-breakpoint
CREATE TABLE "mission_applicability_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"fact_id" uuid NOT NULL,
	"applicability_revision" integer NOT NULL,
	"action" text NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "ma_events_metadata_check" CHECK ("mission_applicability_events"."metadata"=jsonb_build_object('applicabilityRevision',"mission_applicability_events"."applicability_revision"))
);
--> statement-breakpoint
CREATE TABLE "mission_applicability_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"client_account_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	"client_use_version" integer DEFAULT 0 NOT NULL,
	"revision" integer NOT NULL,
	"predecessor_id" uuid,
	"activity_predecessor_id" uuid,
	"task_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"activity_key" text NOT NULL,
	"source_title" text NOT NULL,
	"source_activity" text NOT NULL,
	"intended_result" text NOT NULL,
	"kind" text NOT NULL,
	"intent" jsonb NOT NULL,
	"task_title" text NOT NULL,
	"task_status" text NOT NULL,
	"task_version" integer NOT NULL,
	"result_revision" integer NOT NULL,
	"result_id" uuid,
	"lifecycle_revision" integer NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"assignment_id" uuid NOT NULL,
	"permission_set_version" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ma_facts_meaning_check" CHECK ("mission_applicability_facts"."revision" > 0 AND "mission_applicability_facts"."task_version" > 0 AND "mission_applicability_facts"."result_revision" >= 0 AND "mission_applicability_facts"."lifecycle_revision" >= 0 AND "mission_applicability_facts"."permission_set_version" = 'v1' AND jsonb_typeof("mission_applicability_facts"."intent") = 'object' AND ("mission_applicability_facts"."result_revision"=0) = ("mission_applicability_facts"."result_id" IS NULL) AND "mission_applicability_facts"."kind" IN ('PROPOSED','PROPOSAL_CORRECTED','APPROVED','REJECTED','RESTORED'))
);
--> statement-breakpoint
CREATE TABLE "mission_applicability_streams" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"fact_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
CREATE UNIQUE INDEX "ma_commands_actor_key_unique" ON "mission_applicability_commands" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ma_commands_recorded_fact_unique" ON "mission_applicability_commands" USING btree ("fact_id") WHERE "mission_applicability_commands"."action"='recorded';--> statement-breakpoint
CREATE UNIQUE INDEX "ma_events_fact_unique" ON "mission_applicability_events" USING btree ("fact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ma_facts_revision_unique" ON "mission_applicability_facts" USING btree ("workspace_id","company_id","project_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "ma_facts_scope_unique" ON "mission_applicability_facts" USING btree ("workspace_id","company_id","project_id","id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "ma_stream_project_unique" ON "mission_applicability_streams" USING btree ("workspace_id","company_id","project_id");--> statement-breakpoint
ALTER TABLE "mission_applicability_commands" ADD CONSTRAINT "ma_commands_fact_fk" FOREIGN KEY ("workspace_id","company_id","project_id","fact_id","applicability_revision") REFERENCES "public"."mission_applicability_facts"("workspace_id","company_id","project_id","id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_applicability_commands" ADD CONSTRAINT "ma_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_applicability_events" ADD CONSTRAINT "ma_events_fact_fk" FOREIGN KEY ("workspace_id","company_id","project_id","fact_id","applicability_revision") REFERENCES "public"."mission_applicability_facts"("workspace_id","company_id","project_id","id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_applicability_facts" ADD CONSTRAINT "mission_applicability_facts_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."company_role_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_applicability_facts" ADD CONSTRAINT "ma_facts_source_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."project_template_instances"("workspace_id","company_id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_applicability_facts" ADD CONSTRAINT "ma_facts_mapping_fk" FOREIGN KEY ("workspace_id","company_id","project_id","task_id","position") REFERENCES "public"."project_template_task_copies"("workspace_id","company_id","project_id","task_id","position") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_applicability_facts" ADD CONSTRAINT "ma_facts_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_applicability_facts" ADD CONSTRAINT "ma_facts_relationship_fk" FOREIGN KEY ("workspace_id","company_id","client_account_id","relationship_id") REFERENCES "public"."client_company_relationships"("workspace_id","company_id","client_account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_applicability_facts" ADD CONSTRAINT "ma_facts_result_fk" FOREIGN KEY ("workspace_id","company_id","task_id","result_id") REFERENCES "public"."task_result_declarations"("workspace_id","company_id","task_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_applicability_streams" ADD CONSTRAINT "ma_stream_fact_fk" FOREIGN KEY ("workspace_id","company_id","project_id","fact_id","revision") REFERENCES "public"."mission_applicability_facts"("workspace_id","company_id","project_id","id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_contract_early_preparation', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
--> statement-breakpoint
CREATE FUNCTION ma_keys(value jsonb, expected text[]) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(value)='object' AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(value) k)=(SELECT array_agg(k ORDER BY k) FROM unnest(expected) k)
$$;
--> statement-breakpoint
CREATE FUNCTION ma_literal(value jsonb, maximum integer) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_typeof(value)='string' AND char_length(value#>>'{}') BETWEEN 1 AND maximum
    AND value#>>'{}'=btrim(value#>>'{}', U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),false)
$$;
--> statement-breakpoint
CREATE FUNCTION ma_int(value jsonb, minimum integer) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_typeof(value)='number' AND value#>>'{}' ~ '^[0-9]+$' AND (value#>>'{}')::numeric BETWEEN minimum AND 2147483647,false)
$$;
--> statement-breakpoint
CREATE FUNCTION ma_valid_intent(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE base text[]:=ARRAY['action','taskId','expectedApplicabilityRevision','expectedTaskVersion','expectedResultRevision','expectedLifecycleRevision']; fields text[]; agreement jsonb;
BEGIN
  IF jsonb_typeof(value)<>'object' OR NOT ma_int(value->'expectedApplicabilityRevision',0) OR NOT ma_int(value->'expectedTaskVersion',1)
    OR NOT ma_int(value->'expectedResultRevision',0) OR NOT ma_int(value->'expectedLifecycleRevision',0) OR jsonb_typeof(value->'taskId')<>'string' THEN RETURN false; END IF;
  CASE value->>'action'
    WHEN 'PROPOSE' THEN fields:=ARRAY['reason','scopeBasis','agreement'];
    WHEN 'CORRECT_PROPOSAL' THEN fields:=ARRAY['reason','scopeBasis','agreement','proposalId','correctionReason'];
    WHEN 'DECIDE' THEN fields:=ARRAY['proposalId','outcome','basis'];
    WHEN 'RESTORE' THEN fields:=ARRAY['approvalId','basis'];
    ELSE RETURN false;
  END CASE;
  IF NOT ma_keys(value,base||fields) THEN RETURN false; END IF;
  IF value->>'action' IN ('PROPOSE','CORRECT_PROPOSAL') THEN
    IF NOT ma_literal(value->'reason',1000) OR NOT ma_literal(value->'scopeBasis',2000) THEN RETURN false; END IF;
    agreement:=value->'agreement';
    CASE agreement->>'kind'
      WHEN 'NO_CONTRACTUAL_CHANGE_REPORTED','PARTIES_AGREEMENT_UNAVAILABLE' THEN
        IF NOT ma_keys(agreement,ARRAY['kind','basis']) OR NOT ma_literal(agreement->'basis',2000) THEN RETURN false; END IF;
      WHEN 'PARTIES_AGREEMENT_REPORTED' THEN
        IF NOT ma_keys(agreement,ARRAY['kind','reference']) OR NOT ma_literal(agreement->'reference',2000) THEN RETURN false; END IF;
      ELSE RETURN false;
    END CASE;
  ELSE
    IF NOT ma_literal(value->'basis',2000) THEN RETURN false; END IF;
  END IF;
  IF value->>'action'='CORRECT_PROPOSAL' AND (NOT ma_literal(value->'correctionReason',500) OR jsonb_typeof(value->'proposalId')<>'string') THEN RETURN false; END IF;
  IF value->>'action'='DECIDE' AND (NOT coalesce(value->>'outcome' IN ('APPROVE','REJECT'),false) OR jsonb_typeof(value->'proposalId')<>'string') THEN RETURN false; END IF;
  IF value->>'action'='RESTORE' AND jsonb_typeof(value->'approvalId')<>'string' THEN RETURN false; END IF;
  RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION ma_reject_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable applicability fact' USING ERRCODE='23514'; END $$;
--> statement-breakpoint
CREATE TRIGGER ma_facts_immutable BEFORE UPDATE OR DELETE ON mission_applicability_facts FOR EACH ROW EXECUTE FUNCTION ma_reject_rewrite();
--> statement-breakpoint
CREATE TRIGGER ma_commands_immutable BEFORE UPDATE OR DELETE ON mission_applicability_commands FOR EACH ROW EXECUTE FUNCTION ma_reject_rewrite();
--> statement-breakpoint
CREATE TRIGGER ma_events_immutable BEFORE UPDATE OR DELETE ON mission_applicability_events FOR EACH ROW EXECUTE FUNCTION ma_reject_rewrite();
--> statement-breakpoint
CREATE FUNCTION ma_fact_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p projects%ROWTYPE; t tasks%ROWTYPE; prior mission_applicability_facts%ROWTYPE; activity_prior mission_applicability_facts%ROWTYPE;
  instance project_template_instances%ROWTYPE; criterion jsonb; expected_kind text; required_bundle text; current_result task_result_declarations%ROWTYPE; original_client_version integer;
BEGIN
  IF NOT ma_valid_intent(NEW.intent) THEN RAISE EXCEPTION 'Invalid applicability intent' USING ERRCODE='23514'; END IF;
  expected_kind:=CASE NEW.intent->>'action' WHEN 'PROPOSE' THEN 'PROPOSED' WHEN 'CORRECT_PROPOSAL' THEN 'PROPOSAL_CORRECTED'
    WHEN 'RESTORE' THEN 'RESTORED' WHEN 'DECIDE' THEN CASE NEW.intent->>'outcome' WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END END;
  required_bundle:=CASE WHEN expected_kind IN ('PROPOSED','PROPOSAL_CORRECTED') THEN 'company_mission_applicability_coordinator' ELSE 'company_mission_applicability_approver' END;
  IF NEW.kind<>expected_kind OR NEW.intent->>'taskId'<>NEW.task_id::text OR (NEW.intent->>'expectedApplicabilityRevision')::integer<>NEW.revision-1
    OR (NEW.intent->>'expectedTaskVersion')::integer<>NEW.task_version OR (NEW.intent->>'expectedResultRevision')::integer<>NEW.result_revision
    OR (NEW.intent->>'expectedLifecycleRevision')::integer<>NEW.lifecycle_revision THEN RAISE EXCEPTION 'Applicability observation mismatch' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM workspaces WHERE id=NEW.workspace_id FOR KEY SHARE;
  IF NOT EXISTS (SELECT 1 FROM workspace_memberships m JOIN internal_users u ON u.id=m.internal_user_id
    WHERE m.workspace_id=NEW.workspace_id AND m.id=NEW.actor_membership_id AND u.id=NEW.actor_internal_user_id AND u.display_name=NEW.actor_display_name AND m.status='active' AND u.status='active' FOR SHARE OF m,u)
    OR NOT EXISTS (SELECT 1 FROM companies WHERE id=NEW.company_id AND workspace_id=NEW.workspace_id AND status='active' FOR SHARE) THEN RAISE EXCEPTION 'Inactive applicability parent' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM company_role_assignments a WHERE a.id=NEW.assignment_id AND a.workspace_id=NEW.workspace_id AND a.company_id=NEW.company_id
    AND a.workspace_membership_id=NEW.actor_membership_id AND a.bundle::text=required_bundle AND a.permission_set_version='v1' AND a.revoked_at IS NULL FOR SHARE)
    THEN RAISE EXCEPTION 'Invalid applicability capture' USING ERRCODE='23514'; END IF;
  SELECT version INTO original_client_version FROM client_accounts WHERE id=NEW.client_account_id AND workspace_id=NEW.workspace_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inactive original Client' USING ERRCODE='23514'; END IF;
  NEW.client_use_version:=original_client_version;
  PERFORM 1 FROM client_company_relationships WHERE id=NEW.relationship_id AND workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND client_account_id=NEW.client_account_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid original relationship' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT p FROM projects WHERE id=NEW.project_id AND workspace_id=NEW.workspace_id AND company_id=NEW.company_id FOR SHARE;
  IF p.client_account_id<>NEW.client_account_id OR p.status IN ('completed','cancelled') OR p.lifecycle_revision<>NEW.lifecycle_revision THEN RAISE EXCEPTION 'Invalid applicability Project' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT t FROM tasks WHERE id=NEW.task_id AND workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND project_id=NEW.project_id FOR SHARE;
  IF t.version<>NEW.task_version OR t.status<>NEW.task_status OR t.title<>NEW.task_title OR t.client_account_id<>NEW.client_account_id THEN RAISE EXCEPTION 'Invalid applicability Task' USING ERRCODE='23514'; END IF;
  SELECT * INTO current_result FROM task_result_declarations WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND task_id=NEW.task_id ORDER BY revision DESC LIMIT 1;
  IF current_result.id IS DISTINCT FROM NEW.result_id OR coalesce(current_result.revision,0)<>NEW.result_revision THEN RAISE EXCEPTION 'Invalid applicability result' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT instance FROM project_template_instances WHERE project_id=NEW.project_id AND workspace_id=NEW.workspace_id AND company_id=NEW.company_id;
  IF instance.client_account_id<>NEW.client_account_id OR instance.snapshot->>'templateKey'<>'CONSULTING_MISSION_PILOT_ILLUSTRATIVE' OR instance.snapshot->>'version'<>'1'
    OR jsonb_array_length(instance.snapshot->'activities')<>13 OR (SELECT count(*) FROM project_template_task_copies WHERE project_id=NEW.project_id)<>13 THEN RAISE EXCEPTION 'Invalid applicability source' USING ERRCODE='23514'; END IF;
  criterion:=instance.snapshot->'activities'->NEW.position;
  IF criterion->>'key' IS DISTINCT FROM NEW.activity_key OR criterion->>'title' IS DISTINCT FROM NEW.source_title OR criterion->>'activity' IS DISTINCT FROM NEW.source_activity
    OR criterion->>'intendedResult' IS DISTINCT FROM NEW.intended_result OR NEW.activity_key<>'CT_AN'||lpad((NEW.position+1)::text,2,'0') THEN RAISE EXCEPTION 'Invalid preserved criterion' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(array_to_json(ARRAY['mission.applicability.stream',NEW.workspace_id::text,NEW.company_id::text,NEW.project_id::text])::text,0));
  SELECT * INTO prior FROM mission_applicability_facts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND project_id=NEW.project_id ORDER BY revision DESC LIMIT 1;
  IF NEW.revision::bigint<>coalesce(prior.revision,0)::bigint+1 OR NEW.predecessor_id IS DISTINCT FROM prior.id THEN RAISE EXCEPTION 'Invalid applicability stream predecessor' USING ERRCODE='23514'; END IF;
  SELECT * INTO activity_prior FROM mission_applicability_facts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND project_id=NEW.project_id AND task_id=NEW.task_id ORDER BY revision DESC LIMIT 1;
  IF NEW.activity_predecessor_id IS DISTINCT FROM activity_prior.id THEN RAISE EXCEPTION 'Invalid activity predecessor' USING ERRCODE='23514'; END IF;
  CASE NEW.kind
    WHEN 'PROPOSED' THEN IF activity_prior.id IS NOT NULL AND activity_prior.kind NOT IN ('REJECTED','RESTORED') THEN RAISE EXCEPTION 'Unresolved applicability predecessor' USING ERRCODE='23514'; END IF;
    WHEN 'PROPOSAL_CORRECTED','APPROVED','REJECTED' THEN
      IF activity_prior.id IS NULL OR activity_prior.kind NOT IN ('PROPOSED','PROPOSAL_CORRECTED') OR NEW.intent->>'proposalId' IS DISTINCT FROM activity_prior.id::text THEN RAISE EXCEPTION 'Invalid exact pending proposal' USING ERRCODE='23514'; END IF;
      IF NEW.kind='APPROVED' AND activity_prior.intent->'agreement'->>'kind'='PARTIES_AGREEMENT_UNAVAILABLE' THEN RAISE EXCEPTION 'Reported agreement unavailable' USING ERRCODE='23514'; END IF;
    WHEN 'RESTORED' THEN IF activity_prior.kind IS DISTINCT FROM 'APPROVED' OR NEW.intent->>'approvalId' IS DISTINCT FROM activity_prior.id::text THEN RAISE EXCEPTION 'Invalid active approval' USING ERRCODE='23514'; END IF;
    ELSE RAISE EXCEPTION 'Invalid applicability kind' USING ERRCODE='23514';
  END CASE;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ma_fact_guard BEFORE INSERT ON mission_applicability_facts FOR EACH ROW EXECUTE FUNCTION ma_fact_guard();
--> statement-breakpoint
CREATE FUNCTION ma_coupled_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f mission_applicability_facts%ROWTYPE; action text; intent jsonb; candidate uuid; required_bundle text;
BEGIN
  SELECT * INTO STRICT f FROM mission_applicability_facts WHERE id=NEW.fact_id;
  IF TG_TABLE_NAME='mission_applicability_events' THEN
    IF NEW.actor_membership_id<>f.actor_membership_id THEN RAISE EXCEPTION 'Applicability audit actor mismatch' USING ERRCODE='23514'; END IF;
    action:=CASE f.kind WHEN 'PROPOSED' THEN 'proposed' WHEN 'PROPOSAL_CORRECTED' THEN 'proposal_corrected' WHEN 'APPROVED' THEN 'approved' WHEN 'REJECTED' THEN 'rejected' WHEN 'RESTORED' THEN 'restored' END;
    IF NEW.actor_internal_user_id<>f.actor_internal_user_id OR NEW.occurred_at<>f.occurred_at OR NEW.action<>'project.mission_applicability.'||action THEN RAISE EXCEPTION 'Invalid applicability event' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW.actor_membership_id<>f.actor_membership_id AND (NEW.action<>'unchanged' OR NEW.command::jsonb->>'action' IS DISTINCT FROM 'CORRECT_PROPOSAL') THEN
      RAISE EXCEPTION 'Applicability audit actor mismatch' USING ERRCODE='23514';
    END IF;
    IF NEW.command::jsonb->>'companyId' IS DISTINCT FROM f.company_id::text OR NEW.command::jsonb->>'projectId' IS DISTINCT FROM f.project_id::text
      OR NOT ma_valid_intent(NEW.command::jsonb-'companyId'-'projectId') THEN RAISE EXCEPTION 'Invalid applicability command' USING ERRCODE='23514'; END IF;
    IF NEW.action='recorded' AND NEW.command::jsonb-'companyId'-'projectId' IS DISTINCT FROM f.intent THEN RAISE EXCEPTION 'Applicability receipt intent mismatch' USING ERRCODE='23514'; END IF;
    IF NEW.action='unchanged' THEN
      intent:=NEW.command::jsonb-'companyId'-'projectId';
      required_bundle:=CASE WHEN intent->>'action' IN ('PROPOSE','CORRECT_PROPOSAL') THEN 'company_mission_applicability_coordinator' ELSE 'company_mission_applicability_approver' END;
      IF intent->>'taskId' IS DISTINCT FROM f.task_id::text
        OR (intent->>'expectedApplicabilityRevision')::integer IS DISTINCT FROM (SELECT revision FROM mission_applicability_streams WHERE project_id=f.project_id)
        OR NOT EXISTS (SELECT 1 FROM projects p JOIN client_accounts c ON c.id=p.client_account_id WHERE p.id=f.project_id AND p.workspace_id=f.workspace_id AND p.company_id=f.company_id AND p.status NOT IN ('completed','cancelled') AND c.status='active' AND p.lifecycle_revision=(intent->>'expectedLifecycleRevision')::integer)
        OR (intent->>'expectedTaskVersion')::integer IS DISTINCT FROM (SELECT version FROM tasks WHERE id=f.task_id)
        OR (intent->>'expectedResultRevision')::integer IS DISTINCT FROM (SELECT coalesce(max(revision),0) FROM task_result_declarations WHERE task_id=f.task_id)
        OR NOT EXISTS (SELECT 1 FROM company_role_assignments a WHERE a.workspace_id=f.workspace_id AND a.company_id=f.company_id AND a.workspace_membership_id=NEW.actor_membership_id AND a.bundle::text=required_bundle AND a.permission_set_version='v1' AND a.revoked_at IS NULL) THEN RAISE EXCEPTION 'Invalid current unchanged applicability intent' USING ERRCODE='23514'; END IF;
      CASE intent->>'action'
        WHEN 'PROPOSE','CORRECT_PROPOSAL' THEN
          SELECT id INTO candidate FROM mission_applicability_facts WHERE project_id=f.project_id AND task_id=f.task_id ORDER BY revision DESC LIMIT 1;
          IF candidate IS DISTINCT FROM f.id OR f.kind NOT IN ('PROPOSED','PROPOSAL_CORRECTED') OR intent->'reason' IS DISTINCT FROM f.intent->'reason' OR intent->'scopeBasis' IS DISTINCT FROM f.intent->'scopeBasis' OR intent->'agreement' IS DISTINCT FROM f.intent->'agreement'
            OR (intent->>'action'='CORRECT_PROPOSAL' AND intent->>'proposalId' IS DISTINCT FROM f.id::text) THEN RAISE EXCEPTION 'Invalid unchanged proposal' USING ERRCODE='23514'; END IF;
        WHEN 'DECIDE' THEN
          SELECT id INTO candidate FROM mission_applicability_facts WHERE project_id=f.project_id AND task_id=f.task_id AND kind IN ('APPROVED','REJECTED') ORDER BY revision DESC LIMIT 1;
          IF candidate IS DISTINCT FROM f.id OR intent->'proposalId' IS DISTINCT FROM f.intent->'proposalId' OR intent->'outcome' IS DISTINCT FROM f.intent->'outcome' OR intent->'basis' IS DISTINCT FROM f.intent->'basis' THEN RAISE EXCEPTION 'Invalid unchanged decision' USING ERRCODE='23514'; END IF;
        WHEN 'RESTORE' THEN
          SELECT id INTO candidate FROM mission_applicability_facts WHERE project_id=f.project_id AND task_id=f.task_id AND kind='RESTORED' ORDER BY revision DESC LIMIT 1;
          IF candidate IS DISTINCT FROM f.id OR intent->'approvalId' IS DISTINCT FROM f.intent->'approvalId' OR intent->'basis' IS DISTINCT FROM f.intent->'basis' THEN RAISE EXCEPTION 'Invalid unchanged restoration' USING ERRCODE='23514'; END IF;
        ELSE RAISE EXCEPTION 'Invalid unchanged applicability action' USING ERRCODE='23514';
      END CASE;
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ma_event_guard BEFORE INSERT ON mission_applicability_events FOR EACH ROW EXECUTE FUNCTION ma_coupled_guard();
--> statement-breakpoint
CREATE TRIGGER ma_command_guard BEFORE INSERT ON mission_applicability_commands FOR EACH ROW EXECUTE FUNCTION ma_coupled_guard();
--> statement-breakpoint
CREATE FUNCTION ma_stream_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Immutable applicability stream' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (NEW.workspace_id<>OLD.workspace_id OR NEW.company_id<>OLD.company_id OR NEW.project_id<>OLD.project_id OR NEW.revision::bigint<>OLD.revision::bigint+1) THEN RAISE EXCEPTION 'Invalid applicability stream advance' USING ERRCODE='23514'; END IF;
  IF NEW.revision<>(SELECT max(revision) FROM mission_applicability_facts WHERE project_id=NEW.project_id) OR (TG_OP='INSERT' AND NEW.revision<>1) THEN RAISE EXCEPTION 'Invalid applicability stream head' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ma_stream_guard BEFORE INSERT OR UPDATE OR DELETE ON mission_applicability_streams FOR EACH ROW EXECUTE FUNCTION ma_stream_guard();
--> statement-breakpoint
CREATE FUNCTION ma_fact_seal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM mission_applicability_streams s JOIN mission_applicability_facts f ON f.id=s.fact_id WHERE s.project_id=NEW.project_id AND s.revision=f.revision AND s.revision=(SELECT max(revision) FROM mission_applicability_facts WHERE project_id=NEW.project_id))
    OR NOT EXISTS (SELECT 1 FROM client_accounts c WHERE c.workspace_id=NEW.workspace_id AND c.id=NEW.client_account_id AND c.version>NEW.client_use_version)
    OR (SELECT count(*) FROM mission_applicability_events WHERE fact_id=NEW.id)<>1 OR (SELECT count(*) FROM mission_applicability_commands WHERE fact_id=NEW.id AND action='recorded')<>1 THEN
    RAISE EXCEPTION 'Incomplete applicability transaction' USING ERRCODE='23514',CONSTRAINT='ma_fact_seal';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ma_fact_seal AFTER INSERT ON mission_applicability_facts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ma_fact_seal();
