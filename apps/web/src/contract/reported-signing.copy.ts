import { defineMessages, useMessages } from '../localization/messages';
const keys = [
  'title',
  'bundle',
  'prerequisites',
  'notice',
  'conservation',
  'provider',
  'client',
  'label',
  'signedOn',
  'unknown',
  'mandate',
  'declaredMandate',
  'mandateBasis',
  'concordance',
  'acceptance',
  'choosePdf',
  'load',
  'more',
  'empty',
  'submit',
  'confirmed',
  'pdfDenied',
  'declared',
  'offerSeparate',
  'download',
  'invalid',
  'unavailable',
  'uncertain',
  'retry',
  'refresh',
  'refreshFailed',
  'warnings',
  'source',
  'recorded',
  'grantEvent',
  'revokeEvent',
  'declaredEvent',
] as const;
export const reportedSigningMessages = defineMessages(keys, {
  en: {
    grantEvent: 'granted Contract signing declaration access',
    revokeEvent: 'revoked Contract signing declaration access',
    declaredEvent: 'recorded reported signing and case acceptance',
    title: 'Reported signing and case acceptance',
    bundle: 'Company Contract Signature Declarer',
    prerequisites:
      'Opt-in declaration only. Also requires ordinary Contract signing, Offer/Opportunity, Company Client identity, Document metadata, Received Contract Access and Content Reader permissions.',
    notice:
      'A human statement that both parties signed and this case accepted the exact source Offer. Signatures, mandates, legal effects and payment are unverified. Leave unknown dates blank.',
    conservation:
      'This statement is permanently conserved. It cannot be edited, withdrawn or replaced, and this Contract cannot receive a successor. Do not submit unsigned or nonmatching evidence.',
    provider: 'Reported provider signatory',
    client: 'Reported Client signatory',
    label: 'Literal signatory label',
    signedOn: 'Reported signing date (blank = unknown)',
    unknown: 'Unknown',
    mandate: 'Reported mandate',
    declaredMandate: 'Declared, unverified basis',
    mandateBasis: 'Literal mandate basis',
    concordance:
      'Basis for comparing this exact PDF, approved Contract and Offer',
    acceptance:
      'Basis for this case accepting the exact Offer through both reported signatures',
    choosePdf: 'Select the exact preserved received Contract PDF',
    load: 'Load eligible received PDFs',
    more: 'More eligible PDFs',
    empty:
      'No eligible readable PDF. Preserve and designate the exact received Contract first.',
    submit: 'Declare both reported signatures, concordance and case acceptance',
    confirmed:
      'Declaration conserved. Case acceptance declared; evidence remains unverified.',
    pdfDenied:
      'PDF reference withheld: independent Document or content access is unavailable.',
    declared: 'Declared, unverified',
    offerSeparate:
      'The Offer Client Response is separate and was not changed by this declaration.',
    download: 'Download this exact PDF',
    invalid:
      'Complete the literal fields, exact PDF selection and every current warning.',
    unavailable:
      'The target, source or permission is unavailable. Reload before a new intent.',
    uncertain:
      'The declaration outcome is uncertain. Retry only the unchanged statement.',
    retry: 'Retry the identical declaration',
    refresh: 'Reload Contract history',
    refreshFailed:
      'The declaration is confirmed; history refresh failed. Reload the Contract.',
    warnings: 'Acknowledge the complete current warning set again',
    source: 'Exact Contract / source Offer',
    recorded: 'Recorded declaration',
  },
  ro: {
    grantEvent: 'a acordat acces la declararea semnării Contractului',
    revokeEvent: 'a revocat accesul la declararea semnării Contractului',
    declaredEvent:
      'a înregistrat semnarea raportată și acceptarea pentru acest caz',
    title: 'Semnare raportată și acceptare pentru acest caz',
    bundle: 'Declarant al semnării Contractului în Companie',
    prerequisites:
      'Doar declarație opțională. Necesită separat drepturi de semnare Contract, citire Ofertă/Oportunitate și identitate Client în Companie, metadate Document, acces Contract primit și citire conținut.',
    notice:
      'O declarație umană că ambele părți au semnat și acest caz a acceptat Oferta sursă exactă. Semnăturile, mandatele, efectele juridice și plata sunt neverificate. Lăsați goale datele necunoscute.',
    conservation:
      'Declarația se păstrează permanent. Nu poate fi editată, retrasă sau înlocuită, iar Contractul nu poate avea o versiune succesoare. Nu declarați dovezi nesemnate sau neconcordante.',
    provider: 'Semnatar raportat al furnizorului',
    client: 'Semnatar raportat al Clientului',
    label: 'Etichetă literală a semnatarului',
    signedOn: 'Data semnării raportată (gol = necunoscută)',
    unknown: 'Necunoscut',
    mandate: 'Mandat raportat',
    declaredMandate: 'Bază declarată, neverificată',
    mandateBasis: 'Bază literală a mandatului',
    concordance:
      'Baza comparării acestui PDF exact, Contractului aprobat și Ofertei',
    acceptance:
      'Baza acceptării Ofertei exacte în acest caz prin ambele semnături raportate',
    choosePdf: 'Selectați PDF-ul exact păstrat al Contractului primit',
    load: 'Încărcați PDF-urile primite eligibile',
    more: 'Mai multe PDF-uri eligibile',
    empty:
      'Niciun PDF eligibil lizibil. Păstrați și desemnați mai întâi Contractul primit exact.',
    submit:
      'Declar ambele semnături raportate, concordanța și acceptarea pentru acest caz',
    confirmed:
      'Declarație păstrată. Acceptare declarată pentru acest caz; dovezile rămân neverificate.',
    pdfDenied:
      'Referința PDF este ascunsă: accesul separat la Document sau conținut nu este disponibil.',
    declared: 'Declarat, neverificat',
    offerSeparate:
      'Răspunsul Clientului la Ofertă este separat și nu a fost modificat de această declarație.',
    download: 'Descărcați acest PDF exact',
    invalid:
      'Completați câmpurile literale, selecția PDF exactă și toate avertismentele curente.',
    unavailable:
      'Ținta, sursa sau permisiunea nu este disponibilă. Reîncărcați înainte de o intenție nouă.',
    uncertain:
      'Rezultatul declarației este incert. Reîncercați doar declarația neschimbată.',
    retry: 'Reîncercați declarația identică',
    refresh: 'Reîncărcați istoricul Contractului',
    refreshFailed:
      'Declarația este confirmată; actualizarea istoricului a eșuat. Reîncărcați Contractul.',
    warnings: 'Confirmați din nou întregul set curent de avertismente',
    source: 'Contract exact / Ofertă sursă',
    recorded: 'Declarație înregistrată',
  },
  fr: {
    grantEvent: 'a accordé le droit de déclarer la signature du contrat',
    revokeEvent: 'a révoqué le droit de déclarer la signature du contrat',
    declaredEvent:
      'a enregistré la signature rapportée et l’acceptation du dossier',
    title: 'Signature rapportée et acceptation du dossier',
    bundle: 'Déclarant de signature du contrat de la société',
    prerequisites:
      'Déclaration facultative uniquement. Exige aussi les droits ordinaires de signature du contrat, lecture Offre/Opportunité et identité Client de la société, métadonnées Document, accès Contrat reçu et lecture du contenu.',
    notice:
      'Déclaration humaine selon laquelle les deux parties ont signé et ce dossier a accepté l’offre source exacte. Signatures, mandats, effets juridiques et paiement ne sont pas vérifiés. Laissez les dates inconnues vides.',
    conservation:
      'Cette déclaration est conservée définitivement. Elle ne peut être modifiée, retirée ou remplacée et ce contrat ne peut recevoir de version suivante. Ne déclarez pas de preuves non signées ou non concordantes.',
    provider: 'Signataire rapporté du prestataire',
    client: 'Signataire rapporté du client',
    label: 'Libellé littéral du signataire',
    signedOn: 'Date de signature rapportée (vide = inconnue)',
    unknown: 'Inconnu',
    mandate: 'Mandat rapporté',
    declaredMandate: 'Fondement déclaré, non vérifié',
    mandateBasis: 'Fondement littéral du mandat',
    concordance:
      'Fondement de la comparaison de ce PDF exact, du contrat approuvé et de l’offre',
    acceptance:
      'Fondement de l’acceptation de l’offre exacte dans ce dossier par les deux signatures rapportées',
    choosePdf: 'Sélectionner le PDF exact conservé du contrat reçu',
    load: 'Charger les PDF reçus admissibles',
    more: 'Autres PDF admissibles',
    empty:
      'Aucun PDF admissible lisible. Conservez et désignez d’abord le contrat reçu exact.',
    submit:
      'Déclarer les deux signatures rapportées, la concordance et l’acceptation du dossier',
    confirmed:
      'Déclaration conservée. Acceptation du dossier déclarée ; les preuves restent non vérifiées.',
    pdfDenied:
      'Référence PDF masquée : l’accès indépendant au document ou au contenu est indisponible.',
    declared: 'Déclaré, non vérifié',
    offerSeparate:
      'La réponse client à l’offre reste distincte et n’a pas été modifiée par cette déclaration.',
    download: 'Télécharger ce PDF exact',
    invalid:
      'Renseignez les champs littéraux, le PDF exact et tous les avertissements actuels.',
    unavailable:
      'La cible, la source ou un droit est indisponible. Rechargez avant une nouvelle intention.',
    uncertain:
      'Le résultat de la déclaration est incertain. Réessayez uniquement la déclaration inchangée.',
    retry: 'Réessayer la déclaration identique',
    refresh: 'Recharger l’historique du contrat',
    refreshFailed:
      'La déclaration est confirmée ; l’actualisation a échoué. Rechargez le contrat.',
    warnings: 'Acquitter à nouveau tous les avertissements actuels',
    source: 'Contrat exact / offre source',
    recorded: 'Déclaration enregistrée',
  },
  ru: {
    grantEvent: '— предоставление доступа к заявлению о подписании Договора',
    revokeEvent: '— отзыв доступа к заявлению о подписании Договора',
    declaredEvent: '— запись заявленных подписей и принятия в этом деле',
    title: 'Заявленные подписи и принятие в этом деле',
    bundle: 'Декларант подписания Договора Компании',
    prerequisites:
      'Только отдельная декларация. Также нужны обычные права подписи Договора, чтения Предложения/Возможности и личности Клиента Компании, метаданных Документа, доступа к полученному Договору и чтения содержимого.',
    notice:
      'Заявление человека о подписях обеих сторон и принятии точного исходного Предложения в этом деле. Подписи, полномочия, юридические последствия и оплата не проверены. Неизвестные даты оставьте пустыми.',
    conservation:
      'Заявление сохраняется навсегда. Его нельзя изменить, отозвать или заменить, а для Договора нельзя создать следующую версию. Не заявляйте о неподписанных или несоответствующих доказательствах.',
    provider: 'Заявленный подписант поставщика',
    client: 'Заявленный подписант Клиента',
    label: 'Буквальная подпись имени подписанта',
    signedOn: 'Заявленная дата подписи (пусто = неизвестна)',
    unknown: 'Неизвестно',
    mandate: 'Заявленные полномочия',
    declaredMandate: 'Заявленное, непроверенное основание',
    mandateBasis: 'Буквальное основание полномочий',
    concordance:
      'Основание сравнения точного PDF, утверждённого Договора и Предложения',
    acceptance:
      'Основание принятия точного Предложения в этом деле через обе заявленные подписи',
    choosePdf: 'Выберите точный сохранённый PDF полученного Договора',
    load: 'Загрузить доступные полученные PDF',
    more: 'Другие доступные PDF',
    empty:
      'Нет доступного подходящего PDF. Сначала сохраните и назначьте точный полученный Договор.',
    submit: 'Заявить обе подписи, соответствие и принятие в этом деле',
    confirmed:
      'Заявление сохранено. Принятие в этом деле заявлено; доказательства не проверены.',
    pdfDenied:
      'Ссылка на PDF скрыта: отдельный доступ к Документу или содержимому недоступен.',
    declared: 'Заявлено, не проверено',
    offerSeparate:
      'Ответ Клиента на Предложение остаётся отдельным и не изменён этой декларацией.',
    download: 'Скачать этот точный PDF',
    invalid:
      'Заполните буквальные поля, выберите точный PDF и подтвердите все текущие предупреждения.',
    unavailable:
      'Цель, источник или право недоступны. Обновите перед новым намерением.',
    uncertain:
      'Результат заявления неизвестен. Повторите только неизменённое заявление.',
    retry: 'Повторить идентичное заявление',
    refresh: 'Обновить историю Договора',
    refreshFailed:
      'Заявление подтверждено; обновление истории не удалось. Обновите Договор.',
    warnings: 'Снова подтвердите весь текущий набор предупреждений',
    source: 'Точный Договор / исходное Предложение',
    recorded: 'Сохранённое заявление',
  },
});
export const useReportedSigningCopy = () =>
  useMessages(reportedSigningMessages);
