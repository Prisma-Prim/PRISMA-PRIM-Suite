import { defineMessages, useMessages } from '../localization/messages';

const keys = ['empty', 'unavailable', 'fallback'] as const;

export const selectMessages = defineMessages(keys, {
  ro: {
    empty: 'Nu există opțiuni disponibile',
    unavailable: 'Selecția nu este disponibilă',
    fallback: 'Selectați o opțiune',
  },
  ru: {
    empty: 'Нет доступных вариантов',
    unavailable: 'Выбор недоступен',
    fallback: 'Выберите вариант',
  },
  fr: {
    empty: 'Aucune option disponible',
    unavailable: 'Sélection indisponible',
    fallback: 'Sélectionnez une option',
  },
  en: {
    empty: 'No options available',
    unavailable: 'Selection unavailable',
    fallback: 'Select an option',
  },
});

export function useSelectCopy() {
  const message = useMessages(selectMessages);
  return {
    empty: message('empty'),
    unavailable: message('unavailable'),
    fallback: message('fallback'),
  };
}
