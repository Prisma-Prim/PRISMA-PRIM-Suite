import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readlink,
  readFile,
  rename,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
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

function runFailure(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    ...options,
  });
  assert.notEqual(result.status, 0);
  return result.stderr;
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
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

function resolveGitPath(repository, path) {
  return isAbsolute(path) ? path : join(repository, path);
}

async function listFilesRecursively(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(root, path)));
    } else {
      files.push(path.slice(root.length + 1));
    }
  }
  return files.sort();
}

async function snapshotRepositoryState(repository) {
  const indexPath = resolveGitPath(
    repository,
    git(repository, 'rev-parse', '--git-path', 'index'),
  );
  const commonDirectory = resolveGitPath(
    repository,
    git(repository, 'rev-parse', '--git-common-dir'),
  );
  return {
    index: await readFile(indexPath),
    objectFiles: await listFilesRecursively(join(commonDirectory, 'objects')),
  };
}

function createBaseOnlyTarget(root, source, name, baseCommitSha) {
  const target = join(root, name);
  git(root, 'init', '--quiet', '--initial-branch=main', target);
  run(
    'git',
    [
      '-c',
      'protocol.file.allow=always',
      'fetch',
      '--quiet',
      '--no-tags',
      '--depth=1',
      source,
      baseCommitSha,
    ],
    target,
  );
  git(target, 'checkout', '--quiet', '--detach', 'FETCH_HEAD');
  return target;
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
  await writeFile(join(source, 'empty.txt'), '');
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
      [
        handoffCli,
        'inspect',
        '--input',
        bundlePath,
        '--expected-base',
        baseCommitSha,
        '--expected-base-tree',
        baseTreeSha,
      ],
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
      'empty.txt',
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
      '--expected-base-tree',
      baseTreeSha,
      '--output',
      extractedPath,
    ],
    source,
  );
  const extracted = JSON.parse(await readFile(extractedPath, 'utf8'));
  assert.equal(extracted.source.commitMessage, 'fix(agent-dx): add handoff\n');
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

  const emptyDirectoryTarget = join(root, 'empty-directory-target');
  git(root, 'clone', '--quiet', '--no-hardlinks', source, emptyDirectoryTarget);
  git(emptyDirectoryTarget, 'checkout', '--quiet', '--detach', baseCommitSha);
  await mkdir(join(emptyDirectoryTarget, 'folder-to-file', 'local-empty'));
  assert.equal(git(emptyDirectoryTarget, 'status', '--porcelain=v1'), '');
  assert.match(
    runFailure(
      process.execPath,
      [handoffCli, 'materialize', '--input', bundlePath],
      emptyDirectoryTarget,
    ),
    /untracked or ignored path folder-to-file\/local-empty/u,
  );
  await readFile(
    join(emptyDirectoryTarget, 'folder-to-file', 'nested.txt'),
    'utf8',
  );
  assert.deepEqual(
    await readdir(join(emptyDirectoryTarget, 'folder-to-file', 'local-empty')),
    [],
  );

  const target = join(root, 'target');
  git(root, 'clone', '--quiet', '--no-hardlinks', source, target);
  git(target, 'checkout', '--quiet', '--detach', baseCommitSha);
  const targetIndex = resolveGitPath(
    target,
    git(target, 'rev-parse', '--git-path', 'index'),
  );
  const expectedIndex = join(root, 'expected-index');
  await copyFile(targetIndex, expectedIndex);
  const payload = decodeTestBundle(bundle);
  const zeroObjectId = '0'.repeat(payload.objectFormat === 'sha1' ? 40 : 64);
  const indexInput = payload.entries
    .map((entry) =>
      entry.deleted === true
        ? `0 ${zeroObjectId}\t${entry.path}\0`
        : `${entry.mode} ${entry.blobSha}\t${entry.path}\0`,
    )
    .join('');
  run('git', ['update-index', '-z', '--index-info'], target, {
    env: {
      ...process.env,
      GIT_INDEX_FILE: expectedIndex,
      GIT_LITERAL_PATHSPECS: '1',
    },
    input: indexInput,
  });
  const expectedIndexBytes = await readFile(expectedIndex);
  const materialized = JSON.parse(
    run(
      process.execPath,
      [handoffCli, 'materialize', '--input', bundlePath],
      target,
    ),
  );

  assert.equal(materialized.sourceTreeSha, sourceTreeSha);
  assert.deepEqual(await readFile(targetIndex), expectedIndexBytes);
  assert.equal(git(target, 'write-tree'), sourceTreeSha);
  assert.equal(await readFile(join(target, 'changed.txt'), 'utf8'), 'after\n');
  assert.deepEqual(
    await readFile(join(target, 'binary.bin')),
    Buffer.from([0, 1, 2, 3, 255, 10]),
  );
  assert.deepEqual(await readFile(join(target, 'empty.txt')), Buffer.alloc(0));
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
  await writeFile(join(source, 'unchanged.txt'), 'unchanged\n');
  git(source, 'add', '--all');
  git(source, 'commit', '--quiet', '--message', 'base');
  const baseCommitSha = git(source, 'rev-parse', 'HEAD');
  const baseTreeSha = git(source, 'rev-parse', 'HEAD^{tree}');
  await writeFile(join(source, 'file.txt'), 'after\n');
  git(source, 'add', '--all');
  git(source, 'commit', '--quiet', '--message', 'change');
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

  await t.test('duplicate changed path with a valid envelope', async () => {
    const payload = decodeTestBundle(bundle);
    payload.entries.push({ ...payload.entries[0] });
    const duplicatePath = join(root, 'duplicate-path.md');
    await writeFile(duplicatePath, encodeTestBundle(payload));
    assert.match(
      runFailure(
        process.execPath,
        [handoffCli, 'inspect', '--input', duplicatePath],
        source,
      ),
      /Duplicate changed path/u,
    );
  });

  await t.test('non-canonical blob base64 with a valid envelope', async () => {
    const payload = decodeTestBundle(bundle);
    payload.entries[0].contentBase64 += '\n';
    const noncanonicalPath = join(root, 'noncanonical-base64.md');
    await writeFile(noncanonicalPath, encodeTestBundle(payload));
    assert.match(
      runFailure(
        process.execPath,
        [handoffCli, 'inspect', '--input', noncanonicalPath],
        source,
      ),
      /not canonical base64/u,
    );
  });

  await t.test('non-canonical no-op delta', async () => {
    const payload = decodeTestBundle(bundle);
    payload.entries.push({
      path: 'unchanged.txt',
      mode: '100644',
      type: 'blob',
      blobSha: git(source, 'rev-parse', `${baseCommitSha}:unchanged.txt`),
      contentBase64: Buffer.from('unchanged\n').toString('base64'),
    });
    const noOpPath = join(root, 'non-canonical-no-op.md');
    await writeFile(noOpPath, encodeTestBundle(payload));
    for (const [command, extraArguments] of [
      ['inspect', []],
      ['extract', ['--output', join(root, 'non-canonical-no-op.json')]],
    ]) {
      assert.match(
        runFailure(
          process.execPath,
          [
            handoffCli,
            command,
            '--input',
            noOpPath,
            '--expected-base',
            baseCommitSha,
            '--expected-base-tree',
            baseTreeSha,
            ...extraArguments,
          ],
          source,
        ),
        /exact base-to-source tree delta/u,
      );
    }
  });

  await t.test('empty symlink target before mutation', async () => {
    const payload = decodeTestBundle(bundle);
    payload.entries[0] = {
      ...payload.entries[0],
      mode: '120000',
      blobSha: run('git', ['hash-object', '--stdin'], source, { input: '' }),
      contentBase64: '',
    };
    const emptySymlinkPath = join(root, 'empty-symlink.md');
    await writeFile(emptySymlinkPath, encodeTestBundle(payload));
    assert.match(
      runFailure(
        process.execPath,
        [
          handoffCli,
          'inspect',
          '--input',
          emptySymlinkPath,
          '--expected-base',
          baseCommitSha,
          '--expected-base-tree',
          baseTreeSha,
        ],
        source,
      ),
      /Symlink target .* must not be empty/u,
    );
    const target = createBaseOnlyTarget(
      root,
      source,
      'empty-symlink-target',
      baseCommitSha,
    );
    const before = await snapshotRepositoryState(target);
    assert.match(
      runFailure(
        process.execPath,
        [handoffCli, 'materialize', '--input', emptySymlinkPath],
        target,
      ),
      /Symlink target .* must not be empty/u,
    );
    const after = await snapshotRepositoryState(target);
    assert.deepEqual(after, before);
    assert.equal(await readFile(join(target, 'file.txt'), 'utf8'), 'before\n');
  });

  await t.test('inspect requires an authenticated base fence', () => {
    assert.match(
      runFailure(
        process.execPath,
        [handoffCli, 'inspect', '--input', bundlePath],
        source,
      ),
      /Missing required option --expected-base/u,
    );
  });

  await t.test('temporary root inside checkout', async () => {
    const internalTemporaryRoot = join(source, 'internal-temporary-root');
    await mkdir(internalTemporaryRoot);
    assert.match(
      runFailure(
        process.execPath,
        [
          handoffCli,
          'inspect',
          '--input',
          bundlePath,
          '--expected-base',
          baseCommitSha,
          '--expected-base-tree',
          baseTreeSha,
        ],
        source,
        { env: { ...process.env, TMPDIR: internalTemporaryRoot } },
      ),
      /temporary directory must be outside/u,
    );
    assert.deepEqual(await readdir(internalTemporaryRoot), []);
  });

  await t.test(
    'synthetic local commit over the authenticated base tree',
    async () => {
      const inspector = join(root, 'synthetic-inspector');
      git(root, 'init', '--quiet', '--initial-branch=main', inspector);
      git(inspector, 'config', 'user.name', 'Work Supervisor');
      git(inspector, 'config', 'user.email', 'work@example.test');
      await writeFile(join(inspector, 'file.txt'), 'before\n');
      await writeFile(join(inspector, 'unchanged.txt'), 'unchanged\n');
      git(inspector, 'add', '--all');
      git(inspector, 'commit', '--quiet', '--message', 'synthetic local base');
      assert.equal(git(inspector, 'rev-parse', 'HEAD^{tree}'), baseTreeSha);
      runFailure(
        'git',
        ['cat-file', '-e', `${baseCommitSha}^{commit}`],
        inspector,
      );
      const result = JSON.parse(
        run(
          process.execPath,
          [
            handoffCli,
            'inspect',
            '--input',
            bundlePath,
            '--expected-base',
            baseCommitSha,
            '--expected-base-tree',
            baseTreeSha,
          ],
          inspector,
        ),
      );
      assert.equal(
        result.sourceTreeSha,
        decodeTestBundle(bundle).source.treeSha,
      );
    },
  );

  await t.test(
    'extract output inside checkout or Git common directory',
    async () => {
      const gitDirectory = resolveGitPath(
        source,
        git(source, 'rev-parse', '--git-dir'),
      );
      for (const outputPath of [
        join(source, 'connector-manifest.json'),
        join(gitDirectory, 'connector-manifest.json'),
      ]) {
        const before = await snapshotRepositoryState(source);
        assert.match(
          runFailure(
            process.execPath,
            [
              handoffCli,
              'extract',
              '--input',
              bundlePath,
              '--expected-base',
              baseCommitSha,
              '--expected-base-tree',
              baseTreeSha,
              '--output',
              outputPath,
            ],
            source,
          ),
          /output must be inside .* temporary directory and outside/u,
        );
        const after = await snapshotRepositoryState(source);
        assert.deepEqual(after, before);
        await assert.rejects(readFile(outputPath), { code: 'ENOENT' });
      }
    },
  );

  await t.test('trailing-slash path with a valid envelope', async () => {
    const payload = decodeTestBundle(bundle);
    payload.entries[0].path = 'file.txt/';
    const trailingSlashPath = join(root, 'trailing-slash.md');
    await writeFile(trailingSlashPath, encodeTestBundle(payload));
    for (const [command, extraArguments] of [
      ['inspect', []],
      [
        'extract',
        [
          '--expected-base',
          baseCommitSha,
          '--expected-base-tree',
          baseTreeSha,
          '--output',
          join(root, 'trailing-slash.json'),
        ],
      ],
    ]) {
      assert.match(
        runFailure(
          process.execPath,
          [
            handoffCli,
            command,
            '--input',
            trailingSlashPath,
            ...extraArguments,
          ],
          source,
        ),
        /Unsafe changed path/u,
      );
    }
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
          '--expected-base-tree',
          baseTreeSha,
        ],
        source,
      ),
      /Stale base/u,
    );
  });

  await t.test('authenticated base tree mismatch', async () => {
    const outputPath = join(root, 'wrong-base-tree.json');
    const before = await snapshotRepositoryState(source);
    for (const [command, extraArguments] of [
      ['inspect', []],
      ['extract', ['--output', outputPath]],
    ]) {
      assert.match(
        runFailure(
          process.execPath,
          [
            handoffCli,
            command,
            '--input',
            bundlePath,
            '--expected-base',
            baseCommitSha,
            '--expected-base-tree',
            sourceTreeSha,
            ...extraArguments,
          ],
          source,
        ),
        /Base tree mismatch/u,
      );
      assert.deepEqual(await snapshotRepositoryState(source), before);
    }
    await assert.rejects(readFile(outputPath), { code: 'ENOENT' });
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
    const before = await snapshotRepositoryState(mismatchTarget);
    assert.match(
      runFailure(
        process.execPath,
        [handoffCli, 'materialize', '--input', mismatchPath],
        mismatchTarget,
      ),
      /Final tree mismatch/u,
    );
    const after = await snapshotRepositoryState(mismatchTarget);
    assert.deepEqual(after.index, before.index);
    assert.deepEqual(after.objectFiles, before.objectFiles);
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

test('rejects non-UTF-8 local directory entries before materialization', async (t) => {
  const root = await mkdtemp(
    join(tmpdir(), 'prisma-prim-handoff-local-paths-'),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  git(root, 'init', '--quiet', '--initial-branch=main', source);
  git(source, 'config', 'user.name', 'Codex Cloud');
  git(source, 'config', 'user.email', 'codex@example.test');
  await writeFile(join(source, '.gitignore'), 'directory/*\n');
  await mkdir(join(source, 'directory'));
  const trackedLeaf = join(source, 'directory', '\uFFFD');
  await writeFile(trackedLeaf, 'tracked base\n');
  git(source, 'add', '--all');
  git(source, 'add', '--force', '--', 'directory/\uFFFD');
  git(source, 'commit', '--quiet', '--message', 'base');
  const baseCommitSha = git(source, 'rev-parse', 'HEAD');
  await rm(join(source, 'directory'), { recursive: true });
  await writeFile(join(source, 'directory'), 'replacement\n');
  git(source, 'add', '--all');
  git(source, 'commit', '--quiet', '--message', 'replace directory');

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
  const bundlePath = join(root, 'handoff.md');
  await writeFile(
    bundlePath,
    `${run(
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
    )}\n`,
  );

  const target = createBaseOnlyTarget(
    root,
    source,
    'local-path-target',
    baseCommitSha,
  );
  const targetTrackedLeaf = join(target, 'directory', '\uFFFD');
  const rawIgnoredLeaf = Buffer.concat([
    Buffer.from(`${target}/directory/`),
    Buffer.from([0xff]),
  ]);
  await writeFile(rawIgnoredLeaf, 'ignored raw bytes\n');
  assert.equal(git(target, 'status', '--porcelain=v1'), '');
  const before = await snapshotRepositoryState(target);
  assert.match(
    runFailure(
      process.execPath,
      [handoffCli, 'materialize', '--input', bundlePath],
      target,
    ),
    /Local directory entry is not valid UTF-8/u,
  );
  assert.deepEqual(await snapshotRepositoryState(target), before);
  assert.equal(await readFile(targetTrackedLeaf, 'utf8'), 'tracked base\n');
  assert.equal(await readFile(rawIgnoredLeaf, 'utf8'), 'ignored raw bytes\n');
});

test('preserves supported literal UTF-8 paths and rejects unsupported raw path bytes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'prisma-prim-handoff-paths-'));
  t.after(() => rm(root, { recursive: true, force: true }));
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

  const supportedSource = join(root, 'supported-source');
  git(root, 'init', '--quiet', '--initial-branch=main', supportedSource);
  git(supportedSource, 'config', 'user.name', 'Codex Cloud');
  git(supportedSource, 'config', 'user.email', 'codex@example.test');
  await writeFile(join(supportedSource, 'base.txt'), 'base\n');
  git(supportedSource, 'add', '--all');
  git(supportedSource, 'commit', '--quiet', '--message', 'base');
  const supportedBase = git(supportedSource, 'rev-parse', 'HEAD');
  const supportedBaseTree = git(supportedSource, 'rev-parse', 'HEAD^{tree}');
  const supportedPaths = [
    '-leading.txt',
    'literal-:(glob)*?.txt',
    'space name.txt',
    '\uFEFFleading-bom.txt',
    'unicode-é.txt',
    'unicode-é.txt',
  ];
  for (const path of supportedPaths) {
    await writeFile(join(supportedSource, path), `${path}\n`);
  }
  git(supportedSource, 'add', '--all');
  git(supportedSource, 'commit', '--quiet', '--message', 'literal paths');
  const supportedTree = git(supportedSource, 'rev-parse', 'HEAD^{tree}');
  const supportedBundle = run(
    process.execPath,
    [
      handoffCli,
      'export',
      '--base',
      supportedBase,
      '--verification',
      verificationPath,
    ],
    supportedSource,
  );
  const supportedBundlePath = join(root, 'supported-handoff.md');
  await writeFile(supportedBundlePath, `${supportedBundle}\n`);
  const supportedInspection = JSON.parse(
    run(
      process.execPath,
      [
        handoffCli,
        'inspect',
        '--input',
        supportedBundlePath,
        '--expected-base',
        supportedBase,
        '--expected-base-tree',
        supportedBaseTree,
      ],
      supportedSource,
    ),
  );
  assert.deepEqual(
    [...supportedInspection.changedPaths].sort(),
    [...supportedPaths].sort(),
  );
  const supportedExtractPath = join(root, 'supported-manifest.json');
  run(
    process.execPath,
    [
      handoffCli,
      'extract',
      '--input',
      supportedBundlePath,
      '--expected-base',
      supportedBase,
      '--expected-base-tree',
      supportedBaseTree,
      '--output',
      supportedExtractPath,
    ],
    supportedSource,
  );
  const supportedManifest = JSON.parse(
    await readFile(supportedExtractPath, 'utf8'),
  );
  assert.deepEqual(
    supportedManifest.entries.map(({ path }) => Buffer.from(path, 'utf8')),
    supportedPaths
      .map((path) => Buffer.from(path, 'utf8'))
      .sort(Buffer.compare),
  );
  const supportedTarget = createBaseOnlyTarget(
    root,
    supportedSource,
    'supported-target',
    supportedBase,
  );
  run(
    process.execPath,
    [handoffCli, 'materialize', '--input', supportedBundlePath],
    supportedTarget,
  );
  assert.equal(git(supportedTarget, 'write-tree'), supportedTree);

  const unsupportedCases = [
    {
      name: 'non-UTF-8',
      createPath(repository) {
        return Buffer.concat([
          Buffer.from(`${repository}/invalid-`),
          Buffer.from([0xff]),
        ]);
      },
      diagnostic: /valid UTF-8/u,
    },
    {
      name: 'backslash',
      createPath: (repository) => join(repository, 'invalid\\path.txt'),
      diagnostic: /Unsafe changed path/u,
    },
    {
      name: 'control',
      createPath: (repository) => join(repository, 'invalid\npath.txt'),
      diagnostic: /Unsafe changed path/u,
    },
    {
      name: 'DEL',
      createPath: (repository) => join(repository, 'invalid\u007fpath.txt'),
      diagnostic: /Unsafe changed path/u,
    },
  ];
  for (const unsupported of unsupportedCases) {
    await t.test(unsupported.name, async () => {
      const source = join(root, `unsupported-${unsupported.name}`);
      git(root, 'init', '--quiet', '--initial-branch=main', source);
      git(source, 'config', 'user.name', 'Codex Cloud');
      git(source, 'config', 'user.email', 'codex@example.test');
      await writeFile(join(source, 'base.txt'), 'base\n');
      git(source, 'add', '--all');
      git(source, 'commit', '--quiet', '--message', 'base');
      const base = git(source, 'rev-parse', 'HEAD');
      await writeFile(unsupported.createPath(source), 'unsupported\n');
      git(source, 'add', '--all');
      git(source, 'commit', '--quiet', '--message', 'unsupported path');
      assert.match(
        runFailure(
          process.execPath,
          [
            handoffCli,
            'export',
            '--base',
            base,
            '--verification',
            verificationPath,
          ],
          source,
        ),
        unsupported.diagnostic,
      );
    });
  }

  await t.test('overlong raw Git path', async () => {
    const source = join(root, 'unsupported-overlong-path');
    git(root, 'init', '--quiet', '--initial-branch=main', source);
    git(source, 'config', 'user.name', 'Codex Cloud');
    git(source, 'config', 'user.email', 'codex@example.test');
    git(source, 'commit', '--quiet', '--allow-empty', '--message', 'base');
    const base = git(source, 'rev-parse', 'HEAD');
    const blob = run('git', ['hash-object', '-w', '--stdin'], source, {
      input: 'overlong\n',
    });
    const components = Array.from(
      { length: 21 },
      (_, index) => `${String(index).padStart(2, '0')}-${'a'.repeat(197)}`,
    );
    let tree = run('git', ['mktree'], source, {
      input: `100644 blob ${blob}\tleaf.txt\n`,
    });
    for (const component of [...components].reverse()) {
      tree = run('git', ['mktree'], source, {
        input: `040000 tree ${tree}\t${component}\n`,
      });
    }
    const sourceCommit = run(
      'git',
      ['commit-tree', tree, '-p', base, '-m', 'overlong path'],
      source,
    );
    git(source, 'reset', '--quiet', '--mixed', sourceCommit);
    const longPath = `${components.join('/')}/leaf.txt`;
    git(source, 'update-index', '--skip-worktree', '--', longPath);
    assert.equal(git(source, 'status', '--porcelain=v1'), '');
    assert.match(
      runFailure(
        process.execPath,
        [
          handoffCli,
          'export',
          '--base',
          base,
          '--verification',
          verificationPath,
        ],
        source,
      ),
      /Changed path .* at most 4096|Unsafe changed path/u,
    );
  });

  await t.test('gitlink mode', async () => {
    const source = join(root, 'unsupported-gitlink');
    git(root, 'init', '--quiet', '--initial-branch=main', source);
    git(source, 'config', 'user.name', 'Codex Cloud');
    git(source, 'config', 'user.email', 'codex@example.test');
    git(source, 'commit', '--quiet', '--allow-empty', '--message', 'base');
    const base = git(source, 'rev-parse', 'HEAD');
    const tree = run('git', ['mktree'], source, {
      input: `160000 commit ${base}\tsubmodule\n`,
    });
    const sourceCommit = run(
      'git',
      ['commit-tree', tree, '-p', base, '-m', 'gitlink'],
      source,
    );
    git(source, 'reset', '--quiet', '--mixed', sourceCommit);
    git(source, 'update-index', '--skip-worktree', '--', 'submodule');
    assert.equal(git(source, 'status', '--porcelain=v1'), '');
    assert.match(
      runFailure(
        process.execPath,
        [
          handoffCli,
          'export',
          '--base',
          base,
          '--verification',
          verificationPath,
        ],
        source,
      ),
      /not a supported Git blob/u,
    );
  });

  await t.test('non-UTF-8 commit message', async () => {
    const source = join(root, 'unsupported-commit-message');
    git(root, 'init', '--quiet', '--initial-branch=main', source);
    git(source, 'config', 'user.name', 'Codex Cloud');
    git(source, 'config', 'user.email', 'codex@example.test');
    await writeFile(join(source, 'file.txt'), 'base\n');
    git(source, 'add', '--all');
    git(source, 'commit', '--quiet', '--message', 'base');
    const base = git(source, 'rev-parse', 'HEAD');
    await writeFile(join(source, 'file.txt'), 'source\n');
    git(source, 'add', '--all');
    const tree = git(source, 'write-tree');
    const sourceCommit = run(
      'git',
      ['hash-object', '-t', 'commit', '-w', '--stdin'],
      source,
      {
        input: Buffer.concat([
          Buffer.from(
            `tree ${tree}\nparent ${base}\nauthor Codex Cloud <codex@example.test> 0 +0000\ncommitter Codex Cloud <codex@example.test> 0 +0000\n\n`,
          ),
          Buffer.from([0xff, 0x0a]),
        ]),
      },
    );
    git(source, 'reset', '--quiet', '--hard', sourceCommit);
    assert.match(
      runFailure(
        process.execPath,
        [
          handoffCli,
          'export',
          '--base',
          base,
          '--verification',
          verificationPath,
        ],
        source,
      ),
      /Source commit message is not valid UTF-8/u,
    );
  });

  for (const unsupportedMessage of [
    {
      name: 'empty',
      bytes: Buffer.alloc(0),
      diagnostic: /non-empty string of at most 10000 UTF-8 bytes/u,
    },
    {
      name: 'NUL-containing',
      bytes: Buffer.from('subject\0body\n'),
      diagnostic: /contains a NUL byte/u,
      literally: true,
    },
    {
      name: 'overlong',
      bytes: Buffer.alloc(10_001, 0x61),
      diagnostic: /at most 10000 UTF-8 bytes/u,
    },
    {
      name: 'credential-like',
      bytes: Buffer.from('fix: token=placeholder\n'),
      diagnostic: /appears to contain a credential or secret/u,
    },
  ]) {
    await t.test(`${unsupportedMessage.name} commit message`, async () => {
      const source = join(
        root,
        `unsupported-${unsupportedMessage.name}-commit-message`,
      );
      git(root, 'init', '--quiet', '--initial-branch=main', source);
      git(source, 'config', 'user.name', 'Codex Cloud');
      git(source, 'config', 'user.email', 'codex@example.test');
      await writeFile(join(source, 'file.txt'), 'base\n');
      git(source, 'add', '--all');
      git(source, 'commit', '--quiet', '--message', 'base');
      const base = git(source, 'rev-parse', 'HEAD');
      await writeFile(join(source, 'file.txt'), 'source\n');
      git(source, 'add', '--all');
      const tree = git(source, 'write-tree');
      const sourceCommit = run(
        'git',
        [
          'hash-object',
          '-t',
          'commit',
          '-w',
          ...(unsupportedMessage.literally ? ['--literally'] : []),
          '--stdin',
        ],
        source,
        {
          input: Buffer.concat([
            Buffer.from(
              `tree ${tree}\nparent ${base}\nauthor Codex Cloud <codex@example.test> 0 +0000\ncommitter Codex Cloud <codex@example.test> 0 +0000\n\n`,
            ),
            unsupportedMessage.bytes,
          ]),
        },
      );
      git(source, 'reset', '--quiet', '--hard', sourceCommit);
      assert.match(
        runFailure(
          process.execPath,
          [
            handoffCli,
            'export',
            '--base',
            base,
            '--verification',
            verificationPath,
          ],
          source,
        ),
        unsupportedMessage.diagnostic,
      );
    });
  }

  await t.test('exact UTF-8 commit message bytes', async () => {
    const source = join(root, 'exact-commit-message');
    git(root, 'init', '--quiet', '--initial-branch=main', source);
    git(source, 'config', 'user.name', 'Codex Cloud');
    git(source, 'config', 'user.email', 'codex@example.test');
    await writeFile(join(source, 'file.txt'), 'base\n');
    git(source, 'add', '--all');
    git(source, 'commit', '--quiet', '--message', 'base');
    const base = git(source, 'rev-parse', 'HEAD');
    const baseTree = git(source, 'rev-parse', 'HEAD^{tree}');
    await writeFile(join(source, 'file.txt'), 'source\n');
    git(source, 'add', '--all');
    const tree = git(source, 'write-tree');
    const commitMessage = '\uFEFFsubject\n\nbody with trailing space \n\n';
    const sourceCommit = run(
      'git',
      ['hash-object', '-t', 'commit', '-w', '--stdin'],
      source,
      {
        input: Buffer.from(
          `tree ${tree}\nparent ${base}\nauthor Codex Cloud <codex@example.test> 0 +0000\ncommitter Codex Cloud <codex@example.test> 0 +0000\n\n${commitMessage}`,
        ),
      },
    );
    git(source, 'reset', '--quiet', '--hard', sourceCommit);
    const exactBundle = run(
      process.execPath,
      [
        handoffCli,
        'export',
        '--base',
        base,
        '--verification',
        verificationPath,
      ],
      source,
    );
    assert.equal(
      decodeTestBundle(exactBundle).source.commitMessage,
      commitMessage,
    );
    const exactBundlePath = join(root, 'exact-commit-message.md');
    const exactManifestPath = join(root, 'exact-commit-message.json');
    await writeFile(exactBundlePath, `${exactBundle}\n`);
    run(
      process.execPath,
      [
        handoffCli,
        'extract',
        '--input',
        exactBundlePath,
        '--expected-base',
        base,
        '--expected-base-tree',
        baseTree,
        '--output',
        exactManifestPath,
      ],
      source,
    );
    const manifest = JSON.parse(await readFile(exactManifestPath, 'utf8'));
    assert.equal(manifest.source.commitMessage, commitMessage);
  });
});

test('rejects sparse and index-hidden targets before changing repository state', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'prisma-prim-handoff-index-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  git(root, 'init', '--quiet', '--initial-branch=main', source);
  git(source, 'config', 'user.name', 'Codex Cloud');
  git(source, 'config', 'user.email', 'codex@example.test');
  await writeFile(join(source, 'tracked.txt'), 'base\n');
  await writeFile(join(source, 'unrelated.txt'), 'unrelated\n');
  git(source, 'add', '--all');
  git(source, 'commit', '--quiet', '--message', 'base');
  const baseCommitSha = git(source, 'rev-parse', 'HEAD');
  await writeFile(join(source, 'tracked.txt'), 'source\n');
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

  const cases = [
    {
      name: 'assume-unchanged affected file',
      async configure(target) {
        await writeFile(join(target, 'tracked.txt'), 'LOCAL_SECRET\n');
        git(target, 'update-index', '--assume-unchanged', '--', 'tracked.txt');
      },
      expectedContents: 'LOCAL_SECRET\n',
      diagnostic: /assume-unchanged/u,
    },
    {
      name: 'unrelated assume-unchanged file',
      configure(target) {
        git(
          target,
          'update-index',
          '--assume-unchanged',
          '--',
          'unrelated.txt',
        );
      },
      expectedContents: 'base\n',
      diagnostic: /assume-unchanged/u,
    },
    {
      name: 'skip-worktree affected file',
      async configure(target) {
        git(target, 'update-index', '--skip-worktree', '--', 'tracked.txt');
        await rm(join(target, 'tracked.txt'));
      },
      expectedContents: null,
      diagnostic: /skip-worktree/u,
    },
    {
      name: 'unrelated skip-worktree file',
      configure(target) {
        git(target, 'update-index', '--skip-worktree', '--', 'unrelated.txt');
      },
      expectedContents: 'base\n',
      diagnostic: /skip-worktree/u,
    },
    {
      name: 'configured sparse checkout',
      configure(target) {
        git(target, 'config', 'core.sparseCheckout', 'true');
      },
      expectedContents: 'base\n',
      diagnostic: /sparse checkout/u,
    },
    {
      name: 'invalid sparse checkout configuration',
      configure(target) {
        git(target, 'config', 'core.sparseCheckout', 'not-a-boolean');
      },
      cleanup(target) {
        git(target, 'config', '--unset', 'core.sparseCheckout');
      },
      snapshotBeforeConfigure: true,
      skipCleanStatusAssertion: true,
      expectedContents: 'base\n',
      diagnostic: /bad boolean|not a valid boolean/u,
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const target = createBaseOnlyTarget(
        root,
        source,
        `target-${scenario.name.replaceAll(' ', '-')}`,
        baseCommitSha,
      );
      const stateBeforeConfiguration = scenario.snapshotBeforeConfigure
        ? await snapshotRepositoryState(target)
        : null;
      await scenario.configure(target);
      if (!scenario.skipCleanStatusAssertion) {
        assert.equal(git(target, 'status', '--porcelain=v1'), '');
      }
      const before =
        stateBeforeConfiguration ?? (await snapshotRepositoryState(target));
      const stderr = runFailure(
        process.execPath,
        [handoffCli, 'materialize', '--input', bundlePath],
        target,
      );
      assert.match(stderr, scenario.diagnostic);
      await scenario.cleanup?.(target);
      const after = await snapshotRepositoryState(target);
      assert.deepEqual(after.index, before.index);
      assert.deepEqual(after.objectFiles, before.objectFiles);
      if (scenario.expectedContents === null) {
        await assert.rejects(readFile(join(target, 'tracked.txt')), {
          code: 'ENOENT',
        });
      } else {
        assert.equal(
          await readFile(join(target, 'tracked.txt'), 'utf8'),
          scenario.expectedContents,
        );
      }
    });
  }

  const affectedMismatchCases = [
    {
      name: 'missing affected tracked path',
      configure: (target) => rm(join(target, 'tracked.txt')),
      diagnostic: /dirty checkout/u,
      async assertPreserved(target) {
        await assert.rejects(readFile(join(target, 'tracked.txt')), {
          code: 'ENOENT',
        });
      },
    },
    {
      name: 'affected tracked blob mismatch',
      async configure(target) {
        const path = join(target, 'tracked.txt');
        git(target, 'config', 'core.checkStat', 'minimal');
        git(target, 'config', 'core.trustctime', 'false');
        const oldTime = new Date('2000-01-01T00:00:00.000Z');
        await utimes(path, oldTime, oldTime);
        git(target, 'update-index', '--refresh');
        await writeFile(path, 'EVIL\n');
        await utimes(path, oldTime, oldTime);
      },
      cleanStatus: true,
      diagnostic: /content does not match the bound base tree/u,
      async assertPreserved(target) {
        assert.equal(
          await readFile(join(target, 'tracked.txt'), 'utf8'),
          'EVIL\n',
        );
      },
    },
    {
      name: 'affected tracked mode mismatch',
      async configure(target) {
        git(target, 'config', 'core.fileMode', 'false');
        await chmod(join(target, 'tracked.txt'), 0o755);
      },
      cleanStatus: true,
      diagnostic: /mode does not match the bound base tree/u,
      async assertPreserved(target) {
        assert.equal(
          (await lstat(join(target, 'tracked.txt'))).mode & 0o777,
          0o755,
        );
      },
    },
  ];
  for (const scenario of affectedMismatchCases) {
    await t.test(scenario.name, async () => {
      const target = createBaseOnlyTarget(
        root,
        source,
        `target-${scenario.name.replaceAll(' ', '-')}`,
        baseCommitSha,
      );
      await scenario.configure(target);
      if (scenario.cleanStatus) {
        assert.equal(git(target, 'status', '--porcelain=v1'), '');
      } else {
        assert.notEqual(git(target, 'status', '--porcelain=v1'), '');
      }
      const before = await snapshotRepositoryState(target);
      assert.match(
        runFailure(
          process.execPath,
          [handoffCli, 'materialize', '--input', bundlePath],
          target,
        ),
        scenario.diagnostic,
      );
      const after = await snapshotRepositoryState(target);
      assert.deepEqual(after, before);
      await scenario.assertPreserved(target);
    });
  }

  await t.test(
    'ignores caller-controlled Git redirection variables',
    async () => {
      const target = createBaseOnlyTarget(
        root,
        source,
        'target-poisoned-git-environment',
        baseCommitSha,
      );
      const targetIndex = resolveGitPath(
        target,
        git(target, 'rev-parse', '--git-path', 'index'),
      );
      const externalIndex = join(root, 'external-index');
      const externalObjects = join(root, 'external-objects');
      await copyFile(targetIndex, externalIndex);
      await mkdir(externalObjects);
      const externalIndexBefore = await readFile(externalIndex);
      run(
        process.execPath,
        [handoffCli, 'materialize', '--input', bundlePath],
        target,
        {
          env: {
            ...process.env,
            GIT_ALTERNATE_OBJECT_DIRECTORIES: join(source, '.git', 'objects'),
            GIT_CONFIG_COUNT: '1',
            GIT_CONFIG_KEY_0: 'core.sparseCheckout',
            GIT_CONFIG_VALUE_0: 'true',
            GIT_DIR: join(source, '.git'),
            GIT_INDEX_FILE: externalIndex,
            GIT_OBJECT_DIRECTORY: externalObjects,
            GIT_REPLACE_REF_BASE: 'refs/replace-hostile',
            GIT_WORK_TREE: source,
          },
        },
      );
      assert.equal(
        git(target, 'write-tree'),
        git(source, 'rev-parse', 'HEAD^{tree}'),
      );
      assert.equal(
        await readFile(join(target, 'tracked.txt'), 'utf8'),
        'source\n',
      );
      assert.deepEqual(await readFile(externalIndex), externalIndexBefore);
      assert.deepEqual(await readdir(externalObjects), []);
    },
  );
});

