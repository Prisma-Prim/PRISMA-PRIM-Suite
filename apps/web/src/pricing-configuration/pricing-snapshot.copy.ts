import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'title',
  'explanation',
  'provisional',
  'loading',
  'denied',
  'unavailable',
  'noRule',
  'noOfferings',
  'offering',
  'tariff',
  'quantity',
  'applyAdjustment',
  'adjustmentType',
  'fixedNetDiscount',
  'netReduction',
  'taxReduction',
  'adjustmentReason',
  'originalAmounts',
  'adjustedAmounts',
  'adjustmentAppliedBy',
  'adjustmentAppliedAt',
  'selectionLimit',
  'selectionLimitReached',
  'tooManyLines',
  'calculate',
  'calculating',
  'retry',
  'reload',
  'uncertain',
  'chooseLine',
  'corrected',
  'netReductionInvalid',
  'stale',
  'notEffective',
  'mixedCurrency',
  'conflict',
  'snapshots',
  'noSnapshots',
  'older',
  'olderUnavailable',
  'reopen',
  'subtotal',
  'tax',
  'total',
  'calculatedAt',
  'calculatedBy',
  'ruleVersion',
  'client',
  'snapshotLoading',
  'snapshotUnavailable',
  'retrySnapshot',
  'close',
] as const;

const english = {
  title: 'Illustrative pricing',
  explanation:
    'Calculate an illustrative price for this Opportunity. It is not a quote, approval, contract, invoice, tax decision, or evidence of ability to perform.',
  provisional: 'Illustrative and provisional',
  loading: 'Loading pricing…',
  denied: 'Pricing access is not available for this Opportunity.',
  unavailable: 'Pricing could not be loaded. Try again.',
  noRule: 'No Pricing Rule Version is currently effective.',
  noOfferings: 'No offering with a current Tariff Version is available.',
  offering: 'Offering',
  tariff: 'Tariff Version',
  quantity: 'Quantity',
  applyAdjustment: 'Apply a fixed net discount',
  adjustmentType: 'Adjustment type',
  fixedNetDiscount: 'Fixed net discount',
  netReduction: 'Net reduction',
  taxReduction: 'Tax reduction',
  adjustmentReason: 'Adjustment reason',
  originalAmounts: 'Original net and tax',
  adjustedAmounts: 'Adjusted net and tax',
  adjustmentAppliedBy: 'Adjustment applied by Workspace Membership',
  adjustmentAppliedAt: 'Adjustment applied',
  selectionLimit: 'Select up to 20 offerings.',
  selectionLimitReached:
    '20 offerings selected. Deselect one before choosing another.',
  tooManyLines:
    'You can select up to 20 offerings. Deselect one before calculating.',
  calculate: 'Calculate and save',
  calculating: 'Calculating…',
  retry: 'Retry the same calculation',
  reload: 'Reload pricing',
  uncertain:
    'The outcome is uncertain. Retry sends the exact same values and key.',
  chooseLine:
    'Choose at least one offering and enter valid quantities and adjustments.',
  corrected: 'Correct the highlighted values and try again.',
  netReductionInvalid:
    'Enter a net reduction no greater than the original line net.',
  stale: 'Configuration changed. Reload pricing before calculating again.',
  notEffective:
    'One declared version is no longer effective. Reload pricing before trying again.',
  mixedCurrency: 'Choose offerings that use one currency.',
  conflict: 'This retry no longer matches the original calculation.',
  snapshots: 'Saved Pricing Snapshots',
  noSnapshots: 'No Pricing Snapshot has been saved for this Opportunity.',
  older: 'Load older snapshots',
  olderUnavailable: 'Older Pricing Snapshots could not be loaded. Try again.',
  reopen: 'Reopen snapshot',
  subtotal: 'Subtotal',
  tax: 'Tax',
  total: 'Total',
  calculatedAt: 'Calculated',
  calculatedBy: 'Calculated by Workspace Membership',
  ruleVersion: 'Pricing Rule Version',
  client: 'Client',
  snapshotLoading: 'Opening Pricing Snapshot…',
  snapshotUnavailable: 'This Pricing Snapshot could not be opened. Try again.',
  retrySnapshot: 'Retry opening snapshot',
  close: 'Close snapshot',
};

