import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { InterfaceLocaleProvider } from '../localization/interface-locale';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { MyTasks } from './MyTasks';
import { deferred } from '../production-shell/production-shell-context.test-fixtures';
import type { AssignedTask } from './task-response';

const actor: ActorContext = {
  internalUserId: 'reader',
  workspaceMembershipId: 'membership-reader',
  workspaceId: 'workspace',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Ana',
  email: 'ana@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    id: 'company',
    displayName: 'Synthetic Company',
    projectPermissions: ['project.read'],
    taskPermissions: ['task.read'],
    taskPermissionAssignmentId: 'task-grant',
    taskPermissionSetVersion: 'v1',
  },
};
const task: AssignedTask = {
  id: 'task-one',
  companyId: 'company',
  projectId: 'project-one',
  clientAccountId: 'client-one',
  title: 'Chestionar {inițial} — Проверка',
  assignee: {
    workspaceMembershipId: actor.workspaceMembershipId,
    displayLabel: 'Ana',
  },
  dueDate: '2026-09-30',
  priority: 'critical',
  status: 'todo',
  completion: null,
  version: 1,
  createdAt: '2026-09-19T09:00:00.000Z',
  updatedAt: '2026-09-19T09:00:00.000Z',
  createdBy: {
    internalUserId: actor.internalUserId,
    workspaceMembershipId: actor.workspaceMembershipId,
    displayName: actor.displayName,
  },
  project: {
    id: 'project-one',
    title: 'Pregătire {task} — Проект',
    clientDisplayName: 'Client {project} — Клиент',
  },
};
function renderTasks(onOpenTask = vi.fn()) {
  render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <MyTasks
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onOpenTask={onOpenTask}
      />
    </InterfaceLocaleProvider>,
  );
  return onOpenTask;
}
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
it('starts the complete read-only list in Romanian and preserves literal content and canonical row identities', async () => {
  const fetch = vi.fn(async () => Response.json({ tasks: [task] }));
  vi.stubGlobal('fetch', fetch);
  const opened = renderTasks();
  const list = await screen.findByRole('list', {
    name: 'Sarcinile deschise atribuite dvs.',
  });
  expect(screen.getByRole('heading', { name: 'Sarcinile mele' })).toBeVisible();
  expect(within(list).getByRole('heading', { name: task.title })).toBeVisible();
  expect(within(list).getByText('De făcut')).toBeVisible();
  expect(within(list).getByText('Critică')).toBeVisible();
  expect(within(list).getByText('30 sept. 2026')).toHaveAttribute(
    'datetime',
    '2026-09-30',
  );
  fireEvent.click(
    within(list).getByRole('button', {
      name: `Deschideți ${task.title} în ${task.project.title} (${task.project.clientDisplayName})`,
    }),
  );
  await waitFor(() =>
    expect(opened).toHaveBeenCalledWith({
      projectId: 'project-one',
      taskId: 'task-one',
    }),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});

const locales = [
  {
    code: 'ro',
    name: 'Română',
    title: 'Sarcinile mele',
    list: 'Sarcinile deschise atribuite dvs.',
    loading: 'Se încarcă Sarcinile dvs. deschise…',
    note: 'Doar pentru citire. Editați sau finalizați o Sarcină în Proiectul său.',
    refresh: 'Actualizați Sarcinile mele',
    project: 'Proiect',
    client: 'Client',
    due: 'Termen',
    priority: 'Prioritate',
    date: '30 sept. 2026',
    early: '31 dec. 99',
    noDate: 'Fără termen',
    todo: 'De făcut',
    progress: 'În desfășurare',
    blocked: 'Blocată',
    normal: 'Normală',
    important: 'Importantă',
    critical: 'Critică',
    open: 'Deschideți',
  },
  {
    code: 'ru',
    name: 'Русский',
    title: 'Мои задачи',
    list: 'Открытые Задачи, назначенные вам',
    loading: 'Загрузка ваших открытых Задач…',
    note: 'Только для чтения. Изменить или завершить Задачу можно в её Проекте.',
    refresh: 'Обновить Мои Задачи',
    project: 'Проект',
    client: 'Клиент',
    due: 'Срок',
    priority: 'Приоритет',
    date: '30 сент. 2026 г.',
    early: '31 дек. 99 г.',
    noDate: 'Без срока',
    todo: 'К выполнению',
    progress: 'В работе',
    blocked: 'Заблокирована',
    normal: 'Обычный',
    important: 'Важный',
    critical: 'Критический',
    open: 'Открыть',
  },
  {
    code: 'fr',
    name: 'Français',
    title: 'Mes Tâches',
    list: 'Tâches ouvertes qui vous sont attribuées',
    loading: 'Chargement de vos Tâches ouvertes…',
    note: 'Lecture seule. Modifiez ou terminez une Tâche dans son Projet.',
    refresh: 'Actualiser Mes Tâches',
    project: 'Projet',
    client: 'Client',
    due: 'Échéance',
    priority: 'Priorité',
    date: '30 sept. 2026',
    early: '31 déc. 99',
    noDate: 'Sans échéance',
    todo: 'À faire',
    progress: 'En cours',
    blocked: 'Bloquée',
    normal: 'Normale',
    important: 'Importante',
    critical: 'Critique',
    open: 'Ouvrir',
  },
  {
    code: 'en',
    name: 'English',
    title: 'My Tasks',
    list: 'Open Tasks assigned to you',
    loading: 'Loading your open Tasks…',
    note: 'Read-only. Edit or complete a Task in its Project.',
    refresh: 'Refresh My Tasks',
    project: 'Project',
    client: 'Client',
    due: 'Due date',
    priority: 'Priority',
    date: 'Sep 30, 2026',
    early: 'Dec 31, 99',
    noDate: 'No due date',
    todo: 'To do',
    progress: 'In progress',
    blocked: 'Blocked',
    normal: 'Normal',
    important: 'Important',
    critical: 'Critical',
    open: 'Open',
  },
] as const;
function chooseLocale(name: string) {
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(screen.getByRole('option', { name }));
}
const early: AssignedTask = {
  ...task,
  id: 'task-early',
  title: 'Pregătire {client}',
  dueDate: '0099-12-31',
  priority: 'normal',
  status: 'in_progress',
};
const undated: AssignedTask = {
  ...task,
  id: 'task-undated',
  title: 'Проверка {task}',
  dueDate: null,
  priority: 'important',
  status: 'blocked',
  blockage: {
    actor: task.createdBy,
    occurredAt: task.createdAt,
    reason: 'Lipsă {fișier}',
  },
};
it('changes locale during a pending read and then translates every loaded fact without another read or changing order/content', async () => {
  const reply = deferred<Response>();
  const fetch = vi.fn(() => reply.promise);
  vi.stubGlobal('fetch', fetch);
  renderTasks();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  for (const locale of locales) {
    chooseLocale(locale.name);
    expect(screen.getByRole('status')).toHaveTextContent(locale.loading);
    expect(screen.getByRole('heading', { name: locale.title })).toBeVisible();
    expect(screen.getByText(locale.note)).toBeVisible();
  }
  expect(fetch).toHaveBeenCalledTimes(1);
  reply.resolve(Response.json({ tasks: [early, task, undated] }));
  await screen.findByRole('list', { name: 'Open Tasks assigned to you' });
  for (const locale of locales) {
    chooseLocale(locale.name);
    const list = screen.getByRole('list', { name: locale.list });
    const rows = within(list).getAllByRole('listitem');
    expect(
      rows.map((row) => within(row).getByRole('heading').textContent),
    ).toEqual([early.title, task.title, undated.title]);
    expect(screen.getByRole('button', { name: locale.refresh })).toBeVisible();
    const first = rows[0];
    const second = rows[1];
    const last = rows[2];
    if (!first || !second || !last)
      throw new Error('Expected three assigned rows');
    expect(within(first).getByText(locale.early)).toHaveAttribute(
      'datetime',
      '0099-12-31',
    );
    expect(within(second).getByText(locale.date)).toHaveAttribute(
      'datetime',
      '2026-09-30',
    );
    expect(within(second).getByText(locale.project)).toBeVisible();
    expect(within(second).getByText(locale.client)).toBeVisible();
    expect(within(second).getByText(locale.due)).toBeVisible();
    expect(within(second).getByText(locale.priority)).toBeVisible();
    expect(within(second).getByText(task.project.title)).toBeVisible();
    expect(
      within(second).getByText(task.project.clientDisplayName),
    ).toBeVisible();
    expect(within(second).getByText(locale.todo)).toBeVisible();
    expect(within(first).getByText(locale.progress)).toBeVisible();
    expect(within(last).getByText(locale.blocked)).toBeVisible();
    expect(within(first).getByText(locale.normal)).toBeVisible();
    expect(within(second).getByText(locale.critical)).toBeVisible();
    expect(within(last).getByText(locale.important)).toBeVisible();
    expect(within(last).getByText(locale.noDate)).toBeVisible();
    expect(within(last).queryByRole('time')).not.toBeInTheDocument();
  }
  expect(fetch).toHaveBeenCalledTimes(1);
});

const recovery = {
  ro: {
    empty: 'Nu există Sarcini deschise atribuite dvs.',
    denied:
      'Pentru Sarcinile dvs. deschise sunt necesare accesul de citire la Sarcini, Proiecte și Client în această Companie.',
    error: 'Sarcinile dvs. deschise nu au putut fi încărcate.',
    retry: 'Reîncercați',
  },
  ru: {
    empty: 'Нет открытых Задач, назначенных вам',
    denied:
      'Для ваших открытых Задач нужен доступ на чтение Задач, Проектов и Клиента в этой Компании.',
    error: 'Не удалось загрузить ваши открытые Задачи.',
    retry: 'Повторить',
  },
  fr: {
    empty: 'Aucune Tâche ouverte ne vous est attribuée',
    denied:
      'Vos Tâches ouvertes nécessitent un accès en lecture aux Tâches, Projets et Client dans cette Compagnie.',
    error: 'Vos Tâches ouvertes n’ont pas pu être chargées.',
    retry: 'Réessayer',
  },
  en: {
    empty: 'No open Tasks assigned to you',
    denied:
      'Your open Tasks need Task, Project and Client read access in this Company.',
    error: 'Your open Tasks could not be loaded.',
    retry: 'Retry',
  },
};
it.each(['error', 'denied', 'empty', 'malformed'] as const)(
  'translates the %s state without reading until explicit recovery',
  async (state) => {
    let reads = 0;
    const fetch = vi.fn(async () => {
      reads += 1;
      if (reads > 1) return Response.json({ tasks: [task] });
      if (state === 'error') return new Response(null, { status: 503 });
      if (state === 'denied') return new Response(null, { status: 403 });
      if (state === 'malformed')
        return Response.json({
          tasks: [{ ...task, companyId: 'other-company' }],
        });
      return Response.json({ tasks: [] });
    });
    vi.stubGlobal('fetch', fetch);
    renderTasks();
    const displayState = state === 'malformed' ? 'error' : state;
    await screen.findByText(recovery.ro[displayState]);
    for (const locale of locales) {
      chooseLocale(locale.name);
      expect(
        screen.getByText(recovery[locale.code][displayState]),
      ).toBeVisible();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: locale.open }),
      ).not.toBeInTheDocument();
      expect(fetch).toHaveBeenCalledTimes(1);
    }
    fireEvent.click(
      screen.getByRole('button', {
        name: displayState === 'error' ? 'Retry' : 'Refresh My Tasks',
      }),
    );
    await screen.findByRole('heading', { name: task.title });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByText(recovery.en[displayState]),
    ).not.toBeInTheDocument();
  },
);

