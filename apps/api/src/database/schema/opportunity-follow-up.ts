import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
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
import { opportunities } from './commercial-intake.js';

function scope() {
  return {
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
  };
}
export const opportunityFollowUpCommands = pgTable(
  'opportunity_follow_up_commands',
  {
    ...scope(),
    id: uuid('id').defaultRandom().primaryKey(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => companyRoleAssignments.id),
    intakeAssignmentId: uuid('intake_assignment_id')
      .notNull()
      .references(() => companyRoleAssignments.id),
    idempotencyKey: text('idempotency_key').notNull(),
    intent: jsonb('intent').$type<unknown>().notNull(),
    revision: bigint('revision', { mode: 'number' }).notNull().default(0),
    outcome: text('outcome').notNull().default('pending'),
    response: jsonb('response')
      .$type<unknown>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('ofup_command_actor_key').on(
      t.workspaceId,
      t.companyId,
      t.actorMembershipId,
      t.idempotencyKey,
    ),
    uniqueIndex('ofup_command_material_revision')
      .on(t.workspaceId, t.companyId, t.opportunityId, t.revision)
      .where(sql`${t.outcome}='updated'`),
    foreignKey({
      name: 'ofup_command_target_fk',
      columns: [t.workspaceId, t.companyId, t.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.companyId,
        opportunities.id,
      ],
    }),
    foreignKey({
      name: 'ofup_command_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'ofup_command_check',
      sql`${t.revision}>0 AND ${t.revision}<=9007199254740991 AND ${t.outcome} IN ('updated','unchanged') AND ofup_receipt_valid(${t.response}) AND length(${t.idempotencyKey})>0`,
    ),
  ],
);
export const opportunityFollowUpHeads = pgTable(
  'opportunity_follow_up_heads',
  {
    ...scope(),
    revision: bigint('revision', { mode: 'number' }).notNull(),
    followUpOn: text('follow_up_on'),
    confirmedEpoch: text('confirmed_epoch').notNull(),
    fact: jsonb('fact').$type<unknown>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.companyId, t.opportunityId] }),
    unique('ofup_head_opportunity_unique').on(t.opportunityId),
    foreignKey({
      name: 'ofup_head_target_fk',
      columns: [t.workspaceId, t.companyId, t.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.companyId,
        opportunities.id,
      ],
    }),
    check(
      'ofup_head_fact_check',
      sql`ofup_fact_valid(${t.fact},false) AND (${t.fact}->>'revision')::bigint=${t.revision} AND (${t.fact}->>'followUpOn') IS NOT DISTINCT FROM ${t.followUpOn} AND ${t.fact}->>'confirmedEpoch'=${t.confirmedEpoch}`,
    ),
    index('ofup_discovery_idx').on(
      t.workspaceId,
      t.companyId,
      t.followUpOn,
      t.opportunityId,
    ),
  ],
);
export const opportunityFollowUpHistory = pgTable(
  'opportunity_follow_up_history',
  {
    ...scope(),
    revision: bigint('revision', { mode: 'number' }).notNull(),
    commandId: uuid('command_id')
      .notNull()
      .references(() => opportunityFollowUpCommands.id),
    fact: jsonb('fact').$type<unknown>().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.workspaceId, t.companyId, t.opportunityId, t.revision],
    }),
    unique('ofup_history_command_unique').on(t.commandId),
    foreignKey({
      name: 'ofup_history_target_fk',
      columns: [t.workspaceId, t.companyId, t.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.companyId,
        opportunities.id,
      ],
    }),
    check(
      'ofup_history_check',
      sql`ofup_history_valid(${t.fact}) AND ${t.fact}->>'opportunityId'=${t.opportunityId}::text AND (${t.fact}->>'revision')::bigint=${t.revision} AND ${t.fact}->>'commandId'=${t.commandId}::text`,
    ),
  ],
);
export const opportunityFollowUpEvents = pgTable(
  'opportunity_follow_up_events',
  {
    ...scope(),
    revision: bigint('revision', { mode: 'number' }).notNull(),
    commandId: uuid('command_id')
      .notNull()
      .references(() => opportunityFollowUpCommands.id),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    action: text('action').notNull(),
    metadata: jsonb('metadata').$type<unknown>().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.workspaceId, t.companyId, t.opportunityId, t.revision],
    }),
    unique('ofup_event_command_unique').on(t.commandId),
    foreignKey({
      name: 'ofup_event_history_fk',
      columns: [t.workspaceId, t.companyId, t.opportunityId, t.revision],
      foreignColumns: [
        opportunityFollowUpHistory.workspaceId,
        opportunityFollowUpHistory.companyId,
        opportunityFollowUpHistory.opportunityId,
        opportunityFollowUpHistory.revision,
      ],
    }),
    foreignKey({
      name: 'ofup_event_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'ofup_event_check',
      sql`${t.action}='opportunity.follow_up.updated' AND ${t.metadata}=jsonb_build_object('revision',${t.revision})`,
    ),
  ],
);
// Technical per-Company signing material: generated only by the native command
// path, never returned or logged. Cursors remain bound across process restarts.
export const opportunityFollowUpCursorKeys = pgTable(
  'opportunity_follow_up_cursor_keys',
  {
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    key: text('key')
      .notNull()
      .default(sql`gen_random_uuid()::text || gen_random_uuid()::text`),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.companyId] }),
    foreignKey({
      name: 'ofup_cursor_company_fk',
      columns: [t.workspaceId, t.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
  ],
);
