CREATE TABLE "contract_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"contract_version_id" uuid NOT NULL,
	"result_revision" integer NOT NULL,
	"evidence_kind" text DEFAULT 'SIMULATED' NOT NULL,
	"provenance" text DEFAULT 'ILLUSTRATIVE' NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"provider_signatory_label" text NOT NULL,
	"client_signatory_label" text NOT NULL,
	"provider_signed_on" date NOT NULL,
	"client_signed_on" date NOT NULL,
	"note" text,
	"quality_run_id" uuid NOT NULL,
	"representation_checksum" text NOT NULL,
	"acknowledged_warning_codes" jsonb NOT NULL,
	CONSTRAINT "contract_signatures_evidence_check" CHECK ("contract_signatures"."result_revision" = 3 AND "contract_signatures"."evidence_kind" = 'SIMULATED' AND "contract_signatures"."provenance" = 'ILLUSTRATIVE' AND "contract_signatures"."representation_checksum" ~ '^[0-9a-f]{64}$' AND jsonb_typeof("contract_signatures"."acknowledged_warning_codes") = 'array'),
	CONSTRAINT "contract_signatures_content_check" CHECK (char_length("contract_signatures"."provider_signatory_label") BETWEEN 1 AND 200 AND btrim("contract_signatures"."provider_signatory_label") <> '' AND char_length("contract_signatures"."client_signatory_label") BETWEEN 1 AND 200 AND btrim("contract_signatures"."client_signatory_label") <> '' AND ("contract_signatures"."note" IS NULL OR char_length("contract_signatures"."note") <= 500))
);
--> statement-breakpoint
ALTER TABLE "contract_commands" DROP CONSTRAINT "contract_commands_kind_check";--> statement-breakpoint
ALTER TABLE "contract_events" DROP CONSTRAINT "contract_events_target_check";--> statement-breakpoint
ALTER TABLE "contract_events" DROP CONSTRAINT "contract_events_metadata_check";--> statement-breakpoint
ALTER TABLE "contract_versions" DROP CONSTRAINT "contract_versions_initial_check";--> statement-breakpoint
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_initial_check";--> statement-breakpoint
ALTER TABLE "contract_commands" ADD COLUMN "result_signature_id" uuid;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_version_fk" FOREIGN KEY ("workspace_id","company_id","contract_id","contract_version_id") REFERENCES "public"."contract_versions"("workspace_id","company_id","contract_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_run_fk" FOREIGN KEY ("workspace_id","company_id","contract_id","quality_run_id") REFERENCES "public"."contract_quality_runs"("workspace_id","company_id","contract_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_signatures_version_unique" ON "contract_signatures" USING btree ("workspace_id","company_id","contract_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_signatures_scope_unique" ON "contract_signatures" USING btree ("workspace_id","company_id","contract_id","id");--> statement-breakpoint
ALTER TABLE "contract_commands" ADD CONSTRAINT "contract_commands_signature_fk" FOREIGN KEY ("workspace_id","company_id","result_contract_id","result_signature_id") REFERENCES "public"."contract_signatures"("workspace_id","company_id","contract_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_events_signature_unique" ON "contract_events" USING btree ("workspace_id","company_id","contract_version_id") WHERE "contract_events"."action" = 'contract_version.signature_recorded';--> statement-breakpoint
ALTER TABLE "contract_commands" ADD CONSTRAINT "contract_commands_kind_check" CHECK ((((("contract_commands"."kind" = 'CREATE' AND "contract_commands"."result_quality_run_id" IS NULL) OR ("contract_commands"."kind" = 'RUN_QUALITY_CHECKS' AND "contract_commands"."result_quality_run_id" IS NOT NULL)) AND "contract_commands"."result_decision_id" IS NULL OR ("contract_commands"."kind" IN ('APPROVE','REJECT') AND "contract_commands"."result_quality_run_id" IS NULL AND "contract_commands"."result_decision_id" IS NOT NULL)) AND "contract_commands"."result_signature_id" IS NULL) OR ("contract_commands"."kind" = 'RECORD_SIGNATURE' AND "contract_commands"."result_quality_run_id" IS NULL AND "contract_commands"."result_decision_id" IS NULL AND "contract_commands"."result_signature_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_target_check" CHECK (("contract_events"."action" = 'contract.created' AND "contract_events"."contract_version_id" IS NULL) OR ("contract_events"."action" IN ('contract_version.created','contract_version.approved','contract_version.rejected','contract_version.signature_recorded') AND "contract_events"."contract_version_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_metadata_check" CHECK ((jsonb_typeof("contract_events"."metadata") = 'object' AND ("contract_events"."metadata" - ARRAY['contractId','contractVersionId','versionNumber','illustrativeReference','kind','origin','offerVersionId','pricingSnapshotId','provenance','ruleSetVersion','acknowledgedWarningCodes','evidenceKind']::text[]) = '{}'::jsonb AND "contract_events"."metadata"->>'contractId' = "contract_events"."contract_id"::text AND "contract_events"."metadata"->>'kind' = 'CONTRACT' AND "contract_events"."metadata"->>'origin' = 'ACCEPTED_OFFER' AND "contract_events"."metadata"->>'provenance' = 'ILLUSTRATIVE' AND ("contract_events"."action" <> 'contract_version.signature_recorded' OR "contract_events"."metadata"->>'evidenceKind' = 'SIMULATED')) IS TRUE);--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_initial_check" CHECK ("contract_versions"."version_number" = 1 AND "contract_versions"."decision_state" IN ('PENDING', 'APPROVED', 'REJECTED') AND "contract_versions"."execution_state" IN ('NOT_EXECUTED','EXECUTED') AND ("contract_versions"."execution_state" <> 'EXECUTED' OR "contract_versions"."decision_state" = 'APPROVED') AND "contract_versions"."provenance" = 'ILLUSTRATIVE');--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_initial_check" CHECK ("contracts"."kind" = 'CONTRACT' AND "contracts"."origin" = 'ACCEPTED_OFFER' AND "contracts"."revision" IN (1, 2, 3) AND "contracts"."illustrative_reference" > 0);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_c4_contract_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Immutable Contract' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME = 'contracts' THEN
  IF OLD.revision NOT IN (1,2) OR NEW.revision <> OLD.revision+1 OR (to_jsonb(OLD)-'revision') IS DISTINCT FROM (to_jsonb(NEW)-'revision') THEN RAISE EXCEPTION 'Immutable Contract content' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT ((OLD.decision_state='PENDING' AND NEW.decision_state IN ('APPROVED','REJECTED') AND OLD.execution_state='NOT_EXECUTED' AND NEW.execution_state='NOT_EXECUTED' AND (to_jsonb(OLD)-'decision_state') IS NOT DISTINCT FROM (to_jsonb(NEW)-'decision_state')) OR (OLD.decision_state='APPROVED' AND NEW.decision_state='APPROVED' AND OLD.execution_state='NOT_EXECUTED' AND NEW.execution_state='EXECUTED' AND (to_jsonb(OLD)-'execution_state') IS NOT DISTINCT FROM (to_jsonb(NEW)-'execution_state'))) THEN RAISE EXCEPTION 'Immutable Contract Version content' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER contract_signatures_immutable BEFORE UPDATE OR DELETE ON contract_signatures FOR EACH ROW EXECUTE FUNCTION guard_c1_immutable_record();
--> statement-breakpoint
CREATE FUNCTION guard_c5_signature_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF s.id IS NOT NULL OR c.revision=3 THEN RAISE EXCEPTION 'Unexpected Contract signature' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 SELECT * INTO d FROM contract_decisions WHERE workspace_id=v.workspace_id AND company_id=v.company_id AND contract_id=v.contract_id AND contract_version_id=v.id AND kind='APPROVE';
 IF s.id IS NULL OR d.id IS NULL OR v.decision_state <> 'APPROVED' OR c.revision <> s.result_revision OR s.representation_checksum <> d.representation_checksum OR s.recorded_at < d.decided_at OR s.provider_signed_on NOT BETWEEN (d.decided_at AT TIME ZONE 'UTC')::date AND (s.recorded_at AT TIME ZONE 'UTC')::date OR s.client_signed_on NOT BETWEEN (d.decided_at AT TIME ZONE 'UTC')::date AND (s.recorded_at AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'Invalid Contract execution evidence' USING ERRCODE='23514'; END IF;
 SELECT * INTO r FROM contract_quality_runs WHERE id=s.quality_run_id AND workspace_id=s.workspace_id AND company_id=s.company_id AND contract_id=s.contract_id AND contract_version_id=s.contract_version_id AND actor_workspace_membership_id=s.actor_workspace_membership_id AND actor_internal_user_id=s.actor_internal_user_id AND evaluated_at=s.recorded_at;
 SELECT coalesce(jsonb_agg(item->>'code' ORDER BY item->>'code'),'[]'::jsonb) INTO warning_codes FROM jsonb_array_elements(r.results) item WHERE item->>'status'='WARNING' AND NOT (d.acknowledged_warning_codes ? (item->>'code'));
 IF r.id IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.results) item WHERE item->>'status'='ERROR') OR s.acknowledged_warning_codes IS DISTINCT FROM warning_codes THEN RAISE EXCEPTION 'Invalid Contract signature checks' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM contract_commands WHERE result_signature_id=s.id AND workspace_id=s.workspace_id AND company_id=s.company_id AND result_contract_id=s.contract_id AND actor_workspace_membership_id=s.actor_workspace_membership_id AND kind='RECORD_SIGNATURE' AND opportunity_id=c.opportunity_id AND created_at=s.recorded_at) OR NOT EXISTS(SELECT 1 FROM contract_events WHERE contract_version_id=s.contract_version_id AND workspace_id=s.workspace_id AND company_id=s.company_id AND contract_id=s.contract_id AND actor_workspace_membership_id=s.actor_workspace_membership_id AND actor_internal_user_id=s.actor_internal_user_id AND occurred_at=s.recorded_at AND action='contract_version.signature_recorded' AND metadata->>'contractVersionId'=s.contract_version_id::text AND metadata->>'versionNumber'='1' AND metadata->>'ruleSetVersion'='1' AND metadata->'acknowledgedWarningCodes'=s.acknowledged_warning_codes AND metadata->>'evidenceKind'='SIMULATED') THEN RAISE EXCEPTION 'Incomplete Contract signature' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contract_signatures_evidence AFTER INSERT ON contract_signatures DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_c5_signature_evidence();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contracts_signature_evidence AFTER INSERT OR UPDATE ON contracts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_c5_signature_evidence();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contract_versions_signature_evidence AFTER INSERT OR UPDATE ON contract_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_c5_signature_evidence();

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
 IF d.id IS NULL OR c.revision <> d.result_revision + (CASE WHEN v.execution_state='EXECUTED' THEN 1 ELSE 0 END) OR v.decision_state <> (CASE d.kind WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END) THEN RAISE EXCEPTION 'Contract decision state mismatch' USING ERRCODE='23514'; END IF;
 IF d.kind='APPROVE' THEN
  SELECT * INTO r FROM contract_quality_runs WHERE id=d.quality_run_id AND workspace_id=d.workspace_id AND company_id=d.company_id AND contract_id=d.contract_id AND contract_version_id=d.contract_version_id AND actor_workspace_membership_id=d.actor_workspace_membership_id AND actor_internal_user_id=d.actor_internal_user_id AND evaluated_at=d.decided_at;
  SELECT coalesce(jsonb_agg(item->>'code' ORDER BY item->>'code'),'[]'::jsonb) INTO warning_codes FROM jsonb_array_elements(r.results) item WHERE item->>'status'='WARNING';
  IF r.id IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.results) item WHERE item->>'status'='ERROR') OR d.acknowledged_warning_codes IS DISTINCT FROM warning_codes THEN RAISE EXCEPTION 'Invalid Contract approval evidence' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM contract_commands WHERE result_decision_id=d.id AND workspace_id=d.workspace_id AND company_id=d.company_id AND result_contract_id=d.contract_id AND actor_workspace_membership_id=d.actor_workspace_membership_id AND kind=d.kind AND opportunity_id=c.opportunity_id AND created_at=d.decided_at) OR NOT EXISTS(SELECT 1 FROM contract_events WHERE contract_version_id=d.contract_version_id AND workspace_id=d.workspace_id AND company_id=d.company_id AND contract_id=d.contract_id AND actor_workspace_membership_id=d.actor_workspace_membership_id AND occurred_at=d.decided_at AND actor_internal_user_id=d.actor_internal_user_id AND metadata->>'contractVersionId'=d.contract_version_id::text AND metadata->>'versionNumber'='1' AND (d.kind='REJECT' AND NOT (metadata ?| ARRAY['ruleSetVersion','acknowledgedWarningCodes']) OR d.kind='APPROVE' AND metadata->>'ruleSetVersion'='1' AND metadata->'acknowledgedWarningCodes'=d.acknowledged_warning_codes) AND action=CASE d.kind WHEN 'APPROVE' THEN 'contract_version.approved' ELSE 'contract_version.rejected' END) THEN RAISE EXCEPTION 'Incomplete Contract decision' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;

