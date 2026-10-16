import { useInterfaceLocale } from '../localization/interface-locale';
import {
  defineMessages,
  formatMessage,
  resolveMessage,
  useMessages,
} from '../localization/messages';

const keys = [
  'eyebrow',
  'title',
  'companyPrefix',
  'noticeLabel',
  'illustrativeMarker',
  'illustrativeDetail',
  'timeZone',
  'currentTitle',
  'currentLoading',
  'noCurrent',
  'head',
  'noHead',
  'scheduledTitle',
  'noScheduled',
  'takesOver',
  'versionName',
  'window',
  'from',
  'until',
  'openEnded',
  'takenOverFrom',
  'headMarker',
  'stateScheduled',
  'stateCurrent',
  'stateSuperseded',
  'provenanceIllustrative',
  'fixedRule',
  'publishTitle',
  'publishAfterHead',
  'publishFirst',
  'label',
  'labelHelp',
  'effectiveFrom',
  'effectiveTo',
  'publish',
  'published',
  'unchanged',
  'validation',
  'effectiveFromPast',
  'effectiveFromNotAdvancing',
  'windowGap',
  'versionExhausted',
  'idempotencyConflict',
  'stale',
  'staleNoHead',
  'reload',
  'uncertain',
  'retryPublication',
  'versionsTitle',
  'versionsList',
  'versionsLoading',
  'versionsEmpty',
  'versionsError',
  'versionsChanging',
  'showOlder',
  'olderLoading',
  'olderError',
  'denied',
] as const;

type Key = (typeof keys)[number];

