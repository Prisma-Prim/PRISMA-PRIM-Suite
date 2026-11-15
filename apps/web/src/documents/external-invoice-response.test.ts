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
import {
  withCompanyGrants,
  withoutCompanyGrants,
} from '../access/company-grants.test-fixture';
import { readCurrentActor } from '../access/current-actor';
import type { CompanyGrantBundle } from '../access/company-grants';

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

const read = (activeCompany: unknown) =>
  readCurrentActor({
    api: {
      request: async () => ({
        status: 'ok',
        value: { ...invoiceUiActor, activeCompany },
      }),
    },
  });

it('uses captured invoice authority independently and refuses duplicate, unknown and malformed captures', async () => {
  const company = invoiceUiActor.activeCompany;
  expect(hasExternalInvoiceAccess(company)).toBe(true);
  expect(hasExternalInvoiceAccess(company, true)).toBe(true);
  const reader = {
    ...company,
    id: invoiceUiIds.company,
    displayName: 'Fictional Company',
    grants: withCompanyGrants(
      withoutCompanyGrants(company?.grants, 'company_invoice_recorder'),
      {
        bundle: 'company_invoice_reader',
        version: 'v1',
        assignmentId: invoiceUiIds.recorder,
      },
    ),
  };
  const family = reader.grants.find(
    (grant) => grant.bundle === 'company_external_invoice_access',
  );
  const financial = reader.grants.find(
    (grant) => grant.bundle === 'company_invoice_reader',
  );
  expect(hasExternalInvoiceAccess(reader)).toBe(true);
  expect(hasExternalInvoiceAccess(reader, true)).toBe(false);
  expect(externalInvoiceCaptureKey(reader)).toBe(
    externalInvoiceCaptureKey({
      ...reader,
      grants: [...reader.grants].reverse(),
    }),
  );
  // The current Actor parser accepts these lists; the invoice family refuses
  // them on its own.
  for (const grants of [
    [],
    withoutCompanyGrants(
      reader.grants,
      'company_invoice_reader',
      'company_external_invoice_access',
    ),
    withoutCompanyGrants(reader.grants, 'company_external_invoice_access'),
    withCompanyGrants(
      withoutCompanyGrants(reader.grants, 'company_invoice_reader'),
      {
        bundle: 'company_invoice_recorder',
        version: 'v1',
        assignmentId: 'malformed',
      },
    ),
    withCompanyGrants(
      withoutCompanyGrants(reader.grants, 'company_invoice_reader'),
      {
        bundle: 'company_invoice_recorder',
        version: 'v1',
        assignmentId: 'aaaaaaaa-0000-4000-8000-000000000001',
      },
      {
        bundle: 'company_external_invoice_access',
        version: 'v1',
        assignmentId: 'AAAAAAAA-0000-4000-8000-000000000001',
      },
    ),
  ]) {
    expect((await read({ ...reader, grants })).status).toBe('ok');
    expect(hasExternalInvoiceAccess({ ...reader, grants })).toBe(false);
  }
  // It refuses these for the whole current Actor (#1332).
  for (const grants of [
    undefined,
    null,
    [...reader.grants, financial],
    [...reader.grants, { ...family, assignmentId: invoiceUiIds.replacement }],
    reader.grants.map((grant) =>
      grant === financial
        ? {
            ...grant,
            bundle: 'company_invoice_recorder',
            permissionSetVersion: null,
          }
        : grant,
    ),
    reader.grants.map((grant) =>
      grant === financial
        ? {
            ...grant,
            bundle: 'company_invoice_recorder',
            permissionSetVersion: 'v2',
          }
        : grant,
    ),
  ])
    expect(await read({ ...reader, grants })).toEqual({ status: 'error' });
  // An additive key is ignored, as for every other grant (#1332).
  const additive = reader.grants.map((grant) =>
    grant === financial ? { ...grant, unexpected: true } : grant,
  );
  expect((await read({ ...reader, grants: additive })).status).toBe('ok');
});

it('requires captured native source authority and retains the Workspace Client-reader and Contract Approver alternatives', async () => {
  const company = invoiceUiActor.activeCompany;
  expect(canSelectExternalInvoiceSource(company)).toBe(true);
  const base = {
    ...company,
    id: invoiceUiIds.company,
    displayName: 'Fictional Company',
  };
  const without = (bundle: CompanyGrantBundle) => ({
    ...base,
    grants: withoutCompanyGrants(base.grants, bundle),
  });
  expect(
    canSelectExternalInvoiceSource(without('company_contract_preparer')),
  ).toBe(false);
  // A Contract capture without a version is refused for the whole Actor.
  expect(
    await read({
      ...base,
      grants: base.grants?.map((grant) =>
        grant.bundle === 'company_contract_preparer'
          ? { ...grant, permissionSetVersion: undefined }
          : grant,
      ),
    }),
  ).toEqual({ status: 'error' });
  expect(
    canSelectExternalInvoiceSource(without('company_commercial_intake')),
  ).toBe(false);
  expect(
    canSelectExternalInvoiceSource(without('company_document_registrar')),
  ).toBe(false);
  expect(
    canSelectExternalInvoiceSource(without('company_director_client_access')),
  ).toBe(false);
  expect(
    canSelectExternalInvoiceSource(
      {
        ...without('company_director_client_access'),

        grants: withoutCompanyGrants(
          without('company_director_client_access')?.grants,
          'company_director_client_access',
        ),
      },
      true,
    ),
  ).toBe(true);
  expect(
    canSelectExternalInvoiceSource({
      ...base,
      grants: withCompanyGrants(
        withoutCompanyGrants(base.grants, 'company_contract_preparer'),
        {
          bundle: 'company_contract_approver',
          version: 'v1',
          assignmentId: 'captured-approver',
        },
      ),
    }),
  ).toBe(true);
});
