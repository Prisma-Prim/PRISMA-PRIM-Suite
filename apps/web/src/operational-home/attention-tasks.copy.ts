import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'title',
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
] as const;
export const attentionTasksMessages = defineMessages(keys, {
  ro: {
    title: 'Toate Sarcinile care necesită atenția mea',
    close: 'Închideți toate Sarcinile care necesită atenție',
    loading: 'Se încarcă Sarcinile care necesită atenție…',
    error: 'Sarcinile nu au putut fi încărcate. Nu se afișează valori.',
    denied:
      'Sarcinile care necesită atenție nu sunt disponibile cu accesul actual.',
    empty: 'Nicio Sarcină nu necesită atenția dumneavoastră.',
    outOfRange:
      'Această pagină nu mai conține Sarcini. Reveniți sau actualizați lista.',
    range: '{company} · {today} · Total: {total}',
    page: 'Se afișează {first}–{last} din {total}',
    previous: 'Pagina anterioară',
    next: 'Pagina următoare',
    refresh: 'Actualizați Sarcinile care necesită atenție',
    retry: 'Reîncercați încărcarea Sarcinilor',
  },
  ru: {
    title: 'Все Задачи, требующие моего внимания',
    close: 'Закрыть все Задачи, требующие внимания',
    loading: 'Загрузка Задач, требующих внимания…',
    error: 'Не удалось загрузить Задачи. Значения не показаны.',
    denied: 'Задачи, требующие внимания, недоступны с текущими правами.',
    empty: 'Ни одна Задача не требует вашего внимания.',
    outOfRange:
      'На этой странице больше нет Задач. Вернитесь назад или обновите список.',
    range: '{company} · {today} · Всего: {total}',
    page: 'Показано {first}–{last} из {total}',
    previous: 'Предыдущая страница',
    next: 'Следующая страница',
    refresh: 'Обновить Задачи, требующие внимания',
    retry: 'Повторить загрузку Задач',
  },
  fr: {
    title: 'Toutes les Tâches nécessitant mon attention',
    close: 'Fermer toutes les Tâches nécessitant mon attention',
    loading: 'Chargement des Tâches nécessitant votre attention…',
    error:
      'Les Tâches n’ont pas pu être chargées. Aucune valeur n’est affichée.',
    denied:
      'Les Tâches nécessitant votre attention sont indisponibles avec vos accès actuels.',
    empty: 'Aucune Tâche ne nécessite votre attention.',
    outOfRange:
      'Cette page ne contient plus de Tâches. Revenez en arrière ou actualisez la liste.',
    range: '{company} · {today} · Total : {total}',
    page: 'Affichage de {first} à {last} sur {total}',
    previous: 'Page précédente',
    next: 'Page suivante',
    refresh: 'Actualiser les Tâches nécessitant mon attention',
    retry: 'Réessayer le chargement des Tâches',
  },
  en: {
    title: 'All Tasks needing my attention',
    close: 'Close all attention Tasks',
    loading: 'Loading all attention Tasks…',
    error: 'Attention Tasks could not be loaded. No counts are shown.',
    denied: 'Attention Tasks are unavailable with your current access.',
    empty: 'No Tasks need your attention.',
    outOfRange:
      'This page no longer contains Tasks. Go back or refresh the list.',
    range: '{company} · {today} · Total: {total}',
    page: 'Showing {first}–{last} of {total}',
    previous: 'Previous page',
    next: 'Next page',
    refresh: 'Refresh attention Tasks',
    retry: 'Retry loading attention Tasks',
  },
});
export function useAttentionTasksCopy() {
  return useMessages(attentionTasksMessages);
}
