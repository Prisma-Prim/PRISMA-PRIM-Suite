import { describe, expect, it } from 'vitest';
import {
  continuesOutcomeHistory,
  isConsistentOutcomeSnapshot,
  isOpportunityOutcomeStatus,
  isOutcomeHistoryPage,
  MAXIMUM_OPPORTUNITY_VERSION,
  OPPORTUNITY_OUTCOME_STATUSES,
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
// A page with older entries to follow.
const continued = (entries: unknown[]) => ({
  entries,
  nextCursor: 'opaque-1',
});

// The valid fields of each kind of transition, from OPEN unless stated.
const valid = {
  win: {},
  loss: { newStatus: 'LOST', lossReasonCode: 'PRICE' },
  otherLoss: { newStatus: 'LOST', lossReasonCode: 'OTHER', note: 'Merged' },
  hold: { newStatus: 'ON_HOLD', reason: 'Waiting' },
  resume: { previousStatus: 'ON_HOLD', newStatus: 'OPEN' },
  reopen: { previousStatus: 'WON', newStatus: 'OPEN', reason: 'Again' },
};
// The section 16.3 bound.
const longestText = 'x'.repeat(500);

describe('outcome statuses', () => {
  it('recognises exactly the section 23 statuses', () => {
    for (const status of OPPORTUNITY_OUTCOME_STATUSES)
      expect(isOpportunityOutcomeStatus(status)).toBe(true);
    for (const value of ['PENDING', 'open', '', null, undefined])
      expect(isOpportunityOutcomeStatus(value)).toBe(false);
  });
});

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

  // Each case starts from a valid entry and breaks one rule. The page has a
  // cursor, so it need not start at OPEN and only the entry rules apply.
  it.each<[string, Record<string, unknown>, Record<string, unknown>]>([
    ['the same status', valid.win, { newStatus: 'OPEN' }],
    ['a pair outside the table', valid.loss, { previousStatus: 'WON' }],
    ['an unknown previous status', valid.win, { previousStatus: 'PENDING' }],
    ['an unknown new status', valid.win, { newStatus: 'PENDING' }],
    ['a loss without its code', valid.loss, { lossReasonCode: null }],
    ['an unknown loss code', valid.loss, { lossReasonCode: 'EXPENSIVE' }],
    ['an Other loss without a note', valid.otherLoss, { note: null }],
    ['a loss with a reason', valid.loss, { reason: 'Too expensive' }],
    ['a loss with a blank note', valid.loss, { note: ' ' }],
    [
      'a loss note over 500 characters',
      { ...valid.loss, note: longestText },
      { note: `${longestText}x` },
    ],
    ['a hold without a reason', valid.hold, { reason: null }],
    ['a hold with a blank reason', valid.hold, { reason: '  ' }],
    [
      'a hold reason over 500 characters',
      { ...valid.hold, reason: longestText },
      { reason: `${longestText}x` },
    ],
    ['a hold with a note', valid.hold, { note: 'Until January' }],
    ['a loss code on a hold', valid.hold, { lossReasonCode: 'PRICE' }],
    ['a win with a reason', valid.win, { reason: 'Signed' }],
    ['a win with a loss code', valid.win, { lossReasonCode: 'PRICE' }],
    ['a win with a note', valid.win, { note: 'Signed' }],
    ['a reopen without a reason', valid.reopen, { reason: null }],
    ['a resume with a reason', valid.resume, { reason: 'Back' }],
    ['the initial version', valid.win, { version: 1 }],
    ['a fractional version', valid.win, { version: 2.5 }],
    [
      'a version above the database integer',
      { version: MAXIMUM_OPPORTUNITY_VERSION },
      { version: MAXIMUM_OPPORTUNITY_VERSION + 1 },
    ],
    ['an extra field', valid.win, { extra: true }],
    ['a null actor', valid.win, { actor: null }],
    ['an actor that is not an object', valid.win, { actor: 'Ada' }],
    [
      'an actor with an extra field',
      valid.win,
      { actor: { ...actor, role: 'owner' } },
    ],
    [
      'an actor with a numeric membership',
      valid.win,
      { actor: { ...actor, workspaceMembershipId: 7 } },
    ],
    [
      'an actor with a numeric label',
      valid.win,
      { actor: { ...actor, displayLabel: 7 } },
    ],
    [
      'a blank actor label',
      valid.win,
      { actor: { ...actor, displayLabel: ' ' } },
    ],
  ])('rejects %s', (_case, fields, broken) => {
    expect(isOutcomeHistoryPage(continued([entry(fields)]), isTimestamp)).toBe(
      true,
    );
    expect(
      isOutcomeHistoryPage(
        continued([entry({ ...fields, ...broken })]),
        isTimestamp,
      ),
    ).toBe(false);
  });

  // Each case breaks one rule of the valid page, a complete one-entry history.
  it.each<[string, unknown]>([
    ['a null page', null],
    ['a page that is not an object', 'page'],
    ['a list instead of a page', [entry(valid.win)]],
    ['null entries', { entries: null }],
    ['entries that are not a list', { entries: 'entries' }],
    ['a null entry', { entries: [null] }],
    ['a null cursor', { entries: [entry(valid.win)], nextCursor: null }],
    ['a numeric cursor', { entries: [entry(valid.win)], nextCursor: 1 }],
    [
      'a cursor that is not text',
      { entries: [entry(valid.win)], nextCursor: ['opaque-1'] },
    ],
  ])('rejects %s', (_case, value) => {
    expect(isOutcomeHistoryPage(page([entry(valid.win)]), isTimestamp)).toBe(
      true,
    );
    expect(isOutcomeHistoryPage(value, isTimestamp)).toBe(false);
  });

  it('rejects pages that are too long, out of order or with duplicate versions', () => {
    const hold = (version: number) => entry({ ...valid.hold, version });
    const resume = (version: number) => entry({ ...valid.resume, version });
    // Hold then resume is connected and starts at OPEN, so only the version
    // order can reject these pages.
    expect(isOutcomeHistoryPage(page([resume(3), hold(2)]), isTimestamp)).toBe(
      true,
    );
    expect(isOutcomeHistoryPage(page([resume(2), hold(3)]), isTimestamp)).toBe(
      false,
    );
    expect(isOutcomeHistoryPage(page([resume(2), hold(2)]), isTimestamp)).toBe(
      false,
    );
    // Alternating hold and resume keeps a connected chain at any length.
    const at = (version: number) =>
      version % 2 === 0 ? hold(version) : resume(version);
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
    // Right after the change, the Opportunity has the entry's version.
    expect(isConsistentOutcomeSnapshot({ ...snapshot, version: 3 })).toBe(true);
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
