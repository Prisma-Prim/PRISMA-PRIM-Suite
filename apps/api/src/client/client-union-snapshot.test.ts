import { describe, expect, it } from 'vitest';
import { readUnionSnapshot } from './client-union-snapshot.js';

const clientId = '00000000-0000-4000-8000-000000000366';

function snapshot(contacts: unknown[]) {
  return {
    clients: [
      {
        id: clientId,
        workspaceId: '00000000-0000-4000-8000-000000000001',
        displayName: 'AGRONOVA Demo SRL',
        taxId: '1003600036600',
        address: null,
        telephone: null,
        generalEmail: null,
        contacts,
        businessActivity: null,
        version: 2,
        status: 'active',
        createdAt: '2026-09-24T08:00:00.000Z',
        createdByInternalUserId: '00000000-0000-4000-8000-000000000002',
        createdByWorkspaceMembershipId: '00000000-0000-4000-8000-000000000003',
        updatedAt: '2026-09-24T09:00:00.000Z',
      },
    ],
    relationships: [],
    companies: [],
  };
}

describe('Client union snapshot Contacts', () => {
  it('carries stored positions and decision roles unchanged', () => {
    const contacts = [
      { name: 'Ion Demo' },
      {
        name: 'Maria Demo',
        telephone: '+373 60 000 002',
        position: 'Responsabil calitate',
        decisionRoles: ['influencer', 'technical'],
      },
    ];

    expect(readUnionSnapshot(snapshot(contacts)).clients[0]?.contacts).toEqual(
      contacts,
    );
  });

  it.each([
    ['a non-text position', { name: 'A', position: 42 }],
    ['an unknown decision role', { name: 'A', decisionRoles: ['vip'] }],
    ['a non-list decision-role value', { name: 'A', decisionRoles: 'user' }],
    [
      'decision roles outside vocabulary order',
      { name: 'A', decisionRoles: ['technical', 'user'] },
    ],
    ['an unknown Contact key', { name: 'A', preference: 'email' }],
  ])('rejects %s', (_name, contact) => {
    expect(() => readUnionSnapshot(snapshot([contact]))).toThrow();
  });
});
