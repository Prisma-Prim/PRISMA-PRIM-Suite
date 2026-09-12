import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientUnionOperationCompanies,
  clientUnionOperationProjections,
} from '../database/schema/index.js';
import type {
  ClientUnionAction,
  RedactedClientUnionOperationProjection,
} from '../client/client-union.types.js';

export interface RecordClientUnionProjectionsCommand {
  workspaceId: string;
  unionOperationId: string;
  companyIds: readonly string[];
  action: ClientUnionAction;
}

/**
 * Owns the Company-scoped projection boundary of a governed Client union. The
 * internal operation identifier never crosses this boundary into a redacted
 * read, and each Company receives its own unpredictable public reference.
 */
@Injectable()
export class ClientUnionAccountabilityService {
  constructor(private readonly databaseContext: DatabaseContext) {}

  async recordProjections(
    command: RecordClientUnionProjectionsCommand,
  ): Promise<void> {
    for (const companyId of [...command.companyIds].toSorted()) {
      // The Company-local position is generated per Company scope rather than
      // derived from the internal action time, so it cannot be used to order
      // or correlate operations across Company scopes.
      await this.lockCompanyProjectionSequence(command.workspaceId, companyId);
      const [current] = await this.databaseContext.connection
        .select({
          position: sql<number>`coalesce(max(${clientUnionOperationProjections.companyLocalPosition}), 0)`,
        })
        .from(clientUnionOperationProjections)
        .where(
          and(
            eq(
              clientUnionOperationProjections.workspaceId,
              command.workspaceId,
            ),
            eq(clientUnionOperationProjections.companyId, companyId),
          ),
        );
      await this.databaseContext.connection
        .insert(clientUnionOperationProjections)
        .values({
          workspaceId: command.workspaceId,
          unionOperationId: command.unionOperationId,
          companyId,
          action: command.action,
          companyLocalPosition: Number(current?.position ?? 0) + 1,
        });
    }
  }

  /** The redacted Company-scoped representation, safe for an Activity Log reader. */
  async listRedactedProjectionsForCompany(
    workspaceId: string,
    companyId: string,
  ): Promise<RedactedClientUnionOperationProjection[]> {
    const rows = await this.databaseContext.connection
      .select({
        projectionReference: clientUnionOperationProjections.publicReference,
        action: clientUnionOperationProjections.action,
        companyLocalPosition:
          clientUnionOperationProjections.companyLocalPosition,
      })
      .from(clientUnionOperationProjections)
      .where(
        and(
          eq(clientUnionOperationProjections.workspaceId, workspaceId),
          eq(clientUnionOperationProjections.companyId, companyId),
        ),
      )
      .orderBy(asc(clientUnionOperationProjections.companyLocalPosition));
    return rows.map((row) => ({
      targetType: 'client_union_operation',
      action: row.action,
      projectionReference: row.projectionReference,
      companyId,
      actor: 'authorized-resolver',
      companyLocalPosition: row.companyLocalPosition,
    }));
  }

  /** The affected Companies captured by one operation, for re-authorization. */
  async capturedCompanyIds(
    workspaceId: string,
    unionOperationIds: readonly string[],
  ): Promise<ReadonlyMap<string, string[]>> {
    if (unionOperationIds.length === 0) return new Map();
    const rows = await this.databaseContext.connection
      .select({
        unionOperationId: clientUnionOperationCompanies.unionOperationId,
        companyId: clientUnionOperationCompanies.companyId,
      })
      .from(clientUnionOperationCompanies)
      .where(
        and(
          eq(clientUnionOperationCompanies.workspaceId, workspaceId),
          inArray(clientUnionOperationCompanies.unionOperationId, [
            ...unionOperationIds,
          ]),
        ),
      );
    const captured = new Map<string, string[]>();
    for (const row of rows) {
      const companyIds = captured.get(row.unionOperationId) ?? [];
      companyIds.push(row.companyId);
      captured.set(row.unionOperationId, companyIds);
    }
    return captured;
  }

  private async lockCompanyProjectionSequence(
    workspaceId: string,
    companyId: string,
  ): Promise<void> {
    const lockKey = JSON.stringify([
      'client_union_projection',
      workspaceId,
      companyId,
    ]);
    await this.databaseContext.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
  }
}
