-- Task receipts and creation events are read in their current shape only
-- (#1348). Both tables are immutable, so a row recorded before Task
-- descriptions (migration 0087) cannot be rewritten: refuse instead of
-- reading it. Rows recorded before 0030 and 0033 also lack a description.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "task_commands"
		WHERE jsonb_path_exists("result", '$ ? (!exists(@.schema) && !exists(@.description))')
			OR jsonb_path_exists("result", '$.tasks[*] ? (!exists(@.description))')
	) THEN
		RAISE EXCEPTION 'task_commands holds a Task receipt recorded before Task descriptions; the development database must be recreated.';
	END IF;
	IF EXISTS (
		SELECT 1 FROM "task_events"
		WHERE "meaning"->>'action' = 'task.created'
			AND NOT jsonb_path_exists("meaning", '$.metadata.initial.description')
	) THEN
		RAISE EXCEPTION 'task_events holds a Task creation recorded before Task descriptions; the development database must be recreated.';
	END IF;
END $$;
