import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'title',
  'help',
  'search',
  'find',
  'more',
  'loading',
  'failed',
  'empty',
] as const;
export const teamCandidateMessages = defineMessages(keys, {
  en: {
    title: 'Find an internal auditor',
    help: 'Find active auditors authorized for this Company. External experts may still be recorded by name without linking an account.',
    search: 'Auditor name',
    find: 'Find auditors',
    more: 'Load more auditors',
    loading: 'Loading eligible auditors…',
    failed: 'Auditors could not be loaded. Try the search again.',
    empty: 'No eligible auditor matches this search.',
  },
  fr: {
    title: 'Rechercher un auditeur interne',
    help: 'Recherchez les auditeurs actifs autorisés pour cette société. Les experts externes peuvent être inscrits par leur nom sans compte lié.',
    search: 'Nom de l’auditeur',
    find: 'Rechercher les auditeurs',
    more: 'Charger d’autres auditeurs',
    loading: 'Chargement des auditeurs éligibles…',
    failed: 'Chargement impossible. Relancez la recherche.',
    empty: 'Aucun auditeur éligible ne correspond à cette recherche.',
  },
  ro: {
    title: 'Căutați un auditor intern',
    help: 'Căutați auditorii activi autorizați pentru această companie. Experții externi pot fi înscriși după nume, fără un cont asociat.',
    search: 'Numele auditorului',
    find: 'Căutați auditori',
    more: 'Încărcați alți auditori',
    loading: 'Se încarcă auditorii eligibili…',
    failed: 'Auditorii nu au putut fi încărcați. Repetați căutarea.',
    empty: 'Niciun auditor eligibil nu corespunde căutării.',
  },
  ru: {
    title: 'Найти внутреннего аудитора',
    help: 'Найдите действующих аудиторов с доступом к этой компании. Внешних экспертов можно записать по имени без привязки учётной записи.',
    search: 'Имя аудитора',
    find: 'Найти аудиторов',
    more: 'Загрузить ещё аудиторов',
    loading: 'Загрузка доступных аудиторов…',
    failed: 'Не удалось загрузить аудиторов. Повторите поиск.',
    empty: 'По этому запросу нет доступных аудиторов.',
  },
});
export function useTeamCandidateCopy() {
  return useMessages(teamCandidateMessages);
}
