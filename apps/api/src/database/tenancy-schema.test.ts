import { is } from 'drizzle-orm';
import {
  PgTable,
  foreignKey,
  getTableConfig,
  pgTable,
  uuid,
} from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from './schema/index.js';
import {
  clientUnionOperations,
  clientUnionReversals,
  companies,
  companyRoleAssignments,
} from './schema/index.js';

// Executable form of the AGENTS.md Code Review Rule "Business table without
// `workspace_id`, or Company-owned without `company_id` and composite foreign
// keys: allows cross-Workspace references", derived from
// docs/adr/0006-workspace-tenancy-and-company-scoped-authorization.md.
// Every exemption below carries its reason, and a foreign key exemption waives
// only the scopes it names. An exemption, or a waived scope, that matches no
// current violation fails the test.
const ADR = 'ADR 0006';

type Scope = 'Workspace' | 'Company';

type ForeignKeyExemption = {
  /** The scopes whose violation this exemption waives; others still fail. */
  readonly waives:
    | readonly ['Workspace']
    | readonly ['Company']
    | readonly ['Workspace', 'Company'];
  readonly reason: string;
};

type Exemptions = {
  /** Tables without `workspace_id`: global roots only. */
  readonly globalTables: Readonly<Record<string, string>>;
  /** Tables whose rows belong to the Workspace, not to one Company. */
  readonly workspaceLevelTables: Readonly<Record<string, string>>;
  /** Foreign keys, by constraint name, that omit a parent's scope column. */
  readonly foreignKeysOmittingScope: Readonly<
    Record<string, ForeignKeyExemption>
  >;
};

