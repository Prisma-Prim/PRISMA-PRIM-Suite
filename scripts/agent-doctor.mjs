import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  databaseTargetsAreSafe,
  parsePostgresDatabaseTarget,
} from '../apps/api/test-support/postgres-database-target.mjs';
import { collectEnvironmentSnapshot } from './agent-doctor-system-adapter.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const minimumPostgresServerVersion = 170011;
const maximumExclusivePostgresServerVersion = 180000;
const supportedPostgresServerVersion = `>= ${minimumPostgresServerVersion} and < ${maximumExclusivePostgresServerVersion}`;

function parseVersion(value) {
  const match = String(value)
    .trim()
    .match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);

  if (!match) {
    return null;
  }

  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] > right[index] ? 1 : -1;
    }
  }

  return 0;
}

function minimumVersion(range) {
  const match = String(range)
    .trim()
    .match(/^>=\s*(v?\d+(?:\.\d+){0,2})(?:\s+<\s*v?\d+(?:\.\d+){0,2})?$/);
  return match ? parseVersion(match[1]) : null;
}

function maximumExclusiveVersion(range) {
  const match = String(range)
    .trim()
    .match(/<\s*(v?\d+(?:\.\d+){0,2})$/);
  return match ? parseVersion(match[1]) : null;
}

function packageManagerVersion(packageManager) {
  const match = String(packageManager)
    .trim()
    .match(/^pnpm@(\d+(?:\.\d+){2})$/);
  return match?.[1] ?? null;
}

function versionSatisfiesRange(version, minimum, maximumExclusive) {
  return (
    version !== null &&
    minimum !== null &&
    compareVersions(version, minimum) >= 0 &&
    (maximumExclusive === null ||
      compareVersions(version, maximumExclusive) < 0)
  );
}

function requiresChromium(profile) {
  return profile === 'web' || profile === 'web-postgres';
}

function requiresPostgres(profile) {
  return profile === 'postgres' || profile === 'web-postgres';
}

function result(
  id,
  status,
  summary,
  remediation = null,
  { ciRecoverable = false } = {},
) {
  return {
    id,
    status,
    ciRecoverable,
    summary,
    remediation: status === 'FAIL' ? remediation : null,
  };
}

function evaluateNode(snapshot) {
  const requiredNode = minimumVersion(snapshot.nodeRange);
  const maximumNode = maximumExclusiveVersion(snapshot.nodeRange);
  const actualNode = parseVersion(snapshot.nodeVersion);
  const pinnedNode = parseVersion(snapshot.pinnedNodeVersion);

  if (!requiredNode) {
    return result(
      'node',
      'FAIL',
      `Unsupported Node engine declaration: ${snapshot.nodeRange}.`,
      'Declare the Node engine as a simple minimum range such as >=24.0.0.',
    );
  }

  if (!pinnedNode) {
    return result(
      'node',
      'FAIL',
      `Unsupported pinned Node version: ${snapshot.pinnedNodeVersion}.`,
      'Pin a numeric Node selector such as 24 or X.Y.Z in .node-version.',
    );
  }

  if (!versionSatisfiesRange(pinnedNode, requiredNode, maximumNode)) {
    return result(
      'node',
      'FAIL',
      `Pinned Node ${snapshot.pinnedNodeVersion} does not satisfy ${snapshot.nodeRange}.`,
      'Align .node-version with the Node engine declared in package.json.',
    );
  }

  const hostSatisfiesRange = versionSatisfiesRange(
    actualNode,
    requiredNode,
    maximumNode,
  );
  return result(
    'node',
    hostSatisfiesRange ? 'PASS' : 'FAIL',
    actualNode
      ? `Node ${snapshot.nodeVersion} is checked against ${snapshot.nodeRange}; CI pins ${snapshot.pinnedNodeVersion}.`
      : `The host Node version could not be parsed: ${snapshot.nodeVersion}.`,
    `Install a Node version satisfying ${snapshot.nodeRange}, then restart the harness session.`,
    { ciRecoverable: true },
  );
}

