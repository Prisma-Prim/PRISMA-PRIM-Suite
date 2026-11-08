import { describe, expect, it } from 'vitest';
import {
  compactPdfText,
  inspectCommercialPdf,
} from '../commercial-pdf/pdf-inspection.test-support.mjs';
import { renderCertificationRegister } from './certification-register-pdf.js';
import {
  REGISTER_LABELS,
  REGISTER_LANGUAGES,
} from './certification-register.labels.js';
import {
  certificationRegister,
  registerLanguage,
  type CertificationRegisterSource,
} from './certification-register.js';
import type { CertificationAttachment } from './certification.types.js';

const AT = '2026-11-07T08:00:00.000Z';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A fictional open Case with one known and one unrecognized step version. */
function source(
  overrides: Partial<CertificationRegisterSource> = {},
): CertificationRegisterSource {
  return {
    caseId: id(1153),
    orderReference: 'CERT-DEMO-1',
    status: 'open',
    standard: 'iso_22000_2018',
    auditType: 'initial_certification',
    clientLegalName: 'Lactis Demo SRL',
    revision: 4,
    openedAt: AT,
    revisedAt: '2026-11-08T09:30:00.000Z',
    entries: [
      {
        kind: 'step',
        version: {
          id: id(2),
          step: 'agreement',
          version: 2,
          caseRevision: 3,
          reason: 'Fictional signature date corrected.',
          recordedBy: {
            workspaceMembershipId: id(3),
            displayName: 'Synthetic member',
          },
          recordedAt: AT,
          value: { signedOn: '2026-11-02', attachmentId: id(4) },
        },
      },
      {
        kind: 'unrecognized_step',
        code: 'surveillance_plan',
        version: 1,
        reason: null,
        recordedBy: { displayName: 'Synthetic member' },
        recordedAt: AT,
      },
    ],
    documents: [],
    ...overrides,
  };
}

function document(n: number): CertificationAttachment {
  return {
    id: id(100 + n),
    caseRevision: 2,
    role: 'evidence',
    documentId: id(200 + n),
    versionId: id(300 + n),
    representationId: id(400 + n),
    versionNumber: 1,
    sourceTitle: `Fictional evidence ${n}`,
    fileName: `evidence-${n}.pdf`,
    sizeBytes: 100,
    sha256: String(n % 10).repeat(64),
    note: null,
    attachedBy: {
      workspaceMembershipId: id(3),
      displayName: 'Synthetic member',
    },
    attachedAt: AT,
  };
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object')
    return Object.values(value).flatMap(strings);
  return [];
}

describe('Certification Case dossier register', () => {
  it('accepts only an optional closed language', () => {
    expect(registerLanguage({})).toBe('en');
    for (const language of REGISTER_LANGUAGES)
      expect(registerLanguage({ language })).toBe(language);
    for (const query of [
      null,
      { language: 'de' },
      { language: ['en'] },
      { language: 'en', format: 'pdf' },
      { lang: 'en' },
    ])
      expect(() => registerLanguage(query)).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: 'CERTIFICATION_REGISTER_QUERY_INVALID',
          }),
        }),
      );
  });

  it('has a non-empty label for every key in every language', () => {
    const english = strings(REGISTER_LABELS.en).length;
    for (const language of REGISTER_LANGUAGES) {
      const labels = strings(REGISTER_LABELS[language]);
      expect(labels).toHaveLength(english);
      for (const label of labels) expect(label.trim()).toBe(label);
      expect(labels.every((label) => label.length > 0)).toBe(true);
    }
  });

  it('shows an unrecognized step generically and prints user texts as entered', async () => {
    const register = certificationRegister(source(), 'en');
    expect(register.date.toISOString()).toBe('2026-11-08T09:30:00.000Z');
    expect(register.blocks).toContainEqual({
      kind: 'entry',
      title: 'Recorded step surveillance_plan — version 1',
      fields: [
        { label: 'Recorded at', value: '2026-11-07 08:00:00 UTC' },
        { label: 'Recorded by', value: 'Synthetic member' },
      ],
    });
    expect(register.blocks).toContainEqual({
      kind: 'paragraph',
      text: 'No document is referenced.',
    });
    const text = compactPdfText(
      (await inspectCommercialPdf(await renderCertificationRegister(register)))
        .map((page) => page.text)
        .join('\n'),
    );
    for (const value of [
      'Certification agreement — version 2',
      'Fictional signature date corrected.',
      'Recorded step surveillance_plan — version 1',
    ])
      expect(text).toContain(compactPdfText(value));
  }, 30_000);

  it('wraps long texts and tables within the page and repeats the notice on every page', async () => {
    const long = Array.from(
      { length: 400 },
      (_, n) => `Fictional word${n} Știință Пример`,
    ).join(' ');
    const register = certificationRegister(
      source({
        clientLegalName: long,
        documents: Array.from({ length: 60 }, (_, n) => document(n)),
      }),
      'ro',
    );
    const pages = await inspectCommercialPdf(
      await renderCertificationRegister(register),
    );
    expect(pages.length).toBeGreaterThan(3);
    // Each page opens with the notice and its number, then continues the content.
    const content = pages.map((page, index) => {
      const decoration = compactPdfText(
        `${REGISTER_LABELS.ro.notice}Pagina ${index + 1}`,
      );
      const text = compactPdfText(page.text);
      expect(text.startsWith(decoration)).toBe(true);
      return text.slice(decoration.length);
    });
    const text = content.join('');
    expect(text).toContain(compactPdfText(long));
    for (const n of [0, 59]) expect(text).toContain(id(300 + n));
    // The table header is repeated on the pages the table continues on.
    expect(
      content.filter((page) =>
        page.includes(compactPdfText('RolDocumentVersiunea documentului')),
      ).length,
    ).toBeGreaterThan(1);
  }, 30_000);

  it('refuses text the bundled fonts cannot draw exactly', async () => {
    await expect(
      renderCertificationRegister(
        certificationRegister(source({ clientLegalName: 'Demo 中' }), 'en'),
      ),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'PDF_TEXT_UNSUPPORTED' },
    });
  });

  it('refuses a register longer than the page bound', async () => {
    await expect(
      renderCertificationRegister(
        certificationRegister(
          source({ clientLegalName: 'S\n'.repeat(20_000) }),
          'en',
        ),
      ),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'PDF_CONTENT_LIMIT' },
    });
  }, 30_000);
});
