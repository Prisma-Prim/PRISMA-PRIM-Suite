import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { databaseTargetsAreSafe } from '../apps/api/test-support/postgres-database-target.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), '..');

function readRepositoryText(path) {
  try {
    return readFileSync(resolve(repositoryRoot, path), 'utf8').trim();
  } catch {
    return '';
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

export function classifyPnpmCommand(command) {
  if (command.error?.code === 'ENOENT') {
    return { state: 'missing' };
  }

  if (new Set(['EACCES', 'EPERM']).has(command.error?.code)) {
    return { state: 'sandbox-denied', detail: command.error.code };
  }

  if (command.status === 0) {
    const version = command.stdout.match(/\bpnpm\/(\d+\.\d+\.\d+)\b/)?.[1];
    return version
      ? { state: 'available', version }
      : {
          state: 'failed',
          detail: 'unparseable-package-manager-user-agent',
        };
  }

  return {
    state: 'failed',
    detail: command.error?.code ?? `exit ${command.status ?? 'unknown'}`,
  };
}

function probePnpm() {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  return classifyPnpmCommand(
    run(executable, [
      'exec',
      'node',
      '--input-type=module',
      '--eval',
      'process.stdout.write(process.env.npm_config_user_agent ?? "")',
    ]),
  );
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

function classifyPostgresCommand(command) {
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

export function collectEnvironmentSnapshot({ needsChromium, needsPostgres }) {
  const packageJson = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
  );
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
  const safeDatabaseTargets = databaseTargetsAreSafe(
    databaseUrl,
    testDatabaseUrl,
  );
  const pnpmProbe = probePnpm();
  const dependenciesInstalled = existsSync(
    resolve(repositoryRoot, 'node_modules'),
  );
  let postgresProbe = { state: 'not-run' };
  if (needsPostgres && safeDatabaseTargets) {
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
    pinnedNodeVersion: readRepositoryText('.node-version'),
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
