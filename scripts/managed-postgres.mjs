import { spawn } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { databaseTargetsAreSafe } from './agent-doctor.mjs';
import { createProcessGroupController } from './process-group.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const databaseUser = 'prisma_prim';
const databasePassword = 'prisma_prim';
const developmentDatabase = 'prisma_prim_dev';
const testDatabase = 'prisma_prim_test';

function commandTimeoutError(command, timeoutMilliseconds) {
  const error = new Error(
    `${command} exceeded its ${timeoutMilliseconds}ms infrastructure deadline.`,
  );
  error.name = 'CommandTimeoutError';
  return error;
}

function pathIsInside(parent, candidate) {
  const relation = relative(parent, candidate);
  return (
    relation === '' ||
    (!relation.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
      relation !== '..' &&
      !isAbsolute(relation))
  );
}

function unsafeTemporaryRootError(path) {
  return new Error(
    `Managed PostgreSQL temporary root resolves inside the repository checkout (${path}). Set TMPDIR to an external directory such as /tmp and retry.`,
  );
}

export function createSystemAdapter({
  canonicalizePath = realpath,
  groupExists,
  makeTemporaryDirectory = mkdtemp,
  platform = process.platform,
  readProcessGroupStates,
  temporaryRoot = tmpdir(),
  terminationGraceMilliseconds = 1_000,
} = {}) {
  if (platform === 'win32') {
    throw unsupportedPlatformError();
  }
  const processGroupController = createProcessGroupController({
    groupExists,
    platform,
    readProcessGroupStates,
  });

  return {
    createRunId: () => randomUUID(),
    createTemporaryDirectory: async () => {
      const resolvedTemporaryRoot = resolve(temporaryRoot);
      if (pathIsInside(repositoryRoot, resolvedTemporaryRoot)) {
        throw unsafeTemporaryRootError(resolvedTemporaryRoot);
      }
      const [canonicalRepositoryRoot, canonicalTemporaryRoot] =
        await Promise.all([
          canonicalizePath(repositoryRoot),
          canonicalizePath(resolvedTemporaryRoot),
        ]);
      if (pathIsInside(canonicalRepositoryRoot, canonicalTemporaryRoot)) {
        throw unsafeTemporaryRootError(canonicalTemporaryRoot);
      }
      return await makeTemporaryDirectory(
        join(canonicalTemporaryRoot, 'prisma-prim-managed-postgres-'),
      );
    },
    delay: (milliseconds, signal) =>
      new Promise((resolveDelay, rejectDelay) => {
        if (signal?.aborted) {
          rejectDelay(signal.reason);
          return;
        }

        const cleanup = () => signal?.removeEventListener('abort', abort);
        const abort = () => {
          clearTimeout(timeout);
          cleanup();
          rejectDelay(signal.reason);
        };
        const timeout = setTimeout(() => {
          cleanup();
          resolveDelay();
        }, milliseconds);
        signal?.addEventListener('abort', abort, { once: true });
      }),
    removeTemporaryDirectory: (path) =>
      rm(path, { recursive: true, force: true }),
    run: async (command, args, options = {}) => {
      if (options.signal?.aborted) {
        throw options.signal.reason;
      }

      let rejectSpawn;
      let resolveClose;
      const spawnErrorPromise = new Promise((_, reject) => {
        rejectSpawn = reject;
      });
      const closePromise = new Promise((resolveClosePromise) => {
        resolveClose = resolveClosePromise;
      });
      const child = (() => {
        try {
          return spawn(command, args, {
            cwd: repositoryRoot,
            detached: true,
            env: options.env,
            shell: false,
            stdio:
              options.stdio === 'inherit'
                ? 'inherit'
                : ['ignore', 'pipe', 'pipe'],
          });
        } catch (error) {
          rejectSpawn(error);
          return null;
        }
      })();
      if (!child) {
        return await spawnErrorPromise;
      }

      const result = { status: 1, signal: null, stdout: '', stderr: '' };
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        result.stdout += chunk;
      });
      child.stderr?.on('data', (chunk) => {
        result.stderr += chunk;
      });
      child.once('error', rejectSpawn);
      child.once('close', (status, signal) => {
        result.status = status ?? 1;
        result.signal = signal;
        resolveClose(result);
      });

      let resolveInterruption;
      const interruptionPromise = new Promise((resolveInterruptionPromise) => {
        resolveInterruption = resolveInterruptionPromise;
      });
      const abort = () => {
        resolveInterruption({
          type: 'interrupted',
          error: options.signal.reason,
        });
      };
      options.signal?.addEventListener('abort', abort, { once: true });
      const timeout = options.timeoutMilliseconds
        ? setTimeout(() => {
            resolveInterruption({
              type: 'interrupted',
              error: commandTimeoutError(command, options.timeoutMilliseconds),
            });
          }, options.timeoutMilliseconds)
        : null;

      try {
        const event = await Promise.race([
          closePromise.then((closedResult) => ({
            type: 'closed',
            result: closedResult,
          })),
          spawnErrorPromise,
          interruptionPromise,
        ]);
        if (event.type === 'closed') {
          if (await processGroupController.isLive(child.pid)) {
            await processGroupController.terminate(
              child,
              closePromise,
              terminationGraceMilliseconds,
            );
          }
          return event.result;
        }

        await processGroupController.terminate(
          child,
          closePromise,
          terminationGraceMilliseconds,
        );
        throw event.error;
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
        options.signal?.removeEventListener('abort', abort);
      }
    },
  };
}

