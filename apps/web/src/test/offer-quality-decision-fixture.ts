import type {
  OfferDecisionView,
  OfferQualityRunView,
  OfferView,
} from '../offer/offer-response';

// Synthetic HTTP-boundary data, independent of the production message catalog.
export const offerDecisionLocales = [
  {
    code: 'ro',
    name: 'Română',
    language: 'Limba interfeței',
    quality: 'Verificări de calitate',
    decision: 'Decizie internă',
    run: 'Rulează verificările de calitate',
    retryQuality: 'Reîncearcă aceleași verificări de calitate',
    runningQuality: 'Se rulează verificările de calitate…',
    uncertainQuality:
      'Rezultatul este incert. Reîncercarea trimite exact aceeași comandă și aceeași cheie.',
    warnings: 'Verificările s-au încheiat cu avertismente.',
    errors: 'Verificările s-au încheiat cu erori.',
    success: 'Toate verificările de calitate au trecut.',
    approve: 'Aprobă această versiune',
    reject: 'Respinge această versiune',
    reason: 'Motivul respingerii',
    acknowledge: 'Confirmă avertismentele curente',
    runningDecision: 'Se înregistrează decizia…',
    retryDecision: 'Reîncearcă aceeași decizie',
    uncertainDecision:
      'Rezultatul este incert. Reîncercarea trimite exact aceeași decizie, aceleași valori și aceeași cheie.',
    approved: 'Versiune aprobată.',
    rejected: 'Versiune respinsă.',
    warningsChanged:
      'Confirmați exact avertismentele curente. Rulați verificările de calitate pentru a le actualiza.',
    actor: 'Membrul care a decis',
    decidedAt: 'Decis la',
    decisionRun: 'Rularea verificărilor de calitate la aprobare',
    checksum: 'Suma de control a reprezentării aprobate',
    acknowledgedWarnings: 'Avertismente confirmate',
    noWarnings: 'Fără avertismente',
    evaluatedAt: 'Evaluat la',
    qualityActor: 'Membrul care a verificat',
    ruleSet: 'Set de reguli',
    frame: 'Reprezentarea Ofertei ilustrative',
    historyEmpty: 'Nu există versiuni înregistrate.',
    openOne: 'Deschide versiunea 1',
    openTwo: 'Deschide versiunea 2',
    openThree: 'Deschide versiunea 3',
    invalid:
      'Introduceți un motiv de respingere de 1–500 de caractere sau verificați confirmările avertismentelor.',
    rules: [
      'Instantaneul de preț este coerent',
      'Moneda este neschimbată',
      'Valabilitatea este deschisă',
      'Destinatarul este disponibil',
      'Identitatea destinatarului este actuală',
      'Codul fiscal al destinatarului este înregistrat',
      'Contextul Clientului din preț este coerent',
      'Marcajul provizoriu este prezent',
    ],
    pass: 'TRECUT',
    warning: 'AVERTISMENT',
    error: 'EROARE',
    localEvaluation: '3 oct. 2026, 08:00',
    localDecision: '3 oct. 2026, 08:15',
  },
  {
    code: 'ru',
    name: 'Русский',
    language: 'Язык интерфейса',
    quality: 'Проверки качества',
    decision: 'Внутреннее решение',
    run: 'Выполнить проверки качества',
    retryQuality: 'Повторить те же проверки качества',
    runningQuality: 'Выполнение проверок качества…',
    uncertainQuality:
      'Результат неизвестен. Повторная попытка отправит ту же команду и тот же ключ.',
    warnings: 'Проверки завершены с предупреждениями.',
    errors: 'Проверки завершены с ошибками.',
    success: 'Все проверки качества пройдены.',
    approve: 'Одобрить эту версию',
    reject: 'Отклонить эту версию',
    reason: 'Причина отклонения',
    acknowledge: 'Подтвердить текущие предупреждения',
    runningDecision: 'Запись решения…',
    retryDecision: 'Повторить то же решение',
    uncertainDecision:
      'Результат неизвестен. Повторная попытка отправит то же решение, те же значения и тот же ключ.',
    approved: 'Версия одобрена.',
    rejected: 'Версия отклонена.',
    warningsChanged:
      'Подтвердите в точности текущие предупреждения. Выполните проверки качества, чтобы обновить их.',
    actor: 'Участник, принявший решение',
    decidedAt: 'Решение принято',
    decisionRun: 'Запуск проверок качества при одобрении',
    checksum: 'Контрольная сумма одобренного представления',
    acknowledgedWarnings: 'Подтверждённые предупреждения',
    noWarnings: 'Нет предупреждений',
    evaluatedAt: 'Проверено',
    qualityActor: 'Участник, выполнивший проверку',
    ruleSet: 'Набор правил',
    frame: 'Представление иллюстративной Оферты',
    historyEmpty: 'Нет сохранённых версий.',
    openOne: 'Открыть версию 1',
    openTwo: 'Открыть версию 2',
    openThree: 'Открыть версию 3',
    invalid:
      'Введите причину отклонения длиной от 1 до 500 символов или проверьте подтверждения предупреждений.',
    rules: [
      'Снимок цены согласован',
      'Валюта не изменена',
      'Срок действия не истёк',
      'Получатель доступен',
      'Данные получателя актуальны',
      'Налоговый код получателя записан',
      'Контекст Клиента в цене согласован',
      'Предварительная пометка присутствует',
    ],
    pass: 'ПРОЙДЕНО',
    warning: 'ПРЕДУПРЕЖДЕНИЕ',
    error: 'ОШИБКА',
    localEvaluation: '3 окт. 2026 г., 08:00',
    localDecision: '3 окт. 2026 г., 08:15',
  },
  {
    code: 'fr',
    name: 'Français',
    language: 'Langue de l’interface',
    quality: 'Contrôles qualité',
    decision: 'Décision interne',
    run: 'Exécuter les contrôles qualité',
    retryQuality: 'Réessayer les mêmes contrôles qualité',
    runningQuality: 'Exécution des contrôles qualité…',
    uncertainQuality:
      'Le résultat est incertain. Réessayer envoie exactement la même commande et la même clé.',
    warnings: 'Contrôles terminés avec des avertissements.',
    errors: 'Contrôles terminés avec des erreurs.',
    success: 'Tous les contrôles qualité ont réussi.',
    approve: 'Approuver cette version',
    reject: 'Rejeter cette version',
    reason: 'Motif du rejet',
    acknowledge: 'Reconnaître les avertissements actuels',
    runningDecision: 'Enregistrement de la décision…',
    retryDecision: 'Réessayer la même décision',
    uncertainDecision:
      'Le résultat est incertain. Réessayer envoie exactement la même décision, les mêmes valeurs et la même clé.',
    approved: 'Version approuvée.',
    rejected: 'Version rejetée.',
    warningsChanged:
      'Reconnaissez exactement les avertissements actuels. Exécutez les contrôles qualité pour les actualiser.',
    actor: 'Membre décisionnaire',
    decidedAt: 'Décidé le',
    decisionRun: 'Exécution des contrôles qualité à l’approbation',
    checksum: 'Empreinte de la représentation approuvée',
    acknowledgedWarnings: 'Avertissements reconnus',
    noWarnings: 'Aucun avertissement',
    evaluatedAt: 'Évalué le',
    qualityActor: 'Membre ayant effectué les contrôles',
    ruleSet: 'Jeu de règles',
    frame: 'Représentation de l’Offre illustrative',
    historyEmpty: 'Aucune version enregistrée.',
    openOne: 'Ouvrir la version 1',
    openTwo: 'Ouvrir la version 2',
    openThree: 'Ouvrir la version 3',
    invalid:
      'Saisissez un motif de rejet de 1 à 500 caractères ou vérifiez la reconnaissance des avertissements.',
    rules: [
      'Instantané de tarification cohérent',
      'Devise inchangée',
      'Validité en cours',
      'Destinataire disponible',
      'Identité du destinataire à jour',
      'Identifiant fiscal du destinataire renseigné',
      'Contexte du Client dans la tarification cohérent',
      'Marqueur provisoire présent',
    ],
    pass: 'RÉUSSI',
    warning: 'AVERTISSEMENT',
    error: 'ERREUR',
    localEvaluation: '3 oct. 2026, 08:00',
    localDecision: '3 oct. 2026, 08:15',
  },
  {
    code: 'en',
    name: 'English',
    language: 'Interface language',
    quality: 'Quality Checks',
    decision: 'Internal decision',
    run: 'Run Quality Checks',
    retryQuality: 'Retry the same Quality Checks',
    runningQuality: 'Running Quality Checks…',
    uncertainQuality:
      'The outcome is uncertain. Retry sends the exact same command and key.',
    warnings: 'Checks completed with warnings.',
    errors: 'Checks completed with errors.',
    success: 'All Quality Checks passed.',
    approve: 'Approve this version',
    reject: 'Reject this version',
    reason: 'Rejection reason',
    acknowledge: 'Acknowledge current warnings',
    runningDecision: 'Recording decision…',
    retryDecision: 'Retry the same decision',
    uncertainDecision:
      'The outcome is uncertain. Retry sends the exact same decision, values and key.',
    approved: 'Version approved.',
    rejected: 'Version rejected.',
    warningsChanged:
      'Acknowledge exactly the current warnings. Run Quality Checks to refresh them.',
    actor: 'Deciding membership',
    decidedAt: 'Decided at',
    decisionRun: 'Approval Quality Check run',
    checksum: 'Approved representation checksum',
    acknowledgedWarnings: 'Acknowledged warnings',
    noWarnings: 'No warnings',
    evaluatedAt: 'Evaluated at',
    qualityActor: 'Checking membership',
    ruleSet: 'Rule set',
    frame: 'Illustrative Offer representation',
    historyEmpty: 'No versions recorded.',
    openOne: 'Open version 1',
    openTwo: 'Open version 2',
    openThree: 'Open version 3',
    invalid:
      'Enter a rejection reason of 1–500 characters, or check the warning acknowledgements.',
    rules: [
      'Pricing Snapshot coherent',
      'Currency unchanged',
      'Validity open',
      'Recipient available',
      'Recipient identity current',
      'Recipient tax ID recorded',
      'Pricing Client context coherent',
      'Provisional marker present',
    ],
    pass: 'PASS',
    warning: 'WARNING',
    error: 'ERROR',
    localEvaluation: 'Oct 3, 2026, 8:00 AM',
    localDecision: 'Oct 3, 2026, 8:15 AM',
  },
] as const;

