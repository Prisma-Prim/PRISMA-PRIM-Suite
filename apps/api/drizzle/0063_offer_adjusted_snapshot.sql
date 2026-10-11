-- O8 admits only Offer Template v2 and Quality rule set v2 beside v1. Existing rows,
-- runs, events and representations are unchanged: no backfill, recheck or rerender.
ALTER TABLE "offer_events" DROP CONSTRAINT "offer_events_metadata_check";--> statement-breakpoint
ALTER TABLE "offer_quality_runs" DROP CONSTRAINT "offer_quality_runs_rule_set_check";--> statement-breakpoint
ALTER TABLE "offer_versions" DROP CONSTRAINT "offer_versions_template_check";--> statement-breakpoint
ALTER TABLE "offer_events" ADD CONSTRAINT "offer_events_metadata_check" CHECK ((CASE
        WHEN jsonb_typeof("offer_events"."metadata") <> 'object' THEN false
        WHEN "offer_events"."action" = 'offer.created' THEN
          "offer_events"."metadata" ?& ARRAY['offerId', 'illustrativeReference', 'provenance']
          AND ("offer_events"."metadata" - ARRAY['offerId', 'illustrativeReference', 'provenance']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'illustrativeReference') = 'number'
          AND "offer_events"."metadata"->>'illustrativeReference' ~ '^[1-9][0-9]*$'
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
        WHEN "offer_events"."action" = 'offer_version.created' THEN
          "offer_events"."metadata" ?& ARRAY['offerId', 'offerVersionId', 'versionNumber', 'pricingSnapshotId', 'recipientKind', 'provenance']
          AND ("offer_events"."metadata" - ARRAY['offerId', 'offerVersionId', 'versionNumber', 'predecessorVersionNumber', 'pricingSnapshotId', 'recipientKind', 'provenance']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'versionNumber') = 'number'
          AND "offer_events"."metadata"->>'versionNumber' ~ '^[1-9][0-9]*$'
          AND (("offer_events"."metadata"->>'versionNumber' = '1' AND NOT ("offer_events"."metadata" ? 'predecessorVersionNumber')) OR (("offer_events"."metadata"->>'versionNumber')::numeric > 1 AND jsonb_typeof("offer_events"."metadata"->'predecessorVersionNumber') = 'number' AND ("offer_events"."metadata"->>'predecessorVersionNumber')::numeric = ("offer_events"."metadata"->>'versionNumber')::numeric - 1))
          AND jsonb_typeof("offer_events"."metadata"->'pricingSnapshotId') = 'string'
          AND "offer_events"."metadata"->>'pricingSnapshotId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND "offer_events"."metadata"->>'recipientKind' IN ('PRIMARY', 'ADDITIONAL')
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
        WHEN "offer_events"."action" IN ('offer_version.approved','offer_version.rejected') THEN
          "offer_events"."metadata" ?& ARRAY['offerId','offerVersionId','versionNumber','outcome','provenance']
          AND ("offer_events"."metadata" - ARRAY['offerId','offerVersionId','versionNumber','outcome','provenance','ruleSetVersion','acknowledgedWarningCodes']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'versionNumber') = 'number' AND "offer_events"."metadata"->>'versionNumber' ~ '^[1-9][0-9]*$'
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
          AND (("offer_events"."action" = 'offer_version.approved' AND "offer_events"."metadata"->>'outcome' = 'APPROVED' AND jsonb_typeof("offer_events"."metadata"->'ruleSetVersion') = 'number' AND "offer_events"."metadata"->>'ruleSetVersion' IN ('1','2') AND jsonb_typeof("offer_events"."metadata"->'acknowledgedWarningCodes') = 'array')
          OR ("offer_events"."action" = 'offer_version.rejected' AND "offer_events"."metadata"->>'outcome' = 'REJECTED' AND NOT ("offer_events"."metadata" ?| ARRAY['ruleSetVersion','acknowledgedWarningCodes'])))
        WHEN "offer_events"."action" = 'offer_version.transmission_recorded' THEN
          "offer_events"."metadata" ?& ARRAY['offerId','offerVersionId','versionNumber','channel','provenance','ruleSetVersion','acknowledgedWarningCodes']
          AND ("offer_events"."metadata" - ARRAY['offerId','offerVersionId','versionNumber','channel','provenance','ruleSetVersion','acknowledgedWarningCodes']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'versionNumber') = 'number' AND "offer_events"."metadata"->>'versionNumber' ~ '^[1-9][0-9]*$'
          AND "offer_events"."metadata"->>'channel' = 'SIMULATED'
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
          AND jsonb_typeof("offer_events"."metadata"->'ruleSetVersion') = 'number' AND "offer_events"."metadata"->>'ruleSetVersion' IN ('1','2')
          AND jsonb_typeof("offer_events"."metadata"->'acknowledgedWarningCodes') = 'array'
        WHEN "offer_events"."action" = 'offer_version.client_response_recorded' THEN
          "offer_events"."metadata" ?& ARRAY['offerId','offerVersionId','versionNumber','evidenceKind','outcome','provenance']
          AND ("offer_events"."metadata" - ARRAY['offerId','offerVersionId','versionNumber','evidenceKind','outcome','provenance']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'versionNumber') = 'number'
          AND "offer_events"."metadata"->>'versionNumber' ~ '^[1-9][0-9]*$'
          AND "offer_events"."metadata"->>'evidenceKind' = 'SIMULATED'
          AND "offer_events"."metadata"->>'outcome' IN ('ACCEPTED','REJECTED','EXPIRED')
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
        ELSE false
      END) IS TRUE);--> statement-breakpoint
