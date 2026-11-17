import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  foreignKey,
  check,
} from 'drizzle-orm/pg-core';
import { workspaceMemberships } from './core.js';
import { projects } from './project.js';
import { dossierAnalysisRuns } from './dossier-analysis.js';

export const HARNESS_STATES = [
  'queued',
  'running',
  'pausing',
  'paused',
  'quota',
  'reauth',
  'failed',
  'uncertain',
  'completed',
  'cancelled',
] as const;
export type HarnessState = (typeof HARNESS_STATES)[number];

export const dossierHarnessConnections = pgTable(
  'dossier_harness_connections',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    clientId: text('client_id').notNull(),
    identityKey: text('identity_key').notNull(),
    label: text('label').notNull(),
    encrypted: text('encrypted'),
    epoch: integer('epoch').notNull(),
    authRevision: integer('auth_revision').notNull().default(0),
    refreshLease: uuid('refresh_lease'),
    refreshUntil: timestamp('refresh_until', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('dossier_harness_connection_actor_unique').on(
      t.workspaceId,
      t.companyId,
      t.actorId,
    ),
    uniqueIndex('dossier_harness_connection_scope_unique').on(
      t.workspaceId,
      t.companyId,
      t.actorId,
      t.id,
    ),
    foreignKey({
      columns: [t.workspaceId, t.actorId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check('dossier_harness_connection_epoch_check', sql`${t.epoch} > 0`),
  ],
);

export const dossierHarnessAuthorizations = pgTable(
  'dossier_harness_authorizations',
  {
    stateHash: text('state_hash').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    projectId: uuid('project_id').notNull(),
    encrypted: text('encrypted').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.companyId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.companyId, projects.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.actorId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
  ],
);

export const dossierHarnessJobs = pgTable(
  'dossier_harness_jobs',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    projectId: uuid('project_id').notNull(),
    runId: uuid('run_id').notNull(),
    snapshotHash: text('snapshot_hash').notNull(),
    connectionId: uuid('connection_id').notNull(),
    connectionEpoch: integer('connection_epoch').notNull(),
    connectionIdentityKey: text('connection_identity_key').notNull(),
    model: text('model').notNull(),
    language: text('language', { enum: ['ro', 'ru', 'fr', 'en'] }).notNull(),
    pipelineVersion: text('pipeline_version').notNull(),
    state: text('state', { enum: HARNESS_STATES }).notNull(),
    nextBatch: integer('next_batch').notNull(),
    totalBatches: integer('total_batches').notNull(),
    cacheHits: integer('cache_hits').notNull(),
    checkpoint: jsonb('checkpoint').$type<unknown>().notNull(),
    lease: uuid('lease'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    commandKey: text('command_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('dossier_harness_job_command_unique').on(
      t.workspaceId,
      t.companyId,
      t.actorId,
      t.commandKey,
    ),
    foreignKey({
      columns: [t.workspaceId, t.companyId, t.projectId, t.runId],
      foreignColumns: [
        dossierAnalysisRuns.workspaceId,
        dossierAnalysisRuns.companyId,
        dossierAnalysisRuns.projectId,
        dossierAnalysisRuns.id,
      ],
    }),
    foreignKey({
      columns: [t.workspaceId, t.companyId, t.actorId, t.connectionId],
      foreignColumns: [
        dossierHarnessConnections.workspaceId,
        dossierHarnessConnections.companyId,
        dossierHarnessConnections.actorId,
        dossierHarnessConnections.id,
      ],
    }),
    check(
      'dossier_harness_job_progress_check',
      sql`${t.nextBatch} >= 0 AND ${t.totalBatches} >= ${t.nextBatch} AND ${t.cacheHits} >= 0 AND ${t.connectionEpoch} > 0`,
    ),
    check(
      'dossier_harness_job_state_check',
      sql`${t.state} IN ('queued','running','pausing','paused','quota','reauth','failed','uncertain','completed','cancelled') AND ((${t.state} IN ('running','pausing') AND ${t.lease} IS NOT NULL AND ${t.leaseUntil} IS NOT NULL) OR (${t.state} NOT IN ('running','pausing') AND ${t.lease} IS NULL AND ${t.leaseUntil} IS NULL))`,
    ),
  ],
);

/** Derived outputs only. Scoped exact-input keys are never an authorization grant. */
export const dossierHarnessCache = pgTable(
  'dossier_harness_cache',
  {
    key: text('key').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    projectId: uuid('project_id').notNull(),
    output: jsonb('output').$type<unknown>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.companyId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.companyId, projects.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.actorId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
  ],
);
