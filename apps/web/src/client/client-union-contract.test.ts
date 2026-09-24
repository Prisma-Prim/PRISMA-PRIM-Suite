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

  it('reads original Contacts that carry a position and decision roles', () => {
    const original = {
      id: 'client-1',
      version: 2,
      displayName: 'AGRONOVA Demo SRL',
      taxId: null,
      address: null,
      telephone: null,
      generalEmail: null,
      businessActivity: null,
      contacts: [
        {
          name: 'Ion Demo',
          position: 'Director general',
          decisionRoles: ['final_decision_maker', 'financial'],
        },
      ],
    };
    const parsed = readUnionDetail({
      state: 'united',
      projectionReference: 'authorized-projection',
      canonicalClientId: 'client-1',
      reason: 'Verified union reason.',
      occurredAt: '2026-09-24T12:00:00.000Z',
      actor: { displayName: 'Authorized Director' },
      canReverse: true,
      originals: [original, { ...original, id: 'client-2' }],
      companies: [{ id: 'company-a', displayName: 'Company A' }],
      reversal: null,
    });

    expect(parsed.originals[0]?.contacts).toEqual([{ name: 'Ion Demo' }]);
  });
});
