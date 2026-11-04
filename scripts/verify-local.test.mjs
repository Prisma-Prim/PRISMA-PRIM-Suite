import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { createProcessGroupController } from './process-group.mjs';
import {
  runLocalVerification,
  validateLocalEvidence,
  verificationFamilies,
} from './verify-local.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'verify-local-contract-'));
  const output = await mkdtemp(join(tmpdir(), 'verify-local-output-'));
  t.after(() =>
    Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(output, { recursive: true, force: true }),
    ]),
  );
  function git(...args) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  git('init', '-b', 'main');
  git('config', 'user.name', 'Local verification contract');
  git('config', 'user.email', 'verification@example.test');
  await writeFile(join(root, 'source.txt'), 'clean source\n');
  git('add', '.');
  git('commit', '-m', 'fixture');
  const source = git('rev-parse', 'HEAD');
  const options = {
    root,
    output,
    source,
    base: 'main',
    mode: 'contract-test',
    families: [
      {
        id: 'child',
        command: process.execPath,
        args: ['-e', 'process.exit(7)'],
      },
    ],
  };
  return { root, output, source, options, git };
}

async function vitestFixture(t, familyId, behavior) {
  const f = await fixture(t);
  const requireApi = createRequire(
    new URL('../apps/api/package.json', import.meta.url),
  );
  const vitestRoot = dirname(requireApi.resolve('vitest/package.json'));
  const events = join(f.output, 'fixture-events.jsonl');
  const results = join(f.output, 'vitest-results.json');
  await writeFile(join(f.root, '.gitignore'), 'node_modules/\n.vite/\n');
  await mkdir(join(f.root, 'node_modules'));
  await symlink(vitestRoot, join(f.root, 'node_modules/vitest'), 'dir');
  await writeFile(
    join(f.root, 'vitest.config.mjs'),
    'export default { test: { include: ["fixture.test.mjs"] } };\n',
  );
  await writeFile(
    join(f.root, 'fixture.test.mjs'),
    `
import { appendFileSync } from 'node:fs';
import { beforeEach, expect, test } from 'vitest';
const event = value => appendFileSync(${JSON.stringify(events)}, JSON.stringify(value) + '\\n');
let cases = 0;
beforeEach(() => event('beforeEach:' + ++cases));
test('first case', async () => {
  event('first:body');
  ${behavior === 'timeout' ? 'await new Promise(() => {});' : behavior === 'assertion' ? 'expect(1).toBe(2);' : 'expect(1).toBe(1);'}
}${behavior === 'timeout' ? ', 50' : ''});
test('next case', () => { event('next:body'); expect(true).toBe(true); });
`,
  );
  f.git('add', '.');
  f.git('commit', '-m', 'real Vitest fixture');
  f.options.source = f.git('rev-parse', 'HEAD');
  const policy = verificationFamilies
    .find((family) => family.id === familyId)
    .args.slice(3);
  f.options.families = [
    {
      id: familyId,
      command: process.execPath,
      args: [
        join(vitestRoot, 'vitest.mjs'),
        'run',
        '--config',
        'vitest.config.mjs',
        ...(familyId === 'api-serial'
          ? ['--no-file-parallelism', '--maxWorkers=1']
          : []),
        ...policy,
        '--reporter=json',
        '--outputFile',
        results,
      ],
      timeoutMilliseconds: 30_000,
    },
    { id: 'later', command: process.execPath, args: ['-e', 'process.exit(0)'] },
  ];
  return { ...f, events, results };
}

