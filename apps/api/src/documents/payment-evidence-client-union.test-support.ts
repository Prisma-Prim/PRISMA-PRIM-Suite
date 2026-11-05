import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import type { Pool } from 'pg';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import {
  paymentJson,
  paymentRecord,
  paymentText,
} from './payment-evidence.test-support.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const directory = 'test-support/payment-evidence-legacy-union';

/** Genuine pre-union native0013 input; distinct from the complete f879 upgrade fixture. */
export async function openPaymentEvidenceUnionFixture(databaseUrl: string) {
  const backup = await readFile(directory + '/predecessor-native-0013.sql.gz');
  // Compress the authentic raw JSON rather than reformatting its captured bytes.
  const contextBytes = gunzipSync(
    await readFile(directory + '/context.json.gz'),
  );
  const provenanceValue: unknown = JSON.parse(
    await readFile(directory + '/provenance.json', 'utf8'),
  );
  const contextValue: unknown = JSON.parse(contextBytes.toString('utf8'));
  const provenance = paymentRecord(provenanceValue);
  const context = paymentRecord(contextValue);
  if (
    provenance.source !== '9b791d7f0fe5de862fab575ca0261c91cf2b8e59' ||
    provenance.tree !== '8358eefdcf2ed0fcf0502b1b720507d206286f59' ||
    provenance.closedProducerBeforeDump !== true ||
    provenance.noUnionBeforeCapture !== true ||
    createHash('sha256').update(backup).digest('hex') !==
      provenance.backupSha256 ||
    provenance.backupSha256 !==
      '425e0208dab0cf0d1877ab29699770705d43fcd75516d28138d5820ee2df5343' ||
    createHash('sha256').update(contextBytes).digest('hex') !==
      provenance.contextSha256 ||
    provenance.contextSha256 !==
      'a1559792b656f97fe9bf0674433402d0d6e128525db5d86661ddc5e5872cb838'
  )
    throw new Error(
      'The authentic historical Payment union fixture does not match its provenance.',
    );
  const idsValue = paymentRecord(context.ids);
  const ids = {
    workspaceId: paymentText(idsValue.workspaceId),
    internalUserId: paymentText(idsValue.internalUserId),
    membershipId: paymentText(idsValue.membershipId),
    companyId: paymentText(idsValue.companyId),
    sourceClientId: paymentText(idsValue.sourceClientId),
    targetClientId: paymentText(idsValue.targetClientId),
  };
  const identity = paymentRecord(context.identity);
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  const previousWorkspaceKey = process.env.ACCESS_BOOTSTRAP_WORKSPACE_KEY;
  delete process.env.ACCESS_BOOTSTRAP_WORKSPACE_KEY;

  async function openHarness() {
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      synchronizeIdentityProfile: false,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: paymentText(identity.provider),
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: paymentText(identity.subject),
        ACCESS_BOOTSTRAP_WORKSPACE_ID: ids.workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME:
          'Fictional Historical Payment Workspace',
        ...scanner.environment,
      },
    });
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
      'x-test-external-provider': paymentText(identity.provider),
      'x-test-external-subject': paymentText(identity.subject),
      'x-test-display-name': paymentText(identity.displayName),
      'x-test-email': paymentText(identity.email),
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
        ...headers(
          options.company === undefined ? ids.companyId : options.company,
        ),
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
        `Native migrated union setup expected ${status}, received ${response.status}: ${await response.text()}`,
      );
    return paymentJson(response);
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
          ...headers(ids.companyId),
          'content-type': 'application/pdf',
          'idempotency-key': input.key ?? randomUUID(),
        },
        body: new Uint8Array(input.bytes),
      },
    );
  }
  async function review() {
    return setup(
      await call(`/clients/${ids.sourceClientId}/union-reviews`, {
        method: 'POST',
        body: {},
      }),
      201,
    );
  }
  function confirmation() {
    return {
      canonicalClientId: ids.targetClientId,
      fields: {
        displayName: ids.targetClientId,
        taxId: ids.sourceClientId,
        address: ids.sourceClientId,
        telephone: ids.sourceClientId,
        generalEmail: ids.sourceClientId,
        businessActivity: ids.sourceClientId,
      },
      companyIds: [ids.companyId],
      reviewedDifferences: true,
      reason:
        'Fictional historical PRIMARY dossiers reviewed; preserve both original identities',
    };
  }
  function confirm(reviewReference: string, key = randomUUID()) {
    return call(`/client-union-reviews/${reviewReference}/confirm`, {
      method: 'POST',
      body: confirmation(),
      key,
    });
  }
  try {
    scanner = await openDocumentScannerFixture();
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'payment_legacy_union',
    });
    const sql = gunzipSync(backup).toString('utf8');
    if (/DISABLE TRIGGER|session_replication_role/u.test(sql))
      throw new Error('A historical input may not disable native integrity.');
    // This genuine dump owns its public schema; the new isolated database has
    // only PostgreSQL's empty default schema. Refuse to remove populated input.
    const existing = await database.targetPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_tables WHERE schemaname IN ('public','drizzle')",
    );
    if (existing.rows[0]?.count !== 0)
      throw new Error('Legacy restore requires an empty isolated database.');
    await database.targetPool.query('DROP SCHEMA public');
    const emptySearchPath =
      "SELECT pg_catalog.set_config('search_path', '', false);";
    if (sql.split(emptySearchPath).length !== 2)
      throw new Error('Expected the captured pg_dump session search path.');
    // The artifact is unchanged. pg's SQL protocol omits only pg_dump's psql meta commands.
    await database.targetPool.query(
      sql
        .replace(
          emptySearchPath,
          "SELECT pg_catalog.set_config('search_path', 'public', false);",
        )
        .split('\n')
        .filter((line) => !/^\\(?:un)?restrict /u.test(line))
        .join('\n'),
    );
    await database.targetPool.query('SET search_path TO public');
    await openHarness();
    const beforeActor = await setup(await call('/access/current-actor'), 200);
    const revoked = await setup(
      await call(
        `/company-director-client-assignments/${ids.membershipId}/${ids.companyId}`,
        { method: 'DELETE', company: null },
      ),
      200,
    );
    const refreshed = await setup(
      await call('/company-director-client-assignments', {
        method: 'POST',
        company: null,
        body: {
          companyId: ids.companyId,
          workspaceMembershipId: ids.membershipId,
        },
      }),
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
      await setup(
        await call(path, {
          method: 'POST',
          company: null,
          body: {
            companyId: ids.companyId,
            workspaceMembershipId: ids.membershipId,
          },
        }),
        201,
      );
    const afterActor = await setup(await call('/access/current-actor'), 200);
    return {
      ids,
      context,
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
        return harness.pool;
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
