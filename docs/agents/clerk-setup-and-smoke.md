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
  `{ "provider", "subject", "workspaceId" }` entries for explicit legacy admission.
  The Workspace must already exist. Keep this empty for the automatic recipient
  journey below; it is not evidence of invitation consumption.

A production frontend runtime fails closed when `VITE_CLERK_PUBLISHABLE_KEY` is absent. NestJS production startup fails when either server-side Clerk key or a valid exact `WEB_ORIGIN` is absent. Invalid, missing, or expired sessions fail closed with `401 Unauthorized`. Invited users may leave Clerk first and last name fields empty; the verified primary email then serves as the provider-neutral display name.

## Non-sensitive manual smoke procedure

1. In the Clerk test application, confirm public sign-up is disabled and the deployed frontend origin/sign-in redirect URLs match the test deployment.
2. Add the variables above to the web/API deployment secret stores, rebuild the web application, restart the API, and confirm neither service logs their values.
3. As the configured Workspace Owner, issue an invitation from the application to a new test-only address. Leave its first and last name empty during invited account creation to exercise the supported email-only profile.
4. Follow the recipient journey below to accept the invitation. Do not change an identity allowlist or restart the API to admit the recipient.
5. In a private browser window, copy a protected deep URL, open it signed out, and confirm Clerk receives the sign-in flow without protected shell content appearing first.
6. Complete Clerk sign-in. Confirm the browser returns to the exact protected URL, the shell displays the verified email as both the fallback display name and email, and the expected Workspace is shown.
7. Sign out from the shell. Confirm protected content disappears and Clerk sign-in is required at the same route.
8. Sign in again, then expire or revoke the session in the Clerk Dashboard. Refresh the protected route and confirm the UI returns to sign-in and `GET /api/access/current-actor` returns `401` without a token, cookie, stack trace, local identifier, or protected profile in its response.
9. Repeat steps 5–8 at desktop (1440×900) and mobile (390×844), retaining only non-sensitive screenshots in the CI/browser evidence artifact.
10. Retire only the disposable test user/database and temporary deployment secrets. Preserve unrelated users and historical application data.

This credential-dependent procedure is supplemental; automated tests use the deterministic identity composition and a mocked Clerk gateway without Clerk network access.

## Controlled Workspace invitations (#162)

### Configuration and authority

No hosted application or hosted database is required for this slice. For local verification, start PostgreSQL with the repository's existing Docker setup, run `pnpm db:migrate`, and start the web/API with `pnpm dev`. Use the Clerk configuration above with `WEB_ORIGIN=http://localhost:5173`; configure that same local origin in Clerk. The Vite frontend needs `VITE_CLERK_PUBLISHABLE_KEY`, and the API needs both backend Clerk variables. Keep deterministic/local-demo identity modes disabled when collecting real Clerk evidence. See the repository environment contract for the supported local startup commands.

The bootstrap configuration identifies the Owner by exact external provider and subject. Resolving that Owner grants `member.invite`; an ordinary Company manager or access administrator does not receive it. Existing Owners receive this permission on their next resolution. The migration does not grant it to existing members. There is no delegation UI or endpoint.

Issuance stores one Workspace-bound invitation and one attributable `workspace_invitation.issued` Activity Log event before delivery. This event records the local issuance, not proof that a mailbox received an email. Revocation stores `revoked_at` and one `workspace_invitation.revoked` event before contacting Clerk. Neither operation creates an Internal User, Membership, Company assignment or business permission. Email is a delivery address only. Recipient acceptance is a separate command described below.

### API and retry contract

- `GET /api/workspace-invitations?after=<cursor>` returns at most 50 safe records and a next cursor within the authenticated Workspace.
- `POST /api/workspace-invitations` takes `{ "email": "controlled address", "expiresInDays": 7 }` and `Idempotency-Key`. The supported expiry window is 1–30 whole days, explicitly chosen in the UI. The application expiry starts at reservation, so it cannot extend Clerk's delivery-time expiry.
- `POST /api/workspace-invitations/:id/revoke` takes `Idempotency-Key` and makes local revocation durable, even when provider revocation cannot yet be confirmed.
- `POST /api/workspace-invitations/:id/refresh` checks provider state; it never sends another invitation.

