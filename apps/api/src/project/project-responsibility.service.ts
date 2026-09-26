import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
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
  projectResponsibilityCommands,
  projects,
} from '../database/schema/index.js';
import type {
  ProjectResponsibilityCommand,
  ProjectResponsibilityReceipt,
  ProjectResponsibilityView,
  ProjectResponsibleMember,
} from './project-responsibility.types.js';
import { responsibilityCommand } from './project-responsibility.validation.js';

type ProjectRow = typeof projects.$inferSelect;
type ReceiptRow = typeof projectResponsibilityCommands.$inferSelect;
const MAX_REVISION = 2147483647;
const STALE =
  'The responsible member changed. Reload before choosing another member.';

/**
 * A Project's one accountable member. Being responsible grants no access,
 * assigns no Task and never changes the Project lifecycle, which requires the
 * member while the Project is active or on hold (Project/Task PRD section 23).
 */
@Injectable()
export class ProjectResponsibilityService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly access: ProjectResponsibleAccessService,
    private readonly clients: ClientOperationalReferenceService,
    private readonly accountability: AccountabilityService,
  ) {}

  /** Any Project reader. Writes no event, receipt or reversal-fence advance. */
  async read(
    actor: ActorContext,
    projectId: string,
  ): Promise<ProjectResponsibilityView> {
    return this.database.transaction(
      async () => {
        const companyId = await this.authorization.requireProjectAccess(actor);
        const { row, clientActive } = await this.visible(
          actor,
          companyId,
          projectId,
        );
        return {
          responsible: responsibleOf(row),
          revision: row.responsibilityRevision,
          lastChange: lastChangeOf(row),
          mutable: clientActive,
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async eligibleMembers(
    actor: ActorContext,
    projectId: string,
  ): Promise<{ members: ProjectResponsibleCandidate[] }> {
    return this.database.transaction(
      async () => {
        const companyId = await this.authorization.requireProjectUpdate(actor);
        const { clientActive } = await this.visible(
          actor,
          companyId,
          projectId,
        );
        if (!clientActive) throw new NotFoundException();
        return { members: await this.access.eligibleMembers(actor) };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async change(
    actor: ActorContext,
    projectId: string,
    body: unknown,
    key: string | undefined,
  ): Promise<ProjectResponsibilityReceipt> {
    const command = responsibilityCommand(body);
    const idempotencyKey = requireIdempotencyKey(key);
    return this.database.transaction(async () => {
      const companyId = await this.authorization.requireProjectUpdate(
        actor,
        true,
      );
      await this.lockCommand(actor, idempotencyKey);
      const { row: visible } = await this.visible(actor, companyId, projectId);
      // An exact replay is resolved after live authority and visibility, and
      // before its old expected revision could be rejected as stale.
      const replay = await this.replay(actor, idempotencyKey, {
        companyId,
        projectId,
        command,
      });
      if (replay) return replay;
      // Lock Client identity before its relationship, including a new no-op
      // command. Only a material change below advances the reversal fence.
      await this.clients.lockActiveReferenceClient(
        actor,
        visible.clientAccountId,
      );
      const current = await this.row(actor, companyId, projectId, true);
      if (current.responsibilityRevision !== command.expectedRevision)
        throw new ConflictException(STALE);
      // Read under the Project row lock, which a lifecycle transition also
      // takes after the same Client locks: the two serialize.
      if (
        command.workspaceMembershipId === null &&
        (current.status === 'active' || current.status === 'on_hold')
      )
        throw new ConflictException({
          statusCode: 409,
          code: 'project_responsible_required',
          message:
            'Choose a replacement instead of clearing the responsible member.',
        });
      const before = responsibleOf(current);
      const receipt = {
        actor,
        idempotencyKey,
        companyId,
        projectId,
        expectedRevision: command.expectedRevision,
      };
      if (
        (before?.workspaceMembershipId ?? null) ===
        command.workspaceMembershipId
      )
        return this.recordReceipt({
          ...receipt,
          outcome: 'unchanged',
          revision: current.responsibilityRevision,
          responsible: before,
        });
      const after =
        command.workspaceMembershipId === null
          ? null
          : await this.access.requireEligibleMember(
              actor,
              command.workspaceMembershipId,
            );
      if (current.responsibilityRevision >= MAX_REVISION)
        throw new ConflictException(
          'Project responsibility revision is exhausted.',
        );
      const revision = current.responsibilityRevision + 1;
      const occurredAt = new Date();
      await this.clients.recordReferenceUse(actor, current.clientAccountId);
      const [changed] = await this.database.connection
        .update(projects)
        .set({
          responsibleMembershipId: after?.workspaceMembershipId ?? null,
          responsibleDisplayLabel: after?.displayLabel ?? null,
          responsibilityRevision: revision,
          responsibilityChangedByInternalUserId: actor.internalUserId,
          responsibilityChangedByMembershipId: actor.workspaceMembershipId,
          responsibilityChangedByDisplayName: actor.displayName,
          responsibilityChangedAt: occurredAt,
        })
        .where(
          and(
            eq(projects.workspaceId, actor.workspaceId),
            eq(projects.companyId, companyId),
            eq(projects.id, projectId),
            eq(projects.responsibilityRevision, current.responsibilityRevision),
          ),
        )
        .returning({ id: projects.id });
      if (!changed) throw new ConflictException(STALE);
      await this.accountability.recordProjectResponsibleChanged({
        actor,
        companyId,
        projectId,
        occurredAt,
        revision,
        before,
        after,
      });
      return this.recordReceipt({
        ...receipt,
        outcome: 'changed',
        revision,
        responsible: after,
      });
    });
  }

  /** The same Project visibility as Project detail, plus the Client state. */
  private async visible(
    actor: ActorContext,
    companyId: string,
    projectId: string,
  ): Promise<{ row: ProjectRow; clientActive: boolean }> {
    const row = await this.row(actor, companyId, projectId, false);
    const client = await this.clients.readReferenceClient(
      actor,
      row.clientAccountId,
    );
    return { row, clientActive: client.status === 'active' };
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
      'project.responsible',
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
    attempted: {
      companyId: string;
      projectId: string;
      command: ProjectResponsibilityCommand;
    },
  ): Promise<ProjectResponsibilityReceipt | undefined> {
    const [existing] = await this.database.connection
      .select()
      .from(projectResponsibilityCommands)
      .where(
        and(
          eq(projectResponsibilityCommands.workspaceId, actor.workspaceId),
          eq(
            projectResponsibilityCommands.actorMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(projectResponsibilityCommands.idempotencyKey, key),
        ),
      );
    if (!existing) return undefined;
    // Every recorded outcome's requested target is its resulting member.
    if (
      existing.companyId !== attempted.companyId ||
      existing.projectId !== attempted.projectId ||
      existing.expectedRevision !== attempted.command.expectedRevision ||
      existing.responsibleMembershipId !==
        attempted.command.workspaceMembershipId
    )
      throw new ConflictException(
        'Idempotency-Key was already used for another responsible-member change.',
      );
    return receiptOf(existing);
  }

  private async recordReceipt(input: {
    actor: ActorContext;
    idempotencyKey: string;
    companyId: string;
    projectId: string;
    expectedRevision: number;
    outcome: ProjectResponsibilityReceipt['outcome'];
    revision: number;
    responsible: ProjectResponsibleMember | null;
  }): Promise<ProjectResponsibilityReceipt> {
    const [recorded] = await this.database.connection
      .insert(projectResponsibilityCommands)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        projectId: input.projectId,
        actorMembershipId: input.actor.workspaceMembershipId,
        idempotencyKey: input.idempotencyKey,
        expectedRevision: input.expectedRevision,
        resultRevision: input.revision,
        outcome: input.outcome,
        responsibleMembershipId:
          input.responsible?.workspaceMembershipId ?? null,
        responsibleDisplayLabel: input.responsible?.displayLabel ?? null,
      })
      .returning();
    if (!recorded)
      throw new Error('The responsible-member receipt was not recorded.');
    return receiptOf(recorded);
  }
}

function member(
  workspaceMembershipId: string | null,
  displayLabel: string | null,
): ProjectResponsibleMember | null {
  if (workspaceMembershipId === null && displayLabel === null) return null;
  if (workspaceMembershipId === null || displayLabel === null)
    throw new Error('Invalid stored Project responsible member.');
  return { workspaceMembershipId, displayLabel };
}

function responsibleOf(row: ProjectRow): ProjectResponsibleMember | null {
  return member(row.responsibleMembershipId, row.responsibleDisplayLabel);
}

function lastChangeOf(
  row: ProjectRow,
): ProjectResponsibilityView['lastChange'] {
  if (row.responsibilityRevision === 0) return null;
  if (
    row.responsibilityChangedByDisplayName === null ||
    row.responsibilityChangedAt === null
  )
    throw new Error('Invalid stored Project responsibility attribution.');
  return {
    actorDisplayName: row.responsibilityChangedByDisplayName,
    occurredAt: row.responsibilityChangedAt.toISOString(),
  };
}

function receiptOf(row: ReceiptRow): ProjectResponsibilityReceipt {
  return {
    projectId: row.projectId,
    outcome: row.outcome,
    revision: row.resultRevision,
    responsible: member(
      row.responsibleMembershipId,
      row.responsibleDisplayLabel,
    ),
  };
}
