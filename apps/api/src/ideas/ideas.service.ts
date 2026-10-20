import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, lt, or, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import {
  commandFingerprint,
  idempotencyConflict,
  runIdempotentCommand,
  staleVersionConflict,
} from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  ideaDispositions,
  ideaReceipts,
  ideas,
} from '../database/schema/ideas.js';
import {
  ideaDisposition,
  ideaRecord,
  dispositionResult,
} from './ideas.response.js';
import type {
  IdeaDisposition,
  IdeaDispositionResult,
  IdeaHistory,
  IdeaPage,
  IdeaRecord,
} from './ideas.types.js';
import { disposition, inputObject, submission } from './ideas.validation.js';

@Injectable()
export class IdeasService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}

  record({
    actor,
    body,
    key,
  }: {
    actor: ActorContext;
    body: unknown;
    key: string | undefined;
  }): Promise<IdeaRecord> {
    const idempotencyKey = requireIdempotencyKey(key);
    return this.protect(() =>
      runIdempotentCommand(this.database, {
        fingerprint: commandFingerprint({ body }),
        authorize: () =>
          this.authorization.requireIdeasAccess(actor, 'record', true),
        lockParts: (companyId) => [
          'ideas',
          actor.workspaceId,
          companyId,
          actor.workspaceMembershipId,
          'record',
          idempotencyKey,
        ],
        findReceipt: (companyId) =>
          this.receipt(actor, companyId, 'record', idempotencyKey),
        conflict: () => idempotencyConflict(),
        replay: (_companyId, receipt) =>
          Promise.resolve(ideaRecord(receipt.response)),
        execute: async (companyId) => {
          const input = submission(body);
          const now = this.clock.now();
          const [row] = await this.database.connection
            .insert(ideas)
            .values({
              workspaceId: actor.workspaceId,
              companyId,
              ...input,
              actorMembershipId: actor.workspaceMembershipId,
              actorInternalUserId: actor.internalUserId,
              actorDisplayName: actor.displayName,
              submittedAt: now,
            })
            .returning();
          if (!row)
            throw new InternalServerErrorException('Idea save is unavailable.');
          await this.accountability.recordIdeaEvent({
            actor,
            companyId,
            ideaId: row.id,
            revision: 1,
            occurredAt: now,
            action: 'idea.recorded',
          });
          const response = this.present(row);
          await this.database.connection.insert(ideaReceipts).values({
            workspaceId: actor.workspaceId,
            companyId,
            actorMembershipId: actor.workspaceMembershipId,
            commandKind: 'record',
            idempotencyKey,
            fingerprint: commandFingerprint({ body }),
            ideaId: row.id,
            response,
            recordedAt: now,
          });
          return response;
        },
      }),
    );
  }

  recordDisposition({
    actor,
    ideaId,
    body,
    key,
  }: {
    actor: ActorContext;
    ideaId: string;
    body: unknown;
    key: string | undefined;
  }): Promise<IdeaDispositionResult> {
    const idempotencyKey = requireIdempotencyKey(key);
    const targetId = requireUuid(ideaId);
    const fingerprint = commandFingerprint({ ideaId, body });
    return this.protect(() =>
      runIdempotentCommand(this.database, {
        fingerprint,
        authorize: () =>
          this.authorization.requireIdeasAccess(actor, 'disposition', true),
        lockParts: (companyId) => [
          'ideas',
          actor.workspaceId,
          companyId,
          actor.workspaceMembershipId,
          'disposition',
          idempotencyKey,
        ],
        findReceipt: (companyId) =>
          this.receipt(actor, companyId, 'disposition', idempotencyKey),
        conflict: () => idempotencyConflict(),
        replay: (_companyId, receipt) =>
          Promise.resolve(dispositionResult(receipt.response)),
        execute: async (companyId) => {
          const input = disposition(body);
          const current = await this.findIdea(actor, companyId, targetId, true);
          if (current.revision !== input.expectedRevision)
            throw staleVersionConflict(
              'Reload the Idea before recording a new disposition.',
            );
          const now = this.clock.now(),
            revision = current.revision + 1;
          const [entry] = await this.database.connection
            .insert(ideaDispositions)
            .values({
              workspaceId: actor.workspaceId,
              companyId,
              ideaId: targetId,
              precedingRevision: current.revision,
              revision,
              kind: input.kind,
              reason: input.reason,
              reconsiderationDate: input.reconsiderationDate,
              actorMembershipId: actor.workspaceMembershipId,
              actorInternalUserId: actor.internalUserId,
              actorDisplayName: actor.displayName,
              recordedAt: now,
            })
            .returning();
          const [updated] = await this.database.connection
            .update(ideas)
            .set({ revision, disposition: input.kind })
            .where(
              and(
                eq(ideas.workspaceId, actor.workspaceId),
                eq(ideas.companyId, companyId),
                eq(ideas.id, targetId),
              ),
            )
            .returning();
          if (!entry || !updated)
            throw new InternalServerErrorException(
              'Idea review is unavailable.',
            );
          await this.accountability.recordIdeaEvent({
            actor,
            companyId,
            ideaId: targetId,
            revision,
            occurredAt: now,
            action: 'idea.disposition.recorded',
            disposition: input.kind,
          });
          const response = dispositionResult({
            idea: this.present(updated),
            entry: this.presentDisposition(entry),
          });
          await this.database.connection.insert(ideaReceipts).values({
            workspaceId: actor.workspaceId,
            companyId,
            actorMembershipId: actor.workspaceMembershipId,
            commandKind: 'disposition',
            idempotencyKey,
            fingerprint,
            ideaId: targetId,
            response,
            recordedAt: now,
          });
          return response;
        },
      }),
    );
  }

  history({
    actor,
    ideaId,
    query = {},
  }: {
    actor: ActorContext;
    ideaId: string;
    query?: unknown;
  }): Promise<IdeaHistory> {
    return this.protect(() =>
      this.database.transaction(async () => {
        const companyId = await this.authorization.requireIdeasAccess(
          actor,
          'read',
          true,
        );
        const targetId = requireUuid(ideaId);
        await this.findIdea(actor, companyId, targetId);
        const cursor = historyCursor(query);
        const scope = and(
          eq(ideaDispositions.workspaceId, actor.workspaceId),
          eq(ideaDispositions.companyId, companyId),
          eq(ideaDispositions.ideaId, targetId),
        );
        const totals = this.database.connection
          .select({ value: count().as('total') })
          .from(ideaDispositions)
          .where(scope)
          .as('history_total');
        const selected = this.database.connection
          .select()
          .from(ideaDispositions)
          .where(
            and(
              scope,
              cursor === undefined
                ? undefined
                : lt(ideaDispositions.revision, cursor),
            ),
          )
          .orderBy(desc(ideaDispositions.revision))
          .limit(26)
          .as('history_page');
        // One statement owns the count and page MVCC snapshot, including an
        // empty continuation. Live authority share locks remain held here.
        const projection = await this.database.connection
          .select()
          .from(totals)
          .leftJoin(selected, sql`true`)
          .orderBy(desc(selected.revision));
        const first = projection[0];
        if (!first)
          throw new InternalServerErrorException(
            'Idea history is unavailable.',
          );
        const rows = projection.flatMap((row) =>
          row.history_page ? [row.history_page] : [],
        );
        const entries = rows
          .slice(0, 25)
          .map((row) => this.presentDisposition(row));
        const last = entries.at(-1);
        return {
          ideaId: targetId,
          entries,
          total: first.history_total.value,
          nextCursor:
            rows.length > 25 && last
              ? Buffer.from(
                  JSON.stringify({ beforeRevision: last.revision }),
                ).toString('base64url')
              : null,
        };
      }),
    );
  }

  detail({
    actor,
    ideaId,
  }: {
    actor: ActorContext;
    ideaId: string;
  }): Promise<IdeaRecord> {
    return this.protect(() =>
      this.database.transaction(async () => {
        const companyId = await this.authorization.requireIdeasAccess(
          actor,
          'read',
          true,
        );
        return this.present(
          await this.findIdea(actor, companyId, requireUuid(ideaId)),
        );
      }),
    );
  }

  list({
    actor,
    query = {},
  }: {
    actor: ActorContext;
    query?: unknown;
  }): Promise<IdeaPage> {
    return this.protect(() =>
      this.database.transaction(async () => {
        const companyId = await this.authorization.requireIdeasAccess(
          actor,
          'read',
          true,
        );
        const cursor = listCursor(query);
        const scope = and(
          eq(ideas.workspaceId, actor.workspaceId),
          eq(ideas.companyId, companyId),
        );
        const totals = this.database.connection
          .select({ value: count().as('total') })
          .from(ideas)
          .where(scope)
          .as('ideas_total');
        const selected = this.database.connection
          .select()
          .from(ideas)
          .where(
            and(
              scope,
              cursor &&
                or(
                  lt(ideas.submittedAt, new Date(cursor.time)),
                  and(
                    eq(ideas.submittedAt, new Date(cursor.time)),
                    lt(ideas.id, cursor.id),
                  ),
                ),
            ),
          )
          .orderBy(desc(ideas.submittedAt), desc(ideas.id))
          .limit(26)
          .as('ideas_page');
        // Count and rows use one statement snapshot after live authority
        // locks. The count row survives even an empty continuation page.
        const projection = await this.database.connection
          .select()
          .from(totals)
          .leftJoin(selected, sql`true`)
          .orderBy(desc(selected.submittedAt), desc(selected.id));
        const first = projection[0];
        if (!first)
          throw new InternalServerErrorException('Ideas list is unavailable.');
        const rows = projection.flatMap((row) =>
          row.ideas_page ? [row.ideas_page] : [],
        );
        const page = rows.slice(0, 25).map((row) => this.present(row));
        const last = page.at(-1);
        return {
          companyId,
          ideas: page,
          total: first.ideas_total.value,
          nextCursor:
            rows.length > 25 && last
              ? Buffer.from(
                  JSON.stringify({ time: last.submittedAt, id: last.id }),
                ).toString('base64url')
              : null,
        };
      }),
    );
  }

  private async findIdea(
    actor: ActorContext,
    companyId: string,
    ideaId: string,
    lock = false,
  ) {
    const query = this.database.connection
      .select()
      .from(ideas)
      .where(
        and(
          eq(ideas.workspaceId, actor.workspaceId),
          eq(ideas.companyId, companyId),
          eq(ideas.id, ideaId),
        ),
      )
      .limit(1);
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw new NotFoundException();
    return row;
  }
  private present(row: typeof ideas.$inferSelect): IdeaRecord {
    return ideaRecord({
      id: row.id,
      companyId: row.companyId,
      description: row.description,
      origin: row.origin,
      revision: row.revision,
      disposition: row.disposition,
      submittedBy: {
        workspaceMembershipId: row.actorMembershipId,
        internalUserId: row.actorInternalUserId,
        displayName: row.actorDisplayName,
      },
      submittedAt: row.submittedAt.toISOString(),
    });
  }
  private presentDisposition(
    row: typeof ideaDispositions.$inferSelect,
  ): IdeaDisposition {
    return ideaDisposition({
      id: row.id,
      ideaId: row.ideaId,
      precedingRevision: row.precedingRevision,
      revision: row.revision,
      kind: row.kind,
      reason: row.reason,
      reconsiderationDate: row.reconsiderationDate,
      recordedBy: {
        workspaceMembershipId: row.actorMembershipId,
        internalUserId: row.actorInternalUserId,
        displayName: row.actorDisplayName,
      },
      recordedAt: row.recordedAt.toISOString(),
    });
  }
  private async receipt(
    actor: ActorContext,
    companyId: string,
    kind: 'record' | 'disposition',
    key: string,
  ) {
    const [receipt] = await this.database.connection
      .select()
      .from(ideaReceipts)
      .where(
        and(
          eq(ideaReceipts.workspaceId, actor.workspaceId),
          eq(ideaReceipts.companyId, companyId),
          eq(ideaReceipts.actorMembershipId, actor.workspaceMembershipId),
          eq(ideaReceipts.commandKind, kind),
          eq(ideaReceipts.idempotencyKey, key),
        ),
      );
    return receipt;
  }
  private async protect<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Ideas operation is unavailable.');
    }
  }
}
function listCursor(value: unknown): { time: string; id: string } | undefined {
  const body = inputObject(value, ['cursor']);
  if (body.cursor === undefined) return undefined;
  if (
    typeof body.cursor !== 'string' ||
    !/^[A-Za-z0-9_-]+$/u.test(body.cursor) ||
    body.cursor.length > 256
  )
    invalidCursor();
  let decoded: unknown;
  try {
    decoded = JSON.parse(
      Buffer.from(body.cursor, 'base64url').toString('utf8'),
    );
  } catch {
    return invalidCursor();
  }
  const cursor = inputObject(decoded, ['time', 'id']);
  if (
    typeof cursor.time !== 'string' ||
    !Number.isFinite(Date.parse(cursor.time)) ||
    new Date(cursor.time).toISOString() !== cursor.time
  )
    invalidCursor();
  return { time: cursor.time, id: requireUuid(cursor.id) };
}
function invalidCursor(): never {
  throw new BadRequestException({
    code: 'INVALID_IDEA_CURSOR',
    message: 'Invalid Ideas continuation.',
  });
}

function historyCursor(value: unknown): number | undefined {
  const body = inputObject(value, ['cursor']);
  if (body.cursor === undefined) return undefined;
  if (
    typeof body.cursor !== 'string' ||
    !/^[A-Za-z0-9_-]+$/u.test(body.cursor) ||
    body.cursor.length > 128
  )
    invalidCursor();
  let decoded: unknown;
  try {
    decoded = JSON.parse(
      Buffer.from(body.cursor, 'base64url').toString('utf8'),
    );
  } catch {
    return invalidCursor();
  }
  const cursor = inputObject(decoded, ['beforeRevision']);
  if (
    typeof cursor.beforeRevision !== 'number' ||
    !Number.isInteger(cursor.beforeRevision) ||
    cursor.beforeRevision < 2 ||
    cursor.beforeRevision > 2147483647
  )
    invalidCursor();
  return cursor.beforeRevision;
}
