import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { ContractExternalInvoiceReferenceService } from '../contract/contract-external-invoice-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  documentPdfs,
  documentVersions,
  externalInvoiceDocumentRelations,
  workingDocuments,
} from '../database/schema/index.js';
import { DocumentReadBoundary } from './document-read-boundary.js';
import { DocumentContentService } from './document-content.service.js';

export interface DocumentInvoiceTuple {
  documentId: string;
  documentVersionId: string;
  representationId: string;
}
export interface DocumentInvoiceCopy {
  companyLabel: string;
  contractReference: string;
  contractVersionNumber: number;
  receivingParty: {
    kind: 'PRIMARY' | 'ADDITIONAL';
    legalName: string;
    taxIdentifier: string | null;
    address: string | null;
  };
}
export interface DocumentInvoiceSnapshot {
  source: DocumentInvoiceTuple;
  originalClientId: string;
  opportunityId: string;
  contractId: string;
  contractVersionId: string;
  receivingPartyAdditionalId: string | null;
  byteLength: number;
  sha256: string;
  copiedContext: DocumentInvoiceCopy;
}
export type DocumentInvoiceContent =
  | { kind: 'UNAVAILABLE' }
  | {
      kind: 'AVAILABLE';
      representationId: string;
      fileName: string;
      byteLength: number;
      sha256: string;
    };
export type DocumentInvoiceLiveSource =
  | { kind: 'UNAVAILABLE' }
  | {
      kind: 'AVAILABLE';
      documentId: string;
      documentVersionId: string;
      title: string;
      versionNumber: number;
      versionState: 'official' | 'superseded';
      content: DocumentInvoiceContent;
    };
