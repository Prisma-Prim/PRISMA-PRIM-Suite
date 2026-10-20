import { defineMessages, useMessages } from '../localization/messages';

// Only global-ledger narration belongs here. Existing feature Activity hooks
// retain their catalogs and required coverage. Canonical codes are message keys,
// never a display fallback or an authorization decision.
const keys = [
  'responseAccepted',
  'responseRejected',
  'responseExpired',
  'eyebrow',
  'title',
  'loading',
  'error',
  'empty',
  'target',
  'resolver',
  'unionTarget',
  'documentTarget',
  'projectTarget',
  'taskTarget',
  'requestTarget',
  'opportunityTarget',
  'openRequest',
  'openOffer',
  'openContract',
  'offerVersion',
  'contractVersion',
  'contractKind',
  'precontractKind',
  'addendumKind',
  'simulated',
  'linkedProject',
  'createdProject',
  'responsibleChange',
  'change',
  'lossChange',
  'lifecycleActivated',
  'lifecycleActivatedException',
  'lifecycleResumed',
  'lifecycleOnHold',
  'lifecycleCompleted',
  'lifecycleCancelled',
  'internal_user.provisioned',
  'workspace_membership.suspended',
  'workspace_sessions.revoked',
  'workspace_sessions.revocation_retry_required',
  'company.registered',
  'project.created',
  'project.responsible.changed',
  'task.created',
  'task.updated',
  'task.status.changed',
  'task.completed',
  'task.cancelled',
  'task.reopened',
  'document.registered',
  'document.corrected',
  'document.version.drafted',
  'document.version.designated_official',
  'document.representation.added',
  'document.representation.removed',
  'document.project.linked',
  'document.project.unlinked',
  'client.created',
  'client.corrected',
  'client_company_relationship.established',
  'client_legal_entity.registered',
  'client_legal_entity.corrected',
  'client.union_confirmed',
  'client.union_reversed',
  'client_request.created',
  'client_request.client_associated',
  'opportunity.created',
  'opportunity.next_action.updated',
  'opportunity.responsible.changed',
  'opportunity.outcome.changed',
  'offer.created',
  'offer_version.created',
  'offer_version.approved',
  'offer_version.rejected',
  'offer_version.transmission_recorded',
  'offer_version.client_response_recorded',
  'contract.created',
  'contract_version.created',
  'contract_version.approved',
  'contract_version.rejected',
  'contract_version.signature_recorded',
  'contract_project.linked',
  'company_complaints_reader_assignment.granted',
  'company_complaints_reader_assignment.revoked',
  'company_complaints_recorder_assignment.granted',
  'company_complaints_recorder_assignment.revoked',
  'company_task_manager_assignment.granted',
  'company_task_manager_assignment.revoked',
  'company_project_assignment.granted',
  'company_project_assignment.revoked',
  'company_commercial_intake_assignment.granted',
  'company_commercial_intake_assignment.revoked',
  'company_service_catalogue_assignment.granted',
  'company_service_catalogue_assignment.revoked',
  'company_pricing_configuration_assignment.granted',
  'company_pricing_configuration_assignment.revoked',
  'company_pricing_user_assignment.granted',
  'company_pricing_user_assignment.revoked',
  'company_offer_preparer_assignment.granted',
  'company_offer_preparer_assignment.revoked',
  'company_offer_approver_assignment.granted',
  'company_offer_approver_assignment.revoked',
  'company_pricing_adjustment_assignment.granted',
  'company_pricing_adjustment_assignment.revoked',
  'company_commercial_activity_reader_assignment.granted',
  'company_commercial_activity_reader_assignment.revoked',
  'company_opportunity_manager_assignment.granted',
  'company_opportunity_manager_assignment.revoked',
  'company_project_approver_assignment.granted',
  'company_project_approver_assignment.revoked',
  'company_context_assignment.granted',
  'company_context_assignment.revoked',
  'company_director_client_assignment.granted',
  'company_director_client_assignment.revoked',
  'company_document_project_organizer_assignment.granted',
  'company_document_project_organizer_assignment.revoked',
  'company_document_registrar_assignment.granted',
  'company_document_registrar_assignment.revoked',
  'company_document_approver_assignment.granted',
  'company_document_approver_assignment.revoked',
] as const;

