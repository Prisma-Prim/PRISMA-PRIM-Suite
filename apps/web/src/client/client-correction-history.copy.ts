import { clientWorkspaceCopy } from './client-workspace.copy';
import { useClientDossierCopy } from './client-dossier.copy';
import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../localization/messages';

const keys = [
  'title',
  'show',
  'hide',
  'loading',
  'empty',
  'error',
  'retry',
  'unavailable',
  'list',
  'correctedBy',
  'changedTo',
  'before',
  'after',
  'showOlder',
  'loadingOlder',
  'olderError',
] as const;

export const clientCorrectionHistoryMessages = defineMessages(keys, {
  ro: {
    title: 'Istoricul corectărilor',
    show: 'Arată istoricul corectărilor',
    hide: 'Ascunde istoricul corectărilor',
    loading: 'Se încarcă istoricul corectărilor…',
    empty:
      'Nu au fost înregistrate corectări pentru acest Client în această Companie.',
    error:
      'Nu am putut încărca istoricul corectărilor. Dosarul rămâne disponibil.',
    retry: 'Reîncearcă încărcarea istoricului corectărilor',
    unavailable:
      'Istoricul corectărilor nu este disponibil cu accesul tău actual.',
    list: 'Corectări, cele mai noi primele',
    correctedBy: 'Corectat de {actor}',
    changedTo: 'schimbat în',
    before: 'Înainte',
    after: 'După',
    showOlder: 'Arată corectări mai vechi',
    loadingOlder: 'Se încarcă corectările mai vechi…',
    olderError:
      'Corectările mai vechi nu au putut fi încărcate. Încearcă din nou.',
  },
  ru: {
    title: 'История исправлений',
    show: 'Показать историю исправлений',
    hide: 'Скрыть историю исправлений',
    loading: 'Загрузка истории исправлений…',
    empty: 'Для этого Клиента в этой Компании исправления не зарегистрированы.',
    error:
      'Не удалось загрузить историю исправлений. Досье остаётся доступным.',
    retry: 'Повторить загрузку истории исправлений',
    unavailable: 'История исправлений недоступна при ваших текущих правах.',
    list: 'Исправления, сначала новые',
    correctedBy: 'Исправил: {actor}',
    changedTo: 'изменено на',
    before: 'До',
    after: 'После',
    showOlder: 'Показать предыдущие исправления',
    loadingOlder: 'Загрузка предыдущих исправлений…',
    olderError:
      'Не удалось загрузить предыдущие исправления. Повторите попытку.',
  },
  fr: {
    title: 'Historique des corrections',
    show: 'Afficher l’historique des corrections',
    hide: 'Masquer l’historique des corrections',
    loading: 'Chargement de l’historique des corrections…',
    empty:
      'Aucune correction n’a été enregistrée pour ce Client dans cette Entreprise.',
    error:
      'Impossible de charger l’historique des corrections. Le dossier reste disponible.',
    retry: 'Réessayer de charger l’historique des corrections',
    unavailable:
      'L’historique des corrections n’est pas disponible avec vos droits actuels.',
    list: 'Corrections, les plus récentes d’abord',
    correctedBy: 'Corrigé par {actor}',
    changedTo: 'modifié en',
    before: 'Avant',
    after: 'Après',
    showOlder: 'Afficher les corrections plus anciennes',
    loadingOlder: 'Chargement des corrections plus anciennes…',
    olderError:
      'Les corrections plus anciennes n’ont pas pu être chargées. Réessayez.',
  },
  en: {
    title: 'Correction history',
    show: 'Show correction history',
    hide: 'Hide correction history',
    loading: 'Loading correction history…',
    empty: 'No corrections have been recorded for this Client in this Company.',
    error:
      'We could not load the correction history. The dossier remains available.',
    retry: 'Retry correction history',
    unavailable:
      'Correction history is not available with your current access.',
    list: 'Corrections, newest first',
    correctedBy: 'Corrected by {actor}',
    changedTo: 'changed to',
    before: 'Before',
    after: 'After',
    showOlder: 'Show older corrections',
    loadingOlder: 'Loading older corrections…',
    olderError: 'Older corrections could not be loaded. Try again.',
  },
});

export function useClientCorrectionHistoryCopy() {
  const message = useMessages(clientCorrectionHistoryMessages);
  const dossier = useClientDossierCopy();
  return {
    title: message('title'),
    show: message('show'),
    hide: message('hide'),
    loading: message('loading'),
    empty: message('empty'),
    error: message('error'),
    retry: message('retry'),
    unavailable: message('unavailable'),
    list: message('list'),
    correctedBy: (displayName: string) =>
      formatMessage(message('correctedBy'), { actor: displayName }),
    changedTo: message('changedTo'),
    before: message('before'),
    after: message('after'),
    showOlder: message('showOlder'),
    loadingOlder: message('loadingOlder'),
    olderError: message('olderError'),
    notProvided: dossier.notProvided,
    noContacts: dossier.noContacts,
    fieldLabels: {
      displayName: dossier.displayNameLabel,
      taxId: dossier.taxIdLabel,
      address: dossier.addressLabel,
      telephone: dossier.telephoneLabel,
      generalEmail: dossier.generalEmailLabel,
      businessActivity: dossier.businessActivityLabel,
      contacts: dossier.contactsLabel,
    },
  };
}

/** Legacy English compatibility for owners outside the localized dossier. */
export const clientCorrectionHistoryCopy = {
  title: 'Correction history',
  show: 'Show correction history',
  hide: 'Hide correction history',
  loading: 'Loading correction history…',
  empty: 'No corrections have been recorded for this Client in this Company.',
  error:
    'We could not load the correction history. The dossier remains available.',
  retry: 'Retry correction history',
  unavailable: 'Correction history is not available with your current access.',
  list: 'Corrections, newest first',
  correctedBy: (displayName: string) => `Corrected by ${displayName}`,
  changedTo: 'changed to',
  before: 'Before',
  after: 'After',
  showOlder: 'Show older corrections',
  loadingOlder: 'Loading older corrections…',
  olderError: 'Older corrections could not be loaded. Try again.',
  notProvided: clientWorkspaceCopy.notProvided,
  noContacts: clientWorkspaceCopy.noContacts,
  fieldLabels: {
    displayName: clientWorkspaceCopy.displayNameLabel,
    taxId: clientWorkspaceCopy.taxIdLabel,
    address: clientWorkspaceCopy.addressLabel,
    telephone: clientWorkspaceCopy.telephoneLabel,
    generalEmail: clientWorkspaceCopy.generalEmailLabel,
    businessActivity: clientWorkspaceCopy.businessActivityLabel,
    contacts: clientWorkspaceCopy.contactsLabel,
  },
} as const;
