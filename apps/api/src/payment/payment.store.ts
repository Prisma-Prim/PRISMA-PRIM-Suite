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
import type { PaymentInput } from './payment.input.js';
import {
  paymentHistoryRevision,
  paymentReceipt,
  paymentSnapshot,
} from './payment.representation.js';
import type { PaymentScope, PaymentSummary } from './payment.types.js';
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
    const snapshot = stored(() => paymentSnapshot(row.sourceSnapshot));
    if (
      snapshot.source.documentId !== row.documentId ||
      snapshot.source.documentVersionId !== row.documentVersionId ||
      snapshot.source.representationId !== row.representationId
    )
      throw new Error('Invalid payment source coupling.');
    const revisions = await this.history(scope, id);
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
  async summary(row: typeof records.$inferSelect): Promise<PaymentSummary> {
    const snapshot = stored(() => paymentSnapshot(row.sourceSnapshot)),
      h = await this.history(
        { workspaceId: row.workspaceId, companyId: row.companyId },
        row.id,
      );
    const head = h.items[0];
    if (
      snapshot.source.documentId !== row.documentId ||
      snapshot.source.documentVersionId !== row.documentVersionId ||
      snapshot.source.representationId !== row.representationId ||
      !head ||
      head.revision !== row.revision ||
      head.after.state !== row.state ||
      !isDeepStrictEqual(head.after.values, row.values) ||
      !isDeepStrictEqual(head.after.confirmation, row.confirmation)
    )
      throw new Error('Invalid payment inventory head.');
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
    for (const row of rows.slice(0, 25)) items.push(await this.summary(row));
    return { items, hasMore: rows.length > 25 };
  }
  async history(scope: PaymentScope, id: string, before?: number) {
    const rows = await this.database.connection
      .select()
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
      .limit(26);
    const items = rows.map((row) => {
      const fact = stored(() => paymentHistoryRevision(row.fact));
      if (
        fact.paymentId !== id ||
        fact.revision !== row.revision ||
        fact.commandId !== row.commandId
      )
        throw new Error('Invalid payment revision coupling.');
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
        throw new Error('Invalid payment history chain.');
    }
    if (before !== undefined && items[0]?.revision !== before - 1)
      throw new Error('Incomplete Payment continuation.');
    const last = items.at(-1);
    if (
      last &&
      rows.length < 26 &&
      (last.revision !== 1 || last.before !== null)
    )
      throw new Error('Incomplete Payment history.');
    return { items: items.slice(0, 25), hasMore: rows.length > 25 };
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
    if (
      receipt.commandId !== row.id ||
      receipt.paymentId !== row.paymentId ||
      receipt.revision !== row.revision ||
      fact.paymentId !== row.paymentId ||
      fact.revision !== row.revision ||
      fact.actor.membershipId !== row.actorMembershipId ||
      fact.actor.displayName !== row.actorDisplayName ||
      fact.commandId !== row.id ||
      fact.action !== receipt.action ||
      fact.recordedAt !== receipt.recordedAt ||
      new Date(receipt.recordedAt).getTime() !== row.createdAt.getTime()
    )
      throw new Error('Invalid committed payment receipt.');
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
