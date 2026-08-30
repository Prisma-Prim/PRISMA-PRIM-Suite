import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readlink,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';

const handoffCli = fileURLToPath(
  new URL('./codex-cloud-handoff.mjs', import.meta.url),
);
const issueExecutionGuide = fileURLToPath(
  new URL('../docs/agents/issue-execution.md', import.meta.url),
);
const environmentGuide = fileURLToPath(
  new URL('../docs/agents/environment.md', import.meta.url),
);

function run(command, args, cwd, options = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    ...options,
  }).trim();
}

function git(repository, ...args) {
  return run('git', args, repository);
}

function runFailure(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  return result.stderr;
}

function decodeTestBundle(bundle) {
  const lines = bundle.split('\n');
  return JSON.parse(
    gunzipSync(Buffer.from(lines.slice(2, -1).join(''), 'base64')).toString(
      'utf8',
    ),
  );
}

function encodeTestBundle(payload) {
  const compressed = gzipSync(Buffer.from(JSON.stringify(payload)), {
    level: 9,
  });
  const digest = createHash('sha256').update(compressed).digest('hex');
  return [
    '```prisma-prim-codex-handoff-v1',
    `sha256=${digest}`,
    compressed.toString('base64'),
    '```',
    '',
  ].join('\n');
}

test('exports, inspects, and materializes the exact committed Git tree', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'prisma-prim-handoff-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const source = join(root, 'source');
  git(root, 'init', '--quiet', '--initial-branch=main', source);
  git(source, 'config', 'user.name', 'Codex Cloud');
  git(source, 'config', 'user.email', 'codex@example.test');

  await writeFile(join(source, 'changed.txt'), 'before\n');
  await writeFile(join(source, 'deleted.txt'), 'delete me\n');
  await writeFile(join(source, 'renamed.txt'), 'rename me\n');
  await writeFile(
    join(source, 'tool.sh'),
    '#!/usr/bin/env bash\necho before\n',
  );
  await mkdir(join(source, 'folder-to-file'));
  await writeFile(
    join(source, 'folder-to-file', 'nested.txt'),
    'nested before\n',
  );
  await writeFile(join(source, 'file-to-folder'), 'file before\n');
  const outside = join(root, 'outside');
  await mkdir(join(outside, 'child'), { recursive: true });
  await writeFile(join(outside, 'child', 'external.txt'), 'outside\n');
  await symlink(outside, join(source, 'link-to-folder'));
  git(source, 'add', '--all');
  git(source, 'commit', '--quiet', '--message', 'base');

  const baseCommitSha = git(source, 'rev-parse', 'HEAD');
  const baseTreeSha = git(source, 'rev-parse', 'HEAD^{tree}');

  await writeFile(join(source, 'changed.txt'), 'after\n');
  await rm(join(source, 'deleted.txt'));
  await rename(join(source, 'renamed.txt'), join(source, 'moved.txt'));
  await writeFile(
    join(source, 'binary.bin'),
    Buffer.from([0, 1, 2, 3, 255, 10]),
  );
  await writeFile(join(source, 'tool.sh'), '#!/usr/bin/env bash\necho after\n');
  await chmod(join(source, 'tool.sh'), 0o755);
  await rm(join(source, 'folder-to-file'), { recursive: true });
  await writeFile(join(source, 'folder-to-file'), 'file after\n');
  await rm(join(source, 'file-to-folder'));
  await mkdir(join(source, 'file-to-folder'));
  await writeFile(
    join(source, 'file-to-folder', 'nested.txt'),
    'nested after\n',
  );
  await rm(join(source, 'link-to-folder'));
  await mkdir(join(source, 'link-to-folder'));
  await writeFile(join(source, 'link-to-folder', 'child'), 'inside\n');
  const binarySymlinkTarget = Buffer.from([
    ...Buffer.from('target-', 'utf8'),
    0xff,
  ]);
  await symlink(binarySymlinkTarget, join(source, 'binary-link'));
  git(source, 'add', '--all');
  git(source, 'commit', '--quiet', '--message', 'fix(agent-dx): add handoff');

  const sourceCommitSha = git(source, 'rev-parse', 'HEAD');
  const sourceTreeSha = git(source, 'rev-parse', 'HEAD^{tree}');
  const verificationPath = join(root, 'verification.json');
  await writeFile(
    verificationPath,
    JSON.stringify({
      environment: {
        harness: 'Codex Cloud',
        nodeVersion: 'v24.19.0',
        pnpmVersion: '11.20.0',
      },
      checks: [
        {
          command: 'pnpm test:unit',
          status: 'passed',
          summary: 'All unit suites passed.',
        },
      ],
    }),
  );

  const bundle = run(
    process.execPath,
    [
      handoffCli,
      'export',
      '--base',
      baseCommitSha,
      '--verification',
      verificationPath,
    ],
    source,
  );
  assert.match(bundle, /^```prisma-prim-codex-handoff-v1\n/u);
  assert.match(bundle, /\n```$/u);

  const bundlePath = join(root, 'handoff.md');
  await writeFile(bundlePath, `${bundle}\n`);
  const inspection = JSON.parse(
    run(
      process.execPath,
      [handoffCli, 'inspect', '--input', bundlePath],
      source,
    ),
  );

  assert.deepEqual(inspection, {
    format: 'prisma-prim-codex-handoff/v1',
    baseCommitSha,
    baseTreeSha,
    sourceCommitSha,
    sourceTreeSha,
    changedPaths: [
      'binary-link',
      'binary.bin',
      'changed.txt',
      'deleted.txt',
      'file-to-folder',
      'file-to-folder/nested.txt',
      'folder-to-file',
      'folder-to-file/nested.txt',
      'link-to-folder',
      'link-to-folder/child',
      'moved.txt',
      'renamed.txt',
      'tool.sh',
    ],
    verification: {
      environment: {
        harness: 'Codex Cloud',
        nodeVersion: 'v24.19.0',
        pnpmVersion: '11.20.0',
      },
      checks: [
        {
          command: 'pnpm test:unit',
          status: 'passed',
          summary: 'All unit suites passed.',
        },
      ],
    },
  });

  const extractedPath = join(root, 'connector-manifest.json');
  run(
    process.execPath,
    [
      handoffCli,
      'extract',
      '--input',
      bundlePath,
      '--expected-base',
      baseCommitSha,
      '--output',
      extractedPath,
    ],
    source,
  );
  const extracted = JSON.parse(await readFile(extractedPath, 'utf8'));
  assert.equal(extracted.source.commitMessage, 'fix(agent-dx): add handoff');
  assert.equal(
    extracted.entries.find(({ path }) => path === 'binary.bin').contentBase64,
    Buffer.from([0, 1, 2, 3, 255, 10]).toString('base64'),
  );
  assert.deepEqual(
    Object.keys(
      extracted.entries.find(({ path }) => path === 'deleted.txt'),
    ).sort(),
    ['blobSha', 'deleted', 'mode', 'path', 'type'],
  );
  assert.match(
    runFailure(
      process.execPath,
      [
        handoffCli,
        'extract',
        '--input',
        bundlePath,
        '--output',
        join(root, 'unchecked-connector-manifest.json'),
      ],
      source,
    ),
    /Missing required option --expected-base/u,
  );

  const target = join(root, 'target');
  git(root, 'clone', '--quiet', '--no-hardlinks', source, target);
  git(target, 'checkout', '--quiet', '--detach', baseCommitSha);
  const materialized = JSON.parse(
    run(
      process.execPath,
      [handoffCli, 'materialize', '--input', bundlePath],
      target,
    ),
  );

  assert.equal(materialized.sourceTreeSha, sourceTreeSha);
  assert.equal(git(target, 'write-tree'), sourceTreeSha);
  assert.equal(await readFile(join(target, 'changed.txt'), 'utf8'), 'after\n');
  assert.deepEqual(
    await readFile(join(target, 'binary.bin')),
    Buffer.from([0, 1, 2, 3, 255, 10]),
  );
  await assert.rejects(readFile(join(target, 'deleted.txt')), {
    code: 'ENOENT',
  });
  await assert.rejects(readFile(join(target, 'renamed.txt')), {
    code: 'ENOENT',
  });
  assert.equal(
    await readFile(join(target, 'moved.txt'), 'utf8'),
    'rename me\n',
  );
  assert.equal(
    await readFile(join(target, 'folder-to-file'), 'utf8'),
    'file after\n',
  );
  assert.equal(
    await readFile(join(target, 'file-to-folder', 'nested.txt'), 'utf8'),
    'nested after\n',
  );
  assert.equal(
    await readFile(join(target, 'link-to-folder', 'child'), 'utf8'),
    'inside\n',
  );
  assert.equal(
    await readFile(join(outside, 'child', 'external.txt'), 'utf8'),
    'outside\n',
  );
  assert.deepEqual(
    await readlink(join(target, 'binary-link'), { encoding: 'buffer' }),
    binarySymlinkTarget,
  );
  assert.equal(
    git(target, 'ls-files', '--stage', 'tool.sh').slice(0, 6),
    '100755',
  );
});

