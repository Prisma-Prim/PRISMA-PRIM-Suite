import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  classifyTestFiles,
  repeatMatrix,
  selectRepeatTests,
  testFamilies,
} from './ci-changed-tests.mjs';

const everythingExists = () => true;

test('changed files are grouped into the four repeatable test families', () => {
  assert.deepEqual(
    classifyTestFiles(
      [
        'apps/web/e2e/tasks.spec.ts',
        'apps/api/src/client/client.rest.test.ts',
        'apps/web/src/App.test.tsx',
        'apps/web/e2e/mission-plan.acceptance.spec.ts',
        'apps/web/src/access/bundle.test.ts',
        'apps/api/src/access/access.migration.test.ts',
      ],
      everythingExists,
    ),
    {
      api: [
        'apps/api/src/access/access.migration.test.ts',
        'apps/api/src/client/client.rest.test.ts',
      ],
      web: ['apps/web/src/App.test.tsx', 'apps/web/src/access/bundle.test.ts'],
      browser: ['apps/web/e2e/tasks.spec.ts'],
      acceptance: ['apps/web/e2e/mission-plan.acceptance.spec.ts'],
    },
  );
});

test('helpers, fixtures, scripts, documentation and configuration are never repeated', () => {
  const grouped = classifyTestFiles(
    [
      'apps/web/e2e/actor-context.fixture.ts',
      'apps/web/e2e/client-registration-evidence.probe.ts',
      'apps/web/e2e/operational-foundation.global-setup.mjs',
      'apps/web/src/test/setup.ts',
      'apps/api/test-support/postgres.ts',
      'apps/api/src/client/client.service.ts',
      'apps/web/src/App.tsx',
      'scripts/ci-change-scope.test.mjs',
      '.railway/config.test.mjs',
      'docs/agents/known-flaky-tests.md',
      'apps/web/playwright.config.ts',
      'apps/web/e2e/nested/deep.spec.ts',
      'packages/other/src/a.test.ts',
    ],
    everythingExists,
  );
  assert.deepEqual(grouped, {
    api: [],
    web: [],
    browser: [],
    acceptance: [],
  });
});

test('deleted test files and duplicate paths are dropped', () => {
  const present = new Set(['apps/web/src/kept.test.tsx']);
  assert.deepEqual(
    classifyTestFiles(
      [
        'apps/web/src/kept.test.tsx',
        'apps/web/src/kept.test.tsx',
        'apps/web/src/removed.test.tsx',
      ],
      (path) => present.has(path),
    ).web,
    ['apps/web/src/kept.test.tsx'],
  );
});

test('a test file whose name is not plain ASCII path text is refused, never passed to a command', () => {
  for (const path of [
    'apps/web/src/a b.test.ts',
    'apps/web/src/$(touch x).test.ts',
    'apps/web/e2e/a;b.spec.ts',
    'apps/api/src/é.test.ts',
    'apps/api/src/a\nb.test.ts',
  ])
    assert.throws(
      () => classifyTestFiles([path], everythingExists),
      /unsupported test file name/u,
      path,
    );
});

test('no changed test produces an empty matrix', () => {
  assert.deepEqual(
    repeatMatrix({ api: [], web: [], browser: [], acceptance: [] }),
    { include: [] },
  );
});

test('each family keeps its own environment needs and splits into bounded parallel jobs', () => {
  const files = (count, prefix) =>
    Array.from({ length: count }, (_, i) => `${prefix}${i}.test.ts`);
  const { include } = repeatMatrix({
    api: files(testFamilies.api.filesPerJob + 1, 'apps/api/src/a'),
    web: ['apps/web/src/b.test.ts'],
    browser: ['apps/web/e2e/c.spec.ts'],
    acceptance: ['apps/web/e2e/d.acceptance.spec.ts'],
  });
  assert.deepEqual(
    include.map(({ label }) => label),
    ['api 1/2', 'api 2/2', 'web', 'browser', 'acceptance'],
  );
  assert.equal(include[0].files.length, testFamilies.api.filesPerJob);
  assert.equal(include[1].files.length, 1);
  assert.deepEqual(
    include.map(({ family, postgres, chromium, doctor }) => ({
      family,
      postgres,
      chromium,
      doctor,
    })),
    [
      ...['api', 'api'].map((family) => ({
        family,
        postgres: 'true',
        chromium: 'false',
        doctor: 'agent:doctor:postgres',
      })),
      {
        family: 'web',
        postgres: 'false',
        chromium: 'false',
        doctor: 'agent:doctor',
      },
      {
        family: 'browser',
        postgres: 'false',
        chromium: 'true',
        doctor: 'agent:doctor:web',
      },
      {
        family: 'acceptance',
        postgres: 'true',
        chromium: 'true',
        doctor: 'agent:doctor:web-postgres',
      },
    ],
  );
});

