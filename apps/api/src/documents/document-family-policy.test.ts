import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { workingDocuments } from '../database/schema/index.js';
import {
  DOCUMENT_FAMILY_POLICY,
  isNativeAccessFamily,
  isProjectLinkable,
  requiresNativeFamilyAccess,
  type DocumentFamilyAccessDecisions,
  type DocumentFamilyAction,
  type DocumentType,
  type NativeAccessDocumentType,
  type ProjectLinkableDocumentType,
} from './document-family-policy.js';

const ACTIONS = [
  'read',
  'content-read',
  'upload',
  'version',
  'designate',
  'correct',
] as const satisfies readonly DocumentFamilyAction[];

describe('Document family policy', () => {
  it('decides every persisted Document family and no other', () => {
    expect(Object.keys(DOCUMENT_FAMILY_POLICY).sort()).toEqual(
      [...workingDocuments.type.enumValues].sort(),
    );
  });

  it('decides exactly the families the working_documents CHECK admits', () => {
    const check = getTableConfig(workingDocuments).checks.find(
      ({ name }) => name === 'working_documents_state_check',
    );
    if (check === undefined) throw new Error('The family CHECK is missing.');
    const { sql } = new PgDialect().sqlToQuery(check.value);
    const admitted = /"type" IN \(([^)]*)\)/u.exec(sql)?.[1];
    if (admitted === undefined)
      throw new Error('The family CHECK no longer lists admitted types.');
    expect(
      [...admitted.matchAll(/'([^']+)'/gu)].map(([, type]) => type).sort(),
    ).toEqual(Object.keys(DOCUMENT_FAMILY_POLICY).sort());
  });

  it('links only questionnaires, mission deliverables and received contracts to Projects', () => {
    expect(
      workingDocuments.type.enumValues.filter((type) =>
        isProjectLinkable(type),
      ),
    ).toEqual(['questionnaire', 'mission-deliverable', 'received-contract']);
    expectTypeOf<ProjectLinkableDocumentType>().toEqualTypeOf<
      'questionnaire' | 'mission-deliverable' | 'received-contract'
    >();
  });

  it('requires the family native grant for every action of the four natively granted families only', () => {
    const native = [
      'received-addendum',
      'received-audit-source',
      'external-invoice',
      'payment-evidence',
    ];
    expect(
      workingDocuments.type.enumValues
        .filter((type) => isNativeAccessFamily(type))
        .sort(),
    ).toEqual([...native].sort());
    for (const type of workingDocuments.type.enumValues)
      for (const action of ACTIONS)
        expect(
          requiresNativeFamilyAccess(type, action),
          `${type} ${action}`,
        ).toBe(native.includes(type));
    expectTypeOf<NativeAccessDocumentType>().toEqualTypeOf<
      | 'received-addendum'
      | 'received-audit-source'
      | 'external-invoice'
      | 'payment-evidence'
    >();
    expectTypeOf<DocumentFamilyAction>().toEqualTypeOf<
      (typeof ACTIONS)[number]
    >();
  });

  it('refuses at type level a family without a decision for one of its actions', () => {
    const withoutUpload = {
      read: 'native',
      'content-read': 'native',
      version: 'native',
      designate: 'native',
      correct: 'native',
    } as const;
    // @ts-expect-error A family must decide upload like every other action.
    const incomplete: DocumentFamilyAccessDecisions = withoutUpload;
    expect(incomplete).toBe(withoutUpload);
  });

  it('names a Document family exactly as the persisted column does', () => {
    expectTypeOf<DocumentType>().toEqualTypeOf<
      (typeof workingDocuments.$inferSelect)['type']
    >();
  });
});
