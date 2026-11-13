import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { InvoiceRecordAccountability } from '../accountability/invoice-record-accountability.js';
import { runKeyedCommand } from '../command/idempotent-command.js';
import { readConsistently } from '../database/consistent-read.js';
import { DatabaseContext } from '../database/database-context.js';
import { DocumentInvoiceRecordSource } from '../documents/document-invoice-record-source.js';
import {
  INVOICE_KEY_MAX_LENGTH,
  invoiceCommand,
  invoiceCreate,
  invoiceQuery,
  type InvoiceInput,
} from './invoice-record.input.js';
import {
  invoiceCursors,
  type InvoiceCursorBinding,
} from './invoice-record.cursor.js';
import { InvoiceRecordStore } from './invoice-record.store.js';
import type {
  InvoiceScope,
  InvoiceInventory,
  InvoiceCurrent,
  InvoiceHistory,
  InvoiceSourcePage,
  InvoiceHistoryPage,
} from './invoice-record.types.js';
function conflict(code: string): never {
  throw new ConflictException({
    code,
    message: 'Reload and review the current invoice record.',
  });
}
@Injectable()
export class InvoiceRecordService {
  private readonly cursors: ReturnType<typeof invoiceCursors>;
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: CompanyContextAuthorization,
    private readonly source: DocumentInvoiceRecordSource,
    private readonly store: InvoiceRecordStore,
    private readonly accountability: InvoiceRecordAccountability,
  ) {
    this.cursors = invoiceCursors(({ scope, operation, kind }) =>
      this.store.cursorKey(scope, operation === 'issue' && kind === 'source'),
    );
  }
  private binding(
    actor: ActorContext,
    scope: InvoiceScope,
    readCapture: string,
  ): InvoiceCursorBinding {
    return {
      ...scope,
      actorMembershipId: actor.workspaceMembershipId,
      readCapture,
    };
  }
  async create(actor: ActorContext, body: unknown, key: string | undefined) {
    return this.command(actor, null, invoiceCreate(body), key);
  }
  async change(
    actor: ActorContext,
    id: string,
    body: unknown,
    key: string | undefined,
  ) {
    return this.command(actor, id, invoiceCommand(body), key);
  }
  private async command(
    actor: ActorContext,
    id: string | null,
    body: InvoiceInput,
    key: string | undefined,
  ) {
    return runKeyedCommand(this.database, {
      name: 'invoice-record-command',
      actor,
      key,
      maxKeyLength: INVOICE_KEY_MAX_LENGTH,
      authorize: async () => {
        const capture = await this.access.requireInvoiceRecordAccess(actor, {
          manage: true,
          lock: true,
        });
        const scope = {
          workspaceId: actor.workspaceId,
          companyId: capture.companyId,
        };
        const observed =
          id === null ? undefined : await this.store.current(scope, id);
        let sourceCaptures: unknown = null;
        if (body.action !== 'WITHDRAW_ENTRY')
          sourceCaptures = await this.source.requireAuthority(
            actor,
            body.action === 'CREATE' ? body.source : observed?.snapshot.source,
          );
        return { scope, assignmentId: capture.assignmentId, sourceCaptures };
      },
      findReceipt: ({ key: used }) => this.store.findReceipt(actor, used),
      recordedIntent: (receipt) => receipt.intent,
      intent: ({ scope: { scope }, receipt }) =>
        this.store.intent(actor, scope, id ?? receipt.recordId, body),
      replay: ({ receipt }) => this.store.replay(receipt),
      execute: async ({
        scope: { scope, assignmentId, sourceCaptures },
        key: used,
      }) => {
        const recordId = id ?? randomUUID();
        if (body.action === 'CREATE')
          await this.source.qualify(actor, body.source);
        else {
          const current = await this.store.current(scope, recordId, true);
          if (current.row.entryState === 'WITHDRAWN')
            conflict('INVOICE_WITHDRAWN');
          if (current.row.revision !== body.expectedRevision)
            conflict('STALE_INVOICE_RECORD');
          if (current.row.revision === 2147483647)
            conflict('STALE_INVOICE_RECORD');
          if (body.action === 'CORRECT') {
            await this.source.qualify(
              actor,
              current.snapshot.source,
              'recorded',
            );
            if (isDeepStrictEqual(body.values, current.head.after.values))
              conflict('INVOICE_NO_CHANGE');
          }
        }
        const recorded = await this.store.write({
          actor,
          scope,
          recordId,
          body,
          key: used,
          assignmentId,
          sourceCaptures,
        });
        await this.accountability.record({
          actor,
          companyId: scope.companyId,
          recordId,
          revision: recorded.receipt.revision,
          commandId: recorded.receipt.commandId,
          recordedAt: new Date(recorded.receipt.recordedAt),
          action:
            body.action === 'CREATE'
              ? 'invoice_record.created'
              : body.action === 'CORRECT'
                ? 'invoice_record.transcription.corrected'
                : 'invoice_record.entry.withdrawn',
        });
        // Decode and couple the response inside the transaction; failure rolls back every effect.
        return this.store.replay(recorded.row);
      },
    }).catch(unavailable);
  }
  private async historyPage(
    scope: InvoiceScope,
    id: string,
    headRevision: number,
    binding: InvoiceCursorBinding,
    before?: number,
  ): Promise<InvoiceHistoryPage> {
    const page = await this.store.history(scope, id, before),
      last = page.items.at(-1);
    return {
      items: page.items,
      nextCursor:
        page.hasMore && last
          ? await this.cursors.issue({
              binding,
              position: {
                kind: 'history',
                recordId: id,
                headRevision,
                before: last.revision,
              },
            })
          : null,
    };
  }
  async inventory(
    actor: ActorContext,
    query: unknown,
  ): Promise<InvoiceInventory> {
    return readConsistently<InvoiceInventory>(this.database, async () => {
      const capture = await this.access.requireInvoiceRecordAccess(actor, {
        manage: false,
        lock: true,
      });
      const cursor = invoiceQuery(query),
        scope = {
          workspaceId: actor.workspaceId,
          companyId: capture.companyId,
        },
        binding = this.binding(actor, scope, capture.readCapture);
      const position = cursor
        ? await this.cursors.read({ value: cursor, binding, kind: 'inventory' })
        : undefined;
      const page = await this.store.inventory(scope, position),
        last = page.items.at(-1);
      return {
        format: 'EXTERNAL_INVOICE_INVENTORY/1',
        companyId: scope.companyId,
        readCapture: capture.readCapture,
        items: page.items,
        nextCursor:
          page.hasMore && last
            ? await this.cursors.issue({
                binding,
                position: {
                  kind: 'inventory',
                  id: last.id,
                  createdAt: last.createdAt,
                },
              })
            : null,
      };
    }).catch(unavailable);
  }
  async read(
    actor: ActorContext,
    id: string,
    query: unknown,
  ): Promise<InvoiceCurrent> {
    return readConsistently<InvoiceCurrent>(this.database, async () => {
      const capture = await this.access.requireInvoiceRecordAccess(actor, {
        manage: false,
        lock: true,
      });
      if (invoiceQuery(query) !== undefined) throw new BadRequestException();
      const scope = {
          workspaceId: actor.workspaceId,
          companyId: capture.companyId,
        },
        current = await this.store.current(scope, id),
        binding = this.binding(actor, scope, capture.readCapture);
      let canWithdraw = false,
        canCorrect = false;
      if (
        current.row.entryState === 'RECORDED' &&
        current.row.revision < 2147483647
      ) {
        try {
          await this.access.requireInvoiceRecordAccess(actor, {
            manage: true,
            lock: true,
          });
          canWithdraw = true;
        } catch (e) {
          if (!(e instanceof ForbiddenException)) throw e;
        }
        if (canWithdraw)
          try {
            await this.source.requireAuthority(actor, current.snapshot.source);
            await this.source.qualifyEligibility(
              actor,
              current.snapshot.source,
              'recorded',
            );
            canCorrect = true;
          } catch (e) {
            if (
              !(e instanceof HttpException) ||
              ![403, 404].includes(e.getStatus())
            )
              throw e;
          }
      }
      return {
        format: 'EXTERNAL_INVOICE_RECORD/1',
        companyId: scope.companyId,
        readCapture: capture.readCapture,
        record: await this.store.summary(current.row),
        actor: current.head.actor,
        recordedAt: current.head.recordedAt,
        capabilities: { canCorrect, canWithdraw },
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
  ): Promise<InvoiceHistory> {
    return readConsistently<InvoiceHistory>(this.database, async () => {
      const capture = await this.access.requireInvoiceRecordAccess(actor, {
          manage: false,
          lock: true,
        }),
        cursor = invoiceQuery(query);
      const scope = {
          workspaceId: actor.workspaceId,
          companyId: capture.companyId,
        },
        binding = this.binding(actor, scope, capture.readCapture);
      const current = await this.store.current(scope, id);
      let before: number | undefined;
      if (cursor) {
        const position = await this.cursors.read({
          value: cursor,
          binding,
          kind: 'history',
        });
        if (position.recordId !== id) throw new BadRequestException();
        if (position.headRevision !== current.row.revision)
          conflict('INVOICE_HISTORY_CHANGED');
        before = position.before;
      }
      return {
        format: 'EXTERNAL_INVOICE_HISTORY/1',
        companyId: scope.companyId,
        readCapture: capture.readCapture,
        recordId: id,
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
  ): Promise<InvoiceSourcePage> {
    return readConsistently<InvoiceSourcePage>(this.database, async () => {
      const capture = await this.access.requireInvoiceRecordAccess(actor, {
        manage: true,
        lock: true,
      });
      const sourceCaptures = await this.source.requireAuthority(actor);
      const scope = {
          workspaceId: actor.workspaceId,
          companyId: capture.companyId,
        },
        binding = this.binding(
          actor,
          scope,
          'invoice-source-capture.v1.' +
            createHash('sha256')
              .update(JSON.stringify([capture.readCapture, sourceCaptures]))
              .digest('hex'),
        ),
        cursor = invoiceQuery(query);
      const position = cursor
        ? await this.cursors.read({ value: cursor, binding, kind: 'source' })
        : undefined;
      const page = await this.source.selectable(actor, position?.source),
        last = page.items.at(-1);
      return {
        format: 'EXTERNAL_INVOICE_SOURCE_PAGE/1',
        companyId: scope.companyId,
        readCapture: capture.readCapture,
        items: page.items,
        nextCursor:
          page.hasMore && last
            ? await this.cursors.issue({
                binding,
                position: {
                  kind: 'source',
                  source: last.source,
                },
              })
            : null,
      };
    }).catch(unavailable);
  }
  async download(actor: ActorContext, id: string, query: unknown) {
    return readConsistently(this.database, async () => {
      const capture = await this.access.requireInvoiceRecordAccess(actor, {
        manage: false,
        lock: true,
      });
      if (invoiceQuery(query) !== undefined) throw new BadRequestException();
      const current = await this.store.current(
        { workspaceId: actor.workspaceId, companyId: capture.companyId },
        id,
      );
      return this.source.download(actor, current.snapshot.source);
    }).catch(unavailable);
  }
}
function unavailable(error: unknown): never {
  if (error instanceof HttpException) throw error;
  let cause: unknown = error;
  for (let i = 0; i < 3; i++) {
    if (cause && typeof cause === 'object') {
      if ('constraint' in cause) {
        if (
          cause.constraint === 'invoice_source_active' ||
          cause.constraint === 'invoice_record_active_document_unique'
        )
          conflict('INVOICE_SOURCE_ALREADY_RECORDED');
        if (
          cause.constraint === 'invoice_predecessor' ||
          cause.constraint === 'invoice_record_direct_replacement_unique'
        )
          conflict('INVOICE_PREDECESSOR_CONFLICT');
        if (cause.constraint === 'invoice_no_change')
          conflict('INVOICE_NO_CHANGE');
        if (cause.constraint === 'invoice_native_transition')
          conflict('STALE_INVOICE_RECORD');
      }
      if ('cause' in cause) {
        cause = cause.cause;
        continue;
      }
    }
    break;
  }
  throw new ServiceUnavailableException(
    'Invoice records are unavailable; preserve an uncertain command for an unchanged retry.',
  );
}
