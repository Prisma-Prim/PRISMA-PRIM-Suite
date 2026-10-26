import type { Pool, PoolClient } from 'pg';
import { Logger } from '@nestjs/common';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AccountabilityService } from '../accountability/accountability.service.js';
import * as profitabilityResponse from './profitability-estimate.persistence.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

// All identities, labels, costs and prices in this proof are synthetic.
const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000498';
const OWNER = memberHeaders('profitability-owner');
const CONTRIBUTOR = memberHeaders('profitability-contributor');
const DIRECTOR = memberHeaders('profitability-director');
const CONTRIBUTOR_ASSIGNMENTS =
  '/company-profitability-contributor-assignments';
const DIRECTOR_ASSIGNMENTS = '/company-profitability-director-assignments';
const INTAKE_ASSIGNMENTS = '/company-commercial-intake-assignments';

interface Fixture {
  companyId: string;
  opportunityId: string;
  requestId: string;
  contributorMembershipId: string;
  directorMembershipId: string;
}

interface HeldTransaction {
  connection: PoolClient;
  backendPid: number;
  released: boolean;
}

withPostgres('Confirmed-cost Profitability Estimates REST', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let origin: string;
  let pool: Pool;
  let activeWorkspaceId = WORKSPACE_ID;
  let rejectClock = false;

  async function openHarness(workspaceId = WORKSPACE_ID): Promise<void> {
    activeWorkspaceId = workspaceId;
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      serverClock: {
        now: () => {
          if (rejectClock)
            throw new Error('Synthetic response construction failure');
          return new Date('2026-10-01T12:00:00.000Z');
        },
      },
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'profitability-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Synthetic Profitability Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'profitability-contributor',
            workspaceId,
          },
          {
            provider: 'deterministic-test',
            subject: 'profitability-director',
            workspaceId,
          },
        ]),
      },
    });
    ({ origin, pool } = harness);
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'profitability_estimates',
    });
    await openHarness();
  });

  beforeEach(async () => {
    rejectClock = false;
    await pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });

  it('discovers the exact undecided Version in the Company Director queue', async () => {
    const fixture = await prepared();
    const version = record(
      await submit(fixture, completeSubmission(), 'queue-first'),
    );
    const page = await read({
      path: '/profitability-estimate-decision-queue',
      companyId: fixture.companyId,
      headers: DIRECTOR,
    });
    expect(page).toMatchObject({
      items: [
        {
          versionId: stringField(version, 'id'),
          versionNumber: 1,
          opportunityId: fixture.opportunityId,
        },
      ],
    });
  });

  it('keeps earlier undecided Versions after a successor decision and never writes on discovery', async () => {
    const f = await prepared({ withClient: true });
    const a = record(await submit(f, completeSubmission(), 'queue-old'));
    const b = record(
      await submit(
        f,
        { ...completeSubmission(), expectedLatestVersionNumber: 1 },
        'queue-head',
      ),
    );
    await decide(f, stringField(b, 'id'), 2, 'APPROVE', 'queue-head-approve');
    const before = await pool.query(
      'SELECT count(*)::int AS n FROM activity_log_events',
    );
    const page = record(
      await read({
        path: '/profitability-estimate-decision-queue',
        companyId: f.companyId,
        headers: DIRECTOR,
      }),
    );
    expect(items(page)).toEqual([
      {
        workspaceId: WORKSPACE_ID,
        companyId: f.companyId,
        estimateId: stringField(a, 'estimateId'),
        versionId: stringField(a, 'id'),
        clientRequestId: f.requestId,
        opportunityId: f.opportunityId,
        versionNumber: 1,
        latestVersionNumber: 2,
        createdAt: '2026-10-01T12:00:00.000Z',
        opportunityTitle: 'Synthetic Opportunity',
      },
    ]);
    expect(
      await pool.query('SELECT count(*)::int AS n FROM activity_log_events'),
    ).toEqual(before);
    await decide(f, stringField(a, 'id'), 1, 'MODIFY', 'queue-old-modify');
    expect(
      await read({
        path: '/profitability-estimate-decision-queue',
        companyId: f.companyId,
        headers: DIRECTOR,
      }),
    ).toEqual({ items: [] });
    expect(await exact(f, stringField(a, 'id'))).toMatchObject({
      decision: { code: 'MODIFY' },
    });
  });

  it('reaches all tied-date pending Versions and preserves a cursor after its anchor is decided', async () => {
    const f = await prepared();
    const versions: string[] = [];
    for (let n = 1; n <= 27; n++)
      versions.push(
        stringField(
          record(
            await submit(
              f,
              {
                ...completeSubmission(),
                expectedLatestVersionNumber: n === 1 ? null : n - 1,
              },
              `queue-${n}`,
            ),
          ),
          'id',
        ),
      );
    const first = record(
      await read({
        path: '/profitability-estimate-decision-queue',
        companyId: f.companyId,
        headers: DIRECTOR,
      }),
    );
    const sorted = [...versions].sort();
    expect(
      items(first).map((v) => stringField(record(v), 'versionId')),
    ).toEqual(sorted.slice(0, 25));
    const cursor = stringField(first, 'nextCursor');
    const anchor = record(items(first)[24]);
    await decide(
      f,
      stringField(anchor, 'versionId'),
      numberField(anchor, 'versionNumber'),
      'REJECT',
      'queue-anchor-reject',
    );
    const last = record(
      await read({
        path: `/profitability-estimate-decision-queue?cursor=${cursor}`,
        companyId: f.companyId,
        headers: DIRECTOR,
      }),
    );
    expect(items(last).map((v) => stringField(record(v), 'versionId'))).toEqual(
      sorted.slice(25),
    );
    expect(last.nextCursor).toBeUndefined();
    const other = await prepared();
    expect(
      (
        await request({
          path: `/profitability-estimate-decision-queue?cursor=${cursor}`,
          companyId: other.companyId,
          headers: DIRECTOR,
        })
      ).status,
    ).toBe(400);
    expect(
      await read({
        path: '/profitability-estimate-decision-queue',
        companyId: other.companyId,
        headers: DIRECTOR,
      }),
    ).toEqual({ items: [] });
  });

  it('refuses malformed, repeated, extra and unsupported queue inputs without economics', async () => {
    const f = await prepared();
    for (const query of [
      '?cursor=bad',
      '?cursor=',
      '?cursor=one&cursor=two',
      '?limit=25',
      '?companyId=other',
      '?cursor=' +
        Buffer.from(
          JSON.stringify({
            workspaceId: WORKSPACE_ID,
            companyId: f.companyId,
            createdAt: '2026-02-31T12:00:00.000000Z',
            versionId: crypto.randomUUID(),
          }),
        ).toString('base64url'),
    ]) {
      const result = await request({
        path: '/profitability-estimate-decision-queue' + query,
        companyId: f.companyId,
        headers: DIRECTOR,
      });
      expect(result.status).toBe(400);
      expect(JSON.stringify(await result.json())).not.toContain('125.00');
    }
  });

  it('requires current Director and independent Intake grants even for an empty queue', async () => {
    const f = await prepared();
    for (const headers of [OWNER, CONTRIBUTOR])
      expect(
        (
          await request({
            path: '/profitability-estimate-decision-queue',
            companyId: f.companyId,
            headers,
          })
        ).status,
      ).toBe(403);
    await revoke(INTAKE_ASSIGNMENTS, f.companyId, f.directorMembershipId);
    expect(
      (
        await request({
          path: '/profitability-estimate-decision-queue',
          companyId: f.companyId,
          headers: DIRECTOR,
        })
      ).status,
    ).toBe(403);
    await grant(INTAKE_ASSIGNMENTS, f.companyId, f.directorMembershipId);
    await expect(
      pool.query(
        "UPDATE company_role_assignments SET permission_set_version='future' WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_profitability_director'",
        [f.companyId, f.directorMembershipId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await revoke(DIRECTOR_ASSIGNMENTS, f.companyId, f.directorMembershipId);
    expect(
      (
        await request({
          path: '/profitability-estimate-decision-queue',
          companyId: f.companyId,
          headers: DIRECTOR,
        })
      ).status,
    ).toBe(403);
  });

  it('keeps one exact decision when two authorized Directors race from the same queue target', async () => {
    const f = await prepared();
    await grant(DIRECTOR_ASSIGNMENTS, f.companyId, f.contributorMembershipId);
    const version = record(
      await submit(f, completeSubmission(), 'queue-race-version'),
    );
    const id = stringField(version, 'id'),
      path = `${versionPath(f.opportunityId, id)}/decision`;
    const options = [
      {
        path,
        companyId: f.companyId,
        headers: DIRECTOR,
        key: 'queue-race-director',
        body: decisionBody(1, 'APPROVE'),
      },
      {
        path,
        companyId: f.companyId,
        headers: CONTRIBUTOR,
        key: 'queue-race-contributor',
        body: decisionBody(1, 'REJECT'),
      },
    ];
    const observed = record(
      await read({
        path: '/profitability-estimate-decision-queue',
        companyId: f.companyId,
        headers: DIRECTOR,
      }),
    );
    expect(items(observed)).toHaveLength(1);
    const responses = await Promise.all(options.map((option) => post(option)));
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const winner = responses.findIndex((response) => response.status === 201),
      option = options[winner];
    if (!option) throw new Error('No winning exact command');
    const response = responses[winner];
    if (!response) throw new Error('No winning response');
    const committed: unknown = await response.json();
    expect(await command(option)).toEqual(committed);
    expect(
      await read({
        path: '/profitability-estimate-decision-queue',
        companyId: f.companyId,
        headers: DIRECTOR,
      }),
    ).toEqual({ items: [] });
    expect(await exact(f, id)).toEqual(committed);
  });

  it('explicitly grants preparation, submits complete costs and reloads the exact frozen deterministic result', async () => {
    const fixture = await prepared();
    const body = completeSubmission();
    const created = await command({
      path: estimatesPath(fixture.opportunityId),
      body,
      key: 'first-complete-version',
      companyId: fixture.companyId,
      headers: CONTRIBUTOR,
    });
    const versionId = stringField(record(created), 'id');
    const inputs = Object.fromEntries(
      Object.entries(body).filter(
        ([key]) => key !== 'expectedLatestVersionNumber',
      ),
    );
    expect(created).toMatchObject({
      companyId: fixture.companyId,
      opportunityId: fixture.opportunityId,
      clientRequestId: fixture.requestId,
      versionNumber: 1,
      predecessorVersionId: null,
      inputs,
      results: {
        totalCost: '100.00',
        profit: '25.00',
        profitabilityPercent: '20.00',
        targetDifferencePercentagePoints: '0.00',
      },
      calculationRule: {
        id: 'CONFIRMED_COST_PROFITABILITY',
        version: 1,
        monetaryScale: 2,
        percentageScale: 2,
        rounding: 'HALF_UP',
      },
      createdByWorkspaceMembershipId: fixture.contributorMembershipId,
      createdAt: '2026-10-01T12:00:00.000Z',
      decision: null,
    });
    expect(
      await read({
        path: versionPath(fixture.opportunityId, versionId),
        companyId: fixture.companyId,
        headers: CONTRIBUTOR,
      }),
    ).toEqual(created);
    expect(
      await read({
        path: estimatesPath(fixture.opportunityId),
        companyId: fixture.companyId,
        headers: CONTRIBUTOR,
      }),
    ).toEqual({ items: [created], latestVersionNumber: 1 });
  });

  it('keeps an existing illustrative Snapshot and Offer unchanged through estimate decisions, correction, replay and later pricing configuration', async () => {
    const fixture = await prepared({ withClient: true });
    for (const path of [
      '/company-service-catalogue-assignments',
      '/company-pricing-configuration-assignments',
      '/company-pricing-user-assignments',
      '/company-offer-preparer-assignments',
    ])
      await grant(path, fixture.companyId, fixture.contributorMembershipId);
    const configure = (path: string, body: unknown, key: string) =>
      command({
        path,
        body,
        key,
        companyId: fixture.companyId,
        headers: CONTRIBUTOR,
      });
    const rule = record(
      record(
        await configure(
          '/pricing-configuration/rule-versions',
          {
            label: 'Synthetic illustrative rule',
            effectiveFrom: '2026-10-01T12:00:00.000Z',
            expectedActiveVersionNumber: null,
          },
          'compatibility-rule',
        ),
      ).version,
    );
    const definition = record(
      record(
        await configure(
          '/commercial-catalogue/service-definitions',
          {
            code: 'SYNTHETIC-498',
            name: 'Synthetic illustrative service',
            description: null,
          },
          'compatibility-definition',
        ),
      ).definition,
    );
    const offering = record(
      record(
        await configure(
          '/commercial-catalogue/offerings',
          {
            serviceDefinitionId: stringField(definition, 'id'),
            commercialLabel: null,
          },
          'compatibility-offering',
        ),
      ).offering,
    );
    const tariffPath = `/pricing-configuration/offerings/${stringField(offering, 'id')}/tariff-versions`;
    const tariffInput = {
      unit: 'illustrative-unit',
      unitAmount: '300.0000',
      currency: 'EUR',
      taxRatePercent: '15.00',
      taxLabel: 'Illustrative tax',
      effectiveFrom: '2026-10-01T12:00:00.000Z',
      expectedActiveVersionNumber: null,
    };
    const tariff = record(
      record(await configure(tariffPath, tariffInput, 'compatibility-tariff'))
        .version,
    );
    const snapshotPath = `/pricing/opportunities/${fixture.opportunityId}/snapshots`;
    const snapshot = record(
      await configure(
        snapshotPath,
        {
          pricingRuleVersionNumber: numberField(rule, 'versionNumber'),
          lines: [
            {
              offeringId: stringField(offering, 'id'),
              tariffVersionNumber: numberField(tariff, 'versionNumber'),
              quantity: '1',
            },
          ],
        },
        'compatibility-snapshot',
      ),
    );
    const offerPath = `/offers/opportunities/${fixture.opportunityId}`;
    await configure(
      offerPath,
      {
        pricingSnapshotId: stringField(snapshot, 'id'),
        recipient: { kind: 'PRIMARY' },
      },
      'compatibility-offer',
    );
    const inspect = (path: string) =>
      read({ path, companyId: fixture.companyId, headers: CONTRIBUTOR });
    const snapshotBefore = await inspect(
      `${snapshotPath}/${stringField(snapshot, 'id')}`,
    );
    const offerBefore = await inspect(offerPath);
    expect(snapshotBefore).toMatchObject({ total: '345.00' });
    const first = record(
      await submit(fixture, completeSubmission(), 'compatibility-estimate-v1'),
    );
    const approved = await decide(
      fixture,
      stringField(first, 'id'),
      1,
      'APPROVE',
      'compatibility-approve',
    );
    await submit(
      fixture,
      {
        ...completeSubmission(),
        expectedLatestVersionNumber: 1,
        proposedPrice: '150.00',
      },
      'compatibility-estimate-v2',
    );
    await configure(
      '/pricing-configuration/rule-versions',
      {
        label: 'Later synthetic illustrative rule',
        effectiveFrom: '2026-10-01T12:00:01.000Z',
        expectedActiveVersionNumber: 1,
      },
      'compatibility-rule-v2',
    );
    await configure(
      tariffPath,
      {
        ...tariffInput,
        unitAmount: '400.0000',
        effectiveFrom: '2026-10-01T12:00:01.000Z',
        expectedActiveVersionNumber: 1,
      },
      'compatibility-tariff-v2',
    );
    expect(await exact(fixture, stringField(first, 'id'))).toEqual(approved);
    expect(
      await submit(fixture, completeSubmission(), 'compatibility-estimate-v1'),
    ).toEqual(first);
    expect(
      await inspect(`${snapshotPath}/${stringField(snapshot, 'id')}`),
    ).toEqual(snapshotBefore);
    expect(await inspect(offerPath)).toEqual(offerBefore);
  });

  it('records MODIFY, appends a fresh confirmed correction, approves it and retains both exact-version decisions', async () => {
    const fixture = await prepared();
    const first = record(
      await submit(fixture, completeSubmission(), 'journey-v1'),
    );
    const firstId = stringField(first, 'id');
    const modified = await decide(
      fixture,
      firstId,
      1,
      'MODIFY',
      'journey-modify',
    );
    expect(modified).toMatchObject({
      ...first,
      decision: {
        code: 'MODIFY',
        decidedByWorkspaceMembershipId: fixture.directorMembershipId,
        decidedAt: '2026-10-01T12:00:00.000Z',
      },
    });
    const second = record(
      await submit(
        fixture,
        {
          ...completeSubmission(),
          expectedLatestVersionNumber: 1,
          executorCost: '80.00',
          proposedPrice: '150.00',
          pricingIntent: {
            kind: 'STRATEGIC',
            reason: ' Synthetic strategic reason ',
          },
        },
        'journey-v2',
      ),
    );
    expect(second).toMatchObject({
      estimateId: first.estimateId,
      versionNumber: 2,
      predecessorVersionId: firstId,
      inputs: {
        costConfirmation: true,
        proposedPrice: '150.00',
        executorCost: '80.00',
        pricingIntent: {
          kind: 'STRATEGIC',
          reason: ' Synthetic strategic reason ',
        },
      },
      results: {
        totalCost: '110.00',
        profit: '40.00',
        profitabilityPercent: '26.67',
        targetDifferencePercentagePoints: '6.67',
      },
      decision: null,
    });
    const approved = await decide(
      fixture,
      stringField(second, 'id'),
      2,
      'APPROVE',
      'journey-approve',
    );
    expect(approved).toMatchObject({
      ...second,
      decision: { code: 'APPROVE' },
    });
    expect(await history(fixture)).toEqual({
      items: [approved, modified],
      latestVersionNumber: 2,
    });
    expect(await exact(fixture, firstId)).toEqual(modified);
    expect(await exact(fixture, stringField(second, 'id'))).toEqual(approved);
    // Replays preserve their original command representation, including null
    // decision on submission, even after the head and Director state advance.
    expect(await submit(fixture, completeSubmission(), 'journey-v1')).toEqual(
      first,
    );
    expect(
      await decide(fixture, firstId, 1, 'MODIFY', 'journey-modify'),
    ).toEqual(modified);
  });

  it.each([
    ['197.99', '200.00', '1.00', '2.01', '1.01', '0.01'],
    ['197.99', '200.00', '1.01', '2.01', '1.01', '-0.01'],
    ['202.01', '200.00', '0', '-2.01', '-1.01', '-1.01'],
    ['125.00', '100.00', '20', '-25.00', '-25.00', '-45.00'],
    ['0.00', '1.00', '-1234.567890', '1.00', '100.00', '1334.57'],
    ['0.00', '1.00', '+200.12345', '1.00', '100.00', '-100.12'],
    [
      '900719925474099312345678901234567890.00',
      '900719925474099312345678901234567891.00',
      '0',
      '1.00',
      '0.00',
      '0.00',
    ],
  ])(
    'stores exact decimals and independent HALF_UP outputs: cost %s price %s target %s',
    async (cost, price, target, profit, percentage, difference) => {
      const fixture = await prepared();
      const created = await submit(
        fixture,
        {
          ...completeSubmission(),
          executorCost: cost,
          fiscalCost: '0.00',
          allocatedOverhead: '0.00',
          directCosts: [],
          proposedPrice: price,
          targetProfitability: target,
        },
        'arithmetic',
      );
      expect(created).toMatchObject({
        inputs: {
          executorCost: cost,
          proposedPrice: price,
          targetProfitability: target,
        },
        results: {
          totalCost: cost,
          profit,
          profitabilityPercent: percentage,
          targetDifferencePercentagePoints: difference,
        },
      });
      expect(await exact(fixture, stringField(record(created), 'id'))).toEqual(
        created,
      );
    },
  );

  it('accepts every source-backed executor and category and equal distinct cost lines without selecting formulas', async () => {
    const fixture = await prepared();
    let head: number | null = null;
    const categories = [
      'PATENT',
      'TRAVEL',
      'SUBCONTRACTOR',
      'TRANSLATION_MATERIAL_CONSUMABLE',
      'OTHER',
    ];
    for (const executorType of [
      'PATENT_CONSULTANT',
      'CIVIL_CONTRACT_FREELANCER',
      'DIRECTOR_OR_EMPLOYEE',
      'EXTERNAL_SUBCONTRACTOR',
    ]) {
      const created = record(
        await submit(
          fixture,
          {
            ...completeSubmission(),
            expectedLatestVersionNumber: head,
            executorType,
            executorCost: '0.00',
            fiscalCost: '0.00',
            allocatedOverhead: '0.00',
            directCosts: categories.map((category, index) => ({
              key: `separate-${index}`,
              category,
              label: 'Equal distinct synthetic cost',
              amount: '1.00',
              currency: 'EUR',
            })),
          },
          crypto.randomUUID(),
        ),
      );
      head = numberField(created, 'versionNumber');
      expect(created).toMatchObject({
        inputs: {
          executorType,
          directCosts: categories.map((category, index) => ({
            key: `separate-${index}`,
            category,
            amount: '1.00',
          })),
        },
        results: {
          totalCost: '5.00',
          profit: '120.00',
          profitabilityPercent: '96.00',
          targetDifferencePercentagePoints: '76.00',
        },
      });
    }
  });

  it('refuses invalid complete bundles atomically and leaves every failed key reusable', async () => {
    const fixture = await prepared();
    const valid = completeSubmission();
    const invalidBodies: unknown[] = [
      { ...valid, proposedPrice: undefined },
      { ...valid, proposedPrice: '0.00' },
      { ...valid, proposedPrice: '-1.00' },
      { ...valid, proposedPrice: '1.005' },
      { ...valid, proposedPrice: 125 },
      { ...valid, proposedPrice: '1e2' },
      { ...valid, proposedPrice: '125,00' },
      { ...valid, proposedPrice: '125.0' },
      { ...valid, executorCost: undefined },
      { ...valid, executorCost: '-1.00' },
      { ...valid, fiscalCost: undefined },
      { ...valid, allocatedOverhead: undefined },
      { ...valid, allocatedOverhead: '0.001' },
      { ...valid, costConfirmation: false },
      { ...valid, costConfirmation: undefined },
      { ...valid, targetProfitability: undefined },
      { ...valid, targetProfitability: 'NaN' },
      { ...valid, targetProfitability: 'Infinity' },
      { ...valid, targetProfitability: '1e2' },
      { ...valid, executorType: 'DIRECTOR' },
      { ...valid, currency: 'ZZZ' },
      { ...valid, expectedLatestVersionNumber: undefined },
      { ...valid, expectedLatestVersionNumber: 0 },
      { ...valid, expectedLatestVersionNumber: 1.5 },
      { ...valid, pricingIntent: { kind: 'STRATEGIC' } },
      { ...valid, pricingIntent: { kind: 'STRATEGIC', reason: '  ' } },
      {
        ...valid,
        pricingIntent: { kind: 'ORDINARY', reason: 'Unrequested reason' },
      },
      { ...valid, companyId: fixture.companyId },
      { ...valid, directCosts: [{ ...valid.directCosts[0], amount: '0.00' }] },
      { ...valid, directCosts: [{ ...valid.directCosts[0], label: '\t ' }] },
      {
        ...valid,
        directCosts: [{ ...valid.directCosts[0], category: 'UNSUPPORTED' }],
      },
      { ...valid, directCosts: [{ ...valid.directCosts[0], currency: 'USD' }] },
      { ...valid, directCosts: [valid.directCosts[0], valid.directCosts[0]] },
    ];
    for (const body of invalidBodies) {
      const response = await post({
        path: estimatesPath(fixture.opportunityId),
        companyId: fixture.companyId,
        headers: CONTRIBUTOR,
        body,
        key: 'reusable-invalid-key',
      });
      expect(response.status).toBe(400);
      expect(await history(fixture)).toEqual({
        items: [],
        latestVersionNumber: null,
      });
    }
    expect(await submit(fixture, valid, 'reusable-invalid-key')).toMatchObject({
      versionNumber: 1,
    });
  });

  it('replays durable historical receipts after restart and conflicts on every changed submitted field before stale validation', async () => {
    const fixture = await prepared();
    const body = completeSubmission();
    const original = await submit(fixture, body, 'durable-original');
    await submit(
      fixture,
      { ...body, expectedLatestVersionNumber: 1 },
      'deliberate-successor',
    );
    await harness.close();
    await openHarness();
    expect(await submit(fixture, body, 'durable-original')).toEqual(original);
    const changedBodies: unknown[] = [
      { ...body, expectedLatestVersionNumber: 2 },
      { ...body, currency: 'USD' },
      { ...body, executorType: 'DIRECTOR_OR_EMPLOYEE' },
      { ...body, executorCost: '70.01' },
      { ...body, fiscalCost: '10.01' },
      { ...body, allocatedOverhead: '10.01' },
      { ...body, targetProfitability: '20.0' },
      { ...body, proposedPrice: '125.01' },
      {
        ...body,
        pricingIntent: { kind: 'STRATEGIC', reason: 'Synthetic reason' },
      },
      { ...body, costConfirmation: false },
      { ...body, directCosts: [] },
      ...['key', 'label', 'category', 'amount', 'currency'].map((field) => ({
        ...body,
        directCosts: [{ ...body.directCosts[0], [field]: 'changed' }],
      })),
    ];
    for (const changed of changedBodies) {
      const response = await post({
        path: estimatesPath(fixture.opportunityId),
        companyId: fixture.companyId,
        headers: CONTRIBUTOR,
        body: changed,
        key: 'durable-original',
      });
      expect(response.status).toBe(409);
    }
    const originalRecord = record(original);
    const decision = await decide(
      fixture,
      stringField(originalRecord, 'id'),
      1,
      'REJECT',
      'durable-decision',
    );
    await harness.close();
    await openHarness();
    expect(
      await decide(
        fixture,
        stringField(originalRecord, 'id'),
        1,
        'REJECT',
        'durable-decision',
      ),
    ).toEqual(decision);
    for (const body of [
      { expectedVersionNumber: 1, expectedDecision: null, code: 'APPROVE' },
      { expectedVersionNumber: 2, expectedDecision: null, code: 'REJECT' },
      { expectedVersionNumber: 1, expectedDecision: 'REJECT', code: 'REJECT' },
    ]) {
      expect(
        (
          await post({
            path: `${versionPath(fixture.opportunityId, stringField(originalRecord, 'id'))}/decision`,
            companyId: fixture.companyId,
            headers: DIRECTOR,
            key: 'durable-decision',
            body,
          })
        ).status,
      ).toBe(409);
    }
    expect(await history(fixture)).toMatchObject({ latestVersionNumber: 2 });
  });

  it('keeps Contributor, Director and legacy owner authority independent and revalidates each replay after revocation', async () => {
    const fixture = await prepared();
    const path = estimatesPath(fixture.opportunityId);
    expect(
      (await request({ path, companyId: fixture.companyId, headers: OWNER }))
        .status,
    ).toBe(403);
    expect(
      (
        await post({
          path,
          companyId: fixture.companyId,
          headers: DIRECTOR,
          key: 'director-create',
          body: completeSubmission(),
        })
      ).status,
    ).toBe(403);
    const first = record(
      await submit(fixture, completeSubmission(), 'contributor-create'),
    );
    const firstId = stringField(first, 'id');
    expect(
      (
        await post({
          path: `${versionPath(fixture.opportunityId, firstId)}/decision`,
          companyId: fixture.companyId,
          headers: CONTRIBUTOR,
          key: 'contributor-decide',
          body: decisionBody(1, 'APPROVE'),
        })
      ).status,
    ).toBe(403);
    expect(await exact(fixture, firstId, DIRECTOR)).toEqual(first);
    const decision = await decide(
      fixture,
      firstId,
      1,
      'REJECT',
      'director-decide',
    );
    expect(decision).toMatchObject({ decision: { code: 'REJECT' } });
    await revoke(
      CONTRIBUTOR_ASSIGNMENTS,
      fixture.companyId,
      fixture.contributorMembershipId,
    );
    for (const readPath of [path, versionPath(fixture.opportunityId, firstId)])
      expect(
        (
          await request({
            path: readPath,
            companyId: fixture.companyId,
            headers: CONTRIBUTOR,
          })
        ).status,
      ).toBe(403);
    expect(
      (
        await post({
          path,
          companyId: fixture.companyId,
          headers: CONTRIBUTOR,
          key: 'contributor-create',
          body: completeSubmission(),
        })
      ).status,
    ).toBe(403);
    expect(await exact(fixture, firstId, DIRECTOR)).toEqual(decision);
    await grant(
      CONTRIBUTOR_ASSIGNMENTS,
      fixture.companyId,
      fixture.directorMembershipId,
    );
    expect(
      await command({
        path,
        companyId: fixture.companyId,
        headers: DIRECTOR,
        key: 'director-with-both',
        body: { ...completeSubmission(), expectedLatestVersionNumber: 1 },
      }),
    ).toMatchObject({ versionNumber: 2, decision: null });
    await revoke(
      DIRECTOR_ASSIGNMENTS,
      fixture.companyId,
      fixture.directorMembershipId,
    );
    expect(
      (
        await post({
          path: `${versionPath(fixture.opportunityId, firstId)}/decision`,
          companyId: fixture.companyId,
          headers: DIRECTOR,
          key: 'director-decide',
          body: decisionBody(1, 'REJECT'),
        })
      ).status,
    ).toBe(403);
    expect(await exact(fixture, firstId, DIRECTOR)).toEqual(decision);
  });

  it('refuses old heads, repeated decisions and invalid exact decision expectations without changing frozen history', async () => {
    const fixture = await prepared();
    const first = record(
      await submit(fixture, completeSubmission(), 'head-v1'),
    );
    const firstId = stringField(first, 'id');
    await submit(
      fixture,
      { ...completeSubmission(), expectedLatestVersionNumber: 1 },
      'head-v2',
    );
    for (const expectedLatestVersionNumber of [null, 1, 3])
      expect(
        (
          await post({
            path: estimatesPath(fixture.opportunityId),
            companyId: fixture.companyId,
            headers: CONTRIBUTOR,
            key: crypto.randomUUID(),
            body: { ...completeSubmission(), expectedLatestVersionNumber },
          })
        ).status,
      ).toBe(409);
    const decisionPath = `${versionPath(fixture.opportunityId, firstId)}/decision`;
    for (const body of [
      {
        expectedVersionNumber: 1,
        expectedDecision: 'APPROVE',
        code: 'APPROVE',
      },
      { expectedVersionNumber: 1, expectedDecision: null, code: 'INVALID' },
      { expectedVersionNumber: 1, code: 'APPROVE' },
    ])
      expect(
        (
          await post({
            path: decisionPath,
            companyId: fixture.companyId,
            headers: DIRECTOR,
            key: 'reusable-decision',
            body,
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await post({
          path: decisionPath,
          companyId: fixture.companyId,
          headers: DIRECTOR,
          key: 'wrong-number',
          body: decisionBody(2, 'APPROVE'),
        })
      ).status,
    ).toBe(409);
    const decided = await decide(
      fixture,
      firstId,
      1,
      'APPROVE',
      'reusable-decision',
    );
    for (const code of ['APPROVE', 'MODIFY', 'REJECT'])
      expect(
        (
          await post({
            path: decisionPath,
            companyId: fixture.companyId,
            headers: DIRECTOR,
            key: crypto.randomUUID(),
            body: decisionBody(1, code),
          })
        ).status,
      ).toBe(409);
    expect(await exact(fixture, firstId)).toEqual(decided);
    // No edit, delete, retag or repoint routes are part of the contract.
    for (const method of ['PATCH', 'PUT', 'DELETE'])
      expect(
        (
          await request({
            path: versionPath(fixture.opportunityId, firstId),
            companyId: fixture.companyId,
            headers: CONTRIBUTOR,
            init: { method },
          })
        ).status,
      ).toBe(404);
  });

  it.each(['first', 'append', 'retry'])(
    'serializes deterministic %s submission races into one committed version',
    async (mode) => {
      const fixture = await prepared();
      let head: number | null = null;
      if (mode === 'append') {
        await submit(fixture, completeSubmission(), 'race-base');
        head = 1;
      }
      const body = {
        ...completeSubmission(),
        expectedLatestVersionNumber: head,
      };
      const options = {
        path: estimatesPath(fixture.opportunityId),
        companyId: fixture.companyId,
        headers: CONTRIBUTOR,
        body,
      };
      const [left, right] = await race({
        table: 'profitability_estimate_versions',
        first: () => post({ ...options, key: 'race-left' }),
        second: () =>
          post({
            ...options,
            key: mode === 'retry' ? 'race-left' : 'race-right',
          }),
      });
      expect([left.status, right.status]).toEqual(
        mode === 'retry' ? [201, 201] : [201, 409],
      );
      const result: unknown = await left.json();
      if (mode === 'retry') expect(await right.json()).toEqual(result);
      const page = record(await history(fixture));
      expect(page.latestVersionNumber).toBe(mode === 'append' ? 2 : 1);
      expect(items(page)).toHaveLength(mode === 'append' ? 2 : 1);
      expect(items(page)[0]).toEqual(result);
    },
  );

  it.each(['same-code', 'different-code', 'exact-retry'])(
    'serializes deterministic %s Director races into one exact-version decision',
    async (mode) => {
      const fixture = await prepared();
      const created = record(
        await submit(fixture, completeSubmission(), 'decision-race-base'),
      );
      const id = stringField(created, 'id');
      const options = {
        path: `${versionPath(fixture.opportunityId, id)}/decision`,
        companyId: fixture.companyId,
        headers: DIRECTOR,
      };
      const [left, right] = await race({
        table: 'profitability_estimate_decisions',
        first: () =>
          post({
            ...options,
            key: 'decision-left',
            body: decisionBody(1, 'APPROVE'),
          }),
        second: () =>
          post({
            ...options,
            key: mode === 'exact-retry' ? 'decision-left' : 'decision-right',
            body: decisionBody(
              1,
              mode === 'different-code' ? 'REJECT' : 'APPROVE',
            ),
          }),
      });
      expect([left.status, right.status]).toEqual(
        mode === 'exact-retry' ? [201, 201] : [201, 409],
      );
      const result: unknown = await left.json();
      if (mode === 'exact-retry') expect(await right.json()).toEqual(result);
      expect(await exact(fixture, id)).toEqual(result);
      expect(await history(fixture)).toEqual({
        items: [result],
        latestVersionNumber: 1,
      });
    },
  );

  it('preserves a concurrently decided frozen version and successor, and readers never observe an uncommitted head', async () => {
    const fixture = await prepared();
    const first = record(
      await submit(fixture, completeSubmission(), 'concurrent-base'),
    );
    const firstId = stringField(first, 'id');
    const pause = await pauseWrites('profitability_estimate_versions');
    try {
      const successor = post({
        path: estimatesPath(fixture.opportunityId),
        companyId: fixture.companyId,
        headers: CONTRIBUTOR,
        key: 'concurrent-successor',
        body: { ...completeSubmission(), expectedLatestVersionNumber: 1 },
      });
      await waitForBlockedBy(pause.lock.backendPid);
      const concurrentRead = read({
        path: estimatesPath(fixture.opportunityId),
        companyId: fixture.companyId,
        headers: CONTRIBUTOR,
      });
      const decision = post({
        path: `${versionPath(fixture.opportunityId, firstId)}/decision`,
        companyId: fixture.companyId,
        headers: DIRECTOR,
        key: 'concurrent-decision',
        body: decisionBody(1, 'APPROVE'),
      });
      await release(pause.lock);
      const [appendResponse, decisionResponse, observed] = await Promise.all([
        successor,
        decision,
        concurrentRead,
      ]);
      expect([appendResponse.status, decisionResponse.status]).toEqual([
        201, 201,
      ]);
      const appended: unknown = await appendResponse.json();
      const decided: unknown = await decisionResponse.json();
      expect(appended).toMatchObject({
        versionNumber: 2,
        predecessorVersionId: firstId,
        decision: null,
      });
      expect(decided).toMatchObject({
        ...first,
        decision: { code: 'APPROVE' },
      });
      const page = record(observed);
      const observedVersions = items(page).map((value) =>
        numberField(record(value), 'versionNumber'),
      );
      // A reader may wait for the protected writer or return the earlier
      // committed state. Its head and frozen rows must describe one state.
      expect(observedVersions).toEqual(
        page.latestVersionNumber === 1 ? [1] : [2, 1],
      );
      expect([1, 2]).toContain(page.latestVersionNumber);
      expect(await history(fixture)).toEqual({
        items: [appended, decided],
        latestVersionNumber: 2,
      });
    } finally {
      await pause.close();
    }
  });

  it.each([
    ['profitability_estimates', 'INSERT', 'first'],
    ['profitability_estimate_versions', 'INSERT', 'first'],
    ['profitability_estimates', 'UPDATE', 'first'],
    ['profitability_estimates', 'UPDATE', 'append'],
    ['profitability_estimate_receipts', 'INSERT', 'first'],
    ['profitability_estimate_events', 'INSERT', 'first'],
    ['profitability_estimate_versions', 'INSERT', 'append'],
    ['profitability_estimate_receipts', 'INSERT', 'append'],
    ['profitability_estimate_events', 'INSERT', 'append'],
    ['profitability_estimate_decisions', 'INSERT', 'decision'],
    ['profitability_estimate_receipts', 'INSERT', 'decision'],
    ['profitability_estimate_events', 'INSERT', 'decision'],
  ])(
    'rolls back a failed %s %s during %s, leaves committed reads unchanged and makes the same request key reusable',
    async (table, operation, mode) => {
      const fixture = await prepared();
      let first: Record<string, unknown> | undefined;
      if (mode !== 'first')
        first = record(
          await submit(fixture, completeSubmission(), 'failure-base'),
        );
      const before = await history(fixture);
      const options = {
        path:
          mode === 'decision' && first
            ? `${versionPath(fixture.opportunityId, stringField(first, 'id'))}/decision`
            : estimatesPath(fixture.opportunityId),
        companyId: fixture.companyId,
        headers: mode === 'decision' ? DIRECTOR : CONTRIBUTOR,
        body:
          mode === 'decision'
            ? decisionBody(1, 'APPROVE')
            : {
                ...completeSubmission(),
                expectedLatestVersionNumber: mode === 'append' ? 1 : null,
              },
        key: 'rolled-back-reusable-key',
      };
      const closeFailure = await failWrites(table, operation);
      const diagnostics = vi.spyOn(Logger.prototype, 'error');
      try {
        await expectSanitizedFailure(await post(options));
        expectNoConfidentialFailureContent(
          JSON.stringify(diagnostics.mock.calls),
        );
        expect(await history(fixture)).toEqual(before);
        if (first)
          expect(await exact(fixture, stringField(first, 'id'))).toEqual(first);
      } finally {
        diagnostics.mockRestore();
        await closeFailure();
      }
      const success = await command(options);
      expect(await command(options)).toEqual(success);
      expect(await history(fixture)).toMatchObject({
        latestVersionNumber: mode === 'append' ? 2 : 1,
      });
      if (mode === 'decision' && first)
        expect(await exact(fixture, stringField(first, 'id'))).toEqual(success);
    },
  );

  it('pages newest-first history with a stable cursor, default 25 and maximum 50 without a hidden count or Company-wide endpoint', async () => {
    const fixture = await prepared();
    const path = estimatesPath(fixture.opportunityId);
    const created: unknown[] = [];
    for (let version = 1; version <= 27; version++)
      created.unshift(
        await submit(
          fixture,
          {
            ...completeSubmission(),
            expectedLatestVersionNumber: version === 1 ? null : version - 1,
          },
          `history-${version}`,
        ),
      );
    const first = record(await history(fixture));
    expect(items(first)).toEqual(created.slice(0, 25));
    expect(Object.keys(first).sort()).toEqual([
      'items',
      'latestVersionNumber',
      'nextCursor',
    ]);
    const cursor = stringField(first, 'nextCursor');
    await submit(
      fixture,
      { ...completeSubmission(), expectedLatestVersionNumber: 27 },
      'history-28',
    );
    const rest = await read({
      path: `${path}?cursor=${encodeURIComponent(cursor)}`,
      companyId: fixture.companyId,
      headers: CONTRIBUTOR,
    });
    expect(rest).toEqual({ items: created.slice(25), latestVersionNumber: 28 });
    const maximum = record(
      await read({
        path: `${path}?limit=50`,
        companyId: fixture.companyId,
        headers: CONTRIBUTOR,
      }),
    );
    expect(items(maximum)).toHaveLength(28);
    for (const query of ['limit=0', 'limit=51', 'limit=1.5', 'limit=invalid'])
      expect(
        (
          await request({
            path: `${path}?${query}`,
            companyId: fixture.companyId,
            headers: CONTRIBUTOR,
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await request({
          path: `${path}?cursor=invalid`,
          companyId: fixture.companyId,
          headers: CONTRIBUTOR,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request({
          path: '/profitability-estimates',
          companyId: fixture.companyId,
          headers: CONTRIBUTOR,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request({
          path: `/companies/${fixture.companyId}/profitability-estimates`,
          companyId: fixture.companyId,
          headers: CONTRIBUTOR,
        })
      ).status,
    ).toBe(404);
  });

  it('denies cross-Company Opportunity, direct version and cursor references with the same safe unavailable result', async () => {
    const fixture = await prepared();
    const foreign = await prepared();
    const localVersion = record(
      await submit(fixture, completeSubmission(), 'local-version'),
    );
    const foreignVersion = record(
      await submit(foreign, completeSubmission(), 'foreign-version'),
    );
    await submit(
      foreign,
      { ...completeSubmission(), expectedLatestVersionNumber: 1 },
      'foreign-next-version',
    );
    const foreignPage = record(
      await read({
        path: `${estimatesPath(foreign.opportunityId)}?limit=1`,
        companyId: foreign.companyId,
        headers: CONTRIBUTOR,
      }),
    );
    const foreignCursor = stringField(foreignPage, 'nextCursor');
    expect(
      (
        await request({
          path: `${estimatesPath(fixture.opportunityId)}?cursor=${encodeURIComponent(foreignCursor)}`,
          companyId: fixture.companyId,
          headers: CONTRIBUTOR,
        })
      ).status,
    ).toBe(404);
    const unknownId = crypto.randomUUID();
    const foreignPaths = [
      estimatesPath(foreign.opportunityId),
      versionPath(foreign.opportunityId, stringField(foreignVersion, 'id')),
      versionPath(fixture.opportunityId, stringField(foreignVersion, 'id')),
    ];
    const unknownPaths = [
      estimatesPath(unknownId),
      versionPath(unknownId, unknownId),
      versionPath(fixture.opportunityId, unknownId),
    ];
    for (const [index, path] of foreignPaths.entries()) {
      const response = await request({
        path,
        companyId: fixture.companyId,
        headers: CONTRIBUTOR,
      });
      const unknownResponse = await request({
        path: unknownPaths[index] ?? estimatesPath(unknownId),
        companyId: fixture.companyId,
        headers: CONTRIBUTOR,
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(await unknownResponse.json());
    }
    const foreignSubmission = await post({
      path: estimatesPath(foreign.opportunityId),
      companyId: fixture.companyId,
      headers: CONTRIBUTOR,
      body: completeSubmission(),
      key: 'cross-company-submit',
    });
    expect(foreignSubmission.status).toBe(404);
    const foreignDecision = await post({
      path: `${versionPath(fixture.opportunityId, stringField(foreignVersion, 'id'))}/decision`,
      companyId: fixture.companyId,
      headers: DIRECTOR,
      body: decisionBody(1, 'APPROVE'),
      key: 'cross-company-decision',
    });
    expect(foreignDecision.status).toBe(404);
    expect(await exact(fixture, stringField(localVersion, 'id'))).toEqual(
      localVersion,
    );
    expect(await exact(foreign, stringField(foreignVersion, 'id'))).toEqual(
      foreignVersion,
    );
  });

  it.each(['submit', 'decide'])(
    'refuses %s server-clock failure inside the protected transaction and reuses its rolled-back key',
    async (mode) => {
      const fixture = await prepared();
      const original =
        mode === 'decide'
          ? record(await submit(fixture, completeSubmission(), 'clock-base'))
          : undefined;
      const before = await history(fixture);
      const options = {
        path: original
          ? `${versionPath(fixture.opportunityId, stringField(original, 'id'))}/decision`
          : estimatesPath(fixture.opportunityId),
        companyId: fixture.companyId,
        headers: original ? DIRECTOR : CONTRIBUTOR,
        key: 'clock-reusable-key',
        body: original ? decisionBody(1, 'APPROVE') : completeSubmission(),
      };
      try {
        rejectClock = true;
        await expectSanitizedFailure(await post(options));
      } finally {
        rejectClock = false;
      }
      expect(await history(fixture)).toEqual(before);
      const success = await command(options);
      expect(await command(options)).toEqual(success);
    },
  );

  it.each(['submit', 'decide'])(
    'rolls back already-written %s facts if the validated response boundary cannot construct the authorized result',
    async (mode) => {
      const fixture = await prepared();
      const original =
        mode === 'decide'
          ? record(
              await submit(fixture, completeSubmission(), 'construction-base'),
            )
          : undefined;
      const before = await history(fixture);
      const options = {
        path: original
          ? `${versionPath(fixture.opportunityId, stringField(original, 'id'))}/decision`
          : estimatesPath(fixture.opportunityId),
        companyId: fixture.companyId,
        headers: original ? DIRECTOR : CONTRIBUTOR,
        key: 'response-reusable-key',
        body: original ? decisionBody(1, 'APPROVE') : completeSubmission(),
      };
      // This exported validated-response boundary runs after the real immutable
      // write/head advance, inside the command transaction. The injected fault
      // changes only response construction; it never replaces business logic,
      // authorization or persistence with a mock.
      const construction = vi.spyOn(
        profitabilityResponse,
        'readProfitabilityVersion',
      );
      construction.mockImplementationOnce(() => {
        throw new Error('Synthetic authorized response construction failure');
      });
      try {
        await expectSanitizedFailure(await post(options));
      } finally {
        construction.mockRestore();
      }
      expect(await history(fixture)).toEqual(before);
      const success = await command(options);
      expect(await command(options)).toEqual(success);
    },
  );

  it.each(['contributor', 'intake', 'membership', 'company', 'internal-user'])(
    'refuses an exact replay after %s loss commits before protected authorization',
    async (loss) => {
      const fixture = await prepared();
      const body = completeSubmission();
      const original = await submit(fixture, body, 'protected-replay');
      const lock = await holdTransaction((connection) =>
        invalidate(connection, fixture, loss),
      );
      const replay = post({
        path: estimatesPath(fixture.opportunityId),
        companyId: fixture.companyId,
        headers: CONTRIBUTOR,
        key: 'protected-replay',
        body,
      });
      try {
        await waitForBlockedBy(lock.backendPid);
        await release(lock);
        expect((await replay).status).toBe(403);
      } finally {
        await release(lock);
      }
      // Restore only the synthetic fixture so the stable public read can prove
      // the denied replay produced no new economic version.
      await restore(fixture, loss);
      expect(await history(fixture)).toEqual({
        items: [original],
        latestVersionNumber: 1,
      });
    },
  );

  it.each(['contributor', 'intake', 'membership', 'company', 'internal-user'])(
    'makes %s loss wait when the command holds protected authorization first',
    async (loss) => {
      const fixture = await prepared();
      const pause = await pauseWrites('profitability_estimate_versions');
      let invalidation: Promise<void> | undefined;
      try {
        const submitted = post({
          path: estimatesPath(fixture.opportunityId),
          companyId: fixture.companyId,
          headers: CONTRIBUTOR,
          key: 'protected-first',
          body: completeSubmission(),
        });
        const commandPid = await waitForBlockedBy(pause.lock.backendPid);
        invalidation = invalidate(pool, fixture, loss);
        await waitForBlockedBy(commandPid);
        await release(pause.lock);
        expect((await submitted).status).toBe(201);
        await invalidation;
        expect(
          (
            await post({
              path: estimatesPath(fixture.opportunityId),
              companyId: fixture.companyId,
              headers: CONTRIBUTOR,
              key: 'protected-first',
              body: completeSubmission(),
            })
          ).status,
        ).toBe(403);
      } finally {
        await pause.close();
        await invalidation;
      }
      await restore(fixture, loss);
      expect(await history(fixture)).toMatchObject({
        latestVersionNumber: 1,
        items: [expect.objectContaining({ versionNumber: 1 })],
      });
    },
  );

  it('denies foreign Workspace identifiers and Company context without disclosing economics', async () => {
    const local = await prepared();
    await submit(local, completeSubmission(), 'workspace-local');
    await harness.close();
    const foreignWorkspaceId = '00000000-0000-4000-8000-000000009498';
    await openHarness(foreignWorkspaceId);
    const foreign = await prepared();
    const foreignRecord = record(
      await submit(foreign, completeSubmission(), 'workspace-foreign'),
    );
    await harness.close();
    await openHarness();
    for (const path of [
      estimatesPath(foreign.opportunityId),
      versionPath(foreign.opportunityId, stringField(foreignRecord, 'id')),
      versionPath(local.opportunityId, stringField(foreignRecord, 'id')),
    ]) {
      const response = await request({
        path,
        companyId: local.companyId,
        headers: CONTRIBUTOR,
      });
      expect(response.status).toBe(404);
      const value: unknown = await response.json();
      expect(value).toMatchObject({
        message: 'Not Found',
        statusCode: 404,
      });
      const serialized = JSON.stringify(value);
      for (const secret of [
        foreign.companyId,
        foreign.opportunityId,
        stringField(foreignRecord, 'id'),
        '70.00',
        '125.00',
        'Synthetic travel',
      ])
        expect(serialized).not.toContain(secret);
    }
    expect(
      (
        await request({
          path: estimatesPath(foreign.opportunityId),
          companyId: foreign.companyId,
          headers: CONTRIBUTOR,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post({
          path: estimatesPath(foreign.opportunityId),
          companyId: local.companyId,
          headers: CONTRIBUTOR,
          body: completeSubmission(),
          key: 'foreign-workspace-submit',
        })
      ).status,
    ).toBe(404);
  });

  it('records one restricted identifier-only event per new version and exact decision while Activity reads remain unchanged', async () => {
    const fixture = await prepared();
    const contributorActor = record(
      await read({
        path: '/access/current-actor',
        companyId: fixture.companyId,
        headers: CONTRIBUTOR,
      }),
    );
    // The existing general Activity surface is callable by active members;
    // profitability bundles must not add Company commercial Activity authority.
    expect(
      record(contributorActor.activeCompany).commercialActivityPermissions ??
        [],
    ).toEqual([]);
    await grant(
      '/company-commercial-activity-reader-assignments',
      fixture.companyId,
      fixture.contributorMembershipId,
    );
    const beforeActivity = await read({
      path: '/activity-log',
      companyId: fixture.companyId,
      headers: CONTRIBUTOR,
    });
    const original =
      AccountabilityService.prototype.recordProfitabilityEstimateEvent;
    const recording = vi.spyOn(
      AccountabilityService.prototype,
      'recordProfitabilityEstimateEvent',
    );
    recording.mockImplementation(async function (
      this: AccountabilityService,
      input,
    ) {
      await original.call(this, input);
    });
    try {
      const first = record(
        await submit(fixture, completeSubmission(), 'event-v1'),
      );
      const id = stringField(first, 'id');
      await submit(fixture, completeSubmission(), 'event-v1');
      await decide(fixture, id, 1, 'MODIFY', 'event-decision');
      await decide(fixture, id, 1, 'MODIFY', 'event-decision');
      expect(
        (
          await post({
            path: `${versionPath(fixture.opportunityId, id)}/decision`,
            companyId: fixture.companyId,
            headers: DIRECTOR,
            key: 'event-conflict',
            body: decisionBody(1, 'APPROVE'),
          })
        ).status,
      ).toBe(409);
      const second = record(
        await submit(
          fixture,
          { ...completeSubmission(), expectedLatestVersionNumber: 1 },
          'event-v2',
        ),
      );
      expect(recording).toHaveBeenCalledTimes(3);
      const events = recording.mock.calls.map(([input]) => input);
      expect(events).toEqual([
        {
          actor: expect.objectContaining({
            workspaceId: WORKSPACE_ID,
            workspaceMembershipId: fixture.contributorMembershipId,
          }),
          companyId: fixture.companyId,
          opportunityId: fixture.opportunityId,
          clientRequestId: fixture.requestId,
          estimateId: first.estimateId,
          versionId: id,
          versionNumber: 1,
          occurredAt: new Date('2026-10-01T12:00:00.000Z'),
          action: 'profitability_estimate_version.created',
        },
        {
          actor: expect.objectContaining({
            workspaceId: WORKSPACE_ID,
            workspaceMembershipId: fixture.directorMembershipId,
          }),
          companyId: fixture.companyId,
          opportunityId: fixture.opportunityId,
          clientRequestId: fixture.requestId,
          estimateId: first.estimateId,
          versionId: id,
          versionNumber: 1,
          occurredAt: new Date('2026-10-01T12:00:00.000Z'),
          action: 'profitability_estimate_version.decided',
          decisionCode: 'MODIFY',
        },
        {
          actor: expect.objectContaining({
            workspaceId: WORKSPACE_ID,
            workspaceMembershipId: fixture.contributorMembershipId,
          }),
          companyId: fixture.companyId,
          opportunityId: fixture.opportunityId,
          clientRequestId: fixture.requestId,
          estimateId: first.estimateId,
          versionId: second.id,
          versionNumber: 2,
          occurredAt: new Date('2026-10-01T12:00:00.000Z'),
          action: 'profitability_estimate_version.created',
        },
      ]);
      expect(
        await read({
          path: '/activity-log',
          companyId: fixture.companyId,
          headers: CONTRIBUTOR,
        }),
      ).toEqual(beforeActivity);
      await revoke(
        CONTRIBUTOR_ASSIGNMENTS,
        fixture.companyId,
        fixture.contributorMembershipId,
      );
      expect(
        (
          await post({
            path: estimatesPath(fixture.opportunityId),
            companyId: fixture.companyId,
            headers: CONTRIBUTOR,
            key: 'event-v1',
            body: completeSubmission(),
          })
        ).status,
      ).toBe(403);
      expect(recording).toHaveBeenCalledTimes(3);
    } finally {
      recording.mockRestore();
    }
  });

  it('fingerprints authorized target identifiers, direct-line order and exact strategic reason rather than only calculated economics', async () => {
    const fixture = await prepared();
    const another = await prepared();
    const body = {
      ...completeSubmission(),
      directCosts: [
        {
          key: 'distinct-a',
          category: 'TRAVEL',
          label: 'Synthetic equal line',
          amount: '5.00',
          currency: 'EUR',
        },
        {
          key: 'distinct-b',
          category: 'TRAVEL',
          label: 'Synthetic equal line',
          amount: '5.00',
          currency: 'EUR',
        },
      ],
      pricingIntent: { kind: 'STRATEGIC', reason: ' Synthetic reason ' },
    };
    const first = record(await submit(fixture, body, 'full-fingerprint'));
    for (const changed of [
      { ...body, directCosts: [...body.directCosts].reverse() },
      {
        ...body,
        pricingIntent: { kind: 'STRATEGIC', reason: 'Synthetic reason' },
      },
    ])
      expect(
        (
          await post({
            path: estimatesPath(fixture.opportunityId),
            companyId: fixture.companyId,
            headers: CONTRIBUTOR,
            key: 'full-fingerprint',
            body: changed,
          })
        ).status,
      ).toBe(409);
    // A second public Opportunity in the same Company is an authorized
    // changed target under the same scoped command key.
    const requestRecord = record(
      await command({
        path: '/commercial-intake/requests',
        companyId: fixture.companyId,
        headers: CONTRIBUTOR,
        key: 'fingerprint-other-target',
        body: {
          originalText: 'Synthetic second request',
          sourceLabel: 'Synthetic',
          subject: 'Synthetic',
          opportunity: {
            title: 'Second synthetic Opportunity',
            scope: 'Synthetic',
            nextAction: 'Review',
          },
        },
      }),
    );
    const otherOpportunityId = stringField(
      record(requestRecord.initialOpportunity),
      'id',
    );
    expect(
      (
        await post({
          path: estimatesPath(otherOpportunityId),
          companyId: fixture.companyId,
          headers: CONTRIBUTOR,
          key: 'full-fingerprint',
          body,
        })
      ).status,
    ).toBe(409);
    const second = record(
      await command({
        path: estimatesPath(otherOpportunityId),
        companyId: fixture.companyId,
        headers: CONTRIBUTOR,
        key: 'second-target',
        body,
      }),
    );
    await decide(
      fixture,
      stringField(first, 'id'),
      1,
      'APPROVE',
      'decision-target',
    );
    expect(
      (
        await post({
          path: `${versionPath(otherOpportunityId, stringField(second, 'id'))}/decision`,
          companyId: fixture.companyId,
          headers: DIRECTOR,
          key: 'decision-target',
          body: decisionBody(1, 'APPROVE'),
        })
      ).status,
    ).toBe(409);
    // The same key in a different active Company has an independent scope.
    expect(await submit(another, body, 'full-fingerprint')).toMatchObject({
      versionNumber: 1,
    });
  });

  async function invalidate(
    connection: Pool | PoolClient,
    fixture: Fixture,
    loss: string,
  ): Promise<void> {
    switch (loss) {
      case 'contributor':
      case 'intake':
        await connection.query(
          `UPDATE company_role_assignments SET revoked_at = now(), updated_at = now()
          WHERE workspace_membership_id = $1 AND company_id = $2 AND bundle::text = $3 AND revoked_at IS NULL`,
          [
            fixture.contributorMembershipId,
            fixture.companyId,
            loss === 'contributor'
              ? 'company_profitability_contributor'
              : 'company_commercial_intake',
          ],
        );
        return;
      case 'membership':
        await connection.query(
          "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
          [fixture.contributorMembershipId],
        );
        return;
      case 'company':
        await connection.query(
          "UPDATE companies SET status = 'inactive' WHERE id = $1",
          [fixture.companyId],
        );
        return;
      case 'internal-user':
        await connection.query(
          "UPDATE internal_users SET status = 'inactive' WHERE id = (SELECT internal_user_id FROM workspace_memberships WHERE id = $1)",
          [fixture.contributorMembershipId],
        );
        return;
      default:
        throw new Error(`Unknown synthetic authority loss ${loss}.`);
    }
  }

  async function restore(fixture: Fixture, loss: string): Promise<void> {
    switch (loss) {
      case 'contributor':
      case 'intake':
        await grant(
          loss === 'contributor' ? CONTRIBUTOR_ASSIGNMENTS : INTAKE_ASSIGNMENTS,
          fixture.companyId,
          fixture.contributorMembershipId,
        );
        return;
      case 'membership':
        await pool.query(
          "UPDATE workspace_memberships SET status = 'active' WHERE id = $1",
          [fixture.contributorMembershipId],
        );
        return;
      case 'company':
        await pool.query(
          "UPDATE companies SET status = 'active' WHERE id = $1",
          [fixture.companyId],
        );
        return;
      case 'internal-user':
        await pool.query(
          "UPDATE internal_users SET status = 'active' WHERE id = (SELECT internal_user_id FROM workspace_memberships WHERE id = $1)",
          [fixture.contributorMembershipId],
        );
        return;
      default:
        throw new Error(`Unknown synthetic authority loss ${loss}.`);
    }
  }

  async function holdTransaction(
    acquire: (connection: PoolClient) => Promise<void>,
  ): Promise<HeldTransaction> {
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      const backend = await connection.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      const backendPid = backend.rows[0]?.pid;
      if (backendPid === undefined) throw new Error('Missing blocker backend.');
      await acquire(connection);
      return { connection, backendPid, released: false };
    } catch (error) {
      await connection.query('ROLLBACK');
      connection.release();
      throw error;
    }
  }

  async function release(lock: HeldTransaction): Promise<void> {
    if (lock.released) return;
    try {
      await lock.connection.query('COMMIT');
    } finally {
      lock.released = true;
      lock.connection.release();
    }
  }

  async function waitForBlockedBy(backendPid: number): Promise<number> {
    const deadline = Date.now() + 3_000;
    do {
      const blocked = await pool.query<{ pid: number }>(
        `SELECT pid FROM pg_stat_activity WHERE datname = current_database()
          AND $1::integer = ANY(pg_blocking_pids(pid))`,
        [backendPid],
      );
      const pid = blocked.rows[0]?.pid;
      if (pid !== undefined) return pid;
      // Each awaited database round trip yields; no timed sleeps establish
      // causality. Only PostgreSQL's observed holder→waiter edge does.
    } while (Date.now() < deadline);
    throw new Error(
      `No observed PostgreSQL waiter behind backend ${backendPid}.`,
    );
  }

  async function pauseWrites(table: string) {
    const key = `profitability-proof-${crypto.randomUUID()}`;
    const lock = await holdTransaction(async (connection) => {
      await connection.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [key],
      );
    });
    await pool.query(`
      CREATE FUNCTION test_pause_profitability() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_advisory_xact_lock(hashtextextended('${key}', 0));
        RETURN NEW;
      END $$;
      CREATE TRIGGER test_pause_profitability BEFORE INSERT ON ${table}
        FOR EACH ROW EXECUTE FUNCTION test_pause_profitability();
    `);
    return {
      lock,
      close: async () => {
        await release(lock);
        await pool.query(
          `DROP TRIGGER IF EXISTS test_pause_profitability ON ${table}; DROP FUNCTION IF EXISTS test_pause_profitability()`,
        );
      },
    };
  }

  async function race({
    table,
    first,
    second,
  }: {
    table: string;
    first: () => Promise<Response>;
    second: () => Promise<Response>;
  }): Promise<[Response, Response]> {
    const pause = await pauseWrites(table);
    try {
      const left = first();
      const firstPid = await waitForBlockedBy(pause.lock.backendPid);
      const right = second();
      await waitForBlockedBy(firstPid);
      await release(pause.lock);
      return await Promise.all([left, right]);
    } finally {
      await pause.close();
    }
  }

  async function failWrites(table: string, operation: string) {
    await pool.query(`
      CREATE FUNCTION test_fail_profitability() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic rollback proof'; END $$;
      CREATE TRIGGER test_fail_profitability BEFORE ${operation} ON ${table}
        FOR EACH ROW EXECUTE FUNCTION test_fail_profitability();
    `);
    return async () => {
      await pool.query(
        `DROP TRIGGER IF EXISTS test_fail_profitability ON ${table}; DROP FUNCTION IF EXISTS test_fail_profitability()`,
      );
    };
  }

  async function submit(fixture: Fixture, body: unknown, key: string) {
    return command({
      path: estimatesPath(fixture.opportunityId),
      companyId: fixture.companyId,
      headers: CONTRIBUTOR,
      body,
      key,
    });
  }

  async function decide(
    fixture: Fixture,
    versionId: string,
    versionNumber: number,
    code: string,
    key: string,
  ) {
    return command({
      path: `${versionPath(fixture.opportunityId, versionId)}/decision`,
      companyId: fixture.companyId,
      headers: DIRECTOR,
      body: decisionBody(versionNumber, code),
      key,
    });
  }

  async function history(fixture: Fixture) {
    return read({
      path: estimatesPath(fixture.opportunityId),
      companyId: fixture.companyId,
      headers: CONTRIBUTOR,
    });
  }

  async function exact(
    fixture: Fixture,
    versionId: string,
    headers = CONTRIBUTOR,
  ) {
    return read({
      path: versionPath(fixture.opportunityId, versionId),
      companyId: fixture.companyId,
      headers,
    });
  }

  async function revoke(path: string, companyId: string, membershipId: string) {
    const response = await request({
      path: `${path}/${membershipId}/${companyId}`,
      init: {
        method: 'DELETE',
        headers: { 'idempotency-key': crypto.randomUUID() },
      },
    });
    expect(response.status).toBe(200);
  }

  async function prepared({
    withClient = false,
  }: { withClient?: boolean } = {}): Promise<Fixture> {
    const company = record(
      await command({
        path: '/companies',
        body: { displayName: `Synthetic Company ${crypto.randomUUID()}` },
        key: crypto.randomUUID(),
      }),
    );
    const companyId = stringField(company, 'id');
    const contributor = record(
      await read({ path: '/access/current-actor', headers: CONTRIBUTOR }),
    );
    const director = record(
      await read({ path: '/access/current-actor', headers: DIRECTOR }),
    );
    const contributorMembershipId = stringField(
      contributor,
      'workspaceMembershipId',
    );
    const directorMembershipId = stringField(director, 'workspaceMembershipId');
    for (const membershipId of [
      contributorMembershipId,
      directorMembershipId,
    ]) {
      await grant('/company-context-assignments', companyId, membershipId);
      await grant(INTAKE_ASSIGNMENTS, companyId, membershipId);
    }
    await grant(CONTRIBUTOR_ASSIGNMENTS, companyId, contributorMembershipId);
    await grant(DIRECTOR_ASSIGNMENTS, companyId, directorMembershipId);
    let clientAccountId: string | undefined;
    if (withClient) {
      await grant(
        '/company-director-client-assignments',
        companyId,
        contributorMembershipId,
      );
      const client = record(
        await command({
          path: '/clients',
          companyId,
          headers: CONTRIBUTOR,
          key: crypto.randomUUID(),
          body: {
            displayName: 'Synthetic compatibility Client',
            taxId: 'SYNTHETIC-498',
            address: '498 Example Street',
          },
        }),
      );
      clientAccountId = stringField(client, 'id');
    }
    const request = record(
      await command({
        path: '/commercial-intake/requests',
        body: {
          ...(clientAccountId ? { clientAccountId } : {}),
          originalText: 'Synthetic request; no real customer information.',
          sourceLabel: 'Synthetic profitability REST proof',
          subject: 'Synthetic confirmed-cost estimate',
          opportunity: {
            title: 'Synthetic Opportunity',
            scope: 'Synthetic scope',
            nextAction: 'Prepare confirmed costs',
          },
        },
        key: crypto.randomUUID(),
        companyId,
        headers: CONTRIBUTOR,
      }),
    );
    return {
      companyId,
      requestId: stringField(request, 'id'),
      opportunityId: stringField(record(request.initialOpportunity), 'id'),
      contributorMembershipId,
      directorMembershipId,
    };
  }

  async function grant(path: string, companyId: string, membershipId: string) {
    return command({
      path,
      body: { companyId, workspaceMembershipId: membershipId },
      key: crypto.randomUUID(),
    });
  }

  async function request({
    path,
    companyId,
    headers = OWNER,
    init = {},
  }: {
    path: string;
    companyId?: string;
    headers?: Readonly<Record<string, string>>;
    init?: RequestInit;
  }): Promise<Response> {
    return fetch(`${origin}/api${path}`, {
      ...init,
      headers: {
        ...headers,
        'x-workspace-context-id': activeWorkspaceId,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        ...Object.fromEntries(new Headers(init.headers).entries()),
      },
    });
  }

  async function post(options: {
    path: string;
    companyId?: string;
    headers?: Readonly<Record<string, string>>;
    body: unknown;
    key: string;
  }): Promise<Response> {
    return request({
      ...options,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': options.key,
        },
        body: JSON.stringify(options.body),
      },
    });
  }

  async function command(
    options: Parameters<typeof post>[0],
  ): Promise<unknown> {
    const response = await post(options);
    const value: unknown = await response.json();
    expect({
      path: options.path,
      status: response.status,
      value,
    }).toMatchObject({
      status: 201,
    });
    return value;
  }

  async function read(
    options: Parameters<typeof request>[0],
  ): Promise<unknown> {
    const response = await request(options);
    const value: unknown = await response.json();
    expect({
      path: options.path,
      status: response.status,
      value,
    }).toMatchObject({
      status: 200,
    });
    return value;
  }
});

function completeSubmission() {
  return {
    expectedLatestVersionNumber: null,
    currency: 'EUR',
    executorType: 'PATENT_CONSULTANT',
    executorCost: '70.00',
    fiscalCost: '10.00',
    allocatedOverhead: '10.00',
    directCosts: [
      {
        key: 'travel',
        category: 'TRAVEL',
        label: ' Synthetic travel ',
        amount: '10.00',
        currency: 'EUR',
      },
    ],
    targetProfitability: '20',
    proposedPrice: '125.00',
    pricingIntent: { kind: 'ORDINARY' },
    costConfirmation: true,
  };
}

function estimatesPath(opportunityId: string): string {
  return `/opportunities/${opportunityId}/profitability-estimates`;
}

function versionPath(opportunityId: string, versionId: string): string {
  return `${estimatesPath(opportunityId)}/versions/${versionId}`;
}

function decisionBody(expectedVersionNumber: number, code: string) {
  return { expectedVersionNumber, expectedDecision: null, code };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object response.');
  return Object.fromEntries(Object.entries(value));
}

function stringField(value: Record<string, unknown>, field: string): string {
  const result = value[field];
  if (typeof result !== 'string') throw new Error(`Expected ${field}.`);
  return result;
}

function numberField(value: Record<string, unknown>, field: string): number {
  const result = value[field];
  if (typeof result !== 'number') throw new Error(`Expected ${field}.`);
  return result;
}

function items(value: Record<string, unknown>): unknown[] {
  if (!Array.isArray(value.items))
    throw new Error('Expected version page items.');
  return value.items;
}

async function expectSanitizedFailure(response: Response): Promise<void> {
  expect(response.status).toBe(500);
  const value: unknown = await response.json();
  expect(value).toMatchObject({ code: 'PROFITABILITY_COMMAND_FAILED' });
  expectNoConfidentialFailureContent(JSON.stringify(value));
}

function expectNoConfidentialFailureContent(serialized: string): void {
  for (const secret of [
    '70.00',
    '125.00',
    'Synthetic travel',
    'Synthetic strategic reason',
    'insert into',
    'test_fail_profitability',
    'Synthetic rollback proof',
  ])
    expect(serialized).not.toContain(secret);
}

function memberHeaders(subject: string): Record<string, string> {
  return {
    'x-test-external-provider': 'deterministic-test',
    'x-test-external-subject': subject,
    'x-test-display-name': subject,
    'x-test-email': `${subject}@example.test`,
  };
}
