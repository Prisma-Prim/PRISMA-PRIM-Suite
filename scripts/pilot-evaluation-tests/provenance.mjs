import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  limitation,
  invoke,
  setup,
  diagnostic,
  successful,
} from './support.mjs';

test('same captured bytes at different fresh paths produce identical artifacts and truthful hashes', (t) => {
  const input = setup(t, 'six');
  const first = invoke(input.args);
  assert.equal(first.status, 0, first.stderr);
  const second = join(input.directory, 'second');
  const again = invoke([...input.args.slice(0, -1), second], { cwd: '/' });
  assert.equal(again.status, 0, again.stderr);
  assert.equal(first.stdout, again.stdout);
  for (const name of ['result.json', 'report.md']) {
    const bytes = readFileSync(join(input.output, name));
    assert.deepEqual(bytes, readFileSync(join(second, name)));
    assert.equal(bytes.includes(Buffer.from(input.directory)), false);
    assert.equal(bytes[bytes.length - 1], 10);
    assert.equal(bytes.includes(Buffer.from('\r')), false);
  }
  const resultBytes = readFileSync(join(input.output, 'result.json'), 'utf8');
  const result = JSON.parse(resultBytes);
  assert.deepEqual(Object.keys(result), [
    'schema',
    'evaluatorVersion',
    'evaluationId',
    'inputs',
    'caseSet',
    'runs',
    'cases',
    'aggregate',
  ]);
  assert.equal(result.schema, 'prisma-prim-pilot-result/v1');
  assert.equal(result.evaluatorVersion, '1.0.0');
  assert.equal(resultBytes, JSON.stringify(result, null, 2) + '\n');
  assert.deepEqual(result.inputs, {
    casesSha256: createHash('sha256').update(input.cases).digest('hex'),
    runsSha256: createHash('sha256').update(input.runs).digest('hex'),
  });
  const before = ['result.json', 'report.md'].map((name) =>
    readFileSync(join(input.output, name)),
  );
  diagnostic(invoke(input.args), 'E_OUTPUT_EXISTS', 'output');
  for (const [index, name] of ['result.json', 'report.md'].entries())
    assert.deepEqual(readFileSync(join(input.output, name)), before[index]);
  assert.deepEqual(readFileSync(input.casesPath), input.cases);
  assert.deepEqual(readFileSync(input.runsPath), input.runs);
});

test('permuting input arrays and object keys changes byte hashes while metrics and canonical order stay fixed', (t) => {
  const baseline = successful(t, undefined, 'six');
  const reordered = successful(
    t,
    (x) => {
      x.cases.cases.reverse();
      for (const c of x.cases.cases) {
        c.sources.reverse();
        c.sources.forEach((s) => s.locators.reverse());
        c.reference.fields.reverse();
        c.reference.citations?.reverse();
      }
      for (const name of ['manual', 'assisted']) {
        x.runs[name].observations.reverse();
        for (const o of x.runs[name].observations) {
          o.fields?.reverse();
          o.citations?.reverse();
        }
        x.runs[name] = Object.fromEntries(
          Object.entries(x.runs[name]).reverse(),
        );
      }
      x.cases.scope = Object.fromEntries(
        Object.entries(x.cases.scope).reverse(),
      );
      x.cases.protocol = Object.fromEntries(
        Object.entries(x.cases.protocol).reverse(),
      );
    },
    'six',
  );
  assert.notEqual(
    reordered.result.inputs.casesSha256,
    baseline.result.inputs.casesSha256,
  );
  assert.notEqual(
    reordered.result.inputs.runsSha256,
    baseline.result.inputs.runsSha256,
  );
  assert.deepEqual(reordered.result.cases, baseline.result.cases);
  assert.deepEqual(reordered.result.aggregate, baseline.result.aggregate);
  const withoutHashes = (result) => ({
    ...result,
    inputs: { casesSha256: 'CASES-HASH', runsSha256: 'RUNS-HASH' },
  });
  assert.equal(
    JSON.stringify(withoutHashes(reordered.result)),
    JSON.stringify(withoutHashes(baseline.result)),
  );
  const neutralReport = (report) =>
    report.replace(/[a-f0-9]{64}/g, 'BYTE-HASH');
  assert.equal(neutralReport(reordered.report), neutralReport(baseline.report));
});

