import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { types } from 'pg';
import {
  openEstimateOfferFixture,
  ESTIMATE_OFFER_PREPARER,
  responseString,
  responseRecord,
} from '../offer/offer-estimate-preparation.test-support.js';
import { revokeModelContractFixtureGrant } from '../contract/model-contract.test-fixture.js';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import { PDF_A, PDF_B } from './mission-document.test-support.js';
import {
  prepareReceivedContractSource,
  registerReceivedContract,
  receivedContractEffects,
} from './received-contract.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Received Contract atomicity and current authority REST', () => {
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

  it.each([
    ['received-contract-access', 404],
    ['document-content-reader', 403],
    ['document-content-uploader', 403],
    ['document-registrar', 403],
  ] as const)(
    'rechecks %s after a scanner barrier and commits no failed upload',
    async (bundle, status) => {
      const f = await registerReceivedContract(fixture);
      for (const path of [
        '/company-document-content-reader-assignments',
        '/company-document-content-uploader-assignments',
      ])
        await fixture.grant({
          path,
          companyId: f.ready.source.companyId,
          membershipId: f.ready.source.preparerMembershipId,
        });
      const before = await receivedContractEffects(fixture.pool);
      const versionId = responseString(
        responseRecord(f.document.version),
        'id',
      );
      const barrier = scanner.holdNextScan();
      const pending = f.upload(
        versionId,
        1,
        PDF_A,
        'same-held-received-upload',
      );
      try {
        await Promise.race([
          barrier.reached,
          pending.then(() => {
            throw new Error('Upload missed scanner barrier');
          }),
        ]);
        await revokeModelContractFixtureGrant(
          fixture,
          `/company-${bundle}-assignments`,
          f.ready.source.companyId,
          f.ready.source.preparerMembershipId,
        );
        barrier.release();
        expect((await pending).status).toBe(status);
      } finally {
        barrier.release();
        await pending.catch(() => undefined);
      }
      await fixture.grant({
        path: `/company-${bundle}-assignments`,
        companyId: f.ready.source.companyId,
        membershipId: f.ready.source.preparerMembershipId,
      });
      const after = await receivedContractEffects(fixture.pool);
      expect(after.working_documents).toEqual(before.working_documents);
      expect(after.document_pdfs).toEqual(before.document_pdfs);
      expect(after.document_version_commands).toEqual(
        before.document_version_commands,
      );
      expect(after.client_accounts).toEqual(before.client_accounts);
      expect(await (await f.call('/versions')).json()).toMatchObject({
        workingRevision: 1,
        versions: [{ pdfContent: { state: 'absent' } }],
      });
      expect(
        (await f.upload(versionId, 1, PDF_A, 'same-held-received-upload'))
          .status,
      ).toBe(201);
    },
  );

  it.each(['clean', 'unsafe', 'unavailable', 'malformed'] as const)(
    'preserves or refuses a %s external scanner outcome without inferring signing',
    async (mode) => {
      const f = await registerReceivedContract(fixture);
      for (const path of [
        '/company-document-content-reader-assignments',
        '/company-document-content-uploader-assignments',
      ])
        await fixture.grant({
          path,
          companyId: f.ready.source.companyId,
          membershipId: f.ready.source.preparerMembershipId,
        });
      const before = await receivedContractEffects(fixture.pool);
      scanner.setScanMode(mode);
      const result = await f.upload(
        responseString(responseRecord(f.document.version), 'id'),
        1,
        PDF_A,
      );
      expect(result.status).toBe(
        mode === 'clean' ? 201 : mode === 'unsafe' ? 400 : 503,
      );
      if (mode !== 'clean')
        expect(await receivedContractEffects(fixture.pool)).toEqual(before);
      expect(await (await f.call('')).json()).toMatchObject({
        receivedContractRelation: f.document.receivedContractRelation,
      });
    },
  );

  it('serializes simultaneous identical registrations and conflicting uploads without replacing conserved bytes', async () => {
    const f = await registerReceivedContract(fixture);
    const options = { ...f.options, key: 'concurrent-received-registration' };
    const responses = await Promise.all([
      fixture.post(options),
      fixture.post(options),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(await responses[0]?.json()).toEqual(await responses[1]?.json());
    for (const path of [
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
    ])
      await fixture.grant({
        path,
        companyId: f.ready.source.companyId,
        membershipId: f.ready.source.preparerMembershipId,
      });
    const versionId = responseString(responseRecord(f.document.version), 'id');
    const barrier = scanner.holdNextScan();
    const pending = f.upload(versionId, 1, PDF_A, 'held-first');
    try {
      await Promise.race([
        barrier.reached,
        pending.then(() => {
          throw new Error('Upload missed barrier');
        }),
      ]);
      expect((await f.upload(versionId, 1, PDF_B, 'second-wins')).status).toBe(
        201,
      );
      barrier.release();
      expect((await pending).status).toBe(409);
    } finally {
      barrier.release();
      await pending.catch(() => undefined);
    }
    expect(
      Buffer.from(
        await (await f.call(`/versions/${versionId}/content`)).arrayBuffer(),
      ),
    ).toEqual(PDF_B);
    expect(
      await (await f.call(`/versions/${versionId}/content/history`)).json(),
    ).toMatchObject({
      uploads: [{ revision: 2, current: true }],
      nextBeforeRevision: null,
    });
  });

  it('freezes the exact committed PDF when official designation wins against a later scanned upload', async () => {
    const f = await registerReceivedContract(fixture),
      s = f.ready.source;
    for (const path of [
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
      '/company-document-approver-assignments',
    ])
      await fixture.grant({
        path,
        companyId: s.companyId,
        membershipId: s.preparerMembershipId,
      });
    const versionId = responseString(responseRecord(f.document.version), 'id');
    expect((await f.upload(versionId, 1, PDF_A)).status).toBe(201);
    const barrier = scanner.holdNextScan(),
      pending = f.upload(versionId, 2, PDF_B, 'late-designated-upload');
    try {
      await Promise.race([
        barrier.reached,
        pending.then(() => {
          throw new Error('Upload missed scanner barrier');
        }),
      ]);
      expect(
        (
          await f.mutate(`/versions/${versionId}/official-designation`, {
            expectedRevision: 2,
          })
        ).status,
      ).toBe(200);
      barrier.release();
      expect((await pending).status).toBe(409);
    } finally {
      barrier.release();
      await pending.catch(() => undefined);
    }
    expect(
      Buffer.from(
        await (await f.call(`/versions/${versionId}/content`)).arrayBuffer(),
      ),
    ).toEqual(PDF_A);
    expect(await (await f.call('/versions')).json()).toMatchObject({
      workingRevision: 3,
      versions: [{ status: 'official' }],
    });
  });

  it.each([
    'received_contract_document_relations',
    'document_registration_events',
  ] as const)(
    'rolls registration, draft, exact relation, Client fence, receipt and response back on final %s failure',
    async (table) => {
      const f = await prepareReceivedContractSource(fixture);
      const options = {
        path: '/documents',
        companyId: f.ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        key: 'failed-received-registration',
        body: {
          type: 'received-contract',
          opportunityId: f.ready.source.opportunityId,
          contractId: f.contractId,
          contractVersionId: f.contractVersionId,
          title: 'Atomic received original',
          purpose: 'No partial preservation',
          sourceDescription: 'Synthetic source',
        },
      };
      const before = await receivedContractEffects(fixture.pool);
      await fixture.pool.query(
        "CREATE FUNCTION fail_received_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic final received write failure' USING ERRCODE='23514'; END $$",
      );
      // Only the two closed literal test tables above reach fixture DDL.
      await fixture.pool.query(
        `CREATE TRIGGER fail_received_write BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_received_write()`,
      );
      try {
        expect((await fixture.post(options)).status).toBe(500);
      } finally {
        await fixture.pool.query(
          `DROP TRIGGER fail_received_write ON ${table}`,
        );
        await fixture.pool.query('DROP FUNCTION fail_received_write()');
      }
      expect(await receivedContractEffects(fixture.pool)).toEqual(before);
      expect((await fixture.post(options)).status).toBe(201);
    },
  );

  it('rolls every registration effect back when the real PostgreSQL driver cannot decode its final relation response', async () => {
    const f = await prepareReceivedContractSource(fixture);
    const source = 'Synthetic received relation decoder fault 872';
    const options = {
      path: '/documents',
      companyId: f.ready.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      key: 'response-failed-received-registration',
      body: {
        type: 'received-contract',
        opportunityId: f.ready.source.opportunityId,
        contractId: f.contractId,
        contractVersionId: f.contractVersionId,
        title: 'Atomic response original',
        purpose: 'No identity without a constructed response',
        sourceDescription: source,
      },
    };
    const before = await receivedContractEffects(fixture.pool);
    const decode = types.getTypeParser(25, 'text');
    // True database-driver boundary: the owner, transaction and response projection remain real.
    types.setTypeParser(25, 'text', (value) => {
      if (value === source)
        throw new Error('Synthetic received source decode failure');
      return decode(value);
    });
    try {
      expect((await fixture.post(options)).status).toBe(500);
    } finally {
      types.setTypeParser(25, 'text', decode);
    }
    expect(await receivedContractEffects(fixture.pool)).toEqual(before);
    expect((await fixture.post(options)).status).toBe(201);
  });

  it('refuses actual-stream oversize and structurally invalid PDF bytes without a false receipt', async () => {
    const f = await registerReceivedContract(fixture);
    for (const path of [
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
    ])
      await fixture.grant({
        path,
        companyId: f.ready.source.companyId,
        membershipId: f.ready.source.preparerMembershipId,
      });
    const before = await receivedContractEffects(fixture.pool);
    const versionId = responseString(responseRecord(f.document.version), 'id');
    expect(
      (
        await f.upload(
          versionId,
          1,
          Buffer.alloc(5 * 1024 * 1024 + 1),
          'bad-received-pdf',
        )
      ).status,
    ).toBe(413);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < 6; index++)
          controller.enqueue(new Uint8Array(1024 * 1024));
        controller.close();
      },
    });
    const streamingInit = {
      method: 'POST',
      headers: {
        'content-type': 'application/pdf',
        'idempotency-key': 'chunked-received-pdf',
        // The deliberately oversized streamed exchange owns a disposable HTTP connection.
        connection: 'close',
      },
      body: stream,
      duplex: 'half',
    };
    const chunked = await fixture.request({
      path:
        f.path +
        `/versions/${versionId}/content?expectedRevision=1&fileName=chunked-demo.pdf`,
      companyId: f.ready.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      init: streamingInit,
    });
    expect(chunked.status).toBe(413);
    expect(await chunked.json()).toMatchObject({ statusCode: 413 });
    expect(scanner.scanCount).toBe(0);
    expect(
      (
        await f.upload(
          versionId,
          1,
          Buffer.from('%PDF-1.7\ninvalid'),
          'bad-received-pdf',
        )
      ).status,
    ).toBe(400);
    expect(await receivedContractEffects(fixture.pool)).toEqual(before);
    expect(
      (await f.upload(versionId, 1, PDF_A, 'bad-received-pdf')).status,
    ).toBe(201);
  });

  it.each([true, false])(
    'preserves the exact historical relation with a public Contract successor, Document first: %s',
    async (documentFirst) => {
      const f = await prepareReceivedContractSource(fixture),
        s = f.ready.source;
      const registration = {
        path: '/documents',
        companyId: s.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        key: 'source-succession-registration',
        body: {
          type: 'received-contract',
          opportunityId: s.opportunityId,
          contractId: f.contractId,
          contractVersionId: f.contractVersionId,
          title: 'Exact source across concurrent succession',
          purpose: 'Preserve declared original Version',
          sourceDescription: 'Synthetic source',
        },
      };
      const successor = {
        path: f.ready.path + '/versions/from-approved-model',
        companyId: s.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        key: 'concurrent-source-successor',
        body: { ...f.ready.intent, expectedContractRevision: 1 },
      };
      const table = documentFirst
        ? 'document_registration_events'
        : 'contract_events';
      const barrier = await fixture.pool.connect();
      let first: Promise<Response> | undefined,
        second: Promise<Response> | undefined;
      await fixture.pool.query(
        'CREATE FUNCTION pause_received_source_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(872873); RETURN NEW; END $$',
      );
      await fixture.pool.query(
        `CREATE TRIGGER pause_received_source_order BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION pause_received_source_order()`,
      );
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        await barrier.query('SELECT pg_advisory_xact_lock(872873)');
        first = fixture.post(documentFirst ? registration : successor);
        await waitForBlocked(fixture.pool, pid);
        second = fixture.post(documentFirst ? successor : registration);
        await waitForBlocked(fixture.pool, pid, 2);
        await barrier.query('COMMIT');
        expect((await first).status).toBe(201);
        expect((await second).status).toBe(201);
        const document = responseRecord(
          await (documentFirst ? first : second).then((response) =>
            response.json(),
          ),
        );
        expect(document).toMatchObject({
          receivedContractRelation: {
            access: 'granted',
            contractVersionId: f.contractVersionId,
            contractVersionNumber: 1,
          },
        });
        expect(await fixture.command(registration)).toEqual(document);
      } finally {
        await barrier.query('ROLLBACK').catch(() => undefined);
        barrier.release();
        await first?.catch(() => undefined);
        await second?.catch(() => undefined);
        await fixture.pool.query(
          `DROP TRIGGER pause_received_source_order ON ${table}`,
        );
        await fixture.pool.query('DROP FUNCTION pause_received_source_order()');
      }
    },
  );

  const changes = [
    {
      name: 'family capture revocation',
      subject: 'MEMBER',
      lock: "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_received_contract_access' FOR UPDATE",
      change:
        "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_received_contract_access'",
      status: 403,
      replay: 403,
    },
    {
      name: 'Contract read revocation',
      subject: 'MEMBER',
      lock: "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle IN ('company_contract_preparer','company_contract_approver') FOR UPDATE",
      change:
        "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle IN ('company_contract_preparer','company_contract_approver')",
      status: 403,
      replay: 403,
    },
    {
      name: 'Opportunity read revocation',
      subject: 'MEMBER',
      lock: "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_commercial_intake' FOR UPDATE",
      change:
        "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_commercial_intake'",
      status: 403,
      replay: 403,
    },
    {
      name: 'original Client archive',
      subject: 'CLIENT',
      lock: 'SELECT id FROM client_accounts WHERE id=$2 AND workspace_id=(SELECT workspace_id FROM companies WHERE id=$1) FOR UPDATE',
      change:
        "UPDATE client_accounts SET status='archived' WHERE id=$2 AND workspace_id=(SELECT workspace_id FROM companies WHERE id=$1)",
      status: 404,
      replay: 404,
    },
    {
      name: 'readable original Client supersession',
      subject: 'CLIENT',
      lock: 'SELECT id FROM client_accounts WHERE id=$2 AND workspace_id=(SELECT workspace_id FROM companies WHERE id=$1) FOR UPDATE',
      change:
        "UPDATE client_accounts SET status='superseded' WHERE id=$2 AND workspace_id=(SELECT workspace_id FROM companies WHERE id=$1)",
      status: 404,
      replay: 201,
    },
  ] as const;
  it.each(changes)(
    'serializes both orders of $name and relation registration',
    async (change) => {
      for (const changeFirst of [true, false]) {
        if (!changeFirst) await fixture.reset();
        const f = await prepareReceivedContractSource(fixture);
        const values = [
          f.ready.source.companyId,
          change.subject === 'CLIENT'
            ? f.ready.source.clientId
            : f.ready.source.preparerMembershipId,
        ];
        const options = {
          path: '/documents',
          companyId: f.ready.source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          key: 'ordered-received-registration',
          body: {
            type: 'received-contract',
            opportunityId: f.ready.source.opportunityId,
            contractId: f.contractId,
            contractVersionId: f.contractVersionId,
            title: 'Ordered received original',
            purpose: 'Preserve exact ordering',
            sourceDescription: 'Synthetic source',
          },
        };
        const before = await receivedContractEffects(fixture.pool);
        const barrier = await fixture.pool.connect();
        let pending: Promise<Response> | undefined,
          mutation: Promise<unknown> | undefined;
        try {
          await barrier.query('BEGIN');
          const pid = await backendPid(barrier);
          if (changeFirst) {
            await barrier.query(change.lock, values);
            pending = fixture.post(options);
            await waitForBlocked(fixture.pool, pid);
            await barrier.query(change.change, values);
            await barrier.query('COMMIT');
            expect((await pending).status).toBe(change.status);
            const after = await receivedContractEffects(fixture.pool);
            expect(after.working_documents).toEqual(before.working_documents);
            expect(after.received_contract_document_relations).toEqual(
              before.received_contract_document_relations,
            );
            expect(after.document_versions).toEqual(before.document_versions);
            expect(after.document_registration_events).toEqual(
              before.document_registration_events,
            );
          } else {
            await fixture.pool.query(
              'CREATE FUNCTION pause_received_registration() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(872872); RETURN NEW; END $$',
            );
            await fixture.pool.query(
              'CREATE TRIGGER pause_received_registration BEFORE INSERT ON document_registration_events FOR EACH ROW EXECUTE FUNCTION pause_received_registration()',
            );
            await barrier.query('SELECT pg_advisory_xact_lock(872872)');
            pending = fixture.post(options);
            await waitForBlocked(fixture.pool, pid);
            mutation = fixture.pool.query(change.change, values);
            await waitForBlocked(fixture.pool, pid, 2);
            await barrier.query('COMMIT');
            expect((await pending).status).toBe(201);
            await mutation;
            const committed = await receivedContractEffects(fixture.pool);
            expect((await fixture.post(options)).status).toBe(change.replay);
            expect(await receivedContractEffects(fixture.pool)).toEqual(
              committed,
            );
          }
        } finally {
          await barrier.query('ROLLBACK').catch(() => undefined);
          barrier.release();
          await pending?.catch(() => undefined);
          await mutation?.catch(() => undefined);
          await fixture.pool.query(
            'DROP TRIGGER IF EXISTS pause_received_registration ON document_registration_events',
          );
          await fixture.pool.query(
            'DROP FUNCTION IF EXISTS pause_received_registration()',
          );
        }
      }
    },
  );
});
