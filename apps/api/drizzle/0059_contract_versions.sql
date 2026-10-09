ALTER TABLE "contract_commands" DROP CONSTRAINT "contract_commands_kind_check";--> statement-breakpoint
ALTER TABLE "contract_decisions" DROP CONSTRAINT "contract_decisions_result_check";--> statement-breakpoint
ALTER TABLE "contract_events" DROP CONSTRAINT "contract_events_metadata_check";--> statement-breakpoint
ALTER TABLE "contract_project_links" DROP CONSTRAINT "contract_project_links_revision_check";--> statement-breakpoint
ALTER TABLE "contract_signatures" DROP CONSTRAINT "contract_signatures_evidence_check";--> statement-breakpoint
ALTER TABLE "contract_versions" DROP CONSTRAINT "contract_versions_initial_check";--> statement-breakpoint
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_initial_check";--> statement-breakpoint
ALTER TABLE "contract_commands" ADD COLUMN "result_version_id" uuid;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD COLUMN "created_contract_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD COLUMN "predecessor_version_id" uuid;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD COLUMN "superseded_by_version_id" uuid;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contract_commands" ADD CONSTRAINT "contract_commands_version_fk" FOREIGN KEY ("workspace_id","company_id","result_contract_id","result_version_id") REFERENCES "public"."contract_versions"("workspace_id","company_id","contract_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_predecessor_fk" FOREIGN KEY ("workspace_id","company_id","contract_id","predecessor_version_id") REFERENCES "public"."contract_versions"("workspace_id","company_id","contract_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_successor_fk" FOREIGN KEY ("workspace_id","company_id","contract_id","superseded_by_version_id") REFERENCES "public"."contract_versions"("workspace_id","company_id","contract_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_versions_predecessor_unique" ON "contract_versions" USING btree ("workspace_id","company_id","contract_id","predecessor_version_id");--> statement-breakpoint
ALTER TABLE "contract_commands" ADD CONSTRAINT "contract_commands_kind_check" CHECK ((((((((("contract_commands"."kind" = 'CREATE' AND "contract_commands"."result_quality_run_id" IS NULL) OR ("contract_commands"."kind" = 'RUN_QUALITY_CHECKS' AND "contract_commands"."result_quality_run_id" IS NOT NULL)) AND "contract_commands"."result_decision_id" IS NULL OR ("contract_commands"."kind" IN ('APPROVE','REJECT') AND "contract_commands"."result_quality_run_id" IS NULL AND "contract_commands"."result_decision_id" IS NOT NULL)) AND "contract_commands"."result_signature_id" IS NULL) OR ("contract_commands"."kind" = 'RECORD_SIGNATURE' AND "contract_commands"."result_quality_run_id" IS NULL AND "contract_commands"."result_decision_id" IS NULL AND "contract_commands"."result_signature_id" IS NOT NULL)) AND "contract_commands"."result_project_link_id" IS NULL) OR ("contract_commands"."kind" IN ('LINK_PROJECT','CREATE_PROJECT') AND "contract_commands"."result_quality_run_id" IS NULL AND "contract_commands"."result_decision_id" IS NULL AND "contract_commands"."result_signature_id" IS NULL AND "contract_commands"."result_project_link_id" IS NOT NULL)) AND "contract_commands"."result_version_id" IS NULL) OR ("contract_commands"."kind"='CREATE_VERSION' AND "contract_commands"."result_version_id" IS NOT NULL AND "contract_commands"."result_quality_run_id" IS NULL AND "contract_commands"."result_decision_id" IS NULL AND "contract_commands"."result_signature_id" IS NULL AND "contract_commands"."result_project_link_id" IS NULL));--> statement-breakpoint
ALTER TABLE "contract_decisions" ADD CONSTRAINT "contract_decisions_result_check" CHECK ("contract_decisions"."result_revision" > 1 AND (("contract_decisions"."kind" = 'APPROVE' AND "contract_decisions"."reason" IS NULL AND "contract_decisions"."quality_run_id" IS NOT NULL AND "contract_decisions"."representation_checksum" ~ '^[0-9a-f]{64}$' AND jsonb_typeof("contract_decisions"."acknowledged_warning_codes") = 'array') OR ("contract_decisions"."kind" = 'REJECT' AND char_length("contract_decisions"."reason") BETWEEN 1 AND 500 AND btrim("contract_decisions"."reason") <> '' AND "contract_decisions"."quality_run_id" IS NULL AND "contract_decisions"."representation_checksum" IS NULL AND "contract_decisions"."acknowledged_warning_codes" IS NULL)) IS TRUE);--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_metadata_check" CHECK ((jsonb_typeof("contract_events"."metadata") = 'object' AND "contract_events"."metadata"->>'contractId' = "contract_events"."contract_id"::text AND (("contract_events"."action" = 'contract_project.linked' AND ("contract_events"."metadata" - ARRAY['contractId','projectId','created']::text[]) = '{}'::jsonb AND "contract_events"."metadata"->'created' IN ('false'::jsonb,'true'::jsonb) AND jsonb_typeof("contract_events"."metadata"->'projectId') = 'string') OR ("contract_events"."action" <> 'contract_project.linked' AND ("contract_events"."metadata" - ARRAY['contractId','contractVersionId','versionNumber','predecessorVersionNumber','illustrativeReference','kind','origin','offerVersionId','pricingSnapshotId','provenance','ruleSetVersion','acknowledgedWarningCodes','evidenceKind']::text[]) = '{}'::jsonb AND "contract_events"."metadata"->>'kind' = 'CONTRACT' AND "contract_events"."metadata"->>'origin' = 'ACCEPTED_OFFER' AND "contract_events"."metadata"->>'provenance' = 'ILLUSTRATIVE' AND ("contract_events"."action" <> 'contract_version.signature_recorded' OR "contract_events"."metadata"->>'evidenceKind' = 'SIMULATED')))) IS TRUE);--> statement-breakpoint
ALTER TABLE "contract_project_links" ADD CONSTRAINT "contract_project_links_revision_check" CHECK ("contract_project_links"."result_revision" > 3);--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_evidence_check" CHECK ("contract_signatures"."result_revision" > 2 AND "contract_signatures"."evidence_kind" = 'SIMULATED' AND "contract_signatures"."provenance" = 'ILLUSTRATIVE' AND "contract_signatures"."representation_checksum" ~ '^[0-9a-f]{64}$' AND jsonb_typeof("contract_signatures"."acknowledged_warning_codes") = 'array');--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_lineage_check" CHECK ("contract_versions"."created_contract_revision" > 0 AND (("contract_versions"."version_number" = 1 AND "contract_versions"."predecessor_version_id" IS NULL AND "contract_versions"."created_contract_revision"=1) OR ("contract_versions"."version_number">1 AND "contract_versions"."predecessor_version_id" IS NOT NULL)) AND (("contract_versions"."superseded_by_version_id" IS NULL AND "contract_versions"."superseded_at" IS NULL) OR ("contract_versions"."superseded_by_version_id" IS NOT NULL AND "contract_versions"."superseded_at" IS NOT NULL AND "contract_versions"."execution_state"='NOT_EXECUTED')));--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_initial_check" CHECK ("contract_versions"."version_number" > 0 AND "contract_versions"."decision_state" IN ('PENDING', 'APPROVED', 'REJECTED') AND "contract_versions"."execution_state" IN ('NOT_EXECUTED','EXECUTED') AND ("contract_versions"."execution_state" <> 'EXECUTED' OR "contract_versions"."decision_state" = 'APPROVED') AND "contract_versions"."provenance" = 'ILLUSTRATIVE');--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_initial_check" CHECK ("contracts"."kind" = 'CONTRACT' AND "contracts"."origin" = 'ACCEPTED_OFFER' AND "contracts"."revision" > 0 AND "contracts"."illustrative_reference" > 0);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_c4_contract_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Immutable Contract' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME = 'contracts' THEN
  IF OLD.revision < 1 OR NEW.revision <> OLD.revision+1 OR (to_jsonb(OLD)-'revision') IS DISTINCT FROM (to_jsonb(NEW)-'revision') THEN RAISE EXCEPTION 'Immutable Contract content' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT ((OLD.superseded_by_version_id IS NULL AND OLD.decision_state='PENDING' AND NEW.decision_state IN ('APPROVED','REJECTED') AND OLD.execution_state='NOT_EXECUTED' AND NEW.execution_state='NOT_EXECUTED' AND (to_jsonb(OLD)-'decision_state') IS NOT DISTINCT FROM (to_jsonb(NEW)-'decision_state')) OR (OLD.superseded_by_version_id IS NULL AND OLD.decision_state='APPROVED' AND NEW.decision_state='APPROVED' AND OLD.execution_state='NOT_EXECUTED' AND NEW.execution_state='EXECUTED' AND (to_jsonb(OLD)-'execution_state') IS NOT DISTINCT FROM (to_jsonb(NEW)-'execution_state')) OR (OLD.execution_state='NOT_EXECUTED' AND OLD.superseded_by_version_id IS NULL AND OLD.superseded_at IS NULL AND NEW.superseded_by_version_id IS NOT NULL AND NEW.superseded_at IS NOT NULL AND (to_jsonb(OLD)-ARRAY['superseded_by_version_id','superseded_at']) IS NOT DISTINCT FROM (to_jsonb(NEW)-ARRAY['superseded_by_version_id','superseded_at']))) THEN RAISE EXCEPTION 'Immutable Contract Version content' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_c4_decision_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d contract_decisions%ROWTYPE; v contract_versions%ROWTYPE; c contracts%ROWTYPE; r contract_quality_runs%ROWTYPE; warning_codes jsonb;
BEGIN
 IF TG_TABLE_NAME = 'contracts' THEN
  SELECT * INTO c FROM contracts WHERE id=NEW.id;
  SELECT * INTO v FROM contract_versions WHERE contract_id=c.id ORDER BY version_number DESC LIMIT 1;
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
  IF d.id IS NOT NULL THEN RAISE EXCEPTION 'Invalid pending Contract decision' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 IF d.id IS NULL OR d.result_revision <> v.created_contract_revision+1 OR (v.superseded_by_version_id IS NULL AND c.revision <> d.result_revision + (CASE WHEN v.execution_state='EXECUTED' THEN 1 + (SELECT count(*) FROM contract_project_links WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id) ELSE 0 END)) OR v.decision_state <> (CASE d.kind WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END) THEN RAISE EXCEPTION 'Contract decision state mismatch' USING ERRCODE='23514'; END IF;
 IF d.kind='APPROVE' THEN
  SELECT * INTO r FROM contract_quality_runs WHERE id=d.quality_run_id AND workspace_id=d.workspace_id AND company_id=d.company_id AND contract_id=d.contract_id AND contract_version_id=d.contract_version_id AND actor_workspace_membership_id=d.actor_workspace_membership_id AND actor_internal_user_id=d.actor_internal_user_id AND evaluated_at=d.decided_at;
  SELECT coalesce(jsonb_agg(item->>'code' ORDER BY item->>'code'),'[]'::jsonb) INTO warning_codes FROM jsonb_array_elements(r.results) item WHERE item->>'status'='WARNING';
  IF r.id IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.results) item WHERE item->>'status'='ERROR') OR d.acknowledged_warning_codes IS DISTINCT FROM warning_codes THEN RAISE EXCEPTION 'Invalid Contract approval evidence' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM contract_commands WHERE result_decision_id=d.id AND workspace_id=d.workspace_id AND company_id=d.company_id AND result_contract_id=d.contract_id AND actor_workspace_membership_id=d.actor_workspace_membership_id AND kind=d.kind AND opportunity_id=c.opportunity_id AND created_at=d.decided_at) OR NOT EXISTS(SELECT 1 FROM contract_events WHERE contract_version_id=d.contract_version_id AND workspace_id=d.workspace_id AND company_id=d.company_id AND contract_id=d.contract_id AND actor_workspace_membership_id=d.actor_workspace_membership_id AND occurred_at=d.decided_at AND actor_internal_user_id=d.actor_internal_user_id AND metadata->>'contractVersionId'=d.contract_version_id::text AND metadata->>'versionNumber'=v.version_number::text AND (d.kind='REJECT' AND NOT (metadata ?| ARRAY['ruleSetVersion','acknowledgedWarningCodes']) OR d.kind='APPROVE' AND metadata->>'ruleSetVersion'='1' AND metadata->'acknowledgedWarningCodes'=d.acknowledged_warning_codes) AND action=CASE d.kind WHEN 'APPROVE' THEN 'contract_version.approved' ELSE 'contract_version.rejected' END) THEN RAISE EXCEPTION 'Incomplete Contract decision' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_c5_signature_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s contract_signatures%ROWTYPE; d contract_decisions%ROWTYPE; v contract_versions%ROWTYPE; c contracts%ROWTYPE; r contract_quality_runs%ROWTYPE; warning_codes jsonb;
