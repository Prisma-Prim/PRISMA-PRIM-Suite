import { describe, expect, it } from 'vitest';
import { parseReview, parseSource } from './commands.js';

const uuid = 'a3ca4e32-092d-40f7-8b90-d7534f972003';
describe('dossier analysis command boundaries', () => {
  it('accepts one exact native PDF tuple and a supported language', () => {
    expect(
      parseSource({
        documentId: uuid,
        documentVersionId: uuid,
        representationId: uuid,
        language: 'ro',
      }),
    ).toEqual({
      documentId: uuid,
      documentVersionId: uuid,
      representationId: uuid,
      language: 'ro',
      caseId: null,
      attachmentId: null,
    });
  });
  it('requires both certification relation identifiers', () => {
    expect(() =>
      parseSource({
        documentId: uuid,
        documentVersionId: uuid,
        representationId: uuid,
        language: 'ro',
        caseId: uuid,
      }),
    ).toThrow();
  });
  it('does not admit extra identity or unsupported language', () => {
    expect(() =>
      parseSource({
        documentId: uuid,
        documentVersionId: uuid,
        representationId: uuid,
        language: 'de',
      }),
    ).toThrow();
    expect(() =>
      parseSource({
        documentId: uuid,
        documentVersionId: uuid,
        representationId: uuid,
        language: 'ro',
        companyId: uuid,
      }),
    ).toThrow();
  });
  it('requires a revision and a replacement only for corrections', () => {
    expect(
      parseReview({
        expectedRevision: 0,
        decision: 'correct',
        replacementValue: 'Corrected',
      }),
    ).toEqual({
      expectedRevision: 0,
      decision: 'correct',
      replacementValue: 'Corrected',
    });
    expect(() =>
      parseReview({ expectedRevision: 0, decision: 'correct' }),
    ).toThrow();
    expect(() =>
      parseReview({
        expectedRevision: 0,
        decision: 'confirm',
        replacementValue: 'Corrected',
      }),
    ).toThrow();
    expect(() =>
      parseReview({ expectedRevision: -1, decision: 'reject' }),
    ).toThrow();
  });
});

describe('supplementary DOCX input', () => {
  it('accepts a bounded safe file name and exact native document version', async () => {
    const { parseDocxSource } = await import('./commands.js');
    expect(
      parseDocxSource({
        documentId: uuid,
        documentVersionId: uuid,
        fileName: 'original.docx',
        language: 'fr',
      }),
    ).toMatchObject({
      documentId: uuid,
      documentVersionId: uuid,
      fileName: 'original.docx',
      language: 'fr',
    });
  });
  it('rejects a path, wrong type and incomplete case relation', async () => {
    const { parseDocxSource } = await import('./commands.js');
    const base = {
      documentId: uuid,
      documentVersionId: uuid,
      fileName: 'original.docx',
      language: 'fr',
    };
    expect(() =>
      parseDocxSource({ ...base, fileName: '../private.docx' }),
    ).toThrow();
    expect(() =>
      parseDocxSource({ ...base, fileName: 'original.pdf' }),
    ).toThrow();
    expect(() => parseDocxSource({ ...base, caseId: uuid })).toThrow();
  });
});
