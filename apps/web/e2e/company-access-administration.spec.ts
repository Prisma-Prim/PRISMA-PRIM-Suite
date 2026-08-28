import { expect, test } from '@playwright/test';
import type { ActorContext } from '../src/access-types';

const ownerMembershipId = '00000000-0000-4000-8000-000000000002';
const memberId = '11111111-1111-4111-8111-111111111111';
const companyId = '22222222-2222-4222-8222-222222222222';

const ownerActor: ActorContext = {
  internalUserId: '00000000-0000-4000-8000-000000000001',
  workspaceMembershipId: ownerMembershipId,
  workspaceId: '00000000-0000-4000-8000-000000000003',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Ada Ionescu',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: ['company.assignment.manage'],
};

test('administers both existing Company access bundles by member and Company name', async ({
  page,
}) => {
  let contextGranted = false;
  let directorGranted = false;
  const events: Array<Record<string, unknown>> = [];

  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({ json: ownerActor }),
  );
  await page.route('**/api/companies', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events } }),
  );
  await page.route(
    '**/api/company-context-assignments/administration',
    (route) => route.fulfill({ json: administrationState() }),
  );
  await page.route(
    /\/api\/company-context-assignments(?:\/[^/]+\/[^/]+)?$/,
    async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (request.method() === 'POST') {
        expect(request.postDataJSON()).toEqual({
          workspaceMembershipId: memberId,
          companyId,
        });
        expect(request.headers()['idempotency-key']).toBeTruthy();
        contextGranted = true;
        recordEvent(
          'company_context_assignment.granted',
          'Company Context Access',
        );
        return route.fulfill({
          status: 201,
          json: assignment('Company Context Access', true),
        });
      }
      expect(request.method()).toBe('DELETE');
      expect(pathname).toContain(`/${memberId}/${companyId}`);
      contextGranted = false;
      recordEvent(
        'company_context_assignment.revoked',
        'Company Context Access',
      );
      return route.fulfill({
        json: assignment('Company Context Access', false),
      });
    },
  );
  await page.route(
    /\/api\/company-director-client-assignments(?:\/[^/]+\/[^/]+)?$/,
    async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (request.method() === 'POST') {
        expect(request.postDataJSON()).toEqual({
          workspaceMembershipId: memberId,
          companyId,
        });
        directorGranted = true;
        recordEvent(
          'company_director_client_assignment.granted',
          'Company Director Client Access',
        );
        return route.fulfill({
          status: 201,
          json: assignment('Company Director Client Access', true),
        });
      }
      expect(request.method()).toBe('DELETE');
      expect(pathname).toContain(`/${memberId}/${companyId}`);
      directorGranted = false;
      recordEvent(
        'company_director_client_assignment.revoked',
        'Company Director Client Access',
      );
      return route.fulfill({
        json: assignment('Company Director Client Access', false),
      });
    },
  );

  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Company access' }),
  ).toBeVisible();
  await page.getByLabel('Workspace member').selectOption({
    label: 'Mila Popescu — mila@example.test',
  });
  await page
    .getByLabel('Company', { exact: true })
    .selectOption({ label: 'BIC' });
  await expect(page.getByText(/Current server state:/)).toContainText(
    'Not granted',
  );
  await expect(page.getByText(memberId)).toHaveCount(0);
  await expect(page.getByText(companyId)).toHaveCount(0);

  await page.getByRole('button', { name: 'Grant access' }).click();
  await expect(page.getByText(/Current server state:/)).toContainText(
    'Granted',
  );
  await expect(
    page.getByText('Access granted. Server state refreshed.'),
  ).toBeVisible();
  await expect(
    page.getByText('Ada Ionescu granted Company Context Access'),
  ).toBeVisible();
  await expect(page.getByText('Target: Mila Popescu — BIC')).toBeVisible();

  await page.getByRole('button', { name: 'Revoke access' }).click();
  await expect(page.getByText(/Current server state:/)).toContainText(
    'Not granted',
  );
  await expect(
    page.getByText('Ada Ionescu revoked Company Context Access'),
  ).toBeVisible();

  await page
    .getByLabel('Access bundle')
    .selectOption({ label: 'Company Director Client Access' });
  await expect(page.getByText(/Current server state:/)).toContainText(
    'Not granted',
  );
  await page.getByRole('button', { name: 'Grant access' }).click();
  await expect(page.getByText(/Current server state:/)).toContainText(
    'Granted',
  );
  await expect(
    page.getByText('Ada Ionescu granted Company Director Client Access'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Revoke access' }).click();
  await expect(page.getByText(/Current server state:/)).toContainText(
    'Not granted',
  );
  await expect(
    page.getByText('Ada Ionescu revoked Company Director Client Access'),
  ).toBeVisible();

  function administrationState() {
    return {
      members: [
        {
          workspaceMembershipId: ownerMembershipId,
          displayName: 'Ada Ionescu',
          email: 'ada@example.test',
        },
        {
          workspaceMembershipId: memberId,
          displayName: 'Mila Popescu',
          email: 'mila@example.test',
        },
      ],
      companies: [{ id: companyId, displayName: 'BIC' }],
      assignments: [
        ...(contextGranted ? [assignment('Company Context Access', true)] : []),
        ...(directorGranted
          ? [assignment('Company Director Client Access', true)]
          : []),
      ],
    };
  }

  function assignment(
    bundle: 'Company Context Access' | 'Company Director Client Access',
    active: boolean,
  ) {
    return {
      id:
        bundle === 'Company Context Access'
          ? '33333333-3333-4333-8333-333333333333'
          : '44444444-4444-4444-8444-444444444444',
      workspaceMembershipId: memberId,
      companyId,
      bundle,
      active,
    };
  }

  function recordEvent(action: string, bundle: string) {
    events.unshift({
      id: `55555555-5555-4555-8555-${String(events.length + 1).padStart(12, '0')}`,
      action,
      occurredAt: `2026-08-26T06:1${events.length}:00.000Z`,
      actor: {
        internalUserId: ownerActor.internalUserId,
        displayName: ownerActor.displayName,
      },
      target: {
        type: 'company_role_assignment',
        assignmentId: '33333333-3333-4333-8333-333333333333',
        companyId,
        companyDisplayName: 'BIC',
        workspaceMembershipId: memberId,
        internalUserId: '66666666-6666-4666-8666-666666666666',
        internalUserDisplayName: 'Mila Popescu',
      },
      metadata: { bundle },
    });
  }
});

