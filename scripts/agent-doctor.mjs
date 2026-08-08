import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), '..');

export function parseVersion(value) {
  const match = String(value)
    .trim()
    .match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);

  if (!match) {
    return null;
  }

  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

export function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] > right[index] ? 1 : -1;
    }
  }

  return 0;
}

export function minimumVersion(range) {
  const match = String(range)
    .trim()
    .match(/^>=\s*(v?\d+(?:\.\d+){0,2})(?:\s+<\s*v?\d+(?:\.\d+){0,2})?$/);
  return match ? parseVersion(match[1]) : null;
}

export function maximumExclusiveVersion(range) {
  const match = String(range)
    .trim()
    .match(/<\s*(v?\d+(?:\.\d+){0,2})$/);
  return match ? parseVersion(match[1]) : null;
}

export function packageManagerVersion(packageManager) {
  const match = String(packageManager)
    .trim()
    .match(/^pnpm@(\d+(?:\.\d+){2})$/);
  return match?.[1] ?? null;
}

export function parseDatabaseTarget(value) {
  try {
    const url = new URL(String(value));
    if (!new Set(['postgres:', 'postgresql:']).has(url.protocol)) {
      return null;
    }

    const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    if (!database || database.includes('/')) {
      return null;
    }

    return {
      database,
      hostname: url.hostname,
      port: url.port || '5432',
    };
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname) {
  return new Set(['127.0.0.1', 'localhost', '[::1]']).has(hostname);
}

function requiresChromium(profile) {
  return profile === 'web' || profile === 'web-postgres';
}

function requiresPostgres(profile) {
  return profile === 'web-postgres';
}

function result(id, status, summary, remediation = null) {
  return {
    id,
    status,
    summary,
    remediation: status === 'FAIL' ? remediation : null,
  };
}

export function evaluateEnvironment(snapshot, profile = 'base') {
  const requiredNode = minimumVersion(snapshot.nodeRange);
  const maximumNode = maximumExclusiveVersion(snapshot.nodeRange);
  const actualNode = parseVersion(snapshot.nodeVersion);
  const requiredPnpm = packageManagerVersion(snapshot.packageManager);
  const actualPnpm = parseVersion(snapshot.pnpmVersion);
  const parsedRequiredPnpm = parseVersion(requiredPnpm);
  const needsChromium = requiresChromium(profile);
  const needsPostgres = requiresPostgres(profile);
  const developmentDatabase = parseDatabaseTarget(snapshot.databaseUrl);
  const testDatabase = parseDatabaseTarget(snapshot.testDatabaseUrl);
  const databaseVariablesValid =
    developmentDatabase !== null && testDatabase !== null;
  const databaseTargetsSafe =
    databaseVariablesValid &&
    isLoopbackHost(developmentDatabase.hostname) &&
    isLoopbackHost(testDatabase.hostname) &&
    developmentDatabase.database !== testDatabase.database &&
    testDatabase.database.endsWith('_test');

  return [
    result(
      'node',
      requiredNode &&
        actualNode &&
        compareVersions(actualNode, requiredNode) >= 0 &&
        (!maximumNode || compareVersions(actualNode, maximumNode) < 0)
        ? 'PASS'
        : 'FAIL',
      requiredNode && actualNode
        ? `Node ${snapshot.nodeVersion} is checked against ${snapshot.nodeRange}.`
        : `Unsupported Node engine declaration: ${snapshot.nodeRange}.`,
      requiredNode
        ? `Install a Node version satisfying ${snapshot.nodeRange}, then restart the harness session.`
        : 'Declare the Node engine as a simple minimum range such as >=24.0.0.',
    ),
    result(
      'pnpm',
      requiredPnpm &&
        actualPnpm &&
        parsedRequiredPnpm &&
        compareVersions(actualPnpm, parsedRequiredPnpm) === 0
        ? 'PASS'
        : 'FAIL',
      requiredPnpm
        ? `pnpm ${snapshot.pnpmVersion || 'is unavailable'}; repository expects ${requiredPnpm}.`
        : `Unsupported packageManager declaration: ${snapshot.packageManager}.`,
      requiredPnpm
        ? `Activate pnpm ${requiredPnpm} from package.json before installing dependencies.`
        : 'Declare packageManager as pnpm@X.Y.Z.',
    ),
    result(
      'workspace',
      snapshot.workspaceManifestExists ? 'PASS' : 'FAIL',
      snapshot.workspaceManifestExists
        ? 'pnpm-workspace.yaml is present.'
        : 'pnpm-workspace.yaml is missing.',
      'Run the doctor from a complete repository checkout.',
    ),
    result(
      'lockfile',
      snapshot.lockfileExists ? 'PASS' : 'FAIL',
      snapshot.lockfileExists
        ? 'pnpm-lock.yaml is present.'
        : 'pnpm-lock.yaml is missing.',
      'Restore the committed lockfile before installing dependencies.',
    ),
    result(
      'dependencies',
      snapshot.dependenciesInstalled ? 'PASS' : 'FAIL',
      snapshot.dependenciesInstalled
        ? 'The root node_modules directory is present.'
        : 'The root node_modules directory is missing.',
      'Run pnpm install --frozen-lockfile.',
    ),
    result(
      'chromium',
      needsChromium ? (snapshot.chromiumAvailable ? 'PASS' : 'FAIL') : 'SKIP',
      needsChromium
        ? snapshot.chromiumAvailable
          ? 'Playwright Chromium is installed and executable.'
          : 'Playwright Chromium is missing or not executable.'
        : 'Playwright Chromium is not required by the selected profile.',
      'Run pnpm --filter @prisma-prim/web exec playwright install --with-deps chromium.',
    ),
    result(
      'database-variables',
      needsPostgres ? (databaseVariablesValid ? 'PASS' : 'FAIL') : 'SKIP',
      needsPostgres
        ? databaseVariablesValid
          ? 'DATABASE_URL and TEST_DATABASE_URL contain valid PostgreSQL targets.'
          : 'DATABASE_URL or TEST_DATABASE_URL is missing or invalid.'
        : 'Database variables are not required by the selected profile.',
      'Configure both PostgreSQL URLs as Codex environment variables.',
    ),
    result(
      'database-safety',
      needsPostgres ? (databaseTargetsSafe ? 'PASS' : 'FAIL') : 'SKIP',
      needsPostgres
        ? databaseTargetsSafe
          ? 'Development and test databases are distinct local targets; the test name ends in _test.'
          : 'Database targets must be local, distinct, and the test database name must end in _test.'
        : 'Database target safety is not required by the selected profile.',
      'Use the isolated prisma_prim_dev and prisma_prim_test targets documented for Codex Cloud.',
    ),
    result(
      'postgres',
      needsPostgres ? (snapshot.postgresAvailable ? 'PASS' : 'FAIL') : 'SKIP',
      needsPostgres
        ? snapshot.postgresAvailable
          ? 'The isolated PostgreSQL test database accepts a read-only connectivity probe.'
          : 'The isolated PostgreSQL test database is unavailable.'
        : 'PostgreSQL connectivity is not required by the selected profile.',
      'Run bash scripts/codex-cloud-maintenance.sh, then retry the doctor.',
    ),
  ];
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false,
    timeout: 10_000,
    ...options,
  });
}

