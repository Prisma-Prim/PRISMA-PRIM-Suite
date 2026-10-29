import { ConflictException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import type { DatabaseContext } from '../database/database-context.js';
import { contractCommands } from '../database/schema/index.js';

type ReceiptRow = typeof contractCommands.$inferSelect;
type ReceiptInsert = typeof contractCommands.$inferInsert;
type ReceiptKind = 'APPROVE' | 'REJECT' | 'RECORD_SIGNATURE';
type ResultStamp = { id: string; occurredAt: Date };
type ContractCommandReceipt =
  | {
      kind: 'recorded';
      confirm<Result extends { id: string }>(recorded: Result | null): Result;
    }
  | { kind: 'fresh'; append(result: ResultStamp): Promise<void> };

/** Private receipt mechanics; the caller owns the active transaction and domain workflow. */
export async function openContractCommandReceipt(input: {
  database: DatabaseContext;
  actor: Pick<ActorContext, 'workspaceId' | 'workspaceMembershipId'>;
  companyId: string;
  key: string;
  opportunityId: string;
  contractId: string;
  kind: ReceiptKind;
  fingerprint: string;
}): Promise<ContractCommandReceipt> {
  const { database, actor } = input;
  // Untouched Contract writers use this exact colon namespace and seed.
  // The generic command lock hashes JSON and cannot substitute for it.
  await database.connection.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.workspaceId}:${input.companyId}:${actor.workspaceMembershipId}:${input.key}`},0))`,
  );
  const [receipt] = await database.connection
    .select()
    .from(contractCommands)
    .where(
      and(
        eq(contractCommands.workspaceId, actor.workspaceId),
        eq(contractCommands.companyId, input.companyId),
        eq(
          contractCommands.actorWorkspaceMembershipId,
          actor.workspaceMembershipId,
        ),
        eq(contractCommands.idempotencyKey, input.key),
      ),
    );
  if (receipt) {
    const result = recordedResult(input.kind, receipt);
    if (
      receipt.kind !== input.kind ||
      receipt.fingerprint !== input.fingerprint ||
      receipt.resultContractId !== input.contractId ||
      !result.id
    )
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency-Key was used for another Contract command.',
      });
    return {
      kind: 'recorded',
      confirm(recorded) {
        if (!recorded || recorded.id !== result.id)
          throw new Error(result.missingMessage);
        return recorded;
      },
    };
  }
  return {
    kind: 'fresh',
    async append(result) {
      await database.connection.insert(contractCommands).values({
        workspaceId: actor.workspaceId,
        companyId: input.companyId,
        actorWorkspaceMembershipId: actor.workspaceMembershipId,
        idempotencyKey: input.key,
        fingerprint: input.fingerprint,
        opportunityId: input.opportunityId,
        resultContractId: input.contractId,
        kind: input.kind,
        ...resultFields(input.kind, result.id),
        createdAt: result.occurredAt,
      });
    },
  };
}

function recordedResult(kind: ReceiptKind, receipt: ReceiptRow) {
  switch (kind) {
    case 'APPROVE':
    case 'REJECT':
      return {
        id: receipt.resultDecisionId,
        missingMessage: 'Missing recorded Contract decision.',
      };
    case 'RECORD_SIGNATURE':
      return {
        id: receipt.resultSignatureId,
        missingMessage: 'Missing recorded Contract signature.',
      };
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function resultFields(
  kind: ReceiptKind,
  id: string,
):
  | Pick<ReceiptInsert, 'resultDecisionId'>
  | Pick<ReceiptInsert, 'resultSignatureId'> {
  switch (kind) {
    case 'APPROVE':
    case 'REJECT':
      return { resultDecisionId: id };
    case 'RECORD_SIGNATURE':
      return { resultSignatureId: id };
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}
