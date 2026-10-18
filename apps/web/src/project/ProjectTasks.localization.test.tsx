import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { changeValue, selectOption } from '../test/select-option';
import { deferred } from '../production-shell/production-shell-context.test-fixtures';
import type { TaskEvent, TaskView } from './task-response';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { InterfaceLocaleProvider } from '../localization/interface-locale';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { ProjectTasks } from './ProjectTasks';
import { projectTaskMessages, taskCopy } from './task.copy';
import {
  assertMessageCoverage,
  defineMessages,
  resolveMessage,
} from '../localization/messages';

const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Ana {literal} — Проверка',
  email: 'ana@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    id: 'company',
    displayName: 'Synthetic Company',
    projectPermissions: ['project.read'],
    taskPermissions: ['task.read', 'task.manage'],
    taskPermissionAssignmentId: 'task-grant',
    taskPermissionSetVersion: 'v1',
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
});

it('starts the public Project Task journey in Romanian without a saved language choice', async () => {
  const fetch = vi.fn(async (url: string) => {
    if (url === '/api/projects/project/tasks')
      return Response.json({ mutable: true, tasks: [] });
    if (url === '/api/projects/project/eligible-task-assignees')
      return Response.json({ members: [] });
    throw new Error(`Unexpected public HTTP request: ${url}`);
  });
  vi.stubGlobal('fetch', fetch);
  render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <ProjectTasks
        actor={actor}
        identity={deterministicBrowserIdentity()}
        projectId="project"
        projectStatus="preparatory"
      />
    </InterfaceLocaleProvider>,
  );
  const tasks = await screen.findByRole('region', { name: 'Sarcini' });
  expect(within(tasks).getByRole('heading', { name: 'Sarcini' })).toBeVisible();
  expect(
    within(tasks).getByText(
      'Sarcini de pregătire manuală. Fiecare stare consemnează o declarație; nu autorizează începerea unei misiuni reale.',
    ),
  ).toBeVisible();
  expect(
    await within(tasks).findByText(
      'Nu există încă Sarcini manuale pentru acest Proiect.',
    ),
  ).toBeVisible();
  expect(within(tasks).getByLabelText('Titlul Sarcinii')).toHaveValue('');
  expect(within(tasks).getByLabelText('Responsabil')).toBeVisible();
  expect(within(tasks).getByLabelText('Termen')).toHaveValue('');
  expect(within(tasks).getByLabelText('Prioritate')).toHaveTextContent(
    'Normală',
  );
  await waitFor(() =>
    expect(
      within(tasks).getByRole('button', { name: 'Creați Sarcina' }),
    ).toBeEnabled(),
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});

