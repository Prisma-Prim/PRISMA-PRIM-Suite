import { randomUUID } from 'node:crypto';
import { types } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import {
  createPaymentEvidenceFixture,
  paymentJson,
  paymentNoticePdf,
  paymentRecord,
  paymentText,
  type PaymentEvidenceFixture,
} from './payment-evidence.test-support.js';
import {
  paymentEvidenceEffects,
  paymentSourceBody,
  registerPaymentSource,
} from './payment-evidence-proof.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const consumedAuthority = [
  {
    name: 'Recorder',
    bundle: 'company_payment_recorder',
    path: '/company-payment-recorder-assignments',
  },
  {
    name: 'Evidence Access',
    bundle: 'company_payment_evidence_access',
    path: '/company-payment-evidence-access-assignments',
  },
  {
    name: 'native Registrar',
    bundle: 'company_document_registrar',
    path: '/company-document-registrar-assignments',
  },
  {
    name: 'original Client reader',
    bundle: 'company_director_client_access',
    path: '/company-director-client-assignments',
  },
  {
    name: 'Company context',
    bundle: 'company_context_access',
    path: '/company-context-assignments',
  },
  {
    name: 'membership',
    bundle: null,
    path: '/workspace-membership-suspensions',
  },
];

withPostgres('Payment Evidence Source native races and atomic failure', () => {
  let fixture: PaymentEvidenceFixture;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await createPaymentEvidenceFixture(databaseUrl);
  });
  beforeEach(async () => {
    await fixture.reset();
  });
  afterAll(async () => {
    await fixture?.close();
  });

  it('serializes same-key registration once and keeps two different keys as two legitimate independent Sources', async () => {
    const before = await fixture.pool.query<{ version: number }>(
      'SELECT version FROM client_accounts WHERE id=$1',
      [fixture.ready.clientId],
    );
    const body = paymentSourceBody(fixture);
    const key = randomUUID();
    const register = (selectedKey: string, value: unknown = body) =>
      fixture.call('/documents', {
        method: 'POST',
        body: value,
        key: selectedKey,
      });
    const [first, second] = await Promise.all([register(key), register(key)]);
    expect([first.status, second.status]).toEqual([201, 201]);
    const document = await paymentJson(first);
    expect(await paymentJson(second)).toEqual(document);
    expect(
      (
        await register(key, {
          ...body,
          sourceDescription: 'Changed source intent',
        })
      ).status,
    ).toBe(409);
    const different = await Promise.all([
      register(randomUUID()),
      register(randomUUID()),
    ]);
    expect(different.map((response) => response.status)).toEqual([201, 201]);
    const documents = [
      document,
      ...(await Promise.all(different.map(paymentJson))),
    ];
    expect(new Set(documents.map((entry) => entry.id)).size).toBe(3);
    for (const table of [
      'working_documents',
      'payment_evidence_document_sources',
      'document_versions',
      'document_registration_events',
    ])
      expect(
        (
          await fixture.pool.query<{ count: number }>(
            `SELECT count(*)::int AS count FROM ${table}`,
          )
        ).rows,
      ).toEqual([{ count: 3 }]);
    expect(
      (
        await fixture.pool.query<{ version: number }>(
          'SELECT version FROM client_accounts WHERE id=$1',
          [fixture.ready.clientId],
        )
      ).rows[0]?.version,
    ).toBe((before.rows[0]?.version ?? 0) + 3);
    const committed = await paymentEvidenceEffects(fixture.pool);
    expect(await paymentJson(await register(key))).toEqual(document);
    expect(await paymentEvidenceEffects(fixture.pool)).toEqual(committed);
  });

  it.each(
    consumedAuthority.flatMap((authority) => [
      { ...authority, changeFirst: true },
      { ...authority, changeFirst: false },
    ]),
  )(
    'linearizes registration and $name loss with authority-first=$changeFirst',
    async (authority) => {
      const member = fixture.ready.membershipIds.reader;
      expect(
        (await fixture.grant('/company-payment-recorder-assignments', member))
          .status,
      ).toBe(201);
      const body = paymentSourceBody(fixture);
      const key = randomUUID();
      const register = () =>
        fixture.call('/documents', {
          method: 'POST',
          key,
          body,
          identity: 'reader',
        });
      const change = () =>
        authority.bundle === null
          ? fixture.call(authority.path, {
              method: 'POST',
              company: null,
              body: { workspaceMembershipId: member },
            })
          : fixture.revoke(authority.path, member);
      const before = await paymentEvidenceEffects(fixture.pool);
      const barrier = await fixture.pool.connect();
      let pending: Promise<Response> | undefined;
      let loss: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        if (authority.changeFirst) {
          if (authority.bundle === null)
            await barrier.query(
              'SELECT id FROM workspace_memberships WHERE id=$1 FOR UPDATE',
              [member],
            );
          else
            await barrier.query(
              'SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle::text=$3 AND revoked_at IS NULL FOR UPDATE',
              [fixture.ready.companyId, member, authority.bundle],
            );
          loss = change();
          await waitForBlocked(fixture.pool, pid);
          pending = register();
          await waitForBlocked(fixture.pool, pid, 2);
          await barrier.query('COMMIT');
          expect((await loss).status).toBe(
            authority.bundle === null ? 201 : 200,
          );
          const response = await pending;
          const contextFallback = authority.bundle === 'company_context_access';
          expect(response.status).toBe(contextFallback ? 201 : 403);
          const after = await paymentEvidenceEffects(fixture.pool);
          if (contextFallback) {
            // A newly resolved HTTP Actor can consume the independently valid
            // native Registrar/Director context after Context Access is gone.
            const document = await paymentJson(response);
            expect(await paymentJson(await register())).toEqual(document);
            expect(await paymentEvidenceEffects(fixture.pool)).toEqual(after);
            expect(
              (
                await fixture.pool.query<{
                  sources: number;
                  versions: number;
                  events: number;
                }>(
                  'SELECT (SELECT count(*)::int FROM payment_evidence_document_sources) sources,(SELECT count(*)::int FROM document_versions) versions,(SELECT count(*)::int FROM document_registration_events) events',
                )
              ).rows,
            ).toEqual([{ sources: 1, versions: 1, events: 1 }]);
          } else {
            expect({
              ...after,
              company_role_assignments: before.company_role_assignments,
              activity_log_events: before.activity_log_events,
            }).toEqual(before);
          }
        } else {
          await fixture.pool.query(
            "CREATE FUNCTION pause_payment_evidence_registration() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM working_documents WHERE id=NEW.document_id AND type='payment-evidence') THEN PERFORM pg_advisory_xact_lock(10450045); END IF; RETURN NEW; END $$",
          );
          await fixture.pool.query(
            'CREATE TRIGGER pause_payment_evidence_registration BEFORE INSERT ON document_registration_events FOR EACH ROW EXECUTE FUNCTION pause_payment_evidence_registration()',
          );
          await barrier.query('SELECT pg_advisory_xact_lock(10450045)');
          pending = register();
          await waitForBlocked(fixture.pool, pid);
          loss = change();
          await waitForBlocked(fixture.pool, pid, 2);
          await barrier.query('COMMIT');
          expect((await pending).status).toBe(201);
          expect((await loss).status).toBe(
            authority.bundle === null ? 201 : 200,
          );
          const committed = await paymentEvidenceEffects(fixture.pool);
          // A fresh request may consume the independently supported native context fallback.
          expect((await register()).status).toBe(
            authority.bundle === 'company_context_access' ? 201 : 403,
          );
          expect(await paymentEvidenceEffects(fixture.pool)).toEqual(committed);
          expect(
            (
              await fixture.pool.query<{ count: number }>(
                'SELECT count(*)::int AS count FROM payment_evidence_document_sources',
              )
            ).rows,
          ).toEqual([{ count: 1 }]);
        }
      } finally {
        await barrier.query('ROLLBACK').catch(() => undefined);
        barrier.release();
        await pending?.catch(() => undefined);
        await loss?.catch(() => undefined);
        await fixture.pool.query(
          'DROP TRIGGER IF EXISTS pause_payment_evidence_registration ON document_registration_events',
        );
        await fixture.pool.query(
          'DROP FUNCTION IF EXISTS pause_payment_evidence_registration()',
        );
      }
    },
  );

  it.each(['PRIMARY', 'ADDITIONAL'] as const)(
    'recovers exact %s registration detail without a fresh payer copy after identity-read loss and refuses fresh new use',
    async (payer) => {
      const source = await registerPaymentSource(fixture, payer);
      expect(
        (
          await fixture.revoke(
            '/company-director-client-assignments',
            fixture.ready.membershipIds.owner,
          )
        ).status,
      ).toBe(200);
      const before = await paymentEvidenceEffects(fixture.pool);
      const replay = await fixture.call('/documents', {
        method: 'POST',
        key: source.key,
        body: source.body,
      });
      expect(replay.status).toBe(201);
      expect(await paymentJson(replay)).toMatchObject({
        id: source.documentId,
        paymentEvidenceSource: { payer: { kind: 'UNAVAILABLE' } },
      });
      expect(
        (
          await fixture.call('/documents', {
            method: 'POST',
            key: randomUUID(),
            body: source.body,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fixture.call('/documents', {
            method: 'POST',
            key: source.key,
            body: { ...source.body, receivedOn: '2026-01-15' },
          })
        ).status,
      ).toBe(409);
      expect(await paymentEvidenceEffects(fixture.pool)).toEqual(before);
    },
  );

  it.each([
    { payer: 'PRIMARY', changeFirst: true },
    { payer: 'PRIMARY', changeFirst: false },
    { payer: 'ADDITIONAL', changeFirst: true },
    { payer: 'ADDITIONAL', changeFirst: false },
  ] as const)(
    'conserves the exact original $payer payer when identity correction wins first=$changeFirst',
    async ({ payer, changeFirst }) => {
      const clientId = fixture.ready.clientId;
      const current = await paymentJson(
        await fixture.call('/clients/' + clientId),
      );
      if (typeof current.version !== 'number')
        throw new Error('A native Client version is required.');
      const oldName =
        payer === 'PRIMARY'
          ? 'Fictional Payer Primary'
          : 'Fictional Payer Additional';
      const newName = 'Fictional corrected ' + payer + ' payer';
      const expectedVersion = current.version + (changeFirst ? 0 : 1);
      const body = paymentSourceBody(fixture, payer);
      const register = () =>
        fixture.call('/documents', { method: 'POST', key: randomUUID(), body });
      const correct = () =>
        payer === 'PRIMARY'
          ? fixture.call('/clients/' + clientId, {
              method: 'PATCH',
              body: { expectedVersion, displayName: newName },
            })
          : fixture.call(
              `/clients/${clientId}/legal-entities/${fixture.ready.additionalLegalEntityId}`,
              {
                method: 'PATCH',
                body: {
                  expectedClientVersion: expectedVersion,
                  changes: { legalName: newName },
                },
              },
            );
      const barrier = await fixture.pool.connect();
      let registration: Promise<Response> | undefined;
      let correction: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        if (changeFirst) {
          await barrier.query(
            'SELECT id FROM client_accounts WHERE id=$1 FOR UPDATE',
            [clientId],
          );
          correction = correct();
          await waitForBlocked(fixture.pool, pid);
          registration = register();
          await waitForBlocked(fixture.pool, pid, 2);
        } else {
          await fixture.pool.query(
            "CREATE FUNCTION pause_payment_evidence_registration() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM working_documents WHERE id=NEW.document_id AND type='payment-evidence') THEN PERFORM pg_advisory_xact_lock(10450045); END IF; RETURN NEW; END $$",
          );
          await fixture.pool.query(
            'CREATE TRIGGER pause_payment_evidence_registration BEFORE INSERT ON document_registration_events FOR EACH ROW EXECUTE FUNCTION pause_payment_evidence_registration()',
          );
          await barrier.query('SELECT pg_advisory_xact_lock(10450045)');
          registration = register();
          await waitForBlocked(fixture.pool, pid);
          correction = correct();
          await waitForBlocked(fixture.pool, pid, 2);
        }
        await barrier.query('COMMIT');
        const corrected = await correction;
        expect(corrected.status).toBe(200);
        const correctedValue = await paymentJson(corrected);
        expect(
          payer === 'PRIMARY'
            ? correctedValue.displayName
            : paymentRecord(correctedValue.legalEntity).legalName,
        ).toBe(newName);
        const registered = await registration;
        expect(registered.status).toBe(201);
        const document = await paymentJson(registered);
        const source = paymentRecord(document.paymentEvidenceSource);
        expect(source.payer).toMatchObject({
          kind: 'AVAILABLE',
          party: { kind: payer, legalName: changeFirst ? newName : oldName },
        });
        const reopened = await fixture.call(
          '/documents/' + paymentText(document.id),
        );
        expect(reopened.status).toBe(200);
        expect(
          paymentRecord((await paymentJson(reopened)).paymentEvidenceSource),
        ).toEqual(source);
        expect(
          (
            await fixture.pool.query<{ version: number }>(
              'SELECT version FROM client_accounts WHERE id=$1',
              [clientId],
            )
          ).rows[0]?.version,
        ).toBe(current.version + 2);
      } finally {
        await barrier.query('ROLLBACK').catch(() => undefined);
        barrier.release();
        await registration?.catch(() => undefined);
        await correction?.catch(() => undefined);
        await fixture.pool.query(
          'DROP TRIGGER IF EXISTS pause_payment_evidence_registration ON document_registration_events',
        );
        await fixture.pool.query(
          'DROP FUNCTION IF EXISTS pause_payment_evidence_registration()',
        );
      }
    },
  );

  it('commits a same-key scanned winner once and releases its conserved receipt without another scan', async () => {
    const source = await registerPaymentSource(fixture);
    const bytes = await paymentNoticePdf();
    const key = randomUUID();
    const upload = () => fixture.upload({ ...source, revision: 1, bytes, key });
    const barrier = fixture.scanner.holdNextScan();
    const pending = upload();
    try {
      await Promise.race([
        barrier.reached,
        pending.then(() => {
          throw new Error('Upload missed scanner barrier.');
        }),
      ]);
      const winner = await upload();
      expect(winner.status).toBe(201);
      const receipt = await paymentJson(winner);
      barrier.release();
      expect(await paymentJson(await pending)).toEqual(receipt);
      const before = await paymentEvidenceEffects(fixture.pool);
      const scans = fixture.scanner.scanCount;
      expect(await paymentJson(await upload())).toEqual(receipt);
      expect(fixture.scanner.scanCount).toBe(scans);
      expect(await paymentEvidenceEffects(fixture.pool)).toEqual(before);
      expect(
        (
          await fixture.pool.query<{ count: number }>(
            'SELECT count(*)::int AS count FROM document_pdfs',
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    } finally {
      barrier.release();
      await pending.catch(() => undefined);
    }
  });

  it.each([
    {
      name: 'Recorder',
      path: '/company-payment-recorder-assignments',
      status: 404,
    },
    {
      name: 'Evidence Access',
      path: '/company-payment-evidence-access-assignments',
      status: 404,
    },
    {
      name: 'Company context',
      path: '/company-context-assignments',
      status: 404,
    },
    {
      name: 'Registrar',
      path: '/company-document-registrar-assignments',
      status: 403,
    },
    {
      name: 'Content Reader',
      path: '/company-document-content-reader-assignments',
      status: 403,
    },
    {
      name: 'Content Uploader',
      path: '/company-document-content-uploader-assignments',
      status: 403,
    },
  ])(
    'retires a held scan after consumed $name equal-permission replacement',
    async (authority) => {
      // The Workspace Owner consumes company.manage, not Context Access.
      // Use the invited actor to make the replaced context identity causal.
      const identity =
        authority.name === 'Company context'
          ? ('reader' as const)
          : ('owner' as const);
      const member = fixture.ready.membershipIds[identity];
      if (identity === 'reader')
        for (const path of [
          '/company-payment-recorder-assignments',
          '/company-document-content-uploader-assignments',
        ])
          expect((await fixture.grant(path, member)).status).toBe(201);
      const source = await registerPaymentSource(fixture);
      const upload = {
        ...source,
        identity,
        revision: 1,
        bytes: await paymentNoticePdf(),
        key: randomUUID(),
      };
      const barrier = fixture.scanner.holdNextScan();
      const pending = fixture.upload(upload);
      try {
        await Promise.race([
          barrier.reached,
          pending.then(() => {
            throw new Error('Upload missed scanner barrier.');
          }),
        ]);
        expect((await fixture.revoke(authority.path, member)).status).toBe(200);
        expect((await fixture.grant(authority.path, member)).status).toBe(201);
        const administered = await paymentEvidenceEffects(fixture.pool);
        barrier.release();
        expect((await pending).status).toBe(authority.status);
        expect(await paymentEvidenceEffects(fixture.pool)).toEqual(
          administered,
        );
        expect((await fixture.upload(upload)).status).toBe(201);
      } finally {
        barrier.release();
        await pending.catch(() => undefined);
      }
    },
  );

  it.each([
    { path: '/company-director-client-assignments', payerUnavailable: true },
    { path: '/company-payment-reader-assignments', payerUnavailable: false },
  ])(
    'keeps a held upload independent of unconsumed $path loss',
    async (authority) => {
      const source = await registerPaymentSource(fixture);
      const barrier = fixture.scanner.holdNextScan();
      const pending = fixture.upload({
        ...source,
        revision: 1,
        bytes: await paymentNoticePdf(),
      });
      try {
        await Promise.race([
          barrier.reached,
          pending.then(() => {
            throw new Error('Upload missed scanner barrier.');
          }),
        ]);
        expect(
          (
            await fixture.revoke(
              authority.path,
              fixture.ready.membershipIds.owner,
            )
          ).status,
        ).toBe(200);
        barrier.release();
        expect((await pending).status).toBe(201);
        const detail = await fixture.call('/documents/' + source.documentId);
        expect(detail.status).toBe(200);
        const payer = paymentRecord(
          paymentRecord((await paymentJson(detail)).paymentEvidenceSource)
            .payer,
        );
        expect(payer.kind).toBe(
          authority.payerUnavailable ? 'UNAVAILABLE' : 'AVAILABLE',
        );
      } finally {
        barrier.release();
        await pending.catch(() => undefined);
      }
    },
  );

  it('lets a metadata correction win before a held upload and refuses the stale upload without orphan bytes', async () => {
    const source = await registerPaymentSource(fixture);
    const barrier = fixture.scanner.holdNextScan();
    const pending = fixture.upload({
      ...source,
      revision: 1,
      bytes: await paymentNoticePdf(),
    });
    try {
      await Promise.race([
        barrier.reached,
        pending.then(() => {
          throw new Error('Upload missed scanner barrier.');
        }),
      ]);
      expect(
        (
          await fixture.call('/documents/' + source.documentId, {
            method: 'PATCH',
            body: { expectedRevision: 1, title: 'Competing native metadata' },
          })
        ).status,
      ).toBe(200);
      const winner = await paymentEvidenceEffects(fixture.pool);
      barrier.release();
      expect((await pending).status).toBe(409);
      expect(await paymentEvidenceEffects(fixture.pool)).toEqual(winner);
      expect(
        (
          await fixture.call(
            `/documents/${source.documentId}/versions/${source.versionId}/content`,
          )
        ).status,
      ).toBe(404);
    } finally {
      barrier.release();
      await pending.catch(() => undefined);
    }
  });

  it('lets designation freeze the exact older bytes before a held replacement upload', async () => {
    const source = await registerPaymentSource(fixture);
    const bytes = await paymentNoticePdf('A');
    expect(
      (await fixture.upload({ ...source, revision: 1, bytes })).status,
    ).toBe(201);
    const barrier = fixture.scanner.holdNextScan();
    const pending = fixture.upload({
      ...source,
      revision: 2,
      key: randomUUID(),
      bytes: await paymentNoticePdf('B'),
    });
    try {
      await Promise.race([
        barrier.reached,
        pending.then(() => {
          throw new Error('Upload missed scanner barrier.');
        }),
      ]);
      expect(
        (
          await fixture.call(
            `/documents/${source.documentId}/versions/${source.versionId}/official-designation`,
            { method: 'POST', body: { expectedRevision: 2 } },
          )
        ).status,
      ).toBe(200);
      const winner = await paymentEvidenceEffects(fixture.pool);
      barrier.release();
      expect((await pending).status).toBe(409);
      expect(await paymentEvidenceEffects(fixture.pool)).toEqual(winner);
      const response = await fixture.call(
        `/documents/${source.documentId}/versions/${source.versionId}/content`,
      );
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    } finally {
      barrier.release();
      await pending.catch(() => undefined);
    }
  });

  it.each([
    'payment_evidence_document_sources',
    'document_registration_events',
  ])(
    'rolls all Source, Version, Client fence, receipt/event and response effects back on final %s failure',
    async (table) => {
      const body = paymentSourceBody(fixture);
      const key = randomUUID();
      const before = await paymentEvidenceEffects(fixture.pool);
      await fixture.pool.query(
        "CREATE FUNCTION fail_payment_evidence_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic final Payment Evidence write failure' USING ERRCODE='23514'; END $$",
      );
      // Only the two closed literal table names above reach fault-injection DDL.
      await fixture.pool.query(
        `CREATE TRIGGER fail_payment_evidence_write BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_payment_evidence_write()`,
      );
      try {
        expect(
          (await fixture.call('/documents', { method: 'POST', body, key }))
            .status,
        ).toBe(500);
      } finally {
        await fixture.pool.query(
          `DROP TRIGGER fail_payment_evidence_write ON ${table}`,
        );
        await fixture.pool.query('DROP FUNCTION fail_payment_evidence_write()');
      }
      expect(await paymentEvidenceEffects(fixture.pool)).toEqual(before);
      expect(
        (await fixture.call('/documents', { method: 'POST', body, key }))
          .status,
      ).toBe(201);
    },
  );
  it('rolls every registration effect back when the native driver cannot decode the final protected source response', async () => {
    const body = {
      ...paymentSourceBody(fixture),
      sourceDescription: 'Fictional final response decode failure FICT-PAY-001',
    };
    const key = randomUUID();
    const before = await paymentEvidenceEffects(fixture.pool);
    const decode = types.getTypeParser(25, 'text');
    types.setTypeParser(25, 'text', (value) => {
      if (value === body.sourceDescription)
        throw new Error('Synthetic Payment Evidence response decode failure');
      return decode(value);
    });
    try {
      expect(
        (await fixture.call('/documents', { method: 'POST', key, body }))
          .status,
      ).toBe(500);
    } finally {
      types.setTypeParser(25, 'text', decode);
    }
    expect(await paymentEvidenceEffects(fixture.pool)).toEqual(before);
    expect(
      (await fixture.call('/documents', { method: 'POST', key, body })).status,
    ).toBe(201);
  });
});