const EXEMPTIONS = {
  globalTables: {
    workspaces: 'The Workspace root: the isolation boundary itself.',
    internal_users:
      'Internal Users are global; Workspace access goes through workspace_memberships (ADR 0006).',
    workspace_invitation_proofs: 'Known violation, see issue #1105.',
  },
  workspaceLevelTables: {
    workspace_memberships:
      'A Workspace Membership spans the Workspace; Company scope comes from role assignments.',
    workspace_permission_grants: 'Grants at Workspace scope by definition.',
    workspace_membership_suspension_commands:
      'Commands on a Workspace Membership.',
    workspace_invitations: 'Invitations to a Workspace Membership.',
    workspace_invitation_commands: 'Commands on a Workspace invitation.',
    workspace_invitation_acceptances:
      'Acceptance that creates a Workspace Membership.',
    companies: 'The Company root; its id is the Company scope.',
    activity_log_events:
      'Workspace evidence whose optional Company scope is target_company_id (ADR 0006).',
    client_accounts:
      'Client Account: the Workspace-level dossier shared across Companies (CONTEXT.md).',
    client_legal_entities: 'Belongs to a Workspace-level Client Account.',
    client_identifier_reservations:
      'Workspace-wide uniqueness of Client identifiers.',
    client_duplicate_reviews:
      'Workspace-level review of a Client Account proposal; the proposing Company is attempted_company_id.',
    client_duplicate_review_candidates:
      'Candidates of a Workspace-level Client duplicate review.',
    service_definitions:
      'Service Definition: Workspace-level, shared by every Company that offers it (CONTEXT.md).',
  },
  foreignKeysOmittingScope: {
    client_union_operations_review_fk: {
      waives: ['Company'],
      reason:
        'Client union is a Workspace-level operation on shared Client Accounts; each row names its own acting Company.',
    },
    client_union_reversals_operation_fk: {
      waives: ['Company'],
      reason:
        'Client union is a Workspace-level operation on shared Client Accounts; each row names its own acting Company.',
    },
    client_union_projections_operation_fk: {
      waives: ['Company'],
      reason:
        'One projection per affected Company, by design not the acting Company of the operation.',
    },
    client_duplicate_reviews_registration_command_fk: {
      waives: ['Company'],
      reason:
        'Workspace-level Client Account command; its company_id is the acting Company, kept as attempted_company_id.',
    },
    client_duplicate_reviews_correction_command_fk: {
      waives: ['Company'],
      reason:
        'Workspace-level Client Account command; its company_id is the acting Company, kept as attempted_company_id.',
    },
    workspace_invitation_proofs_invitation_id_workspace_invitations_id_fk: {
      waives: ['Workspace'],
      reason: 'Known violation, see issue #1105.',
    },
    project_lifecycle_commands_transition_fk: {
      waives: ['Company'],
      reason: 'Known violation, see issue #1105.',
    },
    commercial_intake_outcome_commands_history_fk: {
      waives: ['Company'],
      reason: 'Known violation, see issue #1105.',
    },
    mission_result_review_batches_reviewer_assignment_id_company_role_assignments_id_fk:
      {
        waives: ['Workspace', 'Company'],
        reason: 'Known violation, see issue #1105.',
      },
    mission_applicability_facts_assignment_id_company_role_assignments_id_fk: {
      waives: ['Workspace', 'Company'],
      reason: 'Known violation, see issue #1105.',
    },
    project_next_action_history_assignment_id_company_role_assignments_id_fk: {
      waives: ['Workspace', 'Company'],
      reason: 'Known violation, see issue #1105.',
    },
    project_next_action_commands_assignment_id_company_role_assignments_id_fk: {
      waives: ['Workspace', 'Company'],
      reason: 'Known violation, see issue #1105.',
    },
    internal_company_task_commands_assignment_id_company_role_assignments_id_fk:
      {
        waives: ['Workspace', 'Company'],
        reason: 'Known violation, see issue #1105.',
      },
    opportunity_follow_up_commands_assignment_id_company_role_assignments_id_fk:
      {
        waives: ['Workspace', 'Company'],
        reason: 'Known violation, see issue #1105.',
      },
    opportunity_follow_up_commands_intake_assignment_id_company_role_assignments_id_fk:
      {
        waives: ['Workspace', 'Company'],
        reason: 'Known violation, see issue #1105.',
      },
    opportunity_follow_up_history_command_id_opportunity_follow_up_commands_id_fk:
      {
        waives: ['Workspace', 'Company'],
        reason: 'Known violation, see issue #1105.',
      },
    opportunity_follow_up_events_command_id_opportunity_follow_up_commands_id_fk:
      {
        waives: ['Workspace', 'Company'],
        reason: 'Known violation, see issue #1105.',
      },
    invoice_record_commands_assignment_id_company_role_assignments_id_fk: {
      waives: ['Workspace', 'Company'],
      reason: 'Known violation, see issue #1105.',
    },
    invoice_record_history_command_id_invoice_record_commands_id_fk: {
      waives: ['Workspace', 'Company'],
      reason: 'Known violation, see issue #1105.',
    },
    invoice_record_events_command_id_invoice_record_commands_id_fk: {
      waives: ['Workspace', 'Company'],
      reason: 'Known violation, see issue #1105.',
    },
    payment_commands_assignment_id_company_role_assignments_id_fk: {
      waives: ['Workspace', 'Company'],
      reason: 'Known violation, see issue #1105.',
    },
    payment_history_command_id_payment_commands_id_fk: {
      waives: ['Workspace', 'Company'],
      reason: 'Known violation, see issue #1105.',
    },
    payment_events_command_id_payment_commands_id_fk: {
      waives: ['Workspace', 'Company'],
      reason: 'Known violation, see issue #1105.',
    },
  },
} satisfies Exemptions;

type ColumnPair = { readonly local: string; readonly parent: string };

type ScopedForeignKey = {
  readonly name: string;
  readonly parent: ScopedParent;
  readonly pairs: readonly ColumnPair[];
};

type ScopedParent = {
  readonly name: string;
  /** The parent column holding its Workspace, absent for a global parent. */
  readonly workspaceColumn: string | undefined;
  /** The parent column holding its Company, absent unless Company-owned. */
  readonly companyColumn: string | undefined;
};

type ScopedTable = {
  readonly name: string;
  readonly notNullByColumn: ReadonlyMap<string, boolean>;
  readonly foreignKeys: readonly ScopedForeignKey[];
};