const languages = [
  {
    code: 'ro',
    title: 'Sarcini',
    titleLabel: 'Titlul Sarcinii',
    save: 'Salvați Sarcina',
    search: 'Căutați Sarcini',
    status: 'Starea Sarcinii',
    assigneeFilter: 'Responsabilul Sarcinii',
    dateFilter: 'Filtrul de dată al Sarcinilor',
    from: 'Data Sarcinii de la',
    through: 'Data Sarcinii până la',
    assignee: 'Responsabil',
    due: 'Termen',
    priority: 'Prioritate',
    critical: 'Critică',
    block: 'Marcați blocată',
    reason: 'Motivul blocării',
    saveReason: 'Salvați blocarea',
    reasonError: 'Introduceți un motiv de 1–500 de caractere.',
    loading: 'Se încarcă Sarcinile…',
    history: 'Istoricul Sarcinii',
    created: 'Sarcină creată',
    date: '31 dec. 99',
    confirmed: 'Modificarea Sarcinii a fost înregistrată.',
    uncertain:
      'Rezultatul nu este confirmat. Reîncercați aceeași modificare pentru a recupera în siguranță rezultatul înregistrat.',
    retry: 'Reîncercați modificarea în așteptare a Sarcinii',
    conflict:
      'Această Sarcină sau permisiunile sale s-au schimbat. Reîncărcați Sarcina înainte de a face altă modificare.',
    rejected:
      'Modificarea a fost respinsă. Reîncărcați Sarcina și verificați câmpurile și responsabilul.',
    closedRefusal:
      'Acest Proiect a fost închis. Reîncărcați pentru a vedea starea curentă.',
    membersError:
      'Responsabilii nu au putut fi încărcați. Reîncărcați înainte de a modifica Sarcina.',
    memberUnavailable:
      'Responsabilul actual nu mai este eligibil. Alegeți alt responsabil sau lăsați Sarcina neatribuită.',
    denied:
      'Sunt necesare accesul de citire la Sarcini, Proiect și Client în această Companie.',
    missing:
      'Această Sarcină nu a fost găsită. Reîncărcați Sarcina sau alegeți alta din listă.',
    error:
      'Sarcinile nu au putut fi încărcate. Reîncărcați pentru a încerca din nou.',
    immutable:
      'Doar pentru citire: Clientul original a fost înlocuit. Istoricul Sarcinilor rămâne disponibil.',
    closed:
      'Doar pentru citire: acest Proiect este închis. Istoricul Sarcinilor rămâne disponibil.',
  },
  {
    code: 'ru',
    title: 'Задачи',
    titleLabel: 'Название Задачи',
    save: 'Сохранить Задачу',
    search: 'Поиск Задач',
    status: 'Состояние Задачи',
    assigneeFilter: 'Ответственный за Задачу',
    dateFilter: 'Фильтр дат Задач',
    from: 'Дата Задачи с',
    through: 'Дата Задачи по',
    assignee: 'Ответственный',
    due: 'Срок',
    priority: 'Приоритет',
    critical: 'Критический',
    block: 'Заблокировать',
    reason: 'Причина блокировки',
    saveReason: 'Сохранить блокировку',
    reasonError: 'Введите причину длиной 1–500 символов.',
    loading: 'Загрузка Задач…',
    history: 'История Задачи',
    created: 'Задача создана',
    date: '31 дек. 99 г.',
    confirmed: 'Изменение Задачи зарегистрировано.',
    uncertain:
      'Результат не подтверждён. Повторите то же изменение, чтобы безопасно получить зарегистрированный результат.',
    retry: 'Повторить ожидающее изменение Задачи',
    conflict:
      'Эта Задача или права доступа изменились. Перезагрузите Задачу перед следующим изменением.',
    rejected:
      'Изменение отклонено. Перезагрузите Задачу и проверьте поля и ответственного.',
    closedRefusal:
      'Этот Проект был закрыт. Перезагрузите, чтобы увидеть текущее состояние.',
    membersError:
      'Не удалось загрузить ответственных. Перезагрузите перед изменением Задачи.',
    memberUnavailable:
      'Текущий ответственный больше не соответствует условиям. Выберите другого или оставьте Задачу без ответственного.',
    denied:
      'Необходим доступ на чтение Задач, Проекта и Клиента в этой Компании.',
    missing:
      'Эта Задача не найдена. Перезагрузите Задачу или выберите другую из списка.',
    error:
      'Не удалось загрузить Задачи. Перезагрузите, чтобы повторить попытку.',
    immutable:
      'Только для чтения: исходный Клиент был заменён. История Задач остаётся доступной.',
    closed:
      'Только для чтения: этот Проект закрыт. История Задач остаётся доступной.',
  },
  {
    code: 'fr',
    title: 'Tâches',
    titleLabel: 'Titre de la Tâche',
    save: 'Enregistrer la Tâche',
    search: 'Rechercher des Tâches',
    status: 'État de la Tâche',
    assigneeFilter: 'Responsable de la Tâche',
    dateFilter: 'Filtre de date des Tâches',
    from: 'Date de la Tâche à partir du',
    through: 'Date de la Tâche jusqu’au',
    assignee: 'Responsable',
    due: 'Échéance',
    priority: 'Priorité',
    critical: 'Critique',
    block: 'Marquer bloquée',
    reason: 'Motif du blocage',
    saveReason: 'Enregistrer le blocage',
    reasonError: 'Saisissez un motif de 1 à 500 caractères.',
    loading: 'Chargement des Tâches…',
    history: 'Historique de la Tâche',
    created: 'Tâche créée',
    date: '31 déc. 99',
    confirmed: 'Modification de la Tâche enregistrée.',
    uncertain:
      'Le résultat n’est pas confirmé. Réessayez la même modification pour retrouver son résultat enregistré en toute sécurité.',
    retry: 'Réessayer la modification de Tâche en attente',
    conflict:
      'Cette Tâche ou ses autorisations ont changé. Rechargez la Tâche avant une autre modification.',
    rejected:
      'La modification a été refusée. Rechargez la Tâche et vérifiez ses champs et son responsable.',
    closedRefusal:
      'Ce Projet a été clos. Rechargez pour consulter son état actuel.',
    membersError:
      'Les responsables n’ont pas pu être chargés. Rechargez avant de modifier la Tâche.',
    memberUnavailable:
      'Le responsable actuel n’est plus éligible. Choisissez un autre responsable ou laissez la Tâche sans responsable.',
    denied:
      'Un accès en lecture aux Tâches, au Projet et au Client est requis dans cette Compagnie.',
    missing:
      'Cette Tâche est introuvable. Rechargez la Tâche ou choisissez-en une autre dans la liste.',
    error: 'Les Tâches n’ont pas pu être chargées. Rechargez pour réessayer.',
    immutable:
      'Lecture seule : le Client original a été remplacé. L’historique des Tâches reste disponible.',
    closed:
      'Lecture seule : ce Projet est clos. L’historique des Tâches reste disponible.',
  },
  {
    code: 'en',
    title: 'Tasks',
    titleLabel: 'Task title',
    save: 'Save Task',
    search: 'Search Tasks',
    status: 'Task status',
    assigneeFilter: 'Task responsible member',
    dateFilter: 'Task date filter',
    from: 'Task date from',
    through: 'Task date through',
    assignee: 'Responsible member',
    due: 'Due date',
    priority: 'Priority',
    critical: 'Critical',
    block: 'Mark blocked',
    reason: 'Blockage reason',
    saveReason: 'Save blockage',
    reasonError: 'Enter a reason of 1–500 characters.',
    loading: 'Loading Tasks…',
    history: 'Task history',
    created: 'Task created',
    date: 'Dec 31, 99',
    confirmed: 'Task change recorded.',
    uncertain:
      'The result is not confirmed. Retry the same change to safely recover its recorded result.',
    retry: 'Retry pending Task change',
    conflict:
      'This Task or its permissions changed. Reload the Task before making another change.',
    rejected:
      'The change was rejected. Reload the Task and check its fields and responsible member.',
    closedRefusal: 'This Project was closed. Reload to see its current state.',
    membersError:
      'Responsible members could not be loaded. Reload before changing the Task.',
    memberUnavailable:
      'Current responsible member is no longer eligible. Choose another member or leave unassigned.',
    denied:
      'Task, Project and Client read access are required for this Company.',
    missing:
      'This Task could not be found. Reload the Task or choose another Task from the list.',
    error: 'Tasks could not be loaded. Reload to try again.',
    immutable:
      'Read-only: the original Client has been superseded. Task history remains available.',
    closed:
      'Read-only: this Project is closed. Task history remains available.',
  },
] as const;

