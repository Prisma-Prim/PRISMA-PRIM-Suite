import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  documentPdfs,
  documentVersions,
  workingDocuments,
} from '../database/schema/index.js';
import { requireDocumentPermission } from './document-read-boundary.js';

export interface TaskResultDocumentContext {
  companyId: string;
  projectId: string;
  clientAccountId: string;
}
export interface TaskResultDocumentReference {
  documentId: string;
  versionId: string;
  versionNumber: number;
  title: string;
  status: 'official' | 'superseded';
  representationId: string;
}

/** Documents owns qualification; no Task caller receives storage rows or bytes. */
@Injectable()
export class DocumentTaskResultReferenceService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly clients: ClientOperationalReferenceService,
  ) {}

  async eligible(input: {
    actor: ActorContext;
    context: TaskResultDocumentContext;
  }): Promise<TaskResultDocumentReference[]> {
    await this.requireRead({ ...input, lock: false });
    const rows = await this.database.connection
      .select({
        documentId: workingDocuments.id,
        versionId: documentVersions.id,
      })
      .from(workingDocuments)
      .innerJoin(
        documentVersions,
        and(
          eq(documentVersions.workspaceId, workingDocuments.workspaceId),
          eq(documentVersions.companyId, workingDocuments.companyId),
          eq(documentVersions.documentId, workingDocuments.id),
        ),
      )
      .where(
        and(
          eq(workingDocuments.workspaceId, input.actor.workspaceId),
          eq(workingDocuments.companyId, input.context.companyId),
          eq(workingDocuments.clientId, input.context.clientAccountId),
          eq(workingDocuments.projectId, input.context.projectId),
          eq(workingDocuments.type, 'mission-deliverable'),
          inArray(documentVersions.status, ['official', 'superseded']),
        ),
      )
      .orderBy(
        asc(workingDocuments.createdAt),
        asc(workingDocuments.id),
        desc(documentVersions.number),
      );
    const versions: TaskResultDocumentReference[] = [];
    for (const row of rows)
      versions.push(
        await this.exact({
          ...input,
          ...row,
          reference: { kind: 'eligible', lock: false },
        }),
      );
    return versions;
  }

  async requireRead(input: {
    actor: ActorContext;
    context: TaskResultDocumentContext;
    lock: boolean;
  }): Promise<void> {
    if (
      requireDocumentPermission(input.actor, 'document.read') !==
      input.context.companyId
    )
      throw new NotFoundException();
    await this.authorization.requireDocumentAccess(input.actor, input.lock);
    await this.clients.readReferenceClient(
      input.actor,
      input.context.clientAccountId,
    );
    if (
      !(await this.authorization.hasMissionDeliverableAccess(input.actor, {
        lockAssignment: input.lock,
      })) ||
      !(await this.authorization.hasDocumentContentRead(input.actor))
    )
      throw new NotFoundException();
    if (input.lock)
      await this.authorization.requireDocumentContentRead(input.actor);
  }

  async exact(input: {
    actor: ActorContext;
    context: TaskResultDocumentContext;
    documentId: string;
    versionId: string;
    reference:
      | { kind: 'eligible'; lock: boolean }
      | { kind: 'declared'; representationId: string };
  }): Promise<TaskResultDocumentReference> {
    const lock = input.reference.kind === 'eligible' && input.reference.lock;
    await this.requireRead({
      actor: input.actor,
      context: input.context,
      lock,
    });
    const query = this.database.connection
      .select({
        id: workingDocuments.id,
        projectId: workingDocuments.projectId,
      })
      .from(workingDocuments)
      .where(
        and(
          eq(workingDocuments.workspaceId, input.actor.workspaceId),
          eq(workingDocuments.companyId, input.context.companyId),
          eq(workingDocuments.clientId, input.context.clientAccountId),
          eq(workingDocuments.type, 'mission-deliverable'),
          eq(workingDocuments.id, input.documentId),
        ),
      );
    const [document] = lock ? await query.for('share') : await query;
    if (
      !document ||
      (input.reference.kind === 'eligible' &&
        document.projectId !== input.context.projectId)
    )
      throw new NotFoundException();
    const [version] = await this.database.connection
      .select({
        id: documentVersions.id,
        number: documentVersions.number,
        title: documentVersions.frozenTitle,
        status: documentVersions.status,
      })
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.workspaceId, input.actor.workspaceId),
          eq(documentVersions.companyId, input.context.companyId),
          eq(documentVersions.documentId, input.documentId),
          eq(documentVersions.id, input.versionId),
        ),
      );
    if (
      !version ||
      (version.status !== 'official' && version.status !== 'superseded') ||
      version.title === null
    )
      throw new NotFoundException();
    const [pdf] = await this.database.connection
      .select({ id: documentPdfs.id })
      .from(documentPdfs)
      .where(
        and(
          eq(documentPdfs.workspaceId, input.actor.workspaceId),
          eq(documentPdfs.companyId, input.context.companyId),
          eq(documentPdfs.documentId, input.documentId),
          eq(documentPdfs.versionId, input.versionId),
          eq(documentPdfs.scanOutcome, 'clean'),
        ),
      )
      .orderBy(desc(documentPdfs.uploadRevision))
      .limit(1);
    if (
      !pdf ||
      (input.reference.kind === 'declared' &&
        pdf.id !== input.reference.representationId)
    )
      throw new NotFoundException();
    return {
      documentId: document.id,
      versionId: version.id,
      versionNumber: version.number,
      title: version.title,
      status: version.status,
      representationId: pdf.id,
    };
  }
}
