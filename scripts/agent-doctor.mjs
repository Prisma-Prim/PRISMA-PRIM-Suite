import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  databaseTargetsAreSafe,
  parsePostgresDatabaseTarget,
} from '../apps/api/test-support/postgres-database-target.mjs';

export { databaseTargetsAreSafe };
export const parseDatabaseTarget = parsePostgresDatabaseTarget;

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

function requiresChromium(profile) {
  return profile === 'web' || profile === 'web-postgres';
}

function requiresPostgres(profile) {
  return profile === 'postgres' || profile === 'web-postgres';
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
  const pnpmProbe = snapshot.pnpmProbe ?? { state: 'missing' };
  const actualPnpm = parseVersion(pnpmProbe.version);
  const parsedRequiredPnpm = parseVersion(requiredPnpm);
  const needsChromium = requiresChromium(profile);
  const needsPostgres = requiresPostgres(profile);
  const developmentDatabase = parsePostgresDatabaseTarget(snapshot.databaseUrl);
  const testDatabase = parsePostgresDatabaseTarget(snapshot.testDatabaseUrl);
  const databaseVariablesValid =
    developmentDatabase !== null && testDatabase !== null;
  const databaseTargetsSafe = databaseTargetsAreSafe(
    snapshot.databaseUrl,
    snapshot.testDatabaseUrl,
  );

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
    evaluatePnpm(requiredPnpm, parsedRequiredPnpm, actualPnpm, pnpmProbe),
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
      needsPostgres && databaseVariablesValid
        ? databaseTargetsSafe
          ? 'PASS'
          : 'FAIL'
        : 'SKIP',
      needsPostgres
        ? !databaseVariablesValid
          ? 'Database target safety was not checked until both PostgreSQL URLs are valid.'
          : databaseTargetsSafe
            ? 'Development and test databases are distinct numeric-loopback targets; the test name ends in _test.'
            : 'Database targets must use numeric loopback addresses, remain distinct, and name the test database with a _test suffix.'
        : 'Database target safety is not required by the selected profile.',
      'Use the isolated prisma_prim_dev and prisma_prim_test targets documented for Codex Cloud.',
    ),
    evaluatePostgres(
      needsPostgres,
      databaseVariablesValid,
      databaseTargetsSafe,
      snapshot.postgresProbe ?? { state: 'not-run' },
    ),
  ];
}

function evaluatePnpm(requiredPnpm, parsedRequiredPnpm, actualPnpm, probe) {
  if (!requiredPnpm) {
    return result(
      'pnpm',
      'FAIL',
      'The packageManager declaration is not a supported pnpm version.',
      'Declare packageManager as pnpm@X.Y.Z.',
    );
  }

  if (probe.state === 'missing') {
    return result(
      'pnpm',
      'FAIL',
      `pnpm is not installed or not on PATH; repository expects ${requiredPnpm}.`,
      `Activate pnpm ${requiredPnpm} from package.json, then run pnpm --version.`,
    );
  }

  if (probe.state === 'sandbox-denied') {
    return result(
      'pnpm',
      'FAIL',
      `The harness sandbox denied the pnpm subprocess (${probe.detail ?? 'permission denied'}).`,
      `Verify the harness subprocess policy with corepack pnpm --version; use a permitted shell or update the sandbox policy before relying on pnpm checks.`,
    );
  }

  const versionMatches =
    probe.state === 'available' &&
    actualPnpm &&
    parsedRequiredPnpm &&
    compareVersions(actualPnpm, parsedRequiredPnpm) === 0;

  return result(
    'pnpm',
    versionMatches ? 'PASS' : 'FAIL',
    probe.state === 'available'
      ? `pnpm ${probe.version}; repository expects ${requiredPnpm}.`
      : `pnpm could not report its version (${probe.detail ?? 'unknown subprocess failure'}).`,
    `Activate pnpm ${requiredPnpm} from package.json before installing dependencies.`,
  );
}

