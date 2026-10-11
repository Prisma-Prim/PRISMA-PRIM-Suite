-- #561 admits CONTRACT_QUALITY_ILLUSTRATIVE v2 beside v1 in runs and in approval and
-- signature events. Existing versions, runs, decisions, signatures and events are
-- unchanged: no column, backfill, recheck or rerender.
ALTER TABLE "contract_events" DROP CONSTRAINT "contract_events_metadata_check";--> statement-breakpoint
ALTER TABLE "contract_quality_runs" DROP CONSTRAINT "contract_quality_runs_ruleset_check";--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_metadata_check" CHECK ((jsonb_typeof("contract_events"."metadata") = 'object' AND "contract_events"."metadata"->>'contractId' = "contract_events"."contract_id"::text AND (("contract_events"."action" = 'contract_project.linked' AND ("contract_events"."metadata" - ARRAY['contractId','projectId','created']::text[]) = '{}'::jsonb AND "contract_events"."metadata"->'created' IN ('false'::jsonb,'true'::jsonb) AND jsonb_typeof("contract_events"."metadata"->'projectId') = 'string') OR ("contract_events"."action" <> 'contract_project.linked' AND ("contract_events"."metadata" - ARRAY['contractId','contractVersionId','versionNumber','predecessorVersionNumber','illustrativeReference','kind','origin','offerVersionId','pricingSnapshotId','provenance','ruleSetVersion','acknowledgedWarningCodes','evidenceKind','parentContractId','addendumOrdinal']::text[]) = '{}'::jsonb AND (("contract_events"."metadata"->>'kind' = 'CONTRACT' AND "contract_events"."metadata"->>'origin' IN ('ACCEPTED_OFFER','DIRECT') AND (("contract_events"."metadata"->>'origin' = 'DIRECT' AND NOT ("contract_events"."metadata" ? 'offerVersionId')) OR ("contract_events"."metadata"->>'origin' = 'ACCEPTED_OFFER' AND jsonb_typeof("contract_events"."metadata"->'offerVersionId') = 'string')) AND NOT ("contract_events"."metadata" ?| ARRAY['parentContractId','addendumOrdinal'])) OR ("contract_events"."metadata"->>'kind' = 'PRECONTRACT' AND "contract_events"."metadata"->>'origin' = 'ACCEPTED_OFFER' AND jsonb_typeof("contract_events"."metadata"->'offerVersionId') = 'string' AND NOT ("contract_events"."metadata" ?| ARRAY['parentContractId','addendumOrdinal'])) OR ("contract_events"."metadata"->>'kind' = 'ADDENDUM' AND NOT ("contract_events"."metadata" ?| ARRAY['origin','offerVersionId']) AND jsonb_typeof("contract_events"."metadata"->'parentContractId') = 'string' AND jsonb_typeof("contract_events"."metadata"->'addendumOrdinal') = 'number')) AND "contract_events"."metadata"->>'provenance' = 'ILLUSTRATIVE' AND (CASE WHEN "contract_events"."action" IN ('contract_version.approved','contract_version.signature_recorded') THEN jsonb_typeof("contract_events"."metadata"->'ruleSetVersion') = 'number' AND "contract_events"."metadata"->>'ruleSetVersion' IN ('1','2') ELSE NOT ("contract_events"."metadata" ? 'ruleSetVersion') END) AND ("contract_events"."action" <> 'contract_version.signature_recorded' OR "contract_events"."metadata"->>'evidenceKind' = 'SIMULATED')))) IS TRUE);--> statement-breakpoint
ALTER TABLE "contract_quality_runs" ADD CONSTRAINT "contract_quality_runs_ruleset_check" CHECK ("contract_quality_runs"."rule_set" = 'CONTRACT_QUALITY_ILLUSTRATIVE' AND "contract_quality_runs"."rule_set_version" IN (1, 2) AND jsonb_typeof("contract_quality_runs"."results") = 'array');--> statement-breakpoint
-- The rule set bound to a Contract Version, derived from its immutable Snapshot: v2
-- when any line carries a stored adjustment, otherwise v1, including no Snapshot.
CREATE FUNCTION contract_version_quality_rule_set(p_workspace_id uuid, p_company_id uuid, p_version_id uuid)
RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM contract_versions v
      JOIN pricing_snapshot_adjustments a
        ON a.workspace_id = v.workspace_id AND a.company_id = v.company_id
       AND a.snapshot_id = v.pricing_snapshot_id
     WHERE v.workspace_id = p_workspace_id AND v.company_id = p_company_id AND v.id = p_version_id
  ) THEN 2 ELSE 1 END
