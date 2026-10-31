import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import {
  invoke,
  member,
  setup,
  diagnostic,
  fixtureObjects,
  writeInputs,
  successful,
  at,
} from './support.mjs';

test('closed noninteractive arguments fail immediately with one safe repair diagnostic', (t) => {
  const input = setup(t);
  for (const args of [
    [],
    ['--help', '--cases', 'x'],
    ['--help', '--help'],
    ['--unknown'],
    ['--cases'],
    ['--cases', '', '--runs', 'x', '--output', 'y'],
    [...input.args, 'stray'],
    [...input.args, '--cases', input.casesPath],
    ['--cases', '-', '--runs', 'x', '--output', 'y'],
    ['--cases', 'https://example.test/a', '--runs', 'x', '--output', 'y'],
    ['--cases', '*.json', '--runs', 'x', '--output', 'y'],
  ]) {
    diagnostic(invoke(args), 'E_ARGUMENT', 'arguments');
    assert.equal(existsSync(input.output), false);
  }
});

test('closed schemas reject invalid declarations without leaking raw values or creating output', (t) => {
  const input = setup(t);
  const mutations = [
    [
      'cases',
      '',
      (x) => {
        x.cases.SECRET_UNTRUSTED_KEY = 'SENSITIVE';
      },
    ],
    [
      'cases',
      '/schema',
      (x) => {
        x.cases.schema = 'prisma-prim-pilot-cases/v2';
      },
    ],
    [
      'cases',
      '/scope',
      (x) => {
        x.cases.scope.extra = 'SENSITIVE';
      },
    ],
    [
      'cases',
      '/caseSetVersion',
      (x) => {
        x.cases.caseSetVersion = '1';
      },
    ],
    [
      'cases',
      '/cases/0/reference/fields/0/value',
      (x) => {
        x.cases.cases[0].reference.fields[0].value = '';
      },
    ],
    [
      'runs',
      '/manual/observations/0/elapsedMs',
      (x) => {
        x.runs.manual.observations[0].elapsedMs = -1;
      },
    ],
    [
      'runs',
      '/manual/observations/0/elapsedMs',
      (x) => {
        x.runs.manual.observations[0].elapsedMs = 0.1;
      },
    ],
    [
      'runs',
      '/manual/observations/0/elapsedMs',
      (x) => {
        x.runs.manual.observations[0].elapsedMs = '60';
      },
    ],
    [
      'runs',
      '/manual/observations/0/elapsedMs',
      (x) => {
        x.runs.manual.observations[0].elapsedMs = 604800001;
      },
    ],
  ];
  for (const [side, location, mutate] of mutations) {
    const values = fixtureObjects(input);
    mutate(values);
    writeInputs(input, values);
    const execution = invoke(input.args);
    diagnostic(execution, 'E_SCHEMA', side, location);
    assert.equal(existsSync(input.output), false);
    assert.ok(!execution.stderr.includes('SECRET_UNTRUSTED_KEY'));
    assert.ok(!execution.stderr.includes('SENSITIVE'));
  }
});

test('captured bytes reject malformed Unicode, JSON, duplicate keys and deep containers before schema validation', (t) => {
  const input = setup(t);
  for (const [bytes, code] of [
    [Buffer.from([0xc3, 0x28]), 'E_JSON'],
    [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), input.cases]), 'E_JSON'],
    [Buffer.from('{'), 'E_JSON'],
    [Buffer.from('{"schema":1,"schema":2}'), 'E_DUPLICATE'],
    [Buffer.from('{"schema":1,"sch\\u0065ma":2}'), 'E_DUPLICATE'],
    [
      Buffer.from('{"nested":' + '['.repeat(12) + '0' + ']'.repeat(12) + '}'),
      'E_INPUT_LIMIT',
    ],
    [
      Buffer.from('{"nested":' + '['.repeat(11) + '0' + ']'.repeat(11) + '}'),
      'E_SCHEMA',
    ],
  ]) {
    writeFileSync(input.casesPath, bytes);
    const execution = invoke(input.args);
    diagnostic(
      execution,
      code,
      'cases',
      code === 'E_SCHEMA' ? '/schema' : null,
    );
    assert.equal(existsSync(input.output), false);
  }
});

