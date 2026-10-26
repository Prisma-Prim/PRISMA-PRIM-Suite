import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DocumentSigningReferenceService } from '../documents/document-signing-reference.service.js';
import { readReportedSigningDeclaration } from './reported-contract-signing-view.js';
import { modelContractView } from './model-contract-view.js';
import { contractSource } from './contract-source.js';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, lt } from 'drizzle-orm';
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
import { contractQualityRuleSetVersion } from './contract-quality.js';
import { ContractProjectsService } from './contract-projects.service.js';
import {
  renderContractRepresentation,
  renderAddendumRepresentation,
  renderPrecontractRepresentation,
  type PreliminaryWork,
} from './contract-representation.js';
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
    private readonly signingDocuments: DocumentSigningReferenceService,
    private readonly clients: ClientOperationalReferenceService,
  ) {}
  async read(input: {
    actor: ActorContext;
    opportunityId: string;
    contractId?: string;
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
        ...(input.contractId === undefined
          ? {}
          : { contractId: input.contractId }),
        versionId: input.versionId,
      });
      if (!found) {
        if (input.versionId || input.contractId) throw new NotFoundException();
        return null;
      }
      if (input.versionId !== undefined && input.versionId !== found.version.id)
        throw new NotFoundException();
      return this.view(input.actor, found.contract, found.version);
    });
  }

  /** Both main agreements of one Opportunity for the Request detail (PRD 19.13). */
  async readOpportunity(input: { actor: ActorContext; opportunityId: string }) {
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
      const target = {
        actor: input.actor,
        companyId,
        opportunityId: opportunity.id,
      };
      const contract = await this.find(target);
      const precontract = await this.findPrecontract(target);
      return {
        contract: contract
          ? await this.view(input.actor, contract.contract, contract.version)
          : null,
        precontract: precontract
          ? {
              id: precontract.contract.id,
              illustrativeReference: precontract.contract.illustrativeReference,
              versionNumber: precontract.version.versionNumber,
              decisionState: precontract.version.decisionState,
              executionState: precontract.version.executionState,
            }
          : null,
      };
    });
  }

  async listVersions(input: {
    actor: ActorContext;
    opportunityId: string;
    contractId?: string;
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
        ...(input.contractId === undefined
          ? {}
          : { contractId: input.contractId }),
      });
      if (!current) {
        if (input.contractId !== undefined) throw new NotFoundException();
        if (input.cursor !== undefined)
          throw new BadRequestException({ field: 'cursor' });
        return { items: [], nextCursor: null };
      }
      if (
        current.contract.origin === 'COMPANY_MODEL_OFFER' &&
        current.version.executionState === 'EXECUTED'
      )
        await this.clients.readReferenceClient(
          input.actor,
          current.contract.originalClientAccountId,
        );
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
          ...(input.contractId === undefined
            ? {}
            : { contractId: input.contractId }),
          versionId: input.cursor,
        });
        if (!cursor) throw new BadRequestException({ field: 'cursor' });
        before = cursor.version.versionNumber;
      }
      // New-mode history is a bounded index. Exact reads own the complete
      // copied model/representation; listing never materializes fifty copies.
      if (current.contract.origin === 'COMPANY_MODEL_OFFER') {
        const rows = await this.databaseContext.connection
          .select({
            id: contractVersions.id,
            versionNumber: contractVersions.versionNumber,
            provenance: contractVersions.provenance,
          })
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
        const items = rows.slice(0, limit);
        return {
          items,
          nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
        };
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
    contractId,
  }: {
    actor: ActorContext;
    companyId: string;
    opportunityId: string;
    contractId?: string;
    versionId?: string;
  }) {
    if (
      contractId !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        contractId,
      )
    )
      return undefined;
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
          contractId === undefined
            ? eq(contracts.kind, 'CONTRACT')
            : eq(contracts.id, contractId),
          versionId === undefined
            ? undefined
            : eq(contractVersions.id, versionId),
        ),
      )
      .orderBy(desc(contractVersions.versionNumber))
      .limit(1);
    return found;
  }

  /** Head of the Opportunity Precontract, at most one per Opportunity (PC2). */
  async findPrecontract({
    actor,
    companyId,
    opportunityId,
  }: {
    actor: ActorContext;
    companyId: string;
    opportunityId: string;
  }) {
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
          eq(contracts.kind, 'PRECONTRACT'),
        ),
      )
      .orderBy(desc(contractVersions.versionNumber))
      .limit(1);
    return found;
  }

  async view(actor: ActorContext, contract: ContractRow, version: VersionRow) {
    if (version.provenance === 'COMPANY_MODEL_OFFER') {
      // The declared history adds Client identity read; pre-declaration frozen
      // Contract reads retain their existing Commercial §30 authority.
      if (version.executionState === 'EXECUTED')
        await this.clients.readReferenceClient(
          actor,
          contract.originalClientAccountId,
        );
      const signature = await readReportedSigningDeclaration({
        database: this.databaseContext,
        documents: this.signingDocuments,
        actor,
        contract,
        version,
      });
      const linkedProjects = await this.projectLinks.linkedProjects(
        actor,
        contract,
      );
      return modelContractView(this.databaseContext, actor, contract, version, {
        kind: 'CURRENT',
        signature,
        linkedProjects,
      });
    }
    const source = contractSource(contract, version);
    if (
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
    const pricingSnapshot =
      version.pricingSnapshotId === null
        ? null
        : await this.pricing.resolveContractVersionSnapshot({
            actor,
            companyId: contract.companyId,
            opportunityId: contract.opportunityId,
            contractVersionId: version.id,
          });
    // Approval and signature runs use the rule set bound to the immutable
    // Snapshot. Only an older run recorded before rule set v2 existed may name
    // version 1 on a version bound to version 2; nothing else is readable.
    const qualityRuleSetVersion = contractQualityRuleSetVersion(
      pricingSnapshot,
      contract.origin,
    );
    const latestQualityRun = latestRun
      ? qualityRunView(latestRun, version, contract)
      : null;
    if (
      [
        decision?.kind === 'APPROVE' ? decision.qualityRun : null,
        signature?.qualityRun ?? null,
      ].some(
        (run) => run !== null && run.ruleSetVersion !== qualityRuleSetVersion,
      ) ||
      (latestQualityRun !== null &&
        latestQualityRun.ruleSetVersion > qualityRuleSetVersion)
    )
      throw new Error(
        'A stored Contract run does not match its bound rule set.',
      );
    const sourceOffer =
      source.kind !== 'ACCEPTED_OFFER' && source.kind !== 'OFFER_PREPARATION'
        ? null
        : await this.offers.readContractSourceReference({
            actor,
            contractId: contract.id,
            contractVersionId: version.id,
            opportunityId: contract.opportunityId,
          });
    const parent =
      contract.kind === 'ADDENDUM'
        ? await this.addendumSource(actor, contract)
        : null;
    const precontract =
      contract.precontractId === null
        ? null
        : await this.find({
            actor,
            companyId: contract.companyId,
            opportunityId: contract.opportunityId,
            contractId: contract.precontractId,
          });
    if (
      contract.precontractId !== null &&
      (contract.kind !== 'CONTRACT' ||
        precontract?.contract.kind !== 'PRECONTRACT')
    )
      throw new Error('Invalid recorded Precontract reference.');
    const preliminaryWork = recordedPreliminaryWork(version);
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
          contractId: contract.id,
        })
      : null;
    if (version.predecessorVersionId && !predecessor)
      throw new Error('Missing Contract predecessor.');
    const previousSnapshot =
      predecessor &&
      predecessor.version.pricingSnapshotId !== null &&
      predecessor.version.pricingSnapshotId !== version.pricingSnapshotId
        ? await this.pricing.resolveContractVersionSnapshot({
            actor,
            companyId: contract.companyId,
            opportunityId: contract.opportunityId,
            contractVersionId: predecessor.version.id,
          })
        : null;
    const differences = predecessor
      ? contractVersionDifferences(predecessor.version, version).map(
          (difference) =>
            difference.field === 'pricingSnapshotId'
              ? {
                  ...difference,
                  beforeSnapshot: snapshotDifference(previousSnapshot),
                  afterSnapshot: snapshotDifference(pricingSnapshot),
                }
              : difference,
        )
      : [];
    return {
      id: contract.id,
      companyId: contract.companyId,
      opportunityId: contract.opportunityId,
      clientRequestId: contract.clientRequestId,
      originalClientAccountId: contract.originalClientAccountId,
      kind: contract.kind,
      origin: contract.origin,
      ...(source.kind === 'DIRECT'
        ? { directReason: contract.directReason }
        : {}),
      sourceOfferId: contract.sourceOfferId,
      sourceOfferVersionId: contract.sourceOfferVersionId,
      sourceOffer,
      parentContractId: contract.parentContractId,
      addendumOrdinal: contract.addendumOrdinal,
      precontract: precontract
        ? {
            id: precontract.contract.id,
            illustrativeReference: precontract.contract.illustrativeReference,
          }
        : null,
      parent: parent
        ? {
            id: parent.contract.id,
            illustrativeReference: parent.contract.illustrativeReference,
            versionNumber: parent.version.versionNumber,
            revision: parent.contract.revision,
            kind: parent.contract.kind,
          }
        : null,
      addenda: await this.listAddenda(actor, contract),
      illustrativeReference: contract.illustrativeReference,
      revision: contract.revision,
      provisional: true,
      createdByWorkspaceMembershipId: contract.createdByWorkspaceMembershipId,
      createdAt: contract.createdAt.toISOString(),
      linkedProjects: await this.projectLinks.linkedProjects(
        actor,
        parent?.contract ?? contract,
      ),
      ...(clientReference ? { clientReference } : {}),
      version: {
        ...(contract.origin === 'OFFER_PREPARATION'
          ? { sourceOfferVersionId: version.sourceOfferVersionId }
          : {}),
        id: version.id,
        qualityRuleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE' as const,
        qualityRuleSetVersion,
        createdContractRevision: version.createdContractRevision,
        predecessorVersionId: version.predecessorVersionId,
        supersededByVersionId: version.supersededByVersionId,
        supersededAt: version.supersededAt?.toISOString() ?? null,
        differences,
        representation:
          parent && contract.addendumOrdinal && version.changeSummary !== null
            ? renderAddendumRepresentation({
                templateCode: version.templateCode,
                templateVersion: version.templateVersion,
                clauseVersions: version.clauseVersions,
                illustrativeReference: contract.illustrativeReference,
                versionNumber: version.versionNumber,
                issuingCompanyLabel: version.issuingCompanyLabel,
                recipient,
                createdAt: version.createdAt.toISOString(),
                parent: {
                  id: parent.contract.id,
                  illustrativeReference: parent.contract.illustrativeReference,
                  versionNumber: parent.version.versionNumber,
                  kind: parent.contract.kind,
                },
                ordinal: contract.addendumOrdinal,
                changeSummary: version.changeSummary,
                termEndsOn: version.termEndsOn,
                snapshot: pricingSnapshot,
              })
            : contract.kind === 'PRECONTRACT' &&
                sourceOffer &&
                pricingSnapshot &&
                version.pricingSnapshotId &&
                version.termEndsOn &&
                preliminaryWork
              ? renderPrecontractRepresentation({
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
                  preliminaryWork,
                  provenance: 'ILLUSTRATIVE',
                })
              : contract.kind === 'CONTRACT' &&
                  (sourceOffer || source.kind === 'DIRECT') &&
                  pricingSnapshot &&
                  version.pricingSnapshotId
                ? renderContractRepresentation({
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
                    precontractReference:
                      precontract?.contract.illustrativeReference ?? null,
                    provenance: 'ILLUSTRATIVE',
                  })
                : missingRepresentation(),
        decision,
        signature,
        latestQualityRun,
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
        preliminaryWork,
        changeSummary: version.changeSummary,
        decisionState: version.decisionState,
        executionState: version.executionState,
        provenance: version.provenance,
        provisional: true,
        createdByWorkspaceMembershipId: version.createdByWorkspaceMembershipId,
        createdAt: version.createdAt.toISOString(),
      },
    };
  }
  async addendumSource(actor: ActorContext, contract: ContractRow) {
    if (!contract.parentContractId) throw new Error('Missing Addendum parent.');
    const parent = await this.find({
      actor,
      companyId: contract.companyId,
      opportunityId: contract.opportunityId,
      contractId: contract.parentContractId,
    });
    if (
      !parent ||
      !['CONTRACT', 'PRECONTRACT'].includes(parent.contract.kind) ||
      parent.version.executionState !== 'EXECUTED'
    )
      throw new Error('Invalid Addendum parent.');
    const snapshot =
      parent.version.pricingSnapshotId === null
        ? null
        : await this.pricing.resolveContractVersionSnapshot({
            actor,
            companyId: contract.companyId,
            opportunityId: contract.opportunityId,
            contractVersionId: parent.version.id,
          });
    return { ...parent, currency: snapshot?.currency ?? null };
  }
  private async listAddenda(actor: ActorContext, contract: ContractRow) {
    const rows = await this.databaseContext.connection
      .select()
      .from(contracts)
      .where(
        and(
          eq(contracts.workspaceId, actor.workspaceId),
          eq(contracts.companyId, contract.companyId),
          eq(contracts.opportunityId, contract.opportunityId),
          eq(contracts.parentContractId, contract.id),
          eq(contracts.kind, 'ADDENDUM'),
        ),
      )
      .orderBy(asc(contracts.addendumOrdinal));
    const items = [];
    for (const row of rows) {
      const head = await this.find({
        actor,
        companyId: contract.companyId,
        opportunityId: contract.opportunityId,
        contractId: row.id,
      });
      if (!head) throw new Error('Missing Addendum head.');
      items.push({
        id: row.id,
        addendumOrdinal: row.addendumOrdinal,
        illustrativeReference: row.illustrativeReference,
        versionNumber: head.version.versionNumber,
        decisionState: head.version.decisionState,
        executionState: head.version.executionState,
      });
    }
    return items;
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

/** Precontract-only content; the database binds it to the Precontract Template. */
export function recordedPreliminaryWork(
  version: VersionRow,
): PreliminaryWork | null {
  const scope = version.preliminaryWorkScope,
    financialConditions = version.preliminaryFinancialConditions,
    limits = version.preliminaryLimits;
  if (scope === null && financialConditions === null && limits === null)
    return null;
  if (scope === null || financialConditions === null || limits === null)
    throw new Error('Invalid recorded preliminary work.');
  return { scope, financialConditions, limits };
}

function missingRepresentation(): never {
  throw new Error('Missing Contract generation inputs.');
}

function snapshotDifference(
  snapshot: { id: string; currency: string; total: string } | null,
) {
  return snapshot
    ? { id: snapshot.id, currency: snapshot.currency, total: snapshot.total }
    : null;
}
