import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'eyebrow',
  'title',
  'workspace',
  'activeCompany',
  'selectCompany',
  'chooseCompany',
  'loading',
  'noCompanies',
  'noAssignment',
  'unavailable',
  'forbidden',
  'stale',
  'selectionFailed',
] as const;

export const companyContextMessages = defineMessages(keys, {
  ro: {
    eyebrow: 'Domeniul curent',
    title: 'Contextul Companiei',
    workspace: 'Spațiu de lucru',
    activeCompany: 'Companie activă',
    selectCompany: 'Selectați o Companie',
    chooseCompany: 'Selectați o Companie',
    loading: 'Se încarcă contextul Companiei…',
    noCompanies:
      'Nu există Companii active. Înregistrați o Companie înainte de a alege un context.',
    noAssignment:
      'Nu vă este atribuită nicio Companie. Solicitați unui Proprietar al spațiului de lucru să acorde acces la contextul Companiei.',
    unavailable: 'Nu am putut încărca contextul Companiei. Încercați din nou.',
    forbidden:
      'Nu aveți permisiunea de a vedea Companiile din acest spațiu de lucru.',
    stale:
      'Contextul anterior al Companiei nu mai este disponibil. Alegeți o Companie activă.',
    selectionFailed:
      'Acel context al Companiei nu mai este disponibil. Alegeți o Companie activă.',
  },
  ru: {
    eyebrow: 'Текущая область',
    title: 'Контекст Компании',
    workspace: 'Рабочее пространство',
    activeCompany: 'Активная Компания',
    selectCompany: 'Выберите Компанию',
    chooseCompany: 'Выберите Компанию',
    loading: 'Загрузка контекста Компании…',
    noCompanies:
      'Нет доступных активных Компаний. Зарегистрируйте Компанию перед выбором контекста.',
    noAssignment:
      'Вам не назначена Компания. Попросите Владельца рабочего пространства предоставить доступ к контексту Компании.',
    unavailable: 'Не удалось загрузить контекст Компании. Повторите попытку.',
    forbidden:
      'У вас нет разрешения на просмотр Компаний в этом рабочем пространстве.',
    stale:
      'Предыдущий контекст Компании больше недоступен. Выберите активную Компанию.',
    selectionFailed:
      'Этот контекст Компании больше недоступен. Выберите активную Компанию.',
  },
  fr: {
    eyebrow: 'Périmètre actuel',
    title: 'Contexte de l’Entreprise',
    workspace: 'Espace de travail',
    activeCompany: 'Entreprise active',
    selectCompany: 'Sélectionnez une Entreprise',
    chooseCompany: 'Sélectionnez une Entreprise',
    loading: 'Chargement du contexte de l’Entreprise…',
    noCompanies:
      'Aucune Entreprise active n’est disponible. Enregistrez une Entreprise avant de choisir un contexte.',
    noAssignment:
      'Aucune Entreprise ne vous est attribuée. Demandez à un Propriétaire de l’espace de travail d’accorder l’accès au contexte de l’Entreprise.',
    unavailable:
      'Nous n’avons pas pu charger le contexte de l’Entreprise. Réessayez.',
    forbidden:
      'Vous n’avez pas l’autorisation de consulter les Entreprises de cet espace de travail.',
    stale:
      'Votre ancien contexte d’Entreprise n’est plus disponible. Choisissez une Entreprise active.',
    selectionFailed:
      'Ce contexte d’Entreprise n’est plus disponible. Choisissez une Entreprise active.',
  },
  en: {
    eyebrow: 'Current scope',
    title: 'Company context',
    workspace: 'Workspace',
    activeCompany: 'Active Company',
    selectCompany: 'Select a Company',
    chooseCompany: 'Select a Company',
    loading: 'Loading Company context…',
    noCompanies:
      'No active Companies are available. Register a Company before choosing a context.',
    noAssignment:
      'No Company is assigned to you. Ask a Workspace Owner to grant Company Context Access.',
    unavailable: 'We could not load the Company context. Please try again.',
    forbidden:
      'You do not have permission to view Companies in this Workspace.',
    stale:
      'Your previous Company context is no longer available. Choose an active Company.',
    selectionFailed:
      'That Company context is no longer available. Choose an active Company.',
  },
});

export function useCompanyContextCopy() {
  const message = useMessages(companyContextMessages);
  return {
    eyebrow: message('eyebrow'),
    title: message('title'),
    workspace: message('workspace'),
    activeCompany: message('activeCompany'),
    selectCompany: message('selectCompany'),
    chooseCompany: message('chooseCompany'),
    loading: message('loading'),
    noCompanies: message('noCompanies'),
    noAssignment: message('noAssignment'),
    unavailable: message('unavailable'),
    forbidden: message('forbidden'),
    stale: message('stale'),
    selectionFailed: message('selectionFailed'),
  };
}
