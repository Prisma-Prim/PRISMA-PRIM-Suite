import { expect, it } from 'vitest';
import {
  readPaymentEvidenceSource,
  readPaymentEvidenceDocuments,
  paymentEvidenceMetadata,
  readPaymentEvidenceDocument,
} from './payment-evidence-response';
const id = '10000000-0000-4000-8000-000000000001';
const source = {
  format: 'PAYMENT_EVIDENCE_SOURCE/1',
  receivingCompanyLabel: 'Fictional Company',
  sourceDescription: 'Fictional source',
  receivedOn: null,
  registeredAt: '2026-01-15T09:00:00.000Z',
  registeredBy: { workspaceMembershipId: id, internalUserId: id },
  payer: {
    kind: 'AVAILABLE',
    party: {
      kind: 'PRIMARY',
      legalName: 'Original Client',
      taxId: null,
      legalAddress: null,
    },
  },
};
const document = {
  id,
  companyId: id,
  clientId: id,
  clientDisplayName: 'Original Client',
  type: 'payment-evidence',
  title: 'Fictional notice',
  purpose: 'Preserve source',
  confidentiality: 'company-confidential',
  createdAt: '2026-01-15T09:00:00.000Z',
  workingRevision: 1,
  correction: 'allowed',
  version: { id, status: 'draft', representation: null },
  paymentEvidenceSource: source,
};
it('preserves frozen identity nulls and unknown received date', () =>
  expect(readPaymentEvidenceSource(source)).toEqual(source));
it('rejects hidden payer fields in an unavailable projection', () => {
  expect(() =>
    readPaymentEvidenceSource({
      ...source,
      payer: { kind: 'UNAVAILABLE', legalName: 'Hidden identity' },
    }),
  ).toThrow();
});
it('separates protected payer from metadata caching', () => {
  const parsed = readPaymentEvidenceDocument(document);
  expect(paymentEvidenceMetadata(parsed).paymentEvidenceSource.payer).toEqual({
    kind: 'UNAVAILABLE',
  });
  expect(parsed.paymentEvidenceSource.payer).toEqual(source.payer);
});
it('filters sibling native families before interpreting their feature representation', () => {
  expect(
    readPaymentEvidenceDocuments([
      { type: 'external-invoice', futureOpaque: {} },
      document,
    ]),
  ).toEqual([document]);
});
it('rejects unknown persisted format and false calendar date', () => {
  expect(() =>
    readPaymentEvidenceSource({
      ...source,
      format: 'PAYMENT_EVIDENCE_SOURCE/2',
    }),
  ).toThrow();
  expect(() =>
    readPaymentEvidenceSource({ ...source, receivedOn: '2026-02-30' }),
  ).toThrow();
});
