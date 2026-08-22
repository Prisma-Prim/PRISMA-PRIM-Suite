import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  createManagedPostgresRunner,
  createSystemAdapter,
} from './managed-postgres.mjs';
import { skipWithoutDetachedProcessGroups } from './process-group-test-support.mjs';

const environmentDocumentation = await readFile(
  new URL('../docs/agents/environment.md', import.meta.url),
  'utf8',
);

function createFakeAdapter(onRun = () => undefined) {
  const calls = [];
  const temporaryDirectories = [];
  const removedTemporaryDirectories = [];

  return {
    calls,
    removedTemporaryDirectories,
    temporaryDirectories,
    createRunId: () => 'test-run-42',
    createTemporaryDirectory: async () => {
      const path = '/tmp/prisma-prim-managed-postgres-test-run-42';
      temporaryDirectories.push(path);
      return path;
    },
    delay: async () => undefined,
    removeTemporaryDirectory: async (path) => {
      removedTemporaryDirectories.push(path);
    },
    run: async (command, args, options = {}) => {
      const call = { command, args, options };
      calls.push(call);
      const overridden = onRun(call, calls);
      if (overridden) {
        return overridden;
      }
      if (command === 'docker' && args[0] === 'port') {
        return { status: 0, stdout: '127.0.0.1:35432\n', stderr: '' };
      }
      if (command === 'docker' && args[0] === 'inspect') {
        return { status: 0, stdout: 'healthy\n', stderr: '' };
      }
      if (
        command === 'docker' &&
        ['container', 'network', 'volume'].includes(args[0]) &&
        args[1] === 'inspect'
      ) {
        return {
          status: 1,
          stdout: '',
          stderr: `No such ${args[0]}`,
        };
      }
      return { status: 0, stdout: '', stderr: '' };
    },
  };
}

function resourceRemovals(adapter) {
  return adapter.calls
    .filter(
      ({ command, args }) =>
        command === 'docker' &&
        ((args[0] === 'rm' && args[1] === '--force') ||
          (args[0] === 'network' && args[1] === 'rm') ||
          (args[0] === 'volume' && args[1] === 'rm')),
    )
    .map(({ args }) => args.at(-1));
}

test('runs pristine migrations and the requested verification against disposable PostgreSQL', async () => {
  const adapter = createFakeAdapter();
  const runner = createManagedPostgresRunner(adapter);

  const result = await runner.run({
    command: 'corepack',
    args: ['pnpm', 'test:unit'],
    environment: { PATH: '/usr/bin' },
  });

  assert.equal(result.status, 0);
  assert.equal(
    adapter.calls
      .filter(({ command }) => command === 'docker')
      .every(({ options }) => Number.isInteger(options.timeoutMilliseconds)),
    true,
  );
  const migration = adapter.calls.find(
    ({ command, args }) =>
      command === 'corepack' && args.includes('db:migrate'),
  );
  const verification = adapter.calls.find(
    ({ command, args }) => command === 'corepack' && args.includes('test:unit'),
  );
  assert.match(
    migration.options.env.DATABASE_URL,
    /127\.0\.0\.1:35432\/prisma_prim_dev$/,
  );
  assert.equal(verification.options.timeoutMilliseconds, undefined);
  assert.match(
    verification.options.env.TEST_DATABASE_URL,
    /127\.0\.0\.1:35432\/prisma_prim_test$/,
  );
  assert.equal(
    migration.options.env.TMPDIR,
    '/tmp/prisma-prim-managed-postgres-test-run-42',
  );

  const container = adapter.calls.find(
    ({ command, args }) => command === 'docker' && args[0] === 'run',
  );
  assert.equal(container.args.includes('--volume'), true);
  assert.match(
    container.args[container.args.indexOf('--health-cmd') + 1],
    /\/proc\/1\/comm.*postgres.*pg_isready/,
  );
  assert.equal(
    container.args.some((argument) => argument.includes('/tmp/')),
    false,
  );
  assert.deepEqual(resourceRemovals(adapter), [
    'prisma-prim-postgres-test-run-42',
    'prisma-prim-postgres-test-run-42-data',
    'prisma-prim-postgres-test-run-42-network',
  ]);
  assert.deepEqual(adapter.removedTemporaryDirectories, [
    '/tmp/prisma-prim-managed-postgres-test-run-42',
  ]);
});

