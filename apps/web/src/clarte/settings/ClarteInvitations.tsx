import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import type { BrowserIdentity } from '../../access-composition';
import type { ActorContext } from '../../access-types';
import {
  useWorkspaceInvitations,
  type InvitationValidationErrors,
} from '../../access/use-workspace-invitations';
import type {
  InvitationStatus,
  WorkspaceInvitation,
} from '../../access/workspace-invitation-response';
import { useWorkspaceInvitationsCopy } from '../../access/workspace-invitations.copy';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { ClarteBadge, type ClarteTone } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import { ClarteConfirmDialog } from '../components/ClarteConfirmDialog';
import { ClarteField } from '../components/ClarteField';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { useSettingsAccessCopy } from './settings-access.copy';

const statusTones = {
  uncertain: 'warning',
  pending: 'info',
  accepted: 'success',
  revoked: 'neutral',
  expired: 'neutral',
  rejected: 'danger',
} as const satisfies Record<InvitationStatus, ClarteTone>;

/** The server's status says whether a revocation can still be asked for. */
function revocable(invitation: WorkspaceInvitation): boolean {
  return (
    !invitation.revokedAt &&
    !invitation.consumedAt &&
    invitation.deliveryStatus !== 'rejected' &&
    invitation.deliveryStatus !== 'revoked'
  );
}

type InvitationsProps = Readonly<{
  actor: ActorContext;
  identity: BrowserIdentity;
  onActivityRecorded: () => void | Promise<void>;
  onWorkspaceAccessRejected: () => void | Promise<void>;
}>;

/**
 * Invitations in the Settings console (EX-021 to EX-024): invite by e-mail for
 * 1 to 30 days, follow the paged list, check one with the identity provider
 * and revoke one after confirmation, through the existing commands.
 */
