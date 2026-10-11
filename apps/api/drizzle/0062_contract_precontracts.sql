ALTER TABLE "contract_events" DROP CONSTRAINT "contract_events_metadata_check";--> statement-breakpoint
ALTER TABLE "contract_reference_counters" DROP CONSTRAINT "contract_reference_counters_check";--> statement-breakpoint
ALTER TABLE "contract_versions" DROP CONSTRAINT "contract_versions_template_binding_check";--> statement-breakpoint
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_initial_check";--> statement-breakpoint
DROP INDEX "contracts_opportunity_unique";--> statement-breakpoint
ALTER TABLE "contract_versions" ADD COLUMN "preliminary_work_scope" text;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD COLUMN "preliminary_financial_conditions" text;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD COLUMN "preliminary_limits" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "precontract_id" uuid;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_precontract_fk" FOREIGN KEY ("workspace_id","company_id","opportunity_id","precontract_id") REFERENCES "public"."contracts"("workspace_id","company_id","opportunity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_opportunity_unique" ON "contracts" USING btree ("workspace_id","company_id","opportunity_id","kind") WHERE "contracts"."kind" <> 'ADDENDUM';--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_metadata_check" CHECK ((jsonb_typeof("contract_events"."metadata") = 'object' AND "contract_events"."metadata"->>'contractId' = "contract_events"."contract_id"::text AND (("contract_events"."action" = 'contract_project.linked' AND ("contract_events"."metadata" - ARRAY['contractId','projectId','created']::text[]) = '{}'::jsonb AND "contract_events"."metadata"->'created' IN ('false'::jsonb,'true'::jsonb) AND jsonb_typeof("contract_events"."metadata"->'projectId') = 'string') OR ("contract_events"."action" <> 'contract_project.linked' AND ("contract_events"."metadata" - ARRAY['contractId','contractVersionId','versionNumber','predecessorVersionNumber','illustrativeReference','kind','origin','offerVersionId','pricingSnapshotId','provenance','ruleSetVersion','acknowledgedWarningCodes','evidenceKind','parentContractId','addendumOrdinal']::text[]) = '{}'::jsonb AND (("contract_events"."metadata"->>'kind' = 'CONTRACT' AND "contract_events"."metadata"->>'origin' IN ('ACCEPTED_OFFER','DIRECT') AND (("contract_events"."metadata"->>'origin' = 'DIRECT' AND NOT ("contract_events"."metadata" ? 'offerVersionId')) OR ("contract_events"."metadata"->>'origin' = 'ACCEPTED_OFFER' AND jsonb_typeof("contract_events"."metadata"->'offerVersionId') = 'string')) AND NOT ("contract_events"."metadata" ?| ARRAY['parentContractId','addendumOrdinal'])) OR ("contract_events"."metadata"->>'kind' = 'PRECONTRACT' AND "contract_events"."metadata"->>'origin' = 'ACCEPTED_OFFER' AND jsonb_typeof("contract_events"."metadata"->'offerVersionId') = 'string' AND NOT ("contract_events"."metadata" ?| ARRAY['parentContractId','addendumOrdinal'])) OR ("contract_events"."metadata"->>'kind' = 'ADDENDUM' AND NOT ("contract_events"."metadata" ?| ARRAY['origin','offerVersionId']) AND jsonb_typeof("contract_events"."metadata"->'parentContractId') = 'string' AND jsonb_typeof("contract_events"."metadata"->'addendumOrdinal') = 'number')) AND "contract_events"."metadata"->>'provenance' = 'ILLUSTRATIVE' AND ("contract_events"."action" <> 'contract_version.signature_recorded' OR "contract_events"."metadata"->>'evidenceKind' = 'SIMULATED')))) IS TRUE);--> statement-breakpoint
ALTER TABLE "contract_reference_counters" ADD CONSTRAINT "contract_reference_counters_check" CHECK ("contract_reference_counters"."kind" IN ('CONTRACT','PRECONTRACT','ADDENDUM') AND "contract_reference_counters"."current_reference" > 0);--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_template_binding_check" CHECK ("contract_versions"."template_version" = 1 AND (("contract_versions"."template_code" = 'CONTRACT_ILLUSTRATIVE' AND "contract_versions"."clause_versions" = '[{"code":"CL_SUBJECT","version":1},{"code":"CL_PRICE","version":1},{"code":"CL_TERM","version":1},{"code":"CL_CONDITIONS","version":1},{"code":"CL_GENERAL","version":1}]'::jsonb AND "contract_versions"."pricing_snapshot_id" IS NOT NULL AND "contract_versions"."change_summary" IS NULL AND "contract_versions"."preliminary_work_scope" IS NULL AND "contract_versions"."preliminary_financial_conditions" IS NULL AND "contract_versions"."preliminary_limits" IS NULL) OR ("contract_versions"."template_code" = 'PRECONTRACT_ILLUSTRATIVE' AND "contract_versions"."clause_versions" = '[{"code":"CL_SUBJECT","version":1},{"code":"CL_PRICE","version":1},{"code":"CL_TERM","version":1},{"code":"CL_CONDITIONS","version":1},{"code":"CL_PRELIMINARY_WORK","version":1},{"code":"CL_GENERAL","version":1}]'::jsonb AND "contract_versions"."pricing_snapshot_id" IS NOT NULL AND "contract_versions"."change_summary" IS NULL AND "contract_versions"."term_ends_on" IS NOT NULL AND char_length("contract_versions"."preliminary_work_scope") BETWEEN 1 AND 2000 AND btrim("contract_versions"."preliminary_work_scope") <> '' AND char_length("contract_versions"."preliminary_financial_conditions") BETWEEN 1 AND 2000 AND btrim("contract_versions"."preliminary_financial_conditions") <> '' AND char_length("contract_versions"."preliminary_limits") BETWEEN 1 AND 2000 AND btrim("contract_versions"."preliminary_limits") <> '') OR ("contract_versions"."template_code" = 'ADDENDUM_ILLUSTRATIVE' AND "contract_versions"."clause_versions" = '[{"code":"CL_SUBJECT","version":1},{"code":"CL_PRICE","version":1},{"code":"CL_TERM","version":1},{"code":"CL_CONDITIONS","version":1},{"code":"CL_CHANGE","version":1},{"code":"CL_GENERAL","version":1}]'::jsonb AND char_length("contract_versions"."change_summary") BETWEEN 1 AND 4000 AND btrim("contract_versions"."change_summary") <> '' AND "contract_versions"."scope_note" IS NULL AND "contract_versions"."commercial_conditions" IS NULL AND "contract_versions"."special_conditions" IS NULL AND "contract_versions"."term_starts_on" IS NULL AND "contract_versions"."preliminary_work_scope" IS NULL AND "contract_versions"."preliminary_financial_conditions" IS NULL AND "contract_versions"."preliminary_limits" IS NULL)) IS TRUE);--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_initial_check" CHECK (("contracts"."revision" > 0 AND "contracts"."illustrative_reference" > 0 AND (("contracts"."kind" IN ('CONTRACT','PRECONTRACT') AND (("contracts"."origin" = 'ACCEPTED_OFFER' AND "contracts"."source_offer_id" IS NOT NULL AND "contracts"."source_offer_version_id" IS NOT NULL AND "contracts"."direct_reason" IS NULL) OR ("contracts"."kind" = 'CONTRACT' AND "contracts"."origin" = 'DIRECT' AND "contracts"."source_offer_id" IS NULL AND "contracts"."source_offer_version_id" IS NULL AND char_length("contracts"."direct_reason") BETWEEN 1 AND 500 AND btrim("contracts"."direct_reason") <> '')) AND "contracts"."parent_contract_id" IS NULL AND "contracts"."addendum_ordinal" IS NULL AND ("contracts"."precontract_id" IS NULL OR ("contracts"."kind" = 'CONTRACT' AND "contracts"."precontract_id" <> "contracts"."id"))) OR ("contracts"."kind" = 'ADDENDUM' AND "contracts"."direct_reason" IS NULL AND "contracts"."origin" IS NULL AND "contracts"."source_offer_id" IS NULL AND "contracts"."source_offer_version_id" IS NULL AND "contracts"."parent_contract_id" IS NOT NULL AND "contracts"."parent_contract_id" <> "contracts"."id" AND "contracts"."addendum_ordinal" > 0 AND "contracts"."precontract_id" IS NULL))) IS TRUE);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_c6_version_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c contracts%ROWTYPE; p contract_versions%ROWTYPE;
BEGIN
 SELECT * INTO c FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.contract_id FOR UPDATE;
 SELECT * INTO p FROM contract_versions WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id ORDER BY version_number DESC LIMIT 1;
 IF (c.kind='CONTRACT' AND (NEW.template_code<>'CONTRACT_ILLUSTRATIVE' OR NEW.change_summary IS NOT NULL OR NEW.pricing_snapshot_id IS NULL)) OR (c.kind='PRECONTRACT' AND (NEW.template_code<>'PRECONTRACT_ILLUSTRATIVE' OR c.origin IS DISTINCT FROM 'ACCEPTED_OFFER')) OR (c.kind='ADDENDUM' AND NEW.template_code<>'ADDENDUM_ILLUSTRATIVE') THEN RAISE EXCEPTION 'Contract kind generation mismatch' USING ERRCODE='23514'; END IF;
 IF c.kind='ADDENDUM' AND NOT EXISTS(SELECT 1 FROM contracts pc JOIN contract_versions pv ON pv.contract_id=pc.id WHERE pc.workspace_id=c.workspace_id AND pc.company_id=c.company_id AND pc.id=c.parent_contract_id AND pc.kind IN ('CONTRACT','PRECONTRACT') AND pv.execution_state='EXECUTED' AND pv.recipient_kind=NEW.recipient_kind AND pv.recipient_additional_legal_entity_id IS NOT DISTINCT FROM NEW.recipient_additional_legal_entity_id) THEN RAISE EXCEPTION 'Invalid Addendum party' USING ERRCODE='23514'; END IF;
 IF c.origin='DIRECT' AND (char_length(NEW.scope_note) BETWEEN 1 AND 2000 AND btrim(NEW.scope_note)<>'' AND (NEW.commercial_conditions IS NULL OR char_length(NEW.commercial_conditions)<=4000)) IS NOT TRUE THEN RAISE EXCEPTION 'Invalid direct Contract content' USING ERRCODE='23514'; END IF;
 IF NEW.decision_state<>'PENDING' OR NEW.execution_state<>'NOT_EXECUTED' OR NEW.superseded_by_version_id IS NOT NULL OR NEW.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'Invalid new Contract Version' USING ERRCODE='23514'; END IF;
 IF p.id IS NULL THEN
  IF NEW.version_number<>1 OR NEW.created_contract_revision<>1 OR NEW.predecessor_version_id IS NOT NULL OR c.revision<>1 THEN RAISE EXCEPTION 'Invalid initial Contract Version' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.version_number<>p.version_number+1 OR NEW.predecessor_version_id IS DISTINCT FROM p.id OR NEW.created_contract_revision<>c.revision+1 OR p.superseded_by_version_id IS NOT NULL OR EXISTS(SELECT 1 FROM contract_versions WHERE contract_id=c.id AND execution_state='EXECUTED') OR (c.origin='ACCEPTED_OFFER' AND NEW.pricing_snapshot_id IS DISTINCT FROM p.pricing_snapshot_id) OR NEW.recipient_kind<>p.recipient_kind OR NEW.recipient_additional_legal_entity_id IS DISTINCT FROM p.recipient_additional_legal_entity_id OR (c.origin='ACCEPTED_OFFER' AND (NEW.scope_note IS DISTINCT FROM p.scope_note OR NEW.commercial_conditions IS DISTINCT FROM p.commercial_conditions)) OR NEW.issuing_company_label<>p.issuing_company_label THEN RAISE EXCEPTION 'Invalid Contract successor' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_c3_quality_results() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE codes text[] := ARRAY['SOURCE_COMPANY_MATCHES','PARTY_AVAILABLE','PARTY_MATCHES_SOURCE','PARTY_IDENTITY_MATCHES_SOURCE','PARTY_IDENTITY_CURRENT','PARTY_TAX_ID_RECORDED','PRICE_MATCHES_ACCEPTED_OFFER','PRICING_SNAPSHOT_COHERENT','CONDITIONS_MATCH_ACCEPTED_OFFER','ADDED_CONDITIONS_CONFIRMED'];
 term_end date;
 template text;
 origin text;
 snapshot uuid;
 item jsonb;
 code text;
 severity text;
 idx integer := 0;