test('rejects Windows before temporary or Docker resource creation', async () => {
  const adapter = createFakeAdapter();
  const runner = createManagedPostgresRunner(adapter, { platform: 'win32' });

  await assert.rejects(
    runner.run({ environment: { PATH: '/usr/bin' } }),
    /not supported on Windows.*native PostgreSQL.*POSIX\/Linux Docker harness/,
  );
  assert.deepEqual(adapter.temporaryDirectories, []);
  assert.deepEqual(adapter.calls, []);
});

test('rejects a lexical temporary root inside the repository before creating state', async () => {
  let temporaryDirectoryCreated = false;
  const adapter = createSystemAdapter({
    canonicalizePath: async (path) => path,
    makeTemporaryDirectory: async () => {
      temporaryDirectoryCreated = true;
      return '/unused';
    },
    temporaryRoot: join(process.cwd(), '.managed-postgres-temp'),
  });

  await assert.rejects(
    adapter.createTemporaryDirectory(),
    /temporary root resolves inside the repository checkout.*Set TMPDIR to an external directory such as \/tmp/,
  );
  assert.equal(temporaryDirectoryCreated, false);
});

test('rejects a canonical temporary root that resolves through a link into the repository', async () => {
  let temporaryDirectoryCreated = false;
  const apparentTemporaryRoot = resolve(
    '/tmp/prisma-prim-managed-postgres-apparent-root',
  );
  const canonicalRepositoryRoot = resolve(process.cwd());
  const adapter = createSystemAdapter({
    canonicalizePath: async (path) =>
      path === apparentTemporaryRoot
        ? join(canonicalRepositoryRoot, '.managed-postgres-temp')
        : canonicalRepositoryRoot,
    makeTemporaryDirectory: async () => {
      temporaryDirectoryCreated = true;
      return '/unused';
    },
    temporaryRoot: apparentTemporaryRoot,
  });

  await assert.rejects(
    adapter.createTemporaryDirectory(),
    /temporary root resolves inside the repository checkout.*Set TMPDIR to an external directory such as \/tmp/,
  );
  assert.equal(temporaryDirectoryCreated, false);
});

test('reconciles exact resource names after bounded creation and cleanup failures', async () => {
  const timeout = new Error('command timed out');
  timeout.name = 'CommandTimeoutError';
  const adapter = createFakeAdapter(({ command, args }) => {
    if (command === 'docker' && args[0] === 'network' && args[1] === 'create') {
      throw timeout;
    }
    if (command === 'docker' && args[0] === 'network' && args[1] === 'rm') {
      throw timeout;
    }
    if (
      command === 'docker' &&
      args[0] === 'network' &&
      args[1] === 'inspect'
    ) {
      throw timeout;
    }
    return undefined;
  });
  const runner = createManagedPostgresRunner(adapter, {
    infrastructureTimeoutMilliseconds: 25,
  });

  await assert.rejects(
    runner.run({ environment: { PATH: '/usr/bin' } }),
    (error) => {
      assert.match(error.message, /run test-run-42/);
      assert.match(
        error.message,
        /network=prisma-prim-postgres-test-run-42-network/,
      );
      assert.match(
        error.message,
        /com\.prisma-prim\.managed-postgres\.run=test-run-42/,
      );
      assert.match(error.message, /Operation: command timed out/);
      assert.match(
        error.message,
        /network cleanup failed: absence was not established/,
      );
      return true;
    },
  );
  assert.deepEqual(resourceRemovals(adapter), []);
});

