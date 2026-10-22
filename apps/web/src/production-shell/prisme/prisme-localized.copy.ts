import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../../localization/messages';

const keys = [
  'optIn',
  'presentation',
  'home',
  'overview',
  'current',
  'navigation',
  'openNavigation',
  'closeNavigation',
  'skipToContent',
  'workspace',
  'company',
  'noCompany',
  'brandHome',
  'brandTagline',
  'greeting',
  'introduction',
  'heroEyebrow',
  'heroTitle',
  'heroDescription',
  'capabilities',
  'capabilitiesDescription',
  'contextTitle',
  'contextDescription',
  'risksLabel',
  'risksDescription',
  'clientsLabel',
  'clientsDescription',
  'documentsLabel',
  'documentsDescription',
  'projectsLabel',
  'projectsDescription',
  'myTasksLabel',
  'myTasksDescription',
  'requestsLabel',
  'requestsDescription',
  'catalogueLabel',
  'catalogueDescription',
  'pricingLabel',
  'pricingDescription',
  'accessLabel',
  'accessDescription',
  'companiesLabel',
  'companiesDescription',
  'activityLabel',
  'activityDescription',
  'invitationsLabel',
  'invitationsDescription',
] as const;
type Key = (typeof keys)[number];

export const prismeMessages = defineMessages(keys, {
  ro: {
    risksLabel: 'Riscuri operaționale',
    risksDescription:
      'Consultați riscurile și păstrați un istoric manual confidențial.',
    optIn: 'Încercați Prisme',
    presentation: 'Prisme & lumière',
    home: 'Acasă',
    overview: 'Prezentare generală',
    current: 'Curent',
    navigation: 'Navigare principală',
    openNavigation: 'Deschideți navigarea',
    closeNavigation: 'Închideți navigarea',
    skipToContent: 'Săriți la conținut',
    workspace: 'Spațiu de lucru',
    company: 'Companie activă',
    noCompany: 'Nicio Companie activă',
    brandHome: 'Pagina principală PRISMA-PRIM Suite',
    brandTagline: 'Expertiză conectată.',
    greeting: 'Bună, {name}.',
    introduction:
      'Spațiul dumneavoastră de lucru, dintr-o perspectivă mai clară.',
    heroEyebrow: 'Fiecare detaliu. O perspectivă mai clară.',
    heroTitle: 'Claritate pentru a merge înainte.',
    heroDescription:
      'Găsiți Clienții, gestionați accesul și urmăriți activitatea înregistrată într-un singur spațiu de lucru.',
    capabilities: 'Spațiul dumneavoastră de lucru',
    capabilitiesDescription:
      'Deschideți o funcție disponibilă pentru a continua lucrul.',
    contextTitle: 'Contextul curent',
    contextDescription:
      'Alegeți o Companie disponibilă din navigare pentru a schimba contextul curent.',
    clientsLabel: 'Clienți',
    clientsDescription: 'Găsiți Clienți și lucrați cu dosarele lor comune.',
    documentsLabel: 'Documente de lucru',
    documentsDescription:
      'Referințe confidențiale ale chestionarelor Companiei.',
    projectsLabel: 'Proiecte',
    projectsDescription: 'Înregistrați și redeschideți Proiecte pregătitoare.',
    myTasksLabel: 'Sarcinile mele',
    myTasksDescription: 'Sarcinile deschise din Compania activă, după termen.',
    requestsLabel: 'Solicitări ale Clienților',
    requestsDescription:
      'Înregistrați solicitări manuale și Oportunitățile lor inițiale.',
    catalogueLabel: 'Catalog de servicii',
    catalogueDescription:
      'Definiți Servicii comune și înregistrați ce oferă această Companie.',
    pricingLabel: 'Configurarea tarifelor',
    pricingDescription:
      'Publicați versiuni ilustrative și datate ale Regulilor de tarifare pentru această Companie.',
    accessLabel: 'Echipă și acces',
    accessDescription:
      'Gestionați accesul la Companie, suspendarea apartenenței și recuperarea sesiunii.',
    companiesLabel: 'Companii',
    companiesDescription: 'Înregistrați o Companie în spațiul de lucru.',
    activityLabel: 'Jurnal de activitate',
    activityDescription: 'Citiți activitatea disponibilă în contextul curent.',
    invitationsLabel: 'Invitații',
    invitationsDescription: 'Gestionați invitațiile în spațiul de lucru.',
  },
  ru: {
    risksLabel: 'Операционные риски',
    risksDescription:
      'Просмотр рисков и конфиденциальная история ручных записей.',
    optIn: 'Попробовать Prisme',
    presentation: 'Prisme & lumière',
    home: 'Главная',
    overview: 'Обзор',
    current: 'Текущая',
    navigation: 'Основная навигация',
    openNavigation: 'Открыть навигацию',
    closeNavigation: 'Закрыть навигацию',
    skipToContent: 'Перейти к содержанию',
    workspace: 'Рабочее пространство',
    company: 'Активная Компания',
    noCompany: 'Нет активной Компании',
    brandHome: 'Главная страница PRISMA-PRIM Suite',
    brandTagline: 'Экспертиза объединена.',
    greeting: 'Здравствуйте, {name}.',
    introduction: 'Ваше рабочее пространство с более ясной перспективой.',
    heroEyebrow: 'Каждая деталь. Более ясная перспектива.',
    heroTitle: 'Ясность для движения вперёд.',
    heroDescription:
      'Находите Клиентов, управляйте доступом и отслеживайте зарегистрированную активность в одном рабочем пространстве.',
    capabilities: 'Ваше рабочее пространство',
    capabilitiesDescription:
      'Откройте доступную функцию, чтобы продолжить работу.',
    contextTitle: 'Текущий контекст',
    contextDescription:
      'Выберите доступную Компанию в навигации, чтобы изменить текущий контекст.',
    clientsLabel: 'Клиенты',
    clientsDescription: 'Находите Клиентов и работайте с их общими досье.',
    documentsLabel: 'Рабочие Документы',
    documentsDescription: 'Конфиденциальные ссылки на анкеты Компании.',
    projectsLabel: 'Проекты',
    projectsDescription:
      'Регистрируйте и повторно открывайте подготовительные Проекты.',
    myTasksLabel: 'Мои задачи',
    myTasksDescription: 'Ваши открытые Задачи в активной Компании по сроку.',
    requestsLabel: 'Запросы Клиентов',
    requestsDescription:
      'Регистрируйте запросы вручную и их начальные Возможности.',
    catalogueLabel: 'Каталог услуг',
    catalogueDescription:
      'Определяйте общие Услуги и фиксируйте предложения этой Компании.',
    pricingLabel: 'Настройка тарифов',
    pricingDescription:
      'Публикуйте версии Правил ценообразования с датой действия для этой Компании.',
    accessLabel: 'Команда и доступ',
    accessDescription:
      'Управляйте доступом к Компании, приостановкой участия и восстановлением сеанса.',
    companiesLabel: 'Компании',
    companiesDescription: 'Зарегистрируйте Компанию в рабочем пространстве.',
    activityLabel: 'Журнал активности',
    activityDescription:
      'Просматривайте активность, доступную в текущем контексте.',
    invitationsLabel: 'Приглашения',
    invitationsDescription: 'Управляйте приглашениями в рабочее пространство.',
  },
  fr: {
    risksLabel: 'Risques opérationnels',
    risksDescription:
      'Consultez les risques et conservez leur suivi manuel confidentiel.',
    optIn: 'Essayer Prisme',
    presentation: 'Prisme & lumière',
    home: 'Accueil',
    overview: 'Vue d’ensemble',
    current: 'Actuel',
    navigation: 'Navigation principale',
    openNavigation: 'Ouvrir la navigation',
    closeNavigation: 'Fermer la navigation',
    skipToContent: 'Aller au contenu',
    workspace: 'Espace de travail',
    company: 'Entreprise active',
    noCompany: 'Aucune Entreprise active',
    brandHome: 'Accueil de PRISMA-PRIM Suite',
    brandTagline: 'L’expertise, connectée.',
    greeting: 'Bonjour, {name}.',
    introduction: 'Votre espace de travail, avec une perspective plus claire.',
    heroEyebrow: 'Chaque détail. Une perspective plus claire.',
    heroTitle: 'La clarté pour avancer.',
    heroDescription:
      'Retrouvez vos Clients, gérez les accès et suivez l’activité enregistrée dans un seul espace de travail.',
    capabilities: 'Votre espace de travail',
    capabilitiesDescription:
      'Ouvrez une fonction disponible pour poursuivre votre travail.',
    contextTitle: 'Votre contexte actuel',
    contextDescription:
      'Choisissez une Entreprise disponible dans la navigation pour changer de contexte.',
    clientsLabel: 'Clients',
    clientsDescription:
      'Retrouvez les Clients et travaillez avec leurs dossiers partagés.',
    documentsLabel: 'Documents de travail',
    documentsDescription:
      'Références confidentielles aux questionnaires de l’Entreprise.',
    projectsLabel: 'Projets',
    projectsDescription: 'Enregistrez et rouvrez les Projets préparatoires.',
    myTasksLabel: 'Mes Tâches',
    myTasksDescription:
      'Vos Tâches ouvertes dans l’Entreprise active, par échéance.',
    requestsLabel: 'Demandes Client',
    requestsDescription:
      'Saisissez les demandes manuelles et leurs Opportunités initiales.',
    catalogueLabel: 'Catalogue de services',
    catalogueDescription:
      'Définissez les Services partagés et indiquez ceux proposés par cette Entreprise.',
    pricingLabel: 'Configuration tarifaire',
    pricingDescription:
      'Publiez des versions datées des Règles tarifaires de cette Entreprise.',
    accessLabel: 'Équipe et accès',
    accessDescription:
      'Gérez l’accès à l’Entreprise, la suspension d’adhésion et la récupération de session.',
    companiesLabel: 'Entreprises',
    companiesDescription:
      'Enregistrez une Entreprise dans votre espace de travail.',
    activityLabel: 'Journal d’activité',
    activityDescription:
      'Consultez l’activité disponible dans votre contexte actuel.',
    invitationsLabel: 'Invitations',
    invitationsDescription: 'Gérez les invitations à votre espace de travail.',
  },
  en: {
    risksLabel: 'Operational risks',
    risksDescription:
      'Read risks and preserve their confidential manual follow-up.',
    optIn: 'Try Prisme',
    presentation: 'Prisme & lumière',
    home: 'Home',
    overview: 'Overview',
    current: 'Current',
    navigation: 'Primary navigation',
    openNavigation: 'Open navigation',
    closeNavigation: 'Close navigation',
    skipToContent: 'Skip to content',
    workspace: 'Workspace',
    company: 'Active Company',
    noCompany: 'No active Company',
    brandHome: 'PRISMA-PRIM Suite home',
    brandTagline: 'Expertise, connected.',
    greeting: 'Hello, {name}.',
    introduction: 'Your workspace, with a clearer perspective.',
    heroEyebrow: 'Every detail. A clearer perspective.',
    heroTitle: 'Clarity to move forward.',
    heroDescription:
      'Find your Clients, manage access and follow recorded activity from one workspace.',
    capabilities: 'Your workspace',
    capabilitiesDescription:
      'Open an available capability to continue your work.',
    contextTitle: 'Your current context',
    contextDescription:
      'Choose an available Company from the navigation to change your current context.',
    clientsLabel: 'Clients',
    clientsDescription: 'Find Clients and work with their shared dossiers.',
    documentsLabel: 'Working Documents',
    documentsDescription: 'Company-confidential questionnaire references',
    projectsLabel: 'Projects',
    projectsDescription: 'Register and reopen preparatory Projects.',
    myTasksLabel: 'My Tasks',
    myTasksDescription: 'Your open Tasks in the active Company, by due date.',
    requestsLabel: 'Client Requests',
    requestsDescription:
      'Capture manual requests and their initial Opportunities.',
    catalogueLabel: 'Service Catalogue',
    catalogueDescription:
      'Define shared illustrative Services and record which ones this Company offers.',
    pricingLabel: 'Pricing Configuration',
    pricingDescription:
      'Publish illustrative, effective-dated Pricing Rule Versions for this Company.',
    accessLabel: 'Team & access',
    accessDescription:
      'Manage Company access, membership suspension and session recovery.',
    companiesLabel: 'Companies',
    companiesDescription: 'Register a Company in your Workspace.',
    activityLabel: 'Activity Log',
    activityDescription: 'Read the activity available in your current context.',
    invitationsLabel: 'Invitations',
    invitationsDescription: 'Manage invitations to your Workspace.',
  },
});

