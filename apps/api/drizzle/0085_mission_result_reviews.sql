ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_mission_result_reviewer_assignment.granted' BEFORE 'company_document_content_reader_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_mission_result_reviewer_assignment.revoked' BEFORE 'company_document_content_uploader_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_mission_result_reviewer' BEFORE 'company_offer_model_editor';--> statement-breakpoint
CREATE TABLE "mission_result_review_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"predecessor_id" uuid,
	"previous_revision" integer,
	"outcome" text NOT NULL,
	"basis" text NOT NULL,
	"signature" text NOT NULL,
	"selected_count" integer NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_display_name" text NOT NULL,
	"reviewer_assignment_id" uuid NOT NULL,
	"reviewer_permission_set_version" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mr_review_batches_meaning_check" CHECK ("mission_result_review_batches"."revision" >= 1 AND "mission_result_review_batches"."selected_count" BETWEEN 1 AND 13 AND "mission_result_review_batches"."outcome" IN ('ACCEPTED_BY_REVIEWER','NEEDS_WORK') AND "mission_result_review_batches"."reviewer_permission_set_version" = 'v1' AND char_length("mission_result_review_batches"."basis") BETWEEN 1 AND 2000 AND "mission_result_review_batches"."basis" = btrim("mission_result_review_batches"."basis") AND char_length("mission_result_review_batches"."signature") <= 50000 AND jsonb_typeof("mission_result_review_batches"."signature"::jsonb) = 'object' AND (("mission_result_review_batches"."revision" = 1 AND "mission_result_review_batches"."predecessor_id" IS NULL AND "mission_result_review_batches"."previous_revision" IS NULL) OR ("mission_result_review_batches"."revision" > 1 AND "mission_result_review_batches"."predecessor_id" IS NOT NULL AND "mission_result_review_batches"."previous_revision" IS NOT NULL AND "mission_result_review_batches"."previous_revision" = "mission_result_review_batches"."revision" - 1)))
);
--> statement-breakpoint
CREATE TABLE "mission_result_review_commands" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"command" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"review_revision" integer NOT NULL,
	"action" text NOT NULL,
	CONSTRAINT "mr_review_commands_meaning_check" CHECK ("mission_result_review_commands"."action" IN ('recorded','unchanged') AND char_length("mission_result_review_commands"."idempotency_key") BETWEEN 1 AND 200 AND char_length("mission_result_review_commands"."command") <= 50000 AND jsonb_typeof("mission_result_review_commands"."command"::jsonb)='object')
);
--> statement-breakpoint
CREATE TABLE "mission_result_review_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"review_revision" integer NOT NULL,
	"action" text NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "mr_review_events_meaning_check" CHECK ("mission_result_review_events"."action"='project.mission_result.reviewed' AND "mission_result_review_events"."metadata" = jsonb_build_object('revision',"mission_result_review_events"."review_revision"))
);
--> statement-breakpoint
CREATE TABLE "mission_result_review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"review_revision" integer NOT NULL,
	"task_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"task_version" integer NOT NULL,
	"task_title" text NOT NULL,
	"result_revision" integer NOT NULL,
	"predecessor_id" uuid,
	"evidence_kind" text NOT NULL,
	"result_id" uuid,
	"external_reference" text,
	CONSTRAINT "mr_review_items_meaning_check" CHECK ("mission_result_review_items"."position" BETWEEN 0 AND 12 AND "mission_result_review_items"."task_version" >= 1 AND "mission_result_review_items"."result_revision" >= 0 AND char_length("mission_result_review_items"."task_title") >= 1 AND (("mission_result_review_items"."evidence_kind"='DECLARED_RESULT' AND "mission_result_review_items"."result_id" IS NOT NULL AND "mission_result_review_items"."result_revision" >= 1 AND "mission_result_review_items"."external_reference" IS NULL) OR ("mission_result_review_items"."evidence_kind"='EXTERNAL_REPORTED' AND "mission_result_review_items"."result_id" IS NULL AND "mission_result_review_items"."external_reference" IS NOT NULL AND char_length("mission_result_review_items"."external_reference") BETWEEN 1 AND 1000 AND "mission_result_review_items"."external_reference" = btrim("mission_result_review_items"."external_reference"))))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mr_review_batches_revision_unique" ON "mission_result_review_batches" USING btree ("workspace_id","company_id","project_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "mr_review_batches_scope_unique" ON "mission_result_review_batches" USING btree ("workspace_id","company_id","project_id","id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "mr_review_commands_actor_key_unique" ON "mission_result_review_commands" USING btree ("workspace_id","actor_membership_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "mission_review_recorded_receipt_unique" ON "mission_result_review_commands" USING btree ("batch_id") WHERE "mission_result_review_commands"."action"='recorded';--> statement-breakpoint
CREATE UNIQUE INDEX "mr_review_events_batch_unique" ON "mission_result_review_events" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mr_review_items_batch_task_unique" ON "mission_result_review_items" USING btree ("batch_id","task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mr_review_items_batch_position_unique" ON "mission_result_review_items" USING btree ("batch_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "mr_review_items_predecessor_scope_unique" ON "mission_result_review_items" USING btree ("workspace_id","company_id","project_id","task_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_template_task_copies_review_scope_unique" ON "project_template_task_copies" USING btree ("workspace_id","company_id","project_id","task_id","position");--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "mission_result_review_batches" ADD CONSTRAINT "mission_result_review_batches_reviewer_assignment_id_company_role_assignments_id_fk" FOREIGN KEY ("reviewer_assignment_id") REFERENCES "public"."company_role_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_result_review_batches" ADD CONSTRAINT "mr_review_batches_source_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."project_template_instances"("workspace_id","company_id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_result_review_batches" ADD CONSTRAINT "mr_review_batches_predecessor_fk" FOREIGN KEY ("workspace_id","company_id","project_id","predecessor_id","previous_revision") REFERENCES "public"."mission_result_review_batches"("workspace_id","company_id","project_id","id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_result_review_batches" ADD CONSTRAINT "mr_review_batches_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_result_review_commands" ADD CONSTRAINT "mr_review_commands_batch_fk" FOREIGN KEY ("workspace_id","company_id","project_id","batch_id","review_revision") REFERENCES "public"."mission_result_review_batches"("workspace_id","company_id","project_id","id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_result_review_commands" ADD CONSTRAINT "mr_review_commands_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id") REFERENCES "public"."workspace_memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_result_review_events" ADD CONSTRAINT "mr_review_events_batch_fk" FOREIGN KEY ("workspace_id","company_id","project_id","batch_id","review_revision") REFERENCES "public"."mission_result_review_batches"("workspace_id","company_id","project_id","id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_result_review_events" ADD CONSTRAINT "mr_review_events_actor_fk" FOREIGN KEY ("workspace_id","actor_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_result_review_items" ADD CONSTRAINT "mr_review_items_batch_fk" FOREIGN KEY ("workspace_id","company_id","project_id","batch_id","review_revision") REFERENCES "public"."mission_result_review_batches"("workspace_id","company_id","project_id","id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_result_review_items" ADD CONSTRAINT "mr_review_items_copy_fk" FOREIGN KEY ("workspace_id","company_id","project_id","task_id","position") REFERENCES "public"."project_template_task_copies"("workspace_id","company_id","project_id","task_id","position") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_result_review_items" ADD CONSTRAINT "mr_review_items_result_fk" FOREIGN KEY ("workspace_id","company_id","task_id","result_id") REFERENCES "public"."task_result_declarations"("workspace_id","company_id","task_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_result_review_items" ADD CONSTRAINT "mr_review_items_predecessor_fk" FOREIGN KEY ("workspace_id","company_id","project_id","task_id","predecessor_id") REFERENCES "public"."mission_result_review_items"("workspace_id","company_id","project_id","task_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_contract_early_preparation', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_early_preparation', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader', 'company_project_template_user', 'company_project_stage_advancer', 'company_project_template_configuration', 'company_ideas_reader', 'company_ideas_recorder', 'company_ideas_reviewer', 'company_operational_risk_reader', 'company_operational_risk_recorder', 'company_task_result_recorder', 'company_mission_result_reviewer', 'company_mission_deliverable_access', 'company_contract_signature_declarer', 'company_received_contract_access', 'company_offer_model_editor', 'company_offer_model_approver', 'company_contract_model_editor', 'company_contract_model_approver')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));
--> statement-breakpoint
-- Keep observed history immutable without constraining legitimate future Task changes.
CREATE FUNCTION mission_review_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Mission reviews are immutable' USING ERRCODE='23514', CONSTRAINT='mission_review_immutable';
END $$;
--> statement-breakpoint
CREATE TRIGGER mission_review_batches_immutable BEFORE UPDATE OR DELETE ON mission_result_review_batches FOR EACH ROW EXECUTE FUNCTION mission_review_immutable();
--> statement-breakpoint
CREATE TRIGGER mission_review_items_immutable BEFORE UPDATE OR DELETE ON mission_result_review_items FOR EACH ROW EXECUTE FUNCTION mission_review_immutable();
--> statement-breakpoint
CREATE TRIGGER mission_review_commands_immutable BEFORE UPDATE OR DELETE ON mission_result_review_commands FOR EACH ROW EXECUTE FUNCTION mission_review_immutable();
--> statement-breakpoint
CREATE TRIGGER mission_review_events_immutable BEFORE UPDATE OR DELETE ON mission_result_review_events FOR EACH ROW EXECUTE FUNCTION mission_review_immutable();
--> statement-breakpoint
CREATE FUNCTION mission_review_batch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p projects%ROWTYPE; prior_id uuid; prior_revision integer;
BEGIN
  PERFORM 1 FROM workspaces WHERE id=NEW.workspace_id FOR KEY SHARE;
  IF NOT EXISTS (SELECT 1 FROM workspace_memberships m JOIN internal_users u ON u.id=m.internal_user_id
    WHERE m.workspace_id=NEW.workspace_id AND m.id=NEW.actor_membership_id AND m.internal_user_id=NEW.actor_internal_user_id
      AND m.status='active' AND u.status='active' FOR SHARE OF m,u) THEN
    RAISE EXCEPTION 'Inactive review actor' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM company_role_assignments a WHERE a.id=NEW.reviewer_assignment_id
    AND a.workspace_id=NEW.workspace_id AND a.company_id=NEW.company_id AND a.workspace_membership_id=NEW.actor_membership_id
    AND a.bundle::text='company_mission_result_reviewer' AND a.permission_set_version='v1' AND a.revoked_at IS NULL FOR SHARE) THEN
    RAISE EXCEPTION 'Invalid captured mission reviewer' USING ERRCODE='23514';
  END IF;
  SELECT * INTO STRICT p FROM projects WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.project_id;
  PERFORM 1 FROM client_accounts WHERE workspace_id=NEW.workspace_id AND id=p.client_account_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inactive original Client' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM client_company_relationships WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id
    AND client_account_id=p.client_account_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inactive original Client relationship' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT p FROM projects WHERE id=NEW.project_id FOR SHARE;
  IF p.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Closed Project' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM project_template_instances i WHERE i.project_id=NEW.project_id
    AND i.snapshot->>'templateKey'='CONSULTING_MISSION_PILOT_ILLUSTRATIVE' AND i.snapshot->>'version'='1'
    AND jsonb_array_length(i.snapshot->'activities')=13)
    OR (SELECT count(*) FROM project_template_task_copies WHERE project_id=NEW.project_id)<>13 THEN
    RAISE EXCEPTION 'Unsupported mission review source' USING ERRCODE='23514';
  END IF;
  SELECT id,revision INTO prior_id,prior_revision FROM mission_result_review_batches
    WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND project_id=NEW.project_id ORDER BY revision DESC LIMIT 1;
  IF NEW.revision<>coalesce(prior_revision,0)+1 OR NEW.predecessor_id IS DISTINCT FROM prior_id THEN
    RAISE EXCEPTION 'Invalid review stream predecessor' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mission_review_batch_guard BEFORE INSERT ON mission_result_review_batches FOR EACH ROW EXECUTE FUNCTION mission_review_batch_guard();
--> statement-breakpoint
CREATE FUNCTION mission_review_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t tasks%ROWTYPE; prior_id uuid; result_id uuid; result_revision integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM mission_result_review_batches b WHERE b.id=NEW.batch_id
    AND b.xmin::text=(txid_current() % 4294967296)::text) THEN
    RAISE EXCEPTION 'Cannot append items to sealed review history' USING ERRCODE='23514';
  END IF;
  SELECT * INTO STRICT t FROM tasks WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND project_id=NEW.project_id AND id=NEW.task_id FOR UPDATE;
  SELECT id,revision INTO result_id,result_revision FROM task_result_declarations
    WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND task_id=NEW.task_id ORDER BY revision DESC LIMIT 1;
  SELECT id INTO prior_id FROM mission_result_review_items WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id
    AND project_id=NEW.project_id AND task_id=NEW.task_id ORDER BY review_revision DESC LIMIT 1;
  IF t.status<>'done' OR t.version<>NEW.task_version OR t.title<>NEW.task_title OR NEW.result_revision<>coalesce(result_revision,0)
    OR (NEW.evidence_kind='DECLARED_RESULT' AND NEW.result_id IS DISTINCT FROM result_id)
    OR NEW.predecessor_id IS DISTINCT FROM prior_id THEN
    RAISE EXCEPTION 'Stale or invalid mission review item' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mission_review_item_guard BEFORE INSERT ON mission_result_review_items FOR EACH ROW EXECUTE FUNCTION mission_review_item_guard();
--> statement-breakpoint
CREATE FUNCTION mission_review_coupled_fact_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b mission_result_review_batches%ROWTYPE;
BEGIN
  SELECT * INTO STRICT b FROM mission_result_review_batches WHERE id=NEW.batch_id;
  IF NEW.actor_membership_id<>b.actor_membership_id THEN RAISE EXCEPTION 'Review fact actor mismatch' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='mission_result_review_events' THEN
    IF NEW.actor_internal_user_id<>b.actor_internal_user_id OR NEW.occurred_at<>b.occurred_at THEN
      RAISE EXCEPTION 'Review event attribution mismatch' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NEW.command::jsonb->>'companyId' IS DISTINCT FROM b.company_id::text
      OR NEW.command::jsonb->>'projectId' IS DISTINCT FROM b.project_id::text
      OR (NEW.command::jsonb - 'companyId' - 'projectId' - 'expectedReviewRevision') IS DISTINCT FROM b.signature::jsonb
      OR (NEW.command::jsonb->>'expectedReviewRevision')::integer IS DISTINCT FROM
        (CASE WHEN NEW.action='recorded' THEN b.revision-1 ELSE b.revision END) THEN
      RAISE EXCEPTION 'Review receipt intent mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mission_review_event_guard BEFORE INSERT ON mission_result_review_events FOR EACH ROW EXECUTE FUNCTION mission_review_coupled_fact_guard();
--> statement-breakpoint
CREATE TRIGGER mission_review_command_guard BEFORE INSERT ON mission_result_review_commands FOR EACH ROW EXECUTE FUNCTION mission_review_coupled_fact_guard();
--> statement-breakpoint
CREATE FUNCTION mission_review_batch_seal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item_count integer; intent jsonb;
BEGIN
  SELECT count(*), jsonb_build_object('outcome',NEW.outcome,'basis',NEW.basis,'items',jsonb_agg(jsonb_build_object(
    'taskId',i.task_id,'expectedTaskVersion',i.task_version,'expectedResultRevision',i.result_revision,
    'evidence',CASE WHEN i.evidence_kind='DECLARED_RESULT' THEN jsonb_build_object('kind',i.evidence_kind,'resultId',i.result_id)
      ELSE jsonb_build_object('kind',i.evidence_kind,'reference',i.external_reference) END) ORDER BY i.position))
    INTO item_count,intent FROM mission_result_review_items i WHERE i.batch_id=NEW.id;
  IF item_count<>NEW.selected_count OR intent IS DISTINCT FROM NEW.signature::jsonb
    OR (SELECT count(*) FROM mission_result_review_events WHERE batch_id=NEW.id)<>1
    OR (SELECT count(*) FROM mission_result_review_commands WHERE batch_id=NEW.id AND action='recorded')<>1 THEN
    RAISE EXCEPTION 'Incomplete mission review transaction' USING ERRCODE='23514', CONSTRAINT='mission_review_batch_seal';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER mission_review_batch_seal AFTER INSERT ON mission_result_review_batches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mission_review_batch_seal();

--> statement-breakpoint
