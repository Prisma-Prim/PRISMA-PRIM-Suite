import { randomUUID } from 'node:crypto';
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
  applicationFacts,
  openCertificationFixture,
  record,
  text,
  type CertificationSubject,
} from './certification.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

const INPUTS = {
  primary: 'CI',
  haccpStudies: { CI: 2 },
  increases: {},
  reductions: {},
};
/** The fictional Lactis Demo SRL duration: 3 auditor-days, 1 + 2. */
const CONFIRMED = {
  initialOnSite: '3',
  stage1OnSite: '1',
  stage2OnSite: '2',
  surveillanceOnSite: '1',
  recertificationOnSite: '2',
};
const TEXT = {
  language: 'ro',
  holderName: 'Lactis Demo SRL',
  address: 'Str. Exemplu 1, Demo City',
  scope: 'Producerea laptelui pasteurizat (exemplu)',
};
const DECLARED = {
  noConsultancy: 'confirmed',
  noEmployment: 'confirmed',
  noManagementInvolvement: 'confirmed',
  confidentiality: 'confirmed',
};
const ITEMS = [
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
/** The fictional deadlines of the dossier control PRD §8.2. */
const FICTIONAL = {
  stage_plan_sent: 10,
  audit_dossier_transmitted: 20,
  stage_2_report_released: 0,
};
const CLIENT = { kind: 'client', name: 'Lactis Demo SRL, quality manager' };

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected a list.');
  const items: unknown[] = value;
  return items.map(record);
}

