import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { databaseTargetsAreSafe } from '../apps/api/test-support/postgres-database-target.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), '..');
const POSTGRES_SENTINEL = 'PRISMA_PRIM_POSTGRES_PROBE=';
const POSTGRES_TIMEOUT = 15_000;
const OPERATION_TIMEOUT = 3_000;
const FALLBACK_CODE = 'EIO';
const ALLOWED_CODES = new Set([
  'ENOENT',
  'EACCES',
  'EPERM',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENOBUFS',
  'EIO',
  'EPIPE',
  'ENOMEM',
  '28P01',
  '28000',
  '3D000',
  '57P03',
  '53300',
  '42501',
]);
const NETWORK_CODES = new Set([
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
]);
const TARGET_PHASES = new Set(['constructor', 'connect', 'query', 'cleanup']);

function readRepositoryText(path) {
  try {
    return readFileSync(resolve(repositoryRoot, path), 'utf8').trim();
  } catch {
    return '';
  }
}

export function run(command, args, options = {}, runner = spawnSync) {
  return runner(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false,
    timeout: 10_000,
    ...options,
  });
}

function snapshot(value, key) {
  try {
    return { ok: true, value: value?.[key] };
  } catch {
    return { ok: false };
  }
}

function canonicalCode(errorOrCode) {
  const read =
    typeof errorOrCode === 'string'
      ? { ok: true, value: errorOrCode }
      : snapshot(errorOrCode, 'code');
  return read.ok && ALLOWED_CODES.has(read.value) ? read.value : FALLBACK_CODE;
}

function stateForCode(code, bootstrap = false) {
  if (code === 'EACCES' || code === 'EPERM') return 'sandbox-denied';
  if (bootstrap) return 'tooling-missing';
  if (code === 'ECONNREFUSED') return 'service-unavailable';
  if (NETWORK_CODES.has(code)) return 'unreachable';
  return 'connection-failed';
}

export function classifyPnpmCommand(command) {
  if (command.error?.code === 'ENOENT') return { state: 'missing' };
  if (new Set(['EACCES', 'EPERM']).has(command.error?.code)) {
    return { state: 'sandbox-denied', detail: command.error.code };
  }
  if (command.status === 0) {
    const version = command.stdout.match(/\bpnpm\/(\d+\.\d+\.\d+)\b/)?.[1];
    return version
      ? { state: 'available', version }
      : { state: 'failed', detail: 'unparseable-package-manager-user-agent' };
  }
  return {
    state: 'failed',
    detail: command.error?.code ?? `exit ${command.status ?? 'unknown'}`,
  };
}

function withTimeout(operation, milliseconds = OPERATION_TIMEOUT) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          Object.assign(new Error('bounded timeout'), { code: 'ETIMEDOUT' }),
        ),
      milliseconds,
    );
  });
  return Promise.race([Promise.resolve().then(operation), timeout]).finally(
    () => clearTimeout(timer),
  );
}

function failedTarget(target, phase, error) {
  const code = canonicalCode(error);
  return { state: stateForCode(code), target, phase, code };
}

async function probeTarget(target, connectionString, Client, timeout) {
  let client;
  let result;
  try {
    client = new Client({ connectionString, connectionTimeoutMillis: timeout });
  } catch (error) {
    return failedTarget(target, 'constructor', error);
  }
  try {
    await withTimeout(() => client.connect(), timeout);
  } catch (error) {
    result = failedTarget(target, 'connect', error);
  }
  if (!result) {
    try {
      const response = await withTimeout(
        () =>
          client.query(
            "SELECT current_setting('server_version_num')::integer AS server_version_number, COALESCE((SELECT rolsuper OR rolcreatedb FROM pg_roles WHERE rolname = current_user), false) AS can_create_database",
          ),
        timeout,
      );
      const rows = snapshot(response, 'rows');
      const row =
        rows.ok && Array.isArray(rows.value)
          ? snapshot(rows.value, 0)
          : { ok: false };
      const version = row.ok
        ? snapshot(row.value, 'server_version_number')
        : { ok: false };
      const capability = row.ok
        ? snapshot(row.value, 'can_create_database')
        : { ok: false };
      result =
        version.ok &&
        Number.isInteger(version.value) &&
        capability.ok &&
        typeof capability.value === 'boolean'
          ? {
              state: 'available',
              serverVersionNumber: version.value,
              canCreateDatabase: capability.value,
            }
          : failedTarget(target, 'query', null);
    } catch (error) {
      result = failedTarget(target, 'query', error);
    }
  }
  try {
    const end = snapshot(client, 'end');
    if (!end.ok || typeof end.value !== 'function') throw null;
    await withTimeout(() => end.value.call(client), timeout);
  } catch (error) {
    if (result.state === 'available')
      result = failedTarget(target, 'cleanup', error);
  }
  return result;
}

