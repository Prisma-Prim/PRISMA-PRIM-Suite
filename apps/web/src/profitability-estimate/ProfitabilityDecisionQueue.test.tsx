import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  InterfaceLocaleProvider,
  useInterfaceLocale,
} from '../localization/interface-locale';
import { profitabilityActor, syntheticVersion } from './profitability.fixture';
import { ProfitabilityDecisionQueue } from './ProfitabilityDecisionQueue';

const director: ActorContext = {
  ...profitabilityActor,
  activeCompany: {
    ...profitabilityActor.activeCompany,
    id: 'company-1',
    displayName: 'Synthetic Company',
    profitabilityDirectorPermissionAssignmentId: 'director-1',
    profitabilityDirectorPermissionSetVersion: 'v1',
    profitabilityDirectorPermissions: [
      'commercial.profitability_estimate.read',
      'commercial.profitability_estimate.decide',
    ],
  },
};
const item = {
  workspaceId: 'workspace-1',
  companyId: 'company-1',
  versionId: 'version-1',
  estimateId: 'estimate-1',
  opportunityId: 'opportunity-1',
  clientRequestId: 'request-1',
  versionNumber: 1,
  latestVersionNumber: 2,
  createdAt: '2026-10-01T08:00:00.000Z',
  opportunityTitle: 'Synthetic pending opportunity',
};
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
it('discovers a pending earlier Version and opens its exact existing decision detail', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) =>
      path.includes('profitability-estimate-decision-queue')
        ? Response.json({ items: [item] })
        : path.endsWith('/versions/version-1')
          ? Response.json(syntheticVersion())
          : Response.json({
              items: [syntheticVersion(2)],
              latestVersionNumber: 2,
            }),
    ),
  );
  window.localStorage.setItem('prisma-prim.interface-locale', 'en');
  render(
    <InterfaceLocaleProvider>
      <ProfitabilityDecisionQueue
        actor={director}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={() => undefined}
      />
    </InterfaceLocaleProvider>,
  );
  expect(
    await screen.findByText('Synthetic pending opportunity'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review version 1' }));
  expect(
    screen.getByRole('heading', { name: 'Pending profitability estimates' }),
  ).toHaveFocus();
  expect(
    await screen.findByRole('article', { name: 'Version 1' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('article', { name: 'Version 2' }),
  ).not.toBeInTheDocument();
});

function tree(
  actor: ActorContext = director,
  identity = deterministicBrowserIdentity(),
) {
  return (
    <InterfaceLocaleProvider>
      <ProfitabilityDecisionQueue
        actor={actor}
        identity={identity}
        onCompanyContextRejected={() => undefined}
      />
    </InterfaceLocaleProvider>
  );
}
it('never reads for Contributor-only or unknown Director captures', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const rendered = render(tree(profitabilityActor));
  const unsupported = {
    ...director,
    activeCompany: {
      ...director.activeCompany,
      id: 'company-1',
      displayName: 'Synthetic Company',
    },
  };
  // Simulate an unsupported current-actor wire capture at the public UI seam.
  Reflect.set(
    unsupported.activeCompany,
    'profitabilityDirectorPermissionSetVersion',
    'future',
  );
  rendered.rerender(tree(unsupported));
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it('reaches the next page, previous page and explicit refreshed beginning', async () => {
  const first = Array.from({ length: 25 }, (_, n) => ({
    ...item,
    versionId: `version-${String(n).padStart(2, '0')}`,
    versionNumber: n + 1,
    latestVersionNumber: 26,
  }));
  const fetch = vi.fn(async (path: string) =>
    Response.json(
      path.includes('cursor=')
        ? {
            items: [
              {
                ...item,
                versionId: 'version-25',
                versionNumber: 26,
                latestVersionNumber: 26,
                opportunityTitle: 'Last pending version',
              },
            ],
          }
        : { items: first, nextCursor: 'cursor1' },
    ),
  );
  vi.stubGlobal('fetch', fetch);
  window.localStorage.setItem('prisma-prim.interface-locale', 'en');
  render(tree());
  await screen.findByRole('button', { name: 'Review version 25' });
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByText('Last pending version');
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
  await screen.findByRole('button', { name: 'Review version 25' });
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh from beginning' }),
  );
  await screen.findByRole('button', { name: 'Review version 25' });
  expect(fetch).toHaveBeenCalledTimes(4);
});
it('drops a held old response after Company replacement', async () => {
  let release: (response: Response) => void = () => {
    throw new Error('No held response');
  };
  const fetch = vi.fn((path: string, init: RequestInit) =>
    new Headers(init.headers).get('x-company-context-id') === 'company-1'
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : Promise.resolve(Response.json({ items: [] })),
  );
  vi.stubGlobal('fetch', fetch);
  window.localStorage.setItem('prisma-prim.interface-locale', 'en');
  const identity = deterministicBrowserIdentity();
  const rendered = render(tree(director, identity));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  rendered.rerender(
    tree(
      {
        ...director,
        activeCompany: {
          ...director.activeCompany,
          id: 'company-2',
          displayName: 'Second Company',
        },
      },
      identity,
    ),
  );
  await screen.findByText('No estimate versions awaiting your decision.');
  await act(async () => release(Response.json({ items: [item] })));
  expect(
    screen.queryByText('Synthetic pending opportunity'),
  ).not.toBeInTheDocument();
});
it.each([401, 403, 404])(
  'retires the protected queue and exact detail on a refused command %s',
  async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init: RequestInit) =>
        init?.method === 'POST'
          ? Response.json({}, { status })
          : path.includes('profitability-estimate-decision-queue')
            ? Response.json({ items: [item] })
            : path.endsWith('/versions/version-1')
              ? Response.json(syntheticVersion())
              : Response.json({
                  items: [syntheticVersion()],
                  latestVersionNumber: 1,
                }),
      ),
    );
    window.localStorage.setItem('prisma-prim.interface-locale', 'en');
    render(tree());
    await screen.findByText('Synthetic pending opportunity');
    fireEvent.click(screen.getByRole('button', { name: 'Review version 1' }));
    await screen.findByRole('article', { name: 'Version 1' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve this version' }),
    );
    await screen.findByText(
      'Pending estimates are unavailable with your current access.',
    );
    expect(
      screen.queryByText('Synthetic pending opportunity'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry exact command' }),
    ).not.toBeInTheDocument();
  },
);
it('rejects a foreign response instead of rendering hidden records', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ items: [{ ...item, companyId: 'foreign' }] }),
      ),
  );
  window.localStorage.setItem('prisma-prim.interface-locale', 'en');
  render(tree());
  await screen.findByRole('alert');
  expect(
    screen.queryByText('Synthetic pending opportunity'),
  ).not.toBeInTheDocument();
});

