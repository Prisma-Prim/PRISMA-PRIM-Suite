import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { changeValue } from '../test/select-option';
import { afterEach, expect, it, vi } from 'vitest';
import { Suspense, startTransition } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { DocumentWorkspace } from './DocumentWorkspace';
import {
  companyGrants,
  withCompanyGrants,
} from '../access/company-grants.test-fixture';

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
    grants: companyGrants(
      {
        bundle: 'company_document_registrar',
        version: 'v1',
        assignmentId: 'registrar-assignment',
      },
      {
        bundle: 'company_received_audit_source_access',
        version: 'v1',
        assignmentId: sourceId,
      },
    ),
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
it('keeps the committed received-source draft when an authority replacement suspends', async () => {
  vi.stubGlobal('fetch', async (input: string) =>
    Response.json(
      input.endsWith('/clients')
        ? [{ id: 'client', displayName: 'Fictional Client' }]
        : [],
    ),
  );
  const waiting = new Promise<never>(() => undefined);
  let suspended = false;
  function Gate({ hold }: { hold: boolean }) {
    if (hold) {
      suspended = true;
      throw waiting;
    }
    return null;
  }
  function view(current: ActorContext, hold: boolean) {
    return (
      <Suspense fallback={<p>Source replacement pending</p>}>
        <DocumentWorkspace actor={current} identity={identity} />
        <Gate hold={hold} />
      </Suspense>
    );
  }
  const rendered = render(view(actor, false));
  await screen.findByRole('button', { name: 'Register working reference' });
  changeValue(
    screen.getByLabelText('Document family'),
    'received-audit-source',
  );
  changeValue(screen.getByLabelText('Client'), 'client');
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Unsent committed source' },
  });
  const company = actor.activeCompany;
  if (!company) throw new Error('Expected source Company');
  const replacement: ActorContext = {
    ...actor,
    activeCompany: {
      ...company,
      grants: withCompanyGrants(company.grants, {
        bundle: 'company_received_audit_source_access',
        version: 'v1',
        assignmentId: '10000000-0000-4000-8000-000000000099',
      }),
    },
  };
  act(() => startTransition(() => rendered.rerender(view(replacement, true))));
  await waitFor(() => expect(suspended).toBe(true));
  expect(
    screen.queryByText('Source replacement pending'),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Purpose'), {
    target: { value: 'Still editing the displayed source' },
  });
  expect(screen.getByLabelText('Title')).toHaveValue('Unsent committed source');
  expect(screen.getByLabelText('Purpose')).toHaveValue(
    'Still editing the displayed source',
  );
  expect(
    screen.queryByLabelText('External HTTPS link'),
  ).not.toBeInTheDocument();
});
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
        grants: withCompanyGrants(actor.activeCompany?.grants, {
          bundle: 'company_document_registrar',
          version: 'v2',
          assignmentId: 'registrar-assignment',
        }),
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
        grants: withCompanyGrants(nativeActor.activeCompany?.grants, {
          bundle: 'company_working_evidence_case_reader',
          version: 'v1',
          assignmentId: '10000000-0000-4000-8000-000000000002',
        }),
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
