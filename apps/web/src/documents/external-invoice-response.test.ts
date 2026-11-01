import { expect, it } from 'vitest';
import { readDocument, readDocumentDetail } from './document-response';
import {
  readExternalInvoiceRecipient,
  readExternalInvoiceSources,
  readExternalInvoiceRelation,
} from './external-invoice-response';
import {
  hasExternalInvoiceAccess,
  externalInvoiceCaptureKey,
  canSelectExternalInvoiceSource,
} from './external-invoice-access';
import {
  invoiceUiActor,
  invoiceUiIds,
  invoiceUiSource,
  invoiceUiDocument,
} from './external-invoice.ui.test-fixture';

const document = {
  id: 'document',
  companyId: 'company',
  clientId: 'client',
  clientDisplayName: 'Fictional Client',
  title: 'Fictional external invoice',
  purpose: 'Preserve the original',
  type: 'external-invoice',
  confidentiality: 'company-confidential',
  createdAt: '2026-11-01T00:00:00.000Z',
  workingRevision: 1,
  correction: 'allowed',
  version: { id: 'version', status: 'draft', representation: null },
};

it('keeps independently readable invoice metadata while removing every unavailable relation fact', () => {
  const parsed = readDocument({
    ...document,
    externalInvoiceRelation: {
      access: 'denied',
      contractId: 'concealed',
      sourceDescription: 'concealed source',
      recordedRecipient: { legalName: 'concealed party' },
    },
  });
  expect(parsed).toMatchObject({
    type: 'external-invoice',
    title: 'Fictional external invoice',
    externalInvoiceRelation: { access: 'denied' },
  });
  expect(JSON.stringify(parsed)).not.toContain('concealed');
});

it('preserves PRIMARY without inventing an additional identity and refuses malformed or mixed party shapes', () => {
  const primary = {
    kind: 'PRIMARY',
    legalName: 'Fictional primary',
    taxId: null,
    legalAddress: null,
  };
  expect(readExternalInvoiceRecipient(primary)).toEqual(primary);
  for (const party of [
    { ...primary, additionalLegalEntityId: null },
    { ...primary, additionalLegalEntityId: invoiceUiIds.additionalEntity },
    { ...primary, kind: 'ADDITIONAL' },
    { ...primary, kind: 'UNKNOWN' },
    { ...primary, kind: 'ADDITIONAL', additionalLegalEntityId: 'unqualified' },
    { ...primary, taxId: undefined },
    { ...primary, legalAddress: undefined },
    { ...primary, legalName: 'bad\uD800' },
  ])
    expect(() => readExternalInvoiceRecipient(party)).toThrow();
});

it('requires the exact source page and explicit valid relation date while retaining nullable copied party fields', () => {
  expect(
    readExternalInvoiceSources({
      sources: [invoiceUiSource],
      nextCursor: null,
    }),
  ).toEqual({ sources: [invoiceUiSource], nextCursor: null });
  const relation = invoiceUiDocument.externalInvoiceRelation;
  expect(readExternalInvoiceRelation(relation)).toEqual(relation);
  for (const receivedOn of [undefined, '2026-02-29', '0000-01-01', '2026-1-01'])
    expect(() =>
      readExternalInvoiceRelation({ ...relation, receivedOn }),
    ).toThrow();
  expect(() =>
    readExternalInvoiceSources({
      sources: [invoiceUiSource, invoiceUiSource],
      nextCursor: null,
    }),
  ).toThrow();
  expect(() =>
    readExternalInvoiceSources({
      sources: [invoiceUiSource],
      nextCursor: 'arbitrary',
    }),
  ).toThrow();
  expect(() =>
    readExternalInvoiceSources({
      sources: [{ ...invoiceUiSource, contractVersionId: 'foreign' }],
      nextCursor: null,
    }),
  ).toThrow();
  expect(() =>
    readDocumentDetail({
      ...invoiceUiDocument,
      projectAssociation: { state: 'unlinked' },
    }),
  ).toThrow();
});