function unsupportedPlatformError() {
  return new Error(
    'Managed PostgreSQL is not supported on Windows because safe descendant process-group termination requires POSIX semantics. Use the supported native PostgreSQL path or run the managed lifecycle in a POSIX/Linux Docker harness.',
  );
}

function validateRunId(runId) {
  if (!/^[a-z0-9][a-z0-9-]{0,48}$/.test(runId)) {
    throw new Error(
      'Managed PostgreSQL could not create a safe unique run identifier.',
    );
  }
}

function parsePublishedPort(output) {
  for (const line of String(output).trim().split('\n')) {
    const match = line.trim().match(/127\.0\.0\.1:(\d+)$/);
    if (match) {
      const port = Number(match[1]);
      if (port > 0 && port <= 65_535) {
        return port;
      }
    }
  }

  throw new Error('Docker did not publish PostgreSQL on a loopback TCP port.');
}

function throwIfAborted(signal) {
  if (!signal?.aborted) {
    return;
  }

  if (signal.reason) {
    throw signal.reason;
  }
  const error = new Error('Managed PostgreSQL verification was interrupted.');
  error.name = 'AbortError';
  throw error;
}

async function acquireResource(resource, acquire, signal) {
  resource.state = 'uncertain';
  await acquire();
  resource.state = 'confirmed';
  throwIfAborted(signal);
}

async function requireSuccess(
  adapter,
  description,
  command,
  args,
  options = {},
) {
  let result;
  try {
    result = await adapter.run(command, args, options);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error;
    }
    if (error?.code === 'ENOENT') {
      throw new Error(
        `${description} could not start because ${command} is missing.`,
        {
          cause: error,
        },
      );
    }
    if (new Set(['EACCES', 'EPERM']).has(error?.code)) {
      throw new Error(
        `${description} was denied by the harness sandbox (${error.code}).`,
        { cause: error },
      );
    }
    throw error;
  }

  if (result.status !== 0) {
    if (/permission denied|operation not permitted/i.test(result.stderr)) {
      throw new Error(
        `${description} was denied by the harness sandbox or socket policy.`,
      );
    }
    if (/cannot connect to the docker daemon/i.test(result.stderr)) {
      throw new Error(`${description} could not reach the Docker service.`);
    }
    throw new Error(
      `${description} failed with exit status ${result.status}.${stderrDiagnostic(result.stderr)}`,
    );
  }
  return result;
}

function sanitizeError(error) {
  return String(error?.message ?? error ?? 'unknown failure')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted PostgreSQL URL]')
    .replace(/([a-z][a-z\d+.-]*:\/\/)[^@\s/]+@/gi, '$1[redacted credentials]@')
    .replace(/\b(password|token|secret)\s*[:=]\s*[^\s]+/gi, '$1=[redacted]')
    .replace(/\bBearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 300);
}

