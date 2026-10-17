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
  'offering',
  'chooseOffering',
  'offeringsLoading',
  'offeringsError',
  'offeringsEmpty',
  'reloadOfferings',
  'showMoreOfferings',
  'moreOfferingsLoading',
  'moreOfferingsError',
  'chooseOfferingPrompt',
  'currentTitle',
  'currentLoading',
  'noCurrent',
  'head',
  'noHead',
  'scheduledTitle',
  'noScheduled',
  'takesOver',
  'versionName',
  'amount',
  'taxRate',
  'noFiscalValidity',
  'window',
  'from',
  'until',
  'openEnded',
  'takenOverFrom',
  'headMarker',
  'provisionalMarker',
  'stateScheduled',
  'stateCurrent',
  'stateSuperseded',
  'provenanceIllustrative',
  'publishTitle',
  'publishAfterHead',
  'publishFirst',
  'unit',
  'unitHelp',
  'unitAmount',
  'unitAmountHelp',
  'currency',
  'chooseCurrency',
  'taxRatePercent',
  'taxRatePercentHelp',
  'taxLabel',
  'taxLabelHelp',
  'effectiveFrom',
  'effectiveTo',
  'publish',
  'published',
  'unchanged',
  'invalidUnit',
  'invalidUnitAmount',
  'invalidCurrency',
  'invalidTaxRatePercent',
  'invalidTaxLabel',
  'invalidWindow',
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

