import { randomUUID } from 'node:crypto';
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
const workspaceId = '00000000-0000-4000-8000-000000000393';
const foreignWorkspaceId = '00000000-0000-4000-8000-000000003930';
const grupTaxId = '1002600000001';
const logisticTaxId = '1012600000002';
const subjects = {
  owner: { subject: 'legal-entities-owner', displayName: 'Owner' },
  prisma: { subject: 'legal-entities-prisma', displayName: 'PRISMA Director' },
  prismaSecond: {
    subject: 'legal-entities-prisma-second',
    displayName: 'PRISMA Second Director',
  },
  bic: { subject: 'legal-entities-bic', displayName: 'BIC Director' },
  ecg: { subject: 'legal-entities-ecg', displayName: 'ECG Director' },
  resolver: { subject: 'legal-entities-resolver', displayName: 'Resolver' },
} as const;
type Actor = keyof typeof subjects;

const branch = {
  legalName: 'GRUP Demo SA — Sucursala Bălți',
  taxId: grupTaxId,
  legalAddress: null,
};
const logistic = {
  legalName: 'Demo Logistic SRL',
  taxId: logisticTaxId,
  legalAddress: 'Str. Industrială 1, Chișinău',
};
const staleBody = {
  statusCode: 409,
  error: 'Conflict',
  message: 'The Client dossier has changed.',
};
/** The dossier row lock a correction and every entity mutation take. */
const CLIENT_ROW_LOCK_QUERY =
  '%from "client_accounts"%for no key update of "client_accounts"%';
/** The union snapshot lock over both input Clients. */
const UNION_CLIENT_LOCK_QUERY = '%from "client_accounts" where%for update%';
const UNION_CANONICAL_UPDATE_QUERY = '%update "client_accounts" set%';
const ENTITY_RECEIPT_QUERY = '%insert into "client_legal_entity_commands"%';

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object.');
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a string.');
  return value;
}
function objects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected an array.');
  const values: unknown[] = value;
  return values.map(object);
}
async function body(response: Response) {
  const value: unknown = await response.json();
  return object(value);
}

