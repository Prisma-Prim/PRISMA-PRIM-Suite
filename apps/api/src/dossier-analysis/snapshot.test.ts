import { describe, expect, it } from 'vitest';
import {
  dossierSnapshotHash,
  type EvidenceSource,
} from '../dossier-analysis-engine/index.js';
import { readSnapshot, snapshotIdentityHash } from './snapshot.js';

const source: EvidenceSource = {
  id: 'source',
  documentId: 'document',
  documentVersionId: 'version',
  representationId: null,
  sourceSha256: 'a'.repeat(64),
  fileName: 'x.docx',
  documentTitle: 'Title',
  documentType: 'questionnaire',
  versionNumber: 1,
  versionStatus: 'draft',
  language: 'fr',
  extraction: {
    state: 'unreadable',
    parserVersion: 'v1',
    passages: [],
    issues: [],
    unitsTotal: 0,
    unitsReadable: 0,
  },
};
describe('preserved run snapshot', () => {
  it('binds exact sources and native identity to the public hash', () => {
    const identity = 'b'.repeat(64),
      sourceHash = dossierSnapshotHash([source]);
    const snapshot = {
      format: 'DOSSIER_ANALYSIS_SNAPSHOT/1',
      pipelineVersion: 'rules/v1',
      parserVersion: 'native/v1',
      identity,
      sourceHash,
      sources: [source],
      missingDocuments: [],
    };
    const hash = snapshotIdentityHash({
      identity,
      sourceHash,
      pipelineVersion: 'rules/v1',
      parserVersion: 'native/v1',
      missingDocuments: [],
      sources: [source],
    });
    expect(readSnapshot(snapshot, hash).sources).toEqual([source]);
    expect(() =>
      readSnapshot({ ...snapshot, identity: 'c'.repeat(64) }, hash),
    ).toThrow();
    expect(() =>
      readSnapshot(
        { ...snapshot, sources: [{ ...source, documentTitle: 'Changed' }] },
        hash,
      ),
    ).toThrow();
    expect(() =>
      readSnapshot({ ...snapshot, pipelineVersion: 'rules/v2' }, hash),
    ).toThrow();
    expect(() =>
      readSnapshot(
        {
          ...snapshot,
          missingDocuments: [{ documentId: 'hidden', title: 'Changed' }],
        },
        hash,
      ),
    ).toThrow();
    expect(
      snapshotIdentityHash({
        identity: 'c'.repeat(64),
        sourceHash,
        pipelineVersion: 'rules/v1',
        parserVersion: 'native/v1',
        missingDocuments: [],
        sources: [source],
      }),
    ).not.toBe(hash);
  });
});