export const activityLogMessages = defineMessages(keys, {
  en: {
    'company_complaints_reader_assignment.granted':
      'granted Company Complaints Reader',
    'company_complaints_reader_assignment.revoked':
      'revoked Company Complaints Reader',
    'company_complaints_recorder_assignment.granted':
      'granted Company Complaints Recorder',
    'company_complaints_recorder_assignment.revoked':
      'revoked Company Complaints Recorder',
    responseAccepted: 'Accepted',
    responseRejected: 'Rejected by the Client',
    responseExpired: 'Expired',
    eyebrow: 'Accountability',
    title: 'Activity Log',
    loading: 'Loading activity…',
    error: 'We could not load the Activity Log. Please try again.',
    empty: 'No activity has been recorded in this workspace yet.',
    target: 'Target: {value}',
    resolver: 'Authorized resolver',
    unionTarget: 'Governed Client union',
    documentTarget: 'Working Document',
    projectTarget: 'Project',
    taskTarget: 'Task',
    requestTarget: 'Client Request',
    opportunityTarget: 'Opportunity',
    openRequest: 'Open Request',
    openOffer: 'Open Offer Version',
    openContract: 'Open agreement version',
    offerVersion: 'Illustrative Offer {reference} · version {version}',
    contractVersion: 'Illustrative {kind} {reference} · version {version}',
    contractKind: 'Contract',
    precontractKind: 'Precontract',
    addendumKind: 'Addendum',
    simulated: 'Simulated',
    linkedProject: 'Project: {title}',
    createdProject: 'Created Project: {title}',
    responsibleChange: 'from {before} to {after}',
    change: '({before} → {after})',
    lossChange: '({before} → {after}: {loss})',
    lifecycleActivated: 'activated a Project',
    lifecycleActivatedException: 'activated a Project with a start exception',
    lifecycleResumed: 'resumed a Project',
    lifecycleOnHold: 'put a Project on hold',
    lifecycleCompleted: 'completed a Project',
    lifecycleCancelled: 'cancelled a Project',
    'internal_user.provisioned': 'was provisioned',
    'workspace_membership.suspended': 'suspended Workspace access for',
    'workspace_sessions.revoked': 'revoked existing provider sessions for',
    'workspace_sessions.revocation_retry_required':
      'recorded a required provider-session retry for',
    'company.registered': 'registered a Company',
    'project.created': 'created a preparatory Project',
    'project.responsible.changed':
      'changed the responsible member of a Project',
    'task.created': 'created a Task',
    'task.updated': 'updated a Task',
    'task.status.changed': "changed a Task's status",
    'task.completed': 'declared a Task done',
    'task.cancelled': 'cancelled a Task',
    'task.reopened': 'reopened a Task',
    'document.registered': 'registered a working Document reference',
    'document.corrected': 'corrected a working Document reference',
    'document.version.drafted': 'started a new draft Document Version',
    'document.version.designated_official':
      'designated an official Document Version',
    'document.representation.added': 'added a Document reference',
    'document.representation.removed': 'removed a draft Document reference',
    'document.project.linked': 'attached a working Document to a Project',
    'document.project.unlinked': 'removed a working Document from a Project',
    'client.created': 'created a Client',
    'client.corrected': 'corrected a Client dossier',
    'client_company_relationship.established': 'linked a Client to a Company',
    'client_legal_entity.registered': 'recorded a Client legal entity',
    'client_legal_entity.corrected': 'corrected a Client legal entity',
    'client.union_confirmed': 'confirmed a Client union',
    'client.union_reversed': 'reversed a Client union',
    'client_request.created': 'captured a Client Request',
    'client_request.client_associated': 'associated a Client with a Request',
    'opportunity.created': 'created an initial Opportunity',
    'opportunity.next_action.updated': 'updated an Opportunity next action',
    'opportunity.responsible.changed':
      'changed the responsible actor of an Opportunity',
    'opportunity.outcome.changed': 'changed the status of an Opportunity',
    'offer.created': 'created an illustrative Offer',
    'offer_version.created': 'created an Offer Version',
    'offer_version.approved': 'approved an Offer Version',
    'offer_version.rejected': 'rejected an Offer Version',
    'offer_version.transmission_recorded':
      'recorded the transmission of an Offer Version',
    'offer_version.client_response_recorded':
      'recorded the Client response to an Offer Version',
    'contract.created': 'created an illustrative agreement',
    'contract_version.created': 'created an agreement version',
    'contract_version.approved': 'approved an agreement version',
    'contract_version.rejected': 'rejected an agreement version',
    'contract_version.signature_recorded':
      'recorded the signature of an agreement version',
    'contract_project.linked': 'linked a Project to an agreement',
    'company_task_manager_assignment.granted': 'granted Company Task Manager',
    'company_task_manager_assignment.revoked': 'revoked Company Task Manager',
    'company_project_assignment.granted': 'granted Company Project Access',
    'company_project_assignment.revoked': 'revoked Company Project Access',
    'company_commercial_intake_assignment.granted':
      'granted Company Commercial Intake',
    'company_commercial_intake_assignment.revoked':
      'revoked Company Commercial Intake',
    'company_service_catalogue_assignment.granted':
      'granted Company Service Catalogue',
    'company_service_catalogue_assignment.revoked':
      'revoked Company Service Catalogue',
    'company_pricing_configuration_assignment.granted':
      'granted Company Pricing Configuration',
    'company_pricing_configuration_assignment.revoked':
      'revoked Company Pricing Configuration',
    'company_pricing_user_assignment.granted': 'granted Company Pricing User',
    'company_pricing_user_assignment.revoked': 'revoked Company Pricing User',
    'company_offer_preparer_assignment.granted':
      'granted Company Offer Preparer',
    'company_offer_preparer_assignment.revoked':
      'revoked Company Offer Preparer',
    'company_offer_approver_assignment.granted':
      'granted Company Offer Approver',
    'company_offer_approver_assignment.revoked':
      'revoked Company Offer Approver',
    'company_pricing_adjustment_assignment.granted':
      'granted Company Pricing Adjustment',
    'company_pricing_adjustment_assignment.revoked':
      'revoked Company Pricing Adjustment',
    'company_commercial_activity_reader_assignment.granted':
      'granted Company Commercial Activity Reader',
    'company_commercial_activity_reader_assignment.revoked':
      'revoked Company Commercial Activity Reader',
    'company_opportunity_manager_assignment.granted':
      'granted Company Opportunity Manager',
    'company_opportunity_manager_assignment.revoked':
      'revoked Company Opportunity Manager',
    'company_project_approver_assignment.granted':
      'granted Company Project Approver',
    'company_project_approver_assignment.revoked':
      'revoked Company Project Approver',
    'company_context_assignment.granted': 'granted Company Context Access',
    'company_context_assignment.revoked': 'revoked Company Context Access',
    'company_director_client_assignment.granted':
      'granted Company Director Client Access',
    'company_director_client_assignment.revoked':
      'revoked Company Director Client Access',
    'company_document_project_organizer_assignment.granted':
      'granted Company Document Project Organizer',
    'company_document_project_organizer_assignment.revoked':
      'revoked Company Document Project Organizer',
    'company_document_registrar_assignment.granted':
      'granted Company Document Registrar',
    'company_document_registrar_assignment.revoked':
      'revoked Company Document Registrar',
    'company_document_approver_assignment.granted':
      'granted Company Document Approver',
    'company_document_approver_assignment.revoked':
      'revoked Company Document Approver',
  },
  ro: {
    'company_complaints_reader_assignment.granted':
      'a acordat citirea reclamațiilor Companiei',
    'company_complaints_reader_assignment.revoked':
      'a revocat citirea reclamațiilor Companiei',
    'company_complaints_recorder_assignment.granted':
      'a acordat înregistrarea reclamațiilor Companiei',
    'company_complaints_recorder_assignment.revoked':
      'a revocat înregistrarea reclamațiilor Companiei',
    responseAccepted: 'Acceptată',
    responseRejected: 'Respinsă de Client',
    responseExpired: 'Expirată',
    eyebrow: 'Responsabilitate',
    title: 'Jurnal de activitate',
    loading: 'Se încarcă activitatea…',
    error: 'Jurnalul de activitate nu a putut fi încărcat. Încercați din nou.',
    empty:
      'În acest spațiu de lucru nu este încă înregistrată nicio activitate.',
    target: 'Țintă: {value}',
    resolver: 'Responsabil autorizat pentru unificare',
    unionTarget: 'Unificare controlată a Clienților',
    documentTarget: 'Document de lucru',
    projectTarget: 'Proiect',
    taskTarget: 'Sarcină',
    requestTarget: 'Cerere a clientului',
    opportunityTarget: 'Oportunitate',
    openRequest: 'Deschideți cererea',
    openOffer: 'Deschideți versiunea ofertei',
    openContract: 'Deschideți versiunea acordului',
    offerVersion: 'Ofertă ilustrativă {reference} · versiunea {version}',
    contractVersion: '{kind} ilustrativ {reference} · versiunea {version}',
    contractKind: 'Contract',
    precontractKind: 'Precontract',
    addendumKind: 'Act adițional',
    simulated: 'Simulat',
    linkedProject: 'Proiect: {title}',
    createdProject: 'Proiect creat: {title}',
    responsibleChange: 'de la {before} la {after}',
    change: '({before} → {after})',
    lossChange: '({before} → {after}: {loss})',
    lifecycleActivated: 'a activat un Proiect',
    lifecycleActivatedException:
      'a activat un Proiect cu o excepție de începere',
    lifecycleResumed: 'a reluat un Proiect',
    lifecycleOnHold: 'a suspendat un Proiect',
    lifecycleCompleted: 'a finalizat un Proiect',
    lifecycleCancelled: 'a anulat un Proiect',
    'internal_user.provisioned': '— identitate creată',
    'workspace_membership.suspended':
      'a suspendat accesul la spațiul de lucru pentru',
    'workspace_sessions.revoked':
      'a revocat sesiunile existente ale furnizorului pentru',
    'workspace_sessions.revocation_retry_required':
      'a înregistrat necesitatea reîncercării revocării sesiunilor pentru',
    'company.registered': 'a înregistrat o Companie',
    'project.created': 'a creat un Proiect pregătitor',
    'project.responsible.changed':
      'a modificat membrul responsabil al unui Proiect',
    'task.created': 'a creat o Sarcină',
    'task.updated': 'a actualizat o Sarcină',
    'task.status.changed': 'a modificat starea unei Sarcini',
    'task.completed': 'a declarat o Sarcină încheiată',
    'task.cancelled': 'a anulat o Sarcină',
    'task.reopened': 'a redeschis o Sarcină',
    'document.registered': 'a înregistrat o referință de Document de lucru',
    'document.corrected': 'a corectat o referință de Document de lucru',
    'document.version.drafted': 'a creat o versiune ciornă a Documentului',
    'document.version.designated_official':
      'a desemnat o versiune oficială a Documentului',
    'document.representation.added': 'a adăugat o reprezentare a Documentului',
    'document.representation.removed':
      'a eliminat o reprezentare a Documentului',
    'document.project.linked': 'a asociat un Document de lucru cu un Proiect',
    'document.project.unlinked':
      'a eliminat asocierea unui Document de lucru cu un Proiect',
    'client.created': 'a creat un Client',
    'client.corrected': 'a corectat un dosar Client',
    'client_company_relationship.established':
      'a asociat un Client cu o Companie',
    'client_legal_entity.registered':
      'a înregistrat o entitate juridică a Clientului',
    'client_legal_entity.corrected':
      'a corectat o entitate juridică a Clientului',
    'client.union_confirmed': 'a confirmat unificarea Clienților',
    'client.union_reversed': 'a inversat unificarea Clienților',
    'client_request.created': 'a înregistrat o cerere a clientului',
    'client_request.client_associated': 'a asociat un Client cu o cerere',
    'opportunity.created': 'a creat o Oportunitate inițială',
    'opportunity.next_action.updated':
      'a actualizat acțiunea următoare a unei Oportunități',
    'opportunity.responsible.changed':
      'a modificat responsabilul unei Oportunități',
    'opportunity.outcome.changed': 'a modificat starea unei Oportunități',
    'offer.created': 'a creat o Ofertă ilustrativă',
    'offer_version.created': 'a creat o versiune a Ofertei',
    'offer_version.approved': 'a aprobat o versiune a Ofertei',
    'offer_version.rejected': 'a respins o versiune a Ofertei',
    'offer_version.transmission_recorded':
      'a înregistrat transmiterea unei versiuni a Ofertei',
    'offer_version.client_response_recorded':
      'a înregistrat răspunsul Clientului la o versiune a Ofertei',
    'contract.created': 'a creat un acord ilustrativ',
    'contract_version.created': 'a creat o versiune a acordului',
    'contract_version.approved': 'a aprobat o versiune a acordului',
    'contract_version.rejected': 'a respins o versiune a acordului',
    'contract_version.signature_recorded':
      'a înregistrat semnarea unei versiuni a acordului',
    'contract_project.linked': 'a asociat un Proiect cu un acord',
    'company_task_manager_assignment.granted':
      'a acordat Administrare Sarcini a Companiei',
    'company_task_manager_assignment.revoked':
      'a revocat Administrare Sarcini a Companiei',
    'company_project_assignment.granted':
      'a acordat Acces la Proiectele Companiei',
    'company_project_assignment.revoked':
      'a revocat Acces la Proiectele Companiei',
    'company_commercial_intake_assignment.granted':
      'a acordat Preluare comercială a Companiei',
    'company_commercial_intake_assignment.revoked':
      'a revocat Preluare comercială a Companiei',
    'company_service_catalogue_assignment.granted':
      'a acordat Catalog de servicii al Companiei',
    'company_service_catalogue_assignment.revoked':
      'a revocat Catalog de servicii al Companiei',
    'company_pricing_configuration_assignment.granted':
      'a acordat Configurare prețuri a Companiei',
    'company_pricing_configuration_assignment.revoked':
      'a revocat Configurare prețuri a Companiei',
    'company_pricing_user_assignment.granted':
      'a acordat Utilizare prețuri a Companiei',
    'company_pricing_user_assignment.revoked':
      'a revocat Utilizare prețuri a Companiei',
    'company_offer_preparer_assignment.granted':
      'a acordat Pregătire Oferte a Companiei',
    'company_offer_preparer_assignment.revoked':
      'a revocat Pregătire Oferte a Companiei',
    'company_offer_approver_assignment.granted':
      'a acordat Aprobare Oferte a Companiei',
    'company_offer_approver_assignment.revoked':
      'a revocat Aprobare Oferte a Companiei',
    'company_pricing_adjustment_assignment.granted':
      'a acordat Ajustare prețuri a Companiei',
    'company_pricing_adjustment_assignment.revoked':
      'a revocat Ajustare prețuri a Companiei',
    'company_commercial_activity_reader_assignment.granted':
      'a acordat Citire activitate comercială a Companiei',
    'company_commercial_activity_reader_assignment.revoked':
      'a revocat Citire activitate comercială a Companiei',
    'company_opportunity_manager_assignment.granted':
      'a acordat Administrare Oportunități a Companiei',
    'company_opportunity_manager_assignment.revoked':
      'a revocat Administrare Oportunități a Companiei',
    'company_project_approver_assignment.granted':
      'a acordat Aprobare Proiecte a Companiei',
    'company_project_approver_assignment.revoked':
      'a revocat Aprobare Proiecte a Companiei',
    'company_context_assignment.granted':
      'a acordat Acces la contextul Companiei',
    'company_context_assignment.revoked':
      'a revocat Acces la contextul Companiei',
    'company_director_client_assignment.granted':
      'a acordat Acces Director la Clienții Companiei',
    'company_director_client_assignment.revoked':
      'a revocat Acces Director la Clienții Companiei',
    'company_document_project_organizer_assignment.granted':
      'a acordat Asociere Documente–Proiecte a Companiei',
    'company_document_project_organizer_assignment.revoked':
      'a revocat Asociere Documente–Proiecte a Companiei',
    'company_document_registrar_assignment.granted':
      'a acordat Înregistrare Documente a Companiei',
    'company_document_registrar_assignment.revoked':
      'a revocat Înregistrare Documente a Companiei',
    'company_document_approver_assignment.granted':
      'a acordat Aprobare Documente a Companiei',
    'company_document_approver_assignment.revoked':
      'a revocat Aprobare Documente a Companiei',
  },
  ru: {
    'company_complaints_reader_assignment.granted':
      '— предоставление права: Чтение жалоб Компании',
    'company_complaints_reader_assignment.revoked':
      '— отзыв права: Чтение жалоб Компании',
    'company_complaints_recorder_assignment.granted':
      '— предоставление права: Регистрация жалоб Компании',
    'company_complaints_recorder_assignment.revoked':
      '— отзыв права: Регистрация жалоб Компании',
    responseAccepted: 'Принято',
    responseRejected: 'Отклонено Клиентом',
    responseExpired: 'Срок истёк',
    eyebrow: 'Ответственность',
    title: 'Журнал действий',
    loading: 'Загрузка действий…',
    error: 'Не удалось загрузить журнал действий. Повторите попытку.',
    empty: 'В этом рабочем пространстве пока нет записанных действий.',
    target: 'Объект: {value}',
    resolver: 'Уполномоченная сторона объединения',
    unionTarget: 'Управляемое объединение Клиентов',
    documentTarget: 'Рабочий Документ',
    projectTarget: 'Проект',
    taskTarget: 'Задача',
    requestTarget: 'Запрос Клиента',
    opportunityTarget: 'Возможность',
    openRequest: 'Открыть запрос',
    openOffer: 'Открыть версию Оферты',
    openContract: 'Открыть версию соглашения',
    offerVersion: 'Иллюстративная Оферта {reference} · версия {version}',
    contractVersion: 'Иллюстративный {kind} {reference} · версия {version}',
    contractKind: 'Договор',
    precontractKind: 'Предварительный договор',
    addendumKind: 'Дополнительное соглашение',
    simulated: 'Симуляция',
    linkedProject: 'Проект: {title}',
    createdProject: 'Созданный Проект: {title}',
    responsibleChange: 'с {before} на {after}',
    change: '({before} → {after})',
    lossChange: '({before} → {after}: {loss})',
    lifecycleActivated: '— активация Проекта',
    lifecycleActivatedException:
      '— активация Проекта с исключением при запуске',
    lifecycleResumed: '— возобновление Проекта',
    lifecycleOnHold: '— приостановка Проекта',
    lifecycleCompleted: '— завершение Проекта',
    lifecycleCancelled: '— отмена Проекта',
    'internal_user.provisioned': '— создание идентификационной записи',
    'workspace_membership.suspended':
      '— приостановка доступа к рабочему пространству для',
    'workspace_sessions.revoked': '— отзыв существующих сеансов поставщика для',
    'workspace_sessions.revocation_retry_required':
      '— регистрация необходимости повторного отзыва сеансов для',
    'company.registered': '— регистрация Компании',
    'project.created': '— создание подготовительного Проекта',
    'project.responsible.changed':
      '— изменение ответственного участника Проекта',
    'task.created': '— создание Задачи',
    'task.updated': '— обновление Задачи',
    'task.status.changed': '— изменение состояния Задачи',
    'task.completed': '— декларация выполнения Задачи',
    'task.cancelled': '— отмена Задачи',
    'task.reopened': '— повторное открытие Задачи',
    'document.registered': '— регистрация ссылки на рабочий Документ',
    'document.corrected': '— исправление ссылки на рабочий Документ',
    'document.version.drafted': '— создание черновика Версии Документа',
    'document.version.designated_official':
      '— назначение официальной Версии Документа',
    'document.representation.added': '— добавление представления Документа',
    'document.representation.removed': '— удаление представления Документа',
    'document.project.linked': '— связывание рабочего Документа с Проектом',
    'document.project.unlinked': '— снятие связи рабочего Документа с Проектом',
    'client.created': '— создание Клиента',
    'client.corrected': '— исправление досье Клиента',
    'client_company_relationship.established':
      '— связывание Клиента с Компанией',
    'client_legal_entity.registered': '— регистрация юридического лица Клиента',
    'client_legal_entity.corrected': '— исправление юридического лица Клиента',
    'client.union_confirmed': '— подтверждение объединения Клиентов',
    'client.union_reversed': '— отмена объединения Клиентов',
    'client_request.created': '— регистрация запроса Клиента',
    'client_request.client_associated': '— связывание Клиента с запросом',
    'opportunity.created': '— создание исходной Возможности',
    'opportunity.next_action.updated':
      '— обновление следующего действия Возможности',
    'opportunity.responsible.changed':
      '— изменение ответственной стороны Возможности',
    'opportunity.outcome.changed': '— изменение статуса Возможности',
    'offer.created': '— создание иллюстративной Оферты',
    'offer_version.created': '— создание Версии Оферты',
    'offer_version.approved': '— внутреннее одобрение Версии Оферты',
    'offer_version.rejected': '— внутреннее отклонение Версии Оферты',
    'offer_version.transmission_recorded':
      '— регистрация передачи Версии Оферты',
    'offer_version.client_response_recorded':
      '— регистрация ответа Клиента на Версию Оферты',
    'contract.created': '— создание иллюстративного соглашения',
    'contract_version.created': '— создание версии соглашения',
    'contract_version.approved': '— внутреннее одобрение версии соглашения',
    'contract_version.rejected': '— внутреннее отклонение версии соглашения',
    'contract_version.signature_recorded':
      '— регистрация подписи версии соглашения',
    'contract_project.linked': '— связывание Проекта с соглашением',
    'company_task_manager_assignment.granted':
      '— предоставление права: Управление Задачами Компании',
    'company_task_manager_assignment.revoked':
      '— отзыв права: Управление Задачами Компании',
    'company_project_assignment.granted':
      '— предоставление права: Доступ к Проектам Компании',
    'company_project_assignment.revoked':
      '— отзыв права: Доступ к Проектам Компании',
    'company_commercial_intake_assignment.granted':
      '— предоставление права: Коммерческий приём Компании',
    'company_commercial_intake_assignment.revoked':
      '— отзыв права: Коммерческий приём Компании',
    'company_service_catalogue_assignment.granted':
      '— предоставление права: Каталог услуг Компании',
    'company_service_catalogue_assignment.revoked':
      '— отзыв права: Каталог услуг Компании',
    'company_pricing_configuration_assignment.granted':
      '— предоставление права: Настройка ценообразования Компании',
    'company_pricing_configuration_assignment.revoked':
      '— отзыв права: Настройка ценообразования Компании',
    'company_pricing_user_assignment.granted':
      '— предоставление права: Использование ценообразования Компании',
    'company_pricing_user_assignment.revoked':
      '— отзыв права: Использование ценообразования Компании',
    'company_offer_preparer_assignment.granted':
      '— предоставление права: Подготовка Оферт Компании',
    'company_offer_preparer_assignment.revoked':
      '— отзыв права: Подготовка Оферт Компании',
    'company_offer_approver_assignment.granted':
      '— предоставление права: Одобрение Оферт Компании',
    'company_offer_approver_assignment.revoked':
      '— отзыв права: Одобрение Оферт Компании',
    'company_pricing_adjustment_assignment.granted':
      '— предоставление права: Корректировка цены Компании',
    'company_pricing_adjustment_assignment.revoked':
      '— отзыв права: Корректировка цены Компании',
    'company_commercial_activity_reader_assignment.granted':
      '— предоставление права: Чтение коммерческих действий Компании',
    'company_commercial_activity_reader_assignment.revoked':
      '— отзыв права: Чтение коммерческих действий Компании',
    'company_opportunity_manager_assignment.granted':
      '— предоставление права: Управление Возможностями Компании',
    'company_opportunity_manager_assignment.revoked':
      '— отзыв права: Управление Возможностями Компании',
    'company_project_approver_assignment.granted':
      '— предоставление права: Одобрение Проектов Компании',
    'company_project_approver_assignment.revoked':
      '— отзыв права: Одобрение Проектов Компании',
    'company_context_assignment.granted':
      '— предоставление права: Доступ к контексту Компании',
    'company_context_assignment.revoked':
      '— отзыв права: Доступ к контексту Компании',
    'company_director_client_assignment.granted':
      '— предоставление права: Директорский доступ к Клиентам Компании',
    'company_director_client_assignment.revoked':
      '— отзыв права: Директорский доступ к Клиентам Компании',
    'company_document_project_organizer_assignment.granted':
      '— предоставление права: Связывание Документов и Проектов Компании',
    'company_document_project_organizer_assignment.revoked':
      '— отзыв права: Связывание Документов и Проектов Компании',
    'company_document_registrar_assignment.granted':
      '— предоставление права: Регистрация Документов Компании',
    'company_document_registrar_assignment.revoked':
      '— отзыв права: Регистрация Документов Компании',
    'company_document_approver_assignment.granted':
      '— предоставление права: Одобрение Документов Компании',
    'company_document_approver_assignment.revoked':
      '— отзыв права: Одобрение Документов Компании',
  },
  fr: {
    'company_complaints_reader_assignment.granted':
      'a accordé la lecture des réclamations de la Compagnie',
    'company_complaints_reader_assignment.revoked':
      'a révoqué la lecture des réclamations de la Compagnie',
    'company_complaints_recorder_assignment.granted':
      'a accordé l’enregistrement des réclamations de la Compagnie',
    'company_complaints_recorder_assignment.revoked':
      'a révoqué l’enregistrement des réclamations de la Compagnie',
    responseAccepted: 'Acceptée',
    responseRejected: 'Rejetée par le Client',
    responseExpired: 'Expirée',
    eyebrow: 'Traçabilité',
    title: 'Journal d’activité',
    loading: 'Chargement de l’activité…',
    error: 'Le journal d’activité n’a pas pu être chargé. Veuillez réessayer.',
    empty:
      'Aucune activité n’est encore enregistrée dans cet espace de travail.',
    target: 'Cible : {value}',
    resolver: 'Responsable autorisé de la fusion',
    unionTarget: 'Fusion encadrée de Clients',
    documentTarget: 'Document de travail',
    projectTarget: 'Projet',
    taskTarget: 'Tâche',
    requestTarget: 'Demande Client',
    opportunityTarget: 'Opportunité',
    openRequest: 'Ouvrir la demande',
    openOffer: 'Ouvrir la Version de l’Offre',
    openContract: 'Ouvrir la version de l’accord',
    offerVersion: 'Offre illustrative {reference} · version {version}',
    contractVersion: '{kind} illustratif {reference} · version {version}',
    contractKind: 'Contrat',
    precontractKind: 'Précontrat',
    addendumKind: 'Avenant',
    simulated: 'Simulé',
    linkedProject: 'Projet : {title}',
    createdProject: 'Projet créé : {title}',
    responsibleChange: 'de {before} à {after}',
    change: '({before} → {after})',
    lossChange: '({before} → {after} : {loss})',
    lifecycleActivated: 'a activé un Projet',
    lifecycleActivatedException:
      'a activé un Projet avec une exception de démarrage',
    lifecycleResumed: 'a repris un Projet',
    lifecycleOnHold: 'a mis un Projet en pause',
    lifecycleCompleted: 'a terminé un Projet',
    lifecycleCancelled: 'a annulé un Projet',
    'internal_user.provisioned': '— identité créée',
    'workspace_membership.suspended':
      'a suspendu l’accès à l’espace de travail de',
    'workspace_sessions.revoked':
      'a révoqué les sessions existantes du fournisseur de',
    'workspace_sessions.revocation_retry_required':
      'a enregistré une nouvelle tentative nécessaire de révocation des sessions de',
    'company.registered': 'a enregistré une Entreprise',
    'project.created': 'a créé un Projet préparatoire',
    'project.responsible.changed':
      'a modifié le membre responsable d’un Projet',
    'task.created': 'a créé une Tâche',
    'task.updated': 'a mis à jour une Tâche',
    'task.status.changed': 'a modifié l’état d’une Tâche',
    'task.completed': 'a déclaré une Tâche terminée',
    'task.cancelled': 'a annulé une Tâche',
    'task.reopened': 'a rouvert une Tâche',
    'document.registered': 'a enregistré une référence de Document de travail',
    'document.corrected': 'a corrigé une référence de Document de travail',
    'document.version.drafted': 'a créé un brouillon de Version du Document',
    'document.version.designated_official':
      'a désigné une Version officielle du Document',
    'document.representation.added': 'a ajouté une représentation du Document',
    'document.representation.removed':
      'a retiré une représentation du Document',
    'document.project.linked': 'a associé un Document de travail à un Projet',
    'document.project.unlinked':
      'a dissocié un Document de travail d’un Projet',
    'client.created': 'a créé un Client',
    'client.corrected': 'a corrigé un dossier Client',
    'client_company_relationship.established':
      'a associé un Client à une Entreprise',
    'client_legal_entity.registered':
      'a enregistré une entité juridique du Client',
    'client_legal_entity.corrected': 'a corrigé une entité juridique du Client',
    'client.union_confirmed': 'a confirmé une fusion de Clients',
    'client.union_reversed': 'a annulé une fusion de Clients',
    'client_request.created': 'a enregistré une Demande Client',
    'client_request.client_associated': 'a associé un Client à une demande',
    'opportunity.created': 'a créé une Opportunité initiale',
    'opportunity.next_action.updated':
      'a mis à jour la prochaine action d’une Opportunité',
    'opportunity.responsible.changed':
      'a modifié le responsable d’une Opportunité',
    'opportunity.outcome.changed': 'a modifié le statut d’une Opportunité',
    'offer.created': 'a créé une Offre illustrative',
    'offer_version.created': 'a créé une Version de l’Offre',
    'offer_version.approved': 'a approuvé une Version de l’Offre',
    'offer_version.rejected': 'a rejeté une Version de l’Offre',
    'offer_version.transmission_recorded':
      'a enregistré la transmission d’une Version de l’Offre',
    'offer_version.client_response_recorded':
      'a enregistré la réponse du Client à une Version de l’Offre',
    'contract.created': 'a créé un accord illustratif',
    'contract_version.created': 'a créé une version de l’accord',
    'contract_version.approved': 'a approuvé une version de l’accord',
    'contract_version.rejected': 'a rejeté une version de l’accord',
    'contract_version.signature_recorded':
      'a enregistré la signature d’une version de l’accord',
    'contract_project.linked': 'a associé un Projet à un accord',
    'company_task_manager_assignment.granted':
      'a accordé Gestion des Tâches de l’Entreprise',
    'company_task_manager_assignment.revoked':
      'a révoqué Gestion des Tâches de l’Entreprise',
    'company_project_assignment.granted':
      'a accordé Accès aux Projets de l’Entreprise',
    'company_project_assignment.revoked':
      'a révoqué Accès aux Projets de l’Entreprise',
    'company_commercial_intake_assignment.granted':
      'a accordé Traitement commercial de l’Entreprise',
    'company_commercial_intake_assignment.revoked':
      'a révoqué Traitement commercial de l’Entreprise',
    'company_service_catalogue_assignment.granted':
      'a accordé Catalogue de services de l’Entreprise',
    'company_service_catalogue_assignment.revoked':
      'a révoqué Catalogue de services de l’Entreprise',
    'company_pricing_configuration_assignment.granted':
      'a accordé Configuration tarifaire de l’Entreprise',
    'company_pricing_configuration_assignment.revoked':
      'a révoqué Configuration tarifaire de l’Entreprise',
    'company_pricing_user_assignment.granted':
      'a accordé Utilisation tarifaire de l’Entreprise',
    'company_pricing_user_assignment.revoked':
      'a révoqué Utilisation tarifaire de l’Entreprise',
    'company_offer_preparer_assignment.granted':
      'a accordé Préparation des Offres de l’Entreprise',
    'company_offer_preparer_assignment.revoked':
      'a révoqué Préparation des Offres de l’Entreprise',
    'company_offer_approver_assignment.granted':
      'a accordé Approbation des Offres de l’Entreprise',
    'company_offer_approver_assignment.revoked':
      'a révoqué Approbation des Offres de l’Entreprise',
    'company_pricing_adjustment_assignment.granted':
      'a accordé Ajustement tarifaire de l’Entreprise',
    'company_pricing_adjustment_assignment.revoked':
      'a révoqué Ajustement tarifaire de l’Entreprise',
    'company_commercial_activity_reader_assignment.granted':
      'a accordé Lecture de l’activité commerciale de l’Entreprise',
    'company_commercial_activity_reader_assignment.revoked':
      'a révoqué Lecture de l’activité commerciale de l’Entreprise',
    'company_opportunity_manager_assignment.granted':
      'a accordé Gestion des Opportunités de l’Entreprise',
    'company_opportunity_manager_assignment.revoked':
      'a révoqué Gestion des Opportunités de l’Entreprise',
    'company_project_approver_assignment.granted':
      'a accordé Approbation des Projets de l’Entreprise',
    'company_project_approver_assignment.revoked':
      'a révoqué Approbation des Projets de l’Entreprise',
    'company_context_assignment.granted':
      'a accordé Accès au contexte de l’Entreprise',
    'company_context_assignment.revoked':
      'a révoqué Accès au contexte de l’Entreprise',
    'company_director_client_assignment.granted':
      'a accordé Accès du Directeur aux Clients de l’Entreprise',
    'company_director_client_assignment.revoked':
      'a révoqué Accès du Directeur aux Clients de l’Entreprise',
    'company_document_project_organizer_assignment.granted':
      'a accordé Association Documents–Projets de l’Entreprise',
    'company_document_project_organizer_assignment.revoked':
      'a révoqué Association Documents–Projets de l’Entreprise',
    'company_document_registrar_assignment.granted':
      'a accordé Enregistrement des Documents de l’Entreprise',
    'company_document_registrar_assignment.revoked':
      'a révoqué Enregistrement des Documents de l’Entreprise',
    'company_document_approver_assignment.granted':
      'a accordé Approbation des Documents de l’Entreprise',
    'company_document_approver_assignment.revoked':
      'a révoqué Approbation des Documents de l’Entreprise',
  },
});

export function useActivityLogCopy() {
  return useMessages(activityLogMessages);
}