describe.skipIf(!databaseUrl)(
  'Client additional legal entities REST contract',
  () => {
    let database: IsolatedPostgresTestDatabase;
    let harness: PostgresRestTestHarness;
    let companyA: string;
    let companyB: string;
    let companyC: string;
    let clientId: string;

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'client_legal_entities',
      });
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: subjects.owner.subject,
          ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Legal Entities',
          ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
            [
              subjects.prisma,
              subjects.prismaSecond,
              subjects.bic,
              subjects.ecg,
              subjects.resolver,
            ].map(({ subject }) => ({
              provider: 'deterministic-test',
              subject,
              workspaceId,
            })),
          ),
        },
      });
    });
    afterAll(async () => {
      await harness?.close();
      await database?.close();
    });
    beforeEach(async () => {
      await harness.pool.query('TRUNCATE workspaces, internal_users CASCADE');
      companyA = string(
        (await command('/companies', { displayName: 'PRISMA-PRIM' })).id,
      );
      companyB = string(
        (await command('/companies', { displayName: 'BIC' })).id,
      );
      companyC = string(
        (await command('/companies', { displayName: 'ECG' })).id,
      );
      for (const [actor, companies] of [
        ['prisma', [companyA]],
        ['prismaSecond', [companyA]],
        ['bic', [companyB]],
        ['ecg', [companyC]],
        ['resolver', [companyA, companyB]],
      ] as const) {
        const membershipId = await membership(actor);
        for (const companyId of companies)
          await command('/company-director-client-assignments', {
            workspaceMembershipId: membershipId,
            companyId,
          });
      }
      clientId = string(
        (
          await command(
            '/clients',
            { displayName: 'GRUP Demo SA', taxId: grupTaxId },
            { actor: 'prisma', company: companyA },
          )
        ).id,
      );
      const attached = await request(
        `/clients/${clientId}/active-company-relationship`,
        { actor: 'owner', company: companyB, method: 'PUT' },
      );
      expect(attached.status).toBe(200);
    });

    function request(
      path: string,
      options: {
        actor?: Actor;
        company?: string | null;
        method?: string;
        value?: unknown;
        key?: string | null;
      } = {},
    ) {
      const {
        actor = 'prisma',
        company = companyA,
        method = 'GET',
        value,
        key = randomUUID(),
      } = options;
      const identity = subjects[actor];
      return fetch(`${harness.origin}/api${path}`, {
        method,
        headers: {
          'x-test-external-provider': 'deterministic-test',
          'x-test-external-subject': identity.subject,
          'x-test-display-name': identity.displayName,
          'x-test-email': `${identity.subject}@example.test`,
          ...(company ? { 'x-company-context-id': company } : {}),
          ...(key === null ? {} : { 'idempotency-key': key }),
          'content-type': 'application/json',
        },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      });
    }
    async function command(
      path: string,
      value: unknown,
      options: Parameters<typeof request>[1] = {},
    ) {
      const response = await request(path, {
        actor: 'owner',
        company: null,
        ...options,
        method: 'POST',
        value,
      });
      expect(response.status, path).toBe(201);
      return body(response);
    }
    async function currentActor(actor: Actor) {
      const response = await request('/access/current-actor', {
        actor,
        company: null,
      });
      expect(response.status).toBe(200);
      return body(response);
    }
    async function membership(actor: Actor) {
      return string((await currentActor(actor)).workspaceMembershipId);
    }
    function list(
      options: Parameters<typeof request>[1] & { client?: string } = {},
    ) {
      const { client = clientId, ...rest } = options;
      return request(`/clients/${client}/legal-entities`, rest);
    }
    function register(
      value: unknown,
      options: Parameters<typeof request>[1] & { client?: string } = {},
    ) {
      const { client = clientId, ...rest } = options;
      return request(`/clients/${client}/legal-entities`, {
        ...rest,
        method: 'POST',
        value,
      });
    }
    function correctEntity(
      legalEntityId: string,
      value: unknown,
      options: Parameters<typeof request>[1] & { client?: string } = {},
    ) {
      const { client = clientId, ...rest } = options;
      return request(`/clients/${client}/legal-entities/${legalEntityId}`, {
        ...rest,
        method: 'PATCH',
        value,
      });
    }
    async function registered(
      value: Record<string, unknown>,
      options: Parameters<typeof register>[1] = {},
    ) {
      const response = await register(value, options);
      expect(response.status).toBe(201);
      return body(response);
    }
    function correctDossier(
      changes: Record<string, unknown>,
      options: Parameters<typeof request>[1] & { expectedVersion: number },
    ) {
      const { expectedVersion, ...rest } = options;
      return request(`/clients/${clientId}`, {
        ...rest,
        method: 'PATCH',
        value: { expectedVersion, ...changes },
      });
    }
    async function clientVersion(client = clientId) {
      const result = await harness.pool.query<{ version: number }>(
        'SELECT version FROM client_accounts WHERE id = $1',
        [client],
      );
      return result.rows[0]?.version;
    }
    async function writes() {
      const result = await harness.pool.query<{
        entities: string;
        receipts: string;
        corrections: string;
        events: string;
        versions: string;
      }>(`SELECT
        (SELECT count(*) FROM client_legal_entities) AS entities,
        (SELECT count(*) FROM client_legal_entity_commands) AS receipts,
        (SELECT count(*) FROM client_account_correction_commands) AS corrections,
        (SELECT count(*) FROM activity_log_events) AS events,
        (SELECT string_agg(id::text || ':' || version, ',' ORDER BY id)
           FROM client_accounts) AS versions`);
      return result.rows[0];
    }
    async function entityEvents() {
      const result = await harness.pool.query<{
        action: string;
        target_type: string;
        target_client_account_id: string;
        target_company_id: string;
        actor_workspace_membership_id: string;
        metadata: unknown;
      }>(
        `SELECT action::text AS action, target_type::text AS target_type,
           target_client_account_id, target_company_id,
           actor_workspace_membership_id, metadata
         FROM activity_log_events
         WHERE action::text LIKE 'client_legal_entity.%'
         ORDER BY occurred_at, id`,
      );
      return result.rows;
    }
    async function dossierRefusal(
      options: Parameters<typeof request>[1] & { client?: string },
    ) {
      const { client = clientId, ...rest } = options;
      const response = await request(`/clients/${client}`, rest);
      return { status: response.status, body: await response.json() };
    }
    async function expectDossierRefusal(
      response: Response,
      options: Parameters<typeof dossierRefusal>[0],
    ) {
      const expected = await dossierRefusal(options);
      expect([403, 404]).toContain(expected.status);
      expect({
        status: response.status,
        body: await response.json(),
      }).toEqual(expected);
    }
    async function waitForLockWaiters(
      queryPattern: string,
      expected: number,
    ): Promise<void> {
      for (let attempt = 0; attempt < 400; attempt += 1) {
        const waiting = await harness.pool.query<{ count: string }>(
          `SELECT count(*) AS count
             FROM pg_stat_activity
            WHERE datname = current_database()
              AND wait_event_type = 'Lock'
              AND query ILIKE $1`,
          [queryPattern],
        );
        if (Number(waiting.rows[0]?.count) >= expected) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`No ${expected} waiter(s) reached ${queryPattern}.`);
    }
    /** Holds the Client row FOR SHARE: receipts reserve, row locks queue. */
    async function withClientRowBarrier(
      work: (release: () => Promise<void>) => Promise<void>,
    ) {
      const barrier = await harness.pool.connect();
      let released = false;
      try {
        await barrier.query('BEGIN');
        await barrier.query(
          'SELECT id FROM client_accounts WHERE id = $1 FOR SHARE',
          [clientId],
        );
        await work(async () => {
          await barrier.query('COMMIT');
          released = true;
        });
      } finally {
        if (!released) await barrier.query('ROLLBACK');
        barrier.release();
      }
    }

    /** A legacy dossier in BIC sharing GRUP's exact IDNO, as union needs. */
    async function legacyDuplicate() {
      const duplicate = string(
        (
          await command(
            '/clients',
            { displayName: 'GRUP Demo S.A.', taxId: 'LEGACY-393' },
            { actor: 'bic', company: companyB },
          )
        ).id,
      );
      await harness.pool.query(
        'UPDATE client_accounts SET tax_id = $1 WHERE id = $2',
        [grupTaxId, duplicate],
      );
      return duplicate;
    }
    async function beginUnion() {
      const response = await request(`/clients/${clientId}/union-reviews`, {
        actor: 'resolver',
        method: 'POST',
      });
      expect(response.status).toBe(201);
      const review = await body(response);
      expect(review.outcome).toBe('comparison');
      return string(review.reviewReference);
    }
    function confirmUnion(reference: string, key = randomUUID()) {
      return request(`/client-union-reviews/${reference}/confirm`, {
        actor: 'resolver',
        method: 'POST',
        key,
        value: {
          canonicalClientId: clientId,
          fields: {
            displayName: clientId,
            taxId: clientId,
            address: clientId,
            telephone: clientId,
            generalEmail: clientId,
            businessActivity: clientId,
          },
          companyIds: [companyA, companyB],
          reviewedDifferences: true,
          reason: 'Same legal identity recorded twice.',
        },
      });
    }
    async function unionState() {
      const result = await harness.pool.query(`SELECT
        (SELECT jsonb_agg(to_jsonb(client) ORDER BY id) FROM client_accounts AS client) AS clients,
        (SELECT jsonb_agg(to_jsonb(relationship) ORDER BY id) FROM client_company_relationships AS relationship) AS relationships,
        (SELECT count(*) FROM client_union_operations)::integer AS operations,
        (SELECT count(*) FROM client_union_projections)::integer AS projections,
        (SELECT count(*) FROM client_identifier_reservations)::integer AS reservations`);
      return result.rows;
    }
    async function setDirectorVersion(
      actor: Actor,
      companyId: string,
      version: 'v1' | 'v2',
    ) {
      await harness.pool.query(
        `UPDATE company_role_assignments
            SET permission_set_version = $3
          WHERE workspace_membership_id = $1
            AND company_id = $2
            AND bundle = 'company_director_client_access'
            AND revoked_at IS NULL`,
        [await membership(actor), companyId, version],
      );
    }
    async function setRelationship(
      companyId: string,
      status: 'active' | 'archived',
      client = clientId,
    ) {
      await harness.pool.query(
        `UPDATE client_company_relationships SET status = $3
          WHERE client_account_id = $1 AND company_id = $2`,
        [client, companyId, status],
      );
    }

    async function insertForeignClient(foreignClientId: string) {
      await harness.pool.query(
        `WITH foreign_workspace AS (
          INSERT INTO workspaces (id, name)
          VALUES ($1, 'Foreign Workspace')
          RETURNING id
        ), foreign_user AS (
          INSERT INTO internal_users (
            external_provider, external_subject, display_name, email
          )
          VALUES ('deterministic-test', 'legal-entities-foreign',
            'Foreign Owner', 'foreign@example.test')
          RETURNING id
        ), foreign_membership AS (
          INSERT INTO workspace_memberships (workspace_id, internal_user_id)
          SELECT foreign_workspace.id, foreign_user.id
          FROM foreign_workspace, foreign_user
          RETURNING id, workspace_id, internal_user_id
        )
        INSERT INTO client_accounts (
          id, workspace_id, display_name,
          created_by_internal_user_id, created_by_workspace_membership_id
        )
        SELECT $2::uuid, workspace_id, 'Foreign Client',
          internal_user_id, id
        FROM foreign_membership`,
        [foreignWorkspaceId, foreignClientId],
      );
    }

    it('records an additional legal entity with one version and one event, visible to every involved director but not an unrelated one', async () => {
      const before = await writes();
      const created = await register({
        expectedClientVersion: 1,
        legalName: `  ${branch.legalName} `,
        taxId: ` ${grupTaxId}  `,
      });
      expect(created.status).toBe(201);
      const first = await body(created);
      const firstEntity = object(first.legalEntity);
      expect(first).toEqual({
        clientVersion: 2,
        legalEntity: {
          id: expect.any(String),
          ...branch,
          createdAt: expect.any(String),
        },
      });
      expect(Number.isFinite(Date.parse(string(firstEntity.createdAt)))).toBe(
        true,
      );
      expect(await clientVersion()).toBe(2);
      const dossier = await request(`/clients/${clientId}`);
      expect((await body(dossier)).version).toBe(2);
      expect(await entityEvents()).toEqual([
        {
          action: 'client_legal_entity.registered',
          target_type: 'client_account',
          target_client_account_id: clientId,
          target_company_id: companyA,
          actor_workspace_membership_id: await membership('prisma'),
          metadata: { legalEntityId: firstEntity.id, values: branch },
        },
      ]);
      expect(await writes()).toMatchObject({
        entities: '1',
        receipts: '1',
        events: String(Number(before?.events) + 1),
      });

      const second = await registered(
        { expectedClientVersion: 2, ...logistic },
        { actor: 'prismaSecond' },
      );
      expect(second.clientVersion).toBe(3);

      const afterWrites = await writes();
      const shared = await list({ actor: 'bic', company: companyB });
      expect(shared.status).toBe(200);
      expect(await shared.json()).toEqual({
        clientVersion: 3,
        legalEntities: [firstEntity, second.legalEntity],
      });
      const unrelated = await list({ actor: 'ecg', company: companyC });
      await expectDossierRefusal(unrelated, {
        actor: 'ecg',
        company: companyC,
      });
      expect(await writes()).toEqual(afterWrites);
    });

    it('corrects values with previous and new values, refuses a no-op and validates exactly like registration', async () => {
      const created = await registered({
        expectedClientVersion: 1,
        ...logistic,
      });
      const entity = object(created.legalEntity);
      const entityId = string(entity.id);

      const corrected = await correctEntity(entityId, {
        expectedClientVersion: 2,
        changes: { legalAddress: ' Str. Industrială 5, Chișinău ' },
      });
      expect(corrected.status).toBe(200);
      expect(await corrected.json()).toEqual({
        clientVersion: 3,
        legalEntity: {
          ...entity,
          legalAddress: 'Str. Industrială 5, Chișinău',
        },
      });
      const [, correctionEvent] = await entityEvents();
      expect(correctionEvent).toMatchObject({
        action: 'client_legal_entity.corrected',
        target_client_account_id: clientId,
        target_company_id: companyA,
        metadata: {
          legalEntityId: entityId,
          changes: {
            legalAddress: {
              before: logistic.legalAddress,
              after: 'Str. Industrială 5, Chișinău',
            },
          },
        },
      });

      const beforeNoOp = await writes();
      const noOp = await correctEntity(entityId, {
        expectedClientVersion: 3,
        changes: { legalName: ` ${logistic.legalName}`, taxId: logisticTaxId },
      });
      expect(noOp.status).toBe(400);
      expect(await noOp.json()).toMatchObject({
        message: 'The Client correction must change at least one field.',
      });
      expect(await writes()).toEqual(beforeNoOp);

      const cleared = await correctEntity(entityId, {
        expectedClientVersion: 3,
        changes: { taxId: '   ', legalName: 'Demo Logistic S.R.L.' },
      });
      expect(cleared.status).toBe(200);
      expect(object((await body(cleared)).legalEntity)).toMatchObject({
        legalName: 'Demo Logistic S.R.L.',
        taxId: null,
      });
      expect((await entityEvents()).at(-1)?.metadata).toEqual({
        legalEntityId: entityId,
        changes: {
          legalName: {
            before: logistic.legalName,
            after: 'Demo Logistic S.R.L.',
          },
          taxId: { before: logisticTaxId, after: null },
        },
      });

      const beforeRejected = await writes();
      const registrationFailures: [unknown, string][] = [
        [
          { expectedClientVersion: 4, legalName: '  ' },
          'Client legal entity name is required.',
        ],
        [{ expectedClientVersion: 4 }, 'Client legal entity name is required.'],
        [
          { expectedClientVersion: 4, legalName: 'x'.repeat(201) },
          'Client legal entity name is too long.',
        ],
        [
          { expectedClientVersion: 4, legalName: 'Demo\0 SRL' },
          'Client legal entity name must not contain NUL characters.',
        ],
        [
          { expectedClientVersion: 4, legalName: 'Demo', taxId: 42 },
          'Client legal entity tax ID must be text or null.',
        ],
        [
          {
            expectedClientVersion: 4,
            legalName: 'Demo',
            taxId: '1'.repeat(501),
          },
          'Client legal entity tax ID is too long.',
        ],
        [
          { expectedClientVersion: 4, legalName: 'Demo', taxId: '1002\0' },
          'Client legal entity tax ID must not contain NUL characters.',
        ],
        [
          {
            expectedClientVersion: 4,
            legalName: 'Demo',
            legalAddress: 'a'.repeat(2_001),
          },
          'Client legal entity address is too long.',
        ],
        [
          {
            expectedClientVersion: 4,
            legalName: 'Demo',
            legalAddress: 'Str. Demo\0 5',
          },
          'Client legal entity address must not contain NUL characters.',
        ],
        [
          { expectedClientVersion: 4, legalName: 'Demo', branchCode: 'B1' },
          'Unknown Client legal entity field.',
        ],
        [
          { legalName: 'Demo' },
          'Expected Client version must be an integer between 1 and 2147483646.',
        ],
        [
          { expectedClientVersion: 0, legalName: 'Demo' },
          'Expected Client version must be an integer between 1 and 2147483646.',
        ],
        [['Demo'], 'Client legal entity request must be an object.'],
      ];
      for (const [value, message] of registrationFailures) {
        const response = await register(value);
        expect(response.status, JSON.stringify(value)).toBe(400);
        expect(await response.json()).toMatchObject({ message });
      }
      const correctionFailures: [unknown, string][] = [
        [
          { expectedClientVersion: 4, changes: {} },
          'At least one Client legal entity field is required.',
        ],
        [
          { expectedClientVersion: 4 },
          'Client legal entity changes must be an object.',
        ],
        [
          { expectedClientVersion: 4, changes: { legalName: null } },
          'Client legal entity name is required.',
        ],
        [
          { expectedClientVersion: 4, changes: { legalName: 'Demo\0 SRL' } },
          'Client legal entity name must not contain NUL characters.',
        ],
        [
          { expectedClientVersion: 4, changes: { taxId: '1002\0' } },
          'Client legal entity tax ID must not contain NUL characters.',
        ],
        [
          { expectedClientVersion: 4, changes: { legalAddress: 7 } },
          'Client legal entity address must be text or null.',
        ],
        [
          {
            expectedClientVersion: 4,
            changes: { legalAddress: 'Str. Demo\0 5' },
          },
          'Client legal entity address must not contain NUL characters.',
        ],
        [
          { expectedClientVersion: 4, changes: { registryStatus: 'ok' } },
          'Unknown Client legal entity field.',
        ],
        [
          { expectedClientVersion: 4, changes: { taxId: null }, extra: true },
          'Unknown Client legal entity field.',
        ],
      ];
      for (const [value, message] of correctionFailures) {
        const response = await correctEntity(entityId, value);
        expect(response.status, JSON.stringify(value)).toBe(400);
        expect(await response.json()).toMatchObject({ message });
      }
      const keyless = await register(
        { expectedClientVersion: 4, legalName: 'Demo' },
        { key: null },
      );
      expect(keyless.status).toBe(400);
      expect(await keyless.json()).toMatchObject({
        message: 'Idempotency-Key header is required.',
      });
      const malformed = await list({ client: 'not-a-uuid' });
      expect(malformed.status).toBe(400);
      expect(await writes()).toEqual(beforeRejected);

      const bounded = await registered({
        expectedClientVersion: 4,
        legalName: 'N'.repeat(200),
        taxId: 'T'.repeat(500),
        legalAddress: 'A'.repeat(2_000),
      });
      expect(object(bounded.legalEntity)).toMatchObject({
        legalName: 'N'.repeat(200),
        taxId: 'T'.repeat(500),
        legalAddress: 'A'.repeat(2_000),
      });
    });

    it('shares one dossier version token: stale entity or dossier commands conflict and write nothing', async () => {
      const created = await registered({ expectedClientVersion: 1, ...branch });
      const entityId = string(object(created.legalEntity).id);
      const before = await writes();

      const staleRegistration = await register({
        expectedClientVersion: 1,
        ...logistic,
      });
      expect(staleRegistration.status).toBe(409);
      expect(await staleRegistration.json()).toEqual(staleBody);
      const staleDossier = await correctDossier(
        { telephone: '+373 22 000 393' },
        { expectedVersion: 1 },
      );
      expect(staleDossier.status).toBe(409);
      expect(await writes()).toEqual(before);

      const dossier = await correctDossier(
        { telephone: '+373 22 000 393' },
        { expectedVersion: 2 },
      );
      expect(dossier.status).toBe(200);
      const staleCorrection = await correctEntity(entityId, {
        expectedClientVersion: 2,
        changes: { legalAddress: 'Str. Independenței 1, Bălți' },
      });
      expect(staleCorrection.status).toBe(409);
      expect(await staleCorrection.json()).toEqual(staleBody);
      const current = await correctEntity(entityId, {
        expectedClientVersion: 3,
        changes: { legalAddress: 'Str. Independenței 1, Bălți' },
      });
      expect(current.status).toBe(200);
      expect((await body(current)).clientVersion).toBe(4);
    });

    it('applies exactly the dossier read and correction authority with the dossier refusals', async () => {
      const created = await registered({ expectedClientVersion: 1, ...branch });
      const entityId = string(object(created.legalEntity).id);
      const otherClient = string(
        (
          await command(
            '/clients',
            { displayName: 'Alt Demo SRL' },
            { actor: 'prisma', company: companyA },
          )
        ).id,
      );
      const otherEntity = await registered(
        { expectedClientVersion: 1, legalName: 'Alt Demo — Filiala Cahul' },
        { client: otherClient },
      );
      const otherEntityId = string(object(otherEntity.legalEntity).id);
      const foreignClient = randomUUID();
      await insertForeignClient(foreignClient);
      const before = await writes();
      const hidden = /Sucursala|Filiala|1002600000001/u;

      const refusals: {
        actor: Actor;
        company: string | null;
        client?: string;
        entity?: string;
      }[] = [
        // Workspace client.manage without Company client.update or client.read.
        { actor: 'owner', company: companyA },
        // No server-validated active Company.
        { actor: 'prisma', company: null },
        // A Company with no relationship to the Client.
        { actor: 'ecg', company: companyC },
        // A Client of another Workspace.
        { actor: 'prisma', company: companyA, client: foreignClient },
        // An unknown Client.
        { actor: 'prisma', company: companyA, client: randomUUID() },
      ];
      for (const refusal of refusals) {
        const { client = clientId, entity = entityId } = refusal;
        const target = {
          actor: refusal.actor,
          company: refusal.company,
          client,
        };
        const read = await list(target);
        const readText = await read.clone().text();
        expect(readText, refusal.actor).not.toMatch(hidden);
        await expectDossierRefusal(read, target);
        const registration = await register(
          { expectedClientVersion: 2, legalName: 'Filiala Orhei' },
          target,
        );
        await expectDossierRefusal(registration, target);
        const correction = await correctEntity(
          entity,
          { expectedClientVersion: 2, changes: { legalName: 'Leak' } },
          target,
        );
        await expectDossierRefusal(correction, target);
      }

      // An entity belonging to another Client, or an unknown entity, is the
      // dossier-read not-found and reveals nothing about that entity.
      for (const unknownEntity of [otherEntityId, randomUUID()]) {
        const response = await correctEntity(unknownEntity, {
          expectedClientVersion: 2,
          changes: { legalName: 'Leak' },
        });
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
          statusCode: 404,
          message: 'Not Found',
        });
      }
      expect(await writes()).toEqual(before);

      // An archived relationship removes the Company's dossier authority.
      await setRelationship(companyB, 'archived');
      const archived = { actor: 'bic' as const, company: companyB };
      await expectDossierRefusal(await list(archived), archived);
      await expectDossierRefusal(
        await register(
          { expectedClientVersion: 2, legalName: 'Filiala Orhei' },
          archived,
        ),
        archived,
      );
      expect(await writes()).toEqual(before);
      await setRelationship(companyB, 'active');

      // Captured Company Director v1 and resolver-enabled v2 both qualify.
      await setDirectorVersion('bic', companyB, 'v1');
      const byV1 = await register(
        { expectedClientVersion: 2, legalName: 'Filiala Orhei' },
        { actor: 'bic', company: companyB },
      );
      expect(byV1.status).toBe(201);
      const byV2 = await register(
        { expectedClientVersion: 3, legalName: 'Filiala Soroca' },
        { actor: 'resolver', company: companyA },
      );
      expect(byV2.status).toBe(201);
      expect(
        objects((await body(await list())).legalEntities).map(
          (entity) => entity.legalName,
        ),
      ).toEqual([branch.legalName, 'Filiala Orhei', 'Filiala Soroca']);
    });

    it('replays an exact command only after revalidating current authority and refuses a reused key', async () => {
      const key = randomUUID();
      const value = { expectedClientVersion: 1, ...logistic };
      const first = await register(value, { key });
      expect(first.status).toBe(201);
      const result = await body(first);
      const entityId = string(object(result.legalEntity).id);
      const correctionKey = randomUUID();
      const correction = { expectedClientVersion: 2, changes: { taxId: null } };
      const corrected = await correctEntity(entityId, correction, {
        key: correctionKey,
      });
      expect(corrected.status).toBe(200);
      const correctionResult = await body(corrected);
      const before = await writes();

      const replay = await register(value, { key });
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(result);
      const correctionReplay = await correctEntity(entityId, correction, {
        key: correctionKey,
      });
      expect(correctionReplay.status).toBe(200);
      expect(await correctionReplay.json()).toEqual(correctionResult);
      expect(await writes()).toEqual(before);

      for (const reused of [
        () => register({ ...value, legalAddress: 'Str. Alta 2' }, { key }),
        () => correctEntity(entityId, correction, { key }),
        () => register(value, { key: correctionKey }),
      ]) {
        const response = await reused();
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
          message:
            'Idempotency-Key was already used for another Client command.',
        });
      }
      // The key belongs to this command in this Company only.
      const otherCompany = await register(value, { key, company: companyB });
      expect(otherCompany.status).toBe(403);
      expect(await writes()).toEqual(before);

      // A lost relationship replays as the dossier-read not-found.
      await setRelationship(companyA, 'archived');
      const unrelated = await register(value, { key });
      expect(unrelated.status).toBe(404);
      expect(await unrelated.json()).toEqual({
        statusCode: 404,
        message: 'Not Found',
      });
      await setRelationship(companyA, 'active');
      expect((await register(value, { key })).status).toBe(201);

      // Revoked authority replays as the dossier refusal.
      const revoked = await request(
        `/company-director-client-assignments/${await membership('prisma')}/${companyA}`,
        { actor: 'owner', company: null, method: 'DELETE' },
      );
      expect(revoked.status).toBe(200);
      const afterRevocation = await register(value, { key });
      expect(afterRevocation.status).toBe(403);
      expect(await afterRevocation.json()).toMatchObject({ statusCode: 403 });
      expect(
        (await correctEntity(entityId, correction, { key: correctionKey }))
          .status,
      ).toBe(403);
      expect(await writes()).toMatchObject({
        entities: before?.entities,
        receipts: before?.receipts,
        versions: before?.versions,
      });
    });

    it('refuses a 51st entity with the capacity conflict and writes nothing', async () => {
      const prisma = await currentActor('prisma');
      await harness.pool.query(
        `INSERT INTO client_legal_entities (
           workspace_id, client_account_id, legal_name,
           created_by_internal_user_id, created_by_workspace_membership_id)
         SELECT $1, $2, 'Filiala ' || position, $3, $4
         FROM generate_series(1, 49) AS position`,
        [
          workspaceId,
          clientId,
          prisma.internalUserId,
          prisma.workspaceMembershipId,
        ],
      );
      const fiftieth = await registered({
        expectedClientVersion: 1,
        legalName: 'Filiala 50',
      });
      expect(fiftieth.clientVersion).toBe(2);
      const before = await writes();

      const overflow = await register({
        expectedClientVersion: 2,
        legalName: 'Filiala 51',
      });
      expect(overflow.status).toBe(409);
      expect(await overflow.json()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        code: 'client_legal_entity_capacity_exceeded',
      });
      expect(await writes()).toEqual(before);
      const listed = await body(await list());
      expect(listed.clientVersion).toBe(2);
      expect(objects(listed.legalEntities)).toHaveLength(50);
    });

    it('keeps entity identifiers outside duplicate detection, reservations and search', async () => {
      const futureTaxId = '1012600000077';
      const other = await command(
        '/clients',
        { displayName: 'Alt Demo SRL', taxId: '1003600000009' },
        { actor: 'prisma', company: companyA },
      );
      // A branch may share its parent's identifier or another Client's.
      await registered({ expectedClientVersion: 1, ...branch });
      await registered({
        expectedClientVersion: 2,
        legalName: 'Alt Demo — Filiala Bălți',
        taxId: '1003600000009',
      });
      await registered({ expectedClientVersion: 3, ...logistic });
      await registered({
        expectedClientVersion: 4,
        legalName: 'Future Demo SRL',
        taxId: futureTaxId,
      });
      // Neither a new Client nor a dossier correction meets an entity's IDNO.
      const created = await request('/clients', {
        method: 'POST',
        value: { displayName: logistic.legalName, taxId: logisticTaxId },
      });
      expect(created.status).toBe(201);
      const correctedOther = await request(`/clients/${string(other.id)}`, {
        method: 'PATCH',
        value: { expectedVersion: 1, taxId: futureTaxId },
      });
      expect(correctedOther.status).toBe(200);
      const reviews = await harness.pool.query<{ count: string }>(
        'SELECT count(*) FROM client_duplicate_reviews',
      );
      expect(reviews.rows).toEqual([{ count: '0' }]);
      const reservations = await harness.pool.query<{ count: string }>(
        'SELECT count(*) FROM client_identifier_reservations',
      );
      expect(reservations.rows).toEqual([{ count: '0' }]);
      const search = await request(
        `/clients/search?query=${encodeURIComponent('Sucursala')}`,
      );
      expect(search.status).toBe(200);
      expect(await search.json()).toEqual([]);

      // The delivered exact-identifier duplicate guard is unchanged.
      const duplicate = await request('/clients', {
        method: 'POST',
        value: { displayName: 'GRUP Demo Copy', taxId: grupTaxId },
      });
      expect(duplicate.status).toBe(409);
      expect(await duplicate.json()).toMatchObject({
        code: 'possible_duplicate_review_required',
      });
    });

    it('projects both events only in the recording Company to current readers and keeps correction history dossier-only', async () => {
      const first = await registered({ expectedClientVersion: 1, ...branch });
      const second = await registered({
        expectedClientVersion: 2,
        ...logistic,
      });
      const secondId = string(object(second.legalEntity).id);
      const corrected = await correctEntity(secondId, {
        expectedClientVersion: 3,
        changes: { legalAddress: 'Str. Industrială 5, Chișinău' },
      });
      expect(corrected.status).toBe(200);
      await registered(
        { expectedClientVersion: 4, legalName: 'GRUP Demo SA — Filiala BIC' },
        { actor: 'bic', company: companyB },
      );

      async function activity(actor: Actor, company: string) {
        const response = await request('/activity-log', { actor, company });
        expect(response.status).toBe(200);
        return objects((await body(response)).events).filter((event) =>
          string(event.action).startsWith('client_legal_entity.'),
        );
      }
      const prismaEvents = await activity('prisma', companyA);
      expect(prismaEvents.map((event) => event.action)).toEqual([
        'client_legal_entity.corrected',
        'client_legal_entity.registered',
        'client_legal_entity.registered',
      ]);
      const prismaActor = await currentActor('prisma');
      for (const event of prismaEvents)
        expect(event).toMatchObject({
          actor: {
            internalUserId: prismaActor.internalUserId,
            displayName: subjects.prisma.displayName,
          },
          target: {
            type: 'client_account',
            clientAccountId: clientId,
            displayName: 'GRUP Demo SA',
            companyId: companyA,
            companyDisplayName: 'PRISMA-PRIM',
          },
        });
      expect(prismaEvents[2]?.metadata).toEqual({
        legalEntityId: object(first.legalEntity).id,
        values: branch,
      });
      const bicEvents = await activity('bic', companyB);
      expect(bicEvents.map((event) => event.action)).toEqual([
        'client_legal_entity.registered',
      ]);
      expect(object(bicEvents[0]?.target).companyId).toBe(companyB);
      expect(await activity('ecg', companyC)).toEqual([]);
      expect(await activity('owner', companyA)).toEqual([]);

      const history = await request(`/clients/${clientId}/correction-history`);
      expect(history.status).toBe(200);
      expect(await history.json()).toEqual({
        corrections: [],
        nextCursor: null,
      });

      // Losing current read authority in the Company hides its events.
      await setRelationship(companyA, 'archived');
      expect(await activity('prisma', companyA)).toEqual([]);
      expect(await activity('bic', companyB)).toHaveLength(1);
    });

    it('refuses a union with an entity-bearing input only after complete authority passes', async () => {
      const duplicate = await legacyDuplicate();
      await registered(
        { expectedClientVersion: 1, legalName: 'GRUP Demo S.A. — Filiala' },
        { actor: 'bic', company: companyB, client: duplicate },
      );
      const reference = await beginUnion();
      const before = await unionState();

      await setDirectorVersion('resolver', companyB, 'v1');
      const partial = await confirmUnion(reference);
      expect(partial.status).toBe(404);
      expect(await partial.text()).not.toMatch(/legal_entit|Filiala/u);
      expect(await unionState()).toEqual(before);

      await setDirectorVersion('resolver', companyB, 'v2');
      const refused = await confirmUnion(reference);
      expect(refused.status).toBe(409);
      expect(await refused.json()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        code: 'client_union_legal_entities_unsupported',
      });
      expect(await unionState()).toEqual(before);
    });

    it('blocks reversal once the canonical Client records an entity and refuses entity mutations on the superseded Client', async () => {
      const duplicate = await legacyDuplicate();
      const united = await confirmUnion(await beginUnion());
      expect(united.status).toBe(201);
      const projection = string((await body(united)).projectionReference);

      const superseded = {
        actor: 'bic' as const,
        company: companyB,
        client: duplicate,
      };
      await expectDossierRefusal(await list(superseded), superseded);
      await expectDossierRefusal(
        await register({ expectedClientVersion: 2, ...branch }, superseded),
        superseded,
      );
      const canonicalVersion = await clientVersion();
      await registered({ expectedClientVersion: canonicalVersion, ...branch });

      const reversal = await request(
        `/client-union-operations/${projection}/reversal`,
        {
          actor: 'resolver',
          method: 'POST',
          value: {
            companyIds: [companyA, companyB],
            reason: 'Revert the mistaken union.',
          },
        },
      );
      expect(reversal.status).toBe(409);
      expect(await reversal.json()).toMatchObject({
        message: 'Client union can no longer be reversed.',
      });
      const statuses = await harness.pool.query<{ status: string }>(
        'SELECT status::text AS status FROM client_accounts WHERE id = $1',
        [duplicate],
      );
      expect(statuses.rows).toEqual([{ status: 'superseded' }]);
    });

    describe('concurrent commands on one observed version', () => {
      async function expectOneCommit(expectedEvents: number) {
        const state = await writes();
        expect(await clientVersion()).toBe(2);
        expect(Number(state?.receipts) + Number(state?.corrections)).toBe(1);
        const events = await harness.pool.query<{ count: string }>(
          `SELECT count(*) FROM activity_log_events
            WHERE action::text IN ('client_legal_entity.registered',
              'client_legal_entity.corrected', 'client.corrected')`,
        );
        expect(Number(events.rows[0]?.count)).toBe(expectedEvents);
      }

      it('commits one of two registrations and returns the stale conflict to the other', async () => {
        await withClientRowBarrier(async (release) => {
          const pending = Promise.all([
            register({ expectedClientVersion: 1, ...branch }),
            register(
              { expectedClientVersion: 1, ...logistic },
              { actor: 'bic', company: companyB },
            ),
          ]);
          await waitForLockWaiters(CLIENT_ROW_LOCK_QUERY, 2);
          await release();
          const responses = await pending;
          expect(
            responses.map((response) => response.status).toSorted(),
          ).toEqual([201, 409]);
          const loser = responses.find((response) => response.status === 409);
          expect(await loser?.json()).toEqual(staleBody);
        });
        await expectOneCommit(1);
        expect((await writes())?.entities).toBe('1');
      });

      it('commits one of a registration and a dossier correction', async () => {
        await withClientRowBarrier(async (release) => {
          const pending = Promise.all([
            register({ expectedClientVersion: 1, ...branch }),
            correctDossier(
              { telephone: '+373 22 000 393' },
              { actor: 'bic', company: companyB, expectedVersion: 1 },
            ),
          ]);
          await waitForLockWaiters(CLIENT_ROW_LOCK_QUERY, 2);
          await release();
          const [registration, correction] = await pending;
          expect(
            [registration.status, correction.status].filter(
              (status) => status === 409,
            ),
          ).toHaveLength(1);
          expect([201, 409]).toContain(registration.status);
          expect([200, 409]).toContain(correction.status);
          const loser = registration.status === 409 ? registration : correction;
          expect(await loser.json()).toEqual(staleBody);
        });
        await expectOneCommit(1);
      });

      it('lets a queued registration win over a union that then sees its stale review', async () => {
        const duplicate = await legacyDuplicate();
        const reference = await beginUnion();
        await withClientRowBarrier(async (release) => {
          const registration = register(
            { expectedClientVersion: 1, ...branch },
            { actor: 'bic', company: companyB },
          );
          await waitForLockWaiters(CLIENT_ROW_LOCK_QUERY, 1);
          const union = confirmUnion(reference);
          await waitForLockWaiters(UNION_CLIENT_LOCK_QUERY, 1);
          await release();
          const [registered, united] = await Promise.all([registration, union]);
          expect(registered.status).toBe(201);
          // The delivered union freshness fence: a stale review is the safe
          // denial and changes nothing.
          expect(united.status).toBe(404);
        });
        await expectOneCommit(1);
        const operations = await harness.pool.query<{ count: string }>(
          'SELECT count(*) FROM client_union_operations',
        );
        expect(operations.rows).toEqual([{ count: '0' }]);
        expect(await clientVersion(duplicate)).toBe(1);
      });

      it('returns the stale conflict to a registration queued behind a union holding the Client rows', async () => {
        const duplicate = await legacyDuplicate();
        const reference = await beginUnion();
        // SHARE admits the union's row locks but holds its first Client write,
        // so the registration's receipt then waits on the union's row lock.
        const barrier = await harness.pool.connect();
        let released = false;
        try {
          await barrier.query('BEGIN');
          await barrier.query('LOCK TABLE client_accounts IN SHARE MODE');
          const union = confirmUnion(reference);
          await waitForLockWaiters(UNION_CANONICAL_UPDATE_QUERY, 1);
          const registration = register(
            { expectedClientVersion: 1, ...branch },
            { actor: 'bic', company: companyB },
          );
          await waitForLockWaiters(ENTITY_RECEIPT_QUERY, 1);
          await barrier.query('COMMIT');
          released = true;
          const [united, registered] = await Promise.all([union, registration]);
          expect(united.status).toBe(201);
          expect(registered.status).toBe(409);
          expect(await registered.json()).toEqual(staleBody);
        } finally {
          if (!released) await barrier.query('ROLLBACK');
          barrier.release();
        }
        const state = await writes();
        expect(state).toMatchObject({ entities: '0', receipts: '0' });
        expect(await entityEvents()).toEqual([]);
        expect(await clientVersion()).toBe(2);
        expect(await clientVersion(duplicate)).toBe(2);
      });
    });
  },
);
