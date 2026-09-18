import { SignIn, SignUp } from '@clerk/react';
import { useState } from 'react';
import {
  ClerkAccessComposition,
  type BrowserIdentity,
} from '../access-composition';
import {
  captureAcceptanceIntent,
  type AcceptanceIntent,
} from './invitation-acceptance-intent';
import { invitationAcceptanceCopy as copy } from './invitation-acceptance.copy';
import { WorkspaceInvitationAcceptance } from './WorkspaceInvitationAcceptance';
import '../production-shell/application-shell.css';

export function WorkspaceInvitationEntry({
  identity,
}: {
  identity?: BrowserIdentity;
}) {
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
  const returnUrl =
    '/accept-invitation?invitation=' + encodeURIComponent(intent.invitationId);
  const signInUrl = returnUrl + '&mode=signin';
  const signUpUrl = intent.ticket
    ? returnUrl +
      '&mode=signup&__clerk_status=sign_up&__clerk_ticket=' +
      encodeURIComponent(intent.ticket)
    : undefined;
  const mode = new URL(window.location.href).searchParams.get('mode');
  return (
    <main className="production-access-state">
      <section className="production-content-surface invitation-entry">
        <h1>{copy.title}</h1>
        <p>{copy.authentication}</p>
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
          />
        ) : (
          <div className="invitation-entry-actions">
            <a href={signInUrl}>{copy.signIn}</a>
            {signUpUrl && <a href={signUpUrl}>{copy.signUp}</a>}
          </div>
        )}
      </section>
    </main>
  );
}
