import { openSelect, selectOption } from './select-option';
import { expect, test } from '@playwright/test';
import type { ActorContext } from '../src/access-types';

const ownerMembershipId = '00000000-0000-4000-8000-000000000002';
const memberId = '11111111-1111-4111-8111-111111111111';
const companyId = '22222222-2222-4222-8222-222222222222';
const capturedVersionExplanation =
  'The version is captured when access is granted. A later version applies only after this access is revoked and granted again.';

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
}, testInfo) => {
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

  await page.goto('/?frame=prisme#access');
  const access = page.getByRole('region', { name: 'Company access' });
  await expect(access).toHaveClass(/company-access--prisme/);
  await expect(
    page.getByRole('heading', { name: 'Company access' }),
  ).toBeVisible();
  await selectTargets('Company Context Access');
  await expect(page.getByText(/Current server state:/)).toContainText(
    'Not granted',
  );
  await expect(page.getByText(memberId)).toHaveCount(0);
  await expect(page.getByText(companyId)).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const grant = page.getByRole('button', { name: 'Grant access' });
  await page.getByLabel('Access bundle').press('Tab');
  await expect(grant).toBeFocused();
  expect(
    await grant.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe('solid');
  await grant.click();
  await expect(page.getByText(/Current server state:/)).toHaveText(
    'Current server state: Granted',
  );
  await expect(page.getByText(capturedVersionExplanation)).toHaveCount(0);
  await expect(
    page.getByText('Access granted. Server state refreshed.'),
  ).toBeVisible();
  await page.goto('/?frame=prisme#activity');
  await expect(
    page.getByText('Ada Ionescu granted Company Context Access'),
  ).toBeVisible();
  await expect(page.getByText('Target: Mila Popescu — BIC')).toBeVisible();
  await page.goto('/?frame=prisme#access');
  const memberSelect = page.getByLabel('Workspace member');
  await memberSelect.click();
  await expect(
    page.getByRole('listbox', { name: 'Workspace member' }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      `company-access-member-select-open-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  const bundleSelect = page.getByLabel('Access bundle');
  await bundleSelect.click();
  await expect(
    page.getByRole('listbox', { name: 'Access bundle' }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      `company-access-bundle-select-open-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await selectTargets('Company Context Access');

  await page.getByRole('button', { name: 'Revoke access' }).click();
  await expect(page.getByText(/Current server state:/)).toContainText(
    'Not granted',
  );
  await page.goto('/?frame=prisme#activity');
  await expect(
    page.getByText('Ada Ionescu revoked Company Context Access'),
  ).toBeVisible();
  await page.goto('/?frame=prisme#access');
  await selectTargets('Company Director Client Access');
  await expect(page.getByText(/Current server state:/)).toContainText(
    'Not granted',
  );
  await page.getByRole('button', { name: 'Grant access' }).click();
  await expect(page.getByText(/Current server state:/)).toHaveText(
    'Current server state: Granted — captured version v2',
  );
  await expect(page.getByText(capturedVersionExplanation)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(
      `company-access-captured-version-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
  await page.goto('/?frame=prisme#activity');
  await expect(
    page.getByText('Ada Ionescu granted Company Director Client Access'),
  ).toBeVisible();
  await page.goto('/?frame=prisme#access');
  await selectTargets('Company Director Client Access');

  await page.getByRole('button', { name: 'Revoke access' }).click();
  await expect(page.getByText(/Current server state:/)).toContainText(
    'Not granted',
  );
  await page.goto('/?frame=prisme#activity');
  await expect(
    page.getByText('Ada Ionescu revoked Company Director Client Access'),
  ).toBeVisible();
  await page.goto('/?frame=prisme#access');
  await expect(access).toHaveClass(/company-access--prisme/);
  await page.screenshot({
    path: testInfo.outputPath(`company-access-${testInfo.project.name}.png`),
    fullPage: true,
  });

  async function selectTargets(
    bundle: 'Company Context Access' | 'Company Director Client Access',
  ) {
    await selectOption(page.getByLabel('Workspace member'), {
      label: 'Mila Popescu — mila@example.test',
    });
    await selectOption(page.getByLabel('Company', { exact: true }), {
      label: 'BIC',
    });
    await selectOption(page.getByLabel('Access bundle'), { label: bundle });
  }

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
      permissionSetVersion: bundle === 'Company Context Access' ? null : 'v2',
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

  await page.goto('/?frame=prisme#access');
  await selectOption(page.getByLabel('Member to suspend'), {
    label: 'Mila Popescu — mila@example.test',
  });
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
  await page.goto('/?frame=prisme#activity');
  await expect(
    page.getByText('Ada Ionescu suspended Workspace access for'),
  ).toBeVisible();
  await expect(page.getByText('Target: Mila Popescu')).toBeVisible();
  await page.goto('/?frame=prisme#access');
  const suspensionMember = page.getByLabel('Member to suspend');
  const suspensionChoices = await openSelect(suspensionMember);
  await expect(
    suspensionChoices.getByRole('option', {
      name: 'Mila Popescu — mila@example.test',
    }),
  ).toHaveCount(0);
  await suspensionMember.press('Escape');
  expect(suspensionCommands).toBe(1);
  await page.screenshot({
    path: testInfo.outputPath(
      `workspace-membership-suspension-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });

  await selectOption(page.getByLabel('Member to suspend'), {
    label: 'Ada Ionescu — ada@example.test',
  });
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

  await page.goto('/?frame=prisme#access');

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

test('recovers from last-holder suspension protection without reporting success', async ({
  page,
}, testInfo) => {
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
            {
              workspaceMembershipId: memberId,
              displayName: 'Mila Popescu',
              email: 'mila@example.test',
            },
          ],
          companies: [],
          assignments: [],
        },
      });
    },
  );
  await page.route('**/api/workspace-membership-suspensions', (route) => {
    return route.fulfill({ status: 409, json: { message: 'Conflict' } });
  });

  await page.goto('/?frame=prisme#access');
  await selectOption(page.getByLabel('Member to suspend'), {
    label: 'Mila Popescu — mila@example.test',
  });
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
  const suspensionMember = page.getByLabel('Member to suspend');
  const suspensionChoices = await openSelect(suspensionMember);
  await expect(
    suspensionChoices.getByRole('option', {
      name: 'Mila Popescu — mila@example.test',
    }),
  ).toHaveCount(1);
  await suspensionMember.press('Escape');
  await expect(
    page.getByRole('heading', { name: 'Company access' }),
  ).toBeVisible();
  expect(administrationRequests).toBe(2);
  await page.getByRole('heading', { name: 'Team & access' }).focus();
  await expect(page.locator('.prisme-skip-link')).not.toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath(
      `workspace-membership-last-holder-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});

test('keeps suspension committed while provider-session revocation fails and retries safely', async ({
  page,
}, testInfo) => {
  let complete = false;
  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({ json: ownerActor }),
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

  await page.goto('/?frame=prisme#access');
  await page.getByRole('button', { name: 'Check session revocations' }).click();
  const record = page.getByRole('listitem').filter({
    hasText: 'Suspended Member',
  });
  await expect(record).toHaveAttribute('data-status', 'retry_required');
  await expect(
    record.getByText(
      'Session revocation needs another attempt. Retry after 30 seconds.',
      { exact: true },
    ),
  ).toBeVisible();
  const retry = record.getByRole('button', {
    name: 'Retry session revocation',
  });
  await retry.focus();
  await expect(retry).toBeFocused();
  await retry.click();
  await expect(record).toHaveAttribute('data-status', 'complete');
  await expect(
    record.getByText(
      'Existing provider sessions revoked. Workspace access remains suspended.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    record.getByRole('button', { name: 'Retry session revocation' }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(
      `workspace-session-revocation-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});
