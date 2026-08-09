import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const setupScript = await readFile(
  new URL('./codex-cloud-setup.sh', import.meta.url),
  'utf8',
);
const maintenanceScript = await readFile(
  new URL('./codex-cloud-maintenance.sh', import.meta.url),
  'utf8',
);
const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);

test('keeps browser and PostgreSQL execution out of the standard Codex profile', () => {
  assert.doesNotMatch(maintenanceScript, /playwright install|chromium/i);
  assert.match(maintenanceScript, /profile="base"/);
  assert.equal(
    maintenanceScript.includes(
      'if [[ "${profile}" == "postgres" ]]; then',
    ),
    true,
  );
  assert.match(
    maintenanceScript,
    /agent-doctor\.mjs --profile "${profile}"/,
  );
});

test('installs PostgreSQL only for the explicit setup profile', () => {
  assert.equal(
    setupScript.includes(
      'if [[ "${profile}" == "postgres" ]]; then',
    ),
    true,
  );
  assert.equal(
    setupScript.includes(
      'maintenance_arguments+=(--profile postgres --install-system-dependencies)',
    ),
    true,
  );
});

test('reuses dependencies when their complete manifest fingerprint is unchanged', () => {
  assert.match(maintenanceScript, /\.codex-dependency-fingerprint/);
  assert.match(maintenanceScript, /git ls-files/);
  assert.match(
    maintenanceScript,
    /pnpm install --frozen-lockfile --prefer-offline/,
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