it('uses captured invoice authority independently and refuses duplicate, unknown and malformed captures', () => {
  const company = invoiceUiActor.activeCompany;
  expect(hasExternalInvoiceAccess(company)).toBe(true);
  expect(hasExternalInvoiceAccess(company, true)).toBe(true);
  const reader = {
    ...company,
    id: invoiceUiIds.company,
    displayName: 'Fictional Company',
    externalInvoiceGrants: [
      {
        bundle: 'company_invoice_reader',
        assignmentId: invoiceUiIds.recorder,
        permissionSetVersion: 'v1',
      },
      {
        bundle: 'company_external_invoice_access',
        assignmentId: invoiceUiIds.family,
        permissionSetVersion: 'v1',
      },
    ],
  };
  expect(hasExternalInvoiceAccess(reader)).toBe(true);
  expect(hasExternalInvoiceAccess(reader, true)).toBe(false);
  expect(externalInvoiceCaptureKey(reader)).toBe(
    externalInvoiceCaptureKey({
      ...reader,
      externalInvoiceGrants: [...reader.externalInvoiceGrants].reverse(),
    }),
  );
  for (const externalInvoiceGrants of [
    undefined,
    null,
    [],
    reader.externalInvoiceGrants.slice(0, 1),
    [
      reader.externalInvoiceGrants[0],
      reader.externalInvoiceGrants[0],
      reader.externalInvoiceGrants[1],
    ],
    [
      {
        bundle: 'company_invoice_recorder',
        assignmentId: invoiceUiIds.recorder,
        permissionSetVersion: null,
      },
      reader.externalInvoiceGrants[1],
    ],
    [
      {
        bundle: 'company_invoice_recorder',
        assignmentId: invoiceUiIds.recorder,
        permissionSetVersion: 'v2',
      },
      reader.externalInvoiceGrants[1],
    ],
    [
      {
        bundle: 'company_invoice_recorder',
        assignmentId: 'malformed',
        permissionSetVersion: 'v1',
      },
      reader.externalInvoiceGrants[1],
    ],
    [
      {
        bundle: 'company_invoice_recorder',
        assignmentId: invoiceUiIds.recorder,
        permissionSetVersion: 'v1',
        unexpected: true,
      },
      reader.externalInvoiceGrants[1],
    ],
    [
      {
        bundle: 'company_invoice_recorder',
        assignmentId: 'aaaaaaaa-0000-4000-8000-000000000001',
        permissionSetVersion: 'v1',
      },
      {
        bundle: 'company_external_invoice_access',
        assignmentId: 'AAAAAAAA-0000-4000-8000-000000000001',
        permissionSetVersion: 'v1',
      },
    ],
  ])
    expect(hasExternalInvoiceAccess({ ...reader, externalInvoiceGrants })).toBe(
      false,
    );
});

it('requires captured native source authority and retains the Workspace Client-reader and Contract Approver alternatives', () => {
  const company = invoiceUiActor.activeCompany;
  expect(canSelectExternalInvoiceSource(company)).toBe(true);
  const base = {
    ...company,
    id: invoiceUiIds.company,
    displayName: 'Fictional Company',
  };
  expect(
    canSelectExternalInvoiceSource({
      ...base,
      contractPermissionAssignmentId: undefined,
    }),
  ).toBe(false);
  expect(
    canSelectExternalInvoiceSource({
      ...base,
      contractPermissionSetVersion: undefined,
    }),
  ).toBe(false);
  expect(
    canSelectExternalInvoiceSource({
      ...base,
      commercialIntakePermissionAssignmentId: undefined,
    }),
  ).toBe(false);
  expect(
    canSelectExternalInvoiceSource({
      ...base,
      documentPermissionAssignmentId: undefined,
    }),
  ).toBe(false);
  expect(
    canSelectExternalInvoiceSource({
      ...base,
      clientPermissionAssignmentId: undefined,
    }),
  ).toBe(false);
  expect(
    canSelectExternalInvoiceSource(
      {
        ...base,
        clientPermissions: [],
        clientPermissionAssignmentId: undefined,
      },
      true,
    ),
  ).toBe(true);
  expect(
    canSelectExternalInvoiceSource({
      ...base,
      contractPermissionAssignmentId: undefined,
      contractPermissionSetVersion: undefined,
      contractApproverAssignmentId: 'captured-approver',
      contractApproverPermissionSetVersion: 'v1',
    }),
  ).toBe(true);
});
