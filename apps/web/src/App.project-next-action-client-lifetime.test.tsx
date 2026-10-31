import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from './test/render-with-interface-locale';
import { changeValue } from './test/select-option';
import {
  clientId,
  companyId,
  project,
} from './test/mission-applicability-app-fixture';
import {
  firstNextAction,
  installNextActionPublication,
  nextActionActor,
  nextActionPath,
  openNextActionApp,
} from './test/project-next-action-app';
import { preparatoryLifecycle } from './project/project-lifecycle.test-fixtures';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
it.each(['draft', 'uncertain'])(
  'revalidates original Client mutability after actual App union while preserving its independently valid %s',
  async (phase) => {
    const principal = {
      ...nextActionActor,
      activeCompany: {
        ...nextActionActor.activeCompany,
        clientPermissions: ['client.read', 'client.duplicate.resolve'],
        clientPermissionAssignmentId: 'client-live',
        clientPermissionSetVersion: 'v2',
      },
    };
    const original = {
        id: clientId,
        version: 1,
        displayName: project.clientDisplayName,
        taxId: 'PNA-UNION-DEMO',
        address: null,
        telephone: null,
        generalEmail: null,
        businessActivity: null,
        contacts: [],
      },
      canonical = {
        ...original,
        id: '20000000-0000-4000-8000-000000000002',
        displayName: 'Canonical Client DEMO',
      },
      company = { id: companyId, displayName: 'Company DEMO' };
    const first = firstNextAction('Initial action'),
      saved = { ...first.current, revision: 2, text: 'Retained native intent' };
    let united = false,
      committed = false;
    const writes: Array<{
      body: BodyInit | null | undefined;
      key: string | null;
    }> = [];
    const server = installNextActionPublication(
      principal,
      async (path, init) => {
        if (path === nextActionPath) {
          if (init?.method === 'POST') {
            writes.push({
              body: init.body,
              key: new Headers(init.headers).get('idempotency-key'),
            });
            if (!committed) {
              committed = true;
              throw new TypeError('Lost committed response');
            }
            return Response.json({
              format: 'project-next-action-command-v1',
              outcome: 'changed',
              record: saved,
            });
          }
          return Response.json(
            committed
              ? {
                  current: saved,
                  history: {
                    entries: [
                      {
                        revision: 2,
                        predecessorRevision: 1,
                        before: 'Initial action',
                        after: 'Retained native intent',
                        attribution: saved.lastChange,
                      },
                      ...first.history.entries,
                    ],
                    hasMore: false,
                    nextBeforeRevision: null,
                  },
                }
              : first,
          );
        }
        if (path.endsWith('/lifecycle'))
          return Response.json({ ...preparatoryLifecycle, mutable: !united });
        if (path === '/api/clients')
          return Response.json(
            (united ? [canonical] : [original, canonical]).map((client) => ({
              ...client,
              relatedToActiveCompany: true,
            })),
          );
        const client = [original, canonical].find(
          (client) => path === `/api/clients/${client.id}`,
        );
        if (client)
          return Response.json({
            ...client,
            relatedToActiveCompany: true,
            involvedCompanyDisplayNames: [company.displayName],
          });
        if (path.endsWith('/legal-entities'))
          return Response.json({ clientVersion: 1, legalEntities: [] });
        if (path.endsWith('/union-reviews'))
          return Response.json(
            {
              outcome: 'comparison',
              reviewReference: 'pna-union-review',
              clients: [original, canonical],
              companies: [company],
            },
            { status: 201 },
          );
        if (path === '/api/client-union-reviews/pna-union-review/confirm') {
          united = true;
          return Response.json(
            {
              outcome: 'united',
              canonicalClientId: canonical.id,
              projectionReference: 'pna-union-projection',
            },
            { status: 201 },
          );
        }
        return undefined;
      },
      principal,
    );
    const { panel, editor } = await openNextActionApp();
    fireEvent.change(editor, { target: { value: 'Retained native intent' } });
    if (phase === 'uncertain') {
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Replace next action' }),
      );
      await within(panel).findByText(
        'The reply is uncertain. Confirm this exact action before starting another.',
      );
    }
    const before = server.counts();
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Primary navigation' }),
      ).getByRole('link', { name: 'Clients' }),
    );
    const heading = await screen.findByRole('heading', {
        name: original.displayName,
      }),
      row = heading.closest('li');
    if (!row) throw new Error('Missing native Client row.');
    fireEvent.click(within(row).getByRole('button', { name: 'Open dossier' }));
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
      target: { value: 'Explicit native synthetic union' },
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
    await within(panel).findByText(
      'This closed or historical Project is read-only.',
    );
    expect(server.counts().actionReads).toBeGreaterThan(before.actionReads);
    expect(within(panel).getByRole('textbox', { name: 'Next action' })).toBe(
      editor,
    );
    expect(editor).toHaveValue('Retained native intent');
    expect(editor).toBeDisabled();
    if (phase === 'uncertain') {
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Retry the same action' }),
      );
      await within(panel).findByText('Next action saved.');
      expect(writes).toHaveLength(2);
      expect(writes[1]).toEqual(writes[0]);
    }
  },
);