for (const familyId of ['api-parallel', 'api-serial']) {
  for (const behavior of ['timeout', 'assertion', 'clean']) {
    test(
      `the canonical ${familyId} policy ${behavior === 'clean' ? 'completes a clean real Vitest run' : `quarantines a real Vitest ${behavior} failure before the next hook or body`}`,
      { timeout: 45_000 },
      async (t) => {
        const f = await vitestFixture(t, familyId, behavior);
        const report = await runLocalVerification(f.options);
        const results = JSON.parse(
          await readFile(f.results, 'utf8').catch(async (error) => {
            throw new Error(
              await readFile(join(f.output, `logs/${familyId}.log`), 'utf8'),
              { cause: error },
            );
          }),
        );
        const clean = behavior === 'clean';
        assert.equal(report.status, clean ? 'passed' : 'failed');
        assert.equal(report.families[0].exitCode, clean ? 0 : 1);
        assert.deepEqual(
          report.families[0].executionOutcome,
          clean
            ? { kind: 'completed' }
            : { kind: 'command_failed', cause: 'undetermined' },
        );
        assert.equal(
          report.families[1].status,
          clean ? 'passed' : 'unexecuted',
        );
        assert.deepEqual(
          (await readFile(f.events, 'utf8'))
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line)),
          clean
            ? ['beforeEach:1', 'first:body', 'beforeEach:2', 'next:body']
            : ['beforeEach:1', 'first:body'],
        );
        assert.equal(results.numFailedTests, clean ? 0 : 1);
        assert.equal(results.numPassedTests, clean ? 2 : 0);
        assert.equal(results.numTotalTests, 2);
        assert.deepEqual(
          results.testResults[0].assertionResults.map(
            (result) => result.status,
          ),
          clean ? ['passed', 'passed'] : ['failed', 'pending'],
        );
        assert.equal(
          results.testResults[0].assertionResults[0].failureMessages.length,
          clean ? 0 : 1,
        );
        await assert.rejects(
          validateLocalEvidence({ root: f.root, output: f.output }),
          /complete|contract-test/,
        );
      },
    );
  }
}

test('a real failing child and unexecuted required families cannot make complete evidence', async (t) => {
  const { options, output } = await fixture(t);
  options.families.push({
    id: 'later',
    command: process.execPath,
    args: ['-e', 'process.exit(0)'],
  });
  const report = await runLocalVerification(options);
  assert.equal(report.status, 'failed');
  assert.equal(report.families[0].exitCode, 7);
  assert.deepEqual(report.families[0].executionOutcome, {
    kind: 'command_failed',
    cause: 'undetermined',
  });
  assert.equal(report.families[1].executionOutcome, null);
  assert.match(
    await readFile(join(output, 'report.md'), 'utf8'),
    /command_failed \(cause undetermined\)/,
  );
  assert.equal(report.families[1].status, 'unexecuted');
  assert.equal(
    JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')).status,
    'failed',
  );
  await assert.rejects(
    validateLocalEvidence({ root: options.root, output }),
    /complete|contract-test/,
  );
});

test('a launch failure retains its structured cause and leaves later families unexecuted', async (t) => {
  const { options, output } = await fixture(t);
  options.families[0].command = join(output, 'missing-executable');
  options.families.push({
    id: 'later',
    command: process.execPath,
    args: ['-e', 'process.exit(0)'],
  });
  const report = await runLocalVerification(options);
  assert.equal(report.status, 'failed');
  assert.equal(report.families[0].status, 'failed');
  assert.equal(report.families[0].exitCode, null);
  assert.deepEqual(report.families[0].executionOutcome, {
    kind: 'launch_failure',
    code: 'ENOENT',
  });
  assert.match(
    await readFile(join(output, 'report.md'), 'utf8'),
    /launch_failure \(execution incomplete\)/,
  );
  assert.equal(report.families[1].status, 'unexecuted');
});

test('a successful minimal orchestration is explicitly synthetic and cannot qualify for merge', async (t) => {
  const { options, output } = await fixture(t);
  options.families = [
    {
      id: 'first',
      command: process.execPath,
      args: ['-e', 'console.log("first executed")'],
    },
    {
      id: 'second',
      command: process.execPath,
      args: ['-e', 'console.log("second executed")'],
    },
  ];
  const report = await runLocalVerification(options);
  assert.equal(report.status, 'passed');
  assert.equal(report.mode, 'contract-test');
  assert.equal(report.families.length, 2);
  assert.ok(
    report.families.every(
      (family) =>
        family.exitCode === 0 && family.startedAt && family.finishedAt,
    ),
  );
  assert.ok(
    report.families.every(
      (family) => family.executionOutcome?.kind === 'completed',
    ),
  );
  assert.equal(
    (await readFile(join(output, 'logs/second.log'), 'utf8')).trim(),
    'second executed',
  );
  await assert.rejects(
    validateLocalEvidence({ root: options.root, output }),
    /contract-test/,
  );
});

