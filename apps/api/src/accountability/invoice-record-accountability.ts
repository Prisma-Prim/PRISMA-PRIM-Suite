import { Injectable } from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import { invoiceRecordEvents } from '../database/schema/invoice-record.js';
interface InvoiceRecordEvent {
  actor: ActorContext;
  companyId: string;
  recordId: string;
  revision: number;
  commandId: string;
  recordedAt: Date;
  action:
    | 'invoice_record.created'
    | 'invoice_record.transcription.corrected'
    | 'invoice_record.entry.withdrawn';
}
/** Restricted caller-transaction participant, deliberately outside generic Activity/Home. */
@Injectable()
export class InvoiceRecordAccountability {
  constructor(private readonly database: DatabaseContext) {}
  async record(input: InvoiceRecordEvent): Promise<void> {
    const [event] = await this.database.connection
      .insert(invoiceRecordEvents)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        recordId: input.recordId,
        revision: input.revision,
        commandId: input.commandId,
        actorMembershipId: input.actor.workspaceMembershipId,
        actorInternalUserId: input.actor.internalUserId,
        occurredAt: input.recordedAt,
        action: input.action,
        metadata: { revision: input.revision },
      })
      .returning({ commandId: invoiceRecordEvents.commandId });
    if (!event)
      throw new Error('The restricted Invoice Record event was not recorded.');
  }
}
