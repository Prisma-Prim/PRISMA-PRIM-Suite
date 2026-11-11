import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  repeatCount,
  repeatInvocations,
  runRepeats,
} from './ci-repeat-tests.mjs';

test('every changed test is run three times', () => {
  assert.equal(repeatCount, 3);
});

test('Vitest families run a fresh process per repetition on only the changed files', () => {
  assert.deepEqual(
    repeatInvocations({
      family: 'api',
      files: ['apps/api/src/a/a.rest.test.ts', 'apps/api/src/b.test.ts'],
    }),
    Array(3).fill({
      command: 'pnpm',
      args: [
        '--filter',
        '@prisma-prim/api',
        'exec',
        'vitest',
        'run',
        '--no-file-parallelism',
        'src/a/a.rest.test.ts',
        'src/b.test.ts',
      ],
    }),
  );
  assert.deepEqual(
    repeatInvocations({
      family: 'web',
      files: ['apps/web/src/App.test.tsx'],
      repeats: 2,
    }),
    Array(2).fill({
      command: 'pnpm',
      args: [
        '--filter',
        '@prisma-prim/web',
        'exec',
        'vitest',
        'run',
        'src/App.test.tsx',
      ],
    }),
  );
});

test('Playwright families use one --repeat-each run restricted to the changed specs', () => {
  assert.deepEqual(
    repeatInvocations({
      family: 'browser',
      files: ['apps/web/e2e/tasks.spec.ts', 'apps/web/e2e/a-b.spec.ts'],
    }),
    [
      {
        command: 'pnpm',
        args: [
          '--filter',
          '@prisma-prim/web',
          'test:browser',
          '--repeat-each=3',
          'e2e/tasks.spec.ts',
          'e2e/a-b.spec.ts',
        ],
      },
    ],
  );
});

test('acceptance specs repeat as whole Playwright runs, each with its own fresh database', () => {
  // --repeat-each would reuse one database and its fixed synthetic records:
  // every repetition after the first fails with HTTP 409 (seen on real CI).
  assert.deepEqual(
    repeatInvocations({
      family: 'acceptance',
      project: 'operational-acceptance-desktop',
      files: ['apps/web/e2e/mission-plan.acceptance.spec.ts'],
    }),
    Array(3).fill({
      command: 'pnpm',
      args: [
        '--filter',
        '@prisma-prim/web',
        'test:browser:acceptance',
        '--project=operational-acceptance-desktop',
        'e2e/mission-plan.acceptance.spec.ts',
      ],
    }),
  );
  const calls = [];
  const result = runRepeats({
    family: 'acceptance',
    project: 'operational-acceptance-desktop',
    files: ['apps/web/e2e/mission-plan.acceptance.spec.ts'],
    run: () => {
      calls.push(1);
      return calls.length === 3 ? 1 : 0;
    },
  });
  assert.deepEqual(result, { ok: false, failedRepetition: 3, repetitions: 3 });
});

test('a file outside the declared family, an empty list or an unknown family is refused', () => {
  assert.throws(
    () =>
      repeatInvocations({
        family: 'api',
        files: ['apps/web/src/App.test.tsx'],
      }),
    /is not in the api test family/u,
  );
  assert.throws(
    () =>
      repeatInvocations({
        family: 'browser',
        files: ['apps/web/e2e/x.acceptance.spec.ts'],
      }),
    /is not in the browser test family/u,
  );
  assert.throws(
    () => repeatInvocations({ family: 'web', files: [] }),
    /no test files/u,
  );
  assert.throws(
    () => repeatInvocations({ family: 'scripts', files: ['a.test.mjs'] }),
    /unknown test family/u,
  );
});

