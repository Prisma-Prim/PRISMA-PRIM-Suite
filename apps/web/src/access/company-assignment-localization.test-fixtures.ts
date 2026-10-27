import type { ActorContext } from '../access-types';

export const assignmentMemberId = '11111111-1111-4111-8111-111111111111';
export const assignmentOtherMemberId = '11111111-1111-4111-8111-111111111112';
export const assignmentCompanyId = '22222222-2222-4222-8222-222222222221';
export const assignmentOtherCompanyId = '22222222-2222-4222-8222-222222222222';
export const assignmentMemberName =
  'Ana {originală} / Борис {имя} — Équipe de conseil au nom volontairement très long';
export const assignmentMemberEmail = 'ana+literal@example.test';
export const assignmentMemberLabel = `${assignmentMemberName} — ${assignmentMemberEmail}`;
export const assignmentCompanyName =
  'PRISMA {origine} / Компания — Entité opérationnelle au nom volontairement très long';
export const assignmentMemberReference = '10DGNSXLJLXOXC3RMYV4E8SNL';
export const assignmentOtherMemberReference = '10DGNSXLJLXOXC3RMYV4E8SNM';
export const assignmentCompanyReference = '20QXBLV736I61189QVFXEPZJ5';
export const assignmentOtherCompanyReference = '20QXBLV736I61189QVFXEPZJ6';

export const assignmentAdministrator: ActorContext = {
  internalUserId: '00000000-0000-4000-8000-000000000001',
  workspaceMembershipId: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000003',
  workspaceName: 'Workspace {original} / Пространство',
  displayName: 'Authorized administrator',
  email: 'administrator@example.test',
  active: true,
  workspacePermissions: ['company.assignment.manage'],
};

// Independently specified public expectations; never sourced from a catalog.
export const assignmentLocaleCases = [
  {
    locale: 'ro',
    option: 'Română',
    language: 'Limba interfeței',
    title: 'Acces la companie',
    member: 'Membru al spațiului de lucru',
    company: 'Companie',
    bundle: 'Pachet de acces',
    reference: 'Referință',
    selectMember: 'Selectează un membru',
    selectCompany: 'Selectează o companie',
    director: 'Accesul directorului companiei la clienți',
    grant: 'Acordă acces',
    revoke: 'Revocă acces',
    state: 'Starea curentă a serverului',
    grantedState: 'Acordat',
    version: 'Acordat — versiunea capturată',
    notGranted: 'Neacordat',
    granted: 'Acces acordat. Starea serverului a fost actualizată.',
    revoked: 'Acces revocat. Starea serverului a fost actualizată.',
    loading: 'Se încarcă administrarea accesului…',
    empty:
      'Nu există niciun membru activ sau nicio companie activă disponibilă pentru administrarea accesului.',
    retry: 'Reîncearcă încărcarea stării accesului',
    error: 'Starea accesului nu a putut fi încărcată sau modificată.',
    captured:
      'Versiunea este capturată la acordarea accesului. O versiune ulterioară se aplică numai după revocarea și acordarea din nou a acestui acces.',
  },
  {
    locale: 'ru',
    option: 'Русский',
    language: 'Язык интерфейса',
    title: 'Доступ к компании',
    member: 'Участник рабочего пространства',
    company: 'Компания',
    bundle: 'Набор прав доступа',
    reference: 'Идентификатор',
    selectMember: 'Выберите участника',
    selectCompany: 'Выберите компанию',
    director: 'Доступ директора компании к клиентам',
    grant: 'Предоставить доступ',
    revoke: 'Отозвать доступ',
    state: 'Текущее состояние сервера',
    grantedState: 'Предоставлен',
    version: 'Предоставлен — зафиксированная версия',
    notGranted: 'Не предоставлен',
    granted: 'Доступ предоставлен. Состояние сервера обновлено.',
    revoked: 'Доступ отозван. Состояние сервера обновлено.',
    loading: 'Загрузка управления доступом…',
    empty: 'Нет действующего участника или компании для управления доступом.',
    retry: 'Повторно загрузить состояние доступа',
    error: 'Не удалось загрузить или изменить состояние доступа.',
    captured:
      'Версия фиксируется при предоставлении доступа. Более поздняя версия применяется только после отзыва и повторного предоставления этого доступа.',
  },
  {
    locale: 'fr',
    option: 'Français',
    language: 'Langue de l’interface',
    title: 'Accès à la société',
    member: 'Membre de l’espace de travail',
    company: 'Société',
    bundle: 'Ensemble de droits',
    reference: 'Référence',
    selectMember: 'Sélectionner un membre',
    selectCompany: 'Sélectionner une société',
    director: 'Accès du directeur de la société aux clients',
    grant: 'Accorder l’accès',
    revoke: 'Révoquer l’accès',
    state: 'État actuel du serveur',
    grantedState: 'Accordé',
    version: 'Accordé — version capturée',
    notGranted: 'Non accordé',
    granted: 'Accès accordé. État du serveur actualisé.',
    revoked: 'Accès révoqué. État du serveur actualisé.',
    loading: 'Chargement de l’administration des accès…',
    empty:
      'Aucun membre actif ou aucune société active n’est disponible pour administrer les accès.',
    retry: 'Recharger l’état des accès',
    error: 'L’état des accès n’a pas pu être chargé ou modifié.',
    captured:
      'La version est capturée lors de l’octroi de l’accès. Une version ultérieure ne s’applique qu’après la révocation et un nouvel octroi de cet accès.',
  },
  {
    locale: 'en',
    option: 'English',
    language: 'Interface language',
    title: 'Company access',
    member: 'Workspace member',
    company: 'Company',
    bundle: 'Access bundle',
    reference: 'Reference',
    selectMember: 'Select a member',
    selectCompany: 'Select a Company',
    director: 'Company Director Client Access',
    grant: 'Grant access',
    revoke: 'Revoke access',
    state: 'Current server state',
    grantedState: 'Granted',
    version: 'Granted — captured version',
    notGranted: 'Not granted',
    granted: 'Access granted. Server state refreshed.',
    revoked: 'Access revoked. Server state refreshed.',
    loading: 'Loading access administration…',
    empty:
      'No active member or Company is available for access administration.',
    retry: 'Retry access state',
    error: 'The access state could not be loaded or changed.',
    captured:
      'The version is captured when access is granted. A later version applies only after this access is revoked and granted again.',
  },
] as const;

