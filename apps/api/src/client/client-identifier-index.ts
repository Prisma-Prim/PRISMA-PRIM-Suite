import { Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientAccounts,
  clientIdentifierReservations,
  clientUnionOperations,
  clientUnionReviews,
  clientUnionReversals,
} from '../database/schema/index.js';

@Injectable()
export class ClientIdentifierIndex {
  constructor(private readonly databaseContext: DatabaseContext) {}

  async lock({
    workspaceId,
    normalizedIdentifier,
  }: {
    workspaceId: string;
    normalizedIdentifier: string;
  }): Promise<void> {
    const key = JSON.stringify([workspaceId, normalizedIdentifier]);
    await this.databaseContext.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
  }

  candidates(workspaceId: string, identifiers: readonly string[]) {
    if (identifiers.length === 0) return Promise.resolve([]);
    const keys = sql`ARRAY[${sql.join(
      [...new Set(identifiers)].map((key) => sql`${key}`),
      sql`, `,
    )}]::text[]`;
    // Every historical source resolves through its current, unreversed union.
    // The reservation survives correction and reversal; it is never released.
    return this.databaseContext.connection
      .select({
        id: clientAccounts.id,
        version: clientAccounts.version,
        taxId: sql<string>`union_identifier.key`,
      })
      .from(clientAccounts)
      .crossJoin(sql`unnest(${keys}) AS union_identifier(key)`)
      .where(
        and(
          eq(clientAccounts.workspaceId, workspaceId),
          eq(clientAccounts.status, 'active'),
          sql`(btrim(${clientAccounts.taxId}) = union_identifier.key OR EXISTS (
          SELECT 1 FROM ${clientIdentifierReservations} AS reservation
          WHERE reservation.workspace_id = ${clientAccounts.workspaceId}
            AND reservation.normalized_identifier = union_identifier.key
            AND COALESCE((
              SELECT operation.canonical_client_id
              FROM ${clientUnionOperations} AS operation
              INNER JOIN ${clientUnionReviews} AS review ON review.workspace_id = operation.workspace_id AND review.reference = operation.review_reference
              WHERE operation.workspace_id = reservation.workspace_id
                AND reservation.source_client_id IN (review.first_client_id, review.second_client_id)
                AND NOT EXISTS (SELECT 1 FROM ${clientUnionReversals} AS reversal WHERE reversal.workspace_id = operation.workspace_id AND reversal.operation_id = operation.id)
              LIMIT 1
            ), reservation.source_client_id) = ${clientAccounts.id}
        ))`,
        ),
      )
      .orderBy(asc(clientAccounts.id));
  }
}
