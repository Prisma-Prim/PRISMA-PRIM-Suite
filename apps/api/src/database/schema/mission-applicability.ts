import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  companyRoleAssignments,
  workspaceMemberships,
  clientCompanyRelationships,
} from './core.js';
import {
  projectTemplateInstances,
  projectTemplateTaskCopies,
} from './project-template.js';
import { taskResultDeclarations } from './task-results.js';

function scope() {
  return {
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
  };
}
export const missionApplicabilityFacts = pgTable(
  'mission_applicability_facts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ...scope(),
    clientAccountId: uuid('client_account_id').notNull(),
    relationshipId: uuid('relationship_id').notNull(),
    clientUseVersion: integer('client_use_version').default(0).notNull(),
    revision: integer('revision').notNull(),
    predecessorId: uuid('predecessor_id'),
    activityPredecessorId: uuid('activity_predecessor_id'),
    taskId: uuid('task_id').notNull(),
    position: integer('position').notNull(),
    activityKey: text('activity_key').notNull(),
    sourceTitle: text('source_title').notNull(),
    sourceActivity: text('source_activity').notNull(),
    intendedResult: text('intended_result').notNull(),
    kind: text('kind', {
      enum: [
        'PROPOSED',
        'PROPOSAL_CORRECTED',
        'APPROVED',
        'REJECTED',
        'RESTORED',
      ],
    }).notNull(),
    intent: jsonb('intent').$type<unknown>().notNull(),
    taskTitle: text('task_title').notNull(),
    taskStatus: text('task_status').notNull(),
    taskVersion: integer('task_version').notNull(),
    resultRevision: integer('result_revision').notNull(),
    resultId: uuid('result_id'),
    lifecycleRevision: integer('lifecycle_revision').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => companyRoleAssignments.id),
    permissionSetVersion: text('permission_set_version').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('ma_facts_revision_unique').on(
      t.workspaceId,
      t.companyId,
      t.projectId,
      t.revision,
    ),
    uniqueIndex('ma_facts_scope_unique').on(
      t.workspaceId,
      t.companyId,
      t.projectId,
      t.id,
      t.revision,
    ),
    foreignKey({
      name: 'ma_facts_source_fk',
      columns: [t.workspaceId, t.companyId, t.projectId],
      foreignColumns: [
        projectTemplateInstances.workspaceId,
        projectTemplateInstances.companyId,
        projectTemplateInstances.projectId,
      ],
    }),
    foreignKey({
      name: 'ma_facts_mapping_fk',
      columns: [t.workspaceId, t.companyId, t.projectId, t.taskId, t.position],
      foreignColumns: [
        projectTemplateTaskCopies.workspaceId,
        projectTemplateTaskCopies.companyId,
        projectTemplateTaskCopies.projectId,
        projectTemplateTaskCopies.taskId,
        projectTemplateTaskCopies.position,
      ],
    }),
    foreignKey({
      name: 'ma_facts_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    foreignKey({
      name: 'ma_facts_relationship_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.clientAccountId,
        t.relationshipId,
      ],
      foreignColumns: [
        clientCompanyRelationships.workspaceId,
        clientCompanyRelationships.companyId,
        clientCompanyRelationships.clientAccountId,
        clientCompanyRelationships.id,
      ],
    }),
    foreignKey({
      name: 'ma_facts_result_fk',
      columns: [t.workspaceId, t.companyId, t.taskId, t.resultId],
      foreignColumns: [
        taskResultDeclarations.workspaceId,
        taskResultDeclarations.companyId,
        taskResultDeclarations.taskId,
        taskResultDeclarations.id,
      ],
    }),
    check(
      'ma_facts_meaning_check',
      sql`${t.revision} > 0 AND ${t.taskVersion} > 0 AND ${t.resultRevision} >= 0 AND ${t.lifecycleRevision} >= 0 AND ${t.permissionSetVersion} = 'v1' AND jsonb_typeof(${t.intent}) = 'object' AND (${t.resultRevision}=0) = (${t.resultId} IS NULL) AND ${t.kind} IN ('PROPOSED','PROPOSAL_CORRECTED','APPROVED','REJECTED','RESTORED')`,
    ),
  ],
);
export const missionApplicabilityStreams = pgTable(
  'mission_applicability_streams',
  {
    ...scope(),
    revision: integer('revision').notNull(),
    factId: uuid('fact_id').notNull(),
  },
  (t) => [
    uniqueIndex('ma_stream_project_unique').on(
      t.workspaceId,
      t.companyId,
      t.projectId,
    ),
    foreignKey({
      name: 'ma_stream_fact_fk',
      columns: [t.workspaceId, t.companyId, t.projectId, t.factId, t.revision],
      foreignColumns: [
        missionApplicabilityFacts.workspaceId,
        missionApplicabilityFacts.companyId,
        missionApplicabilityFacts.projectId,
        missionApplicabilityFacts.id,
        missionApplicabilityFacts.revision,
      ],
    }),
  ],
);
export const missionApplicabilityCommands = pgTable(
  'mission_applicability_commands',
  {
    ...scope(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    command: text('command').notNull(),
    factId: uuid('fact_id').notNull(),
    applicabilityRevision: integer('applicability_revision').notNull(),
    action: text('action', { enum: ['recorded', 'unchanged'] }).notNull(),
  },
  (t) => [
    uniqueIndex('ma_commands_actor_key_unique').on(
      t.workspaceId,
      t.actorMembershipId,
      t.idempotencyKey,
    ),
    uniqueIndex('ma_commands_recorded_fact_unique')
      .on(t.factId)
      .where(sql`${t.action}='recorded'`),
    foreignKey({
      name: 'ma_commands_fact_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.projectId,
        t.factId,
        t.applicabilityRevision,
      ],
      foreignColumns: [
        missionApplicabilityFacts.workspaceId,
        missionApplicabilityFacts.companyId,
        missionApplicabilityFacts.projectId,
        missionApplicabilityFacts.id,
        missionApplicabilityFacts.revision,
      ],
    }),
    foreignKey({
      name: 'ma_commands_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'ma_commands_meaning_check',
      sql`${t.action} IN ('recorded','unchanged') AND char_length(${t.idempotencyKey}) BETWEEN 1 AND 200 AND octet_length(${t.command}) <= 50000 AND jsonb_typeof(${t.command}::jsonb)='object'`,
    ),
  ],
);
export const missionApplicabilityEvents = pgTable(
  'mission_applicability_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ...scope(),
    factId: uuid('fact_id').notNull(),
    applicabilityRevision: integer('applicability_revision').notNull(),
    action: text('action').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    metadata: jsonb('metadata')
      .$type<{ applicabilityRevision: number }>()
      .notNull(),
  },
  (t) => [
    uniqueIndex('ma_events_fact_unique').on(t.factId),
    foreignKey({
      name: 'ma_events_fact_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.projectId,
        t.factId,
        t.applicabilityRevision,
      ],
      foreignColumns: [
        missionApplicabilityFacts.workspaceId,
        missionApplicabilityFacts.companyId,
        missionApplicabilityFacts.projectId,
        missionApplicabilityFacts.id,
        missionApplicabilityFacts.revision,
      ],
    }),
    check(
      'ma_events_metadata_check',
      sql`${t.metadata}=jsonb_build_object('applicabilityRevision',${t.applicabilityRevision})`,
    ),
  ],
);
