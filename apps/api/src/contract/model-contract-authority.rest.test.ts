import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  ESTIMATE_OFFER_OWNER,
  ESTIMATE_OFFER_WORKSPACE,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  prepareModelContractSource,
  revokeModelContractFixtureGrant,
} from './model-contract.test-fixture.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres(
  'Model Contract independent current authority through public REST',
  () => {
    let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
    beforeAll(async () => {
      fixture = await openEstimateOfferFixture();
    });
    beforeEach(async () => {
      await fixture.reset();
    });
    afterAll(async () => {
      await fixture?.close();
    });

    it('keeps old captures limited and requires explicit revoke/fresh v2 for new preparation and decisions', async () => {
      const { source, path, intent, invoke } =
        await prepareModelContractSource(fixture);
      const created = responseRecord(
        await invoke(`${path}/from-approved-model`, intent),
      );
      const versionId = responseString(responseRecord(created.version), 'id');
      await fixture.grant({
        path: '/company-director-client-assignments',
        companyId: source.companyId,
        membershipId: source.readerMembershipId,
      });
      for (const bundle of [
        'company_contract_preparer',
        'company_contract_approver',
      ])
        await fixture.pool.query(
          'INSERT INTO company_role_assignments(workspace_id,company_id,workspace_membership_id,bundle,permission_set_version) VALUES($1,$2,$3,$4,$5)',
          [
            ESTIMATE_OFFER_WORKSPACE,
            source.companyId,
            source.readerMembershipId,
            bundle,
            'v1',
          ],
        );
      for (const role of ['preparer', 'approver'])
        expect(
          await fixture.grant({
            path: `/company-contract-${role}-assignments`,
            companyId: source.companyId,
            membershipId: source.readerMembershipId,
          }),
        ).toMatchObject({ active: true, permissionSetVersion: 'v1' });
      const copied = responseRecord(
        await fixture.read({
          path,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      );
      expect(responseRecord(copied.contract).version).toEqual(created.version);
      for (const request of [
        { path: `${path}/from-approved-model`, body: intent },
        {
          path: `${path}/versions/${versionId}/approve`,
          body: {
            expectedContractRevision: 1,
            acknowledgedWarningCodes: [
              'MODEL_WORDING_REVIEWED',
              'ANNEX_SCOPE_REVIEWED',
            ],
            reviewBasis: 'Old capture must not authorize this',
          },
        },
      ])
        expect(
          (
            await fixture.post({
              ...request,
              companyId: source.companyId,
              headers: ESTIMATE_OFFER_READER,
            })
          ).status,
        ).toBe(403);
      expect(
        (
          await fixture.request({
            path: `${path}/model-selection`,
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_READER,
          })
        ).status,
      ).toBe(403);
      for (const role of ['preparer', 'approver']) {
        await revokeModelContractFixtureGrant(
          fixture,
          `/company-contract-${role}-assignments`,
          source.companyId,
          source.readerMembershipId,
        );
        expect(
          await fixture.grant({
            path: `/company-contract-${role}-assignments`,
            companyId: source.companyId,
            membershipId: source.readerMembershipId,
          }),
        ).toMatchObject({ active: true, permissionSetVersion: 'v2' });
      }
      expect(
        responseRecord(
          await fixture.read({
            path: `${path}/model-selection`,
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_READER,
          }),
        ),
      ).toMatchObject({ selection: { versionId: intent.modelVersionId } });
      expect(
        (
          await fixture.request({
            path: '/contract-models/consulting-ro',
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_READER,
          })
        ).status,
      ).toBe(403);
      expect(
        await fixture.command({
          path: `${path}/versions/${versionId}/approve`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_READER,
          body: {
            expectedContractRevision: 1,
            acknowledgedWarningCodes: [
              'MODEL_WORDING_REVIEWED',
              'ANNEX_SCOPE_REVIEWED',
            ],
            reviewBasis: 'Explicit v2, full synthetic review',
          },
        }),
      ).toMatchObject({ kind: 'APPROVE', revision: 2 });
    });

    it('denies a revoked preparer before receipt disclosure while preserving separately authorized copied reads', async () => {
      const { source, path, intent } =
        await prepareModelContractSource(fixture);
      const command = {
        path: `${path}/from-approved-model`,
        body: intent,
        key: 'current-authority-receipt',
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      };
      const created = await fixture.command(command);
      await revokeModelContractFixtureGrant(
        fixture,
        '/company-contract-preparer-assignments',
        source.companyId,
        source.preparerMembershipId,
      );
      expect((await fixture.post(command)).status).toBe(403);
      expect((await fixture.post({ ...command, body: {} })).status).toBe(403);
      expect(
        responseRecord(
          await fixture.read({
            path,
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          }),
        ).contract,
      ).toEqual(created);
      await fixture.grant({
        path: '/company-contract-preparer-assignments',
        companyId: source.companyId,
        membershipId: source.preparerMembershipId,
      });
      expect(await fixture.command(command)).toEqual(created);
      for (const assignment of [
        '/company-contract-model-editor-assignments',
        '/company-contract-model-approver-assignments',
        '/company-profitability-contributor-assignments',
      ])
        await revokeModelContractFixtureGrant(
          fixture,
          assignment,
          source.companyId,
          source.preparerMembershipId,
        );
      expect(
        (
          await fixture.request({
            path: '/contract-models/consulting-ro',
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          })
        ).status,
      ).toBe(403);
      expect(await fixture.command(command)).toEqual(created);
      expect(
        responseRecord(
          await fixture.read({
            path: `${path}/model-selection`,
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          }),
        ),
      ).toMatchObject({ selection: { versionId: intent.modelVersionId } });
      await revokeModelContractFixtureGrant(
        fixture,
        '/company-offer-preparer-assignments',
        source.companyId,
        source.preparerMembershipId,
      );
      expect((await fixture.post(command)).status).toBe(403);
      expect(
        responseRecord(
          await fixture.read({
            path,
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          }),
        ).contract,
      ).toEqual(created);
    });

    it('keeps Company records, selected sources and same-key receipts in the selected Company', async () => {
      const first = await prepareModelContractSource(fixture);
      const second = await prepareModelContractSource(fixture, {
        clientTaxId: 'SECOND-SYNTHETIC-868',
      });
      const firstIntent = {
        ...first.intent,
        clientDetails: 'Private synthetic Company A requisites',
      };
      const key = 'same-actor-and-key-independent-companies';
      const created = responseRecord(
        await fixture.command({
          path: `${first.path}/from-approved-model`,
          companyId: first.source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: firstIntent,
          key,
        }),
      );
      const errors: unknown[] = [];
      for (const id of [first.intent.sourceOfferVersionId, randomUUID()]) {
        const response = await fixture.post({
          path: `${second.path}/from-approved-model`,
          companyId: second.source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: { ...second.intent, sourceOfferVersionId: id },
        });
        expect(response.status).toBe(404);
        errors.push(await response.json());
      }
      expect(errors[0]).toEqual(errors[1]);
      for (const id of [first.intent.modelVersionId, randomUUID()]) {
        const response = await fixture.post({
          path: `${second.path}/from-approved-model`,
          companyId: second.source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: { ...second.intent, modelVersionId: id },
        });
        expect({
          status: response.status,
          body: await response.json(),
        }).toMatchObject({
          status: 409,
          body: { code: 'CONTRACT_MODEL_SELECTION_UNAVAILABLE' },
        });
      }
      for (const path of [
        first.path,
        `${first.path}/versions`,
        `${first.path}/versions/${responseString(responseRecord(created.version), 'id')}`,
      ]) {
        const response = await fixture.request({
          path,
          companyId: second.source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
        });
        expect(response.status).toBe(404);
        expect(await response.text()).not.toContain(
          'Private synthetic Company A requisites',
        );
      }
      const other = responseRecord(
        await fixture.command({
          path: `${second.path}/from-approved-model`,
          companyId: second.source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: second.intent,
          key,
        }),
      );
      expect(other.id).not.toBe(created.id);
      expect(
        await fixture.command({
          path: `${first.path}/from-approved-model`,
          companyId: first.source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: firstIntent,
          key,
        }),
      ).toEqual(created);
    }, 30_000);

    it('does not disclose a record or receipt to a second Workspace membership of the same Internal User', async () => {
      const { source, path, intent } =
        await prepareModelContractSource(fixture);
      const key = 'same-internal-user-second-workspace';
      const created = responseRecord(
        await fixture.command({
          path: `${path}/from-approved-model`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: intent,
          key,
        }),
      );
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
      await fixture.pool.query(
        'INSERT INTO workspaces(id,name) VALUES($1,$2)',
        [workspaceId, 'Synthetic separate Contract Workspace'],
      );
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
      const scopedCommand = async (path: string, body: unknown) => {
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
        const value: unknown = await response.json();
        return responseRecord(value);
      };
      const companyId = responseString(
        await scopedCommand('/companies', {
          displayName: 'Second Workspace Company',
        }),
        'id',
      );
      for (const path of [
        '/company-context-assignments',
        '/company-commercial-intake-assignments',
        '/company-contract-preparer-assignments',
        '/company-offer-preparer-assignments',
        '/company-director-client-assignments',
      ])
        await scopedCommand(path, {
          companyId,
          workspaceMembershipId: membershipId,
        });
      const actorResponse = await fixture.request({
        path: '/access/current-actor',
        companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        init: { headers: { 'x-workspace-context-id': workspaceId } },
      });
      expect(actorResponse.status).toBe(200);
      const actor: unknown = await actorResponse.json();
      expect(actor).toMatchObject({
        workspaceId,
        workspaceMembershipId: membershipId,
        internalUserId: preparer.internalUserId,
      });
      const errors: unknown[] = [];
      for (const opportunityId of [source.opportunityId, randomUUID()])
        for (const method of ['GET', 'POST']) {
          const response = await fixture.request({
            path: `/contracts/opportunities/${opportunityId}${method === 'POST' ? '/from-approved-model' : ''}`,
            companyId,
            headers: ESTIMATE_OFFER_PREPARER,
            init: {
              method,
              headers: {
                'x-workspace-context-id': workspaceId,
                ...(method === 'POST'
                  ? {
                      'content-type': 'application/json',
                      'idempotency-key': key,
                    }
                  : {}),
              },
              ...(method === 'POST' ? { body: JSON.stringify(intent) } : {}),
            },
          });
          expect(response.status).toBe(404);
          const body: unknown = await response.json();
          errors.push(body);
          expect(JSON.stringify(body)).not.toContain(String(created.id));
          expect(JSON.stringify(body)).not.toContain(intent.modelVersionId);
        }
      expect(errors[0]).toEqual(errors[2]);
      expect(errors[1]).toEqual(errors[3]);
    }, 30_000);
  },
);
