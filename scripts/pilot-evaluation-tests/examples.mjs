import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixtures, receipt, limitation, invoke, setup } from './support.mjs';

test('help works without input files and explains the declared offline boundary', () => {
  const execution = invoke(['--help']);
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stderr, '');
  for (const text of [
    'Examples:',
    'node scripts/pilot-evaluation.mjs --help',
    '--cases /tmp/pilot/cases.json --runs /tmp/pilot/runs.json --output /tmp/pilot/result-001',
    'prisma-prim-pilot-cases/v1',
    'prisma-prim-pilot-runs/v1',
    '1048576',
    '16777216',
    '12',
    'Exit codes:',
    'synthetic',
    'declared',
    'unverified',
    '0700',
    '0600',
    '604800000',
    '1000000',
    '256',
    '1000',
    'declared_inputs_unverified',
    'prisma-prim-pilot-result/v1',
  ])
    assert.ok(execution.stdout.includes(text), text);
});

test('one synthetic case produces the independently authored section17.9 literals', (t) => {
  const input = setup(t);
  const execution = invoke(input.args);
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stderr, '');
  assert.equal(execution.stdout, receipt);
  const result = JSON.parse(readFileSync(join(input.output, 'result.json')));
  assert.deepEqual(result.aggregate, {
    declaredCasesCount: 1,
    basePairCount: 1,
    time: {
      pairedCaseIds: ['A'],
      excluded: [],
      manualMs: 60000,
      assistedMs: 30000,
      reductionPercent: '50.000000',
    },
    fields: {
      pairedCaseIds: ['A'],
      excluded: [],
      manual: { numerator: 0, denominator: 1, value: '0.000000' },
      assisted: { numerator: 1, denominator: 1, value: '1.000000' },
      assistedMinusManualPp: '100.000000',
    },
    changes: {
      pairedCaseIds: ['A'],
      excluded: [],
      manual: { numerator: 1, denominator: 1, value: '1.000000' },
      assisted: { numerator: 0, denominator: 1, value: '0.000000' },
      assistedMinusManualPp: '-100.000000',
    },
    citations: {
      pairedCaseIds: ['A'],
      excluded: [],
      manual: {
        precision: { numerator: 1, denominator: 1, value: '1.000000' },
        recall: { numerator: 1, denominator: 1, value: '1.000000' },
        exact: { numerator: 1, denominator: 1, value: '1.000000' },
      },
      assisted: {
        precision: { numerator: 1, denominator: 1, value: '1.000000' },
        recall: { numerator: 1, denominator: 1, value: '1.000000' },
        exact: { numerator: 1, denominator: 1, value: '1.000000' },
      },
      precisionDeltaPp: '0.000000',
      recallDeltaPp: '0.000000',
      exactDeltaPp: '0.000000',
    },
  });
  assert.deepEqual(result.cases[0].manual.fields, {
    expectedCount: 1,
    initialCorrectCount: 0,
    reviewedCount: 1,
    finalCorrectCount: 1,
    changedCount: 1,
    details: [
      {
        fieldId: 'employees',
        present: true,
        initialMatches: false,
        finalMatches: true,
        changed: true,
      },
    ],
  });
  const report = readFileSync(join(input.output, 'report.md'), 'utf8');
  assert.ok(report.includes('SYNTHETIC — mechanics demonstration'));
  assert.ok(report.includes(limitation));
  assert.ok(report.includes('60000 → 30000 ms'));
  assert.ok(report.includes('50.000000%'));
  assert.deepEqual(readFileSync(input.casesPath), input.cases);
  assert.deepEqual(readFileSync(input.runsPath), input.runs);
});

test('six authored cases preserve slower, missing, failed, incompatible and zero observations', (t) => {
  const input = setup(t, 'six');
  const execution = invoke(input.args);
  assert.equal(execution.status, 0, execution.stderr);
  const result = JSON.parse(readFileSync(join(input.output, 'result.json')));
  assert.deepEqual(
    result.aggregate,
    JSON.parse(readFileSync(new URL('six.expected.json', fixtures))),
  );
  assert.deepEqual(
    result.cases.map((row) => [
      row.caseId,
      row.manual?.status,
      row.assisted?.status,
      row.assisted?.identityMismatches,
      row.pairs.time.reductionPercent,
    ]),
    [
      ['A', 'completed', 'completed', [], '50.000000'],
      ['B', 'completed', 'completed', [], '-50.000000'],
      ['C', 'completed', undefined, undefined, null],
      ['D', 'completed', 'failed', [], null],
      ['E', 'completed', 'completed', ['referenceVersion'], null],
      ['F', 'completed', 'completed', [], null],
    ],
  );
  assert.deepEqual(result.cases[1].assisted.citations, {
    expected: [{ sourceId: 'DOC-B', sourceVersion: 1, locator: 'p1' }],
    observed: [{ sourceId: 'DOC-B', sourceVersion: 2, locator: 'p1' }],
    matched: [],
    missing: [{ sourceId: 'DOC-B', sourceVersion: 1, locator: 'p1' }],
    unexpected: [{ sourceId: 'DOC-B', sourceVersion: 2, locator: 'p1' }],
    unresolved: [],
  });
  const report = readFileSync(join(input.output, 'report.md'), 'utf8');
  for (const text of [
    'DEMO-SIX',
    'M-SIX',
    'A-SIX',
    'P-DEMO',
    'MANUAL-DEMO',
    'ASSISTED-DEMO',
    '90000 → 75000 ms',
    '16.666667%',
    '-33.333333',
    '2/3',
    '1/3',
    'missing_assisted',
    'failed_assisted',
    'incompatible_assisted',
    'zero_time_manual',
  ]) {
    assert.ok(report.includes(text), text);
  }
  for (const id of ['A', 'B', 'C', 'D', 'E', 'F'])
    assert.ok(report.includes(`Case ${id}`));
});

