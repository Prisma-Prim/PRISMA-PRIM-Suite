import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { TaskAccessService } from '../access/task-access.service.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  taskResultCommands,
  taskResultDeclarations,
} from '../database/schema/index.js';
import { DocumentTaskResultReferenceService } from '../documents/document-task-result-reference.service.js';
import { ProjectClosedGuard } from '../project/project-closed.guard.js';
import { TaskService } from './task.service.js';
import { isOpenTaskState } from './task.validation.js';
import type { TaskView } from './task.types.js';
import type {
  TaskResultDeclaration,
  TaskResultReceipt,
} from './task-results.types.js';

type ResultRow = typeof taskResultDeclarations.$inferSelect;
type ResultInput = {
  expectedTaskVersion: number;
  expectedResultRevision: number;
  documentId: string;
  versionId: string;
  declaration: string;
} & ({ kind: 'record' } | { kind: 'correct'; reason: string });
type ResultChange =
  | { kind: 'recorded'; revision: 1; predecessorId: null; reason: null }
  | {
      kind: 'corrected';
      revision: number;
      predecessorId: string;
      reason: string;
    }
  | { kind: 'unchanged'; result: ResultRow };
const HISTORY_PAGE_SIZE = 25;
interface ResultWriteRequest {
  taskId: unknown;
  body: unknown;
  idempotencyKey: string | undefined;
}

