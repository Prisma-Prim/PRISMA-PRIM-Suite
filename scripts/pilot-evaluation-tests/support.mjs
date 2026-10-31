import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const command = fileURLToPath(
  new URL('../pilot-evaluation.mjs', import.meta.url),
);
const fixtures = new URL('../fixtures/pilot-evaluation/', import.meta.url);
const receipt =
  '{"schema":"prisma-prim-pilot-receipt/v2","dataKind":"synthetic","measurementBasis":"declared_inputs_unverified","format":"ustar","entries":["result.json","report.md"]}\n';
const limitation =
  'Timings, references and hashes are supplied declarations. This command performs no independent measurement, source-byte authenticity check or semantic-support verification.';

function invoke(args, options = {}) {
  const { nodeArgs = [], entry = command, ...spawnOptions } = options;
  return spawnSync(process.execPath, [...nodeArgs, entry, ...args], {
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 1048576,
    env: { PATH: process.env.PATH },
    ...spawnOptions,
  });
}

// Verification only, using the independently qualified existing stdlib reader.
// No extraction, archive input mode or runtime archive parser is introduced.
function readContainer(path) {
  const child = spawnSync(
    'python3',
    [
      '-c',
      `
import tarfile,json,base64,sys
with tarfile.open(sys.argv[1],mode='r:') as reader:
 members=reader.getmembers()
 assert [m.name for m in members]==['result.json','report.md']
 assert all(m.isfile() and m.type==b'0' and m.mode==0o600 and m.uid==m.gid==m.mtime==0 and m.uname==m.gname==m.linkname=='' and m.devmajor==m.devminor==0 and not m.pax_headers for m in members)
 payloads=[reader.extractfile(m).read() for m in members]
 assert all(len(data)==m.size for m,data in zip(members,payloads))
 print(json.dumps([base64.b64encode(data).decode('ascii') for data in payloads]))
`,
      path,
    ],
    {
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 100000000,
      env: { PATH: process.env.PATH },
    },
  );
  assert.equal(child.status, 0, child.stderr);
  return Object.fromEntries(
    ['result.json', 'report.md'].map((name, index) => [
      name,
      Buffer.from(JSON.parse(child.stdout)[index], 'base64'),
    ]),
  );
}
const member = (path, name, encoding) => {
  const bytes = readContainer(path)[name];
  return encoding ? bytes.toString(encoding) : bytes;
};

function setup(t, name = 'one', runName = name) {
  const directory = mkdtempSync(join(tmpdir(), 'pilot-evaluation-v2-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const cases = readFileSync(new URL(`${name}.cases.json`, fixtures));
  const runs = readFileSync(new URL(`${runName}.runs.json`, fixtures));
  const casesPath = join(directory, 'cases.json');
  const runsPath = join(directory, 'runs.json');
  writeFileSync(casesPath, cases);
  writeFileSync(runsPath, runs);
  const output = join(directory, 'result.tar');
  return {
    directory,
    cases,
    runs,
    casesPath,
    runsPath,
    output,
    args: ['--cases', casesPath, '--runs', runsPath, '--output', output],
  };
}
function diagnostic(execution, code, input, location = null) {
  assert.equal(
    execution.status,
    [
      'E_INPUT_FILE',
      'E_OUTPUT_PATH',
      'E_OUTPUT_EXISTS',
      'E_OUTPUT_LIMIT',
      'E_OUTPUT_WRITE',
    ].includes(code)
      ? 3
      : code === 'E_INTERNAL'
        ? 1
        : 2,
    execution.stderr,
  );
  assert.equal(execution.stdout, '');
  assert.ok(Buffer.byteLength(execution.stderr) <= 2048);
  assert.equal(execution.stderr.split('\n').length, 2);
  const value = JSON.parse(execution.stderr);
  assert.deepEqual(Object.keys(value), [
    'schema',
    'code',
    'input',
    'location',
    'message',
    'example',
  ]);
  assert.equal(value.schema, 'prisma-prim-pilot-error/v1');
  assert.equal(value.code, code);
  assert.equal(value.input, input);
  assert.equal(value.location, location);
  assert.ok(
    value.example.includes(
      'node scripts/pilot-evaluation.mjs --cases /tmp/pilot/cases.json',
    ),
  );
  assert.ok(value.message.includes('unverified'));
  assert.ok(!execution.stderr.includes('Error:'));
  return value;
}
const fixtureObjects = (input) => ({
  cases: JSON.parse(input.cases),
  runs: JSON.parse(input.runs),
});
function writeInputs(input, values) {
  writeFileSync(input.casesPath, JSON.stringify(values.cases));
  writeFileSync(input.runsPath, JSON.stringify(values.runs));
}
function successful(t, mutate = () => {}, name = 'one', runName = name) {
  const input = setup(t, name, runName);
  const values = fixtureObjects(input);
  mutate(values);
  writeInputs(input, values);
  const execution = invoke(input.args);
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stderr, '');
  assert.equal(
    execution.stdout,
    receipt.replace('"synthetic"', `"${values.cases.dataKind}"`),
  );
  const members = readContainer(input.output);
  return {
    input,
    values,
    result: JSON.parse(members['result.json']),
    report: members['report.md'].toString('utf8'),
  };
}
const at = (value, pointer) =>
  pointer
    .split('/')
    .slice(1)
    .reduce((current, key) => current[key], value);
function preload(input, source) {
  const path = join(
    input.directory,
    `preload-${readdirSync(input.directory).length}.mjs`,
  );
  writeFileSync(path, source);
  return ['--import', path];
}
export {
  command,
  fixtures,
  receipt,
  limitation,
  invoke,
  setup,
  diagnostic,
  fixtureObjects,
  writeInputs,
  successful,
  at,
  preload,
  readContainer,
  member,
};
