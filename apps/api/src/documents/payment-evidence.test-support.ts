import { randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const WORKSPACE_ID = '00000000-0000-4000-8000-000000001045';
export type PaymentEvidenceIdentity =
  'owner' | 'reader' | 'ordinary' | 'confirmer' | 'reverser';
const identities: Record<
  PaymentEvidenceIdentity,
  { subject: string; displayName: string; email: string }
> = {
  owner: {
    subject: 'payment-evidence-owner',
    displayName: 'Fictional Payment Evidence Owner',
    email: 'payment-evidence-owner@example.test',
  },
  reader: {
    subject: 'payment-evidence-reader',
    displayName: 'Fictional Payment Reader',
    email: 'payment-evidence-reader@example.test',
  },
  ordinary: {
    subject: 'payment-evidence-ordinary',
    displayName: 'Fictional Document Reader',
    email: 'payment-evidence-ordinary@example.test',
  },
  confirmer: {
    subject: 'payment-evidence-confirmer',
    displayName: 'Fictional Payment Confirmer',
    email: 'payment-evidence-confirmer@example.test',
  },
  reverser: {
    subject: 'payment-evidence-reverser',
    displayName: 'Fictional Payment Reverser',
    email: 'payment-evidence-reverser@example.test',
  },
};

export interface PaymentEvidenceReady {
  companyId: string;
  membershipIds: Record<PaymentEvidenceIdentity, string>;
  clientId: string;
  additionalLegalEntityId: string;
  unionSourceClientId: string;
  unionTargetClientId: string;
}

export function paymentSourceRegistration(
  clientId: string,
  payer: { kind: 'PRIMARY' } | { kind: 'ADDITIONAL'; legalEntityId: string } = {
    kind: 'PRIMARY',
  },
) {
  return {
    type: 'payment-evidence',
    clientId,
    payer,
    title: 'Fictional payment notice',
    purpose: 'Preserve a declared source without proving payment',
    sourceDescription: 'Fictional manual notice; no bank or fiscal proof',
    receivedOn: null,
  };
}

export function paymentRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected a public response record.');
  return Object.fromEntries(Object.entries(value));
}
export function paymentText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a response string.');
  return value;
}
export async function paymentJson(response: Response) {
  const value: unknown = await response.json();
  return paymentRecord(value);
}

/** Real synthetic PDF bytes, generated with the application's pinned parser library. */
export async function paymentNoticePdf(revision = 'A'): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date('2026-01-15T00:00:00.000Z'));
  pdf.setModificationDate(new Date('2026-01-15T00:00:00.000Z'));
  pdf.setTitle('Fictional payment notice — not bank or fiscal proof');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  for (const [index, line] of [
    'Fictional payment notice — not bank or fiscal proof',
    'FICT-PAY-001',
    '1255.50 MDL',
    'Declared date: 2026-01-15',
    `Synthetic revision ${revision}; no real person, bank or account.`,
  ].entries())
    page.drawText(line, { x: 40, y: 790 - index * 24, size: 12, font });
  return Buffer.from(await pdf.save());
}

