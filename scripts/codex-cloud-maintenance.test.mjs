import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const maintenanceScript = await readFile(
  new URL('./codex-cloud-maintenance.sh', import.meta.url),
  'utf8',
);

test('keeps browser installation out of the standard Codex environment', () => {
  assert.doesNotMatch(maintenanceScript, /playwright install|chromium/i);
  assert.match(
    maintenanceScript,
    /agent-doctor\.mjs --profile postgres/,
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
  assert.match(
    maintenanceScript,
    /Codex environment preparation completed in/,
  );
});
