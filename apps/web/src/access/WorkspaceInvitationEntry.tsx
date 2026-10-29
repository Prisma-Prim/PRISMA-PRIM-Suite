import { SignIn, SignUp } from '@clerk/react';
import { useState } from 'react';
import {
  ClerkAccessComposition,
  type BrowserIdentity,
} from '../access-composition';
import {
  captureAcceptanceIntent,
  acceptanceContinuationUrl,
  type AcceptanceIntent,
} from './invitation-acceptance-intent';
import { useInvitationAcceptanceCopy } from './invitation-acceptance.copy';
import { WorkspaceInvitationAcceptance } from './WorkspaceInvitationAcceptance';
import { ClerkNativeValidation } from './ClerkNativeValidation';
import '../production-shell/application-shell.css';

export function WorkspaceInvitationEntry({
  identity,
}: {
  identity?: BrowserIdentity;
}) {
  const copy = useInvitationAcceptanceCopy();
  // Capture before mounting Clerk, including on a fresh invitation redirect.
  const [intent] = useState(captureAcceptanceIntent);
  if (!intent)
    return (
      <main className="production-access-state">
        <p role="alert">{copy.denied}</p>
      </main>
    );
  if (identity)
    return (
      <WorkspaceInvitationAcceptance identity={identity} intent={intent} />
    );
  return (
    <ClerkAccessComposition
      signedOutView={<InvitationAuthentication intent={intent} />}
    >
      {(clerkIdentity) => (
        <WorkspaceInvitationAcceptance
          identity={clerkIdentity}
          intent={intent}
        />
      )}
    </ClerkAccessComposition>
  );
}

function InvitationAuthentication({ intent }: { intent: AcceptanceIntent }) {
  const copy = useInvitationAcceptanceCopy();
  const returnUrl = acceptanceContinuationUrl(intent);
  const signInUrl = acceptanceContinuationUrl(intent, 'signin');
  const signUpUrl = intent.ticket
    ? acceptanceContinuationUrl(intent, 'signup')
    : undefined;
  const mode = new URL(window.location.href).searchParams.get('mode');
  return (
    <main className="production-access-state">
      <section className="production-content-surface invitation-entry">
        <h1>{copy.title}</h1>
        <p>{copy.authentication}</p>
        <ClerkNativeValidation>
          {mode === 'signup' && signUpUrl ? (
            <SignUp
              routing="hash"
              forceRedirectUrl={returnUrl}
              signInUrl={signInUrl}
              signInForceRedirectUrl={returnUrl}
            />
          ) : mode === 'signin' ? (
            <SignIn
              routing="hash"
              forceRedirectUrl={returnUrl}
              signUpUrl={signUpUrl ?? returnUrl}
              signUpForceRedirectUrl={returnUrl}
            />
          ) : (
            <div className="invitation-entry-actions">
              <a href={signInUrl}>{copy.signIn}</a>
              {signUpUrl && <a href={signUpUrl}>{copy.signUp}</a>}
            </div>
          )}
        </ClerkNativeValidation>
      </section>
    </main>
  );
}
