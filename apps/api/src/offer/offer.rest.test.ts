import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { ActorContext } from '../access/access.types.js';
import { CommercialResponsibleAccessService } from '../access/commercial-responsible-access.service.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { CommercialCatalogueService } from '../commercial-catalogue/commercial-catalogue.service.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { readCreateCommercialIntakeCommand } from '../commercial-intake/commercial-intake.validation.js';
import { DatabaseContext } from '../database/database-context.js';
import { PricingSnapshotService } from '../pricing-configuration/pricing-snapshot.service.js';
import { OfferService } from './offer.service.js';
import type { Pool } from 'pg';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFailed,
} from 'vitest';
import type { ServerClock } from '../clock/server-clock.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

// Synthetic data only. The Snapshot and Offer are illustrative and have no
// commercial, fiscal, contractual or legal effect.
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

const FOLLOW_ON_OPPORTUNITIES = {
  concurrent: {
    title: 'Concurrent Offer for the same Client',
    nextAction: 'Prepare Offer',
  },
  mismatch: {
    title: 'Second illustrative Opportunity',
    nextAction: 'Calculate the second Snapshot',
  },
  reference: {
    title: 'Second Offer',
    nextAction: 'Prepare Offer',
  },
};

interface WaitingRequest {
  pid: number;
  blockers: number[];
  clientWrite: boolean;
  profileWrite: boolean;
}

describe('Offer REST test support', () => {
  it.each(Object.entries(FOLLOW_ON_OPPORTUNITIES))(
    'accepts the %s follow-on Request fixture through the public validator',
    (_name, opportunity) => {
      expect(() =>
        readCreateCommercialIntakeCommand({
          originalText: 'Synthetic follow-on Request.',
          opportunity,
        }),
      ).not.toThrow();
    },
  );

  it('observes both direct and queued waiters behind the same barrier', () => {
    expect(
      countBlockedRequests(
        [
          { pid: 20, blockers: [10], clientWrite: false, profileWrite: false },
          { pid: 30, blockers: [20], clientWrite: false, profileWrite: false },
          { pid: 40, blockers: [99], clientWrite: false, profileWrite: false },
        ],
        10,
      ),
    ).toBe(2);
  });

  it('distinguishes an identity-profile waiter from the Client writers ahead of it', () => {
    expect(
      countBlockedRequests(
        [
          { pid: 20, blockers: [10], clientWrite: true, profileWrite: false },
          { pid: 30, blockers: [20], clientWrite: false, profileWrite: true },
          { pid: 40, blockers: [10], clientWrite: true, profileWrite: false },
        ],
        10,
        'profile',
      ),
    ).toBe(1);
  });

  it('counts only Client writers in the barrier chain when requested', () => {
    expect(
      countBlockedRequests(
        [
          { pid: 30, blockers: [20], clientWrite: true, profileWrite: false },
          { pid: 20, blockers: [10], clientWrite: true, profileWrite: false },
          { pid: 40, blockers: [10], clientWrite: false, profileWrite: false },
          { pid: 50, blockers: [99], clientWrite: true, profileWrite: false },
        ],
        10,
        'client',
      ),
    ).toBe(2);
  });
});

let instant = new Date('2026-09-27T09:00:00.000Z');
const serverClock: ServerClock = { now: () => new Date(instant.getTime()) };

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

