import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { mutationModules } from './mutation/modules.mjs';
import {
  mutationTargets,
  postWeeklyComment,
  renderComment,
  reportWeeklyMutation,
  selectChangedModules,
  strykerConfig,
  summarizeReport,
} from './weekly-mutation.mjs';

const repository = (path) => new URL(`../${path}`, import.meta.url);
const now = new Date('2026-11-09T07:30:00Z');
const since = '2026-11-02T07:30:00.000Z';
const run = {
  url: 'https://github.com/owner/repo/actions/runs/77',
  artifacts: {
    'destructive-migrations':
      'https://github.com/owner/repo/actions/runs/77/artifacts/5',
    'external-invoice-captured-grants':
      'https://github.com/owner/repo/actions/runs/77/artifacts/6',
  },
};

function mutant(id, status, line, overrides = {}) {
  return {
    id: String(id),
    mutatorName: 'ConditionalExpression',
    replacement: 'true',
    status,
    location: {
      start: { line, column: 3 },
      end: { line, column: 9 },
    },
    ...overrides,
  };
}

function report(file, mutants) {
  return {
    schemaVersion: '1.0',
    files: { [file]: { language: 'typescript', source: '', mutants } },
  };
}

test('the allowlist names the three measured modules, each with an existing unit test and a supported runner', () => {
  const modules = mutationModules.map((entry) => entry.module);
  for (const measured of [
    'scripts/destructive-migrations.mjs',
    'apps/api/src/access/external-invoice-captured-grants.ts',
    'apps/web/src/commercial-intake/opportunity-outcome.ts',
  ])
    assert.ok(modules.includes(measured), `missing ${measured}`);
  const ids = mutationTargets().map((target) => target.id);
  assert.equal(new Set(ids).size, ids.length, 'module ids must be unique');
  for (const entry of mutationModules) {
    assert.ok(existsSync(repository(entry.module)), entry.module);
    assert.ok(existsSync(repository(entry.test)), entry.test);
    assert.ok(['node:test', 'vitest'].includes(entry.runner), entry.runner);
    assert.match(entry.reason, /\w/u, `${entry.module} needs a reason`);
    // A pure module has no PostgreSQL or browser test.
    assert.doesNotMatch(entry.test, /\.(rest|migration|spec)\.test\./u);
  }
});

test('each target runs from its package with a report path inside it', () => {
  const targets = Object.fromEntries(
    mutationTargets().map((target) => [target.id, target]),
  );
  assert.deepEqual(targets['destructive-migrations'], {
    id: 'destructive-migrations',
    module: 'scripts/destructive-migrations.mjs',
    project: '.',
    report: 'coverage/mutation/destructive-migrations.json',
  });
  assert.deepEqual(targets['external-invoice-captured-grants'], {
    id: 'external-invoice-captured-grants',
    module: 'apps/api/src/access/external-invoice-captured-grants.ts',
    project: 'apps/api',
    report: 'apps/api/coverage/mutation/external-invoice-captured-grants.json',
  });
  assert.equal(targets['opportunity-outcome'].project, 'apps/web');
  for (const target of Object.values(targets))
    assert.ok(
      target.project === '.' || target.module.startsWith(`${target.project}/`),
    );
});

test('only the allowlisted modules changed on main in the last 7 days are selected', () => {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    return [
      'apps/api/src/access/external-invoice-captured-grants.ts',
      'docs/agents/issue-execution.md',
      '',
      // A test change alone does not select its module.
      'apps/web/src/commercial-intake/opportunity-outcome.test.ts',
      'apps/api/src/access/external-invoice-captured-grants.ts',
      'scripts/destructive-migrations.mjs',
    ].join('\n');
  };
  const selection = selectChangedModules({ git, now });
  assert.equal(selection.since, since);
  assert.deepEqual(calls, [
    [
      'log',
      '--no-renames',
      '--name-only',
      '--format=',
      `--since=${since}`,
      'origin/main',
    ],
  ]);
  assert.deepEqual(
    selection.modules.map((target) => target.id),
    ['destructive-migrations', 'external-invoice-captured-grants'],
  );
  assert.deepEqual(
    selectChangedModules({ git: () => 'README.md\n', now }).modules,
    [],
  );
});

