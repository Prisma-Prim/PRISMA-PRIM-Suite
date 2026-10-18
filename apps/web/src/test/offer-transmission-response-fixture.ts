import type {
  OfferClientResponseView,
  OfferTransmissionView,
  OfferView,
} from '../offer/offer-response';
import {
  offerDecisionLocales,
  pendingOffer,
  qualityRun,
  withRecordedDecision,
} from './offer-quality-decision-fixture';

export const literalSimulationNote =
  '  Notă {exactă} / Révision / Причина\nLinia a doua  ';
export const literalClientReason =
  '  Refuz {literal} / Refus / Отказ\nLinia a doua  ';
export const literalReceivedAt = '2026-10-03T12:35:00.000Z';

// Independent public-sentence oracles. No production message imports.
const expected = {
  ro: {
    transmission: 'Transmitere simulată',
    note: 'Nota simulării',
    record: 'Înregistrează transmiterea simulată',
    runningTransmission: 'Se înregistrează transmiterea simulată…',
    retryTransmission: 'Reîncearcă aceeași transmitere',
    uncertainTransmission:
      'Rezultatul este incert. Reîncercarea trimite exact aceeași transmitere, aceleași valori și aceeași cheie.',
    transmissionActor: 'Membrul care a transmis',
    transmittedAt: 'Transmiterea simulată a fost înregistrată la',
    transmissionRun: 'Rularea verificărilor de calitate la transmitere',
    transmissionWarnings: 'Avertismente confirmate la transmitere',
    transmissionChecksum: 'Suma de control SHA-256 transmisă',
    noNote: 'Fără notă a simulării',
    response: 'Răspuns simulat al Clientului',
    received: 'Data și ora primirii declarate (UTC)',
    recordedReceived: 'Data și ora primirii declarate',
    clientReason: 'Motivul refuzului Clientului',
    acceptClient: 'Înregistrează acceptarea simulată',
    rejectClient: 'Înregistrează refuzul simulat al Clientului',
    expireClient: 'Înregistrează expirarea simulată',
    runningResponse: 'Se înregistrează răspunsul simulat al Clientului…',
    retryResponse: 'Reîncearcă același răspuns al Clientului',
    uncertainResponse:
      'Rezultatul este incert. Reîncercarea trimite exact același rezultat, aceleași valori, aceeași revizie și aceeași cheie.',
    responseActor: 'Membrul care a înregistrat răspunsul',
    responseDecided: 'Răspunsul Clientului a fost înregistrat la',
    pendingElapsed:
      'Valabilitate încheiată · răspunsul Clientului este în așteptare. Nimic nu expiră automat.',
    back: 'Înapoi la Solicitări',
    localTransmission: '3 oct. 2026, 08:30',
    localResponse: '3 oct. 2026, 08:45',
    localReceived: '3 oct. 2026, 08:35',
    outcomes: {
      ACCEPTED: 'Acceptare simulată a Clientului înregistrată',
      REJECTED: 'Refuz simulat al Clientului înregistrat',
      EXPIRED: 'Expirare simulată înregistrată',
    },
  },
  ru: {
    transmission: 'Симуляция отправки',
    note: 'Примечание к симуляции',
    record: 'Записать симуляцию отправки',
    runningTransmission: 'Запись симуляции отправки…',
    retryTransmission: 'Повторить ту же отправку',
    uncertainTransmission:
      'Результат неизвестен. Повторная попытка отправит ту же отправку, те же значения и тот же ключ.',
    transmissionActor: 'Участник, записавший отправку',
    transmittedAt: 'Симуляция отправки записана',
    transmissionRun: 'Запуск проверок качества при отправке',
    transmissionWarnings: 'Предупреждения, подтверждённые при отправке',
    transmissionChecksum: 'Отправленная контрольная сумма SHA-256',
    noNote: 'Нет примечания к симуляции',
    response: 'Симуляция ответа Клиента',
    received: 'Заявленные дата и время получения (UTC)',
    recordedReceived: 'Заявленные дата и время получения',
    clientReason: 'Причина отказа Клиента',
    acceptClient: 'Записать симуляцию принятия',
    rejectClient: 'Записать симуляцию отказа Клиента',
    expireClient: 'Записать симуляцию истечения срока',
    runningResponse: 'Запись симуляции ответа Клиента…',
    retryResponse: 'Повторить тот же ответ Клиента',
    uncertainResponse:
      'Результат неизвестен. Повторная попытка отправит тот же результат, те же значения, ту же ревизию и тот же ключ.',
    responseActor: 'Участник, записавший ответ',
    responseDecided: 'Ответ Клиента записан',
    pendingElapsed:
      'Срок действия истёк · ответ Клиента ожидается. Ничто не истекает автоматически.',
    back: 'Назад к Запросам',
    localTransmission: '3 окт. 2026 г., 08:30',
    localResponse: '3 окт. 2026 г., 08:45',
    localReceived: '3 окт. 2026 г., 08:35',
    outcomes: {
      ACCEPTED: 'Симуляция принятия Клиентом записана',
      REJECTED: 'Симуляция отказа Клиента записана',
      EXPIRED: 'Симуляция истечения срока записана',
    },
  },
  fr: {
    transmission: 'Transmission simulée',
    note: 'Note de simulation',
    record: 'Enregistrer la transmission simulée',
    runningTransmission: 'Enregistrement de la transmission simulée…',
    retryTransmission: 'Réessayer la même transmission',
    uncertainTransmission:
      'Le résultat est incertain. Réessayer envoie exactement la même transmission, les mêmes valeurs et la même clé.',
    transmissionActor: 'Membre ayant transmis',
    transmittedAt: 'Transmission simulée enregistrée le',
    transmissionRun: 'Exécution des contrôles qualité à la transmission',
    transmissionWarnings: 'Avertissements reconnus à la transmission',
    transmissionChecksum: 'Empreinte SHA-256 transmise',
    noNote: 'Aucune note de simulation',
    response: 'Réponse simulée du Client',
    received: 'Date et heure de réception déclarées (UTC)',
    recordedReceived: 'Date et heure de réception déclarées',
    clientReason: 'Motif du refus du Client',
    acceptClient: 'Enregistrer l’acceptation simulée',
    rejectClient: 'Enregistrer le refus simulé du Client',
    expireClient: 'Enregistrer l’expiration simulée',
    runningResponse: 'Enregistrement de la réponse simulée du Client…',
    retryResponse: 'Réessayer la même réponse du Client',
    uncertainResponse:
      'Le résultat est incertain. Réessayer envoie exactement le même résultat, les mêmes valeurs, la même révision et la même clé.',
    responseActor: 'Membre ayant enregistré la réponse',
    responseDecided: 'Réponse du Client enregistrée le',
    pendingElapsed:
      'Validité terminée · réponse du Client en attente. Rien n’expire automatiquement.',
    back: 'Retour aux Demandes',
    localTransmission: '3 oct. 2026, 08:30',
    localResponse: '3 oct. 2026, 08:45',
    localReceived: '3 oct. 2026, 08:35',
    outcomes: {
      ACCEPTED: 'Acceptation simulée du Client enregistrée',
      REJECTED: 'Refus simulé du Client enregistré',
      EXPIRED: 'Expiration simulée enregistrée',
    },
  },
  en: {
    transmission: 'Simulated transmission',
    note: 'Simulation note',
    record: 'Record simulated transmission',
    runningTransmission: 'Recording simulated transmission…',
    retryTransmission: 'Retry the same transmission',
    uncertainTransmission:
      'The outcome is uncertain. Retry sends the exact same transmission, values and key.',
    transmissionActor: 'Transmitting membership',
    transmittedAt: 'Simulated transmission recorded at',
    transmissionRun: 'Transmission Quality Check run',
    transmissionWarnings: 'Warnings acknowledged at transmission',
    transmissionChecksum: 'Transmitted SHA-256 checksum',
    noNote: 'No simulation note',
    response: 'Simulated Client response',
    received: 'Reported received time (UTC)',
    recordedReceived: 'Reported received time',
    clientReason: 'Client rejection reason',
    acceptClient: 'Record simulated acceptance',
    rejectClient: 'Record simulated Client rejection',
    expireClient: 'Record simulated expiry',
    runningResponse: 'Recording simulated Client response…',
    retryResponse: 'Retry the same Client response',
    uncertainResponse:
      'The outcome is uncertain. Retry sends the exact same outcome, values, revision and key.',
    responseActor: 'Response recording membership',
    responseDecided: 'Client response recorded at',
    pendingElapsed:
      'Validity elapsed · Client response pending. Nothing expires automatically.',
    back: 'Back to Requests',
    localTransmission: 'Oct 3, 2026, 8:30 AM',
    localResponse: 'Oct 3, 2026, 8:45 AM',
    localReceived: 'Oct 3, 2026, 8:35 AM',
    outcomes: {
      ACCEPTED: 'Simulated Client acceptance recorded',
      REJECTED: 'Simulated Client rejection recorded',
      EXPIRED: 'Simulated expiry recorded',
    },
  },
};
export const offerTransmissionLocales = offerDecisionLocales.map((locale) => ({
  ...locale,
  ...expected[locale.code],
}));

