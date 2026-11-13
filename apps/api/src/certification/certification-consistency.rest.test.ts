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

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected a list.');
  const items: unknown[] = value;
  return items.map(record);
}

withPostgres(
  'Certification Case dossier consistency',
  { timeout: 120_000 },
  () => {
    let fixture: Awaited<ReturnType<typeof openCertificationFixture>>;
    let otherCompanyId = '';

    async function read(subject: CertificationSubject, path: string) {
      const response = await fixture.call(subject, path);
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
      key?: string,
    ) {
      return fixture.call(subject, path, { method: 'POST', body, key });
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
    async function attach(caseId: string, role: string) {
      return fixture.attach(
        caseId,
        role,
        await revision(`/certification-cases/${caseId}`),
      );
    }
    function plan(
      attachmentId: string,
      start: string,
      end: string,
      days: string,
    ) {
      return {
        startDate: start,
        endDate: end,
        onSiteDays: days,
        remoteDays: '0',
        objectives: 'Fictional objectives',
        scope: 'Production of pasteurised milk (fictional)',
        planAttachmentId: attachmentId,
        sentToClientOn: null,
        deviationNote: null,
      };
    }
    function consistency(view: Record<string, unknown>) {
      return record(view.consistency);
    }
    function open(view: Record<string, unknown>) {
      return records(consistency(view).open);
    }
    function resolved(view: Record<string, unknown>) {
      return records(consistency(view).resolved);
    }
    function ruleOf(list: Record<string, unknown>[], rule: string) {
      const found = list.find((entry) => entry.rule === rule);
      if (!found) throw new Error(`No ${rule} Discrepancy.`);
      return found;
    }
    async function events(caseId: string) {
      const result = await fixture.call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}`,
      );
      expect(result.status).toBe(200);
      return fixture.eventCount(caseId);
    }

    /**
     * The fictional Lactis Demo SRL Case of the dossier control PRD: 40
     * employees, 2 HACCP studies, 3 auditor-days, Ion Popa (the auditor
     * member) leading with a technical expert, both Stages planned; Stage 2
     * over `stage2End`.
     */
    async function lactisCase(stage2End = '2026-10-21') {
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
      await step(
        CERTIFICATION_OWNER,
        base,
        '/stages/stage-1/plan',
        plan(await attach(caseId, 'plan'), '2026-10-01', '2026-10-01', '1'),
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
        plan(plan2, '2026-10-20', stage2End, '2'),
      );
      return { caseId, base, plan2 };
    }
    async function reported(base: string, caseId: string) {
      await step(CERTIFICATION_AUDITOR, base, '/stages/stage-2/report', {
        reportDate: '2026-10-21',
        summary: 'Fictional Stage 2 completed.',
        reportAttachmentId: await attach(caseId, 'report'),
      });
      await step(CERTIFICATION_AUDITOR, base, '/recommendation', {
        recommendation: 'grant',
        basis: 'Fictional system effectively implemented.',
      });
    }
    function review(answers: Record<string, string> = {}) {
      return {
        items: Object.fromEntries(
          ITEMS.map((item) => {
            const answer =
              answers[item] ??
              (item === 'participant_lists' || item === 'findings_follow_up'
                ? 'not_applicable'
                : 'present');
            return [
              item,
              {
                answer,
                note: answer === 'missing' ? 'Fictional note.' : null,
              },
            ];
          }),
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
    function resolution(
      expectedRevision: number,
      discrepancyId: unknown,
      overrides: Record<string, unknown> = {},
    ) {
      return {
        expectedRevision,
        discrepancyId,
        resolution: 'accepted',
        reason: 'Fictional reason agreed with the client.',
        ...overrides,
      };
    }

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await openCertificationFixture({
        databaseUrl,
        namePrefix: 'certification1292',
        workspaceId: '00000000-0000-4000-8000-000000001292',
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

    it('reads no Discrepancy for the consistent Case, then each raised one with its verdict, values and sources, and its correction', async () => {
      const { caseId, base } = await lactisCase();
      const clean = await read(CERTIFICATION_READER, base);
      expect(consistency(clean)).toEqual({
        ruleSetVersion: 'dossier-consistency-2026-11.3',
        counts: { critical: 0, error: 0, toClarify: 0 },
        open: [],
        resolved: [],
        resolvedTotal: 0,
      });

      // R01: the headcount moves from 40 to 60, the next band.
      await step(CERTIFICATION_OWNER, base, '/application', {
        reason: 'The client corrected its headcount to 60.',
        facts: applicationFacts({
          haccpStudyCount: 2,
          totalHeadcount: 60,
          effectiveFte: 60,
        }),
      });
      const raised = await read(CERTIFICATION_READER, base);
      expect(consistency(raised).counts).toEqual({
        critical: 0,
        error: 1,
        toClarify: 0,
      });
      expect(ruleOf(open(raised), 'R01')).toMatchObject({
        origin: 'rule',
        verdict: 'error',
        status: 'open',
        blocks: 'decision',
        subject: { kind: 'duration_proposal' },
        left: {
          value: { kind: 'days', days: '3.5' },
          source: { kind: 'step', step: 'application', version: 2 },
        },
        right: {
          value: { kind: 'days', days: '3' },
          source: { kind: 'step', step: 'duration', version: 1 },
        },
        opened: { by: { displayName: `Synthetic ${CERTIFICATION_OWNER}` } },
      });
      // R04: Stage 2 over one calendar day with one auditor on site.
      const plan2 = await attach(caseId, 'plan');
      await step(CERTIFICATION_OWNER, base, '/stages/stage-2/plan', {
        reason: 'Stage 2 shortened to one calendar day.',
        ...plan(plan2, '2026-10-20', '2026-10-20', '2'),
      });
      const capacity = ruleOf(
        open(await read(CERTIFICATION_READER, base)),
        'R04',
      );
      expect(capacity).toMatchObject({
        verdict: 'to_clarify',
        blocks: null,
        subject: { kind: 'stage_capacity', stage: 'stage_2' },
        left: {
          value: { kind: 'days', days: '2' },
          source: {
            kind: 'step',
            step: 'stage_2_plan',
            version: 2,
            attachment: { attachmentId: plan2, versionNumber: 1 },
          },
        },
        right: { value: { kind: 'capacity', calendarDays: 1, auditors: 1 } },
      });

      // A new duration on the corrected application closes R01 as corrected.
      await step(CERTIFICATION_OWNER, base, '/duration', {
        reason: 'Recomputed for 60 employees; 3 auditor-days kept.',
        inputs: INPUTS,
        confirmed: CONFIRMED,
        justification: 'Fictional single site; the band change is absorbed.',
      });
      const corrected = await read(CERTIFICATION_READER, base);
      expect(open(corrected).map((entry) => entry.rule)).toEqual(['R04']);
      expect(ruleOf(resolved(corrected), 'R01')).toMatchObject({
        status: 'resolved',
        resolution: {
          kind: 'corrected',
          via: 'record',
          reason: 'Recomputed for 60 employees; 3 auditor-days kept.',
          source: { kind: 'step', step: 'duration', version: 2 },
        },
      });
    });

    it('accepts per verdict and bundle with a reason, keeps the acceptance on the same values and raises new values again', async () => {
      const { caseId, base } = await lactisCase('2026-10-20');
      const r04 = ruleOf(open(await read(CERTIFICATION_OWNER, base)), 'R04');
      const path = `${base}/discrepancy-resolutions`;
      const before = await events(caseId);
      const current = await revision(base);
      // The reader and the auditor without the manager or approver bundle.
      expect(
        (await post(CERTIFICATION_READER, path, resolution(current, r04.id)))
          .status,
      ).toBe(403);
      expect(
        (await post(CERTIFICATION_AUDITOR, path, resolution(current, r04.id)))
          .status,
      ).toBe(403);
      const unexplained = await post(
        CERTIFICATION_OWNER,
        path,
        resolution(current, r04.id, { reason: '   ' }),
      );
      expect(unexplained.status).toBe(400);
      const stale = await post(
        CERTIFICATION_OWNER,
        path,
        resolution(current - 1, r04.id),
      );
      expect(stale.status).toBe(409);
      expect(record(await stale.json()).code).toBe('STALE_VERSION');
      const notOpen = await post(
        CERTIFICATION_OWNER,
        path,
        resolution(current, `R04:${'0'.repeat(32)}`),
      );
      expect(record(await notOpen.json()).code).toBe(
        'CERTIFICATION_DISCREPANCY_NOT_OPEN',
      );
      const byRecord = await post(
        CERTIFICATION_OWNER,
        path,
        resolution(current, r04.id, {
          resolution: 'corrected',
          correctedBy: { stepVersionId: randomUUID() },
        }),
      );
      expect(record(await byRecord.json()).code).toBe(
        'CERTIFICATION_DISCREPANCY_CORRECTED_BY_RECORD',
      );
      expect(await events(caseId)).toBe(before);

      // The programme manager accepts "to clarify"; a replay records nothing.
      const key = randomUUID();
      const accepted = await post(
        CERTIFICATION_OWNER,
        path,
        resolution(current, r04.id),
        key,
      );
      expect(accepted.status).toBe(201);
      const acceptedView = record(await accepted.json());
      expect(open(acceptedView)).toEqual([]);
      expect(ruleOf(resolved(acceptedView), 'R04')).toMatchObject({
        id: r04.id,
        resolution: {
          kind: 'accepted',
          via: 'acceptance',
          reason: 'Fictional reason agreed with the client.',
          by: { displayName: `Synthetic ${CERTIFICATION_OWNER}` },
          ruleSetVersion: 'dossier-consistency-2026-11.3',
        },
      });
      const replay = await post(
        CERTIFICATION_OWNER,
        path,
        resolution(current, r04.id),
        key,
      );
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(acceptedView);
      expect(await events(caseId)).toBe(before + 1);

      // A reload and new versions keeping the values keep it resolved.
      const sameValues = await attach(caseId, 'plan');
      await step(CERTIFICATION_OWNER, base, '/stages/stage-2/plan', {
        reason: 'Stage 2 moved to another day; plan PDF signed again.',
        ...plan(sameValues, '2026-10-22', '2026-10-22', '2'),
      });
      expect(open(await read(CERTIFICATION_READER, base))).toEqual([]);
      // New values raise a new Discrepancy; the acceptance stays in history.
      // (The plan justifies its deviation from the Stage 2 share: R03 is
      // accepted with that justification, never open.)
      await step(CERTIFICATION_OWNER, base, '/stages/stage-2/plan', {
        reason: 'Stage 2 shortened.',
        ...plan(sameValues, '2026-10-22', '2026-10-22', '1.5'),
        deviationNote: 'Fictional: the client closes at noon.',
      });
      const changed = await read(CERTIFICATION_READER, base);
      expect(open(changed)).toEqual([
        expect.objectContaining({
          rule: 'R04',
          left: expect.objectContaining({
            value: { kind: 'days', days: '1.5' },
          }),
        }),
      ]);
      expect(open(changed)[0]?.id).not.toBe(r04.id);
      expect(ruleOf(resolved(changed), 'R03')).toMatchObject({
        resolution: {
          kind: 'accepted',
          via: 'justification',
          reason: 'Fictional: the client closes at noon.',
        },
      });
      expect(
        resolved(changed).find((entry) => entry.id === r04.id),
      ).toMatchObject({ resolution: { kind: 'accepted', via: 'acceptance' } });
      // Values returning to the accepted pair are accepted again, even after
      // a new team version that keeps one auditor on site.
      await step(CERTIFICATION_OWNER, base, '/stages/stage-2/plan', {
        reason: 'Back to the full day.',
        ...plan(sameValues, '2026-10-22', '2026-10-22', '2'),
      });
      await step(CERTIFICATION_OWNER, base, '/team', {
        reason: 'The expert leaves; the leader holds the category.',
        members: [
          {
            name: 'Ion Popa',
            role: 'team_leader',
            workspaceMembershipId: fixture.membership(CERTIFICATION_AUDITOR),
            holdsCategory: true,
            competenceNote: 'Fictional lead auditor holding the category',
            declarations: DECLARED,
            conflictNote: null,
          },
        ],
      });
      expect(open(await read(CERTIFICATION_READER, base))).toEqual([]);
    });

    it('lets only an approver outside the team accept an error, and never a critical Discrepancy', async () => {
      const { caseId, base } = await lactisCase();
      await step(CERTIFICATION_OWNER, base, '/application', {
        reason: 'Headcount corrected to 60.',
        facts: applicationFacts({
          haccpStudyCount: 2,
          totalHeadcount: 60,
          effectiveFte: 60,
        }),
      });
      const r01 = ruleOf(open(await read(CERTIFICATION_OWNER, base)), 'R01');
      const path = `${base}/discrepancy-resolutions`;
      const manager = await post(
        CERTIFICATION_OWNER,
        path,
        resolution(await revision(base), r01.id),
      );
      expect(manager.status).toBe(403);
      // The team leader also holds the approver bundle: his team link refuses.
      await fixture.grant(
        CERTIFICATION_AUDITOR,
        '/company-certification-approver-assignments',
      );
      const onTeam = await post(
        CERTIFICATION_AUDITOR,
        path,
        resolution(await revision(base), r01.id),
      );
      expect(onTeam.status).toBe(409);
      expect(record(await onTeam.json()).code).toBe(
        'CERTIFICATION_INDEPENDENCE',
      );
      const accepted = await post(
        CERTIFICATION_APPROVER,
        path,
        resolution(await revision(base), r01.id, {
          reason: 'Fictional: the certification body keeps 3 auditor-days.',
        }),
      );
      expect(accepted.status).toBe(201);
      expect(
        ruleOf(resolved(record(await accepted.json())), 'R01'),
      ).toMatchObject({
        resolution: {
          kind: 'accepted',
          by: { displayName: `Synthetic ${CERTIFICATION_APPROVER}` },
        },
      });

      // R08: "Certificate data" answered present while none is recorded.
      await reported(base, caseId);
      await step(CERTIFICATION_APPROVER, base, '/dossier-review', review());
      const r08 = ruleOf(open(await read(CERTIFICATION_OWNER, base)), 'R08');
      expect(r08).toMatchObject({
        verdict: 'critical',
        blocks: 'decision',
        subject: { kind: 'dossier_item', item: 'certificate_data' },
        left: { value: { kind: 'state', state: 'present' } },
        right: { value: { kind: 'state', state: 'not_recorded' } },
      });
      const critical = await post(
        CERTIFICATION_APPROVER,
        path,
        resolution(await revision(base), r08.id),
      );
      expect(critical.status).toBe(409);
      expect(record(await critical.json()).code).toBe(
        'CERTIFICATION_DISCREPANCY_CRITICAL',
      );
    });

    it('records a manual Discrepancy and resolves one as corrected, another as accepted', async () => {
      const { caseId, base } = await lactisCase();
      const draft = await attach(caseId, 'other');
      const signed = await attach(caseId, 'report');
      const path = `${base}/discrepancies`;
      const body = {
        verdict: 'to_clarify',
        subject: 'Stage type',
        left: { value: 'Stage 1', attachmentId: draft, location: 'page 1' },
        right: { value: 'Stage 2', attachmentId: signed, location: 'page 1' },
        note: 'Editable draft against the signed report.',
      };
      const before = await events(caseId);
      expect(
        (
          await post(CERTIFICATION_READER, path, {
            expectedRevision: await revision(base),
            ...body,
          })
        ).status,
      ).toBe(403);
      const foreign = await post(CERTIFICATION_AUDITOR, path, {
        expectedRevision: await revision(base),
        ...body,
        right: { ...body.right, attachmentId: randomUUID() },
      });
      expect(record(await foreign.json()).code).toBe(
        'CERTIFICATION_ATTACHMENT_ROLE',
      );
      expect(await events(caseId)).toBe(before);
      // The auditor on the team records it.
      const recorded = await step(
        CERTIFICATION_AUDITOR,
        base,
        '/discrepancies',
        body,
      );
      expect(await events(caseId)).toBe(before + 1);
      const manual = open(recorded).find((entry) => entry.origin === 'manual');
      expect(manual).toMatchObject({
        id: expect.stringMatching(/^manual:/u),
        sequence: 1,
        verdict: 'to_clarify',
        subject: { kind: 'manual', text: 'Stage type' },
        note: 'Editable draft against the signed report.',
        left: {
          value: { kind: 'text', text: 'Stage 1' },
          detail: 'page 1',
          source: { kind: 'attachment', attachment: { attachmentId: draft } },
        },
        right: { value: { kind: 'text', text: 'Stage 2' } },
        opened: { by: { displayName: `Synthetic ${CERTIFICATION_AUDITOR}` } },
      });
      // The approver accepts it with the reason.
      const accepted = await step(
        CERTIFICATION_APPROVER,
        base,
        '/discrepancy-resolutions',
        {
          discrepancyId: manual?.id,
          resolution: 'accepted',
          reason:
            'The signed PDF prevails; the editable draft is not part of the dossier.',
        },
      );
      expect(resolved(accepted)).toEqual([
        expect.objectContaining({
          id: manual?.id,
          origin: 'manual',
          resolution: expect.objectContaining({ kind: 'accepted' }),
        }),
      ]);

      // An error one, closed as corrected by naming the correcting record.
      const second = await step(CERTIFICATION_OWNER, base, '/discrepancies', {
        ...body,
        verdict: 'error',
        subject: 'On-site days',
        note: null,
      });
      const error = open(second).find((entry) => entry.sequence === 2);
      expect(error).toMatchObject({ verdict: 'error', blocks: 'decision' });
      const steps = records(
        (await read(CERTIFICATION_OWNER, `${base}/timeline`)).entries,
      );
      const stage2Plan = steps
        .filter((entry) => entry.step === 'stage_2_plan')
        .at(-1);
      const unknown = await post(
        CERTIFICATION_OWNER,
        `${base}/discrepancy-resolutions`,
        {
          expectedRevision: await revision(base),
          discrepancyId: error?.id,
          resolution: 'corrected',
          reason: 'Fictional correction.',
          correctedBy: { stepVersionId: randomUUID() },
        },
      );
      expect(record(await unknown.json()).code).toBe(
        'CERTIFICATION_CORRECTING_RECORD_UNKNOWN',
      );
      const corrected = await step(
        CERTIFICATION_OWNER,
        base,
        '/discrepancy-resolutions',
        {
          discrepancyId: error?.id,
          resolution: 'corrected',
          reason: 'The plan states the agreed days.',
          correctedBy: { stepVersionId: stage2Plan?.id },
        },
      );
      expect(
        resolved(corrected).find((entry) => entry.id === error?.id),
      ).toMatchObject({
        resolution: {
          kind: 'corrected',
          via: 'resolution',
          reason: 'The plan states the agreed days.',
          source: { kind: 'step', step: 'stage_2_plan' },
        },
      });
      expect(open(corrected)).toEqual([]);
    });

    it('refuses the decision while a critical or unaccepted error is open, naming them, and the Certificate the same way after it', async () => {
      const { caseId, base } = await lactisCase();
      await reported(base, caseId);
      await step(CERTIFICATION_APPROVER, base, '/dossier-review', review());
      const before = await events(caseId);
      const refused = await post(CERTIFICATION_APPROVER, `${base}/decision`, {
        expectedRevision: await revision(base),
        ...decision(),
      });
      expect(refused.status).toBe(409);
      const refusal = record(await refused.json());
      expect(refusal).toMatchObject({
        code: 'CERTIFICATION_DECISION_PRECONDITIONS',
        failures: ['CERTIFICATE_DATA_MISSING', 'DISCREPANCIES_OPEN'],
        discrepancies: [
          {
            id: expect.stringMatching(/^R08:/u),
            rule: 'R08',
            verdict: 'critical',
          },
        ],
      });
      expect(await events(caseId)).toBe(before);

      // The data are recorded and the review covers them; a decision dated
      // before the dossier review's approval is still refused (R05).
      await step(CERTIFICATION_OWNER, base, '/certificate-data', {
        texts: [TEXT],
        agreedOn: '2026-10-25',
        agreementAttachmentId: await attach(caseId, 'certificate_data'),
      });
      await step(CERTIFICATION_APPROVER, base, '/dossier-review', {
        ...review(),
        reason: 'The Certificate data are now recorded.',
        approvedBy: {
          actedBy: 'Head of Body Demo',
          actedByFunction: 'Head of the fictional body',
          actedOn: '2026-11-04',
          formAttachmentId: null,
        },
      });
      const early = await post(CERTIFICATION_APPROVER, `${base}/decision`, {
        expectedRevision: await revision(base),
        ...decision({ decidedOn: '2026-11-03' }),
      });
      expect(record(await early.json())).toMatchObject({
        failures: ['DISCREPANCIES_OPEN'],
        discrepancies: [{ rule: 'R05', verdict: 'error' }],
      });
      await step(CERTIFICATION_APPROVER, base, '/decision', decision());

      // After the decision, an open manual error holds the draft approval.
      const draft = await attach(caseId, 'other');
      const signed = await attach(caseId, 'certificate');
      const manual = await step(CERTIFICATION_OWNER, base, '/discrepancies', {
        verdict: 'error',
        subject: 'Scope wording',
        left: { value: 'Milk', attachmentId: draft, location: null },
        right: {
          value: 'Milk and yoghurt',
          attachmentId: signed,
          location: null,
        },
        note: null,
      });
      const blocking = open(manual).find((entry) => entry.origin === 'manual');
      expect(blocking).toMatchObject({ blocks: 'certificate_draft_approval' });
      const current = await read(CERTIFICATION_OWNER, base);
      const recordedDraft = await step(
        CERTIFICATION_OWNER,
        base,
        '/certificate-draft',
        {
          attachmentId: await attach(caseId, 'certificate_draft'),
          number: `DEMO-${caseId.slice(0, 8)}`,
          draftedOn: '2026-11-06',
          decisionVersionId: record(current.decision).id,
          certificateDataVersionId: record(current.certificateData).id,
        },
      );
      const draftVersionId = record(recordedDraft.release).currentDraftId;
      await step(CERTIFICATION_OWNER, base, '/client-opinion', {
        draftVersionId,
        outcome: 'skipped',
        skipReason: 'texts_already_agreed',
        businessDate: '2026-11-06',
        note: null,
      });
      const approval = {
        draftVersionId,
        approvedOn: '2026-11-06',
        textsConfirmed: true,
        numberConfirmed: true,
        validityConfirmed: true,
        independenceAttested: true,
      };
      const held = await post(
        CERTIFICATION_APPROVER,
        `${base}/certificate-draft-approval`,
        { expectedRevision: await revision(base), ...approval },
      );
      expect(held.status).toBe(409);
      expect(record(await held.json())).toMatchObject({
        code: 'CERTIFICATION_DRAFT_APPROVAL_PRECONDITIONS',
        failures: ['discrepancies_open'],
      });
      await step(CERTIFICATION_APPROVER, base, '/discrepancy-resolutions', {
        discrepancyId: blocking?.id,
        resolution: 'accepted',
        reason: 'Fictional: the signed Certificate states the decided scope.',
      });
      await step(
        CERTIFICATION_APPROVER,
        base,
        '/certificate-draft-approval',
        approval,
      );
      expect(
        await step(CERTIFICATION_APPROVER, base, '/certificate', {
          number: `DEMO-${caseId.slice(0, 8)}`,
          issuedOn: '2026-11-06',
          attachmentId: signed,
          signedBy: 'Decision Maker Demo',
          signedByFunction: 'Head of the fictional body',
          independenceAttested: true,
        }),
      ).toMatchObject({ status: 'certified' });
    });

    it('lists the open and resolved Discrepancies in the dossier register PDF', async () => {
      const { caseId, base } = await lactisCase('2026-10-20');
      const draft = await attach(caseId, 'other');
      const signed = await attach(caseId, 'report');
      const manual = open(
        await step(CERTIFICATION_AUDITOR, base, '/discrepancies', {
          verdict: 'to_clarify',
          subject: 'Stage type',
          left: { value: 'Stage 1', attachmentId: draft, location: 'page 1' },
          right: { value: 'Stage 2', attachmentId: signed, location: null },
          note: null,
        }),
      ).find((entry) => entry.origin === 'manual');
      await step(CERTIFICATION_APPROVER, base, '/discrepancy-resolutions', {
        discrepancyId: manual?.id,
        resolution: 'accepted',
        reason: 'The signed PDF prevails over the editable draft.',
      });
      const before = await fixture.eventCount(caseId);
      const response = await fixture.call(
        CERTIFICATION_READER,
        `${base}/register?language=en`,
      );
      expect(response.status).toBe(200);
      const text = compactPdfText(
        (
          await inspectCommercialPdf(
            new Uint8Array(await response.arrayBuffer()),
          )
        )
          .map((page) => page.text)
          .join('\n'),
      );
      for (const value of [
        'Dossier consistency',
        'Rule set: dossier-consistency-2026-11.3. Open: 0 critical, 0 error, 1 to clarify',
        'R04 — Stage plan days against calendar days and auditors on site — To clarify — Open',
        '2 auditor-days',
        '1 calendar day(s) × 1 auditor(s)',
        'Manual Discrepancy 1 — Stage type — To clarify — Resolved',
        'Stage 1 (page 1)',
        'The signed PDF prevails over the editable draft.',
      ])
        expect(text, value).toContain(compactPdfText(value));
      expect(await fixture.eventCount(caseId)).toBe(before);
    });

    it('records each Discrepancy event in its transaction with closed codes and denies another Company like a missing Case', async () => {
      const { caseId, base } = await lactisCase('2026-10-20');
      const draft = await attach(caseId, 'other');
      const signed = await attach(caseId, 'report');
      await step(CERTIFICATION_AUDITOR, base, '/discrepancies', {
        verdict: 'critical',
        subject: 'Secret subject',
        left: { value: 'Secret left', attachmentId: draft, location: 'p. 2' },
        right: { value: 'Secret right', attachmentId: signed, location: null },
        note: 'Secret note',
      });
      const r04 = ruleOf(open(await read(CERTIFICATION_OWNER, base)), 'R04');
      await step(CERTIFICATION_OWNER, base, '/discrepancy-resolutions', {
        discrepancyId: r04.id,
        resolution: 'accepted',
        reason: 'Secret reason',
      });
      const timeline = await fixture.eventMetadata(caseId);
      expect(timeline.slice(-2)).toEqual([
        {
          action: 'certification_case.discrepancy_recorded',
          metadata: {
            revision: timeline.at(-2)?.revision,
            verdict: 'critical',
          },
          revision: timeline.at(-2)?.revision,
        },
        {
          action: 'certification_case.discrepancy_resolved',
          metadata: {
            revision: timeline.at(-1)?.revision,
            rule: 'R04',
            verdict: 'to_clarify',
            resolution: 'accepted',
          },
          revision: timeline.at(-1)?.revision,
        },
      ]);
      expect(JSON.stringify(timeline)).not.toMatch(/Secret/u);

      // Another Company: the read and both commands answer like a missing Case.
      const missing = randomUUID();
      const commands: [string, Record<string, unknown> | undefined][] = [
        ['', undefined],
        [
          '/discrepancies',
          {
            expectedRevision: 1,
            verdict: 'error',
            subject: 'Fictional subject',
            left: { value: 'A', attachmentId: draft, location: null },
            right: { value: 'B', attachmentId: signed, location: null },
            note: null,
          },
        ],
        [
          '/discrepancy-resolutions',
          {
            expectedRevision: 1,
            discrepancyId: r04.id,
            resolution: 'accepted',
            reason: 'Fictional reason.',
          },
        ],
      ];
      for (const [path, body] of commands) {
        const options =
          body === undefined
            ? { company: otherCompanyId }
            : { company: otherCompanyId, method: 'POST', body };
        const hidden = await fixture.call(
          CERTIFICATION_OWNER,
          `/certification-cases/${caseId}${path}`,
          options,
        );
        const absent = await fixture.call(
          CERTIFICATION_OWNER,
          `/certification-cases/${missing}${path}`,
          options,
        );
        expect(hidden.status).toBe(404);
        expect(absent.status).toBe(404);
        expect(await hidden.json()).toEqual(await absent.json());
      }
      const register = await fixture.call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/register`,
        { company: otherCompanyId },
      );
      expect(register.status).toBe(404);
    });
  },
);
