import {
  accessSync,
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  writeSync,
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
  let primaryFailure = false;
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
    primaryFailure = true;
    if (error instanceof EvaluationError) throw error;
    fail(
      'E_INPUT_FILE',
      input,
      null,
      'Choose two distinct existing regular readable files without symlink components.',
    );
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        try {
          closeSync(descriptor);
        } catch {
          /* Preserve the safe diagnostic. */
        }
        if (!primaryFailure)
          fail(
            'E_INPUT_FILE',
            input,
            null,
            'Closing the captured input failed. Restore readable storage and retry with distinct regular files.',
          );
      }
    }
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
    if (path.endsWith(sep) || ['.', '..'].includes(basename(path)))
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

const writeFailure =
  'Output creation, writing, verification or closing failed; incomplete output may remain. Preserve private files for inspection and retry with a fresh path.';

function parentUnchanged(parent) {
  const current = existingPath(parent.path);
  const opened = fstatSync(parent.descriptor);
  if (
    !current.stat.isDirectory() ||
    !opened.isDirectory() ||
    !sameFile(current.stat, parent.stat) ||
    !sameFile(opened, parent.stat)
  )
    throw new Error('Parent changed');
}

function ownedUnchanged(output, owned) {
  parentUnchanged(output.parent);
  const current = existingPath(output.target).stat;
  const opened = fstatSync(owned.descriptor);
  if (
    !current.isFile() ||
    !opened.isFile() ||
    opened.nlink !== 1 ||
    !sameFile(opened, owned.stat) ||
    !sameFile(current, owned.stat) ||
    (opened.mode & 0o7777) !== 0o600
  )
    throw new Error('Owned output changed');
}

export function writeArtifacts(output, bytes) {
  const handles = [];
  let failure = false;
  let occupied = false;
  try {
    const parent = output.parent;
    const descriptor = openSync(
      parent.path,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    handles.push({ descriptor, closed: false });
    parent.descriptor = descriptor;
    parentUnchanged(parent);
    let created;
    try {
      // The returned FD is the original identity even if the pathname is
      // replaced before the first fstat. Never reopen or adopt the occupant.
      created = openSync(output.target, 'wx+', 0o600);
    } catch (error) {
      occupied = error.code === 'EEXIST';
      throw error;
    }
    const owned = { descriptor: created, closed: false };
    handles.push(owned);
    owned.stat = fstatSync(created);
    // Check initial privacy BEFORE any chmod. Restrictive umasks may remove
    // owner permissions; they may never grant permissions outside 0600.
    if (
      !owned.stat.isFile() ||
      owned.stat.nlink !== 1 ||
      (owned.stat.mode & 0o7777 & ~0o600) !== 0
    )
      throw new Error('Initial privacy unavailable');
    fchmodSync(created, 0o600);
    ownedUnchanged(output, owned);
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(
        created,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (
        !Number.isInteger(count) ||
        count <= 0 ||
        count > bytes.length - offset
      )
        throw new Error('Incomplete write');
      offset += count;
    }
    ownedUnchanged(output, owned);
    if (fstatSync(created).size !== bytes.length)
      throw new Error('Wrong length');
    const readback = Buffer.alloc(bytes.length);
    offset = 0;
    while (offset < readback.length) {
      const count = readSync(
        created,
        readback,
        offset,
        readback.length - offset,
        offset,
      );
      if (
        !Number.isInteger(count) ||
        count <= 0 ||
        count > readback.length - offset
      )
        throw new Error('Incomplete readback');
      offset += count;
    }
    if (!readback.equals(bytes) || fstatSync(created).size !== bytes.length)
      throw new Error('Readback mismatch');
    ownedUnchanged(output, owned);
    // These are observed final checks, not atomic content publication, a
    // same-UID adversary guarantee, post-check identity or crash durability.
  } catch {
    failure = true;
  } finally {
    // No namespace cleanup. Close every captured FD before any receipt,
    // including when another close fails. Retry a failed close once without
    // converting that close failure into success or emitting raw OS errors.
    for (const owned of handles.reverse()) {
      try {
        closeSync(owned.descriptor);
        owned.closed = true;
      } catch {
        failure = true;
      }
    }
    for (const owned of handles.filter((handle) => !handle.closed)) {
      try {
        closeSync(owned.descriptor);
      } catch {
        /* Preserve primary failure. */
      }
    }
  }
  if (failure)
    fail(
      occupied ? 'E_OUTPUT_EXISTS' : 'E_OUTPUT_WRITE',
      'output',
      null,
      writeFailure,
    );
}
