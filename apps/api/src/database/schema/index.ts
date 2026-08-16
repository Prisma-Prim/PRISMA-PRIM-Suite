import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const internalUserStatus = pgEnum('internal_user_status', [
  'active',
  'inactive',
]);

export const workspaceMembershipStatus = pgEnum('workspace_membership_status', [
  'active',
  'inactive',
]);

export const workspacePermission = pgEnum('workspace_permission', [
  'company.manage',
  'company.assignment.manage',
]);

export const companyRoleBundle = pgEnum('company_role_bundle', [
  'company_context_access',
]);
export const companyContextAssignmentOperation = pgEnum(
  'company_context_assignment_operation',
  ['grant', 'revoke'],
);

export const companyStatus = pgEnum('company_status', ['active', 'inactive']);

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    singletonKey: text('singleton_key').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('workspaces_singleton_key_unique').on(table.singletonKey),
  ],
);

export const internalUsers = pgTable(
  'internal_users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Expand/backfill compatibility only. Access authority comes from Workspace Membership.
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    externalProvider: text('external_provider').notNull(),
    externalSubject: text('external_subject').notNull(),
    displayName: text('display_name').notNull(),
    email: text('email').notNull(),
    status: internalUserStatus('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('internal_users_external_identity_unique').on(
      table.externalProvider,
      table.externalSubject,
    ),
    uniqueIndex('internal_users_workspace_id_id_unique').on(
      table.workspaceId,
      table.id,
    ),
  ],
);

export const workspaceMemberships = pgTable(
  'workspace_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    internalUserId: uuid('internal_user_id')
      .notNull()
      .references(() => internalUsers.id),
    status: workspaceMembershipStatus('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('workspace_memberships_workspace_user_unique').on(
      table.workspaceId,
      table.internalUserId,
    ),
    uniqueIndex('workspace_memberships_workspace_id_id_unique').on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex('workspace_memberships_workspace_id_user_unique').on(
      table.workspaceId,
      table.id,
      table.internalUserId,
    ),
  ],
);

