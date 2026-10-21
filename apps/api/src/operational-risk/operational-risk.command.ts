import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ActorContext } from '../access/access.types.js';
import { operationalRiskReceipts } from '../database/schema/index.js';
import { readOperationalRiskResult } from './operational-risk.persistence.js';

export type OperationalRiskCommandKind = 'record' | 'journal' | 'correct';

export async function operationalRiskReplay({
  connection,
  actor,
  companyId,
  kind,
  key,
  fingerprint,
  riskId,
}: {
  connection: NodePgDatabase;
  actor: ActorContext;
  companyId: string;
  kind: OperationalRiskCommandKind;
  key: string;
  fingerprint: string;
  riskId?: string;
}) {
  const scope = JSON.stringify([
    'operational-risk-command',
    actor.workspaceId,
    companyId,
    actor.workspaceMembershipId,
    kind,
    key,
  ]);
  await connection.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`,
  );
  const [receipt] = await connection
    .select()
    .from(operationalRiskReceipts)
    .where(
      and(
        eq(operationalRiskReceipts.workspaceId, actor.workspaceId),
        eq(operationalRiskReceipts.companyId, companyId),
        eq(
          operationalRiskReceipts.actorMembershipId,
          actor.workspaceMembershipId,
        ),
        eq(operationalRiskReceipts.commandKind, kind),
        eq(operationalRiskReceipts.idempotencyKey, key),
      ),
    );
  if (!receipt) return undefined;
  if (receipt.fingerprint !== fingerprint)
    throw new ConflictException({
      code: 'IDEMPOTENCY_CONFLICT',
      message: 'This command identity already records different Risk input.',
    });
  const result = readOperationalRiskResult(receipt.response, {
    companyId,
    riskId,
  });
  if (result.risk.id !== receipt.riskId)
    throw new Error('The stored Risk receipt target is invalid.');
  return result;
}

export function operationalRiskFingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
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
