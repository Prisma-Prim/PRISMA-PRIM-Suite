import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('local and early CI preflight share the canonical PostgreSQL and Playwright scripts', async () => {
  const [
    packageJsonText,
    apiPackageText,
    webPackageText,
    setup,
    earlyCi,
    fullCi,
  ] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../apps/api/package.json', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/package.json', import.meta.url), 'utf8'),
    readFile(
      new URL(
        '../.github/actions/setup-verification/action.yml',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL('../.github/workflows/early-ci.yml', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
  ]);
  const packageJson = JSON.parse(packageJsonText);
  const apiPackage = JSON.parse(apiPackageText);
  const webPackage = JSON.parse(webPackageText);

  assert.equal(
    packageJson.scripts['preflight:local'],
    'node scripts/local-ci-preflight.mjs',
  );
  for (const script of [
    'test:preflight:postgres-smoke',
    'test:preflight:migration',
    'test:preflight:playwright',
  ]) {
    assert.equal(typeof packageJson.scripts[script], 'string');
    assert.match(fullCi, new RegExp(`pnpm ${script.replaceAll(':', '\\:')}`));
  }
  assert.match(fullCi, /workflow_call:/);
  assert.match(fullCi, /run: pnpm test/);
  assert.match(apiPackage.scripts.test, /test:postgres:serial/);
  assert.match(webPackage.scripts.test, /playwright test/);
  assert.equal(
    earlyCi.match(/uses: \.\/\.github\/workflows\/ci\.yml/g)?.length,
    1,
  );
  assert.match(earlyCi, /mode: preflight/);
  assert.equal(
    fullCi.match(/uses: \.\/\.github\/actions\/setup-verification/g)?.length,
    1,
  );
  assert.match(fullCi, /image: postgres:17-alpine/);
  assert.doesNotMatch(earlyCi, /postgres:17|DATABASE_URL/);
  assert.match(setup, /pnpm install --frozen-lockfile/);
  assert.match(setup, /playwright install --with-deps chromium/);
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
  assert.match(
    apiPackage.scripts['test:preflight:migration'],
    /--no-file-parallelism/,
  );
  assert.match(
    apiPackage.scripts['test:preflight:migration'],
    /src\/database\/previous-schema\.migration\.test\.ts/,
  );
  assert.match(
    apiPackage.scripts['test:preflight:postgres-smoke'],
    /src\/company\/company\.rest\.test\.ts/,
  );
});
