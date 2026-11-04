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
import type { InvoiceInput } from './invoice-record.input.js';
import {
  invoiceHistoryRevision,
  invoiceReceipt,
  invoiceSnapshot,
} from './invoice-record.representation.js';
import type { InvoiceScope, InvoiceSummary } from './invoice-record.types.js';
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
    const snapshot = stored(() => invoiceSnapshot(row.sourceSnapshot));
    if (
      snapshot.source.documentId !== row.documentId ||
      snapshot.source.documentVersionId !== row.documentVersionId ||
      snapshot.source.representationId !== row.representationId
    )
      throw new Error('Invalid invoice source coupling.');
    const revisions = await this.history(scope, id);
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
  async summary(row: typeof records.$inferSelect): Promise<InvoiceSummary> {
    const snapshot = stored(() => invoiceSnapshot(row.sourceSnapshot)),
      h = await this.history(
        { workspaceId: row.workspaceId, companyId: row.companyId },
        row.id,
      );
    const head = h.items[0];
    if (
      !head ||
      head.revision !== row.revision ||
      head.after.entryState !== row.entryState ||
      !isDeepStrictEqual(head.after.values, row.values)
    )
      throw new Error('Invalid invoice inventory head.');
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
    const items = await Promise.all(
      rows.slice(0, 25).map((row) => this.summary(row)),
    );
    return { items, hasMore: rows.length > 25 };
  }
  async history(scope: InvoiceScope, id: string, before?: number) {
    const rows = await this.database.connection
      .select()
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
      .limit(26);
    const items = rows.map((row) => {
      const fact = stored(() => invoiceHistoryRevision(row.fact));
      if (
        fact.recordId !== id ||
        fact.revision !== row.revision ||
        fact.commandId !== row.commandId
      )
        throw new Error('Invalid invoice revision coupling.');
      return fact;
    });
    for (let i = 0; i < items.length - 1; i++) {
      const a = items[i],
        b = items[i + 1];
      if (
        !a ||
        !b ||
        a.revision !== b.revision + 1 ||
        !isDeepStrictEqual(a.before, b.after)
      )
        throw new Error('Invalid invoice history chain.');
    }
    return { items: items.slice(0, 25), hasMore: rows.length > 25 };
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
    if (
      receipt.commandId !== row.id ||
      receipt.recordId !== row.recordId ||
      receipt.revision !== row.revision ||
      fact.commandId !== row.id ||
      fact.action !== receipt.action ||
      fact.recordedAt !== receipt.recordedAt ||
      new Date(receipt.recordedAt).getTime() !== row.createdAt.getTime()
    )
      throw new Error('Invalid committed invoice receipt.');
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
