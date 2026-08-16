import { readdir, readFile } from 'node:fs/promises';

const disappearedProcessErrors = new Set(['ENOENT', 'ESRCH']);
const nonLiveLinuxProcessStates = new Set(['X', 'x', 'Z']);

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

      const commandEnd = stat.lastIndexOf(') ');
      const fields =
        commandEnd >= 0 ? stat.slice(commandEnd + 2).split(' ') : [];
      const state = fields[0];
      const observedProcessGroupId = Number(fields[2]);
      if (!state || !Number.isInteger(observedProcessGroupId)) {
        throw new Error(
          `Linux process state for PID ${processId} was malformed while checking process group ${processGroupId}; refusing to assume its descendants exited.`,
        );
      }
      return observedProcessGroupId === processGroupId ? state : null;
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
      signalGroup(child.pid, 'SIGTERM');
      if (!(await waitForExit(child.pid, graceMilliseconds))) {
        signalGroup(child.pid, 'SIGKILL');
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
