import { randomUUID } from 'node:crypto';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

export const CERTIFICATION_OWNER = 'certification-owner';
export const CERTIFICATION_READER = 'certification-reader';
const MEMBERS = [CERTIFICATION_OWNER, CERTIFICATION_READER] as const;
export type CertificationSubject = (typeof MEMBERS)[number];

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a response record.');
  return Object.fromEntries(Object.entries(value));
}
export function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a string.');
  return value;
}

/** A fictional dairy's application, as a programme manager records it. */
export function applicationFacts(overrides: Record<string, unknown> = {}) {
  return {
    declaredLegalName: 'Lactis Demo SRL',
    declaredAddress: 'Str. Exemplu 1, Demo City',
    sites: [{ address: 'Str. Exemplu 1, Demo City', activity: 'Dairy plant' }],
    requestedScope: 'Production of pasteurised milk and yoghurt',
    foodChainSubcategories: ['CI'],
    haccpStudyCount: 3,
    totalHeadcount: 130,
    effectiveFte: 120,
    shiftCount: 2,
    seasonalActivity: null,
    otherCertifiedSystems: null,
    outsourcedProcesses: null,
    consultant: { used: false },
    auditLanguages: ['ro'],
    preferredAuditPeriod: null,
    ...overrides,
  };
}

export function allCriteria(answer: 'yes' | 'no' = 'yes') {
  return Object.fromEntries(
    [
      'scopeCertifiable',
      'competentTeamAvailable',
      'competentDecisionMakerAvailable',
      'risksAcceptable',
    ].map((criterion) => [criterion, { answer, note: `Checked ${criterion}` }]),
  );
}

/** One isolated database and App with a certifying Company, a Client, its legal entity and a Project. */
export async function openCertificationFixture(input: {
  databaseUrl: string;
  namePrefix: string;
  workspaceId: string;
}) {
  let database: IsolatedPostgresTestDatabase | undefined;
  let harness: PostgresRestTestHarness | undefined;
  const memberships = new Map<CertificationSubject, string>();
  let companyId = '';
  let entityId = '';
  let projectId = '';

  function origin(): string {
    if (!harness) throw new Error('Fixture is closed.');
    return harness.origin;
  }
  function call(
    subject: CertificationSubject,
    path: string,
    options: {
      method?: string;
      body?: unknown;
      key?: string;
      company?: string | null;
    } = {},
  ): Promise<Response> {
    const company = options.company === undefined ? companyId : options.company;
    return fetch(`${origin()}/api${path}`, {
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
  async function grant(subject: CertificationSubject, path: string) {
    const membershipId = memberships.get(subject);
    if (!membershipId) throw new Error(`Unknown member ${subject}`);
    await created(
      await call(CERTIFICATION_OWNER, path, {
        method: 'POST',
        company: null,
        body: { companyId, workspaceMembershipId: membershipId },
      }),
    );
  }
  async function eventCount(caseId: string): Promise<number> {
    if (!harness) throw new Error('Fixture is closed.');
    const result = await harness.pool.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM certification_events WHERE case_id = $1',
      [caseId],
    );
    return Number(result.rows[0]?.total);
  }
  /** Opens a Case and records the given application; the review stays open. */
  async function caseWithApplication(facts = applicationFacts()) {
    const caseId = text(
      (
        await created(
          await call(
            CERTIFICATION_OWNER,
            `/projects/${projectId}/certification-cases`,
            {
              method: 'POST',
              body: {
                clientLegalEntityId: entityId,
                orderReference: `CERT-${randomUUID().slice(0, 8)}`,
              },
            },
          ),
        )
      ).id,
    );
    await created(
      await call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/application`,
        {
          method: 'POST',
          body: { expectedRevision: 1, facts },
        },
      ),
    );
    return caseId;
  }
  /** Opens a Case whose application is recorded and accepted (revision 3). */
  async function acceptedCase(facts = applicationFacts()) {
    const caseId = await caseWithApplication(facts);
    await created(
      await call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/application-review`,
        {
          method: 'POST',
          body: {
            expectedRevision: 2,
            criteria: allCriteria(),
            outcome: 'accepted',
          },
        },
      ),
    );
    return caseId;
  }

  try {
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: input.databaseUrl,
      namePrefix: input.namePrefix,
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      serverClock: { now: () => new Date('2026-11-07T08:00:00.000Z') },
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: CERTIFICATION_OWNER,
        ACCESS_BOOTSTRAP_WORKSPACE_ID: input.workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Synthetic Certification Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: CERTIFICATION_READER,
            workspaceId: input.workspaceId,
          },
        ]),
      },
    });
    for (const subject of MEMBERS) {
      const actor = await call(subject, '/access/current-actor', {
        company: null,
      });
      if (actor.status !== 200) throw new Error('Actor unavailable.');
      memberships.set(
        subject,
        text(record(await actor.json()).workspaceMembershipId),
      );
    }
    companyId = text(
      (
        await created(
          await call(CERTIFICATION_OWNER, '/companies', {
            method: 'POST',
            company: null,
            body: { displayName: 'Synthetic Certification Body' },
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
      await grant(CERTIFICATION_OWNER, path);
    for (const path of [
      '/company-context-assignments',
      '/company-director-client-assignments',
      '/company-project-assignments',
      '/company-certification-reader-assignments',
    ])
      await grant(CERTIFICATION_READER, path);
    const clientId = text(
      (
        await created(
          await call(CERTIFICATION_OWNER, '/clients', {
            method: 'POST',
            body: { displayName: 'Lactis Demo' },
          }),
        )
      ).id,
    );
    entityId = text(
      record(
        (
          await created(
            await call(
              CERTIFICATION_OWNER,
              `/clients/${clientId}/legal-entities`,
              {
                method: 'POST',
                body: {
                  expectedClientVersion: 1,
                  legalName: 'Lactis Demo SRL',
                  taxId: null,
                  legalAddress: 'Str. Exemplu 1, Demo City',
                },
              },
            ),
          )
        ).legalEntity,
      ).id,
    );
    projectId = text(
      (
        await created(
          await call(CERTIFICATION_OWNER, '/projects', {
            method: 'POST',
            body: {
              title: 'Certification ISO 22000 — Lactis Demo',
              clientAccountId: clientId,
            },
          }),
        )
      ).id,
    );
  } catch (error) {
    await harness?.close();
    await database?.close();
    throw error;
  }

  return {
    call,
    created,
    grant,
    eventCount,
    caseWithApplication,
    acceptedCase,
    get projectId() {
      return projectId;
    },
    async close() {
      await harness?.close();
      await database?.close();
    },
  };
}
