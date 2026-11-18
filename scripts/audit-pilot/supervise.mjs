import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSystemAdapter } from '../managed-postgres.mjs';

/** The existing managed runner owns PostgreSQL and child-process cleanup. */
export async function supervisePilot(options) {
  const directory = await mkdtemp(join(tmpdir(), 'prisma-audit-pilot-'));
  const readyFile = join(directory, 'ready.json');
  const controller = new AbortController();
  let interrupted = false;
  let timedOut = false;
  const interrupt = () => {
    interrupted = true;
    controller.abort(new Error('Pilot interrupted.'));
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const startup = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('Pilot startup deadline exceeded.'));
  }, 180_000);
  const observed = setInterval(() => {
    void readFile(readyFile, 'utf8')
      .then((raw) => {
        const report = JSON.parse(raw);
        if (
          report.schema === 'prisma-prim-local-audit-pilot/v1' &&
          report.status === 'ready'
        ) {
          clearTimeout(startup);
          clearInterval(observed);
        }
      })
      .catch(() => undefined);
  }, 100);
  try {
    const managed = fileURLToPath(
      new URL('../managed-postgres.mjs', import.meta.url),
    );
    const runtime = fileURLToPath(
      new URL('../../apps/web/e2e/audit-pilot-runtime.mjs', import.meta.url),
    );
    const result = await createSystemAdapter({
      terminationGraceMilliseconds: 10_000,
    }).run(
      process.execPath,
      [
        managed,
        '--',
        process.execPath,
        runtime,
        ...(options.action === 'check' ? ['--check'] : []),
      ],
      {
        signal: controller.signal,
        env: { ...process.env, PRISMA_AUDIT_PILOT_READY_FILE: readyFile },
        stdio: 'inherit',
      },
    );
    return result.status;
  } catch {
    if (interrupted) return 130;
    process.stderr.write(
      timedOut
        ? 'Audit pilot startup exceeded 180 seconds.\n'
        : 'Audit pilot failed; its owned managed session was stopped.\n',
    );
    return 1;
  } finally {
    clearTimeout(startup);
    clearInterval(observed);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    await rm(directory, { recursive: true, force: true });
  }
}
