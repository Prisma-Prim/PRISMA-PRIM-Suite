CREATE TABLE "offer_client_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"offer_version_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"evidence_kind" text DEFAULT 'SIMULATED' NOT NULL,
	"offer_revision" integer NOT NULL,
	"actor_internal_user_id" uuid NOT NULL,
	"actor_workspace_membership_id" uuid NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone,
	"reason" text,
	CONSTRAINT "offer_client_responses_state_check" CHECK ("offer_client_responses"."offer_revision" > 3 AND "offer_client_responses"."evidence_kind" = 'SIMULATED' AND (("offer_client_responses"."outcome" = 'EXPIRED' AND "offer_client_responses"."received_at" IS NULL AND "offer_client_responses"."reason" IS NULL) OR ("offer_client_responses"."outcome" = 'ACCEPTED' AND "offer_client_responses"."received_at" IS NOT NULL AND "offer_client_responses"."received_at" <= "offer_client_responses"."decided_at" AND "offer_client_responses"."reason" IS NULL) OR ("offer_client_responses"."outcome" = 'REJECTED' AND "offer_client_responses"."received_at" IS NOT NULL AND "offer_client_responses"."received_at" <= "offer_client_responses"."decided_at" AND "offer_client_responses"."reason" IS NOT NULL AND char_length(btrim("offer_client_responses"."reason")) BETWEEN 1 AND 500 AND char_length("offer_client_responses"."reason") <= 500)))
);
--> statement-breakpoint
ALTER TABLE "offer_commands" DROP CONSTRAINT "offer_commands_kind_result_check";--> statement-breakpoint
ALTER TABLE "offer_events" DROP CONSTRAINT "offer_events_target_check";--> statement-breakpoint
ALTER TABLE "offer_events" DROP CONSTRAINT "offer_events_metadata_check";--> statement-breakpoint
ALTER TABLE "offer_commands" ADD COLUMN "result_client_response_id" uuid;--> statement-breakpoint
ALTER TABLE "offer_client_responses" ADD CONSTRAINT "offer_client_responses_version_fk" FOREIGN KEY ("workspace_id","company_id","offer_id","offer_version_id") REFERENCES "public"."offer_versions"("workspace_id","company_id","offer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_client_responses" ADD CONSTRAINT "offer_client_responses_actor_fk" FOREIGN KEY ("workspace_id","actor_workspace_membership_id","actor_internal_user_id") REFERENCES "public"."workspace_memberships"("workspace_id","id","internal_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_client_responses_version_unique" ON "offer_client_responses" USING btree ("workspace_id","company_id","offer_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_client_responses_scope_unique" ON "offer_client_responses" USING btree ("workspace_id","company_id","offer_id","id");--> statement-breakpoint
ALTER TABLE "offer_commands" ADD CONSTRAINT "offer_commands_response_result_fk" FOREIGN KEY ("workspace_id","company_id","result_offer_id","result_client_response_id") REFERENCES "public"."offer_client_responses"("workspace_id","company_id","offer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_commands" ADD CONSTRAINT "offer_commands_kind_result_check" CHECK (("offer_commands"."kind" = 'CREATE_OFFER' AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NULL AND "offer_commands"."result_client_response_id" IS NULL)
      OR ("offer_commands"."kind" = 'RUN_QUALITY_CHECKS' AND "offer_commands"."result_quality_run_id" IS NOT NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NULL AND "offer_commands"."result_client_response_id" IS NULL)
      OR ("offer_commands"."kind" IN ('APPROVE','REJECT') AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NOT NULL AND "offer_commands"."result_transmission_id" IS NULL AND "offer_commands"."result_client_response_id" IS NULL)
      OR ("offer_commands"."kind" = 'RECORD_TRANSMISSION' AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NOT NULL AND "offer_commands"."result_client_response_id" IS NULL)
      OR ("offer_commands"."kind" = 'RECORD_CLIENT_RESPONSE' AND "offer_commands"."result_quality_run_id" IS NULL AND "offer_commands"."result_decision_id" IS NULL AND "offer_commands"."result_transmission_id" IS NULL AND "offer_commands"."result_client_response_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "offer_events" ADD CONSTRAINT "offer_events_target_check" CHECK (("offer_events"."action" = 'offer.created' AND "offer_events"."offer_version_id" IS NULL)
        OR ("offer_events"."action" IN ('offer_version.created','offer_version.approved','offer_version.rejected','offer_version.transmission_recorded','offer_version.client_response_recorded') AND "offer_events"."offer_version_id" IS NOT NULL));--> statement-breakpoint
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
        WHEN "offer_events"."action" = 'offer_version.client_response_recorded' THEN
          "offer_events"."metadata" ?& ARRAY['offerId','offerVersionId','versionNumber','evidenceKind','outcome','provenance']
          AND ("offer_events"."metadata" - ARRAY['offerId','offerVersionId','versionNumber','evidenceKind','outcome','provenance']::text[]) = '{}'::jsonb
          AND "offer_events"."metadata"->>'offerId' = "offer_events"."offer_id"::text
          AND "offer_events"."metadata"->>'offerVersionId' = "offer_events"."offer_version_id"::text
          AND jsonb_typeof("offer_events"."metadata"->'versionNumber') = 'number'
          AND "offer_events"."metadata"->>'versionNumber' = '1'
          AND "offer_events"."metadata"->>'evidenceKind' = 'SIMULATED'
          AND "offer_events"."metadata"->>'outcome' IN ('ACCEPTED','REJECTED','EXPIRED')
          AND "offer_events"."metadata"->>'provenance' = 'ILLUSTRATIVE'
        ELSE false
      END) IS TRUE);
--> statement-breakpoint
CREATE UNIQUE INDEX offer_events_client_response_unique ON offer_events (workspace_id, offer_version_id) WHERE action = 'offer_version.client_response_recorded';
--> statement-breakpoint
CREATE FUNCTION prevent_offer_client_response_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Offer Client responses are immutable.' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER offer_client_responses_immutable BEFORE UPDATE OR DELETE ON offer_client_responses
FOR EACH ROW EXECUTE FUNCTION prevent_offer_client_response_change();
--> statement-breakpoint
CREATE FUNCTION validate_offer_client_response() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  transmission offer_transmissions%ROWTYPE;
  version offer_versions%ROWTYPE;
BEGIN
  SELECT * INTO transmission FROM offer_transmissions
  WHERE workspace_id = NEW.workspace_id AND company_id = NEW.company_id
    AND offer_id = NEW.offer_id AND offer_version_id = NEW.offer_version_id;
  IF NOT FOUND OR NEW.offer_revision <= transmission.offer_revision THEN
    RAISE EXCEPTION 'Client response requires its transmitted version.' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO version FROM offer_versions WHERE id = NEW.offer_version_id;
  IF (NEW.outcome = 'EXPIRED' AND NEW.decided_at < version.valid_until)
    OR (NEW.outcome IN ('ACCEPTED','REJECTED') AND
      (NEW.received_at < transmission.transmitted_at OR NEW.received_at >= version.valid_until OR NEW.received_at > NEW.decided_at)) THEN
    RAISE EXCEPTION 'Client response times do not match the transmitted version.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER offer_client_response_checked BEFORE INSERT ON offer_client_responses
FOR EACH ROW EXECUTE FUNCTION validate_offer_client_response();
