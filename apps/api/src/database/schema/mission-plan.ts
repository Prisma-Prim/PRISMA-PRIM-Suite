import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies, workspaceMemberships } from './core.js';
import { projects } from './project.js';
import { tasks } from './task.js';
function scope() {
  return {
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
  };
}
export const missionPlans = pgTable(
  'mission_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ...scope(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('mp_scope_id').on(t.workspaceId, t.companyId, t.id),
    index('mp_catalogue').on(t.workspaceId, t.companyId, t.createdAt, t.id),
    foreignKey({
      name: 'mp_company_fk',
      columns: [t.workspaceId, t.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
  ],
);
export const missionPlanVersions = pgTable(
  'mission_plan_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ...scope(),
    planId: uuid('plan_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    title: text('title').notNull(),
    activityCount: integer('activity_count').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('mpv_scope_id').on(t.workspaceId, t.companyId, t.id),
    unique('mpv_scope_plan_id').on(t.workspaceId, t.companyId, t.planId, t.id),
    uniqueIndex('mpv_plan_number').on(
      t.workspaceId,
      t.companyId,
      t.planId,
      t.versionNumber,
    ),
    foreignKey({
      name: 'mpv_plan_fk',
      columns: [t.workspaceId, t.companyId, t.planId],
      foreignColumns: [
        missionPlans.workspaceId,
        missionPlans.companyId,
        missionPlans.id,
      ],
    }),
    foreignKey({
      name: 'mpv_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'mpv_content_check',
      sql`${t.versionNumber}>=1 AND ${t.activityCount} BETWEEN 1 AND 50 AND char_length(${t.title}) BETWEEN 1 AND 200 AND ${t.title}=btrim(${t.title})`,
    ),
  ],
);
export const missionPlanActivities = pgTable(
  'mission_plan_activities',
  {
    ...scope(),
    versionId: uuid('version_id').notNull(),
    key: uuid('activity_key').notNull(),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    activity: text('activity').notNull(),
    intendedResult: text('intended_result').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.versionId, t.key] }),
    uniqueIndex('mpa_version_position').on(
      t.workspaceId,
      t.companyId,
      t.versionId,
      t.position,
    ),
    unique('mpa_exact_row').on(
      t.workspaceId,
      t.companyId,
      t.versionId,
      t.key,
      t.position,
    ),
    foreignKey({
      name: 'mpa_version_fk',
      columns: [t.workspaceId, t.companyId, t.versionId],
      foreignColumns: [
        missionPlanVersions.workspaceId,
        missionPlanVersions.companyId,
        missionPlanVersions.id,
      ],
    }),
    check(
      'mpa_content_check',
      sql`${t.position} BETWEEN 0 AND 49 AND char_length(${t.title}) BETWEEN 1 AND 200 AND ${t.title}=btrim(${t.title}) AND char_length(${t.activity}) BETWEEN 1 AND 2000 AND char_length(btrim(${t.activity}))>0 AND char_length(${t.intendedResult}) BETWEEN 1 AND 2000 AND char_length(btrim(${t.intendedResult}))>0`,
    ),
  ],
);
export const missionPlanCommands = pgTable(
  'mission_plan_commands',
  {
    ...scope(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    versionId: uuid('version_id').notNull(),
  },
  (t) => [
    uniqueIndex('mpcmd_actor_key').on(
      t.workspaceId,
      t.actorMembershipId,
      t.idempotencyKey,
    ),
    uniqueIndex('mpcmd_exact_version').on(t.versionId),
    foreignKey({
      name: 'mpcmd_version_fk',
      columns: [t.workspaceId, t.companyId, t.versionId],
      foreignColumns: [
        missionPlanVersions.workspaceId,
        missionPlanVersions.companyId,
        missionPlanVersions.id,
      ],
    }),
    foreignKey({
      name: 'mpcmd_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
  ],
);
export const missionPlanInstances = pgTable(
  'mission_plan_instances',
  {
    projectId: uuid('project_id').primaryKey(),
    ...scope(),
    clientAccountId: uuid('client_account_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    planId: uuid('plan_id').notNull(),
    versionId: uuid('version_id').notNull(),
  },
  (t) => [
    unique('mpi_project_version').on(
      t.workspaceId,
      t.companyId,
      t.projectId,
      t.versionId,
    ),
    uniqueIndex('mpi_actor_key').on(
      t.workspaceId,
      t.actorMembershipId,
      t.idempotencyKey,
    ),
    foreignKey({
      name: 'mpi_project_fk',
      columns: [t.workspaceId, t.companyId, t.clientAccountId, t.projectId],
      foreignColumns: [
        projects.workspaceId,
        projects.companyId,
        projects.clientAccountId,
        projects.id,
      ],
    }),
    foreignKey({
      name: 'mpi_source_fk',
      columns: [t.workspaceId, t.companyId, t.planId, t.versionId],
      foreignColumns: [
        missionPlanVersions.workspaceId,
        missionPlanVersions.companyId,
        missionPlanVersions.planId,
        missionPlanVersions.id,
      ],
    }),
    foreignKey({
      name: 'mpi_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
  ],
);
export const missionPlanTaskCopies = pgTable(
  'mission_plan_task_copies',
  {
    ...scope(),
    projectId: uuid('project_id').notNull(),
    versionId: uuid('version_id').notNull(),
    activityKey: uuid('activity_key').notNull(),
    position: integer('position').notNull(),
    taskId: uuid('task_id').notNull(),
  },
  (t) => [
    uniqueIndex('mptc_position').on(
      t.workspaceId,
      t.companyId,
      t.projectId,
      t.position,
    ),
    uniqueIndex('mptc_activity').on(
      t.workspaceId,
      t.companyId,
      t.projectId,
      t.activityKey,
    ),
    uniqueIndex('mptc_task').on(t.workspaceId, t.companyId, t.taskId),
    foreignKey({
      name: 'mptc_instance_fk',
      columns: [t.workspaceId, t.companyId, t.projectId, t.versionId],
      foreignColumns: [
        missionPlanInstances.workspaceId,
        missionPlanInstances.companyId,
        missionPlanInstances.projectId,
        missionPlanInstances.versionId,
      ],
    }),
    foreignKey({
      name: 'mptc_source_row_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.versionId,
        t.activityKey,
        t.position,
      ],
      foreignColumns: [
        missionPlanActivities.workspaceId,
        missionPlanActivities.companyId,
        missionPlanActivities.versionId,
        missionPlanActivities.key,
        missionPlanActivities.position,
      ],
    }),
    foreignKey({
      name: 'mptc_task_fk',
      columns: [t.workspaceId, t.companyId, t.projectId, t.taskId],
      foreignColumns: [
        tasks.workspaceId,
        tasks.companyId,
        tasks.projectId,
        tasks.id,
      ],
    }),
    check('mptc_position_check', sql`${t.position} BETWEEN 0 AND 49`),
  ],
);