export const pricingConfigurationMessages = defineMessages(keys, {
  ro: {
    eyebrow: 'Comercial',
    title: 'Configurarea regulilor de tarifare',
    companyPrefix: 'Companie:',
    noticeLabel: 'Avertisment privind configurarea ilustrativă a tarifării',
    illustrativeMarker: 'Configurare ilustrativă: înregistrări provizorii',
    illustrativeDetail:
      'Fiecare versiune a regulii de tarifare de aici este ilustrativă. Nimic de aici nu reprezintă un preț, o regulă sau o aprobare reală și nimic de aici nu calculează un preț.',
    timeZone:
      'Momentele sunt introduse și afișate în fusul orar al browserului: {zone}.',
    currentTitle: 'Versiunea curentă a regulii de tarifare',
    currentLoading: 'Se încarcă versiunea curentă a regulii de tarifare…',
    noCurrent:
      'Nicio versiune curentă: nicio versiune a regulii de tarifare nu este curentă în acest moment.',
    head: 'Ultima versiune publicată: {versionNumber}. O nouă publicare urmează acestei versiuni.',
    noHead:
      'Nu a fost publicată încă nicio versiune a regulii de tarifare pentru această Companie.',
    scheduledTitle: 'Versiuni succesoare programate',
    noScheduled: 'Nu este programată nicio versiune succesoare.',
    takesOver: 'Preia aplicarea de la',
    versionName: 'Versiunea {versionNumber}',
    window: 'Valabilă',
    from: 'de la',
    until: 'până la',
    openEnded: 'fără sfârșit declarat',
    takenOverFrom: 'Înlocuită începând cu',
    headMarker: 'Ultima publicată',
    stateScheduled: 'Programată',
    stateCurrent: 'Curentă',
    stateSuperseded: 'Înlocuită',
    provenanceIllustrative: 'Ilustrativă',
    fixedRule:
      'Forma fixă a regulii: preț unitar × cantitate, rotunjire la 2 zecimale cu jumătățile în sus, taxă pe fiecare linie.',
    publishTitle: 'Publică o versiune a regulii de tarifare',
    publishAfterHead:
      'Noua versiune va urma ultimei versiuni publicate, {versionNumber}.',
    publishFirst: 'Noua versiune va fi prima pentru această Companie.',
    label: 'Denumire',
    labelHelp: 'Folosiți între 1 și 120 de caractere.',
    effectiveFrom: 'Valabilă de la ({zone})',
    effectiveTo: 'Valabilă până la, opțional ({zone})',
    publish: 'Publică versiunea',
    published: 'Versiunea {versionNumber} a fost publicată.',
    unchanged:
      'Versiunea {versionNumber} are deja acest conținut. Nu s-a schimbat nimic.',
    validation:
      'Introduceți o denumire de 1–120 de caractere, un început și, opțional, un sfârșit ulterior începutului.',
    effectiveFromPast:
      'Alegeți un început care nu este anterior momentului curent.',
    effectiveFromNotAdvancing:
      'Alegeți un început ulterior începutului ultimei versiuni publicate.',
    windowGap:
      'Ultima versiune publicată se încheie înainte de acest început. Alegeți un început cel târziu la sfârșitul ei sau așteptați până când s-a încheiat.',
    versionExhausted:
      'Nu mai poate fi alocat un număr de versiune a regulii de tarifare.',
    idempotencyConflict:
      'Nu s-a publicat nimic prin această cerere: identificatorul ei fusese deja folosit pentru o altă cerere. Schița este păstrată și poate fi publicată din nou.',
    stale:
      'Configurarea s-a schimbat: versiunea {versionNumber} este acum ultima publicată. Reîncărcați înainte de a publica din nou.',
    staleNoHead:
      'Configurarea s-a schimbat: nu mai există o ultimă versiune publicată. Reîncărcați înainte de a publica din nou.',
    reload: 'Reîncarcă versiunile regulii de tarifare',
    uncertain:
      'Rezultatul publicării este incert. Reîncercați pentru a-l confirma: se trimite aceeași cerere, fără a publica de două ori. Nu poate fi publicată altă versiune până când rezultatul nu este cunoscut.',
    retryPublication: 'Reîncearcă publicarea',
    versionsTitle: 'Toate versiunile regulii de tarifare',
    versionsList: 'Versiunile regulii de tarifare',
    versionsLoading: 'Se încarcă versiunile regulii de tarifare…',
    versionsEmpty:
      'Nu a fost publicată încă nicio versiune a regulii de tarifare.',
    versionsError:
      'Versiunile regulii de tarifare nu au putut fi încărcate. Reîncercați.',
    versionsChanging:
      'Versiunile regulii de tarifare s-au schimbat în timpul încărcării. Reîncărcați pentru a vedea cele mai recente versiuni.',
    showOlder: 'Arată versiunile mai vechi',
    olderLoading: 'Se încarcă versiunile mai vechi…',
    olderError: 'Versiunile mai vechi nu au putut fi încărcate. Reîncercați.',
    denied: 'Nu aveți permisiunea de a accesa configurarea tarifării.',
  },
  ru: {
    eyebrow: 'Коммерция',
    title: 'Настройка правил ценообразования',
    companyPrefix: 'Компания:',
    noticeLabel: 'Предупреждение об иллюстративной настройке ценообразования',
    illustrativeMarker: 'Иллюстративная настройка: предварительные записи',
    illustrativeDetail:
      'Все версии правил ценообразования здесь иллюстративные. Здесь нет реальных цен, правил или одобрений, и ничто здесь не рассчитывает цену.',
    timeZone:
      'Моменты времени вводятся и отображаются в часовом поясе браузера: {zone}.',
    currentTitle: 'Текущая версия правила ценообразования',
    currentLoading: 'Загрузка текущей версии правила ценообразования…',
    noCurrent:
      'Нет текущей версии: в данный момент ни одна версия правила ценообразования не действует.',
    head: 'Последняя опубликованная версия: {versionNumber}. Новая публикация следует за этой версией.',
    noHead:
      'Для этой Компании ещё не опубликовано ни одной версии правила ценообразования.',
    scheduledTitle: 'Запланированные последующие версии',
    noScheduled: 'Последующая версия не запланирована.',
    takesOver: 'Начинает действовать с',
    versionName: 'Версия {versionNumber}',
    window: 'Действует',
    from: 'с',
    until: 'до',
    openEnded: 'без указанной даты окончания',
    takenOverFrom: 'Заменена с',
    headMarker: 'Последняя опубликованная',
    stateScheduled: 'Запланирована',
    stateCurrent: 'Текущая',
    stateSuperseded: 'Заменена',
    provenanceIllustrative: 'Иллюстративная',
    fixedRule:
      'Фиксированная форма правила: цена за единицу × количество, округление до 2 знаков с половиной вверх, налог по каждой строке.',
    publishTitle: 'Опубликовать версию правила ценообразования',
    publishAfterHead:
      'Новая версия будет следовать за последней опубликованной версией {versionNumber}.',
    publishFirst: 'Новая версия станет первой для этой Компании.',
    label: 'Название',
    labelHelp: 'Используйте от 1 до 120 символов.',
    effectiveFrom: 'Действует с ({zone})',
    effectiveTo: 'Действует до, необязательно ({zone})',
    publish: 'Опубликовать версию',
    published: 'Версия {versionNumber} опубликована.',
    unchanged:
      'Версия {versionNumber} уже содержит эти данные. Ничего не изменилось.',
    validation:
      'Введите название длиной от 1 до 120 символов, начало и, при необходимости, окончание позже начала.',
    effectiveFromPast: 'Выберите начало не раньше текущего момента.',
    effectiveFromNotAdvancing:
      'Выберите начало позже начала последней опубликованной версии.',
    windowGap:
      'Последняя опубликованная версия заканчивается раньше этого начала. Выберите начало не позже её окончания или дождитесь, пока она закончится.',
    versionExhausted:
      'Невозможно выделить следующий номер версии правила ценообразования.',
    idempotencyConflict:
      'По этому запросу ничего не опубликовано: его идентификатор уже использовался для другого запроса. Черновик сохранён, его можно опубликовать снова.',
    stale:
      'Настройка изменилась: версия {versionNumber} теперь последняя опубликованная. Перезагрузите данные перед новой публикацией.',
    staleNoHead:
      'Настройка изменилась: последней опубликованной версии больше нет. Перезагрузите данные перед новой публикацией.',
    reload: 'Перезагрузить версии правила ценообразования',
    uncertain:
      'Результат публикации неизвестен. Повторите попытку для подтверждения: повторно отправляется тот же запрос, без двойной публикации. Пока результат неизвестен, другую версию опубликовать нельзя.',
    retryPublication: 'Повторить публикацию',
    versionsTitle: 'Все версии правила ценообразования',
    versionsList: 'Версии правила ценообразования',
    versionsLoading: 'Загрузка версий правила ценообразования…',
    versionsEmpty:
      'Ещё не опубликовано ни одной версии правила ценообразования.',
    versionsError:
      'Не удалось загрузить версии правила ценообразования. Повторите попытку.',
    versionsChanging:
      'Версии правила ценообразования менялись во время загрузки. Перезагрузите данные, чтобы увидеть последние версии.',
    showOlder: 'Показать более ранние версии',
    olderLoading: 'Загрузка более ранних версий…',
    olderError: 'Не удалось загрузить более ранние версии. Повторите попытку.',
    denied: 'У вас нет разрешения на доступ к настройке ценообразования.',
  },
  fr: {
    eyebrow: 'Commercial',
    title: 'Configuration des règles de tarification',
    companyPrefix: 'Société :',
    noticeLabel:
      'Avertissement sur la configuration illustrative de la tarification',
    illustrativeMarker:
      'Configuration illustrative : enregistrements provisoires',
    illustrativeDetail:
      'Chaque version de règle de tarification présentée ici est illustrative. Rien ici ne constitue un prix, une règle ou une approbation réelle, et rien ici ne calcule un prix.',
    timeZone:
      'Les instants sont saisis et affichés dans le fuseau horaire du navigateur : {zone}.',
    currentTitle: 'Version actuelle de la règle de tarification',
    currentLoading:
      'Chargement de la version actuelle de la règle de tarification…',
    noCurrent:
      'Aucune version actuelle : aucune version de règle de tarification n’est en vigueur à cet instant.',
    head: 'Dernière version publiée : {versionNumber}. Une nouvelle publication suit cette version.',
    noHead:
      'Aucune version de règle de tarification n’a encore été publiée pour cette Société.',
    scheduledTitle: 'Versions suivantes programmées',
    noScheduled: 'Aucune version suivante n’est programmée.',
    takesOver: 'Prend le relais à partir du',
    versionName: 'Version {versionNumber}',
    window: 'Applicable',
    from: 'à partir du',
    until: 'jusqu’au',
    openEnded: 'sans fin déclarée',
    takenOverFrom: 'Remplacée à partir du',
    headMarker: 'Dernière publiée',
    stateScheduled: 'Programmée',
    stateCurrent: 'Actuelle',
    stateSuperseded: 'Remplacée',
    provenanceIllustrative: 'Illustrative',
    fixedRule:
      'Forme fixe de la règle : prix unitaire × quantité, arrondi à 2 décimales avec les demis vers le haut, taxe par ligne.',
    publishTitle: 'Publier une version de règle de tarification',
    publishAfterHead:
      'La nouvelle version suivra la dernière version publiée, {versionNumber}.',
    publishFirst: 'La nouvelle version sera la première pour cette Société.',
    label: 'Libellé',
    labelHelp: 'Utilisez de 1 à 120 caractères.',
    effectiveFrom: 'Applicable à partir du ({zone})',
    effectiveTo: 'Applicable jusqu’au, facultatif ({zone})',
    publish: 'Publier la version',
    published: 'Version {versionNumber} publiée.',
    unchanged:
      'La version {versionNumber} possède déjà ce contenu. Rien n’a changé.',
    validation:
      'Saisissez un libellé de 1 à 120 caractères, un début et, facultativement, une fin postérieure au début.',
    effectiveFromPast:
      'Choisissez un début qui n’est pas antérieur à maintenant.',
    effectiveFromNotAdvancing:
      'Choisissez un début postérieur au début de la dernière version publiée.',
    windowGap:
      'La dernière version publiée se termine avant ce début. Choisissez un début au plus tard à sa fin ou attendez qu’elle soit terminée.',
    versionExhausted:
      'Aucun nouveau numéro de version de règle de tarification ne peut être attribué.',
    idempotencyConflict:
      'Rien n’a été publié avec cette requête : son identifiant avait déjà été utilisé pour une autre requête. Votre brouillon est conservé et peut être publié à nouveau.',
    stale:
      'La configuration a changé : la version {versionNumber} est maintenant la dernière publiée. Rechargez avant de publier à nouveau.',
    staleNoHead:
      'La configuration a changé : il n’y a plus de dernière version publiée. Rechargez avant de publier à nouveau.',
    reload: 'Recharger les versions de règle de tarification',
    uncertain:
      'Le résultat de la publication est incertain. Réessayez pour le confirmer : la même requête est renvoyée, sans jamais publier deux fois. Aucune autre version ne peut être publiée tant que le résultat n’est pas connu.',
    retryPublication: 'Réessayer la publication',
    versionsTitle: 'Toutes les versions de règle de tarification',
    versionsList: 'Versions de règle de tarification',
    versionsLoading: 'Chargement des versions de règle de tarification…',
    versionsEmpty:
      'Aucune version de règle de tarification n’a encore été publiée.',
    versionsError:
      'Les versions de règle de tarification n’ont pas pu être chargées. Réessayez.',
    versionsChanging:
      'Les versions de règle de tarification ont changé pendant le chargement. Rechargez pour voir les dernières versions.',
    showOlder: 'Afficher les versions antérieures',
    olderLoading: 'Chargement des versions antérieures…',
    olderError:
      'Les versions antérieures n’ont pas pu être chargées. Réessayez.',
    denied:
      'Vous n’avez pas l’autorisation d’accéder à la configuration de la tarification.',
  },
  en: {
    eyebrow: 'Commercial',
    title: 'Pricing Configuration',
    companyPrefix: 'Company:',
    noticeLabel: 'Illustrative pricing configuration notice',
    illustrativeMarker: 'Illustrative configuration: provisional records',
    illustrativeDetail:
      'Every Pricing Rule Version here is illustrative. Nothing here is a real price, rule or approval, and nothing here calculates a price.',
    timeZone:
      'Instants are entered and shown in your browser time zone: {zone}.',
    currentTitle: 'Current Pricing Rule Version',
    currentLoading: 'Loading the current Pricing Rule Version…',
    noCurrent:
      'No current version: no Pricing Rule Version is current at this instant.',
    head: 'Head: version {versionNumber}. A new publication follows this version.',
    noHead: 'No Pricing Rule Version has been published for this Company yet.',
    scheduledTitle: 'Scheduled successors',
    noScheduled: 'No successor is scheduled.',
    takesOver: 'Takes over from',
    versionName: 'Version {versionNumber}',
    window: 'Effective',
    from: 'from',
    until: 'until',
    openEnded: 'with no declared end',
    takenOverFrom: 'Taken over from',
    headMarker: 'Head',
    stateScheduled: 'Scheduled',
    stateCurrent: 'Current',
    stateSuperseded: 'Superseded',
    provenanceIllustrative: 'Illustrative',
    fixedRule:
      'Fixed rule shape: unit price × quantity, rounded half-up to 2 decimals, tax per line.',
    publishTitle: 'Publish a Pricing Rule Version',
    publishAfterHead:
      'The new version will follow head version {versionNumber}.',
    publishFirst: 'The new version will be the first for this Company.',
    label: 'Label',
    labelHelp: 'Use 1 to 120 characters.',
    effectiveFrom: 'Effective from ({zone})',
    effectiveTo: 'Effective until, optional ({zone})',
    publish: 'Publish version',
    published: 'Version {versionNumber} published.',
    unchanged:
      'Version {versionNumber} already has this content. Nothing changed.',
    validation:
      'Enter a label of 1 to 120 characters, a start, and an optional end later than the start.',
    effectiveFromPast: 'Choose a start that is not earlier than now.',
    effectiveFromNotAdvancing:
      'Choose a start later than the start of the head version.',
    windowGap:
      'The head version ends before this start. Choose a start no later than its end, or wait until it has ended.',
    versionExhausted:
      'No further Pricing Rule Version number can be allocated.',
    idempotencyConflict:
      'Nothing was published with that request: its identifier had already been used for a different request. Your draft is kept and can be published again.',
    stale:
      'The configuration changed: version {versionNumber} is now the head. Reload before publishing again.',
    staleNoHead:
      'The configuration changed: no version is the head any more. Reload before publishing again.',
    reload: 'Reload Pricing Rule Versions',
    uncertain:
      'The publication outcome is uncertain. Retry to confirm it: the same request is sent again and never publishes twice. No other version can be published until its outcome is known.',
    retryPublication: 'Retry publication',
    versionsTitle: 'All Pricing Rule Versions',
    versionsList: 'Pricing Rule Versions',
    versionsLoading: 'Loading Pricing Rule Versions…',
    versionsEmpty: 'No Pricing Rule Version has been published yet.',
    versionsError:
      'Pricing Rule Versions could not be loaded. Please try again.',
    versionsChanging:
      'Pricing Rule Versions kept changing while loading. Reload to see the latest versions.',
    showOlder: 'Show older versions',
    olderLoading: 'Loading older versions…',
    olderError: 'Older versions could not be loaded. Please try again.',
    denied: 'You do not have permission to access Pricing Configuration.',
  },
});

