import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import {
  clearWorkspaceSelection,
  selectWorkspace,
} from './access/workspace-selection';
import {
  InterfaceLocaleProvider,
  interfaceLocales,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
} from './localization/interface-locale';
import { preferenceKey } from './production-shell/company-context-preference';
import {
  contractLocaleActor,
  contractLocaleIds,
  contractLocaleLiteral,
  contractLocalePath,
  contractLocaleRecord,
  contractLocaleRepresentation,
  contractLocaleRepresentationPath,
  contractLocaleRequest,
  contractLocaleScope,
  contractLocaleChecksum,
  readContractLocaleFixture,
} from './test/contract-localization-fixture';

const nativeScrollIntoView = Element.prototype.scrollIntoView;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  selectWorkspace(contractLocaleIds.workspace);
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  localStorage.setItem(
    preferenceKey(contractLocaleActor(false)),
    contractLocaleIds.company,
  );
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(() => false),
        }) satisfies MediaQueryList,
    ),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Element.prototype.scrollIntoView = nativeScrollIntoView;
  clearWorkspaceSelection();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
function LocaleChoices() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {interfaceLocales.map((locale) => (
        <button key={locale} onClick={() => changeLocale(locale)}>
          Use {locale}
        </button>
      ))}
    </>
  );
}

// These public App tests remain UNRUN until the next authorized execution lease.
it('retires a locale-preserved representation on session loss through the real App and suppresses the late bytes', async () => {
  window.history.replaceState(null, '', '/?frame=classic#requests');
  let finish: (value: Response) => void = () => {
    throw new Error('No representation request');
  };
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  let representationSignal: AbortSignal | null | undefined;
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const path = new URL(input.toString(), 'http://localhost').pathname;
      if ((init?.method ?? 'GET') !== 'GET')
        throw new Error('Unexpected mutation: ' + path);
      if (path === contractLocaleRepresentationPath) {
        representationSignal = init?.signal;
        return pending;
      }
      const hasCompany =
        new Headers(init?.headers).get('x-company-context-id') ===
        contractLocaleIds.company;
      return Response.json(
        readContractLocaleFixture({ path, hasCompany, recorded: true }),
      );
    });
  const identity = deterministicBrowserIdentity({
    'x-test-external-subject': 'contract-session-657',
  });
  const view = render(
    <InterfaceLocaleProvider>
      <LocaleChoices />
      <App identity={identity} />
    </InterfaceLocaleProvider>,
  );
  const requestSubject = contractLocaleRequest.subject;
  if (requestSubject === null)
    throw new Error('The synthetic Contract Request requires its subject.');
  fireEvent.click(
    await screen.findByRole('button', {
      name: new RegExp(
        requestSubject.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'),
        'u',
      ),
    }),
  );
  await within(
    await screen.findByRole('region', { name: 'Contract' }),
  ).findByText(contractLocaleScope);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open exact Contract document' }),
  );
  await waitFor(() => expect(representationSignal).toBeDefined());
  const beforeLocale = fetch.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Use fr' }));
  expect(
    screen.getByText('Chargement du document exact du contrat…'),
  ).toBeVisible();
  expect(representationSignal?.aborted).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(beforeLocale);
  view.rerender(
    <InterfaceLocaleProvider>
      <LocaleChoices />
      <App identity={{ ...identity, signedIn: false }} />
    </InterfaceLocaleProvider>,
  );
  expect(representationSignal?.aborted).toBe(true);
  await act(async () => finish(Response.json(contractLocaleRepresentation)));
  expect(screen.queryByText(contractLocaleScope)).not.toBeInTheDocument();
  expect(screen.queryByText(contractLocaleChecksum)).not.toBeInTheDocument();
  expect(
    screen.queryByTitle('Document de contrat illustratif'),
  ).not.toBeInTheDocument();
  expect(
    fetch.mock.calls.every(([, init]) => (init?.method ?? 'GET') === 'GET'),
  ).toBe(true);
});