test('every Stryker config uses the command runner on the module and its unit test only', () => {
  const guard = strykerConfig('destructive-migrations');
  assert.equal(guard.testRunner, 'command');
  assert.equal(
    guard.commandRunner.command,
    'node --test scripts/destructive-migrations.test.mjs',
  );
  assert.deepEqual(guard.mutate, ['scripts/destructive-migrations.mjs']);
  // The guard's test reads the real migrations, metadata included.
  assert.deepEqual(guard.ignorePatterns, [
    '/**',
    '!/scripts/**',
    '!/apps/api/drizzle/**',
  ]);
  assert.deepEqual(guard.jsonReporter, {
    fileName: 'coverage/mutation/destructive-migrations.json',
  });

  const grants = strykerConfig('external-invoice-captured-grants');
  assert.equal(grants.testRunner, 'command');
  // The CLI reporter replaces the GitHub Actions reporters the config adds,
  // whose relative path does not exist inside the sandbox.
  assert.equal(
    grants.commandRunner.command,
    'node node_modules/vitest/vitest.mjs run --reporter=dot src/access/external-invoice-captured-grants.test.ts',
  );
  assert.deepEqual(grants.mutate, [
    'src/access/external-invoice-captured-grants.ts',
  ]);
  assert.deepEqual(grants.ignorePatterns, [
    '/**',
    '!/package.json',
    '!/tsconfig*.json',
    '!/vite*.config.ts',
    '!/src/**',
  ]);
  assert.deepEqual(grants.jsonReporter, {
    fileName: 'coverage/mutation/external-invoice-captured-grants.json',
  });

  for (const { id } of mutationTargets()) {
    const config = strykerConfig(id);
    assert.equal(config.testRunner, 'command', id);
    assert.equal(config.incremental, false, id);
    assert.ok(config.reporters.includes('json'), id);
    assert.equal(config.thresholds?.break ?? null, null, 'never fails a run');
  }
  assert.throws(() => strykerConfig('unknown'), /unknown/u);
});

test('a report is summarized with its score, counts and surviving mutants in source order', () => {
  const summary = summarizeReport(
    report('src/access/grants.ts', [
      mutant(1, 'Killed', 3),
      mutant(2, 'Killed', 4),
      mutant(3, 'Timeout', 5),
      mutant(4, 'Survived', 20, { mutatorName: 'Regex', replacement: '/a/' }),
      mutant(5, 'Survived', 8),
      mutant(6, 'NoCoverage', 9),
      mutant(7, 'CompileError', 10),
      mutant(8, 'Ignored', 11),
    ]),
    'apps/api',
  );
  assert.deepEqual(
    {
      killed: summary.killed,
      timeout: summary.timeout,
      survived: summary.survived,
      noCoverage: summary.noCoverage,
    },
    { killed: 2, timeout: 1, survived: 2, noCoverage: 1 },
  );
  // Detected (killed or timed out) over valid mutants, as Stryker scores it.
  assert.equal(summary.score, 50);
  assert.deepEqual(summary.survivors, [
    {
      file: 'apps/api/src/access/grants.ts',
      line: 8,
      mutator: 'ConditionalExpression',
      replacement: 'true',
    },
    {
      file: 'apps/api/src/access/grants.ts',
      line: 20,
      mutator: 'Regex',
      replacement: '/a/',
    },
  ]);
  assert.equal(summarizeReport(report('x.mjs', []), '.').score, undefined);
  assert.equal(
    summarizeReport(report('scripts/x.mjs', [mutant(1, 'Survived', 2)]), '.')
      .survivors[0].file,
    'scripts/x.mjs',
  );
});

