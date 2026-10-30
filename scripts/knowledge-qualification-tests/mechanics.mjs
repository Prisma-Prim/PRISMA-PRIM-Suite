import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { member } from '../pilot-evaluation-tests/support.mjs';
import { example, observations, setup, invoke } from './support.mjs';
test('diagnoses a captured incorrect literal quote through the actual CLI without changing the oracle', (t) => {
  const f = setup(t);
  const execution = invoke([
    'evaluate',
    '--bundle',
    f.bundle,
    '--observations',
    f.run,
    '--out',
    f.out,
  ]);
  assert.equal(execution.status, 0, execution.stderr);
  const result = JSON.parse(member(f.out, 'result.json', 'utf8'));
  assert.ok(
    result.cases[0].findings.some(
      (finding) => finding.code === 'citation_quote_mismatch',
    ),
  );
  assert.equal(readFileSync(f.bundle, 'utf8'), f.original);
});

test('prepare uses declared eligibility rather than the expected answer and excludes foreign, obsolete and unadmitted content', (t) => {
  const f = setup(t),
    bundle = example();
  const originalSource = bundle.content.sources[0];
  const extra = [
    {
      ...originalSource,
      sourceId: 'S-ALLOWED',
      title: 'Another permitted source',
      passages: [{ locator: 'p1', text: 'Independent permitted material.' }],
    },
    {
      ...originalSource,
      sourceId: 'S-SECRET',
      companyRef: 'C-OTHER',
      title: 'SECRET foreign source',
      passages: [{ locator: 'p1', text: 'SECRET foreign content.' }],
    },
    {
      ...originalSource,
      sourceId: 'S-DRAFT',
      admission: 'synthetic-not-approved',
      title: 'SECRET unapproved source',
      passages: [{ locator: 'p1', text: 'SECRET unapproved content.' }],
    },
    {
      ...originalSource,
      version: 1,
      status: 'superseded',
      title: 'SECRET obsolete source',
      passages: [{ locator: 'p1', text: 'SECRET obsolete content.' }],
    },
  ];
  bundle.content.sources.push(...extra);
  const refs = extra.map(({ sourceId, version }) => ({ sourceId, version }));
  bundle.content.profiles[0].permittedSources.push(...refs);
  bundle.expectations.cases[0].candidateRefs.push(...refs);
  writeFileSync(f.bundle, JSON.stringify(bundle));
  const execution = invoke(['prepare', '--bundle', f.bundle, '--out', f.out]);
  assert.equal(execution.status, 0, execution.stderr);
  const result = JSON.parse(member(f.out, 'result.json', 'utf8'));
  assert.deepEqual(
    result.contexts[0].sources.map((source) => source.sourceId),
    ['S-ONE', 'S-ALLOWED'],
  );
  const bytes =
    member(f.out, 'result.json', 'utf8') + member(f.out, 'report.md', 'utf8');
  for (const hidden of [
    'S-SECRET',
    'S-DRAFT',
    'SECRET',
    'candidateRefs',
    'retrievalRefs',
    'requiredProperties',
    'prohibitedOutcomes',
    'expected',
  ])
    assert.ok(!bytes.includes(hidden), hidden);
});

test('rejects unrecognized bundle properties before creating output', (t) => {
  const f = setup(t),
    bundle = example();
  bundle.unrecognized = 'NEVER-ECHO-THIS';
  writeFileSync(f.bundle, JSON.stringify(bundle));
  const execution = invoke(['prepare', '--bundle', f.bundle, '--out', f.out]);
  assert.equal(execution.status, 2, execution.stderr);
  const error = JSON.parse(execution.stderr);
  assert.equal(error.code, 'E_SCHEMA');
  assert.equal(error.location, '');
  assert.ok(!execution.stderr.includes('NEVER-ECHO-THIS'));
});

