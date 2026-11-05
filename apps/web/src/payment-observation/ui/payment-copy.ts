import type { PaymentAction, PaymentFact } from '../payment.types';

export type PaymentLocale = 'ro' | 'ru' | 'fr' | 'en';

const en = {
  title: 'Manual incoming Payment observations',
  manualNotice:
    'These records preserve human declarations and reviews. They do not establish settlement, authenticity of evidence or distinct external payments.',
  allocationNotice: 'Allocation is not tracked by this capability.',
  newObservation: 'New manual observation',
  selectSource: 'Select an authorized exact source',
  loadMore: 'Load more',
  reload: 'Reload and review',
  history: 'Immutable history',
  create: 'Record observation',
  correct: 'Correct draft',
  withdraw: 'Withdraw draft observation',
  confirm: 'Confirm reviewed observation',
  reverse: 'Reverse recorded observation',
  replace: 'Create a linked corrected replacement',
  reason: 'Literal reason',
  confirmationNote: 'Literal review note',
  acknowledgeObserved:
    'I declare one manually observed incoming Payment for the displayed payer, using this exact source and these values.',
  acknowledgeReviewed:
    'I reviewed this exact displayed revision and explicitly confirm this manual observation.',
  retrySame: 'Retry identical command',
  retryRead: 'Retry read',
  loading: 'Loading…',
  empty: 'No manual Payment observations.',
  unavailable: 'Unavailable with current access.',
  conflict:
    'The command conflicts with current data. Deliberately reload and review before starting a new command.',
  uncertain:
    'The outcome is uncertain. The exact intention and key are retained. Only an identical retry is available.',
  saved: 'The command was durably recorded.',
  invalid:
    'Review the literal values, positive amount, currency, calendar date and required acknowledgement or reason.',
  error:
    'The requested information could not be safely read. Retry deliberately.',
  back: 'Back to observations',
  download: 'Download exact source PDF',
  source: 'Exact preserved source',
  values: 'Declared observation values',
  amount: 'Declared amount',
  currency: 'Currency',
  chooseCurrency: 'Choose currency',
  effectiveOn: 'Declared effective date',
  method: 'Declared payment method',
  externalReference: 'External reference (optional)',
  observationBasis: 'What was observed',
  moneyHelp:
    'Enter a strictly positive amount with at most two decimal places and explicitly select a currency. No amount is inferred from the PDF.',
  referenceHelp: 'Leave empty when no external reference was recorded.',
  state: 'Recorded state',
  revision: 'Revision',
  company: 'Receiving Company — frozen copy',
  payer: 'Payer — frozen copy',
  primary: 'Primary legal identity',
  additional: 'Additional legal entity',
  taxId: 'Tax identifier',
  legalAddress: 'Legal address',
  createdAt: 'Initially recorded',
  recordedAt: 'Recorded at',
  actor: 'Recorded by',
  notRecorded: 'Not recorded',
  confirmation: 'Preserved human confirmation',
  reviewedBy: 'Confirmed by',
  reviewedAt: 'Confirmed at',
  before: 'Before',
  after: 'After',
  lineage: 'Corrected replacement history',
  replacesClosedPayment:
    'This observation explicitly replaces a closed observation.',
  replacementPayment: 'A direct corrected replacement has been recorded.',
  noPredecessor: 'No preceding observation.',
  noReplacement: 'No direct replacement recorded.',
  version: 'Source Version',
  fileName: 'Preserved PDF filename',
  byteLength: 'Exact PDF size in bytes',
  sha256: 'Exact PDF SHA-256',
  sourceEmpty: 'No eligible exact sources are available.',
  official: 'Official frozen content',
  superseded: 'Superseded frozen content',
  cancel: 'Cancel',
  saving: 'Recording…',
  close: 'Close',
  correctionMeaning:
    'Only the draft values change. The copied payer, exact source and previous revisions are preserved.',
  withdrawalMeaning:
    'Withdrawal closes this unconfirmed PRISMA observation. It does not execute a refund.',
  confirmationMeaning:
    'Confirmation records a separate human review of the exact displayed revision.',
  reversalMeaning:
    'Reversal closes this recorded observation and preserves its amount, source and original confirmation. It does not execute a bank refund.',
  replacementMeaning:
    'The new draft is explicitly linked to the closed observation. Both observations and their histories remain available.',
  historyChanged:
    'The observation changed. Reload before continuing its history.',
  refreshFailed:
    'The command is recorded, but its refreshed detail is unavailable. Retry only the read.',
  noChange: 'Change at least one draft value before recording a correction.',
  states: {
    DRAFT: 'Draft observation',
    CONFIRMED: 'Human-confirmed observation',
    WITHDRAWN: 'Withdrawn draft observation',
    REVERSED: 'Reversed recorded observation',
  } satisfies Record<PaymentFact['state'], string>,
  actions: {
    CREATE: 'Manual observation recorded',
    CORRECT_DRAFT: 'Draft values corrected',
    WITHDRAW_DRAFT: 'Draft observation withdrawn',
    CONFIRM: 'Human review confirmed',
    REVERSE: 'Recorded observation reversed',
  } satisfies Record<PaymentAction, string>,
};

