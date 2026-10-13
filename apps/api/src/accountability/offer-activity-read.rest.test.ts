import type { Pool } from 'pg';
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

// Synthetic data only. Every Offer here is illustrative and provisional.
const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000592';

const OWNER = headersFor('workspace-owner', 'Workspace Owner');
const READER = headersFor('offer-activity-reader', 'Offer Reader');

const CONTEXT = '/company-context-assignments';
const INTAKE = '/company-commercial-intake-assignments';
const ACTIVITY_READER = '/company-commercial-activity-reader-assignments';
const OFFER_APPROVER = '/company-offer-approver-assignments';
const OWNER_ASSIGNMENTS = [
  '/company-director-client-assignments',
  '/company-service-catalogue-assignments',
  '/company-pricing-configuration-assignments',
  INTAKE,
  '/company-pricing-user-assignments',
  '/company-offer-preparer-assignments',
  OFFER_APPROVER,
  ACTIVITY_READER,
] as const;

const OFFER_ACTIONS = new Set([
  'offer.created',
  'offer_version.created',
  'offer_version.approved',
  'offer_version.rejected',
  'offer_version.transmission_recorded',
  'offer_version.client_response_recorded',
]);

let instant = new Date('2026-09-27T09:00:00.000Z');
const serverClock: ServerClock = { now: () => new Date(instant.getTime()) };