export const assignmentBundleCases = [
  {
    value: 'ideas-reader',
    canonical: 'Company Ideas Reader',
    version: 'v1',
    labels: {
      ro: 'Cititor de idei',
      ru: 'Читатель идей',
      fr: 'Lecteur des idées',
      en: 'Ideas Reader',
    },
  },
  {
    value: 'ideas-recorder',
    canonical: 'Company Ideas Recorder',
    version: 'v1',
    labels: {
      ro: 'Înregistrator de idei',
      ru: 'Регистратор идей',
      fr: 'Rédacteur des idées',
      en: 'Ideas Recorder',
    },
  },
  {
    value: 'ideas-reviewer',
    canonical: 'Company Ideas Reviewer',
    version: 'v1',
    labels: {
      ro: 'Evaluator de idei',
      ru: 'Рецензент идей',
      fr: 'Évaluateur des idées',
      en: 'Ideas Reviewer',
    },
  },
  {
    value: 'company-context',
    canonical: 'Company Context Access',
    version: null,
    labels: {
      ro: 'Acces la contextul companiei',
      ru: 'Доступ к контексту компании',
      fr: 'Accès au contexte de la société',
      en: 'Company Context Access',
    },
  },
  {
    value: 'commercial-intake',
    canonical: 'Company Commercial Intake',
    version: 'v4',
    labels: {
      ro: 'Înregistrare comercială în companie',
      ru: 'Регистрация коммерческих обращений компании',
      fr: 'Enregistrement commercial de la société',
      en: 'Company Commercial Intake',
    },
  },
  {
    value: 'service-catalogue',
    canonical: 'Company Service Catalogue',
    version: 'v1',
    labels: {
      ro: 'Catalogul de servicii al companiei',
      ru: 'Каталог услуг компании',
      fr: 'Catalogue de services de la société',
      en: 'Company Service Catalogue',
    },
  },
  {
    value: 'pricing-configuration',
    canonical: 'Company Pricing Configuration',
    version: 'v1',
    labels: {
      ro: 'Configurarea prețurilor companiei',
      ru: 'Настройка ценообразования компании',
      fr: 'Configuration des prix de la société',
      en: 'Company Pricing Configuration',
    },
  },
  {
    value: 'profitability-contributor',
    canonical: 'Company Profitability Contributor',
    version: 'v1',
    labels: {
      ro: 'Contributor rentabilitate Companie',
      ru: 'Автор оценки рентабельности Компании',
      fr: 'Contributeur de rentabilité Société',
      en: 'Company Profitability Contributor',
    },
  },
  {
    value: 'profitability-director',
    canonical: 'Company Profitability Director',
    version: 'v1',
    labels: {
      ro: 'Director rentabilitate Companie',
      ru: 'Директор оценки рентабельности Компании',
      fr: 'Directeur de rentabilité Société',
      en: 'Company Profitability Director',
    },
  },
  {
    value: 'operational-risk-reader',
    canonical: 'Company Operational Risk Reader',
    version: 'v1',
    labels: {
      ro: 'Cititor al riscurilor operaționale ale Companiei',
      ru: 'Читатель операционных рисков компании',
      fr: 'Lecteur des risques opérationnels de la société',
      en: 'Company Operational Risk Reader',
    },
  },
  {
    value: 'operational-risk-recorder',
    canonical: 'Company Operational Risk Recorder',
    version: 'v1',
    labels: {
      ro: 'Autor al înregistrărilor de risc ale Companiei',
      ru: 'Автор записей о рисках компании',
      fr: 'Rédacteur des risques opérationnels de la société',
      en: 'Company Operational Risk Recorder',
    },
  },
  {
    value: 'pricing-user',
    canonical: 'Company Pricing User',
    version: 'v1',
    labels: {
      ro: 'Utilizator al prețurilor companiei',
      ru: 'Пользователь ценообразования компании',
      fr: 'Utilisateur des prix de la société',
      en: 'Company Pricing User',
    },
  },
  {
    value: 'offer-preparer',
    canonical: 'Company Offer Preparer',
    version: 'v1',
    labels: {
      ro: 'Responsabil cu pregătirea ofertelor companiei',
      ru: 'Подготовка предложений компании',
      fr: 'Préparateur d’offres de la société',
      en: 'Company Offer Preparer',
    },
  },
  {
    value: 'mission-plan-configuration',
    canonical: 'Company Mission Plan Configuration',
    version: 'v1',
    labels: {
      ro: 'Configurare planuri de misiune ale companiei',
      ru: 'Настройка планов миссий компании',
      fr: 'Configuration des plans de mission de la société',
      en: 'Company Mission Plan Configuration',
    },
  },
  {
    value: 'mission-plan-user',
    canonical: 'Company Mission Plan User',
    version: 'v1',
    labels: {
      ro: 'Utilizator planuri de misiune ale companiei',
      ru: 'Пользователь планов миссий компании',
      fr: 'Utilisateur des plans de mission de la société',
      en: 'Company Mission Plan User',
    },
  },
  {
    value: 'offer-model-editor',
    canonical: 'Company Offer Model Editor',
    version: 'v1',
    labels: {
      ro: 'Editor al modelelor de ofertă ale companiei',
      ru: 'Редактор шаблонов предложений компании',
      fr: 'Éditeur des modèles d’offre de la société',
      en: 'Company Offer Model Editor',
    },
  },
  {
    value: 'offer-model-approver',
    canonical: 'Company Offer Model Approver',
    version: 'v1',
    labels: {
      ro: 'Aprobator al modelelor de ofertă ale companiei',
      ru: 'Утверждающий шаблоны предложений компании',
      fr: 'Approbateur des modèles d’offre de la société',
      en: 'Company Offer Model Approver',
    },
  },
  {
    value: 'contract-model-editor',
    canonical: 'Company Contract Model Editor',
    version: 'v1',
    labels: {
      ro: 'Editor al modelelor de contract ale companiei',
      ru: 'Редактор шаблонов договоров компании',
      fr: 'Éditeur des modèles de contrat de la société',
      en: 'Company Contract Model Editor',
    },
  },
  {
    value: 'contract-model-approver',
    canonical: 'Company Contract Model Approver',
    version: 'v1',
    labels: {
      ro: 'Aprobator al modelelor de contract ale companiei',
      ru: 'Утверждающий шаблоны договоров компании',
      fr: 'Approbateur des modèles de contrat de la société',
      en: 'Company Contract Model Approver',
    },
  },
  {
    value: 'contract-preparer',
    canonical: 'Company Contract Preparer',
    version: 'v1',
    labels: {
      ro: 'Responsabil cu pregătirea contractelor companiei',
      ru: 'Подготовка договоров компании',
      fr: 'Préparateur de contrats de la société',
      en: 'Company Contract Preparer',
    },
  },
  {
    value: 'contract-early-preparation',
    canonical: 'Company Contract Early Preparation',
    version: 'v1',
    labels: {
      ro: 'Pregătire anticipată a contractelor companiei',
      ru: 'Ранняя подготовка договоров компании',
      fr: 'Préparation anticipée des contrats de la société',
      en: 'Company Contract Early Preparation',
    },
  },
  {
    value: 'contract-approver',
    canonical: 'Company Contract Approver',
    version: 'v1',
    labels: {
      ro: 'Aprobator de contracte al companiei',
      ru: 'Согласующий договоры компании',
      fr: 'Approbateur de contrats de la société',
      en: 'Company Contract Approver',
    },
  },
  {
    value: 'offer-approver',
    canonical: 'Company Offer Approver',
    version: 'v1',
    labels: {
      ro: 'Aprobator de oferte al companiei',
      ru: 'Согласующий предложения компании',
      fr: 'Approbateur d’offres de la société',
      en: 'Company Offer Approver',
    },
  },
  {
    value: 'pricing-adjustment',
    canonical: 'Company Pricing Adjustment',
    version: 'v1',
    labels: {
      ro: 'Ajustarea prețurilor companiei',
      ru: 'Корректировка цены компании',
      fr: 'Ajustement des prix de la société',
      en: 'Company Pricing Adjustment',
    },
  },
  {
    value: 'commercial-activity-reader',
    canonical: 'Company Commercial Activity Reader',
    version: 'v1',
    labels: {
      ro: 'Cititor al activității comerciale a companiei',
      ru: 'Читатель коммерческой активности компании',
      fr: 'Lecteur de l’activité commerciale de la société',
      en: 'Company Commercial Activity Reader',
    },
  },
  {
    value: 'opportunity-manager',
    canonical: 'Company Opportunity Manager',
    version: 'v2',
    labels: {
      ro: 'Responsabil de oportunități al companiei',
      ru: 'Управляющий возможностями компании',
      fr: 'Responsable des opportunités de la société',
      en: 'Company Opportunity Manager',
    },
  },
  {
    value: 'sales-stage-configuration',
    canonical: 'Company Sales Stage Configuration',
    version: 'v1',
    labels: {
      ro: 'Configurarea etapelor de vânzare ale companiei',
      ru: 'Настройка этапов продаж компании',
      fr: 'Configuration des étapes de vente de la société',
      en: 'Company Sales Stage Configuration',
    },
  },
  {
    value: 'project-template-user',
    canonical: 'Company Project Template User',
    version: 'v1',
    labels: {
      ro: 'Utilizator modele de Proiect',
      ru: 'Пользователь шаблонов Проектов',
      fr: 'Utilisateur des modèles de Projets',
      en: 'Project template user',
    },
  },
  {
    value: 'project-template-configuration',
    canonical: 'Company Project Template Configuration',
    version: 'v1',
    labels: {
      ro: 'Configurarea modelelor de Proiect ale Company',
      ru: 'Настройка шаблонов Проекта Company',
      fr: 'Configuration des modèles de Projet de la Company',
      en: 'Company Project Template Configuration',
    },
  },
  {
    value: 'project-stage-advancer',
    canonical: 'Company Project Stage Advancer',
    version: 'v1',
    labels: {
      ro: 'Responsabil pentru trecerea etapelor Proiectului',
      ru: 'Ответственный за переход этапов Проекта',
      fr: 'Responsable du changement d’étape du Projet',
      en: 'Project Stage Advancer',
    },
  },
  {
    value: 'director-client',
    canonical: 'Company Director Client Access',
    version: 'v2',
    labels: {
      ro: 'Accesul directorului companiei la clienți',
      ru: 'Доступ директора компании к клиентам',
      fr: 'Accès du directeur de la société aux clients',
      en: 'Company Director Client Access',
    },
  },
  {
    value: 'document-project-organizer',
    canonical: 'Company Document Project Organizer',
    version: 'v1',
    labels: {
      ro: 'Organizator de documente pentru proiectele companiei',
      ru: 'Организатор документов проектов компании',
      fr: 'Organisateur des documents des projets de la société',
      en: 'Company Document Project Organizer',
    },
  },
  {
    value: 'document-registrar',
    canonical: 'Company Document Registrar',
    version: 'v3',
    labels: {
      ro: 'Responsabil cu înregistrarea documentelor companiei',
      ru: 'Регистратор документов компании',
      fr: 'Responsable de l’enregistrement des documents de la société',
      en: 'Company Document Registrar',
    },
  },
  {
    value: 'contract-signature-declarer',
    canonical: 'Company Contract Signature Declarer',
    version: 'v1',
    labels: {
      en: 'Company Contract Signature Declarer',
      fr: 'Déclarant de signature du contrat de la société',
      ro: 'Declarant al semnării Contractului în Companie',
      ru: 'Декларант подписания Договора Компании',
    },
  },
  {
    value: 'received-contract-access',
    canonical: 'Company Received Contract Access',
    version: 'v1',
    labels: {
      en: 'Company Received Contract Access',
      fr: 'Accès aux contrats reçus de la société',
      ro: 'Acces la contractele primite ale companiei',
      ru: 'Доступ к полученным договорам компании',
    },
  },
  {
    value: 'mission-deliverable-access',
    canonical: 'Company Mission Deliverable Access',
    version: 'v1',
    labels: {
      en: 'Company Mission Deliverable Access',
      fr: 'Accès aux livrables de mission de la société',
      ro: 'Acces la livrabilele misiunii companiei',
      ru: 'Доступ к результатам миссии компании',
    },
  },
  {
    value: 'document-content-reader',
    canonical: 'Company Document Content Reader',
    version: 'v1',
    labels: {
      ro: 'Cititor de PDF-uri confidențiale ale Companiei',
      ru: 'Чтение конфиденциальных PDF Компании',
      fr: 'Lecture des PDF confidentiels de la Compagnie',
      en: 'Company confidential PDF reader',
    },
  },
  {
    value: 'document-content-uploader',
    canonical: 'Company Document Content Uploader',
    version: 'v1',
    labels: {
      ro: 'Încărcare de PDF-uri confidențiale ale Companiei',
      ru: 'Загрузка конфиденциальных PDF Компании',
      fr: 'Dépôt des PDF confidentiels de la Compagnie',
      en: 'Company confidential PDF uploader',
    },
  },
  {
    value: 'document-approver',
    canonical: 'Company Document Approver',
    version: 'v1',
    labels: {
      ro: 'Aprobator de documente al companiei',
      ru: 'Согласующий документы компании',
      fr: 'Approbateur de documents de la société',
      en: 'Company Document Approver',
    },
  },
  {
    value: 'project',
    canonical: 'Company Project Access',
    version: 'v2',
    labels: {
      ro: 'Acces la proiectele companiei',
      ru: 'Доступ к проектам компании',
      fr: 'Accès aux projets de la société',
      en: 'Company Project Access',
    },
  },
  {
    value: 'project-approver',
    canonical: 'Company Project Approver',
    version: 'v1',
    labels: {
      ro: 'Aprobator de proiecte al companiei',
      ru: 'Согласующий проекты компании',
      fr: 'Approbateur de projets de la société',
      en: 'Company Project Approver',
    },
  },
  {
    value: 'task-manager',
    canonical: 'Company Task Manager',
    version: 'v1',
    labels: {
      ro: 'Responsabil de sarcini al companiei',
      ru: 'Управляющий задачами компании',
      fr: 'Responsable des tâches de la société',
      en: 'Company Task Manager',
    },
  },
  {
    value: 'mission-result-reviewer',
    canonical: 'Company Mission Result Reviewer',
    version: 'v1',
    labels: {
      ro: 'Revizor al rezultatelor misiunii companiei',
      ru: 'Проверяющий результатов миссии компании',
      fr: 'Réviseur des résultats de mission de l’entreprise',
      en: 'Company Mission Result Reviewer',
    },
  },
  {
    value: 'task-result-recorder',
    canonical: 'Company Task Result Recorder',
    version: 'v1',
    labels: {
      ro: 'Declarant de rezultate ale sarcinilor companiei',
      ru: 'Регистратор результатов задач компании',
      fr: 'Déclarant de résultats de tâche de la société',
      en: 'Company Task Result Recorder',
    },
  },
] as const;

export type AssignmentBundleFixture = (typeof assignmentBundleCases)[number];
export type AssignmentLocaleFixture = (typeof assignmentLocaleCases)[number];

export function assignmentAdministration({
  activeBundles = [],
  targetMemberId = assignmentMemberId,
}: {
  activeBundles?: readonly AssignmentBundleFixture[];
  targetMemberId?: string;
} = {}) {
  return {
    members: [
      {
        workspaceMembershipId: targetMemberId,
        displayName: assignmentMemberName,
        email: assignmentMemberEmail,
      },
      {
        workspaceMembershipId: assignmentOtherMemberId,
        displayName: assignmentMemberName,
        email: assignmentMemberEmail,
      },
    ],
    companies: [
      { id: assignmentCompanyId, displayName: assignmentCompanyName },
      { id: assignmentOtherCompanyId, displayName: assignmentCompanyName },
    ],
    assignments: activeBundles.map((bundle, index) => ({
      id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, '0')}`,
      workspaceMembershipId: targetMemberId,
      companyId: assignmentCompanyId,
      bundle: bundle.canonical,
      permissionSetVersion: bundle.version,
      active: true,
    })),
  };
}
