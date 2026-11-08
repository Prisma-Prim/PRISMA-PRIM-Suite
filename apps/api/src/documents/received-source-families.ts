import type { ExternalInvoiceRelationsService } from './external-invoice-relations.service.js';
import type { readExternalInvoiceRegistration } from './external-invoice.js';
import type { PaymentEvidenceSourcesService } from './payment-evidence-sources.service.js';
import type { readPaymentEvidenceRegistration } from './payment-evidence.js';
import type { ReceivedAddendumRelationsService } from './received-addendum-relations.service.js';
import type { readReceivedAddendumRegistration } from './received-addendum.js';
import type { ReceivedContractRelationsService } from './received-contract-relations.service.js';
import type { readReceivedContractRegistration } from './received-contract.js';
import {
  ReceivedSourceRegistration,
  type ReceivedSourceAdapter,
} from './received-source-registration.js';

/** Each preserved received source family's parsed registration command. */
export interface ReceivedSourceCommands {
  'received-contract': ReturnType<typeof readReceivedContractRegistration>;
  'received-addendum': ReturnType<typeof readReceivedAddendumRegistration>;
  'external-invoice': ReturnType<typeof readExternalInvoiceRegistration>;
  'payment-evidence': ReturnType<typeof readPaymentEvidenceRegistration>;
}

export type ReceivedSourceType = keyof ReceivedSourceCommands;

interface ReceivedSourceReferences {
  'received-contract': Awaited<
    ReturnType<ReceivedContractRelationsService['qualify']>
  >;
  'received-addendum': Awaited<
    ReturnType<ReceivedAddendumRelationsService['qualify']>
  >;
  'external-invoice': Awaited<
    ReturnType<ExternalInvoiceRelationsService['qualify']>
  >;
  'payment-evidence': Awaited<
    ReturnType<PaymentEvidenceSourcesService['qualify']>
  >;
}

const RECEIVED_SOURCE_TYPES = {
  'received-contract': true,
  'received-addendum': true,
  'external-invoice': true,
  'payment-evidence': true,
} as const satisfies Record<ReceivedSourceType, true>;

/** Whether a registration command belongs to a preserved received source family. */
export function isReceivedSourceCommand<Command extends { type: string }>(
  command: Command,
): command is Extract<Command, { type: ReceivedSourceType }> {
  return Object.hasOwn(RECEIVED_SOURCE_TYPES, command.type);
}

/** The registration module wired with every family's adapter. */
export function receivedSourceRegistration(adapters: {
  [Type in ReceivedSourceType]: ReceivedSourceAdapter<
    ReceivedSourceCommands[Type],
    ReceivedSourceReferences[Type]
  >;
}) {
  return new ReceivedSourceRegistration<
    ReceivedSourceCommands,
    ReceivedSourceReferences
  >(adapters);
}