export async function probePostgresTargets({
  databaseUrl,
  testDatabaseUrl,
  Client,
  operationTimeout = OPERATION_TIMEOUT,
}) {
  const [development, test] = await Promise.all([
    probeTarget('development', databaseUrl, Client, operationTimeout),
    probeTarget('test', testDatabaseUrl, Client, operationTimeout),
  ]);
  return { development, test };
}

function bootstrapEnvelope(error) {
  const code = canonicalCode(error);
  return { phase: 'bootstrap', state: stateForCode(code, true), code };
}

function targetsEnvelope(targets) {
  return { phase: 'targets', targets };
}

async function writeFlushed(text, stream = process.stdout) {
  await new Promise((resolveWrite, rejectWrite) => {
    stream.write(text, (error) =>
      error ? rejectWrite(error) : resolveWrite(),
    );
  });
}

export async function runPostgresChild({
  pgModule,
  bootstrapError,
  databaseUrl = process.env.DATABASE_URL,
  testDatabaseUrl = process.env.TEST_DATABASE_URL,
  operationTimeout,
  stream,
} = {}) {
  let envelope;
  if (bootstrapError) {
    envelope = bootstrapEnvelope(bootstrapError);
  } else {
    const defaultExport = snapshot(pgModule, 'default');
    if (!defaultExport.ok) {
      envelope = bootstrapEnvelope(null);
    } else {
      const holder = defaultExport.value ?? pgModule;
      const clientExport = snapshot(holder, 'Client');
      if (!clientExport.ok || typeof clientExport.value !== 'function') {
        envelope = bootstrapEnvelope(null);
      } else {
        const targets = await probePostgresTargets({
          databaseUrl,
          testDatabaseUrl,
          Client: clientExport.value,
          operationTimeout,
        });
        envelope = targetsEnvelope(targets);
      }
    }
  }
  const success =
    envelope.phase === 'targets' &&
    envelope.targets.development.state === 'available' &&
    envelope.targets.test.state === 'available';
  try {
    await writeFlushed(
      `${POSTGRES_SENTINEL}${JSON.stringify(envelope)}\n`,
      stream,
    );
  } catch {
    /* stdout failure is already bounded by the outer process result. */
  }
  process.exitCode = success ? 0 : 1;
  return envelope;
}

