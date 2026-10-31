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
  clientId,
  projectId,
  project,
  snapshot,
  installParentServer,
} from './test/mission-applicability-app-fixture';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
const cases = ['identity', 'project', 'original-client'].flatMap((retirement) =>
  ['read', 'write'].flatMap((kind) =>
    [200, 403].map((status) => ({ retirement, kind, status })),
  ),
);
it.each(cases)(
  'retires held $kind HTTP $status across actual App $retirement replacement and return, preserving fresh focus and shared context',
  async ({ retirement, kind, status }) => {
    let hold = false,
      finish: ((response: Response) => void) | undefined,
      actorReads = 0,
      activityReads = 0,
      united = false;
    const sibling = {
      ...project,
      id: '30000000-0000-4000-8000-000000000002',
      title: 'Sibling Project DEMO',
    };
    const original = {
      id: clientId,
      version: 1,
      displayName: project.clientDisplayName,
      taxId: 'UNION-972-DEMO',
      address: null,
      telephone: null,
      generalEmail: null,
      businessActivity: null,
      contacts: [],
    };
    const canonical = {
      ...original,
      id: '20000000-0000-4000-8000-000000000002',
      displayName: 'Canonical Client DEMO',
    };
    const company = { id: companyId, displayName: 'Company DEMO' };
    const principal = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        clientPermissions: ['client.read', 'client.duplicate.resolve'],
        clientPermissionAssignmentId: 'client-live-demo',
        clientPermissionSetVersion: 'v2',
      },
    };
    installParentServer(
      () => principal,
      async (path, init) => {
        if (path === '/api/access/current-actor') actorReads++;
        if (path === '/api/activity-log') activityReads++;
        if (path === '/api/projects') return Response.json([project, sibling]);
        if (path === `/api/projects/${sibling.id}`)
          return Response.json(sibling);
        if (path === `/api/projects/${sibling.id}/template`)
          return Response.json({ template: null });
        if (path === `/api/projects/${projectId}/mission-applicability`) {
          if (
            hold &&
            (kind === 'write'
              ? init?.method === 'POST'
              : init?.method !== 'POST')
          ) {
            hold = false;
            return new Promise((resolve) => {
              finish = resolve;
            });
          }
          const initial = snapshot();
          return Response.json({
            ...initial,
            applicability: { ...initial.applicability, mutable: !united },
          });
        }
        if (path === '/api/clients')
          return Response.json(
            (united ? [canonical] : [original, canonical]).map((client) => ({
              ...client,
              relatedToActiveCompany: true,
            })),
          );
        const dossier = [original, canonical].find(
          (client) => path === `/api/clients/${client.id}`,
        );
        if (dossier)
          return Response.json({
            ...dossier,
            relatedToActiveCompany: true,
            involvedCompanyDisplayNames: [company.displayName],
          });
        if (path.endsWith('/legal-entities'))
          return Response.json({ clientVersion: 1, legalEntities: [] });
        if (path.endsWith('/union-reviews'))
          return Response.json(
            {
              outcome: 'comparison',
              reviewReference: 'union-review-972-demo',
              clients: [original, canonical],
              companies: [company],
            },
            { status: 201 },
          );
        if (
          path === '/api/client-union-reviews/union-review-972-demo/confirm'
        ) {
          united = true;
          return Response.json(
            {
              outcome: 'united',
              canonicalClientId: canonical.id,
              projectionReference: 'union-projection-972-demo',
            },
            { status: 201 },
          );
        }
        if (path.endsWith('/union-history'))
          return Response.json({ events: [], detailReferences: [] });
        return undefined;
      },
    );
    const identity = deterministicBrowserIdentity(),
      view = render(
        <StrictMode>
          <App identity={identity} />
        </StrictMode>,
      );
    async function open() {
      const projects = await screen.findByRole('region', { name: 'Projects' });
      fireEvent.click(
        await within(projects).findByRole('button', {
          name: new RegExp(project.title),
        }),
      );
      const panel = await screen.findByRole('region', {
        name: 'Mission activity applicability',
      });
      await within(panel).findByRole('combobox', { name: 'Source activity' });
      return panel;
    }
    let panel = await open();
    hold = true;
    if (kind === 'read')
      fireEvent.click(
        within(panel).getByRole('button', {
          name: 'Reload current applicability',
        }),
      );
    else {
      for (const [name, value] of [
        ['Proposal reason (1–1000 characters)', 'Retired parent proposal DEMO'],
        ['Reported scope basis (1–2000 characters)', 'Retired scope DEMO'],
        [
          'Reported agreement basis (1–2000 characters)',
          'Retired reported basis DEMO',
        ],
      ])
        fireEvent.change(within(panel).getByRole('textbox', { name }), {
          target: { value },
        });
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Review exact proposal' }),
      );
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Record proposal' }),
      );
    }
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    if (retirement === 'identity') {
      view.rerender(
        <StrictMode>
          <App identity={{ ...identity, signedIn: false }} />
        </StrictMode>,
      );
      await screen.findByText('Sign in is required to access this workspace.');
      view.rerender(
        <StrictMode>
          <App identity={identity} />
        </StrictMode>,
      );
    } else if (retirement === 'project') {
      fireEvent.click(
        within(screen.getByRole('region', { name: 'Projects' })).getByRole(
          'button',
          { name: new RegExp(sibling.title) },
        ),
      );
      await screen.findByRole('heading', { name: sibling.title });
    } else {
      fireEvent.click(
        within(
          screen.getByRole('navigation', { name: 'Primary navigation' }),
        ).getByRole('link', { name: 'Clients' }),
      );
      const heading = await screen.findByRole('heading', {
          name: original.displayName,
        }),
        row = heading.closest('li');
      if (!row) throw new Error('Expected native Client row');
      fireEvent.click(
        within(row).getByRole('button', { name: 'Open dossier' }),
      );
      const dossier = await screen.findByRole('region', {
        name: original.displayName,
      });
      fireEvent.click(
        within(dossier.parentElement ?? dossier).getByRole('button', {
          name: 'Review existing duplicates',
        }),
      );
      const form = await screen.findByRole('form', { name: 'Confirm union' });
      for (const select of within(form).getAllByRole('combobox'))
        changeValue(select, canonical.id);
      fireEvent.change(within(form).getByLabelText('Reason for this union'), {
        target: {
          value: 'Explicit synthetic original Client identity change DEMO',
        },
      });
      for (const checkbox of within(form).getAllByRole('checkbox'))
        fireEvent.click(checkbox);
      fireEvent.submit(form);
      await screen.findByRole('region', { name: canonical.displayName });
      fireEvent.click(
        within(
          screen.getByRole('navigation', { name: 'Primary navigation' }),
        ).getByRole('link', { name: 'Projects' }),
      );
    }
    panel = await open();
    const currentInput = within(
      screen.getByRole('region', { name: 'Projects' }),
    ).getByRole('textbox', { name: 'Project title' });
    currentInput.focus();
    const before = { actorReads, activityReads },
      source = snapshot(),
      stale = {
        ...source,
        applicability: {
          ...source.applicability,
          activities: source.applicability.activities.map((row, index) =>
            index === 0
              ? {
                  ...row,
                  task: {
                    ...row.task,
                    title: 'RETIRED PARENT PROTECTED SENTINEL',
                  },
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
                  factId: 'retired-parent-fact-demo',
                  applicabilityRevision: 1,
                },
                { status: 201 },
              ),
      );
    });
    expect(
      screen.queryByText(/RETIRED PARENT PROTECTED SENTINEL/u),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByText('Applicability fact confirmed.'),
    ).not.toBeInTheDocument();
    expect(currentInput).toHaveFocus();
    expect({ actorReads, activityReads }).toEqual(before);
    expect(
      screen.getByRole('combobox', { name: 'Active Company' }),
    ).toHaveAttribute('data-value', companyId);
  },
  20_000,
);
