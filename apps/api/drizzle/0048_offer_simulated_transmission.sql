CREATE TABLE "offer_transmissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"offer_version_id" uuid NOT NULL,
	"channel" text DEFAULT 'SIMULATED' NOT NULL,
	"offer_revision" integer NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"transmitted_at" timestamp with time zone NOT NULL,
	"quality_run_id" uuid NOT NULL,
	"acknowledged_warning_codes" jsonb NOT NULL,
	"representation_sha256" text NOT NULL,
	"note" text,
	CONSTRAINT "offer_transmissions_state_check" CHECK ("offer_transmissions"."offer_revision" > 2 AND "offer_transmissions"."channel" = 'SIMULATED' AND jsonb_typeof("offer_transmissions"."acknowledged_warning_codes") = 'array' AND "offer_transmissions"."representation_sha256" ~ '^[0-9a-f]{64}$' AND ("offer_transmissions"."note" IS NULL OR char_length("offer_transmissions"."note") <= 500))
);
--> statement-breakpoint
ALTER TABLE "offer_commands" DROP CONSTRAINT "offer_commands_kind_result_check";--> statement-breakpoint
ALTER TABLE "offer_events" DROP CONSTRAINT "offer_events_target_check";--> statement-breakpoint
ALTER TABLE "offer_events" DROP CONSTRAINT "offer_events_metadata_check";--> statement-breakpoint
ALTER TABLE "offer_commands" ADD COLUMN "result_transmission_id" uuid;--> statement-breakpoint
ALTER TABLE "offer_transmissions" ADD CONSTRAINT "offer_transmissions_version_fk" FOREIGN KEY ("workspace_id","company_id","offer_id","offer_version_id") REFERENCES "public"."offer_versions"("workspace_id","company_id","offer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_transmissions" ADD CONSTRAINT "offer_transmissions_run_fk" FOREIGN KEY ("workspace_id","company_id","offer_id","offer_version_id","quality_run_id") REFERENCES "public"."offer_quality_runs"("workspace_id","company_id","offer_id","offer_version_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_transmissions" ADD CONSTRAINT "offer_transmissions_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_transmissions_version_unique" ON "offer_transmissions" USING btree ("workspace_id","company_id","offer_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_transmissions_scope_unique" ON "offer_transmissions" USING btree ("workspace_id","company_id","offer_id","id");--> statement-breakpoint
ALTER TABLE "offer_commands" ADD CONSTRAINT "offer_commands_transmission_result_fk" FOREIGN KEY ("workspace_id","company_id","result_offer_id","result_transmission_id") REFERENCES "public"."offer_transmissions"("workspace_id","company_id","offer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_commands" ADD CONSTRAINT "offer_commands_kind_result_check" CHECK (("offer_commands"."kind" = 'CREATE_OFFER' AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NULL)
      OR ("offer_commands"."kind" = 'RUN_QUALITY_CHECKS' AND "offer_commands"."result_quality_run_id" IS NOT NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NULL)
      OR ("offer_commands"."kind" IN ('APPROVE','REJECT') AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NOT NULL AND "offer_commands"."result_transmission_id" IS NULL)
      OR ("offer_commands"."kind" = 'RECORD_TRANSMISSION' AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "offer_events" ADD CONSTRAINT "offer_events_target_check" CHECK (("offer_events"."action" = 'offer.created' AND "offer_events"."offer_version_id" IS NULL)
        OR ("offer_events"."action" IN ('offer_version.created','offer_version.approved','offer_version.rejected','offer_version.transmission_recorded') AND "offer_events"."offer_version_id" IS NOT NULL));--> statement-breakpoint
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
          AND ("offer_events"."metadata" - ARRAY['offerId', 'offerVersionId', 'versionNumber', 'pricingSnapshotId', 'recipientKind', 'provenance']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'versionNumber') = 'number'
          AND "offer_events"."metadata"->>'versionNumber' = '1'
          AND jsonb_typeof("offer_events"."metadata"->'pricingSnapshotId') = 'string'
          AND "offer_events"."metadata"->>'pricingSnapshotId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND "offer_events"."metadata"->>'recipientKind' IN ('PRIMARY', 'ADDITIONAL')
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
        WHEN "offer_events"."action" IN ('offer_version.approved','offer_version.rejected') THEN
          "offer_events"."metadata" ?& ARRAY['offerId','offerVersionId','versionNumber','outcome','provenance']
          AND ("offer_events"."metadata" - ARRAY['offerId','offerVersionId','versionNumber','outcome','provenance','ruleSetVersion','acknowledgedWarningCodes']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
          AND "offer_events"."metadata"->>'versionNumber' = '1'
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
          AND (("offer_events"."action" = 'offer_version.approved' AND "offer_events"."metadata"->>'outcome' = 'APPROVED' AND "offer_events"."metadata"->>'ruleSetVersion' = '1' AND jsonb_typeof("offer_events"."metadata"->'acknowledgedWarningCodes') = 'array')
          OR ("offer_events"."action" = 'offer_version.rejected' AND "offer_events"."metadata"->>'outcome' = 'REJECTED' AND NOT ("offer_events"."metadata" ?| ARRAY['ruleSetVersion','acknowledgedWarningCodes'])))
        WHEN "offer_events"."action" = 'offer_version.transmission_recorded' THEN
          "offer_events"."metadata" ?& ARRAY['offerId','offerVersionId','versionNumber','channel','provenance','ruleSetVersion','acknowledgedWarningCodes']
          AND ("offer_events"."metadata" - ARRAY['offerId','offerVersionId','versionNumber','channel','provenance','ruleSetVersion','acknowledgedWarningCodes']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
          AND "offer_events"."metadata"->>'versionNumber' = '1'
          AND "offer_events"."metadata"->>'channel' = 'SIMULATED'
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
          AND "offer_events"."metadata"->>'ruleSetVersion' = '1'
          AND jsonb_typeof("offer_events"."metadata"->'acknowledgedWarningCodes') = 'array'
        ELSE false
      END) IS TRUE);
--> statement-breakpoint
CREATE FUNCTION prevent_offer_transmission_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Offer transmissions are immutable.' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER offer_transmissions_immutable BEFORE UPDATE OR DELETE ON offer_transmissions
FOR EACH ROW EXECUTE FUNCTION prevent_offer_transmission_change();
--> statement-breakpoint
CREATE FUNCTION validate_offer_transmission_run() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  recorded_run offer_quality_runs%ROWTYPE;
  approval offer_decisions%ROWTYPE;
  warnings jsonb;
BEGIN
  SELECT * INTO approval FROM offer_decisions
  WHERE workspace_id = NEW.workspace_id AND company_id = NEW.company_id
    AND offer_id = NEW.offer_id AND offer_version_id = NEW.offer_version_id;
  IF NOT FOUND OR approval.state <> 'APPROVED' OR approval.representation_sha256 <> NEW.representation_sha256
     OR NEW.transmitted_at < approval.decided_at THEN
    RAISE EXCEPTION 'Transmission requires the approved representation.' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO recorded_run FROM offer_quality_runs WHERE id = NEW.quality_run_id;
  IF NOT FOUND OR recorded_run.workspace_id <> NEW.workspace_id OR recorded_run.company_id <> NEW.company_id
     OR recorded_run.offer_id <> NEW.offer_id OR recorded_run.offer_version_id <> NEW.offer_version_id
     OR recorded_run.actor_workspace_membership_id <> NEW.actor_workspace_membership_id
     OR recorded_run.actor_internal_user_id <> NEW.actor_internal_user_id
     OR recorded_run.evaluated_at <> NEW.transmitted_at
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(recorded_run.results) r WHERE r->>'status' = 'ERROR') THEN
    RAISE EXCEPTION 'Transmission requires its exact decision run.' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(jsonb_agg(r->'code' ORDER BY r->>'code'), '[]'::jsonb) INTO warnings
  FROM jsonb_array_elements(recorded_run.results) r
  WHERE r->>'status' = 'WARNING' AND NOT approval.acknowledged_warning_codes ? (r->>'code');
  IF (SELECT COALESCE(jsonb_agg(c ORDER BY c), '[]'::jsonb) FROM jsonb_array_elements(NEW.acknowledged_warning_codes) c) IS DISTINCT FROM warnings THEN
    RAISE EXCEPTION 'Transmission requires the exact new warning set.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER offer_transmission_run_checked BEFORE INSERT ON offer_transmissions
FOR EACH ROW EXECUTE FUNCTION validate_offer_transmission_run();