const member = {
  workspaceMembershipId: 'member',
  displayLabel: 'Mira {literal} — Vérification',
};
const task: TaskView = {
  id: 'task',
  companyId: 'company',
  projectId: 'project',
  clientAccountId: 'client',
  title: 'Chestionar {inițial} — Проверка',
  assignee: member,
  dueDate: '0099-12-31',
  priority: 'critical',
  status: 'todo',
  completion: null,
  version: 7,
  createdAt: '2026-10-18T23:15:00.000Z',
  updatedAt: '2026-10-18T23:15:00.000Z',
  createdBy: {
    internalUserId: actor.internalUserId,
    workspaceMembershipId: actor.workspaceMembershipId,
    displayName: actor.displayName,
  },
};
const created: TaskEvent = {
  id: 'created',
  action: 'task.created',
  occurredAt: task.createdAt,
  actor: task.createdBy,
  target: {
    type: 'task',
    taskId: task.id,
    taskTitle: task.title,
    companyId: task.companyId,
  },
  metadata: {
    version: 1,
    initial: {
      title: task.title,
      assignee: member,
      dueDate: task.dueDate,
      priority: task.priority,
    },
  },
};
function readResponse(url: string) {
  if (url === '/api/projects/project/tasks')
    return Response.json({ mutable: true, tasks: [task] });
  if (url.endsWith('/eligible-task-assignees'))
    return Response.json({ members: [member] });
  if (url === '/api/tasks/task') return Response.json({ mutable: true, task });
  if (url === '/api/tasks/task/history')
    return Response.json({ events: [created] });
  throw new Error(`Unexpected public HTTP request: ${url}`);
}
function mountTasks(
  nextActor = actor,
  identity = deterministicBrowserIdentity(),
) {
  return render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <ProjectTasks
        actor={nextActor}
        identity={identity}
        projectId="project"
        projectStatus="preparatory"
      />
    </InterfaceLocaleProvider>,
  );
}
function switchLanguage(code: string) {
  const control = screen.getByRole('combobox', {
    name: /Limba interfeței|Язык интерфейса|Langue de l’interface|Interface language/u,
  });
  selectOption(control, code);
}
async function openEnglishTask() {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  const view = mountTasks();
  fireEvent.click(await screen.findByRole('button', { name: task.title }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save Task' })).toBeEnabled(),
  );
  return view;
}

it.each(languages)(
  'preserves fields, exact calendar bounds, literal filters and attributed history without requests on $code switching',
  async (language) => {
    vi.stubEnv('TZ', 'America/New_York');
    const fetch = vi.fn(async (url: string) => readResponse(url));
    vi.stubGlobal('fetch', fetch);
    await openEnglishTask();
    changeValue(
      screen.getByLabelText('Task title'),
      'Draft {untranslated} — Черновик',
    );
    changeValue(screen.getByLabelText('Due date'), '0001-01-01');
    changeValue(
      screen.getByLabelText('Search Tasks'),
      ' Chestionar {inițial} ',
    );
    selectOption(screen.getByLabelText('Task status'), 'todo');
    selectOption(
      screen.getByLabelText('Task responsible member'),
      'member:member',
    );
    selectOption(screen.getByLabelText('Task date filter'), 'range');
    changeValue(screen.getByLabelText('Task date from'), '0099-01-01');
    changeValue(screen.getByLabelText('Task date through'), '0099-12-31');
    const before = fetch.mock.calls.length;
    switchLanguage(language.code);
    const region = screen.getByRole('region', { name: language.title });
    expect(within(region).getByLabelText(language.titleLabel)).toHaveValue(
      'Draft {untranslated} — Черновик',
    );
    expect(within(region).getByLabelText(language.due)).toHaveValue(
      '0001-01-01',
    );
    expect(within(region).getByLabelText(language.search)).toHaveValue(
      ' Chestionar {inițial} ',
    );
    expect(within(region).getByLabelText(language.status)).toHaveAttribute(
      'data-value',
      'todo',
    );
    expect(
      within(region).getByLabelText(language.assigneeFilter),
    ).toHaveAttribute('data-value', 'member:member');
    expect(within(region).getByLabelText(language.from)).toHaveValue(
      '0099-01-01',
    );
    expect(within(region).getByLabelText(language.through)).toHaveValue(
      '0099-12-31',
    );
    expect(
      within(region).getByRole('heading', { name: task.title }),
    ).toBeVisible();
    const history = within(region).getByRole('region', {
      name: language.history,
    });
    expect(within(history).getByText(language.created)).toBeVisible();
    expect(
      within(history).getByText(task.title, { exact: false }),
    ).toBeVisible();
    expect(
      within(history).getByText(member.displayLabel, { exact: false }),
    ).toBeVisible();
    expect(
      region.querySelector('time[datetime="0099-12-31"]'),
    ).toHaveTextContent(language.date);
    const timestamps = {
      ro: '18.10.2026, 19:15:00',
      ru: '18.10.2026, 19:15:00',
      fr: '18/10/2026 19:15:00',
      en: '10/18/2026, 7:15:00 PM',
    };
    expect(
      history.querySelector('time[datetime="2026-10-18T23:15:00.000Z"]'),
    ).toHaveTextContent(timestamps[language.code]);
    expect(fetch.mock.calls.length).toBe(before);
  },
);

it.each(languages)(
  'retains the reason draft and associated validation while switching to $code',
  async (language) => {
    const fetch = vi.fn(async (url: string) => readResponse(url));
    vi.stubGlobal('fetch', fetch);
    await openEnglishTask();
    fireEvent.click(screen.getByRole('button', { name: 'Mark blocked' }));
    changeValue(screen.getByLabelText('Blockage reason'), '  ');
    fireEvent.click(screen.getByRole('button', { name: 'Save blockage' }));
    const before = fetch.mock.calls.length;
    switchLanguage(language.code);
    const reason = screen.getByLabelText(language.reason);
    expect(reason).toHaveValue('  ');
    expect(reason).toHaveAttribute('aria-invalid', 'true');
    expect(reason).toHaveAccessibleDescription(language.reasonError);
    changeValue(reason, 'Motiv {literal} — Причина');
    switchLanguage('en');
    expect(screen.getByLabelText('Blockage reason')).toHaveValue(
      'Motiv {literal} — Причина',
    );
    expect(screen.getByLabelText('Blockage reason')).not.toHaveAttribute(
      'aria-invalid',
    );
    expect(fetch.mock.calls.length).toBe(before);
  },
);

for (const outcome of [
  'conflict',
  'rejected',
  'closedRefusal',
  'uncertain',
  'confirmed',
] as const) {
  it.each(languages)(
    `renders a delayed ${outcome} in the current $code locale and retranslates visible feedback`,
    async (language) => {
      const pending = deferred<Response>();
      let savedTask = task;
      const fetch = vi.fn(async (url: string, options?: RequestInit) => {
        if (options?.method === 'PATCH') return pending.promise;
        if (url === '/api/projects/project/tasks')
          return Response.json({ mutable: true, tasks: [savedTask] });
        if (url === '/api/tasks/task')
          return Response.json({ mutable: true, task: savedTask });
        return readResponse(url);
      });
      vi.stubGlobal('fetch', fetch);
      await openEnglishTask();
      changeValue(screen.getByLabelText('Task title'), 'Changed literal');
      fireEvent.click(screen.getByRole('button', { name: 'Save Task' }));
      await waitFor(() =>
        expect(
          fetch.mock.calls.some(([, options]) => options?.method === 'PATCH'),
        ).toBe(true),
      );
      const before = fetch.mock.calls.length;
      switchLanguage(language.code);
      expect(fetch.mock.calls.length).toBe(before);
      await act(async () => {
        if (outcome === 'confirmed') {
          savedTask = { ...task, title: 'Changed literal', version: 8 };
          pending.resolve(Response.json(savedTask));
        } else if (outcome === 'closedRefusal')
          pending.resolve(
            Response.json({ code: 'project_closed' }, { status: 409 }),
          );
        else
          pending.resolve(
            new Response(null, {
              status:
                outcome === 'conflict'
                  ? 409
                  : outcome === 'rejected'
                    ? 400
                    : 500,
            }),
          );
      });
      expect(await screen.findByText(language[outcome])).toBeVisible();
      if (outcome === 'confirmed')
        await waitFor(() =>
          expect(
            screen.getByRole('button', { name: language.save }),
          ).toBeEnabled(),
        );
      const after = fetch.mock.calls.length;
      switchLanguage('en');
      expect(screen.getByText(languages[3][outcome])).toBeVisible();
      expect(fetch.mock.calls.length).toBe(after);
    },
  );
}

it.each(languages)(
  'keeps the exact uncertain blockage command through $code switching and an explicit retry',
  async (language) => {
    const commands: Array<{
      url: string;
      method: string | undefined;
      company: string | null;
      key: string | null;
      body: BodyInit | null | undefined;
    }> = [];
    const changed = vi.fn();
    const fetch = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        const headers = new Headers(options.headers);
        commands.push({
          url,
          method: options.method,
          company: headers.get('x-company-context-id'),
          key: headers.get('idempotency-key'),
          body: options.body,
        });
        return new Response(null, { status: 500 });
      }
      return readResponse(url);
    });
    vi.stubGlobal('fetch', fetch);
    localStorage.setItem('prisma-prim.interface-locale', 'en');
    render(
      <InterfaceLocaleProvider>
        <InterfaceLocaleSelect />
        <ProjectTasks
          actor={actor}
          identity={deterministicBrowserIdentity()}
          projectId="project"
          projectStatus="preparatory"
          onActivityRecorded={changed}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: task.title }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save Task' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark blocked' }));
    changeValue(
      screen.getByLabelText('Blockage reason'),
      '  Blocaj {literal} — Причина  ',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save blockage' }));
    await screen.findByRole('button', { name: 'Retry pending Task change' });
    const before = fetch.mock.calls.length;
    switchLanguage(language.code);
    expect(screen.getByText(language.uncertain)).toBeVisible();
    expect(fetch.mock.calls.length).toBe(before);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      url: '/api/tasks/task/status',
      method: 'POST',
      company: 'company',
      body: JSON.stringify({
        expectedVersion: 7,
        status: 'blocked',
        reason: 'Blocaj {literal} — Причина',
      }),
    });
    expect(commands[0]?.key).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: language.retry }));
    await waitFor(() => expect(commands).toHaveLength(2));
    expect(commands[1]).toEqual(commands[0]);
    expect(changed).not.toHaveBeenCalled();
  },
);

