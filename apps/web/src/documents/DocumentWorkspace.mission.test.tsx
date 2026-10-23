import {
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
      'document.correct',
      'document.reference.read',
      'document.mission_deliverable.access',
    ],
    missionDeliverableAccessAssignmentId: 'family-grant',
    missionDeliverableAccessPermissionSetVersion: 'v1',
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
const document = {
  id: 'mission',
  companyId: 'company',
  clientId: 'client',
  clientDisplayName: 'Synthetic Client',
  title: 'Mission analysis',
  purpose: 'Preserved mission deliverable',
  type: 'mission-deliverable',
  confidentiality: 'company-confidential',
  createdAt: '2026-10-23T12:00:00.000Z',
  workingRevision: 1,
  correction: 'allowed',
  version: { id: 'version', status: 'draft', representation: null },
};
afterEach(() => vi.unstubAllGlobals());
it('explicitly registers and corrects a mission deliverable without a fabricated URL', async () => {
  const writes: Array<{ method: string; body: unknown }> = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://localhost').pathname;
    if (init?.method === 'POST') {
      writes.push({ method: 'POST', body: JSON.parse(String(init.body)) });
      return Response.json(document, { status: 201 });
    }
    if (init?.method === 'PATCH') {
      writes.push({ method: 'PATCH', body: JSON.parse(String(init.body)) });
      return Response.json({
        documentId: 'mission',
        revision: 2,
        outcome: 'corrected',
      });
    }
    if (path.endsWith('/clients'))
      return Response.json([{ id: 'client', displayName: 'Synthetic Client' }]);
    if (path.endsWith('/documents'))
      return Response.json(writes.length ? [document] : []);
    if (path.endsWith('/documents/mission')) return Response.json(document);
    return new Response(null, { status: 404 });
  });
  render(<DocumentWorkspace actor={actor} identity={identity} />);
  await screen.findByRole('button', { name: 'Register working reference' });
  changeValue(screen.getByLabelText('Document family'), 'mission-deliverable');
  expect(
    screen.queryByLabelText('External HTTPS link'),
  ).not.toBeInTheDocument();
  changeValue(screen.getByLabelText('Client'), 'client');
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Mission analysis' },
  });
  fireEvent.change(screen.getByLabelText('Purpose'), {
    target: { value: 'Preserved mission deliverable' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Register working reference' }),
  );
  await screen.findByRole('heading', { name: 'Mission analysis' });
  expect(writes[0]?.body).toEqual({
    clientId: 'client',
    title: 'Mission analysis',
    purpose: 'Preserved mission deliverable',
    type: 'mission-deliverable',
  });
  expect(
    screen.queryByText('You do not have permission to open this reference.'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit reference' }));
  expect(
    screen.queryByLabelText('External HTTPS link'),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Updated mission' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
  await waitFor(() =>
    expect(writes[1]?.body).toEqual({
      expectedRevision: 1,
      title: 'Updated mission',
      purpose: 'Preserved mission deliverable',
    }),
  );
});

it('keeps a confirmed mission correction saved when its separate refresh fails', async () => {
  let confirmed = false;
  let patches = 0;
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://localhost').pathname;
    if (init?.method === 'PATCH') {
      patches += 1;
      confirmed = true;
      return Response.json({
        documentId: 'mission',
        revision: 2,
        outcome: 'corrected',
      });
    }
    if (path.endsWith('/clients'))
      return Response.json([{ id: 'client', displayName: 'Synthetic Client' }]);
    if (confirmed) return new Response(null, { status: 503 });
    if (path.endsWith('/documents')) return Response.json([document]);
    if (path.endsWith('/documents/mission')) return Response.json(document);
    return new Response(null, { status: 404 });
  });
  render(<DocumentWorkspace actor={actor} identity={identity} />);
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Mission analysis',
    }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit reference' }),
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Confirmed mission correction' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
  await screen.findByText('Correction saved.');
  await screen.findByText(
    'The command was confirmed, but the Document could not be refreshed. Reload to read its current state.',
  );
  expect(
    screen.queryByRole('button', { name: 'Retry same correction' }),
  ).not.toBeInTheDocument();
  expect(patches).toBe(1);
});

it('retries the exact uncertain mission registration with the same body and key', async () => {
  const attempts: Array<{ body: unknown; key: string | null }> = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://localhost').pathname;
    if (init?.method === 'POST') {
      attempts.push({
        body: JSON.parse(String(init.body)),
        key: new Headers(init.headers).get('idempotency-key'),
      });
      return attempts.length === 1
        ? new Response(null, { status: 503 })
        : Response.json(document, { status: 201 });
    }
    if (path.endsWith('/clients'))
      return Response.json([{ id: 'client', displayName: 'Synthetic Client' }]);
    if (path.endsWith('/documents')) return Response.json([]);
    return new Response(null, { status: 404 });
  });
  render(<DocumentWorkspace actor={actor} identity={identity} />);
  await screen.findByRole('button', { name: 'Register working reference' });
  changeValue(screen.getByLabelText('Document family'), 'mission-deliverable');
  changeValue(screen.getByLabelText('Client'), 'client');
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Mission analysis' },
  });
  fireEvent.change(screen.getByLabelText('Purpose'), {
    target: { value: 'Preserved mission deliverable' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Register working reference' }),
  );
  await screen.findByRole('alert');
  fireEvent.click(
    screen.getByRole('button', { name: 'Register working reference' }),
  );
  await screen.findByRole('heading', { name: 'Mission analysis' });
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(attempts[1]);
  expect(attempts[0]?.key).toBeTruthy();
  expect(attempts[0]?.body).not.toHaveProperty('url');
});
