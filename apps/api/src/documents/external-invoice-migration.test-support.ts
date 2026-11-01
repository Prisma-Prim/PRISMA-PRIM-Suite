import { createHash } from 'node:crypto';
import type { Pool } from 'pg';

/** Closed, checksum-bound synthetic fixture readers; no business data is inferred. */
export function fixtureObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an external-invoice predecessor fixture object.');
  return Object.fromEntries(Object.entries(value));
}

export function fixtureObjects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value))
    throw new Error('Expected external-invoice predecessor fixture objects.');
  return value.map(fixtureObject);
}

export function fixtureString(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected an external-invoice predecessor fixture string.');
  return value;
}

export function fixtureHeaders(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fixtureObject(value)).map(([key, value]) => [
      key,
      fixtureString(value),
    ]),
  );
}

export function fixtureHash(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Each complete JSONB row and ordering matches the immutable native producer. */
export async function predecessorSnapshot(pool: Pool, tables: string[]) {
  const result: Record<string, unknown> = {};
  for (const table of tables) {
    if (!/^[a-z_]+$/u.test(table))
      throw new Error('Invalid predecessor table identifier.');
    result[table] = (
      await pool.query<{ row: unknown }>(
        `SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`,
      )
    ).rows;
  }
  return result;
}