test('never removes an uncertain exact resource with an unexpected run label', async () => {
  const timeout = new Error('network creation timed out');
  timeout.name = 'CommandTimeoutError';
  let removalAttempts = 0;
  const adapter = createFakeAdapter(({ command, args }) => {
    if (command === 'docker' && args[0] === 'network' && args[1] === 'create') {
      throw timeout;
    }
    if (command === 'docker' && args[0] === 'network' && args[1] === 'rm') {
      removalAttempts += 1;
      return { status: 0, stdout: '', stderr: '' };
    }
    if (
      command === 'docker' &&
      args[0] === 'network' &&
      args[1] === 'inspect'
    ) {
      return { status: 0, stdout: 'another-run\n', stderr: '' };
    }
    return undefined;
  });
  const runner = createManagedPostgresRunner(adapter, {
    infrastructureTimeoutMilliseconds: 25,
    reconciliationAttempts: 3,
    reconciliationIntervalMilliseconds: 0,
  });

  await assert.rejects(
    runner.run({ environment: { PATH: '/usr/bin' } }),
    (error) => {
      assert.match(error.message, /unexpected run label another-run/);
      assert.match(error.message, /absence was not established/);
      return true;
    },
  );
  assert.equal(removalAttempts, 0);
});

test('does not treat a missing Docker context as resource absence', async () => {
  const timeout = new Error('network creation timed out');
  timeout.name = 'CommandTimeoutError';
  let inspections = 0;
  const adapter = createFakeAdapter(({ command, args }) => {
    if (command === 'docker' && args[0] === 'network' && args[1] === 'create') {
      throw timeout;
    }
    if (command === 'docker' && args[0] === 'network' && args[1] === 'rm') {
      return { status: 1, stdout: '', stderr: 'No such network' };
    }
    if (
      command === 'docker' &&
      args[0] === 'network' &&
      args[1] === 'inspect'
    ) {
      inspections += 1;
      return {
        status: 1,
        stdout: '',
        stderr: 'docker context "managed" not found token=context-secret',
      };
    }
    return undefined;
  });
  const runner = createManagedPostgresRunner(adapter, {
    infrastructureTimeoutMilliseconds: 25,
    reconciliationAttempts: 3,
    reconciliationIntervalMilliseconds: 0,
  });

  await assert.rejects(
    runner.run({ environment: { PATH: '/usr/bin' } }),
    (error) => {
      assert.match(error.message, /absence was not established/);
      assert.match(error.message, /last error: inspection failed/);
      assert.match(
        error.message,
        /docker context "managed" not found token=\[redacted\]/,
      );
      assert.doesNotMatch(error.message, /context-secret/);
      assert.doesNotMatch(error.message, /Cleanup: network=removed/);
      return true;
    },
  );
  assert.equal(inspections, 3);
});

test('observes and removes a resource that appears after an initial missing state', async () => {
  const timeout = new Error('network creation timed out');
  timeout.name = 'CommandTimeoutError';
  let lateResourcePresent = false;
  let lateAppearanceInjected = false;
  let absenceObservations = 0;
  let removalAttempts = 0;
  const adapter = createFakeAdapter(({ command, args }) => {
    if (command === 'docker' && args[0] === 'network' && args[1] === 'create') {
      throw timeout;
    }
    if (command === 'docker' && args[0] === 'network' && args[1] === 'rm') {
      removalAttempts += 1;
      if (!lateResourcePresent) {
        return { status: 1, stdout: '', stderr: 'No such network' };
      }
      lateResourcePresent = false;
      return { status: 0, stdout: '', stderr: '' };
    }
    if (
      command === 'docker' &&
      args[0] === 'network' &&
      args[1] === 'inspect'
    ) {
      if (lateResourcePresent) {
        return { status: 0, stdout: 'test-run-42\n', stderr: '' };
      }
      absenceObservations += 1;
      return { status: 1, stdout: '', stderr: 'No such network' };
    }
    return undefined;
  });
  adapter.delay = async () => {
    if (absenceObservations === 1 && !lateAppearanceInjected) {
      lateAppearanceInjected = true;
      lateResourcePresent = true;
    }
  };
  const runner = createManagedPostgresRunner(adapter, {
    infrastructureTimeoutMilliseconds: 25,
    reconciliationIntervalMilliseconds: 1,
  });

  await assert.rejects(
    runner.run({ environment: { PATH: '/usr/bin' } }),
    (error) => {
      assert.match(error.message, /Operation: network creation timed out/);
      assert.match(error.message, /Cleanup: network=removed/);
      return true;
    },
  );
  assert.equal(removalAttempts, 1);
  assert.equal(lateResourcePresent, false);
  assert.ok(absenceObservations >= 3);
});