ALTER TABLE "offer_quality_runs" ADD CONSTRAINT "offer_quality_runs_rule_set_check" CHECK ("offer_quality_runs"."rule_set" = 'OFFER_QUALITY_ILLUSTRATIVE' AND "offer_quality_runs"."rule_set_version" IN (1, 2));--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_template_check" CHECK ("offer_versions"."template_code" = 'OFFER_ILLUSTRATIVE'
        AND "offer_versions"."template_version" IN (1, 2));--> statement-breakpoint
-- Template v1 binds rule set v1 and Template v2 binds rule set v2, fixed at version creation.
CREATE FUNCTION guard_offer_quality_run_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM offer_versions bound
     WHERE bound.workspace_id = NEW.workspace_id AND bound.company_id = NEW.company_id
       AND bound.offer_id = NEW.offer_id AND bound.id = NEW.offer_version_id
       AND bound.template_version = NEW.rule_set_version
  ) THEN
    RAISE EXCEPTION 'Offer Quality Check runs use the rule set bound to their version.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER offer_quality_runs_bound_rule_set BEFORE INSERT ON offer_quality_runs
FOR EACH ROW EXECUTE FUNCTION guard_offer_quality_run_binding();--> statement-breakpoint
-- Approval and transmission events name the rule set bound to their version. Insert-only:
-- delivered events are immutable and already carry rule set v1 for Template v1 versions.
CREATE FUNCTION guard_offer_event_rule_set_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action IN ('offer_version.approved', 'offer_version.transmission_recorded')
     AND NOT EXISTS (
       SELECT 1 FROM offer_versions bound
        WHERE bound.workspace_id = NEW.workspace_id AND bound.company_id = NEW.company_id
          AND bound.offer_id = NEW.offer_id AND bound.id = NEW.offer_version_id
          AND bound.template_version::text = NEW.metadata->>'ruleSetVersion'
     ) THEN
    RAISE EXCEPTION 'Offer events record the rule set bound to their version.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER offer_events_bound_rule_set BEFORE INSERT ON offer_events
FOR EACH ROW EXECUTE FUNCTION guard_offer_event_rule_set_binding();