function stderrDiagnostic(stderr) {
  const excerpt = sanitizeError(stderr ?? '');
  return excerpt ? ` stderr: ${excerpt}` : '';
}

function resourceCommands(resource, name) {
  const labelExpression =
    resource === 'container'
      ? '{{ index .Config.Labels "com.prisma-prim.managed-postgres.run" }}'
      : '{{ index .Labels "com.prisma-prim.managed-postgres.run" }}';
  const inspect =
    resource === 'container'
      ? ['container', 'inspect', '--format', labelExpression, name]
      : [resource, 'inspect', '--format', labelExpression, name];
  const remove =
    resource === 'container'
      ? ['rm', '--force', name]
      : resource === 'volume'
        ? ['volume', 'rm', '--force', name]
        : ['network', 'rm', name];
  return { inspect, remove };
}

function resourceIsMissing(result, resource) {
  return (
    result.status !== 0 &&
    (new RegExp(`no such (?:object|${resource})\\b`, 'i').test(result.stderr) ||
      new RegExp(
        `\\b${resource}\\s+\\S+\\s+(?:not found|does not exist)\\b`,
        'i',
      ).test(result.stderr))
  );
}

async function removeResourceOnce(
  adapter,
  resource,
  name,
  timeoutMilliseconds,
) {
  const { remove } = resourceCommands(resource, name);
  try {
    const result = await adapter.run('docker', remove, {
      timeoutMilliseconds,
    });
    if (result.status === 0 || resourceIsMissing(result, resource)) {
      return { status: 'removed' };
    }
    return {
      status: 'failed',
      error: new Error(
        `exit status ${result.status}.${stderrDiagnostic(result.stderr)}`,
      ),
    };
  } catch (error) {
    return { status: 'failed', error };
  }
}

async function inspectResource(
  adapter,
  resource,
  name,
  runId,
  timeoutMilliseconds,
) {
  const { inspect } = resourceCommands(resource, name);
  const result = await adapter.run('docker', inspect, {
    timeoutMilliseconds,
  });
  if (resourceIsMissing(result, resource)) {
    return { state: 'absent' };
  }
  if (result.status !== 0) {
    throw new Error(
      `inspection failed with exit status ${result.status}.${stderrDiagnostic(result.stderr)}`,
    );
  }
  const observedRunId = result.stdout.trim();
  if (observedRunId !== runId) {
    throw new Error(
      `exact name appeared with unexpected run label ${observedRunId || '(missing)'}`,
    );
  }
  return { state: 'present' };
}

async function cleanupResource(
  adapter,
  { resource, name, runId, uncertain },
  {
    reconciliationAttempts,
    reconciliationIntervalMilliseconds,
    timeoutMilliseconds,
  },
) {
  if (!uncertain) {
    return {
      resource,
      ...(await removeResourceOnce(
        adapter,
        resource,
        name,
        timeoutMilliseconds,
      )),
    };
  }

  let consecutiveAbsence = 0;
  let lastError = null;
  for (let attempt = 0; attempt < reconciliationAttempts; attempt += 1) {
    try {
      const observation = await inspectResource(
        adapter,
        resource,
        name,
        runId,
        timeoutMilliseconds,
      );
      if (observation.state === 'absent') {
        consecutiveAbsence += 1;
        if (consecutiveAbsence >= 3) {
          return { resource, status: 'removed' };
        }
      } else {
        consecutiveAbsence = 0;
        const removal = await removeResourceOnce(
          adapter,
          resource,
          name,
          timeoutMilliseconds,
        );
        lastError = removal.status === 'failed' ? removal.error : null;
      }
    } catch (error) {
      consecutiveAbsence = 0;
      lastError = error;
    }

    if (attempt + 1 < reconciliationAttempts) {
      await adapter.delay(reconciliationIntervalMilliseconds);
    }
  }

  return {
    resource,
    status: 'failed',
    error: new Error(
      `absence was not established after ${reconciliationAttempts} exact-name state probes${lastError ? `; last error: ${sanitizeError(lastError)}` : ''}`,
    ),
  };
}

