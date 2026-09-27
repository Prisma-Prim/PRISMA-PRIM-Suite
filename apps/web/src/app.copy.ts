import { defineMessages, useMessages } from './localization/messages';

const keys = [
  'checkingAccess',
  'inactiveAccess',
  'accessError',
  'signInRequired',
  'signOut',
  'homeTitle',
  'homeIntroduction',
] as const;

export const appMessages = defineMessages(keys, {
  ro: {
    checkingAccess: 'Se verifică accesul…',
    inactiveAccess: 'Accesul la acest spațiu de lucru este inactiv.',
    accessError: 'Nu am putut verifica accesul. Încercați din nou.',
    signInRequired:
      'Autentificarea este necesară pentru a accesa acest spațiu de lucru.',
    signOut: 'Deconectare',
    homeTitle: 'Bine ați venit în PRISMA-PRIM Suite',
    homeIntroduction:
      'Acest spațiu de lucru este pregătit să găzduiască fluxurile organizației pe măsură ce devin disponibile.',
  },
  ru: {
    checkingAccess: 'Проверяем ваш доступ…',
    inactiveAccess: 'Ваш доступ к этому рабочему пространству неактивен.',
    accessError: 'Не удалось проверить доступ. Повторите попытку.',
    signInRequired:
      'Для доступа к этому рабочему пространству необходимо войти.',
    signOut: 'Выйти',
    homeTitle: 'Добро пожаловать в PRISMA-PRIM Suite',
    homeIntroduction:
      'Это рабочее пространство готово для процессов вашей организации по мере их появления.',
  },
  fr: {
    checkingAccess: 'Vérification de votre accès…',
    inactiveAccess: 'Votre accès à cet espace de travail est inactif.',
    accessError: 'Nous n’avons pas pu vérifier votre accès. Réessayez.',
    signInRequired:
      'Vous devez vous connecter pour accéder à cet espace de travail.',
    signOut: 'Se déconnecter',
    homeTitle: 'Bienvenue dans PRISMA-PRIM Suite',
    homeIntroduction:
      'Cet espace de travail est prêt à accueillir les processus de votre organisation à mesure qu’ils deviennent disponibles.',
  },
  en: {
    checkingAccess: 'Verifying your access…',
    inactiveAccess: 'Your access to this workspace is inactive.',
    accessError: 'We could not verify your access. Please try again.',
    signInRequired: 'Sign in is required to access this workspace.',
    signOut: 'Sign out',
    homeTitle: 'Welcome to PRISMA-PRIM Suite',
    homeIntroduction:
      "This workspace is ready to host your organization's workflows as they become available.",
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
    homeTitle: message('homeTitle'),
    homeIntroduction: message('homeIntroduction'),
  };
}
