import { defineMessages, useMessages } from '../localization/messages';
const keys = [
  'choose',
  'manual',
  'loading',
  'error',
  'denied',
  'empty',
  'retry',
  'warning',
  'create',
  'plan',
  'sourceVersion',
  'required',
  'planNotice',
  'planError',
  'bundle',
  'prerequisites',
  'granted',
  'revoked',
] as const;
export const projectTemplateMessages = defineMessages(keys, {
  ro: {
    granted: 'a acordat accesul explicit la modelele de Proiect',
    revoked: 'a revocat accesul la modelele de Proiect',
    bundle: 'Utilizator modele de Proiect',
    prerequisites:
      'Acordă numai citirea și instanțierea modelelor. Contextul Companiei, citirea Clientului, crearea Proiectelor și administrarea Sarcinilor se acordă separat. Nu acordă publicarea versiunilor, trecerea etapelor sau aprobarea începerii lucrului.',
    choose: 'Model de Proiect',
    manual: 'Fără model — pregătire manuală',
    loading: 'Se încarcă modelele…',
    error: 'Modelele nu au putut fi încărcate.',
    denied: 'Este necesar accesul explicit la modelele de Proiect.',
    empty: 'Nu există modele disponibile.',
    retry: 'Reîncărcați modelele',
    warning:
      'Model ilustrativ. Creează patru Sarcini neatribuite, fără termen. Nu autorizează începerea unei misiuni reale.',
    create: 'Creați Proiectul din model',
    plan: 'Plan copiat din model',
    sourceVersion: 'Versiune',
    required: 'Obligatorie',
    planNotice:
      'Definițiile originale sunt păstrate. Sarcinile se atribuie și se încheie explicit; progresul etapelor nu este încă disponibil.',
    planError: 'Planul original nu a putut fi încărcat.',
  },
  ru: {
    granted: 'предоставил явное право доступа к шаблонам Проектов',
    revoked: 'отозвал право доступа к шаблонам Проектов',
    bundle: 'Пользователь шаблонов Проектов',
    prerequisites:
      'Даёт только чтение шаблонов и создание из них Проекта. Контекст Компании, чтение Клиента, создание Проектов и управление Задачами предоставляются отдельно. Не даёт права публиковать версии, менять этап или разрешать начало работ.',
    choose: 'Шаблон Проекта',
    manual: 'Без шаблона — ручная подготовка',
    loading: 'Загрузка шаблонов…',
    error: 'Не удалось загрузить шаблоны.',
    denied: 'Нужно явно предоставленное право доступа к шаблонам Проектов.',
    empty: 'Нет доступных шаблонов.',
    retry: 'Перезагрузить шаблоны',
    warning:
      'Иллюстративный шаблон. Создаёт четыре Задачи без ответственного и срока. Не разрешает начинать реальную работу.',
    create: 'Создать Проект из шаблона',
    plan: 'План, скопированный из шаблона',
    sourceVersion: 'Версия',
    required: 'Обязательная',
    planNotice:
      'Исходные определения сохранены. Назначение и завершение Задач выполняются явно; переход между этапами пока недоступен.',
    planError: 'Не удалось загрузить исходный план.',
  },
  fr: {
    granted: 'a accordé l’accès explicite aux modèles de Projets',
    revoked: 'a révoqué l’accès aux modèles de Projets',
    bundle: 'Utilisateur des modèles de Projets',
    prerequisites:
      'Accorde uniquement la lecture et l’instanciation des modèles. Le contexte Entreprise, la lecture Client, la création de Projets et la gestion des Tâches sont accordés séparément. N’accorde ni publication de version, ni passage d’étape, ni autorisation de démarrer.',
    choose: 'Modèle de Projet',
    manual: 'Sans modèle — préparation manuelle',
    loading: 'Chargement des modèles…',
    error: 'Les modèles n’ont pas pu être chargés.',
    denied: 'Un droit explicite d’accès aux modèles de Projets est requis.',
    empty: 'Aucun modèle disponible.',
    retry: 'Recharger les modèles',
    warning:
      'Modèle illustratif. Crée quatre Tâches sans responsable ni échéance. N’autorise pas le démarrage d’une mission réelle.',
    create: 'Créer le Projet depuis le modèle',
    plan: 'Plan copié depuis le modèle',
    sourceVersion: 'Version',
    required: 'Obligatoire',
    planNotice:
      'Les définitions d’origine sont préservées. L’attribution et l’achèvement des Tâches sont explicites ; le passage d’étape n’est pas encore disponible.',
    planError: 'Le plan d’origine n’a pas pu être chargé.',
  },
  en: {
    granted: 'granted explicit Project template access',
    revoked: 'revoked Project template access',
    bundle: 'Project template user',
    prerequisites:
      'Grants template read and instantiation only. Company context, Client read, Project creation and Task management are granted separately. Grants no version publication, stage advancement or authority to start work.',
    choose: 'Project template',
    manual: 'No template — manual preparation',
    loading: 'Loading templates…',
    error: 'Templates could not be loaded.',
    denied: 'Explicit Project template access is required.',
    empty: 'No templates are available.',
    retry: 'Reload templates',
    warning:
      'Illustrative template. Creates four unassigned Tasks without due dates. Does not authorize a real engagement to start.',
    create: 'Create Project from template',
    plan: 'Plan copied from template',
    sourceVersion: 'Version',
    required: 'Required',
    planNotice:
      'Original definitions are preserved. Tasks are assigned and completed explicitly; stage advancement is not yet available.',
    planError: 'The original plan could not be loaded.',
  },
});
export function useProjectTemplateCopy() {
  return useMessages(projectTemplateMessages);
}