function lifecycleError(
  { runId, containerName, networkName, volumeName, label, runLabel },
  operationError,
  cleanupResults,
) {
  const cleanupSummary = cleanupResults
    .map((result) =>
      result.status === 'removed'
        ? `${result.resource}=removed`
        : `${result.resource} cleanup failed: ${sanitizeError(result.error)}`,
    )
    .join('; ');
  const message = [
    `Managed PostgreSQL run ${runId} failed.`,
    operationError
      ? `Operation: ${operationError.name === 'AbortError' ? 'interrupted: ' : ''}${sanitizeError(operationError)}.`
      : 'Operation: completed before cleanup failed.',
    `Resources: container=${containerName}; network=${networkName}; volume=${volumeName}.`,
    `Labels: ${label}; ${runLabel}.`,
    `Cleanup: ${cleanupSummary || 'no managed resource creation was attempted'}.`,
  ].join(' ');
  const errors = [
    ...(operationError ? [operationError] : []),
    ...cleanupResults
      .filter((result) => result.status === 'failed')
      .map((result) => result.error),
  ];
  const error = new AggregateError(errors, message, { cause: operationError });
  error.name =
    operationError?.name === 'AbortError'
      ? 'AbortError'
      : 'ManagedPostgresLifecycleError';
  return error;
}

