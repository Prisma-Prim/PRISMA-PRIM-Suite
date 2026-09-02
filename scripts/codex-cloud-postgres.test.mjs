import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';

const scriptPath = fileURLToPath(
  new URL('./codex-cloud-postgres.sh', import.meta.url),
);
const script = await readFile(scriptPath, 'utf8');
const sourceCommit = '083ac033419f690758508e08c1736089384bbee8';
const sourceSha256 =
  'd2b729db7d1f57a34b7d5906f4b4635cca6c9a04ddbd19333ef2ae35a4b25ac2';
const requiredBinaries = [
  'postgres',
  'pg_ctl',
  'initdb',
  'pg_isready',
  'psql',
  'createdb',
  'createuser',
];
const hostUid = String(process.getuid?.() ?? 1000);
const hostGid = String(process.getgid?.() ?? 1000);

function shellFunction(name) {
  const match = script.match(
    new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?^\\}\\n`, 'm'),
  );
  assert.ok(match, `Missing shell function ${name}`);
  return match[0];
}

function cleanEnvironment(overrides = {}) {
  const environment = { ...process.env, ...overrides };
  for (const key of [
    'DATABASE_URL',
    'TEST_DATABASE_URL',
    'PRISMA_PRIM_POSTGRES_PORT',
    'PRISMA_PRIM_POSTGRES_BUILD_JOBS',
    'PRISMA_PRIM_POSTGRES_READY_ATTEMPTS',
    'PRISMA_PRIM_POSTGRES_STOP_CONFLICTING_CLUSTER',
    'PRISMA_PRIM_POSTGRES_LOCK_SECONDS',
    'PRISMA_PRIM_POSTGRES_CACHE_ROOT',
    'PRISMA_PRIM_POSTGRES_RUNTIME_ROOT',
  ]) {
    if (!(key in overrides)) delete environment[key];
  }
  return environment;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function writeFixtureInstallManifest(installRoot) {
  const paths = [];
  async function collect(directory, relative = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (
        path === '.prisma-prim-install-v1' ||
        path === '.prisma-prim-install-manifest-v1'
      ) {
        continue;
      }
      if (entry.isDirectory()) {
        await collect(join(directory, entry.name), path);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        paths.push(path);
      }
    }
  }
  await collect(installRoot);
  paths.sort();
  const lines = await Promise.all(
    paths.map(async (path) => {
      const digest = createHash('sha256')
        .update(await readFile(join(installRoot, path)))
        .digest('hex');
      return `${digest}  ./${path}`;
    }),
  );
  await writeFile(
    join(installRoot, '.prisma-prim-install-manifest-v1'),
    `${lines.join('\n')}\n`,
    { mode: 0o600 },
  );
}

function runScript({ args = [], env = {}, timeout = 60_000 } = {}) {
  assert.match(env.PATH ?? '', /prisma-prim-tools-test-/);
  return spawnSync('bash', [scriptPath, ...args], {
    encoding: 'utf8',
    env: cleanEnvironment(env),
    timeout,
  });
}

function assertOrdinaryFailure(result, pattern) {
  assert.equal(result.signal, null);
  assert.equal(typeof result.status, 'number');
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /Local PostgreSQL .* is ready/);
  if (pattern) assert.match(result.stderr, pattern);
}

test('rejects unsupported modes and extra arguments', async (t) => {
  const fixture = await createFixture(t, { withCache: false });
  const invalidMode = runScript({
    args: ['--unknown'],
    env: fixture.env,
  });
  assert.equal(invalidMode.status, 2);
  assert.match(invalidMode.stderr, /Usage:/);

  const extraArgument = runScript({
    args: ['--start', 'extra'],
    env: fixture.env,
  });
  assert.equal(extraArgument.status, 2);
  assert.match(extraArgument.stderr, /Usage:/);
});

for (const [name, value, pattern] of [
  ['PRISMA_PRIM_POSTGRES_PORT', '0', /canonical integer/],
  ['PRISMA_PRIM_POSTGRES_PORT', '06543', /canonical integer/],
  ['PRISMA_PRIM_POSTGRES_PORT', '65536', /canonical integer/],
  ['PRISMA_PRIM_POSTGRES_PORT', '18446744073709557048', /canonical integer/],
  ['PRISMA_PRIM_POSTGRES_BUILD_JOBS', '9', /canonical integer/],
  [
    'PRISMA_PRIM_POSTGRES_BUILD_JOBS',
    '18446744073709551618',
    /canonical integer/,
  ],
  ['PRISMA_PRIM_POSTGRES_READY_ATTEMPTS', '-1', /canonical integer/],
  [
    'PRISMA_PRIM_POSTGRES_READY_ATTEMPTS',
    '18446744073709551736',
    /canonical integer/,
  ],
  ['PRISMA_PRIM_POSTGRES_LOCK_SECONDS', '301', /canonical integer/],
  [
    'PRISMA_PRIM_POSTGRES_LOCK_SECONDS',
    '18446744073709551916',
    /canonical integer/,
  ],
  ['PRISMA_PRIM_POSTGRES_STOP_CONFLICTING_CLUSTER', 'yes', /true or false/],
]) {
  test(`rejects invalid ${name}=${value}`, async (t) => {
    const fixture = await createFixture(t, { withCache: false });
    const result = runScript({ env: { ...fixture.env, [name]: value } });
    assertOrdinaryFailure(result, pattern);
  });
}

test('rejects inherited database targets outside the exact isolated pair', async (t) => {
  const fixture = await createFixture(t, { withCache: false });
  const development = runScript({
    env: {
      ...fixture.env,
      DATABASE_URL:
        'postgresql://prisma_prim:prisma_prim@database.example/prisma_prim_dev',
    },
  });
  assertOrdinaryFailure(development, /DATABASE_URL must equal/);

  const testTarget = runScript({
    env: {
      ...fixture.env,
      TEST_DATABASE_URL:
        'postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/shared',
    },
  });
  assertOrdinaryFailure(testTarget, /TEST_DATABASE_URL must equal/);
});

for (const unsafeRoot of [
  '/',
  '/etc',
  '/tmp',
  '/tmp/prisma-prim-safe/nested',
  '/tmp/prisma-prim-../escape',
  '/tmp/prisma-prim-bad value',
  '/tmp/prisma-prim-$HOME',
  '/tmp/prisma-prim-semi;colon',
  '/tmp/prisma-prim-star*',
  '/workspace/.cache/other',
]) {
  test(`rejects unsafe root ${unsafeRoot}`, async (t) => {
    const fixture = await createFixture(t, { withCache: false });
    const result = runScript({
      env: {
        ...fixture.env,
        PRISMA_PRIM_POSTGRES_RUNTIME_ROOT: unsafeRoot,
      },
    });
    assertOrdinaryFailure(result, /runtime root must be one private/);
  });
}

test('rejects a root symlink without changing its target metadata', async (t) => {
  const token = randomUUID();
  const target = await mkdtemp(join(tmpdir(), 'prisma-prim-target-'));
  const root = join(tmpdir(), `prisma-prim-symlink-${token}`);
  await chmod(target, 0o700);
  await symlink(target, root);
  t.after(async () => {
    await rm(target, { recursive: true, force: true });
  });
  const fixture = await createFixture(t, { runtimeRoot: root });

  const before = await lstat(target);
  const result = runScript({
    env: fixture.env,
  });
  const after = await lstat(target);

  assertOrdinaryFailure(result, /not an exact caller-owned directory/);
  assert.equal(after.mode, before.mode);
  assert.equal(after.uid, before.uid);
  assert.equal(after.gid, before.gid);
});

test('rejects a symlink swapped into atomic root staging without touching its target', async (t) => {
  const fixture = await createFixture(t);
  const target = await mkdtemp(join(tmpdir(), 'prisma-prim-swap-target-'));
  const sentinel = join(target, 'sentinel');
  await writeFile(sentinel, 'unchanged', { mode: 0o600 });
  const before = await lstat(target);
  t.after(() => rm(target, { recursive: true, force: true }));

  const result = runScript({
    env: {
      ...fixture.env,
      FAKE_SWAP_RUNTIME_CREATE: 'true',
      FAKE_SWAP_DIRECTORY_TARGET: target,
    },
  });
  assertOrdinaryFailure(result, /root staging path .* changed during creation/);
  const swappedPath = (
    await readFile(join(fixture.logRoot, 'swapped-path'), 'utf8')
  ).trim();
  t.after(() => rm(swappedPath, { force: true }));
  const after = await lstat(target);
  assert.equal(await readFile(sentinel, 'utf8'), 'unchanged');
  assert.equal(after.mode, before.mode);
  assert.equal(after.uid, before.uid);
  assert.equal(after.gid, before.gid);
});

for (const component of ['build', 'source', 'stage']) {
  test(`rejects a symlink swapped into private ${component} staging`, async (t) => {
    const fixture = await createFixture(t, { withCache: false });
    const target = join(fixture.logRoot, `foreign-${component}-target`);
    const sentinel = join(target, 'sentinel');
    await mkdir(target, { mode: 0o700 });
    await writeFile(sentinel, 'unchanged', { mode: 0o600 });
    const before = await lstat(target);

    const result = runScript({
      args: ['--install'],
      env: {
        ...fixture.env,
        FAKE_SWAP_BUILD_COMPONENT: component,
        FAKE_SWAP_DIRECTORY_TARGET: target,
      },
    });
    assertOrdinaryFailure(result, /staging directory|build root/);
    const after = await lstat(target);
    assert.equal(await readFile(sentinel, 'utf8'), 'unchanged');
    assert.equal(after.mode, before.mode);
    assert.equal(after.uid, before.uid);
    assert.equal(after.gid, before.gid);
    assert.doesNotMatch(
      await readOptional(join(fixture.logRoot, 'operations')),
      /curl\||tar\||make\|/,
    );
  });
}

test('pins immutable PostgreSQL 17.11 source provenance and bounded build steps', () => {
  assert.match(script, new RegExp(sourceCommit));
  assert.match(script, new RegExp(sourceSha256));
  assert.match(script, /curl[\s\S]*--retry 3[\s\S]*--max-time 170/);
  assert.match(script, /sha256sum --check --status/);
  assert.match(script, /make DESTDIR=/);
  assert.match(
    script,
    /create_regular_marker[\s\S]*install_publication_intent_text="\$\{publication_intent_text\}"[\s\S]*rename_no_replace "\$\{install_root\}" "\$\{backup_install\}"[\s\S]*rename_no_replace "\$\{new_install\}" "\$\{install_root\}"[\s\S]*clear_install_publication_intent/,
  );
  assert.match(
    script,
    /recover_interrupted_install_publication \|\|[\s\S]*validate_install "\$\{install_root\}"/,
  );
  assert.doesNotMatch(script, /mv -T -- .*install/);
  assert.doesNotMatch(script, /docker/);
});

test('requires service traversal through every cache ancestor', () => {
  const functionSource = shellFunction('validate_service_cache_ancestors');
  const command = `${functionSource}
fail() { printf '%s\n' "$*" >&2; exit 1; }
cache_root=/workspace/.cache/prisma-prim-postgres-cache-0
caller_uid=0
service_uid=71
file_mode() {
  case "$1" in
    /workspace/.cache) printf '%s\n' 700 ;;
    *) printf '%s\n' 755 ;;
  esac
}
validate_service_cache_ancestors`;
  const blocked = spawnSync('/usr/bin/bash', ['-c', command], {
    encoding: 'utf8',
  });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /cache ancestor .*service traversal/);

  const traversableCommand = `${functionSource}
fail() { printf '%s\n' "$*" >&2; exit 1; }
cache_root=/workspace/.cache/prisma-prim-postgres-cache-0
caller_uid=0
service_uid=71
file_mode() { printf '%s\n' 755; }
validate_service_cache_ancestors`;
  const traversable = spawnSync('/usr/bin/bash', ['-c', traversableCommand], {
    encoding: 'utf8',
  });
  assert.equal(traversable.status, 0, traversable.stderr);
});

test('requires all trusted server binaries and supported versions', () => {
  for (const binary of requiredBinaries) {
    assert.match(script, new RegExp(`^  ${binary}$`, 'm'));
  }
  assert.match(
    script,
    /"\$\{output\}" == "\$\{binary\} \(PostgreSQL\) \$\{postgres_version\}"/,
  );
  assert.match(
    script,
    /"\$\{version\}" "\$\{postgres_version_number\}" "\$\{postgres_version_number\}"/,
  );
  assert.match(script, /07022/);
});

test('binds the lifecycle lock to runtime and closes FD8 only for daemon start', () => {
  assert.match(script, /runtime_root.*lifecycle\.lock/);
  assert.match(script, /flock -w .* 8/);
  assert.match(script, /pg_ctl[\s\S]*start \\\n\s+8>&-/);
  assert.doesNotMatch(script, /mv .*runtime_root/);
});

test('enforces least privilege and exact socket plus TCP identities', () => {
  assert.match(
    script,
    /LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS/,
  );
  assert.match(script, /CREATE ROLE .* PASSWORD/);
  assert.doesNotMatch(script, /ALTER ROLE/);
  assert.match(script, /--auth-local=peer/);
  assert.match(script, /--auth-host=scram-sha-256/);
  assert.match(script, /--data-checksums/);
  assert.match(script, /pg_ready_socket && pg_ready_tcp/);
  assert.match(script, /current_setting\('data_directory'\)/);
  assert.match(script, /server_version_num/);
  assert.doesNotMatch(script, /pg_ctl[^\n]*-o/);
});

test('selects every online Debian cluster, including recovery, and rejects malformed fields', async (t) => {
  const fixture = await createFixture(t, { withCache: false });
  const parser = [
    shellFunction('fail'),
    shellFunction('is_canonical_integer_in_range'),
    shellFunction('canonical_integer'),
    shellFunction('select_conflicting_debian_clusters'),
    'postgres_port=5432',
    'select_conflicting_debian_clusters "$1"',
  ].join('\n');
  const clusters = [
    '16 legacy 5432 online postgres /var/lib/postgresql/16/legacy /var/log/postgresql/legacy.log',
    '17 current 5432 online postgres /var/lib/postgresql/17/current /var/log/postgresql/current.log',
    '15 recovery 5432 online,recovery postgres /var/lib/postgresql/15/recovery /var/log/postgresql/recovery.log',
    '16 other-port 5544 online postgres /var/lib/postgresql/16/other /var/log/postgresql/other.log',
    '16 stopped 5432 down postgres /var/lib/postgresql/16/stopped /var/log/postgresql/stopped.log',
    '15 stopped-recovery 5432 down,recovery postgres /var/lib/postgresql/15/stopped-recovery /var/log/postgresql/stopped-recovery.log',
  ].join('\n');
  const selected = spawnSync(
    '/usr/bin/bash',
    ['-c', parser, 'bash', clusters],
    {
      encoding: 'utf8',
      env: cleanEnvironment(fixture.env),
    },
  );
  assert.equal(selected.status, 0, selected.stderr);
  assert.equal(selected.stdout, '16|legacy\n17|current\n15|recovery\n');

  const malformed = spawnSync(
    '/usr/bin/bash',
    [
      '-c',
      parser,
      'bash',
      '16 bad 5432 online postgres relative-data /var/log/postgresql/bad.log',
    ],
    { encoding: 'utf8', env: cleanEnvironment(fixture.env) },
  );
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /unsafe non-absolute paths/);

  const malformedStatus = spawnSync(
    '/usr/bin/bash',
    [
      '-c',
      parser,
      'bash',
      '16 bad 5432 online,foreign postgres /var/lib/postgresql/16/bad /var/log/postgresql/bad.log',
    ],
    { encoding: 'utf8', env: cleanEnvironment(fixture.env) },
  );
  assert.notEqual(malformedStatus.status, 0);
  assert.match(malformedStatus.stderr, /unsafe status/);
  assert.match(
    script,
    /\/usr\/bin\/pg_ctlcluster "\$\{version\}" "\$\{cluster\}" stop/,
  );
});

test('uses only fixed trusted timeout and sudo paths at the root-command boundary', async (t) => {
  const fixture = await createFixture(t, { withCache: false });
  await executable(
    join(fixture.toolRoot, 'timeout'),
    '#!/bin/bash\n: >"$FAKE_LOG/path-timeout-used"\nexit 77\n',
  );
  const functionSource = shellFunction('run_as_root');
  const root = spawnSync(
    '/usr/bin/bash',
    [
      '-c',
      `${functionSource}\ntrusted_root_command(){ printf '%s\\n' "$1"; }\nfail(){ exit 1; }\ncaller_uid=0\nrun_as_root /usr/bin/true`,
    ],
    { encoding: 'utf8', env: cleanEnvironment(fixture.env) },
  );
  assert.equal(root.status, 0, root.stderr);
  await assertAbsent(join(fixture.logRoot, 'path-timeout-used'));

  const nonRoot = spawnSync(
    '/usr/bin/bash',
    [
      '-c',
      `${functionSource}\ntrusted_root_command(){ [[ "$1" == /usr/bin/timeout ]] && printf '%s\\n' "$1"; }\nfail(){ exit 1; }\ncaller_uid=1001\nrun_as_root /usr/bin/true`,
    ],
    { encoding: 'utf8', env: cleanEnvironment(fixture.env) },
  );
  assert.notEqual(nonRoot.status, 0);
  assert.doesNotMatch(
    await readOptional(join(fixture.logRoot, 'operations')),
    /forbidden\|sudo/,
  );
  assert.match(script, /local timeout_path='\/usr\/bin\/timeout'/);
  assert.match(script, /local sudo_path='\/usr\/bin\/sudo'/);
});

test('hard-kills a root package command that ignores its bounded deadline', async (t) => {
  const fixture = await createFixture(t, { withCache: false });
  const completionMarker = join(fixture.logRoot, 'root-timeout-status');
  const childPidMarker = join(fixture.logRoot, 'root-timeout-child-pid');
  t.after(async () => {
    const childPid = (await readOptional(childPidMarker)).trim();
    if (!/^\d+$/.test(childPid)) return;
    try {
      process.kill(Number(childPid), 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  });
  const functionSource = shellFunction('run_as_root')
    .replaceAll('--kill-after=30s', '--kill-after=0.05s')
    .replaceAll('900s', '0.05s');
  const result = spawnSync(
    '/usr/bin/timeout',
    [
      '--kill-after=0.5s',
      '2s',
      '/usr/bin/bash',
      '-c',
      `${functionSource}\ntrusted_root_command(){ printf '%s\\n' "$1"; }\nfail(){ exit 1; }\ncaller_uid=0\nset +e\nrun_as_root /usr/bin/bash -c 'trap "" TERM; printf "%s\\n" "$$" >"$ROOT_TIMEOUT_CHILD_PID"; while :; do :; done' >/dev/null 2>&1\nprintf '%s\\n' "$?" >"${completionMarker}"`,
    ],
    {
      encoding: 'utf8',
      env: {
        ...cleanEnvironment(fixture.env),
        ROOT_TIMEOUT_CHILD_PID: childPidMarker,
      },
    },
  );
  assert.equal(result.status, 0, result.stderr || result.signal || 'timeout');
  assert.equal(await readFile(completionMarker, 'utf8'), '137\n');
});

test('installs required parser generators without refreshing or upgrading packages', () => {
  assert.match(shellFunction('build_prerequisites_are_ready'), /flex/);
  assert.match(shellFunction('build_prerequisites_are_ready'), /bison/);

  const installer = shellFunction('install_build_prerequisites');
  assert.match(installer, /flex/);
  assert.match(installer, /bison/);
  assert.match(installer, /--no-upgrade/);
  assert.doesNotMatch(installer, /"\$\{apt_get\}" update/);
});

async function executable(path, content) {
  await writeFile(path, content, { mode: 0o755 });
  await chmod(path, 0o755);
}

function shellFixture(strings, ...values) {
  return String.raw(strings, ...values).replaceAll('\\${', '${');
}

const fakeStat = shellFixture`#!/bin/bash
set -euo pipefail
format=''
previous=''
for argument in "$@"; do
  if [[ "$previous" == '-c' || "$previous" == '-Lc' ]]; then
    format="$argument"
  fi
  previous="$argument"