test('each canonical acceptance project repeats three times and an absent or unknown project fails closed', () => {
  for (const project of [
    'operational-acceptance-desktop',
    'operational-acceptance-narrow',
  ]) {
    const invocations = repeatInvocations({
      family: 'acceptance',
      files: ['apps/web/e2e/mission-plan.acceptance.spec.ts'],
      project,
    });
    assert.equal(invocations.length, 3);
    for (const { args } of invocations)
      assert.deepEqual(args.slice(-2), [
        `--project=${project}`,
        'e2e/mission-plan.acceptance.spec.ts',
      ]);
  }
  for (const project of [undefined, 'missing', '--timeout=0'])
    assert.throws(
      () =>
        repeatInvocations({
          family: 'acceptance',
          files: ['apps/web/e2e/mission-plan.acceptance.spec.ts'],
          project,
        }),
      /canonical acceptance project/u,
    );
  assert.throws(
    () =>
      repeatInvocations({
        family: 'web',
        files: ['apps/web/src/App.test.tsx'],
        project: 'operational-acceptance-desktop',
      }),
    /only supported for acceptance/u,
  );
});

test('the first failing repetition stops the run and fails it', () => {
  const calls = [];
  const statuses = [0, 1, 0];
  const result = runRepeats({
    family: 'web',
    files: ['apps/web/src/App.test.tsx'],
    run: (command, args) => {
      calls.push([command, args]);
      return statuses[calls.length - 1];
    },
  });
  assert.deepEqual(result, { ok: false, failedRepetition: 2, repetitions: 3 });
  assert.equal(calls.length, 2);
  assert.deepEqual(
    runRepeats({
      family: 'web',
      files: ['apps/web/src/App.test.tsx'],
      run: () => 0,
    }),
    { ok: true, failedRepetition: undefined, repetitions: 3 },
  );
  assert.equal(
    runRepeats({
      family: 'browser',
      files: ['apps/web/e2e/tasks.spec.ts'],
      run: () => null,
    }).ok,
    false,
    'a command that could not start is a failure',
  );
});

test('a test that passes once and fails on its second run turns the guard red', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ci-repeat-'));
  const counter = join(directory, 'runs');
  const flaky = join(directory, 'flaky.mjs');
  writeFileSync(counter, '0');
  writeFileSync(
    flaky,
    [
      "import { readFileSync, writeFileSync } from 'node:fs';",
      'const runs = Number(readFileSync(process.argv[2], "utf8")) + 1;',
      'writeFileSync(process.argv[2], String(runs));',
      'process.exit(runs === 2 ? 1 : 0);',
    ].join('\n'),
  );
  try {
    const result = runRepeats({
      family: 'web',
      files: ['apps/web/src/flaky.test.tsx'],
      run: () =>
        spawnSync(process.execPath, [flaky, counter], { stdio: 'ignore' })
          .status,
    });
    assert.deepEqual(result, {
      ok: false,
      failedRepetition: 2,
      repetitions: 3,
    });
    assert.equal(readFileSync(counter, 'utf8'), '2');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the CLI refuses a missing family, malformed files and unsafe names before running anything', () => {
  const cli = fileURLToPath(new URL('./ci-repeat-tests.mjs', import.meta.url));
  for (const environment of [
    {},
    { REPEAT_FAMILY: 'web' },
    { REPEAT_FAMILY: 'web', REPEAT_FILES: 'not json' },
    { REPEAT_FAMILY: 'web', REPEAT_FILES: '"apps/web/src/a.test.ts"' },
    { REPEAT_FAMILY: 'web', REPEAT_FILES: '[]' },
    { REPEAT_FAMILY: 'web', REPEAT_FILES: '[42]' },
    { REPEAT_FAMILY: 'web', REPEAT_FILES: '["apps/web/src/a b.test.ts"]' },
    { REPEAT_FAMILY: 'api', REPEAT_FILES: '["apps/web/src/a.test.ts"]' },
    { REPEAT_FAMILY: 'other', REPEAT_FILES: '["apps/web/src/a.test.ts"]' },
  ]) {
    const child = spawnSync(process.execPath, [cli], {
      env: { PATH: process.env.PATH, ...environment },
      encoding: 'utf8',
    });
    assert.equal(child.status, 1, JSON.stringify(environment));
    assert.match(child.stderr, /Cannot repeat changed tests/u);
  }
});
