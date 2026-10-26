import { BadRequestException } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';
import type { DatabaseContext } from '../database/database-context.js';
import {
  contractModelDecisions,
  contractModelVersions,
} from '../database/schema/index.js';
import { exactRecord, modelInteger } from './contract-model.content.js';
import {
  attribution,
  versionSummary,
  type ModelRow,
} from './contract-model.view.js';

/** Called only after the model owner establishes live authority and a root lock. */
export async function readContractModelHistory({
  database,
  model,
  query,
}: {
  database: DatabaseContext;
  model: ModelRow | undefined;
  query: unknown;
}) {
  const input = exactRecord(query, [], ['limit', 'cursor']);
  const limit =
    input.limit === undefined
      ? 20
      : typeof input.limit === 'string' &&
          /^[1-9][0-9]?$/.test(input.limit) &&
          Number(input.limit) <= 50
        ? Number(input.limit)
        : invalidCursor();
  const cursor = input.cursor;
  let before: number | undefined;
  if (cursor !== undefined) {
    if (
      typeof cursor !== 'string' ||
      cursor.length > 1_024 ||
      !/^[A-Za-z0-9_-]+$/.test(cursor) ||
      !model
    )
      throw invalidCursor();
    try {
      const decoded = Buffer.from(cursor, 'base64url');
      if (decoded.toString('base64url') !== cursor) throw invalidCursor();
      const value: unknown = JSON.parse(decoded.toString('utf8'));
      const record = exactRecord(value, [
        'workspaceId',
        'companyId',
        'modelId',
        'before',
      ]);
      if (
        record.workspaceId !== model.workspaceId ||
        record.companyId !== model.companyId ||
        record.modelId !== model.id
      )
        throw invalidCursor();
      before = modelInteger(record.before, 1);
    } catch {
      throw invalidCursor();
    }
  }
  if (!model) return { versions: [], nextCursor: null };
  const scope = and(
    eq(contractModelVersions.workspaceId, model.workspaceId),
    eq(contractModelVersions.companyId, model.companyId),
    eq(contractModelVersions.modelId, model.id),
  );
  if (before !== undefined) {
    const [known] = await database.connection
      .select({ id: contractModelVersions.id })
      .from(contractModelVersions)
      .where(and(scope, eq(contractModelVersions.versionNumber, before)))
      .limit(1);
    if (!known) throw invalidCursor();
  }
  const rows = await database.connection
    .select({
      version: contractModelVersions,
      decision: contractModelDecisions,
    })
    .from(contractModelVersions)
    .leftJoin(
      contractModelDecisions,
      and(
        eq(
          contractModelDecisions.workspaceId,
          contractModelVersions.workspaceId,
        ),
        eq(contractModelDecisions.companyId, contractModelVersions.companyId),
        eq(contractModelDecisions.modelId, contractModelVersions.modelId),
        eq(contractModelDecisions.versionId, contractModelVersions.id),
      ),
    )
    .where(
      and(
        scope,
        before === undefined
          ? undefined
          : lt(contractModelVersions.versionNumber, before),
      ),
    )
    .orderBy(desc(contractModelVersions.versionNumber))
    .limit(limit + 1);
  const selected = rows.slice(0, limit);
  const last = selected.at(-1);
  return {
    versions: selected.map(({ version, decision }) => ({
      ...versionSummary(version),
      predecessorVersionId: version.predecessorVersionId,
      ...attribution(version),
      decision: decision
        ? {
            outcome: decision.outcome,
            recordedAt: decision.recordedAt.toISOString(),
          }
        : null,
    })),
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({
              workspaceId: model.workspaceId,
              companyId: model.companyId,
              modelId: model.id,
              before: last.version.versionNumber,
            }),
          ).toString('base64url')
        : null,
  };
}

function invalidCursor(): never {
  throw new BadRequestException({
    code: 'CONTRACT_MODEL_CURSOR_INVALID',
    message: 'The Contract model history page is invalid.',
  });
}
