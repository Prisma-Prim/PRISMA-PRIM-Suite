import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fixtures, successful } from './support.mjs';

test('separately named empty, manual-zero and manual-null fixtures retain their literal boundary oracles', (t) => {
  const empty = successful(t, undefined, 'empty');
  assert.deepEqual(
    empty.result.aggregate,
    JSON.parse(readFileSync(new URL('empty.expected.json', fixtures))),
  );
  assert.deepEqual(empty.result.cases, []);
  assert.ok(empty.report.includes('unavailable (zero denominator)'));
  for (const [name, code, elapsed] of [
    ['one-manual-zero', 'zero_time_manual', 0],
    ['one-manual-null', 'unmeasured_time_manual', null],
  ]) {
    const { result } = successful(t, undefined, 'one', name);
    assert.equal(result.aggregate.basePairCount, 1);
    assert.equal(result.cases[0].manual.elapsedMs, elapsed);
    assert.deepEqual(result.aggregate.time, {
      pairedCaseIds: [],
      excluded: [{ caseId: 'A', reasons: [code] }],
      manualMs: 0,
      assistedMs: 0,
      reductionPercent: null,
    });
    assert.deepEqual(result.aggregate.fields.manual, {
      numerator: 0,
      denominator: 1,
      value: '0.000000',
    });
    assert.deepEqual(result.aggregate.fields.assisted, {
      numerator: 1,
      denominator: 1,
      value: '1.000000',
    });
    assert.deepEqual(result.aggregate.changes.manual, {
      numerator: 1,
      denominator: 1,
      value: '1.000000',
    });
    assert.deepEqual(result.aggregate.changes.assisted, {
      numerator: 0,
      denominator: 1,
      value: '0.000000',
    });
    assert.equal(result.aggregate.citations.precisionDeltaPp, '0.000000');
  }
});

test('time eligibility preserves null and zero independently on either side', (t) => {
  for (const [manual, assisted, reasons] of [
    [null, 0, ['unmeasured_time_manual', 'zero_time_assisted']],
    [0, null, ['unmeasured_time_assisted', 'zero_time_manual']],
    [null, null, ['unmeasured_time_manual', 'unmeasured_time_assisted']],
    [0, 0, ['zero_time_manual', 'zero_time_assisted']],
  ]) {
    const { result } = successful(t, (x) => {
      x.runs.manual.observations[0].elapsedMs = manual;
      x.runs.assisted.observations[0].elapsedMs = assisted;
    });
    assert.deepEqual(result.cases[0].pairs.time, {
      exclusions: reasons,
      manualMs: null,
      assistedMs: null,
      reductionPercent: null,
    });
    assert.equal(result.cases[0].manual.elapsedMs, manual);
    assert.equal(result.cases[0].assisted.elapsedMs, assisted);
    assert.equal(result.aggregate.basePairCount, 1);
    assert.equal(result.aggregate.time.manualMs, 0);
    assert.equal(result.aggregate.time.assistedMs, 0);
  }
});

