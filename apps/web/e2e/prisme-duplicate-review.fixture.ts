import { expect, type Page, type Route, type TestInfo } from '@playwright/test';
import type { ActorContext } from '../src/access-types';
import { actorContextFixture } from './actor-context.fixture';

export const reviewReference = '23600000-0000-4000-8000-000000000001';
export const nextReference = '23600000-0000-4000-8000-000000000002';
export const reviewCursor = '23600000-0000-4000-8000-000000000003';
export const reviewCompany = {
  id: '23600000-0000-4000-8000-000000000004',
  displayName: 'PRISMA-PRIM',
};

export function comparisonFixture(
  kind: 'registration' | 'correction' = 'registration',
) {
  return {
    outcome: 'comparison',
    duplicate_review_reference: reviewReference,
    proposal: {
      kind,
      fields: {
        displayName:
          'Exemplu — Research, Consulting and Certification Services',
        taxId: 'TAX-236',
        address: '14 Example Avenue, Building B, Chisinau, Republic of Moldova',
        telephone: null,
        generalEmail: 'shared.client.correspondence@example.test',
        businessActivity: 'Research and consulting',
        contacts: [
          {
            name: 'Ana Ionescu',
            telephone: '+373 60 111 222',
            email: 'ana@example.test',
          },
          {
            name: 'Ion Popa',
            email: 'ion.popa.research.and.certification@example.test',
          },
        ],
      },
    },
    candidate: {
      id: '23600000-0000-4000-8000-000000000005',
      displayName: 'Exemplu — Consulting and Certification',
      taxId: 'TAX-236',
      address: '14 Example Avenue, Chisinau, Republic of Moldova',
      telephone: '+373 60 333 444',
      generalEmail: 'office@example.test',
      businessActivity: null,
      contacts: [
        {
          name: 'Ana Ionescu',
          telephone: '+373 60 111 222',
          email: 'ana@example.test',
        },
        { name: 'Maria Popa', telephone: '+373 60 555 666' },
      ],
      version: 4,
      relatedToActiveCompany: false,
      involvedCompanyDisplayNames: [
        'BIC — Business Inspection and Certification Services',
      ],
    },
  };
}

type RouteHandler = (route: Route) => Promise<void> | void;
type ReviewAuthority =
  'owner-resolver' | 'director' | 'owner' | 'v1' | 'partial';

export async function installReviewFixture(
  page: Page,
  authority: ReviewAuthority = 'owner-resolver',
) {
  const resolver = authority !== 'owner' && authority !== 'v1';
  const complete = authority === 'owner-resolver' || authority === 'director';
  const actor: ActorContext = {
    ...actorContextFixture,
    workspacePermissions:
      authority === 'director' || authority === 'v1' ? [] : ['client.manage'],
    activeCompany: {
      ...reviewCompany,
      ...(authority === 'owner'
        ? {}
        : {
            clientPermissions: [
              'client.read',
              'client.create',
              'client.update',
              ...(resolver ? ['client.duplicate.resolve'] : []),
            ],
            clientPermissionAssignmentId:
              '23600000-0000-4000-8000-000000000006',
            clientPermissionSetVersion: resolver ? 'v2' : 'v1',
          }),
    },
  };
  const state: {
    actor: ActorContext;
    comparison: ReturnType<typeof comparisonFixture>;
    attached: boolean;
    listRequests: (string | null)[];
    detailReads: number;
    clientReads: number;
    activityReads: number;
    commands: {
      method: string;
      path: string;
      body: string | null;
      company: string | undefined;
    }[];
    list: RouteHandler | undefined;
    detail: RouteHandler | undefined;
    attach: RouteHandler | undefined;
    activityStatus: number;
  } = {
    actor,
    comparison: comparisonFixture(),
    attached: false,
    listRequests: [],
    detailReads: 0,
    clientReads: 0,
    activityReads: 0,
    commands: [],
    list: undefined,
    detail: undefined,
    attach: undefined,
    activityStatus: 200,
  };
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() !== 'GET')
      state.commands.push({
        method: request.method(),
        path,
        body: request.postData(),
        company: request.headers()['x-company-context-id'],
      });
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({ json: state.actor });
    if (path.endsWith('/companies'))
      return route.fulfill({ json: [reviewCompany] });
    if (path.endsWith('/activity-log')) {
      state.activityReads++;
      return route.fulfill({
        status: state.activityStatus,
        json: { events: [] },
      });
    }
    if (path.endsWith('/clients')) {
      state.clientReads++;
      return route.fulfill({
        json: state.attached
          ? [{ ...state.comparison.candidate, relatedToActiveCompany: true }]
          : [],
      });
    }
    if (path.endsWith('/client-duplicate-reviews')) {
      expect(url.searchParams.get('page_size')).toBe('20');
      state.listRequests.push(url.searchParams.get('cursor'));
      if (!complete)
        return route.fulfill({ json: { items: [], next_cursor: null } });
      return state.list
        ? state.list(route)
        : route.fulfill({
            json: {
              items: state.attached
                ? []
                : [{ duplicate_review_reference: reviewReference }],
              next_cursor: null,
            },
          });
    }
    if (path.includes('/client-duplicate-reviews/')) {
      state.detailReads++;
      if (!complete) return route.fulfill({ status: 404 });
      return state.detail
        ? state.detail(route)
        : route.fulfill({ json: state.comparison });
    }
    if (
      path.endsWith(
        `/clients/${state.comparison.candidate.id}/active-company-relationship`,
      )
    ) {
      expect(request.method()).toBe('PUT');
      expect(request.postData()).toBeNull();
      expect(request.headers()['x-company-context-id']).toBe(reviewCompany.id);
      if (authority !== 'owner-resolver') return route.fulfill({ status: 403 });
      if (state.attach) return state.attach(route);
      state.attached = true;
      return route.fulfill({
        json: { ...state.comparison.candidate, relatedToActiveCompany: true },
      });
    }
    return route.fulfill({ status: 404 });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return state;
}

export const reviewPanel = (page: Page) =>
  page.getByRole('region', { name: 'Possible duplicate reviews' });
export const openReviewButton = (page: Page) =>
  reviewPanel(page).getByRole('button', {
    name: 'Review possible duplicate 1',
  });
export const attachReviewButton = (page: Page) =>
  reviewPanel(page).getByRole('button', {
    name: 'Use this existing Client in the active Company',
  });

export async function captureReview(
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
    path: testInfo.outputPath(`${name}-${testInfo.project.name}-viewport.png`),
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath(`${name}-${testInfo.project.name}-full.png`),
    fullPage: true,
  });
}
