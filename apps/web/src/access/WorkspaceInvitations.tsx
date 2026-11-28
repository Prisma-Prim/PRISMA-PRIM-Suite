import { useRef } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  useWorkspaceInvitations,
  type InvitationValidationErrors,
} from './use-workspace-invitations';
import { useWorkspaceInvitationsCopy } from './workspace-invitations.copy';
import './workspace-invitations.css';

export function WorkspaceInvitations(
  props: Readonly<{
    actor: ActorContext;
    identity: BrowserIdentity;
    onActivityRecorded: () => void | Promise<void>;
    onWorkspaceAccessRejected: () => void | Promise<void>;
  }>,
) {
  const copy = useWorkspaceInvitationsCopy();
  const { formatDateTime, formatNumber } = useInterfaceLocale();
  const invitations = useWorkspaceInvitations(props);
  const {
    allowed,
    state,
    email,
    days,
    validationErrors,
    busy,
    failed,
    reviewing,
    load,
  } = invitations;
  const emailInput = useRef<HTMLInputElement>(null);
  const expiryInput = useRef<HTMLInputElement>(null);

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
              } satisfies InvitationValidationErrors;
              invitations.setValidationErrors(errors);
              if (errors.email !== null) {
                emailElement.focus();
                return;
              }
              if (errors.expiry !== null) {
                expiryElement.focus();
                return;
              }
              void invitations.invite();
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
              onChange={(event) => invitations.changeEmail(event.target.value)}
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
              onChange={(event) => invitations.changeDays(event.target.value)}
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
                  onClick={() => void invitations.checkStatus(invitation.id)}
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
                      onClick={() =>
                        invitations.reviewRevocation(invitation.id)
                      }
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
                      onClick={() => invitations.reviewRevocation(null)}
                    >
                      {copy.cancel}
                    </button>
                    <button
                      className="workspace-invitation-danger-action"
                      disabled={busy}
                      onClick={() => void invitations.revoke(invitation.id)}
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