it.each(languages)(
  'localizes delayed eligible-member failures in $code without restarting the read',
  async (language) => {
    const pending = deferred<Response>();
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('/eligible-task-assignees')
        ? pending.promise
        : readResponse(url),
    );
    vi.stubGlobal('fetch', fetch);
    localStorage.setItem('prisma-prim.interface-locale', 'en');
    mountTasks();
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([url]) =>
          url.endsWith('/eligible-task-assignees'),
        ),
      ).toBe(true),
    );
    switchLanguage(language.code);
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve(new Response(null, { status: 500 })));
    expect(await screen.findByText(language.membersError)).toBeVisible();
    switchLanguage('en');
    expect(screen.getByText(languages[3].membersError)).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);

it.each(languages)(
  'renders unavailable historical members safely in $code',
  async (language) => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('/eligible-task-assignees')
        ? Response.json({ members: [] })
        : readResponse(url),
    );
    vi.stubGlobal('fetch', fetch);
    await openEnglishTask();
    switchLanguage(language.code);
    expect(screen.getByText(language.memberUnavailable)).toBeVisible();
    expect(screen.getByLabelText(language.assignee)).toHaveTextContent(
      member.displayLabel,
    );
    const before = fetch.mock.calls.length;
    switchLanguage('en');
    expect(fetch.mock.calls.length).toBe(before);
  },
);

