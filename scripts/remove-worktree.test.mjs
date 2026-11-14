import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { removeWorktree } from './remove-worktree.mjs';

const scriptPath = fileURLToPath(
  new URL('./remove-worktree.mjs', import.meta.url),
);

// Paths are compared the way the file system does: Windows ignores case.
function pathKey(path) {
  const absolute = resolve(path);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

async function repository(t) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'remove-worktree-')),
  );
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
  );
  const main = join(root, 'main');
  await mkdir(main);
  await writeFile(join(root, 'git-config'), '');
  // The user's Git configuration (hooks, signing, drivers) stays out.
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: join(root, 'git-config'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Synthetic',
    GIT_AUTHOR_EMAIL: 'synthetic@example.invalid',
    GIT_COMMITTER_NAME: 'Synthetic',
    GIT_COMMITTER_EMAIL: 'synthetic@example.invalid',
  };
  const git = (cwd, ...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', env }).trim();

  git(main, 'init', '--quiet', '--initial-branch=main');
  await writeFile(join(main, '.gitignore'), 'node_modules/\n.worktrees/\n');
  await writeFile(join(main, 'README.md'), 'Synthetic fixture.\n');
  git(main, 'add', '.');
  git(main, 'commit', '--quiet', '--message', 'Synthetic main');
  git(main, 'update-ref', 'refs/remotes/origin/main', 'HEAD');

  async function addWorktree(name, { commit = false } = {}) {
    const path = join(main, '.worktrees', name);
    const branch = `work/${name}`;
    git(main, 'worktree', 'add', '--quiet', '-b', branch, path);
    if (commit) {
      await writeFile(join(path, `${name}.txt`), `${name}\n`);
      git(path, 'add', '.');
      git(path, 'commit', '--quiet', '--message', `Synthetic ${name}`);
    }
    return { path, branch };
  }

  function registeredPaths() {
    return git(main, 'worktree', 'list', '--porcelain')
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => pathKey(line.slice('worktree '.length)));
  }

  function branchExists(branch) {
    return (
      spawnSync('git', ['rev-parse', '--verify', '--quiet', branch], {
        cwd: main,
        env,
      }).status === 0
    );
  }

  function remove(target, options = {}) {
    return removeWorktree({
      target,
      cwd: main,
      pullRequestFor: async () => null,
      maxRetries: 1,
      retryDelay: 10,
      ...options,
    });
  }

  return {
    root,
    main,
    git,
    addWorktree,
    registeredPaths,
    branchExists,
    remove,
  };
}

test('removes a registered worktree that holds a path longer than 260 characters', async (t) => {
  const { addWorktree, registeredPaths, remove } = await repository(t);
  const { path } = await addWorktree('deep');
  let deep = join(path, 'node_modules', '.pnpm');
  while (deep.length <= 300) deep = join(deep, 'synthetic-package-segment');
  await mkdir(deep, { recursive: true });
  await writeFile(join(deep, 'index.js'), 'export {};\n');
  assert.ok(join(deep, 'index.js').length > 260);

  const result = await remove(path);

  assert.equal(result.code, 0, result.output);
  assert.equal(existsSync(path), false);
  assert.ok(!registeredPaths().includes(pathKey(path)));
  assert.match(result.output, /Removed /);
});

test('removes an unregistered leftover folder under .worktrees and .claude/worktrees', async (t) => {
  const { main, remove } = await repository(t);
  for (const folder of ['.worktrees', join('.claude', 'worktrees')]) {
    const leftover = join(main, folder, 'leftover');
    await mkdir(join(leftover, 'node_modules', 'package'), { recursive: true });
    await writeFile(join(leftover, 'node_modules', 'package', 'a.js'), '\n');

    const result = await remove(leftover);

    assert.equal(result.code, 0, result.output);
    assert.equal(existsSync(leftover), false, leftover);
  }
  // Git dropped the registration but left the folder and its .git file.
  const marked = join(main, '.worktrees', 'marked');
  await mkdir(join(marked, 'node_modules'), { recursive: true });
  await writeFile(
    join(marked, '.git'),
    `gitdir: ${join(main, '.git', 'worktrees', 'marked')}\n`,
  );

  const result = await remove(marked);

  assert.equal(result.code, 0, result.output);
  assert.equal(existsSync(marked), false);
});

