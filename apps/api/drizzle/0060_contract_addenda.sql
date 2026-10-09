ALTER TABLE "contract_events" DROP CONSTRAINT "contract_events_metadata_check";--> statement-breakpoint
ALTER TABLE "contract_reference_counters" DROP CONSTRAINT "contract_reference_counters_check";--> statement-breakpoint
ALTER TABLE "contract_versions" DROP CONSTRAINT "contract_versions_template_binding_check";--> statement-breakpoint
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_initial_check";--> statement-breakpoint
DROP INDEX "contracts_opportunity_unique";--> statement-breakpoint
ALTER TABLE "contract_versions" ALTER COLUMN "pricing_snapshot_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "origin" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "source_offer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "source_offer_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD COLUMN "change_summary" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "parent_contract_id" uuid;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "addendum_ordinal" integer;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_parent_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id","parent_contract_id") REFERENCES "public"."contracts"("workspace_id","company_id","opportunity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_parent_ordinal_unique" ON "contracts" USING btree ("workspace_id","company_id","parent_contract_id","addendum_ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_opportunity_unique" ON "contracts" USING btree ("workspace_id","company_id","opportunity_id") WHERE "contracts"."kind" <> 'ADDENDUM';--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_metadata_check" CHECK ((jsonb_typeof("contract_events"."metadata") = 'object' AND "contract_events"."metadata"->>'contractId' = "contract_events"."contract_id"::text AND (("contract_events"."action" = 'contract_project.linked' AND ("contract_events"."metadata" - ARRAY['contractId','projectId','created']::text[]) = '{}'::jsonb AND "contract_events"."metadata"->'created' IN ('false'::jsonb,'true'::jsonb) AND jsonb_typeof("contract_events"."metadata"->'projectId') = 'string') OR ("contract_events"."action" <> 'contract_project.linked' AND ("contract_events"."metadata" - ARRAY['contractId','contractVersionId','versionNumber','predecessorVersionNumber','illustrativeReference','kind','origin','offerVersionId','pricingSnapshotId','provenance','ruleSetVersion','acknowledgedWarningCodes','evidenceKind','parentContractId','addendumOrdinal']::text[]) = '{}'::jsonb AND (("contract_events"."metadata"->>'kind' = 'CONTRACT' AND "contract_events"."metadata"->>'origin' = 'ACCEPTED_OFFER' AND NOT ("contract_events"."metadata" ?| ARRAY['parentContractId','addendumOrdinal'])) OR ("contract_events"."metadata"->>'kind' = 'ADDENDUM' AND NOT ("contract_events"."metadata" ?| ARRAY['origin','offerVersionId']) AND jsonb_typeof("contract_events"."metadata"->'parentContractId') = 'string' AND jsonb_typeof("contract_events"."metadata"->'addendumOrdinal') = 'number')) AND "contract_events"."metadata"->>'provenance' = 'ILLUSTRATIVE' AND ("contract_events"."action" <> 'contract_version.signature_recorded' OR "contract_events"."metadata"->>'evidenceKind' = 'SIMULATED')))) IS TRUE);--> statement-breakpoint
ALTER TABLE "contract_reference_counters" ADD CONSTRAINT "contract_reference_counters_check" CHECK ("contract_reference_counters"."kind" IN ('CONTRACT','ADDENDUM') AND "contract_reference_counters"."current_reference" > 0);--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_template_binding_check" CHECK ("contract_versions"."template_version" = 1 AND (("contract_versions"."template_code" = 'CONTRACT_ILLUSTRATIVE' AND "contract_versions"."clause_versions" = '[{"code":"CL_SUBJECT","version":1},{"code":"CL_PRICE","version":1},{"code":"CL_TERM","version":1},{"code":"CL_CONDITIONS","version":1},{"code":"CL_GENERAL","version":1}]'::jsonb AND "contract_versions"."pricing_snapshot_id" IS NOT NULL AND "contract_versions"."change_summary" IS NULL) OR ("contract_versions"."template_code" = 'ADDENDUM_ILLUSTRATIVE' AND "contract_versions"."clause_versions" = '[{"code":"CL_SUBJECT","version":1},{"code":"CL_PRICE","version":1},{"code":"CL_TERM","version":1},{"code":"CL_CONDITIONS","version":1},{"code":"CL_CHANGE","version":1},{"code":"CL_GENERAL","version":1}]'::jsonb AND char_length("contract_versions"."change_summary") BETWEEN 1 AND 4000 AND btrim("contract_versions"."change_summary") <> '' AND "contract_versions"."scope_note" IS NULL AND "contract_versions"."commercial_conditions" IS NULL AND "contract_versions"."special_conditions" IS NULL AND "contract_versions"."term_starts_on" IS NULL)) IS TRUE);--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_initial_check" CHECK (("contracts"."revision" > 0 AND "contracts"."illustrative_reference" > 0 AND (("contracts"."kind" = 'CONTRACT' AND "contracts"."origin" = 'ACCEPTED_OFFER' AND "contracts"."source_offer_id" IS NOT NULL AND "contracts"."source_offer_version_id" IS NOT NULL AND "contracts"."parent_contract_id" IS NULL AND "contracts"."addendum_ordinal" IS NULL) OR ("contracts"."kind" = 'ADDENDUM' AND "contracts"."origin" IS NULL AND "contracts"."source_offer_id" IS NULL AND "contracts"."source_offer_version_id" IS NULL AND "contracts"."parent_contract_id" IS NOT NULL AND "contracts"."parent_contract_id" <> "contracts"."id" AND "contracts"."addendum_ordinal" > 0))) IS TRUE);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_c6_version_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c contracts%ROWTYPE; p contract_versions%ROWTYPE;
BEGIN
 SELECT * INTO c FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.contract_id FOR UPDATE;
 SELECT * INTO p FROM contract_versions WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id ORDER BY version_number DESC LIMIT 1;
 IF (c.kind='CONTRACT' AND (NEW.template_code<>'CONTRACT_ILLUSTRATIVE' OR NEW.change_summary IS NOT NULL OR NEW.pricing_snapshot_id IS NULL)) OR (c.kind='ADDENDUM' AND NEW.template_code<>'ADDENDUM_ILLUSTRATIVE') THEN RAISE EXCEPTION 'Contract kind generation mismatch' USING ERRCODE='23514'; END IF;
 IF c.kind='ADDENDUM' AND NOT EXISTS(SELECT 1 FROM contracts pc JOIN contract_versions pv ON pv.contract_id=pc.id WHERE pc.workspace_id=c.workspace_id AND pc.company_id=c.company_id AND pc.id=c.parent_contract_id AND pc.kind IN ('CONTRACT','PRECONTRACT') AND pv.execution_state='EXECUTED' AND pv.recipient_kind=NEW.recipient_kind AND pv.recipient_additional_legal_entity_id IS NOT DISTINCT FROM NEW.recipient_additional_legal_entity_id) THEN RAISE EXCEPTION 'Invalid Addendum party' USING ERRCODE='23514'; END IF;
 IF NEW.decision_state<>'PENDING' OR NEW.execution_state<>'NOT_EXECUTED' OR NEW.superseded_by_version_id IS NOT NULL OR NEW.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'Invalid new Contract Version' USING ERRCODE='23514'; END IF;
 IF p.id IS NULL THEN
  IF NEW.version_number<>1 OR NEW.created_contract_revision<>1 OR NEW.predecessor_version_id IS NOT NULL OR c.revision<>1 THEN RAISE EXCEPTION 'Invalid initial Contract Version' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.version_number<>p.version_number+1 OR NEW.predecessor_version_id IS DISTINCT FROM p.id OR NEW.created_contract_revision<>c.revision+1 OR p.superseded_by_version_id IS NOT NULL OR EXISTS(SELECT 1 FROM contract_versions WHERE contract_id=c.id AND execution_state='EXECUTED') OR (c.kind='CONTRACT' AND NEW.pricing_snapshot_id IS DISTINCT FROM p.pricing_snapshot_id) OR NEW.recipient_kind<>p.recipient_kind OR NEW.recipient_additional_legal_entity_id IS DISTINCT FROM p.recipient_additional_legal_entity_id OR NEW.scope_note IS DISTINCT FROM p.scope_note OR NEW.commercial_conditions IS DISTINCT FROM p.commercial_conditions OR NEW.issuing_company_label<>p.issuing_company_label THEN RAISE EXCEPTION 'Invalid Contract successor' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_c6_version_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c contracts%ROWTYPE; v contract_versions%ROWTYPE; s contract_signatures%ROWTYPE; links integer;
BEGIN
 IF TG_TABLE_NAME='contracts' THEN SELECT * INTO c FROM contracts WHERE id=NEW.id;
 ELSE SELECT * INTO c FROM contracts WHERE id=NEW.contract_id; END IF;
 SELECT * INTO v FROM contract_versions WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id ORDER BY version_number DESC LIMIT 1;
 SELECT * INTO s FROM contract_signatures WHERE contract_version_id=v.id;
 SELECT count(*) INTO links FROM contract_project_links WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id;
 IF v.id IS NULL OR c.revision <> v.created_contract_revision + (CASE WHEN v.decision_state='PENDING' THEN 0 ELSE 1 END) + (CASE WHEN v.execution_state='EXECUTED' THEN 1 ELSE 0 END) + links OR v.superseded_by_version_id IS NOT NULL OR v.version_number<>(SELECT count(*) FROM contract_versions WHERE contract_id=c.id) THEN RAISE EXCEPTION 'Invalid Contract head revision' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM contract_versions p LEFT JOIN contract_versions n ON n.predecessor_version_id=p.id WHERE p.contract_id=c.id AND ((p.id<>v.id AND (n.id IS NULL OR p.superseded_by_version_id IS DISTINCT FROM n.id OR p.superseded_at IS DISTINCT FROM n.created_at OR n.version_number<>p.version_number+1 OR n.created_contract_revision<>p.created_contract_revision+CASE WHEN p.decision_state='PENDING' THEN 1 ELSE 2 END)) OR (p.id=v.id AND (n.id IS NOT NULL OR p.superseded_by_version_id IS NOT NULL)))) THEN RAISE EXCEPTION 'Invalid Contract lineage' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM contract_versions n WHERE n.contract_id=c.id AND n.version_number>1 AND (NOT EXISTS(SELECT 1 FROM contract_commands r WHERE r.workspace_id=n.workspace_id AND r.company_id=n.company_id AND r.result_contract_id=n.contract_id AND r.result_version_id=n.id AND r.kind='CREATE_VERSION' AND r.opportunity_id=c.opportunity_id AND r.actor_workspace_membership_id=n.created_by_workspace_membership_id AND r.created_at=n.created_at) OR NOT EXISTS(SELECT 1 FROM contract_events e WHERE e.workspace_id=n.workspace_id AND e.company_id=n.company_id AND e.contract_id=n.contract_id AND e.contract_version_id=n.id AND e.action='contract_version.created' AND e.actor_workspace_membership_id=n.created_by_workspace_membership_id AND e.actor_internal_user_id=n.created_by_internal_user_id AND e.occurred_at=n.created_at AND e.metadata=(jsonb_build_object('contractId',c.id::text,'contractVersionId',n.id::text,'versionNumber',n.version_number,'predecessorVersionNumber',n.version_number-1,'kind',c.kind,'provenance','ILLUSTRATIVE') || CASE WHEN c.kind='ADDENDUM' THEN jsonb_build_object('parentContractId',c.parent_contract_id::text,'addendumOrdinal',c.addendum_ordinal) ELSE jsonb_build_object('origin','ACCEPTED_OFFER','offerVersionId',c.source_offer_version_id::text) END || CASE WHEN n.pricing_snapshot_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('pricingSnapshotId',n.pricing_snapshot_id::text) END)))) THEN RAISE EXCEPTION 'Incomplete Contract version evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_c3_quality_results() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE codes text[] := ARRAY['SOURCE_COMPANY_MATCHES','PARTY_AVAILABLE','PARTY_MATCHES_SOURCE','PARTY_IDENTITY_MATCHES_SOURCE','PARTY_IDENTITY_CURRENT','PARTY_TAX_ID_RECORDED','PRICE_MATCHES_ACCEPTED_OFFER','PRICING_SNAPSHOT_COHERENT','CONDITIONS_MATCH_ACCEPTED_OFFER','ADDED_CONDITIONS_CONFIRMED'];
 term_end date;
 template text;
 snapshot uuid;
 item jsonb;
 code text;
 severity text;
 idx integer := 0;