test('case and run references fail closed while captured incompatible observations remain valid', (t) => {
  const input = setup(t);
  for (const [code, side, location, mutate] of [
    [
      'E_REFERENCE',
      'cases',
      '/cases/0/reference/citations/0',
      (x) => {
        x.cases.cases[0].reference.citations[0].sourceVersion = 2;
      },
    ],
    [
      'E_DUPLICATE',
      'cases',
      '/cases/0/sources/1',
      (x) => {
        x.cases.cases[0].sources.push(x.cases.cases[0].sources[0]);
      },
    ],
    [
      'E_DUPLICATE',
      'cases',
      '/cases/0/reference/fields/1/fieldId',
      (x) => {
        x.cases.cases[0].reference.fields.push(
          x.cases.cases[0].reference.fields[0],
        );
      },
    ],
    [
      'E_REFERENCE',
      'runs',
      '/caseSetVersion',
      (x) => {
        x.runs.caseSetVersion = 2;
      },
    ],
    [
      'E_DUPLICATE',
      'runs',
      '/assisted/runId',
      (x) => {
        x.runs.assisted.runId = x.runs.manual.runId;
      },
    ],
    [
      'E_REFERENCE',
      'runs',
      '/manual/observations/0/caseId',
      (x) => {
        x.runs.manual.observations[0].caseId = 'UNKNOWN';
      },
    ],
    [
      'E_REFERENCE',
      'runs',
      '/manual/observations/0/fields/0/fieldId',
      (x) => {
        x.runs.manual.observations[0].fields[0].fieldId = 'HISTORICAL';
      },
    ],
  ]) {
    const values = fixtureObjects(input);
    mutate(values);
    writeInputs(input, values);
    diagnostic(invoke(input.args), code, side, location);
    assert.equal(existsSync(input.output), false);
  }
  const values = fixtureObjects(input);
  values.runs.manual.observations[0].referenceVersion = 2;
  values.runs.manual.observations[0].fields[0].fieldId = 'HISTORICAL';
  writeInputs(input, values);
  const execution = invoke(input.args);
  assert.equal(execution.status, 0, execution.stderr);
  const result = JSON.parse(member(input.output, 'result.json'));
  assert.deepEqual(result.cases[0].manual.identityMismatches, [
    'referenceVersion',
  ]);
  assert.equal(result.cases[0].manual.fields, null);
  for (const metric of Object.values(result.cases[0].pairs))
    assert.deepEqual(metric.exclusions, ['incompatible_manual']);
});

test('every closed object requires every property and rejects unknown keys at its containing pointer', (t) => {
  const input = setup(t);
  const objects = [
    ['cases', ''],
    ['cases', '/scope'],
    ['cases', '/protocol'],
    ['cases', '/cases/0'],
    ['cases', '/cases/0/sources/0'],
    ['cases', '/cases/0/reference'],
    ['cases', '/cases/0/reference/fields/0'],
    ['cases', '/cases/0/reference/citations/0'],
    ['runs', ''],
    ['runs', '/manual'],
    ['runs', '/assisted'],
    ['runs', '/manual/observations/0'],
    ['runs', '/manual/observations/0/fields/0'],
    ['runs', '/manual/observations/0/fields/0/initial'],
    ['runs', '/manual/observations/0/fields/0/final'],
    ['runs', '/manual/observations/0/citations/0'],
  ];
  for (const [file, pointer] of objects) {
    const values = fixtureObjects(input);
    at(values[file], pointer)['UNTRUSTED/SECRET~KEY'] = 'DO-NOT-ECHO';
    writeInputs(input, values);
    const execution = invoke(input.args);
    diagnostic(execution, 'E_SCHEMA', file, pointer);
    assert.ok(!execution.stderr.includes('UNTRUSTED'));
    assert.ok(!execution.stderr.includes('DO-NOT-ECHO'));
    const original = at(fixtureObjects(input)[file], pointer);
    for (const key of Object.keys(original)) {
      const missing = fixtureObjects(input);
      delete at(missing[file], pointer)[key];
      writeInputs(input, missing);
      diagnostic(invoke(input.args), 'E_SCHEMA', file, `${pointer}/${key}`);
    }
  }
});

