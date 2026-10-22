import {
  fireEvent,
  render,
  screen,
  within,
} from './test/render-with-interface-locale';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { selectOption } from './test/select-option';

const companyId = '55555555-5555-4555-8555-555555555555';
const memberId = '33333333-3333-4333-8333-333333333333';
const company = { id: companyId, displayName: 'Synthetic Risk Company' };
const administrator = {
  internalUserId: '11111111-1111-4111-8111-111111111111',
  workspaceMembershipId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '44444444-4444-4444-8444-444444444444',
  workspaceName: 'Synthetic Risk Workspace',
  displayName: 'Synthetic assignment administrator',
  email: 'administrator@example.test',
  active: true,
  workspacePermissions: ['company.assignment.manage'],
  activeCompany: company,
} satisfies ActorContext;

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('Operational Risk access through App', () => {
  it('offers explicit Reader and Recorder grants after Company administration is ready', async () => {
    const requests: { path: string; method: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        requests.push({ path, method: init?.method ?? 'GET' });
        if (path === '/api/access/current-actor')
          return Response.json(administrator);
        if (path === '/api/companies') return Response.json([company]);
        if (path === '/api/activity-log') return Response.json({ events: [] });
        if (path === '/api/company-context-assignments/administration')
          return Response.json({
            members: [
              {
                workspaceMembershipId: memberId,
                displayName: 'Synthetic eligible member',
                email: 'member@example.test',
              },
            ],
            companies: [company],
            assignments: [],
          });
        throw new Error('Unexpected request before Risk grant selection.');
      }),
    );
    window.history.replaceState(null, '', '/#access');
    render(<App identity={deterministicBrowserIdentity()} />);

    expect(
      await within(await screen.findByRole('banner')).findByText(
        company.displayName,
      ),
    ).toBeVisible();
    const administration = await screen.findByRole('region', {
      name: /^Company access$/u,
    });
    const member = await within(administration).findByRole('combobox', {
      name: /^Workspace member\b/u,
    });
    selectOption(member, memberId);
    expect(member).toHaveTextContent('Synthetic eligible member');
    const companyChoice = within(administration).getByRole('combobox', {
      name: /^Company\b/u,
    });
    selectOption(companyChoice, companyId);
    expect(companyChoice).toHaveTextContent(company.displayName);
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
    expect(requests.some((request) => request.path.includes('risk'))).toBe(
      false,
    );

    const bundle = within(administration).getByRole('combobox', {
      name: /^Access bundle\b/u,
    });
    bundle.focus();
    fireEvent.keyDown(bundle, { key: 'ArrowDown' });
    const options = within(screen.getByRole('listbox'));
    expect(
      options.getByRole('option', {
        name: /^Company Profitability Contributor$/u,
      }),
    ).toBeVisible();
    expect(
      options.getByRole('option', {
        name: /^Company Operational Risk Reader$/u,
      }),
    ).toBeVisible();
    expect(
      options.getByRole('option', {
        name: /^Company Operational Risk Recorder$/u,
      }),
    ).toBeVisible();
  });
});
