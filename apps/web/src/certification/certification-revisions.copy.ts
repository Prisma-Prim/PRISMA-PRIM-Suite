import { defineMessages, useMessages } from '../localization/messages';
const keys = [
  'title',
  'history',
  'original',
  'revision',
  'current',
  'superseded',
  'required',
  'unmarked',
  'form',
  'submit',
  'date',
  'reason',
  'pdf',
  'mark',
  'yes',
  'no',
  'attestation',
  'markRequired',
  'incomplete',
  'attestationRequired',
  'textsDiffer',
  'contextChanged',
  'restart',
  'open',
  'pending',
  'sendHint',
  'fixed',
] as const;
export const revisionMessages = defineMessages(keys, {
  en: {
    title: 'Certificate revisions',
    history: 'Revision history',
    original: 'Issuance 0 — {state}',
    revision: 'Revision {index} — {state}',
    current: 'Current',
    superseded: 'Superseded',
    required: 'Revision required',
    unmarked: 'Revision not marked on the Certificate',
    form: 'Record a Certificate revision',
    submit: 'Record the revision',
    date: 'Revision date',
    reason: 'Revision reason',
    pdf: 'Corrected Certificate PDF',
    mark: 'Does the PDF show the revision index and date?',
    yes: 'Yes, visibly marked',
    no: 'No, not marked',
    attestation:
      'I attest that the person revising the Certificate is not a member of the audit team.',
    markRequired:
      'Answer whether the PDF visibly shows its revision index and date.',
    incomplete:
      'State the revision date and reason and choose a new exact Certificate PDF Version.',
    attestationRequired:
      'Confirm that the person revising the Certificate is outside the audit team.',
    textsDiffer:
      'Record a decision with texts matching the latest agreed Certificate data before revising.',
    contextChanged:
      'The decision, agreed data or current revision changed. Review the current texts and start the revision again.',
    restart: 'Start revision again from current texts',
    open: 'Open PDF for revision {index}',
    pending: 'Transmission not recorded for this revision',
    sendHint:
      'Record a separate sent Certificate exchange to the client with this exact revised PDF Version.',
    fixed:
      'The Certificate number, holder entity, decision date and validity remain unchanged.',
  },
  fr: {
    title: 'Révisions du certificat',
    history: 'Historique des révisions',
    original: 'Émission 0 — {state}',
    revision: 'Révision {index} — {state}',
    current: 'Actuelle',
    superseded: 'Remplacée',
    required: 'Révision requise',
    unmarked: 'Révision non indiquée sur le certificat',
    form: 'Enregistrer une révision du certificat',
    submit: 'Enregistrer la révision',
    date: 'Date de révision',
    reason: 'Motif de révision',
    pdf: 'PDF du certificat corrigé',
    mark: 'Le PDF indique-t-il l’indice et la date de révision ?',
    yes: 'Oui, clairement indiqués',
    no: 'Non, non indiqués',
    attestation:
      'J’atteste que la personne révisant le certificat ne fait pas partie de l’équipe d’audit.',
    markRequired: 'Indiquez si le PDF affiche l’indice et la date de révision.',
    incomplete:
      'Indiquez la date et le motif et choisissez une nouvelle version PDF exacte du certificat.',
    attestationRequired:
      'Confirmez que la personne révisant le certificat est extérieure à l’équipe d’audit.',
    textsDiffer:
      'Enregistrez une décision dont les textes correspondent aux dernières données convenues avant la révision.',
    contextChanged:
      'La décision, les données convenues ou la révision courante ont changé. Vérifiez les textes actuels et recommencez la révision.',
    restart: 'Recommencer la révision avec les textes actuels',
    open: 'Ouvrir le PDF de la révision {index}',
    pending: 'Transmission non enregistrée pour cette révision',
    sendHint:
      'Enregistrez un échange distinct de certificat envoyé au client avec cette version PDF corrigée exacte.',
    fixed:
      'Le numéro du certificat, son titulaire, la date de décision et la validité restent inchangés.',
  },
  ro: {
    title: 'Revizuirile certificatului',
    history: 'Istoricul revizuirilor',
    original: 'Emitere 0 — {state}',
    revision: 'Revizuirea {index} — {state}',
    current: 'Curentă',
    superseded: 'Înlocuită',
    required: 'Este necesară o revizuire',
    unmarked: 'Revizuirea nu este marcată pe certificat',
    form: 'Înregistrează o revizuire a certificatului',
    submit: 'Înregistrează revizuirea',
    date: 'Data revizuirii',
    reason: 'Motivul revizuirii',
    pdf: 'PDF-ul certificatului corectat',
    mark: 'PDF-ul arată indicele și data revizuirii?',
    yes: 'Da, marcate vizibil',
    no: 'Nu, nu sunt marcate',
    attestation:
      'Atest că persoana care revizuiește certificatul nu este membru al echipei de audit.',
    markRequired:
      'Răspunde dacă PDF-ul arată vizibil indicele și data revizuirii.',
    incomplete:
      'Indică data și motivul revizuirii și selectează o versiune PDF exactă nouă a certificatului.',
    attestationRequired:
      'Confirmă că persoana care revizuiește certificatul este în afara echipei de audit.',
    textsDiffer:
      'Înregistrează o decizie cu texte care corespund ultimelor date agreate înainte de revizuire.',
    contextChanged:
      'Decizia sau datele agreate s-au schimbat. Verifică textele curente și reîncepe revizuirea.',
    restart: 'Reîncepe revizuirea din textele curente',
    open: 'Deschide PDF-ul revizuirii {index}',
    pending: 'Transmiterea nu este înregistrată pentru această revizuire',
    sendHint:
      'Înregistrează un schimb de certificat separat trimis clientului cu această versiune PDF exactă revizuită.',
    fixed:
      'Numărul certificatului, entitatea titulară, data deciziei și valabilitatea rămân neschimbate.',
  },
  ru: {
    title: 'Исправления сертификата',
    history: 'История исправлений',
    original: 'Выдача 0 — {state}',
    revision: 'Исправление {index} — {state}',
    current: 'Текущее',
    superseded: 'Заменено',
    required: 'Требуется исправление',
    unmarked: 'Исправление не обозначено на сертификате',
    form: 'Зарегистрировать исправление сертификата',
    submit: 'Зарегистрировать исправление',
    date: 'Дата исправления',
    reason: 'Причина исправления',
    pdf: 'PDF исправленного сертификата',
    mark: 'Указаны ли в PDF индекс и дата исправления?',
    yes: 'Да, явно обозначены',
    no: 'Нет, не обозначены',
    attestation:
      'Подтверждаю, что лицо, исправляющее сертификат, не входит в аудиторскую группу.',
    markRequired: 'Укажите, видны ли в PDF индекс и дата исправления.',
    incomplete:
      'Укажите дату и причину исправления и выберите новую точную версию PDF сертификата.',
    attestationRequired:
      'Подтвердите, что лицо, исправляющее сертификат, не входит в аудиторскую группу.',
    textsDiffer:
      'До исправления зарегистрируйте решение с текстами, совпадающими с последними согласованными данными.',
    contextChanged:
      'Решение, согласованные данные или текущее исправление изменились. Проверьте текущие тексты и начните исправление заново.',
    restart: 'Начать исправление заново с текущими текстами',
    open: 'Открыть PDF исправления {index}',
    pending: 'Передача этого исправления не зарегистрирована',
    sendHint:
      'Зарегистрируйте отдельную отправку сертификата клиенту с этой точной исправленной версией PDF.',
    fixed:
      'Номер сертификата, юридическое лицо владельца, дата решения и срок действия остаются неизменными.',
  },
});
export type RevisionMessageKey = (typeof keys)[number];
export function useRevisionCopy() {
  return useMessages(revisionMessages);
}
