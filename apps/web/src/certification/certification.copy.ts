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
  'auditorBundle',
  'auditorPrerequisites',
  'auditorGranted',
  'auditorRevoked',

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
  'nextStage1Report',
  'nextStage2Plan',
  'nextStage2Report',
  'nextRecommendation',
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
  'stepStage1',
  'stepStage2',
  'stepWaitingTeamApproval',
  'stepWaitingStage1Ready',
  'stepPlanned',
  'stepStageReady',
  'stepStageNotReady',
  'stepReported',

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
  'blockedApplicationDecided',
  'blockedAlreadyReviewed',
  'blockedClosed',
  'blockedCorrectionReason',
  'blockedCorrectionUnchanged',

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
  'registerPdfTitle',
  'registerPdfHelp',
  'registerPdfDownload',
  'registerPdfDownloading',
  'registerPdfFailed',
  'registerPdfUnavailable',
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
  'teamMemberDecided',
  'blockedTeamNotPending',

  'nextRecommendationPending',
  'stage1Title',
  'stage2Title',
  'stagePlanTitle',
  'stageReportTitle',
  'stagePlanMissing',
  'stageReportMissing',
  'stageStartDate',
  'stageEndDate',
  'stageOnSiteDays',
  'stageRemoteDays',
  'stageOnSiteDaysHelp',
  'stageDaysFormatHelp',
  'stageObjectives',
  'stageScope',
  'stagePlanDocument',
  'selectStagePlanDocument',
  'stageSentToClientOn',
  'stageSentToClientOnHelp',
  'stageNotSent',
  'stageDeviationNote',
  'stageDeviationNoteHelp',
  'stageNoDeviation',
  'stageReportDate',
  'stageDocumentReview',
  'stageDocumentReviewCompleted',
  'stageDocumentReviewConfirm',
  'stageConclusion',
  'stageConclusionReady',
  'stageConclusionNotReady',
  'stageConclusionNote',
  'stageSummary',
  'stageReportDocument',
  'selectStageReportDocument',
  'stageParticipantList',
  'stageNoParticipantList',
  'stageAnnex',
  'stageNoAnnex',
  'stageNoAttachment',
  'recordStage1Plan',
  'correctStage1Plan',
  'recordStage2Plan',
  'correctStage2Plan',
  'recordStage1Report',
  'correctStage1Report',
  'recordStage2Report',
  'correctStage2Report',
  'stagePlanHelp',
  'stage1ReportHelp',
  'stage2ReportHelp',
  'stageNoPlanDocument',
  'stageNoReportDocument',
  'stagePlanValidation',
  'stageDatesRule',
  'stageDeviationNoteRequired',
  'stageDeviationNoteRule',
  'stage2StartRule',
  'stage1ReportValidation',
  'stage2ReportValidation',
  'stageDocumentReviewRequired',
  'stageReportDateRule',
  'stageAttachmentRole',
  'blockedStagePlanTeamNotApproved',
  'blockedStage2BeforeStage1Report',
  'blockedStage2NotReady',
  'blockedStageReportBeforePlan',
  'blockedStageReportTeamNotApproved',
  'blockedNotTeamLeader',
  'stageReportAwaitingLeader',
  'stagePlanAwaitingManager',
  'blockedStagePlanCorrectionReason',
  'blockedStageReportCorrectionReason',

  'nextFindingsFollowUp',
  'nextFindingsFollowUpPending',
  'stepFindings',
  'stepWaitingStage2Report',
  'stepFindingsOpen',
  'stepFindingsDone',
  'blockedStage2NonconformityOpen',
  'stage1FindingsTitle',
  'stage2FindingsTitle',
  'findingsHelp',
  'findingsEmpty',
  'findingHeading',
  'findingClassification',
  'classificationMajor',
  'classificationMinor',
  'classificationOpportunity',
  'classificationAreaOfConcern',
  'findingClause',
  'findingArea',
  'findingStatement',
  'findingEvidence',
  'findingNoEvidence',
  'findingNotStated',
  'findingStatus',
  'statusNoActionRequired',
  'statusAwaitingResponse',
  'statusAwaitingPlanJudgment',
  'statusPlanInadequate',
  'statusPlanAdequate',
  'statusVerifiedEffective',
  'statusVerifiedNotEffective',
  'findingResponseDueOn',
  'findingLimitOn',
  'findingOverdue',
  'findingOverdueNote',
  'findingHoldsVerification',
  'findingHoldsPlan',
  'findingHistory',
  'findingRecordStatement',
  'findingRecordClassification',
  'classifiedByTeamLeader',
  'classifiedByApprover',
  'findingRecordResponse',
  'findingRecordPlanJudgment',
  'findingRecordVerification',
  'responseCorrection',
  'responseCause',
  'responseCorrectiveAction',
  'responseReceivedOn',
  'responsePlannedCompletionOn',
  'responseNoPlannedCompletion',
  'planOutcome',
  'planAdequate',
  'planInadequate',
  'planNote',
  'verificationVerifiedOn',
  'verificationMethod',
  'methodDocumentReview',
  'methodOnSite',
  'verificationOutcome',
  'outcomeEffective',
  'outcomeNotEffective',
  'verificationNote',
  'recordStage1Finding',
  'recordStage2Finding',
  'findingSubmit',
  'recordFindingHelp',
  'findingClauseHelp',
  'findingEvidenceHelp',
  'findingNoEvidenceDocument',
  'correctFinding',
  'changeClassification',
  'reclassifyFinding',
  'classificationChangeHelp',
  'reclassificationHelp',
  'classificationNew',
  'classificationReason',
  'classificationSubmit',
  'recordResponse',
  'responseHelp',
  'responseSubmit',
  'judgePlan',
  'judgePlanHelp',
  'judgmentSubmit',
  'verifyFinding',
  'verifyHelp',
  'verificationSubmit',
  'findingValidation',
  'findingStatementValidation',
  'findingClauseRequired',
  'findingClassificationStage',
  'findingEvidenceRequired',
  'classificationValidation',
  'classificationUnchanged',
  'responseValidation',
  'judgmentValidation',
  'verificationValidation',
  'blockedFindingTeamNotApproved',
  'blockedFindingNotTeamLeader',
  'blockedFindingStageClosed',
  'blockedFindingStageNotPlanned',
  'findingNotOpen',
  'findingNoResponse',
  'findingPlanNotAdequate',
  'findingLimitPassed',
  'findingIndependence',
  'findingEvidenceUnavailable',
  'blockedFindingCorrectionReason',
  'timelineFindingRecorded',
  'timelineFindingCorrected',
  'timelineFindingReclassified',
  'timelineNonconformityResponse',
  'timelineNonconformityPlanJudged',
  'timelineNonconformityVerified',
  'findingStage1',
  'findingStage2',

  'timelineTitle',
  'timelineEmpty',
  'timelineApplication',
  'timelineReview',
  'timelineDuration',
  'timelineAgreement',
  'timelineTeam',
  'timelineTeamDecision',
  'timelineStage1Plan',
  'timelineStage1Report',
  'timelineStage2Plan',
  'timelineStage2Report',
  'showValues',
  'recommendationTitle',
  'recommendationMissing',
  'recordRecommendation',
  'correctRecommendation',
  'recommendationHelp',
  'recommendationOutcome',
  'recommendationGrant',
  'recommendationDoNotGrant',
  'recommendationAdditionalAudit',
  'recommendationBasis',
  'recommendationSubmit',
  'recommendationValidation',
  'recommendationAwaitingLeader',
  'blockedRecommendationNotTeamLeader',
  'blockedRecommendationFindingsOpen',
  'blockedRecommendationBeforeStage2',
  'dossierReviewTitle',
  'dossierReviewMissing',
  'recordDossierReview',
  'correctDossierReview',
  'dossierReviewHelp',
  'dossierAnswerPresent',
  'dossierAnswerMissing',
  'dossierAnswerNotApplicable',
  'dossierItemNote',
  'dossierConclusion',
  'dossierReviewSubmit',
  'dossierReviewValidation',
  'dossierReviewResult',
  'dossierComplete',
  'dossierIncomplete',
  'dossierItemApplication',
  'dossierItemApplicationReview',
  'dossierItemDuration',
  'dossierItemAgreement',
  'dossierItemTeamApproval',
  'dossierItemStage1Plan',
  'dossierItemStage1Report',
  'dossierItemStage2Plan',
  'dossierItemStage2Report',
  'dossierItemParticipantLists',
  'dossierItemFindingsFollowUp',
  'dossierItemRecommendation',
  'dossierItemCertificateData',
  'dossierAwaitingApprover',
  'dossierIndependence',
  'blockedDossierBeforeRecommendation',
  'blockedDecided',
  'certificationDecisionTitle',
  'certificationDecisionMissing',
  'recordCertificationDecision',
  'certificationDecisionHelp',
  'decisionOutcome',
  'decisionGranted',
  'decisionRefused',
  'grantedTexts',
  'certificateTextsAgreed',
  'certificateTextHeading',
  'certificateLanguage',
  'certificateLanguageHelp',
  'certificateHolderName',
  'certificateAddress',
  'certificateScope',
  'addCertificateLanguage',
  'removeCertificateText',
  'decidedOn',
  'decidedBy',
  'decidedByFunction',
  'decisionForm',
  'decisionFormNone',
  'decisionRationale',
  'decisionAdditionalInformation',
  'decisionIndependenceAttestation',
  'decisionIndependenceLabel',
  'decisionIndependenceAttested',
  'certificationDecisionSubmit',
  'certificationDecisionValidation',
  'decisionAttestationRequired',
  'decisionPreconditionsTitle',
  'decisionPreconditionsList',
  'decisionPreconditionsRefused',
  'decisionPreconditionsUnknown',
  'preconditionApplicationNotAccepted',
  'preconditionDurationMissing',
  'preconditionAgreementMissing',
  'preconditionTeamNotApproved',
  'preconditionStage1NotReady',
  'preconditionStage2NotReported',
  'preconditionFindingsOpen',
  'preconditionFindingsOverdue',
  'preconditionRecommendationMissing',
  'preconditionGrantAgainstRecommendation',
  'preconditionDossierReviewIncomplete',
  'preconditionDecisionInFuture',
  'decisionMakerIndependence',
  'certificationDecisionAwaitingApprover',
  'certificationDecisionIndependence',
  'decisionFormRole',
  'certificateDataTitle',
  'certificateDataMissing',
  'recordCertificateData',
  'correctCertificateData',
  'certificateDataHelp',
  'certificateDataAgreedOn',
  'certificateDataDocument',
  'selectCertificateDataDocument',
  'certificateDataSubmit',
  'certificateDataValidation',
  'certificateDataNoDocument',
  'certificateDataAwaitingManager',
  'certificateDataDocumentRole',
  'blockedCertificateDataBeforeStage2',
  'certificateTextsDiffer',
  'certificateDifferencesList',
  'differenceNotAgreed',
  'differenceNotGranted',
  'differenceField',
  'certificateTitle',
  'certificateMissing',
  'recordCertificate',
  'certificateHelp',
  'certificateNumber',
  'certificatePdf',
  'selectCertificatePdf',
  'certificateSignedBy',
  'certificateSignedByFunction',
  'certificateIndependenceAttestation',
  'certificateSubmit',
  'certificateValidation',
  'certificateAttestationRequired',
  'certificateNoPdf',
  'certificateAwaitingApprover',
  'certificateApproverIndependence',
  'certificateIndependence',
  'certificateNumberTaken',
  'preconditionDiscrepanciesOpen',
  'certificateDiscrepanciesOpen',
  'discrepancyNotOpen',
  'discrepancyValidation',
  'discrepancyReasonRequired',
  'discrepancyCorrectionRequired',
  'discrepancyCritical',
  'discrepancyCorrectedByRecord',
  'discrepancyNotOnTeam',
  'discrepancyIndependence',
  'discrepancyCorrectionUnknown',
  'discrepancyDocumentUnavailable',
  'certificateDataDiffers',
  'blockedCertificateDataDiffers',
  'blockedCertificateNotGranted',
  'blockedCertificateDataMissing',
  'certificatePdfRole',
  'certificateValidFrom',
  'certificateValidUntil',
  'certificateFirstSurveillanceBy',
  'certificateValidityNote',
  'certificateTexts',
  'statusRefused',
  'statusCertified',
  'caseCertifiedNote',
  'caseRefusedNote',
  'caseClosedRefusal',
  'nextDossierReview',
  'nextCertificationDecision',
  'nextCertificateData',
  'nextCertificate',
  'stepRecommendation',
  'stepDossierReview',
  'stepCertificationDecision',
  'stepCertificateData',
  'stepCertificate',
  'stepRecommended',
  'stepWaitingFollowUp',
  'stepWaitingRecommendation',
  'stepDossierComplete',
  'stepDossierIncomplete',
  'stepWaitingDossierReview',
  'stepWaitingGrant',
  'stepWaitingCertificateData',
  'stepCertificateRecorded',
  'timelineRecommendation',
  'timelineDossierReview',
  'timelineCertificationDecision',
  'timelineCertificateData',
  'timelineCertificate',
  'roleCertificateData',
  'roleDecisionForm',
  'blockedVersionCorrectionReason',
  'applicationSubmittedOn',
  'applicationSubmittedOnHelp',
  'actingOnBehalf',
  'actingHelp',
  'actingName',
  'actingFunction',
  'actingDate',
  'actingForm',
  'actingFormNone',
  'actingReviewLegend',
  'actingReviewView',
  'actingDurationLegend',
  'actingDurationView',
  'actingTeamDecisionLegend',
  'actingTeamDecisionView',
  'actingReportApprovalLegend',
  'actingReportApprovalView',
  'actingValidation',
  'actingOnTeam',
  'actInFuture',
  'independenceLabel',
  'independenceAttested',
  'independenceUnattested',
  'teamDecisionAttestation',
  'teamDecisionAttestationRequired',
  'dossierReviewerLegend',
  'dossierApproverLegend',
  'dossierReviewerView',
  'dossierApproverView',
  'dossierAttestation',
  'dossierAttestationRequired',
  'declarationConfirmed',
  'declarationConflict',
  'declarationToVerify',
  'declarationsToVerify',
  'impartialityAnalysis',
  'impartialityAnalysisHelp',
  'impartialityAnalysisRequiredHelp',
  'impartialityAnalysisNote',
  'impartialityAnalysisEvidence',
  'impartialityAnalysisNone',
  'teamAnalysisRequired',
  'recommendedOn',
  'correctDecisionTexts',
  'decisionCorrectionHelp',
  'decisionOutcomeFixed',
  'decisionOutcomeFixedRefusal',
  'decisionEarlierVersions',
  'timelineCertificationDecisionVersion',
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
    auditorBundle: 'Company Certification Auditor',
    auditorPrerequisites:
      'A Certification Auditor acts only while also holding Company Certification Reader in the same Company. Only the auditor linked to the leader of the approved audit team records the Stage reports.',
    auditorGranted: 'granted Certification Auditor',
    auditorRevoked: 'revoked Certification Auditor',

    title: 'Certification',
    introduction:
      'Certification Cases of this Project: the client’s application, its review, the audit duration, the attached signed originals, the certification agreement, the audit team with its approval, the Stage 1 and Stage 2 audits with their plans, reports and Findings, the team recommendation, the dossier review, the Certification Decision and the Certificate, with every recorded version.',
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
    nextStage1Report: 'Stage 1 audit report',
    nextStage2Plan: 'Stage 2 audit plan',
    nextStage2Report: 'Stage 2 audit report',
    nextRecommendation: 'Team recommendation',
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
    stepStage1: 'Stage 1 audit',
    stepStage2: 'Stage 2 audit',
    stepWaitingTeamApproval: 'Waits for the approved team',
    stepWaitingStage1Ready: 'Waits for a Stage 1 report concluding ready',
    stepPlanned: 'Planned — version {version}',
    stepStageReady: 'Ready — report version {version}',
    stepStageNotReady: 'Not ready — report version {version}',
    stepReported: 'Reported — version {version}',

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
    blockedApplicationDecided:
      'The application can no longer be corrected: the Certification Decision is recorded.',
    blockedAlreadyReviewed:
      'This application has already been reviewed. Reload the Case.',
    blockedClosed:
      'This Case is closed: the application was rejected. No further step can be recorded; a new application needs a new Case.',
    blockedCorrectionReason:
      'A correction needs a reason and a first application has none. Reload the Case before saving again.',
    blockedCorrectionUnchanged:
      'The correction changes no value. Change at least one value or cancel the correction.',

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

    documentsTitle: 'Document archive',
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
    registerPdfTitle: 'Dossier register PDF',
    registerPdfHelp:
      'A generated PDF listing every step version and every referenced Document Version of this Case, in the interface language. It is not an official certification body form and replaces none of the signed originals.',
    registerPdfDownload: 'Download the dossier register (PDF)',
    registerPdfDownloading: 'Generating the dossier register…',
    registerPdfFailed:
      'The dossier register could not be downloaded. Try again.',
    registerPdfUnavailable:
      'The dossier register of this Case is unavailable. Reload the Case.',
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
      'Record the date the agreement was signed and the signed original attached in the document archive with the role Certification agreement.',
    agreementSignedOn: 'Signed on',
    agreementDocument: 'Signed original',
    selectAgreementDocument: 'Select the signed original',
    agreementNoDocument:
      'No document is attached with the role Certification agreement yet. Attach the signed original in the document archive first.',
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
    conflictNote: 'Conflict or point to verify',
    conflictNoteHelp:
      'Required because a declaration is a conflict or still to verify: describe the conflict or what remains to verify. The team can be proposed, but it is approved only once every declaration is confirmed.',
    conflictDeclared: 'Conflict declared',
    addTeamMember: 'Add a member',
    removeTeamMember: 'Remove member {number}',
    proposeTeam: 'Propose the team',
    correctTeam: 'Propose a new team version',
    teamCorrectionHelp:
      'A new version replaces the current proposal, states its reason and needs a new decision by an approver. Earlier versions stay in the timeline.',
    teamValidation:
      'Complete every member: a name (at most 200 characters), a role, a competence note (at most 1,000 characters) and an answer to each declaration. A team has one to ten members.',
    teamConflictNoteRequired:
      'Describe the conflict or what remains to verify (at most 1,000 characters) for every member with a declaration that is not confirmed.',
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
      'A declaration of this team is not confirmed (a conflict or a point to verify), so the team cannot be approved. Return it with a reason; it can be approved once a new version confirms every declaration.',
    teamConflictDeclared:
      'A team with a declaration that is not confirmed cannot be approved. Return it with a reason.',
    teamIndependence:
      'You cannot decide on this team: you are linked to a member of one of its versions. An approver who is not on the team must decide.',
    teamMemberDecided:
      'A person who approved this team, approved a Stage report, reviewed the dossier or recorded the decision, directly or on behalf of the certification body, cannot join the team. Remove that person or that link, reload the Case and propose again.',
    blockedTeamNotPending:
      'No proposed team awaits a decision any more. Reload the Case.',

    nextRecommendationPending:
      'Both Stages are reported and no nonconformity holds the Case. The leader of the approved audit team records the team recommendation.',
    stage1Title: 'Stage 1 audit',
    stage2Title: 'Stage 2 audit',
    stagePlanTitle: 'Audit plan',
    stageReportTitle: 'Audit report',
    stagePlanMissing: 'No plan is recorded for this Stage yet.',
    stageReportMissing: 'No report is recorded for this Stage yet.',
    stageStartDate: 'Start date',
    stageEndDate: 'End date',
    stageOnSiteDays: 'On-site auditor-days',
    stageRemoteDays: 'Remote auditor-days',
    stageOnSiteDaysHelp:
      'Confirmed duration on site for this Stage, in auditor-days: {days}. Other on-site days need a note explaining the deviation.',
    stageDaysFormatHelp: 'At most two decimals, for example 0.5.',
    stageObjectives: 'Objectives',
    stageScope: 'Audit scope',
    stagePlanDocument: 'Audit plan PDF',
    selectStagePlanDocument: 'Select the attached audit plan',
    stageSentToClientOn: 'Sent to the client on',
    stageSentToClientOnHelp:
      'Leave empty while the plan has not been sent to the client.',
    stageNotSent: 'Not sent yet',
    stageDeviationNote: 'Deviation from the confirmed duration',
    stageDeviationNoteHelp:
      'Required because the on-site days differ from the confirmed duration.',
    stageNoDeviation: 'No deviation stated',
    stageReportDate: 'Report date',
    stageDocumentReview: 'Document review',
    stageDocumentReviewCompleted: 'Completed',
    stageDocumentReviewConfirm: 'The document review is completed',
    stageConclusion: 'Readiness for Stage 2',
    stageConclusionReady: 'Ready for Stage 2',
    stageConclusionNotReady: 'Not ready for Stage 2',
    stageConclusionNote: 'Basis of the conclusion',
    stageSummary: 'Summary of the Stage 2 audit',
    stageReportDocument: 'Audit report PDF',
    selectStageReportDocument: 'Select the attached audit report',
    stageParticipantList: 'Participant list PDF',
    stageNoParticipantList: 'No participant list',
    stageAnnex: 'Annex PDF',
    stageNoAnnex: 'No annex',
    stageNoAttachment: 'None attached',
    recordStage1Plan: 'Record the Stage 1 plan',
    correctStage1Plan: 'Correct the Stage 1 plan',
    recordStage2Plan: 'Record the Stage 2 plan',
    correctStage2Plan: 'Correct the Stage 2 plan',
    recordStage1Report: 'Record the Stage 1 report',
    correctStage1Report: 'Correct the Stage 1 report',
    recordStage2Report: 'Record the Stage 2 report',
    correctStage2Report: 'Correct the Stage 2 report',
    stagePlanHelp:
      'Plan this Stage: its dates, the auditor-days on site and remote, the objectives and scope, and the attached plan PDF with the date it was sent to the client.',
    stage1ReportHelp:
      'Record the Stage 1 conclusion: the completed document review, whether the client is ready for Stage 2 and on what basis, with the attached report and participant list.',
    stage2ReportHelp:
      'Record the completion of the Stage 2 audit with the attached report, the participant list and an optional annex.',
    stageNoPlanDocument:
      'No document is attached with the role Audit plan yet. Attach the plan PDF in the document archive first.',
    stageNoReportDocument:
      'No document is attached with the role Audit report yet. Attach the report PDF in the document archive first.',
    stagePlanValidation:
      'Complete the plan: start and end dates, on-site auditor-days above zero and remote auditor-days with at most two decimals, the objectives and scope (at most 2,000 characters each) and the attached audit plan. The date sent to the client is optional.',
    stageDatesRule: 'A Stage ends on or after its start date. Check the dates.',
    stageDeviationNoteRequired:
      'The on-site days differ from the confirmed duration: explain the deviation (at most 2,000 characters).',
    stageDeviationNoteRule:
      'The on-site days and the deviation note no longer match the confirmed duration. Reload the Case and check them.',
    stage2StartRule:
      'Stage 2 starts after the date of the Stage 1 report. Choose a later start date.',
    stage1ReportValidation:
      'Complete the report: the report date, the conclusion and its basis (at most 4,000 characters) and the attached audit report. The participant list is optional.',
    stage2ReportValidation:
      'Complete the report: the report date, the summary (at most 4,000 characters) and the attached audit report. The participant list and the annex are optional.',
    stageDocumentReviewRequired:
      'Stage 1 includes the document review: confirm that it is completed before recording the report.',
    stageReportDateRule:
      'A report is dated on or after the start of its Stage. Check the report date.',
    stageAttachmentRole:
      'A chosen PDF is not attached with the expected role. Reload the Case and choose again.',
    blockedStagePlanTeamNotApproved:
      'The audit is planned once the latest audit team version is approved.',
    blockedStage2BeforeStage1Report:
      'Stage 2 is planned after a Stage 1 report concluding that the client is ready.',
    blockedStage2NotReady:
      'The Stage 1 report concludes that the client is not ready. Stage 2 can be planned once a corrected Stage 1 report concludes that the client is ready.',
    blockedStageReportBeforePlan:
      'The report is recorded once this Stage is planned.',
    blockedStageReportTeamNotApproved:
      'The leader of the approved audit team records the reports; the latest team version is not approved.',
    blockedNotTeamLeader:
      'Only the leader of the approved audit team records this report. You are not linked to that team leader.',
    stageReportAwaitingLeader:
      'The leader of the approved audit team records this report while holding Company Certification Auditor.',
    stagePlanAwaitingManager: 'A programme manager plans this Stage.',
    blockedStagePlanCorrectionReason:
      'A new plan version needs a reason and a first plan has none. Reload the Case before saving again.',
    blockedStageReportCorrectionReason:
      'A new report version needs a reason and a first report has none. Reload the Case before saving again.',

    nextFindingsFollowUp: 'Nonconformity follow-up',
    nextFindingsFollowUpPending:
      'Both Stages are reported. Before the team recommendation, every major nonconformity and every Stage 1 nonconformity is verified effective, and every other minor nonconformity has a plan judged adequate.',
    stepFindings: 'Nonconformity follow-up',
    stepWaitingStage2Report: 'Waits for the Stage 2 report',
    stepFindingsOpen: 'Open — {count} to follow up',
    stepFindingsDone: 'Completed',
    blockedStage2NonconformityOpen:
      'Stage 2 is planned once every Stage 1 nonconformity is verified effective. Follow up the open Stage 1 nonconformities first.',
    stage1FindingsTitle: 'Stage 1 Findings',
    stage2FindingsTitle: 'Stage 2 Findings',
    findingsHelp:
      'The leader of the approved audit team records each Finding with its requirement clause, process or area, statement, classification and exact evidence, then follows each nonconformity up. An approver who is not on the team may reclassify a Finding with a reason. Every version stays in the history.',
    findingsEmpty: 'No Finding is recorded for this Stage.',
    findingHeading: 'Finding {sequence} — {classification}',
    findingClassification: 'Classification',
    classificationMajor: 'Major nonconformity',
    classificationMinor: 'Minor nonconformity',
    classificationOpportunity: 'Opportunity for improvement',
    classificationAreaOfConcern: 'Area of concern',
    findingClause: 'Requirement clause',
    findingArea: 'Process or area',
    findingStatement: 'Statement',
    findingEvidence: 'Evidence',
    findingNoEvidence: 'No evidence cited',
    findingNotStated: 'Not stated',
    findingStatus: 'Follow-up',
    statusNoActionRequired: 'No follow-up required',
    statusAwaitingResponse: 'Awaiting the client’s response',
    statusAwaitingPlanJudgment: 'Plan to judge',
    statusPlanInadequate: 'Plan not adequate — a new response is expected',
    statusPlanAdequate: 'Plan adequate — implementation to verify',
    statusVerifiedEffective: 'Verified effective',
    statusVerifiedNotEffective: 'Not effective — a new response is expected',
    findingResponseDueOn: 'Response due on',
    findingLimitOn: 'Six-month limit',
    findingOverdue: 'Overdue',
    findingOverdueNote:
      'The six-month limit has passed without a verification that the nonconformity is eliminated.',
    findingHoldsVerification: 'Holds the next step until verified effective.',
    findingHoldsPlan: 'Holds the next step until its plan is judged adequate.',
    findingHistory: 'History of Finding {sequence}',
    findingRecordStatement: 'Statement — version {version}',
    findingRecordClassification:
      'Classification — {classification}, {by} (version {version})',
    classifiedByTeamLeader: 'by the team leader',
    classifiedByApprover: 'by the approver',
    findingRecordResponse: 'Client’s response — version {version}',
    findingRecordPlanJudgment: 'Plan judgment — {outcome} (version {version})',
    findingRecordVerification: 'Verification — {outcome} (version {version})',
    responseCorrection: 'Correction',
    responseCause: 'Cause',
    responseCorrectiveAction: 'Corrective action',
    responseReceivedOn: 'Received on',
    responsePlannedCompletionOn: 'Planned completion',
    responseNoPlannedCompletion: 'Not stated',
    planOutcome: 'Adequacy of the plan',
    planAdequate: 'Adequate',
    planInadequate: 'Not adequate',
    planNote: 'Basis of the judgment',
    verificationVerifiedOn: 'Verified on',
    verificationMethod: 'Verification method',
    methodDocumentReview: 'Document review',
    methodOnSite: 'On site',
    verificationOutcome: 'Effectiveness',
    outcomeEffective: 'Effective',
    outcomeNotEffective: 'Not effective',
    verificationNote: 'Verification note',
    recordStage1Finding: 'Record a Stage 1 Finding',
    recordStage2Finding: 'Record a Stage 2 Finding',
    findingSubmit: 'Record the Finding',
    recordFindingHelp:
      'Choose the classification, state the requirement clause, the process or area and the statement, and cite the exact evidence attached to this Case. A nonconformity cites at least one evidence PDF; an opportunity for improvement may omit the clause and the area.',
    findingClauseHelp:
      'For example 8.5.1. Optional only for an opportunity for improvement.',
    findingEvidenceHelp:
      'PDFs attached to this Case with the role Evidence, at most ten.',
    findingNoEvidenceDocument:
      'No document is attached with the role Evidence yet. Attach the evidence PDFs in the document archive first: a nonconformity cites at least one.',
    correctFinding: 'Correct the statement of Finding {sequence}',
    changeClassification: 'Change the classification of Finding {sequence}',
    reclassifyFinding: 'Reclassify Finding {sequence}',
    classificationChangeHelp:
      'As team leader, choose the new classification and state the reason. The earlier classification stays in the history.',
    reclassificationHelp:
      'As an approver who is not on the audit team, choose the new classification and state the reason. The earlier classification stays in the history.',
    classificationNew: 'New classification',
    classificationReason: 'Reason for the new classification',
    classificationSubmit: 'Record the classification',
    recordResponse: 'Record the client’s response to Finding {sequence}',
    responseHelp:
      'Record the client’s correction, cause analysis and corrective-action plan as received, with optional evidence. A new response after a plan judged not adequate is a new version.',
    responseSubmit: 'Record the response',
    judgePlan: 'Judge the plan of Finding {sequence}',
    judgePlanHelp:
      'Judge whether the latest response is adequate to eliminate the nonconformity, and on what basis.',
    judgmentSubmit: 'Record the judgment',
    verifyFinding: 'Verify the implementation of Finding {sequence}',
    verifyHelp:
      'Record when and how the implementation was verified, whether it is effective, and optional evidence.',
    verificationSubmit: 'Record the verification',
    findingValidation:
      'Complete the Finding: choose a classification and write the statement (at most 4,000 characters). The clause takes at most 40 characters and the process or area at most 300; cite at most ten evidence PDFs of this Case.',
    findingStatementValidation:
      'Write the statement (at most 4,000 characters). The clause takes at most 40 characters and the process or area at most 300; cite at most ten evidence PDFs of this Case.',
    findingClauseRequired:
      'State the requirement clause and the process or area. Only an opportunity for improvement may omit them.',
    findingClassificationStage:
      'An area of concern is recorded at Stage 1 only. Choose another classification.',
    findingEvidenceRequired:
      'A nonconformity cites at least one exact evidence PDF attached to this Case.',
    classificationValidation:
      'Choose the new classification and state the reason (at most 2,000 characters).',
    classificationUnchanged:
      'This is already the classification of the Finding. Choose another one or cancel.',
    responseValidation:
      'Complete the response: the correction, the cause and the corrective action (at most 4,000 characters each) and the date it was received. The planned completion date and the evidence are optional.',
    judgmentValidation:
      'Choose whether the plan is adequate and state the basis of the judgment (at most 2,000 characters).',
    verificationValidation:
      'Complete the verification: its date, method and outcome, and the note (at most 2,000 characters). The evidence is optional.',
    blockedFindingTeamNotApproved:
      'The leader of the approved audit team records Findings; the latest team version is not approved.',
    blockedFindingNotTeamLeader:
      'Only the leader of the approved audit team records Findings and their follow-up. You are not linked to that team leader.',
    blockedFindingStageClosed:
      'Stage 1 Findings are recorded before Stage 2 is planned.',
    blockedFindingStageNotPlanned:
      'Findings are recorded once this Stage is planned. Reload the Case.',
    findingNotOpen:
      'Only an open nonconformity receives a response. Reload the Case.',
    findingNoResponse:
      'The plan is judged once the client’s response is recorded. Reload the Case.',
    findingPlanNotAdequate:
      'The implementation is verified once the plan is judged adequate. Reload the Case.',
    findingLimitPassed:
      'The six-month limit of this nonconformity has passed without an effective verification: this certification journey cannot continue. A repeated Stage or an additional audit is outside this version.',
    findingIndependence:
      'You cannot reclassify Findings: you are linked to a member of the audit team. An approver who is not on the team reclassifies.',
    findingEvidenceUnavailable:
      'A cited evidence PDF is not attached to this Case. Reload the Case and choose again.',
    blockedFindingCorrectionReason:
      'This change needs a reason, and a new Finding has none. Reload the Case before saving again.',
    timelineFindingRecorded:
      'Finding {sequence} recorded — {classification} ({stage})',
    timelineFindingCorrected:
      'Finding {sequence} — statement corrected (version {version})',
    timelineFindingReclassified:
      'Finding {sequence} reclassified — {classification}, {by} (version {version})',
    timelineNonconformityResponse:
      'Finding {sequence} — client’s response recorded (version {version})',
    timelineNonconformityPlanJudged:
      'Finding {sequence} — plan judged: {outcome} (version {version})',
    timelineNonconformityVerified:
      'Finding {sequence} — verification: {outcome} (version {version})',
    findingStage1: 'Stage 1',
    findingStage2: 'Stage 2',

    timelineTitle: 'Timeline',
    timelineEmpty: 'No step recorded yet.',
    timelineApplication: 'Application — version {version}',
    timelineReview: 'Application review — {outcome}',
    timelineDuration: 'Audit duration — version {version}',
    timelineAgreement: 'Certification agreement — version {version}',
    timelineTeam: 'Audit team — version {version}',
    timelineTeamDecision: 'Team decision — {decision} (team version {version})',
    timelineStage1Plan: 'Stage 1 plan — version {version}',
    timelineStage1Report: 'Stage 1 report — {conclusion} (version {version})',
    timelineStage2Plan: 'Stage 2 plan — version {version}',
    timelineStage2Report: 'Stage 2 report — version {version}',
    showValues: 'Show the recorded values',
    recommendationTitle: 'Team recommendation',
    recommendationMissing: 'No team recommendation is recorded yet.',
    recordRecommendation: 'Record the team recommendation',
    correctRecommendation: 'Correct the team recommendation',
    recommendationHelp:
      'The leader of the approved audit team recommends granting certification, not granting it, or an additional audit, and states the basis. Nothing is preselected. An additional audit is not part of this journey: with that recommendation, the Case can only be refused.',
    recommendationOutcome: 'Recommendation',
    recommendationGrant: 'Grant certification',
    recommendationDoNotGrant: 'Do not grant certification',
    recommendationAdditionalAudit: 'Additional audit needed',
    recommendationBasis: 'Basis of the recommendation',
    recommendationSubmit: 'Record the recommendation',
    recommendationValidation:
      'Choose a recommendation and state its basis (at most 4,000 characters).',
    recommendationAwaitingLeader:
      'The leader of the approved audit team records the team recommendation while holding Company Certification Auditor.',
    blockedRecommendationNotTeamLeader:
      'Only the leader of the approved audit team records the team recommendation. You are not linked to that team leader.',
    blockedRecommendationFindingsOpen:
      'The team recommendation is recorded once no nonconformity holds the Case. Reload the Case.',
    blockedRecommendationBeforeStage2:
      'The team recommendation is recorded after the Stage 2 report. Reload the Case.',
    dossierReviewTitle: 'Dossier review',
    dossierReviewMissing: 'No dossier review is recorded yet.',
    recordDossierReview: 'Record the dossier review',
    correctDossierReview: 'Correct the dossier review',
    dossierReviewHelp:
      'An approver who is not on the audit team answers every dossier item: present, missing or not applicable. Nothing is preselected; a missing item needs a note. This review is distinct from the document archive.',
    dossierAnswerPresent: 'Present',
    dossierAnswerMissing: 'Missing',
    dossierAnswerNotApplicable: 'Not applicable',
    dossierItemNote: 'Note',
    dossierConclusion: 'Conclusion of the review',
    dossierReviewSubmit: 'Record the review',
    dossierReviewValidation:
      'Answer every dossier item, write a note for each missing item (at most 1,000 characters per note) and the conclusion (at most 4,000 characters).',
    dossierReviewResult: 'Result',
    dossierComplete: 'Complete — no item missing',
    dossierIncomplete: 'Incomplete — missing items: {count}',
    dossierItemApplication: 'Application',
    dossierItemApplicationReview: 'Application review',
    dossierItemDuration: 'Audit duration',
    dossierItemAgreement: 'Certification agreement',
    dossierItemTeamApproval: 'Audit team approval',
    dossierItemStage1Plan: 'Stage 1 audit plan',
    dossierItemStage1Report: 'Stage 1 audit report',
    dossierItemStage2Plan: 'Stage 2 audit plan',
    dossierItemStage2Report: 'Stage 2 audit report',
    dossierItemParticipantLists: 'Participant lists',
    dossierItemFindingsFollowUp: 'Nonconformity follow-up',
    dossierItemRecommendation: 'Team recommendation',
    dossierItemCertificateData: 'Certificate data agreed with the client',
    dossierAwaitingApprover:
      'An approver who is not on the audit team reviews the dossier.',
    dossierIndependence:
      'You cannot review this dossier: you are linked to a member of the audit team. An approver who is not on the team reviews it.',
    blockedDossierBeforeRecommendation:
      'The dossier is reviewed after the team recommendation. Reload the Case.',
    blockedDecided:
      'The Certification Decision is recorded: what it relied on (duration, agreement, team, Stages, Findings, recommendation, dossier review) no longer changes; only the Certificate data and the Certificate remain. Reload the Case.',
    certificationDecisionTitle: 'Certification Decision',
    certificationDecisionMissing: 'No Certification Decision is recorded yet.',
    recordCertificationDecision: 'Record the Certification Decision',
    certificationDecisionHelp:
      'An approver who is not on the audit team records the certification body’s decision. Until the Certificate is recorded, a correction may change its texts and references with a reason, never its outcome. Nothing is preselected. A grant states the Certificate text granted for each Certificate language.',
    decisionOutcome: 'Decision',
    decisionGranted: 'Certification granted',
    decisionRefused: 'Certification refused',
    grantedTexts: 'Certificate texts granted',
    certificateTextsAgreed: 'Certificate texts agreed',
    certificateTextHeading: 'Certificate text {position}',
    certificateLanguage: 'Language',
    certificateLanguageHelp:
      'The language code of this Certificate text, for example ro or en; each language once.',
    certificateHolderName: 'Holder name',
    certificateAddress: 'Address',
    certificateScope: 'Scope',
    addCertificateLanguage: 'Add a Certificate language',
    removeCertificateText: 'Remove Certificate text {position}',
    decidedOn: 'Decision date',
    decidedBy: 'Decision maker',
    decidedByFunction: 'Function of the decision maker',
    decisionForm: 'Signed decision form',
    decisionFormNone: 'No signed decision form',
    decisionRationale: 'Rationale',
    decisionAdditionalInformation: 'Additional information used',
    decisionIndependenceAttestation:
      'I attest that the decision maker is not a member of the audit team.',
    decisionIndependenceLabel: 'Independence',
    decisionIndependenceAttested:
      'Attested: the decision maker is not a member of the audit team.',
    certificationDecisionSubmit: 'Record the decision',
    certificationDecisionValidation:
      'Complete the decision: choose the outcome and state the decision date, the decision maker and function (at most 200 characters each) and the rationale (at most 4,000 characters). A grant states one to four Certificate texts, one per language, each with the holder name, address and scope.',
    decisionAttestationRequired:
      'Confirm that the decision maker is not a member of the audit team.',
    decisionPreconditionsTitle:
      'The Certification Decision cannot be recorded until these preconditions hold:',
    decisionPreconditionsList: 'Unmet decision preconditions',
    decisionPreconditionsRefused:
      'The server refused the decision: these preconditions do not hold.',
    decisionPreconditionsUnknown:
      'The server refused the decision because a precondition does not hold. Reload the Case and check each step.',
    preconditionApplicationNotAccepted:
      'The application review has not accepted the application.',
    preconditionDurationMissing: 'No audit duration is confirmed.',
    preconditionAgreementMissing: 'No certification agreement is recorded.',
    preconditionTeamNotApproved:
      'The latest audit team version is not approved.',
    preconditionStage1NotReady:
      'No Stage 1 report concludes that the client is ready.',
    preconditionStage2NotReported: 'The Stage 2 report is not recorded.',
    preconditionFindingsOpen:
      'A nonconformity still holds the Case: it is verified effective, or its plan judged adequate for a minor Stage 2 nonconformity.',
    preconditionFindingsOverdue:
      'A nonconformity has passed its six-month limit.',
    preconditionRecommendationMissing: 'No team recommendation is recorded.',
    preconditionGrantAgainstRecommendation:
      'Certification cannot be granted against a team recommendation that is not to grant.',
    preconditionDossierReviewIncomplete:
      'The dossier review is not recorded, or it lists a missing item.',
    preconditionDecisionInFuture: 'The decision date is in the future.',
    decisionMakerIndependence:
      'The decision maker cannot be a member of the audit team: you are linked to a member of one of its versions, or the decision maker named is on the approved team.',
    certificationDecisionAwaitingApprover:
      'An approver who is not on the audit team records the Certification Decision.',
    certificationDecisionIndependence:
      'You cannot record the Certification Decision: you are linked to a member of the audit team. An approver who is not on the team decides.',
    decisionFormRole:
      'The signed decision form must be a PDF of this Case attached as a decision form. Reload the Case and choose again.',
    certificateDataTitle: 'Certificate data agreed with the client',
    certificateDataMissing: 'No Certificate data are agreed yet.',
    recordCertificateData: 'Record the Certificate data',
    correctCertificateData: 'Correct the Certificate data',
    certificateDataHelp:
      'A programme manager records, for each Certificate language, the holder name, address and scope agreed with the client, with the signed form. The Certificate is recorded once they state exactly what the decision grants.',
    certificateDataAgreedOn: 'Agreed on',
    certificateDataDocument: 'Signed Certificate data form',
    selectCertificateDataDocument: 'Choose the signed form',
    certificateDataSubmit: 'Record the Certificate data',
    certificateDataValidation:
      'Complete the Certificate data: one to four texts, one per language, each with the language (at most 10 characters), the holder name (at most 300), the address (at most 500) and the scope (at most 2,000); the date agreed and the signed form.',
    certificateDataNoDocument:
      'Attach the signed Certificate data form to this Case with the role “Certificate data form” first.',
    certificateDataAwaitingManager:
      'A programme manager records the Certificate data agreed with the client.',
    certificateDataDocumentRole:
      'The signed form must be a PDF of this Case attached as a Certificate data form. Reload the Case and choose again.',
    blockedCertificateDataBeforeStage2:
      'The Certificate data are agreed after the Stage 2 report. Reload the Case.',
    certificateTextsDiffer:
      'The agreed Certificate data differ from what the decision grants:',
    certificateDifferencesList: 'Differences from the decision',
    differenceNotAgreed:
      '{language}: granted by the decision, missing from the agreed data.',
    differenceNotGranted:
      '{language}: in the agreed data, not granted by the decision.',
    differenceField:
      '{language} — {field}: granted “{granted}”, agreed “{agreed}”.',
    certificateTitle: 'Certificate',
    certificateMissing: 'No Certificate is recorded yet.',
    recordCertificate: 'Record the issued Certificate',
    certificateHelp:
      'An approver who is not on the audit team records the issued Certificate once: its number, unique in the Company, the exact Certificate PDF and its signatory. The server computes the validity from the decision date.',
    certificateNumber: 'Certificate number',
    certificatePdf: 'Certificate PDF',
    selectCertificatePdf: 'Choose the Certificate PDF',
    certificateSignedBy: 'Signed by',
    certificateSignedByFunction: 'Function of the signatory',
    certificateIndependenceAttestation:
      'I attest that the signatory is not a member of the audit team.',
    certificateSubmit: 'Record the Certificate',
    certificateValidation:
      'Complete the Certificate: its number (at most 64 characters) and the Certificate PDF of this Case; the signatory and the function take at most 200 characters each.',
    certificateAttestationRequired:
      'Confirm that the signatory is not a member of the audit team.',
    certificateNoPdf:
      'Attach the issued Certificate PDF to this Case with the role “Certificate” first.',
    certificateAwaitingApprover:
      'An approver who is not on the audit team records the Certificate.',
    certificateApproverIndependence:
      'You cannot record the Certificate: you are linked to a member of the audit team. An approver who is not on the team records it.',
    certificateIndependence:
      'A member of the audit team cannot record or sign the Certificate: you are linked to one, or the signatory named is on the approved team.',
    certificateNumberTaken:
      'This Certificate number is already used in the Company. Check the number on the issued Certificate.',
    preconditionDiscrepanciesOpen:
      'A critical Discrepancy or an unaccepted error is open in the dossier consistency.',
    certificateDiscrepanciesOpen:
      'A critical Discrepancy or an unaccepted error is open: resolve it under "Dossier consistency" before recording the Certificate. Reload the Case.',
    discrepancyNotOpen:
      'This Discrepancy is no longer open on the current Case. Reload the Case.',
    discrepancyValidation:
      'State the compared fields (at most 200 characters), the verdict and both values (at most 1,000 characters each), each on a document attached to this Case; locations take at most 200 characters and the note 2,000.',
    discrepancyReasonRequired: 'State the reason (at most 2,000 characters).',
    discrepancyCorrectionRequired:
      'Select the record version or Document Version that corrects it, and state the reason.',
    discrepancyCritical:
      'A critical Discrepancy cannot be accepted; only a correction of the records resolves it.',
    discrepancyCorrectedByRecord:
      'A Discrepancy raised by a rule closes when a new record version makes its values agree; it cannot be closed by hand.',
    discrepancyNotOnTeam:
      'An auditor records a Discrepancy only on a Case whose audit team includes them.',
    discrepancyIndependence:
      'A member of the audit team cannot resolve this Discrepancy, nor record one as an approver.',
    discrepancyCorrectionUnknown:
      'The named correction is not a record version of this Case. Reload the Case.',
    discrepancyDocumentUnavailable:
      'A selected document is no longer attached to this Case. Reload the Case.',
    certificateDataDiffers:
      'The agreed Certificate data must state exactly what the decision grants. Reload the Case and correct the Certificate data first.',
    blockedCertificateDataDiffers:
      'The Certificate is recorded once the agreed Certificate data state exactly what the decision grants. Correct the Certificate data first.',
    blockedCertificateNotGranted:
      'A Certificate follows a granting Certification Decision. Reload the Case.',
    blockedCertificateDataMissing:
      'The Certificate is recorded once the Certificate data are agreed with the client.',
    certificatePdfRole:
      'The Certificate PDF must be attached to this Case as a Certificate. Reload the Case and choose again.',
    certificateValidFrom: 'Valid from',
    certificateValidUntil: 'Valid until',
    certificateFirstSurveillanceBy: 'First surveillance to start by',
    certificateValidityNote:
      'Computed by the server from the decision date: valid three years minus one day; the first surveillance starts within twelve months.',
    certificateTexts: 'Certificate texts',
    statusRefused: 'Closed — certification refused',
    statusCertified: 'Certified',
    caseCertifiedNote:
      'This Case is certified: its Certificate is recorded. Every record is now read-only.',
    caseRefusedNote:
      'This Case is closed: certification was refused. Every record is now read-only; a new application needs a new Case.',
    caseClosedRefusal: 'This Case is closed. Reload it to see its final state.',
    nextDossierReview: 'Dossier review',
    nextCertificationDecision: 'Certification Decision',
    nextCertificateData: 'Certificate data agreed with the client',
    nextCertificate: 'Certificate',
    stepRecommendation: 'Team recommendation',
    stepDossierReview: 'Dossier review',
    stepCertificationDecision: 'Certification Decision',
    stepCertificateData: 'Certificate data',
    stepCertificate: 'Certificate',
    stepRecommended: '{recommendation} — version {version}',
    stepWaitingFollowUp: 'Waits for the nonconformity follow-up',
    stepWaitingRecommendation: 'Waits for the team recommendation',
    stepDossierComplete: 'Complete — version {version}',
    stepDossierIncomplete: 'Item missing — version {version}',
    stepWaitingDossierReview: 'Waits for the dossier review',
    stepWaitingGrant: 'Waits for a granting decision',
    stepWaitingCertificateData: 'Waits for the agreed Certificate data',
    stepCertificateRecorded: 'Recorded — {number}',
    timelineRecommendation:
      'Team recommendation — {recommendation} (version {version})',
    timelineDossierReview: 'Dossier review — version {version}',
    timelineCertificationDecision: 'Certification Decision — {decision}',
    timelineCertificateData: 'Certificate data — version {version}',
    timelineCertificate: 'Certificate {number} recorded',
    roleCertificateData: 'Certificate data form',
    roleDecisionForm: 'Decision form',
    blockedVersionCorrectionReason:
      'A new version needs a reason and a first record has none. Reload the Case before saving again.',
    applicationSubmittedOn: 'Date of the signed application',
    applicationSubmittedOnHelp:
      'Optional: the date written on the signed application, when the paper dossier has it.',
    actingOnBehalf:
      'A person of the certification body performed this act; I record it on their behalf.',
    actingHelp:
      'You stay recorded as the member who entered it. Name the person who acted, their function and the date of the act; a signed form attached to the Case is optional.',
    actingName: 'Name of the person who acted',
    actingFunction: 'Their function',
    actingDate: 'Date of the act',
    actingForm: 'Signed form',
    actingFormNone: 'No signed form',
    actingReviewLegend: 'Application review by the certification body',
    actingReviewView: 'Reviewed on behalf of the certification body by',
    actingDurationLegend: 'Duration approval by the certification body',
    actingDurationView: 'Approved on behalf of the certification body by',
    actingTeamDecisionLegend: 'Team decision by the certification body',
    actingTeamDecisionView: 'Decided on behalf of the certification body by',
    actingReportApprovalLegend: 'Report approval by the certification body',
    actingReportApprovalView:
      'Report approved on behalf of the certification body by',
    actingValidation:
      'Complete the act recorded on behalf of the certification body: the name and function of the person who acted (at most 200 characters each) and the date of the act. The signed form, when chosen, must be attached to this Case.',
    actingOnTeam:
      'The person named as acting for the certification body is on the audit team. A member of the audit team cannot perform this act; check the name.',
    actInFuture:
      'The act on behalf of the certification body cannot be dated after today. Check the date of the act.',
    independenceLabel: 'Independence from the audit team',
    independenceAttested: 'Attested by the member who recorded it',
    independenceUnattested:
      'Not attested: recorded before the attestation was stored',
    teamDecisionAttestation:
      'I attest that the person deciding on this team is not a member of the audit team.',
    teamDecisionAttestationRequired:
      'Confirm that the person deciding on the team is not a member of the audit team.',
    dossierReviewerLegend: 'Dossier reviewer for the certification body',
    dossierApproverLegend: 'Approver for the certification body',
    dossierReviewerView:
      'Dossier reviewed on behalf of the certification body by',
    dossierApproverView: 'Approved on behalf of the certification body by',
    dossierAttestation:
      'I attest that the dossier reviewer and the approver are not members of the audit team.',
    dossierAttestationRequired:
      'Confirm that the dossier reviewer and the approver are not members of the audit team.',
    declarationConfirmed: 'Confirmed',
    declarationConflict: 'Conflict',
    declarationToVerify: 'To verify',
    declarationsToVerify: 'Declaration to verify',
    impartialityAnalysis: 'Impartiality analysis',
    impartialityAnalysisHelp:
      'Optional: document how the impartiality of the team was analysed, with evidence attached to the Case.',
    impartialityAnalysisRequiredHelp:
      'Required: the application declared a consultant ({consultant}). Document how the links between the consultant and the team were analysed, with evidence attached to the Case.',
    impartialityAnalysisNote: 'Analysis',
    impartialityAnalysisEvidence: 'Evidence attached to the Case',
    impartialityAnalysisNone: 'Not documented',
    teamAnalysisRequired:
      'Write the impartiality analysis (at most 4,000 characters, at most ten attachments of this Case). It is required when the application declares a consultant or when evidence is chosen.',
    recommendedOn: 'Date of the recommendation',
    correctDecisionTexts: 'Correct the decision texts',
    decisionCorrectionHelp:
      'A correction records a new version of the decision with its reason. The decided outcome stays as recorded; only the texts and references change, and every precondition is checked again.',
    decisionOutcomeFixed:
      'Decision: {outcome}. A correction keeps the decided outcome.',
    decisionOutcomeFixedRefusal:
      'A correction keeps the decided outcome; only its texts and references change. Reload the Case.',
    decisionEarlierVersions: 'Earlier versions of the decision ({count})',
    timelineCertificationDecisionVersion:
      'Certification Decision — {decision} (version {version})',
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
    auditorBundle: 'Auditeur de certification de la société',
    auditorPrerequisites:
      'Un auditeur de certification n’agit que s’il détient aussi le droit de lecteur de certification dans la même Société. Seul l’auditeur lié au responsable de l’équipe d’audit approuvée enregistre les rapports d’étape.',
    auditorGranted: 'a accordé le droit d’auditeur de certification',
    auditorRevoked: 'a révoqué le droit d’auditeur de certification',

    title: 'Certification',
    introduction:
      'Dossiers de certification de ce Projet : la demande du client, sa revue, la durée d’audit, les originaux signés joints, le contrat de certification, l’équipe d’audit avec son approbation, les audits des étapes 1 et 2 avec leurs plans, rapports et constats, la recommandation de l’équipe, la revue du dossier, la décision de certification et le certificat, avec chaque version enregistrée.',
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
    nextStage1Report: 'Rapport d’audit de l’étape 1',
    nextStage2Plan: 'Plan d’audit de l’étape 2',
    nextStage2Report: 'Rapport d’audit de l’étape 2',
    nextRecommendation: 'Recommandation de l’équipe',
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
    stepStage1: 'Audit de l’étape 1',
    stepStage2: 'Audit de l’étape 2',
    stepWaitingTeamApproval: 'Attend l’équipe approuvée',
    stepWaitingStage1Ready:
      'Attend un rapport de l’étape 1 concluant que le client est prêt',
    stepPlanned: 'Planifié — version {version}',
    stepStageReady: 'Prêt — rapport version {version}',
    stepStageNotReady: 'Pas prêt — rapport version {version}',
    stepReported: 'Rapporté — version {version}',

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
    blockedApplicationDecided:
      'La demande ne peut plus être corrigée : la décision de certification est enregistrée.',
    blockedAlreadyReviewed:
      'Cette demande a déjà été revue. Rechargez le dossier.',
    blockedClosed:
      'Ce dossier est clos : la demande a été rejetée. Aucune autre étape ne peut être enregistrée ; une nouvelle demande exige un nouveau dossier.',
    blockedCorrectionReason:
      'Une correction exige un motif et une première demande n’en a pas. Rechargez le dossier avant d’enregistrer à nouveau.',
    blockedCorrectionUnchanged:
      'La correction ne change aucune valeur. Modifiez au moins une valeur ou annulez la correction.',

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
    registerPdfTitle: 'Registre du dossier en PDF',
    registerPdfHelp:
      'PDF généré qui liste chaque version d’étape et chaque version de document référencée de ce dossier, dans la langue de l’interface. Ce n’est pas un formulaire officiel de l’organisme de certification et il ne remplace aucun original signé.',
    registerPdfDownload: 'Télécharger le registre du dossier (PDF)',
    registerPdfDownloading: 'Génération du registre du dossier…',
    registerPdfFailed:
      'Le registre du dossier n’a pas pu être téléchargé. Réessayez.',
    registerPdfUnavailable:
      'Le registre de ce dossier est indisponible. Rechargez le dossier.',
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
    conflictNote: 'Conflit ou point à vérifier',
    conflictNoteHelp:
      'Obligatoire, car une déclaration est un conflit ou reste à vérifier : décrivez le conflit ou ce qui reste à vérifier. L’équipe peut être proposée, mais elle n’est approuvée qu’une fois chaque déclaration confirmée.',
    conflictDeclared: 'Conflit déclaré',
    addTeamMember: 'Ajouter un membre',
    removeTeamMember: 'Retirer le membre {number}',
    proposeTeam: 'Proposer l’équipe',
    correctTeam: 'Proposer une nouvelle version de l’équipe',
    teamCorrectionHelp:
      'Une nouvelle version remplace la proposition actuelle, indique son motif et exige une nouvelle décision d’un approbateur. Les versions antérieures restent dans la chronologie.',
    teamValidation:
      'Complétez chaque membre : un nom (200 caractères au plus), un rôle, une note de compétence (1 000 caractères au plus) et une réponse à chaque déclaration. Une équipe compte un à dix membres.',
    teamConflictNoteRequired:
      'Décrivez le conflit ou ce qui reste à vérifier (1 000 caractères au plus) pour chaque membre ayant une déclaration non confirmée.',
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
      'Une déclaration de cette équipe n’est pas confirmée (un conflit ou un point à vérifier) : l’équipe ne peut pas être approuvée. Renvoyez-la avec un motif ; elle pourra être approuvée lorsqu’une nouvelle version confirmera chaque déclaration.',
    teamConflictDeclared:
      'Une équipe ayant une déclaration non confirmée ne peut pas être approuvée. Renvoyez-la avec un motif.',
    teamIndependence:
      'Vous ne pouvez pas statuer sur cette équipe : vous êtes lié à un membre de l’une de ses versions. Un approbateur qui ne fait pas partie de l’équipe doit statuer.',
    teamMemberDecided:
      'Une personne qui a approuvé cette équipe, approuvé un rapport d’étape, revu le dossier ou enregistré la décision, directement ou au nom de l’organisme de certification, ne peut pas en faire partie. Retirez cette personne ou ce lien, rechargez le dossier et proposez à nouveau.',
    blockedTeamNotPending:
      'Aucune équipe proposée n’attend plus de décision. Rechargez le dossier.',

    nextRecommendationPending:
      'Les deux étapes sont rapportées et aucune non-conformité ne retient le dossier. Le responsable de l’équipe d’audit approuvée enregistre la recommandation de l’équipe.',
    stage1Title: 'Audit de l’étape 1',
    stage2Title: 'Audit de l’étape 2',
    stagePlanTitle: 'Plan d’audit',
    stageReportTitle: 'Rapport d’audit',
    stagePlanMissing: 'Aucun plan n’est encore enregistré pour cette étape.',
    stageReportMissing:
      'Aucun rapport n’est encore enregistré pour cette étape.',
    stageStartDate: 'Date de début',
    stageEndDate: 'Date de fin',
    stageOnSiteDays: 'Jours-auditeur sur site',
    stageRemoteDays: 'Jours-auditeur à distance',
    stageOnSiteDaysHelp:
      'Durée confirmée sur site pour cette étape, en jours-auditeur : {days}. Un autre nombre de jours sur site exige une note expliquant l’écart.',
    stageDaysFormatHelp:
      'Au plus deux décimales, avec un point, par exemple 0.5.',
    stageObjectives: 'Objectifs',
    stageScope: 'Périmètre de l’audit',
    stagePlanDocument: 'PDF du plan d’audit',
    selectStagePlanDocument: 'Sélectionnez le plan d’audit joint',
    stageSentToClientOn: 'Envoyé au client le',
    stageSentToClientOnHelp:
      'Laissez vide tant que le plan n’a pas été envoyé au client.',
    stageNotSent: 'Pas encore envoyé',
    stageDeviationNote: 'Écart par rapport à la durée confirmée',
    stageDeviationNoteHelp:
      'Obligatoire, car les jours sur site diffèrent de la durée confirmée.',
    stageNoDeviation: 'Aucun écart déclaré',
    stageReportDate: 'Date du rapport',
    stageDocumentReview: 'Revue documentaire',
    stageDocumentReviewCompleted: 'Terminée',
    stageDocumentReviewConfirm: 'La revue documentaire est terminée',
    stageConclusion: 'Aptitude pour l’étape 2',
    stageConclusionReady: 'Prêt pour l’étape 2',
    stageConclusionNotReady: 'Pas prêt pour l’étape 2',
    stageConclusionNote: 'Fondement de la conclusion',
    stageSummary: 'Synthèse de l’audit de l’étape 2',
    stageReportDocument: 'PDF du rapport d’audit',
    selectStageReportDocument: 'Sélectionnez le rapport d’audit joint',
    stageParticipantList: 'PDF de la liste des participants',
    stageNoParticipantList: 'Aucune liste des participants',
    stageAnnex: 'PDF de l’annexe',
    stageNoAnnex: 'Aucune annexe',
    stageNoAttachment: 'Aucune pièce jointe',
    recordStage1Plan: 'Enregistrer le plan de l’étape 1',
    correctStage1Plan: 'Corriger le plan de l’étape 1',
    recordStage2Plan: 'Enregistrer le plan de l’étape 2',
    correctStage2Plan: 'Corriger le plan de l’étape 2',
    recordStage1Report: 'Enregistrer le rapport de l’étape 1',
    correctStage1Report: 'Corriger le rapport de l’étape 1',
    recordStage2Report: 'Enregistrer le rapport de l’étape 2',
    correctStage2Report: 'Corriger le rapport de l’étape 2',
    stagePlanHelp:
      'Planifiez cette étape : ses dates, les jours-auditeur sur site et à distance, les objectifs et le périmètre, ainsi que le PDF du plan joint avec la date de son envoi au client.',
    stage1ReportHelp:
      'Enregistrez la conclusion de l’étape 1 : la revue documentaire terminée, l’aptitude du client pour l’étape 2 et son fondement, avec le rapport et la liste des participants joints.',
    stage2ReportHelp:
      'Enregistrez la réalisation de l’audit de l’étape 2 avec le rapport joint, la liste des participants et une annexe facultative.',
    stageNoPlanDocument:
      'Aucun document n’est encore joint avec le rôle Plan d’audit. Joignez d’abord le PDF du plan au registre des pièces.',
    stageNoReportDocument:
      'Aucun document n’est encore joint avec le rôle Rapport d’audit. Joignez d’abord le PDF du rapport au registre des pièces.',
    stagePlanValidation:
      'Complétez le plan : dates de début et de fin, jours-auditeur sur site supérieurs à zéro et jours-auditeur à distance avec au plus deux décimales, objectifs et périmètre (2 000 caractères au plus chacun) et plan d’audit joint. La date d’envoi au client est facultative.',
    stageDatesRule:
      'Une étape se termine à sa date de début ou après. Vérifiez les dates.',
    stageDeviationNoteRequired:
      'Les jours sur site diffèrent de la durée confirmée : expliquez l’écart (2 000 caractères au plus).',
    stageDeviationNoteRule:
      'Les jours sur site et la note d’écart ne correspondent plus à la durée confirmée. Rechargez le dossier et vérifiez-les.',
    stage2StartRule:
      'L’étape 2 commence après la date du rapport de l’étape 1. Choisissez une date de début ultérieure.',
    stage1ReportValidation:
      'Complétez le rapport : la date du rapport, la conclusion et son fondement (4 000 caractères au plus) et le rapport d’audit joint. La liste des participants est facultative.',
    stage2ReportValidation:
      'Complétez le rapport : la date du rapport, la synthèse (4 000 caractères au plus) et le rapport d’audit joint. La liste des participants et l’annexe sont facultatives.',
    stageDocumentReviewRequired:
      'L’étape 1 comprend la revue documentaire : confirmez qu’elle est terminée avant d’enregistrer le rapport.',
    stageReportDateRule:
      'Un rapport est daté du début de son étape ou après. Vérifiez la date du rapport.',
    stageAttachmentRole:
      'Un PDF choisi n’est pas joint avec le rôle attendu. Rechargez le dossier et choisissez à nouveau.',
    blockedStagePlanTeamNotApproved:
      'L’audit se planifie une fois la dernière version de l’équipe d’audit approuvée.',
    blockedStage2BeforeStage1Report:
      'L’étape 2 se planifie après un rapport de l’étape 1 concluant que le client est prêt.',
    blockedStage2NotReady:
      'Le rapport de l’étape 1 conclut que le client n’est pas prêt. L’étape 2 pourra être planifiée dès qu’un rapport corrigé de l’étape 1 conclura que le client est prêt.',
    blockedStageReportBeforePlan:
      'Le rapport s’enregistre une fois cette étape planifiée.',
    blockedStageReportTeamNotApproved:
      'Le responsable de l’équipe d’audit approuvée enregistre les rapports ; la dernière version de l’équipe n’est pas approuvée.',
    blockedNotTeamLeader:
      'Seul le responsable de l’équipe d’audit approuvée enregistre ce rapport. Vous n’êtes pas lié à ce responsable d’équipe.',
    stageReportAwaitingLeader:
      'Le responsable de l’équipe d’audit approuvée enregistre ce rapport en détenant le droit d’auditeur de certification.',
    stagePlanAwaitingManager:
      'Un responsable de programme planifie cette étape.',
    blockedStagePlanCorrectionReason:
      'Une nouvelle version du plan exige un motif et un premier plan n’en a pas. Rechargez le dossier avant d’enregistrer à nouveau.',
    blockedStageReportCorrectionReason:
      'Une nouvelle version du rapport exige un motif et un premier rapport n’en a pas. Rechargez le dossier avant d’enregistrer à nouveau.',

    nextFindingsFollowUp: 'Suivi des non-conformités',
    nextFindingsFollowUpPending:
      'Les deux étapes sont rapportées. Avant la recommandation de l’équipe, chaque non-conformité majeure et chaque non-conformité de l’étape 1 est vérifiée efficace, et chaque autre non-conformité mineure a un plan jugé adéquat.',
    stepFindings: 'Suivi des non-conformités',
    stepWaitingStage2Report: 'Attend le rapport de l’étape 2',
    stepFindingsOpen: 'Ouvert — {count} à suivre',
    stepFindingsDone: 'Terminé',
    blockedStage2NonconformityOpen:
      'L’étape 2 est planifiée une fois chaque non-conformité de l’étape 1 vérifiée efficace. Suivez d’abord les non-conformités ouvertes de l’étape 1.',
    stage1FindingsTitle: 'Constats de l’étape 1',
    stage2FindingsTitle: 'Constats de l’étape 2',
    findingsHelp:
      'Le responsable de l’équipe d’audit approuvée enregistre chaque constat avec son exigence, son processus ou domaine, son énoncé, sa classification et ses preuves exactes, puis suit chaque non-conformité. Un approbateur qui ne fait pas partie de l’équipe peut reclasser un constat avec un motif. Chaque version reste dans l’historique.',
    findingsEmpty: 'Aucun constat n’est enregistré pour cette étape.',
    findingHeading: 'Constat {sequence} — {classification}',
    findingClassification: 'Classification',
    classificationMajor: 'Non-conformité majeure',
    classificationMinor: 'Non-conformité mineure',
    classificationOpportunity: 'Opportunité d’amélioration',
    classificationAreaOfConcern: 'Point de vigilance',
    findingClause: 'Exigence (article)',
    findingArea: 'Processus ou domaine',
    findingStatement: 'Énoncé',
    findingEvidence: 'Preuves',
    findingNoEvidence: 'Aucune preuve citée',
    findingNotStated: 'Non indiqué',
    findingStatus: 'Suivi',
    statusNoActionRequired: 'Aucun suivi requis',
    statusAwaitingResponse: 'En attente de la réponse du client',
    statusAwaitingPlanJudgment: 'Plan à juger',
    statusPlanInadequate:
      'Plan non adéquat — une nouvelle réponse est attendue',
    statusPlanAdequate: 'Plan adéquat — mise en œuvre à vérifier',
    statusVerifiedEffective: 'Vérifiée efficace',
    statusVerifiedNotEffective:
      'Non efficace — une nouvelle réponse est attendue',
    findingResponseDueOn: 'Réponse attendue le',
    findingLimitOn: 'Limite de six mois',
    findingOverdue: 'Dépassée',
    findingOverdueNote:
      'La limite de six mois est dépassée sans vérification de l’élimination de la non-conformité.',
    findingHoldsVerification:
      'Bloque l’étape suivante jusqu’à sa vérification efficace.',
    findingHoldsPlan:
      'Bloque l’étape suivante jusqu’à ce que son plan soit jugé adéquat.',
    findingHistory: 'Historique du constat {sequence}',
    findingRecordStatement: 'Énoncé — version {version}',
    findingRecordClassification:
      'Classification — {classification}, {by} (version {version})',
    classifiedByTeamLeader: 'par le responsable d’équipe',
    classifiedByApprover: 'par l’approbateur',
    findingRecordResponse: 'Réponse du client — version {version}',
    findingRecordPlanJudgment:
      'Jugement du plan — {outcome} (version {version})',
    findingRecordVerification: 'Vérification — {outcome} (version {version})',
    responseCorrection: 'Correction',
    responseCause: 'Cause',
    responseCorrectiveAction: 'Action corrective',
    responseReceivedOn: 'Reçue le',
    responsePlannedCompletionOn: 'Réalisation prévue',
    responseNoPlannedCompletion: 'Non indiquée',
    planOutcome: 'Adéquation du plan',
    planAdequate: 'Adéquat',
    planInadequate: 'Non adéquat',
    planNote: 'Fondement du jugement',
    verificationVerifiedOn: 'Vérifiée le',
    verificationMethod: 'Méthode de vérification',
    methodDocumentReview: 'Revue documentaire',
    methodOnSite: 'Sur site',
    verificationOutcome: 'Efficacité',
    outcomeEffective: 'Efficace',
    outcomeNotEffective: 'Non efficace',
    verificationNote: 'Note de vérification',
    recordStage1Finding: 'Enregistrer un constat de l’étape 1',
    recordStage2Finding: 'Enregistrer un constat de l’étape 2',
    findingSubmit: 'Enregistrer le constat',
    recordFindingHelp:
      'Choisissez la classification, indiquez l’exigence, le processus ou domaine et l’énoncé, et citez les preuves exactes jointes à ce dossier. Une non-conformité cite au moins un PDF de preuve ; une opportunité d’amélioration peut omettre l’exigence et le domaine.',
    findingClauseHelp:
      'Par exemple 8.5.1. Facultatif uniquement pour une opportunité d’amélioration.',
    findingEvidenceHelp:
      'PDF joints à ce dossier avec le rôle Preuve, dix au plus.',
    findingNoEvidenceDocument:
      'Aucun document n’est encore joint avec le rôle Preuve. Joignez d’abord les PDF de preuve au registre des pièces : une non-conformité en cite au moins un.',
    correctFinding: 'Corriger l’énoncé du constat {sequence}',
    changeClassification: 'Changer la classification du constat {sequence}',
    reclassifyFinding: 'Reclasser le constat {sequence}',
    classificationChangeHelp:
      'En tant que responsable d’équipe, choisissez la nouvelle classification et indiquez le motif. La classification antérieure reste dans l’historique.',
    reclassificationHelp:
      'En tant qu’approbateur qui ne fait pas partie de l’équipe d’audit, choisissez la nouvelle classification et indiquez le motif. La classification antérieure reste dans l’historique.',
    classificationNew: 'Nouvelle classification',
    classificationReason: 'Motif de la nouvelle classification',
    classificationSubmit: 'Enregistrer la classification',
    recordResponse: 'Enregistrer la réponse du client au constat {sequence}',
    responseHelp:
      'Enregistrez la correction, l’analyse des causes et le plan d’actions correctives du client tels que reçus, avec des preuves facultatives. Une nouvelle réponse après un plan jugé non adéquat est une nouvelle version.',
    responseSubmit: 'Enregistrer la réponse',
    judgePlan: 'Juger le plan du constat {sequence}',
    judgePlanHelp:
      'Jugez si la dernière réponse est adéquate pour éliminer la non-conformité, et sur quel fondement.',
    judgmentSubmit: 'Enregistrer le jugement',
    verifyFinding: 'Vérifier la mise en œuvre du constat {sequence}',
    verifyHelp:
      'Enregistrez quand et comment la mise en œuvre a été vérifiée, si elle est efficace, et des preuves facultatives.',
    verificationSubmit: 'Enregistrer la vérification',
    findingValidation:
      'Complétez le constat : choisissez une classification et rédigez l’énoncé (4 000 caractères au plus). L’exigence compte au plus 40 caractères et le processus ou domaine au plus 300 ; citez au plus dix PDF de preuve de ce dossier.',
    findingStatementValidation:
      'Rédigez l’énoncé (4 000 caractères au plus). L’exigence compte au plus 40 caractères et le processus ou domaine au plus 300 ; citez au plus dix PDF de preuve de ce dossier.',
    findingClauseRequired:
      'Indiquez l’exigence et le processus ou domaine. Seule une opportunité d’amélioration peut les omettre.',
    findingClassificationStage:
      'Un point de vigilance n’est enregistré qu’à l’étape 1. Choisissez une autre classification.',
    findingEvidenceRequired:
      'Une non-conformité cite au moins un PDF de preuve exact joint à ce dossier.',
    classificationValidation:
      'Choisissez la nouvelle classification et indiquez le motif (2 000 caractères au plus).',
    classificationUnchanged:
      'C’est déjà la classification du constat. Choisissez-en une autre ou annulez.',
    responseValidation:
      'Complétez la réponse : la correction, la cause et l’action corrective (4 000 caractères au plus chacune) et la date de réception. La date de réalisation prévue et les preuves sont facultatives.',
    judgmentValidation:
      'Indiquez si le plan est adéquat et le fondement du jugement (2 000 caractères au plus).',
    verificationValidation:
      'Complétez la vérification : sa date, sa méthode et son résultat, et la note (2 000 caractères au plus). Les preuves sont facultatives.',
    blockedFindingTeamNotApproved:
      'Le responsable de l’équipe d’audit approuvée enregistre les constats ; la dernière version de l’équipe n’est pas approuvée.',
    blockedFindingNotTeamLeader:
      'Seul le responsable de l’équipe d’audit approuvée enregistre les constats et leur suivi. Vous n’êtes pas lié à ce responsable d’équipe.',
    blockedFindingStageClosed:
      'Les constats de l’étape 1 sont enregistrés avant la planification de l’étape 2.',
    blockedFindingStageNotPlanned:
      'Les constats sont enregistrés une fois cette étape planifiée. Rechargez le dossier.',
    findingNotOpen:
      'Seule une non-conformité ouverte reçoit une réponse. Rechargez le dossier.',
    findingNoResponse:
      'Le plan est jugé une fois la réponse du client enregistrée. Rechargez le dossier.',
    findingPlanNotAdequate:
      'La mise en œuvre est vérifiée une fois le plan jugé adéquat. Rechargez le dossier.',
    findingLimitPassed:
      'Le délai de six mois de cette non-conformité est dépassé sans vérification efficace : ce parcours de certification ne peut pas continuer. Une étape répétée ou un audit complémentaire sort de cette version.',
    findingIndependence:
      'Vous ne pouvez pas reclasser les constats : vous êtes lié à un membre de l’équipe d’audit. Un approbateur qui ne fait pas partie de l’équipe reclasse.',
    findingEvidenceUnavailable:
      'Un PDF de preuve cité n’est pas joint à ce dossier. Rechargez le dossier et choisissez à nouveau.',
    blockedFindingCorrectionReason:
      'Ce changement nécessite un motif, et un nouveau constat n’en a pas. Rechargez le dossier avant d’enregistrer à nouveau.',
    timelineFindingRecorded:
      'Constat {sequence} enregistré — {classification} ({stage})',
    timelineFindingCorrected:
      'Constat {sequence} — énoncé corrigé (version {version})',
    timelineFindingReclassified:
      'Constat {sequence} reclassé — {classification}, {by} (version {version})',
    timelineNonconformityResponse:
      'Constat {sequence} — réponse du client enregistrée (version {version})',
    timelineNonconformityPlanJudged:
      'Constat {sequence} — plan jugé : {outcome} (version {version})',
    timelineNonconformityVerified:
      'Constat {sequence} — vérification : {outcome} (version {version})',
    findingStage1: 'étape 1',
    findingStage2: 'étape 2',

    timelineTitle: 'Chronologie',
    timelineEmpty: 'Aucune étape enregistrée pour l’instant.',
    timelineApplication: 'Demande — version {version}',
    timelineReview: 'Revue de la demande — {outcome}',
    timelineDuration: 'Durée d’audit — version {version}',
    timelineAgreement: 'Contrat de certification — version {version}',
    timelineTeam: 'Équipe d’audit — version {version}',
    timelineTeamDecision:
      'Décision sur l’équipe — {decision} (version {version} de l’équipe)',
    timelineStage1Plan: 'Plan de l’étape 1 — version {version}',
    timelineStage1Report:
      'Rapport de l’étape 1 — {conclusion} (version {version})',
    timelineStage2Plan: 'Plan de l’étape 2 — version {version}',
    timelineStage2Report: 'Rapport de l’étape 2 — version {version}',
    showValues: 'Afficher les valeurs enregistrées',
    recommendationTitle: 'Recommandation de l’équipe',
    recommendationMissing:
      'Aucune recommandation de l’équipe n’est encore enregistrée.',
    recordRecommendation: 'Enregistrer la recommandation de l’équipe',
    correctRecommendation: 'Corriger la recommandation de l’équipe',
    recommendationHelp:
      'Le responsable de l’équipe d’audit approuvée recommande d’accorder la certification, de ne pas l’accorder ou un audit complémentaire, et en indique le fondement. Rien n’est présélectionné. Un audit complémentaire ne fait pas partie de ce parcours : avec cette recommandation, le dossier ne peut qu’être refusé.',
    recommendationOutcome: 'Recommandation',
    recommendationGrant: 'Accorder la certification',
    recommendationDoNotGrant: 'Ne pas accorder la certification',
    recommendationAdditionalAudit: 'Audit complémentaire nécessaire',
    recommendationBasis: 'Fondement de la recommandation',
    recommendationSubmit: 'Enregistrer la recommandation',
    recommendationValidation:
      'Choisissez une recommandation et indiquez son fondement (4 000 caractères au plus).',
    recommendationAwaitingLeader:
      'Le responsable de l’équipe d’audit approuvée enregistre la recommandation de l’équipe en détenant le droit d’auditeur de certification.',
    blockedRecommendationNotTeamLeader:
      'Seul le responsable de l’équipe d’audit approuvée enregistre la recommandation de l’équipe. Vous n’êtes pas lié à ce responsable d’équipe.',
    blockedRecommendationFindingsOpen:
      'La recommandation de l’équipe est enregistrée une fois qu’aucune non-conformité ne retient le dossier. Rechargez le dossier.',
    blockedRecommendationBeforeStage2:
      'La recommandation de l’équipe est enregistrée après le rapport de l’étape 2. Rechargez le dossier.',
    dossierReviewTitle: 'Revue du dossier',
    dossierReviewMissing: 'Aucune revue du dossier n’est encore enregistrée.',
    recordDossierReview: 'Enregistrer la revue du dossier',
    correctDossierReview: 'Corriger la revue du dossier',
    dossierReviewHelp:
      'Un approbateur qui ne fait pas partie de l’équipe d’audit répond pour chaque élément du dossier : présent, manquant ou sans objet. Rien n’est présélectionné ; un élément manquant exige une note. Cette revue est distincte du registre des pièces.',
    dossierAnswerPresent: 'Présent',
    dossierAnswerMissing: 'Manquant',
    dossierAnswerNotApplicable: 'Sans objet',
    dossierItemNote: 'Note',
    dossierConclusion: 'Conclusion de la revue',
    dossierReviewSubmit: 'Enregistrer la revue',
    dossierReviewValidation:
      'Répondez pour chaque élément du dossier, rédigez une note pour chaque élément manquant (1 000 caractères au plus par note) et la conclusion (4 000 caractères au plus).',
    dossierReviewResult: 'Résultat',
    dossierComplete: 'Complet — aucun élément manquant',
    dossierIncomplete: 'Incomplet — éléments manquants : {count}',
    dossierItemApplication: 'Demande',
    dossierItemApplicationReview: 'Revue de la demande',
    dossierItemDuration: 'Durée d’audit',
    dossierItemAgreement: 'Contrat de certification',
    dossierItemTeamApproval: 'Approbation de l’équipe d’audit',
    dossierItemStage1Plan: 'Plan d’audit de l’étape 1',
    dossierItemStage1Report: 'Rapport d’audit de l’étape 1',
    dossierItemStage2Plan: 'Plan d’audit de l’étape 2',
    dossierItemStage2Report: 'Rapport d’audit de l’étape 2',
    dossierItemParticipantLists: 'Listes des participants',
    dossierItemFindingsFollowUp: 'Suivi des non-conformités',
    dossierItemRecommendation: 'Recommandation de l’équipe',
    dossierItemCertificateData:
      'Données du certificat convenues avec le client',
    dossierAwaitingApprover:
      'Un approbateur qui ne fait pas partie de l’équipe d’audit revoit le dossier.',
    dossierIndependence:
      'Vous ne pouvez pas revoir ce dossier : vous êtes lié à un membre de l’équipe d’audit. Un approbateur qui ne fait pas partie de l’équipe le revoit.',
    blockedDossierBeforeRecommendation:
      'Le dossier est revu après la recommandation de l’équipe. Rechargez le dossier.',
    blockedDecided:
      'La décision de certification est enregistrée : ce sur quoi elle repose (durée, contrat, équipe, étapes, constats, recommandation, revue du dossier) ne change plus ; il ne reste que les données du certificat et le certificat. Rechargez le dossier.',
    certificationDecisionTitle: 'Décision de certification',
    certificationDecisionMissing:
      'Aucune décision de certification n’est encore enregistrée.',
    recordCertificationDecision: 'Enregistrer la décision de certification',
    certificationDecisionHelp:
      'Un approbateur qui ne fait pas partie de l’équipe d’audit enregistre la décision de l’organisme de certification. Jusqu’à l’enregistrement du certificat, une correction motivée peut modifier ses textes et ses références, jamais son résultat. Rien n’est présélectionné. Un octroi indique le texte du certificat accordé pour chaque langue du certificat.',
    decisionOutcome: 'Décision',
    decisionGranted: 'Certification accordée',
    decisionRefused: 'Certification refusée',
    grantedTexts: 'Textes du certificat accordés',
    certificateTextsAgreed: 'Textes du certificat convenus',
    certificateTextHeading: 'Texte du certificat {position}',
    certificateLanguage: 'Langue',
    certificateLanguageHelp:
      'Le code de langue de ce texte du certificat, par exemple ro ou en ; chaque langue une seule fois.',
    certificateHolderName: 'Nom du titulaire',
    certificateAddress: 'Adresse',
    certificateScope: 'Périmètre',
    addCertificateLanguage: 'Ajouter une langue du certificat',
    removeCertificateText: 'Retirer le texte du certificat {position}',
    decidedOn: 'Date de la décision',
    decidedBy: 'Décideur',
    decidedByFunction: 'Fonction du décideur',
    decisionForm: 'Formulaire de décision signé',
    decisionFormNone: 'Aucun formulaire de décision signé',
    decisionRationale: 'Justification',
    decisionAdditionalInformation: 'Informations complémentaires utilisées',
    decisionIndependenceAttestation:
      'J’atteste que le décideur n’est pas membre de l’équipe d’audit.',
    decisionIndependenceLabel: 'Indépendance',
    decisionIndependenceAttested:
      'Attestée : le décideur n’est pas membre de l’équipe d’audit.',
    certificationDecisionSubmit: 'Enregistrer la décision',
    certificationDecisionValidation:
      'Complétez la décision : choisissez l’issue et indiquez la date de la décision, le décideur et sa fonction (200 caractères au plus chacun) et la justification (4 000 caractères au plus). Un octroi indique un à quatre textes du certificat, un par langue, chacun avec le nom du titulaire, l’adresse et le périmètre.',
    decisionAttestationRequired:
      'Confirmez que le décideur n’est pas membre de l’équipe d’audit.',
    decisionPreconditionsTitle:
      'La décision de certification ne peut pas être enregistrée tant que ces conditions préalables ne sont pas réunies :',
    decisionPreconditionsList: 'Conditions préalables non réunies',
    decisionPreconditionsRefused:
      'Le serveur a refusé la décision : ces conditions préalables ne sont pas réunies.',
    decisionPreconditionsUnknown:
      'Le serveur a refusé la décision car une condition préalable n’est pas réunie. Rechargez le dossier et vérifiez chaque étape.',
    preconditionApplicationNotAccepted:
      'La revue de la demande n’a pas accepté la demande.',
    preconditionDurationMissing: 'Aucune durée d’audit n’est confirmée.',
    preconditionAgreementMissing:
      'Aucun contrat de certification n’est enregistré.',
    preconditionTeamNotApproved:
      'La dernière version de l’équipe d’audit n’est pas approuvée.',
    preconditionStage1NotReady:
      'Aucun rapport de l’étape 1 ne conclut que le client est prêt.',
    preconditionStage2NotReported:
      'Le rapport de l’étape 2 n’est pas enregistré.',
    preconditionFindingsOpen:
      'Une non-conformité retient encore le dossier : elle doit être vérifiée efficace, ou son plan jugé adéquat pour une non-conformité mineure de l’étape 2.',
    preconditionFindingsOverdue:
      'Une non-conformité a dépassé sa limite de six mois.',
    preconditionRecommendationMissing:
      'Aucune recommandation de l’équipe n’est enregistrée.',
    preconditionGrantAgainstRecommendation:
      'La certification ne peut pas être accordée contre une recommandation de l’équipe qui n’est pas d’accorder.',
    preconditionDossierReviewIncomplete:
      'La revue du dossier n’est pas enregistrée, ou elle indique un élément manquant.',
    preconditionDecisionInFuture: 'La date de la décision est dans le futur.',
    decisionMakerIndependence:
      'Le décideur ne peut pas être membre de l’équipe d’audit : vous êtes lié à un membre de l’une de ses versions, ou le décideur indiqué fait partie de l’équipe approuvée.',
    certificationDecisionAwaitingApprover:
      'Un approbateur qui ne fait pas partie de l’équipe d’audit enregistre la décision de certification.',
    certificationDecisionIndependence:
      'Vous ne pouvez pas enregistrer la décision de certification : vous êtes lié à un membre de l’équipe d’audit. Un approbateur qui ne fait pas partie de l’équipe décide.',
    decisionFormRole:
      'Le formulaire de décision signé doit être un PDF de ce dossier joint comme formulaire de décision. Rechargez le dossier et choisissez à nouveau.',
    certificateDataTitle: 'Données du certificat convenues avec le client',
    certificateDataMissing:
      'Aucune donnée du certificat n’est encore convenue.',
    recordCertificateData: 'Enregistrer les données du certificat',
    correctCertificateData: 'Corriger les données du certificat',
    certificateDataHelp:
      'Un responsable de programme enregistre, pour chaque langue du certificat, le nom du titulaire, l’adresse et le périmètre convenus avec le client, avec le formulaire signé. Le certificat est enregistré une fois qu’ils indiquent exactement ce que la décision accorde.',
    certificateDataAgreedOn: 'Convenu le',
    certificateDataDocument: 'Formulaire signé des données du certificat',
    selectCertificateDataDocument: 'Sélectionnez le formulaire signé',
    certificateDataSubmit: 'Enregistrer les données du certificat',
    certificateDataValidation:
      'Complétez les données du certificat : un à quatre textes, un par langue, chacun avec la langue (10 caractères au plus), le nom du titulaire (300 au plus), l’adresse (500 au plus) et le périmètre (2 000 au plus) ; la date convenue et le formulaire signé.',
    certificateDataNoDocument:
      'Joignez d’abord à ce dossier le formulaire signé des données du certificat avec le rôle « Formulaire des données du certificat ».',
    certificateDataAwaitingManager:
      'Un responsable de programme enregistre les données du certificat convenues avec le client.',
    certificateDataDocumentRole:
      'Le formulaire signé doit être un PDF de ce dossier joint comme formulaire des données du certificat. Rechargez le dossier et choisissez à nouveau.',
    blockedCertificateDataBeforeStage2:
      'Les données du certificat sont convenues après le rapport de l’étape 2. Rechargez le dossier.',
    certificateTextsDiffer:
      'Les données du certificat convenues diffèrent de ce que la décision accorde :',
    certificateDifferencesList: 'Écarts par rapport à la décision',
    differenceNotAgreed:
      '{language} : accordé par la décision, absent des données convenues.',
    differenceNotGranted:
      '{language} : présent dans les données convenues, non accordé par la décision.',
    differenceField:
      '{language} — {field} : accordé « {granted} », convenu « {agreed} ».',
    certificateTitle: 'Certificat',
    certificateMissing: 'Aucun certificat n’est encore enregistré.',
    recordCertificate: 'Enregistrer le certificat émis',
    certificateHelp:
      'Un approbateur qui ne fait pas partie de l’équipe d’audit enregistre une seule fois le certificat émis : son numéro, unique dans la Société, le PDF exact du certificat et son signataire. Le serveur calcule la validité à partir de la date de la décision.',
    certificateNumber: 'Numéro du certificat',
    certificatePdf: 'PDF du certificat',
    selectCertificatePdf: 'Sélectionnez le PDF du certificat',
    certificateSignedBy: 'Signé par',
    certificateSignedByFunction: 'Fonction du signataire',
    certificateIndependenceAttestation:
      'J’atteste que le signataire n’est pas membre de l’équipe d’audit.',
    certificateSubmit: 'Enregistrer le certificat',
    certificateValidation:
      'Complétez le certificat : son numéro (64 caractères au plus) et le PDF du certificat de ce dossier ; le signataire et la fonction prennent 200 caractères au plus chacun.',
    certificateAttestationRequired:
      'Confirmez que le signataire n’est pas membre de l’équipe d’audit.',
    certificateNoPdf:
      'Joignez d’abord à ce dossier le PDF du certificat émis avec le rôle « Certificat ».',
    certificateAwaitingApprover:
      'Un approbateur qui ne fait pas partie de l’équipe d’audit enregistre le certificat.',
    certificateApproverIndependence:
      'Vous ne pouvez pas enregistrer le certificat : vous êtes lié à un membre de l’équipe d’audit. Un approbateur qui ne fait pas partie de l’équipe l’enregistre.',
    certificateIndependence:
      'Un membre de l’équipe d’audit ne peut ni enregistrer ni signer le certificat : vous êtes lié à l’un d’eux, ou le signataire indiqué fait partie de l’équipe approuvée.',
    certificateNumberTaken:
      'Ce numéro de certificat est déjà utilisé dans la Société. Vérifiez le numéro du certificat émis.',
    preconditionDiscrepanciesOpen:
      'Une divergence critique ou une erreur non acceptée est ouverte dans la cohérence du dossier.',
    certificateDiscrepanciesOpen:
      'Une divergence critique ou une erreur non acceptée est ouverte : résolvez-la sous « Cohérence du dossier » avant d’enregistrer le certificat. Rechargez le dossier.',
    discrepancyNotOpen:
      'Cette divergence n’est plus ouverte dans le dossier actuel. Rechargez le dossier.',
    discrepancyValidation:
      'Indiquez les champs comparés (200 caractères au plus), le verdict et les deux valeurs (1 000 caractères au plus chacune), chacune sur un document joint à ce dossier ; les emplacements comptent 200 caractères au plus et la note 2 000.',
    discrepancyReasonRequired: 'Indiquez le motif (2 000 caractères au plus).',
    discrepancyCorrectionRequired:
      'Sélectionnez la version d’enregistrement ou de document qui corrige, et indiquez le motif.',
    discrepancyCritical:
      'Une divergence critique ne peut pas être acceptée ; seule une correction des enregistrements la résout.',
    discrepancyCorrectedByRecord:
      'Une divergence levée par une règle se clôt quand une nouvelle version d’enregistrement accorde ses valeurs ; elle ne se clôt pas à la main.',
    discrepancyNotOnTeam:
      'Un auditeur n’enregistre une divergence que dans un dossier dont l’équipe d’audit l’inclut.',
    discrepancyIndependence:
      'Un membre de l’équipe d’audit ne peut pas résoudre cette divergence, ni en enregistrer une comme approbateur.',
    discrepancyCorrectionUnknown:
      'La correction indiquée n’est pas une version d’enregistrement de ce dossier. Rechargez le dossier.',
    discrepancyDocumentUnavailable:
      'Un document sélectionné n’est plus joint à ce dossier. Rechargez le dossier.',
    certificateDataDiffers:
      'Les données du certificat convenues doivent indiquer exactement ce que la décision accorde. Rechargez le dossier et corrigez d’abord les données du certificat.',
    blockedCertificateDataDiffers:
      'Le certificat est enregistré une fois que les données du certificat convenues indiquent exactement ce que la décision accorde. Corrigez d’abord les données du certificat.',
    blockedCertificateNotGranted:
      'Un certificat suit une décision de certification qui l’accorde. Rechargez le dossier.',
    blockedCertificateDataMissing:
      'Le certificat est enregistré une fois les données du certificat convenues avec le client.',
    certificatePdfRole:
      'Le PDF du certificat doit être joint à ce dossier comme certificat. Rechargez le dossier et choisissez à nouveau.',
    certificateValidFrom: 'Valable à partir du',
    certificateValidUntil: 'Valable jusqu’au',
    certificateFirstSurveillanceBy:
      'Début de la première surveillance au plus tard le',
    certificateValidityNote:
      'Calculé par le serveur à partir de la date de la décision : valable trois ans moins un jour ; la première surveillance commence dans les douze mois.',
    certificateTexts: 'Textes du certificat',
    statusRefused: 'Clos — certification refusée',
    statusCertified: 'Certifié',
    caseCertifiedNote:
      'Ce dossier est certifié : son certificat est enregistré. Chaque enregistrement est désormais en lecture seule.',
    caseRefusedNote:
      'Ce dossier est clos : la certification a été refusée. Chaque enregistrement est désormais en lecture seule ; une nouvelle demande exige un nouveau dossier.',
    caseClosedRefusal:
      'Ce dossier est clos. Rechargez-le pour voir son état final.',
    nextDossierReview: 'Revue du dossier',
    nextCertificationDecision: 'Décision de certification',
    nextCertificateData: 'Données du certificat convenues avec le client',
    nextCertificate: 'Certificat',
    stepRecommendation: 'Recommandation de l’équipe',
    stepDossierReview: 'Revue du dossier',
    stepCertificationDecision: 'Décision de certification',
    stepCertificateData: 'Données du certificat',
    stepCertificate: 'Certificat',
    stepRecommended: '{recommendation} — version {version}',
    stepWaitingFollowUp: 'Attend le suivi des non-conformités',
    stepWaitingRecommendation: 'Attend la recommandation de l’équipe',
    stepDossierComplete: 'Complète — version {version}',
    stepDossierIncomplete: 'Élément manquant — version {version}',
    stepWaitingDossierReview: 'Attend la revue du dossier',
    stepWaitingGrant: 'Attend une décision d’octroi',
    stepWaitingCertificateData: 'Attend les données du certificat convenues',
    stepCertificateRecorded: 'Enregistré — {number}',
    timelineRecommendation:
      'Recommandation de l’équipe — {recommendation} (version {version})',
    timelineDossierReview: 'Revue du dossier — version {version}',
    timelineCertificationDecision: 'Décision de certification — {decision}',
    timelineCertificateData: 'Données du certificat — version {version}',
    timelineCertificate: 'Certificat {number} enregistré',
    roleCertificateData: 'Formulaire des données du certificat',
    roleDecisionForm: 'Formulaire de décision',
    blockedVersionCorrectionReason:
      'Une nouvelle version exige un motif, et un premier enregistrement n’en a pas. Rechargez le dossier avant d’enregistrer à nouveau.',
    applicationSubmittedOn: 'Date de la demande signée',
    applicationSubmittedOnHelp:
      'Facultatif : la date inscrite sur la demande signée, lorsque le dossier papier l’indique.',
    actingOnBehalf:
      'Une personne de l’organisme de certification a accompli cet acte ; je l’enregistre en son nom.',
    actingHelp:
      'Vous restez enregistré comme le membre qui l’a saisi. Indiquez la personne qui a agi, sa fonction et la date de l’acte ; un formulaire signé joint au dossier est facultatif.',
    actingName: 'Nom de la personne qui a agi',
    actingFunction: 'Sa fonction',
    actingDate: 'Date de l’acte',
    actingForm: 'Formulaire signé',
    actingFormNone: 'Aucun formulaire signé',
    actingReviewLegend: 'Revue de la demande par l’organisme de certification',
    actingReviewView: 'Revue au nom de l’organisme de certification par',
    actingDurationLegend:
      'Approbation de la durée par l’organisme de certification',
    actingDurationView: 'Approuvée au nom de l’organisme de certification par',
    actingTeamDecisionLegend:
      'Décision sur l’équipe par l’organisme de certification',
    actingTeamDecisionView:
      'Décidée au nom de l’organisme de certification par',
    actingReportApprovalLegend:
      'Approbation du rapport par l’organisme de certification',
    actingReportApprovalView:
      'Rapport approuvé au nom de l’organisme de certification par',
    actingValidation:
      'Complétez l’acte enregistré au nom de l’organisme de certification : le nom et la fonction de la personne qui a agi (200 caractères au plus chacun) et la date de l’acte. Le formulaire signé, s’il est choisi, doit être joint à ce dossier.',
    actingOnTeam:
      'La personne indiquée comme agissant pour l’organisme de certification fait partie de l’équipe d’audit. Un membre de l’équipe d’audit ne peut pas accomplir cet acte ; vérifiez le nom.',
    actInFuture:
      'L’acte au nom de l’organisme de certification ne peut pas être daté après aujourd’hui. Vérifiez la date de l’acte.',
    independenceLabel: 'Indépendance vis-à-vis de l’équipe d’audit',
    independenceAttested: 'Attestée par le membre qui l’a enregistrée',
    independenceUnattested:
      'Non attestée : enregistrée avant que l’attestation soit conservée',
    teamDecisionAttestation:
      'J’atteste que la personne qui décide sur cette équipe n’est pas membre de l’équipe d’audit.',
    teamDecisionAttestationRequired:
      'Confirmez que la personne qui décide sur l’équipe n’est pas membre de l’équipe d’audit.',
    dossierReviewerLegend:
      'Examinateur du dossier pour l’organisme de certification',
    dossierApproverLegend: 'Approbateur pour l’organisme de certification',
    dossierReviewerView:
      'Dossier examiné au nom de l’organisme de certification par',
    dossierApproverView: 'Approuvé au nom de l’organisme de certification par',
    dossierAttestation:
      'J’atteste que l’examinateur du dossier et l’approbateur ne sont pas membres de l’équipe d’audit.',
    dossierAttestationRequired:
      'Confirmez que l’examinateur du dossier et l’approbateur ne sont pas membres de l’équipe d’audit.',
    declarationConfirmed: 'Confirmée',
    declarationConflict: 'Conflit',
    declarationToVerify: 'À vérifier',
    declarationsToVerify: 'Déclaration à vérifier',
    impartialityAnalysis: 'Analyse d’impartialité',
    impartialityAnalysisHelp:
      'Facultatif : documentez comment l’impartialité de l’équipe a été analysée, avec des preuves jointes au dossier.',
    impartialityAnalysisRequiredHelp:
      'Obligatoire : la demande déclare un consultant ({consultant}). Documentez comment les liens entre le consultant et l’équipe ont été analysés, avec des preuves jointes au dossier.',
    impartialityAnalysisNote: 'Analyse',
    impartialityAnalysisEvidence: 'Preuves jointes au dossier',
    impartialityAnalysisNone: 'Non documentée',
    teamAnalysisRequired:
      'Rédigez l’analyse d’impartialité (4 000 caractères au plus, dix pièces jointes de ce dossier au plus). Elle est obligatoire lorsque la demande déclare un consultant ou lorsque des preuves sont choisies.',
    recommendedOn: 'Date de la recommandation',
    correctDecisionTexts: 'Corriger les textes de la décision',
    decisionCorrectionHelp:
      'Une correction enregistre une nouvelle version de la décision avec son motif. Le résultat décidé reste celui enregistré ; seuls les textes et les références changent, et chaque condition préalable est de nouveau vérifiée.',
    decisionOutcomeFixed:
      'Décision : {outcome}. Une correction conserve le résultat décidé.',
    decisionOutcomeFixedRefusal:
      'Une correction conserve le résultat décidé ; seuls ses textes et ses références changent. Rechargez le dossier.',
    decisionEarlierVersions: 'Versions antérieures de la décision ({count})',
    timelineCertificationDecisionVersion:
      'Décision de certification — {decision} (version {version})',
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
    auditorBundle: 'Auditor de certificare al companiei',
    auditorPrerequisites:
      'Un auditor de certificare acționează doar dacă deține și dreptul de cititor de certificare în aceeași Companie. Doar auditorul legat de șeful echipei de audit aprobate înregistrează rapoartele etapelor.',
    auditorGranted: 'a acordat dreptul de auditor de certificare',
    auditorRevoked: 'a revocat dreptul de auditor de certificare',

    title: 'Certificare',
    introduction:
      'Dosarele de certificare ale acestui Proiect: cererea clientului, analiza ei, durata auditului, originalele semnate atașate, contractul de certificare, echipa de audit cu aprobarea ei, auditurile de etapa 1 și 2 cu planurile, rapoartele și constatările lor, recomandarea echipei, analiza dosarului, decizia de certificare și certificatul, cu fiecare versiune înregistrată.',
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
    nextStage1Report: 'Raportul auditului de etapa 1',
    nextStage2Plan: 'Planul auditului de etapa 2',
    nextStage2Report: 'Raportul auditului de etapa 2',
    nextRecommendation: 'Recomandarea echipei',
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
    stepStage1: 'Auditul de etapa 1',
    stepStage2: 'Auditul de etapa 2',
    stepWaitingTeamApproval: 'Așteaptă echipa aprobată',
    stepWaitingStage1Ready:
      'Așteaptă un raport al etapei 1 care concluzionează că clientul este pregătit',
    stepPlanned: 'Planificat — versiunea {version}',
    stepStageReady: 'Pregătit — raportul versiunea {version}',
    stepStageNotReady: 'Nepregătit — raportul versiunea {version}',
    stepReported: 'Raportat — versiunea {version}',

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
    blockedApplicationDecided:
      'Cererea nu mai poate fi corectată: decizia de certificare este înregistrată.',
    blockedAlreadyReviewed:
      'Această cerere a fost deja analizată. Reîncărcați dosarul.',
    blockedClosed:
      'Acest dosar este închis: cererea a fost respinsă. Nu se mai poate înregistra nicio etapă; o cerere nouă necesită un dosar nou.',
    blockedCorrectionReason:
      'O corectare necesită un motiv, iar prima cerere nu are. Reîncărcați dosarul înainte de o nouă salvare.',
    blockedCorrectionUnchanged:
      'Corectarea nu schimbă nicio valoare. Modificați cel puțin o valoare sau anulați corectarea.',

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
    registerPdfTitle: 'Registrul dosarului în PDF',
    registerPdfHelp:
      'PDF generat care enumeră fiecare versiune de etapă și fiecare versiune de document referită în acest dosar, în limba interfeței. Nu este un formular oficial al organismului de certificare și nu înlocuiește niciun original semnat.',
    registerPdfDownload: 'Descărcați registrul dosarului (PDF)',
    registerPdfDownloading: 'Se generează registrul dosarului…',
    registerPdfFailed:
      'Registrul dosarului nu a putut fi descărcat. Reîncercați.',
    registerPdfUnavailable:
      'Registrul acestui dosar nu este disponibil. Reîncărcați dosarul.',
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
    conflictNote: 'Conflict sau punct de verificat',
    conflictNoteHelp:
      'Obligatorie, deoarece o declarație este un conflict sau rămâne de verificat: descrieți conflictul sau ce rămâne de verificat. Echipa poate fi propusă, dar este aprobată doar după ce fiecare declarație este confirmată.',
    conflictDeclared: 'Conflict declarat',
    addTeamMember: 'Adăugați un membru',
    removeTeamMember: 'Eliminați membrul {number}',
    proposeTeam: 'Propuneți echipa',
    correctTeam: 'Propuneți o nouă versiune a echipei',
    teamCorrectionHelp:
      'O nouă versiune înlocuiește propunerea curentă, își declară motivul și necesită o nouă decizie a unui aprobator. Versiunile anterioare rămân în cronologie.',
    teamValidation:
      'Completați fiecare membru: un nume (cel mult 200 de caractere), un rol, o notă de competență (cel mult 1.000 de caractere) și un răspuns la fiecare declarație. O echipă are între unu și zece membri.',
    teamConflictNoteRequired:
      'Descrieți conflictul sau ce rămâne de verificat (cel mult 1.000 de caractere) pentru fiecare membru cu o declarație neconfirmată.',
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
      'O declarație a acestei echipe nu este confirmată (un conflict sau un punct de verificat), deci echipa nu poate fi aprobată. Returnați-o cu un motiv; poate fi aprobată când o nouă versiune confirmă fiecare declarație.',
    teamConflictDeclared:
      'O echipă cu o declarație neconfirmată nu poate fi aprobată. Returnați-o cu un motiv.',
    teamIndependence:
      'Nu puteți decide asupra acestei echipe: sunteți legat de un membru al uneia dintre versiunile ei. Trebuie să decidă un aprobator care nu face parte din echipă.',
    teamMemberDecided:
      'O persoană care a aprobat această echipă, a aprobat un raport de etapă, a analizat dosarul sau a înregistrat decizia, direct sau în numele organismului de certificare, nu poate face parte din echipă. Eliminați această persoană sau această legătură, reîncărcați dosarul și propuneți din nou.',
    blockedTeamNotPending:
      'Nicio echipă propusă nu mai așteaptă o decizie. Reîncărcați dosarul.',

    nextRecommendationPending:
      'Ambele etape au rapoarte și nicio neconformitate nu reține dosarul. Șeful echipei de audit aprobate înregistrează recomandarea echipei.',
    stage1Title: 'Auditul de etapa 1',
    stage2Title: 'Auditul de etapa 2',
    stagePlanTitle: 'Plan de audit',
    stageReportTitle: 'Raport de audit',
    stagePlanMissing:
      'Niciun plan nu este încă înregistrat pentru această etapă.',
    stageReportMissing:
      'Niciun raport nu este încă înregistrat pentru această etapă.',
    stageStartDate: 'Data de început',
    stageEndDate: 'Data de sfârșit',
    stageOnSiteDays: 'Zile-auditor pe amplasament',
    stageRemoteDays: 'Zile-auditor la distanță',
    stageOnSiteDaysHelp:
      'Durata confirmată pe amplasament pentru această etapă, în zile-auditor: {days}. Alt număr de zile pe amplasament necesită o notă care explică abaterea.',
    stageDaysFormatHelp: 'Cel mult două zecimale, cu punct, de exemplu 0.5.',
    stageObjectives: 'Obiective',
    stageScope: 'Domeniul auditului',
    stagePlanDocument: 'PDF-ul planului de audit',
    selectStagePlanDocument: 'Selectați planul de audit atașat',
    stageSentToClientOn: 'Trimis clientului la',
    stageSentToClientOnHelp:
      'Lăsați gol cât timp planul nu a fost trimis clientului.',
    stageNotSent: 'Netrimis încă',
    stageDeviationNote: 'Abaterea de la durata confirmată',
    stageDeviationNoteHelp:
      'Obligatoriu, deoarece zilele pe amplasament diferă de durata confirmată.',
    stageNoDeviation: 'Nicio abatere declarată',
    stageReportDate: 'Data raportului',
    stageDocumentReview: 'Analiza documentației',
    stageDocumentReviewCompleted: 'Finalizată',
    stageDocumentReviewConfirm: 'Analiza documentației este finalizată',
    stageConclusion: 'Pregătirea pentru etapa 2',
    stageConclusionReady: 'Pregătit pentru etapa 2',
    stageConclusionNotReady: 'Nepregătit pentru etapa 2',
    stageConclusionNote: 'Temeiul concluziei',
    stageSummary: 'Sinteza auditului de etapa 2',
    stageReportDocument: 'PDF-ul raportului de audit',
    selectStageReportDocument: 'Selectați raportul de audit atașat',
    stageParticipantList: 'PDF-ul listei participanților',
    stageNoParticipantList: 'Fără listă a participanților',
    stageAnnex: 'PDF-ul anexei',
    stageNoAnnex: 'Fără anexă',
    stageNoAttachment: 'Niciun document atașat',
    recordStage1Plan: 'Înregistrați planul etapei 1',
    correctStage1Plan: 'Corectați planul etapei 1',
    recordStage2Plan: 'Înregistrați planul etapei 2',
    correctStage2Plan: 'Corectați planul etapei 2',
    recordStage1Report: 'Înregistrați raportul etapei 1',
    correctStage1Report: 'Corectați raportul etapei 1',
    recordStage2Report: 'Înregistrați raportul etapei 2',
    correctStage2Report: 'Corectați raportul etapei 2',
    stagePlanHelp:
      'Planificați această etapă: datele, zilele-auditor pe amplasament și la distanță, obiectivele și domeniul, precum și PDF-ul planului atașat cu data trimiterii lui către client.',
    stage1ReportHelp:
      'Înregistrați concluzia etapei 1: analiza documentației finalizată, dacă clientul este pregătit pentru etapa 2 și pe ce temei, cu raportul și lista participanților atașate.',
    stage2ReportHelp:
      'Înregistrați finalizarea auditului de etapa 2 cu raportul atașat, lista participanților și o anexă opțională.',
    stageNoPlanDocument:
      'Niciun document nu este încă atașat cu rolul Plan de audit. Atașați mai întâi PDF-ul planului în registrul documentelor.',
    stageNoReportDocument:
      'Niciun document nu este încă atașat cu rolul Raport de audit. Atașați mai întâi PDF-ul raportului în registrul documentelor.',
    stagePlanValidation:
      'Completați planul: datele de început și de sfârșit, zilele-auditor pe amplasament peste zero și zilele-auditor la distanță cu cel mult două zecimale, obiectivele și domeniul (cel mult 2.000 de caractere fiecare) și planul de audit atașat. Data trimiterii către client este opțională.',
    stageDatesRule:
      'O etapă se încheie la data de început sau după aceasta. Verificați datele.',
    stageDeviationNoteRequired:
      'Zilele pe amplasament diferă de durata confirmată: explicați abaterea (cel mult 2.000 de caractere).',
    stageDeviationNoteRule:
      'Zilele pe amplasament și nota privind abaterea nu mai corespund duratei confirmate. Reîncărcați dosarul și verificați-le.',
    stage2StartRule:
      'Etapa 2 începe după data raportului etapei 1. Alegeți o dată de început ulterioară.',
    stage1ReportValidation:
      'Completați raportul: data raportului, concluzia și temeiul ei (cel mult 4.000 de caractere) și raportul de audit atașat. Lista participanților este opțională.',
    stage2ReportValidation:
      'Completați raportul: data raportului, sinteza (cel mult 4.000 de caractere) și raportul de audit atașat. Lista participanților și anexa sunt opționale.',
    stageDocumentReviewRequired:
      'Etapa 1 include analiza documentației: confirmați că este finalizată înainte de a înregistra raportul.',
    stageReportDateRule:
      'Un raport este datat la începutul etapei sale sau după acesta. Verificați data raportului.',
    stageAttachmentRole:
      'Un PDF ales nu este atașat cu rolul așteptat. Reîncărcați dosarul și alegeți din nou.',
    blockedStagePlanTeamNotApproved:
      'Auditul se planifică după aprobarea ultimei versiuni a echipei de audit.',
    blockedStage2BeforeStage1Report:
      'Etapa 2 se planifică după un raport al etapei 1 care concluzionează că clientul este pregătit.',
    blockedStage2NotReady:
      'Raportul etapei 1 concluzionează că clientul nu este pregătit. Etapa 2 poate fi planificată după ce un raport corectat al etapei 1 concluzionează că clientul este pregătit.',
    blockedStageReportBeforePlan:
      'Raportul se înregistrează după planificarea acestei etape.',
    blockedStageReportTeamNotApproved:
      'Șeful echipei de audit aprobate înregistrează rapoartele; ultima versiune a echipei nu este aprobată.',
    blockedNotTeamLeader:
      'Doar șeful echipei de audit aprobate înregistrează acest raport. Nu sunteți legat de acel șef de echipă.',
    stageReportAwaitingLeader:
      'Șeful echipei de audit aprobate înregistrează acest raport, deținând dreptul de auditor de certificare.',
    stagePlanAwaitingManager: 'Un manager de program planifică această etapă.',
    blockedStagePlanCorrectionReason:
      'O nouă versiune a planului necesită un motiv, iar primul plan nu are. Reîncărcați dosarul înainte de o nouă salvare.',
    blockedStageReportCorrectionReason:
      'O nouă versiune a raportului necesită un motiv, iar primul raport nu are. Reîncărcați dosarul înainte de o nouă salvare.',

    nextFindingsFollowUp: 'Urmărirea neconformităților',
    nextFindingsFollowUpPending:
      'Ambele etape au rapoarte. Înainte de recomandarea echipei, fiecare neconformitate majoră și fiecare neconformitate din etapa 1 este verificată ca eficace, iar fiecare altă neconformitate minoră are un plan apreciat ca adecvat.',
    stepFindings: 'Urmărirea neconformităților',
    stepWaitingStage2Report: 'Așteaptă raportul etapei 2',
    stepFindingsOpen: 'Deschisă — {count} de urmărit',
    stepFindingsDone: 'Finalizată',
    blockedStage2NonconformityOpen:
      'Etapa 2 se planifică după ce fiecare neconformitate din etapa 1 este verificată ca eficace. Urmăriți mai întâi neconformitățile deschise din etapa 1.',
    stage1FindingsTitle: 'Constatările etapei 1',
    stage2FindingsTitle: 'Constatările etapei 2',
    findingsHelp:
      'Șeful echipei de audit aprobate înregistrează fiecare constatare cu cerința, procesul sau zona, enunțul, clasificarea și dovezile exacte, apoi urmărește fiecare neconformitate. Un aprobator care nu face parte din echipă poate reclasifica o constatare cu un motiv. Fiecare versiune rămâne în istoric.',
    findingsEmpty:
      'Nicio constatare nu este înregistrată pentru această etapă.',
    findingHeading: 'Constatarea {sequence} — {classification}',
    findingClassification: 'Clasificare',
    classificationMajor: 'Neconformitate majoră',
    classificationMinor: 'Neconformitate minoră',
    classificationOpportunity: 'Oportunitate de îmbunătățire',
    classificationAreaOfConcern: 'Zonă de atenție',
    findingClause: 'Cerința (clauza)',
    findingArea: 'Procesul sau zona',
    findingStatement: 'Enunț',
    findingEvidence: 'Dovezi',
    findingNoEvidence: 'Nicio dovadă citată',
    findingNotStated: 'Neindicat',
    findingStatus: 'Urmărire',
    statusNoActionRequired: 'Nu necesită urmărire',
    statusAwaitingResponse: 'Așteaptă răspunsul clientului',
    statusAwaitingPlanJudgment: 'Plan de apreciat',
    statusPlanInadequate: 'Plan neadecvat — se așteaptă un răspuns nou',
    statusPlanAdequate: 'Plan adecvat — implementare de verificat',
    statusVerifiedEffective: 'Verificată ca eficace',
    statusVerifiedNotEffective: 'Neeficace — se așteaptă un răspuns nou',
    findingResponseDueOn: 'Răspuns așteptat până la',
    findingLimitOn: 'Termenul de șase luni',
    findingOverdue: 'Depășit',
    findingOverdueNote:
      'Termenul de șase luni a trecut fără o verificare a eliminării neconformității.',
    findingHoldsVerification:
      'Blochează etapa următoare până la verificarea ca eficace.',
    findingHoldsPlan:
      'Blochează etapa următoare până când planul este apreciat ca adecvat.',
    findingHistory: 'Istoricul constatării {sequence}',
    findingRecordStatement: 'Enunț — versiunea {version}',
    findingRecordClassification:
      'Clasificare — {classification}, {by} (versiunea {version})',
    classifiedByTeamLeader: 'de șeful echipei',
    classifiedByApprover: 'de aprobator',
    findingRecordResponse: 'Răspunsul clientului — versiunea {version}',
    findingRecordPlanJudgment:
      'Aprecierea planului — {outcome} (versiunea {version})',
    findingRecordVerification: 'Verificare — {outcome} (versiunea {version})',
    responseCorrection: 'Corecție',
    responseCause: 'Cauză',
    responseCorrectiveAction: 'Acțiune corectivă',
    responseReceivedOn: 'Primit la',
    responsePlannedCompletionOn: 'Finalizare planificată',
    responseNoPlannedCompletion: 'Neindicată',
    planOutcome: 'Adecvarea planului',
    planAdequate: 'Adecvat',
    planInadequate: 'Neadecvat',
    planNote: 'Temeiul aprecierii',
    verificationVerifiedOn: 'Verificată la',
    verificationMethod: 'Metoda de verificare',
    methodDocumentReview: 'Analiză documentară',
    methodOnSite: 'La fața locului',
    verificationOutcome: 'Eficacitate',
    outcomeEffective: 'Eficace',
    outcomeNotEffective: 'Neeficace',
    verificationNote: 'Nota verificării',
    recordStage1Finding: 'Înregistrați o constatare a etapei 1',
    recordStage2Finding: 'Înregistrați o constatare a etapei 2',
    findingSubmit: 'Înregistrați constatarea',
    recordFindingHelp:
      'Alegeți clasificarea, indicați cerința, procesul sau zona și enunțul și citați dovezile exacte atașate acestui dosar. O neconformitate citează cel puțin un PDF de dovadă; o oportunitate de îmbunătățire poate omite cerința și zona.',
    findingClauseHelp:
      'De exemplu 8.5.1. Opțional doar pentru o oportunitate de îmbunătățire.',
    findingEvidenceHelp:
      'PDF-uri atașate acestui dosar cu rolul Dovadă, cel mult zece.',
    findingNoEvidenceDocument:
      'Niciun document nu este încă atașat cu rolul Dovadă. Atașați mai întâi PDF-urile de dovadă în registrul documentelor: o neconformitate citează cel puțin unul.',
    correctFinding: 'Corectați enunțul constatării {sequence}',
    changeClassification: 'Schimbați clasificarea constatării {sequence}',
    reclassifyFinding: 'Reclasificați constatarea {sequence}',
    classificationChangeHelp:
      'Ca șef de echipă, alegeți clasificarea nouă și indicați motivul. Clasificarea anterioară rămâne în istoric.',
    reclassificationHelp:
      'Ca aprobator care nu face parte din echipa de audit, alegeți clasificarea nouă și indicați motivul. Clasificarea anterioară rămâne în istoric.',
    classificationNew: 'Clasificarea nouă',
    classificationReason: 'Motivul clasificării noi',
    classificationSubmit: 'Înregistrați clasificarea',
    recordResponse:
      'Înregistrați răspunsul clientului la constatarea {sequence}',
    responseHelp:
      'Înregistrați corecția, analiza cauzelor și planul de acțiuni corective ale clientului așa cum au fost primite, cu dovezi opționale. Un răspuns nou după un plan apreciat ca neadecvat este o versiune nouă.',
    responseSubmit: 'Înregistrați răspunsul',
    judgePlan: 'Apreciați planul constatării {sequence}',
    judgePlanHelp:
      'Apreciați dacă ultimul răspuns este adecvat pentru eliminarea neconformității și pe ce temei.',
    judgmentSubmit: 'Înregistrați aprecierea',
    verifyFinding: 'Verificați implementarea constatării {sequence}',
    verifyHelp:
      'Înregistrați când și cum a fost verificată implementarea, dacă este eficace și dovezi opționale.',
    verificationSubmit: 'Înregistrați verificarea',
    findingValidation:
      'Completați constatarea: alegeți o clasificare și scrieți enunțul (cel mult 4 000 de caractere). Cerința are cel mult 40 de caractere, iar procesul sau zona cel mult 300; citați cel mult zece PDF-uri de dovadă ale acestui dosar.',
    findingStatementValidation:
      'Scrieți enunțul (cel mult 4 000 de caractere). Cerința are cel mult 40 de caractere, iar procesul sau zona cel mult 300; citați cel mult zece PDF-uri de dovadă ale acestui dosar.',
    findingClauseRequired:
      'Indicați cerința și procesul sau zona. Doar o oportunitate de îmbunătățire le poate omite.',
    findingClassificationStage:
      'O zonă de atenție se înregistrează doar în etapa 1. Alegeți altă clasificare.',
    findingEvidenceRequired:
      'O neconformitate citează cel puțin un PDF de dovadă exact atașat acestui dosar.',
    classificationValidation:
      'Alegeți clasificarea nouă și indicați motivul (cel mult 2 000 de caractere).',
    classificationUnchanged:
      'Aceasta este deja clasificarea constatării. Alegeți alta sau anulați.',
    responseValidation:
      'Completați răspunsul: corecția, cauza și acțiunea corectivă (cel mult 4 000 de caractere fiecare) și data primirii. Data de finalizare planificată și dovezile sunt opționale.',
    judgmentValidation:
      'Alegeți dacă planul este adecvat și indicați temeiul aprecierii (cel mult 2 000 de caractere).',
    verificationValidation:
      'Completați verificarea: data, metoda și rezultatul ei și nota (cel mult 2 000 de caractere). Dovezile sunt opționale.',
    blockedFindingTeamNotApproved:
      'Șeful echipei de audit aprobate înregistrează constatările; ultima versiune a echipei nu este aprobată.',
    blockedFindingNotTeamLeader:
      'Doar șeful echipei de audit aprobate înregistrează constatările și urmărirea lor. Nu sunteți legat de acel șef de echipă.',
    blockedFindingStageClosed:
      'Constatările etapei 1 se înregistrează înainte de planificarea etapei 2.',
    blockedFindingStageNotPlanned:
      'Constatările se înregistrează după ce această etapă este planificată. Reîncărcați dosarul.',
    findingNotOpen:
      'Doar o neconformitate deschisă primește un răspuns. Reîncărcați dosarul.',
    findingNoResponse:
      'Planul se apreciază după ce răspunsul clientului este înregistrat. Reîncărcați dosarul.',
    findingPlanNotAdequate:
      'Implementarea se verifică după ce planul este apreciat ca adecvat. Reîncărcați dosarul.',
    findingLimitPassed:
      'Termenul de șase luni al acestei neconformități a fost depășit fără o verificare eficace: acest parcurs de certificare nu poate continua. O etapă repetată sau un audit suplimentar nu fac parte din această versiune.',
    findingIndependence:
      'Nu puteți reclasifica constatări: sunteți legat de un membru al echipei de audit. Reclasifică un aprobator care nu face parte din echipă.',
    findingEvidenceUnavailable:
      'Un PDF de dovadă citat nu este atașat acestui dosar. Reîncărcați dosarul și alegeți din nou.',
    blockedFindingCorrectionReason:
      'Această schimbare necesită un motiv, iar o constatare nouă nu are. Reîncărcați dosarul înainte de a salva din nou.',
    timelineFindingRecorded:
      'Constatarea {sequence} înregistrată — {classification} ({stage})',
    timelineFindingCorrected:
      'Constatarea {sequence} — enunț corectat (versiunea {version})',
    timelineFindingReclassified:
      'Constatarea {sequence} reclasificată — {classification}, {by} (versiunea {version})',
    timelineNonconformityResponse:
      'Constatarea {sequence} — răspunsul clientului înregistrat (versiunea {version})',
    timelineNonconformityPlanJudged:
      'Constatarea {sequence} — plan apreciat: {outcome} (versiunea {version})',
    timelineNonconformityVerified:
      'Constatarea {sequence} — verificare: {outcome} (versiunea {version})',
    findingStage1: 'etapa 1',
    findingStage2: 'etapa 2',

    timelineTitle: 'Cronologie',
    timelineEmpty: 'Nicio etapă înregistrată încă.',
    timelineApplication: 'Cerere — versiunea {version}',
    timelineReview: 'Analiza cererii — {outcome}',
    timelineDuration: 'Durata auditului — versiunea {version}',
    timelineAgreement: 'Contractul de certificare — versiunea {version}',
    timelineTeam: 'Echipa de audit — versiunea {version}',
    timelineTeamDecision:
      'Decizia privind echipa — {decision} (versiunea {version} a echipei)',
    timelineStage1Plan: 'Planul etapei 1 — versiunea {version}',
    timelineStage1Report:
      'Raportul etapei 1 — {conclusion} (versiunea {version})',
    timelineStage2Plan: 'Planul etapei 2 — versiunea {version}',
    timelineStage2Report: 'Raportul etapei 2 — versiunea {version}',
    showValues: 'Afișați valorile înregistrate',
    recommendationTitle: 'Recomandarea echipei',
    recommendationMissing:
      'Nicio recomandare a echipei nu este încă înregistrată.',
    recordRecommendation: 'Înregistrați recomandarea echipei',
    correctRecommendation: 'Corectați recomandarea echipei',
    recommendationHelp:
      'Șeful echipei de audit aprobate recomandă acordarea certificării, neacordarea ei sau un audit suplimentar și indică temeiul. Nimic nu este preselectat. Un audit suplimentar nu face parte din acest parcurs: cu această recomandare, dosarul poate fi doar refuzat.',
    recommendationOutcome: 'Recomandare',
    recommendationGrant: 'Acordarea certificării',
    recommendationDoNotGrant: 'Neacordarea certificării',
    recommendationAdditionalAudit: 'Este necesar un audit suplimentar',
    recommendationBasis: 'Temeiul recomandării',
    recommendationSubmit: 'Înregistrați recomandarea',
    recommendationValidation:
      'Alegeți o recomandare și indicați temeiul ei (cel mult 4.000 de caractere).',
    recommendationAwaitingLeader:
      'Șeful echipei de audit aprobate înregistrează recomandarea echipei, deținând dreptul de auditor de certificare.',
    blockedRecommendationNotTeamLeader:
      'Doar șeful echipei de audit aprobate înregistrează recomandarea echipei. Nu sunteți legat de acel șef de echipă.',
    blockedRecommendationFindingsOpen:
      'Recomandarea echipei se înregistrează după ce nicio neconformitate nu mai reține dosarul. Reîncărcați dosarul.',
    blockedRecommendationBeforeStage2:
      'Recomandarea echipei se înregistrează după raportul etapei 2. Reîncărcați dosarul.',
    dossierReviewTitle: 'Analiza dosarului',
    dossierReviewMissing:
      'Nicio analiză a dosarului nu este încă înregistrată.',
    recordDossierReview: 'Înregistrați analiza dosarului',
    correctDossierReview: 'Corectați analiza dosarului',
    dossierReviewHelp:
      'Un aprobator care nu face parte din echipa de audit răspunde pentru fiecare element al dosarului: prezent, lipsă sau nu se aplică. Nimic nu este preselectat; un element lipsă necesită o notă. Această analiză este distinctă de registrul documentelor.',
    dossierAnswerPresent: 'Prezent',
    dossierAnswerMissing: 'Lipsă',
    dossierAnswerNotApplicable: 'Nu se aplică',
    dossierItemNote: 'Notă',
    dossierConclusion: 'Concluzia analizei',
    dossierReviewSubmit: 'Înregistrați analiza',
    dossierReviewValidation:
      'Răspundeți pentru fiecare element al dosarului, scrieți o notă pentru fiecare element lipsă (cel mult 1.000 de caractere pe notă) și concluzia (cel mult 4.000 de caractere).',
    dossierReviewResult: 'Rezultat',
    dossierComplete: 'Complet — niciun element lipsă',
    dossierIncomplete: 'Incomplet — elemente lipsă: {count}',
    dossierItemApplication: 'Cerere',
    dossierItemApplicationReview: 'Analiza cererii',
    dossierItemDuration: 'Durata auditului',
    dossierItemAgreement: 'Contract de certificare',
    dossierItemTeamApproval: 'Aprobarea echipei de audit',
    dossierItemStage1Plan: 'Planul de audit al etapei 1',
    dossierItemStage1Report: 'Raportul de audit al etapei 1',
    dossierItemStage2Plan: 'Planul de audit al etapei 2',
    dossierItemStage2Report: 'Raportul de audit al etapei 2',
    dossierItemParticipantLists: 'Listele participanților',
    dossierItemFindingsFollowUp: 'Urmărirea neconformităților',
    dossierItemRecommendation: 'Recomandarea echipei',
    dossierItemCertificateData: 'Datele certificatului convenite cu clientul',
    dossierAwaitingApprover:
      'Un aprobator care nu face parte din echipa de audit analizează dosarul.',
    dossierIndependence:
      'Nu puteți analiza acest dosar: sunteți legat de un membru al echipei de audit. Îl analizează un aprobator care nu face parte din echipă.',
    blockedDossierBeforeRecommendation:
      'Dosarul se analizează după recomandarea echipei. Reîncărcați dosarul.',
    blockedDecided:
      'Decizia de certificare este înregistrată: elementele pe care se bazează (durata, contractul, echipa, etapele, constatările, recomandarea, analiza dosarului) nu se mai modifică; rămân doar datele certificatului și certificatul. Reîncărcați dosarul.',
    certificationDecisionTitle: 'Decizia de certificare',
    certificationDecisionMissing:
      'Nicio decizie de certificare nu este încă înregistrată.',
    recordCertificationDecision: 'Înregistrați decizia de certificare',
    certificationDecisionHelp:
      'Un aprobator care nu face parte din echipa de audit înregistrează decizia organismului de certificare. Până la înregistrarea certificatului, o corecție motivată îi poate schimba textele și referințele, niciodată rezultatul. Nimic nu este preselectat. O acordare indică textul certificatului acordat pentru fiecare limbă a certificatului.',
    decisionOutcome: 'Decizie',
    decisionGranted: 'Certificare acordată',
    decisionRefused: 'Certificare refuzată',
    grantedTexts: 'Textele certificatului acordate',
    certificateTextsAgreed: 'Textele certificatului convenite',
    certificateTextHeading: 'Textul certificatului {position}',
    certificateLanguage: 'Limba',
    certificateLanguageHelp:
      'Codul limbii acestui text al certificatului, de exemplu ro sau en; fiecare limbă o singură dată.',
    certificateHolderName: 'Numele titularului',
    certificateAddress: 'Adresa',
    certificateScope: 'Domeniul',
    addCertificateLanguage: 'Adăugați o limbă a certificatului',
    removeCertificateText: 'Eliminați textul certificatului {position}',
    decidedOn: 'Data deciziei',
    decidedBy: 'Decident',
    decidedByFunction: 'Funcția decidentului',
    decisionForm: 'Formularul de decizie semnat',
    decisionFormNone: 'Niciun formular de decizie semnat',
    decisionRationale: 'Motivare',
    decisionAdditionalInformation: 'Informații suplimentare folosite',
    decisionIndependenceAttestation:
      'Atest că decidentul nu este membru al echipei de audit.',
    decisionIndependenceLabel: 'Independență',
    decisionIndependenceAttested:
      'Atestată: decidentul nu este membru al echipei de audit.',
    certificationDecisionSubmit: 'Înregistrați decizia',
    certificationDecisionValidation:
      'Completați decizia: alegeți rezultatul și indicați data deciziei, decidentul și funcția sa (cel mult 200 de caractere fiecare) și motivarea (cel mult 4.000 de caractere). O acordare indică între unul și patru texte ale certificatului, câte unul pe limbă, fiecare cu numele titularului, adresa și domeniul.',
    decisionAttestationRequired:
      'Confirmați că decidentul nu este membru al echipei de audit.',
    decisionPreconditionsTitle:
      'Decizia de certificare nu poate fi înregistrată până când nu sunt îndeplinite aceste condiții prealabile:',
    decisionPreconditionsList: 'Condiții prealabile neîndeplinite',
    decisionPreconditionsRefused:
      'Serverul a refuzat decizia: aceste condiții prealabile nu sunt îndeplinite.',
    decisionPreconditionsUnknown:
      'Serverul a refuzat decizia deoarece o condiție prealabilă nu este îndeplinită. Reîncărcați dosarul și verificați fiecare etapă.',
    preconditionApplicationNotAccepted:
      'Analiza cererii nu a acceptat cererea.',
    preconditionDurationMissing: 'Nicio durată a auditului nu este confirmată.',
    preconditionAgreementMissing:
      'Niciun contract de certificare nu este înregistrat.',
    preconditionTeamNotApproved:
      'Ultima versiune a echipei de audit nu este aprobată.',
    preconditionStage1NotReady:
      'Niciun raport al etapei 1 nu concluzionează că clientul este pregătit.',
    preconditionStage2NotReported: 'Raportul etapei 2 nu este înregistrat.',
    preconditionFindingsOpen:
      'O neconformitate încă reține dosarul: trebuie verificată ca eficace sau, pentru o neconformitate minoră din etapa 2, planul ei apreciat ca adecvat.',
    preconditionFindingsOverdue:
      'O neconformitate și-a depășit termenul de șase luni.',
    preconditionRecommendationMissing:
      'Nicio recomandare a echipei nu este înregistrată.',
    preconditionGrantAgainstRecommendation:
      'Certificarea nu poate fi acordată împotriva unei recomandări a echipei care nu este de acordare.',
    preconditionDossierReviewIncomplete:
      'Analiza dosarului nu este înregistrată sau indică un element lipsă.',
    preconditionDecisionInFuture: 'Data deciziei este în viitor.',
    decisionMakerIndependence:
      'Decidentul nu poate fi membru al echipei de audit: sunteți legat de un membru al uneia dintre versiunile ei sau decidentul indicat face parte din echipa aprobată.',
    certificationDecisionAwaitingApprover:
      'Un aprobator care nu face parte din echipa de audit înregistrează decizia de certificare.',
    certificationDecisionIndependence:
      'Nu puteți înregistra decizia de certificare: sunteți legat de un membru al echipei de audit. Decide un aprobator care nu face parte din echipă.',
    decisionFormRole:
      'Formularul de decizie semnat trebuie să fie un PDF al acestui dosar atașat ca formular de decizie. Reîncărcați dosarul și alegeți din nou.',
    certificateDataTitle: 'Datele certificatului convenite cu clientul',
    certificateDataMissing:
      'Nicio dată a certificatului nu este încă convenită.',
    recordCertificateData: 'Înregistrați datele certificatului',
    correctCertificateData: 'Corectați datele certificatului',
    certificateDataHelp:
      'Un manager de program înregistrează, pentru fiecare limbă a certificatului, numele titularului, adresa și domeniul convenite cu clientul, împreună cu formularul semnat. Certificatul se înregistrează după ce acestea indică exact ce acordă decizia.',
    certificateDataAgreedOn: 'Convenit la',
    certificateDataDocument: 'Formularul semnat al datelor certificatului',
    selectCertificateDataDocument: 'Selectați formularul semnat',
    certificateDataSubmit: 'Înregistrați datele certificatului',
    certificateDataValidation:
      'Completați datele certificatului: între unul și patru texte, câte unul pe limbă, fiecare cu limba (cel mult 10 caractere), numele titularului (cel mult 300), adresa (cel mult 500) și domeniul (cel mult 2.000); data convenită și formularul semnat.',
    certificateDataNoDocument:
      'Atașați mai întâi la acest dosar formularul semnat al datelor certificatului, cu rolul „Formularul datelor certificatului”.',
    certificateDataAwaitingManager:
      'Un manager de program înregistrează datele certificatului convenite cu clientul.',
    certificateDataDocumentRole:
      'Formularul semnat trebuie să fie un PDF al acestui dosar atașat ca formular al datelor certificatului. Reîncărcați dosarul și alegeți din nou.',
    blockedCertificateDataBeforeStage2:
      'Datele certificatului se convin după raportul etapei 2. Reîncărcați dosarul.',
    certificateTextsDiffer:
      'Datele certificatului convenite diferă de ceea ce acordă decizia:',
    certificateDifferencesList: 'Diferențe față de decizie',
    differenceNotAgreed:
      '{language}: acordat prin decizie, lipsește din datele convenite.',
    differenceNotGranted:
      '{language}: prezent în datele convenite, neacordat prin decizie.',
    differenceField:
      '{language} — {field}: acordat „{granted}”, convenit „{agreed}”.',
    certificateTitle: 'Certificat',
    certificateMissing: 'Niciun certificat nu este încă înregistrat.',
    recordCertificate: 'Înregistrați certificatul emis',
    certificateHelp:
      'Un aprobator care nu face parte din echipa de audit înregistrează o singură dată certificatul emis: numărul lui, unic în Companie, PDF-ul exact al certificatului și semnatarul. Serverul calculează valabilitatea pornind de la data deciziei.',
    certificateNumber: 'Numărul certificatului',
    certificatePdf: 'PDF-ul certificatului',
    selectCertificatePdf: 'Selectați PDF-ul certificatului',
    certificateSignedBy: 'Semnat de',
    certificateSignedByFunction: 'Funcția semnatarului',
    certificateIndependenceAttestation:
      'Atest că semnatarul nu este membru al echipei de audit.',
    certificateSubmit: 'Înregistrați certificatul',
    certificateValidation:
      'Completați certificatul: numărul (cel mult 64 de caractere) și PDF-ul certificatului din acest dosar; semnatarul și funcția au cel mult 200 de caractere fiecare.',
    certificateAttestationRequired:
      'Confirmați că semnatarul nu este membru al echipei de audit.',
    certificateNoPdf:
      'Atașați mai întâi la acest dosar PDF-ul certificatului emis, cu rolul „Certificat”.',
    certificateAwaitingApprover:
      'Un aprobator care nu face parte din echipa de audit înregistrează certificatul.',
    certificateApproverIndependence:
      'Nu puteți înregistra certificatul: sunteți legat de un membru al echipei de audit. Îl înregistrează un aprobator care nu face parte din echipă.',
    certificateIndependence:
      'Un membru al echipei de audit nu poate înregistra și nici semna certificatul: sunteți legat de unul dintre ei sau semnatarul indicat face parte din echipa aprobată.',
    certificateNumberTaken:
      'Acest număr de certificat este deja folosit în Companie. Verificați numărul de pe certificatul emis.',
    preconditionDiscrepanciesOpen:
      'O neconcordanță critică sau o eroare neacceptată este deschisă în coerența dosarului.',
    certificateDiscrepanciesOpen:
      'O neconcordanță critică sau o eroare neacceptată este deschisă: rezolvați-o la „Coerența dosarului” înainte de a înregistra certificatul. Reîncărcați dosarul.',
    discrepancyNotOpen:
      'Această neconcordanță nu mai este deschisă în dosarul actual. Reîncărcați dosarul.',
    discrepancyValidation:
      'Indicați câmpurile comparate (cel mult 200 de caractere), verdictul și ambele valori (cel mult 1 000 de caractere fiecare), fiecare pe un document atașat acestui dosar; locurile au cel mult 200 de caractere, iar nota cel mult 2 000.',
    discrepancyReasonRequired:
      'Indicați motivul (cel mult 2 000 de caractere).',
    discrepancyCorrectionRequired:
      'Selectați versiunea înregistrării sau a documentului care corectează și indicați motivul.',
    discrepancyCritical:
      'O neconcordanță critică nu poate fi acceptată; doar o corectare a înregistrărilor o rezolvă.',
    discrepancyCorrectedByRecord:
      'O neconcordanță semnalată de o regulă se închide când o nouă versiune a înregistrării face valorile să concorde; nu se închide manual.',
    discrepancyNotOnTeam:
      'Un auditor înregistrează o neconcordanță doar într-un dosar a cărui echipă de audit îl include.',
    discrepancyIndependence:
      'Un membru al echipei de audit nu poate rezolva această neconcordanță și nici nu poate înregistra una ca aprobator.',
    discrepancyCorrectionUnknown:
      'Corectarea indicată nu este o versiune a unei înregistrări din acest dosar. Reîncărcați dosarul.',
    discrepancyDocumentUnavailable:
      'Un document selectat nu mai este atașat acestui dosar. Reîncărcați dosarul.',
    certificateDataDiffers:
      'Datele certificatului convenite trebuie să indice exact ce acordă decizia. Reîncărcați dosarul și corectați mai întâi datele certificatului.',
    blockedCertificateDataDiffers:
      'Certificatul se înregistrează după ce datele certificatului convenite indică exact ce acordă decizia. Corectați mai întâi datele certificatului.',
    blockedCertificateNotGranted:
      'Un certificat urmează unei decizii de certificare de acordare. Reîncărcați dosarul.',
    blockedCertificateDataMissing:
      'Certificatul se înregistrează după ce datele certificatului sunt convenite cu clientul.',
    certificatePdfRole:
      'PDF-ul certificatului trebuie atașat la acest dosar ca certificat. Reîncărcați dosarul și alegeți din nou.',
    certificateValidFrom: 'Valabil de la',
    certificateValidUntil: 'Valabil până la',
    certificateFirstSurveillanceBy:
      'Începerea primei supravegheri cel târziu la',
    certificateValidityNote:
      'Calculat de server pornind de la data deciziei: valabil trei ani minus o zi; prima supraveghere începe în cel mult douăsprezece luni.',
    certificateTexts: 'Textele certificatului',
    statusRefused: 'Închis — certificare refuzată',
    statusCertified: 'Certificat',
    caseCertifiedNote:
      'Acest dosar este certificat: certificatul lui este înregistrat. Fiecare înregistrare poate fi acum doar consultată.',
    caseRefusedNote:
      'Acest dosar este închis: certificarea a fost refuzată. Fiecare înregistrare poate fi acum doar consultată; o cerere nouă necesită un dosar nou.',
    caseClosedRefusal:
      'Acest dosar este închis. Reîncărcați-l pentru a vedea starea finală.',
    nextDossierReview: 'Analiza dosarului',
    nextCertificationDecision: 'Decizia de certificare',
    nextCertificateData: 'Datele certificatului convenite cu clientul',
    nextCertificate: 'Certificat',
    stepRecommendation: 'Recomandarea echipei',
    stepDossierReview: 'Analiza dosarului',
    stepCertificationDecision: 'Decizia de certificare',
    stepCertificateData: 'Datele certificatului',
    stepCertificate: 'Certificat',
    stepRecommended: '{recommendation} — versiunea {version}',
    stepWaitingFollowUp: 'Așteaptă urmărirea neconformităților',
    stepWaitingRecommendation: 'Așteaptă recomandarea echipei',
    stepDossierComplete: 'Completă — versiunea {version}',
    stepDossierIncomplete: 'Element lipsă — versiunea {version}',
    stepWaitingDossierReview: 'Așteaptă analiza dosarului',
    stepWaitingGrant: 'Așteaptă o decizie de acordare',
    stepWaitingCertificateData: 'Așteaptă datele certificatului convenite',
    stepCertificateRecorded: 'Înregistrat — {number}',
    timelineRecommendation:
      'Recomandarea echipei — {recommendation} (versiunea {version})',
    timelineDossierReview: 'Analiza dosarului — versiunea {version}',
    timelineCertificationDecision: 'Decizia de certificare — {decision}',
    timelineCertificateData: 'Datele certificatului — versiunea {version}',
    timelineCertificate: 'Certificatul {number} înregistrat',
    roleCertificateData: 'Formularul datelor certificatului',
    roleDecisionForm: 'Formular de decizie',
    blockedVersionCorrectionReason:
      'O nouă versiune necesită un motiv, iar prima înregistrare nu are. Reîncărcați dosarul înainte de o nouă salvare.',
    applicationSubmittedOn: 'Data cererii semnate',
    applicationSubmittedOnHelp:
      'Opțional: data scrisă pe cererea semnată, când dosarul pe hârtie o conține.',
    actingOnBehalf:
      'O persoană a organismului de certificare a efectuat acest act; îl înregistrez în numele ei.',
    actingHelp:
      'Rămâneți înregistrat ca membrul care l-a introdus. Indicați persoana care a acționat, funcția ei și data actului; un formular semnat atașat la dosar este opțional.',
    actingName: 'Numele persoanei care a acționat',
    actingFunction: 'Funcția ei',
    actingDate: 'Data actului',
    actingForm: 'Formular semnat',
    actingFormNone: 'Niciun formular semnat',
    actingReviewLegend: 'Analiza cererii de către organismul de certificare',
    actingReviewView: 'Analizată în numele organismului de certificare de',
    actingDurationLegend:
      'Aprobarea duratei de către organismul de certificare',
    actingDurationView: 'Aprobată în numele organismului de certificare de',
    actingTeamDecisionLegend:
      'Decizia privind echipa de către organismul de certificare',
    actingTeamDecisionView: 'Decisă în numele organismului de certificare de',
    actingReportApprovalLegend:
      'Aprobarea raportului de către organismul de certificare',
    actingReportApprovalView:
      'Raport aprobat în numele organismului de certificare de',
    actingValidation:
      'Completați actul înregistrat în numele organismului de certificare: numele și funcția persoanei care a acționat (cel mult 200 de caractere fiecare) și data actului. Formularul semnat, dacă este ales, trebuie să fie atașat la acest dosar.',
    actingOnTeam:
      'Persoana indicată ca acționând pentru organismul de certificare face parte din echipa de audit. Un membru al echipei de audit nu poate efectua acest act; verificați numele.',
    actInFuture:
      'Actul în numele organismului de certificare nu poate fi datat după ziua de azi. Verificați data actului.',
    independenceLabel: 'Independența față de echipa de audit',
    independenceAttested: 'Atestată de membrul care a înregistrat-o',
    independenceUnattested:
      'Neatestată: înregistrată înainte ca atestarea să fie păstrată',
    teamDecisionAttestation:
      'Atest că persoana care decide asupra acestei echipe nu este membru al echipei de audit.',
    teamDecisionAttestationRequired:
      'Confirmați că persoana care decide asupra echipei nu este membru al echipei de audit.',
    dossierReviewerLegend:
      'Evaluatorul dosarului pentru organismul de certificare',
    dossierApproverLegend: 'Aprobatorul pentru organismul de certificare',
    dossierReviewerView:
      'Dosar evaluat în numele organismului de certificare de',
    dossierApproverView: 'Aprobat în numele organismului de certificare de',
    dossierAttestation:
      'Atest că evaluatorul dosarului și aprobatorul nu sunt membri ai echipei de audit.',
    dossierAttestationRequired:
      'Confirmați că evaluatorul dosarului și aprobatorul nu sunt membri ai echipei de audit.',
    declarationConfirmed: 'Confirmată',
    declarationConflict: 'Conflict',
    declarationToVerify: 'De verificat',
    declarationsToVerify: 'Declarație de verificat',
    impartialityAnalysis: 'Analiza imparțialității',
    impartialityAnalysisHelp:
      'Opțional: documentați cum a fost analizată imparțialitatea echipei, cu dovezi atașate la dosar.',
    impartialityAnalysisRequiredHelp:
      'Obligatorie: cererea declară un consultant ({consultant}). Documentați cum au fost analizate legăturile dintre consultant și echipă, cu dovezi atașate la dosar.',
    impartialityAnalysisNote: 'Analiză',
    impartialityAnalysisEvidence: 'Dovezi atașate la dosar',
    impartialityAnalysisNone: 'Nedocumentată',
    teamAnalysisRequired:
      'Scrieți analiza imparțialității (cel mult 4.000 de caractere, cel mult zece atașamente ale acestui dosar). Este obligatorie când cererea declară un consultant sau când sunt alese dovezi.',
    recommendedOn: 'Data recomandării',
    correctDecisionTexts: 'Corectați textele deciziei',
    decisionCorrectionHelp:
      'O corecție înregistrează o nouă versiune a deciziei cu motivul ei. Rezultatul decis rămâne cel înregistrat; se schimbă doar textele și referințele, iar fiecare condiție prealabilă este verificată din nou.',
    decisionOutcomeFixed:
      'Decizie: {outcome}. O corecție păstrează rezultatul decis.',
    decisionOutcomeFixedRefusal:
      'O corecție păstrează rezultatul decis; se schimbă doar textele și referințele. Reîncărcați dosarul.',
    decisionEarlierVersions: 'Versiuni anterioare ale deciziei ({count})',
    timelineCertificationDecisionVersion:
      'Decizie de certificare — {decision} (versiunea {version})',
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
    auditorBundle: 'Аудитор по сертификации компании',
    auditorPrerequisites:
      'Аудитор по сертификации действует, только если в той же Компании у него есть и право читателя сертификации. Отчёты по этапам записывает только аудитор, связанный с руководителем утверждённой аудиторской группы.',
    auditorGranted: '— предоставление права аудитора по сертификации',
    auditorRevoked: '— отзыв права аудитора по сертификации',

    title: 'Сертификация',
    introduction:
      'Дела по сертификации этого Проекта: заявка клиента, её анализ, продолжительность аудита, приложенные подписанные оригиналы, договор о сертификации, аудиторская группа с её утверждением, аудиты этапов 1 и 2 с их планами, отчётами и наблюдениями, рекомендация группы, анализ досье, решение о сертификации и сертификат со всеми записанными версиями.',
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
    nextStage1Report: 'Отчёт об аудите этапа 1',
    nextStage2Plan: 'План аудита этапа 2',
    nextStage2Report: 'Отчёт об аудите этапа 2',
    nextRecommendation: 'Рекомендация группы',
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
    stepStage1: 'Аудит этапа 1',
    stepStage2: 'Аудит этапа 2',
    stepWaitingTeamApproval: 'Ожидает утверждённой группы',
    stepWaitingStage1Ready: 'Ожидает отчёта этапа 1 с выводом о готовности',
    stepPlanned: 'Запланирован — версия {version}',
    stepStageReady: 'Готов — версия отчёта {version}',
    stepStageNotReady: 'Не готов — версия отчёта {version}',
    stepReported: 'Отчёт записан — версия {version}',

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
    blockedApplicationDecided:
      'Заявку больше нельзя исправить: решение о сертификации записано.',
    blockedAlreadyReviewed:
      'Эта заявка уже проанализирована. Загрузите дело заново.',
    blockedClosed:
      'Это дело закрыто: заявка отклонена. Новые этапы записать нельзя; для новой заявки нужно новое дело.',
    blockedCorrectionReason:
      'Исправлению нужна причина, а у первой заявки её нет. Загрузите дело заново перед новым сохранением.',
    blockedCorrectionUnchanged:
      'Исправление не меняет ни одного значения. Измените хотя бы одно значение или отмените исправление.',

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
    registerPdfTitle: 'Реестр досье в PDF',
    registerPdfHelp:
      'Сформированный PDF со всеми версиями шагов и всеми версиями документов, на которые ссылается это дело, на языке интерфейса. Это не официальная форма органа по сертификации, и он не заменяет ни один подписанный оригинал.',
    registerPdfDownload: 'Скачать реестр досье (PDF)',
    registerPdfDownloading: 'Реестр досье формируется…',
    registerPdfFailed: 'Не удалось скачать реестр досье. Повторите попытку.',
    registerPdfUnavailable:
      'Реестр этого дела недоступен. Загрузите дело заново.',
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
    conflictNote: 'Конфликт или что требует проверки',
    conflictNoteHelp:
      'Обязательно, так как одно из заявлений — конфликт или требует проверки: опишите конфликт или то, что нужно проверить. Группу можно предложить, но утвердить её можно только после подтверждения всех заявлений.',
    conflictDeclared: 'Заявлен конфликт',
    addTeamMember: 'Добавить участника',
    removeTeamMember: 'Удалить участника {number}',
    proposeTeam: 'Предложить группу',
    correctTeam: 'Предложить новую версию группы',
    teamCorrectionHelp:
      'Новая версия заменяет текущее предложение, указывает причину и требует нового решения утверждающего. Прежние версии остаются в хронологии.',
    teamValidation:
      'Заполните данные каждого участника: имя (не более 200 символов), роль, сведения о компетентности (не более 1 000 символов) и ответ на каждое заявление. В группе от одного до десяти участников.',
    teamConflictNoteRequired:
      'Опишите конфликт или то, что нужно проверить (не более 1 000 символов), для каждого участника с неподтверждённым заявлением.',
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
      'Заявление этой группы не подтверждено (конфликт или требуется проверка), поэтому группу нельзя утвердить. Верните её с указанием причины; её можно будет утвердить, когда новая версия подтвердит все заявления.',
    teamConflictDeclared:
      'Группу с неподтверждённым заявлением нельзя утвердить. Верните её с указанием причины.',
    teamIndependence:
      'Вы не можете принимать решение по этой группе: вы связаны с участником одной из её версий. Решение должен принять утверждающий, не входящий в группу.',
    teamMemberDecided:
      'Лицо, утвердившее эту группу, утвердившее отчёт об этапе, проверившее досье или зарегистрировавшее решение лично или от имени органа по сертификации, не может входить в группу. Удалите это лицо или эту связь, загрузите дело заново и предложите снова.',
    blockedTeamNotPending:
      'Ни одна предложенная группа больше не ожидает решения. Загрузите дело заново.',

    nextRecommendationPending:
      'По обоим этапам записаны отчёты, и ни одно несоответствие не задерживает дело. Рекомендацию группы записывает руководитель утверждённой аудиторской группы.',
    stage1Title: 'Аудит этапа 1',
    stage2Title: 'Аудит этапа 2',
    stagePlanTitle: 'План аудита',
    stageReportTitle: 'Отчёт об аудите',
    stagePlanMissing: 'План для этого этапа пока не записан.',
    stageReportMissing: 'Отчёт для этого этапа пока не записан.',
    stageStartDate: 'Дата начала',
    stageEndDate: 'Дата окончания',
    stageOnSiteDays: 'Аудитор-дни на площадке',
    stageRemoteDays: 'Аудитор-дни дистанционно',
    stageOnSiteDaysHelp:
      'Подтверждённая продолжительность на площадке для этого этапа, в аудитор-днях: {days}. Другое число дней на площадке требует примечания с объяснением отклонения.',
    stageDaysFormatHelp: 'Не более двух знаков после точки, например 0.5.',
    stageObjectives: 'Цели',
    stageScope: 'Область аудита',
    stagePlanDocument: 'PDF плана аудита',
    selectStagePlanDocument: 'Выберите приложенный план аудита',
    stageSentToClientOn: 'Отправлен клиенту',
    stageSentToClientOnHelp: 'Оставьте пустым, пока план не отправлен клиенту.',
    stageNotSent: 'Ещё не отправлен',
    stageDeviationNote: 'Отклонение от подтверждённой продолжительности',
    stageDeviationNoteHelp:
      'Обязательно, так как дни на площадке отличаются от подтверждённой продолжительности.',
    stageNoDeviation: 'Отклонение не указано',
    stageReportDate: 'Дата отчёта',
    stageDocumentReview: 'Анализ документации',
    stageDocumentReviewCompleted: 'Завершён',
    stageDocumentReviewConfirm: 'Анализ документации завершён',
    stageConclusion: 'Готовность к этапу 2',
    stageConclusionReady: 'Готов к этапу 2',
    stageConclusionNotReady: 'Не готов к этапу 2',
    stageConclusionNote: 'Обоснование вывода',
    stageSummary: 'Итоги аудита этапа 2',
    stageReportDocument: 'PDF отчёта об аудите',
    selectStageReportDocument: 'Выберите приложенный отчёт об аудите',
    stageParticipantList: 'PDF списка участников',
    stageNoParticipantList: 'Без списка участников',
    stageAnnex: 'PDF приложения',
    stageNoAnnex: 'Без приложения',
    stageNoAttachment: 'Не приложен',
    recordStage1Plan: 'Записать план этапа 1',
    correctStage1Plan: 'Исправить план этапа 1',
    recordStage2Plan: 'Записать план этапа 2',
    correctStage2Plan: 'Исправить план этапа 2',
    recordStage1Report: 'Записать отчёт этапа 1',
    correctStage1Report: 'Исправить отчёт этапа 1',
    recordStage2Report: 'Записать отчёт этапа 2',
    correctStage2Report: 'Исправить отчёт этапа 2',
    stagePlanHelp:
      'Запланируйте этот этап: даты, аудитор-дни на площадке и дистанционно, цели и область, а также приложенный PDF плана с датой его отправки клиенту.',
    stage1ReportHelp:
      'Запишите вывод по этапу 1: завершённый анализ документации, готов ли клиент к этапу 2 и на каком основании, с приложенными отчётом и списком участников.',
    stage2ReportHelp:
      'Запишите завершение аудита этапа 2 с приложенным отчётом, списком участников и необязательным приложением.',
    stageNoPlanDocument:
      'Пока не приложен ни один документ с ролью «План аудита». Сначала приложите PDF плана в реестре документов.',
    stageNoReportDocument:
      'Пока не приложен ни один документ с ролью «Отчёт об аудите». Сначала приложите PDF отчёта в реестре документов.',
    stagePlanValidation:
      'Заполните план: даты начала и окончания, аудитор-дни на площадке больше нуля и дистанционные аудитор-дни не более чем с двумя знаками после точки, цели и область (не более 2 000 символов каждая) и приложенный план аудита. Дата отправки клиенту необязательна.',
    stageDatesRule:
      'Этап заканчивается в дату начала или позже. Проверьте даты.',
    stageDeviationNoteRequired:
      'Дни на площадке отличаются от подтверждённой продолжительности: объясните отклонение (не более 2 000 символов).',
    stageDeviationNoteRule:
      'Дни на площадке и примечание об отклонении больше не соответствуют подтверждённой продолжительности. Загрузите дело заново и проверьте их.',
    stage2StartRule:
      'Этап 2 начинается после даты отчёта этапа 1. Выберите более позднюю дату начала.',
    stage1ReportValidation:
      'Заполните отчёт: дату отчёта, вывод и его обоснование (не более 4 000 символов) и приложенный отчёт об аудите. Список участников необязателен.',
    stage2ReportValidation:
      'Заполните отчёт: дату отчёта, итоги (не более 4 000 символов) и приложенный отчёт об аудите. Список участников и приложение необязательны.',
    stageDocumentReviewRequired:
      'Этап 1 включает анализ документации: подтвердите, что он завершён, прежде чем записывать отчёт.',
    stageReportDateRule:
      'Отчёт датируется датой начала своего этапа или более поздней датой. Проверьте дату отчёта.',
    stageAttachmentRole:
      'Выбранный PDF приложен не с ожидаемой ролью. Загрузите дело заново и выберите снова.',
    blockedStagePlanTeamNotApproved:
      'Аудит планируется после утверждения последней версии аудиторской группы.',
    blockedStage2BeforeStage1Report:
      'Этап 2 планируется после отчёта этапа 1 с выводом о готовности клиента.',
    blockedStage2NotReady:
      'Отчёт этапа 1 делает вывод, что клиент не готов. Этап 2 можно будет запланировать, когда исправленный отчёт этапа 1 сделает вывод о готовности клиента.',
    blockedStageReportBeforePlan:
      'Отчёт записывается после того, как этот этап запланирован.',
    blockedStageReportTeamNotApproved:
      'Отчёты записывает руководитель утверждённой аудиторской группы; последняя версия группы не утверждена.',
    blockedNotTeamLeader:
      'Этот отчёт записывает только руководитель утверждённой аудиторской группы. Вы не связаны с этим руководителем группы.',
    stageReportAwaitingLeader:
      'Этот отчёт записывает руководитель утверждённой аудиторской группы, имеющий право аудитора по сертификации.',
    stagePlanAwaitingManager: 'Этот этап планирует руководитель программы.',
    blockedStagePlanCorrectionReason:
      'Новой версии плана нужна причина, а у первого плана её нет. Загрузите дело заново перед новым сохранением.',
    blockedStageReportCorrectionReason:
      'Новой версии отчёта нужна причина, а у первого отчёта её нет. Загрузите дело заново перед новым сохранением.',

    nextFindingsFollowUp: 'Работа с несоответствиями',
    nextFindingsFollowUpPending:
      'По обоим этапам записаны отчёты. До рекомендации группы каждое значительное несоответствие и каждое несоответствие этапа 1 проверено как результативно устранённое, а у каждого другого незначительного несоответствия план признан адекватным.',
    stepFindings: 'Работа с несоответствиями',
    stepWaitingStage2Report: 'Ожидает отчёт этапа 2',
    stepFindingsOpen: 'Открыто — осталось: {count}',
    stepFindingsDone: 'Завершено',
    blockedStage2NonconformityOpen:
      'Этап 2 планируется после того, как каждое несоответствие этапа 1 проверено как результативно устранённое. Сначала завершите работу с открытыми несоответствиями этапа 1.',
    stage1FindingsTitle: 'Наблюдения этапа 1',
    stage2FindingsTitle: 'Наблюдения этапа 2',
    findingsHelp:
      'Руководитель утверждённой аудиторской группы записывает каждое наблюдение с требованием, процессом или областью, формулировкой, классификацией и точными свидетельствами, затем ведёт работу с каждым несоответствием. Утверждающий, не входящий в группу, может переклассифицировать наблюдение с указанием причины. Каждая версия остаётся в истории.',
    findingsEmpty: 'Для этого этапа наблюдения не записаны.',
    findingHeading: 'Наблюдение {sequence} — {classification}',
    findingClassification: 'Классификация',
    classificationMajor: 'Значительное несоответствие',
    classificationMinor: 'Незначительное несоответствие',
    classificationOpportunity: 'Возможность для улучшения',
    classificationAreaOfConcern: 'Проблемная область',
    findingClause: 'Требование (пункт)',
    findingArea: 'Процесс или область',
    findingStatement: 'Формулировка',
    findingEvidence: 'Свидетельства',
    findingNoEvidence: 'Свидетельства не указаны',
    findingNotStated: 'Не указано',
    findingStatus: 'Работа с наблюдением',
    statusNoActionRequired: 'Действия не требуются',
    statusAwaitingResponse: 'Ожидается ответ клиента',
    statusAwaitingPlanJudgment: 'План нужно оценить',
    statusPlanInadequate: 'План неадекватен — ожидается новый ответ',
    statusPlanAdequate: 'План адекватен — нужно проверить выполнение',
    statusVerifiedEffective: 'Проверено: результативно',
    statusVerifiedNotEffective: 'Нерезультативно — ожидается новый ответ',
    findingResponseDueOn: 'Ответ ожидается до',
    findingLimitOn: 'Шестимесячный срок',
    findingOverdue: 'Просрочено',
    findingOverdueNote:
      'Шестимесячный срок истёк без проверки устранения несоответствия.',
    findingHoldsVerification:
      'Блокирует следующий этап до проверки результативности.',
    findingHoldsPlan:
      'Блокирует следующий этап, пока план не признан адекватным.',
    findingHistory: 'История наблюдения {sequence}',
    findingRecordStatement: 'Формулировка — версия {version}',
    findingRecordClassification:
      'Классификация — {classification}, {by} (версия {version})',
    classifiedByTeamLeader: 'руководителем группы',
    classifiedByApprover: 'утверждающим',
    findingRecordResponse: 'Ответ клиента — версия {version}',
    findingRecordPlanJudgment: 'Оценка плана — {outcome} (версия {version})',
    findingRecordVerification: 'Проверка — {outcome} (версия {version})',
    responseCorrection: 'Коррекция',
    responseCause: 'Причина',
    responseCorrectiveAction: 'Корректирующее действие',
    responseReceivedOn: 'Получен',
    responsePlannedCompletionOn: 'Плановое завершение',
    responseNoPlannedCompletion: 'Не указано',
    planOutcome: 'Адекватность плана',
    planAdequate: 'Адекватен',
    planInadequate: 'Неадекватен',
    planNote: 'Обоснование оценки',
    verificationVerifiedOn: 'Дата проверки',
    verificationMethod: 'Метод проверки',
    methodDocumentReview: 'Анализ документов',
    methodOnSite: 'На месте',
    verificationOutcome: 'Результативность',
    outcomeEffective: 'Результативно',
    outcomeNotEffective: 'Нерезультативно',
    verificationNote: 'Примечание к проверке',
    recordStage1Finding: 'Записать наблюдение этапа 1',
    recordStage2Finding: 'Записать наблюдение этапа 2',
    findingSubmit: 'Записать наблюдение',
    recordFindingHelp:
      'Выберите классификацию, укажите требование, процесс или область и формулировку и сошлитесь на точные свидетельства, приложенные к этому делу. Несоответствие ссылается хотя бы на один PDF-свидетельство; возможность для улучшения может не указывать требование и область.',
    findingClauseHelp:
      'Например, 8.5.1. Необязательно только для возможности для улучшения.',
    findingEvidenceHelp:
      'PDF, приложенные к этому делу с ролью «Свидетельство», не более десяти.',
    findingNoEvidenceDocument:
      'Документы с ролью «Свидетельство» пока не приложены. Сначала приложите PDF-свидетельства в реестре документов: несоответствие ссылается хотя бы на одно.',
    correctFinding: 'Исправить формулировку наблюдения {sequence}',
    changeClassification: 'Изменить классификацию наблюдения {sequence}',
    reclassifyFinding: 'Переклассифицировать наблюдение {sequence}',
    classificationChangeHelp:
      'Как руководитель группы выберите новую классификацию и укажите причину. Прежняя классификация остаётся в истории.',
    reclassificationHelp:
      'Как утверждающий, не входящий в аудиторскую группу, выберите новую классификацию и укажите причину. Прежняя классификация остаётся в истории.',
    classificationNew: 'Новая классификация',
    classificationReason: 'Причина новой классификации',
    classificationSubmit: 'Записать классификацию',
    recordResponse: 'Записать ответ клиента на наблюдение {sequence}',
    responseHelp:
      'Запишите коррекцию, анализ причин и план корректирующих действий клиента в полученном виде, с необязательными свидетельствами. Новый ответ после плана, признанного неадекватным, — это новая версия.',
    responseSubmit: 'Записать ответ',
    judgePlan: 'Оценить план по наблюдению {sequence}',
    judgePlanHelp:
      'Оцените, адекватен ли последний ответ для устранения несоответствия, и на каком основании.',
    judgmentSubmit: 'Записать оценку',
    verifyFinding: 'Проверить выполнение по наблюдению {sequence}',
    verifyHelp:
      'Запишите, когда и как проверено выполнение, результативно ли оно, и необязательные свидетельства.',
    verificationSubmit: 'Записать проверку',
    findingValidation:
      'Заполните наблюдение: выберите классификацию и напишите формулировку (не более 4 000 символов). Требование — не более 40 символов, процесс или область — не более 300; укажите не более десяти PDF-свидетельств этого дела.',
    findingStatementValidation:
      'Напишите формулировку (не более 4 000 символов). Требование — не более 40 символов, процесс или область — не более 300; укажите не более десяти PDF-свидетельств этого дела.',
    findingClauseRequired:
      'Укажите требование и процесс или область. Только возможность для улучшения может их не указывать.',
    findingClassificationStage:
      'Проблемная область записывается только на этапе 1. Выберите другую классификацию.',
    findingEvidenceRequired:
      'Несоответствие ссылается хотя бы на один точный PDF-свидетельство, приложенный к этому делу.',
    classificationValidation:
      'Выберите новую классификацию и укажите причину (не более 2 000 символов).',
    classificationUnchanged:
      'Это уже классификация наблюдения. Выберите другую или отмените.',
    responseValidation:
      'Заполните ответ: коррекцию, причину и корректирующее действие (не более 4 000 символов каждое) и дату получения. Плановая дата завершения и свидетельства необязательны.',
    judgmentValidation:
      'Укажите, адекватен ли план, и обоснование оценки (не более 2 000 символов).',
    verificationValidation:
      'Заполните проверку: дату, метод, результат и примечание (не более 2 000 символов). Свидетельства необязательны.',
    blockedFindingTeamNotApproved:
      'Наблюдения записывает руководитель утверждённой аудиторской группы; последняя версия группы не утверждена.',
    blockedFindingNotTeamLeader:
      'Наблюдения и работу с ними записывает только руководитель утверждённой аудиторской группы. Вы не связаны с этим руководителем группы.',
    blockedFindingStageClosed:
      'Наблюдения этапа 1 записываются до планирования этапа 2.',
    blockedFindingStageNotPlanned:
      'Наблюдения записываются после того, как этот этап запланирован. Загрузите дело заново.',
    findingNotOpen:
      'Ответ принимается только по открытому несоответствию. Загрузите дело заново.',
    findingNoResponse:
      'План оценивается после того, как записан ответ клиента. Загрузите дело заново.',
    findingPlanNotAdequate:
      'Выполнение проверяется после того, как план признан адекватным. Загрузите дело заново.',
    findingLimitPassed:
      'Шестимесячный срок по этому несоответствию истёк без подтверждённой эффективности: этот процесс сертификации не может продолжаться. Повторный этап или дополнительный аудит выходят за рамки этой версии.',
    findingIndependence:
      'Вы не можете переклассифицировать наблюдения: вы связаны с участником аудиторской группы. Переклассифицирует утверждающий, не входящий в группу.',
    findingEvidenceUnavailable:
      'Указанный PDF-свидетельство не приложен к этому делу. Загрузите дело заново и выберите снова.',
    blockedFindingCorrectionReason:
      'Для этого изменения нужна причина, а у нового наблюдения её нет. Загрузите дело заново перед новым сохранением.',
    timelineFindingRecorded:
      'Наблюдение {sequence} записано — {classification} ({stage})',
    timelineFindingCorrected:
      'Наблюдение {sequence} — формулировка исправлена (версия {version})',
    timelineFindingReclassified:
      'Наблюдение {sequence} переклассифицировано — {classification}, {by} (версия {version})',
    timelineNonconformityResponse:
      'Наблюдение {sequence} — записан ответ клиента (версия {version})',
    timelineNonconformityPlanJudged:
      'Наблюдение {sequence} — оценка плана: {outcome} (версия {version})',
    timelineNonconformityVerified:
      'Наблюдение {sequence} — проверка: {outcome} (версия {version})',
    findingStage1: 'этап 1',
    findingStage2: 'этап 2',

    timelineTitle: 'Хронология',
    timelineEmpty: 'Этапы ещё не записаны.',
    timelineApplication: 'Заявка — версия {version}',
    timelineReview: 'Анализ заявки — {outcome}',
    timelineDuration: 'Продолжительность аудита — версия {version}',
    timelineAgreement: 'Договор о сертификации — версия {version}',
    timelineTeam: 'Аудиторская группа — версия {version}',
    timelineTeamDecision:
      'Решение по группе — {decision} (версия группы {version})',
    timelineStage1Plan: 'План этапа 1 — версия {version}',
    timelineStage1Report: 'Отчёт этапа 1 — {conclusion} (версия {version})',
    timelineStage2Plan: 'План этапа 2 — версия {version}',
    timelineStage2Report: 'Отчёт этапа 2 — версия {version}',
    showValues: 'Показать записанные значения',
    recommendationTitle: 'Рекомендация группы',
    recommendationMissing: 'Рекомендация группы ещё не записана.',
    recordRecommendation: 'Записать рекомендацию группы',
    correctRecommendation: 'Исправить рекомендацию группы',
    recommendationHelp:
      'Руководитель утверждённой аудиторской группы рекомендует выдать сертификацию, не выдавать её или провести дополнительный аудит и указывает основание. Ничего не выбрано заранее. Дополнительный аудит не входит в этот процесс: при такой рекомендации в сертификации можно только отказать.',
    recommendationOutcome: 'Рекомендация',
    recommendationGrant: 'Выдать сертификацию',
    recommendationDoNotGrant: 'Не выдавать сертификацию',
    recommendationAdditionalAudit: 'Нужен дополнительный аудит',
    recommendationBasis: 'Основание рекомендации',
    recommendationSubmit: 'Записать рекомендацию',
    recommendationValidation:
      'Выберите рекомендацию и укажите её основание (не более 4 000 символов).',
    recommendationAwaitingLeader:
      'Рекомендацию группы записывает руководитель утверждённой аудиторской группы, имеющий право аудитора по сертификации.',
    blockedRecommendationNotTeamLeader:
      'Рекомендацию группы записывает только руководитель утверждённой аудиторской группы. Вы не связаны с этим руководителем группы.',
    blockedRecommendationFindingsOpen:
      'Рекомендация группы записывается, когда ни одно несоответствие не задерживает дело. Загрузите дело заново.',
    blockedRecommendationBeforeStage2:
      'Рекомендация группы записывается после отчёта этапа 2. Загрузите дело заново.',
    dossierReviewTitle: 'Анализ досье',
    dossierReviewMissing: 'Анализ досье ещё не записан.',
    recordDossierReview: 'Записать анализ досье',
    correctDossierReview: 'Исправить анализ досье',
    dossierReviewHelp:
      'Утверждающий, не входящий в аудиторскую группу, отвечает по каждому элементу досье: есть, отсутствует или не применяется. Ничего не выбрано заранее; для отсутствующего элемента нужно примечание. Этот анализ отличается от реестра документов.',
    dossierAnswerPresent: 'Есть',
    dossierAnswerMissing: 'Отсутствует',
    dossierAnswerNotApplicable: 'Не применяется',
    dossierItemNote: 'Примечание',
    dossierConclusion: 'Вывод анализа',
    dossierReviewSubmit: 'Записать анализ',
    dossierReviewValidation:
      'Ответьте по каждому элементу досье, напишите примечание к каждому отсутствующему элементу (не более 1 000 символов) и вывод (не более 4 000 символов).',
    dossierReviewResult: 'Итог',
    dossierComplete: 'Полное — отсутствующих элементов нет',
    dossierIncomplete: 'Неполное — отсутствующих элементов: {count}',
    dossierItemApplication: 'Заявка',
    dossierItemApplicationReview: 'Анализ заявки',
    dossierItemDuration: 'Продолжительность аудита',
    dossierItemAgreement: 'Договор о сертификации',
    dossierItemTeamApproval: 'Утверждение аудиторской группы',
    dossierItemStage1Plan: 'План аудита этапа 1',
    dossierItemStage1Report: 'Отчёт об аудите этапа 1',
    dossierItemStage2Plan: 'План аудита этапа 2',
    dossierItemStage2Report: 'Отчёт об аудите этапа 2',
    dossierItemParticipantLists: 'Списки участников',
    dossierItemFindingsFollowUp: 'Работа с несоответствиями',
    dossierItemRecommendation: 'Рекомендация группы',
    dossierItemCertificateData: 'Данные сертификата, согласованные с клиентом',
    dossierAwaitingApprover:
      'Досье анализирует утверждающий, не входящий в аудиторскую группу.',
    dossierIndependence:
      'Вы не можете анализировать это досье: вы связаны с участником аудиторской группы. Его анализирует утверждающий, не входящий в группу.',
    blockedDossierBeforeRecommendation:
      'Досье анализируется после рекомендации группы. Загрузите дело заново.',
    blockedDecided:
      'Решение о сертификации записано: то, на чём оно основано (продолжительность, договор, группа, этапы, наблюдения, рекомендация, анализ досье), больше не меняется; остаются только данные сертификата и сам сертификат. Загрузите дело заново.',
    certificationDecisionTitle: 'Решение о сертификации',
    certificationDecisionMissing: 'Решение о сертификации ещё не записано.',
    recordCertificationDecision: 'Записать решение о сертификации',
    certificationDecisionHelp:
      'Утверждающий, не входящий в аудиторскую группу, записывает решение органа по сертификации. До записи сертификата исправление с указанием причины может изменить его тексты и ссылки, но не результат. Ничего не выбрано заранее. При выдаче указывается выданный текст сертификата для каждого языка сертификата.',
    decisionOutcome: 'Решение',
    decisionGranted: 'Сертификация выдана',
    decisionRefused: 'В сертификации отказано',
    grantedTexts: 'Выданные тексты сертификата',
    certificateTextsAgreed: 'Согласованные тексты сертификата',
    certificateTextHeading: 'Текст сертификата {position}',
    certificateLanguage: 'Язык',
    certificateLanguageHelp:
      'Код языка этого текста сертификата, например ro или en; каждый язык один раз.',
    certificateHolderName: 'Наименование держателя',
    certificateAddress: 'Адрес',
    certificateScope: 'Область',
    addCertificateLanguage: 'Добавить язык сертификата',
    removeCertificateText: 'Удалить текст сертификата {position}',
    decidedOn: 'Дата решения',
    decidedBy: 'Лицо, принявшее решение',
    decidedByFunction: 'Должность лица, принявшего решение',
    decisionForm: 'Подписанная форма решения',
    decisionFormNone: 'Без подписанной формы решения',
    decisionRationale: 'Обоснование',
    decisionAdditionalInformation: 'Использованная дополнительная информация',
    decisionIndependenceAttestation:
      'Подтверждаю, что лицо, принявшее решение, не входит в аудиторскую группу.',
    decisionIndependenceLabel: 'Независимость',
    decisionIndependenceAttested:
      'Подтверждено: лицо, принявшее решение, не входит в аудиторскую группу.',
    certificationDecisionSubmit: 'Записать решение',
    certificationDecisionValidation:
      'Заполните решение: выберите исход и укажите дату решения, лицо, принявшее решение, и его должность (не более 200 символов каждое) и обоснование (не более 4 000 символов). При выдаче укажите от одного до четырёх текстов сертификата, по одному на язык, каждый с наименованием держателя, адресом и областью.',
    decisionAttestationRequired:
      'Подтвердите, что лицо, принявшее решение, не входит в аудиторскую группу.',
    decisionPreconditionsTitle:
      'Решение о сертификации нельзя записать, пока не выполнены эти предварительные условия:',
    decisionPreconditionsList: 'Невыполненные предварительные условия',
    decisionPreconditionsRefused:
      'Сервер отклонил решение: эти предварительные условия не выполнены.',
    decisionPreconditionsUnknown:
      'Сервер отклонил решение, так как предварительное условие не выполнено. Загрузите дело заново и проверьте каждый этап.',
    preconditionApplicationNotAccepted: 'Анализ заявки не принял заявку.',
    preconditionDurationMissing: 'Продолжительность аудита не подтверждена.',
    preconditionAgreementMissing: 'Договор о сертификации не записан.',
    preconditionTeamNotApproved:
      'Последняя версия аудиторской группы не утверждена.',
    preconditionStage1NotReady:
      'Нет отчёта этапа 1 с выводом о готовности клиента.',
    preconditionStage2NotReported: 'Отчёт этапа 2 не записан.',
    preconditionFindingsOpen:
      'Несоответствие всё ещё задерживает дело: его нужно проверить как результативно устранённое, а для незначительного несоответствия этапа 2 — признать план адекватным.',
    preconditionFindingsOverdue: 'У несоответствия истёк шестимесячный срок.',
    preconditionRecommendationMissing: 'Рекомендация группы не записана.',
    preconditionGrantAgainstRecommendation:
      'Нельзя выдать сертификацию вопреки рекомендации группы, которая не рекомендует её выдавать.',
    preconditionDossierReviewIncomplete:
      'Анализ досье не записан или в нём указан отсутствующий элемент.',
    preconditionDecisionInFuture: 'Дата решения находится в будущем.',
    decisionMakerIndependence:
      'Лицо, принявшее решение, не может входить в аудиторскую группу: вы связаны с участником одной из её версий или указанное лицо входит в утверждённую группу.',
    certificationDecisionAwaitingApprover:
      'Решение о сертификации записывает утверждающий, не входящий в аудиторскую группу.',
    certificationDecisionIndependence:
      'Вы не можете записать решение о сертификации: вы связаны с участником аудиторской группы. Решение принимает утверждающий, не входящий в группу.',
    decisionFormRole:
      'Подписанная форма решения должна быть PDF этого дела, приложенным как форма решения. Загрузите дело заново и выберите снова.',
    certificateDataTitle: 'Данные сертификата, согласованные с клиентом',
    certificateDataMissing: 'Данные сертификата ещё не согласованы.',
    recordCertificateData: 'Записать данные сертификата',
    correctCertificateData: 'Исправить данные сертификата',
    certificateDataHelp:
      'Руководитель программы записывает для каждого языка сертификата наименование держателя, адрес и область, согласованные с клиентом, с подписанной формой. Сертификат записывается, когда они точно совпадают с тем, что выдано решением.',
    certificateDataAgreedOn: 'Дата согласования',
    certificateDataDocument: 'Подписанная форма данных сертификата',
    selectCertificateDataDocument: 'Выберите подписанную форму',
    certificateDataSubmit: 'Записать данные сертификата',
    certificateDataValidation:
      'Заполните данные сертификата: от одного до четырёх текстов, по одному на язык, каждый с языком (не более 10 символов), наименованием держателя (не более 300), адресом (не более 500) и областью (не более 2 000); дату согласования и подписанную форму.',
    certificateDataNoDocument:
      'Сначала приложите к этому делу подписанную форму данных сертификата с ролью «Форма данных сертификата».',
    certificateDataAwaitingManager:
      'Данные сертификата, согласованные с клиентом, записывает руководитель программы.',
    certificateDataDocumentRole:
      'Подписанная форма должна быть PDF этого дела, приложенным как форма данных сертификата. Загрузите дело заново и выберите снова.',
    blockedCertificateDataBeforeStage2:
      'Данные сертификата согласуются после отчёта этапа 2. Загрузите дело заново.',
    certificateTextsDiffer:
      'Согласованные данные сертификата отличаются от выданного решением:',
    certificateDifferencesList: 'Отличия от решения',
    differenceNotAgreed:
      '{language}: выдан решением, отсутствует в согласованных данных.',
    differenceNotGranted:
      '{language}: есть в согласованных данных, не выдан решением.',
    differenceField:
      '{language} — {field}: выдано «{granted}», согласовано «{agreed}».',
    certificateTitle: 'Сертификат',
    certificateMissing: 'Сертификат ещё не записан.',
    recordCertificate: 'Записать выданный сертификат',
    certificateHelp:
      'Утверждающий, не входящий в аудиторскую группу, один раз записывает выданный сертификат: его номер, уникальный в Компании, точный PDF сертификата и подписанта. Срок действия сервер вычисляет от даты решения.',
    certificateNumber: 'Номер сертификата',
    certificatePdf: 'PDF сертификата',
    selectCertificatePdf: 'Выберите PDF сертификата',
    certificateSignedBy: 'Подписал(а)',
    certificateSignedByFunction: 'Должность подписанта',
    certificateIndependenceAttestation:
      'Подтверждаю, что подписант не входит в аудиторскую группу.',
    certificateSubmit: 'Записать сертификат',
    certificateValidation:
      'Заполните сертификат: его номер (не более 64 символов) и PDF сертификата этого дела; подписант и должность — не более 200 символов каждое.',
    certificateAttestationRequired:
      'Подтвердите, что подписант не входит в аудиторскую группу.',
    certificateNoPdf:
      'Сначала приложите к этому делу PDF выданного сертификата с ролью «Сертификат».',
    certificateAwaitingApprover:
      'Сертификат записывает утверждающий, не входящий в аудиторскую группу.',
    certificateApproverIndependence:
      'Вы не можете записать сертификат: вы связаны с участником аудиторской группы. Его записывает утверждающий, не входящий в группу.',
    certificateIndependence:
      'Участник аудиторской группы не может записать или подписать сертификат: вы связаны с одним из них или указанный подписант входит в утверждённую группу.',
    certificateNumberTaken:
      'Этот номер сертификата уже используется в Компании. Проверьте номер на выданном сертификате.',
    preconditionDiscrepanciesOpen:
      'В согласованности досье открыто критическое расхождение или непринятая ошибка.',
    certificateDiscrepanciesOpen:
      'Открыто критическое расхождение или непринятая ошибка: устраните его в разделе «Согласованность досье» до записи сертификата. Загрузите дело заново.',
    discrepancyNotOpen:
      'Это расхождение больше не открыто в текущем деле. Загрузите дело заново.',
    discrepancyValidation:
      'Укажите сравниваемые поля (не более 200 символов), вердикт и оба значения (не более 1 000 символов каждое), каждое в документе, приложенном к этому делу; место — не более 200 символов, примечание — не более 2 000.',
    discrepancyReasonRequired: 'Укажите причину (не более 2 000 символов).',
    discrepancyCorrectionRequired:
      'Выберите версию записи или документа, которая исправляет, и укажите причину.',
    discrepancyCritical:
      'Критическое расхождение нельзя принять; его устраняет только исправление записей.',
    discrepancyCorrectedByRecord:
      'Расхождение, выявленное правилом, закрывается, когда новая версия записи согласует значения; вручную оно не закрывается.',
    discrepancyNotOnTeam:
      'Аудитор вносит расхождение только в дело, аудиторская группа которого включает его.',
    discrepancyIndependence:
      'Член аудиторской группы не может устранить это расхождение или внести его как утверждающий.',
    discrepancyCorrectionUnknown:
      'Указанное исправление не является версией записи этого дела. Загрузите дело заново.',
    discrepancyDocumentUnavailable:
      'Выбранный документ больше не приложен к этому делу. Загрузите дело заново.',
    certificateDataDiffers:
      'Согласованные данные сертификата должны точно совпадать с выданным решением. Загрузите дело заново и сначала исправьте данные сертификата.',
    blockedCertificateDataDiffers:
      'Сертификат записывается, когда согласованные данные сертификата точно совпадают с выданным решением. Сначала исправьте данные сертификата.',
    blockedCertificateNotGranted:
      'Сертификат следует за решением о выдаче сертификации. Загрузите дело заново.',
    blockedCertificateDataMissing:
      'Сертификат записывается после согласования данных сертификата с клиентом.',
    certificatePdfRole:
      'PDF сертификата должен быть приложен к этому делу как сертификат. Загрузите дело заново и выберите снова.',
    certificateValidFrom: 'Действителен с',
    certificateValidUntil: 'Действителен до',
    certificateFirstSurveillanceBy: 'Начало первого надзора не позднее',
    certificateValidityNote:
      'Вычислено сервером от даты решения: действителен три года минус один день; первый надзор начинается в течение двенадцати месяцев.',
    certificateTexts: 'Тексты сертификата',
    statusRefused: 'Закрыто — в сертификации отказано',
    statusCertified: 'Сертифицировано',
    caseCertifiedNote:
      'Это дело сертифицировано: его сертификат записан. Теперь все записи доступны только для чтения.',
    caseRefusedNote:
      'Это дело закрыто: в сертификации отказано. Теперь все записи доступны только для чтения; для новой заявки нужно новое дело.',
    caseClosedRefusal:
      'Это дело закрыто. Загрузите его заново, чтобы увидеть итоговое состояние.',
    nextDossierReview: 'Анализ досье',
    nextCertificationDecision: 'Решение о сертификации',
    nextCertificateData: 'Данные сертификата, согласованные с клиентом',
    nextCertificate: 'Сертификат',
    stepRecommendation: 'Рекомендация группы',
    stepDossierReview: 'Анализ досье',
    stepCertificationDecision: 'Решение о сертификации',
    stepCertificateData: 'Данные сертификата',
    stepCertificate: 'Сертификат',
    stepRecommended: '{recommendation} — версия {version}',
    stepWaitingFollowUp: 'Ожидает работы с несоответствиями',
    stepWaitingRecommendation: 'Ожидает рекомендации группы',
    stepDossierComplete: 'Полный — версия {version}',
    stepDossierIncomplete: 'Есть отсутствующий элемент — версия {version}',
    stepWaitingDossierReview: 'Ожидает анализа досье',
    stepWaitingGrant: 'Ожидает решения о выдаче',
    stepWaitingCertificateData: 'Ожидает согласованных данных сертификата',
    stepCertificateRecorded: 'Записан — {number}',
    timelineRecommendation:
      'Рекомендация группы — {recommendation} (версия {version})',
    timelineDossierReview: 'Анализ досье — версия {version}',
    timelineCertificationDecision: 'Решение о сертификации — {decision}',
    timelineCertificateData: 'Данные сертификата — версия {version}',
    timelineCertificate: 'Сертификат {number} записан',
    roleCertificateData: 'Форма данных сертификата',
    roleDecisionForm: 'Форма решения',
    blockedVersionCorrectionReason:
      'Новой версии нужна причина, а у первой записи её нет. Загрузите дело заново перед новым сохранением.',
    applicationSubmittedOn: 'Дата подписанной заявки',
    applicationSubmittedOnHelp:
      'Необязательно: дата, указанная на подписанной заявке, если она есть в бумажном деле.',
    actingOnBehalf:
      'Это действие совершил сотрудник органа по сертификации; я записываю его от его имени.',
    actingHelp:
      'Вы остаётесь записанным как участник, внёсший запись. Укажите, кто действовал, его должность и дату действия; подписанная форма, приложенная к делу, необязательна.',
    actingName: 'Имя действовавшего лица',
    actingFunction: 'Его должность',
    actingDate: 'Дата действия',
    actingForm: 'Подписанная форма',
    actingFormNone: 'Без подписанной формы',
    actingReviewLegend: 'Анализ заявки органом по сертификации',
    actingReviewView: 'Проанализировано от имени органа по сертификации:',
    actingDurationLegend:
      'Утверждение продолжительности органом по сертификации',
    actingDurationView: 'Утверждено от имени органа по сертификации:',
    actingTeamDecisionLegend: 'Решение по группе органом по сертификации',
    actingTeamDecisionView: 'Решено от имени органа по сертификации:',
    actingReportApprovalLegend: 'Утверждение отчёта органом по сертификации',
    actingReportApprovalView:
      'Отчёт утверждён от имени органа по сертификации:',
    actingValidation:
      'Заполните действие, записываемое от имени органа по сертификации: имя и должность действовавшего лица (не более 200 символов каждое) и дату действия. Выбранная подписанная форма должна быть приложена к этому делу.',
    actingOnTeam:
      'Лицо, указанное как действующее от имени органа по сертификации, входит в аудиторскую группу. Член аудиторской группы не может совершать это действие; проверьте имя.',
    actInFuture:
      'Действие от имени органа по сертификации не может быть датировано позже сегодняшнего дня. Проверьте дату действия.',
    independenceLabel: 'Независимость от аудиторской группы',
    independenceAttested: 'Подтверждено участником, внёсшим запись',
    independenceUnattested:
      'Не подтверждено: записано до того, как подтверждение стало сохраняться',
    teamDecisionAttestation:
      'Я подтверждаю, что лицо, принимающее решение по этой группе, не входит в аудиторскую группу.',
    teamDecisionAttestationRequired:
      'Подтвердите, что лицо, принимающее решение по группе, не входит в аудиторскую группу.',
    dossierReviewerLegend: 'Эксперт по анализу досье от органа по сертификации',
    dossierApproverLegend: 'Утверждающий от органа по сертификации',
    dossierReviewerView:
      'Досье проанализировано от имени органа по сертификации:',
    dossierApproverView: 'Утверждено от имени органа по сертификации:',
    dossierAttestation:
      'Я подтверждаю, что эксперт по анализу досье и утверждающий не входят в аудиторскую группу.',
    dossierAttestationRequired:
      'Подтвердите, что эксперт по анализу досье и утверждающий не входят в аудиторскую группу.',
    declarationConfirmed: 'Подтверждено',
    declarationConflict: 'Конфликт',
    declarationToVerify: 'Требует проверки',
    declarationsToVerify: 'Заявление требует проверки',
    impartialityAnalysis: 'Анализ беспристрастности',
    impartialityAnalysisHelp:
      'Необязательно: опишите, как анализировалась беспристрастность группы, с доказательствами, приложенными к делу.',
    impartialityAnalysisRequiredHelp:
      'Обязательно: в заявке указан консультант ({consultant}). Опишите, как анализировались связи между консультантом и группой, с доказательствами, приложенными к делу.',
    impartialityAnalysisNote: 'Анализ',
    impartialityAnalysisEvidence: 'Доказательства, приложенные к делу',
    impartialityAnalysisNone: 'Не описан',
    teamAnalysisRequired:
      'Опишите анализ беспристрастности (не более 4 000 символов, не более десяти вложений этого дела). Он обязателен, если в заявке указан консультант или выбраны доказательства.',
    recommendedOn: 'Дата рекомендации',
    correctDecisionTexts: 'Исправить тексты решения',
    decisionCorrectionHelp:
      'Исправление записывает новую версию решения с причиной. Принятый результат остаётся записанным; меняются только тексты и ссылки, а все предварительные условия проверяются заново.',
    decisionOutcomeFixed:
      'Решение: {outcome}. Исправление сохраняет принятый результат.',
    decisionOutcomeFixedRefusal:
      'Исправление сохраняет принятый результат; меняются только тексты и ссылки. Загрузите дело заново.',
    decisionEarlierVersions: 'Предыдущие версии решения ({count})',
    timelineCertificationDecisionVersion:
      'Решение о сертификации — {decision} (версия {version})',
  },
});

export function useCertificationCopy() {
  return useMessages(certificationMessages);
}