Keys are scoped to the Workspace and actor across both commands. An exact issuance replay returns its current safe state without a new send; changed email, expiry or operation under the same key is rejected. An unresolved or pending invitation to the same delivery address in the same Workspace also prevents bypassing this protection with a new key. A new controlled issuance requires a new key after a definitive rejection or confirmed provider terminal state.

Provider calls have a 10-second response deadline. Reconciliation uses one bounded query per Clerk status (maximum 100 results each), matching the opaque application reference as well as the delivery address. Missing, malformed, ambiguous or truncated results stay uncertain. Manual checks are limited to one claimed reconciliation per invitation per 30 seconds. There are no background retries, automatic resends or scheduled repair loops. A response from an obsolete claim cannot overwrite a newer one. A revocation requested during an in-flight send remains locally effective and is reconciled by a later manual check.

`status` is the application state, including local revocation and expiry. `deliveryStatus` is the last confirmed provider state, or `uncertain`/`rejected`. `consumedAt` distinguishes committed Workspace admission from provider use alone. Owners can revoke until local consumption, even after provider use. Provider IDs, public metadata, invitation URLs/tokens and raw provider errors are absent from business responses and Activity Log metadata. An uncertain invitation must be checked in Clerk before any replacement attempt. Issuance uses `ignoreExisting: true` to support existing identities; the local unresolved/pending guard still prevents duplicate sends. Every new invitation carries its opaque local reference and a `WEB_ORIGIN/accept-invitation` callback.

