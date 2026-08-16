import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DatabaseContext } from '../database/database-context.js';
import {
  activityLogEvents,
  companies,
  internalUsers,
  workspaceMemberships,
} from '../database/schema/index.js';
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
    if (
      event.target.type === 'internal_user' &&
      event.actor.internalUserId !== event.target.internalUserId
    ) {
      throw new Error(
        'An Internal User provisioning event must target its actor.',
      );
    }

    await this.databaseContext.connection
      .insert(activityLogEvents)
      .values({
        workspaceId: event.actor.workspaceId,
        actorInternalUserId: event.actor.internalUserId,
        actorWorkspaceMembershipId: event.actor.workspaceMembershipId,
        action: event.action,
        targetType: event.target.type,
        targetInternalUserId:
          event.target.type === 'internal_user'
            ? event.target.internalUserId
            : event.target.type === 'company_role_assignment'
              ? event.target.internalUserId
              : null,
        targetWorkspaceMembershipId:
          event.target.type === 'internal_user'
            ? event.actor.workspaceMembershipId
            : event.target.type === 'company_role_assignment'
              ? event.target.workspaceMembershipId
              : null,
        targetCompanyId:
          event.target.type === 'company' ||
          event.target.type === 'company_role_assignment'
            ? event.target.companyId
            : null,
        targetCompanyRoleAssignmentId:
          event.target.type === 'company_role_assignment'
            ? event.target.assignmentId
            : null,
        metadata: event.metadata,
        idempotencyKey:
          event.target.type === 'internal_user'
            ? `${event.action}:${event.target.internalUserId}`
            : event.target.type === 'company'
              ? `${event.action}:${event.target.companyId}`
              : `${event.action}:${event.target.assignmentId}:${
                  'transitionId' in event ? event.transitionId : ''
                }`,
      })
      .onConflictDoNothing({ target: activityLogEvents.idempotencyKey });
  }

  async listForActor(actor: ActorContext): Promise<ActivityLogPage> {
    const eventActor = alias(internalUsers, 'activity_log_actor');
    const eventTarget = alias(internalUsers, 'activity_log_target');
    const eventTargetCompany = alias(companies, 'activity_log_target_company');
    const actorMembership = alias(
      workspaceMemberships,
      'activity_log_actor_membership',
    );
    const targetMembership = alias(
      workspaceMemberships,
      'activity_log_target_membership',
    );
    const visibleEvents = actor.workspacePermissions.includes('company.manage')
      ? eq(activityLogEvents.workspaceId, actor.workspaceId)
      : and(
          eq(activityLogEvents.workspaceId, actor.workspaceId),
          eq(activityLogEvents.targetType, 'internal_user'),
        );
    const rows = await this.databaseContext.connection
      .select({
        id: activityLogEvents.id,
        action: activityLogEvents.action,
        occurredAt: activityLogEvents.occurredAt,
        actorInternalUserId: eventActor.id,
        actorDisplayName: eventActor.displayName,
        targetType: activityLogEvents.targetType,
        targetCompanyRoleAssignmentId:
          activityLogEvents.targetCompanyRoleAssignmentId,
        targetWorkspaceMembershipId:
          activityLogEvents.targetWorkspaceMembershipId,
        targetInternalUserId: eventTarget.id,
        targetInternalUserDisplayName: eventTarget.displayName,
        targetCompanyId: eventTargetCompany.id,
        targetCompanyDisplayName: eventTargetCompany.displayName,
        metadata: activityLogEvents.metadata,
      })
      .from(activityLogEvents)
      .innerJoin(
        actorMembership,
        and(
          eq(activityLogEvents.workspaceId, actorMembership.workspaceId),
          eq(activityLogEvents.actorWorkspaceMembershipId, actorMembership.id),
          eq(
            activityLogEvents.actorInternalUserId,
            actorMembership.internalUserId,
          ),
        ),
      )
      .innerJoin(eventActor, eq(actorMembership.internalUserId, eventActor.id))
      .leftJoin(
        targetMembership,
        and(
          eq(activityLogEvents.workspaceId, targetMembership.workspaceId),
          eq(
            activityLogEvents.targetWorkspaceMembershipId,
            targetMembership.id,
          ),
          eq(
            activityLogEvents.targetInternalUserId,
            targetMembership.internalUserId,
          ),
        ),
      )
      .leftJoin(
        eventTarget,
        eq(targetMembership.internalUserId, eventTarget.id),
      )
      .leftJoin(
        eventTargetCompany,
        and(
          eq(activityLogEvents.workspaceId, eventTargetCompany.workspaceId),
          eq(activityLogEvents.targetCompanyId, eventTargetCompany.id),
        ),
      )
      .where(visibleEvents)
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
        target:
          event.targetType === 'internal_user'
            ? {
                type: 'internal_user' as const,
                internalUserId: event.targetInternalUserId!,
                displayName: event.targetInternalUserDisplayName!,
              }
            : event.targetType === 'company'
              ? {
                  type: 'company' as const,
                  companyId: event.targetCompanyId!,
                  displayName: event.targetCompanyDisplayName!,
                }
              : {
                  type: 'company_role_assignment' as const,
                  assignmentId: event.targetCompanyRoleAssignmentId!,
                  companyId: event.targetCompanyId!,
                  companyDisplayName: event.targetCompanyDisplayName!,
                  workspaceMembershipId: event.targetWorkspaceMembershipId!,
                  internalUserId: event.targetInternalUserId!,
                  internalUserDisplayName: event.targetInternalUserDisplayName!,
                },
        metadata: event.metadata,
      })),
    };
  }
}
