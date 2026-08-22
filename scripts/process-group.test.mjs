import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSystemAdapter } from './managed-postgres.mjs';
import {
  createProcessGroupController,
  probeDetachedProcessGroupCapability,
} from './process-group.mjs';
import { skipWithoutDetachedProcessGroups } from './process-group-test-support.mjs';

test('covers TERM to KILL escalation without launching a detached process', async () => {
  const signals = [];
  const observedStates = [['S'], []];
  const controller = createProcessGroupController({
    groupExists: () => true,
    platform: 'linux',
    readProcessGroupStates: async () => observedStates.shift() ?? [],
    signalProcessGroup: (processGroupId, signal) => {
      signals.push([processGroupId, signal]);
    },
  });

  await controller.terminate({ pid: 987_654_321 }, Promise.resolve(), 0);

  assert.deepEqual(signals, [
    [987_654_321, 'SIGTERM'],
    [987_654_321, 'SIGKILL'],
  ]);
});

test('reports an actionable fallback when a spawned process is not observable', async () => {
  const listeners = new Map();
  const killedSignals = [];
  let probeSource = '';
  let unreferenced = false;
  const child = {
    pid: 42,
    kill: (signal) => {
      killedSignals.push(signal);
      return false;
    },
    once: (event, listener) => {
      listeners.set(event, listener);
      return child;
    },
    unref: () => {
      unreferenced = true;
    },
  };
  const capability = await probeDetachedProcessGroupCapability({
    closeTimeoutMilliseconds: 5,
    platform: 'linux',
    readProcessStat: async () => {
      const error = new Error('missing');
      error.code = 'ENOENT';
      throw error;
    },
    spawnProcess: (_command, args) => {
      probeSource = args.at(-1);
      queueMicrotask(() => listeners.get('spawn')?.());
      return child;
    },
  });

  assert.equal(capability.supported, false);
  assert.match(capability.reason, /not expose.*\/proc/i);
  assert.match(capability.reason, /GitHub Actions.*POSIX/i);
  assert.match(probeSource, /setTimeout.*process\.exit\(0\).*1000/);
  assert.deepEqual(killedSignals, ['SIGKILL']);
  assert.equal(unreferenced, true);
});

test(
  'bounds the capability probe when a harness omits child lifecycle events',
  { timeout: 100 },
  async () => {
    const child = {
      pid: 42,
      kill: () => false,
      once: () => child,
      unref: () => undefined,
    };

    const capability = await probeDetachedProcessGroupCapability({
      closeTimeoutMilliseconds: 5,
      platform: 'linux',
      spawnProcess: () => child,
      spawnTimeoutMilliseconds: 5,
    });

    assert.equal(capability.supported, false);
    assert.match(capability.reason, /did not deliver.*spawn.*event/i);
  },
);

test('accepts an observable detached process group with a closing child', async () => {
  const listeners = new Map();
  const child = {
    pid: 42,
    kill: () => {
      queueMicrotask(() => listeners.get('close')?.());
      return true;
    },
    once: (event, listener) => {
      listeners.set(event, listener);
      return child;
    },
    unref: () => undefined,
  };

  const capability = await probeDetachedProcessGroupCapability({
    closeTimeoutMilliseconds: 5,
    platform: 'linux',
    readProcessStat: async () => '42 (node) S 1 42 42 0',
    spawnProcess: () => {
      queueMicrotask(() => listeners.get('spawn')?.());
      return child;
    },
  });

  assert.deepEqual(capability, { supported: true, reason: '' });
});

test('bounds a never-completing process and awaits its terminated process group', async (context) => {
  if (await skipWithoutDetachedProcessGroups(context)) {
    return;
  }
  const adapter = createSystemAdapter({ terminationGraceMilliseconds: 50 });
  const startedAt = Date.now();

  await assert.rejects(
    adapter.run(
      process.execPath,
      [
        '--eval',
        'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)',
      ],
      { timeoutMilliseconds: 75 },
    ),
    { name: 'CommandTimeoutError' },
  );
  assert.ok(Date.now() - startedAt < 2_000);
});

