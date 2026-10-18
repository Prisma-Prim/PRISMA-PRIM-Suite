import { defineMessages, useMessages } from '../localization/messages';
import { offerClientResponseCopy, offerTransmissionCopy } from './offer.copy';

const keys = [
  'transmissionTitle',
  'transmissionExplanation',
  'transmissionRecord',
  'transmissionNote',
  'transmissionNoNote',
  'transmissionAcknowledge',
  'transmissionRunning',
  'transmissionRetry',
  'transmissionUncertain',
  'transmissionInvalid',
  'transmissionDenied',
  'transmissionUnavailable',
  'transmissionStale',
  'transmissionSuperseded',
  'transmissionNotApproved',
  'transmissionAlreadyTransmitted',
  'transmissionMismatch',
  'transmissionConflict',
  'transmissionQualityErrors',
  'transmissionWarningsChanged',
  'transmissionSuccess',
  'transmissionActor',
  'transmissionTransmittedAt',
  'transmissionRun',
  'transmissionChecksum',
  'transmissionWarnings',
  'responseTitle',
  'responseExplanation',
  'responseReceivedAt',
  'responseRecordedReceivedAt',
  'responseTimeExample',
  'responseReceivedHelp',
  'responseReason',
  'responseAccept',
  'responseReject',
  'responseExpire',
  'responseRunning',
  'responseRetry',
  'responseUncertain',
  'responseInvalid',
  'responseDenied',
  'responseUnavailable',
  'responseStale',
  'responseSuperseded',
  'responseAlreadyRecorded',
  'responseNotTransmitted',
  'responseElapsed',
  'responseNotElapsed',
  'responseConflict',
  'responsePendingElapsed',
  'responseACCEPTED',
  'responseREJECTED',
  'responseEXPIRED',
  'responseActor',
  'responseDecidedAt',
] as const;

