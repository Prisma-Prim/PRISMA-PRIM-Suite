import type { TaskState } from '../project/task-response';
import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../localization/messages';
import type { CompanySummaryKind } from './operational-home-response';

type Key =
  | 'title'
  | 'note'
  | 'refresh'
  | 'retry'
  | 'loading'
  | 'error'
  | 'denied'
  | 'activeClientsLabel'
  | 'activeClientsDefinition'
  | 'activeClientsDestination'
  | 'openProjectsLabel'
  | 'openProjectsDefinition'
  | 'openProjectsDestination'
  | 'overdueTasksLabel'
  | 'overdueTasksDefinition'
  | 'overdueTasksDestination'
  | 'cardName'
  | 'overdueTitle'
  | 'overdueLoading'
  | 'overdueError'
  | 'overdueDenied'
  | 'overdueEmpty'
  | 'overdueTruncated'
  | 'overdueListLabel'
  | 'overdueByOne'
  | 'overdueByMany'
  | 'state'
  | 'dueDate'
  | 'responsible'
  | 'unassigned'
  | 'project'
  | 'client'
  | 'open'
  | 'openTask'
  | 'close'
  | 'closeOverdue'
  | 'attentionTitle'
  | 'attentionListLabel'
  | 'attentionEmpty'
  | 'attentionTruncated'
  | 'critical'
  | 'blocked'
  | 'dueToday'
  | 'dueInOne'
  | 'dueInMany'
  | 'noDate'
  | 'seeAll'
  | 'todo'
  | 'inProgress'
  | 'done'
  | 'cancelled';

const keys: readonly Key[] = [
  'title',
  'note',
  'refresh',
  'retry',
  'loading',
  'error',
  'denied',
  'activeClientsLabel',
  'activeClientsDefinition',
  'activeClientsDestination',
  'openProjectsLabel',
  'openProjectsDefinition',
  'openProjectsDestination',
  'overdueTasksLabel',
  'overdueTasksDefinition',
  'overdueTasksDestination',
  'cardName',
  'overdueTitle',
  'overdueLoading',
  'overdueError',
  'overdueDenied',
  'overdueEmpty',
  'overdueTruncated',
  'overdueListLabel',
  'overdueByOne',
  'overdueByMany',
  'state',
  'dueDate',
  'responsible',
  'unassigned',
  'project',
  'client',
  'open',
  'openTask',
  'close',
  'closeOverdue',
  'attentionTitle',
  'attentionListLabel',
  'attentionEmpty',
  'attentionTruncated',
  'critical',
  'blocked',
  'dueToday',
  'dueInOne',
  'dueInMany',
  'noDate',
  'seeAll',
  'todo',
  'inProgress',
  'done',
  'cancelled',
];

