#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readlink,
  readFile,
  rm,
  rmdir,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { gunzipSync, gzipSync } from 'node:zlib';

const FORMAT = 'prisma-prim-codex-handoff/v1';
const FENCE = 'prisma-prim-codex-handoff-v1';
const MAX_BUNDLE_CHARACTERS = 60_000;
const MAX_BUNDLE_DOCUMENT_CHARACTERS = 65_536;
const MAX_DECODED_PAYLOAD_BYTES = 16 * 1024 * 1024;
const allowedBlobModes = new Set(['100644', '100755', '120000']);
const allowedCheckStatuses = new Set(['passed', 'failed', 'skipped']);

function fail(message) {
  throw new Error(message);
}

function runGit(repository, args, options = {}) {
  return execFileSync('git', args, {
    cwd: repository,
    encoding: options.encoding ?? 'utf8',
    env: options.env ? { ...process.env, ...options.env } : process.env,
    input: options.input,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function gitText(repository, ...args) {
  return runGit(repository, args).trim();
}

function parseArguments(argv) {
  const [command, ...tokens] = argv;
  if (!new Set(['export', 'extract', 'inspect', 'materialize']).has(command)) {
    fail(
      'Usage: node scripts/codex-cloud-handoff.mjs <export|extract|inspect|materialize> [options]',
    );
  }

  const options = new Map();
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index];
    const value = tokens[index + 1];
    if (
      !key?.startsWith('--') ||
      value === undefined ||
      value.startsWith('--')
    ) {
      fail(`Invalid option near ${key ?? '<end>'}.`);
    }
    if (options.has(key)) fail(`Duplicate option ${key}.`);
    options.set(key, value);
  }

  return { command, options };
}

function requireOption(options, name) {
  const value = options.get(name);
  if (!value) fail(`Missing required option ${name}.`);
  return value;
}

function assertOnlyOptions(options, allowed) {
  for (const key of options.keys()) {
    if (!allowed.has(key)) fail(`Unknown option ${key}.`);
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
}

function assertAllowedKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} contains unsupported field ${key}.`);
  }
}

function assertBoundedString(value, label, maximum) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum
  ) {
    fail(
      `${label} must be a non-empty string of at most ${maximum} characters.`,
    );
  }
}

function assertSafePath(path) {
  assertBoundedString(path, 'Changed path', 4_096);
  const parts = path.split('/');
  if (
    isAbsolute(path) ||
    path.includes('\\') ||
    path.includes('\0') ||
    posix.normalize(path) !== path ||
    parts.some(
      (part) => part === '..' || part === '.' || part.toLowerCase() === '.git',
    )
  ) {
    fail(`Unsafe changed path: ${JSON.stringify(path)}.`);
  }
}

function assertSanitized(value, label) {
  const secretPatterns = [
    /:\/\/[^/\s:]+:[^@\s]+@/u,
    /\b(?:password|secret|token|api[_-]?key)\s*[=:]\s*\S+/iu,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u,
    /\bbearer\s+[A-Za-z0-9._~+/=-]{16,}\b/iu,
    /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  ];
  if (secretPatterns.some((pattern) => pattern.test(value))) {
    fail(`${label} appears to contain a credential or secret.`);
  }
}

function validateVerification(verification) {
  assertPlainObject(verification, 'Verification manifest');
  assertAllowedKeys(
    verification,
    new Set(['environment', 'checks']),
    'Verification manifest',
  );
  assertPlainObject(verification.environment, 'Verification environment');
  assertAllowedKeys(
    verification.environment,
    new Set(['harness', 'nodeVersion', 'pnpmVersion', 'postgresVersion']),
    'Verification environment',
  );
  for (const [key, value] of Object.entries(verification.environment)) {
    assertBoundedString(value, `Verification environment ${key}`, 120);
    assertSanitized(value, `Verification environment ${key}`);
  }

  if (
    !Array.isArray(verification.checks) ||
    verification.checks.length === 0 ||
    verification.checks.length > 100
  ) {
    fail('Verification checks must contain between 1 and 100 entries.');
  }
  for (const [index, check] of verification.checks.entries()) {
    assertPlainObject(check, `Verification check ${index}`);
    assertAllowedKeys(
      check,
      new Set(['command', 'status', 'summary']),
      `Verification check ${index}`,
    );
    assertBoundedString(
      check.command,
      `Verification check ${index} command`,
      500,
    );
    assertBoundedString(check.status, `Verification check ${index} status`, 20);
    assertBoundedString(
      check.summary,
      `Verification check ${index} summary`,
      1_000,
    );
    if (!allowedCheckStatuses.has(check.status)) {
      fail(
        `Verification check ${index} has unsupported status ${check.status}.`,
      );
    }
    assertSanitized(check.command, `Verification check ${index} command`);
    assertSanitized(check.summary, `Verification check ${index} summary`);
  }
}

function gitObjectDigest(objectFormat, type, content) {
  const header = Buffer.from(`${type} ${content.length}\0`, 'utf8');
  return createHash(objectFormat).update(header).update(content).digest('hex');
}

function validatePayload(payload) {
  assertPlainObject(payload, 'Handoff payload');
  assertAllowedKeys(
    payload,
    new Set([
      'format',
      'objectFormat',
      'base',
      'source',
      'entries',
      'verification',
    ]),
    'Handoff payload',
  );
  if (payload.format !== FORMAT)
    fail(`Unsupported handoff format ${payload.format}.`);
  if (!new Set(['sha1', 'sha256']).has(payload.objectFormat)) {
    fail(`Unsupported Git object format ${payload.objectFormat}.`);
  }

  const shaLength = payload.objectFormat === 'sha1' ? 40 : 64;
  const assertSha = (value, label) => {
    if (
      typeof value !== 'string' ||
      !new RegExp(`^[0-9a-f]{${shaLength}}$`, 'u').test(value)
    ) {
      fail(`${label} is not a valid ${payload.objectFormat} object ID.`);
    }
  };

  for (const [label, value] of [
    ['Base', payload.base],
    ['Source', payload.source],
  ]) {
    assertPlainObject(value, `${label} identity`);
  }
  assertAllowedKeys(
    payload.base,
    new Set(['commitSha', 'treeSha']),
    'Base identity',
  );
  assertAllowedKeys(
    payload.source,
    new Set(['commitSha', 'treeSha', 'commitMessage']),
    'Source identity',
  );
  assertSha(payload.base.commitSha, 'Base commit SHA');
  assertSha(payload.base.treeSha, 'Base tree SHA');
  assertSha(payload.source.commitSha, 'Source commit SHA');
  assertSha(payload.source.treeSha, 'Source tree SHA');
  assertBoundedString(
    payload.source.commitMessage,
    'Source commit message',
    10_000,
  );
  assertSanitized(payload.source.commitMessage, 'Source commit message');

  if (!Array.isArray(payload.entries) || payload.entries.length === 0) {
    fail('Handoff entries must contain at least one changed path.');
  }
  const seenPaths = new Set();
  let previousPath = '';
  for (const [index, entry] of payload.entries.entries()) {
    assertPlainObject(entry, `Handoff entry ${index}`);
    assertSafePath(entry.path);
    if (seenPaths.has(entry.path))
      fail(`Duplicate changed path ${entry.path}.`);
    if (previousPath && previousPath > entry.path) {
      fail('Handoff entries must be sorted by path.');
    }
    seenPaths.add(entry.path);
    previousPath = entry.path;

    if (entry.deleted === true) {
      assertAllowedKeys(
        entry,
        new Set(['path', 'deleted', 'mode', 'type', 'blobSha']),
        `Handoff entry ${index}`,
      );
      if (!allowedBlobModes.has(entry.mode) || entry.type !== 'blob') {
        fail(`Deleted path ${entry.path} is not a supported Git blob.`);
      }
      assertSha(entry.blobSha, `Base blob SHA for ${entry.path}`);
      continue;
    }

    assertAllowedKeys(
      entry,
      new Set(['path', 'mode', 'type', 'blobSha', 'contentBase64']),
      `Handoff entry ${index}`,
    );
    if (!allowedBlobModes.has(entry.mode) || entry.type !== 'blob') {
      fail(`Handoff entry ${entry.path} is not a supported Git blob.`);
    }
    assertSha(entry.blobSha, `Blob SHA for ${entry.path}`);
    assertBoundedString(
      entry.contentBase64,
      `Blob content for ${entry.path}`,
      16_000_000,
    );
    const content = Buffer.from(entry.contentBase64, 'base64');
    if (content.toString('base64') !== entry.contentBase64) {
      fail(`Blob content for ${entry.path} is not canonical base64.`);
    }
    const actualBlobSha = gitObjectDigest(
      payload.objectFormat,
      'blob',
      content,
    );
    if (actualBlobSha !== entry.blobSha) {
      fail(`Blob identity mismatch for ${entry.path}.`);
    }
  }

  validateVerification(payload.verification);
  return payload;
}

function findTreeEntry(repository, treeish, path) {
  const output = runGit(repository, ['ls-tree', '-z', treeish, '--', path], {
    encoding: 'buffer',
  }).toString('utf8');
  if (output === '') return null;
  const match = output.match(/^([0-7]{6}) (\w+) ([0-9a-f]+)\t([^\0]+)\0$/u);
  if (!match || match[4] !== path) {
    fail(`Unable to resolve Git tree entry ${path}.`);
  }
  const [, mode, type, objectSha] = match;
  return { mode, type, objectSha };
}

function resolveTreeEntry(repository, treeish, path) {
  const entry = findTreeEntry(repository, treeish, path);
  if (!entry) fail(`Unable to resolve Git tree entry ${path}.`);
  return entry;
}

function changedEntries(repository, baseTreeish, sourceTreeish) {
  const output = runGit(
    repository,
    ['diff', '--name-status', '--no-renames', '-z', baseTreeish, sourceTreeish],
    { encoding: 'buffer' },
  );
  const fields = output.toString('utf8').split('\0');
  if (fields.at(-1) === '') fields.pop();
  if (fields.length % 2 !== 0)
    fail('Git returned an invalid changed-path list.');

  const entries = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const path = fields[index + 1];
    assertSafePath(path);
    if (status === 'D') {
      const {
        mode,
        type,
        objectSha: blobSha,
      } = resolveTreeEntry(repository, baseTreeish, path);
      if (!allowedBlobModes.has(mode) || type !== 'blob') {
        fail(`Deleted path ${path} is not a supported Git blob.`);
      }
      entries.push({ path, deleted: true, mode, type, blobSha });
      continue;
    }
    if (!new Set(['A', 'M', 'T']).has(status)) {
      fail(`Unsupported Git change status ${status} for ${path}.`);
    }

    const {
      mode,
      type,
      objectSha: blobSha,
    } = resolveTreeEntry(repository, sourceTreeish, path);
    if (!allowedBlobModes.has(mode) || type !== 'blob') {
      fail(`Changed path ${path} is not a supported Git blob.`);
    }
    const content = runGit(repository, ['cat-file', 'blob', blobSha], {
      encoding: 'buffer',
    });
    entries.push({
      path,
      mode,
      type,
      blobSha,
      contentBase64: content.toString('base64'),
    });
  }

  return entries.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
}

function encodeBundle(payload) {
  const serialized = Buffer.from(JSON.stringify(payload), 'utf8');
  if (serialized.length > MAX_DECODED_PAYLOAD_BYTES) {
    fail(
      `Handoff payload exceeds the ${MAX_DECODED_PAYLOAD_BYTES}-byte decoded size limit.`,
    );
  }
  const compressed = gzipSync(serialized, { level: 9 });
  const digest = createHash('sha256').update(compressed).digest('hex');
  const lines = compressed.toString('base64').match(/.{1,120}/gu) ?? [];
  const bundle = `\`\`\`${FENCE}\nsha256=${digest}\n${lines.join('\n')}\n\`\`\``;
  if (bundle.length > MAX_BUNDLE_CHARACTERS) {
    fail(
      `Encoded handoff is ${bundle.length} characters; the issue-comment transport limit is ${MAX_BUNDLE_CHARACTERS}. Split the implementation into a narrower issue or use native pull-request publication.`,
    );
  }
  return bundle;
}

