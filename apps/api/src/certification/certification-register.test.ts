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
import { CONSISTENCY_LABELS } from './certification-consistency.labels.js';
import type { ConsistencySection } from './certification-consistency.js';

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
    consistency: {
      ruleSetVersion: 'dossier-consistency-2026-11',
      counts: { critical: 0, error: 0, toClarify: 0 },
      open: [],
      resolved: [],
      resolvedTotal: 0,
    },
    exchanges: {
      nextCursor: null,
      sendings: [],
      records: [],
      total: 0,
      deadlines: { set: null, entries: [] },
      reverification: { items: [], firstSurveillanceBy: null },
    },
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

  it('has a non-empty consistency label for every key in every language', () => {
    const english = strings(CONSISTENCY_LABELS.en).length;
    for (const language of REGISTER_LANGUAGES) {
      const labels = strings(CONSISTENCY_LABELS[language]);
      expect(labels).toHaveLength(english);
      for (const label of labels) expect(label.trim()).toBe(label);
      expect(labels.every((label) => label.length > 0)).toBe(true);
    }
  });

  it('lists the open and resolved Discrepancies with their values, sources and resolution', async () => {
    const member = { workspaceMembershipId: id(3), displayName: 'Ada Ionescu' };
    const consistency: ConsistencySection = {
      ruleSetVersion: 'dossier-consistency-2026-11',
      counts: { critical: 0, error: 1, toClarify: 0 },
      open: [
        {
          id: `R01:${'a'.repeat(32)}`,
          origin: 'rule',
          rule: 'R01',
          subject: { kind: 'duration_proposal' },
          verdict: 'error',
          left: {
            value: { kind: 'days', days: '3.5' },
            detail: null,
            source: {
              kind: 'step',
              step: 'application',
              version: 2,
              versionId: id(5),
              attachment: null,
            },
          },
          right: {
            value: { kind: 'days', days: '3' },
            detail: null,
            source: {
              kind: 'step',
              step: 'duration',
              version: 1,
              versionId: id(6),
              attachment: null,
            },
          },
          openedRevision: 9,
          opened: { by: member, at: AT },
          endedRevision: null,
          status: 'open',
          blocks: 'decision',
          resolution: null,
        },
      ],
      resolved: [
        {
          id: `manual:${id(7)}`,
          origin: 'manual',
          rule: null,
          sequence: 1,
          subject: { kind: 'manual', text: 'Stage type' },
          note: null,
          verdict: 'to_clarify',
          left: {
            value: { kind: 'text', text: 'Stage 1' },
            detail: 'page 1',
            source: {
              kind: 'attachment',
              attachment: {
                attachmentId: id(8),
                documentId: id(9),
                versionId: id(10),
                versionNumber: 1,
                sourceTitle: 'Fictional editable draft',
                role: 'other',
              },
            },
          },
          right: {
            value: { kind: 'text', text: 'Stage 2' },
            detail: null,
            source: null,
          },
          openedRevision: 10,
          opened: { by: member, at: AT },
          endedRevision: null,
          status: 'resolved',
          blocks: null,
          resolution: {
            kind: 'accepted',
            via: 'acceptance',
            reason: 'The signed PDF prevails.',
            by: { workspaceMembershipId: id(11), displayName: 'Approver Demo' },
            at: AT,
            caseRevision: 11,
            ruleSetVersion: 'dossier-consistency-2026-11',
          },
        },
      ],
      resolvedTotal: 1,
    };
    for (const language of REGISTER_LANGUAGES) {
      const labels = CONSISTENCY_LABELS[language];
      const register = certificationRegister(source({ consistency }), language);
      const text = compactPdfText(
        (
          await inspectCommercialPdf(
            await renderCertificationRegister(register),
          )
        )
          .map((page) => page.text)
          .join('\n'),
      );
      for (const value of [
        labels.section,
        `R01 — ${labels.rules.R01}`,
        labels.verdicts.error,
        labels.blocks.decision,
        `${labels.manual} 1 — Stage type`,
        'Fictional editable draft',
        'The signed PDF prevails.',
        'Approver Demo',
      ])
        expect(text, `${language}: ${value}`).toContain(compactPdfText(value));
    }
    expect(certificationRegister(source(), 'fr').blocks).toContainEqual({
      kind: 'paragraph',
      text: 'Aucune divergence trouvée par le jeu de règles dossier-consistency-2026-11.',
    });
  }, 60_000);

  it('lists the Exchange Records with their deadline states at generation time and the Re-verification Items', async () => {
    const member = { workspaceMembershipId: id(3), displayName: 'Ada Ionescu' };
    const plan = { ...document(1), sourceTitle: 'Stage 1 audit plan' };
    const exchanges: CertificationRegisterSource['exchanges'] = {
      nextCursor: null,
      sendings: [],
      records: [
        {
          sequence: 1,
          current: {
            id: id(20),
            sequence: 1,
            version: 2,
            caseRevision: 12,
            direction: 'sent',
            itemKind: 'stage_plan',
            counterpart: {
              kind: 'client',
              name: 'Lactis Demo SRL, quality manager',
            },
            businessDate: '2026-09-19',
            channel: 'email',
            reference: 'OUT-7',
            note: null,
            attachmentIds: [plan.id],
            reason: 'Fictional date corrected.',
            recordedBy: member,
            recordedAt: AT,
          },
          versions: [],
        },
      ],
      total: 1,
      deadlines: {
        set: {
          version: 2,
          days: {
            stage_plan_sent: 10,
            audit_dossier_transmitted: 20,
            stage_2_report_released: 0,
          },
          configuredBy: {
            workspaceMembershipId: id(11),
            displayName: 'Admin Demo',
          },
          configuredAt: AT,
        },
        entries: [
          {
            kind: 'stage_plan_sent',
            stage: 'stage_1',
            direction: 'before',
            days: 10,
            anchor: '2026-10-01',
            dueDate: '2026-09-21',
            state: 'met',
            record: { sequence: 1, version: 2, businessDate: '2026-09-19' },
          },
          {
            kind: 'audit_dossier_transmitted',
            stage: null,
            direction: 'after',
            days: 20,
            anchor: '2026-10-21',
            dueDate: '2026-11-10',
            state: 'overdue',
            record: null,
          },
        ],
      },
      reverification: {
        firstSurveillanceBy: '2027-10-20',
        items: [
          {
            id: `finding:${id(30)}`,
            origin: 'automatic',
            sequence: null,
            text: null,
            caseRevision: 9,
            source: { kind: 'finding', findingId: id(30), sequence: 2 },
            addedBy: null,
            addedAt: null,
            status: 'open',
            withdrawal: null,
          },
          {
            id: id(31),
            origin: 'manual',
            sequence: 1,
            text: 'Fictional allergen labelling at dispatch.',
            caseRevision: 14,
            source: null,
            addedBy: member,
            addedAt: AT,
            status: 'withdrawn',
            withdrawal: {
              caseRevision: 15,
              reason: 'Fictional duplicate item.',
              by: member,
              at: AT,
            },
          },
        ],
      },
    };
    exchanges.records[0]?.versions.push(
      {
        ...exchanges.records[0].current,
        id: id(19),
        version: 1,
        businessDate: '2026-09-17',
        reference: 'OUT-5',
        reason: null,
      },
      exchanges.records[0].current,
    );
    const states = {
      en: [
        'Exchanges and deadlines',
        'Met',
        'Overdue',
        'Re-verification Items',
      ],
      fr: ['Échanges et délais', 'Respecté', 'Dépassé', 'Points à revérifier'],
      ro: [
        'Schimburi și termene',
        'Respectat',
        'Depășit',
        'Elemente de reverificat',
      ],
      ru: [
        'Обмены и сроки',
        'Соблюдён',
        'Просрочен',
        'Пункты для повторной проверки',
      ],
    } as const;
    for (const language of REGISTER_LANGUAGES) {
      const register = certificationRegister(
        source({ exchanges, documents: [plan] }),
        language,
      );
      const text = compactPdfText(
        (
          await inspectCommercialPdf(
            await renderCertificationRegister(register),
          )
        )
          .map((page) => page.text)
          .join('\n'),
      );
      for (const value of [
        ...states[language],
        'Lactis Demo SRL, quality manager',
        'OUT-7',
        'Stage 1 audit plan',
        '2026-09-21',
        'Fictional date corrected.',
        // The earlier version's own values stay readable.
        '2026-09-17',
        'OUT-5',
        'Fictional allergen labelling at dispatch.',
        'Fictional duplicate item.',
        '2027-10-20',
      ])
        expect(text, `${language}: ${value}`).toContain(compactPdfText(value));
    }
    expect(certificationRegister(source(), 'en').blocks).toEqual(
      expect.arrayContaining([
        { kind: 'paragraph', text: 'No procedure deadline configured.' },
        { kind: 'paragraph', text: 'No exchange recorded.' },
        { kind: 'paragraph', text: 'Nothing to re-verify.' },
      ]),
    );
  }, 60_000);

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
