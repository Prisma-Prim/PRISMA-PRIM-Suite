import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  documentProjectEvents,
  workingDocuments,
} from '../database/schema/index.js';
import { ProjectClosedGuard } from '../project/project-closed.guard.js';
import { isOpenProjectStatus } from '../project/project-status.js';
import { ProjectService } from '../project/project.service.js';
import { DocumentsService } from './documents.service.js';

@Injectable()
export class DocumentProjectsService {
  constructor(
    private readonly authorization: CompanyContextAuthorization,
    private readonly database: DatabaseContext,
    private readonly clients: ClientOperationalReferenceService,
    private readonly documents: DocumentsService,
    private readonly projects: ProjectService,
    private readonly closedProjects: ProjectClosedGuard,
  ) {}

  async list(actor: ActorContext, projectIdValue: unknown, eligible = false) {
    this.requireRead(actor);
    const projectId = requireUuid(projectIdValue);
    // Keep authority, original Client state and association revisions in one read snapshot.
    return this.database.transaction(
      async () => {
        const companyId = await this.authorization.requireDocumentAccess(actor);
        const project = await this.projects.read(actor, projectId);
        const client = await this.clients.readReferenceClient(
          actor,
          project.clientAccountId,
        );
        if (eligible) {
          if (client.status !== 'active') throw new NotFoundException();
          await this.closedProjects.requireOpen({
            actor,
            companyId,
            projectId,
            closedAs: 'not_found',
          });
        }
        const rows = await this.database.connection
          .select({
            id: workingDocuments.id,
            revision: workingDocuments.projectRevision,
          })
          .from(workingDocuments)
          .where(
            and(
              eq(workingDocuments.workspaceId, actor.workspaceId),
              eq(workingDocuments.companyId, project.companyId),
              eq(workingDocuments.clientId, project.clientAccountId),
              eligible
                ? isNull(workingDocuments.projectId)
                : eq(workingDocuments.projectId, projectId),
            ),
          )
          .orderBy(asc(workingDocuments.createdAt), asc(workingDocuments.id));
        const documents = [];
        for (const row of rows)
          documents.push({
            document: await this.documents.read(actor, row.id),
            revision: row.revision,
          });
        return {
          mutable:
            client.status === 'active' && isOpenProjectStatus(project.status),
          documents,
        };
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  async mutate(
    actor: ActorContext,
    documentIdValue: unknown,
    value: unknown,
    key: string | undefined,
  ) {
    this.requireRead(actor);
    const documentId = requireUuid(documentIdValue);
    const command = parseCommand(value);
    const idempotencyKey = requireIdempotencyKey(key);
    return this.database.transaction(async () => {
      await this.authorization.requireDocumentProjectManage(actor);
      const companyId = actor.activeCompany?.id;
      if (!companyId) throw new ForbiddenException();
      const lockKey = JSON.stringify([
        'document.project',
        actor.workspaceId,
        actor.workspaceMembershipId,
        idempotencyKey,
      ]);
      await this.database.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );
      const [replay] = await this.database.connection
        .select()
        .from(documentProjectEvents)
        .where(
          and(
            eq(documentProjectEvents.workspaceId, actor.workspaceId),
            eq(
              documentProjectEvents.actorMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(documentProjectEvents.idempotencyKey, idempotencyKey),
          ),
        );
      if (
        replay &&
        (replay.companyId !== companyId ||
          replay.documentId !== documentId ||
          replay.projectId !== command.projectId ||
          replay.action !== command.action ||
          replay.expectedRevision !== command.expectedRevision)
      )
        throw new ConflictException(
          'Idempotency-Key was already used for another association command.',
        );
      const document = await this.documents.read(actor, documentId);
      const project = await this.projects.read(actor, command.projectId);
      if (
        document.clientId !== project.clientAccountId ||
        document.companyId !== project.companyId
      )
        throw new NotFoundException();
      // Exact replay confirms historical success; it does not claim this link is current.
      if (replay) return receipt(replay);
      // Client-owned identity lock precedes the association lock, matching union/reversal.
      // Any refused command rolls back this operational-use fence with all other writes.
      await this.clients.lockActiveReferenceClient(actor, document.clientId);
      await this.closedProjects.requireOpen({
        actor,
        companyId,
        projectId: project.id,
      });
      const [current] = await this.database.connection
        .select()
        .from(workingDocuments)
        .where(
          and(
            eq(workingDocuments.workspaceId, actor.workspaceId),
            eq(workingDocuments.companyId, companyId),
            eq(workingDocuments.id, documentId),
          ),
        )
        .for('update');
      if (!current) throw new NotFoundException();
      if (
        current.projectRevision !== command.expectedRevision ||
        current.projectRevision >= 2147483647 ||
        (command.action === 'link'
          ? current.projectId !== null
          : current.projectId !== project.id)
      )
        throw new ConflictException(
          'The Document association changed. Reload before choosing another action.',
        );
      const revision = current.projectRevision + 1;
      await this.clients.recordReferenceUse(actor, document.clientId);
      await this.database.connection
        .update(workingDocuments)
        .set({
          projectId: command.action === 'link' ? project.id : null,
          projectRevision: revision,
        })
        .where(eq(workingDocuments.id, documentId));
      const [event] = await this.database.connection
        .insert(documentProjectEvents)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          documentId,
          projectId: project.id,
          action: command.action,
          expectedRevision: command.expectedRevision,
          revision,
          actorMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
        })
        .returning();
      if (!event) throw new Error('The association command was not recorded.');
      return receipt(event);
    });
  }
  private requireRead(actor: ActorContext) {
    if (
      !actor.activeCompany?.projectPermissions?.includes('project.read') ||
      !actor.activeCompany.documentPermissions?.includes('document.read')
    )
      throw new ForbiddenException();
  }
}
function receipt(event: typeof documentProjectEvents.$inferSelect) {
  return {
    documentId: event.documentId,
    projectId: event.projectId,
    action: event.action,
    revision: event.revision,
  };
}
function parseCommand(
  value: unknown,
): Pick<
  typeof documentProjectEvents.$inferSelect,
  'projectId' | 'action' | 'expectedRevision'
> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException();
  const row: Record<string, unknown> = Object.fromEntries(
    Object.entries(value),
  );
  if (
    Object.keys(row).some(
      (key) => !['action', 'projectId', 'expectedRevision'].includes(key),
    ) ||
    (row.action !== 'link' && row.action !== 'unlink') ||
    typeof row.expectedRevision !== 'number' ||
    !Number.isInteger(row.expectedRevision) ||
    row.expectedRevision < 0 ||
    row.expectedRevision > 2147483646
  )
    throw new BadRequestException();
  return {
    projectId: requireUuid(row.projectId),
    action: row.action,
    expectedRevision: row.expectedRevision,
  };
}
