import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ClientReferenceStateDrift } from '../client/client-reference-state-drift.js';
import { DatabaseContext } from './database-context.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from './isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres('DatabaseContext transactions', () => {
  let database: IsolatedPostgresTestDatabase | undefined;
  let context: DatabaseContext;

  function requiredDatabase(): IsolatedPostgresTestDatabase {
    if (!database)
      throw new Error('The owned PostgreSQL fixture is not ready.');
    return database;
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'database_context',
    });
    context = new DatabaseContext(drizzle(database.targetPool));
    await database.targetPool.query(`CREATE TABLE reference_retry_probe (
      id integer PRIMARY KEY, value integer NOT NULL, allowed boolean NOT NULL
    )`);
  });

  beforeEach(async () => {
    await requiredDatabase().targetPool.query('TRUNCATE reference_retry_probe');
    await requiredDatabase().targetPool.query(
      'INSERT INTO reference_retry_probe VALUES (1, 0, true)',
    );
  });

  afterAll(async () => {
    await database?.close();
  });

  it('preserves transaction configuration and restores the connection after commit', async () => {
    const connection = context.connection;
    const result = await context.transaction(
      async () => {
        expect(context.connection).not.toBe(connection);
        const settings = await context.connection.execute<{
          isolation: string;
          readOnly: string;
        }>(sql`SELECT current_setting('transaction_isolation') AS isolation,
          current_setting('transaction_read_only') AS "readOnly"`);
        expect(settings.rows).toEqual([
          { isolation: 'repeatable read', readOnly: 'on' },
        ]);
        return 'committed';
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );

    expect(result).toBe('committed');
    expect(context.connection).toBe(connection);
  });

  it('runs ordinary transactions once and propagates Client drift unchanged after rollback', async () => {
    const error = new ClientReferenceStateDrift();
    const connection = context.connection;
    let attempts = 0;
    const operation = context.transaction(async () => {
      attempts += 1;
      await context.connection.execute(
        sql`UPDATE reference_retry_probe SET value = value + 1 WHERE id = 1`,
      );
      throw error;
    });

    await expect(operation).rejects.toBe(error);
    expect(attempts).toBe(1);
    expect(context.connection).toBe(connection);
    expect(
      (
        await requiredDatabase().targetPool.query(
          'SELECT value FROM reference_retry_probe WHERE id = 1 FOR UPDATE NOWAIT',
        )
      ).rows,
    ).toEqual([{ value: 0 }]);
  });

  it.each([
    new NotFoundException(),
    new ForbiddenException(),
    new Error('Unrelated failure'),
  ])(
    'does not retry an ordinary refusal or unrelated error: %s',
    async (error) => {
      let attempts = 0;
      await expect(
        context.transaction(async () => {
          attempts += 1;
          await context.connection.execute(
            sql`UPDATE reference_retry_probe SET value = value + 1 WHERE id = 1`,
          );
          throw error;
        }),
      ).rejects.toBe(error);

      expect(attempts).toBe(1);
      expect(
        (
          await requiredDatabase().targetPool.query(
            'SELECT value FROM reference_retry_probe',
          )
        ).rows,
      ).toEqual([{ value: 0 }]);
    },
  );

  it('does not retry a PostgreSQL failure', async () => {
    let attempts = 0;
    await expect(
      context.transaction(async () => {
        attempts += 1;
        await context.connection.execute(sql`SELECT 1 / 0`);
      }),
    ).rejects.toMatchObject({ cause: { code: '22012' } });

    expect(attempts).toBe(1);
  });
});