test('detects declared hidden-source retrieval even with a harmless supported answer', (t) => {
  const f = setup(t),
    bundle = example(),
    run = observations();
  bundle.content.sources.push({
    ...bundle.content.sources[0],
    sourceId: 'S-FOREIGN',
    companyRef: 'C-OTHER',
    title: 'Hidden source',
    passages: [{ locator: 'p1', text: 'The secret is nine.' }],
  });
  bundle.expectations.cases[0].candidateRefs.push({
    sourceId: 'S-FOREIGN',
    version: 2,
  });
  run.observations[0].retrievalRefs.push({ sourceId: 'S-FOREIGN', version: 2 });
  run.observations[0].citations[0].quote =
    'The fictional store has four boxes.';
  run.observations[0].answer = 'There are four fictional boxes.';
  writeFileSync(f.bundle, JSON.stringify(bundle));
  writeFileSync(f.run, JSON.stringify(run));
  const execution = invoke([
    'evaluate',
    '--bundle',
    f.bundle,
    '--observations',
    f.run,
    '--out',
    f.out,
  ]);
  assert.equal(execution.status, 0, execution.stderr);
  const result = JSON.parse(member(f.out, 'result.json', 'utf8'));
  assert.ok(
    result.cases[0].findings.some(
      (finding) => finding.code === 'retrieval_ineligible',
    ),
  );
});

test('keeps unavailable human-event and field measures at zero over zero', (t) => {
  const f = setup(t),
    run = observations();
  run.observations[0].citations[0].quote =
    'The fictional store has four boxes.';
  writeFileSync(f.run, JSON.stringify(run));
  const execution = invoke([
    'evaluate',
    '--bundle',
    f.bundle,
    '--observations',
    f.run,
    '--out',
    f.out,
  ]);
  assert.equal(execution.status, 0, execution.stderr);
  const result = JSON.parse(member(f.out, 'result.json', 'utf8'));
  assert.deepEqual(result.summary.measurements.humanEventMatch, {
    numerator: 0,
    denominator: 0,
    value: null,
  });
  assert.deepEqual(result.summary.measurements.initialFieldMatch, {
    numerator: 0,
    denominator: 0,
    value: null,
  });
});

test('prepares all22 authored cases without hidden metadata or the oracle and preserves explicit history/human events', (t) => {
  const f = setup(t);
  const fixture = readFileSync(
    new URL(
      '../fixtures/knowledge-qualification/kit.bundle.json',
      import.meta.url,
    ),
  );
  writeFileSync(f.bundle, fixture);
  const execution = invoke(['prepare', '--bundle', f.bundle, '--out', f.out]);
  assert.equal(execution.status, 0, execution.stderr);
  const result = JSON.parse(member(f.out, 'result.json', 'utf8'));
  assert.equal(result.contexts.length, 22);
  assert.equal(result.dataKind, 'synthetic');
  assert.equal(
    result.contexts.find((item) => item.caseId === 'K11').capability,
    'simulated_denied',
  );
  assert.equal(
    result.contexts.find((item) => item.caseId === 'K12').capability,
    'simulated_denied',
  );
  assert.equal(
    result.contexts.find((item) => item.caseId === 'K08').capability,
    'simulated_allowed',
  );
  const at = (id) => result.contexts.find((item) => item.caseId === id);
  assert.deepEqual(
    at('K01').sources.map((item) => [item.sourceId, item.version, item.status]),
    [['S-RO-INVENTORY', 2, 'current']],
  );
  assert.deepEqual(
    at('K04').sources.map((item) => [item.sourceId, item.version, item.status]),
    [['S-RO-INVENTORY', 1, 'superseded']],
  );
  assert.deepEqual(
    at('K05').sources.map((item) => item.sourceId),
    ['S-CONFLICT-A', 'S-CONFLICT-B'],
  );
  for (const id of ['K08', 'K09', 'K10', 'K11', 'K12', 'K21'])
    assert.deepEqual(at(id).sources, [], id);
  assert.deepEqual(
    at('K22').sources.map((item) => item.sourceId),
    ['S-EN-NOTE'],
  );
  assert.equal(at('K18').humanDisposition.eventRef, 'H-SYN-ACCEPT-1');
  assert.equal(at('K18').humanDisposition.evidenceKind, 'authored_fiction');
  assert.equal(
    at('K13').sources[0].passages[0].text,
    'The fictional reading-room label is Cedar.',
  );
  assert.equal(at('K13').sources[0].passages.length, 2);
  const text =
    member(f.out, 'result.json', 'utf8') + member(f.out, 'report.md', 'utf8');
  for (const secret of [
    'S-COMPANY-B',
    'S-FOREIGN-W',
    'S-RESTRICTED-A',
    'S-DRAFT',
    'ORCHID',
    'NEBULA',
    '"expected":',
    '"candidateRefs":',
    '"permittedSources":',
  ])
    assert.ok(!text.includes(secret), secret);
  assert.deepEqual(readFileSync(f.bundle), fixture);
});