test('removes the readiness abort listener when the delay timer settles', async () => {
  let listener;
  let added = 0;
  let removed = 0;
  const signal = {
    aborted: false,
    addEventListener: (_event, nextListener) => {
      added += 1;
      listener = nextListener;
    },
    removeEventListener: (_event, removedListener) => {
      assert.equal(removedListener, listener);
      removed += 1;
    },
  };

  await createSystemAdapter().delay(0, signal);

  assert.equal(added, 1);
  assert.equal(removed, 1);
});

test('interrupts and awaits a SIGTERM-resistant verification process tree before cleanup', async (context) => {
  if (await skipWithoutDetachedProcessGroups(context)) {
    return;
  }
  const fixtureDirectory = await mkdtemp(
    join(tmpdir(), 'prisma-prim-process-tree-test-'),
  );
  const readyFile = join(fixtureDirectory, 'ready');
  const pidFile = join(fixtureDirectory, 'pids');
  const controller = new AbortController();
  const systemAdapter = createSystemAdapter({
    terminationGraceMilliseconds: 50,
  });
  let childPids = [];
  let cleanupObservedDeadTree = false;
  const adapter = createFakeAdapter((call) => {
    if (call.command === process.execPath) {
      return systemAdapter.run(call.command, call.args, call.options);
    }
    if (
      call.command === 'docker' &&
      call.args[0] === 'rm' &&
      call.args[1] === '--force'
    ) {
      cleanupObservedDeadTree = childPids.every((pid) => !processExists(pid));
    }
    return undefined;
  });
  const runner = createManagedPostgresRunner(adapter, {
    infrastructureTimeoutMilliseconds: 500,
  });
  const descendantSource =
    'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);';
  const parentSource = [
    'const { spawn } = require("node:child_process");',
    'const { writeFileSync } = require("node:fs");',
    'process.on("SIGTERM", () => {});',
    `const child = spawn(process.execPath, ["--eval", ${JSON.stringify(descendantSource)}], { stdio: "ignore" });`,
    'writeFileSync(process.env.PID_FILE, `${process.pid},${child.pid}`);',
    'writeFileSync(process.env.READY_FILE, "ready");',
    'setInterval(() => {}, 1000);',
  ].join(' ');

  try {
    const runPromise = runner.run({
      command: process.execPath,
      args: ['--eval', parentSource],
      environment: {
        ...process.env,
        PID_FILE: pidFile,
        READY_FILE: readyFile,
      },
      signal: controller.signal,
    });
    await waitForFile(readyFile, 2_000);
    childPids = (await readFile(pidFile, 'utf8')).split(',').map(Number);
    controller.abort();

    await assert.rejects(runPromise, /interrupted/i);
    assert.equal(cleanupObservedDeadTree, true);
    assert.equal(
      childPids.every((pid) => !processExists(pid)),
      true,
    );
  } finally {
    for (const pid of childPids) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // The regression expects every process to be gone already.
      }
    }
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
});

test('cleans exact resources when migration setup fails', async () => {
  const adapter = createFakeAdapter(({ command, args }) => {
    if (command === 'corepack' && args.includes('db:migrate')) {
      return { status: 1, stdout: '', stderr: 'migration failed' };
    }
    return undefined;
  });
  const runner = createManagedPostgresRunner(adapter);

  await assert.rejects(
    runner.run({ environment: { PATH: '/usr/bin' } }),
    /pristine migration failed/,
  );
  assert.deepEqual(resourceRemovals(adapter), [
    'prisma-prim-postgres-test-run-42',
    'prisma-prim-postgres-test-run-42-data',
    'prisma-prim-postgres-test-run-42-network',
  ]);
});

test('cleans exact resources when verification is interrupted', async () => {
  const interruption = new Error('interrupted');
  interruption.name = 'AbortError';
  const adapter = createFakeAdapter(({ command, args }) => {
    if (command === 'corepack' && args.includes('test:unit')) {
      throw interruption;
    }
    return undefined;
  });
  const runner = createManagedPostgresRunner(adapter);

  await assert.rejects(
    runner.run({
      command: 'corepack',
      args: ['pnpm', 'test:unit'],
      environment: { PATH: '/usr/bin' },
    }),
    { name: 'AbortError' },
  );
  assert.deepEqual(resourceRemovals(adapter), [
    'prisma-prim-postgres-test-run-42',
    'prisma-prim-postgres-test-run-42-data',
    'prisma-prim-postgres-test-run-42-network',
  ]);
});

