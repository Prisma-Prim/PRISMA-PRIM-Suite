import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import {
  ProjectResponsibleAccessService,
  type ProjectResponsibleCandidate,
} from '../access/project-responsible-access.service.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientAccounts,
  projectLifecycleCommands,
  projectLifecycleTransitions,
  projectStartDeclarations,
  projects,
} from '../database/schema/index.js';
import { ProjectOpenTaskQuery } from '../task/project-open-task.query.js';
import { ProjectClosedGuard } from './project-closed.guard.js';
import { isOpenProjectStatus } from './project-status.js';
import {
  COMMANDED_PROJECT_LIFECYCLE_ACTIONS,
  PROJECT_LIFECYCLE_TRANSITIONS,
  isLifecycleTransition,
  type ProjectLifecycleCommand,
  type ProjectLifecycleReceipt,
  type ProjectLifecycleTransitionRecord,
  type ProjectLifecycleTransitionView,
  type ProjectLifecycleView,
  type ProjectStartView,
  type ProjectStatus,
} from './project-lifecycle.types.js';
import { lifecycleCommand } from './project-lifecycle.validation.js';

type ProjectRow = typeof projects.$inferSelect;
type TransitionRow = typeof projectLifecycleTransitions.$inferSelect;
type StartRow = typeof projectStartDeclarations.$inferSelect;
const MAX_REVISION = 2147483647;
const TRANSITION_PAGE_SIZE = 50;

type LifecycleConflictCode =
  | 'project_lifecycle_conflict'
  | 'project_lifecycle_transition_invalid'
  | 'project_open_tasks'
  | 'project_responsible_required';

/**
 * The Project lifecycle (Project/Task PRD section 23): its status and revision,
 * the immutable start declaration and the append-only transition record. No
 * transition changes a Task, Document association, Request or responsible
 * member.
 */
