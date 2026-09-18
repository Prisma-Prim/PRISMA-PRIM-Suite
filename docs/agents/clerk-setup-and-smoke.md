# Clerk runtime setup and smoke check

## Required configuration

Use a Clerk **Development/test** application for PRISMA-PRIM Suite. Confirm its instance and keys belong to this repository before using the existing PRISMA CERT application. Configure it as invitation-only: disable public sign-up paths, configure the web origin and application sign-in URL. The configured bootstrap Workspace Owner can issue and revoke controlled invitations in the application. The Dashboard remains useful for preparing the initial Owner and checking provider evidence.

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

## Controlled Workspace invitations (#162)

### Configuration and authority

No hosted application or hosted database is required for this slice. For local verification, start PostgreSQL with the repository's existing Docker setup, run `pnpm db:migrate`, and start the web/API with `pnpm dev`. Use the Clerk configuration above with `WEB_ORIGIN=http://localhost:5173`; configure that same local origin in Clerk. The Vite frontend needs `VITE_CLERK_PUBLISHABLE_KEY`, and the API needs both backend Clerk variables. Keep deterministic/local-demo identity modes disabled when collecting real Clerk evidence. See the repository environment contract for the supported local startup commands.

The bootstrap configuration identifies the Owner by exact external provider and subject. Resolving that Owner grants `member.invite`; an ordinary Company manager or access administrator does not receive it. Existing Owners receive this permission on their next resolution. The migration does not grant it to existing members. There is no delegation UI or endpoint.

Issuance stores one Workspace-bound invitation and one attributable `workspace_invitation.issued` Activity Log event before delivery. This event records the local issuance, not proof that a mailbox received an email. Revocation stores `revoked_at` and one `workspace_invitation.revoked` event before contacting Clerk. Neither operation creates an Internal User, Membership, Company assignment or business permission. Email is a delivery address only. Acceptance and admission remain #163; do not add the recipient to `ACCESS_ACCEPTED_INVITATIONS_JSON` for the #162 proof.

### API and retry contract

- `GET /api/workspace-invitations?after=<cursor>` returns at most 50 safe records and a next cursor within the authenticated Workspace.
- `POST /api/workspace-invitations` takes `{ "email": "controlled address", "expiresInDays": 7 }` and `Idempotency-Key`. The supported expiry window is 1–30 whole days, explicitly chosen in the UI. The application expiry starts at reservation, so it cannot extend Clerk's delivery-time expiry.
- `POST /api/workspace-invitations/:id/revoke` takes `Idempotency-Key` and makes local revocation durable, even when provider revocation cannot yet be confirmed.
- `POST /api/workspace-invitations/:id/refresh` checks provider state; it never sends another invitation.

Keys are scoped to the Workspace and actor across both commands. An exact issuance replay returns its current safe state without a new send; changed email, expiry or operation under the same key is rejected. An unresolved or pending invitation to the same delivery address in the same Workspace also prevents bypassing this protection with a new key. A new controlled issuance requires a new key after a definitive rejection or confirmed provider terminal state.

Provider calls have a 10-second response deadline. Reconciliation uses one bounded query per Clerk status (maximum 100 results each), matching the opaque application reference as well as the delivery address. Missing, malformed, ambiguous or truncated results stay uncertain. Manual checks are limited to one claimed reconciliation per invitation per 30 seconds. There are no background retries, automatic resends or scheduled repair loops. A response from an obsolete claim cannot overwrite a newer one. A revocation requested during an in-flight send remains locally effective and is reconciled by a later manual check.

`status` is the application state, including local revocation and expiry. `deliveryStatus` is the last confirmed provider state, or `uncertain`/`rejected`. Provider IDs, public metadata, invitation URLs/tokens and raw provider errors are absent from business responses and Activity Log metadata. An uncertain invitation must be checked in Clerk before any replacement attempt. Clerk application invitations may reject an address that already belongs to a user; this slice deliberately does not bypass that protection with `ignoreExisting`.

Provider references: [create invitation](https://clerk.com/docs/reference/backend/invitations/create-invitation), [list invitations](https://clerk.com/docs/reference/backend/invitations/get-invitation-list), [revoke invitation](https://clerk.com/docs/reference/backend/invitations/revoke-invitation).

### Week-end local proof (required before merge)

1. Sign in as the configured Workspace Owner. In **Workspace invitations**, issue an invitation to a mailbox you control, using a new test-only address and a one-day expiry. Confirm the intended Workspace and one Activity Log issuance. Record the date and outcome, without the address, keys, cookie, provider subject or link.
2. Check the mailbox. Actual receipt is a human check; a successful API response alone is insufficient. Do not capture or paste the invitation URL. Confirm the UI has no membership or Company grant created by issuance. A recipient authenticated only at Clerk must still receive an application access denial.
3. Revoke the unused invitation using the confirmation control. If delivery is still unconfirmed, wait until the displayed next check time and select **Check invitation status**. Confirm provider revocation, one attributable revocation event, and that the original email link is unusable. An independent Clerk sign-up path must not grant Workspace access either.
4. Issue a second controlled invitation, leave it unused for its one-day lifetime, then confirm expiry in both the application and Clerk and that its link cannot admit the recipient. Prepare this sample at least a day before the planned weekend validation; do not shorten the application database timestamp and call that real provider-expiry proof.
5. Retain only a sanitized checklist with date, Development instance confirmed, receipt, revocation, expiry, denied application admission, and human reviewer. Attach that checklist to the PR. Keep #162 open and the PR in draft until the real proof and explicit human validation are complete.

### Optional GitHub Actions provider check

The existing required CI remains provider-independent and includes PostgreSQL REST tests, provider-boundary failure tests and desktop/mobile browser journeys. It needs no Clerk secrets. Local browser/PostgreSQL tests may be deferred to this CI when the agent environment lacks those services.

`Clerk invitation smoke (manual)` is a separate `workflow_dispatch` workflow, not a required PR check. Configure the `clerk-development` GitHub environment with `CLERK_SECRET_KEY` (test key only) and `CLERK_SMOKE_RECIPIENT` (a mailbox you control, not an existing Clerk user). Restrict that environment to trusted branches and a required reviewer before adding the secret. Each explicit run sends one email and attempts to revoke that invitation; it has no automatic trigger or retry. Do not invoke it with a real collaborator's address.

The script prints only boolean outcomes and a timestamp. It verifies real provider issuance and revocation, but explicitly does **not** claim mailbox receipt, expiry or application admission proof. Complete those locally using the procedure above. No credentials have been configured and no live invitation has been sent as part of implementing this slice.

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
