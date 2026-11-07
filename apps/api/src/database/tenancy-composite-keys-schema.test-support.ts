import { expect } from 'vitest';
import {
  fixtureObjects,
  fixtureString,
} from '../documents/external-invoice-migration.test-support.js';

/** A key the tenancy_composite_keys migration widened with its scope (#1105). */
type WidenedKey = { readonly before: string; readonly after: string };

const SCOPE = ['workspace_id', 'company_id'];

const list = (columns: readonly string[]) => columns.join(', ');
const without = (columns: readonly string[], added: readonly string[]) =>
  columns.filter((column) => !added.includes(column));
/** PostgreSQL stores the first 63 bytes of an identifier. */
const stored = (name: string) => name.slice(0, 63);

function foreignKey(key: {
  readonly table: string;
  readonly name: string;
  readonly columns: readonly string[];
  readonly parent: string;
  readonly parentColumns: readonly string[];
  readonly added: readonly string[];
}): [string, WidenedKey] {
  const definition = (
    columns: readonly string[],
    parentColumns: readonly string[],
  ) =>
    `FOREIGN KEY (${list(columns)}) REFERENCES ${key.parent}(${list(parentColumns)})`;
  return [
    key.table + '.' + stored(key.name),
    {
      before: definition(
        without(key.columns, key.added),
        without(key.parentColumns, key.added),
      ),
      after: definition(key.columns, key.parentColumns),
    },
  ];
}

/** A single-column reference the migration scoped with workspace_id and company_id. */
const companyScoped = (table: string, column: string, parent: string) =>
  foreignKey({
    table,
    name: `${table}_${column}_${parent}_id_fk`,
    columns: [...SCOPE, column],
    parent,
    parentColumns: [...SCOPE, 'id'],
    added: SCOPE,
  });

const COMPANY = ['company_id'];
const TRANSITION_KEY = [...SCOPE, 'project_id', 'lifecycle_revision'];
const OUTCOME_KEY = [...SCOPE, 'opportunity_id', 'opportunity_version'];
/** Unique keys the migration widened with company_id, each with its index. */
const UNIQUE_KEYS = [
  {
    table: 'project_lifecycle_transitions',
    name: 'project_lifecycle_transitions_revision_unique',
    columns: TRANSITION_KEY,
  },
  {
    table: 'opportunity_outcome_history',
    name: 'opportunity_outcome_history_version_unique',
    columns: OUTCOME_KEY,
  },
];

const WIDENED: Readonly<Record<string, ReadonlyMap<string, WidenedKey>>> = {
  constraints: new Map([
    companyScoped(
      'mission_result_review_batches',
      'reviewer_assignment_id',
      'company_role_assignments',
    ),
    companyScoped(
      'mission_applicability_facts',
      'assignment_id',
      'company_role_assignments',
    ),
    companyScoped(
      'project_next_action_commands',
      'assignment_id',
      'company_role_assignments',
    ),
    companyScoped(
      'project_next_action_history',
      'assignment_id',
      'company_role_assignments',
    ),
    companyScoped(
      'internal_company_task_commands',
      'assignment_id',
      'company_role_assignments',
    ),
    companyScoped(
      'opportunity_follow_up_commands',
      'assignment_id',
      'company_role_assignments',
    ),
    companyScoped(
      'opportunity_follow_up_commands',
      'intake_assignment_id',
      'company_role_assignments',
    ),
    companyScoped(
      'opportunity_follow_up_history',
      'command_id',
      'opportunity_follow_up_commands',
    ),
    companyScoped(
      'opportunity_follow_up_events',
      'command_id',
      'opportunity_follow_up_commands',
    ),
    companyScoped(
      'invoice_record_commands',
      'assignment_id',
      'company_role_assignments',
    ),
    companyScoped(
      'invoice_record_history',
      'command_id',
      'invoice_record_commands',
    ),
    companyScoped(
      'invoice_record_events',
      'command_id',
      'invoice_record_commands',
    ),
    companyScoped(
      'payment_commands',
      'assignment_id',
      'company_role_assignments',
    ),
    companyScoped('payment_history', 'command_id', 'payment_commands'),
    companyScoped('payment_events', 'command_id', 'payment_commands'),
    foreignKey({
      table: 'workspace_invitation_proofs',
      name: 'workspace_invitation_proofs_invitation_id_workspace_invitations_id_fk',
      columns: ['workspace_id', 'invitation_id'],
      parent: 'workspace_invitations',
      parentColumns: ['workspace_id', 'id'],
      added: ['workspace_id'],
    }),
    foreignKey({
      table: 'project_lifecycle_commands',
      name: 'project_lifecycle_commands_transition_fk',
      columns: [...SCOPE, 'project_id', 'result_revision'],
      parent: 'project_lifecycle_transitions',
      parentColumns: TRANSITION_KEY,
      added: COMPANY,
    }),
    foreignKey({
      table: 'commercial_intake_outcome_commands',
      name: 'commercial_intake_outcome_commands_history_fk',
      columns: [...SCOPE, 'opportunity_id', 'result_version'],
      parent: 'opportunity_outcome_history',
      parentColumns: OUTCOME_KEY,
      added: COMPANY,
    }),
    ...UNIQUE_KEYS.map(({ table, name, columns }): [string, WidenedKey] => [
      table + '.' + name,
      {
        before: `UNIQUE (${list(without(columns, COMPANY))})`,
        after: `UNIQUE (${list(columns)})`,
      },
    ]),
  ]),
  indexes: new Map(
    UNIQUE_KEYS.map(({ table, name, columns }): [string, WidenedKey] => {
      const index = (indexed: readonly string[]) =>
        `CREATE UNIQUE INDEX ${name} ON public.${table} USING btree (${list(indexed)})`;
      return [
        table + '.' + name,
        { before: index(without(columns, COMPANY)), after: index(columns) },
      ];
    }),
  ),
};

/**
 * Restore the exact predecessor definitions of the keys the
 * tenancy_composite_keys migration widened with their scope (#1105); every
 * other definition stays byte comparable.
 */
export function withoutTenancyCompositeKeysSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const restored: Record<string, unknown> = { ...schema };
  for (const [kind, widened] of Object.entries(WIDENED)) {
    const entries = fixtureObjects(schema[kind]);
    expect(
      entries
        .map((entry) => fixtureString(entry.name))
        .filter((name) => widened.has(name))
        .sort(),
    ).toEqual([...widened.keys()].sort());
    restored[kind] = entries.map((entry) => {
      const key = widened.get(fixtureString(entry.name));
      if (!key) return entry;
      expect(entry.definition, fixtureString(entry.name)).toBe(key.after);
      return { ...entry, definition: key.before };
    });
  }
  return restored;
}
