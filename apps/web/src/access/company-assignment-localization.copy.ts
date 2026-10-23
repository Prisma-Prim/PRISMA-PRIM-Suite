import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'eyebrow',
  'title',
  'description',
  'bundleLabel',
  'documentProjectOrganizerBundle',
  'documentRegistrarBundle',
  'documentApproverBundle',
  'documentApproverPrerequisites',
  'companyContextBundle',
  'projectBundle',
  'commercialIntakeBundle',
  'serviceCatalogueBundle',
  'pricingConfigurationBundle',
  'pricingConfigurationPrerequisites',
  'commercialActivityReaderBundle',
  'commercialActivityReaderPrerequisites',
  'projectApproverBundle',
  'projectApproverPrerequisites',
  'pricingUserBundle',
  'pricingUserPrerequisites',
  'offerPreparerBundle',
  'contractPreparerBundle',
  'contractEarlyPreparationBundle',
  'contractEarlyPreparationPrerequisites',
  'contractPreparerPrerequisites',
  'offerApproverBundle',
  'offerApproverPrerequisites',
  'offerPreparerPrerequisites',
  'opportunityManagerBundle',
  'opportunityManagerPrerequisites',
  'pricingAdjustmentBundle',
  'pricingAdjustmentPrerequisites',
  'taskManagerBundle',
  'taskManagerPrerequisites',
  'directorClientBundle',
  'workspaceMemberLabel',
  'companyLabel',
  'selectMember',
  'selectCompany',
  'referenceLabel',
  'grant',
  'revoke',
  'granted',
  'revoked',
  'currentStateLabel',
  'currentStateGranted',
  'currentStateGrantedVersion',
  'capturedVersionExplanation',
  'currentStateNotGranted',
  'loading',
  'empty',
  'retry',
  'error',
] as const;

