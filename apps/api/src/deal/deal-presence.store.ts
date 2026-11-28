import { Injectable } from '@nestjs/common';
import { and, eq, inArray, max, notInArray, sql } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import {
  certificationCases,
  contractProjectLinks,
  contracts,
  contractVersions,
  offerVersions,
  opportunities,
  opportunityFollowUpHeads,
  pricingSnapshots,
  profitabilityEstimateVersions,
} from '../database/schema/index.js';

/** One Company of one Workspace, always taken from the server actor context. */
export interface DealScope {
  readonly workspaceId: string;
  readonly companyId: string;
}

/** The latest record time of one stage per Opportunity; absent means none. */
export type LatestRecordTimes = ReadonlyMap<string, Date>;

/**
 * Batched, read-only existence facts for one page of deals. Each query is
 * scoped to the actor's Company and is asked only after the stage owner's
 * read permission was proven by the caller, in the transaction that holds
 * that permission's grants; it answers only whether and when a record
 * exists, never a record's content.
 */
@Injectable()
export class DealPresenceStore {
  constructor(private readonly database: DatabaseContext) {}

  /** The initial Opportunity of each Request with its last own change. */
  async initialOpportunities(
    scope: DealScope,
    clientRequestIds: readonly string[],
  ): Promise<
    ReadonlyMap<
      string,
      { readonly opportunityId: string; readonly changedAt: Date }
    >
  > {
    if (clientRequestIds.length === 0) return new Map();
    const rows = await this.database.connection
      .select({
        id: opportunities.id,
        clientRequestId: opportunities.clientRequestId,
        changedAt:
          sql<Date>`coalesce(${opportunities.lastUpdatedAt}, ${opportunities.createdAt})`.mapWith(
            opportunities.createdAt,
          ),
      })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, scope.workspaceId),
          eq(opportunities.companyId, scope.companyId),
          eq(opportunities.initial, true),
          inArray(opportunities.clientRequestId, [...clientRequestIds]),
        ),
      );
    return new Map(
      rows.map((row) => [
        row.clientRequestId,
        { opportunityId: row.id, changedAt: row.changedAt },
      ]),
    );
  }

  /** The last own change of one Opportunity. */
  async opportunityChangedAt(scope: DealScope, opportunityId: string) {
    const [row] = await this.database.connection
      .select({
        changedAt:
          sql<Date>`coalesce(${opportunities.lastUpdatedAt}, ${opportunities.createdAt})`.mapWith(
            opportunities.createdAt,
          ),
      })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, scope.workspaceId),
          eq(opportunities.companyId, scope.companyId),
          eq(opportunities.id, opportunityId),
        ),
      );
    return row?.changedAt;
  }

  async latestPricingSnapshots(
    scope: DealScope,
    opportunityIds: readonly string[],
  ): Promise<LatestRecordTimes> {
    if (opportunityIds.length === 0) return new Map();
    return latestTimes(
      await this.database.connection
        .select({
          opportunityId: pricingSnapshots.opportunityId,
          at: max(pricingSnapshots.calculatedAt),
        })
        .from(pricingSnapshots)
        .where(
          and(
            eq(pricingSnapshots.workspaceId, scope.workspaceId),
            eq(pricingSnapshots.companyId, scope.companyId),
            inArray(pricingSnapshots.opportunityId, [...opportunityIds]),
          ),
        )
        .groupBy(pricingSnapshots.opportunityId),
    );
  }

  async latestProfitabilityEstimates(
    scope: DealScope,
    opportunityIds: readonly string[],
  ): Promise<LatestRecordTimes> {
    if (opportunityIds.length === 0) return new Map();
    return latestTimes(
      await this.database.connection
        .select({
          opportunityId: profitabilityEstimateVersions.opportunityId,
          at: max(profitabilityEstimateVersions.createdAt),
        })
        .from(profitabilityEstimateVersions)
        .where(
          and(
            eq(profitabilityEstimateVersions.workspaceId, scope.workspaceId),
            eq(profitabilityEstimateVersions.companyId, scope.companyId),
            inArray(profitabilityEstimateVersions.opportunityId, [
              ...opportunityIds,
            ]),
          ),
        )
        .groupBy(profitabilityEstimateVersions.opportunityId),
    );
  }

  async latestOfferVersions(
    scope: DealScope,
    opportunityIds: readonly string[],
  ): Promise<LatestRecordTimes> {
    if (opportunityIds.length === 0) return new Map();
    return latestTimes(
      await this.database.connection
        .select({
          opportunityId: offerVersions.opportunityId,
          at: max(offerVersions.createdAt),
        })
        .from(offerVersions)
        .where(
          and(
            eq(offerVersions.workspaceId, scope.workspaceId),
            eq(offerVersions.companyId, scope.companyId),
            inArray(offerVersions.opportunityId, [...opportunityIds]),
          ),
        )
        .groupBy(offerVersions.opportunityId),
    );
  }

  /** Versions of the excluded Contracts, which the caller may not show, are left out. */
  async latestContractVersions(
    scope: DealScope,
    opportunityIds: readonly string[],
    excludedContractIds: readonly string[],
  ): Promise<LatestRecordTimes> {
    if (opportunityIds.length === 0) return new Map();
    return latestTimes(
      await this.database.connection
        .select({
          opportunityId: contractVersions.opportunityId,
          at: max(contractVersions.createdAt),
        })
        .from(contractVersions)
        .where(
          and(
            eq(contractVersions.workspaceId, scope.workspaceId),
            eq(contractVersions.companyId, scope.companyId),
            inArray(contractVersions.opportunityId, [...opportunityIds]),
            excludedContractIds.length === 0
              ? undefined
              : notInArray(contractVersions.contractId, [
                  ...excludedContractIds,
                ]),
          ),
        )
        .groupBy(contractVersions.opportunityId),
    );
  }

  /**
   * Each Contract with an executed Company-model Version and its reference
   * Client, whose read the Contract owner also requires to show it.
   */
  async executedCompanyModelContracts(
    scope: DealScope,
    opportunityIds: readonly string[],
  ): Promise<
    readonly {
      readonly contractId: string;
      readonly referenceClientId: string;
    }[]
  > {
    if (opportunityIds.length === 0) return [];
    return this.database.connection
      .selectDistinct({
        contractId: contracts.id,
        referenceClientId: contracts.originalClientAccountId,
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
          eq(contracts.workspaceId, scope.workspaceId),
          eq(contracts.companyId, scope.companyId),
          inArray(contracts.opportunityId, [...opportunityIds]),
          eq(contractVersions.provenance, 'COMPANY_MODEL_OFFER'),
          eq(contractVersions.executionState, 'EXECUTED'),
        ),
      );
  }

  /**
   * Projects linked to any Contract, Precontract or Addendum parent of each
   * Opportunity, leaving out the links of the excluded Contracts.
   */
  async linkedProjects(
    scope: DealScope,
    opportunityIds: readonly string[],
    excludedContractIds: readonly string[],
  ) {
    if (opportunityIds.length === 0) return [];
    return this.database.connection
      .select({
        opportunityId: contracts.opportunityId,
        projectId: contractProjectLinks.projectId,
        linkedAt: contractProjectLinks.linkedAt,
      })
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
          eq(contractProjectLinks.workspaceId, scope.workspaceId),
          eq(contractProjectLinks.companyId, scope.companyId),
          inArray(contracts.opportunityId, [...opportunityIds]),
          excludedContractIds.length === 0
            ? undefined
            : notInArray(contractProjectLinks.contractId, [
                ...excludedContractIds,
              ]),
        ),
      );
  }

  /** The latest opened Certification Case of each given Project. */
  async latestCertificationCases(
    scope: DealScope,
    projectIds: readonly string[],
  ): Promise<LatestRecordTimes> {
    if (projectIds.length === 0) return new Map();
    const rows = await this.database.connection
      .select({
        projectId: certificationCases.projectId,
        at: max(certificationCases.openedAt),
      })
      .from(certificationCases)
      .where(
        and(
          eq(certificationCases.workspaceId, scope.workspaceId),
          eq(certificationCases.companyId, scope.companyId),
          inArray(certificationCases.projectId, [...projectIds]),
        ),
      )
      .groupBy(certificationCases.projectId);
    return new Map(
      rows.flatMap((row) => (row.at ? [[row.projectId, row.at]] : [])),
    );
  }

  /** The recorded follow-up date of each Opportunity that has one. */
  async followUpDates(scope: DealScope, opportunityIds: readonly string[]) {
    if (opportunityIds.length === 0) return new Map<string, string | null>();
    const rows = await this.database.connection
      .select({
        opportunityId: opportunityFollowUpHeads.opportunityId,
        followUpOn: opportunityFollowUpHeads.followUpOn,
      })
      .from(opportunityFollowUpHeads)
      .where(
        and(
          eq(opportunityFollowUpHeads.workspaceId, scope.workspaceId),
          eq(opportunityFollowUpHeads.companyId, scope.companyId),
          inArray(opportunityFollowUpHeads.opportunityId, [...opportunityIds]),
        ),
      );
    return new Map(rows.map((row) => [row.opportunityId, row.followUpOn]));
  }
}

function latestTimes(
  rows: readonly { opportunityId: string; at: Date | null }[],
): LatestRecordTimes {
  return new Map(
    rows.flatMap((row) => (row.at ? [[row.opportunityId, row.at]] : [])),
  );
}
