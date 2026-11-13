import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  advisoryTransactionLock,
  commandFingerprint,
  idempotencyConflict,
  insertionOrderFingerprint,
  runIdempotentCommand,
  runKeyedCommand,
  staleVersionConflict,
  type CommandDatabase,
  type IdempotentCommand,
  type KeyedCommand,
} from './idempotent-command.js';

const dialect = new PgDialect();

// Records each protocol step, including the transaction boundary and the
// advisory lock key, in the order they happen.
function recordingDatabase(steps: string[]): CommandDatabase {
  let open = false;
  return {
    connection: {
      execute: async (query: SQL) => {
        if (!open) throw new Error('The lock was taken outside a transaction.');
        const { sql, params } = dialect.sqlToQuery(query);
        steps.push(`lock ${sql} ${JSON.stringify(params)}`);
      },
    },
    transaction: async (work) => {
      steps.push('begin');
      open = true;
      try {
        return await work();
      } finally {
        open = false;
        steps.push('end');
      }
    },
  };
}

interface Receipt {
  readonly fingerprint: string;
  readonly answer: string;
}

function command(
  steps: string[],
  recorded: Receipt | undefined,
  overrides: Partial<IdempotentCommand<string, Receipt, string>> = {},
): IdempotentCommand<string, Receipt, string> {
  return {
    fingerprint: 'submitted',
    authorize: async () => {
      steps.push('authorize');
      return 'company-1';
    },
    lockParts: (scope) => ['example.command', scope, 'member-1', 'key-1'],
    findReceipt: async (scope) => {
      steps.push(`find ${scope}`);
      return recorded;
    },
    conflict: () => idempotencyConflict('Already used.'),
    replay: async (scope, receipt) => {
      steps.push(`replay ${scope}`);
      return receipt.answer;
    },
    // Execution is where expected-version checks live; this one is stale.
    execute: async () => {
      steps.push('execute');
      throw staleVersionConflict('Reload before retrying.');
    },
    ...overrides,
  };
}

const LOCK =
  'lock SELECT pg_advisory_xact_lock(hashtextextended($1, 0)) ["[\\"example.command\\",\\"company-1\\",\\"member-1\\",\\"key-1\\"]"]';

describe('runIdempotentCommand', () => {
  it('re-checks authority inside the transaction before locking the key and reading its receipt', async () => {
    const steps: string[] = [];
    await expect(
      runIdempotentCommand(recordingDatabase(steps), command(steps, undefined)),
    ).rejects.toMatchObject({
      response: { code: 'STALE_VERSION', message: 'Reload before retrying.' },
    });
    expect(steps).toEqual([
      'begin',
      'authorize',
      LOCK,
      'find company-1',
      'execute',
      'end',
    ]);
  });

  it('stops a denied actor before the lock, the receipt and any write', async () => {
    const steps: string[] = [];
    const denial = new Error('denied');
    await expect(
      runIdempotentCommand(
        recordingDatabase(steps),
        command(
          steps,
          { fingerprint: 'submitted', answer: 'recorded' },
          {
            authorize: async () => {
              steps.push('authorize');
              throw denial;
            },
          },
        ),
      ),
    ).rejects.toBe(denial);
    expect(steps).toEqual(['begin', 'authorize', 'end']);
  });

  it('answers an exact replay from its receipt before any staleness check could run', async () => {
    const steps: string[] = [];
    expect(
      await runIdempotentCommand(
        recordingDatabase(steps),
        command(steps, { fingerprint: 'submitted', answer: 'recorded' }),
      ),
    ).toBe('recorded');
    expect(steps).toEqual([
      'begin',
      'authorize',
      LOCK,
      'find company-1',
      'replay company-1',
      'end',
    ]);
  });

  it('refuses a changed fingerprint under the same key without replaying or executing', async () => {
    const steps: string[] = [];
    const refusal = runIdempotentCommand(
      recordingDatabase(steps),
      command(steps, { fingerprint: 'other', answer: 'recorded' }),
    );
    await expect(refusal).rejects.toBeInstanceOf(ConflictException);
    await expect(refusal).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_CONFLICT', message: 'Already used.' },
    });
    expect(steps).toEqual([
      'begin',
      'authorize',
      LOCK,
      'find company-1',
      'end',
    ]);
  });

  it('executes a first use of the key', async () => {
    const steps: string[] = [];
    expect(
      await runIdempotentCommand(
        recordingDatabase(steps),
        command(steps, undefined, {
          execute: async (scope) => {
            steps.push(`execute ${scope}`);
            return 'created';
          },
        }),
      ),
    ).toBe('created');
    expect(steps).toEqual([
      'begin',
      'authorize',
      LOCK,
      'find company-1',
      'execute company-1',
      'end',
    ]);
  });
});

