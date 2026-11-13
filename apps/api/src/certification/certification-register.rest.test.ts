import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  compactPdfText,
  inspectCommercialPdf,
} from '../commercial-pdf/pdf-inspection.test-support.mjs';
import {
  CERTIFICATION_APPROVER,
  CERTIFICATION_AUDITOR,
  CERTIFICATION_OWNER,
  CERTIFICATION_READER,
  openCertificationFixture,
  record,
  text,
  type CertificationSubject,
} from './certification.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

type Subject =
  | typeof CERTIFICATION_OWNER
  | typeof CERTIFICATION_AUDITOR
  | typeof CERTIFICATION_APPROVER;

const NOTICE = {
  en: 'Generated dossier register, not an official certification body form. It accompanies the signed originals and replaces none of them.',
  ro: 'Registru generat al dosarului, nu un formular oficial al organismului de certificare. Însoțește originalele semnate și nu înlocuiește niciunul dintre ele.',
  ru: 'Сформированный реестр досье, не являющийся официальной формой органа по сертификации. Он сопровождает подписанные оригиналы и не заменяет ни один из них.',
};

const STEP_LABELS: Record<string, string> = {
  application: 'Application',
  application_review: 'Application review',
  duration: 'Audit duration',
  agreement: 'Certification agreement',
  team: 'Audit team',
  team_decision: 'Team decision',
  stage_1_plan: 'Stage 1 plan',
  stage_1_report: 'Stage 1 report',
  stage_2_plan: 'Stage 2 plan',
  stage_2_report: 'Stage 2 report',
  recommendation: 'Team recommendation',
  dossier_review: 'Dossier review',
  decision: 'Certification Decision',
  certificate_data: 'Certificate data',
  certificate_draft: 'Certificate draft',
  client_opinion: 'Client opinion',
  certificate_draft_approval: 'Certificate draft approval',
};

const TEXTS = [
  {
    language: 'ro',
    holderName: 'Lactis Demo SRL',
    address: 'Str. Exemplu 1, Demo City',
    scope: 'Producerea laptelui pasteurizat (exemplu)',
  },
];

const DOSSIER_ITEMS = [
  'application',
  'application_review',
  'duration',
  'agreement',
  'team_approval',
  'stage_1_plan',
  'stage_1_report',
  'stage_2_plan',
  'stage_2_report',
  'participant_lists',
  'findings_follow_up',
  'recommendation',
  'certificate_data',
];

const CORRECTION_REASON = 'Fictional rationale clarified after the review.';

