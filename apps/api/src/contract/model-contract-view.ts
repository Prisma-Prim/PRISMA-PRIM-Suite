import type { ReportedSigningDeclaration } from './reported-contract-signing-view.js';
import type { ContractProjectsService } from './contract-projects.service.js';
import { modelContractDifferences } from './model-contract-differences.js';
import type { ActorContext } from '../access/access.types.js';
import { readContractDecision } from './contract-decision-command.js';
import { qualityRunView } from './contract-quality-view.js';
import { and, desc, eq } from 'drizzle-orm';
import type { DatabaseContext } from '../database/database-context.js';
import {
  contracts,
  contractVersions,
  contractQualityRuns,
  contractProjectLinks,
} from '../database/schema/index.js';
import { storedModelContractSnapshot } from './model-contract-snapshot.js';

/** A copied Contract is independently readable; never borrow model/Offer/cost reads. */
export async function modelContractView(
  database: DatabaseContext,
  actor: ActorContext,
  contract: typeof contracts.$inferSelect,
  version: typeof contractVersions.$inferSelect,
  projection:
    | { kind: 'CREATION_RECEIPT' }
    | {
        kind: 'CURRENT';
        signature: ReportedSigningDeclaration | null;
        linkedProjects: Awaited<
          ReturnType<ContractProjectsService['linkedProjects']>
        >;
      },
) {
  const snapshot = storedModelContractSnapshot(contract, version);
  const creationReceipt = projection.kind === 'CREATION_RECEIPT';
  const signature = projection.kind === 'CURRENT' ? projection.signature : null;
  const allLinks = creationReceipt
    ? []
    : await database.connection
        .select({ id: contractProjectLinks.id })
        .from(contractProjectLinks)
        .where(
          and(
            eq(contractProjectLinks.workspaceId, contract.workspaceId),
            eq(contractProjectLinks.companyId, contract.companyId),
            eq(contractProjectLinks.contractId, contract.id),
          ),
        );
  const [previous] = version.predecessorVersionId
    ? await database.connection
        .select()
        .from(contractVersions)
        .where(
          and(
            eq(contractVersions.workspaceId, version.workspaceId),
            eq(contractVersions.companyId, version.companyId),
            eq(contractVersions.contractId, version.contractId),
            eq(contractVersions.id, version.predecessorVersionId),
          ),
        )
    : [];
  if (version.predecessorVersionId && !previous)
    throw new Error('Missing model Contract predecessor.');
  const differences = previous
    ? modelContractDifferences(
        previous,
        storedModelContractSnapshot(contract, previous),
        version,
        snapshot,
      )
    : [];
  const decision = creationReceipt
    ? null
    : await readContractDecision(database, actor, contract, version);
  const [quality] = creationReceipt
    ? []
    : await database.connection
        .select()
        .from(contractQualityRuns)
        .where(
          and(
            eq(contractQualityRuns.workspaceId, version.workspaceId),
            eq(contractQualityRuns.companyId, version.companyId),
            eq(contractQualityRuns.contractVersionId, version.id),
          ),
        )
        .orderBy(desc(contractQualityRuns.sequence))
        .limit(1);
  const decisionState = decision
    ? decision.kind === 'APPROVE'
      ? 'APPROVED'
      : 'REJECTED'
    : 'PENDING';
  if (
    !creationReceipt &&
    (version.decisionState !== decisionState ||
      version.executionState !== (signature ? 'EXECUTED' : 'NOT_EXECUTED') ||
      (!version.supersededByVersionId &&
        contract.revision !==
          version.createdContractRevision +
            (decision ? 1 : 0) +
            (signature ? 1 : 0) +
            allLinks.length))
  )
    throw new Error('Invalid model Contract decision state.');
  const latestQualityRun = quality
    ? qualityRunView(quality, version, contract)
    : null;
  const recipient = {
    legalName: version.recipientLegalName,
    taxId: version.recipientTaxId,
    legalAddress: version.recipientLegalAddress,
    ...(version.recipientKind === 'PRIMARY'
      ? { kind: 'PRIMARY' as const }
      : {
          kind: 'ADDITIONAL' as const,
          additionalLegalEntityId: version.recipientAdditionalLegalEntityId,
        }),
  };
  return {
    id: contract.id,
    companyId: contract.companyId,
    opportunityId: contract.opportunityId,
    clientRequestId: contract.clientRequestId,
    originalClientAccountId: contract.originalClientAccountId,
    kind: 'CONTRACT' as const,
    origin: 'COMPANY_MODEL_OFFER' as const,
    sourceOfferId: contract.sourceOfferId,
    sourceOfferVersionId: contract.sourceOfferVersionId,
    sourceOffer: {
      id: snapshot.offerSource.offerId,
      versionId: snapshot.offerSource.offerVersionId,
      versionNumber: snapshot.offerSource.offerVersionNumber,
      illustrativeReference: snapshot.offerSource.illustrativeReference,
    },
    parentContractId: null,
    addendumOrdinal: null,
    precontract: null,
    parent: null,
    addenda: [],
    linkedProjects:
      projection.kind === 'CURRENT' ? projection.linkedProjects : [],
    illustrativeReference: contract.illustrativeReference,
    revision: creationReceipt
      ? version.createdContractRevision
      : contract.revision,
    provisional: true as const,
    eligibility: 'NON_OFFICIAL_REHEARSAL' as const,
    createdByWorkspaceMembershipId: contract.createdByWorkspaceMembershipId,
    createdAt: contract.createdAt.toISOString(),
    version: {
      id: version.id,
      sourceOfferVersionId: version.sourceOfferVersionId,
      versionNumber: version.versionNumber,
      qualityRuleSet: 'CONTRACT_QUALITY_COMPANY_MODEL' as const,
      qualityRuleSetVersion: 1 as const,
      createdContractRevision: version.createdContractRevision,
      predecessorVersionId: version.predecessorVersionId,
      supersededByVersionId: creationReceipt
        ? null
        : version.supersededByVersionId,
      supersededAt: creationReceipt
        ? null
        : (version.supersededAt?.toISOString() ?? null),
      differences,
      representation: snapshot.representation,
      modelGeneration: {
        modelSource: snapshot.modelSource,
        offerSource: snapshot.offerSource,
        caseDetails: snapshot.caseDetails,
        financials: snapshot.financials,
      },
      decision,
      signature,
      latestQualityRun,
      recipient,
      issuingCompanyLabel: version.issuingCompanyLabel,
      pricingSnapshotId: null,
      pricingSnapshot: null,
      scopeNote: version.scopeNote,
      commercialConditions: version.commercialConditions,
      termStartsOn: version.termStartsOn,
      termEndsOn: version.termEndsOn,
      specialConditions: version.specialConditions,
      preliminaryWork: null,
      changeSummary: null,
      decisionState,
      executionState: signature
        ? ('EXECUTED' as const)
        : ('NOT_EXECUTED' as const),
      provenance: 'COMPANY_MODEL_OFFER' as const,
      provisional: true as const,
      createdByWorkspaceMembershipId: version.createdByWorkspaceMembershipId,
      createdAt: version.createdAt.toISOString(),
    },
  };
}

/** Rebuild the committed creation result from immutable content and the command's
 * known PENDING creation state. Later decisions, lineage and head revisions are
 * separate facts, so they cannot change the receipt. Never reselect live sources.
 */
export function modelContractCreationReceipt(
  database: DatabaseContext,
  actor: ActorContext,
  contract: typeof contracts.$inferSelect,
  version: typeof contractVersions.$inferSelect,
) {
  return modelContractView(database, actor, contract, version, {
    kind: 'CREATION_RECEIPT',
  });
}