done
path="\${!#}"
resolved="$path"
if [[ "$path" == /proc/*/fd/* ]]; then
  resolved="$(/usr/bin/readlink -f -- "$path")"
fi
if [[ "\${FAKE_FAIL_INSTALL_INTENT_VALIDATION_ONCE:-false}" == 'true' &&
  "$resolved" == "\${FAKE_CACHE_ROOT}/.prisma-prim-install-publication-intent-v1" &&
  ! -e "\${FAKE_LOG}/install-intent-validation-failed" ]]; then
  : >"\${FAKE_LOG}/install-intent-validation-failed"
  exit 96
fi
if [[ -n "\${FAKE_STAT_PAUSE_PATH:-}" &&
  "$resolved" == "\${FAKE_STAT_PAUSE_PATH}" &&
  ! -e "\${FAKE_STAT_PAUSE_ENTERED}" ]]; then
  : >"\${FAKE_STAT_PAUSE_ENTERED}"
  while [[ ! -e "\${FAKE_STAT_PAUSE_RELEASE}" ]]; do
    /usr/bin/sleep 0.02
  done
fi
if [[ -n "\${FAKE_STAT_PROBE_PATH:-}" &&
  "$resolved" == "\${FAKE_STAT_PROBE_PATH}" &&
  -n "\${FAKE_STAT_PROBE_ENTERED:-}" ]]; then
  : >"\${FAKE_STAT_PROBE_ENTERED}"
fi
uid="$(/usr/bin/stat -Lc '%u' -- "$resolved")"
gid="$(/usr/bin/stat -Lc '%g' -- "$resolved")"
if [[ "$format" == '%d:%i' && "$path" == "\${FAKE_RUNTIME_ROOT}" &&
  "\${FAKE_SWAP_RUNTIME_LOCK_TO_FIFO_BEFORE_OPEN:-false}" == 'true' &&
  ! -e "\${FAKE_LOG}/runtime-lock-fifo" ]]; then
  lock="\${FAKE_RUNTIME_ROOT}/lifecycle.lock"
  /usr/bin/mv -- "$lock" "\${lock}.regular"
  /usr/bin/mkfifo -m 600 -- "$lock"
  : >"\${FAKE_LOG}/runtime-lock-fifo"
fi
if [[ "$format" == '%d:%i' && "$path" == "\${FAKE_CACHE_ROOT}" &&
  "\${FAKE_SWAP_BUILD_LOCK_TO_FIFO_BEFORE_OPEN:-false}" == 'true' &&
  ! -e "\${FAKE_LOG}/build-lock-fifo" ]]; then
  lock="\${FAKE_CACHE_ROOT}/build.lock"
  /usr/bin/mv -- "$lock" "\${lock}.regular"
  /usr/bin/mkfifo -m 600 -- "$lock"
  : >"\${FAKE_LOG}/build-lock-fifo"
fi
case "$resolved" in
  "\${FAKE_RUNTIME_ROOT}/data"*|"\${FAKE_RUNTIME_ROOT}/.data-incomplete"*|"\${FAKE_RUNTIME_ROOT}/.data-owner-incomplete/directory"*|"\${FAKE_RUNTIME_ROOT}/socket"*|"\${FAKE_RUNTIME_ROOT}/.socket-incomplete"*|"\${FAKE_RUNTIME_ROOT}/.socket-owner-incomplete/directory"*)
    uid="\${FAKE_POSTGRES_UID}"
    gid="\${FAKE_POSTGRES_GID}"
    actual_type="$(/usr/bin/stat -c '%F' -- "$resolved")"
    if [[ "\${FAKE_CALLER_UID}" == '0' &&
      "$actual_type" == regular* ]]; then
      logical_name="\${resolved##*/}"
      [[ "$logical_name" != *.create-* ]] || logical_name="\${logical_name%.create-*}"
      service_marker_log="\${FAKE_SERVICE_MARKER_LOG:-\${FAKE_LOG}}"
      if [[ ! -e "$service_marker_log/service-file-$logical_name" ]]; then
        uid="\${FAKE_CALLER_UID}"
        gid="\${FAKE_CALLER_GID}"
      fi
    fi
    ;;
  /tmp/prisma-prim-*|/workspace/.cache/prisma-prim-*)
    uid="\${FAKE_CALLER_UID}"
    gid="\${FAKE_CALLER_GID}"
    ;;
esac
if [[ -n "\${FAKE_FOREIGN_PATH:-}" && "$resolved" == "\${FAKE_FOREIGN_PATH}"* ]]; then
  uid=65534
  gid=65534
fi
case "$format" in
  '%u') echo "$uid" ;;
  '%g') echo "$gid" ;;
  '%F|%u|%g|%a')
    printf '%s|%s|%s|%s\n' \
      "$(/usr/bin/stat -c '%F' -- "$resolved")" \
      "$uid" \
      "$gid" \
      "$(/usr/bin/stat -c '%a' -- "$resolved")"
    ;;
  '%F|%u|%g|%a|%d:%i')
    printf '%s|%s|%s|%s|%s\n' \
      "$(/usr/bin/stat -Lc '%F' -- "$resolved")" \
      "$uid" \
      "$gid" \
      "$(/usr/bin/stat -Lc '%a' -- "$resolved")" \
      "$(/usr/bin/stat -Lc '%d:%i' -- "$resolved")"
    ;;
  '%F|%u|%g|%a|%d:%i|%s')
    printf '%s|%s|%s|%s|%s|%s\n' \
      "$(/usr/bin/stat -c '%F' -- "$resolved")" \
      "$uid" \
      "$gid" \
      "$(/usr/bin/stat -c '%a' -- "$resolved")" \
      "$(/usr/bin/stat -c '%d:%i' -- "$resolved")" \
      "$(/usr/bin/stat -c '%s' -- "$resolved")"
    ;;
  *) exec /usr/bin/stat "$@" ;;
esac
`;

const fakeId = shellFixture`#!/bin/bash
set -euo pipefail
if [[ "\${2:-}" == 'postgres' ]]; then
  case "\${1:-}" in
    -u) echo "\${FAKE_POSTGRES_UID}" ;;
    -g) echo "\${FAKE_POSTGRES_GID}" ;;
    -G) echo "\${FAKE_POSTGRES_GROUPS}" ;;
    *) exit 2 ;;
  esac
  exit 0
fi
case "\${1:-}" in
  -u) echo "\${FAKE_CALLER_UID}" ;;
  -g) echo "\${FAKE_CALLER_GID}" ;;
  -un) echo "\${FAKE_CALLER_USER}" ;;
  -G) echo "\${FAKE_CALLER_GID}" ;;
  *) exit 2 ;;
esac
`;

const fakeFlock = shellFixture`#!/bin/bash
set -euo pipefail
if [[ "\${!#}" == '8' && -n "\${FAKE_FLOCK_DIRECTORY:-}" ]]; then
  : >"\${FAKE_FLOCK_DIRECTORY}/\${FAKE_INSTANCE:-unknown}.attempt"
fi
if [[ "\${!#}" == '9' && -n "\${FAKE_BUILD_FLOCK_DIRECTORY:-}" ]]; then
  : >"\${FAKE_BUILD_FLOCK_DIRECTORY}/\${FAKE_INSTANCE:-unknown}.build-attempt"
fi
if [[ "\${!#}" == '8' && "\${FAKE_SWAP_LOCK_AFTER_OPEN:-false}" == 'true' ]]; then
  lock="\${FAKE_RUNTIME_ROOT}/lifecycle.lock"
  /usr/bin/mv -- "$lock" "\${lock}.opened"
  /usr/bin/cp -- "\${lock}.opened" "$lock"
  /usr/bin/chmod 600 "$lock"
fi
if [[ "\${!#}" == '9' && -n "\${FAKE_SWAP_CACHE_AFTER_OPEN:-}" &&
  ! -e "\${FAKE_LOG}/cache-root-swapped" ]]; then
  original="\${FAKE_CACHE_ROOT}.opened"
  target="\${FAKE_SWAP_CACHE_TARGET}"
  /usr/bin/mv -- "\${FAKE_CACHE_ROOT}" "$original"
  if [[ "\${FAKE_SWAP_CACHE_AFTER_OPEN}" == 'symlink' ]]; then
    /usr/bin/ln -s -- "$target" "\${FAKE_CACHE_ROOT}"
  else
    /usr/bin/mkdir -m "\${FAKE_INSTALL_MODE}" -- "\${FAKE_CACHE_ROOT}"
    /usr/bin/cp -- "$original/.prisma-prim-cache-v1" \
      "\${FAKE_CACHE_ROOT}/.prisma-prim-cache-v1"
    /usr/bin/chmod 600 "\${FAKE_CACHE_ROOT}/.prisma-prim-cache-v1"
    target="\${FAKE_CACHE_ROOT}"
  fi
  /usr/bin/ln -- "$original/build.lock" "$target/build.lock"
  : >"\${FAKE_LOG}/cache-root-swapped"
fi
set +e
/usr/bin/flock "$@"
status=$?
set -e
if [[ "$status" -eq 0 && "\${!#}" == '8' && -n "\${FAKE_FLOCK_DIRECTORY:-}" ]]; then
  : >"\${FAKE_FLOCK_DIRECTORY}/\${FAKE_INSTANCE:-unknown}.acquired"
fi
if [[ "$status" -eq 0 && "\${!#}" == '9' && -n "\${FAKE_BUILD_FLOCK_DIRECTORY:-}" ]]; then
  : >"\${FAKE_BUILD_FLOCK_DIRECTORY}/\${FAKE_INSTANCE:-unknown}.build-acquired"
fi
exit "$status"
`;

const fakeCommand = shellFixture`#!/bin/bash
set -euo pipefail
name="\${0##*/}"
case "$name" in
  bash)
    if [[ "\${1:-}" == '-c' && "\${2:-}" == *'/dev/tcp/127.0.0.1/'* ]]; then
      printf 'tcp-probe|%s\n' "$2" >>"\${FAKE_LOG}/operations"
      if [[ "\${FAKE_FORCE_PROBES_CLOSED:-false}" == 'true' ]]; then
        exit 1
      fi
      if [[ "\${FAKE_FOREIGN_LISTENER:-false}" == 'true' ||
        "\${FAKE_FOREIGN_TCP_LISTENER:-false}" == 'true' ||
        "\${FAKE_TCP_PORT_OPEN:-false}" == 'true' ||
        -e "\${FAKE_STATE_ROOT}/server.started" ]]; then
        exit 0
      fi
      exit 1
    fi
    exec /usr/bin/bash "$@"
    ;;
  awk|chmod|env|readlink|sleep|touch)
    exec "/usr/bin/$name" "$@"
    ;;
  mkdir)
    target="\${!#}"
    if { [[ -n "\${FAKE_SWAP_DIRECTORY_PATH:-}" && "$target" == "\${FAKE_SWAP_DIRECTORY_PATH}" ]] ||
      { [[ "\${FAKE_SWAP_RUNTIME_CREATE:-false}" == 'true' ]] &&
        [[ "$target" == "\${FAKE_RUNTIME_ROOT}.create-"* ]]; } ||
      { [[ "\${FAKE_SWAP_BUILD_COMPONENT:-}" == 'build' ]] &&
        [[ "$target" == "\${FAKE_CACHE_ROOT}/.build-"* ]]; } ||
      { [[ "\${FAKE_SWAP_BUILD_COMPONENT:-}" == 'source' ]] &&
        [[ "$target" == "\${FAKE_CACHE_ROOT}/.build-"*/source ]]; } ||
      { [[ "\${FAKE_SWAP_BUILD_COMPONENT:-}" == 'stage' ]] &&
        [[ "$target" == "\${FAKE_CACHE_ROOT}/.build-"*/stage ]]; }; }; then
      /usr/bin/ln -s -- "\${FAKE_SWAP_DIRECTORY_TARGET}" "$target"
      printf '%s\n' "$target" >"\${FAKE_LOG}/swapped-path"
      exit 0
    fi
    exec /usr/bin/mkdir "$@"
    ;;
  mv)
    source="\${@: -2:1}"
    destination="\${@: -1}"
    printf 'mv|%s|%s\n' "$source" "$destination" >>"\${FAKE_LOG}/operations"
    collision_phase="\${FAKE_COLLIDE_MOVE_PHASE:-}"
    collision=false
    case "$collision_phase" in
      new)
        [[ "$destination" == "\${FAKE_CACHE_ROOT}/.install-new-"* ]] && collision=true
        ;;
      backup)
        [[ "$destination" == "\${FAKE_CACHE_ROOT}/.install-backup-"* ]] && collision=true
        ;;
      final)
        [[ "$source" == "\${FAKE_CACHE_ROOT}/.install-new-"* &&
          "$destination" == "\${FAKE_INSTALL_ROOT}" ]] && collision=true
        ;;
      failed)
        [[ "$source" == "\${FAKE_INSTALL_ROOT}" &&
          "$destination" == "\${FAKE_CACHE_ROOT}/.install-failed-"* ]] && collision=true
        ;;
    esac
    if [[ "$collision" == 'true' &&
      ! -e "\${FAKE_LOG}/move-collision-$collision_phase" ]]; then
      if [[ "\${FAKE_MOVE_COLLISION_KIND:-symlink}" == 'directory' ]]; then
        /usr/bin/mv -- "\${FAKE_MOVE_COLLISION_TARGET}" "$destination"
      else
        /usr/bin/ln -s -- "\${FAKE_MOVE_COLLISION_TARGET}" "$destination"
      fi
      printf '%s\n' "$destination" >"\${FAKE_LOG}/move-collision-$collision_phase"
    fi
    if [[ -n "\${FAKE_FAIL_SERVICE_FILE:-}" &&
      "\${destination##*/}" == "\${FAKE_FAIL_SERVICE_FILE}" ]]; then
      exit 90
    fi
    if [[ -n "\${FAKE_SWAP_SERVICE_WRITE_PATH:-}" &&
      "$destination" == "\${FAKE_SWAP_SERVICE_WRITE_PATH}" ]]; then
      /usr/bin/ln -s -- "\${FAKE_SWAP_SERVICE_WRITE_TARGET}" "$destination"
      exec /usr/bin/mv "$@"
    fi
    if [[ "\${FAKE_SIGNAL_ON_BACKUP:-false}" == 'true' &&
      "$source" == "\${FAKE_INSTALL_ROOT}" &&
      "$destination" == "\${FAKE_CACHE_ROOT}/.install-backup-"* ]]; then
      /usr/bin/mv "$@"
      /usr/bin/kill "-\${FAKE_SIGNAL_NAME:-TERM}" "$PPID"
      exit 0
    fi
    if [[ "\${FAKE_SIGNAL_ON_NEW_INSTALL:-false}" == 'true' &&
      "$destination" == "\${FAKE_CACHE_ROOT}/.install-new-"* ]]; then
      /usr/bin/mv "$@"
      /usr/bin/kill "-\${FAKE_SIGNAL_NAME:-TERM}" "$PPID"
      exit 0
    fi
    if [[ -n "\${FAKE_SIGNAL_ON_DESTINATION:-}" &&
      "$destination" == "\${FAKE_SIGNAL_ON_DESTINATION}" &&
      ! -e "\${FAKE_LOG}/destination-signaled" ]]; then
      : >"\${FAKE_LOG}/destination-signaled"
      /usr/bin/mv "$@"
      /usr/bin/kill "-\${FAKE_SIGNAL_NAME:-TERM}" "$PPID"
      exit 0
    fi
    exec /usr/bin/mv "$@"
    ;;
  rm)
    for argument in "$@"; do
      if [[ -n "\${FAKE_FAIL_RM_PATH:-}" && "$argument" == "\${FAKE_FAIL_RM_PATH}" ]]; then
        exit 97
      fi
    done
    final_cleanup_target="\${!#}"
    final_cleanup_suffix="\${final_cleanup_target#"\${FAKE_CACHE_ROOT}/.build-"}"
    if [[ -n "\${FAKE_FINAL_CLEANUP_ENTERED:-}" &&
      "$final_cleanup_target" == "\${FAKE_CACHE_ROOT}/.build-"* &&
      "$final_cleanup_suffix" != */* ]]; then
      : >"\${FAKE_FINAL_CLEANUP_ENTERED}"
      while [[ ! -e "\${FAKE_FINAL_CLEANUP_RELEASE}" ]]; do
        /usr/bin/sleep 0.02
      done
    fi
    if [[ "\${FAKE_CALLER_UID}" == '0' ]]; then
      for argument in "$@"; do
        if [[ "$argument" == "\${FAKE_RUNTIME_ROOT}/.data-incomplete/"* ]] &&
          [[ "\${FAKE_SERVICE_BOUNDARY:-false}" != 'true' ]]; then
          exit 91
        fi
      done
    fi
    if [[ -n "\${FAKE_SIGNAL_AFTER_RM_BASENAME:-}" &&
      "\${!#}" == */"\${FAKE_SIGNAL_AFTER_RM_BASENAME}" &&
      ! -e "\${FAKE_LOG}/rm-signaled" ]]; then
      /usr/bin/rm "$@"
      : >"\${FAKE_LOG}/rm-signaled"
      /usr/bin/kill "-\${FAKE_SIGNAL_NAME:-TERM}" "$PPID"
      exit 0
    fi
    exec /usr/bin/rm "$@"
    ;;
  rmdir)
    if [[ -n "\${FAKE_FAIL_RMDIR_PATH:-}" && "\${!#}" == "\${FAKE_FAIL_RMDIR_PATH}" ]]; then
      exit 97
    fi
    exec /usr/bin/rmdir "$@"
    ;;
  tee)
    target="\${!#}"
    if [[ "\${FAKE_CALLER_UID}" == '0' && "$target" == "\${FAKE_RUNTIME_ROOT}"/* ]] &&
      [[ "\${FAKE_SERVICE_BOUNDARY:-false}" != 'true' ]]; then
      exit 91
    fi
    logical_target="$target"
    [[ "$logical_target" != *.create-* ]] || logical_target="\${logical_target%.create-*}"
    if [[ -n "\${FAKE_FAIL_SERVICE_FILE:-}" &&
      "\${logical_target##*/}" == "\${FAKE_FAIL_SERVICE_FILE}" ]]; then
      exit 90
    fi
    exec /usr/bin/tee "$@"
    ;;
  timeout)
    duration="$1"
    shift
    if [[ -n "\${FAKE_TIMEOUT_BINARY:-}" ]]; then
      for argument in "$@"; do
        if [[ "\${argument##*/}" == "\${FAKE_TIMEOUT_BINARY}" ]]; then
          exit 124
        fi
      done
    fi
    exec /usr/bin/timeout "$duration" "$@"
    ;;
  getent)
    if [[ "\${FAKE_POSTGRES_ACCOUNT_MISSING:-false}" == 'true' &&
      ! -e "\${FAKE_LOG}/account-created" ]]; then
      exit 2
    fi
    printf 'postgres:x:%s:%s:PostgreSQL:%s:/usr/sbin/nologin\n' \
      "\${FAKE_POSTGRES_UID}" "\${FAKE_POSTGRES_GID}" "\${FAKE_RUNTIME_ROOT}/service-home"
    ;;
  useradd)
    [[ "\${FAKE_ALLOW_USERADD:-false}" == 'true' ]] || exit 92
    printf '%s\n' "$*" >"\${FAKE_LOG}/useradd"
    : >"\${FAKE_LOG}/account-created"
    ;;
  runuser)
    [[ "\${1:-}" == '-u' && "\${2:-}" == 'postgres' && "\${3:-}" == '--' ]] || exit 93
    printf 'runuser|%s\n' "$*" >>"\${FAKE_LOG}/operations"
    shift 3
    if [[ "\${1:-}" == '/bin/bash' && " $* " == *' prisma-prim-service-write '* ]]; then
      target="\${!#}"
      logical_name="\${target##*/}"
      [[ "$logical_name" != *.create-* ]] || logical_name="\${logical_name%.create-*}"
      : >"\${FAKE_LOG}/service-file-$logical_name"
    fi
    FAKE_SERVICE_BOUNDARY=true exec "$@"
    ;;
  install)
    has_directory=false
    has_owner=false
    has_group=false
    mode=''
    previous=''
    for argument in "$@"; do
      [[ "$argument" != '-d' ]] || has_directory=true
      [[ "$previous" != '-m' ]] || mode="$argument"
      [[ "$previous" != '-o' || "$argument" != 'postgres' ]] || has_owner=true
      [[ "$previous" != '-g' || "$argument" != 'postgres' ]] || has_group=true
      previous="$argument"
    done
    target="\${!#}"
    [[ "$has_directory" == 'true' && -n "$mode" ]] || exit 94
    if [[ "\${FAKE_CALLER_UID}" == '0' ]]; then
      [[ "$has_owner" == 'true' && "$has_group" == 'true' ]] || exit 95
    fi
    printf 'install|%s|postgres|postgres|%s\n' "$mode" "$target" >>"\${FAKE_LOG}/operations"
    /usr/bin/mkdir -m "$mode" -- "$target"
    ;;
  sudo|apt-get)
    printf 'forbidden|%s\n' "$name" >>"\${FAKE_LOG}/operations"
    exit 96
    ;;
  cc)
    [[ "\${FAKE_CC_FAIL:-false}" != 'true' ]] || exit 97
    output=''
    source=''
    previous=''
    for argument in "$@"; do
      [[ "$previous" != '-o' ]] || output="$argument"
      [[ "$argument" != *.c ]] || source="$argument"
      previous="$argument"
    done
    [[ -n "$output" && -n "$source" ]] || exit 97
    [[ "$source" == "\${FAKE_CACHE_ROOT}/.build-"*/compiler-probe.c ]] || exit 97
    build_root="\${source%/compiler-probe.c}"
    [[ "$output" == "$build_root/compiler-probe" ]] || exit 97
    [[ "$(/usr/bin/cat "$build_root/.prisma-prim-build-v1")" == 'prisma-prim-postgres-build-v1' ]] || exit 97
    [[ "$(/usr/bin/cat "$source")" == *'#include <readline/readline.h>'* ]] || exit 97
    [[ "$(/usr/bin/cat "$source")" == *'#include <zlib.h>'* ]] || exit 97
    [[ " $* " == *' -lreadline '* && " $* " == *' -lz '* ]] || exit 97
    printf '#!/bin/bash\nexit 0\n' >"$output"
    /usr/bin/chmod 700 "$output"
    printf 'cc|%s\n' "$*" >>"\${FAKE_LOG}/operations"
    ;;
  curl)
    [[ "\${FAKE_CURL_FAIL:-false}" != 'true' ]] || exit 28
    output=''
    max_filesize=''
    previous=''
    for argument in "$@"; do
      [[ "$previous" != '--output' ]] || output="$argument"
      [[ "$previous" != '--max-filesize' ]] || max_filesize="$argument"
      previous="$argument"
    done
    [[ -n "$output" && "$max_filesize" == '67108864' ]] || exit 98
    if [[ "\${FAKE_OVERSIZED_DOWNLOAD:-false}" == 'true' ]]; then
      printf 'curl-oversized|%s\n' "$max_filesize" >>"\${FAKE_LOG}/operations"
      exit 63
    fi
    printf 'pinned postgres source\n' >"$output"
    printf 'curl|%s\n' "$*" >>"\${FAKE_LOG}/operations"
    ;;
  sha256sum)
    if [[ "\${1:-}" == '--check' ]]; then
      input="$(/usr/bin/cat)"
      [[ "\${FAKE_BAD_CHECKSUM:-false}" != 'true' ]] || exit 1
      [[ "$input" == "\${FAKE_SOURCE_SHA256}  "* ]] || exit 1
      printf 'checksum|ok\n' >>"\${FAKE_LOG}/operations"
      exit 0
    fi
    exec /usr/bin/sha256sum "$@"
    ;;
  dd)
    input=''
    for argument in "$@"; do
      [[ "$argument" != if=* ]] || input="\${argument#if=}"
    done
    [[ -n "$input" ]] || exit 98
    if [[ -n "\${FAKE_SWAP_READ_PATH:-}" && "$input" == "\${FAKE_SWAP_READ_PATH}" ]]; then
      /usr/bin/mv -- "$input" "\${input}.original"
      /usr/bin/ln -s -- "\${FAKE_SWAP_READ_TARGET}" "$input"
    fi
    exec /usr/bin/dd "$@"
    ;;
  tar)
    [[ "\${FAKE_TAR_FAIL:-false}" != 'true' ]] || exit 99
    directory=''
    previous=''
    for argument in "$@"; do
      [[ "$previous" != '--directory' ]] || directory="$argument"
      previous="$argument"
    done
    [[ -n "$directory" ]] || exit 99
    /usr/bin/mkdir -p -- "$directory"
    printf '#!/bin/bash\nset -euo pipefail\nprintf "configure|%%s\\n" "$*" >>"$FAKE_LOG/operations"\n[[ "\${FAKE_CONFIGURE_FAIL:-false}" != true ]]\n' >"$directory/configure"
    /usr/bin/chmod 700 "$directory/configure"
    printf 'tar|%s\n' "$*" >>"\${FAKE_LOG}/operations"
    ;;
  make)
    [[ "\${FAKE_MAKE_FAIL:-false}" != 'true' ]] || exit 2
    printf 'make|%s\n' "$*" >>"\${FAKE_LOG}/operations"
    destination=''
    for argument in "$@"; do
      [[ "$argument" != DESTDIR=* ]] || destination="\${argument#DESTDIR=}"
    done
    if [[ -n "$destination" && " $* " == *' install '* ]]; then
      staged="\${destination}\${FAKE_INSTALL_ROOT}"
      /usr/bin/mkdir -p -- "$staged/bin" "$staged/lib" "$staged/share"
      /usr/bin/chmod "\${FAKE_INSTALL_MODE}" "$staged"
      for binary in postgres pg_ctl initdb pg_isready psql createdb createuser; do
        /usr/bin/cp -- "\${FAKE_POSTGRES_TEMPLATE}" "$staged/bin/$binary"
        /usr/bin/chmod 755 "$staged/bin/$binary"
      done
      printf 'fake postgres catalog\n' >"$staged/share/postgres.bki"
      printf 'fake postgres configuration\n' >"$staged/share/postgresql.conf.sample"
      /usr/bin/chmod 644 "$staged/share/postgres.bki" "$staged/share/postgresql.conf.sample"
    fi
    ;;
  flex|bison|gzip)
    exit 0
    ;;
  *)
    echo "unexpected fake command: $name" >&2
    exit 127
    ;;
