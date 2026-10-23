import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer, type Server, type Socket } from 'node:net';
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
  let scanner: Server;
  const scannerSockets = new Set<Socket>();
  let scanCount = 0;
  let scanMode: 'clean' | 'unsafe' | 'unavailable' | 'malformed' = 'clean';
  let holdScan: ((complete: () => void) => void) | undefined;

  async function start() {
    // Actual scanner adapter with a deterministic external ClamAV wire fixture.
    // This is not real ClamAV/definitions evidence and mocks no owning module.
    scanner = createServer((socket) => {
      scannerSockets.add(socket);
      socket.on('close', () => scannerSockets.delete(socket));
      let input = Buffer.alloc(0);
      let completed = false;
      socket.on('data', (chunk) => {
        if (completed) return;
        input = Buffer.concat([input, chunk]);
        if (input.equals(Buffer.from('zVERSION\0'))) {
          completed = true;
          socket.end('ClamAV 1.4.3\0');
          return;
        }
        if (!input.subarray(0, 10).equals(Buffer.from('zINSTREAM\0'))) return;
        let offset = 10;
        while (offset + 4 <= input.length) {
          const size = input.readUInt32BE(offset);
          if (size === 0) {
            completed = true;
            scanCount += 1;
            const complete = () => {
              if (scanMode === 'unavailable') socket.destroy();
              else
                socket.end(
                  scanMode === 'unsafe'
                    ? 'stream: DEMO.Test FOUND\0'
                    : scanMode === 'malformed'
                      ? 'uncertain\0'
                      : 'stream: OK\0',
                );
            };
            if (holdScan) holdScan(complete);
            else complete();
            return;
          }
          if (offset + 4 + size > input.length) return;
          offset += 4 + size;
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      scanner.once('error', reject);
      scanner.listen(0, '127.0.0.1', resolve);
    });
    const scannerAddress = scanner.address();
    if (!scannerAddress || typeof scannerAddress === 'string')
      throw new Error('Expected scanner fixture address.');

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
        DOCUMENT_MALWARE_SCANNER_HOST: '127.0.0.1',
        DOCUMENT_MALWARE_SCANNER_PORT: String(scannerAddress.port),
      },
    });
  }
  async function close() {
    await harness?.close();
    await database?.close();
    for (const socket of scannerSockets) socket.destroy();
    if (scanner)
      await new Promise<void>((resolve, reject) =>
        scanner.close((error) => (error ? reject(error) : resolve())),
      );
  }
  function call(
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
        'x-test-external-subject': 'mission-owner',
        'x-test-display-name': 'Mission Owner DEMO',
        'x-test-email': 'mission-owner@example.test',
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
    scanMode = 'clean';
    scanCount = 0;
    holdScan = undefined;
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
      return scanCount;
    },
    setScanMode(mode: 'clean' | 'unsafe' | 'unavailable' | 'malformed') {
      scanMode = mode;
    },
    holdNextScan() {
      if (holdScan) throw new Error('A scanner barrier is already waiting.');
      let releaseScan: (() => void) | undefined;
      const reached = new Promise<void>((resolve) => {
        holdScan = (complete) => {
          holdScan = undefined;
          releaseScan = complete;
          resolve();
        };
      });
      return {
        reached,
        release() {
          const complete = releaseScan;
          releaseScan = undefined;
          complete?.();
        },
      };
    },
  };
}
export type MissionDocumentFixture = Awaited<
  ReturnType<typeof createMissionDocumentFixture>
>;
