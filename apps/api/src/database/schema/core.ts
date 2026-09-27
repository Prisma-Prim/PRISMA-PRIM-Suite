import { sql } from 'drizzle-orm';
import type { ClientContact } from '../../client/client.types.js';
import type {
  ClientLegalEntityFieldChanges,
  ClientLegalEntityValues,
} from '../../client/client-legal-entity.types.js';
import { workspaceInvitations } from './workspace-invitation.js';
import {
  check,
  foreignKey,
  index,
  integer,
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
  'member.invite',
  'company.manage',
  'company.assignment.manage',
  'client.manage',
]);

export const companyRoleBundle = pgEnum('company_role_bundle', [
  'company_task_manager',
  'company_context_access',
  'company_director_client_access',
  'company_document_project_organizer',
  'company_document_registrar',
  'company_document_approver',
  'company_project_access',
  'company_commercial_intake',
  'company_service_catalogue',
  'company_pricing_configuration',
  'company_pricing_user',
  'company_commercial_activity_reader',
  'company_opportunity_manager',
]);
export const companyContextAssignmentOperation = pgEnum(
  'company_context_assignment_operation',
  ['grant', 'revoke'],
);

export const companyStatus = pgEnum('company_status', ['active', 'inactive']);
export const clientAccountStatus = pgEnum('client_account_status', [
  'active',
  'archived',
  'superseded',
]);
export const clientCompanyRelationshipStatus = pgEnum(
  'client_company_relationship_status',
  ['active', 'archived'],
);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const internalUsers = pgTable(
  'internal_users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
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

export const workspaceMembershipSuspensionCommands = pgTable(
  'workspace_membership_suspension_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    targetWorkspaceMembershipId: uuid(
      'target_workspace_membership_id',
    ).notNull(),
    sessionRevocationStatus: text('session_revocation_status', {
      enum: ['pending', 'running', 'retry_required', 'complete'],
    })
      .default('pending')
      .notNull(),
    sessionRevocationAttemptId: uuid('session_revocation_attempt_id'),
    sessionRevocationAttemptedAt: timestamp('session_revocation_attempted_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'suspension_session_revocation_status_check',
      sql`${table.sessionRevocationStatus} IN ('pending', 'running', 'retry_required', 'complete')`,
    ),
    check(
      'suspension_session_revocation_attempt_check',
      sql`(${table.sessionRevocationStatus} = 'pending' AND ${table.sessionRevocationAttemptId} IS NULL AND ${table.sessionRevocationAttemptedAt} IS NULL) OR (${table.sessionRevocationStatus} <> 'pending' AND ${table.sessionRevocationAttemptId} IS NOT NULL AND ${table.sessionRevocationAttemptedAt} IS NOT NULL)`,
    ),
    uniqueIndex('workspace_membership_suspension_commands_actor_key_unique').on(
      table.workspaceId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'workspace_membership_suspension_commands_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'workspace_membership_suspension_commands_target_fk',
      columns: [table.workspaceId, table.targetWorkspaceMembershipId],
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
    permissionSetVersion: text('permission_set_version'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('company_role_assignments_active_scope_unique')
      .on(
        table.workspaceId,
        table.companyId,
        table.workspaceMembershipId,
        table.bundle,
      )
      .where(sql`${table.revokedAt} IS NULL`),
    uniqueIndex('company_role_assignments_target_unique').on(
      table.workspaceId,
      table.companyId,
      table.workspaceMembershipId,
      table.id,
    ),
    uniqueIndex('company_role_assignments_bundle_target_unique').on(
      table.workspaceId,
      table.companyId,
      table.workspaceMembershipId,
      table.bundle,
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
    check(
      'company_role_assignments_permission_set_version_check',
      sql`(
        (${table.bundle}::text = 'company_director_client_access'
          AND ${table.permissionSetVersion} IS NOT NULL
          AND ${table.permissionSetVersion} IN ('v1', 'v2'))
        OR
        (${table.bundle}::text = 'company_document_registrar' AND ${table.permissionSetVersion} IS NOT NULL AND ${table.permissionSetVersion} IN ('v1', 'v2', 'v3'))
        OR
        (${table.bundle}::text IN ('company_commercial_intake', 'company_project_access') AND ${table.permissionSetVersion} IS NOT NULL AND ${table.permissionSetVersion} IN ('v1', 'v2'))
        OR
        (${table.bundle}::text IN ('company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_commercial_activity_reader', 'company_opportunity_manager') AND ${table.permissionSetVersion} IS NOT NULL AND ${table.permissionSetVersion} = 'v1')
        OR
        (${table.bundle}::text NOT IN ('company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_commercial_activity_reader', 'company_opportunity_manager')
          AND ${table.permissionSetVersion} IS NULL)
      )`,
    ),
  ],
);

export const companyContextAssignmentCommands = pgTable(
  'company_context_assignment_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    bundle: companyRoleBundle('bundle')
      .default('company_context_access')
      .notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    operation: companyContextAssignmentOperation('operation').notNull(),
    targetWorkspaceMembershipId: uuid(
      'target_workspace_membership_id',
    ).notNull(),
    companyId: uuid('company_id').notNull(),
    resultAssignmentId: uuid('result_assignment_id'),
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
        table.bundle,
        table.resultAssignmentId,
      ],
      foreignColumns: [
        companyRoleAssignments.workspaceId,
        companyRoleAssignments.companyId,
        companyRoleAssignments.workspaceMembershipId,
        companyRoleAssignments.bundle,
        companyRoleAssignments.id,
      ],
    }),
  ],
);