test('missing, failed, not_run and all five incompatibilities retain complete ordered exclusions', (t) => {
  const { result } = successful(t, (x) => {
    const m = x.runs.manual.observations[0];
    m.caseVersion = 2;
    m.sourceSetId = 'OLD-S';
    m.sourceSetVersion = 2;
    m.referenceId = 'OLD-R';
    m.referenceVersion = 2;
    m.status = 'failed';
    m.fields = null;
    m.citations = null;
    const a = x.runs.assisted.observations[0];
    a.status = 'not_run';
    a.elapsedMs = null;
    a.fields = null;
    a.citations = null;
    x.cases.cases[0].reference.fields = [];
    x.cases.cases[0].reference.citations = null;
  });
  assert.deepEqual(result.cases[0].manual.identityMismatches, [
    'caseVersion',
    'sourceSetId',
    'sourceSetVersion',
    'referenceId',
    'referenceVersion',
  ]);
  assert.deepEqual(result.cases[0].manual.declaredIdentity, {
    caseVersion: 2,
    sourceSetId: 'OLD-S',
    sourceSetVersion: 2,
    referenceId: 'OLD-R',
    referenceVersion: 2,
  });
  assert.deepEqual(result.cases[0].pairs.time.exclusions, [
    'incompatible_manual',
    'failed_manual',
    'not_run_assisted',
  ]);
  assert.deepEqual(result.cases[0].pairs.fields.exclusions, [
    'incompatible_manual',
    'failed_manual',
    'not_run_assisted',
    'no_reference_fields',
  ]);
  assert.deepEqual(result.cases[0].pairs.citations.exclusions, [
    'incompatible_manual',
    'failed_manual',
    'not_run_assisted',
    'unsupported_reference_citations',
  ]);
  assert.equal(result.aggregate.time.manualMs, 0);
  const absent = successful(t, (x) => {
    x.runs.manual.observations = [];
    x.runs.assisted.observations = [];
  });
  assert.equal(absent.result.cases[0].manual, null);
  assert.equal(absent.result.cases[0].assisted, null);
  for (const metric of Object.values(absent.result.cases[0].pairs))
    assert.deepEqual(metric.exclusions, ['missing_manual', 'missing_assisted']);
});

test('partial and empty field captures expose review coverage without lowering paired changes', (t) => {
  for (const fields of [
    [],
    [
      {
        fieldId: 'employees',
        initial: { state: 'confirmed', value: '22' },
        final: null,
      },
    ],
  ]) {
    const { result } = successful(t, (x) => {
      x.runs.manual.observations[0].fields = fields;
    });
    assert.equal(result.cases[0].manual.fields.initialCorrectCount, 0);
    assert.equal(result.cases[0].manual.fields.reviewedCount, 0);
    assert.equal(result.cases[0].manual.fields.finalCorrectCount, 0);
    assert.equal(result.cases[0].manual.fields.changedCount, 0);
    assert.equal(
      result.cases[0].manual.fields.details[0].present,
      fields.length > 0,
    );
    assert.equal(result.cases[0].manual.fields.details[0].finalMatches, null);
    assert.deepEqual(result.cases[0].pairs.changes.exclusions, [
      'incomplete_review_manual',
    ]);
    assert.deepEqual(result.aggregate.changes.manual, {
      numerator: 0,
      denominator: 0,
      value: null,
    });
    assert.deepEqual(result.aggregate.fields.manual, {
      numerator: 0,
      denominator: 1,
      value: '0.000000',
    });
  }
  const uncaptured = successful(t, (x) => {
    x.runs.manual.observations[0].fields = null;
  });
  assert.equal(uncaptured.result.cases[0].manual.fields, null);
  assert.deepEqual(uncaptured.result.cases[0].pairs.changes.exclusions, [
    'unmeasured_fields_manual',
  ]);
});

test('exact state and Unicode text comparisons distinguish changes from correctness', (t) => {
  for (const [expected, initial, final, correct, changed] of [
    [
      { state: 'confirmed', value: '20' },
      { state: 'inferred', value: '20' },
      { state: 'confirmed', value: '20' },
      false,
      true,
    ],
    [
      { state: 'contradictory', value: null },
      { state: 'missing', value: null },
      { state: 'contradictory', value: null },
      false,
      true,
    ],
    [
      { state: 'confirmed', value: 'é' },
      { state: 'confirmed', value: 'e\u0301' },
      { state: 'confirmed', value: 'é' },
      false,
      true,
    ],
    [
      { state: 'confirmed', value: '20' },
      { state: 'confirmed', value: '20 ' },
      { state: 'confirmed', value: '20 ' },
      false,
      false,
    ],
    [
      { state: 'missing', value: null },
      { state: 'missing', value: null },
      { state: 'missing', value: null },
      true,
      false,
    ],
  ]) {
    const { result, input, values } = successful(t, (x) => {
      x.cases.cases[0].reference.fields = [
        { fieldId: 'employees', ...expected },
      ];
      x.runs.manual.observations[0].fields = [
        { fieldId: 'employees', initial, final },
      ];
    });
    assert.equal(
      result.cases[0].manual.fields.details[0].initialMatches,
      correct,
    );
    assert.equal(result.cases[0].manual.fields.details[0].changed, changed);
    assert.equal(
      result.cases[0].manual.fields.finalCorrectCount,
      final.value === '20 ' ? 0 : 1,
    );
    assert.deepEqual(JSON.parse(readFileSync(input.runsPath)), values.runs);
    assert.ok(!JSON.stringify(result).includes('"initial":'));
    assert.ok(!JSON.stringify(result).includes('"final":'));
  }
});

