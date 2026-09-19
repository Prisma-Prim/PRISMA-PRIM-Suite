import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scriptPath = fileURLToPath(
  new URL('./codex-cloud-postgres.sh', import.meta.url),
);
const script = await readFile(scriptPath, 'utf8');

test(
  'Linux installer accepts only the --start and --install modes',
  {
    skip:
      process.platform === 'win32'
        ? 'Linux installer execution belongs to Linux CI'
        : false,
  },
  () => {
    for (const args of [['--reset'], ['--start', '--install'], ['start']]) {
      const result = spawnSync('bash', [scriptPath, ...args], {
        encoding: 'utf8',
      });
      assert.equal(result.status, 2, args.join(' '));
      assert.match(
        result.stderr,
        /Usage: bash scripts\/codex-cloud-postgres\.sh/,
      );
    }
  },
);

test('installs PostgreSQL 17 from the PGDG apt repository without a source build', () => {
  assert.match(script, /apt\.postgresql\.org\/pub\/repos\/apt/);
  assert.match(
    script,
    /apt_get install -y -qq --no-install-recommends[\s\S]*postgresql-\$\{postgres_major\}/,
  );
  assert.doesNotMatch(
    script,
    /configure|make install|tar |curl [^\n]*github\.com/,
  );
  assert.doesNotMatch(script, /docker/);
});

test('survives apt sources the harness blocks and proves the PGDG index instead', () => {
  assert.match(script, /^refresh_package_index\(\) \{$/m);
  assert.match(
    script,
    /apt_get update -qq \|\|\n\s+echo '[^']*could not be refreshed/,
  );
  assert.match(
    script,
    /policy="\$\(apt-cache policy "postgresql-\$\{postgres_major\}" 2>\/dev\/null \|\| true\)"/,
  );
  assert.match(script, /\[\[ "\$\{policy\}" == \*apt\.postgresql\.org\* \]\]/);
  // Reading apt-cache through `| grep -q` reports failure under
  // `set -o pipefail`: the reader exits on the first match and apt-cache dies
  // of SIGPIPE, so an available package was reported as missing.
  assert.doesNotMatch(script, /apt-cache policy[^\n]*\|\s*grep/);
  assert.match(
    script,
    /pgdg_candidate_is_available \|\|\n\s+fail "postgresql-\$\{postgres_major\} is not available from apt\.postgresql\.org/,
  );
  // A bare refresh would abort the installation on an unrelated blocked source.
  assert.doesNotMatch(script, /^\s*apt_get update -qq$/m);
});

test('bootstraps curl only when the image does not already provide it', () => {
  assert.match(
    script,
    /if ! command -v curl >\/dev\/null; then\n\s+apt_get install -y -qq --no-install-recommends curl ca-certificates \|\|/,
  );
});

test('keeps apt unattended inside the escalated command, not in the caller environment', () => {
  assert.match(
    script,
    /as_root env DEBIAN_FRONTEND=noninteractive apt-get "\$@"/,
  );
  assert.doesNotMatch(script, /^\s*export DEBIAN_FRONTEND/m);
  assert.doesNotMatch(script, /as_root apt-get/);
});

test('installs only in --install mode and restarts the Debian cluster on resume', () => {
  assert.match(script, /rerun with --install/);
  assert.match(
    script,
    /pg_ctlcluster "\$\{postgres_major\}" "\$\{cluster_name\}" start/,
  );
  assert.match(
    script,
    /pg_isready -q -h "\$\{listen_address\}" -p "\$\{port\}"/,
  );
});

test('creates the least-privilege application role and both isolated databases idempotently', () => {
  assert.match(
    script,
    /SELECT 1 FROM pg_roles WHERE rolname = '\$\{database_user\}'/,
  );
  assert.match(
    script,
    /CREATE ROLE \$\{database_user\} WITH LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD/,
  );
  assert.match(
    script,
    /SELECT 1 FROM pg_database WHERE datname = '\$\{database\}'/,
  );
  assert.match(
    script,
    /CREATE DATABASE \$\{database\} OWNER \$\{database_user\} TEMPLATE template0/,
  );
  assert.match(script, /development_database='prisma_prim_dev'/);
  assert.match(script, /test_database='prisma_prim_test'/);
});

test('proves the application connection over loopback TCP before reporting readiness', () => {
  assert.match(script, /listen_address='127\.0\.0\.1'/);
  assert.match(script, /PGPASSWORD="\$\{database_password\}" psql -X -tA/);
  assert.match(script, /server_version_num/);
  assert.match(script, /\^\$\{postgres_major\}\[0-9\]\{4\}\$/);
});

test('exports the isolated targets for agent shells instead of requiring Codex environment variables', () => {
  assert.match(script, /postgres-runtime\.sh/);
  assert.match(script, /printf 'export DATABASE_URL=%q\\n'/);
  assert.match(script, /printf 'export TEST_DATABASE_URL=%q\\n'/);
  assert.match(script, /\$\{development_database\}"\n/);
  assert.match(script, /\$\{test_database\}"\n/);
  assert.match(
    script,
    /for shell_file in "\$\{HOME\}\/\.bashrc" "\$\{HOME\}\/\.profile"/,
  );
  assert.match(
    script,
    /grep -Fqx "\$\{bashrc_source_line\}" "\$\{shell_file\}"/,
  );
  assert.match(script, /persist_application_targets\n$/);
});

test('escalates only through non-interactive sudo when not already root', () => {
  assert.match(script, /sudo -n -- "\$@"/);
  assert.doesNotMatch(script, /sudo(?! -n)/);
});
