import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_PREPARER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  generatedContractModelContent,
  prepareModelContractSource,
} from './model-contract.test-fixture.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Corresponding full Contract public REST', () => {
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

  it('preserves the full Contract and thirteen-row annex from a pending Offer without accepting or signing it', async () => {
    const { flow, source, path, intent, invoke } =
      await prepareModelContractSource(fixture);
    const created = responseRecord(
      await invoke(`${path}/from-approved-model`, intent),
    );
    expect(created).toMatchObject({
      kind: 'CONTRACT',
      origin: 'COMPANY_MODEL_OFFER',
      provisional: true,
      version: {
        provenance: 'COMPANY_MODEL_OFFER',
        decisionState: 'PENDING',
        executionState: 'NOT_EXECUTED',
        modelGeneration: {
          modelSource: { content: generatedContractModelContent },
          financials: {
            netAmount: '125.00',
            taxAmount: '25.00',
            grossAmount: '150.00',
            currency: 'EUR',
          },
        },
      },
    });
    const version = responseRecord(created.version);
    const representation = responseRecord(version.representation);
    expect(representation.html).toContain('Activitate demonstrativă 13');
    expect(representation.html).toContain(
      '&lt;script&gt;literal()&lt;/script&gt;',
    );
    expect(representation.html).not.toContain('<script>');
    await fixture.restart();
    const reopened = responseRecord(
      await fixture.read({
        path,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    expect(responseRecord(reopened.contract).version).toEqual(version);
    const offer = responseRecord(
      await fixture.read({
        path: flow.path,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    expect(responseRecord(responseRecord(offer.offer).version)).toMatchObject({
      clientResponseState: 'PENDING',
      clientResponse: null,
    });
  });
  it('checks and internally approves the exact Contract while the source Offer response remains pending', async () => {
    const { flow, source, path, intent, invoke } =
      await prepareModelContractSource(fixture);
    const created = responseRecord(
      await invoke(`${path}/from-approved-model`, intent),
    );
    const versionId = responseString(responseRecord(created.version), 'id');
    const run = responseRecord(
      await invoke(`${path}/versions/${versionId}/quality-checks`, {}),
    );
    expect(run).toMatchObject({
      ruleSet: 'CONTRACT_QUALITY_COMPANY_MODEL',
      ruleSetVersion: 1,
    });
    if (!Array.isArray(run.results))
      throw new Error('Expected complete Quality Check results.');
    const results = run.results.map(responseRecord);
    expect(results.filter((r) => r.status === 'ERROR')).toEqual([]);
    expect(
      results.filter((r) => r.status === 'WARNING').map((r) => r.code),
    ).toEqual(['MODEL_WORDING_REVIEWED', 'ANNEX_SCOPE_REVIEWED']);
    const approved = responseRecord(
      await invoke(`${path}/versions/${versionId}/approve`, {
        expectedContractRevision: 1,
        acknowledgedWarningCodes: [
          'MODEL_WORDING_REVIEWED',
          'ANNEX_SCOPE_REVIEWED',
        ],
        reviewBasis:
          ' Full synthetic Contract wording and thirteen-row annex deliberately reviewed ',
      }),
    );
    expect(approved).toMatchObject({
      kind: 'APPROVE',
      revision: 2,
      reviewBasis:
        ' Full synthetic Contract wording and thirteen-row annex deliberately reviewed ',
      qualityRun: { ruleSet: 'CONTRACT_QUALITY_COMPANY_MODEL' },
    });
    const reopened = responseRecord(
      await fixture.read({
        path,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    expect(responseRecord(reopened.contract)).toMatchObject({
      revision: 2,
      version: {
        decisionState: 'APPROVED',
        executionState: 'NOT_EXECUTED',
        decision: approved,
      },
    });
    const offer = responseRecord(
      await fixture.read({
        path: flow.path,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    expect(responseRecord(responseRecord(offer.offer).version)).toMatchObject({
      clientResponseState: 'PENDING',
      clientResponse: null,
    });
  });
  it('preserves approved history and exact creation retries after an explicit successor and model withdrawal', async () => {
    const { source, path, intent, invoke } =
      await prepareModelContractSource(fixture);
    const command = (suffix: string, body: unknown, key: string) =>
      fixture.command({
        path: path + suffix,
        body,
        key,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      });
    const first = responseRecord(
      await command('/from-approved-model', intent, 'first-model-contract'),
    );
    const firstId = responseString(responseRecord(first.version), 'id');
    const approved = responseRecord(
      await invoke(`${path}/versions/${firstId}/approve`, {
        expectedContractRevision: 1,
        acknowledgedWarningCodes: [
          'MODEL_WORDING_REVIEWED',
          'ANNEX_SCOPE_REVIEWED',
        ],
        reviewBasis:
          'Synthetic first Version reviewed before its deliberate successor',
      }),
    );
    const successorIntent = {
      ...intent,
      expectedContractRevision: 2,
      clientDetails: ' Corrected synthetic case requisites ',
    };
    const successor = responseRecord(
      await command(
        '/versions/from-approved-model',
        successorIntent,
        'successor-model-contract',
      ),
    );
    const successorId = responseString(responseRecord(successor.version), 'id');
    expect(successor).toMatchObject({
      id: first.id,
      revision: 3,
      version: {
        versionNumber: 2,
        createdContractRevision: 3,
        predecessorVersionId: firstId,
        decisionState: 'PENDING',
        modelGeneration: {
          caseDetails: {
            clientDetails: ' Corrected synthetic case requisites ',
          },
        },
      },
    });
    const old = responseRecord(
      await fixture.read({
        path: `${path}/versions/${firstId}`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    expect(responseRecord(old.contract).version).toMatchObject({
      decisionState: 'APPROVED',
      decision: approved,
      supersededByVersionId: successorId,
      representation: responseRecord(first.version).representation,
    });
    await invoke(
      `/contract-models/consulting-ro/versions/${intent.modelVersionId}/withdrawal`,
      {
        versionNumber: 1,
        expectedModelRevision: 2,
        reason: 'Stop future use; copied Contract Versions remain intact',
      },
    );
    expect(
      await command('/from-approved-model', intent, 'first-model-contract'),
    ).toEqual(first);
    expect(
      await command(
        '/versions/from-approved-model',
        successorIntent,
        'successor-model-contract',
      ),
    ).toEqual(successor);
    const current = responseRecord(
      await fixture.read({
        path,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    expect(responseRecord(current.contract).version).toEqual(successor.version);
  });
  it('lists a bounded identifier-only history and opens exact copied Versions independently', async () => {
    const { source, path, intent, invoke } =
      await prepareModelContractSource(fixture);
    const first = responseRecord(
        await invoke(path + '/from-approved-model', intent),
      ),
      firstId = responseString(responseRecord(first.version), 'id');
    const second = responseRecord(
        await invoke(path + '/versions/from-approved-model', {
          ...intent,
          expectedContractRevision: 1,
          clientDetails: 'Explicit complete successor',
        }),
      ),
      secondId = responseString(responseRecord(second.version), 'id');
    const head = responseRecord(
      await fixture.read({
        path: path + '/versions?limit=1',
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    expect(head).toEqual({
      items: [
        { id: secondId, versionNumber: 2, provenance: 'COMPANY_MODEL_OFFER' },
      ],
      nextCursor: secondId,
    });
    expect(
      await fixture.read({
        path: `${path}/versions?limit=1&cursor=${secondId}`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    ).toEqual({
      items: [
        { id: firstId, versionNumber: 1, provenance: 'COMPANY_MODEL_OFFER' },
      ],
      nextCursor: null,
    });
    const exact = responseRecord(
      responseRecord(
        await fixture.read({
          path: path + '/versions/' + firstId,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
        }),
      ).contract,
    );
    expect(responseRecord(exact.version).representation).toEqual(
      responseRecord(first.version).representation,
    );
  });

  it('refuses legacy revision, simulated signing, Addenda and Project continuation for the new unexecuted mode', async () => {
    const { source, path, intent, invoke } =
      await prepareModelContractSource(fixture);
    const created = responseRecord(
      await invoke(`${path}/from-approved-model`, intent),
    );
    const contractId = responseString(created, 'id'),
      versionId = responseString(responseRecord(created.version), 'id');
    await invoke(`${path}/versions/${versionId}/approve`, {
      expectedContractRevision: 1,
      acknowledgedWarningCodes: [
        'MODEL_WORDING_REVIEWED',
        'ANNEX_SCOPE_REVIEWED',
      ],
      reviewBasis: 'Internal readiness only, no acceptance or signing',
    });
    for (const suffix of [
      `/versions/${versionId}/signature`,
      `/agreements/${contractId}/addenda`,
    ]) {
      const response = await fixture.post({
        path: path + suffix,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {},
      });
      expect({
        status: response.status,
        body: await response.json(),
      }).toMatchObject({
        status: 409,
        body: { code: 'CONTRACT_EXECUTION_MODE_UNSUPPORTED' },
      });
    }
    const candidates = await fixture.request({
      path: `${path}/project-candidates`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
    });
    expect({
      status: candidates.status,
      body: await candidates.json(),
    }).toMatchObject({
      status: 409,
      body: { code: 'CONTRACT_EXECUTION_MODE_UNSUPPORTED' },
    });
    const revision = await fixture.post({
      path: `${path}/versions`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: {
        expectedContractRevision: 2,
        termStartsOn: null,
        termEndsOn: null,
        specialConditions: null,
      },
    });
    expect({
      status: revision.status,
      body: await revision.json(),
    }).toMatchObject({
      status: 409,
      body: { code: 'CONTRACT_MODEL_SOURCE_REQUIRED' },
    });
    const current = responseRecord(
      await fixture.read({
        path,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    expect(responseRecord(current.contract)).toMatchObject({
      revision: 2,
      addenda: [],
      linkedProjects: [],
      version: {
        id: versionId,
        executionState: 'NOT_EXECUTED',
        decisionState: 'APPROVED',
        signature: null,
      },
    });
  });
});
