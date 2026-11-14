import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export class EvidenceError extends Error {}

function git(cwd, args) {
  const result = spawnSync('git', ['--no-optional-locks', '-C', cwd, ...args], {
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new EvidenceError('Cannot establish the Git worktree identity.');
  return result.stdout;
}

function within(parent, child) {
  const part = relative(parent, child);
  return (
    part === '' ||
    (!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`))
  );
}

function directory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const entry = lstatSync(path, { bigint: true });
  if (
    !entry.isDirectory() ||
    entry.isSymbolicLink() ||
    (process.platform !== 'win32' &&
      ((entry.mode & 0o777n) !== 0o700n ||
        entry.uid !== BigInt(process.getuid())))
  )
    throw new EvidenceError(
      'Private evidence needs an owned private directory, without symlinks.',
    );
  return path;
}

function worktreePaths(cwd) {
  const paths = git(cwd, ['worktree', 'list', '--porcelain', '-z'])
    .split('\0')
    .filter((field) => field.startsWith('worktree '))
    .map((field) => resolve(field.slice(9)));
  if (!paths.length)
    throw new EvidenceError('A registered Git worktree is required.');
  return paths.map((path) => (existsSync(path) ? realpathSync(path) : path));
}

function outsideSource(cwd, base, worktrees) {
  let ancestor = base;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor)
      throw new EvidenceError('Cannot resolve the private evidence root.');
    ancestor = parent;
  }
  if (lstatSync(ancestor).isSymbolicLink())
    throw new EvidenceError('Private evidence roots cannot be symlinks.');
  const canonical = resolve(realpathSync(ancestor), relative(ancestor, base));
  if (worktrees.some((worktree) => within(worktree, canonical)))
    throw new EvidenceError(
      'Private evidence must be outside every registered worktree.',
    );
  const probe = spawnSync(
    'git',
    ['--no-optional-locks', '-C', ancestor, 'rev-parse', '--show-toplevel'],
    { encoding: 'utf8' },
  );
  if (probe.status === 0 && within(resolve(probe.stdout.trim()), canonical))
    throw new EvidenceError('Private evidence must be outside tracked source.');
  return canonical;
}

export function preparePrivateOutput({ cwd = process.cwd(), output }) {
  if (typeof output !== 'string' || !output)
    throw new EvidenceError('A private output directory is required.');
  const location = outsideSource(cwd, resolve(output), worktreePaths(cwd));
  return existsSync(location) ? directory(location) : location;
}

export function openPrivateEvidence({
  cwd = process.cwd(),
  root,
  category = 'checkpoints',
  issue,
}) {
  if (!['checkpoints', 'journeys'].includes(category))
    throw new EvidenceError('Unknown private evidence category.');
  const worktrees = worktreePaths(cwd);
  const common = realpathSync(
    git(cwd, [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ]).replace(/\r?\n$/u, ''),
  );
  const repository = createHash('sha256')
    .update(process.platform === 'win32' ? common.toLowerCase() : common)
    .digest('hex');
  const base = resolve(
    root ?? join(dirname(worktrees[0]), '.prisma-agent-evidence'),
  );
  let location = directory(outsideSource(cwd, base, worktrees));
  location = directory(join(location, repository));
  location = directory(join(location, category));
  if (category === 'checkpoints') {
    if (!Number.isSafeInteger(issue) || issue < 1)
      throw new EvidenceError('A positive issue number is required.');
    location = directory(join(location, String(issue)));
  }
  const source = {
    head: git(cwd, ['rev-parse', 'HEAD']).trim(),
    clean:
      git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']) ===
      '',
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  };
  return { directory: location, repository, source };
}

export function readPrivateJson(file) {
  let descriptor;
  try {
    const before = lstatSync(file, { bigint: true });
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.size > 16_384n ||
      (process.platform !== 'win32' &&
        ((before.mode & 0o777n) !== 0o600n ||
          before.uid !== BigInt(process.getuid())))
    )
      throw new EvidenceError(
        'Private metadata must be a private regular file.',
      );
    descriptor = openSync(
      file,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      !opened.isFile()
    )
      throw new EvidenceError('Private metadata changed while opening it.');
    return JSON.parse(readFileSync(descriptor, 'utf8'));
  } catch (error) {
    if (error instanceof EvidenceError) throw error;
    throw new EvidenceError(
      'Private metadata is missing, unreadable or malformed.',
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function writePrivateJson(file, value) {
  const temporary = join(dirname(file), `.pending-${randomUUID()}`);
  let descriptor;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value)}\n`);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    try {
      linkSync(temporary, file);
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') return false;
      throw error;
    }
  } catch {
    throw new EvidenceError('Cannot store immutable private metadata.');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function privateEvidencePaths(files) {
  return files.filter((file) => {
    const normalized = file.replaceAll('\\', '/');
    return (
      normalized.split('/').includes('.prisma-agent-evidence') ||
      /^apps\/web\/(?:test-results|playwright-report)(?:\/|$)/u.test(normalized)
    );
  });
}
