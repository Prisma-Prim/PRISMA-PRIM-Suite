import { expect, test, type Page, type Route } from '@playwright/test';
import { companyGrants } from '../src/access/company-grants.test-fixture';
import {
  paymentEvidenceActor,
  paymentEvidenceDocument,
  paymentEvidenceIds,
} from '../src/payment-evidence/payment-evidence.test-fixture';
import { actorContextFixture } from './actor-context.fixture';
import {
  clarteJumpField,
  isPhoneLayout,
  openClarte,
  openClarteEntry,
} from './clarte.fixture';
import { selectOption } from './select-option';

// Every API response is intercepted: fictional data, no live backend.
const primary = {
  id: '00000000-0000-4000-8000-000000001530',
  displayName: 'PRISMA-PRIM',
};
const other = {
  id: '00000000-0000-4000-8000-000000001531',
  displayName: 'BIC',
};
const companies = [primary, other].map((company) => ({
  ...company,
  workspaceId: actorContextFixture.workspaceId,
  status: 'active',
  createdAt: '2026-11-20T09:00:00.000Z',
  createdByInternalUserId: actorContextFixture.internalUserId,
}));
const events = ['one', 'two', 'three', 'four', 'five', 'six'].map(
  (label, index) => ({
    id: `event-${label}`,
    action: 'company.registered',
    occurredAt: `2026-11-27T09:0${9 - index}:00.000Z`,
    actor: {
      internalUserId: actorContextFixture.internalUserId,
      displayName: actorContextFixture.displayName,
    },
    target: {
      type: 'company',
      companyId: `00000000-0000-4000-8000-00000000160${index}`,
      displayName: `Fictional Company ${label}`,
    },
  }),
);

/** A fictional tester with broad grants, so every entry has screens. */
function testerIn(company: { id: string; displayName: string }) {
  return {
    ...actorContextFixture,
    workspacePermissions: [
      'company.manage',
      'company.assignment.manage',
      'member.invite',
      'client.manage',
    ],
    activeCompany: {
      ...company,
      grants: companyGrants(
        ...(
          [
            'company_director_client_access',
            'company_project_access',
            'company_task_manager',
            'company_commercial_intake',
            'company_ideas_reader',
            'company_operational_risk_reader',
            'company_payment_reader',
            'company_invoice_reader',
            'company_knowledge_evidence_reader',
            'company_document_registrar',
            'company_document_content_reader',
          ] as const
        ).map((bundle, index) => ({
          bundle,
          version: 'v1' as const,
          assignmentId: `00000000-0000-4000-8000-0000000017${String(index).padStart(2, '0')}`,
        })),
        {
          bundle: 'company_internal_task_manager',
          version: 'v1',
          assignmentId: '00000000-0000-4000-8000-000000001799',
        },
      ),
      paymentObservationReadCapture: `payment-observation-read.v1.${'a'.repeat(64)}`,
      invoiceRecordReadCapture: `invoice-record-read.v1.${'b'.repeat(64)}`,
    },
  };
}

const lists: Readonly<Record<string, unknown>> = {
  '/api/clients': [],
  '/api/client-duplicate-reviews': { items: [], next_cursor: null },
  '/api/projects': [],
  '/api/documents': [],
  '/api/assigned-tasks': [],
  '/api/workspace-invitations': { invitations: [], nextCursor: null },
  '/api/company-context-assignments/administration': {
    members: [],
    companies: [],
    assignments: [],
  },
};

async function serveTester(page: Page) {
  const unhandled = new Set<string>();
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const companyId = request.headers()['x-company-context-id'];
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: testerIn(companyId === other.id ? other : primary),
      });
    if (path === '/api/companies') return route.fulfill({ json: companies });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events } });
    if (path === '/api/operational-home')
      return route.fulfill({
        json: {
          companyId: companyId ?? primary.id,
          today: '2026-11-27',
          summaries: [
            { kind: 'active_clients', count: 3 },
            { kind: 'open_projects', count: 2 },
            { kind: 'overdue_tasks', count: 0 },
          ],
        },
      });
    if (path in lists) return route.fulfill({ json: lists[path] });
    unhandled.add(`${request.method()} ${path}`);
    return route.fulfill({ status: 404, json: {} });
  });
  return unhandled;
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: test.info().outputPath(`${name}.png`),
    fullPage: false,
  });
}

function screenTitle(page: Page) {
  return page.getByRole('heading', { level: 1 });
}

