import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { FIELDS } from '../dossier-analysis-engine/index.js';
import type { QualificationInput } from './index.js';

export class PrivateInputError extends Error {
  constructor() {
    super('invalid_private_input');
  }
}
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
async function boundedFile(path: string, maximum: number) {
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > maximum)
      throw new PrivateInputError();
    // A local file may grow after stat; never allocate an unbounded readFile buffer.
    const bytes = Buffer.alloc(maximum + 1);
    let used = 0;
    while (used < bytes.length) {
      const read = await file.read(bytes, used, bytes.length - used, null);
      if (!read.bytesRead) break;
      used += read.bytesRead;
    }
    if (used !== stat.size || used > maximum) throw new PrivateInputError();
    return bytes.subarray(0, used);
  } finally {
    await file.close();
  }
}

/** A flat, explicitly hashed local corpus; names/text are never returned in public results. */
export async function loadPrivateInputs(
  directory: string,
): Promise<QualificationInput[]> {
  try {
    if (!(await lstat(directory)).isDirectory()) throw new PrivateInputError();
    const manifest: unknown = JSON.parse(
      (
        await boundedFile(join(directory, 'manifest.json'), 128 * 1024)
      ).toString('utf8'),
    );
    if (
      !object(manifest) ||
      Object.keys(manifest).some(
        (key) => !['version', 'files'].includes(key),
      ) ||
      manifest.version !== 'dossier-volume-input/v1' ||
      !Array.isArray(manifest.files) ||
      manifest.files.length < 1 ||
      manifest.files.length > 200
    )
      throw new PrivateInputError();
    const seen = new Set<string>();
    const inputs: QualificationInput[] = [];
    let corpusBytes = 0;
    const files: readonly unknown[] = manifest.files;
    for (const value of files) {
      if (
        !object(value) ||
        Object.keys(value).some(
          (key) =>
            !['path', 'kind', 'language', 'sha256', 'expected'].includes(key),
        ) ||
        typeof value.path !== 'string' ||
        value.path.length > 180 ||
        value.path.startsWith('.') ||
        /[/\\]/u.test(value.path) ||
        Array.from(value.path).some(
          (character) => character.charCodeAt(0) < 32,
        ) ||
        (value.kind !== 'pdf' && value.kind !== 'docx') ||
        !value.path.endsWith(`.${value.kind}`) ||
        seen.has(value.path) ||
        (value.language !== 'ro' && value.language !== 'ru') ||
        typeof value.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(value.sha256)
      )
        throw new PrivateInputError();
      seen.add(value.path);
      const bytes = await boundedFile(
        join(directory, value.path),
        5 * 1024 * 1024,
      );
      corpusBytes += bytes.byteLength;
      if (
        corpusBytes > 64 * 1024 * 1024 ||
        createHash('sha256').update(bytes).digest('hex') !== value.sha256
      )
        throw new PrivateInputError();
      const input: QualificationInput = {
        id: String(inputs.length),
        kind: value.kind,
        language: value.language,
        bytes,
        pdfPages: null,
      };
      if (value.expected !== undefined) {
        const expected = value.expected;
        if (
          !object(expected) ||
          Object.keys(expected).some(
            (key) => !['state', 'passages', 'candidates'].includes(key),
          ) ||
          (expected.state !== 'complete' &&
            expected.state !== 'partial' &&
            expected.state !== 'failed' &&
            expected.state !== 'unreadable') ||
          !Array.isArray(expected.passages) ||
          expected.passages.length > 1000 ||
          !expected.passages.every(
            (v: unknown): v is string =>
              typeof v === 'string' && v.length <= 2 * 1024 * 1024,
          ) ||
          !Array.isArray(expected.candidates) ||
          expected.candidates.length > 500 ||
          !expected.candidates.every(
            (v: unknown): v is string =>
              typeof v === 'string' &&
              v.length <= 2100 &&
              FIELDS.some((field) => v.startsWith(`${field}:`)),
          )
        )
          throw new PrivateInputError();
        input.expected = {
          state: expected.state,
          passages: expected.passages,
          candidates: expected.candidates,
        };
      }
      inputs.push(input);
    }
    return inputs;
  } catch {
    throw new PrivateInputError();
  }
}
