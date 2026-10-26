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
import { deterministicBrowserIdentity } from '../access-composition';
import { DocumentWorkspace } from './DocumentWorkspace';

const actor: ActorContext = {
  internalUserId: 'user',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Registrar',
  email: 'synthetic@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company',
    displayName: 'Company',
    clientPermissions: ['client.read'],
    documentPermissions: [
      'document.read',
      'document.register',
      'document.reference.read',
      'document.correct',
      'document.received_contract.access',
    ],
    receivedContractAccessAssignmentId: 'family',
    receivedContractAccessPermissionSetVersion: 'v1',
    contractPermissions: ['commercial.contract.read'],
    contractPermissionAssignmentId: 'contract',
    contractPermissionSetVersion: 'v2',
    commercialIntakePermissions: ['commercial.opportunity.read'],
    commercialIntakePermissionAssignmentId: 'intake',
    commercialIntakePermissionSetVersion: 'v4',
  },
};
const source = {
  opportunityId: 'opportunity',
  contractId: 'contract',
  contractVersionId: 'contract-version',
  contractVersionNumber: 1,
  illustrativeReference: 3,
  clientId: 'client',
  clientDisplayName: 'Synthetic Client',
  opportunityTitle: 'Synthetic mission',
};
const relation = {
  access: 'granted',
  opportunityId: 'opportunity',
  contractId: 'contract',
  contractVersionId: 'contract-version',
  contractVersionNumber: 1,
  illustrativeReference: 3,
  sourceDescription: 'Synthetic email source',
  receivedOn: null,
  registeredAt: '2026-10-25T10:00:00.000Z',
  registeredBy: { workspaceMembershipId: 'member', internalUserId: 'user' },
};
const document = {
  id: 'received',
  companyId: 'company',
  clientId: 'client',
  clientDisplayName: 'Synthetic Client',
  title: 'Received original',
  purpose: 'Preserve original',
  type: 'received-contract',
  confidentiality: 'company-confidential',
  createdAt: '2026-10-25T10:00:00.000Z',
  workingRevision: 1,
  correction: 'allowed',
  version: { id: 'version', status: 'draft', representation: null },
  receivedContractRelation: relation,
};
afterEach(() => vi.unstubAllGlobals());
it('registers from labeled exact selection without asking for a Client or URL and preserves the same command after a malformed success', async () => {
  const writes: Array<{ body: unknown; key: string | null }> = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://localhost').pathname;
    if (init?.method === 'POST') {
      writes.push({
        body: JSON.parse(String(init.body)),
        key: new Headers(init.headers).get('idempotency-key'),
      });
      return Response.json(
        writes.length === 1
          ? {}
          : writes.length === 2
            ? {
                ...document,
                receivedContractRelation: {
                  ...relation,
                  sourceDescription: 'A different declared source',
                },
              }
            : document,
        { status: 201 },
      );
    }
    if (path.endsWith('/received-contract-sources'))
      return Response.json({ sources: [source], nextCursor: null });
    if (path.endsWith('/clients'))
      return Response.json([{ id: 'client', displayName: 'Synthetic Client' }]);
    if (path.endsWith('/documents')) return Response.json([]);
    if (path.endsWith('/documents/received')) return Response.json(document);
    return new Response(null, { status: 404 });
  });
  render(
    <DocumentWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  await screen.findByRole('button', { name: 'Register working reference' });
  changeValue(screen.getByLabelText('Document family'), 'received-contract');
  await screen.findByLabelText('Exact Contract Version');
  await waitFor(() =>
    expect(screen.getByLabelText('Exact Contract Version')).not.toBeDisabled(),
  );
  expect(screen.queryByLabelText('Client')).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('External HTTPS link'),
  ).not.toBeInTheDocument();
  changeValue(
    screen.getByLabelText('Exact Contract Version'),
    'contract-version',
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Received original' },
  });
  fireEvent.change(screen.getByLabelText('Purpose'), {
    target: { value: 'Preserve original' },
  });
  fireEvent.change(screen.getByLabelText('Declared source'), {
    target: { value: 'Synthetic email source' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Register received Contract PDF' }),
  );
  await screen.findByText(
    'The result is uncertain. Retry the identical registration.',
  );
  expect(screen.getByLabelText('Title')).toBeDisabled();
  expect(screen.getByLabelText('Document family')).toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry identical registration' }),
  );
  await waitFor(() => expect(writes).toHaveLength(2));
  await screen.findByRole('button', { name: 'Retry identical registration' });
  expect(
    screen.queryByRole('heading', { name: 'Received original' }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry identical registration' }),
  );
  await screen.findByRole('heading', { name: 'Received original' });
  expect(writes).toHaveLength(3);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[2]).toEqual(writes[0]);
  expect(writes[0]?.body).toEqual({
    type: 'received-contract',
    opportunityId: 'opportunity',
    contractId: 'contract',
    contractVersionId: 'contract-version',
    title: 'Received original',
    purpose: 'Preserve original',
    sourceDescription: 'Synthetic email source',
    receivedOn: null,
  });
  await screen.findByText('Synthetic email source');
});

