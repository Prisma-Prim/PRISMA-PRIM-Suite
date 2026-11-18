import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  workingDocuments,
  documentVersions,
} from '../database/schema/documents.js';
import { documentPdfs } from '../database/schema/document-pdfs.js';
import { CertificationService } from '../certification/certification.service.js';
import { DossierSourceAccess } from './source-access.js';

/** Inventory only emits tuples for which all current native read checks succeed. */
@Injectable()
export class DossierInventoryService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: DossierSourceAccess,
    private readonly certification: CertificationService,
    private readonly authorization: CompanyContextAuthorization,
  ) {}

  async listWithinTransaction(
    actor: ActorContext,
    projectId: string,
    write: boolean,
  ) {
    const project = await this.access.project(actor, projectId, write);
    const types: (
      'questionnaire' | 'mission-deliverable' | 'received-contract'
    )[] = ['questionnaire'];
    if (
      await this.authorization.hasPermissions(actor, {
        permissions: ['document.mission_deliverable.access'],
        lock: write,
      })
    )
      types.push('mission-deliverable');
    if (
      await this.authorization.hasPermissions(actor, {
        permissions: ['document.received_contract.access'],
        lock: write,
      })
    )
      types.push('received-contract');
    const direct = await this.database.connection
      .select({
        documentId: workingDocuments.id,
        versionId: documentVersions.id,
        representationId: documentPdfs.id,
        fileName: documentPdfs.fileName,
      })
      .from(workingDocuments)
      .leftJoin(
        documentVersions,
        and(
          eq(documentVersions.workspaceId, workingDocuments.workspaceId),
          eq(documentVersions.companyId, workingDocuments.companyId),
          eq(documentVersions.documentId, workingDocuments.id),
        ),
      )
      .leftJoin(
        documentPdfs,
        and(
          eq(documentPdfs.workspaceId, documentVersions.workspaceId),
          eq(documentPdfs.companyId, documentVersions.companyId),
          eq(documentPdfs.documentId, documentVersions.documentId),
          eq(documentPdfs.versionId, documentVersions.id),
        ),
      )
      .where(
        and(
          eq(workingDocuments.workspaceId, actor.workspaceId),
          eq(workingDocuments.companyId, project.companyId),
          eq(workingDocuments.projectId, projectId),
          inArray(workingDocuments.type, types),
          eq(workingDocuments.clientId, project.clientAccountId),
        ),
      )
      .limit(1001);
    // Do not return a partial register as a complete one.
    if (direct.length > 1000)
      throw new ServiceUnavailableException(
        'The Project evidence inventory is unavailable.',
      );
    let attached: Awaited<
      ReturnType<CertificationService['dossierDocumentsWithinTransaction']>
    > = [];
    try {
      attached = await this.certification.dossierDocumentsWithinTransaction({
        actor,
        projectId,
        lock: write,
      });
    } catch (error) {
      if (!(error instanceof ForbiddenException)) throw error;
    }
    const documents = new Map<string, { documentId: string; title: string }>();
    for (const documentId of new Set(direct.map((row) => row.documentId))) {
      try {
        const document = await this.access.directDocument(
          actor,
          projectId,
          documentId,
          write,
        );
        documents.set(document.id, {
          documentId: document.id,
          title: document.title,
        });
      } catch (error) {
        if (
          !(error instanceof NotFoundException) &&
          !(error instanceof ForbiddenException)
        )
          throw error;
      }
    }
    const tuples = [
      ...direct
        .filter((row) => row.versionId !== null)
        .map((row) => ({ ...row, caseId: null, attachmentId: null })),
      ...attached.map((row) => ({
        documentId: row.documentId,
        versionId: row.versionId,
        representationId: row.representationId,
        fileName: row.fileName,
        caseId: row.caseId,
        attachmentId: row.id,
      })),
    ];
    const items: {
      documentId: string;
      documentTitle: string;
      documentType: string;
      documentVersionId: string;
      versionNumber: number;
      versionStatus: 'draft' | 'official' | 'superseded';
      representationId: string | null;
      fileName: string | null;
      kind: 'pdf' | 'docx';
      caseId: string | null;
      attachmentId: string | null;
    }[] = [];
    const seen = new Set<string>();
    for (const tuple of tuples) {
      if (!tuple.versionId) continue;
      try {
        const live = await this.access.direct(actor, {
          projectId,
          documentId: tuple.documentId,
          versionId: tuple.versionId,
          representationId: null,
          caseId: tuple.caseId,
          attachmentId: tuple.attachmentId,
          write,
          ...(tuple.caseId === null ? {} : { caseAttachments: attached }),
        });
        documents.set(live.document.id, {
          documentId: live.document.id,
          title: live.document.title,
        });
        const common = {
          documentId: live.document.id,
          documentTitle: live.document.title,
          documentType: live.document.type,
          documentVersionId: live.version.id,
          versionNumber: live.version.number,
          versionStatus: live.version.status,
          caseId: tuple.caseId,
          attachmentId: tuple.attachmentId,
        };
        const docxKey = JSON.stringify([
          common.documentId,
          common.documentVersionId,
          common.caseId,
          common.attachmentId,
          'docx',
        ]);
        if (!seen.has(docxKey)) {
          seen.add(docxKey);
          items.push({
            ...common,
            representationId: null,
            fileName: null,
            kind: 'docx',
          });
        }
        if (tuple.fileName && tuple.representationId)
          items.push({
            ...common,
            representationId: tuple.representationId,
            fileName: tuple.fileName,
            kind: 'pdf',
          });
      } catch (error) {
        if (
          !(error instanceof NotFoundException) &&
          !(error instanceof ForbiddenException)
        )
          throw error;
      }
    }
    if (items.length > 1000)
      throw new ServiceUnavailableException(
        'The Project evidence inventory is unavailable.',
      );
    return {
      items,
      documents: [...documents.values()].sort((a, b) =>
        a.documentId.localeCompare(b.documentId),
      ),
    };
  }
}
