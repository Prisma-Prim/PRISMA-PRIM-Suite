import { defineMessages, useMessages } from '../localization/messages';

// Retained English compatibility labels for existing Activity composition.
export const projectDocumentsCopy = {
  title: 'Working Documents',
  linked: 'attached a working Document to a Project',
  unlinked: 'removed a working Document from a Project',
  warning:
    'Working Documents may contain external references or preserved mission PDFs. Attachment does not record acceptance or permission to start work.',
  loading: 'Loading working Documents…',
  empty: 'No working Documents attached.',
  noEligible: 'No eligible working Documents for this original Client.',
  searchLabel: 'Search eligible working Documents',
  noMatch: 'No eligible working Documents match this search.',
  denied:
    'Project, Document and Client read access are required to view these Documents.',
  immutable:
    'The original Client is no longer active. Existing attachments are read-only.',
  closedReadOnly: 'This Project is closed. Existing attachments are read-only.',
  error: 'Working Documents could not be loaded. Reload to try again.',
  uncertain:
    'The result is uncertain. Retry this same command or reload before choosing another action.',
  conflict:
    'The association changed or this command is no longer valid. Reload before choosing another action.',
  closedRefusal: 'This Project was closed. Reload to see its current state.',
  confirmed: 'Command confirmed. The list below is refreshed separately.',
  reload: 'Reload working Documents',
  choose: 'Attach working Document',
  close: 'Close Document selector',
  retry: 'Retry unchanged command',
  attach: 'Attach',
  remove: 'Remove',
  open: 'Open external reference',
  openDocument: 'Open Document',
  referenceDenied: 'External reference access is not granted.',
};

const keys = [
  'title',
  'warning',
  'loading',
  'empty',
  'noEligible',
  'searchLabel',
  'noMatch',
  'denied',
  'immutable',
  'closedReadOnly',
  'error',
  'uncertain',
  'conflict',
  'closedRefusal',
  'confirmed',
  'reload',
  'choose',
  'close',
  'retry',
  'attach',
  'remove',
  'open',
  'openDocument',
  'referenceDenied',
] as const;

