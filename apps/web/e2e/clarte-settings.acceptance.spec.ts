import { expect, test, type Page, type Route } from '@playwright/test';
import { companyGrants } from '../src/access/company-grants.test-fixture';
import { actorContextFixture } from './actor-context.fixture';
import { isPhoneLayout, openClarte, openClarteEntry } from './clarte.fixture';

// Every API response is intercepted: a fictional Workspace, no live backend.
const primary = {
  id: '00000000-0000-4000-8000-000000001546',
  displayName: 'PRISMA-PRIM',
};
const other = {
  id: '00000000-0000-4000-8000-000000001547',
  displayName: 'BIC',
};
const companies = [primary, other].map((company) => ({
  ...company,
  workspaceId: actorContextFixture.workspaceId,
  status: 'active',
  createdAt: '2026-11-20T09:00:00.000Z',
  createdByInternalUserId: actorContextFixture.internalUserId,
}));
const ion = {
  workspaceMembershipId: '00000000-0000-4000-8000-000000002001',
  displayName: 'Ion Popa',
  email: 'ion.popa@example.test',
};
const maria = {
  workspaceMembershipId: '00000000-0000-4000-8000-000000002002',
  displayName: 'Maria Rusu',
  email: 'maria.rusu@example.test',
};
const suspended = '00000000-0000-4000-8000-000000002009';
const requestId = '00000000-0000-4000-8000-000000004001';

/** A fictional Workspace administrator who also reads the Company's Requests. */
function administrator() {
  return {
    ...actorContextFixture,
    workspacePermissions: [
      'company.manage',
      'company.assignment.manage',
      'member.invite',
    ],
    activeCompany: {
      ...primary,
      grants: companyGrants(
        {
          bundle: 'company_director_client_access',
          version: 'v1',
          assignmentId: '00000000-0000-4000-8000-000000001701',
        },
        {
          bundle: 'company_commercial_intake',
          version: 'v1',
          assignmentId: '00000000-0000-4000-8000-000000001702',
        },
        {
          bundle: 'company_offer_approver',
          version: 'v1',
          assignmentId: '00000000-0000-4000-8000-000000001703',
        },
      ),
    },
  };
}

function invitation(index: number, email: string) {
  return {
    id: `00000000-0000-4000-8000-00000000300${index}`,
    email,
    status: 'pending',
    deliveryStatus: 'pending',
    expiresAt: '2026-12-12T10:00:00.000Z',
    createdAt: '2026-11-28T10:00:00.000Z',
    revokedAt: null,
    consumedAt: null,
    nextCheckAt: '2026-11-28T10:05:00.000Z',
  };
}