esac
`;

const fakePostgres = shellFixture`#!/bin/bash
set -euo pipefail
name="\${0##*/}"
if [[ "$name" =~ ^[0-9]+$ ]]; then
  resolved="$(/usr/bin/readlink -f -- "$0")"
  name="\${resolved##*/}"
fi
if [[ "\${1:-}" == '--version' ]]; then
  printf 'version|%s\n' "$name" >>"\${FAKE_LOG}/operations"
  if [[ "\${FAKE_MALFORMED_VERSION_BINARY:-}" == "$name" ]]; then
    echo "$name 17.11"
  elif [[ "\${FAKE_WRONG_BINARY:-}" == "$name" ]]; then
    echo "$name (PostgreSQL) 16.9"
  else
    echo "$name (PostgreSQL) \${FAKE_BINARY_VERSION:-17.11}"
  fi
  exit 0
fi
if [[ "\${FAKE_CALLER_UID}" == '0' ]]; then
  case "$name" in
    initdb|pg_ctl|createdb|createuser)
      [[ "\${FAKE_SERVICE_BOUNDARY:-false}" == 'true' ]] || exit 89
      ;;
  esac
fi
case "$name" in
  initdb)
    echo initdb >>"\${FAKE_LOG}/initdb"
    if [[ "\${FAKE_SIGNAL_DURING_INITDB:-false}" == 'true' ]]; then
      /usr/bin/kill -TERM "$PPID"
      exit 0
    fi
    [[ "\${FAKE_INITDB_FAIL:-false}" != 'true' ]] || exit 41
    arguments=" $* "
    [[ "$arguments" == *' --auth-local=peer '* ]] || exit 43
    [[ "$arguments" == *' --auth-host=scram-sha-256 '* ]] || exit 43
    [[ "$arguments" == *' --data-checksums '* ]] || exit 43
    [[ "$arguments" == *' --encoding=UTF8 '* ]] || exit 43
    [[ "$arguments" == *' --no-locale '* ]] || exit 43
    data=''
    while (( $# > 0 )); do
      if [[ "$1" == '-D' ]]; then data="$2"; shift 2; else shift; fi
    done
    if [[ -n "\${FAKE_INITDB_ENTERED:-}" ]]; then
      : >"\${FAKE_INITDB_ENTERED}"
      while [[ ! -e "\${FAKE_INITDB_RELEASE}" ]]; do /usr/bin/sleep 0.02; done
    fi
    printf '17\n' >"$data/PG_VERSION"
    : >"$data/postgresql.conf"
    : >"$data/pg_hba.conf"
    : >"$data/pg_ident.conf"
    for service_file in PG_VERSION postgresql.conf pg_hba.conf pg_ident.conf; do
      : >"\${FAKE_LOG}/service-file-$service_file"
    done
    chmod 600 "$data/PG_VERSION" "$data/postgresql.conf" "$data/pg_hba.conf" "$data/pg_ident.conf"
    ;;
  pg_ctl)
    operation=''
    for argument in "$@"; do
      if [[ "$argument" == 'start' || "$argument" == 'stop' ]]; then operation="$argument"; fi
    done
    if [[ "$operation" == 'start' ]]; then
      [[ ! -e /proc/$$/fd/8 ]] || exit 88
      [[ ! -e /proc/$$/fd/9 ]] || exit 88
      [[ " $* " != *' -o '* ]] || exit 87
      [[ "\${FAKE_START_FAIL:-false}" != 'true' ]] || exit 42
      : >"\${FAKE_STATE_ROOT}/server.started"
      echo start >>"\${FAKE_LOG}/pg_ctl"
    elif [[ "$operation" == 'stop' ]]; then
      if [[ "\${FAKE_STOP_FAIL:-false}" == 'true' ]]; then
        echo stop-failed >>"\${FAKE_LOG}/pg_ctl"
        exit 58
      fi
      rm -f "\${FAKE_STATE_ROOT}/server.started"
      echo stop >>"\${FAKE_LOG}/pg_ctl"
    fi
    ;;
  pg_isready)
    host=''
    while (( $# > 0 )); do
      if [[ "$1" == '--host' ]]; then host="$2"; shift 2; else shift; fi
    done
    if [[ "\${FAKE_FORCE_PROBES_CLOSED:-false}" == 'true' ]]; then exit 2; fi
    if [[ "\${FAKE_FOREIGN_LISTENER:-false}" == 'true' ]]; then exit 0; fi
    if [[ "\${FAKE_FOREIGN_TCP_LISTENER:-false}" == 'true' && "$host" == '127.0.0.1' ]]; then exit 0; fi
    if [[ "\${FAKE_FOREIGN_SOCKET_LISTENER:-false}" == 'true' && "$host" == "\${FAKE_SOCKET_ROOT}" ]]; then exit 0; fi
    if [[ "\${FAKE_NOT_READY:-false}" == 'true' ]]; then exit 2; fi
    if [[ "\${FAKE_TCP_NOT_READY:-false}" == 'true' && "$host" == '127.0.0.1' ]]; then exit 2; fi
    if [[ "\${FAKE_SOCKET_NOT_READY:-false}" == 'true' && "$host" == "\${FAKE_SOCKET_ROOT}" ]]; then exit 2; fi
    [[ -e "\${FAKE_STATE_ROOT}/server.started" ]]
    ;;
  psql)
    database='postgres'
    username="\${FAKE_CALLER_USER}"
    host=''
    query=''
    while (( $# > 0 )); do
      case "$1" in
        --dbname) database="$2"; shift 2 ;;
        --username) username="$2"; shift 2 ;;
        --host) host="$2"; shift 2 ;;
        --command) query="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    if [[ "\${FAKE_CALLER_UID}" == '0' && "$host" == "\${FAKE_SOCKET_ROOT}" ]]; then
      [[ "\${FAKE_SERVICE_BOUNDARY:-false}" == 'true' ]] || exit 89
    fi
    [[ "\${FAKE_FAIL_OPERATION:-}" != 'psql' ]] || exit 50
    if [[ "\${FAKE_REJECT_APP_PASSWORD:-false}" == 'true' && "$host" == '127.0.0.1' && "$username" == 'prisma_prim' ]]; then
      exit 59
    fi
    if [[ "$host" == '127.0.0.1' && "$username" == 'prisma_prim' &&
      "\${PGPASSWORD:-}" == 'prisma-prim-known-invalid-password-v1' ]]; then
      printf 'psql: FATAL: password authentication failed for user "prisma_prim"\n' >&2
      [[ "\${FAKE_TCP_TRUST_AUTH:-false}" == 'true' ]] || exit 59
    fi
    if [[ "$query" == *'SELECT 1 FROM pg_roles'* || "$query" == *'SELECT 1 FROM pg_database'* ]]; then
      probe_count_file="\${FAKE_STATE_ROOT}/catalog-probe-count"
      probe_count=0
      if [[ -f "$probe_count_file" ]]; then
        probe_count="$(<"$probe_count_file")"
      fi
      ((probe_count += 1))
      printf '%s\n' "$probe_count" >"$probe_count_file"
      if [[ "\${FAKE_FAIL_CATALOG_PROBE_NUMBER:-}" == "$probe_count" ]]; then
        exit 57
      fi
      if [[ "\${FAKE_MALFORMED_CATALOG_PROBE_NUMBER:-}" == "$probe_count" ]]; then
        printf '1\n1\n'
        exit 0
      fi
    fi
    if [[ "$query" == *'rolcanlogin'* && "$query" != *'pg_get_userbyid'* ]]; then
      [[ -e "\${FAKE_STATE_ROOT}/role.configured" ]] || exit 51
      data="\${FAKE_IDENTITY_DATA:-\${FAKE_DATA_ROOT}}"
      port="\${FAKE_IDENTITY_PORT:-\${FAKE_PORT}}"
      socket="\${FAKE_IDENTITY_SOCKET:-\${FAKE_SOCKET_ROOT}}"
      listen="\${FAKE_IDENTITY_LISTEN:-127.0.0.1}"
      version="\${FAKE_IDENTITY_VERSION:-170011}"
      checksums="\${FAKE_IDENTITY_CHECKSUMS:-on}"
      login="\${FAKE_ROLE_LOGIN:-t}"
      createdb="\${FAKE_ROLE_CREATEDB:-t}"
      superuser="\${FAKE_ROLE_SUPERUSER:-f}"
      createrole="\${FAKE_ROLE_CREATEROLE:-f}"
      replication="\${FAKE_ROLE_REPLICATION:-f}"
      bypassrls="\${FAKE_ROLE_BYPASSRLS:-f}"
      connection_limit="\${FAKE_ROLE_CONNECTION_LIMIT:--1}"
      sentinel="\${FAKE_IDENTITY_SENTINEL:-prisma-prim-ok}"
      reported_database="\${FAKE_IDENTITY_DATABASE:-$database}"
      reported_user="\${FAKE_IDENTITY_USER:-$username}"
      if [[ "$host" == '127.0.0.1' ]]; then
        data="\${FAKE_TCP_IDENTITY_DATA:-$data}"
        port="\${FAKE_TCP_IDENTITY_PORT:-$port}"
        socket="\${FAKE_TCP_IDENTITY_SOCKET:-$socket}"
        listen="\${FAKE_TCP_IDENTITY_LISTEN:-$listen}"
        version="\${FAKE_TCP_IDENTITY_VERSION:-$version}"
        reported_database="\${FAKE_TCP_IDENTITY_DATABASE:-$reported_database}"
        reported_user="\${FAKE_TCP_IDENTITY_USER:-$reported_user}"
        sentinel="\${FAKE_TCP_IDENTITY_SENTINEL:-$sentinel}"
      fi
      membership_prefix=''
      if [[ "$query" == *'pg_auth_members'* ]]; then
        membership_prefix="\${FAKE_ROLE_RELATION_COUNT:-\${FAKE_ROLE_MEMBERSHIP_COUNT:-0}}|"
      fi
      role_setting_prefix=''
      if [[ "$query" == *'pg_db_role_setting s WHERE s.setrole = r.oid'* ]]; then
        role_setting_prefix="\${FAKE_ROLE_SETTING_COUNT:-0}|"
      fi
      valid_until_prefix=''
      if [[ "$query" == *'rolvaliduntil'* ]]; then
        valid_until_prefix="\${FAKE_ROLE_VALID_UNTIL_IS_NULL:-t}|"
      fi
      printf 'role-identity|%s|%s|%s\n' "$host" "$database" "$username" >>"\${FAKE_LOG}/operations"
      printf '%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s%s\n' \
        "$data" "$port" "$socket" "$listen" "$version" "$reported_database" "$reported_user" \
        "$checksums" "$login" "$createdb" "$superuser" "$createrole" "$replication" \
        "$bypassrls" "$connection_limit" \
        "$valid_until_prefix$membership_prefix$role_setting_prefix$sentinel" \
        "\${FAKE_IDENTITY_EXTRA:-}"
    elif [[ "$query" == *'rolcanlogin'* ]]; then
      [[ -e "\${FAKE_STATE_ROOT}/role.configured" ]] || exit 51
      [[ -e "\${FAKE_STATE_ROOT}/database.$database" ]] || exit 52
      data="\${FAKE_IDENTITY_DATA:-\${FAKE_DATA_ROOT}}"
      port="\${FAKE_IDENTITY_PORT:-\${FAKE_PORT}}"
      socket="\${FAKE_IDENTITY_SOCKET:-\${FAKE_SOCKET_ROOT}}"
      listen="\${FAKE_IDENTITY_LISTEN:-127.0.0.1}"
      version="\${FAKE_IDENTITY_VERSION:-170011}"
      checksums="\${FAKE_IDENTITY_CHECKSUMS:-on}"
      login="\${FAKE_ROLE_LOGIN:-t}"
      createdb="\${FAKE_ROLE_CREATEDB:-t}"
      superuser="\${FAKE_ROLE_SUPERUSER:-f}"
      createrole="\${FAKE_ROLE_CREATEROLE:-f}"
      replication="\${FAKE_ROLE_REPLICATION:-f}"
      bypassrls="\${FAKE_ROLE_BYPASSRLS:-f}"
      connection_limit="\${FAKE_ROLE_CONNECTION_LIMIT:--1}"
      owner="\${FAKE_DATABASE_OWNER:-prisma_prim}"
      sentinel="\${FAKE_IDENTITY_SENTINEL:-prisma-prim-ok}"
      reported_database="\${FAKE_IDENTITY_DATABASE:-$database}"
      reported_user="\${FAKE_IDENTITY_USER:-$username}"
      if [[ "$host" == '127.0.0.1' ]]; then
        data="\${FAKE_TCP_IDENTITY_DATA:-$data}"
        port="\${FAKE_TCP_APP_IDENTITY_PORT:-\${FAKE_TCP_IDENTITY_PORT:-$port}}"
        socket="\${FAKE_TCP_IDENTITY_SOCKET:-$socket}"
        listen="\${FAKE_TCP_IDENTITY_LISTEN:-$listen}"
        version="\${FAKE_TCP_IDENTITY_VERSION:-$version}"
        reported_database="\${FAKE_TCP_IDENTITY_DATABASE:-$reported_database}"
        reported_user="\${FAKE_TCP_IDENTITY_USER:-$reported_user}"
        sentinel="\${FAKE_TCP_IDENTITY_SENTINEL:-$sentinel}"
      fi
      membership_prefix=''
      if [[ "$query" == *'pg_auth_members'* ]]; then
        membership_prefix="\${FAKE_ROLE_RELATION_COUNT:-\${FAKE_ROLE_MEMBERSHIP_COUNT:-0}}|"
      fi
      role_setting_prefix=''
      if [[ "$query" == *'pg_db_role_setting s WHERE s.setrole = r.oid'* ]]; then
        role_setting_prefix="\${FAKE_ROLE_SETTING_COUNT:-0}|"
      fi
      database_setting_prefix=''
      if [[ "$query" == *'s.setdatabase = d.oid AND s.setrole = 0'* ]]; then
        database_setting_prefix="\${FAKE_DATABASE_SETTING_COUNT:-0}|"
      fi
      valid_until_prefix=''
      if [[ "$query" == *'rolvaliduntil'* ]]; then
        valid_until_prefix="\${FAKE_ROLE_VALID_UNTIL_IS_NULL:-t}|"
      fi
      database_connection_limit_prefix=''
      if [[ "$query" == *'datconnlimit'* ]]; then
        database_connection_limit_prefix="\${FAKE_DATABASE_CONNECTION_LIMIT:--1}|"
      fi
      database_acl_prefix=''
      if [[ "$query" == *'datacl IS NULL'* ]]; then
        database_acl_prefix="\${FAKE_DATABASE_ACL_IS_NULL:-t}|"
      fi
      printf 'identity|%s|%s|%s\n' "$host" "$database" "$username" >>"\${FAKE_LOG}/operations"
      printf '%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s%s\n' \
        "$data" "$port" "$socket" "$listen" "$version" "$reported_database" "$reported_user" \
        "$checksums" "$login" "$createdb" "$superuser" "$createrole" "$replication" \
        "$bypassrls" "$connection_limit" \
        "$valid_until_prefix$database_connection_limit_prefix$database_acl_prefix$owner" \
        "$membership_prefix$role_setting_prefix$database_setting_prefix$sentinel" \
        "\${FAKE_IDENTITY_EXTRA:-}"
    elif [[ "$query" == *"current_setting('data_directory')"* ]]; then
      printf '%s|%s|%s|%s|%s|postgres|%s|%s|%s\n' \
        "\${FAKE_IDENTITY_DATA:-\${FAKE_DATA_ROOT}}" \
        "\${FAKE_IDENTITY_PORT:-\${FAKE_PORT}}" \
        "\${FAKE_IDENTITY_SOCKET:-\${FAKE_SOCKET_ROOT}}" \
        "\${FAKE_IDENTITY_LISTEN:-127.0.0.1}" \
        "\${FAKE_IDENTITY_VERSION:-170011}" \
        "$username" \
        "\${FAKE_IDENTITY_CHECKSUMS:-on}" \
        "\${FAKE_IDENTITY_SENTINEL:-prisma-prim-ok}"
    elif [[ "$query" == 'SHOW server_version' ]]; then
      echo "\${FAKE_SERVER_VERSION:-17.11}"
    elif [[ "$query" == *'SELECT 1 FROM pg_roles'* ]]; then
      if [[ -e "\${FAKE_STATE_ROOT}/role.exists" ]]; then echo 1; fi
    elif [[ "$query" == *"datname = 'prisma_prim_dev'"* ]]; then
      if [[ -e "\${FAKE_STATE_ROOT}/database.prisma_prim_dev" ]]; then echo 1; fi
    elif [[ "$query" == *"datname = 'prisma_prim_test'"* ]]; then
      if [[ -e "\${FAKE_STATE_ROOT}/database.prisma_prim_test" ]]; then echo 1; fi
    elif [[ "$query" == CREATE\ ROLE* ]]; then
      [[ "\${FAKE_FAIL_OPERATION:-}" != 'create-role' ]] || exit 53
      : >"\${FAKE_STATE_ROOT}/role.exists"
      : >"\${FAKE_STATE_ROOT}/role.configured"
      echo create-role >>"\${FAKE_LOG}/mutations"
      if [[ "\${FAKE_SIGNAL_AFTER_CREATE_ROLE:-false}" == 'true' ]]; then
        /usr/bin/kill -TERM "$PPID"
        exit 0
      fi
    elif [[ "$query" == ALTER\ DATABASE\ prisma_prim_dev* ]]; then
      [[ "\${FAKE_FAIL_OPERATION:-}" != 'alter-database' ]] || exit 54
      : >"\${FAKE_STATE_ROOT}/database.prisma_prim_dev"
      echo alter-database-dev >>"\${FAKE_LOG}/mutations"
    elif [[ "$query" == ALTER\ DATABASE\ prisma_prim_test* ]]; then
      [[ "\${FAKE_FAIL_OPERATION:-}" != 'alter-database' ]] || exit 54
      : >"\${FAKE_STATE_ROOT}/database.prisma_prim_test"
      echo alter-database-test >>"\${FAKE_LOG}/mutations"
    fi
    ;;
  createuser)
    [[ "\${FAKE_FAIL_OPERATION:-}" != 'createuser' ]] || exit 55
    : >"\${FAKE_STATE_ROOT}/role.exists"
    echo createuser >>"\${FAKE_LOG}/mutations"
    ;;
  createdb)
    database="\${!#}"
    [[ "\${FAKE_FAIL_OPERATION:-}" != 'createdb' ]] || exit 56
    [[ "\${FAKE_FAIL_CREATEDB_DATABASE:-}" != "$database" ]] || exit 56
    : >"\${FAKE_STATE_ROOT}/database.$database"
    echo "createdb-$database" >>"\${FAKE_LOG}/mutations"
    ;;