test('invalid primitive types, timestamps, states and metadata fail without coercion', (t) => {
  const input = setup(t);
  const invalid = [
    ['cases', '/caseSetId', ['a'.repeat(65), '1BAD', 'é', '', null, 1]],
    ['cases', '/caseSetVersion', [0, 1000001, 1.1, null, '1']],
    ['cases', '/dataKind', ['real', null]],
    ['cases', '/scope', [null, [], 'W']],
    [
      'cases',
      '/protocol/task',
      ['', 'x'.repeat(1001), 'bad\ntext', 'bad\u007ftext', '\ud800'],
    ],
    ['cases', '/protocol/timingRule', ['elapsed_seconds']],
    ['cases', '/cases/0/language', ['fr', null]],
    [
      'cases',
      '/cases/0/sources/0/sha256',
      ['A'.repeat(64), 'a'.repeat(63), null],
    ],
    [
      'cases',
      '/cases/0/reference/preparedAt',
      [
        '2026-02-29T00:00:00.000Z',
        '2026-04-31T00:00:00.000Z',
        '2026-01-01T24:00:00.000Z',
        '2026-01-01T00:00:60.000Z',
        '2026-01-01T00:00:00Z',
        '2026-01-01T00:00:00.000+00:00',
      ],
    ],
    [
      'cases',
      '/cases/0/reference/preparationEvidenceRef',
      ['', 'x'.repeat(257), '\udfff'],
    ],
    ['cases', '/cases/0/reference/fields/0/state', ['approved', null]],
    ['cases', '/cases/0/reference/fields/0/value', [20, false, null]],
    ['runs', '/schema', ['prisma-prim-pilot-runs/v2']],
    ['runs', '/manual/mode', ['assisted']],
    ['runs', '/assisted/mode', ['manual']],
    ['runs', '/manual/observations/0/status', ['success']],
    ['runs', '/manual/observations/0/fields', [false, {}]],
    ['runs', '/manual/observations/0/fields/0/final', [true, []]],
  ];
  for (const [file, pointer, wrongValues] of invalid)
    for (const wrong of wrongValues) {
      const values = fixtureObjects(input);
      const parts = pointer.split('/');
      const key = parts.pop();
      at(values[file], parts.join('/'))[key] = wrong;
      writeInputs(input, values);
      diagnostic(invoke(input.args), 'E_SCHEMA', file, pointer);
      assert.equal(existsSync(input.output), false);
    }
  for (const state of ['missing', 'contradictory']) {
    const values = fixtureObjects(input);
    values.cases.cases[0].reference.fields[0].state = state;
    writeInputs(input, values);
    diagnostic(
      invoke(input.args),
      'E_SCHEMA',
      'cases',
      '/cases/0/reference/fields/0/value',
    );
  }
});

test('review metadata and failed/not_run state constraints cannot be bypassed', (t) => {
  const input = setup(t);
  for (const [location, mutate] of [
    [
      '/manual/reviewerRef',
      (x) => {
        x.runs.manual.reviewerRef = null;
      },
    ],
    [
      '/manual/reviewerRef',
      (x) => {
        x.runs.manual.reviewedAt = null;
      },
    ],
    [
      '/manual/reviewerRef',
      (x) => {
        x.runs.manual.reviewerRef = null;
        x.runs.manual.reviewedAt = null;
      },
    ],
    [
      '/manual/observations/0/fields',
      (x) => {
        x.runs.manual.observations[0].status = 'failed';
      },
    ],
    [
      '/manual/observations/0/citations',
      (x) => {
        x.runs.manual.observations[0].status = 'failed';
        x.runs.manual.observations[0].fields = null;
      },
    ],
    [
      '/manual/observations/0/elapsedMs',
      (x) => {
        x.runs.manual.observations[0].status = 'not_run';
      },
    ],
  ]) {
    const values = fixtureObjects(input);
    mutate(values);
    writeInputs(input, values);
    diagnostic(invoke(input.args), 'E_SCHEMA', 'runs', location);
  }
  const { result } = successful(t, (x) => {
    x.runs.manual.reviewerRef = null;
    x.runs.manual.reviewedAt = null;
    x.runs.manual.observations[0].fields[0].final = null;
  });
  assert.equal(result.runs.manual.reviewerRef, null);
  assert.deepEqual(result.cases[0].pairs.changes.exclusions, [
    'incomplete_review_manual',
  ]);
});

