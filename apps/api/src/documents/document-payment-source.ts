import {
  documentVersionPdfQuery,
  frozenDocumentPdfPredicate,
} from './document-version-pdf-query.js';
import {
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientAccounts,
  clientCompanyRelationships,
  documentPdfs,
  documentVersions,
  workingDocuments,
  paymentEvidenceDocumentSources,
} from '../database/schema/index.js';
import { paymentSnapshot } from '../payment/payment.representation.js';
import type { PaymentSource } from '../payment/payment.input.js';
import type {
  PaymentClient,
  PaymentContent,
  PaymentLiveSource,
  PaymentSelectable,
  PaymentSourceSnapshot,
} from '../payment/payment.types.js';
import { DocumentReadBoundary } from './document-read-boundary.js';
import { DocumentContentService } from './document-content.service.js';

/** Exact Payment Evidence participant. The caller owns its transaction and action authority. */
@Injectable()
export class DocumentPaymentSource {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: CompanyContextAuthorization,
    private readonly clients: ClientOperationalReferenceService,
    private readonly boundary: DocumentReadBoundary,
    private readonly content: DocumentContentService,
  ) {}

  async requireAuthority(
    actor: ActorContext,
    source?: PaymentSource,
    action?: 'record' | 'confirm',
  ) {
    if (
      !(await this.access.hasPaymentEvidenceAccess(actor, {
        manage: false,
        lockAssignment: true,
        paymentObservationAction: action,
      }))
    )
      throw new ForbiddenException();
    await this.access.requirePaymentEvidenceNativeAccess(actor, {
      action: 'content-read',
      lockAssignment: true,
    });
    await this.clients.requireCapturedReferenceReadAuthorityWithinTransaction(
      actor,
    );
    if (source && action) {
      // The caller has locked its action role, which also grants payment.read.
      // Qualify the exact original Source without selecting an unrelated Reader.
      await this.inspect(actor, source, false);
    } else if (source) {
      const visible = await this.boundary.requireVisible(
        actor,
        source.documentId,
      );
      if (visible.document.type !== 'payment-evidence')
        throw new NotFoundException();
      await this.inspect(actor, source, false);
      await this.download(actor, source);
    }
    const c = actor.activeCompany;
    if (!c) throw new ForbiddenException();
    return {
      family: c.paymentGrants?.find(
        (g) => g.bundle === 'company_payment_evidence_access',
      ),
      context: c.paymentEvidenceContextCapture,
      reference: c.paymentEvidenceReferenceReadCapture,
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
      identity: c.clientPermissionAssignmentId
        ? {
            assignmentId: c.clientPermissionAssignmentId,
            bundle: 'company_director_client_access',
            version: c.clientPermissionSetVersion,
          }
        : null,
      client: actor.workspacePermissions.includes('client.manage')
        ? null
        : {
            assignmentId: c.clientPermissionAssignmentId,
            bundle: 'company_director_client_access',
            version: c.clientPermissionSetVersion,
          },
    };
  }
  async requireFreshCopyAuthority(actor: ActorContext) {
    if (
      !(await this.access.hasPermissions(actor, {
        permissions: ['client.read'],
        lock: true,
      }))
    )
      throw new ForbiddenException();
  }
  async inspect(
    actor: ActorContext,
    source: PaymentSource,
    newUse: boolean,
  ): Promise<PaymentSourceSnapshot> {
    if (!actor.activeCompany) throw new ForbiddenException();
    const result = await this.database.connection.execute<{
      snapshot: unknown;
    }>(
      sql`SELECT documents_payment_source(${actor.workspaceId}::uuid,${actor.activeCompany.id}::uuid,${JSON.stringify(source)}::jsonb,${newUse}) AS snapshot`,
    );
    return paymentSnapshot(result.rows[0]?.snapshot);
  }
  async selectable(actor: ActorContext, after?: PaymentSource) {
    await this.requireAuthority(actor);
    await this.requireFreshCopyAuthority(actor);
    const c = actor.activeCompany;
    if (!c) throw new ForbiddenException();
    // Eligibility is completely applied before the page bound; no hidden first-N truncation.
    const result = await documentVersionPdfQuery(
      this.database.connection
        .select({
          snapshot: sql<unknown>`jsonb_build_object('source',jsonb_build_object('documentId',${workingDocuments.id},'documentVersionId',${documentVersions.id},'representationId',${documentPdfs.id}),'originalClientId',${workingDocuments.clientId},'payerAdditionalId',${paymentEvidenceDocumentSources.payerLegalEntityId},'byteLength',${documentPdfs.size},'sha256',${documentPdfs.sha256},'copiedContext',jsonb_build_object('companyLabel',${paymentEvidenceDocumentSources.receivingCompanyLabel},'payer',jsonb_build_object('kind',${paymentEvidenceDocumentSources.payerKind},'legalName',${paymentEvidenceDocumentSources.payerLegalName},'taxId',${paymentEvidenceDocumentSources.payerTaxId},'legalAddress',${paymentEvidenceDocumentSources.payerLegalAddress})))`,
          documentTitle: sql<string>`coalesce(${documentVersions.frozenTitle},${workingDocuments.title})`,
          versionNumber: documentVersions.number,
          versionState: documentVersions.status,
          fileName: documentPdfs.fileName,
        })
        .from(workingDocuments)
        .$dynamic(),
    )
      .innerJoin(
        paymentEvidenceDocumentSources,
        sql`(${paymentEvidenceDocumentSources.workspaceId},${paymentEvidenceDocumentSources.companyId},${paymentEvidenceDocumentSources.documentId})=(${workingDocuments.workspaceId},${workingDocuments.companyId},${workingDocuments.id})`,
      )
      .innerJoin(
        clientAccounts,
        sql`(${clientAccounts.workspaceId},${clientAccounts.id})=(${workingDocuments.workspaceId},${workingDocuments.clientId})`,
      )
      .innerJoin(
        clientCompanyRelationships,
        sql`(${clientCompanyRelationships.workspaceId},${clientCompanyRelationships.companyId},${clientCompanyRelationships.clientAccountId})=(${workingDocuments.workspaceId},${workingDocuments.companyId},${workingDocuments.clientId})`,
      )
      .where(
        sql`${workingDocuments.workspaceId}=${actor.workspaceId}::uuid AND ${workingDocuments.companyId}=${c.id}::uuid AND ${workingDocuments.type}='payment-evidence' AND ${workingDocuments.confidentiality}='company-confidential'
      AND ${paymentEvidenceDocumentSources.originalClientAccountId}=${workingDocuments.clientId} AND ${clientAccounts.status}='active' AND ${clientAccounts.version}<2147483647 AND ${clientCompanyRelationships.status}='active'
      AND ${frozenDocumentPdfPredicate()}
      ${after ? sql`AND (${workingDocuments.id},${documentVersions.id},${documentPdfs.id})>(${after.documentId}::uuid,${after.documentVersionId}::uuid,${after.representationId}::uuid)` : sql``}`,
      )
      .orderBy(workingDocuments.id, documentVersions.id, documentPdfs.id)
      .limit(26);
    const items: PaymentSelectable[] = [];
    for (const candidate of result.slice(0, 25)) {
      // This read-only snapshot already qualifies each original Client, exact
      // tuple and clean PDF before LIMIT. Shared native grants are locked above;
      // no per-row detail/projection reads or mutation/new-use locks are needed.
      const snapshot = paymentSnapshot(candidate.snapshot);
      if (candidate.versionState === 'draft')
        throw new Error('Invalid frozen payment source.');
      items.push({
        source: snapshot.source,
        documentTitle: candidate.documentTitle,
        versionNumber: candidate.versionNumber,
        versionState: candidate.versionState,
        fileName: candidate.fileName,
        byteLength: snapshot.byteLength,
        sha256: snapshot.sha256,
        copiedContext: snapshot.copiedContext,
      });
    }
    return { items, hasMore: result.length > 25 };
  }
  async project(actor: ActorContext, snapshot: PaymentSourceSnapshot) {
    let liveSource: PaymentLiveSource = { kind: 'UNAVAILABLE' },
      client: PaymentClient = { kind: 'UNAVAILABLE' };
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
        let content: PaymentContent = { kind: 'UNAVAILABLE' };
        try {
          await this.access.requirePaymentEvidenceNativeAccess(actor, {
            action: 'content-read',
            lockAssignment: false,
          });
          const [p] = await this.database.connection
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
                eq(documentPdfs.versionId, v.id),
                eq(documentPdfs.id, snapshot.source.representationId),
              ),
            );
          if (
            p &&
            p.size === snapshot.byteLength &&
            p.sha256 === snapshot.sha256
          )
            content = {
              kind: 'AVAILABLE',
              representationId: snapshot.source.representationId,
              fileName: p.fileName,
              byteLength: p.size,
              sha256: p.sha256,
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
    try {
      await this.clients.requireReferenceReadAuthorityWithinReadTransaction(
        actor,
      );
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
    return { liveSource, client };
  }
  download(actor: ActorContext, source: PaymentSource) {
    return this.content.downloadWithinReadTransaction(actor, {
      documentId: source.documentId,
      versionId: source.documentVersionId,
      representationId: source.representationId,
    });
  }
}
function unavailable(e: unknown) {
  return e instanceof HttpException && [403, 404].includes(e.getStatus());
}