export const literalRejectionReason =
  '  Clarificare {exactă} / Révision / Причина\nLinia a doua  ';

export function recordedDecision({
  offer,
  kind,
  warning = true,
}: {
  offer: OfferView;
  kind: 'approve' | 'reject';
  warning?: boolean;
}): OfferDecisionView {
  const common = {
    id: `decision-${offer.version.id}`,
    offerVersionId: offer.version.id,
    offerRevision: offer.revision + 1,
    actorWorkspaceMembershipId: 'membership-one',
    decidedAt: '2026-10-03T12:15:00.000Z',
  };
  if (kind === 'reject')
    return { ...common, state: 'REJECTED', reason: literalRejectionReason };
  return {
    ...common,
    state: 'APPROVED',
    qualityRun: {
      ...qualityRun({
        bindingVersion: offer.version.qualityRuleSetVersion,
        versionId: offer.version.id,
        id: `approval-run-${offer.version.id}`,
        warning,
      }),
      evaluatedAt: common.decidedAt,
    },
    acknowledgedWarningCodes: warning ? ['RECIPIENT_TAX_ID_RECORDED'] : [],
    representationSha256: offer.version.representation.sha256,
  };
}

export function withRecordedDecision({
  offer,
  kind,
  warning = true,
}: {
  offer: OfferView;
  kind: 'approve' | 'reject';
  warning?: boolean;
}): OfferView {
  const decision = recordedDecision({ offer, kind, warning });
  return {
    ...offer,
    revision: decision.offerRevision,
    version: {
      ...offer.version,
      decision,
      decisionState: decision.state,
      latestQualityRun:
        decision.state === 'APPROVED'
          ? decision.qualityRun
          : offer.version.latestQualityRun,
    },
  };
}

