import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const script = (
  await readFile(new URL('./ci-start-postgres.sh', import.meta.url), 'utf8')
).replaceAll('\r\n', '\n');

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
