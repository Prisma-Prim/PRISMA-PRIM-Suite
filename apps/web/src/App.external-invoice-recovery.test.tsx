import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
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
  installInternalTaskApp,
  internalTaskActor,
  publishInternalActor,
} from './test/internal-task-app';
import {
  invoiceUiActor,
  invoiceUiIds,
  invoiceUiSource,
} from './documents/external-invoice.ui.test-fixture';
import { clientId, companyId } from './test/mission-applicability-app-fixture';

const financialActor = {
  ...internalTaskActor,
  displayName: 'Original financial Actor',
  activeCompany: {
    ...internalTaskActor.activeCompany,
    ...invoiceUiActor.activeCompany,
    id: companyId,
    displayName: 'Company DEMO',
  },
};
const source = { ...invoiceUiSource, clientId };
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#documents');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

it.each(
  ['selected', 'Workspace', 'full-Actor'].flatMap((stage) =>
    [200, 403].map((status) => ({ stage, status })),
  ),
)(
  'retires older financial $stage recovery HTTP$status after newer same-Company captured administration',
  async ({ stage, status }) => {
    let trigger = false,
      held = false,
      finish: ((response: Response) => void) | undefined;
    const fresh = {
      ...financialActor,
      displayName: 'New financial Actor',
      activeCompany: {
        ...financialActor.activeCompany,
        externalInvoiceGrants: [
          {
            bundle: 'company_invoice_recorder',
            assignmentId: '10000000-0000-4000-8000-000000009999',
            permissionSetVersion: 'v1',
          },
          {
            bundle: 'company_external_invoice_access',
            assignmentId: invoiceUiIds.family,
            permissionSetVersion: 'v1',
          },
        ],
      },
    };
    const server = installInternalTaskApp(async (path, init) => {
      if (path === '/api/documents' && init?.method === 'POST') {
        trigger = true;
        return new Response(null, { status: 403 });
      }
      const company = new Headers(init?.headers).get('x-company-context-id');
      if (trigger && !held && path === '/api/access/current-actor') {
        if (stage === 'Workspace' && company)
          return new Response(null, { status: 403 });
        held = true;
        if (stage === 'full-Actor') return Response.json(financialActor);
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      if (
        trigger &&
        stage === 'full-Actor' &&
        held &&
        !finish &&
        path === '/api/activity-log'
      )
        return new Promise((resolve) => {
          finish = resolve;
        });
      if (path === '/api/documents') return Response.json([]);
      if (path === '/api/documents/external-invoice-sources')
        return Response.json({ sources: [source], nextCursor: null });
      return undefined;
    }, financialActor);
    server.setNextActor(fresh);
    render(<App identity={deterministicBrowserIdentity()} />);
    await screen.findByText('Original financial Actor');
    await screen.findByRole('button', { name: 'Register working reference' });
    changeValue(screen.getByLabelText('Document family'), 'external-invoice');
    const picker = await screen.findByLabelText(
      'Exact declared Contract Version and receiving party',
    );
    await waitFor(() => expect(picker).not.toBeDisabled());
    changeValue(picker, invoiceUiIds.contractVersion);
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Denied private invoice intent' },
    });
    fireEvent.change(screen.getByLabelText('Purpose'), {
      target: { value: 'Synthetic preservation' },
    });
    fireEvent.change(screen.getByLabelText('Declared external source'), {
      target: { value: 'Fictional manual process' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Register external invoice PDF' }),
    );
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    await publishInternalActor('grant', 'mission-result-reviewer');
    await screen.findByText('New financial Actor');
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Primary navigation' }),
      ).getByRole('link', { name: 'Projects' }),
    );
    const projects = await screen.findByRole('region', { name: 'Projects' });
    const title = within(projects).getByRole('textbox', {
      name: 'Project title',
    });
    fireEvent.change(title, {
      target: { value: 'Independent Project intent' },
    });
    title.focus();
    const before = server.counts();
    await act(async () => {
      finish?.(
        status === 403
          ? new Response(null, { status })
          : Response.json(
              stage === 'full-Actor'
                ? { events: [] }
                : stage === 'Workspace'
                  ? { ...financialActor, activeCompany: undefined }
                  : financialActor,
            ),
      );
    });
    expect(screen.getByText('New financial Actor')).toBeInTheDocument();
    expect(server.counts()).toEqual(before);
    expect(title).toHaveValue('Independent Project intent');
    expect(title).toHaveFocus();
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Primary navigation' }),
      ).getByRole('link', { name: 'Working Documents' }),
    );
    expect(
      screen.queryByDisplayValue('Denied private invoice intent'),
    ).toBeNull();
  },
);