it('keeps the newest explicit read when locale changes before a superseded reply arrives', async () => {
  const older = deferred<Response>();
  const newer = deferred<Response>();
  let reads = 0;
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    requests.push({ url, init });
    return ++reads === 1 ? older.promise : newer.promise;
  });
  vi.stubGlobal('fetch', fetch);
  renderTasks();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  chooseLocale('Français');
  fireEvent.click(
    screen.getByRole('button', { name: 'Actualiser Mes Tâches' }),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(requests[0]?.init?.signal?.aborted).toBe(true);
  chooseLocale('Русский');
  const current = { ...task, title: 'Current {read} — Актуально' };
  newer.resolve(Response.json({ tasks: [current] }));
  await screen.findByRole('heading', { name: current.title });
  chooseLocale('Română');
  await act(async () => older.resolve(Response.json({ tasks: [task] })));
  expect(
    screen.queryByRole('heading', { name: task.title }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: current.title })).toBeVisible();
  expect(screen.getByRole('list', { name: locales[0].list })).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('does not revive old rows after access loss and subsequent locale changes', async () => {
  const pending = deferred<Response>();
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    requests.push({ url, init });
    return pending.promise;
  });
  vi.stubGlobal('fetch', fetch);
  const identity = deterministicBrowserIdentity();
  const compose = (current: ActorContext) => (
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <MyTasks actor={current} identity={identity} onOpenTask={vi.fn()} />
    </InterfaceLocaleProvider>
  );
  const view = render(compose(actor));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  chooseLocale('Русский');
  view.rerender(
    compose({
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        id: 'company',
        displayName: 'Synthetic Company',
        taskPermissions: [],
      },
    }),
  );
  expect(requests[0]?.init?.signal?.aborted).toBe(true);
  expect(screen.getByRole('alert')).toHaveTextContent(recovery.ru.denied);
  chooseLocale('Français');
  await act(async () => pending.resolve(Response.json({ tasks: [task] })));
  expect(screen.getByRole('alert')).toHaveTextContent(recovery.fr.denied);
  expect(
    screen.queryByRole('heading', { name: task.title }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});
