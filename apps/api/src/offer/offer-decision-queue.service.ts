import { ForbiddenException, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientRequests,
  opportunities,
  offerDecisions,
  offers,
  offerVersions,
} from '../database/schema/index.js';
import {
  offerDecisionCursor,
  readOfferDecisionCursor,
} from './offer-decision-queue.pagination.js';

@Injectable()
export class OfferDecisionQueueService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
  ) {}

  list({ actor, query }: { actor: ActorContext; query: unknown }) {
    return this.database.transaction(
      async () => {
        const companyId = await this.authorization.requireOfferAccess(actor, [
          'commercial.offer.read',
          'commercial.offer.approve',
        ]);
        await this.authorization.requireCommercialIntakeAccess(actor, 'read');
        const scope = { workspaceId: actor.workspaceId, companyId };
        const cursor = readOfferDecisionCursor(query, scope);
        let modelDecision = false;
        try {
          await this.authorization.requireOfferAccess(actor, [
            'commercial.offer.read',
            'commercial.offer.approve',
            'commercial.offer.model_based.approve',
          ]);
          modelDecision = true;
        } catch (error) {
          // The opt-in model grant never becomes a prerequisite for v1 work.
          if (!(error instanceof ForbiddenException)) throw error;
        }
        const rows = await this.database.connection
          .select({
            offerId: offers.id,
            versionId: offerVersions.id,
            opportunityId: offers.opportunityId,
            clientRequestId: offers.clientRequestId,
            opportunityTitle: opportunities.title,
            illustrativeReference: offers.illustrativeReference,
            versionNumber: offerVersions.versionNumber,
            provenance: offerVersions.provenance,
            createdAt: sql<string>`to_char(${offerVersions.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
          })
          .from(offerVersions)
          .innerJoin(
            offers,
            and(
              eq(offers.workspaceId, offerVersions.workspaceId),
              eq(offers.companyId, offerVersions.companyId),
              eq(offers.id, offerVersions.offerId),
            ),
          )
          .innerJoin(
            opportunities,
            and(
              eq(opportunities.workspaceId, offers.workspaceId),
              eq(opportunities.companyId, offers.companyId),
              eq(opportunities.id, offers.opportunityId),
              eq(opportunities.clientRequestId, offers.clientRequestId),
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
          .leftJoin(
            offerDecisions,
            and(
              eq(offerDecisions.workspaceId, offerVersions.workspaceId),
              eq(offerDecisions.companyId, offerVersions.companyId),
              eq(offerDecisions.offerId, offers.id),
              eq(offerDecisions.offerVersionId, offerVersions.id),
            ),
          )
          .where(
            and(
              eq(offerVersions.workspaceId, actor.workspaceId),
              eq(offerVersions.companyId, companyId),
              isNull(offerVersions.supersededByVersionId),
              isNull(offerDecisions.id),
              or(
                eq(offerVersions.provenance, 'ILLUSTRATIVE'),
                modelDecision
                  ? eq(offerVersions.provenance, 'COMPANY_MODEL_ESTIMATE')
                  : undefined,
              ),
              cursor
                ? sql<boolean>`(${offerVersions.createdAt}, ${offerVersions.id}) > (${cursor.createdAt}::timestamptz, ${cursor.versionId}::uuid)`
                : undefined,
            ),
          )
          .orderBy(asc(offerVersions.createdAt), asc(offerVersions.id))
          .limit(26);
        const page = rows.slice(0, 25);
        const last = page.at(-1);
        return {
          items: page.map((row) => ({ ...scope, ...row })),
          ...(rows.length > 25 && last
            ? { nextCursor: offerDecisionCursor(scope, last) }
            : {}),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
