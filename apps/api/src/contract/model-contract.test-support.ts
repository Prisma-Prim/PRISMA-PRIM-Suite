import type { Pool } from 'pg';

/** Compare committed business facts, including Client reference-use fences. */
export async function modelContractEffects(pool: Pool) {
  const result = await pool.query<{
    effects: unknown;
  }>(`SELECT jsonb_build_object(
    'contracts',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM contracts t),
    'versions',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM contract_versions t),
    'counters',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY company_id,kind),'[]') FROM contract_reference_counters t),
    'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM contract_commands t),
    'events',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM contract_events t),
    'runs',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM contract_quality_runs t),
    'decisions',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM contract_decisions t),
    'clients',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM client_accounts t),
    'relationships',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM client_company_relationships t)
  ) AS effects`);
  const row = result.rows[0];
  if (!row) throw new Error('Expected exact committed effects.');
  return row.effects;
}
