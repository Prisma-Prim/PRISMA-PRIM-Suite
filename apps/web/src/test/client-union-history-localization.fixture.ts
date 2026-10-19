import type { UnionDetail } from '../client/client-union-contract';
import type { InterfaceLocale } from '../localization/interface-locale';

// Independent public/browser expectations, never imported from the catalog.
export const unionHistoryLocaleCases = [
  {
    code: 'ro',
    title: 'Unirea controlată a Clienților',
    sources: 'Istoricul Clienților înlocuiți',
    details: 'Vezi detaliile autorizate ale unirii',
    heading: 'Istoric atribuibil al unirii',
    originals: 'Dosarele originale păstrate',
    reverse: 'Inversează unirea',
    reason: 'Motivul inversării',
    retry: 'Reîncearcă inversarea',
    pending: 'Se salvează…',
    loading: 'Se încarcă vizualizarea autorizată a unirii…',
    close: 'Închide revizuirea',
    openCanonical: 'Deschide dosarul canonic al Clientului',
    incomplete:
      'Introdu un motiv și confirmă setul complet al Companiilor înregistrate la unire înainte de inversare.',
    uncertain:
      'Nu s-a primit confirmarea acestei inversări. Motivul și acceptarea setului complet de Companii sunt păstrate. Reîncearcă doar dacă intenția rămâne aceeași.',
    stale:
      'Inversarea nu mai este actuală. Încarcă din nou detaliul autorizat al operațiunii înainte de a decide.',
    unavailable:
      'Această operațiune nu este disponibilă. Este posibil ca datele, domeniul Companiilor sau autoritatea să se fi schimbat. Reîncarcă vizualizarea înainte de a continua.',
    error: 'Cererea nu a putut fi finalizată. Poți reîncerca în siguranță.',
    confirmed:
      'Unirea a fost inversată. Dosarele și relațiile originale sunt din nou disponibile.',
    refresh:
      'Comanda a fost confirmată, dar o reîmprospătare ulterioară a eșuat. Reîncarcă lista sau Jurnalul de activitate pentru a vedea datele curente.',
    blocked:
      'Această unire nu poate fi inversată din detaliul autorizat curent. Este posibil ca starea sau condițiile aplicabile să se fi schimbat.',
    noSources:
      'Niciun dosar de Client înlocuit nu este asociat Companiei active.',
    noHistory:
      'Nu există istoric al unirilor pentru acest Client în Compania activă.',
    confirmedAction: 'Persoană autorizată a confirmat unirea Clienților',
    reversedAction: 'Persoană autorizată a inversat unirea Clienților',
    companySet: 'Setul complet al Companiilor înregistrate la unire',
    version: 'Versiunea 1.234',
    absent: 'Nefurnizat',
    localTime: '26 ian. 2026, 19:15',
    source: 'Sursa',
  },
  {
    code: 'ru',
    title: 'Управляемое объединение Клиентов',
    sources: 'История заменённых Клиентов',
    details: 'Посмотреть разрешённые подробности объединения',
    heading: 'История объединения с указанием автора',
    originals: 'Сохранённые исходные досье',
    reverse: 'Отменить объединение',
    reason: 'Причина отмены объединения',
    retry: 'Повторить отмену объединения',
    pending: 'Сохранение…',
    loading: 'Загрузка разрешённого представления объединения…',
    close: 'Закрыть проверку',
    openCanonical: 'Открыть каноническое досье Клиента',
    incomplete:
      'Перед отменой объединения укажите причину и подтвердите полный набор Компаний, зафиксированный при объединении.',
    uncertain:
      'Подтверждение этой отмены объединения не получено. Причина и подтверждение полного набора Компаний сохранены. Повторяйте попытку только при неизменном намерении.',
    stale:
      'Отмена объединения больше не актуальна. Перед решением заново загрузите разрешённые подробности операции.',
    unavailable:
      'Эта операция недоступна. Данные, охват Компаний или полномочия могли измениться. Перед продолжением перезагрузите представление.',
    error: 'Не удалось выполнить запрос. Можно безопасно повторить попытку.',
    confirmed: 'Объединение отменено. Исходные досье и связи снова доступны.',
    refresh:
      'Команда подтверждена, но последующее обновление не удалось. Перезагрузите список или Журнал действий, чтобы увидеть актуальные данные.',
    blocked:
      'Это объединение нельзя отменить из текущих разрешённых подробностей. Его состояние или действующие условия могли измениться.',
    noSources:
      'С активной Компанией не связано ни одного заменённого досье Клиента.',
    noHistory:
      'История объединений этого Клиента в активной Компании отсутствует.',
    confirmedAction: 'Уполномоченное лицо подтвердило объединение Клиентов',
    reversedAction: 'Уполномоченное лицо отменило объединение Клиентов',
    companySet: 'Полный набор Компаний, зафиксированный при объединении',
    version: 'Версия 1 234',
    absent: 'Не указано',
    localTime: '26 янв. 2026 г., 19:15',
    source: 'Источник',
  },
  {
    code: 'fr',
    title: 'Union encadrée de Clients',
    sources: 'Historique des Clients remplacés',
    details: 'Voir les détails autorisés de l’union',
    heading: 'Historique attribuable de l’union',
    originals: 'Dossiers d’origine préservés',
    reverse: 'Annuler l’union',
    reason: 'Motif de l’annulation de l’union',
    retry: 'Réessayer l’annulation de l’union',
    pending: 'Enregistrement…',
    loading: 'Chargement de la vue autorisée de l’union…',
    close: 'Fermer l’examen',
    openCanonical: 'Ouvrir le dossier canonique du Client',
    incomplete:
      'Indiquez un motif et confirmez l’ensemble complet des Entreprises enregistré lors de l’union avant de l’annuler.',
    uncertain:
      'Aucune confirmation n’a été reçue pour cette annulation de l’union. Le motif et la confirmation de l’ensemble complet des Entreprises sont conservés. Réessayez uniquement si cette intention reste inchangée.',
    stale:
      'L’annulation de l’union n’est plus à jour. Rechargez les détails autorisés de l’opération avant de décider.',
    unavailable:
      'Cette opération est indisponible. Les données, le périmètre des Entreprises ou les droits peuvent avoir changé. Rechargez la vue avant de continuer.',
    error:
      'La requête n’a pas pu aboutir. Vous pouvez réessayer en toute sécurité.',
    confirmed:
      'Union annulée. Les dossiers et relations d’origine sont de nouveau disponibles.',
    refresh:
      'La commande a été confirmée, mais une actualisation ultérieure a échoué. Rechargez la liste ou le Journal d’activité pour voir les données à jour.',
    blocked:
      'Cette union ne peut pas être annulée depuis les détails autorisés actuels. Son état ou les conditions applicables peuvent avoir changé.',
    noSources:
      'Aucun dossier de Client remplacé n’est lié à la Entreprise active.',
    noHistory:
      'Aucun historique d’union n’est disponible pour ce Client dans la Entreprise active.',
    confirmedAction: 'Personne habilitée a confirmé une union de Clients',
    reversedAction: 'Personne habilitée a annulé une union de Clients',
    companySet: 'Ensemble complet des Entreprises enregistré lors de l’union',
    version: 'Version 1 234',
    absent: 'Non renseigné',
    localTime: '26 janv. 2026, 19:15',
    source: 'Source',
  },
  {
    code: 'en',
    title: 'Governed Client union',
    sources: 'Superseded Client history',
    details: 'View authorized union details',
    heading: 'Attributable union history',
    originals: 'Preserved original dossiers',
    reverse: 'Reverse union',
    reason: 'Reason for reversal',
    retry: 'Retry reversal',
    pending: 'Saving…',
    loading: 'Loading the authorized union view…',
    close: 'Close review',
    openCanonical: 'Open canonical Client dossier',
    incomplete:
      'Give a reason and confirm the complete captured Company set before reversing.',
    uncertain:
      'No confirmation has been received for this reversal. Your reason and complete Company acknowledgement are retained. Retry only if this intention is unchanged.',
    stale:
      'The reversal is no longer current. Load the authorized operation detail again before deciding.',
    unavailable:
      'This operation is unavailable. Its data, Company scope or authority may have changed. Reload the review before continuing.',
    error: 'The request could not be completed. You can retry safely.',
    confirmed:
      'Union reversed. The original dossiers and relationships are available again.',
    refresh:
      'The command was confirmed, but a subsequent refresh failed. Reload the list or Activity Log to see the latest data.',
    blocked:
      'This union cannot be reversed from the current authorized detail. Its state or governing conditions may have changed.',
    noSources:
      'No superseded Client dossiers are related to the active Company.',
    noHistory:
      'No union history is available for this Client in the active Company.',
    confirmedAction: 'Authorized resolver confirmed a Client union',
    reversedAction: 'Authorized resolver reversed a Client union',
    companySet: 'Complete captured Company set',
    version: 'Version 1,234',
    absent: 'Not provided',
    localTime: 'Jan 26, 2026, 7:15 PM',
    source: 'Source',
  },
] satisfies ReadonlyArray<{ code: InterfaceLocale } & Record<string, string>>;