export function createPostgresChildSource({
  adapterUrl = import.meta.url,
  pgSpecifier = 'pg',
  operationTimeout,
} = {}) {
  return [
    `import { runPostgresChild } from ${JSON.stringify(adapterUrl)};`,
    'let pgModule; let bootstrapError;',
    `try { pgModule = await import(${JSON.stringify(pgSpecifier)}); } catch (error) { bootstrapError = error; }`,
    `await runPostgresChild({ pgModule, bootstrapError${operationTimeout === undefined ? '' : `, operationTimeout: ${JSON.stringify(operationTimeout)}`} });`,
  ].join('\n');
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false;
  try {
    return Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function ownKeys(value) {
  try {
    return Reflect.ownKeys(value);
  } catch {
    return null;
  }
}
function exactKeys(value, expected) {
  const keys = ownKeys(value);
  return (
    keys &&
    keys.length === expected.length &&
    expected.every((key) => keys.includes(key))
  );
}

function validateTarget(value, target) {
  if (!plainObject(value)) return null;
  const state = snapshot(value, 'state');
  if (!state.ok) return null;
  if (state.value === 'available') {
    if (
      !exactKeys(value, ['state', 'serverVersionNumber', 'canCreateDatabase'])
    )
      return null;
    const version = snapshot(value, 'serverVersionNumber');
    const capability = snapshot(value, 'canCreateDatabase');
    return version.ok &&
      Number.isInteger(version.value) &&
      capability.ok &&
      typeof capability.value === 'boolean'
      ? {
          state: 'available',
          serverVersionNumber: version.value,
          canCreateDatabase: capability.value,
        }
      : null;
  }
  if (!exactKeys(value, ['state', 'target', 'phase', 'code'])) return null;
  const declaredTarget = snapshot(value, 'target');
  const phase = snapshot(value, 'phase');
  const codeValue = snapshot(value, 'code');
  const failureStates = new Set([
    'sandbox-denied',
    'service-unavailable',
    'unreachable',
    'connection-failed',
  ]);
  if (
    !failureStates.has(state.value) ||
    !declaredTarget.ok ||
    declaredTarget.value !== target ||
    !phase.ok ||
    !TARGET_PHASES.has(phase.value) ||
    !codeValue.ok ||
    !ALLOWED_CODES.has(codeValue.value) ||
    state.value !== stateForCode(codeValue.value)
  )
    return null;
  const code = codeValue.value;
  return { state: stateForCode(code), target, phase: phase.value, code };
}

function parseEnvelope(stdout) {
  if (typeof stdout !== 'string') return null;
  const lines = stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith(POSTGRES_SENTINEL));
  if (lines.length !== 1) return null;
  let payload;
  try {
    payload = JSON.parse(lines[0].slice(POSTGRES_SENTINEL.length));
  } catch {
    return null;
  }
  if (!plainObject(payload)) return null;
  const phase = snapshot(payload, 'phase');
  if (!phase.ok) return null;
  if (phase.value === 'bootstrap') {
    if (!exactKeys(payload, ['phase', 'state', 'code'])) return null;
    const code = snapshot(payload, 'code');
    const state = snapshot(payload, 'state');
    if (
      !code.ok ||
      !ALLOWED_CODES.has(code.value) ||
      !state.ok ||
      state.value !== stateForCode(code.value, true)
    )
      return null;
    return bootstrapEnvelope(code.value);
  }
  if (phase.value !== 'targets' || !exactKeys(payload, ['phase', 'targets']))
    return null;
  const targetsValue = snapshot(payload, 'targets');
  if (
    !targetsValue.ok ||
    !plainObject(targetsValue.value) ||
    !exactKeys(targetsValue.value, ['development', 'test'])
  )
    return null;
  const developmentValue = snapshot(targetsValue.value, 'development');
  const testValue = snapshot(targetsValue.value, 'test');
  if (!developmentValue.ok || !testValue.ok) return null;
  const development = validateTarget(developmentValue.value, 'development');
  const test = validateTarget(testValue.value, 'test');
  return development && test ? targetsEnvelope({ development, test }) : null;
}

function publicFailure(record) {
  return {
    state: record.state,
    target: record.target,
    phase: record.phase,
    detail: record.code,
  };
}

function outerFailure(code) {
  if (code === 'ENOENT') return { state: 'tooling-missing' };
  if (code === 'EACCES' || code === 'EPERM')
    return { state: 'sandbox-denied', detail: code };
  if (NETWORK_CODES.has(code))
    return { state: 'unreachable', phase: 'subprocess', detail: code };
  return { state: 'tooling-missing', detail: 'probe-bootstrap' };
}

export function classifyPostgresCommand(command) {
  const error = snapshot(command, 'error');
  const stdout = snapshot(command, 'stdout');
  const status = snapshot(command, 'status');
  const signal = snapshot(command, 'signal');
  if (!error.ok || !stdout.ok || !status.ok || !signal.ok)
    return { state: 'tooling-missing', detail: 'probe-bootstrap' };
  const errorCode = error.value == null ? null : canonicalCode(error.value);
  const envelope = parseEnvelope(stdout.value);
  if (envelope?.phase === 'bootstrap') {
    return envelope.state === 'sandbox-denied'
      ? { state: 'sandbox-denied', detail: envelope.code }
      : { state: 'tooling-missing', detail: 'probe-bootstrap' };
  }
  if (envelope?.phase === 'targets') {
    const failure =
      envelope.targets.development.state !== 'available'
        ? envelope.targets.development
        : envelope.targets.test.state !== 'available'
          ? envelope.targets.test
          : null;
    if (failure) return publicFailure(failure);
    if (status.value === 0 && signal.value == null && error.value == null) {
      const { development, test } = envelope.targets;
      const supported = (version) => version >= 170_011 && version < 180_000;
      const serverVersionNumber = !supported(development.serverVersionNumber)
        ? development.serverVersionNumber
        : !supported(test.serverVersionNumber)
          ? test.serverVersionNumber
          : Math.min(development.serverVersionNumber, test.serverVersionNumber);
      return {
        state: 'available',
        serverVersionNumber,
        canCreateDatabase: test.canCreateDatabase,
        allTargetsCanCreateDatabase:
          development.canCreateDatabase && test.canCreateDatabase,
        targets: envelope.targets,
      };
    }
  }
  return errorCode
    ? outerFailure(errorCode)
    : { state: 'tooling-missing', detail: 'probe-bootstrap' };
}

export function probePostgres(
  databaseUrl,
  testDatabaseUrl,
  runner = spawnSync,
) {
  if (!databaseUrl || !testDatabaseUrl) return { state: 'not-run' };
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const command = run(
    executable,
    [
      '--filter',
      '@prisma-prim/api',
      'exec',
      'node',
      '--input-type=module',
      '--eval',
      createPostgresChildSource(),
    ],
    {
      timeout: POSTGRES_TIMEOUT,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        TEST_DATABASE_URL: testDatabaseUrl,
      },
    },
    runner,
  );
  return classifyPostgresCommand(command);
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
  return (
    run(executable, [
      '--filter',
      '@prisma-prim/web',
      'exec',
      'node',
      '--input-type=module',
      '--eval',
      probe,
    ]).status === 0
  );
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
    if (pnpmProbe.state === 'missing')
      postgresProbe = { state: 'tooling-missing', detail: 'pnpm' };
    else if (pnpmProbe.state === 'sandbox-denied')
      postgresProbe = { state: 'sandbox-denied', detail: pnpmProbe.detail };
    else if (!dependenciesInstalled)
      postgresProbe = { state: 'tooling-missing', detail: 'dependencies' };
    else postgresProbe = probePostgres(databaseUrl, testDatabaseUrl);
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