it('preserves the exact target and request count across all four locale changes', async () => {
  const fetch = vi.fn(async (path: string) =>
    path.includes('profitability-estimate-decision-queue')
      ? Response.json({ items: [item] })
      : path.endsWith('/versions/version-1')
        ? Response.json(syntheticVersion())
        : Response.json({
            items: [syntheticVersion(2)],
            latestVersionNumber: 2,
          }),
  );
  vi.stubGlobal('fetch', fetch);
  function Languages() {
    const { changeLocale } = useInterfaceLocale();
    return (
      <>
        {(['en', 'fr', 'ro', 'ru'] as const).map((locale) => (
          <button key={locale} onClick={() => changeLocale(locale)}>
            {locale}
          </button>
        ))}
      </>
    );
  }
  window.localStorage.setItem('prisma-prim.interface-locale', 'en');
  const identity = deterministicBrowserIdentity();
  render(
    <InterfaceLocaleProvider>
      <Languages />
      <ProfitabilityDecisionQueue
        actor={director}
        identity={identity}
        onCompanyContextRejected={() => undefined}
      />
    </InterfaceLocaleProvider>,
  );
  await screen.findByText('Synthetic pending opportunity');
  fireEvent.click(screen.getByRole('button', { name: 'Review version 1' }));
  await screen.findByRole('article', { name: 'Version 1' });
  const count = fetch.mock.calls.length;
  for (const locale of ['fr', 'ro', 'ru', 'en']) {
    fireEvent.click(screen.getByRole('button', { name: locale }));
    expect(screen.getByRole('article')).toBeInTheDocument();
  }
  expect(fetch).toHaveBeenCalledTimes(count);
  expect(
    screen.getByRole('article', { name: 'Version 1' }),
  ).toBeInTheDocument();
});
it('clears old rows on a failed continuation and retries that exact page', async () => {
  const first = Array.from({ length: 25 }, (_, n) => ({
    ...item,
    versionId: `v-${String(n).padStart(2, '0')}`,
    versionNumber: n + 1,
    latestVersionNumber: 26,
  }));
  let retry = false;
  const paths: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      paths.push(path);
      return !path.includes('cursor=')
        ? Response.json({ items: first, nextCursor: 'cursor1' })
        : retry
          ? Response.json({
              items: [
                {
                  ...item,
                  versionId: 'v-25',
                  versionNumber: 26,
                  latestVersionNumber: 26,
                  opportunityTitle: 'Recovered page',
                },
              ],
            })
          : Response.json({}, { status: 500 });
    }),
  );
  window.localStorage.setItem('prisma-prim.interface-locale', 'en');
  render(tree());
  await screen.findByRole('button', { name: 'Review version 25' });
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByRole('alert');
  expect(
    screen.queryByText('Synthetic pending opportunity'),
  ).not.toBeInTheDocument();
  retry = true;
  fireEvent.click(screen.getByRole('button', { name: 'Retry this page' }));
  await screen.findByText('Recovered page');
  expect(paths[2]).toBe(paths[1]);
});
