import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { classifyPnpmCommand } from './agent-doctor-system-adapter.mjs';

test('reads the effective pnpm version from the package-manager user agent', () => {
  assert.deepEqual(
    classifyPnpmCommand({
      status: 0,
      stdout: 'pnpm/11.20.0 npm/? node/v24.19.0 linux x64\n',
    }),
    { state: 'available', version: '11.20.0' },
  );
});

test('fails closed when the effective pnpm identity is absent', () => {
  assert.deepEqual(classifyPnpmCommand({ status: 0, stdout: 'unexpected\n' }), {
    state: 'failed',
    detail: 'unparseable-package-manager-user-agent',
  });
});

test('preserves missing and sandbox-denied pnpm classifications', () => {
  assert.deepEqual(classifyPnpmCommand({ error: { code: 'ENOENT' } }), {
    state: 'missing',
  });
  assert.deepEqual(classifyPnpmCommand({ error: { code: 'EPERM' } }), {
    state: 'sandbox-denied',
    detail: 'EPERM',
  });
});

test('collects the repository Node pin separately from the host runtime', async () => {
  const adapter = await readFile(
    new URL('./agent-doctor-system-adapter.mjs', import.meta.url),
    'utf8',
  );

  assert.match(adapter, /pinnedNodeVersion:/);
  assert.match(adapter, /readRepositoryText\('\.node-version'\)/);
  assert.match(adapter, /nodeVersion:\s*process\.version/);
});
