import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  type InterfaceLocale,
} from '../localization/interface-locale';
import { MyAttention } from './MyAttention';
import { deterministicBrowserIdentity } from '../access-composition';
import { operationalHomeCopy as copy } from './operational-home.copy';
import { readOperationalHome } from './operational-home-response';

const company = { id: 'company-a', displayName: 'PRISMA-PRIM' };
const today = '2026-09-27';
const project = {
  id: 'project-iso',
  title: 'ISO 9001 — GRUP Demo SA',
  clientDisplayName: 'GRUP Demo SA',
};
const attribution = {
  internalUserId: 'ana',
  workspaceMembershipId: 'membership-ana',
  displayName: 'Ana',
};

afterEach(() => {
  localStorage.removeItem(interfaceLocaleStorageKey);
});
function task(
  id: string,
  title: string,
  dueDate: string | null,
  changes: Record<string, unknown>,
) {
  return {
    id,
    companyId: company.id,
    projectId: project.id,
    clientAccountId: 'client-grup',
    title,
    assignee: {
      workspaceMembershipId: attribution.workspaceMembershipId,
      displayLabel: 'Ana · 1',
    },
    dueDate,
    priority: 'normal',
    status: 'todo',
    completion: null,
    version: 1,
    createdAt: '2026-09-19T09:00:00.000Z',
    updatedAt: '2026-09-19T09:00:00.000Z',
    createdBy: attribution,
    project,
    ...changes,
  };
}
const tasks = [
  task('collect', 'Collect procedures', '2026-09-20', {
    rules: ['overdue'],
    dueInDays: -7,
  }),
  task('approve', 'Approve audit plan', null, {
    priority: 'critical',
    rules: ['critical'],
    dueInDays: null,
  }),
  task('signature', 'Obtain client signature', null, {
    status: 'blocked',
    blockage: {
      reason: 'Waiting for the Client.',
      actor: attribution,
      occurredAt: '2026-09-24T10:00:00.000Z',
    },
    rules: ['blocked'],
    dueInDays: null,
  }),
  task('audit', 'Plan internal audit', today, {
    rules: ['due_soon'],
    dueInDays: 0,
  }),
  task('invite', 'Send training invitations', '2026-10-02', {
    rules: ['due_soon'],
    dueInDays: 5,
  }),
];

const localizedLargeOverdueLabels: ReadonlyArray<{
  locale: InterfaceLocale;
  label: string;
}> = [
  { locale: 'ro', label: 'Restantă de 1.234 zile' },
  { locale: 'ru', label: 'Просрочено на 1 234 дн.' },
  { locale: 'fr', label: 'En retard de 1 234 jours' },
  { locale: 'en', label: 'Overdue by 1,234 days' },
];

function attention(matchingCount = tasks.length) {
  const view = readOperationalHome(
    {
      companyId: company.id,
      today,
      summaries: [],
      attention: { matchingCount, tasks },
    },
    {
      companyId: company.id,
      workspaceMembershipId: attribution.workspaceMembershipId,
    },
  );
  if (!view.attention) throw new Error('Expected attention fixture.');
  return view.attention;
}

it('shows every Task fact and rule, then opens the Task and My Tasks through existing intents', () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const onOpenTask = vi.fn();
  const onOpenMyTasks = vi.fn();
  render(
    <InterfaceLocaleProvider>
      <MyAttention
        identity={deterministicBrowserIdentity()}
        workspaceMembershipId={attribution.workspaceMembershipId}
        attention={attention()}
        company={company}
        today={today}
        onOpenTask={onOpenTask}
        onOpenMyTasks={onOpenMyTasks}
      />
    </InterfaceLocaleProvider>,
  );
  const region = screen.getByRole('region', { name: copy.attention.title });
  const rows = within(region).getAllByRole('listitem');
  expect(region).toHaveTextContent(
    'Showing 5 of 5 Tasks that need your attention.',
  );
  expect(rows).toHaveLength(5);
  expect(rows[0]).toHaveTextContent('Overdue by 7 days');
  expect(rows[1]).toHaveTextContent('Critical');
  expect(rows[1]).toHaveTextContent('No due date');
  expect(rows[2]).toHaveTextContent('Blocked');
  expect(rows[3]).toHaveTextContent('Due today');
  expect(rows[3]).toHaveTextContent('Sep 27, 2026');
  expect(rows[4]).toHaveTextContent('Due in 5 days');
  for (const row of rows) {
    expect(row).toHaveTextContent(project.title);
    expect(row).toHaveTextContent(project.clientDisplayName);
  }
  fireEvent.click(
    within(rows[2] ?? region).getByRole('button', {
      name: copy.attention.openTask({
        task: 'Obtain client signature',
        project: project.title,
        client: project.clientDisplayName,
      }),
    }),
  );
  expect(onOpenTask).toHaveBeenCalledWith({
    projectId: project.id,
    taskId: 'signature',
  });
  fireEvent.click(
    within(region).getByRole('button', { name: copy.attention.openMyTasks }),
  );
  expect(onOpenMyTasks).toHaveBeenCalledOnce();
});

it('states the empty Company/date and the bounded total', () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const { rerender } = render(
    <InterfaceLocaleProvider>
      <MyAttention
        identity={deterministicBrowserIdentity()}
        workspaceMembershipId={attribution.workspaceMembershipId}
        attention={{ matchingCount: 0, tasks: [] }}
        company={company}
        today={today}
        onOpenMyTasks={() => undefined}
      />
    </InterfaceLocaleProvider>,
  );
  expect(
    screen.getByRole('region', { name: copy.attention.title }),
  ).toHaveTextContent(
    'Nothing needs your attention in PRISMA-PRIM on Sep 27, 2026.',
  );
  rerender(
    <InterfaceLocaleProvider>
      <MyAttention
        identity={deterministicBrowserIdentity()}
        workspaceMembershipId={attribution.workspaceMembershipId}
        attention={attention(12)}
        company={company}
        today={today}
        onOpenMyTasks={() => undefined}
      />
    </InterfaceLocaleProvider>,
  );
  expect(
    screen.getByRole('region', { name: copy.attention.title }),
  ).toHaveTextContent('Showing 5 of 12 Tasks that need your attention.');
});

it.each(localizedLargeOverdueLabels)(
  'renders a large overdue day count in $locale without changing its canonical value',
  ({ locale, label }) => {
    localStorage.setItem(interfaceLocaleStorageKey, locale);
    const overdueTask = task(
      'long-overdue',
      'Review historical evidence',
      '2023-05-12',
      {
        rules: ['overdue'],
        dueInDays: -1_234,
      },
    );
    const view = readOperationalHome(
      {
        companyId: company.id,
        today,
        summaries: [],
        attention: { matchingCount: 1, tasks: [overdueTask] },
      },
      {
        companyId: company.id,
        workspaceMembershipId: attribution.workspaceMembershipId,
      },
    );
    if (!view.attention) throw new Error('Expected attention fixture.');

    render(
      <InterfaceLocaleProvider>
        <MyAttention
          identity={deterministicBrowserIdentity()}
          workspaceMembershipId={attribution.workspaceMembershipId}
          attention={view.attention}
          company={company}
          today={today}
          onOpenMyTasks={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );

    expect(view.attention.tasks[0]?.dueInDays).toBe(-1_234);
    const region = screen.getByRole('region', { name: /.+/ });
    expect(within(region).getByRole('listitem').textContent).toContain(label);
  },
);