export const offerTransmissionResponseMessages = defineMessages(keys, {
  en: {
    transmissionTitle: offerTransmissionCopy.title,
    transmissionExplanation: offerTransmissionCopy.explanation,
    transmissionRecord: offerTransmissionCopy.record,
    transmissionNote: offerTransmissionCopy.note,
    transmissionNoNote: offerTransmissionCopy.noNote,
    transmissionAcknowledge: offerTransmissionCopy.acknowledge,
    transmissionRunning: offerTransmissionCopy.running,
    transmissionRetry: offerTransmissionCopy.retry,
    transmissionUncertain: offerTransmissionCopy.uncertain,
    transmissionInvalid: offerTransmissionCopy.invalid,
    transmissionDenied: offerTransmissionCopy.denied,
    transmissionUnavailable: offerTransmissionCopy.unavailable,
    transmissionStale: offerTransmissionCopy.stale,
    transmissionSuperseded: offerTransmissionCopy.superseded,
    transmissionNotApproved: offerTransmissionCopy.notApproved,
    transmissionAlreadyTransmitted: offerTransmissionCopy.alreadyTransmitted,
    transmissionMismatch: offerTransmissionCopy.mismatch,
    transmissionConflict: offerTransmissionCopy.conflict,
    transmissionQualityErrors: offerTransmissionCopy.qualityErrors,
    transmissionWarningsChanged: offerTransmissionCopy.warningsChanged,
    transmissionSuccess: offerTransmissionCopy.success,
    transmissionActor: offerTransmissionCopy.actor,
    transmissionTransmittedAt: offerTransmissionCopy.transmittedAt,
    transmissionRun: offerTransmissionCopy.run,
    transmissionChecksum: offerTransmissionCopy.checksum,
    transmissionWarnings: offerTransmissionCopy.warnings,
    responseTitle: offerClientResponseCopy.title,
    responseExplanation: offerClientResponseCopy.explanation,
    responseReceivedAt: offerClientResponseCopy.receivedAt,
    responseRecordedReceivedAt: offerClientResponseCopy.recordedReceivedAt,
    responseTimeExample: offerClientResponseCopy.timeExample,
    responseReceivedHelp: offerClientResponseCopy.receivedHelp,
    responseReason: offerClientResponseCopy.reason,
    responseAccept: offerClientResponseCopy.accept,
    responseReject: offerClientResponseCopy.reject,
    responseExpire: offerClientResponseCopy.expire,
    responseRunning: offerClientResponseCopy.running,
    responseRetry: offerClientResponseCopy.retry,
    responseUncertain: offerClientResponseCopy.uncertain,
    responseInvalid: offerClientResponseCopy.invalid,
    responseDenied: offerClientResponseCopy.denied,
    responseUnavailable: offerClientResponseCopy.unavailable,
    responseStale: offerClientResponseCopy.stale,
    responseSuperseded: offerClientResponseCopy.superseded,
    responseAlreadyRecorded: offerClientResponseCopy.alreadyRecorded,
    responseNotTransmitted: offerClientResponseCopy.notTransmitted,
    responseElapsed: offerClientResponseCopy.elapsed,
    responseNotElapsed: offerClientResponseCopy.notElapsed,
    responseConflict: offerClientResponseCopy.conflict,
    responsePendingElapsed: offerClientResponseCopy.pendingElapsed,
    responseACCEPTED: offerClientResponseCopy.ACCEPTED,
    responseREJECTED: offerClientResponseCopy.REJECTED,
    responseEXPIRED: offerClientResponseCopy.EXPIRED,
    responseActor: offerClientResponseCopy.actor,
    responseDecidedAt: offerClientResponseCopy.decidedAt,
  },
  ro: {
    transmissionTitle: 'Transmitere simulată',
    transmissionExplanation:
      'Înregistrați o simulare provizorie a acestei versiuni aprobate. Nu se trimite niciun mesaj. Aceasta nu confirmă acceptarea Clientului.',
    transmissionRecord: 'Înregistrează transmiterea simulată',
    transmissionNote: 'Nota simulării',
    transmissionNoNote: 'Fără notă a simulării',
    transmissionAcknowledge: 'Confirmă avertismentele neconfirmate la aprobare',
    transmissionRunning: 'Se înregistrează transmiterea simulată…',
    transmissionRetry: 'Reîncearcă aceeași transmitere',
    transmissionUncertain:
      'Rezultatul este incert. Reîncercarea trimite exact aceeași transmitere, aceleași valori și aceeași cheie.',
    transmissionInvalid:
      'Folosiți o notă de cel mult 500 de caractere și verificați confirmările avertismentelor.',
    transmissionDenied: 'Accesul la transmitere nu mai este disponibil.',
    transmissionUnavailable:
      'Versiunea Ofertei nu mai este disponibilă. Reîncărcați Solicitarea.',
    transmissionStale:
      'Oferta s-a schimbat. Reîncărcați Solicitarea înainte de transmitere.',
    transmissionSuperseded:
      'Această versiune a fost înlocuită. Reîncărcați Solicitarea.',
    transmissionNotApproved:
      'Această versiune nu mai este aprobată. Reîncărcați Solicitarea.',
    transmissionAlreadyTransmitted:
      'Această versiune are deja o transmitere simulată. Reîncărcați Solicitarea.',
    transmissionMismatch:
      'Reprezentarea nu corespunde versiunii aprobate. Reîncărcați Solicitarea.',
    transmissionConflict:
      'Această reîncercare nu mai corespunde. Reîncărcați Solicitarea.',
    transmissionQualityErrors:
      'Erorile curente ale verificărilor de calitate împiedică transmiterea. Rulați verificările de calitate pentru a le consulta.',
    transmissionWarningsChanged:
      'Confirmați exact avertismentele noi. Rulați verificările de calitate pentru a le actualiza.',
    transmissionSuccess:
      'Transmitere simulată înregistrată · răspunsul Clientului este în așteptare',
    transmissionActor: 'Membrul care a transmis',
    transmissionTransmittedAt: 'Transmiterea simulată a fost înregistrată la',
    transmissionRun: 'Rularea verificărilor de calitate la transmitere',
    transmissionChecksum: 'Suma de control SHA-256 transmisă',
    transmissionWarnings: 'Avertismente confirmate la transmitere',
    responseTitle: 'Răspuns simulat al Clientului',
    responseExplanation:
      'Înregistrați un rezultat simulat provizoriu pentru această versiune exactă transmisă. Această dovadă nu are efect juridic.',
    responseReceivedAt: 'Data și ora primirii declarate (UTC)',
    responseRecordedReceivedAt: 'Data și ora primirii declarate',
    responseTimeExample: '2026-10-03T14:30:00.000Z',
    responseReceivedHelp:
      'Folosiți o dată și oră UTC între transmitere și momentul curent, strict înainte de încheierea valabilității. Un răspuns primit la timp poate fi înregistrat ulterior.',
    responseReason: 'Motivul refuzului Clientului',
    responseAccept: 'Înregistrează acceptarea simulată',
    responseReject: 'Înregistrează refuzul simulat al Clientului',
    responseExpire: 'Înregistrează expirarea simulată',
    responseRunning: 'Se înregistrează răspunsul simulat al Clientului…',
    responseRetry: 'Reîncearcă același răspuns al Clientului',
    responseUncertain:
      'Rezultatul este incert. Reîncercarea trimite exact același rezultat, aceleași valori, aceeași revizie și aceeași cheie.',
    responseInvalid:
      'Verificați data și ora primirii. Un refuz necesită un motiv de 1–500 de caractere.',
    responseDenied: 'Accesul la răspunsul Clientului nu mai este disponibil.',
    responseUnavailable:
      'Versiunea Ofertei nu mai este disponibilă. Reîncărcați Solicitarea.',
    responseStale:
      'Oferta s-a schimbat. Reîncărcați Solicitarea înainte de a înregistra răspunsul Clientului.',
    responseSuperseded:
      'Această versiune a fost înlocuită. Reîncărcați Solicitarea.',
    responseAlreadyRecorded:
      'Această versiune are deja un răspuns al Clientului. Reîncărcați Solicitarea.',
    responseNotTransmitted:
      'Această versiune nu este transmisă. Reîncărcați Solicitarea.',
    responseElapsed:
      'Răspunsul declarat a fost primit după încheierea valabilității. Corectați data și ora primirii sau înregistrați expirarea.',
    responseNotElapsed:
      'Valabilitatea nu s-a încheiat. Expirarea nu poate fi înregistrată încă.',
    responseConflict:
      'Această reîncercare nu mai corespunde. Reîncărcați Solicitarea.',
    responsePendingElapsed:
      'Valabilitate încheiată · răspunsul Clientului este în așteptare. Nimic nu expiră automat.',
    responseACCEPTED: 'Acceptare simulată a Clientului înregistrată',
    responseREJECTED: 'Refuz simulat al Clientului înregistrat',
    responseEXPIRED: 'Expirare simulată înregistrată',
    responseActor: 'Membrul care a înregistrat răspunsul',
    responseDecidedAt: 'Răspunsul Clientului a fost înregistrat la',
  },
  ru: {
    transmissionTitle: 'Симуляция отправки',
    transmissionExplanation:
      'Запишите предварительную симуляцию отправки этой одобренной версии. Сообщение не отправляется. Это не подтверждает принятие Клиентом.',
    transmissionRecord: 'Записать симуляцию отправки',
    transmissionNote: 'Примечание к симуляции',
    transmissionNoNote: 'Нет примечания к симуляции',
    transmissionAcknowledge:
      'Подтвердить предупреждения, не подтверждённые при одобрении',
    transmissionRunning: 'Запись симуляции отправки…',
    transmissionRetry: 'Повторить ту же отправку',
    transmissionUncertain:
      'Результат неизвестен. Повторная попытка отправит ту же отправку, те же значения и тот же ключ.',
    transmissionInvalid:
      'Используйте примечание не длиннее 500 символов и проверьте подтверждения предупреждений.',
    transmissionDenied: 'Доступ к отправке больше недоступен.',
    transmissionUnavailable:
      'Версия Оферты больше недоступна. Перезагрузите Запрос.',
    transmissionStale:
      'Оферта изменилась. Перезагрузите Запрос перед отправкой.',
    transmissionSuperseded: 'Эта версия заменена. Перезагрузите Запрос.',
    transmissionNotApproved:
      'Эта версия больше не одобрена. Перезагрузите Запрос.',
    transmissionAlreadyTransmitted:
      'Для этой версии уже записана симуляция отправки. Перезагрузите Запрос.',
    transmissionMismatch:
      'Представление не соответствует одобренной версии. Перезагрузите Запрос.',
    transmissionConflict:
      'Эта повторная попытка больше не соответствует исходной. Перезагрузите Запрос.',
    transmissionQualityErrors:
      'Текущие ошибки проверок качества не позволяют отправить версию. Выполните проверки качества, чтобы просмотреть их.',
    transmissionWarningsChanged:
      'Подтвердите в точности новые предупреждения. Выполните проверки качества, чтобы обновить их.',
    transmissionSuccess:
      'Симуляция отправки записана · ответ Клиента ожидается',
    transmissionActor: 'Участник, записавший отправку',
    transmissionTransmittedAt: 'Симуляция отправки записана',
    transmissionRun: 'Запуск проверок качества при отправке',
    transmissionChecksum: 'Отправленная контрольная сумма SHA-256',
    transmissionWarnings: 'Предупреждения, подтверждённые при отправке',
    responseTitle: 'Симуляция ответа Клиента',
    responseExplanation:
      'Запишите предварительный симулированный результат для этой точной отправленной версии. Это свидетельство не имеет юридической силы.',
    responseReceivedAt: 'Заявленные дата и время получения (UTC)',
    responseRecordedReceivedAt: 'Заявленные дата и время получения',
    responseTimeExample: '2026-10-03T14:30:00.000Z',
    responseReceivedHelp:
      'Используйте время UTC между отправкой и текущим моментом, строго до окончания срока действия. Своевременный ответ можно записать позднее.',
    responseReason: 'Причина отказа Клиента',
    responseAccept: 'Записать симуляцию принятия',
    responseReject: 'Записать симуляцию отказа Клиента',
    responseExpire: 'Записать симуляцию истечения срока',
    responseRunning: 'Запись симуляции ответа Клиента…',
    responseRetry: 'Повторить тот же ответ Клиента',
    responseUncertain:
      'Результат неизвестен. Повторная попытка отправит тот же результат, те же значения, ту же ревизию и тот же ключ.',
    responseInvalid:
      'Проверьте время получения. Для отказа нужна причина длиной от 1 до 500 символов.',
    responseDenied: 'Доступ к ответу Клиента больше недоступен.',
    responseUnavailable:
      'Версия Оферты больше недоступна. Перезагрузите Запрос.',
    responseStale:
      'Оферта изменилась. Перезагрузите Запрос перед записью ответа Клиента.',
    responseSuperseded: 'Эта версия заменена. Перезагрузите Запрос.',
    responseAlreadyRecorded:
      'Для этой версии уже записан ответ Клиента. Перезагрузите Запрос.',
    responseNotTransmitted: 'Эта версия не отправлена. Перезагрузите Запрос.',
    responseElapsed:
      'Заявленный ответ получен после окончания срока действия. Исправьте время получения или запишите истечение срока.',
    responseNotElapsed:
      'Срок действия ещё не истёк. Истечение срока пока нельзя записать.',
    responseConflict:
      'Эта повторная попытка больше не соответствует исходной. Перезагрузите Запрос.',
    responsePendingElapsed:
      'Срок действия истёк · ответ Клиента ожидается. Ничто не истекает автоматически.',
    responseACCEPTED: 'Симуляция принятия Клиентом записана',
    responseREJECTED: 'Симуляция отказа Клиента записана',
    responseEXPIRED: 'Симуляция истечения срока записана',
    responseActor: 'Участник, записавший ответ',
    responseDecidedAt: 'Ответ Клиента записан',
  },
  fr: {
    transmissionTitle: 'Transmission simulée',
    transmissionExplanation:
      'Enregistrez une simulation provisoire de cette version approuvée. Aucun message n’est envoyé. Cela ne confirme pas l’acceptation du Client.',
    transmissionRecord: 'Enregistrer la transmission simulée',
    transmissionNote: 'Note de simulation',
    transmissionNoNote: 'Aucune note de simulation',
    transmissionAcknowledge:
      'Reconnaître les avertissements non reconnus à l’approbation',
    transmissionRunning: 'Enregistrement de la transmission simulée…',
    transmissionRetry: 'Réessayer la même transmission',
    transmissionUncertain:
      'Le résultat est incertain. Réessayer envoie exactement la même transmission, les mêmes valeurs et la même clé.',
    transmissionInvalid:
      'Utilisez une note de 500 caractères au maximum et vérifiez la reconnaissance des avertissements.',
    transmissionDenied: 'L’accès à la transmission n’est plus disponible.',
    transmissionUnavailable:
      'La version de l’Offre n’est plus disponible. Rechargez la Demande.',
    transmissionStale:
      'L’Offre a changé. Rechargez la Demande avant la transmission.',
    transmissionSuperseded:
      'Cette version a été remplacée. Rechargez la Demande.',
    transmissionNotApproved:
      'Cette version n’est plus approuvée. Rechargez la Demande.',
    transmissionAlreadyTransmitted:
      'Cette version possède déjà une transmission simulée. Rechargez la Demande.',
    transmissionMismatch:
      'La représentation ne correspond pas à la version approuvée. Rechargez la Demande.',
    transmissionConflict:
      'Cette nouvelle tentative ne correspond plus. Rechargez la Demande.',
    transmissionQualityErrors:
      'Les erreurs actuelles des contrôles qualité empêchent la transmission. Exécutez les contrôles qualité pour les consulter.',
    transmissionWarningsChanged:
      'Reconnaissez exactement les nouveaux avertissements. Exécutez les contrôles qualité pour les actualiser.',
    transmissionSuccess:
      'Transmission simulée enregistrée · réponse du Client en attente',
    transmissionActor: 'Membre ayant transmis',
    transmissionTransmittedAt: 'Transmission simulée enregistrée le',
    transmissionRun: 'Exécution des contrôles qualité à la transmission',
    transmissionChecksum: 'Empreinte SHA-256 transmise',
    transmissionWarnings: 'Avertissements reconnus à la transmission',
    responseTitle: 'Réponse simulée du Client',
    responseExplanation:
      'Enregistrez un résultat simulé provisoire pour cette version exacte transmise. Cette preuve n’a aucun effet juridique.',
    responseReceivedAt: 'Date et heure de réception déclarées (UTC)',
    responseRecordedReceivedAt: 'Date et heure de réception déclarées',
    responseTimeExample: '2026-10-03T14:30:00.000Z',
    responseReceivedHelp:
      'Utilisez une date et heure UTC entre la transmission et maintenant, strictement avant la fin de validité. Une réponse reçue à temps peut être enregistrée plus tard.',
    responseReason: 'Motif du refus du Client',
    responseAccept: 'Enregistrer l’acceptation simulée',
    responseReject: 'Enregistrer le refus simulé du Client',
    responseExpire: 'Enregistrer l’expiration simulée',
    responseRunning: 'Enregistrement de la réponse simulée du Client…',
    responseRetry: 'Réessayer la même réponse du Client',
    responseUncertain:
      'Le résultat est incertain. Réessayer envoie exactement le même résultat, les mêmes valeurs, la même révision et la même clé.',
    responseInvalid:
      'Vérifiez la date et heure de réception. Un refus nécessite un motif de 1 à 500 caractères.',
    responseDenied: 'L’accès à la réponse du Client n’est plus disponible.',
    responseUnavailable:
      'La version de l’Offre n’est plus disponible. Rechargez la Demande.',
    responseStale:
      'L’Offre a changé. Rechargez la Demande avant d’enregistrer une réponse du Client.',
    responseSuperseded: 'Cette version a été remplacée. Rechargez la Demande.',
    responseAlreadyRecorded:
      'Cette version possède déjà une réponse du Client. Rechargez la Demande.',
    responseNotTransmitted:
      'Cette version n’est pas transmise. Rechargez la Demande.',
    responseElapsed:
      'La réponse déclarée a été reçue après la fin de validité. Corrigez la date et heure de réception ou enregistrez l’expiration.',
    responseNotElapsed:
      'La validité n’est pas terminée. L’expiration ne peut pas encore être enregistrée.',
    responseConflict:
      'Cette nouvelle tentative ne correspond plus. Rechargez la Demande.',
    responsePendingElapsed:
      'Validité terminée · réponse du Client en attente. Rien n’expire automatiquement.',
    responseACCEPTED: 'Acceptation simulée du Client enregistrée',
    responseREJECTED: 'Refus simulé du Client enregistré',
    responseEXPIRED: 'Expiration simulée enregistrée',
    responseActor: 'Membre ayant enregistré la réponse',
    responseDecidedAt: 'Réponse du Client enregistrée le',
  },
});

