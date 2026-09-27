import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../localization/messages';

const keys = [
  'permissionDenied',
  'displayNameRequired',
  'retryableError',
  'eyebrow',
  'title',
  'description',
  'displayNameLabel',
  'submit',
  'submitting',
  'active',
  'workspace',
  'created',
  'authorizedUser',
  'registeredBy',
] as const;

export const companyRegistrationMessages = defineMessages(keys, {
  ro: {
    permissionDenied:
      'Nu aveți permisiunea de a înregistra sau vedea Companii în acest spațiu de lucru.',
    displayNameRequired: 'Numele afișat al Companiei este obligatoriu.',
    retryableError:
      'Nu am putut înregistra Compania. Solicitarea poate fi reîncercată în siguranță.',
    eyebrow: 'Configurarea spațiului de lucru',
    title: 'Companie furnizoare',
    description: 'Înregistrați Compania furnizoare în acest spațiu de lucru.',
    displayNameLabel: 'Numele afișat al Companiei',
    submit: 'Înregistrați Compania',
    submitting: 'Se înregistrează…',
    active: 'Activă',
    workspace: 'Spațiu de lucru',
    created: 'Creată',
    authorizedUser: 'un utilizator autorizat',
    registeredBy: 'Înregistrată de {name}',
  },
  ru: {
    permissionDenied:
      'У вас нет разрешения регистрировать или просматривать Компании в этом рабочем пространстве.',
    displayNameRequired: 'Отображаемое имя Компании обязательно.',
    retryableError:
      'Не удалось зарегистрировать Компанию. Запрос можно безопасно повторить.',
    eyebrow: 'Настройка рабочего пространства',
    title: 'Компания-поставщик',
    description:
      'Зарегистрируйте Компанию-поставщика в этом рабочем пространстве.',
    displayNameLabel: 'Отображаемое имя Компании',
    submit: 'Зарегистрировать Компанию',
    submitting: 'Регистрация…',
    active: 'Активна',
    workspace: 'Рабочее пространство',
    created: 'Создана',
    authorizedUser: 'авторизованный пользователь',
    registeredBy: 'Зарегистрировал: {name}',
  },
  fr: {
    permissionDenied:
      'Vous n’avez pas l’autorisation d’enregistrer ou de consulter les Entreprises de cet espace de travail.',
    displayNameRequired: 'Le nom affiché de l’Entreprise est obligatoire.',
    retryableError:
      'Nous n’avons pas pu enregistrer l’Entreprise. La demande peut être relancée sans risque.',
    eyebrow: 'Configuration de l’espace de travail',
    title: 'Entreprise prestataire',
    description:
      'Enregistrez votre Entreprise prestataire dans cet espace de travail.',
    displayNameLabel: 'Nom affiché de l’Entreprise',
    submit: 'Enregistrer l’Entreprise',
    submitting: 'Enregistrement…',
    active: 'Active',
    workspace: 'Espace de travail',
    created: 'Créée',
    authorizedUser: 'un utilisateur autorisé',
    registeredBy: 'Enregistrée par {name}',
  },
  en: {
    permissionDenied:
      'You do not have permission to register or view Companies in this Workspace.',
    displayNameRequired: 'Company display name is required.',
    retryableError:
      'We could not register the Company. Your request can be retried safely.',
    eyebrow: 'Workspace setup',
    title: 'Provider Company',
    description: 'Register your provider Company in this Workspace.',
    displayNameLabel: 'Company display name',
    submit: 'Register Company',
    submitting: 'Registering…',
    active: 'Active',
    workspace: 'Workspace',
    created: 'Created',
    authorizedUser: 'an authorized user',
    registeredBy: 'Registered by {name}',
  },
});

export function useCompanyRegistrationCopy() {
  const message = useMessages(companyRegistrationMessages);
  return {
    permissionDenied: message('permissionDenied'),
    displayNameRequired: message('displayNameRequired'),
    retryableError: message('retryableError'),
    eyebrow: message('eyebrow'),
    title: message('title'),
    description: message('description'),
    displayNameLabel: message('displayNameLabel'),
    submit: message('submit'),
    submitting: message('submitting'),
    active: message('active'),
    workspace: message('workspace'),
    created: message('created'),
    authorizedUser: message('authorizedUser'),
    registeredBy: (name: string) =>
      formatMessage(message('registeredBy'), { name }),
  };
}
