import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { EvidenceSource } from '../dossier-analysis-engine/index.js';
import { planDossierReview, readBatchProposals } from './index.js';

const text = 'Организация: Пример\nCod fiscal: RO12345678';
const sha256 = createHash('sha256').update(text).digest('hex');
const source: EvidenceSource = {
  id: 'source-1',
  documentId: 'document-1',
  documentVersionId: 'version-1',
  representationId: null,
  sourceSha256: 'a'.repeat(64),
  fileName: 'пример.docx',
  documentTitle: 'Exemplu',
  documentType: 'other',
  versionNumber: 1,
  versionStatus: 'official',
  language: 'ro',
  extraction: {
    state: 'partial',
    parserVersion: 'native-text.v2',
    unitsTotal: 2,
    unitsReadable: 1,
    issues: [{ code: 'image_content', locator: 'paragraph:2' }],
    passages: [{ locator: 'paragraph:1', text, sha256, page: null }],
  },
};

describe('subscription document review batches', () => {
  it('retains exact multilingual evidence and unreadable coverage', () => {
    const plan = planDossierReview([source]);
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0]?.passages[0]).toMatchObject({
      sourceId: 'source-1',
      locator: 'paragraph:1',
      start: 0,
      text,
      passageSha256: sha256,
    });
    expect(plan.coverage).toEqual({
      sources: 1,
      readableUnits: 1,
      totalUnits: 2,
      passages: 1,
      characters: text.length,
      batches: 1,
      incompleteSources: 1,
    });
  });

  it('splits long passages without losing Unicode, offsets or evidence', () => {
    const long = 'Адресă 🏢\n'.repeat(4000);
    const sources = [
      {
        ...source,
        extraction: {
          ...source.extraction,
          passages: [
            {
              locator: 'paragraph:1',
              text: long,
              sha256: createHash('sha256').update(long).digest('hex'),
              page: null,
            },
          ],
        },
      },
    ];
    const plan = planDossierReview(sources);
    expect(plan.batches.length).toBeGreaterThan(1);
    const parts = plan.batches.flatMap((b) => b.passages);
    expect(parts.map((p) => p.text).join('')).toBe(long);
    for (const p of parts) {
      expect(new TextDecoder().decode(new TextEncoder().encode(p.text))).toBe(
        p.text,
      );
      expect(long.slice(p.start, p.start + p.text.length)).toBe(p.text);
    }
  });

  it('rejects quotations outside the disclosed batch even when present elsewhere', () => {
    const plan = planDossierReview([source]);
    const batch = plan.batches[0];
    if (!batch) throw new Error('Expected batch');
    const citation = {
      sourceId: 'source-1',
      documentVersionId: 'version-1',
      locator: 'paragraph:1',
      start: 32,
      end: 42,
      quote: 'RO12345678',
      passageSha256: sha256,
    };
    const proposal = {
      field: 'taxId',
      value: 'RO12345678',
      rationale: 'De verificat',
      citations: [citation],
    };
    expect(
      readBatchProposals({ sources: [source], batch, value: [proposal] }),
    ).toHaveLength(1);
    const undisclosed = {
      ...batch,
      passages: batch.passages.map((p) => ({
        ...p,
        text: p.text.slice(0, 10),
      })),
    };
    expect(() =>
      readBatchProposals({
        sources: [source],
        batch: undisclosed,
        value: [proposal],
      }),
    ).toThrow();
    expect(() =>
      readBatchProposals({
        sources: [source],
        batch,
        value: [
          { ...proposal, citations: [{ ...citation, quote: 'invented' }] },
        ],
      }),
    ).toThrow();
    expect(() =>
      readBatchProposals({
        sources: [source],
        batch,
        value: [
          { ...proposal, citations: [{ ...citation, quote: 'RO99999999' }] },
        ],
      }),
    ).toThrow();
    expect(() =>
      readBatchProposals({
        sources: [source],
        batch: { ...batch, passages: [] },
        value: [proposal],
      }),
    ).toThrow();
    expect(readBatchProposals({ sources: [source], batch, value: [] })).toEqual(
      [],
    );
  });
});
