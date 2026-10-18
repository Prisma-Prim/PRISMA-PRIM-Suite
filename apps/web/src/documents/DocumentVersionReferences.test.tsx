import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { DocumentVersions } from './DocumentVersions';

const actor: ActorContext = {
  internalUserId: 'user',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Document Registrar',
  email: 'registrar@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company',
    displayName: 'PRISMA-PRIM',
    clientPermissions: ['client.read'],
    documentPermissions: [
      'document.read',
      'document.reference.read',
      'document.version.manage',
    ],
    documentPermissionSetVersion: 'v3',
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
const addedAt = '2026-09-29T08:00:00.000Z';
const reference = (
  id: string,
  position: number,
  form: 'editable' | 'rendered' | 'signed' | 'other',
  url: string,
  options: { appended?: boolean; granted?: boolean } = {},
) => ({
  id,
  kind: 'external-reference',
  verification: 'unverified',
  position,
  form,
  primary: position === 1,
  appendedAfterDesignation: options.appended ?? false,
  addedAt,
  addedBy: { displayName: 'Document Registrar' },
  ...(options.granted === false
    ? { access: 'denied' }
    : { access: 'granted', url }),
});
const draft = {
  id: 'draft',
  number: 2,
  status: 'draft',
  createdAt: addedAt,
  createdBy: { displayName: 'Document Registrar' },
  pdfContent: { state: 'absent' },
  representations: [
    reference('draft-editable', 1, 'editable', 'https://example.test/v2.docx'),
    reference('draft-rendered', 2, 'rendered', 'https://example.test/v2.pdf'),
  ],
};
const official = {
  id: 'official',
  number: 1,
  status: 'official',
  createdAt: addedAt,
  createdBy: { displayName: 'Document Registrar' },
  designatedAt: '2026-09-29T09:00:00.000Z',
  designatedBy: { displayName: 'Document Approver' },
  frozen: { title: 'Questionnaire', purpose: 'Assessment' },
  pdfContent: { state: 'absent' },
  representations: [
    reference(
      'official-editable',
      1,
      'editable',
      'https://example.test/v1.docx',
    ),
    reference(
      'official-signed',
      2,
      'signed',
      'https://example.test/v1-signed.pdf',
      { appended: true, granted: false },
    ),
  ],
};

interface RequestRecord {
  method: string;
  path: string;
  key: string | null;
  body: unknown;
}

afterEach(() => vi.unstubAllGlobals());

describe('typed Document Version references', () => {
  it('renders ordered metadata and retries an official append with the exact body and key', async () => {
    const requests: RequestRecord[] = [];
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        const request = {
          method: init?.method ?? 'GET',
          path: new URL(input, 'http://localhost').pathname,
          key: new Headers(init?.headers).get('idempotency-key'),
          body:
            typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        };
        requests.push(request);
        if (request.method === 'GET')
          return Response.json({
            workingRevision: 7,
            mutable: true,
            versions: [draft, official],
          });
        attempts += 1;
        if (attempts === 1) return new Response(null, { status: 502 });
        return Response.json(
          {
            documentId: 'document',
            workingRevision: 8,
            action: 'representation_added',
            versionId: 'official',
            versionNumber: 1,
            representationId: 'official-new-signed',
            appendedAfterDesignation: true,
          },
          { status: 201 },
        );
      }),
    );
    render(
      <DocumentVersions
        actor={actor}
        identity={identity}
        documentId="document"
        workingRevision={7}
        onRefresh={() => undefined}
      />,
    );
    const section = await screen.findByRole('region', { name: 'Versions' });
    const officialReferences = within(section).getByRole('list', {
      name: 'References for Version 1',
    });
    expect(officialReferences).toHaveTextContent('Editable · Position 1');
    expect(officialReferences).not.toHaveTextContent('Position 1 · Primary');
    expect(officialReferences).toHaveTextContent(
      'Signed · Position 2 · Added after designation',
    );
    expect(officialReferences).toHaveTextContent(
      'You do not have permission to open this reference.',
    );

    const officialRow = officialReferences.closest('li');
    if (!officialRow) throw new Error('Expected the official Version row.');
    fireEvent.click(within(officialRow).getByLabelText('Reference form'));
    fireEvent.click(screen.getByRole('option', { name: 'Signed' }));
    fireEvent.change(within(officialRow).getByLabelText('HTTPS URL'), {
      target: { value: 'https://example.test/v1-signature-2.pdf' },
    });
    fireEvent.click(
      within(officialRow).getByRole('button', {
        name: 'Add reference to official Version',
      }),
    );
    const confirmation = within(section).getByRole('group', {
      name: 'Add this reference to official Version 1? It will belong to this exact Version and can never be removed.',
    });
    expect(
      within(confirmation).getByRole('button', {
        name: 'Add irreversible reference',
      }),
    ).toHaveFocus();
    fireEvent.click(
      within(confirmation).getByRole('button', {
        name: 'Add irreversible reference',
      }),
    );
    expect(
      await within(section).findByText(
        'The result of this Version change is uncertain. Retry the exact same change safely.',
      ),
    ).toHaveAttribute('role', 'alert');
    fireEvent.click(
      within(section).getByRole('button', {
        name: 'Retry the same Version change',
      }),
    );
    await within(section).findByText('A reference was added to Version 1.');
    const writes = requests.filter((request) => request.method === 'POST');
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual(writes[1]);
    expect(writes[0]).toMatchObject({
      path: '/api/documents/document/versions/official/representations',
      key: expect.any(String),
      body: {
        expectedRevision: 7,
        form: 'signed',
        url: 'https://example.test/v1-signature-2.pdf',
      },
    });
  });

  it('removes either non-last draft reference through the shared revision', async () => {
    const writes: RequestRecord[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        const request = {
          method: init?.method ?? 'GET',
          path: new URL(input, 'http://localhost').pathname,
          key: new Headers(init?.headers).get('idempotency-key'),
          body:
            typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        };
        if (request.method === 'GET')
          return Response.json({
            workingRevision: 7,
            mutable: true,
            versions: [draft],
          });
        writes.push(request);
        return Response.json({
          documentId: 'document',
          workingRevision: 8,
          action: 'representation_removed',
          versionId: 'draft',
          versionNumber: 2,
          representationId: 'draft-editable',
        });
      }),
    );
    render(
      <DocumentVersions
        actor={actor}
        identity={identity}
        documentId="document"
        workingRevision={7}
        onRefresh={() => undefined}
      />,
    );
    const references = await screen.findByRole('list', {
      name: 'References for Version 2',
    });
    const remove = within(references).getAllByRole('button', {
      name: 'Remove',
    });
    expect(remove).toHaveLength(2);
    fireEvent.click(remove[0]!);
    await screen.findByText('A draft reference was removed from Version 2.');
    expect(writes).toEqual([
      {
        method: 'POST',
        path: '/api/documents/document/versions/draft/representations/draft-editable/removal',
        key: expect.any(String),
        body: { expectedRevision: 7 },
      },
    ]);
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Versions' })).toBeVisible(),
    );
  });
});
