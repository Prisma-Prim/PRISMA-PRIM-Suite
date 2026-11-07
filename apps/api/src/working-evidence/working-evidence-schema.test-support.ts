import { types } from 'pg';
import { expect } from 'vitest';
import { withoutCertificationSchema } from '../certification/certification-schema.test-support.js';
import {
  fixtureObjects,
  fixtureString,
} from '../documents/external-invoice-migration.test-support.js';

export const workingEvidenceTables = [
  'received_audit_source_registrations',
  'working_evidence_cases',
  'working_evidence_events',
  'working_evidence_outputs',
  'working_evidence_receipts',
  'working_evidence_revisions',
  'working_evidence_supports',
];
export const workingEvidenceExistingTableTriggers = [
  'document_correction_commands.received_audit_source_correction',
  'document_representations.received_audit_source_no_reference',
  'document_versions.received_audit_source_designation',
  'working_documents.received_audit_source_document_presence',
  'working_documents.received_audit_source_native_identity',
];
const roles = [
  'company_working_evidence_case_reader',
  'company_working_evidence_case_recorder',
  'company_received_audit_source_access',
];
const additions: Readonly<Record<string, readonly string[]>> = {
  company_role_bundle: roles,
  activity_log_action: roles.flatMap((role) => [
    role + '_assignment.granted',
    role + '_assignment.revoked',
  ]),
};

/** Remove only the closed additive0099 literals; preserve every predecessor definition and enum order. */
export function withoutWorkingEvidenceSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  // Later additive migrations are removed first, newest to oldest.
  schema = withoutCertificationSchema(schema);
  const constraints = fixtureObjects(schema.constraints).map((entry) => {
    const name = fixtureString(entry.name);
    let definition = fixtureString(entry.definition);
    if (name === 'working_documents.working_documents_state_check') {
      const literal = ", 'received-audit-source'::text";
      expect(definition.split(literal)).toHaveLength(2);
      definition = definition.replace(literal, '');
    }
    if (
      name ===
      'company_role_assignments.company_role_assignments_permission_set_version_check'
    )
      for (const role of roles) {
        const literal = ", '" + role + "'::text";
        expect(definition.split(literal)).toHaveLength(3);
        definition = definition.replaceAll(literal, '');
      }
    return { ...entry, definition };
  });
  const enums = fixtureObjects(schema.enums).map((entry) => {
    const expected = additions[fixtureString(entry.name)];
    if (!expected) return entry;
    const oid: number = 1009;
    const parsed: unknown =
      typeof entry.labels === 'string'
        ? types.getTypeParser(oid, 'text')(entry.labels)
        : entry.labels;
    if (!Array.isArray(parsed))
      throw new Error('Exact native enum labels required.');
    const labels = parsed.map(fixtureString);
    expect(labels.filter((label) => expected.includes(label)).sort()).toEqual(
      [...expected].sort(),
    );
    const prior = labels.filter((label) => !expected.includes(label));
    return {
      ...entry,
      labels:
        typeof entry.labels === 'string' ? '{' + prior.join(',') + '}' : prior,
    };
  });
  return { ...schema, constraints, enums };
}

export function conserveWorkingEvidenceSchema(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  tables: readonly string[],
) {
  const normalized = withoutWorkingEvidenceSchema(after);
  for (const [kind, rows] of Object.entries(before))
    for (const entry of fixtureObjects(rows))
      expect(
        fixtureObjects(normalized[kind]).find(
          (value) => value.name === entry.name,
        ),
        kind + ':' + String(entry.name),
      ).toEqual(entry);
  const previous = new Set(
    fixtureObjects(before.triggers).map((entry) => entry.name),
  );
  expect(
    fixtureObjects(after.triggers)
      .map((entry) => fixtureString(entry.name))
      .filter(
        (name) =>
          !previous.has(name) &&
          tables.some((table) => name.startsWith(table + '.')),
      )
      .sort(),
  ).toEqual([...workingEvidenceExistingTableTriggers].sort());
}