test('refuses the main checkout, outside paths and folders it cannot attribute to a worktree', async (t) => {
  const { root, main, git, addWorktree, remove } = await repository(t);
  const outside = join(root, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'keep.txt'), 'keep\n');
  await mkdir(join(main, 'docs', 'nested'), { recursive: true });
  await mkdir(join(main, '.claude', 'worktrees'), { recursive: true });
  const notDirectChild = join(main, '.worktrees', 'group', 'nested');
  await mkdir(notDirectChild, { recursive: true });
  const separateClone = join(main, '.worktrees', 'clone');
  await mkdir(separateClone, { recursive: true });
  git(separateClone, 'init', '--quiet');
  const foreign = join(main, '.worktrees', 'foreign');
  await mkdir(foreign, { recursive: true });
  await writeFile(
    join(foreign, '.git'),
    `gitdir: ${join(root, 'other', '.git', 'worktrees', 'foreign')}\n`,
  );
  const outer = join(main, '.worktrees', 'outer');
  await mkdir(outer, { recursive: true });
  git(
    main,
    'worktree',
    'add',
    '--quiet',
    '-b',
    'work/inner',
    join(outer, 'inner'),
  );
  const locked = await addWorktree('locked');
  git(main, 'worktree', 'lock', '--reason', 'synthetic lock', locked.path);

  const cases = [
    [main, /main checkout/],
    [root, /main checkout/],
    [outside, /neither a registered worktree/],
    [join(main, 'docs', 'nested'), /neither a registered worktree/],
    [join(main, '.claude', 'worktrees'), /neither a registered worktree/],
    [join(main, '.worktrees'), /contains the registered worktree/],
    [notDirectChild, /neither a registered worktree/],
    [separateClone, /separate repository/],
    [foreign, /another repository/],
    [outer, /contains the registered worktree/],
    [locked.path, /locked/],
  ];
  for (const [target, reason] of cases) {
    const result = await remove(target, { force: true });

    assert.notEqual(result.code, 0, target);
    assert.match(result.output, reason, target);
    assert.ok(existsSync(target), target);
  }
  assert.ok(existsSync(join(outside, 'keep.txt')));
  assert.ok(existsSync(join(main, 'README.md')));
});

test('refuses the worktree that contains the current working directory', async (t) => {
  const { addWorktree, remove } = await repository(t);
  const { path } = await addWorktree('current');
  const inside = join(path, 'apps');
  await mkdir(inside);

  for (const cwd of [path, inside]) {
    const result = await remove(path, { cwd, force: true });

    assert.equal(result.code, 1, cwd);
    assert.match(result.output, /cd out/);
    assert.ok(existsSync(path));
  }
});

test('refuses uncommitted changes unless --force', async (t) => {
  const { addWorktree, remove } = await repository(t);
  const tracked = await addWorktree('tracked');
  await writeFile(join(tracked.path, 'README.md'), 'Changed.\n');
  const untracked = await addWorktree('untracked');
  await writeFile(join(untracked.path, 'new-file.txt'), 'New.\n');

  for (const { path } of [tracked, untracked]) {
    const refused = await remove(path);

    assert.equal(refused.code, 1, refused.output);
    assert.match(refused.output, /uncommitted changes/);
    assert.match(refused.output, /--force/);
    assert.ok(existsSync(path));

    const forced = await remove(path, { force: true });

    assert.equal(forced.code, 0, forced.output);
    assert.equal(existsSync(path), false);
  }
});

test('a rerun reports nothing to remove and prunes a stale registration', async (t) => {
  const { addWorktree, registeredPaths, remove } = await repository(t);
  const removed = await addWorktree('removed');
  assert.equal((await remove(removed.path)).code, 0);

  const rerun = await remove(removed.path);

  assert.equal(rerun.code, 0, rerun.output);
  assert.match(rerun.output, /Nothing to remove/);

  const stale = await addWorktree('stale');
  await rm(stale.path, { recursive: true, force: true });
  assert.ok(registeredPaths().includes(pathKey(stale.path)));

  const pruned = await remove(stale.path);

  assert.equal(pruned.code, 0, pruned.output);
  assert.match(pruned.output, /Nothing to remove/);
  assert.ok(!registeredPaths().includes(pathKey(stale.path)));
});

