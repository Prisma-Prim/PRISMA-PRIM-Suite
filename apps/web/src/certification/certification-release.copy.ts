import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'restart',
  'approvalContextChanged',
  'title',
  'draft',
  'opinion',
  'approval',
  'issuance',
  'transmission',
  'noDraft',
  'notRecorded',
  'number',
  'draftDate',
  'draftPdf',
  'recordDraft',
  'opinionDate',
  'outcome',
  'agreed',
  'changesRequested',
  'skipped',
  'skipReason',
  'skipTexts',
  'skipNoAnswer',
  'skipOther',
  'requestedChange',
  'opinionExchange',
  'recordOpinion',
  'approvalDate',
  'textsConfirmation',
  'numberConfirmation',
  'validityConfirmation',
  'independence',
  'approve',
  'reason',
  'note',
  'validation',
  'issuedOn',
  'pendingDays',
  'readonly',
  'not_granted',
  'draft_missing',
  'draft_outdated',
  'opinion_missing',
  'changes_requested',
  'texts_differ',
  'discrepancies_open',
  'approval_missing',
  'outdated',
  'current',
  'sendHint',
  'transmitHint',
] as const;
export const releaseMessages = defineMessages(keys, {
  en: {
    approvalContextChanged:
      'The draft or its client opinion changed. Review the current records and start the approval again.',
    restart: 'Start again for the current decision and draft',
    title: 'Certificate release',
    draft: 'Draft',
    opinion: 'Client opinion',
    approval: 'Approval',
    issuance: 'Issuance',
    transmission: 'Transmission',
    noDraft: 'No Certificate draft is recorded.',
    notRecorded: 'Not recorded',
    number: 'Certificate number shown on the draft',
    draftDate: 'Draft date',
    draftPdf: 'Certificate draft PDF',
    recordDraft: 'Record a Certificate draft',
    opinionDate: 'Opinion or skip date',
    outcome: 'Client opinion outcome',
    agreed: 'Agreed',
    changesRequested: 'Changes requested',
    skipped: 'Opinion skipped',
    skipReason: 'Reason for skipping the opinion',
    skipTexts: 'Texts already agreed in the Certificate Data Agreement',
    skipNoAnswer: 'No answer from the client',
    skipOther: 'Other, with a note',
    requestedChange: 'Requested change',
    opinionExchange: 'Received client opinion Exchange Record',
    recordOpinion: 'Record the client opinion or skip',
    approvalDate: 'Draft approval date',
    textsConfirmation:
      'I confirm that this draft states exactly the granted texts in every language.',
    numberConfirmation:
      'I confirm that this draft shows the recorded Certificate number.',
    validityConfirmation:
      'I confirm that this draft shows the validity computed from the decision date.',
    independence:
      'I attest that the draft approver is not a member of the audit team.',
    approve: 'Approve the Certificate draft',
    reason: 'Reason for the new version',
    note: 'Note',
    validation:
      'Complete the required fields and every explicit confirmation. A new version states its reason.',
    issuedOn: 'Issue date',
    pendingDays: 'Days since issuance, awaiting transmission: {days}',
    readonly: 'The release is read-only for this member.',
    not_granted: 'A granting Certification Decision is required.',
    draft_missing: 'Record a Certificate draft first.',
    draft_outdated:
      'The draft is outdated: record a new draft for the latest decision and Certificate data.',
    opinion_missing:
      'Record the client opinion or a reason for skipping it for this draft.',
    changes_requested:
      'The client requested changes: record a new draft before approval.',
    texts_differ: 'The granted texts and the agreed Certificate data differ.',
    discrepancies_open:
      'Resolve open critical and unaccepted error Discrepancies before approving the draft.',
    approval_missing: 'The current draft must be approved before issuance.',
    outdated: 'Outdated',
    current: 'Current draft',
    sendHint:
      'Send the draft outside the Suite and record it in Exchanges and deadlines. Record the received answer there before its opinion.',
    transmitHint:
      'Record a sent Certificate Exchange Record to the client with the exact issued PDF Version.',
  },
  fr: {
    approvalContextChanged:
      'Le projet ou l’avis du client a changé. Vérifiez les enregistrements actuels et recommencez l’approbation.',
    restart: 'Recommencer pour la décision et le projet actuels',
    title: 'Émission du certificat',
    draft: 'Projet',
    opinion: 'Avis du client',
    approval: 'Approbation',
    issuance: 'Émission',
    transmission: 'Transmission',
    noDraft: 'Aucun projet de certificat enregistré.',
    notRecorded: 'Non enregistré',
    number: 'Numéro du certificat indiqué sur le projet',
    draftDate: 'Date du projet',
    draftPdf: 'PDF du projet de certificat',
    recordDraft: 'Enregistrer un projet de certificat',
    opinionDate: 'Date de l’avis ou de son omission',
    outcome: 'Résultat de l’avis du client',
    agreed: 'Accepté',
    changesRequested: 'Modifications demandées',
    skipped: 'Avis omis',
    skipReason: 'Motif d’omission de l’avis',
    skipTexts:
      'Textes déjà convenus dans l’accord sur les données du certificat',
    skipNoAnswer: 'Aucune réponse du client',
    skipOther: 'Autre, avec une note',
    requestedChange: 'Modification demandée',
    opinionExchange: 'Échange reçu contenant l’avis du client',
    recordOpinion: 'Enregistrer l’avis du client ou son omission',
    approvalDate: 'Date d’approbation du projet',
    textsConfirmation:
      'Je confirme que le projet reprend exactement les textes accordés dans chaque langue.',
    numberConfirmation:
      'Je confirme que le projet indique le numéro de certificat enregistré.',
    validityConfirmation:
      'Je confirme que le projet indique la validité calculée à partir de la date de décision.',
    independence:
      'J’atteste que l’approbateur du projet ne fait pas partie de l’équipe d’audit.',
    approve: 'Approuver le projet de certificat',
    reason: 'Motif de la nouvelle version',
    note: 'Note',
    validation:
      'Complétez les champs requis et chaque confirmation explicite. Toute nouvelle version indique son motif.',
    issuedOn: 'Date d’émission',
    pendingDays: 'Jours depuis l’émission, en attente de transmission : {days}',
    readonly: 'La délivrance est en lecture seule pour ce membre.',
    not_granted: 'Une décision accordant la certification est requise.',
    draft_missing: 'Enregistrez d’abord un projet de certificat.',
    draft_outdated:
      'Le projet est périmé : enregistrez un nouveau projet pour la dernière décision et les dernières données.',
    opinion_missing:
      'Enregistrez l’avis du client ou le motif de son omission pour ce projet.',
    changes_requested:
      'Le client a demandé des modifications : enregistrez un nouveau projet avant l’approbation.',
    texts_differ:
      'Les textes accordés diffèrent des données du certificat convenues.',
    discrepancies_open:
      'Résolvez les écarts critiques et les erreurs non acceptées avant d’approuver le projet.',
    approval_missing: 'Le projet actuel doit être approuvé avant l’émission.',
    outdated: 'Périmé',
    current: 'Projet actuel',
    sendHint:
      'Envoyez le projet hors de la Suite et enregistrez l’échange. Enregistrez la réponse reçue avant son avis.',
    transmitHint:
      'Enregistrez un échange de certificat envoyé au client avec la version PDF exacte émise.',
  },
  ro: {
    approvalContextChanged:
      'Proiectul sau opinia clientului s-a schimbat. Verifică înregistrările curente și reîncepe aprobarea.',
    restart: 'Reîncepe pentru decizia și proiectul curente',
    title: 'Eliberarea certificatului',
    draft: 'Proiect',
    opinion: 'Opinia clientului',
    approval: 'Aprobare',
    issuance: 'Emitere',
    transmission: 'Transmitere',
    noDraft: 'Nu este înregistrat niciun proiect de certificat.',
    notRecorded: 'Neînregistrat',
    number: 'Numărul certificatului indicat în proiect',
    draftDate: 'Data proiectului',
    draftPdf: 'PDF-ul proiectului certificatului',
    recordDraft: 'Înregistrează un proiect de certificat',
    opinionDate: 'Data opiniei sau omiterii',
    outcome: 'Rezultatul opiniei clientului',
    agreed: 'Agreat',
    changesRequested: 'Modificări solicitate',
    skipped: 'Opinie omisă',
    skipReason: 'Motivul omiterii opiniei',
    skipTexts: 'Texte deja agreate în acordul privind datele certificatului',
    skipNoAnswer: 'Niciun răspuns de la client',
    skipOther: 'Alt motiv, cu o notă',
    requestedChange: 'Modificarea solicitată',
    opinionExchange: 'Înregistrarea schimbului primit cu opinia clientului',
    recordOpinion: 'Înregistrează opinia clientului sau omiterea',
    approvalDate: 'Data aprobării proiectului',
    textsConfirmation:
      'Confirm că proiectul redă exact textele acordate în fiecare limbă.',
    numberConfirmation:
      'Confirm că proiectul indică numărul certificatului înregistrat.',
    validityConfirmation:
      'Confirm că proiectul indică valabilitatea calculată de la data deciziei.',
    independence:
      'Atest că aprobatorul proiectului nu este membru al echipei de audit.',
    approve: 'Aprobă proiectul certificatului',
    reason: 'Motivul noii versiuni',
    note: 'Notă',
    validation:
      'Completează câmpurile obligatorii și fiecare confirmare explicită. O versiune nouă precizează motivul.',
    issuedOn: 'Data emiterii',
    pendingDays: 'Zile de la emitere, în așteptarea transmiterii: {days}',
    readonly: 'Eliberarea este doar pentru citire pentru acest membru.',
    not_granted: 'Este necesară o decizie de acordare a certificării.',
    draft_missing: 'Înregistrează mai întâi un proiect de certificat.',
    draft_outdated:
      'Proiectul este depășit: înregistrează un proiect nou pentru ultima decizie și ultimele date.',
    opinion_missing:
      'Înregistrează opinia clientului sau motivul omiterii pentru acest proiect.',
    changes_requested:
      'Clientul a solicitat modificări: înregistrează un proiect nou înainte de aprobare.',
    texts_differ: 'Textele acordate diferă de datele certificatului agreate.',
    discrepancies_open:
      'Rezolvă discrepanțele critice și erorile neacceptate înainte de aprobarea proiectului.',
    approval_missing: 'Proiectul curent trebuie aprobat înainte de emitere.',
    outdated: 'Depășit',
    current: 'Proiect curent',
    sendHint:
      'Trimite proiectul în afara Suite și înregistrează schimbul. Înregistrează răspunsul primit înaintea opiniei.',
    transmitHint:
      'Înregistrează un schimb de certificat trimis clientului cu versiunea PDF exactă emisă.',
  },
  ru: {
    approvalContextChanged:
      'Проект или мнение клиента изменились. Проверьте текущие записи и начните утверждение заново.',
    restart: 'Начать заново для текущего решения и проекта',
    title: 'Выпуск сертификата',
    draft: 'Проект',
    opinion: 'Мнение клиента',
    approval: 'Утверждение',
    issuance: 'Выдача',
    transmission: 'Передача',
    noDraft: 'Проект сертификата не зарегистрирован.',
    notRecorded: 'Не зарегистрировано',
    number: 'Номер сертификата в проекте',
    draftDate: 'Дата проекта',
    draftPdf: 'PDF проекта сертификата',
    recordDraft: 'Зарегистрировать проект сертификата',
    opinionDate: 'Дата мнения или пропуска',
    outcome: 'Результат мнения клиента',
    agreed: 'Согласовано',
    changesRequested: 'Запрошены изменения',
    skipped: 'Мнение пропущено',
    skipReason: 'Причина пропуска мнения',
    skipTexts: 'Тексты уже согласованы в соглашении о данных сертификата',
    skipNoAnswer: 'Нет ответа клиента',
    skipOther: 'Другое, с примечанием',
    requestedChange: 'Запрошенное изменение',
    opinionExchange: 'Полученная запись обмена с мнением клиента',
    recordOpinion: 'Зарегистрировать мнение клиента или пропуск',
    approvalDate: 'Дата утверждения проекта',
    textsConfirmation:
      'Подтверждаю, что проект точно содержит утверждённые тексты на каждом языке.',
    numberConfirmation:
      'Подтверждаю, что проект содержит зарегистрированный номер сертификата.',
    validityConfirmation:
      'Подтверждаю, что проект содержит срок действия, рассчитанный от даты решения.',
    independence:
      'Подтверждаю, что утверждающий проект не входит в аудиторскую группу.',
    approve: 'Утвердить проект сертификата',
    reason: 'Причина новой версии',
    note: 'Примечание',
    validation:
      'Заполните обязательные поля и каждое явное подтверждение. Новая версия требует причины.',
    issuedOn: 'Дата выдачи',
    pendingDays: 'Дней с выдачи, ожидается передача: {days}',
    readonly: 'Для этого участника выпуск доступен только для чтения.',
    not_granted: 'Требуется решение о предоставлении сертификации.',
    draft_missing: 'Сначала зарегистрируйте проект сертификата.',
    draft_outdated:
      'Проект устарел: зарегистрируйте новый проект для последнего решения и данных сертификата.',
    opinion_missing:
      'Зарегистрируйте мнение клиента или причину пропуска для этого проекта.',
    changes_requested:
      'Клиент запросил изменения: зарегистрируйте новый проект до утверждения.',
    texts_differ:
      'Утверждённые тексты отличаются от согласованных данных сертификата.',
    discrepancies_open:
      'Устраните критические расхождения и непринятые ошибки до утверждения проекта.',
    approval_missing: 'Текущий проект должен быть утверждён до выдачи.',
    outdated: 'Устарел',
    current: 'Текущий проект',
    sendHint:
      'Отправьте проект вне Suite и зарегистрируйте обмен. Зарегистрируйте полученный ответ до мнения.',
    transmitHint:
      'Зарегистрируйте отправку сертификата клиенту с точной выданной версией PDF.',
  },
});
export type ReleaseMessageKey = (typeof keys)[number];
export function useReleaseCopy() {
  return useMessages(releaseMessages);
}
