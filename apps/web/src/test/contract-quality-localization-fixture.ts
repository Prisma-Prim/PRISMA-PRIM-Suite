import type { ActorContext } from '../access-types';
import type {
  ContractQualityCode,
  ContractQualityRunView,
} from '../contract/contract-quality-response';
import {
  contractLocaleActor,
  contractLocaleIds,
  contractLocaleRecord,
} from './contract-localization-fixture';

// Independent expectations at public rendering/HTTP seams, not catalog lookups.
export const contractQualityLocales = [
  {
    code: 'ro',
    name: 'Română',
    language: 'Limba interfeței',
    title: 'Verificări de calitate ale Contractului',
    run: 'Rulează verificările de calitate ale Contractului',
    running: 'Se rulează verificările de calitate ale Contractului…',
    retry: 'Reîncearcă aceleași verificări de calitate ale Contractului',
    history: 'Redeschide verificările înregistrate',
    next: 'Verificări mai vechi',
    reopen: 'Redeschide verificarea',
    loading: 'Se încarcă verificările înregistrate…',
    empty: 'Contractul nu are încă o verificare de calitate înregistrată.',
    uncertain:
      'Rezultatul este incert. Reîncercarea trimite exact aceeași comandă și aceeași cheie.',
    warnings: 'Verificările Contractului s-au încheiat cu avertismente.',
    success: 'Toate verificările de calitate ale Contractului au trecut.',
    errors: 'Verificările Contractului s-au încheiat cu erori.',
    warning: 'AVERTISMENT',
    pass: 'ADMIS',
    error: 'EROARE',
    added: 'Termenii și condițiile adăugate necesită confirmare',
    direct: 'Originea directă necesită verificare',
    parent: 'Acordul părinte este semnat',
    currency: 'Moneda calculului corespunde acordului părinte',
    utc: '7 oct. 2026, 23:30:00',
    rules: [
      'Compania emitentă corespunde sursei',
      'Partea desemnată este disponibilă în prezent',
      'Partea desemnată corespunde sursei',
      'Identitatea înregistrată corespunde sursei',
      'Identitatea înregistrată corespunde identității actuale',
      'IDNO / codul fiscal este înregistrat',
      'Prețul corespunde Ofertei acceptate',
      'Trasabilitatea calculului de preț fixat este coerentă',
      'Condițiile copiate corespund Ofertei acceptate',
      'Termenii și condițiile adăugate necesită confirmare',
      'Sfârșitul perioadei nu a trecut (UTC)',
      'Marcajele ilustrative sunt prezente',
    ],
  },
  {
    code: 'ru',
    name: 'Русский',
    language: 'Язык интерфейса',
    title: 'Проверки качества договора',
    run: 'Выполнить проверки качества договора',
    running: 'Выполняются проверки качества договора…',
    retry: 'Повторить те же проверки качества договора',
    history: 'Открыть записанные проверки',
    next: 'Более ранние проверки',
    reopen: 'Открыть проверку',
    loading: 'Загрузка записанных проверок…',
    empty: 'Для договора ещё нет записанных проверок качества.',
    uncertain:
      'Результат неизвестен. Повтор отправляет точно ту же команду с тем же ключом.',
    warnings: 'Проверки договора завершены с предупреждениями.',
    success: 'Все проверки качества договора пройдены.',
    errors: 'Проверки договора завершены с ошибками.',
    warning: 'ПРЕДУПРЕЖДЕНИЕ',
    pass: 'ПРОЙДЕНО',
    error: 'ОШИБКА',
    added: 'Добавленные сроки и условия требуют подтверждения',
    direct: 'Прямой договор требует проверки',
    parent: 'Основной договор подписан',
    currency: 'Валюта расчёта совпадает с основным договором',
    utc: '7 окт. 2026 г., 23:30:00',
    rules: [
      'Компания-эмитент соответствует источнику',
      'Указанная сторона сейчас доступна',
      'Указанная сторона соответствует источнику',
      'Записанные реквизиты соответствуют источнику',
      'Записанные реквизиты соответствуют текущим',
      'IDNO / налоговый код записан',
      'Цена соответствует принятой оферте',
      'Трассировка зафиксированного расчёта цены согласована',
      'Скопированные условия соответствуют принятой оферте',
      'Добавленные сроки и условия требуют подтверждения',
      'Срок окончания ещё не наступил (UTC)',
      'Иллюстративные отметки присутствуют',
    ],
  },
  {
    code: 'fr',
    name: 'Français',
    language: 'Langue de l’interface',
    title: 'Contrôles qualité du contrat',
    run: 'Exécuter les contrôles qualité du contrat',
    running: 'Exécution des contrôles qualité du contrat…',
    retry: 'Réessayer les mêmes contrôles qualité du contrat',
    history: 'Rouvrir les contrôles enregistrés',
    next: 'Contrôles plus anciens',
    reopen: 'Rouvrir le contrôle',
    loading: 'Chargement des contrôles enregistrés…',
    empty: 'Aucun contrôle qualité du contrat n’est encore enregistré.',
    uncertain:
      'Le résultat est incertain. Réessayer envoie exactement la même action et la même clé.',
    warnings:
      'Les contrôles du contrat se sont terminés avec des avertissements.',
    success: 'Tous les contrôles qualité du contrat sont réussis.',
    errors: 'Les contrôles du contrat se sont terminés avec des erreurs.',
    warning: 'AVERTISSEMENT',
    pass: 'RÉUSSI',
    error: 'ERREUR',
    added: 'Les modalités et conditions ajoutées nécessitent une confirmation',
    direct: 'L’origine directe exige une vérification',
    parent: 'L’accord parent est signé',
    currency: 'La devise correspond à celle du parent',
    utc: '7 oct. 2026, 23:30:00',
    rules: [
      'La société émettrice correspond à la source',
      'La partie désignée est actuellement disponible',
      'La partie désignée correspond à la source',
      'L’identité enregistrée correspond à la source',
      'L’identité enregistrée correspond à l’identité actuelle',
      'L’IDNO / code fiscal est enregistré',
      'Le prix correspond à l’offre acceptée',
      'La trace du calcul de prix figé est cohérente',
      'Les conditions copiées correspondent à l’offre acceptée',
      'Les modalités et conditions ajoutées nécessitent une confirmation',
      'La fin de période n’est pas dépassée (UTC)',
      'Les mentions illustratives sont présentes',
    ],
  },
  {
    code: 'en',
    name: 'English',
    language: 'Interface language',
    title: 'Contract Quality Checks',
    run: 'Run Contract Quality Checks',
    running: 'Running Contract Quality Checks…',
    retry: 'Retry the same Contract Quality Checks',
    history: 'Reopen recorded checks',
    next: 'Older checks',
    reopen: 'Reopen run',
    loading: 'Loading recorded checks…',
    empty: 'No Contract Quality Check run yet.',
    uncertain:
      'The outcome is uncertain. Retry sends the exact same command and key.',
    warnings: 'Contract checks completed with warnings.',
    success: 'All Contract Quality Checks passed.',
    errors: 'Contract checks completed with errors.',
    warning: 'WARNING',
    pass: 'PASS',
    error: 'ERROR',
    added: 'Added terms and conditions need confirmation',
    direct: 'Direct origin requires review',
    parent: 'Parent agreement is executed',
    currency: 'Snapshot currency matches the parent',
    utc: 'Oct 7, 2026, 11:30:00 PM',
    rules: [
      'Issuing Company matches the source',
      'Named party is currently available',
      'Named party matches the source',
      'Recorded identity matches the source',
      'Recorded identity matches current identity',
      'IDNO / tax code is recorded',
      'Price matches the Accepted Offer',
      'Pricing Snapshot trace is coherent',
      'Copied conditions match the Accepted Offer',
      'Added terms and conditions need confirmation',
      'Term end has not passed (UTC)',
      'Illustrative markers are present',
    ],
  },
] as const;