export function createManagedPostgresRunner(
  adapter = createSystemAdapter(),
  {
    infrastructureTimeoutMilliseconds = 120_000,
    platform = process.platform,
    reconciliationAttempts = 8,
    reconciliationIntervalMilliseconds = 100,
    readinessAttempts = 40,
    readinessIntervalMilliseconds = 250,
  } = {},
) {
  if (!Number.isInteger(readinessAttempts) || readinessAttempts < 1) {
    throw new Error('readinessAttempts must be a positive integer.');
  }
  if (
    !Number.isInteger(infrastructureTimeoutMilliseconds) ||
    infrastructureTimeoutMilliseconds < 1
  ) {
    throw new Error(
      'infrastructureTimeoutMilliseconds must be a positive integer.',
    );
  }
  if (!Number.isInteger(reconciliationAttempts) || reconciliationAttempts < 3) {
    throw new Error('reconciliationAttempts must be an integer of at least 3.');
  }
  if (
    !Number.isInteger(reconciliationIntervalMilliseconds) ||
    reconciliationIntervalMilliseconds < 0
  ) {
    throw new Error(
      'reconciliationIntervalMilliseconds must be a non-negative integer.',
    );
  }

  return {
    async run({ command, args = [], environment = process.env, signal } = {}) {
      if (platform === 'win32') {
        throw unsupportedPlatformError();
      }

      if (command !== undefined && (typeof command !== 'string' || !command)) {
        throw new Error(
          'The verification command must be a non-empty executable name.',
        );
      }
      if (
        !Array.isArray(args) ||
        args.some((argument) => typeof argument !== 'string')
      ) {
        throw new Error('Verification command arguments must be strings.');
      }

      const runId = adapter.createRunId();
      validateRunId(runId);
      const resourcePrefix = `prisma-prim-postgres-${runId}`;
      const containerName = resourcePrefix;
      const networkName = `${resourcePrefix}-network`;
      const volumeName = `${resourcePrefix}-data`;
      const label = 'com.prisma-prim.managed-postgres=true';
      const runLabel = `com.prisma-prim.managed-postgres.run=${runId}`;
      const networkResource = {
        resource: 'network',
        name: networkName,
        state: 'unattempted',
      };
      const volumeResource = {
        resource: 'volume',
        name: volumeName,
        state: 'unattempted',
      };
      const containerResource = {
        resource: 'container',
        name: containerName,
        state: 'unattempted',
      };
      const resourceLedger = [
        networkResource,
        volumeResource,
        containerResource,
      ];
      let temporaryDirectory;
      let outcome;
      let operationError;

      try {
        temporaryDirectory = await adapter.createTemporaryDirectory();
        await requireSuccess(
          adapter,
          'Docker availability check',
          'docker',
          ['version', '--format', '{{.Server.Version}}'],
          { signal, timeoutMilliseconds: infrastructureTimeoutMilliseconds },
        );
        throwIfAborted(signal);
        await acquireResource(
          networkResource,
          () =>
            requireSuccess(
              adapter,
              'Disposable Docker network creation',
              'docker',
              [
                'network',
                'create',
                '--label',
                label,
                '--label',
                runLabel,
                networkName,
              ],
              { timeoutMilliseconds: infrastructureTimeoutMilliseconds },
            ),
          signal,
        );
        await acquireResource(
          volumeResource,
          () =>
            requireSuccess(
              adapter,
              'Disposable Docker volume creation',
              'docker',
              [
                'volume',
                'create',
                '--label',
                label,
                '--label',
                runLabel,
                volumeName,
              ],
              { timeoutMilliseconds: infrastructureTimeoutMilliseconds },
            ),
          signal,
        );
        await acquireResource(
          containerResource,
          () =>
            requireSuccess(
              adapter,
              'Disposable PostgreSQL container startup',
              'docker',
              [
                'run',
                '--detach',
                '--name',
                containerName,
                '--network',
                networkName,
                '--label',
                label,
                '--label',
                runLabel,
                '--publish',
                '127.0.0.1::5432',
                '--volume',
                `${volumeName}:/var/lib/postgresql/data`,
                '--tmpfs',
                '/tmp:rw,nosuid,nodev,size=64m',
                '--env',
                `POSTGRES_USER=${databaseUser}`,
                '--env',
                `POSTGRES_PASSWORD=${databasePassword}`,
                '--env',
                `POSTGRES_DB=${developmentDatabase}`,
                '--health-cmd',
                `test "$(cat /proc/1/comm)" = postgres && pg_isready --username ${databaseUser} --dbname ${developmentDatabase}`,
                '--health-interval',
                '250ms',
                '--health-timeout',
                '2s',
                '--health-retries',
                String(readinessAttempts),
                'postgres:17-alpine',
              ],
              { timeoutMilliseconds: infrastructureTimeoutMilliseconds },
            ),
          signal,
        );

        let ready = false;
        for (let attempt = 0; attempt < readinessAttempts; attempt += 1) {
          const health = await requireSuccess(
            adapter,
            'PostgreSQL readiness inspection',
            'docker',
            ['inspect', '--format', '{{.State.Health.Status}}', containerName],
            {
              signal,
              timeoutMilliseconds: infrastructureTimeoutMilliseconds,
            },
          );
          const state = health.stdout.trim();
          if (state === 'healthy') {
            ready = true;
            break;
          }
          if (state === 'unhealthy') {
            throw new Error(
              'Disposable PostgreSQL reported an unhealthy state.',
            );
          }
          if (state !== 'starting') {
            throw new Error(
              `Disposable PostgreSQL reported unexpected state ${state || 'empty'}.`,
            );
          }
          if (attempt + 1 < readinessAttempts) {
            await adapter.delay(readinessIntervalMilliseconds, signal);
          }
        }
        if (!ready) {
          throw new Error(
            `Disposable PostgreSQL did not become ready after ${readinessAttempts} state checks.`,
          );
        }

        const publishedPort = parsePublishedPort(
          (
            await requireSuccess(
              adapter,
              'PostgreSQL port discovery',
              'docker',
              ['port', containerName, '5432/tcp'],
              {
                signal,
                timeoutMilliseconds: infrastructureTimeoutMilliseconds,
              },
            )
          ).stdout,
        );
        const databaseUrl = `postgresql://${databaseUser}:${databasePassword}@127.0.0.1:${publishedPort}/${developmentDatabase}`;
        const testDatabaseUrl = `postgresql://${databaseUser}:${databasePassword}@127.0.0.1:${publishedPort}/${testDatabase}`;
        if (!databaseTargetsAreSafe(databaseUrl, testDatabaseUrl)) {
          throw new Error(
            'Managed PostgreSQL generated unsafe database targets.',
          );
        }

        await requireSuccess(
          adapter,
          'Pristine test database creation',
          'docker',
          [
            'exec',
            containerName,
            'createdb',
            '--username',
            databaseUser,
            '--owner',
            databaseUser,
            testDatabase,
          ],
          { signal, timeoutMilliseconds: infrastructureTimeoutMilliseconds },
        );

        const commandEnvironment = {
          ...environment,
          COREPACK_ENABLE_PROJECT_SPEC: '1',
          DATABASE_URL: databaseUrl,
          TEST_DATABASE_URL: testDatabaseUrl,
          TMPDIR: temporaryDirectory,
          XDG_CACHE_HOME: join(temporaryDirectory, 'cache'),
        };
        await requireSuccess(
          adapter,
          'PostgreSQL pristine migration',
          'corepack',
          ['pnpm', 'db:migrate'],
          {
            env: commandEnvironment,
            signal,
            stdio: 'inherit',
            timeoutMilliseconds: infrastructureTimeoutMilliseconds,
          },
        );

        if (command) {
          outcome = await adapter.run(command, args, {
            env: commandEnvironment,
            signal,
            stdio: 'inherit',
          });
        } else {
          outcome = { status: 0 };
        }
      } catch (error) {
        operationError = error;
      }

      const cleanupResults = [];
      for (const resource of [...resourceLedger].reverse()) {
        if (resource.state === 'unattempted') {
          continue;
        }
        cleanupResults.push(
          await cleanupResource(
            adapter,
            {
              resource: resource.resource,
              name: resource.name,
              runId,
              uncertain: resource.state === 'uncertain',
            },
            {
              reconciliationAttempts,
              reconciliationIntervalMilliseconds,
              timeoutMilliseconds: infrastructureTimeoutMilliseconds,
            },
          ),
        );
      }
      if (temporaryDirectory) {
        try {
          await adapter.removeTemporaryDirectory(temporaryDirectory);
          cleanupResults.push({
            resource: 'temporary-directory',
            status: 'removed',
          });
        } catch (error) {
          cleanupResults.push({
            resource: 'temporary-directory',
            status: 'failed',
            error,
          });
        }
      }
      if (!operationError && signal?.aborted) {
        try {
          throwIfAborted(signal);
        } catch (error) {
          operationError = error;
        }
      }
      if (
        operationError ||
        cleanupResults.some((result) => result.status === 'failed')
      ) {
        throw lifecycleError(
          {
            runId,
            containerName,
            networkName,
            volumeName,
            label,
            runLabel,
          },
          operationError,
          cleanupResults,
        );
      }
      return outcome;
    },
  };
}