test('evaluates the separate22-case literal observation set with inspectable exact counts, no semantic or real approval verdict', (t) => {
  const f = setup(t);
  const fixture = readFileSync(
    new URL(
      '../fixtures/knowledge-qualification/kit.bundle.json',
      import.meta.url,
    ),
  );
  const runs = readFileSync(
    new URL(
      '../fixtures/knowledge-qualification/kit.observations.json',
      import.meta.url,
    ),
  );
  writeFileSync(f.bundle, fixture);
  writeFileSync(f.run, runs);
  const execution = invoke([
    'evaluate',
    '--bundle',
    f.bundle,
    '--observations',
    f.run,
    '--out',
    f.out,
  ]);
  assert.equal(execution.status, 0, execution.stderr);
  const result = JSON.parse(member(f.out, 'result.json', 'utf8'));
  assert.equal(result.summary.caseCount, 22);
  assert.equal(result.summary.completed, 22);
  assert.equal(result.summary.casesWithFindings, 0);
  assert.deepEqual(result.summary.measurements.citationExactness, {
    numerator: 14,
    denominator: 14,
    value: 1,
  });
  assert.deepEqual(result.summary.measurements.citationReferenceCoverage, {
    numerator: 14,
    denominator: 14,
    value: 1,
  });
  assert.deepEqual(result.summary.measurements.retrievalSetMatch, {
    numerator: 22,
    denominator: 22,
    value: 1,
  });
  assert.deepEqual(result.summary.measurements.initialFieldMatch, {
    numerator: 7,
    denominator: 7,
    value: 1,
  });
  assert.deepEqual(result.summary.measurements.finalFieldMatch, {
    numerator: 2,
    denominator: 2,
    value: 1,
  });
  assert.deepEqual(result.summary.measurements.humanEventMatch, {
    numerator: 3,
    denominator: 3,
    value: 1,
  });
  assert.equal(result.run.evidenceKind, 'authored_fixture');
  assert.equal(result.measurementBasis, 'declared_inputs_unverified');
  assert.ok(result.unavailable.includes('semantic_support'));
  const corrected = result.cases.find((item) => item.caseId === 'K19');
  assert.equal(corrected.initialFields[0].value, '5');
  assert.equal(corrected.finalFields[0].value, '4');
  assert.equal(corrected.humanDisposition.kind, 'correct');
  const rejected = result.cases.find((item) => item.caseId === 'K20');
  assert.deepEqual(rejected.finalFields, []);
  assert.equal(rejected.humanDisposition.kind, 'reject');
  assert.deepEqual(readFileSync(f.bundle), fixture);
  assert.deepEqual(readFileSync(f.run), runs);
});

