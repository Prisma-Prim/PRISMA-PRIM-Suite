import {
  useInterfaceLocale,
  type InterfaceLocale,
} from '../localization/interface-locale';
import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../localization/messages';

const keys = [
  'duplicateReviewTitle',
  'duplicateReviewDescription',
  'loadingDuplicateReviews',
  'loadMoreDuplicateReviews',
  'loadingMoreDuplicateReviews',
  'loadingDuplicateReview',
  'noDuplicateReviews',
  'emptyDuplicateReviewPage',
  'retryDuplicateReviews',
  'duplicateReviewDenied',
  'duplicateAttachmentRetry',
  'duplicateReviewRetry',
  'duplicateReviewContinuationRetry',
  'duplicateReviewUnavailable',
  'openDuplicateReview',
  'multipleDuplicateCandidates',
  'duplicateComparisonTitle',
  'duplicateComparisonDescription',
  'duplicateRegistrationProposal',
  'duplicateCorrectionProposal',
  'noProposedContacts',
  'duplicateAlreadyLinked',
  'duplicateNotLinked',
  'duplicateAttachmentUnavailable',
  'duplicateFieldColumn',
  'duplicateRecordState',
  'duplicateProposalColumn',
  'duplicateCandidateColumn',
  'notApplicable',
  'attachExistingDuplicate',
  'attachingDuplicate',
  'duplicateAttached',
  'duplicateAttachmentRefreshFailed',
  'correctDuplicateProposal',
] as const;