// Display resources only. Canonical bundle identities remain owned by the
// unchanged administration validator and the component's exhaustive mapping.
export const companyAssignmentMessages = defineMessages(keys, {
  ro: {
    contractEarlyPreparationBundle:
      'Pregătire anticipată a contractelor companiei',
    contractEarlyPreparationPrerequisites:
      'Permite schițe de Contract înainte de acceptarea Ofertei. Contextul Companiei, pregătirea Contractului și citirea Clientului Companiei, Ofertei și Oportunității rămân necesare separat. Nu acordă aprobare sau semnare.',

    eyebrow: 'Acces',
    title: 'Acces la companie',
    description:
      'Alege un membru activ al spațiului de lucru, o companie activă și un pachet de acces aprobat. Starea afișată este întotdeauna reîncărcată de pe server.',
    bundleLabel: 'Pachet de acces',
    documentProjectOrganizerBundle:
      'Organizator de documente pentru proiectele companiei',
    documentRegistrarBundle:
      'Responsabil cu înregistrarea documentelor companiei',
    documentApproverBundle: 'Aprobator de documente al companiei',
    documentApproverPrerequisites:
      'Aprobatorul de documente al companiei v1 permite numai desemnarea unei versiuni de document în ciornă ca oficială. Contextul companiei, citirea documentelor și a referințelor și citirea clienților trebuie deja autorizate separat, de exemplu prin responsabilul cu înregistrarea documentelor companiei.',
    companyContextBundle: 'Acces la contextul companiei',
    projectBundle: 'Acces la proiectele companiei',
    commercialIntakeBundle: 'Înregistrare comercială în companie',
    serviceCatalogueBundle: 'Catalogul de servicii al companiei',
    pricingConfigurationBundle: 'Configurarea prețurilor companiei',
    pricingConfigurationPrerequisites:
      'Configurarea prețurilor companiei v1 permite numai citirea ofertelor de servicii și configurarea prețurilor: citirea și publicarea versiunilor ilustrative ale regulilor de preț și ale tarifelor. Contextul companiei trebuie deja autorizat separat.',
    commercialActivityReaderBundle:
      'Cititor al activității comerciale a companiei',
    commercialActivityReaderPrerequisites:
      'Cititorul activității comerciale a companiei v1 permite numai citirea jurnalului de activitate comercială. Contextul companiei și citirea obiectului comercial al fiecărui eveniment trebuie deja autorizate separat.',
    projectApproverBundle: 'Aprobator de proiecte al companiei',
    projectApproverPrerequisites:
      'Modifică numai ciclul de viață al proiectului; citirea proiectelor și a clienților este autorizată separat.',
    pricingUserBundle: 'Utilizator al prețurilor companiei',
    pricingUserPrerequisites:
      'Utilizatorul prețurilor companiei v1 permite numai citirea ofertelor de servicii și a configurării prețurilor; nu permite publicarea. Contextul companiei trebuie deja autorizat separat.',
    offerPreparerBundle: 'Responsabil cu pregătirea ofertelor companiei',
    contractPreparerBundle: 'Responsabil cu pregătirea contractelor companiei',
    // Offers §18.6; Contracts §§19.6 and 19.11 own these three descriptions.
    contractPreparerPrerequisites:
      'Responsabilul cu pregătirea contractelor companiei v1 permite citirea și pregătirea contractelor și asocierea cu proiecte. Contextul companiei și citirea oportunității trebuie autorizate separat. Crearea dintr-o ofertă necesită citirea acelei oferte; crearea unei versiuni și alegerea entității pentru un contract direct necesită citirea clientului și o relație activă client–companie. Alegerea unui instantaneu de preț necesită dreptul separat de citire a acestuia. Asocierea necesită citirea proiectului; crearea unui proiect necesită suplimentar dreptul de creare a proiectelor și citirea clientului proiectului. Citirea ulterioară a contractului nu necesită în toate cazurile citirea ofertei sau a clientului. Pachetul nu acordă drepturi asupra ofertelor, clienților, prețurilor sau proiectelor.',
    offerApproverBundle: 'Aprobator de oferte al companiei',
    offerApproverPrerequisites:
      'Aprobatorul de oferte al companiei v1 permite citirea ofertelor, deciziile interne și înregistrarea răspunsului simulat al clientului. Contextul companiei și citirea oportunității trebuie autorizate separat. Pachetul nu permite pregătirea ofertelor și nu acordă drepturi asupra clienților sau prețurilor.',
    offerPreparerPrerequisites:
      'Responsabilul cu pregătirea ofertelor companiei v1 permite citirea și pregătirea ofertelor, înregistrarea transmiterii simulate și citirea instantaneului de preț exact referit. Contextul companiei și citirea oportunității trebuie autorizate separat; alegerea entității juridice a clientului necesită și citirea clientului. Pachetul nu permite calcularea sau ajustarea prețurilor și nu acordă drepturi asupra clienților, aprobărilor sau contractelor.',
    opportunityManagerBundle: 'Responsabil de oportunități al companiei',
    opportunityManagerPrerequisites:
      'Responsabilul de oportunități al companiei v2 modifică responsabilul și starea rezultatului; contextul companiei și citirea înregistrărilor comerciale sunt autorizate separat.',
    pricingAdjustmentBundle: 'Ajustarea prețurilor companiei',
    pricingAdjustmentPrerequisites:
      'Ajustarea prețurilor companiei v1 permite numai aplicarea unei reduceri nete fixe în timpul unui calcul de preț. Contextul companiei, vizibilitatea oportunității și accesul de utilizator al prețurilor companiei trebuie deja autorizate separat.',
    taskManagerBundle: 'Responsabil de sarcini al companiei',
    taskManagerPrerequisites:
      'Responsabilul de sarcini al companiei v1 permite numai citirea și gestionarea sarcinilor. Contextul companiei, citirea proiectelor și a clienților trebuie deja autorizate separat.',
    directorClientBundle: 'Accesul directorului companiei la clienți',
    workspaceMemberLabel: 'Membru al spațiului de lucru',
    companyLabel: 'Companie',
    selectMember: 'Selectează un membru',
    selectCompany: 'Selectează o companie',
    referenceLabel: 'Referință',
    grant: 'Acordă acces',
    revoke: 'Revocă acces',
    granted: 'Acces acordat. Starea serverului a fost actualizată.',
    revoked: 'Acces revocat. Starea serverului a fost actualizată.',
    currentStateLabel: 'Starea curentă a serverului',
    currentStateGranted: 'Acordat',
    currentStateGrantedVersion: 'Acordat — versiunea capturată {version}',
    capturedVersionExplanation:
      'Versiunea este capturată la acordarea accesului. O versiune ulterioară se aplică numai după revocarea și acordarea din nou a acestui acces.',
    currentStateNotGranted: 'Neacordat',
    loading: 'Se încarcă administrarea accesului…',
    empty:
      'Nu există niciun membru activ sau nicio companie activă disponibilă pentru administrarea accesului.',
    retry: 'Reîncearcă încărcarea stării accesului',
    error: 'Starea accesului nu a putut fi încărcată sau modificată.',
  },
  ru: {
    contractEarlyPreparationBundle: 'Ранняя подготовка договоров компании',
    contractEarlyPreparationPrerequisites:
      'Разрешает черновики договора до принятия предложения. Контекст компании, подготовка договора и чтение клиента компании, предложения и возможности требуются отдельно. Не даёт права одобрения или подписи.',

    eyebrow: 'Доступ',
    title: 'Доступ к компании',
    description:
      'Выберите действующего участника рабочего пространства, действующую компанию и один утверждённый набор прав доступа. Отображаемое состояние всегда загружается с сервера заново.',
    bundleLabel: 'Набор прав доступа',
    documentProjectOrganizerBundle: 'Организатор документов проектов компании',
    documentRegistrarBundle: 'Регистратор документов компании',
    documentApproverBundle: 'Согласующий документы компании',
    documentApproverPrerequisites:
      'Согласующий документы компании v1 может только назначить черновую версию документа официальной. Контекст компании, чтение документов и ссылок и чтение клиентов должны быть разрешены отдельно, например через регистратора документов компании.',
    companyContextBundle: 'Доступ к контексту компании',
    projectBundle: 'Доступ к проектам компании',
    commercialIntakeBundle: 'Регистрация коммерческих обращений компании',
    serviceCatalogueBundle: 'Каталог услуг компании',
    pricingConfigurationBundle: 'Настройка ценообразования компании',
    pricingConfigurationPrerequisites:
      'Настройка ценообразования компании v1 даёт только чтение предложений услуг и настройку ценообразования: чтение и публикацию иллюстративных версий правил расчёта цены и тарифов. Контекст компании должен быть разрешён отдельно.',
    commercialActivityReaderBundle: 'Читатель коммерческой активности компании',
    commercialActivityReaderPrerequisites:
      'Читатель коммерческой активности компании v1 может только читать коммерческий журнал действий. Контекст компании и чтение коммерческого объекта каждого события должны быть разрешены отдельно.',
    projectApproverBundle: 'Согласующий проекты компании',
    projectApproverPrerequisites:
      'Меняет только жизненный цикл проекта; чтение проектов и клиентов разрешается отдельно.',
    pricingUserBundle: 'Пользователь ценообразования компании',
    pricingUserPrerequisites:
      'Пользователь ценообразования компании v1 может только читать предложения услуг и настройки ценообразования; публикация не разрешена. Контекст компании должен быть разрешён отдельно.',
    offerPreparerBundle: 'Подготовка предложений компании',
    contractPreparerBundle: 'Подготовка договоров компании',
    contractPreparerPrerequisites:
      'Подготовка договоров компании v1 даёт чтение и подготовку договоров и связывание с проектами. Контекст компании и чтение возможности должны быть разрешены отдельно. Создание из предложения требует чтения этого предложения; создание версии и выбор лица для прямого договора требуют чтения клиента и действующей связи клиента с компанией. Выбор снимка цены требует отдельного права его чтения. Связывание требует чтения проекта; создание проекта дополнительно требует права создания проектов и чтения клиента проекта. Последующее чтение договора не во всех случаях требует чтения предложения или клиента. Набор не даёт прав на предложения, клиентов, ценообразование или проекты.',
    offerApproverBundle: 'Согласующий предложения компании',
    offerApproverPrerequisites:
      'Согласующий предложения компании v1 может читать предложения, принимать внутренние решения и регистрировать имитированный ответ клиента. Контекст компании и чтение возможности должны быть разрешены отдельно. Набор не разрешает подготовку предложений и не даёт прав на клиентов или ценообразование.',
    offerPreparerPrerequisites:
      'Подготовка предложений компании v1 даёт чтение и подготовку предложений, регистрацию имитированной отправки и чтение точного указанного снимка цены. Контекст компании и чтение возможности должны быть разрешены отдельно; выбор юридического лица клиента также требует чтения клиента. Набор не разрешает расчёт или корректировку цены и не даёт прав на клиентов, согласование или договоры.',
    opportunityManagerBundle: 'Управляющий возможностями компании',
    opportunityManagerPrerequisites:
      'Управляющий возможностями компании v2 меняет ответственного и статус результата; контекст компании и чтение коммерческих обращений разрешаются отдельно.',
    pricingAdjustmentBundle: 'Корректировка цены компании',
    pricingAdjustmentPrerequisites:
      'Корректировка цены компании v1 разрешает только применение фиксированной скидки без налога при расчёте цены. Контекст компании, видимость возможности и доступ пользователя ценообразования компании должны быть разрешены отдельно.',
    taskManagerBundle: 'Управляющий задачами компании',
    taskManagerPrerequisites:
      'Управляющий задачами компании v1 может только читать задачи и управлять ими. Контекст компании, чтение проектов и клиентов должны быть разрешены отдельно.',
    directorClientBundle: 'Доступ директора компании к клиентам',
    workspaceMemberLabel: 'Участник рабочего пространства',
    companyLabel: 'Компания',
    selectMember: 'Выберите участника',
    selectCompany: 'Выберите компанию',
    referenceLabel: 'Идентификатор',
    grant: 'Предоставить доступ',
    revoke: 'Отозвать доступ',
    granted: 'Доступ предоставлен. Состояние сервера обновлено.',
    revoked: 'Доступ отозван. Состояние сервера обновлено.',
    currentStateLabel: 'Текущее состояние сервера',
    currentStateGranted: 'Предоставлен',
    currentStateGrantedVersion:
      'Предоставлен — зафиксированная версия {version}',
    capturedVersionExplanation:
      'Версия фиксируется при предоставлении доступа. Более поздняя версия применяется только после отзыва и повторного предоставления этого доступа.',
    currentStateNotGranted: 'Не предоставлен',
    loading: 'Загрузка управления доступом…',
    empty: 'Нет действующего участника или компании для управления доступом.',
    retry: 'Повторно загрузить состояние доступа',
    error: 'Не удалось загрузить или изменить состояние доступа.',
  },
  fr: {
    contractEarlyPreparationBundle:
      'Préparation anticipée des contrats de la société',
    contractEarlyPreparationPrerequisites:
      'Autorise les brouillons avant acceptation de l’offre. Le contexte société, la préparation du contrat et la lecture du client de la société, de l’offre et de l’opportunité restent requis séparément. N’accorde aucun droit d’approbation ou de signature.',

    eyebrow: 'Accès',
    title: 'Accès à la société',
    description:
      'Choisissez un membre actif de l’espace de travail, une société active et un ensemble de droits approuvé. L’état affiché est toujours rechargé depuis le serveur.',
    bundleLabel: 'Ensemble de droits',
    documentProjectOrganizerBundle:
      'Organisateur des documents des projets de la société',
    documentRegistrarBundle:
      'Responsable de l’enregistrement des documents de la société',
    documentApproverBundle: 'Approbateur de documents de la société',
    documentApproverPrerequisites:
      'L’approbateur de documents de la société v1 peut uniquement désigner une version de document en brouillon comme officielle. Le contexte de la société, la lecture des documents et des références et la lecture des clients doivent déjà être autorisés séparément, par exemple par le responsable de l’enregistrement des documents de la société.',
    companyContextBundle: 'Accès au contexte de la société',
    projectBundle: 'Accès aux projets de la société',
    commercialIntakeBundle: 'Enregistrement commercial de la société',
    serviceCatalogueBundle: 'Catalogue de services de la société',
    pricingConfigurationBundle: 'Configuration des prix de la société',
    pricingConfigurationPrerequisites:
      'La configuration des prix de la société v1 autorise uniquement la lecture des offres de services et la configuration des prix : lecture et publication des versions illustratives des règles de tarification et des tarifs. Le contexte de la société doit déjà être autorisé séparément.',
    commercialActivityReaderBundle:
      'Lecteur de l’activité commerciale de la société',
    commercialActivityReaderPrerequisites:
      'Le lecteur de l’activité commerciale de la société v1 autorise uniquement la lecture du journal d’activité commerciale. Le contexte de la société et la lecture de l’objet commercial de chaque événement doivent déjà être autorisés séparément.',
    projectApproverBundle: 'Approbateur de projets de la société',
    projectApproverPrerequisites:
      'Modifie uniquement le cycle de vie du projet ; la lecture des projets et des clients est autorisée séparément.',
    pricingUserBundle: 'Utilisateur des prix de la société',
    pricingUserPrerequisites:
      'L’utilisateur des prix de la société v1 autorise uniquement la lecture des offres de services et de la configuration des prix ; il ne permet aucune publication. Le contexte de la société doit déjà être autorisé séparément.',
    offerPreparerBundle: 'Préparateur d’offres de la société',
    contractPreparerBundle: 'Préparateur de contrats de la société',
    contractPreparerPrerequisites:
      'Le préparateur de contrats de la société v1 autorise la lecture et la préparation des contrats ainsi que leur association à des projets. Le contexte de la société et la lecture de l’opportunité doivent être autorisés séparément. La création à partir d’une offre exige la lecture de cette offre ; la création d’une version et le choix de l’entité d’un contrat direct exigent la lecture du client et une relation client–société active. Le choix d’un instantané de prix exige son droit de lecture distinct. L’association exige la lecture du projet ; la création d’un projet exige aussi le droit de création de projets et la lecture du client du projet. Les lectures ultérieures du contrat n’exigent pas systématiquement la lecture de l’offre ou du client. Cet ensemble n’accorde aucun droit sur les offres, les clients, les prix ou les projets.',
    offerApproverBundle: 'Approbateur d’offres de la société',
    offerApproverPrerequisites:
      'L’approbateur d’offres de la société v1 autorise la lecture des offres, les décisions internes et l’enregistrement de la réponse simulée du client. Le contexte de la société et la lecture de l’opportunité doivent être autorisés séparément. Cet ensemble ne permet pas la préparation des offres et n’accorde aucun droit sur les clients ou les prix.',
    offerPreparerPrerequisites:
      'Le préparateur d’offres de la société v1 autorise la lecture et la préparation des offres, l’enregistrement de la transmission simulée et la lecture de l’instantané de prix exact référencé. Le contexte de la société et la lecture de l’opportunité doivent être autorisés séparément ; le choix de l’entité juridique du client exige aussi la lecture du client. Cet ensemble ne permet ni le calcul ni l’ajustement des prix et n’accorde aucun droit sur les clients, l’approbation ou les contrats.',
    opportunityManagerBundle: 'Responsable des opportunités de la société',
    opportunityManagerPrerequisites:
      'Le responsable des opportunités de la société v2 modifie le responsable et l’état du résultat ; le contexte de la société et la lecture des enregistrements commerciaux sont autorisés séparément.',
    pricingAdjustmentBundle: 'Ajustement des prix de la société',
    pricingAdjustmentPrerequisites:
      'L’ajustement des prix de la société v1 autorise uniquement l’application d’une remise nette fixe lors d’un calcul de prix. Le contexte de la société, la visibilité de l’opportunité et l’accès utilisateur aux prix de la société doivent déjà être autorisés séparément.',
    taskManagerBundle: 'Responsable des tâches de la société',
    taskManagerPrerequisites:
      'Le responsable des tâches de la société v1 autorise uniquement la lecture et la gestion des tâches. Le contexte de la société et la lecture des projets et des clients doivent déjà être autorisés séparément.',
    directorClientBundle: 'Accès du directeur de la société aux clients',
    workspaceMemberLabel: 'Membre de l’espace de travail',
    companyLabel: 'Société',
    selectMember: 'Sélectionner un membre',
    selectCompany: 'Sélectionner une société',
    referenceLabel: 'Référence',
    grant: 'Accorder l’accès',
    revoke: 'Révoquer l’accès',
    granted: 'Accès accordé. État du serveur actualisé.',
    revoked: 'Accès révoqué. État du serveur actualisé.',
    currentStateLabel: 'État actuel du serveur',
    currentStateGranted: 'Accordé',
    currentStateGrantedVersion: 'Accordé — version capturée {version}',
    capturedVersionExplanation:
      'La version est capturée lors de l’octroi de l’accès. Une version ultérieure ne s’applique qu’après la révocation et un nouvel octroi de cet accès.',
    currentStateNotGranted: 'Non accordé',
    loading: 'Chargement de l’administration des accès…',
    empty:
      'Aucun membre actif ou aucune société active n’est disponible pour administrer les accès.',
    retry: 'Recharger l’état des accès',
    error: 'L’état des accès n’a pas pu être chargé ou modifié.',
  },
  en: {
    contractEarlyPreparationBundle: 'Company Contract Early Preparation',
    contractEarlyPreparationPrerequisites:
      'Allows Contract drafts before Offer acceptance. Company context, Contract preparation, Company Client read and Offer/Opportunity read remain separately required. Grants no approval or signature rights.',

    eyebrow: 'Access',
    title: 'Company access',
    description:
      'Choose an active Workspace member, an active Company and one approved access bundle. The displayed state is always reloaded from the server.',
    bundleLabel: 'Access bundle',
    documentProjectOrganizerBundle: 'Company Document Project Organizer',
    documentRegistrarBundle: 'Company Document Registrar',
    documentApproverBundle: 'Company Document Approver',
    documentApproverPrerequisites:
      'Company Document Approver v1 grants only the designation of a draft Document Version as official. Company context, Document and reference read, and Client read must already be authorized separately, for example through Company Document Registrar.',
    companyContextBundle: 'Company Context Access',
    projectBundle: 'Company Project Access',
    commercialIntakeBundle: 'Company Commercial Intake',
    serviceCatalogueBundle: 'Company Service Catalogue',
    pricingConfigurationBundle: 'Company Pricing Configuration',
    pricingConfigurationPrerequisites:
      'Company Pricing Configuration v1 grants offering read and pricing configuration only: reading and publishing illustrative Pricing Rule Versions and Tariff Versions. Company context must already be authorized separately.',
    commercialActivityReaderBundle: 'Company Commercial Activity Reader',
    commercialActivityReaderPrerequisites:
      'Company Commercial Activity Reader v1 grants commercial Activity Log read only. Company context and the commercial target read of each event must already be authorized separately.',
    projectApproverBundle: 'Company Project Approver',
    projectApproverPrerequisites:
      'Changes the Project lifecycle only; Project and Client read are authorized separately.',
    pricingUserBundle: 'Company Pricing User',
    pricingUserPrerequisites:
      'Company Pricing User v1 grants read-only access to offerings and the Pricing configuration; it grants no publication. Company context must already be authorized separately.',
    offerPreparerBundle: 'Company Offer Preparer',
    contractPreparerBundle: 'Company Contract Preparer',
    contractPreparerPrerequisites:
      'Company Contract Preparer v1 grants Contract read, preparation and Project linking. Company context and Opportunity read must be authorized separately. Creating from an Offer requires that Offer’s read; creating a Version and naming an entity for a direct Contract require Client read and an active Client–Company relationship. Choosing a Pricing Snapshot requires its separate read permission. Linking requires Project read; creating a Project additionally requires Project creation and the Project’s Client read. Later Contract reads do not universally require Offer or Client read. The bundle grants no Offer, Client, Pricing or Project authority.',
    offerApproverBundle: 'Company Offer Approver',
    offerApproverPrerequisites:
      'Company Offer Approver v1 grants Offer read, internal decisions and recorded simulated Client response. Company context and Opportunity read must be authorized separately. It grants no preparation, Client or Pricing authority.',
    offerPreparerPrerequisites:
      'Company Offer Preparer v1 grants Offer read and preparation, recorded simulated transmission and read of the exact referenced Pricing Snapshot. Company context and Opportunity read must be authorized separately; naming a Client Legal Entity additionally requires Client read. It grants no pricing calculation or adjustment, Client, approval or Contract authority.',
    opportunityManagerBundle: 'Company Opportunity Manager',
    opportunityManagerPrerequisites:
      'Company Opportunity Manager v2 changes the responsible actor and the outcome status; Company context and Commercial Intake read are authorized separately.',
    pricingAdjustmentBundle: 'Company Pricing Adjustment',
    pricingAdjustmentPrerequisites:
      'Company Pricing Adjustment v1 grants only the application of a fixed net discount during a Pricing calculation. Company context, Opportunity visibility and Company Pricing User access must already be authorized separately.',
    taskManagerBundle: 'Company Task Manager',
    taskManagerPrerequisites:
      'Company Task Manager v1 grants Task read and management only. Company context, Project read and Client read must already be authorized separately.',
    directorClientBundle: 'Company Director Client Access',
    workspaceMemberLabel: 'Workspace member',
    companyLabel: 'Company',
    selectMember: 'Select a member',
    selectCompany: 'Select a Company',
    referenceLabel: 'Reference',
    grant: 'Grant access',
    revoke: 'Revoke access',
    granted: 'Access granted. Server state refreshed.',
    revoked: 'Access revoked. Server state refreshed.',
    currentStateLabel: 'Current server state',
    currentStateGranted: 'Granted',
    currentStateGrantedVersion: 'Granted — captured version {version}',
    capturedVersionExplanation:
      'The version is captured when access is granted. A later version applies only after this access is revoked and granted again.',
    currentStateNotGranted: 'Not granted',
    loading: 'Loading access administration…',
    empty:
      'No active member or Company is available for access administration.',
    retry: 'Retry access state',
    error: 'The access state could not be loaded or changed.',
  },
});

export function useCompanyAssignmentCopy() {
  return useMessages(companyAssignmentMessages);
}