test('cleans each resource when interrupted during its atomic creation', async (context) => {
  const cases = [
    {
      name: 'network',
      matches: ({ command, args }) =>
        command === 'docker' && args[0] === 'network' && args[1] === 'create',
      removals: ['prisma-prim-postgres-test-run-42-network'],
    },
    {
      name: 'volume',
      matches: ({ command, args }) =>
        command === 'docker' && args[0] === 'volume' && args[1] === 'create',
      removals: [
        'prisma-prim-postgres-test-run-42-data',
        'prisma-prim-postgres-test-run-42-network',
      ],
    },
    {
      name: 'container',
      matches: ({ command, args }) => command === 'docker' && args[0] === 'run',
      removals: [
        'prisma-prim-postgres-test-run-42',
        'prisma-prim-postgres-test-run-42-data',
        'prisma-prim-postgres-test-run-42-network',
      ],
    },
  ];

  for (const testCase of cases) {
    await context.test(testCase.name, async () => {
      const controller = new AbortController();
      const adapter = createFakeAdapter((call) => {
        if (testCase.matches(call)) {
          controller.abort();
          assert.equal(call.options.signal, undefined);
        }
        return undefined;
      });
      const runner = createManagedPostgresRunner(adapter);

      await assert.rejects(
        runner.run({
          environment: { PATH: '/usr/bin' },
          signal: controller.signal,
        }),
        { name: 'AbortError' },
      );
      assert.deepEqual(resourceRemovals(adapter), testCase.removals);
    });
  }
});

test('returns a failed verification status only after cleanup completes', async () => {
  const adapter = createFakeAdapter(({ command, args }) => {
    if (command === 'corepack' && args.includes('test:unit')) {
      return { status: 7, stdout: '', stderr: '' };
    }
    return undefined;
  });
  const runner = createManagedPostgresRunner(adapter);

  const result = await runner.run({
    command: 'corepack',
    args: ['pnpm', 'test:unit'],
    environment: { PATH: '/usr/bin' },
  });

  assert.equal(result.status, 7);
  assert.deepEqual(resourceRemovals(adapter), [
    'prisma-prim-postgres-test-run-42',
    'prisma-prim-postgres-test-run-42-data',
    'prisma-prim-postgres-test-run-42-network',
  ]);
});

test('finishes unsignalled cleanup then preserves an interruption received during cleanup', async () => {
  const controller = new AbortController();
  const interruption = new Error('Interrupted by SIGINT');
  interruption.name = 'AbortError';
  let interruptedDuringCleanup = false;
  const adapter = createFakeAdapter((call) => {
    if (
      call.command === 'docker' &&
      call.args[0] === 'rm' &&
      call.args[1] === '--force'
    ) {
      assert.equal(call.options.signal, undefined);
      if (!interruptedDuringCleanup) {
        interruptedDuringCleanup = true;
        controller.abort(interruption);
      }
    }
    return undefined;
  });
  const runner = createManagedPostgresRunner(adapter);

  await assert.rejects(
    runner.run({
      environment: { PATH: '/usr/bin' },
      signal: controller.signal,
    }),
    (error) => {
      assert.equal(error.name, 'AbortError');
      assert.match(error.message, /Interrupted by SIGINT/);
      return true;
    },
  );
  assert.deepEqual(resourceRemovals(adapter), [
    'prisma-prim-postgres-test-run-42',
    'prisma-prim-postgres-test-run-42-data',
    'prisma-prim-postgres-test-run-42-network',
  ]);
  assert.deepEqual(adapter.removedTemporaryDirectories, [
    '/tmp/prisma-prim-managed-postgres-test-run-42',
  ]);
});

