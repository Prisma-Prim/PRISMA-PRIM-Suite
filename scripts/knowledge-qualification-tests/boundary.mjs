import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const command = fileURLToPath(
  new URL('../knowledge-qualification.mjs', import.meta.url),
);
const fixtures = new URL(
  '../fixtures/knowledge-qualification/',
  import.meta.url,
);
const sentinel = 'PRIVATE-BOUNDARY-SENTINEL-DO-NOT-ECHO';
const expectedKeys = [
  'schema',
  'code',
  'input',
  'location',
  'message',
  'example',
];

function invoke(args, cwd) {
  return spawnSync(process.execPath, [command, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 1048576,
    env: { PATH: process.env.PATH },
  });
}

function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'knowledge-boundary-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bundlePath = join(directory, 'bundle.json');
  const observationsPath = join(directory, 'observations.json');
  const output = join(directory, 'result.tar');
  writeFileSync(bundlePath, readFileSync(new URL('kit.bundle.json', fixtures)));
  writeFileSync(
    observationsPath,
    readFileSync(new URL('kit.observations.json', fixtures)),
  );
  return {
    directory,
    bundlePath,
    observationsPath,
    output,
    bundle: JSON.parse(readFileSync(bundlePath, 'utf8')),
    observations: JSON.parse(readFileSync(observationsPath, 'utf8')),
    args: [
      'evaluate',
      '--bundle',
      bundlePath,
      '--observations',
      observationsPath,
      '--out',
      output,
    ],
  };
}

function preserve(inputs) {
  const captured = inputs.map((path) => [path, readFileSync(path)]);
  return () => {
    for (const [path, bytes] of captured)
      assert.deepEqual(readFileSync(path), bytes);
  };
}

function diagnostic(execution, code, input, directory) {
  assert.equal(
    execution.status,
    [
      'E_INPUT_FILE',
      'E_OUTPUT_PATH',
      'E_OUTPUT_EXISTS',
      'E_OUTPUT_WRITE',
      'E_OUTPUT_LIMIT',
    ].includes(code)
      ? 3
      : code === 'E_INTERNAL'
        ? 1
        : 2,
    execution.stderr,
  );
  assert.equal(execution.error, undefined);
  assert.equal(execution.stdout, '');
  assert.ok(Buffer.byteLength(execution.stderr) <= 2048);
  assert.equal(execution.stderr.split('\n').length, 2);
  const result = JSON.parse(execution.stderr);
  assert.deepEqual(Object.keys(result), expectedKeys);
  assert.equal(result.schema, 'prisma-prim-knowledge-error/v1');
  assert.equal(result.code, code);
  assert.equal(result.input, input);
  assert.ok(result.location === null || typeof result.location === 'string');
  assert.ok(result.message.length > 0);
  assert.match(result.example, /^node scripts\/knowledge-qualification\.mjs /);
  assert.equal(execution.stderr.includes(sentinel), false);
  assert.equal(execution.stderr.includes(directory), false);
  return result;
}

for (const args of [
  ['--help'],
  ['prepare', '--help'],
  ['evaluate', '--help'],
]) {
  test(`help ${args.join(' ')} works without input files or output creation`, (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'knowledge-help-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const execution = invoke(args, directory);
    assert.equal(execution.status, 0, execution.stderr);
    assert.equal(execution.error, undefined);
    assert.equal(execution.stderr, '');
    assert.match(
      execution.stdout,
      /node scripts\/knowledge-qualification\.mjs/,
    );
    assert.match(execution.stdout, /--bundle/);
    assert.match(execution.stdout, /--out/);
    assert.deepEqual(readdirSync(directory), []);
  });
}