BEGIN
 SELECT term_ends_on,template_code,pricing_snapshot_id INTO term_end,template,snapshot FROM contract_versions WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND contract_id=NEW.contract_id AND id=NEW.contract_version_id;
 SELECT c.origin INTO origin FROM contracts c WHERE c.workspace_id=NEW.workspace_id AND c.company_id=NEW.company_id AND c.id=NEW.contract_id;
 IF origin='DIRECT' THEN codes:=ARRAY['SOURCE_COMPANY_MATCHES','PARTY_AVAILABLE','PARTY_IDENTITY_CURRENT','PARTY_TAX_ID_RECORDED','PRICING_SNAPSHOT_COHERENT','DIRECT_ORIGIN_REVIEWED']; END IF;
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
  severity := CASE WHEN code IN ('PARTY_IDENTITY_MATCHES_SOURCE','PARTY_IDENTITY_CURRENT','ADDED_CONDITIONS_CONFIRMED','TERM_END_NOT_PASSED','CURRENCY_MATCHES_PARENT','DIRECT_ORIGIN_REVIEWED') THEN 'WARNING' ELSE 'ERROR' END;
  IF (jsonb_typeof(item)='object' AND (item-ARRAY['code','status']::text[])='{}'::jsonb AND item->>'code'=code AND item->>'status' IN ('PASS',severity) AND (code<>'DIRECT_ORIGIN_REVIEWED' OR item->>'status'='WARNING') AND (code<>'ADDED_CONDITIONS_CONFIRMED' OR template<>'PRECONTRACT_ILLUSTRATIVE' OR item->>'status'='WARNING')) IS NOT TRUE THEN RAISE EXCEPTION 'Invalid Contract Quality Check result' USING ERRCODE='23514'; END IF;
  idx := idx + 1;
 END LOOP;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_c8_event_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c contracts%ROWTYPE; v contract_versions%ROWTYPE;