test('diagnoses fabricated human confirmation and retains the original captured proposal', (t) => {
  const f = setup(t),
    run = observations();
  run.observations[0].citations[0].quote =
    'The fictional store has four boxes.';
  run.observations[0].initialFields = [
    { fieldId: 'box_count', state: 'inferred', value: '5' },
  ];
  run.observations[0].finalFields = [
    { fieldId: 'box_count', state: 'confirmed', value: '4' },
  ];
  run.observations[0].humanEventRef = 'FORGED-HUMAN-EVENT';
  writeFileSync(f.run, JSON.stringify(run));
  const execution = invoke([
    'evaluate',
    '--bundle',
    f.bundle,
    '--observations',
    f.run,
    '--out',
    f.out,
  ]);
  assert.equal(execution.status, 0, execution.stderr);
  const result = JSON.parse(member(f.out, 'result.json', 'utf8'));
  assert.ok(
    result.cases[0].findings.some(
      (item) => item.code === 'unsupported_confirmation',
    ),
  );
  assert.ok(
    result.cases[0].findings.some(
      (item) => item.code === 'human_event_mismatch',
    ),
  );
  assert.equal(result.cases[0].initialFields[0].value, '5');
  assert.equal(result.cases[0].humanDisposition, null);
});

test('rejects incompatible captured corpus/case/profile identities rather than joining another scope', (t) => {
  for (const mutate of [
    (run) => (run.corpusVersion = 2),
    (run) => (run.observations[0].caseVersion = 2),
    (run) => (run.observations[0].profileId = 'OTHER-PROFILE'),
    (run) => (run.observations[0].purpose = 'analysis'),
    (run) => (run.observations[0].mode = 'historical'),
  ]) {
    const f = setup(t),
      run = observations();
    mutate(run);
    writeFileSync(f.run, JSON.stringify(run));
    const execution = invoke([
      'evaluate',
      '--bundle',
      f.bundle,
      '--observations',
      f.run,
      '--out',
      f.out,
    ]);
    assert.equal(execution.status, 2, execution.stderr);
    assert.equal(JSON.parse(execution.stderr).code, 'E_REFERENCE');
  }
});

test('reports missing, failed and not-run observations with unavailable measures rather than a successful score', (t) => {
  for (const status of ['missing', 'failed', 'not_run']) {
    const f = setup(t),
      run = observations();
    if (status === 'missing') run.observations = [];
    else
      Object.assign(run.observations[0], {
        status,
        retrievalRefs: null,
        outcome: null,
        citations: null,
        initialFields: null,
        finalFields: null,
        humanEventRef: null,
      });
    writeFileSync(f.run, JSON.stringify(run));
    const execution = invoke([
      'evaluate',
      '--bundle',
      f.bundle,
      '--observations',
      f.run,
      '--out',
      f.out,
    ]);
    assert.equal(execution.status, 0, execution.stderr);
    const result = JSON.parse(member(f.out, 'result.json', 'utf8'));
    assert.equal(result.cases[0].status, status);
    assert.equal(result.summary.completed, 0);
    assert.deepEqual(result.summary.measurements.citationExactness, {
      numerator: 0,
      denominator: 0,
      value: null,
    });
  }
});

test('compares quote bytes without whitespace, case or Unicode normalization', (t) => {
  for (const quote of [
    ' The fictional café has four boxes.',
    'The fictional cafe\u0301 has four boxes.',
    'THE FICTIONAL CAFÉ HAS FOUR BOXES.',
  ]) {
    const f = setup(t),
      bundle = example(),
      run = observations();
    bundle.content.sources[0].passages[0].text =
      'The fictional café has four boxes.';
    bundle.expectations.cases[0].expected.citations[0].quote =
      'The fictional café has four boxes.';
    run.observations[0].citations[0].quote = quote;
    writeFileSync(f.bundle, JSON.stringify(bundle));
    writeFileSync(f.run, JSON.stringify(run));
    const execution = invoke([
      'evaluate',
      '--bundle',
      f.bundle,
      '--observations',
      f.run,
      '--out',
      f.out,
    ]);
    assert.equal(execution.status, 0, execution.stderr);
    const result = JSON.parse(member(f.out, 'result.json', 'utf8'));
    assert.ok(
      result.cases[0].findings.some(
        (item) => item.code === 'citation_quote_mismatch',
      ),
    );
    assert.equal(result.summary.measurements.citationExactness.numerator, 0);
  }
});

