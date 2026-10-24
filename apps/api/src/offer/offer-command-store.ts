import { and, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import type { DatabaseContext } from '../database/database-context.js';
import {
  offerCommands,
  offerReferenceCounters,
} from '../database/schema/index.js';

/** One existing actor/Company receipt namespace and reference allocator. */
export class OfferCommandStore {
  constructor(private readonly database: DatabaseContext) {}

  async lock({
    actor,
    companyId,
    idempotencyKey,
  }: {
    actor: ActorContext;
    companyId: string;
    idempotencyKey: string;
  }): Promise<void> {
    await this.database.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(
        ${`${actor.workspaceId}:${companyId}:${actor.workspaceMembershipId}:${idempotencyKey}`}, 0))`,
    );
  }

  async find({
    actor,
    companyId,
    idempotencyKey,
  }: {
    actor: ActorContext;
    companyId: string;
    idempotencyKey: string;
  }) {
    const [receipt] = await this.database.connection
      .select()
      .from(offerCommands)
      .where(
        and(
          eq(offerCommands.workspaceId, actor.workspaceId),
          eq(offerCommands.companyId, companyId),
          eq(
            offerCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(offerCommands.idempotencyKey, idempotencyKey),
        ),
      );
    return receipt;
  }

  async allocateReference({
    workspaceId,
    companyId,
  }: {
    workspaceId: string;
    companyId: string;
  }): Promise<number> {
    const [counter] = await this.database.connection
      .insert(offerReferenceCounters)
      .values({ workspaceId, companyId, currentReference: 1 })
      .onConflictDoUpdate({
        target: [
          offerReferenceCounters.workspaceId,
          offerReferenceCounters.companyId,
        ],
        set: {
          currentReference: sql`${offerReferenceCounters.currentReference} + 1`,
        },
      })
      .returning({ value: offerReferenceCounters.currentReference });
    if (!counter || counter.value < 1)
      throw new Error('The illustrative Offer reference was not allocated.');
    return counter.value;
  }
}
