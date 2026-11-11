import { describe, expect, it } from 'vitest';
import {
  addDays,
  currentExchanges,
  deadlineStates,
  type DeadlineCaseFacts,
  type DeadlineDays,
  type DeadlineExchange,
  type ExchangeRecordVersion,
} from './certification-exchanges.js';

/**
 * The fictional Lactis Demo SRL deadlines of the dossier control PRD §8.2,
 * with a fixed calendar date: Stage plans sent at least 10 days before
 * their first day, the audit dossier within 20 days after S2, and the
 * Stage 2 report not before the decision D.
 */
const FICTIONAL: DeadlineDays = {
  stage_plan_sent: 10,
  audit_dossier_transmitted: 20,
  stage_2_report_released: 0,
};
const S1 = '2026-10-01';
const S2_START = '2026-10-20';
const S2 = '2026-10-21';
const D = '2026-11-05';

function facts(overrides: Partial<DeadlineCaseFacts> = {}): DeadlineCaseFacts {
  return {
    plans: [
      { stage: 'stage_1', startDate: S1, documentId: 'plan-1' },
      { stage: 'stage_2', startDate: S2_START, documentId: 'plan-2' },
    ],
    stage2End: S2,
    stage2ReportDocumentId: 'report-2',
    decision: { date: D, firstRevision: 40 },
    ...overrides,
  };
}

function sent(
  sequence: number,
  businessDate: string,
  overrides: Partial<DeadlineExchange> = {},
): DeadlineExchange {
  return {
    sequence,
    version: 1,
    caseRevision: 20 + sequence,
    direction: 'sent',
    itemKind: 'stage_plan',
    counterpartKind: 'client',
    businessDate,
    documentIds: [],
    ...overrides,
  };
}

function states(
  exchanges: DeadlineExchange[],
  options: {
    today?: string;
    days?: DeadlineDays | null;
    facts?: DeadlineCaseFacts;
  } = {},
) {
  return deadlineStates({
    facts: options.facts ?? facts(),
    exchanges,
    days: options.days === undefined ? FICTIONAL : options.days,
    today: options.today ?? '2026-11-08',
  });
}

