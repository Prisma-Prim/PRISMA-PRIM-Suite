import { describe, expect, it } from 'vitest';
import { assertLocalTestDatabaseUrl } from './test-database-target.js';

describe('local test database target', () => {
  it('accepts an isolated loopback PostgreSQL test database', () => {
    for (const connectionString of [
      'postgresql://user:secret@127.0.0.1:5432/prisma_prim_test',
      'postgresql://user:secret@127.0.0.2:5432/prisma_prim_test',
      'postgres://user:secret@[::1]:5432/prisma_prim_test',
    ]) {
      expect(() => assertLocalTestDatabaseUrl(connectionString)).not.toThrow();
    }
  });

  it.each([
    'https://127.0.0.1/prisma_prim_test',
    'postgresql://user:secret@localhost:5432/prisma_prim_test',
    'postgresql://user:secret@db.example.test/prisma_prim_test',
    'postgresql://user:secret@127.0.0.1/prisma_prim',
    'postgresql://user:secret@127.0.0.1/prisma_prim_test?host=db.example.test',
    'postgresql://user:secret@127.0.0.1/prisma_prim_test#override',
    'postgresql://user:secret@127.0.0.1/prisma%2Fprim_test',
    'postgresql://user:secret@127.0.0.1/prisma%3Fprim_test',
    'postgresql://user:secret@127.0.0.1/prisma%ZZ_test',
  ])('rejects an unsafe target: %s', (connectionString) => {
    expect(() => assertLocalTestDatabaseUrl(connectionString)).toThrow(
      /without connection-target overrides/,
    );
  });

  it('does not expose rejected target credentials', () => {
    expect(() =>
      assertLocalTestDatabaseUrl(
        'postgresql://destructive-user:destructive-password@db.example.test/private_test',
      ),
    ).toThrowError(
      new Error(
        'TEST_DATABASE_URL must identify a numeric-loopback database whose name ends with "_test", without connection-target overrides.',
      ),
    );
  });
});
