import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  CERTIFICATION_OWNER,
  CERTIFICATION_READER,
  SYNTHETIC_PDF,
  applicationFacts,
  openCertificationFixture,
  record,
  text,
} from './certification.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres('Certification Case signed originals and agreement', { timeout: 60_000 }, () => {
  let fixture: Awaited<ReturnType<typeof openCertificationFixture>>;

  /** A Case whose small application is accepted and duration confirmed (revision 4). */
  async function caseReadyForAgreement() {
    const caseId = await fixture.acceptedCase(
      applicationFacts({
        haccpStudyCount: 1,
        effectiveFte: 10,
        totalHeadcount: 10,
      }),
    );
    await fixture.created(
      await fixture.call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/duration`,
        {
          method: 'POST',
          body: {
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
          },
        },
      ),
    );
    return caseId;
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await openCertificationFixture({
      databaseUrl,
      namePrefix: 'certification1134',
      workspaceId: '00000000-0000-4000-8000-000000001134',
    });
  }, 240_000);

  afterAll(async () => {
    await fixture?.close();
  });

  it('attaches an exact signed original, lists it, opens its bytes and records the agreement', async () => {
    const caseId = await caseReadyForAgreement();
    const source = await fixture.receivedSource(
      'Signed certification agreement',
    );
    const eligible = await fixture.call(
      CERTIFICATION_OWNER,
      `/certification-cases/${caseId}/eligible-documents`,
    );
    expect(eligible.status).toBe(200);
    expect(record(await eligible.json()).items).toEqual(
      expect.arrayContaining([expect.objectContaining(source)]),
    );
    const attached = await fixture.created(
      await fixture.call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/documents`,
        {
          method: 'POST',
          body: { expectedRevision: 4, role: 'agreement', ...source },
        },
      ),
    );
    expect(attached).toMatchObject({ revision: 5, nextStep: 'agreement' });
    const register = await fixture.call(
      CERTIFICATION_READER,
      `/certification-cases/${caseId}/documents`,
    );
    const items = record(await register.json()).items;
    if (!Array.isArray(items)) throw new Error('Expected items.');
    const [item] = items;
    const digest = createHash('sha256').update(SYNTHETIC_PDF).digest('hex');
    expect(item).toMatchObject({
      role: 'agreement',
      ...source,
      versionNumber: 1,
      sourceTitle: 'Signed certification agreement',
      sizeBytes: SYNTHETIC_PDF.length,
      sha256: digest,
    });
    const attachmentId = text(record(item).id);
    const content = await fixture.call(
      CERTIFICATION_OWNER,
      `/certification-cases/${caseId}/documents/${attachmentId}/content`,
    );
    expect(content.status).toBe(200);
    expect(content.headers.get('content-type')).toBe('application/pdf');
    expect(
      createHash('sha256')
        .update(Buffer.from(await content.arrayBuffer()))
        .digest('hex'),
    ).toBe(digest);
    const duplicate = await fixture.call(
      CERTIFICATION_OWNER,
      `/certification-cases/${caseId}/documents`,
      {
        method: 'POST',
        body: { expectedRevision: 5, role: 'other', ...source },
      },
    );
    expect(duplicate.status).toBe(409);
    const recorded = await fixture.created(
      await fixture.call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/agreement`,
        {
          method: 'POST',
          body: { expectedRevision: 5, signedOn: '2026-11-02', attachmentId },
        },
      ),
    );
    expect(recorded).toMatchObject({
      revision: 6,
      nextStep: 'team',
      agreement: {
        version: 1,
        value: { signedOn: '2026-11-02', attachmentId },
      },
    });
    expect(await fixture.eventCount(caseId)).toBe(6);
  });

  it('refuses an agreement before the duration, without an agreement attachment or in the future', async () => {
    const early = await fixture.acceptedCase();
    const source = await fixture.receivedSource();
    const attached = await fixture.created(
      await fixture.call(
        CERTIFICATION_OWNER,
        `/certification-cases/${early}/documents`,
        {
          method: 'POST',
          body: { expectedRevision: 3, role: 'questionnaire', ...source },
        },
      ),
    );
    expect(attached).toMatchObject({ revision: 4 });
    const register = record(
      await (
        await fixture.call(
          CERTIFICATION_OWNER,
          `/certification-cases/${early}/documents`,
        )
      ).json(),
    ).items;
    if (!Array.isArray(register)) throw new Error('Expected items.');
    const questionnaireId = text(record(register[0]).id);
    const beforeDuration = await fixture.call(
      CERTIFICATION_OWNER,
      `/certification-cases/${early}/agreement`,
      {
        method: 'POST',
        body: {
          expectedRevision: 4,
          signedOn: '2026-11-02',
          attachmentId: questionnaireId,
        },
      },
    );
    expect(record(await beforeDuration.json()).code).toBe(
      'CERTIFICATION_DURATION_MISSING',
    );
    const caseId = await caseReadyForAgreement();
    const other = await fixture.receivedSource('Signed questionnaire');
    await fixture.created(
      await fixture.call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/documents`,
        {
          method: 'POST',
          body: { expectedRevision: 4, role: 'questionnaire', ...other },
        },
      ),
    );
    const items = record(
      await (
        await fixture.call(
          CERTIFICATION_OWNER,
          `/certification-cases/${caseId}/documents`,
        )
      ).json(),
    ).items;
    if (!Array.isArray(items)) throw new Error('Expected items.');
    const wrongRole = await fixture.call(
      CERTIFICATION_OWNER,
      `/certification-cases/${caseId}/agreement`,
      {
        method: 'POST',
        body: {
          expectedRevision: 5,
          signedOn: '2026-11-02',
          attachmentId: text(record(items[0]).id),
        },
      },
    );
    expect(record(await wrongRole.json()).code).toBe(
      'CERTIFICATION_AGREEMENT_DOCUMENT',
    );
    const future = await fixture.call(
      CERTIFICATION_OWNER,
      `/certification-cases/${caseId}/agreement`,
      {
        method: 'POST',
        body: {
          expectedRevision: 5,
          signedOn: '2026-12-31',
          attachmentId: text(record(items[0]).id),
        },
      },
    );
    expect(record(await future.json()).code).toBe(
      'CERTIFICATION_AGREEMENT_IN_FUTURE',
    );
    expect(await fixture.eventCount(caseId)).toBe(5);
  });

  it('refuses unknown documents like missing ones and keeps attaching to programme managers', async () => {
    const caseId = await caseReadyForAgreement();
    const source = await fixture.receivedSource();
    const unknown = await fixture.call(
      CERTIFICATION_OWNER,
      `/certification-cases/${caseId}/documents`,
      {
        method: 'POST',
        body: {
          expectedRevision: 4,
          role: 'agreement',
          ...source,
          representationId: '00000000-0000-4000-8000-000000000001',
        },
      },
    );
    expect(unknown.status).toBe(404);
    const reader = await fixture.call(
      CERTIFICATION_READER,
      `/certification-cases/${caseId}/documents`,
      {
        method: 'POST',
        body: { expectedRevision: 4, role: 'agreement', ...source },
      },
    );
    expect(reader.status).toBe(403);
    const readerEligible = await fixture.call(
      CERTIFICATION_READER,
      `/certification-cases/${caseId}/eligible-documents`,
    );
    expect(readerEligible.status).toBe(403);
    expect(await fixture.eventCount(caseId)).toBe(4);
  });
});
