import { randomUUID } from 'node:crypto';
import { PDFDocument, PDFHexString, PDFName } from 'pdf-lib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { revokeModelContractFixtureGrant } from '../contract/model-contract.test-fixture.js';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import {
  externalInvoiceEffects,
  fictionalInvoicePdf,
  openExternalInvoiceDocument,
  prepareExternalInvoiceSource,
} from './external-invoice.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const authorityChanges = [
  {
    name: 'finance capture',
    lock: "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_invoice_recorder' AND revoked_at IS NULL FOR UPDATE",
    change:
      "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_invoice_recorder' AND revoked_at IS NULL",
  },
  {
    name: 'financial family capture',
    lock: "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_external_invoice_access' AND revoked_at IS NULL FOR UPDATE",
    change:
      "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_external_invoice_access' AND revoked_at IS NULL",
  },
  {
    name: 'native Registrar capture',
    lock: "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_document_registrar' AND revoked_at IS NULL FOR UPDATE",
    change:
      "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_document_registrar' AND revoked_at IS NULL",
  },
  {
    name: 'Contract read alternatives',
    lock: "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle IN ('company_contract_preparer','company_contract_approver') AND revoked_at IS NULL FOR UPDATE",
    change:
      "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle IN ('company_contract_preparer','company_contract_approver') AND revoked_at IS NULL",
  },
  {
    name: 'Opportunity read capture',
    lock: "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_commercial_intake' AND revoked_at IS NULL FOR UPDATE",
    change:
      "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_commercial_intake' AND revoked_at IS NULL",
  },
  {
    name: 'original Client read capture',
    lock: "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_director_client_access' AND revoked_at IS NULL FOR UPDATE",
    change:
      "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_director_client_access' AND revoked_at IS NULL",
  },
  {
    name: 'Internal User activation',
    lock: 'SELECT u.id FROM internal_users u JOIN workspace_memberships m ON m.internal_user_id=u.id WHERE m.id=$2 AND m.workspace_id=(SELECT workspace_id FROM companies WHERE id=$1) FOR UPDATE OF u',
    change:
      "UPDATE internal_users SET status='inactive' WHERE id=(SELECT internal_user_id FROM workspace_memberships WHERE id=$2 AND workspace_id=(SELECT workspace_id FROM companies WHERE id=$1))",
  },
  {
    name: 'membership activation',
    lock: 'SELECT id FROM workspace_memberships WHERE id=$2 AND workspace_id=(SELECT workspace_id FROM companies WHERE id=$1) FOR UPDATE',
    change:
      "UPDATE workspace_memberships SET status='inactive' WHERE id=$2 AND workspace_id=(SELECT workspace_id FROM companies WHERE id=$1)",
  },
  {
    name: 'Company activation',
    lock: 'SELECT id FROM companies WHERE id=$1 AND EXISTS(SELECT 1 FROM workspace_memberships WHERE id=$2 AND workspace_id=companies.workspace_id) FOR UPDATE',
    change:
      "UPDATE companies SET status='inactive' WHERE id=$1 AND EXISTS(SELECT 1 FROM workspace_memberships WHERE id=$2 AND workspace_id=companies.workspace_id)",
  },
];

