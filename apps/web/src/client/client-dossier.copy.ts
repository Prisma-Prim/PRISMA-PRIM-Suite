import { useInterfaceLocale } from '../localization/interface-locale';
import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../localization/messages';

const keys = [
  'displayNameLabel',
  'taxIdLabel',
  'addressLabel',
  'telephoneLabel',
  'generalEmailLabel',
  'businessActivityLabel',
  'displayNameRequired',
  'permissionDenied',
  'possibleDuplicate',
  'openProjects',
  'openDocuments',
  'openRequests',
  'loadingDossier',
  'dossierNotFound',
  'dossierEyebrow',
  'version',
  'notProvided',
  'involvedCompaniesLabel',
  'contactsLabel',
  'noContacts',
  'correctionFormLabel',
  'sharedDetails',
  'closeCorrection',
  'correctionHint',
  'reloadCorrectionHint',
  'dossierLoadError',
  'correctionInvalid',
  'correctionUnchanged',
  'correctionUnknownField',
  'correctionFieldRequired',
  'correctionVersionInvalid',
  'correctionKeyUsed',

  'saveCorrection',
  'savingCorrection',
  'correctionSaved',
  'correctionRetry',
  'staleCorrection',
  'reloadDossier',
] as const;

export const clientDossierMessages = defineMessages(keys, {
  ro: {
    correctionUnchanged:
      'Corectarea Clientului trebuie să modifice cel puțin un câmp.',
    correctionUnknownField: 'Câmp necunoscut în corectarea Clientului.',
    correctionFieldRequired: 'Este necesar cel puțin un câmp al Clientului.',
    correctionVersionInvalid:
      'Versiunea așteptată a Clientului trebuie să fie un număr întreg între 1 și 2147483646.',
    correctionKeyUsed:
      'Idempotency-Key a fost deja folosită pentru o altă corectare a Clientului.',
    displayNameLabel: 'Numele afișat al Clientului',
    taxIdLabel: 'IDNO / cod fiscal',
    addressLabel: 'Adresă',
    telephoneLabel: 'Telefon',
    generalEmailLabel: 'Email general',
    businessActivityLabel: 'Activitate economică',
    displayNameRequired: 'Numele afișat al Clientului este obligatoriu.',
    permissionDenied: 'Nu ai permisiunea de a gestiona Clienți.',
    possibleDuplicate:
      'Acest Client poate exista deja. Niciun Client nu a fost creat sau modificat. O persoană autorizată poate compara dosarele în siguranță.',
    openProjects: 'Deschide Proiectele Clientului',
    openDocuments: 'Deschide Documentele de lucru ale Clientului',
    openRequests: 'Deschide Cererile Clientului',
    loadingDossier: 'Se încarcă dosarul Clientului…',
    dossierNotFound:
      'Dosarul Clientului nu este disponibil în această Companie.',
    dossierEyebrow: 'Dosar general comun',
    version: 'Versiunea {version}',
    notProvided: 'Nefurnizat',
    involvedCompaniesLabel: 'Companii prestatoare implicate',
    contactsLabel: 'Contacte',
    noContacts: 'Nu sunt înregistrate Contacte comune.',
    correctionFormLabel: 'Corectează dosarul Clientului',
    sharedDetails: 'Date comune',
    closeCorrection: 'Închide corectarea',
    correctionHint:
      'Închiderea păstrează ciorna. O corectare în curs de salvare continuă.',
    reloadCorrectionHint:
      'Reîncărcarea înlocuiește ciorna cu datele salvate curente.',
    dossierLoadError:
      'Nu am putut încărca dosarul acestui Client. Încearcă din nou.',
    correctionInvalid: 'Corectarea Clientului nu este validă.',
    saveCorrection: 'Salvează corectarea',
    savingCorrection: 'Se salvează…',
    correctionSaved:
      'Corectarea Clientului a fost salvată cu istoric atribuibil.',
    correctionRetry:
      'Corectarea nu a putut fi salvată. Reîncearcă în siguranță.',
    staleCorrection:
      'Acest dosar s-a modificat înainte de salvarea corectării tale. Reîncarcă versiunea curentă înainte de a reîncerca.',
    reloadDossier: 'Reîncarcă dosarul',
  },
  ru: {
    correctionUnchanged:
      'Исправление Клиента должно изменять хотя бы одно поле.',
    correctionUnknownField: 'Неизвестное поле исправления Клиента.',
    correctionFieldRequired: 'Требуется хотя бы одно поле Клиента.',
    correctionVersionInvalid:
      'Ожидаемая версия Клиента должна быть целым числом от 1 до 2147483646.',
    correctionKeyUsed:
      'Idempotency-Key уже использован для другого исправления Клиента.',
    displayNameLabel: 'Отображаемое название Клиента',
    taxIdLabel: 'IDNO / налоговый код',
    addressLabel: 'Адрес',
    telephoneLabel: 'Телефон',
    generalEmailLabel: 'Общий email',
    businessActivityLabel: 'Хозяйственная деятельность',
    displayNameRequired: 'Укажите отображаемое название Клиента.',
    permissionDenied: 'У вас нет разрешения на управление Клиентами.',
    possibleDuplicate:
      'Этот Клиент, возможно, уже существует. Ни один Клиент не был создан или изменён. Уполномоченный проверяющий может безопасно сравнить записи.',
    openProjects: 'Открыть Проекты Клиента',
    openDocuments: 'Открыть рабочие Документы Клиента',
    openRequests: 'Открыть Запросы Клиента',
    loadingDossier: 'Загрузка досье Клиента…',
    dossierNotFound: 'Досье Клиента недоступно в этой Компании.',
    dossierEyebrow: 'Общее досье',
    version: 'Версия {version}',
    notProvided: 'Не указано',
    involvedCompaniesLabel: 'Задействованные Компании-поставщики',
    contactsLabel: 'Контакты',
    noContacts: 'Общие Контакты не зарегистрированы.',
    correctionFormLabel: 'Исправить досье Клиента',
    sharedDetails: 'Общие сведения',
    closeCorrection: 'Закрыть исправление',
    correctionHint:
      'Закрытие сохраняет черновик. Уже начатое сохранение исправления продолжается.',
    reloadCorrectionHint:
      'Перезагрузка заменяет черновик текущими сохранёнными сведениями.',
    dossierLoadError:
      'Не удалось загрузить досье этого Клиента. Повторите попытку.',
    correctionInvalid: 'Исправление Клиента недействительно.',
    saveCorrection: 'Сохранить исправление',
    savingCorrection: 'Сохранение…',
    correctionSaved:
      'Исправление Клиента сохранено с указанием автора в истории.',
    correctionRetry:
      'Не удалось сохранить исправление. Безопасно повторите попытку.',
    staleCorrection:
      'Это досье изменилось до сохранения вашего исправления. Перед повторной попыткой загрузите текущую версию.',
    reloadDossier: 'Перезагрузить досье',
  },
  fr: {
    correctionUnchanged:
      'La correction du Client doit modifier au moins un champ.',
    correctionUnknownField: 'Champ de correction du Client inconnu.',
    correctionFieldRequired: 'Au moins un champ du Client est requis.',
    correctionVersionInvalid:
      'La version attendue du Client doit être un entier entre 1 et 2147483646.',
    correctionKeyUsed:
      'Idempotency-Key a déjà été utilisé pour une autre correction du Client.',
    displayNameLabel: 'Nom affiché du Client',
    taxIdLabel: 'IDNO / code fiscal',
    addressLabel: 'Adresse',
    telephoneLabel: 'Téléphone',
    generalEmailLabel: 'Email général',
    businessActivityLabel: 'Activité économique',
    displayNameRequired: 'Le nom affiché du Client est obligatoire.',
    permissionDenied: 'Vous n’avez pas l’autorisation de gérer les Clients.',
    possibleDuplicate:
      'Ce Client existe peut-être déjà. Aucun Client n’a été créé ou modifié. Une personne autorisée peut comparer les dossiers en toute sécurité.',
    openProjects: 'Ouvrir les Projets du Client',
    openDocuments: 'Ouvrir les Documents de travail du Client',
    openRequests: 'Ouvrir les Demandes du Client',
    loadingDossier: 'Chargement du dossier du Client…',
    dossierNotFound:
      'Le dossier du Client n’est pas disponible dans cette Entreprise.',
    dossierEyebrow: 'Dossier général partagé',
    version: 'Version {version}',
    notProvided: 'Non renseigné',
    involvedCompaniesLabel: 'Entreprises prestataires concernées',
    contactsLabel: 'Contacts',
    noContacts: 'Aucun Contact partagé enregistré.',
    correctionFormLabel: 'Corriger le dossier du Client',
    sharedDetails: 'Informations partagées',
    closeCorrection: 'Fermer la correction',
    correctionHint:
      'La fermeture conserve votre brouillon. Une correction en cours d’enregistrement se poursuit.',
    reloadCorrectionHint:
      'Le rechargement remplace votre brouillon par les informations actuellement enregistrées.',
    dossierLoadError:
      'Impossible de charger le dossier de ce Client. Réessayez.',
    correctionInvalid: 'La correction du Client n’est pas valide.',
    saveCorrection: 'Enregistrer la correction',
    savingCorrection: 'Enregistrement…',
    correctionSaved:
      'Correction du Client enregistrée avec un historique attribuable.',
    correctionRetry:
      'La correction n’a pas pu être enregistrée. Réessayez en toute sécurité.',
    staleCorrection:
      'Ce dossier a changé avant l’enregistrement de votre correction. Rechargez la version actuelle avant de réessayer.',
    reloadDossier: 'Recharger le dossier',
  },
  en: {
    correctionUnchanged:
      'The Client correction must change at least one field.',
    correctionUnknownField: 'Unknown Client correction field.',
    correctionFieldRequired: 'At least one Client field is required.',
    correctionVersionInvalid:
      'Expected Client version must be an integer between 1 and 2147483646.',
    correctionKeyUsed:
      'Idempotency-Key was already used for another Client correction.',
    displayNameLabel: 'Client display name',
    taxIdLabel: 'IDNO / tax code',
    addressLabel: 'Address',
    telephoneLabel: 'Telephone',
    generalEmailLabel: 'General email',
    businessActivityLabel: 'Business activity',
    displayNameRequired: 'Client display name is required.',
    permissionDenied: 'You do not have permission to manage Clients.',
    possibleDuplicate:
      'This Client may already exist. No Client was created or changed. An authorized reviewer can compare the records safely.',
    openProjects: 'Open Client Projects',
    openDocuments: 'Open Client working Documents',
    openRequests: 'Open Client Requests',
    loadingDossier: 'Loading Client dossier…',
    dossierNotFound: 'The Client dossier is not available in this Company.',
    dossierEyebrow: 'Shared general dossier',
    version: 'Version {version}',
    notProvided: 'Not provided',
    involvedCompaniesLabel: 'Involved provider Companies',
    contactsLabel: 'Contacts',
    noContacts: 'No shared Contacts recorded.',
    correctionFormLabel: 'Correct Client dossier',
    sharedDetails: 'Shared details',
    closeCorrection: 'Close correction',
    correctionHint:
      'Closing keeps your draft. A correction already being saved continues.',
    reloadCorrectionHint:
      'Reloading replaces your draft with the current saved details.',
    dossierLoadError:
      'We could not load this Client dossier. Please try again.',
    correctionInvalid: 'The Client correction is invalid.',
    saveCorrection: 'Save correction',
    savingCorrection: 'Saving…',
    correctionSaved: 'Client correction saved with attributable history.',
    correctionRetry: 'The correction could not be saved. Retry safely.',
    staleCorrection:
      'This dossier changed before your correction was saved. Reload the current version before retrying.',
    reloadDossier: 'Reload dossier',
  },
});

