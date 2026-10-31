import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { InternalTaskAccessService } from '../access/internal-task-access.service.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  changeInput,
  createInput,
  history,
  historyQuery,
  listQuery,
  MAX_VERSION,
  memberQuery,
  receipt,
  savedIntent,
  snapshot,
  type Change,
  type Create,
  type Fields,
  type Receipt,
  type Snapshot,
} from './internal-task.contract.js';
import { InternalTaskStore, stable } from './internal-task.store.js';

@Injectable()
export class InternalTaskService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: InternalTaskAccessService,
    private readonly store: InternalTaskStore,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}
  list(actor: ActorContext, query: unknown) {
    const input = listQuery(query);
    return this.read(actor, (scope) =>
      this.store.page(scope, input.status, input.beforeTaskId),
    );
  }
  detail(actor: ActorContext, id: unknown, query: unknown) {
    const taskId = requireUuid(id),
      before = historyQuery(query);
    return this.read(actor, (scope) =>
      this.store.detail(scope, taskId, before),
    );
  }
  eligible(actor: ActorContext, query: unknown) {
    const after = memberQuery(query);
    return this.read(actor, () => this.access.eligible(actor, after));
  }
  private read<T>(
    actor: ActorContext,
    work: (scope: { workspaceId: string; companyId: string }) => Promise<T>,
  ) {
    return this.database
      .transaction(
        async () => {
          const scope = await this.access.requireActor(actor, false);
          return work({
            workspaceId: actor.workspaceId,
            companyId: scope.companyId,
          });
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      )
      .catch(unavailable);
  }
  create(actor: ActorContext, body: unknown, key: string | undefined) {
    const input = createInput(body),
      normalizedKey = requireIdempotencyKey(key);
    return this.execute(actor, undefined, input, normalizedKey);
  }
  change(
    actor: ActorContext,
    id: unknown,
    body: unknown,
    key: string | undefined,
  ) {
    const taskId = requireUuid(id),
      input = changeInput(body),
      normalizedKey = requireIdempotencyKey(key);
    return this.execute(actor, taskId, input, normalizedKey);
  }
  private execute(
    actor: ActorContext,
    target: string | undefined,
    input: Create | Change,
    key: string,
  ): Promise<Receipt> {
    return this.database
      .transaction(async () => {
        await this.database.connection.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['company-internal-task', actor.workspaceId, actor.workspaceMembershipId, key])},0))`,
        );
        const capture = await this.access.requireActor(actor, true),
          scope = {
            workspaceId: actor.workspaceId,
            companyId: capture.companyId,
          };
        if (target) await this.store.visible(scope, target);
        const saved = await this.store.command(actor, key),
          taskId = target ?? saved?.taskId ?? randomUUID();
        const intent = {
          format: 'company-internal-task-command-v1',
          workspaceId: actor.workspaceId,
          actorMembershipId: actor.workspaceMembershipId,
          companyId: capture.companyId,
          taskId,
          kind: target ? 'CHANGE' : 'CREATE',
          body: input,
        };
        if (saved) {
          // Validate the whole persisted command before treating it as a matching intent.
          const stored = savedIntent(saved.intent);
          if (
            stored.workspaceId !== saved.workspaceId ||
            stored.companyId !== saved.companyId ||
            stored.taskId !== saved.taskId ||
            stored.actorMembershipId !== saved.actorMembershipId
          )
            throw new ServiceUnavailableException({
              code: 'INTERNAL_TASK_UNAVAILABLE',
            });
          if (stable(stored) !== stable(intent))
            throw new ConflictException(
              'Idempotency-Key belongs to another Internal Task intent.',
            );
          await this.store.visible(scope, taskId);
          const result = receipt(saved.response);
          if (
            result.task.id !== saved.taskId ||
            result.task.workspaceId !== saved.workspaceId ||
            result.task.companyId !== saved.companyId ||
            result.task.version !== saved.version ||
            result.changed !== (saved.changed === 1) ||
            (result.history &&
              (result.history.actorMembershipId !== saved.actorMembershipId ||
                result.history.recordedAt !== saved.recordedAt.toISOString()))
          )
            throw new ServiceUnavailableException({
              code: 'INTERNAL_TASK_UNAVAILABLE',
            });
          return result;
        }
        const now = this.clock.now(),
          recordedAt = now.toISOString();
        let before: Snapshot | null = null,
          after: Snapshot,
          kind: 'CREATE' | 'EDIT' | 'MOVE';
        if (!target) {
          const create = createInput(input),
            assignee = create.assigneeMembershipId
              ? await this.access.requireAssignee(
                  actor,
                  create.assigneeMembershipId,
                )
              : null;
          after = snapshot({
            format: 'company-internal-task-v1',
            id: taskId,
            ...scope,
            version: 1,
            title: create.title,
            description: create.description ?? null,
            assignee,
            dueDate: create.dueDate ?? null,
            priority: create.priority ?? 'normal',
            status: 'todo',
            createdByMembershipId: actor.workspaceMembershipId,
            createdAt: recordedAt,
            updatedAt: recordedAt,
            completion: null,
            reason: null,
          });
          kind = 'CREATE';
        } else {
          const change = changeInput(input);
          before = await this.store.current(scope, target, true);
          if (change.expectedVersion !== before.version)
            throw new ConflictException('Reload the current Internal Task.');
          kind = change.kind;
          const open =
            before.status === 'todo' ||
            before.status === 'in_progress' ||
            before.status === 'blocked';
          if (change.kind === 'EDIT') {
            if (!open)
              throw new ConflictException(
                'Reopen the Internal Task before editing.',
              );
            const assignee =
              change.assigneeMembershipId === undefined ||
              change.assigneeMembershipId === before.assignee?.membershipId
                ? before.assignee
                : change.assigneeMembershipId === null
                  ? null
                  : await this.access.requireAssignee(
                      actor,
                      change.assigneeMembershipId,
                    );
            const fields: Fields = {
              title: change.title ?? before.title,
              description:
                change.description === undefined
                  ? before.description
                  : change.description,
              assignee,
              dueDate:
                change.dueDate === undefined ? before.dueDate : change.dueDate,
              priority: change.priority ?? before.priority,
            };
            const unchanged =
              stable({ ...before, ...fields }) === stable(before);
            if (unchanged) {
              const response = this.store.response(before, null);
              await this.store.remember({
                actor,
                assignmentId: capture.assignmentId,
                key,
                intent,
                response,
                recordedAt: now,
              });
              return response;
            }
            after = snapshot({
              ...before,
              ...fields,
              version: successor(before.version),
              updatedAt: recordedAt,
            });
          } else {
            if (
              change.status === before.status ||
              (!open && change.status !== 'todo')
            )
              throw new ConflictException('Invalid Internal Task transition.');
            const completion =
              change.status === 'done'
                ? { actorMembershipId: actor.workspaceMembershipId, recordedAt }
                : null;
            const reason =
              change.status === 'blocked' || change.status === 'cancelled'
                ? {
                    kind:
                      change.status === 'blocked' ? 'blockage' : 'cancellation',
                    text: change.reason,
                    actorMembershipId: actor.workspaceMembershipId,
                    recordedAt,
                  }
                : null;
            after = snapshot({
              ...before,
              status: change.status,
              version: successor(before.version),
              updatedAt: recordedAt,
              completion,
              reason,
            });
          }
        }
        const fact = history({
          format: 'company-internal-task-history-v1',
          ...scope,
          taskId,
          version: after.version,
          kind,
          actorMembershipId: actor.workspaceMembershipId,
          recordedAt,
          before,
          after,
        });
        await this.store.append(actor, after, fact);
        await this.accountability.recordInternalTaskEvent({
          actor,
          companyId: scope.companyId,
          taskId,
          version: after.version,
          kind,
          recordedAt: now,
        });
        const response = this.store.response(after, fact);
        await this.store.remember({
          actor,
          assignmentId: capture.assignmentId,
          key,
          intent,
          response,
          recordedAt: now,
        });
        return response;
      })
      .catch(unavailable);
  }
}
export function successor(current: number) {
  if (current === MAX_VERSION)
    throw new ConflictException('Internal Task version is exhausted.');
  return current + 1;
}
function unavailable(error: unknown): never {
  if (error instanceof HttpException) throw error;
  throw new ServiceUnavailableException({ code: 'INTERNAL_TASK_UNAVAILABLE' });
}
