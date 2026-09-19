import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ActorContext } from '../src/access-types';

const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'membership',
  workspaceId: 'workspace',
  workspaceName: 'Invitation Workspace',
  displayName: 'Workspace Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['member.invite'],
};

test('Owner retries an uncertain issue exactly, refreshes it and revokes it without granting access', async ({
  page,
}, testInfo) => {
  let issueAttempts = 0;
  let refreshed = false;
  let revoked = false;
  let initialCommand:
    | { readonly body: string | null; readonly idempotencyKey: string }
    | undefined;
  await interceptShell(page);
  await page.route(
    /\/api\/workspace-invitations(?:\/[^/?]+\/(?:revoke|refresh))?(?:\?.*)?$/,
    (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const path = new URL(request.url()).pathname;
        const idempotencyKey = request.headers()['idempotency-key'] ?? '';
        expect(idempotencyKey).not.toBe('');
        if (path.endsWith('/refresh')) {
          refreshed = true;
          return route.fulfill({ status: 201, json: invitationRecord() });
        }
        if (path.endsWith('/revoke')) {
          revoked = true;
          return route.fulfill({ status: 201, json: invitationRecord() });
        }
        const command = { body: request.postData(), idempotencyKey };
        if (initialCommand) expect(command).toEqual(initialCommand);
        else initialCommand = command;
        expect(command.body).toBe(
          JSON.stringify({
            email: 'recipient@example.test',
            expiresInDays: 7,
          }),
        );
        issueAttempts += 1;
        if (issueAttempts === 1)
          return route.fulfill({
            status: 503,
            json: { message: 'Unavailable' },
          });
        return route.fulfill({ status: 201, json: invitationRecord() });
      }
      return route.fulfill({
        json: {
          invitations: issueAttempts >= 2 ? [invitationRecord()] : [],
          nextCursor: null,
        },
      });
    },
  );

  await page.goto('/?frame=prisme#invitations');
  const invitations = page.getByRole('region', {
    name: 'Workspace invitations',
  });
  await expect(invitations).toHaveClass(/workspace-invitations--prisme/);
  await page.getByLabel('Recipient email').fill('recipient@example.test');
  const send = page.getByRole('button', { name: 'Send invitation' });
  await send.focus();
  await expect(send).toBeFocused();
  expect(
    await send.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe('solid');
  await send.click();
  await expect(invitations.getByRole('alert')).toContainText(
    'Retry the same request',
  );
  await send.click();
  await expect(
    invitations.getByText(
      'Delivery unconfirmed — check status before sending another invitation.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(issueAttempts).toBe(2);

  await page.getByRole('button', { name: 'Check invitation status' }).click();
  await expect(
    invitations.getByText('Invitation sent; awaiting use.', { exact: true }),
  ).toBeVisible();
  expect(refreshed).toBe(true);
  await expect(
    invitations.getByText(/An invitation does not grant membership/),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Revoke invitation' }).click();
  expect(revoked).toBe(false);
  await page.getByRole('button', { name: 'Confirm revocation' }).click();
  await expect(invitations.getByText('Revoked', { exact: true })).toBeVisible();
  await expect(
    invitations.getByRole('button', { name: 'Revoke invitation' }),
  ).toHaveCount(0);
  expect(revoked).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('heading', { name: 'Invitations', exact: true }).focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath(
      `workspace-invitation-revoked-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });

  function invitationRecord() {
    return {
      id: '00000000-0000-4000-8000-000000000162',
      email: 'recipient@example.test',
      expiresAt: '2026-10-01T00:00:00.000Z',
      createdAt: '2026-09-01T00:00:00.000Z',
      revokedAt: revoked ? '2026-09-01T01:00:00.000Z' : null,
      status: revoked ? 'revoked' : refreshed ? 'pending' : 'uncertain',
      deliveryStatus: revoked ? 'revoked' : refreshed ? 'pending' : 'uncertain',
      nextCheckAt: '2026-09-01T00:00:30.000Z',
    };
  }
});

test('Owner recovers a failed invitation list into the genuine empty state', async ({
  page,
}, testInfo) => {
  let attempts = 0;
  await interceptShell(page);
  await page.route('**/api/workspace-invitations', async (route) => {
    attempts += 1;
    if (attempts === 1)
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
    return attempts === 1
      ? route.fulfill({ status: 503, json: { message: 'Unavailable' } })
      : route.fulfill({ json: { invitations: [], nextCursor: null } });
  });

  await page.goto('/?frame=prisme#invitations');
  const invitations = page.getByRole('region', {
    name: 'Workspace invitations',
  });
  await expect(invitations.getByRole('status')).toHaveText(
    'Loading invitations…',
  );
  await expect(invitations.getByRole('alert')).toContainText(
    'The request could not be confirmed',
  );
  await page.screenshot({
    path: testInfo.outputPath(
      `workspace-invitation-error-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Reload invitations' }).click();
  await expect(
    invitations.getByText('No invitations on this page.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Recipient email')).toBeVisible();
  expect(attempts).toBe(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('heading', { name: 'Invitations', exact: true }).focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath(
      `workspace-invitation-empty-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});

test('server-denied invitation administration leaves the protected Workspace', async ({
  page,
}, testInfo) => {
  await interceptShell(page);
  await page.route('**/api/workspace-invitations', (route) =>
    route.fulfill({ status: 403, json: { message: 'Forbidden' } }),
  );

  await page.goto('/?frame=prisme#invitations');
  await expect(
    page.getByRole('alert').filter({
      hasText: 'Your access to this workspace is inactive.',
    }),
  ).toBeVisible();
  await expect(page.getByLabel('Recipient email')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath(
      `workspace-invitation-denied-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});

async function interceptShell(page: Page) {
  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({ json: actor }),
  );
  await page.route('**/api/companies', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );
}