function scopedParent(table: PgTable): ScopedParent {
  const { name, columns } = getTableConfig(table);
  const has = (column: string) => columns.some((c) => c.name === column);
  return {
    name,
    workspaceColumn:
      name === 'workspaces'
        ? 'id'
        : has('workspace_id')
          ? 'workspace_id'
          : undefined,
    companyColumn:
      name === 'companies'
        ? 'id'
        : has('company_id')
          ? 'company_id'
          : undefined,
  };
}

function scopedTable(table: PgTable): ScopedTable {
  const config = getTableConfig(table);
  return {
    name: config.name,
    notNullByColumn: new Map(config.columns.map((c) => [c.name, c.notNull])),
    foreignKeys: config.foreignKeys.map((foreignKey) => {
      const reference = foreignKey.reference();
      return {
        name: foreignKey.getName(),
        parent: scopedParent(reference.foreignTable),
        pairs: reference.columns.map((column, index) => {
          const parentColumn = reference.foreignColumns.at(index);
          if (parentColumn === undefined)
            throw new Error(
              `${config.name}: foreign key ${foreignKey.getName()} has more local than parent columns.`,
            );
          return { local: column.name, parent: parentColumn.name };
        }),
      };
    }),
  };
}

const maps = (foreignKey: ScopedForeignKey, { local, parent }: ColumnPair) =>
  foreignKey.pairs.some((p) => p.local === local && p.parent === parent);

type ScopeFinding = { readonly scope: Scope; readonly message: string };

function foreignKeyFindings(
  table: ScopedTable,
  foreignKey: ScopedForeignKey,
): ScopeFinding[] {
  const { parent } = foreignKey;
  const findings: ScopeFinding[] = [];
  if (
    parent.workspaceColumn !== undefined &&
    !maps(foreignKey, { local: 'workspace_id', parent: parent.workspaceColumn })
  )
    findings.push({
      scope: 'Workspace',
      message: `${table.name}: foreign key ${foreignKey.name} references ${parent.name} without mapping workspace_id to ${parent.name}.${parent.workspaceColumn}, so it can point into another Workspace (${ADR}).`,
    });
  if (
    parent.companyColumn !== undefined &&
    !foreignKey.pairs.some((p) => p.parent === parent.companyColumn)
  )
    findings.push({
      scope: 'Company',
      message: `${table.name}: foreign key ${foreignKey.name} references Company-owned ${parent.name} without its ${parent.companyColumn}, so it can point at another Company's row (${ADR}).`,
    });
  return findings;
}

/**
 * Every tenancy-rule violation in `tables` that no exemption waives, plus
 * every exemption, or waived scope, that matches no violation, as one message
 * each.
 */
