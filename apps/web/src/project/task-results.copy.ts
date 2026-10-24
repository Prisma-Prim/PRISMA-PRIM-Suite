import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../localization/messages';

const keys = [
  'title',
  'empty',
  'loading',
  'unavailable',
  'malformed',
  'denied',
  'readOnly',
  'noVersions',
  'declaration',
  'version',
  'reason',
  'record',
  'correct',
  'cancel',
  'save',
  'confirmed',
  'unchanged',
  'pending',
  'uncertain',
  'retry',
  'conflict',
  'reload',
  'invalid',
  'history',
  'older',
  'historyFailed',
  'download',
  'downloadFailed',
  'downloading',
  'official',
  'superseded',
  'revision',
  'warning',
  'bundle',
  'prerequisites',
  'granted',
  'revoked',
] as const;
export const taskResultMessages = defineMessages(keys, {
  en: {
    title: 'Declared Task result',
    empty: 'No declared result.',
    loading: 'Loading Task result…',
    unavailable: 'The Task result could not be loaded.',
    malformed:
      'The Task result response could not be verified. Reload before continuing.',
    denied:
      'Task result access is unavailable. Ordinary Task work remains separate.',
    readOnly:
      'Result history is read-only. New declarations require an open Task and Project and an active original Client relationship.',
    noVersions:
      'Associate a frozen mission deliverable PDF with this Project before recording a result.',
    declaration: 'Result declaration',
    version: 'Frozen mission Version',
    reason: 'Correction reason',
    record: 'Record result',
    correct: 'Correct result',
    cancel: 'Cancel correction',
    save: 'Save correction',
    confirmed: 'Result confirmed.',
    unchanged: 'The declared result is unchanged.',
    pending: 'Recording result…',
    uncertain:
      'The result is uncertain. Retry the exact same command to confirm it.',
    retry: 'Retry exact result command',
    conflict:
      'The Task or result changed. Reload before preparing another command.',
    reload: 'Reload result',
    invalid:
      'Enter a declaration, a frozen Version and, for a correction, a reason within the displayed limits.',
    history: 'Result history',
    older: 'Older declarations',
    historyFailed: 'Result history could not be loaded.',
    download: 'Download exact PDF · Version {number}',
    downloadFailed: 'The exact PDF could not be downloaded.',
    downloading: 'Downloading exact PDF…',
    official: 'Official',
    superseded: 'Superseded · historical',
    revision: 'Result revision {number}',
    warning:
      'A declared result records what a collaborator says the Task produced. It does not verify or approve the work and does not complete the Task.',
    bundle: 'Company Task Result Recorder',
    prerequisites:
      'Records and corrects Task results only. Task management, Project, Client, Document, mission-family and PDF content rights remain separately required.',
    granted: 'granted Company Task Result Recorder',
    revoked: 'revoked Company Task Result Recorder',
  },
  fr: {
    title: 'Résultat déclaré de la tâche',
    empty: 'Aucun résultat déclaré.',
    loading: 'Chargement du résultat…',
    unavailable: 'Impossible de charger le résultat.',
    malformed:
      'La réponse du résultat n’a pas pu être vérifiée. Rechargez avant de continuer.',
    denied:
      'L’accès au résultat est indisponible. Le travail habituel sur la tâche reste distinct.',
    readOnly:
      'L’historique du résultat est en lecture seule. Toute nouvelle déclaration exige une tâche et un projet ouverts et une relation active avec le Client d’origine.',
    noVersions:
      'Associez un PDF de livrable de mission figé à ce projet avant de déclarer un résultat.',
    declaration: 'Déclaration du résultat',
    version: 'Version figée de mission',
    reason: 'Motif de correction',
    record: 'Déclarer le résultat',
    correct: 'Corriger le résultat',
    cancel: 'Annuler la correction',
    save: 'Enregistrer la correction',
    confirmed: 'Résultat confirmé.',
    unchanged: 'Le résultat déclaré est inchangé.',
    pending: 'Enregistrement du résultat…',
    uncertain:
      'Le résultat est incertain. Réessayez exactement la même commande pour le confirmer.',
    retry: 'Réessayer la commande exacte',
    conflict:
      'La tâche ou le résultat a changé. Rechargez avant de préparer une autre commande.',
    reload: 'Recharger le résultat',
    invalid:
      'Saisissez une déclaration, une Version figée et, pour une correction, un motif respectant les limites affichées.',
    history: 'Historique du résultat',
    older: 'Déclarations précédentes',
    historyFailed: 'Impossible de charger l’historique du résultat.',
    download: 'Télécharger le PDF exact · Version {number}',
    downloadFailed: 'Impossible de télécharger le PDF exact.',
    downloading: 'Téléchargement du PDF exact…',
    official: 'Officielle',
    superseded: 'Remplacée · historique',
    revision: 'Révision du résultat {number}',
    warning:
      'Un résultat déclaré indique ce qu’un collaborateur dit avoir produit. Il ne vérifie ni n’approuve le travail et ne termine pas la tâche.',
    bundle: 'Déclarant de résultats de tâche de la société',
    prerequisites:
      'Déclare et corrige uniquement les résultats de tâche. Les droits de gestion des tâches, Projet, Client, Document, famille de mission et contenu PDF restent nécessaires séparément.',
    granted: 'a accordé la déclaration de résultats de tâche de la société',
    revoked: 'a révoqué la déclaration de résultats de tâche de la société',
  },
  ro: {
    title: 'Rezultatul declarat al sarcinii',
    empty: 'Niciun rezultat declarat.',
    loading: 'Se încarcă rezultatul…',
    unavailable: 'Rezultatul nu a putut fi încărcat.',
    malformed:
      'Răspunsul rezultatului nu a putut fi verificat. Reîncărcați înainte de a continua.',
    denied:
      'Accesul la rezultat nu este disponibil. Activitatea obișnuită asupra sarcinii rămâne separată.',
    readOnly:
      'Istoricul rezultatului poate fi doar citit. Declarațiile noi necesită o sarcină și un proiect deschise și o relație activă cu Clientul original.',
    noVersions:
      'Asociați un PDF înghețat de livrabil de misiune acestui proiect înainte de a declara un rezultat.',
    declaration: 'Declarația rezultatului',
    version: 'Versiune înghețată de misiune',
    reason: 'Motivul corectării',
    record: 'Declară rezultatul',
    correct: 'Corectează rezultatul',
    cancel: 'Anulează corectarea',
    save: 'Salvează corectarea',
    confirmed: 'Rezultat confirmat.',
    unchanged: 'Rezultatul declarat este neschimbat.',
    pending: 'Se înregistrează rezultatul…',
    uncertain:
      'Rezultatul este incert. Reîncercați exact aceeași comandă pentru confirmare.',
    retry: 'Reîncearcă comanda exactă',
    conflict:
      'Sarcina sau rezultatul s-a schimbat. Reîncărcați înainte de o altă comandă.',
    reload: 'Reîncarcă rezultatul',
    invalid:
      'Introduceți o declarație, o Versiune înghețată și, pentru corectare, un motiv în limitele afișate.',
    history: 'Istoricul rezultatului',
    older: 'Declarații anterioare',
    historyFailed: 'Istoricul rezultatului nu a putut fi încărcat.',
    download: 'Descarcă PDF-ul exact · Versiunea {number}',
    downloadFailed: 'PDF-ul exact nu a putut fi descărcat.',
    downloading: 'Se descarcă PDF-ul exact…',
    official: 'Oficială',
    superseded: 'Înlocuită · istorică',
    revision: 'Revizia rezultatului {number}',
    warning:
      'Un rezultat declarat consemnează ce spune un colaborator că a produs sarcina. Nu verifică și nu aprobă activitatea și nu finalizează sarcina.',
    bundle: 'Declarant de rezultate ale sarcinilor companiei',
    prerequisites:
      'Declară și corectează doar rezultatele sarcinilor. Drepturile de gestionare a sarcinilor, Proiect, Client, Document, familie de misiune și conținut PDF sunt necesare separat.',
    granted: 'a acordat declararea rezultatelor sarcinilor companiei',
    revoked: 'a revocat declararea rezultatelor sarcinilor companiei',
  },
  ru: {
    title: 'Заявленный результат задачи',
    empty: 'Результат не заявлен.',
    loading: 'Загрузка результата…',
    unavailable: 'Не удалось загрузить результат.',
    malformed:
      'Не удалось проверить ответ результата. Обновите перед продолжением.',
    denied:
      'Доступ к результату недоступен. Обычная работа с задачей остаётся отдельной.',
    readOnly:
      'История результата доступна только для чтения. Новые заявления требуют открытых задачи и проекта и действующей связи с исходным Клиентом.',
    noVersions:
      'Свяжите зафиксированный PDF результата миссии с этим проектом перед заявлением результата.',
    declaration: 'Заявление результата',
    version: 'Зафиксированная Версия миссии',
    reason: 'Причина исправления',
    record: 'Заявить результат',
    correct: 'Исправить результат',
    cancel: 'Отменить исправление',
    save: 'Сохранить исправление',
    confirmed: 'Результат подтверждён.',
    unchanged: 'Заявленный результат не изменён.',
    pending: 'Запись результата…',
    uncertain:
      'Результат неизвестен. Повторите точно ту же команду для подтверждения.',
    retry: 'Повторить точную команду',
    conflict: 'Задача или результат изменились. Обновите перед новой командой.',
    reload: 'Обновить результат',
    invalid:
      'Введите заявление, зафиксированную Версию и причину исправления в указанных пределах.',
    history: 'История результата',
    older: 'Предыдущие заявления',
    historyFailed: 'Не удалось загрузить историю результата.',
    download: 'Скачать точный PDF · Версия {number}',
    downloadFailed: 'Не удалось скачать точный PDF.',
    downloading: 'Загрузка точного PDF…',
    official: 'Официальная',
    superseded: 'Заменена · историческая',
    revision: 'Редакция результата {number}',
    warning:
      'Заявленный результат записывает слова сотрудника о результате задачи. Он не проверяет и не одобряет работу и не завершает задачу.',
    bundle: 'Регистратор результатов задач компании',
    prerequisites:
      'Заявляет и исправляет только результаты задач. Права управления задачами, Проекта, Клиента, Документа, семейства миссии и содержимого PDF требуются отдельно.',
    granted: 'предоставил регистрацию результатов задач компании',
    revoked: 'отозвал регистрацию результатов задач компании',
  },
});
export function useTaskResultCopy() {
  const t = useMessages(taskResultMessages);
  return {
    t,
    download: (number: number) => formatMessage(t('download'), { number }),
    revision: (number: number) => formatMessage(t('revision'), { number }),
    activityActionLabels: {
      'company_task_result_recorder_assignment.granted': t('granted'),
      'company_task_result_recorder_assignment.revoked': t('revoked'),
    },
  };
}
