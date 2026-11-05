import type { ApiResult } from '../api/authenticated-api-client';
import type { ActorContext } from '../access-types';
export type PaymentEvidenceTarget =
  { kind: 'register' } | { kind: 'document'; documentId: string };
export type PaymentEvidenceSelection = PaymentEvidenceTarget & {
  generation: number;
};
export interface PaymentEvidenceAccessCallbacks {
  onCompanyContextRejected?: (companyContextId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
}

export type PaymentEvidencePayerSelection = {
  clientId: string;
  party: { kind: 'PRIMARY' } | { kind: 'ADDITIONAL'; legalEntityId: string };
};
export type PaymentEvidenceRejection = (
  result: ApiResult<unknown>,
  signal: AbortSignal,
  isCurrent: () => boolean,
) => Promise<void>;