BEGIN
 SELECT * INTO c FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.contract_id;
 IF NEW.action='contract_project.linked' THEN RETURN NEW; END IF;
 IF NEW.metadata->>'kind' IS DISTINCT FROM c.kind THEN RAISE EXCEPTION 'Invalid Contract event kind' USING ERRCODE='23514'; END IF;
 IF c.kind IN ('CONTRACT','PRECONTRACT') AND (NEW.metadata->>'origin' IS DISTINCT FROM c.origin OR (c.origin='DIRECT' AND NEW.metadata ? 'offerVersionId') OR (c.origin='ACCEPTED_OFFER' AND NEW.metadata->>'offerVersionId' IS DISTINCT FROM c.source_offer_version_id::text)) THEN RAISE EXCEPTION 'Invalid Contract event source' USING ERRCODE='23514'; END IF;
 IF c.kind='ADDENDUM' AND (NEW.metadata->>'parentContractId' IS DISTINCT FROM c.parent_contract_id::text OR NEW.metadata->>'addendumOrdinal' IS DISTINCT FROM c.addendum_ordinal::text) THEN RAISE EXCEPTION 'Invalid Addendum event source' USING ERRCODE='23514'; END IF;
 IF NEW.contract_version_id IS NOT NULL THEN
  SELECT * INTO v FROM contract_versions WHERE id=NEW.contract_version_id AND contract_id=c.id;
  IF v.id IS NULL OR NEW.metadata->>'contractVersionId' IS DISTINCT FROM v.id::text OR NEW.metadata->>'versionNumber' IS DISTINCT FROM v.version_number::text OR (v.pricing_snapshot_id IS NULL AND NEW.metadata ? 'pricingSnapshotId') OR (v.pricing_snapshot_id IS NOT NULL AND NEW.metadata->>'pricingSnapshotId' IS DISTINCT FROM v.pricing_snapshot_id::text) THEN RAISE EXCEPTION 'Invalid Contract version event source' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_cp1_project_link_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c contracts%ROWTYPE; v contract_versions%ROWTYPE; s contract_signatures%ROWTYPE; links integer;
