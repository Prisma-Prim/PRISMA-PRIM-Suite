import { isUuid } from './workspace-selection';

export interface AcceptanceIntent {
  invitationId: string;
  key: string;
  attempted: boolean;
  ticket?: string;
}
const prefix = 'prisma-invitation:';

export function captureAcceptanceIntent(): AcceptanceIntent | undefined {
  try {
    const url = new URL(window.location.href);
    const incomingId = url.searchParams.get('invitation');
    if (!isUuid(incomingId)) return undefined;
    const invitationId = incomingId.toLowerCase();
    const stored = sessionStorage.getItem(prefix + invitationId);
    const candidate: unknown = stored ? JSON.parse(stored) : undefined;
    const previous =
      valid(candidate) && candidate.invitationId === invitationId
        ? candidate
        : undefined;
    const incoming = url.searchParams.get('__clerk_ticket');
    const ticket = incoming ?? previous?.ticket;
    if (ticket !== undefined && (ticket.length === 0 || ticket.length > 16_384))
      return undefined;
    const intent = {
      invitationId,
      key: previous?.key ?? crypto.randomUUID(),
      attempted: previous?.attempted ?? false,
      ...(ticket ? { ticket } : {}),
    };
    saveAcceptanceIntent(intent);
    // Existing users authenticate independently. Clerk must not consume their
    // ticket in the browser before the server has persisted its recovery client.
    if (url.searchParams.get('mode') !== 'signup') {
      url.searchParams.delete('__clerk_ticket');
      url.searchParams.delete('__clerk_status');
      window.history.replaceState(
        null,
        '',
        url.pathname + url.search + url.hash,
      );
    }
    return intent;
  } catch {
    return undefined;
  }
}
export function saveAcceptanceIntent(intent: AcceptanceIntent) {
  sessionStorage.setItem(prefix + intent.invitationId, JSON.stringify(intent));
}
function valid(value: unknown): value is AcceptanceIntent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'invitationId' in value &&
    isUuid(value.invitationId) &&
    'key' in value &&
    isUuid(value.key) &&
    'attempted' in value &&
    typeof value.attempted === 'boolean' &&
    (!('ticket' in value) ||
      (typeof value.ticket === 'string' &&
        value.ticket.length > 0 &&
        value.ticket.length <= 16_384))
  );
}
