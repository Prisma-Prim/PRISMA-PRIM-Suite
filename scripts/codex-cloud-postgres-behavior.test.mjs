import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scriptPath = fileURLToPath(
  new URL('./codex-cloud-postgres.sh', import.meta.url),
);

// Exercise the real entry point. Only host filesystem, package-manager and
// PostgreSQL commands are replaced; no cluster, keyring or shell profile is
// changed on the machine running the tests.
const host = String.raw`
source "$1" "$TEST_MODE"
cluster_installed() { [[ -f "$TEST_ROOT/installed" ]]; }
persist_application_targets() { echo TARGETS_PERSISTED; }
mktemp() { command mktemp "$TEST_ROOT/key.XXXXXX"; }
pg_isready() { return 0; }
psql() { echo 170011; }
dpkg-query() { echo "$TEST_CA_STATUS"; }
apt-cache() { echo '500 https://apt.postgresql.org/pub/repos/apt'; }
curl() {
  local destination='' content='complete-signing-key'
  [[ "$TEST_DOWNLOAD_FAIL" == 0 ]] || content='partial-key'
  [[ "$TEST_DOWNLOAD_EMPTY" == 0 ]] || content=''
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == -o ]]; then destination="$2"; shift; fi
    shift
  done
  if [[ -n "$destination" ]]; then
    printf '%s' "$content" >"$destination"
  else
    printf '%s' "$content"
  fi
  [[ "$TEST_DOWNLOAD_FAIL" == 0 ]]
}
as_root() {
  printf 'HOST %s\n' "$*" >&2
  case "$1" in
    pg_lsclusters) printf '%s\n' "$TEST_CLUSTERS" ;;
    pg_ctlcluster) echo CLUSTER_STARTED ;;
    test) [[ "$TEST_KEY_EXISTS" == 1 ]] ;;
    install)
      if [[ "$2" == -m ]]; then
        [[ "$TEST_PUBLISH_FAIL" == 0 ]] || return 1
        printf 'KEY_PUBLISHED %s\n' "$(cat "$4")" >&2
      fi ;;
    tee)
      local content
      content="$(cat)"
      [[ "$2" != *.asc ]] || printf 'KEY_PUBLISHED %s\n' "$content" >&2 ;;
    env)
      shift 3
      if [[ "$1" == update ]]; then
        if [[ "$*" == *APT::Update::Error-Mode=any* && "$TEST_REFRESH_FAIL" == 1 ]]; then
          echo 'PGDG refresh failed despite a cached candidate' >&2
          return 100
        fi
        if [[ "$*" != *APT::Update::Error-Mode=any* && "$TEST_GENERAL_REFRESH_FAIL" == 1 ]]; then
          return 100
        fi
      elif [[ "$*" == *postgresql-17* ]]; then
        echo POSTGRES_INSTALLED
        touch "$TEST_ROOT/installed"
      fi ;;
    runuser)
      local sql
      for sql in "$@"; do :; done
      if [[ "$sql" == SELECT* && "$TEST_READ_FAIL" == 1 ]]; then return 1; fi
      case "$sql" in
        'SELECT 1 FROM pg_roles'*) echo "$TEST_ROLE_EXISTS" ;;
        'SELECT '*rolcanlogin*) echo "$TEST_ROLE_COMPLIANT" ;;
        'SELECT 1 FROM pg_database'*) echo "$TEST_DATABASE_EXISTS" ;;
        'SELECT '*datdba*) echo "$TEST_DATABASE_OWNER" ;;
        'CREATE '*|'ALTER '*)
          [[ "$TEST_SQL_FAIL" == 0 ]] || return 1 ;;
        *) echo "Unexpected SQL: $sql" >&2; return 90 ;;
      esac ;;
    *) echo "Unexpected privileged command: $*" >&2; return 91 ;;
  esac
}
[[ "$TEST_MODE" != --start ]] || touch "$TEST_ROOT/installed"
main
`;

