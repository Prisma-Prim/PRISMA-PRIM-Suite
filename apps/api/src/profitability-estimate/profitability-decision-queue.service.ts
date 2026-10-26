import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  profitabilityEstimates,
  profitabilityEstimateVersions,
  profitabilityEstimateDecisions,
} from '../database/schema/index.js';
import {
  decisionQueueCursor,
  readDecisionQueueCursor,
} from './profitability-decision-queue.pagination.js';

@Injectable()
export class ProfitabilityDecisionQueueService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly intake: CommercialIntakeService,
  ) {}
  list({ actor, query }: { actor: ActorContext; query: unknown }) {
    return this.database.transaction(
      async () => {
        const companyId =
          await this.authorization.requireProfitabilityEstimateAccess(
            actor,
            'decide',
          );
        // Check independent Opportunity authority even for an empty queue.
        await this.authorization.requireCommercialIntakeAccess(actor, 'read');
        const scope = { workspaceId: actor.workspaceId, companyId };
        const cursor = readDecisionQueueCursor(query, scope);
        const rows = await this.database.connection
          .select({
            versionId: profitabilityEstimateVersions.id,
            estimateId: profitabilityEstimateVersions.estimateId,
            opportunityId: profitabilityEstimateVersions.opportunityId,
            clientRequestId: profitabilityEstimateVersions.clientRequestId,
            versionNumber: profitabilityEstimateVersions.versionNumber,
            latestVersionNumber: profitabilityEstimates.latestVersionNumber,
            createdAt: profitabilityEstimateVersions.createdAt,
            cursorTime: sql<string>`to_char(${profitabilityEstimateVersions.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
          })
          .from(profitabilityEstimateVersions)
          .innerJoin(
            profitabilityEstimates,
            and(
              eq(
                profitabilityEstimates.workspaceId,
                profitabilityEstimateVersions.workspaceId,
              ),
              eq(
                profitabilityEstimates.companyId,
                profitabilityEstimateVersions.companyId,
              ),
              eq(
                profitabilityEstimates.id,
                profitabilityEstimateVersions.estimateId,
              ),
            ),
          )
          .leftJoin(
            profitabilityEstimateDecisions,
            and(
              eq(
                profitabilityEstimateDecisions.workspaceId,
                profitabilityEstimateVersions.workspaceId,
              ),
              eq(
                profitabilityEstimateDecisions.companyId,
                profitabilityEstimateVersions.companyId,
              ),
              eq(
                profitabilityEstimateDecisions.versionId,
                profitabilityEstimateVersions.id,
              ),
            ),
          )
          .where(
            and(
              eq(profitabilityEstimateVersions.workspaceId, actor.workspaceId),
              eq(profitabilityEstimateVersions.companyId, companyId),
              isNull(profitabilityEstimateDecisions.id),
              cursor
                ? sql<boolean>`(${profitabilityEstimateVersions.createdAt}, ${profitabilityEstimateVersions.id}) > (${cursor.createdAt}::timestamptz, ${cursor.versionId}::uuid)`
                : undefined,
            ),
          )
          .orderBy(
            asc(profitabilityEstimateVersions.createdAt),
            asc(profitabilityEstimateVersions.id),
          )
          .limit(26);
        const page = rows.slice(0, 25);
        const titles = await this.intake.readProfitabilityOpportunityTitles(
          actor,
          [...new Set(page.map((row) => row.opportunityId))],
        );
        const items = page.map((entry) => {
          const { createdAt } = entry;
          const row = {
            versionId: entry.versionId,
            estimateId: entry.estimateId,
            opportunityId: entry.opportunityId,
            clientRequestId: entry.clientRequestId,
            versionNumber: entry.versionNumber,
            latestVersionNumber: entry.latestVersionNumber,
          };
          const opportunityTitle = titles.get(row.opportunityId);
          if (opportunityTitle === undefined)
            throw new InternalServerErrorException(
              'Incomplete estimate Opportunity.',
            );
          return {
            ...scope,
            ...row,
            createdAt: createdAt.toISOString(),
            opportunityTitle,
          };
        });
        const last = page.at(-1);
        return {
          items,
          ...(rows.length > 25 && last
            ? {
                nextCursor: decisionQueueCursor(scope, {
                  createdAt: last.cursorTime,
                  versionId: last.versionId,
                }),
              }
            : {}),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
