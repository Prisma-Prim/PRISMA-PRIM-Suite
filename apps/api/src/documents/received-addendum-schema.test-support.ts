import { conserveFrozenPdfPolicyUpgrade } from './frozen-pdf-policy-schema.test-support.js';
import {
  withoutWorkingEvidenceSchema,
  workingEvidenceExistingTableTriggers,
} from '../working-evidence/working-evidence-schema.test-support.js';
import { types } from 'pg';
import { expect } from 'vitest';
import {
  fixtureObjects,
  fixtureString,
} from './external-invoice-migration.test-support.js';

export const receivedAddendumExistingTableTriggers = [
  'document_correction_commands.received_addendum_correction',
  'document_representations.received_addendum_no_reference',
  'document_versions.received_addendum_version_pdf',
  'working_documents.working_documents_received_addendum_identity',
  'working_documents.working_documents_received_addendum_required',
];
const additions: Readonly<Record<string, readonly string[]>> = {
  company_role_bundle: ['company_received_addendum_access'],
  activity_log_action: [
    'company_received_addendum_access_assignment.granted',
    'company_received_addendum_access_assignment.revoked',
  ],
};
/** Remove only the exact additive 0098 literals; all predecessor definitions remain byte comparable. */
export function withoutReceivedAddendumSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  schema = withoutWorkingEvidenceSchema(schema);
  const constraints = fixtureObjects(schema.constraints).map((entry) => {
    const name = fixtureString(entry.name),
      definition = fixtureString(entry.definition);
    if (name === 'working_documents.working_documents_state_check') {
      expect(definition.match(/, 'received-addendum'::text/gu)).toHaveLength(1);
      return {
        ...entry,
        definition: definition.replace(", 'received-addendum'::text", ''),
      };
    }
    if (
      name ===
      'company_role_assignments.company_role_assignments_permission_set_version_check'
    ) {
      expect(
        definition.match(/, 'company_received_addendum_access'::text/gu),
      ).toHaveLength(2);
      return {
        ...entry,
        definition: definition.replaceAll(
          ", 'company_received_addendum_access'::text",
          '',
        ),
      };
    }
    return entry;
  });
  const enums = fixtureObjects(schema.enums).map((entry) => {
    const expected = additions[fixtureString(entry.name)];
    if (!expected) return entry;
    const oid: number = 1009,
      parsed: unknown =
        typeof entry.labels === 'string'
          ? types.getTypeParser(oid, 'text')(entry.labels)
          : entry.labels;
    if (!Array.isArray(parsed))
      throw new Error('Native enum labels are required.');
    const labels = parsed.map(fixtureString);
    expect(labels.filter((label) => expected.includes(label)).sort()).toEqual(
      [...expected].sort(),
    );
    // Catalog name[] is returned as array text by pg. Preserve its native representation.
    const prior = labels.filter((label) => !expected.includes(label));
    return {
      ...entry,
      labels:
        typeof entry.labels === 'string' ? '{' + prior.join(',') + '}' : prior,
    };
  });
  return { ...schema, constraints, enums };
}
/** Prove every old definition and ordering after the bounded additive changes. */
export function conserveReceivedAddendumSchema(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  tables: readonly string[],
) {
  const normalized = withoutReceivedAddendumSchema(
    conserveFrozenPdfPolicyUpgrade(before, after),
  );
  for (const [kind, rows] of Object.entries(before))
    for (const entry of fixtureObjects(rows))
      expect(
        fixtureObjects(normalized[kind]).find(
          (value) => value.name === entry.name,
        ),
        kind + ':' + String(entry.name),
      ).toEqual(entry);
  const prior = new Set(
    fixtureObjects(before.triggers).map((value) => value.name),
  );
  expect(
    fixtureObjects(after.triggers)
      .map((value) => fixtureString(value.name))
      .filter(
        (name) =>
          !prior.has(name) &&
          tables.some((table) => name.startsWith(table + '.')),
      )
      .sort(),
  ).toEqual(
    [
      ...receivedAddendumExistingTableTriggers,
      ...workingEvidenceExistingTableTriggers,
    ].sort(),
  );
}
