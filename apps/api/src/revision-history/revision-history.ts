import { isDeepStrictEqual } from 'node:util';

/** Revisions per history page; a read fetches one more row to look ahead. */
export const REVISION_PAGE_SIZE = 25;

/** The fields of a decoded revision fact that the verifier couples. */
export interface RevisionFact {
  readonly revision: number;
  readonly commandId: string;
  readonly action: string;
  readonly actor: {
    readonly membershipId: string;
    readonly displayName: string;
  };
  readonly recordedAt: string;
  /** The state before the revision; `null` only at revision 1. */
  readonly before: unknown;
  readonly after: unknown;
}

/** One stored history row: its indexed columns beside the stored fact. */
export interface StoredRevision {
  readonly revision: number;
  readonly commandId: string;
  readonly fact: unknown;
}

export interface RevisionPage<Fact extends RevisionFact> {
  readonly items: Fact[];
  readonly hasMore: boolean;
}

/** A stored history that the verifier refuses; callers answer it as unavailable. */
export class RevisionHistoryIntegrityError extends Error {
  constructor(subject: string, reason: string) {
    super(`${subject} revision history is not intact: ${reason}.`);
    this.name = 'RevisionHistoryIntegrityError';
  }
}

/**
 * Verify one history page of one target, read newest first with at most one
 * look-ahead row, `before` being the exclusive upper revision of a
 * continuation. Fails closed when a fact does not match its row or target,
 * when adjacent revisions do not chain, when a continuation does not start
 * right below `before`, or when the final page does not end at revision 1.
 */
export function verifyRevisionPage<Fact extends RevisionFact>(page: {
  readonly subject: string;
  readonly targetId: string;
  readonly rows: readonly StoredRevision[];
  readonly before: number | undefined;
  readonly decode: (fact: unknown) => Fact;
  readonly targetOf: (fact: Fact) => string;
}): RevisionPage<Fact> {
  const fail = (reason: string): never => {
    throw new RevisionHistoryIntegrityError(page.subject, reason);
  };
  if (page.rows.length > REVISION_PAGE_SIZE + 1)
    fail('the page exceeds its look-ahead bound');
  const items = page.rows.map((row) => {
    const fact = page.decode(row.fact);
    if (
      page.targetOf(fact) !== page.targetId ||
      fact.revision !== row.revision ||
      fact.commandId !== row.commandId
    )
      fail('a fact is not coupled to its row');
    return fact;
  });
  for (const [index, newer] of items.entries()) {
    const older = items[index + 1];
    if (
      older &&
      (newer.revision !== older.revision + 1 ||
        !isDeepStrictEqual(newer.before, older.after))
    )
      fail('adjacent revisions do not chain');
  }
  if (page.before !== undefined && items[0]?.revision !== page.before - 1)
    fail('the continuation does not start below its cursor');
  const last = items.at(-1);
  if (
    last &&
    items.length <= REVISION_PAGE_SIZE &&
    (last.revision !== 1 || last.before !== null)
  )
    fail('the history does not reach revision 1');
  return {
    items: items.slice(0, REVISION_PAGE_SIZE),
    hasMore: items.length > REVISION_PAGE_SIZE,
  };
}

/** The stored command whose committed revision a replay answers. */
export interface CommittedCommand {
  readonly id: string;
  readonly targetId: string;
  readonly revision: number;
  readonly actorMembershipId: string;
  readonly actorDisplayName: string;
  readonly createdAt: Date;
}

/** The fields of a stored receipt that the verifier couples. */
export interface CommittedReceipt {
  readonly commandId: string;
  readonly targetId: string;
  readonly revision: number;
  readonly action: string;
  readonly recordedAt: string;
}

/**
 * Verify that a stored receipt and the revision fact it committed both belong
 * to the stored command, including its actor, before a replay returns it.
 */
export function verifyCommittedRevision(committed: {
  readonly subject: string;
  readonly command: CommittedCommand;
  readonly receipt: CommittedReceipt;
  readonly fact: RevisionFact & { readonly targetId: string };
}): void {
  const { command, receipt, fact } = committed;
  if (
    receipt.commandId !== command.id ||
    receipt.targetId !== command.targetId ||
    receipt.revision !== command.revision ||
    fact.targetId !== command.targetId ||
    fact.revision !== command.revision ||
    fact.commandId !== command.id ||
    fact.actor.membershipId !== command.actorMembershipId ||
    fact.actor.displayName !== command.actorDisplayName ||
    fact.action !== receipt.action ||
    fact.recordedAt !== receipt.recordedAt ||
    new Date(receipt.recordedAt).getTime() !== command.createdAt.getTime()
  )
    throw new RevisionHistoryIntegrityError(
      committed.subject,
      'a committed receipt is not coupled to its command and fact',
    );
}