test('conditional status checks report the earlier contract field before later invalid values', (t) => {
  const input = setup(t);
  for (const [location, mutate] of [
    [
      '/manual/observations/0/elapsedMs',
      (x) => {
        x.runs.manual.observations[0].status = 'not_run';
        x.runs.manual.observations[0].fields = false;
      },
    ],
    [
      '/manual/observations/0/fields',
      (x) => {
        x.runs.manual.observations[0].status = 'failed';
        x.runs.manual.observations[0].citations = false;
      },
    ],
    [
      '/manual/observations/0/fields',
      (x) => {
        const observation = x.runs.manual.observations[0];
        observation.status = 'not_run';
        observation.elapsedMs = null;
        observation.citations = false;
      },
    ],
  ]) {
    const values = fixtureObjects(input);
    mutate(values);
    writeInputs(input, values);
    diagnostic(invoke(input.args), 'E_SCHEMA', 'runs', location);
    assert.equal(existsSync(input.output), false);
  }
});

test('review metadata and final-value requirements precede later observation errors', (t) => {
  const input = setup(t);
  for (const mutate of [
    (x) => {
      x.runs.manual.reviewerRef = null;
      x.runs.manual.observations[0].elapsedMs = -1;
    },
    (x) => {
      x.runs.manual.reviewedAt = null;
      x.runs.manual.observations[0].elapsedMs = -1;
    },
    (x) => {
      x.runs.manual.reviewerRef = null;
      x.runs.manual.reviewedAt = null;
      x.runs.manual.observations[0].citations = false;
    },
  ]) {
    const values = fixtureObjects(input);
    mutate(values);
    writeInputs(input, values);
    diagnostic(invoke(input.args), 'E_SCHEMA', 'runs', '/manual/reviewerRef');
    assert.equal(existsSync(input.output), false);
  }
});

test('state-value consistency is checked before unrecognized properties in the same object', (t) => {
  const input = setup(t);
  const values = fixtureObjects(input);
  values.cases.cases[0].reference.fields[0].value = null;
  values.cases.cases[0].reference.fields[0].UNTRUSTED = true;
  writeInputs(input, values);
  diagnostic(
    invoke(input.args),
    'E_SCHEMA',
    'cases',
    '/cases/0/reference/fields/0/value',
  );
  assert.equal(existsSync(input.output), false);
});

test('duplicate arrays and inconsistent identities fail in fixed case and run input order', (t) => {
  const input = setup(t);
  for (const [file, location, mutate] of [
    [
      'cases',
      '/cases/1/caseId',
      (x) => {
        x.cases.cases.push(structuredClone(x.cases.cases[0]));
      },
    ],
    [
      'cases',
      '/cases/1/sourceSetId',
      (x) => {
        const c = structuredClone(x.cases.cases[0]);
        c.caseId = 'B';
        c.reference.referenceId = 'R-B';
        x.cases.cases.push(c);
      },
    ],
    [
      'cases',
      '/cases/1/reference/referenceId',
      (x) => {
        const c = structuredClone(x.cases.cases[0]);
        c.caseId = 'B';
        c.sourceSetId = 'S-B';
        x.cases.cases.push(c);
      },
    ],
    [
      'cases',
      '/cases/0/sources/0/locators/1',
      (x) => {
        x.cases.cases[0].sources[0].locators.push('p1');
      },
    ],
    [
      'cases',
      '/cases/0/reference/citations/1',
      (x) => {
        x.cases.cases[0].reference.citations.push(
          x.cases.cases[0].reference.citations[0],
        );
      },
    ],
    [
      'runs',
      '/manual/observations/1/caseId',
      (x) => {
        x.runs.manual.observations.push(x.runs.manual.observations[0]);
      },
    ],
    [
      'runs',
      '/manual/observations/0/fields/1/fieldId',
      (x) => {
        x.runs.manual.observations[0].fields.push(
          x.runs.manual.observations[0].fields[0],
        );
      },
    ],
    [
      'runs',
      '/manual/observations/0/citations/1',
      (x) => {
        x.runs.manual.observations[0].citations.push(
          x.runs.manual.observations[0].citations[0],
        );
      },
    ],
  ]) {
    const values = fixtureObjects(input);
    mutate(values);
    writeInputs(input, values);
    diagnostic(invoke(input.args), 'E_DUPLICATE', file, location);
  }
  for (const key of [
    'caseSetId',
    'caseSetVersion',
    'protocolId',
    'protocolVersion',
  ]) {
    const values = fixtureObjects(input);
    values.runs[key] = typeof values.runs[key] === 'number' ? 2 : 'OTHER';
    writeInputs(input, values);
    diagnostic(invoke(input.args), 'E_REFERENCE', 'runs', `/${key}`);
  }
  for (const changed of ['sha256', 'locators']) {
    const values = fixtureObjects(input);
    const second = structuredClone(values.cases.cases[0]);
    second.caseId = 'B';
    second.sourceSetId = 'S-B';
    second.reference.referenceId = 'R-B';
    second.sources[0][changed] =
      changed === 'sha256' ? 'b'.repeat(64) : ['p1', 'p2'];
    values.cases.cases.push(second);
    writeInputs(input, values);
    diagnostic(
      invoke(input.args),
      'E_REFERENCE',
      'cases',
      '/cases/1/sources/0',
    );
  }
});

