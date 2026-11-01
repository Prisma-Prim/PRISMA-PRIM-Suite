import { expect, it } from 'vitest';
import {
  isCalendarDate,
  isFollowUpReason,
  readFollowUpCurrent,
  readFollowUpHistory,
  readFollowUpReceipt,
  readFollowUpDiscovery,
} from './follow-up-contract';
import {
  absent,
  recorded,
  fact,
  entry,
  format,
  recordedBy,
} from './follow-up.fixture';

it.each(['0001-01-01', '2000-02-29', '2026-11-15', '9999-12-31'])(
  'accepts literal Gregorian date %s',
  (date) => {
    expect(isCalendarDate(date)).toBe(true);
  },
);
it.each([
  '0000-01-01',
  '1900-02-29',
  '2026-02-29',
  '2026-04-31',
  '2026-13-01',
  '2026-00-01',
  '2026-01-00',
  '2026-1-01',
  ' 2026-01-01',
  '2026-01-01 ',
  '2026-01-01T00:00:00Z',
  '２０２６-01-01',
])('rejects noncanonical or impossible calendar value %s', (date) => {
  expect(isCalendarDate(date)).toBe(false);
});
it('preserves valid literal UTF-16 reasons and rejects blank, NUL, oversized or malformed Unicode', () => {
  expect(isFollowUpReason('  Vérification Я 📅  ')).toBe(true);
  for (const value of [
    '',
    ' \t\n ',
    'x'.repeat(501),
    '\0reason',
    '\ud800',
    '\udfff',
  ])
    expect(isFollowUpReason(value)).toBe(false);
});
it('distinguishes absence from a recorded null without inventing history', () => {
  expect(readFollowUpCurrent(absent)?.head.state).toBe('UNRECORDED');
  expect(readFollowUpCurrent(recorded)?.head.state).toBe('RECORDED');
  expect(readFollowUpCurrent({ ...absent, head: fact })).toBeUndefined();
});
it('closes immutable receipt and history formats without discarding extra or contradictory fields', () => {
  const receipt = {
    format,
    opportunityId: 'opportunity-a',
    outcome: 'updated',
    fact,
  };
  expect(readFollowUpReceipt(receipt)).toEqual(receipt);
  for (const invalid of [
    { ...receipt, format: 'opportunity-follow-up.v2' },
    { ...receipt, hidden: 'extra' },
    { ...receipt, toString: 'extra' },
    { ...receipt, fact: { ...fact, extra: true } },
    { ...receipt, fact: { ...fact, revision: 0 } },
    { ...receipt, fact: { ...fact, recordedAt: '2026-02-30T10:00:00.000Z' } },
  ])
    expect(readFollowUpReceipt(invalid)).toBeUndefined();
  expect(readFollowUpHistory(recorded.history)).toEqual(recorded.history);
  for (const invalid of [
    { ...recorded.history, total: 1 },
    { ...recorded.history, entries: [{ ...entry, reason: '' }] },
    {
      ...recorded.history,
      entries: [
        { ...entry, actor: { ...recordedBy, displayLabel: 'Contradiction' } },
      ],
    },
    {
      ...recorded.history,
      entries: [{ ...entry, before: { ...fact, revision: 1 } }],
    },
    { ...recorded.history, nextCursor: 'unexpected-more' },
    { ...recorded.history, entries: [{ ...entry, commandId: undefined }] },
  ])
    expect(readFollowUpHistory(invalid)).toBeUndefined();
});
it('accepts bounded eligible discovery and rejects counts, wrong boundaries, duplicates and nonadvancing positions', () => {
  const row = {
    opportunityId: 'a',
    requestId: 'request-a',
    title: 'Alpha',
    followUpOn: '2026-11-15',
    recordedBy,
    recordedAt: fact.recordedAt,
  };
  const page = {
    format,
    through: '2026-11-15',
    items: [row],
    nextCursor: null,
  };
  expect(readFollowUpDiscovery(page)).toEqual(page);
  for (const invalid of [
    { ...page, total: 1 },
    { ...page, through: '2026-11-14' },
    { ...page, items: [row, row] },
    { ...page, items: [{ ...row, opportunityId: 'b' }, row] },
    { ...page, items: [], nextCursor: 'hidden-row' },
    {
      ...page,
      items: Array.from({ length: 26 }, (_, index) => ({
        ...row,
        opportunityId: String(index).padStart(3, '0'),
      })),
    },
  ])
    expect(readFollowUpDiscovery(invalid)).toBeUndefined();
});
