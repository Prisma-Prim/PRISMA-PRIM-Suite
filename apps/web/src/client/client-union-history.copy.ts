import { useInterfaceLocale } from '../localization/interface-locale';
import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../localization/messages';

const keys = [
  'title',
  'review',
  'history',
  'sources',
  'noSources',
  'openCanonical',
  'source',
  'contactSource',
  'noContacts',
  'refreshError',
  'reverseReason',
  'confirmedCompanies',
  'reverse',
  'close',
  'loading',
  'saving',
  'unavailable',
  'error',
  'reversed',
  'unitedState',
  'reversedState',
  'state',
  'canonicalSource',
  'capturedCompanies',
  'reversalUncertain',
  'reversalStale',
  'reverseIncomplete',
  'retryReversal',
  'viewDetails',
  'noHistory',
  'resolver',
  'confirmedAction',
  'reversedAction',
  'restrictedTitle',
  'originals',
  'reversalBlocked',
] as const;

export const clientUnionHistoryMessages = defineMessages(keys, {
  ro: {
    title: 'Unirea controlată a Clienților',
    review: 'Revizuiește duplicatele existente',
    history: 'Istoricul unirilor',
    sources: 'Istoricul Clienților înlocuiți',
    noSources:
      'Niciun dosar de Client înlocuit nu este asociat Companiei active.',
    openCanonical: 'Deschide dosarul canonic al Clientului',
    source: 'Sursa {number} · {name}',
    contactSource: 'Sursa {source} · Contact {contact}',
    noContacts: 'Nu sunt furnizate Contacte.',
    refreshError:
      'Comanda a fost confirmată, dar o reîmprospătare ulterioară a eșuat. Reîncarcă lista sau Jurnalul de activitate pentru a vedea datele curente.',
    reverseReason: 'Motivul inversării',
    confirmedCompanies: 'Confirm setul complet al Companiilor implicate:',
    reverse: 'Inversează unirea',
    close: 'Închide revizuirea',
    loading: 'Se încarcă vizualizarea autorizată a unirii…',
    saving: 'Se salvează…',
    unavailable:
      'Această operațiune nu este disponibilă. Este posibil ca datele, domeniul Companiilor sau autoritatea să se fi schimbat. Reîncarcă vizualizarea înainte de a continua.',
    error: 'Cererea nu a putut fi finalizată. Poți reîncerca în siguranță.',
    reversed:
      'Unirea a fost inversată. Dosarele și relațiile originale sunt din nou disponibile.',
    unitedState: 'Unită',
    reversedState: 'Inversată',
    state: 'Starea operațiunii',
    canonicalSource: 'Client canonic',
    capturedCompanies: 'Setul complet al Companiilor înregistrate la unire',
    reversalUncertain:
      'Nu s-a primit confirmarea acestei inversări. Motivul și acceptarea setului complet de Companii sunt păstrate. Reîncearcă doar dacă intenția rămâne aceeași.',
    reversalStale:
      'Inversarea nu mai este actuală. Încarcă din nou detaliul autorizat al operațiunii înainte de a decide.',
    reverseIncomplete:
      'Introdu un motiv și confirmă setul complet al Companiilor înregistrate la unire înainte de inversare.',
    retryReversal: 'Reîncearcă inversarea',
    viewDetails: 'Vezi detaliile autorizate ale unirii',
    noHistory:
      'Nu există istoric al unirilor pentru acest Client în Compania activă.',
    resolver: 'Persoană autorizată',
    confirmedAction: 'a confirmat unirea Clienților',
    reversedAction: 'a inversat unirea Clienților',
    restrictedTitle: 'Istoric atribuibil al unirii',
    originals: 'Dosarele originale păstrate',
    reversalBlocked:
      'Această unire nu poate fi inversată din detaliul autorizat curent. Este posibil ca starea sau condițiile aplicabile să se fi schimbat.',
  },
  ru: {
    title: 'Управляемое объединение Клиентов',
    review: 'Проверить существующие дубликаты',
    history: 'История объединений',
    sources: 'История заменённых Клиентов',
    noSources:
      'С активной Компанией не связано ни одного заменённого досье Клиента.',
    openCanonical: 'Открыть каноническое досье Клиента',
    source: 'Источник {number} · {name}',
    contactSource: 'Источник {source} · Контакт {contact}',
    noContacts: 'Контакты не предоставлены.',
    refreshError:
      'Команда подтверждена, но последующее обновление не удалось. Перезагрузите список или Журнал действий, чтобы увидеть актуальные данные.',
    reverseReason: 'Причина отмены объединения',
    confirmedCompanies: 'Подтверждаю полный набор затронутых Компаний:',
    reverse: 'Отменить объединение',
    close: 'Закрыть проверку',
    loading: 'Загрузка разрешённого представления объединения…',
    saving: 'Сохранение…',
    unavailable:
      'Эта операция недоступна. Данные, охват Компаний или полномочия могли измениться. Перед продолжением перезагрузите представление.',
    error: 'Не удалось выполнить запрос. Можно безопасно повторить попытку.',
    reversed: 'Объединение отменено. Исходные досье и связи снова доступны.',
    unitedState: 'Объединено',
    reversedState: 'Отменено',
    state: 'Состояние операции',
    canonicalSource: 'Канонический Клиент',
    capturedCompanies: 'Полный набор Компаний, зафиксированный при объединении',
    reversalUncertain:
      'Подтверждение этой отмены объединения не получено. Причина и подтверждение полного набора Компаний сохранены. Повторяйте попытку только при неизменном намерении.',
    reversalStale:
      'Отмена объединения больше не актуальна. Перед решением заново загрузите разрешённые подробности операции.',
    reverseIncomplete:
      'Перед отменой объединения укажите причину и подтвердите полный набор Компаний, зафиксированный при объединении.',
    retryReversal: 'Повторить отмену объединения',
    viewDetails: 'Посмотреть разрешённые подробности объединения',
    noHistory:
      'История объединений этого Клиента в активной Компании отсутствует.',
    resolver: 'Уполномоченное лицо',
    confirmedAction: 'подтвердило объединение Клиентов',
    reversedAction: 'отменило объединение Клиентов',
    restrictedTitle: 'История объединения с указанием автора',
    originals: 'Сохранённые исходные досье',
    reversalBlocked:
      'Это объединение нельзя отменить из текущих разрешённых подробностей. Его состояние или действующие условия могли измениться.',
  },
  fr: {
    title: 'Union encadrée de Clients',
    review: 'Examiner les doublons existants',
    history: 'Historique des unions',
    sources: 'Historique des Clients remplacés',
    noSources:
      'Aucun dossier de Client remplacé n’est lié à la Entreprise active.',
    openCanonical: 'Ouvrir le dossier canonique du Client',
    source: 'Source {number} · {name}',
    contactSource: 'Source {source} · Contact {contact}',
    noContacts: 'Aucun Contact fourni.',
    refreshError:
      'La commande a été confirmée, mais une actualisation ultérieure a échoué. Rechargez la liste ou le Journal d’activité pour voir les données à jour.',
    reverseReason: 'Motif de l’annulation de l’union',
    confirmedCompanies:
      'Je confirme l’ensemble complet des Entreprises concernées :',
    reverse: 'Annuler l’union',
    close: 'Fermer l’examen',
    loading: 'Chargement de la vue autorisée de l’union…',
    saving: 'Enregistrement…',
    unavailable:
      'Cette opération est indisponible. Les données, le périmètre des Entreprises ou les droits peuvent avoir changé. Rechargez la vue avant de continuer.',
    error:
      'La requête n’a pas pu aboutir. Vous pouvez réessayer en toute sécurité.',
    reversed:
      'Union annulée. Les dossiers et relations d’origine sont de nouveau disponibles.',
    unitedState: 'Unie',
    reversedState: 'Annulée',
    state: 'État de l’opération',
    canonicalSource: 'Client canonique',
    capturedCompanies:
      'Ensemble complet des Entreprises enregistré lors de l’union',
    reversalUncertain:
      'Aucune confirmation n’a été reçue pour cette annulation de l’union. Le motif et la confirmation de l’ensemble complet des Entreprises sont conservés. Réessayez uniquement si cette intention reste inchangée.',
    reversalStale:
      'L’annulation de l’union n’est plus à jour. Rechargez les détails autorisés de l’opération avant de décider.',
    reverseIncomplete:
      'Indiquez un motif et confirmez l’ensemble complet des Entreprises enregistré lors de l’union avant de l’annuler.',
    retryReversal: 'Réessayer l’annulation de l’union',
    viewDetails: 'Voir les détails autorisés de l’union',
    noHistory:
      'Aucun historique d’union n’est disponible pour ce Client dans la Entreprise active.',
    resolver: 'Personne habilitée',
    confirmedAction: 'a confirmé une union de Clients',
    reversedAction: 'a annulé une union de Clients',
    restrictedTitle: 'Historique attribuable de l’union',
    originals: 'Dossiers d’origine préservés',
    reversalBlocked:
      'Cette union ne peut pas être annulée depuis les détails autorisés actuels. Son état ou les conditions applicables peuvent avoir changé.',
  },
  en: {
    title: 'Governed Client union',
    review: 'Review existing duplicates',
    history: 'Union history',
    sources: 'Superseded Client history',
    noSources:
      'No superseded Client dossiers are related to the active Company.',
    openCanonical: 'Open canonical Client dossier',
    source: 'Source {number} · {name}',
    contactSource: 'Source {source} · Contact {contact}',
    noContacts: 'No Contacts provided.',
    refreshError:
      'The command was confirmed, but a subsequent refresh failed. Reload the list or Activity Log to see the latest data.',
    reverseReason: 'Reason for reversal',
    confirmedCompanies: 'I confirm the complete affected Company set:',
    reverse: 'Reverse union',
    close: 'Close review',
    loading: 'Loading the authorized union view…',
    saving: 'Saving…',
    unavailable:
      'This operation is unavailable. Its data, Company scope or authority may have changed. Reload the review before continuing.',
    error: 'The request could not be completed. You can retry safely.',
    reversed:
      'Union reversed. The original dossiers and relationships are available again.',
    unitedState: 'United',
    reversedState: 'Reversed',
    state: 'Operation state',
    canonicalSource: 'Canonical Client',
    capturedCompanies: 'Complete captured Company set',
    reversalUncertain:
      'No confirmation has been received for this reversal. Your reason and complete Company acknowledgement are retained. Retry only if this intention is unchanged.',
    reversalStale:
      'The reversal is no longer current. Load the authorized operation detail again before deciding.',
    reverseIncomplete:
      'Give a reason and confirm the complete captured Company set before reversing.',
    retryReversal: 'Retry reversal',
    viewDetails: 'View authorized union details',
    noHistory:
      'No union history is available for this Client in the active Company.',
    resolver: 'Authorized resolver',
    confirmedAction: 'confirmed a Client union',
    reversedAction: 'reversed a Client union',
    restrictedTitle: 'Attributable union history',
    originals: 'Preserved original dossiers',
    reversalBlocked:
      'This union cannot be reversed from the current authorized detail. Its state or governing conditions may have changed.',
  },
});

