import { defineMessages, useMessages } from '../localization/messages';
import { useContractAddendumCopy } from './contract-addendum.copy';
import { useContractDirectCopy } from './contract-direct.copy';
import type { ContractQualityCode } from './contract-quality-response';

const keys = [
  'title',
  'empty',
  'run',
  'running',
  'retry',
  'uncertain',
  'denied',
  'unavailable',
  'superseded',
  'conflict',
  'invalid',
  'error',
  'success',
  'warnings',
  'errors',
  'evaluatedAt',
  'actor',
  'ruleSet',
  'version',
  'history',
  'next',
  'reopen',
  'loading',
  'PASS',
  'WARNING',
  'ERROR',
  'SOURCE_COMPANY_MATCHES',
  'PARTY_AVAILABLE',
  'PARTY_MATCHES_SOURCE',
  'PARTY_IDENTITY_MATCHES_SOURCE',
  'PARTY_IDENTITY_CURRENT',
  'PARTY_TAX_ID_RECORDED',
  'PRICE_MATCHES_SOURCE_OFFER',
  'CONDITIONS_MATCH_SOURCE_OFFER',
  'SOURCE_OFFER_ACCEPTED',
  'PRICE_MATCHES_ACCEPTED_OFFER',
  'PRICING_SNAPSHOT_COHERENT',
  'CONDITIONS_MATCH_ACCEPTED_OFFER',
  'ADDED_CONDITIONS_CONFIRMED',
  'TERM_END_NOT_PASSED',
  'PROVISIONAL_MARKER_PRESENT',
] as const;

