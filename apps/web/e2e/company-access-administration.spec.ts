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
  await page.route('**/api/companies', (route) =>
    route.fulfill({ json: [] }),
  );
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
    '**/api/company-director-client-assignments**',
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
  await expect(page.getByText(/Current server state:/)).toContainText('Granted');
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
  await expect(page.getByText(/Current server state:/)).toContainText('Granted');
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
        ...(contextGranted
          ? [assignment('Company Context Access', true)]
          : []),
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