describe('Procedure deadline states (PRD §9.2, fixed clock)', () => {
  it('meets the Stage 1 plan deadline when it is sent on S1 − 12, and meets the Stage 2 plan late when sent 7 days before', () => {
    const found = states([
      sent(1, addDays(S1, -12), { documentIds: ['plan-1'] }),
      sent(2, addDays(S2_START, -7), { documentIds: ['plan-2'] }),
    ]);
    expect(found.filter((entry) => entry.kind === 'stage_plan_sent')).toEqual([
      {
        kind: 'stage_plan_sent',
        stage: 'stage_1',
        direction: 'before',
        days: 10,
        anchor: S1,
        dueDate: '2026-09-21',
        state: 'met',
        record: { sequence: 1, version: 1, businessDate: '2026-09-19' },
      },
      {
        kind: 'stage_plan_sent',
        stage: 'stage_2',
        direction: 'before',
        days: 10,
        anchor: S2_START,
        dueDate: '2026-10-10',
        state: 'met_late',
        record: { sequence: 2, version: 1, businessDate: '2026-10-13' },
      },
    ]);
  });

  it('keeps a deadline due until its due date and overdue from the next calendar day', () => {
    const dossier = (today: string) =>
      states([], { today }).find(
        (entry) => entry.kind === 'audit_dossier_transmitted',
      );
    expect(dossier('2026-11-10')).toMatchObject({
      anchor: S2,
      dueDate: '2026-11-10',
      state: 'due',
      record: null,
    });
    expect(dossier('2026-11-11')).toMatchObject({
      dueDate: '2026-11-10',
      state: 'overdue',
    });
  });

  it('meets the audit dossier deadline only with a sending of kind audit dossier to the certification body', () => {
    const dossier = (exchanges: DeadlineExchange[]) =>
      states(exchanges, { today: '2026-11-20' }).find(
        (entry) => entry.kind === 'audit_dossier_transmitted',
      );
    expect(
      dossier([sent(1, '2026-11-08', { itemKind: 'audit_dossier' })]),
    ).toMatchObject({ state: 'overdue', record: null });
    expect(
      dossier([
        sent(1, '2026-11-08', {
          itemKind: 'audit_dossier',
          counterpartKind: 'certification_body',
          direction: 'received',
        }),
      ]),
    ).toMatchObject({ state: 'overdue' });
    expect(
      dossier([
        sent(1, '2026-11-12', {
          itemKind: 'audit_dossier',
          counterpartKind: 'certification_body',
        }),
        sent(2, '2026-11-08', {
          itemKind: 'audit_dossier',
          counterpartKind: 'certification_body',
        }),
      ]),
    ).toMatchObject({
      state: 'met',
      record: { sequence: 2, businessDate: '2026-11-08' },
    });
  });

  it('marks the Stage 2 report sent too early before D, and while no decision exists', () => {
    const release = (exchanges: DeadlineExchange[], decided = facts()) =>
      states(exchanges, { facts: decided }).find(
        (entry) => entry.kind === 'stage_2_report_released',
      );
    const report = {
      documentIds: ['report-2'],
      itemKind: 'stage_report' as const,
    };
    expect(release([sent(1, '2026-11-01', report)])).toMatchObject({
      direction: 'not_before',
      anchor: D,
      dueDate: D,
      state: 'sent_too_early',
      record: { sequence: 1, businessDate: '2026-11-01' },
    });
    expect(
      release([sent(1, '2026-11-01', report)], facts({ decision: null })),
    ).toMatchObject({ anchor: null, dueDate: null, state: 'sent_too_early' });
    // Recorded while no decision existed, it stays early once D is recorded.
    expect(
      release([sent(1, D, { ...report, caseRevision: 39 })]),
    ).toMatchObject({ state: 'sent_too_early' });
    expect(
      release([sent(1, D, { ...report, caseRevision: 41 })]),
    ).toMatchObject({ state: 'met', record: { sequence: 1 } });
    expect(release([])).toMatchObject({ state: 'due', dueDate: D });
    expect(release([], facts({ decision: null }))).toMatchObject({
      state: null,
      dueDate: null,
    });
  });

  it('produces no state for a kind without a value, and none at all without a set', () => {
    expect(states([], { days: null })).toEqual([]);
    const partial = states([], {
      days: { ...FICTIONAL, stage_plan_sent: null },
    });
    expect(partial.map((entry) => entry.kind)).toEqual([
      'audit_dossier_transmitted',
      'stage_2_report_released',
    ]);
  });

  it('waits for the anchor of a deadline whose record is not recorded yet', () => {
    const found = states([], {
      facts: facts({
        plans: [{ stage: 'stage_1', startDate: S1, documentId: 'plan-1' }],
        stage2End: null,
      }),
      today: '2026-09-25',
    });
    expect(
      found.map(({ kind, stage, dueDate, state }) => ({
        kind,
        stage,
        dueDate,
        state,
      })),
    ).toEqual([
      {
        kind: 'stage_plan_sent',
        stage: 'stage_1',
        dueDate: '2026-09-21',
        state: 'overdue',
      },
      { kind: 'stage_plan_sent', stage: 'stage_2', dueDate: null, state: null },
      {
        kind: 'audit_dossier_transmitted',
        stage: null,
        dueDate: null,
        state: null,
      },
      {
        kind: 'stage_2_report_released',
        stage: null,
        dueDate: D,
        state: 'due',
      },
    ]);
  });
});

describe('Exchange Record versions', () => {
  it('reads the latest version of each record, in sequence order', () => {
    const version = (
      sequence: number,
      number: number,
    ): ExchangeRecordVersion => ({
      id: `${String(sequence)}-${String(number)}`,
      sequence,
      version: number,
      caseRevision: sequence * 10 + number,
      direction: 'sent',
      itemKind: 'stage_plan',
      counterpart: { kind: 'client', name: 'Lactis Demo SRL, quality manager' },
      businessDate: '2026-09-19',
      channel: 'email',
      reference: null,
      note: null,
      attachmentIds: ['plan-1-v1'],
      reason: number > 1 ? 'Fictional correction' : null,
      recordedBy: { workspaceMembershipId: 'manager', displayName: 'Ada' },
      recordedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(
      currentExchanges([version(2, 1), version(1, 1), version(1, 2)]).map(
        (entry) => entry.id,
      ),
    ).toEqual(['1-2', '2-1']);
  });
});
