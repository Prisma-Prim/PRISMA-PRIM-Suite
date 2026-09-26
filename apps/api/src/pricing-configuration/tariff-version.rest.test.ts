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

// Every value below is synthetic and illustrative: no real unit, price, tax,
// currency pairing or legal effect.
const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000396';
const FOREIGN_WORKSPACE_ID = '00000000-0000-4000-8000-000000000397';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000999';
const RULE_SCOPE = '/pricing-configuration/rule-scope';
const RULE_VERSIONS = '/pricing-configuration/rule-versions';
const TARIFF_VERSIONS = '/pricing-configuration/tariff-versions';
const CONFIGURATION_ASSIGNMENTS = '/company-pricing-configuration-assignments';
const CATALOGUE_ASSIGNMENTS = '/company-service-catalogue-assignments';
const CONTEXT_ASSIGNMENTS = '/company-context-assignments';
const DEFINITIONS = '/commercial-catalogue/service-definitions';
const OFFERINGS = '/commercial-catalogue/offerings';
const CONFIGURATION_PERMISSIONS = [
  'commercial.offering.read',
  'commercial.pricing.configuration.read',
  'commercial.pricing.configuration.manage',
];
const TARIFF = {
  unit: 'illustrative-unit',
  unitAmount: '123.4500',
  currency: 'EUR',
  taxRatePercent: '12.34',
  taxLabel: 'Illustrative tax',
};
// The fields every read returns for these illustrative values.
const TARIFF_VIEW = {
  ...TARIFF,
  provenance: 'ILLUSTRATIVE',
  provisional: true,
};
const CONFIGURATION_MEMBER = memberHeaders('configuration-member');
const CATALOGUE_MEMBER = memberHeaders('catalogue-member');
const OTHER_MEMBER = memberHeaders('other-member');
// Every barrier contender and observer is its own member: requests of one
// member queue at actor resolution behind that member's authority locks.
const OBSERVERS = [
  memberHeaders('observer-a'),
  memberHeaders('observer-b'),
  memberHeaders('observer-c'),
] as const;

// Only the server clock boundary is replaced; every command and read samples
// it once, so each fixed instant below is the instant the server evaluates.
let serverInstant = new Date('2026-04-01T00:00:00.000Z');
const serverClock: ServerClock = {
  now: () => new Date(serverInstant.getTime()),
};
function setClock(value: string): void {
  serverInstant = new Date(value);
}

