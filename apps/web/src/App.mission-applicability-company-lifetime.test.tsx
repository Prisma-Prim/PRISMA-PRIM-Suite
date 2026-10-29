import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { changeValue } from './test/select-option';
import {
  actor,
  companyId,
  projectId,
  project,
  snapshot,
  installParentServer,
} from './test/mission-applicability-app-fixture';
import { preferenceKey } from './production-shell/company-context-preference';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(preferenceKey(actor), companyId);
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
it.each(
  ['read', 'write'].flatMap((kind) =>
    [200, 403].map((status) => ({ kind, status })),
  ),
)(
  'permanently retires original $kind HTTP $status after actual Company A→B→A with equal returned Actor/grant strings',
  async ({ kind, status }) => {
    const otherCompanyId = '10000000-0000-4000-8000-000000000002',
      otherActor = {
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          id: otherCompanyId,
          displayName: 'Company B DEMO',
        },
      };
    let hold = false,
      finish: ((response: Response) => void) | undefined,
      actorReads = 0,
      activityReads = 0;
    installParentServer(
      () => actor,
      async (path, init) => {
        const company = new Headers(init?.headers).get('x-company-context-id');
        if (path === '/api/companies')
          return Response.json([
            { id: companyId, displayName: 'Company DEMO' },
            { id: otherCompanyId, displayName: 'Company B DEMO' },
          ]);
        if (path === '/api/access/current-actor') {
          actorReads++;
          return Response.json(company === otherCompanyId ? otherActor : actor);
        }
        if (path === '/api/activity-log') activityReads++;
        if (
          company === otherCompanyId &&
          (path === '/api/projects' || path === '/api/clients')
        )
          return Response.json([]);
        if (
          path === `/api/projects/${projectId}/mission-applicability` &&
          hold &&
          (kind === 'write' ? init?.method === 'POST' : init?.method !== 'POST')
        ) {
          hold = false;
          return new Promise((resolve) => {
            finish = resolve;
          });
        }
        return undefined;
      },
    );
    render(
      <StrictMode>
        <App identity={deterministicBrowserIdentity()} />
      </StrictMode>,
    );
    let projects = await screen.findByRole('region', { name: 'Projects' });
    fireEvent.click(
      await within(projects).findByRole('button', {
        name: new RegExp(project.title),
      }),
    );
    let panel = await screen.findByRole('region', {
      name: 'Mission activity applicability',
    });
    await within(panel).findByRole('combobox', { name: 'Source activity' });
    hold = true;
    if (kind === 'read')
      fireEvent.click(
        within(panel).getByRole('button', {
          name: 'Reload current applicability',
        }),
      );
    else {
      fireEvent.change(
        within(panel).getByRole('textbox', {
          name: 'Proposal reason (1–1000 characters)',
        }),
        { target: { value: 'Old Company A intent DEMO' } },
      );
      fireEvent.change(
        within(panel).getByRole('textbox', {
          name: 'Reported scope basis (1–2000 characters)',
        }),
        { target: { value: 'Old scope DEMO' } },
      );
      fireEvent.change(
        within(panel).getByRole('textbox', {
          name: 'Reported agreement basis (1–2000 characters)',
        }),
        { target: { value: 'Old agreement statement DEMO' } },
      );
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Review exact proposal' }),
      );
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Record proposal' }),
      );
    }
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    changeValue(
      screen.getByRole('combobox', { name: 'Active Company' }),
      otherCompanyId,
    );
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Active Company' }),
      ).toHaveAttribute('data-value', otherCompanyId),
    );
    changeValue(
      screen.getByRole('combobox', { name: 'Active Company' }),
      companyId,
    );
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Active Company' }),
      ).toHaveAttribute('data-value', companyId),
    );
    projects = await screen.findByRole('region', { name: 'Projects' });
    fireEvent.click(
      await within(projects).findByRole('button', {
        name: new RegExp(project.title),
      }),
    );
    panel = await screen.findByRole('region', {
      name: 'Mission activity applicability',
    });
    await within(panel).findByRole('combobox', { name: 'Source activity' });
    const before = { actorReads, activityReads },
      value = snapshot(),
      stale = {
        ...value,
        applicability: {
          ...value.applicability,
          activities: value.applicability.activities.map((row, index) =>
            index === 0
              ? {
                  ...row,
                  task: { ...row.task, title: 'RETIRED COMPANY A SENTINEL' },
                }
              : row,
          ),
        },
      };
    await act(async () => {
      finish?.(
        status === 403
          ? new Response(null, { status })
          : kind === 'read'
            ? Response.json(stale)
            : Response.json(
                {
                  action: 'recorded',
                  projectId,
                  factId: 'retired-company-fact-demo',
                  applicabilityRevision: 1,
                },
                { status: 201 },
              ),
      );
    });
    expect(
      screen.queryByText(/RETIRED COMPANY A SENTINEL/u),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByText('Applicability fact confirmed.'),
    ).not.toBeInTheDocument();
    expect(
      within(panel).getByRole('textbox', {
        name: 'Proposal reason (1–1000 characters)',
      }),
    ).toHaveValue('');
    expect({ actorReads, activityReads }).toEqual(before);
  },
  20_000,
);
