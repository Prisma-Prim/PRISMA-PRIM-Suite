import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
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
export const CERTIFICATION_APPROVER = 'certification-approver';
export const CERTIFICATION_AUDITOR = 'certification-auditor';
const MEMBERS = [
  CERTIFICATION_OWNER,
  CERTIFICATION_READER,
  CERTIFICATION_APPROVER,
  CERTIFICATION_AUDITOR,
] as const;
export type CertificationSubject = (typeof MEMBERS)[number];

/** The repository's synthetic questionnaire PDF; no real content. */
export const SYNTHETIC_PDF = readFileSync(
  resolve('test-support/fixtures/questionnaire-demo.pdf'),
);

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
  let scanner:
    Awaited<ReturnType<typeof openDocumentScannerFixture>> | undefined;
  let clientId = '';
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
  /** Registers, uploads and designates one received audit source PDF of the Client. */
  async function receivedSource(title = 'Fictional signed original') {
    const document = await created(
      await call(CERTIFICATION_OWNER, '/documents', {
        method: 'POST',
        body: {
          type: 'received-audit-source',
          clientId,
          title,
          purpose: 'Fictional signed original for a certification test',
        },
      }),
    );
    const documentId = text(document.id);
    const versionId = text(record(document.version).id);
    const uploaded = await fetch(
      `${origin()}/api/documents/${documentId}/versions/${versionId}/content?expectedRevision=1&fileName=signed-original.pdf`,
      {
        method: 'POST',
        headers: {
          'x-test-external-provider': 'deterministic-test',
          'x-test-external-subject': CERTIFICATION_OWNER,
          'x-test-display-name': `Synthetic ${CERTIFICATION_OWNER}`,
          'x-test-email': `${CERTIFICATION_OWNER}@example.test`,
          'x-company-context-id': companyId,
          'content-type': 'application/pdf',
          'idempotency-key': randomUUID(),
        },
        body: new Uint8Array(SYNTHETIC_PDF),
      },
    );
    const representationId = text((await created(uploaded)).representationId);
    const designated = await call(
      CERTIFICATION_OWNER,
      `/documents/${documentId}/versions/${versionId}/official-designation`,
      { method: 'POST', body: { expectedRevision: 2 } },
    );
    if (designated.status !== 200)
      throw new Error(`Designation failed: ${designated.status}`);
    return { documentId, versionId, representationId };
  }
  /** A small accepted Case with confirmed duration and recorded agreement (revision 6). */
  async function agreedCase(overrides: Record<string, unknown> = {}) {
    const caseId = await acceptedCase(
      applicationFacts({
        haccpStudyCount: 1,
        effectiveFte: 10,
        totalHeadcount: 10,
        ...overrides,
      }),
    );
    await created(
      await call(
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
    const source = await receivedSource('Signed certification agreement');
    await created(
      await call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/documents`,
        {
          method: 'POST',
          body: { expectedRevision: 4, role: 'agreement', ...source },
        },
      ),
    );
    const register = record(
      await (
        await call(
          CERTIFICATION_OWNER,
          `/certification-cases/${caseId}/documents`,
        )
      ).json(),
    ).items;
    if (!Array.isArray(register)) throw new Error('Expected attachments.');
    await created(
      await call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/agreement`,
        {
          method: 'POST',
          body: {
            expectedRevision: 5,
            signedOn: '2026-11-02',
            attachmentId: text(record(register[0]).id),
          },
        },
      ),
    );
    return caseId;
  }
  /** Attaches a new received PDF with the role; returns the attachment id. */
  async function attach(
    caseId: string,
    role: string,
    expectedRevision: number,
  ) {
    const source = await receivedSource(`Fictional ${role}`);
    await created(
      await call(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/documents`,
        {
          method: 'POST',
          body: { expectedRevision, role, ...source },
        },
      ),
    );
    const register = record(
      await (
        await call(
          CERTIFICATION_OWNER,
          `/certification-cases/${caseId}/documents`,
        )
      ).json(),
    ).items;
    if (!Array.isArray(register)) throw new Error('Expected attachments.');
    const match = register
      .map(record)
      .find((item) => item.documentId === source.documentId);
    return text(match?.id);
  }
  /** An agreed Case whose team, led by the auditor member, is approved (revision 8). */
  async function approvedTeamCase() {
    const caseId = await agreedCase();
    await created(
      await call(CERTIFICATION_OWNER, `/certification-cases/${caseId}/team`, {
        method: 'POST',
        body: {
          expectedRevision: 6,
          members: [
            {
              name: 'Auditor Demo',
              role: 'team_leader',
              workspaceMembershipId: memberships.get(CERTIFICATION_AUDITOR),
              holdsCategory: true,
              competenceNote: 'ISO 22000 lead auditor, category C',
              declarations: {
                noConsultancy: true,
                noEmployment: true,
                noManagementInvolvement: true,
                confidentiality: true,
              },
              conflictNote: null,
            },
          ],
        },
      }),
    );
    await created(
      await call(
        CERTIFICATION_APPROVER,
        `/certification-cases/${caseId}/team-decision`,
        {
          method: 'POST',
          body: {
            expectedRevision: 7,
            teamVersion: 1,
            decision: 'approved',
            independenceAttested: true,
          },
        },
      ),
    );
    return caseId;
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
    scanner = await openDocumentScannerFixture();
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
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
          [
            CERTIFICATION_READER,
            CERTIFICATION_APPROVER,
            CERTIFICATION_AUDITOR,
          ].map((subject) => ({
            provider: 'deterministic-test',
            subject,
            workspaceId: input.workspaceId,
          })),
        ),
        ...scanner.environment,
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
      '/company-document-registrar-assignments',
      '/company-received-audit-source-access-assignments',
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
      '/company-document-approver-assignments',
    ])
      await grant(CERTIFICATION_OWNER, path);
    for (const path of [
      '/company-context-assignments',
      '/company-director-client-assignments',
      '/company-project-assignments',
      '/company-certification-reader-assignments',
    ])
      await grant(CERTIFICATION_READER, path);
    for (const path of [
      '/company-context-assignments',
      '/company-director-client-assignments',
      '/company-project-assignments',
      '/company-certification-reader-assignments',
      '/company-certification-approver-assignments',
    ])
      await grant(CERTIFICATION_APPROVER, path);
    for (const path of [
      '/company-context-assignments',
      '/company-director-client-assignments',
      '/company-project-assignments',
      '/company-certification-reader-assignments',
      '/company-certification-auditor-assignments',
    ])
      await grant(CERTIFICATION_AUDITOR, path);
    clientId = text(
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
    await scanner?.close();
    throw error;
  }

  return {
    call,
    created,
    grant,
    eventCount,
    caseWithApplication,
    acceptedCase,
    agreedCase,
    approvedTeamCase,
    attach,
    receivedSource,
    membership(subject: CertificationSubject): string {
      const id = memberships.get(subject);
      if (!id) throw new Error(`Unknown member ${subject}`);
      return id;
    },
    get projectId() {
      return projectId;
    },
    async close() {
      await harness?.close();
      await database?.close();
      await scanner?.close();
    },
  };
}
