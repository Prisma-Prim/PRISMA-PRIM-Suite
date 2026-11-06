import type { ActorContext } from '../access-types';
import {
  readProjectPdfAssociations,
  readProjectPdfVersions,
} from '../project/project-pdf-bundle-read';
import { completeActor } from '../access/current-actor.test-fixture';
import { hasDocumentFamilyAccess } from './document-family-access';
import { expect, it } from 'vitest';
import { readDocumentDetail, readDocumentVersions } from './document-response';
import { readClientDocumentItems } from './client-document-overview-response';
import {
  readReceivedAddendumMetadata,
  readReceivedAddendumRelation,
  readReceivedAddendumSources,
} from './received-addendum-response';

const parentContractId = '10000000-0000-4000-8000-000000000001';
const parentContractVersionId = '10000000-0000-4000-8000-000000000002';
const clientId = '10000000-0000-4000-8000-000000000003';
const registeredBy = {
  workspaceMembershipId: '10000000-0000-4000-8000-000000000004',
  internalUserId: '10000000-0000-4000-8000-000000000005',
};
const recipient = {
  kind: 'PRIMARY',
  legalName: 'Fictional recipient 🧪',
  taxId: null,
  legalAddress: null,
};
const source = {
  parentContractId,
  parentContractVersionId,
  contractVersionNumber: 2,
  illustrativeReference: 17,
  clientId,
  clientDisplayName: 'Fictional original Client',
  opportunityTitle: 'Fictional Opportunity',
  recordedRecipient: recipient,
};
const relation = {
  access: 'granted',
  opportunityId: '10000000-0000-4000-8000-000000000006',
  parentContractId,
  parentContractVersionId,
  contractVersionNumber: 2,
  illustrativeReference: 17,
  recordedRecipient: recipient,
  sourceDescription: 'Fictional source 🧪\n  literal spacing',
  receivedOn: null,
  registeredAt: '2026-11-06T10:00:00.000Z',
  registeredBy,
};

it('decodes exact executed-parent sources and preserves a primary recorded party without an invented entity identity', () => {
  const page = readReceivedAddendumSources({
    sources: [source],
    nextCursor: null,
  });
  expect(page.sources).toEqual([source]);
  expect(page.sources[0]?.recordedRecipient).not.toHaveProperty(
    'additionalLegalEntityId',
  );
  expect(readReceivedAddendumRelation(relation)).toEqual(relation);
});

it('discards every concealed field on an unavailable relation, including source and attribution', () => {
  expect(
    readReceivedAddendumRelation({ ...relation, access: 'denied' }),
  ).toEqual({ access: 'denied' });
  const document = readDocumentDetail({
    id: parentContractId,
    companyId: parentContractId,
    clientId,
    clientDisplayName: 'Fictional original Client',
    title: 'Fictional later source',
    purpose: 'Preserve original',
    type: 'received-addendum',
    confidentiality: 'company-confidential',
    workingRevision: 1,
    correction: 'allowed',
    version: {
      id: parentContractVersionId,
      status: 'draft',
      representation: null,
    },
    receivedAddendumRelation: { ...relation, access: 'denied' },
  });
  expect(document).toMatchObject({
    type: 'received-addendum',
    receivedAddendumRelation: { access: 'denied' },
  });
  expect(JSON.stringify(document)).not.toContain('Fictional source');
  expect(JSON.stringify(document)).not.toContain('registeredBy');
});

it('validates the exact recorded-party union and genuine native identifiers', () => {
  expect(
    readReceivedAddendumRelation({
      ...relation,
      recordedRecipient: {
        ...recipient,
        kind: 'ADDITIONAL',
        additionalLegalEntityId: clientId,
      },
    }),
  ).toMatchObject({
    recordedRecipient: {
      kind: 'ADDITIONAL',
      additionalLegalEntityId: clientId,
    },
  });
  for (const recordedRecipient of [
    { ...recipient, additionalLegalEntityId: clientId },
    { ...recipient, kind: 'ADDITIONAL' },
    { ...recipient, kind: 'ADDITIONAL', additionalLegalEntityId: 'invented' },
    { ...recipient, legalName: '\ud800' },
  ])
    expect(() =>
      readReceivedAddendumRelation({ ...relation, recordedRecipient }),
    ).toThrow();
  expect(() =>
    readReceivedAddendumRelation({
      ...relation,
      parentContractVersionId: 'latest',
    }),
  ).toThrow();
  expect(() =>
    readReceivedAddendumRelation({
      ...relation,
      registeredBy: { ...registeredBy, internalUserId: '' },
    }),
  ).toThrow();
});

