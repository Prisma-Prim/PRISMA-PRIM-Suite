import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'title',
  'loading',
  'empty',
  'error',
  'denied',
  'refresh',
  'retry',
  'next',
  'previous',
  'open',
  'page',
  'hint',
] as const;
const messages = defineMessages(keys, {
  en: {
    title: 'Commercial affairs',
    loading: 'Loading commercial affairs…',
    empty: 'No commercial affairs for this client in this company.',
    error: 'Commercial affairs could not be loaded.',
    denied:
      'Commercial affairs are unavailable with your current access or client identity.',
    refresh: 'Refresh affairs from beginning',
    retry: 'Retry this page',
    next: 'Older affairs',
    previous: 'Previous affairs',
    open: 'Open Request',
    page: 'Page',
    hint: 'All recorded outcome statuses are included. Refresh to include changes.',
  },
  fr: {
    title: 'Affaires commerciales',
    loading: 'Chargement des affaires commerciales…',
    empty: 'Aucune affaire commerciale pour ce client dans cette entreprise.',
    error: 'Impossible de charger les affaires commerciales.',
    denied:
      'Les affaires commerciales sont indisponibles avec vos droits ou l’identité actuelle du client.',
    refresh: 'Actualiser les affaires depuis le début',
    retry: 'Réessayer cette page',
    next: 'Affaires plus anciennes',
    previous: 'Affaires précédentes',
    open: 'Ouvrir la demande',
    page: 'Page',
    hint: 'Tous les états enregistrés sont inclus. Actualisez pour inclure les changements.',
  },
  ro: {
    title: 'Dosare comerciale',
    loading: 'Se încarcă dosarele comerciale…',
    empty:
      'Nu există dosare comerciale pentru acest Client în această Companie.',
    error: 'Dosarele comerciale nu au putut fi încărcate.',
    denied:
      'Dosarele comerciale nu sunt disponibile cu accesul sau identitatea curentă a Clientului.',
    refresh: 'Actualizează dosarele de la început',
    retry: 'Reîncearcă această pagină',
    next: 'Dosare mai vechi',
    previous: 'Dosare precedente',
    open: 'Deschide Solicitarea',
    page: 'Pagina',
    hint: 'Sunt incluse toate stările înregistrate. Actualizați pentru a include modificările.',
  },
  ru: {
    title: 'Коммерческие дела',
    loading: 'Загрузка коммерческих дел…',
    empty: 'У этого клиента нет коммерческих дел в этой компании.',
    error: 'Не удалось загрузить коммерческие дела.',
    denied:
      'Коммерческие дела недоступны с текущими правами или идентичностью клиента.',
    refresh: 'Обновить дела с начала',
    retry: 'Повторить загрузку страницы',
    next: 'Более ранние дела',
    previous: 'Предыдущие дела',
    open: 'Открыть запрос',
    page: 'Страница',
    hint: 'Показаны все зарегистрированные статусы. Обновите для получения изменений.',
  },
});
export function useClientCommercialCopy() {
  return useMessages(messages);
}
