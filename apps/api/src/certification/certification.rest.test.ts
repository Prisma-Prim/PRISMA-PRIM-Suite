import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000001131';
const OWNER = 'certification-owner';
const READER = 'certification-reader';
const OUTSIDER = 'certification-outsider';

type Subject = typeof OWNER | typeof READER | typeof OUTSIDER;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a response record.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a string.');
  return value;
}

/** A fictional dairy's application, as a programme manager records it. */
function facts(overrides: Record<string, unknown> = {}) {
  return {
    declaredLegalName: 'Lactis Demo SRL',
    declaredAddress: 'Str. Exemplu 1, Demo City',
    sites: [{ address: 'Str. Exemplu 1, Demo City', activity: 'Dairy plant' }],
    requestedScope: 'Production of pasteurised milk and yoghurt',
    foodChainSubcategories: ['CI'],
    haccpStudyCount: 2,
    totalHeadcount: 40,
    effectiveFte: 37.5,
    shiftCount: 2,
    seasonalActivity: null,
    otherCertifiedSystems: null,
    outsourcedProcesses: 'Laboratory testing',
    consultant: { used: false },
    auditLanguages: ['ro'],
    preferredAuditPeriod: 'Second quarter',
    ...overrides,
  };
}
function criteria(answer: 'yes' | 'no' = 'yes') {
  return Object.fromEntries(
    [
      'scopeCertifiable',
      'competentTeamAvailable',
      'competentDecisionMakerAvailable',
      'risksAcceptable',
    ].map((criterion) => [criterion, { answer, note: `Checked ${criterion}` }]),
  );
}