const argumentCases = [
  ['missing mode', () => []],
  ['unknown mode', () => ['unknown']],
  ['root help mixed with flags', (s) => ['--help', '--bundle', s.bundlePath]],
  [
    'mode help mixed with flags',
    (s) => ['prepare', '--help', '--out', s.output],
  ],
  ['missing prepare output', (s) => ['prepare', '--bundle', s.bundlePath]],
  [
    'missing evaluate observations',
    (s) => ['evaluate', '--bundle', s.bundlePath, '--out', s.output],
  ],
  ['duplicate flag', (s) => [...s.args, '--out', s.output]],
  ['unknown flag', (s) => [...s.args, '--unknown', sentinel]],
  [
    'other-mode flag',
    (s) => [
      'prepare',
      '--bundle',
      s.bundlePath,
      '--observations',
      s.observationsPath,
      '--out',
      s.output,
    ],
  ],
  ['empty value', (s) => ['prepare', '--bundle', '', '--out', s.output]],
  ['stdin value', (s) => ['prepare', '--bundle', '-', '--out', s.output]],
  [
    'URL value',
    (s) => [
      'prepare',
      '--bundle',
      'https://example.invalid/private.json',
      '--out',
      s.output,
    ],
  ],
  ['glob value', (s) => ['prepare', '--bundle', '*.json', '--out', s.output]],
  [
    'control-character value',
    (s) => ['prepare', '--bundle', `${sentinel}\n.json`, '--out', s.output],
  ],
  ['stray positional', (s) => [...s.args, 'stray']],
];
for (const [name, args] of argumentCases) {
  test(`closed arguments reject ${name}`, (t) => {
    const s = setup(t);
    const unchanged = preserve([s.bundlePath, s.observationsPath]);
    diagnostic(
      invoke(args(s), s.directory),
      'E_ARGUMENT',
      'arguments',
      s.directory,
    );
    assert.equal(existsSync(s.output), false);
    unchanged();
  });
}

test('occupied output preserves its original bytes and both inputs', (t) => {
  const s = setup(t);
  writeFileSync(s.output, sentinel);
  const unchanged = preserve([s.bundlePath, s.observationsPath, s.output]);
  diagnostic(
    invoke(s.args, s.directory),
    'E_OUTPUT_EXISTS',
    'output',
    s.directory,
  );
  unchanged();
});

test('input/output collision preserves the selected input', (t) => {
  const s = setup(t);
  const unchanged = preserve([s.bundlePath, s.observationsPath]);
  s.args[s.args.length - 1] = s.bundlePath;
  diagnostic(
    invoke(s.args, s.directory),
    'E_OUTPUT_PATH',
    'output',
    s.directory,
  );
  unchanged();
});

test('existing worktree file cannot become output', (t) => {
  const s = setup(t);
  const worktreeFile = fileURLToPath(new URL('README.md', fixtures));
  const unchanged = preserve([s.bundlePath, s.observationsPath, worktreeFile]);
  s.args[s.args.length - 1] = worktreeFile;
  diagnostic(
    invoke(s.args, s.directory),
    'E_OUTPUT_PATH',
    'output',
    s.directory,
  );
  unchanged();
});

test('input symlink and input symlink directory components are refused', (t) => {
  const s = setup(t);
  const unchanged = preserve([s.bundlePath, s.observationsPath]);
  const link = join(s.directory, 'linked-bundle.json');
  symlinkSync(s.bundlePath, link);
  diagnostic(
    invoke(['prepare', '--bundle', link, '--out', s.output], s.directory),
    'E_INPUT_FILE',
    'bundle',
    s.directory,
  );
  const parentLink = join(s.directory, 'linked-parent');
  symlinkSync(s.directory, parentLink, 'dir');
  diagnostic(
    invoke(
      [
        'prepare',
        '--bundle',
        join(parentLink, 'bundle.json'),
        '--out',
        s.output,
      ],
      s.directory,
    ),
    'E_INPUT_FILE',
    'bundle',
    s.directory,
  );
  assert.equal(existsSync(s.output), false);
  assert.equal(lstatSync(link).isSymbolicLink(), true);
  unchanged();
});

test('hard-linked input aliases are refused before observations are parsed', (t) => {
  const s = setup(t);
  const alias = join(s.directory, 'alias.json');
  linkSync(s.bundlePath, alias);
  const unchanged = preserve([s.bundlePath, s.observationsPath, alias]);
  s.args[4] = alias;
  diagnostic(
    invoke(s.args, s.directory),
    'E_INPUT_FILE',
    'observations',
    s.directory,
  );
  assert.equal(existsSync(s.output), false);
  unchanged();
});

test('output parent symlink is refused without following it for creation', (t) => {
  const s = setup(t);
  const parentLink = join(s.directory, 'linked-output-parent');
  symlinkSync(s.directory, parentLink, 'dir');
  s.args[s.args.length - 1] = join(parentLink, 'new-output.tar');
  const unchanged = preserve([s.bundlePath, s.observationsPath]);
  diagnostic(
    invoke(s.args, s.directory),
    'E_OUTPUT_PATH',
    'output',
    s.directory,
  );
  assert.equal(existsSync(join(s.directory, 'new-output.tar')), false);
  unchanged();
});

