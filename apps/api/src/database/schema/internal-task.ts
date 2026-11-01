import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  companies,
  companyRoleAssignments,
  workspaceMemberships,
} from './core.js';

const scope = () => ({
  workspaceId: uuid('workspace_id').notNull(),
  companyId: uuid('company_id').notNull(),
});
const attribution = () => ({
  actorMembershipId: uuid('actor_membership_id').notNull(),
  actorInternalUserId: uuid('actor_internal_user_id').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
});
export const internalCompanyTasks = pgTable(
  'internal_company_tasks',
  {
    ...scope(),
    id: uuid('id').primaryKey(),
    version: integer('version').notNull(),
    creatorMembershipId: uuid('creator_membership_id').notNull(),
    assigneeMembershipId: uuid('assignee_membership_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    snapshot: jsonb('snapshot').$type<unknown>().notNull(),
  },
  (t) => [
    unique('ict_scope_id_unique').on(t.workspaceId, t.companyId, t.id),
    index('ict_discovery_idx').on(
      t.workspaceId,
      t.companyId,
      t.createdAt,
      t.id,
    ),
    foreignKey({
      name: 'ict_company_fk',
      columns: [t.workspaceId, t.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'ict_creator_fk',
      columns: [t.workspaceId, t.creatorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'ict_assignee_fk',
      columns: [t.workspaceId, t.assigneeMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'ict_snapshot_check',
      sql`ict_snapshot_valid(${t.snapshot}) AND ${t.version}>0 AND ${t.snapshot}->>'id'=${t.id}::text AND ${t.snapshot}->>'workspaceId'=${t.workspaceId}::text AND ${t.snapshot}->>'companyId'=${t.companyId}::text AND (${t.snapshot}->>'version')::integer=${t.version} AND ${t.snapshot}->>'createdByMembershipId'=${t.creatorMembershipId}::text AND (${t.snapshot}->'assignee'->>'membershipId') IS NOT DISTINCT FROM ${t.assigneeMembershipId}::text AND (${t.snapshot}->>'createdAt')::timestamptz=${t.createdAt}`,
    ),
  ],
);
export const internalCompanyTaskHistory = pgTable(
  'internal_company_task_history',
  {
    ...scope(),
    ...attribution(),
    taskId: uuid('task_id').notNull(),
    version: integer('version').notNull(),
    fact: jsonb('fact').$type<unknown>().notNull(),
  },
  (t) => [
    unique('ict_history_scope_version_unique').on(
      t.workspaceId,
      t.companyId,
      t.taskId,
      t.version,
    ),
    foreignKey({
      name: 'ict_history_task_fk',
      columns: [t.workspaceId, t.companyId, t.taskId],
      foreignColumns: [
        internalCompanyTasks.workspaceId,
        internalCompanyTasks.companyId,
        internalCompanyTasks.id,
      ],
    }),
    foreignKey({
      name: 'ict_history_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'ict_history_check',
      sql`ict_history_valid(${t.fact}) AND ${t.version}>0 AND ${t.fact}->>'workspaceId'=${t.workspaceId}::text AND ${t.fact}->>'companyId'=${t.companyId}::text AND ${t.fact}->>'taskId'=${t.taskId}::text AND (${t.fact}->>'version')::integer=${t.version} AND ${t.fact}->>'actorMembershipId'=${t.actorMembershipId}::text AND (${t.fact}->>'recordedAt')::timestamptz=${t.recordedAt}`,
    ),
  ],
);
export const internalCompanyTaskCommands = pgTable(
  'internal_company_task_commands',
  {
    ...scope(),
    ...attribution(),
    id: uuid('id').defaultRandom().primaryKey(),
    taskId: uuid('task_id').notNull(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => companyRoleAssignments.id),
    idempotencyKey: text('idempotency_key').notNull(),
    intent: jsonb('intent').$type<unknown>().notNull(),
    version: integer('version').notNull(),
    changed: integer('changed').notNull(),
    response: jsonb('response').$type<unknown>().notNull(),
  },
  (t) => [
    uniqueIndex('ict_command_actor_key_unique').on(
      t.workspaceId,
      t.actorMembershipId,
      t.idempotencyKey,
    ),
    uniqueIndex('ict_command_material_unique')
      .on(t.workspaceId, t.companyId, t.taskId, t.version)
      .where(sql`${t.changed}=1`),
    foreignKey({
      name: 'ict_command_history_fk',
      columns: [t.workspaceId, t.companyId, t.taskId, t.version],
      foreignColumns: [
        internalCompanyTaskHistory.workspaceId,
        internalCompanyTaskHistory.companyId,
        internalCompanyTaskHistory.taskId,
        internalCompanyTaskHistory.version,
      ],
    }),
    foreignKey({
      name: 'ict_command_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'ict_command_check',
      sql`${t.changed} IN (0,1) AND ${t.version}>0 AND length(${t.idempotencyKey})>0 AND ict_receipt_valid(${t.response})`,
    ),
  ],
);
export const internalCompanyTaskEvents = pgTable(
  'internal_company_task_events',
  {
    ...scope(),
    ...attribution(),
    taskId: uuid('task_id').notNull(),
    version: integer('version').notNull(),
    action: text('action').notNull(),
    metadata: jsonb('metadata').$type<{ version: number }>().notNull(),
  },
  (t) => [
    unique('ict_event_scope_version_unique').on(
      t.workspaceId,
      t.companyId,
      t.taskId,
      t.version,
    ),
    foreignKey({
      name: 'ict_event_history_fk',
      columns: [t.workspaceId, t.companyId, t.taskId, t.version],
      foreignColumns: [
        internalCompanyTaskHistory.workspaceId,
        internalCompanyTaskHistory.companyId,
        internalCompanyTaskHistory.taskId,
        internalCompanyTaskHistory.version,
      ],
    }),
    foreignKey({
      name: 'ict_event_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'ict_event_check',
      sql`${t.version}>0 AND ${t.action} IN ('internal_task.created','internal_task.updated','internal_task.status.changed') AND ${t.metadata}=jsonb_build_object('version',${t.version})`,
    ),
  ],
);
