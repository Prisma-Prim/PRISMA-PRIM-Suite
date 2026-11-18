import { citation } from './analysis-response';
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid harness response');
  return Object.fromEntries(Object.entries(value));
}
export function string(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 16_384)
    throw new Error('Invalid harness response');
  return value;
}
function integer(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid harness response');
  return value;
}
export function connection(value: unknown) {
  const x = record(value);
  const state = (
    ['configuration_required', 'disconnected', 'connected'] as const
  ).find((s) => s === x.state);
  if (!state || !Array.isArray(x.models) || x.models.length > 200)
    throw new Error('Invalid connection');
  return {
    state,
    account: x.account === null ? null : string(x.account),
    models: x.models.map((v) => {
      const m = record(v);
      return { id: string(m.id), label: string(m.label) };
    }),
  };
}
export function job(value: unknown) {
  const x = record(value),
    coverage = record(x.coverage);
  const state = (
    [
      'queued',
      'running',
      'pausing',
      'paused',
      'quota',
      'reauth',
      'failed',
      'uncertain',
      'completed',
      'cancelled',
    ] as const
  ).find((s) => s === x.state);
  if (
    !state ||
    typeof x.stale !== 'boolean' ||
    typeof x.imported !== 'boolean' ||
    !Array.isArray(x.proposals) ||
    x.proposals.length > 200
  )
    throw new Error('Invalid job');
  const nextBatch = integer(x.nextBatch),
    totalBatches = integer(x.totalBatches),
    cacheHits = integer(x.cacheHits);
  if (
    nextBatch > totalBatches ||
    cacheHits > nextBatch ||
    (state === 'completed' && nextBatch !== totalBatches)
  )
    throw new Error('Invalid progress');
  return {
    id: string(x.id),
    runId: string(x.runId),
    state,
    stale: x.stale,
    imported: x.imported,
    nextBatch,
    totalBatches,
    cacheHits,
    readableUnits: integer(coverage.readableUnits),
    totalUnits: integer(coverage.totalUnits),
    incompleteSources: integer(coverage.incompleteSources),
    proposals: x.proposals.map((v) => {
      const p = record(v);
      if (
        !Array.isArray(p.citations) ||
        !p.citations.length ||
        p.citations.length > 20
      )
        throw new Error('Invalid proposal');
      return {
        field: string(p.field),
        value: string(p.value),
        rationale: string(p.rationale),
        citations: p.citations.map(citation),
      };
    }),
  };
}
