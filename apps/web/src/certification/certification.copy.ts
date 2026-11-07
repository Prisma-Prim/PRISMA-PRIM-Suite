import { defineMessages, useMessages } from '../localization/messages';

const keys = [
  'readerBundle',
  'managerBundle',
  'readerPrerequisites',
  'managerPrerequisites',
  'readerGranted',
  'readerRevoked',
  'managerGranted',
  'managerRevoked',

  'title',
  'introduction',
  'refresh',
  'loading',
  'caseLoading',
  'empty',
  'total',
  'denied',
  'listUnavailable',
  'unavailable',
  'error',
  'reload',
  'back',
  'saveConfirmed',
  'uncertain',
  'retry',
  'saving',
  'stale',
  'conflict',
  'invalid',
  'readOnly',
  'notProvided',
  'yes',
  'no',
  'cancel',

  'orderReference',
  'legalEntity',
  'status',
  'statusOpen',
  'statusRejected',
  'nextStep',
  'nextApplication',
  'nextApplicationReview',
  'nextDuration',
  'nextNone',
  'openedBy',
  'openedAt',
  'revision',
  'standard',
  'standardValue',
  'auditType',
  'auditTypeValue',

  'openToggle',
  'openTitle',
  'openHelp',
  'selectLegalEntity',
  'legalEntitiesLoading',
  'legalEntitiesEmpty',
  'legalEntitiesUnavailable',
  'openSubmit',
  'openValidation',
  'referenceTaken',
  'entityUnavailable',
  'taxId',

  'caseHeading',
  'steps',
  'stepApplication',
  'stepReview',
  'stepDuration',
  'stepRecorded',
  'stepToRecord',
  'stepWaiting',
  'stepAccepted',
  'stepRejected',
  'stepNotAvailable',
  'stepClosed',

  'applicationTitle',
  'applicationMissing',
  'version',
  'recordedBy',
  'recordedAt',
  'correctionReason',
  'declaredLegalName',
  'declaredAddress',
  'sites',
  'site',
  'siteAddress',
  'siteActivity',
  'addSite',
  'removeSite',
  'requestedScope',
  'foodChainSubcategories',
  'haccpStudyCount',
  'totalHeadcount',
  'effectiveFte',
  'effectiveFteHelp',
  'shiftCount',
  'seasonalActivity',
  'otherCertifiedSystems',
  'outsourcedProcesses',
  'optional',
  'consultant',
  'consultantUsed',
  'consultantName',
  'consultantNone',
  'auditLanguages',
  'auditLanguage',
  'addLanguage',
  'removeLanguage',
  'preferredAuditPeriod',
  'recordApplication',
  'correctApplication',
  'saveCorrection',
  'correctionHelp',
  'applicationValidation',
  'reasonRequired',

  'reviewTitle',
  'reviewMissing',
  'reviewHelp',
  'scopeCertifiable',
  'competentTeamAvailable',
  'competentDecisionMakerAvailable',
  'risksAcceptable',
  'note',
  'outcome',
  'outcomeAccept',
  'outcomeReject',
  'accepted',
  'rejected',
  'rejectionReason',
  'recordReview',
  'reviewValidation',
  'criteriaNotMet',

  'blockedReviewBeforeApplication',
  'blockedApplicationReviewed',
  'blockedAlreadyReviewed',
  'blockedClosed',
  'blockedCorrectionReason',
  'nextDurationPending',

  'timelineTitle',
  'timelineEmpty',
  'timelineApplication',
  'timelineReview',
  'showValues',
] as const;

export type CertificationMessageKey = (typeof keys)[number];