describe('runKeyedCommand', () => {
  interface StoredReceipt {
    readonly intent: unknown;
    readonly targetId: string;
    readonly answer: string;
  }
  const ACTOR = {
    workspaceId: 'workspace-1',
    workspaceMembershipId: 'member-1',
  };
  const KEYED_LOCK =
    'lock SELECT pg_advisory_xact_lock(hashtextextended($1, 0)) ["[\\"example.keyed\\",\\"workspace-1\\",\\"member-1\\",\\"key-1\\"]"]';

  // A create command whose target is generated, so a replay's intent names
  // the recorded target rather than a new one.
  function keyed(
    steps: string[],
    recorded: StoredReceipt | undefined,
    overrides: Partial<KeyedCommand<string, StoredReceipt, string>> = {},
  ): KeyedCommand<string, StoredReceipt, string> {
    return {
      name: 'example.keyed',
      actor: ACTOR,
      key: '  key-1 ',
      maxKeyLength: 5,
      authorize: async () => {
        steps.push('authorize');
        return 'company-1';
      },
      findReceipt: async ({ scope, key }) => {
        steps.push(`find ${scope} ${key}`);
        return recorded;
      },
      intent: ({ scope, receipt }) => ({
        companyId: scope,
        targetId: receipt.targetId,
        payload: { label: 'Audit', lines: [1, 2] },
      }),
      recordedIntent: (receipt) => receipt.intent,
      replay: async ({ scope, receipt }) => {
        steps.push(`replay ${scope}`);
        return receipt.answer;
      },
      execute: async ({ scope, key }) => {
        steps.push(`execute ${scope} ${key}`);
        return 'created';
      },
      ...overrides,
    };
  }

  it('refuses a missing or over-long key as a client error before any transaction', async () => {
    for (const key of [undefined, '   ', 'key-10']) {
      const steps: string[] = [];
      await expect(
        runKeyedCommand(
          recordingDatabase(steps),
          keyed(steps, undefined, { key }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(steps).toEqual([]);
    }
  });

  it('authorizes, then locks the trimmed key in the actor namespace, then executes a first use', async () => {
    const steps: string[] = [];
    expect(
      await runKeyedCommand(recordingDatabase(steps), keyed(steps, undefined)),
    ).toBe('created');
    expect(steps).toEqual([
      'begin',
      'authorize',
      KEYED_LOCK,
      'find company-1 key-1',
      'execute company-1 key-1',
      'end',
    ]);
  });

  it('replays a recorded intent equal to the submitted one whatever its key order', async () => {
    const steps: string[] = [];
    const recorded = {
      targetId: 'target-1',
      answer: 'recorded',
      // As read back from a jsonb column: keys reordered.
      intent: {
        payload: { lines: [1, 2], label: 'Audit' },
        targetId: 'target-1',
        companyId: 'company-1',
      },
    };
    expect(
      await runKeyedCommand(recordingDatabase(steps), keyed(steps, recorded)),
    ).toBe('recorded');
    expect(steps).toEqual([
      'begin',
      'authorize',
      KEYED_LOCK,
      'find company-1 key-1',
      'replay company-1',
      'end',
    ]);
  });

  it('refuses a changed intent with the shared conflict before replay or execution', async () => {
    for (const intent of [
      {
        companyId: 'company-2',
        targetId: 'target-1',
        payload: { label: 'Audit', lines: [1, 2] },
      },
      {
        companyId: 'company-1',
        targetId: 'target-1',
        payload: { label: 'Audit', lines: [2, 1] },
      },
    ]) {
      const steps: string[] = [];
      const refusal = runKeyedCommand(
        recordingDatabase(steps),
        keyed(steps, { targetId: 'target-1', answer: 'recorded', intent }),
      );
      await expect(refusal).rejects.toBeInstanceOf(ConflictException);
      await expect(refusal).rejects.toMatchObject({
        response: {
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'Idempotency-Key was already used for another command.',
        },
      });
      expect(steps).toEqual([
        'begin',
        'authorize',
        KEYED_LOCK,
        'find company-1 key-1',
        'end',
      ]);
    }
  });

  it('stops a denied actor before the key lock and the receipt', async () => {
    const steps: string[] = [];
    const denial = new Error('denied');
    await expect(
      runKeyedCommand(
        recordingDatabase(steps),
        keyed(steps, undefined, {
          authorize: async () => {
            steps.push('authorize');
            throw denial;
          },
        }),
      ),
    ).rejects.toBe(denial);
    expect(steps).toEqual(['begin', 'authorize', 'end']);
  });
});

describe('advisoryTransactionLock', () => {
  it('locks on the JSON array spelling of its parts', async () => {
    const steps: string[] = [];
    const database = recordingDatabase(steps);
    await database.transaction(() =>
      advisoryTransactionLock(database.connection, [
        'example.command',
        'company-1',
        'member-1',
        'key-1',
      ]),
    );
    expect(steps).toEqual(['begin', LOCK, 'end']);
  });
});

describe('command fingerprints', () => {
  // The pricing publication implementation every Offer, Contract, Pricing and
  // Catalogue receipt was recorded with, inlined unchanged.
  function previousCommandFingerprint(value: Record<string, unknown>): string {
    return createHash('sha256').update(stableJson(value)).digest('hex');
  }
  function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (typeof value === 'object' && value !== null)
      return `{${Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
        .join(',')}}`;
    return JSON.stringify(value) ?? 'null';
  }

  const payloads: Record<string, unknown>[] = [
    { companyId: 'company-1', payload: { name: 'Audit', price: '12.50' } },
    {
      offerId: 'offer-1',
      expectedVersion: 3,
      lines: [{ quantity: 2, note: null }, { quantity: 1 }],
      flag: true,
      absent: undefined,
    },
    { companyId: 'c', payload: 'Ăăâ — "quoted"', zeta: [], alpha: {} },
  ];

  it('keeps the stable fingerprint byte-identical to the pricing publication one', () => {
    for (const payload of payloads)
      expect(commandFingerprint(payload)).toBe(
        previousCommandFingerprint(payload),
      );
  });

  it('ignores object key order in the stable fingerprint but not in the insertion-order one', () => {
    const forward = { a: 1, b: { c: 2, d: 3 } };
    const backward = { b: { d: 3, c: 2 }, a: 1 };
    expect(commandFingerprint(forward)).toBe(commandFingerprint(backward));
    expect(insertionOrderFingerprint(forward)).not.toBe(
      insertionOrderFingerprint(backward),
    );
    expect(insertionOrderFingerprint(forward)).toBe(
      createHash('sha256').update(JSON.stringify(forward)).digest('hex'),
    );
  });

  it('keeps the shared refusals and their default message', () => {
    expect(idempotencyConflict().getResponse()).toEqual({
      code: 'IDEMPOTENCY_CONFLICT',
      message: 'Idempotency-Key was already used for another command.',
    });
    expect(staleVersionConflict('Reload.').getResponse()).toEqual({
      code: 'STALE_VERSION',
      message: 'Reload.',
    });
  });
});
