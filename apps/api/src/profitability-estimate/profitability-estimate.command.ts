import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ActorContext } from '../access/access.types.js';
import { profitabilityEstimateReceipts } from '../database/schema/index.js';
import { readProfitabilityReceipt } from './profitability-estimate.persistence.js';

export type ProfitabilityCommandKind = 'create' | 'decide';

export async function profitabilityReplay(
  connection: NodePgDatabase,
  actor: ActorContext,
  companyId: string,
  commandKind: ProfitabilityCommandKind,
  idempotencyKey: string,
  fingerprint: string,
) {
  const scope = [
    actor.workspaceId,
    companyId,
    actor.workspaceMembershipId,
    commandKind,
    idempotencyKey,
  ];
  await connection.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['profitability-command', ...scope])}, 0))`,
  );
  const [receipt] = await connection
    .select()
    .from(profitabilityEstimateReceipts)
    .where(
      and(
        eq(profitabilityEstimateReceipts.workspaceId, actor.workspaceId),
        eq(profitabilityEstimateReceipts.companyId, companyId),
        eq(
          profitabilityEstimateReceipts.actorWorkspaceMembershipId,
          actor.workspaceMembershipId,
        ),
        eq(profitabilityEstimateReceipts.commandKind, commandKind),
        eq(profitabilityEstimateReceipts.idempotencyKey, idempotencyKey),
      ),
    );
  if (!receipt) return undefined;
  if (receipt.fingerprint !== fingerprint)
    throw new ConflictException({
      code: 'IDEMPOTENCY_CONFLICT',
      message: 'Idempotency-Key was already used for different input.',
    });
  return readProfitabilityReceipt(receipt.response);
}

// Object ordering is immaterial; every submitted field, string and array
// order is material, including optimistic expectations and target spelling.
export function profitabilityFingerprint(
  target: Record<string, unknown>,
): string {
  return createHash('sha256').update(stableJson(target)).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