test('reports apply-phase signal interruption and disposable-checkout recovery', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'prisma-prim-handoff-signal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  git(root, 'init', '--quiet', '--initial-branch=main', source);
  git(source, 'config', 'user.name', 'Codex Cloud');
  git(source, 'config', 'user.email', 'codex@example.test');
  await writeFile(join(source, '000-delete.txt'), 'delete me\n');
  git(source, 'add', '--all');
  git(source, 'commit', '--quiet', '--message', 'base');
  const base = git(source, 'rev-parse', 'HEAD');
  await rm(join(source, '000-delete.txt'));
  await writeFile(join(source, 'large.bin'), Buffer.alloc(10 * 1024 * 1024));
  git(source, 'add', '--all');
  git(source, 'commit', '--quiet', '--message', 'large source');
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
    [handoffCli, 'export', '--base', base, '--verification', verificationPath],
    source,
  );
  const bundlePath = join(root, 'signal-handoff.md');
  await writeFile(bundlePath, `${bundle}\n`);
  const target = createBaseOnlyTarget(root, source, 'target', base);
  const sentinel = join(target, '000-delete.txt');
  const child = spawn(
    process.execPath,
    [handoffCli, 'materialize', '--input', bundlePath],
    { cwd: target, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      await readFile(sentinel);
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
    if (child.exitCode !== null) break;
    await wait(2);
  }
  assert.equal(
    child.exitCode,
    null,
    `materialize exited before signal: ${stderr}`,
  );
  assert.equal(child.kill('SIGTERM'), true);
  const result = await waitForChild(child);
  assert.deepEqual(result, { code: 1, signal: null });
  assert.match(stderr, /Materialization apply phase failed/u);
  assert.match(stderr, /Received SIGTERM/u);
  assert.match(stderr, /discard this disposable checkout/u);
  assert.match(stderr, new RegExp(base, 'u'));
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
  assert.match(execution, /--expected-base-tree/u);
  assert.match(execution, /codex-cloud-publication\.mjs/u);
  assert.match(execution, /sourceTreeSha/u);
  assert.match(execution, /strict UTF-8/u);
  assert.match(execution, /assume-unchanged.*skip-worktree/su);
  assert.match(execution, /re-reads.*main.*branch/su);
  assert.match(environment, /Codex Cloud publication handoff/u);
  assert.match(environment, /codex-cloud-handoff\.mjs materialize/u);
  assert.match(environment, /--expected-base-tree/u);
  assert.match(environment, /fresh exact-base checkout/u);
});
