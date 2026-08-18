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

    const target = persistenceFor(event);
    await this.databaseContext.connection
      .insert(activityLogEvents)
      .values({
        workspaceId: event.actor.workspaceId,
        actorInternalUserId: event.actor.internalUserId,
        actorWorkspaceMembershipId: event.actor.workspaceMembershipId,
        action: event.action,
        ...target,
        metadata: event.metadata,
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
        target: canonicalTarget(event),
        metadata: event.metadata,
      })),
    };
  }
}

function persistenceFor(event: CanonicalActivityEvent) {
  switch (event.action) {
    case 'internal_user.provisioned':
      return {
        targetType: event.target.type,
        targetInternalUserId: event.target.internalUserId,
        targetWorkspaceMembershipId: event.actor.workspaceMembershipId,
        targetCompanyId: null,
        targetCompanyRoleAssignmentId: null,
        idempotencyKey: `${event.action}:${event.target.internalUserId}`,
      };
    case 'company.registered':
      return {
        targetType: event.target.type,
        targetInternalUserId: null,
        targetWorkspaceMembershipId: null,
        targetCompanyId: event.target.companyId,
        targetCompanyRoleAssignmentId: null,
        idempotencyKey: `${event.action}:${event.target.companyId}`,
      };
    case 'company_context_assignment.granted':
    case 'company_context_assignment.revoked':
      return {
        targetType: event.target.type,
        targetInternalUserId: event.target.internalUserId,
        targetWorkspaceMembershipId: event.target.workspaceMembershipId,
        targetCompanyId: event.target.companyId,
        targetCompanyRoleAssignmentId: event.target.assignmentId,
        idempotencyKey: `${event.action}:${event.target.assignmentId}:${event.transitionId}`,
      };
    default:
      return assertNever(event);
  }
}

interface PersistedActivityTarget {
  targetType: 'internal_user' | 'company' | 'company_role_assignment';
  targetCompanyRoleAssignmentId: string | null;
  targetWorkspaceMembershipId: string | null;
  targetInternalUserId: string | null;
  targetInternalUserDisplayName: string | null;
  targetCompanyId: string | null;
  targetCompanyDisplayName: string | null;
}

function canonicalTarget(event: PersistedActivityTarget) {
  switch (event.targetType) {
    case 'internal_user':
      return {
        type: event.targetType,
        internalUserId: required(
          event.targetInternalUserId,
          'Internal User id',
        ),
        displayName: required(
          event.targetInternalUserDisplayName,
          'Internal User display name',
        ),
      };
    case 'company':
      return {
        type: event.targetType,
        companyId: required(event.targetCompanyId, 'Company id'),
        displayName: required(event.targetCompanyDisplayName, 'Company name'),
      };
    case 'company_role_assignment':
      return {
        type: event.targetType,
        assignmentId: required(
          event.targetCompanyRoleAssignmentId,
          'Company Role Assignment id',
        ),
        companyId: required(event.targetCompanyId, 'Company id'),
        companyDisplayName: required(
          event.targetCompanyDisplayName,
          'Company name',
        ),
        workspaceMembershipId: required(
          event.targetWorkspaceMembershipId,
          'Workspace Membership id',
        ),
        internalUserId: required(
          event.targetInternalUserId,
          'Internal User id',
        ),
        internalUserDisplayName: required(
          event.targetInternalUserDisplayName,
          'Internal User display name',
        ),
      };
    default:
      return assertNever(event.targetType);
  }
}

function required(value: string | null, field: string): string {
  if (value === null)
    throw new Error(`Activity Log event is missing ${field}.`);
  return value;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected Activity Log variant: ${JSON.stringify(value)}`);
}
