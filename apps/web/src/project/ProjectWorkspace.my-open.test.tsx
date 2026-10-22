import { afterEach, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { changeValue } from '../test/select-option';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ProjectWorkspace } from './ProjectWorkspace';

const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    id: 'company',
    displayName: 'PRISMA-PRIM',
    projectPermissions: ['project.read', 'project.create'],
  },
};
const mine = {
  id: 'mine',
  companyId: 'company',
  clientAccountId: 'client',
  clientDossierId: 'client',
  clientDisplayName: 'Synthetic Client',
  title: 'My preparation',
  status: 'preparatory',
  createdAt: '2026-09-19T08:00:00.000Z',
};
const colleague = { ...mine, id: 'colleague', title: 'Colleague preparation' };
afterEach(() => vi.unstubAllGlobals());

it('chooses the current-user open directory and returns to the unchanged All directory', async () => {
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      requests.push(`${init?.method ?? 'GET'} ${path}`);
      if (path === '/api/clients')
        return Response.json([
          { id: 'client', displayName: 'Synthetic Client' },
        ]);
      if (path === '/api/projects') return Response.json([mine, colleague]);
      if (path === '/api/projects?view=mine_open') return Response.json([mine]);
      throw new Error('Unexpected public request: ' + path);
    }),
  );
  const identity = deterministicBrowserIdentity();
  render(<ProjectWorkspace actor={actor} identity={identity} />);
  const directory = await screen.findByRole('list', { name: 'Projects' });
  expect(
    await within(directory).findByRole('button', {
      name: 'My preparation Client: Synthetic Client',
    }),
  ).toBeInTheDocument();
  expect(
    within(directory).getByRole('button', {
      name: 'Colleague preparation Client: Synthetic Client',
    }),
  ).toBeInTheDocument();
  // Intended genuine RED: actual readiness above, then missing public view control.
  changeValue(
    screen.getByRole('combobox', { name: 'Project view' }),
    'mine_open',
  );
  await waitFor(() =>
    expect(
      requests.filter((row) => row === 'GET /api/projects?view=mine_open'),
    ).toHaveLength(1),
  );
  await waitFor(() =>
    expect(
      within(screen.getByRole('list', { name: 'Projects' })).queryByRole(
        'button',
        { name: 'Colleague preparation Client: Synthetic Client' },
      ),
    ).toBeNull(),
  );
  expect(
    within(screen.getByRole('list', { name: 'Projects' })).getByRole('button', {
      name: 'My preparation Client: Synthetic Client',
    }),
  ).toBeInTheDocument();
  changeValue(screen.getByRole('combobox', { name: 'Project view' }), 'all');
  await waitFor(() =>
    expect(
      within(screen.getByRole('list', { name: 'Projects' })).getByRole(
        'button',
        { name: 'Colleague preparation Client: Synthetic Client' },
      ),
    ).toBeInTheDocument(),
  );
  expect(requests.filter((row) => row === 'GET /api/projects')).toHaveLength(2);
  expect(requests.every((row) => row.startsWith('GET '))).toBe(true);
});