test('confirms Workspace suspension and leaves active state after self-suspension', async ({
  page,
}, testInfo) => {
  let memberActive = true;
  let suspensionCommands = 0;
  const events: Array<Record<string, unknown>> = [];

  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({ json: ownerActor }),
  );
  await page.route('**/api/companies', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events } }),
  );
  await page.route(
    '**/api/company-context-assignments/administration',
    (route) =>
      route.fulfill({
        json: {
          members: [
            {
              workspaceMembershipId: ownerMembershipId,
              displayName: 'Ada Ionescu',
              email: 'ada@example.test',
            },
            ...(memberActive
              ? [
                  {
                    workspaceMembershipId: memberId,
                    displayName: 'Mila Popescu',
                    email: 'mila@example.test',
                  },
                ]
              : []),
          ],
          companies: [],
          assignments: [],
        },
      }),
  );
  await page.route('**/api/workspace-membership-suspensions', async (route) => {
    const request = route.request();
    expect(request.method()).toBe('POST');
    expect(request.headers()['idempotency-key']).toBeTruthy();
    const target = request.postDataJSON().workspaceMembershipId as string;
    suspensionCommands += 1;
    if (target === memberId) {
      memberActive = false;
      events.unshift({
        id: '55555555-5555-4555-8555-555555555555',
        action: 'workspace_membership.suspended',
        occurredAt: '2026-08-28T22:30:00.000Z',
        actor: {
          internalUserId: ownerActor.internalUserId,
          displayName: ownerActor.displayName,
        },
        target: {
          type: 'workspace_membership',
          workspaceMembershipId: memberId,
          internalUserId: '66666666-6666-4666-8666-666666666666',
          displayName: 'Mila Popescu',
        },
        metadata: {},
      });
    }
    return route.fulfill({
      status: 201,
      json: { workspaceMembershipId: target, status: 'inactive' },
    });
  });

  await page.goto('/');
  await page
    .getByLabel('Member to suspend')
    .selectOption({ label: 'Mila Popescu — mila@example.test' });
  await page.getByRole('button', { name: 'Review suspension' }).click();
  await expect(
    page.getByRole('region', {
      name: 'Confirm Workspace access suspension',
    }),
  ).toContainText('Mila Popescu — mila@example.test');
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(suspensionCommands).toBe(0);

  await page.getByRole('button', { name: 'Review suspension' }).click();
  await page.getByRole('button', { name: 'Suspend access' }).click();
  await expect(
    page.getByText('Member suspended. Server state refreshed.'),
  ).toBeVisible();
  await expect(
    page.getByText('Ada Ionescu suspended Workspace access for'),
  ).toBeVisible();
  await expect(page.getByText('Target: Mila Popescu')).toBeVisible();
  await expect(
    page
      .getByLabel('Member to suspend')
      .getByRole('option', { name: 'Mila Popescu — mila@example.test' }),
  ).toHaveCount(0);
  expect(suspensionCommands).toBe(1);
  await page.screenshot({
    path: testInfo.outputPath(
      `workspace-membership-suspension-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });

  await page
    .getByLabel('Member to suspend')
    .selectOption({ label: 'Ada Ionescu — ada@example.test' });
  await page.getByRole('button', { name: 'Review suspension' }).click();
  await page.getByRole('button', { name: 'Suspend access' }).click();
  await expect(
    page.getByRole('alert').filter({
      hasText: 'Your access to this workspace is inactive.',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Company access' }),
  ).toHaveCount(0);
  expect(suspensionCommands).toBe(2);
});

test('leaves an already-open shell when the next protected request confirms peer suspension', async ({
  page,
}, testInfo) => {
  let actorRequests = 0;
  await page.route('**/api/access/current-actor', (route) => {
    actorRequests += 1;
    return actorRequests === 1
      ? route.fulfill({ json: ownerActor })
      : route.fulfill({ status: 403, json: { message: 'Forbidden' } });
  });
  await page.route('**/api/companies', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );
  await page.route(
    '**/api/company-context-assignments/administration',
    (route) => route.fulfill({ status: 403, json: { message: 'Forbidden' } }),
  );

  await page.goto('/');

  await expect(
    page.getByRole('alert').filter({
      hasText: 'Your access to this workspace is inactive.',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Company access' }),
  ).toHaveCount(0);
  expect(actorRequests).toBe(2);
  await page.screenshot({
    path: testInfo.outputPath(
      `workspace-membership-peer-suspension-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});

test('recovers from a stale suspension target without reporting success', async ({
  page,
}, testInfo) => {
  let targetIsStale = false;
  let administrationRequests = 0;
  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({ json: ownerActor }),
  );
  await page.route('**/api/companies', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );
  await page.route(
    '**/api/company-context-assignments/administration',
    (route) => {
      administrationRequests += 1;
      return route.fulfill({
        json: {
          members: [
            {
              workspaceMembershipId: ownerMembershipId,
              displayName: 'Ada Ionescu',
              email: 'ada@example.test',
            },
            ...(targetIsStale
              ? []
              : [
                  {
                    workspaceMembershipId: memberId,
                    displayName: 'Mila Popescu',
                    email: 'mila@example.test',
                  },
                ]),
          ],
          companies: [],
          assignments: [],
        },
      });
    },
  );
  await page.route('**/api/workspace-membership-suspensions', (route) => {
    targetIsStale = true;
    return route.fulfill({ status: 403, json: { message: 'Forbidden' } });
  });

  await page.goto('/');
  await page
    .getByLabel('Member to suspend')
    .selectOption({ label: 'Mila Popescu — mila@example.test' });
  await page.getByRole('button', { name: 'Review suspension' }).click();
  await page.getByRole('button', { name: 'Suspend access' }).click();

  await expect(
    page.getByRole('alert').filter({
      hasText:
        'The suspension could not be completed. Server state was refreshed.',
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Member suspended. Server state refreshed.'),
  ).toHaveCount(0);
  await expect(
    page
      .getByLabel('Member to suspend')
      .getByRole('option', { name: 'Mila Popescu — mila@example.test' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Company access' }),
  ).toBeVisible();
  expect(administrationRequests).toBe(2);
  await page.screenshot({
    path: testInfo.outputPath(
      `workspace-membership-stale-suspension-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});
