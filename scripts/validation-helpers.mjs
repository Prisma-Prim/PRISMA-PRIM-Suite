import { createHash } from 'node:crypto';

export function canonicalRecordsHash(records) {
  return createHash('sha256')
    .update(`${records.map((record) => JSON.stringify(record)).join('\n')}\n`)
    .digest('hex');
}

export function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

export function normalizeLineEndings(contents) {
  return contents.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}
