import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const gate = fileURLToPath(new URL('./verify-ci-results.mjs', import.meta.url));
const successfulResults = {
  checks: { result: 'success' },
  api: { result: 'success' },
  web_unit: { result: 'success' },
  browser: { result: 'success' },
  acceptance: { result: 'success' },
  build: { result: 'success' },
  packaging: { result: 'success' },
};

function invoke(results) {
  return spawnSync(process.execPath, [gate], {
    env: { CI_JOB_RESULTS: JSON.stringify(results) },
    encoding: 'utf8',
  });
}

test('quality succeeds only after every required verification succeeds', () => {
  const child = invoke(successfulResults);
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /All required CI jobs succeeded/);
});

for (const job of Object.keys(successfulResults)) {
  for (const outcome of ['failure', 'cancelled', 'skipped', 'unknown', null]) {
    test(`quality rejects ${job} with outcome ${outcome}`, () => {
      const child = invoke({
        ...successfulResults,
        [job]: { result: outcome },
      });
      assert.equal(child.status, 1);
      assert.match(child.stderr, new RegExp(`${job}:`));
      assert.doesNotMatch(child.stdout, /All required CI jobs succeeded/);
    });
  }
  test(`quality rejects missing ${job} even when every other job succeeds`, () => {
    const results = { ...successfulResults };
    delete results[job];
    const child = invoke(results);
    assert.equal(child.status, 1);
    assert.match(child.stderr, new RegExp(`${job}: missing`));
  });
  test(`quality rejects ${job} without a result`, () => {
    const child = invoke({ ...successfulResults, [job]: {} });
    assert.equal(child.status, 1);
    assert.match(child.stderr, new RegExp(`${job}: missing`));
  });
}

for (const input of [undefined, '', '{', 'null', '[]', '"success"']) {
  test(`quality rejects malformed results ${String(input)}`, () => {
    const child = spawnSync(process.execPath, [gate], {
      env: input === undefined ? {} : { CI_JOB_RESULTS: input },
      encoding: 'utf8',
    });
    assert.equal(child.status, 1);
    assert.match(child.stderr, /CI_JOB_RESULTS must be a JSON object/);
  });
}
