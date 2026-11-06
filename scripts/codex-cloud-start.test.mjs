import assert from 'node:assert/strict';
import test from 'node:test';

import { runCloudScript } from './codex-cloud-test-support.mjs';

test('starts PostgreSQL and proves web-postgres readiness without installing anything', async () => {
  const result = await runCloudScript('codex-cloud-start.sh');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [
    'postgres --start',
    'pnpm exec node scripts/agent-doctor.mjs --profile web-postgres --readiness-profile cloud',
    'doctor-target [stub_test]',
  ]);
});

test('reports a failed readiness check with a non-zero exit', async () => {
  const result = await runCloudScript('codex-cloud-start.sh', [], {
    doctorStatus: 1,
  });
  assert.equal(result.status, 1);
});

test('refuses to start before setup has prepared the environment', async () => {
  const result = await runCloudScript('codex-cloud-start.sh', [], {
    preparedNodeRuntime: false,
  });
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /bash scripts\/codex-cloud-setup\.sh --profile web-postgres/,
  );
  assert.deepEqual(result.calls, []);
});
