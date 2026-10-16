import { useClientContactEditorCopy } from './client-contact-editor.copy';
import type { ClientContactValidationIssue } from './ClientContactEditor';
import { defineMessages, useMessages } from '../localization/messages';

const serverValidationKeys = [
  'serverDisplayNameRequired',
  'serverDisplayNameTooLong',
  'serverUnknownField',
  'serverTaxIdType',
  'serverTaxIdTooLong',
  'serverAddressType',
  'serverAddressTooLong',
  'serverTelephoneType',
  'serverTelephoneTooLong',
  'serverGeneralEmailType',
  'serverGeneralEmailTooLong',
  'serverGeneralEmailInvalid',
  'serverBusinessActivityType',
  'serverBusinessActivityTooLong',
  'serverContactsBounded',
  'serverContactObject',
  'serverContactUnknownField',
  'serverContactNameRequired',
  'serverContactNameTooLong',
  'serverContactTelephoneType',
  'serverContactTelephoneTooLong',
  'serverContactEmailType',
  'serverContactEmailTooLong',
  'serverContactEmailInvalid',
  'serverContactPositionType',
  'serverContactPositionTooLong',
  'serverContactRolesList',
  'serverContactRoleUnknown',
  'serverContactPreferencesType',
  'serverContactPreferencesTooLong',
  'serverKeyRequired',
  'serverKeyUsed',
  'registrationInvalid',
] as const;

type ServerValidationKey = (typeof serverValidationKeys)[number];
export type ClientContactServerValidationIssue = Extract<
  ServerValidationKey,
  `serverContact${string}`
>;
export type ClientRegistrationValidationIssue =
  'displayNameRequired' | ClientContactValidationIssue | ServerValidationKey;

// These fixed interface messages are the existing registration HTTP contract.
// Keep their meaning; never treat an arbitrary server message as business copy.
const serverValidationIssues: ReadonlyMap<string, ServerValidationKey> =
  new Map([
    ['Client display name is required.', 'serverDisplayNameRequired'],
    ['Client display name is too long.', 'serverDisplayNameTooLong'],
    ['Unknown Client field.', 'serverUnknownField'],
    ['Client tax ID must be text or null.', 'serverTaxIdType'],
    ['Client tax ID is too long.', 'serverTaxIdTooLong'],
    ['Client address must be text or null.', 'serverAddressType'],
    ['Client address is too long.', 'serverAddressTooLong'],
    ['Client telephone must be text or null.', 'serverTelephoneType'],
    ['Client telephone is too long.', 'serverTelephoneTooLong'],
    ['Client general email must be text or null.', 'serverGeneralEmailType'],
    ['Client general email is too long.', 'serverGeneralEmailTooLong'],
    ['Client general email is invalid.', 'serverGeneralEmailInvalid'],
    [
      'Client business activity must be text or null.',
      'serverBusinessActivityType',
    ],
    ['Client business activity is too long.', 'serverBusinessActivityTooLong'],
    ['Client contacts must be a bounded list.', 'serverContactsBounded'],
    ['Each Client contact must be an object.', 'serverContactObject'],
    ['Unknown Client contact field.', 'serverContactUnknownField'],
    ['Client contact name is required.', 'serverContactNameRequired'],
    ['Client contact name is too long.', 'serverContactNameTooLong'],
    [
      'Client contact telephone must be text or null.',
      'serverContactTelephoneType',
    ],
    ['Client contact telephone is too long.', 'serverContactTelephoneTooLong'],
    ['Client contact email must be text or null.', 'serverContactEmailType'],
    ['Client contact email is too long.', 'serverContactEmailTooLong'],
    ['Client contact email is invalid.', 'serverContactEmailInvalid'],
    ['Client contact position must be text.', 'serverContactPositionType'],
    ['Client contact position is too long.', 'serverContactPositionTooLong'],
    ['Client contact decision roles must be a list.', 'serverContactRolesList'],
    ['Unknown Client contact decision role.', 'serverContactRoleUnknown'],
    [
      'Client contact communication preferences must be text.',
      'serverContactPreferencesType',
    ],
    [
      'Client contact communication preferences are too long.',
      'serverContactPreferencesTooLong',
    ],
    ['Idempotency-Key header is required.', 'serverKeyRequired'],
    [
      'Idempotency-Key was already used for another Client command.',
      'serverKeyUsed',
    ],
  ]);

function isContactServerValidationIssue(
  issue: ServerValidationKey,
): issue is ClientContactServerValidationIssue {
  return issue.startsWith('serverContact');
}