test('detects an exact obsolete quotation used in current mode and an invented citation locator', (t) => {
  for (const wrong of ['old-version', 'locator']) {
    const f = setup(t),
      bundle = example(),
      run = observations();
    if (wrong === 'old-version') {
      bundle.content.sources.push({
        ...bundle.content.sources[0],
        version: 1,
        status: 'superseded',
        passages: [
          {
            locator: 'p1',
            text: 'The fictional store formerly had two boxes.',
          },
        ],
      });
      bundle.content.profiles[0].permittedSources.push({
        sourceId: 'S-ONE',
        version: 1,
      });
      bundle.expectations.cases[0].candidateRefs.push({
        sourceId: 'S-ONE',
        version: 1,
      });
      run.observations[0].retrievalRefs = [{ sourceId: 'S-ONE', version: 1 }];
      run.observations[0].citations = [
        {
          sourceId: 'S-ONE',
          version: 1,
          locator: 'p1',
          quote: 'The fictional store formerly had two boxes.',
        },
      ];
    } else {
      run.observations[0].citations[0].quote =
        'The fictional store has four boxes.';
      run.observations[0].citations[0].locator = 'invented-location';
    }
    writeFileSync(f.bundle, JSON.stringify(bundle));
    writeFileSync(f.run, JSON.stringify(run));
    const execution = invoke([
      'evaluate',
      '--bundle',
      f.bundle,
      '--observations',
      f.run,
      '--out',
      f.out,
    ]);
    assert.equal(execution.status, 0, execution.stderr);
    const result = JSON.parse(member(f.out, 'result.json', 'utf8'));
    assert.ok(
      result.cases[0].findings.some(
        (item) =>
          item.code ===
          (wrong === 'old-version'
            ? 'citation_source_ineligible'
            : 'citation_locator_unknown'),
      ),
    );
    assert.equal(result.summary.measurements.citationExactness.numerator, 0);
  }
});

test('counts no observations from an empty declared case set and creates a complete private output', (t) => {
  const f = setup(t),
    bundle = example(),
    run = observations();
  bundle.expectations.cases = [];
  run.observations = [];
  writeFileSync(f.bundle, JSON.stringify(bundle));
  writeFileSync(f.run, JSON.stringify(run));
  const execution = invoke([
    'evaluate',
    '--bundle',
    f.bundle,
    '--observations',
    f.run,
    '--out',
    f.out,
  ]);
  assert.equal(execution.status, 0, execution.stderr);
  const result = JSON.parse(member(f.out, 'result.json', 'utf8'));
  assert.equal(result.summary.caseCount, 0);
  for (const value of Object.values(result.summary.measurements))
    assert.deepEqual(value, { numerator: 0, denominator: 0, value: null });
});

test('rejects duplicate captured citation identities even if their quote text differs', (t) => {
  const f = setup(t),
    run = observations();
  run.observations[0].citations.push({
    ...run.observations[0].citations[0],
    quote: 'The fictional store has four boxes.',
  });
  writeFileSync(f.run, JSON.stringify(run));
  const execution = invoke([
    'evaluate',
    '--bundle',
    f.bundle,
    '--observations',
    f.run,
    '--out',
    f.out,
  ]);
  assert.equal(execution.status, 2, execution.stderr);
  assert.equal(JSON.parse(execution.stderr).code, 'E_DUPLICATE');
});

test('creates identical neutral containers at fresh paths for identical captured input bytes', (t) => {
  for (const mode of ['prepare', 'evaluate']) {
    const f = setup(t);
    const args =
      mode === 'prepare'
        ? ['prepare', '--bundle', f.bundle]
        : ['evaluate', '--bundle', f.bundle, '--observations', f.run];
    const first = invoke([...args, '--out', f.out]);
    assert.equal(first.status, 0, first.stderr);
    const second = invoke([...args, '--out', f.out + '.again']);
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(readFileSync(f.out), readFileSync(f.out + '.again'));
  }
});

