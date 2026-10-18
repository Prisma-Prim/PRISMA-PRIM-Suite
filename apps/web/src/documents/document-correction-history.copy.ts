import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../localization/messages';
import { useInterfaceLocale } from '../localization/interface-locale';
import { useDocumentsCopy } from './documents.copy';

const keys = [
  'title',
  'show',
  'hide',
  'description',
  'loading',
  'empty',
  'error',
  'retry',
  'unavailable',
  'list',
  'resultingRevision',
  'correctedBy',
  'changedTo',
  'withheldChanges',
  'showOlder',
  'loadingOlder',
  'olderError',
] as const;

export const documentCorrectionHistoryMessages = defineMessages(keys, {
  ro: {
    title: 'Istoricul corectărilor',
    show: 'Arată istoricul corectărilor referinței',
    hide: 'Ascunde istoricul corectărilor referinței',
    description:
      'Fiecare înregistrare arată valorile de dinainte și de după o corectare salvată. Valorile înregistrate reprezintă istoricul, nu starea referinței curente.',
    loading: 'Se încarcă istoricul corectărilor…',
    empty: 'Nu au fost salvate corectări pentru această referință de lucru.',
    error:
      'Istoricul corectărilor nu a putut fi încărcat. Referința rămâne disponibilă.',
    retry: 'Reîncearcă încărcarea istoricului corectărilor referinței',
    unavailable:
      'Istoricul corectărilor nu este disponibil cu accesul tău actual.',
    list: 'Corectările referinței, cele mai noi primele',
    resultingRevision: 'Revizia de lucru {revision}',
    correctedBy: 'Corectat de {actor}',
    changedTo: 'schimbat în',
    withheldChanges:
      'Detaliile modificate nu sunt afișate cu accesul tău actual.',
    showOlder: 'Încarcă corectări mai vechi',
    loadingOlder: 'Se încarcă corectările mai vechi…',
    olderError:
      'Corectările mai vechi nu au putut fi încărcate. Încearcă din nou.',
  },
  ru: {
    title: 'История исправлений',
    show: 'Показать историю исправлений ссылки',
    hide: 'Скрыть историю исправлений ссылки',
    description:
      'Каждая запись показывает значения до и после одного сохранённого исправления. Записанные значения отражают историю, а не текущее состояние ссылки.',
    loading: 'Загрузка истории исправлений…',
    empty: 'Для этой рабочей ссылки ещё нет сохранённых исправлений.',
    error:
      'Не удалось загрузить историю исправлений. Ссылка остаётся доступной.',
    retry: 'Повторить загрузку истории исправлений ссылки',
    unavailable: 'История исправлений недоступна при ваших текущих правах.',
    list: 'Исправления ссылки, сначала новые',
    resultingRevision: 'Рабочая редакция {revision}',
    correctedBy: 'Исправил: {actor}',
    changedTo: 'изменено на',
    withheldChanges:
      'Изменённые сведения не отображаются при ваших текущих правах.',
    showOlder: 'Загрузить предыдущие исправления',
    loadingOlder: 'Загрузка предыдущих исправлений…',
    olderError:
      'Не удалось загрузить предыдущие исправления. Повторите попытку.',
  },
  fr: {
    title: 'Historique des corrections',
    show: 'Afficher l’historique des corrections de référence',
    hide: 'Masquer l’historique des corrections de référence',
    description:
      'Chaque entrée présente les valeurs avant et après une correction enregistrée. Les valeurs enregistrées constituent l’historique, et ne décrivent pas la référence actuelle.',
    loading: 'Chargement de l’historique des corrections…',
    empty:
      'Aucune correction n’a été enregistrée pour cette référence de travail.',
    error:
      'L’historique des corrections n’a pas pu être chargé. La référence reste disponible.',
    retry: 'Réessayer l’historique des corrections de référence',
    unavailable:
      'L’historique des corrections n’est pas disponible avec vos droits actuels.',
    list: 'Corrections de référence, les plus récentes d’abord',
    resultingRevision: 'Révision de travail {revision}',
    correctedBy: 'Corrigé par {actor}',
    changedTo: 'modifié en',
    withheldChanges:
      'Les détails modifiés ne sont pas affichés avec vos droits actuels.',
    showOlder: 'Charger les corrections plus anciennes',
    loadingOlder: 'Chargement des corrections plus anciennes…',
    olderError:
      'Les corrections plus anciennes n’ont pas pu être chargées. Réessayez.',
  },
  en: {
    title: 'Correction history',
    show: 'Show reference correction history',
    hide: 'Hide reference correction history',
    description:
      'Each entry shows the values before and after one saved correction. Recorded values are history, not a statement of the current reference.',
    loading: 'Loading correction history…',
    empty: 'No corrections have been saved for this working reference.',
    error:
      'The correction history could not be loaded. The reference remains available.',
    retry: 'Retry reference correction history',
    unavailable:
      'Correction history is not available with your current access.',
    list: 'Reference corrections, newest first',
    resultingRevision: 'Working revision {revision}',
    correctedBy: 'Corrected by {actor}',
    changedTo: 'changed to',
    withheldChanges:
      'The changed details are not shown with your current access.',
    showOlder: 'Load older corrections',
    loadingOlder: 'Loading older corrections…',
    olderError: 'Older corrections could not be loaded. Try again.',
  },
});

export function useDocumentCorrectionHistoryCopy() {
  const message = useMessages(documentCorrectionHistoryMessages);
  const documents = useDocumentsCopy();
  const { formatNumber } = useInterfaceLocale();
  return {
    title: message('title'),
    show: message('show'),
    hide: message('hide'),
    description: message('description'),
    loading: message('loading'),
    empty: message('empty'),
    error: message('error'),
    retry: message('retry'),
    unavailable: message('unavailable'),
    list: message('list'),
    changedTo: message('changedTo'),
    withheldChanges: message('withheldChanges'),
    showOlder: message('showOlder'),
    loadingOlder: message('loadingOlder'),
    olderError: message('olderError'),
    resultingRevision: (revision: number) =>
      formatMessage(message('resultingRevision'), {
        revision: formatNumber(revision),
      }),
    correctedBy: (displayName: string) =>
      formatMessage(message('correctedBy'), { actor: displayName }),
    fieldLabels: {
      title: documents.titleLabel,
      purpose: documents.purpose,
      url: documents.url,
    },
  };
}