async function main() {
  const separator = process.argv.indexOf('--');
  const command = separator >= 0 ? process.argv[separator + 1] : undefined;
  const args = separator >= 0 ? process.argv.slice(separator + 2) : [];
  if (separator >= 0 && !command) {
    process.stderr.write(
      'Usage: node scripts/managed-postgres.mjs [-- command ...]\n',
    );
    process.exitCode = 2;
    return;
  }

  const controller = new AbortController();
  let receivedSignal;
  const interrupt = (signal) => {
    receivedSignal = signal;
    const error = new Error(`Interrupted by ${signal}`);
    error.name = 'AbortError';
    controller.abort(error);
  };
  const onSigint = () => interrupt('SIGINT');
  const onSigterm = () => interrupt('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  try {
    const result = await createManagedPostgresRunner().run({
      command,
      args,
      signal: controller.signal,
    });
    process.exitCode = result.status;
  } catch (error) {
    if (error?.name === 'AbortError') {
      process.stderr.write(
        `Managed PostgreSQL verification interrupted: ${error.message}\n`,
      );
      process.exitCode = receivedSignal === 'SIGTERM' ? 143 : 130;
    } else {
      process.stderr.write(
        `Managed PostgreSQL verification failed: ${error.message}\n`,
      );
      process.exitCode = 1;
    }
  } finally {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  await main();
}
