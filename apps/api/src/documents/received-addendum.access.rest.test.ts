import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configuredAccessAdmission } from '../access/access-admission.js';
import { AccessService } from '../access/access.service.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { revokeModelContractFixtureGrant } from '../contract/model-contract.test-fixture.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  ESTIMATE_OFFER_OWNER,
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_WORKSPACE,
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
withPostgres('Received Addendum independent current authority', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  let parent: Awaited<ReturnType<typeof prepareReceivedAddendumParent>>;
  let document: Record<string, unknown>, documentId: string, versionId: string;
  let bytes: Buffer, uploadReceipt: unknown;
  let registrationKey: string, uploadKey: string;

  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
    });
    bytes = await fictionalAddendumPdf('Independent Addendum authority');
  });
  beforeEach(async () => {
    await fixture.reset();
    scanner.reset();
    parent = await prepareReceivedAddendumParent(fixture);
    registrationKey = randomUUID();
    const saved = await parent.register(registrationKey);
    expect(saved.status, await saved.clone().text()).toBe(201);
    document = responseRecord(await saved.json());
    documentId = responseString(document, 'id');
    versionId = responseString(responseRecord(document.version), 'id');
    uploadKey = randomUUID();
    const uploaded = await upload(1, uploadKey);
    expect(uploaded.status, await uploaded.clone().text()).toBe(201);
    uploadReceipt = await uploaded.json();
  });
  afterAll(async () => {
    await fixture?.close();
    await scanner?.close();
  });

  const read = (suffix = '') =>
    parent.call(`/documents/${documentId}${suffix}`);
  const mutate = (suffix: string, body: unknown) =>
    parent.call(`/documents/${documentId}${suffix}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify(body),
    });
  const upload = (revision: number, key: string = randomUUID()) =>
    parent.call(
      `/documents/${documentId}/versions/${versionId}/content?expectedRevision=${revision}&fileName=fictional-addendum.pdf`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/pdf',
          'idempotency-key': key,
        },
        body: new Uint8Array(bytes),
      },
    );
  const revoke = (path: string) =>
    revokeModelContractFixtureGrant(
      fixture,
      path,
      parent.target.companyId,
      parent.ready.source.preparerMembershipId,
    );

  it.each(['Contract', 'Opportunity'] as const)(
    'withholds every relation fact after %s read loss while native PDF work and its exact retry survive',
    async (authority) => {
      expect(document).not.toHaveProperty('createdAt');
      const grantedRelation = responseRecord(document.receivedAddendumRelation);
      expect(grantedRelation.access).toBe('granted');
      expect(grantedRelation.registeredAt).toEqual(expect.any(String));
      const registrarResponse = await parent.call('/access/current-actor');
      expect(registrarResponse.status).toBe(200);
      const registrar = responseRecord(await registrarResponse.json());
      expect(grantedRelation.registeredBy).toEqual({
        workspaceMembershipId: parent.ready.source.preparerMembershipId,
        internalUserId: registrar.internalUserId,
      });
      const registrationReplay = await parent.register(registrationKey);
      expect(registrationReplay.status).toBe(201);
      const replay = responseRecord(await registrationReplay.json());
      expect(replay).not.toHaveProperty('createdAt');
      expect(replay.receivedAddendumRelation).toEqual(grantedRelation);
      if (authority === 'Contract') {
        await revoke('/company-contract-preparer-assignments');
        await revoke('/company-contract-approver-assignments');
      } else await revoke('/company-commercial-intake-assignments');
      const metadataResponse = await read();
      expect(metadataResponse.status).toBe(200);
      const metadata = responseRecord(await metadataResponse.json());
      expect(metadata.receivedAddendumRelation).toEqual({ access: 'denied' });
      const versionsResponse = await read('/versions');
      expect(versionsResponse.status).toBe(200);
      const versionRead = responseRecord(await versionsResponse.json());
      const initialVersion = responseRecord(
        Array.isArray(versionRead.versions)
          ? versionRead.versions[0]
          : undefined,
      );
      expect({
        documentCreatedAt: metadata.createdAt,
        initialVersionCreatedAt: initialVersion.createdAt,
        initialVersionCreatedBy: initialVersion.createdBy,
      }).toEqual({
        documentCreatedAt: undefined,
        initialVersionCreatedAt: undefined,
        initialVersionCreatedBy: undefined,
      });
      expect(metadata).not.toHaveProperty('createdByMembershipId');
      expect(metadata).not.toHaveProperty('projectAssociation');
      for (const field of [
        'opportunityId',
        'parentContractId',
        'parentContractVersionId',
        'contractVersionNumber',
        'illustrativeReference',
        'recordedRecipient',
        'sourceDescription',
        'receivedOn',
        'registeredAt',
        'registeredBy',
      ])
        expect(metadata).not.toHaveProperty(field);
      const inventory = await parent.call('/documents');
      expect(inventory.status).toBe(200);
      const rows: unknown = await inventory.json();
      if (!Array.isArray(rows)) throw new Error('Missing native Document list');
      const listed = rows.map(responseRecord);
      const addendum = listed.find((row) => row.id === documentId);
      expect(addendum).toBeDefined();
      expect(addendum).not.toHaveProperty('createdAt');
      expect(
        listed.find((row) => row.type === 'received-contract')?.createdAt,
      ).toEqual(expect.any(String));
      expect(rows).toContainEqual(
        expect.objectContaining({
          id: documentId,
          receivedAddendumRelation: { access: 'denied' },
        }),
      );
      expect(
        Buffer.from(
          await (await read(`/versions/${versionId}/content`)).arrayBuffer(),
        ),
      ).toEqual(bytes);
      const scanCount = scanner.scanCount;
      expect(await (await upload(1, uploadKey)).json()).toEqual(uploadReceipt);
      expect(scanner.scanCount).toBe(scanCount);
      expect((await upload(2)).status).toBe(201);
      expect(
        (await read(`/versions/${versionId}/content/history`)).status,
      ).toBe(200);
      expect(
        (
          await mutate(`/versions/${versionId}/official-designation`, {
            expectedRevision: 3,
          })
        ).status,
      ).toBe(200);
      expect((await mutate('/versions', { expectedRevision: 4 })).status).toBe(
        201,
      );
      const later = responseRecord(await (await read('/versions')).json());
      if (!Array.isArray(later.versions))
        throw new Error('Missing native Versions');
      const successor = responseRecord(later.versions[0]);
      const initial = responseRecord(later.versions[1]);
      expect(successor).toMatchObject({
        number: 2,
        createdBy: { displayName: 'estimate-offer-preparer' },
      });
      expect(successor.createdAt).toEqual(expect.any(String));
      expect(initial).not.toHaveProperty('createdAt');
      expect(initial).not.toHaveProperty('createdBy');
      expect(initial.designatedAt).toEqual(expect.any(String));
      expect(initial.designatedBy).toEqual({
        displayName: 'estimate-offer-preparer',
      });
      expect(responseRecord(initial.pdfContent)).toMatchObject({
        state: 'stored',
        access: 'granted',
        storedBy: { displayName: 'estimate-offer-preparer' },
      });
      expect(responseRecord(initial.pdfContent).storedAt).toEqual(
        expect.any(String),
      );
      const corrected = await parent.call(`/documents/${documentId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({
          expectedRevision: 5,
          title: 'Native corrected title',
          purpose: 'Native corrected purpose',
        }),
      });
      expect(corrected.status, await corrected.clone().text()).toBe(200);
      expect(responseRecord(await corrected.json())).not.toHaveProperty(
        'createdAt',
      );
      const correctionHistory = responseRecord(
        await (await read('/correction-history')).json(),
      );
      if (!Array.isArray(correctionHistory.corrections))
        throw new Error('Missing native correction history');
      expect(responseRecord(correctionHistory.corrections[0])).toMatchObject({
        actor: { displayName: 'estimate-offer-preparer' },
      });
      expect(
        responseRecord(correctionHistory.corrections[0]).occurredAt,
      ).toEqual(expect.any(String));
      expect((await parent.register(registrationKey)).status).toBe(403);
      expect(
        (await parent.call('/documents/received-addendum-sources')).status,
      ).toBe(403);
      expect((await read('/correction-history')).status).toBe(200);
    },
  );

  it('withholds protected upload facts after Content Reader loss and lets an authorized Approver designate without it', async () => {
    await revoke('/company-document-content-reader-assignments');
    const metadata = responseRecord(await (await read()).json());
    expect(metadata.receivedAddendumRelation).toEqual(
      document.receivedAddendumRelation,
    );
    expect((await read(`/versions/${versionId}/content`)).status).toBe(403);
    expect((await read(`/versions/${versionId}/content/history`)).status).toBe(
      403,
    );
    expect((await upload(1, uploadKey)).status).toBe(403);
    const versions = responseRecord(await (await read('/versions')).json());
    expect(versions).toMatchObject({
      versions: [
        {
          id: versionId,
          pdfContent: { state: 'stored', access: 'denied' },
        },
      ],
    });
    expect(JSON.stringify(versions)).not.toContain('fictional-addendum.pdf');
    expect(JSON.stringify(versions)).not.toContain('sha256');
    expect(JSON.stringify(versions)).not.toContain('representationId');
    expect(
      (
        await mutate(`/versions/${versionId}/official-designation`, {
          expectedRevision: 2,
        })
      ).status,
    ).toBe(200);
    expect((await mutate('/versions', { expectedRevision: 3 })).status).toBe(
      201,
    );
    expect(await (await read()).json()).toMatchObject({
      receivedAddendumRelation: document.receivedAddendumRelation,
    });
  });

  it('requires the new captured family independently of every existing source and native PDF grant', async () => {
    await revoke('/company-received-addendum-access-assignments');
    expect((await read()).status).toBe(404);
    expect((await read('/versions')).status).toBe(404);
    expect((await read(`/versions/${versionId}/content`)).status).toBe(404);
    expect((await parent.register(registrationKey)).status).toBe(403);
    expect(
      (await parent.call('/documents/received-addendum-sources')).status,
    ).toBe(403);
    const inventory = await parent.call('/documents');
    expect(inventory.status).toBe(200);
    expect(await inventory.json()).not.toContainEqual(
      expect.objectContaining({ id: documentId }),
    );
    // The old family continues to own the parent's own signing source.
    const parentSources = await parent.call(
      '/documents/received-contract-sources',
    );
    expect(parentSources.status).toBe(200);
    expect(responseRecord(await parentSources.json()).sources).toContainEqual(
      expect.objectContaining({
        contractVersionId: parent.parentContractVersionId,
      }),
    );
  });

  it('keeps native original-Client read as an independent prerequisite while the family assignment remains live', async () => {
    await revoke('/company-director-client-assignments');
    const actor = responseRecord(
      await (await parent.call('/access/current-actor')).json(),
    );
    expect(actor.workspacePermissions).not.toContain('client.manage');
    const company = responseRecord(actor.activeCompany);
    expect(company.clientPermissions).toEqual([]);
    expect(company.receivedAddendumAccessAssignmentId).toEqual(
      expect.any(String),
    );
    expect(company.documentPermissions).toContain(
      'document.received_addendum.access',
    );
    expect((await read()).status).toBe(403);
    expect((await read('/versions')).status).toBe(403);
    expect((await read(`/versions/${versionId}/content`)).status).toBe(403);
    expect((await parent.register(registrationKey)).status).toBe(403);
    expect(
      (await parent.call('/documents/received-addendum-sources')).status,
    ).toBe(403);
    await fixture.grant({
      path: '/company-director-client-assignments',
      companyId: parent.target.companyId,
      membershipId: parent.ready.source.preparerMembershipId,
    });
    expect((await read()).status).toBe(200);
    expect(
      Buffer.from(
        await (await read(`/versions/${versionId}/content`)).arrayBuffer(),
      ),
    ).toEqual(bytes);
  });

  it('does not consume current Offer, model, economic, signing or old-source authority for the conserved executed parent', async () => {
    for (const path of [
      '/company-offer-preparer-assignments',
      '/company-profitability-contributor-assignments',
      '/company-contract-model-editor-assignments',
      '/company-contract-model-approver-assignments',
      '/company-contract-signature-declarer-assignments',
      '/company-contract-approver-assignments',
      '/company-received-contract-access-assignments',
    ])
      await revoke(path);
    const actor = responseRecord(
      await (await parent.call('/access/current-actor')).json(),
    );
    const current = responseRecord(actor.activeCompany);
    expect(current.contractPermissions).toContain('commercial.contract.read');
    expect(current.contractPermissions).not.toContain(
      'commercial.contract.signature.record',
    );
    const choices = await parent.call('/documents/received-addendum-sources');
    expect(choices.status).toBe(200);
    expect(responseRecord(await choices.json()).sources).toContainEqual(
      expect.objectContaining({
        parentContractId: parent.parentContractId,
        parentContractVersionId: parent.parentContractVersionId,
        contractVersionNumber: 2,
      }),
    );
    expect((await parent.register(registrationKey)).status).toBe(201);
    expect((await parent.register()).status).toBe(201);
    expect(
      responseRecord(await (await read()).json()).receivedAddendumRelation,
    ).toEqual(document.receivedAddendumRelation);
  });

  describe('native Client-read alternatives and exact captures', () => {
    let ownerMembershipId: string;
    beforeEach(async () => {
      const current = responseRecord(
        await fixture.read({ path: '/access/current-actor' }),
      );
      ownerMembershipId = responseString(current, 'workspaceMembershipId');
      for (const path of [
        '/company-document-registrar-assignments',
        '/company-received-addendum-access-assignments',
        '/company-contract-preparer-assignments',
        '/company-commercial-intake-assignments',
        '/company-document-content-reader-assignments',
        '/company-document-content-uploader-assignments',
        '/company-document-approver-assignments',
      ])
        await fixture.grant({
          path,
          companyId: parent.target.companyId,
          membershipId: ownerMembershipId,
        });
    });
    const ownerCall = (path: string, init: RequestInit = {}) =>
      fixture.request({
        path,
        companyId: parent.target.companyId,
        headers: ESTIMATE_OFFER_OWNER,
        init,
      });
    function accessOwners() {
      const database = new DatabaseContext(drizzle(fixture.pool));
      const authorization = new CompanyContextAuthorization(database);
      const access = new AccessService(
        database,
        new AccountabilityService(database),
        configuredAccessAdmission({
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'estimate-offer-owner',
          ACCESS_BOOTSTRAP_WORKSPACE_ID: ESTIMATE_OFFER_WORKSPACE,
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Synthetic internal Offer Workspace',
        }),
        authorization,
        false,
      );
      const actor = (identity = ESTIMATE_OFFER_OWNER) =>
        access.resolveActor(
          {
            provider: responseString(identity, 'x-test-external-provider'),
            subject: responseString(identity, 'x-test-external-subject'),
            displayName: responseString(identity, 'x-test-display-name'),
            email: responseString(identity, 'x-test-email'),
          },
          {
            companyId: parent.target.companyId,
            workspaceId: ESTIMATE_OFFER_WORKSPACE,
          },
        );
      return { authorization, actor };
    }

    it('selects, registers and reopens using Workspace client.manage without Company Client identity-read or Finance', async () => {
      const actor = responseRecord(
        await (await ownerCall('/access/current-actor')).json(),
      );
      expect(actor.workspacePermissions).toContain('client.manage');
      const company = responseRecord(actor.activeCompany);
      expect(company.clientPermissions).toEqual([]);
      expect(company.clientPermissionAssignmentId).toBeUndefined();
      expect(company.receivedAddendumClientReadCapture).toMatch(
        /^received-addendum-client-read\.v1\.[a-f0-9]{64}$/u,
      );
      const choices = await ownerCall('/documents/received-addendum-sources');
      expect(choices.status).toBe(200);
      expect(responseRecord(await choices.json()).sources).toContainEqual(
        expect.objectContaining({
          parentContractVersionId: parent.parentContractVersionId,
        }),
      );
      const saved = await ownerCall('/documents', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify(parent.body),
      });
      expect(saved.status, await saved.clone().text()).toBe(201);
      const original = responseRecord(await saved.json());
      expect(original.receivedAddendumRelation).toMatchObject({
        access: 'granted',
      });
      expect(
        (await ownerCall(`/documents/${responseString(original, 'id')}`))
          .status,
      ).toBe(200);
      expect(
        (
          await ownerCall(
            `/documents/${documentId}/versions/${versionId}/content`,
          )
        ).status,
      ).toBe(200);
    });

    it('rejects malformed or absent captures and retires an old exact family assignment after native equal-permission replacement', async () => {
      const { authorization, actor } = accessOwners();
      const captured = await actor(ESTIMATE_OFFER_PREPARER);
      expect(await authorization.hasReceivedAddendumAccess(captured)).toBe(
        true,
      );
      const company = captured.activeCompany;
      if (!company) throw new Error('A native active Company is required.');
      for (const changed of [
        { ...company, receivedAddendumAccessAssignmentId: undefined },
        { ...company, receivedAddendumAccessAssignmentId: 'not-a-uuid' },
        { ...company, receivedAddendumAccessAssignmentId: randomUUID() },
        { ...company, receivedAddendumClientReadCapture: undefined },
        {
          ...company,
          receivedAddendumClientReadCapture:
            'received-addendum-client-read.v0.' + '0'.repeat(64),
        },
        { ...company, receivedAddendumAccessPermissionSetVersion: undefined },
      ])
        expect(
          await authorization.hasReceivedAddendumAccess({
            ...captured,
            activeCompany: changed,
          }),
        ).toBe(false);
      // A deliberately malformed external Actor field exercises the runtime version guard.
      const malformed = await actor(ESTIMATE_OFFER_PREPARER);
      if (!malformed.activeCompany)
        throw new Error('A native active Company is required.');
      Object.defineProperty(
        malformed.activeCompany,
        'receivedAddendumAccessPermissionSetVersion',
        { value: 'v0' },
      );
      expect(await authorization.hasReceivedAddendumAccess(malformed)).toBe(
        false,
      );
      await revoke('/company-received-addendum-access-assignments');
      await fixture.grant({
        path: '/company-received-addendum-access-assignments',
        companyId: parent.target.companyId,
        membershipId: parent.ready.source.preparerMembershipId,
      });
      const replacement = await actor(ESTIMATE_OFFER_PREPARER);
      expect(
        replacement.activeCompany?.receivedAddendumAccessAssignmentId,
      ).not.toBe(company.receivedAddendumAccessAssignmentId);
      expect(await authorization.hasReceivedAddendumAccess(captured)).toBe(
        false,
      );
      expect(await authorization.hasReceivedAddendumAccess(replacement)).toBe(
        true,
      );
    });

    it('changes the scoped Client capture on equal Workspace replacement while unrelated authority replacement preserves native content access', async () => {
      const { authorization, actor } = accessOwners();
      const captured = await actor();
      expect(await authorization.hasReceivedAddendumAccess(captured)).toBe(
        true,
      );
      const token = captured.activeCompany?.receivedAddendumClientReadCapture;
      await fixture.grant({
        path: '/company-contract-model-editor-assignments',
        companyId: parent.target.companyId,
        membershipId: ownerMembershipId,
      });
      await revokeModelContractFixtureGrant(
        fixture,
        '/company-contract-model-editor-assignments',
        parent.target.companyId,
        ownerMembershipId,
      );
      await fixture.grant({
        path: '/company-contract-model-editor-assignments',
        companyId: parent.target.companyId,
        membershipId: ownerMembershipId,
      });
      expect(
        (await actor()).activeCompany?.receivedAddendumClientReadCapture,
      ).toBe(token);
      expect(await authorization.hasReceivedAddendumAccess(captured)).toBe(
        true,
      );
      expect((await ownerCall(`/documents/${documentId}`)).status).toBe(200);
      expect(
        Buffer.from(
          await (
            await ownerCall(
              `/documents/${documentId}/versions/${versionId}/content`,
            )
          ).arrayBuffer(),
        ),
      ).toEqual(bytes);
      // Workspace grant administration has no public endpoint. Replace only the
      // real native grant identity as an authority-boundary negative/control.
      const transaction = await fixture.pool.connect();
      try {
        await transaction.query('BEGIN');
        const removed = await transaction.query<{ id: string }>(
          "DELETE FROM workspace_permission_grants WHERE workspace_id=$1 AND workspace_membership_id=$2 AND permission='client.manage' RETURNING id",
          [ESTIMATE_OFFER_WORKSPACE, ownerMembershipId],
        );
        expect(removed.rows).toHaveLength(1);
        await transaction.query(
          "INSERT INTO workspace_permission_grants(workspace_id,workspace_membership_id,permission) VALUES($1,$2,'client.manage')",
          [ESTIMATE_OFFER_WORKSPACE, ownerMembershipId],
        );
        await transaction.query('COMMIT');
      } finally {
        await transaction.query('ROLLBACK');
        transaction.release();
      }
      const replacement = await actor();
      expect(replacement.activeCompany?.clientPermissions).toEqual([]);
      expect(
        replacement.activeCompany?.receivedAddendumClientReadCapture,
      ).not.toBe(token);
      expect(await authorization.hasReceivedAddendumAccess(captured)).toBe(
        false,
      );
      expect(await authorization.hasReceivedAddendumAccess(replacement)).toBe(
        true,
      );
      expect(
        (await ownerCall('/documents/received-addendum-sources')).status,
      ).toBe(200);
      expect(
        (
          await ownerCall(
            `/documents/${documentId}/versions/${versionId}/content`,
          )
        ).status,
      ).toBe(200);
    });
  });
});