export type UnionHistoryLocaleCase = (typeof unionHistoryLocaleCases)[number];

export const historyCompanies = [
  { id: 'company-b-712', displayName: 'BIC — Companie / Компания B' },
  { id: 'company-a-712', displayName: 'PRISMA-PRIM — Companie A' },
];
export const historyFirst = {
  id: 'first-client-712',
  version: 1234,
  displayName: 'Dosar egal — Клиент {literal} — Consulting and Certification',
  taxId: '  MD-0712 / ИД  ',
  address: 'Strada Luminii 7\nChișinău — Кишинёв',
  telephone: '+373 (22) 071-200',
  generalEmail: 'literal+712@example.test',
  businessActivity: 'Certificare / консалтинг',
  contacts: [
    {
      name: 'Ana / Анна',
      telephone: '+373 60 071 201',
      email: 'ana+712@example.test',
      position: '  Director / директор  ',
      communicationPreferences: '  Email întâi / сначала email\nDupă 14:00.  ',
    },
    {
      name: 'Ana / Анна',
      telephone: '+373 60 071 202',
      email: 'ana.second+712@example.test',
    },
  ],
};
export const historySecond = {
  ...historyFirst,
  id: 'second-client-712',
  version: 2001,
  address: null,
  contacts: [{ name: 'Boris / Борис', telephone: '+373 60 071 203' }],
};
export const historyProjection = 'projection/712?scope=B';
export const historyOriginalReason =
  '  Motiv original / исходная причина\nA → B.  ';
