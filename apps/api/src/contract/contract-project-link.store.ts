import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  contracts,
  contractVersions,
  contractProjectLinks,
  contractCommands,
} from '../database/schema/index.js';

export type ContractProjectCommandKind = 'LINK_PROJECT' | 'CREATE_PROJECT';
type LinkRow = typeof contractProjectLinks.$inferSelect;

/** Contract-owned persistence shared by existing-link and create-and-link commands. */
@Injectable()
export class ContractProjectLinkStore {
  constructor(
    private readonly database: DatabaseContext,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}

  async find(input: {
    actor: ActorContext;
    companyId: string;
    opportunityId: string;
    lock?: boolean;
  }) {
    const { actor, companyId, opportunityId, lock = false } = input;
    const query = this.database.connection
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
      .where(
        and(
          eq(contracts.workspaceId, actor.workspaceId),
          eq(contracts.companyId, companyId),
          eq(contracts.opportunityId, opportunityId),
        ),
      );
    const [found] = await (lock
      ? query.for('update', { of: contracts })
      : query);
    if (!found) throw new NotFoundException();
    return found;
  }

  requireExecuted(
    current: Awaited<ReturnType<ContractProjectLinkStore['find']>>,
  ) {
    if (current.contract.kind !== 'CONTRACT')
      throw projectLinkConflict('CONTRACT_KIND_NOT_LINKABLE');
    if (current.version.executionState !== 'EXECUTED')
      throw projectLinkConflict('CONTRACT_NOT_EXECUTED');
  }

  async command(input: {
    actor: ActorContext;
    companyId: string;
    key: string;
  }) {
    const { actor, companyId, key } = input;
    await this.database.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.workspaceId}:${companyId}:${actor.workspaceMembershipId}:${key}`},0))`,
    );
    const [receipt] = await this.database.connection
      .select()
      .from(contractCommands)
      .where(
        and(
          eq(contractCommands.workspaceId, actor.workspaceId),
          eq(contractCommands.companyId, companyId),
          eq(
            contractCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(contractCommands.idempotencyKey, key),
        ),
      );
    return receipt;
  }

  async receiptLink(input: {
    actor: ActorContext;
    companyId: string;
    contractId: string;
    kind: ContractProjectCommandKind;
    receipt: typeof contractCommands.$inferSelect;
  }) {
    const { actor, companyId, contractId, kind, receipt } = input;
    if (
      receipt.kind !== kind ||
      !receipt.resultProjectLinkId ||
      receipt.resultContractId !== contractId
    )
      throw projectLinkConflict('IDEMPOTENCY_CONFLICT');
    const [link] = await this.database.connection
      .select()
      .from(contractProjectLinks)
      .where(
        and(
          eq(contractProjectLinks.workspaceId, actor.workspaceId),
          eq(contractProjectLinks.companyId, companyId),
          eq(contractProjectLinks.contractId, contractId),
          eq(contractProjectLinks.id, receipt.resultProjectLinkId),
        ),
      );
    if (!link) throw new Error('Missing Contract Project receipt result.');
    return link;
  }

  async requireCapacity(input: {
    actor: ActorContext;
    companyId: string;
    contractId: string;
    projectId?: string;
  }) {
    const { actor, companyId, contractId, projectId } = input;
    const links = await this.database.connection
      .select()
      .from(contractProjectLinks)
      .where(
        and(
          eq(contractProjectLinks.workspaceId, actor.workspaceId),
          eq(contractProjectLinks.companyId, companyId),
          eq(contractProjectLinks.contractId, contractId),
        ),
      );
    if (projectId && links.some((link) => link.projectId === projectId))
      throw projectLinkConflict('CONTRACT_PROJECT_ALREADY_LINKED');
    if (links.length >= 50)
      throw projectLinkConflict('CONTRACT_PROJECT_LINK_CAPACITY_EXCEEDED');
  }

  async append(input: {
    actor: ActorContext;
    companyId: string;
    contract: typeof contracts.$inferSelect;
    projectId: string;
    kind: ContractProjectCommandKind;
    key: string;
    fingerprint: string;
  }) {
    const { actor, companyId, contract, projectId, kind, key, fingerprint } =
      input;
    const linkedAt = this.clock.now(),
      revision = contract.revision + 1,
      created = kind === 'CREATE_PROJECT';
    const [link] = await this.database.connection
      .insert(contractProjectLinks)
      .values({
        workspaceId: actor.workspaceId,
        companyId,
        contractId: contract.id,
        projectId,
        created,
        resultRevision: revision,
        actorInternalUserId: actor.internalUserId,
        actorWorkspaceMembershipId: actor.workspaceMembershipId,
        linkedAt,
      })
      .returning();
    if (!link) throw new Error('Missing Contract Project link.');
    await this.database.connection
      .update(contracts)
      .set({ revision })
      .where(
        and(
          eq(contracts.workspaceId, actor.workspaceId),
          eq(contracts.companyId, companyId),
          eq(contracts.id, contract.id),
        ),
      );
    await this.database.connection.insert(contractCommands).values({
      workspaceId: actor.workspaceId,
      companyId,
      actorWorkspaceMembershipId: actor.workspaceMembershipId,
      idempotencyKey: key,
      fingerprint,
      opportunityId: contract.opportunityId,
      resultContractId: contract.id,
      kind,
      resultProjectLinkId: link.id,
      createdAt: linkedAt,
    });
    await this.accountability.recordContractProjectLinked({
      actor,
      companyId,
      contractId: contract.id,
      projectId,
      created,
      occurredAt: linkedAt,
    });
    return contractProjectLinkView(link);
  }
}

export function contractProjectLinkView(row: LinkRow) {
  return {
    id: row.id,
    contractId: row.contractId,
    projectId: row.projectId,
    revision: row.resultRevision,
    created: row.created,
    actorWorkspaceMembershipId: row.actorWorkspaceMembershipId,
    linkedAt: row.linkedAt.toISOString(),
  };
}
export function projectLinkConflict(code: string) {
  return new ConflictException({
    code,
    message:
      'The Contract Project command cannot be recorded. Reload the current context.',
  });
}
