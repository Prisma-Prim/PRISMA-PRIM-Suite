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
