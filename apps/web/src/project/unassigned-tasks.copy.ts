import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'title',
  'description',
  'note',
  'list',
  'refresh',
  'previous',
  'next',
  'loading',
  'empty',
  'outOfRange',
  'denied',
  'error',
  'malformed',
  'retry',
] as const;
export const unassignedTasksMessages = defineMessages(keys, {
  ro: {
    title: 'Sarcini neatribuite',
    description:
      'Găsiți Sarcinile deschise fără responsabil din Compania activă.',
    note: 'Deschideți o Sarcină în Proiectul său pentru a-i alege responsabilul.',
    list: 'Sarcini deschise neatribuite, în ordinea termenului',
    refresh: 'Actualizați Sarcinile neatribuite',
    previous: 'Pagina anterioară',
    next: 'Pagina următoare',
    loading: 'Se încarcă Sarcinile neatribuite…',
    empty:
      'Nu există Sarcini deschise neatribuite pe care le puteți citi în această Companie.',
    outOfRange:
      'Această pagină nu mai conține Sarcini. Reveniți sau actualizați lista.',
    denied: 'Sarcinile neatribuite nu sunt disponibile cu accesul actual.',
    error: 'Lista nu a putut fi încărcată. Nu se afișează Sarcini.',
    malformed:
      'Răspunsul listei nu a putut fi verificat. Nu se afișează Sarcini.',
    retry: 'Reîncercați încărcarea Sarcinilor neatribuite',
  },
  ru: {
    title: 'Неназначенные Задачи',
    description:
      'Найдите открытые Задачи без ответственного в активной Компании.',
    note: 'Откройте Задачу в её Проекте, чтобы выбрать ответственного.',
    list: 'Неназначенные открытые Задачи по сроку',
    refresh: 'Обновить неназначенные Задачи',
    previous: 'Предыдущая страница',
    next: 'Следующая страница',
    loading: 'Загрузка неназначенных Задач…',
    empty: 'В этой Компании нет доступных вам открытых неназначенных Задач.',
    outOfRange:
      'На этой странице больше нет Задач. Вернитесь назад или обновите список.',
    denied: 'Неназначенные Задачи недоступны с текущими правами.',
    error: 'Не удалось загрузить список. Задачи не показаны.',
    malformed: 'Ответ списка не прошёл проверку. Задачи не показаны.',
    retry: 'Повторить загрузку неназначенных Задач',
  },
  fr: {
    title: 'Tâches non attribuées',
    description:
      'Trouvez les Tâches ouvertes sans responsable dans la Compagnie active.',
    note: 'Ouvrez une Tâche dans son Projet pour choisir son responsable.',
    list: 'Tâches ouvertes non attribuées par échéance',
    refresh: 'Actualiser les Tâches non attribuées',
    previous: 'Page précédente',
    next: 'Page suivante',
    loading: 'Chargement des Tâches non attribuées…',
    empty:
      'Aucune Tâche ouverte non attribuée ne vous est accessible dans cette Compagnie.',
    outOfRange:
      'Cette page ne contient plus de Tâches. Revenez en arrière ou actualisez la liste.',
    denied:
      'Les Tâches non attribuées sont indisponibles avec les droits actuels.',
    error: 'La liste n’a pas pu être chargée. Aucune Tâche n’est affichée.',
    malformed:
      'La réponse de la liste n’a pas pu être vérifiée. Aucune Tâche n’est affichée.',
    retry: 'Réessayer les Tâches non attribuées',
  },
  en: {
    title: 'Unassigned Tasks',
    description:
      'Find open Tasks without a responsible member in the active Company.',
    note: 'Open a Task in its Project to choose its responsible member.',
    list: 'Unassigned open Tasks by due date',
    refresh: 'Refresh Unassigned Tasks',
    previous: 'Previous page',
    next: 'Next page',
    loading: 'Loading unassigned Tasks…',
    empty: 'No readable open unassigned Tasks in this Company.',
    outOfRange:
      'This page no longer contains Tasks. Go back or refresh the list.',
    denied: 'Unassigned Tasks are unavailable with your current access.',
    error: 'The list could not be loaded. No Tasks are shown.',
    malformed: 'The list response could not be verified. No Tasks are shown.',
    retry: 'Retry Unassigned Tasks',
  },
});
export function useUnassignedTasksCopy() {
  return useMessages(unassignedTasksMessages);
}