test('rejects corrupted, unsafe, stale, and dirty handoffs', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'prisma-prim-handoff-rejection-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const source = join(root, 'source');
  git(root, 'init', '--quiet', '--initial-branch=main', source);
  git(source, 'config', 'user.name', 'Codex Cloud');
  git(source, 'config', 'user.email', 'codex@example.test');
  await writeFile(join(source, 'file.txt'), 'before\n');
  git(source, 'add', '--all');
  git(source, 'commit', '--quiet', '--message', 'base');
  const baseCommitSha = git(source, 'rev-parse', 'HEAD');
  await writeFile(join(source, 'file.txt'), 'after\n');
  git(source, 'add', '--all');
  git(source, 'commit', '--quiet', '--message', 'change');

  const verificationPath = join(root, 'verification.json');
  await writeFile(
    verificationPath,
    JSON.stringify({
      environment: { harness: 'Codex Cloud' },
      checks: [
        { command: 'node --test', status: 'passed', summary: 'Tests passed.' },
      ],
    }),
  );
  const bundle = run(
    process.execPath,
    [
      handoffCli,
      'export',
      '--base',
      baseCommitSha,
      '--verification',
      verificationPath,
    ],
    source,
  );
  const bundlePath = join(root, 'handoff.md');
  await writeFile(bundlePath, `${bundle}\n`);

  await t.test('corrupted envelope', async () => {
    const corruptedPath = join(root, 'corrupted.md');
    const payloadStart = bundle.indexOf('\n', bundle.indexOf('\n') + 1) + 1;
    const replacement = bundle[payloadStart] === 'A' ? 'B' : 'A';
    await writeFile(
      corruptedPath,
      `${bundle.slice(0, payloadStart)}${replacement}${bundle.slice(payloadStart + 1)}\n`,
    );
    assert.match(
      runFailure(
        process.execPath,
        [handoffCli, 'inspect', '--input', corruptedPath],
        source,
      ),
      /SHA-256 mismatch/u,
    );
  });

  await t.test('path traversal with a valid envelope', async () => {
    const payload = decodeTestBundle(bundle);
    payload.entries[0].path = '../outside.txt';
    const unsafePath = join(root, 'unsafe.md');
    await writeFile(unsafePath, encodeTestBundle(payload));
    assert.match(
      runFailure(
        process.execPath,
        [handoffCli, 'inspect', '--input', unsafePath],
        source,
      ),
      /Unsafe changed path/u,
    );
  });

  await t.test('Git metadata path with a valid envelope', async () => {
    const payload = decodeTestBundle(bundle);
    payload.entries[0].path = '.git/config';
    const metadataPath = join(root, 'metadata-path.md');
    await writeFile(metadataPath, encodeTestBundle(payload));
    assert.match(
      runFailure(
        process.execPath,
        [handoffCli, 'inspect', '--input', metadataPath],
        source,
      ),
      /Unsafe changed path/u,
    );
  });

  await t.test('stale base', async () => {
    const staleTarget = join(root, 'stale-target');
    git(root, 'clone', '--quiet', '--no-hardlinks', source, staleTarget);
    assert.match(
      runFailure(
        process.execPath,
        [handoffCli, 'materialize', '--input', bundlePath],
        staleTarget,
      ),
      /Stale base/u,
    );
  });

  await t.test('moved target branch during inspection', () => {
    assert.match(
      runFailure(
        process.execPath,
        [
          handoffCli,
          'inspect',
          '--input',
          bundlePath,
          '--expected-base',
          '0'.repeat(40),
        ],
        source,
      ),
      /Stale base/u,
    );
  });

  await t.test('dirty target', async () => {
    const dirtyTarget = join(root, 'dirty-target');
    git(root, 'clone', '--quiet', '--no-hardlinks', source, dirtyTarget);
    git(dirtyTarget, 'checkout', '--quiet', '--detach', baseCommitSha);
    await writeFile(join(dirtyTarget, 'untracked.txt'), 'local work\n');
    assert.match(
      runFailure(
        process.execPath,
        [handoffCli, 'materialize', '--input', bundlePath],
        dirtyTarget,
      ),
      /dirty checkout/u,
    );
  });

  await t.test('declared final-tree mismatch', async () => {
    const payload = decodeTestBundle(bundle);
    payload.source.treeSha = payload.base.treeSha;
    const mismatchPath = join(root, 'tree-mismatch.md');
    await writeFile(mismatchPath, encodeTestBundle(payload));
    const mismatchTarget = join(root, 'mismatch-target');
    git(root, 'clone', '--quiet', '--no-hardlinks', source, mismatchTarget);
    git(mismatchTarget, 'checkout', '--quiet', '--detach', baseCommitSha);
    assert.match(
      runFailure(
        process.execPath,
        [handoffCli, 'materialize', '--input', mismatchPath],
        mismatchTarget,
      ),
      /Final tree mismatch/u,
    );
  });

  await t.test('credential-like verification evidence', async () => {
    const payload = decodeTestBundle(bundle);
    payload.verification.checks[0].summary =
      'Used github_pat_11AA0abcdefghijklmnopqrstuvwxyz123456';
    const secretPath = join(root, 'secret.md');
    await writeFile(secretPath, encodeTestBundle(payload));
    assert.match(
      runFailure(
        process.execPath,
        [handoffCli, 'inspect', '--input', secretPath],
        source,
      ),
      /credential or secret/u,
    );
  });

  await t.test('dirty source export', async () => {
    await writeFile(join(source, 'untracked.txt'), 'local work\n');
    assert.match(
      runFailure(
        process.execPath,
        [
          handoffCli,
          'export',
          '--base',
          baseCommitSha,
          '--verification',
          verificationPath,
        ],
        source,
      ),
      /dirty checkout/u,
    );
  });
});