test('dangling output symlink remains untouched', (t) => {
  const s = setup(t);
  symlinkSync(join(s.directory, 'absent-target'), s.output);
  const unchanged = preserve([s.bundlePath, s.observationsPath]);
  diagnostic(
    invoke(s.args, s.directory),
    'E_OUTPUT_EXISTS',
    'output',
    s.directory,
  );
  assert.equal(lstatSync(s.output).isSymbolicLink(), true);
  assert.equal(existsSync(join(s.directory, 'absent-target')), false);
  unchanged();
});

test('output directory and missing output parent are rejected', (t) => {
  const s = setup(t);
  mkdirSync(s.output);
  const unchanged = preserve([s.bundlePath, s.observationsPath]);
  diagnostic(
    invoke(s.args, s.directory),
    'E_OUTPUT_EXISTS',
    'output',
    s.directory,
  );
  assert.deepEqual(readdirSync(s.output), []);
  s.args[s.args.length - 1] = join(s.directory, 'missing-parent', 'output.tar');
  diagnostic(
    invoke(s.args, s.directory),
    'E_OUTPUT_PATH',
    'output',
    s.directory,
  );
  assert.equal(existsSync(join(s.directory, 'missing-parent')), false);
  unchanged();
});

const jsonCases = [
  ['malformed JSON', Buffer.from('{'), 'E_JSON'],
  ['UTF-8 BOM', Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]), 'E_JSON'],
  ['invalid UTF-8', Buffer.from([0xc3, 0x28]), 'E_JSON'],
  [
    'escaped duplicate JSON keys',
    Buffer.from(`{"schema":"${sentinel}","\\u0073chema":"other"}`),
    'E_DUPLICATE',
  ],
  [
    '13 JSON containers',
    Buffer.from('['.repeat(13) + '0' + ']'.repeat(13)),
    'E_INPUT_LIMIT',
  ],
  ['one byte above input bound', Buffer.alloc(1048577, 0x20), 'E_INPUT_LIMIT'],
];
for (const [name, bytes, code] of jsonCases) {
  test(`input boundary rejects ${name}`, (t) => {
    const s = setup(t);
    writeFileSync(s.bundlePath, bytes);
    const unchanged = preserve([s.bundlePath, s.observationsPath]);
    diagnostic(invoke(s.args, s.directory), code, 'bundle', s.directory);
    assert.equal(existsSync(s.output), false);
    unchanged();
  });
}

const bundleCases = [
  [
    'unknown nested property',
    'E_SCHEMA',
    (b) => {
      b.content.sources[0][sentinel] = sentinel;
    },
  ],
  [
    'unknown schema version',
    'E_SCHEMA',
    (b) => {
      b.schema = 'prisma-prim-knowledge-bundle/v999';
    },
  ],
  [
    'unknown nested content version',
    'E_SCHEMA',
    (b) => {
      b.content.format = 'prisma-prim-synthetic-knowledge-content/v999';
    },
  ],
  [
    'non-synthetic data kind',
    'E_SCHEMA',
    (b) => {
      b.content.dataKind = 'anonymized_declared';
    },
  ],
  [
    'duplicate source identity',
    'E_DUPLICATE',
    (b) => {
      b.content.sources.push(structuredClone(b.content.sources[0]));
    },
  ],
  [
    'duplicate profile identity',
    'E_DUPLICATE',
    (b) => {
      b.content.profiles.push(structuredClone(b.content.profiles[0]));
    },
  ],
  [
    'duplicate case identity',
    'E_DUPLICATE',
    (b) => {
      b.expectations.cases.push(structuredClone(b.expectations.cases[0]));
    },
  ],
  [
    'missing field with invented value',
    'E_SCHEMA',
    (b) => {
      b.expectations.cases[15].expected.fields[0].value = sentinel;
    },
  ],
  [
    'contradictory field with selected value',
    'E_SCHEMA',
    (b) => {
      b.expectations.cases[16].expected.fields[0].value = '4';
    },
  ],
];
for (const [name, code, mutate] of bundleCases) {
  test(`bundle validation rejects ${name}`, (t) => {
    const s = setup(t);
    mutate(s.bundle);
    writeFileSync(s.bundlePath, JSON.stringify(s.bundle));
    const unchanged = preserve([s.bundlePath, s.observationsPath]);
    diagnostic(invoke(s.args, s.directory), code, 'bundle', s.directory);
    assert.equal(existsSync(s.output), false);
    unchanged();
  });
}

