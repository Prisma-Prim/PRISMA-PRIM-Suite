import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, exists, notInArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DatabaseContext } from '../database/database-context.js';
import {
  projectCreationEvents,
  projects,
  activityLogEvents,
  documentRegistrationEvents,
  workingDocuments,
  clientAccounts,
  clientCompanyRelationships,
  companies,
  internalUsers,
  workspaceMemberships,
  clientUnionOperations,
  clientUnionReversals,
  clientUnionProjections,
} from '../database/schema/index.js';
import type { ActorContext } from '../access/access.types.js';
import type {
  ActivityLogPage,
  DocumentRegisteredActivityEvent,
  CanonicalActivityEvent,
  ClientUnionActivityEvent,
  ProjectCreatedActivityEvent,
} from './accountability.types.js';

const INITIAL_PAGE_SIZE = 50;

@Injectable()
export class AccountabilityService {
  constructor(private readonly databaseContext: DatabaseContext) {}

  async recordProjectCreated(input: {
    actor: ActorContext;
    projectId: string;
    companyId: string;
  }): Promise<void> {
    await this.databaseContext.connection.insert(projectCreationEvents).values({
      workspaceId: input.actor.workspaceId,
      companyId: input.companyId,
      projectId: input.projectId,
      actorInternalUserId: input.actor.internalUserId,
      actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
    });
  }

