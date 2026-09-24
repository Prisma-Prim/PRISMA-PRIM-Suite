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

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000360';
const FOREIGN_WORKSPACE_ID = '00000000-0000-4000-8000-000000000361';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000999';
const SCOPE = '/pricing-configuration/rule-scope';
const VERSIONS = '/pricing-configuration/rule-versions';
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
const RULE_FIELDS = {
  ruleShape: 'UNIT_PRICE_TIMES_QUANTITY',
  roundingMode: 'HALF_UP',
  roundingScale: 2,
  taxApplication: 'PER_LINE',
  provenance: 'ILLUSTRATIVE',
  provisional: true,
};
const CONFIGURATION_MEMBER = memberHeaders('configuration-member');
const CATALOGUE_MEMBER = memberHeaders('catalogue-member');
const OTHER_MEMBER = memberHeaders('other-member');

// Only the server clock boundary is replaced; every command and read samples
// it once, so each fixed instant below is the instant the server evaluates.
let serverInstant = new Date('2026-04-01T00:00:00.000Z');
const serverClock: ServerClock = {
  now: () => new Date(serverInstant.getTime()),
};
function setClock(value: string): void {
  serverInstant = new Date(value);
}

withPostgres('Company Pricing Configuration REST', () => {
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
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Pricing Configuration Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
          ['configuration-member', 'catalogue-member', 'other-member'].map(
            (subject) => ({
              provider: 'deterministic-test',
              subject,
              workspaceId: WORKSPACE_ID,
            }),
          ),
        ),
      },
    });
    ({ origin, pool } = harness);
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'pricing_configuration',
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

  it('grants captured Configuration v1, publishes a scheduled first version with no current one and denies a Catalogue-only member', async () => {
    const company = entity(
      await command('/companies', { displayName: 'PRISMA-PRIM' }, 'company'),
    );
    expect((await request(SCOPE, company.id)).status).toBe(403);
    const owner = await actorOf(company.id);
    expect(
      await command(
        CONFIGURATION_ASSIGNMENTS,
        { companyId: company.id, workspaceMembershipId: owner.membershipId },
        'grant-configuration',
      ),
    ).toMatchObject({
      workspaceMembershipId: owner.membershipId,
      companyId: company.id,
      bundle: 'Company Pricing Configuration',
      permissionSetVersion: 'v1',
      active: true,
    });
    const selected = record(
      await (await request('/access/current-actor', company.id)).json(),
    );
    expect(record(selected.activeCompany)).toMatchObject({
      pricingConfigurationPermissions: CONFIGURATION_PERMISSIONS,
      pricingConfigurationPermissionSetVersion: 'v1',
    });
    expect(
      (
        await pool.query(
          `SELECT bundle::text, permission_set_version FROM company_role_assignments
            WHERE bundle = 'company_pricing_configuration'`,
        )
      ).rows,
    ).toEqual([
      { bundle: 'company_pricing_configuration', permission_set_version: 'v1' },
    ]);
    expect(
      (
        await pool.query(
          `SELECT action::text, target_company_id, metadata FROM activity_log_events
            WHERE action::text LIKE 'company_pricing_configuration_assignment.%'`,
        )
      ).rows,
    ).toEqual([
      {
        action: 'company_pricing_configuration_assignment.granted',
        target_company_id: company.id,
        metadata: { bundle: 'Company Pricing Configuration' },
      },
    ]);
    const administration = record(
      await (
        await request('/company-context-assignments/administration')
      ).json(),
    );
    expect(administration.assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceMembershipId: owner.membershipId,
          companyId: company.id,
          bundle: 'Company Pricing Configuration',
          permissionSetVersion: 'v1',
        }),
      ]),
    );

    const published = publication(
      await command(
        VERSIONS,
        {
          label: 'Illustrative rule A',
          effectiveFrom: '2026-04-02T00:00:00Z',
          expectedActiveVersionNumber: null,
        },
        'rule-a',
        company.id,
      ),
    );
    expect(published).toEqual({
      outcome: 'PUBLISHED',
      version: {
        id: published.version.id,
        versionNumber: 1,
        label: 'Illustrative rule A',
        effectiveFrom: '2026-04-02T00:00:00.000Z',
        effectiveTo: null,
        ...RULE_FIELDS,
        state: 'SCHEDULED',
        supersession: null,
        createdByWorkspaceMembershipId: owner.membershipId,
        createdAt: '2026-04-01T00:00:00.000Z',
      },
    });
    const scope = await (await request(SCOPE, company.id)).json();
    expect(scope).toEqual({
      current: null,
      headVersionNumber: 1,
      provisional: true,
    });
    const page = await (await request(VERSIONS, company.id)).json();
    expect(page).toEqual({ items: [published.version], provisional: true });
    expect(
      await (
        await request(`${VERSIONS}/${published.version.id}`, company.id)
      ).json(),
    ).toEqual(published.version);

    expect(
      (
        await pool.query(
          `SELECT action, company_id, pricing_rule_version_id, actor_workspace_membership_id,
                  occurred_at, metadata
             FROM pricing_configuration_events`,
        )
      ).rows,
    ).toEqual([
      {
        action: 'pricing_rule_version.published',
        company_id: company.id,
        pricing_rule_version_id: published.version.id,
        actor_workspace_membership_id: owner.membershipId,
        occurred_at: new Date('2026-04-01T00:00:00.000Z'),
        metadata: {
          pricingRuleVersionId: published.version.id,
          versionNumber: 1,
          provenance: 'ILLUSTRATIVE',
        },
      },
    ]);
    expect(
      (
        await pool.query(
          `SELECT command, outcome, idempotency_key, result_pricing_rule_version_id, created_at
             FROM pricing_configuration_commands`,
        )
      ).rows,
    ).toEqual([
      {
        command: 'pricing_rule_version.publish',
        outcome: 'PUBLISHED',
        idempotency_key: 'rule-a',
        result_pricing_rule_version_id: published.version.id,
        created_at: new Date('2026-04-01T00:00:00.000Z'),
      },
    ]);
    const activity = JSON.stringify(
      await (await request('/activity-log', company.id)).json(),
    );
    expect(activity).not.toContain('pricing_rule_version.published');
    expect(activity).not.toContain(published.version.id);
    expect(activity).not.toContain('Illustrative rule A');

    const catalogueMember = await member(CATALOGUE_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      CATALOGUE_ASSIGNMENTS,
    ]);
    for (const path of [
      SCOPE,
      VERSIONS,
      `${VERSIONS}/${published.version.id}`,
    ]) {
      const denied = await request(path, company.id, {
        headers: CATALOGUE_MEMBER,
      });
      expect(denied.status).toBe(403);
      expect(await denied.text()).not.toContain('Illustrative rule A');
    }
    const deniedPublication = await post(
      VERSIONS,
      company.id,
      {
        label: 'Catalogue member rule',
        effectiveFrom: '2026-05-01T00:00:00Z',
        expectedActiveVersionNumber: 1,
      },
      'catalogue-member-rule',
      CATALOGUE_MEMBER,
    );
    expect(deniedPublication.status).toBe(403);
    expect(await deniedPublication.text()).not.toContain('headVersionNumber');
    expect(
      record(
        record(
          await (
            await request('/access/current-actor', company.id, {
              headers: CATALOGUE_MEMBER,
            })
          ).json(),
        ).activeCompany,
      ).pricingConfigurationPermissions,
    ).toBeUndefined();
    expect(catalogueMember.membershipId).not.toBe(owner.membershipId);
    await expectCounts({ versions: 1, receipts: 1, events: 1 });

    await harness.close();
    await openHarness();
    expect(await (await request(VERSIONS, company.id)).json()).toEqual(page);
    setClock('2026-04-02T00:00:00.000Z');
    expect(await (await request(SCOPE, company.id)).json()).toEqual({
      current: { ...published.version, state: 'CURRENT' },
      headVersionNumber: 1,
      provisional: true,
    });
  }, 30_000);

  it('rejects a stale expectation naming only the head number, replays before the stale check and writes only the takeover metadata', async () => {
    const { company } = await prepared();
    const first = {
      label: 'Illustrative rule A',
      effectiveFrom: '2026-04-10T00:00:00Z',
      expectedActiveVersionNumber: null,
    };
    const v1 = publication(await command(VERSIONS, first, 'v1', company.id));
    const before = await contentOf(v1.version.id);

    const nullWithHead = await post(
      VERSIONS,
      company.id,
      { ...first, label: 'Competing first rule' },
      'competing-first',
    );
    expect(nullWithHead.status).toBe(409);
    expect(await nullWithHead.json()).toEqual({
      code: 'STALE_ACTIVE_VERSION',
      message: expect.any(String),
      headVersionNumber: 1,
    });

    setClock('2026-04-05T12:00:00.000Z');
    const v2 = publication(
      await command(
        VERSIONS,
        {
          label: 'Illustrative rule B',
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
      state: 'SCHEDULED',
      supersession: null,
      effectiveTo: '2026-09-01T00:00:00.000Z',
      createdAt: '2026-04-05T12:00:00.000Z',
    });
    const takenOver = versionRecord(
      await (await request(`${VERSIONS}/${v1.version.id}`, company.id)).json(),
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
        VERSIONS,
        company.id,
        {
          label: 'Late rule',
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
    const replay = publication(
      await command(VERSIONS, first, 'v1', company.id),
    );
    expect(replay).toEqual({ outcome: 'PUBLISHED', version: takenOver });

    await expectCounts({ versions: 2, receipts: 2, events: 2 });
    expect(await heads()).toEqual([
      { company_id: company.id, version_number: 2 },
    ]);
  }, 30_000);

  it('returns UNCHANGED with a durable receipt after start and expiry, replays receipts and conflicts on any changed field', async () => {
    const { company } = await prepared();
    const content = {
      label: 'Illustrative rule A',
      effectiveFrom: '2026-04-02T00:00:00Z',
      effectiveTo: '2026-05-01T00:00:00Z',
      expectedActiveVersionNumber: null,
    };
    const created = publication(
      await command(VERSIONS, content, 'created', company.id),
    );
    const again = { ...content, expectedActiveVersionNumber: 1 };
    const cases = [
      ['2026-04-01T06:00:00.000Z', again, 'SCHEDULED'],
      [
        '2026-04-15T00:00:00.000Z',
        {
          ...again,
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
        await command(VERSIONS, body, `unchanged-${index}`, company.id),
      );
      expect(unchanged).toEqual({
        outcome: 'UNCHANGED',
        version: { ...created.version, state },
      });
      expect(
        publication(
          await command(VERSIONS, body, `unchanged-${index}`, company.id),
        ),
      ).toEqual(unchanged);
    }
    // Every other check still applies to identical content.
    const staleIdentical = await post(
      VERSIONS,
      company.id,
      content,
      'identical-stale',
    );
    expect(staleIdentical.status).toBe(409);
    expect(await staleIdentical.json()).toMatchObject({
      code: 'STALE_ACTIVE_VERSION',
      headVersionNumber: 1,
    });

    for (const changed of [
      { ...again, label: `${again.label} ` },
      { ...again, effectiveTo: '2026-05-01T00:00:00.000Z' },
      { ...again, expectedActiveVersionNumber: null },
      { label: again.label, effectiveFrom: again.effectiveFrom },
    ]) {
      const conflict = await post(VERSIONS, company.id, changed, 'unchanged-0');
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
      });
    }
    expect(
      (
        await pool.query(
          `SELECT idempotency_key, outcome, result_pricing_rule_version_id
             FROM pricing_configuration_commands ORDER BY idempotency_key`,
        )
      ).rows,
    ).toEqual([
      {
        idempotency_key: 'created',
        outcome: 'PUBLISHED',
        result_pricing_rule_version_id: created.version.id,
      },
      ...[0, 1, 2].map((index) => ({
        idempotency_key: `unchanged-${index}`,
        outcome: 'UNCHANGED',
        result_pricing_rule_version_id: created.version.id,
      })),
    ]);
    // The original record and its times are preserved.
    expect(
      versionRecord(
        await (
          await request(`${VERSIONS}/${created.version.id}`, company.id)
        ).json(),
      ),
    ).toEqual({ ...created.version, state: 'SUPERSEDED' });
    await expectCounts({ versions: 1, receipts: 4, events: 1 });
  }, 30_000);

  it.each([
    [
      '2026-04-30T12:00:00.000Z',
      '2026-05-01T00:00:00Z',
      { status: 201, code: undefined },
    ],
    [
      '2026-04-30T12:00:00.000Z',
      '2026-05-02T00:00:00Z',
      { status: 409, code: 'EFFECTIVE_WINDOW_GAP' },
    ],
    [
      '2026-05-01T00:00:00.000Z',
      '2026-05-02T00:00:00Z',
      { status: 201, code: undefined },
    ],
    [
      '2026-05-02T00:00:00.000Z',
      '2026-05-03T00:00:00Z',
      { status: 201, code: undefined },
    ],
    [
      '2026-05-02T00:00:00.000Z',
      '2026-05-01T00:00:00Z',
      { status: 400, code: 'EFFECTIVE_FROM_PAST' },
    ],
  ])(
    'holds the section 11.3 boundary row committed at %s for a successor from %s',
    async (commitInstant, effectiveFrom, expected) => {
      const { company } = await prepared();
      setClock('2026-03-01T00:00:00.000Z');
      const head = publication(
        await command(
          VERSIONS,
          {
            label: 'Illustrative rule A',
            effectiveFrom: '2026-04-01T00:00:00Z',
            effectiveTo: '2026-05-01T00:00:00Z',
            expectedActiveVersionNumber: null,
          },
          'head',
          company.id,
        ),
      );
      const before = await contentOf(head.version.id);
      setClock(commitInstant);
      const response = await post(
        VERSIONS,
        company.id,
        {
          label: 'Illustrative rule B',
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
          createdAt: commitInstant,
        });
        expect(
          versionRecord(
            await (
              await request(`${VERSIONS}/${head.version.id}`, company.id)
            ).json(),
          ).supersession,
        ).toEqual({
          supersededByVersionId: successor.version.id,
          supersededAt: commitInstant,
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
    setClock('2026-03-01T00:00:00.000Z');
    await command(
      VERSIONS,
      {
        label: 'Illustrative rule A',
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
        VERSIONS,
        {
          label: 'Illustrative rule B',
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
        await (await request(SCOPE, company.id)).json(),
      );
      expect(scope.headVersionNumber).toBe(2);
      expect(scope.current?.versionNumber ?? null).toBe(current);
    }
    expect(resumed.version.effectiveFrom).toBe('2026-05-03T00:00:00.000Z');
  }, 30_000);

  it('rejects a start not later than the head start, an inverted window and stores submitted instants verbatim', async () => {
    const { company } = await prepared();
    const head = publication(
      await command(
        VERSIONS,
        {
          label: 'Illustrative rule A',
          effectiveFrom: '2026-06-01T00:00:00Z',
          expectedActiveVersionNumber: null,
        },
        'scheduled-head',
        company.id,
      ),
    );
    for (const effectiveFrom of [
      '2026-06-01T00:00:00Z',
      '2026-06-01T03:00:00+03:00',
      '2026-05-31T00:00:00Z',
    ]) {
      const response = await post(
        VERSIONS,
        company.id,
        {
          label: 'Not advancing',
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
    const inverted = await post(
      VERSIONS,
      company.id,
      {
        label: 'Inverted',
        effectiveFrom: '2026-07-01T00:00:00Z',
        effectiveTo: '2026-07-01T00:00:00Z',
        expectedActiveVersionNumber: 1,
      },
      'inverted',
    );
    expect(inverted.status).toBe(400);
    expect(await inverted.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
      field: 'effectiveTo',
    });
    // One millisecond later advances, and the submitted instant is stored as
    // submitted rather than replaced by the server instant.
    const advanced = publication(
      await command(
        VERSIONS,
        {
          label: 'Advances by one millisecond',
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
    expect(head.version.createdAt).toBe('2026-04-01T00:00:00.000Z');
    // A start exactly at the commit instant is not back-dating.
    setClock('2026-06-01T00:00:00.002Z');
    const exactlyNow = publication(
      await command(
        VERSIONS,
        {
          label: 'Starts at the commit instant',
          effectiveFrom: '2026-06-01T00:00:00.002Z',
          expectedActiveVersionNumber: 2,
        },
        'exactly-now',
        company.id,
      ),
    );
    expect(exactlyNow.version).toMatchObject({
      effectiveFrom: '2026-06-01T00:00:00.002Z',
      createdAt: '2026-06-01T00:00:00.002Z',
      state: 'CURRENT',
    });
    await expectCounts({ versions: 3, receipts: 3, events: 3 });
  }, 30_000);

  it('derives the section 7 CURRENT column and exposes the head separately with no job', async () => {
    const { company } = await prepared();
    setClock('2025-12-01T00:00:00.000Z');
    const versions: VersionView[] = [];
    for (const [index, body] of [
      { label: 'Rule v1', effectiveFrom: '2026-01-01T00:00:00Z' },
      {
        label: 'Rule v2',
        effectiveFrom: '2026-03-01T00:00:00Z',
        effectiveTo: '2026-06-01T00:00:00Z',
      },
      {
        label: 'Rule v3',
        effectiveFrom: '2026-04-01T00:00:00Z',
        effectiveTo: '2026-05-01T00:00:00Z',
      },
    ].entries())
      versions.push(
        publication(
          await command(
            VERSIONS,
            {
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
          `SELECT version_number, superseded_from FROM pricing_rule_versions
            WHERE company_id = $1 ORDER BY version_number`,
          [company.id],
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
        await (await request(SCOPE, company.id)).json(),
      );
      expect({
        instant,
        current: scope.current?.versionNumber ?? null,
      }).toEqual({ instant, current });
      expect(scope.headVersionNumber).toBe(3);
      expect(scope.provisional).toBe(true);
    }

    setClock('2026-02-15T12:00:00.000Z');
    const page = await (await request(VERSIONS, company.id)).json();
    expect(page).toEqual({
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
      await (await request(`${VERSIONS}/${first.id}`, company.id)).json(),
    ).toMatchObject({ id: first.id, versionNumber: 1, state: 'SUPERSEDED' });
    // No endpoint edits, deletes or relabels a version.
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const response = await request(`${VERSIONS}/${first.id}`, company.id, {
        method,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `edit-${method}`,
        },
        body: JSON.stringify({ label: 'Edited', provenance: 'REAL' }),
      });
      expect(response.status).toBe(404);
    }
    expect(
      (
        await pool.query(
          `SELECT label, provenance FROM pricing_rule_versions WHERE id = $1`,
          [first.id],
        )
      ).rows,
    ).toEqual([{ label: 'Rule v1', provenance: 'ILLUSTRATIVE' }]);
  }, 30_000);

  it('pages versions newest first by number with a stable bounded cursor', async () => {
    const { company } = await prepared();
    for (let index = 0; index < 27; index += 1)
      await command(
        VERSIONS,
        {
          label: `Rule ${index + 1}`,
          effectiveFrom: `2026-05-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
          expectedActiveVersionNumber: index === 0 ? null : index,
        },
        `page-${index}`,
        company.id,
      );
    const first = pageRecord(
      await (await request(VERSIONS, company.id)).json(),
    );
    expect(first.items.map((item) => item.versionNumber)).toEqual(
      Array.from({ length: 25 }, (_, index) => 27 - index),
    );
    const cursor = first.nextCursor;
    if (!cursor) throw new Error('Expected a next cursor.');
    // A publication between pages does not shift the stable cursor.
    await command(
      VERSIONS,
      {
        label: 'Rule 28',
        effectiveFrom: '2026-06-01T00:00:00Z',
        expectedActiveVersionNumber: 27,
      },
      'page-27',
      company.id,
    );
    const second = pageRecord(
      await (
        await request(
          `${VERSIONS}?limit=25&cursor=${encodeURIComponent(cursor)}`,
          company.id,
        )
      ).json(),
    );
    expect(second.items.map((item) => item.versionNumber)).toEqual([2, 1]);
    expect(second.nextCursor).toBeUndefined();
    const bounded = pageRecord(
      await (await request(`${VERSIONS}?limit=50`, company.id)).json(),
    );
    expect(bounded.items).toHaveLength(28);
    for (const query of [
      'limit=51',
      'limit=0',
      'limit=abc',
      'cursor=invalid',
      `cursor=${Buffer.from('{"versionNumber":0}').toString('base64url')}`,
    ]) {
      const invalid = await request(`${VERSIONS}?${query}`, company.id);
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toMatchObject({ code: 'INVALID_PAGE' });
    }
  }, 60_000);

  it('leaves exactly one head per Company under concurrent first, successor and retried publications', async () => {
    const { company } = await prepared();
    const firsts = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        post(
          VERSIONS,
          company.id,
          {
            label: `Competing first ${index}`,
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
      { company_id: company.id, version_number: 1 },
    ]);

    const successors = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        post(
          VERSIONS,
          company.id,
          {
            label: `Competing successor ${index}`,
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
      { company_id: company.id, version_number: 2 },
    ]);

    // Holding the head row proves a publication locks it before taking over.
    const blocker = await lockRows(
      `SELECT id FROM pricing_rule_versions
        WHERE company_id = $1 AND superseded_by_version_id IS NULL FOR UPDATE`,
      [company.id],
    );
    let released = false;
    try {
      const pending = Promise.all(
        ['blocked-a', 'blocked-b'].map((key, index) =>
          post(
            VERSIONS,
            company.id,
            {
              label: `Blocked successor ${index}`,
              effectiveFrom: `2026-07-0${index + 1}T00:00:00Z`,
              expectedActiveVersionNumber: 2,
            },
            key,
          ),
        ),
      );
      await waitForBlockedBy(blocker.backendPid);
      await blocker.connection.query('COMMIT');
      released = true;
      expect(
        (await pending)
          .map((response) => response.status)
          .sort((a, b) => a - b),
      ).toEqual([201, 409]);
    } finally {
      if (!released) await blocker.connection.query('ROLLBACK');
      blocker.connection.release();
    }
    expect(await heads()).toEqual([
      { company_id: company.id, version_number: 3 },
    ]);

    const retries = await Promise.all(
      Array.from({ length: 6 }, () =>
        post(
          VERSIONS,
          company.id,
          {
            label: 'Retried rule',
            effectiveFrom: '2026-08-01T00:00:00Z',
            expectedActiveVersionNumber: 3,
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
    await expectCounts({ versions: 4, receipts: 4, events: 4 });
    expect(await heads()).toEqual([
      { company_id: company.id, version_number: 4 },
    ]);
  }, 60_000);

  it('revalidates live authority under a row lock before replaying or committing', async () => {
    const { company } = await prepared();
    const configurationMember = await member(CONFIGURATION_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      CONFIGURATION_ASSIGNMENTS,
    ]);
    const body = {
      label: 'Member rule',
      effectiveFrom: '2026-05-01T00:00:00Z',
      expectedActiveVersionNumber: null,
    };
    const created = await post(
      VERSIONS,
      company.id,
      body,
      'member-rule',
      CONFIGURATION_MEMBER,
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    const revoke = await request(
      `${CONFIGURATION_ASSIGNMENTS}/${configurationMember.membershipId}/${company.id}`,
      undefined,
      { method: 'DELETE', headers: { 'idempotency-key': 'revoke' } },
    );
    expect(revoke.status).toBe(200);
    expect(
      (
        await pool.query(
          `SELECT action::text, metadata FROM activity_log_events
            WHERE action::text = 'company_pricing_configuration_assignment.revoked'`,
        )
      ).rows,
    ).toEqual([
      {
        action: 'company_pricing_configuration_assignment.revoked',
        metadata: { bundle: 'Company Pricing Configuration' },
      },
    ]);
    const deniedReplay = await post(
      VERSIONS,
      company.id,
      body,
      'member-rule',
      CONFIGURATION_MEMBER,
    );
    expect(deniedReplay.status).toBe(403);
    expect(await deniedReplay.text()).not.toContain('Member rule');
    expect(
      (await request(SCOPE, company.id, { headers: CONFIGURATION_MEMBER }))
        .status,
    ).toBe(403);
    await grant(CONFIGURATION_ASSIGNMENTS, {
      workspaceMembershipId: configurationMember.membershipId,
      companyId: company.id,
    });
    const replay = await post(
      VERSIONS,
      company.id,
      body,
      'member-rule',
      CONFIGURATION_MEMBER,
    );
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(createdBody);

    for (const [key, payload] of [
      ['member-rule', body],
      [
        'member-fresh',
        {
          label: 'Fresh member rule',
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
          VERSIONS,
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
        expect(await outcome.text()).not.toContain('Member rule');
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

    await pool.query("UPDATE companies SET status = 'inactive' WHERE id = $1", [
      company.id,
    ]);
    expect(
      (await request(SCOPE, company.id, { headers: CONFIGURATION_MEMBER }))
        .status,
    ).toBe(403);
    await pool.query("UPDATE companies SET status = 'active' WHERE id = $1", [
      company.id,
    ]);
    await pool.query(
      "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
      [configurationMember.membershipId],
    );
    const inactive = await post(
      VERSIONS,
      company.id,
      body,
      'member-rule',
      CONFIGURATION_MEMBER,
    );
    expect(inactive.status).toBe(403);
    await expectCounts({ versions: 1, receipts: 1, events: 1 });
  }, 60_000);

  it('bounds the expected head number as field validation and refuses allocation beyond the stored range atomically', async () => {
    const { company } = await prepared();
    for (const expectedActiveVersionNumber of [
      0,
      -1,
      1.5,
      '1',
      2_147_483_648,
      true,
    ]) {
      const response = await post(
        VERSIONS,
        company.id,
        {
          label: 'Bounded rule',
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
      label: 'Maximum rule',
      effectiveFrom: '2026-05-01T00:00:00Z',
      expectedActiveVersionNumber: null,
    };
    const created = publication(
      await command(VERSIONS, content, 'maximum-source', company.id),
    );
    // Reaching the boundary through 2^31 publications is impractical; the
    // seeded head keeps every other stored value.
    await pool.query(
      'UPDATE pricing_rule_versions SET version_number = 2147483647 WHERE id = $1',
      [created.version.id],
    );
    const atMaximum = {
      ...content,
      expectedActiveVersionNumber: 2_147_483_647,
    };
    const unchanged = publication(
      await command(VERSIONS, atMaximum, 'maximum-unchanged', company.id),
    );
    expect(unchanged).toEqual({
      outcome: 'UNCHANGED',
      version: { ...created.version, versionNumber: 2_147_483_647 },
    });
    expect(
      publication(
        await command(VERSIONS, atMaximum, 'maximum-unchanged', company.id),
      ),
    ).toEqual(unchanged);
    const before = await contentOf(created.version.id);
    const overflow = await post(
      VERSIONS,
      company.id,
      {
        label: 'Overflowing rule',
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
      (
        await pool.query(
          'SELECT superseded_by_version_id FROM pricing_rule_versions WHERE id = $1',
          [created.version.id],
        )
      ).rows,
    ).toEqual([{ superseded_by_version_id: null }]);
    expect(
      publication(
        await command(VERSIONS, content, 'maximum-source', company.id),
      ),
    ).toEqual({
      outcome: 'PUBLISHED',
      version: { ...created.version, versionNumber: 2_147_483_647 },
    });
    await expectCounts({ versions: 1, receipts: 2, events: 1 });
  }, 30_000);

  it('rejects malformed payloads and server-owned fields without persistence', async () => {
    const { company } = await prepared();
    const valid = {
      label: 'Illustrative rule A',
      effectiveFrom: '2026-05-01T00:00:00Z',
      expectedActiveVersionNumber: null,
    };
    const cases: Array<[unknown, string]> = [
      [{ ...valid, label: '   ' }, 'label'],
      [{ ...valid, label: 'x'.repeat(121) }, 'label'],
      [{ ...valid, label: '😀'.repeat(121) }, 'label'],
      [{ ...valid, effectiveFrom: '2026-05-01T00:00:00' }, 'effectiveFrom'],
      [{ ...valid, effectiveFrom: '2026-02-30T00:00:00Z' }, 'effectiveFrom'],
      [{ ...valid, effectiveTo: 'soon' }, 'effectiveTo'],
      [{ ...valid, provenance: 'REAL' }, 'ruleVersion'],
      [{ ...valid, versionNumber: 7 }, 'ruleVersion'],
      [{ ...valid, ruleShape: 'FLAT_FEE' }, 'ruleVersion'],
      [{ ...valid, roundingScale: 4 }, 'ruleVersion'],
      [{ ...valid, supersededFrom: '2026-06-01T00:00:00Z' }, 'ruleVersion'],
      [[], 'ruleVersion'],
    ];
    for (const [body, field] of cases) {
      const response = await post(
        VERSIONS,
        company.id,
        body,
        crypto.randomUUID(),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'VALIDATION_ERROR',
        field,
      });
    }
    const missingKey = await request(VERSIONS, company.id, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(valid),
    });
    expect(missingKey.status).toBe(400);
    const emoji = publication(
      await command(
        VERSIONS,
        { ...valid, label: '😀'.repeat(120) },
        'emoji',
        company.id,
      ),
    );
    expect(emoji.version.label).toBe('😀'.repeat(120));
    await expectCounts({ versions: 1, receipts: 1, events: 1 });
  }, 30_000);

  it('separates identity, bundle and Company failures and discloses nothing across Companies or Workspaces', async () => {
    const { company } = await prepared();
    const secret = 'Only PRISMA-PRIM sees this rule';
    const owned = publication(
      await command(
        VERSIONS,
        {
          label: secret,
          effectiveFrom: '2026-05-01T00:00:00Z',
          expectedActiveVersionNumber: null,
        },
        'secret',
        company.id,
      ),
    );
    const paths = [SCOPE, VERSIONS, `${VERSIONS}/${owned.version.id}`];
    for (const path of paths) {
      const anonymous = await fetch(`${origin}/api${path}`, {
        headers: { 'x-company-context-id': company.id },
      });
      expect(anonymous.status).toBe(401);
    }

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
    expect(
      await (await request(SCOPE, other.id, { headers: OTHER_MEMBER })).json(),
    ).toEqual({ current: null, headVersionNumber: null, provisional: true });
    const otherList = await request(VERSIONS, other.id, {
      headers: OTHER_MEMBER,
    });
    expect(await otherList.json()).toEqual({ items: [], provisional: true });

    const foreignVersionId = await seedForeignWorkspaceVersion();
    const hidden = await request(`${VERSIONS}/${owned.version.id}`, other.id, {
      headers: OTHER_MEMBER,
    });
    expect(hidden.status).toBe(404);
    const hiddenBody = await hidden.text();
    expect(hiddenBody).not.toContain(secret);
    for (const id of [UNKNOWN_ID, foreignVersionId, 'not-a-version']) {
      const response = await request(`${VERSIONS}/${id}`, other.id, {
        headers: OTHER_MEMBER,
      });
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(hiddenBody);
    }
    const foreignWorkspace = await request(SCOPE, company.id, {
      headers: { 'x-workspace-context-id': FOREIGN_WORKSPACE_ID },
    });
    expect(foreignWorkspace.status).toBe(403);
    const otherPublication = publication(
      await command(
        VERSIONS,
        {
          label: 'BIC rule',
          effectiveFrom: '2026-05-01T00:00:00Z',
          expectedActiveVersionNumber: null,
        },
        'bic-rule',
        other.id,
        OTHER_MEMBER,
      ),
    );
    expect(otherPublication.version.versionNumber).toBe(1);
    expect(await (await request(VERSIONS, company.id)).json()).toEqual({
      items: [owned.version],
      provisional: true,
    });
    for (const query of ['limit=51', 'cursor=invalid']) {
      const denied = await request(`${VERSIONS}?${query}`, company.id, {
        headers: CATALOGUE_MEMBER,
      });
      expect(denied.status).toBe(403);
      expect(await denied.text()).not.toContain('INVALID_PAGE');
    }
    const everyHead = await heads();
    expect(everyHead).toHaveLength(2);
    expect(everyHead).toEqual(
      expect.arrayContaining([
        { company_id: company.id, version_number: 1 },
        { company_id: other.id, version_number: 1 },
      ]),
    );
  }, 60_000);

  it('authorizes offering reads by either captured bundle independently in both directions', async () => {
    const { company, owner } = await prepared();
    await grant(CATALOGUE_ASSIGNMENTS, {
      workspaceMembershipId: owner.membershipId,
      companyId: company.id,
    });
    const definition = record(
      record(
        await command(
          DEFINITIONS,
          { code: 'ISO-9001_GAP', name: 'ISO 9001 gap analysis' },
          'definition',
          company.id,
        ),
      ).definition,
    );
    const offering = record(
      record(
        await command(
          OFFERINGS,
          {
            serviceDefinitionId: stringField(definition, 'id'),
            commercialLabel: 'Illustrative offering',
          },
          'offering',
          company.id,
        ),
      ).offering,
    );
    const offeringPath = `${OFFERINGS}/${stringField(offering, 'id')}`;
    const ownerList = await (await request(OFFERINGS, company.id)).json();

    const configurationMember = await member(CONFIGURATION_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      CONFIGURATION_ASSIGNMENTS,
    ]);
    const configurationActor = record(
      record(
        await (
          await request('/access/current-actor', company.id, {
            headers: CONFIGURATION_MEMBER,
          })
        ).json(),
      ).activeCompany,
    );
    expect(configurationActor.pricingConfigurationPermissions).toEqual(
      CONFIGURATION_PERMISSIONS,
    );
    expect(configurationActor.serviceCataloguePermissions).toBeUndefined();
    // Configuration v1 reads offerings with the unchanged response shape.
    expect(
      await (
        await request(OFFERINGS, company.id, { headers: CONFIGURATION_MEMBER })
      ).json(),
    ).toEqual(ownerList);
    expect(
      await (
        await request(offeringPath, company.id, {
          headers: CONFIGURATION_MEMBER,
        })
      ).json(),
    ).toEqual(offering);
    // It grants no Service Definition permission and no offering management.
    expect(
      (
        await request(DEFINITIONS, company.id, {
          headers: CONFIGURATION_MEMBER,
        })
      ).status,
    ).toBe(403);
    for (const [path, body] of [
      [DEFINITIONS, { code: 'CONFIGURATION', name: 'Configuration service' }],
      [OFFERINGS, { serviceDefinitionId: stringField(definition, 'id') }],
    ] as const)
      expect(
        (
          await post(
            path,
            company.id,
            body,
            crypto.randomUUID(),
            CONFIGURATION_MEMBER,
          )
        ).status,
      ).toBe(403);

    // The Catalogue bundle grants no configuration read or publication.
    await member(CATALOGUE_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      CATALOGUE_ASSIGNMENTS,
    ]);
    expect(
      (await request(OFFERINGS, company.id, { headers: CATALOGUE_MEMBER }))
        .status,
    ).toBe(200);
    for (const path of [SCOPE, VERSIONS])
      expect(
        (await request(path, company.id, { headers: CATALOGUE_MEMBER })).status,
      ).toBe(403);

    // No other bundle, assignment or Workspace ownership confers it.
    const otherMember = await member(OTHER_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      '/company-director-client-assignments',
      '/company-project-assignments',
      '/company-task-manager-assignments',
      '/company-document-registrar-assignments',
      '/company-document-project-organizer-assignments',
      '/company-commercial-intake-assignments',
      '/company-commercial-activity-reader-assignments',
    ]);
    expect(
      record(
        record(
          await (
            await request('/access/current-actor', company.id, {
              headers: OTHER_MEMBER,
            })
          ).json(),
        ).activeCompany,
      ).pricingConfigurationPermissions,
    ).toBeUndefined();
    for (const path of [SCOPE, OFFERINGS])
      expect(
        (await request(path, company.id, { headers: OTHER_MEMBER })).status,
      ).toBe(403);
    expect(otherMember.membershipId).not.toBe(owner.membershipId);
    const unassigned = entity(
      await command('/companies', { displayName: 'Unassigned' }, 'unassigned'),
    );
    expect((await request(SCOPE, unassigned.id)).status).toBe(403);

    // Null and unknown captured versions fail closed at runtime.
    const [assignment] = (
      await pool.query<{ id: string }>(
        `SELECT id FROM company_role_assignments
          WHERE workspace_membership_id = $1 AND company_id = $2
            AND bundle = 'company_pricing_configuration' AND revoked_at IS NULL`,
        [configurationMember.membershipId, company.id],
      )
    ).rows;
    if (!assignment) throw new Error('Expected the configuration assignment.');
    const [constraint] = (
      await pool.query<{ definition: string }>(
        `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
          WHERE conname = 'company_role_assignments_permission_set_version_check'`,
      )
    ).rows;
    if (!constraint) throw new Error('Expected the captured-version check.');
    await pool.query(
      'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
    );
    try {
      for (const version of [null, 'v2', 'V1']) {
        await pool.query(
          'UPDATE company_role_assignments SET permission_set_version = $1 WHERE id = $2',
          [version, assignment.id],
        );
        for (const path of [OFFERINGS, offeringPath, SCOPE, VERSIONS])
          expect(
            (await request(path, company.id, { headers: CONFIGURATION_MEMBER }))
              .status,
          ).toBe(403);
      }
    } finally {
      await pool.query(
        "UPDATE company_role_assignments SET permission_set_version = 'v1' WHERE id = $1",
        [assignment.id],
      );
      await pool.query(
        `ALTER TABLE company_role_assignments
           ADD CONSTRAINT company_role_assignments_permission_set_version_check ${constraint.definition}`,
      );
    }
    expect(
      (await request(OFFERINGS, company.id, { headers: CONFIGURATION_MEMBER }))
        .status,
    ).toBe(200);

    // Revoking Configuration removes its offering read; Catalogue is untouched.
    expect(
      (
        await request(
          `${CONFIGURATION_ASSIGNMENTS}/${configurationMember.membershipId}/${company.id}`,
          undefined,
          { method: 'DELETE', headers: { 'idempotency-key': 'revoke-read' } },
        )
      ).status,
    ).toBe(200);
    for (const path of [OFFERINGS, offeringPath])
      expect(
        (await request(path, company.id, { headers: CONFIGURATION_MEMBER }))
          .status,
      ).toBe(403);
    expect(
      (await request(offeringPath, company.id, { headers: CATALOGUE_MEMBER }))
        .status,
    ).toBe(200);
    expect(
      (
        await request(
          `${CATALOGUE_ASSIGNMENTS}/${owner.membershipId}/${company.id}`,
          undefined,
          { method: 'DELETE', headers: { 'idempotency-key': 'revoke-owner' } },
        )
      ).status,
    ).toBe(200);
    // The owner keeps offering read through Configuration alone.
    expect((await request(offeringPath, company.id)).status).toBe(200);
    expect((await request(DEFINITIONS, company.id)).status).toBe(403);
  }, 60_000);

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

  async function prepared() {
    const company = entity(
      await command(
        '/companies',
        { displayName: 'PRISMA-PRIM' },
        `company-${crypto.randomUUID()}`,
      ),
    );
    const owner = await actorOf(company.id);
    await grant(CONFIGURATION_ASSIGNMENTS, {
      workspaceMembershipId: owner.membershipId,
      companyId: company.id,
    });
    return { company, owner };
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
         FROM pricing_rule_versions AS version WHERE id = $1`,
      [versionId],
    );
    return result.rows;
  }

  async function heads(): Promise<unknown[]> {
    return (
      await pool.query(
        `SELECT company_id, version_number FROM pricing_rule_versions
          WHERE superseded_by_version_id IS NULL ORDER BY company_id`,
      )
    ).rows;
  }

  async function seedForeignWorkspaceVersion(): Promise<string> {
    const versionId = '00000000-0000-4000-8000-000000000362';
    await pool.query(
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
       )
       INSERT INTO pricing_rule_versions (
         id, workspace_id, company_id, version_number, label, effective_from,
         created_by_internal_user_id, created_by_workspace_membership_id, created_at
       )
       SELECT $2, foreign_membership.workspace_id, foreign_company.id, 1, 'Foreign rule',
              TIMESTAMPTZ '2026-05-01 00:00:00+00', foreign_membership.internal_user_id,
              foreign_membership.id, TIMESTAMPTZ '2026-04-01 00:00:00+00'
       FROM foreign_membership
       INNER JOIN foreign_company ON foreign_company.workspace_id = foreign_membership.workspace_id`,
      [FOREIGN_WORKSPACE_ID, versionId],
    );
    return versionId;
  }

  async function lockRows(
    query: string,
    values: readonly string[],
  ): Promise<{ connection: PoolClient; backendPid: number }> {
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      const backend = await connection.query<{ backendPid: number }>(
        'SELECT pg_backend_pid() AS "backendPid"',
      );
      const backendPid = backend.rows[0]?.backendPid;
      if (backendPid === undefined) throw new Error('Missing blocker backend.');
      const locked = await connection.query(query, [...values]);
      if (locked.rowCount !== 1) throw new Error('Expected one row to lock.');
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
        (SELECT count(*) FROM pricing_rule_versions WHERE workspace_id = $1) AS versions,
        (SELECT count(*) FROM pricing_configuration_commands) AS receipts,
        (SELECT count(*) FROM pricing_configuration_events) AS events`,
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
  label: string;
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
    label: stringField(version, 'label'),
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

function scopeRecord(value: unknown): {
  current: VersionView | null;
  headVersionNumber: number | null;
  provisional: unknown;
} {
  const scope = record(value);
  const head = scope.headVersionNumber;
  if (head !== null && typeof head !== 'number')
    throw new Error('Expected a head version number.');
  return {
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
