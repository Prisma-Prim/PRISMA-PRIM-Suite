import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { containerBytes } from '../pilot-evaluation/container.mjs';
import { artifactBytes } from '../pilot-evaluation/files.mjs';
import { fixtures, invoke, readContainer, setup } from './support.mjs';

function inspectRaw(bytes, payloads) {
  let offset = 0;
  for (const name of ['result.json', 'report.md']) {
    const header = bytes.subarray(offset, offset + 512),
      payload = payloads[name];
    assert.equal(
      header.subarray(0, 100).toString('ascii'),
      name + '\0'.repeat(100 - name.length),
    );
    for (const [start, end, text] of [
      [100, 108, '0000600\0'],
      [108, 116, '0000000\0'],
      [116, 124, '0000000\0'],
      [136, 148, '00000000000\0'],
      [156, 157, '0'],
      [257, 263, 'ustar\0'],
      [263, 265, '00'],
      [329, 337, '0000000\0'],
      [337, 345, '0000000\0'],
    ])
      assert.equal(header.subarray(start, end).toString('ascii'), text);
    assert.match(header.subarray(124, 136).toString('ascii'), /^[0-7]{11}\0$/);
    assert.equal(
      parseInt(header.subarray(124, 135).toString('ascii'), 8),
      payload.length,
    );
    assert.match(header.subarray(148, 156).toString('ascii'), /^[0-7]{6}\0 $/);
    let checksum = 0;
    for (let index = 0; index < 512; index++)
      checksum += index >= 148 && index < 156 ? 32 : header[index];
    assert.equal(
      parseInt(header.subarray(148, 154).toString('ascii'), 8),
      checksum,
    );
    for (const [start, end] of [
      [157, 257],
      [265, 329],
      [345, 512],
    ])
      assert.ok(header.subarray(start, end).every((byte) => byte === 0));
    assert.deepEqual(
      bytes.subarray(offset + 512, offset + 512 + payload.length),
      payload,
    );
    const next = offset + 512 + Math.ceil(payload.length / 512) * 512;
    assert.ok(
      bytes
        .subarray(offset + 512 + payload.length, next)
        .every((byte) => byte === 0),
    );
    offset = next;
  }
  assert.equal(bytes.length, offset + 1024);
  assert.ok(bytes.subarray(offset).every((byte) => byte === 0));
}

test('actual complete one/six/empty outputs have exact USTAR headers, checksums, padding and end blocks', (t) => {
  for (const name of ['one', 'six', 'empty']) {
    const input = setup(t, name);
    const child = invoke(input.args);
    assert.equal(child.status, 0, child.stderr);
    const payloads = readContainer(input.output);
    inspectRaw(readFileSync(input.output), payloads);
    for (const bytes of Object.values(payloads)) {
      assert.ok(bytes.length > 0);
      assert.equal(bytes.at(-1), 10);
      assert.equal(bytes.includes(13), false);
      assert.equal(
        new TextDecoder('utf8', { fatal: true }).decode(bytes),
        bytes.toString('utf8'),
      );
    }
    const result = JSON.parse(payloads['result.json']);
    assert.deepEqual(
      payloads['result.json'],
      Buffer.from(JSON.stringify(result, null, 2) + '\n'),
    );
    assert.deepEqual(result.inputs, {
      casesSha256: createHash('sha256').update(input.cases).digest('hex'),
      runsSha256: createHash('sha256').update(input.runs).digest('hex'),
    });
    const before = readFileSync(input.output);
    const other = input.output + '.second';
    assert.equal(invoke([...input.args.slice(0, -1), other]).status, 0);
    assert.deepEqual(readFileSync(other), before);
  }
});

