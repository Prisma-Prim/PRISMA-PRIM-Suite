import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const script = (
  await readFile(new URL('./ci-start-postgres.sh', import.meta.url), 'utf8')
).replaceAll('\r\n', '\n');

test('a cached image is loaded instead of pulled', () => {
  const load = script.indexOf('docker load --input "$archive"');
  const pull = script.indexOf('docker pull "$postgres_image"');
  assert.notEqual(load, -1);
  assert.ok(load < pull, 'the cache is consulted before any pull');
  assert.match(script, /if \[ -s "\$archive" \]; then/);
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

test('a fresh pull is saved for the other shards and the server runs without pulling', () => {
  assert.match(script, /docker save --output "\$archive" "\$postgres_image"/);
  assert.match(script, /echo 'saved=true' >>"\$GITHUB_OUTPUT"/);
  assert.match(script, /docker run --pull=never --detach --name ci-postgres/);
  assert.match(script, /--publish 127\.0\.0\.1:5432:5432/);
  assert.match(
    script,
    /test "\$\(cat \/proc\/1\/comm\)" = postgres && pg_isready/,
  );
});