export const historyReversalReason =
  '  Restabilește / восстановить\nA și B separat.  ';
export const historyDetail = {
  state: 'united',
  projectionReference: historyProjection,
  canonicalClientId: historyFirst.id,
  occurredAt: '2026-01-27T00:15:00.000Z',
  reason: historyOriginalReason,
  actor: { displayName: 'Resolver / Решающий {literal} 712' },
  canReverse: true,
  originals: [historyFirst, historySecond],
  companies: historyCompanies,
  reversal: null,
} satisfies UnionDetail;

export const historySourceList = [
  { id: historySecond.id, displayName: historySecond.displayName },
];
export const historyEvents = {
  events: [
    {
      action: 'client.union_reversed',
      projectionReference: 'redacted-projection-712',
      companyId: historyCompanies[0].id,
      actor: { displayName: 'PRIVATE redacted actor' },
      occurredAt: '2026-01-27T00:15:00.000Z',
      operationId: 'PRIVATE operation id',
      hiddenClient: 'PRIVATE hidden Client',
      hiddenCompany: 'PRIVATE hidden Company',
    },
    {
      action: 'client.union_confirmed',
      projectionReference: historyProjection,
      companyId: historyCompanies[0].id,
    },
  ],
  detailReferences: [historyProjection, 'not-returned-in-events-712'],
};