esac
`;

async function createFixture(
  t,
  {
    runtimeRoot = join(tmpdir(), `prisma-prim-runtime-test-${randomUUID()}`),
    cacheRoot = join(tmpdir(), `prisma-prim-cache-test-${randomUUID()}`),
    toolRoot = join(tmpdir(), `prisma-prim-tools-test-${randomUUID()}`),
    port = String(40_000 + Math.floor(Math.random() * 10_000)),
    callerUid = hostUid,
    callerGid = hostGid,
    callerUser = callerUid === '0' ? 'root' : 'tester',
    postgresUid = callerUid === '0' ? '71' : callerUid,
    postgresGid = callerUid === '0' ? '71' : callerGid,
    postgresGroups = postgresGid,
    stateRoot,
    withCache = true,
  } = {},
) {
  const logRoot = join(tmpdir(), `prisma-prim-log-test-${randomUUID()}`);
  const serverStateRoot = stateRoot ?? logRoot;
  const installRoot = join(cacheRoot, 'install');
  const binRoot = join(installRoot, 'bin');
  await mkdir(toolRoot, { mode: 0o700 });
  await mkdir(logRoot, { mode: 0o700 });
  if (serverStateRoot !== logRoot) {
    await mkdir(serverStateRoot, { recursive: true, mode: 0o700 });
  }
  const installMode = callerUid === '0' ? 0o711 : 0o700;
  const cacheMode = callerUid === '0' ? 0o711 : 0o700;

  if (withCache) {
    await mkdir(binRoot, { recursive: true, mode: 0o755 });
    await mkdir(join(installRoot, 'lib'), { mode: 0o755 });
    await mkdir(join(installRoot, 'share'), { mode: 0o755 });
    await writeFile(
      join(installRoot, 'share', 'postgres.bki'),
      'fake postgres catalog\n',
      { mode: 0o644 },
    );
    await writeFile(
      join(installRoot, 'share', 'postgresql.conf.sample'),
      'fake postgres configuration\n',
      { mode: 0o644 },
    );
    await chmod(cacheRoot, cacheMode);
    await chmod(installRoot, installMode);
    await chmod(binRoot, 0o755);
    await chmod(join(installRoot, 'lib'), 0o755);
    await chmod(join(installRoot, 'share'), 0o755);

    await writeFile(
      join(cacheRoot, '.prisma-prim-cache-v1'),
      `prisma-prim-postgres-cache-v1
version=17.11
commit=${sourceCommit}
sha256=${sourceSha256}
`,
      { mode: 0o600 },
    );
    await writeFile(
      join(installRoot, '.prisma-prim-install-v1'),
      `prisma-prim-postgres-install-v1
version=17.11
commit=${sourceCommit}
sha256=${sourceSha256}
`,
      { mode: 0o600 },
    );
  }

  await executable(join(toolRoot, 'id'), fakeId);
  await executable(join(toolRoot, 'stat'), fakeStat);
  await executable(join(toolRoot, 'flock'), fakeFlock);
  const fakeCommands = [
    'awk',
    'bash',
    'chmod',
    'cc',
    'curl',
    'dd',
    'env',
    'getent',
    'gzip',
    'install',
    'make',
    'mkdir',
    'mv',
    'readlink',
    'rm',
    'rmdir',
    'runuser',
    'sha256sum',
    'sleep',
    'sudo',
    'apt-get',
    'bison',
    'flex',
    'tar',
    'tee',
    'timeout',
    'touch',
    'useradd',
  ];
  for (const command of fakeCommands) {
    await executable(join(toolRoot, command), fakeCommand);
  }
  const postgresTemplate = join(toolRoot, 'postgres-template');
  await executable(postgresTemplate, fakePostgres);
  if (withCache) {
    for (const binary of requiredBinaries) {
      await executable(join(binRoot, binary), fakePostgres);
    }
    await writeFixtureInstallManifest(installRoot);
  }

  const dataRoot = join(runtimeRoot, 'data');
  const socketRoot = join(runtimeRoot, 'socket');
  const serviceUser = callerUid === '0' ? 'postgres' : callerUser;
  const env = {
    PATH: toolRoot,
    DATABASE_URL: `postgresql://prisma_prim:prisma_prim@127.0.0.1:${port}/prisma_prim_dev`,
    TEST_DATABASE_URL: `postgresql://prisma_prim:prisma_prim@127.0.0.1:${port}/prisma_prim_test`,
    PRISMA_PRIM_POSTGRES_CACHE_ROOT: cacheRoot,
    PRISMA_PRIM_POSTGRES_RUNTIME_ROOT: runtimeRoot,
    PRISMA_PRIM_POSTGRES_PORT: port,
    PRISMA_PRIM_POSTGRES_READY_ATTEMPTS: '2',
    PRISMA_PRIM_POSTGRES_LOCK_SECONDS: '5',
    PRISMA_PRIM_POSTGRES_STOP_CONFLICTING_CLUSTER: 'false',
    FAKE_DATA_ROOT: dataRoot,
    FAKE_SOCKET_ROOT: socketRoot,
    FAKE_RUNTIME_ROOT: runtimeRoot,
    FAKE_CACHE_ROOT: cacheRoot,
    FAKE_INSTALL_ROOT: installRoot,
    FAKE_INSTALL_MODE: String(installMode.toString(8)),
    FAKE_CALLER_UID: callerUid,
    FAKE_CALLER_GID: callerGid,
    FAKE_CALLER_USER: callerUser,
    FAKE_POSTGRES_UID: postgresUid,
    FAKE_POSTGRES_GID: postgresGid,
    FAKE_POSTGRES_GROUPS: postgresGroups,
    FAKE_POSTGRES_TEMPLATE: postgresTemplate,
    FAKE_SOURCE_SHA256: sourceSha256,
    FAKE_PORT: port,
    FAKE_LOG: logRoot,
    FAKE_STATE_ROOT: serverStateRoot,
  };

  t.after(async () => {
    await Promise.all(
      [runtimeRoot, cacheRoot, toolRoot, logRoot].map((path) =>
        rm(path, { recursive: true, force: true }),
      ),
    );
  });
  return {
    cacheRoot,
    dataRoot,
    env,
    installRoot,
    logRoot,
    postgresGid,
    postgresUid,
    runtimeRoot,
    serviceUser,
    stateRoot: serverStateRoot,
    toolRoot,
  };
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

async function createValidForeignInstall(path, fixture) {
  const binRoot = join(path, 'bin');
  await mkdir(binRoot, { recursive: true, mode: 0o755 });
  await mkdir(join(path, 'lib'), { mode: 0o755 });
  await mkdir(join(path, 'share'), { mode: 0o755 });
  await writeFile(
    join(path, 'share', 'postgres.bki'),
    'fake postgres catalog\n',
    {
      mode: 0o644,
    },
  );
  await writeFile(
    join(path, 'share', 'postgresql.conf.sample'),
    'fake postgres configuration\n',
    { mode: 0o644 },
  );
  await chmod(path, Number.parseInt(fixture.env.FAKE_INSTALL_MODE, 8));
  await writeFile(
    join(path, '.prisma-prim-install-v1'),
    `prisma-prim-postgres-install-v1
version=17.11
commit=${sourceCommit}
sha256=${sourceSha256}
`,
    { mode: 0o600 },
  );
  for (const binary of requiredBinaries) {
    await executable(join(binRoot, binary), fakePostgres);
  }
  await writeFixtureInstallManifest(path);
}

async function assertAbsent(path) {
  await assert.rejects(lstat(path), (error) => error?.code === 'ENOENT');
}

function assertSuccess(result) {
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Local PostgreSQL 17\.11 is ready/);
}

async function establishRunningFixture(t, options = {}) {
  const fixture = await createFixture(t, options);
  assertSuccess(runScript({ env: fixture.env }));
  return fixture;
}

test('executes the real lifecycle successfully and reuses its exact state', async (t) => {
  const fixture = await createFixture(t);
  const first = runScript({ env: fixture.env });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.signal, null);
  assert.match(first.stdout, /Local PostgreSQL 17\.11 is ready/);

  const second = runScript({ env: fixture.env });
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Local PostgreSQL 17\.11 is ready/);
  assert.equal(
    (await readFile(join(fixture.logRoot, 'pg_ctl'), 'utf8')).trim(),
    'start',
  );
  assert.ok((await lstat(join(fixture.logRoot, 'initdb'))).isFile());
});

test('resumes application provisioning on an owned server after interruption', async (t) => {
  const fixture = await establishRunningFixture(t);
  const mutationsBefore = await readFile(
    join(fixture.logRoot, 'mutations'),
    'utf8',
  );
  await Promise.all([
    rm(join(fixture.stateRoot, 'role.exists'), { force: true }),
    rm(join(fixture.stateRoot, 'role.configured'), { force: true }),
    rm(join(fixture.stateRoot, 'database.prisma_prim_dev'), { force: true }),
    rm(join(fixture.stateRoot, 'database.prisma_prim_test'), { force: true }),
  ]);

  const resumed = runScript({ env: fixture.env });
  assertSuccess(resumed);
  const resumedMutations = (
    await readFile(join(fixture.logRoot, 'mutations'), 'utf8')
  ).slice(mutationsBefore.length);
  assert.match(
    resumedMutations,
    /create-role[\s\S]*createdb-prisma_prim_dev[\s\S]*createdb-prisma_prim_test/,
  );
  assert.equal(
    (await readFile(join(fixture.logRoot, 'pg_ctl'), 'utf8')).trim(),
    'start',
  );
});

test('recovers after an atomic role commit interrupted before database creation', async (t) => {
  const fixture = await createFixture(t);
  const interrupted = runScript({
    env: { ...fixture.env, FAKE_SIGNAL_AFTER_CREATE_ROLE: 'true' },
  });
  assert.equal(interrupted.signal, null);
  assert.equal(interrupted.status, 143, interrupted.stderr);
  assert.doesNotMatch(interrupted.stdout, /Local PostgreSQL .* is ready/);
  assert.ok((await lstat(join(fixture.stateRoot, 'role.exists'))).isFile());
  assert.ok((await lstat(join(fixture.stateRoot, 'role.configured'))).isFile());
  await assertAbsent(join(fixture.stateRoot, 'database.prisma_prim_dev'));
  await assertAbsent(join(fixture.stateRoot, 'database.prisma_prim_test'));

  assertSuccess(runScript({ env: fixture.env }));
  const mutations = await readFile(join(fixture.logRoot, 'mutations'), 'utf8');
  assert.equal((mutations.match(/^create-role$/gm) ?? []).length, 1);
  assert.match(
    mutations,
    /create-role[\s\S]*createdb-prisma_prim_dev[\s\S]*createdb-prisma_prim_test/,
  );
});

test('creates only a database proven absent from an otherwise valid catalog', async (t) => {
  const fixture = await establishRunningFixture(t);
  const mutationsBefore = await readFile(
    join(fixture.logRoot, 'mutations'),
    'utf8',
  );
  await rm(join(fixture.stateRoot, 'database.prisma_prim_test'));

  assertSuccess(runScript({ env: fixture.env }));
  const resumedMutations = (
    await readFile(join(fixture.logRoot, 'mutations'), 'utf8')
  ).slice(mutationsBefore.length);
  assert.equal(resumedMutations, 'createdb-prisma_prim_test\n');
});

test('rejects existing databases without the required role before mutation', async (t) => {
  const fixture = await establishRunningFixture(t);
  const mutationsBefore = await readFile(
    join(fixture.logRoot, 'mutations'),
    'utf8',
  );
  await Promise.all([
    rm(join(fixture.stateRoot, 'role.exists')),
    rm(join(fixture.stateRoot, 'role.configured')),
  ]);

  const result = runScript({ env: fixture.env });
  assertOrdinaryFailure(result, /exists without the required application role/);
  assert.equal(
    await readFile(join(fixture.logRoot, 'mutations'), 'utf8'),
    mutationsBefore,
  );
});

for (const binary of requiredBinaries) {
  test(`rejects an unsupported ${binary} before service mutation`, async (t) => {
    const fixture = await createFixture(t);
    const result = runScript({
      env: { ...fixture.env, FAKE_WRONG_BINARY: binary },
    });
    assertOrdinaryFailure(result, /verified PostgreSQL 17\.11 cache is absent/);
    assert.ok((await lstat(fixture.runtimeRoot)).isDirectory());
    await assert.rejects(lstat(join(fixture.logRoot, 'initdb')));
    await assert.rejects(lstat(fixture.dataRoot));
  });
}

