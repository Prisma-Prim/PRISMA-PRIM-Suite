import { ForbiddenException, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import {
  ContractExternalInvoiceReferenceService,
  type ExternalInvoiceRecordedRecipient,
} from '../contract/contract-external-invoice-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  externalInvoiceDocumentRelations,
  workingDocuments,
} from '../database/schema/index.js';
import type {
  ExternalInvoiceRelationView,
  readExternalInvoiceRegistration,
} from './external-invoice.js';

/** Owns immutable financial Document context within its caller's transaction. */
@Injectable()
export class ExternalInvoiceRelationsService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly contracts: ContractExternalInvoiceReferenceService,
    private readonly authorization: CompanyContextAuthorization,
  ) {}
  async requireRegistrationAuthority(actor: ActorContext) {
    if (
      !(await this.authorization.hasExternalInvoiceAccess(actor, {
        manage: true,
        lockAssignment: true,
      }))
    )
      throw new ForbiddenException();
    await this.authorization.requireExternalInvoiceNativeAccess(actor, {
      action: 'register',
      lockAssignment: true,
    });
    await this.contracts.requireReadAuthority(actor, true);
  }
  selectableVersions(actor: ActorContext, query: unknown) {
    return this.contracts.selectableVersionsWithinTransaction(actor, query);
  }
  qualify(
    actor: ActorContext,
    command: ReturnType<typeof readExternalInvoiceRegistration>,
  ) {
    return this.contracts.qualifyNewRelationWithinTransaction({
      actor,
      selection: command.selection,
    });
  }
  async attach(input: {
    actor: ActorContext;
    document: typeof workingDocuments.$inferSelect;
    command: ReturnType<typeof readExternalInvoiceRegistration>;
    reference: Awaited<ReturnType<ExternalInvoiceRelationsService['qualify']>>;
  }) {
    const { actor, document, command, reference } = input;
    const party = reference.recordedRecipient;
    await this.database.connection
      .insert(externalInvoiceDocumentRelations)
      .values({
        documentId: document.id,
        workspaceId: document.workspaceId,
        companyId: document.companyId,
        ...command.selection,
        contractVersionNumber: reference.contractVersionNumber,
        illustrativeReference: reference.illustrativeReference,
        recipientKind: party.kind,
        recipientAdditionalLegalEntityId:
          party.kind === 'ADDITIONAL' ? party.additionalLegalEntityId : null,
        recipientLegalName: party.legalName,
        recipientTaxId: party.taxId,
        recipientLegalAddress: party.legalAddress,
        sourceDescription: command.sourceDescription,
        receivedOn: command.receivedOn,
        registeredByMembershipId: actor.workspaceMembershipId,
        registeredByInternalUserId: actor.internalUserId,
        registeredAt: sql`(SELECT created_at FROM working_documents WHERE id=${document.id} AND workspace_id=${document.workspaceId} AND company_id=${document.companyId})`,
      });
  }
  async read(
    actor: ActorContext,
    document: typeof workingDocuments.$inferSelect,
  ): Promise<ExternalInvoiceRelationView> {
    const [relation] = await this.database.connection
      .select()
      .from(externalInvoiceDocumentRelations)
      .where(
        and(
          eq(
            externalInvoiceDocumentRelations.workspaceId,
            document.workspaceId,
          ),
          eq(externalInvoiceDocumentRelations.companyId, document.companyId),
          eq(externalInvoiceDocumentRelations.documentId, document.id),
        ),
      );
    if (!relation) throw new Error('Missing external invoice source relation.');
    if (
      !(await this.contracts.mayReadRelationWithinTransaction({
        actor,
        selection: relation,
      }))
    )
      return { access: 'denied' };
    const recordedRecipient: ExternalInvoiceRecordedRecipient =
      relation.recipientKind === 'PRIMARY'
        ? {
            kind: 'PRIMARY',
            legalName: relation.recipientLegalName,
            taxId: relation.recipientTaxId,
            legalAddress: relation.recipientLegalAddress,
          }
        : additionalRecipient(relation);
    return {
      access: 'granted',
      opportunityId: relation.opportunityId,
      contractId: relation.contractId,
      contractVersionId: relation.contractVersionId,
      contractVersionNumber: relation.contractVersionNumber,
      illustrativeReference: relation.illustrativeReference,
      recordedRecipient,
      sourceDescription: relation.sourceDescription,
      receivedOn: relation.receivedOn,
      registeredAt: relation.registeredAt.toISOString(),
      registeredBy: {
        workspaceMembershipId: relation.registeredByMembershipId,
        internalUserId: relation.registeredByInternalUserId,
      },
    };
  }
}
function additionalRecipient(
  relation: typeof externalInvoiceDocumentRelations.$inferSelect,
): ExternalInvoiceRecordedRecipient {
  if (
    relation.recipientKind !== 'ADDITIONAL' ||
    !relation.recipientAdditionalLegalEntityId
  )
    throw new Error('Invalid conserved external invoice party.');
  return {
    kind: 'ADDITIONAL',
    additionalLegalEntityId: relation.recipientAdditionalLegalEntityId,
    legalName: relation.recipientLegalName,
    taxId: relation.recipientTaxId,
    legalAddress: relation.recipientLegalAddress,
  };
}
