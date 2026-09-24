import { describe, expect, it } from 'vitest';
import { readUnionDetail } from './client-union-contract';

describe('Client union history detail contract', () => {
  it('keeps internal operation and actor identifiers outside the presentation model', () => {
    const parsed = readUnionDetail({
      state: 'united',
      operationId: 'internal-operation',
      projectionReference: 'authorized-projection',
      canonicalClientId: 'client-1',
      reason: 'Verified union reason.',
      occurredAt: '2026-09-12T12:00:00.000Z',
      actor: {
        internalUserId: 'internal-user',
        displayName: 'Authorized Director',
      },
      canReverse: true,
      originals: [
        {
          id: 'client-1',
          version: 1,
          displayName: 'First',
          taxId: null,
          address: null,
          telephone: null,
          generalEmail: null,
          businessActivity: null,
          contacts: [],
        },
        {
          id: 'client-2',
          version: 1,
          displayName: 'Second',
          taxId: null,
          address: null,
          telephone: null,
          generalEmail: null,
          businessActivity: null,
          contacts: [],
        },
      ],
      companies: [{ id: 'company-a', displayName: 'Company A' }],
      reversal: null,
      identityBasis: { confidential: true },
      contactSources: ['confidential-source'],
    });

    expect(parsed).not.toHaveProperty('operationId');
    expect(parsed.actor).toEqual({ displayName: 'Authorized Director' });
    expect(parsed).not.toHaveProperty('identityBasis');
    expect(parsed).not.toHaveProperty('contactSources');
  });
});
