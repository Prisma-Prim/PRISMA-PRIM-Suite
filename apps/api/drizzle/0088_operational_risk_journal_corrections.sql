ALTER TABLE "operational_risk_entries" DROP CONSTRAINT "operational_risk_entries_kind_check";--> statement-breakpoint
ALTER TABLE "operational_risk_entries" DROP CONSTRAINT "operational_risk_entries_predecessor_check";--> statement-breakpoint
ALTER TABLE "operational_risk_events" DROP CONSTRAINT "operational_risk_events_metadata_check";--> statement-breakpoint
ALTER TABLE "operational_risk_receipts" DROP CONSTRAINT "operational_risk_receipts_shape_check";--> statement-breakpoint
ALTER TABLE "operational_risk_entries" ADD COLUMN "original_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "operational_risk_entries" ADD COLUMN "original_entry_revision" integer;--> statement-breakpoint
ALTER TABLE "operational_risk_entries" ADD COLUMN "journal_kind" text;--> statement-breakpoint
ALTER TABLE "operational_risk_entries" ADD CONSTRAINT "operational_risk_journal_original_fk" FOREIGN KEY ("workspace_id","company_id","risk_id","original_entry_id","original_entry_revision") REFERENCES "public"."operational_risk_entries"("workspace_id","company_id","risk_id","id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operational_risk_journal_successor_unique" ON "operational_risk_entries" USING btree ("workspace_id","company_id","risk_id","predecessor_id") WHERE "operational_risk_entries"."kind" = 'journal-corrected';--> statement-breakpoint
CREATE INDEX "operational_risk_journal_current_idx" ON "operational_risk_entries" USING btree ("workspace_id","company_id","risk_id","original_entry_id","revision") WHERE "operational_risk_entries"."kind" = 'journal-corrected';--> statement-breakpoint
ALTER TABLE "operational_risk_entries" ADD CONSTRAINT "operational_risk_journal_original_check" CHECK ((CASE WHEN "operational_risk_entries"."kind" = 'journal-corrected' THEN
      "operational_risk_entries"."original_entry_id" IS NOT NULL AND "operational_risk_entries"."original_entry_revision" > 1 AND "operational_risk_entries"."original_entry_revision" <= "operational_risk_entries"."predecessor_revision"
      AND "operational_risk_entries"."journal_kind" IN ('observation', 'reassessment')
      ELSE "operational_risk_entries"."original_entry_id" IS NULL AND "operational_risk_entries"."original_entry_revision" IS NULL AND "operational_risk_entries"."journal_kind" IS NULL END) IS TRUE);--> statement-breakpoint
ALTER TABLE "operational_risk_entries" ADD CONSTRAINT "operational_risk_entries_kind_check" CHECK ("operational_risk_entries"."kind" IN ('intake-recorded', 'intake-corrected', 'observation', 'reassessment', 'journal-corrected') AND "operational_risk_entries"."revision" > 0 AND jsonb_typeof("operational_risk_entries"."payload") = 'object');--> statement-breakpoint
ALTER TABLE "operational_risk_entries" ADD CONSTRAINT "operational_risk_entries_predecessor_check" CHECK ((
    ("operational_risk_entries"."kind" = 'intake-recorded' AND "operational_risk_entries"."revision" = 1 AND "operational_risk_entries"."predecessor_id" IS NULL AND "operational_risk_entries"."predecessor_revision" IS NULL)
    OR ("operational_risk_entries"."kind" IN ('intake-corrected', 'journal-corrected') AND "operational_risk_entries"."predecessor_id" IS NOT NULL AND "operational_risk_entries"."predecessor_revision" > 0 AND "operational_risk_entries"."predecessor_revision" < "operational_risk_entries"."revision")
    OR ("operational_risk_entries"."kind" IN ('observation', 'reassessment') AND "operational_risk_entries"."revision" > 1 AND "operational_risk_entries"."predecessor_id" IS NULL AND "operational_risk_entries"."predecessor_revision" IS NULL)
  ) IS TRUE);--> statement-breakpoint
ALTER TABLE "operational_risk_events" ADD CONSTRAINT "operational_risk_events_metadata_check" CHECK ((CASE
    WHEN "operational_risk_events"."action" IN ('operational_risk.recorded', 'operational_risk.intake.corrected') THEN "operational_risk_events"."metadata" = jsonb_build_object('revision', "operational_risk_events"."revision")
    WHEN "operational_risk_events"."action" IN ('operational_risk.journal.recorded', 'operational_risk.journal.corrected') THEN "operational_risk_events"."metadata"->>'kind' IN ('observation', 'reassessment') AND "operational_risk_events"."metadata" = jsonb_build_object('revision', "operational_risk_events"."revision", 'kind', "operational_risk_events"."metadata"->>'kind')
    ELSE false END) IS TRUE);--> statement-breakpoint
ALTER TABLE "operational_risk_receipts" ADD CONSTRAINT "operational_risk_receipts_shape_check" CHECK ("operational_risk_receipts"."command_kind" IN ('record', 'journal', 'correct', 'journal-correct') AND length("operational_risk_receipts"."idempotency_key") > 0 AND length("operational_risk_receipts"."fingerprint") = 64 AND jsonb_typeof("operational_risk_receipts"."response") = 'object');
--> statement-breakpoint
-- Existing rows/receipts/grants and immutable/head guards are preserved verbatim.
-- The new lineage is checked against actual scoped rows, including the first
-- original predecessor and every later correction of that same original kind.
CREATE FUNCTION operational_risk_require_journal_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'journal-corrected' AND (
    NOT EXISTS (
      SELECT 1 FROM operational_risk_entries original
      WHERE original.workspace_id = NEW.workspace_id AND original.company_id = NEW.company_id
        AND original.risk_id = NEW.risk_id AND original.id = NEW.original_entry_id
        AND original.revision = NEW.original_entry_revision AND original.kind = NEW.journal_kind
        AND original.kind IN ('observation', 'reassessment')
    ) OR NOT EXISTS (
      SELECT 1 FROM operational_risk_entries predecessor
      WHERE predecessor.workspace_id = NEW.workspace_id AND predecessor.company_id = NEW.company_id
        AND predecessor.risk_id = NEW.risk_id AND predecessor.id = NEW.predecessor_id
        AND predecessor.revision = NEW.predecessor_revision AND predecessor.revision < NEW.revision
        AND ((predecessor.id = NEW.original_entry_id AND predecessor.kind = NEW.journal_kind)
          OR (predecessor.kind = 'journal-corrected' AND predecessor.original_entry_id = NEW.original_entry_id
            AND predecessor.original_entry_revision = NEW.original_entry_revision AND predecessor.journal_kind = NEW.journal_kind))
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Operational Risk journal lineage is invalid';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER operational_risk_journal_lineage BEFORE INSERT ON operational_risk_entries
  FOR EACH ROW EXECUTE FUNCTION operational_risk_require_journal_lineage();
--> statement-breakpoint
CREATE FUNCTION operational_risk_require_committed_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE aggregate_revision integer; history_count bigint; history_head integer;
BEGIN
  IF NEW.kind <> 'journal-corrected' THEN RETURN NULL; END IF;
  SELECT revision INTO aggregate_revision FROM operational_risks
    WHERE workspace_id = NEW.workspace_id AND company_id = NEW.company_id AND id = NEW.risk_id;
  SELECT count(*), max(revision) INTO history_count, history_head FROM operational_risk_entries
    WHERE workspace_id = NEW.workspace_id AND company_id = NEW.company_id AND risk_id = NEW.risk_id;
  IF aggregate_revision < NEW.revision OR aggregate_revision <> history_head OR history_count <> aggregate_revision
    OR NOT EXISTS (
      SELECT 1 FROM operational_risk_events e WHERE e.workspace_id = NEW.workspace_id
        AND e.company_id = NEW.company_id AND e.risk_id = NEW.risk_id AND e.entry_id = NEW.id
        AND e.revision = NEW.revision AND e.action = 'operational_risk.journal.corrected'
        AND e.actor_membership_id = NEW.actor_membership_id AND e.actor_internal_user_id = NEW.actor_internal_user_id
        AND e.recorded_at = NEW.recorded_at AND e.metadata = jsonb_build_object('revision', NEW.revision, 'kind', NEW.journal_kind)
    ) OR NOT EXISTS (
      SELECT 1 FROM operational_risk_receipts r WHERE r.workspace_id = NEW.workspace_id
        AND r.company_id = NEW.company_id AND r.risk_id = NEW.risk_id AND r.actor_membership_id = NEW.actor_membership_id
        AND r.command_kind = 'journal-correct' AND r.response->'entry'->>'id' = NEW.id::text
        AND r.response->'entry'->>'revision' = NEW.revision::text
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Operational Risk committed journal is incomplete';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER operational_risk_journal_complete_history AFTER INSERT ON operational_risk_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION operational_risk_require_committed_journal();