it('preserves valid Unicode and inner whitespace while enforcing UTF-16 limits, NUL exclusion and Gregorian dates', () => {
  const input = {
    title: '  Титул 🧪  ',
    purpose: '  Preserve\n  spacing  ',
    sourceDescription: '  Fictional source  ',
    receivedOn: null,
  };
  expect(readReceivedAddendumMetadata(input)).toEqual({
    title: 'Титул 🧪',
    purpose: 'Preserve\n  spacing',
    sourceDescription: 'Fictional source',
    receivedOn: null,
  });
  for (const receivedOn of ['0001-01-01', '2000-02-29', '9999-12-31'])
    expect(
      readReceivedAddendumRelation({ ...relation, receivedOn }).receivedOn,
    ).toBe(receivedOn);
  for (const receivedOn of [
    '0000-01-01',
    '1900-02-29',
    '2026-02-30',
    '2026-4-01',
    '10000-01-01',
    '2026-01-01T00:00:00Z',
    '',
  ])
    expect(() =>
      readReceivedAddendumRelation({ ...relation, receivedOn }),
    ).toThrow();
  for (const title of [' ', '\0', '\ud800', '\udfff', '🧪'.repeat(101)])
    expect(() => readReceivedAddendumMetadata({ ...input, title })).toThrow();
  expect(() =>
    readReceivedAddendumMetadata({
      ...input,
      sourceDescription: 'x'.repeat(2001),
    }),
  ).toThrow();
  expect(
    readReceivedAddendumMetadata({ ...input, receivedOn: undefined })
      .receivedOn,
  ).toBeNull();
});

it('rejects malformed, duplicate, oversized or non-visible cursor pages', () => {
  expect(() =>
    readReceivedAddendumSources({
      sources: [source, source],
      nextCursor: null,
    }),
  ).toThrow();
  expect(() =>
    readReceivedAddendumSources({
      sources: [source],
      nextCursor: 'A'.repeat(48),
    }),
  ).toThrow();
  expect(() =>
    readReceivedAddendumSources({
      sources: [],
      nextCursor: 'raw-private-offset',
    }),
  ).toThrow();
  const sources = Array.from({ length: 20 }, (_, index) => ({
    ...source,
    parentContractVersionId: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  }));
  expect(
    readReceivedAddendumSources({ sources, nextCursor: 'A'.repeat(48) })
      .nextCursor,
  ).toBe('A'.repeat(48));
  expect(() =>
    readReceivedAddendumSources({
      sources: [...sources, source],
      nextCursor: null,
    }),
  ).toThrow();
});

