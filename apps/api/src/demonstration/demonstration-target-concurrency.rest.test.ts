import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import { runDemonstrationSeedCommand } from './demonstration-seed.command.js';

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000409';
const OTHER_ID = '00000000-0000-4000-8000-000000000410';
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = testDatabaseUrl ? describe : describe.skip;

withPostgres(
  'demonstration command target races through the public API',
  () => {
    let database: IsolatedPostgresTestDatabase;

    beforeEach(async () => {
      if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: testDatabaseUrl,
        namePrefix: 'demo_guard',
      });
      await migrate(drizzle({ client: database.targetPool }), {
        migrationsFolder: './drizzle',
      });
    }, 60_000);

    afterEach(async () => {
      vi.restoreAllMocks();
      vi.useRealTimers();
      await database?.close();
    });

    function run(write: (line: string) => void = () => undefined) {
      return runDemonstrationSeedCommand({
        argv: ['--confirm-workspace', WORKSPACE_ID],
        environment: {
          NODE_ENV: 'test',
          DATABASE_URL: database.targetUrl,
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'local-demo',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'local-demonstration-user',
          ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'PRISMA DEMO Workspace',
        },
        write,
      });
    }

    async function waitForTableWaiter(
      table: string,
      mode: string,
    ): Promise<number> {
      let pid: number | undefined;
      await vi.waitFor(
        async () => {
          const result = await database.targetPool.query<{ pid: number }>(
            `SELECT pid FROM pg_locks
         WHERE relation = $1::regclass AND mode = $2 AND NOT granted`,
            [table, mode],
          );
          pid = result.rows[0]?.pid;
          expect(pid).toBeTypeOf('number');
        },
        { interval: 10, timeout: 10_000 },
      );
      if (pid === undefined)
        throw new Error('Expected a blocked PostgreSQL session.');
      return pid;
    }

    async function expectCompanyWritesAndReleasedProtection(count = 0) {
      expect(
        (await database.targetPool.query('SELECT id FROM companies')).rows,
      ).toHaveLength(count);
      // A refusal/error must release every table lock; NOWAIT makes this a proof,
      // not an assertion based on how long the preceding command took.
      const probe = await database.targetPool.connect();
      try {
        await probe.query('BEGIN');
        await probe.query(
          'LOCK TABLE workspaces IN ACCESS EXCLUSIVE MODE NOWAIT',
        );
      } finally {
        await probe.query('ROLLBACK');
        probe.release();
      }
    }

    it.each(['insert', 'rename'] as const)(
      'revalidates a concurrent %s after classification and before the owner bootstrap',
      async (change) => {
        if (change === 'rename')
          await database.targetPool.query(
            "INSERT INTO workspaces (id, name) VALUES ($1, 'PRISMA DEMO Workspace')",
            [WORKSPACE_ID],
          );
        const competitor = await database.targetPool.connect();
        let pending: ReturnType<typeof run> | undefined;
        const lines: unknown[] = [];
        try {
          await competitor.query('BEGIN');
          await competitor.query('LOCK TABLE workspaces IN ROW EXCLUSIVE MODE');
          pending = run((line) => lines.push(JSON.parse(line)));
          // The initial read-only classification has passed. The seed cannot
          // take its first writable transaction snapshot until this lock releases.
          await waitForTableWaiter('workspaces', 'ShareRowExclusiveLock');
          if (change === 'insert')
            await competitor.query(
              "INSERT INTO workspaces (id, name) VALUES ($1, 'Other Workspace')",
              [OTHER_ID],
            );
          else
            await competitor.query(
              "UPDATE workspaces SET name = 'Renamed DEMO Workspace' WHERE id = $1",
              [WORKSPACE_ID],
            );
          await competitor.query('COMMIT');
          expect(await pending).toMatchObject({
            outcome: 'stopped',
            exitCode: 3,
          });
          expect(lines).toEqual([
            expect.objectContaining({
              step: 'workspace.owner',
              result: 'stopped',
            }),
          ]);
          expect(
            (await database.targetPool.query('SELECT id FROM internal_users'))
              .rows,
          ).toEqual([]);
          expect(
            (await database.targetPool.query('SELECT name FROM workspaces'))
              .rows,
          ).toEqual([
            {
              name:
                change === 'insert'
                  ? 'Other Workspace'
                  : 'Renamed DEMO Workspace',
            },
          ]);
          await expectCompanyWritesAndReleasedProtection();
        } finally {
          await competitor.query('ROLLBACK');
          competitor.release();
          await pending;
        }
      },
      30_000,
    );

    it.each([
      {
        table: 'workspace_memberships',
        lock: 'ACCESS EXCLUSIVE',
        stoppedStep: 'company.prisma-prim',
        companies: 0,
      },
      {
        table: 'companies',
        lock: 'SHARE',
        stoppedStep: 'company.bic',
        companies: 1,
      },
    ] as const)(
      'blocks an uncooperating Workspace INSERT during a write to $table and preserves committed steps',
      async ({ table, lock, stoppedStep, companies }) => {
        const pause = await database.targetPool.connect();
        const competitor = await database.targetPool.connect();
        let pending: ReturnType<typeof run> | undefined;
        let inserting: Promise<unknown> | undefined;
        const lines: unknown[] = [];
        try {
          await pause.query('BEGIN');
          await pause.query(`LOCK TABLE ${table} IN ${lock} MODE`);
          pending = run((line) => lines.push(JSON.parse(line)));
          const seedPid = await waitForTableWaiter(table, 'RowExclusiveLock');
          await competitor.query('BEGIN');
          inserting = competitor.query(
            "INSERT INTO workspaces (id, name) VALUES ($1, 'Other Workspace')",
            [OTHER_ID],
          );
          const writerPid = await waitForTableWaiter(
            'workspaces',
            'RowExclusiveLock',
          );
          expect(
            (
              await database.targetPool.query<{ blockers: number[] }>(
                'SELECT pg_blocking_pids($1) AS blockers',
                [writerPid],
              )
            ).rows[0]?.blockers,
          ).toContain(seedPid);
          await pause.query('COMMIT');
          await inserting;
          await competitor.query('COMMIT');
          expect(await pending).toMatchObject({
            outcome: 'stopped',
            exitCode: 3,
          });
          expect(lines[0]).toMatchObject({ workspace: { id: WORKSPACE_ID } });
          expect(lines.at(-1)).toMatchObject({
            result: 'stopped',
            step: stoppedStep,
          });
          expect(
            (await database.targetPool.query('SELECT id FROM internal_users'))
              .rows,
          ).toHaveLength(1);
          await expectCompanyWritesAndReleasedProtection(companies);
        } finally {
          await pause.query('ROLLBACK');
          pause.release();
          await competitor.query('ROLLBACK');
          competitor.release();
          await inserting;
          await pending;
        }
      },
      30_000,
    );

    it('publishes after a Workspace wait, exactly retries a lost reply and converges without another publication', async () => {
      const realFetch = globalThis.fetch;
      const pause = await database.targetPool.connect();
      let delayed = false;
      let published: unknown;
      let replayed: unknown;
      const lines: unknown[] = [];
      const wallStart = new Date();
      vi.setSystemTime(wallStart);
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        if (
          delayed ||
          init?.method !== 'POST' ||
          !String(input).endsWith('/pricing-configuration/rule-versions')
        )
          return realFetch(input, init);
        delayed = true;
        await pause.query('BEGIN');
        await pause.query('LOCK TABLE workspaces IN ROW EXCLUSIVE MODE');
        const pending = realFetch(input, init);
        try {
          await waitForTableWaiter('workspaces', 'ShareRowExclusiveLock');
          // Advance only Date, not timers: a confirmed database wait exceeds
          // the former five-second margin without sleeping in the test.
          vi.setSystemTime(new Date(wallStart.getTime() + 60_000));
        } finally {
          await pause.query('ROLLBACK');
        }
        const response = await pending;
        expect(response.status).toBe(201);
        published = await response.json();
        // Delivery is uncertain. Retry the exact public command, including its
        // key and payload; a new key or refreshed start would hide this defect.
        const retry = await realFetch(input, init);
        expect(retry.status).toBe(201);
        replayed = await retry.json();
        expect(replayed).toEqual(published);
        throw new Error('Simulated lost publication reply');
      });
      try {
        expect(await run((line) => lines.push(JSON.parse(line)))).toMatchObject(
          {
            outcome: 'stopped',
            exitCode: 3,
          },
        );
        expect(delayed).toBe(true);
        expect(published).toMatchObject({
          outcome: 'PUBLISHED',
          version: { versionNumber: 1, provisional: true },
        });
        expect(lines.at(-1)).toMatchObject({
          step: 'pricing.prisma-prim.rule-v1',
          reason: 'unavailable',
        });
        expect(
          (
            await database.targetPool.query(
              'SELECT id FROM pricing_rule_versions',
            )
          ).rows,
        ).toHaveLength(1);
        expect(
          (
            await database.targetPool.query(
              'SELECT id FROM pricing_configuration_events',
            )
          ).rows,
        ).toHaveLength(1);
        expect(
          (
            await database.targetPool.query(
              'SELECT * FROM pricing_configuration_commands',
            )
          ).rows,
        ).toHaveLength(1);
        const resumed: unknown[] = [];
        expect(
          await run((line) => resumed.push(JSON.parse(line))),
        ).toMatchObject({
          outcome: 'converged',
        });
        expect(resumed).toContainEqual(
          expect.objectContaining({
            step: 'pricing.prisma-prim.rule-v1',
            outcome: 'present',
          }),
        );
        expect(
          (
            await database.targetPool.query(
              'SELECT id FROM pricing_rule_versions',
            )
          ).rows,
        ).toHaveLength(2);
        expect(
          (
            await database.targetPool.query(
              'SELECT id FROM pricing_configuration_events',
            )
          ).rows,
        ).toHaveLength(2);
        expect(
          (
            await database.targetPool.query(
              'SELECT * FROM pricing_configuration_commands',
            )
          ).rows,
        ).toHaveLength(2);
        await expectCompanyWritesAndReleasedProtection(3);
      } finally {
        await pause.query('ROLLBACK');
        pause.release();
      }
    }, 60_000);

    it('closes the application and releases protection when manifest output throws', async () => {
      await expect(
        run(() => {
          throw new Error('Output failed');
        }),
      ).rejects.toThrow('Output failed');
      await expectCompanyWritesAndReleasedProtection();
      expect(
        (await database.targetPool.query('SELECT id FROM internal_users')).rows,
      ).toHaveLength(1);
    }, 30_000);
  },
);
