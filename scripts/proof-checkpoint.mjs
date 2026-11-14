import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EvidenceError,
  openPrivateEvidence,
  readPrivateJson,
  writePrivateJson,
} from './private-evidence.mjs';

const schema = 'prisma-prim-proof-checkpoint/v1';
const checks = [
  'scripts',
  'types',
  'lint',
  'format',
  'build',
  'web-unit',
  'api',
  'browser',
  'acceptance',
  'journey',
  'focused',
];
const runPattern =
  /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/u;
const usage =
  'Usage: node scripts/proof-checkpoint.mjs begin --issue N --check NAME | finish --issue N --run ID --exit-code N | resume --issue N [--root DIR]';

function shape(value, keys) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function positive(value) {
  return Number.isSafeInteger(value) && value > 0;
}
function timestamp(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
function source(value) {
  return (
    shape(value, ['head', 'clean', 'node', 'platform', 'arch']) &&
    /^[a-f\d]{40}(?:[a-f\d]{24})?$/u.test(value.head) &&
    typeof value.clean === 'boolean' &&
    /^v\d+\.\d+\.\d+$/u.test(value.node) &&
    ['aix', 'darwin', 'freebsd', 'linux', 'openbsd', 'sunos', 'win32'].includes(
      value.platform,
    ) &&
    [
      'arm',
      'arm64',
      'ia32',
      'loong64',
      'mips',
      'mipsel',
      'ppc64',
      'riscv64',
      's390x',
      'x64',
    ].includes(value.arch)
  );
}

function validate(value, kind, context, issue, run) {
  const keys =
    kind === 'begin'
      ? [
          'schema',
          'kind',
          'repository',
          'run',
          'issue',
          'check',
          'source',
          'startedAt',
          'pullRequest',
          'ciRun',
        ]
      : [
          'schema',
          'kind',
          'repository',
          'run',
          'issue',
          'source',
          'finishedAt',
          'exitCode',
        ];
  if (
    !shape(value, keys) ||
    value.schema !== schema ||
    value.kind !== kind ||
    value.repository !== context.repository ||
    value.issue !== issue ||
    value.run !== run ||
    !runPattern.test(value.run) ||
    !source(value.source) ||
    (kind === 'begin'
      ? !checks.includes(value.check) ||
        !timestamp(value.startedAt) ||
        ![value.pullRequest, value.ciRun].every(
          (number) => number === null || positive(number),
        )
      : !Number.isSafeInteger(value.exitCode) ||
        value.exitCode < 0 ||
        value.exitCode > 255 ||
        !timestamp(value.finishedAt))
  )
    throw new EvidenceError(
      'Private checkpoint has unknown or malformed technical fields.',
    );
  return value;
}

function status(begin, end, current) {
  if (
    begin.source.head !== current.head ||
    (end && end.source.head !== current.head)
  )
    return 'stale';
  if (!begin.source.clean || !current.clean || !end || !end.source.clean)
    return 'incomplete';
  for (const key of ['node', 'platform', 'arch'])
    if (begin.source[key] !== current[key] || end.source[key] !== current[key])
      return 'incomplete';
  return end.exitCode === 0 ? 'recorded-pass' : 'recorded-fail';
}

function options(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      ![
        '--issue',
        '--check',
        '--run',
        '--exit-code',
        '--pr',
        '--ci-run',
        '--root',
      ].includes(flag) ||
      !value ||
      value.startsWith('--') ||
      result.has(flag)
    )
      throw new EvidenceError(usage);
    result.set(flag, value);
  }
  return result;
}

function integer(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (
    !/^(?:0|[1-9]\d*)$/u.test(value ?? '') ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > maximum
  )
    throw new EvidenceError(`${label} needs a whole number.`);
  return Number(value);
}

