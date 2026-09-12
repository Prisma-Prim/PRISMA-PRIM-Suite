import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  clientAccounts,
  clientUnionOperationSnapshots,
  clientUnionOperations,
} from '../database/schema/index.js';

/**
 * Excludes the superseded participant of an unreversed union. Such a dossier
 * leaves ordinary active lists and search while staying readable through its
 * authorized "united with" history.
 */
export function notSupersededByOpenUnion() {
  return sql<boolean>`NOT EXISTS (
    SELECT 1 FROM ${clientUnionOperations}
    WHERE ${clientUnionOperations.workspaceId} = ${clientAccounts.workspaceId}
      AND ${clientUnionOperations.supersededClientAccountId} = ${clientAccounts.id}
      AND ${clientUnionOperations.status} = 'confirmed'
  )`;
}

/** The canonical Client an unreversed union still reserves this identifier to. */
export async function reservedIdentifierTargets(
  connection: NodePgDatabase,
  workspaceId: string,
  normalizedIdentifier: string,
): Promise<string[]> {
  const rows = await connection
    .select({
      canonicalClientAccountId: clientUnionOperations.canonicalClientAccountId,
    })
    .from(clientUnionOperations)
    .innerJoin(
      clientUnionOperationSnapshots,
      and(
        eq(
          clientUnionOperationSnapshots.workspaceId,
          clientUnionOperations.workspaceId,
        ),
        eq(
          clientUnionOperationSnapshots.unionOperationId,
          clientUnionOperations.id,
        ),
      ),
    )
    .where(
      and(
        eq(clientUnionOperations.workspaceId, workspaceId),
        eq(clientUnionOperations.status, 'confirmed'),
        eq(clientUnionOperationSnapshots.taxId, normalizedIdentifier),
      ),
    );
  return [...new Set(rows.map((row) => row.canonicalClientAccountId))];
}
