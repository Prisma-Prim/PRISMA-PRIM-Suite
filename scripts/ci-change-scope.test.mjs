import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  let args;
  const listed = (_command, commandArgs) => {
    args = commandArgs;
    return {
      status: 0,
      stdout: 'docs/a.md\0 docs/b.md\0docs/c d.md\0',
      error: undefined,
    };
  };
  // Paths are kept byte-for-byte: a root path " docs/b.md" is not docs/.
  const files = changedFiles('base', 'head', listed);
  assert.deepEqual(files, ['docs/a.md', ' docs/b.md', 'docs/c d.md']);
  assert.ok(args.includes('-z'));
  assert.equal(isDocumentationOnly({ event: 'pull_request', files }), false);
});

test('a real git diff with a space-prefixed root path is not docs-only', () => {
  const repository = mkdtempSync(join(tmpdir(), 'ci-scope-'));
  const git = (...gitArgs) =>
    execFileSync('git', gitArgs, { cwd: repository, encoding: 'utf8' });
  try {
    git('init', '-q');
    git('config', 'user.email', 'scope@example.test');
    git('config', 'user.name', 'Scope Test');
    mkdirSync(join(repository, 'docs'));
    writeFileSync(join(repository, 'docs', 'a.md'), 'a\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD').trim();
    // A root directory named " docs" is not docs/, even though trimming its
    // path would make it look like one.
    mkdirSync(join(repository, ' docs'));
    writeFileSync(join(repository, ' docs', 'a.md'), 'not under docs/\n');
    git('add', '.');
    git('commit', '-qm', 'head');
    const run = (command, commandArgs, options) =>
      spawnSync(command, commandArgs, { ...options, cwd: repository });
    const files = changedFiles(base, 'HEAD', run);
    assert.deepEqual(files, [' docs/a.md']);
    assert.equal(isDocumentationOnly({ event: 'pull_request', files }), false);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

const success = { result: 'success' };
const skipped = { result: 'skipped' };
const heavy = [
  'postgres_image',
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
  assert.equal(unsuccessfulJobs(results(fullRun, skipped)).length, 7);
  assert.equal(
    unsuccessfulJobs(results({ result: 'success' }, skipped)).length,
    7,
  );
  const failedScope = unsuccessfulJobs(
    results({ result: 'failure', outputs: { docs_only: 'true' } }, skipped),
  );
  assert.ok(failedScope.includes('scope: failure'));
  assert.equal(failedScope.length, 8);
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
