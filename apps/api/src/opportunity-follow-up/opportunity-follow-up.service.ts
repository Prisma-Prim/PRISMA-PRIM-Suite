import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { OpportunityFollowUpStore } from './opportunity-follow-up.store.js';
import {
  followUpInput,
  followUpKey,
  followUpQuery,
} from './opportunity-follow-up.input.js';
import {
  followUpCursor,
  readFollowUpCursor,
  type FollowUpCursorBinding,
} from './opportunity-follow-up.cursor.js';
import {
  FOLLOW_UP_FORMAT,
  type FollowUpScope,
  type FollowUpCurrent,
  type FollowUpHistoryPage,
  type FollowUpDiscoveryItem,
} from './opportunity-follow-up.types.js';

function conflict(code: string): never {
  throw new ConflictException({
    code,
    message: 'Reload and review the current follow-up.',
  });
}
@Injectable()
export class OpportunityFollowUpService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: CompanyContextAuthorization,
    private readonly commercial: CommercialIntakeService,
    private readonly store: OpportunityFollowUpStore,
  ) {}
  private binding(
    actor: ActorContext,
    companyId: string,
    readCapture: string,
  ): FollowUpCursorBinding {
    return {
      workspaceId: actor.workspaceId,
      actorMembershipId: actor.workspaceMembershipId,
      companyId,
      readCapture,
    };
  }
  private async continuationKey(
    scope: Pick<FollowUpScope, 'workspaceId' | 'companyId'>,
  ) {
    const key = await this.store.cursorKey(scope);
    if (key === undefined)
      throw new BadRequestException(
        'Restart follow-up discovery or history deliberately.',
      );
    return key;
  }
  private async page(
    scope: FollowUpScope,
    binding: FollowUpCursorBinding,
    headRevision: number,
    before?: number,
  ): Promise<FollowUpHistoryPage> {
    const result = await this.store.history(scope, before);
    let nextCursor: string | null = null;
    if (result.nextBefore !== undefined) {
      const key = await this.continuationKey(scope);
      nextCursor = followUpCursor(key, binding, {
        kind: 'history',
        opportunityId: scope.opportunityId,
        headRevision,
        before: result.nextBefore,
      });
    }
    return {
      format: FOLLOW_UP_FORMAT,
      opportunityId: scope.opportunityId,
      headRevision,
      entries: result.entries,
      nextCursor,
    };
  }
  async read(
    actor: ActorContext,
    opportunityId: string,
    query: unknown,
  ): Promise<FollowUpCurrent> {
    followUpQuery(query, 'current');
    return this.database
      .transaction(async (): Promise<FollowUpCurrent> => {
        const capture = await this.access.requireOpportunityFollowUpAccess(
          actor,
          { manage: false, lock: true },
        );
        const native = await this.commercial.requireFollowUpOpportunity(
          actor,
          opportunityId,
          true,
        );
        const scope = {
          workspaceId: actor.workspaceId,
          companyId: capture.companyId,
          opportunityId,
        };
        const head = await this.store.current(scope);
        return {
          format: FOLLOW_UP_FORMAT,
          opportunityId,
          requestId: native.requestId,
          status: native.status,
          opportunityVersion: native.version,
          outcomeEpoch: native.outcomeEpoch,
          head,
          history: await this.page(
            scope,
            this.binding(actor, capture.companyId, capture.readCapture),
            head.revision,
          ),
        };
      })
      .catch(unavailable);
  }
  async history(
    actor: ActorContext,
    opportunityId: string,
    query: unknown,
  ): Promise<FollowUpHistoryPage> {
    const parsed = followUpQuery(query, 'history');
    if (!('cursor' in parsed) || typeof parsed.cursor !== 'string')
      throw new BadRequestException();
    const cursorValue = parsed.cursor;
    return this.database
      .transaction(async () => {
        const capture = await this.access.requireOpportunityFollowUpAccess(
          actor,
          { manage: false, lock: true },
        );
        await this.commercial.requireFollowUpOpportunity(
          actor,
          opportunityId,
          true,
        );
        const scope = {
            workspaceId: actor.workspaceId,
            companyId: capture.companyId,
            opportunityId,
          },
          binding = this.binding(actor, capture.companyId, capture.readCapture);
        const position = readFollowUpCursor(
          await this.continuationKey(scope),
          cursorValue,
          binding,
        );
        if (
          position.kind !== 'history' ||
          position.opportunityId !== opportunityId
        )
          throw new BadRequestException(
            'Restart follow-up history deliberately.',
          );
        const head = await this.store.current(scope);
        if (head.revision !== position.headRevision)
          conflict('FOLLOW_UP_HISTORY_CHANGED');
        return this.page(scope, binding, head.revision, position.before);
      })
      .catch(unavailable);
  }
  async record(
    actor: ActorContext,
    opportunityId: string,
    body: unknown,
    key: string | undefined,
  ) {
    const input = followUpInput(body),
      normalizedKey = followUpKey(key);
    return this.database
      .transaction(async () => {
        const capture = await this.access.requireOpportunityFollowUpAccess(
          actor,
          { manage: true, lock: true },
        );
        await this.commercial.requireFollowUpTarget(actor, opportunityId);
        const scope = {
          workspaceId: actor.workspaceId,
          companyId: capture.companyId,
          opportunityId,
        };
        await this.database.connection.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['opportunity.follow-up', scope.workspaceId, scope.companyId, actor.workspaceMembershipId, normalizedKey])},0))`,
        );
        const saved = await this.store.findReceipt(actor, scope, normalizedKey);
        if (saved) {
          if (
            !isDeepStrictEqual(
              saved.intent,
              this.store.intent(actor, scope, input),
            )
          )
            conflict('IDEMPOTENCY_CONFLICT');
          return this.store.replay(scope, saved);
        }
        const native = await this.commercial.requireFollowUpOpportunity(
            actor,
            opportunityId,
            true,
          ),
          head = await this.store.current(scope);
        if (head.revision !== input.expectedRevision)
          conflict('STALE_FOLLOW_UP');
        if (native.version !== input.observedOpportunityVersion)
          conflict('STALE_VERSION');
        if (native.status !== 'OPEN') conflict('OPPORTUNITY_NOT_OPEN');
        const material =
          head.state === 'UNRECORDED' ||
          head.followUpOn !== input.followUpOn ||
          head.confirmedEpoch !== native.outcomeEpoch;
        if (material && head.state === 'RECORDED' && input.reason === null)
          throw new BadRequestException(
            'A material correction requires a reason.',
          );
        const nativeAssignmentId =
          actor.activeCompany?.commercialIntakePermissionAssignmentId;
        if (!nativeAssignmentId)
          throw new Error('Missing consumed native capture.');
        return this.store.write({
          actor,
          scope,
          assignmentId: capture.assignmentId,
          intakeAssignmentId: nativeAssignmentId,
          key: normalizedKey,
          body: input,
        });
      })
      .catch(unavailable);
  }
  async discover(actor: ActorContext, query: unknown) {
    const parsed = followUpQuery(query, 'discovery');
    if (!('through' in parsed) || typeof parsed.through !== 'string')
      throw new BadRequestException();
    const through = parsed.through;
    return this.database
      .transaction(async () => {
        const capture = await this.access.requireOpportunityFollowUpAccess(
          actor,
          { manage: false, lock: true },
        );
        const scope = {
            workspaceId: actor.workspaceId,
            companyId: capture.companyId,
          },
          binding = this.binding(actor, capture.companyId, capture.readCapture);
        let after: { date: string; opportunityId: string } | undefined;
        if (typeof parsed.cursor === 'string') {
          const cursor = readFollowUpCursor(
            await this.continuationKey(scope),
            parsed.cursor,
            binding,
          );
          if (cursor.kind !== 'discovery' || cursor.through !== through)
            throw new BadRequestException('Restart discovery deliberately.');
          after = { date: cursor.date, opportunityId: cursor.opportunityId };
        }
        const items: FollowUpDiscoveryItem[] = [];
        while (items.length < 26) {
          const batch = await this.store.discovery(scope, through, after);
          if (!batch.items.length) break;
          for (const candidate of batch.items) {
            const native = await this.commercial.requireFollowUpOpportunity(
              actor,
              candidate.opportunityId,
              true,
            );
            const current = await this.store.current({
              ...scope,
              opportunityId: candidate.opportunityId,
            });
            // Revalidate after any native lock wait. Late changes may remove a
            // candidate, never create a short page/cursor from an ineligible row.
            if (
              native.status === 'OPEN' &&
              current.state === 'RECORDED' &&
              current.followUpOn !== null &&
              current.followUpOn === candidate.followUpOn &&
              current.followUpOn <= through &&
              current.confirmedEpoch === native.outcomeEpoch
            )
              items.push(candidate);
            after = {
              date: candidate.followUpOn,
              opportunityId: candidate.opportunityId,
            };
            if (items.length === 26) break;
          }
          if (!batch.hasMore) break;
        }
        const visible = items.slice(0, 25),
          projections = await this.commercial.followUpClientProjections(
            actor,
            visible,
          );
        const last = visible.at(-1);
        const nextCursor =
          items.length > 25 && last
            ? followUpCursor(await this.continuationKey(scope), binding, {
                kind: 'discovery',
                through,
                date: last.followUpOn,
                opportunityId: last.opportunityId,
              })
            : null;
        return {
          format: FOLLOW_UP_FORMAT,
          through,
          items: visible.map((item) => ({
            ...item,
            ...projections.get(item.opportunityId),
          })),
          nextCursor,
        };
      })
      .catch(unavailable);
  }
}
function unavailable(error: unknown): never {
  if (error instanceof HttpException) throw error;
  throw new InternalServerErrorException(
    'Opportunity follow-up is unavailable.',
  );
}
