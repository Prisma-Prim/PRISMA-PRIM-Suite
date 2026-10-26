import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import { deterministicBrowserIdentity } from '../access-composition';
import { DocumentWorkspace } from './DocumentWorkspace';
import type { DocumentFamily } from './document-response';

const at = '2026-10-25T10:00:00.000Z';
const company: NonNullable<ActorContext['activeCompany']> = {
  id: 'company',
  displayName: 'Company',
  clientPermissions: ['client.read'],
  documentPermissions: [
    'document.read',
    'document.register',
    'document.reference.read',
    'document.correct',
    'document.version.manage',
    'document.content.read',
    'document.content.upload',
    'document.mission_deliverable.access',
    'document.received_contract.access',
  ],
  documentPermissionAssignmentId: 'registrar',
  documentPermissionSetVersion: 'v3',
  documentContentReaderAssignmentId: 'reader',
  documentContentReaderPermissionSetVersion: 'v1',
  documentContentUploaderAssignmentId: 'uploader',
  documentContentUploaderPermissionSetVersion: 'v1',
  missionDeliverableAccessAssignmentId: 'mission-grant',
  missionDeliverableAccessPermissionSetVersion: 'v1',
  receivedContractAccessAssignmentId: 'received-grant',
  receivedContractAccessPermissionSetVersion: 'v1',
};
const actor: ActorContext = {
  internalUserId: 'user',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Member',
  email: 'member@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: company,
};
type OptInFamily = Exclude<DocumentFamily, 'questionnaire'>;
function changeFamily(
  family: OptInFamily,
  active: boolean,
  captureId = 'replacement',
): ActorContext {
  const permission =
    family === 'received-contract'
      ? 'document.received_contract.access'
      : 'document.mission_deliverable.access';
  const next: NonNullable<ActorContext['activeCompany']> = {
    ...company,
    documentPermissions: active
      ? [...(company.documentPermissions ?? [])]
      : company.documentPermissions?.filter((value) => value !== permission),
  };
  if (family === 'received-contract') {
    next.receivedContractAccessAssignmentId = active ? captureId : undefined;
    next.receivedContractAccessPermissionSetVersion = active ? 'v1' : undefined;
  } else {
    next.missionDeliverableAccessAssignmentId = active ? captureId : undefined;
    next.missionDeliverableAccessPermissionSetVersion = active
      ? 'v1'
      : undefined;
  }
  return { ...actor, activeCompany: next };
}
function http(family: DocumentFamily) {
  const writes: Array<{
    body: BodyInit | null | undefined;
    key: string | null;
    path: string;
  }> = [];
  let stored = false;
  const reference = {
    id: 'reference',
    kind: 'external-reference',
    verification: 'unverified',
    access: 'granted',
    url: 'https://example.test/original',
  };
  const document = {
    id: 'document',
    companyId: 'company',
    clientId: 'client',
    clientDisplayName: 'Synthetic Client',
    title: 'Protected PDF work',
    purpose: 'Keep exact uncertain intent',
    type: family,
    confidentiality: 'company-confidential',
    createdAt: at,
    workingRevision: 1,
    correction: 'allowed',
    version: {
      id: 'version',
      status: 'draft',
      representation: family === 'questionnaire' ? reference : null,
    },
    ...(family === 'received-contract'
      ? { receivedContractRelation: { access: 'denied' } }
      : {}),
  };
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://localhost').pathname;
    if (init?.method === 'POST' && path.endsWith('/content')) {
      writes.push({
        body: init.body,
        key: new Headers(init.headers).get('idempotency-key'),
        path: String(input),
      });
      if (writes.length === 1) return new Response(null, { status: 503 });
      stored = true;
      return Response.json(
        {
          documentId: 'document',
          versionId: 'version',
          versionNumber: 1,
          workingRevision: 2,
          action: 'representation_added',
          representationId: 'pdf',
          appendedAfterDesignation: false,
        },
        { status: 201 },
      );
    }
    if (path.endsWith('/clients'))
      return Response.json([{ id: 'client', displayName: 'Synthetic Client' }]);
    if (path.endsWith('/documents'))
      return Response.json([{ ...document, workingRevision: stored ? 2 : 1 }]);
    if (path.endsWith('/documents/document'))
      return Response.json({ ...document, workingRevision: stored ? 2 : 1 });
    if (path.endsWith('/documents/document/versions'))
      return Response.json({
        workingRevision: stored ? 2 : 1,
        mutable: true,
        versions: [
          {
            id: 'version',
            number: 1,
            status: 'draft',
            createdAt: at,
            createdBy: { displayName: 'Member' },
            representations:
              family === 'questionnaire'
                ? [
                    {
                      ...reference,
                      position: 1,
                      form: 'other',
                      primary: true,
                      appendedAfterDesignation: false,
                      addedAt: at,
                      addedBy: { displayName: 'Member' },
                    },
                  ]
                : [],
            pdfContent: stored
              ? {
                  state: 'stored',
                  access: 'granted',
                  representationId: 'pdf',
                  revision: 2,
                  fileName: 'kept-original.pdf',
                  mediaType: 'application/pdf',
                  size: 20,
                  sha256: 'a'.repeat(64),
                  storedAt: at,
                  storedBy: { displayName: 'Member' },
                  scan: {
                    outcome: 'clean',
                    engine: 'ClamAV fixture',
                    scannedAt: at,
                  },
                }
              : { state: 'absent' },
          },
        ],
      });
    return new Response(null, { status: 404 });
  });
  return writes;
}
async function uncertainUpload() {
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Protected PDF work',
    }),
  );
  const file = await screen.findByLabelText('Choose the PDF file');
  fireEvent.change(file, {
    target: {
      files: [
        new File(['%PDF-1.4\nDEMO\n%%EOF\n'], 'kept-original.pdf', {
          type: 'application/pdf',
        }),
      ],
    },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Preserve PDF' }));
  await screen.findByRole('button', {
    name: 'Retry the same PDF',
  });
}
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
it.each([
  ['questionnaire', 'mission-deliverable'],
  ['questionnaire', 'received-contract'],
  ['mission-deliverable', 'received-contract'],
  ['received-contract', 'mission-deliverable'],
] as const)(
  'keeps %s uncertain PDF bytes/key while unrelated %s access is lost and replaced',
  async (family, other) => {
    const writes = http(family),
      identity = deterministicBrowserIdentity();
    const view = render(
      <DocumentWorkspace actor={actor} identity={identity} />,
    );
    await uncertainUpload();
    view.rerender(
      <DocumentWorkspace
        actor={changeFamily(other, false)}
        identity={identity}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Protected PDF work' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry the same PDF' }),
    ).toBeEnabled();
    view.rerender(
      <DocumentWorkspace
        actor={changeFamily(other, true)}
        identity={identity}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry the same PDF' }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]?.body).toBe(writes[0]?.body);
    expect(writes[1]?.key).toBe(writes[0]?.key);
    expect(writes[1]?.path).toBe(writes[0]?.path);
    await screen.findByText('kept-original.pdf', { exact: true });
  },
);
it.each(['mission-deliverable', 'received-contract'] as const)(
  'permanently retires %s uncertain PDF work when its own family access is lost and granted anew',
  async (family) => {
    http(family);
    const identity = deterministicBrowserIdentity();
    const view = render(
      <DocumentWorkspace actor={actor} identity={identity} />,
    );
    await uncertainUpload();
    view.rerender(
      <DocumentWorkspace
        actor={changeFamily(family, false)}
        identity={identity}
      />,
    );
    expect(
      screen.queryByRole('heading', {
        name: 'Protected PDF work',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry the same PDF' }),
    ).not.toBeInTheDocument();
    view.rerender(
      <DocumentWorkspace
        actor={changeFamily(family, true)}
        identity={identity}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Protected PDF work',
      }),
    );
    await screen.findByLabelText('Choose the PDF file');
    expect(
      screen.queryByRole('button', { name: 'Retry the same PDF' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Choose the PDF file')).toHaveValue('');
  },
);
