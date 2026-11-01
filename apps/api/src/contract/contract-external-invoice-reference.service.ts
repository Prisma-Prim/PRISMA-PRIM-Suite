import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, gt } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientAccounts,
  clientCompanyRelationships,
  clientRequests,
  contracts,
  contractSigningDeclarations,
  contractVersions,
  opportunities,
} from '../database/schema/index.js';
import { readContractDecision } from './contract-decision-command.js';
import { recordedRecipient } from './contract-version-reader.js';
import { storedSigningDeclaration } from './reported-contract-signing-view.js';

export interface ExternalInvoiceSelection {
  opportunityId: string;
  contractId: string;
  contractVersionId: string;
}

export type ExternalInvoiceRecordedRecipient = ReturnType<
  typeof recordedRecipient
>;

/** Exact declared Contract references, inside the caller's transaction. */
@Injectable()
export class ContractExternalInvoiceReferenceService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly intake: CommercialIntakeService,
    private readonly clients: ClientOperationalReferenceService,
  ) {}

  async requireReadAuthority(actor: ActorContext, lock = false) {
    await this.authorization.requireExternalInvoiceSourceAccess(actor, {
      lockAssignment: lock,
    });
    const companyId = await this.authorization.requireContractAccess(
      actor,
      ['commercial.contract.read'],
      lock,
    );
    await this.authorization.requireCommercialIntakeAccess(actor, 'read', lock);
    return companyId;
  }

  async selectableVersionsWithinTransaction(
    actor: ActorContext,
    query: unknown,
  ) {
    const companyId = await this.requireReadAuthority(actor);
    await this.clients.requireReferenceReadAuthorityWithinReadTransaction(
      actor,
    );
    const cursor = readCursor(query);
    const visible = () =>
      this.database.connection
        .select({
          contract: contracts,
          version: contractVersions,
          clientDisplayName: clientAccounts.displayName,
          opportunityTitle: opportunities.title,
        })
        .from(contracts)
        .innerJoin(
          contractVersions,
          and(
            eq(contractVersions.workspaceId, contracts.workspaceId),
            eq(contractVersions.companyId, contracts.companyId),
            eq(contractVersions.contractId, contracts.id),
          ),
        )
        .innerJoin(
          contractSigningDeclarations,
          and(
            eq(contractSigningDeclarations.workspaceId, contracts.workspaceId),
            eq(contractSigningDeclarations.companyId, contracts.companyId),
            eq(contractSigningDeclarations.contractId, contracts.id),
            eq(
              contractSigningDeclarations.contractVersionId,
              contractVersions.id,
            ),
          ),
        )
        .innerJoin(
          opportunities,
          and(
            eq(opportunities.workspaceId, contracts.workspaceId),
            eq(opportunities.companyId, contracts.companyId),
            eq(opportunities.id, contracts.opportunityId),
          ),
        )
        .innerJoin(
          clientRequests,
          and(
            eq(clientRequests.workspaceId, opportunities.workspaceId),
            eq(clientRequests.companyId, opportunities.companyId),
            eq(clientRequests.id, opportunities.clientRequestId),
          ),
        )
        .innerJoin(
          clientAccounts,
          and(
            eq(clientAccounts.workspaceId, contracts.workspaceId),
            eq(clientAccounts.id, contracts.originalClientAccountId),
            eq(clientAccounts.status, 'active'),
          ),
        )
        .innerJoin(
          clientCompanyRelationships,
          and(
            eq(clientCompanyRelationships.workspaceId, contracts.workspaceId),
            eq(clientCompanyRelationships.companyId, contracts.companyId),
            eq(clientCompanyRelationships.clientAccountId, clientAccounts.id),
            eq(clientCompanyRelationships.status, 'active'),
          ),
        );
    if (cursor) {
      const [current] = await visible()
        .where(
          and(this.scope(actor, companyId), eq(contractVersions.id, cursor)),
        )
        .limit(1);
      if (!current) throw invalidCursor();
      await this.reference(actor, current.contract, current.version);
    }
    const rows = await visible()
      .where(
        and(
          this.scope(actor, companyId),
          cursor ? gt(contractVersions.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(contractVersions.id))
      .limit(21);
    const sources = [];
    for (const row of rows.slice(0, 20)) {
      const reference = await this.reference(actor, row.contract, row.version);
      sources.push({
        opportunityId: row.contract.opportunityId,
        contractId: row.contract.id,
        contractVersionId: row.version.id,
        contractVersionNumber: reference.contractVersionNumber,
        illustrativeReference: reference.illustrativeReference,
        clientId: reference.originalClientAccountId,
        clientDisplayName: row.clientDisplayName,
        opportunityTitle: row.opportunityTitle,
        recordedRecipient: reference.recordedRecipient,
      });
    }
    const last = sources.at(-1);
    return {
      sources,
      nextCursor:
        rows.length > 20 && last
          ? Buffer.from(last.contractVersionId).toString('base64url')
          : null,
    };
  }

  async qualifyNewRelationWithinTransaction(input: {
    actor: ActorContext;
    selection: ExternalInvoiceSelection;
  }) {
    const companyId = await this.requireReadAuthority(input.actor, true);
    await this.intake.requireReadableOfferOpportunity(
      input.actor,
      input.selection.opportunityId,
      true,
    );
    const observed = await this.find(input.actor, companyId, input.selection);
    if (!observed?.contract.originalClientAccountId)
      throw new NotFoundException();
    const originalClientAccountId = observed.contract.originalClientAccountId;
    await this.clients.lockActiveReferenceClient(
      input.actor,
      originalClientAccountId,
    );
    const locked = await this.find(
      input.actor,
      companyId,
      input.selection,
      true,
    );
    if (
      !locked ||
      locked.contract.originalClientAccountId !== originalClientAccountId
    )
      throw new NotFoundException();
    return this.reference(input.actor, locked.contract, locked.version);
  }

  async mayReadRelationWithinTransaction(input: {
    actor: ActorContext;
    selection: ExternalInvoiceSelection;
  }): Promise<boolean> {
    try {
      const companyId = await this.requireReadAuthority(input.actor);
      await this.intake.requireReadableOfferOpportunity(
        input.actor,
        input.selection.opportunityId,
        false,
      );
      const found = await this.find(input.actor, companyId, input.selection);
      if (!found) return false;
      await this.reference(input.actor, found.contract, found.version);
      return true;
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      )
        return false;
      throw error;
    }
  }

  private exactSources(actor: ActorContext, companyId: string) {
    return this.database.connection
      .select({ contract: contracts, version: contractVersions })
      .from(contracts)
      .innerJoin(
        contractVersions,
        and(
          eq(contractVersions.workspaceId, contracts.workspaceId),
          eq(contractVersions.companyId, contracts.companyId),
          eq(contractVersions.contractId, contracts.id),
        ),
      )
      .innerJoin(
        contractSigningDeclarations,
        and(
          eq(contractSigningDeclarations.workspaceId, contracts.workspaceId),
          eq(contractSigningDeclarations.companyId, contracts.companyId),
          eq(contractSigningDeclarations.contractId, contracts.id),
          eq(
            contractSigningDeclarations.contractVersionId,
            contractVersions.id,
          ),
        ),
      )
      .where(this.scope(actor, companyId))
      .$dynamic();
  }

  private scope(actor: ActorContext, companyId: string) {
    return and(
      eq(contracts.workspaceId, actor.workspaceId),
      eq(contracts.companyId, companyId),
      eq(contracts.kind, 'CONTRACT'),
      eq(contracts.origin, 'COMPANY_MODEL_OFFER'),
      eq(contractVersions.provenance, 'COMPANY_MODEL_OFFER'),
      eq(contractVersions.decisionState, 'APPROVED'),
      eq(contractVersions.executionState, 'EXECUTED'),
    );
  }

  private async find(
    actor: ActorContext,
    companyId: string,
    selection: ExternalInvoiceSelection,
    lock = false,
  ) {
    const query = this.exactSources(actor, companyId).where(
      and(
        this.scope(actor, companyId),
        eq(contracts.opportunityId, selection.opportunityId),
        eq(contracts.id, selection.contractId),
        eq(contractVersions.id, selection.contractVersionId),
      ),
    );
    const [row] = lock
      ? await query.for('share', { of: contracts })
      : await query;
    return row;
  }

  private async reference(
    actor: ActorContext,
    contract: typeof contracts.$inferSelect,
    version: typeof contractVersions.$inferSelect,
  ) {
    const declaration = await storedSigningDeclaration(
      this.database,
      contract,
      version,
    );
    if (!declaration || !contract.originalClientAccountId)
      throw new NotFoundException();
    const approval = await readContractDecision(
      this.database,
      actor,
      contract,
      version,
    );
    if (
      approval?.kind !== 'APPROVE' ||
      approval.id !== declaration.row.approvalDecisionId ||
      approval.qualityRun.id === declaration.row.qualityRunId ||
      approval.representationChecksum !== declaration.row.representationChecksum
    )
      throw new Error('Invalid external invoice source approval.');
    return {
      originalClientAccountId: contract.originalClientAccountId,
      contractVersionNumber: version.versionNumber,
      illustrativeReference: contract.illustrativeReference,
      recordedRecipient: recordedRecipient(version),
    };
  }
}

function readCursor(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalidCursor();
  const query = Object.fromEntries(Object.entries(value));
  if (!Object.keys(query).length) return undefined;
  if (
    Object.keys(query).length !== 1 ||
    typeof query.cursor !== 'string' ||
    !/^[A-Za-z0-9_-]{48}$/u.test(query.cursor)
  )
    throw invalidCursor();
  const decoded = Buffer.from(query.cursor, 'base64url').toString('utf8');
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(
      decoded,
    ) ||
    Buffer.from(decoded).toString('base64url') !== query.cursor
  )
    throw invalidCursor();
  return decoded;
}

function invalidCursor() {
  return new BadRequestException('Invalid external invoice source cursor.');
}