for (const binary of requiredBinaries) {
  test(`rejects a missing ${binary} without probing any cache executable`, async (t) => {
    const fixture = await createFixture(t);
    await rm(join(fixture.installRoot, 'bin', binary));
    const result = runScript({ env: fixture.env });
    assertOrdinaryFailure(result, /verified PostgreSQL 17\.11 cache is absent/);
    assert.doesNotMatch(
      await readOptional(join(fixture.logRoot, 'operations')),
      /version\|/,
    );
    await assertAbsent(join(fixture.logRoot, 'initdb'));
  });
}

for (const [name, mutate] of [
  [
    'missing postgres.bki',
    (fixture) => rm(join(fixture.installRoot, 'share', 'postgres.bki')),
  ],
  [
    'corrupted postgresql.conf.sample',
    (fixture) =>
      writeFile(
        join(fixture.installRoot, 'share', 'postgresql.conf.sample'),
        'substituted configuration\n',
        { mode: 0o644 },
      ),
  ],
]) {
  test(`rejects a ${name} cache payload before service mutation`, async (t) => {
    const fixture = await createFixture(t);
    await mutate(fixture);
    const result = runScript({ env: fixture.env });
    assertOrdinaryFailure(result, /verified PostgreSQL 17\.11 cache is absent/);
    assert.doesNotMatch(
      await readOptional(join(fixture.logRoot, 'operations')),
      /version\|/,
    );
    await assertAbsent(join(fixture.logRoot, 'initdb'));
  });
}

for (const [name, mutate] of [
  [
    'service-unreadable library',
    (fixture) =>
      writeFile(join(fixture.installRoot, 'lib', 'libpq.so.5'), 'library\n', {
        mode: 0o600,
      }),
  ],
  [
    'service-untraversable share directory',
    async (fixture) => {
      const directory = join(fixture.installRoot, 'share', 'timezone');
      await mkdir(directory, { mode: 0o700 });
      await writeFile(join(directory, 'UTC'), 'timezone\n', { mode: 0o644 });
    },
  ],
]) {
  test(`rejects a ${name} even when its content manifest matches`, async (t) => {
    const fixture = await createFixture(t, {
      callerUid: '0',
      callerGid: '0',
      postgresUid: '71',
      postgresGid: '72',
      postgresGroups: '72',
    });
    await mutate(fixture);
    await writeFixtureInstallManifest(fixture.installRoot);

    const result = runScript({ env: fixture.env });

    assertOrdinaryFailure(result, /verified PostgreSQL 17\.11 cache is absent/);
    assert.doesNotMatch(
      await readOptional(join(fixture.logRoot, 'operations')),
      /version\|/,
    );
    await assertAbsent(join(fixture.logRoot, 'initdb'));
  });
}

test('does not execute cache binaries before exact marker validation', async (t) => {
  const fixture = await createFixture(t);
  await writeFile(
    join(fixture.installRoot, '.prisma-prim-install-v1'),
    'foreign install marker\n',
    { mode: 0o600 },
  );
  const result = runScript({ env: fixture.env });
  assertOrdinaryFailure(result, /verified PostgreSQL 17\.11 cache is absent/);
  assert.doesNotMatch(
    await readOptional(join(fixture.logRoot, 'operations')),
    /version\|/,
  );
});

test('rejects a FIFO marker without blocking or probing cache executables', async (t) => {
  const fixture = await createFixture(t);
  const marker = join(fixture.installRoot, '.prisma-prim-install-v1');
  const probeEntered = join(fixture.logRoot, 'fifo-marker-probe-entered');
  await rm(marker);
  const mkfifo = spawnSync('/usr/bin/mkfifo', [marker], { encoding: 'utf8' });
  assert.equal(mkfifo.status, 0, mkfifo.stderr);
  await chmod(marker, 0o600);
  const child = spawn('bash', [scriptPath], {
    detached: true,
    env: cleanEnvironment({
      ...fixture.env,
      FAKE_STAT_PROBE_PATH: marker,
      FAKE_STAT_PROBE_ENTERED: probeEntered,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => terminateProcessGroup(child));
  const resultPromise = collect(child);
  await waitFor(probeEntered);
  const result = await settleAfterCoordination(
    resultPromise,
    'for FIFO marker rejection after its metadata probe began',
  );
  assertOrdinaryFailure(result, /verified PostgreSQL 17\.11 cache is absent/);
  assert.doesNotMatch(
    await readOptional(join(fixture.logRoot, 'operations')),
    /version\|/,
  );
});

test('rejects a marker swapped to a symlink during no-follow read', async (t) => {
  const fixture = await createFixture(t);
  const marker = join(fixture.installRoot, '.prisma-prim-install-v1');
  const target = join(fixture.logRoot, 'read-swap-target');
  await writeFile(target, 'unchanged\n', { mode: 0o600 });
  const before = await lstat(target);
  const result = runScript({
    env: {
      ...fixture.env,
      FAKE_SWAP_READ_PATH: marker,
      FAKE_SWAP_READ_TARGET: target,
    },
  });
  assertOrdinaryFailure(result, /verified PostgreSQL 17\.11 cache is absent/);
  const after = await lstat(target);
  assert.equal(await readFile(target, 'utf8'), 'unchanged\n');
  assert.equal(after.mode, before.mode);
  assert.equal(after.uid, before.uid);
  assert.equal(after.gid, before.gid);
  assert.ok((await lstat(marker)).isSymbolicLink());
  assert.doesNotMatch(
    await readOptional(join(fixture.logRoot, 'operations')),
    /version\|/,
  );
});

for (const [name, mutate] of [
  [
    'group-writable executable',
    (fixture) => chmod(join(fixture.installRoot, 'bin', 'postgres'), 0o775),
  ],
  [
    'symlinked executable',
    async (fixture) => {
      const binary = join(fixture.installRoot, 'bin', 'postgres');
      await rm(binary);
      await symlink(join(fixture.toolRoot, 'postgres-template'), binary);
    },
  ],
  [
    'set-user-ID executable',
    (fixture) => chmod(join(fixture.installRoot, 'bin', 'postgres'), 0o4755),
  ],
  [
    'group-writable library',
    async (fixture) => {
      const library = join(fixture.installRoot, 'lib', 'libpq.so');
      await writeFile(library, 'untrusted library', { mode: 0o600 });
      await chmod(library, 0o666);
    },
  ],
  [
    'out-of-tree library symlink',
    async (fixture) => {
      const target = join(fixture.logRoot, 'foreign-libpq.so');
      await writeFile(target, 'foreign library', { mode: 0o600 });
      await symlink(target, join(fixture.installRoot, 'lib', 'libpq.so'));
    },
  ],
  ['wrong install-root mode', (fixture) => chmod(fixture.installRoot, 0o777)],
]) {
  test(`rejects a ${name} before service mutation`, async (t) => {
    const fixture = await createFixture(t);
    await mutate(fixture);
    const result = runScript({ env: fixture.env });
    assertOrdinaryFailure(result, /verified PostgreSQL 17\.11 cache is absent/);
    assert.doesNotMatch(
      await readOptional(join(fixture.logRoot, 'operations')),
      /version\|/,
    );
    await assertAbsent(join(fixture.logRoot, 'initdb'));
  });
}

test('rejects foreign cache ownership and a timed-out version probe', async (t) => {
  const foreign = await createFixture(t);
  const foreignResult = runScript({
    env: { ...foreign.env, FAKE_FOREIGN_PATH: foreign.installRoot },
  });
  assertOrdinaryFailure(
    foreignResult,
    /verified PostgreSQL 17\.11 cache is absent/,
  );
  assert.doesNotMatch(
    await readOptional(join(foreign.logRoot, 'operations')),
    /version\|/,
  );

  const timeoutFixture = await createFixture(t);
  const timeoutResult = runScript({
    env: { ...timeoutFixture.env, FAKE_TIMEOUT_BINARY: 'psql' },
  });
  assertOrdinaryFailure(
    timeoutResult,
    /verified PostgreSQL 17\.11 cache is absent/,
  );
  await assertAbsent(join(timeoutFixture.logRoot, 'initdb'));
});

for (const [version, succeeds] of [
  ['17.11', true],
  ['17.12', false],
  ['17.10', false],
  ['17.18446744073709551627', false],
  ['18.0', false],
]) {
  test(`${succeeds ? 'accepts' : 'rejects'} reported PostgreSQL ${version} cache tools`, async (t) => {
    const fixture = await createFixture(t);
    const result = runScript({
      env: { ...fixture.env, FAKE_BINARY_VERSION: version },
    });
    if (succeeds) assertSuccess(result);
    else
      assertOrdinaryFailure(
        result,
        /verified PostgreSQL 17\.11 cache is absent/,
      );
  });
}

test('rejects malformed version output even when it contains 17.11', async (t) => {
  const fixture = await createFixture(t);
  const result = runScript({
    env: { ...fixture.env, FAKE_MALFORMED_VERSION_BINARY: 'postgres' },
  });
  assertOrdinaryFailure(result, /verified PostgreSQL 17\.11 cache is absent/);
});

test('builds the exact pinned source through checksum, configure, make, DESTDIR, and publication', async (t) => {
  const fixture = await createFixture(t, { withCache: false });
  const startOnly = runScript({ env: fixture.env });
  assertOrdinaryFailure(startOnly, /rerun with --install/);
  assert.doesNotMatch(
    await readOptional(join(fixture.logRoot, 'operations')),
    /curl\|/,
  );

  const installed = runScript({ args: ['--install'], env: fixture.env });
  assertSuccess(installed);
  const operations = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );
  assert.match(operations, /cc\|.*-lreadline -lz/);
  assert.match(operations, new RegExp(`curl\\|.*${sourceCommit}\\.tar\\.gz`));
  assert.match(operations, /checksum\|ok[\s\S]*tar\|/);
  assert.match(
    operations,
    /configure\|--prefix=.* --with-readline --with-zlib/,
  );
  assert.match(operations, /make\|-j2/);
  assert.match(operations, /make\|DESTDIR=.* install/);
  assert.doesNotMatch(operations, /forbidden\|(sudo|apt-get)/);
  assert.ok(
    (
      await lstat(join(fixture.installRoot, '.prisma-prim-install-v1'))
    ).isFile(),
  );
});

test('fails closed before extraction when the pinned source checksum is wrong', async (t) => {
  const fixture = await createFixture(t, { withCache: false });
  const result = runScript({
    args: ['--install'],
    env: { ...fixture.env, FAKE_BAD_CHECKSUM: 'true' },
  });
  assertOrdinaryFailure(result, /source checksum does not match/);
  const operations = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );
  assert.match(operations, /curl\|/);
  assert.doesNotMatch(operations, /tar\||configure\||make\|/);
  await assertAbsent(fixture.installRoot);
});

test('enforces the bounded archive size before checksum or extraction', async (t) => {
  const fixture = await createFixture(t, { withCache: false });
  const result = runScript({
    args: ['--install'],
    env: { ...fixture.env, FAKE_OVERSIZED_DOWNLOAD: 'true' },
  });
  assertOrdinaryFailure(result);
  const operations = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );
  assert.match(operations, /curl-oversized\|67108864/);
  assert.doesNotMatch(operations, /checksum\||tar\||configure\||make\|/);
  await assertAbsent(fixture.installRoot);
});

for (const [failure, env, expectedBefore, forbiddenAfter] of [
  ['download', { FAKE_CURL_FAIL: 'true' }, /cc\|/, /checksum\||tar\||make\|/],
  [
    'extraction',
    { FAKE_TAR_FAIL: 'true' },
    /checksum\|ok/,
    /configure\||make\|/,
  ],
  ['configure', { FAKE_CONFIGURE_FAIL: 'true' }, /configure\|/, /make\|/],
  ['make', { FAKE_MAKE_FAIL: 'true' }, /configure\|/, /make\|DESTDIR=/],
]) {
  test(`preserves fail-closed boundaries on source ${failure} failure`, async (t) => {
    const fixture = await createFixture(t, { withCache: false });
    const result = runScript({
      args: ['--install'],
      env: { ...fixture.env, ...env },
    });
    assertOrdinaryFailure(result);
    const operations = await readOptional(join(fixture.logRoot, 'operations'));
    assert.match(operations, expectedBefore);
    assert.doesNotMatch(operations, forbiddenAfter);
    await assertAbsent(fixture.installRoot);
  });
}

for (const [signalName, status] of [
  ['HUP', 129],
  ['INT', 130],
  ['TERM', 143],
]) {
  test(`restores the prior marked cache when ${signalName} interrupts repair publication`, async (t) => {
    const fixture = await createFixture(t);
    const oldPostgres = join(fixture.installRoot, 'bin', 'postgres');
    await executable(
      oldPostgres,
      '#!/bin/bash\necho "postgres (PostgreSQL) 16.9"\n',
    );
    const result = runScript({
      args: ['--install'],
      env: {
        ...fixture.env,
        FAKE_SIGNAL_NAME: signalName,
        FAKE_SIGNAL_ON_BACKUP: 'true',
      },
    });
    assert.equal(result.signal, null);
    assert.equal(result.status, status, result.stderr);
    assert.doesNotMatch(result.stdout, /Local PostgreSQL .* is ready/);
    const probe = spawnSync(oldPostgres, ['--version'], { encoding: 'utf8' });
    assert.equal(probe.status, 0);
    assert.match(probe.stdout, /16\.9/);
    assert.ok(
      (
        await lstat(join(fixture.installRoot, '.prisma-prim-install-v1'))
      ).isFile(),
    );
  });
}

test('recovers a verified replacement after SIGKILL creates a publication gap', async (t) => {
  const fixture = await createFixture(t);
  await executable(
    join(fixture.installRoot, 'bin', 'postgres'),
    '#!/bin/bash\necho "postgres (PostgreSQL) 16.9"\n',
  );

  const interrupted = runScript({
    args: ['--install'],
    env: {
      ...fixture.env,
      FAKE_SIGNAL_NAME: 'KILL',
      FAKE_SIGNAL_ON_BACKUP: 'true',
    },
  });

  assert.equal(interrupted.status, null, interrupted.stderr);
  assert.equal(interrupted.signal, 'SIGKILL', interrupted.stderr);
  await assertAbsent(fixture.installRoot);
  assert.ok(
    (
      await lstat(
        join(fixture.cacheRoot, '.prisma-prim-install-publication-intent-v1'),
      )
    ).isFile(),
  );
  const operationsBefore = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );

  assertSuccess(runScript({ env: fixture.env }));
  const operationsAfter = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );
  assert.equal(
    (operationsAfter.match(/^make\|/gm) ?? []).length,
    (operationsBefore.match(/^make\|/gm) ?? []).length,
  );
  const current = spawnSync(
    join(fixture.installRoot, 'bin', 'postgres'),
    ['--version'],
    { encoding: 'utf8', env: cleanEnvironment(fixture.env) },
  );
  assert.match(current.stdout, /17\.11/);
  await assertAbsent(
    join(fixture.cacheRoot, '.prisma-prim-install-publication-intent-v1'),
  );
});

test('recovers after SIGKILL immediately moves the staged install', async (t) => {
  const fixture = await createFixture(t);
  await executable(
    join(fixture.installRoot, 'bin', 'postgres'),
    '#!/bin/bash\necho "postgres (PostgreSQL) 16.9"\n',
  );

  const interrupted = runScript({
    args: ['--install'],
    env: {
      ...fixture.env,
      FAKE_SIGNAL_NAME: 'KILL',
      FAKE_SIGNAL_ON_NEW_INSTALL: 'true',
    },
  });

  assert.equal(interrupted.status, null, interrupted.stderr);
  assert.equal(interrupted.signal, 'SIGKILL', interrupted.stderr);
  assert.ok(
    (
      await lstat(
        join(fixture.cacheRoot, '.prisma-prim-install-publication-intent-v1'),
      )
    ).isFile(),
  );
  const operationsBefore = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );

  assertSuccess(runScript({ env: fixture.env }));
  const operationsAfter = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );
  assert.equal(
    (operationsAfter.match(/^make\|/gm) ?? []).length,
    (operationsBefore.match(/^make\|/gm) ?? []).length,
  );
  const current = spawnSync(
    join(fixture.installRoot, 'bin', 'postgres'),
    ['--version'],
    { encoding: 'utf8', env: cleanEnvironment(fixture.env) },
  );
  assert.match(current.stdout, /17\.11/);
  await assertAbsent(
    join(fixture.cacheRoot, '.prisma-prim-install-publication-intent-v1'),
  );
});

test('retains fresh recovery state when TERM interrupts publication', async (t) => {
  const fixture = await createFixture(t, { withCache: false });

  const interrupted = runScript({
    args: ['--install'],
    env: {
      ...fixture.env,
      FAKE_SIGNAL_NAME: 'TERM',
      FAKE_SIGNAL_ON_NEW_INSTALL: 'true',
    },
  });

  assert.equal(interrupted.signal, null);
  assert.equal(interrupted.status, 143, interrupted.stderr);
  assert.ok(
    (
      await lstat(
        join(fixture.cacheRoot, '.prisma-prim-install-publication-intent-v1'),
      )
    ).isFile(),
  );
  assert.equal(
    (await readdir(fixture.cacheRoot)).filter((name) =>
      name.startsWith('.build-'),
    ).length,
    1,
  );
  const operationsBefore = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );

  assertSuccess(runScript({ env: fixture.env }));
  const operationsAfter = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );
  assert.equal(
    (operationsAfter.match(/^make\|/gm) ?? []).length,
    (operationsBefore.match(/^make\|/gm) ?? []).length,
  );
  await assertAbsent(
    join(fixture.cacheRoot, '.prisma-prim-install-publication-intent-v1'),
  );
  assert.equal(
    (await readdir(fixture.cacheRoot)).filter((name) =>
      name.startsWith('.build-'),
    ).length,
    0,
  );
});

test('retains the marked build when intent validation fails before in-memory activation', async (t) => {
  const fixture = await createFixture(t, { withCache: false });
  const intent = join(
    fixture.cacheRoot,
    '.prisma-prim-install-publication-intent-v1',
  );
  const interrupted = runScript({
    args: ['--install'],
    env: {
      ...fixture.env,
      FAKE_FAIL_INSTALL_INTENT_VALIDATION_ONCE: 'true',
    },
  });

  assertOrdinaryFailure(interrupted, /intent changed during creation/);
  assert.ok((await lstat(intent)).isFile());
  assert.equal(
    (await readdir(fixture.cacheRoot)).filter((name) =>
      name.startsWith('.build-'),
    ).length,
    1,
  );
  const operationsBefore = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );

  assertSuccess(runScript({ env: fixture.env }));
  const operationsAfter = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );
  assert.equal(
    (operationsAfter.match(/^make\|/gm) ?? []).length,
    (operationsBefore.match(/^make\|/gm) ?? []).length,
  );
  await assertAbsent(intent);
});