export function useOfferTransmissionCopy() {
  const message = useMessages(offerTransmissionResponseMessages);
  return {
    title: message('transmissionTitle'),
    explanation: message('transmissionExplanation'),
    record: message('transmissionRecord'),
    note: message('transmissionNote'),
    noNote: message('transmissionNoNote'),
    acknowledge: message('transmissionAcknowledge'),
    running: message('transmissionRunning'),
    retry: message('transmissionRetry'),
    uncertain: message('transmissionUncertain'),
    invalid: message('transmissionInvalid'),
    denied: message('transmissionDenied'),
    unavailable: message('transmissionUnavailable'),
    stale: message('transmissionStale'),
    superseded: message('transmissionSuperseded'),
    notApproved: message('transmissionNotApproved'),
    alreadyTransmitted: message('transmissionAlreadyTransmitted'),
    mismatch: message('transmissionMismatch'),
    conflict: message('transmissionConflict'),
    qualityErrors: message('transmissionQualityErrors'),
    warningsChanged: message('transmissionWarningsChanged'),
    success: message('transmissionSuccess'),
    actor: message('transmissionActor'),
    transmittedAt: message('transmissionTransmittedAt'),
    run: message('transmissionRun'),
    checksum: message('transmissionChecksum'),
    warnings: message('transmissionWarnings'),
  };
}