withPostgres(
  'Certification Case exchange register, deadlines and Re-verification Items',
  { timeout: 180_000 },
  () => {
    let fixture: Awaited<ReturnType<typeof openCertificationFixture>>;
    let otherCompanyId = '';

    async function read(
      subject: CertificationSubject,
      path: string,
      company?: string,
    ) {
      const response = await fixture.call(subject, path, { company });
      if (response.status !== 200)
        throw new Error(`${response.status}: ${await response.text()}`);
      return record(await response.json());
    }
    async function revision(base: string): Promise<number> {
      const current = (await read(CERTIFICATION_OWNER, base)).revision;
      if (typeof current !== 'number') throw new Error('Expected a revision.');
      return current;
    }
    function post(
      subject: CertificationSubject,
      path: string,
      body: Record<string, unknown>,
      options: { key?: string; company?: string } = {},
    ) {
      return fixture.call(subject, path, { method: 'POST', body, ...options });
    }
    /** Records a command on the revision read just before. */
    async function step(
      subject: CertificationSubject,
      base: string,
      path: string,
      body: Record<string, unknown>,
    ) {
      return fixture.created(
        await post(subject, `${base}${path}`, {
          expectedRevision: await revision(base),
          ...body,
        }),
      );
    }
    async function refusal(response: Response) {
      return { status: response.status, ...record(await response.json()) };
    }
    async function attach(caseId: string, role: string) {
      return fixture.attach(
        caseId,
        role,
        await revision(`/certification-cases/${caseId}`),
      );
    }
    function plan(attachmentId: string, start: string, end: string) {
      return {
        startDate: start,
        endDate: end,
        onSiteDays: start === '2026-10-01' ? '1' : '2',
        remoteDays: '0',
        objectives: 'Fictional objectives',
        scope: 'Production of pasteurised milk (fictional)',
        planAttachmentId: attachmentId,
        sentToClientOn: null,
        deviationNote: null,
      };
    }
    function exchange(
      attachmentIds: string[],
      overrides: Record<string, unknown> = {},
    ) {
      return {
        direction: 'sent',
        itemKind: 'stage_plan',
        attachmentIds,
        counterpart: CLIENT,
        businessDate: '2026-09-19',
        channel: 'email',
        reference: null,
        note: null,
        ...overrides,
      };
    }
    function section(view: Record<string, unknown>) {
      return record(view.exchanges);
    }
    async function configure(days: Record<string, number | null>) {
      const current = await read(
        CERTIFICATION_OWNER,
        '/certification-procedure-deadlines',
      );
      const version =
        current.current === null ? 0 : record(current.current).version;
      return fixture.created(
        await post(CERTIFICATION_OWNER, '/certification-procedure-deadlines', {
          expectedVersion: version,
          days,
        }),
      );
    }

    /**
     * The fictional Lactis Demo SRL Case: 3 auditor-days, Ion Popa (the
     * auditor member) leading with a technical expert, Stage 1 on 2026-10-01
     * and Stage 2 on 2026-10-20 and 21, both reported, a minor
     * nonconformity on Stage 2 whose plan is judged adequate, and the team's
     * recommendation to grant.
     */
    async function lactisCase() {
      const caseId = await fixture.acceptedCase(
        applicationFacts({
          haccpStudyCount: 2,
          totalHeadcount: 40,
          effectiveFte: 40,
        }),
      );
      const base = `/certification-cases/${caseId}`;
      await step(CERTIFICATION_OWNER, base, '/duration', {
        inputs: INPUTS,
        confirmed: CONFIRMED,
      });
      await step(CERTIFICATION_OWNER, base, '/agreement', {
        signedOn: '2026-09-15',
        attachmentId: await attach(caseId, 'agreement'),
      });
      await step(CERTIFICATION_OWNER, base, '/team', {
        members: [
          {
            name: 'Ion Popa',
            role: 'team_leader',
            workspaceMembershipId: fixture.membership(CERTIFICATION_AUDITOR),
            holdsCategory: false,
            competenceNote: 'Fictional lead auditor',
            declarations: DECLARED,
            conflictNote: null,
          },
          {
            name: 'Expert Demo',
            role: 'technical_expert',
            workspaceMembershipId: null,
            holdsCategory: true,
            competenceNote: 'Fictional dairy technologist',
            declarations: DECLARED,
            conflictNote: null,
          },
        ],
      });
      await step(CERTIFICATION_APPROVER, base, '/team-decision', {
        teamVersion: 1,
        decision: 'approved',
        independenceAttested: true,
      });
      const plan1 = await attach(caseId, 'plan');
      await step(
        CERTIFICATION_OWNER,
        base,
        '/stages/stage-1/plan',
        plan(plan1, '2026-10-01', '2026-10-01'),
      );
      await step(CERTIFICATION_AUDITOR, base, '/stages/stage-1/report', {
        reportDate: '2026-10-01',
        documentReviewCompleted: true,
        conclusion: 'ready',
        conclusionNote: 'Ready for Stage 2.',
        reportAttachmentId: await attach(caseId, 'report'),
      });
      const plan2 = await attach(caseId, 'plan');
      await step(
        CERTIFICATION_OWNER,
        base,
        '/stages/stage-2/plan',
        plan(plan2, '2026-10-20', '2026-10-21'),
      );
      const evidence = await attach(caseId, 'evidence');
      const found = await step(CERTIFICATION_AUDITOR, base, '/findings', {
        stage: 'stage_2',
        classification: 'minor_nonconformity',
        clause: '8.5.1',
        area: 'Fictional receiving of raw milk',
        statement: 'Fictional hazard analysis omits allergens at receiving.',
        evidenceAttachmentIds: [evidence],
      });
      const minor = text(records(found.findings)[0]?.id);
      const report2 = await attach(caseId, 'report');
      await step(CERTIFICATION_AUDITOR, base, '/stages/stage-2/report', {
        reportDate: '2026-10-21',
        summary: 'Fictional Stage 2 with one minor nonconformity.',
        reportAttachmentId: report2,
      });
      await step(CERTIFICATION_AUDITOR, base, `/findings/${minor}/response`, {
        correction: 'Fictional allergen added.',
        cause: 'Fictional template omitted allergens.',
        correctiveAction: 'Fictional template revised.',
        receivedOn: '2026-10-28',
        plannedCompletionOn: null,
        evidenceAttachmentIds: [],
      });
      await step(
        CERTIFICATION_AUDITOR,
        base,
        `/findings/${minor}/plan-judgment`,
        { outcome: 'adequate', note: 'Fictional plan adequate.' },
      );
      await step(CERTIFICATION_AUDITOR, base, '/recommendation', {
        recommendation: 'grant',
        basis: 'Fictional minor nonconformity with an adequate plan.',
      });
      return { caseId, base, plan1, plan2, report2, minor };
    }
    function review() {
      return {
        items: Object.fromEntries(
          ITEMS.map((item) => [
            item,
            {
              answer:
                item === 'participant_lists' ? 'not_applicable' : 'present',
              note: null,
            },
          ]),
        ),
        conclusion: 'Fictional dossier review.',
        independenceAttested: true,
      };
    }
    function decision(overrides: Record<string, unknown> = {}) {
      return {
        decision: 'granted',
        decidedOn: '2026-11-06',
        decidedBy: 'Decision Maker Demo',
        decidedByFunction: 'Head of the fictional body',
        decisionFormAttachmentId: null,
        independenceAttested: true,
        grantedTexts: [TEXT],
        rationale: 'Fictional recommendation accepted.',
        additionalInformation: null,
        ...overrides,
      };
    }
    async function dossierReady(caseId: string, base: string) {
      await step(CERTIFICATION_OWNER, base, '/certificate-data', {
        texts: [TEXT],
        agreedOn: '2026-11-02',
        agreementAttachmentId: await attach(caseId, 'certificate_data'),
      });
      await step(CERTIFICATION_APPROVER, base, '/dossier-review', review());
    }

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await openCertificationFixture({
        databaseUrl,
        namePrefix: 'certification1293',
        workspaceId: '00000000-0000-4000-8000-000000001293',
      });
      otherCompanyId = text(
        (
          await fixture.created(
            await fixture.call(CERTIFICATION_OWNER, '/companies', {
              method: 'POST',
              company: null,
              body: { displayName: 'Synthetic Consulting Company' },
            }),
          )
        ).id,
      );
      for (const path of [
        '/company-project-assignments',
        '/company-certification-reader-assignments',
        '/company-certification-programme-manager-assignments',
        '/company-certification-approver-assignments',
      ])
        await fixture.created(
          await fixture.call(CERTIFICATION_OWNER, path, {
            method: 'POST',
            company: null,
            body: {
              companyId: otherCompanyId,
              workspaceMembershipId: fixture.membership(CERTIFICATION_OWNER),
            },
          }),
        );
    }, 240_000);

    afterAll(async () => {
      await fixture?.close();
    });

    it('lets the Company administrator set and change the procedure deadline set with a readable history, scoped to the active Company', async () => {
      const empty = await read(
        CERTIFICATION_OWNER,
        '/certification-procedure-deadlines',
      );
      expect(empty).toEqual({ current: null, history: [] });
      // A certification member without the administration right is refused.
      const members: CertificationSubject[] = [
        CERTIFICATION_READER,
        CERTIFICATION_APPROVER,
      ];
      for (const subject of members) {
        expect(
          (await fixture.call(subject, '/certification-procedure-deadlines'))
            .status,
        ).toBe(403);
        expect(
          (
            await post(subject, '/certification-procedure-deadlines', {
              expectedVersion: 0,
              days: FICTIONAL,
            })
          ).status,
        ).toBe(403);
      }
      const key = randomUUID();
      const body = {
        expectedVersion: 0,
        days: { ...FICTIONAL, stage_plan_sent: 12 },
      };
      const first = await fixture.created(
        await post(
          CERTIFICATION_OWNER,
          '/certification-procedure-deadlines',
          body,
          {
            key,
          },
        ),
      );
      expect(first).toMatchObject({
        version: 1,
        days: { ...FICTIONAL, stage_plan_sent: 12 },
        configuredBy: { displayName: `Synthetic ${CERTIFICATION_OWNER}` },
      });
      // An exact retry answers the same version and records nothing.
      expect(
        await fixture.created(
          await post(
            CERTIFICATION_OWNER,
            '/certification-procedure-deadlines',
            body,
            { key },
          ),
        ),
      ).toEqual(first);
      expect(
        await refusal(
          await post(
            CERTIFICATION_OWNER,
            '/certification-procedure-deadlines',
            { ...body, days: FICTIONAL },
            { key },
          ),
        ),
      ).toMatchObject({ status: 409, code: 'IDEMPOTENCY_CONFLICT' });
      expect(
        await refusal(
          await post(
            CERTIFICATION_OWNER,
            '/certification-procedure-deadlines',
            {
              expectedVersion: 0,
              days: FICTIONAL,
            },
          ),
        ),
      ).toMatchObject({ status: 409, code: 'STALE_VERSION' });
      expect(
        await refusal(
          await post(
            CERTIFICATION_OWNER,
            '/certification-procedure-deadlines',
            {
              expectedVersion: 1,
              days: { ...FICTIONAL, stage_plan_sent: 12 },
            },
          ),
        ),
      ).toMatchObject({
        status: 409,
        code: 'CERTIFICATION_DEADLINES_UNCHANGED',
      });
      expect(
        (
          await post(
            CERTIFICATION_OWNER,
            '/certification-procedure-deadlines',
            {
              expectedVersion: 1,
              days: { ...FICTIONAL, stage_plan_sent: 366 },
            },
          )
        ).status,
      ).toBe(400);
      const changed = await configure(FICTIONAL);
      expect(changed).toMatchObject({ version: 2, days: FICTIONAL });
      const history = await read(
        CERTIFICATION_OWNER,
        '/certification-procedure-deadlines',
      );
      expect(history.current).toEqual(changed);
      expect(records(history.history).map((entry) => entry.days)).toEqual([
        FICTIONAL,
        { ...FICTIONAL, stage_plan_sent: 12 },
      ]);
      // One Company-scoped event per version, with closed metadata only.
      const harnessEvents = await fixture.procedureEvents(fixture.companyId);
      expect(harnessEvents).toEqual([
        {
          action: 'certification_procedure.deadlines_configured',
          version: 1,
          metadata: { version: 1 },
        },
        {
          action: 'certification_procedure.deadlines_configured',
          version: 2,
          metadata: { version: 2 },
        },
      ]);
      // The other Company has its own, still empty, set.
      expect(
        await read(
          CERTIFICATION_OWNER,
          '/certification-procedure-deadlines',
          otherCompanyId,
        ),
      ).toEqual({ current: null, history: [] });
    });

    it('records Exchange Records with every field and corrects them with a reason, deriving the deadline states', async () => {
      await configureFictional();
      const { caseId, base, plan1, plan2 } = await lactisCase();
      const questionnaire = await attach(caseId, 'correspondence');
      const before = await fixture.eventCount(caseId);
      const key = randomUUID();
      const received = {
        expectedRevision: await revision(base),
        ...exchange([questionnaire], {
          direction: 'received',
          itemKind: 'application',
          businessDate: '2026-09-01',
          reference: 'IN-1',
          note: 'Fictional questionnaire received by e-mail.',
        }),
      };
      const view = await fixture.created(
        await post(CERTIFICATION_OWNER, `${base}/exchanges`, received, { key }),
      );
      expect(records(section(view).records)).toEqual([
        {
          sequence: 1,
          current: expect.objectContaining({
            sequence: 1,
            version: 1,
            direction: 'received',
            itemKind: 'application',
            attachmentIds: [questionnaire],
            counterpart: CLIENT,
            businessDate: '2026-09-01',
            channel: 'email',
            reference: 'IN-1',
            note: 'Fictional questionnaire received by e-mail.',
            reason: null,
            recordedBy: expect.objectContaining({
              displayName: `Synthetic ${CERTIFICATION_OWNER}`,
            }),
          }),
          versions: [expect.objectContaining({ version: 1 })],
        },
      ]);
      // An exact retry answers the recorded Case and records nothing.
      expect(
        await fixture.created(
          await post(CERTIFICATION_OWNER, `${base}/exchanges`, received, {
            key,
          }),
        ),
      ).toEqual(view);
      expect(await fixture.eventCount(caseId)).toBe(before + 1);

      // The Stage 1 plan sent on S1 − 12 meets its deadline; the Stage 2
      // plan sent 7 days before its first day meets it late.
      await step(
        CERTIFICATION_OWNER,
        base,
        '/exchanges',
        exchange([plan1], { businessDate: '2026-09-17', reference: 'OUT-7' }),
      );
      await step(
        CERTIFICATION_OWNER,
        base,
        '/exchanges',
        exchange([plan2], { businessDate: '2026-10-13', reference: 'OUT-7' }),
      );
      // Both cover letters carry OUT-7 on different dates (R15).
      let current = await read(CERTIFICATION_READER, base);
      expect(records(record(current.consistency).open)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'R15', verdict: 'to_clarify' }),
        ]),
      );
      // The correction keeps the earlier version and needs a reason.
      const correction = exchange([plan1], {
        businessDate: '2026-09-19',
        reference: 'OUT-6',
      });
      expect(
        await refusal(
          await post(CERTIFICATION_OWNER, `${base}/exchanges/2`, {
            expectedRevision: await revision(base),
            ...correction,
          }),
        ),
      ).toMatchObject({ status: 409, code: 'CERTIFICATION_CORRECTION_REASON' });
      current = await step(CERTIFICATION_OWNER, base, '/exchanges/2', {
        ...correction,
        reason: 'Fictional: the cover letter is OUT-6, sent on S1 − 12.',
      });
      const corrected = records(section(current).records).find(
        (entry) => entry.sequence === 2,
      );
      expect(corrected).toMatchObject({
        current: {
          version: 2,
          businessDate: '2026-09-19',
          reference: 'OUT-6',
          reason: 'Fictional: the cover letter is OUT-6, sent on S1 − 12.',
        },
        versions: [
          expect.objectContaining({ version: 1, businessDate: '2026-09-17' }),
          expect.objectContaining({ version: 2, businessDate: '2026-09-19' }),
        ],
      });
      expect(
        records(record(current.consistency).open).filter(
          (entry) => entry.rule === 'R15',
        ),
      ).toEqual([]);
      expect(
        await refusal(
          await post(CERTIFICATION_OWNER, `${base}/exchanges/2`, {
            expectedRevision: await revision(base),
            ...correction,
            reason: 'Nothing changes.',
          }),
        ),
      ).toMatchObject({
        status: 409,
        code: 'CERTIFICATION_CORRECTION_UNCHANGED',
      });
      expect(
        (
          await post(CERTIFICATION_OWNER, `${base}/exchanges/9`, {
            expectedRevision: await revision(base),
            ...correction,
            reason: 'Unknown record.',
          })
        ).status,
      ).toBe(404);
      expect(record(section(current).deadlines)).toMatchObject({
        set: { version: expect.any(Number), days: FICTIONAL },
        entries: [
          {
            kind: 'stage_plan_sent',
            stage: 'stage_1',
            dueDate: '2026-09-21',
            state: 'met',
            record: { sequence: 2, version: 2, businessDate: '2026-09-19' },
          },
          {
            kind: 'stage_plan_sent',
            stage: 'stage_2',
            dueDate: '2026-10-10',
            state: 'met_late',
            record: { sequence: 3, businessDate: '2026-10-13' },
          },
          {
            kind: 'audit_dossier_transmitted',
            anchor: '2026-10-21',
            dueDate: '2026-11-10',
            state: 'due',
          },
          { kind: 'stage_2_report_released', state: null, dueDate: null },
        ],
      });
      // Each event carries its record version and closed codes only.
      const recorded = (await fixture.eventMetadata(caseId)).filter(
        (event) => event.action === 'certification_case.exchange_recorded',
      );
      expect(recorded.map((event) => event.metadata)).toEqual([
        expect.objectContaining({
          sequence: 1,
          version: 1,
          direction: 'received',
          itemKind: 'application',
          channel: 'email',
          counterpartKind: 'client',
        }),
        expect.objectContaining({ sequence: 2, version: 1 }),
        expect.objectContaining({ sequence: 3, version: 1 }),
        expect.objectContaining({ sequence: 2, version: 2 }),
      ]);
      for (const event of recorded)
        expect(Object.keys(record(event.metadata)).sort()).toEqual([
          'channel',
          'counterpartKind',
          'direction',
          'itemKind',
          'revision',
          'sequence',
          'version',
        ]);
      // A kind without a value produces no state.
      await configure({ ...FICTIONAL, audit_dossier_transmitted: null });
      expect(
        records(
          record(section(await read(CERTIFICATION_READER, base)).deadlines)
            .entries,
        ).map((entry) => entry.kind),
      ).toEqual([
        'stage_plan_sent',
        'stage_plan_sent',
        'stage_2_report_released',
      ]);
      await configure(FICTIONAL);
    });

    it('refuses an exchange through "other" without a note, a Version not attached to the Case, a date after today, and members other than the programme manager', async () => {
      const { caseId, base, plan1 } = await lactisCase();
      const elsewhere = await fixture.approvedTeamCase();
      const foreign = await attach(elsewhere, 'plan');
      const before = await fixture.eventCount(caseId);
      const expectedRevision = await revision(base);
      const refusals = [
        [
          exchange([plan1], { channel: 'other' }),
          400,
          'CERTIFICATION_EXCHANGE_NOTE_REQUIRED',
        ],
        [exchange([foreign]), 409, 'CERTIFICATION_ATTACHMENT_ROLE'],
        [
          exchange([plan1], { businessDate: '2026-11-09' }),
          409,
          'CERTIFICATION_EXCHANGE_IN_FUTURE',
        ],
        [
          exchange([plan1], {
            counterpart: { kind: 'client', name: 'x'.repeat(201) },
          }),
          400,
          'INVALID_CERTIFICATION_INPUT',
        ],
        [exchange([]), 400, 'INVALID_CERTIFICATION_INPUT'],
        [
          exchange([plan1], { channel: 'fax' }),
          400,
          'INVALID_CERTIFICATION_INPUT',
        ],
      ] as const;
      for (const [body, status, code] of refusals)
        expect(
          await refusal(
            await post(CERTIFICATION_OWNER, `${base}/exchanges`, {
              expectedRevision,
              ...body,
            }),
          ),
          code,
        ).toMatchObject({ status, code });
      // A date already reached somewhere (UTC+14) is not in the future.
      await step(
        CERTIFICATION_OWNER,
        base,
        '/exchanges',
        exchange([plan1], {
          channel: 'other',
          note: 'Fictional: handed over at the kick-off meeting.',
          businessDate: '2026-11-07',
        }),
      );
      expect(
        await refusal(
          await post(CERTIFICATION_OWNER, `${base}/exchanges`, {
            expectedRevision,
            ...exchange([plan1]),
          }),
        ),
      ).toMatchObject({ status: 409, code: 'STALE_VERSION' });
      const others: CertificationSubject[] = [
        CERTIFICATION_READER,
        CERTIFICATION_AUDITOR,
        CERTIFICATION_APPROVER,
      ];
      for (const subject of others)
        expect(
          (
            await post(subject, `${base}/exchanges`, {
              expectedRevision: await revision(base),
              ...exchange([plan1]),
            })
          ).status,
        ).toBe(403);
      expect(await fixture.eventCount(caseId)).toBe(before + 1);
    });

    it('raises R16 for the Stage 2 report sent before any decision and blocks the decision until an approver outside the team accepts it', async () => {
      await configureFictional();
      const { caseId, base, report2 } = await lactisCase();
      const sent = await step(
        CERTIFICATION_OWNER,
        base,
        '/exchanges',
        exchange([report2], {
          itemKind: 'stage_report',
          businessDate: '2026-10-28',
        }),
      );
      const r16 = records(record(sent.consistency).open).find(
        (entry) => entry.rule === 'R16',
      );
      expect(r16).toMatchObject({
        verdict: 'error',
        blocks: 'decision',
        left: { value: { kind: 'date', date: '2026-10-28' } },
        right: { value: { kind: 'state', state: 'not_recorded' } },
      });
      expect(
        records(record(section(sent).deadlines).entries).find(
          (entry) => entry.kind === 'stage_2_report_released',
        ),
      ).toMatchObject({
        state: 'sent_too_early',
        record: { sequence: 1, businessDate: '2026-10-28' },
      });
      await dossierReady(caseId, base);
      const before = await fixture.eventCount(caseId);
      const refused = await post(CERTIFICATION_APPROVER, `${base}/decision`, {
        expectedRevision: await revision(base),
        ...decision(),
      });
      expect(await refusal(refused)).toMatchObject({
        status: 409,
        code: 'CERTIFICATION_DECISION_PRECONDITIONS',
        failures: ['DISCREPANCIES_OPEN'],
        discrepancies: [{ id: r16?.id, rule: 'R16', verdict: 'error' }],
      });
      // Neither the programme manager nor the auditor on the team accepts
      // an error.
      expect(
        (
          await post(CERTIFICATION_OWNER, `${base}/discrepancy-resolutions`, {
            expectedRevision: await revision(base),
            discrepancyId: r16?.id,
            resolution: 'accepted',
            reason: 'Fictional.',
          })
        ).status,
      ).toBe(403);
      expect(await fixture.eventCount(caseId)).toBe(before);
      await step(CERTIFICATION_APPROVER, base, '/discrepancy-resolutions', {
        discrepancyId: r16?.id,
        resolution: 'accepted',
        reason: 'Fictional: the report was released early by mistake.',
      });
      const decided = await step(
        CERTIFICATION_APPROVER,
        base,
        '/decision',
        decision(),
      );
      expect(decided).toMatchObject({ nextStep: 'certificate' });
      // The acceptance holds once the decision exists.
      expect(
        records(record(decided.consistency).resolved).find(
          (entry) => entry.rule === 'R16',
        ),
      ).toMatchObject({
        id: r16?.id,
        resolution: { kind: 'accepted', via: 'acceptance' },
      });
      expect(
        records(record(section(decided).deadlines).entries).find(
          (entry) => entry.kind === 'stage_2_report_released',
        ),
      ).toMatchObject({ anchor: '2026-11-06', state: 'sent_too_early' });
    });

    it('records exchanges on certified and refused Cases', async () => {
      const certified = await lactisCase();
      await dossierReady(certified.caseId, certified.base);
      await step(
        CERTIFICATION_APPROVER,
        certified.base,
        '/decision',
        decision(),
      );
      await step(CERTIFICATION_APPROVER, certified.base, '/certificate', {
        number: `DEMO-${certified.caseId.slice(0, 8)}`,
        attachmentId: await attach(certified.caseId, 'certificate'),
        signedBy: 'Decision Maker Demo',
        signedByFunction: 'Head of the fictional body',
        independenceAttested: true,
      });
      const certificate = record(
        (await read(CERTIFICATION_OWNER, certified.base)).certificate,
      );
      const transmitted = await step(
        CERTIFICATION_OWNER,
        certified.base,
        '/exchanges',
        exchange([text(certificate.attachmentId)], {
          itemKind: 'certificate',
          channel: 'courier',
          businessDate: '2026-11-07',
        }),
      );
      expect(transmitted).toMatchObject({ status: 'certified' });
      expect(records(section(transmitted).records)).toHaveLength(1);
      expect(record(section(transmitted).reverification)).toMatchObject({
        firstSurveillanceBy: certificate.firstSurveillanceBy,
      });

      const refused = await lactisCase();
      await dossierReady(refused.caseId, refused.base);
      await step(
        CERTIFICATION_APPROVER,
        refused.base,
        '/decision',
        decision({
          decision: 'refused',
          grantedTexts: null,
          rationale: 'Fictional refusal.',
        }),
      );
      const informed = await step(
        CERTIFICATION_OWNER,
        refused.base,
        '/exchanges',
        exchange([refused.plan1], {
          itemKind: 'decision_form',
          businessDate: '2026-11-07',
        }),
      );
      expect(informed).toMatchObject({ status: 'refused' });
    });

    it('lists automatic and manual Re-verification Items, withdraws a manual one with a reason and adds one from an accepted Discrepancy', async () => {
      const { caseId, base, minor, plan1 } = await lactisCase();
      let view = await read(CERTIFICATION_READER, base);
      expect(records(record(section(view).reverification).items)).toEqual([
        expect.objectContaining({
          id: `finding:${minor}`,
          origin: 'automatic',
          status: 'open',
          source: expect.objectContaining({ kind: 'finding', sequence: 1 }),
        }),
      ]);
      const before = await fixture.eventCount(caseId);
      // The reader adds nothing; the auditor on the team and the approver
      // outside it do.
      expect(
        (
          await post(CERTIFICATION_READER, `${base}/reverification-items`, {
            expectedRevision: await revision(base),
            text: 'Fictional.',
          })
        ).status,
      ).toBe(403);
      expect(
        await refusal(
          await post(CERTIFICATION_AUDITOR, `${base}/reverification-items`, {
            expectedRevision: await revision(base),
            text: 'Fictional.',
            source: { findingId: randomUUID() },
          }),
        ),
      ).toMatchObject({
        status: 409,
        code: 'CERTIFICATION_REVERIFICATION_SOURCE_UNKNOWN',
      });
      await step(CERTIFICATION_AUDITOR, base, '/reverification-items', {
        text: 'Fictional: verify the allergen labels at dispatch.',
        source: { findingId: minor },
      });
      await step(CERTIFICATION_APPROVER, base, '/reverification-items', {
        text: 'Fictional: verify the cleaning plan display.',
        source: { attachmentId: plan1 },
      });
      view = await step(CERTIFICATION_OWNER, base, '/reverification-items', {
        text: 'Fictional item recorded by mistake.',
      });
      const items = records(record(section(view).reverification).items);
      expect(items.map((item) => [item.origin, item.sequence])).toEqual([
        ['automatic', null],
        ['manual', 1],
        ['manual', 2],
        ['manual', 3],
      ]);
      expect(items[2]).toMatchObject({
        source: { kind: 'attachment', attachmentId: plan1, versionNumber: 1 },
        addedBy: { displayName: `Synthetic ${CERTIFICATION_APPROVER}` },
      });
      const mistaken = text(items[3]?.id);
      // Only the programme manager withdraws, a manual item, with a reason.
      expect(
        (
          await post(
            CERTIFICATION_AUDITOR,
            `${base}/reverification-items/${mistaken}/withdrawal`,
            { expectedRevision: await revision(base), reason: 'Fictional.' },
          )
        ).status,
      ).toBe(403);
      expect(
        await refusal(
          await post(
            CERTIFICATION_OWNER,
            `${base}/reverification-items/finding:${minor}/withdrawal`,
            { expectedRevision: await revision(base), reason: 'Fictional.' },
          ),
        ),
      ).toMatchObject({
        status: 409,
        code: 'CERTIFICATION_REVERIFICATION_AUTOMATIC',
      });
      expect(
        (
          await post(
            CERTIFICATION_OWNER,
            `${base}/reverification-items/${mistaken}/withdrawal`,
            { expectedRevision: await revision(base) },
          )
        ).status,
      ).toBe(400);
      view = await step(
        CERTIFICATION_OWNER,
        base,
        `/reverification-items/${mistaken}/withdrawal`,
        { reason: 'Fictional: recorded by mistake.' },
      );
      expect(
        records(record(section(view).reverification).items)[3],
      ).toMatchObject({
        status: 'withdrawn',
        withdrawal: { reason: 'Fictional: recorded by mistake.' },
      });
      expect(
        await refusal(
          await post(
            CERTIFICATION_OWNER,
            `${base}/reverification-items/${mistaken}/withdrawal`,
            { expectedRevision: await revision(base), reason: 'Again.' },
          ),
        ),
      ).toMatchObject({
        status: 409,
        code: 'CERTIFICATION_REVERIFICATION_WITHDRAWN',
      });

      // An approver accepts a Discrepancy with the re-verification flag.
      const draft = await attach(caseId, 'other');
      const manual = records(
        record(
          (
            await step(CERTIFICATION_AUDITOR, base, '/discrepancies', {
              verdict: 'to_clarify',
              subject: 'Stage type',
              left: { value: 'Stage 1', attachmentId: draft, location: null },
              right: { value: 'Stage 2', attachmentId: plan1, location: null },
              note: null,
            })
          ).consistency,
        ).open,
      ).find((entry) => entry.origin === 'manual');
      view = await step(
        CERTIFICATION_APPROVER,
        base,
        '/discrepancy-resolutions',
        {
          discrepancyId: manual?.id,
          resolution: 'accepted',
          reason: 'Fictional: re-check the Stage type on the next audit.',
          reverify: true,
        },
      );
      expect(
        records(record(section(view).reverification).items)[4],
      ).toMatchObject({
        origin: 'discrepancy',
        sequence: 4,
        text: 'Fictional: re-check the Stage type on the next audit.',
        source: { kind: 'discrepancy', discrepancyId: manual?.id },
        status: 'open',
      });
      const events = await fixture.eventMetadata(caseId);
      expect(
        events.slice(-7).map((event) => [event.action, event.metadata]),
      ).toEqual([
        [
          'certification_case.reverification_item_added',
          expect.objectContaining({ origin: 'manual', source: 'finding' }),
        ],
        [
          'certification_case.reverification_item_added',
          expect.objectContaining({ origin: 'manual', source: 'attachment' }),
        ],
        [
          'certification_case.reverification_item_added',
          expect.objectContaining({ origin: 'manual', source: 'none' }),
        ],
        [
          'certification_case.reverification_item_withdrawn',
          expect.objectContaining({ origin: 'manual' }),
        ],
        ['certification_case.document_attached', expect.anything()],
        ['certification_case.discrepancy_recorded', expect.anything()],
        [
          'certification_case.discrepancy_resolved',
          expect.objectContaining({ reverification: 'added' }),
        ],
      ]);
      expect(
        events
          .map((event) => event.action)
          .filter((action) =>
            action.startsWith('certification_case.reverification'),
          ),
      ).toHaveLength(4);
      expect(await fixture.eventCount(caseId)).toBe(before + 7);
    });

    it('gives another Company the missing-Case denial for the register, its commands and the register PDF, and prints the register', async () => {
      await configureFictional();
      const { caseId, base, plan1 } = await lactisCase();
      await step(
        CERTIFICATION_OWNER,
        base,
        '/exchanges',
        exchange([plan1], { businessDate: '2026-09-19' }),
      );
      await step(CERTIFICATION_OWNER, base, '/reverification-items', {
        text: 'Fictional: verify the allergen labels at dispatch.',
      });
      const before = await fixture.eventCount(caseId);
      const expectedRevision = await revision(base);
      const missing = `/certification-cases/${randomUUID()}`;
      for (const target of [base, missing]) {
        for (const [path, body] of [
          ['/exchanges', exchange([plan1])],
          ['/exchanges/1', { ...exchange([plan1]), reason: 'Fictional.' }],
          ['/reverification-items', { text: 'Fictional.' }],
        ] as const)
          expect(
            (
              await post(
                CERTIFICATION_OWNER,
                `${target}${path}`,
                { expectedRevision, ...body },
                { company: otherCompanyId },
              )
            ).status,
            `${target}${path}`,
          ).toBe(404);
        expect(
          (
            await fixture.call(CERTIFICATION_OWNER, target, {
              company: otherCompanyId,
            })
          ).status,
        ).toBe(404);
        expect(
          (
            await fixture.call(CERTIFICATION_OWNER, `${target}/register`, {
              company: otherCompanyId,
            })
          ).status,
        ).toBe(404);
      }
      expect(await fixture.eventCount(caseId)).toBe(before);

      const response = await fixture.call(
        CERTIFICATION_READER,
        `${base}/register?language=en`,
      );
      expect(response.status).toBe(200);
      const content = compactPdfText(
        (
          await inspectCommercialPdf(
            new Uint8Array(await response.arrayBuffer()),
          )
        )
          .map((page) => page.text)
          .join('\n'),
      );
      for (const value of [
        'Exchanges and deadlines',
        'Stage plan sent to the client — Stage 1 — Met',
        'Stage plan sent to the client — Stage 2 — Overdue',
        'Exchange Record 1 — Sent — Stage plan',
        'Lactis Demo SRL, quality manager',
        'Re-verification Items',
        'Automatic Re-verification Item — Open',
        'Re-verification Item 1 — Open',
        'Fictional: verify the allergen labels at dispatch.',
      ])
        expect(content, value).toContain(compactPdfText(value));
    });

    async function configureFictional() {
      const current = await read(
        CERTIFICATION_OWNER,
        '/certification-procedure-deadlines',
      );
      const days =
        current.current === null ? null : record(record(current.current).days);
      if (
        days === null ||
        Object.entries(FICTIONAL).some(([kind, value]) => days[kind] !== value)
      )
        await configure(FICTIONAL);
    }
  },
);