@Injectable()
export class TaskResultsService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly tasks: TaskService,
    private readonly access: TaskAccessService,
    private readonly authorization: CompanyContextAuthorization,
    private readonly references: DocumentTaskResultReferenceService,
    private readonly clients: ClientOperationalReferenceService,
    private readonly closedProjects: ProjectClosedGuard,
    private readonly accountability: AccountabilityService,
  ) {}

  async current(actor: ActorContext, input: { taskId: unknown }) {
    const taskId = requireUuid(input.taskId);
    return this.database.transaction(
      async () => {
        const target = await this.tasks.read(actor, taskId);
        await this.references.requireRead({
          actor,
          context: target.task,
          lock: false,
        });
        const latest = await this.latest(actor, target.task);
        return {
          taskId: target.task.id,
          projectId: target.task.projectId,
          taskTitle: target.task.title,
          revision: latest?.revision ?? 0,
          taskVersion: target.task.version,
          mutable: target.mutable && isOpenTaskState(target.task.status),
          current: latest ? await this.view(actor, target.task, latest) : null,
        };
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  async history(
    actor: ActorContext,
    input: { taskId: unknown; query: unknown },
  ) {
    const taskId = requireUuid(input.taskId);
    const beforeRevision = historyQuery(input.query);
    return this.database.transaction(
      async () => {
        const { task } = await this.tasks.read(actor, taskId);
        // Every immutable declaration has this same original-Client mission scope.
        // The combined live read gate precedes all row bounds and lookahead.
        await this.references.requireRead({
          actor,
          context: task,
          lock: false,
        });
        const rows = await this.database.connection
          .select()
          .from(taskResultDeclarations)
          .where(
            and(
              this.scope(actor, task),
              beforeRevision === undefined
                ? undefined
                : lt(taskResultDeclarations.revision, beforeRevision),
            ),
          )
          .orderBy(desc(taskResultDeclarations.revision))
          .limit(HISTORY_PAGE_SIZE + 1);
        const page = rows.slice(0, HISTORY_PAGE_SIZE);
        const declarations: TaskResultDeclaration[] = [];
        for (const row of page)
          declarations.push(await this.view(actor, task, row));
        const last = page.at(-1);
        return {
          taskId,
          declarations,
          hasMore: rows.length > HISTORY_PAGE_SIZE,
          nextBeforeRevision:
            rows.length > HISTORY_PAGE_SIZE && last ? last.revision : null,
        };
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  async eligibleVersions(actor: ActorContext, input: { taskId: unknown }) {
    const taskId = requireUuid(input.taskId);
    return this.database.transaction(
      async () => {
        const target = await this.tasks.read(actor, taskId);
        await this.references.requireRead({
          actor,
          context: target.task,
          lock: false,
        });
        const mutable = target.mutable && isOpenTaskState(target.task.status);
        return {
          taskId,
          mutable,
          versions: mutable
            ? await this.references.eligible({ actor, context: target.task })
            : [],
        };
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  async record(
    actor: ActorContext,
    request: ResultWriteRequest,
  ): Promise<TaskResultReceipt> {
    return this.mutate(actor, {
      taskId: request.taskId,
      commandInput: resultInput(request.body, 'record'),
      idempotencyKey: request.idempotencyKey,
    });
  }

  async correct(
    actor: ActorContext,
    request: ResultWriteRequest,
  ): Promise<TaskResultReceipt> {
    return this.mutate(actor, {
      taskId: request.taskId,
      commandInput: resultInput(request.body, 'correct'),
      idempotencyKey: request.idempotencyKey,
    });
  }

  private async mutate(
    actor: ActorContext,
    request: {
      taskId: unknown;
      commandInput: ResultInput;
      idempotencyKey: string | undefined;
    },
  ): Promise<TaskResultReceipt> {
    const taskId = requireUuid(request.taskId);
    const input = request.commandInput;
    const idempotencyKey = requireIdempotencyKey(request.idempotencyKey);
    return this.database.transaction(async () => {
      const companyId = await this.access.requireActor(actor, true, true);
      await this.authorization.requireTaskResultRecorder(actor);
      const { task: visible } = await this.tasks.read(actor, taskId);
      await this.references.requireRead({
        actor,
        context: visible,
        lock: true,
      });
      const { kind, ...fields } = input;
      const command = JSON.stringify({
        companyId,
        taskId,
        operation: kind,
        ...fields,
      });
      const lockKey = JSON.stringify([
        'task.result',
        actor.workspaceId,
        actor.workspaceMembershipId,
        idempotencyKey,
      ]);
      await this.database.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey},0))`,
      );
      const [existing] = await this.database.connection
        .select()
        .from(taskResultCommands)
        .where(
          and(
            eq(taskResultCommands.workspaceId, actor.workspaceId),
            eq(
              taskResultCommands.actorMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(taskResultCommands.idempotencyKey, idempotencyKey),
          ),
        );
      if (existing) {
        if (existing.command !== command)
          throw new ConflictException(
            'Idempotency-Key was already used for another Task result command.',
          );
        const [recorded] = await this.database.connection
          .select()
          .from(taskResultDeclarations)
          .where(
            and(
              this.scope(actor, visible),
              eq(taskResultDeclarations.id, existing.resultId),
            ),
          );
        if (!recorded) throw new NotFoundException();
        await this.view(actor, visible, recorded);
        return {
          action: existing.action,
          taskId,
          resultId: recorded.id,
          resultRevision: recorded.revision,
        };
      }
      await this.clients.lockActiveReferenceClient(
        actor,
        visible.clientAccountId,
      );
      await this.closedProjects.requireOpen({
        actor,
        companyId,
        projectId: visible.projectId,
      });
      const task = await this.tasks.lockResultTargetWithinTransaction({
        actor,
        taskId,
      });
      const latest = await this.latest(actor, task);
      if (
        task.version !== input.expectedTaskVersion ||
        !isOpenTaskState(task.status) ||
        input.expectedResultRevision !== (latest?.revision ?? 0)
      )
        throw new ConflictException(
          'The Task or its result changed. Reload before choosing another action.',
        );
      const reference = await this.references.exact({
        actor,
        context: task,
        documentId: input.documentId,
        versionId: input.versionId,
        reference: { kind: 'eligible', lock: true },
      });
      const change = declarationChange(
        input,
        latest,
        reference.representationId,
      );
      if (change.kind === 'unchanged')
        return this.saveReceipt({
          actor,
          task,
          idempotencyKey,
          command,
          action: 'unchanged',
          result: change.result,
        });
      await this.clients.recordReferenceUse(actor, task.clientAccountId);
      const [created] = await this.database.connection
        .insert(taskResultDeclarations)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          taskId,
          revision: change.revision,
          predecessorId: change.predecessorId,
          reason: change.reason,
          declaration: input.declaration,
          documentId: reference.documentId,
          versionId: reference.versionId,
          pdfId: reference.representationId,
          actorInternalUserId: actor.internalUserId,
          actorMembershipId: actor.workspaceMembershipId,
          actorDisplayName: actor.displayName,
          occurredAt: new Date(),
        })
        .returning();
      if (!created) throw new Error('The Task result was not recorded.');
      await this.accountability.recordTaskResultEvent({
        actor,
        companyId,
        taskId,
        resultId: created.id,
        revision: created.revision,
        action:
          change.kind === 'recorded'
            ? 'task.result.recorded'
            : 'task.result.corrected',
        occurredAt: created.occurredAt,
      });
      return this.saveReceipt({
        actor,
        task,
        idempotencyKey,
        command,
        action: change.kind,
        result: created,
      });
    });
  }

  private async saveReceipt(input: {
    actor: ActorContext;
    task: Pick<TaskView, 'id' | 'companyId'>;
    idempotencyKey: string;
    command: string;
    action: TaskResultReceipt['action'];
    result: ResultRow;
  }): Promise<TaskResultReceipt> {
    await this.database.connection.insert(taskResultCommands).values({
      workspaceId: input.actor.workspaceId,
      companyId: input.task.companyId,
      taskId: input.task.id,
      actorMembershipId: input.actor.workspaceMembershipId,
      idempotencyKey: input.idempotencyKey,
      command: input.command,
      action: input.action,
      resultId: input.result.id,
    });
    return {
      action: input.action,
      taskId: input.task.id,
      resultId: input.result.id,
      resultRevision: input.result.revision,
    };
  }

  private scope(actor: ActorContext, task: Pick<TaskView, 'id' | 'companyId'>) {
    return and(
      eq(taskResultDeclarations.workspaceId, actor.workspaceId),
      eq(taskResultDeclarations.companyId, task.companyId),
      eq(taskResultDeclarations.taskId, task.id),
    );
  }
  private async latest(actor: ActorContext, task: TaskView) {
    const [row] = await this.database.connection
      .select()
      .from(taskResultDeclarations)
      .where(this.scope(actor, task))
      .orderBy(desc(taskResultDeclarations.revision))
      .limit(1);
    return row;
  }
  private async view(
    actor: ActorContext,
    task: TaskView,
    row: ResultRow,
  ): Promise<TaskResultDeclaration> {
    const reference = await this.references.exact({
      actor,
      context: task,
      documentId: row.documentId,
      versionId: row.versionId,
      reference: { kind: 'declared', representationId: row.pdfId },
    });
    const base = {
      id: row.id,
      revision: row.revision,
      declaration: row.declaration,
      actor: {
        internalUserId: row.actorInternalUserId,
        workspaceMembershipId: row.actorMembershipId,
        displayName: row.actorDisplayName,
      },
      occurredAt: row.occurredAt.toISOString(),
      reference,
    };
    if (row.revision === 1 && row.predecessorId === null && row.reason === null)
      return { ...base, kind: 'recorded' };
    if (row.revision > 1 && row.predecessorId !== null && row.reason !== null)
      return {
        ...base,
        kind: 'corrected',
        predecessorId: row.predecessorId,
        reason: row.reason,
      };
    throw new Error('Invalid persisted Task result declaration.');
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('A Task result object is required.');
  return Object.fromEntries(Object.entries(value));
}
function resultInput(value: unknown, kind: 'record' | 'correct'): ResultInput {
  const body = object(value);
  if (
    Object.keys(body).some(
      (key) =>
        ![
          'expectedTaskVersion',
          'expectedResultRevision',
          'documentId',
          'versionId',
          'declaration',
          ...(kind === 'correct' ? ['reason'] : []),
        ].includes(key),
    )
  )
    throw new BadRequestException('Unknown Task result field.');
  const fields = {
    expectedTaskVersion: revision(body.expectedTaskVersion, 1),
    expectedResultRevision: revision(body.expectedResultRevision, 0),
    documentId: requireUuid(body.documentId),
    versionId: requireUuid(body.versionId),
    declaration: statement(body.declaration),
  };
  if (kind === 'record') return { ...fields, kind };
  if (
    typeof body.reason !== 'string' ||
    Array.from(body.reason.trim()).length < 1 ||
    Array.from(body.reason.trim()).length > 500
  )
    throw new BadRequestException(
      'A correction reason of 1–500 characters is required.',
    );
  return { ...fields, kind, reason: body.reason.trim() };
}

/** The sole owner of first-record/correction/no-op meaning. Authority is fenced by its caller. */
function declarationChange(
  input: ResultInput,
  current: ResultRow | undefined,
  pdfId: string,
): ResultChange {
  if (input.kind === 'record') {
    if (current)
      throw new ConflictException('The Task already has a declared result.');
    return {
      kind: 'recorded',
      revision: 1,
      predecessorId: null,
      reason: null,
    };
  }
  if (!current)
    throw new ConflictException('The Task has no declared result to correct.');
  if (
    current.declaration === input.declaration &&
    current.documentId === input.documentId &&
    current.versionId === input.versionId &&
    current.pdfId === pdfId
  )
    return { kind: 'unchanged', result: current };
  if (current.revision >= 2147483647)
    throw new ConflictException('Task result revision is exhausted.');
  return {
    kind: 'corrected',
    revision: current.revision + 1,
    predecessorId: current.id,
    reason: input.reason,
  };
}
function revision(value: unknown, minimum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > 2147483647
  )
    throw new BadRequestException('A valid observed revision is required.');
  return value;
}
function statement(value: unknown): string {
  if (
    typeof value !== 'string' ||
    Array.from(value.trim()).length < 1 ||
    Array.from(value.trim()).length > 2000
  )
    throw new BadRequestException(
      'A result declaration of 1–2000 characters is required.',
    );
  return value.trim();
}
function historyQuery(value: unknown): number | undefined {
  const query = object(value);
  if (Object.keys(query).some((key) => key !== 'beforeRevision'))
    throw new BadRequestException('Unknown result history query.');
  if (query.beforeRevision === undefined) return undefined;
  if (
    typeof query.beforeRevision !== 'string' ||
    !/^[1-9]\d*$/u.test(query.beforeRevision)
  )
    throw new BadRequestException('A valid history revision is required.');
  return revision(Number(query.beforeRevision), 1);
}