const observationCases = [
  [
    'unknown nested property',
    'E_SCHEMA',
    (r) => {
      r.observations[0][sentinel] = sentinel;
    },
  ],
  [
    'unknown schema version',
    'E_SCHEMA',
    (r) => {
      r.schema = 'prisma-prim-knowledge-observations/v999';
    },
  ],
  [
    'duplicate case observation',
    'E_DUPLICATE',
    (r) => {
      r.observations.push(structuredClone(r.observations[0]));
    },
  ],
  [
    'foreign corpus identity',
    'E_REFERENCE',
    (r) => {
      r.corpusId = 'FOREIGN-CORPUS';
    },
  ],
  [
    'incompatible corpus version',
    'E_REFERENCE',
    (r) => {
      r.corpusVersion = 2;
    },
  ],
  [
    'foreign expectation identity',
    'E_REFERENCE',
    (r) => {
      r.expectationSetId = 'FOREIGN-EXPECTATIONS';
    },
  ],
  [
    'incompatible expectation version',
    'E_REFERENCE',
    (r) => {
      r.expectationSetVersion = 2;
    },
  ],
  [
    'unknown case identity',
    'E_REFERENCE',
    (r) => {
      r.observations[0].caseId = 'UNDECLARED-CASE';
    },
  ],
  [
    'incompatible case version',
    'E_REFERENCE',
    (r) => {
      r.observations[0].caseVersion = 2;
    },
  ],
  [
    'incompatible profile',
    'E_REFERENCE',
    (r) => {
      r.observations[0].profileId = 'P-B';
    },
  ],
  [
    'incompatible purpose',
    'E_REFERENCE',
    (r) => {
      r.observations[0].purpose = 'analysis';
    },
  ],
  [
    'incompatible mode',
    'E_REFERENCE',
    (r) => {
      r.observations[0].mode = 'historical';
    },
  ],
  [
    'failed observation retaining evidence',
    'E_SCHEMA',
    (r) => {
      r.observations[0].status = 'failed';
    },
  ],
  [
    'not-run observation retaining evidence',
    'E_SCHEMA',
    (r) => {
      r.observations[0].status = 'not_run';
    },
  ],
  [
    'missing proposal with invented value',
    'E_SCHEMA',
    (r) => {
      r.observations[15].initialFields[0].value = sentinel;
    },
  ],
  [
    'contradictory proposal with selected value',
    'E_SCHEMA',
    (r) => {
      r.observations[16].initialFields[0].value = '4';
    },
  ],
];
for (const [name, code, mutate] of observationCases) {
  test(`observation validation rejects ${name}`, (t) => {
    const s = setup(t);
    mutate(s.observations);
    writeFileSync(s.observationsPath, JSON.stringify(s.observations));
    const unchanged = preserve([s.bundlePath, s.observationsPath]);
    diagnostic(invoke(s.args, s.directory), code, 'observations', s.directory);
    assert.equal(existsSync(s.output), false);
    unchanged();
  });
}

for (const status of ['failed', 'not_run']) {
  test(`${status} observation accepts explicit absent evidence without fabricating results`, (t) => {
    const s = setup(t);
    const observation = s.observations.observations[0];
    observation.status = status;
    for (const key of [
      'retrievalRefs',
      'outcome',
      'citations',
      'initialFields',
      'finalFields',
      'humanEventRef',
    ])
      observation[key] = null;
    writeFileSync(s.observationsPath, JSON.stringify(s.observations));
    const unchanged = preserve([s.bundlePath, s.observationsPath]);
    const execution = invoke(s.args, s.directory);
    assert.equal(execution.status, 0, execution.stderr);
    assert.equal(execution.stderr, '');
    const receipt = JSON.parse(execution.stdout);
    assert.equal(receipt.schema, 'prisma-prim-knowledge-receipt/v1');
    assert.equal(receipt.mode, 'evaluate');
    assert.equal(receipt.dataKind, 'synthetic');
    assert.equal(statSync(s.output).isFile(), true);
    assert.equal(statSync(s.output).mode & 0o777, 0o600);
    unchanged();
  });
}
