#!/usr/bin/env node
// Removes one finished worktree of this repository: its folder, its Git
// registration and, with --delete-branch, its local branch once merged.
// Node's fs.rm deletes paths beyond the Windows path limit and removes links
// without following them. A file held open stays: the command names it and
// never stops the process that holds it. Rerunning it is safe.

import { execFile } from 'node:child_process';
import { lstat, readFile, realpath, rm } from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const usage =
  'Usage: node scripts/remove-worktree.mjs <path> [--delete-branch] [--force]';
const worktreeFolders = ['.worktrees', join('.claude', 'worktrees')];
const heldFileCodes = new Set(['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY']);

async function git(cwd, args) {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stdout };
  } catch (error) {
    return { ok: false, stdout: error.stdout ?? '', stderr: firstLine(error) };
  }
}

function firstLine(error) {
  const text = String(error.stderr || error.message || error).trim();
  return text.split('\n').find((line) => line.trim()) ?? text;
}

// The default lookup asks GitHub for the pull request whose head is the branch.
export async function pullRequestFromGitHub(branch, { cwd }) {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'view', branch, '--json', 'state,headRefOid'],
      { cwd, encoding: 'utf8', windowsHide: true },
    );
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function pathKey(path) {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

function samePath(left, right) {
  return pathKey(left) === pathKey(right);
}

function contains(parent, child) {
  const path = relative(pathKey(parent), pathKey(child));
  return (
    path === '' ||
    (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  );
}

// Resolves links, Windows short names and case through the nearest existing
// ancestor, so two spellings of one folder compare equal.
async function canonicalPath(path) {
  const missing = [];
  let existing = resolve(path);
  for (;;) {
    try {
      return join(await realpath(existing), ...missing.reverse());
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      const parent = dirname(existing);
      if (parent === existing) return resolve(path);
      missing.push(basename(existing));
      existing = parent;
    }
  }
}

async function entryType(path) {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) return 'link';
    return stats.isDirectory() ? 'folder' : 'file';
  } catch (error) {
    if (error.code === 'ENOENT') return 'missing';
    throw error;
  }
}

