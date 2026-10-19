import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'title',
  'definition',
  'open',
  'close',
  'loading',
  'error',
  'denied',
  'empty',
  'outOfRange',
  'range',
  'page',
  'previous',
  'next',
  'refresh',
  'retry',
  'list',
] as const;
export const upcomingDeadlinesMessages = defineMessages(keys, {
  ro: {
    title: 'Termenele mele apropiate',
    definition:
      'Sarcinile deschise atribuite dvs., de astăzi până peste șapte zile inclusiv.',
    open: 'Afișați termenele mele apropiate',
    close: 'Închideți termenele mele apropiate',
    loading: 'Se încarcă termenele dvs.…',
    error: 'Termenele nu au putut fi încărcate. Nu se afișează Sarcini.',
    denied: 'Termenele nu sunt disponibile cu accesul actual.',
    empty: 'Nu aveți Sarcini deschise în acest interval.',
    outOfRange:
      'Această pagină nu mai conține Sarcini. Reveniți sau actualizați lista.',
    range: '{company} · {today} – {throughDate} (inclusiv) · Total: {total}',
    page: 'Se afișează {first}–{last} din {total}',
    previous: 'Pagina anterioară',
    next: 'Pagina următoare',
    refresh: 'Actualizați termenele',
    retry: 'Reîncercați încărcarea termenelor',
    list: 'Sarcinile mele în ordinea termenului',
  },
  ru: {
    title: 'Мои ближайшие сроки',
    definition:
      'Назначенные вам открытые Задачи: с сегодняшнего дня до даты через семь дней включительно.',
    open: 'Показать мои ближайшие сроки',
    close: 'Закрыть мои ближайшие сроки',
    loading: 'Загрузка ваших сроков…',
    error: 'Не удалось загрузить сроки. Задачи не показаны.',
    denied: 'Сроки недоступны с текущими правами.',
    empty: 'У вас нет открытых Задач в этом периоде.',
    outOfRange:
      'На этой странице больше нет Задач. Вернитесь назад или обновите список.',
    range:
      '{company} · {today} – {throughDate} (включительно) · Всего: {total}',
    page: 'Показано {first}–{last} из {total}',
    previous: 'Предыдущая страница',
    next: 'Следующая страница',
    refresh: 'Обновить сроки',
    retry: 'Повторить загрузку сроков',
    list: 'Мои Задачи по сроку',
  },
  fr: {
    title: 'Mes prochaines échéances',
    definition:
      'Vos Tâches ouvertes, d’aujourd’hui à la date dans sept jours incluse.',
    open: 'Afficher mes prochaines échéances',
    close: 'Fermer mes prochaines échéances',
    loading: 'Chargement de vos échéances…',
    error:
      'Les échéances n’ont pas pu être chargées. Aucune Tâche n’est affichée.',
    denied: 'Les échéances sont indisponibles avec vos accès actuels.',
    empty: 'Vous n’avez aucune Tâche ouverte dans cette période.',
    outOfRange:
      'Cette page ne contient plus de Tâches. Revenez en arrière ou actualisez la liste.',
    range: '{company} · du {today} au {throughDate} inclus · Total : {total}',
    page: 'Affichage de {first} à {last} sur {total}',
    previous: 'Page précédente',
    next: 'Page suivante',
    refresh: 'Actualiser les échéances',
    retry: 'Réessayer le chargement des échéances',
    list: 'Mes Tâches par échéance',
  },
  en: {
    title: 'My upcoming deadlines',
    definition:
      'Your open Tasks, from today through the date seven days ahead inclusive.',
    open: 'Show my upcoming deadlines',
    close: 'Close my upcoming deadlines',
    loading: 'Loading your deadlines…',
    error: 'Your deadlines could not be loaded. No Tasks are shown.',
    denied: 'Deadlines are unavailable with your current access.',
    empty: 'You have no open Tasks in this date range.',
    outOfRange:
      'This page no longer contains Tasks. Go back or refresh the list.',
    range: '{company} · {today} – {throughDate} (inclusive) · Total: {total}',
    page: 'Showing {first}–{last} of {total}',
    previous: 'Previous page',
    next: 'Next page',
    refresh: 'Refresh deadlines',
    retry: 'Retry loading deadlines',
    list: 'My Tasks in due-date order',
  },
});
export function useUpcomingDeadlinesCopy() {
  return useMessages(upcomingDeadlinesMessages);
}
