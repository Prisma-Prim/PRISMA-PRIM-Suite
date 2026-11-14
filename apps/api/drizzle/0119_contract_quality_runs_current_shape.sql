-- Contract Quality Check runs are read in their current shape only (#1402):
-- each run names the rule set its Contract Version binds. Runs are immutable,
-- so a run stored under another rule set, such as a v1 run recorded before rule
-- set v2 on a version that binds v2, cannot be rewritten: refuse instead of
-- reading it. The insert guard of 0064 has bound every later run.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "contract_quality_runs"
		WHERE "rule_set_version" IS DISTINCT FROM contract_version_quality_rule_set("workspace_id", "company_id", "contract_version_id")
	) THEN
		RAISE EXCEPTION 'contract_quality_runs holds a Contract Quality Check run under another rule set than its Contract Version binds; the development database must be recreated.';
	END IF;
END $$;
