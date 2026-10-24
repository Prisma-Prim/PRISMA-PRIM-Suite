import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_DIRECTOR,
  estimateSubmission,
  estimateOfferIntent,
  responseString,
  ESTIMATE_OFFER_READER,
  openEstimateOfferFixture,
  responseRecord,
} from './offer-estimate-preparation.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

withPostgres('Approved-estimate internal Offer preparation REST', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;

  beforeAll(async () => {
    fixture = await openEstimateOfferFixture();
  });
  beforeEach(async () => fixture.reset());
  afterAll(async () => fixture?.close());

  it('creates and reloads a price-only internal draft from an exact approved economic Version', async () => {
    const source = await fixture.prepare();
    const path = `/offers/opportunities/${source.opportunityId}`;
    const offer = responseRecord(
      await fixture.command({
        path: `${path}/from-approved-estimate`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        key: 'synthetic-first-approved-price-draft',
        body: {
          estimateVersionId: source.estimateVersionId,
          estimateVersionNumber: source.estimateVersionNumber,
          recipient: { kind: 'PRIMARY' },
          validityDays: 30,
          scopeNote: 'Synthetic internal scope',
          commercialConditions: null,
        },
      }),
    );
    expect(offer).toMatchObject({
      companyId: source.companyId,
      opportunityId: source.opportunityId,
      version: {
        versionNumber: 1,
        decisionState: 'PENDING',
        transmissionState: 'NOT_TRANSMITTED',
        clientResponseState: 'NONE',
        provenance: 'APPROVED_ESTIMATE_INTERNAL_DRAFT',
        priceSource: {
          kind: 'DIRECTOR_APPROVED_ESTIMATE',
          estimateId: source.estimateId,
          estimateVersionId: source.estimateVersionId,
          estimateVersionNumber: 1,
          approvalDecisionId: source.approvalDecisionId,
          approvedAt: '2026-10-24T09:00:00.000Z',
          amount: '125.00',
          currency: 'EUR',
          taxTreatment: 'UNSPECIFIED',
        },
      },
    });
    const version = responseRecord(offer.version);
    for (const key of [
      'pricingSnapshot',
      'representation',
      'qualityRuleSet',
      'templateVersion',
    ])
      expect(version).not.toHaveProperty(key);
    await fixture.restart();
    const read = await fixture.read({
      path,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_READER,
    });
    const opened = responseRecord(responseRecord(read).offer);
    expect(opened.id).toEqual(offer.id);
    expect(opened.version).toEqual(offer.version);
    for (const field of [
      'executorCost',
      'fiscalCost',
      'allocatedOverhead',
      'totalCost',
      'profitabilityPercent',
      'targetProfitability',
      'strategicReason',
    ])
      expect(JSON.stringify(read)).not.toContain(`"${field}"`);
  });
  it('deliberately versions the same Offer, freezes both prices and replays the original committed result', async () => {
    const source = await fixture.prepare();
    const path = `/offers/opportunities/${source.opportunityId}`;
    const intent = {
      estimateVersionId: source.estimateVersionId,
      estimateVersionNumber: 1,
      recipient: { kind: 'PRIMARY' },
      validityDays: 30,
      scopeNote: 'First literal scope',
      commercialConditions: null,
    };
    const firstCommand = {
      path: `${path}/from-approved-estimate`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      key: 'immutable-first-result',
      body: intent,
    };
    const first = responseRecord(await fixture.command(firstCommand));
    const secondEstimate = responseRecord(
      await fixture.command({
        path: `/opportunities/${source.opportunityId}/profitability-estimates`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          ...estimateSubmission(),
          expectedLatestVersionNumber: 1,
          proposedPrice: '150.00',
        },
      }),
    );
    const secondEstimateId = responseString(secondEstimate, 'id');
    await fixture.command({
      path: `/opportunities/${source.opportunityId}/profitability-estimates/versions/${secondEstimateId}/decision`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_DIRECTOR,
      body: {
        expectedVersionNumber: 2,
        expectedDecision: null,
        code: 'APPROVE',
      },
    });
    const secondIntent = {
      ...intent,
      estimateVersionId: secondEstimateId,
      estimateVersionNumber: 2,
      expectedOfferRevision: 1,
    };
    const secondCommand = {
      ...firstCommand,
      path: `${path}/versions/from-approved-estimate`,
      key: 'immutable-second-result',
      body: secondIntent,
    };
    const second = responseRecord(await fixture.command(secondCommand));
    expect(second).toMatchObject({
      id: first.id,
      revision: 2,
      version: {
        versionNumber: 2,
        predecessorVersionId: responseRecord(first.version).id,
        priceSource: { amount: '150.00', estimateVersionNumber: 2 },
      },
    });
    expect(responseRecord(second.version).differences).toEqual(
      expect.arrayContaining([
        {
          field: 'amount',
          previous: '125.00',
          current: '150.00',
          changed: true,
        },
      ]),
    );
    const earlier = responseRecord(
      responseRecord(
        await fixture.read({
          path: `${path}/versions/${responseRecord(first.version).id}`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).offer,
    );
    expect(earlier).toMatchObject({
      id: first.id,
      version: {
        supersededByVersionId: responseRecord(second.version).id,
        priceSource: { amount: '125.00' },
      },
    });
    expect(await fixture.command(firstCommand)).toEqual(first);
    expect(await fixture.command(secondCommand)).toEqual(second);
    const older = responseRecord(
      await fixture.command({
        ...secondCommand,
        key: 'explicit-older-approved-source',
        body: { ...intent, expectedOfferRevision: 2 },
      }),
    );
    expect(older).toMatchObject({
      id: first.id,
      revision: 3,
      version: {
        versionNumber: 3,
        priceSource: { estimateVersionNumber: 1, amount: '125.00' },
      },
    });
    expect(await fixture.command(secondCommand)).toEqual(second);
  });

  it('allows independent rejection while refusing every external execution and Contract source', async () => {
    const source = await fixture.prepare();
    const path = `/offers/opportunities/${source.opportunityId}`;
    const offer = responseRecord(
      await fixture.command({
        path: `${path}/from-approved-estimate`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          estimateVersionId: source.estimateVersionId,
          estimateVersionNumber: 1,
          recipient: { kind: 'PRIMARY' },
          validityDays: 30,
          scopeNote: null,
          commercialConditions: null,
        },
      }),
    );
    const versionId = responseString(responseRecord(offer.version), 'id');
    for (const [action, headers, body] of [
      ['quality-checks', ESTIMATE_OFFER_PREPARER, {}],
      [
        'approve',
        ESTIMATE_OFFER_READER,
        { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
      ],
      [
        'transmission',
        ESTIMATE_OFFER_PREPARER,
        { expectedOfferRevision: 1, acknowledgedWarningCodes: [], note: null },
      ],
      [
        'client-response',
        ESTIMATE_OFFER_READER,
        {
          expectedOfferRevision: 1,
          outcome: 'ACCEPTED',
          receivedAt: '2026-10-24T09:00:00.000Z',
        },
      ],
    ] satisfies [string, Readonly<Record<string, string>>, unknown][]) {
      const result = await fixture.post({
        path: `${path}/versions/${versionId}/${action}`,
        companyId: source.companyId,
        headers,
        body,
      });
      expect({
        action,
        status: result.status,
        body: await result.json(),
      }).toMatchObject({
        status: 409,
        body: { code: 'OFFER_INTERNAL_DRAFT_ONLY' },
      });
    }
    for (const assignment of [
      '/company-contract-preparer-assignments',
      '/company-contract-early-preparation-assignments',
    ])
      await fixture.grant({
        path: assignment,
        companyId: source.companyId,
        membershipId: source.preparerMembershipId,
      });
    for (const [suffix, body] of [
      [
        '',
        {
          acceptedOfferVersionId: versionId,
          termStartsOn: null,
          termEndsOn: null,
          specialConditions: null,
        },
      ],
      [
        '/preparation',
        {
          sourceOfferVersionId: versionId,
          termStartsOn: null,
          termEndsOn: null,
          specialConditions: null,
        },
      ],
    ] satisfies [string, unknown][]) {
      const response = await fixture.post({
        path: `/contracts/opportunities/${source.opportunityId}${suffix}`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body,
      });
      expect(response.status).toBe(409);
    }
    await fixture.grant({
      path: '/company-commercial-activity-reader-assignments',
      companyId: source.companyId,
      membershipId: source.readerMembershipId,
    });
    const rejected = await fixture.command({
      path: `${path}/versions/${versionId}/reject`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_READER,
      body: {
        expectedOfferRevision: 1,
        reason: 'Synthetic independent rejection',
      },
    });
    expect(rejected).toMatchObject({ state: 'REJECTED' });
    expect(
      responseRecord(
        responseRecord(
          await fixture.read({
            path,
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_READER,
          }),
        ).offer,
      ).version,
    ).toMatchObject({
      decisionState: 'REJECTED',
      priceSource: { amount: '125.00' },
      latestQualityRun: null,
    });
    const activity = responseRecord(
      await fixture.read({
        path: '/activity-log',
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_READER,
      }),
    );
    if (!Array.isArray(activity.events))
      throw new Error('Missing Activity events.');
    const events = activity.events
      .map(responseRecord)
      .filter(
        (event) =>
          typeof event.action === 'string' && event.action.startsWith('offer'),
      );
    expect(events.map((event) => event.action).sort()).toEqual([
      'offer.created',
      'offer_version.created',
      'offer_version.rejected',
    ]);
    for (const event of events) expect(event.metadata).toEqual({});
    const serialized = JSON.stringify(activity);
    for (const forbidden of [
      '125.00',
      source.estimateVersionId,
      source.approvalDecisionId,
      'executorCost',
      'profitabilityPercent',
    ])
      expect(serialized).not.toContain(forbidden);
  });

  it.each([
    ['company_offer_preparer', 403],
    ['company_profitability_contributor', 403],
    ['company_commercial_intake', 403],
    ['company_director_client_access', 403],
  ])(
    'requires the independent current %s assignment on new handoff and replay',
    async (bundle, expected) => {
      const source = await fixture.prepare();
      const command = {
        path: `/offers/opportunities/${source.opportunityId}/from-approved-estimate`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        key: 'replay-requires-live-authority',
        body: estimateOfferIntent(source),
      };
      const created = responseRecord(await fixture.command(command));
      await fixture.pool.query(
        'UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND workspace_membership_id = $2 AND bundle::text = $3',
        [source.companyId, source.preparerMembershipId, bundle],
      );
      for (const key of [command.key, 'fresh-without-authority']) {
        const denied = await fixture.post({ ...command, key });
        expect(denied.status).toBe(expected);
        expect(JSON.stringify(await denied.json())).not.toContain(
          source.estimateVersionId,
        );
      }
      const read = responseRecord(
        responseRecord(
          await fixture.read({
            path: `/offers/opportunities/${source.opportunityId}`,
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_READER,
          }),
        ).offer,
      );
      expect(read.id).toBe(created.id);
      expect(responseRecord(read.version).priceSource).toMatchObject({
        amount: '125.00',
      });
    },
  );

  it('preserves captured v1 on repeated grants and requires explicit revoke/regrant for the current capture', async () => {
    const source = await fixture.prepare();
    await fixture.pool.query(
      "UPDATE company_role_assignments SET permission_set_version = 'v1' WHERE company_id = $1 AND workspace_membership_id = $2 AND bundle::text = 'company_offer_preparer'",
      [source.companyId, source.preparerMembershipId],
    );
    const assignment = await fixture.grant({
      path: '/company-offer-preparer-assignments',
      companyId: source.companyId,
      membershipId: source.preparerMembershipId,
    });
    expect(assignment).toMatchObject({ permissionSetVersion: 'v1' });
    const denied = await fixture.post({
      path: `/offers/opportunities/${source.opportunityId}/from-approved-estimate`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: estimateOfferIntent(source),
    });
    expect(denied.status).toBe(403);
    const revoked = await fixture.request({
      path: `/company-offer-preparer-assignments/${source.preparerMembershipId}/${source.companyId}`,
      init: {
        method: 'DELETE',
        headers: { 'idempotency-key': 'explicit-preparer-revoke' },
      },
    });
    expect(revoked.status).toBe(200);
    expect(
      await fixture.grant({
        path: '/company-offer-preparer-assignments',
        companyId: source.companyId,
        membershipId: source.preparerMembershipId,
      }),
    ).toMatchObject({ permissionSetVersion: 'v3' });
    const actor = responseRecord(
      await fixture.read({
        path: '/access/current-actor',
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    expect(actor.activeCompany).toMatchObject({
      offerPermissionSetVersion: 'v3',
      offerPermissions: expect.arrayContaining([
        'commercial.offer.estimate.prepare',
      ]),
    });
    await fixture.command({
      path: `/offers/opportunities/${source.opportunityId}/from-approved-estimate`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: estimateOfferIntent(source),
    });
  });

  it('converges concurrent identical commands, conflicts changed intent, and keeps a single reference and history', async () => {
    const source = await fixture.prepare();
    const command = {
      path: `/offers/opportunities/${source.opportunityId}/from-approved-estimate`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      key: 'concurrent-identical-creation',
      body: estimateOfferIntent(source),
    };
    const [one, two] = await Promise.all([
      fixture.command(command),
      fixture.command(command),
    ]);
    expect(two).toEqual(one);
    for (const body of [
      { ...command.body, validityDays: 31 },
      { ...command.body, estimateVersionNumber: 2 },
      { ...command.body, scopeNote: 'Changed literal scope' },
    ]) {
      const conflict = await fixture.post({ ...command, body });
      expect({
        status: conflict.status,
        body: await conflict.json(),
      }).toMatchObject({ status: 409, body: { code: 'IDEMPOTENCY_CONFLICT' } });
    }
    const successor = {
      ...command,
      path: `/offers/opportunities/${source.opportunityId}/versions/from-approved-estimate`,
      body: { ...command.body, expectedOfferRevision: 1 },
    };
    const wrongKind = await fixture.post(successor);
    expect(wrongKind.status).toBe(409);
    const results = await Promise.all(
      ['one', 'two'].map((key) => fixture.post({ ...successor, key })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const history = responseRecord(
      await fixture.read({
        path: `/offers/opportunities/${source.opportunityId}/versions`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_READER,
      }),
    );
    expect(history.versions).toHaveLength(2);
  });

  it.each(['AWAITING', 'MODIFY', 'REJECT'])(
    'refuses a source whose exact decision is %s without side effects',
    async (code) => {
      const source = await fixture.prepare();
      const candidate = responseRecord(
        await fixture.command({
          path: `/opportunities/${source.opportunityId}/profitability-estimates`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: {
            ...estimateSubmission(),
            expectedLatestVersionNumber: 1,
            proposedPrice: '150.00',
          },
        }),
      );
      const versionId = responseString(candidate, 'id');
      if (code !== 'AWAITING')
        await fixture.command({
          path: `/opportunities/${source.opportunityId}/profitability-estimates/versions/${versionId}/decision`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_DIRECTOR,
          body: { expectedVersionNumber: 2, expectedDecision: null, code },
        });
      const result = await fixture.post({
        path: `/offers/opportunities/${source.opportunityId}/from-approved-estimate`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: estimateOfferIntent({
          estimateVersionId: versionId,
          estimateVersionNumber: 2,
        }),
      });
      expect({
        status: result.status,
        body: await result.json(),
      }).toMatchObject({
        status: 409,
        body: { code: 'PROFITABILITY_VERSION_NOT_APPROVED' },
      });
      expect(
        await fixture.read({
          path: `/offers/opportunities/${source.opportunityId}`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).toEqual({ offer: null });
      expect(
        (
          await fixture.pool.query(
            'SELECT count(*)::int AS count FROM offer_commands',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
    },
  );

  it('refuses forged fields, mismatched displayed versions and foreign source identity', async () => {
    const source = await fixture.prepare();
    const command = {
      path: `/offers/opportunities/${source.opportunityId}/from-approved-estimate`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: estimateOfferIntent(source),
    };
    for (const field of [
      'amount',
      'currency',
      'taxTreatment',
      'provenance',
      'approvalDecisionId',
      'pricingSnapshotId',
    ])
      expect(
        (
          await fixture.post({
            ...command,
            body: { ...command.body, [field]: 'forged' },
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await fixture.post({
          ...command,
          body: { ...command.body, estimateVersionNumber: 2 },
        })
      ).status,
    ).toBe(409);
    const foreign = await fixture.post({
      ...command,
      body: {
        ...command.body,
        estimateVersionId: '00000000-0000-4000-8000-000000000999',
      },
    });
    expect(foreign.status).toBe(404);
    expect(
      await fixture.read({
        path: `/offers/opportunities/${source.opportunityId}`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_READER,
      }),
    ).toEqual({ offer: null });
  });
  it('preserves the one Offer history across explicit internal and adjusted Snapshot source switches', async () => {
    const source = await fixture.prepare();
    const path = `/offers/opportunities/${source.opportunityId}`;
    const first = responseRecord(
      await fixture.command({
        path: `${path}/from-approved-estimate`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: estimateOfferIntent(source),
      }),
    );
    const snapshot = await fixture.illustrativeSnapshot(source, true);
    const legacy = responseRecord(
      await fixture.command({
        path: `${path}/versions`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          expectedOfferRevision: 1,
          pricingSnapshotId: snapshot.id,
          recipient: { kind: 'PRIMARY' },
          validityDays: 30,
          scopeNote: 'Deliberate illustrative successor',
          commercialConditions: null,
        },
      }),
    );
    expect(legacy).toMatchObject({
      id: first.id,
      revision: 2,
      version: {
        versionNumber: 2,
        provenance: 'ILLUSTRATIVE',
        decisionState: 'PENDING',
        representation: { templateVersion: 2 },
        pricingSnapshot: {
          subtotal: '290.00',
          taxTotal: '43.50',
          total: '333.50',
        },
      },
    });
    expect(responseRecord(legacy.version)).not.toHaveProperty('priceSource');
    const third = responseRecord(
      await fixture.command({
        path: `${path}/versions/from-approved-estimate`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: { ...estimateOfferIntent(source), expectedOfferRevision: 2 },
      }),
    );
    expect(third).toMatchObject({
      id: first.id,
      revision: 3,
      version: {
        versionNumber: 3,
        priceSource: { amount: '125.00' },
        latestQualityRun: null,
      },
    });
    const history = responseRecord(
      await fixture.read({
        path: `${path}/versions`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_READER,
      }),
    );
    expect(history.versions).toHaveLength(3);
    const reopened = responseRecord(
      responseRecord(
        await fixture.read({
          path: `${path}/versions/${responseRecord(legacy.version).id}`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).offer,
    );
    expect(responseRecord(reopened.version).representation).toEqual(
      responseRecord(legacy.version).representation,
    );

    const finalLegacy = responseRecord(
      await fixture.command({
        path: `${path}/versions`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          expectedOfferRevision: 3,
          pricingSnapshotId: snapshot.id,
          recipient: { kind: 'PRIMARY' },
          validityDays: 30,
          scopeNote: 'Explicit illustrative accepted successor',
          commercialConditions: null,
        },
      }),
    );
    const finalId = responseString(responseRecord(finalLegacy.version), 'id');
    await fixture.command({
      path: `${path}/versions/${finalId}/approve`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_READER,
      body: { expectedOfferRevision: 4, acknowledgedWarningCodes: [] },
    });
    await fixture.command({
      path: `${path}/versions/${finalId}/transmission`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: {
        expectedOfferRevision: 5,
        acknowledgedWarningCodes: [],
        note: null,
      },
    });
    await fixture.command({
      path: `${path}/versions/${finalId}/client-response`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_READER,
      body: {
        expectedOfferRevision: 6,
        outcome: 'ACCEPTED',
        receivedAt: '2026-10-24T09:00:00.000Z',
      },
    });
    const refused = await fixture.post({
      path: `${path}/versions/from-approved-estimate`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: { ...estimateOfferIntent(source), expectedOfferRevision: 7 },
    });
    expect({
      status: refused.status,
      body: await refused.json(),
    }).toMatchObject({ status: 409, body: { code: 'OFFER_ACCEPTED' } });
  });

  it('keeps ordinary closed-Opportunity priority and permits an authorized exact replay after closure', async () => {
    const source = await fixture.prepare();
    const path = `/offers/opportunities/${source.opportunityId}/from-approved-estimate`;
    const command = {
      path,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      key: 'before-closure',
      body: estimateOfferIntent(source),
    };
    const first = await fixture.command(command);
    await fixture.pool.query(
      "UPDATE opportunities SET status = 'ARCHIVED' WHERE id = $1",
      [source.opportunityId],
    );
    expect(await fixture.command(command)).toEqual(first);
    const fresh = await fixture.post({
      ...command,
      key: 'after-closure',
      body: { forged: true },
    });
    expect({ status: fresh.status, body: await fresh.json() }).toMatchObject({
      status: 409,
      body: { code: 'OPPORTUNITY_NOT_OPEN' },
    });
  });

  it.each([null, 'v999'])(
    'fails closed for a corrupted unknown/null captured preparation version %s',
    async (captured) => {
      const source = await fixture.prepare();
      const definition = (
        await fixture.pool.query<{ definition: string }>(
          "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'company_role_assignments_permission_set_version_check'",
        )
      ).rows[0]?.definition;
      if (!definition) throw new Error('Missing capture constraint.');
      const connection = await fixture.pool.connect();
      try {
        await connection.query('BEGIN');
        await connection.query(
          'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
        );
        await connection.query(
          "UPDATE company_role_assignments SET permission_set_version = $3 WHERE company_id = $1 AND workspace_membership_id = $2 AND bundle::text = 'company_offer_preparer'",
          [source.companyId, source.preparerMembershipId, captured],
        );
        await connection.query(
          `ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ${definition.replace(/ NOT VALID$/u, '')} NOT VALID`,
        );
        await connection.query('COMMIT');
      } catch (error) {
        await connection.query('ROLLBACK');
        throw error;
      } finally {
        connection.release();
      }
      const result = await fixture.post({
        path: `/offers/opportunities/${source.opportunityId}/from-approved-estimate`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: estimateOfferIntent(source),
      });
      expect(result.status).toBe(403);
      const actor = responseRecord(
        await fixture.read({
          path: '/access/current-actor',
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
        }),
      );
      expect(
        responseRecord(actor.activeCompany).offerPermissions ?? [],
      ).not.toContain('commercial.offer.estimate.prepare');
    },
  );

  it('refuses real foreign Company and Opportunity sources without disclosing their identity', async () => {
    const source = await fixture.prepare();
    const other = responseRecord(
      await fixture.command({
        path: '/companies',
        body: { displayName: 'Synthetic foreign source Company' },
      }),
    );
    const companyId = responseString(other, 'id');
    for (const path of [
      '/company-context-assignments',
      '/company-commercial-intake-assignments',
      '/company-offer-preparer-assignments',
      '/company-profitability-contributor-assignments',
      '/company-director-client-assignments',
    ])
      await fixture.grant({
        path,
        companyId,
        membershipId: source.preparerMembershipId,
      });
    const command = {
      path: `/offers/opportunities/${source.opportunityId}/from-approved-estimate`,
      companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: estimateOfferIntent(source),
    };
    const foreignCompany = await fixture.post(command);
    expect(foreignCompany.status).toBe(404);
    expect(JSON.stringify(await foreignCompany.json())).not.toContain(
      source.estimateVersionId,
    );
    const request = responseRecord(
      await fixture.command({
        path: '/commercial-intake/requests',
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          clientAccountId: source.clientId,
          originalText: 'Synthetic other Request',
          opportunity: {
            title: 'Synthetic other Opportunity',
            nextAction: 'Prepare draft',
          },
        },
      }),
    );
    const otherId = responseString(
      responseRecord(request.initialOpportunity),
      'id',
    );
    const foreignOpportunity = await fixture.post({
      ...command,
      companyId: source.companyId,
      path: `/offers/opportunities/${otherId}/from-approved-estimate`,
    });
    expect(foreignOpportunity.status).toBe(404);
    expect(
      (await fixture.pool.query('SELECT count(*)::int AS count FROM offers'))
        .rows,
    ).toEqual([{ count: 0 }]);
  });

  it('enforces coherent immutable approved-source shapes and forbids fabricated execution evidence in PostgreSQL', async () => {
    const source = await fixture.prepare();
    const offer = responseRecord(
      await fixture.command({
        path: `/offers/opportunities/${source.opportunityId}/from-approved-estimate`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: estimateOfferIntent(source),
      }),
    );
    const versionId = responseString(responseRecord(offer.version), 'id');
    for (const change of [
      { estimate_source_amount: '150.00' },
      { estimate_source_currency: 'USD' },
      { estimate_source_approved_at: '2026-10-23T09:00:00.000Z' },
      { estimate_source_decision_code: 'REJECT' },
      { estimate_source_decision_id: randomUUID() },
      { estimate_source_version_number: 2 },
      { estimate_source_id: randomUUID() },
      { estimate_source_version_id: randomUUID() },
      { estimate_source_amount: null },
      { pricing_snapshot_id: randomUUID() },
      { template_code: 'OFFER_ILLUSTRATIVE', template_version: 1 },
      { provenance: 'UNKNOWN' },
    ]) {
      await expect(
        fixture.pool.query(
          `INSERT INTO offer_versions SELECT (jsonb_populate_record(NULL::offer_versions, to_jsonb(v) || $2::jsonb)).* FROM offer_versions v WHERE v.id = $1`,
          [
            versionId,
            JSON.stringify({
              id: randomUUID(),
              version_number: 2,
              predecessor_version_id: versionId,
              ...change,
            }),
          ],
        ),
      ).rejects.toMatchObject({
        code: expect.stringMatching(/^235(?:03|14)$/u),
      });
    }
    await expect(
      fixture.pool.query(
        "UPDATE offer_versions SET estimate_source_amount = '150.00' WHERE id = $1",
        [versionId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const actor = (
      await fixture.pool.query<{ userId: string }>(
        'SELECT internal_user_id AS "userId" FROM workspace_memberships WHERE id = $1',
        [source.preparerMembershipId],
      )
    ).rows[0];
    if (!actor) throw new Error('Missing actor.');
    await expect(
      fixture.pool.query(
        `INSERT INTO offer_commands (workspace_id,company_id,actor_workspace_membership_id,idempotency_key,fingerprint,opportunity_id,result_offer_id,kind,result_version_id,result_offer_revision,created_at)
      SELECT workspace_id,company_id,$2,'synthetic-broken-source-receipt',repeat('a',64),opportunity_id,offer_id,'CREATE_ESTIMATE_OFFER',id,NULL,created_at FROM offer_versions WHERE id=$1`,
        [versionId, source.preparerMembershipId],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    const results = [
      'PRICING_SNAPSHOT_COHERENT',
      'CURRENCY_UNCHANGED',
      'VALIDITY_OPEN',
      'RECIPIENT_AVAILABLE',
      'RECIPIENT_IDENTITY_CURRENT',
      'RECIPIENT_TAX_ID_RECORDED',
      'PRICING_CLIENT_CONTEXT_COHERENT',
      'PROVISIONAL_MARKER_PRESENT',
    ].map((code) => ({ code, status: 'PASS' }));
    await expect(
      fixture.pool.query(
        `INSERT INTO offer_quality_runs (workspace_id,company_id,offer_id,offer_version_id,actor_internal_user_id,actor_workspace_membership_id,evaluated_at,results)
      SELECT workspace_id,company_id,offer_id,id,$2,$3,created_at,$4 FROM offer_versions WHERE id=$1`,
        [
          versionId,
          actor.userId,
          source.preparerMembershipId,
          JSON.stringify(results),
        ],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      fixture.pool.query(
        `INSERT INTO offer_decisions (workspace_id,company_id,offer_id,offer_version_id,actor_internal_user_id,actor_workspace_membership_id,decided_at,state,offer_revision,representation_sha256)
      SELECT workspace_id,company_id,offer_id,id,$2,$3,created_at,'APPROVED',2,$4 FROM offer_versions WHERE id=$1`,
        [versionId, actor.userId, source.preparerMembershipId, 'a'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (
        await fixture.pool.query(
          'SELECT count(*)::int AS count FROM offer_versions',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });
});
