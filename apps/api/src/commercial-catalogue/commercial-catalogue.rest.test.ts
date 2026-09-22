import type { Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000317';
const FOREIGN_WORKSPACE_ID = '00000000-0000-4000-8000-000000000318';
const withPostgres = databaseUrl ? describe : describe.skip;
const DEFINITIONS = '/commercial-catalogue/service-definitions';
const OFFERINGS = '/commercial-catalogue/offerings';
const CATALOGUE_ASSIGNMENTS = '/company-service-catalogue-assignments';
const MEMBER_HEADERS = {
  'x-test-external-subject': 'catalogue-member',
  'x-test-display-name': 'Catalogue Member',
  'x-test-email': 'catalogue-member@example.test',
};

withPostgres('Company Service Catalogue REST', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let origin: string;
  let pool: Pool;

  async function openHarness(): Promise<void> {
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Service Catalogue Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'catalogue-member',
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
      namePrefix: 'commercial_catalogue',
    });
    await openHarness();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });

  it('defines a shared Service, offers it in the active Company, records one event each and reloads identically after a restart', async () => {
    const company = entity(
      await command('/companies', { displayName: 'PRISMA-PRIM' }, 'company'),
    );
    expect((await request(DEFINITIONS, company.id)).status).toBe(403);
    expect(
      (await post(DEFINITIONS, company.id, {}, 'unauthorized-invalid')).status,
    ).toBe(403);
    const actor = actorRecord(
      await (await request('/access/current-actor', company.id)).json(),
    );
    expect(
      await command(
        CATALOGUE_ASSIGNMENTS,
        { companyId: company.id, workspaceMembershipId: actor.membershipId },
        'grant-catalogue',
      ),
    ).toMatchObject({
      bundle: 'Company Service Catalogue',
      permissionSetVersion: 'v1',
      active: true,
    });
    const selected = record(
      await (await request('/access/current-actor', company.id)).json(),
    );
    expect(record(selected.activeCompany).serviceCataloguePermissions).toEqual([
      'service.definition.read',
      'service.definition.create',
      'commercial.offering.read',
      'commercial.offering.manage',
    ]);

    const created = definitionResult(
      await command(
        DEFINITIONS,
        representativeDefinition(),
        'iso-9001',
        company.id,
      ),
    );
    expect(created.outcome).toBe('CREATED');
    expect(created.definition).toEqual({
      id: created.definition.id,
      code: 'ISO-9001_GAP',
      name: 'ISO 9001 gap analysis',
      description: 'Illustrative shared definition for the demonstration.',
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      createdByWorkspaceMembershipId: actor.membershipId,
      createdAt: created.definition.createdAt,
    });
    expect(Object.keys(created.definition)).not.toContain('companyId');
    expect(Object.keys(created.definition)).not.toContain('workspaceId');

    const offered = offeringResult(
      await command(
        OFFERINGS,
        {
          serviceDefinitionId: created.definition.id,
          commercialLabel: 'Gap analysis for PRISMA-PRIM Clients',
        },
        'offer-iso-9001',
        company.id,
      ),
    );
    expect(offered.outcome).toBe('CREATED');
    expect(offered.offering).toEqual({
      id: offered.offering.id,
      companyId: company.id,
      serviceDefinitionId: created.definition.id,
      serviceDefinition: {
        code: 'ISO-9001_GAP',
        name: 'ISO 9001 gap analysis',
      },
      commercialLabel: 'Gap analysis for PRISMA-PRIM Clients',
      availability: 'AVAILABLE',
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      createdByWorkspaceMembershipId: actor.membershipId,
      createdAt: offered.offering.createdAt,
    });

    const definitionPage = await (
      await request(DEFINITIONS, company.id)
    ).json();
    expect(definitionPage).toEqual({ items: [created.definition] });
    const offeringPage = await (await request(OFFERINGS, company.id)).json();
    expect(offeringPage).toEqual({ items: [offered.offering] });
    expect(
      await (
        await request(`${OFFERINGS}/${offered.offering.id}`, company.id)
      ).json(),
    ).toEqual(offered.offering);

    const events = await pool.query<{
      action: string;
      company_id: string;
      service_definition_id: string;
      offering_id: string | null;
      actor_workspace_membership_id: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT action, company_id, service_definition_id, offering_id,
              actor_workspace_membership_id, metadata
         FROM commercial_catalogue_events
        ORDER BY action DESC`,
    );
    expect(events.rows).toEqual([
      {
        action: 'service_definition.created',
        company_id: company.id,
        service_definition_id: created.definition.id,
        offering_id: null,
        actor_workspace_membership_id: actor.membershipId,
        metadata: {
          serviceDefinitionId: created.definition.id,
          code: 'ISO-9001_GAP',
          provenance: 'ILLUSTRATIVE',
        },
      },
      {
        action: 'company_service_offering.created',
        company_id: company.id,
        service_definition_id: created.definition.id,
        offering_id: offered.offering.id,
        actor_workspace_membership_id: actor.membershipId,
        metadata: {
          serviceDefinitionId: created.definition.id,
          offeringId: offered.offering.id,
          code: 'ISO-9001_GAP',
          provenance: 'ILLUSTRATIVE',
        },
      },
    ]);
    const receipts = await pool.query<{
      command: string;
      outcome: string;
      company_id: string;
      actor_workspace_membership_id: string;
      idempotency_key: string;
    }>(
      `SELECT command, outcome, company_id, actor_workspace_membership_id,
              idempotency_key
         FROM commercial_catalogue_commands
        ORDER BY idempotency_key`,
    );
    expect(receipts.rows).toEqual([
      {
        command: 'service_definition.create',
        outcome: 'CREATED',
        company_id: company.id,
        actor_workspace_membership_id: actor.membershipId,
        idempotency_key: 'iso-9001',
      },
      {
        command: 'company_service_offering.create',
        outcome: 'CREATED',
        company_id: company.id,
        actor_workspace_membership_id: actor.membershipId,
        idempotency_key: 'offer-iso-9001',
      },
    ]);
    const activity = JSON.stringify(
      await (await request('/activity-log', company.id)).json(),
    );
    expect(activity).not.toContain('service_definition.created');
    expect(activity).not.toContain('company_service_offering.created');
    expect(activity).not.toContain(created.definition.id);
    expect(activity).not.toContain(offered.offering.id);
    expect(activity).not.toContain('Gap analysis for PRISMA-PRIM Clients');

    await harness.close();
    await openHarness();
    expect(await (await request(DEFINITIONS, company.id)).json()).toEqual(
      definitionPage,
    );
    expect(await (await request(OFFERINGS, company.id)).json()).toEqual(
      offeringPage,
    );
  });

  it('shares the definition with a second Company of the Workspace and hides every Company offering and foreign Workspace record', async () => {
    const setup = await prepared();
    const created = definitionResult(
      await command(
        DEFINITIONS,
        representativeDefinition(),
        'shared',
        setup.company.id,
      ),
    );
    const secretLabel = 'Only PRISMA-PRIM sees this label';
    await command(
      OFFERINGS,
      {
        serviceDefinitionId: created.definition.id,
        commercialLabel: secretLabel,
      },
      'company-a-offering',
      setup.company.id,
    );
    const other = entity(
      await command('/companies', { displayName: 'BIC' }, 'other-company'),
    );
    await command(
      CATALOGUE_ASSIGNMENTS,
      { companyId: other.id, workspaceMembershipId: setup.actor.membershipId },
      'grant-other-catalogue',
    );
    const foreignDefinitionId = await seedForeignWorkspaceDefinition();

    const sharedDefinitions = await (
      await request(DEFINITIONS, other.id)
    ).json();
    expect(sharedDefinitions).toEqual({ items: [created.definition] });
    expect(JSON.stringify(sharedDefinitions)).not.toContain(
      foreignDefinitionId,
    );
    const otherOfferings = await request(OFFERINGS, other.id);
    expect(otherOfferings.status).toBe(200);
    const otherOfferingText = await otherOfferings.text();
    expect(JSON.parse(otherOfferingText)).toEqual({ items: [] });
    expect(otherOfferingText).not.toContain('total');
    expect(otherOfferingText).not.toContain(secretLabel);

    const [hidden] = await pool
      .query<{ id: string }>(
        'SELECT id FROM company_service_offerings WHERE company_id = $1',
        [setup.company.id],
      )
      .then((result) => result.rows);
    if (!hidden) throw new Error('Expected the first Company offering.');
    const hiddenResponse = await request(`${OFFERINGS}/${hidden.id}`, other.id);
    const unknownResponse = await request(
      `${OFFERINGS}/00000000-0000-4000-8000-000000000997`,
      other.id,
    );
    expect(hiddenResponse.status).toBe(404);
    expect(unknownResponse.status).toBe(404);
    const hiddenText = await hiddenResponse.text();
    expect(hiddenText).toEqual(await unknownResponse.text());
    expect(hiddenText).not.toContain(secretLabel);

    const second = offeringResult(
      await command(
        OFFERINGS,
        { serviceDefinitionId: created.definition.id },
        'company-b-offering',
        other.id,
      ),
    );
    expect(second.outcome).toBe('CREATED');
    expect(second.offering).toMatchObject({
      companyId: other.id,
      serviceDefinitionId: created.definition.id,
      commercialLabel: null,
    });
    expect(await (await request(OFFERINGS, setup.company.id)).json()).toEqual({
      items: [expect.objectContaining({ commercialLabel: secretLabel })],
    });

    const foreignOffering = await post(
      OFFERINGS,
      other.id,
      { serviceDefinitionId: foreignDefinitionId },
      'foreign-definition-offering',
    );
    expect(foreignOffering.status).toBe(404);
    expect(await foreignOffering.text()).toEqual(hiddenText);
    const foreignWorkspace = await request(DEFINITIONS, setup.company.id, {
      headers: { 'x-workspace-context-id': FOREIGN_WORKSPACE_ID },
    });
    expect(foreignWorkspace.status).toBe(403);
    expect(await foreignWorkspace.text()).not.toContain(created.definition.id);
    await expectCounts({
      definitions: 1,
      offerings: 2,
      receipts: 3,
      events: 3,
    });
  });

  it('returns UNCHANGED with a durable receipt for identical content and a named conflict for different content', async () => {
    const setup = await prepared();
    const created = definitionResult(
      await command(
        DEFINITIONS,
        representativeDefinition(),
        'first',
        setup.company.id,
      ),
    );
    const repeated = definitionResult(
      await command(
        DEFINITIONS,
        representativeDefinition(),
        'second',
        setup.company.id,
      ),
    );
    expect(repeated).toEqual({
      outcome: 'UNCHANGED',
      definition: created.definition,
    });
    const conflict = await post(
      DEFINITIONS,
      setup.company.id,
      { ...representativeDefinition(), name: 'A different name' },
      'third',
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      code: 'SERVICE_CODE_CONFLICT',
    });
    const descriptionConflict = await post(
      DEFINITIONS,
      setup.company.id,
      { code: 'ISO-9001_GAP', name: 'ISO 9001 gap analysis' },
      'fourth',
    );
    expect(descriptionConflict.status).toBe(409);

    const offered = offeringResult(
      await command(
        OFFERINGS,
        {
          serviceDefinitionId: created.definition.id,
          commercialLabel: 'Label',
        },
        'offer-first',
        setup.company.id,
      ),
    );
    const repeatedOffer = offeringResult(
      await command(
        OFFERINGS,
        {
          serviceDefinitionId: created.definition.id,
          commercialLabel: 'Label',
        },
        'offer-second',
        setup.company.id,
      ),
    );
    expect(repeatedOffer).toEqual({
      outcome: 'UNCHANGED',
      offering: offered.offering,
    });
    const duplicate = await post(
      OFFERINGS,
      setup.company.id,
      { serviceDefinitionId: created.definition.id, commercialLabel: 'Other' },
      'offer-third',
    );
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      code: 'OFFERING_CONFLICT',
    });

    const receipts = await pool.query<{
      idempotency_key: string;
      outcome: string;
    }>(
      'SELECT idempotency_key, outcome FROM commercial_catalogue_commands ORDER BY idempotency_key',
    );
    expect(receipts.rows).toEqual([
      { idempotency_key: 'first', outcome: 'CREATED' },
      { idempotency_key: 'offer-first', outcome: 'CREATED' },
      { idempotency_key: 'offer-second', outcome: 'UNCHANGED' },
      { idempotency_key: 'second', outcome: 'UNCHANGED' },
    ]);
    await expectCounts({
      definitions: 1,
      offerings: 1,
      receipts: 4,
      events: 2,
    });
    expect(
      definitionResult(
        await command(
          DEFINITIONS,
          representativeDefinition(),
          'second',
          setup.company.id,
        ),
      ),
    ).toEqual(repeated);
  });

  it('replays a key, conflicts on any changed payload and converges concurrent exact retries', async () => {
    const setup = await prepared();
    const body = representativeDefinition();
    const created = definitionResult(
      await command(DEFINITIONS, body, 'replay', setup.company.id),
    );
    expect(
      definitionResult(
        await command(DEFINITIONS, body, 'replay', setup.company.id),
      ),
    ).toEqual(created);
    const changed = await post(
      DEFINITIONS,
      setup.company.id,
      { ...body, description: `${body.description} ` },
      'replay',
    );
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    const malformedReplay = await post(
      DEFINITIONS,
      setup.company.id,
      {},
      'replay',
    );
    expect(malformedReplay.status).toBe(409);
    const crossCommand = await post(
      OFFERINGS,
      setup.company.id,
      { serviceDefinitionId: created.definition.id },
      'replay',
    );
    expect(crossCommand.status).toBe(409);
    expect(await crossCommand.json()).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });

    // Target readability is revalidated before the receipt is honored: a reused
    // key naming a target the actor cannot read gets the safe not-found, never
    // the recorded result and never the idempotency conflict.
    const offered = offeringResult(
      await command(
        OFFERINGS,
        { serviceDefinitionId: created.definition.id },
        'target-replay',
        setup.company.id,
      ),
    );
    expect(
      offeringResult(
        await command(
          OFFERINGS,
          { serviceDefinitionId: created.definition.id },
          'target-replay',
          setup.company.id,
        ),
      ),
    ).toEqual(offered);
    const unreadableTarget = await post(
      OFFERINGS,
      setup.company.id,
      { serviceDefinitionId: '00000000-0000-4000-8000-000000000998' },
      'target-replay',
    );
    expect(unreadableTarget.status).toBe(404);
    expect(await unreadableTarget.text()).not.toContain(offered.offering.id);
    expect(await unreadableTarget.text()).not.toContain('IDEMPOTENCY_CONFLICT');

    const concurrent = await Promise.all(
      Array.from({ length: 6 }, () =>
        post(
          DEFINITIONS,
          setup.company.id,
          { ...body, code: 'CONCURRENT' },
          'concurrent',
        ),
      ),
    );
    expect(concurrent.map((response) => response.status)).toEqual(
      concurrent.map(() => 201),
    );
    const results = await Promise.all(
      concurrent.map(async (response) =>
        definitionResult(await response.json()),
      ),
    );
    expect(new Set(results.map((result) => result.definition.id)).size).toBe(1);
    expect(results.every((result) => result.outcome === 'CREATED')).toBe(true);
    const concurrentOffers = await Promise.all(
      Array.from({ length: 6 }, () =>
        post(
          OFFERINGS,
          setup.company.id,
          { serviceDefinitionId: created.definition.id },
          'concurrent-offer',
        ),
      ),
    );
    expect(concurrentOffers.map((response) => response.status)).toEqual(
      concurrentOffers.map(() => 201),
    );
    await expectCounts({
      definitions: 2,
      offerings: 1,
      receipts: 3,
      events: 3,
    });
  });

  it('revalidates live authority under a row lock before replaying or committing', async () => {
    const setup = await preparedRestrictedMember();
    const body = representativeDefinition();
    const created = await postAs(
      DEFINITIONS,
      setup.company.id,
      body,
      'member-definition',
      MEMBER_HEADERS,
    );
    expect(created.status).toBe(201);
    const revoke = await request(
      `${CATALOGUE_ASSIGNMENTS}/${setup.member.membershipId}/${setup.company.id}`,
      undefined,
      { method: 'DELETE', headers: { 'idempotency-key': 'revoke-catalogue' } },
    );
    expect(revoke.status).toBe(200);
    const deniedReplay = await postAs(
      DEFINITIONS,
      setup.company.id,
      body,
      'member-definition',
      MEMBER_HEADERS,
    );
    expect(deniedReplay.status).toBe(403);
    expect(await deniedReplay.text()).not.toContain('ISO-9001_GAP');
    expect(
      (
        await request(DEFINITIONS, setup.company.id, {
          headers: MEMBER_HEADERS,
        })
      ).status,
    ).toBe(403);
    const receipt = await pool.query(
      "SELECT outcome FROM commercial_catalogue_commands WHERE idempotency_key = 'member-definition'",
    );
    expect(receipt.rowCount).toBe(1);
    await command(
      CATALOGUE_ASSIGNMENTS,
      {
        companyId: setup.company.id,
        workspaceMembershipId: setup.member.membershipId,
      },
      'regrant-catalogue',
    );
    const replay = await postAs(
      DEFINITIONS,
      setup.company.id,
      body,
      'member-definition',
      MEMBER_HEADERS,
    );
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(await created.json());

    for (const [key, target] of [
      ['member-definition', 'replay'],
      ['member-fresh', 'fresh'],
    ] as const) {
      const lock = await lockAssignment(
        setup.member.membershipId,
        setup.company.id,
        'company_service_catalogue',
      );
      let lockReleased = false;
      try {
        const pending = postAs(
          DEFINITIONS,
          setup.company.id,
          target === 'replay' ? body : { ...body, code: 'FRESH' },
          key,
          MEMBER_HEADERS,
        );
        await waitForBlockedBy(lock.backendPid);
        await pool.query(
          `UPDATE company_role_assignments
              SET revoked_at = clock_timestamp()
            WHERE workspace_id = $1
              AND workspace_membership_id = $2
              AND company_id = $3
              AND bundle = 'company_service_catalogue'
              AND revoked_at IS NULL`,
          [WORKSPACE_ID, setup.member.membershipId, setup.company.id],
        );
        await lock.connection.query('COMMIT');
        lockReleased = true;
        expect((await pending).status).toBe(403);
      } finally {
        if (!lockReleased) await lock.connection.query('ROLLBACK');
        lock.connection.release();
      }
      await command(
        CATALOGUE_ASSIGNMENTS,
        {
          companyId: setup.company.id,
          workspaceMembershipId: setup.member.membershipId,
        },
        `regrant-${key}`,
      );
    }
    await expectCounts({
      definitions: 1,
      offerings: 0,
      receipts: 1,
      events: 1,
    });
  });

  it('rejects malformed payloads and unknown definitions without persistence', async () => {
    const setup = await prepared();
    const definitionCases: Array<[unknown, string]> = [
      [{}, 'code'],
      [{ code: 'iso-9001', name: 'Lowercase code' }, 'code'],
      [{ code: 'ISO 9001', name: 'Spaced code' }, 'code'],
      [{ code: 'A'.repeat(41), name: 'Too long' }, 'code'],
      [{ code: '', name: 'Empty code' }, 'code'],
      [{ code: 7, name: 'Numeric code' }, 'code'],
      [{ code: 'OK', name: '   ' }, 'name'],
      [{ code: 'OK', name: 'x'.repeat(161) }, 'name'],
      [
        { code: 'OK', name: 'Fine', description: 'x'.repeat(2001) },
        'description',
      ],
      [{ code: 'OK', name: 'Fine', extra: true }, 'definition'],
      [[], 'definition'],
    ];
    for (const [body, field] of definitionCases) {
      const response = await post(
        DEFINITIONS,
        setup.company.id,
        body,
        crypto.randomUUID(),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'VALIDATION_ERROR',
        field,
      });
    }
    const missingKey = await request(DEFINITIONS, setup.company.id, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(representativeDefinition()),
    });
    expect(missingKey.status).toBe(400);
    const created = definitionResult(
      await command(
        DEFINITIONS,
        representativeDefinition(),
        'valid',
        setup.company.id,
      ),
    );
    const offeringCases: Array<[unknown, string]> = [
      [{}, 'serviceDefinitionId'],
      [{ serviceDefinitionId: 'not-a-uuid' }, 'serviceDefinitionId'],
      [
        {
          serviceDefinitionId: created.definition.id,
          commercialLabel: 'x'.repeat(161),
        },
        'commercialLabel',
      ],
      [
        { serviceDefinitionId: created.definition.id, tariff: '100' },
        'offering',
      ],
    ];
    for (const [body, field] of offeringCases) {
      const response = await post(
        OFFERINGS,
        setup.company.id,
        body,
        crypto.randomUUID(),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'VALIDATION_ERROR',
        field,
      });
    }
    const unknownDefinition = await post(
      OFFERINGS,
      setup.company.id,
      { serviceDefinitionId: '00000000-0000-4000-8000-000000000999' },
      'unknown-definition',
    );
    expect(unknownDefinition.status).toBe(404);
    await expectCounts({
      definitions: 1,
      offerings: 0,
      receipts: 1,
      events: 1,
    });
  });

  it('pages newest first with a stable bounded cursor and no cross-Company metadata', async () => {
    const setup = await prepared();
    for (let index = 0; index < 27; index += 1) {
      const definition = definitionResult(
        await command(
          DEFINITIONS,
          {
            code: `SERVICE-${String(index).padStart(2, '0')}`,
            name: `Service ${index}`,
          },
          `definition-${index}`,
          setup.company.id,
        ),
      );
      await command(
        OFFERINGS,
        { serviceDefinitionId: definition.definition.id },
        `offering-${index}`,
        setup.company.id,
      );
    }
    for (const table of ['service_definitions', 'company_service_offerings']) {
      await pool.query(
        `UPDATE ${table} SET created_at = TIMESTAMPTZ '2026-09-20 10:00:01+00'`,
      );
    }
    await pool.query(
      `UPDATE service_definitions SET created_at = CASE code
         WHEN 'SERVICE-24' THEN TIMESTAMPTZ '2026-09-20 10:00:00.000900+00'
         WHEN 'SERVICE-25' THEN TIMESTAMPTZ '2026-09-20 10:00:00.000800+00'
         WHEN 'SERVICE-26' THEN TIMESTAMPTZ '2026-09-20 10:00:00.000700+00'
         ELSE created_at END`,
    );
    for (const [path, table] of [
      [DEFINITIONS, 'service_definitions'],
      [OFFERINGS, 'company_service_offerings'],
    ] as const) {
      const expected = await pool.query<{ id: string }>(
        `SELECT id FROM ${table} ORDER BY created_at DESC, id DESC`,
      );
      const first = page(await (await request(path, setup.company.id)).json());
      expect(first.items).toHaveLength(25);
      expect(first.items.map((item) => stringField(item, 'id'))).toEqual(
        expected.rows.slice(0, 25).map(({ id }) => id),
      );
      expect(first).not.toHaveProperty('total');
      const cursor = stringField(first, 'nextCursor');
      const second = page(
        await (
          await request(
            `${path}?limit=25&cursor=${encodeURIComponent(cursor)}`,
            setup.company.id,
          )
        ).json(),
      );
      expect(second.items.map((item) => stringField(item, 'id'))).toEqual(
        expected.rows.slice(25).map(({ id }) => id),
      );
      expect(second).not.toHaveProperty('nextCursor');
      const bounded = page(
        await (await request(`${path}?limit=50`, setup.company.id)).json(),
      );
      expect(bounded.items).toHaveLength(27);
      for (const query of ['limit=51', 'limit=0', 'cursor=invalid']) {
        const invalid = await request(`${path}?${query}`, setup.company.id);
        expect(invalid.status).toBe(400);
        expect(await invalid.json()).toMatchObject({ code: 'INVALID_PAGE' });
      }
    }
  });

  it('separates identity, membership, bundle and Company context failures without leaking', async () => {
    const setup = await prepared();
    const created = definitionResult(
      await command(
        DEFINITIONS,
        representativeDefinition(),
        'owner',
        setup.company.id,
      ),
    );
    const offered = offeringResult(
      await command(
        OFFERINGS,
        { serviceDefinitionId: created.definition.id },
        'owner-offer',
        setup.company.id,
      ),
    );
    const paths = [
      DEFINITIONS,
      OFFERINGS,
      `${OFFERINGS}/${offered.offering.id}`,
    ];
    for (const path of paths) {
      const anonymous = await fetch(`${origin}/api${path}`, {
        headers: { 'x-company-context-id': setup.company.id },
      });
      expect(anonymous.status).toBe(401);
    }

    const member = actorRecord(
      await (
        await request('/access/current-actor', undefined, {
          headers: MEMBER_HEADERS,
        })
      ).json(),
    );
    await command(
      CATALOGUE_ASSIGNMENTS,
      {
        companyId: setup.company.id,
        workspaceMembershipId: member.membershipId,
      },
      'member-catalogue-only',
    );
    expect(
      (
        await request('/access/current-actor', setup.company.id, {
          headers: MEMBER_HEADERS,
        })
      ).status,
    ).toBe(403);
    for (const path of paths) {
      const response = await request(path, setup.company.id, {
        headers: MEMBER_HEADERS,
      });
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain(created.definition.id);
    }
    for (const query of ['limit=51', 'cursor=invalid']) {
      const denied = await request(
        `${DEFINITIONS}?${query}`,
        setup.company.id,
        {
          headers: MEMBER_HEADERS,
        },
      );
      expect(denied.status).toBe(403);
      expect(await denied.text()).not.toContain('INVALID_PAGE');
    }

    await command(
      '/company-context-assignments',
      {
        companyId: setup.company.id,
        workspaceMembershipId: member.membershipId,
      },
      'member-context',
    );
    for (const path of paths)
      expect(
        (await request(path, setup.company.id, { headers: MEMBER_HEADERS }))
          .status,
      ).toBe(200);
    for (const path of ['/commercial-intake/requests', '/clients', '/projects'])
      expect(
        (await request(path, setup.company.id, { headers: MEMBER_HEADERS }))
          .status,
      ).toBe(403);
    const memberActor = record(
      await (
        await request('/access/current-actor', setup.company.id, {
          headers: MEMBER_HEADERS,
        })
      ).json(),
    );
    const activeCompany = record(memberActor.activeCompany);
    expect(activeCompany.commercialIntakePermissions).toBeUndefined();
    expect(activeCompany.clientPermissions).toEqual([]);

    const intakeOnly = entity(
      await command(
        '/companies',
        { displayName: 'Intake only' },
        'intake-only',
      ),
    );
    for (const path of [
      '/company-context-assignments',
      '/company-commercial-intake-assignments',
      '/company-director-client-assignments',
      '/company-project-assignments',
      '/company-task-manager-assignments',
      '/company-document-registrar-assignments',
      '/company-document-project-organizer-assignments',
    ])
      await command(
        path,
        {
          companyId: intakeOnly.id,
          workspaceMembershipId: member.membershipId,
        },
        `intake-only-${path}`,
      );
    const otherBundlesActor = record(
      await (
        await request('/access/current-actor', intakeOnly.id, {
          headers: MEMBER_HEADERS,
        })
      ).json(),
    );
    expect(
      record(otherBundlesActor.activeCompany).serviceCataloguePermissions,
    ).toBeUndefined();
    expect(
      (await request(DEFINITIONS, intakeOnly.id, { headers: MEMBER_HEADERS }))
        .status,
    ).toBe(403);

    await pool.query("UPDATE companies SET status = 'inactive' WHERE id = $1", [
      setup.company.id,
    ]);
    expect(
      (
        await request(DEFINITIONS, setup.company.id, {
          headers: MEMBER_HEADERS,
        })
      ).status,
    ).toBe(403);
    await pool.query("UPDATE companies SET status = 'active' WHERE id = $1", [
      setup.company.id,
    ]);
    await pool.query(
      "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
      [member.membershipId],
    );
    expect(
      (
        await request(DEFINITIONS, setup.company.id, {
          headers: MEMBER_HEADERS,
        })
      ).status,
    ).toBe(403);
  });

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

  async function command(
    path: string,
    body: unknown,
    key: string,
    companyId?: string,
  ): Promise<unknown> {
    const response = await post(path, companyId, body, key);
    expect(response.status).toBe(201);
    const value: unknown = await response.json();
    return value;
  }

  function post(
    path: string,
    companyId: string | undefined,
    body: unknown,
    key: string,
  ) {
    return request(path, companyId, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify(body),
    });
  }

  function postAs(
    path: string,
    companyId: string,
    body: unknown,
    key: string,
    headers: Record<string, string>,
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

  async function prepared() {
    const company = entity(
      await command(
        '/companies',
        { displayName: 'PRISMA-PRIM' },
        `company-${crypto.randomUUID()}`,
      ),
    );
    const actor = actorRecord(
      await (await request('/access/current-actor', company.id)).json(),
    );
    await command(
      CATALOGUE_ASSIGNMENTS,
      { companyId: company.id, workspaceMembershipId: actor.membershipId },
      `catalogue-${crypto.randomUUID()}`,
    );
    return { company, actor };
  }

  async function preparedRestrictedMember() {
    const setup = await prepared();
    const member = actorRecord(
      await (
        await request('/access/current-actor', undefined, {
          headers: MEMBER_HEADERS,
        })
      ).json(),
    );
    for (const path of ['/company-context-assignments', CATALOGUE_ASSIGNMENTS])
      await command(
        path,
        {
          companyId: setup.company.id,
          workspaceMembershipId: member.membershipId,
        },
        `${path}-${crypto.randomUUID()}`,
      );
    return { ...setup, member };
  }

  async function seedForeignWorkspaceDefinition(): Promise<string> {
    const definitionId = '00000000-0000-4000-8000-000000000319';
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
       INSERT INTO service_definitions (
         id, workspace_id, code, name, created_by_internal_user_id,
         created_by_workspace_membership_id, created_in_company_id
       )
       SELECT $2, foreign_membership.workspace_id, 'ISO-9001_GAP', 'Foreign definition',
              foreign_membership.internal_user_id, foreign_membership.id, foreign_company.id
       FROM foreign_membership
       INNER JOIN foreign_company ON foreign_company.workspace_id = foreign_membership.workspace_id`,
      [FOREIGN_WORKSPACE_ID, definitionId],
    );
    return definitionId;
  }

  async function lockAssignment(
    workspaceMembershipId: string,
    companyId: string,
    bundle: string,
  ): Promise<{ connection: PoolClient; backendPid: number }> {
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      const backend = await connection.query<{ backendPid: number }>(
        'SELECT pg_backend_pid() AS "backendPid"',
      );
      const backendPid = backend.rows[0]?.backendPid;
      if (backendPid === undefined) throw new Error('Missing blocker backend.');
      const assignment = await connection.query(
        `SELECT id
           FROM company_role_assignments
          WHERE workspace_id = $1
            AND workspace_membership_id = $2
            AND company_id = $3
            AND bundle = $4
            AND revoked_at IS NULL
          FOR UPDATE`,
        [WORKSPACE_ID, workspaceMembershipId, companyId, bundle],
      );
      if (assignment.rowCount !== 1)
        throw new Error('Expected one active assignment to lock.');
      return { connection, backendPid };
    } catch (error) {
      await connection.query('ROLLBACK');
      connection.release();
      throw error;
    }
  }

  async function waitForBlockedBy(backendPid: number): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
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
    throw new Error('The catalogue command did not reach the lock barrier.');
  }

  async function expectCounts(expected: {
    definitions: number;
    offerings: number;
    receipts: number;
    events: number;
  }): Promise<void> {
    const counts = await pool.query<{
      definitions: string;
      offerings: string;
      receipts: string;
      events: string;
    }>(
      `SELECT
        (SELECT count(*) FROM service_definitions WHERE workspace_id = $1) AS definitions,
        (SELECT count(*) FROM company_service_offerings) AS offerings,
        (SELECT count(*) FROM commercial_catalogue_commands) AS receipts,
        (SELECT count(*) FROM commercial_catalogue_events) AS events`,
      [WORKSPACE_ID],
    );
    expect(counts.rows).toEqual([
      {
        definitions: String(expected.definitions),
        offerings: String(expected.offerings),
        receipts: String(expected.receipts),
        events: String(expected.events),
      },
    ]);
  }
});

function representativeDefinition() {
  return {
    code: 'ISO-9001_GAP',
    name: 'ISO 9001 gap analysis',
    description: 'Illustrative shared definition for the demonstration.',
  };
}

function entity(value: unknown): { id: string } {
  return { id: stringField(record(value), 'id') };
}

function actorRecord(value: unknown): { membershipId: string } {
  return { membershipId: stringField(record(value), 'workspaceMembershipId') };
}

function definitionResult(value: unknown) {
  const result = record(value);
  const definition = record(result.definition);
  return {
    outcome: stringField(result, 'outcome'),
    definition: {
      ...definition,
      id: stringField(definition, 'id'),
      createdAt: stringField(definition, 'createdAt'),
    },
  };
}

function offeringResult(value: unknown) {
  const result = record(value);
  const offering = record(result.offering);
  return {
    outcome: stringField(result, 'outcome'),
    offering: {
      ...offering,
      id: stringField(offering, 'id'),
      createdAt: stringField(offering, 'createdAt'),
    },
  };
}

function page(value: unknown) {
  const result = record(value);
  if (!Array.isArray(result.items))
    throw new Error('Expected a catalogue page.');
  return { ...result, items: result.items.map(record) };
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