BEGIN
 IF TG_TABLE_NAME='contracts' THEN
  SELECT * INTO c FROM contracts WHERE id=NEW.id;
  SELECT * INTO v FROM contract_versions WHERE contract_id=c.id ORDER BY version_number DESC LIMIT 1;
 ELSIF TG_TABLE_NAME='contract_versions' THEN
  SELECT * INTO v FROM contract_versions WHERE id=NEW.id;
  SELECT * INTO c FROM contracts WHERE id=v.contract_id;
 ELSE
  SELECT * INTO v FROM contract_versions WHERE id=NEW.contract_version_id;
  SELECT * INTO c FROM contracts WHERE id=v.contract_id;
 END IF;
 SELECT * INTO s FROM contract_signatures WHERE workspace_id=v.workspace_id AND company_id=v.company_id AND contract_version_id=v.id;
 IF v.execution_state='NOT_EXECUTED' THEN
  IF s.id IS NOT NULL THEN RAISE EXCEPTION 'Unexpected Contract signature' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 SELECT * INTO d FROM contract_decisions WHERE workspace_id=v.workspace_id AND company_id=v.company_id AND contract_id=v.contract_id AND contract_version_id=v.id AND kind='APPROVE';
 IF s.id IS NULL OR d.id IS NULL OR s.result_revision <> v.created_contract_revision+2 OR v.superseded_by_version_id IS NOT NULL OR v.decision_state <> 'APPROVED' OR c.revision <> s.result_revision + (SELECT count(*) FROM contract_project_links WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id) OR s.representation_checksum <> d.representation_checksum OR s.recorded_at < d.decided_at OR s.provider_signed_on NOT BETWEEN (d.decided_at AT TIME ZONE 'UTC')::date AND (s.recorded_at AT TIME ZONE 'UTC')::date OR s.client_signed_on NOT BETWEEN (d.decided_at AT TIME ZONE 'UTC')::date AND (s.recorded_at AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'Invalid Contract execution evidence' USING ERRCODE='23514'; END IF;
 SELECT * INTO r FROM contract_quality_runs WHERE id=s.quality_run_id AND workspace_id=s.workspace_id AND company_id=s.company_id AND contract_id=s.contract_id AND contract_version_id=s.contract_version_id AND actor_workspace_membership_id=s.actor_workspace_membership_id AND actor_internal_user_id=s.actor_internal_user_id AND evaluated_at=s.recorded_at;
 SELECT coalesce(jsonb_agg(item->>'code' ORDER BY item->>'code'),'[]'::jsonb) INTO warning_codes FROM jsonb_array_elements(r.results) item WHERE item->>'status'='WARNING' AND NOT (d.acknowledged_warning_codes ? (item->>'code'));
 IF r.id IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.results) item WHERE item->>'status'='ERROR') OR s.acknowledged_warning_codes IS DISTINCT FROM warning_codes THEN RAISE EXCEPTION 'Invalid Contract signature checks' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM contract_commands WHERE result_signature_id=s.id AND workspace_id=s.workspace_id AND company_id=s.company_id AND result_contract_id=s.contract_id AND actor_workspace_membership_id=s.actor_workspace_membership_id AND kind='RECORD_SIGNATURE' AND opportunity_id=c.opportunity_id AND created_at=s.recorded_at) OR NOT EXISTS(SELECT 1 FROM contract_events WHERE contract_version_id=s.contract_version_id AND workspace_id=s.workspace_id AND company_id=s.company_id AND contract_id=s.contract_id AND actor_workspace_membership_id=s.actor_workspace_membership_id AND actor_internal_user_id=s.actor_internal_user_id AND occurred_at=s.recorded_at AND action='contract_version.signature_recorded' AND metadata->>'contractVersionId'=s.contract_version_id::text AND metadata->>'versionNumber'=v.version_number::text AND metadata->>'ruleSetVersion'='1' AND metadata->'acknowledgedWarningCodes'=s.acknowledged_warning_codes AND metadata->>'evidenceKind'='SIMULATED') THEN RAISE EXCEPTION 'Incomplete Contract signature' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_cp1_project_link_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c contracts%ROWTYPE; v contract_versions%ROWTYPE; s contract_signatures%ROWTYPE; links integer;