/** A stateful fake of the administration commands this journey sends. */
async function serveAdministrator(page: Page) {
  const members = [ion, maria];
  const assignments = [
    {
      id: '00000000-0000-4000-8000-000000005001',
      workspaceMembershipId: ion.workspaceMembershipId,
      companyId: primary.id,
      active: true,
      bundle: 'Company Context Access',
      permissionSetVersion: null,
    },
    {
      id: '00000000-0000-4000-8000-000000005002',
      workspaceMembershipId: ion.workspaceMembershipId,
      companyId: primary.id,
      active: true,
      bundle: 'Company Ideas Reader',
      permissionSetVersion: 'v1',
    },
  ];
  const invitations = [invitation(1, 'elena.ceban@example.test')];
  let revocation = 'retry_required';
  const writes: string[] = [];
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (method !== 'GET') writes.push(`${method} ${path}`);
    if (path === '/api/access/current-actor')
      return route.fulfill({ json: administrator() });
    if (path === '/api/companies') return route.fulfill({ json: companies });
    if (path === '/api/activity-log')
      return route.fulfill({
        json: {
          events: [
            {
              id: 'event-offer',
              action: 'offer.created',
              occurredAt: '2026-11-27T10:03:00.000Z',
              actor: {
                internalUserId: actorContextFixture.internalUserId,
                displayName: actorContextFixture.displayName,
              },
              target: {
                type: 'offer_version',
                offerVersionId: '00000000-0000-4000-8000-000000004002',
                versionNumber: 1,
                illustrativeReference: 7,
                opportunityId: '00000000-0000-4000-8000-000000004003',
                clientRequestId: requestId,
                companyId: primary.id,
              },
              metadata: {},
            },
            {
              id: 'event-company',
              action: 'company.registered',
              occurredAt: '2026-11-26T09:00:00.000Z',
              actor: {
                internalUserId: actorContextFixture.internalUserId,
                displayName: actorContextFixture.displayName,
              },
              target: {
                type: 'company',
                companyId: other.id,
                displayName: other.displayName,
              },
            },
          ],
        },
      });
    if (path === '/api/operational-home')
      return route.fulfill({
        json: { companyId: primary.id, today: '2026-11-28', summaries: [] },
      });
    if (path === '/api/clients') return route.fulfill({ json: [] });
    if (path === '/api/client-duplicate-reviews')
      return route.fulfill({ json: { items: [], next_cursor: null } });
    if (path === '/api/company-context-assignments/administration')
      return route.fulfill({
        json: { members, companies: [primary, other], assignments },
      });
    if (path === '/api/company-ideas-recorder-assignments') {
      assignments.push({
        id: '00000000-0000-4000-8000-000000005003',
        workspaceMembershipId: ion.workspaceMembershipId,
        companyId: primary.id,
        active: true,
        bundle: 'Company Ideas Recorder',
        permissionSetVersion: 'v1',
      });
      return route.fulfill({ json: { id: assignments.at(-1)?.id } });
    }
    if (
      path ===
      `/api/company-ideas-reader-assignments/${ion.workspaceMembershipId}/${primary.id}`
    ) {
      const reader = assignments.find(
        (assignment) => assignment.bundle === 'Company Ideas Reader',
      );
      if (reader) reader.active = false;
      return route.fulfill({ json: { id: reader?.id, active: false } });
    }
    if (path === '/api/workspace-membership-suspensions') {
      members.splice(members.indexOf(maria), 1);
      return route.fulfill({
        json: {
          workspaceMembershipId: maria.workspaceMembershipId,
          status: 'inactive',
        },
      });
    }
    if (path === '/api/workspace-session-revocations')
      return route.fulfill({
        json: {
          records: [
            {
              workspaceMembershipId: suspended,
              displayName: 'Dan Cojocaru',
              status: revocation,
            },
          ],
          nextCursor: null,
        },
      });
    if (path === `/api/workspace-session-revocations/${suspended}/retry`) {
      revocation = 'complete';
      return route.fulfill({ json: { status: 'checked' } });
    }
    if (path === '/api/workspace-invitations' && method === 'GET')
      return route.fulfill({ json: { invitations, nextCursor: null } });
    if (path === '/api/workspace-invitations' && method === 'POST') {
      const sent = invitation(2, 'natalia.rusu@example.test');
      invitations.unshift(sent);
      return route.fulfill({ json: sent });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  return writes;
}

async function screenshot(page: Page, name: string) {
  // No screen of the console scrolls the page sideways.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath(`${name}.png`),
    fullPage: false,
  });
}

function screenTitle(page: Page) {
  return page.getByRole('heading', { level: 1 });
}

/** The console's list on desktop; on phone the home is the list, reached by the back link. */
async function openSection(page: Page, section: string) {
  if (isPhoneLayout(page)) {
    if (!page.url().endsWith('#settings'))
      await page.getByRole('link', { name: 'All settings' }).click();
    await page
      .getByRole('region', { name: 'All settings' })
      .getByRole('link', { name: new RegExp(`^${section}`, 'u') })
      .click();
  } else {
    await page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('link', { name: section, exact: true })
      .click();
  }
  await expect(
    page.getByRole('region', { name: section, exact: true }),
  ).toBeVisible();
}

