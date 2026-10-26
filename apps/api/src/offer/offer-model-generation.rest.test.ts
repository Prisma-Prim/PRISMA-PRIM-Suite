import { commandFingerprint } from '../command/idempotent-command.js';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_OWNER,
  ESTIMATE_OFFER_DIRECTOR,
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  estimateSubmission,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from './offer-estimate-preparation.test-support.js';
import {
  generatedOfferIntent,
  generatedOfferModelContent,
  prepareGeneratedOfferSource,
  prepareGeneratedOfferWorkflow,
} from './offer-model-generation.test-fixture.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

withPostgres('Approved-model Offer generation public REST', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let instant = '2026-10-24T09:00:00.000Z';
  beforeAll(async () => {
    fixture = await openEstimateOfferFixture({
      serverClock: { now: () => new Date(instant) },
    });
  });
  beforeEach(async () => {
    instant = '2026-10-24T09:00:00.000Z';
    await fixture.reset();
  });
  afterAll(async () => fixture?.close());

  it('rechecks changed recipient warnings and strict validity at approval and preserves exact authorized receipts after expiry', async () => {
    const { source, path, base } = await prepareGeneratedOfferWorkflow(
      fixture,
      'PENDING',
    );
    const frozen = responseRecord(
      responseRecord(
        await fixture.read({
          path,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).offer,
    );
    const checks = {
      path: `${base}/quality-checks`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_READER,
      key: 'before-identity-change',
      body: {},
    };
    const original = await fixture.command(checks);
    await fixture.pool.query(
      "UPDATE client_accounts SET display_name='Changed synthetic recipient' WHERE id=$1",
      [source.clientId],
    );
    const warnings = [
      'DECLARED_TAX_UNVERIFIED',
      'NON_OFFICIAL_OFFER',
      'ILLUSTRATIVE_MODEL',
    ];
    for (const codes of [
      warnings,
      [...warnings, 'VALIDITY_OPEN'],
      [...warnings, 'RECIPIENT_IDENTITY_CURRENT', 'RECIPIENT_IDENTITY_CURRENT'],
    ]) {
      const refused = await fixture.post({
        path: `${base}/approve`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_READER,
        body: { expectedOfferRevision: 1, acknowledgedWarningCodes: codes },
      });
      expect(refused.status).toBe(codes.length === 5 ? 400 : 409);
    }
    const approval = {
      path: `${base}/approve`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_READER,
      key: 'identity-reviewed',
      body: {
        expectedOfferRevision: 1,
        acknowledgedWarningCodes: [...warnings, 'RECIPIENT_IDENTITY_CURRENT'],
      },
    };
    const approved = responseRecord(await fixture.command(approval));
    expect(responseRecord(approved.qualityRun).results).toContainEqual({
      code: 'RECIPIENT_IDENTITY_CURRENT',
      status: 'WARNING',
    });
    expect(approved.representationSha256).toBe(
      responseRecord(responseRecord(frozen.version).representation).sha256,
    );
    instant = responseString(responseRecord(frozen.version), 'validUntil');
    const refused = await fixture.post({
      path: `${base}/transmission`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
    });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      code: 'QUALITY_CHECK_ERRORS',
    });
    const elapsed = responseRecord(
      await fixture.command({ ...checks, key: 'exact-validity-boundary' }),
    );
    expect(elapsed.results).toContainEqual({
      code: 'VALIDITY_OPEN',
      status: 'ERROR',
    });
    expect(await fixture.command(checks)).toEqual(original);
    expect(await fixture.command(approval)).toEqual(approved);
    expect(
      (
        await fixture.pool.query(
          'SELECT count(*)::integer AS count FROM offer_transmissions',
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });

  it('refuses a wrong approved digest at transmission without committing a run, receipt or event', async () => {
    const { source, base } = await prepareGeneratedOfferWorkflow(
      fixture,
      'APPROVED',
    );
    // Isolated corruption probe: ordinary SQL mutation is separately refused.
    await fixture.pool.query(
      'ALTER TABLE offer_decisions DISABLE TRIGGER offer_decisions_immutable',
    );
    try {
      await fixture.pool.query(
        "UPDATE offer_decisions SET representation_sha256=repeat('0',64)",
      );
    } finally {
      await fixture.pool.query(
        'ALTER TABLE offer_decisions ENABLE TRIGGER offer_decisions_immutable',
      );
    }
    const before = (
      await fixture.pool.query(
        `SELECT (SELECT count(*) FROM offer_quality_runs) AS runs,(SELECT count(*) FROM offer_commands) AS receipts,(SELECT count(*) FROM offer_events) AS events`,
      )
    ).rows;
    const refused = await fixture.post({
      path: `${base}/transmission`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
    });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      code: 'REPRESENTATION_MISMATCH',
    });
    expect(
      (
        await fixture.pool.query(
          `SELECT (SELECT count(*) FROM offer_quality_runs) AS runs,(SELECT count(*) FROM offer_commands) AS receipts,(SELECT count(*) FROM offer_events) AS events`,
        )
      ).rows,
    ).toEqual(before);
  });

  it('switches explicitly between full model and Snapshot Versions without changing prior bytes or inventing a hybrid source', async () => {
    const { source, path } = await prepareGeneratedOfferWorkflow(
      fixture,
      'PENDING',
    );
    const first = responseRecord(
      responseRecord(
        await fixture.read({
          path,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).offer,
    );
    const snapshot = await fixture.illustrativeSnapshot(source);
    const second = responseRecord(
      await fixture.command({
        path: `${path}/versions`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          expectedOfferRevision: 1,
          pricingSnapshotId: snapshot.id,
          recipient: { kind: 'PRIMARY' },
          validityDays: 30,
          scopeNote: null,
          commercialConditions: null,
        },
      }),
    );
    expect(second).toMatchObject({
      id: first.id,
      revision: 2,
      version: {
        versionNumber: 2,
        provenance: 'ILLUSTRATIVE',
        pricingSnapshot: { total: '345.00' },
        decisionState: 'PENDING',
      },
    });
    expect(responseRecord(second.version)).not.toHaveProperty('modelSource');
    const secondBase = `${path}/versions/${responseString(responseRecord(second.version), 'id')}`;
    await fixture.command({
      path: `${secondBase}/approve`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_READER,
      body: { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
    });
    await fixture.command({
      path: `${secondBase}/transmission`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: { expectedOfferRevision: 3, acknowledgedWarningCodes: [] },
    });
    const submitted = responseRecord(
      await fixture.command({
        path: `/opportunities/${source.opportunityId}/profitability-estimates`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          ...estimateSubmission(),
          currency: 'USD',
          directCosts: [],
          expectedLatestVersionNumber: 1,
        },
      }),
    );
    const changedEstimateId = responseString(submitted, 'id');
    await fixture.command({
      path: `/opportunities/${source.opportunityId}/profitability-estimates/versions/${changedEstimateId}/decision`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_DIRECTOR,
      body: {
        expectedVersionNumber: 2,
        expectedDecision: null,
        code: 'APPROVE',
      },
    });
    const third = responseRecord(
      await fixture.command({
        path: `${path}/versions/from-approved-model`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          ...generatedOfferIntent({
            ...source,
            estimateVersionId: changedEstimateId,
            estimateVersionNumber: 2,
          }),
          expectedOfferRevision: 4,
        },
      }),
    );
    expect(third).toMatchObject({
      id: first.id,
      revision: 5,
      version: {
        versionNumber: 3,
        provenance: 'COMPANY_MODEL_ESTIMATE',
        financialDeclaration: { grossAmount: '150.00', currency: 'USD' },
        decisionState: 'PENDING',
      },
    });
    expect(responseRecord(third.version)).not.toHaveProperty('pricingSnapshot');
    const checks = responseRecord(
      await fixture.command({
        path: `${path}/versions/${responseString(responseRecord(third.version), 'id')}/quality-checks`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_READER,
        body: {},
      }),
    );
    expect(checks.results).toContainEqual({
      code: 'CURRENCY_UNCHANGED',
      status: 'WARNING',
    });
    const firstId = responseString(responseRecord(first.version), 'id');
    const historical = responseRecord(
      responseRecord(
        await fixture.read({
          path: `${path}/versions/${firstId}`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).offer,
    );
    expect(responseRecord(historical.version).representation).toEqual(
      responseRecord(first.version).representation,
    );
  });

  it('generates and reopens complete frozen Romanian content from approved sources without granting cost read', async () => {
    const source = await prepareGeneratedOfferSource(fixture);
    const path = `/offers/opportunities/${source.opportunityId}`;
    const offer = responseRecord(
      await fixture.command({
        path: `${path}/from-approved-model`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        key: 'synthetic-model-offer-first',
        body: generatedOfferIntent(source),
      }),
    );
    expect(offer).toMatchObject({
      companyId: source.companyId,
      opportunityId: source.opportunityId,
      provisional: true,
      version: {
        versionNumber: 1,
        decisionState: 'PENDING',
        transmissionState: 'NOT_TRANSMITTED',
        clientResponseState: 'NONE',
        provenance: 'COMPANY_MODEL_ESTIMATE',
        eligibility: 'NON_OFFICIAL_REHEARSAL',
        priceSource: {
          kind: 'DIRECTOR_APPROVED_ESTIMATE',
          estimateVersionId: source.estimateVersionId,
          approvalDecisionId: source.approvalDecisionId,
          amount: '125.00',
          currency: 'EUR',
        },
        modelSource: {
          versionId: source.modelVersionId,
          versionNumber: 1,
          approvalDecisionId: source.modelApprovalDecisionId,
          content: generatedOfferModelContent,
        },
        financialDeclaration: {
          kind: 'NET_PLUS_DECLARED_TAX',
          netAmountConfirmed: true,
          netAmount: '125.00',
          taxAmount: '25.00',
          grossAmount: '150.00',
          currency: 'EUR',
          basis: 'basis-should-stay-internal-852',
        },
        representation: {
          rendererCode: 'OFFER_COMPANY_CONSULTING_RO',
          rendererVersion: 1,
        },
        latestQualityRun: null,
      },
    });
    const version = responseRecord(offer.version);
    expect(version).not.toHaveProperty('pricingSnapshot');
    expect(version).not.toHaveProperty('templateCode');
    const representation = responseRecord(version.representation);
    const html = responseString(representation, 'html');
    expect(html).toContain('<html lang="ro">');
    expect(html).toContain('&lt;script&gt;literal852()&lt;/script&gt;');
    expect(html).not.toContain('basis-should-stay-internal-852');
    expect(html).not.toContain('source-description-internal-852');
    expect(html).not.toContain('model-approval-basis-not-for-Offer-output-852');
    for (const stage of generatedOfferModelContent.stages) {
      expect(html).toContain(stage.title);
      expect(html).toContain(stage.plannedActivity);
      expect(html).toContain(stage.intendedResult);
    }
    expect(representation.sha256).toBe(
      createHash('sha256').update(html, 'utf8').digest('hex'),
    );
    await fixture.restart();
    const reopened = responseRecord(
      responseRecord(
        await fixture.read({
          path,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).offer,
    );
    expect(reopened.id).toBe(offer.id);
    expect(reopened.version).toEqual(offer.version);
    for (const field of [
      'executorCost',
      'fiscalCost',
      'allocatedOverhead',
      'profitabilityPercent',
      'targetProfitability',
      'strategicReason',
    ])
      expect(JSON.stringify(reopened)).not.toContain(`"${field}"`);
  });
  it('runs thirteen bound checks and rehearses independent approval, exact transmission and response after model withdrawal', async () => {
    const source = await prepareGeneratedOfferSource(fixture);
    const path = `/offers/opportunities/${source.opportunityId}`;
    const creation = {
      path: `${path}/from-approved-model`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      key: 'model-rehearsal-create',
      body: generatedOfferIntent(source),
    };
    const created = responseRecord(await fixture.command(creation));
    const version = responseRecord(created.version);
    const versionId = responseString(version, 'id');
    const base = `${path}/versions/${versionId}`;
    await fixture.command({
      path: `/offer-models/consulting-ro/versions/${source.modelVersionId}/withdrawal`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_DIRECTOR,
      body: {
        expectedModelRevision: 2,
        versionNumber: 1,
        reason: 'Withdraw future use only',
      },
    });
    expect(await fixture.command(creation)).toEqual(created);
    const checks = responseRecord(
      await fixture.command({
        path: `${base}/quality-checks`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_READER,
        body: {},
      }),
    );
    expect(checks).toMatchObject({
      ruleSet: 'OFFER_QUALITY_COMPANY_MODEL',
      ruleSetVersion: 1,
      results: [
        { code: 'MODEL_APPROVAL_COHERENT', status: 'PASS' },
        { code: 'ECONOMIC_SOURCE_COHERENT', status: 'PASS' },
        { code: 'DECLARED_TOTALS_COHERENT', status: 'PASS' },
        { code: 'REPRESENTATION_COHERENT', status: 'PASS' },
        { code: 'VALIDITY_OPEN', status: 'PASS' },
        { code: 'RECIPIENT_AVAILABLE', status: 'PASS' },
        { code: 'RECIPIENT_IDENTITY_CURRENT', status: 'PASS' },
        { code: 'RECIPIENT_TAX_ID_RECORDED', status: 'PASS' },
        { code: 'CURRENCY_UNCHANGED', status: 'PASS' },
        { code: 'NON_OFFICIAL_MARKER_PRESENT', status: 'PASS' },
        { code: 'DECLARED_TAX_UNVERIFIED', status: 'WARNING' },
        { code: 'NON_OFFICIAL_OFFER', status: 'WARNING' },
        { code: 'ILLUSTRATIVE_MODEL', status: 'WARNING' },
      ],
    });
    const approvalCommand = {
      path: `${base}/approve`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_READER,
      key: 'model-approve',
      body: {
        expectedOfferRevision: 1,
        acknowledgedWarningCodes: [
          'DECLARED_TAX_UNVERIFIED',
          'NON_OFFICIAL_OFFER',
          'ILLUSTRATIVE_MODEL',
        ],
      },
    };
    const approval = responseRecord(await fixture.command(approvalCommand));
    expect(approval).toMatchObject({
      state: 'APPROVED',
      offerRevision: 2,
      representationSha256: responseRecord(version.representation).sha256,
    });
    const transmissionCommand = {
      path: `${base}/transmission`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      key: 'model-transmit',
      body: {
        expectedOfferRevision: 2,
        acknowledgedWarningCodes: [],
        note: 'Synthetic rehearsal only',
      },
    };
    const transmission = responseRecord(
      await fixture.command(transmissionCommand),
    );
    expect(transmission).toMatchObject({
      channel: 'SIMULATED',
      offerRevision: 3,
      representationSha256: approval.representationSha256,
    });
    const responseCommand = {
      path: `${base}/client-response`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_READER,
      key: 'model-response',
      body: {
        expectedOfferRevision: 3,
        outcome: 'ACCEPTED',
        receivedAt: '2026-10-24T09:00:00.000Z',
      },
    };
    const response = responseRecord(await fixture.command(responseCommand));
    expect(response).toMatchObject({
      outcome: 'ACCEPTED',
      evidenceKind: 'SIMULATED',
      offerRevision: 4,
    });
    for (const [command, expected] of [
      [creation, created],
      [approvalCommand, approval],
      [transmissionCommand, transmission],
      [responseCommand, response],
    ] satisfies [Parameters<typeof fixture.command>[0], unknown][])
      expect(await fixture.command(command)).toEqual(expected);
    await fixture.pool.query(
      "UPDATE company_role_assignments SET permission_set_version='v2' WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_offer_preparer'",
      [source.companyId, source.preparerMembershipId],
    );
    expect((await fixture.post(creation)).status).toBe(403);
    expect((await fixture.post(transmissionCommand)).status).toBe(403);
    await fixture.pool.query(
      "UPDATE company_role_assignments SET permission_set_version='v3' WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_offer_preparer'",
      [source.companyId, source.preparerMembershipId],
    );
    await fixture.pool.query(
      "UPDATE company_role_assignments SET permission_set_version='v1' WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_offer_approver'",
      [source.companyId, source.readerMembershipId],
    );
    expect((await fixture.post(approvalCommand)).status).toBe(403);
    expect((await fixture.post(responseCommand)).status).toBe(403);
    await fixture.pool.query(
      "UPDATE company_role_assignments SET permission_set_version='v2' WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_offer_approver'",
      [source.companyId, source.readerMembershipId],
    );
    await fixture.restart();
    const reopened = responseRecord(
      responseRecord(
        await fixture.read({
          path,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).offer,
    );
    expect(reopened).toMatchObject({
      revision: 4,
      version: {
        decisionState: 'APPROVED',
        transmissionState: 'TRANSMITTED',
        clientResponseState: 'ACCEPTED',
        eligibility: 'NON_OFFICIAL_REHEARSAL',
      },
    });
    expect(responseRecord(reopened.version).representation).toEqual(
      version.representation,
    );
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
      const refused = await fixture.post({
        path: `/contracts/opportunities/${source.opportunityId}${suffix}`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body,
      });
      expect({
        status: refused.status,
        body: await refused.json(),
      }).toMatchObject({
        status: 409,
        body: { code: 'OFFER_MODEL_CONTRACT_UNSUPPORTED' },
      });
    }
    const legacyPrice = await fixture.illustrativeSnapshot(source);
    const direct = await fixture.post({
      path: `/contracts/opportunities/${source.opportunityId}/direct`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: {
        pricingSnapshotId: legacyPrice.id,
        recipient: { kind: 'PRIMARY' },
        directReason: 'Synthetic bypass attempt',
        scopeNote: 'Synthetic direct scope',
        commercialConditions: null,
      },
    });
    expect({ status: direct.status, body: await direct.json() }).toMatchObject({
      status: 409,
      body: { code: 'ACCEPTED_OFFER_EXISTS' },
    });
    expect(
      (await fixture.pool.query('SELECT id FROM contracts')).rowCount,
    ).toBe(0);
    const successor = await fixture.post({
      path: `${path}/versions/from-approved-model`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: { ...generatedOfferIntent(source), expectedOfferRevision: 4 },
    });
    expect(successor.status).toBe(409);
    const { rows } = await fixture.pool.query<{ metadata: unknown }>(
      'SELECT metadata FROM offer_events ORDER BY occurred_at, id',
    );
    for (const row of rows) {
      expect(JSON.stringify(row.metadata)).not.toContain(
        'basis-should-stay-internal-852',
      );
      expect(JSON.stringify(row.metadata)).not.toContain('125.00');
      expect(JSON.stringify(row.metadata)).not.toContain(
        'source-description-internal-852',
      );
    }
  });

  it('returns only the active approved selection without configuration notes and requires separate selection authority', async () => {
    const source = await prepareGeneratedOfferSource(fixture);
    const selection = responseRecord(
      await fixture.read({
        path: '/offer-models/consulting-ro/for-offer',
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    expect(selection).toMatchObject({
      selection: {
        versionId: source.modelVersionId,
        content: generatedOfferModelContent,
      },
    });
    expect(JSON.stringify(selection)).not.toContain(
      'model-approval-basis-not-for-Offer-output-852',
    );
    for (const headers of [ESTIMATE_OFFER_READER, ESTIMATE_OFFER_DIRECTOR])
      expect(
        (
          await fixture.request({
            path: '/offer-models/consulting-ro/for-offer',
            companyId: source.companyId,
            headers,
          })
        ).status,
      ).toBe(403);
  });

  it('preserves literal declaration strings, accepts explicit zero and rejects invented financial fields before any write', async () => {
    const source = await prepareGeneratedOfferSource(fixture);
    const intent = generatedOfferIntent(source);
    const path = `/offers/opportunities/${source.opportunityId}`;
    const invalidDeclarations: unknown[] = [
      null,
      { ...intent.financialDeclaration, netAmountConfirmed: false },
      { ...intent.financialDeclaration, taxAmount: '-1.00' },
      { ...intent.financialDeclaration, taxAmount: '2e1' },
      { ...intent.financialDeclaration, taxAmount: '25,00' },
      { ...intent.financialDeclaration, taxAmount: '25' },
      { ...intent.financialDeclaration, basis: '  ' },
      { ...intent.financialDeclaration, taxLabel: '\u0000' },
      { ...intent.financialDeclaration, basis: '\ud800' },
      { ...intent.financialDeclaration, grossAmount: '150.00' },
      { ...intent.financialDeclaration, netAmount: '125.00' },
      { ...intent.financialDeclaration, taxRate: '20' },
    ];
    for (const financialDeclaration of invalidDeclarations) {
      const result = await fixture.post({
        path: `${path}/from-approved-model`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: { ...intent, financialDeclaration },
      });
      expect({
        status: result.status,
        body: await result.json(),
      }).toMatchObject({
        status: 400,
        body: { code: 'OFFER_VALIDATION_ERROR' },
      });
    }
    const generated = responseRecord(
      await fixture.command({
        path: `${path}/from-approved-model`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          ...intent,
          financialDeclaration: {
            ...intent.financialDeclaration,
            taxAmount: '000.00',
            taxLabel: ' Explicit zero 🌍\n literal ',
            basis: ' Zero expressly declared\n🌍 ',
          },
        },
      }),
    );
    expect(
      responseRecord(generated.version).financialDeclaration,
    ).toMatchObject({
      taxAmount: '000.00',
      grossAmount: '125.00',
      taxLabel: ' Explicit zero 🌍\n literal ',
      basis: ' Zero expressly declared\n🌍 ',
    });
    expect(generated.illustrativeReference).toBe(1);
  });
  it('requires new-mode authority before creation and workflow replay without lending source read to execution', async () => {
    const source = await prepareGeneratedOfferSource(fixture);
    const path = `/offers/opportunities/${source.opportunityId}`;
    const command = {
      path: `${path}/from-approved-model`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      key: 'authority-exact-replay',
      body: generatedOfferIntent(source),
    };
    const created = responseRecord(await fixture.command(command));
    const versionId = responseString(responseRecord(created.version), 'id');
    await fixture.pool.query(
      "UPDATE company_role_assignments SET permission_set_version='v2' WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_offer_preparer'",
      [source.companyId, source.preparerMembershipId],
    );
    expect((await fixture.post(command)).status).toBe(403);
    expect(
      (
        await fixture.request({
          path: '/offer-models/consulting-ro/for-offer',
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
        })
      ).status,
    ).toBe(403);
    await fixture.pool.query(
      "UPDATE company_role_assignments SET permission_set_version='v3' WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_offer_preparer'",
      [source.companyId, source.preparerMembershipId],
    );
    await fixture.pool.query(
      "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_profitability_contributor'",
      [source.companyId, source.preparerMembershipId],
    );
    expect((await fixture.post(command)).status).toBe(403);
    const checks = {
      path: `${path}/versions/${versionId}/quality-checks`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      key: 'authority-run',
      body: {},
    };
    expect(await fixture.command(checks)).toMatchObject({
      ruleSet: 'OFFER_QUALITY_COMPANY_MODEL',
    });
    await fixture.pool.query(
      "UPDATE company_role_assignments SET permission_set_version='v1' WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_offer_approver'",
      [source.companyId, source.readerMembershipId],
    );
    expect(
      (await fixture.post({ ...checks, headers: ESTIMATE_OFFER_READER }))
        .status,
    ).toBe(403);
    expect(
      (
        await fixture.post({
          path: `${path}/versions/${versionId}/approve`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_READER,
          body: { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
        })
      ).status,
    ).toBe(403);
    const reopened = responseRecord(
      responseRecord(
        await fixture.read({
          path,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).offer,
    );
    expect(responseRecord(reopened.version).representation).toEqual(
      responseRecord(created.version).representation,
    );
  });

  it('keeps one complete mixed history and original preparation receipt across source switches', async () => {
    const source = await prepareGeneratedOfferSource(fixture);
    const path = `/offers/opportunities/${source.opportunityId}`;
    const firstCommand = {
      path: `${path}/from-approved-model`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      key: 'mixed-model-first',
      body: generatedOfferIntent(source),
    };
    const first = responseRecord(await fixture.command(firstCommand));
    const internal = responseRecord(
      await fixture.command({
        path: `${path}/versions/from-approved-estimate`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          estimateVersionId: source.estimateVersionId,
          estimateVersionNumber: 1,
          recipient: { kind: 'PRIMARY' },
          expectedOfferRevision: 1,
        },
      }),
    );
    expect(internal).toMatchObject({
      id: first.id,
      revision: 2,
      version: {
        provenance: 'APPROVED_ESTIMATE_INTERNAL_DRAFT',
        versionNumber: 2,
        priceSource: { taxTreatment: 'UNSPECIFIED' },
      },
    });
    const third = responseRecord(
      await fixture.command({
        path: `${path}/versions/from-approved-model`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          ...generatedOfferIntent(source),
          expectedOfferRevision: 2,
          financialDeclaration: {
            ...generatedOfferIntent(source).financialDeclaration,
            taxAmount: '0.00',
          },
        },
      }),
    );
    expect(third).toMatchObject({
      id: first.id,
      revision: 3,
      version: {
        versionNumber: 3,
        financialDeclaration: { grossAmount: '125.00' },
        decisionState: 'PENDING',
        latestQualityRun: null,
      },
    });
    expect(responseRecord(third.version).differences).toEqual(
      expect.arrayContaining([
        {
          field: 'modelVersionId',
          previous: null,
          current: source.modelVersionId,
          changed: true,
        },
        {
          field: 'grossAmount',
          previous: null,
          current: '125.00',
          changed: true,
        },
      ]),
    );
    expect(await fixture.command(firstCommand)).toEqual(first);
    const firstId = responseString(responseRecord(first.version), 'id');
    const historical = responseRecord(
      responseRecord(
        await fixture.read({
          path: `${path}/versions/${firstId}`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).offer,
    );
    expect(responseRecord(historical.version).representation).toEqual(
      responseRecord(first.version).representation,
    );
    expect(historical).toMatchObject({
      revision: 3,
      version: {
        versionNumber: 1,
        supersededByVersionId: responseRecord(internal.version).id,
        financialDeclaration: { grossAmount: '150.00' },
      },
    });
  });
  it('preserves leading-zero approved net and arbitrarily precise declared tax without floating point or range substitution', async () => {
    const source = await prepareGeneratedOfferSource(fixture);
    const net = '00090071992547409931234567890.01',
      tax = '00099999999999999999999999999.99';
    const later = responseRecord(
      await fixture.command({
        path: `/opportunities/${source.opportunityId}/profitability-estimates`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          ...estimateSubmission(),
          expectedLatestVersionNumber: 1,
          proposedPrice: net,
        },
      }),
    );
    const estimateVersionId = responseString(later, 'id');
    await fixture.command({
      path: `/opportunities/${source.opportunityId}/profitability-estimates/versions/${estimateVersionId}/decision`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_DIRECTOR,
      body: {
        expectedVersionNumber: 2,
        expectedDecision: null,
        code: 'APPROVE',
      },
    });
    const intent = generatedOfferIntent({
      ...source,
      estimateVersionId,
      estimateVersionNumber: 2,
    });
    const generated = responseRecord(
      await fixture.command({
        path: `/offers/opportunities/${source.opportunityId}/from-approved-model`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          ...intent,
          financialDeclaration: {
            ...intent.financialDeclaration,
            taxAmount: tax,
          },
        },
      }),
    );
    const version = responseRecord(generated.version);
    expect(version).toMatchObject({
      priceSource: { amount: net },
      financialDeclaration: {
        netAmount: net,
        taxAmount: tax,
        grossAmount: '190071992547409931234567890.00',
      },
    });
    expect(
      responseString(responseRecord(version.representation), 'html'),
    ).toContain(net + ' EUR');
  });

  it('keeps an approved model selectable under a pending successor, refuses foreign/unknown versions uniformly and records the replacement explicitly', async () => {
    const source = await prepareGeneratedOfferSource(fixture);
    const foreign = await prepareGeneratedOfferSource(fixture, {
      clientTaxId: 'SYNTHETIC-FOREIGN-852',
    });
    const pending = responseRecord(
      responseRecord(
        await fixture.command({
          path: '/offer-models/consulting-ro/versions',
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: {
            expectedModelRevision: 2,
            content: {
              ...generatedOfferModelContent,
              sourceKind: 'COMPANY_SUPPLIED',
              serviceTitle: 'Replacement supplied model',
            },
          },
        }),
      ).model,
    );
    const pendingId = responseString(responseRecord(pending.head), 'id');
    await fixture.command({
      path: `/opportunities/${source.opportunityId}/profitability-estimates`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: {
        ...estimateSubmission(),
        expectedLatestVersionNumber: 1,
        proposedPrice: '150.00',
      },
    });
    const command = {
      path: `/offers/opportunities/${source.opportunityId}/from-approved-model`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: generatedOfferIntent(source),
    };
    const created = responseRecord(await fixture.command(command));
    const bodies: unknown[] = [];
    for (const modelVersionId of [
      foreign.modelVersionId,
      '00000000-0000-4000-8000-000000000999',
      pendingId,
    ]) {
      const refused = await fixture.post({
        ...command,
        path: `/offers/opportunities/${source.opportunityId}/versions/from-approved-model`,
        body: {
          ...command.body,
          modelVersionId,
          modelVersionNumber: modelVersionId === pendingId ? 2 : 1,
          expectedOfferRevision: 1,
        },
      });
      expect(refused.status).toBe(409);
      bodies.push(await refused.json());
    }
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toEqual(bodies[2]);
    await fixture.command({
      path: `/offer-models/consulting-ro/versions/${pendingId}/decision`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_DIRECTOR,
      body: {
        expectedModelRevision: 3,
        versionNumber: 2,
        outcome: 'APPROVE',
        basis: 'Replacement reviewed',
      },
    });
    const oldSelection = await fixture.post({
      ...command,
      path: `/offers/opportunities/${source.opportunityId}/versions/from-approved-model`,
      body: { ...command.body, expectedOfferRevision: 1 },
    });
    expect(oldSelection.status).toBe(409);
    const successor = responseRecord(
      await fixture.command({
        ...command,
        path: `/offers/opportunities/${source.opportunityId}/versions/from-approved-model`,
        body: {
          ...command.body,
          modelVersionId: pendingId,
          modelVersionNumber: 2,
          expectedOfferRevision: 1,
        },
      }),
    );
    expect(successor).toMatchObject({
      id: created.id,
      version: {
        versionNumber: 2,
        modelSource: {
          versionId: pendingId,
          content: { sourceKind: 'COMPANY_SUPPLIED' },
        },
      },
    });
    const run = await fixture.command({
      path: `/offers/opportunities/${source.opportunityId}/versions/${responseString(responseRecord(successor.version), 'id')}/quality-checks`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_READER,
      body: {},
    });
    expect(responseRecord(run).results).toEqual(
      expect.arrayContaining([
        { code: 'ILLUSTRATIVE_MODEL', status: 'PASS' },
        { code: 'NON_OFFICIAL_OFFER', status: 'WARNING' },
        { code: 'DECLARED_TAX_UNVERIFIED', status: 'WARNING' },
      ]),
    );
  });

  it('rejects forged frozen-source/declaration/representation combinations and all in-place content changes in PostgreSQL', async () => {
    const source = await prepareGeneratedOfferSource(fixture);
    const created = responseRecord(
      await fixture.command({
        path: `/offers/opportunities/${source.opportunityId}/from-approved-model`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: generatedOfferIntent(source),
      }),
    );
    const version = responseRecord(created.version);
    const versionId = responseString(version, 'id');
    const snapshot = {
      modelSource: version.modelSource,
      financialDeclaration: version.financialDeclaration,
      representation: version.representation,
    };
    const insert = (patch: unknown) =>
      fixture.pool.query(
        `INSERT INTO offer_versions SELECT (jsonb_populate_record(NULL::offer_versions,to_jsonb(v)||$2::jsonb)).* FROM offer_versions v WHERE v.id=$1`,
        [
          versionId,
          JSON.stringify({ id: randomUUID(), ...responseRecord(patch) }),
        ],
      );
    // A complete valid copy reaches the existing uniqueness constraint; the
    // invalid copies below must fail their source/content guard before it.
    await expect(insert({})).rejects.toMatchObject({ code: '23505' });
    for (const patch of [
      { estimate_source_amount: '126.00' },
      { estimate_source_currency: 'USD' },
      { estimate_source_decision_id: randomUUID() },
      { model_source_id: randomUUID() },
      { model_source_version_id: randomUUID() },
      { model_source_decision_outcome: 'REJECT' },
      { pricing_snapshot_id: randomUUID() },
      { template_code: 'OFFER_ILLUSTRATIVE', template_version: 1 },
      {
        model_generation_snapshot: {
          ...snapshot,
          unexpected: 'not a recorded field',
        },
      },
      {
        model_generation_snapshot: {
          ...snapshot,
          modelSource: {
            ...responseRecord(version.modelSource),
            content: {
              ...generatedOfferModelContent,
              serviceTitle: 'Silently changed body',
            },
          },
        },
      },
      {
        model_generation_snapshot: {
          ...snapshot,
          modelSource: {
            ...responseRecord(version.modelSource),
            approvedBy: {
              workspaceMembershipId: randomUUID(),
              internalUserId: randomUUID(),
            },
          },
        },
      },
      {
        model_generation_snapshot: {
          ...snapshot,
          financialDeclaration: {
            ...responseRecord(version.financialDeclaration),
            netAmountConfirmed: false,
          },
        },
      },
      {
        model_generation_snapshot: {
          ...snapshot,
          financialDeclaration: {
            ...responseRecord(version.financialDeclaration),
            grossAmount: '150.01',
          },
        },
      },
      {
        model_generation_snapshot: {
          ...snapshot,
          financialDeclaration: {
            ...responseRecord(version.financialDeclaration),
            declaredBy: {
              workspaceMembershipId: randomUUID(),
              internalUserId: randomUUID(),
            },
          },
        },
      },
      {
        model_generation_snapshot: {
          ...snapshot,
          representation: {
            ...responseRecord(version.representation),
            html: '<html><body>Changed bytes</body></html>',
          },
        },
      },
    ])
      await expect(insert(patch)).rejects.toMatchObject({
        code: expect.stringMatching(/^235(?:03|14)$/u),
      });
    for (const patch of [
      { model_source_id: randomUUID() },
      { model_generation_snapshot: null },
      { estimate_source_amount: '200.00' },
      { scope_note: 'Silent correction' },
    ])
      await expect(
        fixture.pool.query(
          "UPDATE offer_versions SET model_source_id=coalesce(($2::jsonb->>'model_source_id')::uuid,model_source_id), model_generation_snapshot=CASE WHEN $2::jsonb ? 'model_generation_snapshot' THEN $2::jsonb->'model_generation_snapshot' ELSE model_generation_snapshot END,estimate_source_amount=coalesce($2::jsonb->>'estimate_source_amount',estimate_source_amount),scope_note=coalesce($2::jsonb->>'scope_note',scope_note) WHERE id=$1",
          [versionId, JSON.stringify(patch)],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    expect(
      (await fixture.pool.query('SELECT id FROM offer_versions')).rowCount,
    ).toBe(1);
  });

  it('isolates real Workspace memberships of the same Internal User before source, receipt or Offer disclosure', async () => {
    const source = await prepareGeneratedOfferSource(fixture);
    const command = {
      path: `/offers/opportunities/${source.opportunityId}/from-approved-model`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      key: 'same-user-private-receipt',
      body: generatedOfferIntent(source),
    };
    const created = responseRecord(await fixture.command(command));
    const owner = responseRecord(
      await fixture.read({ path: '/access/current-actor' }),
    );
    const preparer = responseRecord(
      await fixture.read({
        path: '/access/current-actor',
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    const workspaceId = randomUUID(),
      ownerMembershipId = randomUUID(),
      preparerMembershipId = randomUUID();
    await fixture.pool.query(
      'INSERT INTO workspaces (id,name) VALUES ($1,$2)',
      [workspaceId, 'Synthetic second Workspace'],
    );
    for (const [membershipId, internalUserId] of [
      [ownerMembershipId, responseString(owner, 'internalUserId')],
      [preparerMembershipId, responseString(preparer, 'internalUserId')],
    ])
      await fixture.pool.query(
        'INSERT INTO workspace_memberships (id,workspace_id,internal_user_id) VALUES ($1,$2,$3)',
        [membershipId, workspaceId, internalUserId],
      );
    for (const permission of ['company.manage', 'company.assignment.manage'])
      await fixture.pool.query(
        'INSERT INTO workspace_permission_grants (workspace_id,workspace_membership_id,permission) VALUES ($1,$2,$3)',
        [workspaceId, ownerMembershipId, permission],
      );
    async function scopedCommand(path: string, body: unknown) {
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
    }
    const company = responseRecord(
      await scopedCommand('/companies', {
        displayName: 'Synthetic second Workspace Company',
      }),
    );
    const companyId = responseString(company, 'id');
    for (const path of [
      '/company-context-assignments',
      '/company-commercial-intake-assignments',
      '/company-offer-preparer-assignments',
      '/company-profitability-contributor-assignments',
    ])
      await scopedCommand(path, {
        companyId,
        workspaceMembershipId: preparerMembershipId,
      });
    const secondActor = await fixture.request({
      path: '/access/current-actor',
      companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      init: { headers: { 'x-workspace-context-id': workspaceId } },
    });
    expect(secondActor.status).toBe(200);
    const actorValue: unknown = await secondActor.json();
    expect(responseRecord(actorValue)).toMatchObject({
      workspaceId,
      workspaceMembershipId: preparerMembershipId,
      internalUserId: preparer.internalUserId,
    });
    const unavailable: unknown[] = [];
    for (const opportunityId of [source.opportunityId, randomUUID()]) {
      const path = `/offers/opportunities/${opportunityId}`;
      const requests: RequestInit[] = [
        { headers: { 'x-workspace-context-id': workspaceId } },
        {
          method: 'POST',
          headers: {
            'x-workspace-context-id': workspaceId,
            'content-type': 'application/json',
            'idempotency-key': command.key,
          },
          body: JSON.stringify(command.body),
        },
      ];
      for (const init of requests) {
        const reply = await fixture.request({
          path: init.method === 'POST' ? `${path}/from-approved-model` : path,
          companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          init,
        });
        expect(reply.status).toBe(404);
        const value: unknown = await reply.json();
        unavailable.push(value);
        expect(JSON.stringify(value)).not.toContain(String(created.id));
        expect(JSON.stringify(value)).not.toContain(source.modelVersionId);
        expect(JSON.stringify(value)).not.toContain('125.00');
      }
    }
    expect(unavailable[0]).toEqual(unavailable[2]);
    expect(unavailable[1]).toEqual(unavailable[3]);
    const selection = await fixture.request({
      path: '/offer-models/consulting-ro/for-offer',
      companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      init: { headers: { 'x-workspace-context-id': workspaceId } },
    });
    expect(selection.status).toBe(200);
    expect(await selection.json()).toEqual({ selection: null });
    expect(await fixture.command(command)).toEqual(created);
  });

  it('fails closed for a persisted creation receipt that points to a different Version variant', async () => {
    const source = await prepareGeneratedOfferSource(fixture);
    const path = `/offers/opportunities/${source.opportunityId}`;
    await fixture.command({
      path: `${path}/from-approved-model`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: generatedOfferIntent(source),
    });
    const internal = responseRecord(
      await fixture.command({
        path: `${path}/versions/from-approved-estimate`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          estimateVersionId: source.estimateVersionId,
          estimateVersionNumber: 1,
          recipient: { kind: 'PRIMARY' },
          expectedOfferRevision: 1,
        },
      }),
    );
    const versionId = responseString(responseRecord(internal.version), 'id');
    const key = 'invalid-persisted-model-receipt';
    const body = generatedOfferIntent(source);
    await fixture.pool.query(
      `INSERT INTO offer_commands (workspace_id,company_id,actor_workspace_membership_id,idempotency_key,fingerprint,opportunity_id,result_offer_id,kind,result_version_id,result_offer_revision,created_at)
      SELECT workspace_id,company_id,$3,$4,$5,opportunity_id,id,'CREATE_MODEL_OFFER',$6,1,'2026-10-24T09:00:00Z' FROM offers WHERE company_id=$1 AND opportunity_id=$2`,
      [
        source.companyId,
        source.opportunityId,
        source.preparerMembershipId,
        key,
        commandFingerprint({
          kind: 'CREATE_MODEL_OFFER',
          opportunityId: source.opportunityId,
          payload: body,
        }),
        versionId,
      ],
    );
    const reply = await fixture.post({
      path: `${path}/from-approved-model`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      key,
      body,
    });
    expect({ status: reply.status, body: await reply.json() }).toMatchObject({
      status: 500,
      body: { code: 'OFFER_COMMAND_FAILED' },
    });
  });
});
