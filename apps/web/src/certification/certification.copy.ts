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
  'approverBundle',
  'approverPrerequisites',
  'approverGranted',
  'approverRevoked',

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
  'nextAgreement',
  'nextTeam',
  'nextTeamDecision',
  'nextStage1Plan',
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
  'stepAgreement',
  'stepRecorded',
  'stepToRecord',
  'stepWaiting',
  'stepWaitingReview',
  'stepWaitingDuration',
  'stepAccepted',
  'stepRejected',
  'stepClosed',
  'stepTeam',
  'stepTeamDecision',
  'stepWaitingAgreement',
  'stepWaitingTeam',
  'stepToDecide',
  'stepApproved',
  'stepReturned',

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
  'blockedCorrectionUnchanged',
  'nextStagePlanPending',

  'durationTitle',
  'durationMissing',
  'durationHelp',
  'durationInputs',
  'primarySubcategory',
  'selectPrimarySubcategory',
  'primarySubcategoryHelp',
  'haccpStudiesPerSubcategory',
  'haccpStudiesFor',
  'haccpStudiesTotal',
  'increaseFactors',
  'increaseFactorsHelp',
  'reductionFactors',
  'reductionFactorsHelp',
  'factorProductTypes',
  'factorProductLines',
  'factorProductDevelopment',
  'factorCriticalControlPoints',
  'factorOperationalPrerequisites',
  'factorConstructionSites',
  'factorComplexInfrastructure',
  'factorOnSiteLaboratory',
  'factorRemoteAuditTechnology',
  'factorInterpreter',
  'factorSystemMaturity',
  'factorPriorCertification',
  'factorTransferPreparedness',
  'factorAutomation',
  'computeProposal',
  'computing',
  'durationInputsValidation',
  'haccpStudiesMismatch',
  'proposalTitle',
  'proposalUnavailable',
  'proposalOutdated',
  'durationNotAccepted',
  'amountsInAuditorDays',
  'ruleVersion',
  'basicTime',
  'haccpTime',
  'fteTime',
  'baseDays',
  'netAdjustment',
  'percentValue',
  'initialOnSite',
  'initialTotal',
  'stage1OnSite',
  'stage2OnSite',
  'surveillanceOnSite',
  'surveillanceTotal',
  'recertificationOnSite',
  'recertificationTotal',
  'warningsTitle',
  'warningSurveillanceBelowOneDay',
  'warningRecertificationBelowOneDay',
  'warningStage2BelowOneDay',
  'durationManual',
  'refusalsTitle',
  'refusalPrimaryNotSelected',
  'refusalPrimaryNotHighestBasicTime',
  'refusalHaccpStudiesMismatch',
  'refusalReductionFactorCap',
  'refusalReductionTotalCap',
  'confirmDuration',
  'correctDuration',
  'confirmHelp',
  'justification',
  'justificationRequiredHint',
  'durationValuesValidation',
  'durationStagesMismatch',
  'durationJustificationRequired',
  'durationRefused',
  'blockedDurationCorrectionReason',
  'computation',
  'computationProposal',
  'computationManual',
  'confirmedDays',
  'noFactor',
  'showProposal',

  'documentsTitle',
  'documentsHelp',
  'documentsEmpty',
  'documentRole',
  'documentFile',
  'documentSize',
  'documentDigest',
  'documentDigestShow',
  'documentAttachedBy',
  'documentAttachedAt',
  'documentVersionOf',
  'documentReference',
  'documentDownload',
  'documentDownloading',
  'documentDownloadFailed',
  'documentDownloadUnavailable',
  'documentsDenied',
  'documentsNoContentRights',
  'attachNoRights',
  'roleQuestionnaire',
  'roleIso22000Annex',
  'roleAgreement',
  'rolePlan',
  'roleParticipantList',
  'roleReport',
  'roleEvidence',
  'roleCertificate',
  'roleOther',
  'attachToggle',
  'attachTitle',
  'attachHelp',
  'eligibleDocument',
  'selectEligibleDocument',
  'eligibleAttached',
  'eligibleLoading',
  'eligibleUnavailable',
  'eligibleEmpty',
  'eligibleTruncated',
  'selectDocumentRole',
  'attachSubmit',
  'attachValidation',
  'attachDuplicate',
  'attachUnavailable',
  'agreementTitle',
  'agreementMissing',
  'agreementHelp',
  'agreementSignedOn',
  'agreementDocument',
  'selectAgreementDocument',
  'agreementNoDocument',
  'recordAgreement',
  'correctAgreement',
  'agreementValidation',
  'agreementInFuture',
  'agreementDocumentRole',
  'blockedAgreementBeforeDuration',
  'blockedAgreementCorrectionReason',

  'teamTitle',
  'teamMissing',
  'teamHelp',
  'teamMember',
  'teamMemberName',
  'teamMemberRole',
  'selectTeamRole',
  'teamRoleLeader',
  'teamRoleAuditor',
  'teamRoleTechnicalExpert',
  'teamRoleObserver',
  'teamMemberLink',
  'teamMemberNotLinked',
  'teamMemberLinkHelp',
  'teamMemberLinkedUnknown',
  'teamMemberYou',
  'holdsCategory',
  'competenceNote',
  'declarations',
  'declarationNoConsultancy',
  'declarationNoEmployment',
  'declarationNoManagementInvolvement',
  'declarationConfidentiality',
  'conflictNote',
  'conflictNoteHelp',
  'conflictDeclared',
  'addTeamMember',
  'removeTeamMember',
  'proposeTeam',
  'correctTeam',
  'teamCorrectionHelp',
  'teamValidation',
  'teamConflictNoteRequired',
  'teamLinkInvalid',
  'teamLeaderRule',
  'teamCategoryRule',
  'teamMemberUnknown',
  'blockedTeamBeforeAgreement',
  'blockedTeamCorrectionReason',
  'teamStatusPending',
  'teamStatusApproved',
  'teamStatusReturned',
  'teamReturnedNote',
  'teamAwaitingApprover',
  'decisionTitle',
  'decisionMissing',
  'decisionHelp',
  'decisionChoice',
  'decisionApprove',
  'decisionReturn',
  'decisionReason',
  'recordDecision',
  'decisionTeamVersion',
  'decisionApproved',
  'decisionReturned',
  'decisionEarlierVersion',
  'decisionValidation',
  'decisionConflictOnly',
  'teamConflictDeclared',
  'teamIndependence',
  'blockedTeamNotPending',

  'timelineTitle',
  'timelineEmpty',
  'timelineApplication',
  'timelineReview',
  'timelineDuration',
  'timelineAgreement',
  'timelineTeam',
  'timelineTeamDecision',
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
    approverBundle: 'Company Certification Approver',
    approverPrerequisites:
      'A Certification Approver acts only while also holding Company Certification Reader in the same Company. An approver linked to a member of a proposed team cannot decide on that team.',
    approverGranted: 'granted Certification Approver',
    approverRevoked: 'revoked Certification Approver',

    title: 'Certification',
    introduction:
      'Certification Cases of this Project: the client’s application, its review, the audit duration, the attached signed originals, the certification agreement and the audit team with its approval, with every recorded version.',
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
    nextAgreement: 'Certification agreement',
    nextTeam: 'Audit team',
    nextTeamDecision: 'Team decision',
    nextStage1Plan: 'Stage 1 audit plan',
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
    stepAgreement: 'Certification agreement',
    stepRecorded: 'Recorded — version {version}',
    stepToRecord: 'To record',
    stepWaiting: 'Waits for the application',
    stepWaitingReview: 'Waits for the accepted review',
    stepWaitingDuration: 'Waits for the confirmed duration',
    stepAccepted: 'Accepted',
    stepRejected: 'Rejected',
    stepClosed: 'Not applicable: the Case is closed',
    stepTeam: 'Audit team',
    stepTeamDecision: 'Team decision',
    stepWaitingAgreement: 'Waits for the agreement',
    stepWaitingTeam: 'Waits for a proposed team',
    stepToDecide: 'To decide — version {version}',
    stepApproved: 'Approved — version {version}',
    stepReturned: 'Returned — version {version}',

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
    blockedCorrectionUnchanged:
      'The correction changes no value. Change at least one value or cancel the correction.',
    nextStagePlanPending:
      'The audit team is approved. The next step, the Stage 1 audit plan, is not available in this version yet.',

    durationTitle: 'Audit duration',
    durationMissing: 'No audit duration is confirmed yet.',
    durationHelp:
      'The calculator proposes auditor-days from the accepted application and the factors you state. Confirm the proposal or adjust it with a justification.',
    durationInputs: 'Duration inputs',
    primarySubcategory: 'Primary subcategory',
    selectPrimarySubcategory: 'Select the primary subcategory',
    primarySubcategoryHelp:
      'The application subcategory with the highest basic time.',
    haccpStudiesPerSubcategory: 'HACCP studies per subcategory',
    haccpStudiesFor: 'HACCP studies in {code}',
    haccpStudiesTotal:
      'Total: {total} of the {declared} HACCP studies declared in the application.',
    increaseFactors: 'Increase factors (%)',
    increaseFactorsHelp:
      'Whole percentages from 0 to 100. Any factor above 0 needs a justification.',
    reductionFactors: 'Reduction factors (%)',
    reductionFactorsHelp:
      'Whole percentages, at most 10% each and 20% together. Any factor above 0 needs a justification.',
    factorProductTypes: 'Number of product types',
    factorProductLines: 'Number of production lines',
    factorProductDevelopment: 'Product development',
    factorCriticalControlPoints: 'Number of critical control points',
    factorOperationalPrerequisites:
      'Number of operational prerequisite programmes',
    factorConstructionSites: 'Construction sites',
    factorComplexInfrastructure: 'Complex infrastructure',
    factorOnSiteLaboratory: 'Laboratory on site',
    factorRemoteAuditTechnology: 'Remote audit technology',
    factorInterpreter: 'Interpreter',
    factorSystemMaturity: 'Management system maturity',
    factorPriorCertification: 'Prior certification',
    factorTransferPreparedness: 'Transfer preparedness',
    factorAutomation: 'Automation',
    computeProposal: 'Compute the proposal',
    computing: 'Computing…',
    durationInputsValidation:
      'Choose the primary subcategory and enter whole numbers: HACCP studies from 0 to 999 per subcategory and factor percentages from 0 to 100.',
    haccpStudiesMismatch:
      'The HACCP studies per subcategory must add up to the number declared in the application.',
    proposalTitle: 'Proposal',
    proposalUnavailable: 'The proposal could not be computed. Try again.',
    proposalOutdated:
      'The inputs changed since this proposal was computed. Compute it again before confirming.',
    durationNotAccepted:
      'The audit duration is determined once the application review accepts the application. Reload the Case.',
    amountsInAuditorDays: 'Amounts in auditor-days.',
    ruleVersion: 'Rule version',
    basicTime: 'Basic time (TD)',
    haccpTime: 'Additional HACCP studies (TH)',
    fteTime: 'Effective workforce (TFTE)',
    baseDays: 'Base duration (TD + TH + TFTE)',
    netAdjustment: 'Net adjustment',
    percentValue: '{percent}%',
    initialOnSite: 'Initial audit on site',
    initialTotal: 'Initial audit in total',
    stage1OnSite: 'Stage 1 on site',
    stage2OnSite: 'Stage 2 on site',
    surveillanceOnSite: 'Surveillance audit on site',
    surveillanceTotal: 'Surveillance audit in total',
    recertificationOnSite: 'Recertification audit on site',
    recertificationTotal: 'Recertification audit in total',
    warningsTitle: 'Points to check',
    warningSurveillanceBelowOneDay:
      'The surveillance audit is below one auditor-day on site.',
    warningRecertificationBelowOneDay:
      'The recertification audit is below one auditor-day on site.',
    warningStage2BelowOneDay: 'Stage 2 is below one auditor-day on site.',
    durationManual:
      'The effective workforce falls where the calculator’s workforce bands overlap, so no proposal is computed. Enter the auditor-days and justify them.',
    refusalsTitle: 'No proposal can be computed:',
    refusalPrimaryNotSelected:
      'The primary subcategory must be one of the application’s subcategories.',
    refusalPrimaryNotHighestBasicTime:
      'Another subcategory of the application has a higher basic time. Choose it as the primary subcategory.',
    refusalHaccpStudiesMismatch:
      'The HACCP studies must add up to the application’s count, for its subcategories only, with at least one study in the primary subcategory.',
    refusalReductionFactorCap: 'A reduction factor exceeds 10%.',
    refusalReductionTotalCap: 'The reduction factors exceed 20% together.',
    confirmDuration: 'Confirm the audit duration',
    correctDuration: 'Correct the audit duration',
    confirmHelp:
      'Auditor-days with at most two decimals, prefilled with the proposal rounded to hundredths. Stage 1 and Stage 2 add up to the initial audit on site.',
    justification: 'Justification',
    justificationRequiredHint:
      'Required: factors are used, the duration is determined manually or a value differs from the rounded proposal.',
    durationValuesValidation:
      'Enter every confirmed value as auditor-days above zero and below 1,000, with at most two decimals.',
    durationStagesMismatch:
      'Stage 1 and Stage 2 on site must add up to the initial audit on site.',
    durationJustificationRequired:
      'Justify the factors used, a manual determination or any value other than the rounded proposal (at most 4,000 characters).',
    durationRefused:
      'The server refused these inputs. Compute the proposal again to see why.',
    blockedDurationCorrectionReason:
      'A correction needs a reason and a first determination has none. Reload the Case before saving again.',
    computation: 'Computation',
    computationProposal: 'Computed proposal',
    computationManual: 'Manual determination: the workforce bands overlap',
    confirmedDays: 'Confirmed auditor-days',
    noFactor: 'None',
    showProposal: 'Show the computed proposal',

    documentsTitle: 'Dossier register',
    documentsHelp:
      'Exact PDFs received from the Client and attached to this Case, in the order they were attached. Each attachment keeps the exact version and its SHA-256 fingerprint.',
    documentsEmpty: 'No document is attached to this Case yet.',
    documentRole: 'Role',
    documentFile: 'File',
    documentSize: 'Size',
    documentDigest: 'SHA-256 fingerprint',
    documentDigestShow: 'Show the full fingerprint',
    documentAttachedBy: 'Attached by',
    documentAttachedAt: 'Attached on',
    documentVersionOf: '{title} — version {version}',
    documentReference: '{title} — version {version} ({file})',
    documentDownload: 'Download {title} — version {version}',
    documentDownloading: 'Downloading the PDF…',
    documentDownloadFailed:
      'The PDF could not be downloaded, or its bytes did not match the recorded fingerprint. Try again.',
    documentDownloadUnavailable:
      'This attached PDF is no longer available. Reload the Case.',
    documentsDenied:
      'Your Document rights on this Client’s received PDFs could not be confirmed. They are being checked again; the Case stays available.',
    documentsNoContentRights:
      'Opening the attached PDFs requires the right to read the content of this Client’s received audit sources (Documents).',
    attachNoRights:
      'Attaching a document requires the right to read the content of this Client’s received audit sources (Documents).',
    roleQuestionnaire: 'Application questionnaire',
    roleIso22000Annex: 'ISO 22000 annex',
    roleAgreement: 'Certification agreement',
    rolePlan: 'Audit plan',
    roleParticipantList: 'Participant list',
    roleReport: 'Audit report',
    roleEvidence: 'Evidence',
    roleCertificate: 'Certificate',
    roleOther: 'Other document',
    attachToggle: 'Attach a document',
    attachTitle: 'Attach a document',
    attachHelp:
      'Choose an exact PDF received from this Case’s Client and the role it plays in the dossier. The attachment keeps that exact version, even if the document changes later.',
    eligibleDocument: 'Received PDF',
    selectEligibleDocument: 'Select a received PDF',
    eligibleAttached: '{title} — version {version} (already attached)',
    eligibleLoading: 'Loading the Client’s received PDFs…',
    eligibleUnavailable:
      'The Client’s received PDFs could not be loaded. Try again.',
    eligibleEmpty:
      'No received PDF of this Client can be attached yet. In the Documents workspace, register the signed original as a received audit source of this Client, upload its PDF and designate that version official. It then appears here.',
    eligibleTruncated: 'Only the 25 most recently registered PDFs are listed.',
    selectDocumentRole: 'Select a role',
    attachSubmit: 'Attach the document',
    attachValidation:
      'Choose a received PDF that is not attached yet and its role. A note has at most 1,000 characters.',
    attachDuplicate:
      'This exact document version is already attached to the Case. Reload the Case and choose another document.',
    attachUnavailable:
      'This PDF is no longer available for this Case’s Client. Choose another one or reload the list.',
    agreementTitle: 'Certification agreement',
    agreementMissing: 'No certification agreement is recorded yet.',
    agreementHelp:
      'Record the date the agreement was signed and the signed original attached in the dossier register with the role Certification agreement.',
    agreementSignedOn: 'Signed on',
    agreementDocument: 'Signed original',
    selectAgreementDocument: 'Select the signed original',
    agreementNoDocument:
      'No document is attached with the role Certification agreement yet. Attach the signed original in the dossier register first.',
    recordAgreement: 'Record the agreement',
    correctAgreement: 'Correct the agreement',
    agreementValidation:
      'Enter the signature date and choose a document attached with the role Certification agreement.',
    agreementInFuture:
      'The agreement cannot be signed after today. Check the signature date.',
    agreementDocumentRole:
      'The chosen document is not attached with the role Certification agreement. Reload the Case and choose the signed original.',
    blockedAgreementBeforeDuration:
      'The agreement is recorded once the audit duration is confirmed. Reload the Case.',
    blockedAgreementCorrectionReason:
      'A correction needs a reason and a first agreement has none. Reload the Case before saving again.',

    teamTitle: 'Audit team',
    teamMissing: 'No audit team is proposed yet.',
    teamHelp:
      'Propose the members who will audit this Case. The team has exactly one team leader, and the client’s food chain category is held by the team leader or, failing that, by a technical expert. Each member answers the four impartiality declarations explicitly; a “no” needs a description of the conflict.',
    teamMember: 'Member {number}',
    teamMemberName: 'Name',
    teamMemberRole: 'Role in the team',
    selectTeamRole: 'Select a role',
    teamRoleLeader: 'Team leader',
    teamRoleAuditor: 'Auditor',
    teamRoleTechnicalExpert: 'Technical expert',
    teamRoleObserver: 'Observer',
    teamMemberLink: 'Workspace member',
    teamMemberNotLinked: 'Not linked',
    teamMemberLinkHelp:
      'Optional. Only people already known in this Case can be linked: you and those who recorded a step or attached a document. A link lets the server keep that person from approving the team.',
    teamMemberLinkedUnknown: 'Linked to a Workspace member',
    teamMemberYou: '{name} (you)',
    holdsCategory: 'Holds the client’s food chain category',
    competenceNote: 'Competence',
    declarations: 'Impartiality declarations',
    declarationNoConsultancy: 'Provided no consultancy to the client',
    declarationNoEmployment: 'Was not employed by the client',
    declarationNoManagementInvolvement:
      'Has no involvement in the client’s management',
    declarationConfidentiality: 'Committed to confidentiality',
    conflictNote: 'Description of the conflict',
    conflictNoteHelp:
      'Required because a declaration is answered no. A team with a declared conflict can be proposed, but it can only be returned, not approved.',
    conflictDeclared: 'Conflict declared',
    addTeamMember: 'Add a member',
    removeTeamMember: 'Remove member {number}',
    proposeTeam: 'Propose the team',
    correctTeam: 'Propose a new team version',
    teamCorrectionHelp:
      'A new version replaces the current proposal, states its reason and needs a new decision by an approver. Earlier versions stay in the timeline.',
    teamValidation:
      'Complete every member: a name (at most 200 characters), a role, a competence note (at most 1,000 characters) and a yes or no answer to each declaration. A team has one to ten members.',
    teamConflictNoteRequired:
      'Describe the conflict (at most 1,000 characters) for every member with a declaration answered no.',
    teamLinkInvalid:
      'A Workspace member can be linked to one team member only. Choose another person or leave the link empty.',
    teamLeaderRule: 'A team has exactly one team leader. Check the roles.',
    teamCategoryRule:
      'The team must hold the client’s category: the team leader holds it or, failing that, a technical expert who holds it joins the team. Observers do not count.',
    teamMemberUnknown:
      'A linked Workspace member is no longer active. Change that link or leave it empty.',
    blockedTeamBeforeAgreement:
      'The audit team is proposed once the certification agreement is recorded. Reload the Case.',
    blockedTeamCorrectionReason:
      'A new team version needs a reason and a first proposal has none. Reload the Case before saving again.',
    teamStatusPending: 'Awaiting a decision',
    teamStatusApproved: 'Approved',
    teamStatusReturned: 'Returned',
    teamReturnedNote:
      'An approver returned this team. Propose a new version that answers the reason given.',
    teamAwaitingApprover:
      'An approver who is not on the team decides on this proposal.',
    decisionTitle: 'Team decision',
    decisionMissing: 'No decision is recorded yet.',
    decisionHelp:
      'Decide on team version {version}: approve it, or return it to the programme manager with a reason.',
    decisionChoice: 'Decision',
    decisionApprove: 'Approve the team',
    decisionReturn: 'Return the team',
    decisionReason: 'Reason for returning',
    recordDecision: 'Record the decision',
    decisionTeamVersion: 'Team version',
    decisionApproved: 'Approved',
    decisionReturned: 'Returned',
    decisionEarlierVersion:
      'This decision concerns team version {decided}. Version {current} awaits a decision.',
    decisionValidation:
      'Choose a decision. Returning the team needs a reason (at most 2,000 characters).',
    decisionConflictOnly:
      'A member of this team declared a conflict of interest, so the team cannot be approved. Return it with a reason.',
    teamConflictDeclared:
      'A team with a declared conflict of interest cannot be approved. Return it with a reason.',
    teamIndependence:
      'You cannot decide on this team: you are linked to a member of one of its versions. An approver who is not on the team must decide.',
    blockedTeamNotPending:
      'No proposed team awaits a decision any more. Reload the Case.',

    timelineTitle: 'Timeline',
    timelineEmpty: 'No step recorded yet.',
    timelineApplication: 'Application — version {version}',
    timelineReview: 'Application review — {outcome}',
    timelineDuration: 'Audit duration — version {version}',
    timelineAgreement: 'Certification agreement — version {version}',
    timelineTeam: 'Audit team — version {version}',
    timelineTeamDecision: 'Team decision — {decision} (team version {version})',
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
    approverBundle: 'Approbateur de certification de la société',
    approverPrerequisites:
      'Un approbateur de certification n’agit que s’il détient aussi le droit de lecteur de certification dans la même Société. Un approbateur lié à un membre d’une équipe proposée ne peut pas statuer sur cette équipe.',
    approverGranted: 'a accordé le droit d’approbateur de certification',
    approverRevoked: 'a révoqué le droit d’approbateur de certification',

    title: 'Certification',
    introduction:
      'Dossiers de certification de ce Projet : la demande du client, sa revue, la durée d’audit, les originaux signés joints, le contrat de certification et l’équipe d’audit avec son approbation, avec chaque version enregistrée.',
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
    nextAgreement: 'Contrat de certification',
    nextTeam: 'Équipe d’audit',
    nextTeamDecision: 'Décision sur l’équipe',
    nextStage1Plan: 'Plan d’audit de l’étape 1',
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
    stepAgreement: 'Contrat de certification',
    stepRecorded: 'Enregistrée — version {version}',
    stepToRecord: 'À enregistrer',
    stepWaiting: 'Attend la demande',
    stepWaitingReview: 'Attend la revue acceptée',
    stepWaitingDuration: 'Attend la durée confirmée',
    stepAccepted: 'Acceptée',
    stepRejected: 'Rejetée',
    stepClosed: 'Sans objet : le dossier est clos',
    stepTeam: 'Équipe d’audit',
    stepTeamDecision: 'Décision sur l’équipe',
    stepWaitingAgreement: 'Attend le contrat',
    stepWaitingTeam: 'Attend une équipe proposée',
    stepToDecide: 'À décider — version {version}',
    stepApproved: 'Approuvée — version {version}',
    stepReturned: 'Renvoyée — version {version}',

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
    blockedCorrectionUnchanged:
      'La correction ne change aucune valeur. Modifiez au moins une valeur ou annulez la correction.',
    nextStagePlanPending:
      'L’équipe d’audit est approuvée. L’étape suivante, le plan d’audit de l’étape 1, n’est pas encore disponible dans cette version.',

    durationTitle: 'Durée d’audit',
    durationMissing: 'Aucune durée d’audit n’est encore confirmée.',
    durationHelp:
      'Le calculateur propose les jours-auditeur à partir de la demande acceptée et des facteurs que vous indiquez. Confirmez la proposition ou ajustez-la avec une justification.',
    durationInputs: 'Données de la durée',
    primarySubcategory: 'Sous-catégorie principale',
    selectPrimarySubcategory: 'Choisir la sous-catégorie principale',
    primarySubcategoryHelp:
      'La sous-catégorie de la demande dont le temps de base est le plus élevé.',
    haccpStudiesPerSubcategory: 'Études HACCP par sous-catégorie',
    haccpStudiesFor: 'Études HACCP en {code}',
    haccpStudiesTotal:
      'Total : {total} sur les {declared} études HACCP déclarées dans la demande.',
    increaseFactors: 'Facteurs d’augmentation (%)',
    increaseFactorsHelp:
      'Pourcentages entiers de 0 à 100. Tout facteur supérieur à 0 exige une justification.',
    reductionFactors: 'Facteurs de réduction (%)',
    reductionFactorsHelp:
      'Pourcentages entiers, 10 % au plus chacun et 20 % au plus ensemble. Tout facteur supérieur à 0 exige une justification.',
    factorProductTypes: 'Nombre de types de produits',
    factorProductLines: 'Nombre de lignes de production',
    factorProductDevelopment: 'Développement de produits',
    factorCriticalControlPoints: 'Nombre de points critiques pour la maîtrise',
    factorOperationalPrerequisites:
      'Nombre de programmes prérequis opérationnels',
    factorConstructionSites: 'Chantiers',
    factorComplexInfrastructure: 'Infrastructure complexe',
    factorOnSiteLaboratory: 'Laboratoire sur site',
    factorRemoteAuditTechnology: 'Technologie d’audit à distance',
    factorInterpreter: 'Interprète',
    factorSystemMaturity: 'Maturité du système de management',
    factorPriorCertification: 'Certification antérieure',
    factorTransferPreparedness: 'Préparation au transfert',
    factorAutomation: 'Automatisation',
    computeProposal: 'Calculer la proposition',
    computing: 'Calcul…',
    durationInputsValidation:
      'Choisissez la sous-catégorie principale et saisissez des nombres entiers : de 0 à 999 études HACCP par sous-catégorie et des pourcentages de facteurs de 0 à 100.',
    haccpStudiesMismatch:
      'Les études HACCP par sous-catégorie doivent totaliser le nombre déclaré dans la demande.',
    proposalTitle: 'Proposition',
    proposalUnavailable: 'La proposition n’a pas pu être calculée. Réessayez.',
    proposalOutdated:
      'Les données ont changé depuis le calcul de cette proposition. Recalculez-la avant de confirmer.',
    durationNotAccepted:
      'La durée d’audit se détermine une fois la demande acceptée par la revue. Rechargez le dossier.',
    amountsInAuditorDays: 'Montants en jours-auditeur.',
    ruleVersion: 'Version de la règle',
    basicTime: 'Temps de base (TD)',
    haccpTime: 'Études HACCP supplémentaires (TH)',
    fteTime: 'Effectif (TFTE)',
    baseDays: 'Durée de base (TD + TH + TFTE)',
    netAdjustment: 'Ajustement net',
    percentValue: '{percent} %',
    initialOnSite: 'Audit initial sur site',
    initialTotal: 'Audit initial au total',
    stage1OnSite: 'Étape 1 sur site',
    stage2OnSite: 'Étape 2 sur site',
    surveillanceOnSite: 'Audit de surveillance sur site',
    surveillanceTotal: 'Audit de surveillance au total',
    recertificationOnSite: 'Audit de renouvellement sur site',
    recertificationTotal: 'Audit de renouvellement au total',
    warningsTitle: 'Points à vérifier',
    warningSurveillanceBelowOneDay:
      'L’audit de surveillance est inférieur à un jour-auditeur sur site.',
    warningRecertificationBelowOneDay:
      'L’audit de renouvellement est inférieur à un jour-auditeur sur site.',
    warningStage2BelowOneDay:
      'L’étape 2 est inférieure à un jour-auditeur sur site.',
    durationManual:
      'L’effectif se situe là où les tranches d’effectif du calculateur se chevauchent : aucune proposition n’est calculée. Saisissez les jours-auditeur et justifiez-les.',
    refusalsTitle: 'Aucune proposition ne peut être calculée :',
    refusalPrimaryNotSelected:
      'La sous-catégorie principale doit être l’une des sous-catégories de la demande.',
    refusalPrimaryNotHighestBasicTime:
      'Une autre sous-catégorie de la demande a un temps de base plus élevé. Choisissez-la comme sous-catégorie principale.',
    refusalHaccpStudiesMismatch:
      'Les études HACCP doivent totaliser le nombre de la demande, pour ses seules sous-catégories, avec au moins une étude dans la sous-catégorie principale.',
    refusalReductionFactorCap: 'Un facteur de réduction dépasse 10 %.',
    refusalReductionTotalCap:
      'Les facteurs de réduction dépassent 20 % ensemble.',
    confirmDuration: 'Confirmer la durée d’audit',
    correctDuration: 'Corriger la durée d’audit',
    confirmHelp:
      'Jours-auditeur avec deux décimales au plus, préremplis avec la proposition arrondie au centième. L’étape 1 et l’étape 2 totalisent l’audit initial sur site.',
    justification: 'Justification',
    justificationRequiredHint:
      'Obligatoire : des facteurs sont utilisés, la durée est déterminée manuellement ou une valeur diffère de la proposition arrondie.',
    durationValuesValidation:
      'Saisissez chaque valeur confirmée en jours-auditeur, supérieure à zéro et inférieure à 1 000, avec deux décimales au plus.',
    durationStagesMismatch:
      'L’étape 1 et l’étape 2 sur site doivent totaliser l’audit initial sur site.',
    durationJustificationRequired:
      'Justifiez les facteurs utilisés, une détermination manuelle ou toute valeur autre que la proposition arrondie (4 000 caractères au plus).',
    durationRefused:
      'Le serveur a refusé ces données. Recalculez la proposition pour en connaître la raison.',
    blockedDurationCorrectionReason:
      'Une correction exige un motif et une première détermination n’en a pas. Rechargez le dossier avant d’enregistrer à nouveau.',
    computation: 'Calcul',
    computationProposal: 'Proposition calculée',
    computationManual:
      'Détermination manuelle : les tranches d’effectif se chevauchent',
    confirmedDays: 'Jours-auditeur confirmés',
    noFactor: 'Aucun',
    showProposal: 'Afficher la proposition calculée',

    documentsTitle: 'Registre des pièces',
    documentsHelp:
      'PDF exacts reçus du Client et joints à ce dossier, dans l’ordre où ils ont été joints. Chaque pièce conserve la version exacte et son empreinte SHA-256.',
    documentsEmpty: 'Aucune pièce n’est encore jointe à ce dossier.',
    documentRole: 'Rôle',
    documentFile: 'Fichier',
    documentSize: 'Taille',
    documentDigest: 'Empreinte SHA-256',
    documentDigestShow: 'Afficher l’empreinte complète',
    documentAttachedBy: 'Jointe par',
    documentAttachedAt: 'Jointe le',
    documentVersionOf: '{title} — version {version}',
    documentReference: '{title} — version {version} ({file})',
    documentDownload: 'Télécharger {title} — version {version}',
    documentDownloading: 'Téléchargement du PDF…',
    documentDownloadFailed:
      'Le PDF n’a pas pu être téléchargé, ou ses octets ne correspondent pas à l’empreinte enregistrée. Réessayez.',
    documentDownloadUnavailable:
      'Ce PDF joint n’est plus disponible. Rechargez le dossier.',
    documentsDenied:
      'Vos droits Documents sur les PDF reçus de ce Client n’ont pas pu être confirmés. Ils sont vérifiés à nouveau ; le dossier reste disponible.',
    documentsNoContentRights:
      'L’ouverture des PDF joints exige le droit de lire le contenu des sources d’audit reçues de ce Client (Documents).',
    attachNoRights:
      'Joindre un document exige le droit de lire le contenu des sources d’audit reçues de ce Client (Documents).',
    roleQuestionnaire: 'Questionnaire de demande',
    roleIso22000Annex: 'Annexe ISO 22000',
    roleAgreement: 'Contrat de certification',
    rolePlan: 'Plan d’audit',
    roleParticipantList: 'Liste des participants',
    roleReport: 'Rapport d’audit',
    roleEvidence: 'Preuve',
    roleCertificate: 'Certificat',
    roleOther: 'Autre document',
    attachToggle: 'Joindre un document',
    attachTitle: 'Joindre un document',
    attachHelp:
      'Choisissez un PDF exact reçu du Client de ce dossier et le rôle qu’il y joue. La pièce conserve cette version exacte, même si le document change ensuite.',
    eligibleDocument: 'PDF reçu',
    selectEligibleDocument: 'Sélectionnez un PDF reçu',
    eligibleAttached: '{title} — version {version} (déjà joint)',
    eligibleLoading: 'Chargement des PDF reçus du Client…',
    eligibleUnavailable:
      'Les PDF reçus du Client n’ont pas pu être chargés. Réessayez.',
    eligibleEmpty:
      'Aucun PDF reçu de ce Client ne peut encore être joint. Dans l’espace Documents, enregistrez l’original signé comme source d’audit reçue de ce Client, téléversez son PDF et désignez cette version comme officielle. Il apparaît alors ici.',
    eligibleTruncated:
      'Seuls les 25 PDF enregistrés le plus récemment sont listés.',
    selectDocumentRole: 'Sélectionnez un rôle',
    attachSubmit: 'Joindre le document',
    attachValidation:
      'Choisissez un PDF reçu qui n’est pas encore joint et son rôle. Une note compte 1 000 caractères au plus.',
    attachDuplicate:
      'Cette version exacte du document est déjà jointe au dossier. Rechargez le dossier et choisissez un autre document.',
    attachUnavailable:
      'Ce PDF n’est plus disponible pour le Client de ce dossier. Choisissez-en un autre ou rechargez la liste.',
    agreementTitle: 'Contrat de certification',
    agreementMissing: 'Aucun contrat de certification n’est encore enregistré.',
    agreementHelp:
      'Enregistrez la date de signature du contrat et l’original signé joint au registre des pièces avec le rôle Contrat de certification.',
    agreementSignedOn: 'Signé le',
    agreementDocument: 'Original signé',
    selectAgreementDocument: 'Sélectionnez l’original signé',
    agreementNoDocument:
      'Aucun document n’est encore joint avec le rôle Contrat de certification. Joignez d’abord l’original signé au registre des pièces.',
    recordAgreement: 'Enregistrer le contrat',
    correctAgreement: 'Corriger le contrat',
    agreementValidation:
      'Saisissez la date de signature et choisissez un document joint avec le rôle Contrat de certification.',
    agreementInFuture:
      'Le contrat ne peut pas être signé après aujourd’hui. Vérifiez la date de signature.',
    agreementDocumentRole:
      'Le document choisi n’est pas joint avec le rôle Contrat de certification. Rechargez le dossier et choisissez l’original signé.',
    blockedAgreementBeforeDuration:
      'Le contrat s’enregistre une fois la durée d’audit confirmée. Rechargez le dossier.',
    blockedAgreementCorrectionReason:
      'Une correction exige un motif et un premier contrat n’en a pas. Rechargez le dossier avant d’enregistrer à nouveau.',

    teamTitle: 'Équipe d’audit',
    teamMissing: 'Aucune équipe d’audit n’est encore proposée.',
    teamHelp:
      'Proposez les membres qui auditeront ce dossier. L’équipe compte exactement un responsable d’équipe, et la catégorie de la chaîne alimentaire du client est détenue par le responsable d’équipe ou, à défaut, par un expert technique. Chaque membre répond explicitement aux quatre déclarations d’impartialité ; un « non » exige une description du conflit.',
    teamMember: 'Membre {number}',
    teamMemberName: 'Nom',
    teamMemberRole: 'Rôle dans l’équipe',
    selectTeamRole: 'Sélectionnez un rôle',
    teamRoleLeader: 'Responsable d’équipe',
    teamRoleAuditor: 'Auditeur',
    teamRoleTechnicalExpert: 'Expert technique',
    teamRoleObserver: 'Observateur',
    teamMemberLink: 'Membre de l’espace de travail',
    teamMemberNotLinked: 'Non lié',
    teamMemberLinkHelp:
      'Facultatif. Seules les personnes déjà connues dans ce dossier peuvent être liées : vous et celles qui ont enregistré une étape ou joint un document. Un lien permet au serveur d’empêcher cette personne d’approuver l’équipe.',
    teamMemberLinkedUnknown: 'Lié à un membre de l’espace de travail',
    teamMemberYou: '{name} (vous)',
    holdsCategory: 'Détient la catégorie de la chaîne alimentaire du client',
    competenceNote: 'Compétence',
    declarations: 'Déclarations d’impartialité',
    declarationNoConsultancy: 'N’a fourni aucun conseil au client',
    declarationNoEmployment: 'N’a pas été employé par le client',
    declarationNoManagementInvolvement:
      'N’intervient pas dans la direction du client',
    declarationConfidentiality: 'S’est engagé à la confidentialité',
    conflictNote: 'Description du conflit',
    conflictNoteHelp:
      'Obligatoire, car une déclaration a pour réponse non. Une équipe avec un conflit déclaré peut être proposée, mais elle ne peut qu’être renvoyée, pas approuvée.',
    conflictDeclared: 'Conflit déclaré',
    addTeamMember: 'Ajouter un membre',
    removeTeamMember: 'Retirer le membre {number}',
    proposeTeam: 'Proposer l’équipe',
    correctTeam: 'Proposer une nouvelle version de l’équipe',
    teamCorrectionHelp:
      'Une nouvelle version remplace la proposition actuelle, indique son motif et exige une nouvelle décision d’un approbateur. Les versions antérieures restent dans la chronologie.',
    teamValidation:
      'Complétez chaque membre : un nom (200 caractères au plus), un rôle, une note de compétence (1 000 caractères au plus) et une réponse oui ou non à chaque déclaration. Une équipe compte un à dix membres.',
    teamConflictNoteRequired:
      'Décrivez le conflit (1 000 caractères au plus) pour chaque membre ayant répondu non à une déclaration.',
    teamLinkInvalid:
      'Un membre de l’espace de travail ne peut être lié qu’à un seul membre de l’équipe. Choisissez une autre personne ou laissez le lien vide.',
    teamLeaderRule:
      'Une équipe compte exactement un responsable d’équipe. Vérifiez les rôles.',
    teamCategoryRule:
      'L’équipe doit détenir la catégorie du client : le responsable d’équipe la détient ou, à défaut, un expert technique qui la détient rejoint l’équipe. Les observateurs ne comptent pas.',
    teamMemberUnknown:
      'Un membre lié de l’espace de travail n’est plus actif. Modifiez ce lien ou laissez-le vide.',
    blockedTeamBeforeAgreement:
      'L’équipe d’audit se propose une fois le contrat de certification enregistré. Rechargez le dossier.',
    blockedTeamCorrectionReason:
      'Une nouvelle version de l’équipe exige un motif et une première proposition n’en a pas. Rechargez le dossier avant d’enregistrer à nouveau.',
    teamStatusPending: 'En attente de décision',
    teamStatusApproved: 'Approuvée',
    teamStatusReturned: 'Renvoyée',
    teamReturnedNote:
      'Un approbateur a renvoyé cette équipe. Proposez une nouvelle version qui répond au motif donné.',
    teamAwaitingApprover:
      'Un approbateur qui ne fait pas partie de l’équipe statue sur cette proposition.',
    decisionTitle: 'Décision sur l’équipe',
    decisionMissing: 'Aucune décision n’est encore enregistrée.',
    decisionHelp:
      'Statuez sur la version {version} de l’équipe : approuvez-la, ou renvoyez-la au responsable de programme avec un motif.',
    decisionChoice: 'Décision',
    decisionApprove: 'Approuver l’équipe',
    decisionReturn: 'Renvoyer l’équipe',
    decisionReason: 'Motif du renvoi',
    recordDecision: 'Enregistrer la décision',
    decisionTeamVersion: 'Version de l’équipe',
    decisionApproved: 'Approuvée',
    decisionReturned: 'Renvoyée',
    decisionEarlierVersion:
      'Cette décision concerne la version {decided} de l’équipe. La version {current} attend une décision.',
    decisionValidation:
      'Choisissez une décision. Le renvoi de l’équipe exige un motif (2 000 caractères au plus).',
    decisionConflictOnly:
      'Un membre de cette équipe a déclaré un conflit d’intérêts : l’équipe ne peut pas être approuvée. Renvoyez-la avec un motif.',
    teamConflictDeclared:
      'Une équipe avec un conflit d’intérêts déclaré ne peut pas être approuvée. Renvoyez-la avec un motif.',
    teamIndependence:
      'Vous ne pouvez pas statuer sur cette équipe : vous êtes lié à un membre de l’une de ses versions. Un approbateur qui ne fait pas partie de l’équipe doit statuer.',
    blockedTeamNotPending:
      'Aucune équipe proposée n’attend plus de décision. Rechargez le dossier.',

    timelineTitle: 'Chronologie',
    timelineEmpty: 'Aucune étape enregistrée pour l’instant.',
    timelineApplication: 'Demande — version {version}',
    timelineReview: 'Revue de la demande — {outcome}',
    timelineDuration: 'Durée d’audit — version {version}',
    timelineAgreement: 'Contrat de certification — version {version}',
    timelineTeam: 'Équipe d’audit — version {version}',
    timelineTeamDecision:
      'Décision sur l’équipe — {decision} (version {version} de l’équipe)',
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
    approverBundle: 'Aprobator de certificare al companiei',
    approverPrerequisites:
      'Un aprobator de certificare acționează doar dacă deține și dreptul de cititor de certificare în aceeași Companie. Un aprobator legat de un membru al unei echipe propuse nu poate decide asupra acelei echipe.',
    approverGranted: 'a acordat dreptul de aprobator de certificare',
    approverRevoked: 'a revocat dreptul de aprobator de certificare',

    title: 'Certificare',
    introduction:
      'Dosarele de certificare ale acestui Proiect: cererea clientului, analiza ei, durata auditului, originalele semnate atașate, contractul de certificare și echipa de audit cu aprobarea ei, cu fiecare versiune înregistrată.',
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
    nextAgreement: 'Contractul de certificare',
    nextTeam: 'Echipa de audit',
    nextTeamDecision: 'Decizia privind echipa',
    nextStage1Plan: 'Planul auditului de etapa 1',
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
    stepAgreement: 'Contractul de certificare',
    stepRecorded: 'Înregistrată — versiunea {version}',
    stepToRecord: 'De înregistrat',
    stepWaiting: 'Așteaptă cererea',
    stepWaitingReview: 'Așteaptă analiza acceptată',
    stepWaitingDuration: 'Așteaptă durata confirmată',
    stepAccepted: 'Acceptată',
    stepRejected: 'Respinsă',
    stepClosed: 'Nu se aplică: dosarul este închis',
    stepTeam: 'Echipa de audit',
    stepTeamDecision: 'Decizia privind echipa',
    stepWaitingAgreement: 'Așteaptă contractul',
    stepWaitingTeam: 'Așteaptă o echipă propusă',
    stepToDecide: 'De decis — versiunea {version}',
    stepApproved: 'Aprobată — versiunea {version}',
    stepReturned: 'Returnată — versiunea {version}',

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
    blockedCorrectionUnchanged:
      'Corectarea nu schimbă nicio valoare. Modificați cel puțin o valoare sau anulați corectarea.',
    nextStagePlanPending:
      'Echipa de audit este aprobată. Etapa următoare, planul auditului de etapa 1, nu este încă disponibilă în această versiune.',

    durationTitle: 'Durata auditului',
    durationMissing: 'Nicio durată a auditului nu este încă confirmată.',
    durationHelp:
      'Calculatorul propune zilele-auditor pe baza cererii acceptate și a factorilor pe care îi indicați. Confirmați propunerea sau ajustați-o cu o justificare.',
    durationInputs: 'Datele duratei',
    primarySubcategory: 'Subcategoria principală',
    selectPrimarySubcategory: 'Alegeți subcategoria principală',
    primarySubcategoryHelp:
      'Subcategoria din cerere cu cel mai mare timp de bază.',
    haccpStudiesPerSubcategory: 'Studii HACCP pe subcategorie',
    haccpStudiesFor: 'Studii HACCP în {code}',
    haccpStudiesTotal:
      'Total: {total} din cele {declared} studii HACCP declarate în cerere.',
    increaseFactors: 'Factori de majorare (%)',
    increaseFactorsHelp:
      'Procente întregi între 0 și 100. Orice factor peste 0 necesită o justificare.',
    reductionFactors: 'Factori de reducere (%)',
    reductionFactorsHelp:
      'Procente întregi, cel mult 10% fiecare și 20% împreună. Orice factor peste 0 necesită o justificare.',
    factorProductTypes: 'Numărul tipurilor de produse',
    factorProductLines: 'Numărul liniilor de producție',
    factorProductDevelopment: 'Dezvoltare de produse',
    factorCriticalControlPoints: 'Numărul punctelor critice de control',
    factorOperationalPrerequisites:
      'Numărul programelor preliminare operaționale',
    factorConstructionSites: 'Șantiere',
    factorComplexInfrastructure: 'Infrastructură complexă',
    factorOnSiteLaboratory: 'Laborator pe amplasament',
    factorRemoteAuditTechnology: 'Tehnologie de audit la distanță',
    factorInterpreter: 'Interpret',
    factorSystemMaturity: 'Maturitatea sistemului de management',
    factorPriorCertification: 'Certificare anterioară',
    factorTransferPreparedness: 'Pregătire pentru transfer',
    factorAutomation: 'Automatizare',
    computeProposal: 'Calculați propunerea',
    computing: 'Se calculează…',
    durationInputsValidation:
      'Alegeți subcategoria principală și introduceți numere întregi: între 0 și 999 de studii HACCP pe subcategorie și procente ale factorilor între 0 și 100.',
    haccpStudiesMismatch:
      'Studiile HACCP pe subcategorie trebuie să totalizeze numărul declarat în cerere.',
    proposalTitle: 'Propunere',
    proposalUnavailable: 'Propunerea nu a putut fi calculată. Reîncercați.',
    proposalOutdated:
      'Datele s-au modificat de la calcularea acestei propuneri. Recalculați-o înainte de confirmare.',
    durationNotAccepted:
      'Durata auditului se stabilește după ce analiza acceptă cererea. Reîncărcați dosarul.',
    amountsInAuditorDays: 'Valori în zile-auditor.',
    ruleVersion: 'Versiunea regulii',
    basicTime: 'Timp de bază (TD)',
    haccpTime: 'Studii HACCP suplimentare (TH)',
    fteTime: 'Personal efectiv (TFTE)',
    baseDays: 'Durata de bază (TD + TH + TFTE)',
    netAdjustment: 'Ajustare netă',
    percentValue: '{percent}%',
    initialOnSite: 'Auditul inițial pe amplasament',
    initialTotal: 'Auditul inițial în total',
    stage1OnSite: 'Etapa 1 pe amplasament',
    stage2OnSite: 'Etapa 2 pe amplasament',
    surveillanceOnSite: 'Auditul de supraveghere pe amplasament',
    surveillanceTotal: 'Auditul de supraveghere în total',
    recertificationOnSite: 'Auditul de recertificare pe amplasament',
    recertificationTotal: 'Auditul de recertificare în total',
    warningsTitle: 'De verificat',
    warningSurveillanceBelowOneDay:
      'Auditul de supraveghere are sub o zi-auditor pe amplasament.',
    warningRecertificationBelowOneDay:
      'Auditul de recertificare are sub o zi-auditor pe amplasament.',
    warningStage2BelowOneDay: 'Etapa 2 are sub o zi-auditor pe amplasament.',
    durationManual:
      'Personalul efectiv se află acolo unde intervalele de personal ale calculatorului se suprapun, deci nu se calculează nicio propunere. Introduceți zilele-auditor și justificați-le.',
    refusalsTitle: 'Nu se poate calcula nicio propunere:',
    refusalPrimaryNotSelected:
      'Subcategoria principală trebuie să fie una dintre subcategoriile cererii.',
    refusalPrimaryNotHighestBasicTime:
      'O altă subcategorie a cererii are un timp de bază mai mare. Alegeți-o ca subcategorie principală.',
    refusalHaccpStudiesMismatch:
      'Studiile HACCP trebuie să totalizeze numărul din cerere, doar pentru subcategoriile ei, cu cel puțin un studiu în subcategoria principală.',
    refusalReductionFactorCap: 'Un factor de reducere depășește 10%.',
    refusalReductionTotalCap: 'Factorii de reducere depășesc împreună 20%.',
    confirmDuration: 'Confirmați durata auditului',
    correctDuration: 'Corectați durata auditului',
    confirmHelp:
      'Zile-auditor cu cel mult două zecimale, precompletate cu propunerea rotunjită la sutimi. Etapa 1 și etapa 2 totalizează auditul inițial pe amplasament.',
    justification: 'Justificare',
    justificationRequiredHint:
      'Obligatorie: se folosesc factori, durata este stabilită manual sau o valoare diferă de propunerea rotunjită.',
    durationValuesValidation:
      'Introduceți fiecare valoare confirmată în zile-auditor, peste zero și sub 1.000, cu cel mult două zecimale.',
    durationStagesMismatch:
      'Etapa 1 și etapa 2 pe amplasament trebuie să totalizeze auditul inițial pe amplasament.',
    durationJustificationRequired:
      'Justificați factorii folosiți, o stabilire manuală sau orice valoare diferită de propunerea rotunjită (cel mult 4.000 de caractere).',
    durationRefused:
      'Serverul a refuzat aceste date. Recalculați propunerea pentru a afla motivul.',
    blockedDurationCorrectionReason:
      'O corectare necesită un motiv, iar prima stabilire nu are. Reîncărcați dosarul înainte de o nouă salvare.',
    computation: 'Calcul',
    computationProposal: 'Propunere calculată',
    computationManual: 'Stabilire manuală: intervalele de personal se suprapun',
    confirmedDays: 'Zile-auditor confirmate',
    noFactor: 'Niciunul',
    showProposal: 'Afișați propunerea calculată',

    documentsTitle: 'Registrul documentelor dosarului',
    documentsHelp:
      'PDF-uri exacte primite de la Client și atașate acestui dosar, în ordinea atașării. Fiecare atașament păstrează versiunea exactă și amprenta ei SHA-256.',
    documentsEmpty: 'Niciun document nu este încă atașat acestui dosar.',
    documentRole: 'Rol',
    documentFile: 'Fișier',
    documentSize: 'Dimensiune',
    documentDigest: 'Amprentă SHA-256',
    documentDigestShow: 'Afișați amprenta completă',
    documentAttachedBy: 'Atașat de',
    documentAttachedAt: 'Atașat la',
    documentVersionOf: '{title} — versiunea {version}',
    documentReference: '{title} — versiunea {version} ({file})',
    documentDownload: 'Descărcați {title} — versiunea {version}',
    documentDownloading: 'Se descarcă PDF-ul…',
    documentDownloadFailed:
      'PDF-ul nu a putut fi descărcat sau octeții lui nu corespund amprentei înregistrate. Reîncercați.',
    documentDownloadUnavailable:
      'Acest PDF atașat nu mai este disponibil. Reîncărcați dosarul.',
    documentsDenied:
      'Drepturile dvs. Documente asupra PDF-urilor primite de la acest Client nu au putut fi confirmate. Se verifică din nou; dosarul rămâne disponibil.',
    documentsNoContentRights:
      'Deschiderea PDF-urilor atașate necesită dreptul de a citi conținutul surselor de audit primite de la acest Client (Documente).',
    attachNoRights:
      'Atașarea unui document necesită dreptul de a citi conținutul surselor de audit primite de la acest Client (Documente).',
    roleQuestionnaire: 'Chestionar de cerere',
    roleIso22000Annex: 'Anexa ISO 22000',
    roleAgreement: 'Contract de certificare',
    rolePlan: 'Plan de audit',
    roleParticipantList: 'Lista participanților',
    roleReport: 'Raport de audit',
    roleEvidence: 'Dovadă',
    roleCertificate: 'Certificat',
    roleOther: 'Alt document',
    attachToggle: 'Atașați un document',
    attachTitle: 'Atașați un document',
    attachHelp:
      'Alegeți un PDF exact primit de la Clientul acestui dosar și rolul pe care îl are în dosar. Atașamentul păstrează această versiune exactă, chiar dacă documentul se schimbă ulterior.',
    eligibleDocument: 'PDF primit',
    selectEligibleDocument: 'Selectați un PDF primit',
    eligibleAttached: '{title} — versiunea {version} (deja atașat)',
    eligibleLoading: 'Se încarcă PDF-urile primite de la Client…',
    eligibleUnavailable:
      'PDF-urile primite de la Client nu au putut fi încărcate. Reîncercați.',
    eligibleEmpty:
      'Niciun PDF primit de la acest Client nu poate fi încă atașat. În spațiul Documente, înregistrați originalul semnat ca sursă de audit primită de la acest Client, încărcați PDF-ul lui și desemnați acea versiune ca oficială. Apoi apare aici.',
    eligibleTruncated:
      'Sunt listate doar cele mai recente 25 de PDF-uri înregistrate.',
    selectDocumentRole: 'Selectați un rol',
    attachSubmit: 'Atașați documentul',
    attachValidation:
      'Alegeți un PDF primit care nu este încă atașat și rolul lui. O notă are cel mult 1.000 de caractere.',
    attachDuplicate:
      'Această versiune exactă a documentului este deja atașată dosarului. Reîncărcați dosarul și alegeți alt document.',
    attachUnavailable:
      'Acest PDF nu mai este disponibil pentru Clientul acestui dosar. Alegeți altul sau reîncărcați lista.',
    agreementTitle: 'Contractul de certificare',
    agreementMissing:
      'Niciun contract de certificare nu este încă înregistrat.',
    agreementHelp:
      'Înregistrați data semnării contractului și originalul semnat atașat în registrul documentelor cu rolul Contract de certificare.',
    agreementSignedOn: 'Semnat la',
    agreementDocument: 'Original semnat',
    selectAgreementDocument: 'Selectați originalul semnat',
    agreementNoDocument:
      'Niciun document nu este încă atașat cu rolul Contract de certificare. Atașați mai întâi originalul semnat în registrul documentelor.',
    recordAgreement: 'Înregistrați contractul',
    correctAgreement: 'Corectați contractul',
    agreementValidation:
      'Introduceți data semnării și alegeți un document atașat cu rolul Contract de certificare.',
    agreementInFuture:
      'Contractul nu poate fi semnat după ziua de azi. Verificați data semnării.',
    agreementDocumentRole:
      'Documentul ales nu este atașat cu rolul Contract de certificare. Reîncărcați dosarul și alegeți originalul semnat.',
    blockedAgreementBeforeDuration:
      'Contractul se înregistrează după confirmarea duratei auditului. Reîncărcați dosarul.',
    blockedAgreementCorrectionReason:
      'O corectare necesită un motiv, iar primul contract nu are. Reîncărcați dosarul înainte de o nouă salvare.',

    teamTitle: 'Echipa de audit',
    teamMissing: 'Nicio echipă de audit nu este încă propusă.',
    teamHelp:
      'Propuneți membrii care vor audita acest dosar. Echipa are exact un șef de echipă, iar categoria lanțului alimentar a clientului este deținută de șeful de echipă sau, în lipsă, de un expert tehnic. Fiecare membru răspunde explicit la cele patru declarații de imparțialitate; un „nu” necesită descrierea conflictului.',
    teamMember: 'Membrul {number}',
    teamMemberName: 'Nume',
    teamMemberRole: 'Rolul în echipă',
    selectTeamRole: 'Selectați un rol',
    teamRoleLeader: 'Șef de echipă',
    teamRoleAuditor: 'Auditor',
    teamRoleTechnicalExpert: 'Expert tehnic',
    teamRoleObserver: 'Observator',
    teamMemberLink: 'Membru al spațiului de lucru',
    teamMemberNotLinked: 'Nelegat',
    teamMemberLinkHelp:
      'Opțional. Pot fi legate doar persoanele deja cunoscute în acest dosar: dvs. și cei care au înregistrat o etapă sau au atașat un document. Legătura permite serverului să împiedice acea persoană să aprobe echipa.',
    teamMemberLinkedUnknown: 'Legat de un membru al spațiului de lucru',
    teamMemberYou: '{name} (dvs.)',
    holdsCategory: 'Deține categoria lanțului alimentar a clientului',
    competenceNote: 'Competență',
    declarations: 'Declarații de imparțialitate',
    declarationNoConsultancy: 'Nu a oferit consultanță clientului',
    declarationNoEmployment: 'Nu a fost angajat al clientului',
    declarationNoManagementInvolvement:
      'Nu este implicat în conducerea clientului',
    declarationConfidentiality: 'S-a angajat să păstreze confidențialitatea',
    conflictNote: 'Descrierea conflictului',
    conflictNoteHelp:
      'Obligatorie, deoarece o declarație are răspunsul nu. O echipă cu un conflict declarat poate fi propusă, dar poate fi doar returnată, nu aprobată.',
    conflictDeclared: 'Conflict declarat',
    addTeamMember: 'Adăugați un membru',
    removeTeamMember: 'Eliminați membrul {number}',
    proposeTeam: 'Propuneți echipa',
    correctTeam: 'Propuneți o nouă versiune a echipei',
    teamCorrectionHelp:
      'O nouă versiune înlocuiește propunerea curentă, își declară motivul și necesită o nouă decizie a unui aprobator. Versiunile anterioare rămân în cronologie.',
    teamValidation:
      'Completați fiecare membru: un nume (cel mult 200 de caractere), un rol, o notă de competență (cel mult 1.000 de caractere) și un răspuns da sau nu la fiecare declarație. O echipă are între unu și zece membri.',
    teamConflictNoteRequired:
      'Descrieți conflictul (cel mult 1.000 de caractere) pentru fiecare membru cu o declarație cu răspunsul nu.',
    teamLinkInvalid:
      'Un membru al spațiului de lucru poate fi legat de un singur membru al echipei. Alegeți altă persoană sau lăsați legătura goală.',
    teamLeaderRule: 'O echipă are exact un șef de echipă. Verificați rolurile.',
    teamCategoryRule:
      'Echipa trebuie să dețină categoria clientului: o deține șeful de echipă sau, în lipsă, se alătură echipei un expert tehnic care o deține. Observatorii nu se iau în calcul.',
    teamMemberUnknown:
      'Un membru legat al spațiului de lucru nu mai este activ. Schimbați acea legătură sau lăsați-o goală.',
    blockedTeamBeforeAgreement:
      'Echipa de audit se propune după înregistrarea contractului de certificare. Reîncărcați dosarul.',
    blockedTeamCorrectionReason:
      'O nouă versiune a echipei necesită un motiv, iar prima propunere nu are. Reîncărcați dosarul înainte de o nouă salvare.',
    teamStatusPending: 'Așteaptă o decizie',
    teamStatusApproved: 'Aprobată',
    teamStatusReturned: 'Returnată',
    teamReturnedNote:
      'Un aprobator a returnat această echipă. Propuneți o nouă versiune care răspunde motivului dat.',
    teamAwaitingApprover:
      'Un aprobator care nu face parte din echipă decide asupra acestei propuneri.',
    decisionTitle: 'Decizia privind echipa',
    decisionMissing: 'Nicio decizie nu este încă înregistrată.',
    decisionHelp:
      'Decideți asupra versiunii {version} a echipei: aprobați-o sau returnați-o managerului de program cu un motiv.',
    decisionChoice: 'Decizie',
    decisionApprove: 'Aprobați echipa',
    decisionReturn: 'Returnați echipa',
    decisionReason: 'Motivul returnării',
    recordDecision: 'Înregistrați decizia',
    decisionTeamVersion: 'Versiunea echipei',
    decisionApproved: 'Aprobată',
    decisionReturned: 'Returnată',
    decisionEarlierVersion:
      'Această decizie privește versiunea {decided} a echipei. Versiunea {current} așteaptă o decizie.',
    decisionValidation:
      'Alegeți o decizie. Returnarea echipei necesită un motiv (cel mult 2.000 de caractere).',
    decisionConflictOnly:
      'Un membru al acestei echipe a declarat un conflict de interese, deci echipa nu poate fi aprobată. Returnați-o cu un motiv.',
    teamConflictDeclared:
      'O echipă cu un conflict de interese declarat nu poate fi aprobată. Returnați-o cu un motiv.',
    teamIndependence:
      'Nu puteți decide asupra acestei echipe: sunteți legat de un membru al uneia dintre versiunile ei. Trebuie să decidă un aprobator care nu face parte din echipă.',
    blockedTeamNotPending:
      'Nicio echipă propusă nu mai așteaptă o decizie. Reîncărcați dosarul.',

    timelineTitle: 'Cronologie',
    timelineEmpty: 'Nicio etapă înregistrată încă.',
    timelineApplication: 'Cerere — versiunea {version}',
    timelineReview: 'Analiza cererii — {outcome}',
    timelineDuration: 'Durata auditului — versiunea {version}',
    timelineAgreement: 'Contractul de certificare — versiunea {version}',
    timelineTeam: 'Echipa de audit — versiunea {version}',
    timelineTeamDecision:
      'Decizia privind echipa — {decision} (versiunea {version} a echipei)',
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
    approverBundle: 'Утверждающий по сертификации компании',
    approverPrerequisites:
      'Утверждающий по сертификации действует, только если в той же Компании у него есть и право читателя сертификации. Утверждающий, связанный с участником предложенной группы, не может принимать решение по этой группе.',
    approverGranted: '— предоставление права утверждающего по сертификации',
    approverRevoked: '— отзыв права утверждающего по сертификации',

    title: 'Сертификация',
    introduction:
      'Дела по сертификации этого Проекта: заявка клиента, её анализ, продолжительность аудита, приложенные подписанные оригиналы, договор о сертификации и аудиторская группа с её утверждением со всеми записанными версиями.',
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
    nextAgreement: 'Договор о сертификации',
    nextTeam: 'Аудиторская группа',
    nextTeamDecision: 'Решение по группе',
    nextStage1Plan: 'План аудита этапа 1',
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
    stepAgreement: 'Договор о сертификации',
    stepRecorded: 'Записана — версия {version}',
    stepToRecord: 'Нужно записать',
    stepWaiting: 'Ожидает заявку',
    stepWaitingReview: 'Ожидает принятия заявки',
    stepWaitingDuration: 'Ожидает подтверждённую продолжительность',
    stepAccepted: 'Принята',
    stepRejected: 'Отклонена',
    stepClosed: 'Не применяется: дело закрыто',
    stepTeam: 'Аудиторская группа',
    stepTeamDecision: 'Решение по группе',
    stepWaitingAgreement: 'Ожидает договора',
    stepWaitingTeam: 'Ожидает предложенной группы',
    stepToDecide: 'Требует решения — версия {version}',
    stepApproved: 'Утверждена — версия {version}',
    stepReturned: 'Возвращена — версия {version}',

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
    blockedCorrectionUnchanged:
      'Исправление не меняет ни одного значения. Измените хотя бы одно значение или отмените исправление.',
    nextStagePlanPending:
      'Аудиторская группа утверждена. Следующий этап, план аудита этапа 1, в этой версии пока недоступен.',

    durationTitle: 'Продолжительность аудита',
    durationMissing: 'Продолжительность аудита ещё не подтверждена.',
    durationHelp:
      'Калькулятор предлагает число аудитор-дней на основе принятой заявки и указанных вами факторов. Подтвердите предложение или скорректируйте его с обоснованием.',
    durationInputs: 'Данные для расчёта продолжительности',
    primarySubcategory: 'Основная подкатегория',
    selectPrimarySubcategory: 'Выберите основную подкатегорию',
    primarySubcategoryHelp:
      'Подкатегория заявки с наибольшим базовым временем.',
    haccpStudiesPerSubcategory: 'Исследования HACCP по подкатегориям',
    haccpStudiesFor: 'Исследования HACCP в {code}',
    haccpStudiesTotal:
      'Итого: {total} из {declared} исследований HACCP, указанных в заявке.',
    increaseFactors: 'Факторы увеличения (%)',
    increaseFactorsHelp:
      'Целые проценты от 0 до 100. Любой фактор больше 0 требует обоснования.',
    reductionFactors: 'Факторы уменьшения (%)',
    reductionFactorsHelp:
      'Целые проценты: не более 10 % каждый и не более 20 % вместе. Любой фактор больше 0 требует обоснования.',
    factorProductTypes: 'Число видов продукции',
    factorProductLines: 'Число производственных линий',
    factorProductDevelopment: 'Разработка продукции',
    factorCriticalControlPoints: 'Число критических контрольных точек',
    factorOperationalPrerequisites:
      'Число операционных программ предварительных условий',
    factorConstructionSites: 'Строительные площадки',
    factorComplexInfrastructure: 'Сложная инфраструктура',
    factorOnSiteLaboratory: 'Лаборатория на площадке',
    factorRemoteAuditTechnology: 'Технологии дистанционного аудита',
    factorInterpreter: 'Переводчик',
    factorSystemMaturity: 'Зрелость системы менеджмента',
    factorPriorCertification: 'Предыдущая сертификация',
    factorTransferPreparedness: 'Готовность к переводу сертификации',
    factorAutomation: 'Автоматизация',
    computeProposal: 'Рассчитать предложение',
    computing: 'Расчёт…',
    durationInputsValidation:
      'Выберите основную подкатегорию и введите целые числа: от 0 до 999 исследований HACCP на подкатегорию и проценты факторов от 0 до 100.',
    haccpStudiesMismatch:
      'Сумма исследований HACCP по подкатегориям должна равняться числу, указанному в заявке.',
    proposalTitle: 'Предложение',
    proposalUnavailable:
      'Не удалось рассчитать предложение. Повторите попытку.',
    proposalOutdated:
      'Данные изменились после расчёта этого предложения. Рассчитайте его заново перед подтверждением.',
    durationNotAccepted:
      'Продолжительность аудита определяется после того, как анализ принял заявку. Загрузите дело заново.',
    amountsInAuditorDays: 'Значения в аудитор-днях.',
    ruleVersion: 'Версия правила',
    basicTime: 'Базовое время (TD)',
    haccpTime: 'Дополнительные исследования HACCP (TH)',
    fteTime: 'Численность персонала (TFTE)',
    baseDays: 'Базовая продолжительность (TD + TH + TFTE)',
    netAdjustment: 'Итоговая корректировка',
    percentValue: '{percent} %',
    initialOnSite: 'Первичный аудит на площадке',
    initialTotal: 'Первичный аудит всего',
    stage1OnSite: 'Этап 1 на площадке',
    stage2OnSite: 'Этап 2 на площадке',
    surveillanceOnSite: 'Надзорный аудит на площадке',
    surveillanceTotal: 'Надзорный аудит всего',
    recertificationOnSite: 'Ресертификационный аудит на площадке',
    recertificationTotal: 'Ресертификационный аудит всего',
    warningsTitle: 'Что проверить',
    warningSurveillanceBelowOneDay:
      'Надзорный аудит на площадке короче одного аудитор-дня.',
    warningRecertificationBelowOneDay:
      'Ресертификационный аудит на площадке короче одного аудитор-дня.',
    warningStage2BelowOneDay: 'Этап 2 на площадке короче одного аудитор-дня.',
    durationManual:
      'Численность персонала попадает туда, где диапазоны калькулятора пересекаются, поэтому предложение не рассчитывается. Введите аудитор-дни и обоснуйте их.',
    refusalsTitle: 'Предложение рассчитать нельзя:',
    refusalPrimaryNotSelected:
      'Основная подкатегория должна быть одной из подкатегорий заявки.',
    refusalPrimaryNotHighestBasicTime:
      'У другой подкатегории заявки базовое время больше. Выберите её основной подкатегорией.',
    refusalHaccpStudiesMismatch:
      'Сумма исследований HACCP должна равняться числу в заявке, только по её подкатегориям и хотя бы с одним исследованием в основной подкатегории.',
    refusalReductionFactorCap: 'Фактор уменьшения превышает 10 %.',
    refusalReductionTotalCap: 'Факторы уменьшения вместе превышают 20 %.',
    confirmDuration: 'Подтвердить продолжительность аудита',
    correctDuration: 'Исправить продолжительность аудита',
    confirmHelp:
      'Аудитор-дни, не более двух знаков после запятой; заполнено предложением, округлённым до сотых. Этап 1 и этап 2 в сумме равны первичному аудиту на площадке.',
    justification: 'Обоснование',
    justificationRequiredHint:
      'Обязательно: использованы факторы, продолжительность определена вручную или значение отличается от округлённого предложения.',
    durationValuesValidation:
      'Введите каждое подтверждаемое значение в аудитор-днях: больше нуля, меньше 1 000, не более двух знаков после запятой.',
    durationStagesMismatch:
      'Этап 1 и этап 2 на площадке в сумме должны равняться первичному аудиту на площадке.',
    durationJustificationRequired:
      'Обоснуйте использованные факторы, ручное определение или любое значение, отличное от округлённого предложения (не более 4 000 символов).',
    durationRefused:
      'Сервер отклонил эти данные. Рассчитайте предложение заново, чтобы узнать причину.',
    blockedDurationCorrectionReason:
      'Исправлению нужна причина, а у первого определения её нет. Загрузите дело заново перед новым сохранением.',
    computation: 'Расчёт',
    computationProposal: 'Рассчитанное предложение',
    computationManual: 'Ручное определение: диапазоны численности пересекаются',
    confirmedDays: 'Подтверждённые аудитор-дни',
    noFactor: 'Нет',
    showProposal: 'Показать рассчитанное предложение',

    documentsTitle: 'Реестр документов дела',
    documentsHelp:
      'Точные PDF, полученные от Клиента и приложенные к этому делу, в порядке приложения. Каждое вложение хранит точную версию и её отпечаток SHA-256.',
    documentsEmpty: 'К этому делу пока не приложено ни одного документа.',
    documentRole: 'Роль',
    documentFile: 'Файл',
    documentSize: 'Размер',
    documentDigest: 'Отпечаток SHA-256',
    documentDigestShow: 'Показать полный отпечаток',
    documentAttachedBy: 'Приложил(а)',
    documentAttachedAt: 'Приложено',
    documentVersionOf: '{title} — версия {version}',
    documentReference: '{title} — версия {version} ({file})',
    documentDownload: 'Скачать {title} — версия {version}',
    documentDownloading: 'PDF скачивается…',
    documentDownloadFailed:
      'PDF не удалось скачать, или его байты не совпали с записанным отпечатком. Повторите попытку.',
    documentDownloadUnavailable:
      'Этот приложенный PDF больше недоступен. Загрузите дело заново.',
    documentsDenied:
      'Не удалось подтвердить ваши права в Документах на PDF, полученные от этого Клиента. Они проверяются повторно; дело остаётся доступным.',
    documentsNoContentRights:
      'Чтобы открывать приложенные PDF, нужно право читать содержимое полученных от этого Клиента источников аудита (Документы).',
    attachNoRights:
      'Чтобы приложить документ, нужно право читать содержимое полученных от этого Клиента источников аудита (Документы).',
    roleQuestionnaire: 'Анкета заявки',
    roleIso22000Annex: 'Приложение ISO 22000',
    roleAgreement: 'Договор о сертификации',
    rolePlan: 'План аудита',
    roleParticipantList: 'Список участников',
    roleReport: 'Отчёт об аудите',
    roleEvidence: 'Свидетельство',
    roleCertificate: 'Сертификат',
    roleOther: 'Другой документ',
    attachToggle: 'Приложить документ',
    attachTitle: 'Приложить документ',
    attachHelp:
      'Выберите точный PDF, полученный от Клиента этого дела, и роль, которую он играет в деле. Вложение хранит эту точную версию, даже если документ потом изменится.',
    eligibleDocument: 'Полученный PDF',
    selectEligibleDocument: 'Выберите полученный PDF',
    eligibleAttached: '{title} — версия {version} (уже приложен)',
    eligibleLoading: 'Загрузка PDF, полученных от Клиента…',
    eligibleUnavailable:
      'Не удалось загрузить PDF, полученные от Клиента. Повторите попытку.',
    eligibleEmpty:
      'Пока нельзя приложить ни один PDF, полученный от этого Клиента. В разделе «Документы» зарегистрируйте подписанный оригинал как полученный от этого Клиента источник аудита, загрузите его PDF и назначьте эту версию официальной. После этого он появится здесь.',
    eligibleTruncated: 'Показаны только 25 последних зарегистрированных PDF.',
    selectDocumentRole: 'Выберите роль',
    attachSubmit: 'Приложить выбранный документ',
    attachValidation:
      'Выберите ещё не приложенный полученный PDF и его роль. Примечание — не более 1 000 символов.',
    attachDuplicate:
      'Эта точная версия документа уже приложена к делу. Загрузите дело заново и выберите другой документ.',
    attachUnavailable:
      'Этот PDF больше недоступен для Клиента этого дела. Выберите другой или загрузите список заново.',
    agreementTitle: 'Договор о сертификации',
    agreementMissing: 'Договор о сертификации пока не записан.',
    agreementHelp:
      'Запишите дату подписания договора и подписанный оригинал, приложенный в реестре документов с ролью «Договор о сертификации».',
    agreementSignedOn: 'Дата подписания',
    agreementDocument: 'Подписанный оригинал',
    selectAgreementDocument: 'Выберите подписанный оригинал',
    agreementNoDocument:
      'Пока не приложен ни один документ с ролью «Договор о сертификации». Сначала приложите подписанный оригинал в реестре документов.',
    recordAgreement: 'Записать договор',
    correctAgreement: 'Исправить договор',
    agreementValidation:
      'Введите дату подписания и выберите документ, приложенный с ролью «Договор о сертификации».',
    agreementInFuture:
      'Договор не может быть подписан позже сегодняшнего дня. Проверьте дату подписания.',
    agreementDocumentRole:
      'Выбранный документ приложен не с ролью «Договор о сертификации». Загрузите дело заново и выберите подписанный оригинал.',
    blockedAgreementBeforeDuration:
      'Договор записывается после подтверждения продолжительности аудита. Загрузите дело заново.',
    blockedAgreementCorrectionReason:
      'Исправлению нужна причина, а у первого договора её нет. Загрузите дело заново перед новым сохранением.',

    teamTitle: 'Аудиторская группа',
    teamMissing: 'Аудиторская группа пока не предложена.',
    teamHelp:
      'Предложите участников, которые будут проводить аудит по этому делу. В группе ровно один руководитель группы, а категорией пищевой цепи клиента владеет руководитель группы или, если нет, технический эксперт. Каждый участник явно отвечает на четыре заявления о беспристрастности; ответ «нет» требует описания конфликта.',
    teamMember: 'Участник {number}',
    teamMemberName: 'Имя',
    teamMemberRole: 'Роль в группе',
    selectTeamRole: 'Выберите роль',
    teamRoleLeader: 'Руководитель группы',
    teamRoleAuditor: 'Аудитор',
    teamRoleTechnicalExpert: 'Технический эксперт',
    teamRoleObserver: 'Наблюдатель',
    teamMemberLink: 'Участник рабочего пространства',
    teamMemberNotLinked: 'Не связан',
    teamMemberLinkHelp:
      'Необязательно. Связать можно только людей, уже известных в этом деле: вас и тех, кто записал этап или приложил документ. Связь позволяет серверу не допустить, чтобы этот человек утвердил группу.',
    teamMemberLinkedUnknown: 'Связан с участником рабочего пространства',
    teamMemberYou: '{name} (вы)',
    holdsCategory: 'Владеет категорией пищевой цепи клиента',
    competenceNote: 'Компетентность',
    declarations: 'Заявления о беспристрастности',
    declarationNoConsultancy: 'Не оказывал(а) клиенту консультационных услуг',
    declarationNoEmployment: 'Не работал(а) у клиента',
    declarationNoManagementInvolvement: 'Не участвует в управлении клиентом',
    declarationConfidentiality: 'Обязался(ась) соблюдать конфиденциальность',
    conflictNote: 'Описание конфликта',
    conflictNoteHelp:
      'Обязательно, так как на одно из заявлений дан ответ «нет». Группу с заявленным конфликтом можно предложить, но её можно только вернуть, а не утвердить.',
    conflictDeclared: 'Заявлен конфликт',
    addTeamMember: 'Добавить участника',
    removeTeamMember: 'Удалить участника {number}',
    proposeTeam: 'Предложить группу',
    correctTeam: 'Предложить новую версию группы',
    teamCorrectionHelp:
      'Новая версия заменяет текущее предложение, указывает причину и требует нового решения утверждающего. Прежние версии остаются в хронологии.',
    teamValidation:
      'Заполните данные каждого участника: имя (не более 200 символов), роль, сведения о компетентности (не более 1 000 символов) и ответ «да» или «нет» на каждое заявление. В группе от одного до десяти участников.',
    teamConflictNoteRequired:
      'Опишите конфликт (не более 1 000 символов) для каждого участника, ответившего «нет» на заявление.',
    teamLinkInvalid:
      'Участника рабочего пространства можно связать только с одним участником группы. Выберите другого человека или оставьте связь пустой.',
    teamLeaderRule: 'В группе ровно один руководитель группы. Проверьте роли.',
    teamCategoryRule:
      'Группа должна владеть категорией клиента: ею владеет руководитель группы или, если нет, в группу входит владеющий ею технический эксперт. Наблюдатели не учитываются.',
    teamMemberUnknown:
      'Связанный участник рабочего пространства больше не активен. Измените эту связь или оставьте её пустой.',
    blockedTeamBeforeAgreement:
      'Аудиторская группа предлагается после записи договора о сертификации. Загрузите дело заново.',
    blockedTeamCorrectionReason:
      'Новой версии группы нужна причина, а у первого предложения её нет. Загрузите дело заново перед новым сохранением.',
    teamStatusPending: 'Ожидает решения',
    teamStatusApproved: 'Утверждена',
    teamStatusReturned: 'Возвращена',
    teamReturnedNote:
      'Утверждающий вернул эту группу. Предложите новую версию с учётом указанной причины.',
    teamAwaitingApprover:
      'Решение по этому предложению принимает утверждающий, не входящий в группу.',
    decisionTitle: 'Решение по группе',
    decisionMissing: 'Решение пока не записано.',
    decisionHelp:
      'Примите решение по версии {version} группы: утвердите её или верните руководителю программы с указанием причины.',
    decisionChoice: 'Решение',
    decisionApprove: 'Утвердить группу',
    decisionReturn: 'Вернуть группу',
    decisionReason: 'Причина возврата',
    recordDecision: 'Записать решение',
    decisionTeamVersion: 'Версия группы',
    decisionApproved: 'Утверждена',
    decisionReturned: 'Возвращена',
    decisionEarlierVersion:
      'Это решение относится к версии {decided} группы. Версия {current} ожидает решения.',
    decisionValidation:
      'Выберите решение. Для возврата группы нужна причина (не более 2 000 символов).',
    decisionConflictOnly:
      'Участник этой группы заявил о конфликте интересов, поэтому группу нельзя утвердить. Верните её с указанием причины.',
    teamConflictDeclared:
      'Группу с заявленным конфликтом интересов нельзя утвердить. Верните её с указанием причины.',
    teamIndependence:
      'Вы не можете принимать решение по этой группе: вы связаны с участником одной из её версий. Решение должен принять утверждающий, не входящий в группу.',
    blockedTeamNotPending:
      'Ни одна предложенная группа больше не ожидает решения. Загрузите дело заново.',

    timelineTitle: 'Хронология',
    timelineEmpty: 'Этапы ещё не записаны.',
    timelineApplication: 'Заявка — версия {version}',
    timelineReview: 'Анализ заявки — {outcome}',
    timelineDuration: 'Продолжительность аудита — версия {version}',
    timelineAgreement: 'Договор о сертификации — версия {version}',
    timelineTeam: 'Аудиторская группа — версия {version}',
    timelineTeamDecision:
      'Решение по группе — {decision} (версия группы {version})',
    showValues: 'Показать записанные значения',
  },
});

export function useCertificationCopy() {
  return useMessages(certificationMessages);
}
