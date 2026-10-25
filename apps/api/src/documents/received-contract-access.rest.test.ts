import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_OWNER,
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { revokeModelContractFixtureGrant } from '../contract/model-contract.test-fixture.js';
import {
  registerReceivedContract,
  receivedContractEffects,
} from './received-contract.test-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import { PDF_A } from './mission-document.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Received Contract independent access and scope REST', () => {
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

  it.each([null, 'v999'])(
    'fails closed when a future database supplies the unsupported family capture %s',
    async (capture) => {
      const f = await registerReceivedContract(fixture),
        s = f.ready.source;
      const definition = await fixture.pool.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
      );
      const check = definition.rows[0]?.definition;
      if (!check?.startsWith('CHECK ('))
        throw new Error('Missing owned capture CHECK');
      await fixture.pool.query(
        'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
      );
      try {
        await fixture.pool.query(
          "UPDATE company_role_assignments SET permission_set_version=$1 WHERE company_id=$2 AND workspace_membership_id=$3 AND bundle='company_received_contract_access'",
          [capture, s.companyId, s.preparerMembershipId],
        );
        const actor = responseRecord(
          await fixture.read({
            path: '/access/current-actor',
            companyId: s.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          }),
        );
        expect(
          responseRecord(actor.activeCompany).documentPermissions,
        ).not.toContain('document.received_contract.access');
        expect(responseRecord(actor.activeCompany)).not.toHaveProperty(
          'receivedContractAccessAssignmentId',
        );
        expect((await f.call('')).status).toBe(404);
        expect((await f.call('/versions')).status).toBe(404);
        expect(
          await fixture.read({
            path: '/documents',
            companyId: s.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          }),
        ).toEqual([]);
        expect((await fixture.post(f.options)).status).toBe(403);
        expect(
          (
            await fixture.request({
              path: '/documents/received-contract-sources',
              companyId: s.companyId,
              headers: ESTIMATE_OFFER_PREPARER,
            })
          ).status,
        ).toBe(403);
      } finally {
        await fixture.pool.query(
          "UPDATE company_role_assignments SET permission_set_version='v1' WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_received_contract_access'",
          [s.companyId, s.preparerMembershipId],
        );
        await fixture.pool.query(
          'ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ' +
            check,
        );
      }
      expect((await f.call('')).status).toBe(200);
    },
  );

  it('requires ordinary Document and Client rights separately from the new family, and hides source/PDF metadata independently', async () => {
    const f = await registerReceivedContract(fixture),
      s = f.ready.source;
    const documentId = responseString(f.document, 'id'),
      versionId = responseString(responseRecord(f.document.version), 'id');
    for (const path of [
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
    ])
      await fixture.grant({
        path,
        companyId: s.companyId,
        membershipId: s.preparerMembershipId,
      });
    expect((await f.upload(versionId, 1, PDF_A)).status).toBe(201);
    const read = (suffix = '') =>
      fixture.request({
        path: '/documents/' + documentId + suffix,
        companyId: s.companyId,
        headers: ESTIMATE_OFFER_READER,
      });
    await fixture.grant({
      path: '/company-received-contract-access-assignments',
      companyId: s.companyId,
      membershipId: s.readerMembershipId,
    });
    expect((await read()).status).toBe(403);
    await fixture.grant({
      path: '/company-director-client-assignments',
      companyId: s.companyId,
      membershipId: s.readerMembershipId,
    });
    expect((await read()).status).toBe(403);
    await fixture.grant({
      path: '/company-document-registrar-assignments',
      companyId: s.companyId,
      membershipId: s.readerMembershipId,
    });
    expect(await (await read()).json()).toMatchObject({
      type: 'received-contract',
      receivedContractRelation: { access: 'denied' },
    });
    const versions = await read('/versions');
    expect(versions.status).toBe(200);
    expect(await versions.json()).toMatchObject({
      versions: [{ pdfContent: { state: 'stored', access: 'denied' } }],
    });
    expect((await read(`/versions/${versionId}/content`)).status).toBe(403);
    expect((await read(`/versions/${versionId}/content/history`)).status).toBe(
      403,
    );
    await fixture.grant({
      path: '/company-contract-preparer-assignments',
      companyId: s.companyId,
      membershipId: s.readerMembershipId,
    });
    expect(await (await read()).json()).toMatchObject({
      receivedContractRelation: f.document.receivedContractRelation,
    });
    await revokeModelContractFixtureGrant(
      fixture,
      '/company-commercial-intake-assignments',
      s.companyId,
      s.readerMembershipId,
    );
    const redacted = responseRecord(await (await read()).json());
    expect(redacted.receivedContractRelation).toEqual({ access: 'denied' });
    await revokeModelContractFixtureGrant(
      fixture,
      '/company-received-contract-access-assignments',
      s.companyId,
      s.readerMembershipId,
    );
    expect((await read()).status).toBe(404);
    expect(
      await fixture.read({
        path: '/documents',
        companyId: s.companyId,
        headers: ESTIMATE_OFFER_READER,
      }),
    ).toEqual([]);
  });

  it('refuses known and unknown foreign Company sources/Documents uniformly under otherwise sufficient grants', async () => {
    const f = await registerReceivedContract(fixture),
      s = f.ready.source;
    const company = responseRecord(
        await fixture.command({
          path: '/companies',
          body: { displayName: 'Other received Company DEMO' },
        }),
      ),
      companyId = responseString(company, 'id');
    for (const path of [
      '/company-context-assignments',
      '/company-commercial-intake-assignments',
      '/company-contract-preparer-assignments',
      '/company-director-client-assignments',
      '/company-document-registrar-assignments',
      '/company-received-contract-access-assignments',
    ])
      await fixture.grant({
        path,
        companyId,
        membershipId: s.preparerMembershipId,
      });
    const before = await receivedContractEffects(fixture.pool);
    const errors: unknown[] = [];
    for (const id of [responseString(f.document, 'id'), randomUUID()]) {
      const response = await fixture.request({
        path: '/documents/' + id,
        companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      });
      expect(response.status).toBe(404);
      errors.push(await response.json());
    }
    expect(errors[0]).toEqual(errors[1]);
    expect(
      await fixture.read({
        path: '/documents',
        companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    ).toEqual([]);
    expect(
      await fixture.read({
        path: '/documents/received-contract-sources',
        companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    ).toEqual({ sources: [], nextCursor: null });
    expect(
      (await fixture.post({ ...f.options, companyId, key: randomUUID() }))
        .status,
    ).toBe(404);
    expect((await fixture.post({ ...f.options, companyId })).status).toBe(409);
    expect(await receivedContractEffects(fixture.pool)).toEqual(before);
  });

  it('does not disclose an old registration or exact relation to a second Workspace membership of the same Internal User', async () => {
    const f = await registerReceivedContract(fixture);
    const owner = responseRecord(
        await fixture.read({ path: '/access/current-actor' }),
      ),
      preparer = responseRecord(
        await fixture.read({
          path: '/access/current-actor',
          headers: ESTIMATE_OFFER_PREPARER,
        }),
      );
    const workspaceId = randomUUID(),
      ownerMembershipId = randomUUID(),
      membershipId = randomUUID();
    await fixture.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2)', [
      workspaceId,
      'Synthetic separate received Workspace',
    ]);
    for (const [id, userId] of [
      [ownerMembershipId, responseString(owner, 'internalUserId')],
      [membershipId, responseString(preparer, 'internalUserId')],
    ])
      await fixture.pool.query(
        'INSERT INTO workspace_memberships(id,workspace_id,internal_user_id) VALUES($1,$2,$3)',
        [id, workspaceId, userId],
      );
    for (const permission of ['company.manage', 'company.assignment.manage'])
      await fixture.pool.query(
        'INSERT INTO workspace_permission_grants(workspace_id,workspace_membership_id,permission) VALUES($1,$2,$3)',
        [workspaceId, ownerMembershipId, permission],
      );
    const command = async (path: string, body: unknown) => {
      const result = await fixture.request({
        path,
        headers: ESTIMATE_OFFER_OWNER,
        init: {
          method: 'POST',
          headers: {
            'x-workspace-context-id': workspaceId,
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          body: JSON.stringify(body),
        },
      });
      expect(result.status).toBe(201);
      return responseRecord(await result.json());
    };
    const companyId = responseString(
      await command('/companies', {
        displayName: 'Second received Workspace Company',
      }),
      'id',
    );
    for (const path of [
      '/company-context-assignments',
      '/company-commercial-intake-assignments',
      '/company-contract-preparer-assignments',
      '/company-director-client-assignments',
      '/company-document-registrar-assignments',
      '/company-received-contract-access-assignments',
    ])
      await command(path, { companyId, workspaceMembershipId: membershipId });
    const actor = await fixture.request({
      path: '/access/current-actor',
      companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      init: { headers: { 'x-workspace-context-id': workspaceId } },
    });
    expect(actor.status).toBe(200);
    expect(await actor.json()).toMatchObject({
      workspaceId,
      workspaceMembershipId: membershipId,
      internalUserId: preparer.internalUserId,
    });
    const before = await receivedContractEffects(fixture.pool);
    for (const id of [responseString(f.document, 'id'), randomUUID()]) {
      const result = await fixture.request({
        path: '/documents/' + id,
        companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        init: { headers: { 'x-workspace-context-id': workspaceId } },
      });
      expect(result.status).toBe(404);
      expect(JSON.stringify(await result.json())).not.toContain(
        f.contractVersionId,
      );
    }
    const replay = await fixture.request({
      path: '/documents',
      companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      init: {
        method: 'POST',
        headers: {
          'x-workspace-context-id': workspaceId,
          'content-type': 'application/json',
          'idempotency-key': f.options.key,
        },
        body: JSON.stringify(f.options.body),
      },
    });
    expect(replay.status).toBe(404);
    expect(await receivedContractEffects(fixture.pool)).toEqual(before);
  });
});
