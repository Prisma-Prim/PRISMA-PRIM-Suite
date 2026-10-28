import {
  accessSync,
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
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
import { EvaluationError, fail } from './diagnostic.mjs';

const inputLimit = 1048576;
const outputLimit = 16777216;
const repository = fileURLToPath(new URL('../../', import.meta.url));
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;

function existingPath(path) {
  // Inspect before normalization so a symlink followed by /.. cannot disappear.
  const absolute = isAbsolute(path) ? path : `${process.cwd()}${sep}${path}`;
  let current = sep;
  let stat = lstatSync(current);
  for (const part of absolute.split(sep)) {
    if (part === '') continue;
    if (!stat.isDirectory()) throw new Error('Non-directory path component');
    if (part === '.') continue;
    current = part === '..' ? dirname(current) : join(current, part);
    stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('Unsafe path');
  }
  // Retain the operating system's trailing-slash and traversal semantics.
  return { path: current, stat: lstatSync(absolute) };
}

export function readInput(path, input, previous = null) {
  let descriptor;
  try {
    const inspected = existingPath(path);
    if (!inspected.stat.isFile()) throw new Error('Regular file required');
    descriptor = openSync(
      inspected.path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const stat = fstatSync(descriptor);
    if (
      !stat.isFile() ||
      !sameFile(stat, inspected.stat) ||
      (previous && sameFile(stat, previous.stat))
    )
      throw new Error('Distinct regular file required');
    const buffer = Buffer.alloc(inputLimit + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(
        descriptor,
        buffer,
        length,
        buffer.length - length,
        null,
      );
      if (count === 0) break;
      length += count;
    }
    if (length > inputLimit)
      fail(
        'E_INPUT_LIMIT',
        input,
        null,
        'Limit each input to 1048576 bytes; minimize the declarations rather than truncating records.',
      );
    return { path: inspected.path, stat, bytes: buffer.subarray(0, length) };
  } catch (error) {
    if (error instanceof EvaluationError) throw error;
    fail(
      'E_INPUT_FILE',
      input,
      null,
      'Choose two distinct existing regular readable files without symlink components.',
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function inside(parent, child) {
  const path = relative(parent, child);
  return (
    path === '' ||
    (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
  );
}

export function outputPath(path, inputs) {
  let parent;
  try {
    if (['.', '..'].includes(basename(path)))
      throw new Error('New direct child required');
    parent = existingPath(dirname(path));
    if (!parent.stat.isDirectory()) throw new Error('Directory required');
    accessSync(parent.path, constants.W_OK);
  } catch {
    fail(
      'E_OUTPUT_PATH',
      'output',
      null,
      'Choose a new direct child of an existing writable directory without symlink components, outside the worktree and inputs.',
    );
  }
  const target = resolve(parent.path, basename(path));
  if (
    inside(repository, target) ||
    inputs.some(
      (input) => inside(input.path, target) || inside(target, input.path),
    )
  )
    fail(
      'E_OUTPUT_PATH',
      'output',
      null,
      'Choose an output outside this worktree and both input paths, without overlap.',
    );
  try {
    lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return { target, parent };
    fail(
      'E_OUTPUT_PATH',
      'output',
      null,
      'Choose a new direct child of an existing writable directory.',
    );
  }
  fail(
    'E_OUTPUT_EXISTS',
    'output',
    null,
    'The selected output already exists. Preserve it and select a new output path.',
  );
}

export function artifactBytes(text) {
  if (Buffer.byteLength(text, 'utf8') > outputLimit)
    fail(
      'E_OUTPUT_LIMIT',
      'output',
      null,
      'Each artifact must fit within 16777216 UTF-8 bytes. Reduce the evaluation and use a new output path.',
    );
  return Buffer.from(text, 'utf8');
}

function cleanup(target, directoryStat, created) {
  try {
    if (!sameFile(lstatSync(target), directoryStat)) return false;
    for (const file of created) {
      if (!file.stat || !sameFile(lstatSync(file.path), file.stat))
        return false;
      unlinkSync(file.path);
    }
    rmdirSync(target);
    return true;
  } catch {
    return false;
  }
}

export function writeArtifacts(output, result, report) {
  const { target, parent } = output;
  try {
    const current = existingPath(parent.path);
    if (!sameFile(current.stat, parent.stat)) throw new Error('Parent changed');
    const previousMask = process.umask(0o077);
    try {
      mkdirSync(target, { mode: 0o700 });
    } finally {
      process.umask(previousMask);
    }
  } catch (error) {
    if (error.code === 'EEXIST')
      fail(
        'E_OUTPUT_EXISTS',
        'output',
        null,
        'Another invocation owns this output. Preserve it and select a new path.',
      );
    fail(
      'E_OUTPUT_WRITE',
      'output',
      null,
      'Output could not be created. Restore writable storage and retry with a new path.',
    );
  }
  let directoryStat;
  const created = [];
  try {
    directoryStat = lstatSync(target);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink())
      throw new Error('Output changed');
    for (const [name, bytes] of [
      ['result.json', result],
      ['report.md', report],
    ]) {
      const path = join(target, name);
      const descriptor = openSync(
        path,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      const owned = { path, stat: null };
      created.push(owned);
      try {
        owned.stat = fstatSync(descriptor);
        if (process.platform !== 'win32') fchmodSync(descriptor, 0o600);
        writeFileSync(descriptor, bytes);
      } finally {
        closeSync(descriptor);
      }
    }
  } catch {
    const removed = directoryStat && cleanup(target, directoryStat, created);
    fail(
      'E_OUTPUT_WRITE',
      'output',
      null,
      removed
        ? 'Writing failed; this invocation removed its incomplete output. Restore writable storage and use a new path.'
        : 'Writing failed; the selected output is incomplete and could not be safely removed. Preserve it for inspection and use a new path.',
    );
  }
}