it.each(languages)(
  'gives a read-only $code actor no controls or eligible-member information',
  async (language) => {
    const fetch = vi.fn(async (url: string) => readResponse(url));
    vi.stubGlobal('fetch', fetch);
    localStorage.setItem('prisma-prim.interface-locale', language.code);
    mountTasks({
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        id: 'company',
        displayName: 'Synthetic Company',
        taskPermissions: ['task.read'],
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: task.title }));
    expect(
      await screen.findByRole('region', { name: language.history }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText(language.titleLabel),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(
      fetch.mock.calls.some(([url]) => url.includes('eligible-task-assignees')),
    ).toBe(false);
  },
);

it.each(languages)(
  'renders a delayed list error and its loading state in the current $code language',
  async (language) => {
    const pending = deferred<Response>();
    const fetch = vi.fn(async () => pending.promise);
    vi.stubGlobal('fetch', fetch);
    localStorage.setItem('prisma-prim.interface-locale', 'en');
    mountTasks();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    switchLanguage(language.code);
    expect(screen.getByText(language.loading)).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(new Response(null, { status: 500 })));
    expect(await screen.findByRole('alert')).toHaveTextContent(language.error);
    switchLanguage('en');
    expect(screen.getByRole('alert')).toHaveTextContent(languages[3].error);
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

for (const outcome of ['missing', 'malformed'] as const) {
  it.each(languages)(
    `localizes a delayed ${outcome} detail after switching to $code without revealing old detail`,
    async (language) => {
      const pending = deferred<Response>();
      const fetch = vi.fn(async (url: string) =>
        url === '/api/tasks/task' ? pending.promise : readResponse(url),
      );
      vi.stubGlobal('fetch', fetch);
      localStorage.setItem('prisma-prim.interface-locale', 'en');
      mountTasks();
      fireEvent.click(await screen.findByRole('button', { name: task.title }));
      await waitFor(() =>
        expect(
          fetch.mock.calls.some(([url]) => url === '/api/tasks/task'),
        ).toBe(true),
      );
      const before = fetch.mock.calls.length;
      switchLanguage(language.code);
      expect(fetch.mock.calls.length).toBe(before);
      await act(async () =>
        pending.resolve(
          outcome === 'missing'
            ? new Response(null, { status: 404 })
            : Response.json({
                mutable: true,
                task: { ...task, companyId: 'hidden-other-company' },
              }),
        ),
      );
      expect(
        await screen.findByText(
          outcome === 'missing' ? language.missing : language.error,
        ),
      ).toBeVisible();
      expect(
        screen.queryByRole('heading', { name: task.title }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('region', { name: language.history }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText(language.titleLabel),
      ).not.toBeInTheDocument();
      expect(document.body).not.toHaveTextContent('hidden-other-company');
    },
  );
}

it.each(languages)(
  'retires access and suppresses a pending command reply after a $code switch',
  async (language) => {
    const pending = deferred<Response>();
    const commandRequest: { signal: AbortSignal | null | undefined } = {
      signal: undefined,
    };
    const fetch = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        commandRequest.signal = options.signal;
        return pending.promise;
      }
      return readResponse(url);
    });
    vi.stubGlobal('fetch', fetch);
    localStorage.setItem('prisma-prim.interface-locale', 'en');
    const identity = deterministicBrowserIdentity();
    const activity = vi.fn();
    function owner(value: ActorContext) {
      return (
        <InterfaceLocaleProvider>
          <InterfaceLocaleSelect />
          <ProjectTasks
            actor={value}
            identity={identity}
            projectId="project"
            projectStatus="preparatory"
            onActivityRecorded={activity}
          />
        </InterfaceLocaleProvider>
      );
    }
    const view = render(owner(actor));
    fireEvent.click(await screen.findByRole('button', { name: task.title }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Mark done' })).toBeEnabled(),
    );
    changeValue(
      screen.getByLabelText('Task title'),
      'Private draft that must retire',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(commandRequest.signal).toBeDefined());
    const before = fetch.mock.calls.length;
    switchLanguage(language.code);
    expect(fetch.mock.calls.length).toBe(before);
    view.rerender(
      owner({
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          id: 'company',
          displayName: 'Synthetic Company',
          taskPermissions: [],
        },
      }),
    );
    expect(await screen.findByText(language.denied)).toBeVisible();
    expect(commandRequest.signal?.aborted).toBe(true);
    await act(async () =>
      pending.resolve(
        Response.json({
          ...task,
          status: 'done',
          completion: { actor: task.createdBy, occurredAt: task.updatedAt },
          version: 8,
        }),
      ),
    );
    expect(
      screen.queryByRole('heading', { name: task.title }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: language.history }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(language.titleLabel),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(language.confirmed)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: language.retry }),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      'Private draft that must retire',
    );
    expect(activity).not.toHaveBeenCalled();
  },
);