const metadataWithoutRegistration = {
  id: parentContractId,
  companyId: parentContractId,
  clientId,
  clientDisplayName: 'Fictional original Client',
  title: 'Fictional later source',
  purpose: 'Preserve original',
  type: 'received-addendum',
  confidentiality: 'company-confidential',
  workingRevision: 1,
  correction: 'allowed',
  version: {
    id: parentContractVersionId,
    status: 'draft',
    representation: null,
  },
  receivedAddendumRelation: { access: 'denied' },
};
const initialVersionWithoutRegistration = {
  id: parentContractVersionId,
  number: 1,
  status: 'draft',
  representations: [],
  pdfContent: { state: 'absent' },
};
const versionsPage = (version: unknown) => ({
  workingRevision: 1,
  mutable: true,
  versions: [version],
});
it('keeps registration attribution out of detail and Client metadata even when a stale response supplies a mirror', () => {
  expect(readDocumentDetail(metadataWithoutRegistration)).not.toHaveProperty(
    'createdAt',
  );
  expect(
    readClientDocumentItems([metadataWithoutRegistration], parentContractId)[0],
  ).not.toHaveProperty('createdAt');
  for (const extra of [
    { createdAt: relation.registeredAt },
    { createdByMembershipId: registeredBy.workspaceMembershipId },
  ]) {
    expect(() =>
      readDocumentDetail({ ...metadataWithoutRegistration, ...extra }),
    ).toThrow();
    expect(() =>
      readClientDocumentItems(
        [{ ...metadataWithoutRegistration, ...extra }],
        parentContractId,
      ),
    ).toThrow();
  }
});
it('admits only initial Addendum registration omission and refuses held complete or partial mirrors', () => {
  const read = readDocumentVersions(
    versionsPage(initialVersionWithoutRegistration),
    'received-addendum',
  );
  expect(read.versions[0]).toMatchObject({
    number: 1,
    creationAttribution: 'registration',
  });
  expect(read.versions[0]).not.toHaveProperty('createdAt');
  expect(read.versions[0]).not.toHaveProperty('createdByDisplayName');
  for (const extra of [
    { createdAt: relation.registeredAt },
    { createdBy: { displayName: 'Secret registrar' } },
    {
      createdAt: relation.registeredAt,
      createdBy: { displayName: 'Secret registrar' },
    },
  ])
    expect(() =>
      readDocumentVersions(
        versionsPage({ ...initialVersionWithoutRegistration, ...extra }),
        'received-addendum',
      ),
    ).toThrow();
  expect(() =>
    readDocumentVersions(
      versionsPage({ ...initialVersionWithoutRegistration, number: 2 }),
      'received-addendum',
    ),
  ).toThrow();
});
it.each([
  'mission-deliverable',
  'received-contract',
  'external-invoice',
  'payment-evidence',
] as const)(
  'keeps both creation fields mandatory and exact for the existing %s protocol',
  (family) => {
    expect(() =>
      readDocumentVersions(
        versionsPage(initialVersionWithoutRegistration),
        family,
      ),
    ).toThrow();
    const version = {
      ...initialVersionWithoutRegistration,
      createdAt: relation.registeredAt,
      createdBy: { displayName: 'Native creator' },
    };
    expect(
      readDocumentVersions(versionsPage(version), family).versions[0],
    ).toMatchObject({
      createdAt: relation.registeredAt,
      createdByDisplayName: 'Native creator',
    });
    expect(
      readDocumentVersions(
        versionsPage({ ...version, number: 2 }),
        'received-addendum',
      ).versions[0],
    ).toMatchObject({
      number: 2,
      createdAt: relation.registeredAt,
      createdByDisplayName: 'Native creator',
    });
  },
);

it('never admits an Addendum Version to the independent Project PDF-bundle reader', () => {
  expect(() =>
    readProjectPdfVersions(
      versionsPage(initialVersionWithoutRegistration),
      'received-addendum',
    ),
  ).toThrow();
});

it('rejects Addendum Project association projections even with the exact independent family grant', () => {
  const actor: ActorContext = {
    ...completeActor,
    activeCompany: {
      ...completeActor.activeCompany,
      id: parentContractId,
      receivedAddendumAccessAssignmentId: registeredBy.workspaceMembershipId,
      receivedAddendumAccessPermissionSetVersion: 'v1',
      receivedAddendumClientReadCapture:
        'received-addendum-client-read.v1.' + 'a'.repeat(64),
      documentPermissions: [
        'document.read',
        'document.received_addendum.access',
      ],
    },
  };
  expect(
    hasDocumentFamilyAccess(actor.activeCompany, 'received-addendum'),
  ).toBe(true);
  expect(() =>
    readProjectPdfAssociations(
      {
        mutable: true,
        documents: [{ document: metadataWithoutRegistration, revision: 0 }],
      },
      { companyId: parentContractId, originalClientId: clientId, actor },
    ),
  ).toThrow();
});