export const contractQualityMessages = defineMessages(keys, {
  ro: {
    PRICE_MATCHES_SOURCE_OFFER: 'Prețul corespunde Ofertei sursă',
    CONDITIONS_MATCH_SOURCE_OFFER: 'Condițiile corespund Ofertei sursă',
    SOURCE_OFFER_ACCEPTED: 'Versiunea exactă a Ofertei sursă este acceptată',

    title: 'Verificări de calitate ale Contractului',
    empty: 'Contractul nu are încă o verificare de calitate înregistrată.',
    run: 'Rulează verificările de calitate ale Contractului',
    running: 'Se rulează verificările de calitate ale Contractului…',
    retry: 'Reîncearcă aceleași verificări de calitate ale Contractului',
    uncertain:
      'Rezultatul este incert. Reîncercarea trimite exact aceeași comandă și aceeași cheie.',
    denied:
      'Accesul la verificările de calitate ale Contractului nu este disponibil.',
    unavailable:
      'Versiunea Contractului nu este disponibilă. Reîncărcați Contractul.',
    superseded:
      'Această versiune a Contractului a fost înlocuită. Reîncărcați Contractul.',
    conflict:
      'Reîncercarea diferă de comanda înregistrată. Reîncărcați Contractul.',
    invalid: 'Comanda de verificare a calității a fost refuzată.',
    error: 'Rezultatele verificărilor nu au putut fi încărcate. Reîncercați.',
    success: 'Toate verificările de calitate ale Contractului au trecut.',
    warnings: 'Verificările Contractului s-au încheiat cu avertismente.',
    errors: 'Verificările Contractului s-au încheiat cu erori.',
    evaluatedAt: 'Evaluat la (UTC)',
    actor: 'Membrul care a efectuat verificarea',
    ruleSet: 'Set de reguli',
    version: 'Versiunea exactă a Contractului',
    history: 'Redeschide verificările înregistrate',
    next: 'Verificări mai vechi',
    reopen: 'Redeschide verificarea',
    loading: 'Se încarcă verificările înregistrate…',
    PASS: 'ADMIS',
    WARNING: 'AVERTISMENT',
    ERROR: 'EROARE',
    SOURCE_COMPANY_MATCHES: 'Compania emitentă corespunde sursei',
    PARTY_AVAILABLE: 'Partea desemnată este disponibilă în prezent',
    PARTY_MATCHES_SOURCE: 'Partea desemnată corespunde sursei',
    PARTY_IDENTITY_MATCHES_SOURCE: 'Identitatea înregistrată corespunde sursei',
    PARTY_IDENTITY_CURRENT:
      'Identitatea înregistrată corespunde identității actuale',
    PARTY_TAX_ID_RECORDED: 'IDNO / codul fiscal este înregistrat',
    PRICE_MATCHES_ACCEPTED_OFFER: 'Prețul corespunde Ofertei acceptate',
    PRICING_SNAPSHOT_COHERENT:
      'Trasabilitatea calculului de preț fixat este coerentă',
    CONDITIONS_MATCH_ACCEPTED_OFFER:
      'Condițiile copiate corespund Ofertei acceptate',
    ADDED_CONDITIONS_CONFIRMED:
      'Termenii și condițiile adăugate necesită confirmare',
    TERM_END_NOT_PASSED: 'Sfârșitul perioadei nu a trecut (UTC)',
    PROVISIONAL_MARKER_PRESENT: 'Marcajele ilustrative sunt prezente',
  },
  ru: {
    PRICE_MATCHES_SOURCE_OFFER: 'Цена соответствует исходному предложению',
    CONDITIONS_MATCH_SOURCE_OFFER:
      'Условия соответствуют исходному предложению',
    SOURCE_OFFER_ACCEPTED: 'Точная версия исходного предложения принята',

    title: 'Проверки качества договора',
    empty: 'Для договора ещё нет записанных проверок качества.',
    run: 'Выполнить проверки качества договора',
    running: 'Выполняются проверки качества договора…',
    retry: 'Повторить те же проверки качества договора',
    uncertain:
      'Результат неизвестен. Повтор отправляет точно ту же команду с тем же ключом.',
    denied: 'Доступ к проверкам качества договора недоступен.',
    unavailable: 'Версия договора недоступна. Обновите договор.',
    superseded: 'Эта версия договора заменена. Обновите договор.',
    conflict: 'Повтор не совпадает с записанной командой. Обновите договор.',
    invalid: 'Команда проверки качества отклонена.',
    error: 'Не удалось загрузить результаты проверок. Повторите попытку.',
    success: 'Все проверки качества договора пройдены.',
    warnings: 'Проверки договора завершены с предупреждениями.',
    errors: 'Проверки договора завершены с ошибками.',
    evaluatedAt: 'Время проверки (UTC)',
    actor: 'Участник, выполнивший проверку',
    ruleSet: 'Набор правил',
    version: 'Точная версия договора',
    history: 'Открыть записанные проверки',
    next: 'Более ранние проверки',
    reopen: 'Открыть проверку',
    loading: 'Загрузка записанных проверок…',
    PASS: 'ПРОЙДЕНО',
    WARNING: 'ПРЕДУПРЕЖДЕНИЕ',
    ERROR: 'ОШИБКА',
    SOURCE_COMPANY_MATCHES: 'Компания-эмитент соответствует источнику',
    PARTY_AVAILABLE: 'Указанная сторона сейчас доступна',
    PARTY_MATCHES_SOURCE: 'Указанная сторона соответствует источнику',
    PARTY_IDENTITY_MATCHES_SOURCE:
      'Записанные реквизиты соответствуют источнику',
    PARTY_IDENTITY_CURRENT: 'Записанные реквизиты соответствуют текущим',
    PARTY_TAX_ID_RECORDED: 'IDNO / налоговый код записан',
    PRICE_MATCHES_ACCEPTED_OFFER: 'Цена соответствует принятой оферте',
    PRICING_SNAPSHOT_COHERENT:
      'Трассировка зафиксированного расчёта цены согласована',
    CONDITIONS_MATCH_ACCEPTED_OFFER:
      'Скопированные условия соответствуют принятой оферте',
    ADDED_CONDITIONS_CONFIRMED:
      'Добавленные сроки и условия требуют подтверждения',
    TERM_END_NOT_PASSED: 'Срок окончания ещё не наступил (UTC)',
    PROVISIONAL_MARKER_PRESENT: 'Иллюстративные отметки присутствуют',
  },
  fr: {
    PRICE_MATCHES_SOURCE_OFFER: 'Le prix correspond à l’offre source',
    CONDITIONS_MATCH_SOURCE_OFFER:
      'Les conditions correspondent à l’offre source',
    SOURCE_OFFER_ACCEPTED: 'La version exacte de l’offre source est acceptée',

    title: 'Contrôles qualité du contrat',
    empty: 'Aucun contrôle qualité du contrat n’est encore enregistré.',
    run: 'Exécuter les contrôles qualité du contrat',
    running: 'Exécution des contrôles qualité du contrat…',
    retry: 'Réessayer les mêmes contrôles qualité du contrat',
    uncertain:
      'Le résultat est incertain. Réessayer envoie exactement la même action et la même clé.',
    denied: 'L’accès aux contrôles qualité du contrat est indisponible.',
    unavailable:
      'La version du contrat est indisponible. Rechargez le contrat.',
    superseded:
      'Cette version du contrat a été remplacée. Rechargez le contrat.',
    conflict:
      'Cette nouvelle tentative diffère de l’action enregistrée. Rechargez le contrat.',
    invalid: 'L’action de contrôle qualité a été refusée.',
    error: 'Les résultats des contrôles n’ont pas pu être chargés. Réessayez.',
    success: 'Tous les contrôles qualité du contrat sont réussis.',
    warnings:
      'Les contrôles du contrat se sont terminés avec des avertissements.',
    errors: 'Les contrôles du contrat se sont terminés avec des erreurs.',
    evaluatedAt: 'Évalué le (UTC)',
    actor: 'Membre ayant effectué le contrôle',
    ruleSet: 'Jeu de règles',
    version: 'Version exacte du contrat',
    history: 'Rouvrir les contrôles enregistrés',
    next: 'Contrôles plus anciens',
    reopen: 'Rouvrir le contrôle',
    loading: 'Chargement des contrôles enregistrés…',
    PASS: 'RÉUSSI',
    WARNING: 'AVERTISSEMENT',
    ERROR: 'ERREUR',
    SOURCE_COMPANY_MATCHES: 'La société émettrice correspond à la source',
    PARTY_AVAILABLE: 'La partie désignée est actuellement disponible',
    PARTY_MATCHES_SOURCE: 'La partie désignée correspond à la source',
    PARTY_IDENTITY_MATCHES_SOURCE:
      'L’identité enregistrée correspond à la source',
    PARTY_IDENTITY_CURRENT:
      'L’identité enregistrée correspond à l’identité actuelle',
    PARTY_TAX_ID_RECORDED: 'L’IDNO / code fiscal est enregistré',
    PRICE_MATCHES_ACCEPTED_OFFER: 'Le prix correspond à l’offre acceptée',
    PRICING_SNAPSHOT_COHERENT: 'La trace du calcul de prix figé est cohérente',
    CONDITIONS_MATCH_ACCEPTED_OFFER:
      'Les conditions copiées correspondent à l’offre acceptée',
    ADDED_CONDITIONS_CONFIRMED:
      'Les modalités et conditions ajoutées nécessitent une confirmation',
    TERM_END_NOT_PASSED: 'La fin de période n’est pas dépassée (UTC)',
    PROVISIONAL_MARKER_PRESENT: 'Les mentions illustratives sont présentes',
  },
  en: {
    PRICE_MATCHES_SOURCE_OFFER: 'Price matches the source Offer',
    CONDITIONS_MATCH_SOURCE_OFFER: 'Conditions match the source Offer',
    SOURCE_OFFER_ACCEPTED: 'The exact source Offer Version is accepted',

    title: 'Contract Quality Checks',
    empty: 'No Contract Quality Check run yet.',
    run: 'Run Contract Quality Checks',
    running: 'Running Contract Quality Checks…',
    retry: 'Retry the same Contract Quality Checks',
    uncertain:
      'The outcome is uncertain. Retry sends the exact same command and key.',
    denied: 'Contract Quality Check access is unavailable.',
    unavailable: 'The Contract Version is unavailable. Reload the Contract.',
    superseded:
      'This Contract Version has been superseded. Reload the Contract.',
    conflict:
      'This retry conflicts with its recorded command. Reload the Contract.',
    invalid: 'The Quality Check command was refused.',
    error: 'Quality Check results could not be loaded. Try again.',
    success: 'All Contract Quality Checks passed.',
    warnings: 'Contract checks completed with warnings.',
    errors: 'Contract checks completed with errors.',
    evaluatedAt: 'Evaluated at (UTC)',
    actor: 'Checking membership',
    ruleSet: 'Rule set',
    version: 'Exact Contract Version',
    history: 'Reopen recorded checks',
    next: 'Older checks',
    reopen: 'Reopen run',
    loading: 'Loading recorded checks…',
    PASS: 'PASS',
    WARNING: 'WARNING',
    ERROR: 'ERROR',
    SOURCE_COMPANY_MATCHES: 'Issuing Company matches the source',
    PARTY_AVAILABLE: 'Named party is currently available',
    PARTY_MATCHES_SOURCE: 'Named party matches the source',
    PARTY_IDENTITY_MATCHES_SOURCE: 'Recorded identity matches the source',
    PARTY_IDENTITY_CURRENT: 'Recorded identity matches current identity',
    PARTY_TAX_ID_RECORDED: 'IDNO / tax code is recorded',
    PRICE_MATCHES_ACCEPTED_OFFER: 'Price matches the Accepted Offer',
    PRICING_SNAPSHOT_COHERENT: 'Pricing Snapshot trace is coherent',
    CONDITIONS_MATCH_ACCEPTED_OFFER:
      'Copied conditions match the Accepted Offer',
    ADDED_CONDITIONS_CONFIRMED: 'Added terms and conditions need confirmation',
    TERM_END_NOT_PASSED: 'Term end has not passed (UTC)',
    PROVISIONAL_MARKER_PRESENT: 'Illustrative markers are present',
  },
});

export const useContractQualityCopy = () =>
  useMessages(contractQualityMessages);

/** Existing Direct and Addendum owners retain their rule descriptions. */
export function useContractQualityRuleLabel(): (
  code: ContractQualityCode,
) => string {
  const copy = useContractQualityCopy();
  const direct = useContractDirectCopy();
  const addendum = useContractAddendumCopy();
  return (code) => {
    switch (code) {
      case 'DIRECT_ORIGIN_REVIEWED':
        return direct('review');
      case 'PARENT_EXECUTED':
        return addendum('parentExecuted');
      case 'CURRENCY_MATCHES_PARENT':
        return addendum('currencyMatches');
      default:
        return copy(code);
    }
  };
}
