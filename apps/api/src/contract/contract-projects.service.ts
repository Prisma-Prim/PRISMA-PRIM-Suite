import {
  ContractProjectLinkStore,
  agreementTarget,
  contractProjectLinkView,
  projectLinkConflict as conflict,
} from './contract-project-link.store.js';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';

import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';

import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { contracts, contractProjectLinks } from '../database/schema/index.js';
import { commandFingerprint } from '../command/idempotent-command.js';
import { ProjectService } from '../project/project.service.js';
import { isOpenProjectStatus } from '../project/project-status.js';

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
    private readonly links: ContractProjectLinkStore,
    private readonly clients: ClientOperationalReferenceService,
    private readonly projects: ProjectService,
    private readonly intake: CommercialIntakeService,
  ) {}

  async candidates(input: {
    actor: ActorContext;
    opportunityId: string;
    contractId?: string;
  }) {
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
        const current = await this.links.find({
          actor: input.actor,
          companyId,
          opportunityId: input.opportunityId,
          ...agreementTarget(input),
        });
        this.links.requireExecuted(current);
        const eligible = (
          await this.currentCandidates(
            input.actor,
            current.contract.originalClientAccountId,
          )
        ).slice(0, 50);
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

  /** Complete current set; callers decide whether truncation permits their operation. */
  async currentCandidates(
    actor: ActorContext,
    originalClientAccountId: string,
  ) {
    const projects = await this.projects.list(actor);
    const resolved = await this.clients.resolveProjectLinkClients(actor, [
      originalClientAccountId,
      ...projects.map((project) => project.clientAccountId),
    ]);
    const clientId = resolved.get(originalClientAccountId);
    return projects
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
      );
  }
  async link(input: {
    actor: ActorContext;
    opportunityId: string;
    contractId?: string;
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
        const found = await this.links.find({
          actor,
          companyId,
          opportunityId: input.opportunityId,
          ...agreementTarget(input),
        });
        const fingerprint = commandFingerprint({
          kind: 'LINK_PROJECT',
          opportunityId: input.opportunityId,
          ...agreementTarget(input),
          payload: input.payload,
        });
        const receipt = await this.links.command({ actor, companyId, key });
        if (receipt) {
          const link = await this.links.receiptLink({
            actor,
            companyId,
            contractId: found.contract.id,
            kind: 'LINK_PROJECT',
            receipt,
          });
          await this.projects.lockReadableContractLinkProject(
            actor,
            link.projectId,
          );
          await this.links.find({
            actor,
            companyId,
            opportunityId: input.opportunityId,
            ...agreementTarget(input),
            lock: true,
          });
          if (receipt.fingerprint !== fingerprint)
            throw conflict('IDEMPOTENCY_CONFLICT');
          return contractProjectLinkView(link);
        }
        const command = readCommand(input.payload);
        const context = await this.projects.lockContractLinkContext({
          actor,
          projectId: command.projectId,
          contractOriginalClientAccountId:
            found.contract.originalClientAccountId,
        });
        const current = await this.links.find({
          actor,
          companyId,
          opportunityId: input.opportunityId,
          ...agreementTarget(input),
          lock: true,
        });
        if (current.contract.revision !== command.expectedContractRevision)
          throw conflict('STALE_CONTRACT_REVISION');
        this.links.requireExecuted(current);
        if (!context.eligible) throw conflict('PROJECT_NOT_ELIGIBLE');
        await this.links.requireCapacity({
          actor,
          companyId,
          contractId: current.contract.id,
          projectId: command.projectId,
        });
        return this.links.append({
          actor,
          companyId,
          contract: current.contract,
          projectId: command.projectId,
          kind: 'LINK_PROJECT',
          key,
          fingerprint,
        });
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
          link: contractProjectLinkView(link),
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
      const kind = contract.kind;
      if (kind !== 'CONTRACT' && kind !== 'PRECONTRACT')
        throw new Error('Invalid linked Contract kind.');
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
          kind,
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
    input.expectedContractRevision > 2147483646
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