const translations = {
  ro: {
    duplicateReviewTitle: 'Examinări ale posibilelor duplicate',
    duplicateReviewDescription:
      'Examinează posibilele duplicate la care ai acces.',
    loadingDuplicateReviews: 'Se încarcă examinările posibilelor duplicate…',
    loadMoreDuplicateReviews:
      'Încarcă mai multe examinări de posibile duplicate',
    loadingMoreDuplicateReviews:
      'Se încarcă mai multe examinări de posibile duplicate…',
    loadingDuplicateReview: 'Se încarcă comparația duplicatului…',
    noDuplicateReviews:
      'Nicio examinare de posibil duplicat nu este disponibilă în prezent.',
    emptyDuplicateReviewPage:
      'Nicio examinare pe această pagină. Pot fi disponibile și altele.',
    retryDuplicateReviews: 'Reîncearcă lista de examinări',
    duplicateReviewDenied:
      'Accesul la examinări nu este disponibil cu autoritatea ta curentă.',
    duplicateAttachmentRetry:
      'Relația cu Compania nu a putut fi confirmată. Redeschide examinarea înainte de a încerca din nou.',
    duplicateReviewRetry:
      'Examinarea duplicatului nu a putut fi încărcată în siguranță.',
    duplicateReviewContinuationRetry:
      'Mai multe examinări de duplicate nu au putut fi încărcate în siguranță. Încearcă din nou.',
    duplicateReviewUnavailable:
      'Această examinare nu mai este disponibilă. Este posibil ca datele sau autoritatea să se fi modificat.',
    openDuplicateReview: 'Examinează posibilul duplicat {position}',
    multipleDuplicateCandidates:
      'Mai mulți Clienți existenți folosesc acest identificator. Datele trebuie remediate înainte de a continua comparația.',
    duplicateComparisonTitle: 'Compară Clientul propus cu cel existent',
    duplicateComparisonDescription:
      'Citește informațiile propuse alături de dosarul salvat. Nicio valoare propusă nu este copiată în Clientul existent.',
    duplicateRegistrationProposal: 'Propunere de înregistrare · nesalvată',
    duplicateCorrectionProposal: 'Propunere de corectare · nesalvată',
    noProposedContacts: 'Niciun Contact propus.',
    duplicateAlreadyLinked:
      'Clientul existent este deja asociat Companiei active.',
    duplicateNotLinked: 'Clientul existent nu este asociat Companiei active.',
    duplicateAttachmentUnavailable:
      'Asocierea acestui Client nu este disponibilă cu accesul tău curent.',
    duplicateFieldColumn: 'Câmp',
    duplicateRecordState: 'Starea înregistrării',
    duplicateProposalColumn: 'Valoare propusă',
    duplicateCandidateColumn: 'Client existent',
    notApplicable: 'Nu se aplică',
    attachExistingDuplicate:
      'Folosește acest Client existent în Compania activă',
    attachingDuplicate: 'Se adaugă Clientul existent…',
    duplicateAttached: 'Clientul existent a fost asociat Companiei active.',
    duplicateAttachmentRefreshFailed:
      'Clientul a fost asociat, dar unele informații nu au putut fi reîmprospătate.',
    correctDuplicateProposal:
      'Revino la dosarul relevant și trimite o corectare obișnuită, dacă este cazul.',
  },
  ru: {
    duplicateReviewTitle: 'Проверки возможных дубликатов',
    duplicateReviewDescription:
      'Проверяйте возможные дубликаты, к которым у вас есть доступ.',
    loadingDuplicateReviews: 'Загрузка проверок возможных дубликатов…',
    loadMoreDuplicateReviews: 'Загрузить другие проверки возможных дубликатов',
    loadingMoreDuplicateReviews:
      'Загрузка других проверок возможных дубликатов…',
    loadingDuplicateReview: 'Загрузка сравнения дубликата…',
    noDuplicateReviews: 'Сейчас нет доступных проверок возможных дубликатов.',
    emptyDuplicateReviewPage:
      'На этой странице нет проверок. На следующих страницах могут быть другие.',
    retryDuplicateReviews: 'Повторить загрузку списка проверок',
    duplicateReviewDenied:
      'Текущие полномочия не позволяют просматривать проверки.',
    duplicateAttachmentRetry:
      'Не удалось подтвердить связь с Компанией. Снова откройте проверку перед следующей попыткой.',
    duplicateReviewRetry: 'Не удалось безопасно загрузить проверку дубликата.',
    duplicateReviewContinuationRetry:
      'Не удалось безопасно загрузить другие проверки дубликатов. Повторите попытку.',
    duplicateReviewUnavailable:
      'Эта проверка больше недоступна. Данные или полномочия могли измениться.',
    openDuplicateReview: 'Проверить возможный дубликат {position}',
    multipleDuplicateCandidates:
      'Несколько существующих Клиентов используют этот идентификатор. Для продолжения сравнения необходимо исправить данные.',
    duplicateComparisonTitle: 'Сравнить предложенного и существующего Клиента',
    duplicateComparisonDescription:
      'Прочитайте предложенные сведения рядом с сохранённым досье. Предложенные значения не копируются в существующего Клиента.',
    duplicateRegistrationProposal: 'Предложение регистрации · не сохранено',
    duplicateCorrectionProposal: 'Предложение исправления · не сохранено',
    noProposedContacts: 'Контакты не предложены.',
    duplicateAlreadyLinked:
      'Существующий Клиент уже связан с активной Компанией.',
    duplicateNotLinked: 'Существующий Клиент не связан с активной Компанией.',
    duplicateAttachmentUnavailable:
      'Текущий доступ не позволяет связать этого Клиента.',
    duplicateFieldColumn: 'Поле',
    duplicateRecordState: 'Состояние записи',
    duplicateProposalColumn: 'Предложенное значение',
    duplicateCandidateColumn: 'Существующий Клиент',
    notApplicable: 'Не применимо',
    attachExistingDuplicate:
      'Использовать этого существующего Клиента в активной Компании',
    attachingDuplicate: 'Добавление существующего Клиента…',
    duplicateAttached: 'Существующий Клиент связан с активной Компанией.',
    duplicateAttachmentRefreshFailed:
      'Клиент связан, но часть сведений не удалось обновить.',
    correctDuplicateProposal:
      'Вернитесь к соответствующему досье и при необходимости отправьте обычное исправление.',
  },
  fr: {
    duplicateReviewTitle: 'Examens des doublons possibles',
    duplicateReviewDescription:
      'Examinez les doublons possibles auxquels vous avez accès.',
    loadingDuplicateReviews: 'Chargement des examens de doublons possibles…',
    loadMoreDuplicateReviews: 'Charger d’autres examens de doublons possibles',
    loadingMoreDuplicateReviews:
      'Chargement d’autres examens de doublons possibles…',
    loadingDuplicateReview: 'Chargement de la comparaison du doublon…',
    noDuplicateReviews:
      'Aucun examen de doublon possible n’est actuellement disponible.',
    emptyDuplicateReviewPage:
      'Aucun examen sur cette page. D’autres examens peuvent être disponibles.',
    retryDuplicateReviews: 'Réessayer la liste des examens',
    duplicateReviewDenied:
      'Vos autorisations actuelles ne permettent pas d’accéder aux examens.',
    duplicateAttachmentRetry:
      'Le rattachement à l’Entreprise n’a pas pu être confirmé. Rouvrez l’examen avant de réessayer.',
    duplicateReviewRetry:
      'L’examen du doublon n’a pas pu être chargé en toute sécurité.',
    duplicateReviewContinuationRetry:
      'D’autres examens de doublons n’ont pas pu être chargés en toute sécurité. Réessayez.',
    duplicateReviewUnavailable:
      'Cet examen n’est plus disponible. Ses données ou les autorisations ont pu changer.',
    openDuplicateReview: 'Examiner le doublon possible {position}',
    multipleDuplicateCandidates:
      'Plusieurs Clients existants utilisent cet identifiant. Les données doivent être corrigées avant de poursuivre la comparaison.',
    duplicateComparisonTitle:
      'Comparer le Client proposé et le Client existant',
    duplicateComparisonDescription:
      'Lisez les informations proposées à côté du dossier enregistré. Aucune valeur proposée n’est copiée dans le Client existant.',
    duplicateRegistrationProposal:
      'Proposition d’enregistrement · non enregistrée',
    duplicateCorrectionProposal: 'Proposition de correction · non enregistrée',
    noProposedContacts: 'Aucun Contact proposé.',
    duplicateAlreadyLinked:
      'Le Client existant est déjà rattaché à l’Entreprise active.',
    duplicateNotLinked:
      'Le Client existant n’est pas rattaché à l’Entreprise active.',
    duplicateAttachmentUnavailable:
      'Votre accès actuel ne permet pas de rattacher ce Client.',
    duplicateFieldColumn: 'Champ',
    duplicateRecordState: 'État de l’enregistrement',
    duplicateProposalColumn: 'Valeur proposée',
    duplicateCandidateColumn: 'Client existant',
    notApplicable: 'Sans objet',
    attachExistingDuplicate:
      'Utiliser ce Client existant dans l’Entreprise active',
    attachingDuplicate: 'Ajout du Client existant…',
    duplicateAttached: 'Client existant rattaché à l’Entreprise active.',
    duplicateAttachmentRefreshFailed:
      'Le Client a été rattaché, mais certaines informations n’ont pas pu être actualisées.',
    correctDuplicateProposal:
      'Revenez au dossier concerné et soumettez une correction ordinaire si nécessaire.',
  },
  en: {
    duplicateReviewTitle: 'Possible duplicate reviews',
    duplicateReviewDescription:
      'Review possible duplicates you have access to.',
    loadingDuplicateReviews: 'Loading possible duplicate reviews…',
    loadMoreDuplicateReviews: 'Load more possible duplicate reviews',
    loadingMoreDuplicateReviews: 'Loading more possible duplicate reviews…',
    loadingDuplicateReview: 'Loading the duplicate comparison…',
    noDuplicateReviews: 'No possible duplicate review is currently available.',
    emptyDuplicateReviewPage:
      'No review on this page. More reviews may be available.',
    retryDuplicateReviews: 'Retry review list',
    duplicateReviewDenied:
      'Review access is not available with your current authority.',
    duplicateAttachmentRetry:
      'The Company attachment could not be confirmed. Reopen the review before trying again.',
    duplicateReviewRetry: 'The duplicate review could not be loaded safely.',
    duplicateReviewContinuationRetry:
      'More duplicate reviews could not be loaded safely. Try again.',
    duplicateReviewUnavailable:
      'This review is no longer available. Its data or authority may have changed.',
    openDuplicateReview: 'Review possible duplicate {position}',
    multipleDuplicateCandidates:
      'Several existing Clients use this identifier. Data remediation is required before comparison can continue.',
    duplicateComparisonTitle: 'Compare the proposed and existing Client',
    duplicateComparisonDescription:
      'Read the proposed information alongside the saved dossier. No proposed value is copied into the existing Client.',
    duplicateRegistrationProposal: 'Registration proposal · not saved',
    duplicateCorrectionProposal: 'Correction proposal · not saved',
    noProposedContacts: 'No Contacts proposed.',
    duplicateAlreadyLinked:
      'The existing Client is already linked to the active Company.',
    duplicateNotLinked:
      'The existing Client is not linked to the active Company.',
    duplicateAttachmentUnavailable:
      'Linking this Client is not available with your current access.',
    duplicateFieldColumn: 'Field',
    duplicateRecordState: 'Record state',
    duplicateProposalColumn: 'Proposed value',
    duplicateCandidateColumn: 'Existing Client',
    notApplicable: 'Not applicable',
    attachExistingDuplicate: 'Use this existing Client in the active Company',
    attachingDuplicate: 'Adding existing Client…',
    duplicateAttached: 'Existing Client linked to the active Company.',
    duplicateAttachmentRefreshFailed:
      'The Client was linked, but some information could not be refreshed.',
    correctDuplicateProposal:
      'Return to the relevant dossier and submit an ordinary correction if appropriate.',
  },
} satisfies Record<InterfaceLocale, Record<(typeof keys)[number], string>>;

