import { expect, it } from 'vitest';
import { readDocument } from './document-response';

const document = {
  id: 'document',
  companyId: 'company',
  clientId: 'client',
  clientDisplayName: 'Synthetic Client',
  title: 'Received original',
  purpose: 'Preservation',
  type: 'received-contract',
  confidentiality: 'company-confidential',
  createdAt: '2026-10-25T10:00:00.000Z',
  workingRevision: 1,
  correction: 'allowed',
  version: { id: 'version', status: 'draft', representation: null },
};
it('accepts a received Document with an explicitly unavailable relation and carries no concealed fields onward', () => {
  const parsed = readDocument({
    ...document,
    receivedContractRelation: {
      access: 'denied',
      contractId: 'concealed',
      sourceDescription: 'concealed source',
    },
  });
  expect(parsed).toMatchObject({
    type: 'received-contract',
    receivedContractRelation: { access: 'denied' },
  });
  expect(JSON.stringify(parsed)).not.toContain('concealed');
});
it('refuses a received Document with a missing or malformed required relation', () => {
  expect(() => readDocument(document)).toThrow();
  expect(() =>
    readDocument({
      ...document,
      receivedContractRelation: { access: 'granted' },
    }),
  ).toThrow();
});
