CREATE FUNCTION pna_text_valid(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT value IS NULL OR (
    char_length(value) BETWEEN 1 AND 500 AND
    value=btrim(value,chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))
  );
$$;
--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_project_next_action_coordinator_assignment.granted' BEFORE 'company_mission_applicability_coordinator_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_project_next_action_coordinator_assignment.revoked' BEFORE 'company_mission_applicability_coordinator_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_project_next_action_coordinator' BEFORE 'company_mission_applicability_coordinator';--> statement-breakpoint
CREATE TABLE "project_next_action_commands" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"original_client_account_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"revision" integer NOT NULL,
	"client_use_version" integer NOT NULL,
	"outcome" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pna_command_revision_check" CHECK ("project_next_action_commands"."revision">=0 AND "project_next_action_commands"."outcome" IN ('changed','unchanged') AND ("project_next_action_commands"."outcome"<>'changed' OR "project_next_action_commands"."revision">0)),
	CONSTRAINT "pna_command_key_check" CHECK (length("project_next_action_commands"."idempotency_key")>0),
	CONSTRAINT "pna_command_client_use_check" CHECK ("project_next_action_commands"."client_use_version">=0)
);
--> statement-breakpoint
CREATE TABLE "project_next_action_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"action" text NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "pna_event_check" CHECK ("project_next_action_events"."action"='project.next_action.updated' AND "project_next_action_events"."metadata"=jsonb_build_object('revision',"project_next_action_events"."revision"))
);
--> statement-breakpoint
CREATE TABLE "project_next_action_heads" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"original_client_account_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"revision" integer NOT NULL,
	"text" text,
	CONSTRAINT "pna_head_revision_check" CHECK ("project_next_action_heads"."revision">0),
	CONSTRAINT "pna_head_text_bound" CHECK (pna_text_valid("project_next_action_heads"."text")),
	CONSTRAINT "pna_head_timestamp_check" CHECK (date_trunc('milliseconds',"project_next_action_heads"."occurred_at")="project_next_action_heads"."occurred_at")
);
--> statement-breakpoint
CREATE TABLE "project_next_action_history" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"original_client_account_id" uuid NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision" integer NOT NULL,
	"predecessor_revision" integer NOT NULL,
	"before_text" text,
	"text" text,
	"lifecycle_revision" integer NOT NULL,
	"client_use_version" integer NOT NULL,
	"assignment_id" uuid NOT NULL,
	CONSTRAINT "pna_history_scope_revision_unique" UNIQUE("workspace_id","company_id","project_id","revision"),
	CONSTRAINT "pna_history_revision_check" CHECK ("project_next_action_history"."revision">0 AND "project_next_action_history"."predecessor_revision"="project_next_action_history"."revision"-1 AND "project_next_action_history"."lifecycle_revision">=0 AND "project_next_action_history"."client_use_version">0),
	CONSTRAINT "pna_history_material_check" CHECK ("project_next_action_history"."before_text" IS DISTINCT FROM "project_next_action_history"."text"),
	CONSTRAINT "pna_history_text_bound" CHECK (pna_text_valid("project_next_action_history"."text") AND pna_text_valid("project_next_action_history"."before_text")),
	CONSTRAINT "pna_history_timestamp_check" CHECK (date_trunc('milliseconds',"project_next_action_history"."occurred_at")="project_next_action_history"."occurred_at")
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "project_next_action_commands" ADD CONSTRAINT "project_next_action_commands_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."company_role_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_next_action_commands" ADD CONSTRAINT "pna_command_project_fk" FOREIGN KEY ("workspace_id","company_id","original_client_account_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","client_account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_next_action_commands" ADD CONSTRAINT "pna_command_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_next_action_events" ADD CONSTRAINT "pna_event_history_fk" FOREIGN KEY ("workspace_id","company_id","project_id","revision") REFERENCES "public"."project_next_action_history"("workspace_id","company_id","project_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_next_action_events" ADD CONSTRAINT "pna_event_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_next_action_heads" ADD CONSTRAINT "pna_head_project_fk" FOREIGN KEY ("workspace_id","company_id","original_client_account_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","client_account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_next_action_heads" ADD CONSTRAINT "pna_head_history_fk" FOREIGN KEY ("workspace_id","company_id","project_id","revision") REFERENCES "public"."project_next_action_history"("workspace_id","company_id","project_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_next_action_heads" ADD CONSTRAINT "pna_head_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_next_action_history" ADD CONSTRAINT "project_next_action_history_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."company_role_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_next_action_history" ADD CONSTRAINT "pna_history_project_fk" FOREIGN KEY ("workspace_id","company_id","original_client_account_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","client_account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_next_action_history" ADD CONSTRAINT "pna_history_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pna_command_actor_key_unique" ON "project_next_action_commands" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "pna_command_material_revision_unique" ON "project_next_action_commands" USING btree ("workspace_id","company_id","project_id","revision") WHERE "project_next_action_commands"."outcome"='changed';--> statement-breakpoint
CREATE UNIQUE INDEX "pna_event_revision_unique" ON "project_next_action_events" USING btree ("workspace_id","company_id","project_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "pna_head_project_unique" ON "project_next_action_heads" USING btree ("project_id");--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_contract_early_preparation', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_project_next_action_coordinator', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_project_next_action_coordinator', 'company_mission_applicability_coordinator', 'company_mission_applicability_approver', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver', 'company_mission_plan_configuration', 'company_mission_plan_user')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
--> statement-breakpoint
CREATE FUNCTION pna_record_json(p_workspace uuid,p_company uuid,p_project uuid,p_client uuid,p_revision integer,p_text text,p_user uuid,p_member uuid,p_name text,p_time timestamptz)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('format','project-next-action-v1','workspaceId',p_workspace,'companyId',p_company,'projectId',p_project,'originalClientAccountId',p_client,'revision',p_revision,'text',p_text,
    'lastChange',CASE WHEN p_revision=0 THEN NULL ELSE jsonb_build_object('internalUserId',p_user,'workspaceMembershipId',p_member,'displayName',p_name,'occurredAt',to_char(p_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) END);
$$;
--> statement-breakpoint
CREATE FUNCTION pna_write_context_valid(p_workspace uuid,p_company uuid,p_project uuid,p_client uuid,p_user uuid,p_member uuid,p_assignment uuid,p_lifecycle integer,p_client_use integer)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    JOIN companies co ON co.workspace_id=p.workspace_id AND co.id=p.company_id AND co.status='active'
    JOIN client_accounts c ON c.workspace_id=p.workspace_id AND c.id=p.client_account_id AND c.status='active'
    JOIN client_company_relationships r ON r.workspace_id=p.workspace_id AND r.company_id=p.company_id AND r.client_account_id=c.id AND r.status='active'
    JOIN company_role_assignments a ON a.workspace_id=p.workspace_id AND a.company_id=p.company_id AND a.id=p_assignment AND a.workspace_membership_id=p_member
    JOIN workspace_memberships m ON m.workspace_id=a.workspace_id AND m.id=a.workspace_membership_id AND m.internal_user_id=p_user AND m.status='active'
    JOIN internal_users u ON u.id=m.internal_user_id AND u.status='active'
    WHERE p.workspace_id=p_workspace AND p.company_id=p_company AND p.id=p_project AND p.client_account_id=p_client
      AND p.status IN ('preparatory','active','on_hold') AND p.lifecycle_revision=p_lifecycle AND c.version=p_client_use
      AND a.bundle::text='company_project_next_action_coordinator' AND a.permission_set_version='v1' AND a.revoked_at IS NULL
  );
$$;
--> statement-breakpoint
CREATE FUNCTION pna_head_transition_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='pna_head_transition',MESSAGE='Project next-action head cannot be deleted.';
  END IF;
  IF (TG_OP='INSERT' AND NEW.revision<>1) OR
     (TG_OP='UPDATE' AND ((NEW.workspace_id,NEW.company_id,NEW.project_id,NEW.original_client_account_id) IS DISTINCT FROM (OLD.workspace_id,OLD.company_id,OLD.project_id,OLD.original_client_account_id) OR NEW.revision::bigint<>OLD.revision::bigint+1)) THEN
    RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='pna_head_transition',MESSAGE='Project next-action head requires one material successor.';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION pna_history_fence_step_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_version integer;
BEGIN
  -- Capture the locked original Client before the material use is recorded.
  -- The deferred coupling guard then requires this exact successor to exist.
  SELECT version INTO previous_version FROM client_accounts
    WHERE workspace_id=NEW.workspace_id AND id=NEW.original_client_account_id FOR UPDATE;
  IF FOUND AND NEW.client_use_version::bigint<>previous_version::bigint+1 THEN
    RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='pna_history_fence_step',MESSAGE='A material next action requires exactly one original Client fence advance.';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER pna_history_fence_step BEFORE INSERT ON project_next_action_history FOR EACH ROW EXECUTE FUNCTION pna_history_fence_step_guard();
--> statement-breakpoint
CREATE TRIGGER pna_head_transition BEFORE INSERT OR UPDATE OR DELETE ON project_next_action_heads FOR EACH ROW EXECUTE FUNCTION pna_head_transition_guard();
--> statement-breakpoint
CREATE FUNCTION pna_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT=TG_TABLE_NAME||'_immutable',MESSAGE='Project next-action facts are immutable.';
END $$;
--> statement-breakpoint
CREATE TRIGGER pna_history_immutable BEFORE UPDATE OR DELETE ON project_next_action_history FOR EACH ROW EXECUTE FUNCTION pna_immutable_guard();
--> statement-breakpoint
CREATE TRIGGER pna_commands_immutable BEFORE UPDATE OR DELETE ON project_next_action_commands FOR EACH ROW EXECUTE FUNCTION pna_immutable_guard();
--> statement-breakpoint
CREATE TRIGGER pna_events_immutable BEFORE UPDATE OR DELETE ON project_next_action_events FOR EACH ROW EXECUTE FUNCTION pna_immutable_guard();
--> statement-breakpoint
CREATE FUNCTION pna_head_commit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h project_next_action_history%ROWTYPE;
BEGIN
  SELECT * INTO h FROM project_next_action_history WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND project_id=NEW.project_id AND revision=NEW.revision;
  IF NOT FOUND OR
    pna_record_json(NEW.workspace_id,NEW.company_id,NEW.project_id,NEW.original_client_account_id,NEW.revision,NEW.text,NEW.actor_internal_user_id,NEW.actor_membership_id,NEW.actor_display_name,NEW.occurred_at)
    IS DISTINCT FROM pna_record_json(h.workspace_id,h.company_id,h.project_id,h.original_client_account_id,h.revision,h.text,h.actor_internal_user_id,h.actor_membership_id,h.actor_display_name,h.occurred_at)
    OR EXISTS(SELECT 1 FROM project_next_action_history WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND project_id=NEW.project_id AND revision>NEW.revision) THEN
    RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='pna_head_coupling',MESSAGE='Project next-action head/history must agree.';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER pna_head_coupling AFTER INSERT OR UPDATE ON project_next_action_heads DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pna_head_commit_guard();
--> statement-breakpoint
CREATE FUNCTION pna_history_commit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_text text; expected_record jsonb;
BEGIN
  IF NEW.revision=1 THEN previous_text:=NULL;
  ELSE
    SELECT text INTO previous_text FROM project_next_action_history WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND project_id=NEW.project_id AND revision=NEW.predecessor_revision;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='pna_history_coupling',MESSAGE='Missing next-action predecessor.'; END IF;
  END IF;
  expected_record:=pna_record_json(NEW.workspace_id,NEW.company_id,NEW.project_id,NEW.original_client_account_id,NEW.revision,NEW.text,NEW.actor_internal_user_id,NEW.actor_membership_id,NEW.actor_display_name,NEW.occurred_at);
  IF previous_text IS DISTINCT FROM NEW.before_text OR
    NOT pna_write_context_valid(NEW.workspace_id,NEW.company_id,NEW.project_id,NEW.original_client_account_id,NEW.actor_internal_user_id,NEW.actor_membership_id,NEW.assignment_id,NEW.lifecycle_revision,NEW.client_use_version) OR
    NOT EXISTS(SELECT 1 FROM project_next_action_heads h WHERE h.workspace_id=NEW.workspace_id AND h.company_id=NEW.company_id AND h.project_id=NEW.project_id AND h.revision=NEW.revision AND pna_record_json(h.workspace_id,h.company_id,h.project_id,h.original_client_account_id,h.revision,h.text,h.actor_internal_user_id,h.actor_membership_id,h.actor_display_name,h.occurred_at)=expected_record) OR
    NOT EXISTS(SELECT 1 FROM project_next_action_commands c WHERE c.workspace_id=NEW.workspace_id AND c.company_id=NEW.company_id AND c.project_id=NEW.project_id AND c.revision=NEW.revision AND c.outcome='changed' AND c.actor_internal_user_id=NEW.actor_internal_user_id AND c.actor_membership_id=NEW.actor_membership_id AND c.assignment_id=NEW.assignment_id AND c.client_use_version=NEW.client_use_version AND c.created_at=NEW.occurred_at AND c.response=jsonb_build_object('format','project-next-action-command-v1','outcome','changed','record',expected_record)) OR
    NOT EXISTS(SELECT 1 FROM project_next_action_events e WHERE e.workspace_id=NEW.workspace_id AND e.company_id=NEW.company_id AND e.project_id=NEW.project_id AND e.revision=NEW.revision AND e.actor_internal_user_id=NEW.actor_internal_user_id AND e.actor_membership_id=NEW.actor_membership_id AND e.occurred_at=NEW.occurred_at AND e.action='project.next_action.updated' AND e.metadata=jsonb_build_object('revision',NEW.revision)) THEN
    RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='pna_history_coupling',MESSAGE='Next-action fact requires its exact head, receipt, event and Client fence.';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER pna_history_coupling AFTER INSERT ON project_next_action_history DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pna_history_commit_guard();
--> statement-breakpoint
CREATE FUNCTION pna_command_commit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE intent jsonb; expected_record jsonb; h project_next_action_history%ROWTYPE; expected_revision bigint; expected_lifecycle bigint;
BEGIN
  BEGIN intent:=NEW.fingerprint::jsonb;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='pna_command_coupling',MESSAGE='Invalid next-action fingerprint.'; END;
  IF jsonb_typeof(intent)<>'object' OR jsonb_typeof(intent->'expectedRevision')<>'number' OR jsonb_typeof(intent->'expectedLifecycleRevision')<>'number' OR (intent->>'expectedRevision') !~ '^(0|[1-9][0-9]*)$' OR (intent->>'expectedLifecycleRevision') !~ '^(0|[1-9][0-9]*)$' OR jsonb_typeof(intent->'text') NOT IN ('string','null') THEN
    RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='pna_command_coupling',MESSAGE='Invalid next-action normalized intent.';
  END IF;
  expected_revision:=(intent->>'expectedRevision')::bigint;
  expected_lifecycle:=(intent->>'expectedLifecycleRevision')::bigint;
  IF expected_revision>2147483647 OR expected_lifecycle>2147483647 OR NOT pna_text_valid(intent->>'text') OR
    intent<>jsonb_build_object('format','project-next-action-command-v1','companyId',NEW.company_id,'projectId',NEW.project_id,'expectedRevision',expected_revision,'expectedLifecycleRevision',expected_lifecycle,'text',intent->'text') OR
    NOT pna_write_context_valid(NEW.workspace_id,NEW.company_id,NEW.project_id,NEW.original_client_account_id,NEW.actor_internal_user_id,NEW.actor_membership_id,NEW.assignment_id,expected_lifecycle::integer,NEW.client_use_version) THEN
    RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='pna_command_coupling',MESSAGE='Next-action intent or live scoped facts disagree.';
  END IF;
  IF NEW.revision=0 THEN
    IF NEW.outcome<>'unchanged' OR expected_revision<>0 OR intent->'text'<>'null'::jsonb OR EXISTS(SELECT 1 FROM project_next_action_heads WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND project_id=NEW.project_id) THEN
      RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='pna_command_coupling',MESSAGE='Invalid never-recorded next-action receipt.';
    END IF;
    expected_record:=pna_record_json(NEW.workspace_id,NEW.company_id,NEW.project_id,NEW.original_client_account_id,0,NULL,NULL,NULL,NULL,NULL);
  ELSE
    SELECT * INTO h FROM project_next_action_history WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND project_id=NEW.project_id AND revision=NEW.revision;
    IF NOT FOUND OR h.text IS DISTINCT FROM (intent->>'text') OR
      NOT EXISTS(SELECT 1 FROM project_next_action_heads WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND project_id=NEW.project_id AND revision=NEW.revision) OR
      (NEW.outcome='changed' AND (expected_revision<>h.predecessor_revision OR h.actor_internal_user_id<>NEW.actor_internal_user_id OR h.actor_membership_id<>NEW.actor_membership_id OR h.assignment_id<>NEW.assignment_id OR h.occurred_at<>NEW.created_at OR h.lifecycle_revision<>expected_lifecycle OR h.client_use_version<>NEW.client_use_version)) OR
      (NEW.outcome='unchanged' AND expected_revision<>h.revision) THEN
      RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='pna_command_coupling',MESSAGE='Next-action command does not match its exact result.';
    END IF;
    expected_record:=pna_record_json(h.workspace_id,h.company_id,h.project_id,h.original_client_account_id,h.revision,h.text,h.actor_internal_user_id,h.actor_membership_id,h.actor_display_name,h.occurred_at);
  END IF;
  IF NEW.response<>jsonb_build_object('format','project-next-action-command-v1','outcome',NEW.outcome,'record',expected_record) THEN
    RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='pna_command_coupling',MESSAGE='Next-action saved response must be exact.';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER pna_command_coupling AFTER INSERT ON project_next_action_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pna_command_commit_guard();
--> statement-breakpoint
CREATE FUNCTION pna_event_commit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM project_next_action_history h WHERE h.workspace_id=NEW.workspace_id AND h.company_id=NEW.company_id AND h.project_id=NEW.project_id AND h.revision=NEW.revision AND h.actor_internal_user_id=NEW.actor_internal_user_id AND h.actor_membership_id=NEW.actor_membership_id AND h.occurred_at=NEW.occurred_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='pna_event_coupling',MESSAGE='Next-action event attribution must match its fact.';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER pna_event_coupling AFTER INSERT ON project_next_action_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pna_event_commit_guard();
