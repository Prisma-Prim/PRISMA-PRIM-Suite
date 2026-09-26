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
    const fixture = await prepared();
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

    instant = new Date('2026-04-02T00:00:00.000Z');
    await publishRule(fixture.companyId, 1, 'rule-successor');
    await publishTariff(
      fixture.companyId,
      fixture.offerings[0].id,
      1,
      '123.4500',
      'EUR',
      'tariff-successor',
    );
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
      currentClientId: originalClient.id,
      displayName: 'Original snapshot Client',
    });

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
    expect(afterUnion.clientReference).toEqual({
      originalClientId: originalClient.id,
      currentClientId: currentClient.id,
      displayName: 'Current snapshot Client',
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
    expect(restrictedSnapshot.total).toBe('346.72');
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
      statusCode: 409,
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

  it('converges concurrent retries and revalidates Pricing User and Opportunity authority before replay', async () => {
    const fixture = await prepared();
    const path = snapshotsPath(fixture.opportunityId);
    const body = calculationBody(fixture);
    const [left, right] = await Promise.all([
      post(path, body, 'concurrent-retry', fixture.companyId),
      post(path, body, 'concurrent-retry', fixture.companyId),
    ]);
    expect([left.status, right.status]).toEqual([201, 201]);
    const first = snapshot(await json(left));
    expect(snapshot(await json(right))).toEqual(first);
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
    await waitForBlockedBy(pricingRevocation.backendPid);
    await release(pricingRevocation);
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
    await waitForBlockedBy(targetRevocation.backendPid);
    await release(targetRevocation);
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
    ).toEqual([
      { company_id: fixture.companyId, snapshots: 1 },
      { company_id: targetFixture.companyId, snapshots: 1 },
    ]);
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

  it('serializes calculation against publication and rolls back snapshot, lines, event and receipt at every injected write failure', async () => {
    const fixture = await prepared();
    const path = snapshotsPath(fixture.opportunityId);
    const triggerLock = await holdAdvisoryLock('pricing-snapshot-insert');
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
      path,
      calculationBody(fixture),
      'barrier-calculation',
      fixture.companyId,
    );
    await waitForBlockedBy(triggerLock.backendPid);
    instant = new Date('2026-04-02T00:00:00.000Z');
    const publication = post(
      '/pricing-configuration/rule-versions',
      ruleBody(1),
      'barrier-publication',
      fixture.companyId,
    );
    await waitForAdvisoryWaiters(2);
    await release(triggerLock);
    expect((await calculation).status).toBe(201);
    expect((await publication).status).toBe(201);
    await pool.query(
      'DROP TRIGGER test_pause_snapshot_insert ON pricing_snapshots; DROP FUNCTION test_pause_snapshot_insert()',
    );

    // Reverse ordering: publication holds the rule scope exclusively while
    // its insert is paused. Calculation waits, samples only after publication
    // commits, and refuses the declared predecessor as stale.
    const reverse = await prepared();
    const publicationLock = await holdAdvisoryLock('pricing-rule-insert');
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
      reverse.companyId,
    );
    await waitForBlockedBy(publicationLock.backendPid);
    const waitingCalculation = post(
      snapshotsPath(reverse.opportunityId),
      calculationBody(reverse),
      'calculation-second',
      reverse.companyId,
    );
    await waitForAdvisoryWaiters(2);
    await release(publicationLock);
    expect((await heldPublication).status).toBe(201);
    const staleCalculation = await waitingCalculation;
    expect(staleCalculation.status).toBe(409);
    expect(record(await json(staleCalculation)).code).toBe(
      'STALE_PRICING_RULE_VERSION',
    );
    await pool.query(
      'DROP TRIGGER test_pause_rule_insert ON pricing_rule_versions; DROP FUNCTION test_pause_rule_insert()',
    );

    for (const [table, key, triggerWhen] of [
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
    ] as const) {
      const failed = await prepared();
      const failedPath = snapshotsPath(failed.opportunityId);
      const functionName = `test_fail_${table}`;
      const readSnapshotWriteState = () =>
        pool.query(
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
          [WORKSPACE_ID, failed.companyId],
        );
      const beforeFailure = (await readSnapshotWriteState()).rows;
      expect(beforeFailure).toEqual([
        { snapshots: 0, lines: 0, events: 0, receipts: 0 },
      ]);
      const failureLock = await holdAdvisoryLock(key);
      let released = false;
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
        failedPath,
        calculationBody(failed),
        key,
        failed.companyId,
      );
      await waitForBlockedBy(failureLock.backendPid);
      instant = new Date(instant.getTime() + 1_000);
      let publicationSettled = false;
      const waitingPublication = post(
        '/pricing-configuration/rule-versions',
        ruleBody(1),
        `publication-after-${key}`,
        failed.companyId,
      ).then((response) => {
        publicationSettled = true;
        return response;
      });
      await waitForAdvisoryWaiters(2);
      expect(publicationSettled).toBe(false);
      try {
        await release(failureLock);
        released = true;
        expect((await failedCalculation).status).toBe(500);
        expect((await waitingPublication).status).toBe(201);
        expect(publicationSettled).toBe(true);
      } finally {
        if (!released) await release(failureLock);
        await pool.query(`
          DROP TRIGGER ${functionName} ON ${table};
          DROP FUNCTION ${functionName}()
        `);
      }
      expect((await readSnapshotWriteState()).rows).toEqual(beforeFailure);
      expect(
        (
          await post(
            failedPath,
            {
              pricingRuleVersionNumber: 2,
              lines: calculationBody(failed).lines,
            },
            key,
            failed.companyId,
          )
        ).status,
      ).toBe(201);
    }
    expect(
      (
        await pool.query(
          `SELECT count(*)::integer AS snapshots FROM pricing_snapshots
            WHERE id NOT IN (
              SELECT result_pricing_snapshot_id FROM pricing_configuration_commands
               WHERE command = 'pricing_snapshot.calculate'
            )`,
        )
      ).rows,
    ).toEqual([{ snapshots: 0 }]);
  });

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
          taxRatePercent: code === 'SERVICE-A' ? '12.34' : '0',
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
  ): Promise<void> {
    await command(
      `/pricing-configuration/offerings/${offeringId}/tariff-versions`,
      {
        unit: 'illustrative-unit',
        unitAmount,
        currency,
        taxRatePercent: '12.34',
        taxLabel: 'Illustrative tax successor',
        effectiveFrom: instant.toISOString(),
        expectedActiveVersionNumber: expected,
      },
      key,
      companyId,
    );
  }

  async function holdAdvisoryLock(key: string): Promise<{
    connection: PoolClient;
    backendPid: number;
  }> {
    const connection = await pool.connect();
    await connection.query('BEGIN');
    const backend = await connection.query<{ backendPid: number }>(
      'SELECT pg_backend_pid() AS "backendPid"',
    );
    const backendPid = backend.rows[0]?.backendPid;
    if (backendPid === undefined) throw new Error('Missing blocker backend.');
    await connection.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [key],
    );
    return { connection, backendPid };
  }

  async function holdRevocation(
    fixture: Fixture,
    bundle: 'company_pricing_user' | 'company_commercial_intake',
  ): Promise<{ connection: PoolClient; backendPid: number }> {
    const connection = await pool.connect();
    await connection.query('BEGIN');
    const backend = await connection.query<{ backendPid: number }>(
      'SELECT pg_backend_pid() AS "backendPid"',
    );
    const backendPid = backend.rows[0]?.backendPid;
    if (backendPid === undefined)
      throw new Error('Missing revocation backend.');
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
    return { connection, backendPid };
  }

  async function release(lock: { connection: PoolClient }): Promise<void> {
    await lock.connection.query('COMMIT');
    lock.connection.release();
  }

  async function waitForBlockedBy(backendPid: number): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const result = await pool.query<{ blocked: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_stat_activity
            WHERE datname = current_database()
              AND $1::integer = ANY(pg_blocking_pids(pid))
         ) AS blocked`,
        [backendPid],
      );
      if (result.rows[0]?.blocked) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('The operation did not reach the observed barrier.');
  }

  async function waitForAdvisoryWaiters(count: number): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const result = await pool.query<{ waiting: number }>(
        `SELECT count(*)::integer AS waiting
           FROM pg_locks
          WHERE locktype = 'advisory' AND NOT granted
            AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
      );
      if (result.rows[0]?.waiting === count) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('The operations did not reach both advisory barriers.');
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
  ): Promise<Response> {
    return request(path, companyId, {
      method: 'POST',
      headers: {
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
    'x-test-external-subject': subject,
    'x-test-display-name': subject,
    'x-test-email': `${subject}@example.test`,
  };
}