export const operationalHomeMessages = defineMessages(keys, {
  ro: {
    title: 'Rezumatul Companiei',
    note: 'Numărat la {today} din înregistrările pe care le puteți deschide în {company}.',
    refresh: 'Actualizați rezumatul Companiei',
    retry: 'Reîncercați',
    loading: 'Se încarcă rezumatul Companiei…',
    error: 'Rezumatul Companiei nu a putut fi încărcat. Nu se afișează valori.',
    denied: 'Rezumatul Companiei nu este disponibil cu accesul actual.',
    activeClientsLabel: 'Clienți activi',
    activeClientsDefinition: 'Clienți cu o relație activă cu {company}',
    activeClientsDestination: 'Deschideți lista de Clienți',
    openProjectsLabel: 'Proiecte deschise',
    openProjectsDefinition:
      'Proiecte pe care le puteți deschide și care nu sunt închise',
    openProjectsDestination: 'Deschideți lista de Proiecte',
    overdueTasksLabel: 'Sarcini restante',
    overdueTasksDefinition:
      'Sarcini deschise cu termen înainte de {today} în Proiecte pe care le puteți deschide',
    overdueTasksDestination: 'Afișați Sarcinile restante',
    cardName: '{label}: {count}. {destination}',
    overdueTitle: 'Sarcini restante în {company}',
    overdueLoading: 'Se încarcă Sarcinile restante…',
    overdueError: 'Sarcinile restante nu au putut fi încărcate.',
    overdueDenied: 'Sarcinile restante nu sunt disponibile cu accesul actual.',
    overdueEmpty:
      'Nu există Sarcini restante în Proiectele pe care le puteți deschide în {company}.',
    overdueTruncated:
      'Se afișează cele mai vechi {shown} din {total} Sarcini restante.',
    overdueListLabel: 'Sarcini restante, în ordinea celor mai vechi termene',
    overdueByOne: 'Restantă de {count} zi',
    overdueByMany: 'Restantă de {count} zile',
    state: 'Stare',
    dueDate: 'Termen',
    responsible: 'Membru responsabil',
    unassigned: 'Neatribuită',
    project: 'Proiect',
    client: 'Client',
    open: 'Deschideți',
    openTask: 'Deschideți {task} în {project} ({client})',
    close: 'Închideți',
    closeOverdue: 'Închideți Sarcinile restante',
    attentionTitle: 'Necesită atenția mea',
    attentionListLabel: 'Sarcini care necesită atenția dumneavoastră',
    attentionEmpty:
      'Nimic nu necesită atenția dumneavoastră în {company} la {today}.',
    attentionTruncated:
      'Se afișează {shown} din {total} Sarcini care necesită atenție.',
    critical: 'Critică',
    blocked: 'Blocată',
    dueToday: 'Termen astăzi',
    dueInOne: 'Termen într-o zi',
    dueInMany: 'Termen în {count} zile',
    noDate: 'Fără termen',
    seeAll: 'Vedeți tot în Sarcinile mele',
    todo: 'De făcut',
    inProgress: 'În desfășurare',
    done: 'Finalizată',
    cancelled: 'Anulată',
  },
  ru: {
    title: 'Сводка Компании',
    note: 'Подсчитано на {today} по записям, которые вы можете открыть в {company}.',
    refresh: 'Обновить сводку Компании',
    retry: 'Повторить',
    loading: 'Загрузка сводки Компании…',
    error: 'Не удалось загрузить сводку Компании. Значения не показаны.',
    denied: 'Сводка Компании недоступна с текущим доступом.',
    activeClientsLabel: 'Активные Клиенты',
    activeClientsDefinition: 'Клиенты с активными отношениями с {company}',
    activeClientsDestination: 'Открыть список Клиентов',
    openProjectsLabel: 'Открытые Проекты',
    openProjectsDefinition: 'Доступные вам Проекты, которые не закрыты',
    openProjectsDestination: 'Открыть список Проектов',
    overdueTasksLabel: 'Просроченные Задачи',
    overdueTasksDefinition:
      'Открытые Задачи со сроком до {today} в доступных вам Проектах',
    overdueTasksDestination: 'Показать просроченные Задачи',
    cardName: '{label}: {count}. {destination}',
    overdueTitle: 'Просроченные Задачи в {company}',
    overdueLoading: 'Загрузка просроченных Задач…',
    overdueError: 'Не удалось загрузить просроченные Задачи.',
    overdueDenied: 'Просроченные Задачи недоступны с текущим доступом.',
    overdueEmpty:
      'Нет просроченных Задач в доступных вам Проектах в {company}.',
    overdueTruncated:
      'Показано {shown} самых старых из {total} просроченных Задач.',
    overdueListLabel: 'Просроченные Задачи, сначала самый ранний срок',
    overdueByOne: 'Просрочено на {count} день',
    overdueByMany: 'Просрочено на {count} дн.',
    state: 'Состояние',
    dueDate: 'Срок',
    responsible: 'Ответственный участник',
    unassigned: 'Не назначено',
    project: 'Проект',
    client: 'Клиент',
    open: 'Открыть',
    openTask: 'Открыть {task} в {project} ({client})',
    close: 'Закрыть',
    closeOverdue: 'Закрыть просроченные Задачи',
    attentionTitle: 'Требует моего внимания',
    attentionListLabel: 'Задачи, требующие вашего внимания',
    attentionEmpty: 'На {today} в {company} ничто не требует вашего внимания.',
    attentionTruncated:
      'Показано {shown} из {total} Задач, требующих внимания.',
    critical: 'Критическая',
    blocked: 'Заблокирована',
    dueToday: 'Срок сегодня',
    dueInOne: 'Срок через 1 день',
    dueInMany: 'Срок через {count} дн.',
    noDate: 'Без срока',
    seeAll: 'Смотреть все в Моих задачах',
    todo: 'К выполнению',
    inProgress: 'В работе',
    done: 'Выполнена',
    cancelled: 'Отменена',
  },
  fr: {
    title: 'Résumé de l’Entreprise',
    note: 'Compté au {today} à partir des enregistrements que vous pouvez ouvrir dans {company}.',
    refresh: 'Actualiser le résumé de l’Entreprise',
    retry: 'Réessayer',
    loading: 'Chargement du résumé de l’Entreprise…',
    error:
      'Le résumé de l’Entreprise n’a pas pu être chargé. Aucune valeur n’est affichée.',
    denied:
      'Le résumé de l’Entreprise n’est pas disponible avec votre accès actuel.',
    activeClientsLabel: 'Clients actifs',
    activeClientsDefinition: 'Clients ayant une relation active avec {company}',
    activeClientsDestination: 'Ouvrir la liste des Clients',
    openProjectsLabel: 'Projets ouverts',
    openProjectsDefinition:
      'Projets que vous pouvez ouvrir et qui ne sont pas clos',
    openProjectsDestination: 'Ouvrir la liste des Projets',
    overdueTasksLabel: 'Tâches en retard',
    overdueTasksDefinition:
      'Tâches ouvertes dues avant le {today} dans les Projets que vous pouvez ouvrir',
    overdueTasksDestination: 'Afficher les Tâches en retard',
    cardName: '{label} : {count}. {destination}',
    overdueTitle: 'Tâches en retard dans {company}',
    overdueLoading: 'Chargement des Tâches en retard…',
    overdueError: 'Les Tâches en retard n’ont pas pu être chargées.',
    overdueDenied:
      'Les Tâches en retard ne sont pas disponibles avec votre accès actuel.',
    overdueEmpty:
      'Aucune Tâche en retard dans les Projets que vous pouvez ouvrir dans {company}.',
    overdueTruncated:
      'Affichage des {shown} plus anciennes sur {total} Tâches en retard.',
    overdueListLabel: 'Tâches en retard, échéance la plus ancienne en premier',
    overdueByOne: 'En retard de {count} jour',
    overdueByMany: 'En retard de {count} jours',
    state: 'État',
    dueDate: 'Échéance',
    responsible: 'Membre responsable',
    unassigned: 'Non attribuée',
    project: 'Projet',
    client: 'Client',
    open: 'Ouvrir',
    openTask: 'Ouvrir {task} dans {project} ({client})',
    close: 'Fermer',
    closeOverdue: 'Fermer les Tâches en retard',
    attentionTitle: 'À mon attention',
    attentionListLabel: 'Tâches qui nécessitent votre attention',
    attentionEmpty:
      'Rien ne nécessite votre attention dans {company} au {today}.',
    attentionTruncated:
      'Affichage de {shown} Tâches sur {total} nécessitant votre attention.',
    critical: 'Critique',
    blocked: 'Bloquée',
    dueToday: 'Échéance aujourd’hui',
    dueInOne: 'Échéance dans 1 jour',
    dueInMany: 'Échéance dans {count} jours',
    noDate: 'Sans échéance',
    seeAll: 'Tout voir dans Mes Tâches',
    todo: 'À faire',
    inProgress: 'En cours',
    done: 'Terminée',
    cancelled: 'Annulée',
  },
  en: {
    title: 'Company summary',
    note: 'Counted on {today} from the records you can open in {company}.',
    refresh: 'Refresh Company summary',
    retry: 'Retry',
    loading: 'Loading the Company summary…',
    error: 'The Company summary could not be loaded. No counts are shown.',
    denied: 'The Company summary is not available with your current access.',
    activeClientsLabel: 'Active Clients',
    activeClientsDefinition:
      'Clients with an active relationship with {company}',
    activeClientsDestination: 'Open the Client directory',
    openProjectsLabel: 'Open Projects',
    openProjectsDefinition: 'Projects you can open that are not closed',
    openProjectsDestination: 'Open the Project list',
    overdueTasksLabel: 'Overdue Tasks',
    overdueTasksDefinition:
      'Open Tasks due before {today} in Projects you can open',
    overdueTasksDestination: 'Show the overdue Tasks',
    cardName: '{label}: {count}. {destination}',
    overdueTitle: 'Overdue Tasks in {company}',
    overdueLoading: 'Loading the overdue Tasks…',
    overdueError: 'The overdue Tasks could not be loaded.',
    overdueDenied:
      'The overdue Tasks are not available with your current access.',
    overdueEmpty: 'No overdue Tasks in the Projects you can open in {company}.',
    overdueTruncated: 'Showing the {shown} oldest of {total} overdue Tasks.',
    overdueListLabel: 'Overdue Tasks, oldest due date first',
    overdueByOne: 'Overdue by {count} day',
    overdueByMany: 'Overdue by {count} days',
    state: 'State',
    dueDate: 'Due date',
    responsible: 'Responsible member',
    unassigned: 'Unassigned',
    project: 'Project',
    client: 'Client',
    open: 'Open',
    openTask: 'Open {task} in {project} ({client})',
    close: 'Close',
    closeOverdue: 'Close the overdue Tasks',
    attentionTitle: 'My attention',
    attentionListLabel: 'Tasks that need your attention',
    attentionEmpty: 'Nothing needs your attention in {company} on {today}.',
    attentionTruncated:
      'Showing {shown} of {total} Tasks that need your attention.',
    critical: 'Critical',
    blocked: 'Blocked',
    dueToday: 'Due today',
    dueInOne: 'Due in 1 day',
    dueInMany: 'Due in {count} days',
    noDate: 'No due date',
    seeAll: 'See all in My Tasks',
    todo: 'To do',
    inProgress: 'In progress',
    done: 'Done',
    cancelled: 'Cancelled',
  },
});

