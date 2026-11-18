import { databaseTargetsAreSafe } from '../../apps/api/test-support/postgres-database-target.mjs';
import { PilotUsageError } from './protocol.mjs';
import { createServer } from 'node:net';

async function requireVacantPort(port) {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', () =>
      reject(
        new PilotUsageError(
          `Local audit pilot port ${port} is already in use or unavailable.`,
        ),
      ),
    );
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      probe.close((error) => (error ? reject(error) : resolve()));
    });
  });
}

export async function launchAuditPilot(options) {
  if (
    (process.env.DATABASE_URL || process.env.TEST_DATABASE_URL) &&
    !databaseTargetsAreSafe(
      process.env.DATABASE_URL,
      process.env.TEST_DATABASE_URL,
    )
  ) {
    throw new PilotUsageError(
      'Audit pilot requires local disposable database targets; unset unrelated database configuration.',
    );
  }
  for (const port of [4173, 4174]) await requireVacantPort(port);
  const { supervisePilot } = await import('./supervise.mjs');
  return supervisePilot(options);
}
