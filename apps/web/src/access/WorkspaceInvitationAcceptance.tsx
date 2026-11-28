import { App } from '../App';
import { useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { useRequestLifetime } from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import {
  saveAcceptanceIntent,
  type AcceptanceIntent,
} from './invitation-acceptance-intent';
import { useInvitationAcceptanceCopy } from './invitation-acceptance.copy';
import { isUuid, selectWorkspace } from './workspace-selection';
import { useInterfacePreference } from '../clarte/InterfacePreferenceProvider';
import {
  ClarteInvitationAcceptance,
  ClarteInvitationIdentityCheck,
} from '../clarte/entry/ClarteInvitation';

type AcceptanceState =
  'ready' | 'loading' | 'error' | 'denied' | 'unauthorized' | 'accepted';

export function WorkspaceInvitationAcceptance({
  identity,
  intent,
}: {
  identity: BrowserIdentity;
  intent: AcceptanceIntent;
}) {
  const copy = useInvitationAcceptanceCopy();
  const { preference } = useInterfacePreference();
  const lifetime = useRequestLifetime(
    identity,
    JSON.stringify([
      identity.loaded,
      identity.signedIn,
      intent.invitationId,
      intent.key,
      intent.ticket ?? null,
    ]),
  );
  const requests = useScopedOperationGroup(String(lifetime));
  const [attempt, setAttempt] = useState<{
    lifetime: number;
    status: AcceptanceState;
  }>({ lifetime, status: intent.attempted ? 'error' : 'ready' });
  const state =
    attempt.lifetime === lifetime
      ? attempt.status
      : intent.attempted
        ? 'error'
        : 'ready';
  function setState(status: AcceptanceState) {
    setAttempt({ lifetime, status });
  }

  async function accept() {
    if (!identity.loaded || !identity.signedIn || requests.isPending()) return;
    const operation = requests.begin();
    if (!operation) return;
    const current = () => requests.isLive() && !operation.signal.aborted;
    const timer = window.setTimeout(() => {
      if (!current()) return;
      setState('error');
      operation.retire();
    }, 35_000);
    setState('loading');
    try {
      saveAcceptanceIntent({ ...intent, attempted: true });
      const api = await createAuthenticatedApiClient(identity);
      if (!current()) return;
      const result = await api.request('/access/invitations/accept', {
        method: 'POST',
        signal: operation.signal,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': intent.key,
        },
        body: JSON.stringify({
          invitationId: intent.invitationId,
          ...(intent.ticket ? { ticket: intent.ticket } : {}),
        }),
      });
      if (!current()) return;
      if (result.status === 'unauthorized') {
        setState('unauthorized');
        await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'validation') {
        setState('denied');
        return;
      }
      if (result.status !== 'ok') throw new Error('Acceptance unconfirmed.');
      const receipt = acceptanceResult(result.value, intent.invitationId);
      const context = await api.request('/access/current-actor', {
        signal: operation.signal,
        headers: { 'x-workspace-context-id': receipt.workspaceId },
      });
      if (!current()) return;
      if (context.status === 'unauthorized') {
        setState('unauthorized');
        await identity.rejectSession();
        return;
      }
      if (context.status === 'forbidden') {
        setState('denied');
        return;
      }
      if (context.status !== 'ok' || !sameActiveContext(context.value, receipt))
        throw new Error('Current access unconfirmed.');
      saveAcceptanceIntent({
        invitationId: intent.invitationId,
        key: intent.key,
        attempted: true,
      });
      selectWorkspace(receipt.workspaceId);
      window.history.replaceState(
        { workspaceSelection: receipt.workspaceId },
        '',
        '/',
      );
      setState('accepted');
    } catch {
      if (current()) setState('error');
    } finally {
      clearTimeout(timer);
      operation.release();
    }
  }

  if (!identity.loaded)
    return preference === 'clarte' ? (
      <ClarteInvitationIdentityCheck />
    ) : (
      <main className="production-access-state">
        <p role="status">{copy.checking}</p>
      </main>
    );
  if (!identity.signedIn || state === 'unauthorized')
    return <>{identity.signedOutView}</>;
  if (state === 'accepted') return <App identity={identity} />;
  if (preference === 'clarte')
    return (
      <ClarteInvitationAcceptance
        step={state}
        onAccept={() => void accept()}
        onUseAnotherAccount={() => void identity.signOut()}
      />
    );
  return (
    <main className="production-access-state">
      <section className="production-content-surface invitation-entry">
        <p className="eyebrow">PRISMA-PRIM Suite</p>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
        {state === 'loading' && <p role="status">{copy.loading}</p>}
        {state === 'error' && <p role="alert">{copy.error}</p>}
        {state === 'denied' ? (
          <p role="alert">{copy.denied}</p>
        ) : (
          <button
            type="button"
            disabled={state === 'loading'}
            onClick={() => void accept()}
          >
            {state === 'error' ? copy.retry : copy.accept}
          </button>
        )}
        <button
          type="button"
          disabled={state === 'loading'}
          onClick={() => void identity.signOut()}
        >
          {copy.signOut}
        </button>
      </section>
    </main>
  );
}

function acceptanceResult(value: unknown, invitationId: string) {
  if (
    !record(value) ||
    value.invitationId !== invitationId ||
    !isUuid(value.workspaceId) ||
    !isUuid(value.internalUserId) ||
    !isUuid(value.workspaceMembershipId) ||
    typeof value.acceptedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.acceptedAt))
  )
    throw new Error('Invalid acceptance response.');
  return {
    workspaceId: value.workspaceId,
    internalUserId: value.internalUserId,
    workspaceMembershipId: value.workspaceMembershipId,
  };
}
function sameActiveContext(
  value: unknown,
  receipt: ReturnType<typeof acceptanceResult>,
) {
  return (
    record(value) &&
    value.active === true &&
    value.workspaceId === receipt.workspaceId &&
    value.internalUserId === receipt.internalUserId &&
    value.workspaceMembershipId === receipt.workspaceMembershipId
  );
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
