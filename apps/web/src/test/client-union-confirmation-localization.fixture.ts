import type { ActorContext } from '../access-types';
import type { UnionComparison } from '../client/client-union-contract';
import type { InterfaceLocale } from '../localization/interface-locale';

export const confirmationCompanies = [
  { id: 'company-a-716', displayName: 'PRISMA-PRIM — Companie A' },
  {
    id: 'company-b-716',
    displayName: 'BIC — Business Inspection / Компания B',
  },
] as const;
export const confirmationFirst = {
  id: 'client-first-716',
  version: 1234,
  displayName: 'First saved Client — Cercetare / Исследования / Certification',
  taxId: '  UNION-716 / ИД  ',
  address: null,
  telephone: '+373 (22) 071-600',
  generalEmail: null,
  businessActivity: 'Consultanță / консалтинг',
  contacts: [
    {
      name: 'Ana / Анна',
      telephone: '+373 (60) 071-601',
      email: 'ana+first@example.test',
      position: '  Director / директор  ',
      decisionRoles: [
        'final_decision_maker',
        'influencer',
        'user',
        'financial',
        'technical',
        'blocker',
      ],
      communicationPreferences: '  Email întâi / сначала email\nDupă 14:00.  ',
    },
  ],
} satisfies UnionComparison['clients'][number];
export const confirmationSecond = {
  ...confirmationFirst,
  id: 'client-second-716',
  version: 2345,
  displayName: 'Second saved Client — Consulting and Certification Services',
  address: '14 Example Avenue, Building B, Chișinău — Кишинёв',
  generalEmail: 'literal+second@example.test',
  businessActivity:
    'Research / Cercetare / Исследования — long saved business activity',
  contacts: [
    { name: 'Ana / Анна', email: 'ana+second@example.test' },
    { name: 'Boris / Борис', telephone: '+373 (60) 071-603' },
  ],
} satisfies UnionComparison['clients'][number];
export const confirmationCanonical = {
  ...confirmationSecond,
  version: confirmationSecond.version + 1,
  displayName: confirmationFirst.displayName,
  address: null,
  generalEmail: null,
  contacts: [...confirmationFirst.contacts, ...confirmationSecond.contacts],
};
export function confirmationDossier({
  clientId,
  united,
}: {
  clientId: string;
  united: boolean;
}) {
  const source = [confirmationFirst, confirmationSecond].find(
    ({ id }) => id === clientId,
  );
  return source && united && source.id === confirmationSecond.id
    ? confirmationCanonical
    : source;
}
export const confirmationReference = 'review-716';
export const confirmationPair = {
  outcome: 'comparison',
  reviewReference: confirmationReference,
  clients: [confirmationFirst, confirmationSecond],
  companies: [...confirmationCompanies],
} satisfies UnionComparison;
export const confirmationReason =
  '  Verified original IDNO — păstrăm Алекс / données exactes.  ';
export const confirmationActor: ActorContext = {
  internalUserId: 'resolver-716',
  workspaceMembershipId: 'membership-716',
  workspaceId: 'workspace-716',
  workspaceName: 'Workspace',
  displayName: 'Resolver',
  email: 'resolver@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    ...confirmationCompanies[0],
    clientPermissions: [
      'client.read',
      'client.create',
      'client.update',
      'client.duplicate.resolve',
    ],
    clientPermissionAssignmentId: 'assignment-716',
    clientPermissionSetVersion: 'v2',
  },
};