$$;
--> statement-breakpoint
-- Insert-only: delivered runs keep their version, so an older v1 run on a pending
-- version that references an adjusted Snapshot stays readable; its next run is v2.
CREATE FUNCTION guard_contract_quality_run_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.rule_set_version IS DISTINCT FROM contract_version_quality_rule_set(NEW.workspace_id, NEW.company_id, NEW.contract_version_id) THEN
    RAISE EXCEPTION 'Contract Quality Check runs use the rule set bound to their version.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contract_quality_runs_bound_rule_set BEFORE INSERT ON contract_quality_runs
FOR EACH ROW EXECUTE FUNCTION guard_contract_quality_run_binding();--> statement-breakpoint
-- Approval and signature events record the bound rule set as a JSON number.
-- Insert-only: delivered events are immutable and already carry rule set v1.
CREATE FUNCTION guard_contract_event_rule_set_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action IN ('contract_version.approved', 'contract_version.signature_recorded')
     AND NEW.metadata->'ruleSetVersion' IS DISTINCT FROM to_jsonb(contract_version_quality_rule_set(NEW.workspace_id, NEW.company_id, NEW.contract_version_id)) THEN
    RAISE EXCEPTION 'Contract events record the rule set bound to their version.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contract_events_bound_rule_set BEFORE INSERT ON contract_events
FOR EACH ROW EXECUTE FUNCTION guard_contract_event_rule_set_binding();--> statement-breakpoint
-- The deferred decision and signature evidence guards of 0059 compared the event with
-- rule set 1; they now compare it with the run the decision or signature records.
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
 IF NOT EXISTS(SELECT 1 FROM contract_commands WHERE result_decision_id=d.id AND workspace_id=d.workspace_id AND company_id=d.company_id AND result_contract_id=d.contract_id AND actor_workspace_membership_id=d.actor_workspace_membership_id AND kind=d.kind AND opportunity_id=c.opportunity_id AND created_at=d.decided_at) OR NOT EXISTS(SELECT 1 FROM contract_events WHERE contract_version_id=d.contract_version_id AND workspace_id=d.workspace_id AND company_id=d.company_id AND contract_id=d.contract_id AND actor_workspace_membership_id=d.actor_workspace_membership_id AND occurred_at=d.decided_at AND actor_internal_user_id=d.actor_internal_user_id AND metadata->>'contractVersionId'=d.contract_version_id::text AND metadata->>'versionNumber'=v.version_number::text AND (d.kind='REJECT' AND NOT (metadata ?| ARRAY['ruleSetVersion','acknowledgedWarningCodes']) OR d.kind='APPROVE' AND metadata->'ruleSetVersion'=to_jsonb(r.rule_set_version) AND metadata->'acknowledgedWarningCodes'=d.acknowledged_warning_codes) AND action=CASE d.kind WHEN 'APPROVE' THEN 'contract_version.approved' ELSE 'contract_version.rejected' END) THEN RAISE EXCEPTION 'Incomplete Contract decision' USING ERRCODE='23514'; END IF;
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
 IF NOT EXISTS(SELECT 1 FROM contract_commands WHERE result_signature_id=s.id AND workspace_id=s.workspace_id AND company_id=s.company_id AND result_contract_id=s.contract_id AND actor_workspace_membership_id=s.actor_workspace_membership_id AND kind='RECORD_SIGNATURE' AND opportunity_id=c.opportunity_id AND created_at=s.recorded_at) OR NOT EXISTS(SELECT 1 FROM contract_events WHERE contract_version_id=s.contract_version_id AND workspace_id=s.workspace_id AND company_id=s.company_id AND contract_id=s.contract_id AND actor_workspace_membership_id=s.actor_workspace_membership_id AND actor_internal_user_id=s.actor_internal_user_id AND occurred_at=s.recorded_at AND action='contract_version.signature_recorded' AND metadata->>'contractVersionId'=s.contract_version_id::text AND metadata->>'versionNumber'=v.version_number::text AND metadata->'ruleSetVersion'=to_jsonb(r.rule_set_version) AND metadata->'acknowledgedWarningCodes'=s.acknowledged_warning_codes AND metadata->>'evidenceKind'='SIMULATED') THEN RAISE EXCEPTION 'Incomplete Contract signature' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
