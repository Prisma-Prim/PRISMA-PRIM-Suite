import { describe, expect, it } from 'vitest';
import {
  continuesOutcomeHistory,
  isConsistentOutcomeSnapshot,
  isOutcomeHistoryPage,
  type OutcomeHistoryEntry,
} from './opportunity-outcome';

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
    ['a version above the database integer', { version: 2_147_483_648 }],
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
    expect(
      isOutcomeHistoryPage(
        { entries: fiftyOne, nextCursor: 'opaque-1' },
        isTimestamp,
      ),
    ).toBe(false);
    expect(
      isOutcomeHistoryPage(
        { entries: fiftyOne.slice(0, 50), nextCursor: 'opaque-1' },
        isTimestamp,
      ),
    ).toBe(true);
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

  it('requires the status to agree with its newest history entry', () => {
    const lost = entry({
      newStatus: 'LOST',
      lossReasonCode: 'PRICE',
      version: 3,
      changedAt: '2026-10-02T09:00:00.000Z',
    }) as OutcomeHistoryEntry;
    const snapshot = {
      status: 'LOST' as const,
      statusEnteredAt: '2026-10-02T09:00:00.000Z',
      createdAt: '2026-09-26T08:00:00.000Z',
      version: 4,
      outcomeHistory: { entries: [lost] },
    };
    expect(isConsistentOutcomeSnapshot(snapshot)).toBe(true);
    expect(isConsistentOutcomeSnapshot({ ...snapshot, status: 'WON' })).toBe(
      false,
    );
    expect(isConsistentOutcomeSnapshot({ ...snapshot, version: 2 })).toBe(
      false,
    );
    expect(
      isConsistentOutcomeSnapshot({
        ...snapshot,
        statusEnteredAt: '2026-10-05T09:00:00.000Z',
      }),
    ).toBe(false);
    const fresh = {
      ...snapshot,
      status: 'OPEN' as const,
      statusEnteredAt: snapshot.createdAt,
      outcomeHistory: { entries: [] },
    };
    expect(isConsistentOutcomeSnapshot(fresh)).toBe(true);
    expect(isConsistentOutcomeSnapshot({ ...fresh, status: 'LOST' })).toBe(
      false,
    );
    expect(
      isConsistentOutcomeSnapshot({
        ...fresh,
        statusEnteredAt: '2026-10-01T00:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('accepts an older page only when it continues the shown chronology', () => {
    const newest = entry({
      previousStatus: 'ON_HOLD',
      newStatus: 'LOST',
      lossReasonCode: 'PRICE',
      version: 3,
    }) as OutcomeHistoryEntry;
    const hold = entry({
      newStatus: 'ON_HOLD',
      reason: 'Waiting',
      version: 2,
    }) as OutcomeHistoryEntry;
    expect(continuesOutcomeHistory([newest], [hold])).toBe(true);
    expect(continuesOutcomeHistory([newest], [])).toBe(false);
    expect(continuesOutcomeHistory([], [hold])).toBe(true);
    expect(continuesOutcomeHistory([newest], [{ ...hold, version: 3 }])).toBe(
      false,
    );
    expect(
      continuesOutcomeHistory([newest], [{ ...hold, newStatus: 'WON' }]),
    ).toBe(false);
  });

  it('requires a complete history to start at OPEN and an empty page to end it', () => {
    const won = entry({
      previousStatus: 'ON_HOLD',
      newStatus: 'WON',
      version: 3,
    });
    const hold = entry({ newStatus: 'ON_HOLD', reason: 'Waiting', version: 2 });
    expect(isOutcomeHistoryPage(page([won]), isTimestamp)).toBe(false);
    expect(
      isOutcomeHistoryPage(
        { entries: [won], nextCursor: 'opaque-1' },
        isTimestamp,
      ),
    ).toBe(true);
    expect(isOutcomeHistoryPage(page([won, hold]), isTimestamp)).toBe(true);
    expect(isOutcomeHistoryPage(page([]), isTimestamp)).toBe(true);
    expect(
      isOutcomeHistoryPage(
        { entries: [], nextCursor: 'opaque-1' },
        isTimestamp,
      ),
    ).toBe(false);
  });

  it('rejects an empty older-page cursor', () => {
    expect(
      isOutcomeHistoryPage(
        { entries: [entry({})], nextCursor: '' },
        isTimestamp,
      ),
    ).toBe(false);
    expect(
      isOutcomeHistoryPage(
        { entries: [entry({})], nextCursor: 'opaque-1' },
        isTimestamp,
      ),
    ).toBe(true);
  });

  it('rejects an entry missing a field', () => {
    const withoutNote: Record<string, unknown> = entry({});
    delete withoutNote.note;
    expect(isOutcomeHistoryPage(page([withoutNote]), isTimestamp)).toBe(false);
  });
});
