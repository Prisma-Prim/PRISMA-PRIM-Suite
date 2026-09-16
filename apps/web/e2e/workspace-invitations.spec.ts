import { expect, test } from '@playwright/test';
import type { ActorContext } from '../src/access-types';

test('Owner issues and revokes an invitation without granting access', async ({
  page,
}, testInfo) => {
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
  let issued = false;
  let revoked = false;
  const record = () => ({
    id: '00000000-0000-4000-8000-000000000162',
    email: 'recipient@example.test',
    expiresAt: '2026-10-01T00:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
    revokedAt: revoked ? '2026-09-01T01:00:00.000Z' : null,
    status: revoked ? 'revoked' : 'pending',
    deliveryStatus: revoked ? 'revoked' : 'pending',
    nextCheckAt: '2026-09-01T00:00:30.000Z',
  });
  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({ json: actor }),
  );
  await page.route('**/api/companies', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );
  await page.route('**/api/workspace-invitations**', (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      expect(request.headers()['idempotency-key']).toBeTruthy();
      if (request.url().endsWith('/revoke')) revoked = true;
      else {
        expect(request.postDataJSON()).toEqual({
          email: 'recipient@example.test',
          expiresInDays: 7,
        });
        issued = true;
      }
      return route.fulfill({ status: 201, json: record() });
    }
    return route.fulfill({
      json: { invitations: issued ? [record()] : [], nextCursor: null },
    });
  });
  await page.goto('/');
  await page.getByLabel('Recipient email').fill('recipient@example.test');
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText('Invitation sent; awaiting use.')).toBeVisible();
  await expect(
    page.getByText(/An invitation does not grant membership/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Revoke invitation' }).click();
  expect(revoked).toBe(false);
  await page.getByRole('button', { name: 'Confirm revocation' }).click();
  await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Revoke invitation' }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('workspace-invitation-revoked.png'),
    fullPage: true,
  });
});