withPostgres('Tariff Versions REST', () => {
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
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Tariff Versions Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
          [
            'configuration-member',
            'catalogue-member',
            'other-member',
            'observer-a',
            'observer-b',
            'observer-c',
          ].map((subject) => ({
            provider: 'deterministic-test',
            subject,
            workspaceId: WORKSPACE_ID,
          })),
        ),
      },
    });
    ({ origin, pool } = harness);
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'tariff_versions',
    });
    await openHarness();
  });

  beforeEach(async () => {
    setClock('2026-04-01T00:00:00.000Z');
    await pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });

  it('publishes a scheduled first Tariff Version for one offering with no current one, and denies a Catalogue-only member', async () => {
    const company = entity(
      await command('/companies', { displayName: 'PRISMA-PRIM' }, 'company'),
    );
    const owner = await actorOf(company.id);
    await grant(CATALOGUE_ASSIGNMENTS, {
      workspaceMembershipId: owner.membershipId,
      companyId: company.id,
    });
    const offeringId = await offering(company.id, 'SERVICE-A');
    // Offering readability alone authorizes no tariff read.
    expect((await request(scopePath(offeringId), company.id)).status).toBe(403);
    await grant(CONFIGURATION_ASSIGNMENTS, {
      workspaceMembershipId: owner.membershipId,
      companyId: company.id,
    });
    expect(
      record(
        record(
          await (await request('/access/current-actor', company.id)).json(),
        ).activeCompany,
      ).pricingConfigurationPermissions,
    ).toEqual(CONFIGURATION_PERMISSIONS);

    const published = publication(
      await command(
        versionsPath(offeringId),
        {
          ...TARIFF,
          effectiveFrom: '2026-04-02T00:00:00Z',
          expectedActiveVersionNumber: null,
        },
        'tariff-a',
        company.id,
      ),
    );
    expect(published).toEqual({
      outcome: 'PUBLISHED',
      version: {
        id: published.version.id,
        offeringId,
        versionNumber: 1,
        ...TARIFF_VIEW,
        effectiveFrom: '2026-04-02T00:00:00.000Z',
        effectiveTo: null,
        state: 'SCHEDULED',
        supersession: null,
        createdByWorkspaceMembershipId: owner.membershipId,
        createdAt: '2026-04-01T00:00:00.000Z',
      },
    });
    const scope = await (
      await request(scopePath(offeringId), company.id)
    ).json();
    expect(scope).toEqual({
      offeringId,
      current: null,
      headVersionNumber: 1,
      provisional: true,
    });
    const page = await (
      await request(versionsPath(offeringId), company.id)
    ).json();
    expect(page).toEqual({ items: [published.version], provisional: true });
    expect(
      await (
        await request(versionPath(published.version.id), company.id)
      ).json(),
    ).toEqual(published.version);

    // The decimals are stored at their column precision.
    expect(
      (
        await pool.query(
          `SELECT unit_amount, tax_rate_percent, pg_typeof(unit_amount)::text AS amount_type,
                  pg_typeof(tax_rate_percent)::text AS rate_type, currency, provenance
             FROM tariff_versions`,
        )
      ).rows,
    ).toEqual([
      {
        unit_amount: '123.4500',
        tax_rate_percent: '12.34',
        amount_type: 'numeric',
        rate_type: 'numeric',
        currency: 'EUR',
        provenance: 'ILLUSTRATIVE',
      },
    ]);
    expect(
      (
        await pool.query(
          `SELECT action, company_id, tariff_version_id, pricing_rule_version_id,
                  actor_workspace_membership_id, occurred_at, metadata
             FROM pricing_configuration_events`,
        )
      ).rows,
    ).toEqual([
      {
        action: 'tariff_version.published',
        company_id: company.id,
        tariff_version_id: published.version.id,
        pricing_rule_version_id: null,
        actor_workspace_membership_id: owner.membershipId,
        occurred_at: new Date('2026-04-01T00:00:00.000Z'),
        metadata: {
          tariffVersionId: published.version.id,
          offeringId,
          versionNumber: 1,
          provenance: 'ILLUSTRATIVE',
          currency: 'EUR',
        },
      },
    ]);
    expect(
      (
        await pool.query(
          `SELECT command, outcome, idempotency_key, result_tariff_version_id,
                  result_pricing_rule_version_id, created_at
             FROM pricing_configuration_commands`,
        )
      ).rows,
    ).toEqual([
      {
        command: 'tariff_version.publish',
        outcome: 'PUBLISHED',
        idempotency_key: 'tariff-a',
        result_tariff_version_id: published.version.id,
        result_pricing_rule_version_id: null,
        created_at: new Date('2026-04-01T00:00:00.000Z'),
      },
    ]);
    // Recorded but projected by no Activity read surface.
    const activity = JSON.stringify(
      await (await request('/activity-log', company.id)).json(),
    );
    for (const hidden of [
      'tariff_version.published',
      published.version.id,
      '123.45',
      'Illustrative tax',
      'illustrative-unit',
    ])
      expect(activity).not.toContain(hidden);

    const catalogueMember = await member(CATALOGUE_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      CATALOGUE_ASSIGNMENTS,
    ]);
    // The Catalogue member reads the offering, never its tariffs.
    expect(
      (
        await request(`${OFFERINGS}/${offeringId}`, company.id, {
          headers: CATALOGUE_MEMBER,
        })
      ).status,
    ).toBe(200);
    for (const path of [
      scopePath(offeringId),
      versionsPath(offeringId),
      versionPath(published.version.id),
    ]) {
      const denied = await request(path, company.id, {
        headers: CATALOGUE_MEMBER,
      });
      expect(denied.status).toBe(403);
      expect(await denied.text()).not.toContain('123.4500');
    }
    const deniedPublication = await post(
      versionsPath(offeringId),
      company.id,
      {
        ...TARIFF,
        effectiveFrom: '2026-05-01T00:00:00Z',
        expectedActiveVersionNumber: 1,
      },
      'catalogue-member-tariff',
      CATALOGUE_MEMBER,
    );
    expect(deniedPublication.status).toBe(403);
    expect(await deniedPublication.text()).not.toContain('headVersionNumber');
    expect(catalogueMember.membershipId).not.toBe(owner.membershipId);
    await expectCounts({ versions: 1, receipts: 1, events: 1 });

    await harness.close();
    await openHarness();
    expect(
      await (await request(versionsPath(offeringId), company.id)).json(),
    ).toEqual(page);
    setClock('2026-04-02T00:00:00.000Z');
    expect(
      await (await request(scopePath(offeringId), company.id)).json(),
    ).toEqual({
      offeringId,
      current: { ...published.version, state: 'CURRENT' },
      headVersionNumber: 1,
      provisional: true,
    });
  }, 30_000);

  it('refuses every grammar violation on its own field without persistence, including U+0000 on each exact retry', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    const valid = {
      ...TARIFF,
      effectiveFrom: '2026-05-01T00:00:00Z',
      expectedActiveVersionNumber: null,
    };
    const refusedDecimals: unknown[] = [
      '00',
      '01',
      '00.50',
      '+1',
      '1e2',
      '1,5',
      ' 1',
      '1 ',
      '١',
      'NaN',
      'Infinity',
      '',
      12.5,
    ];
    const cases: Array<[unknown, string]> = [
      ...[...refusedDecimals, '0', '0.0000', '10000000', '1.23456'].map(
        (unitAmount): [unknown, string] => [
          { ...valid, unitAmount },
          'unitAmount',
        ],
      ),
      ...[...refusedDecimals, '100.01', '12.345'].map(
        (taxRatePercent): [unknown, string] => [
          { ...valid, taxRatePercent },
          'taxRatePercent',
        ],
      ),
      ...['eur', 'GBP', '', null].map((currency): [unknown, string] => [
        { ...valid, currency },
        'currency',
      ]),
      [{ ...valid, unit: '   ' }, 'unit'],
      [{ ...valid, unit: 'x'.repeat(25) }, 'unit'],
      [{ ...valid, unit: '😀'.repeat(25) }, 'unit'],
      [{ ...valid, taxLabel: '' }, 'taxLabel'],
      [{ ...valid, taxLabel: 'x'.repeat(61) }, 'taxLabel'],
      [{ ...valid, effectiveFrom: '2026-05-01T00:00:00' }, 'effectiveFrom'],
      [{ ...valid, effectiveFrom: '2026-02-30T00:00:00Z' }, 'effectiveFrom'],
      [{ ...valid, effectiveFrom: '2026-05-01T24:00:00Z' }, 'effectiveFrom'],
      [{ ...valid, effectiveTo: 'soon' }, 'effectiveTo'],
      [{ ...valid, effectiveTo: '2026-05-01T00:00:00Z' }, 'effectiveTo'],
      [{ ...valid, effectiveTo: '2026-04-30T23:59:59.999Z' }, 'effectiveTo'],
      [
        { ...valid, expectedActiveVersionNumber: 0 },
        'expectedActiveVersionNumber',
      ],
      [{ ...valid, offeringId }, 'tariffVersion'],
      [{ ...valid, provenance: 'REAL' }, 'tariffVersion'],
      [{ ...valid, versionNumber: 7 }, 'tariffVersion'],
      [{ ...valid, createdAt: '2026-04-01T00:00:00Z' }, 'tariffVersion'],
      [{ ...valid, supersededFrom: '2026-06-01T00:00:00Z' }, 'tariffVersion'],
      [[], 'tariffVersion'],
    ];
    for (const [body, field] of cases) {
      const response = await post(
        versionsPath(offeringId),
        company.id,
        body,
        crypto.randomUUID(),
      );
      expect({ body, status: response.status }).toEqual({
        body,
        status: 400,
      });
      expect(await response.json()).toMatchObject({
        code: 'VALIDATION_ERROR',
        field,
      });
    }
    // PostgreSQL text cannot store U+0000, so it is refused before any write
    // and an exact retry meets the same validation, never a server error.
    for (const [field, text] of [
      ['unit', 'unit\u0000A'],
      ['taxLabel', 'Tax\u0000label'],
    ] as const) {
      const key = crypto.randomUUID();
      for (const attempt of [1, 2]) {
        const response = await post(
          versionsPath(offeringId),
          company.id,
          { ...valid, [field]: text },
          key,
        );
        expect({ field, attempt, status: response.status }).toEqual({
          field,
          attempt,
          status: 400,
        });
        expect(await response.json()).toMatchObject({
          code: 'VALIDATION_ERROR',
          field,
        });
      }
    }
    const missingKey = await request(versionsPath(offeringId), company.id, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(valid),
    });
    expect(missingKey.status).toBe(400);
    await expectCounts({ versions: 0, receipts: 0, events: 0 });

    // Accepted values are stored verbatim and read back at column scale:
    // strings valid under the grammar and numerically equal to the input.
    const first = publication(
      await command(
        versionsPath(offeringId),
        {
          unit: '😀'.repeat(24),
          unitAmount: '12.5',
          currency: 'MDL',
          taxRatePercent: '20',
          taxLabel: 'Taxe ✓ 税 \u{1f600}',
          effectiveFrom: '2026-05-01T00:00:00Z',
          expectedActiveVersionNumber: null,
        },
        'column-scale',
        company.id,
      ),
    );
    expect(first.version).toMatchObject({
      unit: '😀'.repeat(24),
      unitAmount: '12.5000',
      currency: 'MDL',
      taxRatePercent: '20.00',
      taxLabel: 'Taxe ✓ 税 \u{1f600}',
    });
    for (const [unitAmount, taxRatePercent, expected] of [
      ['0.0001', '0', ['0.0001', '0.00']],
      ['9999999.9999', '100', ['9999999.9999', '100.00']],
      ['0.50', '0.50', ['0.5000', '0.50']],
    ] as const) {
      const versionNumber = numberField(
        scopeRecord(
          await (await request(scopePath(offeringId), company.id)).json(),
        ),
        'headVersionNumber',
      );
      const successor = publication(
        await command(
          versionsPath(offeringId),
          {
            ...TARIFF,
            unitAmount,
            taxRatePercent,
            effectiveFrom: `2026-06-0${versionNumber}T00:00:00Z`,
            expectedActiveVersionNumber: versionNumber,
          },
          `column-scale-${versionNumber}`,
          company.id,
        ),
      );
      expect([
        successor.version.unitAmount,
        successor.version.taxRatePercent,
      ]).toEqual(expected);
    }
    await expectCounts({ versions: 4, receipts: 4, events: 4 });
  }, 60_000);

  it('rejects a stale expectation naming only the offering head, replays before the stale check and writes only the takeover metadata', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    const first = {
      ...TARIFF,
      effectiveFrom: '2026-04-10T00:00:00Z',
      expectedActiveVersionNumber: null,
    };
    const v1 = publication(
      await command(versionsPath(offeringId), first, 'v1', company.id),
    );
    const before = await contentOf(v1.version.id);

    const nullWithHead = await post(
      versionsPath(offeringId),
      company.id,
      { ...first, unitAmount: '99' },
      'competing-first',
    );
    expect(nullWithHead.status).toBe(409);
    expect(await nullWithHead.json()).toEqual({
      code: 'STALE_ACTIVE_VERSION',
      message: expect.any(String),
      headVersionNumber: 1,
    });

    // A successor may declare another currency of the closed set; nothing
    // converts or combines the two versions.
    setClock('2026-04-05T12:00:00.000Z');
    const v2 = publication(
      await command(
        versionsPath(offeringId),
        {
          ...TARIFF,
          unitAmount: '250',
          currency: 'USD',
          effectiveFrom: '2026-04-20T00:00:00Z',
          effectiveTo: '2026-09-01T00:00:00Z',
          expectedActiveVersionNumber: 1,
        },
        'v2',
        company.id,
      ),
    );
    expect(v2.version).toMatchObject({
      versionNumber: 2,
      unitAmount: '250.0000',
      currency: 'USD',
      state: 'SCHEDULED',
      supersession: null,
      effectiveTo: '2026-09-01T00:00:00.000Z',
      createdAt: '2026-04-05T12:00:00.000Z',
    });
    const takenOver = versionRecord(
      await (await request(versionPath(v1.version.id), company.id)).json(),
    );
    expect(takenOver).toEqual({
      ...v1.version,
      supersession: {
        supersededByVersionId: v2.version.id,
        supersededAt: '2026-04-05T12:00:00.000Z',
        supersededFrom: '2026-04-20T00:00:00.000Z',
      },
    });
    // Supersession never alters content, declared validity or provenance.
    expect(await contentOf(v1.version.id)).toEqual(before);

    for (const [expected, key] of [
      [1, 'stale-one'],
      [3, 'stale-three'],
      [null, 'stale-null'],
    ] as const) {
      const stale = await post(
        versionsPath(offeringId),
        company.id,
        {
          ...TARIFF,
          effectiveFrom: '2026-06-01T00:00:00Z',
          expectedActiveVersionNumber: expected,
        },
        key,
      );
      expect(stale.status).toBe(409);
      expect(await stale.json()).toEqual({
        code: 'STALE_ACTIVE_VERSION',
        message: expect.any(String),
        headVersionNumber: 2,
      });
    }

    // The exact retry of the first publication now carries a stale head
    // expectation, yet returns its recorded result.
    expect(
      publication(
        await command(versionsPath(offeringId), first, 'v1', company.id),
      ),
    ).toEqual({ outcome: 'PUBLISHED', version: takenOver });

    await expectCounts({ versions: 2, receipts: 2, events: 2 });
    expect(await heads()).toEqual([
      { offering_id: offeringId, version_number: 2 },
    ]);
  }, 30_000);

  it('returns UNCHANGED for numerically equal content after its start and expiry, replays it, and conflicts on any changed field, offering or command kind', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    const otherOfferingId = await offering(company.id, 'SERVICE-B');
    const content = {
      ...TARIFF,
      unitAmount: '12.5000',
      taxRatePercent: '20.00',
      effectiveFrom: '2026-04-02T00:00:00Z',
      effectiveTo: '2026-05-01T00:00:00Z',
      expectedActiveVersionNumber: null,
    };
    const created = publication(
      await command(versionsPath(offeringId), content, 'created', company.id),
    );
    const again = {
      ...content,
      unitAmount: '12.5',
      taxRatePercent: '20',
      expectedActiveVersionNumber: 1,
    };
    const cases = [
      ['2026-04-01T06:00:00.000Z', again, 'SCHEDULED'],
      [
        '2026-04-15T00:00:00.000Z',
        {
          ...again,
          unitAmount: '12.50',
          taxRatePercent: '20.0',
          effectiveFrom: '2026-04-02T03:00:00+03:00',
          effectiveTo: '2026-04-30T23:00:00-01:00',
        },
        'CURRENT',
      ],
      ['2026-06-01T00:00:00.000Z', again, 'SUPERSEDED'],
    ] as const;
    for (const [index, [instant, body, state]] of cases.entries()) {
      setClock(instant);
      const unchanged = publication(
        await command(
          versionsPath(offeringId),
          body,
          `unchanged-${index}`,
          company.id,
        ),
      );
      expect(unchanged).toEqual({
        outcome: 'UNCHANGED',
        version: { ...created.version, state },
      });
      expect(
        publication(
          await command(
            versionsPath(offeringId),
            body,
            `unchanged-${index}`,
            company.id,
          ),
        ),
      ).toEqual(unchanged);
    }
    // Every other check still applies to identical content.
    const staleIdentical = await post(
      versionsPath(offeringId),
      company.id,
      content,
      'identical-stale',
    );
    expect(staleIdentical.status).toBe(409);
    expect(await staleIdentical.json()).toMatchObject({
      code: 'STALE_ACTIVE_VERSION',
      headVersionNumber: 1,
    });

    // The fingerprint covers the Company, the offering and every body field
    // exactly as submitted, so 12.5 then 12.50 under one key conflicts.
    for (const changed of [
      { ...again, unitAmount: '12.50' },
      { ...again, taxRatePercent: '20.0' },
      { ...again, unit: `${again.unit} ` },
      { ...again, currency: 'RON' },
      { ...again, taxLabel: `${again.taxLabel} ` },
      { ...again, effectiveTo: '2026-05-01T00:00:00.000Z' },
      { ...again, expectedActiveVersionNumber: null },
    ]) {
      const conflict = await post(
        versionsPath(offeringId),
        company.id,
        changed,
        'unchanged-0',
      );
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
      });
    }
    // The same key and payload for another readable offering conflicts.
    const otherOffering = await post(
      versionsPath(otherOfferingId),
      company.id,
      again,
      'unchanged-0',
    );
    expect(otherOffering.status).toBe(409);
    expect(await otherOffering.json()).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    // One (actor, Company, key) namespace spans rule and tariff publications.
    const tariffKeyForRule = await post(
      RULE_VERSIONS,
      company.id,
      {
        label: 'Illustrative rule',
        effectiveFrom: '2026-07-01T00:00:00Z',
        expectedActiveVersionNumber: null,
      },
      'created',
    );
    expect(tariffKeyForRule.status).toBe(409);
    expect(await tariffKeyForRule.json()).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await command(
      RULE_VERSIONS,
      {
        label: 'Illustrative rule',
        effectiveFrom: '2026-07-01T00:00:00Z',
        expectedActiveVersionNumber: null,
      },
      'rule-key',
      company.id,
    );
    const ruleKeyForTariff = await post(
      versionsPath(offeringId),
      company.id,
      { ...again, effectiveFrom: '2026-08-01T00:00:00Z', effectiveTo: null },
      'rule-key',
    );
    expect(ruleKeyForTariff.status).toBe(409);
    expect(await ruleKeyForTariff.json()).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });

    expect(
      (
        await pool.query(
          `SELECT idempotency_key, command, outcome, result_tariff_version_id
             FROM pricing_configuration_commands ORDER BY idempotency_key`,
        )
      ).rows,
    ).toEqual([
      {
        idempotency_key: 'created',
        command: 'tariff_version.publish',
        outcome: 'PUBLISHED',
        result_tariff_version_id: created.version.id,
      },
      {
        idempotency_key: 'rule-key',
        command: 'pricing_rule_version.publish',
        outcome: 'PUBLISHED',
        result_tariff_version_id: null,
      },
      ...[0, 1, 2].map((index) => ({
        idempotency_key: `unchanged-${index}`,
        command: 'tariff_version.publish',
        outcome: 'UNCHANGED',
        result_tariff_version_id: created.version.id,
      })),
    ]);
    // The original record and its times are preserved.
    expect(
      versionRecord(
        await (
          await request(versionPath(created.version.id), company.id)
        ).json(),
      ),
    ).toEqual({ ...created.version, state: 'SUPERSEDED' });
    await expectCounts({ versions: 1, receipts: 4, events: 1 });
  }, 30_000);

  it('decides a start one millisecond after, at and before the one publication instant', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    async function rejectedAsBackDated(
      body: Record<string, unknown>,
      key: string,
    ): Promise<void> {
      const response = await post(
        versionsPath(offeringId),
        company.id,
        { ...TARIFF, ...body },
        key,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'EFFECTIVE_FROM_PAST',
        field: 'effectiveFrom',
      });
    }
    async function currentVersionNumber(): Promise<number | null> {
      const scope = scopeRecord(
        await (await request(scopePath(offeringId), company.id)).json(),
      );
      return scope.current?.versionNumber ?? null;
    }
    async function published(
      body: Record<string, unknown>,
      key: string,
    ): Promise<VersionView> {
      return publication(
        await command(
          versionsPath(offeringId),
          { ...TARIFF, ...body },
          key,
          company.id,
        ),
      ).version;
    }

    // A first publication at P = 2026-04-01T00:00:00.000Z.
    await rejectedAsBackDated(
      {
        effectiveFrom: '2026-03-31T23:59:59.999Z',
        expectedActiveVersionNumber: null,
      },
      'first-earlier',
    );
    await expectCounts({ versions: 0, receipts: 0, events: 0 });
    expect(
      await published(
        {
          effectiveFrom: '2026-04-01T00:00:00.001Z',
          expectedActiveVersionNumber: null,
        },
        'first-later',
      ),
    ).toMatchObject({
      versionNumber: 1,
      state: 'SCHEDULED',
      createdAt: '2026-04-01T00:00:00.000Z',
    });
    expect(await currentVersionNumber()).toBeNull();

    // A successor at P = 2026-04-10T12:00:00.000Z: the predecessor stays
    // CURRENT until the later start, then yields with no job.
    setClock('2026-04-10T12:00:00.000Z');
    await rejectedAsBackDated(
      {
        unitAmount: '130',
        effectiveFrom: '2026-04-10T11:59:59.999Z',
        expectedActiveVersionNumber: 1,
      },
      'successor-earlier',
    );
    expect(
      await published(
        {
          unitAmount: '130',
          effectiveFrom: '2026-04-10T12:00:00.001Z',
          expectedActiveVersionNumber: 1,
        },
        'successor-later',
      ),
    ).toMatchObject({
      versionNumber: 2,
      state: 'SCHEDULED',
      createdAt: '2026-04-10T12:00:00.000Z',
    });
    expect(await currentVersionNumber()).toBe(1);
    setClock('2026-04-10T12:00:00.001Z');
    expect(await currentVersionNumber()).toBe(2);

    // A successor at P = 2026-04-20T00:00:00.000Z starting at P takes over
    // at once.
    setClock('2026-04-20T00:00:00.000Z');
    expect(
      await published(
        {
          unitAmount: '140',
          effectiveFrom: '2026-04-20T00:00:00.000Z',
          expectedActiveVersionNumber: 2,
        },
        'successor-equal',
      ),
    ).toMatchObject({
      versionNumber: 3,
      state: 'CURRENT',
      createdAt: '2026-04-20T00:00:00.000Z',
    });
    expect(await currentVersionNumber()).toBe(3);

    // Each creation time and supersededAt is its publication instant P, and
    // the back-dated attempts wrote nothing.
    expect(
      (
        await pool.query(
          `SELECT version_number, created_at, superseded_at, superseded_from
             FROM tariff_versions WHERE offering_id = $1 ORDER BY version_number`,
          [offeringId],
        )
      ).rows,
    ).toEqual([
      {
        version_number: 1,
        created_at: new Date('2026-04-01T00:00:00.000Z'),
        superseded_at: new Date('2026-04-10T12:00:00.000Z'),
        superseded_from: new Date('2026-04-10T12:00:00.001Z'),
      },
      {
        version_number: 2,
        created_at: new Date('2026-04-10T12:00:00.000Z'),
        superseded_at: new Date('2026-04-20T00:00:00.000Z'),
        superseded_from: new Date('2026-04-20T00:00:00.000Z'),
      },
      {
        version_number: 3,
        created_at: new Date('2026-04-20T00:00:00.000Z'),
        superseded_at: null,
        superseded_from: null,
      },
    ]);
    await expectCounts({ versions: 3, receipts: 3, events: 3 });
  }, 30_000);

  it.each([
    [
      '2026-04-30T12:00:00.000Z',
      '2026-04-30T12:00:00Z',
      { status: 201, code: undefined, state: 'CURRENT' },
    ],
    [
      '2026-04-30T12:00:00.000Z',
      '2026-05-01T00:00:00Z',
      { status: 201, code: undefined, state: 'SCHEDULED' },
    ],
    [
      '2026-04-30T12:00:00.000Z',
      '2026-05-02T00:00:00Z',
      { status: 409, code: 'EFFECTIVE_WINDOW_GAP', state: undefined },
    ],
    [
      '2026-04-30T23:59:59.000Z',
      '2026-05-01T00:00:00Z',
      { status: 201, code: undefined, state: 'SCHEDULED' },
    ],
    [
      '2026-05-01T00:00:00.000Z',
      '2026-05-02T00:00:00Z',
      { status: 201, code: undefined, state: 'SCHEDULED' },
    ],
    [
      '2026-05-02T00:00:00.000Z',
      '2026-05-03T00:00:00Z',
      { status: 201, code: undefined, state: 'SCHEDULED' },
    ],
    [
      '2026-05-02T00:00:00.000Z',
      '2026-05-01T00:00:00Z',
      { status: 400, code: 'EFFECTIVE_FROM_PAST', state: undefined },
    ],
  ])(
    'holds the section 11.3 boundary row published at %s for a successor from %s',
    async (publicationInstant, effectiveFrom, expected) => {
      const { company } = await prepared();
      const offeringId = await offering(company.id, 'SERVICE-A');
      setClock('2026-03-01T00:00:00.000Z');
      const head = publication(
        await command(
          versionsPath(offeringId),
          {
            ...TARIFF,
            effectiveFrom: '2026-04-01T00:00:00Z',
            effectiveTo: '2026-05-01T00:00:00Z',
            expectedActiveVersionNumber: null,
          },
          'head',
          company.id,
        ),
      );
      const before = await contentOf(head.version.id);
      setClock(publicationInstant);
      const response = await post(
        versionsPath(offeringId),
        company.id,
        {
          ...TARIFF,
          unitAmount: '150',
          effectiveFrom,
          expectedActiveVersionNumber: 1,
        },
        'successor',
      );
      expect(response.status).toBe(expected.status);
      const body = record(await response.json());
      if (expected.code === undefined) {
        const successor = publication(body);
        expect(successor.version).toMatchObject({
          versionNumber: 2,
          effectiveFrom: new Date(effectiveFrom).toISOString(),
          createdAt: publicationInstant,
          state: expected.state,
        });
        expect(
          versionRecord(
            await (
              await request(versionPath(head.version.id), company.id)
            ).json(),
          ).supersession,
        ).toEqual({
          supersededByVersionId: successor.version.id,
          supersededAt: publicationInstant,
          supersededFrom: new Date(effectiveFrom).toISOString(),
        });
        await expectCounts({ versions: 2, receipts: 2, events: 2 });
        return;
      }
      expect(body).toMatchObject({
        code: expected.code,
        ...(expected.status === 400 ? { field: 'effectiveFrom' } : {}),
      });
      expect(await contentOf(head.version.id)).toEqual(before);
      await expectCounts({ versions: 1, receipts: 1, events: 1 });
    },
    30_000,
  );

  it('resumes after an expired head without making the elapsed interval priceable', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    setClock('2026-03-01T00:00:00.000Z');
    await command(
      versionsPath(offeringId),
      {
        ...TARIFF,
        effectiveFrom: '2026-04-01T00:00:00Z',
        effectiveTo: '2026-05-01T00:00:00Z',
        expectedActiveVersionNumber: null,
      },
      'head',
      company.id,
    );
    setClock('2026-05-02T00:00:00.000Z');
    const resumed = publication(
      await command(
        versionsPath(offeringId),
        {
          ...TARIFF,
          unitAmount: '150',
          effectiveFrom: '2026-05-03T00:00:00Z',
          expectedActiveVersionNumber: 1,
        },
        'resume',
        company.id,
      ),
    );
    for (const [instant, current] of [
      ['2026-04-30T23:59:59.999Z', 1],
      ['2026-05-01T00:00:00.000Z', null],
      ['2026-05-02T12:00:00.000Z', null],
      ['2026-05-03T00:00:00.000Z', 2],
    ] as const) {
      setClock(instant);
      const scope = scopeRecord(
        await (await request(scopePath(offeringId), company.id)).json(),
      );
      expect(scope.headVersionNumber).toBe(2);
      expect(scope.current?.versionNumber ?? null).toBe(current);
    }
    expect(resumed.version.effectiveFrom).toBe('2026-05-03T00:00:00.000Z');
  }, 30_000);

  it('rejects a start not later than the offering head start and stores submitted instants verbatim', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    await command(
      versionsPath(offeringId),
      {
        ...TARIFF,
        effectiveFrom: '2026-06-01T00:00:00Z',
        expectedActiveVersionNumber: null,
      },
      'scheduled-head',
      company.id,
    );
    for (const effectiveFrom of [
      '2026-06-01T00:00:00Z',
      '2026-06-01T03:00:00+03:00',
      '2026-05-31T00:00:00Z',
    ]) {
      const response = await post(
        versionsPath(offeringId),
        company.id,
        {
          ...TARIFF,
          unitAmount: '150',
          effectiveFrom,
          expectedActiveVersionNumber: 1,
        },
        crypto.randomUUID(),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'EFFECTIVE_FROM_NOT_ADVANCING',
        field: 'effectiveFrom',
      });
    }
    const advanced = publication(
      await command(
        versionsPath(offeringId),
        {
          ...TARIFF,
          unitAmount: '150',
          effectiveFrom: '2026-06-01T03:00:00.001+03:00',
          expectedActiveVersionNumber: 1,
        },
        'advanced',
        company.id,
      ),
    );
    expect(advanced.version).toMatchObject({
      effectiveFrom: '2026-06-01T00:00:00.001Z',
      createdAt: '2026-04-01T00:00:00.000Z',
    });
    await expectCounts({ versions: 2, receipts: 2, events: 2 });
  }, 30_000);

  it('derives the section 7 CURRENT column for a real chain on one offering and exposes the head separately with no job', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    setClock('2025-12-01T00:00:00.000Z');
    const versions: VersionView[] = [];
    for (const [index, body] of [
      { unitAmount: '100', effectiveFrom: '2026-01-01T00:00:00Z' },
      {
        unitAmount: '110',
        effectiveFrom: '2026-03-01T00:00:00Z',
        effectiveTo: '2026-06-01T00:00:00Z',
      },
      {
        unitAmount: '120',
        effectiveFrom: '2026-04-01T00:00:00Z',
        effectiveTo: '2026-05-01T00:00:00Z',
      },
    ].entries())
      versions.push(
        publication(
          await command(
            versionsPath(offeringId),
            {
              ...TARIFF,
              ...body,
              expectedActiveVersionNumber: index === 0 ? null : index,
            },
            `chain-${index + 1}`,
            company.id,
          ),
        ).version,
      );
    expect(
      (
        await pool.query(
          `SELECT version_number, superseded_from FROM tariff_versions
            WHERE offering_id = $1 ORDER BY version_number`,
          [offeringId],
        )
      ).rows,
    ).toEqual([
      { version_number: 1, superseded_from: new Date('2026-03-01T00:00:00Z') },
      { version_number: 2, superseded_from: new Date('2026-04-01T00:00:00Z') },
      { version_number: 3, superseded_from: null },
    ]);
    for (const [instant, current] of [
      ['2025-12-31T23:59:59.000Z', null],
      ['2026-01-01T00:00:00.000Z', 1],
      ['2026-02-15T12:00:00.000Z', 1],
      ['2026-03-01T00:00:00.000Z', 2],
      ['2026-04-01T00:00:00.000Z', 3],
      ['2026-04-30T23:59:59.000Z', 3],
      ['2026-05-01T00:00:00.000Z', null],
      ['2026-07-01T00:00:00.000Z', null],
    ] as const) {
      setClock(instant);
      const scope = scopeRecord(
        await (await request(scopePath(offeringId), company.id)).json(),
      );
      expect({
        instant,
        current: scope.current?.versionNumber ?? null,
      }).toEqual({ instant, current });
      expect(scope.headVersionNumber).toBe(3);
      expect(scope.provisional).toBe(true);
    }

    // With two scheduled successors the CURRENT version and the head differ,
    // and the list shows all three.
    setClock('2026-02-15T12:00:00.000Z');
    expect(
      await (await request(versionsPath(offeringId), company.id)).json(),
    ).toEqual({
      items: [
        { ...versions[2], state: 'SCHEDULED' },
        {
          ...versions[1],
          state: 'SCHEDULED',
          supersession: expect.objectContaining({
            supersededByVersionId: versions[2]?.id,
            supersededFrom: '2026-04-01T00:00:00.000Z',
          }),
        },
        {
          ...versions[0],
          state: 'CURRENT',
          supersession: expect.objectContaining({
            supersededByVersionId: versions[1]?.id,
            supersededFrom: '2026-03-01T00:00:00.000Z',
          }),
        },
      ],
      provisional: true,
    });

    setClock('2026-07-01T00:00:00.000Z');
    const first = versions[0];
    if (!first) throw new Error('Expected the first version.');
    expect(
      await (await request(versionPath(first.id), company.id)).json(),
    ).toMatchObject({ id: first.id, versionNumber: 1, state: 'SUPERSEDED' });
    // No endpoint edits, deletes or relabels a version.
    for (const path of [
      versionPath(first.id),
      `${versionsPath(offeringId)}/${first.id}`,
    ])
      for (const method of ['PUT', 'PATCH', 'DELETE']) {
        const response = await request(path, company.id, {
          method,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': `edit-${method}`,
          },
          body: JSON.stringify({ unitAmount: '1', provenance: 'REAL' }),
        });
        expect(response.status).toBe(404);
      }
    expect(
      (
        await pool.query(
          `SELECT unit_amount, provenance FROM tariff_versions WHERE id = $1`,
          [first.id],
        )
      ).rows,
    ).toEqual([{ unit_amount: '100.0000', provenance: 'ILLUSTRATIVE' }]);
  }, 30_000);

  it('pages every scheduled successor newest first with a stable bounded cursor that carries no scope data, after authority and offering readability', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    for (let index = 0; index < 27; index += 1)
      await command(
        versionsPath(offeringId),
        {
          ...TARIFF,
          unitAmount: String(index + 1),
          effectiveFrom: `2026-05-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
          expectedActiveVersionNumber: index === 0 ? null : index,
        },
        `page-${index}`,
        company.id,
      );
    // Every one is scheduled, so none is CURRENT while the head is 27.
    expect(
      await (await request(scopePath(offeringId), company.id)).json(),
    ).toMatchObject({ current: null, headVersionNumber: 27 });
    const first = pageRecord(
      await (await request(versionsPath(offeringId), company.id)).json(),
    );
    expect(first.items.map((item) => item.versionNumber)).toEqual(
      Array.from({ length: 25 }, (_, index) => 27 - index),
    );
    expect(first.items.every((item) => item.state === 'SCHEDULED')).toBe(true);
    const cursor = first.nextCursor;
    if (!cursor) throw new Error('Expected a next cursor.');
    expect(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    ).toEqual({ versionNumber: 3 });
    // A publication between pages does not shift the stable cursor.
    await command(
      versionsPath(offeringId),
      {
        ...TARIFF,
        unitAmount: '28',
        effectiveFrom: '2026-06-01T00:00:00Z',
        expectedActiveVersionNumber: 27,
      },
      'page-27',
      company.id,
    );
    const second = pageRecord(
      await (
        await request(
          `${versionsPath(offeringId)}?limit=25&cursor=${encodeURIComponent(cursor)}`,
          company.id,
        )
      ).json(),
    );
    expect(second.items.map((item) => item.versionNumber)).toEqual([2, 1]);
    expect(second.nextCursor).toBeUndefined();
    const bounded = pageRecord(
      await (
        await request(`${versionsPath(offeringId)}?limit=50`, company.id)
      ).json(),
    );
    expect(bounded.items).toHaveLength(28);
    const invalidQueries = [
      'limit=51',
      'limit=0',
      'limit=abc',
      'cursor=invalid',
      `cursor=${Buffer.from('{"versionNumber":0}').toString('base64url')}`,
      `cursor=${Buffer.from(JSON.stringify({ versionNumber: 3, offeringId })).toString('base64url')}`,
    ];
    for (const query of invalidQueries) {
      const invalid = await request(
        `${versionsPath(offeringId)}?${query}`,
        company.id,
      );
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toMatchObject({ code: 'INVALID_PAGE' });
    }
    // Page validation follows authority and offering readability.
    await member(CATALOGUE_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      CATALOGUE_ASSIGNMENTS,
    ]);
    for (const query of invalidQueries.slice(0, 2)) {
      const denied = await request(
        `${versionsPath(offeringId)}?${query}`,
        company.id,
        { headers: CATALOGUE_MEMBER },
      );
      expect(denied.status).toBe(403);
      expect(await denied.text()).not.toContain('INVALID_PAGE');
      const unknown = await request(
        `${versionsPath(UNKNOWN_ID)}?${query}`,
        company.id,
      );
      expect(unknown.status).toBe(404);
      expect(await unknown.text()).not.toContain('INVALID_PAGE');
    }
  }, 60_000);

  it('leaves exactly one head per offering under concurrent first, successor and retried publications', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    const firsts = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        post(
          versionsPath(offeringId),
          company.id,
          {
            ...TARIFF,
            unitAmount: String(index + 1),
            effectiveFrom: '2026-05-01T00:00:00Z',
            expectedActiveVersionNumber: null,
          },
          `first-${index}`,
        ),
      ),
    );
    expect(
      firsts.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([201, 409, 409, 409, 409, 409]);
    for (const response of firsts.filter(({ status }) => status === 409))
      expect(await response.json()).toMatchObject({
        code: 'STALE_ACTIVE_VERSION',
        headVersionNumber: 1,
      });
    expect(await heads()).toEqual([
      { offering_id: offeringId, version_number: 1 },
    ]);

    const successors = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        post(
          versionsPath(offeringId),
          company.id,
          {
            ...TARIFF,
            unitAmount: String(index + 10),
            effectiveFrom: `2026-06-0${index + 1}T00:00:00Z`,
            expectedActiveVersionNumber: 1,
          },
          `successor-${index}`,
        ),
      ),
    );
    expect(
      successors.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([201, 409, 409, 409, 409, 409]);
    expect(await heads()).toEqual([
      { offering_id: offeringId, version_number: 2 },
    ]);

    const retries = await Promise.all(
      Array.from({ length: 6 }, () =>
        post(
          versionsPath(offeringId),
          company.id,
          {
            ...TARIFF,
            unitAmount: '99',
            effectiveFrom: '2026-08-01T00:00:00Z',
            expectedActiveVersionNumber: 2,
          },
          'retried',
        ),
      ),
    );
    expect(retries.map((response) => response.status)).toEqual(
      retries.map(() => 201),
    );
    const results = await Promise.all(
      retries.map(async (response) => publication(await response.json())),
    );
    expect(new Set(results.map((result) => result.version.id)).size).toBe(1);
    expect(results.every((result) => result.outcome === 'PUBLISHED')).toBe(
      true,
    );
    await expectCounts({ versions: 3, receipts: 3, events: 3 });
    expect(await heads()).toEqual([
      { offering_id: offeringId, version_number: 3 },
    ]);
  }, 60_000);

  it('holds a competing first publication of the offering on its scope protection and rejects it as stale after the first commits', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    await member(CONFIGURATION_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      CONFIGURATION_ASSIGNMENTS,
    ]);
    const firstBody = {
      ...TARIFF,
      effectiveFrom: '2026-05-01T00:00:00Z',
      expectedActiveVersionNumber: null,
    };
    // SHARE holds the first publication at its insert, after it has taken
    // the exclusive protection of the offering's still empty scope.
    const blocker = await holdLock(async (connection) => {
      await connection.query('LOCK TABLE tariff_versions IN SHARE MODE');
    });
    let released = false;
    try {
      const first = post(
        versionsPath(offeringId),
        company.id,
        firstBody,
        'first',
      );
      await waitForBlockedBy(blocker.backendPid);
      const competing = post(
        versionsPath(offeringId),
        company.id,
        { ...firstBody, unitAmount: '99' },
        'competing-first',
        CONFIGURATION_MEMBER,
      );
      await waitForAdvisoryWaiters(1);
      await blocker.connection.query('COMMIT');
      released = true;
      const published = await first;
      expect(published.status).toBe(201);
      expect(publication(await published.json()).version).toMatchObject({
        versionNumber: 1,
        unitAmount: '123.4500',
      });
      const stale = await competing;
      expect(stale.status).toBe(409);
      expect(await stale.json()).toEqual({
        code: 'STALE_ACTIVE_VERSION',
        message: expect.any(String),
        headVersionNumber: 1,
      });
    } finally {
      if (!released) await blocker.connection.query('ROLLBACK');
      blocker.connection.release();
    }
    expect(await heads()).toEqual([
      { offering_id: offeringId, version_number: 1 },
    ]);
    await expectCounts({ versions: 1, receipts: 1, events: 1 });
  }, 30_000);

  it('publishes first versions of two offerings at once without either waiting on the other, or on the Company rule scope', async () => {
    const { company } = await prepared();
    const offeringA = await offering(company.id, 'SERVICE-A');
    const offeringB = await offering(company.id, 'SERVICE-B');
    for (const headers of [CONFIGURATION_MEMBER, ...OBSERVERS])
      await member(headers, company.id, [
        CONTEXT_ASSIGNMENTS,
        CONFIGURATION_ASSIGNMENTS,
      ]);
    const [observerA, observerB] = OBSERVERS;
    if (!/^[0-9a-f-]{36}$/u.test(offeringA))
      throw new Error('Expected a canonical offering id.');
    // A database fixture holds offering A's publication at its insert, after
    // it has taken A's exclusive protection and sampled its instant, while
    // the test holds the advisory key the fixture waits for.
    await pool.query(`
      CREATE FUNCTION hold_tariff_offering_insert() RETURNS trigger AS $$
      BEGIN
        IF NEW.offering_id = '${offeringA}'::uuid THEN
          PERFORM pg_advisory_xact_lock_shared(396396);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER hold_tariff_offering_insert
        BEFORE INSERT ON tariff_versions
        FOR EACH ROW EXECUTE FUNCTION hold_tariff_offering_insert();
    `);
    try {
      const blocker = await holdLock(async (connection) => {
        await connection.query('SELECT pg_advisory_xact_lock(396396)');
      });
      let released = false;
      try {
        let answeredA = false;
        const pendingA = post(
          versionsPath(offeringA),
          company.id,
          {
            ...TARIFF,
            effectiveFrom: '2026-05-01T00:00:00Z',
            expectedActiveVersionNumber: null,
          },
          'offering-a',
        ).then((response) => {
          answeredA = true;
          return response;
        });
        await waitForBlockedBy(blocker.backendPid);
        // Offering A's scope is held: a read of it waits.
        const readA = request(scopePath(offeringA), company.id, {
          headers: observerA,
        });
        await waitForAdvisoryWaiters(2);
        // Offering B publishes its own first version meanwhile.
        const publishedB = await post(
          versionsPath(offeringB),
          company.id,
          {
            ...TARIFF,
            currency: 'RON',
            effectiveFrom: '2026-05-01T00:00:00Z',
            expectedActiveVersionNumber: null,
          },
          'offering-b',
          CONFIGURATION_MEMBER,
        );
        expect(publishedB.status).toBe(201);
        expect(publication(await publishedB.json()).version).toMatchObject({
          offeringId: offeringB,
          versionNumber: 1,
          currency: 'RON',
        });
        expect(
          await (
            await request(scopePath(offeringB), company.id, {
              headers: observerB,
            })
          ).json(),
        ).toMatchObject({ offeringId: offeringB, headVersionNumber: 1 });
        // The Company's Pricing Rule scope is not the offering's scope.
        const rule = await post(
          RULE_VERSIONS,
          company.id,
          {
            label: 'Illustrative rule',
            effectiveFrom: '2026-05-01T00:00:00Z',
            expectedActiveVersionNumber: null,
          },
          'rule-during-tariff',
          CONFIGURATION_MEMBER,
        );
        expect(rule.status).toBe(201);
        expect(answeredA).toBe(false);

        await blocker.connection.query('COMMIT');
        released = true;
        const publishedA = await pendingA;
        expect(publishedA.status).toBe(201);
        expect(publication(await publishedA.json()).version).toMatchObject({
          offeringId: offeringA,
          versionNumber: 1,
          currency: 'EUR',
        });
        const scopeA = await readA;
        expect(scopeA.status).toBe(200);
        expect(await scopeA.json()).toMatchObject({
          offeringId: offeringA,
          current: null,
          headVersionNumber: 1,
        });
      } finally {
        if (!released) await blocker.connection.query('ROLLBACK');
        blocker.connection.release();
      }
    } finally {
      await pool.query('DROP FUNCTION hold_tariff_offering_insert() CASCADE');
    }
    expect(await heads()).toEqual(
      [
        { offering_id: offeringA, version_number: 1 },
        { offering_id: offeringB, version_number: 1 },
      ].sort((left, right) => (left.offering_id < right.offering_id ? -1 : 1)),
    );
    expect(await (await request(RULE_SCOPE, company.id)).json()).toMatchObject({
      headVersionNumber: 1,
    });
    await expectCounts({ versions: 2, receipts: 2, events: 2 });
  }, 30_000);

  it('lets no read or replay see the predecessor once a start passes between the publication instant and its commit', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    for (const headers of [CONFIGURATION_MEMBER, ...OBSERVERS])
      await member(headers, company.id, [
        CONTEXT_ASSIGNMENTS,
        CONFIGURATION_ASSIGNMENTS,
      ]);
    const predecessorBody = {
      ...TARIFF,
      effectiveFrom: '2026-04-01T00:00:00Z',
      expectedActiveVersionNumber: null,
    };
    // The replaying member published the predecessor; the owner publishes
    // the successor.
    const predecessor = publication(
      await command(
        versionsPath(offeringId),
        predecessorBody,
        'predecessor',
        company.id,
        CONFIGURATION_MEMBER,
      ),
    );
    // SHARE admits the publication's head lock and its clock sample but not
    // its first write, holding it between its instant and its commit.
    const blocker = await holdLock(async (connection) => {
      await connection.query('LOCK TABLE tariff_versions IN SHARE MODE');
    });
    let released = false;
    try {
      setClock('2026-04-01T12:00:00.000Z');
      const pending = post(
        versionsPath(offeringId),
        company.id,
        {
          ...TARIFF,
          unitAmount: '150',
          effectiveFrom: '2026-04-01T12:00:00.001Z',
          expectedActiveVersionNumber: 1,
        },
        'successor',
      );
      await waitForBlockedBy(blocker.backendPid);
      // The accepted start arrives before the publication is durable.
      setClock('2026-04-01T12:00:00.001Z');
      const [scopeObserver, listObserver, versionObserver] = OBSERVERS;
      let answered = 0;
      const observations = [
        request(scopePath(offeringId), company.id, { headers: scopeObserver }),
        request(versionsPath(offeringId), company.id, {
          headers: listObserver,
        }),
        request(versionPath(predecessor.version.id), company.id, {
          headers: versionObserver,
        }),
        post(
          versionsPath(offeringId),
          company.id,
          predecessorBody,
          'predecessor',
          CONFIGURATION_MEMBER,
        ),
      ].map(async (response) => {
        const settled = await response;
        const body: unknown = await settled.json();
        answered += 1;
        return { status: settled.status, body };
      });
      await waitForObservers(observations.length, () => answered);
      await blocker.connection.query('COMMIT');
      released = true;
      const published = await pending;
      expect(published.status).toBe(201);
      const successor = publication(await published.json());
      expect(successor.version).toMatchObject({
        versionNumber: 2,
        createdAt: '2026-04-01T12:00:00.000Z',
        state: 'SCHEDULED',
      });
      const current = { ...successor.version, state: 'CURRENT' };
      const takenOver = {
        ...predecessor.version,
        state: 'SUPERSEDED',
        supersession: {
          supersededByVersionId: successor.version.id,
          supersededAt: '2026-04-01T12:00:00.000Z',
          supersededFrom: '2026-04-01T12:00:00.001Z',
        },
      };
      expect(await Promise.all(observations)).toEqual([
        {
          status: 200,
          body: {
            offeringId,
            current,
            headVersionNumber: 2,
            provisional: true,
          },
        },
        {
          status: 200,
          body: { items: [current, takenOver], provisional: true },
        },
        { status: 200, body: takenOver },
        { status: 201, body: { outcome: 'PUBLISHED', version: takenOver } },
      ]);
    } finally {
      if (!released) await blocker.connection.query('ROLLBACK');
      blocker.connection.release();
    }
    await expectCounts({ versions: 2, receipts: 2, events: 2 });
  }, 30_000);

  it.each([
    {
      crossing: 'its start',
      head: { effectiveFrom: '2026-04-01T00:00:00Z' },
      publicationInstant: '2026-04-01T12:00:00.000Z',
      effectiveFrom: '2026-04-01T12:00:00.001Z',
      committedAfter: '2026-04-01T12:00:00.002Z',
    },
    {
      crossing: 'the head expiry and its start',
      head: {
        effectiveFrom: '2026-04-01T00:00:00Z',
        effectiveTo: '2026-05-01T00:00:00Z',
      },
      publicationInstant: '2026-04-30T23:59:59.000Z',
      effectiveFrom: '2026-05-01T00:00:00.000Z',
      committedAfter: '2026-05-01T00:00:01.000Z',
    },
  ])(
    'keeps the outcome decided at the publication instant when $crossing passes before the commit',
    async ({ head, publicationInstant, effectiveFrom, committedAfter }) => {
      const { company } = await prepared();
      const offeringId = await offering(company.id, 'SERVICE-A');
      setClock('2026-03-01T00:00:00.000Z');
      const predecessor = publication(
        await command(
          versionsPath(offeringId),
          { ...TARIFF, ...head, expectedActiveVersionNumber: null },
          'predecessor',
          company.id,
        ),
      );
      const before = await contentOf(predecessor.version.id);
      // SHARE admits the publication's head lock and its clock sample but not
      // its first write, holding it between its instant and its commit.
      const blocker = await holdLock(async (connection) => {
        await connection.query('LOCK TABLE tariff_versions IN SHARE MODE');
      });
      let released = false;
      try {
        setClock(publicationInstant);
        const pending = post(
          versionsPath(offeringId),
          company.id,
          {
            ...TARIFF,
            unitAmount: '150',
            effectiveFrom,
            expectedActiveVersionNumber: 1,
          },
          'successor',
        );
        await waitForBlockedBy(blocker.backendPid);
        // Decided at this later instant, the same start would be back-dated.
        setClock(committedAfter);
        await blocker.connection.query('COMMIT');
        released = true;
        const published = await pending;
        expect(published.status).toBe(201);
        const successor = publication(await published.json());
        expect(successor).toEqual({
          outcome: 'PUBLISHED',
          version: expect.objectContaining({
            versionNumber: 2,
            effectiveFrom,
            createdAt: publicationInstant,
            state: 'SCHEDULED',
          }),
        });
        expect(
          versionRecord(
            await (
              await request(versionPath(predecessor.version.id), company.id)
            ).json(),
          ),
        ).toEqual({
          ...predecessor.version,
          state: 'SUPERSEDED',
          supersession: {
            supersededByVersionId: successor.version.id,
            supersededAt: publicationInstant,
            supersededFrom: effectiveFrom,
          },
        });
        expect(
          await (await request(scopePath(offeringId), company.id)).json(),
        ).toEqual({
          offeringId,
          current: { ...successor.version, state: 'CURRENT' },
          headVersionNumber: 2,
          provisional: true,
        });
      } finally {
        if (!released) await blocker.connection.query('ROLLBACK');
        blocker.connection.release();
      }
      expect(await contentOf(predecessor.version.id)).toEqual(before);
      await expectCounts({ versions: 2, receipts: 2, events: 2 });
    },
    30_000,
  );

  it('orders a read holding the offering protection at P before a publication starting at P', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    await member(OBSERVERS[0], company.id, [
      CONTEXT_ASSIGNMENTS,
      CONFIGURATION_ASSIGNMENTS,
    ]);
    setClock('2026-03-01T00:00:00.000Z');
    const predecessor = publication(
      await command(
        versionsPath(offeringId),
        {
          ...TARIFF,
          effectiveFrom: '2026-03-15T00:00:00Z',
          expectedActiveVersionNumber: null,
        },
        'predecessor',
        company.id,
      ),
    );
    const instant = '2026-04-01T12:00:00.000Z';
    setClock(instant);
    const observer = { headers: OBSERVERS[0] };
    // ACCESS EXCLUSIVE holds the read after it has taken the shared
    // protection and sampled P, before it reads a version.
    const blocker = await holdLock(async (connection) => {
      await connection.query(
        'LOCK TABLE tariff_versions IN ACCESS EXCLUSIVE MODE',
      );
    });
    let released = false;
    let successor: VersionView;
    try {
      const earlier = request(scopePath(offeringId), company.id, observer);
      await waitForBlockedBy(blocker.backendPid);
      const pending = post(
        versionsPath(offeringId),
        company.id,
        {
          ...TARIFF,
          unitAmount: '150',
          effectiveFrom: instant,
          expectedActiveVersionNumber: 1,
        },
        'successor',
      );
      // The publication waits for the read before it samples its instant.
      await waitForAdvisoryWaiters(1);
      await blocker.connection.query('COMMIT');
      released = true;
      const earlierRead = await earlier;
      expect(earlierRead.status).toBe(200);
      expect(await earlierRead.json()).toEqual({
        offeringId,
        current: { ...predecessor.version, state: 'CURRENT' },
        headVersionNumber: 1,
        provisional: true,
      });
      const published = await pending;
      expect(published.status).toBe(201);
      successor = publication(await published.json()).version;
      expect(successor).toMatchObject({
        versionNumber: 2,
        effectiveFrom: instant,
        createdAt: instant,
        state: 'CURRENT',
      });
    } finally {
      if (!released) await blocker.connection.query('ROLLBACK');
      blocker.connection.release();
    }
    // Later reads at the same instant show the successor.
    expect(
      await (await request(scopePath(offeringId), company.id, observer)).json(),
    ).toEqual({
      offeringId,
      current: successor,
      headVersionNumber: 2,
      provisional: true,
    });
    expect(
      await (
        await request(versionPath(predecessor.version.id), company.id, observer)
      ).json(),
    ).toEqual({
      ...predecessor.version,
      state: 'SUPERSEDED',
      supersession: {
        supersededByVersionId: successor.id,
        supersededAt: instant,
        supersededFrom: instant,
      },
    });
    await expectCounts({ versions: 2, receipts: 2, events: 2 });
  }, 30_000);

  it('rolls a failed publication back at each write or its commit and releases waiting readers onto the unchanged state', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    for (const headers of OBSERVERS)
      await member(headers, company.id, [
        CONTEXT_ASSIGNMENTS,
        CONFIGURATION_ASSIGNMENTS,
      ]);
    const head = publication(
      await command(
        versionsPath(offeringId),
        {
          ...TARIFF,
          effectiveFrom: '2026-04-01T00:00:00Z',
          expectedActiveVersionNumber: null,
        },
        'head',
        company.id,
      ),
    );
    const before = await contentOf(head.version.id);
    const unchanged = [
      {
        status: 200,
        body: {
          offeringId,
          current: head.version,
          headVersionNumber: 1,
          provisional: true,
        },
      },
      { status: 200, body: { items: [head.version], provisional: true } },
      { status: 200, body: head.version },
    ];
    const failing = {
      ...TARIFF,
      unitAmount: '150',
      effectiveFrom: '2026-05-01T00:00:00Z',
      expectedActiveVersionNumber: 1,
    };
    // The failure is injected by the database, never by replacing the module.
    await pool.query(`
      CREATE FUNCTION reject_tariff_publication_write() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced tariff publication failure';
      END;
      $$ LANGUAGE plpgsql;
    `);
    const rejectBefore = (operation: 'INSERT' | 'UPDATE', table: string) => ({
      table,
      trigger: `CREATE TRIGGER reject_tariff_publication_write
                  BEFORE ${operation} ON ${table}
                  FOR EACH ROW EXECUTE FUNCTION reject_tariff_publication_write()`,
    });
    try {
      for (const { write, table, trigger } of [
        { write: 'predecessor', ...rejectBefore('UPDATE', 'tariff_versions') },
        { write: 'version', ...rejectBefore('INSERT', 'tariff_versions') },
        {
          write: 'receipt',
          ...rejectBefore('INSERT', 'pricing_configuration_commands'),
        },
        {
          write: 'event',
          ...rejectBefore('INSERT', 'pricing_configuration_events'),
        },
        {
          // Deferred, it fails the commit itself after all four writes.
          write: 'commit',
          table: 'pricing_configuration_commands',
          trigger: `CREATE CONSTRAINT TRIGGER reject_tariff_publication_write
                      AFTER INSERT ON pricing_configuration_commands
                      DEFERRABLE INITIALLY DEFERRED
                      FOR EACH ROW EXECUTE FUNCTION reject_tariff_publication_write()`,
        },
      ]) {
        await pool.query(trigger);
        // SHARE holds the publication at its first write while it holds the
        // exclusive protection, so the readers queue behind it.
        const blocker = await holdLock(async (connection) => {
          await connection.query('LOCK TABLE tariff_versions IN SHARE MODE');
        });
        let released = false;
        try {
          const pending = post(
            versionsPath(offeringId),
            company.id,
            failing,
            `failed-${write}`,
          );
          await waitForBlockedBy(blocker.backendPid);
          let answered = 0;
          const observations = [
            scopePath(offeringId),
            versionsPath(offeringId),
            versionPath(head.version.id),
          ].map(async (path, index) => {
            const settled = await request(path, company.id, {
              headers: OBSERVERS[index],
            });
            const body: unknown = await settled.json();
            answered += 1;
            return { status: settled.status, body };
          });
          await waitForAdvisoryWaiters(observations.length);
          expect(answered).toBe(0);
          await blocker.connection.query('COMMIT');
          released = true;
          const failed = await pending;
          // Neither success nor that nothing was written is claimed.
          expect({
            write,
            status: failed.status,
            body: await failed.json(),
          }).toEqual({
            write,
            status: 500,
            body: { statusCode: 500, message: 'Internal server error' },
          });
          expect(await Promise.all(observations)).toEqual(unchanged);
        } finally {
          if (!released) await blocker.connection.query('ROLLBACK');
          blocker.connection.release();
          await pool.query(
            `DROP TRIGGER reject_tariff_publication_write ON ${table}`,
          );
        }
        expect(await contentOf(head.version.id)).toEqual(before);
        expect(await heads()).toEqual([
          { offering_id: offeringId, version_number: 1 },
        ]);
        await expectCounts({ versions: 1, receipts: 1, events: 1 });
      }
    } finally {
      await pool.query(
        'DROP FUNCTION reject_tariff_publication_write() CASCADE',
      );
    }

    // An exact retry after a rollback is a new command decided at its own
    // publication instant, never re-dated to the failed attempt.
    setClock('2026-04-02T00:00:00.000Z');
    const retried = publication(
      await command(
        versionsPath(offeringId),
        failing,
        'failed-event',
        company.id,
      ),
    );
    expect(retried.version).toMatchObject({
      versionNumber: 2,
      state: 'SCHEDULED',
      createdAt: '2026-04-02T00:00:00.000Z',
    });
    expect(
      versionRecord(
        await (await request(versionPath(head.version.id), company.id)).json(),
      ).supersession,
    ).toEqual({
      supersededByVersionId: retried.version.id,
      supersededAt: '2026-04-02T00:00:00.000Z',
      supersededFrom: '2026-05-01T00:00:00.000Z',
    });
    // Another rolled-back attempt, retried exactly, meets the moved head like
    // any new command.
    const stale = await post(
      versionsPath(offeringId),
      company.id,
      failing,
      'failed-predecessor',
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({
      code: 'STALE_ACTIVE_VERSION',
      message: expect.any(String),
      headVersionNumber: 2,
    });
    await expectCounts({ versions: 2, receipts: 2, events: 2 });
  }, 60_000);

  it('answers a publication and releases its waiting readers only once its commit completes', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    await member(OBSERVERS[0], company.id, [
      CONTEXT_ASSIGNMENTS,
      CONFIGURATION_ASSIGNMENTS,
    ]);
    const head = publication(
      await command(
        versionsPath(offeringId),
        {
          ...TARIFF,
          effectiveFrom: '2026-04-01T00:00:00Z',
          expectedActiveVersionNumber: null,
        },
        'head',
        company.id,
      ),
    );
    // A deferred trigger makes the commit itself wait, after every write of
    // the publication, for a lock the test holds.
    await pool.query(`
      CREATE FUNCTION hold_tariff_publication_commit() RETURNS trigger AS $$
      BEGIN
        PERFORM pg_advisory_xact_lock_shared(396397);
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
      CREATE CONSTRAINT TRIGGER hold_tariff_publication_commit
        AFTER INSERT ON pricing_configuration_commands
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION hold_tariff_publication_commit();
    `);
    let answered = 0;
    const answer = async (response: Promise<Response>) => {
      const settled = await response;
      const body: unknown = await settled.json();
      answered += 1;
      return { status: settled.status, body };
    };
    try {
      const blocker = await holdLock(async (connection) => {
        await connection.query('SELECT pg_advisory_xact_lock(396397)');
      });
      let released = false;
      try {
        const publishing = answer(
          post(
            versionsPath(offeringId),
            company.id,
            {
              ...TARIFF,
              unitAmount: '150',
              effectiveFrom: '2026-05-01T00:00:00Z',
              expectedActiveVersionNumber: 1,
            },
            'successor',
          ),
        );
        await waitForBlockedBy(blocker.backendPid);
        const reading = answer(
          request(scopePath(offeringId), company.id, {
            headers: OBSERVERS[0],
          }),
        );
        // The committing publication and the read behind its protection.
        await waitForAdvisoryWaiters(2);
        expect(answered).toBe(0);
        await blocker.connection.query('COMMIT');
        released = true;
        const published = await publishing;
        expect(published).toEqual({
          status: 201,
          body: {
            outcome: 'PUBLISHED',
            version: expect.objectContaining({
              versionNumber: 2,
              state: 'SCHEDULED',
              createdAt: '2026-04-01T00:00:00.000Z',
            }),
          },
        });
        expect(await reading).toEqual({
          status: 200,
          body: {
            offeringId,
            current: {
              ...head.version,
              supersession: {
                supersededByVersionId: publication(published.body).version.id,
                supersededAt: '2026-04-01T00:00:00.000Z',
                supersededFrom: '2026-05-01T00:00:00.000Z',
              },
            },
            headVersionNumber: 2,
            provisional: true,
          },
        });
      } finally {
        if (!released) await blocker.connection.query('ROLLBACK');
        blocker.connection.release();
      }
    } finally {
      await pool.query(
        'DROP FUNCTION hold_tariff_publication_commit() CASCADE',
      );
    }
    await expectCounts({ versions: 2, receipts: 2, events: 2 });
  }, 30_000);

  it('replays a publication whose response was lost after its start passed and the head moved', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    const body = {
      ...TARIFF,
      unitAmount: '12.5',
      effectiveFrom: '2026-04-05T00:00:00Z',
      expectedActiveVersionNumber: null,
    };
    // The caller never receives this committed result.
    const lost = publication(
      await command(versionsPath(offeringId), body, 'lost', company.id),
    );
    setClock('2026-04-06T00:00:00.000Z');
    const moved = publication(
      await command(
        versionsPath(offeringId),
        {
          ...TARIFF,
          unitAmount: '150',
          effectiveFrom: '2026-04-10T00:00:00Z',
          expectedActiveVersionNumber: 1,
        },
        'moves-head',
        company.id,
      ),
    );
    // Decided afresh now, the lost payload would be both stale and back-dated.
    setClock('2026-04-12T00:00:00.000Z');
    const recorded = {
      outcome: 'PUBLISHED',
      version: {
        ...lost.version,
        state: 'SUPERSEDED',
        supersession: {
          supersededByVersionId: moved.version.id,
          supersededAt: '2026-04-06T00:00:00.000Z',
          supersededFrom: '2026-04-10T00:00:00.000Z',
        },
      },
    };
    const retries = [
      await post(versionsPath(offeringId), company.id, body, 'lost'),
      ...(await Promise.all([
        post(versionsPath(offeringId), company.id, body, 'lost'),
        post(versionsPath(offeringId), company.id, body, 'lost'),
      ])),
    ];
    for (const retry of retries) {
      expect(retry.status).toBe(201);
      expect(await retry.json()).toEqual(recorded);
    }
    for (const changed of [
      { ...body, unitAmount: '12.50' },
      { ...body, taxLabel: 'Illustrative tax, edited' },
    ]) {
      const conflict = await post(
        versionsPath(offeringId),
        company.id,
        changed,
        'lost',
      );
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
      });
    }
    await expectCounts({ versions: 2, receipts: 2, events: 2 });
  }, 30_000);

  it('revalidates live authority under a row lock before replaying or committing, and offering readability before any key', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    const configurationMember = await member(CONFIGURATION_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      CONFIGURATION_ASSIGNMENTS,
    ]);
    const body = {
      ...TARIFF,
      effectiveFrom: '2026-05-01T00:00:00Z',
      expectedActiveVersionNumber: null,
    };
    const created = await post(
      versionsPath(offeringId),
      company.id,
      body,
      'member-tariff',
      CONFIGURATION_MEMBER,
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    const createdVersion = publication(createdBody).version;
    const revoke = await request(
      `${CONFIGURATION_ASSIGNMENTS}/${configurationMember.membershipId}/${company.id}`,
      undefined,
      { method: 'DELETE', headers: { 'idempotency-key': 'revoke' } },
    );
    expect(revoke.status).toBe(200);
    // A revoked actor's exact retry gets the safe denial and no result.
    const deniedReplay = await post(
      versionsPath(offeringId),
      company.id,
      body,
      'member-tariff',
      CONFIGURATION_MEMBER,
    );
    expect(deniedReplay.status).toBe(403);
    expect(await deniedReplay.text()).not.toContain('123.4500');
    for (const path of [
      scopePath(offeringId),
      versionsPath(offeringId),
      versionPath(createdVersion.id),
    ])
      expect(
        (await request(path, company.id, { headers: CONFIGURATION_MEMBER }))
          .status,
      ).toBe(403);
    await grant(CONFIGURATION_ASSIGNMENTS, {
      workspaceMembershipId: configurationMember.membershipId,
      companyId: company.id,
    });
    const replay = await post(
      versionsPath(offeringId),
      company.id,
      body,
      'member-tariff',
      CONFIGURATION_MEMBER,
    );
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(createdBody);

    // A revocation committed while a publication waits on authority leaves
    // nothing committed on the revoked authority.
    for (const [key, payload] of [
      ['member-tariff', body],
      [
        'member-fresh',
        {
          ...TARIFF,
          unitAmount: '150',
          effectiveFrom: '2026-06-01T00:00:00Z',
          expectedActiveVersionNumber: 1,
        },
      ],
    ] as const) {
      const blocker = await lockRows(
        `SELECT id FROM company_role_assignments
          WHERE workspace_membership_id = $1 AND company_id = $2
            AND bundle = 'company_pricing_configuration' AND revoked_at IS NULL
          FOR UPDATE`,
        [configurationMember.membershipId, company.id],
      );
      let released = false;
      try {
        const pending = post(
          versionsPath(offeringId),
          company.id,
          payload,
          key,
          CONFIGURATION_MEMBER,
        );
        await waitForBlockedBy(blocker.backendPid);
        await blocker.connection.query(
          `UPDATE company_role_assignments SET revoked_at = clock_timestamp()
            WHERE workspace_membership_id = $1 AND company_id = $2
              AND bundle = 'company_pricing_configuration' AND revoked_at IS NULL`,
          [configurationMember.membershipId, company.id],
        );
        await blocker.connection.query('COMMIT');
        released = true;
        const outcome = await pending;
        expect(outcome.status).toBe(403);
        expect(await outcome.text()).not.toContain('123.4500');
      } finally {
        if (!released) await blocker.connection.query('ROLLBACK');
        blocker.connection.release();
      }
      await grant(CONFIGURATION_ASSIGNMENTS, {
        workspaceMembershipId: configurationMember.membershipId,
        companyId: company.id,
      });
    }
    await expectCounts({ versions: 1, receipts: 1, events: 1 });

    // The offering is revalidated before the key: a reused key against an
    // unknown, malformed, cross-Company or cross-Workspace offering gets the
    // safe not-found, never the recorded result or a conflict.
    const other = entity(
      await command('/companies', { displayName: 'BIC' }, 'other-company'),
    );
    const owner = await actorOf(other.id);
    await grant(CATALOGUE_ASSIGNMENTS, {
      workspaceMembershipId: owner.membershipId,
      companyId: other.id,
    });
    const otherOffering = await offering(other.id, 'SERVICE-B');
    const foreign = await seedForeignWorkspaceTariff();
    const hidden = await post(
      versionsPath(UNKNOWN_ID),
      company.id,
      body,
      'member-tariff',
      CONFIGURATION_MEMBER,
    );
    expect(hidden.status).toBe(404);
    const hiddenBody = await hidden.text();
    for (const target of [
      otherOffering,
      foreign.offeringId,
      'not-an-offering',
    ]) {
      const response = await post(
        versionsPath(target),
        company.id,
        body,
        'member-tariff',
        CONFIGURATION_MEMBER,
      );
      expect({ target, status: response.status }).toEqual({
        target,
        status: 404,
      });
      expect(await response.text()).toBe(hiddenBody);
    }
    // Without a key, the offering is still checked first.
    const keyless = await request(versionsPath(UNKNOWN_ID), company.id, {
      method: 'POST',
      headers: { ...CONFIGURATION_MEMBER, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(keyless.status).toBe(404);

    await pool.query("UPDATE companies SET status = 'inactive' WHERE id = $1", [
      company.id,
    ]);
    expect(
      (
        await request(scopePath(offeringId), company.id, {
          headers: CONFIGURATION_MEMBER,
        })
      ).status,
    ).toBe(403);
    await pool.query("UPDATE companies SET status = 'active' WHERE id = $1", [
      company.id,
    ]);
    await pool.query(
      "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
      [configurationMember.membershipId],
    );
    const inactive = await post(
      versionsPath(offeringId),
      company.id,
      body,
      'member-tariff',
      CONFIGURATION_MEMBER,
    );
    expect(inactive.status).toBe(403);
    await expectCounts({ versions: 1, receipts: 1, events: 1 });
  }, 60_000);

  it('bounds the expected head number as field validation and refuses allocation beyond the stored range per offering', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    const otherOfferingId = await offering(company.id, 'SERVICE-B');
    for (const expectedActiveVersionNumber of [
      0,
      -1,
      1.5,
      '1',
      2_147_483_648,
      true,
    ]) {
      const response = await post(
        versionsPath(offeringId),
        company.id,
        {
          ...TARIFF,
          effectiveFrom: '2026-05-01T00:00:00Z',
          expectedActiveVersionNumber,
        },
        crypto.randomUUID(),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'VALIDATION_ERROR',
        field: 'expectedActiveVersionNumber',
      });
    }
    await expectCounts({ versions: 0, receipts: 0, events: 0 });

    const content = {
      ...TARIFF,
      effectiveFrom: '2026-05-01T00:00:00Z',
      expectedActiveVersionNumber: null,
    };
    const created = publication(
      await command(
        versionsPath(offeringId),
        content,
        'maximum-source',
        company.id,
      ),
    );
    // Reaching the boundary through 2^31 publications is impractical; the
    // seeded head keeps every other stored value.
    await pool.query(
      'UPDATE tariff_versions SET version_number = 2147483647 WHERE id = $1',
      [created.version.id],
    );
    const atMaximum = {
      ...content,
      expectedActiveVersionNumber: 2_147_483_647,
    };
    const unchanged = publication(
      await command(
        versionsPath(offeringId),
        atMaximum,
        'maximum-unchanged',
        company.id,
      ),
    );
    expect(unchanged).toEqual({
      outcome: 'UNCHANGED',
      version: { ...created.version, versionNumber: 2_147_483_647 },
    });
    expect(
      publication(
        await command(
          versionsPath(offeringId),
          atMaximum,
          'maximum-unchanged',
          company.id,
        ),
      ),
    ).toEqual(unchanged);
    const before = await contentOf(created.version.id);
    const overflow = await post(
      versionsPath(offeringId),
      company.id,
      {
        ...TARIFF,
        unitAmount: '150',
        effectiveFrom: '2026-06-01T00:00:00Z',
        expectedActiveVersionNumber: 2_147_483_647,
      },
      'maximum-overflow',
    );
    expect(overflow.status).toBe(409);
    expect(await overflow.json()).toEqual({
      code: 'VERSION_EXHAUSTED',
      message: expect.any(String),
    });
    expect(await contentOf(created.version.id)).toEqual(before);
    expect(
      publication(
        await command(
          versionsPath(offeringId),
          content,
          'maximum-source',
          company.id,
        ),
      ),
    ).toEqual({
      outcome: 'PUBLISHED',
      version: { ...created.version, versionNumber: 2_147_483_647 },
    });
    // Another offering numbers its own versions from 1.
    expect(
      publication(
        await command(
          versionsPath(otherOfferingId),
          content,
          'other-offering',
          company.id,
        ),
      ).version.versionNumber,
    ).toBe(1);
    await expectCounts({ versions: 2, receipts: 3, events: 2 });
  }, 30_000);

  it('separates identity, bundle and Company failures and discloses nothing across Companies or Workspaces', async () => {
    const { company } = await prepared();
    const offeringId = await offering(company.id, 'SERVICE-A');
    const secret = 'Only PRISMA-PRIM sees this tax label';
    const owned = publication(
      await command(
        versionsPath(offeringId),
        {
          ...TARIFF,
          unitAmount: '4321.9876',
          taxLabel: secret,
          effectiveFrom: '2026-05-01T00:00:00Z',
          expectedActiveVersionNumber: null,
        },
        'secret',
        company.id,
      ),
    );
    const paths = [
      scopePath(offeringId),
      versionsPath(offeringId),
      versionPath(owned.version.id),
    ];
    for (const path of paths) {
      const anonymous = await fetch(`${origin}/api${path}`, {
        headers: { 'x-company-context-id': company.id },
      });
      expect(anonymous.status).toBe(401);
    }
    const anonymousPublication = await fetch(
      `${origin}/api${versionsPath(offeringId)}`,
      {
        method: 'POST',
        headers: {
          'x-company-context-id': company.id,
          'content-type': 'application/json',
          'idempotency-key': 'anonymous',
        },
        body: JSON.stringify({
          ...TARIFF,
          effectiveFrom: '2026-06-01T00:00:00Z',
          expectedActiveVersionNumber: 1,
        }),
      },
    );
    expect(anonymousPublication.status).toBe(401);

    // Configuration v1 grants no Service Definition or offering management.
    await member(CONFIGURATION_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      CONFIGURATION_ASSIGNMENTS,
    ]);
    expect(
      (
        await request(DEFINITIONS, company.id, {
          headers: CONFIGURATION_MEMBER,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(
          OFFERINGS,
          company.id,
          { serviceDefinitionId: UNKNOWN_ID },
          crypto.randomUUID(),
          CONFIGURATION_MEMBER,
        )
      ).status,
    ).toBe(403);

    const other = entity(
      await command('/companies', { displayName: 'BIC' }, 'other-company'),
    );
    const otherMember = await member(OTHER_MEMBER, other.id, [
      CONTEXT_ASSIGNMENTS,
    ]);
    for (const path of paths)
      expect(
        (await request(path, other.id, { headers: OTHER_MEMBER })).status,
      ).toBe(403);
    // Configuration without an independent Company context authorizes nothing.
    await grant(CONFIGURATION_ASSIGNMENTS, {
      workspaceMembershipId: otherMember.membershipId,
      companyId: company.id,
    });
    for (const path of paths) {
      const denied = await request(path, company.id, { headers: OTHER_MEMBER });
      expect(denied.status).toBe(403);
      expect(await denied.text()).not.toContain(secret);
    }
    await grant(CONFIGURATION_ASSIGNMENTS, {
      workspaceMembershipId: otherMember.membershipId,
      companyId: other.id,
    });
    await grant(CATALOGUE_ASSIGNMENTS, {
      workspaceMembershipId: otherMember.membershipId,
      companyId: other.id,
    });
    const otherOffering = await offering(other.id, 'SERVICE-B', OTHER_MEMBER);
    expect(
      await (
        await request(scopePath(otherOffering), other.id, {
          headers: OTHER_MEMBER,
        })
      ).json(),
    ).toEqual({
      offeringId: otherOffering,
      current: null,
      headVersionNumber: null,
      provisional: true,
    });

    // Known identifiers of another Company, of another Workspace, unknown or
    // malformed ones all get the same safe not-found, with no count, head
    // number, amount or label.
    const foreign = await seedForeignWorkspaceTariff();
    const hidden = await request(scopePath(offeringId), other.id, {
      headers: OTHER_MEMBER,
    });
    expect(hidden.status).toBe(404);
    const hiddenBody = await hidden.text();
    for (const text of [secret, '4321', 'headVersionNumber'])
      expect(hiddenBody).not.toContain(text);
    for (const path of [
      versionsPath(offeringId),
      versionPath(owned.version.id),
      scopePath(foreign.offeringId),
      versionsPath(foreign.offeringId),
      versionPath(foreign.versionId),
      scopePath(UNKNOWN_ID),
      versionsPath(UNKNOWN_ID),
      versionPath(UNKNOWN_ID),
      scopePath('not-an-offering'),
      versionPath('not-a-version'),
      `${versionsPath(offeringId)}?limit=51`,
    ]) {
      const response = await request(path, other.id, { headers: OTHER_MEMBER });
      expect({ path, status: response.status }).toEqual({ path, status: 404 });
      expect(await response.text()).toBe(hiddenBody);
    }
    const crossCompanyPublication = await post(
      versionsPath(offeringId),
      other.id,
      {
        ...TARIFF,
        effectiveFrom: '2026-06-01T00:00:00Z',
        expectedActiveVersionNumber: 1,
      },
      'cross-company',
      OTHER_MEMBER,
    );
    expect(crossCompanyPublication.status).toBe(404);
    expect(await crossCompanyPublication.text()).toBe(hiddenBody);
    const foreignWorkspace = await request(scopePath(offeringId), company.id, {
      headers: { 'x-workspace-context-id': FOREIGN_WORKSPACE_ID },
    });
    expect(foreignWorkspace.status).toBe(403);

    // The other Company's own offering numbers from 1 and lists only its own.
    expect(
      publication(
        await command(
          versionsPath(otherOffering),
          {
            ...TARIFF,
            effectiveFrom: '2026-05-01T00:00:00Z',
            expectedActiveVersionNumber: null,
          },
          'bic-tariff',
          other.id,
          OTHER_MEMBER,
        ),
      ).version.versionNumber,
    ).toBe(1);
    expect(
      await (await request(versionsPath(offeringId), company.id)).json(),
    ).toEqual({ items: [owned.version], provisional: true });
    // The Workspace Owner of a Company with no grant is refused.
    const unassigned = entity(
      await command('/companies', { displayName: 'Unassigned' }, 'unassigned'),
    );
    expect((await request(scopePath(offeringId), unassigned.id)).status).toBe(
      403,
    );
    // One head per offering across the database: both publications above and
    // the foreign Workspace fixture, which no request superseded.
    const everyHead: unknown[] = (
      await pool.query(
        `SELECT id, workspace_id, company_id, offering_id, version_number FROM tariff_versions
          WHERE superseded_by_version_id IS NULL`,
      )
    ).rows;
    expect(everyHead).toHaveLength(3);
    expect(everyHead).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: owned.version.id,
          company_id: company.id,
          offering_id: offeringId,
          version_number: 1,
        }),
        expect.objectContaining({
          workspace_id: WORKSPACE_ID,
          company_id: other.id,
          offering_id: otherOffering,
          version_number: 1,
        }),
        expect.objectContaining({
          id: foreign.versionId,
          workspace_id: FOREIGN_WORKSPACE_ID,
          offering_id: foreign.offeringId,
          version_number: 1,
        }),
      ]),
    );
  }, 60_000);

  function scopePath(offeringId: string): string {
    return `/pricing-configuration/offerings/${offeringId}/tariff-scope`;
  }

  function versionsPath(offeringId: string): string {
    return `/pricing-configuration/offerings/${offeringId}/tariff-versions`;
  }

  function versionPath(versionId: string): string {
    return `${TARIFF_VERSIONS}/${versionId}`;
  }

  function request(path: string, companyId?: string, init: RequestInit = {}) {
    return fetch(`${origin}/api${path}`, {
      ...init,
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': 'workspace-owner',
        'x-test-display-name': 'Workspace Owner',
        'x-test-email': 'owner@example.test',
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        ...init.headers,
      },
    });
  }

  function post(
    path: string,
    companyId: string | undefined,
    body: unknown,
    key: string,
    headers: Record<string, string> = {},
  ) {
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
    headers: Record<string, string> = {},
  ): Promise<unknown> {
    const response = await post(path, companyId, body, key, headers);
    const value: unknown = await response.json();
    expect({ status: response.status, value }).toMatchObject({ status: 201 });
    return value;
  }

  async function grant(
    path: string,
    target: { workspaceMembershipId: string; companyId: string },
  ): Promise<void> {
    await command(path, target, `${path}-${crypto.randomUUID()}`);
  }

  async function actorOf(
    companyId: string | undefined,
    headers: Record<string, string> = {},
  ): Promise<{ membershipId: string }> {
    const actor = record(
      await (
        await request('/access/current-actor', companyId, { headers })
      ).json(),
    );
    return { membershipId: stringField(actor, 'workspaceMembershipId') };
  }

  // A Company whose owner holds Configuration v1 and, to record offerings,
  // Catalogue v1.
  async function prepared() {
    const company = entity(
      await command(
        '/companies',
        { displayName: 'PRISMA-PRIM' },
        `company-${crypto.randomUUID()}`,
      ),
    );
    const owner = await actorOf(company.id);
    for (const path of [CONFIGURATION_ASSIGNMENTS, CATALOGUE_ASSIGNMENTS])
      await grant(path, {
        workspaceMembershipId: owner.membershipId,
        companyId: company.id,
      });
    return { company, owner };
  }

  // Records an illustrative Service Definition and the Company's offering of
  // it through the catalogue API, and returns the offering id.
  async function offering(
    companyId: string,
    code: string,
    headers: Record<string, string> = {},
  ): Promise<string> {
    const definition = record(
      record(
        await command(
          DEFINITIONS,
          { code, name: `Illustrative service ${code}` },
          `definition-${code}`,
          companyId,
          headers,
        ),
      ).definition,
    );
    return stringField(
      record(
        record(
          await command(
            OFFERINGS,
            {
              serviceDefinitionId: stringField(definition, 'id'),
              commercialLabel: `Illustrative offering ${code}`,
            },
            `offering-${code}`,
            companyId,
            headers,
          ),
        ).offering,
      ),
      'id',
    );
  }

  async function member(
    headers: Record<string, string>,
    companyId: string,
    assignmentPaths: readonly string[],
  ): Promise<{ membershipId: string }> {
    const actor = await actorOf(undefined, headers);
    for (const path of assignmentPaths)
      await grant(path, {
        workspaceMembershipId: actor.membershipId,
        companyId: companyId,
      });
    return actor;
  }

  // The immutable content of a version: everything except the three
  // takeover columns written once by a successor.
  async function contentOf(versionId: string): Promise<unknown> {
    const result = await pool.query<{ content: unknown }>(
      `SELECT to_jsonb(version) - 'superseded_by_version_id' - 'superseded_at' - 'superseded_from' AS content
         FROM tariff_versions AS version WHERE id = $1`,
      [versionId],
    );
    return result.rows;
  }

  async function heads(): Promise<unknown[]> {
    return (
      await pool.query(
        `SELECT offering_id, version_number FROM tariff_versions
          WHERE superseded_by_version_id IS NULL ORDER BY offering_id`,
      )
    ).rows;
  }

  async function seedForeignWorkspaceTariff(): Promise<{
    versionId: string;
    offeringId: string;
  }> {
    const versionId = '00000000-0000-4000-8000-000000000398';
    const seeded = await pool.query<{ offeringId: string }>(
      `WITH foreign_workspace AS (
         INSERT INTO workspaces (id, name) VALUES ($1, 'Foreign Workspace')
         RETURNING id
       ), foreign_user AS (
         INSERT INTO internal_users (external_provider, external_subject, display_name, email)
         VALUES ('deterministic-test', 'foreign-owner', 'Foreign Owner', 'foreign@example.test')
         RETURNING id
       ), foreign_membership AS (
         INSERT INTO workspace_memberships (workspace_id, internal_user_id)
         SELECT foreign_workspace.id, foreign_user.id FROM foreign_workspace, foreign_user
         RETURNING id, workspace_id, internal_user_id
       ), foreign_company AS (
         INSERT INTO companies (
           workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id, registration_idempotency_key
         )
         SELECT workspace_id, 'Foreign Company', internal_user_id, id, 'foreign-company'
         FROM foreign_membership
         RETURNING id, workspace_id
       ), foreign_definition AS (
         INSERT INTO service_definitions (
           workspace_id, code, name, created_by_internal_user_id,
           created_by_workspace_membership_id, created_in_company_id
         )
         SELECT foreign_membership.workspace_id, 'FOREIGN', 'Foreign service',
                foreign_membership.internal_user_id, foreign_membership.id, foreign_company.id
         FROM foreign_membership
         INNER JOIN foreign_company ON foreign_company.workspace_id = foreign_membership.workspace_id
         RETURNING id, workspace_id
       ), foreign_offering AS (
         INSERT INTO company_service_offerings (
           workspace_id, company_id, service_definition_id,
           created_by_internal_user_id, created_by_workspace_membership_id
         )
         SELECT foreign_membership.workspace_id, foreign_company.id, foreign_definition.id,
                foreign_membership.internal_user_id, foreign_membership.id
         FROM foreign_membership
         INNER JOIN foreign_company ON foreign_company.workspace_id = foreign_membership.workspace_id
         INNER JOIN foreign_definition ON foreign_definition.workspace_id = foreign_membership.workspace_id
         RETURNING id, workspace_id, company_id
       )
       INSERT INTO tariff_versions (
         id, workspace_id, company_id, offering_id, version_number, unit, unit_amount,
         currency, tax_rate_percent, tax_label, effective_from,
         created_by_internal_user_id, created_by_workspace_membership_id, created_at
       )
       SELECT $2, foreign_offering.workspace_id, foreign_offering.company_id, foreign_offering.id, 1,
              'foreign-unit', 1, 'EUR', 0, 'Foreign tax', TIMESTAMPTZ '2026-05-01 00:00:00+00',
              foreign_membership.internal_user_id, foreign_membership.id,
              TIMESTAMPTZ '2026-04-01 00:00:00+00'
       FROM foreign_membership
       INNER JOIN foreign_offering ON foreign_offering.workspace_id = foreign_membership.workspace_id
       RETURNING offering_id AS "offeringId"`,
      [FOREIGN_WORKSPACE_ID, versionId],
    );
    const offeringId = seeded.rows[0]?.offeringId;
    if (seeded.rowCount !== 1 || offeringId === undefined)
      throw new Error('Expected one foreign Workspace Tariff Version.');
    return { versionId, offeringId };
  }

  // The lock-barrier helpers below are those of the Pricing Rule suite,
  // copied unchanged so its cases stay untouched. Waiters are observed
  // through pg_locks and pg_blocking_pids; nothing sleeps for a duration it
  // then assumes was enough.
  async function lockRows(
    query: string,
    values: readonly string[],
  ): Promise<{ connection: PoolClient; backendPid: number }> {
    return holdLock(async (connection) => {
      const locked = await connection.query(query, [...values]);
      if (locked.rowCount !== 1) throw new Error('Expected one row to lock.');
    });
  }

  async function holdLock(
    acquire: (connection: PoolClient) => Promise<void>,
  ): Promise<{ connection: PoolClient; backendPid: number }> {
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      const backend = await connection.query<{ backendPid: number }>(
        'SELECT pg_backend_pid() AS "backendPid"',
      );
      const backendPid = backend.rows[0]?.backendPid;
      if (backendPid === undefined) throw new Error('Missing blocker backend.');
      await acquire(connection);
      return { connection, backendPid };
    } catch (error) {
      await connection.query('ROLLBACK');
      connection.release();
      throw error;
    }
  }

  async function waitForBlockedBy(backendPid: number): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const blocked = await pool.query<{ blocked: boolean }>(
        `SELECT EXISTS (
           SELECT 1
             FROM pg_stat_activity
            WHERE datname = current_database()
              AND $1::integer = ANY(pg_blocking_pids(pid))
         ) AS blocked`,
        [backendPid],
      );
      if (blocked.rows[0]?.blocked) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('The publication did not reach the lock barrier.');
  }

  // Waits until every observer has either answered or is waiting on a lock,
  // so the assertions prove what each one may observe, not how fast it ran.
  // The paused publication is the one other waiting backend.
  async function waitForObservers(
    observers: number,
    answered: () => number,
  ): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const blocked = await pool.query<{ waiting: number }>(
        `SELECT count(*)::integer AS waiting
           FROM pg_stat_activity
          WHERE datname = current_database()
            AND cardinality(pg_blocking_pids(pid)) > 0`,
      );
      const waiting = (blocked.rows[0]?.waiting ?? 0) - 1;
      if (answered() + waiting >= observers) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('The observers neither answered nor waited.');
  }

  // Waits until exactly `count` requests of this database wait for an
  // advisory lock. In the cases using it, the only advisory locks contended
  // are an offering's scope protection held by a paused operation and a lock
  // the test itself holds.
  async function waitForAdvisoryWaiters(count: number): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const waiting = await pool.query<{ waiting: number }>(
        `SELECT count(*)::integer AS waiting
           FROM pg_locks
          WHERE locktype = 'advisory'
            AND NOT granted
            AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
      );
      if (waiting.rows[0]?.waiting === count) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('The operations did not wait on the scope protection.');
  }

  // Tariff rows only: the receipt and event tables also hold Pricing Rule
  // publications, which these counts leave out.
  async function expectCounts(expected: {
    versions: number;
    receipts: number;
    events: number;
  }): Promise<void> {
    const counts = await pool.query<{
      versions: string;
      receipts: string;
      events: string;
    }>(
      `SELECT
        (SELECT count(*) FROM tariff_versions WHERE workspace_id = $1) AS versions,
        (SELECT count(*) FROM pricing_configuration_commands
          WHERE command = 'tariff_version.publish') AS receipts,
        (SELECT count(*) FROM pricing_configuration_events
          WHERE action = 'tariff_version.published') AS events`,
      [WORKSPACE_ID],
    );
    expect(counts.rows).toEqual([
      {
        versions: String(expected.versions),
        receipts: String(expected.receipts),
        events: String(expected.events),
      },
    ]);
  }
});

