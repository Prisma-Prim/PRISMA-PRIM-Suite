import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import {
  actor,
  companyId,
  installParentServer,
  project,
  projectId,
} from './test/mission-applicability-app-fixture';
import { FakeCertificationServer } from './certification/certification.test-fixture';

// The Certification screens read only the grants list.
const projectGrant = {
  bundle: 'company_project_access',
  assignmentId: actor.activeCompany.projectPermissionAssignmentId,
  permissionSetVersion: 'v2',
  permissions: ['project.read', 'project.create', 'project.update'],
};
const reader = {
  bundle: 'company_certification_reader',
  assignmentId: 'certification-reader-grant',
  permissionSetVersion: 'v1',
  permissions: ['certification.read'],
};
const manager = {
  bundle: 'company_certification_programme_manager',
  assignmentId: 'certification-manager-grant',
  permissionSetVersion: 'v1',
  permissions: ['certification.programme.manage'],
};

function certificationActor(grants: 'none' | 'reader' | 'manager') {
  return {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      grants: [
        projectGrant,
        ...(grants === 'none' ? [] : [reader]),
        ...(grants === 'manager' ? [manager] : []),
      ],
    },
  };
}

function serve(grants: 'none' | 'reader' | 'manager') {
  const current = () => certificationActor(grants);
  const server = new FakeCertificationServer({
    actor: current,
    projectId,
    companyId,
  });
  installParentServer(current, async (path, init, url) =>
    path.includes('certification') ? server.fetch(url.href, init) : undefined,
  );
  return server;
}

async function openProject() {
  const projects = await screen.findByRole('region', { name: 'Projects' });
  fireEvent.click(
    await within(projects).findByRole('button', {
      name: new RegExp(project.title),
    }),
  );
  return screen.findByRole('tablist');
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('Certification tab through the real App composition', () => {
  it('is absent from the Project detail without the Certification Reader grant', async () => {
    const server = serve('none');
    render(<App identity={deterministicBrowserIdentity()} />);
    const tabs = await openProject();
    expect(
      within(tabs).queryByRole('tab', { name: 'Certification' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Certification' }),
    ).not.toBeInTheDocument();
    expect(server.requests).toEqual([]);
  });

  it('shows a reader the Cases by keyboard tab navigation without any mutation form', async () => {
    const server = serve('reader');
    const caseId = server.seed({
      orderReference: 'CERT-0001/01',
      application: true,
    });
    render(<App identity={deterministicBrowserIdentity()} />);
    const tabs = await openProject();
    const certificationTab = within(tabs).getByRole('tab', {
      name: 'Certification',
    });
    expect(certificationTab).toHaveAttribute('aria-selected', 'false');
    const lastTab = within(tabs).getAllByRole('tab').at(-1);
    expect(lastTab).toBe(certificationTab);
    const firstTab = within(tabs).getAllByRole('tab')[0];
    if (!firstTab) throw new Error('Missing first Project tab.');
    firstTab.focus();
    fireEvent.keyDown(firstTab, { key: 'End' });
    await waitFor(() =>
      expect(certificationTab).toHaveAttribute('aria-selected', 'true'),
    );
    expect(certificationTab).toHaveFocus();
    const panel = screen.getByRole('tabpanel', { name: 'Certification' });
    expect(panel).toBeVisible();
    fireEvent.click(
      await within(panel).findByRole('button', { name: 'CERT-0001/01' }),
    );
    expect(
      await within(panel).findByRole('heading', {
        name: 'Certification Case CERT-0001/01',
      }),
    ).toBeVisible();
    expect(
      within(panel).getByText(
        'You can consult this Case. Recording a step requires Company Certification Programme Manager.',
      ),
    ).toBeVisible();
    for (const name of [
      'Open a Certification Case',
      'Correct the application',
      'Record the review',
      'Record the application',
    ])
      expect(
        within(panel).queryByRole('button', { name }),
      ).not.toBeInTheDocument();
    expect(within(panel).queryByRole('form')).not.toBeInTheDocument();
    expect(
      server.requests.filter((request) => request.method !== 'GET'),
    ).toEqual([]);
    expect(
      server.requests.find(
        (request) => request.path === `/api/certification-cases/${caseId}`,
      )?.company,
    ).toBe(companyId);

    fireEvent.keyDown(certificationTab, { key: 'ArrowRight' });
    await waitFor(() => expect(firstTab).toHaveFocus());
    expect(panel).not.toBeVisible();
  });

  it('offers a programme manager the Case opening form in the tab', async () => {
    serve('manager');
    render(<App identity={deterministicBrowserIdentity()} />);
    const tabs = await openProject();
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Certification' }));
    const panel = screen.getByRole('tabpanel', { name: 'Certification' });
    expect(
      await within(panel).findByText(
        'No Certification Case is open in this Project.',
      ),
    ).toBeVisible();
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Open a Certification Case' }),
    );
    expect(
      await within(panel).findByRole('form', {
        name: 'Open a Certification Case',
      }),
    ).toBeVisible();
  });
});
