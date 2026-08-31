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

test('preserves primary failures when cleanup also fails', async () => {
  for (const target of ['development', 'test']) {
    for (const [phase, code, state, expectedCalls] of [
      ['connect', 'ECONNREFUSED', 'service-unavailable', [1, 1, 0, 1]],
      ['query', 'ETIMEDOUT', 'unreachable', [1, 1, 1, 1]],
    ]) {
      const calls = counts();
      class Client {
        constructor({ connectionString }) {
          this.target = connectionString;
          calls[this.target][0]++;
        }
        async connect() {
          calls[this.target][1]++;
          if (this.target === target && phase === 'connect') throw { code };
        }
        async query() {
          calls[this.target][2]++;
          if (this.target === target && phase === 'query') throw { code };
          return {
            rows: [
              {
                server_version_number: 170_011,
                can_create_database: true,
              },
            ],
          };
        }
        async end() {
          calls[this.target][3]++;
          if (this.target === target) throw { code: 'EPIPE' };
        }
      }
      const result = await probePostgresTargets({
        databaseUrl: 'development',
        testDatabaseUrl: 'test',
        Client,
        operationTimeout: 100,
      });
      assert.deepEqual(result[target], {
        state,
        target,
        phase,
        code,
      });
      assert.deepEqual(calls[target], expectedCalls);
      const other = target === 'development' ? 'test' : 'development';
      assert.deepEqual(result[other], available());
      assert.deepEqual(calls[other], [1, 1, 1, 1]);
    }
  }
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

test('contains generated dynamic-import rejection without leaking diagnostics', async () => {
  for (const [thrownSource, expectedPayload, expectedPublic] of [
    [
      "Object.assign(new Error('dynamic-import-secret-message'),{code:'EACCES'})",
      { phase: 'bootstrap', state: 'sandbox-denied', code: 'EACCES' },
      { state: 'sandbox-denied', detail: 'EACCES' },
    ],
    [
      'null',
      { phase: 'bootstrap', state: 'tooling-missing', code: 'EIO' },
      { state: 'tooling-missing', detail: 'probe-bootstrap' },
    ],
    [
      "Object.assign(new Error('eperm-secret'),{code:'EPERM'})",
      { phase: 'bootstrap', state: 'sandbox-denied', code: 'EPERM' },
      { state: 'sandbox-denied', detail: 'EPERM' },
    ],
    [
      "({code:'TOKEN',password:'bootstrap-object-secret'})",
      { phase: 'bootstrap', state: 'tooling-missing', code: 'EIO' },
      { state: 'tooling-missing', detail: 'probe-bootstrap' },
    ],
    [
      '12345n',
      { phase: 'bootstrap', state: 'tooling-missing', code: 'EIO' },
      { state: 'tooling-missing', detail: 'probe-bootstrap' },
    ],
  ]) {
    const directory = await mkdtemp(join(tmpdir(), 'doctor-import-rejection-'));
    const modulePath = join(directory, 'pg-secret-module.mjs');
    const moduleUrl = pathToFileURL(modulePath).href;
    try {
      await writeFile(
        modulePath,
        `throw ${thrownSource};\n//# sourceURL=dynamic-import-secret-url`,
      );
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          createPostgresChildSource({
            adapterUrl: new URL(
              './agent-doctor-system-adapter.mjs',
              import.meta.url,
            ).href,
            pgSpecifier: moduleUrl,
          }),
        ],
        { encoding: 'utf8' },
      );
      assert.equal(result.status, 1);
      assert.equal(result.stderr, '');
      assert.equal(result.stdout.split(SENTINEL).length - 1, 1);
      assert.equal(
        result.stdout,
        `${SENTINEL}${JSON.stringify(expectedPayload)}\n`,
      );
      const publicResult = classifyPostgresCommand(result);
      assert.deepEqual(publicResult, expectedPublic);
      const observable = `${result.stdout}\n${result.stderr}\n${JSON.stringify(publicResult)}`;
      for (const forbidden of [
        'dynamic-import-secret-message',
        'dynamic-import-secret-url',
        moduleUrl,
        'Error:',
        ' at ',
      ])
        assert.doesNotMatch(observable, new RegExp(forbidden));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test('awaits the delayed sentinel write callback', async () => {
  let callback;
  let writes = 0;
  let output = '';
  let settled = false;
  const previousExitCode = process.exitCode;
  const completion = runPostgresChild({
    bootstrapError: { code: 'EACCES' },
    stream: {
      write(value, retainedCallback) {
        writes++;
        output += value;
        callback = retainedCallback;
      },
    },
  }).finally(() => {
    settled = true;
  });
  try {
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(writes, 1);
  } finally {
    callback?.();
  }
  try {
    assert.deepEqual(await completion, {
      phase: 'bootstrap',
      state: 'sandbox-denied',
      code: 'EACCES',
    });
    assert.equal(output.split(SENTINEL).length - 1, 1);
    assert.equal(
      output,
      `${SENTINEL}{"phase":"bootstrap","state":"sandbox-denied","code":"EACCES"}\n`,
    );
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
  }
});

test('bounds never-settling connect, query, and cleanup operations', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const activeTimers = new Set();
  globalThis.setTimeout = (callback, milliseconds) => {
    let timer;
    timer = originalSetTimeout(() => {
      activeTimers.delete(timer);
      callback();
    }, milliseconds);
    activeTimers.add(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => {
    activeTimers.delete(timer);
    return originalClearTimeout(timer);
  };
  try {
    for (const phase of ['connect', 'query', 'cleanup']) {
      const calls = counts();
      class Client {
        constructor({ connectionString }) {
          this.target = connectionString;
          calls[this.target][0]++;
        }
        connect() {
          calls[this.target][1]++;
          return phase === 'connect'
            ? new Promise(() => {})
            : Promise.resolve();
        }
        query() {
          calls[this.target][2]++;
          return phase === 'query'
            ? new Promise(() => {})
            : Promise.resolve({
                rows: [
                  {
                    server_version_number: 170_011,
                    can_create_database: true,
                  },
                ],
              });
        }
        end() {
          calls[this.target][3]++;
          return phase === 'cleanup'
            ? new Promise(() => {})
            : Promise.resolve();
        }
      }
      const result = await probePostgresTargets({
        databaseUrl: 'development',
        testDatabaseUrl: 'test',
        Client,
        operationTimeout: 1,
      });
      for (const target of ['development', 'test'])
        assert.deepEqual(result[target], {
          state: 'unreachable',
          target,
          phase,
          code: 'ETIMEDOUT',
        });
      const expected =
        phase === 'connect'
          ? [1, 1, 0, 1]
          : phase === 'query'
            ? [1, 1, 1, 1]
            : [1, 1, 1, 1];
      assert.deepEqual(calls.development, expected);
      assert.deepEqual(calls.test, expected);
      assert.equal(activeTimers.size, 0);
    }
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('snapshots alternating pg exports and outer command fields once', async () => {
  const reads = { default: 0, defaultClient: 0, namedClient: 0 };
  const constructions = [];
  class ExpectedClient {
    constructor({ connectionString }) {
      constructions.push(connectionString);
    }
    async connect() {}
    async query() {
      return {
        rows: [{ server_version_number: 170_011, can_create_database: true }],
      };
    }
    async end() {}
  }
  const defaultHolder = {};
  Object.defineProperty(defaultHolder, 'Client', {
    get() {
      if (++reads.defaultClient > 1) throw new Error('second Client read');
      return ExpectedClient;
    },
  });
  const pgModule = {};
  Object.defineProperty(pgModule, 'default', {
    get() {
      if (++reads.default > 1) throw new Error('second default read');
      return defaultHolder;
    },
  });
  Object.defineProperty(pgModule, 'Client', {
    get() {
      reads.namedClient++;
      throw new Error('named fallback must not be read');
    },
  });
  const previousExitCode = process.exitCode;
  try {
    await runPostgresChild({
      pgModule,
      databaseUrl: 'development',
      testDatabaseUrl: 'test',
      stream: { write: (_value, callback) => callback() },
    });
    assert.deepEqual(reads, { default: 1, defaultClient: 1, namedClient: 0 });
    assert.deepEqual(constructions, ['development', 'test']);

    const fallbackReads = { default: 0, Client: 0 };
    const fallbackModule = {};
    Object.defineProperty(fallbackModule, 'default', {
      get() {
        fallbackReads.default++;
        return fallbackReads.default === 1 ? null : defaultHolder;
      },
    });
    Object.defineProperty(fallbackModule, 'Client', {
      get() {
        if (++fallbackReads.Client > 1) throw new Error('second named read');
        return ExpectedClient;
      },
    });
    await runPostgresChild({
      pgModule: fallbackModule,
      databaseUrl: 'development',
      testDatabaseUrl: 'test',
      stream: { write: (_value, callback) => callback() },
    });
    assert.deepEqual(fallbackReads, { default: 1, Client: 1 });
    assert.deepEqual(constructions, [
      'development',
      'test',
      'development',
      'test',
    ]);
  } finally {
    process.exitCode = previousExitCode;
  }

  const outerReads = { error: 0, stdout: 0, status: 0, signal: 0 };
  const hostileCommand = {};
  for (const [key, value] of Object.entries(command(envelope())))
    Object.defineProperty(hostileCommand, key, {
      get() {
        if (++outerReads[key] > 1) throw new Error(`second ${key} read`);
        return value;
      },
    });
  assert.deepEqual(classifyPostgresCommand(hostileCommand), {
    state: 'available',
    serverVersionNumber: 170_011,
    canCreateDatabase: true,
    allTargetsCanCreateDatabase: true,
    targets: { development: available(), test: available() },
  });
  assert.deepEqual(outerReads, { error: 1, stdout: 1, status: 1, signal: 1 });
});

test('preserves the complete failure-code allowlist and fallback matrix', async () => {
  const matrix = [
    ['ENOENT', 'connection-failed'],
    ['EACCES', 'sandbox-denied'],
    ['EPERM', 'sandbox-denied'],
    ['ECONNREFUSED', 'service-unavailable'],
    ['ETIMEDOUT', 'unreachable'],
    ['EHOSTUNREACH', 'unreachable'],
    ['ENETUNREACH', 'unreachable'],
    ['ENOTFOUND', 'unreachable'],
    ['EAI_AGAIN', 'unreachable'],
    ['ENOBUFS', 'connection-failed'],
    ['EIO', 'connection-failed'],
    ['EPIPE', 'connection-failed'],
    ['ENOMEM', 'connection-failed'],
    ['28P01', 'connection-failed'],
    ['28000', 'connection-failed'],
    ['3D000', 'connection-failed'],
    ['57P03', 'connection-failed'],
    ['53300', 'connection-failed'],
    ['42501', 'connection-failed'],
    ['UNKNOWN_SECRET_CODE', 'connection-failed', 'EIO'],
  ];
  for (const [inputCode, state, expectedCode = inputCode] of matrix) {
    class Client {
      constructor({ connectionString }) {
        throw { code: inputCode, connectionString };
      }
    }
    const targets = await probePostgresTargets({
      databaseUrl: 'development',
      testDatabaseUrl: 'test',
      Client,
      operationTimeout: 1,
    });
    for (const target of ['development', 'test'])
      assert.deepEqual(targets[target], {
        state,
        target,
        phase: 'constructor',
        code: expectedCode,
      });
    assert.deepEqual(
      classifyPostgresCommand(command({ phase: 'targets', targets })),
      {
        state,
        target: 'development',
        phase: 'constructor',
        detail: expectedCode,
      },
    );
  }

  for (const [bootstrapError, expectedPayload, expectedPublic] of [
    [
      { code: 'EACCES' },
      { phase: 'bootstrap', state: 'sandbox-denied', code: 'EACCES' },
      { state: 'sandbox-denied', detail: 'EACCES' },
    ],
    [
      { code: 'UNKNOWN_SECRET_CODE' },
      { phase: 'bootstrap', state: 'tooling-missing', code: 'EIO' },
      { state: 'tooling-missing', detail: 'probe-bootstrap' },
    ],
  ]) {
    let output = '';
    const previousExitCode = process.exitCode;
    try {
      const payload = await runPostgresChild({
        bootstrapError,
        stream: {
          write(value, callback) {
            output += value;
            callback();
          },
        },
      });
      assert.deepEqual(payload, expectedPayload);
      assert.deepEqual(
        classifyPostgresCommand({
          error: null,
          stdout: output,
          status: 1,
          signal: null,
        }),
        expectedPublic,
      );
    } finally {
      process.exitCode = previousExitCode;
    }
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
  assert.deepEqual(
    probePostgres('development', 'test', () => ({
      error: { code: 'ETIMEDOUT' },
      stdout: '',
      status: null,
      signal: null,
    })),
    { state: 'unreachable', phase: 'subprocess', detail: 'ETIMEDOUT' },
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

test('canonicalizes hostile outer subprocess errors without disclosure', () => {
  const cases = [
    ['EACCES', { state: 'sandbox-denied', detail: 'EACCES' }],
    ['EPERM', { state: 'sandbox-denied', detail: 'EPERM' }],
    ['UNKNOWN_SECRET_CODE'],
    ['TOKEN'],
    ['12345'],
    ['postgres://user:password@host/database'],
    ['X'.repeat(20_000)],
    [{ password: 'object-secret' }],
    [12345n],
    [null],
    [undefined],
  ];
  const circular = { password: 'circular-secret' };
  circular.self = circular;
  cases.push([circular]);

  for (const [
    code,
    expected = { state: 'tooling-missing', detail: 'probe-bootstrap' },
  ] of cases) {
    const result = probePostgres('development', 'test', () => ({
      error: { code },
      stdout: '',
      status: null,
      signal: null,
    }));
    assert.deepEqual(result, expected);
    assert.doesNotMatch(
      JSON.stringify(result),
      /TOKEN|12345|password|UNKNOWN_SECRET_CODE|XXXXX|object-secret|circular-secret/,
    );
  }

  for (const mode of ['alternating', 'throwing']) {
    let reads = 0;
    const error = {};
    Object.defineProperty(error, 'code', {
      get() {
        reads++;
        if (mode === 'throwing') throw new Error('outer-getter-secret');
        return reads === 1 ? 'TOKEN' : 'EACCES';
      },
    });
    const result = probePostgres('development', 'test', () => ({
      error,
      stdout: '',
      status: null,
      signal: null,
    }));
    assert.deepEqual(result, {
      state: 'tooling-missing',
      detail: 'probe-bootstrap',
    });
    assert.equal(reads, 1, mode);
    assert.doesNotMatch(JSON.stringify(result), /TOKEN|outer-getter-secret/);
  }
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
    [170_011, 180_000],
  ])
    assert.equal(postgresStatus(...pair), 'FAIL');
  assert.equal(postgresStatus(170_011, 170_099), 'PASS');
});

const hostileCodeCases = [
  ['token', "'TOKEN'", 'TOKEN'],
  ['pin', "'12345'", '12345'],
  ['url', "'postgres://user:password@host/database'", 'password'],
  ['long', "'X'.repeat(20000)", 'XXXXX'],
  ['object', "({password:'object-secret'})", 'object-secret'],
  ['bigint', '12345n', '12345'],
  [
    'circular',
    "(()=>{const value={password:'circular-secret'};value.self=value;return value})()",
    'circular-secret',
  ],
  [
    'alternating',
    "(()=>{let reads=0;return Object.defineProperty({},'code',{get(){return ++reads===1?'TOKEN':'EACCES'}})})()",
    'TOKEN',
  ],
  [
    'throwing',
    "Object.defineProperty({},'code',{get(){throw new Error('getter-secret')}})",
    'getter-secret',
  ],
  ['null', 'null', 'null'],
  ['undefined', 'undefined', 'undefined'],
];

async function executeHostileChild({
  phase,
  codeSource,
  target = 'development',
}) {
  const directory = await mkdtemp(join(tmpdir(), 'doctor-hostile-child-'));
  const modulePath = join(directory, 'fake-pg.mjs');
  const log = join(directory, 'calls.log');
  const adapterUrl = new URL(
    './agent-doctor-system-adapter.mjs',
    import.meta.url,
  ).href;
  const failure =
    phase === 'bootstrap'
      ? `throw ${codeSource};`
      : `
import{appendFileSync}from'node:fs';
const log=(target,operation)=>appendFileSync(process.env.LOG,target+':'+operation+'\\n');
const hostile=()=>${codeSource};
export class Client{
 constructor({connectionString}){this.target=connectionString;log(this.target,'constructor');if(this.target===process.env.FAIL_TARGET&&process.env.PHASE==='constructor')throw hostile()}
 async connect(){log(this.target,'connect');if(this.target===process.env.FAIL_TARGET&&process.env.PHASE==='connect')throw hostile()}
 async query(){log(this.target,'query');if(this.target===process.env.FAIL_TARGET&&process.env.PHASE==='query')throw hostile();return{rows:[{server_version_number:170011,can_create_database:true}]}}
 async end(){log(this.target,'cleanup');if(this.target===process.env.FAIL_TARGET&&process.env.PHASE==='cleanup')throw hostile()}
}
export default{Client};`;
  try {
    await writeFile(modulePath, failure);
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        createPostgresChildSource({
          adapterUrl,
          pgSpecifier: pathToFileURL(modulePath).href,
        }),
      ],
      {
        encoding: 'utf8',
        timeout: 2_000,
        env: {
          ...process.env,
          DATABASE_URL: 'development',
          TEST_DATABASE_URL: 'test',
          LOG: log,
          PHASE: phase,
          FAIL_TARGET: target,
        },
      },
    );
    let calls = '';
    try {
      calls = await readFile(log, 'utf8');
    } catch {
      // Bootstrap and constructor failures can occur before the log is created.
    }
    return { ...result, calls };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test(
  'sanitizes hostile generated-child failures at every phase',
  { timeout: 60_000 },
  async () => {
    for (const phase of [
      'bootstrap',
      'constructor',
      'connect',
      'query',
      'cleanup',
    ]) {
      for (const [label, codeSource, forbidden] of hostileCodeCases) {
        const result = await executeHostileChild({ phase, codeSource });
        assert.equal(result.status, 1, `${phase}/${label} exit status`);
        assert.equal(result.signal, null, `${phase}/${label} signal`);
        assert.equal(result.stderr, '', `${phase}/${label} stderr`);
        assert.equal(
          result.stdout.split(SENTINEL).length - 1,
          1,
          `${phase}/${label} sentinel count`,
        );
        const expected =
          phase === 'bootstrap'
            ? { state: 'tooling-missing', detail: 'probe-bootstrap' }
            : {
                state: 'connection-failed',
                target: 'development',
                phase,
                detail: 'EIO',
              };
        const publicResult = classifyPostgresCommand(result);
        assert.deepEqual(publicResult, expected, `${phase}/${label} result`);
        const observable = `${result.stdout}\n${result.stderr}\n${JSON.stringify(publicResult)}`;
        assert.doesNotMatch(observable, /password|stack|Error:| at /i);
        if (!['null', 'undefined'].includes(label))
          assert.doesNotMatch(observable, new RegExp(forbidden));
        if (phase !== 'bootstrap') {
          const lines = result.calls.trim().split('\n');
          assert.equal(
            lines.filter((line) => line === 'test:cleanup').length,
            1,
          );
          assert.equal(
            lines.filter((line) => line === 'development:cleanup').length,
            phase === 'constructor' ? 0 : 1,
          );
          assert.ok(lines.includes('test:query'));
        }
      }
    }
  },
);

test(
  'classifies generated-child failures from the test target',
  { timeout: 10_000 },
  async () => {
    for (const phase of ['constructor', 'connect', 'query', 'cleanup']) {
      const result = await executeHostileChild({
        phase,
        codeSource: "'TOKEN'",
        target: 'test',
      });
      assert.equal(result.status, 1, `${phase} exit status`);
      assert.equal(result.signal, null, `${phase} signal`);
      assert.equal(result.stderr, '', `${phase} stderr`);
      assert.equal(result.stdout.split(SENTINEL).length - 1, 1);
      assert.deepEqual(classifyPostgresCommand(result), {
        state: 'connection-failed',
        target: 'test',
        phase,
        detail: 'EIO',
      });
      const lines = result.calls.trim().split('\n');
      assert.equal(
        lines.filter((line) => line === 'development:cleanup').length,
        1,
      );
      assert.equal(
        lines.filter((line) => line === 'test:cleanup').length,
        phase === 'constructor' ? 0 : 1,
      );
      assert.ok(lines.includes('development:query'));
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /TOKEN/);
    }
  },
);

test('rejects the complete malformed sentinel and target-record matrix', () => {
  const validLine = `${SENTINEL}${JSON.stringify(envelope())}\n`;
  const malformedStdout = [
    '',
    `${SENTINEL}{`,
    `${SENTINEL}null\n`,
    `${SENTINEL}[]\n`,
    `WRONG_${validLine}`,
    validLine + validLine,
  ];
  for (const stdout of malformedStdout)
    assert.deepEqual(
      classifyPostgresCommand({ status: 0, signal: null, error: null, stdout }),
      { state: 'tooling-missing', detail: 'probe-bootstrap' },
    );

  const badRecords = [
    null,
    [],
    {},
    { ...available(), state: 'wrong' },
    { ...available(), serverVersionNumber: '170011' },
    { ...available(), canCreateDatabase: 1 },
    { ...available(), extra: true },
    {
      state: 'connection-failed',
      target: 'development',
      phase: 'wrong',
      code: 'EIO',
    },
    {
      state: 'connection-failed',
      target: 'test',
      phase: 'connect',
      code: 'EIO',
    },
    {
      state: 'connection-failed',
      target: 'development',
      phase: 'connect',
      code: 'TOKEN',
    },
  ];
  for (const development of badRecords)
    assert.deepEqual(classifyPostgresCommand(command(envelope(development))), {
      state: 'tooling-missing',
      detail: 'probe-bootstrap',
    });

  const testFailure = {
    state: 'service-unavailable',
    target: 'test',
    phase: 'connect',
    code: 'ECONNREFUSED',
  };
  assert.deepEqual(
    classifyPostgresCommand(command(envelope(available(), testFailure))),
    {
      state: 'service-unavailable',
      target: 'test',
      phase: 'connect',
      detail: 'ECONNREFUSED',
    },
  );

  assert.deepEqual(
    classifyPostgresCommand({
      status: 0,
      signal: null,
      error: null,
      stdout: `pnpm banner\n${validLine}pnpm trailer\n`,
    }),
    {
      state: 'available',
      serverVersionNumber: 170_011,
      canCreateDatabase: true,
      allTargetsCanCreateDatabase: true,
      targets: { development: available(), test: available() },
    },
  );
});

test('snapshots every hostile command property exactly once', () => {
  const expectedAvailable = {
    state: 'available',
    serverVersionNumber: 170_011,
    canCreateDatabase: true,
    allTargetsCanCreateDatabase: true,
    targets: { development: available(), test: available() },
  };
  for (const property of ['error', 'stdout', 'status', 'signal']) {
    for (const mode of ['stable', 'alternating', 'throwing']) {
      let reads = 0;
      const values = command(envelope());
      Object.defineProperty(values, property, {
        get() {
          reads++;
          if (mode === 'throwing') throw new Error('getter-secret');
          if (mode === 'alternating' && reads > 1)
            throw new Error('second-read-secret');
          return command(envelope())[property];
        },
      });
      const result = classifyPostgresCommand(values);
      assert.deepEqual(
        result,
        mode === 'throwing'
          ? { state: 'tooling-missing', detail: 'probe-bootstrap' }
          : expectedAvailable,
        `${property}/${mode} result`,
      );
      assert.equal(reads, 1, `${property}/${mode}`);
      assert.doesNotMatch(JSON.stringify(result), /getter-secret|second-read/);
    }
  }
});

test('fails closed for hostile nested protocol objects', () => {
  const hostileTargets = [
    Object.create(null),
    new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('secret');
        },
      },
    ),
    new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('secret');
        },
      },
    ),
  ];
  const originalParse = JSON.parse;
  try {
    for (const targets of hostileTargets) {
      JSON.parse = () => ({ phase: 'targets', targets });
      assert.doesNotThrow(() =>
        assert.deepEqual(classifyPostgresCommand(command(envelope())), {
          state: 'tooling-missing',
          detail: 'probe-bootstrap',
        }),
      );
    }
    const payload = envelope();
    Object.defineProperty(payload.targets.development, 'state', {
      get() {
        throw new Error('nested-secret');
      },
    });
    JSON.parse = () => payload;
    const result = classifyPostgresCommand(command(envelope()));
    assert.deepEqual(result, {
      state: 'tooling-missing',
      detail: 'probe-bootstrap',
    });
    assert.doesNotMatch(JSON.stringify(result), /nested-secret/);
  } finally {
    JSON.parse = originalParse;
  }
});

test('rejects hostile query response getters and value types', async () => {
  const assertQueryFailures = (targets) => {
    for (const target of ['development', 'test']) {
      assert.deepEqual(targets[target], {
        state: 'connection-failed',
        target,
        phase: 'query',
        code: 'EIO',
      });
      assert.deepEqual(Reflect.ownKeys(targets[target]).sort(), [
        'code',
        'phase',
        'state',
        'target',
      ]);
    }
    assert.doesNotMatch(JSON.stringify(targets), /secret/i);
  };
  const hostileRows = [
    null,
    undefined,
    {},
    12345n,
    Symbol('secret'),
    [],
    [{ server_version_number: '170011', can_create_database: true }],
    [{ server_version_number: 170_011, can_create_database: 1 }],
  ];
  for (const rows of hostileRows) {
    const calls = counts();
    class Client {
      constructor({ connectionString }) {
        this.target = connectionString;
        calls[this.target][0]++;
      }
      async connect() {
        calls[this.target][1]++;
      }
      async query() {
        calls[this.target][2]++;
        return { rows };
      }
      async end() {
        calls[this.target][3]++;
      }
    }
    const targets = await probePostgresTargets({
      databaseUrl: 'development',
      testDatabaseUrl: 'test',
      Client,
      operationTimeout: 100,
    });
    assertQueryFailures(targets);
    assert.deepEqual(calls.development, [1, 1, 1, 1]);
    assert.deepEqual(calls.test, [1, 1, 1, 1]);
  }
  for (const hostile of [
    {
      get rows() {
        throw new Error('rows-secret');
      },
    },
    {
      rows: [
        {
          get server_version_number() {
            throw new Error('row-secret');
          },
        },
      ],
    },
    {
      rows: [
        {
          server_version_number: 170_011,
          get can_create_database() {
            throw new Error('capability-secret');
          },
        },
      ],
    },
  ]) {
    const calls = counts();
    class Client {
      constructor({ connectionString }) {
        this.target = connectionString;
        calls[this.target][0]++;
      }
      async connect() {
        calls[this.target][1]++;
      }
      async query() {
        calls[this.target][2]++;
        return hostile;
      }
      async end() {
        calls[this.target][3]++;
      }
    }
    const targets = await probePostgresTargets({
      databaseUrl: 'development',
      testDatabaseUrl: 'test',
      Client,
      operationTimeout: 100,
    });
    assertQueryFailures(targets);
    assert.deepEqual(calls.development, [1, 1, 1, 1]);
    assert.deepEqual(calls.test, [1, 1, 1, 1]);
  }
});

test(
  'standalone generated child times out and exits without a live handle',
  { timeout: 10_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'doctor-timeout-child-'));
    const modulePath = join(directory, 'pending-pg.mjs');
    const log = join(directory, 'calls.log');
    try {
      await writeFile(
        modulePath,
        `import{appendFileSync}from'node:fs';export class Client{constructor({connectionString}){this.t=connectionString}connect(){return new Promise(()=>{})}async end(){appendFileSync(process.env.LOG,this.t+'\\n')}}export default{Client}`,
      );
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          createPostgresChildSource({
            adapterUrl: new URL(
              './agent-doctor-system-adapter.mjs',
              import.meta.url,
            ).href,
            pgSpecifier: pathToFileURL(modulePath).href,
          }),
        ],
        {
          encoding: 'utf8',
          timeout: 8_000,
          env: {
            ...process.env,
            DATABASE_URL: 'development',
            TEST_DATABASE_URL: 'test',
            LOG: log,
          },
        },
      );
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.equal(result.signal, null);
      assert.equal(result.stderr, '');
      assert.equal(result.stdout.split(SENTINEL).length - 1, 1);
      assert.deepEqual(classifyPostgresCommand(result), {
        state: 'unreachable',
        target: 'development',
        phase: 'connect',
        detail: 'ETIMEDOUT',
      });
      assert.deepEqual(
        (await readFile(log, 'utf8')).trim().split('\n').sort(),
        ['development', 'test'],
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