export const certificationMessages = defineMessages(keys, {
  en: {
    readerBundle: 'Company Certification Reader',
    managerBundle: 'Company Certification Programme Manager',
    readerPrerequisites:
      'A Certification Reader also needs access to the Project and to its Client in this Company.',
    managerPrerequisites:
      'A Certification Programme Manager acts only while also holding Company Certification Reader in the same Company.',
    readerGranted: 'granted Certification Reader',
    readerRevoked: 'revoked Certification Reader',
    managerGranted: 'granted Certification Programme Manager',
    managerRevoked: 'revoked Certification Programme Manager',

    title: 'Certification',
    introduction:
      'Certification Cases of this Project: the client’s application and its review, with every recorded version.',
    refresh: 'Refresh Certification Cases',
    loading: 'Loading Certification Cases…',
    caseLoading: 'Loading the Certification Case…',
    empty: 'No Certification Case is open in this Project.',
    total: 'Certification Cases',
    denied:
      'Certification access is unavailable. Your current authority is being checked.',
    listUnavailable: 'The Certification Cases of this Project are unavailable.',
    unavailable: 'This Certification Case is unavailable.',
    error: 'This read failed. Refresh before treating this page as current.',
    reload: 'Reload Case',
    back: 'Back to Certification Cases',
    saveConfirmed:
      'Saved. The confirmed result remains recorded even if a later refresh fails.',
    uncertain:
      'The save could not be confirmed. It may already be recorded. Retry unchanged to recover the result.',
    retry: 'Retry unchanged save',
    saving: 'Saving…',
    stale:
      'This Case changed since you opened it. Reload it before saving; your draft is kept.',
    conflict:
      'This save identity conflicts with another intent. Reload the Case and review it before saving again.',
    invalid:
      'The server refused these values. Check every field against its limits.',
    readOnly:
      'You can consult this Case. Recording a step requires Company Certification Programme Manager.',
    notProvided: 'Not provided',
    yes: 'Yes',
    no: 'No',
    cancel: 'Cancel',

    orderReference: 'Order reference',
    legalEntity: 'Client legal entity',
    status: 'Status',
    statusOpen: 'Open',
    statusRejected: 'Closed — application rejected',
    nextStep: 'Next step',
    nextApplication: 'Record the application',
    nextApplicationReview: 'Review the application',
    nextDuration: 'Audit duration',
    nextNone: 'None',
    openedBy: 'Opened by',
    openedAt: 'Opened on',
    revision: 'Revision',
    standard: 'Standard',
    standardValue: 'ISO 22000:2018',
    auditType: 'Audit type',
    auditTypeValue: 'Initial certification',

    openToggle: 'Open a Certification Case',
    openTitle: 'Open a Certification Case',
    openHelp:
      'ISO 22000:2018 initial certification for one legal entity of this Project’s Client.',
    selectLegalEntity: 'Select a legal entity',
    legalEntitiesLoading: 'Loading the Client’s legal entities…',
    legalEntitiesEmpty:
      'This Project’s Client has no legal entity yet. Add one in the Client dossier first.',
    legalEntitiesUnavailable:
      'The Client’s legal entities could not be loaded. Try again.',
    openSubmit: 'Open Certification Case',
    openValidation:
      'Choose a legal entity and enter an order reference of at most 64 characters.',
    referenceTaken:
      'This order reference is already used in this Company. Enter another one.',
    entityUnavailable:
      'This legal entity is not available for this Project’s Client. Reload the list and choose again.',
    taxId: 'IDNO / tax code',

    caseHeading: 'Certification Case {reference}',
    steps: 'Steps',
    stepApplication: 'Application',
    stepReview: 'Application review',
    stepDuration: 'Audit duration',
    stepRecorded: 'Recorded — version {version}',
    stepToRecord: 'To record',
    stepWaiting: 'Waits for the application',
    stepAccepted: 'Accepted',
    stepRejected: 'Rejected',
    stepNotAvailable: 'Not available yet',
    stepClosed: 'Not applicable: the Case is closed',

    applicationTitle: 'Application',
    applicationMissing: 'No application recorded yet.',
    version: 'Version {version}',
    recordedBy: 'Recorded by',
    recordedAt: 'Recorded on',
    correctionReason: 'Correction reason',
    declaredLegalName: 'Declared legal name',
    declaredAddress: 'Declared address',
    sites: 'Sites',
    site: 'Site {number}',
    siteAddress: 'Site address',
    siteActivity: 'Activity on the site',
    addSite: 'Add a site',
    removeSite: 'Remove site {number}',
    requestedScope: 'Requested scope',
    foodChainSubcategories: 'Food chain subcategories (ISO 22003-1)',
    haccpStudyCount: 'HACCP studies',
    totalHeadcount: 'Total headcount',
    effectiveFte: 'Effective full-time equivalents',
    effectiveFteHelp: 'Greater than zero, with at most one decimal.',
    shiftCount: 'Shifts',
    seasonalActivity: 'Seasonal activity',
    otherCertifiedSystems: 'Other certified systems',
    outsourcedProcesses: 'Outsourced processes',
    optional: 'Optional',
    consultant: 'Consultant',
    consultantUsed: 'Did the client use a consultant?',
    consultantName: 'Consultant name',
    consultantNone: 'No consultant',
    auditLanguages: 'Audit languages',
    auditLanguage: 'Audit language {number}',
    addLanguage: 'Add a language',
    removeLanguage: 'Remove language {number}',
    preferredAuditPeriod: 'Preferred audit period',
    recordApplication: 'Record the application',
    correctApplication: 'Correct the application',
    saveCorrection: 'Record the correction',
    correctionHelp:
      'A correction records a new version with its reason. Earlier versions stay in the timeline.',
    applicationValidation:
      'Complete every required field within its limits: one to twenty sites, at least one food chain subcategory, one to five audit languages, whole numbers for HACCP studies (1–999), headcount (1–100,000) and shifts (1–10), and an FTE above zero with at most one decimal. Name the consultant when one was used.',
    reasonRequired:
      'State the reason for this correction (at most 2,000 characters).',

    reviewTitle: 'Application review',
    reviewMissing: 'The application has not been reviewed yet.',
    reviewHelp:
      'Answer each criterion explicitly with a note. The application can be accepted only when all four answers are yes. A rejection closes the Case.',
    scopeCertifiable:
      'The requested scope and food chain category can be certified',
    competentTeamAvailable: 'A competent audit team is available',
    competentDecisionMakerAvailable:
      'A competent certification decision maker is available',
    risksAcceptable: 'Impartiality and other risks are acceptable',
    note: 'Note',
    outcome: 'Outcome',
    outcomeAccept: 'Accept the application',
    outcomeReject: 'Reject the application',
    accepted: 'Accepted',
    rejected: 'Rejected',
    rejectionReason: 'Reason given to the applicant',
    recordReview: 'Record the review',
    reviewValidation:
      'Answer every criterion yes or no with a note (at most 1,000 characters), choose an outcome and, for a rejection, give the reason (at most 2,000 characters).',
    criteriaNotMet:
      'The application can be accepted only when every criterion is answered yes. Review the answers or reject the application with a reason.',

    blockedReviewBeforeApplication:
      'The review becomes available once the application is recorded.',
    blockedApplicationReviewed:
      'The application can no longer be corrected: it has been reviewed.',
    blockedAlreadyReviewed:
      'This application has already been reviewed. Reload the Case.',
    blockedClosed:
      'This Case is closed: the application was rejected. No further step can be recorded; a new application needs a new Case.',
    blockedCorrectionReason:
      'A correction needs a reason and a first application has none. Reload the Case before saving again.',
    nextDurationPending:
      'The application is accepted. The next step, audit duration, is not available in this version yet.',

    timelineTitle: 'Timeline',
    timelineEmpty: 'No step recorded yet.',
    timelineApplication: 'Application — version {version}',
    timelineReview: 'Application review — {outcome}',
    showValues: 'Show the recorded values',
  },
  fr: {
    readerBundle: 'Lecteur de certification de la société',
    managerBundle: 'Responsable de programme de certification de la société',
    readerPrerequisites:
      'Un lecteur de certification doit aussi avoir accès au Projet et à son Client dans cette Société.',
    managerPrerequisites:
      'Un responsable de programme de certification n’agit que s’il détient aussi le droit de lecteur de certification dans la même Société.',
    readerGranted: 'a accordé le droit de lecteur de certification',
    readerRevoked: 'a révoqué le droit de lecteur de certification',
    managerGranted:
      'a accordé le droit de responsable de programme de certification',
    managerRevoked:
      'a révoqué le droit de responsable de programme de certification',

    title: 'Certification',
    introduction:
      'Dossiers de certification de ce Projet : la demande du client et sa revue, avec chaque version enregistrée.',
    refresh: 'Actualiser les dossiers de certification',
    loading: 'Chargement des dossiers de certification…',
    caseLoading: 'Chargement du dossier de certification…',
    empty: 'Aucun dossier de certification n’est ouvert dans ce Projet.',
    total: 'Dossiers de certification',
    denied:
      'L’accès à la certification est indisponible. Vos droits actuels sont vérifiés.',
    listUnavailable:
      'Les dossiers de certification de ce Projet sont indisponibles.',
    unavailable: 'Ce dossier de certification est indisponible.',
    error:
      'La lecture a échoué. Actualisez avant de considérer cette page comme actuelle.',
    reload: 'Recharger le dossier',
    back: 'Retour aux dossiers de certification',
    saveConfirmed:
      'Enregistré. Le résultat confirmé reste enregistré même si une actualisation ultérieure échoue.',
    uncertain:
      'La sauvegarde n’a pas pu être confirmée. Elle est peut-être déjà enregistrée. Réessayez sans modification pour récupérer le résultat.',
    retry: 'Réessayer la sauvegarde inchangée',
    saving: 'Enregistrement…',
    stale:
      'Ce dossier a changé depuis son ouverture. Rechargez-le avant d’enregistrer ; votre brouillon est conservé.',
    conflict:
      'L’identité de cette sauvegarde correspond à une autre intention. Rechargez le dossier et vérifiez-le avant d’enregistrer à nouveau.',
    invalid:
      'Le serveur a refusé ces valeurs. Vérifiez chaque champ et ses limites.',
    readOnly:
      'Vous pouvez consulter ce dossier. L’enregistrement d’une étape exige le droit de responsable de programme de certification.',
    notProvided: 'Non renseigné',
    yes: 'Oui',
    no: 'Non',
    cancel: 'Annuler',

    orderReference: 'Référence de commande',
    legalEntity: 'Entité juridique du Client',
    status: 'Statut',
    statusOpen: 'Ouvert',
    statusRejected: 'Clos — demande rejetée',
    nextStep: 'Étape suivante',
    nextApplication: 'Enregistrer la demande',
    nextApplicationReview: 'Revoir la demande',
    nextDuration: 'Durée d’audit',
    nextNone: 'Aucune',
    openedBy: 'Ouvert par',
    openedAt: 'Ouvert le',
    revision: 'Révision',
    standard: 'Norme',
    standardValue: 'ISO 22000:2018',
    auditType: 'Type d’audit',
    auditTypeValue: 'Certification initiale',

    openToggle: 'Ouvrir un dossier de certification',
    openTitle: 'Ouvrir un dossier de certification',
    openHelp:
      'Certification initiale ISO 22000:2018 pour une entité juridique du Client de ce Projet.',
    selectLegalEntity: 'Choisir une entité juridique',
    legalEntitiesLoading: 'Chargement des entités juridiques du Client…',
    legalEntitiesEmpty:
      'Le Client de ce Projet n’a encore aucune entité juridique. Ajoutez-en une dans le dossier du Client.',
    legalEntitiesUnavailable:
      'Les entités juridiques du Client n’ont pas pu être chargées. Réessayez.',
    openSubmit: 'Ouvrir le dossier de certification',
    openValidation:
      'Choisissez une entité juridique et saisissez une référence de commande de 64 caractères au plus.',
    referenceTaken:
      'Cette référence de commande est déjà utilisée dans cette Société. Saisissez-en une autre.',
    entityUnavailable:
      'Cette entité juridique n’est pas disponible pour le Client de ce Projet. Rechargez la liste et choisissez à nouveau.',
    taxId: 'IDNO / code fiscal',

    caseHeading: 'Dossier de certification {reference}',
    steps: 'Étapes',
    stepApplication: 'Demande',
    stepReview: 'Revue de la demande',
    stepDuration: 'Durée d’audit',
    stepRecorded: 'Enregistrée — version {version}',
    stepToRecord: 'À enregistrer',
    stepWaiting: 'Attend la demande',
    stepAccepted: 'Acceptée',
    stepRejected: 'Rejetée',
    stepNotAvailable: 'Pas encore disponible',
    stepClosed: 'Sans objet : le dossier est clos',

    applicationTitle: 'Demande',
    applicationMissing: 'Aucune demande enregistrée pour l’instant.',
    version: 'Version {version}',
    recordedBy: 'Enregistrée par',
    recordedAt: 'Enregistrée le',
    correctionReason: 'Motif de la correction',
    declaredLegalName: 'Dénomination juridique déclarée',
    declaredAddress: 'Adresse déclarée',
    sites: 'Sites',
    site: 'Site {number}',
    siteAddress: 'Adresse du site',
    siteActivity: 'Activité sur le site',
    addSite: 'Ajouter un site',
    removeSite: 'Retirer le site {number}',
    requestedScope: 'Périmètre demandé',
    foodChainSubcategories:
      'Sous-catégories de la chaîne alimentaire (ISO 22003-1)',
    haccpStudyCount: 'Études HACCP',
    totalHeadcount: 'Effectif total',
    effectiveFte: 'Équivalents temps plein effectifs',
    effectiveFteHelp: 'Supérieur à zéro, avec une décimale au plus.',
    shiftCount: 'Équipes (postes)',
    seasonalActivity: 'Activité saisonnière',
    otherCertifiedSystems: 'Autres systèmes certifiés',
    outsourcedProcesses: 'Processus externalisés',
    optional: 'Facultatif',
    consultant: 'Consultant',
    consultantUsed: 'Le client a-t-il eu recours à un consultant ?',
    consultantName: 'Nom du consultant',
    consultantNone: 'Aucun consultant',
    auditLanguages: 'Langues d’audit',
    auditLanguage: 'Langue d’audit {number}',
    addLanguage: 'Ajouter une langue',
    removeLanguage: 'Retirer la langue {number}',
    preferredAuditPeriod: 'Période d’audit souhaitée',
    recordApplication: 'Enregistrer la demande',
    correctApplication: 'Corriger la demande',
    saveCorrection: 'Enregistrer la correction',
    correctionHelp:
      'Une correction enregistre une nouvelle version avec son motif. Les versions antérieures restent dans la chronologie.',
    applicationValidation:
      'Complétez chaque champ obligatoire dans ses limites : un à vingt sites, au moins une sous-catégorie de la chaîne alimentaire, une à cinq langues d’audit, des nombres entiers pour les études HACCP (1–999), l’effectif (1–100 000) et les équipes (1–10), et des ETP supérieurs à zéro avec une décimale au plus. Nommez le consultant s’il y en a eu un.',
    reasonRequired:
      'Indiquez le motif de cette correction (2 000 caractères au plus).',

    reviewTitle: 'Revue de la demande',
    reviewMissing: 'La demande n’a pas encore été revue.',
    reviewHelp:
      'Répondez explicitement à chaque critère avec une note. La demande ne peut être acceptée que si les quatre réponses sont oui. Un rejet clôt le dossier.',
    scopeCertifiable:
      'Le périmètre demandé et la catégorie de la chaîne alimentaire peuvent être certifiés',
    competentTeamAvailable: 'Une équipe d’audit compétente est disponible',
    competentDecisionMakerAvailable:
      'Un décideur de certification compétent est disponible',
    risksAcceptable:
      'Les risques, notamment pour l’impartialité, sont acceptables',
    note: 'Note',
    outcome: 'Résultat',
    outcomeAccept: 'Accepter la demande',
    outcomeReject: 'Rejeter la demande',
    accepted: 'Acceptée',
    rejected: 'Rejetée',
    rejectionReason: 'Motif communiqué au demandeur',
    recordReview: 'Enregistrer la revue',
    reviewValidation:
      'Répondez oui ou non à chaque critère avec une note (1 000 caractères au plus), choisissez un résultat et, en cas de rejet, indiquez le motif (2 000 caractères au plus).',
    criteriaNotMet:
      'La demande ne peut être acceptée que si chaque critère reçoit la réponse oui. Revoyez les réponses ou rejetez la demande avec un motif.',

    blockedReviewBeforeApplication:
      'La revue devient disponible une fois la demande enregistrée.',
    blockedApplicationReviewed:
      'La demande ne peut plus être corrigée : elle a été revue.',
    blockedAlreadyReviewed:
      'Cette demande a déjà été revue. Rechargez le dossier.',
    blockedClosed:
      'Ce dossier est clos : la demande a été rejetée. Aucune autre étape ne peut être enregistrée ; une nouvelle demande exige un nouveau dossier.',
    blockedCorrectionReason:
      'Une correction exige un motif et une première demande n’en a pas. Rechargez le dossier avant d’enregistrer à nouveau.',
    nextDurationPending:
      'La demande est acceptée. L’étape suivante, la durée d’audit, n’est pas encore disponible dans cette version.',

    timelineTitle: 'Chronologie',
    timelineEmpty: 'Aucune étape enregistrée pour l’instant.',
    timelineApplication: 'Demande — version {version}',
    timelineReview: 'Revue de la demande — {outcome}',
    showValues: 'Afficher les valeurs enregistrées',
  },
  ro: {
    readerBundle: 'Cititor de certificare al companiei',
    managerBundle: 'Manager de program de certificare al companiei',
    readerPrerequisites:
      'Un cititor de certificare are nevoie și de acces la Proiect și la Clientul acestuia în această Companie.',
    managerPrerequisites:
      'Un manager de program de certificare acționează doar dacă deține și dreptul de cititor de certificare în aceeași Companie.',
    readerGranted: 'a acordat dreptul de cititor de certificare',
    readerRevoked: 'a revocat dreptul de cititor de certificare',
    managerGranted: 'a acordat dreptul de manager de program de certificare',
    managerRevoked: 'a revocat dreptul de manager de program de certificare',

    title: 'Certificare',
    introduction:
      'Dosarele de certificare ale acestui Proiect: cererea clientului și analiza ei, cu fiecare versiune înregistrată.',
    refresh: 'Actualizați dosarele de certificare',
    loading: 'Se încarcă dosarele de certificare…',
    caseLoading: 'Se încarcă dosarul de certificare…',
    empty: 'Niciun dosar de certificare nu este deschis în acest Proiect.',
    total: 'Dosare de certificare',
    denied:
      'Accesul la certificare nu este disponibil. Se verifică drepturile curente.',
    listUnavailable:
      'Dosarele de certificare ale acestui Proiect nu sunt disponibile.',
    unavailable: 'Acest dosar de certificare nu este disponibil.',
    error:
      'Citirea a eșuat. Actualizați înainte de a considera pagina curentă.',
    reload: 'Reîncărcați dosarul',
    back: 'Înapoi la dosarele de certificare',
    saveConfirmed:
      'Salvat. Rezultatul confirmat rămâne înregistrat chiar dacă o actualizare ulterioară eșuează.',
    uncertain:
      'Salvarea nu a putut fi confirmată. Este posibil să fie deja înregistrată. Reîncercați fără modificări pentru a recupera rezultatul.',
    retry: 'Reîncercați salvarea fără modificări',
    saving: 'Se salvează…',
    stale:
      'Dosarul s-a modificat de când l-ați deschis. Reîncărcați-l înainte de salvare; ciorna dvs. se păstrează.',
    conflict:
      'Identitatea acestei salvări intră în conflict cu altă intenție. Reîncărcați dosarul și verificați-l înainte de o nouă salvare.',
    invalid:
      'Serverul a refuzat aceste valori. Verificați fiecare câmp și limitele lui.',
    readOnly:
      'Puteți consulta acest dosar. Înregistrarea unei etape necesită dreptul de manager de program de certificare.',
    notProvided: 'Nedeclarat',
    yes: 'Da',
    no: 'Nu',
    cancel: 'Anulați',

    orderReference: 'Referința comenzii',
    legalEntity: 'Entitatea juridică a Clientului',
    status: 'Stare',
    statusOpen: 'Deschis',
    statusRejected: 'Închis — cerere respinsă',
    nextStep: 'Etapa următoare',
    nextApplication: 'Înregistrarea cererii',
    nextApplicationReview: 'Analiza cererii',
    nextDuration: 'Durata auditului',
    nextNone: 'Niciuna',
    openedBy: 'Deschis de',
    openedAt: 'Deschis la',
    revision: 'Revizie',
    standard: 'Standard',
    standardValue: 'ISO 22000:2018',
    auditType: 'Tipul auditului',
    auditTypeValue: 'Certificare inițială',

    openToggle: 'Deschideți un dosar de certificare',
    openTitle: 'Deschiderea unui dosar de certificare',
    openHelp:
      'Certificare inițială ISO 22000:2018 pentru o entitate juridică a Clientului acestui Proiect.',
    selectLegalEntity: 'Alegeți o entitate juridică',
    legalEntitiesLoading: 'Se încarcă entitățile juridice ale Clientului…',
    legalEntitiesEmpty:
      'Clientul acestui Proiect nu are încă nicio entitate juridică. Adăugați una mai întâi în dosarul Clientului.',
    legalEntitiesUnavailable:
      'Entitățile juridice ale Clientului nu au putut fi încărcate. Reîncercați.',
    openSubmit: 'Deschideți dosarul de certificare',
    openValidation:
      'Alegeți o entitate juridică și introduceți o referință a comenzii de cel mult 64 de caractere.',
    referenceTaken:
      'Această referință a comenzii este deja folosită în această Companie. Introduceți alta.',
    entityUnavailable:
      'Această entitate juridică nu este disponibilă pentru Clientul acestui Proiect. Reîncărcați lista și alegeți din nou.',
    taxId: 'IDNO / cod fiscal',

    caseHeading: 'Dosarul de certificare {reference}',
    steps: 'Etape',
    stepApplication: 'Cerere',
    stepReview: 'Analiza cererii',
    stepDuration: 'Durata auditului',
    stepRecorded: 'Înregistrată — versiunea {version}',
    stepToRecord: 'De înregistrat',
    stepWaiting: 'Așteaptă cererea',
    stepAccepted: 'Acceptată',
    stepRejected: 'Respinsă',
    stepNotAvailable: 'Încă indisponibilă',
    stepClosed: 'Nu se aplică: dosarul este închis',

    applicationTitle: 'Cerere',
    applicationMissing: 'Nicio cerere înregistrată încă.',
    version: 'Versiunea {version}',
    recordedBy: 'Înregistrată de',
    recordedAt: 'Înregistrată la',
    correctionReason: 'Motivul corectării',
    declaredLegalName: 'Denumirea juridică declarată',
    declaredAddress: 'Adresa declarată',
    sites: 'Amplasamente',
    site: 'Amplasamentul {number}',
    siteAddress: 'Adresa amplasamentului',
    siteActivity: 'Activitatea pe amplasament',
    addSite: 'Adăugați un amplasament',
    removeSite: 'Eliminați amplasamentul {number}',
    requestedScope: 'Domeniul solicitat',
    foodChainSubcategories: 'Subcategoriile lanțului alimentar (ISO 22003-1)',
    haccpStudyCount: 'Studii HACCP',
    totalHeadcount: 'Număr total de angajați',
    effectiveFte: 'Echivalent normă întreagă efectiv',
    effectiveFteHelp: 'Mai mare decât zero, cu cel mult o zecimală.',
    shiftCount: 'Schimburi',
    seasonalActivity: 'Activitate sezonieră',
    otherCertifiedSystems: 'Alte sisteme certificate',
    outsourcedProcesses: 'Procese externalizate',
    optional: 'Opțional',
    consultant: 'Consultant',
    consultantUsed: 'Clientul a apelat la un consultant?',
    consultantName: 'Numele consultantului',
    consultantNone: 'Fără consultant',
    auditLanguages: 'Limbile auditului',
    auditLanguage: 'Limba auditului {number}',
    addLanguage: 'Adăugați o limbă',
    removeLanguage: 'Eliminați limba {number}',
    preferredAuditPeriod: 'Perioada preferată pentru audit',
    recordApplication: 'Înregistrați cererea',
    correctApplication: 'Corectați cererea',
    saveCorrection: 'Înregistrați corectarea',
    correctionHelp:
      'O corectare înregistrează o versiune nouă cu motivul ei. Versiunile anterioare rămân în cronologie.',
    applicationValidation:
      'Completați fiecare câmp obligatoriu în limitele lui: între unul și douăzeci de amplasamente, cel puțin o subcategorie a lanțului alimentar, între una și cinci limbi de audit, numere întregi pentru studiile HACCP (1–999), numărul de angajați (1–100.000) și schimburi (1–10), și un echivalent normă întreagă mai mare decât zero, cu cel mult o zecimală. Numiți consultantul dacă a existat unul.',
    reasonRequired:
      'Indicați motivul acestei corectări (cel mult 2.000 de caractere).',

    reviewTitle: 'Analiza cererii',
    reviewMissing: 'Cererea nu a fost încă analizată.',
    reviewHelp:
      'Răspundeți explicit la fiecare criteriu, cu o notă. Cererea poate fi acceptată doar dacă toate cele patru răspunsuri sunt da. O respingere închide dosarul.',
    scopeCertifiable:
      'Domeniul solicitat și categoria lanțului alimentar pot fi certificate',
    competentTeamAvailable: 'O echipă de audit competentă este disponibilă',
    competentDecisionMakerAvailable:
      'Un decident de certificare competent este disponibil',
    risksAcceptable:
      'Riscurile, inclusiv cele privind imparțialitatea, sunt acceptabile',
    note: 'Notă',
    outcome: 'Rezultat',
    outcomeAccept: 'Acceptați cererea',
    outcomeReject: 'Respingeți cererea',
    accepted: 'Acceptată',
    rejected: 'Respinsă',
    rejectionReason: 'Motivul comunicat solicitantului',
    recordReview: 'Înregistrați analiza',
    reviewValidation:
      'Răspundeți da sau nu la fiecare criteriu, cu o notă (cel mult 1.000 de caractere), alegeți un rezultat și, la respingere, indicați motivul (cel mult 2.000 de caractere).',
    criteriaNotMet:
      'Cererea poate fi acceptată doar dacă fiecare criteriu are răspunsul da. Revedeți răspunsurile sau respingeți cererea cu un motiv.',

    blockedReviewBeforeApplication:
      'Analiza devine disponibilă după înregistrarea cererii.',
    blockedApplicationReviewed:
      'Cererea nu mai poate fi corectată: a fost analizată.',
    blockedAlreadyReviewed:
      'Această cerere a fost deja analizată. Reîncărcați dosarul.',
    blockedClosed:
      'Acest dosar este închis: cererea a fost respinsă. Nu se mai poate înregistra nicio etapă; o cerere nouă necesită un dosar nou.',
    blockedCorrectionReason:
      'O corectare necesită un motiv, iar prima cerere nu are. Reîncărcați dosarul înainte de o nouă salvare.',
    nextDurationPending:
      'Cererea este acceptată. Etapa următoare, durata auditului, nu este încă disponibilă în această versiune.',

    timelineTitle: 'Cronologie',
    timelineEmpty: 'Nicio etapă înregistrată încă.',
    timelineApplication: 'Cerere — versiunea {version}',
    timelineReview: 'Analiza cererii — {outcome}',
    showValues: 'Afișați valorile înregistrate',
  },
  ru: {
    readerBundle: 'Читатель сертификации компании',
    managerBundle: 'Руководитель программы сертификации компании',
    readerPrerequisites:
      'Читателю сертификации также нужен доступ к Проекту и его Клиенту в этой Компании.',
    managerPrerequisites:
      'Руководитель программы сертификации действует, только если в той же Компании у него есть и право читателя сертификации.',
    readerGranted: '— предоставление права читателя сертификации',
    readerRevoked: '— отзыв права читателя сертификации',
    managerGranted:
      '— предоставление права руководителя программы сертификации',
    managerRevoked: '— отзыв права руководителя программы сертификации',

    title: 'Сертификация',
    introduction:
      'Дела по сертификации этого Проекта: заявка клиента и её анализ со всеми записанными версиями.',
    refresh: 'Обновить дела по сертификации',
    loading: 'Загрузка дел по сертификации…',
    caseLoading: 'Загрузка дела по сертификации…',
    empty: 'В этом Проекте нет открытых дел по сертификации.',
    total: 'Дела по сертификации',
    denied: 'Доступ к сертификации недоступен. Проверяются текущие права.',
    listUnavailable: 'Дела по сертификации этого Проекта недоступны.',
    unavailable: 'Это дело по сертификации недоступно.',
    error:
      'Ошибка чтения. Обновите страницу, прежде чем считать её актуальной.',
    reload: 'Загрузить дело заново',
    back: 'Назад к делам по сертификации',
    saveConfirmed:
      'Сохранено. Подтверждённый результат остаётся записанным даже при ошибке последующего обновления.',
    uncertain:
      'Сохранение не подтверждено. Возможно, запись уже сохранена. Повторите без изменений, чтобы получить результат.',
    retry: 'Повторить сохранение без изменений',
    saving: 'Сохранение…',
    stale:
      'Дело изменилось после открытия. Загрузите его заново перед сохранением; ваш черновик сохранится.',
    conflict:
      'Этот идентификатор сохранения относится к другому действию. Загрузите дело заново и проверьте его перед новым сохранением.',
    invalid:
      'Сервер отклонил эти значения. Проверьте каждое поле и его ограничения.',
    readOnly:
      'Вы можете просматривать это дело. Для записи этапа нужно право руководителя программы сертификации.',
    notProvided: 'Не указано',
    yes: 'Да',
    no: 'Нет',
    cancel: 'Отмена',

    orderReference: 'Номер заказа',
    legalEntity: 'Юридическое лицо Клиента',
    status: 'Статус',
    statusOpen: 'Открыто',
    statusRejected: 'Закрыто — заявка отклонена',
    nextStep: 'Следующий этап',
    nextApplication: 'Записать заявку',
    nextApplicationReview: 'Проанализировать заявку',
    nextDuration: 'Продолжительность аудита',
    nextNone: 'Нет',
    openedBy: 'Открыл(а)',
    openedAt: 'Дата открытия',
    revision: 'Редакция',
    standard: 'Стандарт',
    standardValue: 'ISO 22000:2018',
    auditType: 'Вид аудита',
    auditTypeValue: 'Первичная сертификация',

    openToggle: 'Открыть дело по сертификации',
    openTitle: 'Открытие дела по сертификации',
    openHelp:
      'Первичная сертификация по ISO 22000:2018 для одного юридического лица Клиента этого Проекта.',
    selectLegalEntity: 'Выберите юридическое лицо',
    legalEntitiesLoading: 'Загрузка юридических лиц Клиента…',
    legalEntitiesEmpty:
      'У Клиента этого Проекта ещё нет юридических лиц. Сначала добавьте его в досье Клиента.',
    legalEntitiesUnavailable:
      'Не удалось загрузить юридические лица Клиента. Повторите попытку.',
    openSubmit: 'Открыть дело по сертификации',
    openValidation:
      'Выберите юридическое лицо и введите номер заказа длиной не более 64 символов.',
    referenceTaken:
      'Этот номер заказа уже используется в этой Компании. Введите другой.',
    entityUnavailable:
      'Это юридическое лицо недоступно для Клиента этого Проекта. Обновите список и выберите снова.',
    taxId: 'IDNO / налоговый код',

    caseHeading: 'Дело по сертификации {reference}',
    steps: 'Этапы',
    stepApplication: 'Заявка',
    stepReview: 'Анализ заявки',
    stepDuration: 'Продолжительность аудита',
    stepRecorded: 'Записана — версия {version}',
    stepToRecord: 'Нужно записать',
    stepWaiting: 'Ожидает заявку',
    stepAccepted: 'Принята',
    stepRejected: 'Отклонена',
    stepNotAvailable: 'Пока недоступно',
    stepClosed: 'Не применяется: дело закрыто',

    applicationTitle: 'Заявка',
    applicationMissing: 'Заявка ещё не записана.',
    version: 'Версия {version}',
    recordedBy: 'Записал(а)',
    recordedAt: 'Дата записи',
    correctionReason: 'Причина исправления',
    declaredLegalName: 'Заявленное юридическое наименование',
    declaredAddress: 'Заявленный адрес',
    sites: 'Площадки',
    site: 'Площадка {number}',
    siteAddress: 'Адрес площадки',
    siteActivity: 'Деятельность на площадке',
    addSite: 'Добавить площадку',
    removeSite: 'Удалить площадку {number}',
    requestedScope: 'Запрашиваемая область',
    foodChainSubcategories: 'Подкатегории пищевой цепи (ISO 22003-1)',
    haccpStudyCount: 'Исследования HACCP',
    totalHeadcount: 'Общая численность персонала',
    effectiveFte: 'Фактические эквиваленты полной занятости',
    effectiveFteHelp: 'Больше нуля, не более одного знака после запятой.',
    shiftCount: 'Смены',
    seasonalActivity: 'Сезонная деятельность',
    otherCertifiedSystems: 'Другие сертифицированные системы',
    outsourcedProcesses: 'Процессы на аутсорсинге',
    optional: 'Необязательно',
    consultant: 'Консультант',
    consultantUsed: 'Привлекал ли клиент консультанта?',
    consultantName: 'Имя консультанта',
    consultantNone: 'Без консультанта',
    auditLanguages: 'Языки аудита',
    auditLanguage: 'Язык аудита {number}',
    addLanguage: 'Добавить язык',
    removeLanguage: 'Удалить язык {number}',
    preferredAuditPeriod: 'Предпочтительный период аудита',
    recordApplication: 'Записать заявку',
    correctApplication: 'Исправить заявку',
    saveCorrection: 'Записать исправление',
    correctionHelp:
      'Исправление записывает новую версию с её причиной. Прежние версии остаются в хронологии.',
    applicationValidation:
      'Заполните все обязательные поля в пределах ограничений: от одной до двадцати площадок, хотя бы одна подкатегория пищевой цепи, от одного до пяти языков аудита, целые числа для исследований HACCP (1–999), численности (1–100 000) и смен (1–10), эквивалент полной занятости больше нуля и не более одного знака после запятой. Укажите консультанта, если он был.',
    reasonRequired:
      'Укажите причину этого исправления (не более 2 000 символов).',

    reviewTitle: 'Анализ заявки',
    reviewMissing: 'Заявка ещё не проанализирована.',
    reviewHelp:
      'Ответьте явно на каждый критерий и добавьте примечание. Заявку можно принять, только если все четыре ответа — «да». Отклонение закрывает дело.',
    scopeCertifiable:
      'Запрашиваемую область и категорию пищевой цепи можно сертифицировать',
    competentTeamAvailable: 'Есть компетентная команда аудиторов',
    competentDecisionMakerAvailable:
      'Есть компетентное лицо для решения о сертификации',
    risksAcceptable: 'Риски, в том числе для беспристрастности, приемлемы',
    note: 'Примечание',
    outcome: 'Результат',
    outcomeAccept: 'Принять заявку',
    outcomeReject: 'Отклонить заявку',
    accepted: 'Принята',
    rejected: 'Отклонена',
    rejectionReason: 'Причина, сообщённая заявителю',
    recordReview: 'Записать анализ',
    reviewValidation:
      'Ответьте «да» или «нет» на каждый критерий с примечанием (не более 1 000 символов), выберите результат и при отклонении укажите причину (не более 2 000 символов).',
    criteriaNotMet:
      'Заявку можно принять, только если на каждый критерий дан ответ «да». Пересмотрите ответы или отклоните заявку с указанием причины.',

    blockedReviewBeforeApplication:
      'Анализ станет доступен после записи заявки.',
    blockedApplicationReviewed:
      'Заявку больше нельзя исправить: она уже проанализирована.',
    blockedAlreadyReviewed:
      'Эта заявка уже проанализирована. Загрузите дело заново.',
    blockedClosed:
      'Это дело закрыто: заявка отклонена. Новые этапы записать нельзя; для новой заявки нужно новое дело.',
    blockedCorrectionReason:
      'Исправлению нужна причина, а у первой заявки её нет. Загрузите дело заново перед новым сохранением.',
    nextDurationPending:
      'Заявка принята. Следующий этап, продолжительность аудита, в этой версии пока недоступен.',

    timelineTitle: 'Хронология',
    timelineEmpty: 'Этапы ещё не записаны.',
    timelineApplication: 'Заявка — версия {version}',
    timelineReview: 'Анализ заявки — {outcome}',
    showValues: 'Показать записанные значения',
  },
});

export function useCertificationCopy() {
  return useMessages(certificationMessages);
}