test('changed tracked source refuses success and leaves the remaining family unexecuted', async (t) => {
  const { options } = await fixture(t);
  options.families = [
    {
      id: 'change',
      command: process.execPath,
      args: ['-e', 'require("node:fs").writeFileSync("source.txt", "changed")'],
    },
    { id: 'later', command: process.execPath, args: ['-e', 'process.exit(0)'] },
  ];
  const report = await runLocalVerification(options);
  assert.equal(report.status, 'failed');
  assert.match(report.refusal, /clean|changed/);
  assert.equal(report.families[1].status, 'unexecuted');
});

test('untracked source and a checkout missing current base changes are refused', async (t) => {
  const { options, root, git } = await fixture(t);
  git('checkout', '-b', 'base');
  await writeFile(join(root, 'base.txt'), 'base change');
  git('add', '.');
  git('commit', '-m', 'new base');
  git('checkout', 'main');
  options.base = 'base';
  const stale = await runLocalVerification(options);
  assert.equal(stale.status, 'failed');
  assert.match(stale.refusal, /integration tree/);
});

test('production mode cannot substitute a required command and logs omit secret values', async (t) => {
  const { options, output } = await fixture(t);
  await assert.rejects(
    runLocalVerification({ ...options, mode: 'complete' }),
    /synthetic families/,
  );
  options.families = [
    {
      id: 'secrets',
      command: process.execPath,
      args: [
        '-e',
        'console.log("postgresql://user:password@localhost/test Bearer should-disappear token=hidden")',
      ],
    },
  ];
  const report = await runLocalVerification(options);
  assert.equal(report.status, 'passed');
  const log = await readFile(join(output, 'logs/secrets.log'), 'utf8');
  assert.doesNotMatch(log, /password@|should-disappear|token=hidden/);
});

test('new untracked source is not omitted from the input contract', async (t) => {
  const { options, root } = await fixture(t);
  await writeFile(join(root, 'new-source.txt'), 'not committed');
  const report = await runLocalVerification(options);
  assert.equal(report.status, 'failed');
  assert.match(report.refusal, /untracked source/);
  assert.equal(report.families[0].status, 'unexecuted');
});

test(
  'interruption persists failed partial evidence and removes the child process group',
  { timeout: 10_000 },
  async (t) => {
    const { options, output } = await fixture(t);
    const marker = join(output, 'started');
    const controller = new AbortController();
    options.signal = controller.signal;
    options.families = [
      {
        id: 'long-child',
        command: process.execPath,
        args: [
          '-e',
          `require('node:fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid)); require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio:'ignore'}); setInterval(() => {}, 1000);`,
        ],
      },
    ];
    const run = runLocalVerification(options);
    let processGroup;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        processGroup = Number(await readFile(marker, 'utf8'));
        break;
      } catch {
        await new Promise((resolveWait) => setTimeout(resolveWait, 20));
      }
    }
    assert.ok(processGroup, 'real child started');
    t.after(() => {
      try {
        process.kill(-processGroup, 'SIGKILL');
      } catch {
        /* Exited. */
      }
    });
    const partial = JSON.parse(
      await readFile(join(output, 'manifest.json'), 'utf8'),
    );
    assert.equal(partial.status, 'incomplete');
    controller.abort();
    const report = await run;
    assert.equal(report.status, 'failed');
    assert.equal(report.families[0].status, 'interrupted');
    assert.deepEqual(report.families[0].executionOutcome, {
      kind: 'external_interruption',
    });
    assert.equal(
      await createProcessGroupController().isLive(processGroup),
      false,
    );
  },
);

test('changing a synthetic report label cannot replace the fixed production command plan', async (t) => {
  const { options, output, git } = await fixture(t);
  git('update-ref', 'refs/remotes/origin/main', options.source);
  options.families[0].args = ['-e', 'process.exit(0)'];
  const report = await runLocalVerification(options);
  report.schema = 'prisma-prim-local-verification/v1';
  report.mode = 'complete';
  report.versions = { node: process.version };
  report.provenance.baseRef = 'origin/main';
  await writeFile(join(output, 'manifest.json'), JSON.stringify(report));
  await assert.rejects(
    validateLocalEvidence({ root: options.root, output }),
    /altered required verification families/,
  );
});

