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
  await expect(
    page.getByRole('heading', { name: 'Make every decision traceable.' }),
  ).toBeVisible();
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
    page.getByRole('heading', { name: 'Hello, Recipient.' }),
  ).toBeVisible();
  await expect(page.locator('.prisme-breadcrumb')).toContainText(
    'Invited Workspace',
  );
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
    page.getByRole('heading', { name: 'Hello, Recipient.' }),
  ).toBeVisible();
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  await expect(page.locator('.prisme-breadcrumb')).toContainText(
    'Invited Workspace',
  );
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

for (const failureAt of ['after capture', 'after commit', 'before replay']) {
  test(`storage failure ${failureAt} preserves canonical admission and the intended Workspace`, async ({
    page,
  }, testInfo) => {
    const keys: string[] = [];
    let actorReads = 0;
    const failStorage = () => {
      for (const method of ['getItem', 'setItem', 'removeItem']) {
        const original = Storage.prototype[method];
        Object.defineProperty(Storage.prototype, method, {
          configurable: true,
          value(key: string, ...values: string[]) {
            if (key.startsWith('prisma'))
              throw new DOMException(
                'Storage unavailable',
                method === 'setItem' ? 'QuotaExceededError' : 'SecurityError',
              );
            return original.call(this, key, ...values);
          },
        });
      }
    };
    await page.route('**/api/access/invitations/accept', async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        invitationId,
        ticket: 'opaque_ticket',
      });
      keys.push(route.request().headers()['idempotency-key'] ?? '');
      if (failureAt === 'before replay' && keys.length === 1) {
        // The server has committed; the response is lost. A retry must use the same intent.
        return route.abort();
      }
      if (failureAt === 'after commit') {
        await page.evaluate(failStorage);
        await page.addInitScript(failStorage);
      }
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
      actorReads++;
      expect(route.request().headers()['x-workspace-context-id']).toBe(
        workspaceId,
      );
      expect(route.request().headers()['x-company-context-id']).toBeUndefined();
      return route.fulfill({ json: actor });
    });
    await page.route('**/api/companies', (route) => {
      expect(route.request().headers()['x-workspace-context-id']).toBe(
        workspaceId,
      );
      return route.fulfill({ json: [] });
    });
    await page.route('**/api/activity-log', (route) =>
      route.fulfill({ json: { events: [] } }),
    );
    await page.goto(
      '/accept-invitation?invitation=' +
        invitationId +
        '&__clerk_ticket=opaque_ticket',
    );
    await expect(
      page.getByRole('button', { name: 'Accept invitation' }),
    ).toBeVisible();
    if (failureAt === 'after capture') {
      await page.evaluate(failStorage);
      await page.addInitScript(failStorage);
    }
    await page.getByRole('button', { name: 'Accept invitation' }).click();
    if (failureAt === 'before replay') {
      await expect(page.getByRole('alert')).toContainText(
        'could not be confirmed',
      );
      await page.addInitScript(failStorage);
      await page.reload();
      await page.getByRole('button', { name: 'Retry acceptance' }).click();
      await expect.poll(() => keys.length).toBe(2);
      expect(keys[1]).toBe(keys[0]);
    }
    const firstGreeting =
      failureAt === 'before replay' ? 'Bună, Recipient.' : 'Hello, Recipient.';
    await expect(
      page.getByRole('heading', { name: firstGreeting }),
    ).toBeVisible();
    expect(actorReads).toBeGreaterThanOrEqual(2);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Bună, Recipient.' }),
    ).toBeVisible();
    if (testInfo.project.name === 'narrow')
      await page.getByRole('button', { name: 'Deschideți navigarea' }).click();
    await expect(page.locator('.prisme-breadcrumb')).toContainText(
      'Invited Workspace',
    );
    await expect(
      page.getByText('Nu vă este atribuită nicio Companie.', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Clienți', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Înregistrați Compania' }),
    ).toHaveCount(0);
    expect(keys[0]).toBeTruthy();
    expect(page.url()).not.toContain('opaque_ticket');
    await page.screenshot({
      path: testInfo.outputPath('invitation-storage-recovery.png'),
      fullPage: true,
    });
  });
}
