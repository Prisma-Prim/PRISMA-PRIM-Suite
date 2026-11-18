import { useInterfaceLocale } from '../localization/interface-locale';

const en = {
  pausing: 'Finishing the current batch before pausing',
  reviews: 'Recent reviews',
  callbackWaiting: 'Completing the connection…',
  title: 'Document review with ChatGPT',
  connect: 'Continue with ChatGPT',
  disconnect: 'Disconnect ChatGPT',
  unavailable:
    'The connection must be configured for an eligible account before use.',
  disclosure:
    'Use my ChatGPT plan and share the selected extracted passages with OpenAI for this review. No automatic paid fallback.',
  background:
    'Keep this page open to process batches. Leaving preserves progress so you can resume later.',
  model: 'Model',
  language: 'Analysis language',
  start: 'Start document review',
  refresh: 'Refresh review',
  pause: 'Pause review',
  resume: 'Resume review',
  cancel: 'Cancel review',
  retry: 'Retry the same request',
  imported: 'Proposals imported. Review them below before confirming anything.',
  import: 'Import proposals for review',
  error:
    'This operation did not complete. Check the connection, access and source freshness before retrying.',
  popup: 'Allow the sign-in window, then try again.',
  callback: 'Sign-in received. You can return to PRISMA.',
  callbackError:
    'Sign-in could not be completed. Return to PRISMA and start again.',
  remoteUnknown:
    'Disconnected locally. Remote revocation was not confirmed; review the connection in ChatGPT settings.',
  progress: 'Completed batches',
  cache: 'Batches reused',
  coverage: 'Readable source units',
  partial:
    'Some source material is unreadable or partial. No result establishes dossier completeness or conformity.',
  proposals: 'Candidate proposals',
  none: 'No candidate proposal from the completed batches. This does not prove absence.',
  usage: 'Manage ChatGPT usage',
  account: 'Connected account',
  queued: 'Ready for the next batch',
  running: 'Processing a batch',
  paused: 'Review paused',
  quota:
    'ChatGPT usage limit reached. Progress is preserved. Resume after checking your allowance.',
  reauth: 'Reconnect the same ChatGPT account, then resume this review.',
  failed:
    'The batch could not be validated. Progress is preserved; inspect the sources before retrying.',
  uncertain:
    'The previous request may have used your allowance. Resuming may repeat that batch.',
  completed: 'Review completed',
  cancelled: 'Review cancelled',
  stale: 'Sources changed. Create a fresh dossier analysis before continuing.',
};
type Copy = { [K in keyof typeof en]: string };
const ro: Copy = {
  pausing: 'Se finalizează lotul curent înainte de întrerupere',
  reviews: 'Verificări recente',
  callbackWaiting: 'Se finalizează conexiunea…',
  title: 'Verificarea documentelor cu ChatGPT',
  connect: 'Continuă cu ChatGPT',
  disconnect: 'Deconectează ChatGPT',
  unavailable:
    'Conexiunea trebuie configurată pentru un cont eligibil înainte de utilizare.',
  disclosure:
    'Folosesc abonamentul meu ChatGPT și transmit pasajele extrase selectate către OpenAI pentru această verificare. Fără trecere automată la servicii plătite.',
  background:
    'Păstrați pagina deschisă pentru procesare. Progresul se păstrează dacă plecați și poate fi reluat ulterior.',
  model: 'Model',
  language: 'Limba analizei',
  start: 'Începe verificarea documentelor',
  refresh: 'Reîncarcă verificarea',
  pause: 'Întrerupe verificarea',
  resume: 'Reia verificarea',
  cancel: 'Anulează verificarea',
  retry: 'Reîncearcă aceeași cerere',
  imported:
    'Propunerile au fost importate. Verificați-le mai jos înainte de confirmare.',
  import: 'Importă propunerile pentru verificare',
  error:
    'Operațiunea nu s-a finalizat. Verificați conexiunea, accesul și actualitatea surselor înainte de reîncercare.',
  popup: 'Permiteți fereastra de autentificare și încercați din nou.',
  callback: 'Autentificarea a fost primită. Puteți reveni la PRISMA.',
  callbackError:
    'Autentificarea nu s-a finalizat. Reveniți la PRISMA și începeți din nou.',
  remoteUnknown:
    'Deconectat local. Revocarea la distanță nu a fost confirmată; verificați conexiunea în setările ChatGPT.',
  progress: 'Loturi finalizate',
  cache: 'Loturi reutilizate',
  coverage: 'Unități de sursă lizibile',
  partial:
    'Unele surse sunt ilizibile sau parțiale. Rezultatul nu dovedește caracterul complet sau conformitatea dosarului.',
  proposals: 'Propuneri candidate',
  none: 'Nicio propunere din loturile finalizate. Aceasta nu dovedește absența informației.',
  usage: 'Gestionează utilizarea ChatGPT',
  account: 'Cont conectat',
  queued: 'Pregătit pentru lotul următor',
  running: 'Se procesează un lot',
  paused: 'Verificare întreruptă',
  quota:
    'Limita ChatGPT a fost atinsă. Progresul este păstrat. Reluați după verificarea limitei disponibile.',
  reauth: 'Reconectați același cont ChatGPT, apoi reluați verificarea.',
  failed:
    'Lotul nu a putut fi validat. Progresul este păstrat; verificați sursele înainte de reîncercare.',
  uncertain:
    'Cererea anterioară poate să fi consumat din abonament. Reluarea poate repeta acel lot.',
  completed: 'Verificare finalizată',
  cancelled: 'Verificare anulată',
  stale:
    'Sursele s-au schimbat. Creați o analiză nouă a dosarului înainte de continuare.',
};
const ru: Copy = {
  pausing: 'Текущий пакет завершается перед паузой',
  reviews: 'Последние проверки',
  callbackWaiting: 'Подключение завершается…',
  title: 'Проверка документов с ChatGPT',
  connect: 'Продолжить с ChatGPT',
  disconnect: 'Отключить ChatGPT',
  unavailable:
    'Перед использованием необходимо настроить подключение для подходящей учётной записи.',
  disclosure:
    'Использовать мою подписку ChatGPT и передать выбранные извлечённые фрагменты OpenAI для этой проверки. Без автоматического перехода на платные услуги.',
  background:
    'Оставьте страницу открытой для обработки. При выходе прогресс сохраняется, и проверку можно продолжить позже.',
  model: 'Модель',
  language: 'Язык анализа',
  start: 'Начать проверку документов',
  refresh: 'Обновить проверку',
  pause: 'Приостановить проверку',
  resume: 'Продолжить проверку',
  cancel: 'Отменить проверку',
  retry: 'Повторить тот же запрос',
  imported:
    'Предложения импортированы. Проверьте их ниже перед подтверждением.',
  import: 'Импортировать предложения для проверки',
  error:
    'Операция не завершена. Перед повтором проверьте подключение, доступ и актуальность источников.',
  popup: 'Разрешите окно входа и повторите попытку.',
  callback: 'Данные входа получены. Можно вернуться в PRISMA.',
  callbackError: 'Вход не завершён. Вернитесь в PRISMA и начните заново.',
  remoteUnknown:
    'Локальное подключение отключено. Отзыв удалённого доступа не подтверждён; проверьте подключение в настройках ChatGPT.',
  progress: 'Завершено пакетов',
  cache: 'Повторно использовано пакетов',
  coverage: 'Прочитано единиц источников',
  partial:
    'Часть источников не читается или прочитана частично. Результат не подтверждает полноту или соответствие досье.',
  proposals: 'Предварительные предложения',
  none: 'В завершённых пакетах предложений нет. Это не доказывает отсутствие сведений.',
  usage: 'Управление использованием ChatGPT',
  account: 'Подключённая учётная запись',
  queued: 'Готово к следующему пакету',
  running: 'Обрабатывается пакет',
  paused: 'Проверка приостановлена',
  quota:
    'Достигнут лимит ChatGPT. Прогресс сохранён. Продолжите после проверки доступного лимита.',
  reauth: 'Подключите ту же учётную запись ChatGPT и продолжите проверку.',
  failed:
    'Не удалось проверить результат пакета. Прогресс сохранён; проверьте источники перед повтором.',
  uncertain:
    'Предыдущий запрос мог израсходовать лимит подписки. При продолжении пакет может быть обработан повторно.',
  completed: 'Проверка завершена',
  cancelled: 'Проверка отменена',
  stale:
    'Источники изменились. Перед продолжением создайте новый анализ досье.',
};
const fr: Copy = {
  pausing: 'Fin du lot en cours avant la pause',
  reviews: 'Analyses récentes',
  callbackWaiting: 'Finalisation de la connexion…',
  title: 'Analyse documentaire avec ChatGPT',
  connect: 'Continuer avec ChatGPT',
  disconnect: 'Déconnecter ChatGPT',
  unavailable:
    'La connexion doit être configurée pour un compte éligible avant utilisation.',
  disclosure:
    'Utiliser mon abonnement ChatGPT et transmettre les passages extraits sélectionnés à OpenAI pour cette analyse. Aucun basculement payant automatique.',
  background:
    'Gardez cette page ouverte pour traiter les lots. Le progrès est conservé si vous partez et peut être repris ensuite.',
  model: 'Modèle',
  language: 'Langue de l’analyse',
  start: 'Lancer l’analyse documentaire',
  refresh: 'Actualiser l’analyse',
  pause: 'Mettre en pause',
  resume: 'Reprendre l’analyse',
  cancel: 'Annuler l’analyse',
  retry: 'Réessayer la même requête',
  imported:
    'Propositions importées. Vérifiez-les ci-dessous avant toute confirmation.',
  import: 'Importer les propositions pour vérification',
  error:
    'L’opération n’a pas abouti. Vérifiez la connexion, les accès et l’actualité des sources avant de réessayer.',
  popup: 'Autorisez la fenêtre de connexion puis réessayez.',
  callback: 'Connexion reçue. Vous pouvez revenir dans PRISMA.',
  callbackError:
    'La connexion n’a pas abouti. Revenez dans PRISMA et recommencez.',
  remoteUnknown:
    'Déconnexion locale effectuée. La révocation distante n’a pas été confirmée ; vérifiez la connexion dans les paramètres ChatGPT.',
  progress: 'Lots terminés',
  cache: 'Lots réutilisés',
  coverage: 'Unités sources lisibles',
  partial:
    'Certaines sources sont illisibles ou partielles. Le résultat ne prouve ni la complétude ni la conformité du dossier.',
  proposals: 'Propositions candidates',
  none: 'Aucune proposition dans les lots terminés. Cela ne prouve pas l’absence d’information.',
  usage: 'Gérer l’utilisation ChatGPT',
  account: 'Compte connecté',
  queued: 'Prêt pour le lot suivant',
  running: 'Traitement d’un lot',
  paused: 'Analyse en pause',
  quota:
    'Limite ChatGPT atteinte. Le progrès est conservé. Reprenez après vérification de votre capacité disponible.',
  reauth: 'Reconnectez le même compte ChatGPT puis reprenez cette analyse.',
  failed:
    'Le résultat du lot n’a pas pu être validé. Le progrès est conservé ; vérifiez les sources avant de réessayer.',
  uncertain:
    'La requête précédente a pu consommer votre abonnement. Reprendre peut répéter ce lot.',
  completed: 'Analyse terminée',
  cancelled: 'Analyse annulée',
  stale:
    'Les sources ont changé. Créez une nouvelle analyse du dossier avant de continuer.',
};
export function useHarnessCopy() {
  const { locale } = useInterfaceLocale();
  return { en, ro, ru, fr }[locale];
}
