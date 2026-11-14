import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { listJourneys } from './verify-journey.mjs';

// The journey-audit skill walks the journeys of its map (#1277). A spec with
// no row is never audited, and a row whose spec is gone sends an audit to a
// journey that no longer exists. Journeys are named as `pnpm verify:journey
// --list` prints them. The Sections table and the Access cells say how a user
// reaches each screen (#1341); a stale anchor sends an agent to the wrong one.
const root = fileURLToPath(new URL('..', import.meta.url));
const map = '.agents/skills/journey-audit/journey-map.md';
const shell = 'apps/web/src/production-shell/ApplicationShell.tsx';

const backticked = (cell) => [...cell.matchAll(/`([^`]+)`/gu)].map((m) => m[1]);

/** The map's two tables: Sections rows start with `#<id>`, Journeys rows with the journey. */
export function parseJourneyMap(text) {
  const rows = text
    .split(/\r?\n/u)
    .filter((line) => /^\|\s*`/u.test(line))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
  const isSection = (cells) => cells[0].startsWith('`#');
  return {
    sections: rows.filter(isSection).map(([id, label, , journeys]) => ({
      id: id.replace(/^`#|`$/gu, ''),
      label: label ?? '',
      journeys: backticked(journeys ?? ''),
    })),
    journeys: rows
      .filter((cells) => !isSection(cells))
      .map(([journey, prd, roles, entry]) => ({
        journey: journey.replace(/^`|`$/gu, ''),
        links: [...prd.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/gu)].map(
          (match) => match[1],
        ),
        roles: roles ?? '',
        sections: backticked(entry ?? '')
          .filter((anchor) => anchor.startsWith('#'))
          .map((anchor) => anchor.slice(1)),
      })),
  };
}

/** Ids of the `ApplicationSection` union, plus the overview at `/`. */
export function parseSectionIds(shellSource) {
  const union = /interface ApplicationSection \{\s*id:([^;]+);/u.exec(
    shellSource,
  );
  assert.ok(union, `Expected the ApplicationSection id union in ${shell}.`);
  return [
    'overview',
    ...[...union[1].matchAll(/'([a-z-]+)'/gu)].map((m) => m[1]),
  ];
}

/** A journey's code enters a section by its hash, its English label or, for the overview, `/`. */
function mentions(code, section) {
  const hash = new RegExp(`#${section.id}(?![\\w-])`, 'u');
  return (
    hash.test(code) ||
    code.includes(`'${section.label}'`) ||
    (section.id === 'overview' && code.includes("goto('/')"))
  );
}

/**
 * Problems in the Sections table and Access cells. `journeyCode(journey)` is
 * the spec with the local and application modules it imports, and
 * `labelInSource(label)` says whether the web source has that string literal.
 */
export function accessProblems({
  text,
  sectionIds,
  journeyCode,
  labelInSource,
}) {
  const { sections, journeys } = parseJourneyMap(text);
  const listed = sections.map((section) => section.id);
  const problems = [];
  for (const id of sectionIds.filter((id) => !listed.includes(id)))
    problems.push(`Section #${id} has no row in the Sections table.`);
  for (const id of listed.filter((id) => !sectionIds.includes(id)))
    problems.push(`Sections row #${id} names no ApplicationSection id.`);
  for (const id of listed.filter((id, index) => listed.indexOf(id) !== index))
    problems.push(`Section #${id} has more than one row.`);
  for (const section of sections) {
    if (!labelInSource(section.label))
      problems.push(
        `Section #${section.id}: '${section.label}' is not a string literal in apps/web/src.`,
      );
    const walking = journeys
      .filter((row) => row.sections.includes(section.id))
      .map((row) => row.journey);
    if (walking.join() !== section.journeys.join())
      problems.push(
        `Section #${section.id}: list the journeys ${walking.join(', ') || 'none'}.`,
      );
  }
  for (const row of journeys) {
    if (row.sections.length === 0)
      problems.push(`${row.journey}: its Access cell names no section.`);
    for (const id of row.sections) {
      const section = sections.find((candidate) => candidate.id === id);
      if (!section || !sectionIds.includes(id))
        problems.push(`${row.journey}: #${id} is not a section.`);
      else if (!mentions(journeyCode(row.journey), section))
        problems.push(
          `${row.journey}: its spec never enters #${id} ('${section.label}').`,
        );
    }
  }
  return problems;
}

const text = await readFile(join(root, map), 'utf8');
const rows = parseJourneyMap(text).journeys;

/** The spec plus the e2e helpers and application modules it imports. */
async function readJourneyCode(journey) {
  const e2e = join(root, 'apps/web/e2e');
  const spec = await readFile(
    join(e2e, `${journey}.acceptance.spec.ts`),
    'utf8',
  );
  const imports = [...spec.matchAll(/from '(\.\.?\/[^']+)'/gu)].map(
    (m) => m[1],
  );
  const parts = await Promise.all(
    imports.flatMap((path) =>
      ['.ts', '.tsx'].map((extension) =>
        readFile(resolve(e2e, `${path}${extension}`), 'utf8').catch(() => ''),
      ),
    ),
  );
  return [spec, ...parts].join('\n');
}