export function usePrismeCopy() {
  const message = useMessages(prismeMessages);
  const section = ({
    label,
    description,
  }: {
    label: Key;
    description: Key;
  }) => ({
    label: message(label),
    description: message(description),
  });
  return {
    optIn: message('optIn'),
    presentation: message('presentation'),
    home: message('home'),
    overview: message('overview'),
    current: message('current'),
    navigation: message('navigation'),
    openNavigation: message('openNavigation'),
    closeNavigation: message('closeNavigation'),
    skipToContent: message('skipToContent'),
    workspace: message('workspace'),
    company: message('company'),
    noCompany: message('noCompany'),
    brandHome: message('brandHome'),
    brandTagline: message('brandTagline'),
    greeting: (name: string) => formatMessage(message('greeting'), { name }),
    introduction: message('introduction'),
    heroEyebrow: message('heroEyebrow'),
    heroTitle: message('heroTitle'),
    heroDescription: message('heroDescription'),
    capabilities: message('capabilities'),
    capabilitiesDescription: message('capabilitiesDescription'),
    contextTitle: message('contextTitle'),
    contextDescription: message('contextDescription'),
    sections: {
      risks: section({ label: 'risksLabel', description: 'risksDescription' }),
      clients: section({
        label: 'clientsLabel',
        description: 'clientsDescription',
      }),
      documents: section({
        label: 'documentsLabel',
        description: 'documentsDescription',
      }),
      projects: section({
        label: 'projectsLabel',
        description: 'projectsDescription',
      }),
      myTasks: section({
        label: 'myTasksLabel',
        description: 'myTasksDescription',
      }),
      requests: section({
        label: 'requestsLabel',
        description: 'requestsDescription',
      }),
      catalogue: section({
        label: 'catalogueLabel',
        description: 'catalogueDescription',
      }),
      pricing: section({
        label: 'pricingLabel',
        description: 'pricingDescription',
      }),
      access: section({
        label: 'accessLabel',
        description: 'accessDescription',
      }),
      companies: section({
        label: 'companiesLabel',
        description: 'companiesDescription',
      }),
      activity: section({
        label: 'activityLabel',
        description: 'activityDescription',
      }),
      invitations: section({
        label: 'invitationsLabel',
        description: 'invitationsDescription',
      }),
    },
  };
}
