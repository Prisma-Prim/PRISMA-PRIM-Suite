import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { readPrivateJson } from './private-evidence.mjs';
import { createProcessGroupController } from './process-group.mjs';
import { hash, PreparationError } from './worktree-inputs.mjs';

const host = hash(
  `${hostname()}\0${process.platform}\0${process.getuid?.() ?? 'windows'}`,
);
const uuid =
  /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/u;
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}
function publish(file, record) {
  const temporary = `${file}.${randomUUID()}.pending`;
  const descriptor = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(record)}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, file);
}
function removeOwned(directory, name, files = [name]) {
  try {
    unlinkSync(join(directory, name));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const file of files.filter((file) => file !== name)) {
    try {
      unlinkSync(join(directory, file));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  try {
    rmdirSync(directory);
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error;
  }
}
function validOwner(owner, name) {
  return (
    owner &&
    Object.keys(owner).length === 7 &&
    owner.schema === 1 &&
    uuid.test(owner.token) &&
    name === `owner-${owner.token}.json` &&
    owner.host === host &&
    owner.platform === process.platform &&
    Number.isSafeInteger(owner.pid) &&
    owner.pid > 0 &&
    ['idle', 'launching', 'running'].includes(owner.phase) &&
    (owner.phase === 'running'
      ? Number.isSafeInteger(owner.child) && owner.child > 0
      : owner.child === null)
  );
}

export async function acquirePreparationLock({ directory, waitMilliseconds }) {
  const token = randomUUID();
  const name = `owner-${token}.json`;
  const candidate = join(directory, `.candidate-${token}`);
  const lock = join(directory, 'lock');
  const groups = createProcessGroupController();
  let record = {
    schema: 1,
    token,
    host,
    pid: process.pid,
    platform: process.platform,
    phase: 'idle',
    child: null,
  };
  let held = false;
  let unsafe = false;
  let announced = false;
  const abort = new AbortController();
  const interrupt = () => abort.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const detachListeners = () => {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  };
  const update = (phase, child = null) => {
    publish(join(lock, name), { ...record, phase, child });
    record = { ...record, phase, child };
  };
  mkdirSync(candidate, { mode: 0o700 });
  publish(join(candidate, name), record);
  const deadline = Date.now() + waitMilliseconds;

  async function run(
    command,
    args,
    {
      cwd,
      environment,
      capture = false,
      timeout = 300_000,
      stage = 'command',
    } = {},
  ) {
    if (
      ![
        'command',
        'worktree',
        'pnpm-version',
        'pnpm-config',
        'pnpm-store',
        'pnpm-install',
        'doctor',
      ].includes(stage)
    )
      throw new PreparationError('Unknown preparation stage.');
    if (abort.signal.aborted)
      throw new PreparationError(
        'Preparation interrupted; no command was started.',
      );
    // Publish intent before spawn so an owner killed before recording the PID
    // cannot leave an apparently idle lock with an unrecorded live installer.
    update('launching');
    unsafe = true;
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env: environment,
        detached: process.platform !== 'win32',
        shell: false,
        stdio: capture ? ['ignore', 'pipe', 'ignore'] : 'ignore',
      });
    } catch {
      update('idle');
      unsafe = false;
      throw new PreparationError(
        'A supported preparation command could not start.',
      );
    }
    let output = '';
    let overflow = false;
    let spawnError = false;
    child.stdout?.on('data', (data) => {
      if (output.length + data.length <= 4 * 1024 * 1024) output += data;
      else overflow = true;
    });
    const closed = new Promise((resolveClose) => {
      child.once('error', () => {
        spawnError = true;
      });
      child.once('close', (status, signal) => resolveClose({ status, signal }));
    });
    if (child.pid) update('running', child.pid);
    let stopped;
    let timedOut = false;
    let stopFailed;
    const stoppingFailure = new Promise((_, reject) => {
      stopFailed = reject;
    });
    const stop = () => {
      stopped ??= (async () => {
        if (!child.pid) {
          await closed;
          return;
        }
        if (process.platform === 'win32') {
          const killed = spawnSync(
            'taskkill',
            ['/PID', String(child.pid), '/T', '/F'],
            { stdio: 'ignore', timeout: 10_000 },
          );
          if (killed.status !== 0)
            throw new PreparationError(
              'Descendant exit is unproven; preparation remains locked.',
            );
          await closed;
        } else await groups.terminate(child, closed, 1000);
      })();
      stopped.catch((error) => {
        child.stdout?.destroy();
        child.unref();
        stopFailed(error);
      });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeout);
    abort.signal.addEventListener('abort', stop, { once: true });
    if (abort.signal.aborted) stop();
    try {
      const result = await Promise.race([closed, stoppingFailure]);
      if (stopped) await stopped;
      if (
        child.pid &&
        process.platform !== 'win32' &&
        (await groups.isLive(child.pid))
      ) {
        stop();
        await stopped;
        update('idle');
        unsafe = false;
        throw new PreparationError(
          'A preparation command left descendants running; they were stopped. Retry with --refresh.',
        );
      }
      update('idle');
      unsafe = false;
      if (timedOut || abort.signal.aborted)
        throw new PreparationError(
          'Preparation interrupted or timed out; owned descendants were stopped and qualification remains incomplete.',
        );
      if (spawnError || overflow || result.status !== 0)
        throw new PreparationError(
          `Preparation stage ${stage} failed (exit ${result.status ?? 'unavailable'}); qualification remains incomplete. Child output was not published.`,
        );
      return output;
    } finally {
      clearTimeout(timer);
      abort.signal.removeEventListener('abort', stop);
    }
  }

  try {
    while (true) {
      if (abort.signal.aborted)
        throw new PreparationError(
          'Preparation interrupted while waiting for its lock.',
        );
      try {
        renameSync(candidate, lock);
        held = true;
        return {
          run,
          release: () => {
            detachListeners();
            if (!unsafe)
              removeOwned(
                lock,
                name,
                readdirSync(lock).filter(
                  (file) => file === name || file.startsWith(`${name}.`),
                ),
              );
          },
        };
      } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(error.code))
          throw error;
      }
      let files;
      let directoryStat;
      try {
        directoryStat = lstatSync(lock);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (Date.now() >= deadline)
          throw new PreparationError(
            'Worktree preparation is already active or ownership is unresolved. Retry after its owner finishes; no live lock was stolen.',
          );
        continue;
      }
      if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink())
        throw new PreparationError(
          'Lock directories cannot be links or foreign files.',
        );
      try {
        files = readdirSync(lock);
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      const ownerName = files.find((file) =>
        /^owner-[a-f\d-]{36}\.json$/u.test(file),
      );
      let owner;
      if (ownerName) {
        try {
          owner = readPrivateJson(join(lock, ownerName));
        } catch {
          /* Atomic phase replacement may race this read; retry within the bounded wait. */
        }
        if (owner && !validOwner(owner, ownerName))
          throw new PreparationError(
            'Lock ownership is unknown; no lock was stolen.',
          );
        if (owner && !alive(owner.pid)) {
          // The first read may predate a launch followed by owner death.
          // Only state read after the death observation can authorize recovery.
          let finalOwner;
          try {
            finalOwner = readPrivateJson(join(lock, ownerName));
          } catch {
            if (!existsSync(join(lock, ownerName))) continue;
            throw new PreparationError(
              'Final lock ownership is unreadable; recovery was refused.',
            );
          }
          if (
            !validOwner(finalOwner, ownerName) ||
            finalOwner.pid !== owner.pid ||
            finalOwner.token !== owner.token
          )
            throw new PreparationError(
              'Final lock ownership changed; recovery was refused.',
            );
          owner = finalOwner;
          if (alive(owner.pid)) continue;
          try {
            files = readdirSync(lock);
          } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
          }
          if (
            owner.phase === 'launching' ||
            (owner.phase === 'running' && process.platform === 'win32')
          )
            throw new PreparationError(
              'Interrupted preparation has unproven descendant activity. Preserve it and use a fresh isolated target.',
            );
          if (
            owner.phase !== 'running' ||
            !(await groups.isLive(owner.child))
          ) {
            if (
              files.some(
                (file) =>
                  file !== ownerName && !file.startsWith(`${ownerName}.`),
              )
            )
              throw new PreparationError(
                'Unexpected lock files prevent safe recovery.',
              );
            removeOwned(lock, ownerName, files);
            continue;
          }
        }
      }
      if (Date.now() >= deadline)
        throw new PreparationError(
          'Worktree preparation is already active or ownership is unresolved. Retry after its owner finishes; no live lock was stolen.',
        );
      if (!announced) {
        console.error('Waiting for worktree preparation lock.');
        announced = true;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    }
  } finally {
    if (!held) detachListeners();
    if (existsSync(candidate)) removeOwned(candidate, name);
  }
}