withPostgres('First illustrative Offer REST', () => {
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
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Illustrative Offer Workspace',
      },
    });
    ({ origin, pool } = harness);
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'first_offer',
    });
    await openHarness();
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

  it('approves the exact version with a committed decision run and unchanged representation', async () => {
    const fixture = await preparedOffer();
    const offer = identifiedRecord(
      await command(
        `/offers/opportunities/${fixture.opportunityId}`,
        {
          pricingSnapshotId: fixture.snapshotId,
          recipient: { kind: 'PRIMARY' },
        },
        'decision-offer',
        fixture.companyId,
      ),
    );
    await command(
      '/company-offer-approver-assignments',
      {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      'grant-approver',
    );
    const version = record(offer.version);
    const path = `/offers/opportunities/${fixture.opportunityId}/versions/${stringField(version, 'id')}/approve`;
    const body = { expectedOfferRevision: 1, acknowledgedWarningCodes: [] };
    const decision = record(
      await command(path, body, 'approve-exact', fixture.companyId),
    );
    expect(decision).toMatchObject({
      state: 'APPROVED',
      offerRevision: 2,
      actorWorkspaceMembershipId: fixture.actorMembershipId,
      decidedAt: instant.toISOString(),
      acknowledgedWarningCodes: [],
      representationSha256: record(version.representation).sha256,
    });
    expect(record(decision.qualityRun).offerVersionId).toBe(version.id);
    instant = new Date('2027-01-01T00:00:00.000Z');
    expect(
      await command(path, body, 'approve-exact', fixture.companyId),
    ).toEqual(decision);
    const reopened = record(
      record(
        await json(
          await request(
            `/offers/opportunities/${fixture.opportunityId}`,
            fixture.companyId,
          ),
        ),
      ).offer,
    );
    expect(reopened.revision).toBe(2);
    expect(record(reopened.version)).toMatchObject({
      decisionState: 'APPROVED',
      decision,
      representation: version.representation,
    });
  });

  it('requires the exact current warning set including identity changes after an earlier run', async () => {
    const { fixture, offer, base } = await decisionOffer();
    await command(
      base + '/quality-checks',
      {},
      'earlier-run',
      fixture.companyId,
    );
    await pool.query(
      "UPDATE client_accounts SET display_name = 'Corrected recipient' WHERE id = $1",
      [fixture.clientId],
    );
    for (const codes of [
      [],
      ['RECIPIENT_TAX_ID_RECORDED'],
      ['RECIPIENT_IDENTITY_CURRENT', 'VALIDITY_OPEN'],
    ]) {
      const response = await decisionRequest(
        fixture,
        base + '/approve',
        { expectedOfferRevision: 1, acknowledgedWarningCodes: codes },
        'warnings-' + codes.join('-'),
      );
      expect(response.status).toBe(409);
      expect(await json(response)).toMatchObject({
        code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED',
      });
    }
    expect(
      (
        await decisionRequest(
          fixture,
          base + '/approve',
          {
            expectedOfferRevision: 1,
            acknowledgedWarningCodes: [
              'RECIPIENT_IDENTITY_CURRENT',
              'RECIPIENT_IDENTITY_CURRENT',
            ],
          },
          'duplicate-warning',
        )
      ).status,
    ).toBe(400);
    const approved = record(
      await command(
        base + '/approve',
        {
          expectedOfferRevision: 1,
          acknowledgedWarningCodes: ['RECIPIENT_IDENTITY_CURRENT'],
        },
        'current-warning',
        fixture.companyId,
      ),
    );
    expect(record(approved.qualityRun).results).toContainEqual({
      code: 'RECIPIENT_IDENTITY_CURRENT',
      status: 'WARNING',
    });
    expect(approved.representationSha256).toBe(
      record(record(offer.version).representation).sha256,
    );
    expect(
      (
        await pool.query(
          'SELECT count(*)::integer AS count FROM offer_quality_runs',
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
    expect(
      (
        await pool.query(
          "SELECT action,metadata FROM offer_events WHERE action = 'offer_version.approved'",
        )
      ).rows,
    ).toEqual([
      {
        action: 'offer_version.approved',
        metadata: {
          offerId: offer.id,
          offerVersionId: record(offer.version).id,
          versionNumber: 1,
          outcome: 'APPROVED',
          provenance: 'ILLUSTRATIVE',
          ruleSetVersion: 1,
          acknowledgedWarningCodes: ['RECIPIENT_IDENTITY_CURRENT'],
        },
      },
    ]);
  });

  it.each([
    'PRICING_SNAPSHOT_COHERENT',
    'VALIDITY_OPEN',
    'RECIPIENT_AVAILABLE',
    'PROVISIONAL_MARKER_PRESENT',
  ])(
    'refuses approval for current %s errors after a successful earlier run and commits nothing',
    async (code) => {
      const { fixture, base } = await decisionOffer();
      await command(
        base + '/quality-checks',
        {},
        'earlier-success',
        fixture.companyId,
      );
      let constraint: string | undefined;
      if (code === 'PRICING_SNAPSHOT_COHERENT')
        await pool.query(
          'UPDATE pricing_snapshots SET subtotal = subtotal + 1, total = total + 1 WHERE id = $1',
          [fixture.snapshotId],
        );
      if (code === 'VALIDITY_OPEN')
        instant = new Date(instant.getTime() + 30 * 86400000);
      if (code === 'RECIPIENT_AVAILABLE')
        await pool.query(
          "UPDATE client_company_relationships SET status = 'archived' WHERE company_id = $1",
          [fixture.companyId],
        );
      if (code === 'PROVISIONAL_MARKER_PRESENT') {
        const [row] = (
          await pool.query<{ definition: string }>(
            "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'offer_versions_initial_state_check'",
          )
        ).rows;
        if (!row) throw new Error('Expected version constraint');
        constraint = row.definition;
        await pool.query(
          'ALTER TABLE offer_versions DROP CONSTRAINT offer_versions_initial_state_check',
        );
        await pool.query(
          "UPDATE offer_versions SET provenance = 'INVALID_SYNTHETIC' WHERE company_id = $1",
          [fixture.companyId],
        );
      }
      try {
        const response = await decisionRequest(
          fixture,
          base + '/approve',
          { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
          'blocked-error',
        );
        expect(response.status).toBe(409);
        expect(await json(response)).toMatchObject({
          code: 'QUALITY_CHECK_ERRORS',
        });
        expect((await pool.query('SELECT revision FROM offers')).rows).toEqual([
          { revision: 1 },
        ]);
        expect(
          (
            await pool.query(
              'SELECT count(*)::integer AS count FROM offer_decisions',
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
        expect(
          (
            await pool.query(
              'SELECT count(*)::integer AS count FROM offer_quality_runs',
            )
          ).rows,
        ).toEqual([{ count: 1 }]);
        expect(
          (
            await pool.query(
              'SELECT count(*)::integer AS count FROM offer_events',
            )
          ).rows,
        ).toEqual([{ count: 2 }]);
      } finally {
        if (constraint) {
          await pool.query(
            "UPDATE offer_versions SET provenance = 'ILLUSTRATIVE' WHERE company_id = $1",
            [fixture.companyId],
          );
          await pool.query(
            'ALTER TABLE offer_versions ADD CONSTRAINT offer_versions_initial_state_check ' +
              constraint,
          );
        }
      }
    },
  );

  it('records a reasoned terminal rejection and refuses changed payload or second decision', async () => {
    const { fixture, offer, base } = await decisionOffer();
    for (const reason of ['', ' ', 'a'.repeat(501)])
      expect(
        (
          await decisionRequest(
            fixture,
            base + '/reject',
            { expectedOfferRevision: 1, reason },
            'bad-reason-' + reason.length,
          )
        ).status,
      ).toBe(400);
    const body = {
      expectedOfferRevision: 1,
      reason: 'Synthetic decision: revise the conditions.',
    };
    const rejected = record(
      await command(base + '/reject', body, 'reject-exact', fixture.companyId),
    );
    expect(rejected).toMatchObject({
      state: 'REJECTED',
      reason: body.reason,
      offerRevision: 2,
      actorWorkspaceMembershipId: fixture.actorMembershipId,
      decidedAt: instant.toISOString(),
    });
    expect(
      await command(base + '/reject', body, 'reject-exact', fixture.companyId),
    ).toEqual(rejected);
    const second = await decisionRequest(
      fixture,
      base + '/approve',
      { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
      'second-decision',
    );
    expect(second.status).toBe(409);
    expect(await json(second)).toMatchObject({
      code: 'OFFER_VERSION_ALREADY_DECIDED',
    });
    const changed = await decisionRequest(
      fixture,
      base + '/reject',
      { ...body, reason: 'Changed' },
      'reject-exact',
    );
    expect(changed.status).toBe(409);
    expect(await json(changed)).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const reopened = record(
      record(
        await json(
          await request(
            `/offers/opportunities/${fixture.opportunityId}`,
            fixture.companyId,
          ),
        ),
      ).offer,
    );
    expect(record(reopened.version)).toMatchObject({
      decisionState: 'REJECTED',
      decision: rejected,
      representation: record(offer.version).representation,
    });
    expect(
      (
        await pool.query(
          "SELECT action,metadata FROM offer_events WHERE action = 'offer_version.rejected'",
        )
      ).rows,
    ).toEqual([
      {
        action: 'offer_version.rejected',
        metadata: {
          offerId: offer.id,
          offerVersionId: record(offer.version).id,
          versionNumber: 1,
          outcome: 'REJECTED',
          provenance: 'ILLUSTRATIVE',
        },
      },
    ]);
    await expect(
      pool.query("UPDATE offer_decisions SET reason = 'Changed'"),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('DELETE FROM offer_decisions'),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('keeps preparation and approval independent and lends only the referenced Snapshot to an approver', async () => {
    const { fixture, base } = await decisionOffer();
    await pool.query(
      "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text IN ('company_offer_preparer','company_pricing_user','company_director_client_access')",
      [fixture.companyId],
    );
    const read = await request(
      `/offers/opportunities/${fixture.opportunityId}`,
      fixture.companyId,
    );
    expect(read.status).toBe(200);
    expect(
      record(record(record(await json(read)).offer).version).pricingSnapshot,
    ).toMatchObject({ id: fixture.snapshotId, total: '345.00' });
    expect(
      (
        await request(
          `/pricing/opportunities/${fixture.opportunityId}/snapshots`,
          fixture.companyId,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/clients/${fixture.clientId}/legal-entities`,
          fixture.companyId,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await decisionRequest(
          fixture,
          `/offers/opportunities/${fixture.opportunityId}`,
          {
            pricingSnapshotId: fixture.snapshotId,
            recipient: { kind: 'PRIMARY' },
          },
          'approver-create',
        )
      ).status,
    ).toBe(403);
    expect(
      record(
        await command(
          base + '/quality-checks',
          {},
          'approver-checks',
          fixture.companyId,
        ),
      ).ruleSetVersion,
    ).toBe(1);
    await command(
      base + '/approve',
      { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
      'approver-only-decision',
      fixture.companyId,
    );
    expect(
      (
        await request(
          `/company-offer-approver-assignments/${fixture.actorMembershipId}/${fixture.companyId}`,
          undefined,
          {
            method: 'DELETE',
            headers: { 'idempotency-key': 'revoke-approver' },
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await decisionRequest(
          fixture,
          base + '/approve',
          { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
          'approver-only-decision',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/offers/opportunities/${fixture.opportunityId}`,
          fixture.companyId,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await pool.query(
          "SELECT action::text AS action,metadata FROM activity_log_events WHERE action::text LIKE 'company_offer_approver_assignment.%' ORDER BY occurred_at,id",
        )
      ).rows,
    ).toEqual([
      {
        action: 'company_offer_approver_assignment.granted',
        metadata: { bundle: 'Company Offer Approver' },
      },
      {
        action: 'company_offer_approver_assignment.revoked',
        metadata: { bundle: 'Company Offer Approver' },
      },
    ]);
  });

  it('denies preparer decisions, unknown captured approver versions and missing Opportunity visibility', async () => {
    const { fixture, base } = await decisionOffer();
    await pool.query(
      "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text = 'company_offer_approver'",
      [fixture.companyId],
    );
    expect(
      (
        await decisionRequest(
          fixture,
          base + '/reject',
          { expectedOfferRevision: 1, reason: 'Synthetic' },
          'preparer-reject',
        )
      ).status,
    ).toBe(403);
    await command(
      '/company-offer-approver-assignments',
      {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      'fresh-approver',
    );
    const [constraint] = (
      await pool.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'company_role_assignments_permission_set_version_check'",
      )
    ).rows;
    if (!constraint) throw new Error('Expected assignment constraint');
    await pool.query(
      'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
    );
    try {
      for (const version of [null, 'v99']) {
        await pool.query(
          "UPDATE company_role_assignments SET permission_set_version = $1 WHERE company_id = $2 AND bundle::text = 'company_offer_approver'",
          [version, fixture.companyId],
        );
        expect(
          (
            await decisionRequest(
              fixture,
              base + '/approve',
              { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
              'unknown-' + version,
            )
          ).status,
        ).toBe(403);
      }
    } finally {
      await pool.query(
        "UPDATE company_role_assignments SET permission_set_version = 'v1' WHERE company_id = $1 AND bundle::text = 'company_offer_approver'",
        [fixture.companyId],
      );
      await pool.query(
        'ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ' +
          constraint.definition,
      );
    }
    await pool.query(
      "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text = 'company_commercial_intake'",
      [fixture.companyId],
    );
    expect(
      (
        await decisionRequest(
          fixture,
          base + '/reject',
          { expectedOfferRevision: 1, reason: 'Synthetic' },
          'missing-opportunity',
        )
      ).status,
    ).toBe(403);
    expect((await pool.query('SELECT id FROM offer_decisions')).rowCount).toBe(
      0,
    );
  });

  it('serializes concurrent approve and reject so only one decision commits', async () => {
    const { fixture, offer, base } = await decisionOffer();
    const barrier = await pool.connect();
    let pending: Promise<Response[]> | undefined;
    try {
      await barrier.query('BEGIN');
      const [backend] = (
        await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows;
      if (!backend) throw new Error('Expected backend');
      await barrier.query('SELECT id FROM offers WHERE id = $1 FOR UPDATE', [
        offer.id,
      ]);
      pending = Promise.all([
        decisionRequest(
          fixture,
          base + '/approve',
          { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
          'race-approve',
        ),
        decisionRequest(
          fixture,
          base + '/reject',
          {
            expectedOfferRevision: 1,
            reason: 'Synthetic concurrent rejection',
          },
          'race-reject',
        ),
      ]);
      await waitForBlockedRequests(backend.pid, 2);
      await barrier.query('COMMIT');
      const responses = await pending;
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      const loser = responses.find((r) => r.status === 409);
      if (!loser) throw new Error('Expected stale loser');
      expect(await json(loser)).toMatchObject({ code: 'STALE_OFFER_REVISION' });
      expect(
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM offer_decisions',
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
      expect((await pool.query('SELECT revision FROM offers')).rows).toEqual([
        { revision: 2 },
      ]);
      expect(
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM offer_events',
          )
        ).rows,
      ).toEqual([{ count: 3 }]);
    } finally {
      await barrier.query('ROLLBACK');
      barrier.release();
      if (pending) await Promise.allSettled([pending]);
    }
  });

  it('denies a decision waiting behind a committed assignment revocation', async () => {
    const { fixture, base } = await decisionOffer();
    const { offers: service, actor } = await offerServiceContext(fixture);
    const versionId = base.split('/').at(-1);
    if (!versionId) throw new Error('Expected version');
    const barrier = await pool.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await barrier.query('BEGIN');
      const [backend] = (
        await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows;
      if (!backend) throw new Error('Expected backend');
      await barrier.query(
        "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text = 'company_offer_approver'",
        [fixture.companyId],
      );
      pending = service.decide({
        actor,
        opportunityId: fixture.opportunityId,
        offerVersionId: versionId,
        payload: { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
        idempotencyKey: 'revoked-race',
        kind: 'APPROVE',
      });
      const settled = pending.then(
        (value) => ({ value, error: undefined }),
        (error: unknown) => ({ value: undefined, error }),
      );
      await waitForBlockedRequests(backend.pid, 1);
      await barrier.query('COMMIT');
      expect((await settled).error).toMatchObject({ status: 403 });
      expect(
        (await pool.query('SELECT id FROM offer_decisions')).rowCount,
      ).toBe(0);
    } finally {
      await barrier.query('ROLLBACK');
      barrier.release();
      if (pending) await Promise.allSettled([pending]);
    }
  });

  it.each(['offer_commands', 'offer_events'])(
    'rolls back approval, run, revision and receipt when %s insertion fails and accepts the identical retry',
    async (table) => {
      const { fixture, base } = await decisionOffer();
      await pool.query(
        `CREATE FUNCTION fail_decision_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic decision write failure'; END $$; CREATE TRIGGER fail_decision_test BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_decision_test()`,
      );
      const body = { expectedOfferRevision: 1, acknowledgedWarningCodes: [] };
      try {
        expect(
          (
            await decisionRequest(
              fixture,
              base + '/approve',
              body,
              'rollback-approval',
            )
          ).status,
        ).toBe(500);
        expect(
          (await pool.query('SELECT id FROM offer_decisions')).rowCount,
        ).toBe(0);
        expect(
          (await pool.query('SELECT id FROM offer_quality_runs')).rowCount,
        ).toBe(0);
        expect((await pool.query('SELECT revision FROM offers')).rows).toEqual([
          { revision: 1 },
        ]);
        expect(
          (await pool.query('SELECT id FROM offer_commands')).rowCount,
        ).toBe(1);
        expect((await pool.query('SELECT id FROM offer_events')).rowCount).toBe(
          2,
        );
      } finally {
        await pool.query(
          `DROP TRIGGER fail_decision_test ON ${table}; DROP FUNCTION fail_decision_test()`,
        );
      }
      expect(
        record(
          await command(
            base + '/approve',
            body,
            'rollback-approval',
            fixture.companyId,
          ),
        ).state,
      ).toBe('APPROVED');
    },
  );

  it('stores an immutable Quality Check run, reopens its latest result and replays without evaluating again', async () => {
    const fixture = await preparedOffer();
    const offer = identifiedRecord(
      await command(
        `/offers/opportunities/${fixture.opportunityId}`,
        {
          pricingSnapshotId: fixture.snapshotId,
          recipient: { kind: 'PRIMARY' },
        },
        'quality-offer',
        fixture.companyId,
      ),
    );
    const versionId = stringField(record(offer.version), 'id');
    const path = `/offers/opportunities/${fixture.opportunityId}/versions/${versionId}/quality-checks`;
    const run = identifiedRecord(
      await command(path, {}, 'quality-run', fixture.companyId),
    );
    expect(run).toMatchObject({
      offerVersionId: versionId,
      ruleSet: 'OFFER_QUALITY_ILLUSTRATIVE',
      ruleSetVersion: 1,
      actorWorkspaceMembershipId: fixture.actorMembershipId,
      evaluatedAt: instant.toISOString(),
    });
    expect(run.results).toEqual([
      { code: 'PRICING_SNAPSHOT_COHERENT', status: 'PASS' },
      { code: 'CURRENCY_UNCHANGED', status: 'PASS' },
      { code: 'VALIDITY_OPEN', status: 'PASS' },
      { code: 'RECIPIENT_AVAILABLE', status: 'PASS' },
      { code: 'RECIPIENT_IDENTITY_CURRENT', status: 'PASS' },
      { code: 'RECIPIENT_TAX_ID_RECORDED', status: 'PASS' },
      { code: 'PRICING_CLIENT_CONTEXT_COHERENT', status: 'PASS' },
      { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
    ]);
    instant = new Date('2027-01-01T00:00:00.000Z');
    expect(await command(path, {}, 'quality-run', fixture.companyId)).toEqual(
      run,
    );
    const next = identifiedRecord(
      await command(path, {}, 'quality-run-new', fixture.companyId),
    );
    expect(next.id).not.toBe(run.id);
    expect(next.results).toContainEqual({
      code: 'VALIDITY_OPEN',
      status: 'ERROR',
    });
    const reopened = record(
      record(
        await json(
          await request(
            `/offers/opportunities/${fixture.opportunityId}`,
            fixture.companyId,
          ),
        ),
      ).offer,
    );
    expect(reopened.revision).toBe(1);
    expect(record(reopened.version).latestQualityRun).toEqual(next);
    expect(record(reopened.version).representation).toEqual(
      record(offer.version).representation,
    );
    expect(
      (await pool.query('SELECT count(*)::integer AS count FROM offer_events'))
        .rows,
    ).toEqual([{ count: 2 }]);
  });

  it('uses identical safe not-found outcomes for hidden decision targets and rejects stale revision without effects', async () => {
    const { fixture, base } = await decisionOffer();
    const other = entity(
      await command(
        '/companies',
        { displayName: 'Other decision Company' },
        'other-decision-company',
      ),
    );
    for (const path of [
      '/company-offer-approver-assignments',
      '/company-commercial-intake-assignments',
    ])
      await command(
        path,
        {
          workspaceMembershipId: fixture.actorMembershipId,
          companyId: other.id,
        },
        'other-decision-' + path,
      );
    const unknown = '00000000-0000-4000-8000-999999999999';
    const payload = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'hidden-decision',
      },
      body: JSON.stringify({ expectedOfferRevision: 1, reason: 'Synthetic' }),
    };
    const hidden = [
      await request(base + '/reject', other.id, payload),
      await request(
        `/offers/opportunities/${unknown}/versions/${base.split('/').at(-1)}/reject`,
        fixture.companyId,
        payload,
      ),
      await request(
        `/offers/opportunities/${fixture.opportunityId}/versions/${unknown}/reject`,
        fixture.companyId,
        payload,
      ),
    ];
    const bodies: unknown[] = [];
    for (const response of hidden) {
      expect(response.status).toBe(404);
      bodies.push(await json(response));
    }
    expect(bodies).toEqual([bodies[0], bodies[0], bodies[0]]);
    const stale = await decisionRequest(
      fixture,
      base + '/reject',
      { expectedOfferRevision: 2, reason: 'Synthetic' },
      'stale-decision',
    );
    expect(stale.status).toBe(409);
    expect(await json(stale)).toMatchObject({ code: 'STALE_OFFER_REVISION' });
    const { offers: service, actor } = await offerServiceContext(fixture);
    const versionId = base.split('/').at(-1);
    if (!versionId) throw new Error('Expected version');
    await expect(
      service.decide({
        actor: { ...actor, workspaceId: unknown },
        opportunityId: fixture.opportunityId,
        offerVersionId: versionId,
        payload: { expectedOfferRevision: 1, reason: 'Synthetic' },
        kind: 'REJECT',
        idempotencyKey: 'cross-workspace-decision',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect((await pool.query('SELECT id FROM offer_decisions')).rowCount).toBe(
      0,
    );
    expect((await pool.query('SELECT id FROM offer_events')).rowCount).toBe(2);
  });

  it('checks corrected hidden recipient identity without lending Client visibility or changing recorded content', async () => {
    const fixture = await preparedOffer();
    const offer = identifiedRecord(
      await command(
        `/offers/opportunities/${fixture.opportunityId}`,
        {
          pricingSnapshotId: fixture.snapshotId,
          recipient: { kind: 'PRIMARY' },
        },
        'quality-offer',
        fixture.companyId,
      ),
    );
    await pool.query(
      "UPDATE client_accounts SET display_name = 'Hidden corrected recipient', tax_id = 'HIDDEN-TAX', address = 'Hidden address' WHERE id = $1",
      [fixture.clientId],
    );
    await pool.query(
      "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle = 'company_director_client_access'",
      [fixture.companyId],
    );
    const run = record(
      await command(
        `/offers/opportunities/${fixture.opportunityId}/versions/${stringField(record(offer.version), 'id')}/quality-checks`,
        {},
        'hidden-identity-check',
        fixture.companyId,
      ),
    );
    expect(run.results).toContainEqual({
      code: 'RECIPIENT_IDENTITY_CURRENT',
      status: 'WARNING',
    });
    expect(run.results).toContainEqual({
      code: 'RECIPIENT_AVAILABLE',
      status: 'PASS',
    });
    expect(JSON.stringify(run)).not.toContain('Hidden');
    expect(JSON.stringify(run)).not.toContain('HIDDEN-TAX');
    const reopened = record(
      record(
        await json(
          await request(
            `/offers/opportunities/${fixture.opportunityId}`,
            fixture.companyId,
          ),
        ),
      ).offer,
    );
    expect(record(reopened.version).recipient).toEqual(
      record(offer.version).recipient,
    );
    expect(record(reopened.version).representation).toEqual(
      record(offer.version).representation,
    );
    expect(
      (
        await request(
          `/clients/${fixture.clientId}/legal-entities`,
          fixture.companyId,
        )
      ).status,
    ).toBe(403);
  });

  it.each(['company_offer_preparer', 'company_commercial_intake'])(
    'denies Quality Check replay after %s authority revocation',
    async (bundle) => {
      const fixture = await preparedOffer();
      const offer = identifiedRecord(
        await command(
          `/offers/opportunities/${fixture.opportunityId}`,
          {
            pricingSnapshotId: fixture.snapshotId,
            recipient: { kind: 'PRIMARY' },
          },
          'quality-offer',
          fixture.companyId,
        ),
      );
      const path = `/offers/opportunities/${fixture.opportunityId}/versions/${stringField(record(offer.version), 'id')}/quality-checks`;
      await command(path, {}, 'quality-revoke', fixture.companyId);
      await pool.query(
        'UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text = $2',
        [fixture.companyId, bundle],
      );
      const denied = await request(path, fixture.companyId, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'quality-revoke',
        },
        body: '{}',
      });
      expect(denied.status).toBe(403);
      expect(JSON.stringify(await json(denied))).not.toContain('results');
      expect(
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM offer_quality_runs',
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
      expect(
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM offer_events',
          )
        ).rows,
      ).toEqual([{ count: 2 }]);
    },
  );

  it('conflicts on changed input and creates only one immutable run for concurrent identical Quality Check requests', async () => {
    const fixture = await preparedOffer();
    const offer = identifiedRecord(
      await command(
        `/offers/opportunities/${fixture.opportunityId}`,
        {
          pricingSnapshotId: fixture.snapshotId,
          recipient: { kind: 'PRIMARY' },
        },
        'quality-offer',
        fixture.companyId,
      ),
    );
    const path = `/offers/opportunities/${fixture.opportunityId}/versions/${stringField(record(offer.version), 'id')}/quality-checks`;
    const results = await Promise.all([
      command(path, {}, 'quality-concurrent', fixture.companyId),
      command(path, {}, 'quality-concurrent', fixture.companyId),
    ]);
    expect(results[0]).toEqual(results[1]);
    const changed = await request(path, fixture.companyId, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'quality-concurrent',
      },
      body: '{"expectedOfferRevision":1}',
    });
    expect(changed.status).toBe(409);
    expect(await json(changed)).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const invalid = await request(path, fixture.companyId, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'quality-invalid',
      },
      body: '{"expectedOfferRevision":1}',
    });
    expect(invalid.status).toBe(400);
    expect(
      (
        await pool.query(
          'SELECT count(*)::integer AS count FROM offer_quality_runs',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
    await expect(
      pool.query('UPDATE offer_quality_runs SET evaluated_at = now()'),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('DELETE FROM offer_quality_runs'),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rolls back a Quality Check run when its receipt fails and accepts the identical retry', async () => {
    const fixture = await preparedOffer();
    const offer = identifiedRecord(
      await command(
        `/offers/opportunities/${fixture.opportunityId}`,
        {
          pricingSnapshotId: fixture.snapshotId,
          recipient: { kind: 'PRIMARY' },
        },
        'quality-offer',
        fixture.companyId,
      ),
    );
    const path = `/offers/opportunities/${fixture.opportunityId}/versions/${stringField(record(offer.version), 'id')}/quality-checks`;
    await pool.query(
      `CREATE FUNCTION reject_quality_receipt_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic receipt failure'; END $$; CREATE TRIGGER reject_quality_receipt_test BEFORE INSERT ON offer_commands FOR EACH ROW EXECUTE FUNCTION reject_quality_receipt_test()`,
    );
    try {
      const response = await request(path, fixture.companyId, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'quality-rollback',
        },
        body: '{}',
      });
      expect(response.status).toBe(500);
      expect(
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM offer_quality_runs',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect(
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM offer_commands',
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    } finally {
      await pool.query(
        'DROP TRIGGER reject_quality_receipt_test ON offer_commands; DROP FUNCTION reject_quality_receipt_test()',
      );
    }
    const retried = record(
      await command(path, {}, 'quality-rollback', fixture.companyId),
    );
    expect(retried.ruleSetVersion).toBe(1);
    expect(
      (
        await pool.query(
          'SELECT count(*)::integer AS count FROM offer_quality_runs',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
    expect(
      (await pool.query('SELECT count(*)::integer AS count FROM offer_events'))
        .rows,
    ).toEqual([{ count: 2 }]);
  });

  it('keeps resolved Client identity while recording recipient unavailability after the relationship changes behind its owner fence', async () => {
    const fixture = await preparedOffer();
    const offer = identifiedRecord(
      await command(
        `/offers/opportunities/${fixture.opportunityId}`,
        {
          pricingSnapshotId: fixture.snapshotId,
          recipient: { kind: 'PRIMARY' },
        },
        'quality-offer',
        fixture.companyId,
      ),
    );
    const path = `/offers/opportunities/${fixture.opportunityId}/versions/${stringField(record(offer.version), 'id')}/quality-checks`;
    const barrier = await pool.connect();
    let released = false;
    try {
      await barrier.query('BEGIN');
      const [backend] = (
        await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows;
      if (!backend) throw new Error('Expected barrier backend.');
      await barrier.query(
        'SELECT id FROM client_accounts WHERE id = $1 FOR UPDATE',
        [fixture.clientId],
      );
      const pending = command(
        path,
        {},
        'quality-owner-fence',
        fixture.companyId,
      );
      await waitForBlockedRequests(backend.pid, 1);
      await barrier.query(
        "UPDATE client_company_relationships SET status = 'archived' WHERE company_id = $1 AND client_account_id = $2",
        [fixture.companyId, fixture.clientId],
      );
      await barrier.query('COMMIT');
      released = true;
      const run = record(await pending);
      expect(run.results).toContainEqual({
        code: 'RECIPIENT_AVAILABLE',
        status: 'ERROR',
      });
      expect(run.results).toContainEqual({
        code: 'PRICING_CLIENT_CONTEXT_COHERENT',
        status: 'PASS',
      });
      expect(run.results).toContainEqual({
        code: 'RECIPIENT_IDENTITY_CURRENT',
        status: 'PASS',
      });
    } finally {
      if (!released) await barrier.query('ROLLBACK');
      barrier.release();
    }
  });

  it('does not reveal a Quality Check target from another Company, Workspace or unknown version', async () => {
    const fixture = await preparedOffer();
    const offer = identifiedRecord(
      await command(
        `/offers/opportunities/${fixture.opportunityId}`,
        {
          pricingSnapshotId: fixture.snapshotId,
          recipient: { kind: 'PRIMARY' },
        },
        'quality-offer',
        fixture.companyId,
      ),
    );
    const versionId = stringField(record(offer.version), 'id');
    const other = entity(
      await command(
        '/companies',
        { displayName: 'Other Quality Company' },
        'quality-other-company',
      ),
    );
    for (const path of [
      '/company-offer-preparer-assignments',
      '/company-commercial-intake-assignments',
    ])
      await command(
        path,
        {
          workspaceMembershipId: fixture.actorMembershipId,
          companyId: other.id,
        },
        `quality-other-${path}`,
      );
    const unknownId = '00000000-0000-4000-8000-999999999999';
    const payload = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'quality-unavailable',
      },
      body: '{}',
    };
    const responses = [
      await request(
        `/offers/opportunities/${fixture.opportunityId}/versions/${versionId}/quality-checks`,
        other.id,
        payload,
      ),
      await request(
        `/offers/opportunities/${unknownId}/versions/${versionId}/quality-checks`,
        fixture.companyId,
        payload,
      ),
      await request(
        `/offers/opportunities/${fixture.opportunityId}/versions/${unknownId}/quality-checks`,
        fixture.companyId,
        payload,
      ),
      await request(
        `/offers/opportunities/${fixture.opportunityId}/versions/not-a-uuid/quality-checks`,
        fixture.companyId,
        payload,
      ),
    ];
    const bodies: unknown[] = [];
    for (const response of responses) {
      expect(response.status).toBe(404);
      bodies.push(await json(response));
    }
    expect(bodies).toEqual(Array.from({ length: 4 }, () => bodies[0]));
    const { offers: service, actor } = await offerServiceContext(fixture);
    await expect(
      service.runQualityChecks({
        actor: { ...actor, workspaceId: unknownId },
        opportunityId: fixture.opportunityId,
        offerVersionId: versionId,
        payload: {},
        idempotencyKey: 'quality-cross-workspace',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (
        await pool.query(
          'SELECT count(*)::integer AS count FROM offer_quality_runs',
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });

  it('creates PRIMARY version 1 from one Snapshot and reopens the same immutable Offer after restart', async () => {
    const fixture = await preparedOffer();
    expect(
      await json(
        await request(
          `/offers/opportunities/${fixture.opportunityId}`,
          fixture.companyId,
        ),
      ),
    ).toEqual({ offer: null });
    const creation = {
      pricingSnapshotId: fixture.snapshotId,
      recipient: { kind: 'PRIMARY' },
      scopeNote: 'Illustrative preparation scope.',
      commercialConditions: 'Illustrative conditions only.',
    };
    const created = identifiedRecord(
      await command(
        `/offers/opportunities/${fixture.opportunityId}`,
        creation,
        'create-first-offer',
        fixture.companyId,
      ),
    );
    const versionId = stringField(record(created.version), 'id');

    expect(created).toMatchObject({
      opportunityId: fixture.opportunityId,
      clientRequestId: fixture.requestId,
      originalClientAccountId: fixture.clientId,
      illustrativeReference: 1,
      revision: 1,
      provisional: true,
      version: {
        versionNumber: 1,
        pricingSnapshotId: fixture.snapshotId,
        recipient: {
          kind: 'PRIMARY',
          legalName: 'Synthetic Recipient SA',
          taxId: 'SYNTHETIC-456',
          legalAddress: '456 Example Street',
        },
        issuingCompanyLabel: 'Illustrative Company 456',
        validityDays: 30,
        validUntil: '2026-10-27T09:00:00.000Z',
        scopeNote: creation.scopeNote,
        commercialConditions: creation.commercialConditions,
        decisionState: 'PENDING',
        transmissionState: 'NOT_TRANSMITTED',
        clientResponseState: 'NONE',
        provenance: 'ILLUSTRATIVE',
        provisional: true,
        createdByWorkspaceMembershipId: fixture.actorMembershipId,
        createdAt: instant.toISOString(),
      },
    });
    const representation = record(record(created.version).representation);
    const html = stringField(representation, 'html');
    expect(representation).toMatchObject({
      templateCode: 'OFFER_ILLUSTRATIVE',
      templateVersion: 1,
      sha256: createHash('sha256').update(html, 'utf8').digest('hex'),
    });
    const orderedContent = [
      'Provisional illustrative document',
      'Issuing Company',
      'Illustrative Offer reference',
      'Recipient legal name',
      'Created at',
      'Services',
      'Subtotal',
      'Scope note',
      'Commercial conditions',
      'Template Version',
    ];
    const contentOffsets = orderedContent.map((value) => html.indexOf(value));
    expect(contentOffsets).not.toContain(-1);
    expect(contentOffsets).toEqual(
      [...contentOffsets].sort((left, right) => left - right),
    );
    expect(html).not.toContain('PENDING');
    expect(html).not.toContain('NOT_TRANSMITTED');
    expect(html).not.toContain('NONE');
    expect(html).not.toContain('not approved');

    const storedColumns = await pool.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('offers', 'offer_versions')
          AND column_name IN (
            'currency', 'subtotal', 'tax_total', 'total', 'amount',
            'unit_amount', 'line_net', 'line_tax'
          )`,
    );
    expect(storedColumns.rows).toEqual([]);

    const events = await pool.query<{
      action: string;
      actor_workspace_membership_id: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT action, actor_workspace_membership_id, metadata
         FROM offer_events
        WHERE offer_id = $1
        ORDER BY action`,
      [created.id],
    );
    expect(events.rows).toEqual([
      {
        action: 'offer.created',
        actor_workspace_membership_id: fixture.actorMembershipId,
        metadata: {
          offerId: created.id,
          illustrativeReference: 1,
          provenance: 'ILLUSTRATIVE',
        },
      },
      {
        action: 'offer_version.created',
        actor_workspace_membership_id: fixture.actorMembershipId,
        metadata: {
          offerId: created.id,
          offerVersionId: versionId,
          versionNumber: 1,
          pricingSnapshotId: fixture.snapshotId,
          recipientKind: 'PRIMARY',
          provenance: 'ILLUSTRATIVE',
        },
      },
    ]);
    expect(JSON.stringify(events.rows)).not.toContain('346.72');
    expect(JSON.stringify(events.rows)).not.toContain('Synthetic Recipient');
    expect(JSON.stringify(events.rows)).not.toContain(creation.scopeNote);
    await expect(
      pool.query(
        `UPDATE offer_versions
            SET valid_until = valid_until + interval '1 hour'
          WHERE id = $1`,
        [versionId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        `UPDATE offer_events
            SET metadata = metadata || '{"unexpected":"forbidden"}'::jsonb
          WHERE offer_id = $1`,
        [created.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    for (const event of events.rows) {
      for (const field of Object.keys(event.metadata)) {
        await expect(
          pool.query(
            `UPDATE offer_events
                SET metadata = jsonb_set(metadata, ARRAY[$3]::text[], 'null'::jsonb)
              WHERE offer_id = $1 AND action = $2`,
            [created.id, event.action, field],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      }
    }

    const beforeReopenSideEffects = await pool.query<{
      receipts: string;
      events: string;
      activity: string;
    }>(`SELECT
      (SELECT count(*) FROM offer_commands)::text AS receipts,
      (SELECT count(*) FROM offer_events)::text AS events,
      (SELECT count(*) FROM activity_log_events)::text AS activity`);

    await harness.close();
    await openHarness();
    const reopenedResponse = await request(
      `/offers/opportunities/${fixture.opportunityId}`,
      fixture.companyId,
    );
    expect(reopenedResponse.status).toBe(200);
    const reopened = identifiedRecord(
      record(await json(reopenedResponse)).offer,
    );
    expect(reopened).toEqual(created);
    expect(reopened.revision).toBe(1);
    expect(
      await pool.query(`SELECT
        (SELECT count(*) FROM offer_commands)::text AS receipts,
        (SELECT count(*) FROM offer_events)::text AS events,
        (SELECT count(*) FROM activity_log_events)::text AS activity`),
    ).toMatchObject({ rows: beforeReopenSideEffects.rows });
  });

  it('freezes an ADDITIONAL recipient copy when the Client entity is corrected later', async () => {
    const fixture = await preparedOffer();
    const registered = record(
      await command(
        `/clients/${fixture.clientId}/legal-entities`,
        {
          expectedClientVersion: await readClientVersion(fixture),
          legalName: 'Synthetic Branch One',
          taxId: 'BRANCH-ONE',
          legalAddress: 'One Branch Street',
        },
        'register-offer-recipient',
        fixture.companyId,
      ),
    );
    const entity = record(registered.legalEntity);
    const entityId = stringField(entity, 'id');
    const created = identifiedRecord(
      await command(
        `/offers/opportunities/${fixture.opportunityId}`,
        {
          pricingSnapshotId: fixture.snapshotId,
          recipient: { kind: 'ADDITIONAL', legalEntityId: entityId },
          validityDays: 45,
          scopeNote: '  Text is kept exactly.  ',
          commercialConditions: '',
        },
        'create-additional-offer',
        fixture.companyId,
      ),
    );
    expect(record(record(created.version).recipient)).toEqual({
      kind: 'ADDITIONAL',
      additionalLegalEntityId: entityId,
      legalName: 'Synthetic Branch One',
      taxId: 'BRANCH-ONE',
      legalAddress: 'One Branch Street',
    });

    const corrected = await request(
      `/clients/${fixture.clientId}/legal-entities/${entityId}`,
      fixture.companyId,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'correct-offer-recipient',
        },
        body: JSON.stringify({
          expectedClientVersion: await readClientVersion(fixture),
          changes: {
            legalName: 'Corrected Branch Name',
            legalAddress: 'Corrected Branch Street',
          },
        }),
      },
    );
    expect(corrected.status).toBe(200);
    const reopened = identifiedRecord(
      record(
        await json(
          await request(
            `/offers/opportunities/${fixture.opportunityId}`,
            fixture.companyId,
          ),
        ),
      ).offer,
    );
    expect(record(record(reopened.version).recipient)).toEqual(
      record(record(created.version).recipient),
    );
    expect(record(record(reopened.version).representation)).toEqual(
      record(record(created.version).representation),
    );
    expect(record(reopened.version)).toMatchObject({
      validityDays: 45,
      scopeNote: '  Text is kept exactly.  ',
      commercialConditions: '',
    });
  });

  it('keeps PRIMARY representation bytes after later Client, Company and pricing changes and reads without Offer side effects', async () => {
    const fixture = await preparedOffer();
    const created = identifiedRecord(
      await command(
        `/offers/opportunities/${fixture.opportunityId}`,
        {
          pricingSnapshotId: fixture.snapshotId,
          recipient: { kind: 'PRIMARY' },
        },
        'offer-before-source-changes',
        fixture.companyId,
      ),
    );
    const createdVersion = record(created.version);
    const representation = record(createdVersion.representation);
    const {
      clientReference: createdClientReference,
      ...createdCalculationContent
    } = record(createdVersion.pricingSnapshot);
    expect(record(createdClientReference)).toEqual({
      originalClientId: fixture.clientId,
      currentClientId: fixture.clientId,
      displayName: 'Synthetic Recipient SA',
    });

    const correctedClient = await request(
      `/clients/${fixture.clientId}`,
      fixture.companyId,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'correct-client-after-offer',
        },
        body: JSON.stringify({
          expectedVersion: await readClientVersion(fixture),
          displayName: 'Corrected current Client',
          taxId: 'CORRECTED-501',
          address: '501 Current Street',
        }),
      },
    );
    const correctedClientBody = await json(correctedClient);
    expect(correctedClient.status, JSON.stringify(correctedClientBody)).toBe(
      200,
    );
    expect(correctedClientBody).toMatchObject({
      displayName: 'Corrected current Client',
      taxId: 'CORRECTED-501',
      address: '501 Current Street',
    });
    await pool.query('UPDATE companies SET display_name = $1 WHERE id = $2', [
      'Corrected current Company',
      fixture.companyId,
    ]);
    const successorEffectiveFrom = '2026-09-28T09:00:00.000Z';
    await command(
      '/pricing-configuration/rule-versions',
      {
        label: 'Later illustrative rule',
        effectiveFrom: successorEffectiveFrom,
        expectedActiveVersionNumber: fixture.ruleVersionNumber,
      },
      'later-rule-after-offer',
      fixture.companyId,
    );
    await command(
      `/pricing-configuration/offerings/${fixture.offeringId}/tariff-versions`,
      {
        unit: 'later-unit',
        unitAmount: '999.0000',
        currency: 'USD',
        taxRatePercent: '20.00',
        taxLabel: 'Later tax',
        effectiveFrom: successorEffectiveFrom,
        expectedActiveVersionNumber: fixture.tariffVersionNumber,
      },
      'later-tariff-after-offer',
      fixture.companyId,
    );

    const sideEffects = () =>
      pool.query<{
        revision: number;
        receipts: string;
        events: string;
        activity: string;
      }>(
        `SELECT offer.revision,
                (SELECT count(*) FROM offer_commands WHERE result_offer_id = offer.id)::text AS receipts,
                (SELECT count(*) FROM offer_events WHERE offer_id = offer.id)::text AS events,
                (SELECT count(*) FROM activity_log_events)::text AS activity
           FROM offers offer WHERE offer.id = $1`,
        [created.id],
      );
    const beforeRead = await sideEffects();
    expect(beforeRead.rows).toHaveLength(1);
    const reopenedResponse = await request(
      `/offers/opportunities/${fixture.opportunityId}`,
      fixture.companyId,
    );
    expect(reopenedResponse.status).toBe(200);
    const reopened = identifiedRecord(
      record(await json(reopenedResponse)).offer,
    );

    const reopenedVersion = record(reopened.version);
    expect(reopenedVersion).toMatchObject({
      recipient: {
        legalName: 'Synthetic Recipient SA',
        taxId: 'SYNTHETIC-456',
        legalAddress: '456 Example Street',
      },
      issuingCompanyLabel: 'Illustrative Company 456',
    });
    expect(record(reopenedVersion.recipient)).toEqual(
      record(createdVersion.recipient),
    );
    expect(reopenedVersion.issuingCompanyLabel).toBe(
      createdVersion.issuingCompanyLabel,
    );
    // Pricing PRD section 9 keeps the authorized Client projection current;
    // every other Snapshot field is immutable calculation content.
    const {
      clientReference: reopenedClientReference,
      ...reopenedCalculationContent
    } = record(reopenedVersion.pricingSnapshot);
    expect(record(reopenedClientReference)).toEqual({
      ...record(createdClientReference),
      displayName: 'Corrected current Client',
    });
    expect(reopenedCalculationContent).toEqual(createdCalculationContent);
    const reopenedRepresentation = record(reopenedVersion.representation);
    expect(stringField(reopenedRepresentation, 'html')).toBe(
      stringField(representation, 'html'),
    );
    expect(stringField(reopenedRepresentation, 'sha256')).toBe(
      stringField(representation, 'sha256'),
    );
    expect(reopenedRepresentation).toEqual(representation);
    expect(await sideEffects()).toMatchObject({ rows: beforeRead.rows });
  });

  it('replays exactly, conflicts a changed payload and denies replay after revocation without new success events', async () => {
    const fixture = await preparedOffer();
    const path = `/offers/opportunities/${fixture.opportunityId}`;
    const body = {
      pricingSnapshotId: fixture.snapshotId,
      recipient: { kind: 'PRIMARY' },
    };
    const created = identifiedRecord(
      await command(path, body, 'stable-offer-command', fixture.companyId),
    );
    const replayed = identifiedRecord(
      await command(path, body, 'stable-offer-command', fixture.companyId),
    );
    expect(replayed).toEqual(created);
    const changed = await request(path, fixture.companyId, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'stable-offer-command',
      },
      body: JSON.stringify({ ...body, validityDays: 31 }),
    });
    expect(changed.status).toBe(409);
    expect(await json(changed)).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(
      (
        await pool.query<{ count: string }>(
          'SELECT count(*) FROM offer_events WHERE offer_id = $1',
          [created.id],
        )
      ).rows[0]?.count,
    ).toBe('2');

    const revoked = await request(
      `/company-offer-preparer-assignments/${fixture.actorMembershipId}/${fixture.companyId}`,
      undefined,
      {
        method: 'DELETE',
        headers: { 'idempotency-key': 'revoke-offer-preparer' },
      },
    );
    expect(revoked.status).toBe(200);
    expect(
      (
        await pool.query<{ action: string; metadata: unknown }>(
          `SELECT action::text AS action, metadata
             FROM activity_log_events
            WHERE action::text LIKE 'company_offer_preparer_assignment.%'
            ORDER BY occurred_at, id`,
        )
      ).rows,
    ).toEqual([
      {
        action: 'company_offer_preparer_assignment.granted',
        metadata: { bundle: 'Company Offer Preparer' },
      },
      {
        action: 'company_offer_preparer_assignment.revoked',
        metadata: { bundle: 'Company Offer Preparer' },
      },
    ]);
    const deniedReplay = await request(path, fixture.companyId, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'stable-offer-command',
      },
      body: JSON.stringify(body),
    });
    expect(deniedReplay.status).toBe(403);
    expect(
      (
        await pool.query<{ count: string }>(
          'SELECT count(*) FROM offer_events WHERE offer_id = $1',
          [created.id],
        )
      ).rows[0]?.count,
    ).toBe('2');
  });

  it('serializes concurrent creations on the Opportunity and leaves no losing writes', async () => {
    const fixture = await preparedOffer();
    const barrier = await pool.connect();
    let released = false;
    try {
      await barrier.query('BEGIN');
      const blocker = await barrier.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      const blockerPid = blocker.rows[0]?.pid;
      if (!blockerPid) throw new Error('Expected a PostgreSQL backend pid.');
      await barrier.query(
        'SELECT id FROM opportunities WHERE id = $1 FOR UPDATE',
        [fixture.opportunityId],
      );
      const path = `/offers/opportunities/${fixture.opportunityId}`;
      const body = JSON.stringify({
        pricingSnapshotId: fixture.snapshotId,
        recipient: { kind: 'PRIMARY' },
      });
      const pending = Promise.all(
        ['concurrent-offer-a', 'concurrent-offer-b'].map((key) =>
          request(path, fixture.companyId, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': key,
            },
            body,
          }),
        ),
      );
      await waitForBlockedRequests(blockerPid, 2);
      await barrier.query('COMMIT');
      released = true;
      const responses = await pending;
      expect(responses.map((response) => response.status).toSorted()).toEqual([
        201, 409,
      ]);
    } finally {
      if (!released) await barrier.query('ROLLBACK');
      barrier.release();
    }
    const writes = await pool.query<{
      offers: string;
      versions: string;
      receipts: string;
      events: string;
      reference: number;
    }>(
      `SELECT
      (SELECT count(*) FROM offers) AS offers,
      (SELECT count(*) FROM offer_versions) AS versions,
      (SELECT count(*) FROM offer_commands) AS receipts,
      (SELECT count(*) FROM offer_events) AS events,
      (SELECT current_reference FROM offer_reference_counters
        WHERE company_id = $1) AS reference`,
      [fixture.companyId],
    );
    expect(writes.rows[0]).toEqual({
      offers: '1',
      versions: '1',
      receipts: '1',
      events: '2',
      reference: 1,
    });
  });

  it.each(['distinct actors', 'the same actor'])(
    'creates two Offers for distinct Opportunities of the same Client with %s',
    async (actors) => {
      let phase = 'setup';
      onTestFailed(() => {
        console.error('Same-Client Offer concurrency failed during:', phase);
      });
      const fixture = await preparedOffer();
      const secondRequest = record(
        await command(
          '/commercial-intake/requests',
          {
            originalText: 'Another synthetic Request for the same Client.',
            subject: 'Concurrent Offer',
            clientAccountId: fixture.clientId,
            opportunity: FOLLOW_ON_OPPORTUNITIES.concurrent,
          },
          'concurrent-client-request',
          fixture.companyId,
        ),
      );
      const secondOpportunityId = stringField(
        record(secondRequest.initialOpportunity),
        'id',
      );
      const secondSnapshot = identifiedRecord(
        await command(
          `/pricing/opportunities/${secondOpportunityId}/snapshots`,
          {
            pricingRuleVersionNumber: fixture.ruleVersionNumber,
            lines: [
              {
                offeringId: fixture.offeringId,
                tariffVersionNumber: fixture.tariffVersionNumber,
                quantity: '1',
              },
            ],
          },
          'concurrent-client-snapshot',
          fixture.companyId,
        ),
      );
      const secondActorHeaders =
        actors === 'distinct actors'
          ? await grantConcurrentPreparer(fixture.companyId)
          : OWNER;
      const beforeVersion = await readClientVersion(fixture);
      const barrier = await pool.connect();
      let released = false;
      const pending: Promise<Response>[] = [];
      try {
        await barrier.query('BEGIN');
        const [backend] = (
          await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows;
        if (!backend) throw new Error('Expected barrier backend.');
        // Distinct actors must both reach the Client write fence. With one actor,
        // the second HTTP request waits earlier: Access updates the profile while
        // the first Offer holds that identity FOR SHARE. Observe both paths.
        await barrier.query(
          'SELECT id FROM client_accounts WHERE id = $1 FOR SHARE',
          [fixture.clientId],
        );
        phase = 'first Client write fence';
        pending.push(
          postOffer(
            fixture,
            {
              pricingSnapshotId: fixture.snapshotId,
              recipient: { kind: 'PRIMARY' },
            },
            'same-client-first',
          ),
        );
        await waitForBlockedRequests(backend.pid, 1, 'client');
        phase =
          actors === 'distinct actors'
            ? 'two Client write fences'
            : 'same-actor identity profile fence';
        pending.push(
          request(
            `/offers/opportunities/${secondOpportunityId}`,
            fixture.companyId,
            {
              method: 'POST',
              headers: {
                ...secondActorHeaders,
                'content-type': 'application/json',
                'idempotency-key': 'same-client-second',
              },
              body: JSON.stringify({
                pricingSnapshotId: secondSnapshot.id,
                recipient: { kind: 'PRIMARY' },
              }),
            },
          ),
        );
        if (actors === 'distinct actors') {
          await waitForBlockedRequests(backend.pid, 2, 'client');
        } else {
          await waitForBlockedRequests(backend.pid, 1, 'profile');
        }
        await barrier.query('COMMIT');
        released = true;
        phase = 'both Offer commands completing';
        const responses = await Promise.all(pending);
        expect(responses.map((response) => response.status)).toEqual([
          201, 201,
        ]);
        const created = await Promise.all(
          responses.map(async (response) =>
            identifiedRecord(await json(response)),
          ),
        );
        expect(
          created.map((offer) => offer.illustrativeReference).toSorted(),
        ).toEqual([1, 2]);
        expect(created.map((offer) => offer.opportunityId)).toEqual([
          fixture.opportunityId,
          secondOpportunityId,
        ]);
      } finally {
        if (!released) await barrier.query('ROLLBACK');
        barrier.release();
        await Promise.allSettled(pending);
      }
      phase = 'committed result invariants';
      expect(await readClientVersion(fixture)).toBe(beforeVersion + 2);
      expect((await pool.query('SELECT id FROM offers')).rowCount).toBe(2);
      expect((await pool.query('SELECT id FROM offer_versions')).rowCount).toBe(
        2,
      );
      expect((await pool.query('SELECT id FROM offer_commands')).rowCount).toBe(
        2,
      );
      expect((await pool.query('SELECT id FROM offer_events')).rowCount).toBe(
        4,
      );
    },
  );

  it('rejects a Snapshot from another Opportunity with the canonical conflict and no Offer writes', async () => {
    const fixture = await preparedOffer();
    const secondIntake = record(
      await command(
        '/commercial-intake/requests',
        {
          originalText: 'A second synthetic Request.',
          subject: 'Second Opportunity',
          clientAccountId: fixture.clientId,
          opportunity: FOLLOW_ON_OPPORTUNITIES.mismatch,
        },
        'second-request-456',
        fixture.companyId,
      ),
    );
    const secondOpportunityId = stringField(
      record(secondIntake.initialOpportunity),
      'id',
    );
    const secondSnapshot = identifiedRecord(
      await command(
        `/pricing/opportunities/${secondOpportunityId}/snapshots`,
        {
          pricingRuleVersionNumber: fixture.ruleVersionNumber,
          lines: [
            {
              offeringId: fixture.offeringId,
              tariffVersionNumber: fixture.tariffVersionNumber,
              quantity: '1',
            },
          ],
        },
        'second-snapshot-456',
        fixture.companyId,
      ),
    );
    const rejected = await request(
      `/offers/opportunities/${fixture.opportunityId}`,
      fixture.companyId,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'mismatched-snapshot-offer',
        },
        body: JSON.stringify({
          pricingSnapshotId: secondSnapshot.id,
          recipient: { kind: 'PRIMARY' },
        }),
      },
    );
    expect(rejected.status).toBe(409);
    expect(await json(rejected)).toMatchObject({
      code: 'PRICING_SNAPSHOT_NOT_FOR_OPPORTUNITY',
    });
    const writes = await pool.query<{
      offers: string;
      receipts: string;
      events: string;
    }>(
      `SELECT (SELECT count(*) FROM offers) AS offers,
              (SELECT count(*) FROM offer_commands) AS receipts,
              (SELECT count(*) FROM offer_events) AS events`,
    );
    expect(writes.rows[0]).toEqual({ offers: '0', receipts: '0', events: '0' });
  });

  it('rejects an adjusted Snapshot with the canonical conflict and no Offer writes', async () => {
    const fixture = await preparedOffer();
    await command(
      '/company-pricing-adjustment-assignments',
      {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      'grant-adjustment-456',
    );
    const adjustedSnapshot = identifiedRecord(
      await command(
        `/pricing/opportunities/${fixture.opportunityId}/snapshots`,
        {
          pricingRuleVersionNumber: fixture.ruleVersionNumber,
          lines: [
            {
              offeringId: fixture.offeringId,
              tariffVersionNumber: fixture.tariffVersionNumber,
              quantity: '1',
              adjustment: {
                type: 'FIXED_NET_DISCOUNT',
                netReduction: '8.63',
                reason: 'Synthetic Offer compatibility proof',
              },
            },
          ],
        },
        'adjusted-snapshot-456',
        fixture.companyId,
      ),
    );
    const body = JSON.stringify({
      pricingSnapshotId: adjustedSnapshot.id,
      recipient: { kind: 'PRIMARY' },
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const rejected = await request(
        `/offers/opportunities/${fixture.opportunityId}`,
        fixture.companyId,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': 'adjusted-snapshot-offer',
          },
          body,
        },
      );
      expect(rejected.status).toBe(409);
      expect(await json(rejected)).toMatchObject({
        code: 'PRICING_SNAPSHOT_ADJUSTMENT_UNSUPPORTED',
      });
    }
    const writes = await pool.query<{
      offers: string;
      versions: string;
      receipts: string;
      events: string;
      references: string;
    }>(
      `SELECT (SELECT count(*) FROM offers) AS offers,
              (SELECT count(*) FROM offer_versions) AS versions,
              (SELECT count(*) FROM offer_commands) AS receipts,
              (SELECT count(*) FROM offer_events) AS events,
              (SELECT count(*) FROM offer_reference_counters) AS references`,
    );
    expect(writes.rows[0]).toEqual({
      offers: '0',
      versions: '0',
      receipts: '0',
      events: '0',
      references: '0',
    });
  });

  it.each(['profile refresh', 'Offer revocation'])(
    'restarts a coherent Offer read after a concurrent %s commits',
    async (change) => {
      const fixture = await preparedOffer();
      const created = identifiedRecord(
        await command(
          `/offers/opportunities/${fixture.opportunityId}`,
          {
            pricingSnapshotId: fixture.snapshotId,
            recipient: { kind: 'PRIMARY' },
          },
          'before-read-conflict',
          fixture.companyId,
        ),
      );
      const queries: string[] = [];
      const { offers, actor } = await offerServiceContext(fixture, queries);
      const barrier = await pool.connect();
      let pending: ReturnType<typeof offers.read> | undefined;
      try {
        await barrier.query('BEGIN');
        const [backend] = (
          await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows;
        if (!backend)
          throw new Error('Expected the profile transaction backend.');
        // Preflight reads see the old committed identity. The locked read then
        // takes its snapshot before waiting on this real concurrent update.
        await barrier.query(
          'UPDATE internal_users SET display_name = $1 WHERE id = $2',
          ['Refreshed synthetic reader', actor.internalUserId],
        );
        if (change === 'Offer revocation')
          await barrier.query(
            "UPDATE company_role_assignments SET revoked_at = now() WHERE workspace_membership_id = $1 AND company_id = $2 AND bundle = 'company_offer_preparer'",
            [fixture.actorMembershipId, fixture.companyId],
          );
        pending = offers.read(actor, fixture.opportunityId);
        // Attach a handler before releasing the barrier to avoid an unhandled
        // denial while PostgreSQL and the test runner settle their promises.
        const outcome = pending.then(
          (value) => ({ kind: 'read' as const, value }),
          (error: unknown) => ({ kind: 'denied' as const, error }),
        );
        await waitForBlockedRequests(backend.pid, 1);
        await barrier.query('COMMIT');
        const result = await outcome;
        if (change === 'Offer revocation') {
          expect(result.kind).toBe('denied');
          if (result.kind !== 'denied')
            throw new Error('Expected current authority denial.');
          expect(result.error).toMatchObject({ status: 403 });
        } else {
          expect(result.kind).toBe('read');
          if (result.kind !== 'read')
            throw new Error('Expected the recovered Offer read.');
          expect(result.value).toEqual(created);
        }
        expect(queries.filter((query) => query.startsWith('begin'))).toEqual([
          'begin isolation level repeatable read',
          'begin isolation level repeatable read',
        ]);
        expect(queries.filter((query) => query === 'rollback')).toHaveLength(
          change === 'Offer revocation' ? 2 : 1,
        );
        expect((await pool.query('SELECT id FROM offer_events')).rowCount).toBe(
          2,
        );
        expect(
          (await pool.query('SELECT id FROM offer_commands')).rowCount,
        ).toBe(1);
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        if (pending) await Promise.allSettled([pending]);
      }
    },
  );

  it('enforces prepare and read independently through the real Offer public interface', async () => {
    const fixture = await preparedOffer();
    const { offers, actor, company } = await offerServiceContext(fixture);
    const preparer: ActorContext = {
      ...actor,
      activeCompany: {
        ...company,
        offerPermissions: [
          'commercial.offer.prepare',
          'commercial.pricing.snapshot.read',
        ],
      },
    };
    const reader: ActorContext = {
      ...actor,
      activeCompany: {
        ...company,
        offerPermissions: [
          'commercial.offer.read',
          'commercial.pricing.snapshot.read',
        ],
      },
    };
    const body = {
      pricingSnapshotId: fixture.snapshotId,
      recipient: { kind: 'PRIMARY' },
    };
    await expect(
      offers.read(preparer, fixture.opportunityId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      offers.create(reader, fixture.opportunityId, body, 'read-only-refusal'),
    ).rejects.toMatchObject({ status: 403 });
    const created = await offers.create(
      preparer,
      fixture.opportunityId,
      body,
      'prepare-without-read',
    );
    expect((await offers.read(reader, fixture.opportunityId))?.id).toBe(
      created.id,
    );
    const noClient: ActorContext = {
      ...preparer,
      workspacePermissions: ['company.manage'],
      activeCompany: {
        ...company,
        clientPermissions: [],
        offerPermissions: [
          'commercial.offer.prepare',
          'commercial.pricing.snapshot.read',
        ],
      },
    };
    await expect(
      offers.create(
        noClient,
        fixture.opportunityId,
        body,
        'prepare-without-read',
      ),
    ).rejects.toMatchObject({ status: 403 });
    const noOpportunity: ActorContext = {
      ...reader,
      activeCompany: { ...company, commercialIntakePermissions: [] },
    };
    await expect(
      offers.read(noOpportunity, fixture.opportunityId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      offers.create(
        noOpportunity,
        fixture.opportunityId,
        body,
        'no-opportunity',
      ),
    ).rejects.toMatchObject({ status: 403 });
    await pool.query(
      "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle = 'company_director_client_access'",
      [fixture.companyId],
    );
    await expect(
      offers.create(
        preparer,
        fixture.opportunityId,
        body,
        'prepare-without-read',
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect((await pool.query('SELECT id FROM offer_events')).rowCount).toBe(2);
  });

  it.each(['company_offer_preparer', 'company_commercial_intake'])(
    'does not disclose an Offer after revocation of %s',
    async (bundle) => {
      const fixture = await preparedOffer();
      const path = `/offers/opportunities/${fixture.opportunityId}`;
      const body = {
        pricingSnapshotId: fixture.snapshotId,
        recipient: { kind: 'PRIMARY' },
      };
      await command(path, body, 'before-revocation', fixture.companyId);
      await pool.query(
        'UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text = $2',
        [fixture.companyId, bundle],
      );
      const deniedBodies: unknown[] = [];
      for (const target of [
        path,
        '/offers/opportunities/00000000-0000-4000-8000-999999999999',
      ]) {
        const response = await request(target, fixture.companyId);
        expect(response.status).toBe(403);
        deniedBodies.push(await json(response));
      }
      expect(deniedBodies[0]).toEqual(deniedBodies[1]);
      expect(JSON.stringify(deniedBodies)).not.toContain(
        'illustrativeReference',
      );
      const replay = await postOffer(fixture, body, 'before-revocation');
      expect(replay.status).toBe(403);
      expect((await pool.query('SELECT id FROM offer_events')).rowCount).toBe(
        2,
      );
    },
  );

  it('keeps a Workspace manager reference name-only and denies recipient replay after Client read is revoked', async () => {
    const fixture = await preparedOffer();
    const body = {
      pricingSnapshotId: fixture.snapshotId,
      recipient: { kind: 'PRIMARY' },
    };
    const created = identifiedRecord(
      await command(
        `/offers/opportunities/${fixture.opportunityId}`,
        body,
        'before-client-revocation',
        fixture.companyId,
      ),
    );
    const revoked = await request(
      `/company-director-client-assignments/${fixture.actorMembershipId}/${fixture.companyId}`,
      undefined,
      {
        method: 'DELETE',
        headers: { 'idempotency-key': 'revoke-offer-client-read' },
      },
    );
    expect(revoked.status).toBe(200);

    const replay = await postOffer(fixture, body, 'before-client-revocation');
    expect(replay.status).toBe(403);
    const reopenedResponse = await request(
      `/offers/opportunities/${fixture.opportunityId}`,
      fixture.companyId,
    );
    expect(reopenedResponse.status).toBe(200);
    const reopened = identifiedRecord(
      record(await json(reopenedResponse)).offer,
    );
    expect(reopened.id).toBe(created.id);
    expect(reopened.clientReference).toEqual({
      originalClientId: fixture.clientId,
      displayName: 'Synthetic Recipient SA',
    });
    expect((await pool.query('SELECT id FROM offer_events')).rowCount).toBe(2);
    expect((await pool.query('SELECT id FROM offer_commands')).rowCount).toBe(
      1,
    );
  });

  it('fails closed for null and unknown captured Offer bundle versions', async () => {
    const fixture = await preparedOffer();
    const [constraint] = (
      await pool.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'company_role_assignments_permission_set_version_check'",
      )
    ).rows;
    if (!constraint) throw new Error('Expected captured-version constraint.');
    await pool.query(
      'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
    );
    try {
      for (const version of [null, 'v2', 'V1']) {
        await pool.query(
          "UPDATE company_role_assignments SET permission_set_version = $1 WHERE company_id = $2 AND bundle = 'company_offer_preparer'",
          [version, fixture.companyId],
        );
        expect(
          (
            await request(
              `/offers/opportunities/${fixture.opportunityId}`,
              fixture.companyId,
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await postOffer(
              fixture,
              {
                pricingSnapshotId: fixture.snapshotId,
                recipient: { kind: 'PRIMARY' },
              },
              'unknown-version',
            )
          ).status,
        ).toBe(403);
      }
    } finally {
      await pool.query(
        "UPDATE company_role_assignments SET permission_set_version = 'v1' WHERE company_id = $1 AND bundle = 'company_offer_preparer'",
        [fixture.companyId],
      );
      await pool.query(
        `ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ${constraint.definition}`,
      );
    }
    await expectNoOfferWrites();
  });

  it('allows Snapshot read from Offer Preparer without granting calculation', async () => {
    const fixture = await preparedOffer();
    await pool.query(
      "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle = 'company_pricing_user'",
      [fixture.companyId],
    );
    const created = identifiedRecord(
      await command(
        `/offers/opportunities/${fixture.opportunityId}`,
        {
          pricingSnapshotId: fixture.snapshotId,
          recipient: { kind: 'PRIMARY' },
        },
        'offer-without-pricing-user',
        fixture.companyId,
      ),
    );
    expect(
      (
        await request(
          `/offers/opportunities/${fixture.opportunityId}`,
          fixture.companyId,
        )
      ).status,
    ).toBe(200);
    const denied = await request(
      `/pricing/opportunities/${fixture.opportunityId}/snapshots`,
      fixture.companyId,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'no-calculation',
        },
        body: '{}',
      },
    );
    expect(denied.status).toBe(403);
    expect(created.illustrativeReference).toBe(1);
  });

  it('uses the same safe not-found for another Company and an unknown Opportunity', async () => {
    const fixture = await preparedOffer();
    const otherCompany = entity(
      await command(
        '/companies',
        { displayName: 'Other Company' },
        'other-company',
      ),
    );
    for (const path of [
      '/company-offer-preparer-assignments',
      '/company-commercial-intake-assignments',
    ]) {
      await command(
        path,
        {
          workspaceMembershipId: fixture.actorMembershipId,
          companyId: otherCompany.id,
        },
        'other-' + path,
      );
    }
    const bodies: unknown[] = [];
    for (const opportunityId of [
      fixture.opportunityId,
      '00000000-0000-4000-8000-999999999999',
    ]) {
      const response = await request(
        `/offers/opportunities/${opportunityId}`,
        otherCompany.id,
      );
      expect(response.status).toBe(404);
      bodies.push(await json(response));
      const write = await postOffer(
        { ...fixture, companyId: otherCompany.id, opportunityId },
        {
          pricingSnapshotId: fixture.snapshotId,
          recipient: { kind: 'PRIMARY' },
        },
        opportunityId,
      );
      expect(write.status).toBe(404);
    }
    expect(bodies[0]).toEqual(bodies[1]);
    const foreignWorkspace = '00000000-0000-4000-8000-000000000457';
    const foreignCompany = '00000000-0000-4000-8000-000000000458';
    await pool.query(
      "INSERT INTO workspaces (id, name) VALUES ($1, 'Foreign Workspace')",
      [foreignWorkspace],
    );
    await pool.query(
      `WITH member AS (
         INSERT INTO workspace_memberships (workspace_id, internal_user_id)
         SELECT $2, internal_user_id FROM workspace_memberships WHERE id = $3
         RETURNING id, internal_user_id
       ) INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id, created_by_workspace_membership_id, registration_idempotency_key)
       SELECT $1, $2, 'Foreign Company', internal_user_id, id, 'foreign-company' FROM member`,
      [foreignCompany, foreignWorkspace, fixture.actorMembershipId],
    );
    expect(
      (
        await request(
          `/offers/opportunities/${fixture.opportunityId}`,
          foreignCompany,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await postOffer(
          { ...fixture, companyId: foreignCompany },
          {
            pricingSnapshotId: fixture.snapshotId,
            recipient: { kind: 'PRIMARY' },
          },
          'foreign-workspace',
        )
      ).status,
    ).toBe(403);
    await expectNoOfferWrites();
  });

  it('refuses unavailable recipients and a relationship invalidated before the recipient fence', async () => {
    const fixture = await preparedOffer();
    const body = {
      pricingSnapshotId: fixture.snapshotId,
      recipient: {
        kind: 'ADDITIONAL',
        legalEntityId: '00000000-0000-4000-8000-999999999999',
      },
    };
    const unavailable = await postOffer(fixture, body, 'missing-recipient');
    expect(unavailable.status).toBe(404);
    const barrier = await pool.connect();
    let released = false;
    try {
      await barrier.query('BEGIN');
      const [backend] = (
        await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows;
      if (!backend) throw new Error('Expected barrier backend.');
      await barrier.query(
        'SELECT id FROM client_accounts WHERE id = $1 FOR UPDATE',
        [fixture.clientId],
      );
      const pending = postOffer(
        fixture,
        { ...body, recipient: { kind: 'PRIMARY' } },
        'invalidated-recipient',
      );
      await waitForBlockedRequests(backend.pid, 1);
      await barrier.query(
        "UPDATE client_company_relationships SET status = 'archived' WHERE company_id = $1 AND client_account_id = $2",
        [fixture.companyId, fixture.clientId],
      );
      await barrier.query('COMMIT');
      released = true;
      const response = await pending;
      expect(response.status).toBe(404);
      expect(await json(response)).toEqual(await json(unavailable));
    } finally {
      if (!released) await barrier.query('ROLLBACK');
      barrier.release();
    }
    await expectNoOfferWrites();
  });

  it('rolls back the complete Offer if event recording fails and safely retries the same command', async () => {
    const fixture = await preparedOffer();
    const body = {
      pricingSnapshotId: fixture.snapshotId,
      recipient: { kind: 'PRIMARY' },
    };
    const before = (
      await pool.query<{ version: number }>(
        'SELECT version FROM client_accounts WHERE id = $1',
        [fixture.clientId],
      )
    ).rows[0]?.version;
    // A database failure is injected after the Offer, version, fence and receipt writes.
    await pool.query(`CREATE FUNCTION reject_offer_event_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic event write failure'; END $$;
      CREATE TRIGGER reject_offer_event_test BEFORE INSERT ON offer_events
      FOR EACH ROW EXECUTE FUNCTION reject_offer_event_test()`);
    try {
      expect((await postOffer(fixture, body, 'rollback-retry')).status).toBe(
        500,
      );
      await expectNoOfferWrites();
      expect(
        (
          await pool.query<{ version: number }>(
            'SELECT version FROM client_accounts WHERE id = $1',
            [fixture.clientId],
          )
        ).rows[0]?.version,
      ).toBe(before);
    } finally {
      await pool.query(
        'DROP TRIGGER reject_offer_event_test ON offer_events; DROP FUNCTION reject_offer_event_test()',
      );
    }
    const response = await postOffer(fixture, body, 'rollback-retry');
    expect(response.status).toBe(201);
    expect(identifiedRecord(await json(response)).illustrativeReference).toBe(
      1,
    );
    expect((await pool.query('SELECT id FROM offer_events')).rowCount).toBe(2);
  });

  it('allocates unique increasing references independently in each Company', async () => {
    const first = await preparedOffer();
    const other = await preparedOffer('-OTHER');
    for (const fixture of [first, other]) {
      const created = await postOffer(
        fixture,
        {
          pricingSnapshotId: fixture.snapshotId,
          recipient: { kind: 'PRIMARY' },
        },
        'first-in-company',
      );
      expect(created.status).toBe(201);
      expect(identifiedRecord(await json(created)).illustrativeReference).toBe(
        1,
      );
    }
    const nextRequest = record(
      await command(
        '/commercial-intake/requests',
        {
          originalText: 'Second synthetic Request',
          subject: 'Second Offer',
          clientAccountId: first.clientId,
          opportunity: FOLLOW_ON_OPPORTUNITIES.reference,
        },
        'next-reference-request',
        first.companyId,
      ),
    );
    const opportunityId = stringField(
      record(nextRequest.initialOpportunity),
      'id',
    );
    const nextSnapshot = identifiedRecord(
      await command(
        `/pricing/opportunities/${opportunityId}/snapshots`,
        {
          pricingRuleVersionNumber: first.ruleVersionNumber,
          lines: [
            {
              offeringId: first.offeringId,
              tariffVersionNumber: first.tariffVersionNumber,
              quantity: '1',
            },
          ],
        },
        'next-reference-snapshot',
        first.companyId,
      ),
    );
    const next = await postOffer(
      { ...first, opportunityId },
      { pricingSnapshotId: nextSnapshot.id, recipient: { kind: 'PRIMARY' } },
      'second-in-company',
    );
    expect(next.status).toBe(201);
    expect(identifiedRecord(await json(next)).illustrativeReference).toBe(2);
    expect(
      (
        await pool.query<{ current_reference: number }>(
          'SELECT current_reference FROM offer_reference_counters WHERE company_id = $1',
          [other.companyId],
        )
      ).rows[0]?.current_reference,
    ).toBe(1);
  });

  async function offerServiceContext(
    fixture: PreparedOffer,
    queries: string[] = [],
  ) {
    const databaseContext = new DatabaseContext(
      drizzle({
        client: pool,
        logger: { logQuery: (query) => queries.push(query) },
      }),
    );
    const authorization = new CompanyContextAuthorization(databaseContext);
    const accountability = new AccountabilityService(databaseContext);
    const clients = new ClientOperationalReferenceService(databaseContext);
    const catalogue = new CommercialCatalogueService(
      databaseContext,
      authorization,
    );
    const intake = new CommercialIntakeService(
      databaseContext,
      authorization,
      clients,
      accountability,
      new CommercialResponsibleAccessService(databaseContext),
    );
    const pricing = new PricingSnapshotService(
      databaseContext,
      authorization,
      catalogue,
      intake,
      accountability,
      serverClock,
    );
    const offers = new OfferService(
      databaseContext,
      authorization,
      accountability,
      clients,
      intake,
      pricing,
      serverClock,
    );
    const [member] = (
      await pool.query<{ internal_user_id: string }>(
        'SELECT internal_user_id FROM workspace_memberships WHERE id = $1',
        [fixture.actorMembershipId],
      )
    ).rows;
    if (!member) throw new Error('Expected the synthetic membership.');
    const actor: ActorContext = {
      internalUserId: member.internal_user_id,
      workspaceMembershipId: fixture.actorMembershipId,
      workspaceId: WORKSPACE_ID,
      workspaceName: 'Synthetic',
      displayName: 'Synthetic',
      email: 'synthetic@example.test',
      active: true,
      workspacePermissions: ['company.manage', 'client.manage'],
    };
    const company = await authorization.resolveAuthorizedActiveCompany(
      actor,
      fixture.companyId,
    );
    if (!company) throw new Error('Expected the authorized Company.');
    return { offers, actor: { ...actor, activeCompany: company }, company };
  }

  async function postOffer(
    fixture: PreparedOffer,
    body: unknown,
    key: string,
  ): Promise<Response> {
    return request(
      `/offers/opportunities/${fixture.opportunityId}`,
      fixture.companyId,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify(body),
      },
    );
  }

  async function expectNoOfferWrites(): Promise<void> {
    const result = await pool.query<{
      offers: string;
      versions: string;
      receipts: string;
      events: string;
      references: string;
    }>(
      'SELECT (SELECT count(*) FROM offers) AS offers, (SELECT count(*) FROM offer_versions) AS versions, (SELECT count(*) FROM offer_commands) AS receipts, (SELECT count(*) FROM offer_events) AS events, (SELECT count(*) FROM offer_reference_counters) AS references',
    );
    expect(result.rows[0]).toEqual({
      offers: '0',
      versions: '0',
      receipts: '0',
      events: '0',
      references: '0',
    });
  }

  async function waitForBlockedRequests(
    blockerPid: number,
    expected: number,
    waitKind: 'any' | 'client' | 'profile' = 'any',
  ): Promise<void> {
    let observed: WaitingRequest[] = [];
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const waiting = await pool.query<WaitingRequest>(
        `SELECT pid, pg_blocking_pids(pid) AS blockers,
                (query ILIKE '%"client_accounts"%'
                  AND query ILIKE '%for update%') AS "clientWrite",
                (query ILIKE 'update "internal_users"%') AS "profileWrite"
           FROM pg_stat_activity
          WHERE datname = current_database()
            AND wait_event_type = 'Lock'`,
      );
      observed = waiting.rows;
      if (countBlockedRequests(observed, blockerPid, waitKind) >= expected)
        return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(
      `No ${expected} ${waitKind} waiters reached the Offer barrier: ${JSON.stringify(observed)}`,
    );
  }

  async function grantConcurrentPreparer(
    companyId: string,
  ): Promise<Record<string, string>> {
    const subject = 'concurrent-offer-preparer';
    const [membership] = (
      await pool.query<{ id: string }>(
        `WITH admitted_user AS (
        INSERT INTO internal_users (external_provider, external_subject, display_name, email)
        VALUES ('deterministic-test', $1, 'Concurrent Offer preparer', 'concurrent-offer@example.test')
        RETURNING id
      )
      INSERT INTO workspace_memberships (workspace_id, internal_user_id)
      SELECT $2, id FROM admitted_user RETURNING id`,
        [subject, WORKSPACE_ID],
      )
    ).rows;
    if (!membership)
      throw new Error('Expected a synthetic admitted membership.');
    for (const path of [
      '/company-context-assignments',
      '/company-director-client-assignments',
      '/company-commercial-intake-assignments',
      '/company-offer-preparer-assignments',
    ]) {
      await command(
        path,
        { workspaceMembershipId: membership.id, companyId },
        `concurrent-preparer-${path}`,
      );
    }
    return memberHeaders(subject);
  }

  async function readClientVersion(fixture: PreparedOffer): Promise<number> {
    const response = await request(
      `/clients/${fixture.clientId}`,
      fixture.companyId,
    );
    expect(response.status).toBe(200);
    return numberField(record(await json(response)), 'version');
  }

  async function decisionOffer() {
    const fixture = await preparedOffer();
    const offer = identifiedRecord(
      await command(
        `/offers/opportunities/${fixture.opportunityId}`,
        {
          pricingSnapshotId: fixture.snapshotId,
          recipient: { kind: 'PRIMARY' },
        },
        'decision-offer',
        fixture.companyId,
      ),
    );
    await command(
      '/company-offer-approver-assignments',
      {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      'grant-approver',
    );
    return {
      fixture,
      offer,
      base: `/offers/opportunities/${fixture.opportunityId}/versions/${stringField(record(offer.version), 'id')}`,
    };
  }
  async function decisionRequest(
    fixture: PreparedOffer,
    path: string,
    body: unknown,
    key: string,
  ) {
    return request(path, fixture.companyId, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify(body),
    });
  }

  async function preparedOffer(suffix = ''): Promise<PreparedOffer> {
    const company = entity(
      await command(
        '/companies',
        { displayName: 'Illustrative Company 456' + suffix },
        'company-456' + suffix,
      ),
    );
    const actor = record(
      await json(await request('/access/current-actor', company.id)),
    );
    const actorMembershipId = stringField(actor, 'workspaceMembershipId');
    for (const path of ASSIGNMENTS)
      await command(
        path,
        { workspaceMembershipId: actorMembershipId, companyId: company.id },
        `grant-${path}${suffix}`,
      );

    const client = entity(
      await command(
        '/clients',
        {
          displayName: 'Synthetic Recipient SA' + suffix,
          taxId: 'SYNTHETIC-456' + suffix,
          address: '456 Example Street',
        },
        'client-456' + suffix,
        company.id,
      ),
    );
    const intake = record(
      await command(
        '/commercial-intake/requests',
        {
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
        'request-456' + suffix,
        company.id,
      ),
    );
    const opportunityId = stringField(record(intake.initialOpportunity), 'id');

    const rule = published(
      await command(
        '/pricing-configuration/rule-versions',
        {
          label: 'Illustrative rule',
          effectiveFrom: instant.toISOString(),
          expectedActiveVersionNumber: null,
        },
        'rule-456' + suffix,
        company.id,
      ),
    );
    const definition = entity(
      record(
        await command(
          '/commercial-catalogue/service-definitions',
          {
            code: 'OFFER-456' + suffix,
            name: 'Synthetic illustrative service',
            description: null,
          },
          'definition-456' + suffix,
          company.id,
        ),
      ).definition,
    );
    const offering = entity(
      record(
        await command(
          '/commercial-catalogue/offerings',
          { serviceDefinitionId: definition.id, commercialLabel: null },
          'offering-456' + suffix,
          company.id,
        ),
      ).offering,
    );
    const tariff = published(
      await command(
        `/pricing-configuration/offerings/${offering.id}/tariff-versions`,
        {
          unit: 'illustrative-unit',
          unitAmount: '300.0000',
          currency: 'EUR',
          taxRatePercent: '15.00',
          taxLabel: 'Illustrative tax',
          effectiveFrom: instant.toISOString(),
          expectedActiveVersionNumber: null,
        },
        'tariff-456' + suffix,
        company.id,
      ),
    );
    const snapshot = identifiedRecord(
      await command(
        `/pricing/opportunities/${opportunityId}/snapshots`,
        {
          pricingRuleVersionNumber: rule.versionNumber,
          lines: [
            {
              offeringId: offering.id,
              tariffVersionNumber: tariff.versionNumber,
              quantity: '1',
            },
          ],
        },
        'snapshot-456' + suffix,
        company.id,
      ),
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

  async function command(
    path: string,
    body: unknown,
    key: string,
    companyId?: string,
  ): Promise<unknown> {
    const response = await request(path, companyId, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify(body),
    });
    const value = await json(response);
    expect(response.status, JSON.stringify({ path, value })).toBe(201);
    return value;
  }
});

function countBlockedRequests(
  requests: readonly WaitingRequest[],
  blockerPid: number,
  waitKind: 'any' | 'client' | 'profile' = 'any',
): number {
  const blockedPids = new Set([blockerPid]);
  let added = true;
  while (added) {
    added = false;
    for (const request of requests) {
      if (
        !blockedPids.has(request.pid) &&
        request.blockers.some((pid) => blockedPids.has(pid))
      ) {
        blockedPids.add(request.pid);
        added = true;
      }
    }
  }
  return requests.filter(
    (request) =>
      request.pid !== blockerPid &&
      blockedPids.has(request.pid) &&
      (waitKind === 'any' ||
        (waitKind === 'client' ? request.clientWrite : request.profileWrite)),
  ).length;
}

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
