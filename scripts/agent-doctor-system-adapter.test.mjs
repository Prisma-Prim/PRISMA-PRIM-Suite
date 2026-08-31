import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { evaluateEnvironment } from './agent-doctor.mjs';
import {
  classifyPnpmCommand,
  classifyPostgresCommand,
  createPostgresChildSource,
  probePostgres,
  probePostgresTargets,
  run,
  runPostgresChild,
} from './agent-doctor-system-adapter.mjs';

const SENTINEL = 'PRISMA_PRIM_POSTGRES_PROBE=';
const available = (
  serverVersionNumber = 170_011,
  canCreateDatabase = true,
) => ({ state: 'available', serverVersionNumber, canCreateDatabase });
const envelope = (development = available(), testTarget = available()) => ({
  phase: 'targets',
  targets: { development, test: testTarget },
});
const command = (payload, overrides = {}) => ({
  status: 0,
  signal: null,
  error: null,
  stdout: `${SENTINEL}${JSON.stringify(payload)}\n`,
  ...overrides,
});

test('reads the effective pnpm version from the package-manager user agent', () => {
  assert.deepEqual(
    classifyPnpmCommand({
      status: 0,
      stdout: 'pnpm/11.20.0 npm/? node/v24.19.0 linux x64\n',
    }),
    { state: 'available', version: '11.20.0' },
  );
});

test('fails closed when the effective pnpm identity is absent', () => {
  assert.deepEqual(classifyPnpmCommand({ status: 0, stdout: 'unexpected\n' }), {
    state: 'failed',
    detail: 'unparseable-package-manager-user-agent',
  });
});

test('preserves missing and sandbox-denied pnpm classifications', () => {
  assert.deepEqual(classifyPnpmCommand({ error: { code: 'ENOENT' } }), {
    state: 'missing',
  });
  assert.deepEqual(classifyPnpmCommand({ error: { code: 'EPERM' } }), {
    state: 'sandbox-denied',
    detail: 'EPERM',
  });
});

