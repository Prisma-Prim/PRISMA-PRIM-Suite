import { DrizzleQueryError } from 'drizzle-orm';
import type { PgTransactionConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { readConsistently } from './consistent-read.js';

function serializationFailure(): Error {
  return Object.assign(new Error('could not serialize access'), {
    code: '40001',
  });
}

// Runs each attempt's work once, recording the configuration it was given,
// and fails the first `failures` attempts the way the driver reports them.
function recordingTransactions(failures: readonly unknown[]) {
  const configs: (PgTransactionConfig | undefined)[] = [];
  return {
    configs,
    transaction: async <T>(
      work: () => Promise<T>,
      config?: PgTransactionConfig,
    ): Promise<T> => {
      configs.push(config);
      const result = await work();
      const failure = failures[configs.length - 1];
      if (failure !== undefined) throw failure;
      return result;
    },
  };
}

describe('readConsistently', () => {
  it('runs the read in one repeatable-read transaction when nothing interferes', async () => {
    const database = recordingTransactions([]);
    expect(await readConsistently(database, async () => 'page')).toBe('page');
    expect(database.configs).toEqual([{ isolationLevel: 'repeatable read' }]);
  });

  it('restarts the whole read after a serialization failure, raw or wrapped by Drizzle', async () => {
    const database = recordingTransactions([
      serializationFailure(),
      new DrizzleQueryError('SELECT 1', [], serializationFailure()),
    ]);
    let reads = 0;
    expect(
      await readConsistently(database, async () => {
        reads += 1;
        return reads;
      }),
    ).toBe(3);
    expect(database.configs).toHaveLength(3);
  });

  it('propagates any other failure at once', async () => {
    const refusal = new Error('denied');
    const database = recordingTransactions([refusal]);
    await expect(readConsistently(database, async () => 'page')).rejects.toBe(
      refusal,
    );
    expect(database.configs).toHaveLength(1);
  });

  it('gives up after eight attempts with the last serialization failure', async () => {
    const failures = Array.from({ length: 8 }, serializationFailure);
    const database = recordingTransactions(failures);
    await expect(readConsistently(database, async () => 'page')).rejects.toBe(
      failures[7],
    );
    expect(database.configs).toHaveLength(8);
  });
});
