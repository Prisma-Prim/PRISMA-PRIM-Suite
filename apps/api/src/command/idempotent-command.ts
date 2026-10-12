import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';

// The idempotency protocol every keyed mutation command follows. A command
// supplies its own authority check, lock scope, receipt lookup, replay and
// execution; this module owns their order and the shared refusals.

/** The connection a command runs on: the current transaction's. */
export interface CommandConnection {
  execute(query: SQL): PromiseLike<unknown>;
}

/** The transaction boundary of one command, normally `DatabaseContext`. */
export interface CommandDatabase {
  readonly connection: CommandConnection;
  transaction<T>(work: () => Promise<T>): Promise<T>;
}

/**
 * The parts of one transaction-scoped advisory lock key. They are hashed as
 * their JSON array spelling, so changing a part, its order or its spelling
 * changes which commands serialize with each other.
 */
export type AdvisoryLockParts = readonly string[];

export interface RecordedReceipt {
  readonly fingerprint: string;
}

export interface IdempotentCommand<
  Scope,
  Receipt extends RecordedReceipt,
  Result,
> {
  /** The submitted command's fingerprint, computed before the transaction. */
  readonly fingerprint: string;
  /**
   * Re-reads the actor's authority under share locks inside the transaction,
   * so a concurrent revocation or suspension commits either before this check
   * or after the command. Returns the authorized scope, such as the Company.
   */
  authorize(): Promise<Scope>;
  /** Serializes every use of this actor's key within the scope. */
  lockParts(scope: Scope): AdvisoryLockParts;
  findReceipt(scope: Scope): Promise<Receipt | undefined>;
  /** The refusal for a key already used with another fingerprint. */
  conflict(): Error;
  /**
   * Answers an exact retry from its recorded receipt. It runs before any
   * expected-version or no-op check, so a retry whose observed version is now
   * stale still receives its original answer, and it writes nothing.
   */
  replay(scope: Scope, receipt: Receipt): Promise<Result>;
  /**
   * Runs a first use of the key: expected version, no-op, mutation, event and
   * receipt, all inside the same transaction.
   */
  execute(scope: Scope): Promise<Result>;
}

export function runIdempotentCommand<
  Scope,
  Receipt extends RecordedReceipt,
  Result,
>(
  database: CommandDatabase,
  command: IdempotentCommand<Scope, Receipt, Result>,
): Promise<Result> {
  return database.transaction(async () => {
    const scope = await command.authorize();
    await advisoryTransactionLock(
      database.connection,
      command.lockParts(scope),
    );
    const receipt = await command.findReceipt(scope);
    if (receipt === undefined) return command.execute(scope);
    if (receipt.fingerprint !== command.fingerprint) throw command.conflict();
    return command.replay(scope, receipt);
  });
}

/** Holds one advisory lock until the current transaction ends. */
export async function advisoryTransactionLock(
  connection: CommandConnection,
  parts: AdvisoryLockParts,
): Promise<void> {
  await connection.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(parts)}, 0))`,
  );
}

/**
 * The fingerprint for new commands. It covers the scope, any target and the
 * payload exactly as submitted, strings included, while object key order is
 * immaterial. It is computed before validation so a replay is recognized
 * without re-running any later step of the command.
 */
export function commandFingerprint(value: Record<string, unknown>): string {
  return sha256(stableJson(value));
}

/**
 * The fingerprint of commands whose receipts were recorded over the plain
 * JSON spelling of a fixed object, where key order is material. Those
 * commands keep it so every recorded receipt keeps replaying.
 */
export function insertionOrderFingerprint(
  value: Record<string, unknown>,
): string {
  return sha256(JSON.stringify(value));
}

export function idempotencyConflict(
  message = 'Idempotency-Key was already used for another command.',
): ConflictException {
  return new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message });
}

export function staleVersionConflict(message: string): ConflictException {
  return new ConflictException({ code: 'STALE_VERSION', message });
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
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
