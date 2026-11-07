import { expect, it } from 'vitest';
import { isActivityAction } from './activity-log-response';

// The Activity page rejects a whole page when one event carries an action it
// does not know (#1147). This guard reads the API's `activity_log_action` enum
// and fails as soon as the server can record an action the web parser lacks.
// The schema is read as text through import.meta.glob: the production web
// image copies only apps/web, so a static import of apps/api would break it.
const schemaFile = 'apps/api/src/database/schema/core.ts';
const schemaSources = import.meta.glob(
  '../../../api/src/database/schema/core.ts',
  { query: '?raw', import: 'default', eager: true },
);

// Actions the server records but never returns to /activity-log. Each entry
// needs the reason it is withheld.
const NOT_RETURNED_TO_ACTIVITY: ReadonlySet<string> = new Set();

function apiActivityActions(source: unknown): string[] {
  if (typeof source !== 'string')
    throw new Error(
      `${schemaFile} could not be read. If the schema moved, update the import.meta.glob path in this test.`,
    );
  const declaration = source.indexOf("pgEnum('activity_log_action', [");
  if (declaration < 0)
    throw new Error(
      `${schemaFile} no longer declares pgEnum('activity_log_action'); update this guard.`,
    );
  const start = source.indexOf('[', declaration);
  const end = source.indexOf(']', start);
  return [...source.slice(start, end).matchAll(/'([^']+)'/gu)].flatMap(
    (match) => (match[1] === undefined ? [] : [match[1]]),
  );
}

it('knows every Activity Log action the API can return', () => {
  const actions = apiActivityActions(Object.values(schemaSources)[0]);
  expect(actions.length).toBeGreaterThan(100);
  expect(
    actions.filter(
      (action) =>
        !NOT_RETURNED_TO_ACTIVITY.has(action) && !isActivityAction(action),
    ),
  ).toEqual([]);
});
