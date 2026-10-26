import { PDF_B } from '../documents/mission-document.test-support.js';
import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import {
  ESTIMATE_OFFER_READER,
  openEstimateOfferFixture,
  responseRecord,
} from '../offer/offer-estimate-preparation.test-support.js';
import { generatedOfferIntent } from '../offer/offer-model-generation.test-fixture.js';
import { prepareReportedSigning } from './reported-contract-signing.test-support.js';
import * as presentation from './reported-contract-signing-view.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Reported signing deterministic committing histories', () => {
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
  type Ready = Awaited<ReturnType<typeof prepareReportedSigning>>;
  const declare = (ready: Ready, key: string = randomUUID()) =>
    fixture.post({ ...ready.target, path: ready.path, body: ready.body, key });

  async function orderedPair<One, Two>(
    lock: string,
    values: string[],
    first: () => Promise<One>,
    second: () => Promise<Two>,
  ) {
    const barrier = await fixture.pool.connect();
    let one: Promise<One> | undefined, two: Promise<Two> | undefined;
    try {
      await barrier.query('BEGIN');
      const pid = await backendPid(barrier);
      await barrier.query(lock, values);
      one = first();
      await waitForBlocked(fixture.pool, pid);
      two = second();
      await waitForBlocked(fixture.pool, pid, 2);
      await barrier.query('COMMIT');
      return await Promise.all([one, two]);
    } finally {
      await barrier.query('ROLLBACK');
      barrier.release();
      await Promise.allSettled([...(one ? [one] : []), ...(two ? [two] : [])]);
    }
  }
  it.each(['rejection', 'offer-successor', 'contract-successor'] as const)(
    'serializes both orders of %s and declaration without erasing a permitted exact receipt',
    async (change) => {
      for (const changeFirst of [true, false]) {
        if (!changeFirst) await fixture.reset();
        const ready = await prepareReportedSigning(fixture),
          { f } = ready;
        const key = randomUUID();
        const mutation =
          change === 'rejection'
            ? {
                ...ready.target,
                headers: ESTIMATE_OFFER_READER,
                path: f.ready.flow.base + '/client-response',
                body: {
                  expectedOfferRevision: f.ready.flow.revision,
                  outcome: 'REJECTED',
                  receivedAt: '2026-10-24T09:00:00.000Z',
                  reason: 'Synthetic source refusal',
                },
              }
            : change === 'offer-successor'
              ? {
                  ...ready.target,
                  path: f.ready.flow.path + '/versions/from-approved-model',
                  body: {
                    ...generatedOfferIntent(f.ready.source),
                    expectedOfferRevision: f.ready.flow.revision,
                  },
                }
              : {
                  ...ready.target,
                  path: f.ready.path + '/versions/from-approved-model',
                  body: { ...f.ready.intent, expectedContractRevision: 2 },
                };
        const commit = () => declare(ready, key),
          invalidate = () => fixture.post(mutation);
        const responses = await orderedPair(
          'SELECT id FROM opportunities WHERE id=$1 FOR UPDATE',
          [f.ready.source.opportunityId],
          changeFirst ? invalidate : commit,
          changeFirst ? commit : invalidate,
        );
        expect(responses[0].status).toBe(201);
        expect(responses[1].status).toBe(
          changeFirst || change === 'contract-successor' ? 409 : 201,
        );
        if (!changeFirst) {
          const original: unknown = await responses[0].json();
          expect(
            await fixture.command({
              ...ready.target,
              path: ready.path,
              body: ready.body,
              key,
            }),
          ).toEqual(original);
        }
        expect(
          (
            await fixture.pool.query<{ count: number }>(
              'SELECT count(*)::int count FROM contract_signing_declarations',
            )
          ).rows[0]?.count,
        ).toBe(changeFirst ? 0 : 1);
      }
    },
    30_000,
  );

  it.each([
    'contract-signature-declarer',
    'contract-approver',
    'document-content-reader',
    'received-contract-access',
    'document-registrar',
    'director-client',
    'offer-preparer',
    'commercial-intake',
  ] as const)(
    'fences both orders of required %s revocation and declaration',
    async (bundle) => {
      for (const revokeFirst of [true, false]) {
        if (!revokeFirst) await fixture.reset();
        const ready = await prepareReportedSigning(fixture),
          { f } = ready;
        const key = randomUUID();
        const commit = () => declare(ready, key);
        const revoke = () =>
          fixture.request({
            path: `/company-${bundle}-assignments/${f.ready.source.preparerMembershipId}/${ready.target.companyId}`,
            init: {
              method: 'DELETE',
              headers: { 'idempotency-key': randomUUID() },
            },
          });
        const persistedBundle =
          bundle === 'director-client'
            ? 'company_director_client_access'
            : 'company_' + bundle.replaceAll('-', '_');
        const responses = await orderedPair(
          'SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle::text=$3 AND revoked_at IS NULL FOR UPDATE',
          [
            ready.target.companyId,
            f.ready.source.preparerMembershipId,
            persistedBundle,
          ],
          revokeFirst ? revoke : commit,
          revokeFirst ? commit : revoke,
        );
        expect(responses[0].status).toBe(revokeFirst ? 200 : 201);
        expect(responses[1].status).toBe(revokeFirst ? 403 : 200);
        expect(
          (
            await fixture.pool.query<{ count: number }>(
              'SELECT count(*)::int count FROM contract_signing_declarations',
            )
          ).rows[0]?.count,
        ).toBe(revokeFirst ? 0 : 1);
        expect((await declare(ready, key)).status).toBe(403);
      }
    },
    30_000,
  );

  it.each([true, false])(
    'converges identical keys or conserves one terminal statement for distinct keys: %s',
    async (identical) => {
      const ready = await prepareReportedSigning(fixture),
        key = randomUUID();
      const [one, two] = await orderedPair(
        'SELECT id FROM client_accounts WHERE id=$1 FOR UPDATE',
        [ready.f.ready.source.clientId],
        () => declare(ready, key),
        () => declare(ready, identical ? key : randomUUID()),
      );
      expect(one.status).toBe(201);
      expect(two.status).toBe(identical ? 201 : 409);
      if (identical) expect(await one.json()).toEqual(await two.json());
      expect(
        (
          await fixture.pool.query<{
            declarations: number;
            events: number;
            receipts: number;
          }>(
            "SELECT (SELECT count(*)::int FROM contract_signing_declarations) declarations,(SELECT count(*)::int FROM contract_events WHERE action='contract_version.signing_declared') events,(SELECT count(*)::int FROM contract_commands WHERE kind='DECLARE_SIGNING') receipts",
          )
        ).rows[0],
      ).toEqual({ declarations: 1, events: 1, receipts: 1 });
    },
  );

  it('rolls back every coupled effect when complete response construction or stored decoding fails', async () => {
    const ready = await prepareReportedSigning(fixture);
    const facts = async () => {
      const values: Record<string, unknown> = {};
      for (const table of [
        'contracts',
        'contract_versions',
        'contract_quality_runs',
        'contract_signing_declarations',
        'contract_commands',
        'contract_events',
        'client_accounts',
      ])
        values[table] = (
          await fixture.pool.query<{ facts: unknown }>(
            `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) facts FROM ${table} t`,
          )
        ).rows[0]?.facts;
      return values;
    };
    const before = await facts();
    const failure = vi
      .spyOn(presentation, 'readReportedSigningDeclaration')
      .mockImplementationOnce(() => {
        throw new Error('Synthetic stored result decoding/response failure');
      });
    try {
      expect((await declare(ready)).status).toBe(500);
      expect(await facts()).toEqual(before);
    } finally {
      failure.mockRestore();
    }
    expect((await declare(ready)).status).toBe(201);
    const current = responseRecord(
      responseRecord(
        await fixture.read({ ...ready.target, path: ready.f.ready.path }),
      ).contract,
    );
    expect(current).toMatchObject({
      revision: 3,
      version: { executionState: 'EXECUTED' },
    });
  });
  it('serializes native original-Client archive before or after declaration and always denies archived-original replay', async () => {
    for (const archiveFirst of [true, false]) {
      if (!archiveFirst) await fixture.reset();
      const ready = await prepareReportedSigning(fixture),
        key = randomUUID();
      const lock = 'SELECT id FROM client_accounts WHERE id=$1 FOR UPDATE',
        values = [ready.f.ready.source.clientId];
      const archive = () =>
        fixture.pool.query(
          "UPDATE client_accounts SET status='archived',version=version+1 WHERE id=$1",
          values,
        );
      if (archiveFirst) {
        const [archived, declined] = await orderedPair(
          lock,
          values,
          archive,
          () => declare(ready, key),
        );
        expect(archived.rowCount).toBe(1);
        expect(declined.status).toBe(404);
      } else {
        const [declared, archived] = await orderedPair(
          lock,
          values,
          () => declare(ready, key),
          archive,
        );
        expect(declared.status).toBe(201);
        expect(archived.rowCount).toBe(1);
      }
      expect((await declare(ready, key)).status).toBe(404);
      expect(
        (
          await fixture.pool.query<{ count: number }>(
            'SELECT count(*)::int count FROM contract_signing_declarations',
          )
        ).rows[0]?.count,
      ).toBe(archiveFirst ? 0 : 1);
      expect(
        (await fixture.request({ ...ready.target, path: ready.f.ready.path }))
          .status,
      ).toBe(archiveFirst ? 200 : 404);
    }
  }, 30_000);

  it('serializes both PDF designation orders while preserving the exact formerly official bytes and receipt', async () => {
    for (const designationFirst of [true, false]) {
      if (!designationFirst) await fixture.reset();
      const ready = await prepareReportedSigning(fixture),
        key = randomUUID();
      const next = responseRecord(
        await (
          await ready.f.mutate('/versions', { expectedRevision: 3 })
        ).json(),
      );
      if (typeof next.versionId !== 'string')
        throw new Error('Missing received PDF successor.');
      const nextId = next.versionId;
      expect((await ready.f.upload(nextId, 4, PDF_B)).status).toBe(201);
      const designate = () =>
        ready.f.mutate(`/versions/${nextId}/official-designation`, {
          expectedRevision: 5,
        });
      const responses = await orderedPair(
        'SELECT id FROM working_documents WHERE id=$1 FOR UPDATE',
        [ready.body.documentId],
        designationFirst ? designate : () => declare(ready, key),
        designationFirst ? () => declare(ready, key) : designate,
      );
      expect(responses[0].status).toBe(designationFirst ? 200 : 201);
      expect(responses[1].status).toBe(designationFirst ? 201 : 200);
      const declaration: unknown =
        await responses[designationFirst ? 1 : 0].json();
      expect(declaration).toMatchObject({
        pdf: {
          access: 'granted',
          reference: {
            documentVersionId: ready.body.documentVersionId,
            status: designationFirst ? 'superseded' : 'official',
          },
        },
      });
      expect(
        await fixture.command({
          ...ready.target,
          path: ready.path,
          body: ready.body,
          key,
        }),
      ).toEqual(declaration);
    }
  }, 30_000);
  it('serializes both union orders, refuses a stale Client review after new operational use and preserves authorized declaration replay after a fresh union', async () => {
    for (const unionFirst of [true, false]) {
      if (!unionFirst) await fixture.reset();
      const ready = await prepareReportedSigning(fixture),
        source = ready.f.ready.source,
        key = randomUUID();
      const other = responseRecord(
        await fixture.command({
          ...ready.target,
          path: '/clients',
          body: {
            displayName: 'Legacy duplicate Client DEMO',
            taxId: 'SEPARATE-UNION-877',
          },
        }),
      );
      if (typeof other.id !== 'string')
        throw new Error('Missing second historical Client.');
      const otherId = other.id;
      // Existing duplicate dossiers are a legacy-data fixture; public registration still refuses new duplicates.
      await fixture.pool.query(
        'UPDATE client_accounts SET tax_id=(SELECT tax_id FROM client_accounts WHERE id=$1) WHERE id=$2',
        [source.clientId, otherId],
      );
      const review = async () => {
        const result = responseRecord(
          await fixture.command({
            ...ready.target,
            path: `/clients/${source.clientId}/union-reviews`,
            body: {},
          }),
        );
        if (typeof result.reviewReference !== 'string')
          throw new Error('Missing public Client union comparison.');
        return result.reviewReference;
      };
      const body = {
        canonicalClientId: otherId,
        fields: {
          displayName: source.clientId,
          taxId: source.clientId,
          address: source.clientId,
          telephone: source.clientId,
          generalEmail: source.clientId,
          businessActivity: source.clientId,
        },
        companyIds: [source.companyId],
        reviewedDifferences: true,
        reason: 'Synthetic legacy duplicate deliberately reviewed',
      };
      const reference = await review();
      const unite = () =>
        fixture.post({
          ...ready.target,
          path: `/client-union-reviews/${reference}/confirm`,
          body,
        });
      const responses = await orderedPair(
        'SELECT id FROM client_accounts WHERE id=$1 FOR UPDATE',
        [source.clientId],
        unionFirst ? unite : () => declare(ready, key),
        unionFirst ? () => declare(ready, key) : unite,
      );
      expect(responses[0].status).toBe(201); // Client union intentionally conceals an invalidated comparison as 404.
      expect(responses[1].status).toBe(404);
      if (!unionFirst) {
        const recorded: unknown = await responses[0].json();
        const fresh = await review();
        expect(
          (
            await fixture.post({
              ...ready.target,
              path: `/client-union-reviews/${fresh}/confirm`,
              body,
            })
          ).status,
        ).toBe(201);
        expect(
          await fixture.command({
            ...ready.target,
            path: ready.path,
            body: ready.body,
            key,
          }),
        ).toEqual(recorded);
      }
      expect(
        (
          await fixture.pool.query<{ count: number }>(
            'SELECT count(*)::int count FROM contract_signing_declarations',
          )
        ).rows[0]?.count,
      ).toBe(unionFirst ? 0 : 1);
    }
  }, 30_000);

  it('fences both native membership deactivation orders and never replays to an inactive actor', async () => {
    for (const deactivateFirst of [true, false]) {
      if (!deactivateFirst) await fixture.reset();
      const ready = await prepareReportedSigning(fixture),
        key = randomUUID();
      const values = [ready.f.ready.source.preparerMembershipId],
        lock = 'SELECT id FROM workspace_memberships WHERE id=$1 FOR UPDATE';
      const deactivate = () =>
        fixture.pool.query(
          "UPDATE workspace_memberships SET status='inactive' WHERE id=$1",
          values,
        );
      if (deactivateFirst) {
        const [changed, denied] = await orderedPair(
          lock,
          values,
          deactivate,
          () => declare(ready, key),
        );
        expect(changed.rowCount).toBe(1);
        expect(denied.status).toBe(403);
      } else {
        const [recorded, changed] = await orderedPair(
          lock,
          values,
          () => declare(ready, key),
          deactivate,
        );
        expect(recorded.status).toBe(201);
        expect(changed.rowCount).toBe(1);
      }
      expect((await declare(ready, key)).status).toBe(403);
      expect(
        (
          await fixture.pool.query<{ count: number }>(
            'SELECT count(*)::int count FROM contract_signing_declarations',
          )
        ).rows[0]?.count,
      ).toBe(deactivateFirst ? 0 : 1);
    }
  }, 30_000);

  it('serializes declaration against an ordinary Project link without a partial link or duplicate Project', async () => {
    for (const linkFirst of [true, false]) {
      if (!linkFirst) await fixture.reset();
      const ready = await prepareReportedSigning(fixture);
      for (const path of [
        '/company-project-template-user-assignments',
        '/company-project-assignments',
        '/company-task-manager-assignments',
      ])
        await fixture.grant({
          path,
          companyId: ready.target.companyId,
          membershipId: ready.f.ready.source.preparerMembershipId,
        });
      const project = responseRecord(
        await fixture.command({
          ...ready.target,
          path: '/projects/from-template',
          body: {
            title: 'Existing concurrent Project DEMO',
            clientAccountId: ready.f.ready.source.clientId,
            templateKey: 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE',
            templateVersion: 1,
          },
        }),
      );
      if (typeof project.id !== 'string')
        throw new Error('Missing existing Project.');
      const projectId = project.id,
        linkPath = ready.f.ready.path + '/projects',
        key = randomUUID();
      const link = () =>
        fixture.post({
          ...ready.target,
          path: linkPath,
          body: { expectedContractRevision: 2, projectId },
          key,
        });
      const responses = await orderedPair(
        'SELECT id FROM contracts WHERE id=$1 FOR UPDATE',
        [ready.f.contractId],
        linkFirst ? link : () => declare(ready),
        linkFirst ? () => declare(ready) : link,
      );
      expect(responses[linkFirst ? 0 : 1].status).toBe(409);
      expect(responses[linkFirst ? 1 : 0].status).toBe(201);
      expect(
        (
          await fixture.pool.query<{ count: number }>(
            'SELECT count(*)::int count FROM contract_project_links',
          )
        ).rows[0]?.count,
      ).toBe(0);
      expect(
        await fixture.command({
          ...ready.target,
          path: linkPath,
          body: { expectedContractRevision: 3, projectId },
          key,
        }),
      ).toMatchObject({ projectId, revision: 4 });
      expect(
        (
          await fixture.pool.query<{ count: number }>(
            'SELECT count(*)::int count FROM projects WHERE company_id=$1',
            [ready.target.companyId],
          )
        ).rows[0]?.count,
      ).toBe(1);
    }
  }, 30_000);
});
