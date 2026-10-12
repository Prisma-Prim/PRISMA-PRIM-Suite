import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const postgresImage =
  'public.ecr.aws/docker/library/postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
const script = fileURLToPath(
  new URL('./railway-packaging-smoke.sh', import.meta.url),
);

function smoke(scenario, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'packaging-test-'));
  const log = join(directory, 'commands.jsonl');
  const boundary = `${'#!' + process.execPath}
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { spawnSync } from 'node:child_process';
const command = basename(process.argv[1]);
const args = process.argv.slice(2);
appendFileSync(process.env.COMMAND_LOG, JSON.stringify([command, ...args]) + '\\n');
const scenario = JSON.parse(process.env.SCENARIO);
const counter = process.env.COMMAND_LOG + '.pulls';
function pull() {
  const attempt = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) + 1 : 1;
  writeFileSync(counter, String(attempt));
  if (attempt <= (scenario.throttles ?? 0)) {
    console.error('toomanyrequests: Rate exceeded'); process.exit(125);
  }
  if (scenario.error) { console.error(scenario.error); process.exit(125); }
}
if (command === 'timeout') {
  if (scenario.timeout) {
    console.error('toomanyrequests: Rate exceeded'); process.exit(scenario.timeout);
  }
  const result = spawnSync(args[2], args.slice(3), { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
if (command === 'sleep') process.exit(0);
if (command === 'curl') {
  const url = args.find((arg) => arg.startsWith('http:'));
  if (args.includes('--write-out')) console.log(url.includes('current-actor') ? '401' : '404');
  else if (url.includes('/api/health')) console.log(JSON.stringify({ service: 'prisma-prim-api', status: 'ok' }));
  else console.log('synthetic web response');
  process.exit(0);
}
if (args[0] === 'pull' || (args[0] === 'run' && !args.includes('--pull=never') && args.includes(${JSON.stringify(postgresImage)}))) pull();
if (args[0] === 'build' && scenario.later === 'build') process.exit(42);
if (args[0] === 'run' && args.includes('--rm') && !args.includes('migrate')) {
  console.error('CLERK_PUBLISHABLE_KEY is required'); process.exit(1);
}
if (args.includes('migrate') && scenario.later === 'migration') process.exit(43);
if (args[0] === 'run' && args.includes('--detach') && args.some((arg) => arg.startsWith('prisma-prim-api:')) && scenario.later === 'runtime') process.exit(44);
if (args[0] === 'port') console.log(args.includes('4317/tcp') ? '127.0.0.1:4317' : '127.0.0.1:4318');
`;
  try {
    for (const command of ['docker', 'curl', 'timeout', 'sleep']) {
      const path = join(directory, command);
      writeFileSync(path, boundary);
      chmodSync(path, 0o755);
    }
    const result = spawnSync('bash', [script], {
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        COMMAND_LOG: log,
        SCENARIO: JSON.stringify(scenario),
        ...environment,
      },
      encoding: 'utf8',
      timeout: 15_000,
    });
    assert.ifError(result.error);
    const commands = readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse);
    return { ...result, commands };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('packaging recovers one PostgreSQL throttle and completes the smoke journey', () => {
  const result = smoke({ throttles: 1 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /PASS image startup/);
  assert.equal(
    result.commands.filter(
      ([command, operation]) => command === 'docker' && operation === 'pull',
    ).length,
    2,
  );
});

function acquisitions(result) {
  return result.commands.filter(
    ([command, operation]) => command === 'docker' && operation === 'pull',
  );
}

function requireCleanup(result) {
  const removals = result.commands.filter(
    ([command, operation]) => command === 'docker' && operation === 'rm',
  );
  assert.equal(removals.length, 1);
  assert.match(removals[0][3], /^railway-packaging-\d+-web$/);
  assert.match(removals[0][4], /^railway-packaging-\d+-api$/);
  assert.match(removals[0][5], /^railway-packaging-\d+-postgres$/);
  assert.equal(
    result.commands.filter(
      ([command, operation, action]) =>
        command === 'docker' && operation === 'network' && action === 'rm',
    ).length,
    1,
  );
  const images = result.commands.filter(
    ([command, operation, action]) =>
      command === 'docker' && operation === 'image' && action === 'rm',
  );
  assert.equal(images.length, 1);
  assert.ok(
    images[0].slice(3).every((image) => image.startsWith('prisma-prim-')),
  );
}

function requireAcquisitionBounds(result, count) {
  assert.deepEqual(
    acquisitions(result),
    Array.from({ length: count }, () => ['docker', 'pull', postgresImage]),
  );
  assert.deepEqual(
    result.commands.filter(([command]) => command === 'timeout'),
    Array.from({ length: count }, () => [
      'timeout',
      '--signal=KILL',
      '60s',
      'docker',
      'pull',
      postgresImage,
    ]),
  );
  const waits = result.commands
    .filter(([command]) => command === 'sleep')
    .map(([, seconds]) => Number(seconds));
  assert.equal(waits.length, count - 1);
  for (const [index, seconds] of waits.entries()) {
    const base = [5, 10, 20][index];
    assert.ok(
      Number.isInteger(seconds) && seconds >= base && seconds <= base + 2,
    );
  }
  assert.ok(
    60 * count + waits.reduce((sum, seconds) => sum + seconds, 0) <= 281,
  );
  requireCleanup(result);
}

test('packaging acquires the same pinned image once before builds and prohibits an implicit pull', () => {
  const result = smoke({});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  requireAcquisitionBounds(result, 1);
  const pullIndex = result.commands.findIndex(
    ([command, operation]) => command === 'docker' && operation === 'pull',
  );
  const builds = result.commands.filter(
    ([command, operation]) => command === 'docker' && operation === 'build',
  );
  assert.equal(builds.length, 2);
  assert.ok(pullIndex < result.commands.indexOf(builds[0]));
  const postgres = result.commands.filter(
    ([command, operation, ...args]) =>
      command === 'docker' &&
      operation === 'run' &&
      args.includes(postgresImage),
  );
  assert.equal(postgres.length, 1);
  assert.ok(postgres[0].includes('--pull=never'));
  assert.equal(
    result.commands.filter((args) => args.includes('migrate')).length,
    2,
  );
  assert.match(result.stdout, /PASS image startup/);
});

test('packaging completes after three throttles within the four-attempt and delay limits', () => {
  const result = smoke({ throttles: 3 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  requireAcquisitionBounds(result, 4);
});

test('persistent throttling stops at four attempts before any build or runtime', () => {
  const result = smoke({ throttles: 10 });
  assert.equal(result.status, 125);
  requireAcquisitionBounds(result, 4);
  assert.match(result.stderr, /exhausted four throttled attempts/);
  assert.equal(
    result.commands.filter(
      ([command, operation]) =>
        command === 'docker' && ['build', 'run'].includes(operation),
    ).length,
    0,
  );
});

for (const status of [124, 137]) {
  test(`acquisition timeout ${status} never retries even with partial throttling output`, () => {
    const result = smoke({ timeout: status });
    assert.equal(result.status, status);
    assert.equal(acquisitions(result).length, 0);
    assert.equal(
      result.commands.filter(([command]) => command === 'timeout').length,
      1,
    );
    assert.equal(
      result.commands.filter(([command]) => command === 'sleep').length,
      0,
    );
    assert.match(result.stderr, /timed out; no retry/);
    assert.equal(
      result.commands.filter(
        ([command, operation]) =>
          command === 'docker' && ['build', 'run'].includes(operation),
      ).length,
      0,
    );
    requireCleanup(result);
  });
}

for (const error of [
  'denied: access forbidden',
  'manifest unknown',
  'invalid checksum digest format',
  'Cannot connect to the Docker daemon',
  'unrelated failure with exit 125',
  'toomanyrequests: another quota error',
]) {
  test(`acquisition fails without retry for ${error}`, () => {
    const result = smoke({ error });
    assert.equal(result.status, 125);
    requireAcquisitionBounds(result, 1);
    assert.match(result.stderr, /without the retryable throttle; no retry/);
    assert.equal(
      result.commands.filter(
        ([command, operation]) =>
          command === 'docker' && ['build', 'run'].includes(operation),
      ).length,
      0,
    );
  });
}

for (const [later, status] of [
  ['build', 42],
  ['migration', 43],
  ['runtime', 44],
]) {
  test(`a later ${later} failure stops the journey without reacquisition or retry`, () => {
    const result = smoke({ throttles: 1, later });
    assert.equal(result.status, status);
    requireAcquisitionBounds(result, 2);
    assert.doesNotMatch(result.stdout, /PASS image startup/);
    const builds = result.commands.filter(
      ([command, operation]) => command === 'docker' && operation === 'build',
    );
    assert.equal(builds.length, later === 'build' ? 1 : 2);
    assert.equal(
      result.commands.filter((args) => args.includes('migrate')).length,
      later === 'build' ? 0 : later === 'migration' ? 1 : 2,
    );
    if (later === 'runtime') {
      assert.equal(
        result.commands.filter(
          ([command, operation, ...args]) =>
            command === 'docker' &&
            operation === 'run' &&
            args.includes('--detach') &&
            args.some((arg) => arg.startsWith('prisma-prim-api:')),
        ).length,
        1,
      );
    }
  });
}

test('packaging loads the cached PostgreSQL archive and never pulls it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'packaging-archive-'));
  const archive = join(directory, 'postgres.tar');
  writeFileSync(archive, 'archived image');
  try {
    const result = smoke({}, { POSTGRES_IMAGE_ARCHIVE: archive });
    assert.equal(result.status, 0, result.stderr);
    const docker = result.commands.filter(([command]) => command === 'docker');
    assert.deepEqual(
      docker.find(([, operation]) => operation === 'load'),
      ['docker', 'load', '--input', archive],
    );
    assert.equal(
      docker.filter(([, operation]) => operation === 'pull').length,
      0,
    );
    const postgres = docker.find(
      ([, operation, ...rest]) =>
        operation === 'run' &&
        rest.includes('prisma-prim-ci/postgres:17-pinned'),
    );
    assert.ok(postgres, 'PostgreSQL runs from the loaded local tag');
    assert.ok(postgres.includes('--pull=never'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
