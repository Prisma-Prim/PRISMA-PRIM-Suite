import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { listJourneys } from './verify-journey.mjs';

// The journey-audit skill walks the journeys of its map (#1277). A spec with
// no row is never audited, and a row whose spec is gone sends an audit to a
// journey that no longer exists. Journeys are named as `pnpm verify:journey
// --list` prints them.
const root = fileURLToPath(new URL('..', import.meta.url));
const map = '.agents/skills/journey-audit/journey-map.md';

/** Rows of the map table: the journey, its PRD links and its roles. */
function parseJourneyMap(text) {
  return text
    .split(/\r?\n/u)
    .filter((line) => /^\|\s*`/u.test(line))
    .map((line) => {
      const [journey, prd, roles] = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      return {
        journey: journey.replace(/^`|`$/gu, ''),
        links: [...prd.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/gu)].map(
          (match) => match[1],
        ),
        roles: roles ?? '',
      };
    });
}

const rows = parseJourneyMap(await readFile(join(root, map), 'utf8'));

test('the journey map lists every acceptance journey exactly once', async () => {
  const journeys = await listJourneys(root);
  const listed = rows.map((row) => row.journey);
  assert.ok(journeys.length > 0, 'Expected acceptance journeys to exist.');

  const missing = journeys.filter((journey) => !listed.includes(journey));
  const stale = listed.filter((journey) => !journeys.includes(journey));
  assert.deepEqual(
    { missing, stale },
    { missing: [], stale: [] },
    `In ${map}, add a row for each missing journey and remove or rename ` +
      'each stale row, whose apps/web/e2e/<journey>.acceptance.spec.ts ' +
      `does not exist. Missing: ${missing.join(', ') || 'none'}. ` +
      `Stale: ${stale.join(', ') || 'none'}.`,
  );
  const repeated = listed.filter(
    (journey, index) => listed.indexOf(journey) !== index,
  );
  assert.deepEqual(repeated, [], `Keep one row per journey in ${map}.`);
});

test('every journey map row names its roles and links an existing PRD', async () => {
  for (const row of rows) {
    assert.ok(row.roles, `${row.journey}: name the roles it walks in ${map}.`);
    assert.ok(
      row.links.length > 0,
      `${row.journey}: link its owning PRD in ${map}.`,
    );
    for (const link of row.links) {
      const target = resolve(root, dirname(map), decodeURIComponent(link));
      assert.ok(
        relative(join(root, 'docs/product'), target).split(/[\\/]/u)[0] !==
          '..',
        `${row.journey}: ${link} is not a PRD under docs/product.`,
      );
      await assert.doesNotReject(
        access(target),
        `${row.journey}: ${link} does not exist.`,
      );
    }
  }
});
