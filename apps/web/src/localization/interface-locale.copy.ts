import { defineMessages, useMessages } from './messages';

type InterfaceLocaleMessageKey = 'label';
const keys: readonly InterfaceLocaleMessageKey[] = ['label'];

export const interfaceLocaleMessages = defineMessages(keys, {
  ro: { label: 'Limba interfeței' },
  ru: { label: 'Язык интерфейса' },
  fr: { label: 'Langue de l’interface' },
  en: { label: 'Interface language' },
});

export function useInterfaceLocaleCopy() {
  const message = useMessages(interfaceLocaleMessages);
  return { label: message('label') };
}
