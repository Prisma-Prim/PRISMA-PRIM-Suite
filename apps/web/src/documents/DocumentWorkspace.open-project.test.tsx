import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { DocumentWorkspace } from './DocumentWorkspace';

const documentReader: ActorContext = {
  internalUserId: 'user',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Coordinator',
  email: 'coordinator@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company',
    displayName: 'PRISMA-PRIM',
    clientPermissions: ['client.read'],
    documentPermissions: ['document.read', 'document.reference.read'],
  },
};
const projectReader: ActorContext = {
  ...documentReader,
  activeCompany: {
    id: 'company',
    displayName: 'PRISMA-PRIM',
    clientPermissions: ['client.read'],
    documentPermissions: ['document.read', 'document.reference.read'],
    projectPermissions: ['project.read'],
  },
};
const identity: BrowserIdentity = {
  loaded: true,
  signedIn: true,
  getToken: async () => 'token',
  rejectSession: async () => undefined,
  signOut: async () => undefined,
  signedOutView: null,
};
const workingDocument = {
  id: 'document',
  companyId: 'company',
  clientId: 'client',
  clientDossierId: 'client',
  clientDisplayName: 'Atelier Demo SRL',
  title: 'Chestionar demo',
  purpose: 'Prepare the demonstration interview',
  type: 'questionnaire',
  confidentiality: 'company-confidential',
  createdAt: '2026-09-19T12:00:00.000Z',
  workingRevision: 1,
  correction: 'allowed',
  version: {
    id: 'version',
    status: 'draft',
    representation: {
      id: 'representation',
      kind: 'external-reference',
      verification: 'unverified',
      access: 'granted',
      url: 'https://example.test/questionnaire',
    },
  },
};
const linkedProject = { id: 'project-atelier', title: 'Pregătire demo' };
const linked = {
  ...workingDocument,
  projectAssociation: { state: 'linked', project: linkedProject },
};
const unlinked = {
  ...workingDocument,
  projectAssociation: { state: 'unlinked' },
};

afterEach(() => vi.unstubAllGlobals());

function serve(detail: unknown) {
  const fetcher = vi.fn(async (url: string) =>
    Response.json(
      url.endsWith('/clients')
        ? []
        : url.endsWith(`/documents/${workingDocument.id}`)
          ? detail
          : [workingDocument],
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
async function openDocument() {
  fireEvent.click(
    await screen.findByRole('button', { name: workingDocument.title }),
  );
  return screen.findByRole('article');
}
const openProjectAction = () =>
  screen.queryByRole('button', { name: 'Open Project' });

it.each(['classic', 'prisme'] as const)(
  'offers Open Project beside a linked Project row in %s and hands over only its id',
  async (presentation) => {
    const fetcher = serve(linked);
    const onOpenProject = vi.fn();
    render(
      <ApplicationPresentation value={presentation}>
        <DocumentWorkspace
          actor={projectReader}
          identity={identity}
          onOpenClientDossier={vi.fn()}
          onOpenProject={onOpenProject}
        />
      </ApplicationPresentation>,
    );
    const detail = await openDocument();
    const action = within(detail).getByRole('button', { name: 'Open Project' });
    // The same plain detail-row action as Open Client dossier.
    const dossierAction = within(detail).getByRole('button', {
      name: 'Open Client dossier',
    });
    expect(action).toHaveAttribute('type', 'button');
    expect(action.className).toBe(dossierAction.className);
    expect(
      within(detail).getByText('Project', { selector: 'dt' }).closest('dl')
        ?.nextElementSibling,
    ).toBe(action);
    const reads = fetcher.mock.calls.length;

    fireEvent.click(action);

    expect(onOpenProject).toHaveBeenCalledTimes(1);
    expect(onOpenProject).toHaveBeenCalledWith(linkedProject.id);
    expect(fetcher).toHaveBeenCalledTimes(reads);
    expect(detail.textContent).not.toContain(linkedProject.id);
  },
);

it.each([
  ['the Project is not linked', projectReader, unlinked, true],
  ['the response omits the association', projectReader, workingDocument, true],
  ['the actor cannot read Projects', documentReader, linked, true],
  ['the shell cannot open Projects', projectReader, linked, false],
])(
  'offers no Open Project action when %s',
  async (_case, reader, detail, canOpenProjects) => {
    serve(detail);
    render(
      <DocumentWorkspace
        actor={reader}
        identity={identity}
        onOpenProject={canOpenProjects ? vi.fn() : undefined}
      />,
    );
    await openDocument();
    expect(
      await screen.findByText(workingDocument.purpose),
    ).toBeInTheDocument();
    expect(openProjectAction()).not.toBeInTheDocument();
  },
);

it('withdraws the action with the Project row when the revalidated actor loses project.read', async () => {
  const fetcher = serve(linked);
  const onOpenProject = vi.fn();
  const view = render(
    <DocumentWorkspace
      actor={projectReader}
      identity={identity}
      onOpenProject={onOpenProject}
    />,
  );
  await openDocument();
  expect(openProjectAction()).toBeInTheDocument();
  const reads = fetcher.mock.calls.length;

  view.rerender(
    <DocumentWorkspace
      actor={documentReader}
      identity={identity}
      onOpenProject={onOpenProject}
    />,
  );

  expect(openProjectAction()).not.toBeInTheDocument();
  expect(screen.queryByText(linkedProject.title)).not.toBeInTheDocument();
  await act(async () => await new Promise((resolve) => setTimeout(resolve)));
  expect(fetcher).toHaveBeenCalledTimes(reads);
  expect(onOpenProject).not.toHaveBeenCalled();
});
