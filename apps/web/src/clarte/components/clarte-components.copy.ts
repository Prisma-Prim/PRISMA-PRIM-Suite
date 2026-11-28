import { defineMessages, useMessages } from '../../localization/messages';

const keys = ['close', 'cancel', 'loading'] as const;

export const clarteComponentMessages = defineMessages(keys, {
  ro: { close: 'Închideți', cancel: 'Anulați', loading: 'Se încarcă…' },
  ru: { close: 'Закрыть', cancel: 'Отмена', loading: 'Загрузка…' },
  fr: { close: 'Fermer', cancel: 'Annuler', loading: 'Chargement…' },
  en: { close: 'Close', cancel: 'Cancel', loading: 'Loading…' },
});

export function useClarteComponentCopy() {
  const message = useMessages(clarteComponentMessages);
  return {
    close: message('close'),
    cancel: message('cancel'),
    loading: message('loading'),
  };
}