export const tariffVersionMessages = defineMessages(keys, {
  ro: {
    eyebrow: 'Configurarea tarifării',
    title: 'Versiunile tarifului',
    companyPrefix: 'Companie:',
    noticeLabel: 'Avertisment privind versiunile ilustrative de tarif',
    illustrativeMarker: 'Tarife ilustrative: înregistrări provizorii',
    illustrativeDetail:
      'Fiecare versiune de tarif de aici este ilustrativă. Nicio sumă nu este un preț real, nicio unitate nu este o unitate reală și nicio cotă de taxă nu are valabilitate fiscală. Nimic de aici nu convertește, combină sau însumează sume și nimic nu calculează un preț.',
    timeZone:
      'Momentele sunt introduse și afișate în fusul orar al browserului: {zone}.',
    offering: 'Ofertă de serviciu a Companiei',
    chooseOffering: 'Alegeți o ofertă de serviciu',
    offeringsLoading: 'Se încarcă ofertele de servicii ale Companiei…',
    offeringsError:
      'Ofertele de servicii ale Companiei nu au putut fi încărcate. Reîncercați.',
    offeringsEmpty:
      'Nu există încă nicio ofertă de serviciu pentru această Companie. Versiunile de tarif se publică pentru fiecare ofertă de serviciu.',
    reloadOfferings: 'Reîncarcă ofertele de servicii',
    showMoreOfferings: 'Arată mai multe oferte de servicii',
    moreOfferingsLoading: 'Se încarcă alte oferte de servicii…',
    moreOfferingsError:
      'Alte oferte de servicii nu au putut fi încărcate. Reîncercați.',
    chooseOfferingPrompt:
      'Alegeți o ofertă de serviciu pentru a vedea și publica versiunile sale de tarif. Fiecare ofertă are propriile versiuni, ultima versiune publicată și propriul calendar.',
    currentTitle: 'Versiunea curentă a tarifului',
    currentLoading: 'Se încarcă versiunea curentă a tarifului…',
    noCurrent:
      'Nicio versiune curentă: nicio versiune de tarif a acestei oferte de serviciu nu este curentă în acest moment.',
    head: 'Ultima versiune publicată: {versionNumber}. O nouă publicare urmează acestei versiuni.',
    noHead:
      'Nu a fost publicată încă nicio versiune de tarif pentru această ofertă de serviciu.',
    scheduledTitle: 'Versiuni succesoare de tarif programate',
    noScheduled: 'Nu este programată nicio versiune succesoare.',
    takesOver: 'Preia aplicarea de la',
    versionName: 'Versiunea {versionNumber}',
    amount: '{unitAmount} {currency} pe {unit}',
    taxRate: 'Taxă {taxRatePercent}% ({taxLabel})',
    noFiscalValidity: 'fără valabilitate fiscală',
    window: 'Valabilă',
    from: 'de la',
    until: 'până la',
    openEnded: 'fără sfârșit declarat',
    takenOverFrom: 'Înlocuită începând cu',
    headMarker: 'Ultima publicată',
    provisionalMarker: 'Provizoriu',
    stateScheduled: 'Programată',
    stateCurrent: 'Curentă',
    stateSuperseded: 'Înlocuită',
    provenanceIllustrative: 'Ilustrativă',
    publishTitle: 'Publică o versiune de tarif',
    publishAfterHead:
      'Noua versiune va urma ultimei versiuni publicate, {versionNumber}, a acestei oferte de serviciu.',
    publishFirst:
      'Noua versiune va fi prima pentru această ofertă de serviciu.',
    unit: 'Unitate',
    unitHelp: 'Folosiți între 1 și 24 de caractere.',
    unitAmount: 'Sumă unitară',
    unitAmountHelp:
      'Doar ilustrativ. Cel mult 7 cifre și 4 zecimale, mai mare decât zero, de exemplu 123.4500.',
    currency: 'Monedă',
    chooseCurrency: 'Alegeți o monedă',
    taxRatePercent: 'Cotă de taxă în procente',
    taxRatePercentHelp:
      'Doar ilustrativ, fără valabilitate fiscală. De la 0 la 100, cu cel mult 2 zecimale, de exemplu 12.34.',
    taxLabel: 'Denumirea taxei',
    taxLabelHelp: 'Folosiți între 1 și 60 de caractere.',
    effectiveFrom: 'Valabilă de la ({zone})',
    effectiveTo: 'Valabilă până la, opțional ({zone})',
    publish: 'Publică versiunea de tarif',
    published: 'Versiunea de tarif {versionNumber} a fost publicată.',
    unchanged:
      'Versiunea de tarif {versionNumber} are deja acest conținut. Nimic nu s-a schimbat.',
    invalidUnit: 'Introduceți o unitate de 1 până la 24 de caractere.',
    invalidUnitAmount:
      'Introduceți o sumă unitară mai mare decât zero, cu cel mult 7 cifre și 4 zecimale, fără spații, semne sau zerouri inițiale, de exemplu 123.4500.',
    invalidCurrency: 'Alegeți o monedă: MDL, EUR, RON sau USD.',
    invalidTaxRatePercent:
      'Introduceți o cotă de taxă de la 0 la 100, cu cel mult 2 zecimale, fără spații, semne sau zerouri inițiale, de exemplu 12.34.',
    invalidTaxLabel:
      'Introduceți o denumire a taxei de 1 până la 60 de caractere.',
    invalidWindow:
      'Introduceți un început și, opțional, un sfârșit ulterior începutului.',
    validation:
      'Verificați versiunea de tarif: fiecare valoare trebuie să respecte regula indicată sub câmpul său.',
    effectiveFromPast:
      'Alegeți un început care nu este anterior momentului curent.',
    effectiveFromNotAdvancing:
      'Alegeți un început ulterior începutului ultimei versiuni publicate.',
    windowGap:
      'Ultima versiune publicată se termină înainte de acest început. Alegeți un început cel târziu la sfârșitul ei sau așteptați să se termine.',
    versionExhausted: 'Nu mai poate fi alocat un număr de versiune de tarif.',
    idempotencyConflict:
      'Nimic nu a fost publicat cu această cerere: identificatorul fusese deja folosit pentru o altă cerere. Ciorna se păstrează și poate fi publicată din nou.',
    stale:
      'Oferta de serviciu s-a schimbat: versiunea {versionNumber} este acum ultima publicată. Reîncărcați înainte de a publica din nou.',
    staleNoHead:
      'Oferta de serviciu s-a schimbat: nu mai există o ultimă versiune publicată. Reîncărcați înainte de a publica din nou.',
    reload: 'Reîncarcă versiunile de tarif',
    uncertain:
      'Rezultatul publicării este incert. Reîncercați pentru a-l confirma: aceeași cerere este retrimisă și nu publică niciodată de două ori. Nicio altă versiune de tarif nu poate fi publicată până când rezultatul nu este cunoscut.',
    retryPublication: 'Reîncearcă publicarea tarifului',
    versionsTitle: 'Toate versiunile de tarif ale acestei oferte de serviciu',
    versionsList: 'Versiunile tarifului',
    versionsLoading: 'Se încarcă versiunile de tarif…',
    versionsEmpty: 'Nu a fost publicată încă nicio versiune de tarif.',
    versionsError: 'Versiunile de tarif nu au putut fi încărcate. Reîncercați.',
    versionsChanging:
      'Versiunile de tarif s-au schimbat în timpul încărcării. Reîncărcați pentru a vedea ultimele versiuni.',
    showOlder: 'Arată versiunile de tarif mai vechi',
    olderLoading: 'Se încarcă versiunile de tarif mai vechi…',
    olderError:
      'Versiunile de tarif mai vechi nu au putut fi încărcate. Reîncercați.',
    denied: 'Nu aveți permisiunea de a accesa versiunile de tarif.',
  },
  ru: {
    eyebrow: 'Настройка цен',
    title: 'Версии тарифа',
    companyPrefix: 'Компания:',
    noticeLabel: 'Предупреждение об иллюстративных версиях тарифа',
    illustrativeMarker: 'Иллюстративные тарифы: предварительные записи',
    illustrativeDetail:
      'Каждая версия тарифа здесь иллюстративна. Суммы не являются реальными ценами, единицы — реальными единицами, а налоговые ставки не имеют фискальной силы. Здесь ничего не конвертируется, не объединяется, не суммируется и цена не рассчитывается.',
    timeZone: 'Время вводится и отображается в часовом поясе браузера: {zone}.',
    offering: 'Предложение услуги Компании',
    chooseOffering: 'Выберите предложение услуги',
    offeringsLoading: 'Загрузка предложений услуг Компании…',
    offeringsError:
      'Не удалось загрузить предложения услуг Компании. Повторите попытку.',
    offeringsEmpty:
      'Для этой Компании ещё нет предложений услуг. Версии тарифа публикуются для каждого предложения.',
    reloadOfferings: 'Перезагрузить предложения услуг',
    showMoreOfferings: 'Показать ещё предложения услуг',
    moreOfferingsLoading: 'Загрузка дополнительных предложений услуг…',
    moreOfferingsError:
      'Не удалось загрузить дополнительные предложения услуг. Повторите попытку.',
    chooseOfferingPrompt:
      'Выберите предложение услуги для просмотра и публикации его версий тарифа. У каждого предложения свои версии, последняя опубликованная версия и расписание.',
    currentTitle: 'Текущая версия тарифа',
    currentLoading: 'Загрузка текущей версии тарифа…',
    noCurrent:
      'Нет текущей версии: сейчас ни одна версия тарифа этого предложения не действует.',
    head: 'Последняя опубликованная версия: {versionNumber}. Новая публикация следует за ней.',
    noHead:
      'Для этого предложения услуги ещё не опубликована ни одна версия тарифа.',
    scheduledTitle: 'Запланированные последующие версии тарифа',
    noScheduled: 'Последующие версии не запланированы.',
    takesOver: 'Вступает в силу с',
    versionName: 'Версия {versionNumber}',
    amount: '{unitAmount} {currency} за {unit}',
    taxRate: 'Налог {taxRatePercent}% ({taxLabel})',
    noFiscalValidity: 'без фискальной силы',
    window: 'Действует',
    from: 'с',
    until: 'до',
    openEnded: 'без указанного окончания',
    takenOverFrom: 'Заменена с',
    headMarker: 'Последняя опубликованная',
    provisionalMarker: 'Предварительно',
    stateScheduled: 'Запланирована',
    stateCurrent: 'Текущая',
    stateSuperseded: 'Заменена',
    provenanceIllustrative: 'Иллюстративная',
    publishTitle: 'Опубликовать версию тарифа',
    publishAfterHead:
      'Новая версия последует за последней опубликованной версией {versionNumber} этого предложения.',
    publishFirst: 'Новая версия будет первой для этого предложения.',
    unit: 'Единица',
    unitHelp: 'Используйте от 1 до 24 символов.',
    unitAmount: 'Сумма за единицу',
    unitAmountHelp:
      'Только иллюстрация. До 7 цифр и 4 десятичных знаков, больше нуля, например 123.4500.',
    currency: 'Валюта',
    chooseCurrency: 'Выберите валюту',
    taxRatePercent: 'Налоговая ставка в процентах',
    taxRatePercentHelp:
      'Только иллюстрация, без фискальной силы. От 0 до 100, до 2 десятичных знаков, например 12.34.',
    taxLabel: 'Название налога',
    taxLabelHelp: 'Используйте от 1 до 60 символов.',
    effectiveFrom: 'Действует с ({zone})',
    effectiveTo: 'Действует до, необязательно ({zone})',
    publish: 'Опубликовать версию тарифа',
    published: 'Версия тарифа {versionNumber} опубликована.',
    unchanged:
      'Версия тарифа {versionNumber} уже содержит эти данные. Ничего не изменилось.',
    invalidUnit: 'Введите единицу длиной от 1 до 24 символов.',
    invalidUnitAmount:
      'Введите сумму за единицу больше нуля, до 7 цифр и 4 десятичных знаков, без пробелов, знаков и начальных нулей, например 123.4500.',
    invalidCurrency: 'Выберите валюту: MDL, EUR, RON или USD.',
    invalidTaxRatePercent:
      'Введите налоговую ставку от 0 до 100, до 2 десятичных знаков, без пробелов, знаков и начальных нулей, например 12.34.',
    invalidTaxLabel: 'Введите название налога длиной от 1 до 60 символов.',
    invalidWindow:
      'Введите начало и, при необходимости, окончание позже начала.',
    validation:
      'Проверьте версию тарифа: каждое значение должно соответствовать правилу под его полем.',
    effectiveFromPast: 'Выберите начало не раньше текущего момента.',
    effectiveFromNotAdvancing:
      'Выберите начало позже начала последней опубликованной версии.',
    windowGap:
      'Последняя опубликованная версия заканчивается до этого начала. Выберите начало не позже её окончания или дождитесь её завершения.',
    versionExhausted: 'Невозможно выделить следующий номер версии тарифа.',
    idempotencyConflict:
      'По этому запросу ничего не опубликовано: его идентификатор уже использован для другого запроса. Черновик сохранён и может быть опубликован снова.',
    stale:
      'Предложение услуги изменилось: последняя опубликованная версия теперь {versionNumber}. Перезагрузите перед новой публикацией.',
    staleNoHead:
      'Предложение услуги изменилось: последней опубликованной версии больше нет. Перезагрузите перед новой публикацией.',
    reload: 'Перезагрузить версии тарифа',
    uncertain:
      'Результат публикации неизвестен. Повторите для подтверждения: отправляется тот же запрос без двойной публикации. До выяснения результата нельзя опубликовать другую версию тарифа.',
    retryPublication: 'Повторить публикацию тарифа',
    versionsTitle: 'Все версии тарифа этого предложения',
    versionsList: 'Версии тарифа',
    versionsLoading: 'Загрузка версий тарифа…',
    versionsEmpty: 'Ещё не опубликована ни одна версия тарифа.',
    versionsError: 'Не удалось загрузить версии тарифа. Повторите попытку.',
    versionsChanging:
      'Версии тарифа менялись во время загрузки. Перезагрузите для просмотра последних версий.',
    showOlder: 'Показать более ранние версии тарифа',
    olderLoading: 'Загрузка более ранних версий тарифа…',
    olderError:
      'Не удалось загрузить более ранние версии тарифа. Повторите попытку.',
    denied: 'У вас нет разрешения на доступ к версиям тарифа.',
  },
  fr: {
    eyebrow: 'Configuration de la tarification',
    title: 'Versions du tarif',
    companyPrefix: 'Compagnie :',
    noticeLabel: 'Avertissement sur les versions de tarif illustratives',
    illustrativeMarker: 'Tarifs illustratifs : enregistrements provisoires',
    illustrativeDetail:
      'Chaque version de tarif présentée est illustrative. Aucun montant n’est un prix réel, aucune unité n’est une unité réelle et aucun taux de taxe n’a de validité fiscale. Aucun montant n’est converti, combiné ou totalisé et aucun prix n’est calculé ici.',
    timeZone:
      'Les instants sont saisis et affichés dans le fuseau horaire du navigateur : {zone}.',
    offering: 'Prestation de la Compagnie',
    chooseOffering: 'Choisissez une prestation',
    offeringsLoading: 'Chargement des prestations de la Compagnie…',
    offeringsError:
      'Impossible de charger les prestations de la Compagnie. Réessayez.',
    offeringsEmpty:
      'Aucune prestation n’est encore enregistrée pour cette Compagnie. Les versions de tarif sont publiées par prestation.',
    reloadOfferings: 'Recharger les prestations',
    showMoreOfferings: 'Afficher d’autres prestations',
    moreOfferingsLoading: 'Chargement d’autres prestations…',
    moreOfferingsError:
      'Impossible de charger d’autres prestations. Réessayez.',
    chooseOfferingPrompt:
      'Choisissez une prestation pour consulter et publier ses versions de tarif. Chaque prestation a ses propres versions, dernière version publiée et échéances.',
    currentTitle: 'Version courante du tarif',
    currentLoading: 'Chargement de la version courante du tarif…',
    noCurrent:
      'Aucune version courante : aucune version de tarif de cette prestation n’est courante à cet instant.',
    head: 'Dernière version publiée : {versionNumber}. Une nouvelle publication suit cette version.',
    noHead:
      'Aucune version de tarif n’a encore été publiée pour cette prestation.',
    scheduledTitle: 'Versions de tarif successives programmées',
    noScheduled: 'Aucune version successive n’est programmée.',
    takesOver: 'Prend effet à partir du',
    versionName: 'Version {versionNumber}',
    amount: '{unitAmount} {currency} par {unit}',
    taxRate: 'Taxe {taxRatePercent}% ({taxLabel})',
    noFiscalValidity: 'sans validité fiscale',
    window: 'Valable',
    from: 'du',
    until: 'au',
    openEnded: 'sans fin déclarée',
    takenOverFrom: 'Remplacée à partir du',
    headMarker: 'Dernière publiée',
    provisionalMarker: 'Provisoire',
    stateScheduled: 'Programmée',
    stateCurrent: 'Courante',
    stateSuperseded: 'Remplacée',
    provenanceIllustrative: 'Illustrative',
    publishTitle: 'Publier une version de tarif',
    publishAfterHead:
      'La nouvelle version suivra la dernière version publiée, {versionNumber}, de cette prestation.',
    publishFirst: 'La nouvelle version sera la première pour cette prestation.',
    unit: 'Unité',
    unitHelp: 'Utilisez de 1 à 24 caractères.',
    unitAmount: 'Montant unitaire',
    unitAmountHelp:
      'Illustratif uniquement. Jusqu’à 7 chiffres et 4 décimales, strictement positif, par exemple 123.4500.',
    currency: 'Devise',
    chooseCurrency: 'Choisissez une devise',
    taxRatePercent: 'Taux de taxe en pourcentage',
    taxRatePercentHelp:
      'Illustratif uniquement, sans validité fiscale. De 0 à 100 avec au plus 2 décimales, par exemple 12.34.',
    taxLabel: 'Libellé de taxe',
    taxLabelHelp: 'Utilisez de 1 à 60 caractères.',
    effectiveFrom: 'Valable à partir du ({zone})',
    effectiveTo: 'Valable jusqu’au, facultatif ({zone})',
    publish: 'Publier la version de tarif',
    published: 'Version de tarif {versionNumber} publiée.',
    unchanged:
      'La version de tarif {versionNumber} contient déjà ces données. Rien n’a changé.',
    invalidUnit: 'Saisissez une unité de 1 à 24 caractères.',
    invalidUnitAmount:
      'Saisissez un montant unitaire strictement positif, jusqu’à 7 chiffres et 4 décimales, sans espaces, signes ni zéros initiaux, par exemple 123.4500.',
    invalidCurrency: 'Choisissez une devise : MDL, EUR, RON ou USD.',
    invalidTaxRatePercent:
      'Saisissez un taux de taxe de 0 à 100 avec au plus 2 décimales, sans espaces, signes ni zéros initiaux, par exemple 12.34.',
    invalidTaxLabel: 'Saisissez un libellé de taxe de 1 à 60 caractères.',
    invalidWindow:
      'Saisissez un début et, facultativement, une fin postérieure au début.',
    validation:
      'Vérifiez la version de tarif : chaque valeur doit respecter la règle indiquée sous son champ.',
    effectiveFromPast:
      'Choisissez un début qui ne précède pas l’instant présent.',
    effectiveFromNotAdvancing:
      'Choisissez un début postérieur au début de la dernière version publiée.',
    windowGap:
      'La dernière version publiée se termine avant ce début. Choisissez un début au plus tard à sa fin ou attendez qu’elle soit terminée.',
    versionExhausted:
      'Aucun autre numéro de version de tarif ne peut être attribué.',
    idempotencyConflict:
      'Rien n’a été publié avec cette requête : son identifiant avait déjà été utilisé pour une autre requête. Votre brouillon est conservé et peut être publié à nouveau.',
    stale:
      'La prestation a changé : la version {versionNumber} est désormais la dernière publiée. Rechargez avant de publier à nouveau.',
    staleNoHead:
      'La prestation a changé : il n’y a plus de dernière version publiée. Rechargez avant de publier à nouveau.',
    reload: 'Recharger les versions de tarif',
    uncertain:
      'Le résultat de la publication est incertain. Réessayez pour le confirmer : la même requête est renvoyée sans jamais publier deux fois. Aucune autre version de tarif ne peut être publiée tant que le résultat est inconnu.',
    retryPublication: 'Réessayer la publication du tarif',
    versionsTitle: 'Toutes les versions de tarif de cette prestation',
    versionsList: 'Versions du tarif',
    versionsLoading: 'Chargement des versions de tarif…',
    versionsEmpty: 'Aucune version de tarif n’a encore été publiée.',
    versionsError: 'Impossible de charger les versions de tarif. Réessayez.',
    versionsChanging:
      'Les versions de tarif ont continué à changer pendant le chargement. Rechargez pour voir les dernières versions.',
    showOlder: 'Afficher les versions de tarif plus anciennes',
    olderLoading: 'Chargement des versions de tarif plus anciennes…',
    olderError:
      'Impossible de charger les versions de tarif plus anciennes. Réessayez.',
    denied: 'Vous n’avez pas l’autorisation d’accéder aux versions de tarif.',
  },
  en: {
    eyebrow: 'Pricing Configuration',
    title: 'Tariff Versions',
    companyPrefix: 'Company:',
    noticeLabel: 'Illustrative Tariff Versions notice',
    illustrativeMarker: 'Illustrative tariffs: provisional records',
    illustrativeDetail:
      'Every Tariff Version here is illustrative. No amount is a real price, no unit is a real unit and no tax rate has fiscal validity. Nothing here converts, combines or totals amounts, and nothing here calculates a price.',
    timeZone:
      'Instants are entered and shown in your browser time zone: {zone}.',
    offering: 'Company Service Offering',
    chooseOffering: 'Choose an offering',
    offeringsLoading: 'Loading Company Service Offerings…',
    offeringsError:
      'Company Service Offerings could not be loaded. Please try again.',
    offeringsEmpty:
      'No Company Service Offering is recorded for this Company yet. Tariff Versions are published per offering.',
    reloadOfferings: 'Reload offerings',
    showMoreOfferings: 'Show more offerings',
    moreOfferingsLoading: 'Loading more offerings…',
    moreOfferingsError: 'More offerings could not be loaded. Please try again.',
    chooseOfferingPrompt:
      'Choose an offering to see and publish its Tariff Versions. Each offering has its own versions, head and schedule.',
    currentTitle: 'Current Tariff Version',
    currentLoading: 'Loading the current Tariff Version…',
    noCurrent:
      'No current version: no Tariff Version of this offering is current at this instant.',
    head: 'Head: version {versionNumber}. A new publication follows this version.',
    noHead: 'No Tariff Version has been published for this offering yet.',
    scheduledTitle: 'Scheduled Tariff successors',
    noScheduled: 'No successor is scheduled.',
    takesOver: 'Takes over from',
    versionName: 'Version {versionNumber}',
    amount: '{unitAmount} {currency} per {unit}',
    taxRate: 'Tax {taxRatePercent}% ({taxLabel})',
    noFiscalValidity: 'no fiscal validity',
    window: 'Effective',
    from: 'from',
    until: 'until',
    openEnded: 'with no declared end',
    takenOverFrom: 'Taken over from',
    headMarker: 'Head',
    provisionalMarker: 'Provisional',
    stateScheduled: 'Scheduled',
    stateCurrent: 'Current',
    stateSuperseded: 'Superseded',
    provenanceIllustrative: 'Illustrative',
    publishTitle: 'Publish a Tariff Version',
    publishAfterHead:
      'The new version will follow head version {versionNumber} of this offering.',
    publishFirst: 'The new version will be the first for this offering.',
    unit: 'Unit',
    unitHelp: 'Use 1 to 24 characters.',
    unitAmount: 'Unit amount',
    unitAmountHelp:
      'Illustrative only. Up to 7 digits and 4 decimals, greater than zero, such as 123.4500.',
    currency: 'Currency',
    chooseCurrency: 'Choose a currency',
    taxRatePercent: 'Tax rate percent',
    taxRatePercentHelp:
      'Illustrative only, with no fiscal validity. From 0 to 100 with up to 2 decimals, such as 12.34.',
    taxLabel: 'Tax label',
    taxLabelHelp: 'Use 1 to 60 characters.',
    effectiveFrom: 'Effective from ({zone})',
    effectiveTo: 'Effective until, optional ({zone})',
    publish: 'Publish Tariff Version',
    published: 'Tariff Version {versionNumber} published.',
    unchanged:
      'Tariff Version {versionNumber} already has this content. Nothing changed.',
    invalidUnit: 'Enter a unit of 1 to 24 characters.',
    invalidUnitAmount:
      'Enter a unit amount greater than zero with up to 7 digits and 4 decimals, without spaces, signs or leading zeros, such as 123.4500.',
    invalidCurrency: 'Choose a currency: MDL, EUR, RON or USD.',
    invalidTaxRatePercent:
      'Enter a tax rate from 0 to 100 with up to 2 decimals, without spaces, signs or leading zeros, such as 12.34.',
    invalidTaxLabel: 'Enter a tax label of 1 to 60 characters.',
    invalidWindow: 'Enter a start, and an optional end later than the start.',
    validation:
      'Check the Tariff Version: every value must follow the rule shown below its field.',
    effectiveFromPast: 'Choose a start that is not earlier than now.',
    effectiveFromNotAdvancing:
      'Choose a start later than the start of the head version.',
    windowGap:
      'The head version ends before this start. Choose a start no later than its end, or wait until it has ended.',
    versionExhausted: 'No further Tariff Version number can be allocated.',
    idempotencyConflict:
      'Nothing was published with that request: its identifier had already been used for a different request. Your draft is kept and can be published again.',
    stale:
      'The offering changed: version {versionNumber} is now the head. Reload before publishing again.',
    staleNoHead:
      'The offering changed: no version is the head any more. Reload before publishing again.',
    reload: 'Reload Tariff Versions',
    uncertain:
      'The publication outcome is uncertain. Retry to confirm it: the same request is sent again and never publishes twice. No other Tariff Version can be published until its outcome is known.',
    retryPublication: 'Retry Tariff publication',
    versionsTitle: 'All Tariff Versions of this offering',
    versionsList: 'Tariff Versions',
    versionsLoading: 'Loading Tariff Versions…',
    versionsEmpty: 'No Tariff Version has been published yet.',
    versionsError: 'Tariff Versions could not be loaded. Please try again.',
    versionsChanging:
      'Tariff Versions kept changing while loading. Reload to see the latest versions.',
    showOlder: 'Show older Tariff Versions',
    olderLoading: 'Loading older Tariff Versions…',
    olderError: 'Older Tariff Versions could not be loaded. Please try again.',
    denied: 'You do not have permission to access Tariff Versions.',
  },
});

