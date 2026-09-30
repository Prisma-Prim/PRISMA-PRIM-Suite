import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'title',
  'description',
  'accept',
  'retry',
  'loading',
  'authentication',
  'signIn',
  'signUp',
  'checking',
  'denied',
  'error',
  'signOut',
] as const;

export const invitationAcceptanceMessages = defineMessages(keys, {
  ro: {
    title: 'Alăturați-vă spațiului de lucru',
    description:
      'Acceptați invitația pentru a intra în spațiul de lucru. Accesul la Companie și permisiunile de afaceri se atribuie separat.',
    accept: 'Acceptați invitația',
    retry: 'Reîncercați acceptarea',
    loading: 'Se confirmă invitația…',
    authentication: 'Conectați-vă cu contul care a primit această invitație.',
    signIn: 'Conectați-vă',
    signUp: 'Creați contul invitat',
    checking: 'Se verifică identitatea…',
    denied:
      'Această invitație nu poate fi acceptată cu accesul actual. Cereți ajutorul unui Proprietar al spațiului de lucru.',
    error:
      'Acceptarea nu a putut fi confirmată. Reîncercați pentru a verifica în siguranță aceeași solicitare.',
    signOut: 'Folosiți alt cont',
  },
  ru: {
    title: 'Присоединиться к рабочему пространству',
    description:
      'Примите приглашение, чтобы войти в рабочее пространство. Доступ к Компании и рабочие разрешения назначаются отдельно.',
    accept: 'Принять приглашение',
    retry: 'Повторить принятие',
    loading: 'Подтверждение приглашения…',
    authentication:
      'Войдите с помощью учётной записи, получившей это приглашение.',
    signIn: 'Войти',
    signUp: 'Создать приглашённую учётную запись',
    checking: 'Проверка личности…',
    denied:
      'Это приглашение нельзя принять с текущим доступом. Обратитесь за помощью к Владельцу рабочего пространства.',
    error:
      'Не удалось подтвердить принятие. Повторите попытку, чтобы безопасно проверить тот же запрос.',
    signOut: 'Использовать другую учётную запись',
  },
  fr: {
    title: 'Rejoindre votre espace de travail',
    description:
      'Acceptez votre invitation pour entrer dans l’espace de travail. L’accès aux Entreprises et les autorisations métier sont attribués séparément.',
    accept: 'Accepter l’invitation',
    retry: 'Réessayer l’acceptation',
    loading: 'Confirmation de votre invitation…',
    authentication:
      'Connectez-vous avec le compte qui a reçu cette invitation.',
    signIn: 'Se connecter',
    signUp: 'Créer votre compte invité',
    checking: 'Vérification de votre identité…',
    denied:
      'Cette invitation ne peut pas être acceptée avec votre accès actuel. Demandez de l’aide à un Propriétaire de l’espace de travail.',
    error:
      'L’acceptation n’a pas pu être confirmée. Réessayez pour vérifier la même demande sans risque.',
    signOut: 'Utiliser un autre compte',
  },
  en: {
    title: 'Join your Workspace',
    description:
      'Accept your invitation to enter the Workspace. Company access and business permissions are assigned separately.',
    accept: 'Accept invitation',
    retry: 'Retry acceptance',
    loading: 'Confirming your invitation…',
    authentication: 'Sign in with the account that received this invitation.',
    signIn: 'Sign in',
    signUp: 'Create your invited account',
    checking: 'Verifying your identity…',
    denied:
      'This invitation cannot be accepted with your current access. Ask a Workspace Owner for help.',
    error:
      'Acceptance could not be confirmed. Retry to check the same request safely.',
    signOut: 'Use another account',
  },
});

export function useInvitationAcceptanceCopy() {
  const message = useMessages(invitationAcceptanceMessages);
  return {
    title: message('title'),
    description: message('description'),
    accept: message('accept'),
    retry: message('retry'),
    loading: message('loading'),
    authentication: message('authentication'),
    signIn: message('signIn'),
    signUp: message('signUp'),
    checking: message('checking'),
    denied: message('denied'),
    error: message('error'),
    signOut: message('signOut'),
  };
}
