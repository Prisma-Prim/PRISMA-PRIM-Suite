import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../localization/messages';
import { useInterfaceLocale } from '../localization/interface-locale';

const keys = [
  'eyebrow',
  'title',
  'navDescription',
  'viewLabel',
  'allProjects',
  'myOpenProjects',
  'mineEmpty',
  'viewUnavailable',
  'retryView',
  'warning',
  'projectTitle',
  'client',
  'selectClient',
  'create',
  'searchLabel',
  'searchPlaceholder',
  'empty',
  'noMatches',
  'includeClosed',
  'noOpen',
  'loading',
  'denied',
  'error',
  'validation',
  'conflict',
  'retry',
  'clientPrefix',
  'registeredPrefix',
  'openDossier',
  'companyPrefix',
  'noClients',
  'closedCompleted',
  'closedCancelled',
  'closedRefusal',
] as const;
type Key = (typeof keys)[number];

export const projectMessages = defineMessages(keys, {
  ro: {
    viewLabel: 'Vizualizarea Proiectelor',
    allProjects: 'Toate Proiectele',
    myOpenProjects: 'Proiectele mele deschise',
    mineEmpty: 'Nu aveți Proiecte deschise în care sunteți responsabil.',
    viewUnavailable:
      'Această vizualizare nu a putut fi încărcată. Reîncercați.',
    retryView: 'Reîncărcați această vizualizare',
    eyebrow: 'Operațiuni',
    title: 'Proiecte',
    navDescription: 'Înregistrați și redeschideți Proiecte.',
    warning:
      'Doar pentru pregătire. Această înregistrare nu autorizează începerea lucrului.',
    projectTitle: 'Titlul Proiectului',
    client: 'Client',
    selectClient: 'Selectați un Client',
    create: 'Creați Proiectul',
    searchLabel: 'Găsiți Proiecte',
    searchPlaceholder: 'Căutați după Proiect sau Client',
    empty: 'Nu există încă Proiecte pentru această Companie.',
    noMatches: 'Niciun Proiect nu corespunde acestei căutări.',
    includeClosed: 'Includeți Proiectele închise',
    noOpen:
      'Nu există Proiecte deschise. Includeți Proiectele închise pentru a le vedea pe cele finalizate și anulate.',
    loading: 'Se încarcă Proiectele…',
    denied:
      'Pentru această Companie sunt necesare accesul la Proiecte și accesul de citire la Client.',
    error: 'Proiectul nu a putut fi încărcat sau salvat. Încercați din nou.',
    validation:
      'Introduceți un titlu de {min}–{max} de caractere și selectați un Client.',
    conflict:
      'Această cerere intră în conflict cu o trimitere anterioară. Reîncărcați înainte de a încerca din nou.',
    retry: 'Reîncărcați Proiectele',
    clientPrefix: 'Client:',
    registeredPrefix: 'Înregistrat:',
    openDossier: 'Deschideți dosarul Clientului',
    companyPrefix: 'Companie:',
    noClients:
      'Creați sau asociați un Client cu această Companie înainte de a înregistra un Proiect.',
    closedCompleted:
      'Acest Proiect este finalizat. Sarcinile, Documentele și membrul responsabil sunt doar pentru citire; istoricul rămâne disponibil.',
    closedCancelled:
      'Acest Proiect este anulat. Sarcinile, Documentele și membrul responsabil sunt doar pentru citire; istoricul rămâne disponibil.',
    closedRefusal:
      'Acest Proiect a fost închis. Reîncărcați pentru a vedea starea actuală.',
  },
  ru: {
    viewLabel: 'Представление Проектов',
    allProjects: 'Все Проекты',
    myOpenProjects: 'Мои открытые Проекты',
    mineEmpty: 'Нет открытых Проектов, в которых вы ответственны.',
    viewUnavailable:
      'Не удалось загрузить это представление. Повторите попытку.',
    retryView: 'Перезагрузить это представление',
    eyebrow: 'Операции',
    title: 'Проекты',
    navDescription: 'Регистрируйте и повторно открывайте Проекты.',
    warning: 'Только для подготовки. Эта запись не разрешает начинать работу.',
    projectTitle: 'Название Проекта',
    client: 'Клиент',
    selectClient: 'Выберите Клиента',
    create: 'Создать Проект',
    searchLabel: 'Найти Проекты',
    searchPlaceholder: 'Поиск по Проекту или Клиенту',
    empty: 'Для этой Компании пока нет Проектов.',
    noMatches: 'Ни один Проект не соответствует поиску.',
    includeClosed: 'Показывать закрытые Проекты',
    noOpen:
      'Нет открытых Проектов. Покажите закрытые Проекты, чтобы увидеть завершённые и отменённые.',
    loading: 'Загрузка Проектов…',
    denied: 'Для этой Компании нужны доступ к Проектам и право чтения Клиента.',
    error: 'Не удалось загрузить или сохранить Проект. Повторите попытку.',
    validation:
      'Введите название длиной от {min} до {max} символов и выберите Клиента.',
    conflict:
      'Этот запрос конфликтует с предыдущей отправкой. Перезагрузите данные перед повторной попыткой.',
    retry: 'Перезагрузить Проекты',
    clientPrefix: 'Клиент:',
    registeredPrefix: 'Зарегистрирован:',
    openDossier: 'Открыть досье Клиента',
    companyPrefix: 'Компания:',
    noClients:
      'Создайте или свяжите Клиента с этой Компанией перед регистрацией Проекта.',
    closedCompleted:
      'Этот Проект завершён. Задачи, Документы и ответственный участник доступны только для чтения; история сохранена.',
    closedCancelled:
      'Этот Проект отменён. Задачи, Документы и ответственный участник доступны только для чтения; история сохранена.',
    closedRefusal:
      'Этот Проект был закрыт. Перезагрузите данные, чтобы увидеть текущее состояние.',
  },
  fr: {
    viewLabel: 'Vue des Projets',
    allProjects: 'Tous les Projets',
    myOpenProjects: 'Mes Projets ouverts',
    mineEmpty: 'Aucun Projet ouvert ne vous désigne comme responsable.',
    viewUnavailable: 'Cette vue n’a pas pu être chargée. Réessayez.',
    retryView: 'Recharger cette vue',
    eyebrow: 'Opérations',
    title: 'Projets',
    navDescription: 'Enregistrer et rouvrir des Projets.',
    warning:
      'Préparation uniquement. Cet enregistrement n’autorise pas le début du travail.',
    projectTitle: 'Titre du Projet',
    client: 'Client',
    selectClient: 'Sélectionnez un Client',
    create: 'Créer le Projet',
    searchLabel: 'Rechercher des Projets',
    searchPlaceholder: 'Rechercher par Projet ou Client',
    empty: 'Aucun Projet pour cette Entreprise.',
    noMatches: 'Aucun Projet ne correspond à cette recherche.',
    includeClosed: 'Inclure les Projets clos',
    noOpen:
      'Aucun Projet ouvert. Incluez les Projets clos pour voir ceux qui sont terminés et annulés.',
    loading: 'Chargement des Projets…',
    denied:
      'L’accès aux Projets et la lecture du Client sont requis pour cette Entreprise.',
    error:
      'Le Projet n’a pas pu être chargé ou enregistré. Veuillez réessayer.',
    validation:
      'Saisissez un titre de {min} à {max} caractères et sélectionnez un Client.',
    conflict:
      'Cette demande entre en conflit avec un envoi précédent. Rechargez avant de réessayer.',
    retry: 'Recharger les Projets',
    clientPrefix: 'Client :',
    registeredPrefix: 'Enregistré :',
    openDossier: 'Ouvrir le dossier Client',
    companyPrefix: 'Entreprise :',
    noClients:
      'Créez ou associez un Client à cette Entreprise avant d’enregistrer un Projet.',
    closedCompleted:
      'Ce Projet est terminé. Ses Tâches, Documents et son membre responsable sont en lecture seule ; son historique reste disponible.',
    closedCancelled:
      'Ce Projet est annulé. Ses Tâches, Documents et son membre responsable sont en lecture seule ; son historique reste disponible.',
    closedRefusal: 'Ce Projet a été clos. Rechargez pour voir son état actuel.',
  },
  en: {
    viewLabel: 'Project view',
    allProjects: 'All Projects',
    myOpenProjects: 'My open Projects',
    mineEmpty: 'No open Projects currently list you as responsible.',
    viewUnavailable: 'This view could not be loaded. Please try again.',
    retryView: 'Reload this view',
    eyebrow: 'Operations',
    title: 'Projects',
    navDescription: 'Register and reopen Projects.',
    warning: 'Preparation only. This record does not authorize work to start.',
    projectTitle: 'Project title',
    client: 'Client',
    selectClient: 'Select a Client',
    create: 'Create Project',
    searchLabel: 'Find Projects',
    searchPlaceholder: 'Search by Project or Client',
    empty: 'No Projects for this Company yet.',
    noMatches: 'No Project matches this search.',
    includeClosed: 'Include closed Projects',
    noOpen:
      'No open Projects. Include closed Projects to see completed and cancelled ones.',
    loading: 'Loading Projects…',
    denied:
      'Project access and Client read access are required for this Company.',
    error: 'The Project could not be loaded or saved. Please try again.',
    validation: 'Enter a title of {min}–{max} characters and select a Client.',
    conflict:
      'This request conflicts with an earlier submission. Reload before trying again.',
    retry: 'Reload Projects',
    clientPrefix: 'Client:',
    registeredPrefix: 'Registered:',
    openDossier: 'Open Client dossier',
    companyPrefix: 'Company:',
    noClients:
      'Create or relate a Client to this Company before registering a Project.',
    closedCompleted:
      'This Project is completed. Its Tasks, Documents and responsible member are read-only; its history remains available.',
    closedCancelled:
      'This Project is cancelled. Its Tasks, Documents and responsible member are read-only; its history remains available.',
    closedRefusal: 'This Project was closed. Reload to see its current state.',
  },
});

