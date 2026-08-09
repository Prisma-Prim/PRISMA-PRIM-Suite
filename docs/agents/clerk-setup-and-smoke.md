# Clerk runtime setup and smoke check

## Required configuration

Create a Clerk **test** application for PRISMA-PRIM Suite. Configure it as invitation-only: disable public sign-up paths, add the deployed web origin to the allowed origins, and configure the application sign-in URL for that origin. Create invitations only from the Clerk Dashboard; the product intentionally has no invitation administration UI.

Set these variables in the deployment environment (never commit their values):

- `VITE_CLERK_PUBLISHABLE_KEY`: Clerk publishable key embedded in the Vite application.
- `CLERK_PUBLISHABLE_KEY`: the same publishable key used by the backend verifier.
- `CLERK_SECRET_KEY`: Clerk secret key used only by the NestJS backend.
- `VITE_API_URL`: public base URL of the NestJS API (for example, ending in `/api`).
- `WEB_ORIGIN`: exact deployed frontend origin allowed by API CORS.

A production frontend runtime fails closed when `VITE_CLERK_PUBLISHABLE_KEY` is absent. NestJS production startup fails when either server-side Clerk key is absent. Invalid, missing, or expired sessions fail closed with `401 Unauthorized`.

## Non-sensitive manual smoke procedure

1. In the Clerk test application, confirm public sign-up is disabled and the deployed frontend origin/sign-in redirect URLs match the test deployment.
2. Add the variables above to the web/API deployment secret stores, rebuild the web application, restart the API, and confirm neither service logs their values.
3. In the Clerk Dashboard, invite a new test-only address that is not present in repository fixtures or client records.
4. In a private browser window, copy a protected deep URL, open it signed out, and confirm Clerk receives the sign-in/invitation flow without protected shell content appearing first.
5. Accept the invitation from the test mailbox and complete Clerk sign-in. Confirm the browser returns to the exact protected URL, the shell displays the expected local Internal User name and email, and the expected Workspace is shown.
6. Sign out from the shell. Confirm protected content disappears and Clerk sign-in is required at the same route.
7. Sign in again, then expire or revoke the session in the Clerk Dashboard. Refresh the protected route and confirm the UI returns to sign-in and `GET /api/access/current-actor` returns `401` without a token, cookie, stack trace, local identifier, or protected profile in its response.
8. Repeat steps 4–7 at desktop (1440×900) and mobile (390×844), retaining only non-sensitive screenshots in the CI/browser evidence artifact.
9. Remove the test invitation/user and deployment secrets when the temporary environment is retired.

This credential-dependent procedure is supplemental; automated tests use the deterministic identity composition and a mocked Clerk gateway without Clerk network access.