export const workspacePermissionGrants = pgTable(
  'workspace_permission_grants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    workspaceMembershipId: uuid('workspace_membership_id').notNull(),
    permission: workspacePermission('permission').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('workspace_permission_grants_scope_unique').on(
      table.workspaceId,
      table.workspaceMembershipId,
      table.permission,
    ),
    foreignKey({
      name: 'workspace_permission_grants_membership_fk',
      columns: [table.workspaceId, table.workspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
  ],
);

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    displayName: text('display_name').notNull(),
    status: companyStatus('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdByInternalUserId: uuid('created_by_internal_user_id').notNull(),
    createdByWorkspaceMembershipId: uuid(
      'created_by_workspace_membership_id',
    ).notNull(),
    registrationIdempotencyKey: text('registration_idempotency_key').notNull(),
  },
  (table) => [
    uniqueIndex('companies_workspace_id_id_unique').on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex('companies_workspace_registration_key_unique').on(
      table.workspaceId,
      table.registrationIdempotencyKey,
    ),
    foreignKey({
      name: 'companies_creator_membership_fk',
      columns: [
        table.workspaceId,
        table.createdByWorkspaceMembershipId,
        table.createdByInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
  ],
);

export const companyRoleAssignments = pgTable(
  'company_role_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    workspaceMembershipId: uuid('workspace_membership_id').notNull(),
    bundle: companyRoleBundle('bundle').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    transitionId: uuid('transition_id').defaultRandom().notNull(),
  },
  (table) => [
    uniqueIndex('company_role_assignments_scope_unique').on(
      table.workspaceId,
      table.companyId,
      table.workspaceMembershipId,
      table.bundle,
    ),
    uniqueIndex('company_role_assignments_target_unique').on(
      table.workspaceId,
      table.companyId,
      table.workspaceMembershipId,
      table.id,
    ),
    foreignKey({
      name: 'company_role_assignments_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'company_role_assignments_membership_fk',
      columns: [table.workspaceId, table.workspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
  ],
);

export const companyContextAssignmentCommands = pgTable(
  'company_context_assignment_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    operation: companyContextAssignmentOperation('operation').notNull(),
    targetWorkspaceMembershipId: uuid(
      'target_workspace_membership_id',
    ).notNull(),
    companyId: uuid('company_id').notNull(),
    resultAssignmentId: uuid('result_assignment_id'),
    resultActive: boolean('result_active').notNull(),
    transitionId: uuid('transition_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('company_context_assignment_commands_actor_key_unique').on(
      table.workspaceId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'company_context_assignment_commands_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'company_context_assignment_commands_target_membership_fk',
      columns: [table.workspaceId, table.targetWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'company_context_assignment_commands_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'company_context_assignment_commands_result_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.targetWorkspaceMembershipId,
        table.resultAssignmentId,
      ],
      foreignColumns: [
        companyRoleAssignments.workspaceId,
        companyRoleAssignments.companyId,
        companyRoleAssignments.workspaceMembershipId,
        companyRoleAssignments.id,
      ],
    }),
  ],
);

export const activityLogAction = pgEnum('activity_log_action', [
  'internal_user.provisioned',
  'company.registered',
  'company_context_assignment.granted',
  'company_context_assignment.revoked',
]);

export const activityLogTargetType = pgEnum('activity_log_target_type', [
  'internal_user',
  'company',
  'company_role_assignment',
]);

export const activityLogEvents = pgTable(
  'activity_log_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    action: activityLogAction('action').notNull(),
    targetType: activityLogTargetType('target_type').notNull(),
    targetInternalUserId: uuid('target_internal_user_id'),
    targetWorkspaceMembershipId: uuid('target_workspace_membership_id'),
    targetCompanyId: uuid('target_company_id'),
    targetCompanyRoleAssignmentId: uuid('target_company_role_assignment_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    metadata: jsonb('metadata')
      .$type<
        | { identityProvider: string }
        | { bundle: 'Company Context Access' }
        | Record<string, never>
      >()
      .notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
  },
  (table) => [
    uniqueIndex('activity_log_events_idempotency_key_unique').on(
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'activity_log_events_actor_membership_fk',
      columns: [
        table.workspaceId,
        table.actorWorkspaceMembershipId,
        table.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    foreignKey({
      name: 'activity_log_events_target_company_assignment_fk',
      columns: [
        table.workspaceId,
        table.targetCompanyId,
        table.targetWorkspaceMembershipId,
        table.targetCompanyRoleAssignmentId,
      ],
      foreignColumns: [
        companyRoleAssignments.workspaceId,
        companyRoleAssignments.companyId,
        companyRoleAssignments.workspaceMembershipId,
        companyRoleAssignments.id,
      ],
    }),
    foreignKey({
      name: 'activity_log_events_target_membership_fk',
      columns: [
        table.workspaceId,
        table.targetWorkspaceMembershipId,
        table.targetInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    foreignKey({
      name: 'activity_log_events_target_company_fk',
      columns: [table.workspaceId, table.targetCompanyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    check(
      'activity_log_events_target_shape_check',
      sql`(
        (${table.targetType}::text = 'internal_user'
          AND ${table.targetInternalUserId} IS NOT NULL
          AND ${table.targetWorkspaceMembershipId} IS NOT NULL
          AND ${table.targetCompanyId} IS NULL
          AND ${table.targetCompanyRoleAssignmentId} IS NULL)
        OR
        (${table.targetType}::text = 'company'
          AND ${table.targetInternalUserId} IS NULL
          AND ${table.targetWorkspaceMembershipId} IS NULL
          AND ${table.targetCompanyId} IS NOT NULL
          AND ${table.targetCompanyRoleAssignmentId} IS NULL)
        OR
        (${table.targetType}::text = 'company_role_assignment'
          AND ${table.targetInternalUserId} IS NOT NULL
          AND ${table.targetWorkspaceMembershipId} IS NOT NULL
          AND ${table.targetCompanyId} IS NOT NULL
          AND ${table.targetCompanyRoleAssignmentId} IS NOT NULL)
      )`,
    ),
  ],
);