async function runInstaller(overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'postgres-installer-'));
  try {
    const result = spawnSync(
      'bash',
      ['-c', host, 'installer-test', scriptPath],
      {
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          TEST_ROOT: directory,
          TEST_MODE: '--start',
          TEST_CLUSTERS: '17 main 5432 down postgres /data /log',
          TEST_CA_STATUS: 'install ok installed',
          TEST_KEY_EXISTS: '0',
          TEST_DOWNLOAD_FAIL: '0',
          TEST_DOWNLOAD_EMPTY: '0',
          TEST_PUBLISH_FAIL: '0',
          TEST_REFRESH_FAIL: '0',
          TEST_GENERAL_REFRESH_FAIL: '0',
          TEST_ROLE_EXISTS: '1',
          TEST_ROLE_COMPLIANT: 't',
          TEST_DATABASE_EXISTS: '1',
          TEST_DATABASE_OWNER: 'prisma_prim',
          TEST_SQL_FAIL: '0',
          TEST_READ_FAIL: '0',
          ...overrides,
        },
      },
    );
    assert.ifError(result.error);
    return { ...result, files: await readdir(directory) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('rejects a target on the wrong port before starting or provisioning', async () => {
  const result = await runInstaller({
    TEST_CLUSTERS: '17 main 5433 down postgres /data /log',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /17\/main.*5433.*5432/);
  assert.doesNotMatch(result.stdout, /CLUSTER_STARTED|TARGETS_PERSISTED/);
  assert.doesNotMatch(result.stderr, /HOST runuser/);
});

test('never publishes a partial signing key after an interrupted download', async () => {
  const result = await runInstaller({
    TEST_MODE: '--install',
    TEST_DOWNLOAD_FAIL: '1',
  });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /KEY_PUBLISHED/);
  assert.doesNotMatch(result.stdout, /POSTGRES_INSTALLED|TARGETS_PERSISTED/);
  assert.deepEqual(result.files, []);
});

test('reconciles excessive existing role privileges before reporting readiness', async () => {
  const result = await runInstaller({ TEST_ROLE_COMPLIANT: 'f' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stderr,
    /ALTER ROLE prisma_prim WITH LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS/,
  );
  assert.match(result.stdout, /TARGETS_PERSISTED/);
});

test('repairs both existing database owners without recreating databases', async () => {
  const result = await runInstaller({ TEST_DATABASE_OWNER: 'foreign_owner' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stderr,
    /ALTER DATABASE prisma_prim_dev OWNER TO prisma_prim/,
  );
  assert.match(
    result.stderr,
    /ALTER DATABASE prisma_prim_test OWNER TO prisma_prim/,
  );
  assert.doesNotMatch(result.stderr, /CREATE DATABASE/);
});

test('refuses a stale PGDG candidate when the current PGDG refresh fails', async () => {
  const result = await runInstaller({
    TEST_MODE: '--install',
    TEST_REFRESH_FAIL: '1',
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /PGDG.*(?:refresh|refreshed)/);
  assert.doesNotMatch(result.stdout, /POSTGRES_INSTALLED|TARGETS_PERSISTED/);
  assert.deepEqual(result.files, []);
});

test('installs CA certificates even when curl is already available', async () => {
  const result = await runInstaller({
    TEST_MODE: '--install',
    TEST_CA_STATUS: 'deinstall ok config-files',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /apt-get install.*curl ca-certificates/);
  assert.match(result.stdout, /POSTGRES_INSTALLED/);
  assert.deepEqual(result.files, ['installed']);
});

test('rejects a conflicting cluster regardless of inventory order', async () => {
  const target = '17 main 5432 down postgres /data /log';
  const foreign = '16 foreign 5432 online postgres /other /log';
  for (const clusters of [`${target}\n${foreign}`, `${foreign}\n${target}`]) {
    const result = await runInstaller({ TEST_CLUSTERS: clusters });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /5432.*conflicting cluster 16\/foreign/);
    assert.doesNotMatch(result.stdout, /CLUSTER_STARTED|TARGETS_PERSISTED/);
    assert.doesNotMatch(result.stderr, /HOST runuser/);
  }
});

test('refuses a disappeared cluster without connecting to another server', async () => {
  const result = await runInstaller({ TEST_CLUSTERS: '' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /17\/main was not found/);
  assert.doesNotMatch(result.stderr, /HOST runuser/);
});

test('preserves compliant existing identities and an already-online cluster', async () => {
  const result = await runInstaller({
    TEST_CLUSTERS: '17 main 5432 online postgres /data /log',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(
    result.stderr,
    /CREATE ROLE|ALTER ROLE|CREATE DATABASE|ALTER DATABASE/,
  );
  assert.doesNotMatch(result.stdout, /CLUSTER_STARTED/);
  assert.match(result.stdout, /TARGETS_PERSISTED/);
});

test('creates missing identities using the existing least-privilege contract', async () => {
  const result = await runInstaller({
    TEST_ROLE_EXISTS: '',
    TEST_DATABASE_EXISTS: '',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stderr,
    /CREATE ROLE prisma_prim WITH LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS/,
  );
  assert.match(
    result.stderr,
    /CREATE DATABASE prisma_prim_dev OWNER prisma_prim TEMPLATE template0/,
  );
  assert.match(
    result.stderr,
    /CREATE DATABASE prisma_prim_test OWNER prisma_prim TEMPLATE template0/,
  );
  assert.doesNotMatch(result.stderr, /ALTER ROLE|ALTER DATABASE/);
});

test('stops without publishing readiness when a privilege repair fails', async () => {
  const result = await runInstaller({
    TEST_ROLE_COMPLIANT: 'f',
    TEST_SQL_FAIL: '1',
  });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout, /ready on|TARGETS_PERSISTED/);
  assert.doesNotMatch(result.stderr, /FROM pg_database/);
});

test('stops without making changes when an identity read fails', async () => {
  const result = await runInstaller({ TEST_READ_FAIL: '1' });
  assert.equal(result.status, 1);
  assert.doesNotMatch(
    result.stderr,
    /CREATE ROLE|ALTER ROLE|CREATE DATABASE|ALTER DATABASE/,
  );
  assert.doesNotMatch(result.stdout, /ready on|TARGETS_PERSISTED/);
});

test('publishes only a complete key and tolerates unrelated apt-source failure', async () => {
  const result = await runInstaller({
    TEST_MODE: '--install',
    TEST_GENERAL_REFRESH_FAIL: '1',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /KEY_PUBLISHED complete-signing-key/);
  assert.doesNotMatch(result.stderr, /apt-get install.*curl ca-certificates/);
  assert.match(result.stdout, /POSTGRES_INSTALLED/);
  assert.deepEqual(result.files, ['installed']);
});

test('cleans the staged key after empty downloads and publication failures', async () => {
  for (const failure of [
    { TEST_DOWNLOAD_EMPTY: '1' },
    { TEST_PUBLISH_FAIL: '1' },
  ]) {
    const result = await runInstaller({ TEST_MODE: '--install', ...failure });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stderr, /KEY_PUBLISHED/);
    assert.doesNotMatch(result.stdout, /POSTGRES_INSTALLED/);
    assert.deepEqual(result.files, []);
  }
});
