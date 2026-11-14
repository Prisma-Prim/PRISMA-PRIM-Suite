import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, fork, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  watch,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const command = join(root, 'scripts/prepare-worktree.mjs');
const temporary = mkdtempSync(join(tmpdir(), 'prep-'));
after(() => rmSync(temporary, { recursive: true, force: true }));

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function fixture({ workspaceDependency = true } = {}) {
  const parent = mkdtempSync(join(temporary, 'case-'));
  const repo = join(parent, 'repo');
  mkdirSync(repo);
  const file = (name, content) => {
    const path = join(repo, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  git(repo, 'init', '--quiet', '--initial-branch', 'main');
  git(repo, 'config', 'core.autocrlf', 'true');
  file(
    'package.json',
    JSON.stringify({
      name: 'synthetic-preparation',
      private: true,
      packageManager: 'pnpm@11.20.0',
      engines: { node: '>=24.0.0 <25.0.0' },
      dependencies: { 'synthetic-dependency': 'file:packages/dependency' },
      scripts: { postinstall: 'node scripts/postinstall.mjs' },
    }),
  );
  file(
    'packages/dependency/package.json',
    JSON.stringify({
      name: 'synthetic-dependency',
      version: '1.0.0',
      main: 'index.cjs',
      bin: { synthetic: 'bin.cjs' },
    }),
  );
  file('packages/dependency/index.cjs', "module.exports = 'synthetic-v1';\n");
  file(
    'packages/dependency/bin.cjs',
    '#!/usr/bin/env node\nconsole.log("synthetic");\n',
  );
  chmodSync(join(repo, 'packages/dependency/bin.cjs'), 0o755);
  file(
    'pnpm-workspace.yaml',
    workspaceDependency ? 'packages:\n  - packages/*\n' : 'packages: []\n',
  );
  file('.node-version', '24\n');
  file('.gitignore', 'node_modules/\n.pnpm-home/\n');
  file('.gitattributes', '* text=auto eol=lf\n*.sh text eol=lf\n');
  file(
    'scripts/postinstall.mjs',
    `import { appendFileSync, existsSync, renameSync, watch, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
function mark(path, value) { const pending = path + '.' + process.pid + '.pending'; writeFileSync(pending, value); renameSync(pending, path); }
if (process.env.PREP_TEST_COUNTER) appendFileSync(process.env.PREP_TEST_COUNTER, 'installed\\n');
if (process.env.PREP_TEST_PAYLOAD) console.error(process.env.PREP_TEST_PAYLOAD);
const gate = process.env.PREP_TEST_GATE;
if (gate) {
  mark(join(gate, basename(process.cwd()) + '.entered'), String(process.pid));
  mark(join(gate, process.pid + '.entered'), 'entered');
  await new Promise((resolve) => {
    const listener = watch(gate, () => { if (existsSync(join(gate, 'release'))) { listener.close(); resolve(); } });
    if (existsSync(join(gate, 'release'))) { listener.close(); resolve(); }
  });
  mark(join(gate, process.pid + '.left'), 'left');
}
if (process.env.PREP_TEST_FAIL === '1') process.exit(7);
`,
  );
  for (const name of [
    'scripts/agent-pnpm.sh',
    'scripts/agent-doctor.mjs',
    'scripts/agent-doctor-system-adapter.mjs',
    'apps/api/test-support/postgres-database-target.mjs',
  ]) {
    mkdirSync(dirname(join(repo, name)), { recursive: true });
    copyFileSync(join(root, name), join(repo, name));
  }
  const launcher = join(repo, 'scripts/agent-pnpm.sh');
  writeFileSync(
    launcher,
    readFileSync(launcher, 'utf8').replace(
      'set -euo pipefail',
      'set -euo pipefail\nif [[ -n "${PREP_TEST_CALLS:-}" ]]; then printf "%s\\n" "$*" >>"$PREP_TEST_CALLS"; fi',
    ),
  );
  const lock = spawnSync(
    'bash',
    [
      'scripts/agent-pnpm.sh',
      'install',
      '--lockfile-only',
      '--offline',
      '--ignore-scripts',
    ],
    { cwd: repo, encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(lock.status, 0, lock.stderr);
  git(repo, 'add', '.');
  git(
    repo,
    '-c',
    'user.name=Synthetic Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '-m',
    'seed',
  );
  return {
    parent,
    repo,
    target: join(parent, 'worktree'),
    store: join(parent, 'store'),
    counter: join(parent, 'counter'),
  };
}

function argumentsFor(f, extra = []) {
  return [
    command,
    '--path',
    f.target,
    '--branch',
    f.branch ?? 'feat/synthetic',
    '--base',
    'main',
    '--store',
    f.store,
    '--offline',
    ...extra,
  ];
}
function prepare(f, extra = []) {
  return spawnSync(process.execPath, argumentsFor(f, extra), {
    cwd: f.repo,
    env: {
      ...process.env,
      PREP_TEST_COUNTER: f.counter,
      ...(f.environment ?? {}),
    },
    encoding: 'utf8',
    timeout: 45_000,
  });
}

function fileAppears(path, t) {
  return new Promise((resolveFile, reject) => {
    const timer = setTimeout(() => {
      listener.close();
      reject(new Error('Synthetic process barrier was not reached.'));
    }, 20_000);
    const check = () => {
      let ready = false;
      try {
        ready = existsSync(path) && readFileSync(path).length > 0;
      } catch {
        /* Wait for complete marker publication. */
      }
      if (ready) {
        clearTimeout(timer);
        listener.close();
        resolveFile();
      }
    };
    const listener = watch(dirname(path), check);
    t?.after(() => {
      clearTimeout(timer);
      listener.close();
    });
    check();
  });
}

function pidFromMarker(path) {
  const value = readFileSync(path, 'utf8');
  assert.match(
    value,
    /^[1-9]\d*$/u,
    'a process marker must publish a positive PID',
  );
  const pid = Number(value);
  assert.ok(Number.isSafeInteger(pid));
  return pid;
}

function worker(t, f, extra = []) {
  const child = spawn(process.execPath, argumentsFor(f, extra), {
    cwd: f.repo,
    env: {
      ...process.env,
      PREP_TEST_COUNTER: f.counter,
      ...(f.environment ?? {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => {
    stdout += data;
  });
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  const done = new Promise((resolveChild) =>
    child.once('close', (status, signal) =>
      resolveChild({ status, signal, stdout, stderr }),
    ),
  );
  t.after(async () => {
    if (f.environment?.PREP_TEST_GATE)
      writeFileSync(join(f.environment.PREP_TEST_GATE, 'release'), 'release');
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGTERM');
    await done;
  });
  const waiting = new Promise((resolveWait, reject) => {
    const timer = setTimeout(
      () =>
        reject(new Error('The second worker did not report lock contention.')),
      20_000,
    );
    child.stderr.on('data', () => {
      if (stderr.includes('Waiting for worktree preparation lock.')) {
        clearTimeout(timer);
        resolveWait();
      }
    });
    child.once('close', () => {
      clearTimeout(timer);
      if (!stderr.includes('Waiting for worktree preparation lock.'))
        reject(new Error(`Worker exited before contention: ${stderr}`));
    });
  });
  waiting.catch(() => {});
  return { child, done, waiting };
}

test('the public CLI creates a private frozen worktree and reuses unchanged qualification', () => {
  const f = fixture();
  const primary = git(f.repo, 'status', '--porcelain');
  const first = prepare(f);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).status, 'prepared');
  assert.ok(existsSync(join(f.target, 'node_modules/.modules.yaml')));
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\n');
  const again = prepare(f);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(JSON.parse(again.stdout).status, 'ready');
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\n');
  assert.equal(git(f.repo, 'status', '--porcelain'), primary);
});

test('simultaneous creators of one worktree serialize one real pinned-pnpm installation', async (t) => {
  const f = fixture();
  const gate = join(f.parent, 'gate');
  mkdirSync(gate);
  f.environment = { PREP_TEST_GATE: gate };
  const entered = fileAppears(join(gate, 'worktree.entered'), t);
  const first = worker(t, f);
  const second = worker(
    t,
    process.platform === 'win32' ? { ...f, target: f.target.toUpperCase() } : f,
  );
  await Promise.all([entered, Promise.race([first.waiting, second.waiting])]);
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\n');
  writeFileSync(join(gate, 'release'), 'release');
  const outcomes = await Promise.all([first.done, second.done]);
  for (const result of outcomes) assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    outcomes.map((result) => JSON.parse(result.stdout).status).sort(),
    ['prepared', 'ready'],
  );
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\n');
});

function installationSnapshot(root) {
  const values = {};
  const walk = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) values[name] = `link:${readlinkSync(path)}`;
      else if (entry.isDirectory()) walk(path, `${name}/`);
      else
        values[name] = createHash('sha256')
          .update(readFileSync(path))
          .digest('hex');
    }
  };
  walk(join(root, 'node_modules'));
  return values;
}

test('different worktrees cross a real install barrier together and preserve primary and peer bytes', async (t) => {
  const f = fixture();
  const installed = spawnSync(
    'bash',
    [
      'scripts/agent-pnpm.sh',
      'install',
      '--frozen-lockfile',
      '--offline',
      '--package-import-method=copy',
      `--store-dir=${f.store}`,
    ],
    { cwd: f.repo, encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(installed.status, 0, installed.stderr);
  const primary = installationSnapshot(f.repo);
  const gate = join(f.parent, 'gate');
  mkdirSync(gate);
  const a = {
    ...f,
    target: join(f.parent, 'first'),
    branch: 'feat/first',
    environment: { PREP_TEST_GATE: gate },
  };
  const b = {
    ...f,
    target: join(f.parent, 'second'),
    branch: 'feat/second',
    environment: { PREP_TEST_GATE: gate },
  };
  const bothEntered = Promise.all([
    fileAppears(join(gate, 'first.entered'), t),
    fileAppears(join(gate, 'second.entered'), t),
  ]);
  const first = worker(t, a);
  const second = worker(t, b);
  await bothEntered;
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\ninstalled\n');
  assert.deepEqual(installationSnapshot(f.repo), primary);
  writeFileSync(join(gate, 'release'), 'release');
  for (const result of await Promise.all([first.done, second.done]))
    assert.equal(result.status, 0, result.stderr);
  const peer = installationSnapshot(b.target);
  writeFileSync(
    join(a.target, 'node_modules/synthetic-dependency/index.cjs'),
    'synthetic local payload change',
  );
  writeFileSync(
    join(a.target, 'node_modules/.modules.yaml'),
    'synthetic local metadata change',
  );
  assert.deepEqual(installationSnapshot(b.target), peer);
  assert.deepEqual(installationSnapshot(f.repo), primary);
});

test('refuses primary, foreign, dirty and branch-mismatched targets without replacing user files', () => {
  const f = fixture();
  const original = readFileSync(join(f.repo, 'package.json'));
  const primary = prepare({ ...f, target: f.repo });
  assert.equal(primary.status, 2);
  assert.match(primary.stderr, /primary/u);
  assert.deepEqual(readFileSync(join(f.repo, 'package.json')), original);
  mkdirSync(f.target);
  writeFileSync(join(f.target, 'user.txt'), 'synthetic user file');
  assert.equal(prepare(f).status, 2);
  assert.equal(
    readFileSync(join(f.target, 'user.txt'), 'utf8'),
    'synthetic user file',
  );
  rmSync(f.target, { recursive: true });
  assert.equal(prepare(f).status, 0);
  assert.equal(prepare({ ...f, branch: 'feat/other' }).status, 2);
  writeFileSync(join(f.target, 'user.txt'), 'synthetic unsaved work');
  assert.equal(prepare(f, ['--refresh']).status, 2);
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\n');
  assert.equal(
    readFileSync(join(f.target, 'user.txt'), 'utf8'),
    'synthetic unsaved work',
  );
});

test('shared module junctions are refused before any package-manager invocation', () => {
  const f = fixture();
  git(
    f.repo,
    'worktree',
    'add',
    '--quiet',
    '-b',
    'feat/synthetic',
    f.target,
    'main',
  );
  const foreign = join(f.parent, 'foreign');
  mkdirSync(foreign);
  writeFileSync(join(foreign, 'sentinel'), 'synthetic primary metadata');
  symlinkSync(
    foreign,
    join(f.target, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const result = prepare(f, ['--refresh']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Shared node_modules/u);
  assert.equal(
    readFileSync(join(foreign, 'sentinel'), 'utf8'),
    'synthetic primary metadata',
  );
  assert.equal(existsSync(f.counter), false);
});

test('input drift during a real install leaves incomplete qualification and needs explicit recovery', async (t) => {
  const f = fixture();
  const gate = join(f.parent, 'gate');
  mkdirSync(gate);
  f.environment = { PREP_TEST_GATE: gate };
  const entered = fileAppears(join(gate, 'worktree.entered'), t);
  const running = worker(t, f);
  await entered;
  const manifest = join(f.target, 'package.json');
  const original = readFileSync(manifest);
  writeFileSync(manifest, `${original}\n`);
  writeFileSync(join(gate, 'release'), 'release');
  const failed = await running.done;
  assert.equal(failed.status, 2);
  assert.match(failed.stderr, /Inputs changed/u);
  writeFileSync(manifest, original);
  const refused = prepare(f);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /--refresh/u);
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\n');
  const recovered = prepare(f, ['--refresh']);
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\ninstalled\n');
});

test('a dependency edit restored before install completion still invalidates qualification', async (t) => {
  const f = fixture();
  const gate = join(f.parent, 'gate');
  mkdirSync(gate);
  f.environment = { PREP_TEST_GATE: gate };
  const entered = fileAppears(join(gate, 'worktree.entered'), t);
  const running = worker(t, f);
  await entered;
  const manifest = join(f.target, 'package.json');
  const original = readFileSync(manifest);
  writeFileSync(manifest, `${original}\n`);
  writeFileSync(manifest, original);
  writeFileSync(join(gate, 'release'), 'release');
  const failed = await running.done;
  assert.equal(failed.status, 2, failed.stderr);
  assert.match(failed.stderr, /[Ii]nputs.*changed|changed.*inputs/u);
});

test('a changed committed dependency input cannot reuse a previous ready state', () => {
  const f = fixture();
  assert.equal(prepare(f).status, 0);
  const path = join(f.target, 'package.json');
  const value = JSON.parse(readFileSync(path, 'utf8'));
  value.version = '0.2.0';
  writeFileSync(path, JSON.stringify(value));
  git(f.target, 'add', 'package.json');
  git(
    f.target,
    '-c',
    'user.name=Synthetic Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '-m',
    'change input',
  );
  const refused = prepare(f);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /--refresh/u);
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\n');
  const changed = prepare(f, ['--refresh']);
  assert.equal(changed.status, 0, changed.stderr);
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\ninstalled\n');
});

test('a local file dependency payload change invalidates readiness even with unchanged manifests', () => {
  const f = fixture();
  assert.equal(prepare(f).status, 0);
  writeFileSync(
    join(f.target, 'packages/dependency/index.cjs'),
    "module.exports = 'synthetic-v2';\n",
  );
  git(f.target, 'add', 'packages/dependency/index.cjs');
  git(
    f.target,
    '-c',
    'user.name=Synthetic Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '-m',
    'change local package',
  );
  const refused = prepare(f);
  assert.equal(refused.status, 2, refused.stderr);
  assert.match(refused.stderr, /--refresh/u);
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\n');
});

test('killing the owner cannot let a second installer overlap a surviving child', async (t) => {
  const f = fixture();
  const gate = join(f.parent, 'gate');
  mkdirSync(gate);
  const calls = join(f.parent, 'calls');
  f.environment = { PREP_TEST_GATE: gate, PREP_TEST_CALLS: calls };
  const entered = fileAppears(join(gate, 'worktree.entered'), t);
  const first = worker(t, f);
  await entered;
  const installerPid = pidFromMarker(join(gate, 'worktree.entered'));
  const left = fileAppears(join(gate, `${installerPid}.left`), t);
  left.catch(() => {});
  const baseline = readFileSync(calls, 'utf8');
  const live = prepare(f, ['--refresh', '--wait-ms', '0']);
  assert.equal(live.status, 2);
  assert.match(live.stderr, /already active/u);
  assert.equal(readFileSync(calls, 'utf8'), baseline);
  first.child.kill('SIGKILL');
  await first.done;
  assert.doesNotThrow(
    () => process.kill(installerPid, 0),
    'the real installer child must survive the killed parent',
  );
  const second = worker(t, f, ['--refresh', '--wait-ms', '0']);
  const overlap = new Promise((resolveOverlap) => {
    const listener = watch(f.parent, () => {
      if (readFileSync(calls, 'utf8') !== baseline) {
        listener.close();
        resolveOverlap('overlap');
      }
    });
    t.after(() => listener.close());
  });
  try {
    const result = await Promise.race([second.done, overlap]);
    assert.notEqual(
      result,
      'overlap',
      'a surviving installer must prevent another pnpm invocation',
    );
    assert.equal(result.status, 2, result.stderr);
    assert.equal(readFileSync(f.counter, 'utf8'), 'installed\n');
  } finally {
    writeFileSync(join(gate, 'release'), 'release');
    await left;
  }
  if (process.platform !== 'win32') {
    const recovery = worker(t, f, ['--refresh']);
    const recovered = await recovery.done;
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(readFileSync(f.counter, 'utf8'), 'installed\ninstalled\n');
  }
});

test('a failed installation stays incomplete, suppresses payloads and recovers only explicitly', () => {
  const f = fixture();
  f.environment = {
    PREP_TEST_FAIL: '1',
    PREP_TEST_PAYLOAD: 'SYNTHETIC_PRIVATE_OUTPUT',
  };
  const failed = prepare(f);
  assert.equal(failed.status, 2);
  assert.doesNotMatch(
    failed.stdout + failed.stderr,
    /SYNTHETIC_PRIVATE_OUTPUT/u,
  );
  f.environment.PREP_TEST_FAIL = '0';
  assert.equal(prepare(f).status, 2);
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\n');
  const recovered = prepare(f, ['--refresh']);
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.doesNotMatch(
    recovered.stdout + recovered.stderr,
    /SYNTHETIC_PRIVATE_OUTPUT/u,
  );
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\ninstalled\n');
});

test(
  'graceful POSIX interruption stops owned descendants before another preparation',
  {
    skip:
      process.platform === 'win32'
        ? 'Windows SIGTERM force-kills; abrupt interruption is covered by conservative lock retention.'
        : false,
  },
  async (t) => {
    const f = fixture();
    const gate = join(f.parent, 'gate');
    mkdirSync(gate);
    f.environment = { PREP_TEST_GATE: gate };
    const entered = fileAppears(join(gate, 'worktree.entered'), t);
    const first = worker(t, f);
    await entered;
    first.child.kill('SIGTERM');
    const stopped = await first.done;
    assert.equal(stopped.status, 2, stopped.stderr);
    assert.match(stopped.stderr, /interrupted/u);
    writeFileSync(join(gate, 'release'), 'release');
    const recovered = prepare(f, ['--refresh']);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(readFileSync(f.counter, 'utf8'), 'installed\ninstalled\n');
  },
);

test('unsafe target aliases and a store inside source are refused without installation', () => {
  const f = fixture();
  symlinkSync(
    f.repo,
    f.target,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const alias = prepare(f);
  assert.equal(alias.status, 2);
  assert.equal(existsSync(f.counter), false);
  const store = prepare({
    ...f,
    target: join(f.parent, 'other'),
    store: join(f.repo, 'cache'),
  });
  assert.equal(store.status, 2);
  assert.match(store.stderr, /store.*outside/u);
  assert.equal(existsSync(f.counter), false);
});

test('unknown lock fields cannot publish a sensitive payload or steal a live preparation', async (t) => {
  const f = fixture();
  const gate = join(f.parent, 'gate');
  mkdirSync(gate);
  f.environment = { PREP_TEST_GATE: gate };
  const entered = fileAppears(join(gate, 'worktree.entered'), t);
  const first = worker(t, f);
  await entered;
  const states = join(f.repo, '.git/agent-preparation');
  const state = join(states, readdirSync(states)[0], 'lock');
  const ownerFile = join(
    state,
    readdirSync(state).find((name) => name.startsWith('owner-')),
  );
  const original = readFileSync(ownerFile);
  const value = JSON.parse(original);
  value.client = 'SYNTHETIC_PRIVATE_LOCK_PAYLOAD';
  writeFileSync(ownerFile, JSON.stringify(value));
  const refused = prepare(f, ['--refresh', '--wait-ms', '0']);
  assert.equal(refused.status, 2);
  assert.doesNotMatch(
    refused.stdout + refused.stderr,
    /SYNTHETIC_PRIVATE_LOCK_PAYLOAD/u,
  );
  writeFileSync(ownerFile, original);
  writeFileSync(join(gate, 'release'), 'release');
  assert.equal((await first.done).status, 0);
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\n');
});

test('recovery re-reads final owner state after death instead of reclaiming an earlier idle snapshot', async (t) => {
  const f = fixture();
  const parent = f.parent;
  const installation = spawnSync(
    'bash',
    ['scripts/agent-pnpm.sh', 'install', '--frozen-lockfile', '--offline'],
    { cwd: f.repo, encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(installation.status, 0, installation.stderr);
  const state = join(parent, 'state');
  mkdirSync(state, { mode: 0o700 });
  const lockModule = new URL('./worktree-preparation-lock.mjs', import.meta.url)
    .href;
  const ownerFile = join(parent, 'owner.mjs');
  const readerFile = join(parent, 'reader.mjs');
  writeFileSync(
    ownerFile,
    `import { acquirePreparationLock } from ${JSON.stringify(lockModule)};
const lock = await acquirePreparationLock({ directory: process.env.STATE, waitMilliseconds: 10000 });
process.send('locked');
process.once('message', async () => {
  try { await lock.run('bash', ['scripts/agent-pnpm.sh', 'exec', 'node', '-e', "const fs=require('node:fs');fs.writeFileSync(process.env.CHILD+'.pending', String(process.pid));fs.renameSync(process.env.CHILD+'.pending', process.env.CHILD);setInterval(()=>{},1000)"], { cwd: process.env.REPOSITORY, environment: process.env }); }
  finally { lock.release(); }
});`,
  );
  // Pause only scheduling, after a real filesystem read; no owner state or
  // liveness result is fabricated. The child runs through the production API.
  writeFileSync(
    readerFile,
    `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
const original = fs.readFileSync; const originalClose = fs.closeSync; let observed; let paused = false;
fs.readFileSync = function(...args) {
  const value = original.apply(this, args);
  if (!paused && typeof args[0] === 'number' && typeof value === 'string' && value.includes('"phase":"idle"')) {
    observed = args[0];
  }
  return value;
};
fs.closeSync = function(descriptor) {
  const result = originalClose.call(this, descriptor);
  if (!paused && descriptor === observed) {
    paused = true; fs.writeFileSync(process.env.SNAPSHOT, 'snapshot');
    const memory = new Int32Array(new SharedArrayBuffer(4));
    while (!fs.existsSync(process.env.RELEASE)) Atomics.wait(memory, 0, 0, 10);
  }
  return result;
};
syncBuiltinESMExports();
const { acquirePreparationLock } = await import(${JSON.stringify(lockModule)});
try { const lock = await acquirePreparationLock({ directory: process.env.STATE, waitMilliseconds: 0 }); process.send('acquired'); lock.release(); }
catch { process.send('refused'); }`,
  );
  const environment = {
    ...process.env,
    STATE: state,
    REPOSITORY: f.repo,
    CHILD: join(parent, 'child'),
    SNAPSHOT: join(parent, 'snapshot'),
    RELEASE: join(parent, 'release'),
  };
  let owner;
  let reader;
  let childPid;
  try {
    owner = fork(ownerFile, {
      env: environment,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const ownerClosed = once(owner, 'close');
    assert.deepEqual(await once(owner, 'message'), ['locked', undefined]);
    const snapshot = fileAppears(environment.SNAPSHOT, t);
    reader = fork(readerFile, {
      env: environment,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const readerClosed = once(reader, 'close');
    const result = once(reader, 'message');
    await snapshot;
    const entered = fileAppears(environment.CHILD, t);
    owner.send('launch');
    await entered;
    childPid = pidFromMarker(environment.CHILD);
    owner.kill('SIGKILL');
    await ownerClosed;
    assert.doesNotThrow(() => process.kill(childPid, 0));
    writeFileSync(environment.RELEASE, 'release');
    assert.equal((await result)[0], 'refused');
    assert.doesNotThrow(() => process.kill(childPid, 0));
    await readerClosed;
  } finally {
    for (const child of [reader, owner])
      if (child && child.exitCode === null && child.signalCode === null)
        child.kill('SIGKILL');
    if (childPid) {
      try {
        process.kill(childPid, 'SIGKILL');
      } catch {
        /* Already stopped. */
      }
    }
  }
});

test('the normalized global pnpm hook setting never qualifies for automatic reuse', () => {
  const f = fixture();
  const hook = join(f.parent, 'global-hook.cjs');
  writeFileSync(
    hook,
    'module.exports={hooks:{readPackage(pkg){return pkg;}}};\n',
  );
  f.environment = { pnpm_config_global_pnpmfile: hook };
  const lock = spawnSync(
    'bash',
    [
      'scripts/agent-pnpm.sh',
      'install',
      '--lockfile-only',
      '--offline',
      '--ignore-scripts',
    ],
    {
      cwd: f.repo,
      env: { ...process.env, ...f.environment },
      encoding: 'utf8',
      timeout: 30_000,
    },
  );
  assert.equal(lock.status, 0, lock.stderr);
  git(f.repo, 'add', 'pnpm-lock.yaml');
  git(
    f.repo,
    '-c',
    'user.name=Synthetic Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '--allow-empty',
    '-m',
    'qualify synthetic hook',
  );
  const initial = prepare(f);
  assert.equal(initial.status, 0, initial.stderr);
  const unchanged = prepare(f);
  assert.equal(unchanged.status, 2, unchanged.stderr);
  assert.match(unchanged.stderr, /--refresh/u);
  writeFileSync(
    hook,
    'module.exports={hooks:{readPackage(pkg){return {...pkg, description:"synthetic-v2"};}}};\n',
  );
  const changed = prepare(f);
  assert.equal(changed.status, 2, changed.stderr);
  assert.match(changed.stderr, /--refresh/u);
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\n');
});

test('existing external hardlinks are refused before refresh without changing either name', () => {
  const f = fixture();
  git(
    f.repo,
    'worktree',
    'add',
    '--quiet',
    '-b',
    'feat/synthetic',
    f.target,
    'main',
  );
  const installed = spawnSync(
    'bash',
    [
      'scripts/agent-pnpm.sh',
      'install',
      '--frozen-lockfile',
      '--offline',
      '--package-import-method=copy',
      `--store-dir=${f.store}`,
    ],
    { cwd: f.target, encoding: 'utf8', timeout: 30000 },
  );
  assert.equal(installed.status, 0, installed.stderr);
  const dependency = join(
    f.target,
    'node_modules/synthetic-dependency/index.cjs',
  );
  const external = join(f.parent, 'external.cjs');
  const original = readFileSync(dependency);
  linkSync(dependency, external);
  const result = prepare(f, ['--refresh']);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /hardlink/iu);
  assert.deepEqual(readFileSync(dependency), original);
  assert.deepEqual(readFileSync(external), original);
  assert.equal(existsSync(f.counter), false);
});

test('an external hardlink added after readiness prevents automatic reuse', () => {
  const f = fixture();
  assert.equal(prepare(f).status, 0);
  linkSync(
    join(f.target, 'node_modules/synthetic-dependency/index.cjs'),
    join(f.parent, 'later-external.cjs'),
  );
  const result = prepare(f);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /hardlink/iu);
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\n');
});

test('fully internal hardlinks remain private and can reuse qualification', () => {
  const f = fixture();
  assert.equal(prepare(f).status, 0);
  linkSync(
    join(f.target, 'node_modules/synthetic-dependency/index.cjs'),
    join(f.target, 'node_modules/internal.cjs'),
  );
  const refreshed = prepare(f, ['--refresh']);
  assert.equal(refreshed.status, 0, refreshed.stderr);
  assert.equal(JSON.parse(refreshed.stdout).status, 'prepared');
  const result = prepare(f);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'ready');
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\ninstalled\n');
});

for (const damage of ['deletion', 'corruption']) {
  test(`ordinary package ${damage} cannot reuse a ready qualification`, () => {
    const f = fixture({ workspaceDependency: false });
    assert.equal(prepare(f).status, 0);
    const installed = realpathSync(
      join(f.target, 'node_modules/synthetic-dependency/index.cjs'),
    );
    assert.match(installed.replaceAll('\\', '/'), /\/node_modules\/\.pnpm\//u);
    unlinkSync(installed);
    if (damage === 'corruption')
      writeFileSync(installed, 'throw new Error("synthetic corruption");\n');
    const importing = spawnSync(
      process.execPath,
      ['--eval', 'require("synthetic-dependency")'],
      { cwd: f.target, encoding: 'utf8' },
    );
    assert.notEqual(importing.status, 0);
    assert.equal(git(f.target, 'status', '--porcelain'), '');
    const again = prepare(f);
    assert.equal(again.status, 2, again.stderr);
    assert.match(again.stderr, /--refresh/u);
    assert.equal(readFileSync(f.counter, 'utf8'), 'installed\n');
  });
}

for (const releaseAt of ['rename failure', 'lock stat']) {
  test(`a contended lock disappears after ${releaseAt} and the public CLI retries`, async (t) => {
    const f = fixture();
    const gate = join(f.parent, 'gate');
    const paused = join(f.parent, 'paused');
    const resumed = join(f.parent, 'resumed');
    mkdirSync(gate);
    f.environment = {
      PREP_TEST_GATE: gate,
      PAUSED: paused,
      RESUMED: resumed,
      RELEASE_AT: releaseAt,
    };
    const entered = fileAppears(join(gate, 'worktree.entered'), t);
    const owner = worker(t, f);
    await entered;
    const contenderFile = join(f.parent, 'contender.mjs');
    // Only pause scheduling after actual filesystem contention. Both workers
    // run the public CLI; no filesystem result or owner state is fabricated.
    writeFileSync(
      contenderFile,
      `import fs from 'node:fs';
import { basename } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
const rename = fs.renameSync; const stat = fs.lstatSync;
let contended = false; let paused = false;
function pause() {
  if (paused) return;
  paused = true;
  fs.writeFileSync(process.env.PAUSED + '.pending', 'paused');
  rename(process.env.PAUSED + '.pending', process.env.PAUSED);
  const memory = new Int32Array(new SharedArrayBuffer(4));
  while (!fs.existsSync(process.env.RESUMED)) Atomics.wait(memory, 0, 0, 10);
}
fs.renameSync = function(...args) {
  try { return rename.apply(this, args); }
  catch (error) {
    if (basename(String(args[1])) === 'lock' && ['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(error.code)) {
      contended = true;
      if (process.env.RELEASE_AT === 'rename failure') pause();
    }
    throw error;
  }
};
fs.lstatSync = function(...args) {
  if (contended && !paused && basename(String(args[0])) === 'lock' && process.env.RELEASE_AT === 'lock stat') pause();
  return stat.apply(this, args);
};
syncBuiltinESMExports();
process.argv[1] = ${JSON.stringify(command)};
await import(${JSON.stringify(new URL('./prepare-worktree.mjs', import.meta.url).href)});`,
    );
    const reached = fileAppears(paused, t);
    const contender = fork(contenderFile, argumentsFor(f).slice(1), {
      cwd: f.repo,
      env: {
        ...process.env,
        ...f.environment,
        PREP_TEST_COUNTER: f.counter,
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    const closed = once(contender, 'close');
    let stdout = '';
    let stderr = '';
    contender.stdout.on('data', (value) => (stdout += value));
    contender.stderr.on('data', (value) => (stderr += value));
    t.after(() => {
      writeFileSync(resumed, 'resume');
      writeFileSync(join(gate, 'release'), 'release');
      if (contender.exitCode === null && contender.signalCode === null)
        contender.kill('SIGKILL');
    });
    await reached;
    writeFileSync(join(gate, 'release'), 'release');
    assert.equal((await owner.done).status, 0);
    const states = join(f.repo, '.git/agent-preparation');
    const lock = join(states, readdirSync(states)[0], 'lock');
    assert.equal(existsSync(lock), false);
    writeFileSync(resumed, 'resume');
    assert.equal((await closed)[0], 0, stderr);
    assert.equal(JSON.parse(stdout).status, 'ready');
    assert.equal(readFileSync(f.counter, 'utf8'), 'installed\n');
  });
}

function packDependency(directory) {
  const result = spawnSync(
    'bash',
    [
      'scripts/agent-pnpm.sh',
      '--dir',
      join(directory, 'packages/dependency'),
      'pack',
      '--out',
      join(directory, 'packages/dependency.tgz'),
    ],
    { cwd: directory, encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(result.status, 0, result.stderr);
}

test('an effective pnpm override local archive cannot reuse stale installed contents', () => {
  const f = fixture({ workspaceDependency: false });
  const manifest = JSON.parse(readFileSync(join(f.repo, 'package.json')));
  manifest.dependencies['synthetic-dependency'] = '1.0.0';
  writeFileSync(join(f.repo, 'package.json'), JSON.stringify(manifest));
  writeFileSync(
    join(f.repo, 'pnpm-workspace.yaml'),
    'packages: []\noverrides:\n  synthetic-dependency: file:packages/dependency.tgz\n',
  );
  packDependency(f.repo);
  const lock = spawnSync(
    'bash',
    [
      'scripts/agent-pnpm.sh',
      'install',
      '--lockfile-only',
      '--offline',
      '--ignore-scripts',
    ],
    { cwd: f.repo, encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(lock.status, 0, lock.stderr);
  git(f.repo, 'add', '.');
  git(
    f.repo,
    '-c',
    'user.name=Synthetic Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'use effective local override',
  );
  assert.equal(prepare(f).status, 0);
  const readInstalled = () =>
    spawnSync(
      process.execPath,
      ['--eval', 'process.stdout.write(require("synthetic-dependency"))'],
      { cwd: f.target, encoding: 'utf8' },
    );
  assert.equal(readInstalled().stdout, 'synthetic-v1');
  const source = join(f.target, 'packages/dependency/index.cjs');
  const original = readFileSync(source);
  writeFileSync(source, "module.exports = 'synthetic-v2';\n");
  packDependency(f.target);
  writeFileSync(source, original);
  git(f.target, 'add', 'packages/dependency.tgz');
  git(
    f.target,
    '-c',
    'user.name=Synthetic Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'change only override archive',
  );
  assert.equal(git(f.target, 'status', '--porcelain'), '');
  const again = prepare(f);
  assert.equal(again.status, 2, again.stderr);
  assert.match(again.stderr, /--refresh/u);
  assert.equal(readInstalled().stdout, 'synthetic-v1');
  assert.equal(readFileSync(f.counter, 'utf8'), 'installed\n');
});

test(
  'a non-executable installed shim cannot reuse ready qualification',
  {
    skip:
      process.platform === 'win32'
        ? 'POSIX execution permission semantics'
        : false,
  },
  () => {
    const f = fixture();
    assert.equal(prepare(f).status, 0);
    const binary = join(f.target, 'node_modules/.bin/synthetic');
    assert.equal(spawnSync(binary, [], { cwd: f.target }).status, 0);
    chmodSync(binary, 0o644);
    assert.equal(
      spawnSync(binary, [], { cwd: f.target }).error?.code,
      'EACCES',
    );
    assert.equal(git(f.target, 'status', '--porcelain'), '');
    const again = prepare(f);
    assert.equal(again.status, 2, again.stderr);
    assert.match(again.stderr, /--refresh/u);
    assert.equal(readFileSync(f.counter, 'utf8'), 'installed\n');
  },
);
