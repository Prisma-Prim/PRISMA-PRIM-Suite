import { expect, type Page, type Route, type TestInfo } from '@playwright/test';
import type { ActorContext } from '../src/access-types';
import type { UnionComparison } from '../src/client/client-union-contract';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';
import { selectOption } from './select-option';

export const firstId = '24100000-0000-4000-8000-000000000001';
export const secondId = '24100000-0000-4000-8000-000000000002';
export const companyA = {
  id: '24100000-0000-4000-8000-000000000003',
  displayName: 'PRISMA-PRIM',
};
export const companyB = {
  id: '24100000-0000-4000-8000-000000000004',
  displayName: 'BIC — Business Inspection and Certification Services',
};
export const reference = '24100000-0000-4000-8000-000000000005';
export const first = {
  id: firstId,
  version: 2,
  displayName: 'Exemplu — Research, Consulting and Certification Services',
  taxId: 'UNION-241',
  address: null,
  telephone: '+373 60 111 222',
  generalEmail: null,
  businessActivity: null,
  contacts: [
    {
      name: 'Ana Ionescu',
      telephone: '+373 60 123 456',
      email: 'ana@example.test',
    },
  ],
};
export const second = {
  ...first,
  id: secondId,
  version: 4,
  displayName: 'Exemplu — Consulting and Certification',
  address: '14 Example Avenue, Building B, Chisinau, Republic of Moldova',
  generalEmail: 'shared.client.correspondence@example.test',
  businessActivity: 'Research and consulting',
  contacts: [
    ...first.contacts,
    {
      name: 'Ion Popa',
      telephone: '+373 60 333 444',
      email: 'ion.popa.research.and.certification@example.test',
    },
  ],
};
type RouteHandler = (route: Route) => Promise<void> | void;
export async function installUnionFixture(page: Page) {
  const actor: ActorContext = {
    ...actorContextFixture,
    workspacePermissions: ['client.manage'],
    activeCompany: {
      ...companyA,
      clientPermissions: [
        'client.read',
        'client.create',
        'client.update',
        'client.duplicate.resolve',
      ],
      clientPermissionAssignmentId: '24100000-0000-4000-8000-000000000006',
      clientPermissionSetVersion: 'v2',
    },
  };
  const state: {
    actor: ActorContext;
    comparison: UnionComparison;
    united: boolean;
    clientReads: number;
    activityReads: number;
    reviewReads: number;
    commands: {
      body: string | null;
      key: string | undefined;
      company: string | undefined;
    }[];
    review: RouteHandler | undefined;
    confirm: RouteHandler | undefined;
    refreshFails: boolean;
  } = {
    actor,
    comparison: {
      outcome: 'comparison',
      reviewReference: reference,
      clients: [
        {
          ...first,
          contacts: first.contacts.map((contact) => ({ ...contact })),
        },
        {
          ...second,
          contacts: second.contacts.map((contact) => ({ ...contact })),
        },
      ],
      companies: [companyA, companyB],
    },
    united: false,
    clientReads: 0,
    activityReads: 0,
    reviewReads: 0,
    commands: [],
    review: undefined,
    confirm: undefined,
    refreshFails: false,
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({ json: state.actor });
    if (path.endsWith('/companies'))
      return route.fulfill({ json: [companyA, companyB] });
    if (path.endsWith('/operational-home'))
      return route.fulfill({
        json: operationalHomeFixture(companyA.id, {
          active_clients: state.united ? 1 : 2,
        }),
      });
    if (path.endsWith('/activity-log')) {
      state.activityReads++;
      return state.united && state.refreshFails
        ? route.fulfill({ status: 503 })
        : route.fulfill({ json: { events: [] } });
    }
    if (path.endsWith('/client-duplicate-reviews'))
      return route.fulfill({ json: { items: [], next_cursor: null } });
    if (path.endsWith('/clients')) {
      state.clientReads++;
      return state.united && state.refreshFails
        ? route.fulfill({ status: 503 })
        : route.fulfill({
            json: (state.united ? [second] : [first, second]).map((client) => ({
              ...client,
              relatedToActiveCompany: true,
            })),
          });
    }
    if (path.endsWith('/union-reviews')) {
      state.reviewReads++;
      expect(request.method()).toBe('POST');
      expect(request.postData()).toBe('{}');
      return state.review
        ? state.review(route)
        : route.fulfill({ status: 201, json: state.comparison });
    }
    if (path.endsWith('/confirm')) {
      expect(path).toBe(
        '/api/client-union-reviews/' +
          state.comparison.reviewReference +
          '/confirm',
      );
      state.commands.push({
        body: request.postData(),
        key: request.headers()['idempotency-key'],
        company: request.headers()['x-company-context-id'],
      });
      if (state.confirm) return state.confirm(route);
      state.united = true;
      return route.fulfill({
        status: 201,
        json: {
          outcome: 'united',
          canonicalClientId: secondId,
          projectionReference: '24100000-0000-4000-8000-000000000007',
        },
      });
    }
    const client = path.endsWith('/' + firstId)
      ? first
      : path.endsWith('/' + secondId)
        ? second
        : undefined;
    if (client)
      return route.fulfill({
        json: {
          ...client,
          version: state.united ? 5 : client.version,
          contacts: state.united
            ? [...first.contacts, ...second.contacts]
            : client.contacts,
          relatedToActiveCompany: true,
          involvedCompanyDisplayNames: [
            companyA.displayName,
            companyB.displayName,
          ],
        },
      });
    if (path.endsWith('/legal-entities'))
      return route.fulfill({ json: { clientVersion: 1, legalEntities: [] } });
    return route.fulfill({ status: 404 });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return state;
}
export const unionPanel = (page: Page) =>
  page.getByRole('region', { name: 'Governed Client union' });
export const unionForm = (page: Page) =>
  unionPanel(page).getByRole('form', { name: 'Confirm union' });
export async function openUnion(page: Page) {
  await page.goto('/?frame=prisme#clients');
  await page
    .getByRole('button', { name: 'Open dossier', exact: true })
    .first()
    .click();
  const trigger = unionPanel(page).getByRole('button', {
    name: 'Review existing duplicates',
  });
  await trigger.focus();
  await page.keyboard.press('Enter');
}
export async function chooseUnion(page: Page) {
  const form = unionForm(page);
  await expect(form).toBeVisible();
  for (const select of await form.getByRole('combobox').all())
    await selectOption(select, secondId);
  await selectOption(
    form.getByRole('combobox', { name: 'Telephone', exact: true }),
    firstId,
  );
  await form
    .getByLabel('Reason for this union')
    .fill('Reviewed both saved dossiers and all affected Companies.');
  for (const checkbox of await form.getByRole('checkbox').all())
    await checkbox.check();
}
export async function navigateUnion(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name, exact: true })
    .click();
}
export async function captureUnion(
  page: Page,
  testInfo: TestInfo,
  name: string,
) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(
      name + '-' + testInfo.project.name + '-viewport.png',
    ),
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath(name + '-' + testInfo.project.name + '-full.png'),
    fullPage: true,
  });
}
