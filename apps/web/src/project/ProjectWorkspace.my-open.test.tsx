import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { changeValue } from '../test/select-option';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ProjectWorkspace } from './ProjectWorkspace';
import { companyGrants } from '../access/company-grants.test-fixture';

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

    grants: companyGrants({
      bundle: 'company_project_access',
      version: 'v1',
      assignmentId: 'project-grant',
    }),
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

it('resumes the held Mine directory after an equivalent Project grant is replaced', async () => {
  let allReads = 0;
  let mineReads = 0;
  let retiredSignal: AbortSignal | null | undefined;
  let finishMine: (response: Response) => void = () => {
    throw new Error('The original Mine read was not held.');
  };
  const held = new Promise<Response>((resolve) => {
    finishMine = resolve;
  });
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      switch (input.toString()) {
        case '/api/clients':
          return Response.json([
            { id: 'client', displayName: 'Synthetic Client' },
          ]);
        case '/api/projects':
          allReads += 1;
          return Response.json([mine, colleague]);
        case '/api/projects?view=mine_open':
          mineReads += 1;
          if (mineReads !== 1) return Response.json([mine]);
          retiredSignal = init?.signal;
          return held;
        default:
          throw new Error(`Unexpected request: ${input.toString()}`);
      }
    },
  );
  const identity = deterministicBrowserIdentity();
  const mounted = render(
    <ProjectWorkspace actor={actor} identity={identity} />,
  );
  await screen.findByRole('button', {
    name: 'Colleague preparation Client: Synthetic Client',
  });
  changeValue(
    screen.getByRole('combobox', { name: 'Project view' }),
    'mine_open',
  );
  await waitFor(() => expect(mineReads).toBe(1));

  mounted.rerender(
    <ProjectWorkspace
      actor={{
        ...actor,
        activeCompany: {
          id: 'company',
          displayName: 'PRISMA-PRIM',
          grants: companyGrants({
            bundle: 'company_project_access',
            version: 'v1',
            assignmentId: 'new-project-grant',
          }),
        },
      }}
      identity={identity}
    />,
  );
  await waitFor(() => expect(mineReads).toBe(2));
  expect(retiredSignal?.aborted).toBe(true);
  await act(async () => finishMine(new Response(null, { status: 403 })));
  expect(screen.getByRole('combobox', { name: 'Project view' })).toHaveValue(
    'mine_open',
  );
  expect(
    await screen.findByRole('button', {
      name: 'My preparation Client: Synthetic Client',
    }),
  ).toBeInTheDocument();
  expect(allReads).toBe(1);
});
