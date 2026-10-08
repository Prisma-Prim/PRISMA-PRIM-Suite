import { createServer } from 'node:http';
import type { Pool } from 'pg';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { commandFingerprint } from '../pricing-configuration/pricing-configuration-publication.js';
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
const withPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000456';
const OWNER = memberHeaders('workspace-owner');
const ASSIGNMENTS = [
  '/company-director-client-assignments',
  '/company-service-catalogue-assignments',
  '/company-pricing-configuration-assignments',
  '/company-commercial-intake-assignments',
  '/company-pricing-user-assignments',
  '/company-offer-preparer-assignments',
] as const;
let instant = new Date('2026-09-27T09:00:00.000Z');
interface PreparedOffer {
  companyId: string;
  requestId: string;
  opportunityId: string;
  clientId: string;
  snapshotId: string;
  actorMembershipId: string;
  ruleVersionNumber: number;
  offeringId: string;
  tariffVersionNumber: number;
}
withPostgres('First illustrative Contract REST', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let origin: string;
  let pool: Pool;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'first_contract',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      serverClock: { now: () => new Date(instant) },
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Synthetic Contract Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'contract-reader',
            workspaceId: WORKSPACE_ID,
          },
        ]),
      },
    });
    ({ origin, pool } = harness);
  });
  beforeEach(async () => {
    instant = new Date('2026-09-27T09:00:00.000Z');
    await pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });
  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });
  it('lets an independent approver decide the exact version with fresh warnings and unchanged representation', async () => {
    const { fixture, created, base, versionId } = await qualityFixture({
      specialConditions: 'Synthetic additional conditions',
    });
    const reader = record(
      await json(
        await request({
          path: '/access/current-actor',
          init: { headers: memberHeaders('contract-reader') },
        }),
      ),
    );
    const membershipId = stringField(reader, 'workspaceMembershipId');
    for (const route of [
      '/company-context-assignments',
      '/company-commercial-intake-assignments',
      '/company-contract-approver-assignments',
    ]) {
      await command({
        path: route,
        body: {
          workspaceMembershipId: membershipId,
          companyId: fixture.companyId,
        },
        key: 'approver-' + route,
      });
    }
    const active = record(
      record(
        await json(
          await request({
            path: '/access/current-actor',
            companyId: fixture.companyId,
            init: { headers: memberHeaders('contract-reader') },
          }),
        ),
      ).activeCompany,
    );
    expect(active.contractPermissions).toEqual([
      'commercial.contract.read',
      'commercial.contract.approve',
      'commercial.contract.signature.record',
    ]);
    expect(active.contractApproverPermissionSetVersion).toBe('v1');
    expect(active.contractPermissionAssignmentId).toBeUndefined();
    expect(active.clientPermissions).toEqual([]);
    for (const field of [
      'offerPermissions',
      'pricingUserPermissions',
      'pricingConfigurationPermissions',
    ])
      expect(active[field]).toBeUndefined();
    expect(
      (
        await request({
          path: '/company-contract-approver-assignments',
          init: {
            method: 'POST',
            headers: {
              ...memberHeaders('contract-reader'),
              'content-type': 'application/json',
              'idempotency-key': 'forbidden-admin',
            },
            body: JSON.stringify({
              workspaceMembershipId: membershipId,
              companyId: fixture.companyId,
            }),
          },
        })
      ).status,
    ).toBe(403);
    const target = base + '/versions/' + versionId;
    const decision = await request({
      path: target + '/approve',
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          ...memberHeaders('contract-reader'),
          'content-type': 'application/json',
          'idempotency-key': 'approve-exact',
        },
        body: JSON.stringify({
          expectedContractRevision: 1,
          acknowledgedWarningCodes: ['ADDED_CONDITIONS_CONFIRMED'],
        }),
      },
    });
    expect(decision.status).toBe(201);
    const result = record(await json(decision));
    expect(result).toMatchObject({
      revision: 2,
      actorWorkspaceMembershipId: membershipId,
      decidedAt: instant.toISOString(),
      kind: 'APPROVE',
    });
    const reload = record(
      record(
        await json(
          await request({
            path: base,
            companyId: fixture.companyId,
            init: { headers: memberHeaders('contract-reader') },
          }),
        ),
      ).contract,
    );
    expect(reload).toMatchObject({
      revision: 2,
      version: { decisionState: 'APPROVED', decision: result },
    });
    expect(record(reload.version).representation).toEqual(
      record(created.version).representation,
    );
    expect(reload.clientReference).toBeUndefined();
  });

  it('rejects without quality gating, preserves the reason and refuses a second decision', async () => {
    const { fixture, created, base, versionId } = await qualityFixture();
    await grantApprover(fixture);
    for (const payload of [
      { expectedContractRevision: 0, acknowledgedWarningCodes: [] },
      {
        expectedContractRevision: 1,
        acknowledgedWarningCodes: ['PARTY_AVAILABLE'],
      },
      {
        expectedContractRevision: 1,
        acknowledgedWarningCodes: [
          'ADDED_CONDITIONS_CONFIRMED',
          'ADDED_CONDITIONS_CONFIRMED',
        ],
      },
      {
        expectedContractRevision: 1,
        acknowledgedWarningCodes: [],
        unexpected: true,
      },
    ])
      expect(
        (
          await decisionRequest(
            fixture,
            versionId,
            'approve',
            payload,
            'invalid-approval',
          )
        ).status,
      ).toBe(400);
    await pool.query(
      "UPDATE client_accounts SET status='archived' WHERE id=$1",
      [fixture.clientId],
    );
    expect(
      (
        await decisionRequest(
          fixture,
          versionId,
          'reject',
          { expectedContractRevision: 1, reason: '  ' },
          'invalid-reject',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await decisionRequest(
          fixture,
          versionId,
          'reject',
          { expectedContractRevision: 1, reason: 'x'.repeat(501) },
          'long-reject',
        )
      ).status,
    ).toBe(400);
    const reason = 'Synthetic rejection reason\nkept exactly';
    const original = await json(
      await decisionRequest(
        fixture,
        versionId,
        'reject',
        { expectedContractRevision: 1, reason },
        'reject-exact',
      ),
    );
    expect(original).toMatchObject({ kind: 'REJECT', revision: 2, reason });
    const stored = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    expect(record(stored.version).decision).toEqual(original);
    expect(record(stored.version).representation).toEqual(
      record(created.version).representation,
    );
    expect(
      await json(
        await request({
          path: base + '/versions/' + versionId + '/quality-checks',
          companyId: fixture.companyId,
        }),
      ),
    ).toMatchObject({ items: [] });
    expect(
      await json(
        await decisionRequest(
          fixture,
          versionId,
          'reject',
          { expectedContractRevision: 2, reason: 'second' },
          'second-reject',
        ),
      ),
    ).toMatchObject({ code: 'CONTRACT_VERSION_ALREADY_DECIDED' });
    expect(
      await json(
        await decisionRequest(
          fixture,
          versionId,
          'approve',
          { expectedContractRevision: 1, acknowledgedWarningCodes: [] },
          'obsolete',
        ),
      ),
    ).toMatchObject({ code: 'STALE_CONTRACT_REVISION' });
    expect(
      await json(
        await decisionRequest(
          fixture,
          versionId,
          'reject',
          { expectedContractRevision: 1, reason },
          'reject-exact',
        ),
      ),
    ).toEqual(original);
    expect(
      await json(
        await decisionRequest(
          fixture,
          versionId,
          'reject',
          { expectedContractRevision: 1, reason: 'changed' },
          'reject-exact',
        ),
      ),
    ).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const events = await pool.query<{ action: string; metadata: unknown }>(
      'SELECT action,metadata FROM contract_events ORDER BY occurred_at,action',
    );
    expect(
      events.rows.filter((row) => row.action === 'contract_version.rejected'),
    ).toHaveLength(1);
    expect(JSON.stringify(events.rows)).not.toContain(reason);
    expect(
      (
        await pool.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM contract_quality_runs',
        )
      ).rows[0]?.count,
    ).toBe('0');
  });

  it('requires fresh errors and exact current warnings without storing failed approval attempts', async () => {
    const { fixture, created, versionId, path } = await qualityFixture({
      termEndsOn: '2026-09-27',
    });
    await grantApprover(fixture);
    const reviewed = record(
      await command({
        path,
        body: {},
        key: 'review',
        companyId: fixture.companyId,
      }),
    );
    expect(reviewed.results).toContainEqual({
      code: 'TERM_END_NOT_PASSED',
      status: 'PASS',
    });
    instant = new Date('2026-09-28T09:00:00.000Z');
    const payload = {
      expectedContractRevision: 1,
      acknowledgedWarningCodes: ['ADDED_CONDITIONS_CONFIRMED'],
    };
    expect(
      await json(
        await decisionRequest(fixture, versionId, 'approve', payload, 'fresh'),
      ),
    ).toMatchObject({ code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED' });
    expect(
      (
        await pool.query<{ runs: string; decisions: string }>(
          'SELECT (SELECT count(*) FROM contract_quality_runs)::text AS runs,(SELECT count(*) FROM contract_decisions)::text AS decisions',
        )
      ).rows[0],
    ).toEqual({ runs: '1', decisions: '0' });
    await pool.query(
      "UPDATE client_accounts SET status='archived' WHERE id=$1",
      [fixture.clientId],
    );
    expect(
      await json(
        await decisionRequest(
          fixture,
          versionId,
          'approve',
          {
            ...payload,
            acknowledgedWarningCodes: [
              'ADDED_CONDITIONS_CONFIRMED',
              'TERM_END_NOT_PASSED',
            ],
          },
          'errors',
        ),
      ),
    ).toMatchObject({ code: 'QUALITY_CHECK_ERRORS' });
    await pool.query("UPDATE client_accounts SET status='active' WHERE id=$1", [
      fixture.clientId,
    ]);
    const result = record(
      await json(
        await decisionRequest(
          fixture,
          versionId,
          'approve',
          {
            ...payload,
            acknowledgedWarningCodes: [
              'TERM_END_NOT_PASSED',
              'ADDED_CONDITIONS_CONFIRMED',
            ],
          },
          'fresh',
        ),
      ),
    );
    expect(result).toMatchObject({
      kind: 'APPROVE',
      decidedAt: instant.toISOString(),
      representationChecksum: record(record(created.version).representation)
        .sha256,
      acknowledgedWarningCodes: [
        'ADDED_CONDITIONS_CONFIRMED',
        'TERM_END_NOT_PASSED',
      ],
    });
    expect(record(result.qualityRun).id).not.toBe(reviewed.id);
    expect(record(result.qualityRun).evaluatedAt).toBe(instant.toISOString());
    instant = new Date('2026-10-07T09:00:00.000Z');
    await command({
      path,
      body: {},
      key: 'after-approval-review',
      companyId: fixture.companyId,
    });
    expect(
      await json(
        await decisionRequest(
          fixture,
          versionId,
          'approve',
          {
            ...payload,
            acknowledgedWarningCodes: [
              'TERM_END_NOT_PASSED',
              'ADDED_CONDITIONS_CONFIRMED',
            ],
          },
          'fresh',
        ),
      ),
    ).toEqual(result);
  });

  it('serializes competing decisions, rechecks revocation on replay and rolls back failed events', async () => {
    const { fixture, created, base, versionId } = await qualityFixture();
    await grantApprover(fixture);
    const payload = {
      expectedContractRevision: 1,
      acknowledgedWarningCodes: [],
    };
    await pool.query(
      "CREATE FUNCTION fail_c4_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic decision event failure'; END; $$; CREATE TRIGGER fail_c4_event BEFORE INSERT ON contract_events FOR EACH ROW EXECUTE FUNCTION fail_c4_event()",
    );
    try {
      expect(
        await json(
          await decisionRequest(
            fixture,
            versionId,
            'approve',
            payload,
            'atomic',
          ),
        ),
      ).toMatchObject({ code: 'CONTRACT_DECISION_UNCERTAIN' });
      const stored = record(
        record(
          await json(
            await request({ path: base, companyId: fixture.companyId }),
          ),
        ).contract,
      );
      expect(stored).toEqual(created);
      expect(
        (
          await pool.query<{ count: string }>(
            'SELECT ((SELECT count(*) FROM contract_decisions)+(SELECT count(*) FROM contract_quality_runs))::text AS count',
          )
        ).rows[0]?.count,
      ).toBe('0');
    } finally {
      await pool.query(
        'DROP TRIGGER fail_c4_event ON contract_events; DROP FUNCTION fail_c4_event()',
      );
    }
    const decisions = await Promise.all([
      decisionRequest(fixture, versionId, 'approve', payload, 'atomic'),
      decisionRequest(
        fixture,
        versionId,
        'reject',
        {
          expectedContractRevision: 1,
          reason: 'Synthetic concurrent rejection',
        },
        'competing',
      ),
    ]);
    expect(decisions.map((value) => value.status).sort()).toEqual([201, 409]);
    const winner = decisions.find((response) => response.status === 201);
    if (!winner) throw new Error('Missing decision winner');
    const recorded = record(await json(winner));
    const kind = recorded.kind === 'APPROVE' ? 'approve' : 'reject';
    const body =
      kind === 'approve'
        ? payload
        : {
            expectedContractRevision: 1,
            reason: 'Synthetic concurrent rejection',
          };
    const key = kind === 'approve' ? 'atomic' : 'competing';
    const identical = await Promise.all([
      decisionRequest(fixture, versionId, kind, body, key),
      decisionRequest(fixture, versionId, kind, body, key),
    ]);
    expect(identical.map((response) => response.status)).toEqual([201, 201]);
    for (const response of identical)
      expect(await json(response)).toEqual(recorded);
    expect(
      (
        await pool.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM contract_decisions',
        )
      ).rows[0]?.count,
    ).toBe('1');
    await request({
      path:
        '/company-contract-approver-assignments/' +
        fixture.actorMembershipId +
        '/' +
        fixture.companyId,
      init: {
        method: 'DELETE',
        headers: { 'idempotency-key': 'revoke-decision' },
      },
    });
    expect(
      (await decisionRequest(fixture, versionId, kind, body, key)).status,
    ).toBe(403);
  });

  it('fails closed for captured approver versions and each independent prerequisite without leaking targets', async () => {
    const { fixture, versionId } = await qualityFixture();
    const route =
      '/contracts/opportunities/' +
      fixture.opportunityId +
      '/versions/' +
      versionId +
      '/approve';
    const body = { expectedContractRevision: 1, acknowledgedWarningCodes: [] };
    const send = (
      companyId = fixture.companyId,
      path = route,
      headers: Record<string, string> = {},
    ) =>
      request({
        path,
        companyId,
        init: {
          method: 'POST',
          headers: {
            ...headers,
            'content-type': 'application/json',
            'idempotency-key': 'denied-key',
          },
          body: JSON.stringify(body),
        },
      });
    expect((await send()).status).toBe(403);
    await grantApprover(fixture);
    await expect(
      pool.query(
        "INSERT INTO company_role_assignments(workspace_id,company_id,workspace_membership_id,bundle,permission_set_version) VALUES($1,$2,$3,'company_contract_approver',NULL)",
        [WORKSPACE_ID, fixture.companyId, fixture.actorMembershipId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const [constraint] = (
      await pool.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
      )
    ).rows;
    if (!constraint) throw new Error('Missing captured version constraint.');
    await pool.query(
      'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
    );
    try {
      for (const version of [null, 'v999']) {
        await pool.query(
          "UPDATE company_role_assignments SET permission_set_version=$1 WHERE workspace_id=$2 AND company_id=$3 AND bundle='company_contract_approver'",
          [version, WORKSPACE_ID, fixture.companyId],
        );
        expect((await send()).status).toBe(403);
      }
    } finally {
      await pool.query(
        "UPDATE company_role_assignments SET permission_set_version='v1' WHERE workspace_id=$1 AND company_id=$2 AND bundle='company_contract_approver'",
        [WORKSPACE_ID, fixture.companyId],
      );
      await pool.query(
        'ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ' +
          constraint.definition,
      );
    }
    const unknown = await send(
      fixture.companyId,
      route.replace(versionId, '00000000-0000-4000-8000-000000000999'),
    );
    expect(unknown.status).toBe(404);
    const safe = await json(unknown);
    const other = await acceptedOffer({ suffix: 'other-decision' });
    await grantApprover(other);
    const hidden = await send(other.companyId);
    expect(hidden.status).toBe(404);
    expect(await json(hidden)).toEqual(safe);
    expect(
      (
        await send(fixture.companyId, route, {
          'x-workspace-context-id': '00000000-0000-4000-8000-000000000999',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(origin + '/api' + route, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-company-context-id': fixture.companyId,
          },
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(401);
    const reader = record(
      await json(
        await request({
          path: '/access/current-actor',
          init: { headers: memberHeaders('contract-reader') },
        }),
      ),
    );
    const independentMembershipId = stringField(
      reader,
      'workspaceMembershipId',
    );
    for (const bundle of [
      'company-context',
      'company-commercial-intake',
      'company-contract-approver',
    ])
      await command({
        path: '/' + bundle + '-assignments',
        body: {
          workspaceMembershipId: independentMembershipId,
          companyId: fixture.companyId,
        },
        key: 'independent-' + bundle,
      });
    for (const bundle of ['company-commercial-intake', 'company-context']) {
      expect(
        (
          await request({
            path:
              '/' +
              bundle +
              '-assignments/' +
              independentMembershipId +
              '/' +
              fixture.companyId,
            init: {
              method: 'DELETE',
              headers: { 'idempotency-key': 'revoke-' + bundle },
            },
          })
        ).status,
      ).toBe(200);
      expect(
        (await send(fixture.companyId, route, memberHeaders('contract-reader')))
          .status,
      ).toBe(403);
      await command({
        path: '/' + bundle + '-assignments',
        body: {
          workspaceMembershipId: independentMembershipId,
          companyId: fixture.companyId,
        },
        key: 'restore-independent-' + bundle,
      });
    }
    expect(
      (
        await pool.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM contract_decisions',
        )
      ).rows[0]?.count,
    ).toBe('0');
  });

  it('orders decision authority before a concurrent revocation and denies replay after revocation', async () => {
    const { fixture, versionId } = await qualityFixture();
    await grantApprover(fixture);
    const blocker = await pool.connect();
    let pending: Promise<Response> | undefined;
    let revoked: Promise<Response> | undefined;
    try {
      await blocker.query('BEGIN');
      const {
        rows: [identity],
      } = await blocker.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      if (!identity) throw new Error('Missing blocker');
      await blocker.query(
        'SELECT id FROM client_accounts WHERE id=$1 FOR UPDATE',
        [fixture.clientId],
      );
      pending = decisionRequest(
        fixture,
        versionId,
        'approve',
        { expectedContractRevision: 1, acknowledgedWarningCodes: [] },
        'fenced-approval',
      );
      const decisionPid = await waitForBlocker(identity.pid);
      revoked = request({
        path:
          '/company-contract-approver-assignments/' +
          fixture.actorMembershipId +
          '/' +
          fixture.companyId,
        init: {
          method: 'DELETE',
          headers: { 'idempotency-key': 'concurrent-approver-revoke' },
        },
      });
      await waitForBlocker(decisionPid);
      await blocker.query('COMMIT');
      expect((await pending).status).toBe(201);
      expect((await revoked).status).toBe(200);
      expect(
        (
          await decisionRequest(
            fixture,
            versionId,
            'approve',
            { expectedContractRevision: 1, acknowledgedWarningCodes: [] },
            'fenced-approval',
          )
        ).status,
      ).toBe(403);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await Promise.allSettled(
        [pending, revoked].filter((value) => value !== undefined),
      );
    }
  });

  it('evaluates current Client availability after its owner fence, storing no approval on invalidation', async () => {
    const { fixture, versionId } = await qualityFixture();
    await grantApprover(fixture);
    const blocker = await pool.connect();
    let pending: Promise<Response> | undefined;
    try {
      await blocker.query('BEGIN');
      const {
        rows: [identity],
      } = await blocker.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      if (!identity) throw new Error('Missing blocker');
      await blocker.query(
        "UPDATE client_accounts SET status='archived' WHERE id=$1",
        [fixture.clientId],
      );
      pending = decisionRequest(
        fixture,
        versionId,
        'approve',
        { expectedContractRevision: 1, acknowledgedWarningCodes: [] },
        'invalidated-approval',
      );
      await waitForBlocker(identity.pid);
      await blocker.query('COMMIT');
      expect(await json(await pending)).toMatchObject({
        code: 'QUALITY_CHECK_ERRORS',
      });
      expect(
        (
          await pool.query<{ count: string }>(
            'SELECT ((SELECT count(*) FROM contract_decisions)+(SELECT count(*) FROM contract_quality_runs))::text AS count',
          )
        ).rows[0]?.count,
      ).toBe('0');
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      if (pending) await Promise.allSettled([pending]);
    }
  });

  it('converges an identical retry after the HTTP acknowledgement is lost following commit', async () => {
    const { fixture, versionId, base } = await qualityFixture();
    await grantApprover(fixture);
    const payload = {
      expectedContractRevision: 1,
      acknowledgedWarningCodes: [],
    };
    const proxy = createServer(async (incoming, outgoing) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of incoming) {
          if (!Buffer.isBuffer(chunk)) throw new Error('Unexpected proxy body');
          chunks.push(chunk);
        }
        const committed = await fetch(
          origin + '/api' + base + '/versions/' + versionId + '/approve',
          {
            method: 'POST',
            headers: {
              ...OWNER,
              'x-company-context-id': fixture.companyId,
              'content-type': 'application/json',
              'idempotency-key': 'lost-ack',
            },
            body: Buffer.concat(chunks),
          },
        );
        await committed.arrayBuffer();
        outgoing.destroy();
      } catch {
        outgoing.destroy();
      }
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing proxy port');
    try {
      await expect(
        fetch('http://127.0.0.1:' + address.port, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      ).rejects.toThrow();
      const stored = record(
        record(
          await json(
            await request({ path: base, companyId: fixture.companyId }),
          ),
        ).contract,
      );
      expect(stored.revision).toBe(2);
      const decision = record(record(stored.version).decision);
      instant = new Date('2026-10-09T12:00:00.000Z');
      expect(
        await json(
          await decisionRequest(
            fixture,
            versionId,
            'approve',
            payload,
            'lost-ack',
          ),
        ),
      ).toEqual(decision);
      expect(
        (
          await pool.query<{ decisions: string; runs: string; events: string }>(
            "SELECT (SELECT count(*) FROM contract_decisions)::text AS decisions,(SELECT count(*) FROM contract_quality_runs)::text AS runs,(SELECT count(*) FROM contract_events WHERE action='contract_version.approved')::text AS events",
          )
        ).rows[0],
      ).toEqual({ decisions: '1', runs: '1', events: '1' });
      for (const mutation of [
        "UPDATE contract_decisions SET reason='changed'",
        'DELETE FROM contract_decisions',
        'UPDATE contracts SET revision=1',
        "UPDATE contract_versions SET decision_state='PENDING'",
      ])
        await expect(pool.query(mutation)).rejects.toMatchObject({
          code: '23514',
        });
    } finally {
      proxy.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        proxy.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('runs and reopens attributed checks on the exact persisted Contract Version', async () => {
    const fixture = await acceptedOffer();
    await grantContract(fixture, 'grant-quality');
    const base = '/contracts/opportunities/' + fixture.opportunityId;
    const created = record(
      await command({
        path: base,
        body: await contractPayload(fixture),
        key: 'create-quality',
        companyId: fixture.companyId,
      }),
    );
    const versionId = stringField(record(created.version), 'id');
    const path = base + '/versions/' + versionId + '/quality-checks';
    const run = record(
      await command({
        path,
        body: {},
        key: 'run-quality',
        companyId: fixture.companyId,
      }),
    );
    expect(run).toMatchObject({
      contractVersionId: versionId,
      ruleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
      ruleSetVersion: 1,
      actorWorkspaceMembershipId: fixture.actorMembershipId,
      evaluatedAt: '2026-09-27T09:00:00.000Z',
    });
    expect(run.results).toEqual([
      { code: 'SOURCE_COMPANY_MATCHES', status: 'PASS' },
      { code: 'PARTY_AVAILABLE', status: 'PASS' },
      { code: 'PARTY_MATCHES_SOURCE', status: 'PASS' },
      { code: 'PARTY_IDENTITY_MATCHES_SOURCE', status: 'PASS' },
      { code: 'PARTY_IDENTITY_CURRENT', status: 'PASS' },
      { code: 'PARTY_TAX_ID_RECORDED', status: 'PASS' },
      { code: 'PRICE_MATCHES_ACCEPTED_OFFER', status: 'PASS' },
      { code: 'PRICING_SNAPSHOT_COHERENT', status: 'PASS' },
      { code: 'CONDITIONS_MATCH_ACCEPTED_OFFER', status: 'PASS' },
      { code: 'ADDED_CONDITIONS_CONFIRMED', status: 'PASS' },
      { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
    ]);
    expect(
      await command({
        path,
        body: {},
        key: 'run-quality',
        companyId: fixture.companyId,
      }),
    ).toEqual(run);
    expect(
      await json(
        await request({
          path: path + '/' + stringField(run, 'id'),
          companyId: fixture.companyId,
        }),
      ),
    ).toEqual(run);
    const reloaded = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    expect(record(reloaded.version).latestQualityRun).toEqual(run);
    expect({ ...record(reloaded.version), latestQualityRun: null }).toEqual(
      created.version,
    );
  });

  it('preserves recorded Contract and old checks after Client correction, with bounded exact-version history', async () => {
    const { fixture, created, base, path, versionId } = await qualityFixture();
    const old = record(
      await command({
        path,
        body: {},
        key: 'old-run',
        companyId: fixture.companyId,
      }),
    );
    const current = record(
      await json(
        await request({
          path: '/clients/' + fixture.clientId,
          companyId: fixture.companyId,
        }),
      ),
    );
    const corrected = await request({
      path: '/clients/' + fixture.clientId,
      companyId: fixture.companyId,
      init: {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'correct-after-run',
        },
        body: JSON.stringify({
          expectedVersion: numberField(current, 'version'),
          displayName: 'Corrected current party',
          taxId: 'CORRECTED-SYNTHETIC',
          address: '2 Example Street',
        }),
      },
    });
    expect(corrected.status).toBe(200);
    instant = new Date('2026-10-07T09:00:00.000Z');
    const newer = record(
      await command({
        path,
        body: {},
        key: 'new-run',
        companyId: fixture.companyId,
      }),
    );
    expect(newer.results).toContainEqual({
      code: 'PARTY_IDENTITY_CURRENT',
      status: 'WARNING',
    });
    expect(
      await json(
        await request({
          path: path + '/' + stringField(old, 'id'),
          companyId: fixture.companyId,
        }),
      ),
    ).toEqual(old);
    const after = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    expect({ ...record(after.version), latestQualityRun: null }).toEqual(
      created.version,
    );
    expect(record(after.version).latestQualityRun).toEqual(newer);
    expect(
      await json(
        await request({
          path: path + '?limit=1',
          companyId: fixture.companyId,
        }),
      ),
    ).toEqual({ items: [newer], nextCursor: newer.id });
    expect(
      await json(
        await request({
          path: path + '?limit=1&cursor=' + stringField(newer, 'id'),
          companyId: fixture.companyId,
        }),
      ),
    ).toEqual({ items: [old], nextCursor: null });
    for (const suffix of [
      '?limit=0',
      '?limit=51',
      '?limit=1.5',
      '?cursor=unknown',
    ])
      expect(
        (await request({ path: path + suffix, companyId: fixture.companyId }))
          .status,
      ).toBe(400);
    await expect(
      pool.query(
        'UPDATE contract_quality_runs SET evaluated_at=now() WHERE id=$1',
        [old.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('DELETE FROM contract_quality_runs WHERE id=$1', [old.id]),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (
        await request({
          path:
            base +
            '/versions/' +
            fixture.snapshotId +
            '/quality-checks/' +
            stringField(old, 'id'),
          companyId: fixture.companyId,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request({
          path:
            base +
            '/versions/' +
            versionId +
            '/quality-checks/' +
            fixture.snapshotId,
          companyId: fixture.companyId,
        })
      ).status,
    ).toBe(404);
    const counts = await pool.query<{ events: string }>(
      'SELECT count(*)::text AS events FROM contract_events',
    );
    expect(counts.rows[0]?.events).toBe('2');
  });
  it('converges concurrent retries across restart, conflicts changed intent, and rechecks independent current authority', async () => {
    const { fixture, path, base, created } = await qualityFixture();
    const independentActor = record(
      await json(
        await request({
          path: '/access/current-actor',
          init: { headers: memberHeaders('contract-reader') },
        }),
      ),
    );
    for (const bundle of [
      'company-context',
      'company-commercial-intake',
      'company-contract-preparer',
    ])
      await command({
        path: '/' + bundle + '-assignments',
        body: {
          workspaceMembershipId: stringField(
            independentActor,
            'workspaceMembershipId',
          ),
          companyId: fixture.companyId,
        },
        key: 'independent-quality-' + bundle,
      });
    const send = (body: unknown, key: string) =>
      request({
        path,
        companyId: fixture.companyId,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': key,
          },
          body: JSON.stringify(body),
        },
      });
    const responses = await Promise.all([
      send({}, 'shared-run'),
      send({}, 'shared-run'),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    const original = await json(responses[0]);
    expect(await json(responses[1])).toEqual(original);
    await harness.close();
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      serverClock: { now: () => new Date(instant) },
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Synthetic Contract Workspace',
      },
    });
    ({ origin, pool } = harness);
    instant = new Date('2026-10-08T09:00:00.000Z');
    expect(await json(await send({}, 'shared-run'))).toEqual(original);
    expect(
      (await send({ expectedContractRevision: 1 }, 'shared-run')).status,
    ).toBe(409);
    expect((await send({}, 'create-quality-fixture')).status).toBe(409);
    for (const bundle of [
      'company-offer-preparer-assignments',
      'company-offer-approver-assignments',
      'company-director-client-assignments',
    ])
      expect(
        (
          await request({
            path:
              '/' +
              bundle +
              '/' +
              fixture.actorMembershipId +
              '/' +
              fixture.companyId,
            init: {
              method: 'DELETE',
              headers: { 'idempotency-key': 'remove-' + bundle },
            },
          })
        ).status,
      ).toBe(200);
    const independentHeaders = memberHeaders('contract-reader');
    for (const unreadable of [
      '/clients/' + fixture.clientId,
      '/offers/opportunities/' + fixture.opportunityId,
    ])
      expect(
        (
          await request({
            path: unreadable,
            companyId: fixture.companyId,
            init: { headers: independentHeaders },
          })
        ).status,
      ).toBe(403);
    const independent = record(
      await json(
        await request({
          path,
          companyId: fixture.companyId,
          init: {
            method: 'POST',
            headers: {
              ...independentHeaders,
              'content-type': 'application/json',
              'idempotency-key': 'independent-run',
            },
            body: '{}',
          },
        }),
      ),
    );
    expect(independent.results).toEqual(record(original).results);
    const read = record(
      record(
        await json(
          await request({
            path: base,
            companyId: fixture.companyId,
            init: { headers: independentHeaders },
          }),
        ),
      ).contract,
    );
    expect(read.clientReference).toBeUndefined();
    expect(record(read.version).recipient).toEqual(
      record(created.version).recipient,
    );
    expect(
      (
        await request({
          path:
            '/company-contract-preparer-assignments/' +
            fixture.actorMembershipId +
            '/' +
            fixture.companyId,
          init: {
            method: 'DELETE',
            headers: { 'idempotency-key': 'revoke-checker' },
          },
        })
      ).status,
    ).toBe(200);
    const refused = await send({}, 'shared-run');
    expect(refused.status).toBe(403);
    expect(await json(refused)).not.toHaveProperty('results');
    expect(
      (
        await request({
          path: path + '/' + stringField(record(original), 'id'),
          companyId: fixture.companyId,
        })
      ).status,
    ).toBe(403);
    const counts = await pool.query<{
      runs: string;
      receipts: string;
      events: string;
    }>(
      "SELECT (SELECT count(*) FROM contract_quality_runs)::text AS runs,(SELECT count(*) FROM contract_commands WHERE kind='RUN_QUALITY_CHECKS')::text AS receipts,(SELECT count(*) FROM contract_events)::text AS events",
    );
    expect(counts.rows[0]).toEqual({ runs: '2', receipts: '2', events: '2' });
  });
  it('fences identity invalidation on a separate connection and records one coherent current observation', async () => {
    const { fixture, path } = await qualityFixture();
    const blocker = await pool.connect();
    let pending: Promise<Response> | undefined;
    try {
      await blocker.query('BEGIN');
      const pid = (
        await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]?.pid;
      if (!pid) throw new Error('Missing blocker PID');
      await blocker.query(
        'SELECT id FROM client_accounts WHERE id=$1 FOR UPDATE',
        [fixture.clientId],
      );
      pending = request({
        path,
        companyId: fixture.companyId,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': 'fenced-run',
          },
          body: '{}',
        },
      });
      await waitForBlocker(pid);
      await blocker.query(
        "UPDATE client_accounts SET display_name='Corrected while waiting' WHERE id=$1",
        [fixture.clientId],
      );
      await blocker.query(
        "UPDATE client_company_relationships SET status='archived' WHERE client_account_id=$1 AND company_id=$2",
        [fixture.clientId, fixture.companyId],
      );
      await blocker.query('COMMIT');
      const response = await pending;
      expect(response.status).toBe(201);
      const results = record(await json(response)).results;
      expect(results).toContainEqual({
        code: 'PARTY_AVAILABLE',
        status: 'ERROR',
      });
      expect(results).toContainEqual({
        code: 'PARTY_IDENTITY_CURRENT',
        status: 'WARNING',
      });
      expect(results).toContainEqual({
        code: 'PARTY_IDENTITY_MATCHES_SOURCE',
        status: 'PASS',
      });
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await pending;
    }
  });
  it('orders revocation against the authorized run and denies its cached replay afterwards', async () => {
    const { fixture, path } = await qualityFixture();
    const blocker = await pool.connect();
    let pending: Promise<Response> | undefined,
      revoked: Promise<Response> | undefined;
    try {
      await blocker.query('BEGIN');
      const pid = (
        await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]?.pid;
      if (!pid) throw new Error('Missing blocker PID');
      await blocker.query(
        'SELECT id FROM client_accounts WHERE id=$1 FOR UPDATE',
        [fixture.clientId],
      );
      const send = () =>
        request({
          path,
          companyId: fixture.companyId,
          init: {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': 'run-before-revoke',
            },
            body: '{}',
          },
        });
      pending = send();
      const commandPid = await waitForBlocker(pid);
      revoked = request({
        path:
          '/company-contract-preparer-assignments/' +
          fixture.actorMembershipId +
          '/' +
          fixture.companyId,
        init: {
          method: 'DELETE',
          headers: { 'idempotency-key': 'concurrent-check-revoke' },
        },
      });
      await waitForBlocker(commandPid);
      await blocker.query('COMMIT');
      expect((await pending).status).toBe(201);
      expect((await revoked).status).toBe(200);
      expect((await send()).status).toBe(403);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await Promise.allSettled(
        [pending, revoked].filter((value) => value !== undefined),
      );
    }
  });

  it('rolls back the run and receipt if persistence or authorized response construction fails', async () => {
    const { fixture, path } = await qualityFixture();
    const send = () =>
      request({
        path,
        companyId: fixture.companyId,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': 'rollback-quality',
          },
          body: '{}',
        },
      });
    for (const failure of ['receipt', 'response']) {
      if (failure === 'receipt')
        await pool.query(
          "CREATE FUNCTION fail_c3_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic receipt failure'; END; $$; CREATE TRIGGER fail_c3_receipt BEFORE INSERT ON contract_commands FOR EACH ROW EXECUTE FUNCTION fail_c3_receipt()",
        );
      else
        await pool.query(
          'DROP TRIGGER contract_quality_results_valid ON contract_quality_runs; CREATE FUNCTION fail_c3_response() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.results := \'[{"code":"UNKNOWN","status":"PASS"}]\'::jsonb; RETURN NEW; END; $$; CREATE TRIGGER fail_c3_response BEFORE INSERT ON contract_quality_runs FOR EACH ROW EXECUTE FUNCTION fail_c3_response()',
        );
      try {
        const refused = await send();
        expect(refused.status).toBe(500);
        expect(await json(refused)).toMatchObject({
          code: 'CONTRACT_QUALITY_UNCERTAIN',
        });
        const counts = await pool.query<{ runs: string; commands: string }>(
          "SELECT (SELECT count(*) FROM contract_quality_runs)::text AS runs,(SELECT count(*) FROM contract_commands WHERE kind='RUN_QUALITY_CHECKS')::text AS commands",
        );
        expect(counts.rows[0]).toEqual({ runs: '0', commands: '0' });
      } finally {
        if (failure === 'receipt')
          await pool.query(
            'DROP TRIGGER fail_c3_receipt ON contract_commands; DROP FUNCTION fail_c3_receipt()',
          );
        else
          await pool.query(
            'DROP TRIGGER fail_c3_response ON contract_quality_runs; DROP FUNCTION fail_c3_response(); CREATE TRIGGER contract_quality_results_valid BEFORE INSERT ON contract_quality_runs FOR EACH ROW EXECUTE FUNCTION guard_c3_quality_results()',
          );
      }
    }
    expect((await send()).status).toBe(201);
  });

  it('keeps unknown, cross-Company, cross-Workspace and missing Opportunity authority refusals free of run metadata', async () => {
    const { fixture, path } = await qualityFixture();
    const old = record(
      await command({
        path,
        body: {},
        key: 'safe-run',
        companyId: fixture.companyId,
      }),
    );
    const other = await acceptedOffer({ suffix: 'other-quality' });
    await grantContract(other, 'other-quality-grant');
    for (const requestInput of [
      { path: path + '/' + stringField(old, 'id'), companyId: other.companyId },
      {
        path: path + '/' + stringField(old, 'id'),
        companyId: fixture.companyId,
        init: {
          headers: {
            'x-workspace-context-id': '00000000-0000-4000-8000-000000000999',
          },
        },
      },
      {
        path: path + '/------------------------------------',
        companyId: fixture.companyId,
      },
    ]) {
      const refused = await request(requestInput);
      expect([403, 404]).toContain(refused.status);
      const body = await json(refused);
      expect(body).not.toHaveProperty('results');
      expect(body).not.toHaveProperty('actorWorkspaceMembershipId');
      expect(body).not.toHaveProperty('evaluatedAt');
    }
    expect(
      (
        await request({
          path:
            '/company-commercial-intake-assignments/' +
            fixture.actorMembershipId +
            '/' +
            fixture.companyId,
          init: {
            method: 'DELETE',
            headers: { 'idempotency-key': 'revoke-opportunity-checks' },
          },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request({
          path: path + '/' + stringField(old, 'id'),
          companyId: fixture.companyId,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request({
          path,
          companyId: fixture.companyId,
          init: {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': 'safe-run',
            },
            body: '{}',
          },
        })
      ).status,
    ).toBe(403);
  });

  it('requires current Contract and Opportunity authority for exact bytes without Offer, Pricing or Client prerequisites', async () => {
    const fixture = await acceptedOffer();
    await grantContract(fixture, 'representation-grant');
    const created = record(
      await json(
        await sendContract(
          fixture,
          await contractPayload(fixture),
          'representation-create',
        ),
      ),
    );
    const versionId = stringField(record(created.version), 'id');
    const path =
      '/contracts/opportunities/' +
      fixture.opportunityId +
      '/versions/' +
      versionId +
      '/representation';
    const reader = record(
      await json(
        await request({
          path: '/access/current-actor',
          init: { headers: memberHeaders('contract-reader') },
        }),
      ),
    );
    const membership = stringField(reader, 'workspaceMembershipId');
    for (const bundle of [
      'company-context',
      'company-commercial-intake',
      'company-contract-preparer',
    ]) {
      await command({
        path: '/' + bundle + '-assignments',
        body: {
          workspaceMembershipId: membership,
          companyId: fixture.companyId,
        },
        key: 'representation-reader-' + bundle,
      });
    }
    const readerRequest = () =>
      request({
        path,
        companyId: fixture.companyId,
        init: { headers: memberHeaders('contract-reader') },
      });
    const counts = () =>
      pool.query(
        `SELECT (SELECT count(*) FROM contract_events)::text AS events, (SELECT count(*) FROM contract_commands)::text AS commands, (SELECT count(*) FROM activity_log_events)::text AS activity`,
      );
    const before = (await counts()).rows;
    const allowed = await readerRequest();
    expect(allowed.status).toBe(200);
    const representation = await json(allowed);
    expect(representation).toEqual({
      contractId: created.id,
      contractVersionId: versionId,
      ...record(record(created.version).representation),
    });
    expect(await json(await readerRequest())).toEqual(representation);
    expect((await counts()).rows).toEqual(before);
    await expect(
      pool.query(
        'UPDATE contract_versions SET template_version=2 WHERE id=$1',
        [versionId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const other = await acceptedOffer({ suffix: 'representation-other' });
    await grantContract(other, 'representation-other-grant');
    for (const refused of [
      { path, companyId: undefined, status: 403 },
      { path, companyId: other.companyId, status: 404 },
      {
        path:
          '/contracts/opportunities/' +
          other.opportunityId +
          '/versions/' +
          versionId +
          '/representation',
        companyId: other.companyId,
        status: 404,
      },
      {
        path:
          '/contracts/opportunities/' +
          fixture.opportunityId +
          '/versions/' +
          other.snapshotId +
          '/representation',
        companyId: fixture.companyId,
        status: 404,
      },
      { path, companyId: '00000000-0000-4000-8000-000000000987', status: 403 },
    ]) {
      const response = await request(refused);
      expect(response.status).toBe(refused.status);
      const denied = JSON.stringify(await json(response));
      for (const field of [
        created.id,
        versionId,
        record(representation).sha256,
        'Accepted scope',
        'CONTRACT_ILLUSTRATIVE',
      ])
        expect(denied).not.toContain(field);
    }
    expect((await fetch(origin + '/api' + path)).status).toBe(401);
    const hiddenWorkspace = await request({
      path,
      companyId: fixture.companyId,
      init: { headers: memberHeaders('uninvited-other-workspace') },
    });
    expect(hiddenWorkspace.status).toBe(403);
    expect(JSON.stringify(await json(hiddenWorkspace))).not.toContain(
      versionId,
    );
    for (const bundle of [
      'company-commercial-intake',
      'company-contract-preparer',
    ]) {
      expect(
        (
          await request({
            path:
              '/' +
              bundle +
              '-assignments/' +
              membership +
              '/' +
              fixture.companyId,
            init: {
              method: 'DELETE',
              headers: { 'idempotency-key': 'representation-revoke-' + bundle },
            },
          })
        ).status,
      ).toBe(200);
      const denied = await readerRequest();
      expect(denied.status).toBe(403);
      expect(JSON.stringify(await json(denied))).not.toContain(
        record(representation).sha256,
      );
      if (bundle === 'company-commercial-intake')
        await command({
          path: '/' + bundle + '-assignments',
          body: {
            workspaceMembershipId: membership,
            companyId: fixture.companyId,
          },
          key: 'representation-restore-opportunity',
        });
    }
  });
  it.each([
    {
      baseline: 'C1 / 0052',
      migration: '0053_contract_template_binding',
      index: 53,
      previousTag: '0052_confirmed_cost_profitability_estimate',
    },
    {
      baseline: 'C2 / 0053',
      migration: '0054_contract_quality_checks',
      index: 54,
      previousTag: '0053_contract_template_binding',
    },
    {
      baseline: 'C3 / 0054',
      migration: '0055_contract_decisions',
      index: 55,
      previousTag: '0054_contract_quality_checks',
    },
  ])(
    'upgrades actual $baseline versions and receipts without changing any historic field or immutable guard',
    async ({ migration, index: expectedIndex, previousTag }) => {
      if (!databaseUrl) throw new Error('Missing safe test database');
      const journal = record(
        JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
      );
      if (!Array.isArray(journal.entries)) throw new Error('Invalid journal');
      const entries = journal.entries.map(record);
      const index = entries.findIndex((entry) => entry.tag === migration);
      expect(index).toBe(expectedIndex);
      expect(entries[index - 1]?.tag).toBe(previousTag);
      const previous = await mkdtemp(join(tmpdir(), 'prisma-c2-upgrade-'));
      if (
        dirname(previous) !== resolve(tmpdir()) ||
        !basename(previous).startsWith('prisma-c2-upgrade-')
      )
        throw new Error('Unsafe migration fixture path');
      const priorDatabase = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'contract_c2_upgrade',
      });
      let priorHarness: PostgresRestTestHarness | undefined;
      const original = { origin, pool };
      try {
        await mkdir(join(previous, 'meta'));
        await writeFile(
          join(previous, 'meta/_journal.json'),
          JSON.stringify({ ...journal, entries: entries.slice(0, index) }),
        );
        for (const entry of entries.slice(0, index)) {
          const tag = stringField(entry, 'tag');
          if (!/^\d{4}_[a-z0-9_-]+$/u.test(tag))
            throw new Error('Invalid migration tag');
          await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
        }
        priorHarness = await createPostgresRestTestHarness({
          databaseUrl: priorDatabase.targetUrl,
          migrationsFolder: previous,
          serverClock: { now: () => new Date(instant) },
          environment: {
            NODE_ENV: 'test',
            ACCESS_IDENTITY_MODE: 'test',
            ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
            ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
            ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
            ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Synthetic Contract Workspace',
          },
        });
        ({ origin, pool } = priorHarness);
        const fixture = await acceptedOffer();
        await grantContract(fixture, 'historic-grant');
        const payload = {
          ...(await contractPayload(fixture)),
          termStartsOn: '2026-10-01',
          termEndsOn: '2026-12-31',
          specialConditions: 'Historic conditions\nkept exactly',
        };
        // Synthesize creation using only the actual preceding schema's columns.
        const inserted = await pool.query<{ id: string }>(
          `INSERT INTO contracts(workspace_id,company_id,opportunity_id,client_request_id,original_client_account_id,source_offer_id,source_offer_version_id,illustrative_reference,created_by_internal_user_id,created_by_workspace_membership_id,created_at)
        SELECT workspace_id,company_id,opportunity_id,client_request_id,original_client_account_id,offer_id,id,1,created_by_internal_user_id,created_by_workspace_membership_id,created_at FROM offer_versions WHERE id=$1 RETURNING id`,
          [payload.acceptedOfferVersionId],
        );
        const contractId = inserted.rows[0]?.id;
        if (!contractId) throw new Error('Missing historic Contract');
        await pool.query(
          `INSERT INTO contract_versions(workspace_id,company_id,contract_id,opportunity_id,pricing_snapshot_id,recipient_client_account_id,recipient_kind,recipient_additional_legal_entity_id,recipient_legal_name,recipient_tax_id,recipient_legal_address,issuing_company_label,scope_note,commercial_conditions,term_starts_on,term_ends_on,special_conditions,created_by_internal_user_id,created_by_workspace_membership_id,created_at)
        SELECT workspace_id,company_id,$2,opportunity_id,pricing_snapshot_id,recipient_client_account_id,recipient_kind,recipient_additional_legal_entity_id,recipient_legal_name,recipient_tax_id,recipient_legal_address,issuing_company_label,scope_note,commercial_conditions,$3,$4,$5,created_by_internal_user_id,created_by_workspace_membership_id,created_at FROM offer_versions WHERE id=$1`,
          [
            payload.acceptedOfferVersionId,
            contractId,
            payload.termStartsOn,
            payload.termEndsOn,
            payload.specialConditions,
          ],
        );
        await pool.query(
          `INSERT INTO contract_commands(workspace_id,company_id,actor_workspace_membership_id,idempotency_key,fingerprint,opportunity_id,result_contract_id,created_at) SELECT workspace_id,company_id,created_by_workspace_membership_id,'historic-command',$2,opportunity_id,id,created_at FROM contracts WHERE id=$1`,
          [
            contractId,
            commandFingerprint({
              opportunityId: fixture.opportunityId,
              payload,
            }),
          ],
        );
        await pool.query(
          `INSERT INTO contract_reference_counters(workspace_id,company_id,kind,current_reference) SELECT workspace_id,company_id,kind,illustrative_reference FROM contracts WHERE id=$1`,
          [contractId],
        );
        await pool.query(
          `INSERT INTO contract_events(workspace_id,company_id,action,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,metadata)
        SELECT c.workspace_id,c.company_id,e.action,c.id,e.version_id,c.created_by_internal_user_id,c.created_by_workspace_membership_id,c.created_at,
          jsonb_build_object('contractId',c.id,'kind',c.kind,'origin',c.origin,'provenance','ILLUSTRATIVE','illustrativeReference',c.illustrative_reference,'offerVersionId',c.source_offer_version_id,'pricingSnapshotId',v.pricing_snapshot_id) || CASE WHEN e.version_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('contractVersionId',v.id,'versionNumber',v.version_number) END
        FROM contracts c JOIN contract_versions v ON v.contract_id=c.id
        CROSS JOIN LATERAL (VALUES ('contract.created',NULL::uuid),('contract_version.created',v.id)) e(action,version_id) WHERE c.id=$1`,
          [contractId],
        );
        if (index === 55) {
          // C3 records are synthesized using only the delivered 0054 columns;
          // the current command model additionally selects C4 receipt columns.
          const results = [
            { code: 'SOURCE_COMPANY_MATCHES', status: 'PASS' },
            { code: 'PARTY_AVAILABLE', status: 'PASS' },
            { code: 'PARTY_MATCHES_SOURCE', status: 'PASS' },
            { code: 'PARTY_IDENTITY_MATCHES_SOURCE', status: 'PASS' },
            { code: 'PARTY_IDENTITY_CURRENT', status: 'PASS' },
            { code: 'PARTY_TAX_ID_RECORDED', status: 'PASS' },
            { code: 'PRICE_MATCHES_ACCEPTED_OFFER', status: 'PASS' },
            { code: 'PRICING_SNAPSHOT_COHERENT', status: 'PASS' },
            { code: 'CONDITIONS_MATCH_ACCEPTED_OFFER', status: 'PASS' },
            { code: 'ADDED_CONDITIONS_CONFIRMED', status: 'WARNING' },
            { code: 'TERM_END_NOT_PASSED', status: 'PASS' },
            { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
          ];
          await pool.query(
            `INSERT INTO contract_quality_runs(workspace_id,company_id,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,evaluated_at,results) SELECT workspace_id,company_id,contract_id,id,created_by_internal_user_id,created_by_workspace_membership_id,created_at,$2::jsonb FROM contract_versions WHERE contract_id=$1`,
            [contractId, JSON.stringify(results)],
          );
          await pool.query(
            `INSERT INTO contract_commands(workspace_id,company_id,actor_workspace_membership_id,idempotency_key,fingerprint,opportunity_id,result_contract_id,kind,result_quality_run_id,created_at) SELECT r.workspace_id,r.company_id,r.actor_workspace_membership_id,'historic-c3-run',$2,c.opportunity_id,c.id,'RUN_QUALITY_CHECKS',r.id,r.evaluated_at FROM contract_quality_runs r JOIN contracts c ON c.id=r.contract_id WHERE c.id=$1`,
            [
              contractId,
              commandFingerprint({
                kind: 'RUN_QUALITY_CHECKS',
                opportunityId: fixture.opportunityId,
                versionId: (
                  await pool.query<{ id: string }>(
                    'SELECT id FROM contract_versions WHERE contract_id=$1',
                    [contractId],
                  )
                ).rows[0]?.id,
                payload: {},
              }),
            ],
          );
        }
        const historicQuality =
          index === 55
            ? (
                await pool.query(
                  'SELECT to_jsonb(r) AS row FROM contract_quality_runs r',
                )
              ).rows
            : null;
        const evidence = () =>
          pool.query<{
            contracts: unknown;
            versions: unknown;
            commands: unknown;
            events: unknown;
            guards: unknown;
          }>(
            `SELECT
        (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM contracts c) AS contracts,
        (SELECT jsonb_agg(CASE WHEN $1::boolean THEN to_jsonb(v)-ARRAY['template_code','template_version','clause_versions']::text[] ELSE to_jsonb(v) END ORDER BY id) FROM contract_versions v) AS versions,
        (SELECT jsonb_agg(to_jsonb(c)-ARRAY['kind','result_quality_run_id','result_decision_id']::text[] ORDER BY id) FROM contract_commands c) AS commands,
        (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM contract_events e) AS events,
        (SELECT jsonb_agg(to_jsonb(r) ORDER BY company_id) FROM contract_reference_counters r) AS counters,
        (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM company_role_assignments a) AS permissions,
        (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM activity_log_events e) AS activity,
        (SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid IN ('contracts'::regclass,'contract_versions'::regclass,'contract_commands'::regclass,'contract_events'::regclass,'contract_reference_counters'::regclass) AND conname<>ALL($2::text[])) AS constraints,
        (SELECT jsonb_agg(pg_get_triggerdef(oid) ORDER BY tgname) FROM pg_trigger WHERE tgname IN ('contract_commands_immutable','contract_events_immutable')) AS guards`,
            [
              index === 53,
              [
                ...(index === 53
                  ? ['contract_versions_template_binding_check']
                  : []),
                'contracts_initial_check',
                'contract_versions_initial_check',
                'contract_events_target_check',
                'contract_events_metadata_check',
                'contract_commands_decision_fk',
                'contracts_decision_evidence',
                'contract_versions_decision_evidence',
                'contract_commands_kind_check',
                'contract_commands_run_fk',
              ],
            ],
          );
        const before = (await evidence()).rows;
        await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
        expect((await evidence()).rows).toEqual(before);
        if (historicQuality)
          expect(
            (
              await pool.query(
                'SELECT to_jsonb(r) AS row FROM contract_quality_runs r',
              )
            ).rows,
          ).toEqual(historicQuality);
        expect(
          (
            await pool.query<{ count: string }>(
              "SELECT count(*)::text AS count FROM pg_constraint WHERE conname IN ('contracts_decision_evidence','contract_versions_decision_evidence','contract_commands_decision_fk')",
            )
          ).rows[0]?.count,
        ).toBe('3');
        expect(
          (
            await pool.query<{
              kind: string;
              result_quality_run_id: string | null;
            }>(
              "SELECT kind,result_quality_run_id FROM contract_commands WHERE kind='CREATE'",
            )
          ).rows,
        ).toEqual([{ kind: 'CREATE', result_quality_run_id: null }]);
        const additions = await pool.query<{ name: string }>(
          `SELECT conname AS name FROM pg_constraint WHERE conname IN ('contract_commands_kind_check','contract_commands_run_fk','contract_quality_runs_ruleset_check','contract_quality_runs_version_fk','contract_quality_runs_actor_fk') ORDER BY conname`,
        );
        expect(additions.rows).toEqual([
          { name: 'contract_commands_kind_check' },
          { name: 'contract_commands_run_fk' },
          { name: 'contract_quality_runs_actor_fk' },
          { name: 'contract_quality_runs_ruleset_check' },
          { name: 'contract_quality_runs_version_fk' },
        ]);
        expect(
          (
            await pool.query<{ name: string }>(
              "SELECT tgname AS name FROM pg_trigger WHERE tgname IN ('contract_quality_runs_immutable','contract_quality_results_valid') ORDER BY tgname",
            )
          ).rows,
        ).toEqual([
          { name: 'contract_quality_results_valid' },
          { name: 'contract_quality_runs_immutable' },
        ]);
        const path = '/contracts/opportunities/' + fixture.opportunityId;
        const stored = record(
          record(
            await json(await request({ path, companyId: fixture.companyId })),
          ).contract,
        );
        const version = record(stored.version);
        expect(record(version.representation)).toMatchObject({
          templateCode: 'CONTRACT_ILLUSTRATIVE',
          templateVersion: 1,
          clauseVersions: [
            { code: 'CL_SUBJECT', version: 1 },
            { code: 'CL_PRICE', version: 1 },
            { code: 'CL_TERM', version: 1 },
            { code: 'CL_CONDITIONS', version: 1 },
            { code: 'CL_GENERAL', version: 1 },
          ],
        });
        expect(
          await json(await sendContract(fixture, payload, 'historic-command')),
        ).toEqual(stored);
        expect((await evidence()).rows).toEqual(before);
        if (historicQuality)
          expect(
            (
              await pool.query(
                'SELECT to_jsonb(r) AS row FROM contract_quality_runs r',
              )
            ).rows,
          ).toEqual(historicQuality);
        expect(
          (
            await pool.query<{ count: string }>(
              "SELECT count(*)::text AS count FROM pg_constraint WHERE conname IN ('contracts_decision_evidence','contract_versions_decision_evidence','contract_commands_decision_fk')",
            )
          ).rows[0]?.count,
        ).toBe('3');
        for (const table of [
          'contracts',
          'contract_versions',
          'contract_commands',
          'contract_events',
        ]) {
          const timeColumn =
            table === 'contract_events' ? 'occurred_at' : 'created_at';
          await expect(
            pool.query(`UPDATE ${table} SET ${timeColumn}=${timeColumn}`),
          ).rejects.toMatchObject({ code: '23514' });
          await expect(
            pool.query(`DELETE FROM ${table}`),
          ).rejects.toMatchObject({
            code: '23514',
          });
        }
      } finally {
        ({ origin, pool } = original);
        await priorHarness?.close();
        await priorDatabase.close();
        await rm(previous, { recursive: true, force: true });
      }
    },
    60000,
  );
  it('creates and reloads version one from the exact Accepted Offer without re-entry', async () => {
    const fixture = await acceptedOffer();
    await command({
      path: '/company-contract-preparer-assignments',
      body: {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      key: 'grant-contract',
    });
    const offer = record(
      record(
        await json(
          await request({
            path: `/offers/opportunities/${fixture.opportunityId}`,
            companyId: fixture.companyId,
          }),
        ),
      ).offer,
    );
    const accepted = record(offer.version);
    const created = record(
      await command({
        path: `/contracts/opportunities/${fixture.opportunityId}`,
        body: {
          acceptedOfferVersionId: accepted.id,
          termStartsOn: '2026-10-01',
          termEndsOn: '2026-12-31',
          specialConditions: 'Synthetic added conditions',
        },
        key: 'first-contract',
        companyId: fixture.companyId,
      }),
    );
    expect(created).toMatchObject({
      companyId: fixture.companyId,
      opportunityId: fixture.opportunityId,
      kind: 'CONTRACT',
      origin: 'ACCEPTED_OFFER',
      revision: 1,
      illustrativeReference: 1,
      provisional: true,
      sourceOfferId: offer.id,
      sourceOfferVersionId: accepted.id,
      sourceOffer: {
        illustrativeReference: offer.illustrativeReference,
        versionNumber: accepted.versionNumber,
      },
    });
    expect(created.version).toMatchObject({
      versionNumber: 1,
      pricingSnapshotId: fixture.snapshotId,
      scopeNote: 'Accepted scope',
      commercialConditions: 'Accepted conditions',
      decisionState: 'PENDING',
      executionState: 'NOT_EXECUTED',
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      termStartsOn: '2026-10-01',
      termEndsOn: '2026-12-31',
      specialConditions: 'Synthetic added conditions',
      recipient: {
        legalName: 'Synthetic Recipient SA',
        taxId: 'SYNTHETIC-456',
      },
    });
    const read = await request({
      path: `/contracts/opportunities/${fixture.opportunityId}`,
      companyId: fixture.companyId,
    });
    expect(read.status).toBe(200);
    expect(record(await json(read)).contract).toEqual(created);
    const path = `/contracts/opportunities/${fixture.opportunityId}`;
    const versionId = stringField(record(created.version), 'id');
    const representationRead = await request({
      path: path + '/versions/' + versionId + '/representation',
      companyId: fixture.companyId,
    });
    expect(representationRead.status).toBe(200);
    const representation = record(await json(representationRead));
    expect(representation).toMatchObject({
      contractId: created.id,
      contractVersionId: versionId,
      templateCode: 'CONTRACT_ILLUSTRATIVE',
      templateVersion: 1,
    });
    expect(stringField(representation, 'html')).toContain(
      'clauses are placeholders',
    );
    expect(stringField(representation, 'sha256')).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      record(
        await json(
          await request({
            path: path + '/versions/' + versionId,
            companyId: fixture.companyId,
          }),
        ),
      ).contract,
    ).toEqual(created);
    expect(
      await json(
        await request({
          path: path + '/versions?limit=1',
          companyId: fixture.companyId,
        }),
      ),
    ).toEqual({ items: [created.version], nextCursor: null });
    expect(
      await json(
        await request({
          path: path + '/versions?limit=1&cursor=' + versionId,
          companyId: fixture.companyId,
        }),
      ),
    ).toEqual({ items: [], nextCursor: null });
    for (const query of ['limit=0', 'limit=51', 'limit=1.5', 'cursor=unknown'])
      expect(
        (
          await request({
            path: path + '/versions?' + query,
            companyId: fixture.companyId,
          })
        ).status,
      ).toBe(400);
    // An Offer identifier cannot select an unrelated source through Contract reads.
    for (const unrelatedId of [
      stringField(offer, 'id'),
      stringField(accepted, 'id'),
    ])
      expect(
        (
          await request({
            path: path + '/versions/' + unrelatedId,
            companyId: fixture.companyId,
          })
        ).status,
      ).toBe(404);
    const events = await pool.query<{ action: string; metadata: unknown }>(
      'SELECT action, metadata FROM contract_events ORDER BY action',
    );
    expect(events.rows.map((row) => row.action)).toEqual([
      'contract.created',
      'contract_version.created',
    ]);
  });

  it('keeps grant administration, exact replay and independent Contract reading safe', async () => {
    const fixture = await acceptedOffer();
    const path = '/contracts/opportunities/' + fixture.opportunityId;
    const source = record(
      record(
        await json(
          await request({
            path: '/offers/opportunities/' + fixture.opportunityId,
            companyId: fixture.companyId,
          }),
        ),
      ).offer,
    );
    const body = {
      acceptedOfferVersionId: stringField(record(source.version), 'id'),
    };
    const send = (payload: unknown, key: string) =>
      request({
        path: path,
        companyId: fixture.companyId,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': key,
          },
          body: JSON.stringify(payload),
        },
      });
    expect((await send(body, 'deny')).status).toBe(403);
    await command({
      path: '/company-contract-preparer-assignments',
      body: {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      key: 'grant-contract',
    });
    const actor = record(
      await json(
        await request({
          path: '/access/current-actor',
          companyId: fixture.companyId,
        }),
      ),
    );
    expect(record(actor.activeCompany)).toMatchObject({
      contractPermissionSetVersion: 'v1',
      contractPermissions: [
        'commercial.contract.read',
        'commercial.contract.prepare',
        'commercial.contract.project.link',
      ],
    });
    expect(
      (await send({ ...body, termStartsOn: '2026-02-30' }, 'bad-date')).status,
    ).toBe(400);
    expect(
      (await send({ ...body, scopeNote: 'Replacement' }, 'override')).status,
    ).toBe(400);
    const responses = await Promise.all([
      send(body, 'same-command'),
      send(body, 'same-command'),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const created = await json(responses[0]);
    expect(await json(responses[1])).toEqual(created);
    expect(
      (await send({ ...body, specialConditions: 'Changed' }, 'same-command'))
        .status,
    ).toBe(409);
    expect((await send(body, 'different-command')).status).toBe(409);
    const revoke = async ({ bundle, key }: { bundle: string; key: string }) =>
      request({
        path:
          '/' +
          bundle +
          '/' +
          fixture.actorMembershipId +
          '/' +
          fixture.companyId,
        companyId: undefined,
        init: { method: 'DELETE', headers: { 'idempotency-key': key } },
      });
    expect(
      (
        await revoke({
          bundle: 'company-offer-preparer-assignments',
          key: 'revoke-offer',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await revoke({
          bundle: 'company-director-client-assignments',
          key: 'revoke-client',
        })
      ).status,
    ).toBe(200);
    const reader = record(
      await json(
        await request({
          path: '/access/current-actor',
          companyId: undefined,
          init: {
            headers: memberHeaders('contract-reader'),
          },
        }),
      ),
    );
    for (const route of [
      '/company-context-assignments',
      '/company-commercial-intake-assignments',
      '/company-contract-preparer-assignments',
    ])
      await command({
        path: route,
        body: {
          workspaceMembershipId: stringField(reader, 'workspaceMembershipId'),
          companyId: fixture.companyId,
        },
        key: 'reader-' + route,
      });
    const independent = await request({
      path: path,
      companyId: fixture.companyId,
      init: {
        headers: memberHeaders('contract-reader'),
      },
    });
    expect(independent.status).toBe(200);
    const stored = record(record(await json(independent)).contract);
    expect(stored.clientReference).toBeUndefined();
    expect(stored.sourceOffer).toEqual({
      illustrativeReference: 1,
      versionNumber: 1,
    });
    expect(stored.version).toMatchObject({
      scopeNote: 'Accepted scope',
      pricingSnapshotId: fixture.snapshotId,
    });
    expect(
      (
        await revoke({
          bundle: 'company-offer-approver-assignments',
          key: 'revoke-approver',
        })
      ).status,
    ).toBe(200);
    expect((await send(body, 'same-command')).status).toBe(403);
    expect(
      (
        await revoke({
          bundle: 'company-contract-preparer-assignments',
          key: 'revoke-contract',
        })
      ).status,
    ).toBe(200);
    expect(
      (await request({ path: path, companyId: fixture.companyId })).status,
    ).toBe(403);
    const administration = await request({
      path: '/company-context-assignments/administration',
    });
    expect(administration.status).toBe(200);
    expect(JSON.stringify(await json(administration))).toContain(
      'Company Contract Preparer',
    );
    const events = await pool.query<{ action: string }>(
      'SELECT action FROM activity_log_events WHERE action::text LIKE $1 ORDER BY action',
      ['company_contract_preparer_assignment.%'],
    );
    expect(events.rows.map((row) => row.action)).toEqual([
      'company_contract_preparer_assignment.granted',
      'company_contract_preparer_assignment.granted',
      'company_contract_preparer_assignment.revoked',
    ]);
    const counts = await pool.query<{
      contracts: string;
      versions: string;
      commands: string;
      events: string;
    }>(
      'SELECT (SELECT count(*) FROM contracts)::text AS contracts,(SELECT count(*) FROM contract_versions)::text AS versions,(SELECT count(*) FROM contract_commands)::text AS commands,(SELECT count(*) FROM contract_events)::text AS events',
    );
    expect(counts.rows[0]).toEqual({
      contracts: '1',
      versions: '1',
      commands: '1',
      events: '2',
    });
  });

  it('rolls back every write when its version event fails, then retries with the first reference', async () => {
    const fixture = await acceptedOffer();
    await command({
      path: '/company-contract-preparer-assignments',
      body: {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      key: 'grant-contract',
    });
    const offer = record(
      record(
        await json(
          await request({
            path: '/offers/opportunities/' + fixture.opportunityId,
            companyId: fixture.companyId,
          }),
        ),
      ).offer,
    );
    const path = '/contracts/opportunities/' + fixture.opportunityId;
    const payload = {
      acceptedOfferVersionId: stringField(record(offer.version), 'id'),
    };
    await pool.query(
      "CREATE FUNCTION fail_contract_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic event failure'; END; $$; CREATE TRIGGER fail_contract_event BEFORE INSERT ON contract_events FOR EACH ROW EXECUTE FUNCTION fail_contract_event()",
    );
    try {
      const result = await request({
        path: path,
        companyId: fixture.companyId,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': 'rollback',
          },
          body: JSON.stringify(payload),
        },
      });
      expect(result.status).toBe(500);
      expect(await json(result)).toMatchObject({
        code: 'CONTRACT_CREATION_UNCERTAIN',
      });
      const counts = await pool.query<{ count: string }>(
        'SELECT ((SELECT count(*) FROM contracts)+(SELECT count(*) FROM contract_versions)+(SELECT count(*) FROM contract_commands)+(SELECT count(*) FROM contract_events)+(SELECT count(*) FROM contract_reference_counters))::text AS count',
      );
      expect(counts.rows[0]?.count).toBe('0');
    } finally {
      await pool.query(
        'DROP TRIGGER fail_contract_event ON contract_events; DROP FUNCTION fail_contract_event()',
      );
    }
    const created = record(
      await command({
        path: path,
        body: payload,
        key: 'rollback',
        companyId: fixture.companyId,
      }),
    );
    expect(created.illustrativeReference).toBe(1);
    await expect(
      pool.query(
        'UPDATE contract_versions SET scope_note=$1 WHERE contract_id=$2',
        ['Changed', created.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('DELETE FROM contracts WHERE id=$1', [created.id]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('rejects a nonaccepted source and fails closed for an unknown Contract grant', async () => {
    const fixture = await preparedOffer();
    const offer = record(
      await command({
        path: '/offers/opportunities/' + fixture.opportunityId,
        body: {
          pricingSnapshotId: fixture.snapshotId,
          recipient: { kind: 'PRIMARY' },
        },
        key: 'pending-offer',
        companyId: fixture.companyId,
      }),
    );
    await command({
      path: '/company-contract-preparer-assignments',
      body: {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      key: 'grant-contract',
    });
    const path = '/contracts/opportunities/' + fixture.opportunityId;
    const payload = {
      acceptedOfferVersionId: stringField(record(offer.version), 'id'),
    };
    const send = () =>
      request({
        path: path,
        companyId: fixture.companyId,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': 'pending',
          },
          body: JSON.stringify(payload),
        },
      });
    expect((await send()).status).toBe(409);

    const [constraint] = (
      await pool.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
      )
    ).rows;
    if (!constraint) throw new Error('Missing captured-version constraint');
    await pool.query(
      'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
    );
    try {
      for (const version of [null, 'v2', 'V1']) {
        await pool.query(
          "UPDATE company_role_assignments SET permission_set_version=$1 WHERE bundle='company_contract_preparer' AND company_id=$2",
          [version, fixture.companyId],
        );
        expect(
          (await request({ path: path, companyId: fixture.companyId })).status,
        ).toBe(403);
        expect((await send()).status).toBe(403);
      }
    } finally {
      await pool.query(
        "UPDATE company_role_assignments SET permission_set_version='v1' WHERE bundle='company_contract_preparer' AND company_id=$1",
        [fixture.companyId],
      );
      await pool.query(
        'ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ' +
          constraint.definition,
      );
    }
    expect(
      (
        await pool.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM contracts',
        )
      ).rows[0]?.count,
    ).toBe('0');
  });

  it('serializes different creation keys, keeps references scoped and freezes current party identity', async () => {
    const first = await acceptedOffer({ suffix: 'first' });
    await grantContract(first, 'grant-first');
    const current = record(
      await json(
        await request({
          path: '/clients/' + first.clientId,
          companyId: first.companyId,
        }),
      ),
    );
    expect(
      (
        await request({
          path: '/clients/' + first.clientId,
          companyId: first.companyId,
          init: {
            method: 'PATCH',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': 'correct-current-party',
            },
            body: JSON.stringify({
              expectedVersion: numberField(current, 'version'),
              displayName: 'Corrected current party',
              taxId: 'CORRECTED-SYNTHETIC',
              address: '2 Example Street',
            }),
          },
        })
      ).status,
    ).toBe(200);
    const payload = await contractPayload(first);
    const path = '/contracts/opportunities/' + first.opportunityId;
    const results = await Promise.all([
      sendContract(first, payload, 'different-one'),
      sendContract(first, payload, 'different-two'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const success = results.find((result) => result.status === 201);
    if (!success) throw new Error('No winning command');
    const saved = record(await json(success));
    expect(saved.illustrativeReference).toBe(1);
    expect(record(saved.version).recipient).toMatchObject({
      legalName: 'Corrected current party',
      taxId: 'CORRECTED-SYNTHETIC',
      legalAddress: '2 Example Street',
    });
    const after = record(
      await json(
        await request({
          path: '/clients/' + first.clientId,
          companyId: first.companyId,
        }),
      ),
    );
    expect(
      (
        await request({
          path: '/clients/' + first.clientId,
          companyId: first.companyId,
          init: {
            method: 'PATCH',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': 'correct-later-party',
            },
            body: JSON.stringify({
              expectedVersion: numberField(after, 'version'),
              displayName: 'Later live party',
            }),
          },
        })
      ).status,
    ).toBe(200);
    const reloaded = record(
      record(
        await json(await request({ path: path, companyId: first.companyId })),
      ).contract,
    );
    expect(record(reloaded.version).representation).toEqual(
      record(saved.version).representation,
    );
    expect(record(reloaded.version).recipient).toEqual(
      record(saved.version).recipient,
    );
    const intake = record(
      await command({
        path: '/commercial-intake/requests',
        body: {
          originalText: 'Second synthetic Request',
          subject: 'Second Contract',
          clientAccountId: first.clientId,
          opportunity: { title: 'Second Contract', nextAction: 'Prepare' },
        },
        key: 'second-request',
        companyId: first.companyId,
      }),
    );
    const opportunityId = stringField(record(intake.initialOpportunity), 'id');
    const snapshot = record(
      await command({
        path: '/pricing/opportunities/' + opportunityId + '/snapshots',
        body: {
          pricingRuleVersionNumber: first.ruleVersionNumber,
          lines: [
            {
              offeringId: first.offeringId,
              tariffVersionNumber: first.tariffVersionNumber,
              quantity: '1',
            },
          ],
        },
        key: 'second-snapshot',
        companyId: first.companyId,
      }),
    );
    const second = await acceptedOffer({
      suffix: 'second',
      prepared: {
        ...first,
        requestId: stringField(intake, 'id'),
        opportunityId,
        snapshotId: stringField(snapshot, 'id'),
      },
    });
    const secondSaved = record(
      await command({
        path: '/contracts/opportunities/' + opportunityId,
        body: await contractPayload(second),
        key: 'second-contract',
        companyId: first.companyId,
      }),
    );
    expect(secondSaved.illustrativeReference).toBe(2);
    const other = await acceptedOffer({ suffix: 'other' });
    await grantContract(other, 'grant-other');
    expect(
      (await sendContract(other, payload, 'wrong-company-source')).status,
    ).toBe(404);
    expect(
      (await request({ path: path, companyId: other.companyId })).status,
    ).toBe(404);
    expect(
      (
        await request({
          path: path,
          companyId: first.companyId,
          init: {
            headers: {
              'x-workspace-context-id': '00000000-0000-4000-8000-000000005229',
            },
          },
        })
      ).status,
    ).toBe(403);
    const otherSaved = record(
      await command({
        path: '/contracts/opportunities/' + other.opportunityId,
        body: await contractPayload(other),
        key: 'other-contract',
        companyId: other.companyId,
      }),
    );
    expect(otherSaved.illustrativeReference).toBe(1);
  }, 20000);
  it('orders a concurrent revocation after creation without exposing the replay', async () => {
    const fixture = await acceptedOffer();
    await grantContract(fixture, 'grant-contract');
    const payload = await contractPayload(fixture);
    const blocker = await pool.connect();
    let pending: Promise<Response> | undefined;
    let revoked: Promise<Response> | undefined;
    try {
      await blocker.query('BEGIN');
      const pid = (
        await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]?.pid;
      if (pid === undefined) throw new Error('No blocker');
      await blocker.query(
        'SELECT id FROM client_accounts WHERE id=$1 FOR UPDATE',
        [fixture.clientId],
      );
      pending = sendContract(fixture, payload, 'racing-command');
      const commandPid = await waitForBlocker(pid);
      revoked = request({
        path:
          '/company-contract-preparer-assignments/' +
          fixture.actorMembershipId +
          '/' +
          fixture.companyId,
        companyId: undefined,
        init: {
          method: 'DELETE',
          headers: { 'idempotency-key': 'racing-revoke' },
        },
      });
      await waitForBlocker(commandPid);
      await blocker.query('COMMIT');
      expect((await pending).status).toBe(201);
      expect((await revoked).status).toBe(200);
      expect(
        (await sendContract(fixture, payload, 'racing-command')).status,
      ).toBe(403);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await Promise.allSettled(
        [pending, revoked].filter((p) => p !== undefined),
      );
    }
  });
  it('rechecks Client invalidation after waiting for its identity fence', async () => {
    const fixture = await acceptedOffer();
    await grantContract(fixture, 'grant-contract');
    const payload = await contractPayload(fixture);
    const blocker = await pool.connect();
    let pending: Promise<Response> | undefined;
    try {
      await blocker.query('BEGIN');
      const pid = (
        await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]?.pid;
      if (pid === undefined) throw new Error('No blocker');
      await blocker.query(
        'SELECT id FROM client_accounts WHERE id=$1 FOR UPDATE',
        [fixture.clientId],
      );
      pending = sendContract(fixture, payload, 'client-race');
      await waitForBlocker(pid);
      await blocker.query(
        "UPDATE client_accounts SET status='archived' WHERE id=$1",
        [fixture.clientId],
      );
      await blocker.query('COMMIT');
      expect((await pending).status).toBe(404);
      expect(
        (
          await pool.query<{ count: string }>(
            'SELECT count(*)::text AS count FROM contracts',
          )
        ).rows[0]?.count,
      ).toBe('0');
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await pending;
    }
  });
  it('copies the current ADDITIONAL party and refuses its unavailable Client relationship', async () => {
    for (const unavailable of [false, true]) {
      const fixture = await preparedOffer(
        unavailable ? '-UNAVAILABLE' : '-ADDITIONAL',
      );
      const readClient = async () =>
        record(
          await json(
            await request({
              path: '/clients/' + fixture.clientId,
              companyId: fixture.companyId,
            }),
          ),
        );
      const registered = record(
        await command({
          path: '/clients/' + fixture.clientId + '/legal-entities',
          body: {
            expectedClientVersion: numberField(await readClient(), 'version'),
            legalName: 'Synthetic Additional Party',
            taxId: 'ADDITIONAL-' + unavailable,
            legalAddress: 'Additional Example Street',
          },
          key: 'additional-party-' + unavailable,
          companyId: fixture.companyId,
        }),
      );
      const entityId = stringField(record(registered.legalEntity), 'id');
      await acceptedOffer({
        suffix: unavailable ? '-UNAVAILABLE' : '-ADDITIONAL',
        prepared: fixture,
        recipient: { kind: 'ADDITIONAL', legalEntityId: entityId },
      });
      await grantContract(fixture, 'grant-additional-' + unavailable);
      const payload = await contractPayload(fixture);
      const patch = await request({
        path: '/clients/' + fixture.clientId + '/legal-entities/' + entityId,
        companyId: fixture.companyId,
        init: {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': 'correct-additional-' + unavailable,
          },
          body: JSON.stringify({
            expectedClientVersion: numberField(await readClient(), 'version'),
            changes: { legalName: 'Corrected Additional Party' },
          }),
        },
      });
      expect(patch.status).toBe(200);
      if (unavailable) {
        // Model a committed relationship invalidation at the database boundary;
        // the real Client owner must refuse the selected entity, without fallback.
        await pool.query(
          "UPDATE client_company_relationships SET status='archived' WHERE company_id=$1 AND client_account_id=$2",
          [fixture.companyId, fixture.clientId],
        );
        expect(
          (await sendContract(fixture, payload, 'additional-unavailable'))
            .status,
        ).toBe(404);
        expect(
          record(
            await json(
              await request({
                path: '/contracts/opportunities/' + fixture.opportunityId,
                companyId: fixture.companyId,
              }),
            ),
          ).contract,
        ).toBeNull();
      } else {
        const created = record(
          await json(
            await sendContract(fixture, payload, 'additional-created'),
          ),
        );
        expect(record(created.version).recipient).toEqual({
          kind: 'ADDITIONAL',
          additionalLegalEntityId: entityId,
          legalName: 'Corrected Additional Party',
          taxId: 'ADDITIONAL-false',
          legalAddress: 'Additional Example Street',
        });
      }
    }
  });
  it('refuses creation after a Contract revocation has committed', async () => {
    const fixture = await acceptedOffer();
    await grantContract(fixture, 'grant-before-revoke');
    const payload = await contractPayload(fixture);
    const revoked = await request({
      path:
        '/company-contract-preparer-assignments/' +
        fixture.actorMembershipId +
        '/' +
        fixture.companyId,
      init: {
        method: 'DELETE',
        headers: { 'idempotency-key': 'revoke-before-creation' },
      },
    });
    expect(revoked.status).toBe(200);
    expect(
      (await sendContract(fixture, payload, 'after-revocation')).status,
    ).toBe(403);
    expect(
      (
        await pool.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM contracts',
        )
      ).rows[0]?.count,
    ).toBe('0');
  });
  async function grantApprover(fixture: PreparedOffer) {
    return command({
      path: '/company-contract-approver-assignments',
      body: {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      key: 'grant-approver-' + fixture.companyId,
    });
  }
  async function decisionRequest(
    fixture: PreparedOffer,
    versionId: string,
    kind: 'approve' | 'reject',
    body: unknown,
    key: string,
  ) {
    return request({
      path:
        '/contracts/opportunities/' +
        fixture.opportunityId +
        '/versions/' +
        versionId +
        '/' +
        kind,
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify(body),
      },
    });
  }
  async function qualityFixture(
    content: { specialConditions?: string; termEndsOn?: string } = {},
  ) {
    const fixture = await acceptedOffer();
    await grantContract(fixture, 'grant-quality-fixture');
    const base = '/contracts/opportunities/' + fixture.opportunityId;
    const created = record(
      await command({
        path: base,
        body: { ...(await contractPayload(fixture)), ...content },
        key: 'create-quality-fixture',
        companyId: fixture.companyId,
      }),
    );
    const versionId = stringField(record(created.version), 'id');
    return {
      fixture,
      created,
      base,
      versionId,
      path: base + '/versions/' + versionId + '/quality-checks',
    };
  }
  async function grantContract(fixture: PreparedOffer, key: string) {
    return command({
      path: '/company-contract-preparer-assignments',
      body: {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      key: key,
    });
  }
  async function contractPayload(fixture: PreparedOffer) {
    const offer = record(
      record(
        await json(
          await request({
            path: '/offers/opportunities/' + fixture.opportunityId,
            companyId: fixture.companyId,
          }),
        ),
      ).offer,
    );
    return { acceptedOfferVersionId: stringField(record(offer.version), 'id') };
  }
  async function sendContract(
    fixture: PreparedOffer,
    payload: unknown,
    key: string,
  ) {
    return request({
      path: '/contracts/opportunities/' + fixture.opportunityId,
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify(payload),
      },
    });
  }
  async function waitForBlocker(pid: number): Promise<number> {
    for (let attempt = 0; attempt < 80; attempt++) {
      const waiting = await pool.query<{ pid: number }>(
        "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid))",
        [pid],
      );
      const waiter = waiting.rows[0];
      if (waiter) return waiter.pid;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(
      'Concurrent command did not reach its held authority or identity fence',
    );
  }
  async function acceptedOffer({
    suffix = '',
    prepared,
    recipient = { kind: 'PRIMARY' },
  }: {
    suffix?: string;
    prepared?: PreparedOffer;
    recipient?:
      { kind: 'PRIMARY' } | { kind: 'ADDITIONAL'; legalEntityId: string };
  } = {}) {
    const fixture = prepared ?? (await preparedOffer(suffix));
    const offer = identifiedRecord(
      await command({
        path: `/offers/opportunities/${fixture.opportunityId}`,
        body: {
          pricingSnapshotId: fixture.snapshotId,
          recipient,
          scopeNote: 'Accepted scope',
          commercialConditions: 'Accepted conditions',
        },
        key: 'offer' + suffix,
        companyId: fixture.companyId,
      }),
    );
    await command({
      path: '/company-offer-approver-assignments',
      body: {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      key: 'approver' + suffix,
    });
    const base = `/offers/opportunities/${fixture.opportunityId}/versions/${stringField(record(offer.version), 'id')}`;
    await command({
      path: base + '/approve',
      body: { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
      key: 'approve' + suffix,
      companyId: fixture.companyId,
    });
    await command({
      path: base + '/transmission',
      body: { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
      key: 'transmit' + suffix,
      companyId: fixture.companyId,
    });
    await command({
      path: base + '/client-response',
      body: {
        expectedOfferRevision: 3,
        outcome: 'ACCEPTED',
        receivedAt: instant.toISOString(),
      },
      key: 'accept' + suffix,
      companyId: fixture.companyId,
    });
    return fixture;
  }
  async function command({
    path,
    body,
    key,
    companyId,
  }: {
    path: string;
    body: unknown;
    key: string;
    companyId?: string;
  }): Promise<unknown> {
    const response = await request({
      path: path,
      companyId: companyId,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify(body),
      },
    });
    const value = await json(response);
    expect(response.status, JSON.stringify({ path, value })).toBe(201);
    return value;
  }

  async function preparedOffer(suffix = ''): Promise<PreparedOffer> {
    const company = entity(
      await command({
        path: '/companies',
        body: { displayName: 'Illustrative Company 456' + suffix },
        key: 'company-456' + suffix,
      }),
    );
    const actor = record(
      await json(
        await request({ path: '/access/current-actor', companyId: company.id }),
      ),
    );
    const actorMembershipId = stringField(actor, 'workspaceMembershipId');
    for (const path of ASSIGNMENTS)
      await command({
        path: path,
        body: {
          workspaceMembershipId: actorMembershipId,
          companyId: company.id,
        },
        key: `grant-${path}${suffix}`,
      });

    const client = entity(
      await command({
        path: '/clients',
        body: {
          displayName: 'Synthetic Recipient SA' + suffix,
          taxId: 'SYNTHETIC-456' + suffix,
          address: '456 Example Street',
        },
        key: 'client-456' + suffix,
        companyId: company.id,
      }),
    );
    const intake = record(
      await command({
        path: '/commercial-intake/requests',
        body: {
          originalText: 'Synthetic Request for the first illustrative Offer.',
          sourceLabel: 'Synthetic REST proof',
          subject: 'Illustrative Offer preparation',
          clientAccountId: client.id,
          opportunity: {
            title: 'Prepare an illustrative Offer',
            scope: 'Synthetic scope only',
            nextAction: 'Prepare version 1',
          },
        },
        key: 'request-456' + suffix,
        companyId: company.id,
      }),
    );
    const opportunityId = stringField(record(intake.initialOpportunity), 'id');

    const rule = published(
      await command({
        path: '/pricing-configuration/rule-versions',
        body: {
          label: 'Illustrative rule',
          effectiveFrom: instant.toISOString(),
          expectedActiveVersionNumber: null,
        },
        key: 'rule-456' + suffix,
        companyId: company.id,
      }),
    );
    const definition = entity(
      record(
        await command({
          path: '/commercial-catalogue/service-definitions',
          body: {
            code: 'OFFER-456' + suffix.toUpperCase(),
            name: 'Synthetic illustrative service',
            description: null,
          },
          key: 'definition-456' + suffix,
          companyId: company.id,
        }),
      ).definition,
    );
    const offering = entity(
      record(
        await command({
          path: '/commercial-catalogue/offerings',
          body: { serviceDefinitionId: definition.id, commercialLabel: null },
          key: 'offering-456' + suffix,
          companyId: company.id,
        }),
      ).offering,
    );
    const tariff = published(
      await command({
        path: `/pricing-configuration/offerings/${offering.id}/tariff-versions`,
        body: {
          unit: 'illustrative-unit',
          unitAmount: '300.0000',
          currency: 'EUR',
          taxRatePercent: '15.00',
          taxLabel: 'Illustrative tax',
          effectiveFrom: instant.toISOString(),
          expectedActiveVersionNumber: null,
        },
        key: 'tariff-456' + suffix,
        companyId: company.id,
      }),
    );
    const snapshot = identifiedRecord(
      await command({
        path: `/pricing/opportunities/${opportunityId}/snapshots`,
        body: {
          pricingRuleVersionNumber: rule.versionNumber,
          lines: [
            {
              offeringId: offering.id,
              tariffVersionNumber: tariff.versionNumber,
              quantity: '1',
            },
          ],
        },
        key: 'snapshot-456' + suffix,
        companyId: company.id,
      }),
    );
    return {
      companyId: company.id,
      requestId: stringField(intake, 'id'),
      opportunityId,
      clientId: client.id,
      snapshotId: snapshot.id,
      actorMembershipId,
      ruleVersionNumber: rule.versionNumber,
      offeringId: offering.id,
      tariffVersionNumber: tariff.versionNumber,
    };
  }

  async function request({
    path,
    companyId,
    init = {},
  }: {
    path: string;
    companyId?: string;
    init?: RequestInit;
  }): Promise<Response> {
    return fetch(`${origin}/api${path}`, {
      ...init,
      headers: {
        ...OWNER,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        ...Object.fromEntries(new Headers(init.headers).entries()),
      },
    });
  }
});
function identifiedRecord(
  value: unknown,
): Record<string, unknown> & { id: string } {
  const result = record(value);
  return { ...result, id: stringField(result, 'id') };
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
