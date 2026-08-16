import { describe, expect, it } from 'vitest';
import { assertLocalTestDatabaseUrl } from './test-database-target.js';

describe('local test database target', () => {
  it('accepts an isolated loopback PostgreSQL test database', () => {
    expect(() =>
      assertLocalTestDatabaseUrl(
        'postgresql://user:secret@127.0.0.1:5432/prisma_prim_test',
      ),
    ).not.toThrow();
  });

  it.each([
    'https://127.0.0.1/prisma_prim_test',
    'postgresql://user:secret@db.example.test/prisma_prim_test',
    'postgresql://user:secret@127.0.0.1/prisma_prim',
    'postgresql://user:secret@127.0.0.1/prisma_prim_test?host=db.example.test',
    'postgresql://user:secret@127.0.0.1/prisma_prim_test#override',
  ])('rejects an unsafe target: %s', (connectionString) => {
    expect(() => assertLocalTestDatabaseUrl(connectionString)).toThrow(
      /without connection-target overrides/,
    );
  });
});
