import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DatabaseContext } from '../database/database-context.js';
import { activityLogEvents, internalUsers } from '../database/schema/index.js';
import type { ActorContext } from '../access/access.types.js';
import type {
  ActivityLogPage,
  CanonicalActivityEvent,
} from './accountability.types.js';

const INITIAL_PAGE_SIZE = 50;

@Injectable()
export class AccountabilityService {
  constructor(private readonly databaseContext: DatabaseContext) {}

  async record(event: CanonicalActivityEvent): Promise<void> {
    if (event.actor.internalUserId !== event.target.internalUserId) {
      throw new Error(
        'An Internal User provisioning event must target its actor.',
      );
    }

    await this.databaseContext.connection
      .insert(activityLogEvents)
      .values({
        workspaceId: event.actor.workspaceId,
        actorInternalUserId: event.actor.internalUserId,
        action: event.action,
        targetType: event.target.type,
        targetInternalUserId: event.target.internalUserId,
        metadata: event.metadata,
        idempotencyKey: `${event.action}:${event.target.internalUserId}`,
      })
      .onConflictDoNothing({ target: activityLogEvents.idempotencyKey });
  }

  async listForActor(actor: ActorContext): Promise<ActivityLogPage> {
    const eventActor = alias(internalUsers, 'activity_log_actor');
    const eventTarget = alias(internalUsers, 'activity_log_target');
    const rows = await this.databaseContext.connection
      .select({
        id: activityLogEvents.id,
        action: activityLogEvents.action,
        occurredAt: activityLogEvents.occurredAt,
        actorInternalUserId: eventActor.id,
        actorDisplayName: eventActor.displayName,
        targetType: activityLogEvents.targetType,
        targetInternalUserId: eventTarget.id,
        targetDisplayName: eventTarget.displayName,
        metadata: activityLogEvents.metadata,
      })
      .from(activityLogEvents)
      .innerJoin(
        eventActor,
        eq(activityLogEvents.actorInternalUserId, eventActor.id),
      )
      .innerJoin(
        eventTarget,
        eq(activityLogEvents.targetInternalUserId, eventTarget.id),
      )
      .where(eq(activityLogEvents.workspaceId, actor.workspaceId))
      .orderBy(desc(activityLogEvents.occurredAt), desc(activityLogEvents.id))
      .limit(INITIAL_PAGE_SIZE);

    return {
      events: rows.map((event) => ({
        id: event.id,
        action: event.action,
        occurredAt: event.occurredAt.toISOString(),
        actor: {
          internalUserId: event.actorInternalUserId,
          displayName: event.actorDisplayName,
        },
        target: {
          type: event.targetType,
          internalUserId: event.targetInternalUserId,
          displayName: event.targetDisplayName,
        },
        metadata: event.metadata,
      })),
    };
  }
}