export function evaluateEnvironment(snapshot, profile = 'base') {
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

  const checks = [
    evaluateNode(snapshot),
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
      'Run bash scripts/agent-pnpm.sh install --frozen-lockfile.',
      { ciRecoverable: true },
    ),
    result(
      'chromium',
      needsChromium ? (snapshot.chromiumAvailable ? 'PASS' : 'FAIL') : 'SKIP',
      needsChromium
        ? snapshot.chromiumAvailable
          ? 'Playwright Chromium is installed and executable.'
          : 'Playwright Chromium is missing or not executable.'
        : 'Playwright Chromium is not required by the selected profile.',
      `Run bash scripts/agent-pnpm.sh --filter @prisma-prim/web exec playwright install --with-deps chromium.`,
      { ciRecoverable: true },
    ),
    result(
      'database-variables',
      needsPostgres ? (databaseVariablesValid ? 'PASS' : 'FAIL') : 'SKIP',
      needsPostgres
        ? databaseVariablesValid
          ? 'DATABASE_URL and TEST_DATABASE_URL contain valid PostgreSQL targets.'
          : 'DATABASE_URL or TEST_DATABASE_URL is missing or invalid.'
        : 'Database variables are not required by the selected profile.',
      `Configure both PostgreSQL URLs as documented isolated local targets.`,
      { ciRecoverable: true },
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
      `Use the isolated prisma_prim_dev and prisma_prim_test targets documented for Codex Cloud.`,
      { ciRecoverable: true },
    ),
    evaluatePostgres(
      needsPostgres,
      databaseVariablesValid,
      databaseTargetsSafe,
      snapshot.postgresProbe ?? { state: 'not-run' },
    ),
  ];

  return {
    checks,
    capabilities: {
      postgres: snapshot.postgresProbe ?? { state: 'not-run' },
    },
  };
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
      `Install a pnpm launcher, then run bash scripts/agent-pnpm.sh --version to activate ${requiredPnpm}.`,
      { ciRecoverable: true },
    );
  }

  if (probe.state === 'sandbox-denied') {
    return result(
      'pnpm',
      'FAIL',
      `The harness sandbox denied the pnpm subprocess (${probe.detail ?? 'permission denied'}).`,
      `Verify the harness subprocess policy with corepack pnpm --version; use a permitted shell or update the sandbox policy before relying on pnpm checks.`,
      { ciRecoverable: true },
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
    `Run repository commands through bash scripts/agent-pnpm.sh to activate pnpm ${requiredPnpm} without a system-global install.`,
    { ciRecoverable: probe.state === 'available' },
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
      null,
      { ciRecoverable: true },
    );
  }

  switch (probe.state) {
    case 'available': {
      const detectedVersion = probe.serverVersionNumber;
      const supportedVersion =
        Number.isInteger(detectedVersion) &&
        detectedVersion >= minimumPostgresServerVersion &&
        detectedVersion < maximumExclusivePostgresServerVersion;

      return result(
        'postgres',
        supportedVersion ? 'PASS' : 'FAIL',
        `The isolated PostgreSQL test database accepts a read-only connectivity probe; expected server_version_num ${supportedPostgresServerVersion}, detected ${String(detectedVersion)}.`,
        `Provision PostgreSQL 17.11+ within major 17, then retry the doctor.`,
        { ciRecoverable: !supportedVersion },
      );
    }
    case 'tooling-missing':
      return result(
        'postgres',
        'FAIL',
        'The PostgreSQL connectivity probe tooling or bootstrap is missing or broken.',
        `Restore repository dependencies and the expected pnpm version, then retry the doctor.`,
        {
          ciRecoverable: ['dependencies', 'pnpm'].includes(probe.detail),
        },
      );
    case 'sandbox-denied':
      return result(
        'postgres',
        'FAIL',
        `The harness sandbox denied the PostgreSQL probe subprocess (${probe.detail ?? 'permission denied'}).`,
        `Run the doctor in a harness that permits repository subprocesses or update the sandbox policy.`,
        { ciRecoverable: true },
      );
    case 'service-unavailable':
      return result(
        'postgres',
        'FAIL',
        `No PostgreSQL service is listening at the configured local target (${probe.detail ?? 'connection refused'}).`,
        `Start native PostgreSQL and retry the doctor, or run node scripts/managed-postgres.mjs -- node scripts/agent-doctor.mjs --profile postgres.`,
        { ciRecoverable: true },
      );
    case 'unreachable':
      return result(
        'postgres',
        'FAIL',
        `The configured PostgreSQL target is unreachable (${probe.detail ?? 'network failure'}).`,
        `Check the local PostgreSQL host and port, then retry the doctor.`,
        { ciRecoverable: true },
      );
    case 'connection-failed':
      return result(
        'postgres',
        'FAIL',
        `PostgreSQL rejected the connection (${probe.detail ?? 'connection failure'}).`,
        `Check that the local role, password, and database exist, then retry the doctor.`,
        { ciRecoverable: true },
      );
    default:
      return result(
        'postgres',
        'FAIL',
        'The PostgreSQL connectivity probe did not produce a result.',
        `Run the doctor again after pnpm and the local database configuration pass.`,
      );
  }
}

export function inspectEnvironment(profile = 'base') {
  const snapshot = collectEnvironmentSnapshot({
    needsChromium: requiresChromium(profile),
    needsPostgres: requiresPostgres(profile),
  });

  return evaluateEnvironment(snapshot, profile);
}

function formatResults(results) {
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

function main() {
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

  const report = inspectEnvironment(profile);
  const results = report.checks;
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
