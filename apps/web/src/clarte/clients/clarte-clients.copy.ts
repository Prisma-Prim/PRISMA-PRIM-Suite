import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../../localization/messages';

const keys = [
  'searchPlaceholder',
  'noFilterMatch',
  'retry',
  'backToClients',
  'dossierSections',
  'viewOverview',
  'viewDeals',
  'viewMissions',
  'viewDocuments',
  'viewHistory',
  'noLegalEntity',
  'oneLegalEntity',
  'legalEntityCount',
  'editContacts',
  'contactsIntro',
  'dealsIntro',
  'missionsIntro',
  'documentsIntro',
  'historyIntro',
  'possibleDuplicatesIntro',
] as const;

export const clarteClientMessages = defineMessages(keys, {
  ro: {
    searchPlaceholder: 'Căutați un Client după nume',
    noFilterMatch: 'Niciun Client din {company} nu corespunde cu „{query}”.',
    retry: 'Încercați din nou',
    backToClients: 'Înapoi la Clienți',
    dossierSections: 'Secțiunile dosarului Clientului',
    viewOverview: 'Prezentare',
    viewDeals: 'Afaceri',
    viewMissions: 'Misiuni',
    viewDocuments: 'Documente',
    viewHistory: 'Istoric',
    noLegalEntity: 'Nicio entitate juridică suplimentară',
    oneLegalEntity: '1 entitate juridică sau filială',
    legalEntityCount: 'Entități juridice sau filiale: {count}',
    editContacts: 'Modificați Contactele',
    contactsIntro:
      'Persoanele Clientului, cu rolul lor în decizie și preferințele lor de comunicare.',
    dealsIntro:
      'Cererile și oportunitățile acestui Client. Deschideți Cererile lui pentru a vedea doar Cererile acestui Client în Afaceri; restricția se poate ridica acolo.',
    missionsIntro: 'Proiectele acestui Client și Sarcinile lor.',
    documentsIntro: 'Documentele de lucru ale acestui Client.',
    historyIntro:
      'Fiecare corectare păstrează valoarea anterioară. O unire a două dosare se compară înainte de confirmare și poate fi anulată.',
    possibleDuplicatesIntro:
      'Verificați dosarele care ar putea descrie același Client înainte de a crea unul nou.',
  },
  ru: {
    searchPlaceholder: 'Найти Клиента по названию',
    noFilterMatch: 'Ни один Клиент в {company} не соответствует «{query}».',
    retry: 'Повторить',
    backToClients: 'Назад к Клиентам',
    dossierSections: 'Разделы досье Клиента',
    viewOverview: 'Обзор',
    viewDeals: 'Сделки',
    viewMissions: 'Миссии',
    viewDocuments: 'Документы',
    viewHistory: 'История',
    noLegalEntity: 'Дополнительных юридических лиц нет',
    oneLegalEntity: '1 юридическое лицо или филиал',
    legalEntityCount: 'Юридических лиц или филиалов: {count}',
    editContacts: 'Изменить Контакты',
    contactsIntro:
      'Люди Клиента, их роль в принятии решения и предпочтения по связи.',
    dealsIntro:
      'Запросы и возможности этого Клиента. Откройте его Запросы, чтобы видеть в Сделках только их; там же ограничение можно снять.',
    missionsIntro: 'Проекты этого Клиента и их Задачи.',
    documentsIntro: 'Рабочие Документы этого Клиента.',
    historyIntro:
      'Каждое исправление сохраняет прежнее значение. Объединение двух досье сравнивается перед подтверждением и может быть отменено.',
    possibleDuplicatesIntro:
      'Проверьте досье, которые могут описывать одного и того же Клиента, прежде чем создавать новое.',
  },
  fr: {
    searchPlaceholder: 'Chercher un Client par son nom',
    noFilterMatch: 'Aucun Client de {company} ne correspond à « {query} ».',
    retry: 'Réessayer',
    backToClients: 'Retour aux Clients',
    dossierSections: 'Rubriques du dossier du Client',
    viewOverview: 'Vue d’ensemble',
    viewDeals: 'Affaires',
    viewMissions: 'Missions',
    viewDocuments: 'Documents',
    viewHistory: 'Historique',
    noLegalEntity: 'Aucune entité juridique supplémentaire',
    oneLegalEntity: '1 entité juridique ou succursale',
    legalEntityCount: '{count} entités juridiques ou succursales',
    editContacts: 'Modifier les Contacts',
    contactsIntro:
      'Les personnes du Client, avec leur rôle dans la décision et leurs préférences de communication.',
    dealsIntro:
      'Les Demandes et opportunités de ce Client. Ouvrez ses Demandes pour ne voir qu’elles dans Affaires ; la restriction se lève depuis cette liste.',
    missionsIntro: 'Les Projets de ce Client et leurs Tâches.',
    documentsIntro: 'Les Documents de travail de ce Client.',
    historyIntro:
      'Chaque correction garde l’ancienne valeur. Une union de deux dossiers se compare avant d’être confirmée et peut être annulée.',
    possibleDuplicatesIntro:
      'Vérifiez les dossiers qui pourraient décrire le même Client avant d’en créer un nouveau.',
  },
  en: {
    searchPlaceholder: 'Search for a Client by name',
    noFilterMatch: 'No Client of {company} matches “{query}”.',
    retry: 'Try again',
    backToClients: 'Back to Clients',
    dossierSections: 'Client dossier sections',
    viewOverview: 'Overview',
    viewDeals: 'Deals',
    viewMissions: 'Missions',
    viewDocuments: 'Documents',
    viewHistory: 'History',
    noLegalEntity: 'No additional legal entity',
    oneLegalEntity: '1 legal entity or branch',
    legalEntityCount: '{count} legal entities or branches',
    editContacts: 'Edit Contacts',
    contactsIntro:
      'The Client’s people, with their decision roles and communication preferences.',
    dealsIntro:
      'This Client’s Requests and opportunities. Open its Requests to see only them in Deals; the restriction can be lifted there.',
    missionsIntro: 'This Client’s Projects and their Tasks.',
    documentsIntro: 'This Client’s working Documents.',
    historyIntro:
      'Every correction keeps the earlier value. A union of two dossiers is compared before it is confirmed and can be reversed.',
    possibleDuplicatesIntro:
      'Check the dossiers that may describe the same Client before creating a new one.',
  },
});

export function useClarteClientCopy() {
  const message = useMessages(clarteClientMessages);
  return {
    message,
    legalEntities: (count: number) =>
      count === 0
        ? message('noLegalEntity')
        : count === 1
          ? message('oneLegalEntity')
          : formatMessage(message('legalEntityCount'), { count }),
  };
}
