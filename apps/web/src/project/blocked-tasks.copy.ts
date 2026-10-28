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
export const blockedTasksMessages = defineMessages(keys, {
  en: {
    title: 'Blocked Tasks',
    description: 'Find recorded Task blockages across the active Company.',
    note: 'Review the recorded reason, responsible member and due date. Open the Task in its Project to take an authorized action.',
    list: 'Current blocked Tasks by due date',
    refresh: 'Refresh Blocked Tasks',
    previous: 'Previous page',
    next: 'Next page',
    loading: 'Loading blocked Tasks…',
    empty: 'No current blocked Tasks are readable in this Company.',
    outOfRange:
      'This page no longer contains Tasks. Go back or refresh the list.',
    denied: 'Blocked Tasks are unavailable with your current access.',
    error: 'The list could not be loaded. No Tasks are shown.',
    malformed: 'The list response could not be verified. No Tasks are shown.',
    retry: 'Retry Blocked Tasks',
  },
  ro: {
    title: 'Sarcini blocate',
    description:
      'Găsiți blocajele înregistrate ale Sarcinilor din Compania activă.',
    note: 'Consultați motivul înregistrat, responsabilul și termenul. Deschideți Sarcina în Proiect pentru o acțiune autorizată.',
    list: 'Sarcini blocate curente, în ordinea termenului',
    refresh: 'Actualizați Sarcinile blocate',
    previous: 'Pagina anterioară',
    next: 'Pagina următoare',
    loading: 'Se încarcă Sarcinile blocate…',
    empty:
      'Nu există Sarcini blocate curente pe care le puteți citi în această Companie.',
    outOfRange:
      'Această pagină nu mai conține Sarcini. Reveniți sau actualizați lista.',
    denied: 'Sarcinile blocate nu sunt disponibile cu accesul actual.',
    error: 'Lista nu a putut fi încărcată. Nu se afișează Sarcini.',
    malformed:
      'Răspunsul listei nu a putut fi verificat. Nu se afișează Sarcini.',
    retry: 'Reîncercați încărcarea Sarcinilor blocate',
  },
  ru: {
    title: 'Заблокированные Задачи',
    description:
      'Найдите зарегистрированные блокировки Задач активной Компании.',
    note: 'Проверьте записанную причину, ответственного и срок. Откройте Задачу в её Проекте для разрешённого действия.',
    list: 'Текущие заблокированные Задачи по сроку',
    refresh: 'Обновить заблокированные Задачи',
    previous: 'Предыдущая страница',
    next: 'Следующая страница',
    loading: 'Загрузка заблокированных Задач…',
    empty: 'В этой Компании нет доступных вам текущих заблокированных Задач.',
    outOfRange:
      'На этой странице больше нет Задач. Вернитесь назад или обновите список.',
    denied: 'Заблокированные Задачи недоступны с текущими правами.',
    error: 'Не удалось загрузить список. Задачи не показаны.',
    malformed: 'Ответ списка не прошёл проверку. Задачи не показаны.',
    retry: 'Повторить загрузку заблокированных Задач',
  },
  fr: {
    title: 'Tâches bloquées',
    description:
      'Retrouvez les blocages enregistrés des Tâches de la Compagnie active.',
    note: 'Consultez le motif enregistré, le responsable et l’échéance. Ouvrez la Tâche dans son Projet pour effectuer une action autorisée.',
    list: 'Tâches actuellement bloquées par échéance',
    refresh: 'Actualiser les Tâches bloquées',
    previous: 'Page précédente',
    next: 'Page suivante',
    loading: 'Chargement des Tâches bloquées…',
    empty:
      'Aucune Tâche actuellement bloquée ne vous est accessible dans cette Compagnie.',
    outOfRange:
      'Cette page ne contient plus de Tâches. Revenez en arrière ou actualisez la liste.',
    denied: 'Les Tâches bloquées sont indisponibles avec les droits actuels.',
    error: 'La liste n’a pas pu être chargée. Aucune Tâche n’est affichée.',
    malformed:
      'La réponse de la liste n’a pas pu être vérifiée. Aucune Tâche n’est affichée.',
    retry: 'Réessayer les Tâches bloquées',
  },
});
export function useBlockedTasksCopy() {
  return useMessages(blockedTasksMessages);
}