function tenancyFindings(
  tables: readonly PgTable[],
  exemptions: Exemptions,
): string[] {
  const findings: string[] = [];
  const scoped = tables.map(scopedTable);
  const used = new Set<string>();
  const foreignKeyExemptions = new Map(
    Object.entries(exemptions.foreignKeysOmittingScope),
  );
  /** The waived scopes each exempted foreign key actually violates. */
  const waivedScopes = new Map<string, Set<Scope>>();

  for (const table of scoped) {
    const workspaceNotNull = table.notNullByColumn.get('workspace_id');
    if (Object.hasOwn(exemptions.globalTables, table.name)) {
      if (workspaceNotNull === undefined) used.add(table.name);
    } else if (workspaceNotNull !== true) {
      findings.push(
        `${table.name}: missing NOT NULL workspace_id; every business record carries one (${ADR}). A global root needs a reasoned entry in globalTables.`,
      );
    }

    const companyNotNull = table.notNullByColumn.get('company_id');
    if (Object.hasOwn(exemptions.workspaceLevelTables, table.name)) {
      if (companyNotNull === undefined && workspaceNotNull !== undefined)
        used.add(table.name);
    } else if (workspaceNotNull !== undefined && companyNotNull !== true) {
      findings.push(
        `${table.name}: missing NOT NULL company_id; Company-owned records carry workspace_id and company_id (${ADR}). A Workspace-level table needs a reasoned entry in workspaceLevelTables.`,
      );
    }

    if (
      companyNotNull !== undefined &&
      !table.foreignKeys.some(
        (fk) =>
          fk.parent.companyColumn !== undefined &&
          fk.parent.workspaceColumn !== undefined &&
          maps(fk, {
            local: 'workspace_id',
            parent: fk.parent.workspaceColumn,
          }) &&
          maps(fk, { local: 'company_id', parent: fk.parent.companyColumn }),
      )
    )
      findings.push(
        `${table.name}: company_id is in no composite foreign key with workspace_id to companies or a Company-owned parent, so it can name another Workspace's Company (${ADR}).`,
      );

    for (const foreignKey of table.foreignKeys) {
      const waives: readonly Scope[] =
        foreignKeyExemptions.get(foreignKey.name)?.waives ?? [];
      for (const { scope, message } of foreignKeyFindings(table, foreignKey)) {
        if (waives.includes(scope)) {
          const waived = waivedScopes.get(foreignKey.name) ?? new Set<Scope>();
          waivedScopes.set(foreignKey.name, waived.add(scope));
        } else {
          findings.push(message);
        }
      }
    }
  }

  for (const name of [
    ...Object.keys(exemptions.globalTables),
    ...Object.keys(exemptions.workspaceLevelTables),
  ])
    if (!used.has(name))
      findings.push(
        `${name}: exemption matches no current violation; remove the entry.`,
      );
  for (const [name, { waives }] of foreignKeyExemptions) {
    const waived = waivedScopes.get(name);
    if (waived === undefined)
      findings.push(
        `${name}: exemption matches no current violation; remove the entry.`,
      );
    else
      for (const scope of waives)
        if (!waived.has(scope))
          findings.push(
            `${name}: exemption waives the ${scope} scope, which the foreign key does not omit; narrow the entry.`,
          );
  }
  return findings;
}

const NO_EXEMPTIONS: Exemptions = {
  globalTables: {},
  workspaceLevelTables: {},
  foreignKeysOmittingScope: {},
};