it.each([
  {
    ...languages[0],
    cancellation: 'Motivul anulării',
    event: 'Sarcină anulată',
  },
  { ...languages[1], cancellation: 'Причина отмены', event: 'Задача отменена' },
  {
    ...languages[2],
    cancellation: 'Motif de l’annulation',
    event: 'Tâche annulée',
  },
  {
    ...languages[3],
    cancellation: 'Cancellation reason',
    event: 'Task cancelled',
  },
])(
  'localizes a cancelled declaration and its immutable literal history in $code',
  async (language) => {
    const reason = 'Motiv {historic} — Причина originale';
    const cancelled: TaskView = {
      ...task,
      status: 'cancelled',
      completion: null,
      cancellation: {
        actor: task.createdBy,
        occurredAt: task.updatedAt,
        reason,
      },
    };
    const cancellation: TaskEvent = {
      ...created,
      id: 'cancelled',
      action: 'task.cancelled',
      metadata: { version: 7, before: 'todo', after: 'cancelled', reason },
    };
    const fetch = vi.fn(async (url: string) => {
      if (url === '/api/projects/project/tasks')
        return Response.json({ mutable: false, tasks: [cancelled] });
      if (url === '/api/tasks/task')
        return Response.json({ mutable: false, task: cancelled });
      if (url.endsWith('/history'))
        return Response.json({ events: [created, cancellation] });
      return readResponse(url);
    });
    vi.stubGlobal('fetch', fetch);
    localStorage.setItem('prisma-prim.interface-locale', language.code);
    mountTasks();
    fireEvent.click(await screen.findByRole('button', { name: task.title }));
    const history = await screen.findByRole('region', {
      name: language.history,
    });
    expect(within(history).getByText(language.event)).toBeVisible();
    expect(within(history).getByText(reason, { exact: false })).toBeVisible();
    expect(
      screen.getByText(language.cancellation, { selector: 'dt' }),
    ).toBeVisible();
    expect(screen.getByText(reason, { selector: 'dd' })).toBeVisible();
    expect(screen.getByText(language.immutable)).toBeVisible();
    expect(
      screen.queryByLabelText(language.titleLabel),
    ).not.toBeInTheDocument();
    expect(
      fetch.mock.calls.some(([url]) => url.includes('eligible-task-assignees')),
    ).toBe(false);
  },
);