export function useOfferClientResponseCopy() {
  const message = useMessages(offerTransmissionResponseMessages);
  return {
    title: message('responseTitle'),
    explanation: message('responseExplanation'),
    receivedAt: message('responseReceivedAt'),
    recordedReceivedAt: message('responseRecordedReceivedAt'),
    timeExample: message('responseTimeExample'),
    receivedHelp: message('responseReceivedHelp'),
    reason: message('responseReason'),
    accept: message('responseAccept'),
    reject: message('responseReject'),
    expire: message('responseExpire'),
    running: message('responseRunning'),
    retry: message('responseRetry'),
    uncertain: message('responseUncertain'),
    invalid: message('responseInvalid'),
    denied: message('responseDenied'),
    unavailable: message('responseUnavailable'),
    stale: message('responseStale'),
    superseded: message('responseSuperseded'),
    alreadyRecorded: message('responseAlreadyRecorded'),
    notTransmitted: message('responseNotTransmitted'),
    elapsed: message('responseElapsed'),
    notElapsed: message('responseNotElapsed'),
    conflict: message('responseConflict'),
    pendingElapsed: message('responsePendingElapsed'),
    ACCEPTED: message('responseACCEPTED'),
    REJECTED: message('responseREJECTED'),
    EXPIRED: message('responseEXPIRED'),
    actor: message('responseActor'),
    decidedAt: message('responseDecidedAt'),
  };
}
