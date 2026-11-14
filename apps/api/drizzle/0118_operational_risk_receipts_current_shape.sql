-- Operational-risk command receipts are read in their current schema only
-- (#1371). Receipts and entries are immutable, so a row in another schema
-- cannot be rewritten: refuse instead of reading it. Every delivered version
-- wrote the current schema, so the check states it whole: each object of a
-- stored response has exactly its current keys, and each entry the kind its
-- place and command record. Intake entries share the receipt's entry reader,
-- so their facts must hold every key too.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "operational_risk_receipts" AS "receipt"
		CROSS JOIN LATERAL (VALUES (
			ARRAY['id', 'revision', 'kind', 'actor', 'recordedAt', 'facts', 'predecessorId', 'reason'],
			ARRAY['process', 'cause', 'effect', 'plannedMeasure', 'existingMeasures', 'sourceDescription', 'plannedDate'],
			ARRAY['workspaceMembershipId', 'displayName']
		)) AS "shape"("intake", "facts", "actor")
		CROSS JOIN LATERAL (VALUES
			('{}'::text[], ARRAY['risk', 'entry'], NULL::text[]),
			('{risk}', ARRAY['id', 'companyId', 'revision', 'createdAt', 'assessment', 'responsibility', 'originalIntake', 'currentIntake'], NULL),
			('{risk,originalIntake}', "shape"."intake", ARRAY['intake-recorded']),
			('{risk,originalIntake,facts}', "shape"."facts", NULL),
			('{risk,originalIntake,actor}', "shape"."actor", NULL),
			('{risk,currentIntake}', "shape"."intake", ARRAY['intake-recorded', 'intake-corrected']),
			('{risk,currentIntake,facts}', "shape"."facts", NULL),
			('{risk,currentIntake,actor}', "shape"."actor", NULL),
			('{entry}',
				CASE "receipt"."command_kind"
					WHEN 'journal' THEN ARRAY['id', 'revision', 'kind', 'actor', 'recordedAt', 'narrative', 'occurredOn']
					WHEN 'journal-correct' THEN ARRAY['id', 'revision', 'kind', 'actor', 'recordedAt', 'originalEntryId', 'journalKind', 'predecessorId', 'narrative', 'occurredOn', 'reason']
					ELSE "shape"."intake"
				END,
				CASE "receipt"."command_kind"
					WHEN 'record' THEN ARRAY['intake-recorded']
					WHEN 'correct' THEN ARRAY['intake-corrected']
					WHEN 'journal' THEN ARRAY['observation', 'reassessment']
					ELSE ARRAY['journal-corrected']
				END),
			('{entry,facts}', CASE WHEN "receipt"."command_kind" IN ('record', 'correct') THEN "shape"."facts" END, NULL),
			('{entry,actor}', "shape"."actor", NULL)
		) AS "expected"("path", "keys", "kinds")
		WHERE "expected"."keys" IS NOT NULL AND CASE
			WHEN jsonb_typeof("receipt"."response" #> "expected"."path") = 'object' THEN
				NOT (("receipt"."response" #> "expected"."path") ?& "expected"."keys")
				OR ("receipt"."response" #> "expected"."path") - "expected"."keys" <> '{}'::jsonb
				OR ("expected"."kinds" IS NOT NULL
					AND NOT coalesce(("receipt"."response" #>> ("expected"."path" || 'kind'::text)) = ANY ("expected"."kinds"), false))
			ELSE true
		END
	) THEN
		RAISE EXCEPTION 'operational_risk_receipts holds a Risk receipt recorded in an earlier schema; the development database must be recreated.';
	END IF;
	IF EXISTS (
		SELECT 1 FROM "operational_risk_entries"
		WHERE "kind" IN ('intake-recorded', 'intake-corrected') AND CASE
			WHEN jsonb_typeof("payload"->'facts') = 'object' THEN
				NOT (("payload"->'facts') ?& ARRAY['process', 'cause', 'effect', 'plannedMeasure', 'existingMeasures', 'sourceDescription', 'plannedDate'])
				OR ("payload"->'facts') - ARRAY['process', 'cause', 'effect', 'plannedMeasure', 'existingMeasures', 'sourceDescription', 'plannedDate'] <> '{}'::jsonb
			ELSE true
		END
	) THEN
		RAISE EXCEPTION 'operational_risk_entries holds a Risk intake recorded in an earlier schema; the development database must be recreated.';
	END IF;
END $$;