test('fails bounded readiness checks and cleans before running migrations', async () => {
  let readinessChecks = 0;
  const adapter = createFakeAdapter(({ command, args }) => {
    if (command === 'docker' && args[0] === 'inspect') {
      readinessChecks += 1;
      return { status: 0, stdout: 'starting\n', stderr: '' };
    }
    return undefined;
  });
  const runner = createManagedPostgresRunner(adapter, { readinessAttempts: 3 });

  await assert.rejects(
    runner.run({ environment: { PATH: '/usr/bin' } }),
    /did not become ready/,
  );
  assert.equal(readinessChecks, 3);
  assert.equal(
    adapter.calls.some(
      ({ command, args }) =>
        command === 'corepack' && args.includes('db:migrate'),
    ),
    false,
  );
  assert.deepEqual(resourceRemovals(adapter), [
    'prisma-prim-postgres-test-run-42',
    'prisma-prim-postgres-test-run-42-data',
    'prisma-prim-postgres-test-run-42-network',
  ]);
});

test('reports a sanitized Docker startup stderr excerpt for an unrecognized nonzero exit', async () => {
  const adapter = createFakeAdapter(({ command, args }) => {
    if (command === 'docker' && args[0] === 'run') {
      return {
        status: 125,
        stdout: '',
        stderr:
          'Unable to find image postgres:17-alpine for postgresql://image-user:image-password@example.invalid/database password=hunter2',
      };
    }
    return undefined;
  });
  const runner = createManagedPostgresRunner(adapter, {
    reconciliationIntervalMilliseconds: 0,
  });

  await assert.rejects(
    runner.run({ environment: { PATH: '/usr/bin' } }),
    (error) => {
      assert.match(
        error.message,
        /container startup failed with exit status 125/,
      );
      assert.match(error.message, /Unable to find image postgres:17-alpine/);
      assert.match(error.message, /\[redacted PostgreSQL URL\]/);
      assert.match(error.message, /password=\[redacted\]/);
      assert.doesNotMatch(error.message, /image-password|hunter2/);
      return true;
    },
  );
});

test('recovers a confirmed resource after transient removal failure', async () => {
  let networkPresent = true;
  let networkInspections = 0;
  let networkRemovals = 0;
  const adapter = createFakeAdapter(({ command, args }) => {
    if (command === 'docker' && args[0] === 'network' && args[1] === 'rm') {
      networkRemovals += 1;
      if (networkRemovals === 1) {
        return {
          status: 1,
          stdout: '',
          stderr: 'network has active endpoints',
        };
      }
      networkPresent = false;
      return { status: 0, stdout: '', stderr: '' };
    }
    if (
      command === 'docker' &&
      args[0] === 'network' &&
      args[1] === 'inspect'
    ) {
      networkInspections += 1;
      return networkPresent
        ? { status: 0, stdout: 'test-run-42\n', stderr: '' }
        : { status: 1, stdout: '', stderr: 'No such network' };
    }
    return undefined;
  });
  const runner = createManagedPostgresRunner(adapter, {
    reconciliationIntervalMilliseconds: 0,
  });

  const result = await runner.run({ environment: { PATH: '/usr/bin' } });

  assert.equal(result.status, 0);
  assert.equal(networkRemovals, 2);
  assert.equal(networkInspections, 4);
});

test('confirms stable absence after the final allowed removal retry succeeds', async () => {
  let networkPresent = true;
  let networkInspections = 0;
  let networkRemovals = 0;
  const adapter = createFakeAdapter(({ command, args }) => {
    if (command === 'docker' && args[0] === 'network' && args[1] === 'rm') {
      networkRemovals += 1;
      if (networkRemovals <= 8) {
        return {
          status: 1,
          stdout: '',
          stderr: 'network has active endpoints',
        };
      }
      networkPresent = false;
      return { status: 0, stdout: '', stderr: '' };
    }
    if (
      command === 'docker' &&
      args[0] === 'network' &&
      args[1] === 'inspect'
    ) {
      networkInspections += 1;
      return networkPresent
        ? { status: 0, stdout: 'test-run-42\n', stderr: '' }
        : { status: 1, stdout: '', stderr: 'No such network' };
    }
    return undefined;
  });
  const runner = createManagedPostgresRunner(adapter, {
    reconciliationIntervalMilliseconds: 0,
  });

  const result = await runner.run({ environment: { PATH: '/usr/bin' } });

  assert.equal(result.status, 0);
  assert.equal(networkRemovals, 9);
  assert.equal(networkInspections, 11);
});

