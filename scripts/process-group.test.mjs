import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSystemAdapter } from './managed-postgres.mjs';

test('bounds a never-completing process and awaits its terminated process group', async () => {
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

test('reaps resistant descendants after a successful process-group leader exits', async () => {
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