test('citation tuples retain unresolved observations and independent zero denominators', (t) => {
  const wrong = successful(t, (x) => {
    x.runs.assisted.observations[0].citations = [
      { sourceId: 'UNKNOWN', sourceVersion: 1, locator: 'p1' },
      { sourceId: 'DOC-A', sourceVersion: 2, locator: 'p1' },
      { sourceId: 'DOC-A', sourceVersion: 1, locator: 'wrong' },
      { sourceId: 'DOC-A', sourceVersion: 1, locator: 'p1' },
    ];
  });
  const c = wrong.result.cases[0].assisted.citations;
  assert.deepEqual(c.unresolved, [
    { sourceId: 'DOC-A', sourceVersion: 1, locator: 'wrong' },
    { sourceId: 'DOC-A', sourceVersion: 2, locator: 'p1' },
    { sourceId: 'UNKNOWN', sourceVersion: 1, locator: 'p1' },
  ]);
  assert.deepEqual(c.unexpected, c.unresolved);
  assert.deepEqual(c.missing, []);
  assert.deepEqual(wrong.result.aggregate.citations.assisted.precision, {
    numerator: 1,
    denominator: 4,
    value: '0.250000',
  });
  assert.equal(wrong.result.aggregate.citations.precisionDeltaPp, '-75.000000');
  const noCaptured = successful(t, (x) => {
    x.runs.assisted.observations[0].citations = [];
  });
  assert.deepEqual(noCaptured.result.aggregate.citations.assisted.precision, {
    numerator: 0,
    denominator: 0,
    value: null,
  });
  assert.deepEqual(noCaptured.result.aggregate.citations.assisted.recall, {
    numerator: 0,
    denominator: 1,
    value: '0.000000',
  });
  assert.equal(noCaptured.result.aggregate.citations.precisionDeltaPp, null);
  assert.equal(
    noCaptured.result.aggregate.citations.recallDeltaPp,
    '-100.000000',
  );
  const empty = successful(t, (x) => {
    x.cases.cases[0].reference.fields = [];
    x.cases.cases[0].reference.citations = [];
    for (const name of ['manual', 'assisted']) {
      x.runs[name].observations[0].fields = [];
      x.runs[name].observations[0].citations = [];
    }
  });
  assert.deepEqual(empty.result.cases[0].pairs.fields.exclusions, [
    'no_reference_fields',
  ]);
  assert.deepEqual(empty.result.cases[0].pairs.changes.exclusions, [
    'no_reference_fields',
  ]);
  assert.deepEqual(empty.result.aggregate.citations.assisted.precision, {
    numerator: 0,
    denominator: 0,
    value: null,
  });
  assert.deepEqual(empty.result.aggregate.citations.assisted.recall, {
    numerator: 0,
    denominator: 0,
    value: null,
  });
  assert.deepEqual(empty.result.aggregate.citations.assisted.exact, {
    numerator: 1,
    denominator: 1,
    value: '1.000000',
  });
  assert.equal(empty.result.cases[0].pairs.citations.exactDelta, 0);
});

