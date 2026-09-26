import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { projects } from '../database/schema/index.js';
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

  async list(actor: ActorContext) {
    const companyId = await this.authorization.requireProjectAccess(actor);
    const rows = await this.databaseContext.connection
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, actor.workspaceId),
          eq(projects.companyId, companyId),
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
    if (
      !isRecord(body) ||
      Object.keys(body).some(
        (key) => key !== 'title' && key !== 'clientAccountId',
      ) ||
      typeof body.title !== 'string'
    )
      throw new BadRequestException('A Project title and Client are required.');
    const title = body.title.trim();
    if (!title || title.length > 200)
      throw new BadRequestException(
        'Project title must contain 1–200 characters.',
      );
    const clientAccountId = requireUuid(body.clientAccountId);
    const idempotencyKey = requireIdempotencyKey(key);
    return this.databaseContext.transaction(async () => {
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
          existing.title !== title ||
          existing.clientAccountId !== clientAccountId ||
          existing.companyId !== companyId
        )
          throw new ConflictException(
            'Idempotency-Key was already used for another Project.',
          );
        return this.view(actor, existing);
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
    });
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