test('retains a fresh staged build when TERM arrives before intent activation', async (t) => {
  const fixture = await createFixture(t, { withCache: false });
  const intent = join(
    fixture.cacheRoot,
    '.prisma-prim-install-publication-intent-v1',
  );
  const entered = join(fixture.logRoot, 'intent-stat-entered');
  const release = join(fixture.logRoot, 'intent-stat-release');
  const child = spawn('bash', [scriptPath, '--install'], {
    detached: true,
    env: cleanEnvironment({
      ...fixture.env,
      FAKE_STAT_PAUSE_PATH: intent,
      FAKE_STAT_PAUSE_ENTERED: entered,
      FAKE_STAT_PAUSE_RELEASE: release,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    await writeFile(release, '').catch(() => {});
    await terminateProcessGroup(child);
  });
  const resultPromise = collect(child);
  await waitFor(entered, 60_000);
  process.kill(-child.pid, 'SIGTERM');
  const interrupted = await resultPromise;

  assert.equal(interrupted.signal, null, interrupted.stderr);
  assert.equal(interrupted.status, 143, interrupted.stderr);
  assert.ok((await lstat(intent)).isFile());
  assert.equal(
    (await readdir(fixture.cacheRoot)).filter((name) =>
      name.startsWith('.build-'),
    ).length,
    1,
  );
  const operationsBefore = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );

  assertSuccess(runScript({ env: fixture.env }));
  const operationsAfter = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );
  assert.equal(
    (operationsAfter.match(/^make\|/gm) ?? []).length,
    (operationsBefore.match(/^make\|/gm) ?? []).length,
  );
  await assertAbsent(intent);
});

test('retains a fresh staged build when TERM interrupts recovery', async (t) => {
  const fixture = await createFixture(t, { withCache: false });
  const intent = join(
    fixture.cacheRoot,
    '.prisma-prim-install-publication-intent-v1',
  );
  const first = runScript({
    args: ['--install'],
    env: {
      ...fixture.env,
      FAKE_SIGNAL_NAME: 'KILL',
      FAKE_SIGNAL_ON_NEW_INSTALL: 'true',
    },
  });
  assert.equal(first.status, null, first.stderr);
  assert.equal(first.signal, 'SIGKILL', first.stderr);
  const operationsBefore = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );

  const second = runScript({
    env: {
      ...fixture.env,
      FAKE_SIGNAL_NAME: 'TERM',
      FAKE_SIGNAL_ON_DESTINATION: fixture.installRoot,
    },
  });
  assert.equal(second.signal, null, second.stderr);
  assert.equal(second.status, 143, second.stderr);
  assert.ok((await lstat(intent)).isFile());
  assert.equal(
    (await readdir(fixture.cacheRoot)).filter((name) =>
      name.startsWith('.build-'),
    ).length,
    1,
  );

  assertSuccess(runScript({ env: fixture.env }));
  const operationsAfter = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );
  assert.equal(
    (operationsAfter.match(/^make\|/gm) ?? []).length,
    (operationsBefore.match(/^make\|/gm) ?? []).length,
  );
  await assertAbsent(intent);
  assert.equal(
    (await readdir(fixture.cacheRoot)).filter((name) =>
      name.startsWith('.build-'),
    ).length,
    0,
  );
});

test('restores the prior cache when interrupted after publishing the replacement', async (t) => {
  const fixture = await createFixture(t);
  const oldPostgres = join(fixture.installRoot, 'bin', 'postgres');
  await executable(
    oldPostgres,
    '#!/bin/bash\necho "postgres (PostgreSQL) 16.9"\n',
  );
  const result = runScript({
    args: ['--install'],
    env: {
      ...fixture.env,
      FAKE_SIGNAL_ON_DESTINATION: fixture.installRoot,
    },
  });
  assert.equal(result.signal, null);
  assert.equal(result.status, 143, result.stderr);
  const probe = spawnSync(oldPostgres, ['--version'], { encoding: 'utf8' });
  assert.equal(probe.status, 0);
  assert.match(probe.stdout, /16\.9/);
});

for (const [recoveryState, interruption] of [
  ['publication gap', { FAKE_SIGNAL_ON_BACKUP: 'true' }],
  ['published replacement', { FAKE_SIGNAL_ON_DESTINATION: '__INSTALL_ROOT__' }],
]) {
  test(`restores the prior cache when TERM follows intent removal from a ${recoveryState}`, async (t) => {
    const fixture = await createFixture(t);
    const oldPostgres = join(fixture.installRoot, 'bin', 'postgres');
    await executable(
      oldPostgres,
      '#!/bin/bash\necho "postgres (PostgreSQL) 16.9"\n',
    );
    const initialInterruption = runScript({
      args: ['--install'],
      env: {
        ...fixture.env,
        FAKE_SIGNAL_NAME: 'KILL',
        ...Object.fromEntries(
          Object.entries(interruption).map(([name, value]) => [
            name,
            value === '__INSTALL_ROOT__' ? fixture.installRoot : value,
          ]),
        ),
      },
    });
    assert.equal(initialInterruption.status, null, initialInterruption.stderr);
    assert.equal(
      initialInterruption.signal,
      'SIGKILL',
      initialInterruption.stderr,
    );

    const recovery = runScript({
      env: {
        ...fixture.env,
        FAKE_SIGNAL_NAME: 'TERM',
        FAKE_SIGNAL_AFTER_RM_BASENAME:
          '.prisma-prim-install-publication-intent-v1',
      },
    });
    assert.equal(recovery.signal, null, recovery.stderr);
    assert.equal(recovery.status, 143, recovery.stderr);
    const probe = spawnSync(oldPostgres, ['--version'], {
      encoding: 'utf8',
      env: cleanEnvironment(fixture.env),
    });
    assert.equal(probe.status, 0, probe.stderr);
    assert.match(probe.stdout, /16\.9/);
    await assertAbsent(
      join(fixture.cacheRoot, '.prisma-prim-install-publication-intent-v1'),
    );
  });
}

for (const collisionPhase of ['new', 'backup', 'final', 'failed']) {
  test(`never overwrites or adopts a foreign ${collisionPhase} publication destination`, async (t) => {
    const fixture = await createFixture(t);
    await executable(
      join(fixture.installRoot, 'bin', 'postgres'),
      '#!/bin/bash\necho "postgres (PostgreSQL) 16.9"\n',
    );

    const collisionTarget = join(
      fixture.logRoot,
      `foreign-${collisionPhase}-install`,
    );
    const directoryCollision = collisionPhase === 'final';
    if (directoryCollision) {
      await createValidForeignInstall(collisionTarget, fixture);
    } else {
      await mkdir(collisionTarget, { mode: 0o700 });
    }
    const sentinel = join(collisionTarget, 'sentinel');
    await writeFile(sentinel, 'unchanged', { mode: 0o600 });
    const before = await lstat(collisionTarget);

    const result = runScript({
      args: ['--install'],
      env: {
        ...fixture.env,
        FAKE_COLLIDE_MOVE_PHASE: collisionPhase,
        FAKE_MOVE_COLLISION_KIND: directoryCollision ? 'directory' : 'symlink',
        FAKE_MOVE_COLLISION_TARGET: collisionTarget,
        ...(collisionPhase === 'failed' ? { FAKE_INITDB_FAIL: 'true' } : {}),
      },
    });
    assertOrdinaryFailure(result);

    const collisionPath = (
      await readFile(
        join(fixture.logRoot, `move-collision-${collisionPhase}`),
        'utf8',
      )
    ).trim();
    const foreignPath = directoryCollision ? collisionPath : collisionTarget;
    const after = await lstat(foreignPath);
    assert.equal(
      await readFile(join(foreignPath, 'sentinel'), 'utf8'),
      'unchanged',
    );
    assert.equal(after.ino, before.ino);
    assert.equal(after.mode, before.mode);
    assert.equal(after.uid, before.uid);
    assert.equal(after.gid, before.gid);
    if (!directoryCollision) {
      assert.ok((await lstat(collisionPath)).isSymbolicLink());
    }

    const entries = await readdir(fixture.cacheRoot);
    const backups = entries.filter((name) =>
      name.startsWith('.install-backup-'),
    );
    if (collisionPhase === 'new' || collisionPhase === 'backup') {
      const prior = spawnSync(
        join(fixture.installRoot, 'bin', 'postgres'),
        ['--version'],
        { encoding: 'utf8' },
      );
      assert.match(prior.stdout, /16\.9/);
    } else {
      assert.equal(backups.length, 1);
      const prior = spawnSync(
        join(fixture.cacheRoot, backups[0], 'bin', 'postgres'),
        ['--version'],
        { encoding: 'utf8' },
      );
      assert.match(prior.stdout, /16\.9/);
    }

    if (collisionPhase === 'final') {
      const replacements = entries.filter((name) =>
        name.startsWith('.install-new-'),
      );
      assert.equal(replacements.length, 1);
      const replacement = spawnSync(
        join(fixture.cacheRoot, replacements[0], 'bin', 'postgres'),
        ['--version'],
        { encoding: 'utf8', env: cleanEnvironment(fixture.env) },
      );
      assert.match(replacement.stdout, /17\.11/);
    }
    if (collisionPhase === 'failed') {
      const replacement = spawnSync(
        join(fixture.installRoot, 'bin', 'postgres'),
        ['--version'],
        { encoding: 'utf8', env: cleanEnvironment(fixture.env) },
      );
      assert.match(replacement.stdout, /17\.11/);
    }
  });
}

test('restores the prior cache when the repaired install later fails initdb', async (t) => {
  const fixture = await createFixture(t);
  const oldPostgres = join(fixture.installRoot, 'bin', 'postgres');
  await executable(
    oldPostgres,
    '#!/bin/bash\necho "postgres (PostgreSQL) 16.9"\n',
  );
  const result = runScript({
    args: ['--install'],
    env: { ...fixture.env, FAKE_INITDB_FAIL: 'true' },
  });
  assertOrdinaryFailure(result);
  const probe = spawnSync(oldPostgres, ['--version'], { encoding: 'utf8' });
  assert.equal(probe.status, 0);
  assert.match(probe.stdout, /16\.9/);
  assert.match(
    await readFile(join(fixture.logRoot, 'initdb'), 'utf8'),
    /initdb/,
  );
});

test('restores the prior cache when TERM arrives during post-repair initdb', async (t) => {
  const fixture = await createFixture(t);
  const oldPostgres = join(fixture.installRoot, 'bin', 'postgres');
  await executable(
    oldPostgres,
    '#!/bin/bash\necho "postgres (PostgreSQL) 16.9"\n',
  );
  const result = runScript({
    args: ['--install'],
    env: { ...fixture.env, FAKE_SIGNAL_DURING_INITDB: 'true' },
  });
  assert.equal(result.signal, null);
  assert.equal(result.status, 143, result.stderr);
  assert.doesNotMatch(result.stdout, /Local PostgreSQL .* is ready/);
  const probe = spawnSync(oldPostgres, ['--version'], { encoding: 'utf8' });
  assert.equal(probe.status, 0);
  assert.match(probe.stdout, /16\.9/);
});

test('retains the prior owned cache after a successful repair commit', async (t) => {
  const fixture = await createFixture(t);
  await executable(
    join(fixture.installRoot, 'bin', 'postgres'),
    '#!/bin/bash\necho "postgres (PostgreSQL) 16.9"\n',
  );
  assertSuccess(runScript({ args: ['--install'], env: fixture.env }));
  const backups = (await readdir(fixture.cacheRoot)).filter((name) =>
    name.startsWith('.install-backup-'),
  );
  assert.equal(backups.length, 1);
  const current = spawnSync(
    join(fixture.installRoot, 'bin', 'postgres'),
    ['--version'],
    { encoding: 'utf8', env: cleanEnvironment(fixture.env) },
  );
  const prior = spawnSync(
    join(fixture.cacheRoot, backups[0], 'bin', 'postgres'),
    ['--version'],
    { encoding: 'utf8' },
  );
  assert.match(current.stdout, /17\.11/);
  assert.match(prior.stdout, /16\.9/);
});

