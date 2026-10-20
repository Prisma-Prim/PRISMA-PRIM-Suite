import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';
import type { ActorContext } from '../access/access.types.js';
import type { DatabaseContext } from '../database/database-context.js';
import {
  complaintIntakeVersions,
  complaintJournalEntries,
} from '../database/schema/index.js';
import {
  readComplaintIntake,
  readComplaintJournalFact,
  type ComplaintHistoryEntry,
  type ComplaintHistoryPage,
  type ComplaintJournalOriginal,
  type ComplaintView,
} from './complaints.validation.js';

// The caller has already read the Complaint through every current owner and
// owns the one snapshot for authorized count, page, originals and corrected marks.
export async function readComplaintHistorySnapshot({
  database,
  actor,
  complaint,
  offset,
}: {
  database: DatabaseContext;
  actor: ActorContext;
  complaint: ComplaintView;
  offset: number;
}): Promise<ComplaintHistoryPage> {
  const intakeScope = and(
    eq(complaintIntakeVersions.workspaceId, actor.workspaceId),
    eq(complaintIntakeVersions.companyId, complaint.companyId),
    eq(complaintIntakeVersions.complaintId, complaint.id),
  );
  const journalScope = and(
    eq(complaintJournalEntries.workspaceId, actor.workspaceId),
    eq(complaintJournalEntries.companyId, complaint.companyId),
    eq(complaintJournalEntries.complaintId, complaint.id),
  );
  const intakes = database.connection
    .select({
      id: complaintIntakeVersions.id,
      revision: complaintIntakeVersions.revision,
      kind: sql<string>`CASE WHEN ${complaintIntakeVersions.revision} = 1 THEN 'intake' ELSE 'intake_correction' END`.as(
        'kind',
      ),
      intake: complaintIntakeVersions.intake,
      factualText: sql<string | null>`NULL::text`.as('factual_text'),
      declaredDate: sql<string | null>`NULL::text`.as('declared_date'),
      reason: complaintIntakeVersions.reason,
      originalEntryId: sql<string | null>`NULL::uuid`.as('original_entry_id'),
      actorMembershipId: complaintIntakeVersions.actorMembershipId,
      actorDisplayLabel: complaintIntakeVersions.actorDisplayLabel,
      occurredAt: complaintIntakeVersions.occurredAt,
    })
    .from(complaintIntakeVersions)
    .where(intakeScope);
  const journal = database.connection
    .select({
      id: complaintJournalEntries.id,
      revision: complaintJournalEntries.revision,
      kind: complaintJournalEntries.kind,
      intake: sql<unknown>`NULL::jsonb`.as('intake'),
      factualText: complaintJournalEntries.factualText,
      declaredDate: sql<
        string | null
      >`${complaintJournalEntries.declaredDate}::text`.as('declared_date'),
      reason: complaintJournalEntries.reason,
      originalEntryId: complaintJournalEntries.originalEntryId,
      actorMembershipId: complaintJournalEntries.actorMembershipId,
      actorDisplayLabel: complaintJournalEntries.actorDisplayLabel,
      occurredAt: complaintJournalEntries.occurredAt,
    })
    .from(complaintJournalEntries)
    .where(journalScope);
  const history = unionAll(intakes, journal).as('complaint_history');
  const [summary] = await database.connection
    .select({ total: count() })
    .from(history);
  if (!summary) throw new Error('Complaint history count is unavailable.');
  const rows = await database.connection
    .select()
    .from(history)
    .orderBy(asc(history.occurredAt), asc(history.id))
    .limit(25)
    .offset(offset);
  const originalIds = rows.flatMap((row) =>
    row.kind === 'correction' && row.originalEntryId !== null
      ? [row.originalEntryId]
      : [],
  );
  const originalRows =
    originalIds.length === 0
      ? []
      : await database.connection
          .select()
          .from(complaintJournalEntries)
          .where(
            and(
              journalScope,
              inArray(complaintJournalEntries.id, originalIds),
              inArray(complaintJournalEntries.kind, ['action', 'response']),
            ),
          );
  const originals = new Map(
    originalRows.map((row) => [row.id, journalOriginal(row)]),
  );
  const visibleOriginalIds = rows
    .filter((row) => row.kind === 'action' || row.kind === 'response')
    .map((row) => row.id);
  const correctionLinks =
    visibleOriginalIds.length === 0
      ? []
      : await database.connection
          .selectDistinct({
            originalEntryId: complaintJournalEntries.originalEntryId,
          })
          .from(complaintJournalEntries)
          .where(
            and(
              journalScope,
              eq(complaintJournalEntries.kind, 'correction'),
              inArray(
                complaintJournalEntries.originalEntryId,
                visibleOriginalIds,
              ),
            ),
          );
  const corrected = new Set(correctionLinks.map((row) => row.originalEntryId));
  const entries = rows.map((row): ComplaintHistoryEntry => {
    const common = {
      id: row.id,
      revision: row.revision,
      actor: {
        workspaceMembershipId: row.actorMembershipId,
        displayLabel: row.actorDisplayLabel,
      },
      recordedAt: row.occurredAt.toISOString(),
    };
    if (row.kind === 'intake')
      return {
        ...common,
        kind: 'intake',
        intake: readComplaintIntake(row.intake),
        reason: null,
      };
    if (row.kind === 'intake_correction') {
      if (row.reason === null)
        throw new Error('Complaint correction reason is unavailable.');
      return {
        ...common,
        kind: 'intake_correction',
        intake: readComplaintIntake(row.intake),
        reason: row.reason,
      };
    }
    const fact = readComplaintJournalFact({
      text: row.factualText,
      declaredDate: row.declaredDate,
    });
    if (row.kind === 'action' || row.kind === 'response')
      return {
        ...common,
        ...fact,
        kind: row.kind,
        corrected: corrected.has(row.id),
      };
    if (
      row.kind !== 'correction' ||
      row.originalEntryId === null ||
      row.reason === null
    )
      throw new Error('Complaint journal attribution is unavailable.');
    const original = originals.get(row.originalEntryId);
    if (!original)
      throw new Error('Complaint journal original is unavailable.');
    return {
      ...common,
      ...fact,
      kind: 'correction',
      originalEntryId: original.id,
      originalKind: original.kind,
      original,
      reason: row.reason,
    };
  });
  return {
    complaintId: complaint.id,
    companyId: complaint.companyId,
    revision: complaint.revision,
    entries,
    total: summary.total,
    offset,
    pageSize: 25,
  };
}

function journalOriginal(
  row: typeof complaintJournalEntries.$inferSelect,
): ComplaintJournalOriginal {
  if (row.kind !== 'action' && row.kind !== 'response')
    throw new Error('Complaint journal original is invalid.');
  return {
    id: row.id,
    revision: row.revision,
    kind: row.kind,
    ...readComplaintJournalFact({
      text: row.factualText,
      declaredDate: row.declaredDate,
    }),
    actor: {
      workspaceMembershipId: row.actorMembershipId,
      displayLabel: row.actorDisplayLabel,
    },
    recordedAt: row.occurredAt.toISOString(),
  };
}
