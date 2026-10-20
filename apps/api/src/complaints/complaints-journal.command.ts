import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import type { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import type { AccountabilityService } from '../accountability/accountability.service.js';
import type { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import type { ServerClock } from '../clock/server-clock.js';
import {
  commandFingerprint,
  idempotencyConflict,
  runIdempotentCommand,
  staleVersionConflict,
} from '../command/idempotent-command.js';
import type { DatabaseContext } from '../database/database-context.js';
import {
  complaints,
  complaintJournalEntries,
  complaintReceipts,
} from '../database/schema/index.js';
import type { ProjectService } from '../project/project.service.js';
import { protectComplaintOutcome } from './complaints.failure.js';
import {
  readComplaintJournalRecord,
  readComplaintJournalCorrection,
  readComplaintReceipt,
  type ComplaintView,
} from './complaints.validation.js';

type JournalCommand =
  | ({ operation: 'append-journal' } & ReturnType<
      typeof readComplaintJournalRecord
    >)
  | ({ operation: 'correct-journal'; originalEntryId: string } & ReturnType<
      typeof readComplaintJournalCorrection
    >);

// Private command implementation for the Complaint owner's existing composition.
// The owning view callback keeps identity/Client/Project presentation in one place.
export function writeComplaintJournal({
  actor,
  complaintId: value,
  input,
  key,
  target,
  database,
  authorization,
  clients,
  projects,
  accountability,
  clock,
  readView,
}: {
  actor: ActorContext;
  complaintId: unknown;
  input: unknown;
  key: string | undefined;
  target: { kind: 'append' } | { kind: 'correction'; originalEntryId: unknown };
  database: DatabaseContext;
  authorization: CompanyContextAuthorization;
  clients: ClientOperationalReferenceService;
  projects: ProjectService;
  accountability: AccountabilityService;
  clock: ServerClock;
  readView: (row: typeof complaints.$inferSelect) => Promise<ComplaintView>;
}): Promise<ComplaintView> {
  return protectComplaintOutcome(async () => {
    const complaintId = requireUuid(value);
    const idempotencyKey = requireIdempotencyKey(key);
    const command: JournalCommand =
      target.kind === 'append'
        ? { operation: 'append-journal', ...readComplaintJournalRecord(input) }
        : {
            operation: 'correct-journal',
            originalEntryId: requireUuid(target.originalEntryId),
            ...readComplaintJournalCorrection(input),
          };
    const fingerprint = commandFingerprint({
      companyId: actor.activeCompany?.id,
      complaintId,
      ...command,
    });
    const complaintScope = (companyId: string) =>
      and(
        eq(complaints.workspaceId, actor.workspaceId),
        eq(complaints.companyId, companyId),
        eq(complaints.id, complaintId),
      );
    return runIdempotentCommand(database, {
      fingerprint,
      authorize: async () => {
        const companyId = await authorization.requireComplaintRecord(
          actor,
          true,
        );
        const [row] = await database.connection
          .select()
          .from(complaints)
          .where(complaintScope(companyId));
        if (!row) throw new NotFoundException();
        // Current live related reads precede every receipt lookup. Superseded
        // originals may replay a committed receipt, not execute a new write.
        const references = await clients.readProjectReferences(
          actor,
          [row.clientAccountId],
          true,
          true,
        );
        if (!references.has(row.clientAccountId)) throw new NotFoundException();
        if (row.projectId !== null) {
          await authorization.requireProjectReadPermission(actor, true);
          const project = await projects.read(actor, row.projectId);
          if (project.clientAccountId !== row.clientAccountId)
            throw new NotFoundException();
        }
        return { companyId, originalClientId: row.clientAccountId };
      },
      lockParts: ({ companyId }) => [
        'complaint-command',
        actor.workspaceId,
        companyId,
        actor.workspaceMembershipId,
        idempotencyKey,
      ],
      findReceipt: async ({ companyId }) => {
        const [receipt] = await database.connection
          .select()
          .from(complaintReceipts)
          .where(
            and(
              eq(complaintReceipts.workspaceId, actor.workspaceId),
              eq(complaintReceipts.companyId, companyId),
              eq(
                complaintReceipts.actorMembershipId,
                actor.workspaceMembershipId,
              ),
              eq(complaintReceipts.idempotencyKey, idempotencyKey),
            ),
          );
        return receipt;
      },
      conflict: () => idempotencyConflict(),
      replay: async ({ companyId }, receipt) => {
        const result = readComplaintReceipt(receipt.response);
        if (
          result.workspaceId !== actor.workspaceId ||
          result.companyId !== companyId ||
          result.id !== complaintId ||
          receipt.complaintId !== complaintId
        )
          throw new Error('Invalid persisted Complaint receipt scope.');
        return result;
      },
      execute: async ({ companyId, originalClientId }) => {
        await clients.lockActiveReferenceClient(actor, originalClientId);
        const [row] = await database.connection
          .select()
          .from(complaints)
          .where(complaintScope(companyId))
          .for('update');
        if (!row) throw new NotFoundException();
        if (row.revision !== command.expectedRevision)
          throw staleVersionConflict(
            'Reload the current Complaint before recording journal facts.',
          );
        if (row.revision >= 2147483647)
          throw new ConflictException('Complaint revision is exhausted.');
        const revision = row.revision + 1;
        const occurredAt = clock.now();
        let declaration:
          | {
              kind: 'action' | 'response';
              originalEntryId: null;
              originalKind: null;
              reason: null;
            }
          | {
              kind: 'correction';
              originalEntryId: string;
              originalKind: 'action' | 'response';
              reason: string;
            };
        if (command.operation === 'append-journal') {
          declaration = {
            kind: command.kind,
            originalEntryId: null,
            originalKind: null,
            reason: null,
          };
        } else {
          const [original] = await database.connection
            .select()
            .from(complaintJournalEntries)
            .where(
              and(
                eq(complaintJournalEntries.workspaceId, actor.workspaceId),
                eq(complaintJournalEntries.companyId, companyId),
                eq(complaintJournalEntries.complaintId, complaintId),
                eq(complaintJournalEntries.id, command.originalEntryId),
                inArray(complaintJournalEntries.kind, ['action', 'response']),
              ),
            )
            .for('share');
          if (
            !original ||
            (original.kind !== 'action' && original.kind !== 'response')
          )
            throw new NotFoundException();
          declaration = {
            kind: 'correction',
            originalEntryId: original.id,
            originalKind: original.kind,
            reason: command.reason,
          };
        }
        await database.connection.insert(complaintJournalEntries).values({
          workspaceId: actor.workspaceId,
          companyId,
          complaintId,
          revision,
          ...declaration,
          factualText: command.text,
          declaredDate: command.declaredDate,
          actorMembershipId: actor.workspaceMembershipId,
          actorInternalUserId: actor.internalUserId,
          actorDisplayLabel: actor.displayName,
          occurredAt,
        });
        const [updated] = await database.connection
          .update(complaints)
          .set({ revision })
          .where(complaintScope(companyId))
          .returning();
        if (!updated) throw new Error('Complaint journal was not recorded.');
        await clients.recordReferenceUse(actor, originalClientId);
        await accountability.recordComplaintEvent({
          actor,
          companyId,
          complaintId,
          occurredAt,
          action: 'complaint.journal.recorded',
          revision,
          kind: declaration.kind,
        });
        const result = await readView(updated);
        await database.connection.insert(complaintReceipts).values({
          workspaceId: actor.workspaceId,
          companyId,
          actorMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          complaintId,
          fingerprint,
          response: result,
        });
        return result;
      },
    });
  });
}
