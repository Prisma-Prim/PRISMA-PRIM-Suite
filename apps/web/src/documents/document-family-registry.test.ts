import { describe, expect, expectTypeOf, it } from 'vitest';
import type { DocumentFamily } from './document-response';
import {
  DOCUMENT_FAMILY_SCREENS,
  WORKSPACE_FAMILIES,
  type DocumentFamilyScreen,
  type FamiliesWith,
  type WorkspaceFamily,
} from './document-family-registry';

// Read as text so the guard sees the screen source exactly as committed.
const workspaceSources = import.meta.glob('./DocumentWorkspace.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const ALL_FAMILIES = [
  'questionnaire',
  'mission-deliverable',
  'received-contract',
  'received-audit-source',
  'received-addendum',
  'external-invoice',
  'payment-evidence',
] as const satisfies readonly DocumentFamily[];

describe('Documents screen family registry', () => {
  it('has one entry for every workspace family, in selector order', () => {
    expect(WORKSPACE_FAMILIES).toEqual([
      'questionnaire',
      'received-audit-source',
      'mission-deliverable',
      'external-invoice',
      'received-addendum',
      'received-contract',
    ]);
    expect([...WORKSPACE_FAMILIES].sort()).toEqual(
      ALL_FAMILIES.filter((type) => type !== 'payment-evidence').sort(),
    );
    expectTypeOf<keyof typeof DOCUMENT_FAMILY_SCREENS>().toEqualTypeOf<
      Exclude<DocumentFamily, 'payment-evidence'>
    >();
    expectTypeOf<
      (typeof ALL_FAMILIES)[number]
    >().toEqualTypeOf<DocumentFamily>();
  });

  it('refuses at type level a registry missing a family', () => {
    const withoutQuestionnaire = {
      'received-audit-source': DOCUMENT_FAMILY_SCREENS['received-audit-source'],
      'mission-deliverable': DOCUMENT_FAMILY_SCREENS['mission-deliverable'],
      'external-invoice': DOCUMENT_FAMILY_SCREENS['external-invoice'],
      'received-addendum': DOCUMENT_FAMILY_SCREENS['received-addendum'],
      'received-contract': DOCUMENT_FAMILY_SCREENS['received-contract'],
    };
    // @ts-expect-error Every workspace family needs a screen entry.
    const incomplete: Record<WorkspaceFamily, DocumentFamilyScreen> =
      withoutQuestionnaire;
    expect(Object.keys(incomplete)).not.toContain('questionnaire');
  });

  it('shows the Project association for the families the API links', () => {
    expectTypeOf<FamiliesWith<'projectLinkable'>>().toEqualTypeOf<
      'questionnaire' | 'mission-deliverable' | 'received-contract'
    >();
    expectTypeOf<
      FamiliesWith<'financial'>
    >().toEqualTypeOf<'external-invoice'>();
  });

  it('keeps every family name out of the Documents workspace screen', () => {
    const source = workspaceSources['./DocumentWorkspace.tsx'];
    if (typeof source !== 'string')
      throw new Error('DocumentWorkspace.tsx could not be read.');
    const literals = ALL_FAMILIES.filter(
      (type) => source.includes(`'${type}'`) || source.includes(`"${type}"`),
    );
    expect(literals).toEqual([]);
  });
});
