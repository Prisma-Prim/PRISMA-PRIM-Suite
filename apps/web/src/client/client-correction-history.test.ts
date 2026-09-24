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

  it.each([
    ['an empty change set', { ...correction, changes: {} }],
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
  ])('rejects %s', (_name, invalid) => {
    expect(() =>
      readClientCorrectionHistory({ corrections: [invalid], nextCursor: null }),
    ).toThrow('Invalid Client correction history.');
  });
});
