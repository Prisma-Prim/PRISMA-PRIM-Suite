import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { runKeyedCommand } from '../command/idempotent-command.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { OpportunityFollowUpStore } from './opportunity-follow-up.store.js';
import {
  FOLLOW_UP_KEY_MAX_LENGTH,
  followUpInput,
  followUpQuery,
} from './opportunity-follow-up.input.js';
import {
  followUpCursors,
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
  private readonly cursors: ReturnType<typeof followUpCursors>;
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: CompanyContextAuthorization,
    private readonly commercial: CommercialIntakeService,
    private readonly store: OpportunityFollowUpStore,
  ) {
    this.cursors = followUpCursors(({ scope }) => this.continuationKey(scope));
  }
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
      nextCursor = await this.cursors.issue({
        binding,
        position: {
          kind: 'history',
          opportunityId: scope.opportunityId,
          headRevision,
          before: result.nextBefore,
        },
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
        const position = await this.cursors.read({
          value: cursorValue,
          binding,
          kind: 'history',
        });
        if (position.opportunityId !== opportunityId)
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
    const input = followUpInput(body);
    return runKeyedCommand(this.database, {
      name: 'opportunity.follow-up',
      actor,
      key,
      maxKeyLength: FOLLOW_UP_KEY_MAX_LENGTH,
      authorize: async () => {
        const capture = await this.access.requireOpportunityFollowUpAccess(
          actor,
          { manage: true, lock: true },
        );
        await this.commercial.requireFollowUpTarget(actor, opportunityId);
        const scope: FollowUpScope = {
          workspaceId: actor.workspaceId,
          companyId: capture.companyId,
          opportunityId,
        };
        return { scope, assignmentId: capture.assignmentId };
      },
      findReceipt: ({ scope: { scope }, key: used }) =>
        this.store.findReceipt(actor, scope, used),
      recordedIntent: (receipt) => receipt.intent,
      intent: ({ scope: { scope } }) => this.store.intent(actor, scope, input),
      replay: ({ scope: { scope }, receipt }) =>
        this.store.replay(scope, receipt),
      execute: async ({ scope: { scope, assignmentId }, key: used }) => {
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
          assignmentId,
          intakeAssignmentId: nativeAssignmentId,
          key: used,
          body: input,
        });
      },
    }).catch(unavailable);
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
          const cursor = await this.cursors.read({
            value: parsed.cursor,
            binding,
            kind: 'discovery',
          });
          if (cursor.through !== through)
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
            ? await this.cursors.issue({
                binding,
                position: {
                  kind: 'discovery',
                  through,
                  date: last.followUpOn,
                  opportunityId: last.opportunityId,
                },
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