test('validation order is arguments, complete cases, complete runs, output then writing', (t) => {
  const input = setup(t);
  writeFileSync(input.casesPath, '{');
  rmSync(input.runsPath);
  mkdirSync(input.output);
  diagnostic(invoke([...input.args, '--bad']), 'E_ARGUMENT', 'arguments');
  diagnostic(invoke(input.args), 'E_JSON', 'cases');
  writeFileSync(input.casesPath, input.cases);
  diagnostic(invoke(input.args), 'E_INPUT_FILE', 'runs');
  writeFileSync(input.runsPath, input.runs);
  diagnostic(invoke(input.args), 'E_OUTPUT_EXISTS', 'output');
  const values = fixtureObjects(input);
  values.cases.caseSetId = 5;
  values.cases.schema = 'wrong';
  writeInputs(input, values);
  diagnostic(invoke(input.args), 'E_SCHEMA', 'cases', '/schema');
});

test('reference citation integrity reports the earliest input tuple before a later duplicate', (t) => {
  const input = setup(t);
  const values = fixtureObjects(input);
  const invalid = { sourceId: 'UNKNOWN', sourceVersion: 1, locator: 'p1' };
  values.cases.cases[0].reference.citations = [invalid, invalid];
  writeInputs(input, values);
  diagnostic(
    invoke(input.args),
    'E_REFERENCE',
    'cases',
    '/cases/0/reference/citations/0',
  );
  assert.equal(existsSync(input.output), false);
});

test('exact ID, Unicode, Version, Source, locator, field and citation bounds remain usable', (t) => {
  const { result } = successful(t, (x) => {
    x.cases.caseSetId = x.runs.caseSetId = 'A' + 'x'.repeat(63);
    x.cases.caseSetVersion = x.runs.caseSetVersion = 1000000;
    x.cases.protocol.task = 't'.repeat(1000);
    const c = x.cases.cases[0];
    c.reference.preparedAt = '2024-02-29T23:59:59.999Z';
    c.reference.preparationEvidenceRef = '😀'.repeat(256);
    c.sources = Array.from({ length: 16 }, (_, i) => ({
      sourceId: `DOC${i}`,
      sourceVersion: 1000000,
      sha256: 'a'.repeat(64),
      locators: Array.from(
        { length: 32 },
        (_, j) => '😀'.repeat(254) + String(j).padStart(2, '0'),
      ),
    }));
    c.reference.fields = Array.from({ length: 32 }, (_, i) => ({
      fieldId: `f${i}`,
      state: 'confirmed',
      value: '😀'.repeat(256),
    }));
    c.reference.citations = c.sources[0].locators.map((locator) => ({
      sourceId: 'DOC0',
      sourceVersion: 1000000,
      locator,
    }));
    for (const name of ['manual', 'assisted']) {
      x.runs[name].methodVersion = 1000000;
      const o = x.runs[name].observations[0];
      o.elapsedMs = 604800000;
      o.fields = c.reference.fields.map(({ fieldId, state, value }) => ({
        fieldId,
        initial: { state, value },
        final: { state, value },
      }));
      o.citations = structuredClone(c.reference.citations);
    }
  });
  assert.deepEqual(result.aggregate.fields.manual, {
    numerator: 32,
    denominator: 32,
    value: '1.000000',
  });
  assert.deepEqual(result.aggregate.changes.manual, {
    numerator: 0,
    denominator: 32,
    value: '0.000000',
  });
  assert.deepEqual(result.aggregate.citations.assisted.precision, {
    numerator: 32,
    denominator: 32,
    value: '1.000000',
  });
  assert.equal(result.aggregate.time.reductionPercent, '0.000000');
});