@Injectable()
export class ProjectLifecycleService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly access: ProjectResponsibleAccessService,
    private readonly clients: ClientOperationalReferenceService,
    private readonly accountability: AccountabilityService,
    private readonly closedProjects: ProjectClosedGuard,
    private readonly openTasks: ProjectOpenTaskQuery,
  ) {}

  /** Any Project detail reader. Writes nothing. */
  async read(
    actor: ActorContext,
    projectId: string,
  ): Promise<ProjectLifecycleView> {
    return this.database.transaction(
      async () => {
        const companyId = await this.authorization.requireProjectAccess(actor);
        const { row, clientActive } = await this.visible(
          actor,
          companyId,
          projectId,
        );
        const [start] = await this.database.connection
          .select()
          .from(projectStartDeclarations)
          .where(
            and(
              eq(projectStartDeclarations.workspaceId, actor.workspaceId),
              eq(projectStartDeclarations.companyId, companyId),
              eq(projectStartDeclarations.projectId, projectId),
            ),
          );
        const transitions = await this.database.connection
          .select()
          .from(projectLifecycleTransitions)
          .where(
            and(
              eq(projectLifecycleTransitions.workspaceId, actor.workspaceId),
              eq(projectLifecycleTransitions.companyId, companyId),
              eq(projectLifecycleTransitions.projectId, projectId),
            ),
          )
          .orderBy(desc(projectLifecycleTransitions.lifecycleRevision))
          .limit(TRANSITION_PAGE_SIZE);
        return {
          status: row.status,
          lifecycleRevision: row.lifecycleRevision,
          mutable: clientActive && isOpenProjectStatus(row.status),
          start: start ? startView(start) : null,
          transitions: transitions.map((transition) =>
            transitionView(transition, start),
          ),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  /** The section 21 eligibility, offered only to a live approver. */
  async eligibleStartExceptionMembers(
    actor: ActorContext,
    projectId: string,
  ): Promise<{ members: ProjectResponsibleCandidate[] }> {
    return this.database.transaction(
      async () => {
        const companyId =
          await this.authorization.requireProjectLifecycleTransition(actor);
        const { row, clientActive } = await this.visible(
          actor,
          companyId,
          projectId,
        );
        if (!clientActive) throw new NotFoundException();
        await this.closedProjects.requireOpen({
          actor,
          companyId,
          projectId: row.id,
          closedAs: 'not_found',
        });
        return { members: await this.access.eligibleMembers(actor) };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async transition(
    actor: ActorContext,
    projectId: string,
    body: unknown,
    key: string | undefined,
  ): Promise<ProjectLifecycleReceipt> {
    const command = lifecycleCommand(body);
    const idempotencyKey = requireIdempotencyKey(key);
    return this.database.transaction(async () => {
      await this.lockCommand(actor, idempotencyKey);
      const companyId =
        command.action === 'complete' || command.action === 'cancel'
          ? await this.authorization.requireProjectClose(actor, true)
          : await this.authorization.requireProjectLifecycleTransition(
              actor,
              true,
            );
      const { row: visible, clientVersion: observedClientVersion } =
        await this.visible(actor, companyId, projectId);
      const fingerprint = JSON.stringify({ companyId, projectId, ...command });
      // An exact replay is resolved after live authority and visibility, and
      // before its old expected revision could be rejected as stale.
      const replay = await this.replay(actor, idempotencyKey, fingerprint);
      if (replay) return replay;
      // Client identity before its relationship, then the Project row: the
      // order responsibility, Task and Document commands already use.
      const lockedClient = await this.clients.lockActiveReferenceClient(
        actor,
        visible.clientAccountId,
      );
      const current = await this.row(actor, companyId, projectId, true);
      const transition = transitionFor(command, current.status);
      if (!transition)
        throw lifecycleConflict(
          'project_lifecycle_transition_invalid',
          'This Project lifecycle transition is not available. Reload before choosing another action.',
        );
      if (current.lifecycleRevision !== command.expectedLifecycleRevision)
        throw lifecycleConflict(
          'project_lifecycle_conflict',
          'The Project lifecycle changed. Reload before choosing another action.',
        );
      if (
        transition.action === 'activate' &&
        current.responsibleMembershipId === null
      )
        throw lifecycleConflict(
          'project_responsible_required',
          'Name a responsible member before activating this Project.',
        );
      if (
        (transition.action === 'complete' || transition.action === 'cancel') &&
        (await this.openTasks.exists({
          workspaceId: actor.workspaceId,
          companyId,
          projectId,
        }))
      )
        throw lifecycleConflict(
          'project_open_tasks',
          'Complete or cancel every open Task of this Project first.',
        );
      if (
        (transition.action === 'complete' || transition.action === 'cancel') &&
        lockedClient.version !== observedClientVersion
      )
        throw lifecycleConflict(
          'project_lifecycle_conflict',
          'The Project lifecycle changed. Reload before choosing another action.',
        );
      if (current.lifecycleRevision >= MAX_REVISION)
        throw lifecycleConflict(
          'project_lifecycle_conflict',
          'The Project lifecycle revision is exhausted.',
        );
      const completion =
        command.action === 'activate' && command.startException
          ? await this.access.requireEligibleMember(
              actor,
              command.startException.completionMembershipId,
            )
          : null;
      const lifecycleRevision = current.lifecycleRevision + 1;
      const occurredAt = new Date();
      await this.clients.recordReferenceUse(actor, current.clientAccountId);
      const [changed] = await this.database.connection
        .update(projects)
        .set({ status: transition.to, lifecycleRevision })
        .where(
          and(
            eq(projects.workspaceId, actor.workspaceId),
            eq(projects.companyId, companyId),
            eq(projects.id, projectId),
            eq(projects.lifecycleRevision, current.lifecycleRevision),
          ),
        )
        .returning({ id: projects.id });
      if (!changed)
        throw lifecycleConflict(
          'project_lifecycle_conflict',
          'The Project lifecycle changed. Reload before choosing another action.',
        );
      await this.accountability.recordProjectLifecycleChanged({
        actor,
        companyId,
        projectId,
        occurredAt,
        lifecycleRevision,
        transition,
      });
      if (command.action === 'activate')
        await this.database.connection.insert(projectStartDeclarations).values({
          workspaceId: actor.workspaceId,
          companyId,
          projectId,
          ...command.declaration,
          exceptionReason: command.startException?.reason ?? null,
          completionMembershipId: completion?.workspaceMembershipId ?? null,
          completionDisplayLabel: completion?.displayLabel ?? null,
          completionDueDate: command.startException?.completionDueDate ?? null,
          declaredByInternalUserId: actor.internalUserId,
          declaredByMembershipId: actor.workspaceMembershipId,
          declaredByDisplayName: actor.displayName,
          declaredAt: occurredAt,
        });
      await this.database.connection.insert(projectLifecycleCommands).values({
        workspaceId: actor.workspaceId,
        companyId,
        projectId,
        actorMembershipId: actor.workspaceMembershipId,
        idempotencyKey,
        command: fingerprint,
        resultRevision: lifecycleRevision,
      });
      return {
        projectId,
        action: transition.action,
        from: transition.from,
        to: transition.to,
        lifecycleRevision,
      };
    });
  }

  /** The same Project visibility as Project detail, plus the Client state. */
  private async visible(
    actor: ActorContext,
    companyId: string,
    projectId: string,
  ): Promise<{
    row: ProjectRow;
    clientActive: boolean;
    clientVersion: number;
  }> {
    const row = await this.row(actor, companyId, projectId, false);
    const client = await this.clients.readReferenceClient(
      actor,
      row.clientAccountId,
    );
    const [clientRevision] = await this.database.connection
      .select({ version: clientAccounts.version })
      .from(clientAccounts)
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          eq(clientAccounts.id, row.clientAccountId),
        ),
      );
    if (!clientRevision) throw new NotFoundException();
    return {
      row,
      clientActive: client.status === 'active',
      clientVersion: clientRevision.version,
    };
  }

  private async row(
    actor: ActorContext,
    companyId: string,
    projectId: string,
    lock: boolean,
  ): Promise<ProjectRow> {
    const query = this.database.connection
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, actor.workspaceId),
          eq(projects.companyId, companyId),
          eq(projects.id, projectId),
        ),
      );
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw new NotFoundException();
    return row;
  }

  private async lockCommand(actor: ActorContext, key: string): Promise<void> {
    const lock = JSON.stringify([
      'project.lifecycle',
      actor.workspaceId,
      actor.workspaceMembershipId,
      key,
    ]);
    await this.database.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))`,
    );
  }

  private async replay(
    actor: ActorContext,
    key: string,
    fingerprint: string,
  ): Promise<ProjectLifecycleReceipt | undefined> {
    const [existing] = await this.database.connection
      .select({
        command: projectLifecycleCommands.command,
        transition: projectLifecycleTransitions,
      })
      .from(projectLifecycleCommands)
      .innerJoin(
        projectLifecycleTransitions,
        and(
          eq(
            projectLifecycleTransitions.workspaceId,
            projectLifecycleCommands.workspaceId,
          ),
          eq(
            projectLifecycleTransitions.projectId,
            projectLifecycleCommands.projectId,
          ),
          eq(
            projectLifecycleTransitions.lifecycleRevision,
            projectLifecycleCommands.resultRevision,
          ),
        ),
      )
      .where(
        and(
          eq(projectLifecycleCommands.workspaceId, actor.workspaceId),
          eq(
            projectLifecycleCommands.actorMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(projectLifecycleCommands.idempotencyKey, key),
        ),
      );
    if (!existing) return undefined;
    if (existing.command !== fingerprint)
      throw new ConflictException(
        'Idempotency-Key was already used for another Project lifecycle transition.',
      );
    return receiptOf(existing.transition);
  }
}

/**
 * The section 23 transition a command makes from the current status, derived
 * from the transition table, or undefined when the status is not a source.
 */
function transitionFor(
  command: ProjectLifecycleCommand,
  from: ProjectStatus,
): ProjectLifecycleTransitionRecord | undefined {
  switch (command.action) {
    case 'activate': {
      const { from: sources, to } = PROJECT_LIFECYCLE_TRANSITIONS.activate;
      return isSource(sources, from)
        ? { action: command.action, from, to }
        : undefined;
    }
    case 'hold': {
      const { from: sources, to } = PROJECT_LIFECYCLE_TRANSITIONS.hold;
      return isSource(sources, from)
        ? { action: command.action, from, to, reason: command.reason }
        : undefined;
    }
    case 'resume': {
      const { from: sources, to } = PROJECT_LIFECYCLE_TRANSITIONS.resume;
      return isSource(sources, from)
        ? { action: command.action, from, to }
        : undefined;
    }
    case 'complete': {
      const { from: sources, to } = PROJECT_LIFECYCLE_TRANSITIONS.complete;
      return isSource(sources, from)
        ? { action: command.action, from, to, note: command.note }
        : undefined;
    }
    case 'cancel': {
      const { from: sources, to } = PROJECT_LIFECYCLE_TRANSITIONS.cancel;
      return isSource(sources, from)
        ? { action: command.action, from, to, reason: command.reason }
        : undefined;
    }
    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
}

function isSource<Source extends ProjectStatus>(
  sources: readonly Source[],
  status: ProjectStatus,
): status is Source {
  return sources.some((source) => source === status);
}

function lifecycleConflict(
  code: LifecycleConflictCode,
  message: string,
): ConflictException {
  return new ConflictException({ statusCode: 409, code, message });
}

function receiptOf(row: TransitionRow): ProjectLifecycleReceipt {
  const action = COMMANDED_PROJECT_LIFECYCLE_ACTIONS.find(
    (candidate) => candidate === row.action,
  );
  if (!action || !isLifecycleTransition(action, row.fromStatus, row.toStatus))
    throw new Error('Invalid stored Project lifecycle receipt.');
  return {
    projectId: row.projectId,
    action,
    from: row.fromStatus,
    to: row.toStatus,
    lifecycleRevision: row.lifecycleRevision,
  };
}

function startView(row: StartRow): ProjectStartView {
  return {
    declaredAt: row.declaredAt.toISOString(),
    declaredBy: { displayName: row.declaredByDisplayName },
    declaration: {
      approvedOffer: row.approvedOffer,
      contractOrPrecontract: row.contractOrPrecontract,
      projectPlan: row.projectPlan,
      initialDocuments: row.initialDocuments,
      deadlines: row.deadlines,
      financialConditions: row.financialConditions,
      risks: row.risks,
    },
    exception: startException(row),
  };
}

function startException(row: StartRow): ProjectStartView['exception'] {
  const {
    exceptionReason,
    completionMembershipId,
    completionDisplayLabel,
    completionDueDate,
  } = row;
  if (
    exceptionReason === null &&
    completionMembershipId === null &&
    completionDisplayLabel === null &&
    completionDueDate === null
  )
    return null;
  if (
    exceptionReason === null ||
    completionMembershipId === null ||
    completionDisplayLabel === null ||
    completionDueDate === null
  )
    throw new Error('Invalid stored Project start exception.');
  return {
    reason: exceptionReason,
    completionResponsible: {
      workspaceMembershipId: completionMembershipId,
      displayLabel: completionDisplayLabel,
    },
    completionDueDate,
  };
}

function transitionView(
  row: TransitionRow,
  start: StartRow | undefined,
): ProjectLifecycleTransitionView {
  if (!isLifecycleTransition(row.action, row.fromStatus, row.toStatus))
    throw new Error('Invalid stored Project lifecycle transition.');
  const base = {
    lifecycleRevision: row.lifecycleRevision,
    from: row.fromStatus,
    to: row.toStatus,
    occurredAt: row.occurredAt.toISOString(),
    actor: { displayName: row.actorDisplayName },
  };
  switch (row.action) {
    case 'activate':
      if (!start) throw new Error('Activation without a start declaration.');
      return {
        ...base,
        action: row.action,
        withStartException: start.exceptionReason !== null,
      };
    case 'hold':
    case 'cancel':
      return { ...base, action: row.action, reason: stored(row.reason) };
    case 'resume':
      return { ...base, action: row.action };
    case 'complete':
      return { ...base, action: row.action, note: stored(row.note) };
    default: {
      const exhaustive: never = row.action;
      return exhaustive;
    }
  }
}

function stored(value: string | null): string {
  if (value === null)
    throw new Error('Invalid stored Project lifecycle transition text.');
  return value;
}
