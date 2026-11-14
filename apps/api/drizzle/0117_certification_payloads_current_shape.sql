-- Certification steps and command receipts are read in their current shape
-- only (#1370). Both tables are immutable, so a row an earlier version of the
-- application recorded cannot be rewritten: refuse instead of reading it.
-- Steps: an application without its date key, a team with first-format
-- boolean declarations, or a team decision or dossier review without the
-- independence attestation. Receipts: a Case read recorded before exchange
-- pagination or before the Certificate release with its validity and
-- revisions; every older receipt also lacks the pagination keys.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "certification_step_versions"
		WHERE ("step" = 'application' AND NOT jsonb_path_exists("payload", '$.submittedOn'))
			OR ("step" = 'team' AND jsonb_path_exists("payload", '$.members[*].declarations.* ? (@.type() == "boolean")'))
			OR ("step" IN ('team_decision', 'dossier_review') AND "payload"->'independenceAttested' IS DISTINCT FROM 'true'::jsonb)
	) THEN
		RAISE EXCEPTION 'certification_step_versions holds a step recorded in an earlier shape; the development database must be recreated.';
	END IF;
	IF EXISTS (
		SELECT 1 FROM "certification_receipts"
		WHERE NOT jsonb_path_exists("response", '$.exchanges.nextCursor')
			OR NOT jsonb_path_exists("response", '$.exchanges.sendings')
			OR NOT jsonb_path_exists("response", '$.release.validity')
			OR NOT jsonb_path_exists("response", '$.release.revisions')
			OR NOT jsonb_path_exists("response", '$.release.currentRevisionIndex')
			OR NOT jsonb_path_exists("response", '$.release.revisionRequired')
	) THEN
		RAISE EXCEPTION 'certification_receipts holds a Case receipt recorded before exchange pagination or the Certificate release; the development database must be recreated.';
	END IF;
END $$;
