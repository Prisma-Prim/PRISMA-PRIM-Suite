import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { operationalHomeCopy as copy } from './operational-home/operational-home.copy';

const company = { id: 'company-attention', displayName: 'PRISMA-PRIM' };
const today = '2026-09-27';
const author = {
  internalUserId: 'ada',
  workspaceMembershipId: 'member-ada',
  displayName: 'Ada',
};
const project = {
  id: 'project-attention',
  title: 'Preparation — Știință / Имя',
  clientAccountId: 'client-attention',
  clientDisplayName: 'Literal {Client}',
  companyId: company.id,
  clientDossierId: 'client-attention',
  status: 'preparatory',
  createdAt: '2026-09-19T08:00:00.000Z',
};
function task(index: number) {
  return {
    description: null,
    id: `attention-task-${String(index).padStart(2, '0')}`,
    title: `Attention ${String(index).padStart(2, '0')} — Literal`,
    companyId: company.id,
    projectId: project.id,
    clientAccountId: project.clientAccountId,
    assignee: {
      workspaceMembershipId: author.workspaceMembershipId,
      displayLabel: 'Ada',
    },
    dueDate: '2026-09-20',
    priority: 'normal',
    status: 'todo',
    completion: null,
    version: 1,
    createdAt: '2026-09-19T09:00:00.000Z',
    updatedAt: '2026-09-19T09:00:00.000Z',
    createdBy: author,
    project: {
      id: project.id,
      title: project.title,
      clientDisplayName: project.clientDisplayName,
    },
    rules: ['overdue'],
    dueInDays: -7,
  };
}
function actor(): ActorContext {
  return {
    ...author,
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
    email: 'ada@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...company,
      clientPermissions: ['client.read'],
      clientPermissionAssignmentId: 'client-grant',
      clientPermissionSetVersion: 'v1',
      projectPermissions: ['project.read'],
      taskPermissions: ['task.read', 'task.manage'],
      taskPermissionAssignmentId: 'task-grant',
      taskPermissionSetVersion: 'v1',
    },
  };
}
function installServer() {
  const tasks = Array.from({ length: 27 }, (_, index) => task(index));
  const pages: number[] = [];
  const unexpected: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString(), window.location.origin);
      if (url.pathname === '/api/access/current-actor')
        return Response.json(actor());
      if (url.pathname === '/api/companies') return Response.json([company]);
      if (url.pathname === '/api/activity-log')
        return Response.json({ events: [] });
      if (url.pathname === '/api/operational-home')
        return Response.json({
          companyId: company.id,
          today,
          summaries: [{ kind: 'overdue_tasks', count: 27 }],
          attention: { matchingCount: 27, tasks: tasks.slice(0, 10) },
        });
      if (url.pathname === '/api/attention-tasks') {
        const offset = Number(url.searchParams.get('offset') ?? 0);
        pages.push(offset);
        return Response.json({
          companyId: company.id,
          today,
          total: 27,
          offset,
          pageSize: 25,
          tasks: tasks.slice(offset, offset + 25),
        });
      }
      // The old ordinary My Tasks destination is a valid supported read too.
      // The first RED must be the missing complete panel, never an HTTP404.
      if (url.pathname === '/api/assigned-tasks')
        return Response.json({ tasks });
      if (url.pathname === '/api/projects') return Response.json([project]);
      if (url.pathname === `/api/projects/${project.id}`)
        return Response.json(project);
      if (url.pathname === `/api/projects/${project.id}/tasks`)
        return Response.json({ mutable: true, tasks });
      if (url.pathname.endsWith('/eligible-task-assignees'))
        return Response.json({ members: [] });
      const selected = tasks.find(
        (entry) => url.pathname === `/api/tasks/${entry.id}`,
      );
      if (selected) return Response.json({ mutable: true, task: selected });
      if (url.pathname.endsWith('/history'))
        return Response.json({ events: [] });
      if (
        url.pathname === '/api/clients' ||
        url.pathname === '/api/clients/search'
      )
        return Response.json([]);
      if (url.pathname === '/api/client-duplicate-reviews')
        return Response.json({ items: [], next_cursor: null });
      unexpected.push(url.pathname);
      return new Response(null, { status: 404 });
    }),
  );
  return { pages, unexpected };
}
const originalScrollIntoView = Element.prototype.scrollIntoView;
describe('Complete My attention through App', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(
        (query: string) =>
          ({
            matches: true,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(() => false),
          }) satisfies MediaQueryList,
      ),
    );
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });
  it('opens all attention matches from the ready ten-row Home preview and pages beyond twenty-five', async () => {
    const api = installServer();
    render(<App identity={deterministicBrowserIdentity()} />);
    const preview = await screen.findByRole('region', {
      name: copy.attention.title,
    });
    expect(within(preview).getAllByRole('listitem')).toHaveLength(10);
    expect(preview).toHaveTextContent(
      'Showing 10 of 27 Tasks that need your attention.',
    );
    expect(
      within(preview)
        .getAllByRole('heading', { level: 4 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'Attention 00 — Literal',
      'Attention 01 — Literal',
      'Attention 02 — Literal',
      'Attention 03 — Literal',
      'Attention 04 — Literal',
      'Attention 05 — Literal',
      'Attention 06 — Literal',
      'Attention 07 — Literal',
      'Attention 08 — Literal',
      'Attention 09 — Literal',
    ]);
    expect(api.pages).toEqual([]);
    expect(api.unexpected).toEqual([]);
    const trigger = within(preview).getByRole('button', {
      name: copy.attention.seeAll,
    });
    fireEvent.click(trigger);
    const panel = await screen.findByRole('region', {
      name: 'All Tasks needing my attention — PRISMA-PRIM',
    });
    await within(panel).findByText('Attention 24 — Literal');
    expect(within(panel).getAllByRole('listitem')).toHaveLength(25);
    expect(panel).toHaveTextContent('Total: 27');
    expect(within(panel).getByRole('heading', { level: 4 })).toHaveFocus();
    expect(
      within(panel).getByRole('button', { name: 'Previous page' }),
    ).toBeDisabled();
    fireEvent.click(within(panel).getByRole('button', { name: 'Next page' }));
    await within(panel).findByText('Attention 26 — Literal');
    expect(within(panel).getAllByRole('listitem')).toHaveLength(2);
    expect(
      within(panel).getByRole('button', { name: 'Next page' }),
    ).toBeDisabled();
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Close all attention Tasks' }),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(api.pages).toEqual([0, 25]);
    expect(api.unexpected).toEqual([]);
    expect(window.location.hash).not.toBe('#my-tasks');
    expect(window.location.href).not.toContain(project.id);
  });
});
