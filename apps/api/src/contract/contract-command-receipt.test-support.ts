import { expect } from 'vitest';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_WORKSPACE,
  type openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';

export type ReceiptFixture = Awaited<
  ReturnType<typeof openEstimateOfferFixture>
>;
export type ReceiptCommandKind =
  'APPROVE' | 'RECORD_SIGNATURE' | 'CREATE_VERSION' | 'RUN_QUALITY_CHECKS';

export async function prepareReceiptScope(
  fixture: ReceiptFixture,
  input: Parameters<ReceiptFixture['prepare']>[0] = {},
) {
  const source = await fixture.prepare(input);
  for (const path of [
    '/company-contract-preparer-assignments',
    '/company-contract-approver-assignments',
  ])
    await fixture.grant({
      path,
      companyId: source.companyId,
      membershipId: source.preparerMembershipId,
    });
  const snapshot = await fixture.illustrativeSnapshot(source);
  let nextClient = 0;
  async function target(kind: ReceiptCommandKind) {
    // Every target has its own original Client, Opportunity and Contract. Shared
    // Client/Opportunity/Contract locks must not stand in for the receipt mutex.
    const ordinal = ++nextClient;
    const client = responseRecord(
      await fixture.command({
        headers: ESTIMATE_OFFER_PREPARER,
        companyId: source.companyId,
        path: '/clients',
        body: {
          displayName: `Independent receipt party ${ordinal}`,
          taxId: `RECEIPT-${source.companyId}-${ordinal}`,
          address: `${ordinal} Receipt Street`,
        },
      }),
    );
    const clientId = responseString(client, 'id');
    const request = responseRecord(
      await fixture.command({
        headers: ESTIMATE_OFFER_PREPARER,
        companyId: source.companyId,
        path: '/commercial-intake/requests',
        body: {
          clientAccountId: clientId,
          subject: `Independent receipt case ${ordinal}`,
          originalText: 'Synthetic receipt concurrency proof',
          opportunity: {
            title: `Receipt case ${ordinal}`,
            nextAction: 'Review the exact Contract',
          },
        },
      }),
    );
    const opportunityId = responseString(
      responseRecord(request.initialOpportunity),
      'id',
    );
    const price = responseRecord(
      await fixture.command({
        headers: ESTIMATE_OFFER_PREPARER,
        companyId: source.companyId,
        path: `/pricing/opportunities/${opportunityId}/snapshots`,
        body: {
          pricingRuleVersionNumber: snapshot.catalogue.ruleVersionNumber,
          lines: [
            {
              offeringId: snapshot.catalogue.offeringId,
              tariffVersionNumber: snapshot.catalogue.tariffVersionNumber,
              quantity: '1',
            },
          ],
        },
      }),
    );
    const snapshotId = responseString(price, 'id');
    const base = `/contracts/opportunities/${opportunityId}`;
    const contract = responseRecord(
      await fixture.command({
        headers: ESTIMATE_OFFER_PREPARER,
        companyId: source.companyId,
        path: base + '/direct',
        body: {
          pricingSnapshotId: snapshotId,
          recipient: { kind: 'PRIMARY' },
          directReason: 'Synthetic independent receipt proof',
          scopeNote: 'Synthetic literal scope',
        },
      }),
    );
    const contractId = responseString(contract, 'id');
    const versionId = responseString(responseRecord(contract.version), 'id');
    const versionBase = `${base}/versions/${versionId}`;
    const approval = {
      expectedContractRevision: 1,
      acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'],
    };
    if (kind === 'RECORD_SIGNATURE')
      await fixture.command({
        headers: ESTIMATE_OFFER_PREPARER,
        companyId: source.companyId,
        path: versionBase + '/approve',
        body: approval,
      });
    const commands = {
      APPROVE: { path: versionBase + '/approve', body: approval },
      RECORD_SIGNATURE: {
        path: versionBase + '/signature',
        body: {
          expectedContractRevision: 2,
          providerSignatoryLabel: 'Synthetic provider',
          clientSignatoryLabel: 'Synthetic Client',
          providerSignedOn: '2026-10-24',
          clientSignedOn: '2026-10-24',
          note: null,
          acknowledgedWarningCodes: [],
        },
      },
      CREATE_VERSION: {
        path: base + '/versions',
        body: {
          expectedContractRevision: 1,
          pricingSnapshotId: snapshotId,
          scopeNote: 'Synthetic successor scope',
        },
      },
      RUN_QUALITY_CHECKS: { path: versionBase + '/quality-checks', body: {} },
    } satisfies Record<ReceiptCommandKind, { path: string; body: unknown }>;
    const command = commands[kind];
    const send = (
      key: string,
      body: unknown = command.body,
      headers = ESTIMATE_OFFER_PREPARER,
    ) =>
      fixture.post({
        headers,
        companyId: source.companyId,
        path: command.path,
        body,
        key,
      });
    return {
      kind,
      clientId,
      opportunityId,
      contractId,
      versionId,
      snapshotId,
      base,
      command,
      send,
    };
  }
  return { source, target };
}

