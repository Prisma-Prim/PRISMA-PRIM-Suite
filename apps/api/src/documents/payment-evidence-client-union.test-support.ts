import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import { paymentJson, paymentText } from './payment-evidence.test-support.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const WORKSPACE_ID = '00000000-0000-4000-8000-000000001045';
const OWNER = {
  provider: 'deterministic-test',
  subject: 'payment-union-owner',
  displayName: 'Fictional Payment Union Owner',
  email: 'payment-union-owner@example.test',
};
/** The tax ID both PRIMARY-only Client dossiers share. */
export const PAYMENT_UNION_TAX_ID = 'PAYMENT-UNION-PRIMARY-1045';

interface PaymentUnionIds {
  readonly workspaceId: string;
  readonly membershipId: string;
  readonly companyId: string;
  readonly sourceClientId: string;
  readonly targetClientId: string;
}

/**
 * Two PRIMARY-only Client duplicates of one Company on a database migrated
 * from empty. The owner's captured Director v1 is refreshed to v2 through the
 * public revoke and regrant before the Document and Payment grants.
 */
export async function openPaymentEvidenceUnionFixture(databaseUrl: string) {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  let companyId: string | null = null;
  let established: PaymentUnionIds | undefined;
  const previousWorkspaceKey = process.env.ACCESS_BOOTSTRAP_WORKSPACE_KEY;
  delete process.env.ACCESS_BOOTSTRAP_WORKSPACE_KEY;

  function ids(): PaymentUnionIds {
    if (!established)
      throw new Error('The Payment union fixture is not established yet.');
    return established;
  }
  async function openHarness() {
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: OWNER.provider,
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: OWNER.subject,
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Fictional Payment Union Workspace',
        ...scanner.environment,
      },
    });
  }
  function rawPool(): Pool {
    return harness.pool;
  }
  async function close() {
    try {
      await harness?.close();
      await database?.close();
      await scanner?.close();
    } finally {
      if (previousWorkspaceKey === undefined)
        delete process.env.ACCESS_BOOTSTRAP_WORKSPACE_KEY;
      else process.env.ACCESS_BOOTSTRAP_WORKSPACE_KEY = previousWorkspaceKey;
    }
  }
  function headers(company: string | null) {
    return {
      'x-test-external-provider': OWNER.provider,
      'x-test-external-subject': OWNER.subject,
      'x-test-display-name': OWNER.displayName,
      'x-test-email': OWNER.email,
      ...(company ? { 'x-company-context-id': company } : {}),
    };
  }
  function call(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      key?: string;
      company?: string | null;
    } = {},
  ) {
    return fetch(harness.origin + '/api' + path, {
      method: options.method ?? 'GET',
      headers: {
        ...headers(options.company === undefined ? companyId : options.company),
        'content-type': 'application/json',
        'idempotency-key': options.key ?? randomUUID(),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  }
  async function setup(response: Response, status: number) {
    if (response.status !== status)
      throw new Error(
        `Payment union setup expected ${status}, received ${response.status}: ${await response.text()}`,
      );
    return paymentJson(response);
  }
  function grant(path: string, membershipId: string) {
    return call(path, {
      method: 'POST',
      company: null,
      body: { companyId, workspaceMembershipId: membershipId },
    });
  }
  function upload(input: {
    documentId: string;
    versionId: string;
    revision: number;
    bytes: Buffer;
    key?: string;
  }) {
    return fetch(
      `${harness.origin}/api/documents/${input.documentId}/versions/${input.versionId}/content?expectedRevision=${input.revision}&fileName=fictional-payment-notice.pdf`,
      {
        method: 'POST',
        headers: {
          ...headers(ids().companyId),
          'content-type': 'application/pdf',
          'idempotency-key': input.key ?? randomUUID(),
        },
        body: new Uint8Array(input.bytes),
      },
    );
  }
  async function review() {
    return setup(
      await call(`/clients/${ids().sourceClientId}/union-reviews`, {
        method: 'POST',
        body: {},
      }),
      201,
    );
  }
  function confirmation() {
    const { companyId, sourceClientId, targetClientId } = ids();
    return {
      canonicalClientId: targetClientId,
      fields: {
        displayName: targetClientId,
        taxId: sourceClientId,
        address: sourceClientId,
        telephone: sourceClientId,
        generalEmail: sourceClientId,
        businessActivity: sourceClientId,
      },
      companyIds: [companyId],
      reviewedDifferences: true,
      reason:
        'Fictional PRIMARY-only duplicates reviewed; preserve both original identities',
    };
  }
  function confirm(reviewReference: string, key = randomUUID()) {
    return call(`/client-union-reviews/${reviewReference}/confirm`, {
      method: 'POST',
      body: confirmation(),
      key,
    });
  }
  async function register(displayName: string, taxId: string) {
    return paymentText(
      (
        await setup(
          await call('/clients', {
            method: 'POST',
            body: { displayName, taxId },
          }),
          201,
        )
      ).id,
    );
  }
  try {
    scanner = await openDocumentScannerFixture();
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'payment_client_union',
    });
    await openHarness();
    const membershipId = paymentText(
      (await setup(await call('/access/current-actor'), 200))
        .workspaceMembershipId,
    );
    const registeredCompanyId = paymentText(
      (
        await setup(
          await call('/companies', {
            method: 'POST',
            body: { displayName: 'Fictional Payment Union Company' },
          }),
          201,
        )
      ).id,
    );
    companyId = registeredCompanyId;
    for (const path of [
      '/company-context-assignments',
      '/company-director-client-assignments',
    ])
      await setup(await grant(path, membershipId), 201);
    const sourceClientId = await register(
      'Fictional Payer A',
      'PAYMENT-UNION-A-1045',
    );
    const targetClientId = await register(
      'Fictional Payer B',
      'PAYMENT-UNION-B-1045',
    );
    // Current commands refuse a duplicate tax ID, so this labeled SQL seam
    // makes the two public dossiers duplicates, as the other Client union
    // suites do; the Company, grants and every union action stay public.
    await rawPool().query(
      'UPDATE client_accounts SET tax_id = $2 WHERE id = ANY($1::uuid[])',
      [[sourceClientId, targetClientId], PAYMENT_UNION_TAX_ID],
    );
    // The registry still reads a captured Director v1 (#1148); this seam
    // captures it on the owner's live grant before the public refresh.
    await rawPool().query(
      `UPDATE company_role_assignments SET permission_set_version = 'v1'
       WHERE company_id = $1 AND workspace_membership_id = $2
         AND bundle = 'company_director_client_access' AND revoked_at IS NULL`,
      [registeredCompanyId, membershipId],
    );
    established = {
      workspaceId: WORKSPACE_ID,
      membershipId,
      companyId: registeredCompanyId,
      sourceClientId,
      targetClientId,
    };
    const beforeActor = await setup(await call('/access/current-actor'), 200);
    const revoked = await setup(
      await call(
        `/company-director-client-assignments/${membershipId}/${registeredCompanyId}`,
        { method: 'DELETE', company: null },
      ),
      200,
    );
    const refreshed = await setup(
      await grant('/company-director-client-assignments', membershipId),
      201,
    );
    for (const path of [
      '/company-document-registrar-assignments',
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
      '/company-document-approver-assignments',
      '/company-payment-reader-assignments',
      '/company-payment-recorder-assignments',
      '/company-payment-evidence-access-assignments',
    ])
      await setup(await grant(path, membershipId), 201);
    const afterActor = await setup(await call('/access/current-actor'), 200);
    return {
      ids: established,
      beforeActor,
      afterActor,
      revoked,
      refreshed,
      call,
      upload,
      review,
      confirmation,
      confirm,
      close,
      async restart() {
        await harness.close();
        await openHarness();
      },
      get scanner() {
        return scanner;
      },
      get pool() {
        return rawPool();
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
export type PaymentEvidenceUnionFixture = Awaited<
  ReturnType<typeof openPaymentEvidenceUnionFixture>
>;

/** Private observation only: all callers compare rejected-command atomicity. */
export async function paymentUnionRejectionEffects(pool: Pool) {
  const result: unknown[] = [];
  for (const table of [
    'working_documents',
    'payment_evidence_document_sources',
    'document_versions',
    'document_pdfs',
    'document_version_commands',
    'document_correction_commands',
    'document_registration_events',
    'activity_log_events',
    'client_accounts',
    'client_company_relationships',
    'client_union_operations',
    'client_union_projections',
  ])
    result.push(
      (
        await pool.query<{ row: unknown }>(
          `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`,
        )
      ).rows,
    );
  return result;
}
