import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CertificationService } from '../certification/certification.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { and, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  documentVersions,
  workingDocuments,
} from '../database/schema/documents.js';
import { projects } from '../database/schema/project.js';
import { DocumentContentService } from '../documents/document-content.service.js';
import { DocumentFamilyAccess } from '../documents/document-family-access.js';
import { DocumentReadBoundary } from '../documents/document-read-boundary.js';
import { ProjectService } from '../project/project.service.js';

/** Live native authority and association, acquired afresh in the caller's transaction. */
@Injectable()
export class DossierSourceAccess {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly projectService: ProjectService,
    private readonly boundary: DocumentReadBoundary,
    private readonly family: DocumentFamilyAccess,
    private readonly content: DocumentContentService,
    private readonly certification: CertificationService,
    private readonly clients: ClientOperationalReferenceService,
  ) {}

  async project(actor: ActorContext, projectId: string, write: boolean) {
    const { companyId } = await this.authorization.requirePermissions(actor, {
      permissions: write
        ? ['document.content.upload']
        : ['document.content.read'],
      lock: write,
      prerequisites: [
        ...(write
          ? [{ permissions: ['document.version.manage'] as const }]
          : []),
        { permissions: ['project.read'] },
        { permissions: ['document.read', 'document.reference.read'] },
        { permissions: ['document.content.read'] },
        { permissions: ['client.read'], workspaceAlternative: 'client.manage' },
      ],
    });
    const initialProject = await this.projectService.read(actor, projectId);
    if (initialProject.companyId !== companyId) throw new NotFoundException();
    if (!write) return initialProject;
    const lockKey = JSON.stringify([
      'dossier-analysis-project',
      actor.workspaceId,
      companyId,
      projectId,
    ]);
    await this.database.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
    await this.clients.lockReadableProjectReferences(actor, [
      initialProject.clientAccountId,
    ]);
    const [locked] = await this.database.connection
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, actor.workspaceId),
          eq(projects.companyId, companyId),
          eq(projects.id, projectId),
        ),
      )
      .for('share');
    if (!locked) throw new NotFoundException();
    const project = await this.projectService.read(actor, projectId);
    if (
      project.companyId !== companyId ||
      project.clientAccountId !== initialProject.clientAccountId
    )
      throw new NotFoundException();
    return project;
  }

  private async visible<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ForbiddenException) throw new NotFoundException();
      throw error;
    }
  }

  /** Reuse the native Document row within the inventory's read snapshot. */
  async inventoryDocument(
    actor: ActorContext,
    project: { companyId: string; clientAccountId: string },
    documentId: string,
  ) {
    const document = await this.readableDocument(actor, documentId, false);
    if (
      document.companyId !== project.companyId ||
      document.clientId !== project.clientAccountId
    )
      throw new NotFoundException();
    return document;
  }

  private async readableDocument(
    actor: ActorContext,
    documentId: string,
    lock: boolean,
  ) {
    const { document } = await this.visible(() =>
      this.boundary.requireVisible(actor, documentId, { lockFamily: lock }),
    );
    await this.visible(() =>
      this.family.requireFamilyAccess(actor, document.type, 'content-read', {
        lock,
      }),
    );
    return document;
  }

  async directDocument(
    actor: ActorContext,
    projectId: string,
    documentId: string,
    write: boolean,
  ) {
    const project = await this.project(actor, projectId, write);
    const visible = await this.readableDocument(actor, documentId, write);
    const query = this.database.connection
      .select()
      .from(workingDocuments)
      .where(
        and(
          eq(workingDocuments.workspaceId, actor.workspaceId),
          eq(workingDocuments.companyId, project.companyId),
          eq(workingDocuments.id, documentId),
        ),
      );
    const [document] = write ? await query.for('share') : await query;
    if (
      !document ||
      document.projectId !== projectId ||
      document.clientId !== project.clientAccountId ||
      document.type !== visible.type
    )
      throw new NotFoundException();
    return document;
  }

  async caseAttachmentsWithinTransaction(
    actor: ActorContext,
    projectId: string,
    write: boolean,
  ) {
    try {
      return await this.certification.dossierDocumentsWithinTransaction({
        actor,
        projectId,
        lock: write,
      });
    } catch (error) {
      if (error instanceof ForbiddenException) throw new NotFoundException();
      throw error;
    }
  }

  async direct(
    actor: ActorContext,
    input: {
      projectId: string;
      documentId: string;
      versionId: string;
      representationId: string | null;
      caseId: string | null;
      attachmentId: string | null;
      write: boolean;
      caseAttachments?: Awaited<
        ReturnType<CertificationService['dossierDocumentsWithinTransaction']>
      >;
    },
  ) {
    const project = await this.project(actor, input.projectId, input.write);
    const visible = await this.readableDocument(
      actor,
      input.documentId,
      input.write,
    );
    const documentQuery = this.database.connection
      .select()
      .from(workingDocuments)
      .where(
        and(
          eq(workingDocuments.workspaceId, actor.workspaceId),
          eq(workingDocuments.companyId, project.companyId),
          eq(workingDocuments.id, input.documentId),
        ),
      );
    const [document] = input.write
      ? await documentQuery.for('share')
      : await documentQuery;
    if (
      !document ||
      document.type !== visible.type ||
      document.clientId !== project.clientAccountId
    )
      throw new NotFoundException();
    let caseRevision: number | null = null;
    if (input.caseId === null && input.attachmentId === null) {
      if (document.projectId !== project.id) throw new NotFoundException();
    } else {
      try {
        const rows =
          input.caseAttachments ??
          (await this.caseAttachmentsWithinTransaction(
            actor,
            input.projectId,
            input.write,
          ));
        const attachment = rows.find(
          (row) =>
            row.caseId === input.caseId &&
            row.id === input.attachmentId &&
            row.documentId === document.id &&
            row.versionId === input.versionId &&
            (input.representationId === null ||
              row.representationId === input.representationId),
        );
        if (!attachment) throw new NotFoundException();
        caseRevision = attachment.currentCaseRevision;
      } catch (error) {
        if (error instanceof ForbiddenException) throw new NotFoundException();
        throw error;
      }
    }
    const versionQuery = this.database.connection
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.workspaceId, actor.workspaceId),
          eq(documentVersions.companyId, project.companyId),
          eq(documentVersions.documentId, document.id),
          eq(documentVersions.id, input.versionId),
        ),
      );
    const [version] = input.write
      ? await versionQuery.for('share')
      : await versionQuery;
    if (!version) throw new NotFoundException();
    const representationId = input.representationId;
    const pdf =
      representationId === null
        ? null
        : await this.visible(() =>
            this.content.downloadWithinReadTransaction(actor, {
              documentId: document.id,
              versionId: version.id,
              representationId,
            }),
          );
    return { project, document, version, pdf, caseRevision };
  }
}
