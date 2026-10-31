import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  fixtures,
  limitation,
  successful,
  invoke,
  setup,
  preload,
} from './support.mjs';

// Independent literal expectations transcribed from approved §17.9. No evaluator
// import or generated golden output supplies numeric truth.
test('one-case literals cover all metrics, final correctness and technical report', (t) => {
  const { result, report } = successful(t);
  assert.equal(result.evaluatorVersion, '2.0.0');
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
  assert.deepEqual(result.cases[0].assisted.fields, {
    expectedCount: 1,
    initialCorrectCount: 1,
    reviewedCount: 1,
    finalCorrectCount: 1,
    changedCount: 0,
    details: [
      {
        fieldId: 'employees',
        present: true,
        initialMatches: true,
        finalMatches: true,
        changed: false,
      },
    ],
  });
  for (const text of [
    'SYNTHETIC — mechanics demonstration',
    limitation,
    '60000 → 30000 ms',
    '50.000000%',
    'manual 0/1',
    'assisted 1/1',
    '-100.000000 percentage points',
  ])
    assert.ok(report.includes(text), text);
});

test('six-case literal oracle preserves all four complete partitions and every declared case', (t) => {
  const { result, report } = successful(t, undefined, 'six');
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
  for (const metric of ['time', 'fields', 'changes', 'citations']) {
    const value = result.aggregate[metric];
    assert.deepEqual(
      [...value.pairedCaseIds, ...value.excluded.map((x) => x.caseId)].sort(),
      ['A', 'B', 'C', 'D', 'E', 'F'],
    );
    for (const row of result.cases)
      assert.deepEqual(
        value.excluded.find((x) => x.caseId === row.caseId)?.reasons ?? [],
        row.pairs[metric].exclusions,
      );
  }
  for (const text of [
    'DEMO-SIX',
    'M-SIX',
    'A-SIX',
    'P-DEMO',
    'MANUAL-DEMO',
    'ASSISTED-DEMO',
    '90000 → 75000 ms',
    '16.666667%',
    '-50.000000%',
    '-33.333333',
    '2/3',
    '1/3',
    'missing_assisted',
    'failed_assisted',
    'incompatible_assisted',
    'zero_time_manual',
  ])
    assert.ok(report.includes(text), text);
});

test('help is file-free, noninteractive and describes v2 completion and bounds', (t) => {
  const input = setup(t);
  const nodeArgs = preload(
    input,
    `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module'; const read=fs.readFileSync; fs.readFileSync=(path,...args)=>{if(String(path).endsWith('.mjs')) return read(path,...args); throw new Error('Data file access forbidden');}; for(const name of ['openSync','lstatSync','accessSync','writeFileSync']) {const original=fs[name];fs[name]=(path,...args)=>{if(String(path).endsWith('.mjs'))return original(path,...args);throw new Error('Data file access forbidden');};} syncBuiltinESMExports();`,
  );
  const child = invoke(['--help'], { nodeArgs });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, '');
  for (const text of [
    'Examples:',
    '--output /tmp/pilot/result-001.tar',
    'prisma-prim-pilot-receipt/v2',
    'ustar',
    '1048576',
    '16777216',
    '33556480',
    '0600',
    '12',
    'Exit codes:',
    'declared_inputs_unverified',
    'no independent measurement',
    'close',
    'fresh path',
  ])
    assert.ok(child.stdout.toLowerCase().includes(text.toLowerCase()), text);
});
