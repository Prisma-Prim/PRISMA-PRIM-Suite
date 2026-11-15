import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import {
  useScopedOperation,
  useScopedOperationGroup,
} from '../api/use-scoped-operation';
import { useWorkspaceRequestScope } from './use-workspace-request-scope';
import { useInterfaceLocale } from '../localization/interface-locale';
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
type FieldValidationError = 'required' | 'invalid' | null;
type ValidationErrors = {
  email: FieldValidationError;
  expiry: FieldValidationError;
};

const noValidationErrors = {
  email: null,
  expiry: null,
} satisfies ValidationErrors;

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
  const [state, setState] = useState<PageState>({ status: 'loading' });
  const [email, setEmail] = useState('');
  const [days, setDays] = useState('7');
  const [validationErrors, setValidationErrors] =
    useState<ValidationErrors>(noValidationErrors);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const retry = useRef<Command | undefined>(undefined);
  const { allowed, scope, captureRecovery } = useWorkspaceRequestScope({
    actor,
    identity,
    permission: 'member.invite',
  });
  const listing = useScopedOperation(scope);
  const commands = useScopedOperationGroup(scope);
  const emailInput = useRef<HTMLInputElement>(null);
  const expiryInput = useRef<HTMLInputElement>(null);
  const callbacks = useRef({ onActivityRecorded, onWorkspaceAccessRejected });
  useLayoutEffect(() => {
    callbacks.current = { onActivityRecorded, onWorkspaceAccessRejected };
  });

  const load = useCallback(
    async (after?: string) => {
      if (!allowed || commands.isPending()) return;
      const signal = listing.begin();
      if (!signal) return;
      const recoveryLive = captureRecovery();
      setState({ status: 'loading' });
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (signal.aborted) return;
        const result = await api.request(
          `/workspace-invitations${after ? `?after=${encodeURIComponent(after)}` : ''}`,
          { signal },
        );
        if (signal.aborted) return;
        if (result.status === 'unauthorized' || result.status === 'forbidden') {
          setState({ status: 'forbidden' });
          retry.current = undefined;
          if (recoveryLive()) {
            if (result.status === 'unauthorized')
              await identity.rejectSession();
            else await callbacks.current.onWorkspaceAccessRejected();
          }
          return;
        }
        if (result.status !== 'ok')
          throw new Error('Invitation listing failed.');
        setState({
          status: 'ready',
          page: invitationPageResponse(result.value),
        });
      } catch {
        if (!signal.aborted) setState({ status: 'error' });
      }
    },
    [identity, allowed, commands, listing, captureRecovery],
  );

  useEffect(() => {
    retry.current = undefined;
    setEmail('');
    setValidationErrors(noValidationErrors);
    setReviewing(null);
    setFailed(false);
    setBusy(false);
    if (allowed) void load();
    return () => {
      listing.retire();
      commands.retire();
    };
  }, [scope, allowed, load, listing, commands]);

  async function submit(path: string, body: object) {
    if (!allowed || busy || state.status !== 'ready' || commands.isPending())
      return;
    const operation = commands.begin();
    if (!operation) return;
    const current = () => commands.isLive() && !operation.signal.aborted;
    const recoveryLive = captureRecovery();
    const serialized = JSON.stringify(body);
    const command =
      retry.current?.path === path && retry.current.body === serialized
        ? retry.current
        : { path, body: serialized, key: crypto.randomUUID() };
    retry.current = command;
    listing.retire();
    setBusy(true);
    setFailed(false);
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!current()) return;
      const result = await api.request(`/workspace-invitations${path}`, {
        method: 'POST',
        body: command.body,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': command.key,
        },
        signal: operation.signal,
      });
      if (!current()) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        setState({ status: 'forbidden' });
        retry.current = undefined;
        if (recoveryLive()) {
          if (result.status === 'unauthorized') await identity.rejectSession();
          else await callbacks.current.onWorkspaceAccessRejected();
        }
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
      if (current()) setFailed(true);
    } finally {
      if (current()) setBusy(false);
      operation.release();
    }
  }

  if (!allowed) return null;
  return (
    <section
      className="production-content-surface workspace-invitations workspace-invitations--prisme"
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
            className="workspace-invitation-primary-action"
            onClick={() => void load()}
          >
            {copy.reload}
          </button>
        </>
      )}
      {state.status === 'ready' && (
        <>
          <form
            className="workspace-invitations-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const emailElement = emailInput.current;
              const expiryElement = expiryInput.current;
              if (!emailElement || !expiryElement) return;
              const errors = {
                email: emailElement.validity.valueMissing
                  ? 'required'
                  : emailElement.validity.valid
                    ? null
                    : 'invalid',
                expiry: expiryElement.validity.valueMissing
                  ? 'required'
                  : expiryElement.validity.valid
                    ? null
                    : 'invalid',
              } satisfies ValidationErrors;
              setValidationErrors(errors);
              if (errors.email !== null) {
                emailElement.focus();
                return;
              }
              if (errors.expiry !== null) {
                expiryElement.focus();
                return;
              }
              void submit('', { email, expiresInDays: Number(days) });
            }}
          >
            <label htmlFor="invitation-email">{copy.email}</label>
            <input
              ref={emailInput}
              id="invitation-email"
              type="email"
              required
              maxLength={254}
              disabled={busy}
              value={email}
              aria-invalid={validationErrors.email !== null}
              aria-describedby={
                validationErrors.email === null
                  ? undefined
                  : 'invitation-email-error'
              }
              onChange={(event) => {
                setEmail(event.target.value);
                setValidationErrors((current) => ({
                  ...current,
                  email: null,
                }));
                retry.current = undefined;
              }}
            />
            {validationErrors.email !== null && (
              <p
                id="invitation-email-error"
                className="workspace-invitation-validation-error"
                role="alert"
              >
                {validationErrors.email === 'required'
                  ? copy.emailRequired
                  : copy.emailInvalid}
              </p>
            )}
            <label htmlFor="invitation-days">{copy.expiry}</label>
            <input
              ref={expiryInput}
              id="invitation-days"
              type="number"
              min={1}
              max={30}
              step={1}
              required
              disabled={busy}
              value={days}
              aria-valuetext={
                days === '' ? undefined : formatNumber(Number(days))
              }
              aria-invalid={validationErrors.expiry !== null}
              aria-describedby={
                validationErrors.expiry === null
                  ? undefined
                  : 'invitation-days-error'
              }
              onChange={(event) => {
                setDays(event.target.value);
                setValidationErrors((current) => ({
                  ...current,
                  expiry: null,
                }));
                retry.current = undefined;
              }}
            />
            {validationErrors.expiry !== null && (
              <p
                id="invitation-days-error"
                className="workspace-invitation-validation-error"
                role="alert"
              >
                {validationErrors.expiry === 'required'
                  ? copy.expiryRequired
                  : copy.expiryInvalid}
              </p>
            )}
            <button
              type="submit"
              className="workspace-invitation-primary-action"
              disabled={busy}
            >
              {copy.send}
            </button>
          </form>
          {failed && <p role="alert">{copy.error}</p>}
          {state.page.invitations.length === 0 && <p>{copy.empty}</p>}
          <ul className="workspace-invitation-list">
            {state.page.invitations.map((invitation) => (
              <li key={invitation.id} data-status={invitation.status}>
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
                  className="workspace-invitation-secondary-action"
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
                      className="workspace-invitation-danger-action"
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
                      className="workspace-invitation-secondary-action"
                      disabled={busy}
                      onClick={() => setReviewing(null)}
                    >
                      {copy.cancel}
                    </button>
                    <button
                      className="workspace-invitation-danger-action"
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
            className="workspace-invitation-secondary-action"
            disabled={busy}
            onClick={() => void load()}
          >
            {copy.first}
          </button>
          {state.page.nextCursor && (
            <button
              className="workspace-invitation-secondary-action"
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
