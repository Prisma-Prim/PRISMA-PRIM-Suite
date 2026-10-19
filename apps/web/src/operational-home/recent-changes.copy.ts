import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'title',
  'definition',
  'loading',
  'error',
  'empty',
  'retry',
  'refresh',
  'openActivity',
] as const;

export const recentChangesMessages = defineMessages(keys, {
  ro: {
    title: 'Modificări recente',
    definition:
      'Cele mai recente cinci evenimente datate pe care le puteți vedea în contextul actual de Activitate. Datele pot fi mai vechi.',
    loading: 'Se încarcă modificările recente…',
    error:
      'Modificările recente nu sunt disponibile. Nu se afișează evenimente.',
    empty:
      'Nu există evenimente datate de afișat în contextul actual de Activitate.',
    retry: 'Reîncercați încărcarea modificărilor recente',
    refresh: 'Actualizați modificările recente',
    openActivity: 'Deschideți întregul Jurnal de activitate',
  },
  ru: {
    title: 'Последние изменения',
    definition:
      'Пять последних датированных событий, доступных вам в текущем контексте журнала. Даты могут быть давними.',
    loading: 'Загрузка последних изменений…',
    error: 'Последние изменения недоступны. События не показаны.',
    empty: 'В текущем контексте журнала нет датированных событий для показа.',
    retry: 'Повторить загрузку последних изменений',
    refresh: 'Обновить последние изменения',
    openActivity: 'Открыть полный Журнал действий',
  },
  fr: {
    title: 'Changements récents',
    definition:
      'Les cinq événements datés les plus récents que vous pouvez voir dans le contexte actuel du journal. Leurs dates peuvent être anciennes.',
    loading: 'Chargement des changements récents…',
    error:
      'Les changements récents sont indisponibles. Aucun événement n’est affiché.',
    empty:
      'Aucun événement daté à afficher dans le contexte actuel du journal.',
    retry: 'Réessayer le chargement des changements récents',
    refresh: 'Actualiser les changements récents',
    openActivity: 'Ouvrir le journal d’activité complet',
  },
  en: {
    title: 'Recent changes',
    definition:
      'The five latest dated events you can see in the current Activity context. Their dates may be old.',
    loading: 'Loading recent changes…',
    error: 'Recent changes are unavailable. No events are shown.',
    empty: 'No dated events to show in the current Activity context.',
    retry: 'Retry loading recent changes',
    refresh: 'Refresh recent changes',
    openActivity: 'Open full Activity Log',
  },
});

export function useRecentChangesCopy() {
  return useMessages(recentChangesMessages);
}
