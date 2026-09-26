import { expect, type Page, type Route, type TestInfo } from '@playwright/test';
import type { ActorContext } from '../src/access-types';
import type { ClientContact } from '../src/client/ClientContactEditor';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';

export const dossierCompany = {
  id: 'company-dossier',
  displayName: 'PRISMA-PRIM',
};

interface DossierFixture {
  id: string;
  displayName: string;
  relatedToActiveCompany: boolean;
  taxId: string | null;
  address: string | null;
  telephone: string | null;
  generalEmail: string | null;
  businessActivity: string | null;
  contacts: ClientContact[];
  version: number;
  involvedCompanyDisplayNames: string[];
}

export function dossierFixture(): DossierFixture {
  return {
    id: 'client-dossier',
    displayName: 'Exemplu — Research, Consulting and Certification Services',
    relatedToActiveCompany: true,
    taxId: 'TAX-233',
    address: '14 Example Avenue, Building B, Chisinau, Republic of Moldova',
    telephone: '+373 60 111 222',
    generalEmail: 'shared.client.correspondence@example.test',
    businessActivity: 'Research and consulting',
    contacts: [
      {
        name: 'Ana Ionescu',
        telephone: '+373 60 333 444',
        email: 'ana@example.test',
      },
      {
        name: 'Ion Popa',
        telephone: '+373 60 555 666',
        email: 'ion@example.test',
      },
    ],
    version: 1,
    involvedCompanyDisplayNames: [
      'PRISMA-PRIM',
      'BIC — Business Inspection and Certification Services',
    ],
  };
}

export async function installDossierFixture(page: Page) {
  const actor: ActorContext = {
    ...actorContextFixture,
    workspacePermissions: [],
    activeCompany: {
      ...dossierCompany,
      clientPermissions: ['client.read', 'client.create', 'client.update'],
      clientPermissionAssignmentId: 'director-233',
      clientPermissionSetVersion: 'v1',
    },
  };
  const commands: { body: string | null; key: string | undefined }[] = [];
  const state: {
    actor: ActorContext;
    actorStatus: number;
    dossier: DossierFixture;
    commands: typeof commands;
    dossierReads: number;
    listReads: number;
    activityReads: number;
    reviewReads: number;
    historyReads: number;
    history: { corrections: unknown[]; nextCursor: string | null };
    read: ((route: Route) => Promise<void> | void) | undefined;
    patch: (route: Route) => Promise<void> | void;
  } = {
    actor,
    actorStatus: 200,
    dossier: dossierFixture(),
    commands,
    dossierReads: 0,
    listReads: 0,
    activityReads: 0,
    reviewReads: 0,
    historyReads: 0,
    history: { corrections: [], nextCursor: null },
    read: undefined,
    patch: (route: Route): Promise<void> | void => route.abort('failed'),
  };
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({ status: state.actorStatus, json: state.actor });
    if (path.endsWith('/companies'))
      return route.fulfill({ json: [dossierCompany] });
    if (path.endsWith('/operational-home'))
      return route.fulfill({
        json: operationalHomeFixture(dossierCompany.id, { active_clients: 1 }),
      });
    if (path.endsWith('/activity-log')) {
      state.activityReads += 1;
      return route.fulfill({ json: { events: [] } });
    }
    if (path.endsWith('/clients')) {
      state.listReads += 1;
      return route.fulfill({ json: [state.dossier] });
    }
    if (path.endsWith('/union-history')) return route.fulfill({ json: [] });
    if (path.endsWith('/client-duplicate-reviews')) {
      state.reviewReads += 1;
      return route.fulfill({ json: { items: [], next_cursor: null } });
    }
    if (path.endsWith('/clients/client-dossier/correction-history')) {
      state.historyReads += 1;
      return route.fulfill({ json: state.history });
    }
    if (path.endsWith('/clients/client-dossier')) {
      if (request.method() === 'PATCH') {
        state.commands.push({
          body: request.postData(),
          key: request.headers()['idempotency-key'],
        });
        return state.patch(route);
      }
      state.dossierReads += 1;
      return state.read
        ? state.read(route)
        : route.fulfill({ json: state.dossier });
    }
    return route.fulfill({ status: 404 });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return state;
}

export async function openDossier(page: Page) {
  await page.goto('/?frame=prisme#clients');
  await page.getByRole('button', { name: 'Open dossier', exact: true }).click();
  await expect(page.getByText('Version 1', { exact: true })).toBeVisible();
}

export const correctionForm = (page: Page) =>
  page.getByRole('form', { name: 'Correct Client dossier' });
export const correctionTrigger = (page: Page) =>
  page.getByRole('button', { name: 'Correct Client dossier', exact: true });

export async function navigateTo(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name, exact: true })
    .click();
}

export async function changeFrame(
  page: Page,
  name: 'Use classic frame' | 'Try Prisme',
) {
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name }).click();
}

export async function captureDossier(
  page: Page,
  testInfo: TestInfo,
  name: string,
) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
}
