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
  it('D1 prepares and reopens a complete pending-source Contract only with the independent opt-in grant', async () => {
    const fixture = await acceptedOffer({ stopAt: 'TRANSMITTED' });
    await grantContract(fixture, 'early-ordinary-grant');
    const source = await contractPayload(fixture);
    const base = '/contracts/opportunities/' + fixture.opportunityId;
    const body = {
      sourceOfferVersionId: source.acceptedOfferVersionId,
      termStartsOn: '2026-10-01',
      termEndsOn: '2027-10-01',
      specialConditions: '  Literal draft conditions — șț  ',
    };
    const denied = await request({
      path: base + '/preparation',
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'early-create',
        },
        body: JSON.stringify(body),
      },
    });
    expect(denied.status).toBe(403);
    await command({
      path: '/company-contract-early-preparation-assignments',
      body: {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      key: 'early-opt-in',
    });
    const created = record(
      await command({
        path: base + '/preparation',
        companyId: fixture.companyId,
        body,
        key: 'early-create',
      }),
    );
    expect(created).toMatchObject({
      origin: 'OFFER_PREPARATION',
      kind: 'CONTRACT',
      revision: 1,
      sourceOfferVersionId: body.sourceOfferVersionId,
      version: {
        sourceOfferVersionId: body.sourceOfferVersionId,
        scopeNote: 'Accepted scope',
        commercialConditions: 'Accepted conditions',
        specialConditions: body.specialConditions,
        decisionState: 'PENDING',
        executionState: 'NOT_EXECUTED',
        representation: {
          templateCode: 'CONTRACT_PREPARATION_ILLUSTRATIVE',
          templateVersion: 1,
        },
      },
    });
    const reopened = record(
      await json(await request({ path: base, companyId: fixture.companyId })),
    );
    expect(reopened.contract).toEqual(created);
    const text = stringField(
      record(record(created.version).representation),
      'html',
    );
    expect(text).toContain('Provisional illustrative');
    expect(text).toContain(body.specialConditions);
    expect(text).not.toContain('Accepted Offer');
    const versionId = stringField(record(created.version), 'id');
    const run = record(
      await command({
        path: base + '/versions/' + versionId + '/quality-checks',
        companyId: fixture.companyId,
        body: {},
        key: 'early-quality',
      }),
    );
    expect(run).toMatchObject({ ruleSetVersion: 3 });
    expect(run.results).toEqual(
      expect.arrayContaining([
        { code: 'SOURCE_OFFER_ACCEPTED', status: 'ERROR' },
        { code: 'PRICE_MATCHES_SOURCE_OFFER', status: 'PASS' },
        { code: 'PRICING_SNAPSHOT_COHERENT', status: 'PASS' },
        { code: 'CONDITIONS_MATCH_SOURCE_OFFER', status: 'PASS' },
      ]),
    );
    const revised = record(
      await command({
        path: base + '/versions',
        companyId: fixture.companyId,
        key: 'early-revise',
        body: {
          sourceOfferVersionId: body.sourceOfferVersionId,
          expectedContractRevision: 1,
          specialConditions: 'Revised literal draft',
        },
      }),
    );
    expect(revised).toMatchObject({
      contractId: created.id,
      revision: 2,
      versionNumber: 2,
    });
    const oldVersion = record(
      record(
        await json(
          await request({
            path: base + '/versions/' + versionId,
            companyId: fixture.companyId,
          }),
        ),
      ).contract,
    );
    expect(record(oldVersion.version).representation).toEqual(
      record(created.version).representation,
    );
    expect(record(oldVersion.version).sourceOfferVersionId).toBe(
      body.sourceOfferVersionId,
    );
    await command({
      path: '/company-contract-approver-assignments',
      key: 'early-approver',
      body: {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
    });
    const currentId = stringField(revised, 'contractVersionId');
    const approvalPath = base + '/versions/' + currentId + '/approve';
    const approvalBody = {
      expectedContractRevision: 2,
      acknowledgedWarningCodes: ['ADDED_CONDITIONS_CONFIRMED'],
    };
    const blocked = await request({
      path: approvalPath,
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'early-approval',
        },
        body: JSON.stringify(approvalBody),
      },
    });
    expect(blocked.status).toBe(409);
    expect(await json(blocked)).toMatchObject({ code: 'QUALITY_CHECK_ERRORS' });
    await command({
      path:
        '/offers/opportunities/' +
        fixture.opportunityId +
        '/versions/' +
        body.sourceOfferVersionId +
        '/client-response',
      companyId: fixture.companyId,
      key: 'early-explicit-acceptance',
      body: {
        expectedOfferRevision: 3,
        outcome: 'ACCEPTED',
        receivedAt: instant.toISOString(),
      },
    });
    const approved = record(
      await command({
        path: approvalPath,
        companyId: fixture.companyId,
        key: 'early-approval',
        body: approvalBody,
      }),
    );
    expect(approved).toMatchObject({ qualityRun: { ruleSetVersion: 3 } });
    const signed = record(
      await command({
        path: base + '/versions/' + currentId + '/signature',
        companyId: fixture.companyId,
        key: 'early-signature',
        body: { ...signaturePayload(), expectedContractRevision: 3 },
      }),
    );
    expect(signed).toMatchObject({
      evidenceKind: 'SIMULATED',
      qualityRun: { ruleSetVersion: 3 },
    });
    const replay = await command({
      path: base + '/preparation',
      companyId: fixture.companyId,
      body,
      key: 'early-create',
    });
    expect(replay).toMatchObject({
      id: created.id,
      origin: 'OFFER_PREPARATION',
      version: { id: versionId, specialConditions: body.specialConditions },
    });
    await command({
      path: '/company-project-assignments',
      key: 'early-project-grant',
      body: {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
    });
    expect(
      (
        await request({
          path: base + '/project-candidates',
          companyId: fixture.companyId,
        })
      ).status,
    ).toBe(200);
    const addendum = record(
      await command({
        path: base + '/agreements/' + stringField(created, 'id') + '/addenda',
        companyId: fixture.companyId,
        key: 'early-executed-addendum',
        body: {
          expectedContractRevision: 4,
          changeSummary: 'Synthetic post-execution amendment',
        },
      }),
    );
    expect(addendum).toMatchObject({
      kind: 'ADDENDUM',
      parentContractId: created.id,
      version: { representation: { templateCode: 'ADDENDUM_ILLUSTRATIVE' } },
    });
  });
  it('D1 binds an explicit successor source to a new Contract Version while preserving original provenance and receipts', async () => {
    const target = await earlyContract();
    const oldId = stringField(record(target.created.version), 'id');
    const sourceId = await successorSource(target.fixture);
    const revisionBody = {
      sourceOfferVersionId: sourceId,
      expectedContractRevision: 1,
      specialConditions: 'Successor terms',
    };
    const result = record(
      await command({
        path: target.base + '/versions',
        companyId: target.fixture.companyId,
        body: revisionBody,
        key: 'early-successor',
      }),
    );
    const read = record(
      record(
        await json(
          await request({
            path: target.base,
            companyId: target.fixture.companyId,
          }),
        ),
      ).contract,
    );
    expect(read).toMatchObject({
      id: target.created.id,
      sourceOfferVersionId: target.body.sourceOfferVersionId,
      version: {
        id: result.contractVersionId,
        sourceOfferVersionId: sourceId,
        scopeNote: 'Successor scope',
        commercialConditions: 'Successor conditions',
      },
      sourceOffer: { versionNumber: 2 },
    });
    const exact = record(
      record(
        await json(
          await request({
            path: target.base + '/versions/' + oldId,
            companyId: target.fixture.companyId,
          }),
        ),
      ).contract,
    );
    expect(exact).toMatchObject({
      sourceOffer: { versionNumber: 1 },
      version: { sourceOfferVersionId: target.body.sourceOfferVersionId },
    });
    expect(record(exact.version).representation).toEqual(
      record(target.created.version).representation,
    );
    expect(
      await command({
        path: target.base + '/preparation',
        companyId: target.fixture.companyId,
        body: target.body,
        key: 'early-fixture-create',
      }),
    ).toMatchObject({ id: target.created.id, version: { id: oldId } });
    expect(
      await command({
        path: target.base + '/versions',
        companyId: target.fixture.companyId,
        body: revisionBody,
        key: 'early-successor',
      }),
    ).toEqual(result);
    const events = (
      await pool.query<{ metadata: unknown }>(
        "SELECT metadata FROM contract_events WHERE contract_version_id=$1 AND action='contract_version.created'",
        [result.contractVersionId],
      )
    ).rows;
    expect(events).toEqual([
      {
        metadata: expect.objectContaining({
          origin: 'OFFER_PREPARATION',
          offerVersionId: sourceId,
        }),
      },
    ]);
    expect((await pool.query('SELECT id FROM contracts')).rowCount).toBe(1);
    await expect(
      pool.query(
        'UPDATE contract_versions SET source_offer_version_id=$1 WHERE id=$2',
        [sourceId, oldId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        'UPDATE contracts SET source_offer_version_id=$1 WHERE id=$2',
        [sourceId, target.created.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it.each(['DRAFT', 'APPROVED', 'ACCEPTED'] as const)(
    'D1 refuses a new early binding from a %s source without artifacts',
    async (stage) => {
      const target = await earlySourceFixture(stage);
      const before = await earlyEffects();
      const response = await sendEarly({
        fixture: target.fixture,
        path: target.base + '/preparation',
        body: target.body,
        key: 'early-ineligible',
      });
      expect(response.status).toBe(409);
      expect(await json(response)).toMatchObject({
        code: 'OFFER_NOT_PREPARABLE',
      });
      expect(await earlyEffects()).toEqual(before);
    },
  );
  it('D1 refuses a foreign source even when the actor can prepare in both Companies', async () => {
    const first = await earlySourceFixture();
    const second = await earlySourceFixture(
      'TRANSMITTED',
      await preparedOffer('-early-foreign'),
    );
    const before = await earlyEffects();
    const response = await sendEarly({
      fixture: second.fixture,
      path: second.base + '/preparation',
      body: first.body,
      key: 'early-foreign-source',
    });
    expect(response.status).toBe(404);
    expect(await earlyEffects()).toEqual(before);
  });
  it.each([
    'rejected',
    'expired',
    'superseded',
    'archived Client',
    'superseded Client',
    'closed Opportunity',
  ] as const)(
    'D1 replays a committed result after source becomes %s but refuses a new write',
    async (state) => {
      const target = await earlyContract();
      const revisionBody = {
        ...target.body,
        expectedContractRevision: 1,
        specialConditions: 'Committed revision',
      };
      const revision = await command({
        path: target.base + '/versions',
        companyId: target.fixture.companyId,
        body: revisionBody,
        key: 'early-revision-before-invalidation',
      });
      if (state === 'rejected')
        await command({
          path:
            '/offers/opportunities/' +
            target.fixture.opportunityId +
            '/versions/' +
            target.body.sourceOfferVersionId +
            '/client-response',
          companyId: target.fixture.companyId,
          key: 'early-reject-source',
          body: {
            expectedOfferRevision: 3,
            outcome: 'REJECTED',
            receivedAt: instant.toISOString(),
            reason: 'Synthetic refusal',
          },
        });
      if (state === 'expired') instant = new Date('2027-09-27T09:00:00.000Z');
      if (state === 'superseded') await successorSource(target.fixture);
      if (state === 'archived Client')
        await pool.query(
          "UPDATE client_accounts SET status='archived' WHERE id=$1",
          [target.fixture.clientId],
        );
      if (state === 'superseded Client') {
        const canonical = entity(
          await command({
            path: '/clients',
            companyId: target.fixture.companyId,
            key: 'early-canonical-client',
            body: { displayName: 'Synthetic canonical Client' },
          }),
        );
        // Reproduce an existing duplicate; union and retained retries use public commands.
        await pool.query(
          'UPDATE client_accounts SET tax_id=(SELECT tax_id FROM client_accounts WHERE id=$1) WHERE id=$2',
          [target.fixture.clientId, canonical.id],
        );
        const review = record(
          await command({
            path: '/clients/' + target.fixture.clientId + '/union-reviews',
            companyId: target.fixture.companyId,
            key: 'early-client-union-review',
            body: {},
          }),
        );
        expect(review.outcome).toBe('comparison');
        await command({
          path:
            '/client-union-reviews/' +
            stringField(review, 'reviewReference') +
            '/confirm',
          companyId: target.fixture.companyId,
          key: 'early-client-union',
          body: {
            canonicalClientId: canonical.id,
            fields: {
              displayName: canonical.id,
              taxId: canonical.id,
              address: canonical.id,
              telephone: canonical.id,
              generalEmail: canonical.id,
              businessActivity: canonical.id,
            },
            companyIds: [target.fixture.companyId],
            reviewedDifferences: true,
            reason: 'Synthetic original provenance remains readable.',
          },
        });
      }
      if (state === 'closed Opportunity') {
        await command({
          path: '/company-opportunity-manager-assignments',
          key: 'early-outcome-grant',
          body: {
            workspaceMembershipId: target.fixture.actorMembershipId,
            companyId: target.fixture.companyId,
          },
        });
        expect(
          (
            await sendEarly({
              fixture: target.fixture,
              path:
                '/commercial-intake/opportunities/' +
                target.fixture.opportunityId +
                '/outcome',
              body: {
                expectedVersion: 1,
                status: 'LOST',
                lossReasonCode: 'COMPETITOR',
              },
              key: 'early-close-opportunity',
            })
          ).status,
        ).toBe(200);
      }
      const before = await earlyEffects();
      const replay = await command({
        path: target.base + '/preparation',
        companyId: target.fixture.companyId,
        body: target.body,
        key: 'early-fixture-create',
      });
      expect(replay).toMatchObject({
        id: target.created.id,
        version: { id: record(target.created.version).id },
      });
      expect(
        await command({
          path: target.base + '/versions',
          companyId: target.fixture.companyId,
          body: revisionBody,
          key: 'early-revision-before-invalidation',
        }),
      ).toEqual(revision);
      if (state === 'superseded Client')
        expect(
          (
            await sendEarly({
              fixture: target.fixture,
              path: target.base + '/versions',
              body: { ...revisionBody, expectedContractRevision: 2 },
              key: 'early-new-revision-after-client-succession',
            })
          ).status,
        ).toBe(404);
      const fresh = await sendEarly({
        fixture: target.fixture,
        path: target.base + '/preparation',
        body: target.body,
        key: 'early-fresh-after-invalidation',
      });
      expect(fresh.status).toBe(
        state === 'archived Client' || state === 'superseded Client'
          ? 404
          : 409,
      );
      expect(await earlyEffects()).toEqual(before);
    },
  );
  it('D1 refuses a successor naming a different legal entity and retains its complete prior Version', async () => {
    const target = await earlyContract();
    const currentClient = record(
      await json(
        await request({
          path: '/clients/' + target.fixture.clientId,
          companyId: target.fixture.companyId,
        }),
      ),
    );
    const entity = record(
      await command({
        path: '/clients/' + target.fixture.clientId + '/legal-entities',
        companyId: target.fixture.companyId,
        key: 'early-other-party',
        body: {
          expectedClientVersion: numberField(currentClient, 'version'),
          legalName: 'Synthetic Additional Party',
          taxId: 'SYNTHETIC-ADDITIONAL',
          legalAddress: 'Synthetic address',
        },
      }),
    );
    const sourceId = await successorSource(target.fixture, {
      kind: 'ADDITIONAL',
      legalEntityId: stringField(record(entity.legalEntity), 'id'),
    });
    const before = await earlyEffects();
    const refused = await sendEarly({
      fixture: target.fixture,
      path: target.base + '/versions',
      body: { sourceOfferVersionId: sourceId, expectedContractRevision: 1 },
      key: 'early-wrong-party',
    });
    expect(refused.status).toBe(409);
    expect(await json(refused)).toMatchObject({
      code: 'CONTRACT_SOURCE_PARTY_MISMATCH',
    });
    expect(await earlyEffects()).toEqual(before);
    expect(
      await json(
        await request({
          path: target.base,
          companyId: target.fixture.companyId,
        }),
      ),
    ).toMatchObject({
      contract: {
        revision: 1,
        version: { sourceOfferVersionId: target.body.sourceOfferVersionId },
      },
    });
  });
  it.each(['last event', 'response construction'] as const)(
    'D1 rolls back every artifact and Client fence after %s failure, then safely retries',
    async (failure) => {
      const target = await earlySourceFixture();
      const before = await earlyEffects();
      const binding = (
        await pool.query<{ definition: string }>(
          "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='contract_versions'::regclass AND conname='contract_versions_template_binding_check'",
        )
      ).rows[0];
      if (!binding) throw new Error('Missing template constraint');
      try {
        if (failure === 'last event')
          await pool.query(
            "CREATE FUNCTION fail_early_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic last event failure'; END; $$; CREATE TRIGGER fail_early_event BEFORE INSERT ON contract_events FOR EACH ROW WHEN (NEW.action='contract_version.created') EXECUTE FUNCTION fail_early_event()",
          );
        else
          await pool.query(
            "ALTER TABLE contract_versions DROP CONSTRAINT contract_versions_template_binding_check; CREATE FUNCTION fail_early_response() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.clause_versions := '[]'::jsonb; RETURN NEW; END; $$; CREATE TRIGGER fail_early_response BEFORE INSERT ON contract_versions FOR EACH ROW EXECUTE FUNCTION fail_early_response()",
          );
        const response = await sendEarly({
          fixture: target.fixture,
          path: target.base + '/preparation',
          body: target.body,
          key: 'early-rollback',
        });
        expect(response.status).toBe(500);
        expect(await json(response)).toMatchObject({
          code: 'CONTRACT_CREATION_UNCERTAIN',
        });
        expect(await earlyEffects()).toEqual(before);
      } finally {
        if (failure === 'last event')
          await pool.query(
            'DROP TRIGGER fail_early_event ON contract_events; DROP FUNCTION fail_early_event()',
          );
        else
          await pool.query(
            'DROP TRIGGER fail_early_response ON contract_versions; DROP FUNCTION fail_early_response(); ALTER TABLE contract_versions ADD CONSTRAINT contract_versions_template_binding_check ' +
              binding.definition,
          );
      }
      const saved = record(
        await command({
          path: target.base + '/preparation',
          companyId: target.fixture.companyId,
          body: target.body,
          key: 'early-rollback',
        }),
      );
      expect(saved).toMatchObject({
        illustrativeReference: 1,
        version: { versionNumber: 1 },
      });
      expect(
        (await pool.query('SELECT id FROM contract_commands')).rowCount,
      ).toBe(1);
    },
  );
  it('D1 preserves ordinary Contract reads after early and independent Offer grants are revoked, and denies receipt replay', async () => {
    const target = await earlyContract();
    for (const bundle of [
      'contract-early-preparation',
      'offer-preparer',
      'offer-approver',
    ]) {
      const response = await request({
        path:
          '/company-' +
          bundle +
          '-assignments/' +
          target.fixture.actorMembershipId +
          '/' +
          target.fixture.companyId,
        init: {
          method: 'DELETE',
          headers: { 'idempotency-key': 'early-revoke-' + bundle },
        },
      });
      expect(response.status).toBe(200);
    }
    const before = await earlyEffects();
    const read = await request({
      path: target.base,
      companyId: target.fixture.companyId,
    });
    expect(read.status).toBe(200);
    expect(await json(read)).toMatchObject({
      contract: {
        id: target.created.id,
        version: { sourceOfferVersionId: target.body.sourceOfferVersionId },
      },
    });
    expect(
      (
        await sendEarly({
          fixture: target.fixture,
          path: target.base + '/preparation',
          body: target.body,
          key: 'early-fixture-create',
        })
      ).status,
    ).toBe(403);
    expect(await earlyEffects()).toEqual(before);
  });
  it.each(['contract-preparer', 'director-client'] as const)(
    'D1 retains the independent %s authority requirement even for an exact receipt',
    async (bundle) => {
      const target = await earlyContract();
      await command({
        path: '/company-context-assignments',
        key: 'early-independent-context',
        body: {
          workspaceMembershipId: target.fixture.actorMembershipId,
          companyId: target.fixture.companyId,
        },
      });
      const revoked = await request({
        path:
          '/company-' +
          bundle +
          '-assignments/' +
          target.fixture.actorMembershipId +
          '/' +
          target.fixture.companyId,
        init: {
          method: 'DELETE',
          headers: { 'idempotency-key': 'early-independent-revoke' },
        },
      });
      expect(revoked.status).toBe(200);
      const before = await earlyEffects();
      expect(
        (
          await sendEarly({
            fixture: target.fixture,
            path: target.base + '/preparation',
            body: target.body,
            key: 'early-fixture-create',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await request({
            path: target.base,
            companyId: target.fixture.companyId,
          })
        ).status,
      ).toBe(bundle === 'director-client' ? 200 : 403);
      expect(await earlyEffects()).toEqual(before);
    },
  );
  it('D1 converges identical initial keys and serializes distinct successor intents against one revision', async () => {
    const target = await earlySourceFixture();
    const initial = await Promise.all(
      [1, 2].map(() =>
        sendEarly({
          fixture: target.fixture,
          path: target.base + '/preparation',
          body: target.body,
          key: 'early-concurrent-create',
        }),
      ),
    );
    expect(initial.map((response) => response.status)).toEqual([201, 201]);
    const bodies = await Promise.all(initial.map(json));
    expect(bodies[0]).toEqual(bodies[1]);
    const revision = {
      ...target.body,
      expectedContractRevision: 1,
      specialConditions: 'Concurrent successor',
    };
    const results = await Promise.all(
      ['one', 'two'].map((key) =>
        sendEarly({
          fixture: target.fixture,
          path: target.base + '/versions',
          body: revision,
          key: 'early-concurrent-' + key,
        }),
      ),
    );
    expect(results.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect((await pool.query('SELECT id FROM contracts')).rowCount).toBe(1);
    expect(
      (await pool.query('SELECT id FROM contract_versions')).rowCount,
    ).toBe(2);
    expect(
      (
        await pool.query(
          "SELECT id FROM contract_commands WHERE kind='CREATE_VERSION'",
        )
      ).rowCount,
    ).toBe(1);
  });
  it('D1 rejects malformed, caller-owned fields and changed intent under an existing key', async () => {
    const target = await earlySourceFixture();
    const before = await earlyEffects();
    for (const extra of [
      { kind: 'DIRECT' },
      { origin: 'OFFER_PREPARATION' },
      { pricingSnapshotId: target.fixture.snapshotId },
      { specialConditions: 'bad\0value' },
      { termStartsOn: '2027-02-29' },
      { termStartsOn: '2027-01-02', termEndsOn: '2027-01-01' },
    ]) {
      expect(
        (
          await sendEarly({
            fixture: target.fixture,
            path: target.base + '/preparation',
            body: { ...target.body, ...extra },
            key: 'early-invalid',
          })
        ).status,
      ).toBe(400);
      expect(await earlyEffects()).toEqual(before);
    }
    await command({
      path: target.base + '/preparation',
      companyId: target.fixture.companyId,
      body: target.body,
      key: 'early-valid',
    });
    const saved = await earlyEffects();
    const conflict = await sendEarly({
      fixture: target.fixture,
      path: target.base + '/preparation',
      body: { ...target.body, specialConditions: 'Changed intent' },
      key: 'early-valid',
    });
    expect(conflict.status).toBe(409);
    expect(await json(conflict)).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(await earlyEffects()).toEqual(saved);
  });
  it.each(['client', 'early grant'] as const)(
    'D1 refuses a command queued behind %s invalidation without writes',
    async (fence) => {
      const target = await earlySourceFixture();
      const blocker = await pool.connect();
      let pending: Promise<Response> | undefined;
      try {
        await blocker.query('BEGIN');
        const pid = (
          await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0]?.pid;
        if (pid === undefined) throw new Error('Missing barrier');
        if (fence === 'client')
          await blocker.query(
            "UPDATE client_accounts SET status='archived' WHERE id=$1",
            [target.fixture.clientId],
          );
        else
          await blocker.query(
            "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND bundle::text='company_contract_early_preparation'",
            [target.fixture.companyId],
          );
        pending = sendEarly({
          fixture: target.fixture,
          path: target.base + '/preparation',
          body: target.body,
          key: 'early-fence-command',
        });
        await waitForBlocker(pid);
        await blocker.query('COMMIT');
        const before = await earlyEffects();
        expect((await pending).status).toBe(fence === 'client' ? 404 : 403);
        expect(await earlyEffects()).toEqual(before);
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        await pending;
      }
    },
  );
  it.each([
    { source: 'acceptance', preparationFirst: false },
    { source: 'acceptance', preparationFirst: true },
    { source: 'successor', preparationFirst: false },
    { source: 'successor', preparationFirst: true },
  ])(
    'D1 serializes $source with preparationFirst=$preparationFirst at the Opportunity fence',
    async ({ source, preparationFirst }) => {
      const target = await earlySourceFixture();
      const blocker = await pool.connect();
      let first: Promise<Response> | undefined,
        second: Promise<Response> | undefined;
      try {
        await blocker.query('BEGIN');
        const pid = (
          await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0]?.pid;
        if (pid === undefined) throw new Error('Missing source barrier');
        await blocker.query(
          'SELECT id FROM opportunities WHERE id=$1 FOR UPDATE',
          [target.fixture.opportunityId],
        );
        const prepare = () =>
          sendEarly({
            fixture: target.fixture,
            path: target.base + '/preparation',
            body: target.body,
            key: 'early-source-race',
          });
        const invalidate = () =>
          source === 'acceptance'
            ? sendEarly({
                fixture: target.fixture,
                path:
                  '/offers/opportunities/' +
                  target.fixture.opportunityId +
                  '/versions/' +
                  target.body.sourceOfferVersionId +
                  '/client-response',
                body: {
                  expectedOfferRevision: 3,
                  outcome: 'ACCEPTED',
                  receivedAt: instant.toISOString(),
                },
                key: 'early-source-acceptance',
              })
            : sendEarly({
                fixture: target.fixture,
                path:
                  '/offers/opportunities/' +
                  target.fixture.opportunityId +
                  '/versions',
                body: {
                  expectedOfferRevision: 3,
                  pricingSnapshotId: target.fixture.snapshotId,
                  recipient: { kind: 'PRIMARY' },
                },
                key: 'early-source-replacement',
              });
        first = preparationFirst ? prepare() : invalidate();
        const preceding = await waitForBlocker(pid);
        second = preparationFirst ? invalidate() : prepare();
        await waitForBlocker(pid, preceding);
        await blocker.query('COMMIT');
        expect((await first).status).toBe(201);
        expect((await second).status).toBe(preparationFirst ? 201 : 409);
        expect((await pool.query('SELECT id FROM contracts')).rowCount).toBe(
          preparationFirst ? 1 : 0,
        );
        expect(
          (await pool.query('SELECT id FROM contract_events')).rowCount,
        ).toBe(preparationFirst ? 2 : 0);
        if (preparationFirst)
          expect(
            (
              await sendEarly({
                fixture: target.fixture,
                path: target.base + '/preparation',
                body: target.body,
                key: 'early-source-race',
              })
            ).status,
          ).toBe(201);
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        await first;
        await second;
      }
    },
  );
  it.each(['v2', null])(
    'D1 fails closed for an unsupported captured early grant %s',
    async (version) => {
      const target = await earlySourceFixture();
      const check = (
        await pool.query<{ definition: string }>(
          "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='company_role_assignments'::regclass AND conname='company_role_assignments_permission_set_version_check'",
        )
      ).rows[0];
      if (!check) throw new Error('Missing captured-version check');
      const before = await earlyEffects();
      try {
        await pool.query(
          'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
        );
        await pool.query(
          "UPDATE company_role_assignments SET permission_set_version=$1 WHERE company_id=$2 AND bundle::text='company_contract_early_preparation'",
          [version, target.fixture.companyId],
        );
        const actor = record(
          await json(
            await request({
              path: '/access/current-actor',
              companyId: target.fixture.companyId,
            }),
          ),
        );
        expect(
          record(actor.activeCompany).contractEarlyPreparationAssignmentId,
        ).toBeUndefined();
        expect(
          (
            await sendEarly({
              fixture: target.fixture,
              path: target.base + '/preparation',
              body: target.body,
              key: 'early-unknown-grant',
            })
          ).status,
        ).toBe(403);
        expect(await earlyEffects()).toEqual(before);
      } finally {
        await pool.query(
          "UPDATE company_role_assignments SET permission_set_version='v1' WHERE company_id=$1 AND bundle::text='company_contract_early_preparation'",
          [target.fixture.companyId],
        );
        await pool.query(
          'ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ' +
            check.definition,
        );
      }
    },
  );
  it('C7 creates a Precontract from the Accepted Offer and the later main Contract records it', async () => {
    const fixture = await acceptedOffer();
    await grantContract(fixture, 'c7-grant');
    const base = '/contracts/opportunities/' + fixture.opportunityId;
    const source = await contractPayload(fixture);
    const body = { ...source, ...precontractFields() };
    const precontract = record(
      await command({
        path: base,
        companyId: fixture.companyId,
        key: 'c7-create',
        body,
      }),
    );
    expect(precontract).toMatchObject({
      kind: 'PRECONTRACT',
      origin: 'ACCEPTED_OFFER',
      sourceOfferVersionId: source.acceptedOfferVersionId,
      parentContractId: null,
      precontract: null,
      illustrativeReference: 1,
      revision: 1,
      provisional: true,
      version: {
        versionNumber: 1,
        decisionState: 'PENDING',
        executionState: 'NOT_EXECUTED',
        scopeNote: 'Accepted scope',
        commercialConditions: 'Accepted conditions',
        termStartsOn: null,
        termEndsOn: body.termEndsOn,
        specialConditions: null,
        preliminaryWork: {
          scope: body.preliminaryWorkScope,
          financialConditions: body.preliminaryFinancialConditions,
          limits: body.preliminaryLimits,
        },
        representation: {
          templateCode: 'PRECONTRACT_ILLUSTRATIVE',
          templateVersion: 1,
        },
      },
    });
    const precontractId = stringField(precontract, 'id');
    const opened = record(
      await json(await request({ path: base, companyId: fixture.companyId })),
    );
    expect(opened.contract).toBeNull();
    expect(opened.precontract).toEqual({
      id: precontractId,
      illustrativeReference: 1,
      versionNumber: 1,
      decisionState: 'PENDING',
      executionState: 'NOT_EXECUTED',
    });
    expect(
      record(
        await json(
          await request({
            path: base + '/agreements/' + precontractId,
            companyId: fixture.companyId,
          }),
        ),
      ).contract,
    ).toEqual(precontract);
    const events = (
      await pool.query<{ action: string; metadata: unknown }>(
        'SELECT action,metadata FROM contract_events WHERE contract_id=$1 ORDER BY action',
        [precontractId],
      )
    ).rows;
    expect(events.map((event) => event.action)).toEqual([
      'contract.created',
      'contract_version.created',
    ]);
    for (const event of events) {
      expect(record(event.metadata)).toMatchObject({
        kind: 'PRECONTRACT',
        origin: 'ACCEPTED_OFFER',
        offerVersionId: source.acceptedOfferVersionId,
        provenance: 'ILLUSTRATIVE',
      });
      expect(JSON.stringify(event.metadata)).not.toContain('Synthetic');
    }
    const main = record(
      await command({
        path: base,
        companyId: fixture.companyId,
        key: 'c7-main',
        body: source,
      }),
    );
    expect(main).toMatchObject({
      kind: 'CONTRACT',
      illustrativeReference: 1,
      precontract: { id: precontractId, illustrativeReference: 1 },
    });
    expect(String(record(record(main.version).representation).html)).toContain(
      '<dt>Illustrative Precontract reference</dt><dd>1</dd>',
    );
    const reopened = record(
      await json(await request({ path: base, companyId: fixture.companyId })),
    );
    expect(reopened.contract).toEqual(main);
    expect(record(reopened.precontract).id).toBe(precontractId);
  });
  it('C7 checks, approves, signs, conserves and revises a Precontract as its own agreement', async () => {
    const target = await precontractFixture();
    const { fixture, agreement, versionId } = target;
    await grantApprover(fixture);
    const run = record(
      await command({
        path: agreement + '/versions/' + versionId + '/quality-checks',
        companyId: fixture.companyId,
        key: 'c7-check',
        body: {},
      }),
    );
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
      { code: 'ADDED_CONDITIONS_CONFIRMED', status: 'WARNING' },
      { code: 'TERM_END_NOT_PASSED', status: 'PASS' },
      { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
    ]);
    const revised = record(
      await command({
        path: agreement + '/versions',
        companyId: fixture.companyId,
        key: 'c7-revise',
        body: {
          expectedContractRevision: 1,
          ...preliminaryEntry(),
          preliminaryLimits: 'Synthetic narrower limit',
          termEndsOn: '2027-01-31',
        },
      }),
    );
    expect(revised).toMatchObject({ versionNumber: 2, revision: 2 });
    const revisedId = stringField(revised, 'contractVersionId');
    const head = record(
      record(
        await json(
          await request({
            path: agreement + '/versions/' + revisedId,
            companyId: fixture.companyId,
          }),
        ),
      ).contract,
    );
    expect(record(head.version).differences).toEqual([
      { field: 'termEndsOn', before: '2026-12-31', after: '2027-01-31' },
      {
        field: 'preliminaryLimits',
        before: 'Synthetic limit until the Contract',
        after: 'Synthetic narrower limit',
      },
    ]);
    const predecessor = record(
      record(
        await json(
          await request({
            path: agreement + '/versions/' + versionId,
            companyId: fixture.companyId,
          }),
        ),
      ).contract,
    );
    expect(record(predecessor.version)).toMatchObject({
      supersededByVersionId: revisedId,
      representation: record(target.created.version).representation,
    });
    const refused = await request({
      path: agreement + '/versions/' + revisedId + '/approve',
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'c7-unacknowledged',
        },
        body: JSON.stringify({
          expectedContractRevision: 2,
          acknowledgedWarningCodes: [],
        }),
      },
    });
    expect(refused.status).toBe(409);
    expect(await json(refused)).toMatchObject({
      code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED',
    });
    const approved = record(
      await command({
        path: agreement + '/versions/' + revisedId + '/approve',
        companyId: fixture.companyId,
        key: 'c7-approve',
        body: {
          expectedContractRevision: 2,
          acknowledgedWarningCodes: ['ADDED_CONDITIONS_CONFIRMED'],
        },
      }),
    );
    expect(approved).toMatchObject({ kind: 'APPROVE', revision: 3 });
    const signed = record(
      await command({
        path: agreement + '/versions/' + revisedId + '/signature',
        companyId: fixture.companyId,
        key: 'c7-sign',
        body: { ...signaturePayload(), expectedContractRevision: 3 },
      }),
    );
    expect(signed).toMatchObject({ revision: 4, evidenceKind: 'SIMULATED' });
    const executed = record(
      record(
        await json(
          await request({ path: agreement, companyId: fixture.companyId }),
        ),
      ).contract,
    );
    expect(record(executed.version)).toMatchObject({
      executionState: 'EXECUTED',
      decisionState: 'APPROVED',
    });
    expect(
      record(record(executed.version).signature).representationChecksum,
    ).toBe(record(record(executed.version).representation).sha256);
    const late = await request({
      path: agreement + '/versions',
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'c7-late',
        },
        body: JSON.stringify({
          expectedContractRevision: 4,
          ...preliminaryEntry(),
        }),
      },
    });
    expect(late.status).toBe(409);
    expect(await json(late)).toMatchObject({ code: 'CONTRACT_EXECUTED' });
    const events = (
      await pool.query<{ action: string; kind: string }>(
        "SELECT action,metadata->>'kind' AS kind FROM contract_events WHERE contract_id=$1 ORDER BY action",
        [target.created.id],
      )
    ).rows;
    expect(events).toEqual([
      { action: 'contract.created', kind: 'PRECONTRACT' },
      { action: 'contract_version.approved', kind: 'PRECONTRACT' },
      { action: 'contract_version.created', kind: 'PRECONTRACT' },
      { action: 'contract_version.created', kind: 'PRECONTRACT' },
      { action: 'contract_version.signature_recorded', kind: 'PRECONTRACT' },
    ]);
    const opened = record(
      await json(
        await request({ path: target.base, companyId: fixture.companyId }),
      ),
    );
    expect(opened).toMatchObject({
      contract: null,
      precontract: {
        id: target.created.id,
        versionNumber: 2,
        decisionState: 'APPROVED',
        executionState: 'EXECUTED',
      },
    });
  });
  it('C7 executed Precontracts accept Addenda and link or create Projects while unexecuted agreements and Addenda stay non-linkable', async () => {
    const target = await precontractFixture();
    const { fixture, agreement, base } = target;
    await grantApprover(fixture);
    await grantLinkProject(fixture);
    const unexecuted = await request({
      path: agreement + '/projects/create',
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'c7-early-project',
        },
        body: JSON.stringify({
          ...creationPayload([]),
          expectedContractRevision: 1,
        }),
      },
    });
    expect(unexecuted.status).toBe(409);
    expect(await json(unexecuted)).toMatchObject({
      code: 'CONTRACT_NOT_EXECUTED',
    });
    await executePrecontract(target);
    const candidates = record(
      await json(
        await request({
          path: agreement + '/project-candidates',
          companyId: fixture.companyId,
        }),
      ),
    );
    expect(candidates.items).toEqual([]);
    const created = record(
      await command({
        path: agreement + '/projects/create',
        companyId: fixture.companyId,
        key: 'c7-project',
        body: {
          title: 'Synthetic preparatory Project',
          acknowledgedCandidateProjectIds: [],
          expectedContractRevision: 3,
        },
      }),
    );
    expect(record(created.project)).toMatchObject({ status: 'preparatory' });
    expect(record(created.link)).toMatchObject({
      contractId: target.created.id,
      created: true,
      revision: 4,
    });
    const projectId = stringField(record(created.project), 'id');
    expect(
      await json(
        await request({
          path: '/contracts/projects/' + projectId,
          companyId: fixture.companyId,
        }),
      ),
    ).toMatchObject({
      items: [{ id: target.created.id, kind: 'PRECONTRACT' }],
    });
    const child = record(
      await command({
        path: agreement + '/addenda',
        companyId: fixture.companyId,
        key: 'c7-addendum',
        body: {
          expectedContractRevision: 4,
          changeSummary: 'Synthetic Precontract change',
          termEndsOn: '2027-03-31',
        },
      }),
    );
    expect(child).toMatchObject({
      kind: 'ADDENDUM',
      parentContractId: target.created.id,
      parent: { kind: 'PRECONTRACT', illustrativeReference: 1 },
      addendumOrdinal: 1,
    });
    const childAgreement = base + '/agreements/' + stringField(child, 'id');
    const notLinkable = await request({
      path: childAgreement + '/projects',
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'c7-addendum-link',
        },
        body: JSON.stringify({ projectId, expectedContractRevision: 1 }),
      },
    });
    expect(notLinkable.status).toBe(409);
    expect(await json(notLinkable)).toMatchObject({
      code: 'CONTRACT_KIND_NOT_LINKABLE',
    });
    const parent = record(
      record(
        await json(
          await request({ path: agreement, companyId: fixture.companyId }),
        ),
      ).contract,
    );
    expect(parent.addenda).toMatchObject([
      { id: child.id, addendumOrdinal: 1 },
    ]);
    expect(record(parent.version).representation).toEqual(
      record(target.created.version).representation,
    );
    const main = record(
      await command({
        path: base,
        companyId: fixture.companyId,
        key: 'c7-project-main',
        body: target.source,
      }),
    );
    expect(record(main.precontract).id).toBe(target.created.id);
  });
  it('C7 refuses invalid, server-owned and direct Precontract input without writes', async () => {
    const target = await precontractFixture({ create: false });
    const { fixture, base, source } = target;
    const valid = { ...source, ...precontractFields() };
    const cases: [string, unknown][] = [
      ['kind', { ...valid, kind: 'ADDENDUM' }],
      ['termEndsOn', { ...valid, termEndsOn: undefined }],
      ['termEndsOn', { ...valid, termEndsOn: null }],
      ['termEndsOn', { ...valid, termStartsOn: '2027-01-01' }],
      ['preliminaryWorkScope', { ...valid, preliminaryWorkScope: undefined }],
      ['preliminaryWorkScope', { ...valid, preliminaryWorkScope: '   ' }],
      [
        'preliminaryFinancialConditions',
        { ...valid, preliminaryFinancialConditions: 'x'.repeat(2001) },
      ],
      ['preliminaryLimits', { ...valid, preliminaryLimits: 7 }],
      ['scopeNote', { ...valid, scopeNote: 'Re-entered scope' }],
      [
        'pricingSnapshotId',
        { ...valid, pricingSnapshotId: fixture.snapshotId },
      ],
      ['precontractId', { ...valid, precontractId: fixture.opportunityId }],
      ['preliminaryWorkScope', { ...source, preliminaryWorkScope: 'Main' }],
    ];
    for (const [index, [field, body]] of cases.entries()) {
      const response = await sendContract(
        fixture,
        body,
        'c7-invalid-' + String(index),
      );
      expect(response.status, field).toBe(400);
      expect(await json(response)).toMatchObject({
        code: 'INVALID_CONTRACT_INPUT',
        field,
      });
    }
    const direct = await request({
      path: base + '/direct',
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'c7-direct-precontract',
        },
        body: JSON.stringify({
          kind: 'PRECONTRACT',
          recipient: { kind: 'PRIMARY' },
          pricingSnapshotId: fixture.snapshotId,
          directReason: 'Synthetic',
          scopeNote: 'Synthetic',
        }),
      },
    });
    expect(direct.status).toBe(400);
    expect(await json(direct)).toMatchObject({ field: 'kind' });
    expect(await agreementCounts()).toEqual({
      contracts: '0',
      versions: '0',
      receipts: '0',
      events: '0',
      counters: '0',
    });
    const exact = await sendContract(fixture, valid, 'c7-valid-after-refusals');
    expect(exact.status).toBe(201);
    expect(record(await json(exact)).illustrativeReference).toBe(1);
  });
  it('C7 orders refusals: not accepted, existing kind, then Precontract after Contract', async () => {
    const fixture = await preparedOffer();
    await grantContract(fixture, 'c7-order-grant');
    const base = '/contracts/opportunities/' + fixture.opportunityId;
    await command({
      path: base + '/direct',
      companyId: fixture.companyId,
      key: 'c7-order-direct',
      body: {
        recipient: { kind: 'PRIMARY' },
        pricingSnapshotId: fixture.snapshotId,
        directReason: 'Synthetic direct exception',
        scopeNote: 'Synthetic direct scope',
      },
    });
    const offer = record(
      await command({
        path: '/offers/opportunities/' + fixture.opportunityId,
        companyId: fixture.companyId,
        key: 'c7-order-offer',
        body: {
          recipient: { kind: 'PRIMARY' },
          pricingSnapshotId: fixture.snapshotId,
          scopeNote: 'Offer scope',
        },
      }),
    );
    const offerVersionId = stringField(record(offer.version), 'id');
    const body = {
      acceptedOfferVersionId: offerVersionId,
      ...precontractFields(),
    };
    const notAccepted = await sendContract(fixture, body, 'c7-order-1');
    expect(notAccepted.status).toBe(409);
    expect(await json(notAccepted)).toMatchObject({
      code: 'OFFER_NOT_ACCEPTED',
    });
    await command({
      path: '/company-offer-approver-assignments',
      key: 'c7-order-approver',
      body: {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
    });
    const offerBase =
      '/offers/opportunities/' +
      fixture.opportunityId +
      '/versions/' +
      offerVersionId;
    for (const [step, payload] of [
      ['approve', { expectedOfferRevision: 1, acknowledgedWarningCodes: [] }],
      [
        'transmission',
        { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
      ],
      [
        'client-response',
        {
          expectedOfferRevision: 3,
          outcome: 'ACCEPTED',
          receivedAt: instant.toISOString(),
        },
      ],
    ] as const)
      await command({
        path: offerBase + '/' + step,
        companyId: fixture.companyId,
        key: 'c7-order-' + step,
        body: payload,
      });
    const after = await sendContract(fixture, body, 'c7-order-2');
    expect(after.status).toBe(409);
    expect(await json(after)).toMatchObject({
      code: 'PRECONTRACT_AFTER_CONTRACT',
    });
    const main = await sendContract(
      fixture,
      { acceptedOfferVersionId: offerVersionId },
      'c7-order-main',
    );
    expect(main.status).toBe(409);
    expect(await json(main)).toMatchObject({ code: 'CONTRACT_ALREADY_EXISTS' });
    const counts = await agreementCounts();
    expect(counts).toMatchObject({ contracts: '1', counters: '1' });
    // A second Precontract is refused by its own kind before the Contract rule.
    const second = await acceptedOffer({ suffix: 'c7-second' });
    await grantContract(second, 'c7-second-grant');
    const secondBody = {
      ...(await contractPayload(second)),
      ...precontractFields(),
    };
    expect((await sendContract(second, secondBody, 'c7-second-1')).status).toBe(
      201,
    );
    const mainAfter = await sendContract(
      second,
      await contractPayload(second),
      'c7-second-main',
    );
    expect(mainAfter.status).toBe(201);
    const duplicate = await sendContract(second, secondBody, 'c7-second-2');
    expect(duplicate.status).toBe(409);
    expect(await json(duplicate)).toMatchObject({
      code: 'CONTRACT_ALREADY_EXISTS',
    });
  });
  it.each(['precontract', 'contract', 'duplicate'] as const)(
    'C7 serializes racing %s-first creations on one Opportunity at the Request boundary',
    async (winner) => {
      const target = await precontractFixture({ create: false });
      const { fixture, source } = target;
      const precontract = (key: string) =>
        sendContract(fixture, { ...source, ...precontractFields() }, key);
      const main = () => sendContract(fixture, source, 'c7-race-main');
      const blocker = await pool.connect();
      let first: Promise<Response> | undefined,
        second: Promise<Response> | undefined;
      try {
        await blocker.query('BEGIN');
        const pid = (
          await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0]?.pid;
        if (pid === undefined) throw new Error('Missing blocker');
        await blocker.query(
          'SELECT id FROM client_requests WHERE id=$1 FOR UPDATE',
          [fixture.requestId],
        );
        first = winner === 'contract' ? main() : precontract('c7-race-pre');
        const firstPid = await waitForBlocker(pid);
        second =
          winner === 'precontract'
            ? main()
            : precontract(
                winner === 'duplicate' ? 'c7-race-duplicate' : 'c7-race-pre',
              );
        await waitForBlocker(firstPid, pid);
        await blocker.query('COMMIT');
        const firstResponse = await first;
        const secondResponse = await second;
        expect(firstResponse.status).toBe(201);
        if (winner === 'precontract') {
          expect(secondResponse.status).toBe(201);
          expect(record(await json(secondResponse)).precontract).toMatchObject({
            id: record(await json(firstResponse)).id,
          });
        } else {
          expect(secondResponse.status).toBe(409);
          expect(await json(secondResponse)).toMatchObject({
            code:
              winner === 'contract'
                ? 'PRECONTRACT_AFTER_CONTRACT'
                : 'CONTRACT_ALREADY_EXISTS',
          });
        }
        expect(await agreementCounts()).toMatchObject({
          contracts: winner === 'precontract' ? '2' : '1',
          events: winner === 'precontract' ? '4' : '2',
        });
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        await Promise.allSettled(
          [first, second].filter((item) => item !== undefined),
        );
      }
    },
  );
  it('C7 replays exact Precontract creation, conflicts changed payloads and denies replay after permission loss', async () => {
    const target = await precontractFixture({ create: false });
    const { fixture, source } = target;
    const body = { ...source, ...precontractFields() };
    const created = await sendContract(fixture, body, 'c7-replay');
    expect(created.status).toBe(201);
    const view = await json(created);
    const replay = await sendContract(fixture, body, 'c7-replay');
    expect(replay.status).toBe(201);
    expect(await json(replay)).toEqual(view);
    const changed = await sendContract(
      fixture,
      { ...body, preliminaryLimits: 'Changed limit' },
      'c7-replay',
    );
    expect(changed.status).toBe(409);
    expect(await json(changed)).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const asContract = await sendContract(fixture, source, 'c7-replay');
    expect(asContract.status).toBe(409);
    expect(await agreementCounts()).toMatchObject({
      contracts: '1',
      receipts: '1',
      events: '2',
    });
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
            headers: { 'idempotency-key': 'c7-revoke' },
          },
        })
      ).status,
    ).toBe(200);
    expect((await sendContract(fixture, body, 'c7-replay')).status).toBe(403);
  });
  it('C7 applies creation refusals for missing Client or Offer read and foreign Companies without writes', async () => {
    const target = await precontractFixture({ create: false });
    const { fixture } = target;
    const body = { ...target.source, ...precontractFields() };
    const foreign = await preparedOffer('c7-foreign');
    await grantContract(foreign, 'c7-foreign-grant');
    const crossCompany = await request({
      path: '/contracts/opportunities/' + fixture.opportunityId,
      companyId: foreign.companyId,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'c7-foreign',
        },
        body: JSON.stringify(body),
      },
    });
    expect(crossCompany.status).toBe(404);
    // Offer read comes from both Offer bundles; Client read from the director bundle.
    for (const bundles of [
      ['company-director-client'],
      ['company-offer-preparer', 'company-offer-approver'],
    ]) {
      for (const bundle of bundles)
        expect(
          (
            await request({
              path:
                '/' +
                bundle +
                '-assignments/' +
                fixture.actorMembershipId +
                '/' +
                fixture.companyId,
              init: {
                method: 'DELETE',
                headers: { 'idempotency-key': 'c7-revoke-' + bundle },
              },
            })
          ).status,
        ).toBe(200);
      const refused = await sendContract(
        fixture,
        body,
        'c7-no-' + bundles.join('-'),
      );
      expect(refused.status, bundles.join()).toBe(403);
      for (const bundle of bundles)
        await command({
          path: '/' + bundle + '-assignments',
          body: {
            workspaceMembershipId: fixture.actorMembershipId,
            companyId: fixture.companyId,
          },
          key: 'c7-regrant-' + bundle,
        });
    }
    expect(await agreementCounts()).toEqual({
      contracts: '0',
      versions: '0',
      receipts: '0',
      events: '0',
      counters: '0',
    });
  });
  it('C7 rolls back every Precontract write when its event fails and retries with reference 1', async () => {
    const target = await precontractFixture({ create: false });
    const body = { ...target.source, ...precontractFields() };
    await pool.query(
      "CREATE FUNCTION fail_c7_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic event failure'; END; $$; CREATE TRIGGER fail_c7_event BEFORE INSERT ON contract_events FOR EACH ROW EXECUTE FUNCTION fail_c7_event()",
    );
    try {
      const failed = await sendContract(target.fixture, body, 'c7-rollback');
      expect(failed.status).toBe(500);
      expect(await json(failed)).toMatchObject({
        code: 'CONTRACT_CREATION_UNCERTAIN',
      });
      expect(await agreementCounts()).toEqual({
        contracts: '0',
        versions: '0',
        receipts: '0',
        events: '0',
        counters: '0',
      });
    } finally {
      await pool.query(
        'DROP TRIGGER fail_c7_event ON contract_events; DROP FUNCTION fail_c7_event()',
      );
    }
    const retried = await sendContract(target.fixture, body, 'c7-rollback');
    expect(retried.status).toBe(201);
    expect(record(await json(retried))).toMatchObject({
      kind: 'PRECONTRACT',
      illustrativeReference: 1,
    });
    expect(await agreementCounts()).toEqual({
      contracts: '1',
      versions: '1',
      receipts: '1',
      events: '2',
      counters: '1',
    });
  });
  it('C7 database guards admit only valid Precontract states and Contract references', async () => {
    const target = await precontractFixture();
    const { fixture, versionId } = target;
    const run = record(
      await command({
        path: target.agreement + '/versions/' + versionId + '/quality-checks',
        companyId: fixture.companyId,
        key: 'c7-guard-check',
        body: {},
      }),
    );
    if (!Array.isArray(run.results)) throw new Error('Missing results');
    const falsePass = run.results
      .map(record)
      .map((item) =>
        item.code === 'ADDED_CONDITIONS_CONFIRMED'
          ? { code: item.code, status: 'PASS' }
          : item,
      );
    await expect(
      pool.query(
        `INSERT INTO contract_quality_runs(workspace_id,company_id,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,evaluated_at,results) SELECT workspace_id,company_id,contract_id,id,created_by_internal_user_id,created_by_workspace_membership_id,created_at,$2::jsonb FROM contract_versions WHERE id=$1`,
        [versionId, JSON.stringify(falsePass)],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const insertAgreement = (columns: string) =>
      pool.query(
        `INSERT INTO contracts(workspace_id,company_id,opportunity_id,client_request_id,original_client_account_id,kind,origin,source_offer_id,source_offer_version_id,direct_reason,precontract_id,illustrative_reference,created_by_internal_user_id,created_by_workspace_membership_id,created_at) SELECT workspace_id,company_id,opportunity_id,client_request_id,original_client_account_id,${columns},99,created_by_internal_user_id,created_by_workspace_membership_id,created_at FROM contracts WHERE id=$1`,
        [target.created.id],
      );
    for (const columns of [
      "'PRECONTRACT','DIRECT',NULL,NULL,'Direct Precontract',NULL",
      "'PRECONTRACT','ACCEPTED_OFFER',source_offer_id,source_offer_version_id,NULL,NULL",
      "'CONTRACT','ACCEPTED_OFFER',source_offer_id,source_offer_version_id,NULL,NULL",
      "'ADDENDUM',NULL,NULL,NULL,NULL,id",
    ])
      await expect(insertAgreement(columns)).rejects.toMatchObject({
        code: expect.stringMatching(/^23/u),
      });
    await expect(
      pool.query(
        "UPDATE contract_reference_counters SET kind='RENEWAL' WHERE kind='PRECONTRACT'",
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        'INSERT INTO contract_versions(workspace_id,company_id,contract_id,opportunity_id,version_number,created_contract_revision,predecessor_version_id,pricing_snapshot_id,recipient_client_account_id,recipient_kind,recipient_legal_name,recipient_tax_id,recipient_legal_address,issuing_company_label,scope_note,commercial_conditions,term_ends_on,created_by_internal_user_id,created_by_workspace_membership_id,created_at) SELECT workspace_id,company_id,contract_id,opportunity_id,2,2,id,pricing_snapshot_id,recipient_client_account_id,recipient_kind,recipient_legal_name,recipient_tax_id,recipient_legal_address,issuing_company_label,scope_note,commercial_conditions,term_ends_on,created_by_internal_user_id,created_by_workspace_membership_id,created_at FROM contract_versions WHERE id=$1',
        [versionId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    expect(await agreementCounts()).toMatchObject({
      contracts: '1',
      versions: '1',
    });
    await command({
      path: target.base,
      companyId: fixture.companyId,
      key: 'c7-guard-main',
      body: target.source,
    });
    await expect(
      pool.query(
        "UPDATE contracts SET precontract_id=NULL WHERE kind='CONTRACT'",
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('DELETE FROM contracts WHERE id=$1', [target.created.id]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      insertAgreement(
        "'PRECONTRACT','ACCEPTED_OFFER',source_offer_id,source_offer_version_id,NULL,NULL",
      ),
    ).rejects.toMatchObject({
      code: '23514',
      message: 'Precontract after Contract',
    });
  });
  it('C7 runs the term-end warning exactly at the UTC date boundary', async () => {
    instant = new Date('2026-12-31T23:59:59.999Z');
    const target = await precontractFixture();
    const { fixture, agreement, versionId } = target;
    const check = async (key: string) => {
      const results = record(
        await command({
          path: agreement + '/versions/' + versionId + '/quality-checks',
          companyId: fixture.companyId,
          key,
          body: {},
        }),
      ).results;
      if (!Array.isArray(results)) throw new Error('Missing results');
      return results.find(
        (item) => record(item).code === 'TERM_END_NOT_PASSED',
      );
    };
    expect(await check('c7-before-boundary')).toEqual({
      code: 'TERM_END_NOT_PASSED',
      status: 'PASS',
    });
    instant = new Date('2027-01-01T00:00:00.000Z');
    expect(await check('c7-after-boundary')).toEqual({
      code: 'TERM_END_NOT_PASSED',
      status: 'WARNING',
    });
  });
  it('replays a committed Direct Contract after Client union wins its pending reference lock', async () => {
    const fixture = await preparedOffer('-replay768');
    await grantContract(fixture, 'reference-replay768-contract-grant');
    const base = '/contracts/opportunities/' + fixture.opportunityId;
    const path = base + '/direct';
    const key = 'reference-replay768-direct';
    const payload = {
      recipient: { kind: 'PRIMARY' },
      pricingSnapshotId: fixture.snapshotId,
      directReason: 'Synthetic retained direct evidence768',
      scopeNote: 'Exact copied scope768',
    };
    const replay = () =>
      request({
        path,
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
    const first = await replay();
    expect(first.status).toBe(201);
    const created = record(await json(first));
    const second = entity(
      await command({
        path: '/clients',
        companyId: fixture.companyId,
        key: 'reference-replay768-second-client',
        body: { displayName: 'Synthetic canonical Client768' },
      }),
    );
    // Only the legacy duplicate fixture bypasses current duplicate admission.
    // The union and the retained Contract retry below remain public commands.
    await pool.query(
      'UPDATE client_accounts SET tax_id=(SELECT tax_id FROM client_accounts WHERE id=$1) WHERE id=$2',
      [fixture.clientId, second.id],
    );
    const unionHeaders = memberHeaders('contract-reader');
    const invited = await request({
      path: '/access/current-actor',
      init: { headers: unionHeaders },
    });
    expect(invited.status).toBe(200);
    const membershipId = stringField(
      record(await json(invited)),
      'workspaceMembershipId',
    );
    for (const assignment of [
      '/company-context-assignments',
      '/company-director-client-assignments',
    ])
      await command({
        path: assignment,
        key: 'reference-replay768-grant-' + assignment,
        body: {
          workspaceMembershipId: membershipId,
          companyId: fixture.companyId,
        },
      });
    // A distinct resolver reaches the Client identity fence rather than waiting
    // on the Contract actor's synchronized Internal User profile.
    const reviewResponse = await request({
      path: '/clients/' + fixture.clientId + '/union-reviews',
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          ...unionHeaders,
          'content-type': 'application/json',
          'idempotency-key': 'reference-replay768-review',
        },
        body: JSON.stringify({}),
      },
    });
    expect(reviewResponse.status).toBe(201);
    const review = record(await json(reviewResponse));
    expect(review.outcome).toBe('comparison');
    const beforeCounts = await agreementCounts();
    const beforeReceipts = await pool.query<Record<string, unknown>>(
      'SELECT to_jsonb(receipt) AS value FROM contract_commands receipt ORDER BY idempotency_key',
    );
    const beforeVersions = await pool.query<{ id: string; version: number }>(
      'SELECT id,version FROM client_accounts WHERE id=ANY($1::uuid[]) ORDER BY id',
      [[fixture.clientId, second.id]],
    );
    const blocker = await pool.connect();
    let united: Promise<Response> | undefined;
    let pending: Promise<Response> | undefined;
    try {
      await blocker.query('BEGIN');
      const backend = await blocker.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      const blockerPid = backend.rows[0]?.pid;
      if (blockerPid === undefined)
        throw new Error('The synthetic Client blocker is unavailable.');
      await blocker.query(
        'SELECT id FROM client_accounts WHERE id=$1 FOR UPDATE',
        [fixture.clientId],
      );
      united = request({
        path:
          '/client-union-reviews/' +
          stringField(review, 'reviewReference') +
          '/confirm',
        companyId: fixture.companyId,
        init: {
          method: 'POST',
          headers: {
            ...unionHeaders,
            'content-type': 'application/json',
            'idempotency-key': 'reference-replay768-union',
          },
          body: JSON.stringify({
            canonicalClientId: second.id,
            fields: {
              displayName: second.id,
              taxId: second.id,
              address: second.id,
              telephone: second.id,
              generalEmail: second.id,
              businessActivity: second.id,
            },
            companyIds: [fixture.companyId],
            reviewedDifferences: true,
            reason: 'Synthetic original preserved while its retry waits768.',
          }),
        },
      });
      const unionPid = await waitForBlocker(blockerPid);
      pending = replay();
      const retryPid = await waitForBlocker(blockerPid, unionPid);
      expect(retryPid).not.toBe(unionPid);
      expect(
        (
          await pool.query<{ query: string }>(
            'SELECT query FROM pg_stat_activity WHERE pid=$1',
            [retryPid],
          )
        ).rows,
      ).toMatchObject([
        { query: expect.stringContaining('"client_accounts"') },
      ]);
      await blocker.query('COMMIT');
      const [unionResponse, waitingReplay] = await Promise.all([
        united,
        pending,
      ]);
      expect(unionResponse.status).toBe(201);
      const currentResponse = await request({
        path: base,
        companyId: fixture.companyId,
      });
      expect(currentResponse.status).toBe(200);
      const current = record(record(await json(currentResponse)).contract);
      expect(current).toMatchObject({
        id: created.id,
        originalClientAccountId: fixture.clientId,
        clientReference: {
          originalClientId: fixture.clientId,
          currentClientId: second.id,
        },
      });
      const unchangedRetry = await replay();
      expect(unchangedRetry.status).toBe(201);
      const settledReplay = record(await json(unchangedRetry));
      expect(settledReplay).toEqual({
        ...created,
        clientReference: current.clientReference,
      });
      expect(settledReplay.version).toEqual(created.version);
      expect(await agreementCounts()).toEqual(beforeCounts);
      expect(
        (
          await pool.query<Record<string, unknown>>(
            'SELECT to_jsonb(receipt) AS value FROM contract_commands receipt ORDER BY idempotency_key',
          )
        ).rows,
      ).toEqual(beforeReceipts.rows);
      expect(
        (
          await pool.query<{ id: string; version: number }>(
            'SELECT id,version FROM client_accounts WHERE id=ANY($1::uuid[]) ORDER BY id',
            [[fixture.clientId, second.id]],
          )
        ).rows,
      ).toEqual(
        beforeVersions.rows.map(({ id, version }) => ({
          id,
          version: version + 1,
        })),
      );
      // A false first denial is not excused by the successful unchanged retry.
      // Keep this after the diagnostics so RED proves retained live readability.
      expect(waitingReplay.status).toBe(201);
      expect(await json(waitingReplay)).toEqual(settledReplay);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await Promise.allSettled([
        ...(united ? [united] : []),
        ...(pending ? [pending] : []),
      ]);
    }
  }, 30000);

  it('replays a committed Direct Contract before Client union waiting on its held identity', async () => {
    const fixture = await preparedOffer('-before768');
    await grantContract(fixture, 'reference-before768-contract-grant');
    const base = '/contracts/opportunities/' + fixture.opportunityId;
    const path = base + '/direct';
    const key = 'reference-before768-direct';
    const payload = {
      recipient: { kind: 'PRIMARY' },
      pricingSnapshotId: fixture.snapshotId,
      directReason: 'Synthetic retained direct evidence768',
      scopeNote: 'Exact copied scope768',
    };
    const replay = () =>
      request({
        path,
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
    const first = await replay();
    expect(first.status).toBe(201);
    const created = record(await json(first));
    const second = entity(
      await command({
        path: '/clients',
        companyId: fixture.companyId,
        key: 'reference-before768-second-client',
        body: { displayName: 'Synthetic canonical Client768' },
      }),
    );
    // Only the legacy duplicate fixture bypasses current duplicate admission.
    // The union and the retained Contract retry below remain public commands.
    await pool.query(
      'UPDATE client_accounts SET tax_id=(SELECT tax_id FROM client_accounts WHERE id=$1) WHERE id=$2',
      [fixture.clientId, second.id],
    );
    const unionHeaders = memberHeaders('contract-reader');
    const invited = await request({
      path: '/access/current-actor',
      init: { headers: unionHeaders },
    });
    expect(invited.status).toBe(200);
    const membershipId = stringField(
      record(await json(invited)),
      'workspaceMembershipId',
    );
    for (const assignment of [
      '/company-context-assignments',
      '/company-director-client-assignments',
    ])
      await command({
        path: assignment,
        key: 'reference-before768-grant-' + assignment,
        body: {
          workspaceMembershipId: membershipId,
          companyId: fixture.companyId,
        },
      });
    // A distinct resolver reaches the Client identity fence rather than waiting
    // on the Contract actor's synchronized Internal User profile.
    const reviewResponse = await request({
      path: '/clients/' + fixture.clientId + '/union-reviews',
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          ...unionHeaders,
          'content-type': 'application/json',
          'idempotency-key': 'reference-before768-review',
        },
        body: JSON.stringify({}),
      },
    });
    expect(reviewResponse.status).toBe(201);
    const review = record(await json(reviewResponse));
    expect(review.outcome).toBe('comparison');
    const beforeCounts = await agreementCounts();
    const beforeReceipts = await pool.query<Record<string, unknown>>(
      'SELECT to_jsonb(receipt) AS value FROM contract_commands receipt ORDER BY idempotency_key',
    );
    const beforeVersions = await pool.query<{ id: string; version: number }>(
      'SELECT id,version FROM client_accounts WHERE id=ANY($1::uuid[]) ORDER BY id',
      [[fixture.clientId, second.id]],
    );
    const blocker = await pool.connect();
    let united: Promise<Response> | undefined;
    let pending: Promise<Response> | undefined;
    try {
      await blocker.query('BEGIN');
      const backend = await blocker.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      const blockerPid = backend.rows[0]?.pid;
      if (blockerPid === undefined)
        throw new Error('The synthetic Client blocker is unavailable.');
      await blocker.query(
        'SELECT id FROM client_company_relationships WHERE client_account_id=$1 AND company_id=$2 FOR UPDATE',
        [fixture.clientId, fixture.companyId],
      );
      // The replay owns its original Client identity before it waits here.
      // Union must queue behind that identity, never overtake the replay.
      pending = replay();
      const retryPid = await waitForBlocker(blockerPid);
      expect(
        (
          await pool.query<{ query: string }>(
            'SELECT query FROM pg_stat_activity WHERE pid=$1',
            [retryPid],
          )
        ).rows,
      ).toMatchObject([
        { query: expect.stringContaining('"client_company_relationships"') },
      ]);
      united = request({
        path:
          '/client-union-reviews/' +
          stringField(review, 'reviewReference') +
          '/confirm',
        companyId: fixture.companyId,
        init: {
          method: 'POST',
          headers: {
            ...unionHeaders,
            'content-type': 'application/json',
            'idempotency-key': 'reference-before768-union',
          },
          body: JSON.stringify({
            canonicalClientId: second.id,
            fields: {
              displayName: second.id,
              taxId: second.id,
              address: second.id,
              telephone: second.id,
              generalEmail: second.id,
              businessActivity: second.id,
            },
            companyIds: [fixture.companyId],
            reviewedDifferences: true,
            reason: 'Synthetic original preserved while its retry waits768.',
          }),
        },
      });
      const unionPid = await waitForBlocker(retryPid);
      expect(unionPid).not.toBe(retryPid);
      expect(
        (
          await pool.query<{ query: string }>(
            'SELECT query FROM pg_stat_activity WHERE pid=$1',
            [unionPid],
          )
        ).rows,
      ).toMatchObject([
        { query: expect.stringContaining('"client_accounts"') },
      ]);
      await blocker.query('COMMIT');
      const [unionResponse, waitingReplay] = await Promise.all([
        united,
        pending,
      ]);
      expect(waitingReplay.status).toBe(201);
      expect(await json(waitingReplay)).toEqual(created);
      // The union's reviewed Client versions stay valid: replay adds no fence.
      expect(unionResponse.status).toBe(201);
      const currentResponse = await request({
        path: base,
        companyId: fixture.companyId,
      });
      expect(currentResponse.status).toBe(200);
      const current = record(record(await json(currentResponse)).contract);
      expect(current).toMatchObject({
        id: created.id,
        originalClientAccountId: fixture.clientId,
        clientReference: {
          originalClientId: fixture.clientId,
          currentClientId: second.id,
        },
      });
      const unchangedRetry = await replay();
      expect(unchangedRetry.status).toBe(201);
      const settledReplay = record(await json(unchangedRetry));
      expect(settledReplay).toEqual({
        ...created,
        clientReference: current.clientReference,
      });
      expect(settledReplay.version).toEqual(created.version);
      expect(await agreementCounts()).toEqual(beforeCounts);
      expect(
        (
          await pool.query<Record<string, unknown>>(
            'SELECT to_jsonb(receipt) AS value FROM contract_commands receipt ORDER BY idempotency_key',
          )
        ).rows,
      ).toEqual(beforeReceipts.rows);
      expect(
        (
          await pool.query<{ id: string; version: number }>(
            'SELECT id,version FROM client_accounts WHERE id=ANY($1::uuid[]) ORDER BY id',
            [[fixture.clientId, second.id]],
          )
        ).rows,
      ).toEqual(
        beforeVersions.rows.map(({ id, version }) => ({
          id,
          version: version + 1,
        })),
      );
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await Promise.allSettled([
        ...(united ? [united] : []),
        ...(pending ? [pending] : []),
      ]);
    }
  }, 30000);

  it('C9 creates and reloads DIRECT without Offer read and requires direct review at approval', async () => {
    const fixture = await preparedOffer();
    await grantContract(fixture, 'c9-prepare');
    await grantApprover(fixture);
    expect(
      (
        await request({
          path:
            '/company-offer-preparer-assignments/' +
            fixture.actorMembershipId +
            '/' +
            fixture.companyId,
          init: {
            method: 'DELETE',
            headers: { 'idempotency-key': 'c9-no-offer' },
          },
        })
      ).status,
    ).toBe(200);
    const base = '/contracts/opportunities/' + fixture.opportunityId;
    const body = {
      recipient: { kind: 'PRIMARY' },
      pricingSnapshotId: fixture.snapshotId,
      directReason: ' Internal exception ',
      scopeNote: ' Exact direct scope ',
      commercialConditions: ' Exact conditions ',
    };
    const created = record(
      await command({
        path: base + '/direct',
        companyId: fixture.companyId,
        key: 'c9-create',
        body,
      }),
    );
    expect(created).toMatchObject({
      kind: 'CONTRACT',
      origin: 'DIRECT',
      directReason: body.directReason,
      sourceOfferId: null,
      sourceOfferVersionId: null,
      version: {
        scopeNote: body.scopeNote,
        commercialConditions: body.commercialConditions,
        pricingSnapshotId: fixture.snapshotId,
      },
    });
    const loaded = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    expect(loaded).toEqual(created);
    const versionId = stringField(record(created.version), 'id');
    const run = record(
      await command({
        path: base + '/versions/' + versionId + '/quality-checks',
        companyId: fixture.companyId,
        key: 'c9-check',
        body: {},
      }),
    );
    expect(run.results).toContainEqual({
      code: 'DIRECT_ORIGIN_REVIEWED',
      status: 'WARNING',
    });
    const refused = await decisionRequest(
      fixture,
      versionId,
      'approve',
      { expectedContractRevision: 1, acknowledgedWarningCodes: [] },
      'c9-refused',
    );
    expect(refused.status).toBe(409);
    expect(await json(refused)).toMatchObject({
      code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED',
    });
    expect(
      (
        await decisionRequest(
          fixture,
          versionId,
          'approve',
          {
            expectedContractRevision: 1,
            acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'],
          },
          'c9-approved',
        )
      ).status,
    ).toBe(201);
  });
  it('C9 revises entered direct content and Snapshot after approval while conserving predecessor and reason', async () => {
    const fixture = await preparedOffer();
    await grantContract(fixture, 'c9-revision-prepare');
    await grantApprover(fixture);
    const base = '/contracts/opportunities/' + fixture.opportunityId;
    const created = record(
      await command({
        path: base + '/direct',
        companyId: fixture.companyId,
        key: 'c9-revision-create',
        body: {
          recipient: { kind: 'PRIMARY' },
          pricingSnapshotId: fixture.snapshotId,
          directReason: 'Immutable internal exception',
          scopeNote: 'Original scope',
        },
      }),
    );
    const oldVersion = record(created.version),
      oldId = stringField(oldVersion, 'id');
    expect(
      (
        await decisionRequest(
          fixture,
          oldId,
          'approve',
          {
            expectedContractRevision: 1,
            acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'],
          },
          'c9-revision-approve',
        )
      ).status,
    ).toBe(201);
    const snapshot = identifiedRecord(
      await command({
        path: '/pricing/opportunities/' + fixture.opportunityId + '/snapshots',
        companyId: fixture.companyId,
        key: 'c9-new-price',
        body: {
          pricingRuleVersionNumber: fixture.ruleVersionNumber,
          lines: [
            {
              offeringId: fixture.offeringId,
              tariffVersionNumber: fixture.tariffVersionNumber,
              quantity: '2',
            },
          ],
        },
      }),
    );
    const body = {
      expectedContractRevision: 2,
      pricingSnapshotId: snapshot.id,
      scopeNote: ' Revised exact scope ',
      commercialConditions: ' New conditions ',
      termEndsOn: '2026-12-31',
      specialConditions: 'New terms',
    };
    const revised = record(
      await command({
        path: base + '/versions',
        companyId: fixture.companyId,
        key: 'c9-revision',
        body,
      }),
    );
    const versionId = stringField(revised, 'contractVersionId');
    const loaded = record(
        record(
          await json(
            await request({ path: base, companyId: fixture.companyId }),
          ),
        ).contract,
      ),
      version = record(loaded.version);
    expect(loaded.directReason).toBe('Immutable internal exception');
    expect(version).toMatchObject({
      versionNumber: 2,
      decisionState: 'PENDING',
      scopeNote: body.scopeNote,
      commercialConditions: body.commercialConditions,
      pricingSnapshotId: snapshot.id,
    });
    expect(version.differences).toEqual(
      expect.arrayContaining([
        { field: 'scopeNote', before: 'Original scope', after: body.scopeNote },
        {
          field: 'commercialConditions',
          before: null,
          after: body.commercialConditions,
        },
        expect.objectContaining({
          field: 'pricingSnapshotId',
          before: fixture.snapshotId,
          after: snapshot.id,
          afterSnapshot: expect.objectContaining({
            currency: 'EUR',
            total: '690.00',
          }),
        }),
      ]),
    );
    const previous = record(
      record(
        record(
          await json(
            await request({
              path: base + '/versions/' + oldId,
              companyId: fixture.companyId,
            }),
          ),
        ).contract,
      ).version,
    );
    expect(previous.representation).toEqual(oldVersion.representation);
    expect(record(version.representation).html).not.toContain(
      'Immutable internal exception',
    );
    expect(
      (
        await decisionRequest(
          fixture,
          oldId,
          'reject',
          { expectedContractRevision: 3, reason: 'Old version' },
          'c9-old-refusal',
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await decisionRequest(
          fixture,
          versionId,
          'approve',
          {
            expectedContractRevision: 3,
            acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'],
          },
          'c9-new-approval',
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          { ...signaturePayload(), expectedContractRevision: 4 },
          'c9-new-signature',
        )
      ).status,
    ).toBe(201);
    expect(
      await command({
        path: base + '/versions',
        companyId: fixture.companyId,
        key: 'c9-revision',
        body,
      }),
    ).toEqual(revised);
    const retry = await command({
      path: base + '/direct',
      companyId: fixture.companyId,
      key: 'c9-revision-create',
      body: {
        recipient: { kind: 'PRIMARY' },
        pricingSnapshotId: fixture.snapshotId,
        directReason: 'Immutable internal exception',
        scopeNote: 'Original scope',
      },
    });
    expect(record(record(retry).version).id).toBe(oldId);
  });
  it('C9 replays original receipts after later state changes only while authority and the recorded party stay readable', async () => {
    const fixture = await preparedOffer();
    await grantContract(fixture, 'c9-receipts-grant');
    const path = '/contracts/opportunities/' + fixture.opportunityId,
      body = {
        recipient: { kind: 'PRIMARY' },
        pricingSnapshotId: fixture.snapshotId,
        directReason: 'Internal receipt',
        scopeNote: 'Initial scope',
      };
    const created = record(
      await command({
        path: path + '/direct',
        companyId: fixture.companyId,
        key: 'c9-receipt-create',
        body,
      }),
    );
    const revisedBody = {
      expectedContractRevision: 1,
      pricingSnapshotId: fixture.snapshotId,
      scopeNote: 'Second scope',
    };
    const revised = await command({
      path: path + '/versions',
      companyId: fixture.companyId,
      key: 'c9-receipt-revise',
      body: revisedBody,
    });
    const before = await c6Counts();
    expect(
      record(
        record(
          await command({
            path: path + '/direct',
            companyId: fixture.companyId,
            key: 'c9-receipt-create',
            body,
          }),
        ).version,
      ).id,
    ).toBe(record(created.version).id);
    expect(
      await command({
        path: path + '/versions',
        companyId: fixture.companyId,
        key: 'c9-receipt-revise',
        body: revisedBody,
      }),
    ).toEqual(revised);
    const send = (route: string, payload: unknown, key: string) =>
      request({
        path: path + route,
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
    const changed = await send(
      '/versions',
      { ...revisedBody, scopeNote: '' },
      'c9-receipt-revise',
    );
    expect(changed.status).toBe(409);
    expect(await json(changed)).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await pool.query(
      "UPDATE client_accounts SET status='archived' WHERE id=$1",
      [fixture.clientId],
    );
    expect((await send('/direct', body, 'c9-receipt-create')).status).toBe(404);
    expect(
      (await send('/versions', revisedBody, 'c9-receipt-revise')).status,
    ).toBe(404);
    expect(
      (
        await send(
          '/versions',
          { ...revisedBody, expectedContractRevision: 2 },
          'c9-receipt-fresh',
        )
      ).status,
    ).toBe(404);
    expect(await c6Counts()).toEqual(before);
    await pool.query("UPDATE client_accounts SET status='active' WHERE id=$1", [
      fixture.clientId,
    ]);
    for (const route of ['company-pricing-user', 'company-offer-preparer'])
      await request({
        path:
          '/' +
          route +
          '-assignments/' +
          fixture.actorMembershipId +
          '/' +
          fixture.companyId,
        init: {
          method: 'DELETE',
          headers: { 'idempotency-key': 'c9-receipt-revoke-' + route },
        },
      });
    expect((await send('/direct', body, 'c9-receipt-create')).status).toBe(403);
    expect(
      (await send('/versions', revisedBody, 'c9-receipt-revise')).status,
    ).toBe(403);
    expect(await c6Counts()).toEqual(before);
  });
  it('SO-2 refuses a new direct Contract on a closed Opportunity, accepts ON_HOLD and WON, and replays a creation committed before the closure', async () => {
    const fixture = await preparedOffer();
    const won = await preparedOffer('-won');
    for (const target of [fixture, won]) {
      await grantContract(target, 'so2-contract-' + target.companyId);
      await command({
        path: '/company-opportunity-manager-assignments',
        body: {
          workspaceMembershipId: target.actorMembershipId,
          companyId: target.companyId,
        },
        key: 'so2-manager-' + target.companyId,
      });
    }
    const versions = new Map<string, number>();
    async function changeOutcome(
      target: PreparedOffer,
      change: Record<string, unknown>,
    ) {
      const expectedVersion = versions.get(target.opportunityId) ?? 1;
      const response = await request({
        path:
          '/commercial-intake/opportunities/' +
          target.opportunityId +
          '/outcome',
        companyId: target.companyId,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key':
              'so2-outcome-' + target.opportunityId + expectedVersion,
          },
          body: JSON.stringify({ expectedVersion, ...change }),
        },
      });
      expect(response.status).toBe(200);
      versions.set(target.opportunityId, expectedVersion + 1);
    }
    const body = {
      recipient: { kind: 'PRIMARY' },
      pricingSnapshotId: fixture.snapshotId,
      directReason: 'Governed direct exception',
      scopeNote: 'Direct scope',
    };
    const send = (target: PreparedOffer, key: string, payload: unknown) =>
      request({
        path: '/contracts/opportunities/' + target.opportunityId + '/direct',
        companyId: target.companyId,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': key,
          },
          body: JSON.stringify(payload),
        },
      });

    // A held Opportunity accepts the creation; a won one does too.
    await changeOutcome(fixture, {
      status: 'ON_HOLD',
      reason: 'Client asked to wait',
    });
    const created = record(
      await command({
        path: '/contracts/opportunities/' + fixture.opportunityId + '/direct',
        companyId: fixture.companyId,
        key: 'so2-created',
        body,
      }),
    );
    await changeOutcome(won, { status: 'WON' });
    expect(
      (
        await send(won, 'so2-won', {
          ...body,
          pricingSnapshotId: won.snapshotId,
        })
      ).status,
    ).toBe(201);

    await changeOutcome(fixture, {
      status: 'LOST',
      lossReasonCode: 'COMPETITOR',
    });
    const counts = await c6Counts();
    // The exact replay of the creation committed before the closure returns
    // its receipt; only a new creation is refused.
    const replay = await send(fixture, 'so2-created', body);
    expect(replay.status).toBe(201);
    expect(record(record(await json(replay)).version).id).toBe(
      record(created.version).id,
    );
    for (const [close, reopen] of [
      [
        { status: 'LOST', lossReasonCode: 'COMPETITOR' },
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
      if (close.status !== 'LOST') await changeOutcome(fixture, close);
      const refused = await send(
        fixture,
        'so2-new-' + String(close.status),
        body,
      );
      expect(refused.status).toBe(409);
      expect(await json(refused)).toMatchObject({ code: 'OPPORTUNITY_CLOSED' });
      expect(await c6Counts()).toEqual(counts);
      await changeOutcome(fixture, reopen);
    }
    // Open again, a new creation reaches the existing-Contract rule instead.
    const existing = await send(fixture, 'so2-new-open', body);
    expect(existing.status).toBe(409);
    expect(await json(existing)).toMatchObject({
      code: 'CONTRACT_ALREADY_EXISTS',
    });

    // The closed status decides before the Client prerequisite.
    const clientless = record(
      await command({
        path: '/commercial-intake/requests',
        companyId: fixture.companyId,
        key: 'so2-clientless-request',
        body: {
          originalText: 'Synthetic Request without a Client',
          subject: 'No Client',
          opportunity: { title: 'No Client', nextAction: 'Prepare' },
        },
      }),
    );
    const closedWithoutClient = {
      ...fixture,
      opportunityId: stringField(record(clientless.initialOpportunity), 'id'),
    };
    await changeOutcome(closedWithoutClient, {
      status: 'ARCHIVED',
      reason: 'Duplicate Request',
    });
    const refusedClientless = await send(
      closedWithoutClient,
      'so2-clientless-closed',
      body,
    );
    expect(refusedClientless.status).toBe(409);
    expect(await json(refusedClientless)).toMatchObject({
      code: 'OPPORTUNITY_CLOSED',
    });
  });

  it.each(['direct', 'accepted', 'duplicate'] as const)(
    'C9 serializes %s creation precedence at the Request boundary',
    async (winner) => {
      const fixture = await preparedOffer();
      await grantContract(fixture, 'c9-race-grant');
      const offer = record(
        await command({
          path: '/offers/opportunities/' + fixture.opportunityId,
          companyId: fixture.companyId,
          key: 'c9-race-offer',
          body: {
            recipient: { kind: 'PRIMARY' },
            pricingSnapshotId: fixture.snapshotId,
            scopeNote: 'Offer scope',
          },
        }),
      );
      await command({
        path: '/company-offer-approver-assignments',
        key: 'c9-race-approver',
        body: {
          workspaceMembershipId: fixture.actorMembershipId,
          companyId: fixture.companyId,
        },
      });
      const offerBase =
        '/offers/opportunities/' +
        fixture.opportunityId +
        '/versions/' +
        stringField(record(offer.version), 'id');
      await command({
        path: offerBase + '/approve',
        companyId: fixture.companyId,
        key: 'c9-race-approved',
        body: { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
      });
      await command({
        path: offerBase + '/transmission',
        companyId: fixture.companyId,
        key: 'c9-race-transmitted',
        body: { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
      });
      const base = '/contracts/opportunities/' + fixture.opportunityId,
        body = {
          recipient: { kind: 'PRIMARY' },
          pricingSnapshotId: fixture.snapshotId,
          directReason: 'Governed direct exception',
          scopeNote: 'Direct scope',
        };
      const send = (path: string, payload: unknown, key: string) =>
        request({
          path,
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
      const direct = (key: string) => send(base + '/direct', body, key),
        accept = () =>
          send(
            offerBase + '/client-response',
            {
              expectedOfferRevision: 3,
              outcome: 'ACCEPTED',
              receivedAt: instant.toISOString(),
            },
            'c9-race-accepted',
          );
      const blocker = await pool.connect();
      let first: Promise<Response> | undefined,
        second: Promise<Response> | undefined;
      try {
        await blocker.query('BEGIN');
        const pid = (
          await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0]?.pid;
        if (pid === undefined) throw new Error('Missing blocker');
        await blocker.query(
          'SELECT id FROM client_requests WHERE id=$1 FOR UPDATE',
          [fixture.requestId],
        );
        first = winner === 'accepted' ? accept() : direct('c9-race-direct');
        const firstPid = await waitForBlocker(pid);
        second =
          winner === 'duplicate'
            ? direct('c9-race-duplicate')
            : winner === 'accepted'
              ? direct('c9-race-direct')
              : accept();
        await waitForBlocker(firstPid, pid);
        await blocker.query('COMMIT');
        expect((await first).status).toBe(201);
        expect((await second).status).toBe(winner === 'direct' ? 201 : 409);
        if (winner === 'accepted')
          expect(await json(await second)).toMatchObject({
            code: 'ACCEPTED_OFFER_EXISTS',
          });
        const rows = (
          await pool.query<{
            contracts: string;
            versions: string;
            receipts: string;
            events: string;
          }>(
            'SELECT (SELECT count(*) FROM contracts)::text AS contracts,(SELECT count(*) FROM contract_versions)::text AS versions,(SELECT count(*) FROM contract_commands)::text AS receipts,(SELECT count(*) FROM contract_events)::text AS events',
          )
        ).rows[0];
        expect(rows).toEqual(
          winner === 'accepted'
            ? { contracts: '0', versions: '0', receipts: '0', events: '0' }
            : { contracts: '1', versions: '1', receipts: '1', events: '2' },
        );
        if (winner === 'direct') {
          expect(
            (
              await send(
                base + '/versions',
                {
                  expectedContractRevision: 1,
                  pricingSnapshotId: fixture.snapshotId,
                  scopeNote: 'Revised after later acceptance',
                },
                'c9-race-revise',
              )
            ).status,
          ).toBe(201);
          expect((await direct('c9-race-direct')).status).toBe(201);
        }
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        await Promise.allSettled(
          [first, second].filter((item) => item !== undefined),
        );
      }
    },
  );
  it('C9 preserves the fixed Additional party and refreshes only its current identity', async () => {
    const fixture = await preparedOffer();
    await grantContract(fixture, 'c9-additional-grant');
    const registered = record(
      await command({
        path: '/clients/' + fixture.clientId + '/legal-entities',
        companyId: fixture.companyId,
        key: 'c9-additional-register',
        body: {
          expectedClientVersion: numberField(
            record(
              await json(
                await request({
                  path: '/clients/' + fixture.clientId,
                  companyId: fixture.companyId,
                }),
              ),
            ),
            'version',
          ),
          legalName: 'Additional party',
          taxId: 'SYNTHETIC-ADDITIONAL',
          legalAddress: 'Synthetic address',
        },
      }),
    );
    const entityId = stringField(record(registered.legalEntity), 'id'),
      base = '/contracts/opportunities/' + fixture.opportunityId;
    const created = record(
      await command({
        path: base + '/direct',
        companyId: fixture.companyId,
        key: 'c9-additional-create',
        body: {
          recipient: { kind: 'ADDITIONAL', legalEntityId: entityId },
          pricingSnapshotId: fixture.snapshotId,
          directReason: 'Fixed party exception',
          scopeNote: 'Original',
        },
      }),
    );
    const client = record(
      await json(
        await request({
          path: '/clients/' + fixture.clientId,
          companyId: fixture.companyId,
        }),
      ),
    );
    expect(
      (
        await request({
          path: '/clients/' + fixture.clientId + '/legal-entities/' + entityId,
          companyId: fixture.companyId,
          init: {
            method: 'PATCH',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': 'c9-additional-update',
            },
            body: JSON.stringify({
              expectedClientVersion: numberField(client, 'version'),
              changes: { legalName: 'Updated additional party' },
            }),
          },
        })
      ).status,
    ).toBe(200);
    const revision = await command({
      path: base + '/versions',
      companyId: fixture.companyId,
      key: 'c9-additional-revise',
      body: {
        expectedContractRevision: 1,
        pricingSnapshotId: fixture.snapshotId,
        scopeNote: 'Revised',
      },
    });
    const current = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    expect(record(current.version).recipient).toMatchObject({
      kind: 'ADDITIONAL',
      additionalLegalEntityId: entityId,
      legalName: 'Updated additional party',
    });
    expect(record(current.version).differences).toContainEqual({
      field: 'recipientLegalName',
      before: 'Additional party',
      after: 'Updated additional party',
    });
    expect(current.directReason).toBe(created.directReason);
    expect(record(revision).versionNumber).toBe(2);
    for (const change of [
      { recipient: { kind: 'PRIMARY' } },
      { directReason: 'Change origin reason' },
      { acceptedOfferVersionId: entityId },
    ])
      expect(
        (
          await request({
            path: base + '/versions',
            companyId: fixture.companyId,
            init: {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'idempotency-key': 'c9-illegal-' + Object.keys(change)[0],
              },
              body: JSON.stringify({
                expectedContractRevision: 2,
                pricingSnapshotId: fixture.snapshotId,
                scopeNote: 'Refused',
                ...change,
              }),
            },
          })
        ).status,
      ).toBe(400);
  });
  it('C9 freshly checks direct warnings and subtracts approval acknowledgements at signature', async () => {
    const fixture = await preparedOffer();
    await grantContract(fixture, 'c9-fresh-grant');
    await grantApprover(fixture);
    const base = '/contracts/opportunities/' + fixture.opportunityId,
      created = record(
        await command({
          path: base + '/direct',
          companyId: fixture.companyId,
          key: 'c9-fresh-create',
          body: {
            recipient: { kind: 'PRIMARY' },
            pricingSnapshotId: fixture.snapshotId,
            directReason: 'Review every decision',
            scopeNote: 'Synthetic scope',
            termEndsOn: '2026-09-27',
          },
        }),
      ),
      versionId = stringField(record(created.version), 'id');
    expect(
      (
        await decisionRequest(
          fixture,
          versionId,
          'approve',
          {
            expectedContractRevision: 1,
            acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'],
          },
          'c9-fresh-approve',
        )
      ).status,
    ).toBe(201);
    instant = new Date('2026-09-28T00:00:00.000Z');
    const refused = await signatureRequest(
      fixture,
      versionId,
      signaturePayload(),
      'c9-fresh-signature-missing',
    );
    expect(refused.status).toBe(409);
    expect(await json(refused)).toMatchObject({
      code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED',
    });
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          {
            ...signaturePayload(),
            acknowledgedWarningCodes: [
              'DIRECT_ORIGIN_REVIEWED',
              'TERM_END_NOT_PASSED',
            ],
          },
          'c9-fresh-signature-extra',
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          {
            ...signaturePayload(),
            acknowledgedWarningCodes: ['TERM_END_NOT_PASSED'],
          },
          'c9-fresh-signature',
        )
      ).status,
    ).toBe(201);
  });
  it('C9 database guards reject false direct PASS, immutable origin and private event content', async () => {
    const { fixture, base, created, versionId } = await directFixture();
    const run = record(
      await command({
        path: base + '/versions/' + versionId + '/quality-checks',
        companyId: fixture.companyId,
        key: 'c9-guard-check',
        body: {},
      }),
    );
    if (!Array.isArray(run.results)) throw new Error('Missing results');
    const falsePass = run.results
      .map(record)
      .map((item) =>
        item.code === 'DIRECT_ORIGIN_REVIEWED'
          ? { code: item.code, status: 'PASS' }
          : item,
      );
    await expect(
      pool.query(
        `INSERT INTO contract_quality_runs(workspace_id,company_id,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,evaluated_at,results) SELECT workspace_id,company_id,contract_id,id,created_by_internal_user_id,created_by_workspace_membership_id,created_at,$2::jsonb FROM contract_versions WHERE id=$1`,
        [versionId, JSON.stringify(falsePass)],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    for (const update of [
      "direct_reason='Changed'",
      "origin='ACCEPTED_OFFER'",
      "kind='PRECONTRACT'",
    ])
      await expect(
        pool.query('UPDATE contracts SET ' + update + ' WHERE id=$1', [
          created.id,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        `INSERT INTO contract_events(workspace_id,company_id,action,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,metadata) SELECT workspace_id,company_id,action,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,metadata||jsonb_build_object('directReason','Private') FROM contract_events WHERE action='contract_version.created' AND contract_id=$1`,
        [created.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const events = (
      await pool.query<{ action: string; metadata: unknown }>(
        'SELECT action,metadata FROM contract_events WHERE contract_id=$1 ORDER BY action',
        [created.id],
      )
    ).rows;
    expect(events.map((item) => item.action)).toEqual([
      'contract.created',
      'contract_version.created',
    ]);
    for (const event of events) {
      expect(record(event.metadata).origin).toBe('DIRECT');
      for (const key of [
        'offerVersionId',
        'directReason',
        'scopeNote',
        'commercialConditions',
        'recipient',
        'signatory',
      ])
        expect(record(event.metadata)).not.toHaveProperty(key);
      expect(JSON.stringify(event)).not.toContain('Synthetic direct fixture');
    }
  });
  it('C9 blocks direct approval when the recorded tax identifier is missing', async () => {
    const fixture = await preparedOffer();
    await pool.query('UPDATE client_accounts SET tax_id=NULL WHERE id=$1', [
      fixture.clientId,
    ]);
    await grantContract(fixture, 'c9-missing-grant');
    await grantApprover(fixture);
    const base = '/contracts/opportunities/' + fixture.opportunityId,
      created = record(
        await command({
          path: base + '/direct',
          companyId: fixture.companyId,
          key: 'c9-missing-create',
          body: {
            recipient: { kind: 'PRIMARY' },
            pricingSnapshotId: fixture.snapshotId,
            directReason: 'Tax identifier is missing',
            scopeNote: 'Synthetic scope',
          },
        }),
      ),
      versionId = stringField(record(created.version), 'id');
    const run = record(
      await command({
        path: base + '/versions/' + versionId + '/quality-checks',
        companyId: fixture.companyId,
        key: 'c9-missing-check',
        body: {},
      }),
    );
    expect(run.results).toContainEqual({
      code: 'PARTY_TAX_ID_RECORDED',
      status: 'ERROR',
    });
    expect(
      (
        await decisionRequest(
          fixture,
          versionId,
          'approve',
          {
            expectedContractRevision: 1,
            acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'],
          },
          'c9-missing-approve',
        )
      ).status,
    ).toBe(409);
  });
  it('C9 executed direct parents retain Addenda and preparatory Project compatibility', async () => {
    const target = await directFixture(true),
      { fixture, base, versionId } = target;
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'c9-compat-signature',
        )
      ).status,
    ).toBe(201);
    await grantLinkProject(fixture);
    const project = record(
      await command({
        path: base + '/projects/create',
        companyId: fixture.companyId,
        key: 'c9-compat-project-create',
        body: {
          title: 'Direct preparatory Project',
          expectedContractRevision: 3,
          acknowledgedCandidateProjectIds: [],
        },
      }),
    );
    expect(record(project.link)).toMatchObject({ created: true, revision: 4 });
    const otherProject = await createLinkProject(
      fixture,
      'Other direct Project',
    );
    expect(
      (
        await linkRequest(
          target,
          { projectId: otherProject, expectedContractRevision: 4 },
          'c9-compat-project-link',
        )
      ).status,
    ).toBe(201);
    const child = record(
      await command({
        path:
          base +
          '/agreements/' +
          stringField(target.created, 'id') +
          '/addenda',
        companyId: fixture.companyId,
        key: 'c9-compat-addendum',
        body: {
          expectedContractRevision: 5,
          changeSummary: 'Direct parent change',
        },
      }),
    );
    expect(child).toMatchObject({
      kind: 'ADDENDUM',
      origin: null,
      parentContractId: target.created.id,
    });
    expect(record(child.version).pricingSnapshotId).toBeNull();
    const childBase = base + '/agreements/' + stringField(child, 'id'),
      childVersion = stringField(record(child.version), 'id');
    const approved = record(
      await command({
        path: childBase + '/versions/' + childVersion + '/approve',
        companyId: fixture.companyId,
        key: 'c9-compat-child-approve',
        body: { expectedContractRevision: 1, acknowledgedWarningCodes: [] },
      }),
    );
    expect(record(approved.qualityRun).results).toContainEqual({
      code: 'PARENT_EXECUTED',
      status: 'PASS',
    });
    expect(record(approved.qualityRun).results).not.toContainEqual(
      expect.objectContaining({ code: 'DIRECT_ORIGIN_REVIEWED' }),
    );
    await command({
      path: childBase + '/versions/' + childVersion + '/signature',
      companyId: fixture.companyId,
      key: 'c9-compat-child-signature',
      body: signaturePayload(),
    });
    const reopened = record(
      record(
        await json(
          await request({ path: childBase, companyId: fixture.companyId }),
        ),
      ).contract,
    );
    expect(reopened.linkedProjects).toHaveLength(2);
    const parent = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    expect(record(parent.version).representation).toEqual(
      record(target.created.version).representation,
    );
  });
  it('C9 rolls back failed creation atomically and reuses its original reference on retry', async () => {
    const fixture = await preparedOffer();
    await grantContract(fixture, 'c9-rollback-grant');
    await pool.query(
      "CREATE FUNCTION c9_fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.metadata->>'origin'='DIRECT' AND NEW.action='contract_version.created' THEN RAISE EXCEPTION 'Synthetic direct rollback'; END IF; RETURN NEW; END; $$; CREATE TRIGGER c9_fail_event BEFORE INSERT ON contract_events FOR EACH ROW EXECUTE FUNCTION c9_fail_event()",
    );
    const path =
        '/contracts/opportunities/' + fixture.opportunityId + '/direct',
      body = {
        recipient: { kind: 'PRIMARY' },
        pricingSnapshotId: fixture.snapshotId,
        directReason: 'Rollback exception',
        scopeNote: 'Exact retry',
      };
    const send = () =>
      request({
        path,
        companyId: fixture.companyId,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': 'c9-rollback',
          },
          body: JSON.stringify(body),
        },
      });
    try {
      expect((await send()).status).toBe(500);
      expect(
        (
          await pool.query(
            'SELECT (SELECT count(*) FROM contracts)::int AS contracts,(SELECT count(*) FROM contract_versions)::int AS versions,(SELECT count(*) FROM contract_commands)::int AS receipts,(SELECT count(*) FROM contract_events)::int AS events,(SELECT count(*) FROM contract_reference_counters)::int AS counters',
          )
        ).rows,
      ).toEqual([
        { contracts: 0, versions: 0, receipts: 0, events: 0, counters: 0 },
      ]);
    } finally {
      await pool.query(
        'DROP TRIGGER c9_fail_event ON contract_events;DROP FUNCTION c9_fail_event()',
      );
    }
    expect(record(await json(await send())).illustrativeReference).toBe(1);
  });
  it('C9 rejects malformed and foreign sources without writes and reads recorded content without live source grants', async () => {
    const fixture = await preparedOffer(),
      foreign = await preparedOffer('-c9-foreign');
    await grantContract(fixture, 'c9-boundary-grant');
    const foreignEntity = record(
      await command({
        path: '/clients/' + foreign.clientId + '/legal-entities',
        companyId: foreign.companyId,
        key: 'c9-foreign-entity-register',
        body: {
          expectedClientVersion: numberField(
            record(
              await json(
                await request({
                  path: '/clients/' + foreign.clientId,
                  companyId: foreign.companyId,
                }),
              ),
            ),
            'version',
          ),
          legalName: 'Foreign synthetic party',
          taxId: 'FOREIGN-SYNTHETIC',
          legalAddress: 'Synthetic address',
        },
      }),
    );
    const base = '/contracts/opportunities/' + fixture.opportunityId,
      body = {
        recipient: { kind: 'PRIMARY' },
        pricingSnapshotId: fixture.snapshotId,
        directReason: 'Boundary exception',
        scopeNote: 'Exact scope',
      };
    const send = (
      payload: unknown,
      key: string,
      companyId = fixture.companyId,
    ) =>
      request({
        path: base + '/direct',
        companyId,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': key,
          },
          body: JSON.stringify(payload),
        },
      });
    let ordinal = 0;
    for (const change of [
      { directReason: '' },
      { directReason: ' '.repeat(4) },
      { directReason: 'x'.repeat(501) },
      { scopeNote: '' },
      { scopeNote: 'x'.repeat(2001) },
      { commercialConditions: 'x'.repeat(4001) },
      { specialConditions: 'x'.repeat(4001) },
      { termStartsOn: '2026-10-02', termEndsOn: '2026-10-01' },
      { termEndsOn: '2026-02-30' },
      { pricingSnapshotId: null },
      { origin: 'ACCEPTED_OFFER' },
      { kind: 'PRECONTRACT' },
      { acceptedOfferVersionId: fixture.snapshotId },
      { recipient: { kind: 'PRIMARY', legalEntityId: fixture.snapshotId } },
    ])
      expect(
        (await send({ ...body, ...change }, 'c9-invalid-' + ordinal++)).status,
      ).toBe(400);
    const otherRequest = record(
      await command({
        path: '/commercial-intake/requests',
        companyId: fixture.companyId,
        key: 'c9-other-opportunity',
        body: {
          originalText: 'Other synthetic Request',
          subject: 'Other direct boundary',
          clientAccountId: fixture.clientId,
          opportunity: { title: 'Other opportunity', nextAction: 'Prepare' },
        },
      }),
    );
    const otherOpportunity = stringField(
      record(otherRequest.initialOpportunity),
      'id',
    );
    const otherSnapshot = record(
      await command({
        path: '/pricing/opportunities/' + otherOpportunity + '/snapshots',
        companyId: fixture.companyId,
        key: 'c9-other-snapshot',
        body: {
          pricingRuleVersionNumber: fixture.ruleVersionNumber,
          lines: [
            {
              offeringId: fixture.offeringId,
              tariffVersionNumber: fixture.tariffVersionNumber,
              quantity: '1',
            },
          ],
        },
      }),
    );
    const wrongOpportunity = await send(
      { ...body, pricingSnapshotId: otherSnapshot.id },
      'c9-wrong-opportunity',
    );
    expect(wrongOpportunity.status).toBe(409);
    expect(await json(wrongOpportunity)).toMatchObject({
      code: 'PRICING_SNAPSHOT_NOT_FOR_OPPORTUNITY',
    });
    expect(
      (
        await send(
          { ...body, pricingSnapshotId: foreign.snapshotId },
          'c9-foreign-snapshot',
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await send(
          {
            ...body,
            recipient: {
              kind: 'ADDITIONAL',
              legalEntityId: record(foreignEntity.legalEntity).id,
            },
          },
          'c9-foreign-entity',
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await pool.query(
          'SELECT (SELECT count(*) FROM contracts)::int AS contracts,(SELECT count(*) FROM contract_commands)::int AS receipts,(SELECT count(*) FROM contract_events)::int AS events',
        )
      ).rows,
    ).toEqual([{ contracts: 0, receipts: 0, events: 0 }]);
    const noClientRequest = record(
      await command({
        path: '/commercial-intake/requests',
        companyId: fixture.companyId,
        key: 'c9-no-client-request',
        body: {
          originalText: 'Synthetic unassociated Request',
          subject: 'No Client',
          opportunity: {
            title: 'No Client opportunity',
            nextAction: 'Prepare',
          },
        },
      }),
    );
    const noClient = await request({
      path:
        '/contracts/opportunities/' +
        stringField(record(noClientRequest.initialOpportunity), 'id') +
        '/direct',
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'c9-no-client-create',
        },
        body: JSON.stringify(body),
      },
    });
    expect(noClient.status).toBe(409);
    expect(await json(noClient)).toMatchObject({
      code: 'CONTRACT_CLIENT_REQUIRED',
    });
    const created = record(await json(await send(body, 'c9-boundary-create')));
    expect(created.origin).toBe('DIRECT');
    for (const route of [
      'company-pricing-user',
      'company-offer-preparer',
      'company-director-client',
    ])
      expect(
        (
          await request({
            path:
              '/' +
              route +
              '-assignments/' +
              fixture.actorMembershipId +
              '/' +
              fixture.companyId,
            init: {
              method: 'DELETE',
              headers: { 'idempotency-key': 'c9-reader-revoke-' + route },
            },
          })
        ).status,
      ).toBe(200);
    const loaded = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    expect(loaded.version).toEqual(created.version);
    expect((await send(body, 'c9-boundary-create')).status).toBe(403);
  });
  it.each(['client', 'preparer', 'snapshot'] as const)(
    'C9 refuses creation when %s invalidation wins its live fence',
    async (fence) => {
      const fixture = await preparedOffer();
      await grantContract(fixture, 'c9-fence-grant');
      const blocker = await pool.connect();
      let pending: Promise<Response> | undefined;
      try {
        await blocker.query('BEGIN');
        const pid = (
          await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0]?.pid;
        if (pid === undefined) throw new Error('Missing blocker');
        if (fence === 'client')
          await blocker.query(
            "UPDATE client_accounts SET status='archived' WHERE id=$1",
            [fixture.clientId],
          );
        else
          await blocker.query(
            'UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND bundle::text=ANY($2::text[])',
            [
              fixture.companyId,
              fence === 'preparer'
                ? ['company_contract_preparer']
                : ['company_pricing_user', 'company_offer_preparer'],
            ],
          );
        pending = request({
          path: '/contracts/opportunities/' + fixture.opportunityId + '/direct',
          companyId: fixture.companyId,
          init: {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': 'c9-fence-create',
            },
            body: JSON.stringify({
              recipient: { kind: 'PRIMARY' },
              pricingSnapshotId: fixture.snapshotId,
              directReason: 'Fence exception',
              scopeNote: 'Scope',
            }),
          },
        });
        await waitForBlocker(pid);
        await blocker.query('COMMIT');
        expect((await pending).status).toBe(fence === 'client' ? 404 : 403);
        expect(
          (await pool.query('SELECT count(*)::int AS count FROM contracts'))
            .rows,
        ).toEqual([{ count: 0 }]);
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        await pending;
      }
    },
  );
  it('C9 requires complete direct creation evidence at the database boundary', async () => {
    const { created, versionId } = await directFixture(),
      target = await preparedOffer('-c9-incomplete'),
      connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      const direct = (
        await connection.query<{ id: string }>(
          `INSERT INTO contracts(workspace_id,company_id,opportunity_id,client_request_id,original_client_account_id,kind,origin,direct_reason,illustrative_reference,created_by_internal_user_id,created_by_workspace_membership_id,created_at) SELECT workspace_id,$2,$3,$4,$5,'CONTRACT','DIRECT','Incomplete synthetic evidence',1,created_by_internal_user_id,created_by_workspace_membership_id,created_at FROM contracts WHERE id=$1 RETURNING id`,
          [
            created.id,
            target.companyId,
            target.opportunityId,
            target.requestId,
            target.clientId,
          ],
        )
      ).rows[0]?.id;
      if (!direct) throw new Error('Missing incomplete direct row');
      await connection.query(
        `INSERT INTO contract_versions(workspace_id,company_id,contract_id,opportunity_id,pricing_snapshot_id,recipient_client_account_id,recipient_kind,recipient_legal_name,recipient_tax_id,recipient_legal_address,issuing_company_label,scope_note,created_by_internal_user_id,created_by_workspace_membership_id,created_at) SELECT workspace_id,$2,$3,$4,$5,$6,'PRIMARY',recipient_legal_name,recipient_tax_id,recipient_legal_address,issuing_company_label,'Synthetic valid scope',created_by_internal_user_id,created_by_workspace_membership_id,created_at FROM contract_versions WHERE id=$1`,
        [
          versionId,
          target.companyId,
          direct,
          target.opportunityId,
          target.snapshotId,
          target.clientId,
        ],
      );
      await expect(connection.query('COMMIT')).rejects.toMatchObject({
        code: '23514',
        message: 'Incomplete direct Contract creation evidence',
      });
    } finally {
      await connection.query('ROLLBACK');
      connection.release();
    }
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM contracts WHERE company_id=$1',
          [target.companyId],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });
  it('C8 review reopens only explicit child Quality Check history and details', async () => {
    const { fixture, base, versionId } = await approvedSignatureFixture();
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'c8-review-parent',
        )
      ).status,
    ).toBe(201);
    const parent = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    const createPath =
      base + '/agreements/' + stringField(parent, 'id') + '/addenda';
    const children = [];
    for (const ordinal of [1, 2]) {
      const child = record(
        await command({
          path: createPath,
          companyId: fixture.companyId,
          key: 'c8-review-child-' + ordinal,
          body: {
            expectedContractRevision: 3,
            changeSummary: 'Child ' + ordinal,
          },
        }),
      );
      const childBase = base + '/agreements/' + stringField(child, 'id');
      const childVersion = stringField(record(child.version), 'id');
      const run = record(
        await command({
          path: childBase + '/versions/' + childVersion + '/quality-checks',
          companyId: fixture.companyId,
          key: 'c8-review-check-' + ordinal,
          body: {},
        }),
      );
      children.push({ base: childBase, versionId: childVersion, run });
    }
    const mainRun = record(record(parent.version).latestQualityRun);
    const targets = [{ base, versionId, run: mainRun }, ...children];
    for (const own of targets) {
      const qualityPath =
        own.base + '/versions/' + own.versionId + '/quality-checks';
      const listed = await request({
        path: qualityPath,
        companyId: fixture.companyId,
      });
      expect(listed.status).toBe(200);
      expect(record(await json(listed)).items).toContainEqual(own.run);
      const reopened = await request({
        path: qualityPath + '/' + stringField(own.run, 'id'),
        companyId: fixture.companyId,
      });
      expect(reopened.status).toBe(200);
      expect(await json(reopened)).toEqual(own.run);
      for (const other of targets.filter(
        (candidate) => candidate.base !== own.base,
      )) {
        for (const suffix of ['', '/' + stringField(other.run, 'id')])
          expect(
            (
              await request({
                path:
                  own.base +
                  '/versions/' +
                  other.versionId +
                  '/quality-checks' +
                  suffix,
                companyId: fixture.companyId,
              })
            ).status,
          ).toBe(404);
        expect(
          (
            await request({
              path: qualityPath + '/' + stringField(other.run, 'id'),
              companyId: fixture.companyId,
            })
          ).status,
        ).toBe(404);
      }
    }
  });
  it('C8 review conflicts invalid changed creation and version input after current access fences', async () => {
    const { fixture, base, versionId } = await approvedSignatureFixture();
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'c8-review-intent-parent',
        )
      ).status,
    ).toBe(201);
    const parent = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    const createPath =
      base + '/agreements/' + stringField(parent, 'id') + '/addenda';
    const body = {
      expectedContractRevision: 3,
      changeSummary: 'Original child',
      pricingSnapshotId: fixture.snapshotId,
    };
    const child = record(
      await command({
        path: createPath,
        companyId: fixture.companyId,
        key: 'c8-review-create',
        body,
      }),
    );
    const versionPath =
      base + '/agreements/' + stringField(child, 'id') + '/versions';
    const revisionBody = {
      ...body,
      expectedContractRevision: 1,
      changeSummary: 'Revised child',
    };
    await command({
      path: versionPath,
      companyId: fixture.companyId,
      key: 'c8-review-version',
      body: revisionBody,
    });
    const send = (path: string, payload: unknown, key: string) =>
      request({
        path,
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
    const intents = [
      { path: createPath, payload: body, key: 'c8-review-create' },
      { path: versionPath, payload: revisionBody, key: 'c8-review-version' },
    ];
    for (const intent of intents) {
      for (const changed of [
        [],
        {},
        { ...intent.payload, changeSummary: '' },
        { ...intent.payload, expectedContractRevision: null },
        { ...intent.payload, termEndsOn: 'not-a-date' },
        { ...intent.payload, pricingSnapshotId: 42 },
        { ...intent.payload, pricingSnapshotId: 'not-an-id' },
        { ...intent.payload, unknownField: true },
      ]) {
        const response = await send(intent.path, changed, intent.key);
        expect(response.status).toBe(409);
        expect(await json(response)).toMatchObject({
          code: 'IDEMPOTENCY_CONFLICT',
        });
      }
      expect(
        (
          await send(
            intent.path,
            { ...intent.payload, changeSummary: '' },
            intent.key + '-fresh',
          )
        ).status,
      ).toBe(400);
    }
    for (const bundle of ['company-pricing-user', 'company-offer-preparer'])
      expect(
        (
          await request({
            path:
              '/' +
              bundle +
              '-assignments/' +
              fixture.actorMembershipId +
              '/' +
              fixture.companyId,
            init: {
              method: 'DELETE',
              headers: { 'idempotency-key': 'c8-review-revoke-' + bundle },
            },
          })
        ).status,
      ).toBe(200);
    for (const intent of intents)
      expect(
        (
          await send(
            intent.path,
            { ...intent.payload, changeSummary: '' },
            intent.key,
          )
        ).status,
      ).toBe(403);
    await pool.query(
      "UPDATE client_company_relationships SET status='archived' WHERE company_id=$1 AND client_account_id=$2",
      [fixture.companyId, fixture.clientId],
    );
    for (const intent of intents)
      expect(
        (
          await send(
            intent.path,
            { expectedContractRevision: null },
            intent.key,
          )
        ).status,
      ).toBe(404);
    await pool.query(
      "UPDATE client_company_relationships SET status='active' WHERE company_id=$1 AND client_account_id=$2",
      [fixture.companyId, fixture.clientId],
    );
    expect(
      (
        await request({
          path:
            '/company-director-client-assignments/' +
            fixture.actorMembershipId +
            '/' +
            fixture.companyId,
          init: {
            method: 'DELETE',
            headers: { 'idempotency-key': 'c8-review-revoke-client' },
          },
        })
      ).status,
    ).toBe(200);
    for (const intent of intents)
      expect(
        (
          await send(
            intent.path,
            { expectedContractRevision: null },
            intent.key,
          )
        ).status,
      ).toBe(403);
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
            headers: { 'idempotency-key': 'c8-review-revoke-contract' },
          },
        })
      ).status,
    ).toBe(200);
    for (const intent of intents)
      expect((await send(intent.path, {}, intent.key)).status).toBe(403);
  });
  it('C8 creates distinct optional-price Addenda and revises, approves and executes one without changing its parent', async () => {
    const { fixture, base, versionId } = await approvedSignatureFixture();
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'c8-parent-sign',
        )
      ).status,
    ).toBe(201);
    const parent = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    const parentId = stringField(parent, 'id');
    const childPath = base + '/agreements/' + parentId + '/addenda';
    const first = record(
      await command({
        path: childPath,
        companyId: fixture.companyId,
        key: 'c8-first',
        body: {
          expectedContractRevision: 3,
          changeSummary: '  Extend synthetic delivery\nexact  ',
          termEndsOn: '2026-12-31',
        },
      }),
    );
    expect(first).toMatchObject({
      kind: 'ADDENDUM',
      origin: null,
      parentContractId: parentId,
      addendumOrdinal: 1,
      version: {
        changeSummary: '  Extend synthetic delivery\nexact  ',
        pricingSnapshotId: null,
        pricingSnapshot: null,
      },
    });
    const second = record(
      await command({
        path: childPath,
        companyId: fixture.companyId,
        key: 'c8-second',
        body: {
          expectedContractRevision: 3,
          changeSummary: 'Second synthetic change',
          pricingSnapshotId: fixture.snapshotId,
        },
      }),
    );
    expect(second).toMatchObject({
      addendumOrdinal: 2,
      version: { pricingSnapshotId: fixture.snapshotId },
    });
    const childBase = base + '/agreements/' + stringField(first, 'id');
    const revised = record(
      await command({
        path: childBase + '/versions',
        companyId: fixture.companyId,
        key: 'c8-revise',
        body: {
          expectedContractRevision: 1,
          changeSummary: 'Revised synthetic change',
        },
      }),
    );
    const successor = stringField(revised, 'contractVersionId');
    expect(
      await command({
        path: childBase + '/versions/' + successor + '/approve',
        companyId: fixture.companyId,
        key: 'c8-approve',
        body: { expectedContractRevision: 2, acknowledgedWarningCodes: [] },
      }),
    ).toMatchObject({ kind: 'APPROVE', revision: 3 });
    expect(
      await command({
        path: childBase + '/versions/' + successor + '/signature',
        companyId: fixture.companyId,
        key: 'c8-sign',
        body: { ...signaturePayload(), expectedContractRevision: 3 },
      }),
    ).toMatchObject({ revision: 4 });
    const after = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    expect({ ...after, addenda: [] }).toEqual({ ...parent, addenda: [] });
    expect(after.addenda).toMatchObject([
      { id: first.id, addendumOrdinal: 1, executionState: 'EXECUTED' },
      { id: second.id, addendumOrdinal: 2, executionState: 'NOT_EXECUTED' },
    ]);
    expect(
      record(
        record(
          await json(
            await request({ path: childBase, companyId: fixture.companyId }),
          ),
        ).contract,
      ),
    ).toMatchObject({
      id: first.id,
      revision: 4,
      version: { id: successor, versionNumber: 2, executionState: 'EXECUTED' },
    });
  });
  it('C8 converges exact creation retries, allocates concurrent ordinals and refuses changed intent and sibling versions', async () => {
    const { fixture, base, versionId } = await approvedSignatureFixture();
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'c8-concurrent-parent',
        )
      ).status,
    ).toBe(201);
    const parent = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    const path = base + '/agreements/' + stringField(parent, 'id') + '/addenda';
    const send = (key: string, changeSummary: string) =>
      request({
        path,
        companyId: fixture.companyId,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': key,
          },
          body: JSON.stringify({ expectedContractRevision: 3, changeSummary }),
        },
      });
    const replies = await Promise.all([
      send('c8-same', 'First'),
      send('c8-same', 'First'),
      send('c8-other', 'Second'),
    ]);
    expect(replies.map((item) => item.status)).toEqual([201, 201, 201]);
    const first = record(await json(replies[0])),
      repeated = record(await json(replies[1])),
      second = record(await json(replies[2]));
    expect(repeated).toEqual(first);
    expect(new Set([first.addendumOrdinal, second.addendumOrdinal])).toEqual(
      new Set([1, 2]),
    );
    expect(
      new Set([first.illustrativeReference, second.illustrativeReference]),
    ).toEqual(new Set([1, 2]));
    expect(await json(await send('c8-same', 'Changed'))).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    for (const target of [
      base,
      base + '/agreements/' + stringField(second, 'id'),
    ])
      expect(
        (
          await request({
            path:
              target + '/versions/' + stringField(record(first.version), 'id'),
            companyId: fixture.companyId,
          })
        ).status,
      ).toBe(404);
    const history = record(
      await json(
        await request({
          path: base + '/versions',
          companyId: fixture.companyId,
        }),
      ),
    );
    expect(history.items).toMatchObject([{ id: versionId }]);
    expect(
      (
        await pool.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM contract_events WHERE contract_id IN ($1,$2)',
          [first.id, second.id],
        )
      ).rows[0]?.count,
    ).toBe('4');
  });
  it('C8 refuses invalid parents, unavailable targets and unknown input without changing the executed parent', async () => {
    const { fixture, base, versionId } = await approvedSignatureFixture();
    const before = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    const parentId = stringField(before, 'id');
    const send = (id: string, body: unknown, key: string) =>
      request({
        path: base + '/agreements/' + id + '/addenda',
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
    expect(
      await json(
        await send(
          parentId,
          { expectedContractRevision: 2, changeSummary: 'Cannot yet' },
          'c8-unexecuted',
        ),
      ),
    ).toMatchObject({ code: 'CONTRACT_NOT_EXECUTED' });
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'c8-invalid-parent-sign',
        )
      ).status,
    ).toBe(201);
    for (const [field, value] of [
      ['changeSummary', '   '],
      ['changeSummary', 'x'.repeat(4001)],
      ['changeSummary', null],
      ['termEndsOn', '2026-02-30'],
      ['pricingSnapshotId', 'bad'],
      ['termStartsOn', '2026-01-01'],
      ['specialConditions', 'hidden'],
      ['origin', 'ACCEPTED_OFFER'],
      ['expectedContractRevision', null],
    ] as const)
      expect(
        (
          await send(
            parentId,
            {
              expectedContractRevision: 3,
              changeSummary: 'valid',
              [field]: value,
            },
            'c8-invalid-' + field + String(value).slice(0, 12),
          )
        ).status,
      ).toBe(400);
    expect(
      (
        await send(
          '00000000-0000-4000-8000-000000005449',
          { expectedContractRevision: 3, changeSummary: 'Hidden' },
          'c8-hidden',
        )
      ).status,
    ).toBe(404);
    const child = record(
      await command({
        path: base + '/agreements/' + parentId + '/addenda',
        companyId: fixture.companyId,
        body: { expectedContractRevision: 3, changeSummary: 'Valid' },
        key: 'c8-valid-child',
      }),
    );
    expect(
      await json(
        await send(
          stringField(child, 'id'),
          { expectedContractRevision: 1, changeSummary: 'Forbidden nested' },
          'c8-nested',
        ),
      ),
    ).toMatchObject({ code: 'ADDENDUM_PARENT_INVALID' });
    const current = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    expect(current).toMatchObject({
      id: parentId,
      revision: 3,
      version: { id: versionId, executionState: 'EXECUTED' },
    });
  });
  it('C8 rolls back real child creation writes and preserves ordinal and reference allocation', async () => {
    const { fixture, base, versionId } = await approvedSignatureFixture();
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'c8-rollback-sign',
        )
      ).status,
    ).toBe(201);
    const parent = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    const path = base + '/agreements/' + stringField(parent, 'id') + '/addenda';
    await pool.query(
      "CREATE FUNCTION c8_fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.metadata->>'kind'='ADDENDUM' AND NEW.action='contract_version.created' THEN RAISE EXCEPTION 'Synthetic rollback'; END IF; RETURN NEW; END; $$; CREATE TRIGGER c8_fail_event BEFORE INSERT ON contract_events FOR EACH ROW EXECUTE FUNCTION c8_fail_event()",
    );
    const body = {
      expectedContractRevision: 3,
      changeSummary: 'Exact rollback retry',
    };
    try {
      const failed = await request({
        path,
        companyId: fixture.companyId,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': 'c8-rollback',
          },
          body: JSON.stringify(body),
        },
      });
      expect(failed.status).toBe(500);
      expect(await json(failed)).toMatchObject({
        code: 'CONTRACT_CREATION_UNCERTAIN',
      });
      expect(
        (
          await pool.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM contracts WHERE kind='ADDENDUM'",
          )
        ).rows[0]?.count,
      ).toBe('0');
      expect(
        record(
          record(
            await json(
              await request({ path: base, companyId: fixture.companyId }),
            ),
          ).contract,
        ),
      ).toEqual(parent);
    } finally {
      await pool.query(
        'DROP TRIGGER c8_fail_event ON contract_events; DROP FUNCTION c8_fail_event()',
      );
    }
    expect(
      await command({
        path,
        companyId: fixture.companyId,
        body,
        key: 'c8-rollback',
      }),
    ).toMatchObject({ addendumOrdinal: 1, illustrativeReference: 1 });
  });
  it('C8 fences current Client and selected Snapshot for prepare/replay while independent approval reads copied content', async () => {
    const { fixture, base, versionId } = await approvedSignatureFixture();
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'c8-access-sign',
        )
      ).status,
    ).toBe(201);
    const parent = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    const path = base + '/agreements/' + stringField(parent, 'id') + '/addenda';
    const body = {
      expectedContractRevision: 3,
      changeSummary: 'Independent copied content',
      pricingSnapshotId: fixture.snapshotId,
    };
    const send = (payload: unknown, key: string) =>
      request({
        path,
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
    const child = record(
      await command({
        path,
        companyId: fixture.companyId,
        body,
        key: 'c8-access-child',
      }),
    );
    const childBase = base + '/agreements/' + stringField(child, 'id'),
      childVersion = stringField(record(child.version), 'id');
    const revoke = async (bundle: string) => {
      expect(
        (
          await request({
            path:
              '/' +
              bundle +
              '-assignments/' +
              fixture.actorMembershipId +
              '/' +
              fixture.companyId,
            init: {
              method: 'DELETE',
              headers: { 'idempotency-key': 'c8-revoke-' + bundle },
            },
          })
        ).status,
      ).toBe(200);
    };
    await revoke('company-pricing-user');
    await revoke('company-offer-preparer');
    expect((await send(body, 'c8-access-child')).status).toBe(403);
    expect(
      await command({
        path,
        companyId: fixture.companyId,
        body: {
          expectedContractRevision: 3,
          changeSummary: 'No price requires no Pricing grant',
        },
        key: 'c8-no-price',
      }),
    ).toMatchObject({ version: { pricingSnapshot: null } });
    await revoke('company-director-client');
    expect(
      (
        await send(
          { expectedContractRevision: 3, changeSummary: 'No Client' },
          'c8-deny-client',
        )
      ).status,
    ).toBe(403);
    const revise = await request({
      path: childBase + '/versions',
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'c8-deny-client-revise',
        },
        body: JSON.stringify({
          expectedContractRevision: 1,
          changeSummary: 'Denied',
        }),
      },
    });
    expect(revise.status).toBe(403);
    await revoke('company-contract-preparer');
    expect((await send(body, 'c8-access-child')).status).toBe(403);
    const readable = await request({
      path: childBase,
      companyId: fixture.companyId,
    });
    expect(readable.status).toBe(200);
    expect(record(record(await json(readable)).contract)).toMatchObject({
      id: child.id,
      version: { pricingSnapshotId: fixture.snapshotId },
    });
    expect(
      await command({
        path: childBase + '/versions/' + childVersion + '/quality-checks',
        companyId: fixture.companyId,
        body: {},
        key: 'c8-approver-check',
      }),
    ).toMatchObject({ contractVersionId: childVersion });
    expect(
      await command({
        path: childBase + '/versions/' + childVersion + '/approve',
        companyId: fixture.companyId,
        body: { expectedContractRevision: 1, acknowledgedWarningCodes: [] },
        key: 'c8-approver-only',
      }),
    ).toMatchObject({ kind: 'APPROVE' });
    expect(
      await command({
        path: childBase + '/versions/' + childVersion + '/signature',
        companyId: fixture.companyId,
        body: signaturePayload(),
        key: 'c8-sign-only',
      }),
    ).toMatchObject({ revision: 3 });
  });
  it('C8 checks optional Snapshot currency and requires its warning acknowledgement with stable signature bytes', async () => {
    const { fixture, base, versionId } = await approvedSignatureFixture();
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'c8-currency-parent',
        )
      ).status,
    ).toBe(201);
    instant = new Date('2026-09-28T09:00:00.000Z');
    const tariff = published(
      await command({
        path:
          '/pricing-configuration/offerings/' +
          fixture.offeringId +
          '/tariff-versions',
        companyId: fixture.companyId,
        key: 'c8-currency-tariff',
        body: {
          unit: 'illustrative-unit',
          unitAmount: '400.0000',
          currency: 'USD',
          taxRatePercent: '15.00',
          taxLabel: 'Illustrative tax',
          effectiveFrom: instant.toISOString(),
          expectedActiveVersionNumber: fixture.tariffVersionNumber,
        },
      }),
    );
    const snapshot = identifiedRecord(
      await command({
        path: '/pricing/opportunities/' + fixture.opportunityId + '/snapshots',
        companyId: fixture.companyId,
        key: 'c8-currency-snapshot',
        body: {
          pricingRuleVersionNumber: fixture.ruleVersionNumber,
          lines: [
            {
              offeringId: fixture.offeringId,
              tariffVersionNumber: tariff.versionNumber,
              quantity: '1',
            },
          ],
        },
      }),
    );
    const parent = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    const child = record(
      await command({
        path: base + '/agreements/' + stringField(parent, 'id') + '/addenda',
        companyId: fixture.companyId,
        key: 'c8-currency-child',
        body: {
          expectedContractRevision: 3,
          changeSummary: 'Different illustrative currency',
          pricingSnapshotId: snapshot.id,
        },
      }),
    );
    const childBase = base + '/agreements/' + stringField(child, 'id'),
      childVersion = stringField(record(child.version), 'id');
    const commandPath = childBase + '/versions/' + childVersion;
    const run = record(
      await command({
        path: commandPath + '/quality-checks',
        companyId: fixture.companyId,
        body: {},
        key: 'c8-currency-check',
      }),
    );
    expect(run.results).toContainEqual({
      code: 'CURRENCY_MATCHES_PARENT',
      status: 'WARNING',
    });
    expect(run.results).toContainEqual({
      code: 'PARENT_EXECUTED',
      status: 'PASS',
    });
    const refused = await request({
      path: commandPath + '/approve',
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'c8-currency-denied',
        },
        body: JSON.stringify({
          expectedContractRevision: 1,
          acknowledgedWarningCodes: [],
        }),
      },
    });
    expect(await json(refused)).toMatchObject({
      code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED',
    });
    const approval = record(
      await command({
        path: commandPath + '/approve',
        companyId: fixture.companyId,
        key: 'c8-currency-approve',
        body: {
          expectedContractRevision: 1,
          acknowledgedWarningCodes: ['CURRENCY_MATCHES_PARENT'],
        },
      }),
    );
    const signature = record(
      await command({
        path: commandPath + '/signature',
        companyId: fixture.companyId,
        key: 'c8-currency-sign',
        body: {
          ...signaturePayload(),
          providerSignedOn: '2026-09-28',
          clientSignedOn: '2026-09-28',
        },
      }),
    );
    expect(signature.representationChecksum).toEqual(
      approval.representationChecksum,
    );
    expect(record(record(child.version).representation).sha256).toEqual(
      approval.representationChecksum,
    );
  });
  it('C8 preserves the fixed additional entity, copies current identity and fences revoked relationships before replay', async () => {
    const fixture = await preparedOffer('-C8-ADDITIONAL');
    const currentClient = async () =>
      record(
        await json(
          await request({
            path: '/clients/' + fixture.clientId,
            companyId: fixture.companyId,
          }),
        ),
      );
    const entity = record(
      await command({
        path: '/clients/' + fixture.clientId + '/legal-entities',
        companyId: fixture.companyId,
        key: 'c8-additional-entity',
        body: {
          expectedClientVersion: numberField(await currentClient(), 'version'),
          legalName: 'Parent Additional Party',
          taxId: 'C8-ADDITIONAL',
          legalAddress: 'Additional Example Street',
        },
      }),
    );
    const entityId = stringField(record(entity.legalEntity), 'id');
    await acceptedOffer({
      suffix: '-C8-ADDITIONAL',
      prepared: fixture,
      recipient: { kind: 'ADDITIONAL', legalEntityId: entityId },
    });
    await grantContract(fixture, 'c8-additional-grant');
    await command({
      path: '/company-contract-approver-assignments',
      key: 'c8-additional-approver',
      body: {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
    });
    const base = '/contracts/opportunities/' + fixture.opportunityId;
    const parent = record(
        await json(
          await sendContract(
            fixture,
            await contractPayload(fixture),
            'c8-additional-parent',
          ),
        ),
      ),
      versionId = stringField(record(parent.version), 'id');
    await command({
      path: base + '/versions/' + versionId + '/approve',
      companyId: fixture.companyId,
      key: 'c8-additional-approve',
      body: { expectedContractRevision: 1, acknowledgedWarningCodes: [] },
    });
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'c8-additional-sign',
        )
      ).status,
    ).toBe(201);
    const patched = await request({
      path: '/clients/' + fixture.clientId + '/legal-entities/' + entityId,
      companyId: fixture.companyId,
      init: {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'c8-additional-correct',
        },
        body: JSON.stringify({
          expectedClientVersion: numberField(await currentClient(), 'version'),
          changes: { legalName: 'Current Additional Party' },
        }),
      },
    });
    expect(patched.status).toBe(200);
    const path = base + '/agreements/' + stringField(parent, 'id') + '/addenda',
      payload = {
        expectedContractRevision: 3,
        changeSummary: 'Exact additional party change',
      };
    const child = record(
      await command({
        path,
        companyId: fixture.companyId,
        key: 'c8-additional-child',
        body: payload,
      }),
    );
    expect(record(child.version).recipient).toMatchObject({
      kind: 'ADDITIONAL',
      additionalLegalEntityId: entityId,
      legalName: 'Current Additional Party',
    });
    await expect(
      pool.query('UPDATE contracts SET parent_contract_id=id WHERE id=$1', [
        child.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        "UPDATE contract_versions SET change_summary='Tampered' WHERE contract_id=$1",
        [child.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        "INSERT INTO contract_events(workspace_id,company_id,action,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,metadata) SELECT workspace_id,company_id,action,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,jsonb_set(metadata,'{addendumOrdinal}','9'::jsonb) FROM contract_events WHERE contract_id=$1 LIMIT 1",
        [child.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await pool.query(
      "UPDATE client_company_relationships SET status='archived' WHERE company_id=$1 AND client_account_id=$2",
      [fixture.companyId, fixture.clientId],
    );
    const replay = await request({
      path,
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'c8-additional-child',
        },
        body: JSON.stringify(payload),
      },
    });
    expect(replay.status).toBe(404);
    const copied = record(
      record(
        await json(
          await request({
            path: base + '/agreements/' + stringField(child, 'id'),
            companyId: fixture.companyId,
          }),
        ),
      ).contract,
    );
    expect(record(copied.version).recipient).toEqual(
      record(child.version).recipient,
    );
    const parentAgain = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    expect(record(parentAgain.version).recipient).toEqual(
      record(parent.version).recipient,
    );
  });
  it.each(['client', 'preparer'] as const)(
    'C8 denies creation when %s invalidation wins the current owner fence',
    async (fence) => {
      const { fixture, base, versionId } = await approvedSignatureFixture();
      expect(
        (
          await signatureRequest(
            fixture,
            versionId,
            signaturePayload(),
            'c8-race-parent',
          )
        ).status,
      ).toBe(201);
      const parent = record(
        record(
          await json(
            await request({ path: base, companyId: fixture.companyId }),
          ),
        ).contract,
      );
      const before = await c6Counts(),
        blocker = await pool.connect();
      let pending: Promise<Response> | undefined;
      try {
        await blocker.query('BEGIN');
        const pid = (
          await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0]?.pid;
        if (pid === undefined) throw new Error('No blocker');
        await blocker.query(
          fence === 'client'
            ? "UPDATE client_accounts SET status='archived' WHERE id=$1"
            : "UPDATE company_role_assignments SET revoked_at=now() WHERE bundle='company_contract_preparer' AND company_id=$1",
          [fence === 'client' ? fixture.clientId : fixture.companyId],
        );
        pending = request({
          path: base + '/agreements/' + stringField(parent, 'id') + '/addenda',
          companyId: fixture.companyId,
          init: {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': 'c8-race',
            },
            body: JSON.stringify({
              expectedContractRevision: 3,
              changeSummary: 'Denied at current fence',
            }),
          },
        });
        await waitForBlocker(pid);
        await blocker.query('COMMIT');
        expect((await pending).status).toBe(fence === 'client' ? 404 : 403);
        expect(await c6Counts()).toEqual(before);
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        await pending;
      }
    },
  );
  it('C8 fences tenants and exact child history, keeps old receipts before supersession and freezes execution', async () => {
    const { fixture, base, versionId } = await approvedSignatureFixture();
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'c8-history-parent',
        )
      ).status,
    ).toBe(201);
    const parent = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    const child = record(
      await command({
        path: base + '/agreements/' + stringField(parent, 'id') + '/addenda',
        companyId: fixture.companyId,
        key: 'c8-history-child',
        body: {
          expectedContractRevision: 3,
          changeSummary: 'Initial exact child',
        },
      }),
    );
    const childBase = base + '/agreements/' + stringField(child, 'id'),
      initial = stringField(record(child.version), 'id');
    const run = await command({
      path: childBase + '/versions/' + initial + '/quality-checks',
      companyId: fixture.companyId,
      key: 'c8-history-run',
      body: {},
    });
    const payload = {
      expectedContractRevision: 1,
      changeSummary: 'Revised child',
      pricingSnapshotId: fixture.snapshotId,
    };
    const revised = record(
        await command({
          path: childBase + '/versions',
          companyId: fixture.companyId,
          key: 'c8-history-version',
          body: payload,
        }),
      ),
      successor = stringField(revised, 'contractVersionId');
    expect(
      await command({
        path: childBase + '/versions',
        companyId: fixture.companyId,
        key: 'c8-history-version',
        body: payload,
      }),
    ).toEqual(revised);
    expect(
      await command({
        path: childBase + '/versions/' + initial + '/quality-checks',
        companyId: fixture.companyId,
        key: 'c8-history-run',
        body: {},
      }),
    ).toEqual(run);
    for (const action of ['quality-checks', 'approve', 'reject', 'signature']) {
      const refused = await request({
        path: childBase + '/versions/' + initial + '/' + action,
        companyId: fixture.companyId,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': 'c8-old-' + action,
          },
          body: JSON.stringify(
            action === 'quality-checks'
              ? {}
              : action === 'reject'
                ? { expectedContractRevision: 2, reason: 'Old child' }
                : action === 'signature'
                  ? signaturePayload()
                  : {
                      expectedContractRevision: 2,
                      acknowledgedWarningCodes: [],
                    },
          ),
        },
      });
      expect(await json(refused)).toMatchObject({
        code: 'CONTRACT_VERSION_SUPERSEDED',
      });
    }
    const revisedView = record(
      record(
        await json(
          await request({ path: childBase, companyId: fixture.companyId }),
        ),
      ).contract,
    );
    expect(record(revisedView.version).differences).toContainEqual({
      field: 'pricingSnapshotId',
      before: null,
      after: fixture.snapshotId,
      beforeSnapshot: null,
      afterSnapshot: {
        id: fixture.snapshotId,
        currency: 'EUR',
        total: '345.00',
      },
    });
    const other = await acceptedOffer({ suffix: 'c8-other-company' });
    await grantContract(other, 'c8-other-contract');
    for (const input of [
      { companyId: other.companyId, init: undefined },
      {
        companyId: fixture.companyId,
        init: {
          headers: {
            'x-workspace-context-id': '00000000-0000-4000-8000-000000009544',
          },
        },
      },
    ]) {
      const refused = await request({ path: childBase, ...input });
      expect([403, 404]).toContain(refused.status);
      const body = await json(refused);
      expect(body).not.toHaveProperty('contract');
      expect(body).not.toHaveProperty('parent');
      expect(body).not.toHaveProperty('addenda');
    }
    const history = record(
      await json(
        await request({
          path: childBase + '/versions?limit=1',
          companyId: fixture.companyId,
        }),
      ),
    );
    expect(history.items).toMatchObject([{ id: successor }]);
    const prior = record(
      record(
        await json(
          await request({
            path: childBase + '/versions/' + initial,
            companyId: fixture.companyId,
          }),
        ),
      ).contract,
    );
    expect(record(prior.version).representation).toEqual(
      record(child.version).representation,
    );
    const rejected = record(
      await command({
        path: childBase + '/versions/' + successor + '/reject',
        companyId: fixture.companyId,
        key: 'c8-reject-child',
        body: {
          expectedContractRevision: 2,
          reason: 'Revise this exact change',
        },
      }),
    );
    expect(rejected.kind).toBe('REJECT');
    const third = record(
        await command({
          path: childBase + '/versions',
          companyId: fixture.companyId,
          key: 'c8-after-rejection',
          body: {
            expectedContractRevision: 3,
            changeSummary: 'Fresh child after rejection',
          },
        }),
      ),
      thirdId = stringField(third, 'contractVersionId');
    await command({
      path: childBase + '/versions/' + thirdId + '/approve',
      companyId: fixture.companyId,
      key: 'c8-third-approve',
      body: { expectedContractRevision: 4, acknowledgedWarningCodes: [] },
    });
    await command({
      path: childBase + '/versions/' + thirdId + '/signature',
      companyId: fixture.companyId,
      key: 'c8-third-sign',
      body: { ...signaturePayload(), expectedContractRevision: 5 },
    });
    const frozen = await request({
      path: childBase + '/versions',
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'c8-executed-revision',
        },
        body: JSON.stringify({
          expectedContractRevision: 6,
          changeSummary: 'Frozen',
        }),
      },
    });
    expect(await json(frozen)).toMatchObject({ code: 'CONTRACT_EXECUTED' });
    expect(
      await command({
        path: childBase + '/versions',
        companyId: fixture.companyId,
        key: 'c8-history-version',
        body: payload,
      }),
    ).toEqual(revised);
  }, 20000);
  it('C6 revises an approved Contract into a fresh pending version and preserves historical representation', async () => {
    const { fixture, versionId, base } = await approvedSignatureFixture();
    const before = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    const response = await request({
      path: base + '/versions',
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'c6-first',
        },
        body: JSON.stringify({
          expectedContractRevision: 2,
          termStartsOn: '2026-10-01',
          termEndsOn: '2026-12-31',
          specialConditions: '  Revised synthetic conditions  ',
        }),
      },
    });
    expect(response.status).toBe(201);
    const result = record(await json(response));
    expect(result).toMatchObject({
      contractId: before.id,
      versionNumber: 2,
      revision: 3,
      provisional: true,
    });
    for (const changed of [
      [],
      {},
      { expectedContractRevision: null },
      { expectedContractRevision: 2, termEndsOn: 'invalid' },
    ]) {
      const conflicting = await request({
        path: base + '/versions',
        companyId: fixture.companyId,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': 'c6-first',
          },
          body: JSON.stringify(changed),
        },
      });
      expect(conflicting.status).toBe(409);
      expect(await json(conflicting)).toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
      });
    }
    const next = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    expect(next).toMatchObject({
      id: before.id,
      revision: 3,
      version: {
        versionNumber: 2,
        predecessorVersionId: versionId,
        decisionState: 'PENDING',
        executionState: 'NOT_EXECUTED',
        decision: null,
        signature: null,
        latestQualityRun: null,
        specialConditions: '  Revised synthetic conditions  ',
      },
    });
    const historic = record(
      record(
        await json(
          await request({
            path: base + '/versions/' + versionId,
            companyId: fixture.companyId,
          }),
        ),
      ).contract,
    );
    expect(record(historic.version).representation).toEqual(
      record(before.version).representation,
    );
    expect(record(historic.version).decision).toEqual(
      record(before.version).decision,
    );
    for (const mutation of [
      "UPDATE contract_versions SET special_conditions='Rewrite frozen content' WHERE id=$1",
      "UPDATE contract_versions SET superseded_at=superseded_at+interval '1 second' WHERE id=$1",
      'UPDATE contract_versions SET superseded_by_version_id=NULL,superseded_at=NULL WHERE id=$1',
      'DELETE FROM contract_versions WHERE id=$1',
    ])
      await expect(pool.query(mutation, [versionId])).rejects.toMatchObject({
        code: '23514',
      });
  });
  it.each(['PENDING', 'REJECTED'] as const)(
    'C6 revises a %s head, starts fresh checks and decisions, and replays the original result after execution',
    async (state) => {
      const target = await qualityFixture();
      const { fixture, base, versionId } = target;
      await grantApprover(fixture);
      if (state === 'REJECTED')
        expect(
          (
            await decisionRequest(
              fixture,
              versionId,
              'reject',
              { expectedContractRevision: 1, reason: '  Original rejection  ' },
              'c6-reject',
            )
          ).status,
        ).toBe(201);
      const revision = state === 'REJECTED' ? 2 : 1;
      const body = {
        expectedContractRevision: revision,
        specialConditions: '  Changed conditions\nexact  ',
      };
      const replies = await Promise.all([
        reviseRequest(target, body, 'c6-repeat'),
        reviseRequest(target, body, 'c6-repeat'),
      ]);
      expect(replies.map((reply) => reply.status)).toEqual([201, 201]);
      const result = record(await json(replies[0]));
      expect(await json(replies[1])).toEqual(result);
      const successor = stringField(result, 'contractVersionId');
      const read = record(
        record(
          await json(
            await request({ path: base, companyId: fixture.companyId }),
          ),
        ).contract,
      );
      expect(read).toMatchObject({
        revision: revision + 1,
        version: {
          id: successor,
          versionNumber: 2,
          scopeNote: record(target.created.version).scopeNote,
          pricingSnapshotId: fixture.snapshotId,
          decision: null,
          signature: null,
          latestQualityRun: null,
          differences: [
            {
              field: 'specialConditions',
              before: null,
              after: body.specialConditions,
            },
          ],
        },
      });
      const history = record(
        await json(
          await request({
            path: base + '/versions?limit=1',
            companyId: fixture.companyId,
          }),
        ),
      );
      expect(history).toMatchObject({
        items: [{ id: successor }],
        nextCursor: successor,
      });
      expect(
        await json(
          await request({
            path: base + '/versions?limit=1&cursor=' + successor,
            companyId: fixture.companyId,
          }),
        ),
      ).toMatchObject({
        items: [{ id: versionId, supersededByVersionId: successor }],
        nextCursor: null,
      });
      for (const [action, payload] of [
        [
          'approve',
          {
            expectedContractRevision: revision + 1,
            acknowledgedWarningCodes: [],
          },
        ],
        [
          'reject',
          { expectedContractRevision: revision + 1, reason: 'Too late' },
        ],
        [
          'signature',
          { ...signaturePayload(), expectedContractRevision: revision + 1 },
        ],
      ] as const) {
        const refused = await decisionRequest(
          fixture,
          versionId,
          action,
          payload,
          'c6-old-' + action,
        );
        expect(refused.status).toBe(409);
        expect(await json(refused)).toMatchObject({
          code: 'CONTRACT_VERSION_SUPERSEDED',
        });
      }
      expect(
        await json(
          await request({
            path: base + '/versions/' + versionId + '/quality-checks',
            companyId: fixture.companyId,
            init: {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'idempotency-key': 'c6-old-check',
              },
              body: '{}',
            },
          }),
        ),
      ).toMatchObject({ code: 'CONTRACT_VERSION_SUPERSEDED' });
      const run = record(
        await command({
          path: base + '/versions/' + successor + '/quality-checks',
          companyId: fixture.companyId,
          body: {},
          key: 'c6-new-check',
        }),
      );
      expect(run.contractVersionId).toBe(successor);
      expect(
        (
          await decisionRequest(
            fixture,
            successor,
            'approve',
            {
              expectedContractRevision: revision + 1,
              acknowledgedWarningCodes: ['ADDED_CONDITIONS_CONFIRMED'],
            },
            'c6-new-approve',
          )
        ).status,
      ).toBe(201);
      expect(
        (
          await signatureRequest(
            fixture,
            successor,
            { ...signaturePayload(), expectedContractRevision: revision + 2 },
            'c6-new-sign',
          )
        ).status,
      ).toBe(201);
      expect(
        await json(await reviseRequest(target, body, 'c6-repeat')),
      ).toEqual(result);
      expect(
        await json(
          await reviseRequest(
            target,
            { ...body, specialConditions: 'Changed intent' },
            'c6-repeat',
          ),
        ),
      ).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      expect(
        await json(
          await reviseRequest(
            target,
            { expectedContractRevision: revision + 3 },
            'c6-after-sign',
          ),
        ),
      ).toMatchObject({ code: 'CONTRACT_EXECUTED' });
      expect(await c6Counts()).toMatchObject({
        versions: '2',
        receipts: '1',
        events: '2',
        revision: revision + 3,
      });
      if (state === 'REJECTED')
        expect(
          record(
            record(
              await json(
                await request({
                  path: base + '/versions/' + versionId,
                  companyId: fixture.companyId,
                }),
              ),
            ).contract,
          ).version,
        ).toMatchObject({ decision: { reason: '  Original rejection  ' } });
      await grantLinkProject(fixture);
      expect(
        (
          await request({
            path: base + '/projects/create',
            companyId: fixture.companyId,
            init: {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'idempotency-key': 'c6-create-project',
              },
              body: JSON.stringify({
                title: 'Project after revised signature',
                acknowledgedCandidateProjectIds: [],
                expectedContractRevision: revision + 3,
              }),
            },
          })
        ).status,
      ).toBe(201);
    },
  );
  it('C6 refreshes Client identity, recopies fixed source without Offer authority, and preserves old representation bytes', async () => {
    const target = await qualityFixture();
    const { fixture, base, created, versionId } = target;
    const client = record(
      await json(
        await request({
          path: '/clients/' + fixture.clientId,
          companyId: fixture.companyId,
        }),
      ),
    );
    expect(
      (
        await request({
          path: '/clients/' + fixture.clientId,
          companyId: fixture.companyId,
          init: {
            method: 'PATCH',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': 'c6-correct',
            },
            body: JSON.stringify({
              expectedVersion: numberField(client, 'version'),
              displayName: 'Current corrected legal name',
            }),
          },
        })
      ).status,
    ).toBe(200);
    for (const route of ['company-offer-preparer', 'company-pricing-user'])
      await request({
        path:
          '/' +
          route +
          '-assignments/' +
          fixture.actorMembershipId +
          '/' +
          fixture.companyId,
        init: {
          method: 'DELETE',
          headers: { 'idempotency-key': 'c6-revoke-' + route },
        },
      });
    const revised = await reviseRequest(
      target,
      { expectedContractRevision: 1 },
      'c6-refresh',
    );
    expect(revised.status).toBe(201);
    const next = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    expect(next.version).toMatchObject({
      recipient: { legalName: 'Current corrected legal name' },
      differences: [
        {
          field: 'recipientLegalName',
          before: record(record(created.version).recipient).legalName,
          after: 'Current corrected legal name',
        },
      ],
      scopeNote: record(created.version).scopeNote,
      commercialConditions: record(created.version).commercialConditions,
      pricingSnapshotId: fixture.snapshotId,
    });
    const old = record(
      record(
        await json(
          await request({
            path: base + '/versions/' + versionId,
            companyId: fixture.companyId,
          }),
        ),
      ).contract,
    );
    expect(record(old.version).representation).toEqual(
      record(created.version).representation,
    );
    expect(
      (
        await request({
          path: base + '/versions?limit=51',
          companyId: fixture.companyId,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request({
          path: base + '/versions?cursor=not-a-uuid',
          companyId: fixture.companyId,
        })
      ).status,
    ).toBe(400);
  });
  it.each(['new', 'approve', 'reject', 'signature'] as const)(
    'C9 controls new-version versus %s in both winning orders',
    async (other) => {
      for (const revisionFirst of [true, false]) {
        // Each ordering has an independent persisted Contract and Client fence.
        if (!revisionFirst)
          await pool.query(
            'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
          );
        const target = await directFixture(other === 'signature');
        const { fixture, versionId } = target;
        await grantApprover(fixture);
        const revision = other === 'signature' ? 2 : 1;
        const revise = () =>
          reviseRequest(
            target,
            {
              expectedContractRevision: revision,
              specialConditions: 'Race revision',
              pricingSnapshotId: fixture.snapshotId,
              scopeNote: 'Direct revision',
            },
            'c9-version-race-new-' + revisionFirst,
          );
        const competitor = () =>
          other === 'new'
            ? reviseRequest(
                target,
                {
                  expectedContractRevision: revision,
                  specialConditions: 'Competing revision',
                  pricingSnapshotId: fixture.snapshotId,
                  scopeNote: 'Other direct revision',
                },
                'c9-version-race-other-' + revisionFirst,
              )
            : decisionRequest(
                fixture,
                versionId,
                other,
                other === 'approve'
                  ? {
                      expectedContractRevision: revision,
                      acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'],
                    }
                  : other === 'reject'
                    ? {
                        expectedContractRevision: revision,
                        reason: 'Race rejection',
                      }
                    : {
                        ...signaturePayload(),
                        expectedContractRevision: revision,
                      },
                'c9-version-race-other-' + revisionFirst,
              );
        const blocker = await pool.connect();
        let first: Promise<Response> | undefined,
          second: Promise<Response> | undefined;
        try {
          await blocker.query('BEGIN');
          const pid = (
            await blocker.query<{ pid: number }>(
              'SELECT pg_backend_pid() AS pid',
            )
          ).rows[0]?.pid;
          if (pid === undefined) throw new Error('No blocker');
          await blocker.query(
            'SELECT id FROM contracts WHERE opportunity_id=$1 FOR UPDATE',
            [fixture.opportunityId],
          );
          first = (revisionFirst ? revise : competitor)();
          const firstPid = await waitForBlocker(pid);
          second = (revisionFirst ? competitor : revise)();
          await waitForBlocker(firstPid, pid);
          await blocker.query('COMMIT');
          expect((await first).status).toBe(201);
          expect((await second).status).toBe(409);
          expect(await json(await second)).toMatchObject({
            code:
              revisionFirst && other !== 'new'
                ? 'CONTRACT_VERSION_SUPERSEDED'
                : 'STALE_CONTRACT_REVISION',
          });
        } finally {
          await blocker.query('ROLLBACK');
          blocker.release();
          await Promise.allSettled(
            [first, second].filter((item) => item !== undefined),
          );
        }
      }
    },
  );
  it.each(
    (['new', 'approve', 'reject', 'signature'] as const).flatMap((other) => [
      { other, revisionFirst: true, firstCommand: 'new-version' },
      { other, revisionFirst: false, firstCommand: 'other' },
    ]),
  )(
    'C6 controls new-version versus $other with $firstCommand committing first',
    async ({ other, revisionFirst }) => {
      // Each ordering has an independent persisted Contract and Client fence.
      const target =
        other === 'signature'
          ? await approvedSignatureFixture()
          : await qualityFixture();
      const { fixture, versionId } = target;
      await grantApprover(fixture);
      const revision = other === 'signature' ? 2 : 1;
      const revise = () =>
        reviseRequest(
          target,
          {
            expectedContractRevision: revision,
            specialConditions: 'Race revision',
          },
          'c6-race-new-' + revisionFirst,
        );
      const competitor = () =>
        other === 'new'
          ? reviseRequest(
              target,
              {
                expectedContractRevision: revision,
                specialConditions: 'Competing revision',
              },
              'c6-race-other-' + revisionFirst,
            )
          : decisionRequest(
              fixture,
              versionId,
              other,
              other === 'approve'
                ? {
                    expectedContractRevision: revision,
                    acknowledgedWarningCodes: [],
                  }
                : other === 'reject'
                  ? {
                      expectedContractRevision: revision,
                      reason: 'Race rejection',
                    }
                  : {
                      ...signaturePayload(),
                      expectedContractRevision: revision,
                    },
              'c6-race-other-' + revisionFirst,
            );
      const blocker = await pool.connect();
      let first: Promise<Response> | undefined,
        second: Promise<Response> | undefined;
      try {
        await blocker.query('BEGIN');
        const pid = (
          await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0]?.pid;
        if (pid === undefined) throw new Error('No blocker');
        await blocker.query(
          'SELECT id FROM contracts WHERE opportunity_id=$1 FOR UPDATE',
          [fixture.opportunityId],
        );
        first = (revisionFirst ? revise : competitor)();
        const firstPid = await waitForBlocker(pid);
        second = (revisionFirst ? competitor : revise)();
        await waitForBlocker(firstPid, pid);
        await blocker.query('COMMIT');
        expect((await first).status).toBe(201);
        expect((await second).status).toBe(409);
        expect(await json(await second)).toMatchObject({
          code:
            revisionFirst && other !== 'new'
              ? 'CONTRACT_VERSION_SUPERSEDED'
              : 'STALE_CONTRACT_REVISION',
        });
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        await Promise.allSettled(
          [first, second].filter((item) => item !== undefined),
        );
      }
    },
  );
  it.each(['client', 'preparer'] as const)(
    'C6 denies when %s invalidation wins its current owner fence',
    async (fence) => {
      const target = await qualityFixture();
      const { fixture } = target;
      const before = await c6Counts();
      const blocker = await pool.connect();
      let pending: Promise<Response> | undefined;
      try {
        await blocker.query('BEGIN');
        const pid = (
          await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0]?.pid;
        if (pid === undefined) throw new Error('No blocker');
        await blocker.query(
          fence === 'client'
            ? "UPDATE client_accounts SET status='archived' WHERE id=$1"
            : "UPDATE company_role_assignments SET revoked_at=now() WHERE bundle='company_contract_preparer' AND company_id=$1",
          [fence === 'client' ? fixture.clientId : fixture.companyId],
        );
        pending = reviseRequest(
          target,
          { expectedContractRevision: 1 },
          'c6-fence',
        );
        await waitForBlocker(pid);
        await blocker.query('COMMIT');
        expect((await pending).status).toBe(fence === 'client' ? 404 : 403);
        expect(await c6Counts()).toEqual(before);
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        await pending;
      }
    },
  );
  it.each(['contract_commands', 'contract_events'] as const)(
    'C6 rolls back every new-version effect when %s writing fails',
    async (table) => {
      const target = await qualityFixture();
      const before = await c6Counts();
      await pool.query(
        `CREATE FUNCTION fail_c6_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic failure'; END; $$; CREATE TRIGGER fail_c6_write BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_c6_write()`,
      );
      try {
        const failed = await reviseRequest(
          target,
          { expectedContractRevision: 1 },
          'c6-rollback',
        );
        expect(failed.status).toBe(500);
        expect(await json(failed)).toMatchObject({
          code: 'CONTRACT_VERSION_UNCERTAIN',
        });
        expect(await c6Counts()).toEqual(before);
        expect(
          (
            await pool.query(
              'SELECT superseded_by_version_id FROM contract_versions',
            )
          ).rows,
        ).toEqual([{ superseded_by_version_id: null }]);
      } finally {
        await pool.query(
          `DROP TRIGGER fail_c6_write ON ${table};DROP FUNCTION fail_c6_write()`,
        );
      }
      expect(
        (
          await reviseRequest(
            target,
            { expectedContractRevision: 1 },
            'c6-rollback',
          )
        ).status,
      ).toBe(201);
    },
  );
  it('C6 rejects editable source fields, invalid terms, missing keys/revisions and stale commands without effects', async () => {
    const target = await qualityFixture();
    const before = await c6Counts();
    for (const payload of [
      {},
      { expectedContractRevision: 0 },
      { expectedContractRevision: 1, scopeNote: 'Editable source' },
      {
        expectedContractRevision: 1,
        pricingSnapshotId: target.fixture.snapshotId,
      },
      { expectedContractRevision: 1, acceptedOfferVersionId: 'changed' },
      { expectedContractRevision: 1, termStartsOn: '2026-02-30' },
      {
        expectedContractRevision: 1,
        termStartsOn: '2026-12-01',
        termEndsOn: '2026-01-01',
      },
      { expectedContractRevision: 1, specialConditions: 'x'.repeat(4001) },
    ])
      expect((await reviseRequest(target, payload, 'c6-invalid')).status).toBe(
        400,
      );
    expect(
      (await reviseRequest(target, { expectedContractRevision: 1 }, '')).status,
    ).toBe(400);
    expect(
      await json(
        await reviseRequest(
          target,
          { expectedContractRevision: 2 },
          'c6-stale',
        ),
      ),
    ).toMatchObject({ code: 'STALE_CONTRACT_REVISION' });
    expect(await c6Counts()).toEqual(before);
  });
  it('C6 replays initial Contract CREATE with its recorded version after a successor and denies revoked replay', async () => {
    const fixture = await acceptedOffer();
    await grantContract(fixture, 'c6-create-replay-grant');
    const payload = {
      ...(await contractPayload(fixture)),
      termStartsOn: '2026-10-01',
      termEndsOn: '2026-12-31',
      specialConditions: 'Original CREATE conditions',
    };
    const initialResponse = await sendContract(
      fixture,
      payload,
      'c6-initial-create',
    );
    expect(initialResponse.status).toBe(201);
    const initial = record(await json(initialResponse));
    const originalVersion = record(initial.version);
    const revisedResponse = await reviseRequest(
      { fixture },
      {
        expectedContractRevision: 1,
        termStartsOn: '2027-01-01',
        specialConditions: 'Successor conditions',
      },
      'c6-create-successor',
    );
    expect(revisedResponse.status).toBe(201);
    const successor = record(await json(revisedResponse));
    const beforeReplay = await c6Counts();
    const replay = await sendContract(fixture, payload, 'c6-initial-create');
    expect(replay.status).toBe(201);
    const recorded = record(await json(replay));
    expect(recorded.id).toBe(initial.id);
    expect(recorded.version).toMatchObject({
      id: originalVersion.id,
      versionNumber: 1,
      termStartsOn: payload.termStartsOn,
      termEndsOn: payload.termEndsOn,
      specialConditions: payload.specialConditions,
      supersededByVersionId: successor.contractVersionId,
      representation: originalVersion.representation,
    });
    expect(await c6Counts()).toEqual(beforeReplay);
    await pool.query(
      "UPDATE company_role_assignments SET revoked_at=now() WHERE bundle='company_contract_preparer' AND company_id=$1",
      [fixture.companyId],
    );
    expect(
      (await sendContract(fixture, payload, 'c6-initial-create')).status,
    ).toBe(403);
    expect(await c6Counts()).toEqual(beforeReplay);
  });
  it('C6 replays the original creation after later heads and reauthorizes before every replay', async () => {
    const target = await qualityFixture();
    const { fixture } = target;
    const original = {
      expectedContractRevision: 1,
      specialConditions: 'Original immutable result',
    };
    const first = await reviseRequest(target, original, 'c6-original');
    expect(first.status).toBe(201);
    const recorded = await json(first);
    expect(
      (await reviseRequest(target, { expectedContractRevision: 2 }, 'c6-third'))
        .status,
    ).toBe(201);
    expect(
      await json(await reviseRequest(target, original, 'c6-original')),
    ).toEqual(recorded);
    const before = await c6Counts();
    await pool.query(
      "UPDATE company_role_assignments SET revoked_at=now() WHERE bundle='company_contract_preparer' AND company_id=$1",
      [fixture.companyId],
    );
    expect((await reviseRequest(target, original, 'c6-original')).status).toBe(
      403,
    );
    expect(await c6Counts()).toEqual(before);
    await grantContract(fixture, 'c6-reauthorize');
    await pool.query(
      "UPDATE client_accounts SET status='archived' WHERE id=$1",
      [fixture.clientId],
    );
    expect((await reviseRequest(target, original, 'c6-original')).status).toBe(
      404,
    );
    expect(await c6Counts()).toEqual(before);
  });
  it('C6 rejects unknown Contract bundle versions before receipt lookup without side effects', async () => {
    const target = await qualityFixture();
    const body = { expectedContractRevision: 1 };
    expect((await reviseRequest(target, body, 'c6-bundle')).status).toBe(201);
    const before = await c6Counts();
    const constraint = (
      await pool.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
      )
    ).rows[0];
    if (!constraint) throw new Error('Missing captured version constraint');
    await pool.query(
      'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
    );
    try {
      for (const version of [null, 'v2', 'V1']) {
        await pool.query(
          "UPDATE company_role_assignments SET permission_set_version=$1 WHERE bundle='company_contract_preparer' AND company_id=$2",
          [version, target.fixture.companyId],
        );
        expect((await reviseRequest(target, body, 'c6-bundle')).status).toBe(
          403,
        );
        expect(await c6Counts()).toEqual(before);
      }
    } finally {
      await pool.query(
        "UPDATE company_role_assignments SET permission_set_version='v1' WHERE bundle='company_contract_preparer' AND company_id=$1",
        [target.fixture.companyId],
      );
      await pool.query(
        'ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ' +
          constraint.definition,
      );
    }
  });
  it.each(['membership', 'opportunity'] as const)(
    'C6 refuses recorded replay after current %s access is lost',
    async (boundary) => {
      const target = await qualityFixture();
      const payload = { expectedContractRevision: 1 };
      expect((await reviseRequest(target, payload, 'c6-boundary')).status).toBe(
        201,
      );
      const before = await c6Counts();
      if (boundary === 'membership')
        await pool.query(
          "UPDATE workspace_memberships SET status='inactive' WHERE id=$1",
          [target.fixture.actorMembershipId],
        );
      else
        expect(
          (
            await request({
              path:
                '/company-commercial-intake-assignments/' +
                target.fixture.actorMembershipId +
                '/' +
                target.fixture.companyId,
              init: {
                method: 'DELETE',
                headers: { 'idempotency-key': 'c6-revoke-opportunity' },
              },
            })
          ).status,
        ).toBe(200);
      const refused = await reviseRequest(target, payload, 'c6-boundary');
      expect([401, 403]).toContain(refused.status);
      expect(await json(refused)).not.toHaveProperty('contractVersionId');
      expect(await c6Counts()).toEqual(before);
    },
  );
  it('C6 hides foreign Company and Workspace targets and unknown Opportunities without effects', async () => {
    const target = await qualityFixture();
    const other = await acceptedOffer({ suffix: 'c6-other-scope' });
    await grantContract(other, 'c6-other-grant');
    const before = await c6Counts();
    const inputs: Array<{
      opportunityId: string;
      companyId: string;
      headers: Record<string, string>;
    }> = [
      {
        opportunityId: target.fixture.opportunityId,
        companyId: other.companyId,
        headers: {},
      },
      {
        opportunityId: target.fixture.opportunityId,
        companyId: target.fixture.companyId,
        headers: {
          'x-workspace-context-id': '00000000-0000-4000-8000-000000000999',
        },
      },
      {
        opportunityId: '00000000-0000-4000-8000-000000000999',
        companyId: target.fixture.companyId,
        headers: {},
      },
    ];
    for (const input of inputs) {
      const refused = await request({
        path: '/contracts/opportunities/' + input.opportunityId + '/versions',
        companyId: input.companyId,
        init: {
          method: 'POST',
          headers: {
            ...input.headers,
            'content-type': 'application/json',
            'idempotency-key': 'c6-scope',
          },
          body: JSON.stringify({ expectedContractRevision: 1 }),
        },
      });
      expect([403, 404]).toContain(refused.status);
      expect(await json(refused)).not.toHaveProperty('contractVersionId');
      expect(await c6Counts()).toEqual(before);
    }
  });
  function reviseRequest(
    target: { fixture: PreparedOffer },
    body: unknown,
    key: string,
  ) {
    return request({
      path:
        '/contracts/opportunities/' +
        target.fixture.opportunityId +
        '/versions',
      companyId: target.fixture.companyId,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify(body),
      },
    });
  }
  async function c6Counts() {
    return (
      await pool.query(
        "SELECT (SELECT count(*) FROM contract_versions)::text AS versions,(SELECT count(*) FROM contract_commands WHERE kind='CREATE_VERSION')::text AS receipts,(SELECT count(*) FROM contract_events WHERE action='contract_version.created')::text AS events,(SELECT revision FROM contracts ORDER BY created_at DESC LIMIT 1) AS revision,(SELECT jsonb_agg(jsonb_build_object('id',id,'version',version,'updatedAt',updated_at) ORDER BY id) FROM client_accounts) AS clients",
      )
    ).rows[0];
  }
  it('creates and links one preparatory Project from an acknowledged executed Contract without changing signed evidence', async () => {
    const { fixture, versionId, base } = await approvedSignatureFixture();
    await signatureRequest(
      fixture,
      versionId,
      signaturePayload(),
      'cp2-signature',
    );
    await grantLinkProject(fixture);
    const before = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    const payload = {
      title: '  Synthetic Contract Project  ',
      acknowledgedCandidateProjectIds: [],
      expectedContractRevision: 3,
    };
    const result = record(
      await command({
        path: base + '/projects/create',
        companyId: fixture.companyId,
        body: payload,
        key: 'cp2-create',
      }),
    );
    const link = record(result.link),
      project = record(result.project);
    expect(project).toMatchObject({
      title: 'Synthetic Contract Project',
      status: 'preparatory',
      companyId: fixture.companyId,
      clientAccountId: fixture.clientId,
    });
    expect(link).toMatchObject({
      projectId: project.id,
      contractId: before.id,
      revision: 4,
      created: true,
    });
    const reopened = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    expect(reopened).toMatchObject({
      revision: 4,
      linkedProjects: [{ ...project, link }],
    });
    expect(reopened.version).toEqual(before.version);
    expect(
      await command({
        path: base + '/projects/create',
        companyId: fixture.companyId,
        body: payload,
        key: 'cp2-create',
      }),
    ).toEqual(result);
    expect(
      await json(
        await request({
          path: '/contracts/projects/' + stringField(project, 'id'),
          companyId: fixture.companyId,
        }),
      ),
    ).toMatchObject({ items: [{ id: before.id }] });
    expect(
      (
        await pool.query(
          "SELECT (SELECT count(*) FROM projects)::text AS projects,(SELECT count(*) FROM contract_project_links)::text AS links,(SELECT count(*) FROM project_creation_events)::text AS projects_events,(SELECT count(*) FROM contract_events WHERE action='contract_project.linked' AND metadata->'created'='true'::jsonb)::text AS links_events",
        )
      ).rows[0],
    ).toEqual({
      projects: '1',
      links: '1',
      projects_events: '1',
      links_events: '1',
    });
  });
  it('requires the complete current candidate set including linked Projects and normalizes exact creation replay', async () => {
    const target = await projectLinkFixture();
    const { fixture, projectId, base } = target;
    const payload = {
      title: '  Deliberate additional Project  ',
      acknowledgedCandidateProjectIds: [],
      expectedContractRevision: 3,
    };
    expect(
      await json(await createProjectRequest(target, payload, 'cp2-changed')),
    ).toMatchObject({ code: 'PROJECT_CANDIDATES_CHANGED' });
    await linkRequest(
      target,
      { projectId, expectedContractRevision: 3 },
      'cp2-existing-link',
    );
    const acknowledged = {
      ...payload,
      acknowledgedCandidateProjectIds: [projectId],
      expectedContractRevision: 4,
    };
    const created = record(
      await json(
        await createProjectRequest(target, acknowledged, 'cp2-acknowledged'),
      ),
    );
    expect(record(created.link)).toMatchObject({ revision: 5, created: true });
    const createdId = stringField(record(created.project), 'id');
    await closeLinkProject(target, createdId);
    expect(
      await json(
        await createProjectRequest(
          target,
          { ...acknowledged, title: 'Deliberate additional Project' },
          'cp2-acknowledged',
        ),
      ),
    ).toEqual(created);
    expect(
      await json(
        await createProjectRequest(
          target,
          { ...acknowledged, title: 'Different Project' },
          'cp2-acknowledged',
        ),
      ),
    ).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(
      await json(
        await createProjectRequest(target, acknowledged, 'cp2-new-stale'),
      ),
    ).toMatchObject({ code: 'STALE_CONTRACT_REVISION' });
    const counts = (
      await pool.query(
        "SELECT (SELECT count(*) FROM projects)::text AS projects,(SELECT count(*) FROM project_creation_events)::text AS events,(SELECT count(*) FROM contract_commands WHERE kind='CREATE_PROJECT')::text AS receipts",
      )
    ).rows[0];
    expect(counts).toEqual({ projects: '2', events: '2', receipts: '1' });
    expect(
      record(
        record(
          await json(
            await request({ path: base, companyId: fixture.companyId }),
          ),
        ).contract,
      ).revision,
    ).toBe(5);
  });
  it.each(['project_creation_events', 'contract_events', 'contract_commands'])(
    'rolls back every CP2 write and Client fence when the real %s write fails',
    async (table) => {
      const target = await projectCreationFixture();
      const before = await creationCounts(target.fixture.clientId);
      await pool.query(
        `CREATE FUNCTION fail_cp2_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic atomic rollback'; END; $$; CREATE TRIGGER fail_cp2_write BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_cp2_write()`,
      );
      try {
        const failed = await createProjectRequest(
          target,
          creationPayload(),
          'cp2-atomic',
        );
        expect(failed.status).toBe(500);
        expect(await json(failed)).toMatchObject({
          code: 'CONTRACT_PROJECT_CREATE_UNCERTAIN',
        });
        expect(await creationCounts(target.fixture.clientId)).toEqual(before);
      } finally {
        await pool.query(
          `DROP TRIGGER fail_cp2_write ON ${table}; DROP FUNCTION fail_cp2_write()`,
        );
      }
      expect(
        (await createProjectRequest(target, creationPayload(), 'cp2-atomic'))
          .status,
      ).toBe(201);
      expect(await creationCounts(target.fixture.clientId)).toMatchObject({
        projects: '1',
        links: '1',
        events: '1',
        receipts: '1',
        revision: 4,
        clientVersion: before.clientVersion + 1,
      });
    },
  );
  it.each([
    'company-contract-preparer-assignments',
    'company-project-assignments',
    'company-director-client-assignments',
    'company-commercial-intake-assignments',
  ])(
    'denies CP2 creation replay after independent %s revocation without side effects',
    async (route) => {
      const target = await projectCreationFixture();
      const headers = memberHeaders('contract-reader');
      const member = record(
        await json(
          await request({ path: '/access/current-actor', init: { headers } }),
        ),
      );
      const membershipId = stringField(member, 'workspaceMembershipId');
      for (const assignment of [
        'company-project-assignments',
        'company-commercial-intake-assignments',
        'company-contract-preparer-assignments',
        'company-director-client-assignments',
      ])
        await command({
          path: '/' + assignment,
          body: {
            workspaceMembershipId: membershipId,
            companyId: target.fixture.companyId,
          },
          key: 'cp2-reader-' + assignment,
        });
      expect(
        (
          await createProjectRequest(
            target,
            creationPayload(),
            'cp2-authority',
            headers,
          )
        ).status,
      ).toBe(201);
      const before = await creationCounts(target.fixture.clientId);
      expect(
        (
          await request({
            path:
              '/' + route + '/' + membershipId + '/' + target.fixture.companyId,
            init: {
              method: 'DELETE',
              headers: { 'idempotency-key': 'cp2-revoke' },
            },
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await createProjectRequest(
            target,
            creationPayload(),
            'cp2-authority',
            headers,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await createProjectRequest(
            target,
            { ...creationPayload(), expectedContractRevision: 4 },
            'cp2-denied-new',
            headers,
          )
        ).status,
      ).toBe(403);
      expect(await creationCounts(target.fixture.clientId)).toEqual(before);
    },
  );
  it('rejects invalid titles, candidate sets, unsupported Project grants and unexecuted CP2 creation safely', async () => {
    const target = await projectCreationFixture();
    const before = await creationCounts(target.fixture.clientId);
    for (const body of [
      { ...creationPayload(), title: '' },
      { ...creationPayload(), title: 'x'.repeat(201) },
      { ...creationPayload(), title: 42 },
      { ...creationPayload(), acknowledgedCandidateProjectIds: ['invalid'] },
      {
        ...creationPayload(),
        acknowledgedCandidateProjectIds: [
          target.fixture.clientId,
          target.fixture.clientId,
        ],
      },
      { ...creationPayload(), acknowledgedCandidateProjectIds: undefined },
      { ...creationPayload(), extra: true },
    ])
      expect(
        (await createProjectRequest(target, body, 'cp2-invalid')).status,
      ).toBe(400);
    const definition = (
      await pool.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
      )
    ).rows[0]?.definition;
    if (!definition) throw new Error('Missing captured-version constraint');
    await pool.query(
      'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
    );
    try {
      await pool.query(
        "UPDATE company_role_assignments SET permission_set_version='unknown' WHERE bundle='company_project_access'",
      );
      expect(
        (await createProjectRequest(target, creationPayload(), 'cp2-unknown'))
          .status,
      ).toBe(403);
    } finally {
      await pool.query(
        "UPDATE company_role_assignments SET permission_set_version='v1' WHERE bundle='company_project_access'",
      );
      await pool.query(
        'ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ' +
          definition,
      );
    }
    expect(await creationCounts(target.fixture.clientId)).toEqual(before);
  });
  it('revalidates CP2 captured Project versions and rejects foreign replay contexts without returning a result', async () => {
    const target = await projectCreationFixture();
    const created = await createProjectRequest(
      target,
      creationPayload(),
      'cp2-context',
    );
    expect(created.status).toBe(201);
    const before = await creationCounts(target.fixture.clientId);
    const definition = (
      await pool.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
      )
    ).rows[0]?.definition;
    if (!definition) throw new Error('Missing captured-version constraint');
    await pool.query(
      'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
    );
    try {
      for (const version of [null, 'v999']) {
        await pool.query(
          "UPDATE company_role_assignments SET permission_set_version=$1 WHERE bundle='company_project_access'",
          [version],
        );
        expect(
          (await createProjectRequest(target, creationPayload(), 'cp2-context'))
            .status,
        ).toBe(403);
      }
    } finally {
      await pool.query(
        "UPDATE company_role_assignments SET permission_set_version='v2' WHERE bundle='company_project_access'",
      );
      await pool.query(
        'ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ' +
          definition,
      );
    }
    expect(
      (
        await createProjectRequest(target, creationPayload(), 'cp2-context', {
          'x-workspace-context-id': '00000000-0000-4000-8000-000000000999',
        })
      ).status,
    ).toBe(403);
    const foreign = await preparedOffer('cp2-foreign-replay');
    await grantContract(foreign, 'cp2-foreign-grant');
    expect(
      (
        await request({
          path: target.base + '/projects/create',
          companyId: foreign.companyId,
          init: {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': 'cp2-context',
            },
            body: JSON.stringify(creationPayload()),
          },
        })
      ).status,
    ).toBe(404);
    expect(await creationCounts(target.fixture.clientId)).toMatchObject({
      links: before.links,
      receipts: before.receipts,
      projects: before.projects,
      events: before.events,
      clientVersion: before.clientVersion,
    });
  });
  it.each([
    'appearance',
    'two-creates',
    'same-command',
    'link',
    'create-before-link',
    'closure',
  ])(
    'serializes CP2 %s before the current-candidate decision through the real Client fence',
    async (ordering) => {
      const target =
        ordering === 'link' ||
        ordering === 'closure' ||
        ordering === 'create-before-link'
          ? await projectLinkFixture()
          : await projectCreationFixture();
      const projectId =
        'projectId' in target && typeof target.projectId === 'string'
          ? target.projectId
          : undefined;
      if (ordering === 'closure')
        await command({
          path: '/company-project-approver-assignments',
          body: {
            workspaceMembershipId: target.fixture.actorMembershipId,
            companyId: target.fixture.companyId,
          },
          key: 'cp2-closure-grant',
        });
      const blocker = await pool.connect();
      let first: Promise<Response> | undefined,
        second: Promise<Response> | undefined;
      try {
        await blocker.query('BEGIN');
        const pid = (
          await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0]?.pid;
        if (!pid) throw new Error('Missing blocker PID');
        await blocker.query(
          'SELECT id FROM client_accounts WHERE id=$1 FOR UPDATE',
          [target.fixture.clientId],
        );
        if (ordering === 'appearance')
          first = request({
            path: '/projects',
            companyId: target.fixture.companyId,
            init: {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'idempotency-key': 'cp2-intervening',
              },
              body: JSON.stringify({
                title: 'Intervening candidate',
                clientAccountId: target.fixture.clientId,
              }),
            },
          });
        else if (
          ordering === 'two-creates' ||
          ordering === 'same-command' ||
          ordering === 'create-before-link'
        )
          first = createProjectRequest(
            target,
            creationPayload(projectId ? [projectId] : []),
            'cp2-first',
          );
        else if (ordering === 'link' && projectId)
          first = linkRequest(
            target,
            { projectId, expectedContractRevision: 3 },
            'cp2-first-link',
          );
        else if (projectId) first = closeLinkProject(target, projectId, false);
        else throw new Error('Missing controlled ordering');
        const firstPid = await waitForBlocker(pid);
        second =
          ordering === 'create-before-link' && projectId
            ? linkRequest(
                target,
                { projectId, expectedContractRevision: 3 },
                'cp2-second-link',
              )
            : createProjectRequest(
                target,
                creationPayload(projectId ? [projectId] : []),
                ordering === 'same-command' ? 'cp2-first' : 'cp2-second',
              );
        await waitForBlocker(pid, firstPid);
        await blocker.query('COMMIT');
        expect((await first).status).toBe(ordering === 'closure' ? 200 : 201);
        const rejected = await second;
        if (ordering === 'same-command') {
          expect(rejected.status).toBe(201);
          expect(await json(rejected)).toMatchObject({
            link: { created: true, revision: 4 },
          });
        } else {
          expect(rejected.status).toBe(409);
          expect(await json(rejected)).toMatchObject({
            code:
              ordering === 'appearance' || ordering === 'closure'
                ? 'PROJECT_CANDIDATES_CHANGED'
                : 'STALE_CONTRACT_REVISION',
          });
        }
        expect((await creationCounts(target.fixture.clientId)).receipts).toBe(
          ordering === 'two-creates' ||
            ordering === 'same-command' ||
            ordering === 'create-before-link'
            ? '1'
            : '0',
        );
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        await Promise.allSettled([
          ...(first ? [first] : []),
          ...(second ? [second] : []),
        ]);
      }
    },
  );
  it('refuses CP2 after relevant Client invalidation commits at its held identity fence', async () => {
    const target = await projectCreationFixture(),
      blocker = await pool.connect();
    let pending: Promise<Response> | undefined;
    const before = await creationCounts(target.fixture.clientId);
    try {
      await blocker.query('BEGIN');
      const pid = (
        await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]?.pid;
      if (!pid) throw new Error('Missing blocker PID');
      await blocker.query(
        'SELECT id FROM client_accounts WHERE id=$1 FOR UPDATE',
        [target.fixture.clientId],
      );
      pending = createProjectRequest(
        target,
        creationPayload(),
        'cp2-client-invalidated',
      );
      await waitForBlocker(pid);
      await blocker.query(
        "UPDATE client_accounts SET status='archived' WHERE id=$1",
        [target.fixture.clientId],
      );
      await blocker.query('COMMIT');
      expect((await pending).status).toBe(404);
      expect(await creationCounts(target.fixture.clientId)).toEqual(before);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      if (pending) await Promise.allSettled([pending]);
    }
  });
  it('denies CP2 when Project revocation wins before locked authority and denies replay after a serialized revocation', async () => {
    const target = await projectCreationFixture(),
      blocker = await pool.connect();
    let revoked: Promise<Response> | undefined,
      pending: Promise<Response> | undefined;
    const before = await creationCounts(target.fixture.clientId);
    try {
      await blocker.query('BEGIN');
      const pid = (
        await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]?.pid;
      if (!pid) throw new Error('Missing blocker PID');
      await blocker.query(
        "SELECT id FROM company_role_assignments WHERE bundle='company_project_access' AND company_id=$1 FOR UPDATE",
        [target.fixture.companyId],
      );
      revoked = request({
        path:
          '/company-project-assignments/' +
          target.fixture.actorMembershipId +
          '/' +
          target.fixture.companyId,
        init: {
          method: 'DELETE',
          headers: { 'idempotency-key': 'cp2-prior-revoke' },
        },
      });
      const revokePid = await waitForBlocker(pid);
      pending = createProjectRequest(
        target,
        creationPayload(),
        'cp2-revoke-loser',
      );
      await waitForBlocker(pid, revokePid);
      await blocker.query('COMMIT');
      expect((await revoked).status).toBe(200);
      expect((await pending).status).toBe(403);
      expect(await creationCounts(target.fixture.clientId)).toEqual(before);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await Promise.allSettled([
        ...(revoked ? [revoked] : []),
        ...(pending ? [pending] : []),
      ]);
    }
  });
  it('fails closed above fifty eligible CP2 candidates even when the submitted bounded view appears complete', async () => {
    const target = await projectCreationFixture();
    for (let index = 0; index < 51; index++)
      await createLinkProject(target.fixture, 'CP2 candidate ' + index);
    const candidates = record(
      await json(
        await request({
          path: target.base + '/project-candidates',
          companyId: target.fixture.companyId,
        }),
      ),
    ).items;
    if (!Array.isArray(candidates)) throw new Error('Missing candidates');
    expect(candidates).toHaveLength(50);
    const before = await creationCounts(target.fixture.clientId);
    expect(
      await json(
        await createProjectRequest(
          target,
          creationPayload(
            candidates.map((item: unknown) => stringField(record(item), 'id')),
          ),
          'cp2-truncated',
        ),
      ),
    ).toMatchObject({ code: 'PROJECT_CANDIDATE_LIMIT' });
    expect(await creationCounts(target.fixture.clientId)).toEqual(before);
  }, 60000);
  it('requires execution and independent Project creation access without revealing hidden Company candidates', async () => {
    const target = await approvedSignatureFixture();
    expect(
      (
        await createProjectRequest(
          target,
          creationPayload(),
          'cp2-missing-project',
        )
      ).status,
    ).toBe(403);
    await grantLinkProject(target.fixture);
    expect(
      await json(
        await createProjectRequest(
          target,
          { ...creationPayload(), expectedContractRevision: 2 },
          'cp2-unexecuted',
        ),
      ),
    ).toMatchObject({ code: 'CONTRACT_NOT_EXECUTED' });
    await signatureRequest(
      target.fixture,
      target.versionId,
      signaturePayload(),
      'cp2-execution',
    );
    const foreign = await preparedOffer('cp2-foreign');
    await grantLinkProject(foreign);
    await createLinkProject(foreign, 'Hidden foreign Company Project');
    expect(
      await json(
        await request({
          path: target.base + '/project-candidates',
          companyId: target.fixture.companyId,
        }),
      ),
    ).toEqual({ items: [] });
    expect(
      (
        await createProjectRequest(
          target,
          creationPayload(),
          'cp2-empty-visible',
        )
      ).status,
    ).toBe(201);
  });
  it('links an executed Contract to an eligible existing Project and reopens both without changing signed evidence', async () => {
    const { fixture, versionId, base } = await approvedSignatureFixture();
    const signature = await json(
      await signatureRequest(
        fixture,
        versionId,
        signaturePayload(),
        'cp1-signature',
      ),
    );
    const before = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    await command({
      path: '/company-project-assignments',
      body: {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      key: 'cp1-project-grant',
    });
    const project = record(
      await command({
        path: '/projects',
        companyId: fixture.companyId,
        body: {
          title: 'Synthetic existing Project',
          clientAccountId: fixture.clientId,
        },
        key: 'cp1-project',
      }),
    );
    const projectId = stringField(project, 'id');
    const candidates = await request({
      path: base + '/project-candidates',
      companyId: fixture.companyId,
    });
    expect(candidates.status).toBe(200);
    expect(await json(candidates)).toMatchObject({
      items: [
        {
          id: projectId,
          title: 'Synthetic existing Project',
          status: 'preparatory',
          alreadyLinked: false,
          otherContracts: [],
        },
      ],
    });
    const payload = { projectId, expectedContractRevision: 3 };
    const link = record(
      await command({
        path: base + '/projects',
        companyId: fixture.companyId,
        body: payload,
        key: 'cp1-link',
      }),
    );
    expect(link).toMatchObject({
      projectId,
      contractId: before.id,
      revision: 4,
      created: false,
      linkedAt: instant.toISOString(),
    });
    const reopened = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    expect(reopened).toMatchObject({
      revision: 4,
      linkedProjects: [{ ...project, link }],
    });
    expect(record(reopened.version)).toEqual(record(before.version));
    expect(record(reopened.version).signature).toEqual(signature);
    expect(
      await json(
        await request({
          path: '/contracts/projects/' + projectId,
          companyId: fixture.companyId,
        }),
      ),
    ).toMatchObject({
      items: [
        {
          id: before.id,
          opportunityId: fixture.opportunityId,
          illustrativeReference: 1,
        },
      ],
    });
    expect(
      await command({
        path: base + '/projects',
        companyId: fixture.companyId,
        body: payload,
        key: 'cp1-link',
      }),
    ).toEqual(link);
    const evidence = (
      await pool.query<{ links: string; receipts: string; events: string }>(
        "SELECT (SELECT count(*) FROM contract_project_links)::text AS links,(SELECT count(*) FROM contract_commands WHERE kind='LINK_PROJECT')::text AS receipts,(SELECT count(*) FROM contract_events WHERE action='contract_project.linked')::text AS events",
      )
    ).rows[0];
    expect(evidence).toEqual({ links: '1', receipts: '1', events: '1' });
  });
  it('requires independent live authority and safely filters unreadable Contract Project relationships', async () => {
    const target = await projectLinkFixture();
    const { fixture, base, projectId } = target;
    const headers = memberHeaders('contract-reader');
    const member = record(
      await json(
        await request({ path: '/access/current-actor', init: { headers } }),
      ),
    );
    const membershipId = stringField(member, 'workspaceMembershipId');
    for (const route of [
      'company-context-assignments',
      'company-project-assignments',
      'company-commercial-intake-assignments',
      'company-contract-preparer-assignments',
      'company-contract-approver-assignments',
      'company-director-client-assignments',
    ]) {
      await command({
        path: '/' + route,
        body: {
          companyId: fixture.companyId,
          workspaceMembershipId: membershipId,
        },
        key: 'cp1-independent-' + route,
      });
    }
    const read = (path: string) =>
      request({ path, companyId: fixture.companyId, init: { headers } });
    const payload = { projectId, expectedContractRevision: 3 };
    const linked = await json(
      await linkRequest(target, payload, 'cp1-authority-link', headers),
    );
    expect(linked).toMatchObject({ revision: 4 });
    for (const bundle of [
      'company-project-assignments',
      'company-commercial-intake-assignments',
      'company-contract-preparer-assignments',
      'company-director-client-assignments',
    ]) {
      const denial = await request({
        path: '/' + bundle + '/' + membershipId + '/' + fixture.companyId,
        init: {
          method: 'DELETE',
          headers: { 'idempotency-key': 'cp1-revoke-' + bundle },
        },
      });
      expect(denial.status).toBe(200);
      expect(
        (await linkRequest(target, payload, 'cp1-authority-link', headers))
          .status,
      ).toBe(403);
      const projected = await read('/contracts/projects/' + projectId);
      if (bundle === 'company-commercial-intake-assignments')
        expect(await json(projected)).toEqual({ items: [] });
      if (
        bundle === 'company-project-assignments' ||
        bundle === 'company-director-client-assignments'
      ) {
        expect(
          record(record(await json(await read(base))).contract).linkedProjects,
        ).toEqual([]);
      }
      await command({
        path: '/' + bundle,
        body: {
          companyId: fixture.companyId,
          workspaceMembershipId: membershipId,
        },
        key: 'cp1-restore-' + bundle,
      });
    }
    await request({
      path:
        '/company-contract-preparer-assignments/' +
        membershipId +
        '/' +
        fixture.companyId,
      init: {
        method: 'DELETE',
        headers: { 'idempotency-key': 'cp1-read-revoke-preparer' },
      },
    });
    await request({
      path:
        '/company-contract-approver-assignments/' +
        membershipId +
        '/' +
        fixture.companyId,
      init: {
        method: 'DELETE',
        headers: { 'idempotency-key': 'cp1-read-revoke-approver' },
      },
    });
    expect(await json(await read('/contracts/projects/' + projectId))).toEqual({
      items: [],
    });
    expect(await projectLinkCounts()).toEqual({
      links: '1',
      receipts: '1',
      events: '1',
      revision: 4,
    });
  }, 30000);

  it('refuses malformed, foreign, unexecuted and readable ineligible Project link requests', async () => {
    const target = await projectLinkFixture();
    const { fixture, projectId, base } = target;
    for (const body of [
      { projectId, expectedContractRevision: 0 },
      { projectId: 'unknown', expectedContractRevision: 3 },
      { projectId, expectedContractRevision: 3, created: true },
    ]) {
      const response = await linkRequest(
        target,
        body,
        'cp1-invalid-' + JSON.stringify(body),
      );
      expect(response.status).toBe(400);
      expect(await json(response)).toMatchObject({
        code: 'INVALID_CONTRACT_INPUT',
      });
    }
    expect(
      (
        await linkRequest(
          target,
          {
            projectId: '00000000-0000-4000-8000-000000009999',
            expectedContractRevision: 3,
          },
          'cp1-unknown',
        )
      ).status,
    ).toBe(404);
    const otherClient = stringField(
      record(
        await command({
          path: '/clients',
          companyId: fixture.companyId,
          body: { displayName: 'Another synthetic Client' },
          key: 'cp1-other-client',
        }),
      ),
      'id',
    );
    const otherProject = await createLinkProject(
      fixture,
      'cp1-other-client-project',
      otherClient,
    );
    expect(
      await json(
        await linkRequest(
          target,
          { projectId: otherProject, expectedContractRevision: 3 },
          'cp1-client-mismatch',
        ),
      ),
    ).toMatchObject({ code: 'PROJECT_NOT_ELIGIBLE' });
    const foreign = await acceptedOffer({ suffix: 'cp1-foreign' });
    await grantContract(foreign, 'cp1-foreign-grant');
    expect(
      (
        await request({
          path: base + '/projects',
          companyId: foreign.companyId,
          init: {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': 'cp1-foreign',
            },
            body: JSON.stringify({ projectId, expectedContractRevision: 3 }),
          },
        })
      ).status,
    ).toBe(404);
    const pending = record(
      await command({
        path: '/contracts/opportunities/' + foreign.opportunityId,
        companyId: foreign.companyId,
        body: await contractPayload(foreign),
        key: 'cp1-pending-contract',
      }),
    );
    await grantLinkProject(foreign);
    const foreignProjectId = await createLinkProject(
      foreign,
      'cp1-unexecuted-project',
    );
    expect(
      await json(
        await linkRequest(
          {
            fixture: foreign,
            base: '/contracts/opportunities/' + foreign.opportunityId,
          },
          { projectId: foreignProjectId, expectedContractRevision: 1 },
          'cp1-unexecuted',
        ),
      ),
    ).toMatchObject({ code: 'CONTRACT_NOT_EXECUTED' });
    expect(pending.revision).toBe(1);
  }, 30000);
  it('refuses missing or unknown captured Project link authority and foreign Workspace contexts without effects', async () => {
    const target = await projectLinkFixture();
    const { fixture, projectId } = target;
    const payload = { projectId, expectedContractRevision: 3 };
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
          "UPDATE company_role_assignments SET permission_set_version=$1 WHERE workspace_id=$2 AND company_id=$3 AND bundle='company_contract_preparer'",
          [version, WORKSPACE_ID, fixture.companyId],
        );
        expect(
          (await linkRequest(target, payload, 'cp1-captured-denial')).status,
        ).toBe(403);
        expect(
          (
            await request({
              path: target.base + '/project-candidates',
              companyId: fixture.companyId,
            })
          ).status,
        ).toBe(403);
      }
    } finally {
      await pool.query(
        "UPDATE company_role_assignments SET permission_set_version='v1' WHERE workspace_id=$1 AND company_id=$2 AND bundle='company_contract_preparer'",
        [WORKSPACE_ID, fixture.companyId],
      );
      await pool.query(
        'ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ' +
          constraint.definition,
      );
    }
    expect(
      (
        await linkRequest(target, payload, 'cp1-foreign-workspace', {
          'x-workspace-context-id': '00000000-0000-4000-8000-000000000999',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(origin + '/api' + target.base + '/projects', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-company-context-id': fixture.companyId,
          },
          body: JSON.stringify(payload),
        })
      ).status,
    ).toBe(401);
    expect(await projectLinkCounts()).toEqual({
      links: '0',
      receipts: '0',
      events: '0',
      revision: 3,
    });
  });
  it('shows readable other Contracts on a shared Project without copying its identity or creating a second Project', async () => {
    const target = await projectLinkFixture();
    const { fixture, projectId } = target;
    expect(
      (
        await linkRequest(
          target,
          { projectId, expectedContractRevision: 3 },
          'cp1-shared-first',
        )
      ).status,
    ).toBe(201);
    const intake = record(
      await command({
        path: '/commercial-intake/requests',
        companyId: fixture.companyId,
        body: {
          originalText: 'Second synthetic commercial path',
          clientAccountId: fixture.clientId,
          opportunity: {
            title: 'Second Contract',
            scope: 'Synthetic shared Project',
            nextAction: 'Prepare Contract',
          },
        },
        key: 'cp1-shared-intake',
      }),
    );
    const opportunityId = stringField(record(intake.initialOpportunity), 'id');
    const snapshot = record(
      await command({
        path: '/pricing/opportunities/' + opportunityId + '/snapshots',
        companyId: fixture.companyId,
        body: {
          pricingRuleVersionNumber: fixture.ruleVersionNumber,
          lines: [
            {
              offeringId: fixture.offeringId,
              tariffVersionNumber: fixture.tariffVersionNumber,
              quantity: '1',
            },
          ],
        },
        key: 'cp1-shared-snapshot',
      }),
    );
    const second = await acceptedOffer({
      suffix: '-shared',
      prepared: {
        ...fixture,
        requestId: stringField(intake, 'id'),
        opportunityId,
        snapshotId: stringField(snapshot, 'id'),
      },
    });
    const base = '/contracts/opportunities/' + opportunityId;
    const created = record(
      await command({
        path: base,
        companyId: fixture.companyId,
        body: await contractPayload(second),
        key: 'cp1-shared-contract',
      }),
    );
    const versionId = stringField(record(created.version), 'id');
    expect(
      (
        await decisionRequest(
          second,
          versionId,
          'approve',
          { expectedContractRevision: 1, acknowledgedWarningCodes: [] },
          'cp1-shared-approval',
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await signatureRequest(
          second,
          versionId,
          signaturePayload(),
          'cp1-shared-signature',
        )
      ).status,
    ).toBe(201);
    const candidates = record(
      await json(
        await request({
          path: base + '/project-candidates',
          companyId: fixture.companyId,
        }),
      ),
    );
    expect(candidates).toMatchObject({
      items: [
        {
          id: projectId,
          alreadyLinked: false,
          otherContracts: [{ illustrativeReference: 1 }],
        },
      ],
    });
    expect(
      (
        await linkRequest(
          { fixture: second, base },
          { projectId, expectedContractRevision: 3 },
          'cp1-shared-second',
        )
      ).status,
    ).toBe(201);
    const [firstRead, secondRead, projectRead] = await Promise.all([
      request({
        path: target.base + '/project-candidates',
        companyId: fixture.companyId,
      }),
      request({
        path: base + '/project-candidates',
        companyId: fixture.companyId,
      }),
      request({
        path: '/contracts/projects/' + projectId,
        companyId: fixture.companyId,
      }),
    ]);
    expect([firstRead.status, secondRead.status, projectRead.status]).toEqual([
      200, 200, 200,
    ]);
    expect(await json(firstRead)).toMatchObject({
      items: [
        {
          id: projectId,
          alreadyLinked: true,
          otherContracts: [{ illustrativeReference: 2 }],
        },
      ],
    });
    expect(await json(secondRead)).toMatchObject({
      items: [
        {
          id: projectId,
          alreadyLinked: true,
          otherContracts: [{ illustrativeReference: 1 }],
        },
      ],
    });
    const linked = record(await json(projectRead));
    expect(linked.items).toHaveLength(2);
    expect(
      (
        await pool.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM projects',
        )
      ).rows[0]?.count,
    ).toBe('1');
  }, 30000);

  it('links a Project through current Client resolution while preserving original identities and owner reversal rules', async () => {
    const prepared = await preparedOffer();
    await grantLinkProject(prepared);
    const second = stringField(
      record(
        await command({
          path: '/clients',
          companyId: prepared.companyId,
          body: { displayName: 'Legacy same identity' },
          key: 'cp1-legacy-client',
        }),
      ),
      'id',
    );
    const projectId = await createLinkProject(
      prepared,
      'cp1-preunion-project',
      second,
    );
    const originalProject = await json(
      await request({
        path: '/projects/' + projectId,
        companyId: prepared.companyId,
      }),
    );
    // Only synthetic historic duplication bypasses create validation; union remains public.
    await pool.query(
      "UPDATE client_accounts SET tax_id='SYNTHETIC-456' WHERE id=$1",
      [second],
    );
    const review = record(
      await command({
        path: '/clients/' + prepared.clientId + '/union-reviews',
        companyId: prepared.companyId,
        body: {},
        key: 'cp1-union-review',
      }),
    );
    expect(review.outcome).toBe('comparison');
    const union = record(
      await command({
        path:
          '/client-union-reviews/' +
          stringField(review, 'reviewReference') +
          '/confirm',
        companyId: prepared.companyId,
        body: {
          canonicalClientId: prepared.clientId,
          fields: {
            displayName: prepared.clientId,
            taxId: prepared.clientId,
            address: prepared.clientId,
            telephone: prepared.clientId,
            generalEmail: prepared.clientId,
            businessActivity: prepared.clientId,
          },
          companyIds: [prepared.companyId],
          reviewedDifferences: true,
          reason: 'Legacy synthetic duplicate identity.',
        },
        key: 'cp1-confirm-union',
      }),
    );
    const fixture = await acceptedOffer({ prepared });
    await grantContract(fixture, 'cp1-union-contract-grant');
    const base = '/contracts/opportunities/' + fixture.opportunityId;
    const created = record(
      await command({
        path: base,
        companyId: fixture.companyId,
        body: await contractPayload(fixture),
        key: 'cp1-union-contract',
      }),
    );
    const versionId = stringField(record(created.version), 'id');
    await grantApprover(fixture);
    expect(
      (
        await decisionRequest(
          fixture,
          versionId,
          'approve',
          { expectedContractRevision: 1, acknowledgedWarningCodes: [] },
          'cp1-union-approval',
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'cp1-union-signature',
        )
      ).status,
    ).toBe(201);
    expect(
      await json(
        await request({
          path: base + '/project-candidates',
          companyId: fixture.companyId,
        }),
      ),
    ).toMatchObject({ items: [{ id: projectId, alreadyLinked: false }] });
    expect(
      (
        await linkRequest(
          { fixture, base },
          { projectId, expectedContractRevision: 3 },
          'cp1-union-link',
        )
      ).status,
    ).toBe(201);
    const current = record(
      await json(
        await request({
          path: '/projects/' + projectId,
          companyId: fixture.companyId,
        }),
      ),
    );
    expect(current).toMatchObject({
      ...record(originalProject),
      clientDossierId: fixture.clientId,
    });
    const linked = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    expect(linked.originalClientAccountId).toBe(fixture.clientId);
    expect(linked.linkedProjects).toMatchObject([
      {
        id: projectId,
        clientAccountId: second,
        clientDossierId: fixture.clientId,
      },
    ]);
    // New commercial references are a material operation: the Client owner refuses reversal.
    const reversal = await request({
      path:
        '/client-union-operations/' +
        stringField(union, 'projectionReference') +
        '/reversal',
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'cp1-reversal-after-contract',
        },
        body: JSON.stringify({
          companyIds: [fixture.companyId],
          reason: 'Reverse synthetic union.',
        }),
      },
    });
    expect(reversal.status).toBe(409);
    expect(await projectLinkCounts()).toEqual({
      links: '1',
      receipts: '1',
      events: '1',
      revision: 4,
    });
  }, 30000);

  it('rechecks Project link eligibility after the Client owner fence and orders live revocation before replay', async () => {
    const target = await projectLinkFixture();
    const { fixture, projectId } = target;
    const blocker = await pool.connect();
    let pending: Promise<Response> | undefined;
    let revoked: Promise<Response> | undefined;
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
      pending = linkRequest(
        target,
        { projectId, expectedContractRevision: 3 },
        'cp1-before-revocation',
      );
      const commandPid = await waitForBlocker(pid);
      revoked = request({
        path:
          '/company-contract-preparer-assignments/' +
          fixture.actorMembershipId +
          '/' +
          fixture.companyId,
        init: {
          method: 'DELETE',
          headers: { 'idempotency-key': 'cp1-concurrent-revocation' },
        },
      });
      await waitForBlocker(commandPid);
      await blocker.query('COMMIT');
      expect((await pending).status).toBe(201);
      expect((await revoked).status).toBe(200);
      expect(
        (
          await linkRequest(
            target,
            { projectId, expectedContractRevision: 3 },
            'cp1-before-revocation',
          )
        ).status,
      ).toBe(403);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await Promise.allSettled([
        ...(pending ? [pending] : []),
        ...(revoked ? [revoked] : []),
      ]);
    }
  });

  it('refuses a new Project link after closure commits while it waits for the original Client identity', async () => {
    const target = await projectLinkFixture();
    const { fixture, projectId } = target;
    await command({
      path: '/company-project-approver-assignments',
      body: {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      key: 'cp1-fenced-closure-grant',
    });
    const blocker = await pool.connect();
    let pending: Promise<Response> | undefined;
    let closed: Promise<Response> | undefined;
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
      closed = closeLinkProject(target, projectId, false);
      const closingPid = await waitForBlocker(pid);
      pending = linkRequest(
        target,
        { projectId, expectedContractRevision: 3 },
        'cp1-after-closure',
      );
      await waitForBlocker(pid, closingPid);
      await blocker.query('COMMIT');
      expect((await closed).status).toBe(200);
      expect(await json(await pending)).toMatchObject({
        code: 'PROJECT_NOT_ELIGIBLE',
      });
      expect(await projectLinkCounts()).toEqual({
        links: '0',
        receipts: '0',
        events: '0',
        revision: 3,
      });
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await Promise.allSettled([
        ...(pending ? [pending] : []),
        ...(closed ? [closed] : []),
      ]);
    }
  });

  it('replays an original link after closure but refuses changed, stale, duplicate and newly ineligible commands', async () => {
    const target = await projectLinkFixture();
    const { fixture, projectId, base } = target;
    const payload = { projectId, expectedContractRevision: 3 };
    const linked = await json(await linkRequest(target, payload, 'cp1-replay'));
    expect(
      await json(
        await linkRequest(
          target,
          { ...payload, expectedContractRevision: 4 },
          'cp1-replay',
        ),
      ),
    ).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(
      await json(await linkRequest(target, payload, 'cp1-stale')),
    ).toMatchObject({ code: 'STALE_CONTRACT_REVISION' });
    expect(
      await json(
        await linkRequest(
          target,
          { ...payload, expectedContractRevision: 4 },
          'cp1-duplicate',
        ),
      ),
    ).toMatchObject({ code: 'CONTRACT_PROJECT_ALREADY_LINKED' });
    await closeLinkProject(target, projectId);
    expect(
      await json(await linkRequest(target, payload, 'cp1-replay')),
    ).toEqual(linked);
    expect(
      await json(
        await linkRequest(
          target,
          { ...payload, expectedContractRevision: 4 },
          'cp1-closed',
        ),
      ),
    ).toMatchObject({ code: 'PROJECT_NOT_ELIGIBLE' });
    expect(
      await json(
        await request({
          path: base + '/project-candidates',
          companyId: fixture.companyId,
        }),
      ),
    ).toEqual({ items: [] });
    expect(
      record(
        record(
          await json(
            await request({ path: base, companyId: fixture.companyId }),
          ),
        ).contract,
      ).linkedProjects,
    ).toMatchObject([{ id: projectId, status: 'cancelled' }]);
    await pool.query(
      "UPDATE client_company_relationships SET status='archived' WHERE company_id=$1 AND client_account_id=$2",
      [fixture.companyId, fixture.clientId],
    );
    expect((await linkRequest(target, payload, 'cp1-replay')).status).toBe(404);
    expect(
      record(
        record(
          await json(
            await request({ path: base, companyId: fixture.companyId }),
          ),
        ).contract,
      ).linkedProjects,
    ).toEqual([]);
    expect(
      (
        await request({
          path: '/contracts/projects/' + projectId,
          companyId: fixture.companyId,
        })
      ).status,
    ).toBe(404);
    expect(await projectLinkCounts()).toEqual({
      links: '1',
      receipts: '1',
      events: '1',
      revision: 4,
    });
  });

  it('rolls back Project link evidence and rejects unexplained executed revisions or immutable changes', async () => {
    const target = await projectLinkFixture();
    const { projectId } = target;
    await pool.query(
      "CREATE FUNCTION fail_cp1_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='contract_project.linked' THEN RAISE EXCEPTION 'Synthetic link rollback'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_cp1_event BEFORE INSERT ON contract_events FOR EACH ROW EXECUTE FUNCTION fail_cp1_event()",
    );
    try {
      const response = await linkRequest(
        target,
        { projectId, expectedContractRevision: 3 },
        'cp1-rollback',
      );
      expect(response.status).toBe(500);
      expect(await json(response)).toMatchObject({
        code: 'CONTRACT_PROJECT_LINK_UNCERTAIN',
      });
      expect(await projectLinkCounts()).toEqual({
        links: '0',
        receipts: '0',
        events: '0',
        revision: 3,
      });
    } finally {
      await pool.query(
        'DROP TRIGGER fail_cp1_event ON contract_events; DROP FUNCTION fail_cp1_event()',
      );
    }
    for (const query of [
      'UPDATE contracts SET revision=4',
      "UPDATE contract_versions SET scope_note='changed'",
      'DELETE FROM contract_signatures',
      "UPDATE contract_signatures SET representation_checksum=repeat('2',64)",
    ])
      await expect(pool.query(query)).rejects.toMatchObject({ code: '23514' });
    const response = await linkRequest(
      target,
      { projectId, expectedContractRevision: 3 },
      'cp1-rollback',
    );
    expect(response.status).toBe(201);
    const recorded = record(await json(response));
    for (const query of [
      'UPDATE contracts SET revision=5',
      'UPDATE contract_project_links SET result_revision=5',
      'DELETE FROM contract_project_links',
    ])
      await expect(pool.query(query)).rejects.toMatchObject({ code: '23514' });
    expect(
      (
        await pool.query<{ metadata: unknown }>(
          "SELECT metadata FROM contract_events WHERE action='contract_project.linked'",
        )
      ).rows[0]?.metadata,
    ).toEqual({ contractId: recorded.contractId, projectId, created: false });
    expect(await projectLinkCounts()).toEqual({
      links: '1',
      receipts: '1',
      events: '1',
      revision: 4,
    });
  });

  it('serializes duplicate and capacity-boundary links and lists only the 50 newest candidates', async () => {
    const target = await projectLinkFixture();
    const { fixture, projectId, base } = target;
    const payload = { projectId, expectedContractRevision: 3 };
    const duplicate = await Promise.all([
      linkRequest(target, payload, 'cp1-race-a'),
      linkRequest(target, payload, 'cp1-race-b'),
    ]);
    expect(duplicate.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const winner = duplicate.find((response) => response.status === 201);
    if (!winner) throw new Error('Missing winning link');
    const key = duplicate[0]?.status === 201 ? 'cp1-race-a' : 'cp1-race-b';
    const result = await json(winner);
    const replays = await Promise.all([
      linkRequest(target, payload, key),
      linkRequest(target, payload, key),
    ]);
    for (const replay of replays) expect(await json(replay)).toEqual(result);
    const extra: string[] = [];
    for (let index = 1; index <= 51; index++)
      extra.push(await createLinkProject(fixture, 'cp1-capacity-' + index));
    for (let index = 0; index < 48; index++) {
      const response = await linkRequest(
        target,
        { projectId: extra[index], expectedContractRevision: 4 + index },
        'cp1-fill-' + index,
      );
      expect(response.status).toBe(201);
    }
    const boundary = await Promise.all([
      linkRequest(
        target,
        { projectId: extra[48], expectedContractRevision: 52 },
        'cp1-boundary-a',
      ),
      linkRequest(
        target,
        { projectId: extra[49], expectedContractRevision: 52 },
        'cp1-boundary-b',
      ),
    ]);
    expect(boundary.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      await json(
        await linkRequest(
          target,
          { projectId: extra[50], expectedContractRevision: 53 },
          'cp1-over-capacity',
        ),
      ),
    ).toMatchObject({ code: 'CONTRACT_PROJECT_LINK_CAPACITY_EXCEEDED' });
    const candidates = record(
      await json(
        await request({
          path: base + '/project-candidates',
          companyId: fixture.companyId,
        }),
      ),
    );
    if (!Array.isArray(candidates.items)) throw new Error('Missing candidates');
    expect(candidates.items).toHaveLength(50);
    expect(record(candidates.items[0]).id).toBe(extra[50]);
    expect(
      candidates.items.map(record).some((project) => project.id === projectId),
    ).toBe(false);
    expect(await projectLinkCounts()).toEqual({
      links: '50',
      receipts: '50',
      events: '50',
      revision: 53,
    });
  }, 60000);

  it('records both simulated signatures on the approved exact version and reloads unchanged evidence', async () => {
    const { fixture, created, base, versionId } = await qualityFixture();
    await grantApprover(fixture);
    const approval = record(
      await json(
        await decisionRequest(
          fixture,
          versionId,
          'approve',
          {
            expectedContractRevision: 1,
            acknowledgedWarningCodes: [],
          },
          'signature-approval',
        ),
      ),
    );
    instant = new Date('2026-09-28T00:05:00.000Z');
    const payload = {
      expectedContractRevision: 2,
      providerSignatoryLabel: '  Synthetic provider 👩🏽‍💼  ',
      clientSignatoryLabel: 'Synthetic Client É',
      providerSignedOn: '2026-09-27',
      clientSignedOn: '2026-09-28',
      note: '  Declared evidence only.  ',
      acknowledgedWarningCodes: [],
    };
    const signature = record(
      await command({
        path: base + '/versions/' + versionId + '/signature',
        companyId: fixture.companyId,
        body: payload,
        key: 'signature-exact',
      }),
    );
    expect(signature).toMatchObject({
      providerSignatoryLabel: payload.providerSignatoryLabel,
      clientSignatoryLabel: payload.clientSignatoryLabel,
      providerSignedOn: payload.providerSignedOn,
      clientSignedOn: payload.clientSignedOn,
      note: payload.note,
      acknowledgedWarningCodes: [],
      revision: 3,
      evidenceKind: 'SIMULATED',
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      recordedAt: instant.toISOString(),
    });
    const reload = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    expect(reload).toMatchObject({
      revision: 3,
      version: { executionState: 'EXECUTED', decision: approval, signature },
    });
    expect(record(reload.version).representation).toEqual(
      record(created.version).representation,
    );
  });
  it('validates exact two-party signature fields and UTC dates without leaving failed evidence', async () => {
    const { fixture, versionId } = await approvedSignatureFixture();
    for (const [field, value] of [
      ['providerSignatoryLabel', ' '],
      ['providerSignatoryLabel', 'É'.repeat(201)],
      ['clientSignatoryLabel', 'x\0y'],
      ['clientSignatoryLabel', null],
      ['providerSignedOn', '2026-09-26'],
      ['clientSignedOn', '2026-09-28'],
      ['clientSignedOn', '2026-02-30'],
      ['providerSignedOn', '2026-9-27'],
      ['note', '🙂'.repeat(501)],
      ['note', 42],
      ['evidenceKind', 'REAL'],
      ['file', 'scan.pdf'],
      ['expectedContractRevision', 0],
      ['acknowledgedWarningCodes', ['PARTY_AVAILABLE']],
      [
        'acknowledgedWarningCodes',
        ['TERM_END_NOT_PASSED', 'TERM_END_NOT_PASSED'],
      ],
    ] as const) {
      const response = await signatureRequest(
        fixture,
        versionId,
        { ...signaturePayload(), [field]: value },
        'invalid-' + field,
      );
      expect(response.status).toBe(400);
      expect(await json(response)).toMatchObject({
        code: 'INVALID_CONTRACT_INPUT',
        field,
      });
    }
    expect(await signatureCounts()).toEqual({
      signatures: '0',
      runs: '1',
      receipts: '0',
      events: '0',
      revision: 2,
    });
    const result = await signatureRequest(
      fixture,
      versionId,
      {
        ...signaturePayload(),
        providerSignatoryLabel: '👩'.repeat(200),
        note: '🙂'.repeat(500),
      },
      'unicode',
    );
    expect(result.status).toBe(201);
  });
  it('requires an approved unexecuted head and preserves earlier receipts after execution', async () => {
    const { fixture, versionId, base } = await qualityFixture();
    await grantApprover(fixture);
    expect(
      await json(
        await signatureRequest(
          fixture,
          versionId,
          { ...signaturePayload(), expectedContractRevision: 1 },
          'pending',
        ),
      ),
    ).toMatchObject({ code: 'CONTRACT_VERSION_NOT_APPROVED' });
    const approvalPayload = {
      expectedContractRevision: 1,
      acknowledgedWarningCodes: [],
    };
    const approval = await json(
      await decisionRequest(
        fixture,
        versionId,
        'approve',
        approvalPayload,
        'approve-before-signature',
      ),
    );
    expect(
      await json(
        await signatureRequest(
          fixture,
          versionId,
          { ...signaturePayload(), expectedContractRevision: 1 },
          'stale',
        ),
      ),
    ).toMatchObject({ code: 'STALE_CONTRACT_REVISION' });
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'execute',
        )
      ).status,
    ).toBe(201);
    expect(
      await json(
        await signatureRequest(
          fixture,
          versionId,
          { ...signaturePayload(), expectedContractRevision: 3 },
          'execute-again',
        ),
      ),
    ).toMatchObject({ code: 'CONTRACT_VERSION_ALREADY_EXECUTED' });
    expect(
      await json(
        await decisionRequest(
          fixture,
          versionId,
          'approve',
          approvalPayload,
          'approve-before-signature',
        ),
      ),
    ).toEqual(approval);
    const reloaded = record(
      record(
        await json(await request({ path: base, companyId: fixture.companyId })),
      ).contract,
    );
    expect(reloaded.revision).toBe(3);
    expect(await signatureCounts()).toEqual({
      signatures: '1',
      runs: '2',
      receipts: '1',
      events: '1',
      revision: 3,
    });
  });
  it('acknowledges only fresh warnings beyond approval and blocks current errors without effects', async () => {
    const { fixture, versionId } = await approvedSignatureFixture({
      termEndsOn: '2026-09-27',
      specialConditions: 'Declared conditions',
    });
    instant = new Date('2026-09-28T00:00:00.000Z');
    for (const warnings of [
      [],
      ['ADDED_CONDITIONS_CONFIRMED'],
      ['ADDED_CONDITIONS_CONFIRMED', 'TERM_END_NOT_PASSED'],
    ])
      expect(
        await json(
          await signatureRequest(
            fixture,
            versionId,
            { ...signaturePayload(), acknowledgedWarningCodes: warnings },
            'new-warnings',
          ),
        ),
      ).toMatchObject({ code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED' });
    await pool.query(
      "UPDATE client_accounts SET status='archived' WHERE id=$1",
      [fixture.clientId],
    );
    expect(
      await json(
        await signatureRequest(
          fixture,
          versionId,
          {
            ...signaturePayload(),
            acknowledgedWarningCodes: ['TERM_END_NOT_PASSED'],
          },
          'fresh-errors',
        ),
      ),
    ).toMatchObject({ code: 'QUALITY_CHECK_ERRORS' });
    expect(await signatureCounts()).toEqual({
      signatures: '0',
      runs: '1',
      receipts: '0',
      events: '0',
      revision: 2,
    });
    await pool.query("UPDATE client_accounts SET status='active' WHERE id=$1", [
      fixture.clientId,
    ]);
    const signed = record(
      await json(
        await signatureRequest(
          fixture,
          versionId,
          {
            ...signaturePayload(),
            acknowledgedWarningCodes: ['TERM_END_NOT_PASSED'],
          },
          'new-warnings',
        ),
      ),
    );
    expect(signed.acknowledgedWarningCodes).toEqual(['TERM_END_NOT_PASSED']);
    const event = (
      await pool.query<{ metadata: unknown }>(
        "SELECT metadata FROM contract_events WHERE action='contract_version.signature_recorded'",
      )
    ).rows[0];
    expect(event?.metadata).toMatchObject({
      evidenceKind: 'SIMULATED',
      provenance: 'ILLUSTRATIVE',
      acknowledgedWarningCodes: ['TERM_END_NOT_PASSED'],
    });
    expect(Object.keys(record(event?.metadata)).sort()).toEqual([
      'acknowledgedWarningCodes',
      'contractId',
      'contractVersionId',
      'evidenceKind',
      'kind',
      'offerVersionId',
      'origin',
      'pricingSnapshotId',
      'provenance',
      'ruleSetVersion',
      'versionNumber',
    ]);
  });
  it('converges concurrent signature keys and exact retries while changed payloads conflict and revoked replay denies', async () => {
    const { fixture, versionId } = await approvedSignatureFixture();
    const payload = signaturePayload();
    const concurrent = await Promise.all(
      ['one', 'two'].map((key) =>
        signatureRequest(fixture, versionId, payload, key),
      ),
    );
    expect(concurrent.map((r) => r.status).sort()).toEqual([201, 409]);
    const winnerIndex = concurrent.findIndex((r) => r.status === 201),
      winner = concurrent[winnerIndex];
    if (!winner) throw new Error('Missing signature winner.');
    const result = await json(winner),
      key = winnerIndex === 0 ? 'one' : 'two';
    instant = new Date('2026-10-10T23:59:59.000Z');
    const repeats = await Promise.all([
      signatureRequest(fixture, versionId, payload, key),
      signatureRequest(fixture, versionId, payload, key),
    ]);
    for (const repeat of repeats) {
      expect(repeat.status).toBe(201);
      expect(await json(repeat)).toEqual(result);
    }
    expect(
      await json(
        await signatureRequest(
          fixture,
          versionId,
          { ...payload, note: 'Changed' },
          key,
        ),
      ),
    ).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await signatureCounts()).toEqual({
      signatures: '1',
      runs: '2',
      receipts: '1',
      events: '1',
      revision: 3,
    });
    await request({
      path:
        '/company-contract-approver-assignments/' +
        fixture.actorMembershipId +
        '/' +
        fixture.companyId,
      init: {
        method: 'DELETE',
        headers: { 'idempotency-key': 'revoke-signature' },
      },
    });
    expect(
      (await signatureRequest(fixture, versionId, payload, key)).status,
    ).toBe(403);
  });
  it('rolls back signature evidence on event failure and refuses forbidden database changes', async () => {
    const { fixture, versionId } = await approvedSignatureFixture();
    const incomplete = await pool.connect();
    try {
      await incomplete.query('BEGIN');
      await incomplete.query(
        "UPDATE contract_versions SET execution_state='EXECUTED'; UPDATE contracts SET revision=3",
      );
      await expect(incomplete.query('COMMIT')).rejects.toMatchObject({
        code: '23514',
      });
    } finally {
      await incomplete.query('ROLLBACK');
      incomplete.release();
    }
    await pool.query(
      "CREATE FUNCTION fail_signature_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='contract_version.signature_recorded' THEN RAISE EXCEPTION 'Synthetic signature rollback'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_signature_event BEFORE INSERT ON contract_events FOR EACH ROW EXECUTE FUNCTION fail_signature_event()",
    );
    try {
      expect(
        await json(
          await signatureRequest(
            fixture,
            versionId,
            signaturePayload(),
            'rollback-signature',
          ),
        ),
      ).toMatchObject({ code: 'CONTRACT_SIGNATURE_UNCERTAIN' });
      expect(await signatureCounts()).toEqual({
        signatures: '0',
        runs: '1',
        receipts: '0',
        events: '0',
        revision: 2,
      });
    } finally {
      await pool.query(
        'DROP TRIGGER fail_signature_event ON contract_events; DROP FUNCTION fail_signature_event()',
      );
    }
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'rollback-signature',
        )
      ).status,
    ).toBe(201);
    for (const mutation of [
      "UPDATE contract_signatures SET evidence_kind='REAL'",
      "UPDATE contract_signatures SET note='changed'",
      'DELETE FROM contract_signatures',
      "UPDATE contract_versions SET execution_state='NOT_EXECUTED'",
      "UPDATE contract_versions SET scope_note='Changed'",
      'DELETE FROM contract_versions',
      'DELETE FROM contracts',
      "UPDATE contract_decisions SET representation_checksum=repeat('0',64)",
      'DELETE FROM contract_decisions',
      'DELETE FROM contract_quality_runs',
      'DELETE FROM contract_commands',
      'DELETE FROM contract_events',
    ])
      await expect(pool.query(mutation)).rejects.toMatchObject({
        code: '23514',
      });
    expect(await signatureCounts()).toEqual({
      signatures: '1',
      runs: '2',
      receipts: '1',
      events: '1',
      revision: 3,
    });
  });
  it('records signatures with independent captured authority and safely denies missing, foreign and revoked targets', async () => {
    const { fixture, versionId, base } = await approvedSignatureFixture();
    const member = record(
      await json(
        await request({
          path: '/access/current-actor',
          init: { headers: memberHeaders('contract-reader') },
        }),
      ),
    );
    const membership = stringField(member, 'workspaceMembershipId');
    const headers = memberHeaders('contract-reader');
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'independent',
          headers,
        )
      ).status,
    ).toBe(403);
    for (const route of [
      '/company-context-assignments',
      '/company-commercial-intake-assignments',
      '/company-contract-approver-assignments',
    ])
      await command({
        path: route,
        body: {
          workspaceMembershipId: membership,
          companyId: fixture.companyId,
        },
        key: 'signature-independent-' + route,
      });
    const active = record(
      record(
        await json(
          await request({
            path: '/access/current-actor',
            companyId: fixture.companyId,
            init: { headers },
          }),
        ),
      ).activeCompany,
    );
    expect(active.clientPermissions).toEqual([]);
    expect(active.offerPermissions).toBeUndefined();
    expect(active.pricingUserPermissions).toBeUndefined();
    expect(active.projectPermissions).toBeUndefined();
    const unknown = await signatureRequest(
      fixture,
      '00000000-0000-4000-8000-000000000999',
      signaturePayload(),
      'unknown',
      headers,
    );
    expect(unknown.status).toBe(404);
    const safe = await json(unknown);
    const other = await acceptedOffer({ suffix: 'signature-foreign' });
    await grantApprover(other);
    const foreign = await request({
      path: base + '/versions/' + versionId + '/signature',
      companyId: other.companyId,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'foreign',
        },
        body: JSON.stringify(signaturePayload()),
      },
    });
    expect(foreign.status).toBe(404);
    expect(await json(foreign)).toEqual(safe);
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'independent',
          headers,
        )
      ).status,
    ).toBe(201);
    const reloaded = record(
      record(
        await json(
          await request({
            path: base,
            companyId: fixture.companyId,
            init: { headers },
          }),
        ),
      ).contract,
    );
    expect(
      record(record(reloaded.version).signature).actorWorkspaceMembershipId,
    ).toBe(membership);
    expect(reloaded.clientReference).toBeUndefined();
    await request({
      path:
        '/company-commercial-intake-assignments/' +
        membership +
        '/' +
        fixture.companyId,
      init: {
        method: 'DELETE',
        headers: { 'idempotency-key': 'revoke-signature-read' },
      },
    });
    expect(
      (
        await signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'independent',
          headers,
        )
      ).status,
    ).toBe(403);
  });
  it('orders effective approver revocation and current Client invalidation before signature commit', async () => {
    const { fixture, versionId } = await approvedSignatureFixture();
    for (const fence of ['client', 'approver'] as const) {
      const blocker = await pool.connect();
      let pending: Promise<Response> | undefined;
      try {
        await blocker.query('BEGIN');
        const identity = (
          await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0];
        if (!identity) throw new Error('Missing blocker');
        await blocker.query(
          fence === 'client'
            ? "UPDATE client_accounts SET status='archived' WHERE id=$1"
            : "UPDATE company_role_assignments SET revoked_at=now() WHERE bundle='company_contract_approver' AND company_id=$1",
          [fence === 'client' ? fixture.clientId : fixture.companyId],
        );
        pending = signatureRequest(
          fixture,
          versionId,
          signaturePayload(),
          'fenced-' + fence,
        );
        await waitForBlocker(identity.pid);
        await blocker.query('COMMIT');
        const refused = await pending;
        expect(refused.status).toBe(fence === 'client' ? 409 : 403);
        if (fence === 'client')
          expect(await json(refused)).toMatchObject({
            code: 'QUALITY_CHECK_ERRORS',
          });
        expect(await signatureCounts()).toEqual({
          signatures: '0',
          runs: '1',
          receipts: '0',
          events: '0',
          revision: 2,
        });
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        if (pending) await Promise.allSettled([pending]);
      }
      if (fence === 'client')
        await pool.query(
          "UPDATE client_accounts SET status='active' WHERE id=$1",
          [fixture.clientId],
        );
    }
  });
  it('refuses a representation different from the approved checksum without persisting signature evidence', async () => {
    const { fixture, versionId } = await approvedSignatureFixture();
    const saved = (
      await pool.query<{ representation_checksum: string }>(
        'SELECT representation_checksum FROM contract_decisions',
      )
    ).rows[0];
    if (!saved) throw new Error('Missing approval');
    // A controlled legacy-corruption probe tests the public checksum refusal;
    // ordinary writes cannot bypass the separate append-only database guard.
    await pool.query(
      'ALTER TABLE contract_decisions DISABLE TRIGGER contract_decisions_immutable',
    );
    try {
      await pool.query(
        "UPDATE contract_decisions SET representation_checksum=repeat('0',64)",
      );
      expect(
        await json(
          await signatureRequest(
            fixture,
            versionId,
            signaturePayload(),
            'checksum-mismatch',
          ),
        ),
      ).toMatchObject({ code: 'REPRESENTATION_MISMATCH' });
      expect(await signatureCounts()).toEqual({
        signatures: '0',
        runs: '1',
        receipts: '0',
        events: '0',
        revision: 2,
      });
    } finally {
      await pool.query(
        'UPDATE contract_decisions SET representation_checksum=$1',
        [saved.representation_checksum],
      );
      await pool.query(
        'ALTER TABLE contract_decisions ENABLE TRIGGER contract_decisions_immutable',
      );
    }
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

  it.each(['approve', 'signature'] as const)(
    'fails closed for captured approver versions and each independent prerequisite on %s without leaking targets',
    async (action) => {
      const { fixture, versionId } = await qualityFixture();
      const route =
        '/contracts/opportunities/' +
        fixture.opportunityId +
        '/versions/' +
        versionId +
        '/' +
        action;
      const body = {
        expectedContractRevision: 1,
        acknowledgedWarningCodes: [],
      };
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
          (
            await send(
              fixture.companyId,
              route,
              memberHeaders('contract-reader'),
            )
          ).status,
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
    },
  );

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

  it.each(['approve', 'signature'] as const)(
    'converges an identical %s retry after the HTTP acknowledgement is lost following commit',
    async (action) => {
      const { fixture, versionId, base } =
        action === 'signature'
          ? await approvedSignatureFixture()
          : await qualityFixture();
      await grantApprover(fixture);
      const payload =
        action === 'signature'
          ? signaturePayload()
          : {
              expectedContractRevision: 1,
              acknowledgedWarningCodes: [],
            };
      const proxy = createServer(async (incoming, outgoing) => {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of incoming) {
            if (!Buffer.isBuffer(chunk))
              throw new Error('Unexpected proxy body');
            chunks.push(chunk);
          }
          const committed = await fetch(
            origin + '/api' + base + '/versions/' + versionId + '/' + action,
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
      await new Promise<void>((resolve) =>
        proxy.listen(0, '127.0.0.1', resolve),
      );
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
        expect(stored.revision).toBe(action === 'signature' ? 3 : 2);
        const decision = record(
          record(stored.version)[
            action === 'signature' ? 'signature' : 'decision'
          ],
        );
        instant = new Date('2026-10-09T12:00:00.000Z');
        expect(
          await json(
            await decisionRequest(
              fixture,
              versionId,
              action,
              payload,
              'lost-ack',
            ),
          ),
        ).toEqual(decision);
        expect(
          (
            await pool.query<{
              decisions: string;
              runs: string;
              events: string;
            }>(
              "SELECT (SELECT count(*) FROM contract_decisions)::text AS decisions,(SELECT count(*) FROM contract_quality_runs)::text AS runs,(SELECT count(*) FROM contract_events WHERE action='contract_version.approved')::text AS events",
            )
          ).rows[0],
        ).toEqual({
          decisions: '1',
          runs: action === 'signature' ? '2' : '1',
          events: '1',
        });
        if (action === 'signature')
          expect(await signatureCounts()).toEqual({
            signatures: '1',
            runs: '2',
            receipts: '1',
            events: '1',
            revision: 3,
          });
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
    },
  );

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
      baseline: 'C9 / 0061 with Addendum',
      migration: '0062_contract_precontracts',
      index: 62,
      previousTag: '0061_contract_direct_origin',
    },
    {
      baseline: 'C8 / 0060 with Addendum',
      migration: '0061_contract_direct_origin',
      index: 61,
      previousTag: '0060_contract_addenda',
    },
    {
      baseline: 'C6 / 0059 executed with Project links',
      migration: '0060_contract_addenda',
      index: 60,
      previousTag: '0059_contract_versions',
    },
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
    {
      baseline: 'C4 / 0055',
      migration: '0056_contract_simulated_signature',
      index: 56,
      previousTag: '0055_contract_decisions',
    },
    {
      baseline: 'C5 / 0056 executed',
      migration: '0057_contract_project_links',
      index: 57,
      previousTag: '0056_contract_simulated_signature',
    },
    {
      baseline: 'CP2 / 0058 executed with created Project',
      migration: '0059_contract_versions',
      index: 59,
      previousTag: '0058_contract_project_creation',
    },
    {
      baseline: 'CP1 / 0057 executed with existing link',
      migration: '0058_contract_project_creation',
      index: 58,
      previousTag: '0057_contract_project_links',
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
        // The fixture is recorded through the current application, which
        // writes the nullable Opportunity Sales Stage and captures Commercial
        // Intake v4, both from 0066, which every baseline predates. Both are
        // shimmed only while the historic fixtures are recorded.
        const versionCheck = (
          await pool.query<{ definition: string }>(
            "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
          )
        ).rows[0];
        if (!versionCheck)
          throw new Error('Missing captured version constraint');
        await pool.query(
          'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
        );
        await pool.query(
          'ALTER TABLE opportunities ADD COLUMN sales_stage_id uuid',
        );
        const fixture = await acceptedOffer();
        await grantContract(fixture, 'historic-grant');
        const payload = {
          ...(await contractPayload(fixture)),
          termStartsOn: '2026-10-01',
          termEndsOn: '2026-12-31',
          specialConditions: 'Historic conditions\nkept exactly',
        };
        // C4's deferred evidence constraints require one coherent transaction.
        if (index >= 56) await pool.query('BEGIN');
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
        if (index >= 56) await pool.query('COMMIT');
        if (index >= 55) {
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
        if (index >= 56) {
          // Preserve an actual C4 approval shape, including its immutable
          // run, receipt and event. Its checksum is synthetic fixture evidence.
          await pool.query('BEGIN');
          await pool.query(
            `INSERT INTO contract_decisions(workspace_id,company_id,contract_id,contract_version_id,kind,result_revision,actor_internal_user_id,actor_workspace_membership_id,decided_at,quality_run_id,representation_checksum,acknowledged_warning_codes)
             SELECT workspace_id,company_id,contract_id,contract_version_id,'APPROVE',2,actor_internal_user_id,actor_workspace_membership_id,evaluated_at,id,repeat('1',64),'["ADDED_CONDITIONS_CONFIRMED"]'::jsonb FROM contract_quality_runs WHERE contract_id=$1`,
            [contractId],
          );
          await pool.query(
            `INSERT INTO contract_commands(workspace_id,company_id,actor_workspace_membership_id,idempotency_key,fingerprint,opportunity_id,result_contract_id,kind,result_decision_id,created_at)
             SELECT d.workspace_id,d.company_id,d.actor_workspace_membership_id,'historic-c4-approval',repeat('2',64),c.opportunity_id,c.id,'APPROVE',d.id,d.decided_at FROM contract_decisions d JOIN contracts c ON c.id=d.contract_id WHERE c.id=$1`,
            [contractId],
          );
          await pool.query(
            `INSERT INTO contract_events(workspace_id,company_id,action,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,metadata)
             SELECT d.workspace_id,d.company_id,'contract_version.approved',c.id,v.id,d.actor_internal_user_id,d.actor_workspace_membership_id,d.decided_at,
               jsonb_build_object('contractId',c.id,'contractVersionId',v.id,'versionNumber',v.version_number,'kind',c.kind,'origin',c.origin,'provenance','ILLUSTRATIVE','offerVersionId',c.source_offer_version_id,'pricingSnapshotId',v.pricing_snapshot_id,'ruleSetVersion',1,'acknowledgedWarningCodes',d.acknowledged_warning_codes)
             FROM contract_decisions d JOIN contracts c ON c.id=d.contract_id JOIN contract_versions v ON v.id=d.contract_version_id WHERE c.id=$1`,
            [contractId],
          );
          await pool.query(
            "UPDATE contract_versions SET decision_state='APPROVED' WHERE contract_id=$1",
            [contractId],
          );
          await pool.query('UPDATE contracts SET revision=2 WHERE id=$1', [
            contractId,
          ]);
          await pool.query('COMMIT');
        }
        if (index >= 57) {
          // These rows satisfy the immutable 0056 guards before CP1 exists.
          await pool.query('BEGIN');
          await pool.query(
            `INSERT INTO contract_signatures(workspace_id,company_id,contract_id,contract_version_id,result_revision,actor_internal_user_id,actor_workspace_membership_id,recorded_at,provider_signatory_label,client_signatory_label,provider_signed_on,client_signed_on,note,quality_run_id,representation_checksum,acknowledged_warning_codes)
             SELECT workspace_id,company_id,contract_id,contract_version_id,3,actor_internal_user_id,actor_workspace_membership_id,decided_at,'Historic provider','Historic Client',(decided_at AT TIME ZONE 'UTC')::date,(decided_at AT TIME ZONE 'UTC')::date,NULL,quality_run_id,representation_checksum,'[]'::jsonb FROM contract_decisions WHERE contract_id=$1`,
            [contractId],
          );
          await pool.query(
            `INSERT INTO contract_commands(workspace_id,company_id,actor_workspace_membership_id,idempotency_key,fingerprint,opportunity_id,result_contract_id,kind,result_signature_id,created_at)
             SELECT s.workspace_id,s.company_id,s.actor_workspace_membership_id,'historic-c5-signature',repeat('3',64),c.opportunity_id,c.id,'RECORD_SIGNATURE',s.id,s.recorded_at FROM contract_signatures s JOIN contracts c ON c.id=s.contract_id WHERE c.id=$1`,
            [contractId],
          );
          await pool.query(
            `INSERT INTO contract_events(workspace_id,company_id,action,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,metadata)
             SELECT s.workspace_id,s.company_id,'contract_version.signature_recorded',c.id,v.id,s.actor_internal_user_id,s.actor_workspace_membership_id,s.recorded_at,
               jsonb_build_object('contractId',c.id,'contractVersionId',v.id,'versionNumber',v.version_number,'kind',c.kind,'origin',c.origin,'provenance','ILLUSTRATIVE','offerVersionId',c.source_offer_version_id,'pricingSnapshotId',v.pricing_snapshot_id,'ruleSetVersion',1,'acknowledgedWarningCodes',s.acknowledged_warning_codes,'evidenceKind','SIMULATED')
             FROM contract_signatures s JOIN contracts c ON c.id=s.contract_id JOIN contract_versions v ON v.id=s.contract_version_id WHERE c.id=$1`,
            [contractId],
          );
          await pool.query(
            "UPDATE contract_versions SET execution_state='EXECUTED' WHERE contract_id=$1",
            [contractId],
          );
          await pool.query('UPDATE contracts SET revision=3 WHERE id=$1', [
            contractId,
          ]);
          await pool.query('COMMIT');
        }
        let historicLinks: unknown;
        if (index >= 58) {
          await grantLinkProject(fixture);
          const projectId = await createLinkProject(
            fixture,
            index === 59 ? 'Historic CP2 Project' : 'Historic CP1 Project',
          );
          await pool.query('BEGIN');
          const linkId = (
            await pool.query<{ id: string }>(
              `INSERT INTO contract_project_links(workspace_id,company_id,contract_id,project_id,result_revision,actor_internal_user_id,actor_workspace_membership_id,linked_at${index === 59 ? ',created' : ''}) SELECT workspace_id,company_id,id,$2,4,created_by_internal_user_id,created_by_workspace_membership_id,created_at${index === 59 ? ',true' : ''} FROM contracts WHERE id=$1 RETURNING id`,
              [contractId, projectId],
            )
          ).rows[0]?.id;
          if (!linkId) throw new Error('Missing historic CP1 link');
          await pool.query(
            `INSERT INTO contract_commands(workspace_id,company_id,actor_workspace_membership_id,idempotency_key,fingerprint,opportunity_id,result_contract_id,kind,result_project_link_id,created_at) SELECT workspace_id,company_id,created_by_workspace_membership_id,'historic-cp1-link',repeat('3',64),opportunity_id,id,'${index === 59 ? 'CREATE_PROJECT' : 'LINK_PROJECT'}',$2,created_at FROM contracts WHERE id=$1`,
            [contractId, linkId],
          );
          await pool.query(
            `INSERT INTO contract_events(workspace_id,company_id,action,contract_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,metadata) SELECT workspace_id,company_id,'contract_project.linked',id,created_by_internal_user_id,created_by_workspace_membership_id,created_at,jsonb_build_object('contractId',id::text,'projectId',$2::text,'created',${index === 59 ? 'true' : 'false'}) FROM contracts WHERE id=$1`,
            [contractId, projectId],
          );
          await pool.query('UPDATE contracts SET revision=4 WHERE id=$1', [
            contractId,
          ]);
          await pool.query('COMMIT');
          historicLinks = (
            await pool.query(
              'SELECT to_jsonb(l) AS row FROM contract_project_links l',
            )
          ).rows;
        }
        if (index >= 60) {
          const historyFixture = await acceptedOffer({ suffix: 'c8-history' });
          const historyPayload = await contractPayload(historyFixture);
          const historySource = historyPayload.acceptedOfferVersionId;
          await pool.query('BEGIN');
          try {
            const historyContract = (
              await pool.query<{ id: string }>(
                `INSERT INTO contracts(workspace_id,company_id,opportunity_id,client_request_id,original_client_account_id,source_offer_id,source_offer_version_id,illustrative_reference,created_by_internal_user_id,created_by_workspace_membership_id,created_at) SELECT workspace_id,company_id,opportunity_id,client_request_id,original_client_account_id,offer_id,id,1,created_by_internal_user_id,created_by_workspace_membership_id,created_at FROM offer_versions WHERE id=$1 RETURNING id`,
                [historySource],
              )
            ).rows[0]?.id;
            if (!historyContract)
              throw new Error('Missing C6 historic Contract');
            const firstVersion = (
              await pool.query<{ id: string }>(
                `INSERT INTO contract_versions(workspace_id,company_id,contract_id,opportunity_id,pricing_snapshot_id,recipient_client_account_id,recipient_kind,recipient_additional_legal_entity_id,recipient_legal_name,recipient_tax_id,recipient_legal_address,issuing_company_label,scope_note,commercial_conditions,created_by_internal_user_id,created_by_workspace_membership_id,created_at) SELECT workspace_id,company_id,$2,opportunity_id,pricing_snapshot_id,recipient_client_account_id,recipient_kind,recipient_additional_legal_entity_id,recipient_legal_name,recipient_tax_id,recipient_legal_address,issuing_company_label,scope_note,commercial_conditions,created_by_internal_user_id,created_by_workspace_membership_id,created_at FROM offer_versions WHERE id=$1 RETURNING id`,
                [historySource, historyContract],
              )
            ).rows[0]?.id;
            if (!firstVersion)
              throw new Error('Missing C6 historic first version');
            await pool.query(
              `INSERT INTO contract_commands(workspace_id,company_id,actor_workspace_membership_id,idempotency_key,fingerprint,opportunity_id,result_contract_id,created_at) SELECT workspace_id,company_id,created_by_workspace_membership_id,'historic-c6-create',$2,opportunity_id,id,created_at FROM contracts WHERE id=$1`,
              [
                historyContract,
                commandFingerprint({
                  opportunityId: historyFixture.opportunityId,
                  payload: historyPayload,
                }),
              ],
            );
            await pool.query(
              `INSERT INTO contract_reference_counters(workspace_id,company_id,kind,current_reference) SELECT workspace_id,company_id,kind,illustrative_reference FROM contracts WHERE id=$1`,
              [historyContract],
            );
            await pool.query(
              `INSERT INTO contract_events(workspace_id,company_id,action,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,metadata) SELECT c.workspace_id,c.company_id,e.action,c.id,e.version_id,c.created_by_internal_user_id,c.created_by_workspace_membership_id,c.created_at,jsonb_build_object('contractId',c.id,'kind',c.kind,'origin',c.origin,'provenance','ILLUSTRATIVE','illustrativeReference',c.illustrative_reference,'offerVersionId',c.source_offer_version_id,'pricingSnapshotId',v.pricing_snapshot_id)||CASE WHEN e.version_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('contractVersionId',v.id,'versionNumber',v.version_number) END FROM contracts c JOIN contract_versions v ON v.contract_id=c.id CROSS JOIN LATERAL (VALUES('contract.created',NULL::uuid),('contract_version.created',v.id)) e(action,version_id) WHERE c.id=$1`,
              [historyContract],
            );
            await pool.query('COMMIT');
            await pool.query('BEGIN');
            const successor = (
              await pool.query<{ id: string }>(
                `INSERT INTO contract_versions(workspace_id,company_id,contract_id,opportunity_id,version_number,created_contract_revision,predecessor_version_id,pricing_snapshot_id,recipient_client_account_id,recipient_kind,recipient_additional_legal_entity_id,recipient_legal_name,recipient_tax_id,recipient_legal_address,issuing_company_label,scope_note,commercial_conditions,special_conditions,created_by_internal_user_id,created_by_workspace_membership_id,created_at) SELECT workspace_id,company_id,contract_id,opportunity_id,2,2,id,pricing_snapshot_id,recipient_client_account_id,recipient_kind,recipient_additional_legal_entity_id,recipient_legal_name,recipient_tax_id,recipient_legal_address,issuing_company_label,scope_note,commercial_conditions,'Exact historic C6 successor',created_by_internal_user_id,created_by_workspace_membership_id,created_at FROM contract_versions WHERE id=$1 RETURNING id`,
                [firstVersion],
              )
            ).rows[0]?.id;
            if (!successor) throw new Error('Missing C6 historic successor');
            await pool.query(
              `UPDATE contract_versions SET superseded_by_version_id=$2,superseded_at=created_at WHERE id=$1`,
              [firstVersion, successor],
            );
            await pool.query('UPDATE contracts SET revision=2 WHERE id=$1', [
              historyContract,
            ]);
            await pool.query(
              `INSERT INTO contract_commands(workspace_id,company_id,actor_workspace_membership_id,idempotency_key,fingerprint,opportunity_id,result_contract_id,kind,result_version_id,created_at) SELECT workspace_id,company_id,created_by_workspace_membership_id,'historic-c6-revise',$2,opportunity_id,contract_id,'CREATE_VERSION',id,created_at FROM contract_versions WHERE id=$1`,
              [
                successor,
                commandFingerprint({
                  kind: 'CREATE_VERSION',
                  opportunityId: historyFixture.opportunityId,
                  payload: {
                    expectedContractRevision: 1,
                    specialConditions: 'Exact historic C6 successor',
                  },
                }),
              ],
            );
            await pool.query(
              `INSERT INTO contract_events(workspace_id,company_id,action,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,metadata) SELECT c.workspace_id,c.company_id,'contract_version.created',c.id,v.id,v.created_by_internal_user_id,v.created_by_workspace_membership_id,v.created_at,jsonb_build_object('contractId',c.id,'contractVersionId',v.id,'versionNumber',2,'predecessorVersionNumber',1,'kind','CONTRACT','origin','ACCEPTED_OFFER','offerVersionId',c.source_offer_version_id,'pricingSnapshotId',v.pricing_snapshot_id,'provenance','ILLUSTRATIVE') FROM contracts c JOIN contract_versions v ON v.contract_id=c.id WHERE v.id=$1`,
              [successor],
            );
            await pool.query('COMMIT');
          } catch (error: unknown) {
            await pool.query('ROLLBACK');
            throw error;
          }
        }
        if (index >= 61) {
          await pool.query('BEGIN');
          try {
            const child = (
              await pool.query<{ id: string }>(
                `INSERT INTO contracts(workspace_id,company_id,opportunity_id,client_request_id,original_client_account_id,kind,origin,parent_contract_id,addendum_ordinal,illustrative_reference,created_by_internal_user_id,created_by_workspace_membership_id,created_at)
              SELECT workspace_id,company_id,opportunity_id,client_request_id,original_client_account_id,'ADDENDUM',NULL,id,1,1,created_by_internal_user_id,created_by_workspace_membership_id,created_at FROM contracts WHERE id=$1 RETURNING id`,
                [contractId],
              )
            ).rows[0]?.id;
            if (!child) throw new Error('Missing historic Addendum');
            await pool.query(
              `INSERT INTO contract_versions(workspace_id,company_id,contract_id,opportunity_id,recipient_client_account_id,recipient_kind,recipient_additional_legal_entity_id,recipient_legal_name,recipient_tax_id,recipient_legal_address,issuing_company_label,change_summary,template_code,clause_versions,created_by_internal_user_id,created_by_workspace_membership_id,created_at)
              SELECT workspace_id,company_id,$2,opportunity_id,recipient_client_account_id,recipient_kind,recipient_additional_legal_entity_id,recipient_legal_name,recipient_tax_id,recipient_legal_address,issuing_company_label,'Exact historic Addendum','ADDENDUM_ILLUSTRATIVE','[{"code":"CL_SUBJECT","version":1},{"code":"CL_PRICE","version":1},{"code":"CL_TERM","version":1},{"code":"CL_CONDITIONS","version":1},{"code":"CL_CHANGE","version":1},{"code":"CL_GENERAL","version":1}]'::jsonb,created_by_internal_user_id,created_by_workspace_membership_id,created_at FROM contract_versions WHERE contract_id=$1`,
              [contractId, child],
            );
            await pool.query(
              `INSERT INTO contract_commands(workspace_id,company_id,actor_workspace_membership_id,idempotency_key,fingerprint,opportunity_id,result_contract_id,kind,created_at) SELECT workspace_id,company_id,created_by_workspace_membership_id,'historic-c8-create',repeat('8',64),opportunity_id,id,'CREATE',created_at FROM contracts WHERE id=$1`,
              [child],
            );
            await pool.query(
              `INSERT INTO contract_reference_counters(workspace_id,company_id,kind,current_reference) SELECT workspace_id,company_id,kind,illustrative_reference FROM contracts WHERE id=$1`,
              [child],
            );
            await pool.query(
              `INSERT INTO contract_events(workspace_id,company_id,action,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,metadata)
              SELECT c.workspace_id,c.company_id,e.action,c.id,e.version_id,c.created_by_internal_user_id,c.created_by_workspace_membership_id,c.created_at,jsonb_build_object('contractId',c.id,'kind','ADDENDUM','parentContractId',c.parent_contract_id,'addendumOrdinal',1,'provenance','ILLUSTRATIVE') || CASE WHEN e.version_id IS NULL THEN jsonb_build_object('illustrativeReference',1) ELSE jsonb_build_object('contractVersionId',v.id,'versionNumber',1) END
              FROM contracts c JOIN contract_versions v ON v.contract_id=c.id CROSS JOIN LATERAL(VALUES('contract.created',NULL::uuid),('contract_version.created',v.id)) e(action,version_id) WHERE c.id=$1`,
              [child],
            );
            await pool.query('COMMIT');
          } catch (error: unknown) {
            await pool.query('ROLLBACK');
            throw error;
          }
        }
        const historicSignatures =
          index >= 57
            ? (
                await pool.query(
                  'SELECT to_jsonb(s) AS row FROM contract_signatures s',
                )
              ).rows
            : null;
        const historicDecisions =
          index >= 56
            ? (
                await pool.query(
                  'SELECT to_jsonb(d) AS row FROM contract_decisions d',
                )
              ).rows
            : null;
        const historicQuality =
          index >= 55
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
        (SELECT jsonb_agg(to_jsonb(c)-ARRAY['direct_reason','parent_contract_id','addendum_ordinal','precontract_id']::text[] ORDER BY id) FROM contracts c) AS contracts,
        (SELECT jsonb_agg(CASE WHEN $1::boolean THEN to_jsonb(v)-'source_offer_version_id'-ARRAY['change_summary','template_code','template_version','clause_versions','created_contract_revision','predecessor_version_id','superseded_by_version_id','superseded_at','preliminary_work_scope','preliminary_financial_conditions','preliminary_limits']::text[] WHEN $4::boolean THEN to_jsonb(v)-'source_offer_version_id'-ARRAY['change_summary','preliminary_work_scope','preliminary_financial_conditions','preliminary_limits']::text[] ELSE to_jsonb(v)-'source_offer_version_id'-ARRAY['change_summary','created_contract_revision','predecessor_version_id','superseded_by_version_id','superseded_at','preliminary_work_scope','preliminary_financial_conditions','preliminary_limits']::text[] END ORDER BY id) FROM contract_versions v) AS versions,
        (SELECT jsonb_agg(CASE WHEN $3::boolean THEN to_jsonb(c)-'result_version_id' ELSE to_jsonb(c)-ARRAY['kind','result_quality_run_id','result_decision_id','result_signature_id','result_project_link_id','result_version_id']::text[] END ORDER BY id) FROM contract_commands c) AS commands,
        (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM contract_events e) AS events,
        (SELECT jsonb_agg(to_jsonb(r) ORDER BY company_id) FROM contract_reference_counters r) AS counters,
        (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM company_role_assignments a) AS permissions,
        (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM activity_log_events e) AS activity,
        (SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid IN ('contracts'::regclass,'contract_versions'::regclass,'contract_commands'::regclass,'contract_events'::regclass,'contract_reference_counters'::regclass) AND conname<>ALL($2::text[])) AS constraints,
        (SELECT jsonb_agg(pg_get_triggerdef(oid) ORDER BY tgname) FROM pg_trigger WHERE tgname IN ('contract_commands_immutable','contract_events_immutable')) AS guards`,
            [
              index === 53,
              [
                'contract_versions_source_offer_version_fk',
                'contract_versions_preparation_source_check',
                'contract_versions_template_binding_check',
                'contracts_precontract_fk',
                'contracts_parent_ordinal_unique',
                'contracts_parent_fk',
                'contracts_source_check',
                'contract_reference_counters_check',
                'contracts_addendum_evidence',
                'contracts_direct_evidence',
                'contracts_preparation_evidence',
                'contract_versions_lineage_check',
                'contract_versions_predecessor_fk',
                'contract_versions_successor_fk',
                'contract_commands_version_fk',
                'contracts_version_chain',
                'contract_versions_chain',
                'contracts_initial_check',
                'contract_versions_initial_check',
                'contract_events_target_check',
                'contract_events_metadata_check',
                'contract_commands_decision_fk',
                'contracts_decision_evidence',
                'contract_versions_decision_evidence',
                'contract_commands_kind_check',
                'contract_commands_run_fk',
                'contract_commands_signature_fk',
                'contract_commands_project_link_fk',
                'contracts_signature_evidence',
                'contract_versions_signature_evidence',
              ],
              index >= 59,
              index >= 60,
            ],
          );
        // Restore the baseline before upgrading it: no stage column, and v3.
        await pool.query(
          'ALTER TABLE opportunities DROP COLUMN sales_stage_id',
        );
        await pool.query(
          "UPDATE company_role_assignments SET permission_set_version='v3' WHERE bundle='company_commercial_intake' AND permission_set_version='v4'",
        );
        await pool.query(
          'ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ' +
            versionCheck.definition,
        );
        const before = (await evidence()).rows;
        await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
        expect((await evidence()).rows).toEqual(before);
        expect(
          (
            await pool.query(
              'SELECT id FROM contract_versions WHERE source_offer_version_id IS NOT NULL',
            )
          ).rowCount,
        ).toBe(0);
        expect(
          (
            await pool.query(
              "SELECT conname FROM pg_constraint WHERE conname='contracts_direct_evidence'",
            )
          ).rows,
        ).toEqual([{ conname: 'contracts_direct_evidence' }]);
        if (index === 58) {
          expect(
            (
              await pool.query(
                "SELECT to_jsonb(l)-'created' AS row FROM contract_project_links l",
              )
            ).rows,
          ).toEqual(historicLinks);
          expect(
            (await pool.query('SELECT created FROM contract_project_links'))
              .rows,
          ).toEqual([{ created: false }]);
        }
        if (index >= 59)
          expect(
            (
              await pool.query(
                'SELECT to_jsonb(l) AS row FROM contract_project_links l',
              )
            ).rows,
          ).toEqual(historicLinks);
        if (historicSignatures)
          expect(
            (
              await pool.query(
                'SELECT to_jsonb(s) AS row FROM contract_signatures s',
              )
            ).rows,
          ).toEqual(historicSignatures);
        if (historicDecisions)
          expect(
            (
              await pool.query(
                'SELECT to_jsonb(d) AS row FROM contract_decisions d',
              )
            ).rows,
          ).toEqual(historicDecisions);
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
              "SELECT kind,result_quality_run_id FROM contract_commands WHERE kind='CREATE' AND result_contract_id=$1",
              [contractId],
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
        if (index === 57) {
          await grantLinkProject(fixture);
          const projectId = await createLinkProject(
            fixture,
            'cp1-upgraded-executed-project',
          );
          expect(
            (
              await linkRequest(
                { fixture, base: path },
                { projectId, expectedContractRevision: 3 },
                'cp1-upgraded-link',
              )
            ).status,
          ).toBe(201);
          const linked = record(
            record(
              await json(await request({ path, companyId: fixture.companyId })),
            ).contract,
          );
          expect(linked.revision).toBe(4);
          expect(linked.version).toEqual(version);
          expect(
            (
              await pool.query(
                'SELECT to_jsonb(s) AS row FROM contract_signatures s',
              )
            ).rows,
          ).toEqual(historicSignatures);
          await expect(
            pool.query('UPDATE contracts SET revision=5 WHERE id=$1', [
              contractId,
            ]),
          ).rejects.toMatchObject({ code: '23514' });
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
  describe('adjusted Pricing Snapshots (#561)', () => {
    // Synthetic fixed discount of 8.63 on 300.00 at 15.00 %: adjusted line
    // 291.37 + 43.71 tax = 335.08, tax reduction 1.29. Never a real price.
    const SECRETS = ['8.63', '1.29', '335.08', 'Synthetic <discount>'];
    const ACCEPTED_OFFER_CODES = [
      'SOURCE_COMPANY_MATCHES',
      'PARTY_AVAILABLE',
      'PARTY_MATCHES_SOURCE',
      'PARTY_IDENTITY_MATCHES_SOURCE',
      'PARTY_IDENTITY_CURRENT',
      'PARTY_TAX_ID_RECORDED',
      'PRICE_MATCHES_ACCEPTED_OFFER',
      'PRICING_SNAPSHOT_COHERENT',
      'CONDITIONS_MATCH_ACCEPTED_OFFER',
      'ADDED_CONDITIONS_CONFIRMED',
      'PROVISIONAL_MARKER_PRESENT',
    ];
    it('checks, approves and signs a Contract over an adjusted accepted Snapshot under rule set v2 while an unadjusted Contract keeps v1', async () => {
      const fixture = await adjustedAcceptedOffer();
      await grantContract(fixture, 'cadj-grant');
      await grantApprover(fixture);
      const base = '/contracts/opportunities/' + fixture.opportunityId;
      const traceBefore = await snapshotTrace(fixture.snapshotId);
      const created = record(
        await command({
          path: base,
          companyId: fixture.companyId,
          key: 'cadj-create',
          body: await contractPayload(fixture),
        }),
      );
      const version = record(created.version);
      expect(version).toMatchObject({
        pricingSnapshotId: fixture.snapshotId,
        qualityRuleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
        qualityRuleSetVersion: 2,
        representation: {
          templateCode: 'CONTRACT_ILLUSTRATIVE',
          templateVersion: 1,
        },
      });
      const representation = record(version.representation);
      const html = String(representation.html);
      expect(html).toContain(
        'Fixed discount: Synthetic &lt;discount&gt; &amp; &quot;reason&quot;',
      );
      expect(html).toContain('335.08 EUR');
      const versionPath = base + '/versions/' + stringField(version, 'id');
      const run = record(
        await command({
          path: versionPath + '/quality-checks',
          companyId: fixture.companyId,
          key: 'cadj-run',
          body: {},
        }),
      );
      expect(run).toMatchObject({
        ruleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
        ruleSetVersion: 2,
      });
      expect(run.results).toEqual(
        ACCEPTED_OFFER_CODES.map((code) => ({ code, status: 'PASS' })),
      );
      const approval = record(
        await command({
          path: versionPath + '/approve',
          companyId: fixture.companyId,
          key: 'cadj-approve',
          body: { expectedContractRevision: 1, acknowledgedWarningCodes: [] },
        }),
      );
      expect(approval).toMatchObject({
        kind: 'APPROVE',
        representationChecksum: representation.sha256,
        qualityRun: { ruleSetVersion: 2 },
      });
      const signature = record(
        await command({
          path: versionPath + '/signature',
          companyId: fixture.companyId,
          key: 'cadj-sign',
          body: signaturePayload(),
        }),
      );
      expect(signature).toMatchObject({
        representationChecksum: representation.sha256,
        qualityRun: { ruleSetVersion: 2 },
      });
      const executed = record(
        record(
          await json(
            await request({ path: base, companyId: fixture.companyId }),
          ),
        ).contract,
      );
      expect(record(executed.version)).toMatchObject({
        qualityRuleSetVersion: 2,
        executionState: 'EXECUTED',
        representation: { sha256: representation.sha256 },
        decision: { qualityRun: { ruleSetVersion: 2 } },
        signature: { qualityRun: { ruleSetVersion: 2 } },
        latestQualityRun: { ruleSetVersion: 2 },
      });
      expect(
        (
          await pool.query<{ version: number }>(
            'SELECT rule_set_version AS version FROM contract_quality_runs ORDER BY sequence',
          )
        ).rows.map((row) => row.version),
      ).toEqual([2, 2, 2]);
      const events = (
        await pool.query<{ action: string; metadata: unknown }>(
          "SELECT action,metadata FROM contract_events WHERE action IN ('contract_version.approved','contract_version.signature_recorded') ORDER BY action",
        )
      ).rows;
      expect(
        events.map((event) => [
          event.action,
          record(event.metadata).ruleSetVersion,
        ]),
      ).toEqual([
        ['contract_version.approved', 2],
        ['contract_version.signature_recorded', 2],
      ]);
      const serialized = JSON.stringify(
        (await pool.query('SELECT metadata FROM contract_events')).rows,
      );
      for (const secret of SECRETS) expect(serialized).not.toContain(secret);
      expect(await snapshotTrace(fixture.snapshotId)).toEqual(traceBefore);

      // An unadjusted Contract keeps rule set v1 and its v1 evidence.
      const plain = await acceptedOffer({ suffix: '-plain' });
      await grantContract(plain, 'cadj-plain-grant');
      await grantApprover(plain);
      const plainBase = '/contracts/opportunities/' + plain.opportunityId;
      const plainVersion = record(
        record(
          await command({
            path: plainBase,
            companyId: plain.companyId,
            key: 'cadj-plain-create',
            body: await contractPayload(plain),
          }),
        ).version,
      );
      expect(plainVersion).toMatchObject({
        qualityRuleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
        qualityRuleSetVersion: 1,
      });
      expect(String(record(plainVersion.representation).html)).not.toContain(
        'Fixed discount',
      );
      const plainPath =
        plainBase + '/versions/' + stringField(plainVersion, 'id');
      expect(
        await command({
          path: plainPath + '/approve',
          companyId: plain.companyId,
          key: 'cadj-plain-approve',
          body: { expectedContractRevision: 1, acknowledgedWarningCodes: [] },
        }),
      ).toMatchObject({ qualityRun: { ruleSetVersion: 1 } });
      expect(
        (
          await pool.query<{ metadata: unknown }>(
            "SELECT metadata FROM contract_events WHERE company_id=$1 AND action='contract_version.approved'",
            [plain.companyId],
          )
        ).rows.map((row) => record(row.metadata).ruleSetVersion),
      ).toEqual([1]);
    });
    it('C7 prepares, approves and signs a Precontract over an adjusted accepted Snapshot under rule set v2', async () => {
      const fixture = await adjustedAcceptedOffer();
      await grantContract(fixture, 'cadj-c7-grant');
      await grantApprover(fixture);
      const base = '/contracts/opportunities/' + fixture.opportunityId;
      const created = identifiedRecord(
        await command({
          path: base,
          companyId: fixture.companyId,
          key: 'cadj-c7-create',
          body: { ...(await contractPayload(fixture)), ...precontractFields() },
        }),
      );
      const version = record(created.version);
      expect(version).toMatchObject({
        qualityRuleSetVersion: 2,
        representation: { templateCode: 'PRECONTRACT_ILLUSTRATIVE' },
      });
      expect(String(record(version.representation).html)).toContain(
        'Fixed discount: Synthetic',
      );
      const versionPath =
        base +
        '/agreements/' +
        created.id +
        '/versions/' +
        stringField(version, 'id');
      expect(
        await command({
          path: versionPath + '/approve',
          companyId: fixture.companyId,
          key: 'cadj-c7-approve',
          body: {
            expectedContractRevision: 1,
            acknowledgedWarningCodes: ['ADDED_CONDITIONS_CONFIRMED'],
          },
        }),
      ).toMatchObject({ qualityRun: { ruleSetVersion: 2 } });
      expect(
        await command({
          path: versionPath + '/signature',
          companyId: fixture.companyId,
          key: 'cadj-c7-sign',
          body: signaturePayload(),
        }),
      ).toMatchObject({ qualityRun: { ruleSetVersion: 2 } });
      expect(await decisionEventRuleSets(created.id)).toEqual([
        ['contract_version.approved', 2],
        ['contract_version.signature_recorded', 2],
      ]);
    });
    it('C9 and C8 bind v2 for a direct Contract and an Addendum that select adjusted Snapshots, and v1 for an Addendum without one', async () => {
      const fixture = await adjustedSnapshotFixture();
      await grantContract(fixture, 'cadj-c9-grant');
      await grantApprover(fixture);
      const base = '/contracts/opportunities/' + fixture.opportunityId;
      const direct = identifiedRecord(
        await command({
          path: base + '/direct',
          companyId: fixture.companyId,
          key: 'cadj-c9-create',
          body: {
            recipient: { kind: 'PRIMARY' },
            pricingSnapshotId: fixture.snapshotId,
            directReason: 'Synthetic direct reason',
            scopeNote: 'Synthetic direct scope',
          },
        }),
      );
      const directVersion = record(direct.version);
      expect(directVersion).toMatchObject({ qualityRuleSetVersion: 2 });
      const agreement = base + '/agreements/' + direct.id;
      const directPath =
        agreement + '/versions/' + stringField(directVersion, 'id');
      expect(
        await command({
          path: directPath + '/approve',
          companyId: fixture.companyId,
          key: 'cadj-c9-approve',
          body: {
            expectedContractRevision: 1,
            acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'],
          },
        }),
      ).toMatchObject({ qualityRun: { ruleSetVersion: 2 } });
      expect(
        await command({
          path: directPath + '/signature',
          companyId: fixture.companyId,
          key: 'cadj-c9-sign',
          body: signaturePayload(),
        }),
      ).toMatchObject({ qualityRun: { ruleSetVersion: 2 } });
      const addendumSnapshot = await adjustedSnapshot(
        fixture,
        '20.00',
        'addendum',
      );
      const addendum = identifiedRecord(
        await command({
          path: agreement + '/addenda',
          companyId: fixture.companyId,
          key: 'cadj-c8-create',
          body: {
            expectedContractRevision: 3,
            changeSummary: 'Synthetic adjusted change',
            pricingSnapshotId: addendumSnapshot.id,
          },
        }),
      );
      const addendumVersion = record(addendum.version);
      expect(addendumVersion).toMatchObject({ qualityRuleSetVersion: 2 });
      const addendumPath =
        base +
        '/agreements/' +
        addendum.id +
        '/versions/' +
        stringField(addendumVersion, 'id');
      expect(
        await command({
          path: addendumPath + '/approve',
          companyId: fixture.companyId,
          key: 'cadj-c8-approve',
          body: { expectedContractRevision: 1, acknowledgedWarningCodes: [] },
        }),
      ).toMatchObject({ qualityRun: { ruleSetVersion: 2 } });
      expect(
        await command({
          path: addendumPath + '/signature',
          companyId: fixture.companyId,
          key: 'cadj-c8-sign',
          body: signaturePayload(),
        }),
      ).toMatchObject({ qualityRun: { ruleSetVersion: 2 } });
      expect(await decisionEventRuleSets(addendum.id)).toEqual([
        ['contract_version.approved', 2],
        ['contract_version.signature_recorded', 2],
      ]);
      const unpriced = identifiedRecord(
        await command({
          path: agreement + '/addenda',
          companyId: fixture.companyId,
          key: 'cadj-c8-unpriced',
          body: {
            expectedContractRevision: 3,
            changeSummary: 'Synthetic change without a Snapshot',
          },
        }),
      );
      const unpricedVersion = record(unpriced.version);
      expect(unpricedVersion).toMatchObject({ qualityRuleSetVersion: 1 });
      expect(
        await command({
          path:
            base +
            '/agreements/' +
            unpriced.id +
            '/versions/' +
            stringField(unpricedVersion, 'id') +
            '/quality-checks',
          companyId: fixture.companyId,
          key: 'cadj-c8-unpriced-run',
          body: {},
        }),
      ).toMatchObject({ ruleSetVersion: 1 });
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
      'records PRICING_SNAPSHOT_COHERENT ERROR under v2 for $name and refuses approval',
      async ({ sql }) => {
        const fixture = await adjustedAcceptedOffer();
        await grantContract(fixture, 'cadj-tamper-grant');
        await grantApprover(fixture);
        const base = '/contracts/opportunities/' + fixture.opportunityId;
        const version = record(
          record(
            await command({
              path: base,
              companyId: fixture.companyId,
              key: 'cadj-tamper-create',
              body: await contractPayload(fixture),
            }),
          ).version,
        );
        await pool.query(sql, [fixture.snapshotId]);
        const traceBefore = await snapshotTrace(fixture.snapshotId);
        const versionId = stringField(version, 'id');
        const run = record(
          await command({
            path: base + '/versions/' + versionId + '/quality-checks',
            companyId: fixture.companyId,
            key: 'cadj-tamper-run',
            body: {},
          }),
        );
        expect(run).toMatchObject({ ruleSetVersion: 2 });
        expect(run.results).toEqual(
          ACCEPTED_OFFER_CODES.map((code) => ({
            code,
            status: code === 'PRICING_SNAPSHOT_COHERENT' ? 'ERROR' : 'PASS',
          })),
        );
        const refused = await decisionRequest(
          fixture,
          versionId,
          'approve',
          { expectedContractRevision: 1, acknowledgedWarningCodes: [] },
          'cadj-tamper-approve',
        );
        expect(refused.status).toBe(409);
        expect(await json(refused)).toMatchObject({
          code: 'QUALITY_CHECK_ERRORS',
        });
        expect(await snapshotTrace(fixture.snapshotId)).toEqual(traceBefore);
      },
    );
    it('refuses signature with QUALITY_CHECK_ERRORS when the adjusted trace becomes incoherent after approval', async () => {
      const fixture = await adjustedAcceptedOffer();
      await grantContract(fixture, 'cadj-late-grant');
      await grantApprover(fixture);
      const base = '/contracts/opportunities/' + fixture.opportunityId;
      const versionId = stringField(
        record(
          record(
            await command({
              path: base,
              companyId: fixture.companyId,
              key: 'cadj-late-create',
              body: await contractPayload(fixture),
            }),
          ).version,
        ),
        'id',
      );
      expect(
        (
          await decisionRequest(
            fixture,
            versionId,
            'approve',
            { expectedContractRevision: 1, acknowledgedWarningCodes: [] },
            'cadj-late-approve',
          )
        ).status,
      ).toBe(201);
      await pool.query(
        "UPDATE pricing_snapshot_adjustments SET applied_at = applied_at + interval '1 second' WHERE snapshot_id = $1",
        [fixture.snapshotId],
      );
      const before = await signatureCounts();
      const refused = await signatureRequest(
        fixture,
        versionId,
        signaturePayload(),
        'cadj-late-sign',
      );
      expect(refused.status).toBe(409);
      expect(await json(refused)).toMatchObject({
        code: 'QUALITY_CHECK_ERRORS',
      });
      expect(await signatureCounts()).toEqual(before);
    });
    it('C6 re-derives rule set v2 for a revision from its unchanged adjusted source', async () => {
      const fixture = await adjustedAcceptedOffer();
      await grantContract(fixture, 'cadj-c6-grant');
      const base = '/contracts/opportunities/' + fixture.opportunityId;
      await command({
        path: base,
        companyId: fixture.companyId,
        key: 'cadj-c6-create',
        body: await contractPayload(fixture),
      });
      const revised = await reviseRequest(
        { fixture },
        {
          expectedContractRevision: 1,
          specialConditions: 'Synthetic revised conditions',
        },
        'cadj-c6-revise',
      );
      expect(revised.status).toBe(201);
      const version = record(
        record(
          record(
            await json(
              await request({ path: base, companyId: fixture.companyId }),
            ),
          ).contract,
        ).version,
      );
      expect(version).toMatchObject({
        versionNumber: 2,
        pricingSnapshotId: fixture.snapshotId,
        qualityRuleSetVersion: 2,
      });
      const run = record(
        await command({
          path:
            base +
            '/versions/' +
            stringField(version, 'id') +
            '/quality-checks',
          companyId: fixture.companyId,
          key: 'cadj-c6-run',
          body: {},
        }),
      );
      expect(run).toMatchObject({ ruleSetVersion: 2 });
      expect(run.results).toEqual(
        ACCEPTED_OFFER_CODES.map((code) => ({
          code,
          status: code === 'ADDED_CONDITIONS_CONFIRMED' ? 'WARNING' : 'PASS',
        })),
      );
    });
    it('keeps an older v1 run of a pending adjusted version readable and binds its next run to v2', async () => {
      const fixture = await adjustedAcceptedOffer();
      await grantContract(fixture, 'cadj-legacy-grant');
      await grantApprover(fixture);
      const base = '/contracts/opportunities/' + fixture.opportunityId;
      const version = record(
        record(
          await command({
            path: base,
            companyId: fixture.companyId,
            key: 'cadj-legacy-create',
            body: await contractPayload(fixture),
          }),
        ).version,
      );
      const versionId = stringField(version, 'id');
      // A run recorded before rule set v2 existed: v1 could only report ERROR.
      const legacy = ACCEPTED_OFFER_CODES.map((code) => ({
        code,
        status: code === 'PRICING_SNAPSHOT_COHERENT' ? 'ERROR' : 'PASS',
      }));
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'ALTER TABLE contract_quality_runs DISABLE TRIGGER contract_quality_runs_bound_rule_set',
        );
        await client.query(
          'INSERT INTO contract_quality_runs (workspace_id,company_id,contract_id,contract_version_id,rule_set_version,actor_internal_user_id,actor_workspace_membership_id,evaluated_at,results) SELECT workspace_id,company_id,contract_id,id,1,created_by_internal_user_id,created_by_workspace_membership_id,created_at,$2 FROM contract_versions WHERE id=$1',
          [versionId, JSON.stringify(legacy)],
        );
        await client.query(
          'ALTER TABLE contract_quality_runs ENABLE TRIGGER contract_quality_runs_bound_rule_set',
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      const reread = record(
        record(
          await json(
            await request({ path: base, companyId: fixture.companyId }),
          ),
        ).contract,
      );
      expect(record(reread.version)).toMatchObject({
        qualityRuleSetVersion: 2,
        latestQualityRun: { ruleSetVersion: 1, results: legacy },
      });
      const history = record(
        await json(
          await request({
            path: base + '/versions/' + versionId + '/quality-checks',
            companyId: fixture.companyId,
          }),
        ),
      );
      expect(history.items).toMatchObject([{ ruleSetVersion: 1 }]);
      expect(
        await command({
          path: base + '/versions/' + versionId + '/approve',
          companyId: fixture.companyId,
          key: 'cadj-legacy-approve',
          body: { expectedContractRevision: 1, acknowledgedWarningCodes: [] },
        }),
      ).toMatchObject({ qualityRun: { ruleSetVersion: 2 } });
      expect(
        (
          await pool.query<{ version: number }>(
            'SELECT rule_set_version AS version FROM contract_quality_runs ORDER BY sequence',
          )
        ).rows.map((row) => row.version),
      ).toEqual([1, 2]);
    });
    it('replays a v2 approval exactly and keeps permission and Company boundaries', async () => {
      const fixture = await adjustedAcceptedOffer();
      await grantContract(fixture, 'cadj-replay-grant');
      await grantApprover(fixture);
      const base = '/contracts/opportunities/' + fixture.opportunityId;
      const versionId = stringField(
        record(
          record(
            await command({
              path: base,
              companyId: fixture.companyId,
              key: 'cadj-replay-create',
              body: await contractPayload(fixture),
            }),
          ).version,
        ),
        'id',
      );
      const body = {
        expectedContractRevision: 1,
        acknowledgedWarningCodes: [],
      };
      const first = await decisionRequest(
        fixture,
        versionId,
        'approve',
        body,
        'cadj-replay-approve',
      );
      expect(first.status).toBe(201);
      const approved = await json(first);
      expect(approved).toMatchObject({ qualityRun: { ruleSetVersion: 2 } });
      const replay = await decisionRequest(
        fixture,
        versionId,
        'approve',
        body,
        'cadj-replay-approve',
      );
      expect(replay.status).toBe(201);
      expect(await json(replay)).toEqual(approved);
      const other = await preparedOffer('-other');
      await grantContract(other, 'cadj-other-grant');
      const crossCompany = await request({
        path: base,
        companyId: other.companyId,
      });
      expect(crossCompany.status).toBe(404);
      const revoked = await request({
        path:
          '/company-contract-approver-assignments/' +
          fixture.actorMembershipId +
          '/' +
          fixture.companyId,
        init: {
          method: 'DELETE',
          headers: { 'idempotency-key': 'cadj-revoke-approver' },
        },
      });
      expect(revoked.status).toBe(200);
      const denied = await decisionRequest(
        fixture,
        versionId,
        'approve',
        body,
        'cadj-replay-approve',
      );
      expect(denied.status).toBe(403);
      expect(
        (
          await pool.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM contract_events WHERE action='contract_version.approved'",
          )
        ).rows[0]?.count,
      ).toBe('1');
    });
  });
  async function adjustedSnapshotFixture(): Promise<PreparedOffer> {
    const fixture = await preparedOffer();
    await command({
      path: '/company-pricing-adjustment-assignments',
      body: {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      key: 'cadj-grant-adjustment',
    });
    const snapshot = await adjustedSnapshot(fixture, '8.63', 'first');
    return { ...fixture, snapshotId: snapshot.id };
  }
  async function adjustedAcceptedOffer(): Promise<PreparedOffer> {
    return acceptedOffer({ prepared: await adjustedSnapshotFixture() });
  }
  async function adjustedSnapshot(
    fixture: PreparedOffer,
    netReduction: string,
    key: string,
  ) {
    return identifiedRecord(
      await command({
        path: `/pricing/opportunities/${fixture.opportunityId}/snapshots`,
        body: {
          pricingRuleVersionNumber: fixture.ruleVersionNumber,
          lines: [
            {
              offeringId: fixture.offeringId,
              tariffVersionNumber: fixture.tariffVersionNumber,
              quantity: '1',
              adjustment: {
                type: 'FIXED_NET_DISCOUNT',
                netReduction,
                reason: 'Synthetic <discount> & "reason"',
              },
            },
          ],
        },
        key: 'cadj-snapshot-' + key,
        companyId: fixture.companyId,
      }),
    );
  }
  async function snapshotTrace(snapshotId: string) {
    return (
      await pool.query(
        'SELECT (SELECT to_jsonb(s) FROM pricing_snapshots s WHERE s.id=$1) AS snapshot,(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.line_number) FROM pricing_snapshot_lines l WHERE l.snapshot_id=$1) AS lines,(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM pricing_snapshot_adjustments a WHERE a.snapshot_id=$1) AS adjustments',
        [snapshotId],
      )
    ).rows;
  }
  async function decisionEventRuleSets(contractId: string) {
    return (
      await pool.query<{ action: string; metadata: unknown }>(
        "SELECT action,metadata FROM contract_events WHERE contract_id=$1 AND action IN ('contract_version.approved','contract_version.signature_recorded') ORDER BY action",
        [contractId],
      )
    ).rows.map((event) => [
      event.action,
      record(event.metadata).ruleSetVersion,
    ]);
  }
  async function projectLinkFixture() {
    const target = await approvedSignatureFixture();
    expect(
      (
        await signatureRequest(
          target.fixture,
          target.versionId,
          signaturePayload(),
          'cp1-fixture-signature',
        )
      ).status,
    ).toBe(201);
    await grantLinkProject(target.fixture);
    const projectId = await createLinkProject(target.fixture, 'cp1-existing');
    return { ...target, projectId };
  }
  async function grantLinkProject(fixture: PreparedOffer) {
    return command({
      path: '/company-project-assignments',
      body: {
        workspaceMembershipId: fixture.actorMembershipId,
        companyId: fixture.companyId,
      },
      key: 'cp1-project-grant-' + Date.now(),
    });
  }
  async function createLinkProject(
    fixture: PreparedOffer,
    title: string,
    clientId = fixture.clientId,
  ) {
    return stringField(
      record(
        await command({
          path: '/projects',
          companyId: fixture.companyId,
          body: { title, clientAccountId: clientId },
          key: title,
        }),
      ),
      'id',
    );
  }
  function linkRequest(
    target: { fixture: PreparedOffer; base: string },
    body: unknown,
    key: string,
    headers: Record<string, string> = {},
  ) {
    return request({
      path: target.base + '/projects',
      companyId: target.fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        body: JSON.stringify(body),
      },
    });
  }
  async function projectCreationFixture() {
    const target = await approvedSignatureFixture();
    await signatureRequest(
      target.fixture,
      target.versionId,
      signaturePayload(),
      'cp2-execution',
    );
    await grantLinkProject(target.fixture);
    return target;
  }
  function creationPayload(ids: string[] = []) {
    return {
      title: 'Synthetic CP2 Project',
      acknowledgedCandidateProjectIds: ids,
      expectedContractRevision: 3,
    };
  }
  function createProjectRequest(
    target: { fixture: PreparedOffer; base: string },
    body: unknown,
    key: string,
    headers: Record<string, string> = {},
  ) {
    return request({
      path: target.base + '/projects/create',
      companyId: target.fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        body: JSON.stringify(body),
      },
    });
  }
  async function creationCounts(clientId: string) {
    const row = (
      await pool.query<{
        projects: string;
        links: string;
        events: string;
        receipts: string;
        revision: number;
        clientVersion: number;
      }>(
        'SELECT (SELECT count(*) FROM projects)::text AS projects,(SELECT count(*) FROM contract_project_links)::text AS links,(SELECT count(*) FROM project_creation_events)::text AS events,(SELECT count(*) FROM contract_commands WHERE kind=\'CREATE_PROJECT\')::text AS receipts,(SELECT revision FROM contracts LIMIT 1) AS revision,(SELECT version FROM client_accounts WHERE id=$1) AS "clientVersion"',
        [clientId],
      )
    ).rows[0];
    if (!row) throw new Error('Missing CP2 counts');
    return row;
  }
  async function closeLinkProject(
    target: { fixture: PreparedOffer },
    projectId: string,
    grant = true,
  ) {
    if (grant)
      await command({
        path: '/company-project-approver-assignments',
        body: {
          workspaceMembershipId: target.fixture.actorMembershipId,
          companyId: target.fixture.companyId,
        },
        key: 'cp1-close-grant',
      });
    const response = await request({
      path: '/projects/' + projectId + '/lifecycle-transitions',
      companyId: target.fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'cp1-close-' + projectId,
        },
        body: JSON.stringify({
          action: 'cancel',
          expectedLifecycleRevision: 0,
          reason: 'Synthetic closed Project',
        }),
      },
    });
    if (grant) expect(response.status).toBe(200);
    return response;
  }
  async function projectLinkCounts() {
    const row = (
      await pool.query<{
        links: string;
        receipts: string;
        events: string;
        revision: number;
      }>(
        "SELECT (SELECT count(*) FROM contract_project_links)::text AS links,(SELECT count(*) FROM contract_commands WHERE kind='LINK_PROJECT')::text AS receipts,(SELECT count(*) FROM contract_events WHERE action='contract_project.linked')::text AS events,(SELECT revision FROM contracts LIMIT 1) AS revision",
      )
    ).rows[0];
    if (!row) throw new Error('Missing Contract Project counts');
    return row;
  }

  function preliminaryEntry() {
    return {
      preliminaryWorkScope: 'Synthetic preliminary survey\nexactly kept',
      preliminaryFinancialConditions: 'Synthetic advance capped at cost',
      preliminaryLimits: 'Synthetic limit until the Contract',
      termEndsOn: '2026-12-31',
    };
  }
  function precontractFields() {
    return { kind: 'PRECONTRACT', ...preliminaryEntry() };
  }
  async function precontractFixture({ create = true } = {}) {
    const fixture = await acceptedOffer();
    await grantContract(fixture, 'c7-fixture-grant');
    const base = '/contracts/opportunities/' + fixture.opportunityId;
    const source = await contractPayload(fixture);
    const created = create
      ? identifiedRecord(
          await command({
            path: base,
            companyId: fixture.companyId,
            key: 'c7-fixture-create',
            body: { ...source, ...precontractFields() },
          }),
        )
      : null;
    return {
      fixture,
      base,
      source,
      created: created ?? { id: '', version: {} },
      agreement: created ? base + '/agreements/' + created.id : '',
      versionId: created ? stringField(record(created.version), 'id') : '',
    };
  }
  async function executePrecontract(target: {
    fixture: PreparedOffer;
    agreement: string;
    versionId: string;
  }) {
    const path = target.agreement + '/versions/' + target.versionId;
    await command({
      path: path + '/approve',
      companyId: target.fixture.companyId,
      key: 'c7-execute-approve',
      body: {
        expectedContractRevision: 1,
        acknowledgedWarningCodes: ['ADDED_CONDITIONS_CONFIRMED'],
      },
    });
    await command({
      path: path + '/signature',
      companyId: target.fixture.companyId,
      key: 'c7-execute-sign',
      body: signaturePayload(),
    });
  }
  async function agreementCounts() {
    const row = (
      await pool.query<{
        contracts: string;
        versions: string;
        receipts: string;
        events: string;
        counters: string;
      }>(
        'SELECT (SELECT count(*) FROM contracts)::text AS contracts,(SELECT count(*) FROM contract_versions)::text AS versions,(SELECT count(*) FROM contract_commands)::text AS receipts,(SELECT count(*) FROM contract_events)::text AS events,(SELECT count(*) FROM contract_reference_counters)::text AS counters',
      )
    ).rows[0];
    if (!row) throw new Error('Missing agreement counts.');
    return row;
  }
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
  function signaturePayload() {
    return {
      expectedContractRevision: 2,
      providerSignatoryLabel: 'Synthetic provider',
      clientSignatoryLabel: 'Synthetic Client',
      providerSignedOn: '2026-09-27',
      clientSignedOn: '2026-09-27',
      note: null,
      acknowledgedWarningCodes: [],
    };
  }
  async function approvedSignatureFixture(
    content: { specialConditions?: string; termEndsOn?: string } = {},
  ) {
    const target = await qualityFixture(content);
    await grantApprover(target.fixture);
    const response = await decisionRequest(
      target.fixture,
      target.versionId,
      'approve',
      {
        expectedContractRevision: 1,
        acknowledgedWarningCodes: content.specialConditions
          ? ['ADDED_CONDITIONS_CONFIRMED']
          : [],
      },
      'signature-fixture-approval',
    );
    expect(response.status).toBe(201);
    return target;
  }
  function signatureRequest(
    fixture: PreparedOffer,
    versionId: string,
    body: unknown,
    key: string,
    headers: Record<string, string> = {},
  ) {
    return request({
      path:
        '/contracts/opportunities/' +
        fixture.opportunityId +
        '/versions/' +
        versionId +
        '/signature',
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        body: JSON.stringify(body),
      },
    });
  }
  async function signatureCounts() {
    const row = (
      await pool.query<{
        signatures: string;
        runs: string;
        receipts: string;
        events: string;
        revision: number;
      }>(
        "SELECT (SELECT count(*) FROM contract_signatures)::text AS signatures,(SELECT count(*) FROM contract_quality_runs)::text AS runs,(SELECT count(*) FROM contract_commands WHERE kind='RECORD_SIGNATURE')::text AS receipts,(SELECT count(*) FROM contract_events WHERE action='contract_version.signature_recorded')::text AS events,(SELECT revision FROM contracts LIMIT 1) AS revision",
      )
    ).rows[0];
    if (!row) throw new Error('Missing signature evidence counts.');
    return row;
  }
  async function decisionRequest(
    fixture: PreparedOffer,
    versionId: string,
    kind: 'approve' | 'reject' | 'signature',
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
  async function directFixture(approved = false) {
    const fixture = await preparedOffer();
    await grantContract(fixture, 'c9-direct-fixture');
    await grantApprover(fixture);
    const base = '/contracts/opportunities/' + fixture.opportunityId,
      created = record(
        await command({
          path: base + '/direct',
          companyId: fixture.companyId,
          key: 'c9-direct-fixture-create',
          body: {
            recipient: { kind: 'PRIMARY' },
            pricingSnapshotId: fixture.snapshotId,
            directReason: 'Synthetic direct fixture',
            scopeNote: 'Synthetic direct scope',
          },
        }),
      );
    const versionId = stringField(record(created.version), 'id');
    if (approved)
      expect(
        (
          await decisionRequest(
            fixture,
            versionId,
            'approve',
            {
              expectedContractRevision: 1,
              acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'],
            },
            'c9-direct-fixture-approval',
          )
        ).status,
      ).toBe(201);
    return {
      fixture,
      base,
      created,
      versionId,
      path: base + '/versions/' + versionId + '/quality-checks',
    };
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
  async function earlySourceFixture(
    stopAt: 'DRAFT' | 'APPROVED' | 'TRANSMITTED' | 'ACCEPTED' = 'TRANSMITTED',
    prepared?: PreparedOffer,
  ) {
    const fixture = await acceptedOffer({
      stopAt,
      prepared,
      suffix: prepared?.companyId ?? '',
    });
    await grantContract(fixture, 'early-fixture-preparer-' + fixture.companyId);
    await command({
      path: '/company-contract-early-preparation-assignments',
      key: 'early-fixture-opt-in-' + fixture.companyId,
      body: {
        companyId: fixture.companyId,
        workspaceMembershipId: fixture.actorMembershipId,
      },
    });
    const body = {
      sourceOfferVersionId: (await contractPayload(fixture))
        .acceptedOfferVersionId,
    };
    const base = '/contracts/opportunities/' + fixture.opportunityId;
    return { fixture, body, base };
  }
  async function earlyContract(prepared?: PreparedOffer) {
    const target = await earlySourceFixture('TRANSMITTED', prepared);
    const created = record(
      await command({
        path: target.base + '/preparation',
        companyId: target.fixture.companyId,
        body: target.body,
        key: 'early-fixture-create',
      }),
    );
    return { ...target, created };
  }
  async function sendEarly({
    fixture,
    path,
    body,
    key,
  }: {
    fixture: PreparedOffer;
    path: string;
    body: unknown;
    key: string;
  }) {
    return request({
      path,
      companyId: fixture.companyId,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify(body),
      },
    });
  }
  async function earlyEffects() {
    return (
      await pool.query<{ effects: unknown }>(`SELECT jsonb_build_object(
      'contracts',(SELECT count(*) FROM contracts), 'versions',(SELECT count(*) FROM contract_versions),
      'receipts',(SELECT count(*) FROM contract_commands), 'events',(SELECT count(*) FROM contract_events),
      'references',(SELECT jsonb_agg(to_jsonb(c) ORDER BY company_id,kind) FROM contract_reference_counters c),
      'clientVersions',(SELECT jsonb_agg(jsonb_build_object('id',id,'version',version) ORDER BY id) FROM client_accounts)) AS effects`)
    ).rows;
  }
  async function successorSource(
    fixture: PreparedOffer,
    recipient:
      { kind: 'PRIMARY' } | { kind: 'ADDITIONAL'; legalEntityId: string } = {
      kind: 'PRIMARY',
    },
  ) {
    const path = '/offers/opportunities/' + fixture.opportunityId;
    const before = record(
      record(await json(await request({ path, companyId: fixture.companyId })))
        .offer,
    );
    await command({
      path: path + '/versions',
      companyId: fixture.companyId,
      key: 'early-offer-successor',
      body: {
        expectedOfferRevision: numberField(before, 'revision'),
        pricingSnapshotId: fixture.snapshotId,
        recipient,
        scopeNote: 'Successor scope',
        commercialConditions: 'Successor conditions',
      },
    });
    const after = record(
      record(await json(await request({ path, companyId: fixture.companyId })))
        .offer,
    );
    const versionId = stringField(record(after.version), 'id');
    for (const [step, revision] of [
      ['approve', numberField(after, 'revision')],
      ['transmission', numberField(after, 'revision') + 1],
    ] as const) {
      await command({
        path: path + '/versions/' + versionId + '/' + step,
        companyId: fixture.companyId,
        key: 'early-successor-' + step,
        body: { expectedOfferRevision: revision, acknowledgedWarningCodes: [] },
      });
    }
    return versionId;
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
  async function waitForBlocker(
    pid: number,
    precedingPid = 0,
  ): Promise<number> {
    for (let attempt = 0; attempt < 80; attempt++) {
      const waiting = await pool.query<{ pid: number }>(
        "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND ($1=ANY(pg_blocking_pids(pid)) OR $2=ANY(pg_blocking_pids(pid))) AND pid<>$2",
        [pid, precedingPid],
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
    stopAt = 'ACCEPTED',
  }: {
    suffix?: string;
    prepared?: PreparedOffer;
    stopAt?: 'DRAFT' | 'APPROVED' | 'TRANSMITTED' | 'ACCEPTED';
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
    if (stopAt === 'DRAFT') return fixture;
    await command({
      path: base + '/approve',
      body: { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
      key: 'approve' + suffix,
      companyId: fixture.companyId,
    });
    if (stopAt === 'APPROVED') return fixture;
    await command({
      path: base + '/transmission',
      body: { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
      key: 'transmit' + suffix,
      companyId: fixture.companyId,
    });
    if (stopAt === 'ACCEPTED')
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
