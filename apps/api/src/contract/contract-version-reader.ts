import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  contracts,
  contractVersions,
  contractQualityRuns,
} from '../database/schema/index.js';
import { OfferService } from '../offer/offer.service.js';
import type { OfferRecipientCopy } from '../offer/offer.types.js';
import { PricingSnapshotService } from '../pricing-configuration/pricing-snapshot.service.js';
import { readContractDecision } from './contract-decision-command.js';
import { readContractSignature } from './contract-signature-command.js';
import { qualityRunView } from './contract-quality-view.js';
import { ContractProjectsService } from './contract-projects.service.js';
import { renderContractRepresentation } from './contract-representation.js';
import { contractVersionDifferences } from './contract-version-differences.js';
type ContractRow = typeof contracts.$inferSelect;
type VersionRow = typeof contractVersions.$inferSelect;
@Injectable()
export class ContractVersionReader {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly intake: CommercialIntakeService,
    private readonly offers: OfferService,
    private readonly pricing: PricingSnapshotService,
    private readonly projectLinks: ContractProjectsService,
  ) {}
  async read(input: {
    actor: ActorContext;
    opportunityId: string;
    versionId?: string;
  }) {
    return this.databaseContext.transaction(async () => {
      const companyId = await this.authorization.requireContractAccess(
        input.actor,
        ['commercial.contract.read'],
        true,
      );
      const opportunity = await this.intake.requireReadableOfferOpportunity(
        input.actor,
        input.opportunityId,
        false,
      );
      const found = await this.find({
        actor: input.actor,
        companyId,
        opportunityId: opportunity.id,
        versionId: input.versionId,
      });
      if (!found) {
        if (input.versionId) throw new NotFoundException();
        return null;
      }
      if (input.versionId !== undefined && input.versionId !== found.version.id)
        throw new NotFoundException();
      return this.view(input.actor, found.contract, found.version);
    });
  }

  async listVersions(input: {
    actor: ActorContext;
    opportunityId: string;
    limit: string | undefined;
    cursor: string | undefined;
  }) {
    const limit = input.limit === undefined ? 25 : Number(input.limit);
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      (input.limit !== undefined && !/^\d+$/u.test(input.limit))
    )
      throw new BadRequestException({ field: 'limit' });
    return this.databaseContext.transaction(async () => {
      const companyId = await this.authorization.requireContractAccess(
        input.actor,
        ['commercial.contract.read'],
        true,
      );
      await this.intake.requireReadableOfferOpportunity(
        input.actor,
        input.opportunityId,
        false,
      );
      const current = await this.find({
        actor: input.actor,
        companyId,
        opportunityId: input.opportunityId,
      });
      if (!current) {
        if (input.cursor !== undefined)
          throw new BadRequestException({ field: 'cursor' });
        return { items: [], nextCursor: null };
      }
      const scope = and(
        eq(contractVersions.workspaceId, input.actor.workspaceId),
        eq(contractVersions.companyId, companyId),
        eq(contractVersions.contractId, current.contract.id),
      );
      let before: number | undefined;
      if (input.cursor !== undefined) {
        const cursor = await this.find({
          actor: input.actor,
          companyId,
          opportunityId: input.opportunityId,
          versionId: input.cursor,
        });
        if (!cursor) throw new BadRequestException({ field: 'cursor' });
        before = cursor.version.versionNumber;
      }
      const rows = await this.databaseContext.connection
        .select()
        .from(contractVersions)
        .where(
          and(
            scope,
            before === undefined
              ? undefined
              : lt(contractVersions.versionNumber, before),
          ),
        )
        .orderBy(desc(contractVersions.versionNumber))
        .limit(limit + 1);
      const items = [];
      for (const version of rows.slice(0, limit))
        items.push(
          (await this.view(input.actor, current.contract, version)).version,
        );
      return {
        items,
        nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
      };
    });
  }

  async find({
    actor,
    companyId,
    opportunityId,
    versionId,
  }: {
    actor: ActorContext;
    companyId: string;
    opportunityId: string;
    versionId?: string;
  }) {
    if (
      versionId !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        versionId,
      )
    )
      return undefined;
    const [found] = await this.databaseContext.connection
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
          versionId === undefined
            ? undefined
            : eq(contractVersions.id, versionId),
        ),
      )
      .orderBy(desc(contractVersions.versionNumber))
      .limit(1);
    return found;
  }

  async view(actor: ActorContext, contract: ContractRow, version: VersionRow) {
    if (
      contract.kind !== 'CONTRACT' ||
      contract.origin !== 'ACCEPTED_OFFER' ||
      !Number.isInteger(contract.revision) ||
      contract.revision < 1 ||
      !Number.isInteger(version.versionNumber) ||
      version.versionNumber < 1 ||
      version.createdContractRevision > contract.revision ||
      !['PENDING', 'APPROVED', 'REJECTED'].includes(version.decisionState) ||
      !['NOT_EXECUTED', 'EXECUTED'].includes(version.executionState) ||
      version.provenance !== 'ILLUSTRATIVE'
    )
      throw new Error('Invalid stored Contract state.');
    const decision = await readContractDecision(
      this.databaseContext,
      actor,
      contract,
      version,
    );
    const signature = await readContractSignature(
      this.databaseContext,
      actor,
      contract,
      version,
    );
    if (
      (version.decisionState === 'PENDING' &&
        (decision !== null ||
          (!version.supersededByVersionId &&
            contract.revision !== version.createdContractRevision))) ||
      (version.decisionState !== 'PENDING' &&
        (!decision ||
          (version.executionState === 'NOT_EXECUTED' &&
            !version.supersededByVersionId &&
            decision.revision !== contract.revision) ||
          version.decisionState !==
            (decision.kind === 'APPROVE' ? 'APPROVED' : 'REJECTED')))
    )
      throw new Error('Invalid stored Contract decision state.');
    if (
      (version.executionState === 'EXECUTED' &&
        (!signature ||
          decision?.kind !== 'APPROVE' ||
          contract.revision < signature.revision)) ||
      (version.executionState === 'NOT_EXECUTED' && signature !== null)
    )
      throw new Error('Invalid stored Contract execution state.');
    if (signature)
      await this.projectLinks.requireExecutedRevision(
        contract,
        signature.revision,
      );
    const recipient = recordedRecipient(version);
    const [latestRun] = await this.databaseContext.connection
      .select()
      .from(contractQualityRuns)
      .where(
        and(
          eq(contractQualityRuns.workspaceId, actor.workspaceId),
          eq(contractQualityRuns.companyId, contract.companyId),
          eq(contractQualityRuns.contractId, contract.id),
          eq(contractQualityRuns.contractVersionId, version.id),
        ),
      )
      .orderBy(desc(contractQualityRuns.sequence))
      .limit(1);
    const pricingSnapshot = await this.pricing.resolveContractVersionSnapshot({
      actor,
      companyId: contract.companyId,
      opportunityId: contract.opportunityId,
      contractVersionId: version.id,
    });
    const sourceOffer = await this.offers.readContractSourceReference({
      actor,
      contractId: contract.id,
      opportunityId: contract.opportunityId,
    });
    const clientReference = await this.intake.readPricingClientProjection(
      actor,
      contract.originalClientAccountId,
    );
    const predecessor = version.predecessorVersionId
      ? await this.find({
          actor,
          companyId: contract.companyId,
          opportunityId: contract.opportunityId,
          versionId: version.predecessorVersionId,
        })
      : null;
    if (version.predecessorVersionId && !predecessor)
      throw new Error('Missing Contract predecessor.');
    return {
      id: contract.id,
      companyId: contract.companyId,
      opportunityId: contract.opportunityId,
      clientRequestId: contract.clientRequestId,
      originalClientAccountId: contract.originalClientAccountId,
      kind: contract.kind,
      origin: contract.origin,
      sourceOfferId: contract.sourceOfferId,
      sourceOfferVersionId: contract.sourceOfferVersionId,
      sourceOffer,
      illustrativeReference: contract.illustrativeReference,
      revision: contract.revision,
      provisional: true,
      createdByWorkspaceMembershipId: contract.createdByWorkspaceMembershipId,
      createdAt: contract.createdAt.toISOString(),
      linkedProjects: await this.projectLinks.linkedProjects(actor, contract),
      ...(clientReference ? { clientReference } : {}),
      version: {
        id: version.id,
        createdContractRevision: version.createdContractRevision,
        predecessorVersionId: version.predecessorVersionId,
        supersededByVersionId: version.supersededByVersionId,
        supersededAt: version.supersededAt?.toISOString() ?? null,
        differences: predecessor
          ? contractVersionDifferences(predecessor.version, version)
          : [],
        representation: renderContractRepresentation({
          templateCode: version.templateCode,
          templateVersion: version.templateVersion,
          clauseVersions: version.clauseVersions,
          illustrativeReference: contract.illustrativeReference,
          versionNumber: version.versionNumber,
          issuingCompanyLabel: version.issuingCompanyLabel,
          recipient,
          createdAt: version.createdAt.toISOString(),
          sourceOffer,
          pricingSnapshotId: version.pricingSnapshotId,
          lines: pricingSnapshot.lines,
          subtotal: pricingSnapshot.subtotal,
          taxTotal: pricingSnapshot.taxTotal,
          total: pricingSnapshot.total,
          currency: pricingSnapshot.currency,
          scopeNote: version.scopeNote,
          commercialConditions: version.commercialConditions,
          termStartsOn: version.termStartsOn,
          termEndsOn: version.termEndsOn,
          specialConditions: version.specialConditions,
          provenance: 'ILLUSTRATIVE',
        }),
        decision,
        signature,
        latestQualityRun: latestRun ? qualityRunView(latestRun, version) : null,
        versionNumber: version.versionNumber,
        recipient,
        issuingCompanyLabel: version.issuingCompanyLabel,
        pricingSnapshotId: version.pricingSnapshotId,
        pricingSnapshot,
        scopeNote: version.scopeNote,
        commercialConditions: version.commercialConditions,
        termStartsOn: version.termStartsOn,
        termEndsOn: version.termEndsOn,
        specialConditions: version.specialConditions,
        decisionState: version.decisionState,
        executionState: version.executionState,
        provenance: version.provenance,
        provisional: true,
        createdByWorkspaceMembershipId: version.createdByWorkspaceMembershipId,
        createdAt: version.createdAt.toISOString(),
      },
    };
  }
}
export function recordedRecipient(version: VersionRow): OfferRecipientCopy {
  const party = {
    legalName: version.recipientLegalName,
    taxId: version.recipientTaxId,
    legalAddress: version.recipientLegalAddress,
  };
  if (
    version.recipientKind === 'PRIMARY' &&
    version.recipientAdditionalLegalEntityId === null
  )
    return { ...party, kind: 'PRIMARY' };
  if (
    version.recipientKind === 'ADDITIONAL' &&
    version.recipientAdditionalLegalEntityId
  )
    return {
      ...party,
      kind: 'ADDITIONAL',
      additionalLegalEntityId: version.recipientAdditionalLegalEntityId,
    };
  throw new Error('Invalid recorded Contract party.');
}
