import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { commandFingerprint } from '../pricing-configuration/pricing-configuration-publication.js';
import {
  ProjectService,
  readProjectTitle,
} from '../project/project.service.js';
import {
  ContractProjectLinkStore,
  contractProjectLinkView,
  projectLinkConflict,
} from './contract-project-link.store.js';
import { ContractProjectsService } from './contract-projects.service.js';

const PERMISSIONS = [
  'commercial.contract.read',
  'commercial.contract.project.link',
] as const;

@Injectable()
export class ContractProjectCreationService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly intake: CommercialIntakeService,
    private readonly projects: ProjectService,
    private readonly relationships: ContractProjectsService,
    private readonly links: ContractProjectLinkStore,
  ) {}

  async create(input: {
    actor: ActorContext;
    opportunityId: string;
    payload: unknown;
    idempotencyKey: string | undefined;
  }) {
    await this.authorization.requireContractAccess(input.actor, PERMISSIONS);
    const key = requireIdempotencyKey(input.idempotencyKey);
    return this.database
      .transaction(async () => {
        const { actor } = input;
        const companyId = await this.authorization.requireContractAccess(
          actor,
          PERMISSIONS,
          true,
        );
        await this.intake.requireReadableOfferOpportunity(
          actor,
          input.opportunityId,
          true,
        );
        await this.projects.requireCreationAccess(actor);
        const found = await this.links.find({
          actor,
          companyId,
          opportunityId: input.opportunityId,
        });
        const command = readCommand(input.payload);
        const fingerprint = commandFingerprint({
          kind: 'CREATE_PROJECT',
          opportunityId: input.opportunityId,
          payload: command,
        });
        const receipt = await this.links.command({ actor, companyId, key });
        if (receipt) {
          const row = await this.links.receiptLink({
            actor,
            companyId,
            contractId: found.contract.id,
            kind: 'CREATE_PROJECT',
            receipt,
          });
          await this.projects.lockReadableContractLinkProject(
            actor,
            row.projectId,
          );
          await this.links.find({
            actor,
            companyId,
            opportunityId: input.opportunityId,
            lock: true,
          });
          if (receipt.fingerprint !== fingerprint)
            throw projectLinkConflict('IDEMPOTENCY_CONFLICT');
          return {
            project: createdProjectResult(
              await this.projects.read(actor, row.projectId),
            ),
            link: contractProjectLinkView(row),
          };
        }
        const clientAccountId = await this.projects.lockContractCreationClient(
          actor,
          found.contract.originalClientAccountId,
        );
        const current = await this.links.find({
          actor,
          companyId,
          opportunityId: input.opportunityId,
          lock: true,
        });
        if (current.contract.revision !== command.expectedContractRevision)
          throw projectLinkConflict('STALE_CONTRACT_REVISION');
        this.links.requireExecuted(current);
        const candidates = await this.relationships.currentCandidates(
          actor,
          current.contract.originalClientAccountId,
        );
        if (candidates.length > 50)
          throw projectLinkConflict('PROJECT_CANDIDATE_LIMIT');
        const ids = candidates.map((project) => project.id).sort();
        if (
          ids.length !== command.acknowledgedCandidateProjectIds.length ||
          ids.some(
            (id, index) =>
              id !== command.acknowledgedCandidateProjectIds[index],
          )
        )
          throw projectLinkConflict('PROJECT_CANDIDATES_CHANGED');
        await this.links.requireCapacity({
          actor,
          companyId,
          contractId: current.contract.id,
        });
        const project = await this.projects.createWithinTransaction(
          actor,
          { title: command.title, clientAccountId },
          randomUUID(),
        );
        const link = await this.links.append({
          actor,
          companyId,
          contract: current.contract,
          projectId: project.id,
          kind: 'CREATE_PROJECT',
          key,
          fingerprint,
        });
        return { project: createdProjectResult(project), link };
      })
      .catch((error: unknown) => {
        if (error instanceof HttpException) throw error;
        throw new InternalServerErrorException({
          code: 'CONTRACT_PROJECT_CREATE_UNCERTAIN',
          correlationId: randomUUID(),
          message:
            'The Contract Project creation outcome is uncertain. Retry the identical command.',
        });
      });
  }
}

function readCommand(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body');
  const row: Record<string, unknown> = Object.fromEntries(
    Object.entries(value),
  );
  if (
    Object.keys(row).some(
      (key) =>
        ![
          'title',
          'acknowledgedCandidateProjectIds',
          'expectedContractRevision',
        ].includes(key),
    )
  )
    throw invalid('body');
  const title = readProjectTitle(row.title);
  if (
    !Array.isArray(row.acknowledgedCandidateProjectIds) ||
    row.acknowledgedCandidateProjectIds.length > 50
  )
    throw invalid('acknowledgedCandidateProjectIds');
  const ids = row.acknowledgedCandidateProjectIds.map((id: unknown) =>
    requireUuid(id),
  );
  if (new Set(ids).size !== ids.length)
    throw invalid('acknowledgedCandidateProjectIds');
  if (
    typeof row.expectedContractRevision !== 'number' ||
    !Number.isSafeInteger(row.expectedContractRevision) ||
    row.expectedContractRevision < 1 ||
    row.expectedContractRevision > 53
  )
    throw invalid('expectedContractRevision');
  return {
    title,
    acknowledgedCandidateProjectIds: ids.sort(),
    expectedContractRevision: row.expectedContractRevision,
  };
}
function invalid(field: string) {
  return new BadRequestException({
    code: 'INVALID_CONTRACT_INPUT',
    field,
    message: `Invalid ${field}.`,
  });
}
function createdProjectResult(
  project: Awaited<ReturnType<ProjectService['read']>>,
) {
  return {
    id: project.id,
    companyId: project.companyId,
    clientAccountId: project.clientAccountId,
    title: project.title,
    status: 'preparatory' as const,
    createdAt: project.createdAt,
  };
}