withPostgres('Certification Case dossier register', { timeout: 60_000 }, () => {
  let fixture: Awaited<ReturnType<typeof openCertificationFixture>>;
  let caseId = '';

  async function ok(
    subject: Subject,
    path: string,
    body: Record<string, unknown>,
  ) {
    return fixture.created(
      await fixture.call(subject, path, { method: 'POST', body }),
    );
  }
  function plan(attachmentId: string, startDate: string, onSiteDays: string) {
    return {
      startDate,
      endDate: startDate,
      onSiteDays,
      remoteDays: '0',
      objectives: 'Fictional audit objectives',
      scope: 'Production of pasteurised milk',
      planAttachmentId: attachmentId,
      sentToClientOn: null,
      deviationNote: null,
    };
  }
  function decision(expectedRevision: number, rationale: string) {
    return {
      expectedRevision,
      decision: 'granted',
      decidedOn: '2026-11-06',
      decidedBy: 'Decision Maker Demo',
      decidedByFunction: 'Head of the fictional body',
      decisionFormAttachmentId: null,
      independenceAttested: true,
      grantedTexts: TEXTS,
      rationale,
      additionalInformation: null,
    };
  }
  /** A fictional Case from the application to the Certificate (revision 25). */
  async function certifiedCase() {
    const id = await fixture.approvedTeamCase();
    const base = `/certification-cases/${id}`;
    await ok(CERTIFICATION_OWNER, `${base}/stages/stage-1/plan`, {
      expectedRevision: 9,
      ...plan(await fixture.attach(id, 'plan', 8), '2026-10-01', '1'),
    });
    await ok(CERTIFICATION_AUDITOR, `${base}/findings`, {
      expectedRevision: 10,
      stage: 'stage_1',
      classification: 'area_of_concern',
      clause: '7.5',
      area: 'Fictional document control',
      statement: 'Fictional outdated instruction at the packing line.',
      evidenceAttachmentIds: [],
    });
    await ok(CERTIFICATION_AUDITOR, `${base}/stages/stage-1/report`, {
      expectedRevision: 12,
      reportDate: '2026-10-01',
      documentReviewCompleted: true,
      conclusion: 'ready',
      conclusionNote: 'Ready.',
      reportAttachmentId: await fixture.attach(id, 'report', 11),
    });
    await ok(CERTIFICATION_OWNER, `${base}/stages/stage-2/plan`, {
      expectedRevision: 14,
      ...plan(await fixture.attach(id, 'plan', 13), '2026-10-20', '1.5'),
    });
    await ok(CERTIFICATION_AUDITOR, `${base}/stages/stage-2/report`, {
      expectedRevision: 16,
      reportDate: '2026-10-21',
      summary: 'Stage 2 completed.',
      reportAttachmentId: await fixture.attach(id, 'report', 15),
      certificationBodyApproval: null,
    });
    await ok(CERTIFICATION_AUDITOR, `${base}/recommendation`, {
      expectedRevision: 17,
      recommendation: 'grant',
      basis: 'No nonconformity; system effectively implemented.',
    });
    await ok(CERTIFICATION_OWNER, `${base}/certificate-data`, {
      expectedRevision: 19,
      texts: TEXTS,
      agreedOn: '2026-10-21',
      agreementAttachmentId: await fixture.attach(id, 'certificate_data', 18),
    });
    await ok(CERTIFICATION_APPROVER, `${base}/dossier-review`, {
      expectedRevision: 20,
      items: Object.fromEntries(
        DOSSIER_ITEMS.map((item) => [
          item,
          {
            answer: ['findings_follow_up', 'participant_lists'].includes(item)
              ? 'not_applicable'
              : 'present',
            note: null,
          },
        ]),
      ),
      conclusion: 'Fictional dossier complete; recommendation supported.',
      independenceAttested: true,
    });
    await ok(
      CERTIFICATION_APPROVER,
      `${base}/decision`,
      decision(21, 'Recommendation accepted.'),
    );
    const decided = await ok(CERTIFICATION_APPROVER, `${base}/decision`, {
      ...decision(22, 'Recommendation accepted after the dossier review.'),
      reason: CORRECTION_REASON,
    });
    const draft = await ok(CERTIFICATION_OWNER, `${base}/certificate-draft`, {
      expectedRevision: 24,
      attachmentId: await fixture.attach(id, 'certificate_draft', 23),
      number: 'DEMO-1153-0001',
      draftedOn: '2026-11-06',
      decisionVersionId: record(decided.decision).id,
      certificateDataVersionId: record(decided.certificateData).id,
    });
    const draftVersionId = record(draft.release).currentDraftId;
    await ok(CERTIFICATION_OWNER, `${base}/client-opinion`, {
      expectedRevision: 25,
      draftVersionId,
      outcome: 'skipped',
      skipReason: 'texts_already_agreed',
      note: null,
      businessDate: '2026-11-06',
    });
    await ok(CERTIFICATION_APPROVER, `${base}/certificate-draft-approval`, {
      expectedRevision: 26,
      draftVersionId,
      approvedOn: '2026-11-06',
      textsConfirmed: true,
      numberConfirmed: true,
      validityConfirmed: true,
      independenceAttested: true,
    });
    const certified = await ok(CERTIFICATION_APPROVER, `${base}/certificate`, {
      expectedRevision: 28,
      number: 'DEMO-1153-0001',
      issuedOn: '2026-11-06',
      attachmentId: await fixture.attach(id, 'certificate', 27),
      signedBy: 'Decision Maker Demo',
      signedByFunction: 'Head of the fictional body',
      independenceAttested: true,
    });
    expect(certified).toMatchObject({ status: 'certified', revision: 29 });
    return id;
  }
  function register(
    subject: CertificationSubject,
    id: string,
    query = '',
    company?: string,
  ) {
    return fixture.call(
      subject,
      `/certification-cases/${id}/register${query}`,
      {
        ...(company === undefined ? {} : { company }),
      },
    );
  }
  async function pdfOf(response: Response) {
    expect(response.status).toBe(200);
    return new Uint8Array(await response.arrayBuffer());
  }
  async function listed(path: string) {
    const response = await fixture.call(CERTIFICATION_READER, path);
    expect(response.status).toBe(200);
    const body = record(await response.json());
    const items = body.items ?? body.entries;
    if (!Array.isArray(items)) throw new Error('Expected a list.');
    return items.map(record);
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await openCertificationFixture({
      databaseUrl,
      namePrefix: 'certification1153',
      workspaceId: '00000000-0000-4000-8000-000000001153',
    });
    caseId = await certifiedCase();
  }, 300_000);

  afterAll(async () => {
    await fixture?.close();
  });

  it('lets a reader download the register of every step version and referenced Document Version, without recording Activity', async () => {
    const events = await fixture.eventCount(caseId);
    const response = await register(CERTIFICATION_READER, caseId);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="certification-case-register-${caseId.slice(0, 8)}.pdf"`,
    );
    expect(response.headers.get('cache-control')).toContain('no-store');
    const bytes = await pdfOf(response);
    const pages = await inspectCommercialPdf(bytes);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages)
      expect(compactPdfText(page.text)).toContain(compactPdfText(NOTICE.en));
    const all = compactPdfText(pages.map((page) => page.text).join('\n'));
    const expected = [
      'Dossier register',
      'Lactis Demo SRL',
      'ISO 22000:2018',
      'Certified',
      CORRECTION_REASON,
      'Fictional dossier complete; recommendation supported.',
      'Finding 1 (Stage 1) — Statement — version 1',
      'Finding 1 (Stage 1) — Classification — version 1',
      'Area of concern',
      'Certificate',
      'Certificate release',
      'Draft',
      'Client opinion',
      'Draft approval',
      'Issuance',
      'Transmission',
      'Days since issuance: 1',
      'DEMO-1153-0001',
      '2026-11-07 08:00:00 UTC',
    ];
    const timeline = await listed(`/certification-cases/${caseId}/timeline`);
    expect(timeline).toHaveLength(18);
    for (const entry of timeline)
      expected.push(
        `${STEP_LABELS[text(entry.step)]} — version ${String(entry.version)}`,
      );
    const documents = await listed(`/certification-cases/${caseId}/documents`);
    expect(documents).toHaveLength(8);
    for (const document of documents)
      expected.push(
        text(document.versionId),
        text(document.sha256),
        text(document.sourceTitle),
      );
    for (const value of expected) expect(all).toContain(compactPdfText(value));
    const loaded = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(loaded.getCreationDate()?.toISOString()).toBe(
      '2026-11-07T08:00:00.000Z',
    );
    expect(loaded.getModificationDate()?.toISOString()).toBe(
      '2026-11-07T08:00:00.000Z',
    );
    expect(await fixture.eventCount(caseId)).toBe(events);
  });

  it('renders Romanian and Russian labels with their own glyphs', async () => {
    const romanian = await inspectCommercialPdf(
      await pdfOf(await register(CERTIFICATION_READER, caseId, '?language=ro')),
    );
    for (const page of romanian)
      expect(compactPdfText(page.text)).toContain(compactPdfText(NOTICE.ro));
    const ro = compactPdfText(romanian.map((page) => page.text).join('\n'));
    for (const value of [
      'Registrul dosarului',
      'Decizia de certificare — versiunea 2',
      'Datele certificatului — versiunea 1',
      'Certificat',
    ])
      expect(ro).toContain(compactPdfText(value));
    const russian = await inspectCommercialPdf(
      await pdfOf(await register(CERTIFICATION_READER, caseId, '?language=ru')),
    );
    for (const page of russian)
      expect(compactPdfText(page.text)).toContain(compactPdfText(NOTICE.ru));
    const ru = compactPdfText(russian.map((page) => page.text).join('\n'));
    for (const value of [
      'Реестр досье',
      'Решение о сертификации — версия 2',
      'Отчёт этапа 1 — версия 1',
      'Lactis Demo SRL',
    ])
      expect(ru).toContain(compactPdfText(value));
    const french = compactPdfText(
      (
        await inspectCommercialPdf(
          await pdfOf(
            await register(CERTIFICATION_READER, caseId, '?language=fr'),
          ),
        )
      )
        .map((page) => page.text)
        .join('\n'),
    );
    expect(french).toContain(compactPdfText('Registre du dossier'));
  });

  it('yields byte-identical PDFs for the same Case revision', async () => {
    const first = await pdfOf(await register(CERTIFICATION_READER, caseId));
    const second = await pdfOf(
      await register(CERTIFICATION_OWNER, caseId, '?language=en'),
    );
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('reads the whole register at one Case revision while another transaction commits', async () => {
    const pending = await fixture.caseWithApplication();
    const before = await pdfOf(await register(CERTIFICATION_READER, pending));
    const hold = await fixture.holdTable('certification_findings');
    const during = register(CERTIFICATION_READER, pending);
    try {
      await expect.poll(() => hold.waiting(), { timeout: 10_000 }).toBe(true);
      // Another transaction reaches the next revision while the register is
      // half read; its event commits before the register reads the events.
      await hold.write(
        `INSERT INTO certification_events (workspace_id, company_id, case_id, revision, action, actor_membership_id, actor_internal_user_id, occurred_at, metadata)
         SELECT workspace_id, company_id, case_id, revision + 1, 'certification_case.document_attached', actor_membership_id, actor_internal_user_id, occurred_at + interval '1 hour', metadata
           FROM certification_events WHERE case_id = $1 ORDER BY revision DESC LIMIT 1`,
        [pending],
      );
    } finally {
      await hold.release();
    }
    const concurrent = await pdfOf(await during);
    expect(Buffer.from(concurrent).equals(Buffer.from(before))).toBe(true);
  });

  it('refuses an unknown language or query with a closed code', async () => {
    for (const query of [
      '?language=de',
      '?language=EN',
      '?language=',
      '?language=en&language=fr',
      '?lang=en',
    ]) {
      const refused = await register(CERTIFICATION_READER, caseId, query);
      expect(refused.status).toBe(400);
      expect(record(await refused.json()).code).toBe(
        'CERTIFICATION_REGISTER_QUERY_INVALID',
      );
    }
  });

  it('answers hidden, foreign and missing Cases with the Case view denial', async () => {
    async function same(left: Response, right: Response) {
      expect(left.status).toBe(right.status);
      expect(await left.json()).toEqual(await right.json());
    }
    const missingId = randomUUID();
    await same(
      await register(CERTIFICATION_OWNER, missingId),
      await fixture.call(
        CERTIFICATION_OWNER,
        `/certification-cases/${missingId}`,
      ),
    );
    const other = text(
      (
        await fixture.created(
          await fixture.call(CERTIFICATION_OWNER, '/companies', {
            method: 'POST',
            company: null,
            body: { displayName: 'Other Synthetic Body' },
          }),
        )
      ).id,
    );
    for (const path of [
      '/company-project-assignments',
      '/company-certification-reader-assignments',
    ])
      await fixture.created(
        await fixture.call(CERTIFICATION_OWNER, path, {
          method: 'POST',
          company: null,
          body: {
            companyId: other,
            workspaceMembershipId: fixture.membership(CERTIFICATION_OWNER),
          },
        }),
      );
    const foreign = await register(CERTIFICATION_OWNER, caseId, '', other);
    expect(foreign.status).toBe(404);
    await same(
      foreign,
      await fixture.call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}`,
        {
          company: other,
        },
      ),
    );
    await same(
      await register(CERTIFICATION_OWNER, caseId, '', other),
      await register(CERTIFICATION_OWNER, missingId, '', other),
    );
    const revoked = await fixture.call(
      CERTIFICATION_OWNER,
      `/company-project-assignments/${fixture.membership(CERTIFICATION_READER)}/${fixture.companyId}`,
      { method: 'DELETE', company: null },
    );
    expect(revoked.status).toBe(200);
    try {
      const hidden = await register(CERTIFICATION_READER, caseId);
      expect([403, 404]).toContain(hidden.status);
      await same(
        hidden,
        await fixture.call(
          CERTIFICATION_READER,
          `/certification-cases/${caseId}`,
        ),
      );
      await same(
        await register(CERTIFICATION_READER, caseId),
        await register(CERTIFICATION_READER, missingId),
      );
    } finally {
      await fixture.grant(CERTIFICATION_READER, '/company-project-assignments');
    }
  });
});
