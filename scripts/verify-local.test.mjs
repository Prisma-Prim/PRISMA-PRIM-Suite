import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    assert.equal(
      await createProcessGroupController().isLive(processGroup),
      false,
    );
  },
);

test('changing a synthetic report label cannot replace the fixed production command plan', async (t) => {
  const { options, output } = await fixture(t);
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

test('the public complete plan caps parallelism without replacing scripts or serial requirements', () => {
  const args = Object.fromEntries(
    verificationFamilies.map((family) => [family.id, family.args]),
  );
  assert.equal(verificationFamilies.length, 16);
  assert.deepEqual(args['api-parallel'], [
    '--filter',
    '@prisma-prim/api',
    'test:parallel',
    '--maxWorkers=2',
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
    '--filter',
    '@prisma-prim/web',
    'test:browser',
    '--workers=2',
  ]);
  assert.deepEqual(args['api-serial'], [
    '--filter',
    '@prisma-prim/api',
    'test:postgres:serial',
  ]);
  assert.deepEqual(args.acceptance, [
    '--filter',
    '@prisma-prim/web',
    'test:browser:acceptance',
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