  private async projectEvents(
    actor: ActorContext,
  ): Promise<ProjectCreatedActivityEvent[]> {
    if (
      !actor.activeCompany?.projectPermissions?.includes('project.read') ||
      (!actor.workspacePermissions.includes('client.manage') &&
        !actor.activeCompany.clientPermissions.includes('client.read'))
    )
      return [];
    const rows = await this.databaseContext.connection
      .select({
        event: projectCreationEvents,
        actorName: internalUsers.displayName,
      })
      .from(projectCreationEvents)
      .innerJoin(
        projects,
        and(
          eq(projects.workspaceId, projectCreationEvents.workspaceId),
          eq(projects.id, projectCreationEvents.projectId),
        ),
      )
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, projectCreationEvents.actorInternalUserId),
      )
      .innerJoin(
        clientCompanyRelationships,
        and(
          eq(clientCompanyRelationships.workspaceId, projects.workspaceId),
          eq(
            clientCompanyRelationships.clientAccountId,
            projects.clientAccountId,
          ),
          eq(clientCompanyRelationships.companyId, projects.companyId),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .where(
        and(
          eq(projectCreationEvents.workspaceId, actor.workspaceId),
          eq(projectCreationEvents.companyId, actor.activeCompany.id),
        ),
      )
      .orderBy(
        desc(projectCreationEvents.occurredAt),
        desc(projectCreationEvents.id),
      )
      .limit(INITIAL_PAGE_SIZE);
    return rows.map(({ event, actorName }) => ({
      id: event.id,
      action: 'project.created',
      occurredAt: event.occurredAt.toISOString(),
      actor: {
        internalUserId: event.actorInternalUserId,
        displayName: actorName,
      },
      target: {
        type: 'project',
        projectId: event.projectId,
        companyId: event.companyId,
      },
      metadata: {},
    }));
  }

  async recordClientUnion(input: {
    actor: ActorContext;
    reviewReference: string;
    canonicalClientId: string;
    companyId: string;
    companyIds: readonly string[];
    idempotencyKey: string;
    reason: string;
    intent: unknown;
    resultSnapshot: unknown;
  }) {
    const [operation] = await this.databaseContext.connection
      .insert(clientUnionOperations)
      .values({
        workspaceId: input.actor.workspaceId,
        actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
        reviewReference: input.reviewReference,
        canonicalClientId: input.canonicalClientId,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        intent: input.intent,
        resultSnapshot: input.resultSnapshot,
      })
      .returning();
    if (!operation) throw new Error('Client union operation was not recorded.');
    await this.recordUnionProjections(
      input.actor.workspaceId,
      operation.id,
      input.companyIds,
      'client.union_confirmed',
    );
    return operation;
  }

  async recordClientUnionReversal(input: {
    actor: ActorContext;
    operationId: string;
    companyId: string;
    companyIds: readonly string[];
    idempotencyKey: string;
    reason: string;
  }): Promise<void> {
    await this.databaseContext.connection.insert(clientUnionReversals).values({
      workspaceId: input.actor.workspaceId,
      actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
      operationId: input.operationId,
      companyId: input.companyId,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
    });
    await this.recordUnionProjections(
      input.actor.workspaceId,
      input.operationId,
      input.companyIds,
      'client.union_reversed',
    );
  }

  async clientUnionEvents(
    actor: ActorContext,
    operationId?: string,
  ): Promise<ClientUnionActivityEvent[]> {
    if (!actor.activeCompany) return [];
    const rows = await this.databaseContext.connection
      .select()
      .from(clientUnionProjections)
      .where(
        and(
          eq(clientUnionProjections.workspaceId, actor.workspaceId),
          eq(clientUnionProjections.companyId, actor.activeCompany.id),
          operationId
            ? eq(clientUnionProjections.operationId, operationId)
            : undefined,
        ),
      )
      .orderBy(asc(clientUnionProjections.reference))
      .limit(INITIAL_PAGE_SIZE);
    return rows.map((row) => {
      if (
        row.action !== 'client.union_confirmed' &&
        row.action !== 'client.union_reversed'
      )
        throw new Error('Unknown Client union event.');
      return {
        action: row.action,
        projectionReference: row.reference,
        companyId: row.companyId,
        actor: { kind: 'authorized_resolver' },
        target: {
          type: 'client_union_operation',
          projectionReference: row.reference,
          companyId: row.companyId,
        },
      };
    });
  }

  private async recordUnionProjections(
    workspaceId: string,
    operationId: string,
    companyIds: readonly string[],
    action: ClientUnionActivityEvent['action'],
  ): Promise<void> {
    if (
      companyIds.length === 0 ||
      new Set(companyIds).size !== companyIds.length
    )
      throw new Error('A complete Company projection scope is required.');
    await this.databaseContext.connection.insert(clientUnionProjections).values(
      companyIds.map((companyId) => ({
        workspaceId,
        operationId,
        companyId,
        action,
      })),
    );
  }

  async recordDocumentRegistered(input: {
    actor: ActorContext;
    companyId: string;
    documentId: string;
  }): Promise<void> {
    await this.databaseContext.connection
      .insert(documentRegistrationEvents)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        documentId: input.documentId,
        actorMembershipId: input.actor.workspaceMembershipId,
      });
  }
  async documentEvents(
    actor: ActorContext,
  ): Promise<DocumentRegisteredActivityEvent[]> {
    if (
      !actor.active ||
      !actor.activeCompany?.documentPermissions?.includes('document.read') ||
      (!actor.workspacePermissions.includes('client.manage') &&
        !actor.activeCompany.clientPermissions.includes('client.read'))
    )
      return [];
    const rows = await this.databaseContext.connection
      .select({
        id: documentRegistrationEvents.id,
        documentId: documentRegistrationEvents.documentId,
        companyId: documentRegistrationEvents.companyId,
        occurredAt: documentRegistrationEvents.occurredAt,
        internalUserId: internalUsers.id,
        displayName: internalUsers.displayName,
      })
      .from(documentRegistrationEvents)
      .innerJoin(
        workingDocuments,
        and(
          eq(
            workingDocuments.workspaceId,
            documentRegistrationEvents.workspaceId,
          ),
          eq(workingDocuments.companyId, documentRegistrationEvents.companyId),
          eq(workingDocuments.id, documentRegistrationEvents.documentId),
        ),
      )
      .innerJoin(
        clientAccounts,
        and(
          eq(clientAccounts.workspaceId, workingDocuments.workspaceId),
          eq(clientAccounts.id, workingDocuments.clientId),
          sql`${clientAccounts.status} IN ('active','superseded')`,
        ),
      )
      .innerJoin(
        clientCompanyRelationships,
        and(
          eq(
            clientCompanyRelationships.workspaceId,
            workingDocuments.workspaceId,
          ),
          eq(clientCompanyRelationships.companyId, workingDocuments.companyId),
          eq(
            clientCompanyRelationships.clientAccountId,
            workingDocuments.clientId,
          ),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .innerJoin(
        workspaceMemberships,
        and(
          eq(
            workspaceMemberships.workspaceId,
            documentRegistrationEvents.workspaceId,
          ),
          eq(
            workspaceMemberships.id,
            documentRegistrationEvents.actorMembershipId,
          ),
        ),
      )
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, workspaceMemberships.internalUserId),
      )
      .where(
        and(
          eq(documentRegistrationEvents.workspaceId, actor.workspaceId),
          eq(documentRegistrationEvents.companyId, actor.activeCompany.id),
        ),
      )
      .orderBy(
        desc(documentRegistrationEvents.occurredAt),
        desc(documentRegistrationEvents.id),
      )
      .limit(INITIAL_PAGE_SIZE);
    return rows.map((row) => ({
      id: row.id,
      action: 'document.registered',
      occurredAt: row.occurredAt.toISOString(),
      actor: {
        internalUserId: row.internalUserId,
        displayName: row.displayName,
      },
      target: {
        type: 'document',
        documentId: row.documentId,
        companyId: row.companyId,
      },
      metadata: {},
    }));
  }
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
    const eventTargetClient = alias(
      clientAccounts,
      'activity_log_target_client',
    );
    const actorMembership = alias(
      workspaceMemberships,
      'activity_log_actor_membership',
    );
    const targetMembership = alias(
      workspaceMemberships,
      'activity_log_target_membership',
    );
    const canManageClientsAcrossWorkspace =
      actor.workspacePermissions.includes('client.manage');
    const canReadClientsForCompany =
      actor.activeCompany?.clientPermissions.includes('client.read') ?? false;
    const canReadClients =
      canManageClientsAcrossWorkspace || canReadClientsForCompany;
    const visibleClientForCompany = actor.activeCompany
      ? exists(
          this.databaseContext.connection
            .select({ id: clientCompanyRelationships.id })
            .from(clientCompanyRelationships)
            .where(
              and(
                eq(
                  clientCompanyRelationships.workspaceId,
                  activityLogEvents.workspaceId,
                ),
                eq(
                  clientCompanyRelationships.clientAccountId,
                  activityLogEvents.targetClientAccountId,
                ),
                eq(
                  clientCompanyRelationships.companyId,
                  actor.activeCompany.id,
                ),
                eq(clientCompanyRelationships.status, 'active'),
              ),
            ),
        )
      : sql<boolean>`false`;
    const visibleClientEventsForCompanyManager =
      canReadClients && actor.activeCompany
        ? canManageClientsAcrossWorkspace
          ? or(
              and(
                eq(activityLogEvents.targetType, 'client_account'),
                eq(activityLogEvents.action, 'client.created'),
              ),
              canReadClientsForCompany
                ? and(
                    eq(activityLogEvents.targetType, 'client_account'),
                    visibleClientForCompany,
                  )
                : sql<boolean>`false`,
              and(
                eq(activityLogEvents.targetType, 'client_company_relationship'),
                eq(activityLogEvents.targetCompanyId, actor.activeCompany.id),
              ),
            )
          : and(
              or(
                eq(activityLogEvents.targetType, 'client_account'),
                and(
                  eq(
                    activityLogEvents.targetType,
                    'client_company_relationship',
                  ),
                  eq(activityLogEvents.targetCompanyId, actor.activeCompany.id),
                ),
              ),
              visibleClientForCompany,
            )
        : sql<boolean>`false`;
    const canAdministerWorkspaceAccess = actor.workspacePermissions.includes(
      'company.assignment.manage',
    );
    const isWorkspaceMembershipTarget = sql<boolean>`
      ${activityLogEvents.targetType}::text = 'workspace_membership'
    `;
    const visibleEvents = actor.workspacePermissions.includes('company.manage')
      ? and(
          eq(activityLogEvents.workspaceId, actor.workspaceId),
          or(
            and(
              notInArray(activityLogEvents.targetType, [
                'client_account',
                'client_company_relationship',
              ]),
              sql<boolean>`${activityLogEvents.targetType}::text <> 'workspace_membership'`,
            ),
            canAdministerWorkspaceAccess
              ? isWorkspaceMembershipTarget
              : sql<boolean>`false`,
            visibleClientEventsForCompanyManager,
          ),
        )
      : and(
          eq(activityLogEvents.workspaceId, actor.workspaceId),
          or(
            eq(activityLogEvents.targetType, 'internal_user'),
            canAdministerWorkspaceAccess
              ? isWorkspaceMembershipTarget
              : sql<boolean>`false`,
            canReadClients && actor.activeCompany
              ? and(
                  or(
                    and(
                      eq(activityLogEvents.targetType, 'client_account'),
                      or(
                        canManageClientsAcrossWorkspace
                          ? eq(activityLogEvents.action, 'client.created')
                          : sql<boolean>`false`,
                        canReadClientsForCompany
                          ? sql<boolean>`true`
                          : sql<boolean>`false`,
                      ),
                    ),
                    and(
                      eq(
                        activityLogEvents.targetType,
                        'client_company_relationship',
                      ),
                      eq(
                        activityLogEvents.targetCompanyId,
                        actor.activeCompany.id,
                      ),
                    ),
                  ),
                  visibleClientForCompany,
                )
              : sql<boolean>`false`,
          ),
        );
    const rows = await this.databaseContext.connection
      .select({
        id: activityLogEvents.id,
        action: activityLogEvents.action,
        occurredAt: activityLogEvents.occurredAt,
        actorInternalUserId: eventActor.id,
        actorDisplayName: eventActor.displayName,
        targetType: activityLogEvents.targetType,
        targetWorkspaceInvitationId:
          activityLogEvents.targetWorkspaceInvitationId,
        targetCompanyRoleAssignmentId:
          activityLogEvents.targetCompanyRoleAssignmentId,
        targetWorkspaceMembershipId:
          activityLogEvents.targetWorkspaceMembershipId,
        targetInternalUserId: eventTarget.id,
        targetInternalUserDisplayName: eventTarget.displayName,
        targetCompanyId: eventTargetCompany.id,
        targetCompanyDisplayName: eventTargetCompany.displayName,
        targetClientAccountId: eventTargetClient.id,
        targetClientDisplayName: eventTargetClient.displayName,
        targetClientCompanyRelationshipId:
          activityLogEvents.targetClientCompanyRelationshipId,
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
      .leftJoin(
        eventTargetClient,
        and(
          eq(activityLogEvents.workspaceId, eventTargetClient.workspaceId),
          eq(activityLogEvents.targetClientAccountId, eventTargetClient.id),
        ),
      )
      .where(
        or(
          and(
            visibleEvents,
            sql`${activityLogEvents.targetType}::text <> 'workspace_invitation'`,
          ),
          actor.workspacePermissions.includes('member.invite')
            ? and(
                eq(activityLogEvents.workspaceId, actor.workspaceId),
                eq(activityLogEvents.targetType, 'workspace_invitation'),
              )
            : sql<boolean>`false`,
        ),
      )
      .orderBy(desc(activityLogEvents.occurredAt), desc(activityLogEvents.id))
      .limit(INITIAL_PAGE_SIZE);

    const datedEvents = [
      ...rows.map((event) => ({
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
      ...(await this.projectEvents(actor)),
      ...(await this.documentEvents(actor)),
    ];
    datedEvents.sort(
      (left, right) =>
        right.occurredAt.localeCompare(left.occurredAt) ||
        right.id.localeCompare(left.id),
    );
    return {
      events: [
        ...datedEvents.slice(0, INITIAL_PAGE_SIZE),
        // Redacted union projections have no public time or cross-Company
        // ordering key. Preserve their independently generated Company order.
        ...(await this.clientUnionEvents(actor)),
      ],
    };
  }
}

function persistenceFor(event: CanonicalActivityEvent) {
  switch (event.action) {
    case 'workspace_invitation.issued':
    case 'workspace_invitation.revoked':
    case 'workspace_invitation.accepted':
      return {
        targetType: event.target.type,
        targetWorkspaceInvitationId: event.target.invitationId,
        idempotencyKey: `${event.action}:${event.target.invitationId}`,
      };
    case 'internal_user.provisioned':
      return {
        targetType: event.target.type,
        targetInternalUserId: event.target.internalUserId,
        targetWorkspaceMembershipId: event.actor.workspaceMembershipId,
        targetCompanyId: null,
        targetCompanyRoleAssignmentId: null,
        targetClientAccountId: null,
        targetClientCompanyRelationshipId: null,
        idempotencyKey: `${event.action}:${event.target.internalUserId}`,
      };
    case 'workspace_membership.suspended':
    case 'workspace_sessions.revoked':
    case 'workspace_sessions.revocation_retry_required':
      return {
        targetType: event.target.type,
        targetInternalUserId: event.target.internalUserId,
        targetWorkspaceMembershipId: event.target.workspaceMembershipId,
        targetCompanyId: null,
        targetCompanyRoleAssignmentId: null,
        targetClientAccountId: null,
        targetClientCompanyRelationshipId: null,
        idempotencyKey: `${event.action}:${event.target.workspaceMembershipId}:${event.transitionId}`,
      };
    case 'company.registered':
      return {
        targetType: event.target.type,
        targetInternalUserId: null,
        targetWorkspaceMembershipId: null,
        targetCompanyId: event.target.companyId,
        targetCompanyRoleAssignmentId: null,
        targetClientAccountId: null,
        targetClientCompanyRelationshipId: null,
        idempotencyKey: `${event.action}:${event.target.companyId}`,
      };
    case 'company_document_registrar_assignment.granted':
    case 'company_document_registrar_assignment.revoked':
    case 'company_project_assignment.granted':
    case 'company_project_assignment.revoked':
    case 'company_context_assignment.granted':
    case 'company_context_assignment.revoked':
    case 'company_director_client_assignment.granted':
    case 'company_director_client_assignment.revoked':
      return {
        targetType: event.target.type,
        targetInternalUserId: event.target.internalUserId,
        targetWorkspaceMembershipId: event.target.workspaceMembershipId,
        targetCompanyId: event.target.companyId,
        targetCompanyRoleAssignmentId: event.target.assignmentId,
        targetClientAccountId: null,
        targetClientCompanyRelationshipId: null,
        idempotencyKey: `${event.action}:${event.target.assignmentId}:${event.transitionId}`,
      };
    case 'client.created':
      return {
        targetType: event.target.type,
        targetInternalUserId: null,
        targetWorkspaceMembershipId: null,
        targetCompanyId: null,
        targetCompanyRoleAssignmentId: null,
        targetClientAccountId: event.target.clientAccountId,
        targetClientCompanyRelationshipId: null,
        idempotencyKey: `${event.action}:${event.target.clientAccountId}`,
      };
    case 'client.corrected':
      return {
        targetType: event.target.type,
        targetInternalUserId: null,
        targetWorkspaceMembershipId: null,
        targetCompanyId: event.target.companyId,
        targetCompanyRoleAssignmentId: null,
        targetClientAccountId: event.target.clientAccountId,
        targetClientCompanyRelationshipId: null,
        idempotencyKey: `${event.action}:${event.target.clientAccountId}:${event.transitionId}`,
      };
    case 'client_company_relationship.established':
      return {
        targetType: event.target.type,
        targetInternalUserId: null,
        targetWorkspaceMembershipId: null,
        targetCompanyId: event.target.companyId,
        targetCompanyRoleAssignmentId: null,
        targetClientAccountId: event.target.clientAccountId,
        targetClientCompanyRelationshipId: event.target.relationshipId,
        idempotencyKey: `${event.action}:${event.target.relationshipId}`,
      };
    default:
      return assertNever(event);
  }
}

interface PersistedActivityTarget {
  targetType:
    | 'workspace_invitation'
    | 'internal_user'
    | 'workspace_membership'
    | 'company'
    | 'company_role_assignment'
    | 'client_account'
    | 'client_company_relationship';
  targetCompanyRoleAssignmentId: string | null;
  targetWorkspaceInvitationId: string | null;
  targetWorkspaceMembershipId: string | null;
  targetInternalUserId: string | null;
  targetInternalUserDisplayName: string | null;
  targetCompanyId: string | null;
  targetCompanyDisplayName: string | null;
  targetClientAccountId: string | null;
  targetClientDisplayName: string | null;
  targetClientCompanyRelationshipId: string | null;
}

function canonicalTarget(event: PersistedActivityTarget) {
  switch (event.targetType) {
    case 'workspace_invitation':
      return {
        type: event.targetType,
        invitationId: required(
          event.targetWorkspaceInvitationId,
          'Invitation id',
        ),
      };
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
    case 'workspace_membership':
      return {
        type: event.targetType,
        workspaceMembershipId: required(
          event.targetWorkspaceMembershipId,
          'Workspace Membership id',
        ),
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
    case 'client_account':
      return event.targetCompanyId === null
        ? {
            type: event.targetType,
            clientAccountId: required(event.targetClientAccountId, 'Client id'),
            displayName: required(
              event.targetClientDisplayName,
              'Client display name',
            ),
          }
        : {
            type: event.targetType,
            clientAccountId: required(event.targetClientAccountId, 'Client id'),
            displayName: required(
              event.targetClientDisplayName,
              'Client display name',
            ),
            companyId: event.targetCompanyId,
            companyDisplayName: required(
              event.targetCompanyDisplayName,
              'Company name',
            ),
          };
    case 'client_company_relationship':
      return {
        type: event.targetType,
        relationshipId: required(
          event.targetClientCompanyRelationshipId,
          'Client–Company Relationship id',
        ),
        clientAccountId: required(event.targetClientAccountId, 'Client id'),
        clientDisplayName: required(
          event.targetClientDisplayName,
          'Client display name',
        ),
        companyId: required(event.targetCompanyId, 'Company id'),
        companyDisplayName: required(
          event.targetCompanyDisplayName,
          'Company name',
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
