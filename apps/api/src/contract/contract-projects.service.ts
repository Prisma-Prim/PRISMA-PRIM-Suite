import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  contracts,
  contractVersions,
  contractProjectLinks,
  contractCommands,
} from '../database/schema/index.js';
import { commandFingerprint } from '../pricing-configuration/pricing-configuration-publication.js';
import { ProjectService } from '../project/project.service.js';
import { isOpenProjectStatus } from '../project/project-status.js';

type LinkRow = typeof contractProjectLinks.$inferSelect;
type ContractRow = typeof contracts.$inferSelect;
const LINK_PERMISSIONS = [
  'commercial.contract.read',
  'commercial.contract.project.link',
] as const;

@Injectable()
export class ContractProjectsService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly accountability: AccountabilityService,
    private readonly clients: ClientOperationalReferenceService,
    private readonly projects: ProjectService,
    private readonly intake: CommercialIntakeService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}

  async candidates(input: { actor: ActorContext; opportunityId: string }) {
    return this.database.transaction(
      async () => {
        const companyId = await this.authorization.requireContractAccess(
          input.actor,
          LINK_PERMISSIONS,
          false,
        );
        await this.intake.requireReadableOfferOpportunity(
          input.actor,
          input.opportunityId,
          false,
        );
        const current = await this.find(
          input.actor,
          companyId,
          input.opportunityId,
        );
        this.requireExecuted(current);
        const projects = await this.projects.list(input.actor);
        const resolved = await this.clients.resolveProjectLinkClients(
          input.actor,
          [
            current.contract.originalClientAccountId,
            ...projects.map((project) => project.clientAccountId),
          ],
        );
        const clientId = resolved.get(current.contract.originalClientAccountId);
        const eligible = projects
          .filter(
            (project) =>
              clientId !== undefined &&
              resolved.get(project.clientAccountId) === clientId &&
              isOpenProjectStatus(project.status),
          )
          .sort(
            (left, right) =>
              right.createdAt.localeCompare(left.createdAt) ||
              right.id.localeCompare(left.id),
          )
          .slice(0, 50);
        const links = await this.database.connection
          .select()
          .from(contractProjectLinks)
          .where(
            and(
              eq(contractProjectLinks.workspaceId, input.actor.workspaceId),
              eq(contractProjectLinks.companyId, companyId),
              eq(contractProjectLinks.contractId, current.contract.id),
            ),
          );
        const items = [];
        for (const project of eligible)
          items.push({
            id: project.id,
            title: project.title,
            status: project.status,
            createdAt: project.createdAt,
            alreadyLinked: links.some((link) => link.projectId === project.id),
            otherContracts: (
              await this.readableContracts(input.actor, project.id)
            ).filter((contract) => contract.id !== current.contract.id),
          });
        return { items };
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  async link(input: {
    actor: ActorContext;
    opportunityId: string;
    payload: unknown;
    idempotencyKey: string | undefined;
  }) {
    await this.authorization.requireContractAccess(
      input.actor,
      LINK_PERMISSIONS,
    );
    const key = requireIdempotencyKey(input.idempotencyKey);
    return this.database
      .transaction(async () => {
        const { actor } = input;
        const companyId = await this.authorization.requireContractAccess(
          actor,
          LINK_PERMISSIONS,
          true,
        );
        await this.intake.requireReadableOfferOpportunity(
          actor,
          input.opportunityId,
          true,
        );
        const found = await this.find(actor, companyId, input.opportunityId);
        const fingerprint = commandFingerprint({
          kind: 'LINK_PROJECT',
          opportunityId: input.opportunityId,
          payload: input.payload,
        });
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
        if (receipt) {
          if (
            receipt.kind !== 'LINK_PROJECT' ||
            !receipt.resultProjectLinkId ||
            receipt.resultContractId !== found.contract.id
          )
            throw conflict('IDEMPOTENCY_CONFLICT');
          const [link] = await this.database.connection
            .select()
            .from(contractProjectLinks)
            .where(
              and(
                eq(contractProjectLinks.workspaceId, actor.workspaceId),
                eq(contractProjectLinks.companyId, companyId),
                eq(contractProjectLinks.contractId, found.contract.id),
                eq(contractProjectLinks.id, receipt.resultProjectLinkId),
              ),
            );
          if (!link)
            throw new Error('Missing Contract Project receipt result.');
          await this.projects.lockReadableContractLinkProject(
            actor,
            link.projectId,
          );
          await this.find(actor, companyId, input.opportunityId, true);
          if (receipt.fingerprint !== fingerprint)
            throw conflict('IDEMPOTENCY_CONFLICT');
          return linkView(link);
        }
        const command = readCommand(input.payload);
        const context = await this.projects.lockContractLinkContext({
          actor,
          projectId: command.projectId,
          contractOriginalClientAccountId:
            found.contract.originalClientAccountId,
        });
        const current = await this.find(
          actor,
          companyId,
          input.opportunityId,
          true,
        );
        if (current.contract.revision !== command.expectedContractRevision)
          throw conflict('STALE_CONTRACT_REVISION');
        this.requireExecuted(current);
        if (!context.eligible) throw conflict('PROJECT_NOT_ELIGIBLE');
        const links = await this.database.connection
          .select()
          .from(contractProjectLinks)
          .where(
            and(
              eq(contractProjectLinks.workspaceId, actor.workspaceId),
              eq(contractProjectLinks.companyId, companyId),
              eq(contractProjectLinks.contractId, current.contract.id),
            ),
          );
        if (links.some((link) => link.projectId === command.projectId))
          throw conflict('CONTRACT_PROJECT_ALREADY_LINKED');
        if (links.length >= 50)
          throw conflict('CONTRACT_PROJECT_LINK_CAPACITY_EXCEEDED');
        const linkedAt = this.clock.now();
        const revision = current.contract.revision + 1;
        const [link] = await this.database.connection
          .insert(contractProjectLinks)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            contractId: current.contract.id,
            projectId: command.projectId,
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
              eq(contracts.id, current.contract.id),
            ),
          );
        await this.database.connection.insert(contractCommands).values({
          workspaceId: actor.workspaceId,
          companyId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey: key,
          fingerprint,
          opportunityId: input.opportunityId,
          resultContractId: current.contract.id,
          kind: 'LINK_PROJECT',
          resultProjectLinkId: link.id,
          createdAt: linkedAt,
        });
        await this.accountability.recordContractProjectLinked({
          actor,
          companyId,
          contractId: current.contract.id,
          projectId: command.projectId,
          occurredAt: linkedAt,
        });
        return linkView(link);
      })
      .catch((error: unknown) => {
        if (error instanceof HttpException) throw error;
        throw new InternalServerErrorException({
          code: 'CONTRACT_PROJECT_LINK_UNCERTAIN',
          correlationId: randomUUID(),
          message:
            'The Contract Project link outcome is uncertain. Retry the identical command.',
        });
      });
  }

  async linkedProjects(actor: ActorContext, contract: ContractRow) {
    const links = await this.database.connection
      .select()
      .from(contractProjectLinks)
      .where(
        and(
          eq(contractProjectLinks.workspaceId, actor.workspaceId),
          eq(contractProjectLinks.companyId, contract.companyId),
          eq(contractProjectLinks.contractId, contract.id),
        ),
      )
      .orderBy(desc(contractProjectLinks.resultRevision));
    const items = [];
    for (const link of links) {
      try {
        items.push({
          ...(await this.projects.read(actor, link.projectId)),
          link: linkView(link),
        });
      } catch (error: unknown) {
        if (!(
          error instanceof ForbiddenException ||
          error instanceof NotFoundException
        ))
          throw error;
      }
    }
    return items;
  }

  async requireExecutedRevision(
    contract: ContractRow,
    signatureRevision: number,
  ) {
    const links = await this.database.connection
      .select({ revision: contractProjectLinks.resultRevision })
      .from(contractProjectLinks)
      .where(
        and(
          eq(contractProjectLinks.workspaceId, contract.workspaceId),
          eq(contractProjectLinks.companyId, contract.companyId),
          eq(contractProjectLinks.contractId, contract.id),
        ),
      )
      .orderBy(contractProjectLinks.resultRevision);
    if (
      contract.revision !== signatureRevision + links.length ||
      links.some(
        (link, index) => link.revision !== signatureRevision + index + 1,
      )
    )
      throw new Error('Invalid executed Contract link revision evidence.');
  }

  async forProject(input: { actor: ActorContext; projectId: string }) {
    const projectId = requireUuid(input.projectId);
    return this.database.transaction(
      async () => {
        await this.projects.read(input.actor, projectId);
        return { items: await this.readableContracts(input.actor, projectId) };
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  private async readableContracts(actor: ActorContext, projectId: string) {
    let companyId: string;
    try {
      companyId = await this.authorization.requireContractAccess(
        actor,
        ['commercial.contract.read'],
        false,
      );
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) return [];
      throw error;
    }
    const rows = await this.database.connection
      .select({ contract: contracts, link: contractProjectLinks })
      .from(contractProjectLinks)
      .innerJoin(
        contracts,
        and(
          eq(contracts.workspaceId, contractProjectLinks.workspaceId),
          eq(contracts.companyId, contractProjectLinks.companyId),
          eq(contracts.id, contractProjectLinks.contractId),
        ),
      )
      .where(
        and(
          eq(contractProjectLinks.workspaceId, actor.workspaceId),
          eq(contractProjectLinks.companyId, companyId),
          eq(contractProjectLinks.projectId, projectId),
        ),
      )
      .orderBy(
        desc(contractProjectLinks.linkedAt),
        desc(contractProjectLinks.id),
      );
    const items = [];
    for (const { contract, link } of rows) {
      try {
        await this.intake.requireReadableOfferOpportunity(
          actor,
          contract.opportunityId,
          false,
        );
        items.push({
          id: contract.id,
          opportunityId: contract.opportunityId,
          clientRequestId: contract.clientRequestId,
          illustrativeReference: contract.illustrativeReference,
          kind: 'CONTRACT' as const,
          provisional: true as const,
          linkedAt: link.linkedAt.toISOString(),
        });
      } catch (error: unknown) {
        if (!(
          error instanceof ForbiddenException ||
          error instanceof NotFoundException
        ))
          throw error;
      }
    }
    return items;
  }

  private async find(
    actor: ActorContext,
    companyId: string,
    opportunityId: string,
    lock = false,
  ) {
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

  private requireExecuted(current: {
    contract: ContractRow;
    version: typeof contractVersions.$inferSelect;
  }) {
    if (current.contract.kind !== 'CONTRACT')
      throw conflict('CONTRACT_KIND_NOT_LINKABLE');
    if (current.version.executionState !== 'EXECUTED')
      throw conflict('CONTRACT_NOT_EXECUTED');
  }
}

function readCommand(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body');
  const input: Record<string, unknown> = Object.fromEntries(
    Object.entries(value),
  );
  for (const key of Object.keys(input))
    if (!['projectId', 'expectedContractRevision'].includes(key))
      throw invalid(key);
  if (
    typeof input.projectId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      input.projectId,
    )
  )
    throw invalid('projectId');
  if (
    typeof input.expectedContractRevision !== 'number' ||
    !Number.isSafeInteger(input.expectedContractRevision) ||
    input.expectedContractRevision < 1 ||
    input.expectedContractRevision > 53
  )
    throw invalid('expectedContractRevision');
  return {
    projectId: input.projectId,
    expectedContractRevision: input.expectedContractRevision,
  };
}
function invalid(field: string) {
  return new BadRequestException({
    code: 'INVALID_CONTRACT_INPUT',
    field,
    message: `Invalid ${field}.`,
  });
}
function conflict(code: string) {
  return new ConflictException({
    code,
    message:
      'The Contract Project link cannot be recorded. Reload the current context.',
  });
}
function linkView(row: LinkRow) {
  return {
    id: row.id,
    contractId: row.contractId,
    projectId: row.projectId,
    revision: row.resultRevision,
    created: false as const,
    actorWorkspaceMembershipId: row.actorWorkspaceMembershipId,
    linkedAt: row.linkedAt.toISOString(),
  };
}
