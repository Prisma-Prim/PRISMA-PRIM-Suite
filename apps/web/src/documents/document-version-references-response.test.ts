import { describe, expect, it } from 'vitest';
import {
  readDocumentVersionReceipt,
  readDocumentVersions,
} from './document-response';

const at = '2026-09-29T08:00:00.000Z';
const reference = (position: number, primary: boolean) => ({
  id: `00000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
  kind: 'external-reference',
  verification: 'unverified',
  position,
  form: position === 1 ? 'other' : 'rendered',
  primary,
  appendedAfterDesignation: false,
  addedAt: at,
  addedBy: { displayName: 'Document Registrar' },
  access: 'granted',
  url: `https://example.test/reference-${position}`,
});

describe('Document Version reference response boundary', () => {
  it('proves ordered typed references and the lowest current position as primary', () => {
    const read = readDocumentVersions({
      workingRevision: 2,
      mutable: true,
      versions: [
        {
          id: '00000000-0000-4000-8000-000000000101',
          number: 1,
          status: 'draft',
          createdAt: at,
          createdBy: { displayName: 'Document Registrar' },
          representations: [reference(2, true), reference(4, false)],
        },
      ],
    });

    expect(
      read.versions[0]?.references.map(({ position, form, primary }) => ({
        position,
        form,
        primary,
      })),
    ).toEqual([
      { position: 2, form: 'rendered', primary: true },
      { position: 4, form: 'rendered', primary: false },
    ]);
  });

  it('rejects a response that marks a later reference primary', () => {
    expect(() =>
      readDocumentVersions({
        workingRevision: 2,
        mutable: true,
        versions: [
          {
            id: '00000000-0000-4000-8000-000000000101',
            number: 1,
            status: 'draft',
            createdAt: at,
            createdBy: { displayName: 'Document Registrar' },
            representations: [reference(2, false), reference(4, true)],
          },
        ],
      }),
    ).toThrow('Invalid Version reference');
  });

  it('proves both new durable receipt variants', () => {
    const base = {
      documentId: '00000000-0000-4000-8000-000000000100',
      workingRevision: 2,
      versionId: '00000000-0000-4000-8000-000000000101',
      versionNumber: 1,
      representationId: '00000000-0000-4000-8000-000000000102',
    };
    expect(
      readDocumentVersionReceipt({
        ...base,
        action: 'representation_added',
        appendedAfterDesignation: true,
      }),
    ).toMatchObject({ action: 'representation_added' });
    expect(
      readDocumentVersionReceipt({
        ...base,
        action: 'representation_removed',
      }),
    ).toMatchObject({ action: 'representation_removed' });
  });
});