test('first-over and below-minimum array and text bounds reject without truncation', (t) => {
  const input = setup(t);
  for (const [file, pointer, mutate] of [
    [
      'cases',
      '/cases',
      (x) => {
        x.cases.cases = Array(201).fill(x.cases.cases[0]);
      },
    ],
    [
      'cases',
      '/cases/0/sources',
      (x) => {
        x.cases.cases[0].sources = [];
      },
    ],
    [
      'cases',
      '/cases/0/sources',
      (x) => {
        x.cases.cases[0].sources = Array(17).fill(x.cases.cases[0].sources[0]);
      },
    ],
    [
      'cases',
      '/cases/0/sources/0/locators',
      (x) => {
        x.cases.cases[0].sources[0].locators = [];
      },
    ],
    [
      'cases',
      '/cases/0/sources/0/locators',
      (x) => {
        x.cases.cases[0].sources[0].locators = Array(33).fill('p1');
      },
    ],
    [
      'cases',
      '/cases/0/sources/0/locators/0',
      (x) => {
        x.cases.cases[0].sources[0].locators[0] = '😀'.repeat(257);
      },
    ],
    [
      'cases',
      '/cases/0/reference/fields',
      (x) => {
        x.cases.cases[0].reference.fields = Array(33).fill(
          x.cases.cases[0].reference.fields[0],
        );
      },
    ],
    [
      'cases',
      '/cases/0/reference/citations',
      (x) => {
        x.cases.cases[0].reference.citations = Array(33).fill(
          x.cases.cases[0].reference.citations[0],
        );
      },
    ],
    [
      'runs',
      '/manual/observations',
      (x) => {
        x.runs.manual.observations = Array(201).fill(
          x.runs.manual.observations[0],
        );
      },
    ],
    [
      'runs',
      '/manual/observations/0/fields',
      (x) => {
        x.runs.manual.observations[0].fields = Array(33).fill(
          x.runs.manual.observations[0].fields[0],
        );
      },
    ],
    [
      'runs',
      '/manual/observations/0/citations',
      (x) => {
        x.runs.manual.observations[0].citations = Array(33).fill(
          x.runs.manual.observations[0].citations[0],
        );
      },
    ],
  ]) {
    const values = fixtureObjects(input);
    mutate(values);
    writeInputs(input, values);
    diagnostic(invoke(input.args), 'E_SCHEMA', file, pointer);
    assert.equal(existsSync(input.output), false);
  }
});

test('200 distinct declared cases and selected observations are counted by case identity', (t) => {
  const { result } = successful(t, (x) => {
    const template = x.cases.cases[0];
    x.cases.cases = Array.from({ length: 200 }, (_, i) => {
      const c = structuredClone(template);
      c.caseId = `C${String(i).padStart(3, '0')}`;
      c.sourceSetId = `S${i}`;
      c.reference.referenceId = `R${i}`;
      return c;
    });
    for (const name of ['manual', 'assisted']) {
      const original = x.runs[name].observations[0];
      x.runs[name].observations = x.cases.cases.map((c) => ({
        ...structuredClone(original),
        caseId: c.caseId,
        sourceSetId: c.sourceSetId,
        referenceId: c.reference.referenceId,
      }));
    }
  });
  assert.equal(result.aggregate.declaredCasesCount, 200);
  assert.equal(result.aggregate.basePairCount, 200);
  assert.equal(result.aggregate.time.pairedCaseIds.length, 200);
  assert.equal(result.aggregate.time.manualMs, 12000000);
  assert.equal(result.aggregate.time.assistedMs, 6000000);
  assert.equal(result.aggregate.time.reductionPercent, '50.000000');
  assert.deepEqual(result.aggregate.fields.manual, {
    numerator: 0,
    denominator: 200,
    value: '0.000000',
  });
  assert.deepEqual(result.aggregate.fields.assisted, {
    numerator: 200,
    denominator: 200,
    value: '1.000000',
  });
});