async function main(argv) {
  if (
    (argv.length === 1 && argv[0] === '--help') ||
    (argv.length === 2 &&
      ['begin', 'finish', 'resume'].includes(argv[0]) &&
      argv[1] === '--help')
  ) {
    console.log(
      `${usage}\nChecks: ${checks.join(', ')}\nExamples:\n  node scripts/proof-checkpoint.mjs begin --issue 1367 --check scripts\n  node scripts/proof-checkpoint.mjs finish --issue 1367 --run <generated-id> --exit-code 0\n  node scripts/proof-checkpoint.mjs resume --issue 1367\nOptional: --root DIR (all actions), --pr N and --ci-run N (begin only).\nResults record observations; they do not certify CI or execute saved commands.`,
    );
    return;
  }
  const [action, ...args] = argv;
  if (!['begin', 'finish', 'resume'].includes(action))
    throw new EvidenceError(usage);
  const values = options(args);
  const issue = integer(values.get('--issue'), '--issue');
  if (!positive(issue))
    throw new EvidenceError('--issue needs a positive number.');
  const allowed =
    action === 'begin'
      ? ['--issue', '--check', '--pr', '--ci-run', '--root']
      : action === 'finish'
        ? ['--issue', '--run', '--exit-code', '--root']
        : ['--issue', '--root'];
  if ([...values.keys()].some((key) => !allowed.includes(key)))
    throw new EvidenceError(usage);
  if (action === 'begin' && !checks.includes(values.get('--check')))
    throw new EvidenceError('Choose a supported technical check name.');
  if (action === 'finish' && !runPattern.test(values.get('--run') ?? ''))
    throw new EvidenceError('A generated run identifier is required.');
  const context = openPrivateEvidence({ root: values.get('--root'), issue });
  const beginFile = (run) => join(context.directory, `${run}.begin.json`);
  const endFile = (run) => join(context.directory, `${run}.end.json`);
  const read = (run, kind) =>
    validate(
      readPrivateJson(kind === 'begin' ? beginFile(run) : endFile(run)),
      kind,
      context,
      issue,
      run,
    );
  if (action === 'begin') {
    const run = randomUUID();
    const record = {
      schema,
      kind: 'begin',
      repository: context.repository,
      run,
      issue,
      check: values.get('--check'),
      source: context.source,
      startedAt: new Date().toISOString(),
      pullRequest: values.has('--pr')
        ? integer(values.get('--pr'), '--pr')
        : null,
      ciRun: values.has('--ci-run')
        ? integer(values.get('--ci-run'), '--ci-run')
        : null,
    };
    validate(record, 'begin', context, issue, run);
    if (!writePrivateJson(beginFile(run), record))
      throw new EvidenceError('Generated run already exists.');
    console.log(
      JSON.stringify({
        run,
        issue,
        check: record.check,
        status: 'incomplete',
        scope: 'recorded-metadata',
      }),
    );
    return;
  }
  if (action === 'finish') {
    const run = values.get('--run');
    const begin = read(run, 'begin');
    let end = {
      schema,
      kind: 'finish',
      repository: context.repository,
      run,
      issue,
      source: context.source,
      finishedAt: new Date().toISOString(),
      exitCode: integer(values.get('--exit-code'), '--exit-code', 255),
    };
    validate(end, 'finish', context, issue, run);
    if (!writePrivateJson(endFile(run), end)) {
      const existing = read(run, 'finish');
      if (
        existing.exitCode !== end.exitCode ||
        JSON.stringify(existing.source) !== JSON.stringify(end.source)
      )
        throw new EvidenceError(
          'This run already has a different immutable result.',
        );
      end = existing;
    }
    console.log(
      JSON.stringify({
        run,
        issue,
        status: status(begin, end, context.source),
        exitCode: end.exitCode,
        scope: 'recorded-metadata',
      }),
    );
    return;
  }
  const runs = readdirSync(context.directory)
    .filter((file) => file.endsWith('.begin.json'))
    .map((file) => {
      const run = file.slice(0, -'.begin.json'.length);
      if (!runPattern.test(run))
        throw new EvidenceError(
          'Private checkpoint file has an unknown identity.',
        );
      const begin = read(run, 'begin');
      const end = existsSync(endFile(run)) ? read(run, 'finish') : null;
      return {
        run,
        issue,
        check: begin.check,
        head: begin.source.head,
        pullRequest: begin.pullRequest,
        ciRun: begin.ciRun,
        startedAt: begin.startedAt,
        finishedAt: end?.finishedAt ?? null,
        exitCode: end?.exitCode ?? null,
        status: status(begin, end, context.source),
      };
    })
    .sort(
      (left, right) =>
        left.startedAt.localeCompare(right.startedAt) ||
        left.run.localeCompare(right.run),
    );
  console.log(
    JSON.stringify({ schema, issue, scope: 'recorded-metadata', runs }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(
      error instanceof EvidenceError
        ? error.message
        : 'Private checkpoint operation could not be completed.',
    );
    process.exitCode = 2;
  }
}
