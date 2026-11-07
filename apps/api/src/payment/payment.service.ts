import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DrizzleQueryError, sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { PaymentAccountability } from '../accountability/payment-accountability.js';
import { DatabaseContext } from '../database/database-context.js';
import { DocumentPaymentSource } from '../documents/document-payment-source.js';
import {
  paymentCommand,
  paymentCreate,
  paymentKey,
  paymentQuery,
  type PaymentInput,
  type PaymentSource,
} from './payment.input.js';
import {
  paymentCursor,
  readPaymentCursor,
  type PaymentCursorBinding,
} from './payment.cursor.js';
import { PaymentStore } from './payment.store.js';
import type {
  PaymentScope,
  PaymentInventory,
  PaymentCurrent,
  PaymentHistory,
  PaymentSourcePage,
  PaymentHistoryPage,
} from './payment.types.js';
function conflict(code: string): never {
  throw new ConflictException({
    code,
    message: 'Reload and review the current payment record.',
  });
}
@Injectable()
export class PaymentService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: CompanyContextAuthorization,
    private readonly source: DocumentPaymentSource,
    private readonly store: PaymentStore,
    private readonly accountability: PaymentAccountability,
  ) {}
  /**
   * Whether the frozen Source still qualifies for new use. A native refusal is
   * an answer here, not a failure, so it must not abort the surrounding read.
   */
  private async qualifiesForNewUse(
    actor: ActorContext,
    source: PaymentSource,
  ): Promise<boolean> {
    const connection = this.database.connection;
    await connection.execute(sql`SAVEPOINT payment_new_use_probe`);
    try {
      await this.source.inspect(actor, source, true);
    } catch (error) {
      if (!nativeSourceRefusal(error)) throw error;
      await connection.execute(
        sql`ROLLBACK TO SAVEPOINT payment_new_use_probe`,
      );
      return false;
    }
    await connection.execute(sql`RELEASE SAVEPOINT payment_new_use_probe`);
    return true;
  }
  private binding(
    actor: ActorContext,
    scope: PaymentScope,
    readCapture: string,
  ): PaymentCursorBinding {
    return {
      ...scope,
      actorMembershipId: actor.workspaceMembershipId,
      readCapture,
    };
  }
  async create(actor: ActorContext, body: unknown, key: string | undefined) {
    return this.command(actor, null, paymentCreate(body), paymentKey(key));
  }
  async change(
    actor: ActorContext,
    id: string,
    body: unknown,
    key: string | undefined,
  ) {
    return this.command(actor, id, paymentCommand(body), paymentKey(key));
  }
  private async command(
    actor: ActorContext,
    id: string | null,
    body: PaymentInput,
    key: string,
  ) {
    return this.database
      .transaction(async () => {
        const capture = await this.access.requirePaymentObservationAccess(
          actor,
          {
            action:
              body.action === 'CONFIRM'
                ? 'confirm'
                : body.action === 'REVERSE'
                  ? 'reverse'
                  : 'record',
            lock: true,
          },
        );
        const scope = {
          workspaceId: actor.workspaceId,
          companyId: capture.companyId,
        };
        const observed =
          id === null ? undefined : await this.store.current(scope, id);
        let sourceCaptures: unknown = null;
        if (body.action !== 'WITHDRAW_DRAFT' && body.action !== 'REVERSE')
          sourceCaptures = await this.source.requireAuthority(
            actor,
            body.action === 'CREATE' ? body.source : observed?.snapshot.source,
            body.action === 'CONFIRM' ? 'confirm' : 'record',
          );
        await this.database.connection.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['payment-command', actor.workspaceId, actor.workspaceMembershipId, key])},0))`,
        );
        const saved = await this.store.findReceipt(actor, key);
        if (saved) {
          const target = id ?? saved.paymentId;
          if (
            !isDeepStrictEqual(
              saved.intent,
              this.store.intent(actor, scope, target, body),
            )
          )
            conflict('IDEMPOTENCY_CONFLICT');
          return this.store.replay(saved);
        }
        const paymentId = id ?? randomUUID();
        if (body.action === 'CREATE') {
          await this.source.requireFreshCopyAuthority(actor);
          await this.source.inspect(actor, body.source, true);
          if (body.replacesClosedPaymentId !== null) {
            const predecessor = await this.store.current(
              scope,
              body.replacesClosedPaymentId,
              true,
            );
            if (!['WITHDRAWN', 'REVERSED'].includes(predecessor.row.state))
              conflict('PAYMENT_PREDECESSOR_CONFLICT');
          }
        } else {
          if (body.action === 'CORRECT_DRAFT' || body.action === 'CONFIRM') {
            if (!observed) throw new ForbiddenException();
            await this.source.inspect(actor, observed.snapshot.source, true);
          }
          const current = await this.store.current(scope, paymentId, true);
          if (
            current.row.revision !== body.expectedRevision ||
            current.row.revision === 2147483647 ||
            (body.action === 'REVERSE'
              ? current.row.state !== 'CONFIRMED'
              : current.row.state !== 'DRAFT')
          )
            conflict('STALE_PAYMENT');
          if (
            body.action === 'CORRECT_DRAFT' &&
            isDeepStrictEqual(body.values, current.head.after.values)
          )
            conflict('PAYMENT_NO_CHANGE');
        }
        const recorded = await this.store.write({
          actor,
          scope,
          paymentId,
          body,
          key,
          assignmentId: capture.assignmentId,
          sourceCaptures,
        });
        await this.accountability.record({
          actor,
          companyId: scope.companyId,
          paymentId,
          revision: recorded.receipt.revision,
          commandId: recorded.receipt.commandId,
          recordedAt: new Date(recorded.receipt.recordedAt),
          action:
            body.action === 'CREATE'
              ? 'payment.observation.recorded'
              : body.action === 'CORRECT_DRAFT'
                ? 'payment.draft.corrected'
                : body.action === 'WITHDRAW_DRAFT'
                  ? 'payment.draft.withdrawn'
                  : body.action === 'CONFIRM'
                    ? 'payment.confirmed'
                    : 'payment.reversed',
        });
        // Decode and couple the response inside the transaction; failure rolls back every effect.
        return this.store.replay(recorded.row);
      })
      .catch(unavailable);
  }
  private async historyPage(
    scope: PaymentScope,
    id: string,
    headRevision: number,
    binding: PaymentCursorBinding,
    before?: number,
  ): Promise<PaymentHistoryPage> {
    const page = await this.store.history(scope, id, before),
      last = page.items.at(-1);
    return {
      items: page.items,
      nextCursor:
        page.hasMore && last
          ? paymentCursor(await this.store.cursorKey(scope), binding, {
              kind: 'history',
              paymentId: id,
              headRevision,
              before: last.revision,
            })
          : null,
    };
  }
  async inventory(
    actor: ActorContext,
    query: unknown,
  ): Promise<PaymentInventory> {
    return this.readConsistently<PaymentInventory>(async () => {
      const capture = await this.access.requirePaymentObservationAccess(actor, {
        action: 'read',
        lock: true,
      });
      const cursor = paymentQuery(query),
        scope = {
          workspaceId: actor.workspaceId,
          companyId: capture.companyId,
        },
        binding = this.binding(actor, scope, capture.readCapture);
      const position = cursor
        ? readPaymentCursor(await this.store.cursorKey(scope), cursor, binding)
        : undefined;
      if (position && position.kind !== 'inventory')
        throw new BadRequestException();
      const page = await this.store.inventory(scope, position),
        last = page.items.at(-1);
      return {
        format: 'PAYMENT_INVENTORY/1',
        companyId: scope.companyId,
        readCapture: capture.readCapture,
        items: page.items,
        nextCursor:
          page.hasMore && last
            ? paymentCursor(await this.store.cursorKey(scope), binding, {
                kind: 'inventory',
                id: last.id,
                createdAt: last.createdAt,
              })
            : null,
      };
    }).catch(unavailable);
  }
  async read(
    actor: ActorContext,
    id: string,
    query: unknown,
  ): Promise<PaymentCurrent> {
    return this.readConsistently<PaymentCurrent>(async () => {
      const capture = await this.access.requirePaymentObservationAccess(actor, {
        action: 'read',
        lock: true,
      });
      if (paymentQuery(query) !== undefined) throw new BadRequestException();
      const scope = {
          workspaceId: actor.workspaceId,
          companyId: capture.companyId,
        },
        current = await this.store.current(scope, id),
        binding = this.binding(actor, scope, capture.readCapture);
      let canWithdraw = false,
        canCorrect = false,
        canConfirm = false,
        canReverse = false,
        canReplace = false;
      const attempt = async (
        action: 'record' | 'confirm' | 'reverse',
        source = false,
      ) => {
        try {
          await this.access.requirePaymentObservationAccess(actor, {
            action,
            lock: true,
          });
          if (source) {
            await this.source.requireAuthority(actor, current.snapshot.source);
            return await this.qualifiesForNewUse(
              actor,
              current.snapshot.source,
            );
          }
          return true;
        } catch (e) {
          if (
            e instanceof HttpException &&
            [403, 404, 409].includes(e.getStatus())
          )
            return false;
          throw e;
        }
      };
      if (current.row.revision < 2147483647) {
        if (current.row.state === 'DRAFT') {
          canWithdraw = await attempt('record');
          canCorrect = canWithdraw && (await attempt('record', true));
          canConfirm =
            (await attempt('confirm', true)) &&
            !(await this.store.isDraftAuthor(actor, scope, id));
        } else if (current.row.state === 'CONFIRMED')
          canReverse = await attempt('reverse');
      }
      if (
        ['WITHDRAWN', 'REVERSED'].includes(current.row.state) &&
        (await attempt('record'))
      ) {
        try {
          await this.source.requireFreshCopyAuthority(actor);
          canReplace =
            (await this.store.summary(current.row)).replacementPaymentId ===
            null;
        } catch (e) {
          if (!(e instanceof ForbiddenException)) throw e;
        }
      }
      return {
        format: 'PAYMENT_OBSERVATION/1',
        companyId: scope.companyId,
        readCapture: capture.readCapture,
        payment: await this.store.summary(current.row),
        actor: current.head.actor,
        recordedAt: current.head.recordedAt,
        capabilities: {
          canCorrect,
          canWithdraw,
          canConfirm,
          canReverse,
          canReplace,
        },
        ...(await this.source.project(actor, current.snapshot)),
        history: await this.historyPage(
          scope,
          id,
          current.row.revision,
          binding,
        ),
      };
    }).catch(unavailable);
  }
  async history(
    actor: ActorContext,
    id: string,
    query: unknown,
  ): Promise<PaymentHistory> {
    return this.readConsistently<PaymentHistory>(async () => {
      const capture = await this.access.requirePaymentObservationAccess(actor, {
          action: 'read',
          lock: true,
        }),
        cursor = paymentQuery(query);
      const scope = {
          workspaceId: actor.workspaceId,
          companyId: capture.companyId,
        },
        binding = this.binding(actor, scope, capture.readCapture);
      const current = await this.store.current(scope, id);
      let before: number | undefined;
      if (cursor) {
        const position = readPaymentCursor(
          await this.store.cursorKey(scope),
          cursor,
          binding,
        );
        if (position.kind !== 'history' || position.paymentId !== id)
          throw new BadRequestException();
        if (position.headRevision !== current.row.revision)
          conflict('PAYMENT_HISTORY_CHANGED');
        before = position.before;
      }
      return {
        format: 'PAYMENT_HISTORY/1',
        companyId: scope.companyId,
        readCapture: capture.readCapture,
        paymentId: id,
        headRevision: current.row.revision,
        ...(await this.historyPage(
          scope,
          id,
          current.row.revision,
          binding,
          before,
        )),
      };
    }).catch(unavailable);
  }
  async sources(
    actor: ActorContext,
    query: unknown,
  ): Promise<PaymentSourcePage> {
    return this.readConsistently<PaymentSourcePage>(async () => {
      const capture = await this.access.requirePaymentObservationAccess(actor, {
        action: 'record',
        lock: true,
      });
      const sourceCaptures = await this.source.requireAuthority(actor);
      await this.source.requireFreshCopyAuthority(actor);
      const scope = {
          workspaceId: actor.workspaceId,
          companyId: capture.companyId,
        },
        binding = this.binding(
          actor,
          scope,
          'payment-source-capture.v1.' +
            createHash('sha256')
              .update(
                JSON.stringify([
                  capture.readCapture,
                  capture.assignmentId,
                  sourceCaptures,
                ]),
              )
              .digest('hex'),
        ),
        cursor = paymentQuery(query);
      const position = cursor
        ? readPaymentCursor(await this.store.cursorKey(scope), cursor, binding)
        : undefined;
      if (position && position.kind !== 'source')
        throw new BadRequestException();
      const page = await this.source.selectable(actor, position?.source),
        last = page.items.at(-1);
      return {
        format: 'PAYMENT_SOURCE_PAGE/1',
        companyId: scope.companyId,
        readCapture: capture.readCapture,
        items: page.items,
        nextCursor:
          page.hasMore && last
            ? paymentCursor(await this.store.cursorKey(scope), binding, {
                kind: 'source',
                source: last.source,
              })
            : null,
      };
    }).catch(unavailable);
  }
  async download(actor: ActorContext, id: string, query: unknown) {
    return this.readConsistently(async () => {
      const capture = await this.access.requirePaymentObservationAccess(actor, {
        action: 'read',
        lock: true,
      });
      if (paymentQuery(query) !== undefined) throw new BadRequestException();
      const current = await this.store.current(
        { workspaceId: actor.workspaceId, companyId: capture.companyId },
        id,
      );
      return this.source.download(actor, current.snapshot.source);
    }).catch(unavailable);
  }
  private async readConsistently<T>(read: () => Promise<T>): Promise<T> {
    // Concurrent native identity-profile observations can invalidate a locked
    // row after the snapshot starts. Restart the whole read and its authority
    // checks; never reuse an aborted snapshot or retry a business command here.
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.database.transaction(read, {
          isolationLevel: 'repeatable read',
        });
      } catch (error) {
        const cause = error instanceof DrizzleQueryError ? error.cause : error;
        if (
          attempt >= 8 ||
          typeof cause !== 'object' ||
          cause === null ||
          !('code' in cause) ||
          cause.code !== '40001'
        )
          throw error;
        // Match the established bounded read policy: at most1.125s of backoff.
        await new Promise<void>((resolve) =>
          setTimeout(resolve, Math.min(25 * 2 ** (attempt - 1), 250)),
        );
      }
    }
  }
}
const NATIVE_SOURCE_REFUSALS: ReadonlySet<unknown> = new Set([
  'payment_native_source',
  'payment_native_source_authority',
]);
function nativeSourceRefusal(error: unknown): boolean {
  let cause: unknown = error;
  for (
    let depth = 0;
    depth < 4 && cause && typeof cause === 'object';
    depth++
  ) {
    if ('constraint' in cause && NATIVE_SOURCE_REFUSALS.has(cause.constraint))
      return true;
    cause = 'cause' in cause ? cause.cause : undefined;
  }
  return false;
}
function unavailable(error: unknown): never {
  if (error instanceof HttpException) throw error;
  let cause: unknown = error;
  for (let i = 0; i < 4; i++) {
    if (cause && typeof cause === 'object') {
      if ('constraint' in cause) {
        if (
          cause.constraint === 'payment_predecessor' ||
          cause.constraint === 'payment_direct_replacement_unique'
        )
          conflict('PAYMENT_PREDECESSOR_CONFLICT');
        if (cause.constraint === 'payment_self_confirmation')
          throw new ForbiddenException({
            code: 'PAYMENT_AUTHOR_CANNOT_CONFIRM',
            message: 'A draft author cannot confirm this observation.',
          });
        if (cause.constraint === 'payment_native_transition')
          conflict('STALE_PAYMENT');
        if (cause.constraint === 'payment_no_change')
          conflict('PAYMENT_NO_CHANGE');
        if (cause.constraint === 'payment_native_source')
          conflict('PAYMENT_SOURCE_INELIGIBLE');
        if (
          cause.constraint === 'payment_native_authority' ||
          cause.constraint === 'payment_native_source_authority'
        )
          throw new ForbiddenException();
      }
      if ('cause' in cause) {
        cause = cause.cause;
        continue;
      }
    }
    break;
  }
  throw new ServiceUnavailableException(
    'Payment observations are unavailable; preserve an uncertain command for an unchanged retry.',
  );
}