BEGIN
 SELECT term_ends_on,template_code,pricing_snapshot_id INTO term_end,template,snapshot FROM contract_versions WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND contract_id=NEW.contract_id AND id=NEW.contract_version_id;
 IF template='ADDENDUM_ILLUSTRATIVE' THEN
  codes:=ARRAY['SOURCE_COMPANY_MATCHES','PARTY_AVAILABLE','PARTY_MATCHES_SOURCE','PARTY_IDENTITY_MATCHES_SOURCE','PARTY_IDENTITY_CURRENT','PARTY_TAX_ID_RECORDED'];
  IF snapshot IS NOT NULL THEN codes:=array_append(codes,'PRICING_SNAPSHOT_COHERENT'); END IF;
  codes:=array_append(codes,'PARENT_EXECUTED');
  IF snapshot IS NOT NULL THEN codes:=array_append(codes,'CURRENCY_MATCHES_PARENT'); END IF;
 END IF;
 IF term_end IS NOT NULL THEN codes := array_append(codes,'TERM_END_NOT_PASSED'); END IF;
 codes := array_append(codes,'PROVISIONAL_MARKER_PRESENT');
 IF jsonb_typeof(NEW.results) <> 'array' OR jsonb_array_length(NEW.results) <> cardinality(codes) THEN RAISE EXCEPTION 'Invalid Contract Quality Check results' USING ERRCODE='23514'; END IF;
 FOREACH code IN ARRAY codes LOOP
  item := NEW.results->idx;
  severity := CASE WHEN code IN ('PARTY_IDENTITY_MATCHES_SOURCE','PARTY_IDENTITY_CURRENT','ADDED_CONDITIONS_CONFIRMED','TERM_END_NOT_PASSED','CURRENCY_MATCHES_PARENT') THEN 'WARNING' ELSE 'ERROR' END;
  IF (jsonb_typeof(item)='object' AND (item-ARRAY['code','status']::text[])='{}'::jsonb AND item->>'code'=code AND item->>'status' IN ('PASS',severity)) IS NOT TRUE THEN RAISE EXCEPTION 'Invalid Contract Quality Check result' USING ERRCODE='23514'; END IF;
  idx := idx + 1;
 END LOOP;
 RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE FUNCTION guard_c8_parent_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p contracts%ROWTYPE; v contract_versions%ROWTYPE; next_ordinal integer;