/** Real AppModule, isolated PostgreSQL and a deterministic external scanner boundary. */
export async function createPaymentEvidenceFixture(databaseUrl: string) {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let companyId: string;
  let ready: PaymentEvidenceReady;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;

  async function openHarness() {
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: identities.owner.subject,
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Fictional Payment Evidence Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
          Object.entries(identities)
            .filter(([name]) => name !== 'owner')
            .map(([, identity]) => ({
              provider: 'deterministic-test',
              subject: identity.subject,
              workspaceId: WORKSPACE_ID,
            })),
        ),
        ...scanner.environment,
      },
    });
  }
  async function close() {
    await harness?.close();
    await database?.close();
    await scanner?.close();
  }
  function headers(identity: PaymentEvidenceIdentity, company: string | null) {
    const principal = identities[identity];
    return {
      'x-test-external-provider': 'deterministic-test',
      'x-test-external-subject': principal.subject,
      'x-test-display-name': principal.displayName,
      'x-test-email': principal.email,
      ...(company ? { 'x-company-context-id': company } : {}),
    };
  }
  function call(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      company?: string | null;
      key?: string;
      identity?: PaymentEvidenceIdentity;
    } = {},
  ): Promise<Response> {
    return fetch(`${harness.origin}/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...headers(
          options.identity ?? 'owner',
          options.company === undefined ? companyId : options.company,
        ),
        'content-type': 'application/json',
        'idempotency-key': options.key ?? randomUUID(),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  }
  function grant(path: string, membershipId: string) {
    return call(path, {
      method: 'POST',
      company: null,
      body: { companyId, workspaceMembershipId: membershipId },
    });
  }
  function revoke(path: string, membershipId: string) {
    return call(`${path}/${membershipId}/${companyId}`, {
      method: 'DELETE',
      company: null,
    });
  }
  async function setupResponse(
    response: Response,
    status: number,
    step: string,
  ) {
    if (response.status !== status)
      throw new Error(
        `Payment fixture ${step}: expected ${status}, received ${response.status}: ${await response.text()}`,
      );
    return paymentJson(response);
  }
  async function reset(): Promise<PaymentEvidenceReady> {
    scanner.reset();
    await harness.pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
    companyId = paymentText(
      (
        await setupResponse(
          await call('/companies', {
            method: 'POST',
            company: null,
            body: { displayName: 'Fictional Receiving Company' },
          }),
          201,
          'Company registration',
        )
      ).id,
    );
    async function membership(identity: PaymentEvidenceIdentity) {
      return paymentText(
        (
          await setupResponse(
            await call('/access/current-actor', { identity, company: null }),
            200,
            `${identity} membership`,
          )
        ).workspaceMembershipId,
      );
    }
    const membershipIds: Record<PaymentEvidenceIdentity, string> = {
      owner: await membership('owner'),
      reader: await membership('reader'),
      ordinary: await membership('ordinary'),
      confirmer: await membership('confirmer'),
      reverser: await membership('reverser'),
    };
    for (const membershipId of Object.values(membershipIds))
      for (const path of [
        '/company-context-assignments',
        '/company-director-client-assignments',
        '/company-document-registrar-assignments',
        '/company-document-content-reader-assignments',
        '/company-payment-evidence-access-assignments',
      ])
        await setupResponse(await grant(path, membershipId), 201, path);
    for (const path of [
      '/company-payment-reader-assignments',
      '/company-payment-recorder-assignments',
      '/company-document-content-uploader-assignments',
      '/company-document-approver-assignments',
    ])
      await setupResponse(await grant(path, membershipIds.owner), 201, path);
    for (const [path, membershipId] of [
      ['/company-payment-reader-assignments', membershipIds.reader],
      ['/company-payment-confirmer-assignments', membershipIds.confirmer],
      ['/company-payment-reverser-assignments', membershipIds.reverser],
    ]) {
      if (!path || !membershipId)
        throw new Error('Incomplete Payment role fixture.');
      await setupResponse(await grant(path, membershipId), 201, path);
    }
    async function client(displayName: string, taxId: string) {
      return paymentText(
        (
          await setupResponse(
            await call('/clients', {
              method: 'POST',
              body: { displayName, taxId, address: '1045 Fictional Street' },
            }),
            201,
            'Client registration',
          )
        ).id,
      );
    }
    const clientId = await client('Fictional Payer Primary', 'FICT-PAYER-1045');
    const additional = await setupResponse(
      await call(`/clients/${clientId}/legal-entities`, {
        method: 'POST',
        body: {
          expectedClientVersion: 1,
          legalName: 'Fictional Payer Additional',
          taxId: 'FICT-ADDITIONAL-1045',
          legalAddress: null,
        },
      }),
      201,
      'additional payer registration',
    );
    const additionalLegalEntityId = paymentText(
      paymentRecord(additional.legalEntity).id,
    );
    ready = {
      companyId,
      membershipIds,
      clientId,
      additionalLegalEntityId,
      unionSourceClientId: await client(
        'Fictional Union Source',
        'FICT-UNION-S-1045',
      ),
      unionTargetClientId: await client(
        'Fictional Union Target',
        'FICT-UNION-T-1045',
      ),
    };
    return ready;
  }
  function upload(input: {
    documentId: string;
    versionId: string;
    revision: number;
    bytes: Buffer;
    key?: string;
    identity?: PaymentEvidenceIdentity;
    company?: string;
  }) {
    return fetch(
      `${harness.origin}/api/documents/${input.documentId}/versions/${input.versionId}/content?expectedRevision=${input.revision}&fileName=fictional-payment-notice.pdf`,
      {
        method: 'POST',
        headers: {
          ...headers(input.identity ?? 'owner', input.company ?? companyId),
          'content-type': 'application/pdf',
          'idempotency-key': input.key ?? randomUUID(),
        },
        body: new Uint8Array(input.bytes),
      },
    );
  }
  try {
    scanner = await openDocumentScannerFixture();
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'payment_evidence',
    });
    await openHarness();
  } catch (error) {
    await close();
    throw error;
  }
  return {
    call,
    grant,
    revoke,
    upload,
    reset,
    close,
    async restart() {
      await harness.close();
      await openHarness();
    },
    get ready() {
      return ready;
    },
    get scanner() {
      return scanner;
    },
    get pool() {
      return harness.pool;
    },
    measureApplicationQueries<T>(work: () => Promise<T>) {
      return harness.measureApplicationQueries(work);
    },
  };
}
export type PaymentEvidenceFixture = Awaited<
  ReturnType<typeof createPaymentEvidenceFixture>
>;
