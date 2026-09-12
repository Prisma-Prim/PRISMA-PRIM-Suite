import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (process.env.REQUIRE_CLIENT_POSTGRES === 'true' && !databaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for the destructive PostgreSQL Client union REST suite.',
  );
}
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000222';

describeWithPostgres('Client governed union REST API', () => {
  let harness: PostgresRestTestHarness;
  let origin: string;
  let pool: Pool;

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL is required to start this suite.');
    }
    harness = await createPostgresRestTestHarness({
      databaseUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Client Union Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'workspace-member',
            workspaceId: WORKSPACE_ID,
          },
        ]),
      },
    });
    ({ origin, pool } = harness);
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await harness?.close();
  });

  it('compares two existing same-identifier dossiers, unites them and reverses the union', async () => {
    const scene = await twoLegacyDuplicatesInOneCompany();

    const comparison = await openComparison(scene.companyId, [
      scene.firstClientId,
      scene.secondClientId,
    ]);
    expect(comparison.outcome).toBe('comparison');
    expect(comparison.clients.map((client) => client.id).toSorted()).toEqual(
      [scene.firstClientId, scene.secondClientId].toSorted(),
    );

    const union = await confirmUnion(scene.companyId, {
      comparisonReference: comparison.comparison_reference,
      canonicalClientAccountId: scene.firstClientId,
      fieldSelections: { displayName: scene.firstClientId },
      reason: 'Same registered tax identifier and the same legal address.',
      confirmedCompanyIds: [scene.companyId],
      idempotencyKey: 'union-first-over-second',
    });
    expect(union.status).toBe('confirmed');
    expect(union.canonicalClientAccountId).toBe(scene.firstClientId);
    expect(union.supersededClientAccountId).toBe(scene.secondClientId);
    expect(union.affectedCompanyIds).toEqual([scene.companyId]);

    const activeList = await listClients(scene.companyId);
    expect(activeList.map((client) => client.id)).toEqual([
      scene.firstClientId,
    ]);

    const reversal = await reverseUnion(scene.companyId, {
      unionOperationId: union.unionOperationId,
      reason: 'The two dossiers are distinct branches after verification.',
      idempotencyKey: 'reverse-first-over-second',
    });
    expect(reversal.status).toBe('reversed');

    const restoredList = await listClients(scene.companyId);
    expect(restoredList.map((client) => client.id).toSorted()).toEqual(
      [scene.firstClientId, scene.secondClientId].toSorted(),
    );
  });

  it('keeps the superseded dossier readable through its united-with history', async () => {
    const scene = await twoLegacyDuplicatesInOneCompany();
    const comparison = await openComparison(scene.companyId, [
      scene.firstClientId,
      scene.secondClientId,
    ]);
    await confirmUnion(scene.companyId, {
      comparisonReference: comparison.comparison_reference,
      canonicalClientAccountId: scene.firstClientId,
      fieldSelections: { displayName: scene.firstClientId },
      reason: 'Same registered tax identifier.',
      confirmedCompanyIds: [scene.companyId],
      idempotencyKey: 'union-history-route',
    });

    const superseded = await readDossier(scene.companyId, scene.secondClientId);
    expect(superseded.unitedWithClientAccountId).toBe(scene.firstClientId);
    const canonical = await readDossier(scene.companyId, scene.firstClientId);
    expect(canonical.unitedWithClientAccountId).toBeNull();

    const searched = await searchClients(scene.companyId, 'EXEMPLU');
    expect(searched.map((client) => client.id)).toEqual([scene.firstClientId]);
  });

  it('refuses to compare dossiers that do not share one exact identifier', async () => {
    const company = await onboardedCompany('PRISMA-PRIM', 'company-a');
    const first = await insertLegacyClient({
      companyId: company.id,
      displayName: 'Exemplu SRL',
      taxId: '1010101010101',
    });
    const second = await insertLegacyClient({
      companyId: company.id,
      displayName: 'Exemplu SRL',
      taxId: '2020202020202',
    });

    const response = await requestComparison(company.id, [first, second]);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      statusCode: 404,
      message: 'Not Found',
    });
  });

  it('returns only the remediation outcome for a group of three dossiers', async () => {
    const company = await onboardedCompany('PRISMA-PRIM', 'company-a');
    const first = await insertLegacyClient({
      companyId: company.id,
      displayName: 'Exemplu SRL',
      taxId: '1010101010101',
    });
    const second = await insertLegacyClient({
      companyId: company.id,
      displayName: 'EXEMPLU SRL',
      taxId: '1010101010101',
    });
    await insertLegacyClient({
      companyId: company.id,
      displayName: 'Exemplu S.R.L.',
      taxId: '1010101010101',
    });

    const response = await requestComparison(company.id, [first, second]);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      outcome: 'multiple_duplicate_candidates_require_data_remediation',
    });
    await expectPersistedComparisonCount(0);
  });

  it('hides the remediation outcome from a resolver without complete authority', async () => {
    const first = await onboardedCompany('PRISMA-PRIM', 'company-a');
    const second = await onboardedCompany('BIC', 'company-b');
    const firstClientId = await insertLegacyClient({
      companyId: first.id,
      displayName: 'Exemplu SRL',
      taxId: '1010101010101',
    });
    const secondClientId = await insertLegacyClient({
      companyId: first.id,
      displayName: 'EXEMPLU SRL',
      taxId: '1010101010101',
    });
    await insertLegacyClient({
      companyId: second.id,
      displayName: 'Exemplu S.R.L.',
      taxId: '1010101010101',
    });
    await revokeDirectorClientAccess(first.directorMembershipId, second.id);

    const response = await requestComparison(first.id, [
      firstClientId,
      secondClientId,
    ]);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      statusCode: 404,
      message: 'Not Found',
    });
  });

  it('denies comparison to a resolver who lacks the bundle in one affected Company', async () => {
    const scene = await twoLegacyDuplicatesAcrossTwoCompanies();
    await revokeDirectorClientAccess(
      scene.directorMembershipId,
      scene.secondCompanyId,
    );

    const response = await requestComparison(scene.firstCompanyId, [
      scene.firstClientId,
      scene.secondClientId,
    ]);
    expect(response.status).toBe(404);
  });

  it('keeps both Companies authorized after a cross-Company union and projects one reference each', async () => {
    const scene = await twoLegacyDuplicatesAcrossTwoCompanies();
    const comparison = await openComparison(scene.firstCompanyId, [
      scene.firstClientId,
      scene.secondClientId,
    ]);
    const union = await confirmUnion(scene.firstCompanyId, {
      comparisonReference: comparison.comparison_reference,
      canonicalClientAccountId: scene.firstClientId,
      fieldSelections: { displayName: scene.firstClientId },
      reason: 'One legal entity registered twice in two provider Companies.',
      confirmedCompanyIds: [scene.firstCompanyId, scene.secondCompanyId],
      idempotencyKey: 'union-cross-company',
    });
    expect(union.affectedCompanyIds.toSorted()).toEqual(
      [scene.firstCompanyId, scene.secondCompanyId].toSorted(),
    );

    for (const companyId of [scene.firstCompanyId, scene.secondCompanyId]) {
      const listed = await listClients(companyId);
      expect(listed.map((client) => client.id)).toEqual([scene.firstClientId]);
    }

    const firstProjections = await readUnionProjections(scene.firstCompanyId);
    const secondProjections = await readUnionProjections(scene.secondCompanyId);
    expect(firstProjections).toHaveLength(1);
    expect(secondProjections).toHaveLength(1);
    expect(firstProjections[0]).toEqual({
      targetType: 'client_union_operation',
      action: 'client.union_confirmed',
      projectionReference: expect.any(String),
      companyId: scene.firstCompanyId,
      actor: 'authorized-resolver',
      companyLocalPosition: 1,
    });
    expect(firstProjections[0]?.projectionReference).not.toBe(
      secondProjections[0]?.projectionReference,
    );
    // The redacted projection carries no correlation key back to the operation.
    expect(JSON.stringify(firstProjections)).not.toContain(
      union.unionOperationId,
    );
  });

  it('places every Contact from both dossiers on the canonical dossier', async () => {
    const company = await onboardedCompany('PRISMA-PRIM', 'company-a');
    const first = await insertLegacyClient({
      companyId: company.id,
      displayName: 'Exemplu SRL',
      taxId: '1010101010101',
      contacts: [{ name: 'Ana Pop' }],
    });
    const second = await insertLegacyClient({
      companyId: company.id,
      displayName: 'Exemplu SRL',
      taxId: '1010101010101',
      contacts: [{ name: 'Ion Rusu' }],
    });

    const comparison = await openComparison(company.id, [first, second]);
    await confirmUnion(company.id, {
      comparisonReference: comparison.comparison_reference,
      canonicalClientAccountId: first,
      fieldSelections: {},
      reason: 'Complementary Contacts for the same registered entity.',
      confirmedCompanyIds: [company.id],
      idempotencyKey: 'union-contacts',
    });

    const dossier = await readDossier(company.id, first);
    expect(dossier.contacts).toEqual([
      { name: 'Ana Pop' },
      { name: 'Ion Rusu' },
    ]);
  });

  it('blocks the whole union when the source-preserving Contact result exceeds the delivered limit', async () => {
    const company = await onboardedCompany('PRISMA-PRIM', 'company-a');
    const first = await insertLegacyClient({
      companyId: company.id,
      displayName: 'Exemplu SRL',
      taxId: '1010101010101',
      contacts: Array.from({ length: 30 }, (_entry, index) => ({
        name: `First Contact ${index}`,
      })),
    });
    const second = await insertLegacyClient({
      companyId: company.id,
      displayName: 'Exemplu SRL',
      taxId: '1010101010101',
      contacts: Array.from({ length: 30 }, (_entry, index) => ({
        name: `Second Contact ${index}`,
      })),
    });

    const comparison = await openComparison(company.id, [first, second]);
    const response = await requestUnion(company.id, {
      comparisonReference: comparison.comparison_reference,
      canonicalClientAccountId: first,
      fieldSelections: {},
      reason: 'Same registered entity with many Contacts.',
      confirmedCompanyIds: [company.id],
      idempotencyKey: 'union-capacity',
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'client_union_contact_capacity_exceeded',
    });
    await expectPersistedUnionCount(0);
    const dossier = await readDossier(company.id, first);
    expect(dossier.contacts).toHaveLength(30);
  });

  it('blocks a union that would need an archived canonical relationship to become active', async () => {
    const scene = await twoLegacyDuplicatesAcrossTwoCompanies();
    await pool.query(
      `INSERT INTO client_company_relationships (
        workspace_id, client_account_id, company_id, status,
        created_by_internal_user_id, created_by_workspace_membership_id
      )
      SELECT $1, $2, $3, 'archived', created_by_internal_user_id,
        created_by_workspace_membership_id
      FROM client_accounts WHERE id = $2`,
      [WORKSPACE_ID, scene.firstClientId, scene.secondCompanyId],
    );

    const comparison = await openComparison(scene.firstCompanyId, [
      scene.firstClientId,
      scene.secondClientId,
    ]);
    const response = await requestUnion(scene.firstCompanyId, {
      comparisonReference: comparison.comparison_reference,
      canonicalClientAccountId: scene.firstClientId,
      fieldSelections: { displayName: scene.firstClientId },
      reason: 'One legal entity registered twice.',
      confirmedCompanyIds: [scene.firstCompanyId, scene.secondCompanyId],
      idempotencyKey: 'union-archived-collision',
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'client_union_blocked',
    });
    await expectPersistedUnionCount(0);
  });

  it('keeps the united identifier reserved against a third registration', async () => {
    const scene = await twoLegacyDuplicatesInOneCompany();
    const comparison = await openComparison(scene.companyId, [
      scene.firstClientId,
      scene.secondClientId,
    ]);
    await confirmUnion(scene.companyId, {
      comparisonReference: comparison.comparison_reference,
      canonicalClientAccountId: scene.firstClientId,
      fieldSelections: { displayName: scene.firstClientId },
      reason: 'Same registered tax identifier.',
      confirmedCompanyIds: [scene.companyId],
      idempotencyKey: 'union-reservation',
    });
    await correctDossier(scene.companyId, scene.firstClientId, {
      expectedVersion: 2,
      taxId: '3030303030303',
    });

    const response = await fetch(`${origin}/api/clients`, {
      method: 'POST',
      headers: {
        ...directorHeaders(scene.companyId),
        'content-type': 'application/json',
        'idempotency-key': 'register-third-with-reserved-id',
      },
      body: JSON.stringify({
        displayName: 'Exemplu Nou SRL',
        taxId: '1010101010101',
      }),
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'possible_duplicate_review_required',
    });
  });

  it('blocks reversal after the canonical dossier changed since the union', async () => {
    const scene = await twoLegacyDuplicatesInOneCompany();
    const comparison = await openComparison(scene.companyId, [
      scene.firstClientId,
      scene.secondClientId,
    ]);
    const union = await confirmUnion(scene.companyId, {
      comparisonReference: comparison.comparison_reference,
      canonicalClientAccountId: scene.firstClientId,
      fieldSelections: { displayName: scene.firstClientId },
      reason: 'Same registered tax identifier.',
      confirmedCompanyIds: [scene.companyId],
      idempotencyKey: 'union-before-correction',
    });
    await correctDossier(scene.companyId, scene.firstClientId, {
      expectedVersion: 2,
      telephone: '+373 22 000 000',
    });

    const response = await requestReversal(scene.companyId, {
      unionOperationId: union.unionOperationId,
      reason: 'The dossiers are distinct after verification.',
      idempotencyKey: 'reverse-after-correction',
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'client_union_reversal_blocked',
    });
  });

  it('replays one union command without creating a second projection and rejects a changed intent', async () => {
    const scene = await twoLegacyDuplicatesInOneCompany();
    const comparison = await openComparison(scene.companyId, [
      scene.firstClientId,
      scene.secondClientId,
    ]);
    const command = {
      comparisonReference: comparison.comparison_reference,
      canonicalClientAccountId: scene.firstClientId,
      fieldSelections: { displayName: scene.firstClientId },
      reason: 'Same registered tax identifier.',
      confirmedCompanyIds: [scene.companyId],
      idempotencyKey: 'union-replayed',
    };
    const first = await confirmUnion(scene.companyId, command);
    const replay = await confirmUnion(scene.companyId, command);
    expect(replay.unionOperationId).toBe(first.unionOperationId);
    expect(await readUnionProjections(scene.companyId)).toHaveLength(1);

    const changed = await requestUnion(scene.companyId, {
      ...command,
      reason: 'A different written reason for the same key.',
    });
    expect(changed.status).toBe(409);
    await expect(changed.json()).resolves.toMatchObject({
      code: 'client_union_changed_intent',
    });
  });

  it('rejects a union whose comparison no longer matches the live dossiers', async () => {
    const scene = await twoLegacyDuplicatesInOneCompany();
    const comparison = await openComparison(scene.companyId, [
      scene.firstClientId,
      scene.secondClientId,
    ]);
    await correctDossier(scene.companyId, scene.secondClientId, {
      expectedVersion: 1,
      telephone: '+373 22 111 111',
    });

    const response = await requestUnion(scene.companyId, {
      comparisonReference: comparison.comparison_reference,
      canonicalClientAccountId: scene.firstClientId,
      fieldSelections: { displayName: scene.firstClientId },
      reason: 'Same registered tax identifier.',
      confirmedCompanyIds: [scene.companyId],
      idempotencyKey: 'union-stale-comparison',
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'client_union_comparison_stale',
    });
    await expectPersistedUnionCount(0);
  });

  async function onboardedCompany(displayName: string, key: string) {
    const company = await registerCompany(displayName, key);
    const director = await invitedDirector();
    await grantCompanyContext(director.membershipId, company.id);
    await grantDirectorClientAccess(director.membershipId, company.id);
    return { id: company.id, directorMembershipId: director.membershipId };
  }

  async function twoLegacyDuplicatesInOneCompany() {
    const company = await onboardedCompany('PRISMA-PRIM', 'company-a');
    const firstClientId = await insertLegacyClient({
      companyId: company.id,
      displayName: 'Exemplu SRL',
      taxId: '1010101010101',
    });
    const secondClientId = await insertLegacyClient({
      companyId: company.id,
      displayName: 'EXEMPLU S.R.L.',
      taxId: '1010101010101',
    });
    return { companyId: company.id, firstClientId, secondClientId };
  }

  async function twoLegacyDuplicatesAcrossTwoCompanies() {
    const first = await onboardedCompany('PRISMA-PRIM', 'company-a');
    const second = await onboardedCompany('BIC', 'company-b');
    const firstClientId = await insertLegacyClient({
      companyId: first.id,
      displayName: 'Exemplu SRL',
      taxId: '1010101010101',
    });
    const secondClientId = await insertLegacyClient({
      companyId: second.id,
      displayName: 'EXEMPLU S.R.L.',
      taxId: '1010101010101',
    });
    return {
      firstCompanyId: first.id,
      secondCompanyId: second.id,
      directorMembershipId: first.directorMembershipId,
      firstClientId,
      secondClientId,
    };
  }

  async function insertLegacyClient(options: {
    companyId: string;
    displayName: string;
    taxId: string;
    contacts?: Array<{ name: string }>;
  }): Promise<string> {
    const owner = await currentActor(options.companyId);
    const inserted = await pool.query<{ id: string }>(
      `WITH created_client AS (
        INSERT INTO client_accounts (
          workspace_id, display_name, tax_id, contacts,
          created_by_internal_user_id, created_by_workspace_membership_id
        )
        VALUES ($1, $2, $3, $7::jsonb, $4, $5)
        RETURNING id
      ), created_relationship AS (
        INSERT INTO client_company_relationships (
          workspace_id, client_account_id, company_id,
          created_by_internal_user_id, created_by_workspace_membership_id
        )
        SELECT $1, created_client.id, $6, $4, $5 FROM created_client
        RETURNING client_account_id
      )
      SELECT created_relationship.client_account_id AS id
      FROM created_relationship`,
      [
        WORKSPACE_ID,
        options.displayName,
        options.taxId,
        owner.internalUserId,
        owner.workspaceMembershipId,
        options.companyId,
        JSON.stringify(options.contacts ?? []),
      ],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error('Expected one legacy Client Account.');
    return id;
  }

  function requestComparison(companyId: string, clientAccountIds: string[]) {
    return fetch(`${origin}/api/client-union-comparisons`, {
      method: 'POST',
      headers: {
        ...directorHeaders(companyId),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ clientAccountIds }),
    });
  }

  async function openComparison(companyId: string, clientAccountIds: string[]) {
    const response = await requestComparison(companyId, clientAccountIds);
    expect(response.status).toBe(201);
    const body: unknown = await response.json();
    if (
      !isRecord(body) ||
      typeof body.comparison_reference !== 'string' ||
      !Array.isArray(body.clients)
    ) {
      throw new Error('Expected one existing-dossier comparison.');
    }
    return {
      outcome: body.outcome,
      comparison_reference: body.comparison_reference,
      clients: body.clients.map((client) => {
        if (!isRecord(client) || typeof client.id !== 'string') {
          throw new Error('Expected one compared Client dossier.');
        }
        return { id: client.id };
      }),
    };
  }

  async function confirmUnion(
    companyId: string,
    command: {
      comparisonReference: string;
      canonicalClientAccountId: string;
      fieldSelections: Record<string, string>;
      reason: string;
      confirmedCompanyIds: string[];
      idempotencyKey: string;
    },
  ) {
    const response = await requestUnion(companyId, command);
    expect(response.status).toBe(201);
    return expectUnionOperation(await response.json());
  }

  function requestUnion(
    companyId: string,
    command: {
      comparisonReference: string;
      canonicalClientAccountId: string;
      fieldSelections: Record<string, string>;
      reason: string;
      confirmedCompanyIds: string[];
      idempotencyKey: string;
    },
  ) {
    const { idempotencyKey, ...body } = command;
    return fetch(`${origin}/api/client-unions`, {
      method: 'POST',
      headers: {
        ...directorHeaders(companyId),
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(body),
    });
  }

  async function reverseUnion(
    companyId: string,
    command: {
      unionOperationId: string;
      reason: string;
      idempotencyKey: string;
    },
  ) {
    const response = await requestReversal(companyId, command);
    expect(response.status).toBe(201);
    return expectUnionOperation(await response.json());
  }

  function requestReversal(
    companyId: string,
    command: {
      unionOperationId: string;
      reason: string;
      idempotencyKey: string;
    },
  ) {
    return fetch(
      `${origin}/api/client-unions/${command.unionOperationId}/reversal`,
      {
        method: 'POST',
        headers: {
          ...directorHeaders(companyId),
          'content-type': 'application/json',
          'idempotency-key': command.idempotencyKey,
        },
        body: JSON.stringify({ reason: command.reason }),
      },
    );
  }

  function expectUnionOperation(body: unknown) {
    if (
      !isRecord(body) ||
      typeof body.unionOperationId !== 'string' ||
      typeof body.canonicalClientAccountId !== 'string' ||
      typeof body.supersededClientAccountId !== 'string' ||
      !Array.isArray(body.affectedCompanyIds) ||
      (body.status !== 'confirmed' && body.status !== 'reversed')
    ) {
      throw new Error('Expected one restricted union operation record.');
    }
    return {
      unionOperationId: body.unionOperationId,
      canonicalClientAccountId: body.canonicalClientAccountId,
      supersededClientAccountId: body.supersededClientAccountId,
      affectedCompanyIds: body.affectedCompanyIds.filter(
        (companyId): companyId is string => typeof companyId === 'string',
      ),
      status: body.status,
    };
  }

  async function listClients(companyId: string) {
    const response = await fetch(`${origin}/api/clients`, {
      headers: directorHeaders(companyId),
    });
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new Error('Expected one Client list.');
    return body.map((client) => {
      if (!isRecord(client) || typeof client.id !== 'string') {
        throw new Error('Expected one listed Client.');
      }
      return { id: client.id };
    });
  }

  async function readDossier(companyId: string, clientAccountId: string) {
    const response = await fetch(`${origin}/api/clients/${clientAccountId}`, {
      headers: directorHeaders(companyId),
    });
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    if (!isRecord(body) || !Array.isArray(body.contacts)) {
      throw new Error('Expected one Client dossier.');
    }
    return {
      contacts: body.contacts,
      taxId: body.taxId,
      displayName: body.displayName,
      version: body.version,
      unitedWithClientAccountId: body.unitedWithClientAccountId,
    };
  }

  async function searchClients(companyId: string, query: string) {
    const response = await fetch(
      `${origin}/api/clients/search?query=${encodeURIComponent(query)}`,
      { headers: directorHeaders(companyId) },
    );
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    if (!Array.isArray(body))
      throw new Error('Expected one search result set.');
    return body.map((client) => {
      if (!isRecord(client) || typeof client.id !== 'string') {
        throw new Error('Expected one searched Client.');
      }
      return { id: client.id };
    });
  }

  async function correctDossier(
    companyId: string,
    clientAccountId: string,
    changes: Record<string, unknown>,
  ) {
    const response = await fetch(`${origin}/api/clients/${clientAccountId}`, {
      method: 'PATCH',
      headers: {
        ...directorHeaders(companyId),
        'content-type': 'application/json',
        'idempotency-key': `correct-${clientAccountId}-${String(changes.expectedVersion)}`,
      },
      body: JSON.stringify(changes),
    });
    expect(response.status).toBe(200);
    return response.json();
  }

  async function readUnionProjections(companyId: string) {
    const response = await fetch(`${origin}/api/activity-log`, {
      headers: directorHeaders(companyId),
    });
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    if (!isRecord(body) || !Array.isArray(body.clientUnionOperations)) {
      throw new Error('Expected one Activity Log page.');
    }
    return body.clientUnionOperations.map((projection) => {
      if (!isRecord(projection)) {
        throw new Error('Expected one redacted union projection.');
      }
      return projection;
    });
  }

  async function expectPersistedUnionCount(expected: number) {
    const result = await pool.query<{ count: string }>(
      'SELECT count(*) FROM client_union_operations',
    );
    expect(result.rows[0]?.count).toBe(String(expected));
  }

  async function expectPersistedComparisonCount(expected: number) {
    const result = await pool.query<{ count: string }>(
      'SELECT count(*) FROM client_union_comparisons',
    );
    expect(result.rows[0]?.count).toBe(String(expected));
  }

  async function revokeDirectorClientAccess(
    workspaceMembershipId: string,
    companyId: string,
  ) {
    const response = await fetch(
      `${origin}/api/company-director-client-assignments/${workspaceMembershipId}/${companyId}`,
      {
        method: 'DELETE',
        headers: {
          ...identityHeaders('workspace-owner', 'Workspace Owner'),
          'idempotency-key': `revoke-${workspaceMembershipId}-${companyId}`,
        },
      },
    );
    expect(response.status).toBe(200);
  }

  async function registerCompany(displayName: string, key: string) {
    const response = await fetch(`${origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...identityHeaders('workspace-owner', 'Workspace Owner'),
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify({ displayName }),
    });
    expect(response.status).toBe(201);
    const body: unknown = await response.json();
    if (!isRecord(body) || typeof body.id !== 'string') {
      throw new Error('Expected one registered Company.');
    }
    return { id: body.id };
  }

  async function invitedDirector() {
    const response = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders('workspace-member', 'Company Director'),
    });
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    if (!isRecord(body) || typeof body.workspaceMembershipId !== 'string') {
      throw new Error('Expected one invited Workspace Membership.');
    }
    return { membershipId: body.workspaceMembershipId };
  }

  async function currentActor(companyId: string) {
    const response = await fetch(`${origin}/api/access/current-actor`, {
      headers: ownerHeaders(companyId),
    });
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    if (
      !isRecord(body) ||
      typeof body.internalUserId !== 'string' ||
      typeof body.workspaceMembershipId !== 'string'
    ) {
      throw new Error('Expected the current actor identity.');
    }
    return {
      internalUserId: body.internalUserId,
      workspaceMembershipId: body.workspaceMembershipId,
    };
  }

  async function grantCompanyContext(
    workspaceMembershipId: string,
    companyId: string,
  ) {
    const response = await fetch(`${origin}/api/company-context-assignments`, {
      method: 'POST',
      headers: {
        ...identityHeaders('workspace-owner', 'Workspace Owner'),
        'content-type': 'application/json',
        'idempotency-key': `grant-${workspaceMembershipId}-${companyId}`,
      },
      body: JSON.stringify({ workspaceMembershipId, companyId }),
    });
    expect(response.status).toBe(201);
  }

  async function grantDirectorClientAccess(
    workspaceMembershipId: string,
    companyId: string,
  ) {
    const response = await fetch(
      `${origin}/api/company-director-client-assignments`,
      {
        method: 'POST',
        headers: {
          ...identityHeaders('workspace-owner', 'Workspace Owner'),
          'content-type': 'application/json',
          'idempotency-key': `director-${workspaceMembershipId}-${companyId}`,
        },
        body: JSON.stringify({ workspaceMembershipId, companyId }),
      },
    );
    expect(response.status).toBe(201);
  }

  function ownerHeaders(companyId: string) {
    return {
      ...identityHeaders('workspace-owner', 'Workspace Owner'),
      'x-company-context-id': companyId,
    };
  }

  function directorHeaders(companyId: string) {
    return {
      ...identityHeaders('workspace-member', 'Company Director'),
      'x-company-context-id': companyId,
    };
  }

  function identityHeaders(subject: string, displayName: string) {
    return {
      'x-test-external-provider': 'deterministic-test',
      'x-test-external-subject': subject,
      'x-test-display-name': displayName,
      'x-test-email': `${subject}@example.test`,
    };
  }
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
