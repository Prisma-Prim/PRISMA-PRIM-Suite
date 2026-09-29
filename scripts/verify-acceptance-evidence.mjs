import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const webDirectory = fileURLToPath(new URL('../apps/web/', import.meta.url));
const requireWeb = createRequire(path.join(webDirectory, 'package.json'));
const outputDirectory = path.join(
  webDirectory,
  'test-results/acceptance-evidence-probe',
);
const child = spawnSync(
  process.execPath,
  [
    requireWeb.resolve('@playwright/test/cli'),
    'test',
    '--config',
    'playwright.evidence.config.ts',
  ],
  { cwd: webDirectory, encoding: 'utf8', timeout: 60_000 },
);
assert.ifError(child.error);
assert.equal(
  child.status,
  1,
  `Expected the deliberate probe failure.\n${child.stdout}\n${child.stderr}`,
);
assert.match(child.stdout, /Client deliberately absent/u);

const files = await readdir(outputDirectory, { recursive: true });
function findFile(name) {
  const file = files.find((entry) => path.basename(entry) === name);
  assert.ok(file, `Missing failure artifact: ${name}`);
  return path.join(outputDirectory, file);
}
const context = await readFile(findFile('error-context.md'), 'utf8');
assert.match(context, /Client evidence probe/u);
const screenshot = await readFile(findFile('test-failed-1.png'));
assert.deepEqual(
  [...screenshot.subarray(0, 8)],
  [137, 80, 78, 71, 13, 10, 26, 10],
);
const trace = await readFile(findFile('trace.zip'));
assert.equal(trace.readUInt32LE(0), 0x04034b50);
assert.ok(trace.length > 100, 'The trace must contain more than a ZIP header.');
const timelineText = await readFile(
  findFile('client-registration-timeline.json'),
  'utf8',
);
assert.doesNotMatch(
  timelineText,
  /canary|authorization|cookie|privateDetails|\/unrelated/iu,
);
const timeline = JSON.parse(timelineText);
assert.ok(Array.isArray(timeline));
const requests = timeline.filter((event) => event.kind === 'request');
assert.equal(requests.length, 4);
assert.deepEqual(
  requests.map((event) => event.method),
  ['GET', 'GET', 'POST', 'GET'],
);
assert.ok(
  requests.every((event) => event.companyContextId === 'evidence-company'),
);
assert.deepEqual(
  timeline
    .filter((event) => event.kind === 'response')
    .map((event) => event.status),
  [200, 503, 201],
);
assert.ok(
  timeline.some(
    (event) =>
      event.kind === 'list' &&
      event.clientIds.length === 1 &&
      event.clientIds[0] === 'evidence-client',
  ),
);
assert.equal(timeline.filter((event) => event.kind === 'finished').length, 3);
assert.equal(timeline.filter((event) => event.kind === 'failed').length, 1);
assert.ok(
  timeline.every(
    (event) => typeof event.elapsedMs === 'number' && event.elapsedMs >= 0,
  ),
);
console.log(
  'Acceptance evidence verified: intentional failure, context, PNG, trace, exact Client statuses and sanitized timeline.',
);
