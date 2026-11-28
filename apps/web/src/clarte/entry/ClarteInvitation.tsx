import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { ClerkNativeValidation } from '../../access/ClerkNativeValidation';
import { useInvitationAcceptanceCopy } from '../../access/invitation-acceptance.copy';
import { ClarteButton } from '../components/ClarteButton';
import {
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { ClartePage } from './ClartePage';

/** An invitation link without a usable invitation: the existing refusal. */
export function ClarteInvitationRefusal() {
  const copy = useInvitationAcceptanceCopy();
  return (
    <ClartePage kind="invitation">
      <h1>{copy.title}</h1>
      <ClarteErrorState title={copy.denied} />
    </ClartePage>
  );
}

/**
 * The signed-out invitation step. Without a chosen mode it offers signing in,
 * and creating the invited account when the link carries a ticket; with a
 * mode it shows the identity provider's own form, which the invitation owner
 * composes with the exact continuation.
 */
export function ClarteInvitationAuthentication({
  provider,
  signInUrl,
  signUpUrl,
}: Readonly<{
  provider: ReactNode | undefined;
  signInUrl: string;
  signUpUrl: string | undefined;
}>) {
  const copy = useInvitationAcceptanceCopy();
  return (
    <ClartePage kind="invitation">
      <h1>{copy.title}</h1>
      <p className="clarte-page-lead">{copy.authentication}</p>
      <ClerkNativeValidation>
        {provider ? (
          <div className="clarte-page-provider">{provider}</div>
        ) : (
          <div className="clarte-page-actions">
            <a
              className="clarte-button clarte-button--primary"
              href={signInUrl}
            >
              {copy.signIn}
            </a>
            {signUpUrl && (
              <a
                className="clarte-button clarte-button--secondary"
                href={signUpUrl}
              >
                {copy.signUp}
              </a>
            )}
          </div>
        )}
      </ClerkNativeValidation>
    </ClartePage>
  );
}

/** The identity provider has not reported the session yet. */
export function ClarteInvitationIdentityCheck() {
  const copy = useInvitationAcceptanceCopy();
  return (
    <ClartePage kind="invitation">
      <ClarteLoadingState label={copy.checking} />
    </ClartePage>
  );
}

/** What a signed-in recipient sees before the Workspace opens. */
export type ClarteInvitationStep = 'ready' | 'loading' | 'error' | 'denied';

/**
 * Accepting the invitation once signed in. The owner sends the command and
 * decides the step; a refusal removes the accept action, as today.
 */
export function ClarteInvitationAcceptance({
  step,
  onAccept,
  onUseAnotherAccount,
}: Readonly<{
  step: ClarteInvitationStep;
  onAccept: () => void;
  onUseAnotherAccount: () => void;
}>) {
  const copy = useInvitationAcceptanceCopy();
  return (
    <ClartePage kind="invitation">
      <h1>{copy.title}</h1>
      <p className="clarte-page-lead">{copy.description}</p>
      {step === 'loading' && (
        <p className="clarte-page-callout" role="status">
          <span className="clarte-spinner" aria-hidden="true" />
          {copy.loading}
        </p>
      )}
      {(step === 'error' || step === 'denied') && (
        <p
          className="clarte-page-callout clarte-page-callout--danger"
          role="alert"
        >
          <CircleAlert aria-hidden="true" />
          {step === 'error' ? copy.error : copy.denied}
        </p>
      )}
      <div className="clarte-page-actions">
        {step !== 'denied' && (
          <ClarteButton
            variant="primary"
            disabled={step === 'loading'}
            onClick={onAccept}
          >
            {step === 'error' ? copy.retry : copy.accept}
          </ClarteButton>
        )}
        <ClarteButton
          variant="secondary"
          disabled={step === 'loading'}
          onClick={onUseAnotherAccount}
        >
          {copy.signOut}
        </ClarteButton>
      </div>
    </ClartePage>
  );
}
