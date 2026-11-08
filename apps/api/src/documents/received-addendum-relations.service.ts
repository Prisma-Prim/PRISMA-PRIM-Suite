import { ForbiddenException, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { ContractReceivedAddendumReferenceService } from '../contract/contract-received-addendum-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  receivedAddendumDocumentRelations,
  workingDocuments,
} from '../database/schema/index.js';
import type {
  ReceivedAddendumRelationView,
  readReceivedAddendumRegistration,
} from './received-addendum.js';
import {
  readRecordedRecipient,
  receivedSourceAttribution,
  receivedSourceAttributionView,
  recordedRecipientColumns,
} from './received-source-registration.js';

/** Owns immutable received Addendum context within its caller's transaction. */
@Injectable()
export class ReceivedAddendumRelationsService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly contracts: ContractReceivedAddendumReferenceService,
    private readonly authorization: CompanyContextAuthorization,
  ) {}
  async requireRegistrationAuthority(actor: ActorContext) {
    if (
      !(await this.authorization.hasReceivedAddendumAccess(actor, {
        lockAssignment: true,
      }))
    )
      throw new ForbiddenException();
    await this.authorization.requireReceivedAddendumNativeAccess(actor, {
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
    command: ReturnType<typeof readReceivedAddendumRegistration>,
  ) {
    return this.contracts.qualifyNewRelationWithinTransaction({
      actor,
      selection: command.selection,
    });
  }
  async attach(input: {
    actor: ActorContext;
    document: typeof workingDocuments.$inferSelect;
    command: ReturnType<typeof readReceivedAddendumRegistration>;
    reference: Awaited<ReturnType<ReceivedAddendumRelationsService['qualify']>>;
  }) {
    const { actor, document, command, reference } = input;
    const party = reference.recordedRecipient;
    await this.database.connection
      .insert(receivedAddendumDocumentRelations)
      .values({
        documentId: document.id,
        workspaceId: document.workspaceId,
        companyId: document.companyId,
        opportunityId: reference.opportunityId,
        contractId: command.selection.parentContractId,
        contractVersionId: command.selection.parentContractVersionId,
        initialTitle: command.title,
        initialPurpose: command.purpose,
        contractVersionNumber: reference.contractVersionNumber,
        illustrativeReference: reference.illustrativeReference,
        ...recordedRecipientColumns(party),
        ...receivedSourceAttribution(actor, document, command),
      });
  }
  async read(
    actor: ActorContext,
    document: typeof workingDocuments.$inferSelect,
  ): Promise<ReceivedAddendumRelationView> {
    const [relation] = await this.database.connection
      .select()
      .from(receivedAddendumDocumentRelations)
      .where(
        and(
          eq(
            receivedAddendumDocumentRelations.workspaceId,
            document.workspaceId,
          ),
          eq(receivedAddendumDocumentRelations.companyId, document.companyId),
          eq(receivedAddendumDocumentRelations.documentId, document.id),
        ),
      );
    if (!relation)
      throw new Error('Missing received Addendum source relation.');
    if (
      !(await this.contracts.mayReadRelationWithinTransaction({
        actor,
        selection: {
          parentContractId: relation.contractId,
          parentContractVersionId: relation.contractVersionId,
        },
      }))
    )
      return { access: 'denied' };
    const recordedRecipient = readRecordedRecipient(
      relation,
      'Invalid conserved received Addendum party.',
    );
    return {
      access: 'granted',
      opportunityId: relation.opportunityId,
      parentContractId: relation.contractId,
      parentContractVersionId: relation.contractVersionId,
      contractVersionNumber: relation.contractVersionNumber,
      illustrativeReference: relation.illustrativeReference,
      recordedRecipient,
      ...receivedSourceAttributionView(relation),
    };
  }
}
