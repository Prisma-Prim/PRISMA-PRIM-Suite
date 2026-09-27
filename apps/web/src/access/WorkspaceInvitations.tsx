import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { useInterfaceLocale } from '../localization/interface-locale';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import {
  invitationPageResponse,
  invitationResponse,
  type InvitationPage,
} from './workspace-invitation-response';
import { useWorkspaceInvitationsCopy } from './workspace-invitations.copy';
import './workspace-invitations.css';

type PageState =
  | { status: 'loading' | 'error' | 'forbidden' }
  | { status: 'ready'; page: InvitationPage };
type Command = { path: string; body: string; key: string };

export function WorkspaceInvitations({
  actor,
  identity,
  onActivityRecorded,
  onWorkspaceAccessRejected,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onActivityRecorded: () => void | Promise<void>;
  onWorkspaceAccessRejected: () => void | Promise<void>;
}) {
  const copy = useWorkspaceInvitationsCopy();
  const { formatDateTime, formatNumber } = useInterfaceLocale();
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const [state, setState] = useState<PageState>({ status: 'loading' });
  const [email, setEmail] = useState('');
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const retry = useRef<Command | undefined>(undefined);
  const request = useRef<AbortController | undefined>(undefined);
  const callbacks = useRef({ onActivityRecorded, onWorkspaceAccessRejected });
  callbacks.current = { onActivityRecorded, onWorkspaceAccessRejected };

  async function reject(status: 'unauthorized' | 'forbidden') {
    setState({ status: 'forbidden' });
    retry.current = undefined;
    if (status === 'unauthorized') await identity.rejectSession();
    else await callbacks.current.onWorkspaceAccessRejected();
  }

  const load = useCallback(
    async (after?: string) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setState({ status: 'loading' });
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (controller.signal.aborted) return;
        const result = await api.request<unknown>(
          `/workspace-invitations${after ? `?after=${encodeURIComponent(after)}` : ''}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (result.status === 'unauthorized' || result.status === 'forbidden') {
          setState({ status: 'forbidden' });
          retry.current = undefined;
          if (result.status === 'unauthorized') await identity.rejectSession();
          else await callbacks.current.onWorkspaceAccessRejected();
          return;
        }
        if (result.status !== 'ok')
          throw new Error('Invitation listing failed.');
        setState({
          status: 'ready',
          page: invitationPageResponse(result.value),
        });
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error' });
      }
    },
    [identity],
  );

  useEffect(() => {
    retry.current = undefined;
    setEmail('');
    setReviewing(null);
    setFailed(false);
    setBusy(false);
    void load();
    return () => request.current?.abort();
  }, [
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    identity,
    load,
  ]);

  async function submit(path: string, body: object) {
    if (busy || state.status !== 'ready') return;
    const serialized = JSON.stringify(body);
    const command =
      retry.current?.path === path && retry.current.body === serialized
        ? retry.current
        : { path, body: serialized, key: crypto.randomUUID() };
    retry.current = command;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setFailed(false);
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(
        `/workspace-invitations${path}`,
        {
          method: 'POST',
          body: command.body,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.key,
          },
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        await reject(result.status);
        return;
      }
      if (result.status !== 'ok')
        throw new Error('Invitation command unconfirmed.');
      const invitation = invitationResponse(result.value);
      setState((current) =>
        current.status === 'ready'
          ? {
              status: 'ready',
              page: {
                ...current.page,
                invitations: [
                  invitation,
                  ...current.page.invitations.filter(
                    (entry) => entry.id !== invitation.id,
                  ),
                ],
              },
            }
          : current,
      );
      retry.current = undefined;
      setReviewing(null);
      if (path === '') setEmail('');
      await callbacks.current.onActivityRecorded();
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  if (!actor.workspacePermissions.includes('member.invite')) return null;
  return (
    <section
      className={
        isPrisme
          ? 'production-content-surface workspace-invitations workspace-invitations--prisme'
          : 'production-content-surface'
      }
      aria-labelledby="workspace-invitations-title"
    >
      <h2 id="workspace-invitations-title">{copy.title}</h2>
      <p>{copy.description}</p>
      {state.status === 'loading' && <p role="status">{copy.loading}</p>}
      {state.status === 'forbidden' && <p role="alert">{copy.forbidden}</p>}
      {state.status === 'error' && (
        <>
          <p role="alert">{copy.error}</p>
          <button
            className={
              isPrisme ? 'workspace-invitation-primary-action' : undefined
            }
            onClick={() => void load()}
          >
            {copy.reload}
          </button>
        </>
      )}
      {state.status === 'ready' && (
        <>
          <form
            className={isPrisme ? 'workspace-invitations-form' : undefined}
            onSubmit={(event) => {
              event.preventDefault();
              void submit('', { email, expiresInDays: days });
            }}
          >
            <label htmlFor="invitation-email">{copy.email}</label>
            <input
              id="invitation-email"
              type="email"
              required
              maxLength={254}
              disabled={busy}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                retry.current = undefined;
              }}
            />
            <label htmlFor="invitation-days">{copy.expiry}</label>
            <input
              id="invitation-days"
              type="number"
              min={1}
              max={30}
              required
              disabled={busy}
              value={days}
              aria-valuetext={formatNumber(days)}
              onChange={(event) => {
                setDays(event.target.valueAsNumber);
                retry.current = undefined;
              }}
            />
            <button
              type="submit"
              className={
                isPrisme ? 'workspace-invitation-primary-action' : undefined
              }
              disabled={busy}
            >
              {copy.send}
            </button>
          </form>
          {failed && <p role="alert">{copy.error}</p>}
          {state.page.invitations.length === 0 && <p>{copy.empty}</p>}
          <ul className={isPrisme ? 'workspace-invitation-list' : undefined}>
            {state.page.invitations.map((invitation) => (
              <li
                key={invitation.id}
                data-status={isPrisme ? invitation.status : undefined}
              >
                <strong>{invitation.email}</strong>
                <p>
                  {invitation.consumedAt
                    ? copy.consumed
                    : copy.statuses[invitation.status]}
                </p>
                <p>
                  {copy.expires}:{' '}
                  <time dateTime={invitation.expiresAt}>
                    {formatDateTime(invitation.expiresAt)}
                  </time>
                </p>
                {invitation.revokedAt &&
                  (invitation.deliveryStatus === 'pending' ||
                    invitation.deliveryStatus === 'uncertain') && (
                    <p>{copy.revocationPending}</p>
                  )}
                {invitation.revokedAt &&
                  invitation.deliveryStatus === 'accepted' && (
                    <p role="status">{copy.usedBeforeRevocation}</p>
                  )}
                <p>
                  {copy.checkAfter}: {formatDateTime(invitation.nextCheckAt)}
                </p>
                <button
                  className={
                    isPrisme
                      ? 'workspace-invitation-secondary-action'
                      : undefined
                  }
                  disabled={busy}
                  onClick={() => void submit(`/${invitation.id}/refresh`, {})}
                >
                  {copy.refresh}
                </button>
                {!invitation.revokedAt &&
                  !invitation.consumedAt &&
                  invitation.deliveryStatus !== 'rejected' &&
                  invitation.deliveryStatus !== 'revoked' && (
                    <button
                      className={
                        isPrisme
                          ? 'workspace-invitation-danger-action'
                          : undefined
                      }
                      disabled={busy}
                      onClick={() => setReviewing(invitation.id)}
                    >
                      {copy.revoke}
                    </button>
                  )}
                {reviewing === invitation.id && (
                  <div role="region" aria-label={copy.confirm}>
                    <p>{copy.confirmation}</p>
                    <button
                      className={
                        isPrisme
                          ? 'workspace-invitation-secondary-action'
                          : undefined
                      }
                      disabled={busy}
                      onClick={() => setReviewing(null)}
                    >
                      {copy.cancel}
                    </button>
                    <button
                      className={
                        isPrisme
                          ? 'workspace-invitation-danger-action'
                          : undefined
                      }
                      disabled={busy}
                      onClick={() =>
                        void submit(`/${invitation.id}/revoke`, {})
                      }
                    >
                      {copy.confirm}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <button
            className={
              isPrisme ? 'workspace-invitation-secondary-action' : undefined
            }
            disabled={busy}
            onClick={() => void load()}
          >
            {copy.first}
          </button>
          {state.page.nextCursor && (
            <button
              className={
                isPrisme ? 'workspace-invitation-secondary-action' : undefined
              }
              disabled={busy}
              onClick={() => void load(state.page.nextCursor ?? undefined)}
            >
              {copy.more}
            </button>
          )}
        </>
      )}
    </section>
  );
}
