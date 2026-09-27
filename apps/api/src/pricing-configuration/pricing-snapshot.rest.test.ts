import type { Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ServerClock } from '../clock/server-clock.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

// Every value is synthetic and illustrative. No amount or tax has business,
// fiscal, contractual or legal effect.
const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000418';
const OWNER = memberHeaders('workspace-owner');
const CONFIGURATION_MEMBER = memberHeaders('snapshot-configuration-member');
const ASSIGNMENTS = {
  catalogue: '/company-service-catalogue-assignments',
  configuration: '/company-pricing-configuration-assignments',
  intake: '/company-commercial-intake-assignments',
  pricing: '/company-pricing-user-assignments',
} as const;

let instant = new Date('2026-04-01T00:00:00.000Z');
let clockSequence: Date[] = [];
const serverClock: ServerClock = {
  now: () => new Date((clockSequence.shift() ?? instant).getTime()),
};

interface HeldTransaction {
  connection: PoolClient;
  backendPid: number;
  released: boolean;
}

interface Fixture {
  companyId: string;
  membershipId: string;
  requestId: string;
  opportunityId: string;
  rule: { id: string; versionNumber: number };
  offerings: readonly [OfferingFixture, OfferingFixture];
}

interface OfferingFixture {
  id: string;
  definitionId: string;
  tariff: { id: string; versionNumber: number };
}

