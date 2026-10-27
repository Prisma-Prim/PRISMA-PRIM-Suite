import { expect } from 'vitest';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  ESTIMATE_OFFER_WORKSPACE,
  type openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';

type Fixture = Awaited<ReturnType<typeof openEstimateOfferFixture>>;
export async function grantQueueReader(
  fixture: Fixture,
  source: {
    companyId: string;
    readerMembershipId: string;
  },
  version: 'v1' | 'v2' = 'v2',
) {
  if (version === 'v1') {
    // A genuine old capture; the public grant must retain rather than upgrade it.
    await fixture.pool.query(
      'INSERT INTO company_role_assignments(workspace_id,company_id,workspace_membership_id,bundle,permission_set_version) VALUES($1,$2,$3,$4,$5)',
      [
        ESTIMATE_OFFER_WORKSPACE,
        source.companyId,
        source.readerMembershipId,
        'company_contract_approver',
        'v1',
      ],
    );
  }
  expect(
    await fixture.grant({
      path: '/company-contract-approver-assignments',
      companyId: source.companyId,
      membershipId: source.readerMembershipId,
    }),
  ).toMatchObject({ active: true, permissionSetVersion: version });
}

export async function prepareLegacyQueueScope(
  fixture: Fixture,
  readerVersion: 'v1' | 'v2' = 'v2',
) {
  const source = await fixture.prepare();
  for (const path of [
    '/company-contract-preparer-assignments',
    '/company-contract-approver-assignments',
  ])
    await fixture.grant({
      path,
      companyId: source.companyId,
      membershipId: source.preparerMembershipId,
    });
  await grantQueueReader(fixture, source, readerVersion);
  const snapshot = await fixture.illustrativeSnapshot(source);
  const invoke = (
    path: string,
    body: unknown,
    headers = ESTIMATE_OFFER_PREPARER,
  ) => fixture.command({ path, body, headers, companyId: source.companyId });
  async function newOpportunity(title: string) {
    const request = responseRecord(
      await invoke('/commercial-intake/requests', {
        clientAccountId: source.clientId,
        subject: title,
        originalText: 'Synthetic Contract queue proof',
        opportunity: { title, nextAction: 'Review the exact agreement' },
      }),
    );
    const opportunityId = responseString(
      responseRecord(request.initialOpportunity),
      'id',
    );
    const nextSnapshot = responseRecord(
      await invoke(`/pricing/opportunities/${opportunityId}/snapshots`, {
        pricingRuleVersionNumber: snapshot.catalogue.ruleVersionNumber,
        lines: [
          {
            offeringId: snapshot.catalogue.offeringId,
            tariffVersionNumber: snapshot.catalogue.tariffVersionNumber,
            quantity: '1',
          },
        ],
      }),
    );
    return { opportunityId, snapshotId: responseString(nextSnapshot, 'id') };
  }
  const initial = {
    opportunityId: source.opportunityId,
    snapshotId: responseString(snapshot, 'id'),
  };
  async function direct(target = initial) {
    return responseRecord(
      await invoke(`/contracts/opportunities/${target.opportunityId}/direct`, {
        pricingSnapshotId: target.snapshotId,
        recipient: { kind: 'PRIMARY' },
        directReason: 'Synthetic direct queue case',
        scopeNote: 'Synthetic frozen consulting scope',
      }),
    );
  }
  async function offer(target: typeof initial, accepted: boolean) {
    const path = `/offers/opportunities/${target.opportunityId}`;
    const created = responseRecord(
      await invoke(path, {
        pricingSnapshotId: target.snapshotId,
        recipient: { kind: 'PRIMARY' },
        validityDays: 30,
        scopeNote: 'Synthetic legacy scope',
        commercialConditions: null,
      }),
    );
    const versionId = responseString(responseRecord(created.version), 'id'),
      base = path + '/versions/' + versionId;
    await invoke(
      base + '/approve',
      { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
      ESTIMATE_OFFER_READER,
    );
    await invoke(
      base + '/transmission',
      { expectedOfferRevision: 2, acknowledgedWarningCodes: [], note: null },
      ESTIMATE_OFFER_PREPARER,
    );
    if (accepted)
      await invoke(
        base + '/client-response',
        {
          expectedOfferRevision: 3,
          outcome: 'ACCEPTED',
          receivedAt: '2026-10-24T09:00:00.000Z',
        },
        ESTIMATE_OFFER_READER,
      );
    return versionId;
  }
  return { source, initial, invoke, newOpportunity, direct, offer };
}

export async function prepareAllLegacyQueueKinds(fixture: Fixture) {
  const ready = await prepareLegacyQueueScope(fixture, 'v1');
  const parent = await ready.direct();
  const parentId = responseString(parent, 'id'),
    parentVersionId = responseString(responseRecord(parent.version), 'id');
  const base = `/contracts/opportunities/${ready.initial.opportunityId}`;
  await ready.invoke(`${base}/versions/${parentVersionId}/approve`, {
    expectedContractRevision: 1,
    acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'],
  });
  await ready.invoke(`${base}/versions/${parentVersionId}/signature`, {
    expectedContractRevision: 2,
    providerSignatoryLabel: 'Synthetic provider',
    clientSignatoryLabel: 'Synthetic Client',
    providerSignedOn: '2026-10-24',
    clientSignedOn: '2026-10-24',
    note: null,
    acknowledgedWarningCodes: [],
  });
  const addendum = responseRecord(
    await ready.invoke(`${base}/agreements/${parentId}/addenda`, {
      expectedContractRevision: 3,
      changeSummary: 'Synthetic intended amendment',
    }),
  );
  const direct = await ready.direct(
    await ready.newOpportunity('Pending direct Contract'),
  );
  const preliminary = await ready.newOpportunity('Pending Precontract');
  const acceptedOfferVersionId = await ready.offer(preliminary, true);
  const precontract = responseRecord(
    await ready.invoke(
      `/contracts/opportunities/${preliminary.opportunityId}`,
      {
        acceptedOfferVersionId,
        kind: 'PRECONTRACT',
        preliminaryWorkScope: 'Synthetic preliminary scope',
        preliminaryFinancialConditions: 'Synthetic bounded costs',
        preliminaryLimits: 'Synthetic temporary limits',
        termEndsOn: '2026-12-31',
      },
    ),
  );
  const early = await ready.newOpportunity('Pending early Contract');
  const sourceOfferVersionId = await ready.offer(early, false);
  await fixture.grant({
    path: '/company-contract-early-preparation-assignments',
    companyId: ready.source.companyId,
    membershipId: ready.source.preparerMembershipId,
  });
  const preparation = responseRecord(
    await ready.invoke(
      `/contracts/opportunities/${early.opportunityId}/preparation`,
      { sourceOfferVersionId },
    ),
  );
  return {
    ...ready,
    parent,
    pending: [addendum, direct, precontract, preparation],
  };
}

export function queueItems(value: unknown) {
  const items = responseRecord(value).items;
  if (!Array.isArray(items)) throw new Error('Expected a public queue page');
  return items.map((item: unknown) => responseRecord(item));
}
