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
      Boolean(
        requiredPnpm &&
        actualPnpm &&
        parsedRequiredPnpm &&
        compareVersions(actualPnpm, parsedRequiredPnpm) === 0,
      )
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
      profile === 'web'
        ? snapshot.chromiumAvailable
          ? 'PASS'
          : 'FAIL'
        : 'SKIP',
      profile === 'web'
        ? snapshot.chromiumAvailable
          ? 'Playwright Chromium is installed and executable.'
          : 'Playwright Chromium is missing or not executable.'
        : 'Playwright Chromium is not required by the base profile.',
      'Run pnpm --filter @prisma-prim/web exec playwright install --with-deps chromium.',
    ),
  ];
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false,
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

export function collectEnvironment(profile = 'base') {
  const packageJson = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
  );

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
    chromiumAvailable:
      profile === 'web' ? playwrightChromiumIsAvailable() : false,
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

  if (!new Set(['base', 'web']).has(profile)) {
    process.stderr.write(
      `Unknown profile: ${profile}. Expected base or web.\n`,
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
