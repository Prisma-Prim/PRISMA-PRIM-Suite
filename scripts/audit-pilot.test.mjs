import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createServer } from 'node:net';

const entry = fileURLToPath(new URL('./audit-pilot.mjs', import.meta.url));

test('the pilot CLI refuses a public host before starting any infrastructure', () => {
  const result = spawnSync(process.execPath, [entry, '--host', '0.0.0.0'], {
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, DATABASE_URL: 'private-target-must-not-be-printed' },
  });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /Unknown argument --host/u);
  assert.doesNotMatch(result.stdout + result.stderr, /private-target/u);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /migrat|createdb|docker/iu,
  );
});

test('the pilot refuses inherited nonlocal database targets without printing them', () => {
  const result = spawnSync(process.execPath, [entry, '--check'], {
    encoding: 'utf8',
    timeout: 5000,
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://private-canary:secret@example.test/live',
      TEST_DATABASE_URL:
        'postgresql://private-canary:secret@example.test/live_test',
    },
  });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /local disposable database/u);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /private-canary|secret|example\.test/u,
  );
});

test('an occupied application port is refused without replacing its listener', async () => {
  const owner = createServer();
  await new Promise((resolve, reject) => {
    owner.once('error', reject);
    owner.listen(4173, '127.0.0.1', resolve);
  });
  try {
    const result = spawnSync(process.execPath, [entry, '--check'], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, DATABASE_URL: '', TEST_DATABASE_URL: '' },
    });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /port 4173 is already in use/u);
    assert.equal(owner.listening, true);
  } finally {
    await new Promise((resolve, reject) =>
      owner.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
