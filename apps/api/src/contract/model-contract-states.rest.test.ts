import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { generatedOfferIntent } from '../offer/offer-model-generation.test-fixture.js';
import {
  generatedContractModelContent,
  prepareModelContractSource,
  revokeModelContractFixtureGrant,
} from './model-contract.test-fixture.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Model Contract source, concordance and recorded Activity', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let instant: Date;
  beforeAll(async () => {
    fixture = await openEstimateOfferFixture({
      serverClock: { now: () => new Date(instant) },
    });
  });
  beforeEach(async () => {
    instant = new Date('2026-10-24T09:00:00.000Z');
    await fixture.reset();
  });
  afterAll(async () => {
    await fixture?.close();
  });

  it.each(['PENDING', 'APPROVED'] as const)(
    'refuses a %s source before transmission without allocating a Contract',
    async (offerStage) => {
      const ready = await prepareModelContractSource(fixture, { offerStage });
      const response = await fixture.post({
        path: ready.path + '/from-approved-model',
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: ready.intent,
      });
      expect({
        status: response.status,
        body: await response.json(),
      }).toMatchObject({ status: 409, body: { code: 'OFFER_NOT_PREPARABLE' } });
      expect(
        responseRecord(
          await fixture.read({
            path: ready.path,
            companyId: ready.source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          }),
        ).contract,
      ).toBeNull();
    },
  );

  it.each(['expired', 'rejected'] as const)(
    'rechecks the %s source for every new binding and decision while preserving copied bytes',
    async (state) => {
      const ready = await prepareModelContractSource(fixture);
      const created = responseRecord(
        await ready.invoke(ready.path + '/from-approved-model', ready.intent),
      );
      const version = responseRecord(created.version),
        id = responseString(version, 'id');
      if (state === 'expired') instant = new Date('2026-11-25T09:00:00.000Z');
      else
        await fixture.command({
          path: ready.flow.base + '/client-response',
          companyId: ready.source.companyId,
          headers: ESTIMATE_OFFER_READER,
          body: {
            expectedOfferRevision: ready.flow.revision,
            outcome: 'REJECTED',
            receivedAt: instant.toISOString(),
            reason: 'Synthetic explicit refusal',
          },
        });
      const successor = await fixture.post({
        path: ready.path + '/versions/from-approved-model',
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: { ...ready.intent, expectedContractRevision: 1 },
      });
      expect({
        status: successor.status,
        body: await successor.json(),
      }).toMatchObject({ status: 409, body: { code: 'OFFER_NOT_PREPARABLE' } });
      const run = responseRecord(
        await ready.invoke(`${ready.path}/versions/${id}/quality-checks`, {}),
      );
      expect(results(run)).toContainEqual({
        code: 'SOURCE_OFFER_READY',
        status: 'ERROR',
      });
      const denied = await fixture.post({
        path: `${ready.path}/versions/${id}/approve`,
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: approval(1),
      });
      expect(denied.status).toBe(409);
      const reopened = responseRecord(
        responseRecord(
          await fixture.read({
            path: ready.path,
            companyId: ready.source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          }),
        ).contract,
      );
      expect(reopened).toMatchObject({
        revision: 1,
        version: {
          decisionState: 'PENDING',
          decision: null,
          representation: version.representation,
        },
      });
    },
  );

  it('selects only the active approved model while a newer head is pending, then refuses the replaced selection', async () => {
    const ready = await prepareModelContractSource(fixture);
    const pending = responseRecord(
      responseRecord(
        await ready.invoke('/contract-models/consulting-ro/versions', {
          expectedModelRevision: 2,
          content: {
            ...generatedContractModelContent,
            title: 'Pending private wording must not enter selection',
          },
        }),
      ).model,
    );
    const pendingId = responseString(responseRecord(pending.head), 'id');
    const selection = await fixture.read({
      path: ready.path + '/model-selection',
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
    });
    expect(selection).toMatchObject({
      selection: { versionId: ready.intent.modelVersionId },
    });
    expect(JSON.stringify(selection)).not.toContain('Pending private wording');
    const created = responseRecord(
      await ready.invoke(ready.path + '/from-approved-model', ready.intent),
    );
    const approved = responseRecord(
      responseRecord(
        await ready.invoke(
          `/contract-models/consulting-ro/versions/${pendingId}/decision`,
          {
            expectedModelRevision: 3,
            versionNumber: 2,
            outcome: 'APPROVE',
            basis: 'Synthetic replacement deliberately reviewed',
          },
        ),
      ).model,
    );
    const stale = await fixture.post({
      path: ready.path + '/versions/from-approved-model',
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: { ...ready.intent, expectedContractRevision: 1 },
    });
    expect({ status: stale.status, body: await stale.json() }).toMatchObject({
      status: 409,
      body: { code: 'CONTRACT_MODEL_SELECTION_UNAVAILABLE' },
    });
    const successor = responseRecord(
      await ready.invoke(ready.path + '/versions/from-approved-model', {
        ...ready.intent,
        expectedContractRevision: 1,
        modelVersionId: pendingId,
        modelVersionNumber: 2,
        modelApprovalDecisionId: responseString(
          responseRecord(responseRecord(approved.head).decision),
          'id',
        ),
      }),
    );
    expect(successor).toMatchObject({
      revision: 2,
      version: {
        versionNumber: 2,
        decisionState: 'PENDING',
        modelGeneration: { modelSource: { versionId: pendingId } },
      },
    });
    const old = responseRecord(
      responseRecord(
        await fixture.read({
          path: `${ready.path}/versions/${responseString(responseRecord(created.version), 'id')}`,
          companyId: ready.source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
        }),
      ).contract,
    );
    expect(responseRecord(old.version).representation).toEqual(
      responseRecord(created.version).representation,
    );
    const run = responseRecord(
      await ready.invoke(
        `${ready.path}/versions/${responseString(responseRecord(successor.version), 'id')}/quality-checks`,
        {},
      ),
    );
    expect(results(run)).toContainEqual({
      code: 'MODEL_APPROVAL_PRESERVED',
      status: 'PASS',
    });
  });

  it.each([
    {
      name: 'issuer',
      code: 'ISSUER_MATCHES_SOURCE',
      content: {
        ...generatedContractModelContent,
        issuer: {
          ...generatedContractModelContent.issuer,
          taxId: 'Different synthetic issuer',
        },
      },
    },
    {
      name: 'service',
      code: 'SERVICE_MATCHES_SOURCE',
      content: {
        ...generatedContractModelContent,
        serviceTitle: 'Different synthetic service',
      },
    },
    {
      name: 'framework edition',
      code: 'SERVICE_MATCHES_SOURCE',
      content: {
        ...generatedContractModelContent,
        frameworks: [
          {
            name: generatedContractModelContent.frameworks[0]?.name,
            edition: 'Different synthetic edition',
          },
        ],
      },
    },
  ])(
    'blocks approval for a $name mismatch despite a human concordance declaration',
    async ({ content, code }) => {
      const ready = await prepareModelContractSource(fixture);
      const pending = responseRecord(
          responseRecord(
            await ready.invoke('/contract-models/consulting-ro/versions', {
              expectedModelRevision: 2,
              content,
            }),
          ).model,
        ),
        modelId = responseString(responseRecord(pending.head), 'id');
      const model = responseRecord(
        responseRecord(
          await ready.invoke(
            `/contract-models/consulting-ro/versions/${modelId}/decision`,
            {
              expectedModelRevision: 3,
              versionNumber: 2,
              outcome: 'APPROVE',
              basis:
                'Synthetic incompatible model deliberately approved for comparison',
            },
          ),
        ).model,
      );
      const created = responseRecord(
        await ready.invoke(ready.path + '/from-approved-model', {
          ...ready.intent,
          modelVersionId: modelId,
          modelVersionNumber: 2,
          modelApprovalDecisionId: responseString(
            responseRecord(responseRecord(model.head).decision),
            'id',
          ),
        }),
      );
      const id = responseString(responseRecord(created.version), 'id');
      const run = responseRecord(
        await ready.invoke(`${ready.path}/versions/${id}/quality-checks`, {}),
      );
      expect(results(run)).toContainEqual({ code, status: 'ERROR' });
      const response = await fixture.post({
        path: `${ready.path}/versions/${id}/approve`,
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: approval(1),
      });
      expect(response.status).toBe(409);
      expect(
        responseRecord(
          responseRecord(
            await fixture.read({
              path: ready.path,
              companyId: ready.source.companyId,
              headers: ESTIMATE_OFFER_PREPARER,
            }),
          ).contract,
        ),
      ).toMatchObject({
        revision: 1,
        version: { decisionState: 'PENDING', decision: null },
      });
    },
  );

  it('distinguishes new requisites from source identity, then warns about a later identity change and all added conditions', async () => {
    const ready = await prepareModelContractSource(fixture);
    await correctIdentity(ready, 'First');
    const created = responseRecord(
      await ready.invoke(ready.path + '/from-approved-model', {
        ...ready.intent,
        termStartsOn: '2026-10-01',
        termEndsOn: '2026-10-23',
        specialConditions: ' Explicit synthetic additional wording ',
      }),
    );
    await correctIdentity(ready, 'Second');
    const id = responseString(responseRecord(created.version), 'id');
    const run = responseRecord(
      await ready.invoke(`${ready.path}/versions/${id}/quality-checks`, {}),
    );
    const warnings = results(run)
      .filter((r) => r.status === 'WARNING')
      .map((r) => r.code);
    expect(warnings).toEqual([
      'PARTY_IDENTITY_MATCHES_SOURCE',
      'PARTY_IDENTITY_CURRENT',
      'MODEL_WORDING_REVIEWED',
      'ANNEX_SCOPE_REVIEWED',
      'ADDED_CONDITIONS_CONFIRMED',
      'TERM_END_NOT_PASSED',
    ]);
    const missing = await fixture.post({
      path: `${ready.path}/versions/${id}/approve`,
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: approval(1),
    });
    expect(missing.status).toBe(409);
    expect(
      await ready.invoke(`${ready.path}/versions/${id}/approve`, {
        ...approval(1),
        acknowledgedWarningCodes: warnings,
      }),
    ).toMatchObject({ kind: 'APPROVE', revision: 2 });
  });

  it('binds successors to the explicit new Offer Version, keeping each historical source and exact financial copy', async () => {
    const ready = await prepareModelContractSource(fixture);
    const created = responseRecord(
      await ready.invoke(ready.path + '/from-approved-model', ready.intent),
    );
    const next = responseRecord(
      await ready.invoke(ready.flow.path + '/versions/from-approved-model', {
        ...generatedOfferIntent(ready.source),
        expectedOfferRevision: ready.flow.revision,
        scopeNote: 'Explicit replacement synthetic scope',
      }),
    );
    const nextId = responseString(responseRecord(next.version), 'id');
    const run = responseRecord(
      await ready.invoke(
        `${ready.path}/versions/${responseString(responseRecord(created.version), 'id')}/quality-checks`,
        {},
      ),
    );
    expect(results(run)).toContainEqual({
      code: 'SOURCE_OFFER_READY',
      status: 'ERROR',
    });
    await fixture.command({
      path: `${ready.flow.path}/versions/${nextId}/approve`,
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_READER,
      body: {
        expectedOfferRevision: 4,
        acknowledgedWarningCodes: [
          'DECLARED_TAX_UNVERIFIED',
          'NON_OFFICIAL_OFFER',
          'ILLUSTRATIVE_MODEL',
        ],
      },
    });
    await ready.invoke(`${ready.flow.path}/versions/${nextId}/transmission`, {
      expectedOfferRevision: 5,
      acknowledgedWarningCodes: [],
      note: null,
    });
    const successor = responseRecord(
      await ready.invoke(ready.path + '/versions/from-approved-model', {
        ...ready.intent,
        sourceOfferVersionId: nextId,
        expectedContractRevision: 1,
      }),
    );
    expect(successor).toMatchObject({
      sourceOfferVersionId: ready.flow.versionId,
      sourceOffer: { versionId: nextId, versionNumber: 2 },
      version: {
        sourceOfferVersionId: nextId,
        scopeNote: 'Explicit replacement synthetic scope',
        modelGeneration: {
          financials: responseRecord(
            responseRecord(created.version).modelGeneration,
          ).financials,
        },
      },
    });
    expect(responseRecord(successor.version).differences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'sourceOfferVersionId',
          before: ready.flow.versionId,
          after: nextId,
        }),
      ]),
    );
  });

  it('projects only authorized identifiers and action summaries for new-model events, with no model, financial or human wording', async () => {
    const ready = await prepareModelContractSource(fixture);
    await fixture.grant({
      path: '/company-commercial-activity-reader-assignments',
      companyId: ready.source.companyId,
      membershipId: ready.source.preparerMembershipId,
    });
    const created = responseRecord(
      await ready.invoke(ready.path + '/from-approved-model', ready.intent),
    );
    const versionId = responseString(responseRecord(created.version), 'id');
    await ready.invoke(
      `${ready.path}/versions/${versionId}/approve`,
      approval(1),
    );
    const page = responseRecord(
      await fixture.read({
        path: '/activity-log',
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    if (!Array.isArray(page.events))
      throw new Error('Expected a bounded Activity page.');
    const events = page.events
      .map(responseRecord)
      .filter(
        (e) => typeof e.action === 'string' && e.action.startsWith('contract'),
      );
    expect(events.map((e) => e.action).sort()).toEqual([
      'contract.created',
      'contract_version.approved',
      'contract_version.created',
    ]);
    for (const event of events)
      expect(event).toMatchObject({
        target: { contractId: created.id, contractVersionId: versionId },
        metadata: {},
      });
    const json = JSON.stringify(events);
    for (const privateValue of [
      ready.intent.clientDetails,
      ready.intent.sourceConcordanceBasis,
      generatedContractModelContent.sourceDescription,
      ready.intent.modelVersionId,
      '125.00',
      '150.00',
      'Synthetic exact wording review',
    ])
      expect(json).not.toContain(privateValue);
    await revokeModelContractFixtureGrant(
      fixture,
      '/company-contract-preparer-assignments',
      ready.source.companyId,
      ready.source.preparerMembershipId,
    );
    await revokeModelContractFixtureGrant(
      fixture,
      '/company-contract-approver-assignments',
      ready.source.companyId,
      ready.source.preparerMembershipId,
    );
    const denied = await fixture.read({
      path: '/activity-log',
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
    });
    expect(JSON.stringify(denied)).not.toContain(String(created.id));
  });

  it('keeps copied approval valid after model withdrawal but refuses any fresh use of that retired selection', async () => {
    const ready = await prepareModelContractSource(fixture);
    const created = responseRecord(
        await ready.invoke(ready.path + '/from-approved-model', ready.intent),
      ),
      id = responseString(responseRecord(created.version), 'id');
    await ready.invoke(
      `/contract-models/consulting-ro/versions/${ready.intent.modelVersionId}/withdrawal`,
      {
        expectedModelRevision: 2,
        versionNumber: 1,
        reason: 'Only future use is retired',
      },
    );
    expect(
      await fixture.read({
        path: ready.path + '/model-selection',
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    ).toEqual({ selection: null });
    const fresh = await fixture.post({
      path: ready.path + '/versions/from-approved-model',
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: { ...ready.intent, expectedContractRevision: 1 },
    });
    expect(fresh.status).toBe(409);
    const run = responseRecord(
      await ready.invoke(`${ready.path}/versions/${id}/quality-checks`, {}),
    );
    expect(results(run)).toContainEqual({
      code: 'MODEL_APPROVAL_PRESERVED',
      status: 'PASS',
    });
    expect(
      await ready.invoke(`${ready.path}/versions/${id}/approve`, approval(1)),
    ).toMatchObject({ kind: 'APPROVE', revision: 2 });
  });

  it('reports a newly missing copied Client tax id as an error while preserving the exact source identity difference', async () => {
    const ready = await prepareModelContractSource(fixture);
    const client = responseRecord(
      await fixture.read({
        path: '/clients/' + ready.source.clientId,
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    const corrected = await fixture.request({
      path: '/clients/' + ready.source.clientId,
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      init: {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'explicitly-clear-tax-id',
        },
        body: JSON.stringify({ expectedVersion: client.version, taxId: null }),
      },
    });
    expect(corrected.status).toBe(200);
    const created = responseRecord(
        await ready.invoke(ready.path + '/from-approved-model', ready.intent),
      ),
      id = responseString(responseRecord(created.version), 'id');
    const run = responseRecord(
      await ready.invoke(`${ready.path}/versions/${id}/quality-checks`, {}),
    );
    expect(results(run)).toEqual(
      expect.arrayContaining([
        { code: 'PARTY_TAX_ID_RECORDED', status: 'ERROR' },
        { code: 'PARTY_IDENTITY_MATCHES_SOURCE', status: 'WARNING' },
        { code: 'PARTY_IDENTITY_CURRENT', status: 'PASS' },
      ]),
    );
    const refused = await fixture.post({
      path: `${ready.path}/versions/${id}/approve`,
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: {
        ...approval(1),
        acknowledgedWarningCodes: [
          'MODEL_WORDING_REVIEWED',
          'ANNEX_SCOPE_REVIEWED',
          'PARTY_IDENTITY_MATCHES_SOURCE',
        ],
      },
    });
    expect(refused.status).toBe(409);
  });

  it('refuses a new binding and records source readiness errors after a deliberate Opportunity hold', async () => {
    const ready = await prepareModelContractSource(fixture),
      created = responseRecord(
        await ready.invoke(ready.path + '/from-approved-model', ready.intent),
      ),
      id = responseString(responseRecord(created.version), 'id');
    await fixture.grant({
      path: '/company-opportunity-manager-assignments',
      companyId: ready.source.companyId,
      membershipId: ready.source.preparerMembershipId,
    });
    const held = await fixture.post({
      path: `/commercial-intake/opportunities/${ready.source.opportunityId}/outcome`,
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: {
        expectedVersion: 1,
        status: 'ON_HOLD',
        reason: 'Synthetic deliberate hold',
      },
    });
    expect(held.status).toBe(200);
    const fresh = await fixture.post({
      path: ready.path + '/versions/from-approved-model',
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: { ...ready.intent, expectedContractRevision: 1 },
    });
    expect({ status: fresh.status, body: await fresh.json() }).toMatchObject({
      status: 409,
      body: { code: 'OPPORTUNITY_NOT_OPEN' },
    });
    const run = responseRecord(
      await ready.invoke(`${ready.path}/versions/${id}/quality-checks`, {}),
    );
    expect(results(run)).toContainEqual({
      code: 'SOURCE_OFFER_READY',
      status: 'ERROR',
    });
  });

  it('reports the archived Client relationship without erasing the independently readable Contract', async () => {
    const ready = await prepareModelContractSource(fixture),
      created = responseRecord(
        await ready.invoke(ready.path + '/from-approved-model', ready.intent),
      ),
      id = responseString(responseRecord(created.version), 'id');
    await fixture.pool.query(
      "UPDATE client_company_relationships SET status='archived' WHERE company_id=$1 AND client_account_id=$2",
      [ready.source.companyId, ready.source.clientId],
    );
    const run = responseRecord(
      await ready.invoke(`${ready.path}/versions/${id}/quality-checks`, {}),
    );
    expect(results(run)).toContainEqual({
      code: 'PARTY_AVAILABLE',
      status: 'ERROR',
    });
    expect(
      responseRecord(
        responseRecord(
          await fixture.read({
            path: ready.path,
            companyId: ready.source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          }),
        ).contract,
      ).version,
    ).toMatchObject({
      id,
      representation: responseRecord(created.version).representation,
    });
  });

  it.each([
    { change: { reviewBasis: undefined }, status: 400 },
    { change: { reviewBasis: ' \n ' }, status: 400 },
    { change: { reviewBasis: '☀️'.repeat(1001) }, status: 400 },
    {
      change: { acknowledgedWarningCodes: ['MODEL_WORDING_REVIEWED'] },
      status: 409,
    },
    {
      change: {
        acknowledgedWarningCodes: [
          'MODEL_WORDING_REVIEWED',
          'ANNEX_SCOPE_REVIEWED',
          'ADDED_CONDITIONS_CONFIRMED',
        ],
      },
      status: 409,
    },
    {
      change: {
        acknowledgedWarningCodes: [
          'MODEL_WORDING_REVIEWED',
          'MODEL_WORDING_REVIEWED',
          'ANNEX_SCOPE_REVIEWED',
        ],
      },
      status: 400,
    },
  ])(
    'refuses an incomplete or unequal exact approval declaration %j',
    async ({ change, status }) => {
      const ready = await prepareModelContractSource(fixture),
        created = responseRecord(
          await ready.invoke(ready.path + '/from-approved-model', ready.intent),
        ),
        id = responseString(responseRecord(created.version), 'id');
      const response = await fixture.post({
        path: `${ready.path}/versions/${id}/approve`,
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: { ...approval(1), ...change },
      });
      expect(response.status).toBe(status);
      expect(
        responseRecord(
          responseRecord(
            await fixture.read({
              path: ready.path,
              companyId: ready.source.companyId,
              headers: ESTIMATE_OFFER_PREPARER,
            }),
          ).contract,
        ),
      ).toMatchObject({
        revision: 1,
        version: { decisionState: 'PENDING', decision: null },
      });
      expect(
        (
          await fixture.pool.query(
            'SELECT count(*)::int AS count FROM contract_quality_runs',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
    },
  );

  async function correctIdentity(
    ready: Awaited<ReturnType<typeof prepareModelContractSource>>,
    label: string,
  ) {
    const client = responseRecord(
      await fixture.read({
        path: '/clients/' + ready.source.clientId,
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    const response = await fixture.request({
      path: '/clients/' + ready.source.clientId,
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      init: {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'identity-' + label,
        },
        body: JSON.stringify({
          expectedVersion: client.version,
          displayName: 'Synthetic ' + label,
          taxId: 'SYNTHETIC-' + label,
          address: 'Synthetic address ' + label,
        }),
      },
    });
    expect(response.status).toBe(200);
  }
});
function results(run: Record<string, unknown>) {
  if (!Array.isArray(run.results))
    throw new Error('Expected complete check results.');
  return run.results.map(responseRecord);
}
function approval(expectedContractRevision: number) {
  return {
    expectedContractRevision,
    acknowledgedWarningCodes: [
      'MODEL_WORDING_REVIEWED',
      'ANNEX_SCOPE_REVIEWED',
    ],
    reviewBasis: 'Synthetic exact wording review',
  };
}
