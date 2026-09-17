# Clerk runtime setup and smoke check

## Required configuration

Create a Clerk **test** application for PRISMA-PRIM Suite. Configure it as invitation-only: disable public sign-up paths, add the deployed web origin to the allowed origins, and configure the application sign-in URL for that origin. Create invitations only from the Clerk Dashboard; the product intentionally has no invitation administration UI.

Set these variables in the deployment environment (never commit their values):

- `VITE_CLERK_PUBLISHABLE_KEY`: Clerk publishable key embedded in the Vite application.
- `CLERK_PUBLISHABLE_KEY`: the same publishable key used by the backend verifier.
- `CLERK_SECRET_KEY`: Clerk secret key used only by the NestJS backend.
- `VITE_API_URL`: public base URL of the NestJS API (for example, ending in `/api`).
- `WEB_ORIGIN`: exact deployed frontend origin (scheme, host, and optional port;
  no trailing slash or path) allowed by API CORS and forwarded to Clerk as the
  sole `authorizedParties` entry.
- `ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER`, `ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT`,
  `ACCESS_BOOTSTRAP_WORKSPACE_ID`, and `ACCESS_BOOTSTRAP_WORKSPACE_NAME`: the
  complete provider-neutral initial-Workspace bootstrap entry. Omit all four
  only after bootstrap is no longer needed; a partial entry is invalid.
- `ACCESS_ACCEPTED_INVITATIONS_JSON`: a JSON array containing exact
  `{ "provider", "subject", "workspaceId" }` entries for accepted invitations.
  The Workspace must already exist. This application admission configuration is
  distinct from Clerk authentication and contains no role or permission grant.

A production frontend runtime fails closed when `VITE_CLERK_PUBLISHABLE_KEY` is absent. NestJS production startup fails when either server-side Clerk key or a valid exact `WEB_ORIGIN` is absent. Invalid, missing, or expired sessions fail closed with `401 Unauthorized`. Invited users may leave Clerk first and last name fields empty; the verified primary email then serves as the provider-neutral display name.

## Non-sensitive manual smoke procedure

1. In the Clerk test application, confirm public sign-up is disabled and the deployed frontend origin/sign-in redirect URLs match the test deployment.
2. Add the variables above to the web/API deployment secret stores, rebuild the web application, restart the API, and confirm neither service logs their values.
3. In the Clerk Dashboard, invite a new test-only address that is not present in repository fixtures or client records. Leave its first and last name empty to exercise the supported email-only profile.
4. Accept the invitation, obtain the resulting stable Clerk user subject from the test dashboard, add the exact provider/subject and intended existing Workspace ID to `ACCESS_ACCEPTED_INVITATIONS_JSON`, and restart the API. Do not use email or email domain as admission evidence.
5. In a private browser window, copy a protected deep URL, open it signed out, and confirm Clerk receives the sign-in flow without protected shell content appearing first.
6. Complete Clerk sign-in. Confirm the browser returns to the exact protected URL, the shell displays the verified email as both the fallback display name and email, and the expected Workspace is shown.
7. Sign out from the shell. Confirm protected content disappears and Clerk sign-in is required at the same route.
8. Sign in again, then expire or revoke the session in the Clerk Dashboard. Refresh the protected route and confirm the UI returns to sign-in and `GET /api/access/current-actor` returns `401` without a token, cookie, stack trace, local identifier, or protected profile in its response.
9. Repeat steps 5–8 at desktop (1440×900) and mobile (390×844), retaining only non-sensitive screenshots in the CI/browser evidence artifact.
10. Remove the test user, its Access admission entry, and deployment secrets when the temporary environment is retired.

This credential-dependent procedure is supplemental; automated tests use the deterministic identity composition and a mocked Clerk gateway without Clerk network access.

## Suspended-member session revocation (#161)