export function clientContactServerValidationIssue(
  message: string | undefined,
): ClientContactServerValidationIssue | undefined {
  const issue =
    message === undefined ? undefined : serverValidationIssues.get(message);
  return issue !== undefined && isContactServerValidationIssue(issue)
    ? issue
    : undefined;
}

export function clientRegistrationValidationIssue(
  message: string | undefined,
): ClientRegistrationValidationIssue {
  return message === undefined
    ? 'displayNameRequired'
    : (serverValidationIssues.get(message) ?? 'registrationInvalid');
}

const keys = [
  'closeRegistration',
  'registrationTitle',
  'registrationHint',
  'createRetry',
  'created',
  'displayNameLabel',
  'taxIdLabel',
  'addressLabel',
  'telephoneLabel',
  'generalEmailLabel',
  'businessActivityLabel',
  'create',
  'creating',
  'permissionDenied',
  'displayNameRequired',
  'retryableError',
  'possibleDuplicate',
  ...serverValidationKeys,
] as const;

export const clientRegistrationMessages = defineMessages(keys, {
  ro: {
    serverDisplayNameRequired: 'Numele afișat al Clientului este obligatoriu.',
    serverDisplayNameTooLong: 'Numele afișat al Clientului este prea lung.',
    serverUnknownField: 'Câmp necunoscut al Clientului.',
    serverTaxIdType:
      'IDNO / codul fiscal al Clientului trebuie să fie text sau nul.',
    serverTaxIdTooLong: 'IDNO / codul fiscal al Clientului este prea lung.',
    serverAddressType: 'Adresa Clientului trebuie să fie text sau nul.',
    serverAddressTooLong: 'Adresa Clientului este prea lungă.',
    serverTelephoneType: 'Telefonul Clientului trebuie să fie text sau nul.',
    serverTelephoneTooLong: 'Telefonul Clientului este prea lung.',
    serverGeneralEmailType:
      'Emailul general al Clientului trebuie să fie text sau nul.',
    serverGeneralEmailTooLong: 'Emailul general al Clientului este prea lung.',
    serverGeneralEmailInvalid: 'Emailul general al Clientului nu este valid.',
    serverBusinessActivityType:
      'Activitatea economică a Clientului trebuie să fie text sau nul.',
    serverBusinessActivityTooLong:
      'Activitatea economică a Clientului este prea lungă.',
    serverContactsBounded:
      'Contactele Clientului trebuie să formeze o listă limitată.',
    serverContactObject:
      'Fiecare Contact al Clientului trebuie să fie un obiect.',
    serverContactUnknownField: 'Câmp necunoscut al Contactului Clientului.',
    serverContactNameRequired:
      'Numele Contactului Clientului este obligatoriu.',
    serverContactNameTooLong: 'Numele Contactului Clientului este prea lung.',
    serverContactTelephoneType:
      'Telefonul Contactului Clientului trebuie să fie text sau nul.',
    serverContactTelephoneTooLong:
      'Telefonul Contactului Clientului este prea lung.',
    serverContactEmailType:
      'Emailul Contactului Clientului trebuie să fie text sau nul.',
    serverContactEmailTooLong: 'Emailul Contactului Clientului este prea lung.',
    serverContactEmailInvalid: 'Emailul Contactului Clientului nu este valid.',
    serverContactPositionType:
      'Funcția Contactului Clientului trebuie să fie text.',
    serverContactPositionTooLong:
      'Funcția Contactului Clientului este prea lungă.',
    serverContactRolesList:
      'Rolurile Contactului Clientului în luarea deciziilor trebuie să formeze o listă.',
    serverContactRoleUnknown:
      'Rol necunoscut al Contactului Clientului în luarea deciziilor.',
    serverContactPreferencesType:
      'Preferințele de comunicare ale Contactului Clientului trebuie să fie text.',
    serverContactPreferencesTooLong:
      'Preferințele de comunicare ale Contactului Clientului sunt prea lungi.',
    serverKeyRequired: 'Antetul Idempotency-Key este obligatoriu.',
    serverKeyUsed:
      'Idempotency-Key a fost deja folosit pentru o altă comandă a Clientului.',
    registrationInvalid: 'Verificați datele Clientului și încercați din nou.',
    closeRegistration: 'Închide înregistrarea',
    registrationTitle: 'Înregistrează un Client',
    registrationHint:
      'Închiderea păstrează ciorna. Dacă ați început crearea unui Client, aceasta continuă.',
    createRetry:
      'Crearea Clientului nu a putut fi confirmată. Reîncercați în siguranță cu aceleași date.',
    created: 'Client creat și asociat cu Compania activă.',
    displayNameLabel: 'Numele afișat al Clientului',
    taxIdLabel: 'IDNO / cod fiscal',
    addressLabel: 'Adresă',
    telephoneLabel: 'Telefon',
    generalEmailLabel: 'Email general',
    businessActivityLabel: 'Activitate economică',
    create: 'Creează Client',
    creating: 'Se creează…',
    permissionDenied: 'Nu aveți permisiunea de a gestiona Clienți.',
    displayNameRequired: 'Numele afișat al Clientului este obligatoriu.',
    retryableError: 'Clienții nu au putut fi încărcați. Încercați din nou.',
    possibleDuplicate:
      'Acest Client poate exista deja. Niciun Client nu a fost creat sau modificat. Un responsabil autorizat poate compara în siguranță înregistrările.',
  },
  ru: {
    serverDisplayNameRequired: 'Укажите отображаемое название Клиента.',
    serverDisplayNameTooLong: 'Отображаемое название Клиента слишком длинное.',
    serverUnknownField: 'Неизвестное поле Клиента.',
    serverTaxIdType:
      'IDNO / налоговый код Клиента должен быть текстом или null.',
    serverTaxIdTooLong: 'IDNO / налоговый код Клиента слишком длинный.',
    serverAddressType: 'Адрес Клиента должен быть текстом или null.',
    serverAddressTooLong: 'Адрес Клиента слишком длинный.',
    serverTelephoneType: 'Телефон Клиента должен быть текстом или null.',
    serverTelephoneTooLong: 'Телефон Клиента слишком длинный.',
    serverGeneralEmailType: 'Общий email Клиента должен быть текстом или null.',
    serverGeneralEmailTooLong: 'Общий email Клиента слишком длинный.',
    serverGeneralEmailInvalid: 'Общий email Клиента недействителен.',
    serverBusinessActivityType:
      'Хозяйственная деятельность Клиента должна быть текстом или null.',
    serverBusinessActivityTooLong:
      'Хозяйственная деятельность Клиента слишком длинная.',
    serverContactsBounded:
      'Контакты Клиента должны быть списком ограниченного размера.',
    serverContactObject: 'Каждый Контакт Клиента должен быть объектом.',
    serverContactUnknownField: 'Неизвестное поле Контакта Клиента.',
    serverContactNameRequired: 'Укажите имя Контакта Клиента.',
    serverContactNameTooLong: 'Имя Контакта Клиента слишком длинное.',
    serverContactTelephoneType:
      'Телефон Контакта Клиента должен быть текстом или null.',
    serverContactTelephoneTooLong: 'Телефон Контакта Клиента слишком длинный.',
    serverContactEmailType:
      'Email Контакта Клиента должен быть текстом или null.',
    serverContactEmailTooLong: 'Email Контакта Клиента слишком длинный.',
    serverContactEmailInvalid: 'Email Контакта Клиента недействителен.',
    serverContactPositionType:
      'Должность Контакта Клиента должна быть текстом.',
    serverContactPositionTooLong: 'Должность Контакта Клиента слишком длинная.',
    serverContactRolesList:
      'Роли Контакта Клиента в принятии решений должны быть списком.',
    serverContactRoleUnknown:
      'Неизвестная роль Контакта Клиента в принятии решений.',
    serverContactPreferencesType:
      'Предпочтения Контакта Клиента по общению должны быть текстом.',
    serverContactPreferencesTooLong:
      'Предпочтения Контакта Клиента по общению слишком длинные.',
    serverKeyRequired: 'Требуется заголовок Idempotency-Key.',
    serverKeyUsed:
      'Idempotency-Key уже использован для другой команды Клиента.',
    registrationInvalid: 'Проверьте данные Клиента и повторите попытку.',
    closeRegistration: 'Закрыть регистрацию',
    registrationTitle: 'Зарегистрировать Клиента',
    registrationHint:
      'При закрытии черновик сохраняется. Если создание Клиента уже началось, оно продолжается.',
    createRetry:
      'Не удалось подтвердить создание Клиента. Безопасно повторите попытку с теми же данными.',
    created: 'Клиент создан и связан с активной Компанией.',
    displayNameLabel: 'Отображаемое название Клиента',
    taxIdLabel: 'IDNO / налоговый код',
    addressLabel: 'Адрес',
    telephoneLabel: 'Телефон',
    generalEmailLabel: 'Общий email',
    businessActivityLabel: 'Хозяйственная деятельность',
    create: 'Создать Клиента',
    creating: 'Создание…',
    permissionDenied: 'У вас нет разрешения на управление Клиентами.',
    displayNameRequired: 'Укажите отображаемое название Клиента.',
    retryableError: 'Не удалось загрузить Клиентов. Повторите попытку.',
    possibleDuplicate:
      'Этот Клиент, возможно, уже существует. Ни один Клиент не был создан или изменён. Уполномоченный проверяющий может безопасно сравнить записи.',
  },
  fr: {
    serverDisplayNameRequired: 'Le nom affiché du Client est obligatoire.',
    serverDisplayNameTooLong: 'Le nom affiché du Client est trop long.',
    serverUnknownField: 'Champ du Client inconnu.',
    serverTaxIdType:
      'L’IDNO / code fiscal du Client doit être du texte ou null.',
    serverTaxIdTooLong: 'L’IDNO / code fiscal du Client est trop long.',
    serverAddressType: 'L’adresse du Client doit être du texte ou null.',
    serverAddressTooLong: 'L’adresse du Client est trop longue.',
    serverTelephoneType: 'Le téléphone du Client doit être du texte ou null.',
    serverTelephoneTooLong: 'Le téléphone du Client est trop long.',
    serverGeneralEmailType:
      'L’email général du Client doit être du texte ou null.',
    serverGeneralEmailTooLong: 'L’email général du Client est trop long.',
    serverGeneralEmailInvalid: 'L’email général du Client n’est pas valide.',
    serverBusinessActivityType:
      'L’activité économique du Client doit être du texte ou null.',
    serverBusinessActivityTooLong:
      'L’activité économique du Client est trop longue.',
    serverContactsBounded:
      'Les Contacts du Client doivent former une liste de taille limitée.',
    serverContactObject: 'Chaque Contact du Client doit être un objet.',
    serverContactUnknownField: 'Champ du Contact du Client inconnu.',
    serverContactNameRequired: 'Le nom du Contact du Client est obligatoire.',
    serverContactNameTooLong: 'Le nom du Contact du Client est trop long.',
    serverContactTelephoneType:
      'Le téléphone du Contact du Client doit être du texte ou null.',
    serverContactTelephoneTooLong:
      'Le téléphone du Contact du Client est trop long.',
    serverContactEmailType:
      'L’email du Contact du Client doit être du texte ou null.',
    serverContactEmailTooLong: 'L’email du Contact du Client est trop long.',
    serverContactEmailInvalid: 'L’email du Contact du Client n’est pas valide.',
    serverContactPositionType:
      'La fonction du Contact du Client doit être du texte.',
    serverContactPositionTooLong:
      'La fonction du Contact du Client est trop longue.',
    serverContactRolesList:
      'Les rôles du Contact du Client dans la décision doivent former une liste.',
    serverContactRoleUnknown:
      'Rôle du Contact du Client dans la décision inconnu.',
    serverContactPreferencesType:
      'Les préférences de communication du Contact du Client doivent être du texte.',
    serverContactPreferencesTooLong:
      'Les préférences de communication du Contact du Client sont trop longues.',
    serverKeyRequired: 'L’en-tête Idempotency-Key est obligatoire.',
    serverKeyUsed:
      'Idempotency-Key a déjà été utilisé pour une autre commande du Client.',
    registrationInvalid: 'Vérifiez les informations du Client et réessayez.',
    closeRegistration: 'Fermer l’inscription',
    registrationTitle: 'Inscrire un Client',
    registrationHint:
      'La fermeture conserve votre brouillon. Si vous avez commencé la création d’un Client, elle se poursuit.',
    createRetry:
      'La création du Client n’a pas pu être confirmée. Réessayez en toute sécurité avec les mêmes informations.',
    created: 'Client créé et lié à l’Entreprise active.',
    displayNameLabel: 'Nom affiché du Client',
    taxIdLabel: 'IDNO / code fiscal',
    addressLabel: 'Adresse',
    telephoneLabel: 'Téléphone',
    generalEmailLabel: 'Email général',
    businessActivityLabel: 'Activité économique',
    create: 'Créer le Client',
    creating: 'Création…',
    permissionDenied: 'Vous n’avez pas l’autorisation de gérer les Clients.',
    displayNameRequired: 'Le nom affiché du Client est obligatoire.',
    retryableError: 'Impossible de charger les Clients. Réessayez.',
    possibleDuplicate:
      'Ce Client existe peut-être déjà. Aucun Client n’a été créé ou modifié. Une personne autorisée peut comparer les dossiers en toute sécurité.',
  },
  en: {
    serverDisplayNameRequired: 'Client display name is required.',
    serverDisplayNameTooLong: 'Client display name is too long.',
    serverUnknownField: 'Unknown Client field.',
    serverTaxIdType: 'Client tax ID must be text or null.',
    serverTaxIdTooLong: 'Client tax ID is too long.',
    serverAddressType: 'Client address must be text or null.',
    serverAddressTooLong: 'Client address is too long.',
    serverTelephoneType: 'Client telephone must be text or null.',
    serverTelephoneTooLong: 'Client telephone is too long.',
    serverGeneralEmailType: 'Client general email must be text or null.',
    serverGeneralEmailTooLong: 'Client general email is too long.',
    serverGeneralEmailInvalid: 'Client general email is invalid.',
    serverBusinessActivityType:
      'Client business activity must be text or null.',
    serverBusinessActivityTooLong: 'Client business activity is too long.',
    serverContactsBounded: 'Client contacts must be a bounded list.',
    serverContactObject: 'Each Client contact must be an object.',
    serverContactUnknownField: 'Unknown Client contact field.',
    serverContactNameRequired: 'Client contact name is required.',
    serverContactNameTooLong: 'Client contact name is too long.',
    serverContactTelephoneType:
      'Client contact telephone must be text or null.',
    serverContactTelephoneTooLong: 'Client contact telephone is too long.',
    serverContactEmailType: 'Client contact email must be text or null.',
    serverContactEmailTooLong: 'Client contact email is too long.',
    serverContactEmailInvalid: 'Client contact email is invalid.',
    serverContactPositionType: 'Client contact position must be text.',
    serverContactPositionTooLong: 'Client contact position is too long.',
    serverContactRolesList: 'Client contact decision roles must be a list.',
    serverContactRoleUnknown: 'Unknown Client contact decision role.',
    serverContactPreferencesType:
      'Client contact communication preferences must be text.',
    serverContactPreferencesTooLong:
      'Client contact communication preferences are too long.',
    serverKeyRequired: 'Idempotency-Key header is required.',
    serverKeyUsed:
      'Idempotency-Key was already used for another Client command.',
    registrationInvalid: 'Check the Client details and try again.',
    closeRegistration: 'Close registration',
    registrationTitle: 'Register a Client',
    registrationHint:
      'Closing keeps your draft. If you have started creating a Client, creation continues.',
    createRetry:
      'The Client creation could not be confirmed. Retry the same details safely.',
    created: 'Client created and linked to the active Company.',
    displayNameLabel: 'Client display name',
    taxIdLabel: 'IDNO / tax code',
    addressLabel: 'Address',
    telephoneLabel: 'Telephone',
    generalEmailLabel: 'General email',
    businessActivityLabel: 'Business activity',
    create: 'Create Client',
    creating: 'Creating…',
    permissionDenied: 'You do not have permission to manage Clients.',
    displayNameRequired: 'Client display name is required.',
    retryableError: 'We could not load Clients. Please try again.',
    possibleDuplicate:
      'This Client may already exist. No Client was created or changed. An authorized reviewer can compare the records safely.',
  },
});

