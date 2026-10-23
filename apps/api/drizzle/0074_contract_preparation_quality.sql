ALTER TABLE "contract_events" DROP CONSTRAINT "contract_events_metadata_check";--> statement-breakpoint
ALTER TABLE "contract_quality_runs" DROP CONSTRAINT "contract_quality_runs_ruleset_check";--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_metadata_check" CHECK ((jsonb_typeof("contract_events"."metadata") = 'object' AND "contract_events"."metadata"->>'contractId' = "contract_events"."contract_id"::text AND (("contract_events"."action" = 'contract_project.linked' AND ("contract_events"."metadata" - ARRAY['contractId','projectId','created']::text[]) = '{}'::jsonb AND "contract_events"."metadata"->'created' IN ('false'::jsonb,'true'::jsonb) AND jsonb_typeof("contract_events"."metadata"->'projectId') = 'string') OR ("contract_events"."action" <> 'contract_project.linked' AND ("contract_events"."metadata" - ARRAY['contractId','contractVersionId','versionNumber','predecessorVersionNumber','illustrativeReference','kind','origin','offerVersionId','pricingSnapshotId','provenance','ruleSetVersion','acknowledgedWarningCodes','evidenceKind','parentContractId','addendumOrdinal']::text[]) = '{}'::jsonb AND (("contract_events"."metadata"->>'kind' = 'CONTRACT' AND "contract_events"."metadata"->>'origin' IN ('ACCEPTED_OFFER','DIRECT','OFFER_PREPARATION') AND (("contract_events"."metadata"->>'origin' = 'DIRECT' AND NOT ("contract_events"."metadata" ? 'offerVersionId')) OR ("contract_events"."metadata"->>'origin' IN ('ACCEPTED_OFFER','OFFER_PREPARATION') AND jsonb_typeof("contract_events"."metadata"->'offerVersionId') = 'string')) AND NOT ("contract_events"."metadata" ?| ARRAY['parentContractId','addendumOrdinal'])) OR ("contract_events"."metadata"->>'kind' = 'PRECONTRACT' AND "contract_events"."metadata"->>'origin' = 'ACCEPTED_OFFER' AND jsonb_typeof("contract_events"."metadata"->'offerVersionId') = 'string' AND NOT ("contract_events"."metadata" ?| ARRAY['parentContractId','addendumOrdinal'])) OR ("contract_events"."metadata"->>'kind' = 'ADDENDUM' AND NOT ("contract_events"."metadata" ?| ARRAY['origin','offerVersionId']) AND jsonb_typeof("contract_events"."metadata"->'parentContractId') = 'string' AND jsonb_typeof("contract_events"."metadata"->'addendumOrdinal') = 'number')) AND "contract_events"."metadata"->>'provenance' = 'ILLUSTRATIVE' AND (CASE WHEN "contract_events"."action" IN ('contract_version.approved','contract_version.signature_recorded') THEN jsonb_typeof("contract_events"."metadata"->'ruleSetVersion') = 'number' AND "contract_events"."metadata"->>'ruleSetVersion' IN ('1','2','3') ELSE NOT ("contract_events"."metadata" ? 'ruleSetVersion') END) AND ("contract_events"."action" <> 'contract_version.signature_recorded' OR "contract_events"."metadata"->>'evidenceKind' = 'SIMULATED')))) IS TRUE);--> statement-breakpoint
ALTER TABLE "contract_quality_runs" ADD CONSTRAINT "contract_quality_runs_ruleset_check" CHECK ("contract_quality_runs"."rule_set" = 'CONTRACT_QUALITY_ILLUSTRATIVE' AND "contract_quality_runs"."rule_set_version" IN (1, 2, 3) AND jsonb_typeof("contract_quality_runs"."results") = 'array');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION contract_version_quality_rule_set(p_workspace_id uuid, p_company_id uuid, p_version_id uuid)
RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM contract_versions WHERE workspace_id=p_workspace_id AND company_id=p_company_id AND id=p_version_id AND template_code='CONTRACT_PREPARATION_ILLUSTRATIVE') THEN 3 WHEN EXISTS (
    SELECT 1 FROM contract_versions v
      JOIN pricing_snapshot_adjustments a
        ON a.workspace_id = v.workspace_id AND a.company_id = v.company_id
       AND a.snapshot_id = v.pricing_snapshot_id
     WHERE v.workspace_id = p_workspace_id AND v.company_id = p_company_id AND v.id = p_version_id
  ) THEN 2 ELSE 1 END
$$;
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
 IF origin='OFFER_PREPARATION' THEN codes:=array_replace(array_replace(codes,'PRICE_MATCHES_ACCEPTED_OFFER','PRICE_MATCHES_SOURCE_OFFER'),'CONDITIONS_MATCH_ACCEPTED_OFFER','CONDITIONS_MATCH_SOURCE_OFFER'); codes:=array_append(codes,'SOURCE_OFFER_ACCEPTED'); END IF;
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
  IF code='SOURCE_OFFER_ACCEPTED' AND item->>'status' IS DISTINCT FROM (CASE WHEN EXISTS(SELECT 1 FROM contract_versions cv JOIN offer_versions ov ON ov.workspace_id=cv.workspace_id AND ov.company_id=cv.company_id AND ov.id=cv.source_offer_version_id JOIN offer_client_responses r ON r.workspace_id=ov.workspace_id AND r.company_id=ov.company_id AND r.offer_version_id=ov.id WHERE cv.id=NEW.contract_version_id AND cv.workspace_id=NEW.workspace_id AND cv.company_id=NEW.company_id AND ov.superseded_by_version_id IS NULL AND r.outcome='ACCEPTED') THEN 'PASS' ELSE 'ERROR' END) THEN RAISE EXCEPTION 'Invalid preparation acceptance check' USING ERRCODE='23514'; END IF;
  idx := idx + 1;
 END LOOP;
 RETURN NEW;
END;
$$;
