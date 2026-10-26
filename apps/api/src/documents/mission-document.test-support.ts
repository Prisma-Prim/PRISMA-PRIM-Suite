import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000827';
export const PDF_A = readFileSync(
  resolve('test-support/fixtures/questionnaire-demo.pdf'),
);
export const PDF_B = Buffer.from(PDF_A);
const demoOffset = PDF_A.indexOf('DEMO');
if (demoOffset < 0)
  throw new Error('Expected the unchanged synthetic PDF fixture.');
PDF_B.write('NEXT', demoOffset, 'ascii');

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a public response record.');
  return Object.fromEntries(Object.entries(value));
}
export function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a response string.');
  return value;
}
export async function json(
  response: Response,
): Promise<Record<string, unknown>> {
  return record(await response.json());
}

export async function createMissionDocumentFixture(
  databaseUrl: string,
  migrationsFolder?: string,
) {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let companyId: string;
  let membershipId: string;
  let clientId: string;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;

  async function start() {
    scanner = await openDocumentScannerFixture();

    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'mission_deliverables',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      ...(migrationsFolder ? { migrationsFolder } : {}),
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'mission-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Mission Documents DEMO',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'mission-collaborator',
            workspaceId: WORKSPACE_ID,
          },
        ]),
        ...scanner.environment,
      },
    });
  }
  async function close() {
    await harness?.close();
    await database?.close();
    await scanner?.close();
  }
  function call(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      company?: string | null;
      key?: string;
      identity?: { subject: string; displayName: string; email: string };
    } = {},
  ): Promise<Response> {
    const company = options.company === undefined ? companyId : options.company;
    return fetch(`${harness.origin}/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': options.identity?.subject ?? 'mission-owner',
        'x-test-display-name':
          options.identity?.displayName ?? 'Mission Owner DEMO',
        'x-test-email': options.identity?.email ?? 'mission-owner@example.test',
        ...(company ? { 'x-company-context-id': company } : {}),
        'content-type': 'application/json',
        'idempotency-key': options.key ?? randomUUID(),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  }
  async function grant(path: string): Promise<Record<string, unknown>> {
    const response = await call(path, {
      method: 'POST',
      company: null,
      body: { companyId, workspaceMembershipId: membershipId },
    });
    if (response.status !== 201)
      throw new Error(`Grant ${path} failed: ${response.status}`);
    return json(response);
  }
  async function reset() {
    scanner.reset();
    await harness.pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
    const company = await call('/companies', {
      method: 'POST',
      company: null,
      body: { displayName: 'Mission Company DEMO' },
    });
    if (company.status !== 201)
      throw new Error(`Company registration failed: ${company.status}`);
    companyId = text((await json(company)).id);
    membershipId = text(
      (await json(await call('/access/current-actor', { company: null })))
        .workspaceMembershipId,
    );
    await grant('/company-document-registrar-assignments');
    const client = await call('/clients', {
      method: 'POST',
      body: { displayName: 'Mission Client DEMO' },
    });
    if (client.status !== 201)
      throw new Error(`Client registration failed: ${client.status}`);
    clientId = text((await json(client)).id);
    return { companyId, membershipId, clientId };
  }
  function upload(input: {
    documentId: string;
    versionId: string;
    revision: number;
    bytes: Buffer;
    key?: string;
  }) {
    return fetch(
      `${harness.origin}/api/documents/${input.documentId}/versions/${input.versionId}/content?expectedRevision=${input.revision}&fileName=mission-result.pdf`,
      {
        method: 'POST',
        headers: {
          'x-test-external-provider': 'deterministic-test',
          'x-test-external-subject': 'mission-owner',
          'x-test-display-name': 'Mission Owner DEMO',
          'x-test-email': 'mission-owner@example.test',
          'x-company-context-id': companyId,
          'content-type': 'application/pdf',
          'idempotency-key': input.key ?? randomUUID(),
        },
        body: new Uint8Array(input.bytes),
      },
    );
  }

  try {
    await start();
  } catch (error) {
    await close();
    throw error;
  }
  return {
    call,
    grant,
    upload,
    reset,
    close,
    get pool() {
      return harness.pool;
    },
    get scanCount() {
      return scanner.scanCount;
    },
    setScanMode(mode: 'clean' | 'unsafe' | 'unavailable' | 'malformed') {
      scanner.setScanMode(mode);
    },
    holdNextScan() {
      return scanner.holdNextScan();
    },
  };
}
export type MissionDocumentFixture = Awaited<
  ReturnType<typeof createMissionDocumentFixture>
>;