export function useOperationalHomeCopy() {
  const m = useMessages(operationalHomeMessages);
  const format = (
    key: Key,
    values: Readonly<Record<string, string | number>>,
  ) => formatMessage(m(key), values);
  const summaries: Record<
    CompanySummaryKind,
    {
      label: string;
      definition: (context: { company: string; today: string }) => string;
      destination: string;
    }
  > = {
    active_clients: {
      label: m('activeClientsLabel'),
      definition: ({ company }) =>
        format('activeClientsDefinition', { company }),
      destination: m('activeClientsDestination'),
    },
    open_projects: {
      label: m('openProjectsLabel'),
      definition: () => m('openProjectsDefinition'),
      destination: m('openProjectsDestination'),
    },
    overdue_tasks: {
      label: m('overdueTasksLabel'),
      definition: ({ today }) => format('overdueTasksDefinition', { today }),
      destination: m('overdueTasksDestination'),
    },
  };
  const states: Record<TaskState, string> = {
    todo: m('todo'),
    in_progress: m('inProgress'),
    blocked: m('blocked'),
    done: m('done'),
    cancelled: m('cancelled'),
  };
  const openTask = ({
    task,
    project,
    client,
  }: {
    task: string;
    project: string;
    client: string;
  }) => format('openTask', { task, project, client });
  return {
    title: m('title'),
    note: ({ company, today }: { company: string; today: string }) =>
      format('note', { company, today }),
    refresh: m('refresh'),
    retry: m('retry'),
    loading: m('loading'),
    error: m('error'),
    denied: m('denied'),
    summaries,
    cardName: ({
      label,
      count,
      destination,
    }: {
      label: string;
      count: string;
      destination: string;
    }) => format('cardName', { label, count, destination }),
    states,
    overdue: {
      title: ({ company }: { company: string }) =>
        format('overdueTitle', { company }),
      loading: m('overdueLoading'),
      error: m('overdueError'),
      denied: m('overdueDenied'),
      empty: ({ company }: { company: string }) =>
        format('overdueEmpty', { company }),
      truncated: ({ shown, total }: { shown: string; total: string }) =>
        format('overdueTruncated', { shown, total }),
      listLabel: m('overdueListLabel'),
      overdueBy: ({ days, count }: { days: number; count: string }) =>
        format(days === 1 ? 'overdueByOne' : 'overdueByMany', { count }),
      state: m('state'),
      dueDate: m('dueDate'),
      responsible: m('responsible'),
      unassigned: m('unassigned'),
      project: m('project'),
      client: m('client'),
      open: m('open'),
      openTask,
      close: m('close'),
      closeName: m('closeOverdue'),
      retry: m('retry'),
    },
    attention: {
      title: m('attentionTitle'),
      listLabel: m('attentionListLabel'),
      empty: ({ company, today }: { company: string; today: string }) =>
        format('attentionEmpty', { company, today }),
      truncated: ({ shown, total }: { shown: string; total: string }) =>
        format('attentionTruncated', { shown, total }),
      overdueBy: (days: number) =>
        format(days === 1 ? 'overdueByOne' : 'overdueByMany', {
          count: String(days),
        }),
      critical: m('critical'),
      blocked: m('blocked'),
      dueToday: m('dueToday'),
      dueIn: (days: number) =>
        days === 1
          ? m('dueInOne')
          : format('dueInMany', { count: String(days) }),
      state: m('state'),
      dueDate: m('dueDate'),
      noDate: m('noDate'),
      project: m('project'),
      client: m('client'),
      open: m('open'),
      openTask,
      seeAll: m('seeAll'),
    },
  };
}
