import { ForbiddenException, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientRequests,
  contracts,
  contractVersions,
  opportunities,
} from '../database/schema/index.js';
import {
  decisionQueueCursor,
  readDecisionQueueCursor,
} from '../commercial-decision-queue/decision-queue-cursor.js';

@Injectable()
export class ContractDecisionQueueService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
  ) {}

  list({ actor, query }: { actor: ActorContext; query: unknown }) {
    return this.database.transaction(
      async () => {
        const companyId = await this.authorization.requireContractAccess(
          actor,
          ['commercial.contract.read', 'commercial.contract.approve'],
        );
        await this.authorization.requireCommercialIntakeAccess(actor, 'read');
        const scope = { workspaceId: actor.workspaceId, companyId };
        const cursor = readDecisionQueueCursor({
          query,
          scope,
          family: 'CONTRACT',
        });
        let modelDecision = false;
        try {
          await this.authorization.requireContractAccess(actor, [
            'commercial.contract.read',
            'commercial.contract.approve',
            'commercial.contract.model_based.approve',
          ]);
          await this.authorization.requireOfferAccess(actor, [
            'commercial.offer.read',
          ]);
          modelDecision = true;
        } catch (error) {
          // Optional source/model rights never become a prerequisite for legacy work.
          if (!(error instanceof ForbiddenException)) throw error;
        }
        const rows = await this.database.connection
          .select({
            contractId: contracts.id,
            versionId: contractVersions.id,
            opportunityId: contracts.opportunityId,
            clientRequestId: contracts.clientRequestId,
            opportunityTitle: opportunities.title,
            illustrativeReference: contracts.illustrativeReference,
            versionNumber: contractVersions.versionNumber,
            kind: contracts.kind,
            provenance: contractVersions.provenance,
            createdAt: sql<string>`to_char(${contractVersions.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
          })
          .from(contractVersions)
          .innerJoin(
            contracts,
            and(
              eq(contracts.workspaceId, contractVersions.workspaceId),
              eq(contracts.companyId, contractVersions.companyId),
              eq(contracts.id, contractVersions.contractId),
              eq(contracts.opportunityId, contractVersions.opportunityId),
            ),
          )
          .innerJoin(
            opportunities,
            and(
              eq(opportunities.workspaceId, contracts.workspaceId),
              eq(opportunities.companyId, contracts.companyId),
              eq(opportunities.id, contracts.opportunityId),
              eq(opportunities.clientRequestId, contracts.clientRequestId),
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
          .where(
            and(
              eq(contractVersions.workspaceId, actor.workspaceId),
              eq(contractVersions.companyId, companyId),
              isNull(contractVersions.supersededByVersionId),
              eq(contractVersions.decisionState, 'PENDING'),
              inArray(contracts.kind, ['CONTRACT', 'PRECONTRACT', 'ADDENDUM']),
              or(
                eq(contractVersions.provenance, 'ILLUSTRATIVE'),
                modelDecision
                  ? eq(contractVersions.provenance, 'COMPANY_MODEL_OFFER')
                  : undefined,
              ),
              cursor
                ? sql<boolean>`(${contractVersions.createdAt}, ${contractVersions.id}) > (${cursor.createdAt}::timestamptz, ${cursor.versionId}::uuid)`
                : undefined,
            ),
          )
          .orderBy(asc(contractVersions.createdAt), asc(contractVersions.id))
          .limit(26);
        const page = rows.slice(0, 25),
          last = page.at(-1);
        return {
          items: page.map((row) => ({ ...scope, ...row })),
          ...(rows.length > 25 && last
            ? {
                nextCursor: decisionQueueCursor({
                  scope,
                  boundary: last,
                  family: 'CONTRACT',
                }),
              }
            : {}),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
