import { expect, test } from '@playwright/test';
import type { ActorContext } from '../src/access-types';

const invitationId = 'aaaaaaaa-0000-4000-8000-000000000163';
const workspaceId = '00000000-0000-4000-8000-000000001630';
const actor: ActorContext = {
  internalUserId: '00000000-0000-4000-8000-000000001631',
  workspaceMembershipId: '00000000-0000-4000-8000-000000001632',
  workspaceId,
  workspaceName: 'Invited Workspace',
  displayName: 'Recipient',
  email: 'recipient@example.test',
  active: true,
  workspacePermissions: [],
};

test('session rejection clears the prior account Workspace before another account signs in', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('identity-fixture-initialized')) {
      sessionStorage.setItem('identity-fixture-initialized', 'true');
      sessionStorage.setItem(
        'prisma-workspace-context',
        'aaaaaaaa-0000-4000-8000-000000000163',
      );
    }
  });
  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({ status: 401 }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toHaveText(
    'Sign in is required to access this workspace.',
  );
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('prisma-workspace-context'),
    ),
  ).toBeNull();
  await page.evaluate(() =>
    sessionStorage.setItem('deterministic-auth-state', 'signed-in'),
  );
  await page.route('**/api/access/current-actor', (route) => {
    expect(route.request().headers()['x-workspace-context-id']).toBeUndefined();
    return route.fulfill({ json: actor });
  });
  await page.route('**/api/companies', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Welcome to PRISMA-PRIM Suite' }),
  ).toBeVisible();
  await expect(
    page
      .getByLabel('Company context')
      .getByText('Invited Workspace', { exact: true }),
  ).toBeVisible();
});

for (const deniedAt of ['acceptance', 'current access']) {
  test(
    'safe denial at ' +
      deniedAt +
      ' does not enter the shell or reveal invitation metadata',
    async ({ page }, testInfo) => {
      await page.route('**/api/access/invitations/accept', (route) =>
        route.fulfill(
          deniedAt === 'acceptance'
            ? { status: 403, json: { message: 'Forbidden', statusCode: 403 } }
            : {
                status: 201,
                json: {
                  invitationId,
                  workspaceId,
                  internalUserId: actor.internalUserId,
                  workspaceMembershipId: actor.workspaceMembershipId,
                  acceptedAt: '2026-09-18T12:00:00.000Z',
                },
              },
        ),
      );
      await page.route('**/api/access/current-actor', (route) =>
        route.fulfill({
          status: 403,
          json: { message: 'Forbidden', statusCode: 403 },
        }),
      );
      await page.goto(
        '/accept-invitation?invitation=' +
          invitationId +
          '&__clerk_ticket=opaque_ticket',
      );
      await page.getByRole('button', { name: 'Accept invitation' }).click();
      await expect(page.getByRole('alert')).toHaveText(
        'This invitation cannot be accepted with your current access. Ask a Workspace Owner for help.',
      );
      await expect(
        page.getByRole('button', { name: 'Accept invitation' }),
      ).toHaveCount(0);
      await expect(
        page.getByText('Invited Workspace', { exact: true }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(() =>
          sessionStorage.getItem('prisma-workspace-context'),
        ),
      ).toBeNull();
      await page.screenshot({
        path: testInfo.outputPath('invitation-safe-denial.png'),
        fullPage: true,
      });
    },
  );
}

test('missing invitation and signed-out state cannot invoke admission', async ({
  page,
}) => {
  let attempts = 0;
  await page.route('**/api/access/invitations/accept', (route) => {
    attempts++;
    return route.fulfill({ status: 403 });
  });
  await page.goto('/accept-invitation');
  await expect(page.getByRole('alert')).toContainText('cannot be accepted');
  await page.evaluate(() =>
    sessionStorage.setItem('deterministic-auth-state', 'signed-out'),
  );
  await page.goto('/accept-invitation?invitation=' + invitationId);
  await expect(page.getByRole('alert')).toContainText('Sign in is required');
  expect(attempts).toBe(0);
});

test('recipient retries an uncertain acceptance and enters only the server-authorized empty shell', async ({
  page,
}, testInfo) => {
  let attempts = 0;
  const keys: string[] = [];
  await page.route('**/api/access/invitations/accept', (route) => {
    expect(route.request().postDataJSON()).toEqual({
      invitationId,
      ticket: 'opaque_ticket',
    });
    keys.push(route.request().headers()['idempotency-key'] ?? '');
    if (++attempts === 1) return route.fulfill({ status: 503, json: {} });
    return route.fulfill({
      status: 201,
      json: {
        invitationId,
        workspaceId,
        internalUserId: actor.internalUserId,
        workspaceMembershipId: actor.workspaceMembershipId,
        acceptedAt: '2026-09-18T12:00:00.000Z',
      },
    });
  });
  await page.route('**/api/access/current-actor', (route) => {
    expect(route.request().headers()['x-workspace-context-id']).toBe(
      workspaceId,
    );
    expect(route.request().headers()['x-company-context-id']).toBeUndefined();
    return route.fulfill({ json: actor });
  });
  await page.route('**/api/companies', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );
  await page.goto(
    '/accept-invitation?invitation=' +
      invitationId.toUpperCase() +
      '&__clerk_ticket=opaque_ticket',
  );
  await page.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(page.getByRole('alert')).toContainText('could not be confirmed');
  await page.reload();
  await page.getByRole('button', { name: 'Retry acceptance' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome to PRISMA-PRIM Suite' }),
  ).toBeVisible();
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  await expect(
    page
      .getByLabel('Company context')
      .getByText('Invited Workspace', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Register Company' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Clients', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('No Company is assigned to you.', { exact: false }),
  ).toBeVisible();
  expect(page.url()).not.toContain('opaque_ticket');
  await page.screenshot({
    path: testInfo.outputPath('invitation-admitted-empty-shell.png'),
    fullPage: true,
  });
});
