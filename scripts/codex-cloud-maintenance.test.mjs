import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { runCloudScript } from './codex-cloud-test-support.mjs';

const maintenanceScript = await readFile(
  new URL('./codex-cloud-maintenance.sh', import.meta.url),
  'utf8',
);
const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
const gitignore = await readFile(
  new URL('../.gitignore', import.meta.url),
  'utf8',
);

const doctorCall = (profile, ...extra) =>
  ['pnpm exec node scripts/agent-doctor.mjs --profile', profile, ...extra].join(
    ' ',
  );

test('keeps browser and PostgreSQL execution out of the standard Codex profile', async () => {
  const result = await runCloudScript('codex-cloud-setup.sh');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [
    'pnpm --version',
    'pnpm install --frozen-lockfile --prefer-offline',
    doctorCall('base'),
    'doctor-target []',
  ]);
});

test('sets up web-postgres and leaves no PostgreSQL server running', async () => {
  const result = await runCloudScript('codex-cloud-setup.sh', [
    '--profile',
    'web-postgres',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [
    'pnpm --version',
    'pnpm install --frozen-lockfile --prefer-offline',
    'pnpm --filter @prisma-prim/web exec playwright install chromium',
    'postgres --install',
    doctorCall('web-postgres', '--readiness-profile cloud'),
    'doctor-target [stub_test]',
    'postgres --stop',
  ]);
});

test('stops PostgreSQL when the web-postgres doctor fails', async () => {
  const result = await runCloudScript(
    'codex-cloud-setup.sh',
    ['--profile', 'web-postgres'],
    { doctorStatus: 1 },
  );
  assert.equal(result.status, 1);
  assert.equal(result.calls.at(-1), 'postgres --stop');
  assert.equal(
    result.calls.filter((call) => call === 'postgres --stop').length,
    1,
  );
});

test('restores web-postgres on maintenance without installing system packages', async () => {
  const result = await runCloudScript('codex-cloud-maintenance.sh', [
    '--profile',
    'web-postgres',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.slice(2), [
    'pnpm --filter @prisma-prim/web exec playwright install chromium',
    'postgres --start',
    doctorCall('web-postgres', '--readiness-profile cloud'),
    'doctor-target [stub_test]',
    'postgres --stop',
  ]);
});

test('keeps the postgres profile server running for local harnesses', async () => {
  const result = await runCloudScript('codex-cloud-setup.sh', [
    '--profile',
    'postgres',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.slice(2), [
    'postgres --install',
    doctorCall('postgres'),
    'doctor-target [stub_test]',
  ]);
});

test('sources the installer-provided database targets before the postgres doctor', () => {
  const sourceLine = maintenanceScript.indexOf(
    'source "${HOME}/.config/prisma-prim/postgres-runtime.sh"',
  );
  const doctor = maintenanceScript.indexOf(
    'agent-doctor.mjs "${doctor_arguments[@]}"',
  );
  assert.notEqual(sourceLine, -1);
  assert.ok(sourceLine < doctor, 'targets must be exported before the doctor');
  assert.doesNotMatch(maintenanceScript, /DATABASE_URL=/);
});

test('rejects unknown setup profiles before preparing anything', async () => {
  const result = await runCloudScript('codex-cloud-setup.sh', [
    '--profile',
    'web',
  ]);
  assert.equal(result.status, 2);
  assert.match(
    result.stderr,
    /Usage: bash scripts\/codex-cloud-setup\.sh \[--profile base\|postgres\|web-postgres\]/,
  );
  assert.deepEqual(result.calls, []);
});

test('activates and persists the repository Node runtime before pnpm', () => {
  assert.match(maintenanceScript, /expected_node=.*\.node-version/);
  assert.match(maintenanceScript, /nvm version "\$\{expected_node\}"/);
  assert.match(maintenanceScript, /nvm install "\$\{expected_node\}"/);
  assert.match(maintenanceScript, /nvm alias default "\$\{expected_node\}"/);
  assert.match(maintenanceScript, /node-runtime\.sh/);
  assert.match(maintenanceScript, /\.bashrc/);
  assert.ok(
    maintenanceScript.indexOf('Activate Node ${expected_node}') <
      maintenanceScript.indexOf('Activate pnpm ${expected_pnpm}'),
  );
  assert.match(gitignore, /^\.nvmrc$/m);
});

test('activates the effective pinned pnpm without a system-global mutation', () => {
  assert.match(maintenanceScript, /effective_pnpm_version/);
  assert.match(maintenanceScript, /agent-pnpm\.sh --version/);
  assert.equal(maintenanceScript.match(/effective_pnpm_version\)/g)?.length, 1);
  assert.doesNotMatch(maintenanceScript, /corepack enable/);
  assert.doesNotMatch(maintenanceScript, /npm install --global/);
});

test('reuses dependencies when their complete manifest fingerprint is unchanged', () => {
  assert.match(maintenanceScript, /\.codex-dependency-fingerprint/);
  assert.match(maintenanceScript, /git ls-files/);
  assert.match(
    maintenanceScript,
    /agent-pnpm\.sh install --frozen-lockfile --prefer-offline/,
  );
});

test('reports the duration of each setup phase', () => {
  assert.match(maintenanceScript, /run_step/);
  assert.match(maintenanceScript, /Codex environment preparation completed in/);
});

test('provides browser-free repository verification for standard agents', () => {
  assert.match(packageJson.scripts['test:unit'], /vitest run/);
  assert.doesNotMatch(packageJson.scripts['test:unit'], /playwright/);
  assert.match(packageJson.scripts.test, /recursive test/);
});