BEGIN
 SELECT * INTO c FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.contract_id FOR UPDATE;
 SELECT * INTO v FROM contract_versions WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id ORDER BY version_number DESC LIMIT 1;
 SELECT * INTO s FROM contract_signatures WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_version_id=v.id;
 SELECT count(*) INTO links FROM contract_project_links WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id;
 IF c.id IS NULL OR c.kind<>'CONTRACT' OR v.execution_state<>'EXECUTED' OR links>=50 OR s.id IS NULL OR c.revision<>s.result_revision+links OR NEW.result_revision<>c.revision+1 THEN RAISE EXCEPTION 'Invalid Contract Project link revision' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE FUNCTION guard_c6_version_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c contracts%ROWTYPE; p contract_versions%ROWTYPE;
BEGIN
 SELECT * INTO c FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.contract_id FOR UPDATE;
 SELECT * INTO p FROM contract_versions WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id ORDER BY version_number DESC LIMIT 1;
 IF NEW.decision_state<>'PENDING' OR NEW.execution_state<>'NOT_EXECUTED' OR NEW.superseded_by_version_id IS NOT NULL OR NEW.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'Invalid new Contract Version' USING ERRCODE='23514'; END IF;
 IF p.id IS NULL THEN
  IF NEW.version_number<>1 OR NEW.created_contract_revision<>1 OR NEW.predecessor_version_id IS NOT NULL OR c.revision<>1 THEN RAISE EXCEPTION 'Invalid initial Contract Version' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.version_number<>p.version_number+1 OR NEW.predecessor_version_id IS DISTINCT FROM p.id OR NEW.created_contract_revision<>c.revision+1 OR p.superseded_by_version_id IS NOT NULL OR EXISTS(SELECT 1 FROM contract_versions WHERE contract_id=c.id AND execution_state='EXECUTED') OR NEW.pricing_snapshot_id<>p.pricing_snapshot_id OR NEW.recipient_kind<>p.recipient_kind OR NEW.recipient_additional_legal_entity_id IS DISTINCT FROM p.recipient_additional_legal_entity_id OR NEW.scope_note IS DISTINCT FROM p.scope_note OR NEW.commercial_conditions IS DISTINCT FROM p.commercial_conditions OR NEW.issuing_company_label<>p.issuing_company_label THEN RAISE EXCEPTION 'Invalid Contract successor' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER contract_versions_successor_valid BEFORE INSERT ON contract_versions FOR EACH ROW EXECUTE FUNCTION guard_c6_version_insert();
