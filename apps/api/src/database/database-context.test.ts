import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ClientReferenceStateDrift } from './client-reference-state-drift.js';
import { DatabaseContext } from './database-context.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from './isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres('Client reference transaction recovery', () => {
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
      namePrefix: 'client_reference_retry',
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

  it('releases old locks and rolls back effects before each fresh whole attempt', async () => {
    const transactionIds = new Set<string>();
    let attempts = 0;
    const result = await context.transaction(async () => {
      attempts += 1;
      // An independent connection can take the row only after the preceding
      // attempt has rolled back. It also sees none of that attempt's writes.
      const previous = await requiredDatabase().targetPool.query<{
        value: number;
      }>(
        'SELECT value FROM reference_retry_probe WHERE id = 1 FOR UPDATE NOWAIT',
      );
      expect(previous.rows).toEqual([{ value: 0 }]);
      const identity = await context.connection.execute<{ id: string }>(
        sql`SELECT txid_current()::text AS id`,
      );
      transactionIds.add(requiredRow(identity.rows).id);
      await context.connection.execute(
        sql`UPDATE reference_retry_probe SET value = value + 1 WHERE id = 1`,
      );
      if (attempts < 3) throw new ClientReferenceStateDrift();
      return 'committed';
    });

    expect(result).toBe('committed');
    expect(attempts).toBe(3);
    expect(transactionIds.size).toBe(3);
    expect(
      (
        await requiredDatabase().targetPool.query(
          'SELECT value FROM reference_retry_probe',
        )
      ).rows,
    ).toEqual([{ value: 1 }]);
  });

  it('stops after three drifting transactions with the original opaque refusal and no effects', async () => {
    const transactionIds = new Set<string>();
    let attempts = 0;
    const operation = context.transaction(async () => {
      attempts += 1;
      const identity = await context.connection.execute<{ id: string }>(
        sql`SELECT txid_current()::text AS id`,
      );
      transactionIds.add(requiredRow(identity.rows).id);
      await context.connection.execute(
        sql`UPDATE reference_retry_probe SET value = value + 1 WHERE id = 1`,
      );
      throw new ClientReferenceStateDrift();
    });
    await expect(operation).rejects.toBeInstanceOf(NotFoundException);
    await expect(operation).rejects.toMatchObject({
      status: 404,
      response: new NotFoundException().getResponse(),
    });

    expect(attempts).toBe(3);
    expect(transactionIds.size).toBe(3);
    expect(
      (
        await requiredDatabase().targetPool.query(
          'SELECT value FROM reference_retry_probe',
        )
      ).rows,
    ).toEqual([{ value: 0 }]);
  });

  it('rechecks live authority in the new transaction and stops on its denial', async () => {
    let attempts = 0;
    const denial = new ForbiddenException();
    await expect(
      context.transaction(async () => {
        attempts += 1;
        const authority = await context.connection.execute<{
          allowed: boolean;
        }>(sql`SELECT allowed FROM reference_retry_probe WHERE id = 1`);
        if (!requiredRow(authority.rows).allowed) throw denial;
        await requiredDatabase().targetPool.query(
          'UPDATE reference_retry_probe SET allowed = false WHERE id = 1',
        );
        throw new ClientReferenceStateDrift();
      }),
    ).rejects.toBe(denial);

    expect(attempts).toBe(2);
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

function requiredRow<Row extends object>(rows: readonly Row[]): Row {
  const [row] = rows;
  if (!row) throw new Error('The PostgreSQL fixture did not return its row.');
  return row;
}
