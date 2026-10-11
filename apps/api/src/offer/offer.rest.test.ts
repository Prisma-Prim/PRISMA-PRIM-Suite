import { Logger } from '@nestjs/common';
import { vi } from 'vitest';
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

  it('creates a complete successor of a transmitted Offer and preserves historical evidence', async () => {
    const { fixture, offer } = await transmittedResponseOffer();
    const path = `/offers/opportunities/${fixture.opportunityId}`;
    const before = record(
      record(await json(await request(path, fixture.companyId))).offer,
    );
    const oldVersion = record(before.version);
    const successor = record(
      await command(
        path + '/versions',
        {
          expectedOfferRevision: 3,
          pricingSnapshotId: fixture.snapshotId,
          recipient: { kind: 'PRIMARY' },
          commercialConditions: 'Revised illustrative conditions',
        },
        'successor',
        fixture.companyId,
      ),
    );
    expect(successor).toMatchObject({ id: offer.id, revision: 4 });
    const version = record(successor.version);
    expect(version).toMatchObject({
      versionNumber: 2,
      predecessorVersionId: oldVersion.id,
      decisionState: 'PENDING',
      transmissionState: 'NOT_TRANSMITTED',
      clientResponseState: 'NONE',
      decision: null,
      transmission: null,
      clientResponse: null,
      latestQualityRun: null,
      provisional: true,
      differences: expect.arrayContaining([
        {
          field: 'commercialConditions',
          previous: null,
          current: 'Revised illustrative conditions',
          changed: true,
        },
      ]),
    });
    const previous = record(
      record(
        await json(
          await request(
            path + '/versions/' + stringField(oldVersion, 'id'),
            fixture.companyId,
          ),
        ),
      ).offer,
    );
    expect(record(previous.version)).toMatchObject({
      representation: oldVersion.representation,
      decision: oldVersion.decision,
      transmission: oldVersion.transmission,
      latestQualityRun: oldVersion.latestQualityRun,
      clientResponseState: 'PENDING',
      supersededByVersionId: version.id,
    });
    const history = record(
      await json(await request(path + '/versions', fixture.companyId)),
    );
    expect(history.versions).toMatchObject([
      { versionNumber: 2 },
      { versionNumber: 1 },
    ]);
  });

  it('revalidates, approves, transmits and accepts the successor with its own evidence', async () => {
    const { fixture, offer } = await transmittedResponseOffer();
    const path = `/offers/opportunities/${fixture.opportunityId}`;
    const body = {
      expectedOfferRevision: 3,
      pricingSnapshotId: fixture.snapshotId,
      recipient: { kind: 'PRIMARY' },
      commercialConditions: '',
    };
    const created = record(
      await command(path + '/versions', body, 'successor', fixture.companyId),
    );
    const version = record(created.version);
    const base = path + '/versions/' + stringField(version, 'id');
    const run = record(
      await command(
        base + '/quality-checks',
        {},
        'v2-check',
        fixture.companyId,
      ),
    );
    expect(run.offerVersionId).toBe(version.id);
    const approval = await command(
      base + '/approve',
      { expectedOfferRevision: 4, acknowledgedWarningCodes: [] },
      'v2-approve',
      fixture.companyId,
    );
    const transmission = await command(
      base + '/transmission',
      { expectedOfferRevision: 5, acknowledgedWarningCodes: [] },
      'v2-transmit',
      fixture.companyId,
    );
    const response = await command(
      base + '/client-response',
      {
        expectedOfferRevision: 6,
        outcome: 'ACCEPTED',
        receivedAt: instant.toISOString(),
      },
      'v2-accept',
      fixture.companyId,
    );
    expect(
      record(record(await json(await request(path, fixture.companyId))).offer),
    ).toMatchObject({
      id: offer.id,
      revision: 7,
      version: {
        versionNumber: 2,
        decision: approval,
        transmission,
        clientResponse: response,
        clientResponseState: 'ACCEPTED',
      },
    });
    const denied = await decisionRequest(
      fixture,
      path + '/versions',
      { ...body, expectedOfferRevision: 7 },
      'v3',
    );
    expect(denied.status).toBe(409);
    expect(await json(denied)).toMatchObject({ code: 'OFFER_ACCEPTED' });
    instant = new Date('2028-01-01T00:00:00.000Z');
    expect(
      await command(path + '/versions', body, 'successor', fixture.companyId),
    ).toEqual(created);
  });

  it.each(['PENDING', 'APPROVED', 'REJECTED', 'CLIENT_REJECTED', 'EXPIRED'])(
    'creates a fresh successor after %s without inheriting evidence',
    async (state) => {
      const { fixture, offer, base } =
        state === 'CLIENT_REJECTED' || state === 'EXPIRED'
          ? await transmittedResponseOffer()
          : await decisionOffer();
      let revision = 1;
      if (state === 'APPROVED') {
        await command(
          base + '/approve',
          { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
          'approve',
          fixture.companyId,
        );
        revision = 2;
      }
      if (state === 'REJECTED') {
        await command(
          base + '/reject',
          { expectedOfferRevision: 1, reason: 'Internal refusal' },
          'reject',
          fixture.companyId,
        );
        revision = 2;
      }
      if (state === 'CLIENT_REJECTED' || state === 'EXPIRED') {
        if (state === 'EXPIRED')
          instant = new Date(stringField(record(offer.version), 'validUntil'));
        await command(
          base + '/client-response',
          state === 'EXPIRED'
            ? { expectedOfferRevision: 3, outcome: 'EXPIRED' }
            : {
                expectedOfferRevision: 3,
                outcome: 'REJECTED',
                receivedAt: instant.toISOString(),
                reason: 'Client refusal',
              },
          'response',
          fixture.companyId,
        );
        revision = 4;
      }
      const path = `/offers/opportunities/${fixture.opportunityId}`;
      const created = record(
        await command(
          path + '/versions',
          {
            expectedOfferRevision: revision,
            pricingSnapshotId: fixture.snapshotId,
            recipient: { kind: 'PRIMARY' },
          },
          'successor',
          fixture.companyId,
        ),
      );
      expect(created).toMatchObject({
        revision: revision + 1,
        version: {
          versionNumber: 2,
          decision: null,
          latestQualityRun: null,
          transmission: null,
          clientResponse: null,
        },
      });
      for (const action of [
        'approve',
        'reject',
        'transmission',
        'client-response',
        'quality-checks',
      ]) {
        const payload =
          action === 'quality-checks'
            ? {}
            : action === 'reject'
              ? { expectedOfferRevision: revision + 1, reason: 'Refusal' }
              : action === 'client-response'
                ? { expectedOfferRevision: revision + 1, outcome: 'EXPIRED' }
                : {
                    expectedOfferRevision: revision + 1,
                    acknowledgedWarningCodes: [],
                  };
        const refused = await decisionRequest(
          fixture,
          base + '/' + action,
          payload,
          'superseded-' + action,
        );
        expect(refused.status).toBe(409);
        expect(await json(refused)).toMatchObject({
          code: 'OFFER_VERSION_SUPERSEDED',
        });
      }
    },
  );

  it('replays a recorded creation after later heads, preserves exact payload and pages history stably', async () => {
    const { fixture } = await decisionOffer();
    const path = `/offers/opportunities/${fixture.opportunityId}`;
    const body = {
      expectedOfferRevision: 1,
      pricingSnapshotId: fixture.snapshotId,
      recipient: { kind: 'PRIMARY' },
      scopeNote: '',
      commercialConditions: null,
    };
    const first = await command(
      path + '/versions',
      body,
      'v2',
      fixture.companyId,
    );
    await command(
      path + '/versions',
      { ...body, expectedOfferRevision: 2 },
      'v3',
      fixture.companyId,
    );
    expect(
      await command(path + '/versions', body, 'v2', fixture.companyId),
    ).toEqual(first);
    const conflict = await decisionRequest(
      fixture,
      path + '/versions',
      { ...body, scopeNote: null },
      'v2',
    );
    expect(conflict.status).toBe(409);
    expect(await json(conflict)).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    const page = record(
      await json(await request(path + '/versions?limit=1', fixture.companyId)),
    );
    expect(page.versions).toMatchObject([{ versionNumber: 3 }]);
    const next = record(
      await json(
        await request(
          path +
            '/versions?limit=1&cursor=' +
            encodeURIComponent(stringField(page, 'nextCursor')),
          fixture.companyId,
        ),
      ),
    );
    expect(next.versions).toMatchObject([{ versionNumber: 2 }]);
    expect(
      (await request(path + '/versions?limit=51', fixture.companyId)).status,
    ).toBe(400);
    await expect(
      pool.query("UPDATE offer_versions SET scope_note = 'Changed'"),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('DELETE FROM offer_versions'),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        'UPDATE offer_versions SET superseded_at = superseded_at WHERE superseded_by_version_id IS NOT NULL',
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it.each(
    [
      'approve',
      'reject',
      'transmission',
      'client-response',
      'versions',
    ].flatMap((action) => [
      { action, first: 'version' },
      { action, first: 'other' },
    ]),
  )(
    'serializes new version versus $action with $first committing first',
    async ({ action, first }) => {
      const prepared =
        action === 'transmission'
          ? await approvedTransmissionOffer()
          : action === 'client-response'
            ? await transmittedResponseOffer()
            : await decisionOffer();
      const { fixture, offer, base } = prepared;
      const revision =
        action === 'transmission' ? 2 : action === 'client-response' ? 3 : 1;
      const path = `/offers/opportunities/${fixture.opportunityId}/versions`;
      const versionBody = {
        expectedOfferRevision: revision,
        pricingSnapshotId: fixture.snapshotId,
        recipient: { kind: 'PRIMARY' },
      };
      const otherBody =
        action === 'versions'
          ? versionBody
          : action === 'reject'
            ? { expectedOfferRevision: revision, reason: 'Internal refusal' }
            : action === 'client-response'
              ? {
                  expectedOfferRevision: revision,
                  outcome: 'ACCEPTED',
                  receivedAt: instant.toISOString(),
                }
              : {
                  expectedOfferRevision: revision,
                  acknowledgedWarningCodes: [],
                };
      const barrier = await pool.connect();
      const pending: Promise<Response>[] = [];
      try {
        await barrier.query('BEGIN');
        const backend = (
          await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0];
        if (!backend) throw new Error('Expected backend');
        await barrier.query('SELECT id FROM offers WHERE id = $1 FOR UPDATE', [
          offer.id,
        ]);
        const create = () =>
          decisionRequest(fixture, path, versionBody, 'new-version');
        const other = () =>
          decisionRequest(
            fixture,
            action === 'versions' ? path : base + '/' + action,
            otherBody,
            'other',
          );
        pending.push(first === 'version' ? create() : other());
        await waitForBlockedRequests(backend.pid, 1);
        pending.push(first === 'version' ? other() : create());
        await waitForBlockedRequests(backend.pid, 2);
        await barrier.query('COMMIT');
        const [winner, loser] = await Promise.all(pending);
        expect(winner?.status).toBe(201);
        expect(loser?.status).toBe(409);
        if (!loser) throw new Error('Expected losing response');
        expect(await json(loser)).toMatchObject({
          code: 'STALE_OFFER_REVISION',
        });
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await Promise.allSettled(pending);
      }
    },
  );

  it.each([
    'offer_versions',
    'offers',
    'client_accounts',
    'offer_commands',
    'offer_events',
  ])(
    'rolls back the entire successor when %s fails and retries identical input',
    async (table) => {
      const { fixture } = await decisionOffer();
      const path = `/offers/opportunities/${fixture.opportunityId}`;
      const body = {
        expectedOfferRevision: 1,
        pricingSnapshotId: fixture.snapshotId,
        recipient: { kind: 'PRIMARY' },
        scopeNote: 'Private illustrative text',
      };
      const before = await successorEffects();
      await pool.query(
        `CREATE FUNCTION fail_successor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic successor failure'; END $$; CREATE TRIGGER fail_successor BEFORE INSERT OR UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_successor()`,
      );
      try {
        const failed = await decisionRequest(
          fixture,
          path + '/versions',
          body,
          'retry-successor',
        );
        expect(failed.status).toBe(500);
        const failure = await json(failed);
        expect(failure).toMatchObject({
          code: 'OFFER_VERSION_UNCERTAIN',
          correlationId: expect.any(String),
        });
        expect(JSON.stringify(failure)).not.toContain(body.scopeNote);
        expect(await successorEffects()).toEqual(before);
      } finally {
        await pool.query(`DROP TRIGGER fail_successor ON ${table}`);
        await pool.query('DROP FUNCTION fail_successor()');
      }
      await command(
        path + '/versions',
        body,
        'retry-successor',
        fixture.companyId,
      );
    },
  );

  it.each([
    'company_offer_preparer',
    'company_commercial_intake',
    'company_director_client_access',
  ])(
    'denies successor creation and exact replay after %s revocation',
    async (bundle) => {
      const { fixture } = await decisionOffer();
      const path = `/offers/opportunities/${fixture.opportunityId}/versions`;
      const body = {
        expectedOfferRevision: 1,
        pricingSnapshotId: fixture.snapshotId,
        recipient: { kind: 'PRIMARY' },
      };
      await command(path, body, 'revoke-replay', fixture.companyId);
      const before = await successorEffects();
      await pool.query(
        'UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text = $2',
        [fixture.companyId, bundle],
      );
      for (const key of ['revoke-replay', 'fresh-after-revoke'])
        expect((await decisionRequest(fixture, path, body, key)).status).toBe(
          403,
        );
      expect(await successorEffects()).toEqual(before);
      if (bundle === 'company_director_client_access') {
        const read = record(
          record(
            await json(await request(path.slice(0, -9), fixture.companyId)),
          ).offer,
        );
        expect(record(read.clientReference).currentClientId).toBeUndefined();
        expect(record(read.version).recipient).toMatchObject({
          legalName: 'Synthetic Recipient SA',
        });
      }
    },
  );

  it.each([
    'company_offer_preparer',
    'company_commercial_intake',
    'company_director_client_access',
  ])(
    'denies a successor waiting behind committed %s revocation',
    async (bundle) => {
      const { fixture } = await decisionOffer();
      const before = await successorEffects();
      const barrier = await pool.connect();
      let pending: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        const backend = (
          await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0];
        if (!backend) throw new Error('Expected backend');
        await barrier.query(
          'SELECT id FROM company_role_assignments WHERE company_id = $1 AND bundle::text = $2 FOR UPDATE',
          [fixture.companyId, bundle],
        );
        pending = decisionRequest(
          fixture,
          `/offers/opportunities/${fixture.opportunityId}/versions`,
          {
            expectedOfferRevision: 1,
            pricingSnapshotId: fixture.snapshotId,
            recipient: { kind: 'PRIMARY' },
          },
          'revocation-race',
        );
        await waitForBlockedRequests(backend.pid, 1);
        await barrier.query(
          'UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text = $2',
          [fixture.companyId, bundle],
        );
        await barrier.query('COMMIT');
        expect((await pending).status).toBe(403);
        expect(await successorEffects()).toEqual(before);
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        if (pending) await Promise.allSettled([pending]);
      }
    },
  );

  it('denies a concurrently invalidated recipient and converges concurrent exact retries', async () => {
    const { fixture } = await decisionOffer();
    const path = `/offers/opportunities/${fixture.opportunityId}/versions`;
    const body = {
      expectedOfferRevision: 1,
      pricingSnapshotId: fixture.snapshotId,
      recipient: { kind: 'PRIMARY' },
    };
    const before = await successorEffects();
    const barrier = await pool.connect();
    let pending: Promise<Response> | undefined;
    try {
      await barrier.query('BEGIN');
      const backend = (
        await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0];
      if (!backend) throw new Error('Expected backend');
      await barrier.query(
        'SELECT id FROM client_accounts WHERE id = $1 FOR UPDATE',
        [fixture.clientId],
      );
      pending = decisionRequest(fixture, path, body, 'invalidated-client');
      await waitForBlockedRequests(backend.pid, 1);
      await barrier.query(
        "UPDATE client_company_relationships SET status = 'archived' WHERE company_id = $1 AND client_account_id = $2",
        [fixture.companyId, fixture.clientId],
      );
      await barrier.query('COMMIT');
      expect((await pending).status).toBe(404);
      expect(await successorEffects()).toEqual(before);
    } finally {
      await barrier.query('ROLLBACK');
      barrier.release();
      if (pending) await Promise.allSettled([pending]);
    }
    await pool.query(
      "UPDATE client_company_relationships SET status = 'active' WHERE company_id = $1 AND client_account_id = $2",
      [fixture.companyId, fixture.clientId],
    );
    const retries = await Promise.all([
      decisionRequest(fixture, path, body, 'identical'),
      decisionRequest(fixture, path, body, 'identical'),
    ]);
    expect(retries.map((result) => result.status)).toEqual([201, 201]);
    expect(await json(retries[0])).toEqual(await json(retries[1]));
    expect(
      (
        await pool.query(
          'SELECT count(*)::integer AS count FROM offer_versions',
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
  });

  it('compares every recorded successor field and keeps corrected identity separate from frozen history', async () => {
    const { fixture, offer } = await transmittedResponseOffer();
    const path = `/offers/opportunities/${fixture.opportunityId}`;
    const entity = record(
      record(
        await command(
          `/clients/${fixture.clientId}/legal-entities`,
          {
            expectedClientVersion: await readClientVersion(fixture),
            legalName: 'Current synthetic branch',
            taxId: 'BRANCH-520',
            legalAddress: '520 Branch Street',
          },
          'new-branch',
          fixture.companyId,
        ),
      ).legalEntity,
    );
    instant = new Date('2026-09-28T09:00:00.000Z');
    const effectiveFrom = instant.toISOString();
    const tariff = record(
      await command(
        `/pricing-configuration/offerings/${fixture.offeringId}/tariff-versions`,
        {
          unit: 'illustrative-unit',
          unitAmount: '100.0000',
          currency: 'USD',
          taxRatePercent: '0.00',
          taxLabel: 'Illustrative tax',
          effectiveFrom,
          expectedActiveVersionNumber: fixture.tariffVersionNumber,
        },
        'new-currency',
        fixture.companyId,
      ),
    );
    const snapshot = record(
      await command(
        `/pricing/opportunities/${fixture.opportunityId}/snapshots`,
        {
          pricingRuleVersionNumber: fixture.ruleVersionNumber,
          lines: [
            {
              offeringId: fixture.offeringId,
              tariffVersionNumber: record(tariff.version).versionNumber,
              quantity: '2',
            },
          ],
        },
        'new-snapshot',
        fixture.companyId,
      ),
    );
    const body = {
      expectedOfferRevision: 3,
      pricingSnapshotId: snapshot.id,
      recipient: { kind: 'ADDITIONAL', legalEntityId: entity.id },
      validityDays: 45,
      scopeNote: '',
      commercialConditions: 'Negotiated synthetic conditions',
    };
    const created = record(
      await command(path + '/versions', body, 'all-fields', fixture.companyId),
    );
    const differences = record(created.version).differences;
    expect(differences).toEqual([
      {
        field: 'recipientKind',
        previous: 'PRIMARY',
        current: 'ADDITIONAL',
        changed: true,
      },
      {
        field: 'recipientAdditionalLegalEntityId',
        previous: null,
        current: entity.id,
        changed: true,
      },
      {
        field: 'recipientLegalName',
        previous: 'Synthetic Recipient SA',
        current: 'Current synthetic branch',
        changed: true,
      },
      {
        field: 'recipientTaxId',
        previous: record(record(offer.version).recipient).taxId,
        current: 'BRANCH-520',
        changed: true,
      },
      {
        field: 'recipientLegalAddress',
        previous: record(record(offer.version).recipient).legalAddress,
        current: '520 Branch Street',
        changed: true,
      },
      {
        field: 'pricingSnapshotId',
        previous: fixture.snapshotId,
        current: snapshot.id,
        changed: true,
      },
      { field: 'currency', previous: 'EUR', current: 'USD', changed: true },
      {
        field: 'total',
        previous: record(record(offer.version).pricingSnapshot).total,
        current: snapshot.total,
        changed: true,
      },
      { field: 'validityDays', previous: 30, current: 45, changed: true },
      {
        field: 'validUntil',
        previous: record(offer.version).validUntil,
        current: record(created.version).validUntil,
        changed: true,
      },
      { field: 'scopeNote', previous: null, current: '', changed: true },
      {
        field: 'commercialConditions',
        previous: null,
        current: 'Negotiated synthetic conditions',
        changed: true,
      },
    ]);
    const base =
      path + '/versions/' + stringField(record(created.version), 'id');
    expect(
      await command(
        base + '/quality-checks',
        {},
        'currency-check',
        fixture.companyId,
      ),
    ).toMatchObject({
      results: expect.arrayContaining([
        { code: 'CURRENCY_UNCHANGED', status: 'WARNING' },
      ]),
    });
    const correction = await request(
      `/clients/${fixture.clientId}/legal-entities/${stringField(entity, 'id')}`,
      fixture.companyId,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'correct-successor-entity',
        },
        body: JSON.stringify({
          expectedClientVersion: await readClientVersion(fixture),
          changes: { legalName: 'Later corrected branch' },
        }),
      },
    );
    expect(correction.status).toBe(200);
    expect(
      await command(path + '/versions', body, 'all-fields', fixture.companyId),
    ).toEqual(created);
    const next = record(
      await command(
        path + '/versions',
        { ...body, expectedOfferRevision: 4 },
        'corrected-successor',
        fixture.companyId,
      ),
    );
    expect(record(next.version).recipient).toMatchObject({
      legalName: 'Later corrected branch',
    });
    expect(record(next.version).differences).toEqual(
      expect.arrayContaining([
        {
          field: 'recipientLegalName',
          previous: 'Current synthetic branch',
          current: 'Later corrected branch',
          changed: true,
        },
        { field: 'scopeNote', previous: '', current: '', changed: false },
      ]),
    );
    const old = record(
      record(await json(await request(base, fixture.companyId))).offer,
    );
    expect(record(old.version)).toMatchObject({
      representation: record(created.version).representation,
      differences,
    });
  });

  it('keeps exact-version detail and history unavailable across Company and unknown targets', async () => {
    const { fixture, offer } = await decisionOffer();
    const other = await preparedOffer('-O7OTHER');
    const path = `/offers/opportunities/${fixture.opportunityId}`;
    for (const suffix of [
      '/versions',
      '/versions/' + stringField(record(offer.version), 'id'),
    ]) {
      const denied = await request(path + suffix, other.companyId);
      expect(denied.status).toBe(404);
      expect(JSON.stringify(await json(denied))).not.toContain(offer.id);
    }
    expect(
      (
        await request(
          path + '/versions/00000000-0000-4000-8000-000000000520',
          fixture.companyId,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          path + '/versions?cursor=' + stringField(offer, 'id') + ':0',
          fixture.companyId,
        )
      ).status,
    ).toBe(400);
  });

  it.each([
    'company_offer_preparer',
    'company_commercial_intake',
    'company_director_client_access',
    'Client relationship',
  ])(
    'commits the successor before a waiting %s change and then denies replay',
    async (fence) => {
      const { fixture, offer } = await decisionOffer();
      const path = `/offers/opportunities/${fixture.opportunityId}/versions`;
      const body = {
        expectedOfferRevision: 1,
        pricingSnapshotId: fixture.snapshotId,
        recipient: { kind: 'PRIMARY' },
      };
      const barrier = await pool.connect();
      const writer = await pool.connect();
      let creation: Promise<Response> | undefined;
      let mutation: Promise<unknown> | undefined;
      try {
        await barrier.query('BEGIN');
        const backend = (
          await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0];
        if (!backend) throw new Error('Expected barrier backend.');
        await barrier.query('SELECT id FROM offers WHERE id = $1 FOR UPDATE', [
          offer.id,
        ]);
        creation = decisionRequest(fixture, path, body, 'command-first');
        await waitForBlockedRequests(backend.pid, 1);
        mutation =
          fence === 'Client relationship'
            ? (async () => {
                await writer.query('BEGIN');
                await writer.query(
                  'SELECT id FROM client_accounts WHERE id = $1 FOR UPDATE',
                  [fixture.clientId],
                );
                await writer.query(
                  "UPDATE client_company_relationships SET status = 'archived' WHERE company_id = $1 AND client_account_id = $2",
                  [fixture.companyId, fixture.clientId],
                );
                await writer.query('COMMIT');
              })()
            : writer.query(
                'UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text = $2',
                [fixture.companyId, fence],
              );
        await waitForBlockedRequests(backend.pid, 2);
        await barrier.query('COMMIT');
        expect((await creation).status).toBe(201);
        await mutation;
        expect(
          (await decisionRequest(fixture, path, body, 'command-first')).status,
        ).toBe(fence === 'Client relationship' ? 404 : 403);
        expect(
          (
            await pool.query(
              'SELECT count(*)::integer AS count FROM offer_versions',
            )
          ).rows,
        ).toEqual([{ count: 2 }]);
        expect(
          (
            await pool.query(
              'SELECT count(*)::integer AS count FROM offer_commands',
            )
          ).rows,
        ).toEqual([{ count: 2 }]);
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
        if (creation) await Promise.allSettled([creation]);
        if (mutation) await Promise.allSettled([mutation]);
        await writer.query('ROLLBACK');
        writer.release();
      }
    },
  );

  it('refuses unknown and another Client additional recipients without successor side effects', async () => {
    const { fixture } = await decisionOffer();
    const foreign = await preparedOffer('-O7ENTITY');
    const additional = record(
      record(
        await command(
          `/clients/${foreign.clientId}/legal-entities`,
          {
            expectedClientVersion: await readClientVersion(foreign),
            legalName: 'Other synthetic entity',
          },
          'foreign-entity',
          foreign.companyId,
        ),
      ).legalEntity,
    );
    const before = await successorEffects();
    const payload = {
      expectedOfferRevision: 1,
      pricingSnapshotId: fixture.snapshotId,
      recipient: { kind: 'ADDITIONAL', legalEntityId: additional.id },
    };
    for (const legalEntityId of [
      additional.id,
      '00000000-0000-4000-8000-000000000520',
    ]) {
      const refused = await decisionRequest(
        fixture,
        `/offers/opportunities/${fixture.opportunityId}/versions`,
        { ...payload, recipient: { kind: 'ADDITIONAL', legalEntityId } },
        String(legalEntityId),
      );
      expect(refused.status).toBe(404);
      expect(JSON.stringify(await json(refused))).not.toContain(additional.id);
      expect(await successorEffects()).toEqual(before);
    }
  });

  async function successorEffects() {
    const rows = [];
    for (const table of [
      'offers',
      'offer_versions',
      'offer_commands',
      'offer_events',
      'offer_quality_runs',
      'offer_decisions',
      'offer_transmissions',
      'offer_client_responses',
      'client_accounts',
    ])
      rows.push(
        (
          await pool.query(
            `SELECT to_jsonb(t) AS value FROM ${table} t ORDER BY id`,
          )
        ).rows,
      );
    return rows;
  }

  it('records an attributed simulated Client acceptance and reopens immutable evidence', async () => {
    const { fixture, offer, base } = await approvedTransmissionOffer();
    const transmission = await command(
      base + '/transmission',
      { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
      'transmission',
      fixture.companyId,
    );
    const body = {
      expectedOfferRevision: 3,
      outcome: 'ACCEPTED',
      receivedAt: instant.toISOString(),
    };
    const response = await command(
      base + '/client-response',
      body,
      'client-response',
      fixture.companyId,
    );
    expect(response).toMatchObject({
      outcome: 'ACCEPTED',
      evidenceKind: 'SIMULATED',
      offerRevision: 4,
      actorWorkspaceMembershipId: fixture.actorMembershipId,
      decidedAt: instant.toISOString(),
      receivedAt: instant.toISOString(),
    });
    expect(
      await command(
        base + '/client-response',
        body,
        'client-response',
        fixture.companyId,
      ),
    ).toEqual(response);
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
    expect(reopened.revision).toBe(4);
    expect(record(reopened.version)).toMatchObject({
      clientResponseState: 'ACCEPTED',
      clientResponse: response,
      transmission,
      representation: record(offer.version).representation,
    });
  });

  it.each(['ACCEPTED', 'REJECTED'])(
    'records timely %s even after validity elapsed and never resamples exact replay',
    async (outcome) => {
      const { fixture, base, offer } = await transmittedResponseOffer();
      const version = record(offer.version);
      const receivedAt = new Date(
        Date.parse(stringField(version, 'validUntil')) - 1,
      ).toISOString();
      instant = new Date(stringField(version, 'validUntil'));
      const body = {
        expectedOfferRevision: 3,
        outcome,
        receivedAt,
        ...(outcome === 'REJECTED'
          ? { reason: ' Synthetic Client refusal ' }
          : {}),
      };
      const evidence = await command(
        base + '/client-response',
        body,
        'response',
        fixture.companyId,
      );
      expect(evidence).toMatchObject({
        outcome,
        receivedAt,
        offerRevision: 4,
        evidenceKind: 'SIMULATED',
      });
      instant = new Date('2028-01-01T00:00:00.000Z');
      expect(
        await command(
          base + '/client-response',
          body,
          'response',
          fixture.companyId,
        ),
      ).toEqual(evidence);
      const changed = await decisionRequest(
        fixture,
        base + '/client-response',
        { ...body, receivedAt: '2026-09-27T09:00:00.000Z' },
        'response',
      );
      expect(changed.status).toBe(409);
      expect(await json(changed)).toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
      });
      const repeated = await decisionRequest(
        fixture,
        base + '/client-response',
        { ...body, expectedOfferRevision: 4 },
        'other',
      );
      expect(repeated.status).toBe(409);
      expect(await json(repeated)).toMatchObject({
        code: 'CLIENT_RESPONSE_ALREADY_RECORDED',
      });
      const events = await pool.query(
        'SELECT metadata FROM offer_events WHERE action = $1',
        ['offer_version.client_response_recorded'],
      );
      expect(events.rows).toEqual([
        {
          metadata: {
            offerId: offer.id,
            offerVersionId: stringField(version, 'id'),
            versionNumber: 1,
            evidenceKind: 'SIMULATED',
            outcome,
            provenance: 'ILLUSTRATIVE',
          },
        },
      ]);
      expect(
        (await pool.query('SELECT status FROM opportunities')).rows,
      ).toEqual([{ status: 'OPEN' }]);
      await expect(
        pool.query("UPDATE offer_client_responses SET outcome = 'EXPIRED'"),
      ).rejects.toThrow();
      await expect(
        pool.query('DELETE FROM offer_client_responses'),
      ).rejects.toThrow();
      await harness.close();
      await openHarness();
      const read = record(
        record(
          await json(
            await request(
              '/offers/opportunities/' + fixture.opportunityId,
              fixture.companyId,
            ),
          ),
        ).offer,
      );
      expect(record(read.version)).toMatchObject({
        clientResponseState: outcome,
        clientResponse: evidence,
        representation: version.representation,
      });
    },
  );

  it('derives pending elapsed validity without writes and records EXPIRED exactly at validity', async () => {
    const { fixture, base, offer } = await transmittedResponseOffer();
    const early = await decisionRequest(
      fixture,
      base + '/client-response',
      { expectedOfferRevision: 3, outcome: 'EXPIRED' },
      'early',
    );
    expect(early.status).toBe(409);
    expect(await json(early)).toMatchObject({
      code: 'OFFER_VALIDITY_NOT_ELAPSED',
    });
    instant = new Date(stringField(record(offer.version), 'validUntil'));
    const read = record(
      record(
        await json(
          await request(
            '/offers/opportunities/' + fixture.opportunityId,
            fixture.companyId,
          ),
        ),
      ).offer,
    );
    expect(record(read.version)).toMatchObject({
      validityElapsed: true,
      clientResponseState: 'PENDING',
      clientResponse: null,
    });
    await expectNoResponseEffects();
    const evidence = await command(
      base + '/client-response',
      { expectedOfferRevision: 3, outcome: 'EXPIRED' },
      'expiry',
      fixture.companyId,
    );
    expect(evidence).toMatchObject({
      outcome: 'EXPIRED',
      decidedAt: instant.toISOString(),
    });
    expect(evidence).not.toHaveProperty('receivedAt');
  });

  it.each(['ACCEPTED', 'REJECTED'])(
    'enforces transmission and decision equality and strict validity for %s',
    async (outcome) => {
      const { fixture, base, offer } = await transmittedResponseOffer();
      const validUntil = stringField(record(offer.version), 'validUntil');
      const extra = outcome === 'REJECTED' ? { reason: 'Client reason' } : {};
      for (const receivedAt of [
        '2026-09-27T08:59:59.999Z',
        '2026-09-27T09:00:00.001Z',
      ]) {
        const invalid = await decisionRequest(
          fixture,
          base + '/client-response',
          { expectedOfferRevision: 3, outcome, receivedAt, ...extra },
          crypto.randomUUID(),
        );
        expect(invalid.status).toBe(400);
        expect(await json(invalid)).toMatchObject({
          code: 'OFFER_VALIDATION_ERROR',
          field: 'receivedAt',
        });
      }
      instant = new Date(validUntil);
      const elapsed = await decisionRequest(
        fixture,
        base + '/client-response',
        { expectedOfferRevision: 3, outcome, receivedAt: validUntil, ...extra },
        'elapsed',
      );
      expect(elapsed.status).toBe(409);
      expect(await json(elapsed)).toMatchObject({
        code: 'OFFER_VALIDITY_ELAPSED',
      });
      instant = new Date('2026-09-27T09:00:00.000Z');
      await command(
        base + '/client-response',
        {
          expectedOfferRevision: 3,
          outcome,
          receivedAt: instant.toISOString(),
          ...extra,
        },
        'equality',
        fixture.companyId,
      );
    },
  );

  it('refuses malformed response fields, missing transmission and stale observed revision without writes', async () => {
    const { fixture, base } = await decisionOffer();
    const body = {
      expectedOfferRevision: 1,
      outcome: 'ACCEPTED',
      receivedAt: instant.toISOString(),
    };
    const missing = await decisionRequest(
      fixture,
      base + '/client-response',
      body,
      'missing',
    );
    expect(missing.status).toBe(409);
    expect(await json(missing)).toMatchObject({
      code: 'OFFER_VERSION_NOT_TRANSMITTED',
    });
    await command(
      base + '/approve',
      { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
      'approval',
      fixture.companyId,
    );
    await command(
      base + '/transmission',
      { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
      'transmission',
      fixture.companyId,
    );
    const bad = [
      null,
      {},
      { ...body, expectedOfferRevision: 3.5 },
      { ...body, outcome: 'WITHDRAWN' },
      { ...body, receivedAt: '2026-02-30T09:00:00.000Z' },
      { ...body, receivedAt: 'Infinity' },
      { ...body, outcome: 'EXPIRED' },
      { ...body, evidenceKind: 'REAL' },
      { ...body, outcome: 'REJECTED' },
      { ...body, outcome: 'REJECTED', reason: ' ' },
      { ...body, outcome: 'REJECTED', reason: 'a'.repeat(501) },
      { ...body, outcome: 'REJECTED', reason: 'bad\0reason' },
      { ...body, reason: 'unsolicited' },
    ];
    for (const payload of bad) {
      const r = await decisionRequest(
        fixture,
        base + '/client-response',
        payload,
        crypto.randomUUID(),
      );
      expect(r.status, JSON.stringify(payload)).toBe(400);
    }
    const stale = await decisionRequest(
      fixture,
      base + '/client-response',
      body,
      'stale',
    );
    expect(stale.status).toBe(409);
    expect(await json(stale)).toMatchObject({ code: 'STALE_OFFER_REVISION' });
    await expectNoResponseEffects();
  });

  it.each(['company_offer_approver', 'company_commercial_intake'])(
    'denies response and exact replay after %s revocation',
    async (bundle) => {
      const { fixture, base } = await transmittedResponseOffer();
      const body = {
        expectedOfferRevision: 3,
        outcome: 'ACCEPTED',
        receivedAt: instant.toISOString(),
      };
      await command(
        base + '/client-response',
        body,
        'exact',
        fixture.companyId,
      );
      await pool.query(
        'UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text = $2',
        [fixture.companyId, bundle],
      );
      for (const key of ['exact', 'new'])
        expect(
          (await decisionRequest(fixture, base + '/client-response', body, key))
            .status,
        ).toBe(403);
      expect(
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM offer_client_responses',
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    },
  );

  it('fails closed on null and unknown approver permission versions', async () => {
    const { fixture, base } = await transmittedResponseOffer();
    const [constraint] = (
      await pool.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'company_role_assignments_permission_set_version_check'",
      )
    ).rows;
    if (!constraint) throw new Error('Expected constraint');
    await pool.query(
      'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
    );
    try {
      for (const version of [null, 'v999']) {
        await pool.query(
          "UPDATE company_role_assignments SET permission_set_version = $1 WHERE company_id = $2 AND bundle::text = 'company_offer_approver'",
          [version, fixture.companyId],
        );
        expect(
          (
            await decisionRequest(
              fixture,
              base + '/client-response',
              {
                expectedOfferRevision: 3,
                outcome: 'ACCEPTED',
                receivedAt: instant.toISOString(),
              },
              'denied',
            )
          ).status,
        ).toBe(403);
      }
      await expectNoResponseEffects();
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
  });

  it.each(['offer_commands', 'offer_events', 'offer_client_responses'])(
    'atomically rolls back response/revision/receipt/event when %s fails',
    async (table) => {
      const { fixture, base } = await transmittedResponseOffer();
      const body = {
        expectedOfferRevision: 3,
        outcome: 'REJECTED',
        receivedAt: instant.toISOString(),
        reason: 'Private synthetic reason',
      };
      const diagnostic = vi.spyOn(Logger.prototype, 'error');
      await pool.query(
        "CREATE FUNCTION fail_response() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic failure'; END; $$",
      );
      await pool.query(
        'CREATE TRIGGER fail_response BEFORE INSERT ON ' +
          table +
          ' FOR EACH ROW EXECUTE FUNCTION fail_response()',
      );
      try {
        const r = await decisionRequest(
          fixture,
          base + '/client-response',
          body,
          'retry',
        );
        expect(r.status).toBe(500);
        const error = await json(r);
        expect(error).toMatchObject({
          code: 'OFFER_CLIENT_RESPONSE_UNCERTAIN',
        });
        expect(JSON.stringify(error)).not.toContain(body.reason);
        await expectNoResponseEffects();
      } finally {
        expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(
          body.reason,
        );
        diagnostic.mockRestore();
        await pool.query('DROP TRIGGER fail_response ON ' + table);
        await pool.query('DROP FUNCTION fail_response()');
      }
      await command(
        base + '/client-response',
        body,
        'retry',
        fixture.companyId,
      );
    },
  );

  it('serializes competing Client outcomes at the observed Offer revision', async () => {
    const { fixture, base, offer } = await transmittedResponseOffer();
    const barrier = await pool.connect();
    let pending;
    try {
      await barrier.query('BEGIN');
      const backend = (
        await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0];
      if (!backend) throw new Error('Expected backend');
      await barrier.query('SELECT id FROM offers WHERE id = $1 FOR UPDATE', [
        offer.id,
      ]);
      pending = Promise.all(
        ['ACCEPTED', 'REJECTED'].map((outcome) =>
          decisionRequest(
            fixture,
            base + '/client-response',
            {
              expectedOfferRevision: 3,
              outcome,
              receivedAt: instant.toISOString(),
              ...(outcome === 'REJECTED' ? { reason: 'Client refusal' } : {}),
            },
            outcome,
          ),
        ),
      );
      await waitForBlockedRequests(backend.pid, 2);
      await barrier.query('COMMIT');
      const results = await pending;
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM offer_client_responses',
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    } finally {
      await barrier.query('ROLLBACK');
      barrier.release();
      if (pending) await Promise.allSettled([pending]);
    }
  });

  it('denies Client response waiting behind a committed approver revocation', async () => {
    const { fixture, base } = await transmittedResponseOffer();
    const { offers: service, actor } = await offerServiceContext(fixture);
    const offerVersionId = base.split('/').at(-1);
    if (!offerVersionId) throw new Error('Expected version');
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
      pending = service.recordClientResponse({
        actor,
        opportunityId: fixture.opportunityId,
        offerVersionId,
        payload: {
          expectedOfferRevision: 3,
          outcome: 'ACCEPTED',
          receivedAt: instant.toISOString(),
        },
        idempotencyKey: 'race',
      });
      const settled = pending.then(
        (value) => ({ value, error: undefined }),
        (error: unknown) => ({ value: undefined, error }),
      );
      await waitForBlockedRequests(backend.pid, 1);
      await barrier.query('COMMIT');
      expect((await settled).error).toMatchObject({ status: 403 });
      await expectNoResponseEffects();
    } finally {
      await barrier.query('ROLLBACK');
      barrier.release();
      if (pending) await Promise.allSettled([pending]);
    }
  });

  it('uses uniform unavailable responses for unknown and cross-Company targets and denies cross-Workspace identity', async () => {
    const { fixture, base } = await transmittedResponseOffer();
    const other = entity(
      await command(
        '/companies',
        { displayName: 'Other response Company' },
        'other-response-company',
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
        'other-' + path,
      );
    const unknown = '00000000-0000-4000-8000-999999999999';
    const body = {
      expectedOfferRevision: 3,
      outcome: 'ACCEPTED',
      receivedAt: instant.toISOString(),
    };
    const payload = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'hidden',
      },
      body: JSON.stringify(body),
    };
    const responses = [
      await request(base + '/client-response', other.id, payload),
      await request(
        '/offers/opportunities/' +
          unknown +
          '/versions/' +
          base.split('/').at(-1) +
          '/client-response',
        fixture.companyId,
        payload,
      ),
      await request(
        '/offers/opportunities/' +
          fixture.opportunityId +
          '/versions/' +
          unknown +
          '/client-response',
        fixture.companyId,
        payload,
      ),
      await request(
        '/offers/opportunities/' +
          fixture.opportunityId +
          '/versions/not-a-uuid/client-response',
        fixture.companyId,
        payload,
      ),
    ];
    const bodies: unknown[] = [];
    for (const r of responses) {
      expect(r.status).toBe(404);
      bodies.push(await json(r));
    }
    expect(bodies).toEqual(Array.from({ length: 4 }, () => bodies[0]));
    const { offers: service, actor } = await offerServiceContext(fixture);
    const offerVersionId = base.split('/').at(-1);
    if (!offerVersionId) throw new Error('Expected version');
    await expect(
      service.recordClientResponse({
        actor: { ...actor, workspaceId: unknown },
        opportunityId: fixture.opportunityId,
        offerVersionId,
        payload: body,
        idempotencyKey: 'hidden',
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expectNoResponseEffects();
  });
  it('converges concurrent exact response retries and replays without sampling time', async () => {
    const { fixture, base } = await transmittedResponseOffer();
    const body = {
      expectedOfferRevision: 3,
      outcome: 'ACCEPTED',
      receivedAt: '2026-09-27T11:00:00+02:00',
    };
    const evidence = await Promise.all([
      command(base + '/client-response', body, 'exact', fixture.companyId),
      command(base + '/client-response', body, 'exact', fixture.companyId),
    ]);
    expect(evidence[1]).toEqual(evidence[0]);
    const sampled = vi.spyOn(serverClock, 'now').mockImplementation(() => {
      throw new Error('Exact replay must not sample time');
    });
    try {
      expect(
        await command(
          base + '/client-response',
          body,
          'exact',
          fixture.companyId,
        ),
      ).toEqual(evidence[0]);
    } finally {
      sampled.mockRestore();
    }
    expect(
      (
        await pool.query(
          'SELECT count(*)::integer AS count FROM offer_client_responses',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
    expect(
      (
        await pool.query(
          "SELECT count(*)::integer AS count FROM offer_events WHERE action = 'offer_version.client_response_recorded'",
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });
  it.each([1, 500])(
    'records exact Client rejection reason length %s',
    async (length) => {
      const { fixture, base } = await transmittedResponseOffer();
      const reason = 'R'.repeat(length);
      const evidence = await command(
        base + '/client-response',
        {
          expectedOfferRevision: 3,
          outcome: 'REJECTED',
          receivedAt: instant.toISOString(),
          reason,
        },
        'reason',
        fixture.companyId,
      );
      expect(evidence).toMatchObject({ outcome: 'REJECTED', reason });
    },
  );

  it('allows the minimal approver to confirm the recorded recipient without Client read or extra visibility', async () => {
    const { fixture, base } = await transmittedResponseOffer();
    await pool.query(
      "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text IN ('company_offer_preparer','company_pricing_user','company_director_client_access')",
      [fixture.companyId],
    );
    const body = {
      expectedOfferRevision: 3,
      outcome: 'ACCEPTED',
      receivedAt: instant.toISOString(),
    };
    const evidence = await command(
      base + '/client-response',
      body,
      'minimal',
      fixture.companyId,
    );
    expect(evidence).toMatchObject({ outcome: 'ACCEPTED', offerRevision: 4 });
    expect(
      await command(
        base + '/client-response',
        body,
        'minimal',
        fixture.companyId,
      ),
    ).toEqual(evidence);
    expect(
      (
        await request(
          '/clients/' + fixture.clientId + '/legal-entities',
          fixture.companyId,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          '/pricing/opportunities/' + fixture.opportunityId + '/snapshots',
          fixture.companyId,
        )
      ).status,
    ).toBe(403);
    const read = record(
      record(
        await json(
          await request(
            '/offers/opportunities/' + fixture.opportunityId,
            fixture.companyId,
          ),
        ),
      ).offer,
    );
    expect(record(read.version)).toMatchObject({
      clientResponseState: 'ACCEPTED',
      recipient: { legalName: 'Synthetic Recipient SA' },
    });
  });

  it('records and replays a response after Client read alone is revoked', async () => {
    const { fixture, base } = await transmittedResponseOffer();
    await pool.query(
      "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text = 'company_director_client_access'",
      [fixture.companyId],
    );
    const body = {
      expectedOfferRevision: 3,
      outcome: 'ACCEPTED',
      receivedAt: instant.toISOString(),
    };
    const evidence = await command(
      base + '/client-response',
      body,
      'without-client-read',
      fixture.companyId,
    );
    expect(evidence).toMatchObject({ outcome: 'ACCEPTED', offerRevision: 4 });
    expect(
      await command(
        base + '/client-response',
        body,
        'without-client-read',
        fixture.companyId,
      ),
    ).toEqual(evidence);
    expect(
      (
        await request(
          '/clients/' + fixture.clientId + '/legal-entities',
          fixture.companyId,
        )
      ).status,
    ).toBe(403);
  });
  it('refuses a response to a superseded immutable version through REST', async () => {
    const { fixture, base } = await transmittedResponseOffer();
    await command(
      `/offers/opportunities/${fixture.opportunityId}/versions`,
      {
        expectedOfferRevision: 3,
        pricingSnapshotId: fixture.snapshotId,
        recipient: { kind: 'PRIMARY' },
      },
      'superseding-version',
      fixture.companyId,
    );
    const before = await successorEffects();
    const refused = await decisionRequest(
      fixture,
      base + '/client-response',
      {
        expectedOfferRevision: 4,
        outcome: 'ACCEPTED',
        receivedAt: instant.toISOString(),
      },
      'superseded',
    );
    expect(refused.status).toBe(409);
    expect(await json(refused)).toMatchObject({
      code: 'OFFER_VERSION_SUPERSEDED',
    });
    expect(await successorEffects()).toEqual(before);
  });
  async function transmittedResponseOffer() {
    const prepared = await approvedTransmissionOffer();
    await command(
      prepared.base + '/transmission',
      { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
      'transmission',
      prepared.fixture.companyId,
    );
    return prepared;
  }
  async function expectNoResponseEffects() {
    expect((await pool.query('SELECT revision FROM offers')).rows).toEqual([
      { revision: 3 },
    ]);
    expect(
      (
        await pool.query(
          'SELECT count(*)::integer AS count FROM offer_client_responses',
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (
        await pool.query(
          'SELECT count(*)::integer AS count FROM offer_commands',
        )
      ).rows,
    ).toEqual([{ count: 3 }]);
    expect(
      (await pool.query('SELECT count(*)::integer AS count FROM offer_events'))
        .rows,
    ).toEqual([{ count: 4 }]);
  }

  it('records one simulated transmission of the approved bytes and reopens pending response evidence', async () => {
    const { fixture, offer, base } = await decisionOffer();
    const version = record(offer.version);
    await command(
      base + '/approve',
      { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
      'approval',
      fixture.companyId,
    );
    const body = {
      expectedOfferRevision: 2,
      acknowledgedWarningCodes: [],
      note: 'Synthetic simulation only.',
    };
    const transmission = record(
      await command(
        base + '/transmission',
        body,
        'transmission',
        fixture.companyId,
      ),
    );
    expect(transmission).toMatchObject({
      channel: 'SIMULATED',
      offerRevision: 3,
      transmittedAt: instant.toISOString(),
      actorWorkspaceMembershipId: fixture.actorMembershipId,
      note: body.note,
      acknowledgedWarningCodes: [],
      representationSha256: record(version.representation).sha256,
    });
    expect(record(transmission.qualityRun).results).toHaveLength(8);
    expect(
      await command(
        base + '/transmission',
        body,
        'transmission',
        fixture.companyId,
      ),
    ).toEqual(transmission);
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
    expect(reopened.revision).toBe(3);
    expect(record(reopened.version)).toMatchObject({
      transmissionState: 'TRANSMITTED',
      clientResponseState: 'PENDING',
      transmission,
      representation: version.representation,
    });
  });

  it('requires approval and exact transmission input, and refuses changed retries, stale revisions and duplicate transmission', async () => {
    const { fixture, offer, base } = await decisionOffer();
    const body = { expectedOfferRevision: 1, acknowledgedWarningCodes: [] };
    const pending = await decisionRequest(
      fixture,
      base + '/transmission',
      body,
      'pending',
    );
    expect(pending.status).toBe(409);
    expect(await json(pending)).toMatchObject({
      code: 'OFFER_VERSION_NOT_APPROVED',
    });
    await command(base + '/approve', body, 'approval', fixture.companyId);
    for (const [index, input] of [
      { ...body, expectedOfferRevision: 0 },
      { ...body, acknowledgedWarningCodes: ['UNKNOWN'] },
      { ...body, acknowledgedWarningCodes: ['VALIDITY_OPEN', 'VALIDITY_OPEN'] },
      { ...body, note: 'a'.repeat(501) },
      { ...body, note: 'unsafe\0note' },
      { ...body, channel: 'EMAIL' },
    ].entries()) {
      expect(
        (
          await decisionRequest(
            fixture,
            base + '/transmission',
            input,
            'invalid-' + index,
          )
        ).status,
      ).toBe(400);
    }
    const stale = await decisionRequest(
      fixture,
      base + '/transmission',
      body,
      'stale',
    );
    expect(stale.status).toBe(409);
    expect(await json(stale)).toMatchObject({ code: 'STALE_OFFER_REVISION' });
    const valid = { ...body, expectedOfferRevision: 2 };
    const recorded = await command(
      base + '/transmission',
      valid,
      'exact',
      fixture.companyId,
    );
    const altered = await decisionRequest(
      fixture,
      base + '/transmission',
      { ...valid, note: null },
      'exact',
    );
    expect(altered.status).toBe(409);
    expect(await json(altered)).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const duplicate = await decisionRequest(
      fixture,
      base + '/transmission',
      { ...valid, expectedOfferRevision: 3 },
      'second',
    );
    expect(duplicate.status).toBe(409);
    expect(await json(duplicate)).toMatchObject({
      code: 'OFFER_VERSION_ALREADY_TRANSMITTED',
    });
    instant = new Date('2027-01-01T00:00:00.000Z');
    expect(
      await command(base + '/transmission', valid, 'exact', fixture.companyId),
    ).toEqual(recorded);
    expect(
      (
        await pool.query(
          'SELECT count(*)::integer AS count FROM offer_transmissions',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
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
          'SELECT count(*)::integer AS count FROM offer_commands',
        )
      ).rows,
    ).toEqual([{ count: 3 }]);
    expect(
      (
        await pool.query(
          "SELECT metadata FROM offer_events WHERE action = 'offer_version.transmission_recorded'",
        )
      ).rows,
    ).toEqual([
      {
        metadata: {
          offerId: offer.id,
          offerVersionId: record(recorded).offerVersionId,
          versionNumber: 1,
          channel: 'SIMULATED',
          provenance: 'ILLUSTRATIVE',
          ruleSetVersion: 1,
          acknowledgedWarningCodes: [],
        },
      },
    ]);
  });

  it('requires current preparer and Opportunity authority before exact transmission replay', async () => {
    const { fixture, base } = await approvedTransmissionOffer();
    const body = { expectedOfferRevision: 2, acknowledgedWarningCodes: [] };
    await pool.query(
      "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text = 'company_offer_preparer'",
      [fixture.companyId],
    );
    expect(
      (await decisionRequest(fixture, base + '/transmission', body, 'denied'))
        .status,
    ).toBe(403);
    await command(
      '/company-offer-preparer-assignments',
      {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      'restore-preparer',
    );
    await command(base + '/transmission', body, 'exact', fixture.companyId);
    await pool.query(
      "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text = 'company_commercial_intake'",
      [fixture.companyId],
    );
    expect(
      (await decisionRequest(fixture, base + '/transmission', body, 'exact'))
        .status,
    ).toBe(403);
    expect(
      (
        await pool.query(
          'SELECT count(*)::integer AS count FROM offer_transmissions',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });

  it('fails closed for unknown captured preparer versions and reopens only recorded recipient identity without Client read', async () => {
    const { fixture, base } = await approvedTransmissionOffer();
    const body = { expectedOfferRevision: 2, acknowledgedWarningCodes: [] };
    const constraint = (
      await pool.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'company_role_assignments_permission_set_version_check'",
      )
    ).rows[0];
    if (!constraint) throw new Error('Expected assignment constraint');
    await pool.query(
      'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
    );
    try {
      for (const version of [null, 'v99']) {
        await pool.query(
          "UPDATE company_role_assignments SET permission_set_version = $1 WHERE company_id = $2 AND bundle::text = 'company_offer_preparer'",
          [version, fixture.companyId],
        );
        expect(
          (
            await decisionRequest(
              fixture,
              base + '/transmission',
              body,
              'unknown-' + version,
            )
          ).status,
        ).toBe(403);
      }
    } finally {
      await pool.query(
        "UPDATE company_role_assignments SET permission_set_version = 'v1' WHERE company_id = $1 AND bundle::text = 'company_offer_preparer'",
        [fixture.companyId],
      );
      await pool.query(
        'ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ' +
          constraint.definition,
      );
    }
    const ordinaryHeaders = await grantConcurrentPreparer(fixture.companyId);
    await pool.query(
      "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text = 'company_director_client_access'",
      [fixture.companyId],
    );
    const response = await request(base + '/transmission', fixture.companyId, {
      method: 'POST',
      headers: {
        ...ordinaryHeaders,
        'content-type': 'application/json',
        'idempotency-key': 'no-client-read',
      },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(201);
    const evidence = await json(response);
    const offer = record(
      record(
        await json(
          await request(
            `/offers/opportunities/${fixture.opportunityId}`,
            fixture.companyId,
            { headers: ordinaryHeaders },
          ),
        ),
      ).offer,
    );
    expect(offer).not.toHaveProperty('clientReference');
    expect(record(offer.version)).toMatchObject({
      transmission: evidence,
      transmissionState: 'TRANSMITTED',
      clientResponseState: 'PENDING',
    });
    expect(
      (
        await request(`/clients/${fixture.clientId}`, fixture.companyId, {
          headers: ordinaryHeaders,
        })
      ).status,
    ).toBe(403);
  });

  it('fences transmission against a concurrent Client identity correction before evaluating warnings', async () => {
    const { fixture, base } = await approvedTransmissionOffer();
    const barrier = await pool.connect();
    let pending: Promise<Response> | undefined;
    try {
      await barrier.query('BEGIN');
      const backend = (
        await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0];
      if (!backend) throw new Error('Expected backend');
      await barrier.query(
        'UPDATE client_accounts SET display_name = $1 WHERE id = $2',
        ['Concurrent corrected identity', fixture.clientId],
      );
      pending = decisionRequest(
        fixture,
        base + '/transmission',
        { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
        'client-race',
      );
      await waitForBlockedRequests(backend.pid, 1);
      await barrier.query('COMMIT');
      const result = await pending;
      expect(result.status).toBe(409);
      expect(await json(result)).toMatchObject({
        code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED',
      });
      await expectNoTransmissionEffects();
    } finally {
      await barrier.query('ROLLBACK');
      barrier.release();
      if (pending) await Promise.allSettled([pending]);
    }
    await command(
      base + '/transmission',
      {
        expectedOfferRevision: 2,
        acknowledgedWarningCodes: ['RECIPIENT_IDENTITY_CURRENT'],
      },
      'client-race-acknowledged',
      fixture.companyId,
    );
  });

  it('uses uniform safe not-found for unknown versions and cross-Company transmission targets', async () => {
    const { fixture, base } = await approvedTransmissionOffer();
    const other = entity(
      await command(
        '/companies',
        { displayName: 'Other transmission Company' },
        'other',
      ),
    );
    for (const path of [
      '/company-commercial-intake-assignments',
      '/company-offer-preparer-assignments',
    ])
      await command(
        path,
        {
          workspaceMembershipId: fixture.actorMembershipId,
          companyId: other.id,
        },
        'other-' + path,
      );
    const payload = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'hidden',
      },
      body: JSON.stringify({
        expectedOfferRevision: 2,
        acknowledgedWarningCodes: [],
      }),
    };
    const cross = await request(base + '/transmission', other.id, payload);
    const unknown = await request(
      base.replace(/[^/]+$/u, '00000000-0000-4000-8000-999999999999') +
        '/transmission',
      fixture.companyId,
      payload,
    );
    expect(cross.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await json(cross)).toEqual(await json(unknown));
    await expectNoTransmissionEffects();
  });

  it('serializes competing transmissions at the Offer revision fence', async () => {
    const { fixture, offer, base } = await approvedTransmissionOffer();
    const barrier = await pool.connect();
    let pending: Promise<Response[]> | undefined;
    try {
      await barrier.query('BEGIN');
      const backend = (
        await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0];
      if (!backend) throw new Error('Expected backend');
      await barrier.query('SELECT id FROM offers WHERE id = $1 FOR UPDATE', [
        offer.id,
      ]);
      pending = Promise.all(
        ['first', 'second'].map((key) =>
          decisionRequest(
            fixture,
            base + '/transmission',
            { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
            key,
          ),
        ),
      );
      await waitForBlockedRequests(backend.pid, 2);
      await barrier.query('COMMIT');
      const responses = await pending;
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      const loser = responses.find((r) => r.status === 409);
      if (!loser) throw new Error('Expected stale loser');
      expect(await json(loser)).toMatchObject({ code: 'STALE_OFFER_REVISION' });
      expect((await pool.query('SELECT revision FROM offers')).rows).toEqual([
        { revision: 3 },
      ]);
      expect(
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM offer_transmissions',
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
      expect(
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM offer_quality_runs',
          )
        ).rows,
      ).toEqual([{ count: 2 }]);
    } finally {
      await barrier.query('ROLLBACK');
      barrier.release();
      if (pending) await Promise.allSettled([pending]);
    }
  });

  it('denies transmission waiting behind a committed preparer revocation', async () => {
    const { fixture, base } = await approvedTransmissionOffer();
    const { offers: service, actor } = await offerServiceContext(fixture);
    const offerVersionId = base.split('/').at(-1);
    if (!offerVersionId) throw new Error('Expected version');
    const barrier = await pool.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await barrier.query('BEGIN');
      const backend = (
        await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0];
      if (!backend) throw new Error('Expected backend');
      await barrier.query(
        "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text = 'company_offer_preparer'",
        [fixture.companyId],
      );
      pending = service.recordTransmission({
        actor,
        opportunityId: fixture.opportunityId,
        offerVersionId,
        payload: { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
        idempotencyKey: 'revoked-race',
      });
      const settled = pending.then(
        (value) => ({ value, error: undefined }),
        (error: unknown) => ({ value: undefined, error }),
      );
      await waitForBlockedRequests(backend.pid, 1);
      await barrier.query('COMMIT');
      expect((await settled).error).toMatchObject({ status: 403 });
      await expectNoTransmissionEffects();
    } finally {
      await barrier.query('ROLLBACK');
      barrier.release();
      if (pending) await Promise.allSettled([pending]);
    }
  });

  it.each(['offer_commands', 'offer_events'])(
    'rolls back simulated transmission, run, revision and receipt when %s fails and allows identical retry',
    async (table) => {
      const { fixture, base } = await approvedTransmissionOffer();
      await pool.query(
        "CREATE FUNCTION fail_synthetic_transmission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic write failure'; END; $$",
      );
      await pool.query(
        `CREATE TRIGGER fail_synthetic_transmission BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_synthetic_transmission()`,
      );
      const body = {
        expectedOfferRevision: 2,
        acknowledgedWarningCodes: [],
        note: 'Private synthetic note',
      };
      try {
        const response = await decisionRequest(
          fixture,
          base + '/transmission',
          body,
          'retry',
        );
        expect(response.status).toBe(500);
        const failure = await json(response);
        expect(failure).toMatchObject({
          code: 'OFFER_TRANSMISSION_UNCERTAIN',
          correlationId: expect.any(String),
        });
        expect(JSON.stringify(failure)).not.toContain(body.note);
        await expectNoTransmissionEffects();
      } finally {
        await pool.query(
          `DROP TRIGGER fail_synthetic_transmission ON ${table}`,
        );
        await pool.query('DROP FUNCTION fail_synthetic_transmission()');
      }
      await command(base + '/transmission', body, 'retry', fixture.companyId);
      await expect(
        pool.query("UPDATE offer_transmissions SET note = 'Changed'"),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pool.query('DELETE FROM offer_transmissions'),
      ).rejects.toMatchObject({ code: '23514' });
    },
  );

  it('requires exactly new warning codes and preserves warnings acknowledged at approval', async () => {
    const { fixture, offer, base } = await decisionOffer();
    await corruptSyntheticVersion(
      'UPDATE offer_versions SET recipient_tax_id = NULL WHERE offer_id = $1',
      [offer.id],
    );
    await command(
      base + '/approve',
      {
        expectedOfferRevision: 1,
        acknowledgedWarningCodes: [
          'RECIPIENT_IDENTITY_CURRENT',
          'RECIPIENT_TAX_ID_RECORDED',
        ],
      },
      'approval',
      fixture.companyId,
    );
    const wrong = await decisionRequest(
      fixture,
      base + '/transmission',
      {
        expectedOfferRevision: 2,
        acknowledgedWarningCodes: ['RECIPIENT_TAX_ID_RECORDED'],
      },
      'extra-warning',
    );
    expect(wrong.status).toBe(409);
    expect(await json(wrong)).toMatchObject({
      code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED',
    });
    const transmission = record(
      await command(
        base + '/transmission',
        { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
        'transmission',
        fixture.companyId,
      ),
    );
    expect(transmission.acknowledgedWarningCodes).toEqual([]);
    expect(record(transmission.qualityRun).results).toContainEqual({
      code: 'RECIPIENT_TAX_ID_RECORDED',
      status: 'WARNING',
    });
  });

  it('blocks a new identity warning until acknowledged without altering approved bytes', async () => {
    const { fixture, offer, base } = await approvedTransmissionOffer();
    const correction = await request(
      `/clients/${fixture.clientId}`,
      fixture.companyId,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'new-identity',
        },
        body: JSON.stringify({
          expectedVersion: await readClientVersion(fixture),
          displayName: 'Corrected synthetic identity',
        }),
      },
    );
    expect(correction.status).toBe(200);
    const denied = await decisionRequest(
      fixture,
      base + '/transmission',
      { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
      'missing-warning',
    );
    expect(denied.status).toBe(409);
    expect(await json(denied)).toMatchObject({
      code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED',
    });
    const transmission = record(
      await command(
        base + '/transmission',
        {
          expectedOfferRevision: 2,
          acknowledgedWarningCodes: ['RECIPIENT_IDENTITY_CURRENT'],
        },
        'new-warning',
        fixture.companyId,
      ),
    );
    expect(transmission.representationSha256).toBe(
      record(record(offer.version).representation).sha256,
    );
    expect(transmission.acknowledgedWarningCodes).toEqual([
      'RECIPIENT_IDENTITY_CURRENT',
    ]);
  });

  it.each([
    'PRICING_SNAPSHOT_COHERENT',
    'VALIDITY_OPEN',
    'RECIPIENT_AVAILABLE',
    'PROVISIONAL_MARKER_PRESENT',
  ])(
    'refuses simulated transmission for current %s and rolls back every new record',
    async (code) => {
      const { fixture, base } = await approvedTransmissionOffer();
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
        const row = (
          await pool.query<{ definition: string }>(
            "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'offer_versions_initial_state_check'",
          )
        ).rows[0];
        if (!row) throw new Error('Expected version constraint');
        constraint = row.definition;
        await pool.query(
          'ALTER TABLE offer_versions DROP CONSTRAINT offer_versions_initial_state_check',
        );
        await corruptSyntheticVersion(
          "UPDATE offer_versions SET provenance = 'INVALID_SYNTHETIC'",
        );
      }
      try {
        const response = await decisionRequest(
          fixture,
          base + '/transmission',
          { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
          'blocked',
        );
        expect(response.status).toBe(409);
        expect(await json(response)).toMatchObject({
          code: 'QUALITY_CHECK_ERRORS',
        });
        await expectNoTransmissionEffects();
      } finally {
        if (constraint) {
          await corruptSyntheticVersion(
            "UPDATE offer_versions SET provenance = 'ILLUSTRATIVE'",
          );
          await pool.query(
            'ALTER TABLE offer_versions ADD CONSTRAINT offer_versions_initial_state_check ' +
              constraint,
          );
        }
      }
    },
  );

  it('refuses a representation checksum mismatch without committing', async () => {
    const { fixture, base } = await approvedTransmissionOffer();
    await pool.query(
      'ALTER TABLE offer_decisions DISABLE TRIGGER offer_decisions_immutable',
    );
    try {
      await pool.query(
        "UPDATE offer_decisions SET representation_sha256 = repeat('a',64)",
      );
    } finally {
      await pool.query(
        'ALTER TABLE offer_decisions ENABLE TRIGGER offer_decisions_immutable',
      );
    }
    const response = await decisionRequest(
      fixture,
      base + '/transmission',
      { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
      'mismatch',
    );
    expect(response.status).toBe(409);
    expect(await json(response)).toMatchObject({
      code: 'REPRESENTATION_MISMATCH',
    });
    await expectNoTransmissionEffects();
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
        await corruptSyntheticVersion(
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
          await corruptSyntheticVersion(
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
    // Assignment events use database time, independently of the Offer clock.
    // Pin their chronology without rewriting the recorded audit rows.
    await pool.query(
      "ALTER TABLE activity_log_events ALTER COLUMN occurred_at SET DEFAULT '2026-09-27T09:00:00Z'::timestamptz",
    );
    try {
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
      expect(await json(changed)).toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
      });
      expect(
        (
          await pool.query<{ count: string }>(
            'SELECT count(*) FROM offer_events WHERE offer_id = $1',
            [created.id],
          )
        ).rows[0]?.count,
      ).toBe('2');

      await pool.query(
        "ALTER TABLE activity_log_events ALTER COLUMN occurred_at SET DEFAULT '2026-09-27T09:00:01Z'::timestamptz",
      );
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
      expect(
        (
          await pool.query<{ occurredAt: Date }>(
            `SELECT occurred_at AS "occurredAt"
               FROM activity_log_events
              WHERE action::text LIKE 'company_offer_preparer_assignment.%'
              ORDER BY occurred_at, id`,
          )
        ).rows.map((event) => event.occurredAt),
      ).toEqual([
        new Date('2026-09-27T09:00:00Z'),
        new Date('2026-09-27T09:00:01Z'),
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
    } finally {
      await pool.query(
        'ALTER TABLE activity_log_events ALTER COLUMN occurred_at SET DEFAULT now()',
      );
    }
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

  it.each(['initial', 'successor'])(
    'rejects a Snapshot from another Opportunity for %s with the canonical conflict and no Offer writes',
    async (phase) => {
      const fixture = await preparedOffer();
      if (phase === 'successor')
        await postOffer(
          fixture,
          {
            pricingSnapshotId: fixture.snapshotId,
            recipient: { kind: 'PRIMARY' },
          },
          'before-mismatch',
        );
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
        `/offers/opportunities/${fixture.opportunityId}${phase === 'successor' ? '/versions' : ''}`,
        fixture.companyId,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': 'mismatched-snapshot-offer',
          },
          body: JSON.stringify({
            ...(phase === 'successor' ? { expectedOfferRevision: 1 } : {}),
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
      expect(writes.rows[0]).toEqual(
        phase === 'successor'
          ? { offers: '1', receipts: '1', events: '2' }
          : { offers: '0', receipts: '0', events: '0' },
      );
    },
  );

  describe('adjusted Pricing Snapshots (O8)', () => {
    it('binds Template v2 and rule set v2 for one, several, mixed and full-line discounts without repricing', async () => {
      const fixture = await adjustedOfferFixture();
      const one = await adjustedSnapshot(
        fixture,
        [{ line: 'A', netReduction: '8.63' }],
        'one',
      );
      const several = await adjustedSnapshot(
        fixture,
        [
          { line: 'A', netReduction: '8.63' },
          { line: 'B', netReduction: '10.00' },
        ],
        'several',
      );
      const mixed = await adjustedSnapshot(
        fixture,
        [{ line: 'A' }, { line: 'B', netReduction: '10.00' }],
        'mixed',
      );
      const fullLine = await adjustedSnapshot(
        fixture,
        [{ line: 'A' }, { line: 'B', netReduction: '240.00' }],
        'full-line',
      );
      // The preparer prepares from immutable traces without adjustment authority.
      await pool.query(
        "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text = 'company_pricing_adjustment'",
        [fixture.companyId],
      );
      const path = `/offers/opportunities/${fixture.opportunityId}`;
      const created = identifiedRecord(
        await command(
          path,
          { pricingSnapshotId: one.id, recipient: { kind: 'PRIMARY' } },
          'adjusted-offer',
          fixture.companyId,
        ),
      );
      const first = record(created.version);
      expect(first).toMatchObject({
        versionNumber: 1,
        qualityRuleSet: 'OFFER_QUALITY_ILLUSTRATIVE',
        qualityRuleSetVersion: 2,
        provisional: true,
        representation: {
          templateCode: 'OFFER_ILLUSTRATIVE',
          templateVersion: 2,
        },
        pricingSnapshot: {
          id: one.id,
          subtotal: '291.37',
          taxTotal: '43.71',
          total: '335.08',
          lines: [
            {
              lineNet: '300.00',
              lineTax: '45.00',
              netReduction: '8.63',
              taxReduction: '1.29',
              adjustedLineNet: '291.37',
              adjustedLineTax: '43.71',
              adjustment: {
                type: 'FIXED_NET_DISCOUNT',
                netReduction: '8.63',
                taxReduction: '1.29',
                reason: 'Synthetic <discount> & "reason" A',
              },
            },
          ],
        },
      });
      const html = stringField(record(first.representation), 'html');
      expect(html).toContain(
        '<tr><td colspan="4">Fixed discount: Synthetic &lt;discount&gt; &amp; &quot;reason&quot; A</td><td>8.63 EUR</td><td>Tax reduction</td><td>1.29 EUR</td></tr>',
      );
      expect(html).toContain('<dd>OFFER_ILLUSTRATIVE v2</dd>');
      expect(html).toContain('<dt>Total</dt><dd>335.08 EUR</dd>');
      const firstRun = record(
        await command(
          `${path}/versions/${stringField(first, 'id')}/quality-checks`,
          {},
          'adjusted-run-1',
          fixture.companyId,
        ),
      );
      expect(firstRun).toMatchObject({
        ruleSet: 'OFFER_QUALITY_ILLUSTRATIVE',
        ruleSetVersion: 2,
      });
      expect(firstRun.results).toEqual(allPass());

      let revision = 1;
      for (const [key, snapshot, expected] of [
        ['several', several, { subtotal: '521.37', taxTotal: '87.41' }],
        ['mixed', mixed, { subtotal: '530.00', taxTotal: '88.70' }],
        ['full-line', fullLine, { subtotal: '300.00', taxTotal: '45.00' }],
      ] as const) {
        const successor = record(
          await command(
            path + '/versions',
            {
              expectedOfferRevision: revision,
              pricingSnapshotId: snapshot.id,
              recipient: { kind: 'PRIMARY' },
            },
            'successor-' + key,
            fixture.companyId,
          ),
        );
        revision += 1;
        const version = record(successor.version);
        expect(version).toMatchObject({
          qualityRuleSetVersion: 2,
          representation: { templateVersion: 2 },
          pricingSnapshot: { id: snapshot.id, ...expected },
        });
        const reloaded = record(
          record(
            await json(
              await request(
                `${path}/versions/${stringField(version, 'id')}`,
                fixture.companyId,
              ),
            ),
          ).offer,
        );
        expect(record(reloaded.version).representation).toEqual(
          version.representation,
        );
        const run = record(
          await command(
            `${path}/versions/${stringField(version, 'id')}/quality-checks`,
            {},
            'adjusted-run-' + key,
            fixture.companyId,
          ),
        );
        expect(run).toMatchObject({ ruleSetVersion: 2, results: allPass() });
      }
      const fullLineRead = record(
        record(record(await json(await request(path, fixture.companyId))).offer)
          .version,
      );
      const fullLineHtml = stringField(
        record(fullLineRead.representation),
        'html',
      );
      expect(fullLineHtml).toContain(
        '<tr><td colspan="4">Adjusted line</td><td>0.00 EUR</td><td>Adjusted tax</td><td>0.00 EUR</td></tr>',
      );
      // An unadjusted Snapshot keeps the v1 binding and v1 bytes.
      const unadjusted = record(
        await command(
          path + '/versions',
          {
            expectedOfferRevision: revision,
            pricingSnapshotId: fixture.snapshotId,
            recipient: { kind: 'PRIMARY' },
          },
          'successor-unadjusted',
          fixture.companyId,
        ),
      );
      const v1 = record(unadjusted.version);
      expect(v1).toMatchObject({
        qualityRuleSetVersion: 1,
        representation: { templateVersion: 1 },
      });
      expect(stringField(record(v1.representation), 'html')).not.toContain(
        'Fixed discount',
      );
      expect(
        record(
          await command(
            `${path}/versions/${stringField(v1, 'id')}/quality-checks`,
            {},
            'unadjusted-run',
            fixture.companyId,
          ),
        ),
      ).toMatchObject({ ruleSetVersion: 1, results: allPass() });
      expect(
        (
          await pool.query(
            'SELECT version_number, template_version FROM offer_versions ORDER BY version_number',
          )
        ).rows,
      ).toEqual([
        { version_number: 1, template_version: 2 },
        { version_number: 2, template_version: 2 },
        { version_number: 3, template_version: 2 },
        { version_number: 4, template_version: 2 },
        { version_number: 5, template_version: 1 },
      ]);
      // The Snapshot trace was read, never rewritten.
      expect(
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM pricing_snapshot_adjustments',
          )
        ).rows,
      ).toEqual([{ count: 5 }]);
      const createdEvents = (
        await pool.query<{ metadata: Record<string, unknown> }>(
          "SELECT metadata FROM offer_events WHERE action = 'offer_version.created'",
        )
      ).rows;
      expect(createdEvents).toHaveLength(5);
      for (const { metadata } of createdEvents)
        expect(Object.keys(metadata).sort()).toEqual(
          expect.not.arrayContaining(['reason', 'netReduction', 'total']),
        );
    });

    it('approves, transmits, responds and negotiates a v2 version with rule set version 2 evidence and minimal events', async () => {
      const fixture = await adjustedOfferFixture();
      const snapshot = await adjustedSnapshot(
        fixture,
        [{ line: 'A', netReduction: '8.63' }],
        'decision',
      );
      await command(
        '/company-offer-approver-assignments',
        {
          workspaceMembershipId: fixture.actorMembershipId,
          companyId: fixture.companyId,
        },
        'grant-approver-o8',
      );
      const path = `/offers/opportunities/${fixture.opportunityId}`;
      const offer = record(
        await command(
          path,
          { pricingSnapshotId: snapshot.id, recipient: { kind: 'PRIMARY' } },
          'decision-offer-o8',
          fixture.companyId,
        ),
      );
      const version = record(offer.version);
      const base = `${path}/versions/${stringField(version, 'id')}`;
      const approval = record(
        await command(
          base + '/approve',
          { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
          'approve-o8',
          fixture.companyId,
        ),
      );
      expect(approval).toMatchObject({
        state: 'APPROVED',
        qualityRun: { ruleSetVersion: 2, results: allPass() },
        representationSha256: stringField(
          record(version.representation),
          'sha256',
        ),
      });
      const transmission = record(
        await command(
          base + '/transmission',
          { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
          'transmit-o8',
          fixture.companyId,
        ),
      );
      expect(transmission).toMatchObject({
        qualityRun: { ruleSetVersion: 2 },
        representationSha256: approval.representationSha256,
      });
      await command(
        base + '/client-response',
        {
          expectedOfferRevision: 3,
          outcome: 'REJECTED',
          receivedAt: instant.toISOString(),
          reason: 'Synthetic refusal of the discounted version',
        },
        'respond-o8',
        fixture.companyId,
      );
      const successor = record(
        await command(
          path + '/versions',
          {
            expectedOfferRevision: 4,
            pricingSnapshotId: fixture.snapshotId,
            recipient: { kind: 'PRIMARY' },
          },
          'negotiate-o8',
          fixture.companyId,
        ),
      );
      expect(record(successor.version)).toMatchObject({
        versionNumber: 2,
        qualityRuleSetVersion: 1,
        representation: { templateVersion: 1 },
        differences: expect.arrayContaining([
          {
            field: 'total',
            previous: '335.08',
            current: '345.00',
            changed: true,
          },
        ]),
      });
      const historical = record(
        record(
          await json(
            await request(
              `${path}/versions/${stringField(version, 'id')}`,
              fixture.companyId,
            ),
          ),
        ).offer,
      );
      expect(record(historical.version)).toMatchObject({
        qualityRuleSetVersion: 2,
        representation: version.representation,
        decision: approval,
        transmission,
        clientResponseState: 'REJECTED',
      });
      const events = (
        await pool.query<{ action: string; metadata: Record<string, unknown> }>(
          "SELECT action, metadata FROM offer_events WHERE action IN ('offer_version.approved','offer_version.transmission_recorded') ORDER BY occurred_at, action",
        )
      ).rows;
      expect(events).toEqual([
        {
          action: 'offer_version.approved',
          metadata: {
            offerId: offer.id,
            offerVersionId: version.id,
            versionNumber: 1,
            outcome: 'APPROVED',
            provenance: 'ILLUSTRATIVE',
            ruleSetVersion: 2,
            acknowledgedWarningCodes: [],
          },
        },
        {
          action: 'offer_version.transmission_recorded',
          metadata: {
            offerId: offer.id,
            offerVersionId: version.id,
            versionNumber: 1,
            channel: 'SIMULATED',
            provenance: 'ILLUSTRATIVE',
            ruleSetVersion: 2,
            acknowledgedWarningCodes: [],
          },
        },
      ]);
      const serialized = JSON.stringify(
        (await pool.query('SELECT metadata FROM offer_events')).rows,
      );
      for (const secret of ['8.63', '1.29', '335.08', 'Synthetic <discount>'])
        expect(serialized).not.toContain(secret);
    });

    it.each([
      {
        name: 'a tampered tax total',
        sql: "UPDATE pricing_snapshots SET tax_total = '43.70', total = '335.07' WHERE id = $1",
      },
      {
        name: 'a tampered adjusted subtotal',
        sql: "UPDATE pricing_snapshots SET subtotal = '300.00', total = '343.71' WHERE id = $1",
      },
      {
        name: 'an adjustment instant other than the calculation instant',
        sql: "UPDATE pricing_snapshot_adjustments SET applied_at = applied_at + interval '1 second' WHERE snapshot_id = $1",
      },
    ])(
      'records PRICING_SNAPSHOT_COHERENT ERROR for $name and refuses approval',
      async ({ sql }) => {
        const fixture = await adjustedOfferFixture();
        const snapshot = await adjustedSnapshot(
          fixture,
          [{ line: 'A', netReduction: '8.63' }],
          'tampered',
        );
        await command(
          '/company-offer-approver-assignments',
          {
            workspaceMembershipId: fixture.actorMembershipId,
            companyId: fixture.companyId,
          },
          'grant-approver-tamper',
        );
        const path = `/offers/opportunities/${fixture.opportunityId}`;
        const version = record(
          record(
            await command(
              path,
              {
                pricingSnapshotId: snapshot.id,
                recipient: { kind: 'PRIMARY' },
              },
              'tamper-offer',
              fixture.companyId,
            ),
          ).version,
        );
        await pool.query(sql, [snapshot.id]);
        const base = `${path}/versions/${stringField(version, 'id')}`;
        const run = record(
          await command(
            base + '/quality-checks',
            {},
            'tamper-run',
            fixture.companyId,
          ),
        );
        expect(run).toMatchObject({ ruleSetVersion: 2 });
        expect(run.results).toEqual(
          allPass().map((result) =>
            result.code === 'PRICING_SNAPSHOT_COHERENT'
              ? { ...result, status: 'ERROR' }
              : result,
          ),
        );
        const refused = await decisionRequest(
          fixture,
          base + '/approve',
          { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
          'tamper-approve',
        );
        expect(refused.status).toBe(409);
        expect(await json(refused)).toMatchObject({
          code: 'QUALITY_CHECK_ERRORS',
        });
      },
    );

    it('replays an adjusted creation exactly, conflicts a changed payload and denies replay after preparer revocation', async () => {
      const fixture = await adjustedOfferFixture();
      const snapshot = await adjustedSnapshot(
        fixture,
        [{ line: 'A', netReduction: '8.63' }],
        'replay',
      );
      const body = {
        pricingSnapshotId: snapshot.id,
        recipient: { kind: 'PRIMARY' },
      };
      const created = await command(
        `/offers/opportunities/${fixture.opportunityId}`,
        body,
        'adjusted-replay',
        fixture.companyId,
      );
      instant = new Date('2026-09-28T09:00:00.000Z');
      expect(
        await command(
          `/offers/opportunities/${fixture.opportunityId}`,
          body,
          'adjusted-replay',
          fixture.companyId,
        ),
      ).toEqual(created);
      const changed = await postOffer(
        fixture,
        { ...body, validityDays: 31 },
        'adjusted-replay',
      );
      expect(changed.status).toBe(409);
      expect(await json(changed)).toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
      });
      await pool.query(
        "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text = 'company_offer_preparer'",
        [fixture.companyId],
      );
      expect((await postOffer(fixture, body, 'adjusted-replay')).status).toBe(
        403,
      );
      expect(
        (
          await pool.query(
            'SELECT (SELECT count(*) FROM offer_versions)::integer AS versions, (SELECT count(*) FROM offer_events)::integer AS events',
          )
        ).rows,
      ).toEqual([{ versions: 1, events: 2 }]);
    });

    it('lends the adjusted trace to an Offer reader as version content only and hides it across Companies', async () => {
      const fixture = await adjustedOfferFixture();
      const snapshot = await adjustedSnapshot(
        fixture,
        [{ line: 'A', netReduction: '8.63' }],
        'reader',
      );
      await command(
        `/offers/opportunities/${fixture.opportunityId}`,
        { pricingSnapshotId: snapshot.id, recipient: { kind: 'PRIMARY' } },
        'reader-offer',
        fixture.companyId,
      );
      await command(
        '/company-offer-approver-assignments',
        {
          workspaceMembershipId: fixture.actorMembershipId,
          companyId: fixture.companyId,
        },
        'grant-approver-reader',
      );
      await pool.query(
        "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND bundle::text IN ('company_offer_preparer','company_pricing_user','company_pricing_adjustment')",
        [fixture.companyId],
      );
      const read = await request(
        `/offers/opportunities/${fixture.opportunityId}`,
        fixture.companyId,
      );
      expect(read.status).toBe(200);
      expect(
        record(record(record(await json(read)).offer).version).pricingSnapshot,
      ).toMatchObject({
        id: snapshot.id,
        total: '335.08',
        lines: [{ adjustment: { netReduction: '8.63' } }],
      });
      expect(
        (
          await request(
            `/pricing/opportunities/${fixture.opportunityId}/snapshots`,
            fixture.companyId,
          )
        ).status,
      ).toBe(403);
      const other = await preparedOffer('-O8OTHER');
      expect(
        (
          await request(
            `/offers/opportunities/${fixture.opportunityId}`,
            other.companyId,
          )
        ).status,
      ).toBe(404);
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

  it('refuses a new Offer in every non-OPEN outcome status and creates it once the Opportunity is open again', async () => {
    const fixture = await preparedOffer();
    await command(
      '/company-opportunity-manager-assignments',
      {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      'grant-opportunity-manager',
    );
    let version = 1;
    async function changeOutcome(change: Record<string, unknown>) {
      const response = await request(
        `/commercial-intake/opportunities/${fixture.opportunityId}/outcome`,
        fixture.companyId,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': `outcome-${version}`,
          },
          body: JSON.stringify({ expectedVersion: version, ...change }),
        },
      );
      expect(response.status).toBe(200);
      version += 1;
    }
    const creation = {
      pricingSnapshotId: fixture.snapshotId,
      recipient: { kind: 'PRIMARY' },
      scopeNote: 'Illustrative preparation scope.',
    };
    for (const [close, reopen] of [
      [
        { status: 'ON_HOLD', reason: 'Client asked to wait' },
        { status: 'OPEN' },
      ],
      [{ status: 'WON' }, { status: 'OPEN', reason: 'Declared too early' }],
      [
        { status: 'LOST', lossReasonCode: 'PRICE' },
        { status: 'OPEN', reason: 'Client returned' },
      ],
      [
        { status: 'DISQUALIFIED', reason: 'Outside our scope' },
        { status: 'OPEN', reason: 'Scope confirmed' },
      ],
      [
        { status: 'ARCHIVED', reason: 'Duplicate Request' },
        { status: 'OPEN', reason: 'Not a duplicate' },
      ],
    ] satisfies Array<[Record<string, unknown>, Record<string, unknown>]>) {
      await changeOutcome(close);
      const refused = await postOffer(
        fixture,
        creation,
        `refused-${String(close.status)}`,
      );
      expect(refused.status).toBe(409);
      expect(await json(refused)).toMatchObject({
        code: 'OPPORTUNITY_NOT_OPEN',
      });
      await expectNoOfferWrites();
      await changeOutcome(reopen);
    }
    const created = await postOffer(fixture, creation, 'created-when-open');
    expect(created.status).toBe(201);
  });

  it('serializes an Opportunity closure with a concurrent Offer creation instead of deadlocking', async () => {
    const fixture = await preparedOffer();
    await command(
      '/company-opportunity-manager-assignments',
      {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      'grant-opportunity-manager',
    );
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
        `SELECT id FROM client_requests WHERE id =
           (SELECT client_request_id FROM opportunities WHERE id = $1)
         FOR UPDATE`,
        [fixture.opportunityId],
      );
      // Offer creation queues first on the held Request, then needs the
      // Opportunity.
      const offer = postOffer(
        fixture,
        {
          pricingSnapshotId: fixture.snapshotId,
          recipient: { kind: 'PRIMARY' },
        },
        'offer-during-closure',
      );
      await waitForBlockedRequests(blockerPid, 1);
      // The closure must also queue on that Request. Taking the Opportunity
      // first would let the Offer, once granted the Request, wait on the
      // Opportunity while the closure's event insert waits on the Request.
      const closure = request(
        `/commercial-intake/opportunities/${fixture.opportunityId}/outcome`,
        fixture.companyId,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': 'closure-during-offer',
          },
          body: JSON.stringify({
            expectedVersion: 1,
            status: 'LOST',
            lossReasonCode: 'PRICE',
          }),
        },
      );
      for (let attempt = 0; ; attempt += 1) {
        const waiting = await pool.query<{ count: string }>(
          `SELECT count(*) AS count FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`,
        );
        if (Number(waiting.rows[0]?.count) >= 2) break;
        if (attempt >= 40)
          throw new Error('Expected the closure to wait behind the Offer.');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      await barrier.query('COMMIT');
      released = true;
      const [created, closed] = await Promise.all([offer, closure]);
      expect([created.status, closed.status]).toEqual([201, 200]);
    } finally {
      if (!released) await barrier.query('ROLLBACK');
      barrier.release();
    }
    const state = await pool.query<{ status: string; offers: string }>(
      `SELECT (SELECT status FROM opportunities WHERE id = $1) AS status,
              (SELECT count(*) FROM offers) AS offers`,
      [fixture.opportunityId],
    );
    expect(state.rows[0]).toEqual({ status: 'LOST', offers: '1' });
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

  async function expectNoTransmissionEffects() {
    expect((await pool.query('SELECT revision FROM offers')).rows).toEqual([
      { revision: 2 },
    ]);
    expect(
      (
        await pool.query(
          'SELECT count(*)::integer AS count FROM offer_transmissions',
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
          'SELECT count(*)::integer AS count FROM offer_commands',
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
    expect(
      (await pool.query('SELECT count(*)::integer AS count FROM offer_events'))
        .rows,
    ).toEqual([{ count: 3 }]);
  }

  async function approvedTransmissionOffer() {
    const prepared = await decisionOffer();
    await command(
      prepared.base + '/approve',
      { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
      'approval',
      prepared.fixture.companyId,
    );
    return prepared;
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

  interface AdjustedOfferFixture extends PreparedOffer {
    readonly secondOfferingId: string;
    readonly secondTariffVersionNumber: number;
  }

  /** Two synthetic offerings: A 300.0000 EUR at 15.00 %, B 120.0000 EUR at 19.00 %. */
  async function adjustedOfferFixture(): Promise<AdjustedOfferFixture> {
    const fixture = await preparedOffer();
    const definition = entity(
      record(
        await command(
          '/commercial-catalogue/service-definitions',
          {
            code: 'OFFER-456-B',
            name: 'Second synthetic service',
            description: null,
          },
          'definition-456-b',
          fixture.companyId,
        ),
      ).definition,
    );
    const offering = entity(
      record(
        await command(
          '/commercial-catalogue/offerings',
          { serviceDefinitionId: definition.id, commercialLabel: null },
          'offering-456-b',
          fixture.companyId,
        ),
      ).offering,
    );
    const tariff = published(
      await command(
        `/pricing-configuration/offerings/${offering.id}/tariff-versions`,
        {
          unit: 'illustrative-unit',
          unitAmount: '120.0000',
          currency: 'EUR',
          taxRatePercent: '19.00',
          taxLabel: 'Second illustrative tax',
          effectiveFrom: instant.toISOString(),
          expectedActiveVersionNumber: null,
        },
        'tariff-456-b',
        fixture.companyId,
      ),
    );
    await command(
      '/company-pricing-adjustment-assignments',
      {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      'grant-adjustment-o8',
    );
    return {
      ...fixture,
      secondOfferingId: offering.id,
      secondTariffVersionNumber: tariff.versionNumber,
    };
  }

  async function adjustedSnapshot(
    fixture: AdjustedOfferFixture,
    lines: ReadonlyArray<{ line: 'A' | 'B'; netReduction?: string }>,
    key: string,
  ): Promise<Record<string, unknown> & { id: string }> {
    return identifiedRecord(
      await command(
        `/pricing/opportunities/${fixture.opportunityId}/snapshots`,
        {
          pricingRuleVersionNumber: fixture.ruleVersionNumber,
          lines: lines.map(({ line, netReduction }) => ({
            ...(line === 'A'
              ? {
                  offeringId: fixture.offeringId,
                  tariffVersionNumber: fixture.tariffVersionNumber,
                  quantity: '1',
                }
              : {
                  offeringId: fixture.secondOfferingId,
                  tariffVersionNumber: fixture.secondTariffVersionNumber,
                  quantity: '2',
                }),
            ...(netReduction === undefined
              ? {}
              : {
                  adjustment: {
                    type: 'FIXED_NET_DISCOUNT',
                    netReduction,
                    reason: `Synthetic <discount> & "reason" ${line}`,
                  },
                }),
          })),
        },
        'adjusted-snapshot-' + key,
        fixture.companyId,
      ),
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

  // Deliberate corruption of disposable synthetic content, under an exclusive
  // table lock. The production guard is restored before this transaction commits.
  async function corruptSyntheticVersion(text: string, values: string[] = []) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'ALTER TABLE offer_versions DISABLE TRIGGER offer_versions_immutable',
      );
      await client.query(text, values);
      await client.query(
        'ALTER TABLE offer_versions ENABLE TRIGGER offer_versions_immutable',
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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

function allPass(): Array<{ code: string; status: 'PASS' | 'ERROR' }> {
  return [
    'PRICING_SNAPSHOT_COHERENT',
    'CURRENCY_UNCHANGED',
    'VALIDITY_OPEN',
    'RECIPIENT_AVAILABLE',
    'RECIPIENT_IDENTITY_CURRENT',
    'RECIPIENT_TAX_ID_RECORDED',
    'PRICING_CLIENT_CONTEXT_COHERENT',
    'PROVISIONAL_MARKER_PRESENT',
  ].map((code) => ({ code, status: 'PASS' }));
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