it.each([200, 404])(
  'preserves a requested exact Contract Version across locale change and refuses head substitution at HTTP %s',
  async (status) => {
    window.history.replaceState(null, '', '/?frame=classic#activity');
    const exactPath = `${contractLocalePath}/versions/${contractLocaleIds.version}`;
    const secondId = '90000000-0000-4000-8000-000000000657';
    const original = contractLocaleRecord();
    const superseded = {
      ...original,
      revision: 2,
      version: { ...original.version, supersededByVersionId: secondId },
    };
    const head = {
      ...original,
      revision: 2,
      version: {
        ...original.version,
        id: secondId,
        versionNumber: 2,
        createdContractRevision: 2,
        predecessorVersionId: contractLocaleIds.version,
        specialConditions:
          'Second version must not substitute the requested version',
        differences: [
          {
            field: 'specialConditions',
            before: contractLocaleLiteral,
            after: 'Second version must not substitute the requested version',
          },
        ],
      },
    };
    let finish: (value: Response) => void = () => {
      throw new Error('No exact-version request');
    };
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    let exactSignal: AbortSignal | null | undefined;
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const path = new URL(input.toString(), 'http://localhost').pathname;
        if ((init?.method ?? 'GET') !== 'GET')
          throw new Error('Unexpected mutation: ' + path);
        if (path === '/api/activity-log')
          return Response.json({
            events: [
              {
                id: 'event-contract-657',
                action: 'contract.created',
                occurredAt: '2026-10-17T12:00:00.000Z',
                actor: {
                  internalUserId: contractLocaleIds.user,
                  displayName: 'Synthetic Operator',
                },
                target: {
                  type: 'contract_version',
                  contractId: contractLocaleIds.contract,
                  contractVersionId: contractLocaleIds.version,
                  kind: 'CONTRACT',
                  illustrativeReference: 1,
                  versionNumber: 1,
                  opportunityId: contractLocaleIds.opportunity,
                  clientRequestId: contractLocaleIds.request,
                  companyId: contractLocaleIds.company,
                },
                metadata: {},
              },
            ],
          });
        if (path === exactPath) {
          exactSignal = init?.signal;
          return pending;
        }
        if (path === contractLocalePath)
          return Response.json({ contract: head, precontract: null });
        if (path === `${contractLocalePath}/versions`)
          return Response.json({
            items: [
              { id: secondId, versionNumber: 2 },
              { id: contractLocaleIds.version, versionNumber: 1 },
            ],
            nextCursor: null,
          });
        const hasCompany =
          new Headers(init?.headers).get('x-company-context-id') ===
          contractLocaleIds.company;
        return Response.json(
          readContractLocaleFixture({ path, hasCompany, recorded: true }),
        );
      });
    render(
      <InterfaceLocaleProvider>
        <LocaleChoices />
        <App
          identity={deterministicBrowserIdentity({
            'x-test-external-subject': 'contract-version-657',
          })}
        />
      </InterfaceLocaleProvider>,
    );
    const activity = await screen.findByRole('region', {
      name: 'Activity Log',
    });
    fireEvent.click(
      await within(activity).findByRole('button', {
        name: 'Open agreement version',
      }),
    );
    await waitFor(() => expect(exactSignal).toBeDefined());
    const beforeLocale = fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Use fr' }));
    expect(exactSignal?.aborted).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(beforeLocale);
    await act(async () =>
      finish(
        Response.json(status === 200 ? { contract: superseded } : {}, {
          status,
        }),
      ),
    );
    if (status === 200) {
      expect(
        await screen.findByText(contractLocaleLiteral, {
          trim: false,
          collapseWhitespace: false,
        }),
      ).toBeVisible();
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Ouvrir le document exact du contrat',
        }),
      );
      expect(
        await screen.findByTitle('Document de contrat illustratif'),
      ).toHaveAttribute('srcdoc', contractLocaleRepresentation.html);
      expect(screen.getByText(contractLocaleChecksum)).toBeVisible();
    } else {
      expect(
        await screen.findByText(
          'Le contrat n’a pas pu être chargé. Réessayez.',
        ),
      ).toBeVisible();
      expect(
        screen.queryByText(contractLocaleLiteral, {
          trim: false,
          collapseWhitespace: false,
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTitle('Document de contrat illustratif'),
      ).not.toBeInTheDocument();
    }
    expect(
      screen.queryByText(
        'Second version must not substitute the requested version',
      ),
    ).not.toBeInTheDocument();
    expect(
      fetch.mock.calls.filter(
        ([input]) =>
          new URL(input.toString(), 'http://localhost').pathname === exactPath,
      ),
    ).toHaveLength(1);
    expect(
      fetch.mock.calls.filter(
        ([input]) =>
          new URL(input.toString(), 'http://localhost').pathname ===
          contractLocalePath,
      ),
    ).toHaveLength(0);
    expect(
      fetch.mock.calls.every(([, init]) => (init?.method ?? 'GET') === 'GET'),
    ).toBe(true);
  },
);