it('uses Romanian for a missing required Project Task translation and rejects that incomplete catalogue while keeping legacy Activity English', () => {
  expect(() =>
    assertMessageCoverage('projectTask', projectTaskMessages),
  ).not.toThrow();
  const partial = defineMessages(projectTaskMessages.keys, {
    ...projectTaskMessages.translations,
    fr: { ...projectTaskMessages.translations.fr, warning: undefined },
  });
  expect(resolveMessage(partial, 'fr', 'warning')).toBe(
    'Sarcini de pregătire manuală. Fiecare stare consemnează o declarație; nu autorizează începerea unei misiuni reale.',
  );
  expect(() => assertMessageCoverage('projectTask', partial)).toThrow(
    'Missing translation: projectTask.fr.warning',
  );
  expect(taskCopy.activityActionLabels['task.completed']).toBe(
    'declared a Task done',
  );
  expect(taskCopy.activityTarget).toBe('Task');
  expect(taskCopy.myTasks.open).toBe('Open');
});

it.each(languages)(
  'keeps a closed Project read-only with translated $code Task history',
  async (language) => {
    const fetch = vi.fn(async (url: string) => readResponse(url));
    vi.stubGlobal('fetch', fetch);
    localStorage.setItem('prisma-prim.interface-locale', language.code);
    render(
      <InterfaceLocaleProvider>
        <ProjectTasks
          actor={actor}
          identity={deterministicBrowserIdentity()}
          projectId="project"
          projectStatus="completed"
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: task.title }));
    expect(
      await screen.findByRole('region', { name: language.history }),
    ).toBeVisible();
    expect(screen.getByText(language.closed)).toBeVisible();
    expect(
      screen.queryByLabelText(language.titleLabel),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(
      fetch.mock.calls.some(([url]) => url.includes('eligible-task-assignees')),
    ).toBe(false);
  },
);