Provider references: [create invitation](https://clerk.com/docs/reference/backend/invitations/create-invitation), [list invitations](https://clerk.com/docs/reference/backend/invitations/get-invitation-list), [revoke invitation](https://clerk.com/docs/reference/backend/invitations/revoke-invitation).

### Historical #162 provider proof

The delivered proof is owned by [#222](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/pull/222). The following procedure documents that boundary; #163 reuses unchanged delivery, mailbox, revocation and expiry evidence.

1. Sign in as the configured Workspace Owner. In **Workspace invitations**, issue an invitation to a mailbox you control, using a new test-only address and a one-day expiry. Confirm the intended Workspace and one Activity Log issuance. Record the date and outcome, without the address, keys, cookie, provider subject or link.
2. Check the mailbox. Actual receipt is a human check; a successful API response alone is insufficient. Do not capture or paste the invitation URL. Confirm the UI has no membership or Company grant created by issuance. A recipient authenticated only at Clerk must still receive an application access denial.
3. Revoke the unused invitation using the confirmation control. If delivery is still unconfirmed, wait until the displayed next check time and select **Check invitation status**. Confirm provider revocation, one attributable revocation event, and that the original email link is unusable. An independent Clerk sign-up path must not grant Workspace access either.
4. Issue a second controlled invitation, leave it unused for its one-day lifetime, then confirm expiry in both the application and Clerk and that its link cannot admit the recipient. Prepare this sample at least a day before the planned weekend validation; do not shorten the application database timestamp and call that real provider-expiry proof.
5. Retain only a sanitized checklist with date, Development instance confirmed, receipt, revocation, expiry, denied application admission, and human reviewer. Attach that checklist to the PR. Keep #162 open and the PR in draft until the real proof and explicit human validation are complete.

### Optional GitHub Actions provider check

The existing required CI remains provider-independent and includes PostgreSQL REST tests, provider-boundary failure tests and desktop/mobile browser journeys. It needs no Clerk secrets. Local browser/PostgreSQL tests may be deferred to this CI when the agent environment lacks those services.

`Clerk invitation smoke (manual)` is a separate `workflow_dispatch` workflow, not a required PR check. Configure the `clerk-development` GitHub environment with `CLERK_SECRET_KEY` (test key only) and `CLERK_SMOKE_RECIPIENT` (a mailbox you control, not an existing Clerk user). Restrict that environment to trusted branches and a required reviewer before adding the secret. Each explicit run sends one email and attempts to revoke that invitation; it has no automatic trigger or retry. Do not invoke it with a real collaborator's address.

The script prints only boolean outcomes and a timestamp. It verifies real provider issuance and revocation, but explicitly does **not** claim mailbox receipt, expiry or application admission proof. Complete those locally using the procedure above. No credentials have been configured and no live invitation has been sent as part of implementing this slice.

## Recipient acceptance (#163)

Use the same configured Clerk application for the web and API. Existing-account
acceptance requires its Native API to be available. The API does not enable it
or alter provider settings. The configured publishable key determines the
trusted FAPI host; browser-supplied URLs, email matches and status alone never
prove identity.

1. Follow an application-issued invitation. Choose **Create your invited
   account** for a new account, or **Sign in** for an existing one. The latter
   authenticates independently before server-side ticket consumption.
2. Select **Accept invitation**. The browser retains one intent/key across a
   refresh or uncertain response and offers a deliberate retry. Successful
   admission re-fetches current actor context before entering the intended
   Workspace, without an active Company or newly assigned business permission.
   Browser persistence is optional: the mounted journey retains its intent and
   selected Workspace, and the current history entry preserves retry/selection
   hints across a refresh when session storage fails. Every entry still checks
   live server access; neither cache supplies authority. Storage cleanup cannot
   prevent Clerk sign-out. Authentication links and the provider return carry the
   same untrusted intent in a URL fragment, captured and removed before Clerk
   mounts; no membership or permission is read from that continuation.
   New continuations use `#/?invitation-intent=...` so Clerk can compose its hash
   routes. The recipient entry also reads the legacy `#invitation-intent=...`
   envelope, applies the same validation and removes either before Clerk mounts;
   an existing retry key is preserved rather than regenerated.
3. Confirm one acceptance event as Owner and, only for a new Internal User,
   one provisioning event. The approved semantics live in the
   [Activity Log PRD](../product/activity-log-accountability-prd.md#4-event-contract).
4. Reopen the same intent after suspension: denial must persist. A fresh
   invitation cannot reactivate an inactive identity or Membership.

`POST /api/access/invitations/accept` requires a verified session,
`Idempotency-Key`, and `{ invitationId, ticket? }`. Authentication here
precedes Membership; ordinary business endpoints retain their active-access
guard. Missing authentication returns 401; ineligible intent returns a uniform
403; uncertain provider evidence returns a retryable 503. Exact replay returns
the original result only while that identity and intended Membership remain
active. `x-workspace-context-id` selects a currently authorized Workspace on
ordinary API requests and cannot grant or retarget Membership.

Clerk sign-up copies server-set invitation metadata to the new User. Existing
user sign-in does not replace that metadata. For that case, the API validates
the opaque ticket against the correlated provider invitation, creates a private
native client, and persists its ID and AES-GCM-protected initial bearer before
exchange. BAPI readback of that exclusively server-owned client's sole active
session binds the invitation to the independently verified caller. This receipt
also recovers a lost exchange response; neither the client nor its bearer is
accepted from or returned to the browser. Native exchange credentials are never
used as the caller's authentication. Rotating the server secret can invalidate
an unconsumed encrypted context; safe denial is preserved and an Owner may revoke
and issue a replacement.

Provider proof precedes the local transaction. Consumption, identity/Membership,
canonical result and history commit atomically after rechecking revocation,
expiry and inactive access under PostgreSQL locks. A rollback leaves no partial
admission; the private provider context remains available for retry. Clerk and
PostgreSQL do not share a transaction. Historical provider-accepted invitations
are not backfilled into local consumption.

See [Clerk application invitation flows](https://clerk.com/docs/guides/development/custom-flows/authentication/application-invitations)
and the [Clerk API schemas](https://github.com/clerk/openapi-specs) for the
provider contract. Sanitized real-provider evidence and current scenario results
belong to [#163](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/163)
and its PR; no credentials or provider tickets belong in those artifacts.

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
