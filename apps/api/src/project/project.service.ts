import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  projects,
  projectTemplateInstances,
} from '../database/schema/index.js';
import { isOpenProjectStatus } from './project-status.js';

type ProjectRow = typeof projects.$inferSelect;
@Injectable()
export class ProjectService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly clients: ClientOperationalReferenceService,
    private readonly accountability: AccountabilityService,
  ) {}

  async list(actor: ActorContext, selection?: { view: 'mine_open' }) {
    const companyId = await this.authorization.requireProjectAccess(actor);
    const rows = await this.databaseContext.connection
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, actor.workspaceId),
          eq(projects.companyId, companyId),
          selection?.view === 'mine_open'
            ? and(
                eq(
                  projects.responsibleMembershipId,
                  actor.workspaceMembershipId,
                ),
                inArray(
                  projects.status,
                  projects.status.enumValues.filter(isOpenProjectStatus),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(projects.createdAt), asc(projects.id));
    const references = await this.clients.readProjectReferences(actor, [
      ...new Set(rows.map((row) => row.clientAccountId)),
    ]);
    return rows.flatMap((row) => {
      const reference = references.get(row.clientAccountId);
      return reference ? [this.projectView(row, reference)] : [];
    });
  }

  /** The open Projects of the reader's Project list; it runs inside the caller's snapshot. */
  async countOpen(actor: ActorContext): Promise<number> {
    return (await this.list(actor)).filter((project) =>
      isOpenProjectStatus(project.status),
    ).length;
  }

  async read(actor: ActorContext, id: string) {
    const companyId = await this.authorization.requireProjectAccess(actor);
    const [row] = await this.databaseContext.connection
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, actor.workspaceId),
          eq(projects.companyId, companyId),
          eq(projects.id, id),
        ),
      );
    if (!row) throw new NotFoundException();
    return this.view(actor, row);
  }

  async create(actor: ActorContext, body: unknown, key: string | undefined) {
    return this.databaseContext.transaction(() =>
      this.createWithinTransaction(actor, body, key),
    );
  }

  /** Caller owns the transaction so registration and its related command commit together. */
  async createWithinTransaction(
    actor: ActorContext,
    body: unknown,
    key: string | undefined,
  ) {
    return this.registerWithinTransaction(actor, body, key, true);
  }

  /** A composed creation owns its receipt; never attach it to an existing manual Project. */
  async createNewWithinTransaction(
    actor: ActorContext,
    body: unknown,
    key: string,
  ) {
    return this.registerWithinTransaction(actor, body, key, false);
  }

  private async registerWithinTransaction(
    actor: ActorContext,
    body: unknown,
    key: string | undefined,
    allowExisting: boolean,
  ) {
    if (
      !isRecord(body) ||
      Object.keys(body).some(
        (key) => key !== 'title' && key !== 'clientAccountId',
      ) ||
      typeof body.title !== 'string'
    )
      throw new BadRequestException('A Project title and Client are required.');
    const title = readProjectTitle(body.title);
    const clientAccountId = requireUuid(body.clientAccountId);
    const idempotencyKey = requireIdempotencyKey(key);
    const companyId = await this.authorization.requireProjectAccess(
      actor,
      true,
    );
    const lockKey = JSON.stringify([
      'project.create',
      actor.workspaceId,
      actor.workspaceMembershipId,
      idempotencyKey,
    ]);
    await this.databaseContext.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
    const [existing] = await this.databaseContext.connection
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, actor.workspaceId),
          eq(
            projects.createdByWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(projects.idempotencyKey, idempotencyKey),
        ),
      );
    if (existing) {
      if (
        allowExisting &&
        existing.title === title &&
        existing.clientAccountId === clientAccountId &&
        existing.companyId === companyId
      ) {
        const [templateInstance] = await this.databaseContext.connection
          .select({ projectId: projectTemplateInstances.projectId })
          .from(projectTemplateInstances)
          .where(
            and(
              eq(projectTemplateInstances.workspaceId, actor.workspaceId),
              eq(projectTemplateInstances.companyId, companyId),
              eq(projectTemplateInstances.projectId, existing.id),
            ),
          )
          .limit(1);
        // A Template intent cannot be replayed as a manual creation command.
        if (!templateInstance) return this.view(actor, existing);
      }
      throw new ConflictException(
        'Idempotency-Key was already used for another Project.',
      );
    }
    await this.clients.recordReferenceUse(actor, clientAccountId);
    const [project] = await this.databaseContext.connection
      .insert(projects)
      .values({
        workspaceId: actor.workspaceId,
        companyId,
        clientAccountId,
        title,
        createdByInternalUserId: actor.internalUserId,
        createdByWorkspaceMembershipId: actor.workspaceMembershipId,
        idempotencyKey,
      })
      .returning();
    if (!project) throw new Error('The Project was not recorded.');
    await this.accountability.recordProjectCreated({
      actor,
      projectId: project.id,
      companyId,
    });
    return this.view(actor, project);
  }

  /** Independent current creation authority; Contract authority supplies no Project grant. */
  async requireCreationAccess(actor: ActorContext) {
    return this.authorization.requireProjectAccess(actor, true);
  }

  /** Current candidates are decided after this Client-owner operational fence. */
  async lockContractCreationClient(
    actor: ActorContext,
    originalClientAccountId: string,
  ) {
    await this.requireCreationAccess(actor);
    const resolved = await this.clients.resolveProjectLinkClients(
      actor,
      [originalClientAccountId],
      true,
    );
    const clientAccountId = resolved.get(originalClientAccountId);
    if (!clientAccountId) throw new NotFoundException();
    await this.clients.lockActiveReferenceClient(actor, clientAccountId);
    return clientAccountId;
  }

  /** Existing relationship replays require visibility, even after the Project closes. */
  async lockReadableContractLinkProject(
    actor: ActorContext,
    projectId: string,
  ) {
    await this.authorization.requireProjectAccess(actor, true);
    const project = await this.read(actor, projectId);
    await this.clients.lockReadableProjectReferences(actor, [
      project.clientAccountId,
    ]);
    return this.read(actor, projectId);
  }

  /** Client identities precede lifecycle/Contract locks, matching union, reversal and closure. */
  async lockContractLinkContext(input: {
    actor: ActorContext;
    projectId: string;
    contractOriginalClientAccountId: string;
  }) {
    await this.authorization.requireProjectAccess(input.actor, true);
    const project = await this.read(input.actor, input.projectId);
    const references = await this.clients.resolveProjectLinkClients(
      input.actor,
      [project.clientAccountId, input.contractOriginalClientAccountId],
      true,
    );
    const projectClient = references.get(project.clientAccountId);
    const contractClient = references.get(
      input.contractOriginalClientAccountId,
    );
    if (!projectClient || !contractClient) throw new NotFoundException();
    const current = await this.read(input.actor, project.id);
    return {
      project: current,
      eligible:
        isOpenProjectStatus(current.status) && projectClient === contractClient,
    };
  }

  private async view(actor: ActorContext, row: ProjectRow) {
    const client = (
      await this.clients.readProjectReferences(actor, [row.clientAccountId])
    ).get(row.clientAccountId);
    if (!client) throw new NotFoundException();
    return this.projectView(row, client);
  }

  private projectView(
    row: ProjectRow,
    client: {
      displayName: string;
      clientDossierId?: string;
    },
  ) {
    return {
      id: row.id,
      companyId: row.companyId,
      clientAccountId: row.clientAccountId,
      ...(client.clientDossierId
        ? { clientDossierId: client.clientDossierId }
        : {}),
      clientDisplayName: client.displayName,
      title: row.title,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readProjectTitle(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200)
    throw new BadRequestException(
      'Project title must contain 1–200 characters.',
    );
  return value.trim();
}
