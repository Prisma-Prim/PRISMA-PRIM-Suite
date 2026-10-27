import { runClientReferenceTransaction } from '../client/client-reference-transaction.js';
import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { and, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  contractCommands,
  contracts,
  contractVersions,
  contractQualityRuns,
  contractSigningDeclarations,
} from '../database/schema/index.js';
import { DocumentSigningReferenceService } from '../documents/document-signing-reference.service.js';
import { commandFingerprint } from '../command/idempotent-command.js';
import {
  ContractVersionReader,
  recordedRecipient,
} from './contract-version-reader.js';
import { ModelContractService } from './model-contract.service.js';
import { readContractDecision } from './contract-decision-command.js';
import { storedModelContractSnapshot } from './model-contract-snapshot.js';
import {
  readReportedContractSigning,
  requireReportedSigningDates,
} from './reported-contract-signing.js';
import { readReportedSigningDeclaration } from './reported-contract-signing-view.js';

interface SigningTarget {
  actor: ActorContext;
  opportunityId: string;
  contractId?: string;
  versionId: string;
}
const permissions = [
  'commercial.contract.read',
  'commercial.contract.signature.record',
] as const;
@Injectable()
export class ReportedContractSigningService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly accountability: AccountabilityService,
    private readonly clients: ClientOperationalReferenceService,
    private readonly intake: CommercialIntakeService,
    private readonly versions: ContractVersionReader,
    private readonly models: ModelContractService,
    private readonly documents: DocumentSigningReferenceService,
  ) {}

  private async readableTarget(input: SigningTarget) {
    const companyId =
      await this.authorization.requireContractSignatureDeclaration(
        input.actor,
        true,
      );
    await this.authorization.requireContractAccess(
      input.actor,
      permissions,
      true,
    );
    await this.authorization.requireOfferAccess(
      input.actor,
      ['commercial.offer.read'],
      true,
    );
    await this.clients.lockRecipientReadAuthority(input.actor);
    await this.intake.requireReadableOfferOpportunity(
      input.actor,
      input.opportunityId,
      true,
    );
    const found = await this.versions.find({ ...input, companyId });
    if (!found || found.version.id !== input.versionId)
      throw new NotFoundException();
    if (
      found.contract.kind !== 'CONTRACT' ||
      found.contract.origin !== 'COMPANY_MODEL_OFFER' ||
      found.version.provenance !== 'COMPANY_MODEL_OFFER'
    )
      throw conflict('CONTRACT_DECLARATION_MODE_UNSUPPORTED');
    const context = {
      companyId,
      originalClientAccountId: found.contract.originalClientAccountId,
      contractId: found.contract.id,
      contractVersionId: found.version.id,
    };
    await this.clients.readReferenceClient(
      input.actor,
      context.originalClientAccountId,
    );
    await this.documents.requireReadWithinTransaction(
      input.actor,
      context,
      true,
    );
    return { ...found, companyId, context };
  }
  private async newUse(
    input: SigningTarget,
    found: Awaited<
      ReturnType<ReportedContractSigningService['readableTarget']>
    >,
  ) {
    await this.clients.lockActiveReferenceClient(
      input.actor,
      found.contract.originalClientAccountId,
    );
    const recipient = recordedRecipient(found.version);
    const resolution = await this.clients.lockOfferRecipient(
      input.actor,
      found.contract.originalClientAccountId,
      recipient.kind === 'PRIMARY'
        ? { kind: 'PRIMARY' }
        : {
            kind: 'ADDITIONAL',
            legalEntityId: recipient.additionalLegalEntityId,
          },
    );
    const quality = await this.models.evaluateSigningQualityWithinTransaction({
      actor: input.actor,
      companyId: found.companyId,
      contract: found.contract,
      version: found.version,
    });
    const current = await this.versions.find({
      actor: input.actor,
      companyId: found.companyId,
      opportunityId: input.opportunityId,
      contractId: found.contract.id,
    });
    if (
      !current ||
      current.version.id !== found.version.id ||
      current.version.supersededByVersionId
    )
      throw conflict('CONTRACT_VERSION_SUPERSEDED');
    if (current.version.decisionState !== 'APPROVED')
      throw conflict('CONTRACT_VERSION_NOT_APPROVED');
    if (current.version.executionState !== 'NOT_EXECUTED')
      throw conflict('CONTRACT_VERSION_ALREADY_EXECUTED');
    if (quality.results.some((r) => r.status === 'ERROR'))
      throw conflict('QUALITY_CHECK_ERRORS');
    return { ...current, quality, resolution };
  }
  candidates(input: SigningTarget & { cursor: string | undefined }) {
    return runClientReferenceTransaction({
      database: this.database,
      work: async () => {
        const found = await this.readableTarget(input);
        const current = await this.newUse(input, found);
        const page = await this.documents.eligibleWithinTransaction({
          actor: input.actor,
          context: found.context,
          cursor: input.cursor,
        });
        return {
          ...page,
          warningCodes: current.quality.results
            .filter((r) => r.status === 'WARNING')
            .map((r) => r.code)
            .sort(),
        };
      },
    });
  }
  async declare(
    input: SigningTarget & {
      payload: unknown;
      idempotencyKey: string | undefined;
    },
  ) {
    const key = requireIdempotencyKey(input.idempotencyKey);
    const command = readReportedContractSigning(input.payload);
    return runClientReferenceTransaction({
      database: this.database,
      work: async () => {
        const { actor } = input;
        const found = await this.readableTarget(input);
        const fingerprint = commandFingerprint({
          kind: 'DECLARE_SIGNING',
          opportunityId: input.opportunityId,
          contractId: found.contract.id,
          versionId: input.versionId,
          command,
        });
        await this.database.connection.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.workspaceId}:${found.companyId}:${actor.workspaceMembershipId}:${key}`},0))`,
        );
        const [receipt] = await this.database.connection
          .select()
          .from(contractCommands)
          .where(
            and(
              eq(contractCommands.workspaceId, actor.workspaceId),
              eq(contractCommands.companyId, found.companyId),
              eq(
                contractCommands.actorWorkspaceMembershipId,
                actor.workspaceMembershipId,
              ),
              eq(contractCommands.idempotencyKey, key),
            ),
          );
        const exactPdf = () =>
          this.documents.exactWithinTransaction({
            actor,
            context: found.context,
            documentId: command.documentId,
            documentVersionId: command.documentVersionId,
            representationId: command.representationId,
            lock: true,
          });
        if (receipt) {
          if (
            receipt.kind !== 'DECLARE_SIGNING' ||
            receipt.fingerprint !== fingerprint ||
            receipt.resultContractId !== found.contract.id ||
            receipt.resultVersionId !== input.versionId
          )
            throw conflict('IDEMPOTENCY_CONFLICT');
          await exactPdf();
          const recorded = await readReportedSigningDeclaration({
            database: this.database,
            documents: this.documents,
            actor,
            ...found,
          });
          if (!recorded || recorded.pdf.access !== 'granted')
            throw new Error('Missing declaration receipt.');
          return recorded;
        }
        const current = await this.newUse(input, found);
        if (current.contract.revision !== command.expectedContractRevision)
          throw conflict('STALE_CONTRACT_REVISION');
        requireReportedSigningDates(command, current.quality.evaluatedAt);
        const warnings = current.quality.results
          .filter((r) => r.status === 'WARNING')
          .map((r) => r.code)
          .sort();
        if (
          !isDeepStrictEqual(
            warnings,
            [...command.acknowledgedWarningCodes].sort(),
          )
        )
          throw conflict('QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED');
        const approval = await readContractDecision(
          this.database,
          actor,
          current.contract,
          current.version,
        );
        const snapshot = storedModelContractSnapshot(
          current.contract,
          current.version,
        );
        if (
          approval?.kind !== 'APPROVE' ||
          approval.representationChecksum !== snapshot.representation.sha256
        )
          throw conflict('REPRESENTATION_MISMATCH');
        const pdf = await exactPdf();
        const [run] = await this.database.connection
          .insert(contractQualityRuns)
          .values({
            workspaceId: actor.workspaceId,
            companyId: found.companyId,
            contractId: current.contract.id,
            contractVersionId: current.version.id,
            actorInternalUserId: actor.internalUserId,
            actorWorkspaceMembershipId: actor.workspaceMembershipId,
            ruleSet: 'CONTRACT_QUALITY_COMPANY_MODEL',
            ruleSetVersion: 1,
            evaluatedAt: current.quality.evaluatedAt,
            results: current.quality.results,
          })
          .returning();
        if (!run) throw new Error('Missing declaration Quality Check.');
        await this.database.connection
          .insert(contractSigningDeclarations)
          .values({
            workspaceId: actor.workspaceId,
            companyId: found.companyId,
            contractId: current.contract.id,
            contractVersionId: current.version.id,
            approvalDecisionId: approval.id,
            qualityRunId: run.id,
            representationChecksum: snapshot.representation.sha256,
            documentId: pdf.documentId,
            documentVersionId: pdf.documentVersionId,
            representationId: pdf.representationId,
            resultRevision: current.contract.revision + 1,
            actorWorkspaceMembershipId: actor.workspaceMembershipId,
            actorInternalUserId: actor.internalUserId,
            recordedAt: current.quality.evaluatedAt,
            statement: command,
            pdf,
          });
        await this.database.connection
          .update(contractVersions)
          .set({ executionState: 'EXECUTED' })
          .where(
            and(
              eq(contractVersions.workspaceId, actor.workspaceId),
              eq(contractVersions.companyId, found.companyId),
              eq(contractVersions.id, current.version.id),
            ),
          );
        await this.database.connection
          .update(contracts)
          .set({ revision: current.contract.revision + 1 })
          .where(
            and(
              eq(contracts.workspaceId, actor.workspaceId),
              eq(contracts.companyId, found.companyId),
              eq(contracts.id, current.contract.id),
            ),
          );
        await this.clients.recordLockedReferenceUse(actor, current.resolution);
        await this.database.connection.insert(contractCommands).values({
          workspaceId: actor.workspaceId,
          companyId: found.companyId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey: key,
          fingerprint,
          opportunityId: input.opportunityId,
          resultContractId: current.contract.id,
          resultVersionId: current.version.id,
          kind: 'DECLARE_SIGNING',
          createdAt: current.quality.evaluatedAt,
        });
        await this.accountability.recordContractSigningDeclared({
          actor,
          companyId: found.companyId,
          contractId: current.contract.id,
          contractVersionId: current.version.id,
          versionNumber: current.version.versionNumber,
          occurredAt: current.quality.evaluatedAt,
        });
        const recorded = await readReportedSigningDeclaration({
          database: this.database,
          documents: this.documents,
          actor,
          contract: current.contract,
          version: { ...current.version, executionState: 'EXECUTED' },
        });
        if (!recorded || recorded.pdf.access !== 'granted')
          throw new Error('Missing declaration result.');
        return recorded;
      },
    }).catch((error: unknown) => {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException({
        code: 'CONTRACT_DECLARATION_UNCERTAIN',
        correlationId: randomUUID(),
        message:
          'The declaration outcome is uncertain. Retry the identical command.',
      });
    });
  }
}
function conflict(code: string) {
  return new ConflictException({ code });
}