test('only pull requests repeat tests, and an unreadable change list fails closed', () => {
  const read = () => ['apps/web/src/new.test.tsx', 'README.md'];
  for (const event of ['merge_group', 'workflow_dispatch', 'push', undefined])
    assert.deepEqual(
      selectRepeatTests({
        event,
        base: 'a',
        head: 'b',
        readChangedFiles: () => assert.fail('must not read the diff'),
      }),
      { repeatTests: 'false', matrix: { include: [] } },
      String(event),
    );
  const selected = selectRepeatTests({
    event: 'pull_request',
    base: 'a',
    head: 'b',
    readChangedFiles: read,
    exists: everythingExists,
  });
  assert.equal(selected.repeatTests, 'true');
  assert.deepEqual(selected.matrix.include[0].files, [
    'apps/web/src/new.test.tsx',
  ]);
  assert.deepEqual(
    selectRepeatTests({
      event: 'pull_request',
      base: 'a',
      head: 'b',
      readChangedFiles: () => ['README.md', 'scripts/x.test.mjs'],
      exists: everythingExists,
    }),
    { repeatTests: 'false', matrix: { include: [] } },
  );
  assert.throws(
    () =>
      selectRepeatTests({
        event: 'pull_request',
        base: 'a',
        head: 'b',
        readChangedFiles: () => undefined,
      }),
    /could not read the changed files/u,
  );
});

test('the CLI reads a real pull request diff and writes the scope outputs', () => {
  const repository = mkdtempSync(join(tmpdir(), 'ci-changed-tests-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: repository, encoding: 'utf8' });
  const write = (path, content) => {
    const target = join(repository, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  };
  try {
    git('init', '-q');
    git('config', 'user.email', 'changed@example.test');
    git('config', 'user.name', 'Changed Test');
    write('apps/web/src/old.test.tsx', 'old\n');
    write('apps/web/src/stable.test.tsx', 'stable\n');
    write('README.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD').trim();
    write('apps/web/src/stable.test.tsx', 'modified\n');
    write('apps/web/e2e/new.acceptance.spec.ts', 'added\n');
    write('apps/web/e2e/new.spec.ts', 'added\n');
    write('README.md', 'changed\n');
    unlinkSync(join(repository, 'apps/web/src/old.test.tsx'));
    git('add', '-A');
    git('commit', '-qm', 'head');
    const head = git('rev-parse', 'HEAD').trim();
    const output = join(repository, 'github-output');
    const run = (environment) => {
      rmSync(output, { force: true });
      const child = spawnSync(
        process.execPath,
        [fileURLToPath(new URL('./ci-changed-tests.mjs', import.meta.url))],
        {
          cwd: repository,
          env: {
            ...process.env,
            EVENT_NAME: 'pull_request',
            BASE_SHA: base,
            HEAD_SHA: head,
            ...environment,
            GITHUB_OUTPUT: output,
          },
          encoding: 'utf8',
        },
      );
      return {
        child,
        written: child.status === 0 ? readFileSync(output, 'utf8') : '',
      };
    };
    const selected = run({});
    assert.equal(selected.child.status, 0, selected.child.stderr);
    const lines = Object.fromEntries(
      selected.written
        .trimEnd()
        .split('\n')
        .map((line) => [
          line.slice(0, line.indexOf('=')),
          line.slice(line.indexOf('=') + 1),
        ]),
    );
    assert.equal(lines.repeat_tests, 'true');
    const { include } = JSON.parse(lines.repeat_matrix);
    assert.deepEqual(
      include.map(({ family, files }) => [family, files]),
      [
        ['web', ['apps/web/src/stable.test.tsx']],
        ['browser', ['apps/web/e2e/new.spec.ts']],
        ['acceptance', ['apps/web/e2e/new.acceptance.spec.ts']],
      ],
    );
    assert.equal(
      selected.child.stdout.trim().split('\n')[0],
      'repeat_tests=true',
    );

    const merge = run({
      EVENT_NAME: 'merge_group',
      BASE_SHA: '',
      HEAD_SHA: '',
    });
    assert.equal(merge.child.status, 0, merge.child.stderr);
    assert.equal(
      merge.written,
      'repeat_tests=false\nrepeat_matrix={"include":[]}\n',
    );

    const unreadable = run({ BASE_SHA: '', HEAD_SHA: '' });
    assert.notEqual(unreadable.child.status, 0);
    assert.match(unreadable.child.stderr, /could not read the changed files/u);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});
