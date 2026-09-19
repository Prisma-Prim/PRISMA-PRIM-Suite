import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('Doctor finds the effective pnpm from a different working directory', () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./agent-doctor.mjs', import.meta.url)), '--json'],
    {
      cwd: tmpdir(),
      encoding: 'utf8',
      timeout: 30_000,
    },
  );
  const report = JSON.parse(result.stdout);
  assert.equal(
    report.checkout.path,
    fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]$/, ''),
  );
  assert.match(report.checkout.head, /^[a-f0-9]{40}$/);
  assert.equal(typeof report.checkout.changes, 'string');
  assert.equal(
    report.results.find((check) => check.id === 'pnpm').status,
    'PASS',
    result.stdout,
  );
});

test('requested browser and database prerequisites fail instead of silently skipping', () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('./agent-doctor.mjs', import.meta.url)),
      '--profile',
      'web-postgres',
      '--json',
    ],
    {
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...process.env,
        DATABASE_URL: '',
        TEST_DATABASE_URL: '',
        PLAYWRIGHT_BROWSERS_PATH: fileURLToPath(
          new URL('./missing-browser-for-doctor-test', import.meta.url),
        ),
      },
    },
  );
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  for (const id of ['chromium', 'database-variables']) {
    assert.equal(
      report.results.find((check) => check.id === id).status,
      'FAIL',
      result.stdout,
    );
  }
});