function installedPnpmVersion() {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const command = run(executable, ['--version']);
  return command.status === 0 ? command.stdout.trim() : '';
}

function playwrightChromiumIsAvailable() {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const probe = [
    'import { existsSync } from "node:fs";',
    'import { chromium } from "@playwright/test";',
    'process.exit(existsSync(chromium.executablePath()) ? 0 : 1);',
  ].join(' ');
  const command = run(executable, [
    '--filter',
    '@prisma-prim/web',
    'exec',
    'node',
    '--input-type=module',
    '--eval',
    probe,
  ]);

  return command.status === 0;
}

function postgresIsAvailable(testDatabaseUrl) {
  if (!testDatabaseUrl) {
    return false;
  }

  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const probe = [
    'import pg from "pg";',
    'const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 3000 });',
    'try {',
    'await client.connect();',
    'const response = await client.query("SELECT 1 AS ok");',
    'process.exitCode = response.rows[0]?.ok === 1 ? 0 : 1;',
    '} catch { process.exitCode = 1; }',
    'finally { await client.end().catch(() => undefined); }',
  ].join(' ');
  const command = run(
    executable,
    [
      '--filter',
      '@prisma-prim/api',
      'exec',
      'node',
      '--input-type=module',
      '--eval',
      probe,
    ],
    {
      env: { ...process.env, TEST_DATABASE_URL: testDatabaseUrl },
    },
  );

  return command.status === 0;
}

export function collectEnvironment(profile = 'base') {
  const packageJson = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
  );
  const needsChromium = requiresChromium(profile);
  const needsPostgres = requiresPostgres(profile);
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';

  return {
    nodeRange: packageJson.engines?.node ?? '',
    nodeVersion: process.version,
    packageManager: packageJson.packageManager ?? '',
    pnpmVersion: installedPnpmVersion(),
    workspaceManifestExists: existsSync(
      resolve(repositoryRoot, 'pnpm-workspace.yaml'),
    ),
    lockfileExists: existsSync(resolve(repositoryRoot, 'pnpm-lock.yaml')),
    dependenciesInstalled: existsSync(resolve(repositoryRoot, 'node_modules')),
    chromiumAvailable: needsChromium ? playwrightChromiumIsAvailable() : false,
    databaseUrl,
    testDatabaseUrl,
    postgresAvailable: needsPostgres
      ? postgresIsAvailable(testDatabaseUrl)
      : false,
  };
}

export function formatResults(results) {
  return results
    .flatMap((check) => {
      const lines = [`${check.status} ${check.id}: ${check.summary}`];
      if (check.remediation) {
        lines.push(`  Fix: ${check.remediation}`);
      }
      return lines;
    })
    .join('\n');
}

export function main() {
  const profileIndex = process.argv.indexOf('--profile');
  const profile = profileIndex >= 0 ? process.argv[profileIndex + 1] : 'base';
  const json = process.argv.includes('--json');

  if (!new Set(['base', 'web', 'web-postgres']).has(profile)) {
    process.stderr.write(
      `Unknown profile: ${profile}. Expected base, web, or web-postgres.\n`,
    );
    process.exitCode = 2;
    return;
  }

  const results = evaluateEnvironment(collectEnvironment(profile), profile);
  process.stdout.write(
    `${json ? JSON.stringify({ profile, results }, null, 2) : formatResults(results)}\n`,
  );

  if (results.some((check) => check.status === 'FAIL')) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main();
}