function memberHeaders(subject: string): Record<string, string> {
  return {
    'x-test-external-subject': subject,
    'x-test-display-name': subject,
    'x-test-email': `${subject}@example.test`,
  };
}

type VersionView = Record<string, unknown> & {
  id: string;
  versionNumber: number;
  effectiveFrom: string;
  unitAmount: string;
  taxRatePercent: string;
  createdAt: string;
  supersession: unknown;
};

function versionRecord(value: unknown): VersionView {
  const version = record(value);
  return {
    ...version,
    id: stringField(version, 'id'),
    versionNumber: numberField(version, 'versionNumber'),
    effectiveFrom: stringField(version, 'effectiveFrom'),
    unitAmount: stringField(version, 'unitAmount'),
    taxRatePercent: stringField(version, 'taxRatePercent'),
    createdAt: stringField(version, 'createdAt'),
    supersession: version.supersession,
  };
}

function publication(value: unknown): {
  outcome: string;
  version: VersionView;
} {
  const result = record(value);
  return {
    outcome: stringField(result, 'outcome'),
    version: versionRecord(result.version),
  };
}

function scopeRecord(value: unknown): Record<string, unknown> & {
  current: VersionView | null;
  headVersionNumber: number | null;
  provisional: unknown;
} {
  const scope = record(value);
  const head = scope.headVersionNumber;
  if (head !== null && typeof head !== 'number')
    throw new Error('Expected a head version number.');
  return {
    ...scope,
    current: scope.current === null ? null : versionRecord(scope.current),
    headVersionNumber: head,
    provisional: scope.provisional,
  };
}

function pageRecord(value: unknown): {
  items: VersionView[];
  nextCursor?: string;
} {
  const page = record(value);
  if (!Array.isArray(page.items)) throw new Error('Expected a version page.');
  const cursor = page.nextCursor;
  if (cursor !== undefined && typeof cursor !== 'string')
    throw new Error('Expected a string cursor.');
  return {
    items: page.items.map(versionRecord),
    ...(cursor === undefined ? {} : { nextCursor: cursor }),
  };
}

function entity(value: unknown): { id: string } {
  return { id: stringField(record(value), 'id') };
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
