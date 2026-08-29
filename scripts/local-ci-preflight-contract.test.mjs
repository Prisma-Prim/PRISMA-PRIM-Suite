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
    agentMetadata,
    pnpmLauncher,
    agents,
    gitignore,
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
    readFile(
      new URL('../.github/workflows/agent-metadata.yml', import.meta.url),
      'utf8',
    ),
    readFile(new URL('./agent-pnpm.sh', import.meta.url), 'utf8'),
    readFile(new URL('../AGENTS.md', import.meta.url), 'utf8'),
    readFile(new URL('../.gitignore', import.meta.url), 'utf8'),
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
  assert.match(earlyCi, /pull_request_target:/);
  assert.match(
    earlyCi,
    /types:\s*\[opened, reopened, synchronize, edited, labeled\]/,
  );
  assert.match(earlyCi, /github\.event\.label\.name == 'early-ci'/);
  assert.match(earlyCi, /github\.event\.action != 'labeled'/);
  assert.match(
    earlyCi,
    /contains\(github\.event\.pull_request\.body, '<!-- agent-doctor-early-ci: required -->'\)/,
  );
  assert.match(
    earlyCi,
    /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/,
  );
  assert.match(earlyCi, /github\.event\.pull_request\.head\.sha/);
  assert.match(earlyCi, /checkout_ref:/);
  assert.match(earlyCi, /statuses:\s*write/);
  assert.match(earlyCi, /context='Early CI preflight'/);
  assert.match(earlyCi, /state='pending'/);
  assert.match(earlyCi, /state='success'/);
  assert.match(earlyCi, /state='failure'/);
  assert.match(fullCi, /checkout_ref:/);
  assert.match(
    fullCi,
    /ref:\s*\$\{\{ inputs\.checkout_ref \|\| github\.sha \}\}/,
  );
  assert.match(fullCi, /git rev-parse HEAD/);
  assert.match(
    agentMetadata,
    /ensure_label\s+\\\s*'early-ci'\s+\\\s*'0E8A16'\s+\\\s*'Run exact-head PostgreSQL, migration, and browser preflight'/,
  );
  assert.equal(
    fullCi.match(/uses: \.\/\.github\/actions\/setup-verification/g)?.length,
    1,
  );
  assert.match(fullCi, /image: postgres:17-alpine/);
  assert.doesNotMatch(earlyCi, /postgres:17|DATABASE_URL/);
  assert.match(setup, /pnpm install --frozen-lockfile/);
  assert.match(setup, /playwright install --with-deps chromium/);
  assert.doesNotMatch(setup, /version:\s*11\.20\.0/);
  assert.match(pnpmLauncher, /--pm-on-fail=download/);
  assert.match(pnpmLauncher, /PRISMA_PRIM_PNPM_HOME/);
  assert.doesNotMatch(pnpmLauncher, /corepack enable|npm install --global/);
  assert.match(agents, /scripts\/agent-pnpm\.sh/);
  assert.match(gitignore, /^\.pnpm-home\/$/m);
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

test('Work mode publication consumes and waits for the Agent Doctor handoff', async () => {
  const issueExecution = await readFile(
    new URL('../docs/agents/issue-execution.md', import.meta.url),
    'utf8',
  );

  assert.match(issueExecution, /handoff\.state.*required/);
  assert.match(
    issueExecution,
    /same create or update\s+pull-request operation/,
  );
  assert.match(issueExecution, /exact PR head SHA/);
  assert.match(
    issueExecution,
    /handoff\.completion\.statusContext[\s\S]*success/,
  );
  assert.match(issueExecution, /without asking a human/u);
});
