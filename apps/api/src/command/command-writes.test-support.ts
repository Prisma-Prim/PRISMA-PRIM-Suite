import type { Pool } from 'pg';
import type { CommandAttempt } from './versioned-command-protocol.js';

/**
 * Every row of each named table in a stable order, so a protocol scenario
 * compares a command's durable traces whole before and after an attempt.
 * Table names are fixed test literals, never request input.
 */
export async function tableRows(
  pool: Pick<Pool, 'query'>,
  tables: readonly string[],
): Promise<Record<string, unknown>> {
  const rows: Record<string, unknown> = {};
  for (const table of tables)
    rows[table] = (
      await pool.query<{ rows: unknown }>(
        `SELECT coalesce(json_agg(r ORDER BY r::text), '[]'::json) AS rows FROM ${table} r`,
      )
    ).rows[0]?.rows;
  return rows;
}

/** A public response as the protocol scenarios observe it. */
export async function commandAttempt(
  response: Promise<Response>,
): Promise<CommandAttempt> {
  const settled = await response;
  const body: unknown = await settled.json();
  return { status: settled.status, body };
}
