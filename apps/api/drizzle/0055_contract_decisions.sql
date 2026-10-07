ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_contract_approver_assignment.granted' BEFORE 'company_offer_approver_assignment.granted';--> statement-breakpoint
ALTER TYPE "public"."activity_log_action" ADD VALUE 'company_contract_approver_assignment.revoked' BEFORE 'company_offer_approver_assignment.revoked';--> statement-breakpoint
ALTER TYPE "public"."company_role_bundle" ADD VALUE 'company_contract_approver' BEFORE 'company_offer_approver';--> statement-breakpoint
CREATE TABLE "contract_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"contract_version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"result_revision" integer NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"reason" text,
	"quality_run_id" uuid,
	"representation_checksum" text,
	"acknowledged_warning_codes" jsonb,
	CONSTRAINT "contract_decisions_result_check" CHECK ("contract_decisions"."result_revision" = 2 AND (("contract_decisions"."kind" = 'APPROVE' AND "contract_decisions"."reason" IS NULL AND "contract_decisions"."quality_run_id" IS NOT NULL AND "contract_decisions"."representation_checksum" ~ '^[0-9a-f]{64}$' AND jsonb_typeof("contract_decisions"."acknowledged_warning_codes") = 'array') OR ("contract_decisions"."kind" = 'REJECT' AND char_length("contract_decisions"."reason") BETWEEN 1 AND 500 AND btrim("contract_decisions"."reason") <> '' AND "contract_decisions"."quality_run_id" IS NULL AND "contract_decisions"."representation_checksum" IS NULL AND "contract_decisions"."acknowledged_warning_codes" IS NULL)) IS TRUE)
);
--> statement-breakpoint
ALTER TABLE "company_role_assignments" DROP CONSTRAINT "company_role_assignments_permission_set_version_check";--> statement-breakpoint
ALTER TABLE "contract_commands" DROP CONSTRAINT "contract_commands_kind_check";--> statement-breakpoint
ALTER TABLE "contract_events" DROP CONSTRAINT "contract_events_target_check";--> statement-breakpoint
ALTER TABLE "contract_events" DROP CONSTRAINT "contract_events_metadata_check";--> statement-breakpoint
ALTER TABLE "contract_versions" DROP CONSTRAINT "contract_versions_initial_check";--> statement-breakpoint
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_initial_check";--> statement-breakpoint
ALTER TABLE "contract_commands" ADD COLUMN "result_decision_id" uuid;--> statement-breakpoint
ALTER TABLE "contract_decisions" ADD CONSTRAINT "contract_decisions_version_fk" FOREIGN KEY ("workspace_id","company_id","contract_id","contract_version_id") REFERENCES "public"."contract_versions"("workspace_id","company_id","contract_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_decisions" ADD CONSTRAINT "contract_decisions_run_fk" FOREIGN KEY ("workspace_id","company_id","contract_id","quality_run_id") REFERENCES "public"."contract_quality_runs"("workspace_id","company_id","contract_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_decisions" ADD CONSTRAINT "contract_decisions_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_decisions_version_unique" ON "contract_decisions" USING btree ("workspace_id","company_id","contract_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_decisions_scope_unique" ON "contract_decisions" USING btree ("workspace_id","company_id","contract_id","id");--> statement-breakpoint
ALTER TABLE "contract_commands" ADD CONSTRAINT "contract_commands_decision_fk" FOREIGN KEY ("workspace_id","company_id","result_contract_id","result_decision_id") REFERENCES "public"."contract_decisions"("workspace_id","company_id","contract_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_role_assignments" ADD CONSTRAINT "company_role_assignments_permission_set_version_check" CHECK ((
        ("company_role_assignments"."bundle"::text = 'company_director_client_access'
          AND "company_role_assignments"."permission_set_version" IS NOT NULL
          AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_document_registrar' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_commercial_intake' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2', 'v3'))
        OR
        ("company_role_assignments"."bundle"::text = 'company_project_access' AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" IN ('v1', 'v2'))
        OR
        ("company_role_assignments"."bundle"::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director') AND "company_role_assignments"."permission_set_version" IS NOT NULL AND "company_role_assignments"."permission_set_version" = 'v1')
        OR
        ("company_role_assignments"."bundle"::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director')
          AND "company_role_assignments"."permission_set_version" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "contract_commands" ADD CONSTRAINT "contract_commands_kind_check" CHECK ((("contract_commands"."kind" = 'CREATE' AND "contract_commands"."result_quality_run_id" IS NULL) OR ("contract_commands"."kind" = 'RUN_QUALITY_CHECKS' AND "contract_commands"."result_quality_run_id" IS NOT NULL)) AND "contract_commands"."result_decision_id" IS NULL OR ("contract_commands"."kind" IN ('APPROVE','REJECT') AND "contract_commands"."result_quality_run_id" IS NULL AND "contract_commands"."result_decision_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_target_check" CHECK (("contract_events"."action" = 'contract.created' AND "contract_events"."contract_version_id" IS NULL) OR ("contract_events"."action" IN ('contract_version.created','contract_version.approved','contract_version.rejected') AND "contract_events"."contract_version_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_metadata_check" CHECK ((jsonb_typeof("contract_events"."metadata") = 'object' AND ("contract_events"."metadata" - ARRAY['contractId','contractVersionId','versionNumber','illustrativeReference','kind','origin','offerVersionId','pricingSnapshotId','provenance','ruleSetVersion','acknowledgedWarningCodes']::text[]) = '{}'::jsonb AND "contract_events"."metadata"->>'contractId' = "contract_events"."contract_id"::text AND "contract_events"."metadata"->>'kind' = 'CONTRACT' AND "contract_events"."metadata"->>'origin' = 'ACCEPTED_OFFER' AND "contract_events"."metadata"->>'provenance' = 'ILLUSTRATIVE') IS TRUE);--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_initial_check" CHECK ("contract_versions"."version_number" = 1 AND "contract_versions"."decision_state" IN ('PENDING', 'APPROVED', 'REJECTED') AND "contract_versions"."execution_state" = 'NOT_EXECUTED' AND "contract_versions"."provenance" = 'ILLUSTRATIVE');--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_initial_check" CHECK ("contracts"."kind" = 'CONTRACT' AND "contracts"."origin" = 'ACCEPTED_OFFER' AND "contracts"."revision" IN (1, 2) AND "contracts"."illustrative_reference" > 0);--> statement-breakpoint
DROP TRIGGER contracts_immutable ON contracts;
--> statement-breakpoint
DROP TRIGGER contract_versions_immutable ON contract_versions;
--> statement-breakpoint
CREATE FUNCTION guard_c4_contract_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Immutable Contract' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME = 'contracts' THEN
  IF OLD.revision <> 1 OR NEW.revision <> 2 OR (to_jsonb(OLD)-'revision') IS DISTINCT FROM (to_jsonb(NEW)-'revision') THEN RAISE EXCEPTION 'Immutable Contract content' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.decision_state <> 'PENDING' OR NEW.decision_state NOT IN ('APPROVED','REJECTED') OR (to_jsonb(OLD)-'decision_state') IS DISTINCT FROM (to_jsonb(NEW)-'decision_state') THEN RAISE EXCEPTION 'Immutable Contract Version content' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER contracts_immutable BEFORE UPDATE OR DELETE ON contracts FOR EACH ROW EXECUTE FUNCTION guard_c4_contract_state();
--> statement-breakpoint
CREATE TRIGGER contract_versions_immutable BEFORE UPDATE OR DELETE ON contract_versions FOR EACH ROW EXECUTE FUNCTION guard_c4_contract_state();
--> statement-breakpoint
CREATE TRIGGER contract_decisions_immutable BEFORE UPDATE OR DELETE ON contract_decisions FOR EACH ROW EXECUTE FUNCTION guard_c1_immutable_record();
--> statement-breakpoint
CREATE UNIQUE INDEX contract_events_decision_unique ON contract_events(workspace_id,company_id,contract_version_id) WHERE action IN ('contract_version.approved','contract_version.rejected');
--> statement-breakpoint
CREATE FUNCTION guard_c4_decision_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
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
 IF d.id IS NULL OR c.revision <> d.result_revision OR v.decision_state <> (CASE d.kind WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END) THEN RAISE EXCEPTION 'Contract decision state mismatch' USING ERRCODE='23514'; END IF;
 IF d.kind='APPROVE' THEN
  SELECT * INTO r FROM contract_quality_runs WHERE id=d.quality_run_id AND workspace_id=d.workspace_id AND company_id=d.company_id AND contract_id=d.contract_id AND contract_version_id=d.contract_version_id AND actor_workspace_membership_id=d.actor_workspace_membership_id AND actor_internal_user_id=d.actor_internal_user_id AND evaluated_at=d.decided_at;
  SELECT coalesce(jsonb_agg(item->>'code' ORDER BY item->>'code'),'[]'::jsonb) INTO warning_codes FROM jsonb_array_elements(r.results) item WHERE item->>'status'='WARNING';
  IF r.id IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.results) item WHERE item->>'status'='ERROR') OR d.acknowledged_warning_codes IS DISTINCT FROM warning_codes THEN RAISE EXCEPTION 'Invalid Contract approval evidence' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM contract_commands WHERE result_decision_id=d.id AND workspace_id=d.workspace_id AND company_id=d.company_id AND result_contract_id=d.contract_id AND actor_workspace_membership_id=d.actor_workspace_membership_id AND kind=d.kind AND opportunity_id=c.opportunity_id AND created_at=d.decided_at) OR NOT EXISTS(SELECT 1 FROM contract_events WHERE contract_version_id=d.contract_version_id AND workspace_id=d.workspace_id AND company_id=d.company_id AND contract_id=d.contract_id AND actor_workspace_membership_id=d.actor_workspace_membership_id AND occurred_at=d.decided_at AND actor_internal_user_id=d.actor_internal_user_id AND metadata->>'contractVersionId'=d.contract_version_id::text AND metadata->>'versionNumber'='1' AND (d.kind='REJECT' AND NOT (metadata ?| ARRAY['ruleSetVersion','acknowledgedWarningCodes']) OR d.kind='APPROVE' AND metadata->>'ruleSetVersion'='1' AND metadata->'acknowledgedWarningCodes'=d.acknowledged_warning_codes) AND action=CASE d.kind WHEN 'APPROVE' THEN 'contract_version.approved' ELSE 'contract_version.rejected' END) THEN RAISE EXCEPTION 'Incomplete Contract decision' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contract_decisions_evidence AFTER INSERT ON contract_decisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_c4_decision_evidence();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contracts_decision_evidence AFTER INSERT OR UPDATE ON contracts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_c4_decision_evidence();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contract_versions_decision_evidence AFTER INSERT OR UPDATE ON contract_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_c4_decision_evidence();

