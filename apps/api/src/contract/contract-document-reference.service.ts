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
  contracts,
  contractVersions,
  clientAccounts,
  clientCompanyRelationships,
  opportunities,
  clientRequests,
} from '../database/schema/index.js';

export type ReceivedContractSelection = {
  opportunityId: string;
  contractId: string;
  contractVersionId: string;
};

/** Reference-only Contract owner. Does not depend on Document or Contract commands. */
@Injectable()
export class ContractDocumentReferenceService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly intake: CommercialIntakeService,
    private readonly clients: ClientOperationalReferenceService,
  ) {}

  async requireReadAuthority(actor: ActorContext, lock = false) {
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
    await this.clients.requireReferenceReadAuthority(actor);
    const cursor = readCursor(query);
    const visible = () =>
      this.database.connection
        .select({
          opportunityId: contracts.opportunityId,
          contractId: contracts.id,
          contractVersionId: contractVersions.id,
          contractVersionNumber: contractVersions.versionNumber,
          illustrativeReference: contracts.illustrativeReference,
          clientId: clientAccounts.id,
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
        )
        .$dynamic();
    const scope = and(
      eq(contracts.workspaceId, actor.workspaceId),
      eq(contracts.companyId, companyId),
      eq(contracts.kind, 'CONTRACT'),
      eq(contracts.origin, 'COMPANY_MODEL_OFFER'),
      eq(contractVersions.provenance, 'COMPANY_MODEL_OFFER'),
    );
    // A cursor is valid only for a currently selectable visible record.
    if (
      cursor &&
      !(
        await visible()
          .where(and(scope, eq(contractVersions.id, cursor)))
          .limit(1)
      ).length
    )
      throw new BadRequestException('Invalid received Contract source cursor.');
    const rows = await visible()
      .where(and(scope, cursor ? gt(contractVersions.id, cursor) : undefined))
      .orderBy(asc(contractVersions.id))
      .limit(21);
    const sources = rows.slice(0, 20);
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
    selection: ReceivedContractSelection;
  }) {
    const companyId = await this.requireReadAuthority(input.actor, true);
    await this.intake.requireReadableOfferOpportunity(
      input.actor,
      input.selection.opportunityId,
      true,
    );
    const observed = await this.find(input.actor, companyId, input.selection);
    if (!observed?.originalClientAccountId) throw new NotFoundException();
    await this.clients.lockActiveReferenceClient(
      input.actor,
      observed.originalClientAccountId,
    );
    const locked = await this.find(
      input.actor,
      companyId,
      input.selection,
      true,
    );
    if (
      !locked ||
      locked.originalClientAccountId !== observed.originalClientAccountId
    )
      throw new NotFoundException();
    return {
      ...locked,
      originalClientAccountId: observed.originalClientAccountId,
    };
  }

  async mayReadRelationWithinTransaction(input: {
    actor: ActorContext;
    selection: ReceivedContractSelection;
  }): Promise<boolean> {
    try {
      const companyId = await this.requireReadAuthority(input.actor);
      await this.intake.requireReadableOfferOpportunity(
        input.actor,
        input.selection.opportunityId,
        false,
      );
      return Boolean(await this.find(input.actor, companyId, input.selection));
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      )
        return false;
      throw error;
    }
  }

  private async find(
    actor: ActorContext,
    companyId: string,
    selection: ReceivedContractSelection,
    lock = false,
  ) {
    const query = this.database.connection
      .select({
        originalClientAccountId: contracts.originalClientAccountId,
        contractVersionNumber: contractVersions.versionNumber,
        illustrativeReference: contracts.illustrativeReference,
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
      .where(
        and(
          eq(contracts.workspaceId, actor.workspaceId),
          eq(contracts.companyId, companyId),
          eq(contracts.opportunityId, selection.opportunityId),
          eq(contracts.id, selection.contractId),
          eq(contractVersions.id, selection.contractVersionId),
          eq(contracts.kind, 'CONTRACT'),
          eq(contracts.origin, 'COMPANY_MODEL_OFFER'),
          eq(contractVersions.provenance, 'COMPANY_MODEL_OFFER'),
        ),
      );
    const [row] = lock
      ? await query.for('share', { of: contracts })
      : await query;
    return row;
  }
}

function readCursor(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid received Contract source query.');
  const query = Object.fromEntries(Object.entries(value));
  if (!Object.keys(query).length) return undefined;
  if (
    Object.keys(query).length !== 1 ||
    typeof query.cursor !== 'string' ||
    !/^[A-Za-z0-9_-]{48}$/u.test(query.cursor)
  )
    throw new BadRequestException('Invalid received Contract source cursor.');
  const decoded = Buffer.from(query.cursor, 'base64url').toString('utf8');
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(
      decoded,
    ) ||
    Buffer.from(decoded).toString('base64url') !== query.cursor
  )
    throw new BadRequestException('Invalid received Contract source cursor.');
  return decoded;
}