--> statement-breakpoint
CREATE FUNCTION guard_c6_version_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c contracts%ROWTYPE; v contract_versions%ROWTYPE; s contract_signatures%ROWTYPE; links integer;
BEGIN
 IF TG_TABLE_NAME='contracts' THEN SELECT * INTO c FROM contracts WHERE id=NEW.id;
 ELSE SELECT * INTO c FROM contracts WHERE id=NEW.contract_id; END IF;
 SELECT * INTO v FROM contract_versions WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id ORDER BY version_number DESC LIMIT 1;
 SELECT * INTO s FROM contract_signatures WHERE contract_version_id=v.id;
 SELECT count(*) INTO links FROM contract_project_links WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id;
 IF v.id IS NULL OR c.revision <> v.created_contract_revision + (CASE WHEN v.decision_state='PENDING' THEN 0 ELSE 1 END) + (CASE WHEN v.execution_state='EXECUTED' THEN 1 ELSE 0 END) + links OR v.superseded_by_version_id IS NOT NULL OR v.version_number<>(SELECT count(*) FROM contract_versions WHERE contract_id=c.id) THEN RAISE EXCEPTION 'Invalid Contract head revision' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM contract_versions p LEFT JOIN contract_versions n ON n.predecessor_version_id=p.id WHERE p.contract_id=c.id AND ((p.id<>v.id AND (n.id IS NULL OR p.superseded_by_version_id IS DISTINCT FROM n.id OR p.superseded_at IS DISTINCT FROM n.created_at OR n.version_number<>p.version_number+1 OR n.created_contract_revision<>p.created_contract_revision+CASE WHEN p.decision_state='PENDING' THEN 1 ELSE 2 END)) OR (p.id=v.id AND (n.id IS NOT NULL OR p.superseded_by_version_id IS NOT NULL)))) THEN RAISE EXCEPTION 'Invalid Contract lineage' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM contract_versions n WHERE n.contract_id=c.id AND n.version_number>1 AND (NOT EXISTS(SELECT 1 FROM contract_commands r WHERE r.workspace_id=n.workspace_id AND r.company_id=n.company_id AND r.result_contract_id=n.contract_id AND r.result_version_id=n.id AND r.kind='CREATE_VERSION' AND r.opportunity_id=c.opportunity_id AND r.actor_workspace_membership_id=n.created_by_workspace_membership_id AND r.created_at=n.created_at) OR NOT EXISTS(SELECT 1 FROM contract_events e WHERE e.workspace_id=n.workspace_id AND e.company_id=n.company_id AND e.contract_id=n.contract_id AND e.contract_version_id=n.id AND e.action='contract_version.created' AND e.actor_workspace_membership_id=n.created_by_workspace_membership_id AND e.actor_internal_user_id=n.created_by_internal_user_id AND e.occurred_at=n.created_at AND e.metadata=jsonb_build_object('contractId',c.id::text,'contractVersionId',n.id::text,'versionNumber',n.version_number,'predecessorVersionNumber',n.version_number-1,'kind','CONTRACT','origin','ACCEPTED_OFFER','provenance','ILLUSTRATIVE','offerVersionId',c.source_offer_version_id::text,'pricingSnapshotId',n.pricing_snapshot_id::text)))) THEN RAISE EXCEPTION 'Incomplete Contract version evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contracts_version_chain AFTER INSERT OR UPDATE ON contracts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_c6_version_chain();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contract_versions_chain AFTER INSERT OR UPDATE ON contract_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_c6_version_chain();