function evaluatePostgres(
  required,
  databaseVariablesValid,
  databaseTargetsSafe,
  probe,
) {
  if (!required) {
    return result(
      'postgres',
      'SKIP',
      'PostgreSQL connectivity is not required by the selected profile.',
    );
  }

  if (!databaseVariablesValid || !databaseTargetsSafe) {
    return result(
      'postgres',
      'SKIP',
      'PostgreSQL connectivity was not attempted until database configuration is valid and safe.',
    );
  }

  switch (probe.state) {
    case 'available':
      return result(
        'postgres',
        'PASS',
        'The isolated PostgreSQL test database accepts a read-only connectivity probe.',
      );
    case 'tooling-missing':
      return result(
        'postgres',
        'FAIL',
        'The PostgreSQL connectivity probe tooling or bootstrap is missing or broken.',
        'Restore repository dependencies and the expected pnpm version, then retry the doctor.',
      );
    case 'sandbox-denied':
      return result(
        'postgres',
        'FAIL',
        `The harness sandbox denied the PostgreSQL probe subprocess (${probe.detail ?? 'permission denied'}).`,
        'Run the doctor in a harness that permits repository subprocesses or update the sandbox policy.',
      );
    case 'service-unavailable':
      return result(
        'postgres',
        'FAIL',
        `No PostgreSQL service is listening at the configured local target (${probe.detail ?? 'connection refused'}).`,
        'Start native PostgreSQL and retry the doctor, or run node scripts/managed-postgres.mjs -- node scripts/agent-doctor.mjs --profile postgres.',
      );
    case 'unreachable':
      return result(
        'postgres',
        'FAIL',
        `The configured PostgreSQL target is unreachable (${probe.detail ?? 'network failure'}).`,
        'Check the local PostgreSQL host and port, then retry the doctor.',
      );
    case 'connection-failed':
      return result(
        'postgres',
        'FAIL',
        `PostgreSQL rejected the connection (${probe.detail ?? 'connection failure'}).`,
        'Check that the local role, password, and database exist, then retry the doctor.',
      );
    default:
      return result(
        'postgres',
        'FAIL',
        'The PostgreSQL connectivity probe did not produce a result.',
        'Run the doctor again after pnpm and the local database configuration pass.',
      );
  }
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

function probePnpm() {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const command = run(executable, ['--version']);
  return classifyPnpmCommand(command);
}

export function classifyPnpmCommand(command) {
  if (command.error?.code === 'ENOENT') {
    return { state: 'missing' };
  }

  if (new Set(['EACCES', 'EPERM']).has(command.error?.code)) {
    return { state: 'sandbox-denied', detail: command.error.code };
  }

  if (command.status === 0 && command.stdout.trim()) {
    return { state: 'available', version: command.stdout.trim() };
  }

  return {
    state: 'failed',
    detail: command.error?.code ?? `exit ${command.status ?? 'unknown'}`,
  };
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

function probePostgres(testDatabaseUrl) {
  if (!testDatabaseUrl) {
    return { state: 'not-run' };
  }

  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const probe = [
    'const emit = (value) => process.stdout.write(JSON.stringify(value));',
    'let pg;',
    'try { pg = (await import("pg")).default; }',
    'catch (error) {',
    'emit({ phase: "bootstrap", state: ["EACCES", "EPERM"].includes(error?.code) ? "sandbox-denied" : "tooling-missing", code: error?.code ?? null });',
    'process.exit(1);',
    '}',
    'const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 3000 });',
    'try {',
    'await client.connect();',
    'const response = await client.query("SELECT current_setting(\'server_version_num\')::integer AS server_version_number, COALESCE((SELECT rolsuper OR rolcreatedb FROM pg_roles WHERE rolname = current_user), false) AS can_create_database");',
    'const capabilities = response.rows[0];',
    'const available = Number.isInteger(capabilities?.server_version_number) && typeof capabilities?.can_create_database === "boolean";',
    'emit({ phase: "query", state: available ? "available" : "connection-failed", code: available ? null : "unexpected-query-result", serverVersionNumber: capabilities?.server_version_number ?? null, canCreateDatabase: capabilities?.can_create_database ?? false });',
    'process.exitCode = available ? 0 : 1;',
    '} catch (error) {',
    'emit({ phase: "connect", state: ["EACCES", "EPERM"].includes(error?.code) ? "sandbox-denied" : "connection-failed", code: error?.code ?? null });',
    'process.exitCode = 1;',
    '}',
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

  return classifyPostgresCommand(command);
}

export function classifyPostgresCommand(command) {
  if (command.error?.code === 'ENOENT') {
    return { state: 'tooling-missing' };
  }

  if (new Set(['EACCES', 'EPERM']).has(command.error?.code)) {
    return { state: 'sandbox-denied', detail: command.error.code };
  }

  let payload;
  try {
    const serialized = command.stdout.match(/\{[^\n]*\}\s*$/)?.[0];
    payload = serialized ? JSON.parse(serialized) : null;
  } catch {
    payload = null;
  }

  if (payload?.state === 'sandbox-denied') {
    return { state: 'sandbox-denied', detail: payload.code ?? payload.phase };
  }

  if (payload?.state === 'tooling-missing' || !payload) {
    return {
      state: 'tooling-missing',
      detail: payload?.code ?? 'probe-bootstrap',
    };
  }

  if (command.status === 0 && payload.state === 'available') {
    return {
      state: 'available',
      serverVersionNumber: payload.serverVersionNumber,
      canCreateDatabase: payload.canCreateDatabase,
    };
  }

  const detail = payload.code;

  if (detail === 'ECONNREFUSED') {
    return { state: 'service-unavailable', detail };
  }

  if (
    new Set([
      'EAI_AGAIN',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'ENOTFOUND',
      'ETIMEDOUT',
    ]).has(detail)
  ) {
    return { state: 'unreachable', detail };
  }

  return {
    state: 'connection-failed',
    detail: detail ?? `probe exit ${command.status ?? 'unknown'}`,
  };
}

export function collectEnvironment(profile = 'base') {
  const packageJson = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
  );
  const needsChromium = requiresChromium(profile);
  const needsPostgres = requiresPostgres(profile);
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
  const databaseTargetsSafe = databaseTargetsAreSafe(
    databaseUrl,
    testDatabaseUrl,
  );
  const pnpmProbe = probePnpm();
  const dependenciesInstalled = existsSync(
    resolve(repositoryRoot, 'node_modules'),
  );
  let postgresProbe = { state: 'not-run' };
  if (needsPostgres && databaseTargetsSafe) {
    if (pnpmProbe.state === 'missing') {
      postgresProbe = { state: 'tooling-missing', detail: 'pnpm' };
    } else if (pnpmProbe.state === 'sandbox-denied') {
      postgresProbe = { state: 'sandbox-denied', detail: pnpmProbe.detail };
    } else if (!dependenciesInstalled) {
      postgresProbe = { state: 'tooling-missing', detail: 'dependencies' };
    } else {
      postgresProbe = probePostgres(testDatabaseUrl);
    }
  }

  return {
    nodeRange: packageJson.engines?.node ?? '',
    nodeVersion: process.version,
    packageManager: packageJson.packageManager ?? '',
    pnpmProbe,
    workspaceManifestExists: existsSync(
      resolve(repositoryRoot, 'pnpm-workspace.yaml'),
    ),
    lockfileExists: existsSync(resolve(repositoryRoot, 'pnpm-lock.yaml')),
    dependenciesInstalled,
    chromiumAvailable: needsChromium ? playwrightChromiumIsAvailable() : false,
    databaseUrl,
    testDatabaseUrl,
    postgresProbe,
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

  if (!new Set(['base', 'postgres', 'web', 'web-postgres']).has(profile)) {
    process.stderr.write(
      `Unknown profile: ${profile}. Expected base, postgres, web, or web-postgres.\n`,
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