test('makes the final ready commit non-interruptible while retaining the prior cache', async (t) => {
  const fixture = await createFixture(t);
  await executable(
    join(fixture.installRoot, 'bin', 'postgres'),
    '#!/bin/bash\necho "postgres (PostgreSQL) 16.9"\n',
  );
  const coordination = await mkdtemp(
    join(tmpdir(), 'prisma-prim-final-commit-test-'),
  );
  const entered = join(coordination, 'cleanup.entered');
  const release = join(coordination, 'cleanup.release');
  t.after(() => rm(coordination, { recursive: true, force: true }));
  let child;
  t.after(async () => {
    try {
      await writeFile(release, '');
    } catch {
      // Process-group termination below is the fallback if teardown ran first.
    }
    await terminateProcessGroup(child);
  });
  child = spawn('bash', [scriptPath, '--install'], {
    detached: true,
    env: cleanEnvironment({
      ...fixture.env,
      FAKE_FINAL_CLEANUP_ENTERED: entered,
      FAKE_FINAL_CLEANUP_RELEASE: release,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const resultPromise = collect(child);
  await waitFor(entered, 60_000);
  assert.equal(child.kill('SIGTERM'), true);
  await writeFile(release, '');
  assertSuccess(await resultPromise);
  assert.ok((await lstat(join(fixture.stateRoot, 'server.started'))).isFile());
  const backups = (await readdir(fixture.cacheRoot)).filter((name) =>
    name.startsWith('.install-backup-'),
  );
  assert.equal(backups.length, 1);
});

test('does not restore over a replacement server that cleanup cannot stop', async (t) => {
  const fixture = await createFixture(t);
  await executable(
    join(fixture.installRoot, 'bin', 'postgres'),
    '#!/bin/bash\necho "postgres (PostgreSQL) 16.9"\n',
  );
  const result = runScript({
    args: ['--install'],
    env: {
      ...fixture.env,
      FAKE_FAIL_OPERATION: 'psql',
      FAKE_STOP_FAIL: 'true',
    },
  });
  assertOrdinaryFailure(result, /replacement server is still live/);
  assert.ok((await lstat(join(fixture.stateRoot, 'server.started'))).isFile());
  const backups = (await readdir(fixture.cacheRoot)).filter((name) =>
    name.startsWith('.install-backup-'),
  );
  assert.equal(backups.length, 1);
  const current = spawnSync(
    join(fixture.installRoot, 'bin', 'postgres'),
    ['--version'],
    { encoding: 'utf8', env: cleanEnvironment(fixture.env) },
  );
  const prior = spawnSync(
    join(fixture.cacheRoot, backups[0], 'bin', 'postgres'),
    ['--version'],
    { encoding: 'utf8' },
  );
  assert.match(current.stdout, /17\.11/);
  assert.match(prior.stdout, /16\.9/);
});

test('requires a successful stop before rollback even when all probes are closed', async (t) => {
  const fixture = await createFixture(t);
  await executable(
    join(fixture.installRoot, 'bin', 'postgres'),
    '#!/bin/bash\necho "postgres (PostgreSQL) 16.9"\n',
  );
  const result = runScript({
    args: ['--install'],
    env: {
      ...fixture.env,
      FAKE_FAIL_OPERATION: 'psql',
      FAKE_FORCE_PROBES_CLOSED: 'true',
      FAKE_STOP_FAIL: 'true',
    },
  });
  assertOrdinaryFailure(result, /could not be confirmed stopped/);
  assert.ok((await lstat(join(fixture.stateRoot, 'server.started'))).isFile());
  const backups = (await readdir(fixture.cacheRoot)).filter((name) =>
    name.startsWith('.install-backup-'),
  );
  assert.equal(backups.length, 1);
  const current = spawnSync(
    join(fixture.installRoot, 'bin', 'postgres'),
    ['--version'],
    { encoding: 'utf8', env: cleanEnvironment(fixture.env) },
  );
  const prior = spawnSync(
    join(fixture.cacheRoot, backups[0], 'bin', 'postgres'),
    ['--version'],
    { encoding: 'utf8' },
  );
  assert.match(current.stdout, /17\.11/);
  assert.match(prior.stdout, /16\.9/);
});

test('keeps root lifecycle mutations behind exact postgres runuser and install boundaries', async (t) => {
  const fixture = await createFixture(t, {
    callerUid: '0',
    callerGid: '0',
    postgresUid: '71',
    postgresGid: '72',
    postgresGroups: '72 73',
  });
  assertSuccess(runScript({ env: fixture.env }));
  const operations = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );
  assert.match(
    operations,
    /install\|700\|postgres\|postgres\|.*\.socket-owner-incomplete\/directory/,
  );
  assert.match(
    operations,
    /install\|700\|postgres\|postgres\|.*\.data-owner-incomplete\/directory/,
  );
  assert.match(operations, /runuser\|-u postgres -- .*initdb/);
  assert.match(operations, /runuser\|-u postgres -- .*pg_ctl/);
  assert.doesNotMatch(operations, /forbidden\|(sudo|apt-get)/);
});

test('runs an isolated non-root lifecycle without privilege escalation', async (t) => {
  const fixture = await createFixture(t, {
    callerUid: '1001',
    callerGid: '1002',
    postgresUid: '1001',
    postgresGid: '1002',
    postgresGroups: '1002',
  });
  assertSuccess(runScript({ env: fixture.env }));
  const operations = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );
  assert.doesNotMatch(operations, /runuser\||install\||forbidden\|/);
  for (const database of ['prisma_prim_dev', 'prisma_prim_test']) {
    assert.match(
      operations,
      new RegExp(
        `identity\\|${escapeRegExp(fixture.env.FAKE_SOCKET_ROOT)}\\|${database}\\|${fixture.serviceUser}`,
      ),
    );
  }
});

test('rejects a non-root OS account that collides with the application role before mutation', async (t) => {
  const fixture = await createFixture(t, {
    callerUid: '1001',
    callerGid: '1002',
    callerUser: 'prisma_prim',
    withCache: false,
  });
  const result = runScript({ env: fixture.env });
  assertOrdinaryFailure(
    result,
    /must differ from the application database role/,
  );
  assert.equal(await readOptional(join(fixture.logRoot, 'operations')), '');
  await assertAbsent(fixture.cacheRoot);
  await assertAbsent(fixture.runtimeRoot);
});

for (const [name, identity] of [
  ['UID zero', { postgresUid: '0', postgresGid: '71', postgresGroups: '71' }],
  [
    'primary GID zero',
    { postgresUid: '71', postgresGid: '0', postgresGroups: '71' },
  ],
  [
    'supplementary GID zero',
    { postgresUid: '71', postgresGid: '72', postgresGroups: '72 0' },
  ],
]) {
  test(`rejects postgres ${name} before service mutation`, async (t) => {
    const fixture = await createFixture(t, {
      callerUid: '0',
      callerGid: '0',
      ...identity,
    });
    const result = runScript({ env: fixture.env });
    assertOrdinaryFailure(result, /must not be zero|must not belong/);
    const operations = await readOptional(join(fixture.logRoot, 'operations'));
    assert.doesNotMatch(operations, /install\||runuser\|/);
    await assertAbsent(join(fixture.logRoot, 'initdb'));
  });
}

test('creates a missing postgres account only in install mode and then revalidates it', async (t) => {
  const startFixture = await createFixture(t, {
    callerUid: '0',
    callerGid: '0',
  });
  const startResult = runScript({
    env: { ...startFixture.env, FAKE_POSTGRES_ACCOUNT_MISSING: 'true' },
  });
  assertOrdinaryFailure(startResult, /account is missing/);
  await assertAbsent(join(startFixture.logRoot, 'useradd'));

  const installFixture = await createFixture(t, {
    callerUid: '0',
    callerGid: '0',
  });
  const installResult = runScript({
    args: ['--install'],
    env: {
      ...installFixture.env,
      FAKE_POSTGRES_ACCOUNT_MISSING: 'true',
      FAKE_ALLOW_USERADD: 'true',
    },
  });
  assertSuccess(installResult);
  assert.match(
    await readFile(join(installFixture.logRoot, 'useradd'), 'utf8'),
    /--system --user-group .* --no-create-home .* postgres/,
  );
});

test('never creates a missing service account while a listener is present', async (t) => {
  const fixture = await createFixture(t, {
    callerUid: '0',
    callerGid: '0',
  });
  const result = runScript({
    args: ['--install'],
    env: {
      ...fixture.env,
      FAKE_POSTGRES_ACCOUNT_MISSING: 'true',
      FAKE_ALLOW_USERADD: 'true',
      FAKE_FOREIGN_TCP_LISTENER: 'true',
    },
  });
  assertOrdinaryFailure(result, /foreign listener exists before/);
  await assertAbsent(join(fixture.logRoot, 'useradd'));
  await assertAbsent(join(fixture.logRoot, 'initdb'));
});

test('rejects a foreign listener before initializing data', async (t) => {
  const fixture = await createFixture(t);
  const result = runScript({
    env: { ...fixture.env, FAKE_FOREIGN_LISTENER: 'true' },
  });
  assertOrdinaryFailure(result, /foreign listener/);
  await assert.rejects(lstat(join(fixture.logRoot, 'initdb')));
});

test('treats a TCP-only listener as foreign without creating a socket or data directory', async (t) => {
  const fixture = await createFixture(t);
  const result = runScript({
    env: { ...fixture.env, FAKE_FOREIGN_TCP_LISTENER: 'true' },
  });
  assertOrdinaryFailure(result, /foreign listener/);
  await assertAbsent(join(fixture.runtimeRoot, 'socket'));
  await assertAbsent(fixture.dataRoot);
  await assertAbsent(join(fixture.logRoot, 'initdb'));
});

test('does not create a missing socket when an existing TCP listener is observed', async (t) => {
  const fixture = await establishRunningFixture(t);
  await rm(join(fixture.runtimeRoot, 'socket'), { recursive: true });
  const mutationsBefore = await readFile(
    join(fixture.logRoot, 'mutations'),
    'utf8',
  );
  const result = runScript({ env: fixture.env });
  assertOrdinaryFailure(result, /lacks an exact owned socket directory/);
  await assertAbsent(join(fixture.runtimeRoot, 'socket'));
  assert.equal(
    await readFile(join(fixture.logRoot, 'mutations'), 'utf8'),
    mutationsBefore,
  );
});

test('rejects split readiness on an existing owned listener without provisioning', async (t) => {
  const fixture = await establishRunningFixture(t);
  const mutationsBefore = await readFile(
    join(fixture.logRoot, 'mutations'),
    'utf8',
  );
  const result = runScript({
    env: { ...fixture.env, FAKE_SOCKET_NOT_READY: 'true' },
  });
  assertOrdinaryFailure(result, /does not expose both owned transports/);
  assert.equal(
    await readFile(join(fixture.logRoot, 'mutations'), 'utf8'),
    mutationsBefore,
  );
});

test('rejects changed data configuration content and mode while preserving it', async (t) => {
  const fixture = await establishRunningFixture(t);
  const config = join(fixture.dataRoot, 'postgresql.conf');
  const exact = await readFile(config, 'utf8');

  await writeFile(config, `${exact}shared_preload_libraries = 'foreign'\n`, {
    mode: 0o600,
  });
  const changedContent = await readFile(config, 'utf8');
  const contentResult = runScript({ env: fixture.env });
  assertOrdinaryFailure(contentResult, /foreign listener/);
  assert.equal(await readFile(config, 'utf8'), changedContent);

  await writeFile(config, exact, { mode: 0o600 });
  await chmod(config, 0o644);
  const modeResult = runScript({ env: fixture.env });
  assertOrdinaryFailure(modeResult, /foreign listener/);
  assert.equal((await lstat(config)).mode & 0o777, 0o644);
});

test('rejects changed or symlinked postgresql.auto.conf before restart', async (t) => {
  const changed = await establishRunningFixture(t);
  await rm(join(changed.stateRoot, 'server.started'));
  const changedAuto = join(changed.dataRoot, 'postgresql.auto.conf');
  await writeFile(changedAuto, "listen_addresses = '*'\n", { mode: 0o600 });
  const changedResult = runScript({ env: changed.env });
  assertOrdinaryFailure(
    changedResult,
    /data directory is incomplete but lacks exact owned repair intent/,
  );
  assert.equal(await readFile(changedAuto, 'utf8'), "listen_addresses = '*'\n");
  assert.equal(
    (await readFile(join(changed.logRoot, 'pg_ctl'), 'utf8')).trim(),
    'start',
  );

  const linked = await establishRunningFixture(t);
  await rm(join(linked.stateRoot, 'server.started'));
  const linkedAuto = join(linked.dataRoot, 'postgresql.auto.conf');
  const target = join(linked.logRoot, 'foreign-auto-conf');
  await writeFile(target, 'unchanged\n', { mode: 0o600 });
  await rm(linkedAuto);
  await symlink(target, linkedAuto);
  const linkedResult = runScript({ env: linked.env });
  assertOrdinaryFailure(
    linkedResult,
    /data directory is incomplete but lacks exact owned repair intent/,
  );
  assert.equal(await readFile(target, 'utf8'), 'unchanged\n');
  assert.ok((await lstat(linkedAuto)).isSymbolicLink());
  assert.equal(
    (await readFile(join(linked.logRoot, 'pg_ctl'), 'utf8')).trim(),
    'start',
  );
});

test('rejects changed PG_VERSION and socket completion markers without repair', async (t) => {
  const fixture = await establishRunningFixture(t);
  const pgVersion = join(fixture.dataRoot, 'PG_VERSION');
  await writeFile(pgVersion, '16\n', { mode: 0o600 });
  const versionResult = runScript({ env: fixture.env });
  assertOrdinaryFailure(versionResult, /foreign listener/);
  assert.equal(await readFile(pgVersion, 'utf8'), '16\n');

  await writeFile(pgVersion, '17\n');
  await chmod(pgVersion, 0o600);
  const socketMarker = join(
    fixture.runtimeRoot,
    'socket',
    '.prisma-prim-socket-v1',
  );
  await writeFile(socketMarker, 'foreign socket marker\n', { mode: 0o600 });
  const markerResult = runScript({ env: fixture.env });
  assertOrdinaryFailure(markerResult, /socket directory is foreign/);
  assert.equal(await readFile(socketMarker, 'utf8'), 'foreign socket marker\n');
});

test('rejects a symlinked server log before restart without touching its target', async (t) => {
  const fixture = await establishRunningFixture(t);
  await rm(join(fixture.stateRoot, 'server.started'));
  const serverLog = join(fixture.dataRoot, 'server.log');
  const target = join(fixture.logRoot, 'foreign-log-target');
  await writeFile(target, 'unchanged', { mode: 0o600 });
  await rm(serverLog);
  await symlink(target, serverLog);
  const result = runScript({ env: fixture.env });
  assertOrdinaryFailure(
    result,
    /data directory is incomplete but lacks exact owned repair intent/,
  );
  assert.equal(await readFile(target, 'utf8'), 'unchanged');
  assert.ok((await lstat(serverLog)).isSymbolicLink());
  await assertAbsent(join(fixture.stateRoot, 'server.started'));
});

test('repairs exact interrupted socket and data initialization states', async (t) => {
  const socketFixture = await createFixture(t);
  const socketFailure = runScript({
    env: {
      ...socketFixture.env,
      FAKE_FAIL_SERVICE_FILE: '.prisma-prim-socket-v1',
    },
  });
  assertOrdinaryFailure(socketFailure);
  assert.ok(
    (
      await lstat(join(socketFixture.runtimeRoot, '.socket-incomplete'))
    ).isDirectory(),
  );
  assertSuccess(runScript({ env: socketFixture.env }));
  await assertAbsent(join(socketFixture.runtimeRoot, '.socket-incomplete'));
  await assertAbsent(
    join(socketFixture.runtimeRoot, '.prisma-prim-socket-intent-v1'),
  );

  const dataFixture = await createFixture(t);
  const dataFailure = runScript({
    env: { ...dataFixture.env, FAKE_INITDB_FAIL: 'true' },
  });
  assertOrdinaryFailure(dataFailure);
  assert.ok(
    (
      await lstat(join(dataFixture.runtimeRoot, '.data-incomplete'))
    ).isDirectory(),
  );
  assertSuccess(runScript({ env: dataFixture.env }));
  assert.equal(
    (await readFile(join(dataFixture.logRoot, 'initdb'), 'utf8'))
      .trim()
      .split('\n').length,
    2,
  );
  await assertAbsent(join(dataFixture.runtimeRoot, '.data-incomplete'));
  await assertAbsent(
    join(dataFixture.runtimeRoot, '.prisma-prim-data-intent-v1'),
  );
});

test('preserves interrupted state when an authorized repair deletion fails', async (t) => {
  const fixture = await createFixture(t);
  const first = runScript({
    env: {
      ...fixture.env,
      FAKE_FAIL_SERVICE_FILE: '.prisma-prim-socket-v1',
    },
  });
  assertOrdinaryFailure(first);
  const stage = join(fixture.runtimeRoot, '.socket-incomplete');
  const intent = join(fixture.runtimeRoot, '.prisma-prim-socket-intent-v1');
  const sentinel = join(stage, 'repair-sentinel');
  await writeFile(sentinel, 'preserve\n', { mode: 0o600 });

  const result = runScript({
    env: { ...fixture.env, FAKE_FAIL_RM_PATH: stage },
  });
  assertOrdinaryFailure(
    result,
    /interrupted socket state is not exactly owned and repairable/,
  );
  assert.ok((await lstat(intent)).isFile());
  assert.equal(await readFile(sentinel, 'utf8'), 'preserve\n');
  assert.ok((await lstat(stage)).isDirectory());
});

test('recovers an empty owner stage after interruption between marker cleanup and rmdir', async (t) => {
  const fixture = await createFixture(t, {
    callerUid: '0',
    callerGid: '0',
    postgresUid: '71',
    postgresGid: '72',
    postgresGroups: '72',
  });
  const result = runScript({
    env: {
      ...fixture.env,
      FAKE_SIGNAL_AFTER_RM_BASENAME: '.prisma-prim-service-owner-v1',
    },
  });
  assert.equal(result.signal, null);
  assert.equal(result.status, 143, result.stderr);
  assert.doesNotMatch(result.stdout, /Local PostgreSQL .* is ready/);
  const ownerStage = join(fixture.runtimeRoot, '.socket-owner-incomplete');
  assert.deepEqual(await readdir(ownerStage), []);
  assert.ok(
    (
      await lstat(join(fixture.runtimeRoot, '.prisma-prim-socket-intent-v1'))
    ).isFile(),
  );
  assertSuccess(runScript({ env: fixture.env }));
  await assertAbsent(ownerStage);
});

test('does not follow a service-file symlink swapped in before atomic publication', async (t) => {
  const fixture = await createFixture(t);
  const destination = join(
    fixture.runtimeRoot,
    '.socket-incomplete',
    '.prisma-prim-socket-v1',
  );
  const target = join(fixture.logRoot, 'service-write-target');
  await writeFile(target, 'unchanged\n', { mode: 0o600 });
  const before = await lstat(target);
  const result = runScript({
    env: {
      ...fixture.env,
      FAKE_SWAP_SERVICE_WRITE_PATH: destination,
      FAKE_SWAP_SERVICE_WRITE_TARGET: target,
    },
  });
  assertOrdinaryFailure(result, /appeared during atomic publication/);
  const after = await lstat(target);
  assert.equal(await readFile(target, 'utf8'), 'unchanged\n');
  assert.equal(after.mode, before.mode);
  assert.equal(after.uid, before.uid);
  assert.equal(after.gid, before.gid);
  assert.ok((await lstat(destination)).isSymbolicLink());
});

for (const [phase, destination] of [
  ['socket', 'socket'],
  ['data', 'data'],
]) {
  test(`recovers a completed ${phase} publication interrupted before intent cleanup`, async (t) => {
    const fixture = await createFixture(t);
    const result = runScript({
      env: {
        ...fixture.env,
        FAKE_SIGNAL_ON_DESTINATION: join(fixture.runtimeRoot, destination),
      },
    });
    assert.equal(result.signal, null);
    assert.equal(result.status, 143, result.stderr);
    assert.doesNotMatch(result.stdout, /Local PostgreSQL .* is ready/);
    assertSuccess(runScript({ env: fixture.env }));
    await assertAbsent(
      join(fixture.runtimeRoot, `.prisma-prim-${phase}-intent-v1`),
    );
  });
}

test('preserves interrupted socket state when its intent marker is foreign', async (t) => {
  const fixture = await createFixture(t);
  const failed = runScript({
    env: {
      ...fixture.env,
      FAKE_FAIL_SERVICE_FILE: '.prisma-prim-socket-v1',
    },
  });
  assertOrdinaryFailure(failed);
  const stage = join(fixture.runtimeRoot, '.socket-incomplete');
  const sentinel = join(stage, 'foreign-sentinel');
  await writeFile(sentinel, 'keep', { mode: 0o600 });
  await writeFile(
    join(fixture.runtimeRoot, '.prisma-prim-socket-intent-v1'),
    'foreign intent\n',
    { mode: 0o600 },
  );
  const result = runScript({ env: fixture.env });
  assertOrdinaryFailure(result, /not exactly owned and repairable/);
  assert.equal(await readFile(sentinel, 'utf8'), 'keep');
});

test('fails closed when readiness is exhausted and never prints ready', async (t) => {
  const fixture = await createFixture(t);
  const result = runScript({
    env: {
      ...fixture.env,
      FAKE_NOT_READY: 'true',
      PRISMA_PRIM_POSTGRES_READY_ATTEMPTS: '1',
    },
  });
  assertOrdinaryFailure(result, /did not become ready/);
});

for (const [phase, env, expectedMutation, forbiddenMutation] of [
  ['initdb', { FAKE_INITDB_FAIL: 'true' }, null, /create-role|createdb/],
  ['start', { FAKE_START_FAIL: 'true' }, null, /create-role|createdb/],
  [
    'initial SQL',
    { FAKE_FAIL_OPERATION: 'psql' },
    null,
    /create-role|createdb/,
  ],
  ['CREATE ROLE', { FAKE_FAIL_OPERATION: 'create-role' }, null, /createdb/],
  ['createdb', { FAKE_FAIL_OPERATION: 'createdb' }, /create-role/, /createdb/],
  [
    'second createdb',
    { FAKE_FAIL_CREATEDB_DATABASE: 'prisma_prim_test' },
    /createdb-prisma_prim_dev/,
    /createdb-prisma_prim_test/,
  ],
]) {
  test(`fails closed at the ${phase} boundary and stops a started server`, async (t) => {
    const fixture = await createFixture(t);
    const result = runScript({ env: { ...fixture.env, ...env } });
    assertOrdinaryFailure(result);
    const mutations = await readOptional(join(fixture.logRoot, 'mutations'));
    if (expectedMutation) assert.match(mutations, expectedMutation);
    assert.doesNotMatch(mutations, forbiddenMutation);
    const pgCtl = await readOptional(join(fixture.logRoot, 'pg_ctl'));
    if (phase === 'start') assert.match(pgCtl, /stop/);
    else if (phase !== 'initdb') assert.match(pgCtl, /start[\s\S]*stop/);
    await assertAbsent(join(fixture.stateRoot, 'server.started'));
  });
}

test('rejects every live identity, version, privilege, owner, and sentinel mismatch', async (t) => {
  const fixture = await establishRunningFixture(t);
  const mutationsBefore = await readFile(
    join(fixture.logRoot, 'mutations'),
    'utf8',
  );
  const cases = [
    ['data directory', { FAKE_IDENTITY_DATA: `${fixture.dataRoot}-foreign` }],
    ['port', { FAKE_IDENTITY_PORT: '6543' }],
    [
      'socket',
      { FAKE_IDENTITY_SOCKET: `${fixture.runtimeRoot}/foreign-socket` },
    ],
    ['listen address', { FAKE_IDENTITY_LISTEN: '*' }],
    ['old server version', { FAKE_IDENTITY_VERSION: '170010' }],
    ['newer server version', { FAKE_IDENTITY_VERSION: '170012' }],
    [
      'overflowing server version',
      { FAKE_IDENTITY_VERSION: '18446744073709721627' },
    ],
    ['future server version', { FAKE_IDENTITY_VERSION: '180000' }],
    ['checksums', { FAKE_IDENTITY_CHECKSUMS: 'off' }],
    ['database', { FAKE_IDENTITY_DATABASE: 'postgres' }],
    ['user', { FAKE_IDENTITY_USER: 'foreign' }],
    ['LOGIN', { FAKE_ROLE_LOGIN: 'f' }],
    ['CREATEDB', { FAKE_ROLE_CREATEDB: 'f' }],
    ['SUPERUSER', { FAKE_ROLE_SUPERUSER: 't' }],
    ['CREATEROLE', { FAKE_ROLE_CREATEROLE: 't' }],
    ['REPLICATION', { FAKE_ROLE_REPLICATION: 't' }],
    ['BYPASSRLS', { FAKE_ROLE_BYPASSRLS: 't' }],
    ['database owner', { FAKE_DATABASE_OWNER: 'postgres' }],
    ['sentinel', { FAKE_IDENTITY_SENTINEL: 'foreign' }],
    ['extra output field', { FAKE_IDENTITY_EXTRA: '|foreign' }],
  ];
  for (const [name, mismatch] of cases) {
    const result = runScript({ env: { ...fixture.env, ...mismatch } });
    assertOrdinaryFailure(result, /identity/);
    assert.equal(
      await readFile(join(fixture.logRoot, 'mutations'), 'utf8'),
      mutationsBefore,
      `${name} mismatch performed SQL mutation`,
    );
  }
});

test('does not mutate valid existing objects when incomplete catalog identities are unsafe', async (t) => {
  const fixture = await establishRunningFixture(t);
  await rm(join(fixture.stateRoot, 'database.prisma_prim_test'));
  const mutationsBefore = await readFile(
    join(fixture.logRoot, 'mutations'),
    'utf8',
  );
  const cases = [
    ['role privilege', { FAKE_ROLE_SUPERUSER: 't' }],
    ['role password', { FAKE_REJECT_APP_PASSWORD: 'true' }],
    ['database owner', { FAKE_DATABASE_OWNER: 'postgres' }],
    ['TCP identity', { FAKE_TCP_IDENTITY_PORT: '6543' }],
  ];

  for (const [name, mismatch] of cases) {
    const result = runScript({ env: { ...fixture.env, ...mismatch } });
    assertOrdinaryFailure(result, /identity verification failed/);
    assert.equal(
      await readFile(join(fixture.logRoot, 'mutations'), 'utf8'),
      mutationsBefore,
      `${name} mismatch performed SQL mutation`,
    );
    await assertAbsent(join(fixture.stateRoot, 'database.prisma_prim_test'));
  }
});

for (const [name, env, pattern] of [
  ['failed', { FAKE_FAIL_CATALOG_PROBE_NUMBER: '2' }, /catalog probe failed/],
  [
    'malformed',
    { FAKE_MALFORMED_CATALOG_PROBE_NUMBER: '3' },
    /catalog probe returned unexpected output/,
  ],
]) {
  test(`rejects a ${name} catalog probe without mutation`, async (t) => {
    const fixture = await establishRunningFixture(t);
    await rm(join(fixture.stateRoot, 'database.prisma_prim_test'));
    await rm(join(fixture.stateRoot, 'catalog-probe-count'), { force: true });
    const mutationsBefore = await readFile(
      join(fixture.logRoot, 'mutations'),
      'utf8',
    );

    const result = runScript({ env: { ...fixture.env, ...env } });
    assertOrdinaryFailure(result, pattern);
    assert.equal(
      await readFile(join(fixture.logRoot, 'mutations'), 'utf8'),
      mutationsBefore,
    );
    await assertAbsent(join(fixture.stateRoot, 'database.prisma_prim_test'));
  });
}

test('runs the same application identity query on both transports and rejects TCP-only mismatch', async (t) => {
  const fixture = await establishRunningFixture(t);
  const operations = await readFile(
    join(fixture.logRoot, 'operations'),
    'utf8',
  );
  assert.match(
    operations,
    new RegExp(
      `identity\\|${escapeRegExp(fixture.env.FAKE_SOCKET_ROOT)}\\|prisma_prim_dev\\|${fixture.serviceUser}`,
    ),
  );
  assert.match(
    operations,
    /identity\|127\.0\.0\.1\|prisma_prim_dev\|prisma_prim/,
  );
  assert.match(
    operations,
    new RegExp(
      `identity\\|${escapeRegExp(fixture.env.FAKE_SOCKET_ROOT)}\\|prisma_prim_test\\|${fixture.serviceUser}`,
    ),
  );
  assert.match(
    operations,
    /identity\|127\.0\.0\.1\|prisma_prim_test\|prisma_prim/,
  );

  const mutationsBefore = await readFile(
    join(fixture.logRoot, 'mutations'),
    'utf8',
  );
  const result = runScript({
    env: { ...fixture.env, FAKE_TCP_APP_IDENTITY_PORT: '6543' },
  });
  assertOrdinaryFailure(result, /existing TCP identity verification failed/);
  assert.equal(
    await readFile(join(fixture.logRoot, 'mutations'), 'utf8'),
    mutationsBefore,
  );
});

test('rejects a role that gains superuser authority', async (t) => {
  const fixture = await createFixture(t);
  const result = runScript({
    env: { ...fixture.env, FAKE_ROLE_SUPERUSER: 'true' },
  });
  assertOrdinaryFailure(result, /identity verification failed/);
});

test('rejects a role with inherited authority before mutation', async (t) => {
  const fixture = await establishRunningFixture(t);
  const mutationsBefore = await readFile(
    join(fixture.logRoot, 'mutations'),
    'utf8',
  );
  const result = runScript({
    env: { ...fixture.env, FAKE_ROLE_MEMBERSHIP_COUNT: '1' },
  });
  assertOrdinaryFailure(result, /identity verification failed/);
  assert.equal(
    await readFile(join(fixture.logRoot, 'mutations'), 'utf8'),
    mutationsBefore,
  );
});

test('rejects grants of the application role to another identity before mutation', async (t) => {
  const fixture = await establishRunningFixture(t);
  const mutationsBefore = await readFile(
    join(fixture.logRoot, 'mutations'),
    'utf8',
  );
  const result = runScript({
    env: { ...fixture.env, FAKE_ROLE_RELATION_COUNT: '1' },
  });
  assertOrdinaryFailure(result, /identity verification failed/);
  assert.equal(
    await readFile(join(fixture.logRoot, 'mutations'), 'utf8'),
    mutationsBefore,
  );
  assert.match(
    script,
    /pg_auth_members m WHERE m\.member = r\.oid OR m\.roleid = r\.oid/,
  );
});

test('rejects an application role connection limit before mutation', async (t) => {
  const fixture = await establishRunningFixture(t);
  const mutationsBefore = await readFile(
    join(fixture.logRoot, 'mutations'),
    'utf8',
  );
  const result = runScript({
    env: { ...fixture.env, FAKE_ROLE_CONNECTION_LIMIT: '1' },
  });
  assertOrdinaryFailure(result, /identity verification failed/);
  assert.equal(
    await readFile(join(fixture.logRoot, 'mutations'), 'utf8'),
    mutationsBefore,
  );
  assert.match(script, /r\.rolconnlimit/);
});

test('rejects expiring application-role credentials before mutation', async (t) => {
  const fixture = await establishRunningFixture(t);
  const mutationsBefore = await readFile(
    join(fixture.logRoot, 'mutations'),
    'utf8',
  );
  const result = runScript({
    env: { ...fixture.env, FAKE_ROLE_VALID_UNTIL_IS_NULL: 'f' },
  });
  assertOrdinaryFailure(result, /identity verification failed/);
  assert.equal(
    await readFile(join(fixture.logRoot, 'mutations'), 'utf8'),
    mutationsBefore,
  );
});

test('rejects an application database connection limit before mutation', async (t) => {
  const fixture = await establishRunningFixture(t);
  const mutationsBefore = await readFile(
    join(fixture.logRoot, 'mutations'),
    'utf8',
  );
  const result = runScript({
    env: { ...fixture.env, FAKE_DATABASE_CONNECTION_LIMIT: '1' },
  });
  assertOrdinaryFailure(result, /identity verification failed/);
  assert.equal(
    await readFile(join(fixture.logRoot, 'mutations'), 'utf8'),
    mutationsBefore,
  );
});

test('rejects direct application-database grants before mutation', async (t) => {
  const fixture = await establishRunningFixture(t);
  const mutationsBefore = await readFile(
    join(fixture.logRoot, 'mutations'),
    'utf8',
  );
  const result = runScript({
    env: { ...fixture.env, FAKE_DATABASE_ACL_IS_NULL: 'f' },
  });
  assertOrdinaryFailure(result, /identity verification failed/);
  assert.equal(
    await readFile(join(fixture.logRoot, 'mutations'), 'utf8'),
    mutationsBefore,
  );
  assert.match(script, /d\.datacl IS NULL/);
});

test('rejects TCP trust authentication before mutation', async (t) => {
  const fixture = await establishRunningFixture(t);
  const mutationsBefore = await readFile(
    join(fixture.logRoot, 'mutations'),
    'utf8',
  );
  const result = runScript({
    env: { ...fixture.env, FAKE_TCP_TRUST_AUTH: 'true' },
  });
  assertOrdinaryFailure(result, /password enforcement verification failed/);
  assert.equal(
    await readFile(join(fixture.logRoot, 'mutations'), 'utf8'),
    mutationsBefore,
  );
  assert.match(script, /prisma-prim-known-invalid-password-v1/);
});

test('rejects persistent application-role settings before mutation', async (t) => {
  const fixture = await establishRunningFixture(t);
  const mutationsBefore = await readFile(
    join(fixture.logRoot, 'mutations'),
    'utf8',
  );
  const result = runScript({
    env: { ...fixture.env, FAKE_ROLE_SETTING_COUNT: '1' },
  });
  assertOrdinaryFailure(result, /identity verification failed/);
  assert.equal(
    await readFile(join(fixture.logRoot, 'mutations'), 'utf8'),
    mutationsBefore,
  );
  assert.match(script, /pg_db_role_setting s WHERE s\.setrole = r\.oid/);
});

test('rejects persistent application-database settings before mutation', async (t) => {
  const fixture = await establishRunningFixture(t);
  const mutationsBefore = await readFile(
    join(fixture.logRoot, 'mutations'),
    'utf8',
  );
  const result = runScript({
    env: { ...fixture.env, FAKE_DATABASE_SETTING_COUNT: '1' },
  });
  assertOrdinaryFailure(result, /identity verification failed/);
  assert.equal(
    await readFile(join(fixture.logRoot, 'mutations'), 'utf8'),
    mutationsBefore,
  );
  assert.match(
    script,
    /pg_db_role_setting s WHERE s\.setdatabase = d\.oid AND s\.setrole = 0/,
  );
});

test('queries database ownership before role memberships to match the identity parser', () => {
  assert.match(
    script,
    /app_identity_query=.*pg_get_userbyid\(d\.datdba\).+pg_auth_members/,
  );
});

test('rejects a final server version other than exactly 17.11', async (t) => {
  const fixture = await createFixture(t);
  const result = runScript({
    env: { ...fixture.env, FAKE_SERVER_VERSION: '17.12' },
  });
  assertOrdinaryFailure(result, /not exactly PostgreSQL 17\.11/);
});

test('preserves an unmarked data directory instead of adopting it', async (t) => {
  const fixture = await createFixture(t);
  await mkdir(fixture.runtimeRoot, { mode: hostUid === '0' ? 0o711 : 0o700 });
  await writeFile(
    join(fixture.runtimeRoot, '.prisma-prim-runtime-v1'),
    `prisma-prim-postgres-runtime-v1\nowner_uid=${hostUid}\nowner_gid=${hostGid}\n`,
    { mode: 0o600 },
  );
  await mkdir(fixture.dataRoot, { mode: 0o700 });
  const sentinel = join(fixture.dataRoot, 'foreign');
  await writeFile(sentinel, 'keep');
  const result = runScript({ env: fixture.env });
  assertOrdinaryFailure(result, /lacks exact owned repair intent/);
  assert.equal(await readFile(sentinel, 'utf8'), 'keep');
});

function collect(child) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (status, signal) =>
      resolve({ status, signal, stderr, stdout }),
    );
  });
}

