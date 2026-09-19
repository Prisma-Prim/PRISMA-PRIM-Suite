import { expect, test } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';

const events = [
  {
    id: 'event-client-relationship',
    action: 'client_company_relationship.established',
    occurredAt: '2026-09-19T10:15:00.000Z',
    actor: {
      internalUserId: actorContextFixture.internalUserId,
      displayName: actorContextFixture.displayName,
    },
    target: {
      type: 'client_company_relationship',
      relationshipId: 'relationship-257',
      clientAccountId: 'client-257',
      clientDisplayName: 'North Star Consulting',
      companyId: 'company-257',
      companyDisplayName: 'PRISMA-PRIM',
    },
    metadata: {},
  },
  {
    id: 'event-document',
    action: 'document.registered',
    occurredAt: '2026-09-19T12:35:00.000Z',
    actor: {
      internalUserId: actorContextFixture.internalUserId,
      displayName: actorContextFixture.displayName,
    },
    target: {
      type: 'document',
      documentId: 'DOC-2026-0257',
    },
    metadata: {},
  },
  {
    id: 'event-company',
    action: 'company.registered',
    occurredAt: '2026-09-18T16:20:00.000Z',
    actor: {
      internalUserId: actorContextFixture.internalUserId,
      displayName: actorContextFixture.displayName,
    },
    target: {
      type: 'company',
      companyId: 'company-257',
      displayName: 'PRISMA-PRIM',
    },
    metadata: {},
  },
];

test('presents real Activity Log events in server order and preserves them across frames', async ({
  page,
}, testInfo) => {
  let activityReads = 0;
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    expect(request.method()).toBe('GET');
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({ json: actorContextFixture });
    if (path.endsWith('/activity-log')) {
      activityReads += 1;
      return route.fulfill({ json: { events } });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto('/?frame=prisme#activity');
  await expect(
    page.getByRole('heading', { name: 'Activity Log', exact: true }).first(),
  ).toBeVisible();

  const activity = page.getByRole('region', { name: 'Activity Log' });
  const rows = activity.getByRole('listitem');
  await expect(rows).toHaveCount(events.length);
  await expect(rows.nth(0)).toContainText(
    'Ada Ionescu linked a Client to a Company',
  );
  await expect(rows.nth(0)).toContainText(
    'Target: North Star Consulting — PRISMA-PRIM',
  );
  await expect(rows.nth(1)).toContainText(
    'Ada Ionescu registered a working Document reference',
  );
  await expect(rows.nth(2)).toContainText('Ada Ionescu registered a Company');
  await expect(rows.nth(0).getByRole('time')).toHaveAttribute(
    'datetime',
    events[0].occurredAt,
  );
  expect(activityReads).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.screenshot({
    path: testInfo.outputPath(
      `prisme-activity-log-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });

  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Use classic frame' }).click();
  await expect(page).toHaveURL(/\?frame=classic#activity$/);
  await expect(activity).toBeVisible();
  await expect(rows).toHaveCount(events.length);
  expect(activityReads).toBe(1);

  await page.getByRole('button', { name: 'Try Prisme' }).click();
  await expect(page).toHaveURL(/\/#activity$/);
  await expect(rows).toHaveCount(events.length);
  expect(activityReads).toBe(1);
});

test('keeps the real Activity Log loading and empty states distinct in Prisme', async ({
  page,
}) => {
  let releaseActivity: (() => void) | undefined;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({ json: actorContextFixture });
    if (path.endsWith('/activity-log')) {
      await new Promise<void>((resolve) => {
        releaseActivity = resolve;
      });
      return route.fulfill({ json: { events: [] } });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto('/?frame=prisme#activity');
  const activity = page.getByRole('region', { name: 'Activity Log' });
  await expect(activity.getByRole('status')).toHaveText('Loading activity…');
  if (!releaseActivity) throw new Error('Expected the Activity Log request.');
  releaseActivity();
  await expect(activity).toContainText(
    'No activity has been recorded in this workspace yet.',
  );
});

test('keeps the real Activity Log error state distinct in Prisme', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({ json: actorContextFixture });
    if (path.endsWith('/activity-log')) return route.fulfill({ status: 503 });
    return route.fulfill({ json: [] });
  });

  await page.goto('/?frame=prisme#activity');
  await expect(
    page.getByRole('region', { name: 'Activity Log' }).getByRole('alert'),
  ).toHaveText('We could not load the Activity Log. Please try again.');
});