export const pricingSnapshotMessages = defineMessages(keys, {
  ro: {
    title: 'Tarificare ilustrativă',
    explanation:
      'Calculați un preț ilustrativ pentru această Oportunitate. Nu constituie o ofertă comercială, o aprobare, un contract, o factură, o decizie fiscală sau o dovadă a capacității de prestare.',
    provisional: 'Ilustrativ și provizoriu',
    loading: 'Se încarcă tarificarea…',
    denied:
      'Accesul la tarificare nu este disponibil pentru această Oportunitate.',
    unavailable: 'Tarificarea nu a putut fi încărcată. Reîncercați.',
    noRule:
      'Nicio versiune a regulii de tarifare nu este în vigoare în prezent.',
    noOfferings:
      'Nu există nicio ofertă de serviciu cu o versiune de tarif în vigoare.',
    offering: 'Ofertă de serviciu',
    tariff: 'Versiunea tarifului',
    quantity: 'Cantitate',
    applyAdjustment: 'Aplică o reducere netă fixă',
    adjustmentType: 'Tipul ajustării',
    fixedNetDiscount: 'Reducere netă fixă',
    netReduction: 'Reducere netă',
    taxReduction: 'Reducerea taxei',
    adjustmentReason: 'Motivul ajustării',
    originalAmounts: 'Valori nete și taxe inițiale',
    adjustedAmounts: 'Valori nete și taxe ajustate',
    adjustmentAppliedBy: 'Ajustare aplicată de membrul Spațiului de lucru',
    adjustmentAppliedAt: 'Ajustare aplicată',
    selectionLimit: 'Selectați cel mult 20 de oferte de servicii.',
    selectionLimitReached:
      '20 de oferte de servicii selectate. Deselectați una înainte de a alege alta.',
    tooManyLines:
      'Puteți selecta cel mult 20 de oferte de servicii. Deselectați una înainte de calcul.',
    calculate: 'Calculează și salvează',
    calculating: 'Se calculează…',
    retry: 'Reîncearcă același calcul',
    reload: 'Reîncarcă tarificarea',
    uncertain:
      'Rezultatul este incert. Reîncercarea trimite exact aceleași valori și aceeași cheie.',
    chooseLine:
      'Alegeți cel puțin o ofertă de serviciu și introduceți cantități și ajustări valide.',
    corrected: 'Corectați valorile evidențiate și reîncercați.',
    netReductionInvalid:
      'Introduceți o reducere netă care nu depășește valoarea netă inițială a liniei.',
    stale:
      'Configurația s-a schimbat. Reîncărcați tarificarea înainte de un nou calcul.',
    notEffective:
      'O versiune declarată nu mai este în vigoare. Reîncărcați tarificarea înainte de a reîncerca.',
    mixedCurrency: 'Alegeți oferte de servicii care folosesc aceeași monedă.',
    conflict: 'Această reîncercare nu mai corespunde calculului inițial.',
    snapshots: 'Instantanee de tarifare salvate',
    noSnapshots:
      'Nu a fost salvat niciun instantaneu de tarifare pentru această Oportunitate.',
    older: 'Încarcă instantanee mai vechi',
    olderUnavailable:
      'Instantaneele de tarifare mai vechi nu au putut fi încărcate. Reîncercați.',
    reopen: 'Redeschide instantaneul',
    subtotal: 'Subtotal',
    tax: 'Taxă',
    total: 'Total',
    calculatedAt: 'Calculat',
    calculatedBy: 'Calculat de membrul Spațiului de lucru',
    ruleVersion: 'Versiunea regulii de tarifare',
    client: 'Client',
    snapshotLoading: 'Se deschide instantaneul de tarifare…',
    snapshotUnavailable:
      'Acest instantaneu de tarifare nu a putut fi deschis. Reîncercați.',
    retrySnapshot: 'Reîncearcă deschiderea instantaneului',
    close: 'Închide instantaneul',
  },
  ru: {
    title: 'Иллюстративный расчёт цены',
    explanation:
      'Рассчитайте иллюстративную цену для этой Возможности. Это не коммерческое предложение, одобрение, договор, счёт, налоговое решение или подтверждение права оказывать услуги.',
    provisional: 'Иллюстративно и предварительно',
    loading: 'Загрузка расчёта цены…',
    denied: 'Расчёт цены недоступен для этой Возможности.',
    unavailable: 'Не удалось загрузить расчёт цены. Повторите попытку.',
    noRule: 'Сейчас нет действующей версии правила расчёта цены.',
    noOfferings: 'Нет предложений услуг с действующей версией тарифа.',
    offering: 'Предложение услуги',
    tariff: 'Версия тарифа',
    quantity: 'Количество',
    applyAdjustment: 'Применить фиксированную скидку нетто',
    adjustmentType: 'Тип корректировки',
    fixedNetDiscount: 'Фиксированная скидка нетто',
    netReduction: 'Уменьшение нетто',
    taxReduction: 'Уменьшение налога',
    adjustmentReason: 'Причина корректировки',
    originalAmounts: 'Исходные нетто и налог',
    adjustedAmounts: 'Скорректированные нетто и налог',
    adjustmentAppliedBy:
      'Корректировка применена участником Рабочего пространства',
    adjustmentAppliedAt: 'Корректировка применена',
    selectionLimit: 'Выберите не более 20 предложений услуг.',
    selectionLimitReached:
      'Выбрано 20 предложений услуг. Снимите выбор с одного, прежде чем выбрать другое.',
    tooManyLines:
      'Можно выбрать не более 20 предложений услуг. Снимите выбор с одного перед расчётом.',
    calculate: 'Рассчитать и сохранить',
    calculating: 'Выполняется расчёт…',
    retry: 'Повторить тот же расчёт',
    reload: 'Перезагрузить расчёт цены',
    uncertain:
      'Результат неизвестен. Повторная попытка отправит те же значения и тот же ключ.',
    chooseLine:
      'Выберите хотя бы одно предложение услуги и введите допустимые количества и корректировки.',
    corrected: 'Исправьте выделенные значения и повторите попытку.',
    netReductionInvalid:
      'Введите уменьшение нетто, не превышающее исходную сумму нетто строки.',
    stale:
      'Конфигурация изменилась. Перезагрузите расчёт цены перед новым расчётом.',
    notEffective:
      'Одна из указанных версий больше не действует. Перезагрузите расчёт цены перед повторной попыткой.',
    mixedCurrency: 'Выберите предложения услуг в одной валюте.',
    conflict:
      'Эта повторная попытка больше не соответствует исходному расчёту.',
    snapshots: 'Сохранённые снимки расчёта цены',
    noSnapshots: 'Для этой Возможности ещё не сохранён снимок расчёта цены.',
    older: 'Загрузить более ранние снимки',
    olderUnavailable:
      'Не удалось загрузить более ранние снимки расчёта цены. Повторите попытку.',
    reopen: 'Открыть снимок',
    subtotal: 'Промежуточный итог',
    tax: 'Налог',
    total: 'Итого',
    calculatedAt: 'Рассчитано',
    calculatedBy: 'Расчёт выполнен участником Рабочего пространства',
    ruleVersion: 'Версия правила расчёта цены',
    client: 'Клиент',
    snapshotLoading: 'Открывается снимок расчёта цены…',
    snapshotUnavailable:
      'Не удалось открыть этот снимок расчёта цены. Повторите попытку.',
    retrySnapshot: 'Повторить открытие снимка',
    close: 'Закрыть снимок',
  },
  fr: {
    title: 'Tarification illustrative',
    explanation:
      'Calculez un prix illustratif pour cette Opportunité. Il ne constitue ni une offre commerciale, ni une approbation, un contrat, une facture, une décision fiscale ou une preuve de capacité à réaliser la prestation.',
    provisional: 'Illustratif et provisoire',
    loading: 'Chargement de la tarification…',
    denied:
      'L’accès à la tarification n’est pas disponible pour cette Opportunité.',
    unavailable: 'Impossible de charger la tarification. Réessayez.',
    noRule:
      'Aucune version de règle de tarification n’est actuellement en vigueur.',
    noOfferings:
      'Aucune prestation avec une version de tarif en vigueur n’est disponible.',
    offering: 'Prestation',
    tariff: 'Version du tarif',
    quantity: 'Quantité',
    applyAdjustment: 'Appliquer une remise nette fixe',
    adjustmentType: 'Type d’ajustement',
    fixedNetDiscount: 'Remise nette fixe',
    netReduction: 'Réduction nette',
    taxReduction: 'Réduction de taxe',
    adjustmentReason: 'Motif de l’ajustement',
    originalAmounts: 'Net et taxe d’origine',
    adjustedAmounts: 'Net et taxe ajustés',
    adjustmentAppliedBy:
      'Ajustement appliqué par le membre de l’Espace de travail',
    adjustmentAppliedAt: 'Ajustement appliqué',
    selectionLimit: 'Sélectionnez au maximum 20 prestations.',
    selectionLimitReached:
      '20 prestations sélectionnées. Désélectionnez-en une avant d’en choisir une autre.',
    tooManyLines:
      'Vous pouvez sélectionner au maximum 20 prestations. Désélectionnez-en une avant le calcul.',
    calculate: 'Calculer et enregistrer',
    calculating: 'Calcul en cours…',
    retry: 'Réessayer le même calcul',
    reload: 'Recharger la tarification',
    uncertain:
      'Le résultat est incertain. Réessayer renvoie exactement les mêmes valeurs et la même clé.',
    chooseLine:
      'Choisissez au moins une prestation et saisissez des quantités et des ajustements valides.',
    corrected: 'Corrigez les valeurs signalées et réessayez.',
    netReductionInvalid:
      'Saisissez une réduction nette ne dépassant pas le net d’origine de la ligne.',
    stale:
      'La configuration a changé. Rechargez la tarification avant un nouveau calcul.',
    notEffective:
      'Une version déclarée n’est plus en vigueur. Rechargez la tarification avant de réessayer.',
    mixedCurrency: 'Choisissez des prestations utilisant une seule devise.',
    conflict:
      'Cette nouvelle tentative ne correspond plus au calcul d’origine.',
    snapshots: 'Instantanés de tarification enregistrés',
    noSnapshots:
      'Aucun instantané de tarification n’a été enregistré pour cette Opportunité.',
    older: 'Charger les instantanés plus anciens',
    olderUnavailable:
      'Impossible de charger les instantanés de tarification plus anciens. Réessayez.',
    reopen: 'Rouvrir l’instantané',
    subtotal: 'Sous-total',
    tax: 'Taxe',
    total: 'Total',
    calculatedAt: 'Calculé',
    calculatedBy: 'Calculé par le membre de l’Espace de travail',
    ruleVersion: 'Version de la règle de tarification',
    client: 'Client',
    snapshotLoading: 'Ouverture de l’instantané de tarification…',
    snapshotUnavailable:
      'Impossible d’ouvrir cet instantané de tarification. Réessayez.',
    retrySnapshot: 'Réessayer d’ouvrir l’instantané',
    close: 'Fermer l’instantané',
  },
  en: english,
});

export function usePricingSnapshotCopy() {
  return useMessages(pricingSnapshotMessages);
}