export interface DocumentInvoiceRelated {
  contract:
    | { kind: 'UNAVAILABLE' }
    | {
        kind: 'AVAILABLE';
        opportunityId: string;
        contractId: string;
        contractVersionId: string;
      };
  client:
    | { kind: 'UNAVAILABLE' }
    | { kind: 'AVAILABLE'; clientId: string; displayName: string };
}
export interface DocumentInvoiceSelectable {
  source: DocumentInvoiceTuple;
  documentTitle: string;
  versionNumber: number;
  versionState: 'official' | 'superseded';
  fileName: string;
  byteLength: number;
  sha256: string;
  copiedContext: DocumentInvoiceCopy;
}
/** Document owns source policy; every operation uses its caller's transaction. */
@Injectable()
export class DocumentInvoiceRecordSource {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: CompanyContextAuthorization,
    private readonly boundary: DocumentReadBoundary,
    private readonly contracts: ContractExternalInvoiceReferenceService,
    private readonly clients: ClientOperationalReferenceService,
    private readonly content: DocumentContentService,
  ) {}
  async requireAuthority(actor: ActorContext, tuple?: DocumentInvoiceTuple) {
    if (
      !(await this.access.hasExternalInvoiceAccess(actor, {
        manage: true,
        lockAssignment: true,
      }))
    )
      throw new ForbiddenException();
    await this.access.requireExternalInvoiceNativeAccess(actor, {
      action: 'content-read',
      lockAssignment: true,
    });
    await this.contracts.requireReadAuthority(actor, true);
    if (tuple) {
      const visible = await this.boundary.requireVisible(
        actor,
        tuple.documentId,
        { lockFamily: true },
      );
      if (visible.document.type !== 'external-invoice')
        throw new NotFoundException();
      await this.database.connection
        .select({ id: workingDocuments.id })
        .from(workingDocuments)
        .where(
          and(
            eq(workingDocuments.workspaceId, actor.workspaceId),
            eq(workingDocuments.companyId, visible.companyId),
            eq(workingDocuments.id, tuple.documentId),
          ),
        )
        .for('update');
    }
    return this.captures(actor);
  }
  private captures(actor: ActorContext) {
    const c = actor.activeCompany;
    if (!c) throw new ForbiddenException();
    const family = c.externalInvoiceGrants?.find(
      (g) => g.bundle === 'company_external_invoice_access',
    );
    const contract =
      c.contractPermissionAssignmentId &&
      (c.contractPermissionSetVersion === 'v1' ||
        c.contractPermissionSetVersion === 'v2')
        ? {
            assignmentId: c.contractPermissionAssignmentId,
            bundle: 'company_contract_preparer',
            version: c.contractPermissionSetVersion,
          }
        : {
            assignmentId: c.contractApproverAssignmentId,
            bundle: 'company_contract_approver',
            version: c.contractApproverPermissionSetVersion,
          };
    return {
      family: {
        assignmentId: family?.assignmentId,
        bundle: 'company_external_invoice_access',
        version: family?.permissionSetVersion,
      },
      registrar: {
        assignmentId: c.documentPermissionAssignmentId,
        bundle: 'company_document_registrar',
        version: c.documentPermissionSetVersion,
      },
      content: {
        assignmentId: c.documentContentReaderAssignmentId,
        bundle: 'company_document_content_reader',
        version: c.documentContentReaderPermissionSetVersion,
      },
      contract,
      intake: {
        assignmentId: c.commercialIntakePermissionAssignmentId,
        bundle: 'company_commercial_intake',
        version: c.commercialIntakePermissionSetVersion,
      },
      client: actor.workspacePermissions.includes('client.manage')
        ? null
        : {
            assignmentId: c.clientPermissionAssignmentId,
            bundle: 'company_director_client_access',
            version: c.clientPermissionSetVersion,
          },
    };
  }
  async qualify(
    actor: ActorContext,
    tuple: DocumentInvoiceTuple,
  ): Promise<DocumentInvoiceSnapshot> {
    const snapshot = await this.qualifyEligibility(actor, tuple);
    await this.download(actor, tuple);
    return snapshot;
  }
  async qualifyEligibility(
    actor: ActorContext,
    tuple: DocumentInvoiceTuple,
  ): Promise<DocumentInvoiceSnapshot> {
    const company = actor.activeCompany;
    if (!company) throw new ForbiddenException();
    const [relation] = await this.database.connection
      .select()
      .from(externalInvoiceDocumentRelations)
      .where(
        and(
          eq(externalInvoiceDocumentRelations.workspaceId, actor.workspaceId),
          eq(externalInvoiceDocumentRelations.companyId, company.id),
          eq(externalInvoiceDocumentRelations.documentId, tuple.documentId),
        ),
      );
    if (!relation) throw new NotFoundException();
    const reference = await this.contracts.qualifyNewRelationWithinTransaction({
      actor,
      selection: relation,
    });
    const [row] = await this.database.connection
      .select({
        document: workingDocuments,
        version: documentVersions,
        pdf: {
          id: documentPdfs.id,
          size: documentPdfs.size,
          sha256: documentPdfs.sha256,
        },
      })
      .from(workingDocuments)
      .innerJoin(
        documentVersions,
        and(
          eq(documentVersions.documentId, workingDocuments.id),
          eq(documentVersions.workspaceId, workingDocuments.workspaceId),
          eq(documentVersions.companyId, workingDocuments.companyId),
        ),
      )
      .innerJoin(
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
          eq(workingDocuments.companyId, company.id),
          eq(workingDocuments.id, tuple.documentId),
          eq(documentVersions.id, tuple.documentVersionId),
          eq(documentPdfs.id, tuple.representationId),
        ),
      )
      .for('share', { of: documentVersions });
    if (!row || row.document.type !== 'external-invoice')
      throw new NotFoundException();
    if (row.version.status === 'draft')
      throw new ConflictException({
        code: 'INVOICE_SOURCE_NOT_ELIGIBLE',
        message: 'Select an exact official or superseded financial source.',
      });
    return {
      source: tuple,
      originalClientId: reference.originalClientAccountId,
      opportunityId: relation.opportunityId,
      contractId: relation.contractId,
      contractVersionId: relation.contractVersionId,
      receivingPartyAdditionalId: relation.recipientAdditionalLegalEntityId,
      byteLength: row.pdf.size,
      sha256: row.pdf.sha256,
      copiedContext: {
        companyLabel: company.displayName,
        contractReference: String(reference.illustrativeReference),
        contractVersionNumber: reference.contractVersionNumber,
        receivingParty: {
          kind: reference.recordedRecipient.kind,
          legalName: reference.recordedRecipient.legalName,
          taxIdentifier: reference.recordedRecipient.taxId,
          address: reference.recordedRecipient.legalAddress,
        },
      },
    };
  }
  async selectable(
    actor: ActorContext,
    after?: DocumentInvoiceTuple,
  ): Promise<{ items: DocumentInvoiceSelectable[]; hasMore: boolean }> {
    const companyId = await this.access.requireExternalInvoiceNativeAccess(
      actor,
      { action: 'content-read', lockAssignment: true },
    );
    await this.requireAuthority(actor);
    const result = await this.database.connection.execute<{
      documentId: string;
      documentVersionId: string;
      representationId: string;
      documentTitle: string;
      versionNumber: number;
      versionState: 'official' | 'superseded';
      fileName: string;
      byteLength: number;
      sha256: string;
    }>(sql`
   SELECT d.id AS "documentId",v.id AS "documentVersionId",p.id AS "representationId",v.frozen_title AS "documentTitle",v.number AS "versionNumber",v.status AS "versionState",p.file_name AS "fileName",p.size AS "byteLength",p.sha256 FROM working_documents d JOIN document_versions v ON (v.workspace_id,v.company_id,v.document_id)=(d.workspace_id,d.company_id,d.id) JOIN document_pdfs p ON (p.workspace_id,p.company_id,p.document_id,p.version_id)=(v.workspace_id,v.company_id,v.document_id,v.id) JOIN external_invoice_document_relations r ON (r.workspace_id,r.company_id,r.document_id)=(d.workspace_id,d.company_id,d.id) JOIN contracts c ON (c.workspace_id,c.company_id,c.id)=(r.workspace_id,r.company_id,r.contract_id) JOIN contract_versions cv ON (cv.workspace_id,cv.company_id,cv.contract_id,cv.id)=(r.workspace_id,r.company_id,r.contract_id,r.contract_version_id) JOIN contract_signing_declarations sd ON (sd.workspace_id,sd.company_id,sd.contract_id,sd.contract_version_id)=(cv.workspace_id,cv.company_id,cv.contract_id,cv.id) JOIN client_accounts cl ON (cl.workspace_id,cl.id)=(d.workspace_id,d.client_id) JOIN client_company_relationships cr ON (cr.workspace_id,cr.company_id,cr.client_account_id)=(d.workspace_id,d.company_id,d.client_id)
   WHERE d.workspace_id=${actor.workspaceId}::uuid AND d.company_id=${companyId}::uuid AND d.type='external-invoice' AND v.status IN ('official','superseded') AND p.scan_outcome='clean' AND c.kind='CONTRACT' AND c.origin='COMPANY_MODEL_OFFER' AND cv.provenance='COMPANY_MODEL_OFFER' AND cv.decision_state='APPROVED' AND cv.execution_state='EXECUTED' AND cl.status='active' AND cr.status='active'
   ${after ? sql`AND (d.id,v.id,p.id)>(${after.documentId}::uuid,${after.documentVersionId}::uuid,${after.representationId}::uuid)` : sql``}
   ORDER BY d.id,v.id,p.id LIMIT 26`);
    const items = [];
    for (const row of result.rows.slice(0, 25)) {
      const source = {
        documentId: row.documentId,
        documentVersionId: row.documentVersionId,
        representationId: row.representationId,
      };
      const snapshot = await this.qualify(actor, source);
      items.push({
        source,
        documentTitle: row.documentTitle,
        versionNumber: row.versionNumber,
        versionState: row.versionState,
        fileName: row.fileName,
        byteLength: row.byteLength,
        sha256: row.sha256,
        copiedContext: snapshot.copiedContext,
      });
    }
    return { items, hasMore: result.rows.length > 25 };
  }
  async project(actor: ActorContext, snapshot: DocumentInvoiceSnapshot) {
    let liveSource: DocumentInvoiceLiveSource = { kind: 'UNAVAILABLE' };
    let contract: DocumentInvoiceRelated['contract'] = { kind: 'UNAVAILABLE' };
    let client: DocumentInvoiceRelated['client'] = { kind: 'UNAVAILABLE' };
    try {
      const visible = await this.boundary.requireVisible(
        actor,
        snapshot.source.documentId,
      );
      const [v] = await this.database.connection
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.workspaceId, actor.workspaceId),
            eq(documentVersions.companyId, visible.companyId),
            eq(documentVersions.documentId, snapshot.source.documentId),
            eq(documentVersions.id, snapshot.source.documentVersionId),
          ),
        );
      if (v && (v.status === 'official' || v.status === 'superseded')) {
        let content: DocumentInvoiceContent = { kind: 'UNAVAILABLE' };
        try {
          await this.access.requirePermissions(actor, {
            permissions: ['document.content.read'],
            lock: false,
            prerequisites: [
              { permissions: ['document.read', 'document.reference.read'] },
              {
                permissions: ['client.read'],
                workspaceAlternative: 'client.manage',
              },
            ],
          });
          await this.access.requireExternalInvoiceNativeAccess(actor, {
            action: 'content-read',
            lockAssignment: false,
          });
          const [pdf] = await this.database.connection
            .select({
              fileName: documentPdfs.fileName,
              size: documentPdfs.size,
              sha256: documentPdfs.sha256,
            })
            .from(documentPdfs)
            .where(
              and(
                eq(documentPdfs.workspaceId, actor.workspaceId),
                eq(documentPdfs.companyId, visible.companyId),
                eq(documentPdfs.documentId, snapshot.source.documentId),
                eq(documentPdfs.versionId, snapshot.source.documentVersionId),
                eq(documentPdfs.id, snapshot.source.representationId),
              ),
            );
          if (pdf)
            content = {
              kind: 'AVAILABLE',
              representationId: snapshot.source.representationId,
              fileName: pdf.fileName,
              byteLength: pdf.size,
              sha256: pdf.sha256,
            };
        } catch (e) {
          if (!unavailable(e)) throw e;
        }
        liveSource = {
          kind: 'AVAILABLE',
          documentId: snapshot.source.documentId,
          documentVersionId: v.id,
          title: v.frozenTitle ?? visible.document.title,
          versionNumber: v.number,
          versionState: v.status,
          content,
        };
      }
    } catch (e) {
      if (!unavailable(e)) throw e;
    }
    if (
      await this.contracts.mayReadRelationWithinTransaction({
        actor,
        selection: snapshot,
      })
    )
      contract = {
        kind: 'AVAILABLE',
        opportunityId: snapshot.opportunityId,
        contractId: snapshot.contractId,
        contractVersionId: snapshot.contractVersionId,
      };
    try {
      const c = await this.clients.readReferenceClient(
        actor,
        snapshot.originalClientId,
      );
      client = {
        kind: 'AVAILABLE',
        clientId: c.id,
        displayName: c.displayName,
      };
    } catch (e) {
      if (!unavailable(e)) throw e;
    }
    return { liveSource, related: { contract, client } };
  }
  download(actor: ActorContext, source: DocumentInvoiceTuple) {
    return this.content.downloadWithinReadTransaction(actor, {
      documentId: source.documentId,
      versionId: source.documentVersionId,
      representationId: source.representationId,
    });
  }
}
function unavailable(e: unknown) {
  return e instanceof ForbiddenException || e instanceof NotFoundException;
}
