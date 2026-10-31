import { defineMessages, useMessages } from '../localization/messages';

/** Labels only for the existing generic grant/revoke history boundary. */
export const knowledgeAssignmentActivityMessages = defineMessages(
  [
    'administratorGranted',
    'administratorRevoked',
    'readerGranted',
    'readerRevoked',
  ],
  {
    ro: {
      administratorGranted:
        'a acordat acces de administrare a surselor de cunoștințe ale companiei',
      administratorRevoked:
        'a revocat accesul de administrare a surselor de cunoștințe ale companiei',
      readerGranted: 'a acordat acces la dovezile citate ale companiei',
      readerRevoked: 'a revocat accesul la dovezile citate ale companiei',
    },
    ru: {
      administratorGranted:
        '— предоставление доступа к администрированию источников знаний Компании',
      administratorRevoked:
        '— отзыв доступа к администрированию источников знаний Компании',
      readerGranted:
        '— предоставление доступа к цитируемым материалам Компании',
      readerRevoked: '— отзыв доступа к цитируемым материалам Компании',
    },
    fr: {
      administratorGranted:
        'a accordé l’administration des sources de connaissances de la société',
      administratorRevoked:
        'a révoqué l’administration des sources de connaissances de la société',
      readerGranted: 'a accordé l’accès aux éléments cités de la société',
      readerRevoked: 'a révoqué l’accès aux éléments cités de la société',
    },
    en: {
      administratorGranted:
        'granted Company Knowledge Source Administrator access',
      administratorRevoked:
        'revoked Company Knowledge Source Administrator access',
      readerGranted: 'granted Company Knowledge Evidence Reader access',
      readerRevoked: 'revoked Company Knowledge Evidence Reader access',
    },
  },
);

export function useKnowledgeAssignmentActivityCopy() {
  return useMessages(knowledgeAssignmentActivityMessages);
}
