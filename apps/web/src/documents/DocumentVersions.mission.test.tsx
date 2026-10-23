import {
  act,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import { deterministicBrowserIdentity } from '../access-composition';
import { DocumentVersions } from './DocumentVersions';
import { readDocument, readDocumentVersions } from './document-response';
const identity = deterministicBrowserIdentity();
const actor: ActorContext = {
  internalUserId: 'user',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Approver',
  email: 'approver@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company',
    displayName: 'Company',
    clientPermissions: ['client.read'],
    documentPermissions: [
      'document.read',
      'document.reference.read',
      'document.version.manage',
      'document.version.designate_official',
      'document.mission_deliverable.access',
    ],
    missionDeliverableAccessAssignmentId: 'grant-1',
    missionDeliverableAccessPermissionSetVersion: 'v1',
  },
};
const draft = {
  id: 'version',
  number: 1,
  status: 'draft',
  createdAt: '2026-10-23T12:00:00.000Z',
  createdBy: { displayName: 'Synthetic author' },
  representations: [],
  pdfContent: { state: 'absent' },
};
const versions = (pdfContent: unknown) => ({
  workingRevision: 1,
  mutable: true,
  versions: [{ ...draft, pdfContent }],
});
afterEach(() => vi.unstubAllGlobals());
it('offers official designation only for stored mission PDFs without requiring content read or exposing URL controls', async () => {
  let content: unknown = { state: 'absent' };
  vi.stubGlobal('fetch', async () => Response.json(versions(content)));
  const props = {
    actor,
    identity,
    documentId: 'mission',
    documentType: 'mission-deliverable',
    workingRevision: 1,
    onRefresh: vi.fn(),
  } satisfies Parameters<typeof DocumentVersions>[0];
  const view = render(<DocumentVersions {...props} />);
  await screen.findByText('This Version has no preserved PDF yet.');
  expect(
    screen.queryByRole('button', { name: 'Designate as official' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('External HTTPS link'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Add reference' }),
  ).not.toBeInTheDocument();
  content = { state: 'stored', access: 'denied' };
  view.rerender(<DocumentVersions {...props} workingRevision={2} />);
  await screen.findByRole('button', { name: 'Designate as official' });
  expect(
    screen.queryByRole('button', { name: 'Download Version 1 PDF' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Choose the PDF file'),
  ).not.toBeInTheDocument();
});
it('retires old family reads at revoke/regrant and rejects unknown captured authority', async () => {
  let release: ((response: Response) => void) | undefined;
  const old = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(old)
    .mockResolvedValue(Response.json(versions({ state: 'absent' })));
  vi.stubGlobal('fetch', fetcher);
  const props = {
    actor,
    identity,
    documentId: 'mission',
    documentType: 'mission-deliverable',
    workingRevision: 1,
    onRefresh: vi.fn(),
  } satisfies Parameters<typeof DocumentVersions>[0];
  const view = render(<DocumentVersions {...props} />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  view.rerender(
    <DocumentVersions
      {...props}
      actor={{
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          id: 'company',
          displayName: 'Company',
          missionDeliverableAccessAssignmentId: 'grant-2',
        },
      }}
    />,
  );
  await screen.findByText('This Version has no preserved PDF yet.');
  await act(async () =>
    release?.(
      Response.json({
        ...versions({ state: 'stored', access: 'denied' }),
        versions: [
          {
            ...draft,
            id: 'retired',
            number: 9,
            pdfContent: { state: 'stored', access: 'denied' },
          },
        ],
      }),
    ),
  );
  expect(
    screen.queryByRole('heading', { name: 'Version 9' }),
  ).not.toBeInTheDocument();
  view.rerender(
    <DocumentVersions
      {...props}
      actor={{
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          id: 'company',
          displayName: 'Company',
          missionDeliverableAccessPermissionSetVersion: undefined,
        },
      }}
    />,
  );
  expect(
    screen.queryByRole('region', { name: 'Versions' }),
  ).not.toBeInTheDocument();
});
it('validates family-specific references and clean-content presence at the response boundary', () => {
  const doc = {
    id: 'mission',
    companyId: 'company',
    clientId: 'client',
    clientDisplayName: 'Client',
    title: 'Mission',
    purpose: 'Purpose',
    type: 'mission-deliverable',
    confidentiality: 'company-confidential',
    createdAt: '2026-10-23T12:00:00.000Z',
    workingRevision: 1,
    correction: 'allowed',
    version: { id: 'version', status: 'draft', representation: null },
  };
  expect(readDocument(doc)).toMatchObject({
    type: 'mission-deliverable',
    version: { representation: null },
  });
  expect(() => readDocument({ ...doc, type: 'unknown' })).toThrow();
  expect(() => readDocument({ ...doc, type: 'questionnaire' })).toThrow();
  expect(() =>
    readDocument({ ...doc, version: { ...doc.version, representation: {} } }),
  ).toThrow();
  expect(
    readDocumentVersions(versions({ state: 'absent' }), 'mission-deliverable')
      .versions,
  ).toHaveLength(1);
  expect(() =>
    readDocumentVersions(versions({ state: 'absent' }), 'questionnaire'),
  ).toThrow();
  expect(() =>
    readDocumentVersions(
      {
        ...versions({ state: 'absent' }),
        versions: [{ ...draft, status: 'official' }],
      },
      'mission-deliverable',
    ),
  ).toThrow();
});
