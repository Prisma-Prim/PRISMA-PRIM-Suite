import { Injectable } from '@nestjs/common';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  opportunityFollowUpCommands as commands,
  opportunityFollowUpHeads as heads,
  opportunityFollowUpHistory as history,
  opportunityFollowUpCursorKeys as cursorKeys,
} from '../database/schema/opportunity-follow-up.js';
import {
  followUpHead,
  followUpHistoryEntry,
  followUpReceipt,
} from './opportunity-follow-up.representation.js';
import type { FollowUpInput } from './opportunity-follow-up.input.js';
import {
  FOLLOW_UP_FORMAT,
  type FollowUpScope,
  type FollowUpDiscoveryItem,
  type FollowUpReceipt,
} from './opportunity-follow-up.types.js';

@Injectable()
export class OpportunityFollowUpStore {
  constructor(private readonly database: DatabaseContext) {}
  private scopeCondition(scope: FollowUpScope) {
    return and(
      eq(history.workspaceId, scope.workspaceId),
      eq(history.companyId, scope.companyId),
      eq(history.opportunityId, scope.opportunityId),
    );
  }
  async current(scope: FollowUpScope) {
    const [head] = await this.database.connection
      .select()
      .from(heads)
      .where(
        and(
          eq(heads.workspaceId, scope.workspaceId),
          eq(heads.companyId, scope.companyId),
          eq(heads.opportunityId, scope.opportunityId),
        ),
      );
    const [latest] = await this.database.connection
      .select()
      .from(history)
      .where(this.scopeCondition(scope))
      .orderBy(desc(history.revision))
      .limit(1);
    if (!head && !latest)
      return followUpHead({ state: 'UNRECORDED', revision: 0 });
    if (!head || !latest) throw new Error('Incomplete follow-up head.');
    const result = followUpHead(head.fact),
      entry = followUpHistoryEntry(latest.fact);
    if (
      result.revision !== head.revision ||
      entry.revision !== result.revision ||
      !isDeepStrictEqual(result, entry.after)
    )
      throw new Error('Follow-up head/history disagree.');
    return result;
  }
  async history(scope: FollowUpScope, before?: number) {
    const rows = await this.database.connection
      .select()
      .from(history)
      .where(
        and(
          this.scopeCondition(scope),
          before === undefined ? undefined : lt(history.revision, before),
        ),
      )
      .orderBy(desc(history.revision))
      .limit(26);
    const entries = rows.map((row) => {
      const entry = followUpHistoryEntry(row.fact);
      if (
        entry.opportunityId !== scope.opportunityId ||
        entry.revision !== row.revision ||
        entry.commandId !== row.commandId
      )
        throw new Error('Foreign follow-up history.');
      return entry;
    });
    for (let i = 0; i < entries.length - 1; i++) {
      const current = entries[i],
        older = entries[i + 1];
      if (
        !current ||
        !older ||
        current.revision !== older.revision + 1 ||
        !isDeepStrictEqual(current.before, older.after)
      )
        throw new Error('Incomplete follow-up history chain.');
    }
    return {
      entries: entries.slice(0, 25),
      nextBefore: entries.length > 25 ? entries[24]?.revision : undefined,
    };
  }
  intent(actor: ActorContext, scope: FollowUpScope, body: FollowUpInput) {
    return {
      format: FOLLOW_UP_FORMAT,
      workspaceId: scope.workspaceId,
      companyId: scope.companyId,
      actorMembershipId: actor.workspaceMembershipId,
      opportunityId: scope.opportunityId,
      body,
    };
  }
  async findReceipt(actor: ActorContext, scope: FollowUpScope, key: string) {
    const [row] = await this.database.connection
      .select()
      .from(commands)
      .where(
        and(
          eq(commands.workspaceId, scope.workspaceId),
          eq(commands.companyId, scope.companyId),
          eq(commands.actorMembershipId, actor.workspaceMembershipId),
          eq(commands.idempotencyKey, key),
        ),
      );
    return row;
  }
  async replay(scope: FollowUpScope, row: typeof commands.$inferSelect) {
    const response = this.response(row.response);
    const [h] = await this.database.connection
      .select()
      .from(history)
      .where(
        and(
          this.scopeCondition(scope),
          eq(history.revision, response.fact.revision),
        ),
      );
    if (
      !h ||
      row.opportunityId !== scope.opportunityId ||
      response.opportunityId !== scope.opportunityId ||
      response.outcome !== row.outcome ||
      response.fact.revision !== row.revision ||
      !isDeepStrictEqual(followUpHistoryEntry(h.fact).after, response.fact)
    )
      throw new Error('Invalid follow-up receipt coupling.');
    return response;
  }
  response(value: unknown): FollowUpReceipt {
    try {
      return followUpReceipt(value);
    } catch {
      throw new Error('Invalid stored follow-up response.');
    }
  }
  async write(input: {
    actor: ActorContext;
    scope: FollowUpScope;
    assignmentId: string;
    intakeAssignmentId: string;
    key: string;
    body: FollowUpInput;
  }) {
    const { actor, scope } = input;
    const [recorded] = await this.database.connection
      .insert(commands)
      .values({
        ...scope,
        actorMembershipId: actor.workspaceMembershipId,
        actorInternalUserId: actor.internalUserId,
        assignmentId: input.assignmentId,
        intakeAssignmentId: input.intakeAssignmentId,
        idempotencyKey: input.key,
        intent: this.intent(actor, scope, input.body),
      })
      .returning();
    if (!recorded) throw new Error('Follow-up command was not recorded.');
    return this.response(recorded.response);
  }
  async cursorKey(scope: { workspaceId: string; companyId: string }) {
    const [row] = await this.database.connection
      .select({ key: cursorKeys.key })
      .from(cursorKeys)
      .where(
        and(
          eq(cursorKeys.workspaceId, scope.workspaceId),
          eq(cursorKeys.companyId, scope.companyId),
        ),
      );
    if (!row) return undefined;
    if (typeof row.key !== 'string' || row.key.length !== 72)
      throw new Error('Follow-up continuation is unavailable.');
    return row.key;
  }
  async discovery(
    scope: { workspaceId: string; companyId: string },
    through: string,
    after?: { date: string; opportunityId: string },
  ) {
    // This is Commercial's explicit native read view, not an owner-table query.
    // Eligibility predicates precede bounded rows and lookahead in one statement.
    const result = await this.database.connection.execute<{
      opportunityId: string;
      requestId: string;
      title: string;
      followUpOn: string;
      fact: unknown;
    }>(sql`
      SELECT n.opportunity_id AS "opportunityId",n.request_id AS "requestId",n.title,h.follow_up_on AS "followUpOn",h.fact
      FROM opportunity_follow_up_heads h JOIN commercial_follow_up_opportunity_state n ON n.workspace_id=h.workspace_id AND n.company_id=h.company_id AND n.opportunity_id=h.opportunity_id
      WHERE h.workspace_id=${scope.workspaceId}::uuid AND h.company_id=${scope.companyId}::uuid AND n.status='OPEN' AND h.follow_up_on IS NOT NULL AND h.follow_up_on<=${through} AND h.confirmed_epoch=n.outcome_epoch
        ${after ? sql`AND (h.follow_up_on,h.opportunity_id)>(${after.date},${after.opportunityId}::uuid)` : sql``}
      ORDER BY h.follow_up_on,h.opportunity_id LIMIT 26
    `);
    const items: FollowUpDiscoveryItem[] = result.rows.map((row) => {
      const fact = followUpHead(row.fact);
      if (fact.state !== 'RECORDED' || fact.followUpOn !== row.followUpOn)
        throw new Error('Invalid eligible follow-up.');
      return {
        opportunityId: row.opportunityId,
        requestId: row.requestId,
        title: row.title,
        followUpOn: row.followUpOn,
        recordedBy: fact.recordedBy,
        recordedAt: fact.recordedAt,
      };
    });
    return { items, hasMore: items.length === 26 };
  }
}
