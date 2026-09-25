import { describe, expect, it } from 'vitest';
import { readClientCorrectionHistory } from './client-correction-history';

const correction = {
  id: 'correction-1',
  occurredAt: '2026-09-24T09:15:00.000Z',
  actor: { displayName: 'Director A', internalUserId: 'internal-user' },
  changes: {
    contacts: { before: [], after: [{ name: 'Ana Demo' }] },
    taxId: { before: '1003600012345', after: '1003600054321' },
    displayName: { before: 'SICOM', after: 'SICOM Demo SRL' },
  },
};

describe('Client correction history response', () => {
  it('presents changed fields in dossier order without extra actor identifiers', () => {
    expect(
      readClientCorrectionHistory({
        corrections: [correction],
        nextCursor: 'correction-1',
      }),
    ).toEqual({
      corrections: [
        {
          id: 'correction-1',
          occurredAt: '2026-09-24T09:15:00.000Z',
          actorDisplayName: 'Director A',
          changes: [
            { field: 'displayName', before: 'SICOM', after: 'SICOM Demo SRL' },
            {
              field: 'taxId',
              before: '1003600012345',
              after: '1003600054321',
            },
            { field: 'contacts', before: [], after: [{ name: 'Ana Demo' }] },
          ],
        },
      ],
      nextCursor: 'correction-1',
    });
  });

  it('keeps each Contact position and decision roles', () => {
    const contacts = {
      before: [{ name: 'Ion Demo' }],
      after: [
        {
          name: 'Ion Demo',
          position: 'Director general',
          decisionRoles: ['final_decision_maker', 'financial'],
        },
      ],
    };
    expect(
      readClientCorrectionHistory({
        corrections: [{ ...correction, changes: { contacts } }],
        nextCursor: null,
      }).corrections[0]?.changes,
    ).toEqual([{ field: 'contacts', ...contacts }]);
  });

  it.each([
    ['an empty change set', { ...correction, changes: {} }],
    [
      'a non-text Contact position',
      {
        ...correction,
        changes: {
          contacts: { before: [], after: [{ name: 'A', position: 7 }] },
        },
      },
    ],
    [
      'an unknown decision role',
      {
        ...correction,
        changes: {
          contacts: {
            before: [],
            after: [{ name: 'A', decisionRoles: ['vip'] }],
          },
        },
      },
    ],
    [
      'a non-list decision-role value',
      {
        ...correction,
        changes: {
          contacts: {
            before: [],
            after: [{ name: 'A', decisionRoles: 'user' }],
          },
        },
      },
    ],
    [
      'an unknown field',
      { ...correction, changes: { legalEntity: { before: null, after: 'X' } } },
    ],
    [
      'a malformed value',
      { ...correction, changes: { address: { before: 42, after: 'X' } } },
    ],
    [
      'a missing display name',
      { ...correction, changes: { displayName: { before: null, after: 'X' } } },
    ],
    ['an unreadable server time', { ...correction, occurredAt: 'not-a-date' }],
  ])('rejects %s', (_name, invalid) => {
    expect(() =>
      readClientCorrectionHistory({ corrections: [invalid], nextCursor: null }),
    ).toThrow('Invalid Client correction history.');
  });
});
