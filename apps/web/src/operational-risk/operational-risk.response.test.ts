import { describe, expect, it } from 'vitest';
import {
  readRiskHistory,
  readRiskPage,
  readRiskRecord,
  readRiskResult,
} from './operational-risk.response';

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
