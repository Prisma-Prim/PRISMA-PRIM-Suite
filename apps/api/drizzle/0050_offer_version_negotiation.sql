ALTER TABLE "offer_commands" DROP CONSTRAINT "offer_commands_kind_result_check";--> statement-breakpoint
ALTER TABLE "offer_events" DROP CONSTRAINT "offer_events_metadata_check";--> statement-breakpoint
ALTER TABLE "offer_versions" DROP CONSTRAINT "offer_versions_initial_state_check";--> statement-breakpoint
ALTER TABLE "offer_commands" ADD COLUMN "result_version_id" uuid;--> statement-breakpoint
ALTER TABLE "offer_commands" ADD COLUMN "result_offer_revision" integer;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "predecessor_version_id" uuid;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "superseded_by_version_id" uuid;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "offer_commands" ADD CONSTRAINT "offer_commands_version_result_fk" FOREIGN KEY ("workspace_id","company_id","result_offer_id","result_version_id") REFERENCES "public"."offer_versions"("workspace_id","company_id","offer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_predecessor_fk" FOREIGN KEY ("workspace_id","company_id","offer_id","predecessor_version_id") REFERENCES "public"."offer_versions"("workspace_id","company_id","offer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_successor_fk" FOREIGN KEY ("workspace_id","company_id","offer_id","superseded_by_version_id") REFERENCES "public"."offer_versions"("workspace_id","company_id","offer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_versions_predecessor_unique" ON "offer_versions" USING btree ("workspace_id","company_id","predecessor_version_id");--> statement-breakpoint
ALTER TABLE "offer_commands" ADD CONSTRAINT "offer_commands_kind_result_check" CHECK ((("offer_commands"."kind" = 'CREATE_OFFER_VERSION' AND "offer_commands"."result_version_id" IS NOT NULL AND "offer_commands"."result_offer_revision" IS NOT NULL AND "offer_commands"."result_offer_revision" > 1) OR ("offer_commands"."kind" <> 'CREATE_OFFER_VERSION' AND "offer_commands"."result_version_id" IS NULL AND "offer_commands"."result_offer_revision" IS NULL)) AND (("offer_commands"."kind" IN ('CREATE_OFFER', 'CREATE_OFFER_VERSION') AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NULL AND "offer_commands"."result_client_response_id" IS NULL)
      OR ("offer_commands"."kind" = 'RUN_QUALITY_CHECKS' AND "offer_commands"."result_quality_run_id" IS NOT NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NULL AND "offer_commands"."result_client_response_id" IS NULL)
      OR ("offer_commands"."kind" IN ('APPROVE','REJECT') AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NOT NULL AND "offer_commands"."result_transmission_id" IS NULL AND "offer_commands"."result_client_response_id" IS NULL)
      OR ("offer_commands"."kind" = 'RECORD_TRANSMISSION' AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NOT NULL AND "offer_commands"."result_client_response_id" IS NULL)
      OR ("offer_commands"."kind" = 'RECORD_CLIENT_RESPONSE' AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NULL AND "offer_commands"."result_client_response_id" IS NOT NULL)));--> statement-breakpoint
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
          AND (("offer_events"."action" = 'offer_version.approved' AND "offer_events"."metadata"->>'outcome' = 'APPROVED' AND "offer_events"."metadata"->>'ruleSetVersion' = '1' AND jsonb_typeof("offer_events"."metadata"->'acknowledgedWarningCodes') = 'array')
          OR ("offer_events"."action" = 'offer_version.rejected' AND "offer_events"."metadata"->>'outcome' = 'REJECTED' AND NOT ("offer_events"."metadata" ?| ARRAY['ruleSetVersion','acknowledgedWarningCodes'])))
        WHEN "offer_events"."action" = 'offer_version.transmission_recorded' THEN
          "offer_events"."metadata" ?& ARRAY['offerId','offerVersionId','versionNumber','channel','provenance','ruleSetVersion','acknowledgedWarningCodes']
          AND ("offer_events"."metadata" - ARRAY['offerId','offerVersionId','versionNumber','channel','provenance','ruleSetVersion','acknowledgedWarningCodes']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'versionNumber') = 'number' AND "offer_events"."metadata"->>'versionNumber' ~ '^[1-9][0-9]*$'
          AND "offer_events"."metadata"->>'channel' = 'SIMULATED'
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
          AND "offer_events"."metadata"->>'ruleSetVersion' = '1'
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
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_lineage_check" CHECK ((("offer_versions"."version_number" = 1 AND "offer_versions"."predecessor_version_id" IS NULL) OR ("offer_versions"."version_number" > 1 AND "offer_versions"."predecessor_version_id" IS NOT NULL)) AND (("offer_versions"."superseded_by_version_id" IS NULL AND "offer_versions"."superseded_at" IS NULL) OR ("offer_versions"."superseded_by_version_id" IS NOT NULL AND "offer_versions"."superseded_at" IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_initial_state_check" CHECK ("offer_versions"."version_number" >= 1
        AND "offer_versions"."decision_state" = 'PENDING'
        AND "offer_versions"."transmission_state" = 'NOT_TRANSMITTED'
        AND "offer_versions"."client_response_state" = 'NONE'
        AND "offer_versions"."provenance" = 'ILLUSTRATIVE');
--> statement-breakpoint
-- Version content and command evidence stay immutable. Supersession is the sole
-- write-once exception and must identify its exact immediate successor.
CREATE FUNCTION guard_offer_version_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE successor offer_versions%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Offer Version history is immutable.' USING ERRCODE = '23514';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['superseded_by_version_id','superseded_at']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['superseded_by_version_id','superseded_at'])
     OR OLD.superseded_by_version_id IS NOT NULL
     OR NEW.superseded_by_version_id IS NULL OR NEW.superseded_at IS NULL THEN
    RAISE EXCEPTION 'Only initial Offer supersession is writable.' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO successor FROM offer_versions WHERE workspace_id = OLD.workspace_id
    AND company_id = OLD.company_id AND offer_id = OLD.offer_id AND id = NEW.superseded_by_version_id;
  IF NOT FOUND OR successor.predecessor_version_id IS DISTINCT FROM OLD.id
    OR successor.version_number <> OLD.version_number + 1 OR successor.created_at <> NEW.superseded_at THEN
    RAISE EXCEPTION 'Offer supersession requires its exact successor.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER offer_versions_immutable BEFORE UPDATE OR DELETE ON offer_versions
FOR EACH ROW EXECUTE FUNCTION guard_offer_version_history();
--> statement-breakpoint
CREATE FUNCTION prevent_offer_evidence_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Offer receipts and events are immutable.' USING ERRCODE = '23514'; END;
$$;
--> statement-breakpoint
CREATE TRIGGER offer_commands_immutable BEFORE UPDATE OR DELETE ON offer_commands
FOR EACH ROW EXECUTE FUNCTION prevent_offer_evidence_change();
--> statement-breakpoint
CREATE TRIGGER offer_events_immutable BEFORE UPDATE OR DELETE ON offer_events
FOR EACH ROW EXECUTE FUNCTION prevent_offer_evidence_change();
