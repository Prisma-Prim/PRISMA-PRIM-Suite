import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { MissionPlanAccessService } from '../access/mission-plan-access.service.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import {
  commandFingerprint,
  idempotencyConflict,
  runIdempotentCommand,
  staleVersionConflict,
} from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  missionPlans,
  missionPlanVersions,
  missionPlanActivities,
  missionPlanCommands,
} from '../database/schema/mission-plan.js';
import { publicationContent, versionNumber } from './mission-plan.content.js';
import {
  readPlanCursor,
  planCursor,
  historyBoundary,
} from './mission-plan.pagination.js';

@Injectable()
export class MissionPlanService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: MissionPlanAccessService,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}
  publish({
    actor,
    payload,
    key,
    planId,
  }: {
    actor: ActorContext;
    payload: unknown;
    key: string | undefined;
    planId?: string;
  }) {
    const target = planId === undefined ? undefined : requireUuid(planId),
      content = publicationContent(payload, target !== undefined),
      idempotencyKey = requireIdempotencyKey(key);
    const fingerprint = commandFingerprint({
      companyId: actor.activeCompany?.id,
      operation: target ? 'successor' : 'first',
      planId: target ?? null,
      ...content,
    });
    return runIdempotentCommand(this.database, {
      fingerprint,
      authorize: () =>
        this.access.requireActor({ actor, operation: 'publish', lock: true }),
      lockParts: () => [
        'mission_plan.publish',
        actor.workspaceId,
        actor.workspaceMembershipId,
        idempotencyKey,
      ],
      findReceipt: async () => {
        const [row] = await this.database.connection
          .select()
          .from(missionPlanCommands)
          .where(
            and(
              eq(missionPlanCommands.workspaceId, actor.workspaceId),
              eq(
                missionPlanCommands.actorMembershipId,
                actor.workspaceMembershipId,
              ),
              eq(missionPlanCommands.idempotencyKey, idempotencyKey),
            ),
          );
        return row;
      },
      conflict: () =>
        idempotencyConflict(
          'This key belongs to another mission-plan publication.',
        ),
      replay: async (companyId, receipt) => ({
        version: await this.versionWithinTransaction({
          actor,
          companyId,
          versionId: receipt.versionId,
        }),
      }),
      execute: async (companyId) => {
        const now = this.clock.now(),
          id = target ?? randomUUID();
        let next = 1;
        if (target) {
          const [root] = await this.database.connection
            .select({ id: missionPlans.id })
            .from(missionPlans)
            .where(
              and(
                eq(missionPlans.workspaceId, actor.workspaceId),
                eq(missionPlans.companyId, companyId),
                eq(missionPlans.id, target),
              ),
            )
            .for('update');
          if (!root) throw new NotFoundException();
          const [head] = await this.database.connection
            .select({ versionNumber: missionPlanVersions.versionNumber })
            .from(missionPlanVersions)
            .where(
              and(
                eq(missionPlanVersions.workspaceId, actor.workspaceId),
                eq(missionPlanVersions.companyId, companyId),
                eq(missionPlanVersions.planId, target),
              ),
            )
            .orderBy(desc(missionPlanVersions.versionNumber))
            .limit(1);
          if (!head || head.versionNumber !== content.expectedHeadVersion)
            throw staleVersionConflict(
              'The mission-plan head changed. Refresh before publishing.',
            );
          if (head.versionNumber === 2147483647)
            throw new BadRequestException(
              'The mission-plan Version limit is reached.',
            );
          next = head.versionNumber + 1;
        } else
          await this.database.connection.insert(missionPlans).values({
            id,
            workspaceId: actor.workspaceId,
            companyId,
            createdAt: now,
          });
        const version =
          await this.accountability.recordMissionPlanVersionCreated({
            actor,
            companyId,
            planId: id,
            versionNumber: next,
            title: content.title,
            activityCount: content.activities.length,
            publishedAt: now,
          });
        await this.database.connection.insert(missionPlanActivities).values(
          content.activities.map((a, position) => ({
            ...a,
            position,
            workspaceId: actor.workspaceId,
            companyId,
            versionId: version.id,
          })),
        );
        await this.database.connection.insert(missionPlanCommands).values({
          workspaceId: actor.workspaceId,
          companyId,
          actorMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          fingerprint,
          versionId: version.id,
        });
        return {
          version: await this.versionWithinTransaction({
            actor,
            companyId,
            planId: id,
            versionId: version.id,
          }),
        };
      },
    });
  }
  read({
    actor,
    planId,
    versionId,
  }: {
    actor: ActorContext;
    planId: string;
    versionId: string;
  }) {
    return this.database.transaction(
      async () => {
        const companyId = await this.access.requireActor({
          actor,
          operation: 'read',
          lock: false,
        });
        return {
          version: await this.versionWithinTransaction({
            actor,
            companyId,
            planId: requireUuid(planId),
            versionId: requireUuid(versionId),
          }),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  /** Only the authorized owning caller supplies this scope and transaction. */
  async versionWithinTransaction({
    actor,
    companyId,
    planId,
    versionId,
  }: {
    actor: ActorContext;
    companyId: string;
    planId?: string;
    versionId: string;
  }) {
    const [v] = await this.database.connection
      .select()
      .from(missionPlanVersions)
      .where(
        and(
          eq(missionPlanVersions.workspaceId, actor.workspaceId),
          eq(missionPlanVersions.companyId, companyId),
          eq(missionPlanVersions.id, versionId),
          planId ? eq(missionPlanVersions.planId, planId) : undefined,
        ),
      );
    if (!v) throw new NotFoundException();
    const rows = await this.database.connection
      .select({
        key: missionPlanActivities.key,
        position: missionPlanActivities.position,
        title: missionPlanActivities.title,
        activity: missionPlanActivities.activity,
        intendedResult: missionPlanActivities.intendedResult,
      })
      .from(missionPlanActivities)
      .where(
        and(
          eq(missionPlanActivities.workspaceId, actor.workspaceId),
          eq(missionPlanActivities.companyId, companyId),
          eq(missionPlanActivities.versionId, v.id),
        ),
      )
      .orderBy(asc(missionPlanActivities.position));
    if (
      rows.length !== v.activityCount ||
      rows.some((r, n) => r.position !== n)
    )
      throw new Error('Incomplete stored mission-plan Version.');
    const stored = {
      title: v.title,
      activities: rows.map(({ key, title, activity, intendedResult }) => ({
        key,
        title,
        activity,
        intendedResult,
      })),
    };
    const validated = publicationContent(stored, false);
    if (
      JSON.stringify(stored) !== JSON.stringify(validated) ||
      !v.actorDisplayName.trim()
    )
      throw new Error('Invalid stored mission-plan content.');
    return {
      ...metadata(v),
      activities: rows.map(({ key, title, activity, intendedResult }) => ({
        key,
        title,
        activity,
        intendedResult,
      })),
    };
  }
  catalogue({ actor, query }: { actor: ActorContext; query: unknown }) {
    return this.database.transaction(
      async () => {
        const companyId = await this.access.requireActor({
            actor,
            operation: 'read',
            lock: false,
          }),
          scope = { workspaceId: actor.workspaceId, companyId },
          cursor = readPlanCursor(query, scope);
        const roots = await this.database.connection
          .select({
            id: missionPlans.id,
            createdAt: sql<string>`to_char(${missionPlans.createdAt} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
          })
          .from(missionPlans)
          .where(
            and(
              eq(missionPlans.workspaceId, actor.workspaceId),
              eq(missionPlans.companyId, companyId),
              cursor
                ? sql<boolean>`(${missionPlans.createdAt},${missionPlans.id})>(${cursor.createdAt}::timestamptz,${cursor.planId}::uuid)`
                : undefined,
            ),
          )
          .orderBy(asc(missionPlans.createdAt), asc(missionPlans.id))
          .limit(26);
        const page = roots.slice(0, 25),
          items = [];
        // One indexed head per bounded root; no full source or unbounded Version history.
        for (const root of page) {
          const [head] = await this.database.connection
            .select()
            .from(missionPlanVersions)
            .where(
              and(
                eq(missionPlanVersions.workspaceId, actor.workspaceId),
                eq(missionPlanVersions.companyId, companyId),
                eq(missionPlanVersions.planId, root.id),
              ),
            )
            .orderBy(desc(missionPlanVersions.versionNumber))
            .limit(1);
          if (!head) throw new Error('Missing published mission-plan head.');
          items.push({
            ...scope,
            planId: root.id,
            createdAt: root.createdAt,
            head: metadata(head),
          });
        }
        const last = page.at(-1);
        return {
          items,
          ...(roots.length > 25 && last
            ? {
                nextCursor: planCursor({
                  ...scope,
                  planId: last.id,
                  createdAt: last.createdAt,
                }),
              }
            : {}),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  history({
    actor,
    planId,
    query,
  }: {
    actor: ActorContext;
    planId: string;
    query: unknown;
  }) {
    return this.database.transaction(
      async () => {
        const companyId = await this.access.requireActor({
            actor,
            operation: 'read',
            lock: false,
          }),
          id = requireUuid(planId),
          before = historyBoundary(query);
        const [head] = await this.database.connection
          .select()
          .from(missionPlanVersions)
          .where(
            and(
              eq(missionPlanVersions.workspaceId, actor.workspaceId),
              eq(missionPlanVersions.companyId, companyId),
              eq(missionPlanVersions.planId, id),
            ),
          )
          .orderBy(desc(missionPlanVersions.versionNumber))
          .limit(1);
        if (!head) throw new NotFoundException();
        const rows = await this.database.connection
          .select()
          .from(missionPlanVersions)
          .where(
            and(
              eq(missionPlanVersions.workspaceId, actor.workspaceId),
              eq(missionPlanVersions.companyId, companyId),
              eq(missionPlanVersions.planId, id),
              before
                ? sql<boolean>`${missionPlanVersions.versionNumber}<${before}`
                : undefined,
            ),
          )
          .orderBy(desc(missionPlanVersions.versionNumber))
          .limit(26);
        const page = rows.slice(0, 25),
          last = page.at(-1);
        return {
          headVersionNumber: head.versionNumber,
          items: page.map(metadata),
          ...(rows.length > 25 && last
            ? { nextBeforeVersion: String(last.versionNumber) }
            : {}),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
function metadata(v: typeof missionPlanVersions.$inferSelect) {
  return {
    id: v.id,
    planId: v.planId,
    workspaceId: v.workspaceId,
    companyId: v.companyId,
    versionNumber: versionNumber(v.versionNumber),
    title: v.title,
    activityCount: v.activityCount,
    publishedAt: v.publishedAt.toISOString(),
    actor: {
      membershipId: v.actorMembershipId,
      displayName: v.actorDisplayName,
    },
  };
}
