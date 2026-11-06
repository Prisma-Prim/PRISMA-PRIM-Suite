import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { changeValue } from '../test/select-option';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { DocumentWorkspace } from './DocumentWorkspace';

const sourceId = '10000000-0000-4000-8000-000000000001';
const actor: ActorContext = {
  internalUserId: 'user',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Fictional workspace',
  displayName: 'Fictional recorder',
  email: 'fictional@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    id: 'company',
    displayName: 'Fictional company',
    documentPermissions: [
      'document.read',
      'document.register',
      'document.reference.read',
      'document.received_audit_source.access',
    ],
    documentPermissionAssignmentId: sourceId,
    documentPermissionSetVersion: 'v3',
    receivedAuditSourceAccessAssignmentId: sourceId,
    receivedAuditSourceAccessPermissionSetVersion: 'v1',
    workingEvidenceContextCapture: `working-evidence-context.v1.${'a'.repeat(64)}`,
    workingEvidenceClientReadCapture: `working-evidence-client-read.v1.${'a'.repeat(64)}`,
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
afterEach(() => vi.unstubAllGlobals());
it('deliberately preserves a received source without inventing an external reference or Project', async () => {
  const writes: unknown[] = [];
  const saved = {
    id: sourceId,
    companyId: 'company',
    clientId: 'client',
    clientDisplayName: 'Fictional Client',
    title: 'Fictional received original',
    purpose: 'Literal unverified working support',
    type: 'received-audit-source',
    confidentiality: 'company-confidential',
    createdAt: '2026-10-01T10:00:00.000Z',
    workingRevision: 1,
    correction: 'allowed',
    version: { id: sourceId, status: 'draft', representation: null },
  };
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://localhost').pathname;
    if (init?.method === 'POST') {
      writes.push(JSON.parse(String(init.body)));
      return Response.json(saved, { status: 201 });
    }
    if (path.endsWith('/clients'))
      return Response.json([{ id: 'client', displayName: 'Fictional Client' }]);
    if (path.endsWith('/documents'))
      return Response.json(writes.length ? [saved] : []);
    if (path.endsWith(`/documents/${sourceId}`)) return Response.json(saved);
    return new Response(null, { status: 404 });
  });
  render(<DocumentWorkspace actor={actor} identity={identity} />);
  await screen.findByRole('button', { name: 'Register working reference' });
  changeValue(
    screen.getByLabelText('Document family'),
    'received-audit-source',
  );
  expect(
    screen.queryByLabelText('External HTTPS link'),
  ).not.toBeInTheDocument();
  changeValue(screen.getByLabelText('Client'), 'client');
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: saved.title },
  });
  fireEvent.change(screen.getByLabelText('Purpose'), {
    target: { value: saved.purpose },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Register working reference' }),
  );
  await waitFor(() =>
    expect(writes).toEqual([
      {
        type: 'received-audit-source',
        clientId: 'client',
        title: saved.title,
        purpose: saved.purpose,
      },
    ]),
  );
  await screen.findByRole('heading', { name: saved.title });
});

it.each(['registration', 'correction'] as const)(
  'retires native source %s global401 recovery permanently across unrelated Actor A to B to A',
  async (kind) => {
    const nativeActor: ActorContext = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        id: 'company',
        displayName: 'Fictional company',
        documentPermissions: [
          ...(actor.activeCompany?.documentPermissions ?? []),
          'document.correct',
        ],
      },
    };
    const saved = {
      id: sourceId,
      companyId: 'company',
      clientId: 'client',
      clientDisplayName: 'Fictional Client',
      title: 'Fictional native source',
      purpose: 'Literal fictional source',
      type: 'received-audit-source',
      confidentiality: 'company-confidential',
      createdAt: '2026-10-01T10:00:00.000Z',
      workingRevision: 1,
      correction: 'allowed',
      version: { id: sourceId, status: 'draft', representation: null },
    };
    let resolveWrite: ((response: Response) => void) | undefined;
    let finishRecovery: (() => void) | undefined;
    const rejected = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRecovery = resolve;
        }),
    );
    const selectedIdentity = { ...identity, rejectSession: rejected };
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      const path = new URL(input, 'http://localhost').pathname;
      if (init?.method === 'POST' || init?.method === 'PATCH')
        return new Promise<Response>((resolve) => {
          resolveWrite = resolve;
        });
      if (path.endsWith('/clients'))
        return Response.json([
          { id: 'client', displayName: 'Fictional Client' },
        ]);
      if (path.endsWith('/documents'))
        return Response.json(kind === 'correction' ? [saved] : []);
      if (path.endsWith(`/documents/${sourceId}`)) return Response.json(saved);
      return new Response(null, { status: 404 });
    });
    const view = render(
      <DocumentWorkspace actor={nativeActor} identity={selectedIdentity} />,
    );
    await screen.findByRole('button', { name: 'Register working reference' });
    changeValue(
      screen.getByLabelText('Document family'),
      'received-audit-source',
    );
    if (kind === 'registration') {
      changeValue(screen.getByLabelText('Client'), 'client');
      fireEvent.change(screen.getByLabelText('Title'), {
        target: { value: saved.title },
      });
      fireEvent.change(screen.getByLabelText('Purpose'), {
        target: { value: saved.purpose },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Register working reference' }),
      );
    } else {
      fireEvent.click(await screen.findByRole('button', { name: saved.title }));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Edit reference' }),
      );
      fireEvent.change(screen.getByLabelText('Title'), {
        target: { value: 'Fictional corrected native title' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    }
    await waitFor(() => expect(resolveWrite).toBeDefined());
    const unrelatedReader: ActorContext = {
      ...nativeActor,
      activeCompany: {
        ...nativeActor.activeCompany,
        id: 'company',
        displayName: 'Fictional company',
        workingEvidenceCasePermissions: ['working_evidence_case.read'],
        workingEvidenceCaseReaderAssignmentId:
          '10000000-0000-4000-8000-000000000002',
        workingEvidenceCaseReaderPermissionSetVersion: 'v1',
      },
    };
    view.rerender(
      <DocumentWorkspace actor={unrelatedReader} identity={selectedIdentity} />,
    );
    view.rerender(
      <DocumentWorkspace actor={nativeActor} identity={selectedIdentity} />,
    );
    await act(async () => resolveWrite?.(new Response(null, { status: 401 })));
    expect(rejected).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', {
        name:
          kind === 'registration'
            ? 'Register working reference'
            : 'Save correction',
      }),
    ).toBeEnabled();
    expect(screen.queryByText('Correction saved.')).not.toBeInTheDocument();
    const retiredWrite = resolveWrite;
    fireEvent.click(
      screen.getByRole('button', {
        name:
          kind === 'registration'
            ? 'Register working reference'
            : 'Save correction',
      }),
    );
    await waitFor(() => expect(resolveWrite).not.toBe(retiredWrite));
    await act(async () => resolveWrite?.(new Response(null, { status: 401 })));
    expect(rejected).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('button', {
        name:
          kind === 'registration'
            ? 'Register working reference'
            : 'Save correction',
      }),
    ).toBeEnabled();
    expect(screen.queryByText('Correction saved.')).not.toBeInTheDocument();
    finishRecovery?.();
  },
);