test('accepts stable absence after a confirmed removal command times out', async () => {
  const timeout = new Error('network removal timed out');
  timeout.name = 'CommandTimeoutError';
  let networkInspections = 0;
  let networkRemovals = 0;
  const adapter = createFakeAdapter(({ command, args }) => {
    if (command === 'docker' && args[0] === 'network' && args[1] === 'rm') {
      networkRemovals += 1;
      throw timeout;
    }
    if (
      command === 'docker' &&
      args[0] === 'network' &&
      args[1] === 'inspect'
    ) {
      networkInspections += 1;
      return { status: 1, stdout: '', stderr: 'No such network' };
    }
    return undefined;
  });
  const runner = createManagedPostgresRunner(adapter, {
    reconciliationIntervalMilliseconds: 0,
  });

  const result = await runner.run({ environment: { PATH: '/usr/bin' } });

  assert.equal(result.status, 0);
  assert.equal(networkRemovals, 1);
  assert.equal(networkInspections, 3);
});

test('attempts every exact cleanup target and reports cleanup failures', async () => {
  let networkInspections = 0;
  let networkRemovals = 0;
  const adapter = createFakeAdapter(({ command, args }) => {
    if (command === 'docker' && args[0] === 'network' && args[1] === 'rm') {
      networkRemovals += 1;
      return {
        status: 1,
        stdout: '',
        stderr:
          'network has active endpoints at postgresql://local-user:local-password@127.0.0.1:5432/prisma_prim_test token=cleanup-secret',
      };
    }
    if (
      command === 'docker' &&
      args[0] === 'network' &&
      args[1] === 'inspect'
    ) {
      networkInspections += 1;
      return { status: 0, stdout: 'test-run-42\n', stderr: '' };
    }
    return undefined;
  });
  const runner = createManagedPostgresRunner(adapter, {
    reconciliationAttempts: 3,
    reconciliationIntervalMilliseconds: 0,
  });

  await assert.rejects(
    runner.run({ environment: { PATH: '/usr/bin' } }),
    (error) => {
      assert.match(
        error.message,
        /network cleanup failed: absence was not established.*last error: exit status 1.*network has active endpoints/,
      );
      assert.match(error.message, /\[redacted PostgreSQL URL\]/);
      assert.match(error.message, /token=\[redacted\]/);
      assert.doesNotMatch(error.message, /local-password|cleanup-secret/);
      return true;
    },
  );
  assert.deepEqual(resourceRemovals(adapter), [
    'prisma-prim-postgres-test-run-42',
    'prisma-prim-postgres-test-run-42-data',
    'prisma-prim-postgres-test-run-42-network',
    'prisma-prim-postgres-test-run-42-network',
    'prisma-prim-postgres-test-run-42-network',
    'prisma-prim-postgres-test-run-42-network',
  ]);
  assert.equal(networkInspections, 3);
  assert.equal(networkRemovals, 4);
  assert.deepEqual(adapter.removedTemporaryDirectories, [
    '/tmp/prisma-prim-managed-postgres-test-run-42',
  ]);
});

test('documents the direct managed runner while preserving native PostgreSQL', () => {
  assert.match(
    environmentDocumentation,
    /node scripts\/managed-postgres\.mjs -- corepack pnpm test:unit/,
  );
  assert.doesNotMatch(
    environmentDocumentation,
    /corepack pnpm postgres:managed --/,
  );
  assert.match(
    environmentDocumentation,
    /bash scripts\/codex-cloud-maintenance\.sh --profile postgres/,
  );
  assert.match(
    environmentDocumentation,
    /ChatGPT Work mode.*capability probe.*skip/i,
  );
  assert.match(
    environmentDocumentation,
    /GitHub Actions.*real POSIX process-group coverage/i,
  );
});

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

async function waitForFile(path, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      await readFile(path);
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
  }
  throw new Error(`Fixture did not become ready: ${path}`);
}
