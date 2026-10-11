import { describe, expect, it } from 'vitest';
import { isOutcomeHistoryPage } from './opportunity-outcome';

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

const actor = { workspaceMembershipId: 'membership-ada', displayLabel: 'Ada' };
function entry(overrides: Record<string, unknown>) {
  return {
    previousStatus: 'OPEN',
    newStatus: 'WON',
    lossReasonCode: null,
    reason: null,
    note: null,
    version: 2,
    actor,
    changedAt: '2026-10-11T10:00:00.000Z',
    ...overrides,
  };
}
const page = (entries: unknown[]) => ({ entries });

describe('outcome history boundary', () => {
  it('accepts every permitted transition with exactly its recorded fields', () => {
    expect(
      isOutcomeHistoryPage(
        page([
          entry({}),
          entry({ newStatus: 'ON_HOLD', reason: 'Waiting', version: 3 }),
          entry({
            previousStatus: 'ON_HOLD',
            newStatus: 'OPEN',
            version: 4,
          }),
          entry({ newStatus: 'LOST', lossReasonCode: 'PRICE', version: 5 }),
          entry({
            newStatus: 'LOST',
            lossReasonCode: 'OTHER',
            note: 'Merged with a group',
            version: 6,
          }),
          entry({
            previousStatus: 'LOST',
            newStatus: 'OPEN',
            reason: 'Client returned',
            version: 7,
          }),
        ]),
        isTimestamp,
      ),
    ).toBe(true);
  });

  it.each<[string, Record<string, unknown>]>([
    ['the same status', { previousStatus: 'OPEN', newStatus: 'OPEN' }],
    ['a pair outside the table', { previousStatus: 'WON', newStatus: 'LOST' }],
    ['a loss without its code', { newStatus: 'LOST' }],
    [
      'an Other loss without a note',
      { newStatus: 'LOST', lossReasonCode: 'OTHER' },
    ],
    ['a hold without a reason', { newStatus: 'ON_HOLD' }],
    ['a hold with a blank reason', { newStatus: 'ON_HOLD', reason: '  ' }],
    ['a win with a reason', { reason: 'Signed' }],
    ['a reopen without a reason', { previousStatus: 'WON', newStatus: 'OPEN' }],
    [
      'a resume with a reason',
      { previousStatus: 'ON_HOLD', newStatus: 'OPEN', reason: 'Back' },
    ],
    [
      'a loss code on a hold',
      { newStatus: 'ON_HOLD', reason: 'Wait', lossReasonCode: 'PRICE' },
    ],
    ['the initial version', { version: 1 }],
    ['an extra field', { extra: true }],
    ['a blank actor label', { actor: { ...actor, displayLabel: ' ' } }],
  ])('rejects %s', (_case, overrides) => {
    expect(isOutcomeHistoryPage(page([entry(overrides)]), isTimestamp)).toBe(
      false,
    );
  });

  it('rejects an entry missing a field', () => {
    const withoutNote: Record<string, unknown> = entry({});
    delete withoutNote.note;
    expect(isOutcomeHistoryPage(page([withoutNote]), isTimestamp)).toBe(false);
  });
});
