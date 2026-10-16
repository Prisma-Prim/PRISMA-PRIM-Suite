import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../localization/messages';

const keys = [
  'title',
  'fileLabel',
  'fileHelp',
  'save',
  'saving',
  'saved',
  'invalid',
  'denied',
  'uncertain',
  'retry',
  'reload',
  'conflict',
  'absent',
  'preserved',
  'download',
  'downloading',
  'downloadFailed',
  'downloadDenied',
  'storedBy',
  'storedAt',
  'readerBundle',
  'uploaderBundle',
  'readerPrerequisites',
  'uploaderPrerequisites',
  'readerGranted',
  'readerRevoked',
  'uploaderGranted',
  'uploaderRevoked',
  'unsafe',
  'unavailable',
  'history',
  'older',
  'current',
  'historyFailed',
] as const;
export const documentPdfMessages = defineMessages(keys, {
  ro: {
    unavailable:
      'Scanarea nu este disponibilă. PDF-ul nu a fost păstrat. Încearcă din nou când scanarea este disponibilă.',
    unsafe: 'PDF-ul nu a trecut verificarea antivirus. Alege un alt fișier.',
    history: 'Istoricul PDF-urilor',
    older: 'PDF-uri mai vechi',
    current: 'PDF curent',
    historyFailed: 'Istoricul PDF-urilor nu a putut fi încărcat.',
    title: 'PDF păstrat',
    fileLabel: 'Alege fișierul PDF',
    fileHelp:
      'PDF de cel mult 5 MiB. Fișierul este verificat înainte de păstrare.',
    save: 'Păstrează PDF-ul',
    saving: 'PDF-ul este verificat și păstrat…',
    saved: 'PDF-ul a fost păstrat.',
    invalid: 'Alege un PDF de cel mult 5 MiB, cu un nume de fișier valid.',
    denied: 'Nu mai ai dreptul de a păstra acest PDF.',
    uncertain:
      'Rezultatul încărcării este incert. Poți reîncerca exact același fișier.',
    retry: 'Reîncearcă același PDF',
    reload: 'Reîncarcă Documentul și Versiunile',
    conflict: 'Documentul s-a schimbat. Reîncarcă înainte de o nouă încercare.',
    absent: 'Această Versiune nu are încă un PDF păstrat.',
    preserved:
      'Fișierele încărcate se păstrează. O Versiune oficială se corectează printr-o Versiune nouă; nimic nu se șterge.',
    download: 'Descarcă PDF-ul Versiunii {version}',
    downloading: 'PDF-ul se descarcă…',
    downloadFailed: 'PDF-ul nu a putut fi descărcat. Poți încerca din nou.',
    downloadDenied: 'Citirea metadatelor nu acordă acces la fișierul PDF.',
    storedBy: 'Păstrat de {actor}',
    storedAt: 'Păstrat la',
    readerBundle: 'Cititor de PDF-uri confidențiale ale Companiei',
    uploaderBundle: 'Încărcare de PDF-uri confidențiale ale Companiei',
    readerPrerequisites:
      'Permite doar citirea conținutului PDF. Contextul Companiei, citirea Clientului și metadatele Documentului trebuie autorizate separat.',
    uploaderPrerequisites:
      'Permite doar încărcarea PDF-urilor de lucru. Citirea conținutului, metadatele și gestionarea Versiunilor trebuie autorizate separat.',
    readerGranted: 'a acordat citirea PDF-urilor confidențiale ale Companiei',
    readerRevoked: 'a revocat citirea PDF-urilor confidențiale ale Companiei',
    uploaderGranted:
      'a acordat încărcarea PDF-urilor confidențiale ale Companiei',
    uploaderRevoked:
      'a revocat încărcarea PDF-urilor confidențiale ale Companiei',
  },
  ru: {
    unavailable:
      'Проверка недоступна. PDF не сохранён. Повторите попытку, когда проверка станет доступна.',
    unsafe: 'PDF не прошёл антивирусную проверку. Выберите другой файл.',
    history: 'История PDF',
    older: 'Предыдущие PDF',
    current: 'Текущий PDF',
    historyFailed: 'Не удалось загрузить историю PDF.',
    title: 'Сохранённый PDF',
    fileLabel: 'Выберите файл PDF',
    fileHelp:
      'PDF размером не более 5 МиБ. Файл проверяется перед сохранением.',
    save: 'Сохранить PDF',
    saving: 'PDF проверяется и сохраняется…',
    saved: 'PDF сохранён.',
    invalid: 'Выберите PDF размером не более 5 МиБ с допустимым именем файла.',
    denied: 'У вас больше нет права сохранять этот PDF.',
    uncertain:
      'Результат загрузки неизвестен. Можно повторить отправку точно того же файла.',
    retry: 'Повторить тот же PDF',
    reload: 'Обновить Документ и Версии',
    conflict: 'Документ изменился. Обновите его перед новой попыткой.',
    absent: 'Для этой Версии ещё нет сохранённого PDF.',
    preserved:
      'Все загруженные файлы сохраняются. Официальная Версия исправляется новой Версией; удаление невозможно.',
    download: 'Скачать PDF Версии {version}',
    downloading: 'PDF скачивается…',
    downloadFailed: 'Не удалось скачать PDF. Можно повторить попытку.',
    downloadDenied: 'Чтение метаданных не даёт доступа к файлу PDF.',
    storedBy: 'Сохранил: {actor}',
    storedAt: 'Время сохранения',
    readerBundle: 'Чтение конфиденциальных PDF Компании',
    uploaderBundle: 'Загрузка конфиденциальных PDF Компании',
    readerPrerequisites:
      'Даёт только право читать содержимое PDF. Контекст Компании, чтение Клиента и метаданных Документа разрешаются отдельно.',
    uploaderPrerequisites:
      'Даёт только право загружать рабочие PDF. Чтение содержимого и метаданных, а также управление Версиями разрешаются отдельно.',
    readerGranted: 'предоставил чтение конфиденциальных PDF Компании',
    readerRevoked: 'отозвал чтение конфиденциальных PDF Компании',
    uploaderGranted: 'предоставил загрузку конфиденциальных PDF Компании',
    uploaderRevoked: 'отозвал загрузку конфиденциальных PDF Компании',
  },
  fr: {
    unavailable:
      'L’analyse est indisponible. Le PDF n’a pas été conservé. Réessayez lorsque l’analyse sera disponible.',
    unsafe:
      'Le PDF n’a pas passé le contrôle antivirus. Choisissez un autre fichier.',
    history: 'Historique des PDF',
    older: 'PDF plus anciens',
    current: 'PDF courant',
    historyFailed: 'L’historique des PDF n’a pas pu être chargé.',
    title: 'PDF conservé',
    fileLabel: 'Choisir le fichier PDF',
    fileHelp:
      'PDF de 5 Mio maximum. Le fichier est contrôlé avant sa conservation.',
    save: 'Conserver le PDF',
    saving: 'Contrôle et conservation du PDF…',
    saved: 'Le PDF a été conservé.',
    invalid:
      'Choisissez un PDF de 5 Mio maximum avec un nom de fichier valide.',
    denied: 'Vous ne pouvez plus conserver ce PDF.',
    uncertain:
      'Le résultat du dépôt est incertain. Vous pouvez renvoyer exactement le même fichier.',
    retry: 'Réessayer le même PDF',
    reload: 'Recharger le Document et ses Versions',
    conflict: 'Le Document a changé. Rechargez-le avant de réessayer.',
    absent: 'Cette Version ne contient pas encore de PDF conservé.',
    preserved:
      'Tous les fichiers déposés sont conservés. Une Version officielle se corrige par une nouvelle Version ; aucune suppression n’est possible.',
    download: 'Télécharger le PDF de la Version {version}',
    downloading: 'Téléchargement du PDF…',
    downloadFailed: 'Le PDF n’a pas pu être téléchargé. Vous pouvez réessayer.',
    downloadDenied:
      'La lecture des métadonnées ne donne pas accès au fichier PDF.',
    storedBy: 'Conservé par {actor}',
    storedAt: 'Conservé le',
    readerBundle: 'Lecture des PDF confidentiels de la Compagnie',
    uploaderBundle: 'Dépôt des PDF confidentiels de la Compagnie',
    readerPrerequisites:
      'Accorde uniquement la lecture du contenu PDF. Le contexte de Compagnie, la lecture du Client et des métadonnées du Document restent autorisés séparément.',
    uploaderPrerequisites:
      'Accorde uniquement le dépôt des PDF de travail. La lecture du contenu, les métadonnées et la gestion des Versions restent autorisées séparément.',
    readerGranted: 'a accordé la lecture des PDF confidentiels de la Compagnie',
    readerRevoked: 'a révoqué la lecture des PDF confidentiels de la Compagnie',
    uploaderGranted: 'a accordé le dépôt des PDF confidentiels de la Compagnie',
    uploaderRevoked: 'a révoqué le dépôt des PDF confidentiels de la Compagnie',
  },
  en: {
    unavailable:
      'Scanning is unavailable. The PDF was not preserved. Try again when scanning is available.',
    unsafe: 'The PDF failed the malware scan. Choose another file.',
    history: 'PDF history',
    older: 'Older PDFs',
    current: 'Current PDF',
    historyFailed: 'The PDF history could not be loaded.',
    title: 'Preserved PDF',
    fileLabel: 'Choose the PDF file',
    fileHelp: 'PDF up to 5 MiB. The file is checked before preservation.',
    save: 'Preserve PDF',
    saving: 'Checking and preserving the PDF…',
    saved: 'The PDF was preserved.',
    invalid: 'Choose a PDF up to 5 MiB with a valid filename.',
    denied: 'You no longer have permission to preserve this PDF.',
    uncertain:
      'The upload result is uncertain. You can retry the exact same file.',
    retry: 'Retry the same PDF',
    reload: 'Reload Document and Versions',
    conflict: 'This Document changed. Reload it before trying again.',
    absent: 'This Version has no preserved PDF yet.',
    preserved:
      'Every uploaded file is preserved. Correct an official Version through a successor Version; nothing can be deleted.',
    download: 'Download Version {version} PDF',
    downloading: 'Downloading the PDF…',
    downloadFailed: 'The PDF could not be downloaded. You can retry.',
    downloadDenied: 'Reading metadata does not grant access to the PDF file.',
    storedBy: 'Preserved by {actor}',
    storedAt: 'Preserved at',
    readerBundle: 'Company confidential PDF reader',
    uploaderBundle: 'Company confidential PDF uploader',
    readerPrerequisites:
      'Grants PDF content read only. Company context, Client read and Document metadata read must be authorized separately.',
    uploaderPrerequisites:
      'Grants working PDF upload only. Content read, metadata read and Version management must be authorized separately.',
    readerGranted: 'granted Company confidential PDF read',
    readerRevoked: 'revoked Company confidential PDF read',
    uploaderGranted: 'granted Company confidential PDF upload',
    uploaderRevoked: 'revoked Company confidential PDF upload',
  },
});

export function useDocumentPdfCopy() {
  const t = useMessages(documentPdfMessages);
  return {
    t,
    download: (version: number) => formatMessage(t('download'), { version }),
    storedBy: (actor: string) => formatMessage(t('storedBy'), { actor }),
    activityActionLabels: {
      'company_document_content_reader_assignment.granted': t('readerGranted'),
      'company_document_content_reader_assignment.revoked': t('readerRevoked'),
      'company_document_content_uploader_assignment.granted':
        t('uploaderGranted'),
      'company_document_content_uploader_assignment.revoked':
        t('uploaderRevoked'),
    },
  };
}
export type DocumentPdfCopy = ReturnType<typeof useDocumentPdfCopy>;
