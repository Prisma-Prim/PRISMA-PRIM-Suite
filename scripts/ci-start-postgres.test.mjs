import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = (
  await readFile(new URL('./ci-start-postgres.sh', import.meta.url), 'utf8')
).replaceAll('\r\n', '\n');

test('start gives only disposable PostgreSQL data a bounded memory filesystem', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ci-postgres-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const archive = join(directory, 'postgres.tar');
  const calls = join(directory, 'docker.jsonl');
  await writeFile(archive, 'cached image');
  await writeFile(
    join(directory, 'docker'),
    `#!${process.execPath}\n` +
      `require('node:fs').appendFileSync(process.env.DOCKER_CALLS, JSON.stringify(process.argv.slice(2)) + '\\n');\n`,
    { mode: 0o755 },
  );
  const result = spawnSync(
    'bash',
    [
      fileURLToPath(new URL('./ci-start-postgres.sh', import.meta.url)),
      'start',
    ],
    {
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        POSTGRES_IMAGE_ARCHIVE: archive,
        DOCKER_CALLS: calls,
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const commands = (await readFile(calls, 'utf8'))
    .trim()
    .split('\n')
    .map(JSON.parse);
  const run = commands.find(([command]) => command === 'run');
  assert.ok(run, 'start must launch the server');
  const mounts = run.flatMap((arg, index) =>
    arg === '--tmpfs' ? [run[index + 1]] : [],
  );
  assert.deepEqual(mounts, [
    '/var/lib/postgresql/data:rw,nosuid,nodev,size=2g',
  ]);
  assert.equal(run.at(-1), 'prisma-prim-ci/postgres:17-pinned');
  assert.ok(
    !run.includes('-c'),
    'keep the image defaults for PostgreSQL durability',
  );
});

test('start loads a cached image and pulls only when it is missing', () => {
  const start = script.slice(script.indexOf('  start)'));
  const load = start.indexOf('docker load --input "$archive"');
  const pull = start.indexOf('pull_pinned_image');
  assert.notEqual(load, -1);
  assert.ok(load < pull, 'the cache is consulted before any pull');
  assert.match(start, /if \[ -s "\$archive" \]; then/);
});

test('only registry throttling is retried, at most five bounded attempts', () => {
  assert.match(script, /for attempt in 1 2 3 4 5; do/);
  assert.match(script, /timeout --signal=KILL 90s docker pull/);
  assert.match(script, /if ! grep -Fq 'toomanyrequests: Rate exceeded'/);
  assert.match(script, /exit "\$pull_status"/);
  assert.match(
    script,
    /delay=\$\(\( \(10 << \(attempt - 1\)\) \+ RANDOM % 5 \)\)/,
  );
});

test('acquire saves the image under a stable local tag that survives save and load', () => {
  // docker save/load drops a digest-only reference, so the archive and the
  // container use a local tag of the digest-pinned image.
  assert.match(script, /local_image='prisma-prim-ci\/postgres:17-pinned'/);
  assert.match(script, /docker tag "\$postgres_image" "\$local_image"/);
  const acquire = script.slice(
    script.indexOf('  acquire)'),
    script.indexOf('  start)'),
  );
  assert.match(acquire, /docker save --output "\$archive" "\$local_image"/);
  assert.match(acquire, /exit 0/);
});

test('the server runs the local tag without pulling', () => {
  assert.match(script, /docker run --pull=never --detach --name ci-postgres/);
  assert.match(script, /"\$local_image" >\/dev\/null/);
  assert.match(script, /--publish 127\.0\.0\.1:5432:5432/);
  assert.match(
    script,
    /test "\$\(cat \/proc\/1\/comm\)" = postgres && pg_isready/,
  );
});