function createCopy(
  message: (key: Key) => string,
  formatNumber: (value: number) => string,
) {
  const version = (key: Key, versionNumber: number) =>
    formatMessage(message(key), { versionNumber: formatNumber(versionNumber) });
  return {
    eyebrow: message('eyebrow'),
    title: message('title'),
    companyPrefix: message('companyPrefix'),
    noticeLabel: message('noticeLabel'),
    illustrativeMarker: message('illustrativeMarker'),
    illustrativeDetail: message('illustrativeDetail'),
    timeZone: (zone: string) => formatMessage(message('timeZone'), { zone }),
    currentTitle: message('currentTitle'),
    currentLoading: message('currentLoading'),
    noCurrent: message('noCurrent'),
    head: (versionNumber: number) => version('head', versionNumber),
    noHead: message('noHead'),
    scheduledTitle: message('scheduledTitle'),
    noScheduled: message('noScheduled'),
    takesOver: message('takesOver'),
    versionName: (versionNumber: number) =>
      version('versionName', versionNumber),
    window: message('window'),
    from: message('from'),
    until: message('until'),
    openEnded: message('openEnded'),
    takenOverFrom: message('takenOverFrom'),
    headMarker: message('headMarker'),
    fixedRule: message('fixedRule'),
    publishTitle: message('publishTitle'),
    publishAfterHead: (versionNumber: number) =>
      version('publishAfterHead', versionNumber),
    publishFirst: message('publishFirst'),
    label: message('label'),
    labelHelp: message('labelHelp'),
    effectiveFrom: (zone: string) =>
      formatMessage(message('effectiveFrom'), { zone }),
    effectiveTo: (zone: string) =>
      formatMessage(message('effectiveTo'), { zone }),
    publish: message('publish'),
    published: (versionNumber: number) => version('published', versionNumber),
    unchanged: (versionNumber: number) => version('unchanged', versionNumber),
    validation: message('validation'),
    effectiveFromPast: message('effectiveFromPast'),
    effectiveFromNotAdvancing: message('effectiveFromNotAdvancing'),
    windowGap: message('windowGap'),
    versionExhausted: message('versionExhausted'),
    idempotencyConflict: message('idempotencyConflict'),
    stale: (headVersionNumber: number | null) =>
      headVersionNumber === null
        ? message('staleNoHead')
        : version('stale', headVersionNumber),
    reload: message('reload'),
    uncertain: message('uncertain'),
    retryPublication: message('retryPublication'),
    versionsTitle: message('versionsTitle'),
    versionsList: message('versionsList'),
    versionsLoading: message('versionsLoading'),
    versionsEmpty: message('versionsEmpty'),
    versionsError: message('versionsError'),
    versionsChanging: message('versionsChanging'),
    showOlder: message('showOlder'),
    olderLoading: message('olderLoading'),
    olderError: message('olderError'),
    denied: message('denied'),
    stateLabels: {
      SCHEDULED: message('stateScheduled'),
      CURRENT: message('stateCurrent'),
      SUPERSEDED: message('stateSuperseded'),
    },
    provenanceLabels: { ILLUSTRATIVE: message('provenanceIllustrative') },
  };
}

// Existing consumers retain the established English presentation contract.
export const pricingConfigurationCopy = createCopy(
  (key) => resolveMessage(pricingConfigurationMessages, 'en', key),
  String,
);

export function usePricingConfigurationCopy() {
  const message = useMessages(pricingConfigurationMessages);
  const { formatNumber } = useInterfaceLocale();
  return createCopy(message, formatNumber);
}
