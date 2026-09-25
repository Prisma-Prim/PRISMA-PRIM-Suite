import { describe, expect, it } from 'vitest';
import { readClientCorrectionChanges } from './client-correction-history.js';

describe('stored Client correction metadata', () => {
  it('returns every delivered field change exactly as stored', () => {
    const changes = {
      displayName: { before: ' SICOM Demo SRL', after: 'SICOM Demo SRL' },
      taxId: { before: '1003600012345', after: '1003600054321' },
      address: { before: null, after: 'Str. Demo 1' },
      telephone: { before: '+373 60 000 001', after: null },
      generalEmail: { before: null, after: 'office@example.test' },
      businessActivity: { before: 'Consulting', after: 'Certification' },
      contacts: {
        before: [{ name: 'Ion Demo' }],
        after: [
          { name: 'Ion Demo', telephone: '+373 60 000 002' },
          { name: 'Ana Demo', email: 'ana.demo@example.test' },
        ],
      },
    };

    expect(readClientCorrectionChanges({ changes })).toEqual(changes);
  });

  it('returns stored Contact positions and decision roles exactly as stored', () => {
    const changes = {
      contacts: {
        before: [{ name: 'Ion Demo', telephone: '+373 60 000 001' }],
        after: [
          {
            name: 'Ion Demo',
            telephone: '+373 60 000 001',
            position: 'Director general',
            decisionRoles: ['final_decision_maker', 'financial'],
          },
          { name: 'Maria Demo', decisionRoles: ['influencer', 'technical'] },
        ],
      },
    };

    expect(readClientCorrectionChanges({ changes })).toEqual(changes);
  });

  it('returns stored Contact communication preferences exactly as stored', () => {
    const changes = {
      contacts: {
        before: [{ name: 'Ion Demo', telephone: '+373 60 000 372' }],
        after: [
          {
            name: 'Ion Demo',
            telephone: '+373 60 000 372',
            communicationPreferences:
              'Romanian; email preferred\nweekday mornings',
          },
        ],
      },
    };

    expect(readClientCorrectionChanges({ changes })).toEqual(changes);
  });

  it('returns a stored telephone change that keeps position, decision roles and preferences', () => {
    const contact = {
      name: 'Ion Demo',
      position: 'Director general',
      decisionRoles: ['final_decision_maker', 'financial'],
      communicationPreferences: 'Romanian; email preferred',
    };
    const changes = {
      contacts: {
        before: [{ ...contact, telephone: '+373 60 000 001' }],
        after: [{ ...contact, telephone: '+373 60 000 372' }],
      },
    };

    expect(readClientCorrectionChanges({ changes })).toEqual(changes);
  });

  it.each([
    ['no metadata object', null],
    ['no changes', {}],
    ['an empty change set', { changes: {} }],
    ['an extra metadata key', { changes: { taxId: pair(null, 'X') }, raw: 1 }],
    ['an unknown field', { changes: { legalEntity: pair(null, 'X') } }],
    ['a change without after', { changes: { taxId: { before: null } } }],
    [
      'an extra change key',
      { changes: { taxId: { before: null, after: 'X', actor: 'raw' } } },
    ],
    ['a non-text value', { changes: { address: pair(42, 'X') } }],
    ['a missing display name', { changes: { displayName: pair(null, 'X') } }],
    ['a non-list Contacts value', { changes: { contacts: pair({}, []) } }],
    [
      'an unnamed Contact',
      { changes: { contacts: pair([], [{ email: 'a@example.test' }]) } },
    ],
    [
      'a null Contact telephone',
      { changes: { contacts: pair([], [{ name: 'A', telephone: null }]) } },
    ],
    [
      'an unknown Contact field',
      { changes: { contacts: pair([], [{ name: 'A', role: 'private' }]) } },
    ],
    [
      'a non-text Contact position',
      { changes: { contacts: pair([], [{ name: 'A', position: 42 }]) } },
    ],
    [
      'a blank Contact position',
      { changes: { contacts: pair([{ name: 'A', position: '' }], []) } },
    ],
    [
      'a non-list decision-role value',
      {
        changes: {
          contacts: pair([], [{ name: 'A', decisionRoles: 'financial' }]),
        },
      },
    ],
    [
      'an empty decision-role list',
      { changes: { contacts: pair([], [{ name: 'A', decisionRoles: [] }]) } },
    ],
    [
      'an unknown decision role',
      {
        changes: {
          contacts: pair([], [{ name: 'A', decisionRoles: ['vip'] }]),
        },
      },
    ],
    [
      'decision roles outside vocabulary order',
      {
        changes: {
          contacts: pair(
            [],
            [{ name: 'A', decisionRoles: ['blocker', 'influencer'] }],
          ),
        },
      },
    ],
    [
      'null Contact communication preferences',
      {
        changes: {
          contacts: pair([], [{ name: 'A', communicationPreferences: null }]),
        },
      },
    ],
    [
      'blank Contact communication preferences',
      {
        changes: {
          contacts: pair([{ name: 'A', communicationPreferences: ' ' }], []),
        },
      },
    ],
    [
      'over-long Contact communication preferences',
      {
        changes: {
          contacts: pair(
            [],
            [{ name: 'A', communicationPreferences: 'x'.repeat(1_001) }],
          ),
        },
      },
    ],
  ])('fails closed on %s without echoing stored values', (_name, metadata) => {
    expect(() => readClientCorrectionChanges(metadata)).toThrow(
      new Error('Invalid stored Client correction history.'),
    );
  });
});

function pair(before: unknown, after: unknown) {
  return { before, after };
}