test('rejects an extraneous deletion before following a symlink parent', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'prisma-prim-handoff-symlink-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outside = join(root, 'outside');
  await mkdir(outside);
  const victim = join(outside, 'victim.txt');
  await writeFile(victim, 'must survive\n');

  const source = join(root, 'source');
  git(root, 'init', '--quiet', '--initial-branch=main', source);
  git(source, 'config', 'user.name', 'Codex Cloud');
  git(source, 'config', 'user.email', 'codex@example.test');
  await writeFile(join(source, 'changed.txt'), 'before\n');
  await symlink(outside, join(source, 'link'));
  git(source, 'add', '--all');
  git(source, 'commit', '--quiet', '--message', 'base');
  const baseCommitSha = git(source, 'rev-parse', 'HEAD');
  await writeFile(join(source, 'changed.txt'), 'after\n');
  git(source, 'add', '--all');
  git(source, 'commit', '--quiet', '--message', 'change');
  const verificationPath = join(root, 'verification.json');
  await writeFile(
    verificationPath,
    JSON.stringify({
      environment: { harness: 'Codex Cloud' },
      checks: [
        { command: 'node --test', status: 'passed', summary: 'Tests passed.' },
      ],
    }),
  );
  const bundle = run(
    process.execPath,
    [
      handoffCli,
      'export',
      '--base',
      baseCommitSha,
      '--verification',
      verificationPath,
    ],
    source,
  );
  const payload = decodeTestBundle(bundle);
  payload.entries.push({
    path: 'link/victim.txt',
    deleted: true,
    mode: '100644',
    type: 'blob',
    blobSha: '0'.repeat(40),
  });
  const maliciousPath = join(root, 'malicious.md');
  await writeFile(maliciousPath, encodeTestBundle(payload));
  const target = join(root, 'target');
  git(root, 'clone', '--quiet', '--no-hardlinks', source, target);
  git(target, 'checkout', '--quiet', '--detach', baseCommitSha);

  assert.match(
    runFailure(
      process.execPath,
      [handoffCli, 'materialize', '--input', maliciousPath],
      target,
    ),
    /exact base-to-source tree delta/u,
  );
  assert.equal(await readFile(victim, 'utf8'), 'must survive\n');
});