BEGIN
 SELECT * INTO c FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.contract_id FOR UPDATE;
 SELECT * INTO v FROM contract_versions WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id ORDER BY version_number DESC LIMIT 1;
 SELECT * INTO s FROM contract_signatures WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_version_id=v.id;
 SELECT count(*) INTO links FROM contract_project_links WHERE workspace_id=c.workspace_id AND company_id=c.company_id AND contract_id=c.id;
 IF c.id IS NULL OR c.kind NOT IN ('CONTRACT','PRECONTRACT') OR v.execution_state<>'EXECUTED' OR links>=50 OR s.id IS NULL OR c.revision<>s.result_revision+links OR NEW.result_revision<>c.revision+1 THEN RAISE EXCEPTION 'Invalid Contract Project link revision' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE FUNCTION guard_c7_precontract_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recorded uuid;
BEGIN
 IF NEW.kind NOT IN ('CONTRACT','PRECONTRACT') THEN RETURN NEW; END IF;
 PERFORM 1 FROM client_requests WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.client_request_id FOR UPDATE;
 PERFORM 1 FROM opportunities WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND id=NEW.opportunity_id AND client_request_id=NEW.client_request_id FOR UPDATE;
 IF NEW.kind='PRECONTRACT' AND (NEW.precontract_id IS NOT NULL OR EXISTS(SELECT 1 FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND opportunity_id=NEW.opportunity_id AND kind='CONTRACT')) THEN RAISE EXCEPTION 'Precontract after Contract' USING ERRCODE='23514'; END IF;
 IF NEW.kind='CONTRACT' THEN
  SELECT id INTO recorded FROM contracts WHERE workspace_id=NEW.workspace_id AND company_id=NEW.company_id AND opportunity_id=NEW.opportunity_id AND kind='PRECONTRACT';
  IF NEW.precontract_id IS DISTINCT FROM recorded THEN RAISE EXCEPTION 'Invalid Contract Precontract reference' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER contracts_precontract_source_valid BEFORE INSERT ON contracts FOR EACH ROW EXECUTE FUNCTION guard_c7_precontract_source();
