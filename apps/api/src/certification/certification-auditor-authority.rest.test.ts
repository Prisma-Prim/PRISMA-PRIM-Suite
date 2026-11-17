import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CERTIFICATION_APPROVER,
  CERTIFICATION_AUDITOR,
  CERTIFICATION_OWNER,
  CERTIFICATION_READER,
  openCertificationFixture,
  record,
} from './certification.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres('Certification auditor authority after recorded work', () => {
  let fixture: Awaited<ReturnType<typeof openCertificationFixture>>;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await openCertificationFixture({
      databaseUrl,
      namePrefix: 'certification1441',
      workspaceId: '00000000-0000-4000-8000-000000001441',
    });
  }, 240_000);

  afterAll(async () => {
    await fixture?.close();
  });

  async function reportedCase() {
    const caseId = await fixture.approvedTeamCase();
    const base = `/certification-cases/${caseId}`;
    const planAttachmentId = await fixture.attach(caseId, 'plan', 8);
    await fixture.created(
      await fixture.call(CERTIFICATION_OWNER, `${base}/stages/stage-1/plan`, {
        method: 'POST',
        body: {
          expectedRevision: 9,
          startDate: '2026-11-10',
          endDate: '2026-11-10',
          onSiteDays: '1',
          remoteDays: '0',
          objectives: 'Evaluate the fictional food safety system.',
          scope: 'Production of pasteurised milk and yoghurt',
          planAttachmentId,
          sentToClientOn: '2026-11-03',
          deviationNote: null,
        },
      }),
    );
    const reportAttachmentId = await fixture.attach(caseId, 'report', 10);
    const path = `${base}/stages/stage-1/report`;
    const key = randomUUID();
    const body = {
      expectedRevision: 11,
      reportDate: '2026-11-10',
      documentReviewCompleted: true,
      conclusion: 'ready',
      conclusionNote: 'Fictional Stage 1 completed; ready for Stage 2.',
      reportAttachmentId,
      participantListAttachmentId: null,
    };
    const reply = await fixture.created(
      await fixture.call(CERTIFICATION_AUDITOR, path, {
        method: 'POST',
        key,
        body,
      }),
    );
    expect(reply).toMatchObject({ revision: 12 });
    return { base, path, key, body, reply };
  }

  async function timeline(base: string) {
    const response = await fixture.call(
      CERTIFICATION_READER,
      `${base}/timeline`,
    );
    expect(response.status).toBe(200);
    return record(await response.json());
  }

  function opportunity(expectedRevision: number) {
    return {
      expectedRevision,
      stage: 'stage_1',
      classification: 'opportunity_for_improvement',
      clause: null,
      area: null,
      statement:
        'Consider electronic temperature records at the fictional site.',
      evidenceAttachmentIds: [],
    };
  }

  it('refuses report replay and new Findings after auditor revocation, then restores exact replay without duplicate history', async () => {
    const saved = await reportedCase();
    const history = await timeline(saved.base);
    const revoked = await fixture.call(
      CERTIFICATION_OWNER,
      `/company-certification-auditor-assignments/${fixture.membership(CERTIFICATION_AUDITOR)}/${fixture.companyId}`,
      { method: 'DELETE', company: null },
    );
    expect(revoked.status).toBe(200);

    const replay = await fixture.call(CERTIFICATION_AUDITOR, saved.path, {
      method: 'POST',
      key: saved.key,
      body: saved.body,
    });
    expect(replay.status).toBe(403);
    const deniedFinding = await fixture.call(
      CERTIFICATION_AUDITOR,
      `${saved.base}/findings`,
      { method: 'POST', body: opportunity(12) },
    );
    expect(deniedFinding.status).toBe(403);
    const readable = await fixture.call(CERTIFICATION_AUDITOR, saved.base);
    expect(readable.status).toBe(200);
    expect(record(await readable.json())).toMatchObject({ revision: 12 });
    expect(await timeline(saved.base)).toEqual(history);

    await fixture.grant(
      CERTIFICATION_AUDITOR,
      '/company-certification-auditor-assignments',
    );
    const restored = await fixture.created(
      await fixture.call(CERTIFICATION_AUDITOR, saved.path, {
        method: 'POST',
        key: saved.key,
        body: saved.body,
      }),
    );
    expect(restored).toEqual(saved.reply);
    expect(await timeline(saved.base)).toEqual(history);
    expect(
      await fixture.created(
        await fixture.call(CERTIFICATION_AUDITOR, `${saved.base}/findings`, {
          method: 'POST',
          body: opportunity(12),
        }),
      ),
    ).toMatchObject({ revision: 13 });
  });

  it('refuses new Findings by a replaced leader despite retained Company grants and permits the newly approved leader', async () => {
    const saved = await reportedCase();
    await fixture.grant(
      CERTIFICATION_READER,
      '/company-certification-auditor-assignments',
    );
    await fixture.created(
      await fixture.call(CERTIFICATION_OWNER, `${saved.base}/team`, {
        method: 'POST',
        body: {
          expectedRevision: 12,
          reason: 'Fictional team leader replacement after Stage 1.',
          members: [
            {
              name: 'Replacement Auditor Demo',
              role: 'team_leader',
              workspaceMembershipId: fixture.membership(CERTIFICATION_READER),
              holdsCategory: true,
              competenceNote: 'Fictional ISO 22000 lead auditor, category C.',
              declarations: {
                noConsultancy: 'confirmed',
                noEmployment: 'confirmed',
                noManagementInvolvement: 'confirmed',
                confidentiality: 'confirmed',
              },
              conflictNote: null,
            },
          ],
        },
      }),
    );
    await fixture.created(
      await fixture.call(
        CERTIFICATION_APPROVER,
        `${saved.base}/team-decision`,
        {
          method: 'POST',
          body: {
            expectedRevision: 13,
            teamVersion: 2,
            decision: 'approved',
            independenceAttested: true,
          },
        },
      ),
    );
    const history = await timeline(saved.base);
    const formerLeader = await fixture.call(
      CERTIFICATION_AUDITOR,
      `${saved.base}/findings`,
      { method: 'POST', body: opportunity(14) },
    );
    expect(formerLeader.status).toBe(409);
    expect(record(await formerLeader.json()).code).toBe(
      'CERTIFICATION_NOT_TEAM_LEADER',
    );
    expect(await timeline(saved.base)).toEqual(history);
    expect(
      await fixture.created(
        await fixture.call(CERTIFICATION_READER, `${saved.base}/findings`, {
          method: 'POST',
          body: opportunity(14),
        }),
      ),
    ).toMatchObject({ revision: 15 });
  });
});