it.each([
  {
    ...languages[0],
    validation:
      'Introduceți un titlu de 1–200 de caractere și un termen valid sau lăsați data necompletată.',
  },
  {
    ...languages[1],
    validation:
      'Введите название длиной 1–200 символов и допустимый срок или оставьте дату пустой.',
  },
  {
    ...languages[2],
    validation:
      'Saisissez un titre de 1 à 200 caractères et une échéance valide ou laissez la date vide.',
  },
  {
    ...languages[3],
    validation:
      'Enter a title of 1–200 characters and a valid due date, or leave the date empty.',
  },
])(
  'retranslates already-visible title validation in $code while keeping entered fields',
  async (language) => {
    const fetch = vi.fn(async (url: string) => readResponse(url));
    vi.stubGlobal('fetch', fetch);
    await openEnglishTask();
    changeValue(screen.getByLabelText('Task title'), '   ');
    fireEvent.click(screen.getByRole('button', { name: 'Save Task' }));
    await screen.findByText(
      'Enter a title of 1–200 characters and a valid due date, or leave the date empty.',
    );
    const before = fetch.mock.calls.length;
    switchLanguage(language.code);
    expect(screen.getByText(language.validation)).toBeVisible();
    expect(screen.getByLabelText(language.titleLabel)).toHaveValue('   ');
    expect(screen.getByLabelText(language.due)).toHaveValue('0099-12-31');
    expect(fetch.mock.calls.length).toBe(before);
  },
);
