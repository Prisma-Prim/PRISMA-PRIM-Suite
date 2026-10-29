import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ActorContext } from '../access/access.types.js';
import {
  operationalRiskEntries,
  operationalRiskReceipts,
} from '../database/schema/index.js';
import { readOperationalRiskResult } from './operational-risk.persistence.js';
import { readOperationalRiskJournalCorrection } from './operational-risk.validation.js';

export type OperationalRiskCommandKind =
  'record' | 'journal' | 'correct' | 'journal-correct';

export async function operationalRiskReplay({
  connection,
  actor,
  companyId,
  kind,
  key,
  fingerprint,
  riskId,
  journal,
}: {
  connection: NodePgDatabase;
  actor: ActorContext;
  companyId: string;
  key: string;
  fingerprint: string;
  riskId?: string;
} & (
  | { kind: 'journal-correct'; journal: { entryId: string; body: unknown } }
  | {
      kind: Exclude<OperationalRiskCommandKind, 'journal-correct'>;
      journal?: never;
    }
)) {
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
    journal:
      kind === 'journal-correct'
        ? {
            entryId: journal.entryId,
            input: readOperationalRiskJournalCorrection(journal.body),
          }
        : undefined,
  });
  if (
    (kind === 'record' && result.entry.kind !== 'intake-recorded') ||
    (kind === 'correct' && result.entry.kind !== 'intake-corrected') ||
    (kind === 'journal' &&
      result.entry.kind !== 'observation' &&
      result.entry.kind !== 'reassessment') ||
    (kind === 'journal-correct' && result.entry.kind !== 'journal-corrected')
  )
    throw new Error('The stored Risk receipt command kind is invalid.');
  if (result.risk.id !== receipt.riskId)
    throw new Error('The stored Risk receipt target is invalid.');
  if (kind === 'journal-correct' && result.entry.kind === 'journal-corrected') {
    // Validate immutable original identity, without rebuilding a historical
    // receipt from today's aggregate or current journal projection.
    const [original] = await connection
      .select({ kind: operationalRiskEntries.kind })
      .from(operationalRiskEntries)
      .where(
        and(
          eq(operationalRiskEntries.workspaceId, actor.workspaceId),
          eq(operationalRiskEntries.companyId, companyId),
          eq(operationalRiskEntries.riskId, receipt.riskId),
          eq(operationalRiskEntries.id, journal.entryId),
        ),
      );
    if (!original || original.kind !== result.entry.journalKind)
      throw new Error('The stored Risk receipt original kind is invalid.');
  }
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