The existing suspension command commits application denial before attempting
provider revocation. NestJS derives the target from the persisted Internal User's
verified `(provider, subject)`, never the delivery email. The provider-neutral
boundary uses the existing Clerk Backend SDK and server-only `CLERK_SECRET_KEY`;
its application must match the authentication application's keys and have access
to list and revoke that application's sessions. Use only a controlled Development
instance and disposable users for this proof.

Clerk revocation applies to all existing active sessions of that user in the Clerk
application, including sessions used for other Workspaces. It is not a user ban,
deletion, permission restoration or prevention of a fresh sign-in. A fresh sign-in
still cannot restore access to the suspended Workspace. Already issued JWTs may
remain cryptographically valid until expiry; immediate application denial comes
from the inactive Workspace Membership, not an assertion that offline JWT
verification consults Clerk. Verify termination and inability to refresh the old
session separately.

The existing Workspace access panel includes **Check session revocations**. It
loads up to 50 suspended members and provides continuation. Status is `pending`,
`running`, `retry_required` or `complete`. Retry is deliberate, limited to one
attempt per 30 seconds, and never grants application access. Each adapter attempt
has a 10-second deadline and drains at most ten batches of 100 active sessions
from offset zero. A final empty provider listing is required for completion;
partial, malformed, unsupported-provider and unavailable outcomes remain
retryable. A crashed attempt becomes visibly retryable after its lease expires.
There is no scheduler or automatic correction/retry loop.

Public interfaces:

- `GET /api/workspace-session-revocations?after=<nextCursor>`: safe states only,
  requiring live `company.assignment.manage` authority.
- `POST /api/workspace-session-revocations/:workspaceMembershipId/retry`:
  same-Workspace suspended member; repeat/concurrent attempts are safe. The
  acknowledgement means the request was processed, not that Clerk succeeded.
- Activity Log outcomes: `workspace_sessions.revoked` and
  `workspace_sessions.revocation_retry_required`; access administrators alone can
  inspect these Membership-targeted outcomes. No session IDs, provider subject,
  tokens or raw errors are recorded.

### Local proof required before merging #161

Use the existing local PostgreSQL setup, run `pnpm db:migrate` and start the web
and API with `pnpm dev`. Configure real Development Clerk keys and
`WEB_ORIGIN=http://localhost:5173`; omit `ACCESS_IDENTITY_MODE` and
`VITE_ACCESS_IDENTITY_MODE` so this is real authentication. No hosted deployment
or paid provider is required. Use two disposable identities: a Workspace Owner
and an admitted ordinary member. Keep the Owner signed in separately.

1. Establish two Clerk sessions for the ordinary member in separate browser
   profiles before suspension. Keep one profile open. Record only the test time
   and number of sessions, never their tokens or identifiers.
2. As Owner, suspend that member through **Workspace access**. Confirm the next
   protected API request by the member is denied even before the member's old
   token expires. Their identity, assignments and history remain preserved.
3. Click **Check session revocations**. Confirm `complete`, both old sessions are
   revoked in the controlled Clerk Dashboard, and the old browser sessions can
   no longer refresh or maintain sign-in. A new sign-in must still be denied
   access to the suspended Workspace.
4. Check one suspension event and one successful revocation event. Refresh and
   repeat the status check; no additional success event or grants should appear.
5. For failure/recovery, use a second disposable member with an established
   session. Temporarily use a server-side test key lacking revocation access, or
   block backend access to Clerk after authentication, then suspend the member.
   If this also blocks authentication, restore it and use the deterministic
   failure evidence from CI rather than weakening authentication. Confirm
   application denial and `retry_required` when a provider attempt fails.
6. Restore the configuration, wait 30 seconds, then retry from the Owner panel.
   Confirm completion and continuing application denial. No secrets or provider
   response bodies should appear in the UI or Activity Log.

Attach sanitized evidence to the PR: date, Development instance alias, human
reviewer, two pre-existing sessions, immediate application denial, old-session
termination/refresh denial, safe retry if exercised, no restored grants, and
attributable non-secret outcomes. Deterministic CI is necessary but does not
replace this provider-backed proof. Keep the PR draft until the evidence exists.
