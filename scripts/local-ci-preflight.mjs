import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectEnvironment, evaluateEnvironment } from './agent-doctor.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const earlyCiCommand = 'gh workflow run early-ci.yml --ref <branch>';

const seamDefinitions = [
  {
    id: 'postgres-smoke',
    group: 'postgres',
    command: 'test:preflight:postgres',
  },
  {
    id: 'previous-schema-migration',
    group: 'migration',
    command: 'test:preflight:postgres',
  },
  {
    id: 'playwright-desktop',
    group: 'browser',
    command: 'test:preflight:playwright',
  },
  {
    id: 'playwright-narrow',
    group: 'browser',
    command: 'test:preflight:playwright',
  },
];

const sharedPrerequisites = [
  'node',
  'pnpm',
  'workspace',
  'lockfile',
  'dependencies',
];
const groupPrerequisites = {
  postgres: ['database-variables', 'database-safety', 'postgres'],
  migration: [
    'database-variables',
    'database-safety',
    'postgres',
    'migration-manifest',
  ],
  browser: ['chromium'],
};

export function collectPreflightChecks() {
  const journalPath = resolve(
    repositoryRoot,
    'apps/api/drizzle/meta/_journal.json',
  );
  let migrationManifestAvailable;
  try {
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    migrationManifestAvailable =
      journal.entries.length > 1 &&
      journal.entries.every((entry) =>
        existsSync(
          resolve(repositoryRoot, 'apps/api/drizzle', `${entry.tag}.sql`),
        ),
      );
  } catch {
    migrationManifestAvailable = false;
  }

  return [
    {
      id: 'migration-manifest',
      status: migrationManifestAvailable ? 'PASS' : 'FAIL',
      summary: migrationManifestAvailable
        ? 'The previous and current committed migration states are reproducible.'
        : 'The migration journal or one of its committed SQL files is incomplete.',
      remediation: migrationManifestAvailable
        ? null
        : 'Restore the Drizzle journal and every referenced migration SQL file.',
    },
  ];
}

function failedChecks(checks, ids) {
  return ids.flatMap((id) => {
    const check = checks.find((candidate) => candidate.id === id);
    return check
      ? check.status === 'FAIL'
        ? [check]
        : []
      : [
          {
            id,
            status: 'FAIL',
            summary: `Required ${id} check is missing from the preflight.`,
            remediation:
              'Restore the prerequisite check before trusting local execution.',
          },
        ];
  });
}

function checkReason(check) {
  return [check.summary, check.remediation]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createPreflightPlan({ doctorChecks }) {
  const sharedFailures = failedChecks(doctorChecks, sharedPrerequisites);
  const seams = seamDefinitions.map((definition) => {
    const failures = [
      ...sharedFailures,
      ...failedChecks(doctorChecks, groupPrerequisites[definition.group]),
    ];
    const runnable = failures.length === 0;
    return {
      ...definition,
      localStatus: runnable
        ? 'runnable-locally'
        : 'blocked-locally-with-reason',
      authority: runnable ? 'local-and-full-ci' : 'delegated-to-early-ci',
      reason: runnable
        ? 'All required local prerequisites are available.'
        : [...new Set(failures.map(checkReason))].join(' '),
    };
  });

  return { earlyCiCommand, seams };
}

function label(value) {
  return value.replaceAll('-', ' ').toUpperCase();
}

export function formatPreflightReport(plan) {
  const lines = ['Local CI preflight'];
  for (const seam of plan.seams) {
    lines.push(`${label(seam.localStatus)} ${seam.id}: ${seam.reason}`);
    if (seam.authority === 'delegated-to-early-ci') {
      lines.push(
        `${label(seam.authority)} ${seam.id}: run ${plan.earlyCiCommand}`,
      );
    }
  }
  return lines.join('\n');
}

function packageScriptInvocation(script) {
  const pnpmEntrypoint = process.env.npm_execpath;
  if (pnpmEntrypoint) {
    return {
      command: process.execPath,
      args: [pnpmEntrypoint, script],
    };
  }
  return { command: 'pnpm', args: [script] };
}

function runPackageScript(script) {
  const invocation = packageScriptInvocation(script);
  return spawnSync(invocation.command, invocation.args, {
    cwd: repositoryRoot,
    env: process.env,
    encoding: 'utf8',
    stdio: 'inherit',
    timeout: 15 * 60 * 1_000,
    windowsHide: true,
  });
}

export function main() {
  const json = process.argv.includes('--json');
  const checkOnly = process.argv.includes('--check-only');
  const doctorChecks = [
    ...evaluateEnvironment(collectEnvironment('web-postgres'), 'web-postgres'),
    ...collectPreflightChecks(),
  ];
  const plan = createPreflightPlan({ doctorChecks });

  process.stdout.write(
    `${json ? JSON.stringify(plan, null, 2) : formatPreflightReport(plan)}\n`,
  );

  const blocked = plan.seams.some(
    (seam) => seam.localStatus === 'blocked-locally-with-reason',
  );
  if (blocked) {
    process.exitCode = 2;
    return;
  }
  if (checkOnly) return;

  const scripts = [
    ...new Set(
      plan.seams
        .filter((seam) => seam.localStatus === 'runnable-locally')
        .map((seam) => seam.command),
    ),
  ];
  for (const script of scripts) {
    process.stdout.write(`RUNNABLE LOCALLY ${script}: starting\n`);
    const result = runPackageScript(script);
    if (result.error) {
      process.stderr.write(
        `Local preflight could not start ${script}: ${result.error.code ?? result.error.message}\n`,
      );
      process.exitCode = 1;
      return;
    }
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      return;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) main();
