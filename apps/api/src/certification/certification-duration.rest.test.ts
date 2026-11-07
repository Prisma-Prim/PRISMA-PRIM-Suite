import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  CERTIFICATION_OWNER,
  CERTIFICATION_READER,
  applicationFacts,
  openCertificationFixture,
  record,
} from './certification.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

/** The fictional dairy: CI primary with three HACCP studies, 120 FTE. */
const DAIRY_FACTORS = {
  primary: 'CI',
  haccpStudies: { CI: 3 },
  increases: { interpreter: 10, onSiteLaboratory: 5 },
  reductions: { automation: 5 },
};
const DAIRY_AS_PROPOSED = {
  initialOnSite: '4.95',
  stage1OnSite: '1.75',
  stage2OnSite: '3.2',
  surveillanceOnSite: '1.65',
  recertificationOnSite: '3.3',
};

withPostgres('Certification Case duration determination', () => {
  let fixture: Awaited<ReturnType<typeof openCertificationFixture>>;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await openCertificationFixture({
      databaseUrl,
      namePrefix: 'certification1133',
      workspaceId: '00000000-0000-4000-8000-000000001133',
    });
  }, 240_000);

  afterAll(async () => {
    await fixture?.close();
  });

  it('proposes from the accepted application and confirms the proposal with its justified factors', async () => {
    const caseId = await fixture.acceptedCase();
    const proposal = await fixture.call(
      CERTIFICATION_OWNER,
      `/certification-cases/${caseId}/duration-proposal`,
      { method: 'POST', body: DAIRY_FACTORS },
    );
    expect(proposal.status).toBe(200);
    expect(await proposal.json()).toMatchObject({
      kind: 'proposal',
      proposal: {
        ruleVersion: 'iso22000-basic-2026-11',
        baseDays: '4.5',
        netAdjustmentPercent: 10,
        initialOnSite: '4.95',
        initialTotal: '5.94',
        stage1OnSite: '1.75',
        stage2OnSite: '3.2',
        surveillanceOnSite: '1.64835',
      },
    });
    const unjustified = await fixture.call(
      CERTIFICATION_OWNER,
      `/certification-cases/${caseId}/duration`,
      {
        method: 'POST',
        body: {
          expectedRevision: 3,
          inputs: DAIRY_FACTORS,
          confirmed: DAIRY_AS_PROPOSED,
        },
      },
    );
    expect(unjustified.status).toBe(400);
    expect(record(await unjustified.json()).code).toBe(
      'CERTIFICATION_DURATION_JUSTIFICATION_REQUIRED',
    );
    const confirmed = await fixture.created(
      await fixture.call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/duration`,
        {
          method: 'POST',
          body: {
            expectedRevision: 3,
            inputs: DAIRY_FACTORS,
            confirmed: DAIRY_AS_PROPOSED,
            justification:
              'Interpreter needed; in-house laboratory; automated lines.',
          },
        },
      ),
    );
    expect(confirmed).toMatchObject({
      revision: 4,
      nextStep: 'agreement',
      duration: {
        version: 1,
        value: {
          ruleVersion: 'iso22000-basic-2026-11',
          inputs: { subcategories: ['CI'], effectiveFte: 120, primary: 'CI' },
          computation: { kind: 'proposal' },
          confirmed: DAIRY_AS_PROPOSED,
        },
      },
    });
    expect(await fixture.eventCount(caseId)).toBe(4);
    const correction = await fixture.created(
      await fixture.call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/duration`,
        {
          method: 'POST',
          body: {
            expectedRevision: 4,
            reason: 'Stage 2 rounded to the quarter day for planning.',
            inputs: DAIRY_FACTORS,
            confirmed: {
              ...DAIRY_AS_PROPOSED,
              stage1OnSite: '1.75',
              stage2OnSite: '3.25',
              initialOnSite: '5',
            },
            justification: 'Quarter-day planning; factors as before.',
          },
        },
      ),
    );
    expect(correction).toMatchObject({
      revision: 5,
      duration: {
        version: 2,
        reason: 'Stage 2 rounded to the quarter day for planning.',
        value: { confirmed: { initialOnSite: '5', stage2OnSite: '3.25' } },
      },
    });
  });

  it('confirms an unadjusted proposal without a justification', async () => {
    const caseId = await fixture.acceptedCase(
      applicationFacts({
        haccpStudyCount: 1,
        effectiveFte: 10,
        totalHeadcount: 10,
      }),
    );
    const body = {
      expectedRevision: 3,
      inputs: {
        primary: 'CI',
        haccpStudies: { CI: 1 },
        increases: {},
        reductions: {},
      },
      confirmed: {
        initialOnSite: '2.5',
        stage1OnSite: '1',
        stage2OnSite: '1.5',
        surveillanceOnSite: '0.83',
        recertificationOnSite: '1.67',
      },
    };
    const key = randomUUID();
    const first = await fixture.created(
      await fixture.call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/duration`,
        { method: 'POST', body, key },
      ),
    );
    expect(first).toMatchObject({
      duration: { value: { justification: null } },
    });
    const retry = await fixture.created(
      await fixture.call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/duration`,
        { method: 'POST', body, key },
      ),
    );
    expect(retry).toEqual(first);
    expect(await fixture.eventCount(caseId)).toBe(4);
  });

  it('refuses before an accepted review, inconsistent inputs, stage sums and readers', async () => {
    const pending = await fixture.caseWithApplication();
    const early = await fixture.call(
      CERTIFICATION_OWNER,
      `/certification-cases/${pending}/duration-proposal`,
      { method: 'POST', body: DAIRY_FACTORS },
    );
    expect(early.status).toBe(409);
    const caseId = await fixture.acceptedCase();
    for (const [factors, refusal] of [
      [{ ...DAIRY_FACTORS, haccpStudies: { CI: 2 } }, 'HACCP_STUDIES_MISMATCH'],
      [{ ...DAIRY_FACTORS, primary: 'K', haccpStudies: { K: 3 } }, undefined],
      [
        { ...DAIRY_FACTORS, reductions: { systemMaturity: 15 } },
        'REDUCTION_FACTOR_CAP',
      ],
    ] as const) {
      const response = await fixture.call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/duration`,
        {
          method: 'POST',
          body: {
            expectedRevision: 3,
            inputs: factors,
            confirmed: DAIRY_AS_PROPOSED,
            justification: 'Test',
          },
        },
      );
      expect(response.status).toBe(400);
      const answer = record(await response.json());
      if (refusal) expect(answer.refusals).toContain(refusal);
    }
    const mismatch = await fixture.call(
      CERTIFICATION_OWNER,
      `/certification-cases/${caseId}/duration`,
      {
        method: 'POST',
        body: {
          expectedRevision: 3,
          inputs: DAIRY_FACTORS,
          confirmed: { ...DAIRY_AS_PROPOSED, stage2OnSite: '3' },
          justification: 'Test',
        },
      },
    );
    expect(record(await mismatch.json()).code).toBe(
      'CERTIFICATION_DURATION_STAGES_MISMATCH',
    );
    const reader = await fixture.call(
      CERTIFICATION_READER,
      `/certification-cases/${caseId}/duration`,
      {
        method: 'POST',
        body: {
          expectedRevision: 3,
          inputs: DAIRY_FACTORS,
          confirmed: DAIRY_AS_PROPOSED,
          justification: 'Test',
        },
      },
    );
    expect(reader.status).toBe(403);
    const readerProposal = await fixture.call(
      CERTIFICATION_READER,
      `/certification-cases/${caseId}/duration-proposal`,
      { method: 'POST', body: DAIRY_FACTORS },
    );
    expect(readerProposal.status).toBe(403);
    expect(await fixture.eventCount(caseId)).toBe(3);
  });

  it('requires a manual justified determination where the FTE band is ambiguous', async () => {
    const caseId = await fixture.acceptedCase(
      applicationFacts({ effectiveFte: 1200, totalHeadcount: 1250 }),
    );
    const proposal = await fixture.call(
      CERTIFICATION_OWNER,
      `/certification-cases/${caseId}/duration-proposal`,
      {
        method: 'POST',
        body: {
          primary: 'CI',
          haccpStudies: { CI: 3 },
          increases: {},
          reductions: {},
        },
      },
    );
    expect(await proposal.json()).toEqual({
      kind: 'manual',
      reason: 'FTE_BAND_AMBIGUOUS',
    });
    const body = {
      expectedRevision: 3,
      inputs: {
        primary: 'CI',
        haccpStudies: { CI: 3 },
        increases: {},
        reductions: {},
      },
      confirmed: {
        initialOnSite: '6.5',
        stage1OnSite: '2.25',
        stage2OnSite: '4.25',
        surveillanceOnSite: '2.25',
        recertificationOnSite: '4.5',
      },
    };
    const unjustified = await fixture.call(
      CERTIFICATION_OWNER,
      `/certification-cases/${caseId}/duration`,
      { method: 'POST', body },
    );
    expect(unjustified.status).toBe(400);
    expect(
      await fixture.created(
        await fixture.call(
          CERTIFICATION_OWNER,
          `/certification-cases/${caseId}/duration`,
          {
            method: 'POST',
            body: {
              ...body,
              justification: 'FTE band set by the certification body.',
            },
          },
        ),
      ),
    ).toMatchObject({
      duration: { value: { computation: { kind: 'manual' } } },
    });
  });
});
