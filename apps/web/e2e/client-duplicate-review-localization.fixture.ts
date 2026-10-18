import { expect, type Page } from '@playwright/test';
import type { InterfaceLocale } from '../src/localization/interface-locale';

// Independent user-facing expectations; never resolve the production catalog here.
export const reviewLocales = [
  {
    code: 'ro',
    emptyPage:
      'Nicio examinare pe această pagină. Pot fi disponibile și altele.',
    title: 'Examinări ale posibilelor duplicate',
    open: 'Examinează posibilul duplicat 1',
    second: 'Examinează posibilul duplicat 2',
    comparison: 'Compară Clientul propus cu cel existent',
    proposal: 'Valoare propusă',
    candidate: 'Client existent',
    version: 'Versiunea 1.234',
    listLoading: 'Se încarcă examinările posibilelor duplicate…',
    detailLoading: 'Se încarcă comparația duplicatului…',
    older: 'Încarcă mai multe examinări de posibile duplicate',
    olderLoading: 'Se încarcă mai multe examinări de posibile duplicate…',
    olderFailed:
      'Mai multe examinări de duplicate nu au putut fi încărcate în siguranță. Încearcă din nou.',
    listFailed: 'Examinarea duplicatului nu a putut fi încărcată în siguranță.',
    attach: 'Folosește acest Client existent în Compania activă',
    pending: 'Se adaugă Clientul existent…',
    uncertain:
      'Relația cu Compania nu a putut fi confirmată. Redeschide examinarea înainte de a încerca din nou.',
    confirmed: 'Clientul existent a fost asociat Companiei active.',
    noAttach:
      'Asocierea acestui Client nu este disponibilă cu accesul tău curent.',
    guidance:
      'Revino la dosarul relevant și trimite o corectare obișnuită, dacă este cazul.',
    correction: 'Propunere de corectare · nesalvată',
    remediation:
      'Mai mulți Clienți existenți folosesc acest identificator. Datele trebuie remediate înainte de a continua comparația.',
    denied:
      'Accesul la examinări nu este disponibil cu autoritatea ta curentă.',
  },
  {
    code: 'ru',
    emptyPage:
      'На этой странице нет проверок. На следующих страницах могут быть другие.',
    title: 'Проверки возможных дубликатов',
    open: 'Проверить возможный дубликат 1',
    second: 'Проверить возможный дубликат 2',
    comparison: 'Сравнить предложенного и существующего Клиента',
    proposal: 'Предложенное значение',
    candidate: 'Существующий Клиент',
    version: 'Версия 1\u00a0234',
    listLoading: 'Загрузка проверок возможных дубликатов…',
    detailLoading: 'Загрузка сравнения дубликата…',
    older: 'Загрузить другие проверки возможных дубликатов',
    olderLoading: 'Загрузка других проверок возможных дубликатов…',
    olderFailed:
      'Не удалось безопасно загрузить другие проверки дубликатов. Повторите попытку.',
    listFailed: 'Не удалось безопасно загрузить проверку дубликата.',
    attach: 'Использовать этого существующего Клиента в активной Компании',
    pending: 'Добавление существующего Клиента…',
    uncertain:
      'Не удалось подтвердить связь с Компанией. Снова откройте проверку перед следующей попыткой.',
    confirmed: 'Существующий Клиент связан с активной Компанией.',
    noAttach: 'Текущий доступ не позволяет связать этого Клиента.',
    guidance:
      'Вернитесь к соответствующему досье и при необходимости отправьте обычное исправление.',
    correction: 'Предложение исправления · не сохранено',
    remediation:
      'Несколько существующих Клиентов используют этот идентификатор. Для продолжения сравнения необходимо исправить данные.',
    denied: 'Текущие полномочия не позволяют просматривать проверки.',
  },
  {
    code: 'fr',
    emptyPage:
      'Aucun examen sur cette page. D’autres examens peuvent être disponibles.',
    title: 'Examens des doublons possibles',
    open: 'Examiner le doublon possible 1',
    second: 'Examiner le doublon possible 2',
    comparison: 'Comparer le Client proposé et le Client existant',
    proposal: 'Valeur proposée',
    candidate: 'Client existant',
    version: 'Version 1\u202f234',
    listLoading: 'Chargement des examens de doublons possibles…',
    detailLoading: 'Chargement de la comparaison du doublon…',
    older: 'Charger d’autres examens de doublons possibles',
    olderLoading: 'Chargement d’autres examens de doublons possibles…',
    olderFailed:
      'D’autres examens de doublons n’ont pas pu être chargés en toute sécurité. Réessayez.',
    listFailed: 'L’examen du doublon n’a pas pu être chargé en toute sécurité.',
    attach: 'Utiliser ce Client existant dans l’Entreprise active',
    pending: 'Ajout du Client existant…',
    uncertain:
      'Le rattachement à l’Entreprise n’a pas pu être confirmé. Rouvrez l’examen avant de réessayer.',
    confirmed: 'Client existant rattaché à l’Entreprise active.',
    noAttach: 'Votre accès actuel ne permet pas de rattacher ce Client.',
    guidance:
      'Revenez au dossier concerné et soumettez une correction ordinaire si nécessaire.',
    correction: 'Proposition de correction · non enregistrée',
    remediation:
      'Plusieurs Clients existants utilisent cet identifiant. Les données doivent être corrigées avant de poursuivre la comparaison.',
    denied:
      'Vos autorisations actuelles ne permettent pas d’accéder aux examens.',
  },
  {
    code: 'en',
    emptyPage: 'No review on this page. More reviews may be available.',
    title: 'Possible duplicate reviews',
    open: 'Review possible duplicate 1',
    second: 'Review possible duplicate 2',
    comparison: 'Compare the proposed and existing Client',
    proposal: 'Proposed value',
    candidate: 'Existing Client',
    version: 'Version 1,234',
    listLoading: 'Loading possible duplicate reviews…',
    detailLoading: 'Loading the duplicate comparison…',
    older: 'Load more possible duplicate reviews',
    olderLoading: 'Loading more possible duplicate reviews…',
    olderFailed:
      'More duplicate reviews could not be loaded safely. Try again.',
    listFailed: 'The duplicate review could not be loaded safely.',
    attach: 'Use this existing Client in the active Company',
    pending: 'Adding existing Client…',
    uncertain:
      'The Company attachment could not be confirmed. Reopen the review before trying again.',
    confirmed: 'Existing Client linked to the active Company.',
    noAttach: 'Linking this Client is not available with your current access.',
    guidance:
      'Return to the relevant dossier and submit an ordinary correction if appropriate.',
    correction: 'Correction proposal · not saved',
    remediation:
      'Several existing Clients use this identifier. Data remediation is required before comparison can continue.',
    denied: 'Review access is not available with your current authority.',
  },
] as const;

export async function chooseReviewLocale(page: Page, code: InterfaceLocale) {
  const control = page.locator('#interface-locale');
  await control.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Home');
  for (
    let index = 0;
    index < reviewLocales.findIndex((locale) => locale.code === code);
    index++
  )
    await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(control).toHaveAttribute('data-value', code);
  await expect(control).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('lang', code);
}

export function responseGate() {
  let release: () => void = () => {
    throw new Error('Response gate not initialized.');
  };
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { pending, release };
}
