import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { revokeModelContractFixtureGrant } from '../contract/model-contract.test-fixture.js';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import {
  ESTIMATE_OFFER_PREPARER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import {
  fictionalAddendumPdf,
  prepareReceivedAddendumParent,
} from './received-addendum.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Received Addendum deterministic native command ordering', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  let parent: Awaited<ReturnType<typeof prepareReceivedAddendumParent>>;
  let pdfA: Buffer, pdfB: Buffer;
  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
    });
    pdfA = await fictionalAddendumPdf('Earlier exact source');
    pdfB = await fictionalAddendumPdf('Later competing source');
  });
  beforeEach(async () => {
    await fixture.reset();
    scanner.reset();
    parent = await prepareReceivedAddendumParent(fixture);
  });
  afterAll(async () => {
    await fixture?.close();
    await scanner?.close();
  });

  async function facts() {
    const result: Record<string, unknown> = {};
    for (const table of [
      'working_documents',
      'received_addendum_document_relations',
      'document_versions',
      'document_pdfs',
      'document_version_commands',
      'document_correction_commands',
      'document_registration_events',
    ])
      result[table] = (
        await fixture.pool.query<{ facts: unknown }>(
          `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) facts FROM ${table} t`,
        )
      ).rows[0]?.facts;
    return result;
  }
  async function clientVersion() {
    const row = (
      await fixture.pool.query<{ version: number }>(
        'SELECT version FROM client_accounts WHERE id=$1',
        [parent.ready.source.clientId],
      )
    ).rows[0];
    if (!row) throw new Error('The original native Client is required.');
    return row.version;
  }
  const upload = (input: {
    documentId: string;
    versionId: string;
    revision: number;
    bytes: Buffer;
    key?: string;
  }) =>
    parent.call(
      `/documents/${input.documentId}/versions/${input.versionId}/content?expectedRevision=${input.revision}&fileName=fictional-addendum.pdf`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/pdf',
          'idempotency-key': input.key ?? randomUUID(),
        },
        body: new Uint8Array(input.bytes),
      },
    );
  const mutate = (documentId: string, suffix: string, body: unknown) =>
    parent.call(`/documents/${documentId}${suffix}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify(body),
    });

  it.each([false, true])(
    'conserves one registration identity and refuses conflicting exact intent under a held key, changed body: %s',
    async (changed) => {
      const key = randomUUID(),
        barrier = await fixture.pool.connect();
      let first: Promise<Response> | undefined,
        second: Promise<Response> | undefined;
      await fixture.pool.query(
        'CREATE FUNCTION pause_addendum_registration() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(10491049); RETURN NEW; END $$',
      );
      await fixture.pool.query(
        'CREATE TRIGGER pause_addendum_registration BEFORE INSERT ON document_registration_events FOR EACH ROW EXECUTE FUNCTION pause_addendum_registration()',
      );
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        await barrier.query('SELECT pg_advisory_xact_lock(10491049)');
        first = parent.register(key);
        await waitForBlocked(fixture.pool, pid);
        second = parent.register(
          key,
          changed
            ? {
                ...parent.body,
                sourceDescription: 'Different exact declared intent',
              }
            : parent.body,
        );
        await waitForBlocked(fixture.pool, pid, 2);
        await barrier.query('COMMIT');
        const originalResponse = await first;
        expect(originalResponse.status).toBe(201);
        const original: unknown = await originalResponse.json();
        const retryResponse = await second;
        expect(retryResponse.status).toBe(changed ? 409 : 201);
        if (!changed) expect(await retryResponse.json()).toEqual(original);
        const committed = await facts(),
          fence = await clientVersion();
        const retry = await parent.register(key);
        expect(retry.status).toBe(201);
        expect(await retry.json()).toEqual(original);
        expect(await facts()).toEqual(committed);
        expect(await clientVersion()).toBe(fence);
        const rows = await parent.call('/documents');
        expect(await rows.json()).toEqual(
          expect.arrayContaining([
            expect.objectContaining(responseRecord(original)),
          ]),
        );
      } finally {
        await barrier.query('ROLLBACK').catch(() => undefined);
        barrier.release();
        await Promise.allSettled([
          ...(first ? [first] : []),
          ...(second ? [second] : []),
        ]);
        await fixture.pool.query(
          'DROP TRIGGER pause_addendum_registration ON document_registration_events',
        );
        await fixture.pool.query('DROP FUNCTION pause_addendum_registration()');
      }
    },
  );

  it('conserves independent identities for simultaneous equal intents under distinct keys', async () => {
    const beforeVersion = await clientVersion();
    const responses = await Promise.all([parent.register(), parent.register()]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const [first, second] = await Promise.all(
      responses.map(async (response) => responseRecord(await response.json())),
    );
    if (!first || !second)
      throw new Error('Both native registrations are required.');
    expect(responseString(first, 'id')).not.toBe(responseString(second, 'id'));
    expect(first.receivedAddendumRelation).toMatchObject({
      parentContractVersionId: parent.parentContractVersionId,
    });
    for (const document of [first, second])
      expect(document.receivedAddendumRelation).toMatchObject({
        access: 'granted',
        parentContractId: parent.parentContractId,
        parentContractVersionId: parent.parentContractVersionId,
        sourceDescription: parent.body.sourceDescription,
        receivedOn: null,
      });
    expect(await clientVersion()).toBe(beforeVersion + 2);
  });

  const changes = [
    {
      name: 'family assignment loss',
      subject: 'MEMBER',
      lock: "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_received_addendum_access' AND revoked_at IS NULL FOR UPDATE",
      mutation:
        "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_received_addendum_access' AND revoked_at IS NULL",
      denied: 403,
      replay: 403,
    },
    {
      name: 'Contract endpoint read loss',
      subject: 'MEMBER',
      lock: "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle IN ('company_contract_preparer','company_contract_approver') AND revoked_at IS NULL FOR UPDATE",
      mutation:
        "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle IN ('company_contract_preparer','company_contract_approver') AND revoked_at IS NULL",
      denied: 403,
      replay: 403,
    },
    {
      name: 'Opportunity endpoint read loss',
      subject: 'MEMBER',
      lock: "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_commercial_intake' AND revoked_at IS NULL FOR UPDATE",
      mutation:
        "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_commercial_intake' AND revoked_at IS NULL",
      denied: 403,
      replay: 403,
    },
    {
      name: 'ordinary Document authority loss',
      subject: 'MEMBER',
      lock: "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_document_registrar' AND revoked_at IS NULL FOR UPDATE",
      mutation:
        "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_document_registrar' AND revoked_at IS NULL",
      denied: 403,
      replay: 403,
    },
    {
      name: 'original Client archive',
      subject: 'CLIENT',
      lock: 'SELECT id FROM client_accounts WHERE workspace_id=(SELECT workspace_id FROM companies WHERE id=$1) AND id=$2 FOR UPDATE',
      mutation:
        "UPDATE client_accounts SET status='archived' WHERE workspace_id=(SELECT workspace_id FROM companies WHERE id=$1) AND id=$2",
      denied: 404,
      replay: 404,
    },
  ] as const;
  for (const registrationFirst of [false, true]) {
    it.each(changes)(
      `serializes $name with registration, registration first: ${registrationFirst}`,
      async (change) => {
        const values = [
          parent.target.companyId,
          change.subject === 'CLIENT'
            ? parent.ready.source.clientId
            : parent.ready.source.preparerMembershipId,
        ];
        const key = randomUUID(),
          before = await facts(),
          beforeVersion = await clientVersion();
        const barrier = await fixture.pool.connect();
        let pending: Promise<Response> | undefined,
          mutation: Promise<unknown> | undefined;
        if (registrationFirst) {
          await fixture.pool.query(
            'CREATE FUNCTION pause_addendum_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(10491050); RETURN NEW; END $$',
          );
          await fixture.pool.query(
            'CREATE TRIGGER pause_addendum_order BEFORE INSERT ON document_registration_events FOR EACH ROW EXECUTE FUNCTION pause_addendum_order()',
          );
        }
        try {
          await barrier.query('BEGIN');
          const pid = await backendPid(barrier);
          if (!registrationFirst) {
            await barrier.query(change.lock, values);
            pending = parent.register(key);
            await waitForBlocked(fixture.pool, pid);
            await barrier.query(change.mutation, values);
            await barrier.query('COMMIT');
            expect((await pending).status).toBe(change.denied);
            expect(await facts()).toEqual(before);
            expect(await clientVersion()).toBe(beforeVersion);
          } else {
            await barrier.query('SELECT pg_advisory_xact_lock(10491050)');
            pending = parent.register(key);
            await waitForBlocked(fixture.pool, pid);
            mutation = fixture.pool.query(change.mutation, values);
            await waitForBlocked(fixture.pool, pid, 2);
            await barrier.query('COMMIT');
            expect((await pending).status).toBe(201);
            await mutation;
            const committed = await facts();
            expect(await clientVersion()).toBe(beforeVersion + 1);
            expect((await parent.register(key)).status).toBe(change.replay);
            expect(await facts()).toEqual(committed);
            expect(await clientVersion()).toBe(beforeVersion + 1);
          }
        } finally {
          await barrier.query('ROLLBACK').catch(() => undefined);
          barrier.release();
          await Promise.allSettled([
            ...(pending ? [pending] : []),
            ...(mutation ? [mutation] : []),
          ]);
          if (registrationFirst) {
            await fixture.pool.query(
              'DROP TRIGGER pause_addendum_order ON document_registration_events',
            );
            await fixture.pool.query('DROP FUNCTION pause_addendum_order()');
          }
        }
      },
    );
  }

  it.each([false, true])(
    'keeps the real post-execution successor refusal and exact parent unchanged, registration first: %s',
    async (registrationFirst) => {
      const parentBefore = (
        await fixture.pool.query<{ facts: unknown }>(
          "SELECT jsonb_build_object('contracts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contracts t),'versions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_versions t),'declarations',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_signing_declarations t),'events',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_events t),'commands',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_commands t)) facts",
        )
      ).rows[0]?.facts;
      const successor = () =>
        fixture.post({
          ...parent.target,
          path: parent.ready.path + '/versions/from-approved-model',
          body: { ...parent.ready.intent, expectedContractRevision: 4 },
          key: randomUUID(),
        });
      const barrier = await fixture.pool.connect();
      let registration: Promise<Response> | undefined,
        succession: Promise<Response> | undefined;
      if (registrationFirst) {
        await fixture.pool.query(
          'CREATE FUNCTION pause_addendum_parent_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(10491051); RETURN NEW; END $$',
        );
        await fixture.pool.query(
          'CREATE TRIGGER pause_addendum_parent_order BEFORE INSERT ON document_registration_events FOR EACH ROW EXECUTE FUNCTION pause_addendum_parent_order()',
        );
      }
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        if (registrationFirst) {
          await barrier.query('SELECT pg_advisory_xact_lock(10491051)');
          registration = parent.register();
          await waitForBlocked(fixture.pool, pid);
          succession = successor();
        } else {
          await barrier.query(
            'SELECT id FROM contracts WHERE id=$1 FOR UPDATE',
            [parent.parentContractId],
          );
          succession = successor();
          await waitForBlocked(fixture.pool, pid);
          registration = parent.register();
        }
        await waitForBlocked(fixture.pool, pid, 2);
        await barrier.query('COMMIT');
        const saved = await registration;
        expect(saved.status).toBe(201);
        expect(await saved.json()).toMatchObject({
          receivedAddendumRelation: {
            parentContractId: parent.parentContractId,
            parentContractVersionId: parent.parentContractVersionId,
            contractVersionNumber: 2,
          },
        });
        const refused = await succession;
        expect(refused.status).toBe(409);
        expect(await refused.json()).toMatchObject({
          code: 'CONTRACT_EXECUTED',
        });
        expect(
          (
            await fixture.pool.query<{ facts: unknown }>(
              "SELECT jsonb_build_object('contracts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contracts t),'versions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_versions t),'declarations',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_signing_declarations t),'events',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_events t),'commands',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_commands t)) facts",
            )
          ).rows[0]?.facts,
        ).toEqual(parentBefore);
      } finally {
        await barrier.query('ROLLBACK').catch(() => undefined);
        barrier.release();
        await Promise.allSettled([
          ...(registration ? [registration] : []),
          ...(succession ? [succession] : []),
        ]);
        if (registrationFirst) {
          await fixture.pool.query(
            'DROP TRIGGER pause_addendum_parent_order ON document_registration_events',
          );
          await fixture.pool.query(
            'DROP FUNCTION pause_addendum_parent_order()',
          );
        }
      }
    },
  );

  describe('owner-supported historical Client duplicate and native union', () => {
    let canonicalClientId: string, reviewReference: string;
    const command = (path: string, body: unknown) =>
      fixture.command({
        ...parent.target,
        path,
        body,
      });
    const review = async () =>
      responseString(
        responseRecord(
          await command(
            `/clients/${parent.ready.source.clientId}/union-reviews`,
            {},
          ),
        ),
        'reviewReference',
      );
    const confirmation = () => ({
      canonicalClientId,
      fields: {
        displayName: parent.ready.source.clientId,
        taxId: parent.ready.source.clientId,
        address: parent.ready.source.clientId,
        telephone: parent.ready.source.clientId,
        generalEmail: parent.ready.source.clientId,
        businessActivity: parent.ready.source.clientId,
      },
      companyIds: [parent.target.companyId],
      reviewedDifferences: true,
      reason:
        'Review the fictional historical duplicate without retargeting the received Addendum',
    });
    beforeEach(async () => {
      canonicalClientId = responseString(
        responseRecord(
          await command('/clients', {
            displayName: 'Canonical fictional received Addendum Client',
          }),
        ),
        'id',
      );
      // Owner-supported LEGACY duplicate import seam, as in
      // received-contract-client-union.rest.test.ts and the Client owner tests.
      // Only this additional dossier's tax_id changes. The genuine Contract,
      // declaration, signing PDF and immutable recorded party remain untouched.
      await fixture.pool.query(
        'UPDATE client_accounts SET tax_id=(SELECT tax_id FROM client_accounts WHERE id=$1) WHERE id=$2',
        [parent.ready.source.clientId, canonicalClientId],
      );
      reviewReference = await review();
    });
    it.each([false, true])(
      'conserves the exact original through native union ordering, registration first: %s',
      async (registrationFirst) => {
        const registration = {
          ...parent.target,
          path: '/documents',
          body: parent.body,
          key: randomUUID(),
        };
        const union = {
          ...parent.target,
          path: `/client-union-reviews/${reviewReference}/confirm`,
          key: randomUUID(),
          body: confirmation(),
        };
        const before = await facts();
        const table = registrationFirst
          ? 'document_registration_events'
          : 'client_union_operations';
        const barrier = await fixture.pool.connect();
        let first: Promise<Response> | undefined,
          second: Promise<Response> | undefined;
        await fixture.pool.query(
          'CREATE FUNCTION pause_addendum_union_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(10491052); RETURN NEW; END $$',
        );
        // The closed two-table literal above is the only interpolated identifier.
        await fixture.pool.query(
          `CREATE TRIGGER pause_addendum_union_order BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION pause_addendum_union_order()`,
        );
        try {
          await barrier.query('BEGIN');
          const pid = await backendPid(barrier);
          await barrier.query('SELECT pg_advisory_xact_lock(10491052)');
          first = fixture.post(registrationFirst ? registration : union);
          await waitForBlocked(fixture.pool, pid);
          second = fixture.post(registrationFirst ? union : registration);
          await waitForBlocked(fixture.pool, pid, 2);
          await barrier.query('COMMIT');
          const committedFirst = await first,
            refusedSecond = await second;
          expect(committedFirst.status).toBe(201);
          // Registration fences the original Client, making the older review
          // stale; union first instead retires new use of the superseded original.
          expect(refusedSecond.status).toBe(404);
          if (registrationFirst) {
            const original = responseRecord(await committedFirst.json());
            await command(
              `/client-union-reviews/${await review()}/confirm`,
              confirmation(),
            );
            const replay = responseRecord(await fixture.command(registration));
            expect(replay).toMatchObject({
              id: original.id,
              clientId: parent.ready.source.clientId,
              clientDossierId: canonicalClientId,
              correction: 'read-only',
              receivedAddendumRelation: original.receivedAddendumRelation,
            });
            expect(
              (await fixture.post({ ...registration, key: randomUUID() }))
                .status,
            ).toBe(404);
            const current = responseRecord(
              await fixture.read({
                ...parent.target,
                path: `/documents/${responseString(original, 'id')}`,
              }),
            );
            expect(current.receivedAddendumRelation).toEqual(
              original.receivedAddendumRelation,
            );
          } else {
            expect(await facts()).toEqual(before);
            const rows: unknown = await fixture.read({
              path: '/documents',
              companyId: parent.target.companyId,
              headers: ESTIMATE_OFFER_PREPARER,
            });
            if (!Array.isArray(rows))
              throw new Error('Native Document inventory is required.');
            expect(
              rows.filter(
                (row) => responseRecord(row).type === 'received-addendum',
              ),
            ).toEqual([]);
            expect((await fixture.post(registration)).status).toBe(404);
          }
        } finally {
          await barrier.query('ROLLBACK').catch(() => undefined);
          barrier.release();
          await Promise.allSettled([
            ...(first ? [first] : []),
            ...(second ? [second] : []),
          ]);
          await fixture.pool.query(
            `DROP TRIGGER pause_addendum_union_order ON ${table}`,
          );
          await fixture.pool.query(
            'DROP FUNCTION pause_addendum_union_order()',
          );
        }
      },
    );
  });

  describe('native PDF scan and revision races', () => {
    let documentId: string, versionId: string;
    beforeEach(async () => {
      const registered = await parent.register();
      expect(registered.status, await registered.clone().text()).toBe(201);
      const document = responseRecord(await registered.json());
      documentId = responseString(document, 'id');
      versionId = responseString(responseRecord(document.version), 'id');
    });
    it.each([
      ['received-addendum-access', 404, false],
      ['document-content-reader', 403, false],
      ['document-content-uploader', 403, false],
      ['document-registrar', 403, false],
      ['received-addendum-access', 404, true],
      ['document-content-reader', 403, true],
    ] as const)(
      'scans outside the transaction and rechecks %s before preserving any bytes or receipt, denial %s, equal replacement: %s',
      async (bundle, denied, replace) => {
        const before = await facts(),
          beforeVersion = await clientVersion(),
          key = randomUUID();
        const barrier = scanner.holdNextScan();
        const pending = upload({
          documentId,
          versionId,
          revision: 1,
          bytes: pdfA,
          key,
        });
        try {
          await Promise.race([
            barrier.reached,
            pending.then(() => {
              throw new Error('Upload missed its native scanner barrier.');
            }),
          ]);
          // The real scan must hold no Document, Client or authority row lock.
          const probe = await fixture.pool.connect();
          try {
            await probe.query('BEGIN');
            await probe.query(
              'SELECT id FROM working_documents WHERE id=$1 FOR UPDATE NOWAIT',
              [documentId],
            );
            await probe.query(
              'SELECT id FROM client_accounts WHERE id=$1 FOR UPDATE NOWAIT',
              [parent.ready.source.clientId],
            );
            await probe.query(
              'SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND revoked_at IS NULL FOR UPDATE NOWAIT',
              [
                parent.target.companyId,
                parent.ready.source.preparerMembershipId,
              ],
            );
            await probe.query('ROLLBACK');
          } finally {
            await probe.query('ROLLBACK').catch(() => undefined);
            probe.release();
          }
          await revokeModelContractFixtureGrant(
            fixture,
            `/company-${bundle}-assignments`,
            parent.target.companyId,
            parent.ready.source.preparerMembershipId,
          );
          if (replace)
            await fixture.grant({
              path: `/company-${bundle}-assignments`,
              companyId: parent.target.companyId,
              membershipId: parent.ready.source.preparerMembershipId,
            });
          barrier.release();
          expect((await pending).status).toBe(denied);
        } finally {
          barrier.release();
          await pending.catch(() => undefined);
        }
        expect(await facts()).toEqual(before);
        expect(await clientVersion()).toBe(beforeVersion);
        if (!replace)
          await fixture.grant({
            path: `/company-${bundle}-assignments`,
            companyId: parent.target.companyId,
            membershipId: parent.ready.source.preparerMembershipId,
          });
        expect(
          await (await parent.call(`/documents/${documentId}/versions`)).json(),
        ).toMatchObject({
          workingRevision: 1,
          versions: [{ pdfContent: { state: 'absent' } }],
        });
        expect(
          (
            await upload({
              documentId,
              versionId,
              revision: 1,
              bytes: pdfA,
              key,
            })
          ).status,
        ).toBe(201);
      },
    );

    it('keeps a newly committed upload when an older scanned operation loses the same revision', async () => {
      const barrier = scanner.holdNextScan(),
        pending = upload({ documentId, versionId, revision: 1, bytes: pdfA });
      try {
        await Promise.race([
          barrier.reached,
          pending.then(() => {
            throw new Error('Upload missed its native scanner barrier.');
          }),
        ]);
        expect(
          (await upload({ documentId, versionId, revision: 1, bytes: pdfB }))
            .status,
        ).toBe(201);
        barrier.release();
        expect((await pending).status).toBe(409);
      } finally {
        barrier.release();
        await pending.catch(() => undefined);
      }
      expect(
        Buffer.from(
          await (
            await parent.call(
              `/documents/${documentId}/versions/${versionId}/content`,
            )
          ).arrayBuffer(),
        ),
      ).toEqual(pdfB);
      expect(
        await (
          await parent.call(
            `/documents/${documentId}/versions/${versionId}/content/history`,
          )
        ).json(),
      ).toMatchObject({
        uploads: [{ revision: 2, current: true }],
        nextBeforeRevision: null,
      });
    });

    it('freezes the exact committed PDF when designation wins before a held scanned upload', async () => {
      expect(
        (await upload({ documentId, versionId, revision: 1, bytes: pdfA }))
          .status,
      ).toBe(201);
      const barrier = scanner.holdNextScan(),
        pending = upload({ documentId, versionId, revision: 2, bytes: pdfB });
      try {
        await Promise.race([
          barrier.reached,
          pending.then(() => {
            throw new Error('Upload missed its native scanner barrier.');
          }),
        ]);
        expect(
          (
            await mutate(
              documentId,
              `/versions/${versionId}/official-designation`,
              { expectedRevision: 2 },
            )
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
          await (
            await parent.call(
              `/documents/${documentId}/versions/${versionId}/content`,
            )
          ).arrayBuffer(),
        ),
      ).toEqual(pdfA);
      expect(
        await (await parent.call(`/documents/${documentId}/versions`)).json(),
      ).toMatchObject({
        workingRevision: 3,
        versions: [{ status: 'official' }],
      });
    });
  });
});