test('independent standard reader sees the complete expected one-case payload and neutral metadata', (t) => {
  const input = setup(t);
  assert.equal(invoke(input.args).status, 0);
  const payloads = readContainer(input.output);
  // Closed input fixture metadata is deliberately copied; every computed row is
  // independently literal. Whole payload equality checks all keys and ordering.
  const cases = JSON.parse(readFileSync(new URL('one.cases.json', fixtures)));
  const runs = JSON.parse(readFileSync(new URL('one.runs.json', fixtures)));
  const identity = {
    caseVersion: 1,
    sourceSetId: 'S-A',
    sourceSetVersion: 1,
    referenceId: 'R-A',
    referenceVersion: 1,
  };
  const citations = {
    expected: [{ sourceId: 'DOC-A', sourceVersion: 1, locator: 'p1' }],
    observed: [{ sourceId: 'DOC-A', sourceVersion: 1, locator: 'p1' }],
    matched: [{ sourceId: 'DOC-A', sourceVersion: 1, locator: 'p1' }],
    missing: [],
    unexpected: [],
    unresolved: [],
  };
  const rate = { numerator: 1, denominator: 1, value: '1.000000' };
  const side = (elapsedMs, initialCorrectCount, changedCount) => ({
    declaredIdentity: identity,
    status: 'completed',
    elapsedMs,
    identityMismatches: [],
    fields: {
      expectedCount: 1,
      initialCorrectCount,
      reviewedCount: 1,
      finalCorrectCount: 1,
      changedCount,
      details: [
        {
          fieldId: 'employees',
          present: true,
          initialMatches: initialCorrectCount === 1,
          finalMatches: true,
          changed: changedCount === 1,
        },
      ],
    },
    citations,
  });
  const row = {
    caseId: 'A',
    referenceIdentity: identity,
    manual: side(60000, 0, 1),
    assisted: side(30000, 1, 0),
    pairs: {
      time: {
        exclusions: [],
        manualMs: 60000,
        assistedMs: 30000,
        reductionPercent: '50.000000',
      },
      fields: {
        exclusions: [],
        manual: { numerator: 0, denominator: 1, value: '0.000000' },
        assisted: rate,
        assistedMinusManualPp: '100.000000',
      },
      changes: {
        exclusions: [],
        manual: rate,
        assisted: { numerator: 0, denominator: 1, value: '0.000000' },
        assistedMinusManualPp: '-100.000000',
      },
      citations: {
        exclusions: [],
        manual: { precision: rate, recall: rate, exact: true },
        assisted: { precision: rate, recall: rate, exact: true },
        precisionDeltaPp: '0.000000',
        recallDeltaPp: '0.000000',
        exactDelta: 0,
      },
    },
  };
  const { observations: manualObservations, ...manual } = runs.manual;
  const { observations: assistedObservations, ...assisted } = runs.assisted;
  assert.equal(manualObservations.length, 1);
  assert.equal(assistedObservations.length, 1);
  // Aggregate has its separate full literal oracle in oracles.mjs.
  const expected = {
    schema: 'prisma-prim-pilot-result/v1',
    evaluatorVersion: '2.0.0',
    evaluationId: 'DEMO-ONE',
    inputs: {
      casesSha256: createHash('sha256').update(input.cases).digest('hex'),
      runsSha256: createHash('sha256').update(input.runs).digest('hex'),
    },
    caseSet: {
      caseSetId: 'DEMO-ONE',
      caseSetVersion: 1,
      dataKind: 'synthetic',
      scope: cases.scope,
      protocol: cases.protocol,
    },
    runs: { manual, assisted },
    cases: [row],
    aggregate: JSON.parse(readFileSync(new URL('one.expected.json', fixtures))),
  };
  assert.deepEqual(
    payloads['result.json'],
    Buffer.from(JSON.stringify(expected, null, 2) + '\n'),
  );
  assert.ok(
    payloads['report.md']
      .toString('utf8')
      .includes(
        'Manual fields: initial 0/1; review coverage 1/1; final correctness 1/1; changed 1/1.',
      ),
  );
});

test('private container-only literal limits supplement rather than replace valid evaluation payloads', () => {
  const empty = containerBytes(Buffer.alloc(0), Buffer.alloc(0));
  assert.equal(empty.length, 2048);
  inspectRaw(empty, {
    'result.json': Buffer.alloc(0),
    'report.md': Buffer.alloc(0),
  });
  const a = Buffer.alloc(16777216, 0x61),
    b = Buffer.alloc(16777216, 0x62);
  const max = containerBytes(a, b);
  assert.equal(max.length, 33556480);
  inspectRaw(max, { 'result.json': a, 'report.md': b });
  for (const [left, right] of [
    [Buffer.alloc(16777217), b],
    [a, Buffer.alloc(16777217)],
  ])
    assert.throws(
      () => containerBytes(left, right),
      (error) => error.code === 'E_OUTPUT_LIMIT',
    );
  assert.equal(artifactBytes('a'.repeat(16777216)).length, 16777216);
  assert.throws(
    () => artifactBytes('a'.repeat(16777217)),
    (error) => error.code === 'E_OUTPUT_LIMIT',
  );
  const unicode = '😀'.repeat(4194304);
  assert.equal(artifactBytes(unicode).length, 16777216);
  assert.throws(
    () => artifactBytes(unicode + 'a'),
    (error) => error.code === 'E_OUTPUT_LIMIT',
  );
});
