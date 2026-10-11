import assert from 'node:assert/strict';
import test from 'node:test';
import { changedFiles, isDocumentationOnly } from './ci-change-scope.mjs';
import { unsuccessfulJobs } from './verify-ci-results.mjs';

const pullRequest = (files) =>
  isDocumentationOnly({ event: 'pull_request', files });

test('only pull requests changing nothing but Markdown under docs/ are docs-only', () => {
  assert.equal(pullRequest(['docs/product/prd-index.md']), true);
  assert.equal(
    pullRequest([
      'docs/product/release-3-commercial-workflow-prd.md',
      'docs/agents/issue-execution.md',
    ]),
    true,
  );
});

test('any doubt or non-documentation file classifies the change as a full run', () => {
  for (const files of [
    ['docs/product/prd-index.md', 'apps/api/src/main.ts'],
    ['docs/product/first-tenant-substitution-register.csv'],
    ['AGENTS.md'],
    ['CONTEXT.md'],
    ['.github/workflows/ci.yml'],
    ['scripts/ci-change-scope.mjs'],
    ['docs/product/notes.md.bak'],
    ['documentation/readme.md'],
    ['docs/'],
    [],
    undefined,
    [42],
  ])
    assert.equal(pullRequest(files), false, JSON.stringify(files));
  for (const event of ['push', 'workflow_dispatch', undefined, ''])
    assert.equal(
      isDocumentationOnly({ event, files: ['docs/product/prd-index.md'] }),
      false,
      String(event),
    );
});

test('a failed or missing changed-file read yields no list', () => {
  const failing = () => ({ status: 128, stdout: '', error: undefined });
  assert.equal(changedFiles('base', 'head', failing), undefined);
  const crashed = () => ({ status: null, stdout: '', error: new Error('x') });
  assert.equal(changedFiles('base', 'head', crashed), undefined);
  assert.equal(changedFiles(undefined, 'head', failing), undefined);
  assert.equal(changedFiles('base', '', failing), undefined);
  const listed = () => ({
    status: 0,
    stdout: 'docs/a.md\n\n docs/b.md \n',
    error: undefined,
  });
  assert.deepEqual(changedFiles('base', 'head', listed), [
    'docs/a.md',
    'docs/b.md',
  ]);
});

const success = { result: 'success' };
const skipped = { result: 'skipped' };
const heavy = [
  'api',
  'web_unit',
  'browser',
  'acceptance',
  'build',
  'packaging',
];
function results(scope, heavyResult) {
  return {
    checks: success,
    scope,
    ...Object.fromEntries(heavy.map((job) => [job, heavyResult])),
  };
}
const docsOnly = { result: 'success', outputs: { docs_only: 'true' } };
const fullRun = { result: 'success', outputs: { docs_only: 'false' } };

test('the gate accepts skipped heavy jobs only after a successful docs-only scope', () => {
  assert.deepEqual(unsuccessfulJobs(results(fullRun, success)), []);
  assert.deepEqual(unsuccessfulJobs(results(docsOnly, skipped)), []);
  assert.deepEqual(unsuccessfulJobs(results(docsOnly, success)), []);
  assert.equal(unsuccessfulJobs(results(fullRun, skipped)).length, 6);
  assert.equal(
    unsuccessfulJobs(results({ result: 'success' }, skipped)).length,
    6,
  );
  const failedScope = unsuccessfulJobs(
    results({ result: 'failure', outputs: { docs_only: 'true' } }, skipped),
  );
  assert.ok(failedScope.includes('scope: failure'));
  assert.equal(failedScope.length, 7);
  const docsFailure = results(docsOnly, skipped);
  docsFailure.api = { result: 'failure' };
  assert.deepEqual(unsuccessfulJobs(docsFailure), ['api: failure']);
  const cancelled = results(docsOnly, skipped);
  cancelled.browser = { result: 'cancelled' };
  assert.deepEqual(unsuccessfulJobs(cancelled), ['browser: cancelled']);
  const missingChecks = results(docsOnly, skipped);
  delete missingChecks.checks;
  assert.deepEqual(unsuccessfulJobs(missingChecks), ['checks: missing']);
  assert.throws(() => unsuccessfulJobs(null));
  assert.throws(() => unsuccessfulJobs([]));
});