export function useClientDossierCopy() {
  const message = useMessages(clientDossierMessages);
  const { formatNumber } = useInterfaceLocale();
  return {
    displayNameLabel: message('displayNameLabel'),
    taxIdLabel: message('taxIdLabel'),
    addressLabel: message('addressLabel'),
    telephoneLabel: message('telephoneLabel'),
    generalEmailLabel: message('generalEmailLabel'),
    businessActivityLabel: message('businessActivityLabel'),
    displayNameRequired: message('displayNameRequired'),
    permissionDenied: message('permissionDenied'),
    possibleDuplicate: message('possibleDuplicate'),
    openProjects: message('openProjects'),
    openDocuments: message('openDocuments'),
    openRequests: message('openRequests'),
    loadingDossier: message('loadingDossier'),
    dossierNotFound: message('dossierNotFound'),
    dossierEyebrow: message('dossierEyebrow'),
    notProvided: message('notProvided'),
    involvedCompaniesLabel: message('involvedCompaniesLabel'),
    contactsLabel: message('contactsLabel'),
    noContacts: message('noContacts'),
    correctionFormLabel: message('correctionFormLabel'),
    sharedDetails: message('sharedDetails'),
    closeCorrection: message('closeCorrection'),
    correctionHint: message('correctionHint'),
    reloadCorrectionHint: message('reloadCorrectionHint'),
    dossierLoadError: message('dossierLoadError'),
    correctionInvalid: message('correctionInvalid'),
    correctionUnchanged: message('correctionUnchanged'),
    correctionUnknownField: message('correctionUnknownField'),
    correctionFieldRequired: message('correctionFieldRequired'),
    correctionVersionInvalid: message('correctionVersionInvalid'),
    correctionKeyUsed: message('correctionKeyUsed'),

    saveCorrection: message('saveCorrection'),
    savingCorrection: message('savingCorrection'),
    correctionSaved: message('correctionSaved'),
    correctionRetry: message('correctionRetry'),
    staleCorrection: message('staleCorrection'),
    reloadDossier: message('reloadDossier'),
    version: (version: number) =>
      formatMessage(message('version'), { version: formatNumber(version) }),
  };
}

export type ClientDossierValidationIssue =
  | 'displayNameRequired'
  | 'correctionInvalid'
  | 'correctionUnchanged'
  | 'correctionUnknownField'
  | 'correctionFieldRequired'
  | 'correctionVersionInvalid'
  | 'correctionKeyUsed';

// Only fixed messages from the delivered correction contract become app copy.
// Unrecognized server details never become presentation text.
const correctionValidationIssues: ReadonlyMap<
  string,
  ClientDossierValidationIssue
> = new Map([
  [
    'The Client correction must change at least one field.',
    'correctionUnchanged',
  ],
  ['Unknown Client correction field.', 'correctionUnknownField'],
  ['At least one Client field is required.', 'correctionFieldRequired'],
  [
    'Expected Client version must be an integer between 1 and 2147483646.',
    'correctionVersionInvalid',
  ],
  [
    'Idempotency-Key was already used for another Client correction.',
    'correctionKeyUsed',
  ],
]);

export function clientDossierValidationIssue(
  message: string | undefined,
): ClientDossierValidationIssue | undefined {
  return message === undefined
    ? undefined
    : correctionValidationIssues.get(message);
}