export function approvedTransmissionOffer({
  offerId = 'offer-one',
  versionId = 'version-one',
  bindingVersion = 1,
}: {
  offerId?: string;
  versionId?: string;
  bindingVersion?: 1 | 2;
} = {}): OfferView {
  const approved = withRecordedDecision({
    offer: pendingOffer({ offerId, versionId, bindingVersion }),
    kind: 'approve',
    warning: false,
  });
  return {
    ...approved,
    version: {
      ...approved.version,
      latestQualityRun: {
        ...qualityRun({
          versionId,
          bindingVersion,
          id: `new-warning-${versionId}`,
        }),
        evaluatedAt: '2026-10-03T12:20:00.000Z',
      },
    },
  };
}

export function transmissionRecord({
  offer,
  note = literalSimulationNote,
  warning = true,
}: {
  offer: OfferView;
  note?: string | null;
  warning?: boolean;
}): OfferTransmissionView {
  return {
    id: `transmission-${offer.version.id}`,
    offerVersionId: offer.version.id,
    offerRevision: offer.revision + 1,
    actorWorkspaceMembershipId: 'membership-one',
    transmittedAt: '2026-10-03T12:30:00.000Z',
    channel: 'SIMULATED',
    note,
    qualityRun: {
      ...qualityRun({
        versionId: offer.version.id,
        bindingVersion: offer.version.qualityRuleSetVersion,
        id: `transmission-run-${offer.version.id}`,
        warning,
      }),
      evaluatedAt: '2026-10-03T12:30:00.000Z',
    },
    acknowledgedWarningCodes: warning ? ['RECIPIENT_TAX_ID_RECORDED'] : [],
    representationSha256: offer.version.representation.sha256,
  };
}