function createCopy(
  message: (key: Key) => string,
  formatNumber: (value: number) => string,
  formatDecimal: (value: string) => string,
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
    offering: message('offering'),
    chooseOffering: message('chooseOffering'),
    offeringsLoading: message('offeringsLoading'),
    offeringsError: message('offeringsError'),
    offeringsEmpty: message('offeringsEmpty'),
    reloadOfferings: message('reloadOfferings'),
    showMoreOfferings: message('showMoreOfferings'),
    moreOfferingsLoading: message('moreOfferingsLoading'),
    moreOfferingsError: message('moreOfferingsError'),
    chooseOfferingPrompt: message('chooseOfferingPrompt'),
    currentTitle: message('currentTitle'),
    currentLoading: message('currentLoading'),
    noCurrent: message('noCurrent'),
    noHead: message('noHead'),
    scheduledTitle: message('scheduledTitle'),
    noScheduled: message('noScheduled'),
    takesOver: message('takesOver'),
    noFiscalValidity: message('noFiscalValidity'),
    window: message('window'),
    from: message('from'),
    until: message('until'),
    openEnded: message('openEnded'),
    takenOverFrom: message('takenOverFrom'),
    headMarker: message('headMarker'),
    provisionalMarker: message('provisionalMarker'),
    publishTitle: message('publishTitle'),
    publishFirst: message('publishFirst'),
    unit: message('unit'),
    unitHelp: message('unitHelp'),
    unitAmount: message('unitAmount'),
    unitAmountHelp: message('unitAmountHelp'),
    currency: message('currency'),
    chooseCurrency: message('chooseCurrency'),
    taxRatePercent: message('taxRatePercent'),
    taxRatePercentHelp: message('taxRatePercentHelp'),
    taxLabel: message('taxLabel'),
    taxLabelHelp: message('taxLabelHelp'),
    publish: message('publish'),
    validation: message('validation'),
    effectiveFromPast: message('effectiveFromPast'),
    effectiveFromNotAdvancing: message('effectiveFromNotAdvancing'),
    windowGap: message('windowGap'),
    versionExhausted: message('versionExhausted'),
    idempotencyConflict: message('idempotencyConflict'),
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
    timeZone: (zone: string) => formatMessage(message('timeZone'), { zone }),
    offeringOption: ({
      name,
      code,
      commercialLabel,
    }: {
      name: string;
      code: string;
      commercialLabel: string | null;
    }) =>
      commercialLabel === null
        ? `${name} (${code})`
        : `${name} (${code}) — ${commercialLabel}`,
    head: (versionNumber: number) => version('head', versionNumber),
    versionName: (versionNumber: number) =>
      version('versionName', versionNumber),
    amount: ({
      unitAmount,
      currency,
      unit,
    }: {
      unitAmount: string;
      currency: string;
      unit: string;
    }) =>
      formatMessage(message('amount'), {
        unitAmount: formatDecimal(unitAmount),
        currency,
        unit,
      }),
    taxRate: ({
      taxRatePercent,
      taxLabel,
    }: {
      taxRatePercent: string;
      taxLabel: string;
    }) =>
      formatMessage(message('taxRate'), {
        taxRatePercent: formatDecimal(taxRatePercent),
        taxLabel,
      }),
    stateLabels: {
      SCHEDULED: message('stateScheduled'),
      CURRENT: message('stateCurrent'),
      SUPERSEDED: message('stateSuperseded'),
    },
    provenanceLabels: { ILLUSTRATIVE: message('provenanceIllustrative') },
    publishAfterHead: (versionNumber: number) =>
      version('publishAfterHead', versionNumber),
    effectiveFrom: (zone: string) =>
      formatMessage(message('effectiveFrom'), { zone }),
    effectiveTo: (zone: string) =>
      formatMessage(message('effectiveTo'), { zone }),
    published: (versionNumber: number) => version('published', versionNumber),
    unchanged: (versionNumber: number) => version('unchanged', versionNumber),
    invalid: {
      unit: message('invalidUnit'),
      unitAmount: message('invalidUnitAmount'),
      currency: message('invalidCurrency'),
      taxRatePercent: message('invalidTaxRatePercent'),
      taxLabel: message('invalidTaxLabel'),
      window: message('invalidWindow'),
    },
    stale: (headVersionNumber: number | null) =>
      headVersionNumber === null
        ? message('staleNoHead')
        : version('stale', headVersionNumber),
  };
}

// Historical imports retain their exact English compatibility contract.
export const tariffVersionCopy = createCopy(
  (key) => resolveMessage(tariffVersionMessages, 'en', key),
  String,
  (value) => value,
);

export function useTariffVersionCopy() {
  const message = useMessages(tariffVersionMessages);
  const { locale, formatNumber } = useInterfaceLocale();
  const formatter = new Intl.NumberFormat(locale);
  const decimal =
    formatter.formatToParts(1.1).find((part) => part.type === 'decimal')
      ?.value ?? '.';
  return createCopy(message, formatNumber, (value) => {
    // Validated decimal strings retain every fractional digit. Only the whole
    // part is formatted as BigInt; monetary/rate values never pass through Number.
    const [whole, fraction] = value.split('.');
    return `${formatter.format(BigInt(whole))}${fraction === undefined ? '' : decimal + fraction}`;
  });
}
