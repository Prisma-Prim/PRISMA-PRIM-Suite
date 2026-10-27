import {
  ESTIMATE_OFFER_PREPARER,
  responseRecord,
  responseString,
  type openEstimateOfferFixture,
} from '../offer/offer-estimate-preparation.test-support.js';
import { prepareLegacyQueueScope } from './contract-decision-queue.test-support.js';

export async function prepareContractMissionPlan(
  fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>,
) {
  const ready = await prepareLegacyQueueScope(fixture, 'v1');
  const contract = await ready.direct();
  const path = `/contracts/opportunities/${ready.source.opportunityId}`;
  const versionId = responseString(responseRecord(contract.version), 'id');
  await ready.invoke(`${path}/versions/${versionId}/approve`, {
    expectedContractRevision: 1,
    acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'],
  });
  await ready.invoke(`${path}/versions/${versionId}/signature`, {
    expectedContractRevision: 2,
    providerSignatoryLabel: 'Synthetic provider',
    clientSignatoryLabel: 'Synthetic Client',
    providerSignedOn: '2026-10-24',
    clientSignedOn: '2026-10-24',
    note: null,
    acknowledgedWarningCodes: [],
  });
  const source = await publishContractMissionPlan({
    fixture,
    companyId: ready.source.companyId,
    membershipId: ready.source.preparerMembershipId,
  });

  const target = {
    headers: ESTIMATE_OFFER_PREPARER,
    companyId: ready.source.companyId,
  };
  const body = {
    title: '  Synthetic configured Contract mission  ',
    expectedContractRevision: 3,
    acknowledgedCandidateProjectIds: [],
    missionPlan: {
      planId: responseString(source, 'planId'),
      versionId: responseString(source, 'id'),
      versionNumber: 1,
    },
  };
  const create = (payload: unknown = body, key = 'configured-mission') =>
    fixture.post({
      ...target,
      path: path + '/projects/create-from-mission-plan',
      body: payload,
      key,
    });
  return { ready, contract, path, source, target, body, create };
}

/** Supplement public REST assertions with exact persisted atomicity/fence evidence. */
export async function contractMissionEffects(
  fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>,
) {
  return (
    await fixture.pool.query(`SELECT
    (SELECT count(*)::int FROM projects) projects,
    (SELECT count(*)::int FROM tasks) tasks,
    (SELECT count(*)::int FROM mission_plan_instances) instances,
    (SELECT count(*)::int FROM mission_plan_task_copies) copies,
    (SELECT count(*)::int FROM project_creation_events) project_events,
    (SELECT count(*)::int FROM task_events) task_events,
    (SELECT count(*)::int FROM contract_project_links) links,
    (SELECT count(*)::int FROM contract_events) contract_events,
    (SELECT count(*)::int FROM contract_commands) receipts,
    (SELECT count(*)::int FROM activity_log_events) activity,
    (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM client_accounts c) clients,
    (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM contracts c) contracts`)
  ).rows;
}

export async function publishContractMissionPlan({
  fixture,
  companyId,
  membershipId,
}: {
  fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  companyId: string;
  membershipId: string;
}) {
  for (const grant of [
    '/company-project-assignments',
    '/company-task-manager-assignments',
    '/company-mission-plan-configuration-assignments',
    '/company-mission-plan-user-assignments',
  ])
    await fixture.grant({
      path: grant,
      companyId: companyId,
      membershipId: membershipId,
    });
  const published = responseRecord(
    await fixture.command({
      headers: ESTIMATE_OFFER_PREPARER,
      companyId,
      path: '/mission-plans',
      body: {
        title: 'Synthetic Contract consulting plan',
        activities: [
          {
            key: '00000000-0000-4000-8000-000000000925',
            title: 'Review the initial situation',
            activity: ' Literal review\n🌍 ',
            intendedResult: 'Initial situation recorded',
          },
          {
            key: '00000000-0000-4000-8000-000000000926',
            title: 'Prepare the agreed work',
            activity: 'Prepare synthetic work',
            intendedResult: 'Agreed work is ready for human review',
          },
        ],
      },
    }),
  );
  const source = responseRecord(published.version);

  return source;
}