test('a failed acceptance child still produces its evidence probe before stopping', async (t) => {
  const { options } = await fixture(t);
  options.families = [
    {
      id: 'acceptance',
      command: process.execPath,
      args: ['-e', 'process.exit(7)'],
    },
    {
      id: 'acceptance-evidence',
      command: process.execPath,
      args: ['-e', 'console.log("evidence preserved")'],
    },
    { id: 'build', command: process.execPath, args: ['-e', 'process.exit(0)'] },
  ];
  const report = await runLocalVerification(options);
  assert.equal(report.status, 'failed');
  assert.equal(report.families[0].exitCode, 7);
  assert.equal(report.families[1].status, 'passed');
  assert.equal(report.families[2].status, 'unexecuted');
});

test('a tracked source edit restored before child exit still invalidates evidence', async (t) => {
  const { options } = await fixture(t);
  options.families = [
    {
      id: 'restore',
      command: process.execPath,
      args: [
        '-e',
        'const fs=require("node:fs"); const original=fs.readFileSync("source.txt"); fs.writeFileSync("source.txt", "temporary edit"); setTimeout(() => fs.writeFileSync("source.txt", original), 30);',
      ],
    },
  ];
  const report = await runLocalVerification(options);
  assert.equal(report.status, 'failed');
  assert.match(report.refusal, /changed during verification/);
});

test('the public complete plan fixes local execution policy without replacing scripts or serial requirements', () => {
  const args = Object.fromEntries(
    verificationFamilies.map((family) => [family.id, family.args]),
  );
  assert.equal(verificationFamilies.length, 16);
  assert.deepEqual(args['api-parallel'], [
    '--filter',
    '@prisma-prim/api',
    'test:parallel',
    '--maxWorkers=1',
    '--testTimeout=15000',
    '--bail=1',
  ]);
  assert.deepEqual(args['web-unit'], [
    '--filter',
    '@prisma-prim/web',
    'exec',
    'vitest',
    'run',
    '--maxWorkers=2',
  ]);
  assert.deepEqual(args.browser, [
    'scripts/verify-local-browser.mjs',
    'browser',
  ]);
  assert.deepEqual(args['api-serial'], [
    '--filter',
    '@prisma-prim/api',
    'test:postgres:serial',
    '--testTimeout=15000',
    '--bail=1',
  ]);
  assert.deepEqual(args.acceptance, [
    'scripts/verify-local-browser.mjs',
    'acceptance',
  ]);
  assert.throws(() => {
    args['api-parallel'].push('--exclude=required.test.ts');
  }, TypeError);
});

test('the separate frozen Railway dependency prerequisite cannot silently use missing dependencies', async (t) => {
  const { root, output, source, git } = await fixture(t);
  git('update-ref', 'refs/remotes/origin/main', source);
  const report = await runLocalVerification({ root, output, source });
  assert.equal(report.status, 'failed');
  assert.match(
    report.refusal,
    /pnpm --dir \.railway install --frozen-lockfile/,
  );
  assert.ok(report.families.every((family) => family.status === 'unexecuted'));
});

test('a finite process deadline terminates a real child and cannot produce successful evidence', async (t) => {
  const { options } = await fixture(t);
  options.signal = AbortSignal.timeout(1000);
  options.families = [
    {
      id: 'deadline-child',
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      timeoutMilliseconds: 50,
    },
  ];
  const report = await runLocalVerification(options);
  assert.equal(report.status, 'failed');
  assert.equal(report.families[0].status, 'timed_out');
  assert.deepEqual(report.families[0].executionOutcome, {
    kind: 'process_timeout',
  });
  assert.match(
    await readFile(join(options.output, 'report.md'), 'utf8'),
    /process_timeout \(execution incomplete\)/,
  );
  assert.ok(['SIGTERM', 'SIGKILL'].includes(report.families[0].signal));
  assert.equal(report.families[0].timeoutMilliseconds, 50);
});
