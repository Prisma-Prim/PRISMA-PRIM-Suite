import { createHash } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { commandFingerprint } from '../command/idempotent-command.js';
import {
  FIELDS,
  type Candidate,
  type Citation,
  type Comparison,
  type EvidenceSource,
  type FieldName,
  type analyzeDossier,
} from '../dossier-analysis-engine/index.js';

type Result = ReturnType<typeof analyzeDossier>;
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}
function field(value: unknown): value is FieldName {
  return FIELDS.some((item) => item === value);
}
function natural(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function citation(
  value: unknown,
  sources: readonly EvidenceSource[],
  integrity: Map<string, string>,
): value is Citation {
  if (
    !object(value) ||
    !exact(value, [
      'sourceId',
      'documentVersionId',
      'locator',
      'start',
      'end',
      'quote',
      'passageSha256',
    ]) ||
    typeof value.sourceId !== 'string' ||
    typeof value.documentVersionId !== 'string' ||
    typeof value.locator !== 'string' ||
    !natural(value.start) ||
    !natural(value.end) ||
    value.end <= value.start ||
    typeof value.quote !== 'string' ||
    typeof value.passageSha256 !== 'string'
  )
    return false;
  const source = sources.find(
    (item) =>
      item.id === value.sourceId &&
      item.documentVersionId === value.documentVersionId,
  );
  const passage = source?.extraction.passages.find(
    (item) => item.locator === value.locator,
  );
  return (
    !!source &&
    source.extraction.state !== 'failed' &&
    source.extraction.state !== 'unreadable' &&
    !!passage &&
    passage.sha256 === value.passageSha256 &&
    integrity.get(JSON.stringify([source.id, passage.locator])) ===
      passage.sha256 &&
    value.end <= passage.text.length &&
    passage.text.slice(value.start, value.end) === value.quote
  );
}
function candidate(
  value: unknown,
  sources: readonly EvidenceSource[],
  integrity: Map<string, string>,
): value is Candidate {
  return (
    object(value) &&
    exact(value, [
      'field',
      'value',
      'normalized',
      'normalizationState',
      'event',
      'citation',
    ]) &&
    field(value.field) &&
    typeof value.value === 'string' &&
    value.value.length > 0 &&
    (value.normalized === null || typeof value.normalized === 'string') &&
    (value.normalizationState === 'normalized' ||
      value.normalizationState === 'ambiguous' ||
      value.normalizationState === 'invalid' ||
      value.normalizationState === 'unsupported') &&
    ((value.normalizationState === 'normalized' &&
      typeof value.normalized === 'string') ||
      (value.normalizationState !== 'normalized' &&
        value.normalized === null)) &&
    (value.event === null || typeof value.event === 'string') &&
    citation(value.citation, sources, integrity) &&
    value.citation.quote === value.value
  );
}
function comparison(
  value: unknown,
  sources: readonly EvidenceSource[],
  integrity: Map<string, string>,
): value is Comparison {
  return (
    object(value) &&
    exact(value, ['field', 'left', 'right', 'outcome', 'basis']) &&
    field(value.field) &&
    candidate(value.left, sources, integrity) &&
    candidate(value.right, sources, integrity) &&
    value.left.field === value.field &&
    value.right.field === value.field &&
    (value.outcome === 'match' ||
      value.outcome === 'conflict' ||
      value.outcome === 'clarify') &&
    value.left.citation.sourceId !== value.right.citation.sourceId &&
    ((value.basis === 'literal' &&
      value.left.value === value.right.value &&
      value.outcome === 'match') ||
      (value.basis === 'prose' &&
        value.field === 'scope' &&
        value.left.value !== value.right.value &&
        value.outcome === 'clarify') ||
      (value.basis === 'normalized' &&
        value.left.value !== value.right.value &&
        value.left.normalized !== null &&
        value.right.normalized !== null &&
        value.outcome ===
          (value.left.normalized === value.right.normalized
            ? 'match'
            : 'conflict')))
  );
}
/** Validate the stored v1 format without re-running today's comparison rules. */
export function readResult(
  value: unknown,
  input: {
    snapshotHash: string;
    pipelineVersion: string;
    sources: readonly EvidenceSource[];
    missingDocuments: readonly { documentId: string; title: string }[];
  },
): Result {
  const integrity = new Map<string, string>();
  for (const source of input.sources)
    for (const passage of source.extraction.passages) {
      const key = JSON.stringify([source.id, passage.locator]);
      if (integrity.has(key)) throw unavailable();
      integrity.set(
        key,
        createHash('sha256').update(passage.text).digest('hex'),
      );
    }
  if (
    !object(value) ||
    !exact(value, [
      'snapshotHash',
      'pipelineVersion',
      'candidates',
      'comparisons',
      'coverage',
    ]) ||
    value.snapshotHash !== input.snapshotHash ||
    value.pipelineVersion !== input.pipelineVersion ||
    !Array.isArray(value.candidates) ||
    value.candidates.length > 500 ||
    !value.candidates.every((item) =>
      candidate(item, input.sources, integrity),
    ) ||
    !Array.isArray(value.comparisons) ||
    value.comparisons.length > 5000 ||
    !value.comparisons.every((item) =>
      comparison(item, input.sources, integrity),
    ) ||
    !object(value.coverage)
  )
    throw unavailable();
  const candidates = value.candidates.filter((item) =>
    candidate(item, input.sources, integrity),
  );
  const comparisons = value.comparisons.filter((item) =>
    comparison(item, input.sources, integrity),
  );
  const candidateSet = new Set(candidates.map(commandFingerprint));
  if (
    comparisons.some(
      (item) =>
        !candidateSet.has(commandFingerprint(item.left)) ||
        !candidateSet.has(commandFingerprint(item.right)),
    )
  )
    throw unavailable();
  const coverage = value.coverage;
  if (
    !exact(coverage, [
      'fields',
      'truncatedCandidates',
      'truncatedComparisons',
      'missingDocuments',
      'sources',
    ]) ||
    typeof coverage.truncatedCandidates !== 'boolean' ||
    typeof coverage.truncatedComparisons !== 'boolean' ||
    !Array.isArray(coverage.fields) ||
    coverage.fields.length !== FIELDS.length ||
    !Array.isArray(coverage.sources) ||
    coverage.sources.length !== input.sources.length ||
    commandFingerprint(coverage.missingDocuments) !==
      commandFingerprint(input.missingDocuments)
  )
    throw unavailable();
  const fields: Result['coverage']['fields'] = [];
  for (const expected of FIELDS) {
    const row = coverage.fields.find(
      (item: unknown) => object(item) && item.field === expected,
    );
    if (
      !object(row) ||
      !exact(row, ['field', 'state', 'candidates', 'comparisons']) ||
      row.field !== expected ||
      !natural(row.candidates) ||
      !natural(row.comparisons) ||
      row.candidates !==
        candidates.filter((item) => item.field === expected).length ||
      row.comparisons !==
        comparisons.filter((item) => item.field === expected).length ||
      row.state !== (row.comparisons > 0 ? 'evaluated' : 'not_evaluable')
    )
      throw unavailable();
    fields.push({
      field: expected,
      state: row.comparisons > 0 ? 'evaluated' : 'not_evaluable',
      candidates: row.candidates,
      comparisons: row.comparisons,
    });
  }
  const sourceCoverage: Result['coverage']['sources'] = [];
  for (const source of input.sources) {
    const row = coverage.sources.find(
      (item: unknown) => object(item) && item.sourceId === source.id,
    );
    const integrityFailures = source.extraction.passages.filter(
      (p) => integrity.get(JSON.stringify([source.id, p.locator])) !== p.sha256,
    ).length;
    if (
      !object(row) ||
      !exact(row, [
        'sourceId',
        'state',
        'unitsTotal',
        'unitsReadable',
        'issues',
        'integrityFailures',
      ]) ||
      row.state !== source.extraction.state ||
      row.unitsTotal !== source.extraction.unitsTotal ||
      row.unitsReadable !== source.extraction.unitsReadable ||
      row.integrityFailures !== integrityFailures ||
      commandFingerprint(row.issues) !==
        commandFingerprint(source.extraction.issues)
    )
      throw unavailable();
    sourceCoverage.push({
      sourceId: source.id,
      state: source.extraction.state,
      unitsTotal: source.extraction.unitsTotal,
      unitsReadable: source.extraction.unitsReadable,
      issues: source.extraction.issues,
      integrityFailures,
    });
  }
  return {
    snapshotHash: input.snapshotHash,
    pipelineVersion: input.pipelineVersion,
    candidates,
    comparisons,
    coverage: {
      fields,
      truncatedCandidates: coverage.truncatedCandidates,
      truncatedComparisons: coverage.truncatedComparisons,
      missingDocuments: [...input.missingDocuments],
      sources: sourceCoverage,
    },
  };
}
function unavailable() {
  return new ServiceUnavailableException('The preserved run is unavailable.');
}