describe('tenancy schema rule (docs/adr/0006-workspace-tenancy-and-company-scoped-authorization.md)', () => {
  it('holds for every Drizzle table, with only reasoned exemptions', () => {
    const tables = Object.values(schema).filter((value) => is(value, PgTable));
    expect(tenancyFindings(tables, EXEMPTIONS)).toEqual([]);
  });

  it('rejects a single-column reference to a Company-owned parent (the #888 pattern)', () => {
    const reviewBatches = pgTable(
      'fixture_review_batches',
      {
        workspaceId: uuid('workspace_id').notNull(),
        companyId: uuid('company_id').notNull(),
        reviewerAssignmentId: uuid('reviewer_assignment_id')
          .notNull()
          .references(() => companyRoleAssignments.id),
      },
      (t) => [
        foreignKey({
          name: 'fixture_review_batches_company_fk',
          columns: [t.workspaceId, t.companyId],
          foreignColumns: [companies.workspaceId, companies.id],
        }),
      ],
    );
    const name =
      'fixture_review_batches_reviewer_assignment_id_company_role_assignments_id_fk';

    expect(tenancyFindings([reviewBatches], NO_EXEMPTIONS)).toEqual([
      `fixture_review_batches: foreign key ${name} references company_role_assignments without mapping workspace_id to company_role_assignments.workspace_id, so it can point into another Workspace (${ADR}).`,
      `fixture_review_batches: foreign key ${name} references Company-owned company_role_assignments without its company_id, so it can point at another Company's row (${ADR}).`,
    ]);
  });

  it('rejects a table without workspace_id, without company_id, or with an unscoped company_id', () => {
    const unscoped = pgTable('fixture_unscoped', {
      id: uuid('id').primaryKey(),
    });
    const workspaceOnly = pgTable('fixture_workspace_only', {
      workspaceId: uuid('workspace_id').notNull(),
    });
    const looseCompany = pgTable('fixture_loose_company', {
      workspaceId: uuid('workspace_id').notNull(),
      companyId: uuid('company_id')
        .notNull()
        .references(() => companies.id),
    });

    expect(
      tenancyFindings([unscoped, workspaceOnly, looseCompany], NO_EXEMPTIONS),
    ).toEqual([
      `fixture_unscoped: missing NOT NULL workspace_id; every business record carries one (${ADR}). A global root needs a reasoned entry in globalTables.`,
      `fixture_workspace_only: missing NOT NULL company_id; Company-owned records carry workspace_id and company_id (${ADR}). A Workspace-level table needs a reasoned entry in workspaceLevelTables.`,
      `fixture_loose_company: company_id is in no composite foreign key with workspace_id to companies or a Company-owned parent, so it can name another Workspace's Company (${ADR}).`,
      `fixture_loose_company: foreign key fixture_loose_company_company_id_companies_id_fk references companies without mapping workspace_id to companies.workspace_id, so it can point into another Workspace (${ADR}).`,
    ]);
  });

  it('still reports the scope a foreign key exemption does not waive', () => {
    const exemptions: Exemptions = {
      ...NO_EXEMPTIONS,
      foreignKeysOmittingScope: {
        client_union_reversals_operation_fk:
          EXEMPTIONS.foreignKeysOmittingScope
            .client_union_reversals_operation_fk,
      },
    };
    const weakened = pgTable(
      'client_union_reversals',
      {
        operationId: uuid('operation_id').primaryKey(),
        workspaceId: uuid('workspace_id').notNull(),
        companyId: uuid('company_id').notNull(),
      },
      (t) => [
        foreignKey({
          name: 'client_union_reversals_operation_fk',
          columns: [t.operationId],
          foreignColumns: [clientUnionOperations.id],
        }),
        foreignKey({
          name: 'client_union_reversals_company_fk',
          columns: [t.workspaceId, t.companyId],
          foreignColumns: [companies.workspaceId, companies.id],
        }),
      ],
    );

    expect(tenancyFindings([clientUnionReversals], exemptions)).toEqual([]);
    expect(tenancyFindings([weakened], exemptions)).toEqual([
      `client_union_reversals: foreign key client_union_reversals_operation_fk references client_union_operations without mapping workspace_id to client_union_operations.workspace_id, so it can point into another Workspace (${ADR}).`,
    ]);
  });

  it('accepts composite keys and flags an exemption that no longer applies', () => {
    const scopedChild = pgTable(
      'fixture_scoped_child',
      {
        workspaceId: uuid('workspace_id').notNull(),
        companyId: uuid('company_id').notNull(),
        assignmentId: uuid('assignment_id').notNull(),
      },
      (t) => [
        foreignKey({
          name: 'fixture_scoped_child_assignment_fk',
          columns: [t.workspaceId, t.companyId, t.assignmentId],
          foreignColumns: [
            companyRoleAssignments.workspaceId,
            companyRoleAssignments.companyId,
            companyRoleAssignments.id,
          ],
        }),
      ],
    );

    expect(tenancyFindings([scopedChild], NO_EXEMPTIONS)).toEqual([]);
    expect(
      tenancyFindings([scopedChild], {
        ...NO_EXEMPTIONS,
        foreignKeysOmittingScope: {
          fixture_scoped_child_assignment_fk: {
            waives: ['Workspace', 'Company'],
            reason: 'Fixed since.',
          },
        },
      }),
    ).toEqual([
      'fixture_scoped_child_assignment_fk: exemption matches no current violation; remove the entry.',
    ]);
  });

  it('flags a waived scope that the foreign key does not omit', () => {
    expect(
      tenancyFindings([clientUnionReversals], {
        ...NO_EXEMPTIONS,
        foreignKeysOmittingScope: {
          client_union_reversals_operation_fk: {
            waives: ['Workspace', 'Company'],
            reason: 'Wider than the omitted scope.',
          },
        },
      }),
    ).toEqual([
      'client_union_reversals_operation_fk: exemption waives the Workspace scope, which the foreign key does not omit; narrow the entry.',
    ]);
  });
});
