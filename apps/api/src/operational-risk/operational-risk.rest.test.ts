import type { Pool, PoolClient } from 'pg';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import { AccountabilityService } from '../accountability/accountability.service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const workspaceId = '00000000-0000-4000-8000-000000000763';
const readerPath = '/company-operational-risk-reader-assignments';
const recorderPath = '/company-operational-risk-recorder-assignments';
const facts = {
  process: ' Synthetic process\n<script>literal()</script> ',
  cause: ' Synthetic cause ',
  effect: ' Synthetic effect ',
  plannedMeasure: ' Synthetic manual measure ',
  existingMeasures: null,
  sourceDescription: null,
  plannedDate: null,
};
const riskTables = [
  'operational_risks',
  'operational_risk_entries',
  'operational_risk_events',
  'operational_risk_receipts',
] as const;
const commandKinds = [
  'record',
  'journal',
  'correct',
  'journal-correct',
] as const;
type Fixture = {
  companyId: string;
  membershipId: string;
  internalUserId: string;
};

withPostgres('Company Operational Risk public REST', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let pool: Pool;
  let origin: string;
  let invalidClock = false;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'operational_risk763',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      serverClock: {
        now: () =>
          invalidClock
            ? new Date(Number.NaN)
            : new Date('2026-10-21T12:00:00.000Z'),
      },
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'risk-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Synthetic Risk Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
          ['risk-member', 'risk-other'].map((subject) => ({
            provider: 'deterministic-test',
            subject,
            workspaceId,
          })),
        ),
      },
    });
    ({ pool, origin } = harness);
  });
  beforeEach(async () => {
    invalidClock = false;
    await pool.query('TRUNCATE workspaces, internal_users CASCADE');
  });
  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });

  it('corrects an original journal statement through the public Company command without changing its kind or intake', async () => {
    const fixture = await prepared();
    const initial = await command({
      fixture,
      path: '/operational-risks',
      body: facts,
      key: 'journal-correction-intake',
    });
    const riskId = string(object(initial.risk).id);
    const original = await command({
      fixture,
      path: `/operational-risks/${riskId}/journal`,
      body: {
        expectedRevision: 1,
        kind: 'observation',
        narrative: ' Original observation — exact literal ',
        occurredOn: '2024-02-29',
      },
      key: 'journal-correction-original',
    });
    expect(object(original.risk).revision).toBe(2);
    expect(original.entry).toMatchObject({
      kind: 'observation',
      revision: 2,
      narrative: ' Original observation — exact literal ',
      occurredOn: '2024-02-29',
    });
    const originalId = string(object(original.entry).id);
    const corrected = await command({
      fixture,
      path: `/operational-risks/${riskId}/journal/${originalId}/corrections`,
      body: {
        expectedRevision: 2,
        predecessorId: originalId,
        narrative: ' Corrected observation\nÎ / Ж / <literal> ',
        occurredOn: null,
        reason: ' Verified the original source ',
      },
      key: 'journal-correction-first',
    });
    expect(corrected.entry).toEqual({
      id: expect.any(String),
      revision: 3,
      kind: 'journal-corrected',
      originalEntryId: originalId,
      journalKind: 'observation',
      predecessorId: originalId,
      narrative: ' Corrected observation\nÎ / Ж / <literal> ',
      occurredOn: null,
      reason: ' Verified the original source ',
      actor: {
        workspaceMembershipId: fixture.membershipId,
        displayName: 'risk-member',
      },
      recordedAt: '2026-10-21T12:00:00.000Z',
    });
    expect(corrected.risk).toEqual({ ...object(original.risk), revision: 3 });
  });

  it.each(['observation', 'reassessment'] as const)(
    'reopens %s original/current, preserves every successor beyond a history boundary and permits motivated restoration',
    async (kind) => {
      const fixture = await prepared();
      const scenario = await journalScenario(fixture, kind);
      expect(await read({ fixture, path: scenario.root })).toEqual({
        riskId: scenario.riskId,
        companyId: fixture.companyId,
        revision: 2,
        originalEntry: scenario.original.entry,
        currentEntry: scenario.original.entry,
      });
      const all: unknown[] = [scenario.original.entry, scenario.initial.entry];
      let predecessorId = scenario.originalId;
      for (
        let expectedRevision = 2;
        expectedRevision < 29;
        expectedRevision++
      ) {
        const saved = await command({
          fixture,
          path: scenario.path,
          key: `successor-${expectedRevision}`,
          body: {
            ...scenario.body,
            expectedRevision,
            predecessorId,
            narrative:
              expectedRevision === 2
                ? object(scenario.original.entry).narrative
                : expectedRevision === 28
                  ? object(scenario.original.entry).narrative
                  : ` Literal successor ${expectedRevision} Î Ж <script> `,
            occurredOn:
              expectedRevision === 28
                ? '2024-02-29'
                : expectedRevision % 2 === 0
                  ? null
                  : '2020-01-01',
          },
        });
        expect(saved.risk).toEqual({
          ...object(scenario.original.risk),
          revision: expectedRevision + 1,
        });
        expect(saved.entry).toMatchObject({
          kind: 'journal-corrected',
          originalEntryId: scenario.originalId,
          journalKind: kind,
          predecessorId,
        });
        all.unshift(saved.entry);
        predecessorId = string(object(saved.entry).id);
      }
      expect(await read({ fixture, path: scenario.root })).toEqual({
        riskId: scenario.riskId,
        companyId: fixture.companyId,
        revision: 29,
        originalEntry: scenario.original.entry,
        currentEntry: all[0],
      });
      const first = object(
        await read({
          fixture,
          path: `/operational-risks/${scenario.riskId}/history`,
        }),
      );
      expect(array(first.items)).toEqual(all.slice(0, 25));
      expect(first.next_cursor).toBe('5');
      const older = await read({
        fixture,
        path: `/operational-risks/${scenario.riskId}/history?cursor=5`,
      });
      expect(older).toEqual({ items: all.slice(25), next_cursor: null });
      expect(
        (await rows('operational_risk_events'))
          .map(object)
          .filter((row) => row.action === 'operational_risk.journal.corrected'),
      ).toHaveLength(27);
      for (const row of (await rows('operational_risk_events'))
        .map(object)
        .filter((row) => row.action === 'operational_risk.journal.corrected'))
        expect(row.metadata).toEqual({ revision: row.revision, kind });
    },
  );

  it('rejects invalid journal corrections and reason-only changes without consuming their keys or any state', async () => {
    const fixture = await prepared();
    const scenario = await journalScenario(fixture);
    const before = await Promise.all(riskTables.map(rows));
    const missingDate = Object.fromEntries(
      Object.entries(scenario.body).filter(([key]) => key !== 'occurredOn'),
    );
    const bodies = [
      missingDate,
      { ...scenario.body, narrative: '' },
      { ...scenario.body, narrative: ' \n ' },
      { ...scenario.body, narrative: '😀'.repeat(2501) },
      { ...scenario.body, reason: '' },
      { ...scenario.body, reason: ' \n ' },
      { ...scenario.body, reason: '😀'.repeat(1001) },
      { ...scenario.body, occurredOn: '2026-02-29' },
      { ...scenario.body, occurredOn: '2026-01-01T00:00:00Z' },
      { ...scenario.body, predecessorId: 'not-a-uuid' },
      { ...scenario.body, expectedRevision: 0 },
      { ...scenario.body, expectedRevision: 1.5 },
      { ...scenario.body, expectedRevision: 2147483648 },
      ...[
        'kind',
        'companyId',
        'actor',
        'score',
        'status',
        'originalEntryId',
      ].map((key) => ({ ...scenario.body, [key]: 'not accepted' })),
    ];
    for (const body of bodies) {
      const response = await post({
        fixture,
        path: scenario.path,
        body,
        key: 'refused-reusable',
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'INVALID_RISK_INPUT',
      });
    }
    const noOp = await post({
      fixture,
      path: scenario.path,
      body: {
        ...scenario.body,
        narrative: object(scenario.original.entry).narrative,
        occurredOn: '2024-02-29',
        reason: 'Only a changed reason',
      },
      key: 'refused-reusable',
    });
    expect(noOp.status).toBe(400);
    expect(await noOp.json()).toMatchObject({
      code: 'UNCHANGED_RISK_JOURNAL_FACTS',
    });
    expect(await Promise.all(riskTables.map(rows))).toEqual(before);
    const saved = await command({
      fixture,
      path: scenario.path,
      body: {
        ...scenario.body,
        narrative: '😀'.repeat(2500),
        reason: '😀'.repeat(1000),
      },
      key: 'refused-reusable',
    });
    expect(object(saved.entry).narrative).toBe('😀'.repeat(2500));
    expect(object(saved.entry).reason).toBe('😀'.repeat(1000));
  });

  it('replays the exact journal correction historically after target and unrelated revisions and conflicts on every changed input or target', async () => {
    const fixture = await prepared();
    const scenario = await journalScenario(fixture);
    const first = await command({
      fixture,
      path: scenario.path,
      body: scenario.body,
      key: 'frozen-journal-correct',
    });
    await command({
      fixture,
      path: scenario.path,
      body: {
        ...scenario.body,
        expectedRevision: 3,
        predecessorId: object(first.entry).id,
        narrative: 'Later statement',
      },
      key: 'later-target',
    });
    const unrelated = await command({
      fixture,
      path: `/operational-risks/${scenario.riskId}/journal`,
      body: {
        expectedRevision: 4,
        kind: 'reassessment',
        narrative: 'Unrelated',
      },
      key: 'unrelated',
    });
    const before = await Promise.all(riskTables.map(rows));
    expect(
      await command({
        fixture,
        path: scenario.path,
        body: Object.fromEntries(Object.entries(scenario.body).reverse()),
        key: 'frozen-journal-correct',
      }),
    ).toEqual(first);
    for (const body of [
      { ...scenario.body, narrative: 'Changed' },
      { ...scenario.body, occurredOn: '2000-01-01' },
      { ...scenario.body, reason: 'Changed' },
      { ...scenario.body, expectedRevision: 5 },
      { ...scenario.body, predecessorId: object(first.entry).id },
    ]) {
      const response = await post({
        fixture,
        path: scenario.path,
        body,
        key: 'frozen-journal-correct',
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
      });
    }
    for (const path of [
      `/operational-risks/${scenario.riskId}/journal/${string(object(unrelated.entry).id)}/corrections`,
      `/operational-risks/00000000-0000-4000-8000-000000009999/journal/${scenario.originalId}/corrections`,
    ]) {
      const response = await post({
        fixture,
        path,
        body: scenario.body,
        key: 'frozen-journal-correct',
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
      });
    }
    expect(await Promise.all(riskTables.map(rows))).toEqual(before);
    for (const predecessorId of [
      scenario.originalId,
      string(object(unrelated.entry).id),
      '00000000-0000-4000-8000-000000009999',
    ]) {
      const response = await post({
        fixture,
        path: scenario.path,
        body: { ...scenario.body, expectedRevision: 5, predecessorId },
        key: crypto.randomUUID(),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: 'STALE_RISK_REVISION',
      });
    }
  });

  it.each([
    'same-key',
    'same-original',
    'different-original',
    'append',
    'intake',
  ] as const)(
    'serializes journal correction racing %s through real database holder/waiter barriers',
    async (other) => {
      const fixture = await prepared();
      const scenario = await journalScenario(fixture);
      let secondPath = scenario.path;
      let secondBody: unknown = {
        ...scenario.body,
        narrative: 'Competing correction',
      };
      let firstBody = scenario.body;
      if (other === 'different-original') {
        const second = await command({
          fixture,
          path: `/operational-risks/${scenario.riskId}/journal`,
          body: {
            expectedRevision: 2,
            kind: 'reassessment',
            narrative: 'Second original',
          },
          key: 'second-original',
        });
        firstBody = { ...scenario.body, expectedRevision: 3 };
        secondPath = `/operational-risks/${scenario.riskId}/journal/${string(object(second.entry).id)}/corrections`;
        secondBody = { ...firstBody, predecessorId: object(second.entry).id };
      }
      if (other === 'same-key') secondBody = firstBody;
      if (other === 'append') {
        secondPath = `/operational-risks/${scenario.riskId}/journal`;
        secondBody = {
          expectedRevision: 2,
          kind: 'reassessment',
          narrative: 'Concurrent append',
        };
      }
      if (other === 'intake') {
        secondPath = `/operational-risks/${scenario.riskId}/intake-corrections`;
        secondBody = {
          ...facts,
          cause: 'Concurrent intake correction',
          expectedRevision: 2,
          predecessorId: object(scenario.initial.entry).id,
          reason: 'Checked',
        };
      }
      const replies = await race({
        table: 'operational_risk_entries',
        first: () =>
          post({
            fixture,
            path: scenario.path,
            body: firstBody,
            key: 'race-first',
          }),
        second: () =>
          post({
            fixture,
            path: secondPath,
            body: secondBody,
            key: other === 'same-key' ? 'race-first' : 'race-second',
          }),
      });
      expect(replies.map((response) => response.status)).toEqual([
        201,
        other === 'same-key' ? 201 : 409,
      ]);
      if (other === 'same-key')
        expect(await replies[1].json()).toEqual(await replies[0].json());
      else
        expect(await replies[1].json()).toMatchObject({
          code: 'STALE_RISK_REVISION',
        });
      expect(
        object(await read({ fixture, path: scenario.root })).revision,
      ).toBe(other === 'different-original' ? 4 : 3);
      expect(
        (await rows('operational_risk_events'))
          .map(object)
          .filter((row) => row.action === 'operational_risk.journal.corrected'),
      ).toHaveLength(1);
    },
  );

  it('authorizes exact current reads and unavailable originals before revealing content, including Reader-only consultation', async () => {
    const fixture = await prepared();
    const scenario = await journalScenario(fixture);
    const second = await prepared();
    const foreign = await journalScenario(second);
    const saved = await command({
      fixture,
      path: scenario.path,
      body: scenario.body,
      key: 'saved-for-read',
    });
    const missing = '00000000-0000-4000-8000-000000009999';
    for (const root of [
      `/operational-risks/${scenario.riskId}/journal/${missing}`,
      `/operational-risks/${scenario.riskId}/journal/${string(object(scenario.initial.entry).id)}`,
      `/operational-risks/${scenario.riskId}/journal/${string(object(saved.entry).id)}`,
      `/operational-risks/${scenario.riskId}/journal/${foreign.originalId}`,
      `/operational-risks/${foreign.riskId}/journal/${foreign.originalId}`,
      `/operational-risks/${missing}/journal/${scenario.originalId}`,
    ]) {
      expect(
        (await request({ path: root, companyId: fixture.companyId })).status,
      ).toBe(404);
      expect(
        (
          await post({
            fixture,
            path: `${root}/corrections`,
            body: { ...scenario.body, expectedRevision: 3 },
            key: crypto.randomUUID(),
          })
        ).status,
      ).toBe(404);
    }
    expect(
      (
        await request({
          path: `${scenario.root}?limit=1`,
          companyId: fixture.companyId,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request({
          path: scenario.root.replace(scenario.originalId, 'bad-uuid'),
          companyId: fixture.companyId,
        })
      ).status,
    ).toBe(400);
    await revoke(recorderPath, fixture);
    expect(await read({ fixture, path: scenario.root })).toMatchObject({
      originalEntry: scenario.original.entry,
      currentEntry: saved.entry,
    });
    expect(
      (
        await post({
          fixture,
          path: scenario.path,
          body: scenario.body,
          key: 'saved-for-read',
        })
      ).status,
    ).toBe(403);
    await revoke(readerPath, fixture);
    await grant(recorderPath, fixture);
    expect(
      (await request({ path: scenario.root, companyId: fixture.companyId }))
        .status,
    ).toBe(403);
    expect(
      (
        await post({
          fixture,
          path: scenario.path,
          body: { narrative: null },
          key: 'authority-first',
        })
      ).status,
    ).toBe(403);
  });

  it.each([
    'reader',
    'recorder',
    'context',
    'company',
    'membership',
    'user',
  ] as const)(
    'holds live %s authority through correction commit, then denies exact replay',
    async (loss) => {
      const fixture = await prepared();
      const scenario = await journalScenario(fixture);
      const pause = await pauseWrites('operational_risk_entries');
      let saving: Promise<Response> | undefined;
      let losing: Promise<unknown> | undefined;
      try {
        saving = post({
          fixture,
          path: scenario.path,
          body: scenario.body,
          key: 'correction-before-loss',
        });
        const savingPid = await waitForBlockedBy(pause.backendPid);
        losing = loseAuthority(fixture, loss);
        await waitForBlockedBy(savingPid);
        await pause.release();
        expect((await saving).status).toBe(201);
        await losing;
        expect(
          (await request({ path: scenario.root, companyId: fixture.companyId }))
            .status,
        ).toBe(loss === 'recorder' ? 200 : 403);
        const before = await Promise.all(riskTables.map(rows));
        expect(
          (
            await post({
              fixture,
              path: scenario.path,
              body: scenario.body,
              key: 'correction-before-loss',
            })
          ).status,
        ).toBe(403);
        expect(
          (
            await post({
              fixture,
              path: scenario.path,
              body: scenario.body,
              key: 'correction-after-loss',
            })
          ).status,
        ).toBe(403);
        expect(await Promise.all(riskTables.map(rows))).toEqual(before);
      } finally {
        await pause.close();
        await Promise.allSettled([saving, losing]);
      }
    },
  );

  it.each([
    'reader',
    'recorder',
    'context',
    'company',
    'membership',
    'user',
  ] as const)(
    'denies journal correction and cached replay when %s authority loss owns the database lock first',
    async (loss) => {
      const fixture = await prepared();
      const scenario = await journalScenario(fixture);
      await command({
        fixture,
        path: scenario.path,
        body: scenario.body,
        key: 'journal-cached-before-loss',
      });
      const before = await Promise.all(riskTables.map(rows));
      const held = await hold(async (connection) => {
        await loseAuthority(fixture, loss, connection);
      });
      let replay: Promise<Response> | undefined;
      try {
        replay = post({
          fixture,
          path: scenario.path,
          body: scenario.body,
          key: 'journal-cached-before-loss',
        });
        await waitForBlockedBy(held.backendPid);
        await held.release();
        expect((await replay).status).toBe(403);
        expect(
          (
            await post({
              fixture,
              path: scenario.path,
              body: { ...scenario.body, expectedRevision: 3 },
              key: 'new-after-lost',
            })
          ).status,
        ).toBe(403);
        expect(await Promise.all(riskTables.map(rows))).toEqual(before);
      } finally {
        await held.release();
        if (replay) await replay;
      }
    },
  );

  it('rejects direct journal forks, wrong-kind/foreign lineage, unadvanced heads and mutation of committed correction rows in PostgreSQL', async () => {
    const fixture = await prepared();
    const scenario = await journalScenario(fixture);
    const other = await journalScenario(fixture, 'reassessment');
    const saved = await command({
      fixture,
      path: scenario.path,
      body: scenario.body,
      key: 'immutable-correction',
    });
    const id = string(object(saved.entry).id);
    const copy = async (
      overrides: {
        predecessor?: string;
        predecessorRevision?: number;
        original?: string;
        originalRevision?: number;
        journalKind?: string;
        revision?: number;
        companyId?: string;
        riskId?: string;
      } = {},
    ) =>
      pool.query(
        `
      INSERT INTO operational_risk_entries(id,workspace_id,company_id,risk_id,revision,kind,predecessor_id,predecessor_revision,original_entry_id,original_entry_revision,journal_kind,payload,actor_internal_user_id,actor_membership_id,actor_display_name,recorded_at)
      SELECT gen_random_uuid(),workspace_id,$1,$2,$3,kind,$4,$5,$6,$7,$8,payload,actor_internal_user_id,actor_membership_id,actor_display_name,recorded_at FROM operational_risk_entries WHERE id=$9`,
        [
          overrides.companyId ?? fixture.companyId,
          overrides.riskId ?? scenario.riskId,
          overrides.revision ?? 4,
          overrides.predecessor ?? id,
          overrides.predecessorRevision ?? 3,
          overrides.original ?? scenario.originalId,
          overrides.originalRevision ?? 2,
          overrides.journalKind ?? 'observation',
          id,
        ],
      );
    await expect(
      copy({ predecessor: scenario.originalId, predecessorRevision: 2 }),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      copy({ predecessor: other.originalId, predecessorRevision: 2 }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(copy({ original: other.originalId })).rejects.toMatchObject({
      code: '23514',
    });
    await expect(copy({ journalKind: 'reassessment' })).rejects.toMatchObject({
      code: '23514',
    });
    await expect(copy()).rejects.toMatchObject({ code: '23514' });
    await expect(copy({ revision: 5 })).rejects.toMatchObject({
      code: '23514',
    });
    await expect(
      copy({ companyId: '00000000-0000-4000-8000-000000009999' }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        'UPDATE operational_risk_entries SET payload=payload WHERE id=$1',
        [id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('DELETE FROM operational_risk_entries WHERE id=$1', [id]),
    ).rejects.toMatchObject({ code: '23514' });
    expect(await read({ fixture, path: scenario.root })).toMatchObject({
      revision: 3,
      currentEntry: saved.entry,
      originalEntry: scenario.original.entry,
    });
  });

  it('allows any currently authorized Recorder to correct another author without changing original attribution', async () => {
    const fixture = await prepared();
    const scenario = await journalScenario(fixture);
    const other = await actor('risk-other');
    const otherFixture = {
      companyId: fixture.companyId,
      membershipId: string(other.workspaceMembershipId),
      internalUserId: string(other.internalUserId),
    };
    for (const path of [
      '/company-context-assignments',
      readerPath,
      recorderPath,
    ])
      await grant(path, otherFixture);
    const saved = await command({
      fixture,
      path: scenario.path,
      body: scenario.body,
      key: 'other-author-correction',
      subject: 'risk-other',
    });
    expect(object(saved.entry).actor).toEqual({
      workspaceMembershipId: otherFixture.membershipId,
      displayName: 'risk-other',
    });
    expect(
      await read({ fixture, path: scenario.root, subject: 'risk-other' }),
    ).toMatchObject({
      originalEntry: scenario.original.entry,
      currentEntry: saved.entry,
    });
    expect(object(scenario.original.entry).actor).toEqual({
      workspaceMembershipId: fixture.membershipId,
      displayName: 'risk-member',
    });
  });

  it('rejects a valid-shaped but mismatched journal response and rolls back before confirming the submitted correction', async () => {
    const fixture = await prepared();
    const scenario = await journalScenario(fixture);
    const before = await Promise.all(riskTables.map(rows));
    await pool.query(`CREATE FUNCTION test_changed_journal_response() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.kind='journal-corrected' THEN NEW.payload=jsonb_set(NEW.payload,'{narrative}','"Different valid literal statement"'::jsonb); END IF;
      RETURN NEW; END $$;
      CREATE TRIGGER test_changed_journal_response BEFORE INSERT ON operational_risk_entries FOR EACH ROW EXECUTE FUNCTION test_changed_journal_response();`);
    try {
      const response = await post({
        fixture,
        path: scenario.path,
        body: scenario.body,
        key: 'exact-submitted-result',
      });
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({
        code: 'RISK_OUTCOME_UNCONFIRMED',
      });
      expect(await Promise.all(riskTables.map(rows))).toEqual(before);
    } finally {
      await pool.query(
        'DROP TRIGGER test_changed_journal_response ON operational_risk_entries; DROP FUNCTION test_changed_journal_response()',
      );
    }
    const saved = await command({
      fixture,
      path: scenario.path,
      body: scenario.body,
      key: 'exact-submitted-result',
    });
    expect(object(saved.entry).narrative).toBe(scenario.body.narrative);
  });

  it('fails closed on corrupt or unknown stored correction receipts without recomputing or rewriting their historical result', async () => {
    const fixture = await prepared();
    const scenario = await journalScenario(fixture);
    const saved = await command({
      fixture,
      path: scenario.path,
      body: scenario.body,
      key: 'protected-historical-result',
    });
    const replace = async (response: unknown) => {
      await pool.query(
        'ALTER TABLE operational_risk_receipts DISABLE TRIGGER operational_risk_receipts_immutable',
      );
      try {
        await pool.query(
          "UPDATE operational_risk_receipts SET response=$1 WHERE command_kind='journal-correct' AND idempotency_key='protected-historical-result'",
          [JSON.stringify(response)],
        );
      } finally {
        await pool.query(
          'ALTER TABLE operational_risk_receipts ENABLE TRIGGER operational_risk_receipts_immutable',
        );
      }
    };
    try {
      for (const response of [
        {
          ...saved,
          entry: {
            ...object(saved.entry),
            narrative: 'Another valid statement for the same original',
          },
        },
        {
          ...saved,
          entry: {
            ...object(saved.entry),
            kind: 'future-journal-correction-v2',
          },
        },
        {
          ...saved,
          entry: {
            ...object(saved.entry),
            originalEntryId: '00000000-0000-4000-8000-000000009999',
          },
        },
        { ...saved, extra: 'Never discard persisted response fields' },
      ]) {
        await replace(response);
        const before = await Promise.all(riskTables.map(rows));
        const replay = await post({
          fixture,
          path: scenario.path,
          body: scenario.body,
          key: 'protected-historical-result',
        });
        expect(replay.status).toBe(500);
        expect(await replay.json()).toMatchObject({
          code: 'RISK_OUTCOME_UNCONFIRMED',
        });
        expect(await Promise.all(riskTables.map(rows))).toEqual(before);
      }
    } finally {
      await replace(saved);
    }
    expect(
      await command({
        fixture,
        path: scenario.path,
        body: scenario.body,
        key: 'protected-historical-result',
      }),
    ).toEqual(saved);
  });

  it('records literal facts, unknown optional values and explicit unassessed/unassigned truth without widening legacy access', async () => {
    const fixture = await prepared();
    const created = await command({
      fixture,
      path: '/operational-risks',
      body: facts,
      key: 'intake',
    });
    const risk = object(created.risk);
    const entry = object(created.entry);
    const riskId = string(risk.id);
    expect(risk).toMatchObject({
      companyId: fixture.companyId,
      revision: 1,
      assessment: 'not-assessed',
      responsibility: 'not-specified',
      originalIntake: {
        kind: 'intake-recorded',
        facts,
        revision: 1,
        actor: { workspaceMembershipId: fixture.membershipId },
      },
      currentIntake: entry,
    });
    expect(
      await read({ fixture, path: `/operational-risks/${riskId}` }),
    ).toEqual(risk);
    expect(await read({ fixture, path: '/operational-risks' })).toEqual({
      items: [
        {
          id: riskId,
          companyId: fixture.companyId,
          revision: 1,
          process: facts.process,
          createdAt: '2026-10-21T12:00:00.000Z',
        },
      ],
      next_cursor: null,
    });
    expect(
      await read({ fixture, path: `/operational-risks/${riskId}/history` }),
    ).toEqual({ items: [entry], next_cursor: null });
    expect(
      (await request({ path: '/clients', companyId: fixture.companyId }))
        .status,
    ).toBe(403);
    expect(
      (await request({ path: '/projects', companyId: fixture.companyId }))
        .status,
    ).toBe(403);
    expect(await rows('operational_risk_events')).toMatchObject([
      {
        action: 'operational_risk.recorded',
        metadata: { revision: 1 },
        actor_membership_id: fixture.membershipId,
      },
    ]);
  });

  it('requires Reader, Recorder and Company context independently, including for the workspace owner', async () => {
    const fixture = await prepared({
      reader: false,
      recorder: false,
      context: false,
    });
    for (const subject of ['risk-member', 'risk-owner']) {
      expect(
        (
          await request({
            path: '/operational-risks',
            companyId: fixture.companyId,
            subject,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await post({
            fixture,
            path: '/operational-risks',
            body: facts,
            key: 'no-grants',
            subject,
          })
        ).status,
      ).toBe(403);
    }
    await grant(recorderPath, fixture);
    expect(
      (
        await post({
          fixture,
          path: '/operational-risks',
          body: facts,
          key: 'recorder-only',
        })
      ).status,
    ).toBe(403);
    await grant(readerPath, fixture);
    expect(
      (
        await post({
          fixture,
          path: '/operational-risks',
          body: facts,
          key: 'both-no-context',
        })
      ).status,
    ).toBe(403);
    await grant('/company-context-assignments', fixture);
    expect(
      (
        await request({
          path: '/operational-risks',
          companyId: fixture.companyId,
        })
      ).status,
    ).toBe(200);
    await revoke(recorderPath, fixture);
    expect(
      (
        await post({
          fixture,
          path: '/operational-risks',
          body: facts,
          key: 'reader-only',
        })
      ).status,
    ).toBe(403);
    expect(await rows('operational_risks')).toHaveLength(0);
    await grant(recorderPath, fixture);
    await command({
      fixture,
      path: '/operational-risks',
      body: facts,
      key: 'explicit-both',
    });
  });

  it.each([
    {
      path: readerPath,
      storage: 'company_operational_risk_reader',
      label: 'Company Operational Risk Reader',
      prefix: 'operationalRiskReader',
      permission: 'risk.read',
    },
    {
      path: recorderPath,
      storage: 'company_operational_risk_recorder',
      label: 'Company Operational Risk Recorder',
      prefix: 'operationalRiskRecorder',
      permission: 'risk.record',
    },
  ])(
    'captures $label v1 explicitly and records only actual safe administrative transitions',
    async (bundle) => {
      const fixture = await prepared({ reader: false, recorder: false });
      const body = {
        companyId: fixture.companyId,
        workspaceMembershipId: fixture.membershipId,
      };
      const first = await request({
        path: bundle.path,
        subject: 'risk-owner',
        method: 'POST',
        body,
        key: 'explicit-grant',
      });
      expect(first.status).toBe(201);
      const assignment: unknown = await first.json();
      expect(assignment).toMatchObject({
        ...body,
        bundle: bundle.label,
        permissionSetVersion: 'v1',
        active: true,
      });
      expect(
        await (
          await request({
            path: bundle.path,
            subject: 'risk-owner',
            method: 'POST',
            body,
            key: 'explicit-grant',
          })
        ).json(),
      ).toEqual(assignment);
      await grant(bundle.path, fixture);
      const current = object(await actor('risk-member'));
      expect(current.activeCompany).toBeUndefined();
      const selected = await request({
        path: '/access/current-actor',
        companyId: fixture.companyId,
      });
      expect(selected.status).toBe(200);
      expect(object(await selected.json()).activeCompany).toMatchObject({
        operationalRiskPermissions: [bundle.permission],
        [`${bundle.prefix}AssignmentId`]: object(assignment).id,
        [`${bundle.prefix}PermissionSetVersion`]: 'v1',
      });
      const administration = await request({
        path: '/company-context-assignments/administration',
        subject: 'risk-owner',
      });
      expect(object(await administration.json()).assignments).toContainEqual(
        assignment,
      );
      expect(
        (
          await request({
            path: bundle.path,
            method: 'POST',
            body,
            key: 'non-admin',
          })
        ).status,
      ).toBe(403);
      const action = `${bundle.storage}_assignment`;
      const granted = (await rows('activity_log_events'))
        .map(object)
        .filter((event) => event.action === `${action}.granted`);
      expect(granted).toHaveLength(1);
      expect(granted[0]?.metadata).toEqual({ bundle: bundle.label });
      await revoke(bundle.path, fixture);
      await revoke(bundle.path, fixture);
      expect(
        (await rows('activity_log_events'))
          .map(object)
          .filter((event) => event.action === `${action}.revoked`),
      ).toHaveLength(1);
    },
  );

  it.each([
    { bundle: 'reader', version: null },
    { bundle: 'reader', version: 'future-version' },
    { bundle: 'recorder', version: null },
    { bundle: 'recorder', version: 'future-version' },
  ])(
    'fails closed for a stored unsupported $bundle version $version while preserving independent Client access',
    async ({ bundle, version }) => {
      const fixture = await prepared();
      await grant('/company-director-client-assignments', fixture);
      const definition = await pool.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
      );
      const check = definition.rows[0]?.definition;
      if (!check) throw new Error('Missing captured-version constraint.');
      await pool.query(
        'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
      );
      try {
        await pool.query(
          'UPDATE company_role_assignments SET permission_set_version=$1 WHERE bundle::text=$2',
          [version, `company_operational_risk_${bundle}`],
        );
        expect(
          (
            await post({
              fixture,
              path: '/operational-risks',
              body: facts,
              key: 'unsupported',
            })
          ).status,
        ).toBe(403);
        expect(
          (
            await request({
              path: '/operational-risks',
              companyId: fixture.companyId,
            })
          ).status,
        ).toBe(bundle === 'reader' ? 403 : 200);
        expect(
          (await request({ path: '/clients', companyId: fixture.companyId }))
            .status,
        ).toBe(200);
        const selected = await request({
          path: '/access/current-actor',
          companyId: fixture.companyId,
        });
        expect(selected.status).toBe(200);
        const projection = object(object(await selected.json()).activeCompany);
        expect(
          projection[
            bundle === 'reader'
              ? 'operationalRiskReaderAssignmentId'
              : 'operationalRiskRecorderAssignmentId'
          ],
        ).toBeUndefined();
        expect(projection.clientPermissions).toContain('client.read');
      } finally {
        await pool.query(
          "UPDATE company_role_assignments SET permission_set_version='v1' WHERE bundle::text=$1",
          [`company_operational_risk_${bundle}`],
        );
        await pool.query(
          `ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ${check}`,
        );
      }
    },
  );

  it('appends observations and narrative reassessments, then corrects the complete intake while preserving every predecessor and author', async () => {
    const fixture = await prepared();
    const initial = await command({
      fixture,
      path: '/operational-risks',
      body: facts,
      key: 'initial',
    });
    const riskId = string(object(initial.risk).id);
    const firstId = string(object(initial.entry).id);
    const observation = await command({
      fixture,
      path: `/operational-risks/${riskId}/journal`,
      body: {
        expectedRevision: 1,
        kind: 'observation',
        narrative: ' Literal observation\n<keep> ',
        occurredOn: '2024-02-29',
      },
      key: 'observation',
    });
    const reassessment = await command({
      fixture,
      path: `/operational-risks/${riskId}/journal`,
      body: {
        expectedRevision: 2,
        kind: 'reassessment',
        narrative: ' Manual narrative, no score ',
        occurredOn: null,
      },
      key: 'reassessment',
    });
    const corrected = await command({
      fixture,
      path: `/operational-risks/${riskId}/intake-corrections`,
      body: {
        ...facts,
        process: ' Corrected process ',
        expectedRevision: 3,
        predecessorId: firstId,
        reason: ' Preserve the original cause report ',
      },
      key: 'correct',
    });
    expect(object(corrected.risk)).toMatchObject({
      revision: 4,
      assessment: 'not-assessed',
      responsibility: 'not-specified',
      originalIntake: initial.entry,
      currentIntake: {
        kind: 'intake-corrected',
        predecessorId: firstId,
        facts: { ...facts, process: ' Corrected process ' },
      },
    });
    expect(
      await read({ fixture, path: `/operational-risks/${riskId}/history` }),
    ).toEqual({
      items: [
        corrected.entry,
        reassessment.entry,
        observation.entry,
        initial.entry,
      ],
      next_cursor: null,
    });
    const correctionId = string(object(corrected.entry).id);
    const second = await command({
      fixture,
      path: `/operational-risks/${riskId}/intake-corrections`,
      body: {
        ...facts,
        expectedRevision: 4,
        predecessorId: correctionId,
        reason: ' Restore the original wording after verification ',
      },
      key: 'second-correct',
    });
    expect(object(second.entry).predecessorId).toBe(correctionId);
    expect(await rows('operational_risk_entries')).toHaveLength(5);
    expect(await rows('operational_risk_receipts')).toHaveLength(5);
    expect(await rows('operational_risk_events')).toHaveLength(5);
  });

  it('replays all three exact commands after later revisions and rejects changed fingerprints without advancing anything', async () => {
    const fixture = await prepared();
    const created = await command({
      fixture,
      path: '/operational-risks',
      body: facts,
      key: 'same-record',
    });
    const riskId = string(object(created.risk).id);
    const journalBody = {
      expectedRevision: 1,
      kind: 'observation',
      narrative: 'Original narrative',
      occurredOn: null,
    };
    const journal = await command({
      fixture,
      path: `/operational-risks/${riskId}/journal`,
      body: journalBody,
      key: 'same-journal',
    });
    const correctionBody = {
      ...facts,
      cause: 'Corrected cause',
      expectedRevision: 2,
      predecessorId: object(created.entry).id,
      reason: 'New source',
    };
    const correction = await command({
      fixture,
      path: `/operational-risks/${riskId}/intake-corrections`,
      body: correctionBody,
      key: 'same-correct',
    });
    await command({
      fixture,
      path: `/operational-risks/${riskId}/journal/${string(object(journal.entry).id)}/corrections`,
      body: {
        expectedRevision: 3,
        predecessorId: object(journal.entry).id,
        narrative: 'Corrected journal after intake successor',
        occurredOn: null,
        reason: 'Checked source',
      },
      // Same literal key remains independent in the new command-kind namespace.
      key: 'same-correct',
    });
    expect(
      await command({
        fixture,
        path: '/operational-risks',
        body: Object.fromEntries(Object.entries(facts).reverse()),
        key: 'same-record',
      }),
    ).toEqual(created);
    expect(
      await command({
        fixture,
        path: `/operational-risks/${riskId}/journal`,
        body: journalBody,
        key: 'same-journal',
      }),
    ).toEqual(journal);
    expect(
      await command({
        fixture,
        path: `/operational-risks/${riskId}/intake-corrections`,
        body: correctionBody,
        key: 'same-correct',
      }),
    ).toEqual(correction);
    for (const [path, body, key] of [
      [
        '/operational-risks',
        { ...facts, process: facts.process.trim() },
        'same-record',
      ],
      [
        `/operational-risks/${riskId}/journal`,
        { ...journalBody, narrative: 'Changed' },
        'same-journal',
      ],
      [
        `/operational-risks/${riskId}/intake-corrections`,
        { ...correctionBody, reason: 'Changed reason' },
        'same-correct',
      ],
    ] satisfies [string, unknown, string][])
      expect((await post({ fixture, path, body, key })).status).toBe(409);
    expect(
      object(await read({ fixture, path: `/operational-risks/${riskId}` }))
        .revision,
    ).toBe(4);
    expect(await rows('operational_risk_events')).toHaveLength(4);
  });

  it('refuses stale heads, stale displayed predecessors, unchanged corrections and unavailable targets without consuming keys', async () => {
    const fixture = await prepared();
    const created = await command({
      fixture,
      path: '/operational-risks',
      body: facts,
      key: 'create',
    });
    const riskId = string(object(created.risk).id);
    const path = `/operational-risks/${riskId}/intake-corrections`;
    const body = {
      ...facts,
      expectedRevision: 1,
      predecessorId: object(created.entry).id,
      reason: 'Reason alone is insufficient',
    };
    expect((await post({ fixture, path, body, key: 'reuse' })).status).toBe(
      400,
    );
    const correction = await command({
      fixture,
      path,
      body: { ...body, effect: 'Corrected effect' },
      key: 'reuse',
    });
    expect(
      (
        await post({
          fixture,
          path,
          body: { ...body, cause: 'Changed', expectedRevision: 1 },
          key: 'stale-head',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await post({
          fixture,
          path,
          body: { ...body, cause: 'Changed', expectedRevision: 2 },
          key: 'stale-predecessor',
        })
      ).status,
    ).toBe(409);
    const missing = '00000000-0000-4000-8000-000000009999';
    expect(
      (
        await post({
          fixture,
          path: `/operational-risks/${missing}/journal`,
          body: {
            expectedRevision: 1,
            kind: 'observation',
            narrative: 'Not found',
          },
          key: 'missing',
        })
      ).status,
    ).toBe(404);
    expect(
      await read({ fixture, path: `/operational-risks/${riskId}` }),
    ).toEqual(correction.risk);
    expect(await rows('operational_risk_receipts')).toHaveLength(2);
  });

  it.each([
    { process: '' },
    { process: ' '.repeat(4) },
    { process: 'x'.repeat(301) },
    { cause: 'x'.repeat(2001) },
    { effect: null },
    { plannedMeasure: 12 },
    { existingMeasures: ' ' },
    { sourceDescription: 'x'.repeat(301) },
    { plannedDate: '2026-02-29' },
    { plannedDate: '2026-10-21T00:00:00Z' },
    { score: 1 },
    { responsibleMembershipId: '00000000-0000-4000-8000-000000009999' },
    { status: 'closed' },
    { clientId: '00000000-0000-4000-8000-000000009999' },
  ])(
    'rejects invalid intake %j atomically and permits the corrected request to reuse its key',
    async (changes) => {
      const fixture = await prepared();
      const response = await post({
        fixture,
        path: '/operational-risks',
        body: { ...facts, ...changes },
        key: 'reusable',
      });
      expect(response.status).toBe(400);
      expect(await rows('operational_risks')).toEqual([]);
      expect(await rows('operational_risk_events')).toEqual([]);
      expect(await rows('operational_risk_receipts')).toEqual([]);
      await command({
        fixture,
        path: '/operational-risks',
        body: facts,
        key: 'reusable',
      });
    },
  );

  it('accepts exact Unicode string-unit limits and past dates without truncating', async () => {
    const fixture = await prepared();
    const complete = {
      process: '😀'.repeat(150),
      cause: 'C'.repeat(2000),
      effect: 'E'.repeat(2000),
      plannedMeasure: 'M'.repeat(2000),
      existingMeasures: 'X'.repeat(2000),
      sourceDescription: 'S'.repeat(300),
      plannedDate: '2000-02-29',
    };
    const created = await command({
      fixture,
      path: '/operational-risks',
      body: complete,
      key: 'bounds',
    });
    expect(object(object(created.risk).currentIntake).facts).toEqual(complete);
    const riskId = string(object(created.risk).id);
    const journal = await command({
      fixture,
      path: `/operational-risks/${riskId}/journal`,
      body: {
        expectedRevision: 1,
        kind: 'reassessment',
        narrative: '😀'.repeat(2500),
        occurredOn: '2000-02-29',
      },
      key: 'journal-bounds',
    });
    expect(object(journal.entry).narrative).toBe('😀'.repeat(2500));
    expect(
      (
        await post({
          fixture,
          path: `/operational-risks/${riskId}/journal`,
          body: {
            expectedRevision: 2,
            kind: 'observation',
            narrative: 'x'.repeat(5001),
          },
          key: 'too-long',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post({
          fixture,
          path: `/operational-risks/${riskId}/journal`,
          body: {
            expectedRevision: 2,
            kind: 'journal-correction',
            narrative: 'Edit an old note',
          },
          key: 'deferred',
        })
      ).status,
    ).toBe(400);
  });

  it('isolates Companies and memberships before read, history pagination, replay or aggregate updates', async () => {
    const fixture = await prepared();
    const initial = await command({
      fixture,
      path: '/operational-risks',
      body: facts,
      key: 'scoped-key',
    });
    const riskId = string(object(initial.risk).id);
    const secondCompany = await company();
    const second = { ...fixture, companyId: secondCompany };
    for (const path of [
      '/company-context-assignments',
      readerPath,
      recorderPath,
    ])
      await grant(path, second);
    expect(
      (
        await request({
          path: `/operational-risks/${riskId}`,
          companyId: secondCompany,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request({
          path: `/operational-risks/${riskId}/history?limit=1`,
          companyId: secondCompany,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await post({
          fixture: second,
          path: `/operational-risks/${riskId}/journal`,
          body: {
            expectedRevision: 1,
            kind: 'observation',
            narrative: 'Wrong Company',
          },
          key: 'wrong',
        })
      ).status,
    ).toBe(404);
    const other = await actor('risk-other');
    const otherFixture = {
      ...fixture,
      membershipId: string(other.workspaceMembershipId),
      internalUserId: string(other.internalUserId),
    };
    for (const path of [
      '/company-context-assignments',
      readerPath,
      recorderPath,
    ])
      await grant(path, otherFixture);
    const byOther = await command({
      fixture,
      path: '/operational-risks',
      body: facts,
      key: 'scoped-key',
      subject: 'risk-other',
    });
    const bySecondCompany = await command({
      fixture: second,
      path: '/operational-risks',
      body: facts,
      key: 'scoped-key',
    });
    expect(object(byOther.risk).id).not.toBe(riskId);
    expect(object(bySecondCompany.risk).id).not.toBe(riskId);
    expect(
      await read({ fixture: second, path: '/operational-risks' }),
    ).toMatchObject({
      items: [{ id: object(bySecondCompany.risk).id }],
    });
  });

  it.each([
    'reader',
    'recorder',
    'context',
    'membership',
    'user',
    'company',
  ] as const)(
    'refuses cached receipt and new commands after live %s authority loss',
    async (loss) => {
      const fixture = await prepared();
      const created = await command({
        fixture,
        path: '/operational-risks',
        body: facts,
        key: 'before-loss',
      });
      const riskId = string(object(created.risk).id);
      if (loss === 'reader' || loss === 'recorder' || loss === 'context')
        await revoke(
          loss === 'reader'
            ? readerPath
            : loss === 'recorder'
              ? recorderPath
              : '/company-context-assignments',
          fixture,
        );
      if (loss === 'membership')
        await pool.query(
          "UPDATE workspace_memberships SET status='inactive' WHERE id=$1",
          [fixture.membershipId],
        );
      if (loss === 'user')
        await pool.query(
          "UPDATE internal_users SET status='inactive' WHERE id=$1",
          [fixture.internalUserId],
        );
      if (loss === 'company')
        await pool.query("UPDATE companies SET status='inactive' WHERE id=$1", [
          fixture.companyId,
        ]);
      expect(
        (
          await post({
            fixture,
            path: '/operational-risks',
            body: facts,
            key: 'before-loss',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await post({
            fixture,
            path: '/operational-risks',
            body: facts,
            key: 'after-loss',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await post({
            fixture,
            path: `/operational-risks/${riskId}/journal`,
            body: {
              expectedRevision: 1,
              kind: 'observation',
              narrative: 'Forbidden follow-up',
            },
            key: 'after-loss',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await request({
            path: `/operational-risks/${riskId}`,
            companyId: fixture.companyId,
          })
        ).status,
      ).toBe(loss === 'recorder' ? 200 : 403);
      expect(await rows('operational_risk_entries')).toHaveLength(1);
    },
  );

  it('keeps Risk content out of generic Activity, filters, targets and Home, including for explicitly authorized owner reads', async () => {
    const fixture = await prepared();
    const owner = await actor('risk-owner');
    const ownerFixture = {
      companyId: fixture.companyId,
      membershipId: string(owner.workspaceMembershipId),
      internalUserId: string(owner.internalUserId),
    };
    await grant(readerPath, ownerFixture);
    const created = await command({
      fixture,
      path: '/operational-risks',
      body: facts,
      key: 'restricted-content',
    });
    const riskId = string(object(created.risk).id);
    const original = await command({
      fixture,
      path: `/operational-risks/${riskId}/journal`,
      body: {
        expectedRevision: 1,
        kind: 'observation',
        narrative: 'Confidential original statement',
        occurredOn: null,
      },
      key: 'restricted-journal',
    });
    const originalId = string(object(original.entry).id);
    await command({
      fixture,
      path: `/operational-risks/${riskId}/journal/${originalId}/corrections`,
      body: {
        expectedRevision: 2,
        predecessorId: originalId,
        narrative: 'Confidential corrected statement',
        occurredOn: '2024-02-29',
        reason: 'Confidential correction reason',
      },
      key: 'restricted-correction',
    });
    const baseline = await read({
      fixture,
      path: '/activity-log',
      subject: 'risk-owner',
    });
    expect(JSON.stringify(baseline)).not.toContain('Synthetic process');
    expect(JSON.stringify(baseline)).not.toContain(riskId);
    const unregisteredFilter = await request({
      path: `/activity-log?target_type=operational_risk&target_id=${riskId}`,
      companyId: fixture.companyId,
      subject: 'risk-owner',
    });
    expect(unregisteredFilter.status).toBe(200);
    expect(await unregisteredFilter.json()).toEqual(baseline);
    const home = await request({
      path: '/operational-home',
      companyId: fixture.companyId,
      subject: 'risk-owner',
    });
    expect(home.status).toBe(200);
    expect(JSON.stringify(await home.json())).not.toContain(riskId);
    const events = await rows('operational_risk_events');
    expect(events).toHaveLength(3);
    expect(object(events[0]).metadata).toEqual({ revision: 1 });
    expect(
      events
        .map(object)
        .find((row) => row.action === 'operational_risk.journal.corrected')
        ?.metadata,
    ).toEqual({ revision: 3, kind: 'observation' });
    expect(JSON.stringify(events)).not.toContain('Confidential');
    expect(JSON.stringify(baseline)).not.toContain('Confidential');
    expect(JSON.stringify(events)).not.toContain(facts.process);
    expect(JSON.stringify(await rows('activity_log_events'))).not.toContain(
      riskId,
    );
  });

  it('paginates ties by stable descending identity and history by revision without duplicates or hidden totals', async () => {
    const fixture = await prepared();
    for (let index = 0; index < 4; index++)
      await command({
        fixture,
        path: '/operational-risks',
        body: { ...facts, process: `Synthetic page ${index}` },
        key: `page-${index}`,
      });
    const all = object(await read({ fixture, path: '/operational-risks' }));
    const first = object(
      await read({ fixture, path: '/operational-risks?limit=2' }),
    );
    const next = object(
      await read({
        fixture,
        path: `/operational-risks?limit=2&cursor=${encodeURIComponent(string(first.next_cursor))}`,
      }),
    );
    expect([...array(first.items), ...array(next.items)]).toEqual(all.items);
    expect(next.next_cursor).toBeNull();
    expect(Object.keys(first).sort()).toEqual(['items', 'next_cursor']);
    const riskId = string(object(array(first.items)[0]).id);
    for (let revision = 1; revision < 4; revision++)
      await command({
        fixture,
        path: `/operational-risks/${riskId}/journal`,
        body: {
          expectedRevision: revision,
          kind: 'observation',
          narrative: `Synthetic ${revision}`,
        },
        key: `follow-${revision}`,
      });
    const top = object(
      await read({
        fixture,
        path: `/operational-risks/${riskId}/history?limit=2`,
      }),
    );
    const bottom = object(
      await read({
        fixture,
        path: `/operational-risks/${riskId}/history?limit=2&cursor=${string(top.next_cursor)}`,
      }),
    );
    expect(
      [...array(top.items), ...array(bottom.items)].map(
        (entry) => object(entry).revision,
      ),
    ).toEqual([4, 3, 2, 1]);
    for (const query of [
      'limit=0',
      'limit=51',
      'limit=01',
      'cursor=bad',
      'cursor=',
      'search=private',
      'total=true',
    ])
      expect(
        (
          await request({
            path: `/operational-risks?${query}`,
            companyId: fixture.companyId,
          })
        ).status,
      ).toBe(400);
  });

  it.each(
    commandKinds.flatMap((kind) =>
      riskTables.map((table) => ({
        kind,
        table,
        operation:
          kind !== 'record' && table === 'operational_risks'
            ? 'UPDATE'
            : 'INSERT',
      })),
    ),
  )(
    'rolls back failed $table $operation during $kind and reuses the same command key',
    async ({ kind, table, operation }) => {
      const fixture = await prepared();
      const attempt = await riskAttempt({ fixture, kind });
      const before = await Promise.all(riskTables.map(rows));
      await pool.query(
        `CREATE FUNCTION test_fail_risk() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic Risk failure'; END $$; CREATE TRIGGER test_fail_risk BEFORE ${operation} ON ${table} FOR EACH ROW EXECUTE FUNCTION test_fail_risk()`,
      );
      try {
        const response = await post({
          fixture,
          path: attempt.path,
          body: attempt.body,
          key: 'rollback',
        });
        expect(response.status).toBe(500);
        const error: unknown = await response.json();
        expect(error).toMatchObject({ code: 'RISK_OUTCOME_UNCONFIRMED' });
        expect(JSON.stringify(error)).not.toContain('Synthetic Risk failure');
        for (const [index, name] of riskTables.entries())
          expect(await rows(name)).toEqual(before[index]);
        if (attempt.riskId)
          expect(
            await read({
              fixture,
              path: `/operational-risks/${attempt.riskId}`,
            }),
          ).toEqual(attempt.baselineRisk);
      } finally {
        await pool.query(
          `DROP TRIGGER test_fail_risk ON ${table}; DROP FUNCTION test_fail_risk()`,
        );
      }
      const saved = await command({
        fixture,
        path: attempt.path,
        body: attempt.body,
        key: 'rollback',
      });
      expect(object(saved.risk).revision).toBe(
        kind === 'record' ? 1 : kind === 'journal-correct' ? 3 : 2,
      );
    },
  );

  it.each(
    commandKinds.flatMap((kind) =>
      ['clock', 'response', 'accountability'].map((boundary) => ({
        kind,
        boundary,
      })),
    ),
  )(
    'rolls back $boundary construction failure during $kind before returning success',
    async ({ kind, boundary }) => {
      const fixture = await prepared();
      const attempt = await riskAttempt({ fixture, kind });
      const before = await Promise.all(riskTables.map(rows));
      invalidClock = boundary === 'clock';
      // Corrupt only a new synthetic row at the real database boundary.
      // The actual Risk response construction/validator remains unmocked.
      if (boundary === 'response')
        await pool.query(`
        CREATE FUNCTION test_invalid_risk_response() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN NEW.actor_display_name := ''; RETURN NEW; END $$;
        CREATE TRIGGER test_invalid_risk_response BEFORE INSERT ON operational_risk_entries
          FOR EACH ROW EXECUTE FUNCTION test_invalid_risk_response();
      `);
      const recording =
        boundary === 'accountability'
          ? vi
              .spyOn(
                AccountabilityService.prototype,
                'recordOperationalRiskEvent',
              )
              .mockRejectedValueOnce(
                new Error('Synthetic unavailable recording'),
              )
          : undefined;
      try {
        expect(
          (
            await post({
              fixture,
              path: attempt.path,
              body: attempt.body,
              key: 'construction',
            })
          ).status,
        ).toBe(500);
        for (const [index, name] of riskTables.entries())
          expect(await rows(name)).toEqual(before[index]);
      } finally {
        invalidClock = false;
        if (boundary === 'response')
          await pool.query(
            'DROP TRIGGER test_invalid_risk_response ON operational_risk_entries; DROP FUNCTION test_invalid_risk_response()',
          );
        recording?.mockRestore();
      }
      if (attempt.riskId)
        expect(
          await read({ fixture, path: `/operational-risks/${attempt.riskId}` }),
        ).toEqual(attempt.baselineRisk);
      const saved = await command({
        fixture,
        path: attempt.path,
        body: attempt.body,
        key: 'construction',
      });
      expect(object(saved.risk).revision).toBe(
        kind === 'record' ? 1 : kind === 'journal-correct' ? 3 : 2,
      );
    },
  );

  it('serializes simultaneous intake retries and distinct-key stale follow-ups into one aggregate transition each', async () => {
    const fixture = await prepared();
    const initial = await race({
      table: 'operational_risks',
      first: () =>
        post({
          fixture,
          path: '/operational-risks',
          body: facts,
          key: 'concurrent-same',
        }),
      second: () =>
        post({
          fixture,
          path: '/operational-risks',
          body: facts,
          key: 'concurrent-same',
        }),
    });
    expect(initial.map((response) => response.status)).toEqual([201, 201]);
    const left = object(await initial[0].json());
    expect(await initial[1].json()).toEqual(left);
    const riskId = string(object(left.risk).id);
    const follow = {
      expectedRevision: 1,
      kind: 'observation',
      narrative: 'One successor only',
    };
    const commands = await race({
      table: 'operational_risk_entries',
      first: () =>
        post({
          fixture,
          path: `/operational-risks/${riskId}/journal`,
          body: follow,
          key: 'concurrent-a',
        }),
      second: () =>
        post({
          fixture,
          path: `/operational-risks/${riskId}/journal`,
          body: { ...follow, narrative: 'Competing successor' },
          key: 'concurrent-b',
        }),
    });
    expect(commands.map((response) => response.status)).toEqual([201, 409]);
    expect(await rows('operational_risks')).toHaveLength(1);
    expect(await rows('operational_risk_entries')).toHaveLength(2);
    expect(await rows('operational_risk_events')).toHaveLength(2);
  });

  it('holds live identity and assignment authority until atomic commit; revocation waits and all later replays are denied', async () => {
    const fixture = await prepared();
    const pause = await pauseWrites('operational_risk_entries');
    let saving: Promise<Response> | undefined;
    let revoking: Promise<Response> | undefined;
    try {
      saving = post({
        fixture,
        path: '/operational-risks',
        body: facts,
        key: 'before-revoke',
      });
      const savingPid = await waitForBlockedBy(pause.backendPid);
      revoking = request({
        path: `${readerPath}/${fixture.membershipId}/${fixture.companyId}`,
        subject: 'risk-owner',
        method: 'DELETE',
        key: 'revoke-during-save',
      });
      await waitForBlockedBy(savingPid);
      await pause.release();
      expect((await saving).status).toBe(201);
      expect((await revoking).status).toBe(200);
      expect(
        (
          await post({
            fixture,
            path: '/operational-risks',
            body: facts,
            key: 'before-revoke',
          })
        ).status,
      ).toBe(403);
      expect(await rows('operational_risk_events')).toHaveLength(1);
    } finally {
      await pause.close();
      await Promise.allSettled(
        [saving, revoking].filter((value) => value !== undefined),
      );
    }
  });

  it('checks live identity before reading a receipt when membership suspension already holds the identity row', async () => {
    const fixture = await prepared();
    await command({
      fixture,
      path: '/operational-risks',
      body: facts,
      key: 'cached-before-suspension',
    });
    const held = await hold(async (connection) => {
      await connection.query(
        "UPDATE workspace_memberships SET status='inactive' WHERE id=$1",
        [fixture.membershipId],
      );
    });
    let replay: Promise<Response> | undefined;
    try {
      replay = post({
        fixture,
        path: '/operational-risks',
        body: facts,
        key: 'cached-before-suspension',
      });
      await waitForBlockedBy(held.backendPid);
      await held.release();
      expect((await replay).status).toBe(403);
      expect(await rows('operational_risk_events')).toHaveLength(1);
    } finally {
      await held.release();
      if (replay) await replay;
    }
  });

  it('refuses a cached receipt when an already-started Reader revocation commits before its live assignment lock', async () => {
    const fixture = await prepared();
    await command({
      fixture,
      path: '/operational-risks',
      body: facts,
      key: 'receipt-before-revoker',
    });
    const held = await hold(async (connection) => {
      await connection.query(
        "UPDATE company_role_assignments SET revoked_at=now() WHERE workspace_id=$1 AND company_id=$2 AND workspace_membership_id=$3 AND bundle='company_operational_risk_reader' AND revoked_at IS NULL",
        [workspaceId, fixture.companyId, fixture.membershipId],
      );
    });
    let replay: Promise<Response> | undefined;
    try {
      replay = post({
        fixture,
        path: '/operational-risks',
        body: facts,
        key: 'receipt-before-revoker',
      });
      const waiter = await waitForBlockedBy(held.backendPid);
      const query = await pool.query<{ query: string }>(
        'SELECT query FROM pg_stat_activity WHERE pid=$1',
        [waiter],
      );
      expect(query.rows[0]?.query).toContain('company_role_assignments');
      expect(query.rows[0]?.query.toLowerCase()).toContain('for share');
      await held.release();
      expect((await replay).status).toBe(403);
      expect(await rows('operational_risk_receipts')).toHaveLength(1);
      expect(await rows('operational_risk_events')).toHaveLength(1);
    } finally {
      await held.release();
      if (replay) await replay;
    }
  });

  it('enforces immutable history, receipt and event rows and rejects incomplete or skipped aggregate revisions in PostgreSQL', async () => {
    const fixture = await prepared();
    const created = await command({
      fixture,
      path: '/operational-risks',
      body: facts,
      key: 'immutable',
    });
    const riskId = string(object(created.risk).id);
    for (const table of [
      'operational_risk_entries',
      'operational_risk_receipts',
      'operational_risk_events',
    ]) {
      await expect(
        pool.query(
          `UPDATE ${table} SET recorded_at=recorded_at WHERE risk_id=$1`,
          [riskId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pool.query(`DELETE FROM ${table} WHERE risk_id=$1`, [riskId]),
      ).rejects.toMatchObject({ code: '23514' });
    }
    await expect(
      pool.query('UPDATE operational_risks SET revision=3 WHERE id=$1', [
        riskId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('UPDATE operational_risks SET revision=2 WHERE id=$1', [
        riskId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('DELETE FROM operational_risks WHERE id=$1', [riskId]),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      object(await read({ fixture, path: `/operational-risks/${riskId}` }))
        .revision,
    ).toBe(1);
  });

  async function riskAttempt({
    fixture,
    kind,
  }: {
    fixture: Fixture;
    kind: (typeof commandKinds)[number];
  }) {
    if (kind === 'record')
      return {
        path: '/operational-risks',
        body: facts,
        riskId: undefined,
        baselineRisk: undefined,
      };
    if (kind === 'journal-correct') {
      const scenario = await journalScenario(fixture);
      return { ...scenario, baselineRisk: scenario.original.risk };
    }
    const created = await command({
      fixture,
      path: '/operational-risks',
      body: facts,
      key: 'preserved-baseline',
    });
    const riskId = string(object(created.risk).id);
    return {
      path: `/operational-risks/${riskId}/${kind === 'journal' ? 'journal' : 'intake-corrections'}`,
      body:
        kind === 'journal'
          ? {
              expectedRevision: 1,
              kind: 'observation',
              narrative: 'Synthetic follow-up after baseline',
            }
          : {
              ...facts,
              cause: 'Synthetic corrected cause',
              expectedRevision: 1,
              predecessorId: object(created.entry).id,
              reason: 'Synthetic verified source',
            },
      riskId,
      baselineRisk: created.risk,
    };
  }

  async function loseAuthority(
    fixture: Fixture,
    loss: 'reader' | 'recorder' | 'context' | 'company' | 'membership' | 'user',
    connection: Pool | PoolClient = pool,
  ) {
    if (loss === 'reader' || loss === 'recorder' || loss === 'context')
      return connection.query(
        'UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle::text=$3 AND revoked_at IS NULL',
        [
          fixture.companyId,
          fixture.membershipId,
          loss === 'context'
            ? 'company_context_access'
            : `company_operational_risk_${loss}`,
        ],
      );
    if (loss === 'company')
      return connection.query(
        "UPDATE companies SET status='inactive' WHERE id=$1",
        [fixture.companyId],
      );
    if (loss === 'membership')
      return connection.query(
        "UPDATE workspace_memberships SET status='inactive' WHERE id=$1",
        [fixture.membershipId],
      );
    return connection.query(
      "UPDATE internal_users SET status='inactive' WHERE id=$1",
      [fixture.internalUserId],
    );
  }

  async function journalScenario(
    fixture: Fixture,
    kind: 'observation' | 'reassessment' = 'observation',
  ) {
    const initial = await command({
      fixture,
      path: '/operational-risks',
      body: facts,
      key: crypto.randomUUID(),
    });
    const riskId = string(object(initial.risk).id);
    const original = await command({
      fixture,
      path: `/operational-risks/${riskId}/journal`,
      body: {
        expectedRevision: 1,
        kind,
        narrative: ' Original statement Î / Ж / <literal> ',
        occurredOn: '2024-02-29',
      },
      key: crypto.randomUUID(),
    });
    const originalId = string(object(original.entry).id);
    return {
      initial,
      original,
      originalId,
      riskId,
      root: `/operational-risks/${riskId}/journal/${originalId}`,
      path: `/operational-risks/${riskId}/journal/${originalId}/corrections`,
      body: {
        expectedRevision: 2,
        predecessorId: originalId,
        narrative: ' Corrected statement\nwith literal whitespace ',
        occurredOn: null,
        reason: ' Checked the source ',
      },
    };
  }

  async function prepared(
    options: { reader?: boolean; recorder?: boolean; context?: boolean } = {},
  ): Promise<Fixture> {
    const companyId = await company();
    const member = await actor('risk-member');
    const fixture = {
      companyId,
      membershipId: string(member.workspaceMembershipId),
      internalUserId: string(member.internalUserId),
    };
    if (options.context !== false)
      await grant('/company-context-assignments', fixture);
    if (options.reader !== false) await grant(readerPath, fixture);
    if (options.recorder !== false) await grant(recorderPath, fixture);
    return fixture;
  }
  async function company(): Promise<string> {
    const response = await request({
      path: '/companies',
      method: 'POST',
      subject: 'risk-owner',
      key: crypto.randomUUID(),
      body: { displayName: `Synthetic Risk Company ${crypto.randomUUID()}` },
    });
    expect(response.status).toBe(201);
    return string(object(await response.json()).id);
  }
  async function actor(subject: string): Promise<Record<string, unknown>> {
    const response = await request({ path: '/access/current-actor', subject });
    expect(response.status).toBe(200);
    return object(await response.json());
  }
  async function grant(path: string, fixture: Fixture): Promise<void> {
    const response = await request({
      path,
      method: 'POST',
      subject: 'risk-owner',
      key: crypto.randomUUID(),
      body: {
        workspaceMembershipId: fixture.membershipId,
        companyId: fixture.companyId,
      },
    });
    expect(response.status).toBe(201);
  }
  async function revoke(path: string, fixture: Fixture): Promise<void> {
    expect(
      (
        await request({
          path: `${path}/${fixture.membershipId}/${fixture.companyId}`,
          method: 'DELETE',
          subject: 'risk-owner',
          key: crypto.randomUUID(),
        })
      ).status,
    ).toBe(200);
  }
  function request({
    path,
    subject = 'risk-member',
    companyId,
    method = 'GET',
    key,
    body,
  }: {
    path: string;
    subject?: string;
    companyId?: string;
    method?: string;
    key?: string;
    body?: unknown;
  }): Promise<Response> {
    return fetch(`${origin}/api${path}`, {
      method,
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': subject,
        'x-test-email': `${subject}@example.test`,
        'x-test-display-name': subject,
        'x-workspace-context-id': workspaceId,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        ...(key ? { 'idempotency-key': key } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }
  function post({
    fixture,
    path,
    body,
    key,
    subject = 'risk-member',
  }: {
    fixture: Fixture;
    path: string;
    body: unknown;
    key: string;
    subject?: string;
  }): Promise<Response> {
    return request({
      path,
      companyId: fixture.companyId,
      subject,
      method: 'POST',
      body,
      key,
    });
  }
  async function command({
    fixture,
    path,
    body,
    key,
    subject = 'risk-member',
  }: {
    fixture: Fixture;
    path: string;
    body: unknown;
    key: string;
    subject?: string;
  }): Promise<Record<string, unknown>> {
    const response = await post({ fixture, path, body, key, subject });
    const value: unknown = await response.json();
    expect({ status: response.status, value }).toMatchObject({ status: 201 });
    return object(value);
  }
  async function read({
    fixture,
    path,
    subject = 'risk-member',
  }: {
    fixture: Fixture;
    path: string;
    subject?: string;
  }): Promise<unknown> {
    const response = await request({
      path,
      subject,
      companyId: fixture.companyId,
    });
    expect(response.status).toBe(200);
    return response.json();
  }
  async function rows(table: string): Promise<unknown[]> {
    if (
      ![
        'operational_risks',
        'operational_risk_entries',
        'operational_risk_events',
        'operational_risk_receipts',
        'activity_log_events',
      ].includes(table)
    )
      throw new Error('Unknown synthetic table');
    return (await pool.query(`SELECT * FROM ${table}`)).rows;
  }

  async function hold(acquire: (connection: PoolClient) => Promise<void>) {
    const connection = await pool.connect();
    let released = false;
    try {
      await connection.query('BEGIN');
      const result = await connection.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      const backendPid = result.rows[0]?.pid;
      if (backendPid === undefined)
        throw new Error('Missing synthetic blocker backend.');
      await acquire(connection);
      return {
        backendPid,
        release: async () => {
          if (released) return;
          released = true;
          try {
            await connection.query('COMMIT');
          } finally {
            connection.release();
          }
        },
      };
    } catch (error) {
      await connection.query('ROLLBACK');
      connection.release();
      throw error;
    }
  }
  async function waitForBlockedBy(backendPid: number): Promise<number> {
    const deadline = Date.now() + 3000;
    do {
      const result = await pool.query<{ pid: number }>(
        'SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND $1::integer=ANY(pg_blocking_pids(pid))',
        [backendPid],
      );
      const pid = result.rows[0]?.pid;
      if (pid !== undefined) return pid;
    } while (Date.now() < deadline);
    throw new Error('Expected a PostgreSQL holder/waiter edge.');
  }
  async function pauseWrites(
    table: 'operational_risks' | 'operational_risk_entries',
  ) {
    const key = `synthetic-risk-pause-${crypto.randomUUID()}`;
    const held = await hold(async (connection) => {
      await connection.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [key],
      );
    });
    await pool.query(
      `CREATE FUNCTION test_pause_risk() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('${key}',0)); RETURN NEW; END $$; CREATE TRIGGER test_pause_risk BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION test_pause_risk()`,
    );
    return {
      ...held,
      close: async () => {
        await held.release();
        await pool.query(
          `DROP TRIGGER IF EXISTS test_pause_risk ON ${table}; DROP FUNCTION IF EXISTS test_pause_risk()`,
        );
      },
    };
  }
  async function race({
    table,
    first,
    second,
  }: {
    table: 'operational_risks' | 'operational_risk_entries';
    first: () => Promise<Response>;
    second: () => Promise<Response>;
  }): Promise<[Response, Response]> {
    const pause = await pauseWrites(table);
    let left: Promise<Response> | undefined;
    let right: Promise<Response> | undefined;
    try {
      left = first();
      const firstPid = await waitForBlockedBy(pause.backendPid);
      right = second();
      await waitForBlockedBy(firstPid);
      await pause.release();
      return await Promise.all([left, right]);
    } finally {
      await pause.close();
      await Promise.allSettled(
        [left, right].filter((value) => value !== undefined),
      );
    }
  }
});

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected a synthetic object.');
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Expected a synthetic string.');
  return value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected a synthetic array.');
  return value;
}