test('result objects expose exactly the closed v1 metadata and ledger keys', (t) => {
  const input = setup(t);
  const execution = invoke(input.args);
  assert.equal(execution.status, 0, execution.stderr);
  const result = JSON.parse(readFileSync(join(input.output, 'result.json')));
  const keys = (value, expected) =>
    assert.deepEqual(Object.keys(value), expected);
  keys(result.inputs, ['casesSha256', 'runsSha256']);
  keys(result.caseSet, [
    'caseSetId',
    'caseSetVersion',
    'dataKind',
    'scope',
    'protocol',
  ]);
  keys(result.caseSet.scope, ['workspaceRef', 'companyRef']);
  keys(result.caseSet.protocol, [
    'protocolId',
    'protocolVersion',
    'task',
    'timingRule',
  ]);
  keys(result.runs, ['manual', 'assisted']);
  for (const run of Object.values(result.runs))
    keys(run, [
      'runId',
      'mode',
      'methodId',
      'methodVersion',
      'operatorRef',
      'recordedBy',
      'capturedAt',
      'captureEvidenceRef',
      'reviewerRef',
      'reviewedAt',
    ]);
  const row = result.cases[0];
  keys(row, ['caseId', 'referenceIdentity', 'manual', 'assisted', 'pairs']);
  keys(row.referenceIdentity, [
    'caseVersion',
    'sourceSetId',
    'sourceSetVersion',
    'referenceId',
    'referenceVersion',
  ]);
  for (const side of [row.manual, row.assisted]) {
    keys(side, [
      'declaredIdentity',
      'status',
      'elapsedMs',
      'identityMismatches',
      'fields',
      'citations',
    ]);
    keys(side.declaredIdentity, [
      'caseVersion',
      'sourceSetId',
      'sourceSetVersion',
      'referenceId',
      'referenceVersion',
    ]);
    keys(side.fields, [
      'expectedCount',
      'initialCorrectCount',
      'reviewedCount',
      'finalCorrectCount',
      'changedCount',
      'details',
    ]);
    keys(side.fields.details[0], [
      'fieldId',
      'present',
      'initialMatches',
      'finalMatches',
      'changed',
    ]);
    keys(side.citations, [
      'expected',
      'observed',
      'matched',
      'missing',
      'unexpected',
      'unresolved',
    ]);
    keys(side.citations.expected[0], ['sourceId', 'sourceVersion', 'locator']);
  }
  keys(row.pairs, ['time', 'fields', 'changes', 'citations']);
  keys(row.pairs.time, [
    'exclusions',
    'manualMs',
    'assistedMs',
    'reductionPercent',
  ]);
  for (const metric of [row.pairs.fields, row.pairs.changes]) {
    keys(metric, ['exclusions', 'manual', 'assisted', 'assistedMinusManualPp']);
    keys(metric.manual, ['numerator', 'denominator', 'value']);
  }
  keys(row.pairs.citations, [
    'exclusions',
    'manual',
    'assisted',
    'precisionDeltaPp',
    'recallDeltaPp',
    'exactDelta',
  ]);
  keys(row.pairs.citations.manual, ['precision', 'recall', 'exact']);
  keys(result.aggregate, [
    'declaredCasesCount',
    'basePairCount',
    'time',
    'fields',
    'changes',
    'citations',
  ]);
  keys(result.aggregate.time, [
    'pairedCaseIds',
    'excluded',
    'manualMs',
    'assistedMs',
    'reductionPercent',
  ]);
  for (const metric of [result.aggregate.fields, result.aggregate.changes])
    keys(metric, [
      'pairedCaseIds',
      'excluded',
      'manual',
      'assisted',
      'assistedMinusManualPp',
    ]);
  keys(result.aggregate.citations, [
    'pairedCaseIds',
    'excluded',
    'manual',
    'assisted',
    'precisionDeltaPp',
    'recallDeltaPp',
    'exactDeltaPp',
  ]);
});
