import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  invoiceRecords as records,
  invoiceRecordCommands as commands,
  invoiceRecordHistory as history,
  invoiceRecordCursorKeys as cursorKeys,
} from '../database/schema/invoice-record.js';
import {
  REVISION_PAGE_SIZE,
  verifyCommittedRevision,
  verifyRevisionPage,
  type RevisionPage,
} from '../revision-history/revision-history.js';
import type { InvoiceInput } from './invoice-record.input.js';
import {
  invoiceHistoryRevision,
  invoiceReceipt,
  invoiceSnapshot,
} from './invoice-record.representation.js';
import type {
  InvoiceRevision,
  InvoiceScope,
  InvoiceSourceSnapshot,
  InvoiceSummary,
} from './invoice-record.types.js';
/** A stored Invoice Record coupled with its source snapshot and verified history head. */
export interface StoredInvoiceRecord {
  readonly row: typeof records.$inferSelect;
  readonly snapshot: InvoiceSourceSnapshot;
  readonly head: InvoiceRevision;
  /** The first history page, read once with the root. */
  readonly history: RevisionPage<InvoiceRevision>;
}
@Injectable()
export class InvoiceRecordStore {
  constructor(private readonly database: DatabaseContext) {}
  async current(scope: InvoiceScope, id: string, lock = false) {
    const query = this.database.connection
      .select()
      .from(records)
      .where(
        and(
          eq(records.workspaceId, scope.workspaceId),
          eq(records.companyId, scope.companyId),
          eq(records.id, id),
        ),
      );
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw new NotFoundException();
    return this.coupled(row);
  }
  /**
   * Couple a stored root with its source snapshot and its first verified
   * history page. The page is read here once; callers reuse it.
   */
  private async coupled(
    row: typeof records.$inferSelect,
  ): Promise<StoredInvoiceRecord> {
    const snapshot = stored(() => invoiceSnapshot(row.sourceSnapshot));
    if (
      snapshot.source.documentId !== row.documentId ||
      snapshot.source.documentVersionId !== row.documentVersionId ||
      snapshot.source.representationId !== row.representationId
    )
      throw new Error('Invalid invoice source coupling.');
    const revisions = await this.history(
      { workspaceId: row.workspaceId, companyId: row.companyId },
      row.id,
    );
    const head = revisions.items[0];
    if (
      !head ||
      head.revision !== row.revision ||
      head.after.entryState !== row.entryState ||
      !isDeepStrictEqual(head.after.values, row.values)
    )
      throw new Error('Invalid invoice head coupling.');
    return { row, snapshot, head, history: revisions };
  }
  async summary({
    row,
    snapshot,
    head,
  }: StoredInvoiceRecord): Promise<InvoiceSummary> {
    const [replacement] = await this.database.connection
      .select({ id: records.id })
      .from(records)
      .where(
        and(
          eq(records.workspaceId, row.workspaceId),
          eq(records.companyId, row.companyId),
          eq(records.replacesWithdrawnRecordId, row.id),
        ),
      )
      .limit(1);
    return {
      id: row.id,
      revision: row.revision,
      ...head.after,
      copiedContext: snapshot.copiedContext,
      createdAt: row.createdAt.toISOString(),
      replacesWithdrawnRecordId: row.replacesWithdrawnRecordId,
      replacementRecordId: replacement?.id ?? null,
    };
  }
  async inventory(
    scope: InvoiceScope,
    after?: { createdAt: string; id: string },
  ) {
    const rows = await this.database.connection
      .select()
      .from(records)
      .where(
        and(
          eq(records.workspaceId, scope.workspaceId),
          eq(records.companyId, scope.companyId),
          after
            ? sql`(${records.createdAt},${records.id})<(${after.createdAt}::timestamptz,${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(records.createdAt), desc(records.id))
      .limit(26);
    // Inside the read transaction the connection is one pg client, which
    // runs one query at a time: build the summaries one after the other.
    const items = [];
    for (const row of rows.slice(0, 25))
      items.push(await this.summary(await this.coupled(row)));
    return { items, hasMore: rows.length > 25 };
  }
  async history(
    scope: InvoiceScope,
    id: string,
    before?: number,
  ): Promise<RevisionPage<InvoiceRevision>> {
    const rows = await this.database.connection
      .select({
        revision: history.revision,
        commandId: history.commandId,
        fact: history.fact,
      })
      .from(history)
      .where(
        and(
          eq(history.workspaceId, scope.workspaceId),
          eq(history.companyId, scope.companyId),
          eq(history.recordId, id),
          before === undefined ? undefined : lt(history.revision, before),
        ),
      )
      .orderBy(desc(history.revision))
      .limit(REVISION_PAGE_SIZE + 1);
    return verifyRevisionPage({
      subject: 'Invoice Record',
      targetId: id,
      rows,
      before,
      decode: (fact) => stored(() => invoiceHistoryRevision(fact)),
      targetOf: (fact) => fact.recordId,
    });
  }
  intent(
    actor: ActorContext,
    scope: InvoiceScope,
    recordId: string,
    body: InvoiceInput,
  ) {
    return {
      format: 'EXTERNAL_INVOICE_INTENT/1',
      workspaceId: scope.workspaceId,
      companyId: scope.companyId,
      actorMembershipId: actor.workspaceMembershipId,
      recordId,
      body,
    };
  }
  async findReceipt(actor: ActorContext, key: string) {
    const [row] = await this.database.connection
      .select()
      .from(commands)
      .where(
        and(
          eq(commands.workspaceId, actor.workspaceId),
          eq(commands.actorMembershipId, actor.workspaceMembershipId),
          eq(commands.idempotencyKey, key),
        ),
      )
      .limit(1);
    return row;
  }
  async replay(row: typeof commands.$inferSelect) {
    const receipt = stored(() => invoiceReceipt(row.response));
    const [h] = await this.database.connection
      .select()
      .from(history)
      .where(
        and(
          eq(history.workspaceId, row.workspaceId),
          eq(history.companyId, row.companyId),
          eq(history.recordId, row.recordId),
          eq(history.revision, row.revision),
        ),
      );
    if (!h) throw new Error('Missing invoice committed revision.');
    const fact = stored(() => invoiceHistoryRevision(h.fact));
    verifyCommittedRevision({
      subject: 'Invoice Record',
      command: { ...row, targetId: row.recordId },
      receipt: { ...receipt, targetId: receipt.recordId },
      fact: { ...fact, targetId: fact.recordId },
    });
    return receipt;
  }
  async write(input: {
    actor: ActorContext;
    scope: InvoiceScope;
    recordId: string;
    body: InvoiceInput;
    key: string;
    assignmentId: string;
    sourceCaptures: unknown;
  }) {
    const [row] = await this.database.connection
      .insert(commands)
      .values({
        ...input.scope,
        recordId: input.recordId,
        actorMembershipId: input.actor.workspaceMembershipId,
        actorInternalUserId: input.actor.internalUserId,
        actorDisplayName: input.actor.displayName,
        assignmentId: input.assignmentId,
        sourceCaptures: input.sourceCaptures,
        idempotencyKey: input.key,
        intent: this.intent(
          input.actor,
          input.scope,
          input.recordId,
          input.body,
        ),
      })
      .returning();
    if (!row) throw new Error('Invoice command was not recorded.');
    return { row, receipt: stored(() => invoiceReceipt(row.response)) };
  }
  async cursorKey(scope: InvoiceScope, create = false) {
    if (create)
      await this.database.connection
        .insert(cursorKeys)
        .values(scope)
        .onConflictDoNothing();
    const [row] = await this.database.connection
      .select({ key: cursorKeys.key })
      .from(cursorKeys)
      .where(
        and(
          eq(cursorKeys.workspaceId, scope.workspaceId),
          eq(cursorKeys.companyId, scope.companyId),
        ),
      );
    if (!row || !/^[a-f0-9-]{72}$/u.test(row.key))
      throw new Error('Invoice continuation is unavailable.');
    return row.key;
  }
}

function stored<T>(read: () => T): T {
  try {
    return read();
  } catch {
    throw new Error('Invalid stored Invoice Record representation.');
  }
}
