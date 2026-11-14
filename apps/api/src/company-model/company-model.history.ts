import { BadRequestException } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';
import type { DatabaseContext } from '../database/database-context.js';
import type {
  CompanyModelContent,
  CompanyModelIdentity,
  CompanyModelKind,
  ModelRow,
} from './company-model.kind.js';
import { attribution, versionSummary } from './company-model.view.js';

/** Called only after the model owner establishes live authority and a root lock. */
export async function readCompanyModelHistory<
  Content extends CompanyModelContent,
  Identity extends CompanyModelIdentity,
  Selection extends string,
>({
  kind,
  database,
  model,
  query,
}: {
  kind: CompanyModelKind<Content, Identity, Selection>;
  database: DatabaseContext;
  model: ModelRow | undefined;
  query: unknown;
}) {
  const { exactRecord, modelInteger } = kind.fields;
  const invalidCursor = () => invalidHistoryPage(kind);
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
  const { versions, decisions } = kind.tables;
  const scope = and(
    eq(versions.workspaceId, model.workspaceId),
    eq(versions.companyId, model.companyId),
    eq(versions.modelId, model.id),
  );
  if (before !== undefined) {
    const [known] = await database.connection
      .select({ id: versions.id })
      .from(versions)
      .where(and(scope, eq(versions.versionNumber, before)))
      .limit(1);
    if (!known) throw invalidCursor();
  }
  const rows = await database.connection
    .select({ version: versions, decision: decisions })
    .from(versions)
    .leftJoin(
      decisions,
      and(
        eq(decisions.workspaceId, versions.workspaceId),
        eq(decisions.companyId, versions.companyId),
        eq(decisions.modelId, versions.modelId),
        eq(decisions.versionId, versions.id),
      ),
    )
    .where(
      and(
        scope,
        before === undefined ? undefined : lt(versions.versionNumber, before),
      ),
    )
    .orderBy(desc(versions.versionNumber))
    .limit(limit + 1);
  const selected = rows.slice(0, limit);
  const last = selected.at(-1);
  return {
    versions: selected.map(({ version, decision }) => ({
      ...versionSummary(kind, version),
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

function invalidHistoryPage(kind: {
  readonly noun: string;
  readonly codePrefix: string;
}): never {
  throw new BadRequestException({
    code: `${kind.codePrefix}_CURSOR_INVALID`,
    message: `The ${kind.noun} model history page is invalid.`,
  });
}