export function qualityRun({
  bindingVersion = 1,
  versionId = 'version-one',
  id = 'run-one',
  warning = true,
  error = false,
}: {
  bindingVersion?: 1 | 2;
  versionId?: string;
  id?: string;
  warning?: boolean;
  error?: boolean;
} = {}): OfferQualityRunView {
  return {
    id,
    offerVersionId: versionId,
    ruleSet: 'OFFER_QUALITY_ILLUSTRATIVE',
    ruleSetVersion: bindingVersion,
    actorWorkspaceMembershipId: 'membership-one',
    evaluatedAt: '2026-10-03T12:00:00.000Z',
    results: [
      { code: 'PRICING_SNAPSHOT_COHERENT', status: 'PASS' },
      { code: 'CURRENCY_UNCHANGED', status: 'PASS' },
      { code: 'VALIDITY_OPEN', status: error ? 'ERROR' : 'PASS' },
      { code: 'RECIPIENT_AVAILABLE', status: 'PASS' },
      { code: 'RECIPIENT_IDENTITY_CURRENT', status: 'PASS' },
      {
        code: 'RECIPIENT_TAX_ID_RECORDED',
        status: warning ? 'WARNING' : 'PASS',
      },
      { code: 'PRICING_CLIENT_CONTEXT_COHERENT', status: 'PASS' },
      { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
    ],
  };
}

export function pendingOffer({
  bindingVersion = 1,
  offerId = 'offer-one',
  versionId = 'version-one',
  latestRun = true,
}: {
  bindingVersion?: 1 | 2;
  offerId?: string;
  versionId?: string;
  latestRun?: boolean;
} = {}): OfferView {
  return {
    id: offerId,
    illustrativeReference: 1,
    revision: 1,
    version: {
      id: versionId,
      createdAt: '2026-09-27T09:00:00.000Z',
      qualityRuleSet: 'OFFER_QUALITY_ILLUSTRATIVE',
      qualityRuleSetVersion: bindingVersion,
      latestQualityRun: latestRun
        ? qualityRun({ bindingVersion, versionId })
        : null,
      versionNumber: 1,
      predecessorVersionId: null,
      supersededByVersionId: null,
      supersededAt: null,
      differences: [],
      pricingSnapshotId: 'snapshot-one',
      pricingSnapshot: {
        id: 'snapshot-one',
        currency: 'EUR',
        total: '345.00',
        committedAt: '2026-09-27T09:00:00.000Z',
      },
      recipient: {
        kind: 'PRIMARY',
        legalName: 'Entité littérale / Юрлицо',
        taxId: null,
        legalAddress: null,
        additionalLegalEntityId: null,
      },
      issuingCompanyLabel: 'Synthetic Company',
      validityDays: 30,
      validUntil: '2026-10-27T09:00:00.000Z',
      scopeNote: 'Domeniu {literal} / scope',
      commercialConditions: 'Condiții literale / conditions',
      decisionState: 'PENDING',
      decision: null,
      transmissionState: 'NOT_TRANSMITTED',
      transmission: null,
      clientResponseState: 'NONE',
      clientResponse: null,
      validityElapsed: false,
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      representation: {
        templateCode: 'OFFER_ILLUSTRATIVE',
        templateVersion: bindingVersion,
        html:
          bindingVersion === 1
            ? '<!doctype html><html lang="en"><body><h1>Illustrative Offer</h1></body></html>'
            : '<!doctype html><html lang="en"><body><h1>Illustrative Offer</h1><p>Fixed discount: Synthetic adjustment</p><footer>OFFER_ILLUSTRATIVE v2</footer></body></html>',
        sha256:
          bindingVersion === 1
            ? 'e08e76ef771b57620b188b0e65648e93f47dbf7c88fd8582a403e4e4f75eaf34'
            : '093cbf708e3ee8a51419c13f2d42152033b63b72726167f6a7bfe9f5d4045a69',
      },
    },
  };
}
