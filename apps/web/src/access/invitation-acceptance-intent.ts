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
    const continuation = new URLSearchParams(url.hash.slice(1)).get(
      'invitation-intent',
    );
    if (continuation !== null && continuation.length > 100_000)
      return undefined;
    const incomingIntent: unknown =
      continuation === null ? undefined : JSON.parse(continuation);
    if (
      continuation !== null &&
      (!valid(incomingIntent) || incomingIntent.invitationId !== invitationId)
    )
      return undefined;
    const historyIntent: unknown = incomingIntent ?? window.history.state;
    const candidate =
      valid(historyIntent) && historyIntent.invitationId === invitationId
        ? historyIntent
        : readStoredIntent(invitationId);
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
    }
    if (continuation !== null) url.hash = '';
    window.history.replaceState(
      intent,
      '',
      url.pathname + url.search + url.hash,
    );
    return intent;
  } catch {
    return undefined;
  }
}
export function acceptanceContinuationUrl(
  intent: AcceptanceIntent,
  mode?: 'signin' | 'signup',
): string {
  const query = new URLSearchParams({ invitation: intent.invitationId });
  if (mode) query.set('mode', mode);
  if (mode === 'signup' && intent.ticket) {
    query.set('__clerk_status', 'sign_up');
    query.set('__clerk_ticket', intent.ticket);
  }
  // A fragment survives full authentication navigation without sending the
  // ticket/key in the application's HTTP request or Referer. Capture removes
  // it before Clerk mounts; it remains untrusted input to server admission.
  const fragment = new URLSearchParams({
    'invitation-intent': JSON.stringify(intent),
  });
  return '/accept-invitation?' + query.toString() + '#' + fragment.toString();
}
export function saveAcceptanceIntent(intent: AcceptanceIntent) {
  try {
    // The current history entry preserves the exact retry across reloads even
    // when sessionStorage becomes unavailable. Neither cache proves admission.
    window.history.replaceState(intent, '');
  } catch {
    // The mounted recipient journey still retains its captured intent.
  }
  try {
    sessionStorage.setItem(
      prefix + intent.invitationId,
      JSON.stringify(intent),
    );
  } catch {
    // Keep using the captured intent when optional browser storage fails.
  }
}
function readStoredIntent(invitationId: string): unknown {
  try {
    const stored = sessionStorage.getItem(prefix + invitationId);
    return stored ? JSON.parse(stored) : undefined;
  } catch {
    return undefined;
  }
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