withPostgres('Pricing Snapshots REST', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let origin: string;
  let pool: Pool;

  async function openHarness(): Promise<void> {
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      serverClock,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Pricing Snapshot Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'snapshot-configuration-member',
            workspaceId: WORKSPACE_ID,
          },
          {
            provider: 'deterministic-test',
            subject: 'snapshot-pricing-only-member',
            workspaceId: WORKSPACE_ID,
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
      namePrefix: 'pricing_snapshots',
    });
    await openHarness();
  });

  beforeEach(async () => {
    instant = new Date('2026-04-01T00:00:00.000Z');
    clockSequence = [];
    await pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });

  it('calculates the exact worked example and replays, reloads and reopens its immutable trace after configuration moves', async () => {
    const fixture = await prepared('expiring');
    const body = calculationBody(fixture);
    const path = snapshotsPath(fixture.opportunityId);
    const created = snapshot(
      await command(path, body, 'worked-example', fixture.companyId),
    );
    expect(created).toMatchObject({
      opportunityId: fixture.opportunityId,
      clientRequestId: fixture.requestId,
      pricingRuleVersion: {
        id: fixture.rule.id,
        versionNumber: 1,
        ruleShape: 'UNIT_PRICE_TIMES_QUANTITY',
        roundingMode: 'HALF_UP',
        roundingScale: 2,
        taxApplication: 'PER_LINE',
      },
      currency: 'EUR',
      subtotal: '308.64',
      taxTotal: '38.08',
      total: '346.72',
      calculatedAt: '2026-04-01T00:00:00.000Z',
      committedAt: '2026-04-01T00:00:00.000Z',
      version: 1,
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      lines: [
        expect.objectContaining({
          position: 1,
          offeringId: fixture.offerings[0].id,
          tariffVersionNumber: 1,
          quantity: '2.5',
          unitAmount: '123.4500',
          taxRatePercent: '12.34',
          rawLineAmount: '308.6250000',
          lineNet: '308.63',
          rawLineTax: '38.0849420',
          lineTax: '38.08',
        }),
        expect.objectContaining({
          position: 2,
          offeringId: fixture.offerings[1].id,
          tariffVersionNumber: 1,
          quantity: '1',
          unitAmount: '0.0050',
          rawLineAmount: '0.0050000',
          lineNet: '0.01',
          rawLineTax: '0.0000000',
          lineTax: '0.00',
        }),
      ],
    });

    const stored = await pool.query(
      `SELECT s.id, s.subtotal, s.tax_total, s.total, s.calculated_at, s.committed_at,
              l.line_number, l.quantity, l.quantity_input, l.raw_line_amount,
              l.line_net, l.raw_line_tax, l.line_tax
         FROM pricing_snapshots s
         JOIN pricing_snapshot_lines l
           ON l.workspace_id = s.workspace_id
          AND l.company_id = s.company_id
          AND l.snapshot_id = s.id
        ORDER BY l.line_number`,
    );
    expect(stored.rows).toEqual([
      expect.objectContaining({
        id: created.id,
        subtotal: '308.64',
        tax_total: '38.08',
        total: '346.72',
        line_number: 1,
        quantity: '2.500',
        quantity_input: '2.5',
        raw_line_amount: '308.6250000',
      }),
      expect.objectContaining({
        id: created.id,
        line_number: 2,
        quantity: '1.000',
        quantity_input: '1',
        raw_line_amount: '0.0050000',
      }),
    ]);
    expect(
      (
        await pool.query(
          `SELECT count(*)::integer AS line_count,
                  bool_and(raw_line_tax = line_net * tax_rate_percent / 100)
                    AS stored_tax_trace_matches,
                  sum(line_net)::numeric(24, 2)::text AS reproduced_subtotal,
                  sum(round(line_net * tax_rate_percent / 100, 2))::numeric(24, 2)::text
                    AS reproduced_tax_total,
                  (sum(line_net)
                    + sum(round(line_net * tax_rate_percent / 100, 2)))::numeric(24, 2)::text
                    AS reproduced_total
             FROM pricing_snapshot_lines
            WHERE snapshot_id = $1`,
          [created.id],
        )
      ).rows,
    ).toEqual([
      {
        line_count: 2,
        stored_tax_trace_matches: true,
        reproduced_subtotal: '308.64',
        reproduced_tax_total: '38.08',
        reproduced_total: '346.72',
      },
    ]);
    expect(
      (
        await pool.query(
          `SELECT count(*)::integer AS line_count,
                  bool_and(l.tariff_version_number = t.version_number
                    AND l.unit_amount = t.unit_amount
                    AND l.tax_rate_percent = t.tax_rate_percent) AS tariff_trace_matches,
                  max(s.pricing_rule_version_number) = max(r.version_number) AS rule_trace_matches,
                  bool_and(l.raw_line_tax
                    = round(l.quantity * t.unit_amount, 2) * t.tax_rate_percent / 100)
                    AS rounded_line_net_tax_matches,
                  sum(round(l.quantity * t.unit_amount, 2))::numeric(24, 2)::text
                    AS reproduced_subtotal,
                  sum(round(round(l.quantity * t.unit_amount, 2)
                    * t.tax_rate_percent / 100, 2))::numeric(24, 2)::text
                    AS reproduced_tax_total,
                  (sum(round(l.quantity * t.unit_amount, 2))
                    + sum(round(round(l.quantity * t.unit_amount, 2)
                      * t.tax_rate_percent / 100, 2)))::numeric(24, 2)::text
                    AS reproduced_total
             FROM pricing_snapshots s
             JOIN pricing_rule_versions r
               ON r.workspace_id = s.workspace_id
              AND r.company_id = s.company_id
              AND r.id = s.pricing_rule_version_id
             JOIN pricing_snapshot_lines l
               ON l.workspace_id = s.workspace_id
              AND l.company_id = s.company_id
              AND l.snapshot_id = s.id
             JOIN tariff_versions t
               ON t.workspace_id = l.workspace_id
              AND t.company_id = l.company_id
              AND t.id = l.tariff_version_id
            WHERE s.id = $1`,
          [created.id],
        )
      ).rows,
    ).toEqual([
      {
        line_count: 2,
        tariff_trace_matches: true,
        rule_trace_matches: true,
        rounded_line_net_tax_matches: true,
        reproduced_subtotal: '308.64',
        reproduced_tax_total: '38.08',
        reproduced_total: '346.72',
      },
    ]);
    expect(
      (
        await pool.query(
          `SELECT command, outcome, result_pricing_snapshot_id
             FROM pricing_configuration_commands
            WHERE command = 'pricing_snapshot.calculate'`,
        )
      ).rows,
    ).toEqual([
      {
        command: 'pricing_snapshot.calculate',
        outcome: 'CREATED',
        result_pricing_snapshot_id: created.id,
      },
    ]);
    expect(
      (
        await pool.query(
          `SELECT action, pricing_snapshot_id, metadata
             FROM pricing_configuration_events
            WHERE action = 'pricing_snapshot.created'`,
        )
      ).rows,
    ).toEqual([
      {
        action: 'pricing_snapshot.created',
        pricing_snapshot_id: created.id,
        metadata: {
          pricingSnapshotId: created.id,
          opportunityId: fixture.opportunityId,
          lineCount: 2,
          provenance: 'ILLUSTRATIVE',
          currency: 'EUR',
        },
      },
    ]);

    const successorStart = '2026-04-01T00:00:01.000Z';
    await command(
      '/pricing-configuration/rule-versions',
      {
        label: 'Illustrative scheduled successor',
        effectiveFrom: successorStart,
        expectedActiveVersionNumber: 1,
      },
      'rule-successor',
      fixture.companyId,
    );
    for (const [index, offering] of fixture.offerings.entries())
      await command(
        `/pricing-configuration/offerings/${offering.id}/tariff-versions`,
        {
          unit: 'illustrative-unit',
          unitAmount: index === 0 ? '123.4500' : '0.0050',
          currency: 'EUR',
          taxRatePercent: index === 0 ? '12.34' : '0',
          taxLabel: 'Illustrative scheduled successor',
          effectiveFrom: successorStart,
          expectedActiveVersionNumber: 1,
        },
        `tariff-successor-${index + 1}`,
        fixture.companyId,
      );
    instant = new Date('2026-04-01T00:00:03.000Z');
    const replay = snapshot(
      await command(path, body, 'worked-example', fixture.companyId),
    );
    expect(replay).toEqual(created);
    expect(
      (await request(`${path}/${created.id}`, fixture.companyId)).status,
    ).toBe(200);
    const page = await json(
      await request(`${path}?limit=25`, fixture.companyId),
    );
    expect(page).toEqual({ items: [created] });

    await harness.close();
    await openHarness();
    expect(
      snapshot(
        await json(await request(`${path}/${created.id}`, fixture.companyId)),
      ),
    ).toEqual(created);
    expect(
      (
        await pool.query(
          `SELECT count(*)::integer AS snapshots,
                  (SELECT count(*)::integer FROM pricing_snapshot_lines) AS lines,
                  (SELECT count(*)::integer FROM pricing_configuration_events
                    WHERE action = 'pricing_snapshot.created') AS events,
                  (SELECT count(*)::integer FROM pricing_configuration_commands
                    WHERE command = 'pricing_snapshot.calculate') AS receipts
             FROM pricing_snapshots`,
        )
      ).rows,
    ).toEqual([{ snapshots: 1, lines: 2, events: 1, receipts: 1 }]);
  });

  it('creates, lists and reopens the exact maximum 20-line trace through REST and PostgreSQL', async () => {
    const fixture = await prepared();
    instant = new Date(instant.getTime() + 1);
    for (const offering of fixture.offerings)
      await publishTariff(
        fixture.companyId,
        offering.id,
        1,
        '9999999.9999',
        'EUR',
        `maximum-successor-${offering.id}`,
        '100.00',
      );
    const additionalOfferings = await Promise.all(
      Array.from({ length: 18 }, (_, index) =>
        createOffering(
          fixture.companyId,
          `MAX-${String(index + 3).padStart(2, '0')}`,
          '9999999.9999',
          'EUR',
          instant.toISOString(),
          undefined,
          '100.00',
        ),
      ),
    );
    const offerings = [
      ...fixture.offerings.map((offering) => ({
        ...offering,
        versionNumber: 2,
      })),
      ...additionalOfferings.map((offering) => ({
        ...offering,
        versionNumber: 1,
      })),
    ];
    const body = {
      pricingRuleVersionNumber: fixture.rule.versionNumber,
      lines: offerings.map((offering) => ({
        offeringId: offering.id,
        tariffVersionNumber: offering.versionNumber,
        quantity: '999999999.999',
      })),
    };
    const path = snapshotsPath(fixture.opportunityId);
    const created = snapshot(
      await command(path, body, 'maximum-20-line-trace', fixture.companyId),
    );

    expect(created).toMatchObject({
      subtotal: '199999999997800000.00',
      taxTotal: '199999999997800000.00',
      total: '399999999995600000.00',
    });
    expect(
      created.lines.map((value) => {
        const line = record(value);
        return {
          quantity: line.quantity,
          unitAmount: line.unitAmount,
          taxRatePercent: line.taxRatePercent,
          rawLineAmount: line.rawLineAmount,
          lineNet: line.lineNet,
          rawLineTax: line.rawLineTax,
          lineTax: line.lineTax,
        };
      }),
    ).toEqual(
      Array.from({ length: 20 }, () => ({
        quantity: '999999999.999',
        unitAmount: '9999999.9999',
        taxRatePercent: '100.00',
        rawLineAmount: '9999999999890000.0000001',
        lineNet: '9999999999890000.00',
        rawLineTax: '9999999999890000.0000000',
        lineTax: '9999999999890000.00',
      })),
    );
    expect(
      await json(await request(`${path}?limit=25`, fixture.companyId)),
    ).toEqual({ items: [created] });
    expect(
      snapshot(
        await json(await request(`${path}/${created.id}`, fixture.companyId)),
      ),
    ).toEqual(created);
    expect(
      (
        await pool.query(
          `SELECT s.subtotal, s.tax_total, s.total,
                  l.line_number, l.quantity, l.quantity_input, l.unit_amount,
                  l.tax_rate_percent, l.raw_line_amount, l.line_net,
                  l.raw_line_tax, l.line_tax
             FROM pricing_snapshots s
             JOIN pricing_snapshot_lines l
               ON l.workspace_id = s.workspace_id
              AND l.company_id = s.company_id
              AND l.snapshot_id = s.id
            WHERE s.id = $1
            ORDER BY l.line_number`,
          [created.id],
        )
      ).rows,
    ).toEqual(
      Array.from({ length: 20 }, (_, index) => ({
        subtotal: '199999999997800000.00',
        tax_total: '199999999997800000.00',
        total: '399999999995600000.00',
        line_number: index + 1,
        quantity: '999999999.999',
        quantity_input: '999999999.999',
        unit_amount: '9999999.9999',
        tax_rate_percent: '100.00',
        raw_line_amount: '9999999999890000.0000001',
        line_net: '9999999999890000.00',
        raw_line_tax: '9999999999890000.0000000',
        line_tax: '9999999999890000.00',
      })),
    );
  });

  it('keeps Client context live through union and hides only that projection without Client authority', async () => {
    const fixture = await prepared();
    const originalClient = entity(
      await command(
        '/clients',
        { displayName: 'Original snapshot Client' },
        'snapshot-original-client',
        fixture.companyId,
      ),
    );
    const linkedIntake = record(
      await command(
        '/commercial-intake/requests',
        {
          originalText:
            'Synthetic linked request for an illustrative calculation.',
          sourceLabel: 'Synthetic Client projection proof',
          subject: 'Linked illustrative pricing proof',
          clientAccountId: originalClient.id,
          opportunity: {
            title: 'Linked illustrative Opportunity',
            scope: 'Synthetic linked scope',
            nextAction: 'Review the linked illustrative snapshot',
          },
        },
        'snapshot-linked-request',
        fixture.companyId,
      ),
    );
    const linkedFixture: Fixture = {
      ...fixture,
      requestId: stringField(linkedIntake, 'id'),
      opportunityId: stringField(record(linkedIntake.initialOpportunity), 'id'),
    };
    const created = snapshot(
      await command(
        snapshotsPath(linkedFixture.opportunityId),
        calculationBody(linkedFixture),
        'snapshot-client-projection',
        fixture.companyId,
      ),
    );
    expect(created.clientReference).toEqual({
      originalClientId: originalClient.id,
      displayName: 'Original snapshot Client',
    });

    // Workspace Client management exposes the original reference above.
    // Current dossier navigation additionally requires Company Client read.
    await command(
      '/company-director-client-assignments',
      {
        companyId: fixture.companyId,
        workspaceMembershipId: fixture.membershipId,
      },
      'snapshot-original-company-client-read',
    );

    const otherCompany = entity(
      await command(
        '/companies',
        { displayName: 'Illustrative union Company' },
        'snapshot-union-company',
      ),
    );
    for (const path of [
      '/company-commercial-intake-assignments',
      '/company-director-client-assignments',
    ])
      await command(
        path,
        {
          companyId: otherCompany.id,
          workspaceMembershipId: fixture.membershipId,
        },
        `snapshot-union-grant-${path}`,
      );
    const currentClient = entity(
      await command(
        '/clients',
        { displayName: 'Current snapshot Client' },
        'snapshot-current-client',
        otherCompany.id,
      ),
    );
    await pool.query(
      'UPDATE client_accounts SET tax_id = $1 WHERE id IN ($2, $3)',
      ['SNAPSHOT-UNION', originalClient.id, currentClient.id],
    );
    const review = record(
      await command(
        `/clients/${originalClient.id}/union-reviews`,
        {},
        'snapshot-union-review',
        fixture.companyId,
      ),
    );
    await command(
      `/client-union-reviews/${stringField(review, 'reviewReference')}/confirm`,
      {
        canonicalClientId: currentClient.id,
        fields: {
          displayName: currentClient.id,
          taxId: currentClient.id,
          address: currentClient.id,
          telephone: currentClient.id,
          generalEmail: currentClient.id,
          businessActivity: currentClient.id,
        },
        companyIds: [fixture.companyId, otherCompany.id],
        reviewedDifferences: true,
        reason: 'Same synthetic Client identity.',
      },
      'snapshot-union-confirm',
      fixture.companyId,
    );
    const afterUnion = snapshot(
      await json(
        await request(
          `${snapshotsPath(linkedFixture.opportunityId)}/${created.id}`,
          fixture.companyId,
        ),
      ),
    );
    expect(afterUnion).toEqual({
      ...created,
      clientReference: {
        originalClientId: originalClient.id,
        currentClientId: currentClient.id,
        displayName: 'Original snapshot Client',
      },
    });

    const restrictedHeaders = memberHeaders('snapshot-pricing-only-member');
    const restrictedActor = record(
      await json(
        await request('/access/current-actor', undefined, {
          headers: restrictedHeaders,
        }),
      ),
    );
    for (const path of [
      '/company-context-assignments',
      ASSIGNMENTS.intake,
      ASSIGNMENTS.pricing,
    ])
      await command(
        path,
        {
          companyId: fixture.companyId,
          workspaceMembershipId: stringField(
            restrictedActor,
            'workspaceMembershipId',
          ),
        },
        `snapshot-restricted-grant-${path}`,
      );
    const restrictedResponse = await request(
      `${snapshotsPath(linkedFixture.opportunityId)}/${created.id}`,
      fixture.companyId,
      { headers: restrictedHeaders },
    );
    expect(restrictedResponse.status).toBe(200);
    const restrictedSnapshot = record(await json(restrictedResponse));
    expect(restrictedSnapshot).not.toHaveProperty('clientReference');
    expect(JSON.stringify(restrictedSnapshot)).not.toContain(
      'Current snapshot Client',
    );
    expect(JSON.stringify(restrictedSnapshot)).not.toContain(originalClient.id);
    expect(JSON.stringify(restrictedSnapshot)).not.toContain(currentClient.id);
    expect(JSON.stringify(restrictedSnapshot)).not.toContain(
      'Original snapshot Client',
    );
    expect(restrictedSnapshot.total).toBe('346.72');
  });

  it('orders Client association with Pricing on the Request lock and never changes an existing snapshot', async () => {
    for (const associationFirst of [true, false]) {
      const fixture = await prepared();
      const client = entity(
        await command(
          '/clients',
          {
            displayName: associationFirst
              ? 'Associated before Pricing'
              : 'Associated after Pricing',
          },
          `pricing-association-client-${associationFirst}`,
          fixture.companyId,
        ),
      );
      const barrier = await holdTransaction(async (connection) => {
        await connection.query(
          'SELECT id FROM client_requests WHERE id = $1 FOR UPDATE',
          [fixture.requestId],
        );
      });
      let association: Promise<Response> | undefined;
      let calculation: Promise<Response> | undefined;
      try {
        const startAssociation = () =>
          post(
            `/commercial-intake/requests/${fixture.requestId}/client-association`,
            { expectedVersion: 1, clientAccountId: client.id },
            `pricing-association-${associationFirst}`,
            fixture.companyId,
          );
        const startCalculation = () =>
          post(
            snapshotsPath(fixture.opportunityId),
            calculationBody(fixture),
            `pricing-association-snapshot-${associationFirst}`,
            fixture.companyId,
          );
        if (associationFirst) {
          association = startAssociation();
          await waitForBlockedBy(barrier.backendPid);
          calculation = startCalculation();
        } else {
          calculation = startCalculation();
          await waitForBlockedBy(barrier.backendPid);
          association = startAssociation();
        }
        await waitForBlockedCount(barrier.backendPid, 2);
      } finally {
        await release(barrier);
      }
      if (!association || !calculation)
        throw new Error('Expected both Request writers to start.');
      const [associationResponse, calculationResponse] = await Promise.all([
        association,
        calculation,
      ]);
      expect(associationResponse.status).toBe(200);
      expect(calculationResponse.status).toBe(201);
      const created = snapshot(await json(calculationResponse));
      if (associationFirst)
        expect(created.clientReference).toEqual({
          originalClientId: client.id,
          displayName: 'Associated before Pricing',
        });
      else expect(created).not.toHaveProperty('clientReference');

      const reloaded = snapshot(
        await json(
          await request(
            `${snapshotsPath(fixture.opportunityId)}/${created.id}`,
            fixture.companyId,
          ),
        ),
      );
      expect(reloaded).toEqual(created);
      expect(
        (
          await pool.query(
            `SELECT
               (SELECT count(*)::integer FROM pricing_snapshots WHERE client_request_id = $1) AS snapshots,
               (SELECT count(*)::integer FROM commercial_intake_client_association_commands WHERE client_request_id = $1) AS associations`,
            [fixture.requestId],
          )
        ).rows,
      ).toEqual([{ snapshots: 1, associations: 1 }]);
    }
  });

  it('refuses invalid, unknown, stale, not-effective and mixed-currency declarations without partial writes', async () => {
    const fixture = await prepared();
    const path = snapshotsPath(fixture.opportunityId);
    for (const [quantity, status] of [
      ['00', 400],
      ['01', 400],
      ['00.50', 400],
      ['0', 400],
      ['1.0000', 400],
      ['1000000000', 400],
      [2.5, 400],
    ] as const) {
      const response = await post(
        path,
        {
          ...calculationBody(fixture),
          lines: [
            {
              offeringId: fixture.offerings[0].id,
              tariffVersionNumber: 1,
              quantity,
            },
          ],
        },
        `invalid-${String(quantity)}`,
        fixture.companyId,
      );
      expect(response.status).toBe(status);
    }
    const unknown = await post(
      path,
      {
        pricingRuleVersionNumber: 999,
        lines: calculationBody(fixture).lines,
      },
      'unknown-rule',
      fixture.companyId,
    );
    expect(unknown.status).toBe(404);
    const unknownTariff = await post(
      path,
      {
        ...calculationBody(fixture),
        lines: calculationBody(fixture).lines.map((line, index) =>
          index === 0 ? { ...line, tariffVersionNumber: 999 } : line,
        ),
      },
      'unknown-tariff',
      fixture.companyId,
    );
    expect(unknownTariff.status).toBe(404);

    instant = new Date('2026-04-02T00:00:00.000Z');
    await publishRule(fixture.companyId, 1, 'rule-v2');
    const stale = await post(
      path,
      calculationBody(fixture),
      'stale-rule',
      fixture.companyId,
    );
    expect(stale.status).toBe(409);
    expect(await json(stale)).toEqual({
      code: 'STALE_PRICING_RULE_VERSION',
      message: 'The declared version has been taken over.',
      headVersionNumber: 2,
    });

    const futureFixture = await prepared('future-rule');
    const notEffective = await post(
      snapshotsPath(futureFixture.opportunityId),
      calculationBody(futureFixture),
      'not-effective',
      futureFixture.companyId,
    );
    expect(notEffective.status).toBe(409);
    expect(record(await json(notEffective)).code).toBe(
      'PRICING_RULE_NOT_EFFECTIVE',
    );

    const tariffFutureFixture = await prepared('future-tariff');
    const tariffNotEffective = await post(
      snapshotsPath(tariffFutureFixture.opportunityId),
      calculationBody(tariffFutureFixture),
      'tariff-not-effective',
      tariffFutureFixture.companyId,
    );
    expect(tariffNotEffective.status).toBe(409);
    expect(await json(tariffNotEffective)).toMatchObject({
      code: 'TARIFF_NOT_EFFECTIVE',
      linePosition: 1,
    });

    const tariffStaleFixture = await prepared();
    instant = new Date(instant.getTime() + 1_000);
    await publishTariff(
      tariffStaleFixture.companyId,
      tariffStaleFixture.offerings[0].id,
      1,
      '123.4500',
      'EUR',
      'tariff-v2',
    );
    const tariffStale = await post(
      snapshotsPath(tariffStaleFixture.opportunityId),
      calculationBody(tariffStaleFixture),
      'stale-tariff',
      tariffStaleFixture.companyId,
    );
    expect(tariffStale.status).toBe(409);
    expect(await json(tariffStale)).toMatchObject({
      code: 'STALE_TARIFF_VERSION',
      headVersionNumber: 2,
      linePosition: 1,
    });

    const mixedFixture = await prepared('mixed');
    const mixed = await post(
      snapshotsPath(mixedFixture.opportunityId),
      calculationBody(mixedFixture),
      'mixed-currency',
      mixedFixture.companyId,
    );
    expect(mixed.status).toBe(409);
    expect(record(await json(mixed)).code).toBe('MIXED_CURRENCY');
    expect(
      (
        await pool.query(
          `SELECT count(*)::integer AS snapshots,
                  (SELECT count(*)::integer FROM pricing_snapshot_lines) AS lines,
                  (SELECT count(*)::integer FROM pricing_configuration_events
                    WHERE action = 'pricing_snapshot.created') AS events,
                  (SELECT count(*)::integer FROM pricing_configuration_commands
                    WHERE command = 'pricing_snapshot.calculate') AS receipts
             FROM pricing_snapshots`,
        )
      ).rows,
    ).toEqual([{ snapshots: 0, lines: 0, events: 0, receipts: 0 }]);
  });

  it('checks declared rule and Tariff Versions against their fixed-instant v1-v2-v3 state', async () => {
    instant = new Date('2025-12-31T00:00:00.000Z');
    const tariffFixture = await prepared('future-tariff');
    instant = new Date('2025-12-31T00:00:01.000Z');
    for (const offering of tariffFixture.offerings)
      for (const [versionNumber, effectiveFrom, effectiveTo] of [
        [2, '2026-03-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'],
        [3, '2026-04-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'],
      ] as const)
        await command(
          `/pricing-configuration/offerings/${offering.id}/tariff-versions`,
          {
            unit: 'illustrative-unit',
            unitAmount:
              offering.id === tariffFixture.offerings[0].id
                ? '123.4500'
                : '0.0050',
            currency: 'EUR',
            taxRatePercent:
              offering.id === tariffFixture.offerings[0].id ? '12.34' : '0',
            taxLabel: 'Illustrative tax',
            effectiveFrom,
            effectiveTo,
            expectedActiveVersionNumber: versionNumber - 1,
          },
          `state-tariff-${offering.id}-${versionNumber}`,
          tariffFixture.companyId,
        );

    const tariffPath = snapshotsPath(tariffFixture.opportunityId);
    const tariffBody = (tariffVersion: number) => ({
      pricingRuleVersionNumber: 1,
      lines: tariffFixture.offerings.map((offering, index) => ({
        offeringId: offering.id,
        tariffVersionNumber: tariffVersion,
        quantity: index === 0 ? '2.5' : '1',
      })),
    });
    for (const [at, declaredVersions] of [
      [
        '2025-12-31T23:59:59.000Z',
        [
          [1, 409, 'TARIFF_NOT_EFFECTIVE'],
          [2, 409, 'TARIFF_NOT_EFFECTIVE'],
          [3, 409, 'TARIFF_NOT_EFFECTIVE'],
        ],
      ],
      [
        '2026-01-01T00:00:00.000Z',
        [
          [1, 201, undefined],
          [2, 409, 'TARIFF_NOT_EFFECTIVE'],
          [3, 409, 'TARIFF_NOT_EFFECTIVE'],
        ],
      ],
      [
        '2026-02-15T12:00:00.000Z',
        [
          [1, 201, undefined],
          [2, 409, 'TARIFF_NOT_EFFECTIVE'],
          [3, 409, 'TARIFF_NOT_EFFECTIVE'],
        ],
      ],
      [
        '2026-03-01T00:00:00.000Z',
        [
          [1, 409, 'STALE_TARIFF_VERSION'],
          [2, 201, undefined],
          [3, 409, 'TARIFF_NOT_EFFECTIVE'],
        ],
      ],
      [
        '2026-04-01T00:00:00.000Z',
        [
          [1, 409, 'STALE_TARIFF_VERSION'],
          [2, 409, 'STALE_TARIFF_VERSION'],
          [3, 201, undefined],
        ],
      ],
      [
        '2026-04-30T23:59:59.000Z',
        [
          [1, 409, 'STALE_TARIFF_VERSION'],
          [2, 409, 'STALE_TARIFF_VERSION'],
          [3, 201, undefined],
        ],
      ],
      [
        '2026-05-01T00:00:00.000Z',
        [
          [1, 409, 'STALE_TARIFF_VERSION'],
          [2, 409, 'STALE_TARIFF_VERSION'],
          [3, 409, 'TARIFF_NOT_EFFECTIVE'],
        ],
      ],
      [
        '2026-07-01T00:00:00.000Z',
        [
          [1, 409, 'STALE_TARIFF_VERSION'],
          [2, 409, 'STALE_TARIFF_VERSION'],
          [3, 409, 'TARIFF_NOT_EFFECTIVE'],
        ],
      ],
    ] as const) {
      for (const [tariffVersion, status, code] of declaredVersions) {
        instant = new Date(at);
        const before = (await readSnapshotWriteState(tariffFixture)).rows;
        const response = await post(
          tariffPath,
          tariffBody(tariffVersion),
          `tariff-state-${at}-${tariffVersion}`,
          tariffFixture.companyId,
        );
        expect({ at, tariffVersion, status: response.status }).toEqual({
          at,
          tariffVersion,
          status,
        });
        if (code === undefined) {
          expect(snapshot(await json(response))).toMatchObject({
            total: '346.72',
          });
        } else {
          expect(record(await json(response)).code).toBe(code);
          expect((await readSnapshotWriteState(tariffFixture)).rows).toEqual(
            before,
          );
        }
      }
    }
    expect((await readSnapshotWriteState(tariffFixture)).rows).toEqual([
      { snapshots: 5, lines: 10, events: 5, receipts: 5 },
    ]);

    instant = new Date('2025-12-31T00:00:00.000Z');
    const ruleFixture = await prepared('future-rule');
    instant = new Date('2025-12-31T00:00:01.000Z');
    for (const [versionNumber, effectiveFrom, effectiveTo] of [
      [2, '2026-03-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'],
      [3, '2026-04-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'],
    ] as const)
      await command(
        '/pricing-configuration/rule-versions',
        {
          label: `Illustrative rule ${versionNumber}`,
          effectiveFrom,
          effectiveTo,
          expectedActiveVersionNumber: versionNumber - 1,
        },
        `state-rule-${versionNumber}`,
        ruleFixture.companyId,
      );

    const rulePath = snapshotsPath(ruleFixture.opportunityId);
    for (const [at, ruleVersion, status, code] of [
      ['2026-01-01T00:00:00.000Z', 1, 201, undefined],
      ['2026-02-15T12:00:00.000Z', 2, 409, 'PRICING_RULE_NOT_EFFECTIVE'],
      ['2026-03-01T00:00:00.000Z', 1, 409, 'STALE_PRICING_RULE_VERSION'],
      ['2026-03-01T00:00:00.000Z', 2, 201, undefined],
      ['2026-04-01T00:00:00.000Z', 2, 409, 'STALE_PRICING_RULE_VERSION'],
      ['2026-04-01T00:00:00.000Z', 3, 201, undefined],
      ['2026-06-01T00:00:00.000Z', 3, 409, 'PRICING_RULE_NOT_EFFECTIVE'],
    ] as const) {
      instant = new Date(at);
      const before = (await readSnapshotWriteState(ruleFixture)).rows;
      const response = await post(
        rulePath,
        {
          ...calculationBody(ruleFixture),
          pricingRuleVersionNumber: ruleVersion,
        },
        `rule-state-${at}-${ruleVersion}`,
        ruleFixture.companyId,
      );
      expect({ at, ruleVersion, status: response.status }).toEqual({
        at,
        ruleVersion,
        status,
      });
      if (code === undefined) {
        expect(snapshot(await json(response))).toMatchObject({
          total: '346.72',
        });
      } else {
        expect(record(await json(response)).code).toBe(code);
        expect((await readSnapshotWriteState(ruleFixture)).rows).toEqual(
          before,
        );
      }
    }
    expect((await readSnapshotWriteState(ruleFixture)).rows).toEqual([
      { snapshots: 3, lines: 6, events: 3, receipts: 3 },
    ]);
  });

  it('converges concurrent retries and revalidates Pricing User and Opportunity authority before replay', async () => {
    const fixture = await prepared();
    const path = snapshotsPath(fixture.opportunityId);
    const body = calculationBody(fixture);
    const retryLock = await holdAdvisoryLock('pricing-concurrent-retry-insert');
    let retries: [Response, Response] | undefined;
    try {
      await pool.query(`
        CREATE FUNCTION test_pause_concurrent_retry() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM pg_advisory_xact_lock(hashtextextended('pricing-concurrent-retry-insert', 0));
          RETURN NEW;
        END $$;
        CREATE TRIGGER test_pause_concurrent_retry
          BEFORE INSERT ON pricing_snapshots
          FOR EACH ROW EXECUTE FUNCTION test_pause_concurrent_retry();
      `);
      const firstRetry = post(
        path,
        body,
        'concurrent-retry',
        fixture.companyId,
      );
      const firstPid = await waitForBlockedBy(retryLock.backendPid, true);
      const secondRetry = post(
        path,
        body,
        'concurrent-retry',
        fixture.companyId,
      );
      await waitForBlockedBy(firstPid);
      await release(retryLock);
      retries = await Promise.all([firstRetry, secondRetry]);
    } finally {
      await release(retryLock);
      await pool.query(
        'DROP TRIGGER IF EXISTS test_pause_concurrent_retry ON pricing_snapshots; DROP FUNCTION IF EXISTS test_pause_concurrent_retry()',
      );
    }
    if (!retries) throw new Error('Concurrent retries did not settle.');
    const [left, right] = retries;
    expect([left.status, right.status]).toEqual([201, 201]);
    const first = snapshot(await json(left));
    expect(snapshot(await json(right))).toEqual(first);
    expect((await readSnapshotWriteState(fixture)).rows).toEqual([
      { snapshots: 1, lines: 2, events: 1, receipts: 1 },
    ]);
    const changed = await post(
      path,
      {
        ...body,
        lines: body.lines.map((line, index) =>
          index === 0 ? { ...line, quantity: '2.50' } : line,
        ),
      },
      'concurrent-retry',
      fixture.companyId,
    );
    expect(changed.status).toBe(409);
    expect(record(await json(changed)).code).toBe('IDEMPOTENCY_CONFLICT');
    const reordered = await post(
      path,
      { ...body, lines: [...body.lines].reverse() },
      'concurrent-retry',
      fixture.companyId,
    );
    expect(reordered.status).toBe(409);
    expect(record(await json(reordered)).code).toBe('IDEMPOTENCY_CONFLICT');

    const pricingRevocation = await holdRevocation(
      fixture,
      'company_pricing_user',
    );
    const revokedReplay = post(
      path,
      body,
      'concurrent-retry',
      fixture.companyId,
    );
    try {
      await waitForBlockedBy(pricingRevocation.backendPid);
    } finally {
      await release(pricingRevocation);
    }
    expect((await revokedReplay).status).toBe(403);
    expect(
      (await request(`${path}/${first.id}`, fixture.companyId)).status,
    ).toBe(403);

    const targetFixture = await prepared();
    const targetPath = snapshotsPath(targetFixture.opportunityId);
    const targetBody = calculationBody(targetFixture);
    const crossCompany = await post(
      path,
      body,
      'cross-company-target',
      targetFixture.companyId,
    );
    expect(crossCompany.status).toBe(404);
    expect(await json(crossCompany)).not.toHaveProperty('headVersionNumber');
    expect(
      (
        await request(
          `${targetPath}/00000000-0000-4000-8000-000000000999`,
          targetFixture.companyId,
        )
      ).status,
    ).toBe(404);
    const targetSnapshot = snapshot(
      await command(
        targetPath,
        targetBody,
        'target-replay',
        targetFixture.companyId,
      ),
    );
    const foreignWorkspace = await seedForeignWorkspaceSnapshot();
    const unknownResponse = await request(
      `${targetPath}/00000000-0000-4000-8000-000000000999`,
      targetFixture.companyId,
    );
    const safeNotFoundBody = await unknownResponse.text();
    expect(unknownResponse.status).toBe(404);
    for (const response of [
      await request(`${path}?limit=25`, targetFixture.companyId),
      await request(`${path}/${first.id}`, targetFixture.companyId),
      await post(path, body, 'concurrent-retry', targetFixture.companyId),
      await request(
        `${snapshotsPath(foreignWorkspace.opportunityId)}?limit=25`,
        targetFixture.companyId,
      ),
      await request(
        `${snapshotsPath(foreignWorkspace.opportunityId)}/${foreignWorkspace.snapshotId}`,
        targetFixture.companyId,
      ),
      await post(
        snapshotsPath(foreignWorkspace.opportunityId),
        targetBody,
        'foreign-workspace-retry',
        targetFixture.companyId,
      ),
    ]) {
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(safeNotFoundBody);
    }
    const targetRevocation = await holdRevocation(
      targetFixture,
      'company_commercial_intake',
    );
    const hiddenReplay = post(
      targetPath,
      targetBody,
      'target-replay',
      targetFixture.companyId,
    );
    try {
      await waitForBlockedBy(targetRevocation.backendPid);
    } finally {
      await release(targetRevocation);
    }
    expect((await hiddenReplay).status).toBe(403);
    expect(
      (
        await request(
          `${targetPath}/${targetSnapshot.id}`,
          targetFixture.companyId,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await pool.query(
          `SELECT company_id, count(*)::integer AS snapshots
             FROM pricing_snapshots
            GROUP BY company_id
            ORDER BY company_id`,
        )
      ).rows,
    ).toEqual(
      [fixture.companyId, targetFixture.companyId, foreignWorkspace.companyId]
        .sort()
        .map((company_id) => ({ company_id, snapshots: 1 })),
    );
  });

  it('records a later committedAt without rechecking a validity boundary passed after calculatedAt', async () => {
    const fixture = await prepared('expiring');
    const calculatedAt = new Date(instant.getTime());
    const committedAt = new Date(instant.getTime() + 2_000);
    clockSequence = [calculatedAt, committedAt];
    const created = snapshot(
      await command(
        snapshotsPath(fixture.opportunityId),
        calculationBody(fixture),
        'boundary-crossed-after-check',
        fixture.companyId,
      ),
    );
    expect(created).toMatchObject({
      calculatedAt: calculatedAt.toISOString(),
      committedAt: committedAt.toISOString(),
      total: '346.72',
    });
  });

  it('lists one Opportunity newest first through a stable bounded cursor', async () => {
    const fixture = await prepared();
    const path = snapshotsPath(fixture.opportunityId);
    const body = calculationBody(fixture);
    for (let index = 0; index < 27; index += 1) {
      instant = new Date(
        `2026-04-01T00:00:${String(index).padStart(2, '0')}.000Z`,
      );
      expect(
        (
          await post(
            path,
            body,
            `pagination-${String(index).padStart(2, '0')}`,
            fixture.companyId,
          )
        ).status,
      ).toBe(201);
    }
    const first = record(
      await json(await request(`${path}?limit=25`, fixture.companyId)),
    );
    if (!Array.isArray(first.items)) throw new Error('Expected first page.');
    expect(first.items).toHaveLength(25);
    const cursor = stringField(first, 'nextCursor');
    const second = record(
      await json(
        await request(
          `${path}?limit=25&cursor=${encodeURIComponent(cursor)}`,
          fixture.companyId,
        ),
      ),
    );
    if (!Array.isArray(second.items)) throw new Error('Expected second page.');
    expect(second.items).toHaveLength(2);
    expect(second).not.toHaveProperty('nextCursor');
    const listedIds = [...first.items, ...second.items].map((value) =>
      stringField(record(value), 'id'),
    );
    expect(listedIds).toEqual(
      (
        await pool.query<{ id: string }>(
          `SELECT id FROM pricing_snapshots
            WHERE workspace_id = $1 AND company_id = $2 AND opportunity_id = $3
            ORDER BY calculated_at DESC, id DESC`,
          [WORKSPACE_ID, fixture.companyId, fixture.opportunityId],
        )
      ).rows.map(({ id }) => id),
    );
  });

  it('holds publication behind a calculation until its checked snapshot commits', async () => {
    const fixture = await prepared();
    await prepareConfigurationMember(fixture);
    const calculationInstant = instant.toISOString();
    const triggerLock = await holdAdvisoryLock('pricing-snapshot-insert');
    try {
      await pool.query(`
        CREATE FUNCTION test_pause_snapshot_insert() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM pg_advisory_xact_lock(hashtextextended('pricing-snapshot-insert', 0));
          RETURN NEW;
        END $$;
        CREATE TRIGGER test_pause_snapshot_insert
          BEFORE INSERT ON pricing_snapshots
          FOR EACH ROW EXECUTE FUNCTION test_pause_snapshot_insert();
      `);
      const calculation = post(
        snapshotsPath(fixture.opportunityId),
        calculationBody(fixture),
        'barrier-calculation',
        fixture.companyId,
      );
      const calculationPid = await waitForBlockedBy(
        triggerLock.backendPid,
        true,
      );
      instant = new Date('2026-04-02T00:00:00.000Z');
      const publication = post(
        '/pricing-configuration/rule-versions',
        ruleBody(1),
        'barrier-publication',
        fixture.companyId,
        CONFIGURATION_MEMBER,
      );
      await waitForBlockedBy(calculationPid, true);
      await release(triggerLock);
      const calculationResponse = await calculation;
      expect(calculationResponse.status).toBe(201);
      const created = snapshot(await json(calculationResponse));
      expect(created).toMatchObject({
        calculatedAt: calculationInstant,
        pricingRuleVersion: { id: fixture.rule.id, versionNumber: 1 },
        total: '346.72',
      });
      const publicationResponse = await publication;
      expect(publicationResponse.status).toBe(201);
      expect(record(await json(publicationResponse)).version).toMatchObject({
        versionNumber: 2,
        createdAt: instant.toISOString(),
      });
    } finally {
      await release(triggerLock);
      await pool.query(
        'DROP TRIGGER IF EXISTS test_pause_snapshot_insert ON pricing_snapshots; DROP FUNCTION IF EXISTS test_pause_snapshot_insert()',
      );
    }
  });

  it('waits for publication before checking and refusing a taken-over declared rule', async () => {
    const fixture = await prepared();
    await prepareConfigurationMember(fixture);
    const publicationLock = await holdAdvisoryLock('pricing-rule-insert');
    try {
      await pool.query(`
        CREATE FUNCTION test_pause_rule_insert() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM pg_advisory_xact_lock(hashtextextended('pricing-rule-insert', 0));
          RETURN NEW;
        END $$;
        CREATE TRIGGER test_pause_rule_insert
          BEFORE INSERT ON pricing_rule_versions
          FOR EACH ROW EXECUTE FUNCTION test_pause_rule_insert();
      `);
      instant = new Date(instant.getTime() + 1_000);
      const heldPublication = post(
        '/pricing-configuration/rule-versions',
        ruleBody(1),
        'publication-first',
        fixture.companyId,
        CONFIGURATION_MEMBER,
      );
      const publicationPid = await waitForBlockedBy(
        publicationLock.backendPid,
        true,
      );
      const waitingCalculation = post(
        snapshotsPath(fixture.opportunityId),
        calculationBody(fixture),
        'calculation-second',
        fixture.companyId,
      );
      await waitForBlockedBy(publicationPid, true);
      await release(publicationLock);
      expect((await heldPublication).status).toBe(201);
      const staleCalculation = await waitingCalculation;
      expect(staleCalculation.status).toBe(409);
      expect(record(await json(staleCalculation)).code).toBe(
        'STALE_PRICING_RULE_VERSION',
      );
      expect((await readSnapshotWriteState(fixture)).rows).toEqual([
        { snapshots: 0, lines: 0, events: 0, receipts: 0 },
      ]);
    } finally {
      await release(publicationLock);
      await pool.query(
        'DROP TRIGGER IF EXISTS test_pause_rule_insert ON pricing_rule_versions; DROP FUNCTION IF EXISTS test_pause_rule_insert()',
      );
    }
  });

  it.each([
    ['pricing_snapshots', 'fail-snapshot', ''],
    ['pricing_snapshot_lines', 'fail-line', ''],
    [
      'pricing_configuration_events',
      'fail-event',
      "WHEN (NEW.action = 'pricing_snapshot.created')",
    ],
    [
      'pricing_configuration_commands',
      'fail-receipt',
      "WHEN (NEW.command = 'pricing_snapshot.calculate')",
    ],
  ] as const)(
    'rolls back every snapshot write and releases publication after a %s failure',
    async (table, key, triggerWhen) => {
      const fixture = await prepared();
      await prepareConfigurationMember(fixture);
      const path = snapshotsPath(fixture.opportunityId);
      const functionName = `test_fail_${table}`;
      const beforeFailure = (await readSnapshotWriteState(fixture)).rows;
      expect(beforeFailure).toEqual([
        { snapshots: 0, lines: 0, events: 0, receipts: 0 },
      ]);
      const failureLock = await holdAdvisoryLock(key);
      try {
        await pool.query(`
        CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM pg_advisory_xact_lock(hashtextextended('${key}', 0));
          RAISE EXCEPTION 'injected ${table} failure';
        END $$;
        CREATE TRIGGER ${functionName}
          BEFORE INSERT ON ${table}
          FOR EACH ROW ${triggerWhen}
          EXECUTE FUNCTION ${functionName}();
      `);
        const failedCalculation = post(
          path,
          calculationBody(fixture),
          key,
          fixture.companyId,
        );
        const calculationPid = await waitForBlockedBy(
          failureLock.backendPid,
          true,
        );
        instant = new Date(instant.getTime() + 1_000);
        let publicationSettled = false;
        const waitingPublication = post(
          '/pricing-configuration/rule-versions',
          ruleBody(1),
          `publication-after-${key}`,
          fixture.companyId,
          CONFIGURATION_MEMBER,
        ).then((response) => {
          publicationSettled = true;
          return response;
        });
        await waitForBlockedBy(calculationPid, true);
        expect(publicationSettled).toBe(false);
        await release(failureLock);
        expect((await failedCalculation).status).toBe(500);
        expect((await waitingPublication).status).toBe(201);
        expect(publicationSettled).toBe(true);
      } finally {
        await release(failureLock);
        await pool.query(`
        DROP TRIGGER IF EXISTS ${functionName} ON ${table};
        DROP FUNCTION IF EXISTS ${functionName}()
      `);
      }
      expect((await readSnapshotWriteState(fixture)).rows).toEqual(
        beforeFailure,
      );
      expect(
        (
          await post(
            path,
            {
              pricingRuleVersionNumber: 2,
              lines: calculationBody(fixture).lines,
            },
            key,
            fixture.companyId,
          )
        ).status,
      ).toBe(201);
      expect((await readSnapshotWriteState(fixture)).rows).toEqual([
        { snapshots: 1, lines: 2, events: 1, receipts: 1 },
      ]);
      expect(
        (
          await pool.query(`
      SELECT count(*)::integer AS snapshots FROM pricing_snapshots
       WHERE id NOT IN (
         SELECT result_pricing_snapshot_id FROM pricing_configuration_commands
          WHERE command = 'pricing_snapshot.calculate'
       )
    `)
        ).rows,
      ).toEqual([{ snapshots: 0 }]);
    },
  );

  function readSnapshotWriteState(fixture: Fixture) {
    return pool.query(
      `SELECT
         (SELECT count(*)::integer FROM pricing_snapshots
           WHERE workspace_id = $1 AND company_id = $2) AS snapshots,
         (SELECT count(*)::integer FROM pricing_snapshot_lines
           WHERE workspace_id = $1 AND company_id = $2) AS lines,
         (SELECT count(*)::integer FROM pricing_configuration_events
           WHERE workspace_id = $1 AND company_id = $2
             AND action = 'pricing_snapshot.created') AS events,
         (SELECT count(*)::integer FROM pricing_configuration_commands
           WHERE workspace_id = $1 AND company_id = $2
             AND command = 'pricing_snapshot.calculate') AS receipts`,
      [WORKSPACE_ID, fixture.companyId],
    );
  }

  async function seedForeignWorkspaceSnapshot(): Promise<{
    companyId: string;
    opportunityId: string;
    snapshotId: string;
  }> {
    const workspaceId = '00000000-0000-4000-8000-000000000419';
    const ruleId = '00000000-0000-4000-8000-000000000420';
    const requestId = '00000000-0000-4000-8000-000000000421';
    const opportunityId = '00000000-0000-4000-8000-000000000422';
    const snapshotId = '00000000-0000-4000-8000-000000000423';
    const inserted = await pool.query(
      `WITH foreign_workspace AS (
         INSERT INTO workspaces (id, name)
         VALUES ($1, 'Foreign Pricing Snapshot Workspace')
         RETURNING id
       ), foreign_user AS (
         INSERT INTO internal_users (
           external_provider, external_subject, display_name, email
         ) VALUES (
           'deterministic-test', 'foreign-snapshot-owner',
           'Foreign Snapshot Owner', 'foreign-snapshot@example.test'
         )
         RETURNING id
       ), foreign_membership AS (
         INSERT INTO workspace_memberships (workspace_id, internal_user_id)
         SELECT foreign_workspace.id, foreign_user.id
           FROM foreign_workspace, foreign_user
         RETURNING id, workspace_id, internal_user_id
       ), foreign_company AS (
         INSERT INTO companies (
           workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id, registration_idempotency_key
         )
         SELECT workspace_id, 'Foreign Snapshot Company', internal_user_id,
                id, 'foreign-snapshot-company'
           FROM foreign_membership
         RETURNING id, workspace_id
       ), foreign_rule AS (
         INSERT INTO pricing_rule_versions (
           id, workspace_id, company_id, version_number, label, effective_from,
           created_by_internal_user_id, created_by_workspace_membership_id,
           created_at
         )
         SELECT $2, foreign_membership.workspace_id, foreign_company.id, 1,
                'Foreign illustrative rule', TIMESTAMPTZ '2026-01-01 00:00:00+00',
                foreign_membership.internal_user_id, foreign_membership.id,
                TIMESTAMPTZ '2026-01-01 00:00:00+00'
           FROM foreign_membership
           JOIN foreign_company
             ON foreign_company.workspace_id = foreign_membership.workspace_id
         RETURNING id, workspace_id, company_id, version_number
       ), foreign_request AS (
         INSERT INTO client_requests (
           id, workspace_id, company_id, original_text,
           captured_by_internal_user_id, captured_by_workspace_membership_id,
           captured_at
         )
         SELECT $3, foreign_membership.workspace_id, foreign_company.id,
                'Synthetic foreign Workspace request.',
                foreign_membership.internal_user_id, foreign_membership.id,
                TIMESTAMPTZ '2026-04-01 00:00:00+00'
           FROM foreign_membership
           JOIN foreign_company
             ON foreign_company.workspace_id = foreign_membership.workspace_id
         RETURNING id, workspace_id, company_id
       ), foreign_opportunity AS (
         INSERT INTO opportunities (
           id, workspace_id, company_id, client_request_id, title, next_action,
           responsible_internal_user_id, responsible_workspace_membership_id,
           created_at
         )
         SELECT $4, foreign_request.workspace_id, foreign_request.company_id,
                foreign_request.id, 'Foreign illustrative Opportunity',
                'Keep this foreign snapshot hidden', foreign_membership.internal_user_id,
                foreign_membership.id, TIMESTAMPTZ '2026-04-01 00:00:00+00'
           FROM foreign_request
           JOIN foreign_membership
             ON foreign_membership.workspace_id = foreign_request.workspace_id
         RETURNING id, workspace_id, company_id, client_request_id
       )
       INSERT INTO pricing_snapshots (
         id, workspace_id, company_id, opportunity_id, client_request_id,
         pricing_rule_version_id, pricing_rule_version_number, rule_shape,
         rounding_mode, rounding_scale, tax_application, currency, subtotal,
         tax_total, total, calculated_by_internal_user_id,
         calculated_by_workspace_membership_id, calculated_at, committed_at
       )
       SELECT $5, foreign_opportunity.workspace_id, foreign_opportunity.company_id,
              foreign_opportunity.id, foreign_opportunity.client_request_id,
              foreign_rule.id, foreign_rule.version_number,
              'UNIT_PRICE_TIMES_QUANTITY', 'HALF_UP', 2, 'PER_LINE', 'EUR',
              1, 0, 1, foreign_membership.internal_user_id,
              foreign_membership.id, TIMESTAMPTZ '2026-04-01 00:00:00+00',
              TIMESTAMPTZ '2026-04-01 00:00:00+00'
         FROM foreign_opportunity
         JOIN foreign_rule
           ON foreign_rule.workspace_id = foreign_opportunity.workspace_id
          AND foreign_rule.company_id = foreign_opportunity.company_id
         JOIN foreign_membership
           ON foreign_membership.workspace_id = foreign_opportunity.workspace_id
       RETURNING id, company_id`,
      [workspaceId, ruleId, requestId, opportunityId, snapshotId],
    );
    if (inserted.rowCount !== 1)
      throw new Error('Expected one foreign Workspace Pricing Snapshot.');
    const foreignSnapshot = record(inserted.rows[0]);
    return {
      companyId: stringField(foreignSnapshot, 'company_id'),
      opportunityId,
      snapshotId,
    };
  }

  async function prepareConfigurationMember(fixture: Fixture): Promise<void> {
    // A separate actor avoids profile synchronization waiting on the first
    // actor's locked Internal User before reaching the pricing scope lock.
    const actor = record(
      await json(
        await request('/access/current-actor', undefined, {
          headers: CONFIGURATION_MEMBER,
        }),
      ),
    );
    for (const path of [
      '/company-context-assignments',
      ASSIGNMENTS.configuration,
    ])
      await command(
        path,
        {
          companyId: fixture.companyId,
          workspaceMembershipId: stringField(actor, 'workspaceMembershipId'),
        },
        `configuration-member-${path}`,
      );
  }

  async function prepared(
    variant:
      | 'current'
      | 'future-rule'
      | 'future-tariff'
      | 'expiring'
      | 'mixed' = 'current',
  ): Promise<Fixture> {
    const company = entity(
      await command(
        '/companies',
        { displayName: `Illustrative Company ${crypto.randomUUID()}` },
        `company-${crypto.randomUUID()}`,
      ),
    );
    const actor = record(
      await json(await request('/access/current-actor', company.id)),
    );
    const membershipId = stringField(actor, 'workspaceMembershipId');
    for (const path of Object.values(ASSIGNMENTS))
      await command(
        path,
        { workspaceMembershipId: membershipId, companyId: company.id },
        `grant-${path}-${crypto.randomUUID()}`,
      );
    const rule = published(
      await command(
        '/pricing-configuration/rule-versions',
        {
          label: 'Illustrative unit pricing',
          effectiveFrom:
            variant === 'future-rule'
              ? new Date(instant.getTime() + 86_400_000).toISOString()
              : instant.toISOString(),
          ...(variant === 'expiring'
            ? {
                effectiveTo: new Date(instant.getTime() + 1_000).toISOString(),
              }
            : {}),
          expectedActiveVersionNumber: null,
        },
        `rule-${crypto.randomUUID()}`,
        company.id,
      ),
    );
    const offeringA = await createOffering(
      company.id,
      'SERVICE-A',
      '123.4500',
      'EUR',
      variant === 'future-tariff'
        ? new Date(instant.getTime() + 86_400_000).toISOString()
        : instant.toISOString(),
      variant === 'expiring'
        ? new Date(instant.getTime() + 1_000).toISOString()
        : undefined,
    );
    const offeringB = await createOffering(
      company.id,
      'SERVICE-B',
      '0.0050',
      variant === 'mixed' ? 'USD' : 'EUR',
      variant === 'future-tariff'
        ? new Date(instant.getTime() + 86_400_000).toISOString()
        : instant.toISOString(),
      variant === 'expiring'
        ? new Date(instant.getTime() + 1_000).toISOString()
        : undefined,
    );
    const intake = record(
      await command(
        '/commercial-intake/requests',
        {
          originalText: 'Synthetic request for an illustrative calculation.',
          sourceLabel: 'Synthetic REST proof',
          subject: 'Illustrative pricing proof',
          opportunity: {
            title: 'Illustrative Opportunity',
            scope: 'Synthetic scope',
            nextAction: 'Review the illustrative snapshot',
          },
        },
        `request-${crypto.randomUUID()}`,
        company.id,
      ),
    );
    return {
      companyId: company.id,
      membershipId,
      requestId: stringField(intake, 'id'),
      opportunityId: stringField(record(intake.initialOpportunity), 'id'),
      rule,
      offerings: [offeringA, offeringB],
    };
  }

  async function createOffering(
    companyId: string,
    code: string,
    amount: string,
    currency: 'EUR' | 'USD',
    effectiveFrom: string,
    effectiveTo?: string,
    taxRatePercent?: string,
  ): Promise<OfferingFixture> {
    const definitionResult = record(
      await command(
        '/commercial-catalogue/service-definitions',
        { code, name: `Illustrative ${code}`, description: null },
        `definition-${code}-${crypto.randomUUID()}`,
        companyId,
      ),
    );
    const definition = entity(definitionResult.definition);
    const offeringResult = record(
      await command(
        '/commercial-catalogue/offerings',
        { serviceDefinitionId: definition.id, commercialLabel: null },
        `offering-${code}-${crypto.randomUUID()}`,
        companyId,
      ),
    );
    const offering = entity(offeringResult.offering);
    const tariff = published(
      await command(
        `/pricing-configuration/offerings/${offering.id}/tariff-versions`,
        {
          unit: 'illustrative-unit',
          unitAmount: amount,
          currency,
          taxRatePercent:
            taxRatePercent ?? (code === 'SERVICE-A' ? '12.34' : '0'),
          taxLabel: 'Illustrative tax',
          effectiveFrom,
          ...(effectiveTo ? { effectiveTo } : {}),
          expectedActiveVersionNumber: null,
        },
        `tariff-${code}-${crypto.randomUUID()}`,
        companyId,
      ),
    );
    return { id: offering.id, definitionId: definition.id, tariff };
  }

  async function publishRule(
    companyId: string,
    expected: number,
    key: string,
  ): Promise<void> {
    await command(
      '/pricing-configuration/rule-versions',
      ruleBody(expected),
      key,
      companyId,
    );
  }

  async function publishTariff(
    companyId: string,
    offeringId: string,
    expected: number,
    unitAmount: string,
    currency: 'EUR' | 'USD',
    key: string,
    taxRatePercent = '12.34',
  ): Promise<void> {
    await command(
      `/pricing-configuration/offerings/${offeringId}/tariff-versions`,
      {
        unit: 'illustrative-unit',
        unitAmount,
        currency,
        taxRatePercent,
        taxLabel: 'Illustrative tax successor',
        effectiveFrom: instant.toISOString(),
        expectedActiveVersionNumber: expected,
      },
      key,
      companyId,
    );
  }

  async function holdTransaction(
    acquire: (connection: PoolClient) => Promise<void>,
  ): Promise<HeldTransaction> {
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      const backend = await connection.query<{ backendPid: number }>(
        'SELECT pg_backend_pid() AS "backendPid"',
      );
      const backendPid = backend.rows[0]?.backendPid;
      if (backendPid === undefined) throw new Error('Missing blocker backend.');
      await acquire(connection);
      return { connection, backendPid, released: false };
    } catch (error) {
      try {
        await connection.query('ROLLBACK');
      } finally {
        connection.release();
      }
      throw error;
    }
  }

  async function holdAdvisoryLock(key: string): Promise<HeldTransaction> {
    return holdTransaction(async (connection) => {
      await connection.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [key],
      );
    });
  }

  async function holdRevocation(
    fixture: Fixture,
    bundle: 'company_pricing_user' | 'company_commercial_intake',
  ): Promise<HeldTransaction> {
    return holdTransaction(async (connection) => {
      const revoked = await connection.query(
        `UPDATE company_role_assignments
            SET revoked_at = now(), updated_at = now()
          WHERE workspace_id = $1 AND company_id = $2
            AND workspace_membership_id = $3
            AND bundle::text = $4 AND revoked_at IS NULL
          RETURNING id`,
        [WORKSPACE_ID, fixture.companyId, fixture.membershipId, bundle],
      );
      if (revoked.rowCount !== 1)
        throw new Error(`Expected one ${bundle} assignment to revoke.`);
    });
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

  async function waitForBlockedBy(
    backendPid: number,
    advisory = false,
  ): Promise<number> {
    // Observe the actual holder -> waiter edge, not unrelated advisory locks.
    // Fail before Vitest's test deadline so finally can release held clients.
    const deadline = Date.now() + 2_000;
    do {
      const result = await pool.query<{ pid: number }>(
        `SELECT pid FROM pg_stat_activity
          WHERE datname = current_database()
            AND $1::integer = ANY(pg_blocking_pids(pid))
            AND (NOT $2::boolean OR wait_event = 'advisory')`,
        [backendPid, advisory],
      );
      const waiter = result.rows[0];
      if (waiter) return waiter.pid;
      await new Promise((resolve) => setTimeout(resolve, 25));
    } while (Date.now() < deadline);
    const activity = await pool.query(
      `SELECT pid, wait_event_type, wait_event, pg_blocking_pids(pid) AS blockers,
              left(query, 240) AS query
         FROM pg_stat_activity WHERE datname = current_database()`,
    );
    throw new Error(
      `No ${advisory ? 'advisory ' : ''}waiter behind backend ${backendPid}: ${JSON.stringify(activity.rows)}`,
    );
  }

  async function waitForBlockedCount(
    backendPid: number,
    expected: number,
  ): Promise<void> {
    const deadline = Date.now() + 2_000;
    do {
      const result = await pool.query<{ count: string }>(
        `SELECT count(*) AS count FROM pg_stat_activity
          WHERE datname = current_database()
            AND $1::integer = ANY(pg_blocking_pids(pid))`,
        [backendPid],
      );
      if (Number(result.rows[0]?.count) >= expected) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    } while (Date.now() < deadline);
    throw new Error(
      `Fewer than ${expected} Request waiters behind backend ${backendPid}.`,
    );
  }

  async function request(
    path: string,
    companyId?: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return fetch(`${origin}/api${path}`, {
      ...init,
      headers: {
        ...OWNER,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        ...Object.fromEntries(new Headers(init.headers).entries()),
      },
    });
  }

  async function post(
    path: string,
    body: unknown,
    key: string,
    companyId?: string,
    headers: Readonly<Record<string, string>> = OWNER,
  ): Promise<Response> {
    return request(path, companyId, {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify(body),
    });
  }

  async function command(
    path: string,
    body: unknown,
    key: string,
    companyId?: string,
  ): Promise<unknown> {
    const response = await post(path, body, key, companyId);
    const value = await json(response);
    expect({ path, status: response.status, value }).toMatchObject({
      status: 201,
    });
    return value;
  }
});