withPostgres('External invoice native concurrency and live authority', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
    });
  });
  beforeEach(async () => {
    await fixture.reset();
    scanner.reset();
  });
  afterAll(async () => {
    await fixture?.close();
    await scanner?.close();
  });

  it('serializes initial same-key registration and upload, then conserves exact replay against changed intent', async () => {
    const ready = await prepareExternalInvoiceSource(fixture);
    const [first, second] = await Promise.all([
      ready.request(),
      ready.request(),
    ]);
    expect([first.status, second.status]).toEqual([201, 201]);
    const document = responseRecord(await first.json());
    expect(await second.json()).toEqual(document);
    const committedRegistration = await externalInvoiceEffects(fixture);
    expect(
      (
        await ready.request({
          ...ready.body,
          sourceDescription: 'Changed declared source',
        })
      ).status,
    ).toBe(409);
    expect(
      (await ready.request({ ...ready.body, contractVersionId: randomUUID() }))
        .status,
    ).toBe(409);
    expect(await externalInvoiceEffects(fixture)).toEqual(
      committedRegistration,
    );
    const documentId = responseString(document, 'id');
    const versionId = responseString(responseRecord(document.version), 'id');
    const pdf = await fictionalInvoicePdf();
    const upload = (bytes: Uint8Array, key: string) =>
      fixture.request({
        ...ready.target,
        path: `/documents/${documentId}/versions/${versionId}/content?expectedRevision=1&fileName=fictional-invoice.pdf`,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/pdf',
            'idempotency-key': key,
          },
          body: new Uint8Array(bytes),
        },
      });
    const key = randomUUID();
    const barrier = scanner.holdNextScan();
    const pending = upload(pdf, key);
    try {
      await Promise.race([
        barrier.reached,
        pending.then(() => {
          throw new Error('Upload missed scanner barrier.');
        }),
      ]);
      const winner = await upload(pdf, key);
      expect(winner.status).toBe(201);
      const receipt = await winner.json();
      barrier.release();
      const replay = await pending;
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(receipt);
      const conserved = await externalInvoiceEffects(fixture);
      const scans = scanner.scanCount;
      expect(await (await upload(pdf, key)).json()).toEqual(receipt);
      expect(scanner.scanCount).toBe(scans);
      expect(
        (await upload(await fictionalInvoicePdf('SYN-INV-CONFLICT'), key))
          .status,
      ).toBe(409);
      expect(await externalInvoiceEffects(fixture)).toEqual(conserved);
      expect(
        responseRecord(
          await fixture.read({
            ...ready.target,
            path: `/documents/${documentId}/versions/${versionId}/content/history`,
          }),
        ).uploads,
      ).toHaveLength(1);
    } finally {
      barrier.release();
      await pending.catch(() => undefined);
    }
  });

  it('lets a competing revision commit before a held scanned upload and retains only the winning original bytes', async () => {
    const f = await openExternalInvoiceDocument(fixture);
    const versionId = responseString(responseRecord(f.document.version), 'id');
    const original = await fictionalInvoicePdf();
    const replacement = await fictionalInvoicePdf('SYN-INV-WINNER');
    const barrier = scanner.holdNextScan();
    const pending = f.upload(versionId, 1, original, 'held-losing-revision');
    try {
      await Promise.race([
        barrier.reached,
        pending.then(() => {
          throw new Error('Upload missed scanner barrier.');
        }),
      ]);
      expect(
        (await f.upload(versionId, 1, replacement, 'winning-revision')).status,
      ).toBe(201);
      const winner = await externalInvoiceEffects(fixture);
      barrier.release();
      expect((await pending).status).toBe(409);
      expect(await externalInvoiceEffects(fixture)).toEqual(winner);
      expect(
        Buffer.from(
          await (await f.call(`/versions/${versionId}/content`)).arrayBuffer(),
        ),
      ).toEqual(replacement);
      expect(
        responseRecord(
          await (await f.call(`/versions/${versionId}/content/history`)).json(),
        ).uploads,
      ).toHaveLength(1);
    } finally {
      barrier.release();
      await pending.catch(() => undefined);
    }
  });

  it.each(
    authorityChanges.flatMap((change) => [
      { ...change, order: 'revocation first', changeFirst: true },
      { ...change, order: 'registration first', changeFirst: false },
    ]),
  )(
    'linearizes $name with $order at actual PostgreSQL locks',
    async (change) => {
      const f = await prepareExternalInvoiceSource(fixture);
      const values = [f.companyId, f.membershipId];
      const before = await externalInvoiceEffects(fixture);
      const barrier = await fixture.pool.connect();
      let pending: Promise<Response> | undefined;
      let mutation: Promise<unknown> | undefined;
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        if (change.changeFirst) {
          await barrier.query(change.lock, values);
          pending = f.request();
          await waitForBlocked(fixture.pool, pid);
          await barrier.query(change.change, values);
          await barrier.query('COMMIT');
          expect((await pending).status).toBe(403);
          expect(await externalInvoiceEffects(fixture)).toEqual(before);
        } else {
          await fixture.pool.query(
            "CREATE FUNCTION pause_external_invoice_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM working_documents WHERE id=NEW.document_id AND type='external-invoice') THEN PERFORM pg_advisory_xact_lock(10201020); END IF; RETURN NEW; END $$",
          );
          await fixture.pool.query(
            'CREATE TRIGGER pause_external_invoice_commit BEFORE INSERT ON document_registration_events FOR EACH ROW EXECUTE FUNCTION pause_external_invoice_commit()',
          );
          await barrier.query('SELECT pg_advisory_xact_lock(10201020)');
          pending = f.request();
          await waitForBlocked(fixture.pool, pid);
          mutation = fixture.pool.query(change.change, values);
          await waitForBlocked(fixture.pool, pid, 2);
          await barrier.query('COMMIT');
          expect((await pending).status).toBe(201);
          await mutation;
          const committed = await externalInvoiceEffects(fixture);
          expect((await f.request()).status).toBe(403);
          expect(await externalInvoiceEffects(fixture)).toEqual(committed);
        }
      } finally {
        await barrier.query('ROLLBACK').catch(() => undefined);
        barrier.release();
        await pending?.catch(() => undefined);
        await mutation?.catch(() => undefined);
        await fixture.pool.query(
          'DROP TRIGGER IF EXISTS pause_external_invoice_commit ON document_registration_events',
        );
        await fixture.pool.query(
          'DROP FUNCTION IF EXISTS pause_external_invoice_commit()',
        );
      }
    },
  );

  it.each([
    {
      name: 'finance',
      routes: ['/company-invoice-recorder-assignments'],
      status: 404,
    },
    {
      name: 'financial family',
      routes: ['/company-external-invoice-access-assignments'],
      status: 404,
    },
    {
      name: 'Registrar',
      routes: ['/company-document-registrar-assignments'],
      status: 403,
    },
    {
      name: 'content Reader',
      routes: ['/company-document-content-reader-assignments'],
      status: 403,
    },
    {
      name: 'content Uploader',
      routes: ['/company-document-content-uploader-assignments'],
      status: 403,
    },
    {
      name: 'Client reader',
      routes: ['/company-director-client-assignments'],
      status: 403,
    },
  ])(
    'retires the held upload after $name equal-permission capture replacement, then permits a fresh retry',
    async (change) => {
      const f = await openExternalInvoiceDocument(fixture);
      const versionId = responseString(
        responseRecord(f.document.version),
        'id',
      );
      const pdf = await fictionalInvoicePdf();
      const before = await externalInvoiceEffects(fixture);
      const barrier = scanner.holdNextScan();
      const key = randomUUID();
      const pending = f.upload(versionId, 1, pdf, key);
      try {
        await Promise.race([
          barrier.reached,
          pending.then(() => {
            throw new Error('Upload missed scanner barrier.');
          }),
        ]);
        for (const path of change.routes) {
          await revokeModelContractFixtureGrant(
            fixture,
            path,
            f.companyId,
            f.membershipId,
          );
          await fixture.grant({
            path,
            companyId: f.companyId,
            membershipId: f.membershipId,
          });
        }
        const administered = await externalInvoiceEffects(fixture);
        expect({
          ...administered,
          activity_log_events: before.activity_log_events,
        }).toEqual(before);
        barrier.release();
        expect((await pending).status).toBe(change.status);
        expect(await externalInvoiceEffects(fixture)).toEqual(administered);
        expect((await f.upload(versionId, 1, pdf, key)).status).toBe(201);
        expect(
          responseRecord(
            await (
              await f.call(`/versions/${versionId}/content/history`)
            ).json(),
          ).uploads,
        ).toHaveLength(1);
      } finally {
        barrier.release();
        await pending.catch(() => undefined);
      }
    },
  );

  it.each([
    {
      name: 'Contract readers',
      routes: [
        '/company-contract-preparer-assignments',
        '/company-contract-approver-assignments',
      ],
    },
    {
      name: 'Opportunity reader',
      routes: ['/company-commercial-intake-assignments'],
    },
  ])(
    'continues the held native upload after $name capture replacement and redacts only the independently unavailable relation',
    async ({ routes }) => {
      const f = await openExternalInvoiceDocument(fixture);
      const versionId = responseString(
        responseRecord(f.document.version),
        'id',
      );
      const pdf = await fictionalInvoicePdf();
      const barrier = scanner.holdNextScan();
      const key = randomUUID();
      const pending = f.upload(versionId, 1, pdf, key);
      try {
        await Promise.race([
          barrier.reached,
          pending.then(() => {
            throw new Error('Upload missed scanner barrier.');
          }),
        ]);
        for (const path of routes) {
          await revokeModelContractFixtureGrant(
            fixture,
            path,
            f.companyId,
            f.membershipId,
          );
          await fixture.grant({
            path,
            companyId: f.companyId,
            membershipId: f.membershipId,
          });
        }
        barrier.release();
        const completed = await pending;
        expect(completed.status).toBe(201);
        const receipt = await completed.json();
        for (const path of routes)
          await revokeModelContractFixtureGrant(
            fixture,
            path,
            f.companyId,
            f.membershipId,
          );
        const detail = await f.call('');
        expect(detail.status).toBe(200);
        expect(await detail.json()).toMatchObject({
          id: f.documentId,
          title: f.body.title,
          externalInvoiceRelation: { access: 'denied' },
        });
        const unavailable = await externalInvoiceEffects(fixture);
        expect((await f.request(f.body, randomUUID())).status).toBe(403);
        expect(
          (
            await fixture.request({
              ...f.target,
              path: '/documents/external-invoice-sources',
            })
          ).status,
        ).toBe(403);
        expect(await externalInvoiceEffects(fixture)).toEqual(unavailable);
        const scans = scanner.scanCount;
        expect(await (await f.upload(versionId, 1, pdf, key)).json()).toEqual(
          receipt,
        );
        expect(scanner.scanCount).toBe(scans);
        const download = await f.call(`/versions/${versionId}/content`);
        expect(download.status).toBe(200);
        expect(Buffer.from(await download.arrayBuffer())).toEqual(pdf);
        const history = await f.call(`/versions/${versionId}/content/history`);
        expect(history.status).toBe(200);
        expect(responseRecord(await history.json()).uploads).toHaveLength(1);
        expect(await externalInvoiceEffects(fixture)).toEqual(unavailable);
      } finally {
        barrier.release();
        await pending.catch(() => undefined);
      }
    },
  );

  it.each([
    { mode: 'unsafe', status: 400 },
    { mode: 'unavailable', status: 503 },
    { mode: 'malformed', status: 503 },
  ] satisfies Array<{
    mode: 'unsafe' | 'unavailable' | 'malformed';
    status: number;
  }>)(
    'refuses the $mode scanner result without any source effect',
    async ({ mode, status }) => {
      const f = await openExternalInvoiceDocument(fixture);
      const versionId = responseString(
        responseRecord(f.document.version),
        'id',
      );
      const before = await externalInvoiceEffects(fixture);
      scanner.setScanMode(mode);
      expect(
        (await f.upload(versionId, 1, await fictionalInvoicePdf())).status,
      ).toBe(status);
      expect(await externalInvoiceEffects(fixture)).toEqual(before);
    },
  );

  it('refuses oversize, structurally invalid, encryption-marked and stale-revision PDFs with complete native effect conservation', async () => {
    const f = await openExternalInvoiceDocument(fixture);
    const versionId = responseString(responseRecord(f.document.version), 'id');
    const before = await externalInvoiceEffects(fixture);
    const scans = scanner.scanCount;
    expect(
      (await f.upload(versionId, 1, Buffer.alloc(5 * 1024 * 1024 + 1))).status,
    ).toBe(413);
    expect(scanner.scanCount).toBe(scans);
    const pdf = await fictionalInvoicePdf();
    expect((await f.upload(versionId, 2, pdf)).status).toBe(409);
    expect(scanner.scanCount).toBe(scans);
    expect(await externalInvoiceEffects(fixture)).toEqual(before);
    expect(
      (await f.upload(versionId, 1, Buffer.from('%PDF-1.7\ninvalid\n%%EOF')))
        .status,
    ).toBe(400);
    expect(await externalInvoiceEffects(fixture)).toEqual(before);
    // A real parsed PDF with the standard encryption trailer exercises the
    // native parser's encryption refusal; this fixture asserts no cryptographic claim.
    const marked = await PDFDocument.load(pdf);
    marked.context.trailerInfo.Encrypt = marked.context.register(
      marked.context.obj({
        Filter: PDFName.of('Standard'),
        V: 1,
        R: 2,
        O: PDFHexString.of('00'.repeat(32)),
        U: PDFHexString.of('00'.repeat(32)),
        P: -4,
      }),
    );
    expect((await f.upload(versionId, 1, await marked.save())).status).toBe(
      400,
    );
    expect(await externalInvoiceEffects(fixture)).toEqual(before);
    expect(
      responseRecord(await (await f.call('/versions')).json()),
    ).toMatchObject({
      workingRevision: 1,
      versions: [
        { id: versionId, status: 'draft', pdfContent: { state: 'absent' } },
      ],
    });
  });
});