export type QualityOrigin = 'offer' | 'direct' | 'addendum' | 'precontract';
export const qualityPath = `/api/contracts/opportunities/${contractLocaleIds.opportunity}/versions/${contractLocaleIds.version}/quality-checks`;
export const literalDecisionReason =
  '  Motiv {original} — Причина\nDeuxième ligne  ';

export function contractQualityRun({
  id = 'recorded-run-706',
  ruleSetVersion = 1,
  origin = 'offer',
  evaluatedAt = '2026-10-07T23:30:00.000Z',
  errors = false,
}: {
  id?: string;
  ruleSetVersion?: 1 | 2;
  origin?: QualityOrigin;
  evaluatedAt?: string;
  errors?: boolean;
} = {}): ContractQualityRunView {
  const common: ContractQualityCode[] = [
    'SOURCE_COMPANY_MATCHES',
    'PARTY_AVAILABLE',
  ];
  const codes: ContractQualityCode[] =
    origin === 'direct'
      ? [
          ...common,
          'PARTY_IDENTITY_CURRENT',
          'PARTY_TAX_ID_RECORDED',
          'PRICING_SNAPSHOT_COHERENT',
          'DIRECT_ORIGIN_REVIEWED',
        ]
      : [
          ...common,
          'PARTY_MATCHES_SOURCE',
          'PARTY_IDENTITY_MATCHES_SOURCE',
          'PARTY_IDENTITY_CURRENT',
          'PARTY_TAX_ID_RECORDED',
          ...(origin === 'addendum'
            ? ([
                'PRICING_SNAPSHOT_COHERENT',
                'PARENT_EXECUTED',
                'CURRENCY_MATCHES_PARENT',
              ] satisfies ContractQualityCode[])
            : ([
                'PRICE_MATCHES_ACCEPTED_OFFER',
                'PRICING_SNAPSHOT_COHERENT',
                'CONDITIONS_MATCH_ACCEPTED_OFFER',
                'ADDED_CONDITIONS_CONFIRMED',
              ] satisfies ContractQualityCode[])),
        ];
  codes.push('TERM_END_NOT_PASSED', 'PROVISIONAL_MARKER_PRESENT');
  return {
    id,
    contractVersionId: contractLocaleIds.version,
    ruleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
    ruleSetVersion,
    actorWorkspaceMembershipId: 'recorded-member-706',
    evaluatedAt,
    results: codes.map((code): ContractQualityRunView['results'][number] => ({
      code,
      status:
        errors && code === 'PARTY_AVAILABLE'
          ? 'ERROR'
          : code === 'DIRECT_ORIGIN_REVIEWED' ||
              code === 'ADDED_CONDITIONS_CONFIRMED' ||
              code === 'CURRENCY_MATCHES_PARENT'
            ? 'WARNING'
            : 'PASS',
    })),
  };
}

