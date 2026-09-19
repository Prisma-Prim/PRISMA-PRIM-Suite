import { expect, test } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';

test('an administrator sees a provider failure and safely retries session revocation', async ({
  page,
}, testInfo) => {
  const memberId = '11111111-1111-4111-8111-111111111111';
  let complete = false;
  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({
      json: {
        ...actorContextFixture,
        workspacePermissions: ['company.assignment.manage'],
      },
    }),
  );
  await page.route('**/api/companies', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );
  await page.route(
    '**/api/company-context-assignments/administration',
    (route) =>
      route.fulfill({ json: { members: [], companies: [], assignments: [] } }),
  );
  await page.route(
    /\/api\/workspace-session-revocations(?:\/[^/]+\/retry)?$/,
    (route) => {
      if (route.request().method() === 'POST') {
        expect(new URL(route.request().url()).pathname).toBe(
          `/api/workspace-session-revocations/${memberId}/retry`,
        );
        complete = true;
        return route.fulfill({ status: 201, json: { status: 'checked' } });
      }
      return route.fulfill({
        json: {
          records: [
            {
              workspaceMembershipId: memberId,
              displayName: 'Suspended Member',
              status: complete ? 'complete' : 'retry_required',
            },
          ],
          nextCursor: null,
        },
      });
    },
  );
  await page.goto('/?frame=classic');
  await page.getByRole('button', { name: 'Check session revocations' }).click();
  await expect(
    page.getByText(
      'Session revocation needs another attempt. Retry after 30 seconds.',
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry session revocation' }).click();
  await expect(
    page.getByText(
      'Existing provider sessions revoked. Workspace access remains suspended.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retry session revocation' }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('session-revocation.png'),
    fullPage: true,
  });
});
