import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  paymentObservations as records,
  paymentCommands as commands,
  paymentHistory as history,
  paymentCursorKeys as cursorKeys,
} from '../database/schema/payment.js';
import {
  REVISION_PAGE_SIZE,
  verifyCommittedRevision,
  verifyRevisionPage,
  type RevisionPage,
} from '../revision-history/revision-history.js';
import type { PaymentInput } from './payment.input.js';
import {
  paymentHistoryRevision,
  paymentReceipt,
  paymentSnapshot,
} from './payment.representation.js';
import type {
  PaymentRevision,
  PaymentScope,
  PaymentSourceSnapshot,
  PaymentSummary,
} from './payment.types.js';
/** A stored Payment coupled with its source snapshot and verified history head. */
export interface StoredPayment {
  readonly row: typeof records.$inferSelect;
  readonly snapshot: PaymentSourceSnapshot;
  readonly head: PaymentRevision;
  /** The first history page, read once with the root. */
  readonly history: RevisionPage<PaymentRevision>;
}
@Injectable()
export class PaymentStore {
  constructor(private readonly database: DatabaseContext) {}
  async isDraftAuthor(actor: ActorContext, scope: PaymentScope, id: string) {
    const rows = await this.database.connection
      .select({ actor: commands.actorInternalUserId })
      .from(commands)
      .where(
        and(
          eq(commands.workspaceId, scope.workspaceId),
          eq(commands.companyId, scope.companyId),
          eq(commands.paymentId, id),
          eq(commands.actorInternalUserId, actor.internalUserId),
          sql`${commands.intent}->'body'->>'action' IN ('CREATE','CORRECT_DRAFT')`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
  async current(scope: PaymentScope, id: string, lock = false) {
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
  ): Promise<StoredPayment> {
    const snapshot = stored(() => paymentSnapshot(row.sourceSnapshot));
    if (
      snapshot.source.documentId !== row.documentId ||
      snapshot.source.documentVersionId !== row.documentVersionId ||
      snapshot.source.representationId !== row.representationId
    )
      throw new Error('Invalid payment source coupling.');
    const revisions = await this.history(
      { workspaceId: row.workspaceId, companyId: row.companyId },
      row.id,
    );
    const head = revisions.items[0];
    if (
      !head ||
      head.revision !== row.revision ||
      head.after.state !== row.state ||
      !isDeepStrictEqual(head.after.values, row.values) ||
      !isDeepStrictEqual(head.after.confirmation, row.confirmation)
    )
      throw new Error('Invalid payment head coupling.');
    return { row, snapshot, head, history: revisions };
  }
  async summary({
    row,
    snapshot,
    head,
  }: StoredPayment): Promise<PaymentSummary> {
    const [replacement] = await this.database.connection
      .select({ id: records.id })
      .from(records)
      .where(
        and(
          eq(records.workspaceId, row.workspaceId),
          eq(records.companyId, row.companyId),
          eq(records.replacesClosedPaymentId, row.id),
        ),
      )
      .limit(1);
    return {
      id: row.id,
      revision: row.revision,
      ...head.after,
      copiedContext: snapshot.copiedContext,
      createdAt: row.createdAt.toISOString(),
      replacesClosedPaymentId: row.replacesClosedPaymentId,
      replacementPaymentId: replacement?.id ?? null,
    };
  }
  async inventory(
    scope: PaymentScope,
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
    scope: PaymentScope,
    id: string,
    before?: number,
  ): Promise<RevisionPage<PaymentRevision>> {
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
          eq(history.paymentId, id),
          before === undefined ? undefined : lt(history.revision, before),
        ),
      )
      .orderBy(desc(history.revision))
      .limit(REVISION_PAGE_SIZE + 1);
    return verifyRevisionPage({
      subject: 'Payment',
      targetId: id,
      rows,
      before,
      decode: (fact) => stored(() => paymentHistoryRevision(fact)),
      targetOf: (fact) => fact.paymentId,
    });
  }
  intent(
    actor: ActorContext,
    scope: PaymentScope,
    paymentId: string,
    body: PaymentInput,
  ) {
    return {
      format: 'PAYMENT_INTENT/1',
      workspaceId: scope.workspaceId,
      companyId: scope.companyId,
      actorMembershipId: actor.workspaceMembershipId,
      paymentId,
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
    const receipt = stored(() => paymentReceipt(row.response));
    const [h] = await this.database.connection
      .select()
      .from(history)
      .where(
        and(
          eq(history.workspaceId, row.workspaceId),
          eq(history.companyId, row.companyId),
          eq(history.paymentId, row.paymentId),
          eq(history.revision, row.revision),
        ),
      );
    if (!h) throw new Error('Missing payment committed revision.');
    const fact = stored(() => paymentHistoryRevision(h.fact));
    verifyCommittedRevision({
      subject: 'Payment',
      command: { ...row, targetId: row.paymentId },
      receipt: { ...receipt, targetId: receipt.paymentId },
      fact: { ...fact, targetId: fact.paymentId },
    });
    return receipt;
  }
  async write(input: {
    actor: ActorContext;
    scope: PaymentScope;
    paymentId: string;
    body: PaymentInput;
    key: string;
    assignmentId: string;
    sourceCaptures: unknown;
  }) {
    const [row] = await this.database.connection
      .insert(commands)
      .values({
        ...input.scope,
        paymentId: input.paymentId,
        actorMembershipId: input.actor.workspaceMembershipId,
        actorInternalUserId: input.actor.internalUserId,
        actorDisplayName: input.actor.displayName,
        assignmentId: input.assignmentId,
        sourceCaptures: input.sourceCaptures,
        idempotencyKey: input.key,
        intent: this.intent(
          input.actor,
          input.scope,
          input.paymentId,
          input.body,
        ),
      })
      .returning();
    if (!row) throw new Error('Payment command was not recorded.');
    return { row, receipt: stored(() => paymentReceipt(row.response)) };
  }
  async cursorKey(scope: PaymentScope) {
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
      throw new Error('Payment continuation is unavailable.');
    return row.key;
  }
}

function stored<T>(read: () => T): T {
  try {
    return read();
  } catch {
    throw new Error('Invalid stored Payment Record representation.');
  }
}