export const projectDocumentsMessages = defineMessages(keys, {
  ro: {
    title: 'Documente de lucru',
    warning:
      'Documentele de lucru pot conține referințe externe sau PDF-uri păstrate ale misiunii. Asocierea nu înregistrează acceptarea sau permisiunea de a începe lucrul.',
    loading: 'Se încarcă Documentele de lucru…',
    empty: 'Nu există Documente de lucru asociate.',
    noEligible:
      'Nu există Documente de lucru eligibile pentru acest Client inițial.',
    searchLabel: 'Căutați Documente de lucru eligibile',
    noMatch: 'Niciun Document de lucru eligibil nu corespunde căutării.',
    denied:
      'Pentru a vedea aceste Documente sunt necesare drepturi de citire pentru Proiect, Documente și Client.',
    immutable:
      'Clientul inițial nu mai este activ. Asocierile existente sunt doar pentru citire.',
    closedReadOnly:
      'Acest Proiect este închis. Asocierile existente sunt doar pentru citire.',
    error:
      'Documentele de lucru nu au putut fi încărcate. Reîncărcați pentru a reîncerca.',
    uncertain:
      'Rezultatul este incert. Reîncercați aceeași comandă sau reîncărcați înainte de a alege altă acțiune.',
    conflict:
      'Asocierea s-a schimbat sau această comandă nu mai este validă. Reîncărcați înainte de a alege altă acțiune.',
    closedRefusal:
      'Acest Proiect a fost închis. Reîncărcați pentru a vedea starea actuală.',
    confirmed: 'Comandă confirmată. Lista de mai jos se actualizează separat.',
    reload: 'Reîncărcați Documentele de lucru',
    choose: 'Asociați un Document de lucru',
    close: 'Închideți selectorul de Documente',
    retry: 'Reîncercați comanda neschimbată',
    attach: 'Asociați',
    remove: 'Eliminați asocierea cu',
    open: 'Deschideți referința externă',
    openDocument: 'Deschideți Documentul',
    referenceDenied: 'Accesul la referința externă nu este acordat.',
  },
  ru: {
    title: 'Рабочие Документы',
    warning:
      'Рабочие Документы могут содержать внешние ссылки или сохранённые PDF миссии. Прикрепление не означает принятия или разрешения начать работу.',
    loading: 'Загрузка рабочих Документов…',
    empty: 'Нет связанных рабочих Документов.',
    noEligible:
      'Нет подходящих рабочих Документов для этого исходного Клиента.',
    searchLabel: 'Поиск подходящих рабочих Документов',
    noMatch: 'Нет подходящих рабочих Документов по этому запросу.',
    denied:
      'Для просмотра этих Документов нужны права чтения Проекта, Документов и Клиента.',
    immutable:
      'Исходный Клиент больше не активен. Существующие связи доступны только для чтения.',
    closedReadOnly:
      'Этот Проект закрыт. Существующие связи доступны только для чтения.',
    error:
      'Не удалось загрузить рабочие Документы. Обновите, чтобы повторить попытку.',
    uncertain:
      'Результат неизвестен. Повторите ту же команду или обновите данные перед другим действием.',
    conflict:
      'Связь изменилась или эта команда больше недействительна. Обновите данные перед другим действием.',
    closedRefusal:
      'Этот Проект был закрыт. Обновите данные, чтобы увидеть текущее состояние.',
    confirmed: 'Команда подтверждена. Список ниже обновляется отдельно.',
    reload: 'Обновить рабочие Документы',
    choose: 'Прикрепить рабочий Документ',
    close: 'Закрыть выбор Документов',
    retry: 'Повторить неизменённую команду',
    attach: 'Прикрепить',
    remove: 'Убрать связь с',
    open: 'Открыть внешнюю ссылку',
    openDocument: 'Открыть Документ',
    referenceDenied: 'Доступ к внешней ссылке не предоставлен.',
  },
  fr: {
    title: 'Documents de travail',
    warning:
      'Les Documents de travail peuvent contenir des références externes ou des PDF de mission conservés. Le rattachement ne vaut ni acceptation ni autorisation de commencer le travail.',
    loading: 'Chargement des Documents de travail…',
    empty: 'Aucun Document de travail associé.',
    noEligible: 'Aucun Document de travail admissible pour ce Client initial.',
    searchLabel: 'Rechercher des Documents de travail admissibles',
    noMatch:
      'Aucun Document de travail admissible ne correspond à cette recherche.',
    denied:
      'Des droits de lecture sur le Projet, les Documents et le Client sont nécessaires pour consulter ces Documents.',
    immutable:
      'Le Client initial n’est plus actif. Les associations existantes sont en lecture seule.',
    closedReadOnly:
      'Ce Projet est fermé. Les associations existantes sont en lecture seule.',
    error:
      'Les Documents de travail n’ont pas pu être chargés. Rechargez pour réessayer.',
    uncertain:
      'Le résultat est incertain. Réessayez la même commande ou rechargez avant de choisir une autre action.',
    conflict:
      'L’association a changé ou cette commande n’est plus valide. Rechargez avant de choisir une autre action.',
    closedRefusal:
      'Ce Projet a été fermé. Rechargez pour voir son état actuel.',
    confirmed:
      'Commande confirmée. La liste ci-dessous est actualisée séparément.',
    reload: 'Recharger les Documents de travail',
    choose: 'Associer un Document de travail',
    close: 'Fermer le sélecteur de Documents',
    retry: 'Réessayer la commande inchangée',
    attach: 'Associer',
    remove: 'Retirer l’association avec',
    open: 'Ouvrir la référence externe',
    openDocument: 'Ouvrir le Document',
    referenceDenied: 'L’accès à la référence externe n’est pas accordé.',
  },
  en: projectDocumentsCopy,
});

export function useProjectDocumentsCopy() {
  const message = useMessages(projectDocumentsMessages);
  return {
    title: message('title'),
    warning: message('warning'),
    loading: message('loading'),
    empty: message('empty'),
    noEligible: message('noEligible'),
    searchLabel: message('searchLabel'),
    noMatch: message('noMatch'),
    denied: message('denied'),
    immutable: message('immutable'),
    closedReadOnly: message('closedReadOnly'),
    error: message('error'),
    uncertain: message('uncertain'),
    conflict: message('conflict'),
    closedRefusal: message('closedRefusal'),
    confirmed: message('confirmed'),
    reload: message('reload'),
    choose: message('choose'),
    close: message('close'),
    retry: message('retry'),
    attach: message('attach'),
    remove: message('remove'),
    open: message('open'),
    openDocument: message('openDocument'),
    referenceDenied: message('referenceDenied'),
  };
}
