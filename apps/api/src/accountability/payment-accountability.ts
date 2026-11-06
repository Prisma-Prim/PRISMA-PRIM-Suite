import { Injectable } from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import { paymentEvents } from '../database/schema/payment.js';
interface PaymentEvent {
  actor: ActorContext;
  companyId: string;
  paymentId: string;
  revision: number;
  commandId: string;
  recordedAt: Date;
  action:
    | 'payment.observation.recorded'
    | 'payment.draft.corrected'
    | 'payment.draft.withdrawn'
    | 'payment.confirmed'
    | 'payment.reversed';
}
/** Restricted caller-transaction participant, deliberately outside generic Activity/Home. */
@Injectable()
export class PaymentAccountability {
  constructor(private readonly database: DatabaseContext) {}
  async record(input: PaymentEvent): Promise<void> {
    const [event] = await this.database.connection
      .insert(paymentEvents)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        paymentId: input.paymentId,
        revision: input.revision,
        commandId: input.commandId,
        actorMembershipId: input.actor.workspaceMembershipId,
        actorInternalUserId: input.actor.internalUserId,
        occurredAt: input.recordedAt,
        action: input.action,
        metadata: { revision: input.revision },
      })
      .returning({ commandId: paymentEvents.commandId });
    if (!event)
      throw new Error('The restricted Payment event was not recorded.');
  }
}