test('rational rounding is half away from zero and differences use unrounded counts', (t) => {
  for (const [manual, assisted, expected] of [
    [200000000, 199999999, '0.000001'],
    [200000000, 200000001, '-0.000001'],
    [604800000, 604799999, '0.000000'],
  ]) {
    const { result } = successful(t, (x) => {
      x.runs.manual.observations[0].elapsedMs = manual;
      x.runs.assisted.observations[0].elapsedMs = assisted;
    });
    assert.equal(result.cases[0].pairs.time.reductionPercent, expected);
    assert.equal(result.aggregate.time.reductionPercent, expected);
  }
  const { result } = successful(t, (x) => {
    x.cases.cases[0].reference.fields = ['f1', 'f2', 'f3'].map((fieldId) => ({
      fieldId,
      state: 'confirmed',
      value: '20',
    }));
    for (const name of ['manual', 'assisted'])
      x.runs[name].observations[0].fields = ['f1', 'f2', 'f3'].map(
        (fieldId) => ({
          fieldId,
          initial: {
            state: 'confirmed',
            value:
              fieldId === 'f1' || (name === 'assisted' && fieldId === 'f2')
                ? '20'
                : '22',
          },
          final: { state: 'confirmed', value: '20' },
        }),
      );
  });
  assert.deepEqual(result.aggregate.fields.manual, {
    numerator: 1,
    denominator: 3,
    value: '0.333333',
  });
  assert.deepEqual(result.aggregate.fields.assisted, {
    numerator: 2,
    denominator: 3,
    value: '0.666667',
  });
  assert.equal(result.aggregate.fields.assistedMinusManualPp, '33.333333');
});

test('each metric compares only its own eligible same-case pairs and preserves marginal side results', (t) => {
  const { result } = successful(
    t,
    (x) => {
      x.cases.cases = x.cases.cases.filter((c) =>
        ['A', 'B', 'F'].includes(c.caseId),
      );
      for (const name of ['manual', 'assisted'])
        x.runs[name].observations = x.runs[name].observations.filter((o) =>
          ['A', 'B', 'F'].includes(o.caseId),
        );
      x.runs.manual.observations[0].fields = null;
      x.runs.manual.observations[1].fields[0].final = null;
      x.runs.manual.observations[1].citations = null;
    },
    'six',
  );
  assert.equal(result.aggregate.basePairCount, 3);
  assert.deepEqual(result.aggregate.time.pairedCaseIds, ['A', 'B']);
  assert.deepEqual(result.aggregate.fields.pairedCaseIds, ['B']);
  assert.deepEqual(result.aggregate.changes.pairedCaseIds, []);
  assert.deepEqual(result.aggregate.citations.pairedCaseIds, ['A']);
  assert.equal(result.aggregate.time.reductionPercent, '16.666667');
  assert.deepEqual(result.aggregate.fields.manual, {
    numerator: 1,
    denominator: 1,
    value: '1.000000',
  });
  assert.deepEqual(result.aggregate.fields.assisted, {
    numerator: 0,
    denominator: 1,
    value: '0.000000',
  });
  assert.equal(result.aggregate.fields.assistedMinusManualPp, '-100.000000');
  assert.deepEqual(result.aggregate.changes.manual, {
    numerator: 0,
    denominator: 0,
    value: null,
  });
  assert.deepEqual(result.aggregate.citations.manual.recall, {
    numerator: 1,
    denominator: 2,
    value: '0.500000',
  });
  assert.deepEqual(result.aggregate.citations.assisted.recall, {
    numerator: 2,
    denominator: 2,
    value: '1.000000',
  });
  assert.equal(result.aggregate.citations.precisionDeltaPp, '0.000000');
  assert.equal(result.aggregate.citations.recallDeltaPp, '50.000000');
  assert.equal(result.aggregate.citations.exactDeltaPp, '100.000000');
  assert.equal(result.cases[0].assisted.fields.initialCorrectCount, 2);
  for (const metric of Object.values(result.aggregate).filter(
    (value) => value?.pairedCaseIds,
  )) {
    assert.equal(metric.pairedCaseIds.length + metric.excluded.length, 3);
    assert.deepEqual(
      [
        ...metric.pairedCaseIds,
        ...metric.excluded.map((row) => row.caseId),
      ].sort(),
      ['A', 'B', 'F'],
    );
  }
});
