import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const gate = fileURLToPath(new URL('./verify-ci-results.mjs', import.meta.url));
const successfulResults = {
  checks: { result: 'success' },
  scope: {
    result: 'success',
    outputs: { docs_only: 'false', repeat_tests: 'true' },
  },
  postgres_image: { result: 'success' },
  api: { result: 'success' },
  web_unit: { result: 'success' },
  browser: { result: 'success' },
  acceptance: { result: 'success' },
  build: { result: 'success' },
  packaging: { result: 'success' },
  flaky_guard: { result: 'success' },
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

test('quality accepts skipped heavy families only after a successful docs-only scope', () => {
  const heavy = [
    'postgres_image',
    'api',
    'web_unit',
    'browser',
    'acceptance',
    'build',
    'packaging',
  ];
  const skippedHeavy = Object.fromEntries(
    [...heavy, 'flaky_guard'].map((job) => [job, { result: 'skipped' }]),
  );
  const docsOnly = invoke({
    checks: { result: 'success' },
    scope: { result: 'success', outputs: { docs_only: 'true' } },
    ...skippedHeavy,
  });
  assert.equal(docsOnly.status, 0, docsOnly.stderr);
  const failedScope = invoke({
    checks: { result: 'success' },
    scope: { result: 'failure', outputs: { docs_only: 'true' } },
    ...skippedHeavy,
  });
  assert.equal(failedScope.status, 1);
  assert.match(failedScope.stderr, /scope: failure/);
  assert.match(failedScope.stderr, /api: skipped/);
});

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

test('quality accepts explicitly proven reuse but never failed or cancelled suites', () => {
  const reused = {
    ...successfulResults,
    scope: {
      result: 'success',
      outputs: {
        docs_only: 'false',
        reuse_all: 'true',
        reuse_api: 'true',
        proof_run: '123',
      },
    },
  };
  for (const job of [
    'api',
    'web_unit',
    'browser',
    'acceptance',
    'build',
    'packaging',
  ])
    reused[job] = { result: 'skipped' };
  assert.equal(invoke(reused).status, 0);
  for (const result of ['failure', 'cancelled'])
    assert.equal(invoke({ ...reused, api: { result } }).status, 1);
  for (const proof_run of ['', undefined, 'invalid'])
    assert.equal(
      invoke({
        ...reused,
        scope: {
          result: 'success',
          outputs: { ...reused.scope.outputs, proof_run },
        },
      }).status,
      1,
    );
});
test('an API proof cannot waive a frontend or packaging suite', () => {
  const scope = {
    result: 'success',
    outputs: { docs_only: 'false', reuse_api: 'true', proof_run: '123' },
  };
  const results = { ...successfulResults, scope, api: { result: 'skipped' } };
  assert.equal(invoke(results).status, 0);
  for (const job of [
    'web_unit',
    'browser',
    'acceptance',
    'build',
    'packaging',
    'postgres_image',
  ])
    assert.equal(
      invoke({ ...results, [job]: { result: 'skipped' } }).status,
      1,
    );
});

const scopeWithRepeat = (repeat_tests, result = 'success') => ({
  result,
  outputs: { docs_only: 'false', repeat_tests },
});

test('quality accepts a skipped flaky_guard only when the scope proved no test file needs repeating', () => {
  const skippedGuard = {
    ...successfulResults,
    flaky_guard: { result: 'skipped' },
  };
  const proven = invoke({ ...skippedGuard, scope: scopeWithRepeat('false') });
  assert.equal(proven.status, 0, proven.stderr);
  for (const repeat_tests of ['true', '', 'unknown', undefined, 'FALSE']) {
    const child = invoke({
      ...skippedGuard,
      scope: scopeWithRepeat(repeat_tests),
    });
    assert.equal(child.status, 1, String(repeat_tests));
    assert.match(child.stderr, /flaky_guard: skipped/);
  }
  const failedScope = invoke({
    ...skippedGuard,
    scope: scopeWithRepeat('false', 'failure'),
  });
  assert.equal(failedScope.status, 1);
  assert.match(failedScope.stderr, /scope: failure/);
  assert.match(failedScope.stderr, /flaky_guard: skipped/);
});

test('a documentation-only change needs no repeat proof for its skipped flaky_guard', () => {
  const heavy = [
    'postgres_image',
    'api',
    'web_unit',
    'browser',
    'acceptance',
    'build',
    'packaging',
    'flaky_guard',
  ];
  const child = invoke({
    checks: { result: 'success' },
    scope: { result: 'success', outputs: { docs_only: 'true' } },
    ...Object.fromEntries(heavy.map((job) => [job, { result: 'skipped' }])),
  });
  assert.equal(child.status, 0, child.stderr);
});

test('a failed or cancelled flaky_guard blocks quality even when no repeat was required', () => {
  for (const repeat_tests of ['true', 'false'])
    for (const result of ['failure', 'cancelled']) {
      const child = invoke({
        ...successfulResults,
        scope: scopeWithRepeat(repeat_tests),
        flaky_guard: { result },
      });
      assert.equal(child.status, 1, `${repeat_tests} ${result}`);
      assert.match(child.stderr, new RegExp(`flaky_guard: ${result}`));
    }
});

test('proof reuse never waives a required flaky_guard', () => {
  const reused = {
    ...successfulResults,
    scope: {
      result: 'success',
      outputs: {
        docs_only: 'false',
        repeat_tests: 'true',
        reuse_all: 'true',
        reuse_api: 'true',
        proof_run: '123',
      },
    },
    flaky_guard: { result: 'skipped' },
  };
  for (const job of [
    'api',
    'web_unit',
    'browser',
    'acceptance',
    'build',
    'packaging',
  ])
    reused[job] = { result: 'skipped' };
  const child = invoke(reused);
  assert.equal(child.status, 1);
  assert.match(child.stderr, /flaky_guard: skipped/);
  assert.doesNotMatch(child.stderr, /api:|web_unit:/);
});
