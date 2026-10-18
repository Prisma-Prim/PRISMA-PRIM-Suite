import { defineMessages, useMessages } from '../localization/messages';
const keys = [
  'title',
  'loading',
  'error',
  'denied',
  'reload',
  'current',
  'revision',
  'required',
  'history',
  'noHistory',
  'ready',
  'incomplete',
  'readonly',
  'closed',
  'clientInactive',
  'last',
  'advance',
  'retry',
  'pending',
  'uncertain',
  'conflict',
  'confirmed',
  'confirmedRefreshFailed',
  'warning',
  'transition',
  'taskVersion',
  'todo',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
  'bundle',
  'prerequisites',
  'granted',
  'revoked',
  'activity',
] as const;
export const projectStageMessages = defineMessages(keys, {
  ro: {
    title: 'Etapa Proiectului',
    loading: 'Se încarcă progresul etapelor…',
    error: 'Progresul etapelor nu a putut fi încărcat.',
    denied:
      'Progresul etapelor nu este disponibil. Lucrul separat cu Proiecte și Sarcini rămâne disponibil conform permisiunilor proprii.',
    reload: 'Reîncărcați progresul etapelor',
    current: 'Etapa curentă',
    revision: 'Revizia etapei',
    required: 'Sarcini obligatorii',
    history: 'Istoricul etapelor',
    noHistory: 'Nu este înregistrată nicio trecere de etapă.',
    ready:
      'Ambele Sarcini obligatorii sunt încheiate. Treceți explicit când sunteți pregătit.',
    incomplete:
      'Încheiați ambele Sarcini obligatorii înainte de trecere. Sarcinile anulate nu îndeplinesc această condiție.',
    readonly: 'Este necesar accesul explicit pentru trecerea etapelor.',
    closed: 'Acest Proiect este închis. Istoricul etapelor rămâne disponibil.',
    clientInactive:
      'Clientul original este inactiv. Istoricul etapelor rămâne disponibil.',
    last: 'Ultima etapă acceptată. Nu este disponibilă o altă trecere.',
    advance: 'Treceți la {stage}',
    retry: 'Reîncercați trecerea etapei',
    pending: 'Se confirmă trecerea etapei…',
    uncertain:
      'Trecerea etapei nu a putut fi confirmată. Reîncercați explicit exact aceeași intenție.',
    conflict:
      'Progresul etapelor s-a schimbat sau intenția intră în conflict. Reîncărcați înainte de o altă acțiune.',
    confirmed:
      'Trecerea etapei este confirmată. Ciclul de viață al Proiectului nu s-a schimbat.',
    confirmedRefreshFailed:
      'Trecerea etapei este confirmată. Progresul curent nu a putut fi actualizat. Reîncărcați pentru a-l vedea.',
    warning:
      'Plan ilustrativ. Progresul etapelor nu autorizează începerea unei misiuni reale. Redeschiderea unei Sarcini anterioare păstrează etapa atinsă și istoricul acesteia.',
    transition: '{from} → {to}',
    taskVersion: 'Versiunea Sarcinii {version}',
    todo: 'De făcut',
    in_progress: 'În desfășurare',
    blocked: 'Blocată',
    done: 'Încheiată',
    cancelled: 'Anulată',
    bundle: 'Responsabil pentru trecerea etapelor Proiectului',
    prerequisites:
      'Acordă numai trecerea explicită a etapelor. Contextul Companiei și citirea modelului, Proiectului, Sarcinilor și Clientului original se acordă separat. Nu include administrarea Sarcinilor sau aprobarea ciclului de viață.',
    granted: 'a acordat accesul explicit pentru trecerea etapelor Proiectului',
    revoked: 'a revocat accesul pentru trecerea etapelor Proiectului',
    activity: 'a trecut Proiectul la etapa următoare',
  },
  ru: {
    title: 'Этап Проекта',
    loading: 'Загрузка хода этапов…',
    error: 'Не удалось загрузить ход этапов.',
    denied:
      'Ход этапов недоступен. Независимая работа с Проектами и Задачами остаётся доступной согласно отдельным правам.',
    reload: 'Перезагрузить ход этапов',
    current: 'Текущий этап',
    revision: 'Редакция этапа',
    required: 'Обязательные Задачи',
    history: 'История этапов',
    noHistory: 'Переходы между этапами не зарегистрированы.',
    ready:
      'Обе обязательные Задачи выполнены. Перейдите дальше явным действием, когда будете готовы.',
    incomplete:
      'Выполните обе обязательные Задачи перед переходом. Отменённые Задачи не удовлетворяют этому условию.',
    readonly: 'Требуется явное право перехода между этапами.',
    closed: 'Этот Проект закрыт. История этапов остаётся доступной.',
    clientInactive:
      'Исходный Клиент неактивен. История этапов остаётся доступной.',
    last: 'Последний поддерживаемый этап. Дальнейшие переходы недоступны.',
    advance: 'Перейти к {stage}',
    retry: 'Повторить переход этапа',
    pending: 'Подтверждение перехода этапа…',
    uncertain:
      'Не удалось подтвердить переход этапа. Явно повторите то же самое намерение.',
    conflict:
      'Ход этапов изменился или намерение конфликтует. Перезагрузите перед выбором другого действия.',
    confirmed:
      'Переход этапа подтверждён. Жизненный цикл Проекта не изменился.',
    confirmedRefreshFailed:
      'Переход этапа подтверждён. Не удалось обновить текущий ход этапов. Перезагрузите для просмотра.',
    warning:
      'Иллюстративный план. Ход этапов не разрешает начало реальной миссии. Повторное открытие предыдущей Задачи сохраняет достигнутый этап и его историю.',
    transition: '{from} → {to}',
    taskVersion: 'Версия Задачи {version}',
    todo: 'К выполнению',
    in_progress: 'В работе',
    blocked: 'Заблокирована',
    done: 'Выполнена',
    cancelled: 'Отменена',
    bundle: 'Ответственный за переход этапов Проекта',
    prerequisites:
      'Даёт только право явного перехода этапа. Контекст Компании, чтение шаблона, Проекта, Задач и исходного Клиента предоставляются отдельно. Управление Задачами и утверждение жизненного цикла не включены.',
    granted: 'предоставил явное право перехода этапов Проекта',
    revoked: 'отозвал право перехода этапов Проекта',
    activity: 'перевёл Проект на следующий этап',
  },
  fr: {
    title: 'Étape du Projet',
    loading: 'Chargement de la progression des étapes…',
    error: 'La progression des étapes n’a pas pu être chargée.',
    denied:
      'La progression des étapes est indisponible. Le travail indépendant sur les Projets et Tâches reste disponible selon ses propres droits.',
    reload: 'Recharger la progression des étapes',
    current: 'Étape actuelle',
    revision: 'Révision de l’étape',
    required: 'Tâches obligatoires',
    history: 'Historique des étapes',
    noHistory: 'Aucun changement d’étape enregistré.',
    ready:
      'Les deux Tâches obligatoires sont terminées. Passez explicitement à la suite lorsque vous êtes prêt.',
    incomplete:
      'Terminez les deux Tâches obligatoires avant de passer à la suite. Les Tâches annulées ne remplissent pas cette condition.',
    readonly: 'Un droit explicite de changement d’étape est requis.',
    closed: 'Ce Projet est clos. L’historique des étapes reste disponible.',
    clientInactive:
      'Le Client original est inactif. L’historique des étapes reste disponible.',
    last: 'Dernière étape prise en charge. Aucun autre changement n’est disponible.',
    advance: 'Passer à {stage}',
    retry: 'Réessayer le changement d’étape',
    pending: 'Confirmation du changement d’étape…',
    uncertain:
      'Le changement d’étape n’a pas pu être confirmé. Réessayez explicitement avec exactement la même intention.',
    conflict:
      'La progression a changé ou cette intention entre en conflit. Rechargez avant de choisir une autre action.',
    confirmed:
      'Changement d’étape confirmé. Le cycle de vie du Projet est inchangé.',
    confirmedRefreshFailed:
      'Changement d’étape confirmé. La progression actuelle n’a pas pu être actualisée. Rechargez pour l’afficher.',
    warning:
      'Plan illustratif. La progression des étapes n’autorise pas le démarrage d’une mission réelle. Rouvrir une Tâche antérieure préserve l’étape atteinte et son historique.',
    transition: '{from} → {to}',
    taskVersion: 'Version de Tâche {version}',
    todo: 'À faire',
    in_progress: 'En cours',
    blocked: 'Bloquée',
    done: 'Terminée',
    cancelled: 'Annulée',
    bundle: 'Responsable du changement d’étape du Projet',
    prerequisites:
      'Accorde uniquement le changement explicite d’étape. Le contexte Société et la lecture du modèle, du Projet, des Tâches et du Client original restent distincts. La gestion des Tâches et l’approbation du cycle de vie ne sont pas incluses.',
    granted: 'a accordé le droit explicite de changement d’étape du Projet',
    revoked: 'a révoqué le droit de changement d’étape du Projet',
    activity: 'a fait avancer une étape de Projet',
  },
  en: {
    title: 'Project stage',
    loading: 'Loading stage progress…',
    error: 'Stage progress could not be loaded.',
    denied:
      'Stage progress is unavailable. Independent Project and Task work remains available under its own permissions.',
    reload: 'Reload stage progress',
    current: 'Current stage',
    revision: 'Stage revision',
    required: 'Required Tasks',
    history: 'Stage history',
    noHistory: 'No stage transition recorded.',
    ready: 'Both required Tasks are done. Advance explicitly when ready.',
    incomplete:
      'Complete both required Tasks before advancing. Cancelled Tasks do not satisfy this gate.',
    readonly: 'Explicit stage-advance access is required.',
    closed: 'This Project is closed. Stage history remains available.',
    clientInactive:
      'The original Client is inactive. Stage history remains available.',
    last: 'Last supported stage. No further transition is available.',
    advance: 'Advance to {stage}',
    retry: 'Retry stage advance',
    pending: 'Confirming stage advance…',
    uncertain:
      'The stage change could not be confirmed. Retry the exact same intent explicitly.',
    conflict:
      'Stage progress changed or this intent conflicts. Reload before choosing another action.',
    confirmed: 'Stage advance confirmed. The Project lifecycle is unchanged.',
    confirmedRefreshFailed:
      'Stage advance confirmed. Current progress could not be refreshed. Reload to see it.',
    warning:
      'Illustrative plan. Stage progress does not authorize a real engagement to start. Reopening an earlier Task preserves the stage reached and its history.',
    transition: '{from} → {to}',
    taskVersion: 'Task version {version}',
    todo: 'To do',
    in_progress: 'In progress',
    blocked: 'Blocked',
    done: 'Done',
    cancelled: 'Cancelled',
    bundle: 'Project Stage Advancer',
    prerequisites:
      'Grants only deliberate stage advance. Company context, Template read, Project, Task and original Client read remain separate. Task management and lifecycle approval are not included.',
    granted: 'granted explicit Project stage-advance access',
    revoked: 'revoked Project stage-advance access',
    activity: 'advanced a Project stage',
  },
});
export function useProjectStageCopy() {
  return useMessages(projectStageMessages);
}