test('opens Clarté for an opted-in tester, keeps the choice and leaves it from the user menu', async ({
  page,
}) => {
  await serveTester(page);
  await openClarte(page, '/?source=kept#clients');

  expect(new URL(page.url()).search).toBe('?source=kept');
  await expect(screenTitle(page)).toHaveText('Clients');
  await expect(
    page.getByRole('combobox', { name: 'Interface language' }),
  ).toHaveCount(0);
  await screenshot(page, 'clarte-clients');

  await page.reload();
  await expect(clarteJumpField(page)).toBeVisible();
  await page.goto('/#documents');
  await expect(screenTitle(page)).toHaveText('Documents');

  await page.getByRole('button', { name: 'User menu' }).click();
  await screenshot(page, 'clarte-user-menu');
  await page
    .getByRole('button', { name: 'Leave the Clarté interface' })
    .click();
  await expect(page.locator('.prisme-shell')).toBeVisible();
  await expect(clarteJumpField(page)).toHaveCount(0);
  await expect(
    page.getByRole('combobox', { name: 'Interface language' }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator('.prisme-shell')).toBeVisible();
  await expect(page.locator('.clarte-frame')).toHaveCount(0);
});

test('reaches every authorized entry and tab from the menu and the jump list', async ({
  page,
}) => {
  const unhandled = await serveTester(page);
  await openClarte(page, '/');
  await expect(screenTitle(page)).toHaveText('Today');
  await expect(
    page.getByRole('region', { name: 'Company summary' }),
  ).toBeVisible();
  await screenshot(page, 'clarte-today');

  const walk: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['Affaires', ['Client Requests']],
    ['Clients', ['Clients']],
    ['Missions and audits', ['Projects']],
    [
      'Tasks',
      [
        'My Tasks',
        'Unassigned Tasks',
        'Blocked Tasks',
        'Team Tasks',
        'Internal Tasks',
      ],
    ],
    ['Documents', ['Working Documents', 'Knowledge evidence']],
    ['Finance', ['Invoice Records', 'Manual incoming Payment observations']],
    ['Improvement', ['Ideas', 'Operational risks']],
  ];
  for (const [entry, tabs] of walk) {
    await openClarteEntry(page, entry);
    await expect(screenTitle(page)).toHaveText(entry);
    const views = page.getByRole('navigation', { name: `${entry} views` });
    if (tabs.length === 1) {
      await expect(views).toHaveCount(0);
      continue;
    }
    await expect(views.getByRole('link')).toHaveText([...tabs]);
    for (const tab of tabs) {
      await views.getByRole('link', { name: tab, exact: true }).click();
      await expect(
        views.getByRole('link', { name: tab, exact: true }),
      ).toHaveAttribute('aria-current', 'page');
    }
    if (entry === 'Tasks') await screenshot(page, 'clarte-tasks');
  }
  // Settings is a console that lists its own sections (#1546).
  await openClarteEntry(page, 'Settings');
  await expect(screenTitle(page)).toHaveText('Settings');
  await expect(
    page.getByRole('navigation', { name: 'Settings views' }),
  ).toHaveCount(0);
  // With Sales stages and Procedure deadlines, which only Clarté shows (#1547).
  await expect(
    page.getByRole('region', { name: 'All settings' }).getByRole('link'),
  ).toHaveCount(7);

  await clarteJumpField(page).click();
  const jump = page.getByRole('dialog', { name: 'Go to a screen' });
  // Today, the 18 sections this tester can open, Sales stages and Procedure
  // deadlines, the Settings console's home and Language and region.
  await expect(jump.getByRole('option')).toHaveCount(23);
  await jump.getByRole('combobox', { name: 'Screen name' }).fill('blocked');
  await expect(jump.getByRole('option')).toHaveText(['Blocked TasksTasks']);
  await screenshot(page, 'clarte-jump-list');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#blocked-tasks$/u);
  await expect(jump).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await expect(jump).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(jump).toHaveCount(0);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  test.info().annotations.push({
    type: 'unanswered reads',
    description: [...unhandled].sort().join(', '),
  });
});

test('opens the latest changes from the bell and switches the interface language', async ({
  page,
}) => {
  await serveTester(page);
  await openClarte(page, '/');

  await page
    .getByRole('button', { name: 'Recent changes', exact: true })
    .click();
  const recent = page
    .locator('#clarte-recent-changes')
    .getByRole('region', { name: 'Recent changes' });
  await expect(recent.getByRole('listitem')).toHaveCount(5);
  await screenshot(page, 'clarte-recent-changes');
  await page.keyboard.press('Escape');
  await expect(page.locator('#clarte-recent-changes')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Recent changes', exact: true }),
  ).toBeFocused();

  await page.getByRole('button', { name: 'User menu' }).click();
  const languages = page.getByRole('group', { name: 'Interface language' });
  await expect(languages.getByRole('radio', { name: 'English' })).toBeChecked();
  await screenshot(page, 'clarte-user-menu-today');
  await languages.getByRole('radio', { name: 'Русский' }).check();
  await expect(screenTitle(page)).toHaveText('Сегодня');
  await page.keyboard.press('Escape');
  await page
    .getByRole('link', { name: 'Задачи', exact: true })
    .filter({ visible: true })
    .click();
  await expect(screenTitle(page)).toHaveText('Задачи');
  await expect(
    page.getByRole('navigation', { name: 'Разделы: Задачи' }),
  ).toBeVisible();
  await screenshot(page, 'clarte-russian-tasks');
});

