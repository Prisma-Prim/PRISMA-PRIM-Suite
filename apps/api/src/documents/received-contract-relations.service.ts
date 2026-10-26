import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { ContractDocumentReferenceService } from '../contract/contract-document-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  receivedContractDocumentRelations,
  workingDocuments,
} from '../database/schema/index.js';
import type {
  ReceivedContractRelationView,
  readReceivedContractRegistration,
} from './received-contract.js';

/** Joins the Document caller's transaction; owns no independent transaction. */
@Injectable()
export class ReceivedContractRelationsService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly contracts: ContractDocumentReferenceService,
  ) {}
  requireReadAuthority(actor: ActorContext) {
    return this.contracts.requireReadAuthority(actor, true);
  }
  selectableVersions(actor: ActorContext, query: unknown) {
    return this.contracts.selectableVersionsWithinTransaction(actor, query);
  }
  qualify(
    actor: ActorContext,
    command: ReturnType<typeof readReceivedContractRegistration>,
  ) {
    return this.contracts.qualifyNewRelationWithinTransaction({
      actor,
      selection: command.selection,
    });
  }
  async attach(input: {
    actor: ActorContext;
    document: typeof workingDocuments.$inferSelect;
    command: ReturnType<typeof readReceivedContractRegistration>;
    reference: Awaited<ReturnType<ReceivedContractRelationsService['qualify']>>;
  }) {
    const { actor, document, command, reference } = input;
    await this.database.connection
      .insert(receivedContractDocumentRelations)
      .values({
        documentId: document.id,
        workspaceId: document.workspaceId,
        companyId: document.companyId,
        ...command.selection,
        contractVersionNumber: reference.contractVersionNumber,
        illustrativeReference: reference.illustrativeReference,
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
  ): Promise<ReceivedContractRelationView> {
    const [relation] = await this.database.connection
      .select()
      .from(receivedContractDocumentRelations)
      .where(
        and(
          eq(
            receivedContractDocumentRelations.workspaceId,
            document.workspaceId,
          ),
          eq(receivedContractDocumentRelations.companyId, document.companyId),
          eq(receivedContractDocumentRelations.documentId, document.id),
        ),
      );
    if (!relation) throw new Error('Missing received Contract relation.');
    if (
      !(await this.contracts.mayReadRelationWithinTransaction({
        actor,
        selection: relation,
      }))
    )
      return { access: 'denied' };
    return {
      access: 'granted',
      opportunityId: relation.opportunityId,
      contractId: relation.contractId,
      contractVersionId: relation.contractVersionId,
      contractVersionNumber: relation.contractVersionNumber,
      illustrativeReference: relation.illustrativeReference,
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
