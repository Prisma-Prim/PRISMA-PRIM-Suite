import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import { PDF_A } from '../documents/mission-document.test-support.js';
import {
  ESTIMATE_OFFER_OWNER,
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { revokeModelContractFixtureGrant } from './model-contract.test-fixture.js';
import { prepareReportedSigning } from './reported-contract-signing.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Reported signing independent reads and scoped discovery', () => {
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

  it('reads common history without declaration, signature, Offer, model or PDF grants and reveals only independently restored PDF facts', async () => {
    const ready = await prepareReportedSigning(fixture),
      source = ready.f.ready.source;
    const declaration = responseRecord(
      await fixture.command({
        ...ready.target,
        path: ready.path,
        body: ready.body,
      }),
    );
    for (const path of [
      '/company-contract-preparer-assignments',
      '/company-director-client-assignments',
      '/company-commercial-activity-reader-assignments',
    ])
      await fixture.grant({
        path,
        companyId: source.companyId,
        membershipId: source.readerMembershipId,
      });
    await revokeModelContractFixtureGrant(
      fixture,
      '/company-offer-approver-assignments',
      source.companyId,
      source.readerMembershipId,
    );
    const target = {
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_READER,
    };
    const current = responseRecord(
      responseRecord(
        await fixture.read({ ...target, path: ready.f.ready.path }),
      ).contract,
    );
    const signature = responseRecord(responseRecord(current.version).signature);
    expect(signature).toEqual({ ...declaration, pdf: { access: 'denied' } });
    for (const hidden of [
      ready.body.documentId,
      ready.body.documentVersionId,
      ready.body.representationId,
      'received-demo.pdf',
    ])
      expect(JSON.stringify(current)).not.toContain(hidden);
    expect(
      (await fixture.post({ ...target, path: ready.path, body: ready.body }))
        .status,
    ).toBe(403);
    const activity = responseRecord(
      await fixture.read({ ...target, path: '/activity-log' }),
    );
    if (!Array.isArray(activity.events))
      throw new Error('Missing Activity page.');
    const events = activity.events
      .map(responseRecord)
      .filter((row) => row.action === 'contract_version.signing_declared');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      target: {
        contractId: ready.f.contractId,
        contractVersionId: ready.f.contractVersionId,
      },
      metadata: {
        evidenceKind: 'DECLARED_RECEIVED_PDF',
        provenance: 'COMPANY_MODEL_OFFER',
      },
    });
    expect(Object.keys(responseRecord(events[0]?.metadata)).sort()).toEqual([
      'evidenceKind',
      'provenance',
    ]);
    for (const hidden of [
      ready.body.providerSignatory.label,
      ready.body.concordanceBasis,
      ready.body.documentId,
      ready.body.documentVersionId,
      ready.body.representationId,
    ])
      expect(JSON.stringify(events)).not.toContain(hidden);
    for (const path of [
      '/company-document-registrar-assignments',
      '/company-received-contract-access-assignments',
      '/company-document-content-reader-assignments',
    ])
      await fixture.grant({
        path,
        companyId: source.companyId,
        membershipId: source.readerMembershipId,
      });
    const restored = responseRecord(
      responseRecord(
        await fixture.read({ ...target, path: ready.f.ready.path }),
      ).contract,
    );
    expect(responseRecord(restored.version).signature).toEqual(declaration);
  });

  it('filters exact readable PDFs before twenty-row pages and binds opaque cursors to the Company and exact Version', async () => {
    const ready = await prepareReportedSigning(fixture),
      foreign = await prepareReportedSigning(fixture, {
        clientTaxId: 'OTHER-PAGING-877',
      });
    const allowed = new Set([ready.body.documentId]);
    for (let index = 0; index < 21; index++) {
      const document = responseRecord(
        await fixture.command({
          ...ready.target,
          path: '/documents',
          body: {
            type: 'received-contract',
            opportunityId: ready.f.ready.source.opportunityId,
            contractId: ready.f.contractId,
            contractVersionId: ready.f.contractVersionId,
            title: 'Page received PDF DEMO ' + index,
            purpose: 'Bounded exact selection',
            sourceDescription: 'Anonymous page source',
            receivedOn: null,
          },
        }),
      );
      if (index === 20) continue; // The final draft is deliberately not eligible.
      const id = responseString(document, 'id'),
        versionId = responseString(responseRecord(document.version), 'id');
      allowed.add(id);
      const upload = await fixture.request({
        ...ready.target,
        path: `/documents/${id}/versions/${versionId}/content?expectedRevision=1&fileName=page-demo.pdf`,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/pdf',
            'idempotency-key': randomUUID(),
          },
          body: new Uint8Array(PDF_A),
        },
      });
      expect(upload.status).toBe(201);
      const designation = await fixture.request({
        ...ready.target,
        path: `/documents/${id}/versions/${versionId}/official-designation`,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          body: JSON.stringify({ expectedRevision: 2 }),
        },
      });
      expect(designation.status).toBe(200);
    }
    const first = responseRecord(
      await fixture.read({
        ...ready.target,
        path: ready.path + '/pdf-candidates',
      }),
    );
    expect(first).not.toHaveProperty('total');
    expect(first.items).toHaveLength(20);
    const cursor = responseString(first, 'nextCursor');
    expect(cursor).not.toMatch(/^[a-f0-9-]{36}$/u);
    const second = responseRecord(
      await fixture.read({
        ...ready.target,
        path:
          ready.path + '/pdf-candidates?cursor=' + encodeURIComponent(cursor),
      }),
    );
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    if (!Array.isArray(first.items) || !Array.isArray(second.items))
      throw new Error('Missing bounded pages.');
    expect(
      new Set(
        [...first.items, ...second.items].map((row) =>
          responseString(responseRecord(row), 'documentId'),
        ),
      ),
    ).toEqual(allowed);
    expect(
      (
        await fixture.request({
          ...foreign.target,
          path:
            foreign.path +
            '/pdf-candidates?cursor=' +
            encodeURIComponent(cursor),
        })
      ).status,
    ).toBe(400);
    for (const opportunityId of [
      ready.f.ready.source.opportunityId,
      randomUUID(),
    ]) {
      const path = `/contracts/opportunities/${opportunityId}/versions/${ready.f.contractVersionId}/signing-declarations`;
      const denied = await fixture.post({
        ...foreign.target,
        path,
        body: ready.body,
      });
      expect(denied.status).toBe(404);
      expect(JSON.stringify(await denied.json())).not.toContain(
        ready.f.contractId,
      );
    }
  }, 30_000);

  it('denies known records and exact receipt replay to a second Workspace membership of the same Internal User', async () => {
    const ready = await prepareReportedSigning(fixture),
      key = randomUUID();
    await fixture.command({
      ...ready.target,
      path: ready.path,
      body: ready.body,
      key,
    });
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
      'Separate signing Workspace DEMO',
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
    async function command(path: string, body: unknown) {
      const response = await fixture.request({
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
      expect(response.status).toBe(201);
      return responseRecord(await response.json());
    }
    const companyId = responseString(
      await command('/companies', {
        displayName: 'Separate signing Company DEMO',
      }),
      'id',
    );
    for (const path of [
      '/company-context-assignments',
      '/company-commercial-intake-assignments',
      '/company-contract-preparer-assignments',
      '/company-contract-approver-assignments',
      '/company-contract-signature-declarer-assignments',
      '/company-offer-preparer-assignments',
      '/company-director-client-assignments',
      '/company-document-registrar-assignments',
      '/company-received-contract-access-assignments',
      '/company-document-content-reader-assignments',
      '/company-commercial-activity-reader-assignments',
    ])
      await command(path, { companyId, workspaceMembershipId: membershipId });
    const target = { companyId, headers: ESTIMATE_OFFER_PREPARER };
    const actor = await fixture.request({
      ...target,
      path: '/access/current-actor',
      init: { headers: { 'x-workspace-context-id': workspaceId } },
    });
    expect(actor.status).toBe(200);
    expect(await actor.json()).toMatchObject({
      workspaceId,
      workspaceMembershipId: membershipId,
      internalUserId: preparer.internalUserId,
    });
    for (const opportunityId of [
      ready.f.ready.source.opportunityId,
      randomUUID(),
    ]) {
      const base = `/contracts/opportunities/${opportunityId}`;
      for (const path of [
        base,
        base + '/versions',
        base +
          `/versions/${ready.f.contractVersionId}/signing-declarations/pdf-candidates`,
      ]) {
        const result = await fixture.request({
          ...target,
          path,
          init: { headers: { 'x-workspace-context-id': workspaceId } },
        });
        expect(result.status).toBe(404);
        expect(JSON.stringify(await result.json())).not.toContain(
          ready.f.contractId,
        );
      }
    }
    const replay = await fixture.request({
      ...target,
      path: ready.path,
      init: {
        method: 'POST',
        headers: {
          'x-workspace-context-id': workspaceId,
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        body: JSON.stringify(ready.body),
      },
    });
    expect(replay.status).toBe(404);
    const activity = await fixture.request({
      ...target,
      path: '/activity-log',
      init: { headers: { 'x-workspace-context-id': workspaceId } },
    });
    expect(activity.status).toBe(200);
    const serialized = JSON.stringify(await activity.json());
    for (const hidden of [
      ready.f.contractId,
      ready.f.contractVersionId,
      ready.body.documentId,
      ready.body.representationId,
    ])
      expect(serialized).not.toContain(hidden);
  });
});