export const clientAccounts = pgTable(
  'client_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    displayName: text('display_name').notNull(),
    taxId: text('tax_id'),
    address: text('address'),
    telephone: text('telephone'),
    generalEmail: text('general_email'),
    contacts: jsonb('contacts').$type<ClientContact[]>().default([]).notNull(),
    businessActivity: text('business_activity'),
    version: integer('version').default(1).notNull(),
    status: clientAccountStatus('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdByInternalUserId: uuid('created_by_internal_user_id').notNull(),
    createdByWorkspaceMembershipId: uuid(
      'created_by_workspace_membership_id',
    ).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('client_accounts_workspace_id_id_unique').on(
      table.workspaceId,
      table.id,
    ),
    index('client_accounts_active_tax_id_lookup')
      .on(table.workspaceId, table.taxId)
      .where(sql`${table.status} = 'active' AND ${table.taxId} IS NOT NULL`),
    foreignKey({
      name: 'client_accounts_creator_membership_fk',
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
    check('client_accounts_positive_version_check', sql`${table.version} > 0`),
  ],
);

export const clientCompanyRelationships = pgTable(
  'client_company_relationships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    companyId: uuid('company_id').notNull(),
    status: clientCompanyRelationshipStatus('status')
      .default('active')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdByInternalUserId: uuid('created_by_internal_user_id').notNull(),
    createdByWorkspaceMembershipId: uuid(
      'created_by_workspace_membership_id',
    ).notNull(),
  },
  (table) => [
    uniqueIndex('client_company_relationships_scope_unique').on(
      table.workspaceId,
      table.clientAccountId,
      table.companyId,
    ),
    uniqueIndex('client_company_relationships_target_unique').on(
      table.workspaceId,
      table.clientAccountId,
      table.companyId,
      table.id,
    ),
    foreignKey({
      name: 'client_company_relationships_client_fk',
      columns: [table.workspaceId, table.clientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'client_company_relationships_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'client_company_relationships_creator_membership_fk',
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

export const clientAccountRegistrationCommands = pgTable(
  'client_account_registration_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    displayName: text('display_name').notNull(),
    taxId: text('tax_id'),
    address: text('address'),
    telephone: text('telephone'),
    generalEmail: text('general_email'),
    contacts: jsonb('contacts').$type<ClientContact[]>().default([]).notNull(),
    businessActivity: text('business_activity'),
    companyId: uuid('company_id').notNull(),
    resultClientAccountId: uuid('result_client_account_id'),
    resultRelationshipId: uuid('result_relationship_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('client_registration_commands_actor_key_unique').on(
      table.workspaceId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    uniqueIndex('client_registration_commands_review_target_unique').on(
      table.workspaceId,
      table.actorWorkspaceMembershipId,
      table.id,
    ),
    foreignKey({
      name: 'client_registration_commands_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'client_registration_commands_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'client_registration_commands_client_fk',
      columns: [table.workspaceId, table.resultClientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'client_registration_commands_relationship_fk',
      columns: [
        table.workspaceId,
        table.resultClientAccountId,
        table.companyId,
        table.resultRelationshipId,
      ],
      foreignColumns: [
        clientCompanyRelationships.workspaceId,
        clientCompanyRelationships.clientAccountId,
        clientCompanyRelationships.companyId,
        clientCompanyRelationships.id,
      ],
    }),
    check(
      'client_registration_commands_result_shape_check',
      sql`(
        (${table.resultClientAccountId} IS NULL AND ${table.resultRelationshipId} IS NULL)
        OR
        (${table.resultClientAccountId} IS NOT NULL AND ${table.resultRelationshipId} IS NOT NULL)
      )`,
    ),
  ],
);

export const clientAccountCorrectionCommands = pgTable(
  'client_account_correction_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    companyId: uuid('company_id').notNull(),
    expectedVersion: integer('expected_version').notNull(),
    changes: jsonb('changes').$type<Record<string, unknown>>().notNull(),
    result: jsonb('result').$type<{
      id: string;
      displayName: string;
      relatedToActiveCompany: boolean;
      taxId: string | null;
      address: string | null;
      telephone: string | null;
      generalEmail: string | null;
      contacts: ClientContact[];
      businessActivity: string | null;
      version: number;
      involvedCompanyDisplayNames: string[];
    }>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('client_correction_commands_actor_key_unique').on(
      table.workspaceId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    uniqueIndex('client_correction_commands_review_target_unique').on(
      table.workspaceId,
      table.actorWorkspaceMembershipId,
      table.id,
    ),
    foreignKey({
      name: 'client_correction_commands_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'client_correction_commands_client_fk',
      columns: [table.workspaceId, table.clientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'client_correction_commands_relationship_fk',
      columns: [table.workspaceId, table.clientAccountId, table.companyId],
      foreignColumns: [
        clientCompanyRelationships.workspaceId,
        clientCompanyRelationships.clientAccountId,
        clientCompanyRelationships.companyId,
      ],
    }),
    check(
      'client_correction_commands_positive_version_check',
      sql`${table.expectedVersion} > 0`,
    ),
  ],
);

export const activityLogAction = pgEnum('activity_log_action', [
  'workspace_invitation.issued',
  'workspace_invitation.revoked',
  'workspace_invitation.accepted',
  'internal_user.provisioned',
  'workspace_membership.suspended',
  'workspace_sessions.revoked',
  'workspace_sessions.revocation_retry_required',
  'company.registered',
  'company_context_assignment.granted',
  'company_context_assignment.revoked',
  'company_director_client_assignment.granted',
  'company_director_client_assignment.revoked',
  'company_task_manager_assignment.granted',
  'company_task_manager_assignment.revoked',
  'company_document_project_organizer_assignment.granted',
  'company_document_project_organizer_assignment.revoked',
  'company_document_registrar_assignment.granted',
  'company_document_registrar_assignment.revoked',
  'company_document_approver_assignment.granted',
  'company_document_approver_assignment.revoked',
  'company_project_assignment.granted',
  'company_project_assignment.revoked',
  'company_commercial_intake_assignment.granted',
  'company_commercial_intake_assignment.revoked',
  'company_service_catalogue_assignment.granted',
  'company_service_catalogue_assignment.revoked',
  'company_pricing_configuration_assignment.granted',
  'company_pricing_configuration_assignment.revoked',
  'company_pricing_user_assignment.granted',
  'company_pricing_user_assignment.revoked',
  'company_commercial_activity_reader_assignment.granted',
  'company_commercial_activity_reader_assignment.revoked',
  'company_opportunity_manager_assignment.granted',
  'company_opportunity_manager_assignment.revoked',
  'client.created',
  'client_company_relationship.established',
  'client.corrected',
  'client_legal_entity.registered',
  'client_legal_entity.corrected',
]);

export const activityLogTargetType = pgEnum('activity_log_target_type', [
  'workspace_invitation',
  'internal_user',
  'workspace_membership',
  'company',
  'company_role_assignment',
  'client_account',
  'client_company_relationship',
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
    targetWorkspaceInvitationId: uuid('target_workspace_invitation_id'),
    targetInternalUserId: uuid('target_internal_user_id'),
    targetWorkspaceMembershipId: uuid('target_workspace_membership_id'),
    targetCompanyId: uuid('target_company_id'),
    targetCompanyRoleAssignmentId: uuid('target_company_role_assignment_id'),
    targetClientAccountId: uuid('target_client_account_id'),
    targetClientCompanyRelationshipId: uuid(
      'target_client_company_relationship_id',
    ),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    metadata: jsonb('metadata')
      .$type<
        | { identityProvider: string }
        | {
            bundle:
              | 'Company Task Manager'
              | 'Company Context Access'
              | 'Company Director Client Access'
              | 'Company Document Project Organizer'
              | 'Company Document Registrar'
              | 'Company Document Approver'
              | 'Company Project Access'
              | 'Company Commercial Intake'
              | 'Company Service Catalogue'
              | 'Company Pricing Configuration'
              | 'Company Pricing User'
              | 'Company Commercial Activity Reader'
              | 'Company Opportunity Manager';
          }
        | { changes: Record<string, { before: unknown; after: unknown }> }
        | { legalEntityId: string; values: ClientLegalEntityValues }
        | { legalEntityId: string; changes: ClientLegalEntityFieldChanges }
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
      name: 'activity_log_events_invitation_fk',
      columns: [table.workspaceId, table.targetWorkspaceInvitationId],
      foreignColumns: [
        workspaceInvitations.workspaceId,
        workspaceInvitations.id,
      ],
    }),
    check(
      'activity_log_events_invitation_target_check',
      sql`(${table.targetType}::text = 'workspace_invitation') = (${table.targetWorkspaceInvitationId} IS NOT NULL)`,
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
    foreignKey({
      name: 'activity_log_events_target_client_fk',
      columns: [table.workspaceId, table.targetClientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'activity_log_events_target_client_relationship_fk',
      columns: [
        table.workspaceId,
        table.targetClientAccountId,
        table.targetCompanyId,
        table.targetClientCompanyRelationshipId,
      ],
      foreignColumns: [
        clientCompanyRelationships.workspaceId,
        clientCompanyRelationships.clientAccountId,
        clientCompanyRelationships.companyId,
        clientCompanyRelationships.id,
      ],
    }),
    check(
      'activity_log_events_target_shape_check',
      sql`(
        (${table.targetType}::text = 'workspace_invitation'
          AND ${table.targetInternalUserId} IS NULL
          AND ${table.targetWorkspaceMembershipId} IS NULL
          AND ${table.targetCompanyId} IS NULL
          AND ${table.targetCompanyRoleAssignmentId} IS NULL
          AND ${table.targetClientAccountId} IS NULL
          AND ${table.targetClientCompanyRelationshipId} IS NULL)
        OR
        (${table.targetType}::text = 'internal_user'
          AND ${table.targetInternalUserId} IS NOT NULL
          AND ${table.targetWorkspaceMembershipId} IS NOT NULL
          AND ${table.targetCompanyId} IS NULL
          AND ${table.targetCompanyRoleAssignmentId} IS NULL
          AND ${table.targetClientAccountId} IS NULL
          AND ${table.targetClientCompanyRelationshipId} IS NULL)
        OR
        (${table.targetType}::text = 'workspace_membership'
          AND ${table.targetInternalUserId} IS NOT NULL
          AND ${table.targetWorkspaceMembershipId} IS NOT NULL
          AND ${table.targetCompanyId} IS NULL
          AND ${table.targetCompanyRoleAssignmentId} IS NULL
          AND ${table.targetClientAccountId} IS NULL
          AND ${table.targetClientCompanyRelationshipId} IS NULL)
        OR
        (${table.targetType}::text = 'company'
          AND ${table.targetInternalUserId} IS NULL
          AND ${table.targetWorkspaceMembershipId} IS NULL
          AND ${table.targetCompanyId} IS NOT NULL
          AND ${table.targetCompanyRoleAssignmentId} IS NULL
          AND ${table.targetClientAccountId} IS NULL
          AND ${table.targetClientCompanyRelationshipId} IS NULL)
        OR
        (${table.targetType}::text = 'company_role_assignment'
          AND ${table.targetInternalUserId} IS NOT NULL
          AND ${table.targetWorkspaceMembershipId} IS NOT NULL
          AND ${table.targetCompanyId} IS NOT NULL
          AND ${table.targetCompanyRoleAssignmentId} IS NOT NULL
          AND ${table.targetClientAccountId} IS NULL
          AND ${table.targetClientCompanyRelationshipId} IS NULL)
        OR
        (${table.targetType}::text = 'client_account'
          AND ${table.targetInternalUserId} IS NULL
          AND ${table.targetWorkspaceMembershipId} IS NULL
          AND ${table.targetCompanyRoleAssignmentId} IS NULL
          AND ${table.targetClientAccountId} IS NOT NULL
          AND ${table.targetClientCompanyRelationshipId} IS NULL)
        OR
        (${table.targetType}::text = 'client_company_relationship'
          AND ${table.targetInternalUserId} IS NULL
          AND ${table.targetWorkspaceMembershipId} IS NULL
          AND ${table.targetCompanyId} IS NOT NULL
          AND ${table.targetCompanyRoleAssignmentId} IS NULL
          AND ${table.targetClientAccountId} IS NOT NULL
          AND ${table.targetClientCompanyRelationshipId} IS NOT NULL)
      )`,
    ),
  ],
);