export function ClarteInvitations(props: InvitationsProps) {
  const copy = useWorkspaceInvitationsCopy();
  const accessCopy = useSettingsAccessCopy();
  const { formatDateTime } = useInterfaceLocale();
  const invitations = useWorkspaceInvitations(props);
  const { allowed, state, busy, failed, reviewing } = invitations;
  const [inviting, setInviting] = useState(false);
  if (!allowed) return <ClarteErrorState title={copy.forbidden} />;
  if (state.status !== 'ready') {
    if (state.status === 'loading')
      return <ClarteLoadingState label={copy.loading} />;
    if (state.status === 'forbidden')
      return <ClarteErrorState title={copy.forbidden} />;
    return (
      <ClarteErrorState
        title={copy.error}
        action={
          <ClarteButton onClick={() => void invitations.load()}>
            {copy.reload}
          </ClarteButton>
        }
      />
    );
  }
  const page = state.page;
  const reviewed = page.invitations.find(
    (invitation) => invitation.id === reviewing,
  );
  return (
    <>
      <ClarteCard
        title={copy.title}
        actions={
          <ClarteButton
            variant="primary"
            size="small"
            disabled={busy}
            onClick={() => setInviting(true)}
          >
            <Plus aria-hidden="true" />
            {accessCopy.inviteTitle}
          </ClarteButton>
        }
      >
        {failed && !inviting && (
          <p className="clarte-settings-alert" role="alert">
            {copy.error}
          </p>
        )}
        {page.invitations.length === 0 ? (
          <ClarteEmptyState title={copy.empty} />
        ) : (
          <ul className="clarte-list clarte-invitation-list">
            {page.invitations.map((invitation) => (
              <li key={invitation.id} data-status={invitation.status}>
                <div className="clarte-settings-cell-stack">
                  <strong>{invitation.email}</strong>
                  <small>
                    {invitation.consumedAt
                      ? copy.consumed
                      : copy.statuses[invitation.status]}
                  </small>
                  {invitation.revokedAt &&
                    (invitation.deliveryStatus === 'pending' ||
                      invitation.deliveryStatus === 'uncertain') && (
                      <small>{copy.revocationPending}</small>
                    )}
                  {invitation.revokedAt &&
                    invitation.deliveryStatus === 'accepted' && (
                      <small role="status">{copy.usedBeforeRevocation}</small>
                    )}
                </div>
                <div className="clarte-settings-cell-stack">
                  <span>
                    {copy.expires}:{' '}
                    <time dateTime={invitation.expiresAt}>
                      {formatDateTime(invitation.expiresAt)}
                    </time>
                  </span>
                  <small>
                    {copy.checkAfter}: {formatDateTime(invitation.nextCheckAt)}
                  </small>
                </div>
                <span>
                  {invitation.consumedAt ? (
                    <ClarteBadge tone="success">
                      {accessCopy.invitationConsumed}
                    </ClarteBadge>
                  ) : (
                    <ClarteBadge tone={statusTones[invitation.status]}>
                      {accessCopy.invitationStatus(invitation.status)}
                    </ClarteBadge>
                  )}
                </span>
                <div className="clarte-settings-row-actions">
                  <ClarteButton
                    size="small"
                    disabled={busy}
                    onClick={() => void invitations.checkStatus(invitation.id)}
                  >
                    {copy.refresh}
                  </ClarteButton>
                  {revocable(invitation) && (
                    <ClarteButton
                      size="small"
                      variant="danger"
                      disabled={busy}
                      onClick={() =>
                        invitations.reviewRevocation(invitation.id)
                      }
                    >
                      {copy.revoke}
                    </ClarteButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="clarte-settings-actions clarte-settings-paging">
          <ClarteButton
            size="small"
            variant="quiet"
            disabled={busy}
            onClick={() => void invitations.load()}
          >
            {copy.first}
          </ClarteButton>
          {page.nextCursor && (
            <ClarteButton
              size="small"
              disabled={busy}
              onClick={() =>
                void invitations.load(page.nextCursor ?? undefined)
              }
            >
              {copy.more}
            </ClarteButton>
          )}
        </div>
      </ClarteCard>
      {inviting && (
        <InvitationForm
          invitations={invitations}
          onClose={() => setInviting(false)}
        />
      )}
      {reviewed && (
        <ClarteConfirmDialog
          title={copy.revoke}
          description={`${reviewed.email} — ${copy.confirmation}`}
          confirmLabel={copy.confirm}
          cancelLabel={copy.cancel}
          tone="danger"
          busy={busy}
          onCancel={() => invitations.reviewRevocation(null)}
          onConfirm={() => {
            // The row keeps its Revoke action, which repeats an unconfirmed revocation.
            invitations.reviewRevocation(null);
            void invitations.revoke(reviewed.id);
          }}
        />
      )}
    </>
  );
}

function InvitationForm({
  invitations,
  onClose,
}: Readonly<{
  invitations: ReturnType<typeof useWorkspaceInvitations>;
  onClose: () => void;
}>) {
  const copy = useWorkspaceInvitationsCopy();
  const accessCopy = useSettingsAccessCopy();
  const { formatNumber } = useInterfaceLocale();
  const { email, days, validationErrors, busy, failed } = invitations;
  const emailInput = useRef<HTMLInputElement>(null);
  const expiryInput = useRef<HTMLInputElement>(null);
  return (
    <ClarteSidePanel
      title={accessCopy.inviteTitle}
      description={copy.description}
      onClose={onClose}
    >
      <form
        className="clarte-settings-form"
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
          void invitations.invite().then((sent) => {
            if (sent) onClose();
          });
        }}
      >
        <ClarteField
          label={copy.email}
          error={
            validationErrors.email === null
              ? undefined
              : validationErrors.email === 'required'
                ? copy.emailRequired
                : copy.emailInvalid
          }
        >
          {(control) => (
            <input
              {...control}
              ref={emailInput}
              className="clarte-input"
              type="email"
              required
              maxLength={254}
              disabled={busy}
              value={email}
              onChange={(event) => invitations.changeEmail(event.target.value)}
            />
          )}
        </ClarteField>
        <ClarteField
          label={copy.expiry}
          hint={accessCopy.expiryHint}
          error={
            validationErrors.expiry === null
              ? undefined
              : validationErrors.expiry === 'required'
                ? copy.expiryRequired
                : copy.expiryInvalid
          }
        >
          {(control) => (
            <input
              {...control}
              ref={expiryInput}
              className="clarte-input"
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
              onChange={(event) => invitations.changeDays(event.target.value)}
            />
          )}
        </ClarteField>
        {failed && (
          <p className="clarte-settings-alert" role="alert">
            {copy.error}
          </p>
        )}
        <div className="clarte-settings-actions">
          <ClarteButton type="submit" variant="primary" disabled={busy}>
            {copy.send}
          </ClarteButton>
        </div>
      </form>
    </ClarteSidePanel>
  );
}