withPostgres('Offer events in the commercial Activity Log REST', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let origin: string;
  let pool: Pool;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'offer_activity',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      serverClock,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Offer Activity Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'offer-activity-reader',
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

  it('projects a recorded Offer sequence to an authorized reader and nothing to a reader without Offer read', async () => {
    const setup = await preparedCompany();
    const sequence = await negotiatedOffer(setup, 'sequence');
    const owner = await currentActor(OWNER, setup.companyId);

    const events = offerEvents(await activityLog(OWNER, setup.companyId));
    const target = (version: { id: string; versionNumber: number }) => ({
      type: 'offer_version',
      offerVersionId: version.id,
      versionNumber: version.versionNumber,
      illustrativeReference: sequence.illustrativeReference,
      opportunityId: sequence.opportunityId,
      clientRequestId: sequence.requestId,
      companyId: setup.companyId,
    });
    const projected = (
      action: string,
      occurredAt: Date,
      version: { id: string; versionNumber: number },
      metadata: Record<string, unknown> = {},
    ) => ({
      id: expect.any(String),
      action,
      occurredAt: occurredAt.toISOString(),
      actor: {
        internalUserId: owner.internalUserId,
        displayName: 'Workspace Owner',
      },
      target: target(version),
      metadata,
    });
    const { v1, v2, at } = sequence;
    // Newest first inside the existing dated page. Creating the Offer records
    // its two events at one server time; they are compared as a set. Although
    // version 2 now succeeds it, the Offer creation still concerns version 1.
    expect(events.slice(0, 7)).toEqual([
      projected('offer_version.client_response_recorded', at.accepted, v2, {
        outcome: 'ACCEPTED',
        evidenceKind: 'SIMULATED',
      }),
      projected('offer_version.transmission_recorded', at.transmitted2, v2, {
        channel: 'SIMULATED',
      }),
      projected('offer_version.approved', at.approved2, v2),
      projected('offer_version.created', at.created2, v2),
      projected('offer_version.transmission_recorded', at.transmitted1, v1, {
        channel: 'SIMULATED',
      }),
      projected('offer_version.approved', at.approved1, v1),
      events[6],
    ]);
    expect(events.slice(6)).toHaveLength(2);
    expect(events.slice(6)).toEqual(
      expect.arrayContaining([
        projected('offer.created', at.created1, v1),
        projected('offer_version.created', at.created1, v1),
      ]),
    );
    const dated = (await activityLog(OWNER, setup.companyId)).events.flatMap(
      (event) =>
        typeof event.occurredAt === 'string' ? [event.occurredAt] : [],
    );
    expect(dated).toEqual([...dated].sort().reverse());
    const serialized = JSON.stringify(events);
    for (const confidential of [
      'Recorded scope note',
      'Recorded conditions',
      'Revised conditions',
      'Synthetic Recipient',
      'SYNTHETIC-592',
      'pricingSnapshotId',
      'recipientKind',
      'ruleSetVersion',
      'acknowledgedWarningCodes',
      'predecessorVersionNumber',
      'receivedAt',
      'ILLUSTRATIVE',
      sequence.snapshotId,
      sequence.offerId,
    ])
      expect(serialized).not.toContain(confidential);

    const reader = await preparedReader(setup.companyId, [
      CONTEXT,
      INTAKE,
      ACTIVITY_READER,
    ]);
    expect(reader.activeCompany.offerPermissions).toBeUndefined();
    const withoutOfferRead = await activityLog(READER, setup.companyId);
    expect(offerEvents(withoutOfferRead)).toEqual([]);
    expect(withoutOfferRead.events.map((event) => event.action)).toEqual(
      expect.arrayContaining(['client_request.created', 'opportunity.created']),
    );
    expectUndisclosed(withoutOfferRead, sequence);
  });

  it('projects a rejected Offer Version and denies every reader lacking part of the authority', async () => {
    const setup = await preparedCompany();
    const rejected = await rejectedOffer(setup, 'matrix');
    const reader = await preparedReader(setup.companyId, [
      CONTEXT,
      INTAKE,
      OFFER_APPROVER,
      ACTIVITY_READER,
    ]);
    expect(reader.activeCompany.offerPermissions).toContain(
      'commercial.offer.read',
    );
    const readerEvents = async () =>
      offerEvents(await activityLog(READER, setup.companyId));
    expect((await readerEvents()).map((event) => event.action)).toEqual([
      'offer_version.rejected',
      expect.stringMatching(/^offer(_version)?\.created$/u),
      expect.stringMatching(/^offer(_version)?\.created$/u),
    ]);
    expect((await readerEvents())[0]).toMatchObject({
      target: {
        type: 'offer_version',
        offerVersionId: rejected.v1.id,
        versionNumber: 1,
      },
      metadata: {},
    });
    expect(JSON.stringify(await readerEvents())).not.toContain(
      'Internal refusal reason',
    );

    // Offer read without Opportunity read.
    await revoke(INTAKE, reader.workspaceMembershipId, setup.companyId);
    const withoutOpportunityRead = await activityLog(READER, setup.companyId);
    expect(offerEvents(withoutOpportunityRead)).toEqual([]);
    expectUndisclosed(withoutOpportunityRead, rejected);
    await grant(INTAKE, reader.workspaceMembershipId, setup.companyId);
    expect(await readerEvents()).toHaveLength(3);

    // Offer and Opportunity read without the commercial Activity bundle.
    await revoke(
      ACTIVITY_READER,
      reader.workspaceMembershipId,
      setup.companyId,
    );
    const withoutActivityRead = await activityLog(READER, setup.companyId);
    expect(offerEvents(withoutActivityRead)).toEqual([]);
    expectUndisclosed(withoutActivityRead, rejected);
    await grant(ACTIVITY_READER, reader.workspaceMembershipId, setup.companyId);
    expect(await readerEvents()).toHaveLength(3);

    // Every bundle in another Company never reaches this Company's Offers.
    const other = entity(
      await command(
        OWNER,
        '/companies',
        { displayName: 'Other Offer Company' },
        'other-company',
      ),
    );
    for (const path of [CONTEXT, INTAKE, OFFER_APPROVER, ACTIVITY_READER])
      await grant(path, reader.workspaceMembershipId, other.id);
    const otherCompany = await activityLog(READER, other.id);
    expect(offerEvents(otherCompany)).toEqual([]);
    expectUndisclosed(otherCompany, rejected);
    const withoutCompany = await activityLog(READER);
    expect(offerEvents(withoutCompany)).toEqual([]);
    expectUndisclosed(withoutCompany, rejected);

    // A suspended membership reads no history at all.
    await pool.query(
      "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
      [reader.workspaceMembershipId],
    );
    expect(
      (await request('/activity-log', setup.companyId, { headers: READER }))
        .status,
    ).toBe(403);
    await pool.query(
      "UPDATE workspace_memberships SET status = 'active' WHERE id = $1",
      [reader.workspaceMembershipId],
    );
    expect(await readerEvents()).toHaveLength(3);

    // Revoking the only Offer bundle withdraws the history immediately.
    await revoke(OFFER_APPROVER, reader.workspaceMembershipId, setup.companyId);
    const afterRevocation = await activityLog(READER, setup.companyId);
    expect(offerEvents(afterRevocation)).toEqual([]);
    expectUndisclosed(afterRevocation, rejected);

    expect((await fetch(`${origin}/api/activity-log`)).status).toBe(401);
  });

  it('omits every event whose Offer, owning Opportunity or Offer Version cannot be resolved and keeps a resolvable sibling', async () => {
    const setup = await preparedCompany();
    const lostOpportunity = await rejectedOffer(setup, 'lost-opportunity');
    const lostOffer = await rejectedOffer(setup, 'lost-offer');
    const lostFirstVersion = await rejectedOffer(setup, 'lost-version');
    const sibling = await rejectedOffer(setup, 'sibling');
    const before = offerEvents(await activityLog(OWNER, setup.companyId));
    expect(before).toHaveLength(12);

    // Integrity forbids these states. The disposable fixture bypasses its
    // triggers and foreign keys to prove the read fails closed regardless.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role = replica');
      await client.query('DELETE FROM opportunities WHERE id = $1', [
        lostOpportunity.opportunityId,
      ]);
      await client.query('DELETE FROM offers WHERE id = $1', [
        lostOffer.offerId,
      ]);
      // The Offer creation concerns version 1, so it goes with that version.
      await client.query('DELETE FROM offer_versions WHERE id = $1', [
        lostFirstVersion.v1.id,
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const page = await activityLog(OWNER, setup.companyId);
    const after = offerEvents(page);
    expect(after).toEqual(
      before.filter(
        (event) => record(event.target).opportunityId === sibling.opportunityId,
      ),
    );
    expect(after).toHaveLength(3);
    expect(
      after.map((event) => record(event.target).illustrativeReference),
    ).toEqual([
      sibling.illustrativeReference,
      sibling.illustrativeReference,
      sibling.illustrativeReference,
    ]);
    const serialized = JSON.stringify(after);
    for (const missing of [lostOpportunity, lostOffer, lostFirstVersion]) {
      expect(serialized).not.toContain(missing.opportunityId);
      expect(serialized).not.toContain(missing.requestId);
      expect(serialized).not.toContain(missing.v1.id);
    }
  });

  interface PreparedCompany {
    companyId: string;
    ownerMembershipId: string;
    clientId: string;
    ruleVersionNumber: number;
    offeringId: string;
    tariffVersionNumber: number;
  }

  interface RecordedOffer {
    offerId: string;
    requestId: string;
    opportunityId: string;
    snapshotId: string;
    illustrativeReference: number;
    v1: { id: string; versionNumber: number };
  }

  async function preparedCompany(): Promise<PreparedCompany> {
    const company = entity(
      await command(
        OWNER,
        '/companies',
        { displayName: 'Offer Activity Company' },
        `company-${crypto.randomUUID()}`,
      ),
    );
    const owner = await currentActor(OWNER, company.id);
    for (const path of OWNER_ASSIGNMENTS)
      await grant(path, owner.workspaceMembershipId, company.id);
    const client = entity(
      await command(
        OWNER,
        '/clients',
        {
          displayName: 'Synthetic Recipient 592',
          taxId: 'SYNTHETIC-592',
          address: '592 Example Street',
        },
        `client-${crypto.randomUUID()}`,
        company.id,
      ),
    );
    const rule = published(
      await command(
        OWNER,
        '/pricing-configuration/rule-versions',
        {
          label: 'Illustrative rule',
          effectiveFrom: instant.toISOString(),
          expectedActiveVersionNumber: null,
        },
        `rule-${crypto.randomUUID()}`,
        company.id,
      ),
    );
    const definition = entity(
      record(
        await command(
          OWNER,
          '/commercial-catalogue/service-definitions',
          {
            code: 'OFFER-592',
            name: 'Synthetic illustrative service',
            description: null,
          },
          `definition-${crypto.randomUUID()}`,
          company.id,
        ),
      ).definition,
    );
    const offering = entity(
      record(
        await command(
          OWNER,
          '/commercial-catalogue/offerings',
          { serviceDefinitionId: definition.id, commercialLabel: null },
          `offering-${crypto.randomUUID()}`,
          company.id,
        ),
      ).offering,
    );
    const tariff = published(
      await command(
        OWNER,
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
        `tariff-${crypto.randomUUID()}`,
        company.id,
      ),
    );
    return {
      companyId: company.id,
      ownerMembershipId: owner.workspaceMembershipId,
      clientId: client.id,
      ruleVersionNumber: rule.versionNumber,
      offeringId: offering.id,
      tariffVersionNumber: tariff.versionNumber,
    };
  }

  /** One Request, its Snapshot and version 1 of its Offer. */
  async function createdOffer(
    setup: PreparedCompany,
    key: string,
  ): Promise<RecordedOffer & { createdAt: Date }> {
    const intake = record(
      await command(
        OWNER,
        '/commercial-intake/requests',
        {
          originalText: `Synthetic Request for the ${key} Offer history.`,
          sourceLabel: 'Synthetic REST proof',
          subject: `Offer history ${key}`,
          clientAccountId: setup.clientId,
          opportunity: {
            title: `Prepare the ${key} Offer`,
            scope: 'Synthetic scope only',
            nextAction: 'Prepare version 1',
          },
        },
        `request-${key}`,
        setup.companyId,
      ),
    );
    const opportunityId = stringField(record(intake.initialOpportunity), 'id');
    const snapshot = entity(
      await command(
        OWNER,
        `/pricing/opportunities/${opportunityId}/snapshots`,
        {
          pricingRuleVersionNumber: setup.ruleVersionNumber,
          lines: [
            {
              offeringId: setup.offeringId,
              tariffVersionNumber: setup.tariffVersionNumber,
              quantity: '1',
            },
          ],
        },
        `snapshot-${key}`,
        setup.companyId,
      ),
    );
    const createdAt = tick();
    const offer = record(
      await command(
        OWNER,
        `/offers/opportunities/${opportunityId}`,
        {
          pricingSnapshotId: snapshot.id,
          recipient: { kind: 'PRIMARY' },
          scopeNote: 'Recorded scope note',
          commercialConditions: 'Recorded conditions',
        },
        `offer-${key}`,
        setup.companyId,
      ),
    );
    return {
      offerId: stringField(offer, 'id'),
      requestId: stringField(intake, 'id'),
      opportunityId,
      snapshotId: snapshot.id,
      illustrativeReference: numberField(offer, 'illustrativeReference'),
      v1: { id: stringField(record(offer.version), 'id'), versionNumber: 1 },
      createdAt,
    };
  }

  async function rejectedOffer(
    setup: PreparedCompany,
    key: string,
  ): Promise<RecordedOffer> {
    const offer = await createdOffer(setup, key);
    tick();
    await command(
      OWNER,
      `/offers/opportunities/${offer.opportunityId}/versions/${offer.v1.id}/reject`,
      { expectedOfferRevision: 1, reason: 'Internal refusal reason' },
      `reject-${key}`,
      setup.companyId,
    );
    return offer;
  }

  /** Version 1 approved and transmitted, then a successor accepted. */
  async function negotiatedOffer(setup: PreparedCompany, key: string) {
    const offer = await createdOffer(setup, key);
    const path = `/offers/opportunities/${offer.opportunityId}`;
    const v1Path = `${path}/versions/${offer.v1.id}`;
    const approved1 = tick();
    await command(
      OWNER,
      `${v1Path}/approve`,
      { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
      `approve-1-${key}`,
      setup.companyId,
    );
    const transmitted1 = tick();
    await command(
      OWNER,
      `${v1Path}/transmission`,
      { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
      `transmit-1-${key}`,
      setup.companyId,
    );
    const created2 = tick();
    const successor = record(
      await command(
        OWNER,
        `${path}/versions`,
        {
          expectedOfferRevision: 3,
          pricingSnapshotId: offer.snapshotId,
          recipient: { kind: 'PRIMARY' },
          commercialConditions: 'Revised conditions',
        },
        `successor-${key}`,
        setup.companyId,
      ),
    );
    const v2 = {
      id: stringField(record(successor.version), 'id'),
      versionNumber: 2,
    };
    const v2Path = `${path}/versions/${v2.id}`;
    tick();
    await command(
      OWNER,
      `${v2Path}/quality-checks`,
      {},
      `check-2-${key}`,
      setup.companyId,
    );
    const approved2 = tick();
    await command(
      OWNER,
      `${v2Path}/approve`,
      { expectedOfferRevision: 4, acknowledgedWarningCodes: [] },
      `approve-2-${key}`,
      setup.companyId,
    );
    const transmitted2 = tick();
    await command(
      OWNER,
      `${v2Path}/transmission`,
      { expectedOfferRevision: 5, acknowledgedWarningCodes: [] },
      `transmit-2-${key}`,
      setup.companyId,
    );
    const accepted = tick();
    await command(
      OWNER,
      `${v2Path}/client-response`,
      {
        expectedOfferRevision: 6,
        outcome: 'ACCEPTED',
        receivedAt: accepted.toISOString(),
      },
      `accept-2-${key}`,
      setup.companyId,
    );
    return {
      ...offer,
      v2,
      at: {
        created1: offer.createdAt,
        approved1,
        transmitted1,
        created2,
        approved2,
        transmitted2,
        accepted,
      },
    };
  }

  /** A second member holding exactly the given bundles in the Company. */
  async function preparedReader(companyId: string, paths: readonly string[]) {
    const member = await currentActor(READER);
    for (const path of paths)
      await grant(path, member.workspaceMembershipId, companyId);
    const selected = record(
      await json(
        await request('/access/current-actor', companyId, { headers: READER }),
      ),
    );
    return {
      workspaceMembershipId: member.workspaceMembershipId,
      activeCompany: record(selected.activeCompany),
    };
  }

  function tick(): Date {
    instant = new Date(instant.getTime() + 60_000);
    return new Date(instant.getTime());
  }

  async function activityLog(
    headers: Record<string, string>,
    companyId?: string,
  ): Promise<{ events: ProjectedEvent[] }> {
    const response = await request('/activity-log', companyId, { headers });
    expect(response.status).toBe(200);
    return activityPage(await json(response));
  }

  async function currentActor(
    headers: Record<string, string>,
    companyId?: string,
  ) {
    const actor = record(
      await json(
        await request('/access/current-actor', companyId, { headers }),
      ),
    );
    return {
      internalUserId: stringField(actor, 'internalUserId'),
      workspaceMembershipId: stringField(actor, 'workspaceMembershipId'),
    };
  }

  async function grant(
    path: string,
    workspaceMembershipId: string,
    companyId: string,
  ) {
    await command(
      OWNER,
      path,
      { workspaceMembershipId, companyId },
      `grant-${path}-${crypto.randomUUID()}`,
    );
  }

  async function revoke(
    path: string,
    workspaceMembershipId: string,
    companyId: string,
  ) {
    const response = await request(
      `${path}/${workspaceMembershipId}/${companyId}`,
      undefined,
      {
        method: 'DELETE',
        headers: { 'idempotency-key': `revoke-${crypto.randomUUID()}` },
      },
    );
    expect(response.status).toBe(200);
  }

  function request(path: string, companyId?: string, init: RequestInit = {}) {
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
    headers: Record<string, string>,
    path: string,
    body: unknown,
    key: string,
    companyId?: string,
  ): Promise<unknown> {
    const response = await request(path, companyId, {
      method: 'POST',
      headers: {
        ...headers,
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

interface ProjectedEvent {
  action: string;
  occurredAt?: unknown;
  target?: unknown;
  [field: string]: unknown;
}

function activityPage(value: unknown): { events: ProjectedEvent[] } {
  const events = record(value).events;
  if (!Array.isArray(events)) throw new Error('Activity page is missing.');
  return {
    events: events.map((event) => {
      const projected = record(event);
      return { ...projected, action: stringField(projected, 'action') };
    }),
  };
}

function offerEvents(page: { events: ProjectedEvent[] }): ProjectedEvent[] {
  return page.events.filter((event) => OFFER_ACTIONS.has(event.action));
}

/** No identifier of the Offer, its versions, Request or Opportunity leaks. */
function expectUndisclosed(
  page: { events: ProjectedEvent[] },
  offer: { offerId: string; opportunityId: string; v1: { id: string } },
) {
  const serialized = JSON.stringify(page);
  expect(serialized).not.toContain(offer.offerId);
  expect(serialized).not.toContain(offer.v1.id);
  expect(serialized).not.toContain('offer_version');
  expect(serialized).not.toContain('illustrativeReference');
}

function published(value: unknown): { versionNumber: number } {
  const result = record(value);
  expect(result.outcome).toBe('PUBLISHED');
  return {
    versionNumber: numberField(record(result.version), 'versionNumber'),
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
    throw new Error('Expected an object.');
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

function headersFor(subject: string, displayName: string) {
  return {
    'x-test-external-provider': 'deterministic-test',
    'x-test-external-subject': subject,
    'x-test-display-name': displayName,
    'x-test-email': `${subject}@example.test`,
  };
}
