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
    'C6 controls new-version versus %s in both winning orders',
    async (other) => {
      for (const revisionFirst of [true, false]) {
        // Each ordering has an independent persisted Contract and Client fence.
        if (!revisionFirst)
          await pool.query(
            'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
          );
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
        (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM contracts c) AS contracts,
        (SELECT jsonb_agg(CASE WHEN $1::boolean THEN to_jsonb(v)-ARRAY['template_code','template_version','clause_versions','created_contract_revision','predecessor_version_id','superseded_by_version_id','superseded_at']::text[] ELSE to_jsonb(v)-ARRAY['created_contract_revision','predecessor_version_id','superseded_by_version_id','superseded_at']::text[] END ORDER BY id) FROM contract_versions v) AS versions,
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
                ...(index === 53
                  ? ['contract_versions_template_binding_check']
                  : []),
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
              index === 59,
            ],
          );
        const before = (await evidence()).rows;
        await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
        expect((await evidence()).rows).toEqual(before);
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
        if (index === 59)
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