export function pendingQualityContract({
  origin = 'offer',
  bindingVersion = 1,
  latestRun = contractQualityRun({ origin }),
}: {
  origin?: QualityOrigin;
  bindingVersion?: 1 | 2;
  latestRun?: ContractQualityRunView | null;
} = {}) {
  const stored = contractLocaleRecord();
  const snapshot =
    bindingVersion === 1
      ? stored.version.pricingSnapshot
      : {
          ...stored.version.pricingSnapshot,
          subtotal: '290.00',
          taxTotal: '43.50',
          total: '333.50',
          lines: stored.version.pricingSnapshot.lines.map((line) => ({
            ...line,
            adjustment: {
              type: 'FIXED_NET_DISCOUNT',
              netReduction: '10.00',
              taxReduction: '1.50',
              reason: 'Synthetic immutable discount {literal}',
              appliedByWorkspaceMembershipId: contractLocaleIds.member,
              appliedAt: '2026-10-01T08:00:00.000Z',
            },
            adjustedLineNet: '290.00',
            adjustedLineTax: '43.50',
          })),
        };
  const fromOffer = origin === 'offer' || origin === 'precontract';
  return {
    ...stored,
    kind:
      origin === 'addendum'
        ? 'ADDENDUM'
        : origin === 'precontract'
          ? 'PRECONTRACT'
          : 'CONTRACT',
    origin:
      origin === 'addendum'
        ? null
        : origin === 'direct'
          ? 'DIRECT'
          : 'ACCEPTED_OFFER',
    sourceOfferId: fromOffer ? stored.sourceOfferId : null,
    sourceOfferVersionId: fromOffer ? stored.sourceOfferVersionId : null,
    sourceOffer: fromOffer ? stored.sourceOffer : null,
    directReason:
      origin === 'direct' ? 'Synthetic direct reason {literal}' : undefined,
    parentContractId: origin === 'addendum' ? 'parent-contract-706' : null,
    parent:
      origin === 'addendum'
        ? {
            id: 'parent-contract-706',
            kind: 'CONTRACT',
            illustrativeReference: 4,
            versionNumber: 1,
            revision: 3,
          }
        : null,
    addendumOrdinal: origin === 'addendum' ? 1 : null,
    version: {
      ...stored.version,
      qualityRuleSetVersion: bindingVersion,
      pricingSnapshot: snapshot,
      latestQualityRun: latestRun,
      changeSummary:
        origin === 'addendum' ? 'Synthetic change {literal}' : null,
      preliminaryWork:
        origin === 'precontract'
          ? {
              scope: 'Synthetic preliminary scope',
              financialConditions: 'Synthetic advance',
              limits: 'Synthetic limits',
            }
          : null,
    },
  };
}

export function qualityActor(
  role: 'preparer' | 'approver' | 'reader' = 'preparer',
): ActorContext {
  const actor: ActorContext = contractLocaleActor();
  if (!actor.activeCompany) throw new Error('Missing synthetic Company');
  return {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      clientPermissions: [],
      offerPermissions: [],
      pricingUserPermissions: [],
      contractPermissionAssignmentId:
        role === 'approver' ? undefined : 'quality-preparer-706',
      contractPermissionSetVersion: role === 'approver' ? undefined : 'v1',
      contractApproverAssignmentId:
        role === 'approver' ? 'quality-approver-706' : undefined,
      contractApproverPermissionSetVersion:
        role === 'approver' ? 'v1' : undefined,
      contractPermissions:
        role === 'reader'
          ? ['commercial.contract.read']
          : [
              'commercial.contract.read',
              role === 'approver'
                ? 'commercial.contract.approve'
                : 'commercial.contract.prepare',
            ],
    },
  };
}