export async function receiptEffects(fixture: ReceiptFixture) {
  return (
    await fixture.pool.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contracts t) contracts,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_versions t) versions,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_quality_runs t) quality,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_decisions t) decisions,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_signatures t) signatures,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_commands t) receipts,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_events t) events,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM activity_log_events t) activity,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM client_accounts t) clients,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM client_company_relationships t) relationships`)
  ).rows;
}

export async function receiptTargetEffects(
  fixture: ReceiptFixture,
  target: { contractId: string; clientId: string },
) {
  return (
    await fixture.pool.query(
      `SELECT
      (SELECT to_jsonb(t) FROM contracts t WHERE id=$1) contract,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_versions t WHERE contract_id=$1) versions,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_quality_runs t WHERE contract_id=$1) quality,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_decisions t WHERE contract_id=$1) decisions,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_signatures t WHERE contract_id=$1) signatures,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_commands t WHERE result_contract_id=$1) receipts,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM contract_events t WHERE contract_id=$1) events,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM activity_log_events t WHERE metadata->>'contractId'=$1::text) activity,
      (SELECT to_jsonb(t) FROM client_accounts t WHERE id=$2) client,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM client_company_relationships t WHERE client_account_id=$2) relationships`,
      [target.contractId, target.clientId],
    )
  ).rows;
}

export async function receiptCounts(fixture: ReceiptFixture) {
  const result = await fixture.pool.query<{
    receipts: number;
    events: number;
    quality: number;
    decisions: number;
    signatures: number;
    versions: number;
    revisions: number;
  }>(`SELECT
    (SELECT count(*)::int FROM contract_commands) receipts,
    (SELECT count(*)::int FROM contract_events) events,
    (SELECT count(*)::int FROM contract_quality_runs) quality,
    (SELECT count(*)::int FROM contract_decisions) decisions,
    (SELECT count(*)::int FROM contract_signatures) signatures,
    (SELECT count(*)::int FROM contract_versions) versions,
    (SELECT sum(revision)::int FROM contracts) revisions`);
  const counts = result.rows[0];
  if (!counts) throw new Error('Missing receipt effect counts.');
  return counts;
}

export async function waitForReceiptBarrier(fixture: ReceiptFixture) {
  return observeLock(
    fixture,
    `SELECT pid FROM pg_locks
    WHERE locktype='advisory' AND classid=914979 AND objid=1
      AND objsubid=2 AND NOT granted`,
  );
}

export async function waitForReceiptKey(
  fixture: ReceiptFixture,
  input: {
    companyId: string;
    membershipId: string;
    key: string;
    holderPid: number;
  },
) {
  // Assert the actual single-bigint advisory edge, including the specified
  // colon spelling and seed. A generic blocker or timing assertion cannot prove it.
  return observeLock(
    fixture,
    `WITH expected AS (SELECT hashtextextended($1,0) AS key)
     SELECT waiting.pid FROM pg_locks waiting
     JOIN pg_locks held ON held.locktype=waiting.locktype
       AND held.database=waiting.database AND held.classid=waiting.classid
       AND held.objid=waiting.objid AND held.objsubid=waiting.objsubid
     CROSS JOIN expected
     WHERE waiting.locktype='advisory' AND NOT waiting.granted
       AND held.granted AND held.pid=$2 AND waiting.pid<>held.pid
       AND waiting.objsubid=1
       AND waiting.classid=((expected.key >> 32) & 4294967295)::oid
       AND waiting.objid=(expected.key & 4294967295)::oid`,
    [
      `${ESTIMATE_OFFER_WORKSPACE}:${input.companyId}:${input.membershipId}:${input.key}`,
      input.holderPid,
    ],
  );
}

async function observeLock(
  fixture: ReceiptFixture,
  query: string,
  values: unknown[] = [],
) {
  const deadline = Date.now() + 3000;
  do {
    const result = await fixture.pool.query<{ pid: number }>(query, values);
    const row = result.rows[0];
    if (row) return row.pid;
    await new Promise<void>((resolve) => setImmediate(resolve));
  } while (Date.now() < deadline);
  const waiting = await fixture.pool.query(`SELECT a.pid,a.query,a.wait_event,
    pg_blocking_pids(a.pid) blockers FROM pg_stat_activity a
    WHERE a.datname=current_database() AND a.wait_event_type='Lock'`);
  throw new Error(
    'Expected exact PostgreSQL receipt advisory wait edge was not observed: ' +
      JSON.stringify(waiting.rows),
  );
}

export async function expectReceiptConflict(
  response: Response,
  kind: ReceiptCommandKind = 'APPROVE',
) {
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    code: 'IDEMPOTENCY_CONFLICT',
    ...(kind === 'CREATE_VERSION'
      ? {}
      : { message: 'Idempotency-Key was used for another Contract command.' }),
  });
}