test('administers access from the Settings console and switches the interface language', async ({
  page,
}) => {
  const writes = await serveAdministrator(page);
  await openClarte(page, '/');
  await openClarteEntry(page, 'Settings');

  await expect(page).toHaveURL(/#settings$/u);
  await expect(screenTitle(page)).toHaveText('Settings');
  const home = page.getByRole('region', { name: 'All settings' });
  // Access sections, plus Sales stages and Procedure deadlines (#1547).
  await expect(home.getByRole('link')).toHaveCount(7);
  await expect(
    page.getByRole('navigation', { name: 'Settings sections' }),
  ).toBeVisible({ visible: !isPhoneLayout(page) });
  await screenshot(page, 'clarte-settings-home');

  // Invitations: invite by e-mail for 14 days.
  await openSection(page, 'Invitations');
  await expect(page.getByText('elena.ceban@example.test')).toBeVisible();
  await page.getByRole('button', { name: 'Invite a person' }).click();
  const form = page.getByRole('dialog', { name: 'Invite a person' });
  await form.getByLabel('Recipient email').fill('natalia.rusu@example.test');
  await form.getByLabel('Expires in days').fill('14');
  await form.getByRole('button', { name: 'Send invitation' }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByText('natalia.rusu@example.test')).toBeVisible();
  await screenshot(page, 'clarte-settings-invitations');

  // Team and rights: revoke and grant a rights set, then suspend a member.
  await openSection(page, 'Team & access');
  const team = page.getByRole('region', { name: 'Team & access', exact: true });
  await expect(team.getByRole('button', { name: 'Ion Popa' })).toBeVisible();
  await screenshot(page, 'clarte-settings-team');
  await team.getByRole('button', { name: 'Ion Popa' }).click();
  const panel = page.getByRole('dialog', { name: 'Ion Popa' });
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole('button', { name: primary.displayName }),
  ).toHaveAttribute('aria-pressed', 'true');
  await screenshot(page, 'clarte-settings-member');
  await panel
    .getByRole('button', { name: 'Revoke access — Ideas Reader' })
    .click();
  await expect(
    panel.getByText('Access revoked. Server state refreshed.'),
  ).toBeVisible();
  await panel
    .getByRole('button', { name: 'Grant access — Ideas Recorder' })
    .click();
  await expect(
    panel.getByText('Access granted. Server state refreshed.'),
  ).toBeVisible();
  await expect(
    panel
      .getByRole('region', { name: 'Ideas and Operational Risks' })
      .getByRole('listitem')
      .filter({ hasText: 'Ideas Recorder' }),
  ).toContainText('Granted — captured version v1');
  await panel.getByRole('button', { name: 'Close' }).click();

  await team.getByRole('button', { name: 'Maria Rusu' }).click();
  await page
    .getByRole('dialog', { name: 'Maria Rusu' })
    .getByRole('tab', { name: 'Workspace access' })
    .click();
  await page
    .getByRole('dialog', { name: 'Maria Rusu' })
    .getByRole('button', { name: 'Review suspension' })
    .click();
  const confirmation = page.getByRole('alertdialog', {
    name: 'Confirm Workspace access suspension',
  });
  await expect(
    confirmation.getByRole('button', { name: 'Cancel' }),
  ).toBeFocused();
  await confirmation.getByRole('button', { name: 'Suspend access' }).click();
  await expect(
    team.getByText('Member suspended. Server state refreshed.'),
  ).toBeVisible();
  await expect(team.getByRole('button', { name: 'Maria Rusu' })).toHaveCount(0);
  const sessions = team.getByRole('region', {
    name: 'Identity-provider sessions',
  });
  await sessions
    .getByRole('button', { name: 'Check session revocations' })
    .click();
  await sessions
    .getByRole('button', { name: 'Retry session revocation' })
    .click();
  await expect(sessions.getByText('Complete', { exact: true })).toBeVisible();

  // Activity Log: open the Offer Version from its row.
  await openSection(page, 'Activity Log');
  const log = page.getByRole('region', { name: 'Activity Log', exact: true });
  await expect(log.getByText('Ada Ionescu registered a Company')).toBeVisible();
  await screenshot(page, 'clarte-settings-activity');
  await log.getByRole('button', { name: 'Open Offer Version' }).click();
  await expect(page).toHaveURL(/#requests$/u);
  await expect(screenTitle(page)).toHaveText('Affaires');

  // Language and region: French, as in the user menu.
  await openClarteEntry(page, 'Settings');
  await openSection(page, 'Language and region');
  await page
    .getByRole('group', { name: 'Your interface language' })
    .getByRole('radio', { name: /Français/u })
    .check();
  await expect(screenTitle(page)).toHaveText('Paramètres');
  await expect(
    page.getByRole('region', { name: 'Langue et région' }),
  ).toContainText('41');
  await screenshot(page, 'clarte-settings-language');

  expect(writes).toEqual([
    'POST /api/workspace-invitations',
    `DELETE /api/company-ideas-reader-assignments/${ion.workspaceMembershipId}/${primary.id}`,
    'POST /api/company-ideas-recorder-assignments',
    'POST /api/workspace-membership-suspensions',
    `POST /api/workspace-session-revocations/${suspended}/retry`,
  ]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
