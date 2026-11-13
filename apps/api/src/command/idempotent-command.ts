import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { requireBoundedIdempotencyKey } from '../access/access-command-validation.js';

// The idempotency protocol every keyed mutation command follows. A command
// adopted through `runKeyedCommand` supplies its authority check, receipt
// store, replay and execution; this module parses the key, derives its lock,
// compares intents and answers a key conflict. `runIdempotentCommand` serves
// commands still supplying their own lock, fingerprint and conflict.

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
  return runKeyedSequence(database, {
    authorize: () => command.authorize(),
    lockParts: (scope) => command.lockParts(scope),
    findReceipt: (scope) => command.findReceipt(scope),
    sameCommand: (_scope, receipt) =>
      receipt.fingerprint === command.fingerprint,
    conflict: () => command.conflict(),
    replay: (scope, receipt) => command.replay(scope, receipt),
    execute: (scope) => command.execute(scope),
  });
}

/** The member whose key namespace a keyed command uses. */
export interface KeyedCommandActor {
  readonly workspaceId: string;
  readonly workspaceMembershipId: string;
}

/**
 * A command whose `Idempotency-Key` names one receipt per actor and key,
 * whatever the command's action, target or Company.
 */
export interface KeyedCommand<Scope, Receipt, Result> {
  /**
   * The command family. With the actor and the key it spells the advisory
   * lock, so renaming it changes which commands serialize with each other.
   */
  readonly name: string;
  readonly actor: KeyedCommandActor;
  /** The `Idempotency-Key` header as received. */
  readonly key: string | undefined;
  /** The longest key the receipt store accepts, in code points. */
  readonly maxKeyLength: number;
  /**
   * Re-reads the actor's authority under share locks inside the transaction,
   * so a concurrent revocation commits either before this check or after the
   * command. Returns what the command was authorized for, such as the Company.
   */
  authorize(): Promise<Scope>;
  /** The actor's receipt for this key, whatever command recorded it. */
  findReceipt(input: {
    readonly scope: Scope;
    readonly key: string;
  }): Promise<Receipt | undefined>;
  /** The intent the receipt recorded, exactly as stored. */
  recordedIntent(receipt: Receipt): unknown;
  /**
   * The submitted intent, spelled as `execute` records it. A target the
   * first use generated is the receipt's, so only a changed command differs.
   */
  intent(input: { readonly scope: Scope; readonly receipt: Receipt }): unknown;
  /**
   * Validates the receipt against its committed facts and answers from it.
   * It runs before any state or version check and writes nothing.
   */
  replay(input: {
    readonly scope: Scope;
    readonly receipt: Receipt;
  }): Promise<Result>;
  /**
   * Runs a first use of the key: state and version checks, mutation, event
   * and receipt, all inside the same transaction.
   */
  execute(input: {
    readonly scope: Scope;
    readonly key: string;
  }): Promise<Result>;
}

/**
 * Runs a keyed command: the key is parsed before any transaction; inside it,
 * authority is rechecked, the actor's key is locked, and an exact retry
 * replays its receipt while any other use of the key is refused with
 * `IDEMPOTENCY_CONFLICT`. Intents are the same command when their
 * `commandFingerprint` is, so a store may return them in any key order.
 */
export async function runKeyedCommand<Scope, Receipt, Result>(
  database: CommandDatabase,
  command: KeyedCommand<Scope, Receipt, Result>,
): Promise<Result> {
  const key = requireBoundedIdempotencyKey(command.key, command.maxKeyLength);
  return runKeyedSequence(database, {
    authorize: () => command.authorize(),
    lockParts: () => [
      command.name,
      command.actor.workspaceId,
      command.actor.workspaceMembershipId,
      key,
    ],
    findReceipt: (scope) => command.findReceipt({ scope, key }),
    sameCommand: (scope, receipt) =>
      commandFingerprint(command.recordedIntent(receipt)) ===
      commandFingerprint(command.intent({ scope, receipt })),
    conflict: () => idempotencyConflict(),
    replay: (scope, receipt) => command.replay({ scope, receipt }),
    execute: (scope) => command.execute({ scope, key }),
  });
}

interface KeyedSequence<Scope, Receipt, Result> {
  authorize(): Promise<Scope>;
  lockParts(scope: Scope): AdvisoryLockParts;
  findReceipt(scope: Scope): Promise<Receipt | undefined>;
  sameCommand(scope: Scope, receipt: Receipt): boolean;
  conflict(): Error;
  replay(scope: Scope, receipt: Receipt): Promise<Result>;
  execute(scope: Scope): Promise<Result>;
}

// Authorization, then the key lock, then the receipt: a replay is answered
// before any state or version check, and a denied actor reaches neither.
function runKeyedSequence<Scope, Receipt, Result>(
  database: CommandDatabase,
  sequence: KeyedSequence<Scope, Receipt, Result>,
): Promise<Result> {
  return database.transaction(async () => {
    const scope = await sequence.authorize();
    await advisoryTransactionLock(
      database.connection,
      sequence.lockParts(scope),
    );
    const receipt = await sequence.findReceipt(scope);
    if (receipt === undefined) return sequence.execute(scope);
    if (!sequence.sameCommand(scope, receipt)) throw sequence.conflict();
    return sequence.replay(scope, receipt);
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
export function commandFingerprint(value: unknown): string {
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
