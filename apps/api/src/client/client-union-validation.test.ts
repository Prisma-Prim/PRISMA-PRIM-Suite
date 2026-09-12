import { describe, expect, it } from 'vitest';
import {
  normalizeUnionConfirmation,
  unionContactResult,
} from './client-union-validation.js';

const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
const company = '00000000-0000-4000-8000-000000000003';
const confirmation = {
  canonicalClientId: first,
  fields: {
    displayName: first,
    taxId: first,
    address: second,
    telephone: first,
    generalEmail: second,
    businessActivity: first,
  },
  companyIds: [company],
  reviewedDifferences: true,
  reason: ' Same legal identity, verified by the resolver. ',
};

describe('Client union command boundary', () => {
  it('requires deliberate field choices, reviewed differences and a reason', () => {
    expect(normalizeUnionConfirmation(confirmation)).toEqual({
      ...confirmation,
      reason: confirmation.reason.trim(),
    });
    for (const invalid of [
      null,
      [],
      {},
      { ...confirmation, reason: ' ' },
      { ...confirmation, reviewedDifferences: false },
      { ...confirmation, companyIds: [] },
      { ...confirmation, companyIds: [company, company] },
      { ...confirmation, fields: { displayName: first } },
      { ...confirmation, documentId: first },
    ]) {
      expect(() => normalizeUnionConfirmation(invalid)).toThrow();
    }
  });

  it('preserves identical Contact entries as separate sources and blocks overflow', () => {
    const contact = { name: 'Alex', telephone: '+373 60 000 001' };
    const result = unionContactResult([
      { clientId: first, version: 1, contacts: [contact] },
      { clientId: second, version: 3, contacts: [contact] },
    ]);
    expect(result.contacts).toEqual([contact, contact]);
    expect(result.sources).toEqual([
      { clientId: first, version: 1, index: 0 },
      { clientId: second, version: 3, index: 0 },
    ]);
    expect(() =>
      unionContactResult([
        {
          clientId: first,
          version: 1,
          contacts: Array.from({ length: 26 }, () => contact),
        },
        {
          clientId: second,
          version: 1,
          contacts: Array.from({ length: 25 }, () => contact),
        },
      ]),
    ).toThrow();
  });
});