async function registeredWorktrees(cwd) {
  const list = await git(cwd, ['worktree', 'list', '--porcelain', '-z']);
  if (!list.ok) return { error: list.stderr };
  const worktrees = [];
  let current = null;
  for (const line of list.stdout.split('\0')) {
    if (line === '') {
      current = null;
      continue;
    }
    const space = line.indexOf(' ');
    const key = space < 0 ? line : line.slice(0, space);
    const value = space < 0 ? '' : line.slice(space + 1);
    if (key === 'worktree') {
      current = { path: await canonicalPath(value) };
      worktrees.push(current);
    } else if (current && key === 'branch') {
      current.branch = value.replace(/^refs\/heads\//, '');
    } else if (current && key === 'locked') {
      current.locked = value || 'no reason given';
    }
  }
  return { worktrees };
}

// An unregistered folder is deleted only when nothing in it says it belongs
// to another repository or is a separate clone.
async function foreignRepositoryReason(folder, commonDirectory) {
  const marker = join(folder, '.git');
  const type = await entryType(marker);
  if (type === 'missing') return null;
  if (type !== 'file') return `${folder} is a separate repository`;
  const gitdir = /^gitdir:\s*(.+)$/m.exec(await readFile(marker, 'utf8'));
  if (!gitdir) return `${marker} does not name a Git directory`;
  const target = await canonicalPath(resolve(folder, gitdir[1].trim()));
  return contains(join(commonDirectory, 'worktrees'), target)
    ? null
    : `${folder} belongs to another repository (${target})`;
}

async function mergeEvidence({ repository, branch, tip, pullRequestFor }) {
  const ancestor = await git(repository, [
    'merge-base',
    '--is-ancestor',
    tip,
    'refs/remotes/origin/main',
  ]);
  if (ancestor.ok) return { merged: true, reason: 'it is in origin/main' };
  let pullRequest;
  try {
    pullRequest = await pullRequestFor(branch, { cwd: repository });
  } catch {
    pullRequest = null;
  }
  if (pullRequest?.state !== 'MERGED') {
    return {
      merged: false,
      reason: pullRequest?.state
        ? `its pull request is ${pullRequest.state} and it is not in origin/main`
        : 'no merged pull request was found and it is not in origin/main',
    };
  }
  const head = pullRequest.headRefOid;
  if (
    head &&
    (head === tip ||
      (await git(repository, ['merge-base', '--is-ancestor', tip, head])).ok)
  ) {
    return { merged: true, reason: 'its pull request is merged' };
  }
  return {
    merged: false,
    reason: `it has commits that its merged pull request does not contain (head ${String(head).slice(0, 12)})`,
  };
}

async function deleteMergedBranch({ repository, branch, pullRequestFor }) {
  const tip = await git(repository, [
    'rev-parse',
    '--verify',
    '--quiet',
    `refs/heads/${branch}`,
  ]);
  if (!tip.ok) {
    return { ok: true, message: `Branch ${branch} is already deleted.` };
  }
  const evidence = await mergeEvidence({
    repository,
    branch,
    tip: tip.stdout.trim(),
    pullRequestFor,
  });
  if (!evidence.merged) {
    return {
      ok: false,
      message: `Kept branch ${branch}: ${evidence.reason}.`,
    };
  }
  const deletion = await git(repository, ['branch', '-D', branch]);
  return deletion.ok
    ? {
        ok: true,
        message: `Deleted merged branch ${branch} (${evidence.reason}).`,
      }
    : {
        ok: false,
        message: `Kept branch ${branch}: ${deletion.stderr}`,
      };
}

async function deleteFolder(path, { maxRetries, retryDelay }) {
  const options = { recursive: true, force: true, maxRetries, retryDelay };
  // The .git file goes first, so a partial deletion leaves no working tree
  // whose missing files would read as uncommitted changes on the rerun.
  await rm(join(path, '.git'), options);
  await rm(path, options);
}

export async function removeWorktree({
  target,
  cwd = process.cwd(),
  force = false,
  deleteBranch = false,
  pullRequestFor = pullRequestFromGitHub,
  removeFolder = deleteFolder,
  maxRetries = 5,
  retryDelay = 200,
  report = () => {},
}) {
  const lines = [];
  const say = (line) => {
    lines.push(line);
    report(line);
  };
  const finish = (code, line) => {
    if (line) lines.push(line);
    return { code, output: lines.join('\n'), error: code === 0 ? '' : line };
  };

  const { worktrees, error } = await registeredWorktrees(cwd);
  if (!worktrees?.length) {
    return finish(
      1,
      `Run this command from a checkout of this repository (git worktree list: ${error ?? 'no worktree'}).`,
    );
  }
  const [mainCheckout, ...linked] = worktrees;
  const repository = mainCheckout.path;
  const path = await canonicalPath(resolve(cwd, target));
  const current = await canonicalPath(cwd);

  if (contains(path, repository)) {
    return finish(1, `Refused ${path}: it is or contains the main checkout.`);
  }
  if (contains(path, current)) {
    return finish(
      1,
      `Refused ${path}: the current directory is inside it. cd out of it, for example to ${repository}, and rerun.`,
    );
  }
  const registered = linked.find((worktree) => samePath(worktree.path, path));
  const nested = linked.find(
    (worktree) => worktree !== registered && contains(path, worktree.path),
  );
  if (nested) {
    return finish(
      1,
      `Refused ${path}: it contains the registered worktree ${nested.path}. Remove that one first.`,
    );
  }
  if (registered?.locked) {
    return finish(
      1,
      `Refused ${path}: the worktree is locked (${registered.locked}). Run git worktree unlock on it first if it is finished.`,
    );
  }

  const type = await entryType(path);
  if (type !== 'missing' && !registered) {
    const folders = await Promise.all(
      worktreeFolders.map((folder) => canonicalPath(join(repository, folder))),
    );
    if (
      type !== 'folder' ||
      !folders.some((folder) => samePath(dirname(path), folder))
    ) {
      return finish(
        1,
        `Refused ${path}: it is neither a registered worktree of this repository nor a folder directly under .worktrees/ or .claude/worktrees/.`,
      );
    }
    const common = await git(cwd, [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ]);
    if (!common.ok) return finish(1, `git rev-parse failed: ${common.stderr}`);
    const reason = await foreignRepositoryReason(
      path,
      await canonicalPath(common.stdout.trim()),
    );
    if (reason) return finish(1, `Refused ${path}: ${reason}.`);
  }

  // Without its .git file, a folder has no working tree left to check: this is
  // the rerun after a partial deletion.
  if (
    registered &&
    type === 'folder' &&
    !force &&
    (await entryType(join(path, '.git'))) !== 'missing'
  ) {
    const status = await git(path, ['status', '--porcelain']);
    if (!status.ok) {
      return finish(
        1,
        `Refused ${path}: git status failed (${status.stderr}). Rerun with --force to remove it anyway.`,
      );
    }
    const changes = status.stdout.split('\n').filter(Boolean);
    if (changes.length) {
      return finish(
        1,
        `Refused ${path}: it has uncommitted changes.\n${changes.slice(0, 10).join('\n')}\nCommit and push them, or rerun with --force to discard them.`,
      );
    }
  }

  // Node deletes the folder instead of `git worktree remove --force`, which on
  // Windows follows a junction inside the worktree and deletes the files of
  // its target. Pruning then drops the registration. After a failure the
  // registration stays, so the rerun still knows the worktree and its branch.
  if (type === 'missing') {
    say(`Nothing to remove at ${path}.`);
  } else {
    try {
      await removeFolder(path, { maxRetries, retryDelay });
    } catch (error) {
      const held = error.path ?? path;
      return finish(
        1,
        heldFileCodes.has(error.code)
          ? `Could not delete ${held} (${error.code}): a process probably still uses it. Close the shell or server using it, then rerun this command.`
          : `Could not delete ${held}: ${error.message}. Rerun this command once the cause is fixed.`,
      );
    }
    say(`Removed ${path}.`);
  }

  let failure = null;
  const prune = await git(repository, ['worktree', 'prune']);
  if (!prune.ok) failure = `git worktree prune failed: ${prune.stderr}`;
  else say('Pruned stale worktree registrations.');

  if (deleteBranch) {
    if (registered?.branch) {
      const branch = await deleteMergedBranch({
        repository,
        branch: registered.branch,
        pullRequestFor,
      });
      say(branch.message);
      if (!branch.ok) failure ??= branch.message;
    } else {
      say(`No branch to delete: ${path} has no registered branch.`);
    }
  }

  return failure ? finish(1, failure) : finish(0);
}

export async function main(
  argv = process.argv.slice(2),
  {
    cwd = process.cwd(),
    stdout = process.stdout,
    stderr = process.stderr,
  } = {},
) {
  const options = { force: false, deleteBranch: false };
  const paths = [];
  for (const argument of argv) {
    if (argument === '--help' || argument === '-h') {
      stdout.write(`${usage}\n`);
      return 0;
    }
    if (argument === '--force') options.force = true;
    else if (argument === '--delete-branch') options.deleteBranch = true;
    else if (argument.startsWith('-')) {
      stderr.write(`Unknown option ${argument}.\n${usage}\n`);
      return 2;
    } else paths.push(argument);
  }
  if (paths.length !== 1) {
    stderr.write(`${usage}\n`);
    return 2;
  }
  const result = await removeWorktree({
    target: paths[0],
    cwd,
    ...options,
    report: (line) => stdout.write(`${line}\n`),
  });
  if (result.error) stderr.write(`${result.error}\n`);
  return result.code;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main();
}
