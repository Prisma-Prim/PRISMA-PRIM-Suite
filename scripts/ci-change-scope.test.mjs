import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { changedFiles, isDocumentationOnly } from './ci-change-scope.mjs';
import { unsuccessfulJobs } from './verify-ci-results.mjs';

const pullRequest = (files) =>
  isDocumentationOnly({ event: 'pull_request', files });

test('pull requests allow only root AGENTS.md and Markdown under docs/', () => {
  assert.equal(pullRequest(['AGENTS.md']), true);
  assert.equal(
    pullRequest(['AGENTS.md', 'docs/agents/issue-execution.md']),
    true,
  );
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
    ['docs/a.md', 'AGENTS.md', 'package.json'],
    ['docs/a.md', 'pnpm-lock.yaml'],
    ['docs/a.md', 'apps/api/drizzle/0001.sql'],
    ['docs/AGENTS.md', '.node-version'],
    ['AGENTS.MD'],
    ['agents.md'],
    [' AGENTS.md'],
    ['AGENTS.md.bak'],
    ['AGENTS.md/readme.md'],
    ['docs/../README.md'],
    ['docs/./notes.md'],
    ['docs/a\0b.md'],
    Array(1),
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
  for (const stdout of [
    'docs/a.md',
    'docs/a.md\0unknown',
    'docs/a.md\0\0',
    undefined,
    null,
  ])
    assert.equal(
      changedFiles('base', 'head', () => ({ status: 0, stdout })),
      undefined,
    );
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

function repositoryFixture() {
  const repository = mkdtempSync(join(tmpdir(), 'ci-scope-main-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: repository, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'scope@example.test');
  git('config', 'user.name', 'Scope Test');
  function commit(path, content) {
    const target = join(repository, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
    git('add', '.');
    git('commit', '-qm', path);
    return git('rev-parse', 'HEAD').trim();
  }
  const before = commit('docs/a.md', 'base\n');
  function classify(metadata = {}, args = []) {
    const output = join(repository, 'scope-output');
    rmSync(output, { force: true });
    const child = spawnSync(
      process.execPath,
      [new URL('./ci-change-scope.mjs', import.meta.url).pathname, ...args],
      {
        cwd: repository,
        env: {
          ...process.env,
          EVENT_NAME: 'push',
          EVENT_REF: 'refs/heads/main',
          BASE_SHA: before,
          HEAD_SHA: git('rev-parse', 'HEAD').trim(),
          PUSH_FORCED: 'false',
          ...metadata,
          GITHUB_OUTPUT: output,
        },
        encoding: 'utf8',
      },
    );
    assert.equal(child.status, 0, child.stderr);
    assert.equal(readFileSync(output, 'utf8'), child.stdout);
    rmSync(output);
    return child.stdout;
  }
  return {
    git,
    commit,
    classify,
    before,
    cleanup: () => rmSync(repository, { recursive: true, force: true }),
  };
}

test('the CLI proves an ordinary documentation push on main from before to head', () => {
  const fixture = repositoryFixture();
  try {
    fixture.commit('docs/a.md', 'documentation\n');
    fixture.commit('AGENTS.md', 'agent documentation\n');
    fixture.commit('docs/nested/second.md', 'more documentation\n');
    assert.equal(fixture.classify(), 'docs_only=true\n');
    assert.equal(
      fixture.classify({ EVENT_NAME: 'pull_request' }),
      'docs_only=true\n',
    );
    assert.equal(
      fixture.classify({ EVENT_NAME: '', BASE_SHA: '', HEAD_SHA: '' }, [
        '--base',
        fixture.before,
      ]),
      'docs_only=true\n',
    );
  } finally {
    fixture.cleanup();
  }
});

test('main scope refuses incomplete metadata, forced pushes and unavailable revisions', () => {
  const fixture = repositoryFixture();
  try {
    fixture.commit('docs/a.md', 'documentation\n');
    for (const metadata of [
      { EVENT_NAME: '' },
      { EVENT_NAME: 'workflow_dispatch' },
      { EVENT_REF: '' },
      { EVENT_REF: 'refs/heads/feature' },
      { EVENT_REF: 'refs/tags/main' },
      { PUSH_FORCED: '' },
      { PUSH_FORCED: 'true' },
      { BASE_SHA: '' },
      { BASE_SHA: '0'.repeat(40) },
      { BASE_SHA: 'f'.repeat(40) },
      { BASE_SHA: 'main' },
      { HEAD_SHA: '' },
      { HEAD_SHA: '0'.repeat(40) },
      { HEAD_SHA: 'f'.repeat(40) },
      { HEAD_SHA: fixture.before },
    ])
      assert.equal(
        fixture.classify(metadata),
        'docs_only=false\n',
        JSON.stringify(metadata),
      );
    assert.equal(
      fixture.classify({}, ['--base', 'missing-ref']),
      'docs_only=false\n',
    );
    assert.equal(
      fixture.classify({ EVENT_NAME: 'pull_request', BASE_SHA: 'missing-ref' }),
      'docs_only=false\n',
    );
    // No files changed is not a documentary proof.
    assert.equal(
      fixture.classify({ BASE_SHA: fixture.git('rev-parse', 'HEAD').trim() }),
      'docs_only=false\n',
    );
  } finally {
    fixture.cleanup();
  }
});

test('a main push includes executable edits in earlier commits and both sides of renames', () => {
  const fixture = repositoryFixture();
  try {
    fixture.commit('scripts/run.mjs', 'export const value = 1;\n');
    fixture.commit('docs/a.md', 'later documentation\n');
    assert.equal(fixture.classify(), 'docs_only=false\n');
    const beforeRename = fixture.git('rev-parse', 'HEAD').trim();
    fixture.git('mv', 'scripts/run.mjs', 'docs/run.md');
    fixture.git('commit', '-qm', 'rename code to docs');
    assert.equal(
      fixture.classify({ BASE_SHA: beforeRename }),
      'docs_only=false\n',
    );
  } finally {
    fixture.cleanup();
  }
});

test('a divergent main push cannot hide removed executable changes behind its merge base', () => {
  const fixture = repositoryFixture();
  try {
    const previousMain = fixture.commit(
      'scripts/run.mjs',
      'export const value = 1;\n',
    );
    fixture.git('checkout', '-qb', 'divergent', fixture.before);
    fixture.commit('docs/a.md', 'divergent documentation\n');
    assert.equal(
      fixture.classify({ BASE_SHA: previousMain }),
      'docs_only=false\n',
    );
  } finally {
    fixture.cleanup();
  }
});

test('push Git failures never produce a complete changed-file list', () => {
  const base = 'a'.repeat(40);
  const head = 'b'.repeat(40);
  for (const failedCommand of ['rev-parse', 'merge-base', 'diff']) {
    const run = (_command, args) => {
      if (args[0] === failedCommand) return { status: 128, stdout: '' };
      if (args[0] === 'rev-parse') return { status: 0, stdout: `${head}\n` };
      return { status: 0, stdout: '' };
    };
    assert.equal(
      changedFiles(base, head, run, { requireAncestor: true }),
      undefined,
    );
  }
});

test('the actual main scope output authorizes only successful documentary skips at quality', () => {
  const fixture = repositoryFixture();
  const gate = new URL('./verify-ci-results.mjs', import.meta.url).pathname;
  try {
    fixture.commit('AGENTS.md', 'agent documentation\n');
    function quality(scopeOutput, overrides = {}) {
      const docsOnly = scopeOutput.trim().split('=')[1];
      return spawnSync(process.execPath, [gate], {
        env: {
          ...process.env,
          CI_JOB_RESULTS: JSON.stringify({
            ...results(
              { result: 'success', outputs: { docs_only: docsOnly } },
              skipped,
            ),
            ...overrides,
          }),
        },
        encoding: 'utf8',
      });
    }
    const proven = fixture.classify();
    assert.equal(quality(proven).status, 0);
    for (const job of ['checks', 'scope', ...heavy]) {
      for (const result of ['failure', 'cancelled']) {
        const child = quality(proven, {
          [job]: { result, outputs: { docs_only: 'true' } },
        });
        assert.equal(child.status, 1, `${job}: ${result}`);
        assert.match(child.stderr, new RegExp(`${job}: ${result}`));
      }
    }
    fixture.commit('.github/workflows/ci.yml', 'executable workflow change\n');
    const unproven = quality(fixture.classify());
    assert.equal(unproven.status, 1);
    assert.match(unproven.stderr, /api: skipped/);
    assert.equal(
      fixture.classify({ EVENT_NAME: 'pull_request' }),
      'docs_only=false\n',
    );
  } finally {
    fixture.cleanup();
  }
});