test('the comment says when no allowlisted module changed and nothing ran', () => {
  const body = renderComment({ since, modules: [], reports: {}, run });
  assert.match(body, /^<!-- weekly-mutation -->\n## Weekly mutation run\n/u);
  assert.match(
    body,
    /No allowlisted module changed on `main` since 2026-11-02 07:30 UTC, so no mutation testing ran\./u,
  );
  assert.ok(body.includes('`scripts/mutation/modules.mjs`'));
  assert.ok(body.includes(run.url));
});

test('the comment reports a failed selection instead of claiming nothing changed', () => {
  const body = renderComment({
    since: '',
    modules: undefined,
    reports: {},
    run,
  });
  assert.match(body, /could not select the changed modules/u);
  assert.doesNotMatch(body, /no mutation testing ran/u);
  assert.ok(body.includes(run.url));
});

test('the comment gives each module its score, counts, capped survivors and artifact link', () => {
  const [guard, grants] = selectChangedModules({
    git: () =>
      'scripts/destructive-migrations.mjs\napps/api/src/access/external-invoice-captured-grants.ts\n',
    now,
  }).modules;
  const survivors = Array.from({ length: 35 }, (_, index) =>
    mutant(index + 10, 'Survived', 100 - index, {
      mutatorName: 'StringLiteral',
      replacement: index === 34 ? '"a | b `c`"' : `"${index}"`,
    }),
  );
  const body = renderComment({
    since,
    modules: [guard, grants],
    reports: {
      'destructive-migrations': report('scripts/destructive-migrations.mjs', [
        mutant(1, 'Killed', 1),
        mutant(2, 'Timeout', 2),
        ...survivors,
      ]),
    },
    run,
  });
  const [header, guardSection, grantsSection] = body.split('\n### ');
  assert.match(
    header,
    /\n2 allowlisted modules changed on `main` since 2026-11-02 07:30 UTC\./u,
  );
  assert.ok(guardSection.startsWith('`scripts/destructive-migrations.mjs`\n'));
  assert.match(
    guardSection,
    /Score 5\.4%: 1 killed, 1 timed out, 35 survived, 0 without coverage\./u,
  );
  assert.ok(
    guardSection.includes(
      '[full JSON report](https://github.com/owner/repo/actions/runs/77/artifacts/5)',
    ),
  );
  const rows = guardSection
    .split('\n')
    .filter((line) => line.startsWith('| `scripts/'));
  assert.equal(rows.length, 30);
  // Pipes and backticks in a replacement cannot break the table.
  assert.equal(
    rows[0],
    '| `scripts/destructive-migrations.mjs:66` | StringLiteral | ``"a \\| b `c`"`` |',
  );
  assert.equal(
    rows.at(-1),
    '| `scripts/destructive-migrations.mjs:95` | StringLiteral | `"5"` |',
  );
  assert.match(guardSection, /Showing 30 of 35 surviving mutants\./u);
  // A selected module without a report points to the run.
  assert.ok(
    grantsSection.startsWith(
      '`apps/api/src/access/external-invoice-captured-grants.ts`\n',
    ),
  );
  assert.match(
    grantsSection,
    /No report: its mutation job failed or timed out; see \[the run\]\(https:\/\/github\.com\/owner\/repo\/actions\/runs\/77\)\./u,
  );
});

test('a module whose mutants were all detected lists no survivors', () => {
  const [grants] = selectChangedModules({
    git: () => 'apps/api/src/access/external-invoice-captured-grants.ts\n',
    now,
  }).modules;
  const body = renderComment({
    since,
    modules: [grants],
    reports: {
      'external-invoice-captured-grants': report(
        'src/access/external-invoice-captured-grants.ts',
        [mutant(1, 'Killed', 4)],
      ),
    },
    run,
  });
  assert.match(body, /\n1 allowlisted module changed on `main`/u);
  assert.match(body, /Score 100\.0%: 1 killed, 0 timed out, 0 survived/u);
  assert.match(body, /No mutant survived\./u);
  assert.doesNotMatch(body, /\| Location \|/u);
});

/** An in-memory GitHub REST API that records every call. */
function github({ issues = [], artifacts = [], failing = [] } = {}) {
  const calls = [];
  async function api(method, path, body) {
    calls.push({ method, path, body });
    if (failing.some((prefix) => path.startsWith(prefix)))
      throw new Error('HTTP 422');
    if (
      method === 'GET' &&
      path === 'issues?labels=weekly-inspection&state=open&per_page=100'
    )
      return structuredClone(issues);
    if (method === 'GET' && path === 'actions/runs/77/artifacts?per_page=100')
      return { total_count: artifacts.length, artifacts };
    if (method === 'POST' && path === 'labels') return { name: body.name };
    if (method === 'POST' && path === 'issues') return { number: 900, ...body };
    if (method === 'POST' && /^issues\/\d+\/comments$/u.test(path)) return {};
    throw new Error(`unexpected ${method} ${path}`);
  }
  const writes = () => calls.filter((call) => call.method !== 'GET');
  return { api, writes };
}

const quiet = () => {};

test('the comment goes to the oldest open weekly-inspection issue', async () => {
  const fake = github({
    issues: [
      { number: 14, title: 'Weekly inspection' },
      { number: 9, title: 'Weekly inspection' },
      { number: 3, title: 'a pull request', pull_request: {} },
    ],
  });
  await postWeeklyComment({ api: fake.api, body: 'report', log: quiet });
  assert.deepEqual(fake.writes(), [
    { method: 'POST', path: 'issues/9/comments', body: { body: 'report' } },
  ]);
});

test('a posted mention is inert: it notifies nobody and starts no Codex task', async () => {
  const fake = github({ issues: [{ number: 9 }] });
  const zeroWidthSpace = String.fromCodePoint(0x200b);
  await postWeeklyComment({
    api: fake.api,
    body: '@codex review\n| `"@octocat"` | `ops@example.com` (@team)',
    log: quiet,
  });
  assert.equal(
    fake.writes()[0].body.body,
    `@${zeroWidthSpace}codex review\n| \`"@${zeroWidthSpace}octocat"\` | \`ops@example.com\` (@${zeroWidthSpace}team)`,
  );
});

test('without an open weekly-inspection issue, it creates one and comments on it', async () => {
  for (const failing of [[], ['labels']]) {
    const fake = github({ failing });
    await postWeeklyComment({ api: fake.api, body: 'report', log: quiet });
    const writes = fake.writes();
    assert.deepEqual(
      writes.map(({ method, path }) => `${method} ${path}`),
      ['POST labels', 'POST issues', 'POST issues/900/comments'],
    );
    assert.equal(writes[0].body.name, 'weekly-inspection');
    assert.equal(writes[1].body.title, 'Weekly inspection');
    assert.deepEqual(writes[1].body.labels, ['weekly-inspection']);
    assert.match(writes[1].body.body, /never blocks a pull request/u);
    assert.deepEqual(writes[2].body, { body: 'report' });
  }
});

test('the report reads each selected module and links it to its run artifact', async () => {
  const [guard, grants] = selectChangedModules({
    git: () =>
      'scripts/destructive-migrations.mjs\napps/api/src/access/external-invoice-captured-grants.ts\n',
    now,
  }).modules;
  const githubRun = {
    server: 'https://github.com',
    repository: 'owner/repo',
    runId: '77',
  };
  const read = [];
  const readReport = (target) => {
    read.push(target.id);
    return target.id === 'destructive-migrations'
      ? report('scripts/destructive-migrations.mjs', [mutant(1, 'Survived', 4)])
      : undefined;
  };
  const linked = github({
    issues: [{ number: 9 }],
    artifacts: [
      { id: 8, name: 'unrelated' },
      { id: 5, name: 'weekly-mutation-destructive-migrations' },
    ],
  });
  await reportWeeklyMutation({
    modules: [guard, grants],
    since,
    readReport,
    api: linked.api,
    run: githubRun,
    log: quiet,
  });
  assert.deepEqual(read, [
    'destructive-migrations',
    'external-invoice-captured-grants',
  ]);
  const [comment] = linked.writes();
  assert.equal(comment.path, 'issues/9/comments');
  assert.ok(
    comment.body.body.includes(
      '[full JSON report](https://github.com/owner/repo/actions/runs/77/artifacts/5)',
    ),
  );
  assert.ok(comment.body.body.includes('No report: its mutation job failed'));

  // An unreadable artifact list still posts, linking the run instead.
  const unlisted = github({
    issues: [{ number: 9 }],
    failing: ['actions/'],
  });
  await reportWeeklyMutation({
    modules: [guard],
    since,
    readReport,
    api: unlisted.api,
    run: githubRun,
    log: quiet,
  });
  assert.ok(
    unlisted
      .writes()[0]
      .body.body.includes(
        '[full JSON report](https://github.com/owner/repo/actions/runs/77)',
      ),
  );
});

test('the Stryker config file builds the config of MUTATION_MODULE', () => {
  const config = new URL('./mutation/stryker.config.mjs', import.meta.url);
  const load = (module) =>
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `const { default: config } = await import(${JSON.stringify(
          config.href,
        )}); console.log(JSON.stringify(config.mutate));`,
      ],
      { env: { ...process.env, MUTATION_MODULE: module }, encoding: 'utf8' },
    );
  const loaded = load('opportunity-outcome');
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.equal(
    loaded.stdout.trim(),
    '["src/commercial-intake/opportunity-outcome.ts"]',
  );
  assert.notEqual(load('unknown').status, 0);
});

test('the command refuses an unknown subcommand', () => {
  const script = fileURLToPath(
    new URL('./weekly-mutation.mjs', import.meta.url),
  );
  const result = spawnSync(process.execPath, [script, 'unknown'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage/u);
});
