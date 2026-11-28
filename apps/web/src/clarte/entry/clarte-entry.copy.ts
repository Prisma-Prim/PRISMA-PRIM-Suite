import { defineMessages, useMessages } from '../../localization/messages';

/**
 * The Clarté entry screens reuse the existing welcome, access, invitation and
 * callback texts; only what Clarté adds lives here.
 */
const keys = ['chatGptConnection'] as const;

export const clarteEntryMessages = defineMessages(keys, {
  ro: { chatGptConnection: 'Conectarea ChatGPT' },
  ru: { chatGptConnection: 'Подключение ChatGPT' },
  fr: { chatGptConnection: 'Connexion de ChatGPT' },
  en: { chatGptConnection: 'ChatGPT connection' },
});

export function useClarteEntryCopy() {
  const message = useMessages(clarteEntryMessages);
  return { chatGptConnection: message('chatGptConnection') };
}