test('refuses a valid source-context expansion beyond the complete output bound without creating a partial file', (t) => {
  const f = setup(t),
    bundle = example();
  bundle.content.sources[0].passages = Array.from(
    { length: 32 },
    (_, index) => ({ locator: 'p' + index, text: 'x'.repeat(16000) }),
  );
  const template = bundle.expectations.cases[0];
  bundle.expectations.cases = Array.from({ length: 34 }, (_, index) => ({
    ...template,
    caseId: 'CASE' + index,
    expected: {
      outcome: 'insufficient_evidence',
      retrievalRefs: [{ sourceId: 'S-ONE', version: 2 }],
      citations: [],
      requiredProperties: [],
      prohibitedOutcomes: [],
    },
  }));
  const original = JSON.stringify(bundle);
  assert.ok(Buffer.byteLength(original) < 1048576);
  writeFileSync(f.bundle, original);
  const execution = invoke(['prepare', '--bundle', f.bundle, '--out', f.out]);
  assert.equal(execution.status, 3, execution.stderr);
  assert.equal(JSON.parse(execution.stderr).code, 'E_OUTPUT_LIMIT');
  assert.equal(existsSync(f.out), false);
  assert.equal(readFileSync(f.bundle, 'utf8'), original);
});

test('rejects a fictional acceptance that names no initial proposal or changes the accepted value', (t) => {
  for (const mutation of ['missing-proposal', 'changed-acceptance']) {
    const f = setup(t),
      bundle = JSON.parse(
        readFileSync(
          new URL(
            '../fixtures/knowledge-qualification/kit.bundle.json',
            import.meta.url,
          ),
          'utf8',
        ),
      );
    const item = bundle.expectations.cases.find(
      (item) => item.caseId === 'K18',
    );
    if (mutation === 'missing-proposal') item.expected.initialFields = [];
    else item.expected.initialFields[0].value = '5';
    writeFileSync(f.bundle, JSON.stringify(bundle));
    const execution = invoke(['prepare', '--bundle', f.bundle, '--out', f.out]);
    assert.equal(execution.status, 2, execution.stderr);
    assert.equal(JSON.parse(execution.stderr).code, 'E_REFERENCE');
  }
});

test('withholds a supplied fictional review event when the profile has no permission for its requested purpose', (t) => {
  const f = setup(t),
    bundle = example(),
    item = bundle.expectations.cases[0];
  bundle.content.profiles[0].purposes = [];
  item.purpose = 'analysis';
  item.expected = {
    outcome: 'human_accepted',
    retrievalRefs: [],
    citations: [],
    requiredProperties: [],
    prohibitedOutcomes: [],
    initialFields: [{ fieldId: 'box_count', state: 'inferred', value: '4' }],
    finalFields: [{ fieldId: 'box_count', state: 'confirmed', value: '4' }],
  };
  item.humanDisposition = {
    eventRef: 'H-PRIVATE',
    actorRef: 'U-PRIVATE',
    kind: 'accept',
    fieldId: 'box_count',
    value: '4',
    at: '2026-01-01T10:00:00Z',
    evidenceKind: 'authored_fiction',
  };
  writeFileSync(f.bundle, JSON.stringify(bundle));
  const execution = invoke(['prepare', '--bundle', f.bundle, '--out', f.out]);
  assert.equal(execution.status, 0, execution.stderr);
  const result = JSON.parse(member(f.out, 'result.json', 'utf8'));
  assert.deepEqual(result.contexts[0].sources, []);
  assert.equal(result.contexts[0].humanDisposition, null);
  assert.ok(!member(f.out, 'result.json', 'utf8').includes('H-PRIVATE'));
});
