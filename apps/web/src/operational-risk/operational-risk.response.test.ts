import { describe, expect, it } from 'vitest';
import {
  readRiskHistory,
  readRiskPage,
  readRiskRecord,
  readRiskResult,
  readRiskJournalStatement,
} from './operational-risk.response';
import {
  journalCorrection,
  journalOriginal,
  journalRiskId,
  journalStatement,
  riskCompanyId,
} from '../test/operational-risk-journal-fixture';

const companyId = '00000000-0000-4000-8000-000000000763';
const riskId = '00000000-0000-4000-8000-000000000764';
const entry = {
  id: '00000000-0000-4000-8000-000000000765',
  kind: 'intake-recorded',
  revision: 1,
  actor: {
    workspaceMembershipId: '00000000-0000-4000-8000-000000000766',
    displayName: 'Synthetic author',
  },
  recordedAt: '2026-10-21T12:00:00.000Z',
  predecessorId: null,
  reason: null,
  facts: {
    process: ' Literal\n<script>text</script> ',
    cause: 'Cause',
    effect: 'Effect',
    plannedMeasure: 'Measure',
    existingMeasures: null,
    sourceDescription: null,
    plannedDate: null,
  },
};
const record = {
  id: riskId,
  companyId,
  revision: 1,
  assessment: 'not-assessed',
  responsibility: 'not-specified',
  createdAt: entry.recordedAt,
  originalIntake: entry,
  currentIntake: entry,
};

describe('Operational Risk network boundary', () => {
  it('constructs an exact original/current journal pair and preserves the complete correction variant in history and command results', () => {
    const value = {
      ...journalStatement,
      revision: 3,
      currentEntry: journalCorrection,
    };
    expect(
      readRiskJournalStatement({
        value,
        companyId: riskCompanyId,
        riskId: journalRiskId,
        journalEntryId: journalOriginal.id,
      }),
    ).toEqual(value);
    expect(
      readRiskHistory({
        items: [journalCorrection, journalOriginal],
        next_cursor: null,
      }),
    ).toEqual({
      items: [journalCorrection, journalOriginal],
      next_cursor: null,
    });
    expect(() =>
      readRiskResult({
        value: {
          risk: { ...record, companyId: riskCompanyId, revision: 3 },
          entry: journalCorrection,
        },
        companyId: riskCompanyId,
        correction: {
          entryId: journalRiskId,
          journalKind: 'observation',
          body: JSON.stringify({
            expectedRevision: 2,
            predecessorId: journalOriginal.id,
            narrative: journalCorrection.narrative,
            occurredOn: null,
            reason: journalCorrection.reason,
          }),
        },
      }),
    ).toThrow();
  });
  it.each([
    { ...journalStatement, riskId: journalOriginal.id },
    { ...journalStatement, companyId: journalRiskId },
    { ...journalStatement, revision: 1 },
    {
      ...journalStatement,
      originalEntry: { ...journalOriginal, kind: 'journal-corrected' },
    },
    {
      ...journalStatement,
      currentEntry: {
        ...journalOriginal,
        narrative: 'Contradictory original value',
      },
    },
    {
      ...journalStatement,
      currentEntry: {
        ...journalOriginal,
        actor: {
          ...journalOriginal.actor,
          displayName: 'Contradictory original author',
        },
      },
    },
    {
      ...journalStatement,
      revision: 3,
      currentEntry: { ...journalCorrection, originalEntryId: journalRiskId },
    },
    {
      ...journalStatement,
      revision: 3,
      currentEntry: { ...journalCorrection, journalKind: 'reassessment' },
    },
    {
      ...journalStatement,
      revision: 3,
      currentEntry: {
        ...journalCorrection,
        predecessorId: journalCorrection.id,
      },
    },
    {
      ...journalStatement,
      revision: 3,
      currentEntry: { ...journalCorrection, reason: null },
    },
    {
      ...journalStatement,
      revision: 3,
      currentEntry: { ...journalCorrection, occurredOn: undefined },
    },
    {
      ...journalStatement,
      revision: 3,
      currentEntry: { ...journalCorrection, occurredOn: '2026-02-29' },
    },
    {
      ...journalStatement,
      revision: 3,
      currentEntry: { ...journalCorrection, revision: 4 },
    },
    {
      ...journalStatement,
      revision: 3,
      currentEntry: {
        ...journalCorrection,
        actor: { ...journalCorrection.actor, displayName: '' },
      },
    },
    {
      ...journalStatement,
      revision: 3,
      currentEntry: { ...journalCorrection, kind: 'future-variant' },
    },
  ])(
    'fails closed on malformed, foreign or contradictory successful current-journal data %#',
    (value) => {
      expect(() =>
        readRiskJournalStatement({
          value,
          companyId: riskCompanyId,
          riskId: journalRiskId,
          journalEntryId: journalOriginal.id,
        }),
      ).toThrow('Invalid operational Risk response.');
    },
  );
  it('preserves literal accepted facts and attributable unassessed truth', () => {
    expect(readRiskRecord({ value: record, companyId, riskId })).toEqual(
      record,
    );
    expect(
      readRiskResult({ value: { risk: record, entry }, companyId }),
    ).toEqual({ risk: record, entry });
  });
  it.each([
    null,
    [],
    {},
    { ...record, assessment: 'low' },
    { ...record, responsibility: 'author' },
    { ...record, companyId: riskId },
    { ...record, revision: 0 },
    { ...record, originalIntake: { ...entry, revision: 2 } },
    { ...record, currentIntake: { ...entry, id: riskId } },
    {
      ...record,
      currentIntake: {
        ...entry,
        facts: { ...entry.facts, plannedDate: '2026-02-29' },
      },
    },
    {
      ...record,
      currentIntake: { ...entry, facts: { ...entry.facts, score: 3 } },
    },
    { ...record, extra: 'unregistered' },
  ])('rejects malformed, foreign or speculative Risk data %#', (value) => {
    expect(() => readRiskRecord({ value, companyId })).toThrow(
      'Invalid operational Risk response.',
    );
  });
  it('requires the command entry to belong to its confirmed aggregate revision', () => {
    expect(() =>
      readRiskResult({
        value: { risk: record, entry: { ...entry, id: riskId } },
        companyId,
      }),
    ).toThrow();
    expect(() =>
      readRiskResult({
        value: { risk: record, entry },
        companyId,
        riskId: entry.id,
      }),
    ).toThrow();
  });
  it('rejects malformed continuations and non-descending history rather than silently accepting a partial proof', () => {
    expect(() =>
      readRiskPage({ value: { items: [], next_cursor: '' }, companyId }),
    ).toThrow();
    expect(() =>
      readRiskPage({
        value: {
          items: [
            {
              id: riskId,
              companyId: riskId,
              revision: 1,
              createdAt: entry.recordedAt,
              process: 'Foreign',
            },
          ],
          next_cursor: null,
        },
        companyId,
      }),
    ).toThrow();
    expect(() =>
      readRiskHistory({ items: [entry, entry], next_cursor: null }),
    ).toThrow();
  });
});
