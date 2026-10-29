import { NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  operationalRiskEntries,
  operationalRisks,
} from '../database/schema/index.js';
import { readOperationalRiskEntry } from './operational-risk.persistence.js';
import type { OperationalRiskJournalStatement } from './operational-risk.types.js';

/** Called inside the owning aggregate transaction or consistent read. */
export async function currentJournalStatement({
  connection,
  risk,
  journalEntryId,
}: {
  connection: NodePgDatabase;
  risk: typeof operationalRisks.$inferSelect;
  journalEntryId: string;
}): Promise<OperationalRiskJournalStatement> {
  const scope = and(
    eq(operationalRiskEntries.workspaceId, risk.workspaceId),
    eq(operationalRiskEntries.companyId, risk.companyId),
    eq(operationalRiskEntries.riskId, risk.id),
  );
  const [originalRow] = await connection
    .select()
    .from(operationalRiskEntries)
    .where(and(scope, eq(operationalRiskEntries.id, journalEntryId)));
  if (
    !originalRow ||
    (originalRow.kind !== 'observation' && originalRow.kind !== 'reassessment')
  )
    throw new NotFoundException();
  const originalEntry = readOperationalRiskEntry(originalRow);
  if (
    originalEntry.kind !== 'observation' &&
    originalEntry.kind !== 'reassessment'
  )
    throw new Error('The original Risk journal kind is invalid.');
  const [latestRow] = await connection
    .select()
    .from(operationalRiskEntries)
    .where(
      and(
        scope,
        eq(operationalRiskEntries.kind, 'journal-corrected'),
        eq(operationalRiskEntries.originalEntryId, journalEntryId),
      ),
    )
    .orderBy(desc(operationalRiskEntries.revision))
    .limit(1);
  const currentEntry = latestRow
    ? readOperationalRiskEntry(latestRow)
    : originalEntry;
  if (
    originalEntry.revision > risk.revision ||
    currentEntry.revision > risk.revision ||
    (latestRow &&
      (currentEntry.kind !== 'journal-corrected' ||
        currentEntry.originalEntryId !== originalEntry.id ||
        currentEntry.journalKind !== originalEntry.kind ||
        currentEntry.revision <= originalEntry.revision))
  )
    throw new Error('The current Risk journal lineage is invalid.');
  if (
    currentEntry.kind === 'intake-recorded' ||
    currentEntry.kind === 'intake-corrected'
  )
    throw new Error('The current Risk journal entry is invalid.');
  return {
    riskId: risk.id,
    companyId: risk.companyId,
    revision: risk.revision,
    originalEntry,
    currentEntry,
  };
}
