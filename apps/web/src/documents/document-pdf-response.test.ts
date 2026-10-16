import { describe, expect, it } from 'vitest';
import {
  readDocumentPdfContent,
  readDocumentPdfHistory,
} from './document-pdf-response';
const at = '2026-10-16T12:00:00.000Z';
const pdf = {
  representationId: 'pdf',
  revision: 2,
  fileName: 'questionnaire.pdf',
  mediaType: 'application/pdf',
  size: 595,
  sha256: 'a'.repeat(64),
  storedAt: at,
  storedBy: { displayName: 'Member DEMO' },
  scan: { outcome: 'clean', engine: 'ClamAV 1.4.3', scannedAt: at },
};
describe('PDF response boundary', () => {
  it('never carries file metadata from a denied response into presentation', () => {
    expect(
      readDocumentPdfContent({ ...pdf, state: 'stored', access: 'denied' }),
    ).toEqual({ state: 'stored', access: 'denied' });
    expect(
      readDocumentPdfContent({ ...pdf, state: 'stored', access: 'granted' }),
    ).toEqual({ ...pdf, state: 'stored', access: 'granted' });
  });
  it.each([
    { ...pdf, scan: { ...pdf.scan, outcome: 'unknown' } },
    { ...pdf, size: 5242881 },
    { ...pdf, sha256: 'unknown' },
    { ...pdf, revision: 1 },
    { ...pdf, fileName: '../unsafe.pdf' },
  ])('rejects malformed or unproved preserved content %j', (invalid) => {
    expect(() =>
      readDocumentPdfContent({
        ...invalid,
        state: 'stored',
        access: 'granted',
      }),
    ).toThrow();
  });
  it('rejects duplicate identities, unordered revisions and invalid continuation rather than losing history', () => {
    expect(
      readDocumentPdfHistory({
        uploads: [{ ...pdf, current: true }],
        nextBeforeRevision: null,
      }).uploads,
    ).toHaveLength(1);
    for (const uploads of [
      [
        { ...pdf, revision: 3, current: true },
        { ...pdf, current: false },
      ],
      [
        { ...pdf, current: true },
        { ...pdf, representationId: 'different', revision: 3, current: false },
      ],
    ])
      expect(() =>
        readDocumentPdfHistory({ uploads, nextBeforeRevision: null }),
      ).toThrow();
    expect(() =>
      readDocumentPdfHistory({
        uploads: [{ ...pdf, current: true }],
        nextBeforeRevision: 2,
      }),
    ).toThrow();
  });
});
