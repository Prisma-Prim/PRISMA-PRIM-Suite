import type { Pool } from 'pg';
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
