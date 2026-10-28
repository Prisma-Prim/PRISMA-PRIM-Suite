import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../localization/messages';
export const currentWorkMessages = defineMessages(
  [
    'heading',
    'help',
    'refresh',
    'retry',
    'loading',
    'empty',
    'denied',
    'missing',
    'error',
    'previous',
    'next',
    'window',
    'initial',
    'current',
    'result',
    'resultEmpty',
    'resultUnavailable',
    'return',
    'open',
  ],
  {
    en: {
      heading: 'Current mission work',
      help: 'Preserved planning beside current Task facts and human declarations. These facts do not verify or approve the work.',
      refresh: 'Refresh current work',
      retry: 'Retry current work',
      loading: 'Loading current work…',
      empty: 'This Project has no Company-configured mission plan.',
      denied:
        'Current work requires mission-plan, Task, Project and original Client read access.',
      missing: 'Current work is unavailable for this Project.',
      error: 'Current work could not be verified. Retry before continuing.',
      previous: 'Previous activities',
      next: 'Next activities',
      window: 'Activities {from}–{through} of {total}',
      initial: 'Initial source activity',
      current: 'Current Task',
      result: 'Current declared result',
      resultEmpty: 'No result recorded in the application.',
      resultUnavailable:
        'Result access unavailable. Ordinary Task work remains available.',
      return: 'Return to fresh current work',
      open: 'Open current Task',
    },
    ro: {
      heading: 'Lucrul curent al misiunii',
      help: 'Planificarea păstrată alături de datele curente ale sarcinilor și declarațiile umane. Aceste date nu verifică și nu aprobă lucrul.',
      refresh: 'Reîncarcă lucrul curent',
      retry: 'Reîncearcă lucrul curent',
      loading: 'Se încarcă lucrul curent…',
      empty: 'Acest proiect nu are un plan de misiune configurat de companie.',
      denied:
        'Lucrul curent necesită acces de citire la plan, sarcini, proiect și clientul original.',
      missing: 'Lucrul curent nu este disponibil pentru acest proiect.',
      error:
        'Lucrul curent nu a putut fi verificat. Reîncearcă înainte de a continua.',
      previous: 'Activitățile precedente',
      next: 'Activitățile următoare',
      window: 'Activitățile {from}–{through} din {total}',
      initial: 'Activitatea sursă inițială',
      current: 'Sarcina curentă',
      result: 'Rezultatul declarat curent',
      resultEmpty: 'Niciun rezultat înregistrat în aplicație.',
      resultUnavailable:
        'Accesul la rezultat nu este disponibil. Lucrul obișnuit cu sarcina rămâne disponibil.',
      return: 'Revino la lucrul curent reîncărcat',
      open: 'Deschide sarcina curentă',
    },
    ru: {
      heading: 'Текущая работа миссии',
      help: 'Сохранённый план рядом с текущими данными задач и заявлениями людей. Эти данные не подтверждают и не одобряют работу.',
      refresh: 'Обновить текущую работу',
      retry: 'Повторить загрузку текущей работы',
      loading: 'Загрузка текущей работы…',
      empty: 'У этого проекта нет плана миссии, настроенного компанией.',
      denied:
        'Для текущей работы нужен доступ к чтению плана, задач, проекта и исходного клиента.',
      missing: 'Текущая работа недоступна для этого проекта.',
      error:
        'Не удалось проверить текущую работу. Повторите загрузку перед продолжением.',
      previous: 'Предыдущие действия',
      next: 'Следующие действия',
      window: 'Действия {from}–{through} из {total}',
      initial: 'Исходное действие плана',
      current: 'Текущая задача',
      result: 'Текущий заявленный результат',
      resultEmpty: 'В приложении нет записанного результата.',
      resultUnavailable:
        'Доступ к результату недоступен. Обычная работа с задачей остаётся доступной.',
      return: 'Вернуться к обновлённой текущей работе',
      open: 'Открыть текущую задачу',
    },
    fr: {
      heading: 'Travail actuel de la mission',
      help: 'Planification conservée, faits actuels des tâches et déclarations humaines. Ces faits ne vérifient ni n’approuvent le travail.',
      refresh: 'Actualiser le travail actuel',
      retry: 'Réessayer le travail actuel',
      loading: 'Chargement du travail actuel…',
      empty: 'Ce projet n’a pas de plan de mission configuré par la société.',
      denied:
        'Le travail actuel exige les droits de lecture du plan, des tâches, du projet et du client d’origine.',
      missing: 'Le travail actuel est indisponible pour ce projet.',
      error:
        'Le travail actuel n’a pas pu être vérifié. Réessayez avant de continuer.',
      previous: 'Activités précédentes',
      next: 'Activités suivantes',
      window: 'Activités {from}–{through} sur {total}',
      initial: 'Activité source initiale',
      current: 'Tâche actuelle',
      result: 'Résultat déclaré actuel',
      resultEmpty: 'Aucun résultat enregistré dans l’application.',
      resultUnavailable:
        'Accès au résultat indisponible. Le travail ordinaire sur la tâche reste disponible.',
      return: 'Revenir au travail actuel actualisé',
      open: 'Ouvrir la tâche actuelle',
    },
  },
);
export function useCurrentWorkCopy() {
  const c = useMessages(currentWorkMessages);
  return {
    c,
    window: (from: number, through: number, total: number) =>
      formatMessage(c('window'), { from, through, total }),
  };
}