export function withTransmission({
  offer = approvedTransmissionOffer(),
  note = literalSimulationNote,
  warning = true,
}: {
  offer?: OfferView;
  note?: string | null;
  warning?: boolean;
} = {}): OfferView {
  const transmission = transmissionRecord({ offer, note, warning });
  return {
    ...offer,
    revision: transmission.offerRevision,
    version: {
      ...offer.version,
      transmissionState: 'TRANSMITTED',
      transmission,
      clientResponseState: 'PENDING',
      clientResponse: null,
      latestQualityRun: transmission.qualityRun,
    },
  };
}

export function clientResponseRecord({
  offer,
  outcome,
}: {
  offer: OfferView;
  outcome: OfferClientResponseView['outcome'];
}): OfferClientResponseView {
  const common = {
    id: `response-${offer.version.id}`,
    offerVersionId: offer.version.id,
    offerRevision: offer.revision + 1,
    actorWorkspaceMembershipId: 'membership-one',
    decidedAt:
      outcome === 'EXPIRED'
        ? offer.version.validUntil
        : '2026-10-03T12:45:00.000Z',
    evidenceKind: 'SIMULATED',
  } satisfies Omit<OfferClientResponseView, 'outcome'>;
  switch (outcome) {
    case 'ACCEPTED':
      return { ...common, outcome, receivedAt: literalReceivedAt };
    case 'REJECTED':
      return {
        ...common,
        outcome,
        receivedAt: literalReceivedAt,
        reason: literalClientReason,
      };
    case 'EXPIRED':
      return { ...common, outcome };
    default: {
      const exhaustive: never = outcome;
      return exhaustive;
    }
  }
}

export function withClientResponse({
  offer,
  outcome,
}: {
  offer: OfferView;
  outcome: OfferClientResponseView['outcome'];
}): OfferView {
  const response = clientResponseRecord({ offer, outcome });
  const base = { ...offer, revision: response.offerRevision };
  const version = { ...offer.version, validityElapsed: outcome === 'EXPIRED' };
  switch (response.outcome) {
    case 'ACCEPTED':
      return {
        ...base,
        version: {
          ...version,
          transmissionState: 'TRANSMITTED',
          transmission: requiredTransmission(offer),
          clientResponseState: 'ACCEPTED',
          clientResponse: response,
        },
      };
    case 'REJECTED':
      return {
        ...base,
        version: {
          ...version,
          transmissionState: 'TRANSMITTED',
          transmission: requiredTransmission(offer),
          clientResponseState: 'REJECTED',
          clientResponse: response,
        },
      };
    case 'EXPIRED':
      return {
        ...base,
        version: {
          ...version,
          transmissionState: 'TRANSMITTED',
          transmission: requiredTransmission(offer),
          clientResponseState: 'EXPIRED',
          clientResponse: response,
        },
      };
    default: {
      const exhaustive: never = response;
      return exhaustive;
    }
  }
}
function requiredTransmission(offer: OfferView): OfferTransmissionView {
  if (!offer.version.transmission)
    throw new Error('Synthetic response requires a transmission.');
  return offer.version.transmission;
}