withPostgres('Certification Case public REST boundary', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let companyId = '';
  let otherCompanyId = '';
  let clientId = '';
  let entityId = '';
  let foreignEntityId = '';
  let projectId = '';
  const memberships = new Map<Subject, string>();

  function call(
    subject: Subject,
    path: string,
    options: {
      method?: string;
      body?: unknown;
      company?: string | null;
      key?: string;
    } = {},
  ): Promise<Response> {
    const company = options.company === undefined ? companyId : options.company;
    return fetch(`${harness.origin}/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': subject,
        'x-test-display-name': `Synthetic ${subject}`,
        'x-test-email': `${subject}@example.test`,
        ...(company ? { 'x-company-context-id': company } : {}),
        'content-type': 'application/json',
        'idempotency-key': options.key ?? randomUUID(),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  }
  async function created(response: Response): Promise<Record<string, unknown>> {
    if (response.status !== 201)
      throw new Error(`${response.status}: ${await response.text()}`);
    return record(await response.json());
  }
  async function grant(subject: Subject, path: string, company = companyId) {
    const membershipId = memberships.get(subject);
    if (!membershipId) throw new Error(`Unknown member ${subject}`);
    await created(
      await call(OWNER, path, {
        method: 'POST',
        company: null,
        body: { companyId: company, workspaceMembershipId: membershipId },
      }),
    );
  }
  async function eventCount(caseId: string): Promise<number> {
    const result = await harness.pool.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM certification_events WHERE case_id = $1',
      [caseId],
    );
    return Number(result.rows[0]?.total);
  }
  async function openCase(orderReference = `CERT-${randomUUID().slice(0, 8)}`) {
    return created(
      await call(OWNER, `/projects/${projectId}/certification-cases`, {
        method: 'POST',
        body: { clientLegalEntityId: entityId, orderReference },
      }),
    );
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'certification1131',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      serverClock: { now: () => new Date('2026-11-07T08:00:00.000Z') },
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: OWNER,
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Synthetic Certification Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
          [READER, OUTSIDER].map((subject) => ({
            provider: 'deterministic-test',
            subject,
            workspaceId: WORKSPACE_ID,
          })),
        ),
      },
    });
    for (const subject of [OWNER, READER, OUTSIDER] as const) {
      const actor = await call(subject, '/access/current-actor', {
        company: null,
      });
      expect(actor.status).toBe(200);
      memberships.set(
        subject,
        text(record(await actor.json()).workspaceMembershipId),
      );
    }
    companyId = text(
      (
        await created(
          await call(OWNER, '/companies', {
            method: 'POST',
            company: null,
            body: { displayName: 'Synthetic Certification Body' },
          }),
        )
      ).id,
    );
    otherCompanyId = text(
      (
        await created(
          await call(OWNER, '/companies', {
            method: 'POST',
            company: null,
            body: { displayName: 'Synthetic Consulting Company' },
          }),
        )
      ).id,
    );
    for (const path of [
      '/company-project-assignments',
      '/company-director-client-assignments',
      '/company-certification-reader-assignments',
      '/company-certification-programme-manager-assignments',
    ])
      await grant(OWNER, path);
    // Project readers also need the Company context and Client access.
    const projectReader = [
      '/company-context-assignments',
      '/company-director-client-assignments',
      '/company-project-assignments',
    ];
    for (const path of [
      ...projectReader,
      '/company-certification-reader-assignments',
    ])
      await grant(READER, path);
    for (const path of projectReader) await grant(OUTSIDER, path);
    for (const path of [
      '/company-project-assignments',
      '/company-certification-reader-assignments',
      '/company-certification-programme-manager-assignments',
    ])
      await grant(OWNER, path, otherCompanyId);
    clientId = text(
      (
        await created(
          await call(OWNER, '/clients', {
            method: 'POST',
            body: { displayName: 'Lactis Demo' },
          }),
        )
      ).id,
    );
    const entity = await created(
      await call(OWNER, `/clients/${clientId}/legal-entities`, {
        method: 'POST',
        body: {
          expectedClientVersion: 1,
          legalName: 'Lactis Demo SRL',
          taxId: null,
          legalAddress: 'Str. Exemplu 1, Demo City',
        },
      }),
    );
    entityId = text(record(entity.legalEntity).id);
    const otherClient = text(
      (
        await created(
          await call(OWNER, '/clients', {
            method: 'POST',
            body: { displayName: 'Other Demo Client' },
          }),
        )
      ).id,
    );
    foreignEntityId = text(
      record(
        (
          await created(
            await call(OWNER, `/clients/${otherClient}/legal-entities`, {
              method: 'POST',
              body: {
                expectedClientVersion: 1,
                legalName: 'Other Demo SA',
                taxId: null,
                legalAddress: null,
              },
            }),
          )
        ).legalEntity,
      ).id,
    );
    projectId = text(
      (
        await created(
          await call(OWNER, '/projects', {
            method: 'POST',
            body: {
              title: 'Certification ISO 22000 — Lactis Demo',
              clientAccountId: clientId,
            },
          }),
        )
      ).id,
    );
  }, 240_000);

  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });

  it('opens a Case, records and corrects the application, accepts the review and keeps every version', async () => {
    const opened = await openCase('CERT-0001/01');
    expect(opened).toMatchObject({
      projectId,
      orderReference: 'CERT-0001/01',
      clientLegalEntity: { id: entityId, legalName: 'Lactis Demo SRL' },
      standard: 'iso_22000_2018',
      auditType: 'initial_certification',
      status: 'open',
      revision: 1,
      nextStep: 'application',
      application: null,
      applicationReview: null,
    });
    const caseId = text(opened.id);
    const first = await created(
      await call(OWNER, `/certification-cases/${caseId}/application`, {
        method: 'POST',
        body: { expectedRevision: 1, facts: facts() },
      }),
    );
    expect(first).toMatchObject({
      revision: 2,
      nextStep: 'application_review',
      application: { version: 1, reason: null, value: facts() },
    });
    const corrected = await created(
      await call(OWNER, `/certification-cases/${caseId}/application`, {
        method: 'POST',
        body: {
          expectedRevision: 2,
          reason: 'The client declared three HACCP studies.',
          facts: facts({ haccpStudyCount: 3 }),
        },
      }),
    );
    expect(corrected).toMatchObject({
      revision: 3,
      application: {
        version: 2,
        reason: 'The client declared three HACCP studies.',
        value: { haccpStudyCount: 3 },
      },
    });
    const reviewed = await created(
      await call(OWNER, `/certification-cases/${caseId}/application-review`, {
        method: 'POST',
        body: {
          expectedRevision: 3,
          criteria: criteria(),
          outcome: 'accepted',
        },
      }),
    );
    expect(reviewed).toMatchObject({
      status: 'open',
      revision: 4,
      nextStep: 'duration',
      applicationReview: {
        value: { outcome: 'accepted', rejectionReason: null },
      },
    });
    const timeline = await call(
      READER,
      `/certification-cases/${caseId}/timeline`,
    );
    expect(timeline.status).toBe(200);
    const entries = record(await timeline.json()).entries;
    expect(entries).toMatchObject([
      { step: 'application', version: 1, caseRevision: 2 },
      { step: 'application', version: 2, caseRevision: 3 },
      { step: 'application_review', version: 1, caseRevision: 4 },
    ]);
    expect(await eventCount(caseId)).toBe(4);
    const late = await call(
      OWNER,
      `/certification-cases/${caseId}/application`,
      {
        method: 'POST',
        body: {
          expectedRevision: 4,
          reason: 'Too late',
          facts: facts(),
        },
      },
    );
    expect(late.status).toBe(409);
    expect(await eventCount(caseId)).toBe(4);
  });

  it('closes the Case when the review rejects the application with a reason', async () => {
    const caseId = text((await openCase()).id);
    await created(
      await call(OWNER, `/certification-cases/${caseId}/application`, {
        method: 'POST',
        body: { expectedRevision: 1, facts: facts() },
      }),
    );
    const missingReason = await call(
      OWNER,
      `/certification-cases/${caseId}/application-review`,
      {
        method: 'POST',
        body: {
          expectedRevision: 2,
          criteria: criteria('no'),
          outcome: 'rejected',
        },
      },
    );
    expect(missingReason.status).toBe(400);
    const acceptedWithNo = await call(
      OWNER,
      `/certification-cases/${caseId}/application-review`,
      {
        method: 'POST',
        body: {
          expectedRevision: 2,
          criteria: {
            ...criteria(),
            risksAcceptable: { answer: 'no', note: 'Consultant link' },
          },
          outcome: 'accepted',
        },
      },
    );
    expect(acceptedWithNo.status).toBe(400);
    expect(record(await acceptedWithNo.json()).code).toBe(
      'CERTIFICATION_REVIEW_CRITERIA_NOT_MET',
    );
    const rejected = await created(
      await call(OWNER, `/certification-cases/${caseId}/application-review`, {
        method: 'POST',
        body: {
          expectedRevision: 2,
          criteria: {
            ...criteria(),
            risksAcceptable: { answer: 'no', note: 'Consultant link' },
          },
          outcome: 'rejected',
          rejectionReason: 'Impartiality risk cannot be mitigated.',
        },
      }),
    );
    expect(rejected).toMatchObject({ status: 'rejected', nextStep: null });
    const afterClose = await call(
      OWNER,
      `/certification-cases/${caseId}/application`,
      {
        method: 'POST',
        body: { expectedRevision: 3, reason: 'Retry', facts: facts() },
      },
    );
    expect(afterClose.status).toBe(409);
  });

  it('refuses an unanswered criterion, a review before the application and a first application with a reason', async () => {
    const caseId = text((await openCase()).id);
    const early = await call(
      OWNER,
      `/certification-cases/${caseId}/application-review`,
      {
        method: 'POST',
        body: {
          expectedRevision: 1,
          criteria: criteria(),
          outcome: 'accepted',
        },
      },
    );
    expect(early.status).toBe(409);
    const reasoned = await call(
      OWNER,
      `/certification-cases/${caseId}/application`,
      {
        method: 'POST',
        body: {
          expectedRevision: 1,
          reason: 'Not a correction',
          facts: facts(),
        },
      },
    );
    expect(reasoned.status).toBe(409);
    await created(
      await call(OWNER, `/certification-cases/${caseId}/application`, {
        method: 'POST',
        body: { expectedRevision: 1, facts: facts() },
      }),
    );
    const partial = { ...criteria() };
    delete partial.risksAcceptable;
    const unanswered = await call(
      OWNER,
      `/certification-cases/${caseId}/application-review`,
      {
        method: 'POST',
        body: { expectedRevision: 2, criteria: partial, outcome: 'accepted' },
      },
    );
    expect(unanswered.status).toBe(400);
    for (const invalid of [
      facts({ foodChainSubcategories: ['CI', 'CI'] }),
      facts({ foodChainSubcategories: ['Z'] }),
      facts({ sites: [] }),
      facts({ consultant: { used: false, name: 'Hidden' } }),
      facts({ effectiveFte: 3.25 }),
      { ...facts(), unknownField: true },
    ]) {
      const response = await call(
        OWNER,
        `/certification-cases/${caseId}/application`,
        {
          method: 'POST',
          body: { expectedRevision: 2, reason: 'Invalid', facts: invalid },
        },
      );
      expect(response.status).toBe(400);
    }
    expect(await eventCount(caseId)).toBe(2);
  });

  it('replays an exact retry, refuses a key reused for another body and a stale revision', async () => {
    const caseId = text((await openCase()).id);
    const key = randomUUID();
    const body = { expectedRevision: 1, facts: facts() };
    const first = await created(
      await call(OWNER, `/certification-cases/${caseId}/application`, {
        method: 'POST',
        body,
        key,
      }),
    );
    const retry = await created(
      await call(OWNER, `/certification-cases/${caseId}/application`, {
        method: 'POST',
        body,
        key,
      }),
    );
    expect(retry).toEqual(first);
    const reused = await call(
      OWNER,
      `/certification-cases/${caseId}/application`,
      {
        method: 'POST',
        body: { ...body, facts: facts({ totalHeadcount: 41 }) },
        key,
      },
    );
    expect(reused.status).toBe(409);
    const stale = await call(
      OWNER,
      `/certification-cases/${caseId}/application`,
      {
        method: 'POST',
        body: { expectedRevision: 1, reason: 'Stale', facts: facts() },
      },
    );
    expect(stale.status).toBe(409);
    expect(record(await stale.json()).code).toBe('STALE_VERSION');
    expect(await eventCount(caseId)).toBe(2);
  });

  it('refuses a duplicate order reference and a legal entity of another Client', async () => {
    await openCase('CERT-DUP');
    const duplicate = await call(
      OWNER,
      `/projects/${projectId}/certification-cases`,
      {
        method: 'POST',
        body: { clientLegalEntityId: entityId, orderReference: ' CERT-DUP ' },
      },
    );
    expect(duplicate.status).toBe(409);
    const foreign = await call(
      OWNER,
      `/projects/${projectId}/certification-cases`,
      {
        method: 'POST',
        body: {
          clientLegalEntityId: foreignEntityId,
          orderReference: 'CERT-X',
        },
      },
    );
    expect(foreign.status).toBe(404);
  });

  it('lets a reader consult but not mutate, and denies members without the reader grant', async () => {
    const caseId = text((await openCase()).id);
    const list = await call(
      READER,
      `/projects/${projectId}/certification-cases`,
    );
    expect(list.status).toBe(200);
    const listed = record(await list.json());
    expect(listed.total).toEqual(expect.any(Number));
    expect(listed.cases).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: caseId })]),
    );
    expect((await call(READER, `/certification-cases/${caseId}`)).status).toBe(
      200,
    );
    const mutation = await call(
      READER,
      `/certification-cases/${caseId}/application`,
      { method: 'POST', body: { expectedRevision: 1, facts: facts() } },
    );
    expect(mutation.status).toBe(403);
    const options = await call(
      READER,
      `/projects/${projectId}/certification-legal-entities`,
    );
    expect(options.status).toBe(403);
    for (const path of [
      `/projects/${projectId}/certification-cases`,
      `/certification-cases/${caseId}`,
      `/certification-cases/${caseId}/timeline`,
    ])
      expect((await call(OUTSIDER, path)).status).toBe(403);
    expect(await eventCount(caseId)).toBe(1);
  });

  it('answers a Case of another Company exactly like a missing one', async () => {
    const caseId = text((await openCase()).id);
    const hidden = await call(OWNER, `/certification-cases/${caseId}`, {
      company: otherCompanyId,
    });
    const missing = await call(OWNER, `/certification-cases/${randomUUID()}`, {
      company: otherCompanyId,
    });
    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await hidden.json()).toEqual(await missing.json());
    const foreignProject = await call(
      OWNER,
      `/projects/${projectId}/certification-cases`,
      { company: otherCompanyId },
    );
    expect(foreignProject.status).toBe(404);
  });

  it('stops serving a member whose programme manager grant was revoked', async () => {
    const caseId = text((await openCase()).id);
    const membershipId = memberships.get(OWNER);
    const revoked = await call(
      OWNER,
      `/company-certification-programme-manager-assignments/${String(membershipId)}/${companyId}`,
      { method: 'DELETE', company: null },
    );
    expect(revoked.status).toBe(200);
    const denied = await call(
      OWNER,
      `/certification-cases/${caseId}/application`,
      { method: 'POST', body: { expectedRevision: 1, facts: facts() } },
    );
    expect(denied.status).toBe(403);
    expect((await call(OWNER, `/certification-cases/${caseId}`)).status).toBe(
      200,
    );
    await grant(OWNER, '/company-certification-programme-manager-assignments');
  });
});
