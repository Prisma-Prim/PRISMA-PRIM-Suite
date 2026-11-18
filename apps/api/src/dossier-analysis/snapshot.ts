import { commandFingerprint } from '../command/idempotent-command.js';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  dossierSnapshotHash,
  type EvidenceSource,
} from '../dossier-analysis-engine/index.js';
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function source(value: unknown): value is EvidenceSource {
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    typeof value.documentId !== 'string' ||
    typeof value.documentVersionId !== 'string' ||
    !(
      value.representationId === null ||
      typeof value.representationId === 'string'
    ) ||
    typeof value.sourceSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value.sourceSha256) ||
    typeof value.fileName !== 'string' ||
    typeof value.documentTitle !== 'string' ||
    typeof value.documentType !== 'string' ||
    typeof value.versionNumber !== 'number' ||
    !Number.isSafeInteger(value.versionNumber) ||
    (value.versionStatus !== 'draft' &&
      value.versionStatus !== 'official' &&
      value.versionStatus !== 'superseded') ||
    (value.language !== 'ro' &&
      value.language !== 'ru' &&
      value.language !== 'fr' &&
      value.language !== 'en') ||
    !object(value.extraction)
  )
    return false;
  const e = value.extraction;
  return (
    (e.state === 'complete' ||
      e.state === 'partial' ||
      e.state === 'unreadable' ||
      e.state === 'failed') &&
    typeof e.parserVersion === 'string' &&
    typeof e.unitsTotal === 'number' &&
    Number.isSafeInteger(e.unitsTotal) &&
    e.unitsTotal >= 0 &&
    typeof e.unitsReadable === 'number' &&
    Number.isSafeInteger(e.unitsReadable) &&
    e.unitsReadable >= 0 &&
    e.unitsReadable <= e.unitsTotal &&
    Array.isArray(e.passages) &&
    e.passages.every(
      (p: unknown) =>
        object(p) &&
        typeof p.locator === 'string' &&
        typeof p.text === 'string' &&
        typeof p.sha256 === 'string' &&
        /^[a-f0-9]{64}$/u.test(p.sha256) &&
        (p.page === null ||
          (typeof p.page === 'number' &&
            Number.isSafeInteger(p.page) &&
            p.page > 0)),
    ) &&
    Array.isArray(e.issues) &&
    e.issues.every(
      (i: unknown) =>
        object(i) &&
        typeof i.code === 'string' &&
        (i.locator === null || typeof i.locator === 'string'),
    )
  );
}
export function snapshotIdentityHash(input: {
  identity: string;
  sourceHash: string;
  pipelineVersion: string;
  parserVersion: string;
  missingDocuments: readonly { documentId: string; title: string }[];
  sources: readonly Pick<
    EvidenceSource,
    | 'id'
    | 'documentId'
    | 'documentVersionId'
    | 'representationId'
    | 'sourceSha256'
  >[];
}) {
  const sources = input.sources.map(
    ({
      id,
      documentId,
      documentVersionId,
      representationId,
      sourceSha256,
    }) => ({
      id,
      documentId,
      documentVersionId,
      representationId,
      sourceSha256,
    }),
  );
  return commandFingerprint([
    'DOSSIER_ANALYSIS_SNAPSHOT/1',
    { ...input, sources },
  ]);
}
export function readSnapshot(value: unknown, expectedHash: string) {
  if (
    !object(value) ||
    value.format !== 'DOSSIER_ANALYSIS_SNAPSHOT/1' ||
    typeof value.parserVersion !== 'string' ||
    value.parserVersion.length < 1 ||
    value.parserVersion.length > 100 ||
    typeof value.pipelineVersion !== 'string' ||
    value.pipelineVersion.length < 1 ||
    value.pipelineVersion.length > 100 ||
    typeof value.sourceHash !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value.sourceHash) ||
    typeof value.identity !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value.identity) ||
    !Array.isArray(value.sources) ||
    value.sources.length < 1 ||
    value.sources.length > 25 ||
    !value.sources.every(source) ||
    !Array.isArray(value.missingDocuments) ||
    !value.missingDocuments.every(
      (d: unknown) =>
        object(d) &&
        typeof d.documentId === 'string' &&
        typeof d.title === 'string',
    )
  )
    throw new ServiceUnavailableException('The preserved run is unavailable.');
  const sources = value.sources.filter(source);
  const missingDocuments = value.missingDocuments.map((d: unknown) => {
    if (
      !object(d) ||
      typeof d.documentId !== 'string' ||
      typeof d.title !== 'string'
    )
      throw new ServiceUnavailableException(
        'The preserved run is unavailable.',
      );
    return { documentId: d.documentId, title: d.title };
  });
  if (
    dossierSnapshotHash(sources) !== value.sourceHash ||
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
  return {
    identity: value.identity,
    pipelineVersion: value.pipelineVersion,
    parserVersion: value.parserVersion,
    sourceHash: value.sourceHash,
    sources,
    missingDocuments,
  };
}