test('protects ignored destinations and stages exact force-added paths', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'prisma-prim-handoff-ignored-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  git(root, 'init', '--quiet', '--initial-branch=main', source);
  git(source, 'config', 'user.name', 'Codex Cloud');
  git(source, 'config', 'user.email', 'codex@example.test');
  await writeFile(join(source, '.gitignore'), 'ignored.txt\n');
  git(source, 'add', '--all');
  git(source, 'commit', '--quiet', '--message', 'base');
  const baseCommitSha = git(source, 'rev-parse', 'HEAD');
  await writeFile(join(source, 'ignored.txt'), 'tracked source\n');
  git(source, 'add', '--force', 'ignored.txt');
  git(source, 'commit', '--quiet', '--message', 'force-add ignored path');
  const sourceTreeSha = git(source, 'rev-parse', 'HEAD^{tree}');
  const verificationPath = join(root, 'verification.json');
  await writeFile(
    verificationPath,
    JSON.stringify({
      environment: { harness: 'Codex Cloud' },
      checks: [
        { command: 'node --test', status: 'passed', summary: 'Tests passed.' },
      ],
    }),
  );
  const bundle = run(
    process.execPath,
    [
      handoffCli,
      'export',
      '--base',
      baseCommitSha,
      '--verification',
      verificationPath,
    ],
    source,
  );
  const bundlePath = join(root, 'handoff.md');
  await writeFile(bundlePath, `${bundle}\n`);

  const collisionTarget = join(root, 'collision-target');
  git(root, 'clone', '--quiet', '--no-hardlinks', source, collisionTarget);
  git(collisionTarget, 'checkout', '--quiet', '--detach', baseCommitSha);
  await writeFile(join(collisionTarget, 'ignored.txt'), 'local ignored\n');
  assert.equal(git(collisionTarget, 'status', '--porcelain=v1'), '');
  assert.match(
    runFailure(
      process.execPath,
      [handoffCli, 'materialize', '--input', bundlePath],
      collisionTarget,
    ),
    /untracked or ignored path ignored\.txt/u,
  );
  assert.equal(
    await readFile(join(collisionTarget, 'ignored.txt'), 'utf8'),
    'local ignored\n',
  );

  const cleanTarget = join(root, 'clean-target');
  git(root, 'clone', '--quiet', '--no-hardlinks', source, cleanTarget);
  git(cleanTarget, 'checkout', '--quiet', '--detach', baseCommitSha);
  run(
    process.execPath,
    [handoffCli, 'materialize', '--input', bundlePath],
    cleanTarget,
  );
  assert.equal(git(cleanTarget, 'write-tree'), sourceTreeSha);
  assert.equal(
    await readFile(join(cleanTarget, 'ignored.txt'), 'utf8'),
    'tracked source\n',
  );
});

test('rejects a compressed payload that expands beyond the transport budget', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'prisma-prim-handoff-size-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const oversizedPath = join(root, 'oversized.md');
  await writeFile(
    oversizedPath,
    encodeTestBundle({ padding: 'x'.repeat(17 * 1024 * 1024) }),
  );

  assert.match(
    runFailure(
      process.execPath,
      [handoffCli, 'inspect', '--input', oversizedPath],
      root,
    ),
    /decoded size limit/u,
  );
});

test('documents the native-first Cloud-to-Work publication fallback', async () => {
  const [execution, environment] = await Promise.all([
    readFile(issueExecutionGuide, 'utf8'),
    readFile(environmentGuide, 'utf8'),
  ]);

  assert.match(execution, /native publication.*preferred/iu);
  assert.match(execution, /codex-cloud-handoff\.mjs export/u);
  assert.match(execution, /codex-cloud-handoff\.mjs inspect/u);
  assert.match(execution, /codex-cloud-handoff\.mjs extract/u);
  assert.match(execution, /sourceTreeSha/u);
  assert.match(environment, /Codex Cloud publication handoff/u);
  assert.match(environment, /codex-cloud-handoff\.mjs materialize/u);
});
