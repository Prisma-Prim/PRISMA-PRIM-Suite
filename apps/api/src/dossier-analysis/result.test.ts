import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  analyzeDossier,
  type EvidenceSource,
} from '../dossier-analysis-engine/index.js';
import { readResult } from './result.js';
const text = 'Tax ID: RO123';
const source: EvidenceSource = {
  id: 'one',
  documentId: 'document',
  documentVersionId: 'version',
  representationId: null,
  sourceSha256: 'a'.repeat(64),
  fileName: 'file.docx',
  documentTitle: 'Title',
  documentType: 'questionnaire',
  versionNumber: 1,
  versionStatus: 'draft',
  language: 'en',
  extraction: {
    state: 'complete',
    parserVersion: 'v1',
    passages: [
      {
        locator: 'p:1',
        text,
        sha256: createHash('sha256').update(text).digest('hex'),
        page: null,
      },
    ],
    issues: [],
    unitsTotal: 1,
    unitsReadable: 1,
  },
};
const missingDocuments = [{ documentId: 'missing', title: 'Missing' }];
const generated = analyzeDossier({ sources: [source], missingDocuments });
const input = {
  snapshotHash: 'b'.repeat(64),
  pipelineVersion: generated.pipelineVersion,
  sources: [source],
  missingDocuments,
};
const result = { ...generated, snapshotHash: input.snapshotHash };
describe('stored analysis result', () => {
  it('preserves validated historical results without recomputing them', () => {
    expect(readResult(result, input)).toEqual(result);
  });
  it('rejects fabricated citations and inconsistent coverage', () => {
    const first = result.candidates[0];
    expect(first).toBeDefined();
    if (!first) throw new Error('Fixture must yield a candidate.');
    expect(() =>
      readResult(
        {
          ...result,
          candidates: [
            { ...first, citation: { ...first.citation, quote: 'other' } },
          ],
        },
        input,
      ),
    ).toThrow();
    expect(() =>
      readResult(
        { ...result, coverage: { ...result.coverage, missingDocuments: [] } },
        input,
      ),
    ).toThrow();
    expect(() =>
      readResult({ ...result, snapshotHash: 'c'.repeat(64) }, input),
    ).toThrow();
  });
});

it('rejects a comparison whose outcome contradicts its cited values', () => {
  const secondText = 'Tax ID: RO456';
  const second: EvidenceSource = {
    ...source,
    id: 'two',
    documentId: 'other',
    extraction: {
      ...source.extraction,
      passages: [
        {
          locator: 'p:1',
          text: secondText,
          sha256: createHash('sha256').update(secondText).digest('hex'),
          page: null,
        },
      ],
    },
  };
  const generated = analyzeDossier({
    sources: [source, second],
    missingDocuments: [],
  });
  const compared = generated.comparisons[0];
  expect(compared?.outcome).toBe('conflict');
  if (!compared) throw new Error('Fixture must produce a comparison.');
  const input = {
    snapshotHash: 'b'.repeat(64),
    pipelineVersion: generated.pipelineVersion,
    sources: [source, second],
    missingDocuments: [],
  };
  const result = { ...generated, snapshotHash: input.snapshotHash };
  expect(readResult(result, input)).toEqual(result);
  expect(() =>
    readResult(
      { ...result, comparisons: [{ ...compared, outcome: 'match' }] },
      input,
    ),
  ).toThrow();
});