BEGIN
 IF NEW.kind<>'ADDENDUM' THEN RETURN NEW; END IF;
 SELECT * INTO p FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.parent_contract_id FOR UPDATE;
 SELECT * INTO v FROM contract_versions WHERE workspace_id=p.workspace_id AND company_id=p.company_id AND contract_id=p.id AND execution_state='EXECUTED';
 SELECT coalesce(max(addendum_ordinal),0)+1 INTO next_ordinal FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND parent_contract_id=NEW.parent_contract_id;
 IF p.id IS NULL OR p.kind NOT IN ('CONTRACT','PRECONTRACT') OR v.id IS NULL OR NEW.opportunity_id<>p.opportunity_id OR NEW.client_request_id<>p.client_request_id OR NEW.original_client_account_id<>p.original_client_account_id OR NEW.addendum_ordinal<>next_ordinal OR NEW.revision<>1 THEN RAISE EXCEPTION 'Invalid Addendum parent or ordinal' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER contracts_addendum_parent_valid BEFORE INSERT ON contracts FOR EACH ROW EXECUTE FUNCTION guard_c8_parent_insert();
--> statement-breakpoint
CREATE FUNCTION guard_c8_event_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c contracts%ROWTYPE; v contract_versions%ROWTYPE;
BEGIN
 SELECT * INTO c FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.contract_id;
 IF NEW.action='contract_project.linked' THEN RETURN NEW; END IF;
 IF NEW.metadata->>'kind' IS DISTINCT FROM c.kind THEN RAISE EXCEPTION 'Invalid Contract event kind' USING ERRCODE='23514'; END IF;
 IF c.kind='ADDENDUM' AND (NEW.metadata->>'parentContractId' IS DISTINCT FROM c.parent_contract_id::text OR NEW.metadata->>'addendumOrdinal' IS DISTINCT FROM c.addendum_ordinal::text) THEN RAISE EXCEPTION 'Invalid Addendum event source' USING ERRCODE='23514'; END IF;
 IF NEW.contract_version_id IS NOT NULL THEN
  SELECT * INTO v FROM contract_versions WHERE id=NEW.contract_version_id AND contract_id=c.id;
  IF v.id IS NULL OR NEW.metadata->>'contractVersionId' IS DISTINCT FROM v.id::text OR NEW.metadata->>'versionNumber' IS DISTINCT FROM v.version_number::text OR (v.pricing_snapshot_id IS NULL AND NEW.metadata ? 'pricingSnapshotId') OR (v.pricing_snapshot_id IS NOT NULL AND NEW.metadata->>'pricingSnapshotId' IS DISTINCT FROM v.pricing_snapshot_id::text) THEN RAISE EXCEPTION 'Invalid Contract version event source' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER contract_events_source_valid BEFORE INSERT ON contract_events FOR EACH ROW EXECUTE FUNCTION guard_c8_event_source();