test('deletes the branch only when it is merged', async (t) => {
  const { git, addWorktree, branchExists, remove } = await repository(t);
  const lookups = [];
  const pullRequests = new Map();
  const pullRequestFor = async (branch) => {
    lookups.push(branch);
    return pullRequests.get(branch) ?? null;
  };

  const squashed = await addWorktree('squashed', { commit: true });
  pullRequests.set(squashed.branch, {
    state: 'MERGED',
    headRefOid: git(squashed.path, 'rev-parse', 'HEAD'),
  });
  const ancestor = await addWorktree('ancestor');
  const open = await addWorktree('open', { commit: true });
  pullRequests.set(open.branch, {
    state: 'OPEN',
    headRefOid: git(open.path, 'rev-parse', 'HEAD'),
  });
  const ahead = await addWorktree('ahead', { commit: true });
  pullRequests.set(ahead.branch, {
    state: 'MERGED',
    headRefOid: git(ahead.path, 'rev-parse', 'HEAD'),
  });
  await writeFile(join(ahead.path, 'after-merge.txt'), 'Local work.\n');
  git(ahead.path, 'add', '.');
  git(ahead.path, 'commit', '--quiet', '--message', 'Synthetic local work');
  const unpublished = await addWorktree('unpublished', { commit: true });
  const kept = await addWorktree('kept', { commit: true });

  for (const merged of [squashed, ancestor]) {
    const result = await remove(merged.path, {
      deleteBranch: true,
      pullRequestFor,
    });

    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Deleted merged branch/);
    assert.equal(branchExists(merged.branch), false, merged.branch);
  }
  for (const unmerged of [open, ahead, unpublished]) {
    const result = await remove(unmerged.path, {
      deleteBranch: true,
      pullRequestFor,
    });

    assert.equal(result.code, 1, result.output);
    assert.ok(
      result.output.includes(`Kept branch ${unmerged.branch}`),
      result.output,
    );
    assert.equal(existsSync(unmerged.path), false);
    assert.ok(branchExists(unmerged.branch), unmerged.branch);
  }
  const withoutFlag = await remove(kept.path, { pullRequestFor });

  assert.equal(withoutFlag.code, 0, withoutFlag.output);
  assert.ok(branchExists(kept.branch));
  assert.ok(!lookups.includes(kept.branch));
});

test('removes a link inside the worktree without touching its target', async (t) => {
  const { root, addWorktree, remove } = await repository(t);
  const shared = join(root, 'shared-store');
  await mkdir(shared);
  await writeFile(join(shared, 'keep.txt'), 'keep\n');
  const { path } = await addWorktree('linked');
  await mkdir(join(path, 'node_modules'));
  await symlink(shared, join(path, 'node_modules', 'shared'), 'junction');

  const result = await remove(path);

  assert.equal(result.code, 0, result.output);
  assert.equal(existsSync(path), false);
  assert.ok(existsSync(join(shared, 'keep.txt')));
});

test('names a locked path, exits non-zero and asks for a rerun', async (t) => {
  const { addWorktree, remove } = await repository(t);
  const { path } = await addWorktree('locked-file');
  const held = join(path, 'apps', 'api');
  await mkdir(held, { recursive: true });

  const result = await remove(path, {
    removeFolder: async () => {
      const error = new Error(
        `EBUSY: resource busy or locked, rmdir '${held}'`,
      );
      error.code = 'EBUSY';
      error.path = held;
      throw error;
    },
  });

  assert.equal(result.code, 1, result.output);
  assert.ok(result.output.includes(held), result.output);
  assert.match(result.output, /close the shell or server/i);
  assert.match(result.output, /rerun/i);
});

test(
  'reports a folder held by a running process on Windows and finishes on the rerun',
  {
    skip:
      process.platform === 'win32'
        ? false
        : 'Only Windows refuses to delete a folder another process uses.',
  },
  async (t) => {
    const { addWorktree, registeredPaths, remove } = await repository(t);
    const { path } = await addWorktree('held');
    const held = join(path, 'apps', 'web');
    await mkdir(held, { recursive: true });
    const holder = spawn(
      process.execPath,
      ['--eval', "process.stdin.on('end', () => process.exit(0)).resume();"],
      { cwd: held, stdio: ['pipe', 'ignore', 'ignore'] },
    );
    const exited = new Promise((resolveExit) =>
      holder.once('exit', resolveExit),
    );
    t.after(() => holder.stdin.end());
    await new Promise((resolveSpawn) => holder.once('spawn', resolveSpawn));

    const locked = await remove(path);

    assert.equal(locked.code, 1, locked.output);
    assert.ok(locked.output.includes(held), locked.output);
    assert.equal(holder.exitCode, null, 'the holder keeps running');
    assert.ok(registeredPaths().includes(pathKey(path)), 'kept for the rerun');

    holder.stdin.end();
    await exited;
    const rerun = await remove(path);

    assert.equal(rerun.code, 0, rerun.output);
    assert.equal(existsSync(path), false);
    assert.ok(!registeredPaths().includes(pathKey(path)));
  },
);

test('prints its usage when the path is missing or an option is unknown', () => {
  for (const args of [[], ['--unknown', 'path']]) {
    const result = spawnSync(process.execPath, [scriptPath, ...args], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 2, result.stderr);
    assert.match(
      result.stderr,
      /Usage: node scripts\/remove-worktree\.mjs <path>/,
    );
  }
});
