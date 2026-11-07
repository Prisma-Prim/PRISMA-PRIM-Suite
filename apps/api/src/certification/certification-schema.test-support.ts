import { types } from 'pg';
import { expect } from 'vitest';
import { withoutTenancyCompositeKeysSchema } from '../database/tenancy-composite-keys-schema.test-support.js';
import {
  fixtureObjects,
  fixtureString,
} from '../documents/external-invoice-migration.test-support.js';

/** Tables added by the certification migrations, in PostgreSQL name order. */
export const certificationTables = [
  'certification_case_documents',
  'certification_cases',
  'certification_events',
  'certification_finding_records',
  'certification_findings',
  'certification_receipts',
  'certification_step_versions',
];
const roles = [
  'company_certification_reader',
  'company_certification_programme_manager',
  'company_certification_approver',
  'company_certification_auditor',
];
const additions: Readonly<Record<string, readonly string[]>> = {
  company_role_bundle: roles,
  activity_log_action: roles.flatMap((role) => [
    role + '_assignment.granted',
    role + '_assignment.revoked',
  ]),
};

/** Remove only the closed additive certification literals; preserve every predecessor definition and enum order. */
export function withoutCertificationSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  // Later migrations are removed first, newest to oldest.
  schema = withoutTenancyCompositeKeysSchema(schema);
  const constraints = fixtureObjects(schema.constraints).map((entry) => {
    const name = fixtureString(entry.name);
    let definition = fixtureString(entry.definition);
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