test('citation order uses numeric Versions and Unicode code points while fields use ASCII IDs', (t) => {
  const { result } = successful(t, (x) => {
    const c = x.cases.cases[0];
    c.sources = [10, 2, 1].map((sourceVersion) => ({
      sourceId: 'DOC-A',
      sourceVersion,
      sha256: 'a'.repeat(64),
      locators: ['😀', '\ue000', 'a'],
    }));
    c.reference.citations = c.sources.flatMap((s) =>
      s.locators.map((locator) => ({
        sourceId: s.sourceId,
        sourceVersion: s.sourceVersion,
        locator,
      })),
    );
    c.reference.fields = ['b', 'a', 'A'].map((fieldId) => ({
      fieldId,
      state: 'confirmed',
      value: '20',
    }));
    for (const name of ['manual', 'assisted']) {
      x.runs[name].observations[0].citations = structuredClone(
        c.reference.citations,
      );
      x.runs[name].observations[0].fields = c.reference.fields.map(
        ({ fieldId, state, value }) => ({
          fieldId,
          initial: { state, value },
          final: null,
        }),
      );
    }
  });
  assert.deepEqual(
    result.cases[0].manual.citations.observed.map((c) => [
      c.sourceVersion,
      c.locator,
    ]),
    [
      [1, 'a'],
      [1, '\ue000'],
      [1, '😀'],
      [2, 'a'],
      [2, '\ue000'],
      [2, '😀'],
      [10, 'a'],
      [10, '\ue000'],
      [10, '😀'],
    ],
  );
  assert.deepEqual(
    result.cases[0].manual.fields.details.map((f) => f.fieldId),
    ['A', 'a', 'b'],
  );
});

test('metadata remains literal and confidential field values never enter report or console', (t) => {
  const { input, result, report } = successful(t, (x) => {
    x.cases.dataKind = 'anonymized_declared';
    x.cases.cases[0].caseId = 'www.untrusted.test';
    x.runs.manual.observations[0].caseId = 'www.untrusted.test';
    x.runs.assisted.observations[0].caseId = 'www.untrusted.test';
    x.cases.protocol.task =
      '[link](https://untrusted.test) <script>BAD</script> `code` **bold** www.untrusted.test person@untrusted.test';
    x.runs.manual.captureEvidenceRef =
      '<https://untrusted.test> & ![image](https://untrusted.test)';
    x.cases.cases[0].reference.fields[0].value = 'PRIVATE-FIELD-DO-NOT-ECHO';
    x.runs.manual.observations[0].fields[0].initial.value =
      'PRIVATE-INITIAL-DO-NOT-ECHO';
  });
  assert.ok(
    report.includes(
      'DECLARED ANONYMIZED OBSERVATIONS — not independently verified',
    ),
  );
  assert.ok(report.includes(limitation));
  for (const raw of [
    '<script>',
    '<https:',
    'https://untrusted.test',
    'www.untrusted.test',
    'person@untrusted.test',
    '**bold**',
    '`code`',
    'PRIVATE-FIELD-DO-NOT-ECHO',
    'PRIVATE-INITIAL-DO-NOT-ECHO',
  ])
    assert.ok(!report.includes(raw), raw);
  assert.ok(!JSON.stringify(result).includes('PRIVATE-FIELD-DO-NOT-ECHO'));
  assert.ok(!JSON.stringify(result).includes('PRIVATE-INITIAL-DO-NOT-ECHO'));
  const unchanged = readFileSync(input.runsPath);
  diagnostic(invoke(input.args), 'E_OUTPUT_EXISTS', 'output');
  assert.deepEqual(readFileSync(input.runsPath), unchanged);
});