// Independent public/browser expectations. No production message catalog imports.
export const confirmationLocaleCases = {
  ro: {
    code: 'ro',
    legalTitle: 'Entități juridice și sucursale',
    legalEmpty:
      'Nu sunt înregistrate entități juridice sau sucursale suplimentare. Identitatea din dosarul de mai sus este organizația principală.',
    compare: 'Compară cei doi Clienți existenți',
    confirm: 'Confirmă unirea',
    canonical: 'Dosarul canonic al Clientului',
    reason: 'Motivul acestei uniri',
    choose: 'Alege o sursă',
    retained: 'Valoarea de păstrat din Sursa 1',
    incomplete:
      'Alege un Client canonic și o sursă pentru fiecare câmp, introdu un motiv și confirmă ambele declarații.',
    capacity:
      'Dosarul combinat depășește 50 de Contacte. Această unire nu poate fi confirmată.',
    uncertain:
      'Nu s-a primit nicio confirmare. Alegerile și motivul sunt păstrate.',
    saved:
      'Unirea a fost confirmată. Dosarul canonic este acum disponibil în Companiile implicate.',
    pending: 'Se salvează…',
    error: 'Cererea nu a putut fi finalizată. Poți reîncerca în siguranță.',
    source: 'Sursa',
    absent: 'Nefurnizat',
    version: 'Versiunea 1.234',
    contactSource: 'Sursa 2 · Contact 2',
    count: 'Contacte din ambele surse: 3. Maximum: 50.',
    fields: [
      'Numele afișat al Clientului',
      'IDNO / cod fiscal',
      'Adresă',
      'Telefon',
      'Email general',
      'Activitate economică',
    ],
    contacts: [
      'Telefonul Contactului',
      'Emailul Contactului',
      'Funcția Contactului',
      'Roluri în luarea deciziilor',
      'Preferințele de comunicare ale Contactului',
    ],
    roles:
      'Decident final, Persoană de influență, Utilizator, Financiar, Tehnic, Opozant',
    companies: 'Setul complet al Companiilor implicate',
    title: 'Unirea controlată a Clienților',
    review: 'Revizuiește duplicatele existente',
    close: 'Închide revizuirea',
    unavailable:
      'Această operațiune nu este disponibilă. Este posibil ca datele, domeniul Companiilor sau autoritatea să se fi schimbat. Reîncarcă vizualizarea înainte de a continua.',
    refresh:
      'Comanda a fost confirmată, dar o reîmprospătare ulterioară a eșuat. Reîncarcă lista sau Jurnalul de activitate pentru a vedea datele curente.',
    openDossier: 'Deschide dosarul',
    openMenu: 'Deschideți navigarea',
    navigation: 'Navigare principală',
    clients: 'Clienți',
    activity: 'Jurnal de activitate',
    optIn: 'Încercați Prisme',
  },
  ru: {
    code: 'ru',
    legalTitle: 'Юридические лица и филиалы',
    legalEmpty:
      'Дополнительные юридические лица или филиалы не зарегистрированы. Данные досье выше относятся к основной организации.',
    compare: 'Сравнить двух существующих Клиентов',
    confirm: 'Подтвердить объединение',
    canonical: 'Каноническое досье Клиента',
    reason: 'Причина этого объединения',
    choose: 'Выберите источник',
    retained: 'Сохраняемое значение из Источника 1',
    incomplete:
      'Выберите канонического Клиента и источник каждого поля, укажите причину и подтвердите оба заявления.',
    capacity:
      'В объединённом досье более 50 Контактов. Это объединение нельзя подтвердить.',
    uncertain: 'Подтверждение не получено. Ваш выбор и причина сохранены.',
    saved:
      'Объединение подтверждено. Каноническое досье теперь доступно в затронутых Компаниях.',
    pending: 'Сохранение…',
    error: 'Не удалось выполнить запрос. Можно безопасно повторить попытку.',
    source: 'Источник',
    absent: 'Не указано',
    version: 'Версия 1 234',
    contactSource: 'Источник 2 · Контакт 2',
    count: 'Контакты из обоих источников: 3. Максимум: 50.',
    fields: [
      'Отображаемое название Клиента',
      'IDNO / налоговый код',
      'Адрес',
      'Телефон',
      'Общий email',
      'Хозяйственная деятельность',
    ],
    contacts: [
      'Телефон Контакта',
      'Email Контакта',
      'Должность Контакта',
      'Роли в принятии решений',
      'Предпочтения Контакта по общению',
    ],
    roles:
      'Окончательный ЛПР, Влиятельное лицо, Пользователь, Финансовая роль, Техническая роль, Противник',
    companies: 'Полный набор затронутых Компаний',
    title: 'Управляемое объединение Клиентов',
    review: 'Проверить существующие дубликаты',
    close: 'Закрыть проверку',
    unavailable:
      'Эта операция недоступна. Данные, охват Компаний или полномочия могли измениться. Перед продолжением перезагрузите представление.',
    refresh:
      'Команда подтверждена, но последующее обновление не удалось. Перезагрузите список или Журнал действий, чтобы увидеть актуальные данные.',
    openDossier: 'Открыть досье',
    openMenu: 'Открыть навигацию',
    navigation: 'Основная навигация',
    clients: 'Клиенты',
    activity: 'Журнал активности',
    optIn: 'Попробовать Prisme',
  },
  fr: {
    code: 'fr',
    legalTitle: 'Entités juridiques et succursales',
    legalEmpty:
      'Aucune entité juridique ou succursale supplémentaire enregistrée. L’identité du dossier ci-dessus est l’organisation principale.',
    compare: 'Comparer les deux Clients existants',
    confirm: 'Confirmer l’union',
    canonical: 'Dossier canonique du Client',
    reason: 'Motif de cette union',
    choose: 'Choisissez une source',
    retained: 'Valeur à conserver de la Source 1',
    incomplete:
      'Choisissez un Client canonique et une source pour chaque champ, indiquez un motif et confirmez les deux déclarations.',
    capacity:
      'Le dossier combiné dépasse 50 Contacts. Cette union ne peut pas être confirmée.',
    uncertain:
      'Aucune confirmation n’a été reçue. Vos choix et votre motif sont conservés.',
    saved:
      'Union confirmée. Le dossier canonique est maintenant disponible dans les Entreprises concernées.',
    pending: 'Enregistrement…',
    error:
      'La requête n’a pas pu aboutir. Vous pouvez réessayer en toute sécurité.',
    source: 'Source',
    absent: 'Non renseigné',
    version: 'Version 1\u202f234',
    contactSource: 'Source 2 · Contact 2',
    count: 'Contacts des deux sources : 3. Maximum : 50.',
    fields: [
      'Nom affiché du Client',
      'IDNO / code fiscal',
      'Adresse',
      'Téléphone',
      'Email général',
      'Activité économique',
    ],
    contacts: [
      'Téléphone du Contact',
      'Email du Contact',
      'Fonction du Contact',
      'Rôles dans la décision',
      'Préférences de communication du Contact',
    ],
    roles:
      'Décideur final, Personne influente, Utilisateur, Financier, Technique, Opposant',
    companies: 'Ensemble complet des Entreprises concernées',
    title: 'Union encadrée de Clients',
    review: 'Examiner les doublons existants',
    close: 'Fermer l’examen',
    unavailable:
      'Cette opération est indisponible. Les données, le périmètre des Entreprises ou les droits peuvent avoir changé. Rechargez la vue avant de continuer.',
    refresh:
      'La commande a été confirmée, mais une actualisation ultérieure a échoué. Rechargez la liste ou le Journal d’activité pour voir les données à jour.',
    openDossier: 'Ouvrir le dossier',
    openMenu: 'Ouvrir la navigation',
    navigation: 'Navigation principale',
    clients: 'Clients',
    activity: 'Journal d’activité',
    optIn: 'Essayer Prisme',
  },
  en: {
    code: 'en',
    legalTitle: 'Legal entities and branches',
    legalEmpty:
      'No additional legal entities or branches recorded. The dossier identity above is the main organization.',
    compare: 'Compare the two existing Clients',
    confirm: 'Confirm union',
    canonical: 'Canonical Client dossier',
    reason: 'Reason for this union',
    choose: 'Choose a source',
    retained: 'Value to retain from Source 1',
    incomplete:
      'Choose a canonical Client and a source for every field, give a reason and confirm both acknowledgements.',
    capacity:
      'The combined dossier exceeds 50 Contacts. This union cannot be confirmed.',
    uncertain:
      'No confirmation has been received. Your choices and reason are retained.',
    saved:
      'Union confirmed. The canonical dossier is now available in the affected Companies.',
    pending: 'Saving…',
    error: 'The request could not be completed. You can retry safely.',
    source: 'Source',
    absent: 'Not provided',
    version: 'Version 1,234',
    contactSource: 'Source 2 · Contact 2',
    count: 'Contact entries from both sources: 3. Maximum: 50.',
    fields: [
      'Client display name',
      'IDNO / tax code',
      'Address',
      'Telephone',
      'General email',
      'Business activity',
    ],
    contacts: [
      'Contact telephone',
      'Contact email',
      'Contact position',
      'Decision roles',
      'Contact communication preferences',
    ],
    roles:
      'Final decision-maker, Influencer, User, Financial, Technical, Blocker',
    companies: 'Complete affected Company set',
    title: 'Governed Client union',
    review: 'Review existing duplicates',
    close: 'Close review',
    unavailable:
      'This operation is unavailable. Its data, Company scope or authority may have changed. Reload the review before continuing.',
    refresh:
      'The command was confirmed, but a subsequent refresh failed. Reload the list or Activity Log to see the latest data.',
    openDossier: 'Open dossier',
    openMenu: 'Open navigation',
    navigation: 'Primary navigation',
    clients: 'Clients',
    activity: 'Activity Log',
    optIn: 'Try Prisme',
  },
} as const satisfies Record<
  InterfaceLocale,
  { code: InterfaceLocale } & Record<string, unknown>
>;
export type ConfirmationLocaleCase =
  (typeof confirmationLocaleCases)[InterfaceLocale];
