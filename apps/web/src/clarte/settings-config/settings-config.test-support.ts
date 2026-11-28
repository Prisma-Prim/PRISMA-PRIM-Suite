import { vi } from 'vitest';
import type { ActorContext } from '../../access-types';
import {
  companyGrants,
  type CompanyGrantRequest,
} from '../../access/company-grants.test-fixture';

/** One request the fictional API received. */
export type Sent = Readonly<{
  method: string;
  path: string;
  search: string;
  body: unknown;
  key: string | null;
  company: string | null;
}>;

/** Answers one route; `undefined` lets the shared defaults answer. */
export type Route = (request: Sent) => Response | Promise<Response> | undefined;

export const companyId = '00000000-0000-4000-8000-000000001547';

/** A fictional member of one fictional Company with the given grants. */
export function settingsActor({
  grants,
  workspacePermissions = [],
}: Readonly<{
  grants: readonly CompanyGrantRequest[];
  workspacePermissions?: ActorContext['workspacePermissions'];
}>): ActorContext {
  return {
    internalUserId: '00000000-0000-4000-8000-000000002547',
    workspaceMembershipId: '00000000-0000-4000-8000-000000003547',
    workspaceId: '00000000-0000-4000-8000-000000004547',
    workspaceName: 'Fictional Workspace',
    displayName: 'Ana Fictiv',
    email: 'ana@example.test',
    active: true,
    workspacePermissions,
    activeCompany: {
      id: companyId,
      displayName: 'Fictional Consulting',
      grants: companyGrants(...grants),
    },
  };
}

function parse(text: unknown): unknown {
  if (typeof text !== 'string') return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return text;
  }
}

/**
 * Serves the App's shell reads for `actor` and every route; any other read
 * answers 404, as an absent resource, so other sections stay quiet.
 */
export function serve(actor: () => ActorContext, route: Route) {
  const sent: Sent[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), window.location.origin);
      const headers = new Headers(init?.headers);
      const request: Sent = {
        method: init?.method ?? 'GET',
        path: url.pathname,
        search: url.search,
        body: parse(init?.body),
        key: headers.get('idempotency-key'),
        company: headers.get('x-company-context-id'),
      };
      sent.push(request);
      const answer = await route(request);
      if (answer) return answer;
      switch (url.pathname) {
        case '/api/access/current-actor':
          return Response.json(actor());
        case '/api/companies': {
          const company = actor().activeCompany;
          return Response.json(
            company
              ? [{ id: company.id, displayName: company.displayName }]
              : [],
          );
        }
        case '/api/activity-log':
          return Response.json({ events: [] });
        default:
          return Response.json({ message: 'Not Found' }, { status: 404 });
      }
    }),
  );
  return sent;
}

/** The commands the fictional API received on one route. */
export function commands(sent: readonly Sent[], path: string): Sent[] {
  return sent.filter(
    (request) => request.method === 'POST' && request.path === path,
  );
}

const nativeScrollIntoView = Element.prototype.scrollIntoView;

/** The browser surface the Clarté frame needs in jsdom. */
export function stubBrowser() {
  localStorage.clear();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches: false,
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
}

export function restoreBrowser() {
  Element.prototype.scrollIntoView = nativeScrollIntoView;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
}