export function useClientContactServerValidationCopy() {
  const message = useMessages(clientRegistrationMessages);
  return (issue: ClientContactServerValidationIssue) => message(issue);
}

export function useClientRegistrationCopy() {
  const message = useMessages(clientRegistrationMessages);
  const contacts = useClientContactEditorCopy();
  return {
    closeRegistration: message('closeRegistration'),
    registrationTitle: message('registrationTitle'),
    registrationHint: message('registrationHint'),
    createRetry: message('createRetry'),
    created: message('created'),
    displayNameLabel: message('displayNameLabel'),
    taxIdLabel: message('taxIdLabel'),
    addressLabel: message('addressLabel'),
    telephoneLabel: message('telephoneLabel'),
    generalEmailLabel: message('generalEmailLabel'),
    businessActivityLabel: message('businessActivityLabel'),
    create: message('create'),
    creating: message('creating'),
    permissionDenied: message('permissionDenied'),
    validation: (issue: ClientRegistrationValidationIssue) =>
      issue === 'contactsInvalid' ||
      issue === 'contactPositionTooLong' ||
      issue === 'contactCommunicationPreferencesTooLong'
        ? contacts.validation(issue)
        : message(issue),
    retryableError: message('retryableError'),
    possibleDuplicate: message('possibleDuplicate'),
  };
}