function decodeBundle(document) {
  if (document.length > MAX_BUNDLE_DOCUMENT_CHARACTERS) {
    fail(
      `Handoff document exceeds the ${MAX_BUNDLE_DOCUMENT_CHARACTERS}-character transport limit.`,
    );
  }
  const openingMarker = `\`\`\`${FENCE}\n`;
  const openingIndex = document.indexOf(openingMarker);
  const closingIndex = document.indexOf(
    '\n```',
    openingIndex + openingMarker.length,
  );
  if (openingIndex < 0 || closingIndex < 0) {
    fail('No complete prisma-prim-codex-handoff-v1 bundle was found.');
  }
  const lines = document
    .slice(openingIndex + openingMarker.length, closingIndex)
    .split(/\r?\n/u);
  const digestLine = lines.shift();
  if (!digestLine?.match(/^sha256=[0-9a-f]{64}$/u)) {
    fail('Handoff bundle is missing its SHA-256 digest.');
  }
  const expectedDigest = digestLine.slice('sha256='.length);
  const encoded = lines.join('');
  if (!encoded.match(/^[A-Za-z0-9+/]+={0,2}$/u)) {
    fail('Handoff payload is not canonical base64.');
  }
  const compressed = Buffer.from(encoded.replaceAll(/\s/gu, ''), 'base64');
  const actualDigest = createHash('sha256').update(compressed).digest('hex');
  if (actualDigest !== expectedDigest) fail('Handoff bundle SHA-256 mismatch.');

  let serialized;
  try {
    serialized = gunzipSync(compressed, {
      maxOutputLength: MAX_DECODED_PAYLOAD_BYTES,
    });
  } catch (error) {
    fail(
      `Handoff payload cannot be decoded within the ${MAX_DECODED_PAYLOAD_BYTES}-byte decoded size limit: ${error.message}`,
    );
  }

  let payload;
  try {
    payload = JSON.parse(serialized.toString('utf8'));
  } catch (error) {
    fail(`Handoff payload is not valid JSON: ${error.message}`);
  }
  return validatePayload(payload);
}

