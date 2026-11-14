import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const hash = (value) => createHash('sha256').update(value).digest('hex');

function metadata() {
  const result = {};
  for (const project of ['', 'apps/api', 'apps/web']) {
    const modules = join(root, project, 'node_modules');
    const paths = [
      '.modules.yaml',
      '.pnpm/lock.yaml',
      '.pnpm-workspace-state-v1.json',
    ];
    if (existsSync(join(modules, '.bin')))
      paths.push(
        ...readdirSync(join(modules, '.bin')).map((name) => `.bin/${name}`),
      );
    for (const name of paths) {
      const path = join(modules, name);
      result[`${project}/${name}`] = existsSync(path)
        ? lstatSync(path).isSymbolicLink()
          ? `link:${readlinkSync(path)}`
          : hash(readFileSync(path))
        : 'absent';
    }
  }
  return result;
}

test(
  'actual repository refresh restores cached registry package bytes without changing its caller',
  {
    skip: process.env.PRISMA_WORKTREE_REPOSITORY_SMOKE !== '1',
    timeout: 600_000,
  },
  (t) => {
    const parent = mkdtempSync(join(tmpdir(), 'prep-repository-'));
    const target = join(parent, 'worktree');
    const branch = `smoke/prepare-worktree-${randomUUID()}`;
    const before = metadata();
    const invoke = (command, args, cwd = root) =>
      spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 180_000 });
    t.after(() => {
      if (existsSync(target)) {
        const removed = invoke(process.execPath, [
          join(root, 'scripts/remove-worktree.mjs'),
          target,
        ]);
        assert.equal(removed.status, 0, removed.stderr);
        const deleted = invoke('git', ['branch', '-d', branch]);
        assert.equal(deleted.status, 0, deleted.stderr);
      }
      rmdirSync(parent);
    });
    const args = [
      join(root, 'scripts/prepare-worktree.mjs'),
      '--path',
      target,
      '--branch',
      branch,
      '--base',
      'HEAD',
      '--offline',
    ];
    if (process.env.PRISMA_WORKTREE_SMOKE_STORE)
      args.push('--store', process.env.PRISMA_WORKTREE_SMOKE_STORE);
    else {
      const store = invoke('bash', [
        'scripts/agent-pnpm.sh',
        'store',
        'path',
        '--silent',
      ]);
      assert.equal(store.status, 0, store.stderr);
      const path = realpathSync.native(store.stdout.trim());
      assert.match(basename(path), /^v\d+$/u);
      args.push('--store', dirname(path));
    }
    const first = invoke(process.execPath, args);
    assert.equal(first.status, 0, first.stderr);
    const resolved = invoke(
      process.execPath,
      ['-p', 'require.resolve("prettier")'],
      target,
    );
    assert.equal(resolved.status, 0, resolved.stderr);
    const entry = realpathSync.native(resolved.stdout.trim());
    const part = relative(realpathSync.native(target), entry);
    assert.ok(
      part &&
        !isAbsolute(part) &&
        part !== '..' &&
        !part.startsWith(`..${sep}`),
    );
    const original = hash(readFileSync(entry));
    unlinkSync(entry);
    const damaged = invoke(process.execPath, args);
    assert.equal(damaged.status, 2, damaged.stderr);
    assert.match(damaged.stderr, /--refresh/u);
    const repaired = invoke(process.execPath, [...args, '--refresh']);
    assert.equal(repaired.status, 0, repaired.stderr);
    assert.equal(JSON.parse(repaired.stdout).status, 'prepared');
    assert.equal(hash(readFileSync(entry)), original);
    const ready = invoke(process.execPath, args);
    assert.equal(ready.status, 0, ready.stderr);
    assert.equal(JSON.parse(ready.stdout).status, 'ready');
    assert.deepEqual(
      readdirSync(join(target, 'node_modules')).filter((name) =>
        name.startsWith('.pnpm-retired-'),
      ),
      [],
    );
    assert.deepEqual(metadata(), before);
  },
);