it('withholds stale Client dossier navigation after a late confirmation across an identity revision', async () => {
  let complete: ((response: Response) => void) | undefined;
  const refreshes: Array<() => void> = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://localhost').pathname;
    if (init?.method === 'POST')
      return new Promise<Response>((resolve) => {
        complete = resolve;
      });
    if (path.endsWith('/received-contract-sources'))
      return Response.json({ sources: [source], nextCursor: null });
    if (path.endsWith('/clients'))
      return Response.json([{ id: 'client', displayName: 'Synthetic Client' }]);
    if (path.endsWith('/documents')) return Response.json([]);
    if (path.endsWith('/documents/received'))
      return new Promise<Response>((resolve) =>
        refreshes.push(() =>
          resolve(Response.json({ ...document, clientDossierId: 'canonical' })),
        ),
      );
    return new Response(null, { status: 404 });
  });
  const props = {
    actor,
    identity: deterministicBrowserIdentity(),
    onOpenClientDossier: vi.fn(),
  };
  const view = render(
    <DocumentWorkspace {...props} clientIdentityRevision={0} />,
  );
  await screen.findByRole('button', { name: 'Register working reference' });
  changeValue(screen.getByLabelText('Document family'), 'received-contract');
  await waitFor(() =>
    expect(screen.getByLabelText('Exact Contract Version')).not.toBeDisabled(),
  );
  changeValue(
    screen.getByLabelText('Exact Contract Version'),
    'contract-version',
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Received original' },
  });
  fireEvent.change(screen.getByLabelText('Purpose'), {
    target: { value: 'Preserve original' },
  });
  fireEvent.change(screen.getByLabelText('Declared source'), {
    target: { value: 'Synthetic email source' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Register received Contract PDF' }),
  );
  await waitFor(() => expect(complete).toBeTypeOf('function'));
  view.rerender(<DocumentWorkspace {...props} clientIdentityRevision={1} />);
  await act(async () => {
    complete?.(
      Response.json(
        { ...document, clientDossierId: 'old-dossier' },
        { status: 201 },
      ),
    );
  });
  await screen.findByRole('heading', { name: 'Received original' });
  expect(
    screen.queryByRole('button', { name: 'Open Client dossier' }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(refreshes.length).toBeGreaterThan(0));
  await act(async () => {
    for (const release of refreshes) release();
  });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open Client dossier' }),
  );
  expect(props.onOpenClientDossier).toHaveBeenCalledWith('canonical');
});

it('revalidates lost source access without rejecting an independently authorized Company', async () => {
  const refreshed = {
    ...actor,
    activeCompany: { ...actor.activeCompany, contractPermissions: [] },
  };
  vi.stubGlobal('fetch', async (input: string) => {
    const path = new URL(input, 'http://localhost').pathname;
    if (path.endsWith('/received-contract-sources'))
      return new Response(null, { status: 403 });
    if (path.endsWith('/access/current-actor')) return Response.json(refreshed);
    if (path.endsWith('/clients')) return Response.json([]);
    if (path.endsWith('/documents')) return Response.json([]);
    return new Response(null, { status: 404 });
  });
  const onActorRevalidated = vi.fn(),
    onCompanyContextRejected = vi.fn();
  render(
    <DocumentWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
      onActorRevalidated={onActorRevalidated}
      onCompanyContextRejected={onCompanyContextRejected}
    />,
  );
  await screen.findByRole('button', { name: 'Register working reference' });
  changeValue(screen.getByLabelText('Document family'), 'received-contract');
  await waitFor(() =>
    expect(onActorRevalidated).toHaveBeenCalledWith(refreshed),
  );
  expect(onCompanyContextRejected).not.toHaveBeenCalled();
});
