import { defineMessages, useMessages } from '../localization/messages';
const keys = [
  'creationMissing',
  'creationUnavailable',
  'creationUncertain',
  'creationConflict',
  'creationValidation',
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
  'sourcePreview',
  'chooseSource',
  'openTask',
  'pilotWarning',
  'pilotNotice',
  'activity',
  'intendedResult',
  'bundle',
  'prerequisites',
  'granted',
  'revoked',
] as const;
export const projectTemplateMessages = defineMessages(keys, {
  ro: {
    chooseSource: 'Selectați modelul și Versiunea pentru consultare',
    sourcePreview: 'Plan sursă selectat',
    openTask: 'Deschide Sarcina asociată',
    pilotWarning:
      'Plan pilot ilustrativ. Creează treisprezece Sarcini fără responsabil sau termen. Nu autorizează începerea unei misiuni reale.',
    pilotNotice:
      'Acțiunile și rezultatele așteptate sunt păstrate din sursă. Nu confirmă realizarea, aprobarea sau certificarea și nu definesc etape software.',
    activity: 'Activitate',
    intendedResult: 'Rezultat așteptat',

    creationMissing:
      'Clientul sau Versiunea de model selectată nu mai este disponibilă. Reîncărcați opțiunile înainte de a crea Proiectul.',
    creationUnavailable:
      'Crearea Proiectului nu este disponibilă. Reîncărcați și încercați din nou.',
    creationUncertain:
      'Crearea Proiectului nu a putut fi confirmată. Reîncercați în siguranță cu aceleași informații.',
    creationConflict:
      'Crearea acestui Proiect intră în conflict cu cererea salvată sau cu selecția curentă. Reîncărcați înainte de a încerca din nou.',
    creationValidation:
      'Verificați titlul Proiectului, Clientul și Versiunea modelului înainte de a încerca din nou.',
    granted: 'a acordat accesul explicit la modelele de Proiect',
    revoked: 'a revocat accesul la modelele de Proiect',
    bundle: 'Utilizator modele de Proiect',
    prerequisites:
      'Noile drepturi v2 includ modelele existente și pilotul cu treisprezece activități. Drepturile v1 rămân doar pentru modelele existente până la revocarea și reacordarea explicită. Acordă numai citirea și instanțierea modelelor. Contextul Companiei, citirea Clientului, crearea Proiectelor și administrarea Sarcinilor se acordă separat. Nu acordă publicarea versiunilor, trecerea etapelor sau aprobarea începerii lucrului.',
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
      'Definițiile originale sunt păstrate. Sarcinile se atribuie și se încheie explicit; trecerea etapelor rămâne o acțiune explicită.',
    planError: 'Planul original nu a putut fi încărcat.',
  },
  ru: {
    chooseSource: 'Выберите модель и Версию для просмотра',
    sourcePreview: 'Выбранный исходный план',
    openTask: 'Открыть связанную Задачу',
    pilotWarning:
      'Иллюстративный пилотный план создаёт тринадцать Задач без исполнителя и срока. Не разрешает начало реального проекта.',
    pilotNotice:
      'Исходные действия и ожидаемые результаты сохранены. Они не подтверждают выполнение, утверждение или сертификацию и не задают программные этапы.',
    activity: 'Действие',
    intendedResult: 'Ожидаемый результат',

    creationMissing:
      'Выбранный Клиент или Версия шаблона больше недоступны. Обновите варианты перед созданием Проекта.',
    creationUnavailable:
      'Создание Проекта недоступно. Обновите страницу и попробуйте ещё раз.',
    creationUncertain:
      'Не удалось подтвердить создание Проекта. Безопасно повторите запрос с теми же данными.',
    creationConflict:
      'Создание Проекта конфликтует с сохранённым запросом или текущим выбором. Обновите данные перед повторной попыткой.',
    creationValidation:
      'Проверьте название Проекта, Клиента и Версию шаблона перед повторной попыткой.',
    granted: 'предоставил явное право доступа к шаблонам Проектов',
    revoked: 'отозвал право доступа к шаблонам Проектов',
    bundle: 'Пользователь шаблонов Проектов',
    prerequisites:
      'Новые права v2 включают прежние шаблоны и пилот из тринадцати действий. Права v1 остаются прежними до явного отзыва и повторной выдачи. Даёт только чтение шаблонов и создание из них Проекта. Контекст Компании, чтение Клиента, создание Проектов и управление Задачами предоставляются отдельно. Не даёт права публиковать версии, менять этап или разрешать начало работ.',
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
      'Исходные определения сохранены. Назначение и завершение Задач выполняются явно; переход между этапами остаётся явным действием.',
    planError: 'Не удалось загрузить исходный план.',
  },
  fr: {
    chooseSource: 'Choisir le modèle et la Version à consulter',
    sourcePreview: 'Plan source sélectionné',
    openTask: 'Ouvrir la Tâche associée',
    pilotWarning:
      'Plan pilote illustratif. Crée treize Tâches sans responsable ni échéance. N’autorise pas le démarrage d’une mission réelle.',
    pilotNotice:
      'Les actions et résultats attendus sont préservés depuis la source. Ils ne confirment ni réalisation, ni approbation, ni certification et ne définissent pas d’étapes logicielles.',
    activity: 'Activité',
    intendedResult: 'Résultat attendu',

    creationMissing:
      'Le Client ou la Version du modèle sélectionné n’est plus disponible. Rechargez les choix avant de créer le Projet.',
    creationUnavailable:
      'La création du Projet est indisponible. Rechargez puis réessayez.',
    creationUncertain:
      'La création du Projet n’a pas pu être confirmée. Réessayez avec les mêmes informations en toute sécurité.',
    creationConflict:
      'Cette création de Projet est en conflit avec la demande enregistrée ou la sélection actuelle. Rechargez avant de réessayer.',
    creationValidation:
      'Vérifiez le titre du Projet, le Client et la Version du modèle avant de réessayer.',
    granted: 'a accordé l’accès explicite aux modèles de Projets',
    revoked: 'a révoqué l’accès aux modèles de Projets',
    bundle: 'Utilisateur des modèles de Projets',
    prerequisites:
      'Les nouveaux droits v2 couvrent les modèles existants et le pilote de treize activités. Les droits v1 restent limités aux modèles existants jusqu’à une révocation et une réattribution explicites. Accorde uniquement la lecture et l’instanciation des modèles. Le contexte Entreprise, la lecture Client, la création de Projets et la gestion des Tâches sont accordés séparément. N’accorde ni publication de version, ni passage d’étape, ni autorisation de démarrer.',
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
      'Les définitions d’origine sont préservées. L’attribution et l’achèvement des Tâches sont explicites ; le passage d’étape reste une action explicite.',
    planError: 'Le plan d’origine n’a pas pu être chargé.',
  },
  en: {
    chooseSource: 'Choose model and Version to inspect',
    sourcePreview: 'Selected source plan',
    openTask: 'Open linked Task',
    pilotWarning:
      'Illustrative pilot plan. Creates thirteen unassigned Tasks without due dates. Does not authorize a real engagement to start.',
    pilotNotice:
      'Source actions and intended results are preserved. They do not confirm completion, approval or certification and do not define software stages.',
    activity: 'Activity',
    intendedResult: 'Intended result',

    creationMissing:
      'The selected Client or Template Version is no longer available. Reload the choices before creating the Project.',
    creationUnavailable:
      'Project creation is unavailable. Reload and try again.',
    creationUncertain:
      'The Project creation could not be confirmed. Retry the same details safely.',
    creationConflict:
      'This Project creation conflicts with the saved request or current selection. Reload before trying again.',
    creationValidation:
      'Check the Project title, Client and Template Version before trying again.',
    granted: 'granted explicit Project template access',
    revoked: 'revoked Project template access',
    bundle: 'Project template user',
    prerequisites:
      'New grants capture v2 for legacy templates and the thirteen-activity pilot. Existing v1 grants remain legacy-only until explicitly revoked and regranted. Grants template read and instantiation only. Company context, Client read, Project creation and Task management are granted separately. Grants no version publication, stage advancement or authority to start work.',
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
      'Original definitions are preserved. Tasks are assigned and completed explicitly; stage advancement remains an explicit action.',
    planError: 'The original plan could not be loaded.',
  },
});
export function useProjectTemplateCopy() {
  return useMessages(projectTemplateMessages);
}