test('keeps the skip link, Escape and Back and Forward focus', async ({
  page,
}) => {
  await serveTester(page);
  await openClarte(page, '/#clients');

  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(screenTitle(page)).toBeFocused();

  await openClarteEntry(page, 'Documents');
  await expect(page).toHaveURL(/#documents$/u);
  await page.goBack();
  await expect(page).toHaveURL(/#clients$/u);
  await expect(screenTitle(page)).toHaveText('Clients');
  await expect(page.locator('#clients')).toBeFocused();
  await page.goForward();
  await expect(screenTitle(page)).toHaveText('Documents');

  if (isPhoneLayout(page)) {
    const more = page
      .getByRole('navigation', { name: 'Quick navigation' })
      .getByRole('button', { name: 'More' });
    await more.click();
    await expect(
      page.getByRole('group', { name: 'More screens' }),
    ).toBeVisible();
    await screenshot(page, 'clarte-more');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('group', { name: 'More screens' })).toHaveCount(
      0,
    );
    await expect(more).toBeFocused();
  }
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'User menu' })).toBeFocused();
});

test('holds navigation and Company during a protected write', async ({
  page,
}) => {
  const recorder = paymentEvidenceActor();
  const ids = paymentEvidenceIds;
  let writes = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      writes += 1;
      // The write stays in flight: the hold must last until it settles.
      return;
    }
    if (path === '/api/access/current-actor')
      return route.fulfill({ json: recorder });
    if (path === '/api/companies')
      return route.fulfill({ json: [recorder.activeCompany, other] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/client-duplicate-reviews')
      return route.fulfill({ json: { items: [], next_cursor: null } });
    if (path === '/api/clients')
      return route.fulfill({
        json: [
          {
            id: ids.client,
            displayName: 'Fictional original Client',
            relatedToActiveCompany: true,
          },
        ],
      });
    if (path === `/api/clients/${ids.client}`)
      return route.fulfill({
        json: {
          id: ids.client,
          displayName: 'Fictional original Client',
          taxId: null,
          address: null,
          version: 1,
          relatedToActiveCompany: true,
        },
      });
    if (path === `/api/clients/${ids.client}/legal-entities`)
      return route.fulfill({ json: { clientVersion: 1, legalEntities: [] } });
    if (path === '/api/documents')
      return route.fulfill({ json: [paymentEvidenceDocument()] });
    return route.fulfill({ status: 404, json: {} });
  });
  await openClarte(page, '/#documents');

  await page.getByRole('button', { name: 'Payment evidence' }).click();
  const form = page.getByRole('form', { name: 'Register payment evidence' });
  await selectOption(form.getByLabel('Original Client'), ids.client);
  await selectOption(form.getByLabel('Exact payer'), 'PRIMARY');
  await form.getByLabel('Title').fill('Held fictional notice');
  await form.getByLabel('Purpose').fill('Preserve original source');
  await form.getByLabel('Declared source').fill('Fictional manual notice');
  await form.getByRole('button', { name: 'Preserve evidence source' }).click();
  await expect.poll(() => writes).toBe(1);
  await expect(form.getByLabel('Title')).toBeDisabled();

  await openClarteEntry(page, 'Clients');
  await expect(page).toHaveURL(/#documents$/u);
  await clarteJumpField(page).click();
  await page.getByRole('combobox', { name: 'Screen name' }).fill('clients');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#documents$/u);
  await expect(
    page.getByRole('combobox', { name: 'Active Company' }),
  ).toBeDisabled();
  await expect(screenTitle(page)).toHaveText('Documents');
  await screenshot(page, 'clarte-protected-write');
});

test('changes the active Company from the top bar', async ({ page }) => {
  await serveTester(page);
  await openClarte(page, '/#clients');
  await expect(page.locator('.clarte-eyebrow')).toContainText('PRISMA-PRIM');

  await selectOption(page.getByRole('combobox', { name: 'Active Company' }), {
    label: 'BIC',
  });

  await expect(page.locator('.clarte-eyebrow')).toContainText('BIC');
  await expect(screenTitle(page)).toHaveText('Clients');
  await screenshot(page, 'clarte-company-changed');
});
