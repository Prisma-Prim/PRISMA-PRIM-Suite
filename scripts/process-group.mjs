import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';

const disappearedProcessErrors = new Set(['ENOENT', 'ESRCH']);
const nonLiveLinuxProcessStates = new Set(['X', 'x', 'Z']);
const processGroupCapabilityFallback =
  'Detached process-group integration tests are skipped in this harness. GitHub Actions retains real POSIX process-group coverage.';

function waitForPromise(promise, timeoutMilliseconds) {
  let timeout;
  return Promise.race([
    promise.then(() => true),
    new Promise((resolveWait) => {
      timeout = setTimeout(() => resolveWait(false), timeoutMilliseconds);
    }),
  ]).finally(() => clearTimeout(timeout));
}

function parseLinuxProcessStat(stat) {
  const commandEnd = stat.lastIndexOf(') ');
  const fields = commandEnd >= 0 ? stat.slice(commandEnd + 2).split(' ') : [];
  const state = fields[0];
  const processGroupId = Number(fields[2]);
  return state && Number.isInteger(processGroupId)
    ? { processGroupId, state }
    : null;
}

export async function probeDetachedProcessGroupCapability({
  closeTimeoutMilliseconds = 250,
  platform = process.platform,
  readProcessStat = (processId) => readFile(`/proc/${processId}/stat`, 'utf8'),
  spawnProcess = spawn,
  spawnTimeoutMilliseconds = 250,
} = {}) {
  if (platform === 'win32') {
    return {
      supported: false,
      reason: `Windows does not provide the required POSIX process groups. ${processGroupCapabilityFallback}`,
    };
  }

  let child;
  let supported = true;
  let reason = '';
  try {
    child = spawnProcess(
      process.execPath,
      ['--eval', 'setTimeout(() => process.exit(0), 1000)'],
      {
        detached: true,
        shell: false,
        stdio: 'ignore',
      },
    );
  } catch {
    return {
      supported: false,
      reason: `This harness could not spawn the detached capability probe. ${processGroupCapabilityFallback}`,
    };
  }

  const spawnedPromise = new Promise((resolveSpawn, rejectSpawn) => {
    child.once('spawn', resolveSpawn);
    child.once('error', rejectSpawn);
  });
  const closePromise = new Promise((resolveClose) => {
    child.once('close', resolveClose);
  });

  try {
    const spawnObserved = await waitForPromise(
      spawnedPromise,
      spawnTimeoutMilliseconds,
    );
    if (!spawnObserved) {
      supported = false;
      reason = `This harness did not deliver a child spawn lifecycle event. ${processGroupCapabilityFallback}`;
    } else if (platform === 'linux') {
      try {
        const stat = await readProcessStat(child.pid);
        if (parseLinuxProcessStat(stat)?.processGroupId !== child.pid) {
          supported = false;
          reason = `This harness did not create the probe as its own POSIX process group. ${processGroupCapabilityFallback}`;
        }
      } catch (error) {
        supported = false;
        reason = disappearedProcessErrors.has(error?.code)
          ? `This harness did not expose the spawned PID through /proc. ${processGroupCapabilityFallback}`
          : `This harness did not permit /proc process-group inspection. ${processGroupCapabilityFallback}`;
      }
    }
  } catch {
    supported = false;
    reason = `This harness did not report a successful detached process spawn. ${processGroupCapabilityFallback}`;
  } finally {
    try {
      child.kill('SIGKILL');
    } catch {
      // Capability is reported below; no process handle is assumed usable here.
    }
    child.unref();
  }

  if (!(await waitForPromise(closePromise, closeTimeoutMilliseconds))) {
    supported = false;
    reason ||= `This harness did not deliver the child close event after termination. ${processGroupCapabilityFallback}`;
  }

  return { supported, reason };
}

function defaultGroupExists(processGroupId) {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

async function readLinuxProcessGroupStates(processGroupId) {
  let processIds;
  try {
    processIds = (await readdir('/proc')).filter((entry) =>
      /^\d+$/.test(entry),
    );
  } catch (error) {
    throw new Error(
      `Unable to inspect Linux process group ${processGroupId} through /proc; refusing to assume its descendants exited.`,
      { cause: error },
    );
  }

  const states = await Promise.all(
    processIds.map(async (processId) => {
      let stat;
      try {
        stat = await readFile(`/proc/${processId}/stat`, 'utf8');
      } catch (error) {
        if (disappearedProcessErrors.has(error.code)) {
          return null;
        }
        throw new Error(
          `Unable to inspect Linux process ${processId} while checking process group ${processGroupId}; refusing to assume its descendants exited.`,
          { cause: error },
        );
      }

      const parsedStat = parseLinuxProcessStat(stat);
      if (!parsedStat) {
        throw new Error(
          `Linux process state for PID ${processId} was malformed while checking process group ${processGroupId}; refusing to assume its descendants exited.`,
        );
      }
      return parsedStat.processGroupId === processGroupId
        ? parsedStat.state
        : null;
    }),
  );
  return states.filter(Boolean);
}

function signalGroup(processGroupId, signal) {
  try {
    process.kill(-processGroupId, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') {
      throw error;
    }
  }
}

export function createProcessGroupController({
  groupExists = defaultGroupExists,
  platform = process.platform,
  readProcessGroupStates,
  signalProcessGroup = signalGroup,
} = {}) {
  const readStates =
    readProcessGroupStates ??
    (platform === 'linux' ? readLinuxProcessGroupStates : null);

  const isLive = async (processGroupId) => {
    if (!groupExists(processGroupId)) {
      return false;
    }
    if (!readStates) {
      return true;
    }
    const states = await readStates(processGroupId);
    return states.some((state) => !nonLiveLinuxProcessStates.has(state));
  };

  const waitForExit = async (processGroupId, timeoutMilliseconds) => {
    const deadline = Date.now() + timeoutMilliseconds;
    while (await isLive(processGroupId)) {
      if (Date.now() >= deadline) {
        return false;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    return true;
  };

  return {
    isLive,
    terminate: async (child, closePromise, graceMilliseconds) => {
      signalProcessGroup(child.pid, 'SIGTERM');
      if (!(await waitForExit(child.pid, graceMilliseconds))) {
        signalProcessGroup(child.pid, 'SIGKILL');
        if (!(await waitForExit(child.pid, graceMilliseconds))) {
          throw new Error(
            `Process group ${child.pid} survived bounded TERM to KILL escalation.`,
          );
        }
      }
      await closePromise;
    },
  };
}