function inspection(payload) {
  return {
    format: payload.format,
    baseCommitSha: payload.base.commitSha,
    baseTreeSha: payload.base.treeSha,
    sourceCommitSha: payload.source.commitSha,
    sourceTreeSha: payload.source.treeSha,
    changedPaths: payload.entries.map(({ path }) => path),
    verification: payload.verification,
  };
}

async function readBundle(path) {
  return decodeBundle(await readFile(resolve(path), 'utf8'));
}

function assertExpectedBase(payload, options) {
  const expectedBase = options.get('--expected-base');
  if (expectedBase && expectedBase !== payload.base.commitSha) {
    fail(
      `Stale base: handoff expects ${payload.base.commitSha}, target branch is ${expectedBase}.`,
    );
  }
}

async function verifyFinalTree(repository, payload) {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), 'prisma-prim-handoff-index-'),
  );
  const indexPath = join(temporaryDirectory, 'index');
  const environment = { GIT_INDEX_FILE: indexPath };
  try {
    runGit(repository, ['read-tree', payload.base.treeSha], {
      env: environment,
    });
    for (const entry of payload.entries) {
      if (entry.deleted !== true) continue;
      runGit(repository, ['update-index', '--force-remove', '--', entry.path], {
        env: environment,
      });
    }
    for (const entry of payload.entries) {
      if (entry.deleted === true) continue;
      const content = Buffer.from(entry.contentBase64, 'base64');
      const storedBlobSha = runGit(
        repository,
        ['hash-object', '-w', '--stdin'],
        {
          env: environment,
          input: content,
        },
      ).trim();
      if (storedBlobSha !== entry.blobSha) {
        fail(`Git stored an unexpected blob identity for ${entry.path}.`);
      }
      runGit(
        repository,
        [
          'update-index',
          '--add',
          '--cacheinfo',
          `${entry.mode},${entry.blobSha},${entry.path}`,
        ],
        { env: environment },
      );
    }
    const treeSha = runGit(repository, ['write-tree'], {
      env: environment,
    }).trim();
    if (treeSha !== payload.source.treeSha) {
      fail(
        `Final tree mismatch: bundle declares ${payload.source.treeSha}, reconstructed ${treeSha}.`,
      );
    }
    const actualEntries = changedEntries(
      repository,
      payload.base.treeSha,
      treeSha,
    );
    if (!isDeepStrictEqual(actualEntries, payload.entries)) {
      fail('Handoff entries do not match the exact base-to-source tree delta.');
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function ensureSafeParent(repository, path, createMissing = true) {
  const parent = dirname(path);
  if (parent === '.') return;
  let current = repository;
  for (const part of parent.split('/')) {
    current = join(current, part);
    try {
      const details = await lstat(current);
      if (!details.isDirectory() || details.isSymbolicLink()) {
        fail(`Changed path ${path} traverses a non-directory parent.`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!createMissing) {
        fail(`Changed path ${path} has a missing parent.`);
      }
      await mkdir(current);
    }
  }
}

async function assertDirectoryContainsOnlyDeletions(
  repository,
  directory,
  deletionPaths,
) {
  for (const child of await readdir(directory, { withFileTypes: true })) {
    const childPath = join(directory, child.name);
    if (child.isDirectory() && !child.isSymbolicLink()) {
      await assertDirectoryContainsOnlyDeletions(
        repository,
        childPath,
        deletionPaths,
      );
      continue;
    }
    const repositoryPath = relative(repository, childPath);
    if (!deletionPaths.has(repositoryPath)) {
      fail(
        `Refusing to replace a directory containing untracked or ignored path ${repositoryPath}.`,
      );
    }
  }
}

async function parentWillBeReplaced(repository, path, deletionPaths) {
  const parent = dirname(path);
  if (parent === '.') return false;
  let current = repository;
  for (const part of parent.split('/')) {
    current = join(current, part);
    const repositoryPath = relative(repository, current);
    if (deletionPaths.has(repositoryPath)) return true;
    try {
      const details = await lstat(current);
      if (!details.isDirectory() || details.isSymbolicLink()) {
        fail(`Changed path ${path} traverses a non-directory parent.`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') return true;
      throw error;
    }
  }
  return false;
}

async function removeEmptyDirectoryTree(directory, changedPath) {
  for (const child of await readdir(directory, { withFileTypes: true })) {
    if (!child.isDirectory() || child.isSymbolicLink()) {
      fail(`Changed path ${changedPath} would overwrite an unexpected file.`);
    }
    await removeEmptyDirectoryTree(join(directory, child.name), changedPath);
  }
  await rmdir(directory);
}

async function removeBlobDestination(destination, changedPath) {
  let details;
  try {
    details = await lstat(destination);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (details.isDirectory() && !details.isSymbolicLink()) {
    await removeEmptyDirectoryTree(destination, changedPath);
    return;
  }
  await rm(destination, { force: true });
}

async function verifyMaterializedBlob(destination, entry, objectFormat) {
  const content =
    entry.mode === '120000'
      ? await readlink(destination, { encoding: 'buffer' })
      : await readFile(destination);
  const actualBlobSha = gitObjectDigest(objectFormat, 'blob', content);
  if (actualBlobSha !== entry.blobSha) {
    fail(`Materialized blob identity mismatch for ${entry.path}.`);
  }
}

async function materialize(repository, payload) {
  const root = gitText(repository, 'rev-parse', '--show-toplevel');
  if (resolve(repository) !== resolve(root)) {
    fail('Run materialize from the repository root.');
  }
  const currentCommitSha = gitText(root, 'rev-parse', 'HEAD');
  if (currentCommitSha !== payload.base.commitSha) {
    fail(
      `Stale base: handoff expects ${payload.base.commitSha}, checkout is ${currentCommitSha}.`,
    );
  }
  const currentTreeSha = gitText(root, 'rev-parse', 'HEAD^{tree}');
  if (currentTreeSha !== payload.base.treeSha) {
    fail(
      `Base tree mismatch: handoff expects ${payload.base.treeSha}, checkout is ${currentTreeSha}.`,
    );
  }
  if (gitText(root, 'status', '--porcelain=v1', '--untracked-files=all')) {
    fail('Refusing to materialize into a dirty checkout.');
  }

  await verifyFinalTree(root, payload);
  const deletionPaths = new Set(
    payload.entries
      .filter(({ deleted }) => deleted === true)
      .map(({ path }) => path),
  );
  for (const entry of payload.entries) {
    if (entry.deleted === true) {
      await ensureSafeParent(root, entry.path, false);
      continue;
    }
    if (
      entry.mode === '120000' &&
      Buffer.from(entry.contentBase64, 'base64').includes(0)
    ) {
      fail(`Symlink target for ${entry.path} contains a NUL byte.`);
    }
    if (await parentWillBeReplaced(root, entry.path, deletionPaths)) continue;
    const destination = resolve(root, entry.path);
    try {
      const details = await lstat(destination);
      if (!findTreeEntry(root, payload.base.treeSha, entry.path)) {
        fail(`Refusing to overwrite untracked or ignored path ${entry.path}.`);
      }
      if (details.isDirectory() && !details.isSymbolicLink()) {
        await assertDirectoryContainsOnlyDeletions(
          root,
          destination,
          deletionPaths,
        );
      }
    } catch (error) {
      if (!new Set(['ENOENT', 'ENOTDIR']).has(error.code)) throw error;
    }
  }
  for (const entry of payload.entries) {
    if (entry.deleted !== true) continue;
    const destination = resolve(root, entry.path);
    if (!destination.startsWith(`${resolve(root)}/`)) {
      fail(`Changed path ${entry.path} escapes the repository.`);
    }
    await rm(destination, { force: true });
  }

  for (const entry of payload.entries) {
    if (entry.deleted === true) continue;
    const destination = resolve(root, entry.path);
    if (!destination.startsWith(`${resolve(root)}/`)) {
      fail(`Changed path ${entry.path} escapes the repository.`);
    }

    await ensureSafeParent(root, entry.path);
    await removeBlobDestination(destination, entry.path);
    const content = Buffer.from(entry.contentBase64, 'base64');
    if (entry.mode === '120000') {
      await symlink(content, destination);
    } else {
      await writeFile(destination, content);
      await chmod(destination, entry.mode === '100755' ? 0o755 : 0o644);
    }
    await verifyMaterializedBlob(destination, entry, payload.objectFormat);
  }

  for (const entry of payload.entries) {
    if (entry.deleted !== true) continue;
    runGit(root, ['update-index', '--force-remove', '--', entry.path]);
  }
  for (const entry of payload.entries) {
    if (entry.deleted === true) continue;
    runGit(root, [
      'update-index',
      '--add',
      '--cacheinfo',
      `${entry.mode},${entry.blobSha},${entry.path}`,
    ]);
  }
  const materializedTreeSha = gitText(root, 'write-tree');
  if (materializedTreeSha !== payload.source.treeSha) {
    fail(
      `Materialized tree mismatch: expected ${payload.source.treeSha}, received ${materializedTreeSha}.`,
    );
  }
  return inspection(payload);
}

async function exportHandoff(options) {
  assertOnlyOptions(options, new Set(['--base', '--verification']));
  const baseReference = requireOption(options, '--base');
  const verificationPath = requireOption(options, '--verification');
  const repository = gitText(process.cwd(), 'rev-parse', '--show-toplevel');
  if (
    gitText(repository, 'status', '--porcelain=v1', '--untracked-files=all')
  ) {
    fail('Refusing to export a handoff from a dirty checkout.');
  }
  const baseCommitSha = gitText(
    repository,
    'rev-parse',
    '--verify',
    `${baseReference}^{commit}`,
  );
  const sourceCommitSha = gitText(repository, 'rev-parse', 'HEAD');
  try {
    runGit(repository, [
      'merge-base',
      '--is-ancestor',
      baseCommitSha,
      sourceCommitSha,
    ]);
  } catch {
    fail(
      `Base commit ${baseCommitSha} is not an ancestor of ${sourceCommitSha}.`,
    );
  }
  const commitCount = gitText(
    repository,
    'rev-list',
    '--count',
    `${baseCommitSha}..${sourceCommitSha}`,
  );
  if (commitCount !== '1') {
    fail(
      `Handoff export requires exactly one focused commit after the base; found ${commitCount}.`,
    );
  }

  const verification = JSON.parse(
    await readFile(resolve(verificationPath), 'utf8'),
  );
  validateVerification(verification);
  const payload = validatePayload({
    format: FORMAT,
    objectFormat: gitText(repository, 'rev-parse', '--show-object-format'),
    base: {
      commitSha: baseCommitSha,
      treeSha: gitText(repository, 'rev-parse', `${baseCommitSha}^{tree}`),
    },
    source: {
      commitSha: sourceCommitSha,
      treeSha: gitText(repository, 'rev-parse', `${sourceCommitSha}^{tree}`),
      commitMessage: runGit(repository, [
        'show',
        '-s',
        '--format=%B',
        sourceCommitSha,
      ]).trimEnd(),
    },
    entries: changedEntries(repository, baseCommitSha, sourceCommitSha),
    verification,
  });
  process.stdout.write(`${encodeBundle(payload)}\n`);
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === 'export') {
    await exportHandoff(options);
    return;
  }

  const allowedOptions =
    command === 'materialize'
      ? new Set(['--input'])
      : command === 'extract'
        ? new Set(['--input', '--expected-base', '--output'])
        : new Set(['--input', '--expected-base']);
  assertOnlyOptions(options, allowedOptions);
  const payload = await readBundle(requireOption(options, '--input'));
  if (command === 'extract') requireOption(options, '--expected-base');
  assertExpectedBase(payload, options);
  if (command === 'inspect') {
    process.stdout.write(`${JSON.stringify(inspection(payload))}\n`);
    return;
  }
  if (command === 'extract') {
    const outputPath = resolve(requireOption(options, '--output'));
    await writeFile(outputPath, `${JSON.stringify(payload)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    process.stdout.write(
      `${JSON.stringify({ ...inspection(payload), outputPath })}\n`,
    );
    return;
  }

  process.stdout.write(
    `${JSON.stringify(await materialize(process.cwd(), payload))}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
