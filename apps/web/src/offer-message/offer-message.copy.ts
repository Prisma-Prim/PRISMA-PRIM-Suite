import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'prepare',
  'title',
  'notice',
  'source',
  'party',
  'actor',
  'recipient',
  'subject',
  'body',
  'review',
  'reviewed',
  'copyRecipient',
  'copySubject',
  'copyBody',
  'pdf',
  'close',
  'loading',
  'sourceError',
  'retrySource',
  'retired',
  'copyPending',
  'copied',
  'copyFailed',
  'copyUnconfirmed',
  'stopWaiting',
  'selectRecipient',
  'selectSubject',
  'selectBody',
  'recipientHelp',
  'subjectHelp',
  'bodyHelp',
  'invalid',
  'pdfPending',
  'pdfReady',
  'pdfError',
  'model',
  'illustrative',
] as const;

export const offerMessageMessages = defineMessages(keys, {
  en: {
    prepare: 'Prepare message',
    title: 'Offer message preparation',
    notice:
      'Manual review only. Nothing is sent or saved. This Offer and PDF are non-official. Copy each reviewed field separately, then attach the intended PDF yourself.',
    source: 'Exact Offer source',
    party: 'Immutable Offer party',
    actor: 'Current Actor',
    recipient: 'Recipient',
    subject: 'Subject',
    body: 'Message body',
    review: 'Review message',
    reviewed: 'Reviewed for this exact Offer. Any edit requires a new review.',
    copyRecipient: 'Copy recipient',
    copySubject: 'Copy subject',
    copyBody: 'Copy body',
    pdf: 'Download intended PDF',
    close: 'Close preparation',
    loading: 'Checking the exact source…',
    sourceError:
      'The exact source could not be verified. Your manual text remains here. Retry this same Offer source.',
    retrySource: 'Retry exact source',
    retired:
      'This preparation has closed. Prepare a new message from the intended Offer to continue.',
    copyPending: 'Waiting for the browser clipboard result…',
    copied:
      'The browser accepted this field for the clipboard. Nothing was sent.',
    copyFailed:
      'The clipboard write was not confirmed. Select this field and copy it manually, or deliberately try again after reviewing it.',
    copyUnconfirmed:
      'Clipboard outcome unconfirmed. A write already requested from the browser may still complete. Select the intended field for manual copying.',
    stopWaiting: 'Stop waiting for copy',
    selectRecipient: 'Select recipient for manual copy',
    selectSubject: 'Select subject for manual copy',
    selectBody: 'Select body for manual copy',
    recipientHelp:
      'One literal ASCII mailbox, up to 254 characters. No names, spaces or separators.',
    subjectHelp:
      '1–200 UTF-16 units, nonblank, one line, without control characters.',
    bodyHelp:
      '1–10,000 UTF-16 units, nonblank. Tabs and line breaks are preserved.',
    invalid:
      'Enter a valid recipient, subject and message body before reviewing.',
    pdfPending: 'Checking and preparing the exact PDF…',
    pdfReady:
      'The intended PDF was offered to the browser. Attach it yourself.',
    pdfError:
      'The intended PDF was not offered. Your manual text remains here. Retry this same PDF.',
    model: 'Company model · Romanian',
    illustrative: 'Illustrative · English',
  },
  ro: {
    prepare: 'Pregătește mesajul',
    title: 'Pregătirea mesajului pentru Ofertă',
    notice:
      'Doar verificare manuală. Nimic nu este trimis sau salvat. Oferta și PDF-ul sunt neoficiale. Copiază separat fiecare câmp verificat, apoi atașează personal PDF-ul dorit.',
    source: 'Sursa exactă a Ofertei',
    party: 'Destinatarul imuabil al Ofertei',
    actor: 'Actorul curent',
    recipient: 'Destinatar',
    subject: 'Subiect',
    body: 'Corpul mesajului',
    review: 'Verifică mesajul',
    reviewed:
      'Verificat pentru această Ofertă exactă. Orice modificare necesită o nouă verificare.',
    copyRecipient: 'Copiază destinatarul',
    copySubject: 'Copiază subiectul',
    copyBody: 'Copiază corpul',
    pdf: 'Descarcă PDF-ul dorit',
    close: 'Închide pregătirea',
    loading: 'Se verifică sursa exactă…',
    sourceError:
      'Sursa exactă nu a putut fi verificată. Textul manual rămâne aici. Reîncearcă aceeași sursă a Ofertei.',
    retrySource: 'Reîncearcă sursa exactă',
    retired:
      'Această pregătire s-a închis. Pregătește un mesaj nou din Oferta dorită pentru a continua.',
    copyPending: 'Se așteaptă rezultatul clipboardului din browser…',
    copied:
      'Browserul a acceptat acest câmp în clipboard. Nimic nu a fost trimis.',
    copyFailed:
      'Copierea în clipboard nu a fost confirmată. Selectează câmpul și copiază-l manual sau reîncearcă deliberat după verificare.',
    copyUnconfirmed:
      'Rezultatul copierii nu este confirmat. O copiere deja cerută browserului se poate finaliza ulterior. Selectează câmpul dorit pentru copiere manuală.',
    stopWaiting: 'Oprește așteptarea copierii',
    selectRecipient: 'Selectează destinatarul pentru copiere manuală',
    selectSubject: 'Selectează subiectul pentru copiere manuală',
    selectBody: 'Selectează corpul pentru copiere manuală',
    recipientHelp:
      'O singură adresă ASCII literală, maximum 254 de caractere. Fără nume, spații sau separatori.',
    subjectHelp:
      '1–200 de unități UTF-16, nevid, pe un rând, fără caractere de control.',
    bodyHelp:
      '1–10.000 de unități UTF-16, nevid. Taburile și rândurile noi se păstrează.',
    invalid:
      'Introdu un destinatar, un subiect și un corp de mesaj valide înainte de verificare.',
    pdfPending: 'Se verifică și se pregătește PDF-ul exact…',
    pdfReady: 'PDF-ul dorit a fost oferit browserului. Atașează-l personal.',
    pdfError:
      'PDF-ul dorit nu a fost oferit. Textul manual rămâne aici. Reîncearcă același PDF.',
    model: 'Modelul Companiei · română',
    illustrative: 'Ilustrativă · engleză',
  },
  ru: {
    prepare: 'Подготовить сообщение',
    title: 'Подготовка сообщения по Оферте',
    notice:
      'Только ручная проверка. Ничего не отправляется и не сохраняется. Оферта и PDF неофициальные. Копируйте каждое проверенное поле отдельно, затем самостоятельно приложите нужный PDF.',
    source: 'Точный источник Оферты',
    party: 'Неизменяемый получатель Оферты',
    actor: 'Текущий пользователь',
    recipient: 'Получатель',
    subject: 'Тема',
    body: 'Текст сообщения',
    review: 'Проверить сообщение',
    reviewed:
      'Проверено для этой точной Оферты. После любого изменения нужна новая проверка.',
    copyRecipient: 'Копировать получателя',
    copySubject: 'Копировать тему',
    copyBody: 'Копировать текст',
    pdf: 'Скачать нужный PDF',
    close: 'Закрыть подготовку',
    loading: 'Проверка точного источника…',
    sourceError:
      'Не удалось проверить точный источник. Ручной текст остаётся здесь. Повторите проверку того же источника Оферты.',
    retrySource: 'Повторить проверку точного источника',
    retired:
      'Эта подготовка закрыта. Для продолжения подготовьте новое сообщение из нужной Оферты.',
    copyPending: 'Ожидание результата буфера обмена браузера…',
    copied: 'Браузер принял это поле в буфер обмена. Ничего не отправлено.',
    copyFailed:
      'Запись в буфер не подтверждена. Выделите поле и скопируйте вручную либо осознанно повторите после проверки.',
    copyUnconfirmed:
      'Результат копирования неизвестен. Уже запрошенная запись браузера ещё может завершиться. Выделите нужное поле для ручного копирования.',
    stopWaiting: 'Прекратить ожидание копирования',
    selectRecipient: 'Выделить получателя для ручного копирования',
    selectSubject: 'Выделить тему для ручного копирования',
    selectBody: 'Выделить текст для ручного копирования',
    recipientHelp:
      'Один буквальный адрес ASCII, до 254 символов. Без имён, пробелов и разделителей.',
    subjectHelp:
      '1–200 единиц UTF-16, не пустая строка, без переводов строк и управляющих символов.',
    bodyHelp:
      '1–10 000 единиц UTF-16, не пустой текст. Табуляции и переводы строк сохраняются.',
    invalid:
      'Перед проверкой введите допустимые адрес, тему и текст сообщения.',
    pdfPending: 'Проверка и подготовка точного PDF…',
    pdfReady: 'Нужный PDF предложен браузеру. Приложите его самостоятельно.',
    pdfError:
      'Нужный PDF не был предложен. Ручной текст остаётся здесь. Повторите тот же PDF.',
    model: 'Модель Компании · румынский',
    illustrative: 'Иллюстративная · английский',
  },
  fr: {
    prepare: 'Préparer le message',
    title: 'Préparation du message pour l’Offre',
    notice:
      'Vérification manuelle uniquement. Rien n’est envoyé ni enregistré. L’Offre et le PDF sont non officiels. Copiez chaque champ vérifié séparément, puis joignez vous-même le PDF voulu.',
    source: 'Source exacte de l’Offre',
    party: 'Destinataire immuable de l’Offre',
    actor: 'Acteur actuel',
    recipient: 'Destinataire',
    subject: 'Objet',
    body: 'Corps du message',
    review: 'Vérifier le message',
    reviewed:
      'Vérifié pour cette Offre exacte. Toute modification exige une nouvelle vérification.',
    copyRecipient: 'Copier le destinataire',
    copySubject: 'Copier l’objet',
    copyBody: 'Copier le corps',
    pdf: 'Télécharger le PDF voulu',
    close: 'Fermer la préparation',
    loading: 'Vérification de la source exacte…',
    sourceError:
      'La source exacte n’a pas pu être vérifiée. Votre texte manuel reste ici. Réessayez cette même source de l’Offre.',
    retrySource: 'Réessayer la source exacte',
    retired:
      'Cette préparation est fermée. Préparez un nouveau message depuis l’Offre voulue pour continuer.',
    copyPending: 'En attente du résultat du presse-papiers du navigateur…',
    copied:
      'Le navigateur a accepté ce champ dans le presse-papiers. Rien n’a été envoyé.',
    copyFailed:
      'L’écriture dans le presse-papiers n’est pas confirmée. Sélectionnez ce champ et copiez-le manuellement, ou réessayez volontairement après vérification.',
    copyUnconfirmed:
      'Résultat de copie non confirmé. Une écriture déjà demandée au navigateur peut encore aboutir. Sélectionnez le champ voulu pour une copie manuelle.',
    stopWaiting: 'Cesser d’attendre la copie',
    selectRecipient: 'Sélectionner le destinataire pour copie manuelle',
    selectSubject: 'Sélectionner l’objet pour copie manuelle',
    selectBody: 'Sélectionner le corps pour copie manuelle',
    recipientHelp:
      'Une adresse ASCII littérale, jusqu’à 254 caractères. Sans nom, espace ni séparateur.',
    subjectHelp:
      '1 à 200 unités UTF-16, non vide, sur une ligne, sans caractères de contrôle.',
    bodyHelp:
      '1 à 10 000 unités UTF-16, non vide. Tabulations et sauts de ligne conservés.',
    invalid:
      'Saisissez un destinataire, un objet et un corps valides avant la vérification.',
    pdfPending: 'Vérification et préparation du PDF exact…',
    pdfReady: 'Le PDF voulu a été proposé au navigateur. Joignez-le vous-même.',
    pdfError:
      'Le PDF voulu n’a pas été proposé. Votre texte manuel reste ici. Réessayez ce même PDF.',
    model: 'Modèle de la Compagnie · roumain',
    illustrative: 'Illustrative · anglais',
  },
});

export function useOfferMessageCopy() {
  return useMessages(offerMessageMessages);
}
