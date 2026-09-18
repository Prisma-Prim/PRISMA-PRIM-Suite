import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import {
  saveAcceptanceIntent,
  type AcceptanceIntent,
} from './invitation-acceptance-intent';
import { invitationAcceptanceCopy as copy } from './invitation-acceptance.copy';
import { isUuid, selectWorkspace } from './workspace-selection';

export function WorkspaceInvitationAcceptance({
  identity,
  intent,
}: {
  identity: BrowserIdentity;
  intent: AcceptanceIntent;
}) {
  const [state, setState] = useState<
    'ready' | 'loading' | 'error' | 'denied' | 'unauthorized'
  >(intent.attempted ? 'error' : 'ready');
  const request = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  async function accept() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timer = window.setTimeout(() => {
      controller.abort();
      request.current = undefined;
      if (mounted.current) setState('error');
    }, 35_000);
    setState('loading');
    try {
      saveAcceptanceIntent({ ...intent, attempted: true });
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>('/access/invitations/accept', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': intent.key,
        },
        body: JSON.stringify({
          invitationId: intent.invitationId,
          ...(intent.ticket ? { ticket: intent.ticket } : {}),
        }),
      });
      if (controller.signal.aborted) return;
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
      const context = await api.request<unknown>('/access/current-actor', {
        signal: controller.signal,
        headers: { 'x-workspace-context-id': receipt.workspaceId },
      });
      if (controller.signal.aborted) return;
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
      selectWorkspace(receipt.workspaceId);
      saveAcceptanceIntent({
        invitationId: intent.invitationId,
        key: intent.key,
        attempted: true,
      });
      window.location.replace('/');
    } catch {
      if (mounted.current && request.current === controller) setState('error');
    } finally {
      clearTimeout(timer);
      if (request.current === controller) request.current = undefined;
    }
  }

  if (!identity.loaded)
    return (
      <main className="production-access-state">
        <p role="status">{copy.checking}</p>
      </main>
    );
  if (!identity.signedIn || state === 'unauthorized')
    return <>{identity.signedOutView}</>;
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