async function readWebSource() {
  const src = join(root, 'apps/web/src');
  const files = (await readdir(src, { recursive: true })).filter(
    (name) => /\.tsx?$/u.test(name) && !/\.test\.tsx?$/u.test(name),
  );
  return (
    await Promise.all(files.map((name) => readFile(join(src, name), 'utf8')))
  ).join('\n');
}

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

test('the Sections table and Access cells match the shell and the specs', async () => {
  const source = await readWebSource();
  const code = new Map(
    await Promise.all(
      rows.map(async (row) => [
        row.journey,
        await readJourneyCode(row.journey),
      ]),
    ),
  );
  const problems = accessProblems({
    text,
    sectionIds: parseSectionIds(await readFile(join(root, shell), 'utf8')),
    journeyCode: (journey) => code.get(journey) ?? '',
    labelInSource: (label) => source.includes(`'${label}'`),
  });
  assert.deepEqual(problems, [], `Correct ${map}:\n${problems.join('\n')}`);
});

test('the access check reports each kind of drift', () => {
  const fixture = [
    '| `#overview` | Overview | Home | `home` |',
    '| `#clients` | Clients | Clients | `client` |',
    '| `client` | [PRD](x.md) | reader | `#clients` → Open dossier |',
    '| `home` | [PRD](x.md) | reader | `#overview` → My attention |',
  ].join('\n');
  const check = (overrides) =>
    accessProblems({
      text: fixture,
      sectionIds: ['overview', 'clients'],
      journeyCode: (journey) =>
        journey === 'client' ? "page.goto('/#clients')" : "page.goto('/')",
      labelInSource: () => true,
      ...overrides,
    });

  assert.deepEqual(check({}), []);
  assert.deepEqual(check({ sectionIds: ['overview', 'clients', 'ideas'] }), [
    'Section #ideas has no row in the Sections table.',
  ]);
  assert.deepEqual(check({ sectionIds: ['overview'] }), [
    'Sections row #clients names no ApplicationSection id.',
    'client: #clients is not a section.',
  ]);
  assert.deepEqual(check({ labelInSource: (label) => label !== 'Clients' }), [
    "Section #clients: 'Clients' is not a string literal in apps/web/src.",
  ]);
  assert.deepEqual(check({ journeyCode: () => "page.goto('/')" }), [
    "client: its spec never enters #clients ('Clients').",
  ]);
  assert.deepEqual(
    check({
      text: fixture.replace('`#clients` → Open dossier', 'Open dossier'),
    }),
    [
      'Section #clients: list the journeys none.',
      'client: its Access cell names no section.',
    ],
  );
  assert.deepEqual(
    check({ text: fixture.replace('`#overview` → My', '`#ideas` → My') }),
    [
      'Section #overview: list the journeys none.',
      'home: #ideas is not a section.',
    ],
  );
});
