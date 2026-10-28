import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'open',
  'close',
  'title',
  'guidance',
  'empty',
  'limit',
  'select',
  'save',
  'saved',
  'reload',
  'uncertain',
  'retry',
  'conflict',
  'validation',
  'loading',
  'error',
  'rejected',
  'missing',
] as const;
export const taskPlanningMessages = defineMessages(keys, {
  en: {
    missing:
      'A selected Task or its original Client is unavailable for new planning. Reload planning to check the current state.',
    open: 'Plan selected Tasks',
    close: 'Close grouped planning',
    title: 'Grouped Task planning',
    guidance:
      'Select up to 50 open Tasks. Choose responsibility and dates for each, then save them together.',
    empty: 'No open Tasks to plan.',
    limit: 'Select up to 50 Tasks at a time.',
    select: 'Select for planning',
    save: 'Save selected planning',
    saved: 'Selected planning saved.',
    reload: 'Reload planning',
    uncertain:
      'The save is unconfirmed. Retry the same selected planning to recover its result.',
    retry: 'Retry the same planning',
    conflict:
      'A Task or its Project changed. Reload planning before choosing another action.',
    validation: 'Select 1–50 Tasks and enter valid calendar dates.',
    loading: 'Loading planning…',
    error: 'Planning could not be loaded. Reload to try again.',
    rejected:
      'Planning was refused. Reload and check the selected Tasks and responsible members.',
  },
  fr: {
    missing:
      'Une tâche sélectionnée ou son client d’origine est indisponible pour une nouvelle planification. Rechargez pour vérifier la situation actuelle.',
    open: 'Planifier des tâches',
    close: 'Fermer la planification groupée',
    title: 'Planification groupée des tâches',
    guidance:
      'Sélectionnez jusqu’à 50 tâches ouvertes. Choisissez les responsables et les dates, puis enregistrez le groupe.',
    empty: 'Aucune tâche ouverte à planifier.',
    limit: 'Sélectionnez au maximum 50 tâches à la fois.',
    select: 'Sélectionner pour la planification',
    save: 'Enregistrer la planification sélectionnée',
    saved: 'Planification sélectionnée enregistrée.',
    reload: 'Recharger la planification',
    uncertain:
      'L’enregistrement n’est pas confirmé. Réessayez la même planification pour retrouver son résultat.',
    retry: 'Réessayer la même planification',
    conflict:
      'Une tâche ou son projet a changé. Rechargez la planification avant une nouvelle action.',
    validation:
      'Sélectionnez entre 1 et 50 tâches et saisissez des dates valides.',
    loading: 'Chargement de la planification…',
    error:
      'La planification n’a pas pu être chargée. Rechargez pour réessayer.',
    rejected:
      'Planification refusée. Rechargez et vérifiez les tâches et les responsables sélectionnés.',
  },
  ro: {
    missing:
      'O sarcină selectată sau clientul ei inițial nu este disponibil pentru o planificare nouă. Reîncarcă pentru a verifica situația actuală.',
    open: 'Planifică sarcini selectate',
    close: 'Închide planificarea grupată',
    title: 'Planificarea grupată a sarcinilor',
    guidance:
      'Selectează până la 50 de sarcini deschise. Alege responsabilii și datele, apoi salvează grupul.',
    empty: 'Nu există sarcini deschise de planificat.',
    limit: 'Selectează cel mult 50 de sarcini odată.',
    select: 'Selectează pentru planificare',
    save: 'Salvează planificarea selectată',
    saved: 'Planificarea selectată a fost salvată.',
    reload: 'Reîncarcă planificarea',
    uncertain:
      'Salvarea nu este confirmată. Reîncearcă aceeași planificare pentru a recupera rezultatul.',
    retry: 'Reîncearcă aceeași planificare',
    conflict:
      'O sarcină sau proiectul s-a modificat. Reîncarcă planificarea înainte de o nouă acțiune.',
    validation:
      'Selectează între 1 și 50 de sarcini și introdu date calendaristice valide.',
    loading: 'Se încarcă planificarea…',
    error:
      'Planificarea nu a putut fi încărcată. Reîncarcă pentru a reîncerca.',
    rejected:
      'Planificarea a fost refuzată. Reîncarcă și verifică sarcinile și responsabilii selectați.',
  },
  ru: {
    missing:
      'Выбранная задача или её исходный клиент недоступны для нового планирования. Обновите данные, чтобы проверить текущее состояние.',
    open: 'Планировать выбранные задачи',
    close: 'Закрыть групповое планирование',
    title: 'Групповое планирование задач',
    guidance:
      'Выберите до 50 открытых задач. Укажите ответственных и даты, затем сохраните группу.',
    empty: 'Нет открытых задач для планирования.',
    limit: 'Выберите не более 50 задач за один раз.',
    select: 'Выбрать для планирования',
    save: 'Сохранить выбранный план',
    saved: 'Выбранный план сохранён.',
    reload: 'Обновить планирование',
    uncertain:
      'Сохранение не подтверждено. Повторите тот же план, чтобы получить результат.',
    retry: 'Повторить тот же план',
    conflict:
      'Задача или проект изменились. Обновите планирование перед новым действием.',
    validation:
      'Выберите от 1 до 50 задач и укажите корректные календарные даты.',
    loading: 'Загрузка планирования…',
    error: 'Не удалось загрузить планирование. Обновите для повторной попытки.',
    rejected:
      'План отклонён. Обновите и проверьте выбранные задачи и ответственных.',
  },
});
export function useTaskPlanningCopy() {
  return useMessages(taskPlanningMessages);
}