export const clientDuplicateReviewMessages = defineMessages(keys, translations);

export function useClientDuplicateReviewCopy() {
  const message = useMessages(clientDuplicateReviewMessages);
  const { formatNumber } = useInterfaceLocale();
  return {
    duplicateReviewTitle: message('duplicateReviewTitle'),
    duplicateReviewDescription: message('duplicateReviewDescription'),
    loadingDuplicateReviews: message('loadingDuplicateReviews'),
    loadMoreDuplicateReviews: message('loadMoreDuplicateReviews'),
    loadingMoreDuplicateReviews: message('loadingMoreDuplicateReviews'),
    loadingDuplicateReview: message('loadingDuplicateReview'),
    noDuplicateReviews: message('noDuplicateReviews'),
    emptyDuplicateReviewPage: message('emptyDuplicateReviewPage'),
    retryDuplicateReviews: message('retryDuplicateReviews'),
    duplicateReviewDenied: message('duplicateReviewDenied'),
    duplicateAttachmentRetry: message('duplicateAttachmentRetry'),
    duplicateReviewRetry: message('duplicateReviewRetry'),
    duplicateReviewContinuationRetry: message(
      'duplicateReviewContinuationRetry',
    ),
    duplicateReviewUnavailable: message('duplicateReviewUnavailable'),
    openDuplicateReview: (position: number) =>
      formatMessage(message('openDuplicateReview'), {
        position: formatNumber(position),
      }),
    multipleDuplicateCandidates: message('multipleDuplicateCandidates'),
    duplicateComparisonTitle: message('duplicateComparisonTitle'),
    duplicateComparisonDescription: message('duplicateComparisonDescription'),
    duplicateRegistrationProposal: message('duplicateRegistrationProposal'),
    duplicateCorrectionProposal: message('duplicateCorrectionProposal'),
    noProposedContacts: message('noProposedContacts'),
    duplicateAlreadyLinked: message('duplicateAlreadyLinked'),
    duplicateNotLinked: message('duplicateNotLinked'),
    duplicateAttachmentUnavailable: message('duplicateAttachmentUnavailable'),
    duplicateFieldColumn: message('duplicateFieldColumn'),
    duplicateRecordState: message('duplicateRecordState'),
    duplicateProposalColumn: message('duplicateProposalColumn'),
    duplicateCandidateColumn: message('duplicateCandidateColumn'),
    notApplicable: message('notApplicable'),
    attachExistingDuplicate: message('attachExistingDuplicate'),
    attachingDuplicate: message('attachingDuplicate'),
    duplicateAttached: message('duplicateAttached'),
    duplicateAttachmentRefreshFailed: message(
      'duplicateAttachmentRefreshFailed',
    ),
    correctDuplicateProposal: message('correctDuplicateProposal'),
  };
}
