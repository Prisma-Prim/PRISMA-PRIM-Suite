import assert from 'node:assert/strict';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test as nodeTest } from 'node:test';

// These exercise the POSIX-only launcher, including Unix permissions.
function test(name, run) {
  return nodeTest(
    name,
    {
      skip:
        process.platform === 'win32'
          ? 'POSIX pnpm launcher is proved by Linux CI'
          : false,
    },
    run,
  );
}

const launcher = new URL('./agent-pnpm.sh', import.meta.url);

async function withFakePnpm(
  { launcherVersion = '11.19.0', effectiveVersion = '11.20.0' } = {},
  callback,
) {
  const directory = await mkdtemp(join(tmpdir(), 'prisma-prim-pnpm-test-'));
  const bin = join(directory, 'bin');
  const log = join(directory, 'pnpm.log');
  const home = join(directory, 'home');
  await mkdir(bin);
  await symlink(process.execPath, join(bin, 'node'));
  await writeFile(
    join(bin, 'pnpm'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >>"\${FAKE_PNPM_LOG}"
if [[ "\${1:-}" == '--version' ]]; then
  printf '%s\\n' "\${FAKE_LAUNCHER_VERSION}"
  exit 0
fi
if [[ "\${1:-}" == '--pm-on-fail=download' && "\${2:-}" == 'exec' && "\${3:-}" == 'node' ]]; then
  printf '%s' "\${FAKE_EFFECTIVE_VERSION}"
  exit 0
fi
exit "\${FAKE_COMMAND_STATUS:-0}"
`,
  );
  await chmod(join(bin, 'pnpm'), 0o755);

  try {
    return await callback({
      directory,
      env: {
        ...process.env,
        FAKE_EFFECTIVE_VERSION: effectiveVersion,
        FAKE_LAUNCHER_VERSION: launcherVersion,
        FAKE_PNPM_LOG: log,
        PATH: `${bin}:/usr/bin:/bin`,
        PRISMA_PRIM_PNPM_HOME: home,
      },
      home,
      log,
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function runLauncher(args, env) {
  return spawnSync('/bin/bash', [launcher.pathname, ...args], {
    encoding: 'utf8',
    env,
  });
}

test('bypasses download when the launcher is already the exact pinned pnpm', async () => {
  await withFakePnpm({ launcherVersion: '11.20.0' }, async ({ env, log }) => {
    const result = runLauncher(['test:unit', '--', '--runInBand'], {
      ...env,
      FAKE_COMMAND_STATUS: '7',
    });

    assert.equal(result.status, 7);
    assert.deepEqual((await readFile(log, 'utf8')).trim().split('\n'), [
      '--version',
      'test:unit -- --runInBand',
    ]);
  });
});

test('downloads and verifies the exact effective pnpm in a private local home', async () => {
  await withFakePnpm({}, async ({ env, home, log }) => {
    const result = runLauncher(['lint'], {
      ...env,
      FAKE_COMMAND_STATUS: '9',
    });
    const calls = (await readFile(log, 'utf8')).trim().split('\n');

    assert.equal(result.status, 9);
    assert.equal(calls[0], '--version');
    assert.match(calls[1], /^--pm-on-fail=download exec node /);
    assert.equal(calls[2], '--pm-on-fail=download lint');
    assert.equal((await stat(home)).mode & 0o777, 0o700);
  });
});

test('does not depend on GNU stat to validate the private pnpm home', async () => {
  await withFakePnpm({}, async ({ directory, env }) => {
    const fakeStat = join(directory, 'bin', 'stat');
    await writeFile(fakeStat, '#!/usr/bin/env bash\nexit 73\n');
    await chmod(fakeStat, 0o755);

    const result = runLauncher(['lint'], env);

    assert.equal(result.status, 0);
  });
});

test('fails closed when pnpm cannot activate the pinned effective version', async () => {
  await withFakePnpm({ effectiveVersion: '11.19.0' }, async ({ env }) => {
    const result = runLauncher(['lint'], env);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /activated pnpm 11\.19\.0; expected 11\.20\.0/);
  });
});

test('refuses an insecure pnpm home without changing its permissions', async () => {
  await withFakePnpm({}, async ({ env, home }) => {
    await mkdir(home, { mode: 0o755 });
    const result = runLauncher(['lint'], env);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /non-symlink directory with mode 700/);
    assert.equal((await stat(home)).mode & 0o777, 0o755);
  });
});

test('refuses special permission bits without changing the pnpm home', async () => {
  await withFakePnpm({}, async ({ env, home }) => {
    await mkdir(home, { mode: 0o1700 });
    const result = runLauncher(['lint'], env);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /non-symlink directory with mode 700/);
    assert.equal((await stat(home)).mode & 0o7777, 0o1700);
  });
});

test('refuses a symlink pnpm home without changing its target', async () => {
  await withFakePnpm({}, async ({ directory, env, home }) => {
    const target = join(directory, 'target');
    await mkdir(target, { mode: 0o700 });
    await symlink(target, home, 'dir');
    const result = runLauncher(['lint'], env);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /non-symlink directory with mode 700/);
    assert.equal((await stat(target)).mode & 0o777, 0o700);
  });
});

test('reports a missing pnpm launcher without attempting a global install', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prisma-prim-pnpm-missing-'));
  const bin = join(directory, 'bin');
  await mkdir(bin);
  await symlink(process.execPath, join(bin, 'node'));

  try {
    const result = runLauncher(['lint'], {
      ...process.env,
      PATH: `${bin}:/usr/bin:/bin`,
      PRISMA_PRIM_PNPM_HOME: join(directory, 'home'),
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pnpm is unavailable on PATH/);
    assert.doesNotMatch(result.stderr, /global|corepack enable/);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