--> statement-breakpoint
CREATE FUNCTION guard_c8_creation_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c contracts%ROWTYPE; v contract_versions%ROWTYPE; source_metadata jsonb;
BEGIN
 SELECT * INTO c FROM contracts WHERE id=NEW.id;
 IF c.kind<>'ADDENDUM' THEN RETURN NULL; END IF;
 SELECT * INTO v FROM contract_versions WHERE contract_id=c.id AND version_number=1;
 source_metadata:=jsonb_build_object('contractId',c.id::text,'kind','ADDENDUM','parentContractId',c.parent_contract_id::text,'addendumOrdinal',c.addendum_ordinal,'provenance','ILLUSTRATIVE');
 IF v.id IS NULL OR NOT EXISTS(SELECT 1 FROM contract_commands r WHERE r.workspace_id=c.workspace_id AND r.company_id=c.company_id AND r.result_contract_id=c.id AND r.kind='CREATE' AND r.opportunity_id=c.opportunity_id AND r.actor_workspace_membership_id=c.created_by_workspace_membership_id AND r.created_at=c.created_at) OR NOT EXISTS(SELECT 1 FROM contract_events e WHERE e.workspace_id=c.workspace_id AND e.company_id=c.company_id AND e.contract_id=c.id AND e.action='contract.created' AND e.actor_internal_user_id=c.created_by_internal_user_id AND e.actor_workspace_membership_id=c.created_by_workspace_membership_id AND e.occurred_at=c.created_at AND e.metadata=source_metadata||jsonb_build_object('illustrativeReference',c.illustrative_reference)) OR NOT EXISTS(SELECT 1 FROM contract_events e WHERE e.workspace_id=c.workspace_id AND e.company_id=c.company_id AND e.contract_id=c.id AND e.contract_version_id=v.id AND e.action='contract_version.created' AND e.actor_internal_user_id=v.created_by_internal_user_id AND e.actor_workspace_membership_id=v.created_by_workspace_membership_id AND e.occurred_at=v.created_at AND e.metadata=source_metadata||jsonb_build_object('contractVersionId',v.id::text,'versionNumber',1)||CASE WHEN v.pricing_snapshot_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('pricingSnapshotId',v.pricing_snapshot_id::text) END) THEN RAISE EXCEPTION 'Incomplete Addendum creation evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contracts_addendum_evidence AFTER INSERT ON contracts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_c8_creation_evidence();