export function useClientUnionHistoryCopy() {
  const message = useMessages(clientUnionHistoryMessages);
  const { formatNumber } = useInterfaceLocale();
  return {
    title: message('title'),
    review: message('review'),
    history: message('history'),
    sources: message('sources'),
    noSources: message('noSources'),
    openCanonical: message('openCanonical'),
    source: ({ number, name }: { number: number; name: string }) =>
      formatMessage(message('source'), { number: formatNumber(number), name }),
    contactSource: ({ source, contact }: { source: number; contact: number }) =>
      formatMessage(message('contactSource'), {
        source: formatNumber(source),
        contact: formatNumber(contact),
      }),
    noContacts: message('noContacts'),
    refreshError: message('refreshError'),
    reverseReason: message('reverseReason'),
    confirmedCompanies: message('confirmedCompanies'),
    reverse: message('reverse'),
    close: message('close'),
    loading: message('loading'),
    saving: message('saving'),
    unavailable: message('unavailable'),
    error: message('error'),
    reversed: message('reversed'),
    unitedState: message('unitedState'),
    reversedState: message('reversedState'),
    state: message('state'),
    canonicalSource: message('canonicalSource'),
    capturedCompanies: message('capturedCompanies'),
    reversalUncertain: message('reversalUncertain'),
    reversalStale: message('reversalStale'),
    reverseIncomplete: message('reverseIncomplete'),
    retryReversal: message('retryReversal'),
    viewDetails: message('viewDetails'),
    noHistory: message('noHistory'),
    resolver: message('resolver'),
    restrictedTitle: message('restrictedTitle'),
    originals: message('originals'),
    reversalBlocked: message('reversalBlocked'),
    actionLabels: {
      'client.union_confirmed': message('confirmedAction'),
      'client.union_reversed': message('reversedAction'),
    },
  };
}
