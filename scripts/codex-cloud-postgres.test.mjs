import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const postgresSetupScript = await readFile(
  new URL('./codex-cloud-postgres.sh', import.meta.url),
  'utf8',
);

test('installs PostgreSQL non-interactively without recommended packages', () => {
  assert.match(
    postgresSetupScript,
    /DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends postgresql postgresql-client/,
  );
});
