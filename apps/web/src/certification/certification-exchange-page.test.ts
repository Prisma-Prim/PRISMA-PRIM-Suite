import { describe, expect, it } from 'vitest';
import { parseExchanges } from './certification-exchanges';

const empty = {
  records: [],
  total: 0,
  nextCursor: null,
  sendings: [],
  deadlines: { set: null, entries: [] },
  reverification: { items: [], firstSurveillanceBy: null },
};

describe('Exchange register read contract', () => {
  it('rejects an initial page that hides records without a continuation', () => {
    expect(() => parseExchanges({ ...empty, total: 201 })).toThrow();
  });
  it('reads all 1001 current sendings and all 1001 corrections while keeping the initial record page bounded', () => {
    const version = (sequence: number, number = 1) => ({
      id: `exchange-${sequence}-v${number}`,
      sequence,
      version: number,
      caseRevision: number,
      direction: 'sent',
      itemKind: 'stage_plan',
      counterpart: { kind: 'client', name: 'Lactis Demo SRL' },
      businessDate: '2026-10-29',
      channel: 'email',
      reference: null,
      note: null,
      attachmentIds: ['plan'],
      reason: number === 1 ? null : 'Fictional correction',
      recordedBy: {
        workspaceMembershipId: 'manager',
        displayName: 'Manager Demo',
      },
      recordedAt: '2026-10-30T12:00:00.000Z',
    });
    const records = Array.from({ length: 200 }, (_, index) => {
      const sequence = index + 1;
      const versions =
        sequence === 1
          ? Array.from({ length: 1001 }, (_, i) => version(sequence, i + 1))
          : [version(sequence)];
      return { sequence, current: versions.at(-1), versions };
    });
    const parsed = parseExchanges({
      ...empty,
      records,
      total: 1001,
      nextCursor: 'continuation',
      sendings: Array.from({ length: 1001 }, (_, i) =>
        version(i + 1, i === 0 ? 1001 : 1),
      ),
    });
    expect(parsed.records).toHaveLength(200);
    expect(parsed.records[0]?.versions).toHaveLength(1001);
    expect(parsed.sendings).toHaveLength(1001);
  });
});
