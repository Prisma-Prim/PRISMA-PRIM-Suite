import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from './test/render-with-interface-locale';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';

const companyId = '10000000-0000-4000-8000-000000000864';
const actor: ActorContext = {
  internalUserId: '20000000-0000-4000-8000-000000000864',
  workspaceMembershipId: '30000000-0000-4000-8000-000000000864',
  workspaceId: '00000000-0000-4000-8000-000000000864',
  workspaceName: 'Synthetic model Workspace',
  displayName: 'Synthetic modeller',
  email: 'modeller@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: companyId,
    displayName: 'Synthetic consulting Company',
    clientPermissions: [],
    contractModelGrants: [
      {
        bundle: 'company_contract_model_editor',
        assignmentId: '40000000-0000-4000-8000-000000000864',
        permissionSetVersion: 'v1',
        permissions: [
          'commercial.contract.model.read',
          'commercial.contract.model.version.create',
        ],
      },
    ],
  },
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches: media.includes('prefers-reduced-motion'),
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => true,
  }));
  window.history.replaceState(null, '', '/#contract-models');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

it('opens the Company consulting-model configuration without pricing, Client or Offer authority', async () => {
  const reads: { path: string; company: string | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), window.location.origin);
      reads.push({
        path: url.pathname,
        company: new Headers(init?.headers).get('x-company-context-id'),
      });
      switch (url.pathname) {
        case '/api/access/current-actor':
          return Response.json(actor);
        case '/api/companies':
          return Response.json([
            { id: companyId, displayName: 'Synthetic consulting Company' },
          ]);
        case '/api/activity-log':
          return Response.json({ events: [] });
        case '/api/operational-home':
          return Response.json({
            companyId,
            today: '2026-10-24',
            summaries: [],
          });
        case '/api/contract-models/consulting-ro':
          return Response.json({ model: null });
        default:
          throw new Error(`Unexpected model journey read: ${url.pathname}`);
      }
    }),
  );
  render(<App identity={deterministicBrowserIdentity()} />);
  expect(
    (
      await screen.findAllByRole('link', {
        name: 'Consulting Contract model',
      })
    ).length,
  ).toBeGreaterThan(0);
  expect(
    await screen.findByText(
      'No consulting Contract model has been configured.',
    ),
  ).toBeVisible();
  expect(
    reads.filter((read) => read.path === '/api/contract-models/consulting-ro'),
  ).toEqual([
    { path: '/api/contract-models/consulting-ro', company: companyId },
  ]);
  expect(
    reads.some((read) =>
      /pricing|clients|opportunities|profitability/.test(read.path),
    ),
  ).toBe(false);
});
