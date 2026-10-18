import { act, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
  type InterfaceLocale,
} from '../localization/interface-locale';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { ClientDuplicateReviewPanel } from './ClientDuplicateReviewPanel';
import { ClientWorkspace } from './ClientWorkspace';

export const reference = '70900000-0000-4000-8000-000000000011';
export const nextReference = '70900000-0000-4000-8000-000000000012';
export const cursor = '70900000-0000-4000-8000-000000000013';
export const nextCursor = '70900000-0000-4000-8000-000000000014';

export const resolver = {
  internalUserId: 'reviewer-709',
  workspaceMembershipId: 'membership-709',
  workspaceId: 'workspace-709',
  workspaceName: 'Literal Workspace',
  displayName: 'Reviewer',
  email: 'reviewer@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    id: 'company-709',
    displayName: 'Companie {Я}',
    clientPermissions: [
      'client.read',
      'client.create',
      'client.update',
      'client.duplicate.resolve',
    ],
    clientPermissionAssignmentId: 'resolver-assignment-709',
    clientPermissionSetVersion: 'v2',
  },
} satisfies ActorContext;

export function comparisonFixture(
  kind: 'registration' | 'correction' = 'registration',
) {
  return {
    outcome: 'comparison',
    duplicate_review_reference: reference,
    proposal: {
      kind,
      fields: {
        displayName: 'Propunere {Știință Я}',
        taxId: 'IDNO-709 {tax}',
        address: 'Rue {адрес propus}',
        telephone: null,
        generalEmail: 'proposal@example.test',
        businessActivity: 'Conseil {activitate}',
        contacts: [
          {
            name: 'Ana {propus}',
            email: 'ana.proposal@example.test',
            communicationPreferences: 'Română; русский\nemail {dimineața}',
          },
          { name: 'Ion {propus}', telephone: '+373 22 100 709' },
        ],
      },
    },
    candidate: {
      id: 'candidate-709',
      displayName: 'Client existent {Я Ș}',
      taxId: 'IDNO-709 {tax}',
      address: 'Rue {адрес salvat}',
      telephone: '+373 22 200 709',
      generalEmail: 'saved@example.test',
      businessActivity: null,
      contacts: [
        {
          name: 'Maria {salvat}',
          email: 'maria.saved@example.test',
          communicationPreferences: 'Français; English {après-midi}',
        },
        { name: 'Petru {salvat}', telephone: '+373 22 300 709' },
      ],
      version: 1234,
      relatedToActiveCompany: false,
      involvedCompanyDisplayNames: ['Companie partajată {BIC Я}'],
    },
  };
}

export function deferredResponse() {
  let resolve: (value: Response) => void = () => {
    throw new Error('Deferred response not initialized.');
  };
  const promise = new Promise<Response>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}

function LocaleControls() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <div>
      <button onClick={() => changeLocale('ro')}>Choose ro</button>
      <button onClick={() => changeLocale('ru')}>Choose ru</button>
      <button onClick={() => changeLocale('fr')}>Choose fr</button>
      <button onClick={() => changeLocale('en')}>Choose en</button>
    </div>
  );
}

type HttpHandler = (request: {
  url: URL;
  init?: RequestInit;
}) => Promise<Response> | Response;

export function renderReview({
  locale = 'en',
  subject = 'workspace',
  actor = resolver,
  list,
  detail,
  attach,
}: {
  locale?: InterfaceLocale | null;
  subject?: 'workspace' | 'panel';
  actor?: ActorContext;
  list?: HttpHandler;
  detail?: HttpHandler;
  attach?: HttpHandler;
} = {}) {
  if (locale !== null) localStorage.setItem(interfaceLocaleStorageKey, locale);
  const identity = deterministicBrowserIdentity();
  const onActivityRecorded = vi.fn(async () => undefined);
  const onClientsChanged = vi.fn(async () => undefined);
  const onCompanyContextRejected = vi.fn();
  const onActorRevalidated = vi.fn();
  const onWorkspaceAccessRejected = vi.fn();
  const state: {
    actor: ActorContext;
    canAttach: boolean;
    refreshKey: number;
    attached: boolean;
    list?: HttpHandler;
    detail?: HttpHandler;
    attach?: HttpHandler;
    comparison: ReturnType<typeof comparisonFixture>;
  } = {
    actor,
    canAttach: true,
    refreshKey: 0,
    attached: false,
    comparison: comparisonFixture(),
    list,
    detail,
    attach,
  };
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), 'http://localhost');
      if (url.pathname === '/api/clients') return Response.json([]);
      if (url.pathname === '/api/access/current-actor')
        return Response.json(state.actor);
      if (url.pathname === '/api/client-duplicate-reviews')
        return state.list
          ? state.list({ url, init })
          : Response.json({
              items: state.attached
                ? []
                : [{ duplicate_review_reference: reference }],
              next_cursor: null,
            });
      if (url.pathname === `/api/client-duplicate-reviews/${reference}`)
        return state.detail
          ? state.detail({ url, init })
          : Response.json(state.comparison);
      if (
        url.pathname ===
        '/api/clients/candidate-709/active-company-relationship'
      ) {
        if (state.attach) return state.attach({ url, init });
        state.attached = true;
        return Response.json({
          ...state.comparison.candidate,
          relatedToActiveCompany: true,
        });
      }
      throw new Error(`Unexpected API request: ${url.pathname}`);
    },
  );
  vi.stubGlobal('fetch', fetcher);
  function view() {
    return (
      <InterfaceLocaleProvider>
        <LocaleControls />
        <ApplicationPresentation value="prisme">
          {subject === 'workspace' ? (
            <ClientWorkspace
              actor={state.actor}
              identity={identity}
              onCompanyContextRejected={onCompanyContextRejected}
              onActorRevalidated={onActorRevalidated}
              onWorkspaceAccessRejected={onWorkspaceAccessRejected}
              onActivityRecorded={onActivityRecorded}
            />
          ) : (
            <ClientDuplicateReviewPanel
              companyContextId={state.actor.activeCompany?.id ?? 'company-709'}
              authorityGeneration={
                state.actor.activeCompany?.clientPermissionAssignmentId ??
                'no-assignment'
              }
              identity={identity}
              canAttach={state.canAttach}
              refreshKey={state.refreshKey}
              onCompanyContextRejected={onCompanyContextRejected}
              onActorRevalidated={onActorRevalidated}
              onWorkspaceAccessRejected={onWorkspaceAccessRejected}
              onActivityRecorded={onActivityRecorded}
              onClientsChanged={onClientsChanged}
            />
          )}
        </ApplicationPresentation>
      </InterfaceLocaleProvider>
    );
  }
  const result = render(view());
  return {
    state,
    fetcher,
    onActivityRecorded,
    onClientsChanged,
    onCompanyContextRejected,
    onActorRevalidated,
    onWorkspaceAccessRejected,
    rerender: () => result.rerender(view()),
  };
}

export async function chooseLocale(locale: InterfaceLocale) {
  await act(async () => {
    screen.getByRole('button', { name: `Choose ${locale}` }).click();
  });
}