export function useProjectCopy() {
  const message = useMessages(projectMessages);
  const { formatNumber } = useInterfaceLocale();
  const format = (
    key: Key,
    values: Readonly<Record<string, string | number>>,
  ) => formatMessage(message(key), values);
  return {
    eyebrow: message('eyebrow'),
    title: message('title'),
    navDescription: message('navDescription'),
    viewLabel: message('viewLabel'),
    allProjects: message('allProjects'),
    myOpenProjects: message('myOpenProjects'),
    mineEmpty: message('mineEmpty'),
    viewUnavailable: message('viewUnavailable'),
    retryView: message('retryView'),
    warning: message('warning'),
    projectTitle: message('projectTitle'),
    client: message('client'),
    selectClient: message('selectClient'),
    create: message('create'),
    searchLabel: message('searchLabel'),
    searchPlaceholder: message('searchPlaceholder'),
    empty: message('empty'),
    noMatches: message('noMatches'),
    includeClosed: message('includeClosed'),
    noOpen: message('noOpen'),
    loading: message('loading'),
    denied: message('denied'),
    error: message('error'),
    validation: format('validation', {
      min: formatNumber(1),
      max: formatNumber(200),
    }),
    conflict: message('conflict'),
    retry: message('retry'),
    clientPrefix: message('clientPrefix'),
    registeredPrefix: message('registeredPrefix'),
    openDossier: message('openDossier'),
    companyPrefix: message('companyPrefix'),
    noClients: message('noClients'),
    closedNotice: (status: 'completed' | 'cancelled') =>
      message(status === 'completed' ? 'closedCompleted' : 'closedCancelled'),
    closedRefusal: message('closedRefusal'),
  };
}
