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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  clientAccountCorrectionCommands,
  clientAccountRegistrationCommands,
  clientAccounts,
  clientCompanyRelationships,
  companies,
  workspaceMemberships,
} from './core.js';

type ClientDuplicateReviewProposedFields = {
  displayName: string;
  taxId: string | null;
  address: string | null;
  telephone: string | null;
  generalEmail: string | null;
  contacts: Array<{ name: string; telephone?: string; email?: string }>;
  businessActivity: string | null;
};

export const clientDuplicateReviews = pgTable(
  'client_duplicate_reviews',
  {
    reference: uuid('reference').defaultRandom().primaryKey(),
    paginationCursor: uuid('pagination_cursor').defaultRandom().notNull(),
    workspaceId: uuid('workspace_id').notNull(),
    proposalKind: text('proposal_kind').notNull(),
    proposalActorWorkspaceMembershipId: uuid(
      'proposal_actor_workspace_membership_id',
    ).notNull(),
    attemptedCompanyId: uuid('attempted_company_id').notNull(),
    registrationCommandId: uuid('registration_command_id'),
    correctionCommandId: uuid('correction_command_id'),
    proposalClientAccountId: uuid('proposal_client_account_id'),
    proposalVersion: integer('proposal_version'),
    normalizedIdentifier: text('normalized_identifier').notNull(),
    proposedFields: jsonb('proposed_fields')
      .$type<ClientDuplicateReviewProposedFields>()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('client_duplicate_reviews_pagination_cursor_unique').on(
      table.paginationCursor,
    ),
    index('client_duplicate_reviews_list_lookup').on(
      table.workspaceId,
      table.attemptedCompanyId,
      table.createdAt,
      table.reference,
    ),
    uniqueIndex('client_duplicate_reviews_workspace_reference_unique').on(
      table.workspaceId,
      table.reference,
    ),
    uniqueIndex('client_duplicate_reviews_registration_command_unique').on(
      table.workspaceId,
      table.registrationCommandId,
    ),
    uniqueIndex('client_duplicate_reviews_correction_command_unique').on(
      table.workspaceId,
      table.correctionCommandId,
    ),
    foreignKey({
      name: 'client_duplicate_reviews_actor_fk',
      columns: [table.workspaceId, table.proposalActorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'client_duplicate_reviews_attempted_company_fk',
      columns: [table.workspaceId, table.attemptedCompanyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'client_duplicate_reviews_registration_command_fk',
      columns: [
        table.workspaceId,
        table.proposalActorWorkspaceMembershipId,
        table.registrationCommandId,
      ],
      foreignColumns: [
        clientAccountRegistrationCommands.workspaceId,
        clientAccountRegistrationCommands.actorWorkspaceMembershipId,
        clientAccountRegistrationCommands.id,
      ],
    }),
    foreignKey({
      name: 'client_duplicate_reviews_correction_command_fk',
      columns: [
        table.workspaceId,
        table.proposalActorWorkspaceMembershipId,
        table.correctionCommandId,
      ],
      foreignColumns: [
        clientAccountCorrectionCommands.workspaceId,
        clientAccountCorrectionCommands.actorWorkspaceMembershipId,
        clientAccountCorrectionCommands.id,
      ],
    }),
    foreignKey({
      name: 'client_duplicate_reviews_proposal_client_fk',
      columns: [table.workspaceId, table.proposalClientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    check(
      'client_duplicate_reviews_source_shape_check',
      sql`(
        (${table.proposalKind} = 'registration'
          AND ${table.registrationCommandId} IS NOT NULL
          AND ${table.correctionCommandId} IS NULL
          AND ${table.proposalClientAccountId} IS NULL
          AND ${table.proposalVersion} IS NULL)
        OR
        (${table.proposalKind} = 'correction'
          AND ${table.registrationCommandId} IS NULL
          AND ${table.correctionCommandId} IS NOT NULL
          AND ${table.proposalClientAccountId} IS NOT NULL
          AND ${table.proposalVersion} > 0)
      )`,
    ),
    check(
      'client_duplicate_reviews_identifier_not_blank_check',
      sql`length(${table.normalizedIdentifier}) > 0
        AND ${table.normalizedIdentifier} = btrim(${table.normalizedIdentifier})`,
    ),
  ],
);

export const clientDuplicateReviewCandidates = pgTable(
  'client_duplicate_review_candidates',
  {
    workspaceId: uuid('workspace_id').notNull(),
    reviewReference: uuid('review_reference').notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    capturedVersion: integer('captured_version').notNull(),
  },
  (table) => [
    uniqueIndex('client_duplicate_review_candidates_identity_unique').on(
      table.workspaceId,
      table.reviewReference,
      table.clientAccountId,
    ),
    foreignKey({
      name: 'client_duplicate_review_candidates_review_fk',
      columns: [table.workspaceId, table.reviewReference],
      foreignColumns: [
        clientDuplicateReviews.workspaceId,
        clientDuplicateReviews.reference,
      ],
    }),
    foreignKey({
      name: 'client_duplicate_review_candidates_client_fk',
      columns: [table.workspaceId, table.clientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    check(
      'client_duplicate_review_candidates_positive_version_check',
      sql`${table.capturedVersion} > 0`,
    ),
  ],
);

export const clientDuplicateReviewRelationshipSnapshots = pgTable(
  'client_duplicate_review_relationship_snapshots',
  {
    workspaceId: uuid('workspace_id').notNull(),
    reviewReference: uuid('review_reference').notNull(),
    participantKind: text('participant_kind').notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    companyId: uuid('company_id').notNull(),
    relationshipId: uuid('relationship_id').notNull(),
  },
  (table) => [
    uniqueIndex('client_duplicate_review_relationships_identity_unique').on(
      table.workspaceId,
      table.reviewReference,
      table.relationshipId,
    ),
    foreignKey({
      name: 'client_duplicate_review_relationships_review_fk',
      columns: [table.workspaceId, table.reviewReference],
      foreignColumns: [
        clientDuplicateReviews.workspaceId,
        clientDuplicateReviews.reference,
      ],
    }),
    foreignKey({
      name: 'client_duplicate_review_relationships_relationship_fk',
      columns: [
        table.workspaceId,
        table.clientAccountId,
        table.companyId,
        table.relationshipId,
      ],
      foreignColumns: [
        clientCompanyRelationships.workspaceId,
        clientCompanyRelationships.clientAccountId,
        clientCompanyRelationships.companyId,
        clientCompanyRelationships.id,
      ],
    }),
    check(
      'client_duplicate_review_relationships_participant_kind_check',
      sql`${table.participantKind} IN ('candidate', 'proposal')`,
    ),
  ],
);
