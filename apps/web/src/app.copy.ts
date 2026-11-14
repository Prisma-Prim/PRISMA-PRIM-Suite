import { defineMessages, useMessages } from './localization/messages';

const keys = [
  'checkingAccess',
  'inactiveAccess',
  'accessError',
  'signInRequired',
  'signOut',
] as const;

export const appMessages = defineMessages(keys, {
  ro: {
    checkingAccess: 'Se verifică accesul…',
    inactiveAccess: 'Accesul la acest spațiu de lucru este inactiv.',
    accessError: 'Nu am putut verifica accesul. Încercați din nou.',
    signInRequired:
      'Autentificarea este necesară pentru a accesa acest spațiu de lucru.',
    signOut: 'Deconectare',
  },
  ru: {
    checkingAccess: 'Проверяем ваш доступ…',
    inactiveAccess: 'Ваш доступ к этому рабочему пространству неактивен.',
    accessError: 'Не удалось проверить доступ. Повторите попытку.',
    signInRequired:
      'Для доступа к этому рабочему пространству необходимо войти.',
    signOut: 'Выйти',
  },
  fr: {
    checkingAccess: 'Vérification de votre accès…',
    inactiveAccess: 'Votre accès à cet espace de travail est inactif.',
    accessError: 'Nous n’avons pas pu vérifier votre accès. Réessayez.',
    signInRequired:
      'Vous devez vous connecter pour accéder à cet espace de travail.',
    signOut: 'Se déconnecter',
  },
  en: {
    checkingAccess: 'Verifying your access…',
    inactiveAccess: 'Your access to this workspace is inactive.',
    accessError: 'We could not verify your access. Please try again.',
    signInRequired: 'Sign in is required to access this workspace.',
    signOut: 'Sign out',
  },
});

export function useAppCopy() {
  const message = useMessages(appMessages);
  return {
    checkingAccess: message('checkingAccess'),
    inactiveAccess: message('inactiveAccess'),
    accessError: message('accessError'),
    signInRequired: message('signInRequired'),
    signOut: message('signOut'),
  };
}
