CREATE TABLE "contract_project_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"result_revision" integer NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"linked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "contract_project_links_revision_check" CHECK ("contract_project_links"."result_revision" BETWEEN 4 AND 53)
);
--> statement-breakpoint
ALTER TABLE "contract_commands" DROP CONSTRAINT "contract_commands_kind_check";--> statement-breakpoint
ALTER TABLE "contract_events" DROP CONSTRAINT "contract_events_target_check";--> statement-breakpoint
ALTER TABLE "contract_events" DROP CONSTRAINT "contract_events_metadata_check";--> statement-breakpoint
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_initial_check";--> statement-breakpoint
ALTER TABLE "contract_commands" ADD COLUMN "result_project_link_id" uuid;--> statement-breakpoint
ALTER TABLE "contract_project_links" ADD CONSTRAINT "contract_project_links_contract_fk" FOREIGN KEY ("workspace_id","company_id","contract_id") REFERENCES "public"."contracts"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_project_links" ADD CONSTRAINT "contract_project_links_project_fk" FOREIGN KEY ("workspace_id","company_id","project_id") REFERENCES "public"."projects"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_project_links" ADD CONSTRAINT "contract_project_links_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_project_links_pair_unique" ON "contract_project_links" USING btree ("workspace_id","company_id","contract_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_project_links_revision_unique" ON "contract_project_links" USING btree ("workspace_id","company_id","contract_id","result_revision");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_project_links_scope_unique" ON "contract_project_links" USING btree ("workspace_id","company_id","contract_id","id");--> statement-breakpoint
ALTER TABLE "contract_commands" ADD CONSTRAINT "contract_commands_project_link_fk" FOREIGN KEY ("workspace_id","company_id","result_contract_id","result_project_link_id") REFERENCES "public"."contract_project_links"("workspace_id","company_id","contract_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_commands" ADD CONSTRAINT "contract_commands_kind_check" CHECK ((((((("contract_commands"."kind" = 'CREATE' AND "contract_commands"."result_quality_run_id" IS NULL) OR ("contract_commands"."kind" = 'RUN_QUALITY_CHECKS' AND "contract_commands"."result_quality_run_id" IS NOT NULL)) AND "contract_commands"."result_decision_id" IS NULL OR ("contract_commands"."kind" IN ('APPROVE','REJECT') AND "contract_commands"."result_quality_run_id" IS NULL AND "contract_commands"."result_decision_id" IS NOT NULL)) AND "contract_commands"."result_signature_id" IS NULL) OR ("contract_commands"."kind" = 'RECORD_SIGNATURE' AND "contract_commands"."result_quality_run_id" IS NULL AND "contract_commands"."result_decision_id" IS NULL AND "contract_commands"."result_signature_id" IS NOT NULL)) AND "contract_commands"."result_project_link_id" IS NULL) OR ("contract_commands"."kind" = 'LINK_PROJECT' AND "contract_commands"."result_quality_run_id" IS NULL AND "contract_commands"."result_decision_id" IS NULL AND "contract_commands"."result_signature_id" IS NULL AND "contract_commands"."result_project_link_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_target_check" CHECK (("contract_events"."action" IN ('contract.created','contract_project.linked') AND "contract_events"."contract_version_id" IS NULL) OR ("contract_events"."action" IN ('contract_version.created','contract_version.approved','contract_version.rejected','contract_version.signature_recorded') AND "contract_events"."contract_version_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_metadata_check" CHECK ((jsonb_typeof("contract_events"."metadata") = 'object' AND "contract_events"."metadata"->>'contractId' = "contract_events"."contract_id"::text AND (("contract_events"."action" = 'contract_project.linked' AND ("contract_events"."metadata" - ARRAY['contractId','projectId','created']::text[]) = '{}'::jsonb AND "contract_events"."metadata"->'created' = 'false'::jsonb AND jsonb_typeof("contract_events"."metadata"->'projectId') = 'string') OR ("contract_events"."action" <> 'contract_project.linked' AND ("contract_events"."metadata" - ARRAY['contractId','contractVersionId','versionNumber','illustrativeReference','kind','origin','offerVersionId','pricingSnapshotId','provenance','ruleSetVersion','acknowledgedWarningCodes','evidenceKind']::text[]) = '{}'::jsonb AND "contract_events"."metadata"->>'kind' = 'CONTRACT' AND "contract_events"."metadata"->>'origin' = 'ACCEPTED_OFFER' AND "contract_events"."metadata"->>'provenance' = 'ILLUSTRATIVE' AND ("contract_events"."action" <> 'contract_version.signature_recorded' OR "contract_events"."metadata"->>'evidenceKind' = 'SIMULATED')))) IS TRUE);--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_initial_check" CHECK ("contracts"."kind" = 'CONTRACT' AND "contracts"."origin" = 'ACCEPTED_OFFER' AND "contracts"."revision" BETWEEN 1 AND 53 AND "contracts"."illustrative_reference" > 0);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_c4_contract_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Immutable Contract' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME = 'contracts' THEN
  IF OLD.revision NOT BETWEEN 1 AND 52 OR NEW.revision <> OLD.revision+1 OR (to_jsonb(OLD)-'revision') IS DISTINCT FROM (to_jsonb(NEW)-'revision') THEN RAISE EXCEPTION 'Immutable Contract content' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT ((OLD.decision_state='PENDING' AND NEW.decision_state IN ('APPROVED','REJECTED') AND OLD.execution_state='NOT_EXECUTED' AND NEW.execution_state='NOT_EXECUTED' AND (to_jsonb(OLD)-'decision_state') IS NOT DISTINCT FROM (to_jsonb(NEW)-'decision_state')) OR (OLD.decision_state='APPROVED' AND NEW.decision_state='APPROVED' AND OLD.execution_state='NOT_EXECUTED' AND NEW.execution_state='EXECUTED' AND (to_jsonb(OLD)-'execution_state') IS NOT DISTINCT FROM (to_jsonb(NEW)-'execution_state'))) THEN RAISE EXCEPTION 'Immutable Contract Version content' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_c5_signature_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s contract_signatures%ROWTYPE; d contract_decisions%ROWTYPE; v contract_versions%ROWTYPE; c contracts%ROWTYPE; r contract_quality_runs%ROWTYPE; warning_codes jsonb;
BEGIN
 IF TG_TABLE_NAME='contracts' THEN
  SELECT * INTO c FROM contracts WHERE id=NEW.id;
  SELECT * INTO v FROM contract_versions WHERE contract_id=c.id;
 ELSIF TG_TABLE_NAME='contract_versions' THEN
  SELECT * INTO v FROM contract_versions WHERE id=NEW.id;
  SELECT * INTO c FROM contracts WHERE id=v.contract_id;
 ELSE
  SELECT * INTO v FROM contract_versions WHERE id=NEW.contract_version_id;
  SELECT * INTO c FROM contracts WHERE id=v.contract_id;
 END IF;
 SELECT * INTO s FROM contract_signatures WHERE workspace_id=v.workspace_id AND company_id=v.company_id AND contract_version_id=v.id;
 IF v.execution_state='NOT_EXECUTED' THEN
  IF s.id IS NOT NULL OR c.revision>=3 THEN RAISE EXCEPTION 'Unexpected Contract signature' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 SELECT * INTO d FROM contract_decisions WHERE workspace_id=v.workspace_id AND company_id=v.company_id AND contract_id=v.contract_id AND contract_version_id=v.id AND kind='APPROVE';
 IF s.id IS NULL OR d.id IS NULL OR v.decision_state <> 'APPROVED' OR c.revision <> s.result_revision + (SELECT count(*) FROM contract_project_links WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id) OR s.representation_checksum <> d.representation_checksum OR s.recorded_at < d.decided_at OR s.provider_signed_on NOT BETWEEN (d.decided_at AT TIME ZONE 'UTC')::date AND (s.recorded_at AT TIME ZONE 'UTC')::date OR s.client_signed_on NOT BETWEEN (d.decided_at AT TIME ZONE 'UTC')::date AND (s.recorded_at AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'Invalid Contract execution evidence' USING ERRCODE='23514'; END IF;
 SELECT * INTO r FROM contract_quality_runs WHERE id=s.quality_run_id AND workspace_id=s.workspace_id AND company_id=s.company_id AND contract_id=s.contract_id AND contract_version_id=s.contract_version_id AND actor_workspace_membership_id=s.actor_workspace_membership_id AND actor_internal_user_id=s.actor_internal_user_id AND evaluated_at=s.recorded_at;
 SELECT coalesce(jsonb_agg(item->>'code' ORDER BY item->>'code'),'[]'::jsonb) INTO warning_codes FROM jsonb_array_elements(r.results) item WHERE item->>'status'='WARNING' AND NOT (d.acknowledged_warning_codes ? (item->>'code'));
 IF r.id IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.results) item WHERE item->>'status'='ERROR') OR s.acknowledged_warning_codes IS DISTINCT FROM warning_codes THEN RAISE EXCEPTION 'Invalid Contract signature checks' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM contract_commands WHERE result_signature_id=s.id AND workspace_id=s.workspace_id AND company_id=s.company_id AND result_contract_id=s.contract_id AND actor_workspace_membership_id=s.actor_workspace_membership_id AND kind='RECORD_SIGNATURE' AND opportunity_id=c.opportunity_id AND created_at=s.recorded_at) OR NOT EXISTS(SELECT 1 FROM contract_events WHERE contract_version_id=s.contract_version_id AND workspace_id=s.workspace_id AND company_id=s.company_id AND contract_id=s.contract_id AND actor_workspace_membership_id=s.actor_workspace_membership_id AND actor_internal_user_id=s.actor_internal_user_id AND occurred_at=s.recorded_at AND action='contract_version.signature_recorded' AND metadata->>'contractVersionId'=s.contract_version_id::text AND metadata->>'versionNumber'='1' AND metadata->>'ruleSetVersion'='1' AND metadata->'acknowledgedWarningCodes'=s.acknowledged_warning_codes AND metadata->>'evidenceKind'='SIMULATED') THEN RAISE EXCEPTION 'Incomplete Contract signature' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_c4_decision_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d contract_decisions%ROWTYPE; v contract_versions%ROWTYPE; c contracts%ROWTYPE; r contract_quality_runs%ROWTYPE; warning_codes jsonb;
BEGIN
 IF TG_TABLE_NAME = 'contracts' THEN
  SELECT * INTO c FROM contracts WHERE id=NEW.id;
  SELECT * INTO v FROM contract_versions WHERE contract_id=c.id;
 ELSIF TG_TABLE_NAME = 'contract_versions' THEN
  SELECT * INTO v FROM contract_versions WHERE id=NEW.id;
  SELECT * INTO c FROM contracts WHERE id=v.contract_id;
 ELSE
  SELECT * INTO v FROM contract_versions WHERE id=NEW.contract_version_id;
  SELECT * INTO c FROM contracts WHERE id=v.contract_id;
 END IF;
 IF c.id IS NULL OR v.id IS NULL THEN RAISE EXCEPTION 'Incomplete Contract version' USING ERRCODE='23514'; END IF;
 SELECT * INTO d FROM contract_decisions WHERE workspace_id=v.workspace_id AND company_id=v.company_id AND contract_version_id=v.id;
 IF v.decision_state='PENDING' THEN
  IF c.revision <> 1 OR d.id IS NOT NULL THEN RAISE EXCEPTION 'Invalid pending Contract decision' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 IF d.id IS NULL OR c.revision <> d.result_revision + (CASE WHEN v.execution_state='EXECUTED' THEN 1 + (SELECT count(*) FROM contract_project_links WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id) ELSE 0 END) OR v.decision_state <> (CASE d.kind WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END) THEN RAISE EXCEPTION 'Contract decision state mismatch' USING ERRCODE='23514'; END IF;
 IF d.kind='APPROVE' THEN
  SELECT * INTO r FROM contract_quality_runs WHERE id=d.quality_run_id AND workspace_id=d.workspace_id AND company_id=d.company_id AND contract_id=d.contract_id AND contract_version_id=d.contract_version_id AND actor_workspace_membership_id=d.actor_workspace_membership_id AND actor_internal_user_id=d.actor_internal_user_id AND evaluated_at=d.decided_at;
  SELECT coalesce(jsonb_agg(item->>'code' ORDER BY item->>'code'),'[]'::jsonb) INTO warning_codes FROM jsonb_array_elements(r.results) item WHERE item->>'status'='WARNING';
  IF r.id IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.results) item WHERE item->>'status'='ERROR') OR d.acknowledged_warning_codes IS DISTINCT FROM warning_codes THEN RAISE EXCEPTION 'Invalid Contract approval evidence' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM contract_commands WHERE result_decision_id=d.id AND workspace_id=d.workspace_id AND company_id=d.company_id AND result_contract_id=d.contract_id AND actor_workspace_membership_id=d.actor_workspace_membership_id AND kind=d.kind AND opportunity_id=c.opportunity_id AND created_at=d.decided_at) OR NOT EXISTS(SELECT 1 FROM contract_events WHERE contract_version_id=d.contract_version_id AND workspace_id=d.workspace_id AND company_id=d.company_id AND contract_id=d.contract_id AND actor_workspace_membership_id=d.actor_workspace_membership_id AND occurred_at=d.decided_at AND actor_internal_user_id=d.actor_internal_user_id AND metadata->>'contractVersionId'=d.contract_version_id::text AND metadata->>'versionNumber'='1' AND (d.kind='REJECT' AND NOT (metadata ?| ARRAY['ruleSetVersion','acknowledgedWarningCodes']) OR d.kind='APPROVE' AND metadata->>'ruleSetVersion'='1' AND metadata->'acknowledgedWarningCodes'=d.acknowledged_warning_codes) AND action=CASE d.kind WHEN 'APPROVE' THEN 'contract_version.approved' ELSE 'contract_version.rejected' END) THEN RAISE EXCEPTION 'Incomplete Contract decision' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;

--> statement-breakpoint

CREATE TRIGGER contract_project_links_immutable BEFORE UPDATE OR DELETE ON contract_project_links FOR EACH ROW EXECUTE FUNCTION guard_c1_immutable_record();
--> statement-breakpoint
CREATE UNIQUE INDEX "contract_events_project_link_unique" ON "contract_events" USING btree ("workspace_id","company_id","contract_id",("metadata"->>'projectId')) WHERE "contract_events"."action" = 'contract_project.linked';
--> statement-breakpoint
CREATE FUNCTION guard_cp1_project_link_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c contracts%ROWTYPE; v contract_versions%ROWTYPE; links integer;
BEGIN
 SELECT * INTO c FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.contract_id FOR UPDATE;
 SELECT * INTO v FROM contract_versions WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id;
 SELECT count(*) INTO links FROM contract_project_links WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id;
 IF c.id IS NULL OR c.kind<>'CONTRACT' OR v.execution_state<>'EXECUTED' OR links>=50 OR c.revision<>3+links OR NEW.result_revision<>c.revision+1 THEN RAISE EXCEPTION 'Invalid Contract Project link revision' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER contract_project_links_valid BEFORE INSERT ON contract_project_links FOR EACH ROW EXECUTE FUNCTION guard_cp1_project_link_insert();
--> statement-breakpoint
CREATE FUNCTION guard_cp1_project_link_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c contracts%ROWTYPE;
BEGIN
 SELECT * INTO c FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.contract_id;
 IF c.revision < NEW.result_revision OR NOT EXISTS(SELECT 1 FROM contract_commands WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND result_contract_id=NEW.contract_id AND result_project_link_id=NEW.id AND kind='LINK_PROJECT' AND opportunity_id=c.opportunity_id AND actor_workspace_membership_id=NEW.actor_workspace_membership_id AND created_at=NEW.linked_at) OR NOT EXISTS(SELECT 1 FROM contract_events WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND contract_id=NEW.contract_id AND action='contract_project.linked' AND actor_workspace_membership_id=NEW.actor_workspace_membership_id AND actor_internal_user_id=NEW.actor_internal_user_id AND occurred_at=NEW.linked_at AND metadata=jsonb_build_object('contractId',NEW.contract_id::text,'projectId',NEW.project_id::text,'created',false)) THEN RAISE EXCEPTION 'Incomplete Contract Project link' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contract_project_links_evidence AFTER INSERT ON contract_project_links DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_cp1_project_link_evidence();
