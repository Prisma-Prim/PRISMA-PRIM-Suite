import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import {
  ADJUSTED,
  COMPANY,
  type Executor,
  MEMBERSHIP,
  PLAIN,
  SIGNED_AT,
  type Target,
  USER,
  WORKSPACE,
  approveAdjusted,
  baseRecords,
  executedPlainContract,
  insertRun,
  pendingAdjustedContract,
} from './contract-adjusted-snapshot.test-support.js';

// Synthetic records only; nothing here is a real price, Contract or Client.
const databaseUrl = process.env.TEST_DATABASE_URL;

it.skipIf(!databaseUrl)(
  'binds Contract rule set v1 to unadjusted and v2 to adjusted Snapshots in runs and approval and signature events on a database migrated from empty',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'contract_561_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      const pool = database.targetPool;
      const query = (text: string, values: unknown[] = []) =>
        pool.query(text, values);

      await query(baseRecords());
      await query(executedPlainContract());
      await query(pendingAdjustedContract());

      // Runs use the binding derived from the immutable Snapshot.
      for (const [target, ruleSetVersion] of [
        [ADJUSTED, 1],
        [PLAIN, 2],
        [ADJUSTED, 3],
        [PLAIN, 0],
      ] as const)
        await expect(
          insertRun(pool, target, ruleSetVersion),
        ).rejects.toMatchObject({ code: '23514' });
      await insertRun(pool, PLAIN, 1);
      await insertRun(pool, ADJUSTED, 2);

      // Approval and signature events name the bound rule set as a JSON number.
      for (const [target, action, ruleSetVersion] of [
        [ADJUSTED, 'contract_version.approved', 1],
        [ADJUSTED, 'contract_version.approved', '2'],
        [ADJUSTED, 'contract_version.approved', 2.5],
        [ADJUSTED, 'contract_version.approved', 3],
        [ADJUSTED, 'contract_version.approved', null],
        [ADJUSTED, 'contract_version.signature_recorded', 1],
        [ADJUSTED, 'contract_version.signature_recorded', '2'],
        [PLAIN, 'contract_version.signature_recorded', 2],
        [PLAIN, 'contract_version.approved', 2],
      ] as const)
        await expect(
          insertEvent(pool, target, action, { ruleSetVersion }),
        ).rejects.toMatchObject({ code: '23514' });
      // The typed check refuses a JSON string by itself, and other events never
      // carry a rule set version.
      for (const [action, ruleSetVersion] of [
        ['contract_version.approved', '2'],
        ['contract_version.signature_recorded', '1'],
        ['contract_version.rejected', 1],
      ] as const)
        await expect(
          withoutEventBinding(pool, (client) =>
            insertEvent(client, ADJUSTED, action, { ruleSetVersion }),
          ),
        ).rejects.toMatchObject({
          code: '23514',
          constraint: 'contract_events_metadata_check',
        });
      await expect(
        rolledBack(pool, (client) =>
          insertEvent(client, ADJUSTED, 'contract_version.approved', {
            ruleSetVersion: 2,
          }),
        ),
      ).resolves.toBeUndefined();

      // A rule set v2 approval commits through the deferred decision evidence guard.
      await query(approveAdjusted());
      expect(
        (
          await query(
            "SELECT metadata->'ruleSetVersion' AS rule FROM contract_events WHERE action='contract_version.approved' ORDER BY occurred_at",
          )
        ).rows,
      ).toEqual([{ rule: 1 }, { rule: 2 }]);
      // Every approval and signature event names its Version's bound rule set.
      expect(
        (
          await query(
            `SELECT count(*)::int AS unbound FROM contract_events event
               JOIN contract_versions bound ON bound.id = event.contract_version_id
              WHERE event.action IN ('contract_version.approved','contract_version.signature_recorded')
                AND event.metadata->'ruleSetVersion' IS DISTINCT FROM to_jsonb(contract_version_quality_rule_set(bound.workspace_id, bound.company_id, bound.id))`,
          )
        ).rows,
      ).toEqual([{ unbound: 0 }]);
    } finally {
      await database.close();
    }
  },
  60_000,
);

function insertEvent(
  pool: Executor,
  target: Target,
  action: string,
  metadata: Record<string, unknown>,
) {
  return pool.query(
    `INSERT INTO contract_events (workspace_id, company_id, contract_id, contract_version_id, actor_internal_user_id, actor_workspace_membership_id, occurred_at, action, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      WORKSPACE,
      COMPANY,
      target.contract,
      target.version,
      USER,
      MEMBERSHIP,
      SIGNED_AT,
      action,
      JSON.stringify({
        contractId: target.contract,
        contractVersionId: target.version,
        versionNumber: 1,
        kind: 'CONTRACT',
        origin: 'DIRECT',
        provenance: 'ILLUSTRATIVE',
        pricingSnapshotId: target.snapshot,
        ...(action === 'contract_version.rejected'
          ? {}
          : { acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'] }),
        ...(action === 'contract_version.signature_recorded'
          ? { evidenceKind: 'SIMULATED' }
          : {}),
        ...metadata,
      }),
    ],
  );
}

/** Runs statements on one connection in a transaction that is always rolled back. */
async function rolledBack(
  pool: Pool,
  statement: (client: Executor) => Promise<unknown>,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await statement(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

/**
 * Isolates the metadata CHECK from the binding trigger inside one rolled-back
 * transaction, so the trigger is never disabled for any other statement.
 */
async function withoutEventBinding(
  pool: Pool,
  statement: (client: Executor) => Promise<unknown>,
) {
  return rolledBack(pool, async (client) => {
    await client.query(
      'ALTER TABLE contract_events DISABLE TRIGGER contract_events_bound_rule_set',
    );
    await statement(client);
  });
}