test('ignores zombie-only Linux process groups but retains live members', async (context) => {
  await context.test(
    'absent group skips process-state inspection',
    async () => {
      let groupChecks = 0;
      const adapter = createSystemAdapter({
        groupExists: () => {
          groupChecks += 1;
          return false;
        },
        platform: 'linux',
        readProcessGroupStates: async () => {
          throw new Error('process state should not be inspected');
        },
      });

      const result = await adapter.run(process.execPath, ['--eval', '']);

      assert.equal(result.status, 0);
      assert.equal(groupChecks, 1);
    },
  );

  await context.test('zombie-only', async () => {
    let livenessChecks = 0;
    const adapter = createSystemAdapter({
      groupExists: () => true,
      platform: 'linux',
      readProcessGroupStates: async () => {
        livenessChecks += 1;
        return ['Z', 'X'];
      },
      terminationGraceMilliseconds: 25,
    });

    const result = await adapter.run(process.execPath, ['--eval', '']);

    assert.equal(result.status, 0);
    assert.equal(livenessChecks, 1);
  });

  await context.test('sleeping member', async () => {
    const observedStates = [['S'], [], []];
    let livenessChecks = 0;
    const adapter = createSystemAdapter({
      groupExists: () => true,
      platform: 'linux',
      readProcessGroupStates: async () => {
        const states = observedStates[livenessChecks] ?? [];
        livenessChecks += 1;
        return states;
      },
      terminationGraceMilliseconds: 25,
    });

    const result = await adapter.run(process.execPath, ['--eval', '']);

    assert.equal(result.status, 0);
    assert.equal(livenessChecks, 2);
  });
});

test('reaps resistant descendants after a successful process-group leader exits', async (context) => {
  if (await skipWithoutDetachedProcessGroups(context)) {
    return;
  }
  const fixtureDirectory = await mkdtemp(
    join(tmpdir(), 'prisma-prim-orphan-process-test-'),
  );
  const pidFile = join(fixtureDirectory, 'descendant-pid');
  const adapter = createSystemAdapter({ terminationGraceMilliseconds: 100 });
  let descendantPid;
  const descendantSource = [
    'process.on("SIGTERM", () => {});',
    'process.send("ready");',
    'setInterval(() => {}, 1000);',
  ].join(' ');
  const parentSource = [
    'const { spawn } = require("node:child_process");',
    'const { writeFileSync } = require("node:fs");',
    `const child = spawn(process.execPath, ["--eval", ${JSON.stringify(descendantSource)}], { stdio: ["ignore", "ignore", "ignore", "ipc"] });`,
    'child.once("message", () => {',
    'writeFileSync(process.env.PID_FILE, String(child.pid));',
    'child.disconnect();',
    'child.unref();',
    '});',
  ].join(' ');

  try {
    const result = await adapter.run(
      process.execPath,
      ['--eval', parentSource],
      {
        env: { ...process.env, PID_FILE: pidFile },
      },
    );
    descendantPid = Number(await readFile(pidFile, 'utf8'));

    assert.equal(result.status, 0);
    assert.equal(await processIsAbsentOrZombie(descendantPid), true);
  } finally {
    if (descendantPid) {
      try {
        process.kill(descendantPid, 'SIGKILL');
      } catch (error) {
        assert.equal(error.code, 'ESRCH');
      }
    }
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
});

async function processIsAbsentOrZombie(pid) {
  if (process.platform !== 'linux') {
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      return error.code === 'ESRCH';
    }
  }
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    const commandEnd = stat.lastIndexOf(') ');
    const state = commandEnd >= 0 ? stat.slice(commandEnd + 2)[0] : undefined;
    return new Set(['X', 'x', 'Z']).has(state);
  } catch (error) {
    if (new Set(['ENOENT', 'ESRCH']).has(error.code)) {
      return true;
    }
    throw error;
  }
}