async function terminateProcessGroup(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise((resolve) => child.once('close', resolve));
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error?.code === 'ESRCH') return;
      throw error;
    }
    const exited = await Promise.race([
      closed.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 500)),
    ]);
    if (exited) return;
  }
}

async function waitFor(path, timeout = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      await lstat(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  assert.fail(`Timed out waiting for ${path}`);
}

async function settleAfterCoordination(resultPromise, description) {
  let timer;
  try {
    return await Promise.race([
      resultPromise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out ${description}`)),
          15_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test('rejects lifecycle lock inode replacement after open and before service mutation', async (t) => {
  const fixture = await createFixture(t);
  const result = runScript({
    env: { ...fixture.env, FAKE_SWAP_LOCK_AFTER_OPEN: 'true' },
  });
  assertOrdinaryFailure(result, /lock inode changed after acquisition/);
  await assertAbsent(join(fixture.logRoot, 'initdb'));
  await assertAbsent(fixture.dataRoot);
});

for (const [lockName, injection] of [
  ['lifecycle', 'FAKE_SWAP_RUNTIME_LOCK_TO_FIFO_BEFORE_OPEN'],
  ['build', 'FAKE_SWAP_BUILD_LOCK_TO_FIFO_BEFORE_OPEN'],
]) {
  test(`rejects a ${lockName} FIFO substitution before open without blocking`, async (t) => {
    const fixture = await createFixture(t);
    const child = spawn('bash', [scriptPath], {
      detached: true,
      env: cleanEnvironment({ ...fixture.env, [injection]: 'true' }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(() => terminateProcessGroup(child));
    const resultPromise = collect(child);
    const substitutionMarker = join(
      fixture.logRoot,
      `${lockName === 'lifecycle' ? 'runtime' : 'build'}-lock-fifo`,
    );
    await waitFor(substitutionMarker);
    const result = await settleAfterCoordination(
      resultPromise,
      `for the ${lockName} lock rejection after FIFO substitution`,
    );
    assertOrdinaryFailure(
      result,
      new RegExp(`the ${lockName} lock did not open`),
    );
    await assertAbsent(join(fixture.logRoot, 'initdb'));
    await assertAbsent(fixture.dataRoot);
  });
}

for (const swapKind of ['symlink', 'directory']) {
  test(`rejects ${swapKind} cache-root replacement after opening its hard-linked lock`, async (t) => {
    const fixture = await createFixture(t);
    const movedCache = `${fixture.cacheRoot}.opened`;
    const foreignTarget = join(fixture.logRoot, `foreign-cache-${swapKind}`);
    const sentinel = join(foreignTarget, 'sentinel');
    await mkdir(foreignTarget, { mode: 0o700 });
    await writeFile(sentinel, 'unchanged', { mode: 0o600 });
    const before = await lstat(foreignTarget);
    t.after(() => rm(movedCache, { recursive: true, force: true }));

    const result = runScript({
      env: {
        ...fixture.env,
        FAKE_SWAP_CACHE_AFTER_OPEN: swapKind,
        FAKE_SWAP_CACHE_TARGET: foreignTarget,
      },
    });

    assertOrdinaryFailure(result, /cache root (changed|inode changed)/);
    assert.ok((await lstat(movedCache)).isDirectory());
    await assertAbsent(join(fixture.logRoot, 'initdb'));
    assert.doesNotMatch(
      await readOptional(join(fixture.logRoot, 'operations')),
      /curl\||make\|/,
    );
    if (swapKind === 'symlink') {
      const after = await lstat(foreignTarget);
      assert.equal(await readFile(sentinel, 'utf8'), 'unchanged');
      assert.equal(after.mode, before.mode);
      assert.equal(after.uid, before.uid);
      assert.equal(after.gid, before.gid);
    }
  });
}

test('serializes distinct caches sharing one runtime and does not leak FD8', async (t) => {
  const runtimeRoot = join(
    tmpdir(),
    `prisma-prim-runtime-concurrency-${randomUUID()}`,
  );
  const first = await createFixture(t, { runtimeRoot });
  const second = await createFixture(t, {
    runtimeRoot,
    port: first.env.PRISMA_PRIM_POSTGRES_PORT,
    stateRoot: first.stateRoot,
  });
  const flockDirectory = await mkdtemp(
    join(tmpdir(), 'prisma-prim-flock-test-'),
  );
  const entered = join(flockDirectory, 'initdb.entered');
  const release = join(flockDirectory, 'initdb.release');
  t.after(() => rm(flockDirectory, { recursive: true, force: true }));
  const children = [];
  t.after(async () => {
    try {
      await writeFile(release, '');
    } catch {
      // Process-group termination below is the fallback if teardown ran first.
    }
    await Promise.all(children.map(terminateProcessGroup));
  });

  const firstChild = spawn('bash', [scriptPath], {
    env: cleanEnvironment({
      ...first.env,
      PRISMA_PRIM_POSTGRES_LOCK_SECONDS: '60',
      FAKE_FLOCK_DIRECTORY: flockDirectory,
      FAKE_INSTANCE: 'a',
      FAKE_INITDB_ENTERED: entered,
      FAKE_INITDB_RELEASE: release,
    }),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(firstChild);
  const firstResult = collect(firstChild);
  await waitFor(entered, 60_000);

  const secondChild = spawn('bash', [scriptPath], {
    env: cleanEnvironment({
      ...second.env,
      PRISMA_PRIM_POSTGRES_LOCK_SECONDS: '60',
      FAKE_SERVICE_MARKER_LOG: first.logRoot,
      FAKE_FLOCK_DIRECTORY: flockDirectory,
      FAKE_INSTANCE: 'b',
    }),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(secondChild);
  const secondResult = collect(secondChild);
  await waitFor(join(flockDirectory, 'b.attempt'));
  await assert.rejects(lstat(join(flockDirectory, 'b.acquired')));
  await assert.rejects(lstat(join(second.logRoot, 'initdb')));
  assert.equal(await readOptional(join(second.logRoot, 'operations')), '');

  await writeFile(release, '');
  const [a, b] = await Promise.all([firstResult, secondResult]);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(b.status, 0, b.stderr);
  await waitFor(join(flockDirectory, 'b.acquired'));
  assert.ok((await lstat(join(first.logRoot, 'initdb'))).isFile());
  await assert.rejects(lstat(join(second.logRoot, 'initdb')));
  assert.equal(
    (await readFile(join(first.logRoot, 'initdb'), 'utf8')).trim(),
    'initdb',
  );
  assert.equal(
    (await readFile(join(first.logRoot, 'pg_ctl'), 'utf8')).trim(),
    'start',
  );
  await assertAbsent(join(second.logRoot, 'pg_ctl'));

  const lockAvailable = spawnSync(
    '/usr/bin/flock',
    ['--nonblock', join(runtimeRoot, 'lifecycle.lock'), '-c', 'true'],
    { encoding: 'utf8' },
  );
  assert.equal(lockAvailable.status, 0, lockAvailable.stderr);
});

test('holds the shared cache lock through a late rollback before another runtime rebuilds', async (t) => {
  const cacheRoot = join(
    tmpdir(),
    `prisma-prim-cache-concurrency-${randomUUID()}`,
  );
  const first = await createFixture(t, { cacheRoot });
  await executable(
    join(first.installRoot, 'bin', 'postgres'),
    '#!/bin/bash\necho "postgres (PostgreSQL) 16.9"\n',
  );
  const second = await createFixture(t, { cacheRoot, withCache: false });
  const coordination = await mkdtemp(
    join(tmpdir(), 'prisma-prim-build-flock-test-'),
  );
  const entered = join(coordination, 'initdb.entered');
  const release = join(coordination, 'initdb.release');
  t.after(() => rm(coordination, { recursive: true, force: true }));
  const children = [];
  t.after(async () => {
    try {
      await writeFile(release, '');
    } catch {
      // Process-group termination below is the fallback if teardown ran first.
    }
    await Promise.all(children.map(terminateProcessGroup));
  });

  const firstChild = spawn('bash', [scriptPath, '--install'], {
    detached: true,
    env: cleanEnvironment({
      ...first.env,
      PRISMA_PRIM_POSTGRES_LOCK_SECONDS: '60',
      FAKE_BUILD_FLOCK_DIRECTORY: coordination,
      FAKE_INSTANCE: 'a',
      FAKE_INITDB_ENTERED: entered,
      FAKE_INITDB_RELEASE: release,
      FAKE_FAIL_OPERATION: 'psql',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(firstChild);
  const firstResult = collect(firstChild);
  await waitFor(entered, 60_000);
  assert.ok((await lstat(join(coordination, 'a.build-acquired'))).isFile());

  const secondChild = spawn('bash', [scriptPath, '--install'], {
    detached: true,
    env: cleanEnvironment({
      ...second.env,
      PRISMA_PRIM_POSTGRES_LOCK_SECONDS: '60',
      FAKE_BUILD_FLOCK_DIRECTORY: coordination,
      FAKE_INSTANCE: 'b',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(secondChild);
  const secondResult = collect(secondChild);
  await waitFor(join(coordination, 'b.build-attempt'));
  await assertAbsent(join(coordination, 'b.build-acquired'));
  await assertAbsent(join(second.logRoot, 'initdb'));

  await writeFile(release, '');
  const [a, b] = await Promise.all([firstResult, secondResult]);
  assertOrdinaryFailure(a);
  assertSuccess(b);
  await waitFor(join(coordination, 'b.build-acquired'));
  assert.match(
    await readFile(join(first.logRoot, 'operations'), 'utf8'),
    /make\|.*DESTDIR=/,
  );
  assert.match(
    await readFile(join(second.logRoot, 'operations'), 'utf8'),
    /make\|.*DESTDIR=/,
  );
});

test('keeps the production scope free of credential and shared-database side effects', () => {
  assert.doesNotMatch(script, /https?:\/\/[^'"\s]*@/);
  assert.doesNotMatch(script, /DROP DATABASE|DROP ROLE|rm -rf \/|chown -R/);
  assert.match(script, /127\.0\.0\.1/);
  assert.match(script, /prisma_prim_dev/);
  assert.match(script, /prisma_prim_test/);
});