function calculationBody(fixture: Fixture) {
  return {
    pricingRuleVersionNumber: fixture.rule.versionNumber,
    lines: [
      {
        offeringId: fixture.offerings[0].id,
        tariffVersionNumber: fixture.offerings[0].tariff.versionNumber,
        quantity: '2.5',
      },
      {
        offeringId: fixture.offerings[1].id,
        tariffVersionNumber: fixture.offerings[1].tariff.versionNumber,
        quantity: '1',
      },
    ],
  };
}

function ruleBody(expectedActiveVersionNumber: number) {
  return {
    label: `Illustrative rule ${expectedActiveVersionNumber + 1}`,
    effectiveFrom: instant.toISOString(),
    expectedActiveVersionNumber,
  };
}

function snapshotsPath(opportunityId: string): string {
  return `/pricing/opportunities/${opportunityId}/snapshots`;
}

function published(value: unknown): { id: string; versionNumber: number } {
  const result = record(value);
  expect(result.outcome).toBe('PUBLISHED');
  const version = record(result.version);
  return {
    id: stringField(version, 'id'),
    versionNumber: numberField(version, 'versionNumber'),
  };
}

function snapshot(value: unknown): Record<string, unknown> & {
  id: string;
  lines: unknown[];
} {
  const result = record(value);
  if (!Array.isArray(result.lines)) throw new Error('Expected snapshot lines.');
  return { ...result, id: stringField(result, 'id'), lines: result.lines };
}

function entity(value: unknown): { id: string } {
  return { id: stringField(record(value), 'id') };
}

async function json(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  return body;
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

function memberHeaders(subject: string): Record<string, string> {
  return {
    'x-test-external-provider': 'deterministic-test',
    'x-test-external-subject': subject,
    'x-test-display-name': subject,
    'x-test-email': `${subject}@example.test`,
  };
}
