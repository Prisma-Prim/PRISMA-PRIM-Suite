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
        page(
          [
            entry({ newStatus: 'ON_HOLD', reason: 'Waiting', version: 2 }),
            entry({
              previousStatus: 'ON_HOLD',
              newStatus: 'OPEN',
              version: 3,
            }),
            entry({ version: 4 }),
            entry({
              previousStatus: 'WON',
              newStatus: 'OPEN',
              reason: 'Declared too early',
              version: 5,
            }),
            entry({ newStatus: 'LOST', lossReasonCode: 'PRICE', version: 6 }),
            entry({
              previousStatus: 'LOST',
              newStatus: 'OPEN',
              reason: 'Client returned',
              version: 7,
            }),
            entry({
              newStatus: 'LOST',
              lossReasonCode: 'OTHER',
              note: 'Merged with a group',
              version: 8,
            }),
            // A page is newest first and forms one connected chain.
          ].reverse(),
        ),
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

  it('rejects pages that are too long, out of order or with duplicate versions', () => {
    // Alternating hold and resume keeps a connected chain at any length.
    const at = (version: number) =>
      version % 2 === 0
        ? entry({ newStatus: 'ON_HOLD', reason: 'Waiting', version })
        : entry({ previousStatus: 'ON_HOLD', newStatus: 'OPEN', version });
    expect(isOutcomeHistoryPage(page([at(3), at(2)]), isTimestamp)).toBe(true);
    expect(isOutcomeHistoryPage(page([at(2), at(3)]), isTimestamp)).toBe(false);
    expect(isOutcomeHistoryPage(page([at(2), at(2)]), isTimestamp)).toBe(false);
    const fiftyOne = Array.from({ length: 51 }, (_, index) => at(60 - index));
    expect(isOutcomeHistoryPage(page(fiftyOne), isTimestamp)).toBe(false);
    expect(isOutcomeHistoryPage(page(fiftyOne.slice(0, 50)), isTimestamp)).toBe(
      true,
    );
  });

  it('rejects entries that do not connect', () => {
    // Older v2 ends ON_HOLD, but newer v3 starts from OPEN.
    expect(
      isOutcomeHistoryPage(
        page([
          entry({ newStatus: 'LOST', lossReasonCode: 'PRICE', version: 3 }),
          entry({ newStatus: 'ON_HOLD', reason: 'Waiting', version: 2 }),
        ]),
        isTimestamp,
      ),
    ).toBe(false);
  });

  it('rejects an entry missing a field', () => {
    const withoutNote: Record<string, unknown> = entry({});
    delete withoutNote.note;
    expect(isOutcomeHistoryPage(page([withoutNote]), isTimestamp)).toBe(false);
  });
});