test('collects the repository Node pin separately from the host runtime', async () => {
  const source = await readFile(
    new URL('./agent-doctor-system-adapter.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /pinnedNodeVersion:/);
  assert.match(source, /readRepositoryText\('\.node-version'\)/);
  assert.match(source, /nodeVersion:\s*process\.version/);
});

const counts = () => ({
  development: [0, 0, 0, 0],
  test: [0, 0, 0, 0],
});

function fakeClient(failure, calls, barrier) {
  return class Client {
    constructor({ connectionString }) {
      this.target = connectionString;
      calls[this.target][0]++;
      if (failure === `${this.target}:constructor`) throw { code: 'EIO' };
    }
    async connect() {
      calls[this.target][1]++;
      await barrier?.(this.target);
      if (failure === `${this.target}:connect`) throw { code: 'ECONNREFUSED' };
    }
    async query() {
      calls[this.target][2]++;
      if (failure === `${this.target}:query`) throw { code: 'ETIMEDOUT' };
      return {
        rows: [{ server_version_number: 170_011, can_create_database: true }],
      };
    }
    async end() {
      calls[this.target][3]++;
      if (failure === `${this.target}:cleanup`) throw { code: 'EPIPE' };
    }
  };
}

test('executes the complete client lifecycle table', async () => {
  for (const [failure, expected, phase] of [
    [null, [1, 1, 1, 1]],
    ['development:constructor', [1, 0, 0, 0], 'constructor'],
    ['development:connect', [1, 1, 0, 1], 'connect'],
    ['development:query', [1, 1, 1, 1], 'query'],
    ['development:cleanup', [1, 1, 1, 1], 'cleanup'],
  ]) {
    const calls = counts();
    const result = await probePostgresTargets({
      databaseUrl: 'development',
      testDatabaseUrl: 'test',
      Client: fakeClient(failure, calls),
      operationTimeout: 100,
    });
    assert.deepEqual(calls.development, expected);
    assert.deepEqual(calls.test, [1, 1, 1, 1]);
    assert.equal(
      result.development[phase ? 'phase' : 'state'],
      phase ?? 'available',
    );
  }
});

test('preserves connect failure when cleanup also fails', async () => {
  const calls = counts();
  const Client = fakeClient('development:connect', calls);
  Client.prototype.end = async function () {
    calls[this.target][3]++;
    throw { code: 'EPIPE' };
  };
  const result = await probePostgresTargets({
    databaseUrl: 'development',
    testDatabaseUrl: 'test',
    Client,
    operationTimeout: 100,
  });
  assert.equal(result.development.phase, 'connect');
  assert.equal(calls.development[3], 1);
});

test('starts both targets concurrently at a logical barrier', async () => {
  const calls = counts();
  const entered = new Set();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const barrier = async (target) => {
    entered.add(target);
    await gate;
  };
  const probing = probePostgresTargets({
    databaseUrl: 'development',
    testDatabaseUrl: 'test',
    Client: fakeClient(null, calls, barrier),
    operationTimeout: 100,
  });
  try {
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual([...entered].sort(), ['development', 'test']);
  } finally {
    release();
  }
  const result = await probing;
  assert.equal(result.development.state, 'available');
  assert.equal(result.test.state, 'available');
});

async function executeChild(cleanupFailure) {
  const directory = await mkdtemp(join(tmpdir(), 'doctor-child-'));
  const log = join(directory, 'log');
  const modulePath = join(directory, 'fake-pg.mjs');
  const secrets = {
    development: 'postgres://doctor_dev:dev-secret@localhost/development',
    test: 'postgres://doctor_test:test-secret@localhost/test',
    message: 'raw cleanup secret must never escape',
  };
  try {
    await writeFile(
      modulePath,
      `import{appendFileSync}from'node:fs';export class Client{constructor(o){this.t=o.connectionString}async connect(){}async query(){return{rows:[{server_version_number:170011,can_create_database:true}]}}async end(){appendFileSync(process.env.LOG,this.t+'\\n');${cleanupFailure ? "if(this.t===process.env.TEST_DATABASE_URL)throw Object.assign(new Error(process.env.RAW_MESSAGE),{code:'EPIPE'})" : ''}}}export default{Client}`,
    );
    const source = createPostgresChildSource({
      adapterUrl: new URL('./agent-doctor-system-adapter.mjs', import.meta.url)
        .href,
      pgSpecifier: pathToFileURL(modulePath).href,
    });
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', source],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: secrets.development,
          TEST_DATABASE_URL: secrets.test,
          RAW_MESSAGE: secrets.message,
          LOG: log,
        },
      },
    );
    const logText = await readFile(log, 'utf8');
    return { ...result, log: logText, secrets };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('executes exact generated source for success and cleanup failure', async () => {
  const success = await executeChild(false);
  assert.equal(success.status, 0);
  assert.equal(success.stdout.split(SENTINEL).length - 1, 1);
  assert.equal(
    success.log,
    `${success.secrets.development}\n${success.secrets.test}\n`,
  );
  const failure = await executeChild(true);
  assert.equal(failure.status, 1);
  assert.match(failure.stdout, /"phase":"cleanup"/);
  assert.equal(failure.stdout.split(SENTINEL).length - 1, 1);
  assert.equal(
    failure.log,
    `${failure.secrets.development}\n${failure.secrets.test}\n`,
  );
  for (const result of [success, failure]) {
    const publicResult = classifyPostgresCommand(result);
    const publicText = JSON.stringify(publicResult);
    for (const secret of Object.values(result.secrets)) {
      assert.doesNotMatch(result.stdout, new RegExp(secret));
      assert.doesNotMatch(result.stderr, new RegExp(secret));
      assert.doesNotMatch(publicText, new RegExp(secret));
    }
    assert.doesNotMatch(result.stdout, /Error|at runPostgresChild/);
    assert.doesNotMatch(result.stderr, /Error|at runPostgresChild/);
  }
});

test('fails closed when reading the pg default export throws', async () => {
  let constructions = 0;
  const pgModule = {
    Client: class Client {
      constructor() {
        constructions++;
      }
    },
  };
  Object.defineProperty(pgModule, 'default', {
    get() {
      throw new Error('raw bootstrap secret');
    },
  });
  let output = '';
  const stream = {
    write(value, callback) {
      output += value;
      callback();
    },
  };
  const previousExitCode = process.exitCode;
  try {
    const result = await runPostgresChild({ pgModule, stream });
    assert.deepEqual(result, {
      phase: 'bootstrap',
      state: 'tooling-missing',
      code: 'EIO',
    });
    assert.equal(process.exitCode, 1);
    assert.equal(constructions, 0);
    assert.equal(output.split(SENTINEL).length - 1, 1);
    assert.doesNotMatch(output, /raw bootstrap secret|Error|at /);
  } finally {
    process.exitCode = previousExitCode;
  }
});

test('validates and canonicalizes the parent protocol', () => {
  assert.deepEqual(
    classifyPostgresCommand(
      command(envelope(available(170_012, false), available(170_011, true))),
    ),
    {
      state: 'available',
      serverVersionNumber: 170_011,
      canCreateDatabase: true,
      allTargetsCanCreateDatabase: false,
      targets: {
        development: available(170_012, false),
        test: available(170_011, true),
      },
    },
  );
  const failure = {
    state: 'sandbox-denied',
    target: 'development',
    phase: 'connect',
    code: 'EACCES',
  };
  assert.deepEqual(
    classifyPostgresCommand(
      command(envelope(failure), {
        status: 1,
        signal: 'SIGTERM',
        error: { code: 'ENOENT' },
      }),
    ),
    {
      state: 'sandbox-denied',
      target: 'development',
      phase: 'connect',
      detail: 'EACCES',
    },
  );
  for (const dirty of [
    { status: 1 },
    { signal: 'SIGTERM' },
    { error: { code: 'ENOMEM' } },
  ])
    assert.notEqual(
      classifyPostgresCommand(command(envelope(), dirty)).state,
      'available',
    );
  const invalid = [
    ['connection-failed', 'EACCES'],
    ['sandbox-denied', 'EIO'],
  ];
  for (const [state, code] of invalid) {
    const target = { state, target: 'development', phase: 'connect', code };
    assert.deepEqual(classifyPostgresCommand(command(envelope(target))), {
      state: 'tooling-missing',
      detail: 'probe-bootstrap',
    });
  }
  for (const [state, code] of [
    ['sandbox-denied', 'EACCES'],
    ['unreachable', 'ETIMEDOUT'],
    ['connection-failed', '28P01'],
  ]) {
    const target = { state, target: 'development', phase: 'connect', code };
    assert.equal(
      classifyPostgresCommand(command(envelope(target))).state,
      state,
    );
  }
  for (const [state, code] of [
    ['tooling-missing', 'EACCES'],
    ['sandbox-denied', 'EIO'],
  ]) {
    assert.deepEqual(
      classifyPostgresCommand(command({ phase: 'bootstrap', state, code })),
      { state: 'tooling-missing', detail: 'probe-bootstrap' },
    );
  }
});

test('rejects malformed, extra, missing, and hostile protocol fields', () => {
  const invalid = [
    null,
    undefined,
    1,
    {},
    { stdout: '' },
    command({ phase: 'wrong' }),
    command({ phase: 'targets', targets: null }),
    command({ phase: 'targets', targets: { development: available() } }),
    command({
      phase: 'targets',
      targets: {
        development: available(),
        test: available(),
        production: available(),
      },
    }),
    command({
      phase: 'targets',
      targets: {
        development: { ...available(), secret: 'x' },
        test: available(),
      },
    }),
    { ...command(envelope()), stdout: command(envelope()).stdout.repeat(2) },
  ];
  for (const value of invalid)
    assert.doesNotThrow(() =>
      assert.notEqual(classifyPostgresCommand(value).state, 'available'),
    );
  for (const key of ['error', 'signal']) {
    const hostile = command(envelope());
    Object.defineProperty(hostile, key, {
      get() {
        throw new Error('secret');
      },
    });
    assert.deepEqual(classifyPostgresCommand(hostile), {
      state: 'tooling-missing',
      detail: 'probe-bootstrap',
    });
  }
});

test('preserves no-runner, ENOENT, and timeout contracts', () => {
  assert.deepEqual(
    classifyPostgresCommand({
      error: { code: 'ENOENT' },
      stdout: '',
      status: null,
      signal: null,
    }),
    { state: 'tooling-missing' },
  );
  let calls = 0;
  assert.deepEqual(
    probePostgres('', 'test', () => calls++),
    { state: 'not-run' },
  );
  assert.deepEqual(
    probePostgres('development', '', () => calls++),
    { state: 'not-run' },
  );
  assert.equal(calls, 0);
  let generic;
  run('x', [], {}, (_command, _args, options) => {
    generic = options.timeout;
    return {};
  });
  let postgres;
  probePostgres('development', 'test', (_command, _args, options) => {
    postgres = options.timeout;
    return { stdout: '', status: 1, signal: null, error: null };
  });
  assert.deepEqual([generic, postgres], [10_000, 15_000]);
});

function postgresStatus(development, testTarget) {
  const postgresProbe = classifyPostgresCommand(
    command(envelope(available(development), available(testTarget))),
  );
  const report = evaluateEnvironment(
    {
      nodeRange: '>=24 <25',
      nodeVersion: 'v24.0.0',
      pinnedNodeVersion: '24',
      packageManager: 'pnpm@11.20.0',
      pnpmProbe: { state: 'available', version: '11.20.0' },
      workspaceManifestExists: true,
      lockfileExists: true,
      dependenciesInstalled: true,
      databaseUrl: 'postgres://u:p@127.0.0.1/development',
      testDatabaseUrl: 'postgres://u:p@127.0.0.1/development_test',
      postgresProbe,
    },
    'postgres',
  );
  return report.checks.find((check) => check.id === 'postgres').status;
}

test('evaluates both target version directions', () => {
  for (const pair of [
    [160_000, 170_011],
    [170_011, 160_000],
    [180_000, 170_011],
  ])
    assert.equal(postgresStatus(...pair), 'FAIL');
  assert.equal(postgresStatus(170_011, 170_099), 'PASS');
});