type PaymentMessages = {
  [Key in keyof Omit<typeof en, 'states' | 'actions'>]: string;
} & {
  states: Record<PaymentFact['state'], string>;
  actions: Record<PaymentAction, string>;
};

export const paymentCopy = {
  en,
  ro: {
    title: 'Observații manuale privind încasările',
    manualNotice:
      'Aceste înregistrări păstrează declarații și revizuiri umane. Ele nu confirmă decontarea, autenticitatea dovezii sau existența unor plăți externe distincte.',
    allocationNotice: 'Această funcționalitate nu urmărește alocarea plăților.',
    newObservation: 'Observație manuală nouă',
    selectSource: 'Selectați o sursă exactă autorizată',
    loadMore: 'Încărcați mai multe',
    reload: 'Reîncărcați și revizuiți',
    history: 'Istoric nemodificabil',
    create: 'Înregistrați observația',
    correct: 'Corectați ciorna',
    withdraw: 'Retrageți observația în ciornă',
    confirm: 'Confirmați observația revizuită',
    reverse: 'Reversați observația înregistrată',
    replace: 'Creați un înlocuitor corectat și legat explicit',
    reason: 'Motivul exact',
    confirmationNote: 'Nota exactă de revizuire',
    acknowledgeObserved:
      'Declar o plată de intrare observată manual pentru plătitorul afișat, folosind această sursă exactă și aceste valori.',
    acknowledgeReviewed:
      'Am revizuit exact revizia afișată și confirm explicit această observație manuală.',
    retrySame: 'Reîncercați comanda identică',
    retryRead: 'Reîncercați citirea',
    loading: 'Se încarcă…',
    empty: 'Nu există observații manuale privind plățile.',
    unavailable: 'Indisponibil cu accesul actual.',
    conflict:
      'Comanda intră în conflict cu datele actuale. Reîncărcați și revizuiți explicit înainte de o comandă nouă.',
    uncertain:
      'Rezultatul este incert. Intenția exactă și cheia sunt păstrate. Este disponibilă numai reîncercarea identică.',
    saved: 'Comanda a fost înregistrată durabil.',
    invalid:
      'Verificați valorile exacte, suma pozitivă, moneda, data calendaristică și confirmarea sau motivul necesar.',
    error:
      'Informațiile solicitate nu au putut fi citite în siguranță. Reîncercați explicit.',
    back: 'Înapoi la observații',
    download: 'Descărcați PDF-ul sursă exact',
    source: 'Sursa exactă păstrată',
    values: 'Valorile declarate ale observației',
    amount: 'Suma declarată',
    currency: 'Moneda',
    chooseCurrency: 'Selectați moneda',
    effectiveOn: 'Data efectivă declarată',
    method: 'Metoda de plată declarată',
    externalReference: 'Referința externă (opțional)',
    observationBasis: 'Ce a fost observat',
    moneyHelp:
      'Introduceți o sumă strict pozitivă cu cel mult două zecimale și selectați explicit moneda. Nicio sumă nu este dedusă din PDF.',
    referenceHelp:
      'Lăsați necompletat dacă nu a fost înregistrată o referință externă.',
    state: 'Starea înregistrată',
    revision: 'Revizia',
    company: 'Compania destinatară — copie păstrată',
    payer: 'Plătitorul — copie păstrată',
    primary: 'Identitatea juridică principală',
    additional: 'Entitatea juridică suplimentară',
    taxId: 'Identificatorul fiscal',
    legalAddress: 'Adresa juridică',
    createdAt: 'Înregistrată inițial',
    recordedAt: 'Momentul înregistrării',
    actor: 'Înregistrată de',
    notRecorded: 'Neînregistrat',
    confirmation: 'Confirmarea umană păstrată',
    reviewedBy: 'Confirmată de',
    reviewedAt: 'Momentul confirmării',
    before: 'Înainte',
    after: 'După',
    lineage: 'Istoricul înlocuirii corectate',
    replacesClosedPayment:
      'Această observație înlocuiește explicit o observație închisă.',
    replacementPayment: 'A fost înregistrat un înlocuitor direct corectat.',
    noPredecessor: 'Nu există o observație precedentă.',
    noReplacement: 'Nu este înregistrat un înlocuitor direct.',
    version: 'Versiunea sursei',
    fileName: 'Numele PDF-ului păstrat',
    byteLength: 'Dimensiunea exactă a PDF-ului în octeți',
    sha256: 'SHA-256 exact al PDF-ului',
    sourceEmpty: 'Nu există surse exacte eligibile disponibile.',
    official: 'Conținut oficial păstrat',
    superseded: 'Conținut înlocuit păstrat',
    cancel: 'Anulați',
    saving: 'Se înregistrează…',
    close: 'Închideți',
    correctionMeaning:
      'Se schimbă numai valorile ciornei. Plătitorul copiat, sursa exactă și reviziile anterioare sunt păstrate.',
    withdrawalMeaning:
      'Retragerea închide această observație PRISMA neconfirmată. Nu execută o rambursare.',
    confirmationMeaning:
      'Confirmarea înregistrează o revizuire umană separată a reviziei exacte afișate.',
    reversalMeaning:
      'Reversarea închide această observație înregistrată și păstrează suma, sursa și confirmarea inițială. Nu execută o rambursare bancară.',
    replacementMeaning:
      'Noua ciornă este legată explicit de observația închisă. Ambele observații și istoricurile lor rămân disponibile.',
    historyChanged:
      'Observația s-a schimbat. Reîncărcați înainte de a continua istoricul.',
    refreshFailed:
      'Comanda este înregistrată, dar detaliile reîncărcate sunt indisponibile. Reîncercați numai citirea.',
    noChange:
      'Schimbați cel puțin o valoare a ciornei înainte de a înregistra corecția.',
    states: {
      DRAFT: 'Observație în ciornă',
      CONFIRMED: 'Observație confirmată de o persoană',
      WITHDRAWN: 'Observație în ciornă retrasă',
      REVERSED: 'Observație înregistrată reversată',
    },
    actions: {
      CREATE: 'Observație manuală înregistrată',
      CORRECT_DRAFT: 'Valorile ciornei corectate',
      WITHDRAW_DRAFT: 'Observație în ciornă retrasă',
      CONFIRM: 'Revizuire umană confirmată',
      REVERSE: 'Observație înregistrată reversată',
    },
  },
  ru: {
    title: 'Ручные наблюдения о поступлениях',
    manualNotice:
      'Эти записи сохраняют заявления и проверки людей. Они не подтверждают расчёт, подлинность доказательства или наличие отдельных внешних платежей.',
    allocationNotice: 'Распределение платежей в этой функции не отслеживается.',
    newObservation: 'Новое ручное наблюдение',
    selectSource: 'Выберите разрешённый точный источник',
    loadMore: 'Загрузить ещё',
    reload: 'Перезагрузить и проверить',
    history: 'Неизменяемая история',
    create: 'Записать наблюдение',
    correct: 'Исправить черновик',
    withdraw: 'Отозвать черновик наблюдения',
    confirm: 'Подтвердить проверенное наблюдение',
    reverse: 'Сторнировать записанное наблюдение',
    replace: 'Создать явно связанную исправленную замену',
    reason: 'Точная формулировка причины',
    confirmationNote: 'Точная заметка о проверке',
    acknowledgeObserved:
      'Я заявляю об одном вручную наблюдаемом входящем платеже от указанного плательщика, используя этот точный источник и эти значения.',
    acknowledgeReviewed:
      'Я проверил именно показанную редакцию и явно подтверждаю это ручное наблюдение.',
    retrySame: 'Повторить идентичную команду',
    retryRead: 'Повторить чтение',
    loading: 'Загрузка…',
    empty: 'Ручных наблюдений о платежах нет.',
    unavailable: 'Недоступно при текущем доступе.',
    conflict:
      'Команда конфликтует с текущими данными. Перед новой командой явно перезагрузите и проверьте запись.',
    uncertain:
      'Результат неизвестен. Точное намерение и ключ сохранены. Доступен только идентичный повтор.',
    saved: 'Команда надёжно записана.',
    invalid:
      'Проверьте точные значения, положительную сумму, валюту, календарную дату и обязательное подтверждение или причину.',
    error:
      'Не удалось безопасно прочитать запрошенные сведения. Повторите чтение явно.',
    back: 'Назад к наблюдениям',
    download: 'Скачать точный исходный PDF',
    source: 'Точный сохранённый источник',
    values: 'Заявленные значения наблюдения',
    amount: 'Заявленная сумма',
    currency: 'Валюта',
    chooseCurrency: 'Выберите валюту',
    effectiveOn: 'Заявленная дата поступления',
    method: 'Заявленный способ платежа',
    externalReference: 'Внешняя ссылка или номер (необязательно)',
    observationBasis: 'Что было замечено',
    moneyHelp:
      'Введите строго положительную сумму с не более чем двумя знаками после запятой и явно выберите валюту. Сумма не извлекается из PDF.',
    referenceHelp:
      'Оставьте поле пустым, если внешняя ссылка или номер не были записаны.',
    state: 'Записанное состояние',
    revision: 'Редакция',
    company: 'Компания-получатель — сохранённая копия',
    payer: 'Плательщик — сохранённая копия',
    primary: 'Основные юридические сведения',
    additional: 'Дополнительное юридическое лицо',
    taxId: 'Налоговый идентификатор',
    legalAddress: 'Юридический адрес',
    createdAt: 'Первичная запись',
    recordedAt: 'Время записи',
    actor: 'Кем записано',
    notRecorded: 'Не записано',
    confirmation: 'Сохранённое подтверждение человека',
    reviewedBy: 'Кем подтверждено',
    reviewedAt: 'Время подтверждения',
    before: 'До',
    after: 'После',
    lineage: 'История исправленной замены',
    replacesClosedPayment: 'Это наблюдение явно заменяет закрытое наблюдение.',
    replacementPayment: 'Записана прямая исправленная замена.',
    noPredecessor: 'Предыдущего наблюдения нет.',
    noReplacement: 'Прямая замена не записана.',
    version: 'Версия источника',
    fileName: 'Имя сохранённого PDF',
    byteLength: 'Точный размер PDF в байтах',
    sha256: 'Точный SHA-256 PDF',
    sourceEmpty: 'Доступных подходящих точных источников нет.',
    official: 'Официальное зафиксированное содержимое',
    superseded: 'Заменённое зафиксированное содержимое',
    cancel: 'Отмена',
    saving: 'Запись…',
    close: 'Закрыть',
    correctionMeaning:
      'Изменяются только значения черновика. Скопированные сведения о плательщике, точный источник и предыдущие редакции сохраняются.',
    withdrawalMeaning:
      'Отзыв закрывает это неподтверждённое наблюдение PRISMA. Возврат средств не выполняется.',
    confirmationMeaning:
      'Подтверждение записывает отдельную проверку человеком именно показанной редакции.',
    reversalMeaning:
      'Сторнирование закрывает это записанное наблюдение и сохраняет сумму, источник и исходное подтверждение. Банковский возврат не выполняется.',
    replacementMeaning:
      'Новый черновик явно связан с закрытым наблюдением. Оба наблюдения и их истории остаются доступными.',
    historyChanged:
      'Наблюдение изменилось. Перезагрузите его перед продолжением истории.',
    refreshFailed:
      'Команда записана, но обновлённые сведения недоступны. Повторите только чтение.',
    noChange:
      'Измените хотя бы одно значение черновика перед записью исправления.',
    states: {
      DRAFT: 'Черновик наблюдения',
      CONFIRMED: 'Наблюдение подтверждено человеком',
      WITHDRAWN: 'Черновик наблюдения отозван',
      REVERSED: 'Записанное наблюдение сторнировано',
    },
    actions: {
      CREATE: 'Ручное наблюдение записано',
      CORRECT_DRAFT: 'Значения черновика исправлены',
      WITHDRAW_DRAFT: 'Черновик наблюдения отозван',
      CONFIRM: 'Проверка человеком подтверждена',
      REVERSE: 'Записанное наблюдение сторнировано',
    },
  },
  fr: {
    title: 'Observations manuelles d’encaissement',
    manualNotice:
      'Ces enregistrements conservent des déclarations et des revues humaines. Ils n’établissent ni le règlement, ni l’authenticité de la preuve, ni l’existence de paiements externes distincts.',
    allocationNotice:
      'Cette fonctionnalité ne suit pas l’affectation des paiements.',
    newObservation: 'Nouvelle observation manuelle',
    selectSource: 'Choisir une source exacte autorisée',
    loadMore: 'Charger la suite',
    reload: 'Recharger et examiner',
    history: 'Historique immuable',
    create: 'Enregistrer l’observation',
    correct: 'Corriger le brouillon',
    withdraw: 'Retirer l’observation en brouillon',
    confirm: 'Confirmer l’observation examinée',
    reverse: 'Contrepasser l’observation enregistrée',
    replace: 'Créer un remplacement corrigé explicitement lié',
    reason: 'Motif exact',
    confirmationNote: 'Note exacte de revue',
    acknowledgeObserved:
      'Je déclare un paiement entrant observé manuellement pour le payeur affiché, à partir de cette source exacte et de ces valeurs.',
    acknowledgeReviewed:
      'J’ai examiné cette révision exacte affichée et je confirme explicitement cette observation manuelle.',
    retrySame: 'Réessayer la commande identique',
    retryRead: 'Réessayer la lecture',
    loading: 'Chargement…',
    empty: 'Aucune observation manuelle de paiement.',
    unavailable: 'Indisponible avec les accès actuels.',
    conflict:
      'La commande entre en conflit avec les données actuelles. Rechargez et examinez explicitement avant une nouvelle commande.',
    uncertain:
      'Le résultat est incertain. L’intention exacte et la clé sont conservées. Seul un nouvel essai identique est disponible.',
    saved: 'La commande a été enregistrée durablement.',
    invalid:
      'Vérifiez les valeurs exactes, le montant positif, la devise, la date et l’acquiescement ou le motif requis.',
    error:
      'Les informations demandées n’ont pas pu être lues de manière sûre. Réessayez explicitement.',
    back: 'Retour aux observations',
    download: 'Télécharger le PDF source exact',
    source: 'Source exacte conservée',
    values: 'Valeurs déclarées de l’observation',
    amount: 'Montant déclaré',
    currency: 'Devise',
    chooseCurrency: 'Choisir une devise',
    effectiveOn: 'Date d’effet déclarée',
    method: 'Moyen de paiement déclaré',
    externalReference: 'Référence externe (facultative)',
    observationBasis: 'Ce qui a été observé',
    moneyHelp:
      'Saisissez un montant strictement positif avec au plus deux décimales et choisissez explicitement une devise. Aucun montant n’est déduit du PDF.',
    referenceHelp:
      'Laissez vide si aucune référence externe n’a été enregistrée.',
    state: 'État enregistré',
    revision: 'Révision',
    company: 'Société bénéficiaire — copie conservée',
    payer: 'Payeur — copie conservée',
    primary: 'Identité juridique principale',
    additional: 'Entité juridique supplémentaire',
    taxId: 'Identifiant fiscal',
    legalAddress: 'Adresse juridique',
    createdAt: 'Enregistrement initial',
    recordedAt: 'Date d’enregistrement',
    actor: 'Enregistré par',
    notRecorded: 'Non enregistré',
    confirmation: 'Confirmation humaine conservée',
    reviewedBy: 'Confirmé par',
    reviewedAt: 'Date de confirmation',
    before: 'Avant',
    after: 'Après',
    lineage: 'Historique du remplacement corrigé',
    replacesClosedPayment:
      'Cette observation remplace explicitement une observation close.',
    replacementPayment: 'Un remplacement direct corrigé a été enregistré.',
    noPredecessor: 'Aucune observation précédente.',
    noReplacement: 'Aucun remplacement direct enregistré.',
    version: 'Version de la source',
    fileName: 'Nom du PDF conservé',
    byteLength: 'Taille exacte du PDF en octets',
    sha256: 'SHA-256 exact du PDF',
    sourceEmpty: 'Aucune source exacte admissible n’est disponible.',
    official: 'Contenu officiel figé',
    superseded: 'Ancien contenu officiel figé',
    cancel: 'Annuler',
    saving: 'Enregistrement…',
    close: 'Fermer',
    correctionMeaning:
      'Seules les valeurs du brouillon changent. Le payeur copié, la source exacte et les révisions précédentes sont conservés.',
    withdrawalMeaning:
      'Le retrait clôt cette observation PRISMA non confirmée. Il n’exécute aucun remboursement.',
    confirmationMeaning:
      'La confirmation enregistre une revue humaine distincte de la révision exacte affichée.',
    reversalMeaning:
      'La contrepassation clôt cette observation enregistrée et conserve le montant, la source et la confirmation initiale. Elle n’exécute aucun remboursement bancaire.',
    replacementMeaning:
      'Le nouveau brouillon est explicitement lié à l’observation close. Les deux observations et leurs historiques restent disponibles.',
    historyChanged:
      'L’observation a changé. Rechargez avant de poursuivre l’historique.',
    refreshFailed:
      'La commande est enregistrée, mais le détail actualisé est indisponible. Réessayez uniquement la lecture.',
    noChange:
      'Modifiez au moins une valeur du brouillon avant d’enregistrer une correction.',
    states: {
      DRAFT: 'Observation en brouillon',
      CONFIRMED: 'Observation confirmée par une personne',
      WITHDRAWN: 'Observation en brouillon retirée',
      REVERSED: 'Observation enregistrée contrepassée',
    },
    actions: {
      CREATE: 'Observation manuelle enregistrée',
      CORRECT_DRAFT: 'Valeurs du brouillon corrigées',
      WITHDRAW_DRAFT: 'Observation en brouillon retirée',
      CONFIRM: 'Revue humaine confirmée',
      REVERSE: 'Observation enregistrée contrepassée',
    },
  },
} satisfies Record<PaymentLocale, PaymentMessages>;
