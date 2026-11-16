import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { commandFingerprint } from '../command/idempotent-command.js';
import type { EvidenceSource } from '../dossier-analysis-engine/index.js';
import { snapshotIdentityHash } from './snapshot.js';
import { requireVisibleMissing } from './visible-missing.js';

export type HistoricalSource = Pick<
  EvidenceSource,
  | 'id'
  | 'documentId'
  | 'documentVersionId'
  | 'representationId'
  | 'sourceSha256'
>;
export type HistoryManifest = {
  identity: string;
  sources: HistoricalSource[];
  missingDocuments: { documentId: string; title: string }[];
};
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function source(value: unknown): value is HistoricalSource {
  return (
    object(value) &&
    typeof value.id === 'string' &&
    typeof value.documentId === 'string' &&
    typeof value.documentVersionId === 'string' &&
    (value.representationId === null ||
      typeof value.representationId === 'string') &&
    typeof value.sourceSha256 === 'string' &&
    /^[a-f0-9]{64}$/u.test(value.sourceSha256)
  );
}
export function readHistoryManifest(
  value: unknown,
  expectedHash: string,
): HistoryManifest {
  if (
    !object(value) ||
    value.format !== 'DOSSIER_ANALYSIS_SNAPSHOT/1' ||
    typeof value.identity !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value.identity) ||
    typeof value.sourceHash !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value.sourceHash) ||
    typeof value.pipelineVersion !== 'string' ||
    !value.pipelineVersion ||
    value.pipelineVersion.length > 100 ||
    typeof value.parserVersion !== 'string' ||
    !value.parserVersion ||
    value.parserVersion.length > 100 ||
    !Array.isArray(value.sources) ||
    value.sources.length < 1 ||
    value.sources.length > 25 ||
    !value.sources.every(source) ||
    !Array.isArray(value.missingDocuments) ||
    value.missingDocuments.length > 1000
  )
    throw new ServiceUnavailableException('The preserved run is unavailable.');
  const sources = value.sources.filter(source);
  const missingDocuments = value.missingDocuments.map((item: unknown) => {
    if (
      !object(item) ||
      typeof item.documentId !== 'string' ||
      typeof item.title !== 'string'
    )
      throw new ServiceUnavailableException(
        'The preserved run is unavailable.',
      );
    return { documentId: item.documentId, title: item.title };
  });
  if (
    new Set(sources.map((item) => item.id)).size !== sources.length ||
    snapshotIdentityHash({
      identity: value.identity,
      sourceHash: value.sourceHash,
      pipelineVersion: value.pipelineVersion,
      parserVersion: value.parserVersion,
      missingDocuments,
      sources,
    }) !== expectedHash
  )
    throw new ServiceUnavailableException('The preserved run is unavailable.');
  return { identity: value.identity, sources, missingDocuments };
}
type Entry = {
  id: string;
  snapshotHash: string;
  createdAt: Date;
  manifest: HistoryManifest;
};
/** Validate every returned and look-ahead run, then authorize each unique original once. */
export async function prepareHistoryPage(input: {
  rows: readonly Entry[];
  currentIdentity: string;
  visibleDocuments: readonly { documentId: string; title: string }[];
  selected: readonly HistoricalSource[];
  authorize: (sources: readonly HistoricalSource[]) => Promise<unknown>;
}) {
  const all = new Map<string, HistoricalSource>();
  const selected = new Map(input.selected.map((item) => [item.id, item]));
  for (const row of input.rows) {
    requireVisibleMissing(
      row.manifest.missingDocuments,
      input.visibleDocuments,
    );
    for (const source of row.manifest.sources) {
      const previous = all.get(source.id) ?? selected.get(source.id);
      if (
        previous &&
        commandFingerprint(previous) !== commandFingerprint(source)
      )
        throw new NotFoundException();
      if (!selected.has(source.id)) all.set(source.id, source);
    }
  }
  if (all.size) await input.authorize([...all.values()]);
  return input.rows.slice(0, 5).map((row) => ({
    id: row.id,
    snapshotHash: row.snapshotHash,
    createdAt: row.createdAt.toISOString(),
    stale: row.manifest.identity !== input.currentIdentity,
  }));
}
