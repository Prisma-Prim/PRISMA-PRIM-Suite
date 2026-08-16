import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('local and early CI preflight share the canonical PostgreSQL and Playwright scripts', async () => {
  const [packageJsonText, earlyCi, fullCi] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(
      new URL('../.github/workflows/early-ci.yml', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
  ]);
  const packageJson = JSON.parse(packageJsonText);

  assert.equal(
    packageJson.scripts['preflight:local'],
    'node scripts/local-ci-preflight.mjs',
  );
  for (const script of [
    'test:preflight:postgres',
    'test:preflight:playwright',
  ]) {
    assert.equal(typeof packageJson.scripts[script], 'string');
    assert.match(earlyCi, new RegExp(`pnpm ${script.replaceAll(':', '\\:')}`));
  }
  assert.match(
    fullCi,
    /pnpm test:preflight:postgres[\s\S]*pnpm test:preflight:playwright/,
  );
});

test('the destructive migration preflight is serial and excluded from the parallel API phase', async () => {
  const apiPackage = JSON.parse(
    await readFile(
      new URL('../apps/api/package.json', import.meta.url),
      'utf8',
    ),
  );

  assert.match(
    apiPackage.scripts['test:parallel'],
    /--exclude src\/database\/previous-schema\.migration\.test\.ts/,
  );
  assert.match(
    apiPackage.scripts['test:postgres:serial'],
    /--no-file-parallelism/,
  );
  assert.match(
    apiPackage.scripts['test:postgres:serial'],
    /src\/database\/previous-schema\.migration\.test\.ts/,
  );
});
