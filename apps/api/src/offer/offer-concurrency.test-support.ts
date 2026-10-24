import { setImmediate } from 'node:timers/promises';
import type { Pool } from 'pg';
export async function effects(pool: Pool) {
  const result = await pool.query<{
    offers: number;
    versions: number;
    commands: number;
    runs: number;
    decisions: number;
    transmissions: number;
    responses: number;
    events: number;
    references: unknown;
    heads: unknown;
    clientVersions: unknown;
  }>(`SELECT
    (SELECT count(*)::int FROM offers) AS offers, (SELECT count(*)::int FROM offer_versions) AS versions,
    (SELECT count(*)::int FROM offer_quality_runs) AS runs, (SELECT count(*)::int FROM offer_decisions) AS decisions,
    (SELECT count(*)::int FROM offer_transmissions) AS transmissions, (SELECT count(*)::int FROM offer_client_responses) AS responses,
    (SELECT count(*)::int FROM offer_commands) AS commands, (SELECT count(*)::int FROM offer_events) AS events,
    (SELECT jsonb_agg(to_jsonb(c) ORDER BY company_id) FROM offer_reference_counters c) AS references,
    (SELECT jsonb_agg(jsonb_build_array(id,revision) ORDER BY id) FROM offers) AS heads,
    (SELECT jsonb_agg(jsonb_build_array(id,version) ORDER BY id) FROM client_accounts) AS "clientVersions"`);
  const row = result.rows[0];
  if (!row) throw new Error('Missing effect counters.');
  return row;
}
export async function backendPid(client: {
  query: Pool['query'];
}): Promise<number> {
  const result = await client.query<{ pid: number }>(
    'SELECT pg_backend_pid() AS pid',
  );
  const pid = result.rows[0]?.pid;
  if (!pid) throw new Error('Missing barrier pid.');
  return pid;
}
export async function waitForBlocked(pool: Pool, pid: number, count = 1) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ count: number }>(
      `WITH RECURSIVE waiting AS (
      SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
    ), chain AS (
      SELECT pid FROM waiting WHERE $1 = ANY(blockers)
      UNION SELECT w.pid FROM waiting w JOIN chain c ON c.pid = ANY(w.blockers)
    ) SELECT count(*)::int AS count FROM chain`,
      [pid],
    );
    if ((result.rows[0]?.count ?? 0) >= count) return;
    await setImmediate();
  }
  throw new Error(
    `Expected ${count} requests at the deterministic lock barrier.`,
  );
}
