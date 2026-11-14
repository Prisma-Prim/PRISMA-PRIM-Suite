import {
  CertificateReleaseRegion,
  useCertificateReleaseForm,
} from './CertificationRelease';
import './certification.css';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  conflictCode,
  conflictDiscrepancies,
  conflictFailures,
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import {
  useScopedOperation,
  type ScopedOperation,
} from '../api/use-scoped-operation';
import { receivedAuditSourceNativeAuthority } from '../documents/received-audit-source-access';
import {
  useInterfaceLocale,
  type InterfaceLocale,
} from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import { Select } from '../presentation/Select';
import {
  certificationAuthority,
  certificationContextKey,
} from './certification-access';
import {
  agreementAttachments,
  agreementDraftFor,
  agreementFromDraft,
  attachFromDraft,
  emptyAttachDraft,
  type AgreementCheck,
  type AgreementDraft,
} from './certification-documents-draft';
import {
  useCertificationCopy,
  type CertificationMessageKey,
} from './certification.copy';
import {
  latestBusinessDate,
  type ActAttribution,
} from './certification-attribution';
import {
  correctionReason,
  draftFromFacts,
  emptyApplicationDraft,
  emptyReviewDraft,
  factsFromDraft,
  reviewFromDraft,
} from './certification-draft';
import {
  proposedConfirmation,
  type DurationResult,
} from './certification-duration';
import {
  confirmationFromDraft,
  durationDraftFor,
  durationInputsFromDraft,
  type ConfirmationCheck,
  type DurationDraft,
} from './certification-duration-draft';
import {
  decisionFromDraft,
  emptyDecisionDraft,
  linkedToAnyTeamVersion,
  teamDraftFor,
  teamFromDraft,
  type DecisionCheck,
  type DecisionDraft,
  type TeamCheck,
  type TeamDraft,
} from './certification-team-draft';
import { teamWithoutConflict } from './certification-team';
import {
  findingBlocks,
  findingCommands,
  isNonconformity,
  recordEvidence,
  type ClassificationRefusal,
  type Finding,
  type FindingCommand,
} from './certification-findings';
import {
  classificationFromDraft,
  correctionDraftFor,
  correctionFromDraft,
  emptyClassificationDraft,
  emptyFindingDraft,
  emptyPlanJudgmentDraft,
  emptyResponseDraft,
  emptyVerificationDraft,
  findingFromDraft,
  judgmentFromDraft,
  responseFromDraft,
  verificationFromDraft,
  type ClassificationDraft,
  type FindingCorrectionDraft,
  type FindingDraft,
  type PlanJudgmentDraft,
  type ResponseDraft,
  type VerificationDraft,
} from './certification-findings-draft';
import {
  approvedTeam,
  leadsTeam,
  slotRoles,
  stageAttachmentReferences,
  type AuditStage,
} from './certification-stages';
import {
  slotAttachments,
  stage1ReportDraftFor,
  stage1ReportFromDraft,
  stage2ReportDraftFor,
  stage2ReportFromDraft,
  stagePlanDraftFor,
  stagePlanFromDraft,
  type Stage1ReportDraft,
  type Stage2ReportDraft,
  type StagePlanCheck,
  type StagePlanDraft,
  type StageReportCheck,
} from './certification-stages-draft';
import {
  CERTIFICATION_LIMITS,
  parseCaseDetail,
  parseCaseCommandReceipt,
  parseCaseList,
  parseDocumentRegister,
  parseDurationResult,
  parseEligibleDocuments,
  parseLegalEntityOptions,
  parseTimeline,
  type CaseDetail,
  type CaseList,
  type CaseTimeline,
  type CertificationActorReference,
  type CertificationAttachment,
  type CertificationDocumentRole,
  type DocumentRegister,
  type EligibleDocuments,
  type LegalEntityOption,
} from './certification-response';
import { AgreementForm, AttachForm } from './CertificationDocumentForms';
import {
  AgreementView,
  DossierRegister,
  RegisterPdfAction,
  type RegisterDownload,
  type RegisterPdfDownload,
} from './CertificationDocumentViews';
import { DurationForm } from './CertificationDurationForm';
import { DurationView } from './CertificationDurationViews';
import { ApplicationForm, ReviewForm } from './CertificationForms';
import { invalidField, blank, wrongText } from './certification-fields';
import {
  Stage1ReportForm,
  Stage2ReportForm,
  StagePlanForm,
  stageFormTitle,
} from './CertificationStageForms';
import {
  Stage1ReportView,
  Stage2ReportView,
  StagePlanView,
} from './CertificationStageViews';
import { DecisionForm, TeamForm } from './CertificationTeamForms';
import {
  DecisionView,
  TeamView,
  type KnownPeople,
} from './CertificationTeamViews';
import { VersionAttribution } from './CertificationAttribution';
import {
  ClassificationForm,
  FindingCorrectionForm,
  FindingRecordForm,
  PlanJudgmentForm,
  ResponseForm,
  VerificationForm,
} from './CertificationFindingForms';
import {
  FindingFacts,
  FindingHistory,
  FindingHold,
  useFindingHeading,
} from './CertificationFindingViews';
import {
  FactsView,
  NextStepLabel,
  ReviewView,
  StepRail,
  TimelineView,
  statusLabel,
} from './CertificationViews';
import {
  certificateTextDifferences,
  decisionPreconditions,
  parseDecisionFailures,
  type DecisionPrecondition,
} from './certification-decision';
import {
  attachmentsWithRole,
  certificateDataDraftFor,
  certificateDataFromDraft,
  certificateFromDraft,
  certificationDecisionDraftFor,
  certificationDecisionFromDraft,
  dossierReviewDraftFor,
  dossierReviewFromDraft,
  emptyCertificateDraft,
  emptyCertificationDecisionDraft,
  recommendationDraftFor,
  recommendationFromDraft,
  type CertificateDataDraft,
  type CertificateDraft,
  type CertificationDecisionDraft,
  type DossierReviewCheck,
  type DossierReviewDraft,
  type RecommendationDraft,
} from './certification-decision-draft';
import {
  CertificateDataForm,
  CertificateForm,
  CertificationDecisionForm,
  DossierReviewForm,
  RecommendationForm,
} from './CertificationDecisionForms';
import {
  CertificateDataView,
  CertificateTextDifferences,
  CertificateView,
  CertificationDecisionView,
  DossierReviewView,
  PreconditionList,
  RecommendationView,
} from './CertificationDecisionViews';
import {
  blockingDecision,
  emptyManualDraft,
  manualFromDraft,
  parseBlockingDiscrepancies,
  resolutionFromDraft,
  type ConsistencyRoles,
  type ConsistencyRule,
  type ManualDraft,
  type ResolutionDraft,
} from './certification-consistency';
import { useConsistencyCopy } from './certification-consistency.copy';
import { ConsistencyRegion, ruleLabel } from './CertificationConsistency';
import {
  deadlinesFromDraft,
  draftFromDeadlines,
  draftFromExchange,
  emptyExchangeDraft,
  exchangeFromDraft,
  parseDeadlineHistory,
  parseDeadlineSet,
  parseExchangePage,
  reverificationFromDraft,
  type DeadlineDraft,
  type ExchangeDraft,
  type ReverificationDraft,
} from './certification-exchanges';
import {
  DeadlineAdministration,
  ExchangesRegion,
  type ExchangePaging,
  type ExchangeFieldFeedback,
  StepSendings,
  type DeadlineAdministrationView,
  type DeadlineFeedback,
} from './CertificationExchanges';

export interface CertificationWorkspaceProps {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string;
  onActorRevalidated?: (actor: ActorContext) => void | Promise<void>;
  onCompanyContextRejected?: (companyId: string) => void;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
}

type View<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'error' | 'denied' | 'unavailable' };
type CaseView = {
  caseDetail: CaseDetail;
  timeline: CaseTimeline;
  register: DocumentRegister;
};
/** One serialized command and its key, retried unchanged when uncertain. */
type Intent = {
  path: string;
  body: string;
  key: string;
  caseId: string | null;
};
type Feedback =
  | { status: 'idle' | 'saved' }
  | { status: 'saving' | 'uncertain'; intent: Intent }
  /** `reload`: the shown Case is outdated; saving waits for a reload. */
  | { status: 'refused'; message: CertificationMessageKey; reload: boolean }
  /**
   * The decision's unmet preconditions, as the read Case shows them before
   * sending or as the server listed them when it refused the decision.
   */
  | {
      status: 'unmet';
      source: 'case' | 'server';
      failures: DecisionPrecondition[];
      /** The blocking Discrepancies, from the read Case or as the server named them. */
      discrepancies: NamedDiscrepancy[];
    };
/** A Discrepancy a decision is refused for, by identity and rule. */
type NamedDiscrepancy = { id: string; rule: ConsistencyRule | 'manual' };
type MutationKind =
  | 'open'
  | 'application'
  | 'review'
  | 'duration'
  | 'attach'
  | 'agreement'
  | 'team'
  | 'decision'
  | 'finding'
  | 'discrepancy'
  | 'discrepancyResolution'
  | 'exchange'
  | 'reverification'
  | 'withdrawal'
  | StageKind
  | ClosingKind;
/** The closing steps, each with its own form and feedback. */
type ClosingKind =
  | 'recommendation'
  | 'dossierReview'
  | 'certificationDecision'
  | 'certificateData'
  | 'certificate'
  | 'certificateDraft'
  | 'clientOpinion'
  | 'draftApproval'
  | 'certificateRevision';
/** The Stage records, each with its own form and feedback. */
type StageKind = 'stage1Plan' | 'stage2Plan' | 'stage1Report' | 'stage2Report';
/**
 * The one Finding form open in the Case, with its draft: a new Finding of a
 * Stage, or a later version of one Finding.
 */
type FindingForm =
  | { command: 'record'; stage: AuditStage; draft: FindingDraft }
  | { command: 'correction'; findingId: string; draft: FindingCorrectionDraft }
  | {
      command: 'classification' | 'reclassification';
      findingId: string;
      draft: ClassificationDraft;
    }
  | { command: 'response'; findingId: string; draft: ResponseDraft }
  | { command: 'planJudgment'; findingId: string; draft: PlanJudgmentDraft }
  | { command: 'verification'; findingId: string; draft: VerificationDraft };
/** What the actor may record on Findings in the read Case. */
type FindingRoles = { leader: boolean; independentApprover: boolean };
/** The serialized Finding command, or why the draft is refused. */
type FindingSubmission =
  | { status: 'ready'; path: string; body: string }
  | { status: 'refused'; message: CertificationMessageKey }
  /** The actor no longer holds the role: nothing is offered or sent. */
  | { status: 'unavailable' };
/** A Workspace member the read Case names, offered as a team member link. */
type CasePerson = CertificationActorReference & { self: boolean };
/**
 * Whose authority a call needs. Reading the Case needs none of the Document
 * rights, so a refused Document call leaves the Case to the authority recheck.
 */
/**
 * Which rights a request uses: a refused Certification call retires the
 * Case; a refused Document or administration call keeps it.
 */
type Access = 'certification' | 'documents' | 'administration';
/** The eligible PDFs of one Case, read under the Document rights captured. */
type Eligible = {
  caseId: string;
  rights: string;
  view: View<EligibleDocuments>;
};
/** The download of one attachment, under the Document rights it began with. */
type Download =
  | { status: 'idle' }
  | {
      status: 'pending' | 'failed' | 'denied' | 'unavailable';
      attachmentId: string;
      rights: string;
    };
/** The download of the generated dossier register of the open Case. */
type RegisterPdf = { status: RegisterPdfDownload['status'] };
/**
 * The duration-proposal read, keyed by the serialized inputs it computed so a
 * later edit of the inputs makes it outdated instead of confirmable.
 */
type Proposal =
  | { status: 'idle' }
  | { status: 'computing'; inputs: string }
  | { status: 'ready'; inputs: string; result: DurationResult }
  | { status: 'refused'; message: CertificationMessageKey };

const IDLE: Feedback = { status: 'idle' };
const STAGE_KINDS: readonly StageKind[] = [
  'stage1Plan',
  'stage2Plan',
  'stage1Report',
  'stage2Report',
];
const CLOSING_KINDS: readonly ClosingKind[] = [
  'recommendation',
  'dossierReview',
  'certificationDecision',
  'certificateData',
  'certificate',
  'certificateDraft',
  'clientOpinion',
  'draftApproval',
  'certificateRevision',
];
const NO_PROPOSAL: Proposal = { status: 'idle' };
const NO_DOWNLOAD: Download = { status: 'idle' };
const NO_REGISTER_PDF: RegisterPdf = { status: 'idle' };
/** The register's closed language set, one per interface locale. */
const REGISTER_LANGUAGE = {
  en: 'en',
  fr: 'fr',
  ro: 'ro',
  ru: 'ru',
} as const satisfies Record<InterfaceLocale, 'en' | 'fr' | 'ro' | 'ru'>;
const PDF_SIGNATURE = '%PDF-';
const ABANDONED: ApiResult<unknown> = { status: 'error' };

/**
 * The Project's Certification Cases. Identity, Project and every captured
 * Certification grant key the owner, so a change retires drafts, retry
 * intents and late replies of the previous authority.
 */
export function CertificationWorkspace(props: CertificationWorkspaceProps) {
  const identityScope = useMemo(() => crypto.randomUUID(), [props.identity]);
  if (!certificationAuthority(props.actor).read) return null;
  const scope = JSON.stringify([
    identityScope,
    props.projectId,
    certificationContextKey(props.actor),
  ]);
  return <CertificationRegistry key={scope} scope={scope} {...props} />;
}

function CertificationRegistry(
  props: CertificationWorkspaceProps & { scope: string },
) {
  const { actor, identity, projectId } = props;
  const companyId = actor.activeCompany?.id ?? '';
  const authority = certificationAuthority(actor);
  const copy = useCertificationCopy();
  const { locale, formatDateTime, formatNumber } = useInterfaceLocale();
  const prefix = useId();
  const releaseForm = useCertificateReleaseForm();
  const callbacks = useRef(props);
  callbacks.current = props;
  const listOperation = useScopedOperation(props.scope);
  const detailOperation = useScopedOperation(props.scope);
  const entitiesOperation = useScopedOperation(props.scope);
  const mutationOperation = useScopedOperation(props.scope);
  const proposalOperation = useScopedOperation(props.scope);
  const registerOperation = useScopedOperation(props.scope);
  const deadlineOperation = useScopedOperation(props.scope);
  const exchangePageOperation = useScopedOperation(props.scope);
  const [exchangePaging, setExchangePaging] = useState<ExchangePaging>('idle');
  /**
   * The captured right to read received-source content, which reading,
   * listing and attaching the Client's PDFs need. Its change retires their
   * work without retiring the Case, which needs no Document right.
   */
  const documentRights =
    receivedAuditSourceNativeAuthority(actor)?.content ?? null;
  const documentScope = JSON.stringify([props.scope, documentRights]);
  const eligibleOperation = useScopedOperation(documentScope);
  const contentOperation = useScopedOperation(documentScope);
  const [list, setList] = useState<View<CaseList>>({ status: 'loading' });
  const [selectedId, setSelectedId] = useState<string>();
  const selected = useRef<string | undefined>(undefined);
  const [detail, setDetail] = useState<View<CaseView>>();
  const [opening, setOpening] = useState(false);
  const [entities, setEntities] = useState<View<LegalEntityOption[]>>();
  const [entityId, setEntityId] = useState('');
  const [orderReference, setOrderReference] = useState('');
  const [openFeedback, setOpenFeedback] = useState<Feedback>(IDLE);
  const [applicationDraft, setApplicationDraft] = useState(
    emptyApplicationDraft,
  );
  /** The user is editing the application (a first draft or a correction). */
  const [applicationOpen, setApplicationOpen] = useState(false);
  const [applicationFeedback, setApplicationFeedback] =
    useState<Feedback>(IDLE);
  const [reviewDraft, setReviewDraft] = useState(emptyReviewDraft);
  const [reviewFeedback, setReviewFeedback] = useState<Feedback>(IDLE);
  /** Null until edited: the panel then derives it from the read Case. */
  const [durationDraft, setDurationDraft] = useState<DurationDraft | null>(
    null,
  );
  /** The user is editing the duration (a first determination or a correction). */
  const [durationOpen, setDurationOpen] = useState(false);
  const [durationFeedback, setDurationFeedback] = useState<Feedback>(IDLE);
  const [proposal, setProposal] = useState<Proposal>(NO_PROPOSAL);
  /** The attach form is open; it reads the eligible PDFs when opened. */
  const [attaching, setAttaching] = useState(false);
  const [attachDraft, setAttachDraft] = useState(emptyAttachDraft);
  const [attachFeedback, setAttachFeedback] = useState<Feedback>(IDLE);
  const [eligible, setEligible] = useState<Eligible>();
  /** Null until edited: a first agreement starts empty. */
  const [agreementDraft, setAgreementDraft] = useState<AgreementDraft | null>(
    null,
  );
  /** The user is editing the agreement (a first record or a correction). */
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [agreementFeedback, setAgreementFeedback] = useState<Feedback>(IDLE);
  /** Null until edited: a first team starts with one empty member. */
  const [teamDraft, setTeamDraft] = useState<TeamDraft | null>(null);
  /** The user is editing a new team version. */
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamFeedback, setTeamFeedback] = useState<Feedback>(IDLE);
  const [decisionDraft, setDecisionDraft] =
    useState<DecisionDraft>(emptyDecisionDraft);
  const [decisionFeedback, setDecisionFeedback] = useState<Feedback>(IDLE);
  /**
   * Null until edited or opened for a correction: a first record then starts
   * empty. Kept through a reload, like the other drafts.
   */
  const [stage1PlanDraft, setStage1PlanDraft] = useState<StagePlanDraft | null>(
    null,
  );
  const [stage2PlanDraft, setStage2PlanDraft] = useState<StagePlanDraft | null>(
    null,
  );
  const [stage1ReportDraft, setStage1ReportDraft] =
    useState<Stage1ReportDraft | null>(null);
  const [stage2ReportDraft, setStage2ReportDraft] =
    useState<Stage2ReportDraft | null>(null);
  const [stage1PlanFeedback, setStage1PlanFeedback] = useState<Feedback>(IDLE);
  const [stage2PlanFeedback, setStage2PlanFeedback] = useState<Feedback>(IDLE);
  const [stage1ReportFeedback, setStage1ReportFeedback] =
    useState<Feedback>(IDLE);
  const [stage2ReportFeedback, setStage2ReportFeedback] =
    useState<Feedback>(IDLE);
  const stageFeedback: Record<StageKind, Feedback> = {
    stage1Plan: stage1PlanFeedback,
    stage2Plan: stage2PlanFeedback,
    stage1Report: stage1ReportFeedback,
    stage2Report: stage2ReportFeedback,
  };
  /** Null while no Finding form is open; kept through a reload. */
  const [findingForm, setFindingForm] = useState<FindingForm | null>(null);
  const [findingFeedback, setFindingFeedback] = useState<Feedback>(IDLE);
  const findingHeading = useFindingHeading();
  /**
   * Null until opened for a correction or edited: a first record then
   * starts empty. Kept through a reload, like the other drafts.
   */
  const [recommendationDraft, setRecommendationDraft] =
    useState<RecommendationDraft | null>(null);
  const [recommendationFeedback, setRecommendationFeedback] =
    useState<Feedback>(IDLE);
  const [dossierDraft, setDossierDraft] = useState<DossierReviewDraft | null>(
    null,
  );
  const [dossierFeedback, setDossierFeedback] = useState<Feedback>(IDLE);
  /**
   * Null until edited or opened for a correction: a first decision then
   * starts empty, a correction from the latest decision's values.
   */
  const [certificationDecisionDraft, setCertificationDecisionDraft] =
    useState<CertificationDecisionDraft | null>(null);
  const [certificationDecisionFeedback, setCertificationDecisionFeedback] =
    useState<Feedback>(IDLE);
  const [certificateDataDraft, setCertificateDataDraft] =
    useState<CertificateDataDraft | null>(null);
  const [certificateDataFeedback, setCertificateDataFeedback] =
    useState<Feedback>(IDLE);
  const [certificateDraft, setCertificateDraft] = useState<CertificateDraft>(
    emptyCertificateDraft,
  );
  const [certificateFeedback, setCertificateFeedback] =
    useState<Feedback>(IDLE);
  const [certificateDraftFeedback, setCertificateDraftFeedback] =
    useState<Feedback>(IDLE);
  const [clientOpinionFeedback, setClientOpinionFeedback] =
    useState<Feedback>(IDLE);
  const [draftApprovalFeedback, setDraftApprovalFeedback] =
    useState<Feedback>(IDLE);
  const [certificateRevisionFeedback, setCertificateRevisionFeedback] =
    useState<Feedback>(IDLE);
  /** The manual Discrepancy form is open; its draft is kept through a reload. */
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState<ManualDraft>(emptyManualDraft);
  const [manualFeedback, setManualFeedback] = useState<Feedback>(IDLE);
  /** The one acceptance or correction form open in the region, if any. */
  const [resolutionDraft, setResolutionDraft] =
    useState<ResolutionDraft | null>(null);
  const [resolutionFeedback, setResolutionFeedback] = useState<Feedback>(IDLE);
  /** The Exchange Record form: closed, a new record or a correction. */
  const [exchangeOpen, setExchangeOpen] = useState<{
    correcting: number | null;
  } | null>(null);
  const [exchangeDraft, setExchangeDraft] =
    useState<ExchangeDraft>(emptyExchangeDraft);
  const [exchangeFeedback, setExchangeFeedback] = useState<Feedback>(IDLE);
  const [itemOpen, setItemOpen] = useState(false);
  const [itemDraft, setItemDraft] = useState<ReverificationDraft>({
    text: '',
    source: '',
  });
  const [itemFeedback, setItemFeedback] = useState<Feedback>(IDLE);
  const [withdrawalDraft, setWithdrawalDraft] = useState<{
    itemId: string;
    reason: string;
  } | null>(null);
  const [withdrawalFeedback, setWithdrawalFeedback] = useState<Feedback>(IDLE);
  /** The Company's procedure deadline configuration, for its administrator. */
  const [deadlineView, setDeadlineView] = useState<DeadlineAdministrationView>({
    status: 'closed',
  });
  const [deadlineDraft, setDeadlineDraft] = useState<DeadlineDraft>(() =>
    draftFromDeadlines(null),
  );
  const [deadlineFeedback, setDeadlineFeedback] = useState<DeadlineFeedback>({
    status: 'idle',
  });
  const administersDeadlines = actor.workspacePermissions.includes(
    'company.assignment.manage',
  );
  const consistencyCopy = useConsistencyCopy();
  const closingFeedback: Record<ClosingKind, Feedback> = {
    recommendation: recommendationFeedback,
    dossierReview: dossierFeedback,
    certificationDecision: certificationDecisionFeedback,
    certificateData: certificateDataFeedback,
    certificate: certificateFeedback,
    certificateDraft: certificateDraftFeedback,
    clientOpinion: clientOpinionFeedback,
    draftApproval: draftApprovalFeedback,
    certificateRevision: certificateRevisionFeedback,
  };
  const [download, setDownload] = useState<Download>(NO_DOWNLOAD);
  const [registerPdf, setRegisterPdf] = useState<RegisterPdf>(NO_REGISTER_PDF);
  const mutating = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const openingTrigger = useRef<Element | null>(null);
  const busy =
    proposal.status === 'computing' ||
    [
      openFeedback,
      applicationFeedback,
      reviewFeedback,
      durationFeedback,
      attachFeedback,
      agreementFeedback,
      teamFeedback,
      decisionFeedback,
      findingFeedback,
      manualFeedback,
      resolutionFeedback,
      exchangeFeedback,
      itemFeedback,
      withdrawalFeedback,
      ...Object.values(stageFeedback),
      ...Object.values(closingFeedback),
    ].some((feedback) => feedback.status === 'saving') ||
    deadlineFeedback.status === 'saving';
  const projectPath = `/projects/${encodeURIComponent(projectId)}`;

  function feedbackSetter(kind: MutationKind) {
    switch (kind) {
      case 'open':
        return setOpenFeedback;
      case 'application':
        return setApplicationFeedback;
      case 'review':
        return setReviewFeedback;
      case 'duration':
        return setDurationFeedback;
      case 'attach':
        return setAttachFeedback;
      case 'agreement':
        return setAgreementFeedback;
      case 'team':
        return setTeamFeedback;
      case 'decision':
        return setDecisionFeedback;
      case 'finding':
        return setFindingFeedback;
      case 'discrepancy':
        return setManualFeedback;
      case 'discrepancyResolution':
        return setResolutionFeedback;
      case 'exchange':
        return setExchangeFeedback;
      case 'reverification':
        return setItemFeedback;
      case 'withdrawal':
        return setWithdrawalFeedback;
      case 'stage1Plan':
        return setStage1PlanFeedback;
      case 'stage2Plan':
        return setStage2PlanFeedback;
      case 'stage1Report':
        return setStage1ReportFeedback;
      case 'stage2Report':
        return setStage2ReportFeedback;
      case 'recommendation':
        return setRecommendationFeedback;
      case 'dossierReview':
        return setDossierFeedback;
      case 'certificationDecision':
        return setCertificationDecisionFeedback;
      case 'certificateData':
        return setCertificateDataFeedback;
      case 'certificate':
        return setCertificateFeedback;
      case 'certificateDraft':
        return setCertificateDraftFeedback;
      case 'clientOpinion':
        return setClientOpinionFeedback;
      case 'draftApproval':
        return setDraftApprovalFeedback;
      case 'certificateRevision':
        return setCertificateRevisionFeedback;
    }
    return unexpected(kind);
  }

  /** Closes a closing-step form: a first record starts empty again. */
  function resetClosingDraft(kind: ClosingKind) {
    switch (kind) {
      case 'recommendation':
        return setRecommendationDraft(null);
      case 'dossierReview':
        return setDossierDraft(null);
      case 'certificationDecision':
        return setCertificationDecisionDraft(null);
      case 'certificateData':
        return setCertificateDataDraft(null);
      case 'certificate':
        return setCertificateDraft(emptyCertificateDraft());
      case 'certificateDraft':
      case 'clientOpinion':
      case 'draftApproval':
      case 'certificateRevision':
        return releaseForm.reset(kind);
    }
    return unexpected(kind);
  }

  /** Closes a Stage form: its draft is dropped, a first record starts empty. */
  function resetStageDraft(kind: StageKind) {
    switch (kind) {
      case 'stage1Plan':
        return setStage1PlanDraft(null);
      case 'stage2Plan':
        return setStage2PlanDraft(null);
      case 'stage1Report':
        return setStage1ReportDraft(null);
      case 'stage2Report':
        return setStage2ReportDraft(null);
    }
    return unexpected(kind);
  }

  function resetDurationDraft() {
    proposalOperation.retire();
    setDurationDraft(null);
    setDurationOpen(false);
    setProposal(NO_PROPOSAL);
  }

  function resetAttachDraft() {
    eligibleOperation.retire();
    setEligible(undefined);
    setAttaching(false);
    setAttachDraft(emptyAttachDraft());
  }

  function resetAgreementDraft() {
    setAgreementDraft(null);
    setAgreementOpen(false);
  }

  function resetTeamDraft() {
    setTeamDraft(null);
    setTeamOpen(false);
  }

  function resetCaseDrafts() {
    setApplicationDraft(emptyApplicationDraft());
    setApplicationOpen(false);
    setApplicationFeedback(IDLE);
    setReviewDraft(emptyReviewDraft());
    setReviewFeedback(IDLE);
    resetDurationDraft();
    setDurationFeedback(IDLE);
    resetAttachDraft();
    setAttachFeedback(IDLE);
    resetAgreementDraft();
    setAgreementFeedback(IDLE);
    resetTeamDraft();
    setTeamFeedback(IDLE);
    setDecisionDraft(emptyDecisionDraft());
    setDecisionFeedback(IDLE);
    for (const kind of STAGE_KINDS) {
      resetStageDraft(kind);
      feedbackSetter(kind)(IDLE);
    }
    setFindingForm(null);
    setFindingFeedback(IDLE);
    setManualOpen(false);
    setManualDraft(emptyManualDraft());
    setManualFeedback(IDLE);
    setResolutionDraft(null);
    setResolutionFeedback(IDLE);
    setExchangePaging('idle');
    setExchangeOpen(null);
    setExchangeDraft(emptyExchangeDraft());
    setExchangeFeedback(IDLE);
    setItemOpen(false);
    setItemDraft({ text: '', source: '' });
    setItemFeedback(IDLE);
    setWithdrawalDraft(null);
    setWithdrawalFeedback(IDLE);
    for (const kind of CLOSING_KINDS) {
      resetClosingDraft(kind);
      feedbackSetter(kind)(IDLE);
    }
    contentOperation.retire();
    setDownload(NO_DOWNLOAD);
    registerOperation.retire();
    setRegisterPdf(NO_REGISTER_PDF);
  }

  /** Access loss retires every private value before authority is rechecked. */
  function retirePrivateState() {
    setList({ status: 'denied' });
    selected.current = undefined;
    setSelectedId(undefined);
    setDetail(undefined);
    setOpening(false);
    setEntities(undefined);
    setEntityId('');
    setOrderReference('');
    setOpenFeedback(IDLE);
    resetCaseDrafts();
    openingTrigger.current = null;
  }

  /**
   * A read, or a POST: a command carries its idempotency key; the duration
   * proposal is a read sent as a POST body and carries none.
   */
  async function query(
    slot: ScopedOperation,
    signal: AbortSignal,
    path: string,
    post?: { body: string; key?: string },
    access: Access = 'certification',
  ): Promise<ApiResult<unknown>> {
    const api = await createAuthenticatedApiClient(identity);
    if (signal.aborted) return ABANDONED;
    const result = await api.request(
      path,
      post
        ? {
            companyContextId: companyId,
            signal,
            method: 'POST',
            body: post.body,
            headers: {
              ...(post.key === undefined
                ? {}
                : { 'idempotency-key': post.key }),
              'content-type': 'application/json',
            },
          }
        : { companyContextId: companyId, signal, cache: 'no-store' },
    );
    if (signal.aborted) return ABANDONED;
    rejectAccess(slot, signal, result, access);
    return result;
  }

  /**
   * A 401 or 403 rechecks authority. A lost session or a refused Certification
   * call first retires every private value; a refused Document call keeps the
   * Case, which needs no Document right, and lets the recheck decide.
   */
  function rejectAccess(
    slot: ScopedOperation,
    signal: AbortSignal,
    result: ApiResult<unknown>,
    access: Access,
  ) {
    if (result.status !== 'unauthorized' && result.status !== 'forbidden')
      return;
    if (result.status === 'unauthorized' || access === 'certification') {
      for (const other of [
        listOperation,
        detailOperation,
        exchangePageOperation,
        entitiesOperation,
        mutationOperation,
        proposalOperation,
        registerOperation,
        eligibleOperation,
        contentOperation,
      ])
        if (other !== slot) other.retire();
      retirePrivateState();
    }
    // Settle local state first; session and actor recovery have their own owner.
    void handleAuthenticatedAccessRejection({
      result,
      identity,
      companyContextId: companyId || undefined,
      signal,
      onActorRevalidated: (next) =>
        callbacks.current.onActorRevalidated?.(next),
      onCompanyContextRejected: (id) =>
        callbacks.current.onCompanyContextRejected?.(id),
      onWorkspaceAccessRejected: () =>
        callbacks.current.onWorkspaceAccessRejected?.(),
    }).catch(() => undefined);
  }

  async function loadList() {
    const signal = listOperation.begin();
    if (!signal) return;
    setList({ status: 'loading' });
    try {
      const result = await query(
        listOperation,
        signal,
        `${projectPath}/certification-cases`,
      );
      if (signal.aborted) return;
      setList(
        result.status === 'ok'
          ? { status: 'ready', value: parseCaseList(result.value, projectId) }
          : { status: refusal(result) },
      );
    } catch {
      if (!signal.aborted) setList({ status: 'error' });
    }
  }

  useEffect(() => {
    void loadList();
    // The owner is keyed by its scope; it reads its list once per mount.
  }, []);

  useEffect(() => {
    if (detail?.status !== 'ready' || !openingTrigger.current) return;
    const trigger = openingTrigger.current;
    openingTrigger.current = null;
    if (
      heading.current &&
      !heading.current.closest('[hidden]') &&
      document.activeElement === trigger
    )
      heading.current.focus();
  }, [detail]);

  async function openCase(
    caseId: string,
    options: { reload?: boolean; trigger?: Element } = {},
  ) {
    if (mutating.current) return;
    exchangePageOperation.retire();
    setExchangePaging('idle');
    const signal = detailOperation.begin();
    if (!signal) return;
    if (selected.current !== caseId) resetCaseDrafts();
    else if (options.reload) {
      // A reload keeps drafts and an uncertain intent; it resolves refusals.
      const clear = (feedback: Feedback) =>
        feedback.status === 'refused' || feedback.status === 'unmet'
          ? IDLE
          : feedback;
      setApplicationFeedback(clear);
      setReviewFeedback(clear);
      setDurationFeedback(clear);
      setAttachFeedback(clear);
      setAgreementFeedback(clear);
      setTeamFeedback(clear);
      setDecisionFeedback(clear);
      setFindingFeedback(clear);
      setManualFeedback(clear);
      setResolutionFeedback(clear);
      setExchangeFeedback(clear);
      setItemFeedback(clear);
      setWithdrawalFeedback(clear);
      for (const kind of STAGE_KINDS) feedbackSetter(kind)(clear);
      for (const kind of CLOSING_KINDS) feedbackSetter(kind)(clear);
    }
    selected.current = caseId;
    setSelectedId(caseId);
    openingTrigger.current = options.trigger ?? null;
    setDetail({ status: 'loading' });
    const casePath = `/certification-cases/${encodeURIComponent(caseId)}`;
    try {
      const [record, history, documents] = await Promise.all([
        query(detailOperation, signal, casePath),
        query(detailOperation, signal, `${casePath}/timeline`),
        query(detailOperation, signal, `${casePath}/documents`),
      ]);
      if (signal.aborted) return;
      if (
        record.status === 'ok' &&
        history.status === 'ok' &&
        documents.status === 'ok'
      ) {
        const caseDetail = parseCaseDetail(record.value, {
          companyId,
          projectId,
          caseId,
        });
        const timeline = parseTimeline(history.value, caseId);
        const register = parseDocumentRegister(documents.value, caseId);
        if (
          !timelineMatches(caseDetail, timeline) ||
          !registerMatches(caseDetail, timeline, register)
        )
          throw new Error('The Certification Case changed during the read.');
        setDetail({
          status: 'ready',
          value: { caseDetail, timeline, register },
        });
        return;
      }
      const status = refusal(
        record.status !== 'ok'
          ? record
          : history.status !== 'ok'
            ? history
            : documents,
      );
      if (status !== 'denied') setDetail({ status });
    } catch {
      if (!signal.aborted) setDetail({ status: 'error' });
    }
  }

  function closeCase() {
    if (mutating.current) return;
    detailOperation.retire();
    exchangePageOperation.retire();
    selected.current = undefined;
    setSelectedId(undefined);
    setDetail(undefined);
    resetCaseDrafts();
  }

  async function loadEntities() {
    const signal = entitiesOperation.begin();
    if (!signal) return;
    setEntities({ status: 'loading' });
    try {
      const result = await query(
        entitiesOperation,
        signal,
        `${projectPath}/certification-legal-entities`,
      );
      if (signal.aborted) return;
      if (result.status === 'ok')
        setEntities({
          status: 'ready',
          value: parseLegalEntityOptions(result.value, projectId),
        });
      else {
        const status = refusal(result);
        if (status !== 'denied') setEntities({ status });
      }
    } catch {
      if (!signal.aborted) setEntities({ status: 'error' });
    }
  }

  async function execute(kind: MutationKind, intent: Intent) {
    if (mutating.current) return;
    const signal = mutationOperation.begin();
    if (!signal) return;
    mutating.current = true;
    const setFeedback = feedbackSetter(kind);
    setFeedback({ status: 'saving', intent });
    let confirmed: Pick<CaseDetail, 'id' | 'revision'> | undefined;
    try {
      const result = await query(
        mutationOperation,
        signal,
        intent.path,
        intent,
        // Attaching qualifies the PDF under the Document rights.
        kind === 'attach' ? 'documents' : 'certification',
      );
      if (signal.aborted) return;
      if (result.status === 'ok') {
        confirmed = parseCaseCommandReceipt(result.value, {
          companyId,
          projectId,
          caseId: intent.caseId ?? undefined,
        });
        setFeedback({ status: 'saved' });
      } else setFeedback(commandFeedback(kind, result, intent));
    } catch {
      // An unreadable or lost reply may still be recorded: retry unchanged.
      if (!signal.aborted) setFeedback({ status: 'uncertain', intent });
    } finally {
      mutating.current = false;
    }
    if (!confirmed || signal.aborted) return;
    switch (kind) {
      case 'open':
        setOpening(false);
        setEntityId('');
        setOrderReference('');
        break;
      case 'application':
        setApplicationDraft(emptyApplicationDraft());
        setApplicationOpen(false);
        break;
      case 'review':
        setReviewDraft(emptyReviewDraft());
        break;
      case 'duration':
        resetDurationDraft();
        break;
      case 'attach':
        resetAttachDraft();
        break;
      case 'agreement':
        resetAgreementDraft();
        break;
      case 'team':
        resetTeamDraft();
        break;
      case 'decision':
        setDecisionDraft(emptyDecisionDraft());
        break;
      case 'finding':
        setFindingForm(null);
        break;
      case 'discrepancy':
        setManualDraft(emptyManualDraft());
        setManualOpen(false);
        break;
      case 'discrepancyResolution':
        setResolutionDraft(null);
        break;
      case 'exchange':
        setExchangeDraft(emptyExchangeDraft());
        setExchangeOpen(null);
        break;
      case 'reverification':
        setItemDraft({ text: '', source: '' });
        setItemOpen(false);
        break;
      case 'withdrawal':
        setWithdrawalDraft(null);
        break;
      case 'stage1Plan':
      case 'stage2Plan':
      case 'stage1Report':
      case 'stage2Report':
        resetStageDraft(kind);
        break;
      case 'recommendation':
      case 'dossierReview':
      case 'certificationDecision':
      case 'certificateData':
      case 'certificate':
      case 'certificateDraft':
      case 'clientOpinion':
      case 'draftApproval':
      case 'certificateRevision':
        resetClosingDraft(kind);
        break;
      default:
        unexpected(kind);
    }
    void loadList();
    void openCase(confirmed.id, { reload: true });
  }

  /** The Client's frozen received PDFs, read under the current Document rights. */
  async function loadEligible(caseId: string) {
    if (!documentRights) return;
    const rights = documentRights;
    const signal = eligibleOperation.begin();
    if (!signal) return;
    setEligible({ caseId, rights, view: { status: 'loading' } });
    try {
      const result = await query(
        eligibleOperation,
        signal,
        `/certification-cases/${encodeURIComponent(caseId)}/eligible-documents`,
        undefined,
        'documents',
      );
      if (signal.aborted) return;
      setEligible({
        caseId,
        rights,
        view:
          result.status === 'ok'
            ? {
                status: 'ready',
                value: parseEligibleDocuments(result.value, caseId),
              }
            : { status: refusal(result) },
      });
    } catch {
      if (!signal.aborted)
        setEligible({ caseId, rights, view: { status: 'error' } });
    }
  }

  /** The eligible read of this Case under the current rights, if any. */
  function eligibleFor(caseId: string): View<EligibleDocuments> | undefined {
    return eligible?.caseId === caseId && eligible.rights === documentRights
      ? eligible.view
      : undefined;
  }

  /**
   * Saves the exact attached PDF, released only once its type, size and
   * SHA-256 match the register, under the Document rights it began with.
   */
  async function downloadAttachment(
    caseId: string,
    attachment: CertificationAttachment,
  ) {
    if (!documentRights) return;
    const rights = documentRights;
    const signal = contentOperation.begin();
    if (!signal) return;
    const settle = (status: 'failed' | 'denied' | 'unavailable') =>
      setDownload({ status, attachmentId: attachment.id, rights });
    setDownload({ status: 'pending', attachmentId: attachment.id, rights });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted) return;
      const result = await api.download(
        `/certification-cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(attachment.id)}/content`,
        {
          companyContextId: companyId,
          signal,
          cache: 'no-store',
          maximumBytes: CERTIFICATION_LIMITS.pdfBytes,
        },
      );
      if (signal.aborted) return;
      if (result.status !== 'ok') {
        rejectAccess(contentOperation, signal, result, 'documents');
        if (result.status === 'unauthorized') return;
        settle(
          result.status === 'forbidden'
            ? 'denied'
            : result.status === 'notFound'
              ? 'unavailable'
              : 'failed',
        );
        return;
      }
      const pdf = result.value;
      if (
        pdf.type.split(';')[0] !== 'application/pdf' ||
        pdf.size !== attachment.sizeBytes
      ) {
        settle('failed');
        return;
      }
      const bytes = await pdf.arrayBuffer();
      if (signal.aborted) return;
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      if (signal.aborted) return;
      if (hexadecimal(digest) !== attachment.sha256) {
        settle('failed');
        return;
      }
      const url = URL.createObjectURL(pdf);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = attachment.fileName;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      setDownload(NO_DOWNLOAD);
    } catch {
      if (!signal.aborted) settle('failed');
    }
  }

  /**
   * Saves the generated register of the Case in the interface language,
   * released only once the reply is a non-empty PDF within the server's bound.
   */
  async function downloadRegisterPdf(caseId: string) {
    const signal = registerOperation.begin();
    if (!signal) return;
    setRegisterPdf({ status: 'pending' });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted) return;
      const result = await api.download(
        `/certification-cases/${encodeURIComponent(caseId)}/register?language=${REGISTER_LANGUAGE[locale]}`,
        {
          companyContextId: companyId,
          signal,
          cache: 'no-store',
          maximumBytes: CERTIFICATION_LIMITS.registerPdfBytes,
        },
      );
      if (signal.aborted) return;
      if (result.status !== 'ok') {
        // A refused read retires the Case like any Case read.
        rejectAccess(registerOperation, signal, result, 'certification');
        if (result.status === 'unauthorized' || result.status === 'forbidden')
          return;
        setRegisterPdf({
          status: result.status === 'notFound' ? 'unavailable' : 'failed',
        });
        return;
      }
      const pdf = result.value;
      const signature = new TextDecoder().decode(
        await pdf.slice(0, PDF_SIGNATURE.length).arrayBuffer(),
      );
      if (signal.aborted) return;
      if (
        pdf.type.split(';')[0] !== 'application/pdf' ||
        signature !== PDF_SIGNATURE
      ) {
        setRegisterPdf({ status: 'failed' });
        return;
      }
      const url = URL.createObjectURL(pdf);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        // The server's name for the register of this Case.
        anchor.download = `certification-case-register-${caseId.slice(0, 8)}.pdf`;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      setRegisterPdf(NO_REGISTER_PDF);
    } catch {
      if (!signal.aborted) setRegisterPdf({ status: 'failed' });
    }
  }

  function submitAttach(event: FormEvent) {
    event.preventDefault();
    if (
      busy ||
      !authority.manage ||
      !documentRights ||
      detail?.status !== 'ready' ||
      blockedUntilReload(attachFeedback)
    )
      return;
    const { caseDetail: current, register } = detail.value;
    const listed = eligibleFor(current.id);
    const input =
      listed?.status === 'ready'
        ? attachFromDraft(attachDraft, {
            eligible: listed.value.items,
            register: register.items,
          })
        : undefined;
    if (!input) {
      setAttachFeedback(refusedWith('attachValidation'));
      return;
    }
    const body = JSON.stringify({
      expectedRevision: current.revision,
      role: input.role,
      documentId: input.documentId,
      versionId: input.versionId,
      representationId: input.representationId,
      ...(input.note === null ? {} : { note: input.note }),
    });
    void execute(
      'attach',
      reuse(attachFeedback, {
        path: `/certification-cases/${encodeURIComponent(current.id)}/documents`,
        body,
        caseId: current.id,
      }),
    );
  }

  function submitAgreement(event: FormEvent) {
    event.preventDefault();
    if (
      busy ||
      !authority.manage ||
      detail?.status !== 'ready' ||
      blockedUntilReload(agreementFeedback)
    )
      return;
    const { caseDetail: current, register } = detail.value;
    const check = agreementFromDraft(
      agreementDraft ?? agreementDraftFor(null),
      {
        register: register.items,
        correcting: current.agreement !== null,
        today: latestBusinessDate(),
      },
    );
    if (check.status !== 'valid') {
      setAgreementFeedback(refusedWith(agreementMessage(check)));
      return;
    }
    const body = JSON.stringify({
      expectedRevision: current.revision,
      ...(check.reason === null ? {} : { reason: check.reason }),
      signedOn: check.agreement.signedOn,
      attachmentId: check.agreement.attachmentId,
    });
    void execute(
      'agreement',
      reuse(agreementFeedback, {
        path: `/certification-cases/${encodeURIComponent(current.id)}/agreement`,
        body,
        caseId: current.id,
      }),
    );
  }

  function submitTeam(event: FormEvent) {
    event.preventDefault();
    if (
      busy ||
      !authority.manage ||
      detail?.status !== 'ready' ||
      blockedUntilReload(teamFeedback)
    )
      return;
    const current = detail.value.caseDetail;
    const check = teamFromDraft(teamDraft ?? teamDraftFor(null), {
      correcting: current.team !== null,
      linkable: new Set(
        linkOptions(detail.value).map((option) => option.value),
      ),
      consultantDeclared: declaredConsultant(current) !== null,
      register: detail.value.register.items,
    });
    if (check.status !== 'valid') {
      setTeamFeedback(refusedWith(teamMessage(check)));
      return;
    }
    const analysis = check.team.impartialityAnalysis;
    const body = JSON.stringify({
      expectedRevision: current.revision,
      ...(check.reason === null ? {} : { reason: check.reason }),
      members: check.team.members,
      ...(analysis === null ? {} : { impartialityAnalysis: analysis }),
    });
    void execute(
      'team',
      reuse(teamFeedback, {
        path: `/certification-cases/${encodeURIComponent(current.id)}/team`,
        body,
        caseId: current.id,
      }),
    );
  }

  function submitDecision(event: FormEvent) {
    event.preventDefault();
    if (
      busy ||
      !authority.approve ||
      detail?.status !== 'ready' ||
      blockedUntilReload(decisionFeedback)
    )
      return;
    const { caseDetail: current, timeline, register } = detail.value;
    const team = current.team;
    if (!team || current.nextStep !== 'team_decision') return;
    const check = decisionFromDraft(decisionDraft, {
      team: team.value,
      timeline,
      register: register.items,
    });
    if (check.status !== 'valid') {
      setDecisionFeedback(refusedWith(teamDecisionMessage(check.status)));
      return;
    }
    const body = JSON.stringify({
      expectedRevision: current.revision,
      teamVersion: team.version,
      decision: check.decision,
      ...(check.decision === 'returned' ? { reason: check.reason } : {}),
      ...(check.onBehalf === null ? {} : { onBehalf: check.onBehalf }),
      independenceAttested: true,
    });
    void execute(
      'decision',
      reuse(decisionFeedback, {
        path: `/certification-cases/${encodeURIComponent(current.id)}/team-decision`,
        body,
        caseId: current.id,
      }),
    );
  }

  /** The draft of a Stage plan, null until edited or opened. */
  function planDraftOf(stage: AuditStage): StagePlanDraft | null {
    return stage === 'stage_1' ? stage1PlanDraft : stage2PlanDraft;
  }

  function setPlanDraft(stage: AuditStage, draft: StagePlanDraft) {
    if (stage === 'stage_1') setStage1PlanDraft(draft);
    else setStage2PlanDraft(draft);
  }

  /** The programme manager plans a Stage; the server rechecks every rule. */
  function submitStagePlan(stage: AuditStage, event: FormEvent) {
    event.preventDefault();
    const kind = planKind(stage);
    const feedback = stageFeedback[kind];
    if (
      busy ||
      !authority.manage ||
      detail?.status !== 'ready' ||
      blockedUntilReload(feedback)
    )
      return;
    const { caseDetail: current, register } = detail.value;
    const duration = current.duration;
    if (!duration || planBlocked(current, stage) !== null) return;
    const recorded = stagePlanOf(current, stage);
    const check = stagePlanFromDraft(
      planDraftOf(stage) ?? stagePlanDraftFor(null),
      {
        register: register.items,
        confirmedOnSite: confirmedOnSite(duration.value.confirmed, stage),
        startsAfter:
          stage === 'stage_2'
            ? (current.stage1Report?.value.reportDate ?? null)
            : null,
        correcting: recorded !== null,
      },
    );
    if (check.status !== 'valid') {
      feedbackSetter(kind)(refusedWith(planMessage(check)));
      return;
    }
    const body = JSON.stringify({
      expectedRevision: current.revision,
      ...(check.reason === null ? {} : { reason: check.reason }),
      ...check.plan,
    });
    void execute(
      kind,
      reuse(feedback, {
        path: stagePath(current.id, stage, 'plan'),
        body,
        caseId: current.id,
      }),
    );
  }

  /** The leader of the approved team reports a Stage; the server rechecks. */
  function submitStageReport(stage: AuditStage, event: FormEvent) {
    event.preventDefault();
    const kind = reportKind(stage);
    const feedback = stageFeedback[kind];
    if (
      busy ||
      !authority.audit ||
      detail?.status !== 'ready' ||
      blockedUntilReload(feedback)
    )
      return;
    const { caseDetail: current, register } = detail.value;
    const plan = stagePlanOf(current, stage);
    const team = approvedTeam(current);
    if (!plan || !team || !leadsTeam(team, actor.workspaceMembershipId)) return;
    const context = {
      register: register.items,
      planStart: plan.value.startDate,
    };
    const check =
      stage === 'stage_1'
        ? stage1ReportFromDraft(
            stage1ReportDraft ?? stage1ReportDraftFor(null),
            { ...context, correcting: current.stage1Report !== null },
          )
        : stage2ReportFromDraft(
            stage2ReportDraft ?? stage2ReportDraftFor(null),
            { ...context, correcting: current.stage2Report !== null },
          );
    if (check.status !== 'valid') {
      feedbackSetter(kind)(refusedWith(reportMessage(check, stage)));
      return;
    }
    const body = JSON.stringify({
      expectedRevision: current.revision,
      ...(check.reason === null ? {} : { reason: check.reason }),
      ...check.report,
    });
    void execute(
      kind,
      reuse(feedback, {
        path: stagePath(current.id, stage, 'report'),
        body,
        caseId: current.id,
      }),
    );
  }

  /**
   * What this actor may record on Findings, as the server checks it: the
   * auditor linked to the approved team's leader, or an approver linked to
   * no member of any team version.
   */
  function findingRoles(view: CaseView): FindingRoles {
    const current = view.caseDetail;
    const team = approvedTeam(current);
    const open = current.status === 'open';
    return {
      leader:
        open &&
        authority.audit &&
        team !== undefined &&
        leadsTeam(team, actor.workspaceMembershipId),
      independentApprover:
        open &&
        authority.approve &&
        !linkedToAnyTeamVersion(view.timeline, actor.workspaceMembershipId),
    };
  }

  /** Records the open Finding form; the server rechecks every rule. */
  function submitFinding(event: FormEvent) {
    event.preventDefault();
    if (
      busy ||
      !findingForm ||
      detail?.status !== 'ready' ||
      blockedUntilReload(findingFeedback)
    )
      return;
    const view = detail.value;
    const submission = findingSubmission(findingForm, view, findingRoles(view));
    switch (submission.status) {
      case 'unavailable':
        return;
      case 'refused':
        setFindingFeedback(refusedWith(submission.message));
        return;
      case 'ready':
        void execute(
          'finding',
          reuse(findingFeedback, {
            path: submission.path,
            body: submission.body,
            caseId: view.caseDetail.id,
          }),
        );
        return;
    }
    unexpected(submission);
  }

  function openFindingForm(finding: Finding, command: FindingCommand) {
    const findingId = finding.id;
    switch (command) {
      case 'correction':
        setFindingForm({
          command,
          findingId,
          draft: correctionDraftFor(finding.statement),
        });
        break;
      case 'classification':
      case 'reclassification':
        setFindingForm({
          command,
          findingId,
          draft: emptyClassificationDraft(),
        });
        break;
      case 'response':
        setFindingForm({ command, findingId, draft: emptyResponseDraft() });
        break;
      case 'planJudgment':
        setFindingForm({ command, findingId, draft: emptyPlanJudgmentDraft() });
        break;
      case 'verification':
        setFindingForm({ command, findingId, draft: emptyVerificationDraft() });
        break;
      default:
        unexpected(command);
    }
    setFindingFeedback(IDLE);
  }

  /** Keeps an edited Finding draft; an edit clears a refusal it may answer. */
  function editFindingForm(next: FindingForm) {
    setFindingForm(next);
    if (
      findingFeedback.status === 'saved' ||
      (findingFeedback.status === 'refused' && !findingFeedback.reload)
    )
      setFindingFeedback(IDLE);
  }

  function closeFindingForm() {
    setFindingForm(null);
    setFindingFeedback(IDLE);
  }

  /** Sends one closing-step command for the read Case, reusing an uncertain key. */
  function sendClosing(
    kind: ClosingKind,
    current: CaseDetail,
    path: string,
    body: object,
  ) {
    void execute(
      kind,
      reuse(closingFeedback[kind], {
        path: `/certification-cases/${encodeURIComponent(current.id)}/${path}`,
        body: JSON.stringify({ expectedRevision: current.revision, ...body }),
        caseId: current.id,
      }),
    );
  }

  /** The view of the read Case while a closing-step command may be sent. */
  function closingView(kind: ClosingKind): CaseView | undefined {
    return !busy &&
      detail?.status === 'ready' &&
      !blockedUntilReload(closingFeedback[kind])
      ? detail.value
      : undefined;
  }

  /** The leader of the approved team recommends until the decision. */
  function submitRecommendation(event: FormEvent) {
    event.preventDefault();
    const view = closingView('recommendation');
    if (!view || !recommendationOffered(view)) return;
    const recorded = view.caseDetail.recommendation;
    const check = recommendationFromDraft(
      recommendationDraft ?? recommendationDraftFor(null),
      recorded !== null,
    );
    if (check.status !== 'valid') {
      setRecommendationFeedback(
        refusedWith(
          check.status === 'reasonRequired'
            ? 'reasonRequired'
            : 'recommendationValidation',
        ),
      );
      return;
    }
    sendClosing('recommendation', view.caseDetail, 'recommendation', {
      ...(check.reason === null ? {} : { reason: check.reason }),
      ...check.value,
    });
  }

  /** An approver outside the team reviews the dossier until the decision. */
  function submitDossierReview(event: FormEvent) {
    event.preventDefault();
    const view = closingView('dossierReview');
    if (!view || !undecidedApprover(view)) return;
    const current = view.caseDetail;
    if (!current.recommendation) return;
    const check = dossierReviewFromDraft(
      dossierDraft ?? dossierReviewDraftFor(null),
      {
        correcting: current.dossierReview !== null,
        register: view.register.items,
        timeline: view.timeline,
      },
    );
    if (check.status !== 'valid') {
      setDossierFeedback(refusedWith(dossierReviewMessage(check.status)));
      return;
    }
    sendClosing('dossierReview', current, 'dossier-review', {
      ...(check.reason === null ? {} : { reason: check.reason }),
      ...check.value,
    });
  }

  /**
   * An approver outside the team records the decision, or corrects its
   * texts and references while the Case is open, after the draft is
   * complete and attested and the read Case meets every precondition the
   * web can mirror; the server rechecks them all and keeps the outcome.
   */
  function submitCertificationDecision(event: FormEvent) {
    event.preventDefault();
    const view = closingView('certificationDecision');
    if (!view || !decisionOffered(view)) return;
    const recorded = view.caseDetail.decision;
    if (recorded && !certificationDecisionDraft) return;
    const check = certificationDecisionFromDraft(
      certificationDecisionDraft ??
        emptyCertificationDecisionDraft(
          view.caseDetail.certificateData?.value ?? null,
        ),
      {
        register: view.register.items,
        correcting: recorded?.value.decision ?? null,
        frozen:
          view.caseDetail.status === 'certified' ? recorded?.value : undefined,
      },
    );
    if (check.status !== 'valid') {
      setCertificationDecisionFeedback(
        refusedWith(
          check.status === 'attestation'
            ? 'decisionAttestationRequired'
            : check.status === 'reasonRequired'
              ? 'reasonRequired'
              : 'certificationDecisionValidation',
        ),
      );
      return;
    }
    const failures = decisionPreconditions(
      view.caseDetail,
      check.value.decision,
    );
    if (failures.length > 0) {
      setCertificationDecisionFeedback({
        status: 'unmet',
        source: 'case',
        failures,
        discrepancies: blockingDecision(view.caseDetail.consistency).map(
          (entry) => ({ id: entry.id, rule: entry.rule ?? 'manual' }),
        ),
      });
      return;
    }
    sendClosing('certificationDecision', view.caseDetail, 'decision', {
      ...(check.reason === null ? {} : { reason: check.reason }),
      ...check.value,
    });
  }

  /** A programme manager agrees the Certificate data while the Case is open. */
  function submitCertificateData(event: FormEvent) {
    event.preventDefault();
    const view = closingView('certificateData');
    const current = view?.caseDetail;
    if (
      !view ||
      !current ||
      !authority.manage ||
      (current.status !== 'open' && current.status !== 'certified') ||
      !current.stage2Report
    )
      return;
    const check = certificateDataFromDraft(
      certificateDataDraft ?? certificateDataDraftFor(null),
      {
        register: view.register.items,
        correcting: current.certificateData !== null,
      },
    );
    if (check.status !== 'valid') {
      setCertificateDataFeedback(
        refusedWith(
          check.status === 'reasonRequired'
            ? 'reasonRequired'
            : 'certificateDataValidation',
        ),
      );
      return;
    }
    sendClosing('certificateData', current, 'certificate-data', {
      ...(check.reason === null ? {} : { reason: check.reason }),
      ...check.value,
    });
  }

  /** An approver outside the team records the Certificate of a grant. */
  function submitCertificate(event: FormEvent) {
    event.preventDefault();
    const view = closingView('certificate');
    if (!view || certificateHold(view) !== null) return;
    const check = certificateFromDraft(
      {
        ...certificateDraft,
        number: view.caseDetail.release.drafts.at(-1)?.value.number ?? '',
      },
      view.register.items,
    );
    if (check.status !== 'valid') {
      setCertificateFeedback(
        refusedWith(
          check.status === 'attestation'
            ? 'certificateAttestationRequired'
            : 'certificateValidation',
        ),
      );
      return;
    }
    sendClosing('certificate', view.caseDetail, 'certificate', {
      ...check.value,
      independenceAttested: true,
    });
  }

  /**
   * The server's rule: the leader of the approved team recommends once
   * Stage 2 is reported and no Finding holds the Case, until the decision.
   */
  function recommendationOffered(view: CaseView): boolean {
    const current = view.caseDetail;
    return (
      findingRoles(view).leader &&
      current.stage2Report !== null &&
      current.decision === null &&
      !current.findings.some(findingBlocks)
    );
  }

  /** An approver linked to no team version, while the Case is undecided. */
  function undecidedApprover(view: CaseView): boolean {
    return (
      findingRoles(view).independentApprover &&
      view.caseDetail.decision === null
    );
  }

  /**
   * An approver linked to no team version records the decision, or corrects
   * its permitted fields. Issuance restricts corrections to granted texts.
   */
  function decisionOffered(view: CaseView): boolean {
    return (
      (view.caseDetail.status === 'open' ||
        view.caseDetail.status === 'refused' ||
        view.caseDetail.status === 'certified') &&
      authority.approve &&
      !linkedToAnyTeamVersion(view.timeline, actor.workspaceMembershipId)
    );
  }

  /**
   * Why this actor cannot record the Certificate now, in the server's
   * order, or null: an approver outside the team, a granting decision, the
   * agreed data stating exactly what it grants, and a Certificate PDF.
   */
  function certificateHold(view: CaseView): CertificationMessageKey | null {
    const current = view.caseDetail;
    const decided = current.decision?.value;
    if (current.status !== 'open' || decided?.decision !== 'granted')
      return 'blockedCertificateNotGranted';
    if (!authority.approve) return 'certificateAwaitingApprover';
    if (!findingRoles(view).independentApprover)
      return 'certificateApproverIndependence';
    const data = current.certificateData;
    if (!data) return 'blockedCertificateDataMissing';
    if (
      certificateTextDifferences(decided.grantedTexts, data.value.texts).length
    )
      return 'blockedCertificateDataDiffers';
    if (current.release.issuanceBlockers.length > 0)
      return 'blockedCertificateApprovalMissing';
    if (attachmentsWithRole(view.register.items, 'certificate').length === 0)
      return 'certificateNoPdf';
    return null;
  }

  /** Keeps an edited closing-step draft; an edit clears a refusal it may answer. */
  function edited(kind: ClosingKind) {
    const feedback = closingFeedback[kind];
    if (
      feedback.status === 'saved' ||
      feedback.status === 'unmet' ||
      (feedback.status === 'refused' && !feedback.reload)
    )
      feedbackSetter(kind)(IDLE);
  }

  /** The exact attachments open through the register's download, if allowed. */
  function registerDownload(view: CaseView): RegisterDownload | undefined {
    return documentRights
      ? {
          pendingId:
            download.status === 'pending' && download.rights === documentRights
              ? download.attachmentId
              : undefined,
          disabled: busy,
          onDownload: (attachment) =>
            void downloadAttachment(view.caseDetail.id, attachment),
        }
      : undefined;
  }

  /**
   * The Workspace members the read Case names, the actor first. No member
   * directory is readable under the Certification grants, so a team member
   * can be linked only to a person the Case already shows.
   */
  function casePeople(view: CaseView): CasePerson[] {
    const named = new Map<string, string>();
    const add = (reference: CertificationActorReference) => {
      if (!named.has(reference.workspaceMembershipId))
        named.set(reference.workspaceMembershipId, reference.displayName);
    };
    add(view.caseDetail.openedBy);
    for (const entry of view.timeline.entries) add(entry.recordedBy);
    for (const item of view.register.items) add(item.attachedBy);
    for (const finding of view.caseDetail.findings)
      for (const record of finding.records) add(record.recordedBy);
    named.delete(actor.workspaceMembershipId);
    return [
      {
        workspaceMembershipId: actor.workspaceMembershipId,
        displayName: actor.displayName,
        self: true,
      },
      ...[...named]
        .map(([workspaceMembershipId, displayName]) => ({
          workspaceMembershipId,
          displayName,
          self: false,
        }))
        .sort((left, right) =>
          left.displayName.localeCompare(right.displayName),
        ),
    ];
  }

  function knownPeople(view: CaseView): KnownPeople {
    return new Map(
      casePeople(view).map((person) => [
        person.workspaceMembershipId,
        person.displayName,
      ]),
    );
  }

  /**
   * The links a team member may carry: the people the Case names, and any
   * link the latest team keeps so that a new version can preserve it.
   */
  function linkOptions(view: CaseView): { value: string; label: string }[] {
    const people = casePeople(view).map((person) => ({
      value: person.workspaceMembershipId,
      label: person.self
        ? formatMessage(copy('teamMemberYou'), { name: person.displayName })
        : person.displayName,
    }));
    const known = new Set(people.map((option) => option.value));
    const kept = (view.caseDetail.team?.value.members ?? []).flatMap(
      (member) =>
        member.workspaceMembershipId === null ||
        known.has(member.workspaceMembershipId)
          ? []
          : [
              {
                value: member.workspaceMembershipId,
                label: `${copy('teamMemberLinkedUnknown')} — ${member.name}`,
              },
            ],
    );
    return [...people, ...kept];
  }

  function submitOpen(event: FormEvent) {
    event.preventDefault();
    if (busy || !authority.manage) return;
    const reference = orderReference.trim();
    if (
      entities?.status !== 'ready' ||
      !entities.value.some((entity) => entity.id === entityId) ||
      !reference ||
      reference.length > CERTIFICATION_LIMITS.orderReference
    ) {
      setOpenFeedback(refusedWith('openValidation'));
      return;
    }
    const path = `${projectPath}/certification-cases`;
    const body = JSON.stringify({
      clientLegalEntityId: entityId,
      orderReference: reference,
    });
    void execute('open', reuse(openFeedback, { path, body, caseId: null }));
  }

  function submitApplication(event: FormEvent) {
    event.preventDefault();
    if (
      busy ||
      !authority.manage ||
      detail?.status !== 'ready' ||
      blockedUntilReload(applicationFeedback)
    )
      return;
    const current = detail.value.caseDetail;
    const facts = factsFromDraft(applicationDraft);
    if (!facts) {
      setApplicationFeedback(refusedWith('applicationValidation'));
      return;
    }
    const correcting = current.application !== null;
    const reason = correctionReason(applicationDraft);
    if (correcting && reason === undefined) {
      setApplicationFeedback(refusedWith('reasonRequired'));
      return;
    }
    const body = JSON.stringify(
      correcting
        ? { expectedRevision: current.revision, reason, facts }
        : { expectedRevision: current.revision, facts },
    );
    void execute(
      'application',
      reuse(applicationFeedback, {
        path: `/certification-cases/${encodeURIComponent(current.id)}/application`,
        body,
        caseId: current.id,
      }),
    );
  }

  function submitReview(event: FormEvent) {
    event.preventDefault();
    if (
      busy ||
      !authority.manage ||
      detail?.status !== 'ready' ||
      blockedUntilReload(reviewFeedback)
    )
      return;
    const { caseDetail: current, register } = detail.value;
    const check = reviewFromDraft(reviewDraft, register.items);
    if (check.status !== 'valid') {
      // Mirrors the server: never send an acceptance with a "no" answer.
      setReviewFeedback(
        refusedWith(
          check.status === 'criteriaNotMet'
            ? 'criteriaNotMet'
            : check.status === 'acting'
              ? 'actingValidation'
              : 'reviewValidation',
        ),
      );
      return;
    }
    const { review } = check;
    const body = JSON.stringify({
      expectedRevision: current.revision,
      criteria: review.criteria,
      outcome: review.outcome,
      ...(review.outcome === 'rejected'
        ? { rejectionReason: review.rejectionReason }
        : {}),
      ...(review.onBehalf === null ? {} : { onBehalf: review.onBehalf }),
    });
    void execute(
      'review',
      reuse(reviewFeedback, {
        path: `/certification-cases/${encodeURIComponent(current.id)}/application-review`,
        body,
        caseId: current.id,
      }),
    );
  }

  /** The duration draft being edited, or the one the read Case starts from. */
  function currentDurationDraft(current: CaseDetail): DurationDraft | null {
    if (durationDraft) return durationDraft;
    const application = current.application;
    return application
      ? durationDraftFor({
          facts: application.value,
          current: current.duration?.value ?? null,
        })
      : null;
  }

  /** A read: the server computes the proposal for the inputs as typed. */
  async function computeProposal(event: FormEvent) {
    event.preventDefault();
    if (busy || !authority.manage || detail?.status !== 'ready') return;
    const current = detail.value.caseDetail;
    const draft = currentDurationDraft(current);
    if (!current.application || !draft) return;
    const check = durationInputsFromDraft(draft, current.application.value);
    if (check.status !== 'valid') {
      setProposal({
        status: 'refused',
        message:
          check.status === 'studiesMismatch'
            ? 'haccpStudiesMismatch'
            : 'durationInputsValidation',
      });
      return;
    }
    const signal = proposalOperation.begin();
    if (!signal) return;
    const body = JSON.stringify(check.inputs);
    setProposal({ status: 'computing', inputs: body });
    try {
      const result = await query(
        proposalOperation,
        signal,
        `/certification-cases/${encodeURIComponent(current.id)}/duration-proposal`,
        { body },
      );
      if (signal.aborted) return;
      if (result.status !== 'ok') {
        setProposal({ status: 'refused', message: proposalRefusal(result) });
        return;
      }
      const computed = parseDurationResult(result.value);
      setProposal({ status: 'ready', inputs: body, result: computed });
      setDurationOpen(true);
      // A new proposal restarts the confirmation from its rounded values.
      setDurationDraft(
        computed.kind === 'proposal'
          ? { ...draft, confirmed: proposedConfirmation(computed.proposal) }
          : draft,
      );
    } catch {
      if (!signal.aborted)
        setProposal({ status: 'refused', message: 'proposalUnavailable' });
    }
  }

  function submitDuration(event: FormEvent) {
    event.preventDefault();
    if (
      busy ||
      !authority.manage ||
      detail?.status !== 'ready' ||
      blockedUntilReload(durationFeedback)
    )
      return;
    const current = detail.value.caseDetail;
    const draft = currentDurationDraft(current);
    if (!current.application || !draft) return;
    const check = durationInputsFromDraft(draft, current.application.value);
    if (
      check.status !== 'valid' ||
      proposal.status !== 'ready' ||
      proposal.inputs !== JSON.stringify(check.inputs) ||
      proposal.result.kind === 'refused'
    ) {
      setDurationFeedback(refusedWith('proposalOutdated'));
      return;
    }
    const correcting = current.duration !== null;
    const confirmation = confirmationFromDraft(draft, {
      inputs: check.inputs,
      computation: proposal.result,
      correcting,
      documents: detail.value.register.items,
    });
    if (confirmation.status !== 'valid') {
      setDurationFeedback(refusedWith(confirmationMessage(confirmation)));
      return;
    }
    const body = JSON.stringify({
      expectedRevision: current.revision,
      ...(correcting ? { reason: confirmation.reason } : {}),
      inputs: check.inputs,
      confirmed: confirmation.confirmed,
      ...(confirmation.justification === null
        ? {}
        : { justification: confirmation.justification }),
      ...(confirmation.onBehalf === null
        ? {}
        : { onBehalf: confirmation.onBehalf }),
    });
    void execute(
      'duration',
      reuse(durationFeedback, {
        path: `/certification-cases/${encodeURIComponent(current.id)}/duration`,
        body,
        caseId: current.id,
      }),
    );
  }

  /** Who may record or resolve Discrepancies on the read Case. */
  function consistencyRoles(view: CaseView): ConsistencyRoles {
    const linked = linkedToAnyTeamVersion(
      view.timeline,
      actor.workspaceMembershipId,
    );
    return {
      manager: authority.manage,
      independentApprover: authority.approve && !linked,
      auditorOnTeam: authority.audit && linked,
    };
  }

  /** Records a manual Discrepancy; the server rechecks every rule. */
  function submitManual(event: FormEvent) {
    event.preventDefault();
    if (
      busy ||
      detail?.status !== 'ready' ||
      blockedUntilReload(manualFeedback)
    )
      return;
    const { caseDetail: current, register } = detail.value;
    if (current.status !== 'open') return;
    const check = manualFromDraft(manualDraft, register.items);
    if (check.status !== 'valid') {
      setManualFeedback(refusedWith('discrepancyValidation'));
      return;
    }
    void execute(
      'discrepancy',
      reuse(manualFeedback, {
        path: `/certification-cases/${encodeURIComponent(current.id)}/discrepancies`,
        body: JSON.stringify({
          expectedRevision: current.revision,
          ...check.body,
        }),
        caseId: current.id,
      }),
    );
  }

  /** Accepts a Discrepancy, or closes a manual one as corrected. */
  function submitResolution(event: FormEvent) {
    event.preventDefault();
    if (
      busy ||
      detail?.status !== 'ready' ||
      resolutionDraft === null ||
      blockedUntilReload(resolutionFeedback)
    )
      return;
    const { caseDetail: current, register, timeline } = detail.value;
    const check = resolutionFromDraft(resolutionDraft, {
      attachments: register.items,
      versions: timeline.entries,
    });
    if (check.status !== 'valid') {
      setResolutionFeedback(
        refusedWith(
          check.status === 'reasonRequired'
            ? 'discrepancyReasonRequired'
            : 'discrepancyCorrectionRequired',
        ),
      );
      return;
    }
    void execute(
      'discrepancyResolution',
      reuse(resolutionFeedback, {
        path: `/certification-cases/${encodeURIComponent(current.id)}/discrepancy-resolutions`,
        body: JSON.stringify({
          expectedRevision: current.revision,
          ...check.body,
        }),
        caseId: current.id,
      }),
    );
  }

  /** The Discrepancies a decision is refused for, each by its rule or subject. */
  function namedDiscrepancies(named: readonly NamedDiscrepancy[]) {
    if (named.length === 0) return null;
    const open =
      detail?.status === 'ready'
        ? detail.value.caseDetail.consistency.open
        : [];
    return (
      <ul aria-label={consistencyCopy('openTitle')}>
        {named.map((entry) => {
          const read = open.find((view) => view.id === entry.id);
          return (
            <li key={entry.id}>
              {entry.rule === 'manual'
                ? read?.origin === 'manual'
                  ? formatMessage(consistencyCopy('manualHeading'), {
                      sequence: read.sequence,
                      subject: read.subject,
                    })
                  : consistencyCopy('manualFormTitle')
                : `${entry.rule} — ${consistencyCopy(ruleLabel(entry.rule))}`}
            </li>
          );
        })}
      </ul>
    );
  }

  /** The Dossier consistency region of the read Case. */
  function consistencySection(view: CaseView) {
    const roles = consistencyRoles(view);
    const formState = <Draft,>(
      kind: 'discrepancy' | 'discrepancyResolution',
      feedback: Feedback,
      draft: Draft,
    ) => ({
      draft,
      feedback: feedbackMessage(kind, feedback),
      saving: feedback.status === 'saving',
      describedBy: describedFeedback(kind, feedback),
    });
    const clearRefusal = (
      feedback: Feedback,
      set: (next: Feedback) => void,
    ) => {
      if (
        feedback.status === 'saved' ||
        (feedback.status === 'refused' && !feedback.reload)
      )
        set(IDLE);
    };
    return (
      <ConsistencyRegion
        prefix={prefix}
        detail={view.caseDetail}
        register={view.register}
        timeline={view.timeline}
        roles={roles}
        busy={busy}
        manual={{
          ...formState('discrepancy', manualFeedback, manualDraft),
          open: manualOpen,
        }}
        onManualOpen={(open) => {
          setManualOpen(open);
          if (!open) setManualDraft(emptyManualDraft());
          setManualFeedback(IDLE);
        }}
        onManualDraft={(draft) => {
          setManualDraft(draft);
          clearRefusal(manualFeedback, setManualFeedback);
        }}
        onManualSubmit={submitManual}
        resolution={formState(
          'discrepancyResolution',
          resolutionFeedback,
          resolutionDraft,
        )}
        onResolutionDraft={(draft) => {
          const reopened =
            draft === null ||
            draft.discrepancyId !== resolutionDraft?.discrepancyId ||
            draft.resolution !== resolutionDraft.resolution;
          setResolutionDraft(draft);
          if (reopened) setResolutionFeedback(IDLE);
          else clearRefusal(resolutionFeedback, setResolutionFeedback);
        }}
        onResolutionSubmit={submitResolution}
      />
    );
  }

  /** Records an Exchange Record, or corrects one with a reason. */
  function submitExchange(event: FormEvent) {
    event.preventDefault();
    if (
      busy ||
      detail?.status !== 'ready' ||
      exchangeOpen === null ||
      blockedUntilReload(exchangeFeedback)
    )
      return;
    const { caseDetail: current, register } = detail.value;
    const correcting = exchangeOpen.correcting;
    const check = exchangeFromDraft(exchangeDraft, {
      attachments: register.items,
      correcting: correcting !== null,
    });
    if (check.status !== 'valid') {
      setExchangeFeedback(
        refusedWith(
          check.status === 'noteRequired'
            ? 'exchangeNoteRequired'
            : check.status === 'reasonRequired'
              ? 'exchangeReasonRequired'
              : 'exchangeValidation',
        ),
      );
      return;
    }
    const base = `/certification-cases/${encodeURIComponent(current.id)}/exchanges`;
    void execute(
      'exchange',
      reuse(exchangeFeedback, {
        path: correcting === null ? base : `${base}/${String(correcting)}`,
        body: JSON.stringify({
          expectedRevision: current.revision,
          ...check.body,
        }),
        caseId: current.id,
      }),
    );
  }

  /** Adds a manual Re-verification Item. */
  function submitItem(event: FormEvent) {
    event.preventDefault();
    if (busy || detail?.status !== 'ready' || blockedUntilReload(itemFeedback))
      return;
    const current = detail.value.caseDetail;
    const check = reverificationFromDraft(itemDraft);
    if (check.status !== 'valid') {
      setItemFeedback(refusedWith('reverificationValidation'));
      return;
    }
    void execute(
      'reverification',
      reuse(itemFeedback, {
        path: `/certification-cases/${encodeURIComponent(current.id)}/reverification-items`,
        body: JSON.stringify({
          expectedRevision: current.revision,
          ...check.body,
        }),
        caseId: current.id,
      }),
    );
  }

  /** Withdraws a manual Re-verification Item with its reason. */
  function submitWithdrawal(event: FormEvent) {
    event.preventDefault();
    if (
      busy ||
      detail?.status !== 'ready' ||
      withdrawalDraft === null ||
      blockedUntilReload(withdrawalFeedback)
    )
      return;
    const current = detail.value.caseDetail;
    if (!withdrawalDraft.reason.trim()) {
      setWithdrawalFeedback(refusedWith('withdrawalReasonRequired'));
      return;
    }
    void execute(
      'withdrawal',
      reuse(withdrawalFeedback, {
        path: `/certification-cases/${encodeURIComponent(current.id)}/reverification-items/${encodeURIComponent(withdrawalDraft.itemId)}/withdrawal`,
        body: JSON.stringify({
          expectedRevision: current.revision,
          reason: withdrawalDraft.reason,
        }),
        caseId: current.id,
      }),
    );
  }

  /** Reads the Company's procedure deadline set and its history. */
  async function loadDeadlines() {
    const signal = deadlineOperation.begin();
    if (!signal) return;
    setDeadlineView({ status: 'loading' });
    setDeadlineFeedback({ status: 'idle' });
    try {
      const result = await query(
        deadlineOperation,
        signal,
        '/certification-procedure-deadlines',
        undefined,
        'administration',
      );
      if (signal.aborted) return;
      if (result.status !== 'ok') {
        setDeadlineView({
          status:
            result.status === 'forbidden' || result.status === 'unauthorized'
              ? 'denied'
              : 'unavailable',
        });
        return;
      }
      const history = parseDeadlineHistory(result.value);
      setDeadlineView({ status: 'ready', history });
      setDeadlineDraft(draftFromDeadlines(history.current));
    } catch {
      if (!signal.aborted) setDeadlineView({ status: 'unavailable' });
    }
  }

  /**
   * Saves the next version of the deadline set. An unanswered request is
   * retried with the same key; the Case then reads the new states.
   */
  async function saveDeadlines(retry: boolean) {
    if (busy || deadlineView.status !== 'ready') return;
    const check = deadlinesFromDraft(
      deadlineDraft,
      deadlineView.history.current?.version ?? 0,
    );
    if (check.status !== 'valid') {
      setDeadlineFeedback({ status: 'invalid' });
      return;
    }
    const body = JSON.stringify(check.body);
    // Only an unanswered save of the same values is sent again unchanged.
    const key =
      retry &&
      deadlineFeedback.status === 'uncertain' &&
      deadlineFeedback.body === body
        ? deadlineFeedback.key
        : crypto.randomUUID();
    const signal = deadlineOperation.begin();
    if (!signal) return;
    setDeadlineFeedback({ status: 'saving', key, body });
    try {
      const result = await query(
        deadlineOperation,
        signal,
        '/certification-procedure-deadlines',
        { body, key },
        'administration',
      );
      if (signal.aborted) return;
      if (result.status === 'ok') {
        const saved = parseDeadlineSet(result.value);
        setDeadlineFeedback({ status: 'saved', version: saved.version });
        const history = deadlineView.history;
        setDeadlineView({
          status: 'ready',
          history: {
            current: saved,
            history: [
              saved,
              ...history.history.filter(
                (entry) => entry.version !== saved.version,
              ),
            ],
          },
        });
        if (detail?.status === 'ready')
          void openCase(detail.value.caseDetail.id, { reload: true });
        return;
      }
      if (result.status === 'forbidden' || result.status === 'unauthorized') {
        setDeadlineView({ status: 'denied' });
        setDeadlineFeedback({ status: 'idle' });
      } else if (result.status === 'conflict')
        setDeadlineFeedback({
          status:
            conflictCode(result) === 'CERTIFICATION_DEADLINES_UNCHANGED'
              ? 'unchanged'
              : 'stale',
        });
      else if (result.status === 'validation')
        setDeadlineFeedback({ status: 'invalid' });
      else setDeadlineFeedback({ status: 'uncertain', key, body });
    } catch {
      if (!signal.aborted)
        setDeadlineFeedback({ status: 'uncertain', key, body });
    }
  }

  async function loadMoreExchanges() {
    if (detail?.status !== 'ready' || exchangePaging === 'loading' || busy)
      return;
    const view = detail.value,
      current = view.caseDetail;
    const cursor = current.exchanges.nextCursor;
    if (cursor === null) return;
    const signal = exchangePageOperation.begin();
    if (!signal) return;
    setExchangePaging('loading');
    try {
      const result = await query(
        exchangePageOperation,
        signal,
        `/certification-cases/${encodeURIComponent(current.id)}/exchanges?cursor=${encodeURIComponent(cursor)}`,
      );
      if (signal.aborted) return;
      if (result.status === 'ok') {
        const page = parseExchangePage(result.value);
        const previous = current.exchanges.records;
        if (
          page.total !== current.exchanges.total ||
          page.records.some((entry) =>
            previous.some((old) => old.sequence === entry.sequence),
          ) ||
          page.nextCursor === cursor ||
          previous.length + page.records.length > page.total ||
          (page.nextCursor === null &&
            previous.length + page.records.length !== page.total)
        )
          throw new Error('Inconsistent exchange page.');
        setDetail((latest) =>
          latest?.status === 'ready' &&
          latest.value.caseDetail.id === current.id &&
          latest.value.caseDetail.revision === current.revision &&
          latest.value.caseDetail.exchanges.nextCursor === cursor
            ? {
                status: 'ready',
                value: {
                  ...latest.value,
                  caseDetail: {
                    ...latest.value.caseDetail,
                    exchanges: {
                      ...latest.value.caseDetail.exchanges,
                      records: [...previous, ...page.records],
                      nextCursor: page.nextCursor,
                    },
                  },
                },
              }
            : latest,
        );
        setExchangePaging('idle');
      } else if (result.status === 'conflict') setExchangePaging('stale');
      else if (
        result.status !== 'forbidden' &&
        result.status !== 'unauthorized'
      )
        setExchangePaging('error');
    } catch {
      if (!signal.aborted) setExchangePaging('error');
    }
  }

  /** The Exchanges and deadlines region of the read Case. */
  function exchangesSection(view: CaseView) {
    const roles = consistencyRoles(view);
    const formState = <Draft,>(
      kind: 'exchange' | 'reverification' | 'withdrawal',
      feedback: Feedback,
      draft: Draft,
    ) => ({
      draft,
      feedback: feedbackMessage(kind, feedback),
      saving: feedback.status === 'saving',
      fieldFeedback: exchangeFieldFeedback({
        kind,
        feedback,
        id: feedbackIds[kind],
      }),
      describedBy: describedFeedback(kind, feedback),
    });
    const clearRefusal = (
      feedback: Feedback,
      set: (next: Feedback) => void,
    ) => {
      if (
        feedback.status === 'saved' ||
        (feedback.status === 'refused' && !feedback.reload)
      )
        set(IDLE);
    };
    const records = view.caseDetail.exchanges.records;
    return (
      <ExchangesRegion
        paging={exchangePaging}
        onLoadMore={() => void loadMoreExchanges()}
        onReload={() => void openCase(view.caseDetail.id, { reload: true })}
        prefix={prefix}
        detail={view.caseDetail}
        register={view.register}
        roles={{
          manager: authority.manage,
          contributor:
            roles.manager || roles.auditorOnTeam || roles.independentApprover,
        }}
        busy={busy}
        exchange={{
          ...formState('exchange', exchangeFeedback, exchangeDraft),
          open: exchangeOpen,
        }}
        onExchangeOpen={(open) => {
          setExchangeOpen(open);
          const corrected =
            open?.correcting === null || open === null
              ? undefined
              : records.find((entry) => entry.sequence === open.correcting);
          setExchangeDraft(
            corrected
              ? draftFromExchange(corrected.current)
              : emptyExchangeDraft(),
          );
          setExchangeFeedback(IDLE);
        }}
        onExchangeDraft={(draft) => {
          setExchangeDraft(draft);
          clearRefusal(exchangeFeedback, setExchangeFeedback);
        }}
        onExchangeSubmit={submitExchange}
        item={{
          ...formState('reverification', itemFeedback, itemDraft),
          open: itemOpen,
        }}
        onItemOpen={(open) => {
          setItemOpen(open);
          if (!open) setItemDraft({ text: '', source: '' });
          setItemFeedback(IDLE);
        }}
        onItemDraft={(draft) => {
          setItemDraft(draft);
          clearRefusal(itemFeedback, setItemFeedback);
        }}
        onItemSubmit={submitItem}
        withdrawal={formState(
          'withdrawal',
          withdrawalFeedback,
          withdrawalDraft,
        )}
        onWithdrawalDraft={(draft) => {
          const reopened =
            draft === null || draft.itemId !== withdrawalDraft?.itemId;
          setWithdrawalDraft(draft);
          if (reopened) setWithdrawalFeedback(IDLE);
          else clearRefusal(withdrawalFeedback, setWithdrawalFeedback);
        }}
        onWithdrawalSubmit={submitWithdrawal}
        administration={
          administersDeadlines ? (
            <DeadlineAdministration
              prefix={prefix}
              view={deadlineView}
              feedback={deadlineFeedback}
              draft={deadlineDraft}
              busy={busy}
              onOpen={() => void loadDeadlines()}
              onClose={() => {
                deadlineOperation.retire();
                setDeadlineView({ status: 'closed' });
                setDeadlineFeedback({ status: 'idle' });
              }}
              onReload={() => void loadDeadlines()}
              onDraft={(draft) => {
                setDeadlineDraft(draft);
                if (
                  deadlineFeedback.status === 'invalid' ||
                  deadlineFeedback.status === 'unchanged' ||
                  deadlineFeedback.status === 'saved'
                )
                  setDeadlineFeedback({ status: 'idle' });
              }}
              onSubmit={(event) => {
                event.preventDefault();
                void saveDeadlines(false);
              }}
              onRetry={() => void saveDeadlines(true)}
            />
          ) : null
        }
      />
    );
  }

  function retry(kind: MutationKind, feedback: Feedback) {
    if (feedback.status === 'uncertain') void execute(kind, feedback.intent);
  }

  const feedbackIds = {
    open: `${prefix}-open-feedback`,
    application: `${prefix}-application-feedback`,
    review: `${prefix}-review-feedback`,
    duration: `${prefix}-duration-feedback`,
    attach: `${prefix}-attach-feedback`,
    agreement: `${prefix}-agreement-feedback`,
    team: `${prefix}-team-feedback`,
    decision: `${prefix}-decision-feedback`,
    finding: `${prefix}-finding-feedback`,
    discrepancy: `${prefix}-discrepancy-feedback`,
    discrepancyResolution: `${prefix}-discrepancy-resolution-feedback`,
    exchange: `${prefix}-exchange-feedback`,
    reverification: `${prefix}-reverification-feedback`,
    withdrawal: `${prefix}-withdrawal-feedback`,
    stage1Plan: `${prefix}-stage-1-plan-feedback`,
    stage2Plan: `${prefix}-stage-2-plan-feedback`,
    stage1Report: `${prefix}-stage-1-report-feedback`,
    stage2Report: `${prefix}-stage-2-report-feedback`,
    recommendation: `${prefix}-recommendation-feedback`,
    dossierReview: `${prefix}-dossier-review-feedback`,
    certificationDecision: `${prefix}-certification-decision-feedback`,
    certificateData: `${prefix}-certificate-data-feedback`,
    certificate: `${prefix}-certificate-feedback`,
    certificateDraft: `${prefix}-certificate-draft-feedback`,
    clientOpinion: `${prefix}-client-opinion-feedback`,
    draftApproval: `${prefix}-draft-approval-feedback`,
    certificateRevision: `${prefix}-certificate-revision-feedback`,
  } satisfies Record<MutationKind, string>;

  /** A step's confirmation is shown above the Case and survives its reload. */
  function feedbackMessage(kind: MutationKind, feedback: Feedback) {
    switch (feedback.status) {
      case 'idle':
      case 'saving':
        return null;
      case 'saved':
        return kind === 'open' ? (
          <p role="status">{copy('saveConfirmed')}</p>
        ) : null;
      case 'uncertain':
        return (
          <div role="alert" id={feedbackIds[kind]}>
            <p>{copy('uncertain')}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => retry(kind, feedback)}
            >
              {copy('retry')}
            </button>
          </div>
        );
      case 'refused':
        return (
          <p role="alert" id={feedbackIds[kind]}>
            {copy(feedback.message)}
          </p>
        );
      case 'unmet':
        return (
          <div role="alert" id={feedbackIds[kind]}>
            <p>
              {copy(
                feedback.source === 'server'
                  ? 'decisionPreconditionsRefused'
                  : 'decisionPreconditionsTitle',
              )}
            </p>
            <PreconditionList failures={feedback.failures} />
            {namedDiscrepancies(feedback.discrepancies)}
          </div>
        );
    }
    return unexpected(feedback);
  }

  function describedFeedback(kind: MutationKind, feedback: Feedback) {
    return feedback.status === 'refused' ||
      feedback.status === 'uncertain' ||
      feedback.status === 'unmet'
      ? feedbackIds[kind]
      : undefined;
  }

  const caseView = detail?.status === 'ready' ? detail.value : undefined;

  return (
    <section
      className="certification-workspace"
      aria-labelledby={`${prefix}-title`}
    >
      <header>
        <h3 id={`${prefix}-title`}>{copy('title')}</h3>
        <button type="button" disabled={busy} onClick={() => void loadList()}>
          {copy('refresh')}
        </button>
      </header>
      <p>{copy('introduction')}</p>
      {authority.manage && list.status !== 'denied' && (
        <div className="certification-open">
          {feedbackMessage('open', openFeedback)}
          {!opening ? (
            <button
              type="button"
              className="certification-primary"
              disabled={busy}
              onClick={() => {
                setOpening(true);
                if (openFeedback.status === 'saved') setOpenFeedback(IDLE);
                if (entities?.status !== 'ready') void loadEntities();
              }}
            >
              {copy('openToggle')}
            </button>
          ) : (
            <form
              className="certification-form"
              aria-labelledby={`${prefix}-open-title`}
              noValidate
              onSubmit={submitOpen}
            >
              <h4 id={`${prefix}-open-title`}>{copy('openTitle')}</h4>
              <p>{copy('openHelp')}</p>
              {entities?.status === 'loading' && (
                <p role="status">{copy('legalEntitiesLoading')}</p>
              )}
              {(entities?.status === 'error' ||
                entities?.status === 'unavailable') && (
                <div role="alert">
                  <p>{copy('legalEntitiesUnavailable')}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void loadEntities()}
                  >
                    {copy('retry')}
                  </button>
                </div>
              )}
              {entities?.status === 'ready' && entities.value.length === 0 && (
                <p>{copy('legalEntitiesEmpty')}</p>
              )}
              <label htmlFor={`${prefix}-entity`}>{copy('legalEntity')}</label>
              <Select
                id={`${prefix}-entity`}
                value={entityId}
                placeholder={copy('selectLegalEntity')}
                disabled={busy || entities?.status !== 'ready'}
                invalid={invalidField(
                  describedFeedback('open', openFeedback),
                  blank(entityId),
                )}
                describedBy={describedFeedback('open', openFeedback)}
                options={
                  entities?.status === 'ready'
                    ? entities.value.map((entity) => ({
                        value: entity.id,
                        label:
                          entity.taxId === null
                            ? entity.legalName
                            : `${entity.legalName} — ${copy('taxId')} ${entity.taxId}`,
                      }))
                    : []
                }
                onValueChange={(value) => {
                  setEntityId(value);
                  if (openFeedback.status === 'refused') setOpenFeedback(IDLE);
                }}
              />
              <label htmlFor={`${prefix}-reference`}>
                {copy('orderReference')}
              </label>
              <input
                id={`${prefix}-reference`}
                value={orderReference}
                maxLength={CERTIFICATION_LIMITS.orderReference}
                disabled={busy}
                required
                aria-invalid={invalidField(
                  describedFeedback('open', openFeedback),
                  wrongText(
                    orderReference,
                    CERTIFICATION_LIMITS.orderReference,
                  ),
                )}
                aria-describedby={describedFeedback('open', openFeedback)}
                onChange={(event) => {
                  setOrderReference(event.target.value);
                  if (openFeedback.status === 'refused') setOpenFeedback(IDLE);
                }}
              />
              <div className="certification-actions">
                <button
                  type="submit"
                  className="certification-primary"
                  disabled={busy}
                >
                  {openFeedback.status === 'saving'
                    ? copy('saving')
                    : copy('openSubmit')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setOpening(false)}
                >
                  {copy('cancel')}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
      {list.status === 'loading' && <p role="status">{copy('loading')}</p>}
      {list.status === 'denied' && <p role="alert">{copy('denied')}</p>}
      {list.status === 'unavailable' && (
        <p role="alert">{copy('listUnavailable')}</p>
      )}
      {list.status === 'error' && <p role="alert">{copy('error')}</p>}
      {list.status === 'ready' && (
        <div className="certification-register">
          <p>
            {copy('total')}: {formatNumber(list.value.total)}
          </p>
          {list.value.cases.length === 0 && <p>{copy('empty')}</p>}
          <ul className="certification-list">
            {list.value.cases.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={item.id === selectedId ? 'true' : undefined}
                  disabled={busy}
                  onClick={(event) =>
                    void openCase(item.id, { trigger: event.currentTarget })
                  }
                >
                  {item.orderReference}
                </button>
                <span>{item.clientLegalEntity.legalName}</span>
                <span
                  className={`certification-status certification-status-${item.status}`}
                >
                  {copy(statusLabel(item.status))}
                </span>
                <span>
                  {copy('nextStep')}: <NextStepLabel step={item.nextStep} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {selectedId !== undefined && (
        <article
          className="certification-case"
          aria-labelledby={caseView ? `${prefix}-case-title` : undefined}
          aria-label={caseView ? undefined : copy('title')}
        >
          <div className="certification-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => void openCase(selectedId, { reload: true })}
            >
              {copy('reload')}
            </button>
            <button type="button" disabled={busy} onClick={closeCase}>
              {copy('back')}
            </button>
          </div>
          {[
            applicationFeedback,
            reviewFeedback,
            durationFeedback,
            attachFeedback,
            agreementFeedback,
            teamFeedback,
            decisionFeedback,
            findingFeedback,
            manualFeedback,
            resolutionFeedback,
            exchangeFeedback,
            itemFeedback,
            withdrawalFeedback,
            ...Object.values(stageFeedback),
            ...Object.values(closingFeedback),
          ].some((feedback) => feedback.status === 'saved') && (
            <p role="status">{copy('saveConfirmed')}</p>
          )}
          {detail?.status === 'loading' && (
            <p role="status">{copy('caseLoading')}</p>
          )}
          {(detail?.status === 'error' ||
            detail?.status === 'unavailable' ||
            detail?.status === 'denied') && (
            <p role="alert">
              {copy(detail.status === 'error' ? 'error' : detail.status)}
            </p>
          )}
          {caseView && (
            <>
              <h4 id={`${prefix}-case-title`} ref={heading} tabIndex={-1}>
                {formatMessage(copy('caseHeading'), {
                  reference: caseView.caseDetail.orderReference,
                })}
              </h4>
              <dl className="certification-summary">
                <div>
                  <dt>{copy('legalEntity')}</dt>
                  <dd>{caseView.caseDetail.clientLegalEntity.legalName}</dd>
                </div>
                <div>
                  <dt>{copy('standard')}</dt>
                  <dd>{copy('standardValue')}</dd>
                </div>
                <div>
                  <dt>{copy('auditType')}</dt>
                  <dd>{copy('auditTypeValue')}</dd>
                </div>
                <div>
                  <dt>{copy('status')}</dt>
                  <dd>
                    <span
                      className={`certification-status certification-status-${caseView.caseDetail.status}`}
                    >
                      {copy(statusLabel(caseView.caseDetail.status))}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{copy('nextStep')}</dt>
                  <dd>
                    <NextStepLabel step={caseView.caseDetail.nextStep} />
                  </dd>
                </div>
                <div>
                  <dt>{copy('openedBy')}</dt>
                  <dd>{caseView.caseDetail.openedBy.displayName}</dd>
                </div>
                <div>
                  <dt>{copy('openedAt')}</dt>
                  <dd>
                    <time dateTime={caseView.caseDetail.openedAt}>
                      {formatDateTime(caseView.caseDetail.openedAt)}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>{copy('revision')}</dt>
                  <dd>{formatNumber(caseView.caseDetail.revision)}</dd>
                </div>
              </dl>
              <StepRail detail={caseView.caseDetail} />
              {!authority.manage && (
                <p className="certification-note">{copy('readOnly')}</p>
              )}
              {caseView.caseDetail.status === 'rejected' && (
                <p className="certification-blocked">{copy('blockedClosed')}</p>
              )}
              {caseView.caseDetail.status === 'refused' && (
                <p className="certification-blocked">
                  {copy('caseRefusedNote')}
                </p>
              )}
              {caseView.caseDetail.status === 'certified' && (
                <p className="certification-note">
                  {copy('caseCertifiedNote')}
                </p>
              )}
              {caseView.caseDetail.nextStep === 'recommendation' && (
                <p className="certification-note">
                  {copy('nextRecommendationPending')}
                </p>
              )}
              {caseView.caseDetail.nextStep === 'findings_follow_up' && (
                <p className="certification-note">
                  {copy('nextFindingsFollowUpPending')}
                </p>
              )}
              {consistencySection(caseView)}
              {exchangesSection(caseView)}
              <section aria-labelledby={`${prefix}-application-title`}>
                <h5 id={`${prefix}-application-title`}>
                  {copy('applicationTitle')}
                </h5>
                {caseView.caseDetail.application ? (
                  <>
                    <VersionAttribution
                      version={caseView.caseDetail.application}
                    />
                    <FactsView facts={caseView.caseDetail.application.value} />
                  </>
                ) : (
                  <p>{copy('applicationMissing')}</p>
                )}
                {authority.manage && (
                  <>
                    {feedbackMessage('application', applicationFeedback)}
                    {applicationStep(caseView.caseDetail)}
                  </>
                )}
              </section>
              <section aria-labelledby={`${prefix}-review-title`}>
                <h5 id={`${prefix}-review-title`}>{copy('reviewTitle')}</h5>
                {caseView.caseDetail.applicationReview ? (
                  <>
                    <VersionAttribution
                      version={caseView.caseDetail.applicationReview}
                    />
                    <ReviewView
                      review={caseView.caseDetail.applicationReview.value}
                      register={caseView.register}
                    />
                  </>
                ) : (
                  <p>{copy('reviewMissing')}</p>
                )}
                {authority.manage && (
                  <>
                    {feedbackMessage('review', reviewFeedback)}
                    {reviewStep(caseView.caseDetail, caseView.register)}
                  </>
                )}
              </section>
              {caseView.caseDetail.applicationReview?.value.outcome ===
                'accepted' && (
                <section aria-labelledby={`${prefix}-duration-title`}>
                  <h5 id={`${prefix}-duration-title`}>
                    {copy('durationTitle')}
                  </h5>
                  {caseView.caseDetail.duration ? (
                    <>
                      <VersionAttribution
                        version={caseView.caseDetail.duration}
                      />
                      <DurationView
                        determination={caseView.caseDetail.duration.value}
                        register={caseView.register}
                      />
                    </>
                  ) : (
                    <p>{copy('durationMissing')}</p>
                  )}
                  {authority.manage && (
                    <>
                      {feedbackMessage('duration', durationFeedback)}
                      {durationStep(caseView.caseDetail, caseView.register)}
                    </>
                  )}
                </section>
              )}
              <section aria-labelledby={`${prefix}-documents-title`}>
                <h5 id={`${prefix}-documents-title`}>
                  {copy('documentsTitle')}
                </h5>
                <p>{copy('documentsHelp')}</p>
                <DossierRegister
                  register={caseView.register}
                  download={registerDownload(caseView)}
                />
                {!documentRights && (
                  <p className="certification-note">
                    {copy('documentsNoContentRights')}
                  </p>
                )}
                {downloadMessage()}
                {authority.manage && (
                  <>
                    {feedbackMessage('attach', attachFeedback)}
                    {attachStep(caseView.caseDetail, caseView.register)}
                  </>
                )}
              </section>
              {caseView.caseDetail.duration && (
                <section aria-labelledby={`${prefix}-agreement-title`}>
                  <h5 id={`${prefix}-agreement-title`}>
                    {copy('agreementTitle')}
                  </h5>
                  {caseView.caseDetail.agreement ? (
                    <>
                      <VersionAttribution
                        version={caseView.caseDetail.agreement}
                      />
                      <AgreementView
                        agreement={caseView.caseDetail.agreement.value}
                        register={caseView.register}
                      />
                    </>
                  ) : (
                    <p>{copy('agreementMissing')}</p>
                  )}
                  {authority.manage && (
                    <>
                      {feedbackMessage('agreement', agreementFeedback)}
                      {agreementStep(caseView.caseDetail, caseView.register)}
                    </>
                  )}
                </section>
              )}
              {caseView.caseDetail.agreement && (
                <section aria-labelledby={`${prefix}-team-title`}>
                  <h5 id={`${prefix}-team-title`}>{copy('teamTitle')}</h5>
                  {caseView.caseDetail.team ? (
                    <>
                      <VersionAttribution version={caseView.caseDetail.team} />
                      <p>
                        {copy('status')}: {teamStatus(caseView.caseDetail)}
                      </p>
                      <TeamView
                        team={caseView.caseDetail.team.value}
                        people={knownPeople(caseView)}
                        register={caseView.register}
                      />
                    </>
                  ) : (
                    <p>{copy('teamMissing')}</p>
                  )}
                  {authority.manage && (
                    <>
                      {feedbackMessage('team', teamFeedback)}
                      {teamStep(caseView)}
                    </>
                  )}
                </section>
              )}
              {caseView.caseDetail.team && (
                <section aria-labelledby={`${prefix}-decision-title`}>
                  <h5 id={`${prefix}-decision-title`}>
                    {copy('decisionTitle')}
                  </h5>
                  {caseView.caseDetail.teamDecision ? (
                    <>
                      <VersionAttribution
                        version={caseView.caseDetail.teamDecision}
                      />
                      <DecisionView
                        decision={caseView.caseDetail.teamDecision.value}
                        register={caseView.register}
                      />
                    </>
                  ) : (
                    <p>{copy('decisionMissing')}</p>
                  )}
                  {caseView.caseDetail.teamDecision &&
                    caseView.caseDetail.teamDecision.value.teamVersion !==
                      caseView.caseDetail.team.version && (
                      <p className="certification-note">
                        {formatMessage(copy('decisionEarlierVersion'), {
                          decided:
                            caseView.caseDetail.teamDecision.value.teamVersion,
                          current: caseView.caseDetail.team.version,
                        })}
                      </p>
                    )}
                  {feedbackMessage('decision', decisionFeedback)}
                  {decisionStep(caseView)}
                </section>
              )}
              {(caseView.caseDetail.stage1Plan !== null ||
                approvedTeam(caseView.caseDetail) !== undefined) &&
                stageSection(caseView, 'stage_1')}
              {caseView.caseDetail.stage1Plan !== null &&
                stageSection(caseView, 'stage_2')}
              {caseView.caseDetail.stage2Report !== null &&
                recommendationSection(caseView)}
              {(caseView.caseDetail.certificateData !== null ||
                (caseView.caseDetail.stage2Report !== null &&
                  caseView.caseDetail.status === 'open')) &&
                certificateDataSection(caseView)}
              {caseView.caseDetail.recommendation !== null && (
                <>
                  {dossierSection(caseView)}
                  {decisionSection(caseView)}
                </>
              )}
              <CertificateReleaseRegion
                form={releaseForm}
                key={caseView.caseDetail.id}
                current={caseView.caseDetail}
                register={caseView.register}
                manage={authority.manage}
                approve={
                  authority.approve &&
                  !linkedToAnyTeamVersion(
                    caseView.timeline,
                    actor.workspaceMembershipId,
                  )
                }
                disabled={busy}
                blocked={{
                  certificateDraft: blockedUntilReload(
                    certificateDraftFeedback,
                  ),
                  clientOpinion: blockedUntilReload(clientOpinionFeedback),
                  draftApproval: blockedUntilReload(draftApprovalFeedback),
                  certificateRevision: blockedUntilReload(
                    certificateRevisionFeedback,
                  ),
                }}
                feedback={{
                  certificateDraft: feedbackMessage(
                    'certificateDraft',
                    certificateDraftFeedback,
                  ),
                  clientOpinion: feedbackMessage(
                    'clientOpinion',
                    clientOpinionFeedback,
                  ),
                  draftApproval: feedbackMessage(
                    'draftApproval',
                    draftApprovalFeedback,
                  ),
                  certificateRevision: feedbackMessage(
                    'certificateRevision',
                    certificateRevisionFeedback,
                  ),
                }}
                onCommand={(command) =>
                  sendClosing(
                    command.kind,
                    caseView.caseDetail,
                    command.path,
                    command.value,
                  )
                }
                download={registerDownload(caseView)}
                issuance={
                  caseView.caseDetail.decision?.value.decision === 'granted'
                    ? certificateSection(caseView)
                    : null
                }
              />
              <section aria-labelledby={`${prefix}-register-pdf-title`}>
                <h5 id={`${prefix}-register-pdf-title`}>
                  {copy('registerPdfTitle')}
                </h5>
                <RegisterPdfAction
                  download={{
                    status: registerPdf.status,
                    disabled: busy,
                    onDownload: () =>
                      void downloadRegisterPdf(caseView.caseDetail.id),
                  }}
                />
              </section>
              <section aria-labelledby={`${prefix}-timeline-title`}>
                <h5 id={`${prefix}-timeline-title`}>{copy('timelineTitle')}</h5>
                <TimelineView
                  timeline={caseView.timeline}
                  findings={caseView.caseDetail.findings}
                  certificate={caseView.caseDetail.certificate}
                  register={caseView.register}
                  people={knownPeople(caseView)}
                />
              </section>
            </>
          )}
        </article>
      )}
    </section>
  );

  /** The application form, or the plain-language reason it is unavailable. */
  function applicationStep(current: CaseDetail) {
    if (current.status === 'rejected') return null;
    if (current.decision !== null || current.status !== 'open')
      return (
        <p className="certification-blocked">
          {copy('blockedApplicationDecided')}
        </p>
      );
    const application = current.application;
    if (application && !applicationOpen)
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setApplicationDraft(draftFromFacts(application.value));
            setApplicationOpen(true);
            setApplicationFeedback(IDLE);
          }}
        >
          {copy('correctApplication')}
        </button>
      );
    return (
      <ApplicationForm
        idPrefix={`${prefix}-application`}
        draft={applicationDraft}
        correcting={application !== null}
        disabled={busy}
        submitting={applicationFeedback.status === 'saving'}
        submitBlocked={blockedUntilReload(applicationFeedback)}
        feedbackId={describedFeedback('application', applicationFeedback)}
        onChange={(draft) => {
          setApplicationDraft(draft);
          setApplicationOpen(true);
          if (applicationFeedback.status === 'saved')
            setApplicationFeedback(IDLE);
          else if (
            applicationFeedback.status === 'refused' &&
            !applicationFeedback.reload
          )
            setApplicationFeedback(IDLE);
        }}
        onSubmit={submitApplication}
        onCancel={
          application
            ? () => {
                setApplicationDraft(emptyApplicationDraft());
                setApplicationOpen(false);
                setApplicationFeedback(IDLE);
              }
            : undefined
        }
      />
    );
  }

  /** The review form, or the plain-language reason it is unavailable. */
  function reviewStep(current: CaseDetail, register: DocumentRegister) {
    if (current.status === 'rejected' || current.applicationReview) return null;
    if (!current.application)
      return (
        <p className="certification-blocked">
          {copy('blockedReviewBeforeApplication')}
        </p>
      );
    return (
      <ReviewForm
        idPrefix={`${prefix}-review`}
        draft={reviewDraft}
        documents={register.items}
        disabled={busy}
        submitting={reviewFeedback.status === 'saving'}
        submitBlocked={blockedUntilReload(reviewFeedback)}
        feedbackId={describedFeedback('review', reviewFeedback)}
        onChange={(draft) => {
          setReviewDraft(draft);
          if (
            reviewFeedback.status === 'saved' ||
            (reviewFeedback.status === 'refused' && !reviewFeedback.reload)
          )
            setReviewFeedback(IDLE);
        }}
        onSubmit={submitReview}
      />
    );
  }

  /** The duration inputs, proposal and confirmation, or the correction entry. */
  function durationStep(current: CaseDetail, register: DocumentRegister) {
    const application = current.application;
    const recorded = current.duration;
    if (current.status !== 'open' || !application) return null;
    if (recorded && !durationOpen)
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            resetDurationDraft();
            setDurationDraft(
              durationDraftFor({
                facts: application.value,
                current: recorded.value,
              }),
            );
            setDurationOpen(true);
            setDurationFeedback(IDLE);
          }}
        >
          {copy('correctDuration')}
        </button>
      );
    const draft =
      durationDraft ??
      durationDraftFor({
        facts: application.value,
        current: recorded?.value ?? null,
      });
    const check = durationInputsFromDraft(draft, application.value);
    const typed =
      check.status === 'valid' ? JSON.stringify(check.inputs) : undefined;
    return (
      <DurationForm
        idPrefix={`${prefix}-duration`}
        facts={application.value}
        draft={draft}
        documents={register.items}
        correcting={recorded !== null}
        disabled={busy}
        computing={proposal.status === 'computing'}
        submitting={durationFeedback.status === 'saving'}
        submitBlocked={blockedUntilReload(durationFeedback)}
        proposal={
          proposal.status === 'ready'
            ? { result: proposal.result, current: proposal.inputs === typed }
            : undefined
        }
        inputsRefusal={
          proposal.status === 'refused'
            ? { id: `${prefix}-proposal-feedback`, message: proposal.message }
            : undefined
        }
        feedbackId={describedFeedback('duration', durationFeedback)}
        onChange={(next) => {
          setDurationDraft(next);
          setDurationOpen(true);
          if (proposal.status === 'refused') setProposal(NO_PROPOSAL);
          if (
            durationFeedback.status === 'saved' ||
            (durationFeedback.status === 'refused' && !durationFeedback.reload)
          )
            setDurationFeedback(IDLE);
        }}
        onCompute={(event) => void computeProposal(event)}
        onSubmit={submitDuration}
        onCancel={
          recorded
            ? () => {
                resetDurationDraft();
                setDurationFeedback(IDLE);
              }
            : undefined
        }
      />
    );
  }

  /** The state of the last download, under the Document rights it began with. */
  function downloadMessage() {
    if (download.status === 'idle' || download.rights !== documentRights)
      return null;
    switch (download.status) {
      case 'pending':
        return <p role="status">{copy('documentDownloading')}</p>;
      case 'failed':
        return <p role="alert">{copy('documentDownloadFailed')}</p>;
      case 'denied':
        return <p role="alert">{copy('documentsDenied')}</p>;
      case 'unavailable':
        return <p role="alert">{copy('documentDownloadUnavailable')}</p>;
    }
    return unexpected(download);
  }

  /** The attach form, or the plain-language reason it is unavailable. */
  function attachStep(current: CaseDetail, register: DocumentRegister) {
    if (current.status !== 'open' && current.status !== 'certified')
      return null;
    if (!documentRights)
      return <p className="certification-note">{copy('attachNoRights')}</p>;
    const listed = eligibleFor(current.id);
    if (!attaching || !listed)
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setAttaching(true);
            if (attachFeedback.status === 'saved') setAttachFeedback(IDLE);
            void loadEligible(current.id);
          }}
        >
          {copy('attachToggle')}
        </button>
      );
    return (
      <AttachForm
        idPrefix={`${prefix}-attach`}
        eligible={listed}
        certified={current.status === 'certified'}
        register={register.items}
        draft={attachDraft}
        disabled={busy}
        submitting={attachFeedback.status === 'saving'}
        submitBlocked={blockedUntilReload(attachFeedback)}
        feedbackId={describedFeedback('attach', attachFeedback)}
        onChange={(draft) => {
          setAttachDraft(draft);
          if (
            attachFeedback.status === 'saved' ||
            (attachFeedback.status === 'refused' && !attachFeedback.reload)
          )
            setAttachFeedback(IDLE);
        }}
        onSubmit={submitAttach}
        onCancel={() => {
          resetAttachDraft();
          setAttachFeedback(IDLE);
        }}
        onReloadEligible={() => void loadEligible(current.id)}
      />
    );
  }

  /** The latest team's state: awaiting a decision, approved or returned. */
  function teamStatus(current: CaseDetail) {
    const { team, teamDecision } = current;
    const decided =
      team && teamDecision?.value.teamVersion === team.version
        ? teamDecision.value.decision
        : undefined;
    return (
      <span
        className={`certification-status certification-status-${decided === 'returned' ? 'rejected' : 'open'}`}
      >
        {copy(
          decided === undefined
            ? 'teamStatusPending'
            : decided === 'approved'
              ? 'teamStatusApproved'
              : 'teamStatusReturned',
        )}
      </span>
    );
  }

  /** The team form, the entry to a new version or why it is unavailable. */
  function teamStep(view: CaseView) {
    const current = view.caseDetail;
    const proposed = current.team;
    if (current.status !== 'open' || !current.agreement) return null;
    if (proposed && !teamOpen)
      return (
        <>
          {current.nextStep === 'team' && (
            <p className="certification-blocked">{copy('teamReturnedNote')}</p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setTeamDraft(teamDraftFor(proposed));
              setTeamOpen(true);
              setTeamFeedback(IDLE);
            }}
          >
            {copy('correctTeam')}
          </button>
        </>
      );
    return (
      <TeamForm
        idPrefix={`${prefix}-team`}
        draft={teamDraft ?? teamDraftFor(null)}
        correcting={proposed !== null}
        linkOptions={linkOptions(view)}
        documents={view.register.items}
        consultant={declaredConsultant(current)}
        disabled={busy}
        submitting={teamFeedback.status === 'saving'}
        submitBlocked={blockedUntilReload(teamFeedback)}
        feedbackId={describedFeedback('team', teamFeedback)}
        onChange={(draft) => {
          setTeamDraft(draft);
          setTeamOpen(true);
          if (
            teamFeedback.status === 'saved' ||
            (teamFeedback.status === 'refused' && !teamFeedback.reload)
          )
            setTeamFeedback(IDLE);
        }}
        onSubmit={submitTeam}
        onCancel={
          proposed
            ? () => {
                resetTeamDraft();
                setTeamFeedback(IDLE);
              }
            : undefined
        }
      />
    );
  }

  /**
   * The decision form for an approver who is not on the team, the plain
   * reason an approver cannot decide, or who decides for everyone else.
   */
  function decisionStep(view: CaseView) {
    const current = view.caseDetail;
    const team = current.team;
    if (current.status !== 'open' || !team) return null;
    if (current.nextStep !== 'team_decision') return null;
    if (!authority.approve)
      return (
        <p className="certification-note">{copy('teamAwaitingApprover')}</p>
      );
    // The server refuses a decision by anyone linked to any team version.
    if (linkedToAnyTeamVersion(view.timeline, actor.workspaceMembershipId))
      return (
        <p className="certification-blocked">{copy('teamIndependence')}</p>
      );
    return (
      <DecisionForm
        idPrefix={`${prefix}-decision`}
        draft={decisionDraft}
        teamVersion={team.version}
        conflictDeclared={!teamWithoutConflict(team.value)}
        documents={view.register.items}
        disabled={busy}
        submitting={decisionFeedback.status === 'saving'}
        submitBlocked={blockedUntilReload(decisionFeedback)}
        feedbackId={describedFeedback('decision', decisionFeedback)}
        onChange={(draft) => {
          setDecisionDraft(draft);
          if (
            decisionFeedback.status === 'saved' ||
            (decisionFeedback.status === 'refused' && !decisionFeedback.reload)
          )
            setDecisionFeedback(IDLE);
        }}
        onSubmit={submitDecision}
      />
    );
  }

  /** One Stage: its latest plan and report, their forms or why they wait. */
  function stageSection(view: CaseView, stage: AuditStage) {
    const current = view.caseDetail;
    const titleId = `${prefix}-${stage}-title`;
    const plan = stagePlanOf(current, stage);
    return (
      <section aria-labelledby={titleId}>
        <h5 id={titleId}>
          {copy(stage === 'stage_1' ? 'stage1Title' : 'stage2Title')}
        </h5>
        <h6>{copy('stagePlanTitle')}</h6>
        {plan ? (
          <>
            <VersionAttribution version={plan} />
            <StagePlanView plan={plan.value} register={view.register} />
            <StepSendings
              attachmentId={plan.value.planAttachmentId}
              exchanges={current.exchanges}
              register={view.register}
            />
          </>
        ) : (
          <p>{copy('stagePlanMissing')}</p>
        )}
        {feedbackMessage(planKind(stage), stageFeedback[planKind(stage)])}
        {stagePlanStep(view, stage)}
        <h6>{copy('stageReportTitle')}</h6>
        {stageReportView(view, stage)}
        {feedbackMessage(reportKind(stage), stageFeedback[reportKind(stage)])}
        {stageReportStep(view, stage)}
        {plan && findingsSection(view, stage)}
      </section>
    );
  }

  /**
   * The Findings of a planned Stage in sequence order, each with its exact
   * evidence, the server's dates and its history, the commands this actor
   * may record, and the entry to a new Finding or why it is not offered.
   */
  function findingsSection(view: CaseView, stage: AuditStage) {
    const titleId = `${prefix}-${stage}-findings-title`;
    const findings = view.caseDetail.findings.filter(
      (entry) => entry.stage === stage,
    );
    const roles = findingRoles(view);
    const active = activeFindingForm(view, roles);
    return (
      <section aria-labelledby={titleId}>
        <h6 id={titleId}>
          {copy(
            stage === 'stage_1' ? 'stage1FindingsTitle' : 'stage2FindingsTitle',
          )}
        </h6>
        <p>{copy('findingsHelp')}</p>
        {findings.length === 0 ? (
          <p>{copy('findingsEmpty')}</p>
        ) : (
          <ol className="certification-findings">
            {findings.map((finding) =>
              findingItem(view, finding, roles, active),
            )}
          </ol>
        )}
        {view.caseDetail.status === 'open' &&
          authority.approve &&
          !roles.independentApprover &&
          findings.length > 0 && (
            <p className="certification-blocked">
              {copy('findingIndependence')}
            </p>
          )}
        {recordFindingStep(view, stage, roles, active)}
      </section>
    );
  }

  /**
   * The open Finding form while the read Case still lets this actor record
   * it; otherwise none is open and its draft no longer holds the panel.
   */
  function activeFindingForm(
    view: CaseView,
    roles: FindingRoles,
  ): FindingForm | null {
    if (!findingForm) return null;
    switch (findingForm.command) {
      case 'record':
        return roles.leader &&
          (findingForm.stage === 'stage_2' ||
            view.caseDetail.stage2Plan === null)
          ? findingForm
          : null;
      case 'reclassification':
        return roles.independentApprover ? findingForm : null;
      case 'correction':
      case 'classification':
      case 'response':
      case 'planJudgment':
      case 'verification':
        return roles.leader ? findingForm : null;
    }
    return unexpected(findingForm);
  }

  function findingItem(
    view: CaseView,
    finding: Finding,
    roles: FindingRoles,
    active: FindingForm | null,
  ) {
    const headingId = `${prefix}-finding-${finding.id}`;
    const open =
      active !== null &&
      active.command !== 'record' &&
      active.findingId === finding.id
        ? active
        : null;
    const commands = findingCommands(finding, roles);
    return (
      <li key={finding.id} aria-labelledby={headingId}>
        <strong id={headingId}>{findingHeading(finding)}</strong>
        <FindingFacts
          finding={finding}
          register={view.register}
          download={registerDownload(view)}
        />
        <FindingHold finding={finding} />
        <FindingHistory finding={finding} register={view.register} />
        {open ? (
          <>
            {feedbackMessage('finding', findingFeedback)}
            {findingFormFor(view, finding, open)}
          </>
        ) : (
          commands.length > 0 && (
            <div className="certification-actions">
              {commands.map((command) => (
                <button
                  key={command}
                  type="button"
                  disabled={busy || active !== null}
                  onClick={() => openFindingForm(finding, command)}
                >
                  {findingCommandTitle(command, finding)}
                </button>
              ))}
            </div>
          )
        )}
      </li>
    );
  }

  function findingCommandTitle(command: FindingCommand, finding: Finding) {
    return formatMessage(copy(findingCommandLabel(command)), {
      sequence: finding.sequence,
    });
  }

  /** The open form of a later version of one Finding. */
  function findingFormFor(
    view: CaseView,
    finding: Finding,
    open: Exclude<FindingForm, { command: 'record' }>,
  ) {
    const shared = {
      idPrefix: `${prefix}-finding-${finding.id}-${open.command}`,
      title: findingCommandTitle(open.command, finding),
      disabled: busy,
      submitting: findingFeedback.status === 'saving',
      submitBlocked: blockedUntilReload(findingFeedback),
      feedbackId: describedFeedback('finding', findingFeedback),
      onSubmit: submitFinding,
      onCancel: closeFindingForm,
    };
    const register = view.register.items;
    switch (open.command) {
      case 'correction':
        return (
          <FindingCorrectionForm
            {...shared}
            draft={open.draft}
            register={register}
            onChange={(draft) => editFindingForm({ ...open, draft })}
          />
        );
      case 'classification':
      case 'reclassification':
        return (
          <ClassificationForm
            {...shared}
            draft={open.draft}
            stage={finding.stage}
            by={
              open.command === 'reclassification' ? 'approver' : 'team_leader'
            }
            onChange={(draft) => editFindingForm({ ...open, draft })}
          />
        );
      case 'response':
        return (
          <ResponseForm
            {...shared}
            draft={open.draft}
            register={register}
            onChange={(draft) => editFindingForm({ ...open, draft })}
          />
        );
      case 'planJudgment':
        return (
          <PlanJudgmentForm
            {...shared}
            draft={open.draft}
            onChange={(draft) => editFindingForm({ ...open, draft })}
          />
        );
      case 'verification':
        return (
          <VerificationForm
            {...shared}
            draft={open.draft}
            register={register}
            onChange={(draft) => editFindingForm({ ...open, draft })}
          />
        );
    }
    return unexpected(open);
  }

  /**
   * The new-Finding form for the leader of the approved team holding the
   * auditor role, or the plain reason it is not offered.
   */
  function recordFindingStep(
    view: CaseView,
    stage: AuditStage,
    roles: FindingRoles,
    active: FindingForm | null,
  ) {
    const current = view.caseDetail;
    if (current.status !== 'open' || !authority.audit) return null;
    if (!approvedTeam(current))
      return (
        <p className="certification-blocked">
          {copy('blockedFindingTeamNotApproved')}
        </p>
      );
    // The server refuses a Finding by anyone but the approved team's leader.
    if (!roles.leader)
      return (
        <p className="certification-blocked">
          {copy('blockedFindingNotTeamLeader')}
        </p>
      );
    if (stage === 'stage_1' && current.stage2Plan)
      return (
        <p className="certification-note">
          {copy('blockedFindingStageClosed')}
        </p>
      );
    const title = copy(
      stage === 'stage_1' ? 'recordStage1Finding' : 'recordStage2Finding',
    );
    const open =
      active?.command === 'record' && active.stage === stage ? active : null;
    if (!open)
      return (
        <button
          type="button"
          disabled={busy || active !== null}
          onClick={() => {
            setFindingForm({
              command: 'record',
              stage,
              draft: emptyFindingDraft(),
            });
            setFindingFeedback(IDLE);
          }}
        >
          {title}
        </button>
      );
    return (
      <>
        {feedbackMessage('finding', findingFeedback)}
        <FindingRecordForm
          idPrefix={`${prefix}-${stage}-finding`}
          title={title}
          stage={stage}
          draft={open.draft}
          register={view.register.items}
          disabled={busy}
          submitting={findingFeedback.status === 'saving'}
          submitBlocked={blockedUntilReload(findingFeedback)}
          feedbackId={describedFeedback('finding', findingFeedback)}
          onChange={(draft) => editFindingForm({ ...open, draft })}
          onSubmit={submitFinding}
          onCancel={closeFindingForm}
        />
      </>
    );
  }

  function stageReportView(view: CaseView, stage: AuditStage) {
    const { stage1Report, stage2Report } = view.caseDetail;
    if (stage === 'stage_1' && stage1Report)
      return (
        <>
          <VersionAttribution version={stage1Report} />
          <Stage1ReportView
            report={stage1Report.value}
            register={view.register}
          />
          <StepSendings
            attachmentId={stage1Report.value.reportAttachmentId}
            exchanges={view.caseDetail.exchanges}
            register={view.register}
          />
        </>
      );
    if (stage === 'stage_2' && stage2Report)
      return (
        <>
          <VersionAttribution version={stage2Report} />
          <Stage2ReportView
            report={stage2Report.value}
            register={view.register}
          />
          <StepSendings
            attachmentId={stage2Report.value.reportAttachmentId}
            exchanges={view.caseDetail.exchanges}
            register={view.register}
          />
        </>
      );
    return <p>{copy('stageReportMissing')}</p>;
  }

  /**
   * The plan form for a programme manager, the entry to a new version, or
   * the plain reason the Stage cannot be planned yet.
   */
  function stagePlanStep(view: CaseView, stage: AuditStage) {
    const current = view.caseDetail;
    const duration = current.duration;
    if (current.status !== 'open' || !duration) return null;
    const kind = planKind(stage);
    const feedback = stageFeedback[kind];
    const recorded = stagePlanOf(current, stage);
    const blocked = planBlocked(current, stage);
    if (blocked !== null)
      return recorded && !authority.manage ? null : (
        <p className="certification-blocked">{copy(blocked)}</p>
      );
    if (!authority.manage)
      return recorded ? null : (
        <p className="certification-note">{copy('stagePlanAwaitingManager')}</p>
      );
    const draft = planDraftOf(stage);
    if (recorded && !draft)
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setPlanDraft(stage, stagePlanDraftFor(recorded.value));
            feedbackSetter(kind)(IDLE);
          }}
        >
          {copy(stageFormTitle({ stage, record: 'plan', correcting: true }))}
        </button>
      );
    const attachments = slotAttachments(view.register.items, 'plan');
    if (attachments.length === 0)
      return (
        <p className="certification-blocked">{copy('stageNoPlanDocument')}</p>
      );
    return (
      <StagePlanForm
        idPrefix={`${prefix}-${stage}-plan`}
        stage={stage}
        draft={draft ?? stagePlanDraftFor(null)}
        correcting={recorded !== null}
        confirmedOnSite={confirmedOnSite(duration.value.confirmed, stage)}
        attachments={attachments}
        disabled={busy}
        submitting={feedback.status === 'saving'}
        submitBlocked={blockedUntilReload(feedback)}
        feedbackId={describedFeedback(kind, feedback)}
        onChange={(next) => {
          setPlanDraft(stage, next);
          if (
            feedback.status === 'saved' ||
            (feedback.status === 'refused' && !feedback.reload)
          )
            feedbackSetter(kind)(IDLE);
        }}
        onSubmit={(event) => submitStagePlan(stage, event)}
        onCancel={
          recorded
            ? () => {
                resetStageDraft(kind);
                feedbackSetter(kind)(IDLE);
              }
            : undefined
        }
      />
    );
  }

  /**
   * The report form for the leader of the approved team holding the auditor
   * role, the entry to a new version, or the plain reason it is not offered.
   */
  function stageReportStep(view: CaseView, stage: AuditStage) {
    const current = view.caseDetail;
    if (current.status !== 'open') return null;
    const plan = stagePlanOf(current, stage);
    const reported =
      stage === 'stage_1'
        ? current.stage1Report !== null
        : current.stage2Report !== null;
    if (!plan)
      return (
        <p className="certification-blocked">
          {copy('blockedStageReportBeforePlan')}
        </p>
      );
    const team = approvedTeam(current);
    if (!team)
      return reported && !authority.audit ? null : (
        <p className="certification-blocked">
          {copy('blockedStageReportTeamNotApproved')}
        </p>
      );
    if (!authority.audit)
      return current.nextStep ===
        (stage === 'stage_1' ? 'stage_1_report' : 'stage_2_report') ? (
        <p className="certification-note">
          {copy('stageReportAwaitingLeader')}
        </p>
      ) : null;
    // The server refuses a report by anyone but the approved team's leader.
    if (!leadsTeam(team, actor.workspaceMembershipId))
      return (
        <p className="certification-blocked">{copy('blockedNotTeamLeader')}</p>
      );
    const kind = reportKind(stage);
    const feedback = stageFeedback[kind];
    const reports = slotAttachments(view.register.items, 'report');
    const open = stage === 'stage_1' ? stage1ReportDraft : stage2ReportDraft;
    if (reported && !open)
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (stage === 'stage_1')
              setStage1ReportDraft(
                stage1ReportDraftFor(current.stage1Report?.value ?? null),
              );
            else
              setStage2ReportDraft(
                stage2ReportDraftFor(current.stage2Report?.value ?? null),
              );
            feedbackSetter(kind)(IDLE);
          }}
        >
          {copy(stageFormTitle({ stage, record: 'report', correcting: true }))}
        </button>
      );
    if (reports.length === 0)
      return (
        <p className="certification-blocked">{copy('stageNoReportDocument')}</p>
      );
    const shared = {
      idPrefix: `${prefix}-${stage}-report`,
      stage,
      correcting: reported,
      disabled: busy,
      submitting: feedback.status === 'saving',
      submitBlocked: blockedUntilReload(feedback),
      feedbackId: describedFeedback(kind, feedback),
      reports,
      participantLists: slotAttachments(view.register.items, 'participantList'),
      documents: view.register.items,
      onSubmit: (event: FormEvent) => submitStageReport(stage, event),
      onCancel: reported
        ? () => {
            resetStageDraft(kind);
            feedbackSetter(kind)(IDLE);
          }
        : undefined,
    };
    const edited = () => {
      if (
        feedback.status === 'saved' ||
        (feedback.status === 'refused' && !feedback.reload)
      )
        feedbackSetter(kind)(IDLE);
    };
    return stage === 'stage_1' ? (
      <Stage1ReportForm
        {...shared}
        draft={stage1ReportDraft ?? stage1ReportDraftFor(null)}
        onChange={(next) => {
          setStage1ReportDraft(next);
          edited();
        }}
      />
    ) : (
      <Stage2ReportForm
        {...shared}
        draft={stage2ReportDraft ?? stage2ReportDraftFor(null)}
        annexes={slotAttachments(view.register.items, 'annex')}
        onChange={(next) => {
          setStage2ReportDraft(next);
          edited();
        }}
      />
    );
  }

  /** The agreement form, the correction entry or why it is unavailable. */
  function agreementStep(current: CaseDetail, register: DocumentRegister) {
    const recorded = current.agreement;
    if (current.status !== 'open' || !current.duration) return null;
    if (recorded && !agreementOpen)
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setAgreementDraft(agreementDraftFor(recorded));
            setAgreementOpen(true);
            setAgreementFeedback(IDLE);
          }}
        >
          {copy('correctAgreement')}
        </button>
      );
    const attachments = agreementAttachments(register.items);
    if (attachments.length === 0)
      return (
        <p className="certification-blocked">{copy('agreementNoDocument')}</p>
      );
    return (
      <AgreementForm
        idPrefix={`${prefix}-agreement`}
        draft={agreementDraft ?? agreementDraftFor(null)}
        attachments={attachments}
        correcting={recorded !== null}
        today={latestBusinessDate()}
        disabled={busy}
        submitting={agreementFeedback.status === 'saving'}
        submitBlocked={blockedUntilReload(agreementFeedback)}
        feedbackId={describedFeedback('agreement', agreementFeedback)}
        onChange={(draft) => {
          setAgreementDraft(draft);
          setAgreementOpen(true);
          if (
            agreementFeedback.status === 'saved' ||
            (agreementFeedback.status === 'refused' &&
              !agreementFeedback.reload)
          )
            setAgreementFeedback(IDLE);
        }}
        onSubmit={submitAgreement}
        onCancel={
          recorded
            ? () => {
                resetAgreementDraft();
                setAgreementFeedback(IDLE);
              }
            : undefined
        }
      />
    );
  }

  /** The shared props of an open closing-step form. */
  function closingForm(kind: ClosingKind, idPrefix: string) {
    const feedback = closingFeedback[kind];
    return {
      idPrefix: `${prefix}-${idPrefix}`,
      disabled: busy,
      submitting: feedback.status === 'saving',
      submitBlocked: blockedUntilReload(feedback),
      feedbackId: describedFeedback(kind, feedback),
    };
  }

  /** A closing-step panel: its title, latest record and the step below. */
  function closingSection(
    kind: ClosingKind,
    title: CertificationMessageKey,
    record: ReactNode,
    step: ReactNode,
  ) {
    const titleId = `${prefix}-${kind}-title`;
    return (
      <section aria-labelledby={titleId}>
        <h5 id={titleId}>{copy(title)}</h5>
        {record}
        {feedbackMessage(kind, closingFeedback[kind])}
        {step}
      </section>
    );
  }

  /** The latest recommendation, then its form, correction or who records it. */
  function recommendationSection(view: CaseView) {
    const recorded = view.caseDetail.recommendation;
    return closingSection(
      'recommendation',
      'recommendationTitle',
      recorded ? (
        <>
          <VersionAttribution version={recorded} />
          <RecommendationView recommendation={recorded.value} />
        </>
      ) : (
        <p>{copy('recommendationMissing')}</p>
      ),
      recommendationStep(view),
    );
  }

  function recommendationStep(view: CaseView) {
    const current = view.caseDetail;
    const recorded = current.recommendation;
    if (current.status !== 'open' || current.decision) return null;
    if (!recommendationOffered(view)) {
      // Nonconformities still holding the Case are explained above it.
      if (recorded || current.findings.some(findingBlocks)) return null;
      return authority.audit && approvedTeam(current) ? (
        <p className="certification-blocked">
          {copy('blockedRecommendationNotTeamLeader')}
        </p>
      ) : (
        <p className="certification-note">
          {copy('recommendationAwaitingLeader')}
        </p>
      );
    }
    if (recorded && !recommendationDraft)
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setRecommendationDraft(recommendationDraftFor(recorded.value));
            setRecommendationFeedback(IDLE);
          }}
        >
          {copy('correctRecommendation')}
        </button>
      );
    return (
      <RecommendationForm
        {...closingForm('recommendation', 'recommendation')}
        draft={recommendationDraft ?? recommendationDraftFor(null)}
        correcting={recorded !== null}
        onChange={(draft) => {
          setRecommendationDraft(draft);
          edited('recommendation');
        }}
        onSubmit={submitRecommendation}
        onCancel={
          recorded
            ? () => {
                resetClosingDraft('recommendation');
                setRecommendationFeedback(IDLE);
              }
            : undefined
        }
      />
    );
  }

  /** The latest dossier review, then its form or who reviews the dossier. */
  function dossierSection(view: CaseView) {
    const recorded = view.caseDetail.dossierReview;
    return closingSection(
      'dossierReview',
      'dossierReviewTitle',
      recorded ? (
        <>
          <VersionAttribution version={recorded} />
          <DossierReviewView review={recorded.value} register={view.register} />
        </>
      ) : (
        <p>{copy('dossierReviewMissing')}</p>
      ),
      dossierStep(view),
    );
  }

  function dossierStep(view: CaseView) {
    const current = view.caseDetail;
    const recorded = current.dossierReview;
    if (current.status !== 'open' || current.decision) return null;
    if (!authority.approve)
      return recorded ? null : (
        <p className="certification-note">{copy('dossierAwaitingApprover')}</p>
      );
    // The server refuses a review by anyone linked to any team version.
    if (!undecidedApprover(view))
      return (
        <p className="certification-blocked">{copy('dossierIndependence')}</p>
      );
    if (recorded && !dossierDraft)
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setDossierDraft(dossierReviewDraftFor(recorded.value));
            setDossierFeedback(IDLE);
          }}
        >
          {copy('correctDossierReview')}
        </button>
      );
    return (
      <DossierReviewForm
        {...closingForm('dossierReview', 'dossier-review')}
        draft={dossierDraft ?? dossierReviewDraftFor(null)}
        correcting={recorded !== null}
        documents={view.register.items}
        onChange={(draft) => {
          setDossierDraft(draft);
          edited('dossierReview');
        }}
        onSubmit={submitDossierReview}
        onCancel={
          recorded
            ? () => {
                resetClosingDraft('dossierReview');
                setDossierFeedback(IDLE);
              }
            : undefined
        }
      />
    );
  }

  /**
   * The latest decision with its earlier versions; before it, the
   * preconditions the read Case shows unmet and the decision form for an
   * approver outside the team, or who decides. While the Case is open, that
   * approver may correct the decided texts and references.
   */
  function decisionSection(view: CaseView) {
    const recorded = view.caseDetail.decision;
    const earlier = view.timeline.entries
      .flatMap((entry) =>
        entry.step === 'decision' && entry.id !== recorded?.id ? [entry] : [],
      )
      .reverse();
    return closingSection(
      'certificationDecision',
      'certificationDecisionTitle',
      recorded ? (
        <>
          <VersionAttribution version={recorded} />
          <CertificationDecisionView
            decision={recorded.value}
            register={view.register}
          />
          {earlier.length > 0 && (
            <details className="certification-history">
              <summary>
                {formatMessage(copy('decisionEarlierVersions'), {
                  count: earlier.length,
                })}
              </summary>
              <ol>
                {earlier.map((entry) => (
                  <li key={entry.id}>
                    <VersionAttribution version={entry} />
                    <CertificationDecisionView
                      decision={entry.value}
                      register={view.register}
                    />
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      ) : (
        <p>{copy('certificationDecisionMissing')}</p>
      ),
      certificationDecisionStep(view),
    );
  }

  function certificationDecisionStep(view: CaseView) {
    const current = view.caseDetail;
    const recorded = current.decision;
    if (
      current.status !== 'open' &&
      current.status !== 'refused' &&
      current.status !== 'certified'
    )
      return null;
    if (!authority.approve)
      return recorded ? null : (
        <p className="certification-note">
          {copy('certificationDecisionAwaitingApprover')}
        </p>
      );
    // The server refuses a decision by anyone linked to any team version.
    if (!decisionOffered(view))
      return recorded ? null : (
        <p className="certification-blocked">
          {copy('certificationDecisionIndependence')}
        </p>
      );
    if (recorded && !certificationDecisionDraft)
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setCertificationDecisionDraft(
              certificationDecisionDraftFor(recorded.value),
            );
            setCertificationDecisionFeedback(IDLE);
          }}
        >
          {copy('correctDecisionTexts')}
        </button>
      );
    const draft =
      certificationDecisionDraft ??
      emptyCertificationDecisionDraft(current.certificateData?.value ?? null);
    const outcome = recorded?.value.decision ?? null;
    const unmet = decisionPreconditions(current, outcome ?? draft.decision);
    // A blocked submit's alert lists them; the standing notice then yields.
    const announced = closingFeedback.certificationDecision.status === 'unmet';
    return (
      <>
        {unmet.length > 0 && !announced && (
          <div className="certification-blocked">
            <p>{copy('decisionPreconditionsTitle')}</p>
            <PreconditionList failures={unmet} />
            {namedDiscrepancies(
              blockingDecision(current.consistency).map((entry) => ({
                id: entry.id,
                rule: entry.rule ?? 'manual',
              })),
            )}
          </div>
        )}
        <CertificationDecisionForm
          {...closingForm('certificationDecision', 'certification-decision')}
          draft={draft}
          correcting={outcome}
          textsOnly={current.status === 'certified'}
          forms={attachmentsWithRole(view.register.items, 'decision_form')}
          today={latestBusinessDate()}
          onChange={(next) => {
            setCertificationDecisionDraft(next);
            edited('certificationDecision');
          }}
          onSubmit={submitCertificationDecision}
          onCancel={
            recorded
              ? () => {
                  resetClosingDraft('certificationDecision');
                  setCertificationDecisionFeedback(IDLE);
                }
              : undefined
          }
        />
      </>
    );
  }

  /**
   * The latest agreed data, how they differ from a grant, then their form,
   * correction or who agrees them.
   */
  function certificateDataSection(view: CaseView) {
    const current = view.caseDetail;
    const recorded = current.certificateData;
    const granted = current.decision?.value;
    const differences =
      recorded && granted?.decision === 'granted'
        ? certificateTextDifferences(granted.grantedTexts, recorded.value.texts)
        : [];
    return closingSection(
      'certificateData',
      'certificateDataTitle',
      recorded ? (
        <>
          <VersionAttribution version={recorded} />
          <CertificateDataView data={recorded.value} register={view.register} />
          {differences.length > 0 && (
            <CertificateTextDifferences differences={differences} />
          )}
        </>
      ) : (
        <p>{copy('certificateDataMissing')}</p>
      ),
      certificateDataStep(view),
    );
  }

  function certificateDataStep(view: CaseView) {
    const current = view.caseDetail;
    const recorded = current.certificateData;
    if (current.status !== 'open' && current.status !== 'certified')
      return null;
    if (!authority.manage)
      return recorded ? null : (
        <p className="certification-note">
          {copy('certificateDataAwaitingManager')}
        </p>
      );
    if (recorded && !certificateDataDraft)
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setCertificateDataDraft(certificateDataDraftFor(recorded.value));
            setCertificateDataFeedback(IDLE);
          }}
        >
          {copy('correctCertificateData')}
        </button>
      );
    const forms = attachmentsWithRole(view.register.items, 'certificate_data');
    if (forms.length === 0)
      return (
        <p className="certification-blocked">
          {copy('certificateDataNoDocument')}
        </p>
      );
    return (
      <CertificateDataForm
        {...closingForm('certificateData', 'certificate-data')}
        draft={certificateDataDraft ?? certificateDataDraftFor(null)}
        correcting={recorded !== null}
        forms={forms}
        onChange={(draft) => {
          setCertificateDataDraft(draft);
          edited('certificateData');
        }}
        onSubmit={submitCertificateData}
        onCancel={
          recorded
            ? () => {
                resetClosingDraft('certificateData');
                setCertificateDataFeedback(IDLE);
              }
            : undefined
        }
      />
    );
  }

  /**
   * The recorded Certificate with its server-computed validity; before it,
   * the form for an approver outside the team or why it waits.
   */
  function certificateSection(view: CaseView) {
    const recorded = view.caseDetail.certificate;
    return closingSection(
      'certificate',
      'certificateTitle',
      recorded ? (
        <CertificateView
          certificate={recorded}
          register={view.register}
          download={registerDownload(view)}
        />
      ) : (
        <p>{copy('certificateMissing')}</p>
      ),
      certificateStep(view),
    );
  }

  function certificateStep(view: CaseView) {
    if (view.caseDetail.status !== 'open') return null;
    const hold = certificateHold(view);
    if (hold === 'certificateAwaitingApprover')
      return <p className="certification-note">{copy(hold)}</p>;
    if (hold !== null)
      return <p className="certification-blocked">{copy(hold)}</p>;
    return (
      <CertificateForm
        {...closingForm('certificate', 'certificate')}
        notBefore={view.caseDetail.decision?.value.decidedOn}
        draft={{
          ...certificateDraft,
          number: view.caseDetail.release.drafts.at(-1)?.value.number ?? '',
        }}
        pdfs={attachmentsWithRole(view.register.items, 'certificate')}
        onChange={(draft) => {
          setCertificateDraft(draft);
          edited('certificate');
        }}
        onSubmit={submitCertificate}
      />
    );
  }
}

function planKind(stage: AuditStage): StageKind {
  return stage === 'stage_1' ? 'stage1Plan' : 'stage2Plan';
}

function reportKind(stage: AuditStage): StageKind {
  return stage === 'stage_1' ? 'stage1Report' : 'stage2Report';
}

function stagePath(
  caseId: string,
  stage: AuditStage,
  record: 'plan' | 'report',
): string {
  return `/certification-cases/${encodeURIComponent(caseId)}/stages/${stage === 'stage_1' ? 'stage-1' : 'stage-2'}/${record}`;
}

function stagePlanOf(current: CaseDetail, stage: AuditStage) {
  return stage === 'stage_1' ? current.stage1Plan : current.stage2Plan;
}

function confirmedOnSite(
  confirmed: { stage1OnSite: string; stage2OnSite: string },
  stage: AuditStage,
): string {
  return stage === 'stage_1' ? confirmed.stage1OnSite : confirmed.stage2OnSite;
}

/**
 * Why a Stage cannot be planned now, as the server would refuse it: the
 * latest team version is not approved, or Stage 2 lacks a Stage 1 report
 * concluding that the client is ready, or a Stage 1 nonconformity is not
 * yet verified effective.
 */
function planBlocked(
  current: CaseDetail,
  stage: AuditStage,
): CertificationMessageKey | null {
  if (!approvedTeam(current)) return 'blockedStagePlanTeamNotApproved';
  if (stage === 'stage_1') return null;
  if (!current.stage1Report) return 'blockedStage2BeforeStage1Report';
  if (current.stage1Report.value.conclusion !== 'ready')
    return 'blockedStage2NotReady';
  return current.findings.some(
    (finding) =>
      finding.stage === 'stage_1' &&
      isNonconformity(finding.classification) &&
      finding.status !== 'verified_effective',
  )
    ? 'blockedStage2NonconformityOpen'
    : null;
}

/**
 * The Finding command an open form records, mirroring the server's checks
 * on the read Case; the server rechecks every rule and the actor's role.
 */
function findingSubmission(
  form: FindingForm,
  view: CaseView,
  roles: FindingRoles,
): FindingSubmission {
  const { caseDetail: current, register } = view;
  const findingsPath = `/certification-cases/${encodeURIComponent(current.id)}/findings`;
  const expectedRevision = current.revision;
  const ready = (path: string, body: object): FindingSubmission => ({
    status: 'ready',
    path,
    body: JSON.stringify({ expectedRevision, ...body }),
  });
  const refused = (message: CertificationMessageKey): FindingSubmission => ({
    status: 'refused',
    message,
  });
  if (form.command === 'record') {
    if (!roles.leader) return { status: 'unavailable' };
    const check = findingFromDraft(form.draft, {
      stage: form.stage,
      register: register.items,
    });
    if (check.status !== 'valid')
      return refused(findingCheckMessage(check.status, 'findingValidation'));
    return ready(findingsPath, {
      stage: form.stage,
      classification: check.classification,
      ...check.statement,
    });
  }
  const finding = current.findings.find((entry) => entry.id === form.findingId);
  const role =
    form.command === 'reclassification'
      ? roles.independentApprover
      : roles.leader;
  if (!finding || !role) return { status: 'unavailable' };
  const path = (update: string) =>
    `${findingsPath}/${encodeURIComponent(finding.id)}/${update}`;
  switch (form.command) {
    case 'correction': {
      const check = correctionFromDraft(form.draft, {
        finding,
        register: register.items,
      });
      if (check.status === 'reasonRequired') return refused('reasonRequired');
      if (check.status !== 'valid')
        return refused(
          findingCheckMessage(check.status, 'findingStatementValidation'),
        );
      return ready(path('correction'), {
        reason: check.reason,
        ...check.statement,
      });
    }
    case 'classification':
    case 'reclassification': {
      const check = classificationFromDraft(form.draft, finding);
      if (check.status === 'unchanged')
        return refused('classificationUnchanged');
      if (check.status !== 'valid')
        return refused(
          findingCheckMessage(check.status, 'classificationValidation'),
        );
      return ready(path(form.command), {
        reason: check.reason,
        classification: check.classification,
      });
    }
    case 'response': {
      const check = responseFromDraft(form.draft, register.items);
      return check.status === 'valid'
        ? ready(path('response'), check.value)
        : refused('responseValidation');
    }
    case 'planJudgment': {
      const check = judgmentFromDraft(form.draft);
      return check.status === 'valid'
        ? ready(path('plan-judgment'), check.value)
        : refused('judgmentValidation');
    }
    case 'verification': {
      const check = verificationFromDraft(form.draft, register.items);
      return check.status === 'valid'
        ? ready(path('verification'), check.value)
        : refused('verificationValidation');
    }
  }
  return unexpected(form);
}

/** A Finding draft's refusal: incomplete, or one of the classification rules. */
function findingCheckMessage(
  status: 'incomplete' | ClassificationRefusal,
  incomplete: CertificationMessageKey,
): CertificationMessageKey {
  switch (status) {
    case 'incomplete':
      return incomplete;
    case 'clauseRequired':
      return 'findingClauseRequired';
    case 'classificationStage':
      return 'findingClassificationStage';
    case 'evidenceRequired':
      return 'findingEvidenceRequired';
  }
  return unexpected(status);
}

/** The button and form title of each later Finding version. */
function findingCommandLabel(command: FindingCommand): CertificationMessageKey {
  switch (command) {
    case 'response':
      return 'recordResponse';
    case 'planJudgment':
      return 'judgePlan';
    case 'verification':
      return 'verifyFinding';
    case 'correction':
      return 'correctFinding';
    case 'classification':
      return 'changeClassification';
    case 'reclassification':
      return 'reclassifyFinding';
  }
  return unexpected(command);
}

function planMessage(
  check: Exclude<StagePlanCheck, { status: 'valid' }>,
): CertificationMessageKey {
  switch (check.status) {
    case 'incomplete':
      return 'stagePlanValidation';
    case 'dates':
      return 'stageDatesRule';
    case 'stage2Start':
      return 'stage2StartRule';
    case 'deviationNote':
      return 'stageDeviationNoteRequired';
    case 'reasonRequired':
      return 'reasonRequired';
  }
  return unexpected(check.status);
}

function reportMessage(
  check: Exclude<StageReportCheck<unknown>, { status: 'valid' }>,
  stage: AuditStage,
): CertificationMessageKey {
  switch (check.status) {
    case 'incomplete':
      return stage === 'stage_1'
        ? 'stage1ReportValidation'
        : 'stage2ReportValidation';
    case 'documentReview':
      return 'stageDocumentReviewRequired';
    case 'beforePlan':
      return 'stageReportDateRule';
    case 'acting':
      return 'actingValidation';
    case 'reasonRequired':
      return 'reasonRequired';
  }
  return unexpected(check.status);
}

/** Why a team decision draft is refused before it is sent. */
function teamDecisionMessage(
  status: Exclude<DecisionCheck, { status: 'valid' }>['status'],
): CertificationMessageKey {
  switch (status) {
    case 'incomplete':
      return 'decisionValidation';
    case 'acting':
      return 'actingValidation';
    case 'actingOnTeam':
      return 'actingOnTeam';
    case 'conflictDeclared':
      return 'decisionConflictOnly';
    case 'attestation':
      return 'teamDecisionAttestationRequired';
  }
  return unexpected(status);
}

/** Why a dossier review draft is refused before it is sent. */
function dossierReviewMessage(
  status: Exclude<DossierReviewCheck, { status: 'valid' }>['status'],
): CertificationMessageKey {
  switch (status) {
    case 'incomplete':
      return 'dossierReviewValidation';
    case 'acting':
      return 'actingValidation';
    case 'actingOnTeam':
      return 'actingOnTeam';
    case 'attestation':
      return 'dossierAttestationRequired';
    case 'reasonRequired':
      return 'reasonRequired';
  }
  return unexpected(status);
}

/** The consultant the accepted application declared, if any. */
function declaredConsultant(current: CaseDetail): string | null {
  const consultant = current.application?.value.consultant;
  return consultant?.used ? consultant.name : null;
}

function agreementMessage(
  check: Exclude<AgreementCheck, { status: 'valid' }>,
): CertificationMessageKey {
  switch (check.status) {
    case 'incomplete':
      return 'agreementValidation';
    case 'future':
      return 'agreementInFuture';
    case 'reasonRequired':
      return 'reasonRequired';
  }
  return unexpected(check.status);
}

function teamMessage(
  check: Exclude<TeamCheck, { status: 'valid' }>,
): CertificationMessageKey {
  switch (check.status) {
    case 'incomplete':
      return 'teamValidation';
    case 'conflictNote':
      return 'teamConflictNoteRequired';
    case 'link':
      return 'teamLinkInvalid';
    case 'leader':
      return 'teamLeaderRule';
    case 'category':
      return 'teamCategoryRule';
    case 'analysisRequired':
      return 'teamAnalysisRequired';
    case 'reasonRequired':
      return 'reasonRequired';
  }
  return unexpected(check.status);
}

/** A correction without a reason, or a first record with one, per step. */
function correctionReasonRefusal(kind: MutationKind): CertificationMessageKey {
  switch (kind) {
    case 'duration':
      return 'blockedDurationCorrectionReason';
    case 'agreement':
      return 'blockedAgreementCorrectionReason';
    case 'team':
      return 'blockedTeamCorrectionReason';
    case 'stage1Plan':
    case 'stage2Plan':
      return 'blockedStagePlanCorrectionReason';
    case 'stage1Report':
    case 'stage2Report':
      return 'blockedStageReportCorrectionReason';
    case 'finding':
      return 'blockedFindingCorrectionReason';
    case 'exchange':
      return 'exchangeReasonRequired';
    case 'recommendation':
    case 'dossierReview':
    case 'certificationDecision':
    case 'certificateData':
    case 'certificateDraft':
    case 'clientOpinion':
    case 'draftApproval':
    case 'certificate':
    case 'certificateRevision':
      return 'blockedVersionCorrectionReason';
    case 'open':
    case 'application':
    case 'review':
    case 'attach':
    case 'decision':
    case 'discrepancy':
    case 'discrepancyResolution':
    case 'reverification':
    case 'withdrawal':
      return 'blockedCorrectionReason';
  }
  return unexpected(kind);
}

/** Whether a command records one of the closing steps. */
function closing(kind: MutationKind): boolean {
  return CLOSING_KINDS.some((entry) => entry === kind);
}

/** Who the server found on the audit team, in the words of each command. */
function independenceRefusal(kind: MutationKind): Feedback {
  switch (kind) {
    case 'finding':
      return refusedWith('findingIndependence', true);
    case 'team':
      return refusedWith('teamMemberDecided', true);
    case 'dossierReview':
      return refusedWith('dossierIndependence', true);
    // The named decision maker or signatory may be corrected in the draft.
    case 'certificationDecision':
      return refusedWith('decisionMakerIndependence');
    case 'certificateDraft':
    case 'clientOpinion':
    case 'certificate':
    case 'certificateRevision':
      return refusedWith('certificateIndependence');
    // Only the person approving on behalf of the certification body is checked.
    case 'draftApproval':
    case 'stage1Report':
    case 'stage2Report':
      return refusedWith('actingOnTeam');
    case 'discrepancy':
    case 'discrepancyResolution':
    case 'reverification':
      return refusedWith('discrepancyIndependence', true);
    case 'decision':
    case 'open':
    case 'application':
    case 'review':
    case 'duration':
    case 'attach':
    case 'agreement':
    case 'stage1Plan':
    case 'stage2Plan':
    case 'recommendation':
    case 'certificateData':
    case 'exchange':
    case 'withdrawal':
      return refusedWith('teamIndependence', true);
  }
  return unexpected(kind);
}

/** A chosen attachment without its role, in the words of each command. */
function attachmentRoleRefusal(kind: MutationKind): CertificationMessageKey {
  switch (kind) {
    case 'finding':
      return 'findingEvidenceUnavailable';
    case 'certificationDecision':
      return 'decisionFormRole';
    case 'certificateData':
      return 'certificateDataDocumentRole';
    case 'certificateDraft':
    case 'clientOpinion':
    case 'draftApproval':
    case 'certificate':
    case 'certificateRevision':
      return 'certificatePdfRole';
    case 'discrepancy':
    case 'discrepancyResolution':
      return 'discrepancyDocumentUnavailable';
    case 'open':
    case 'application':
    case 'review':
    case 'duration':
    case 'attach':
    case 'agreement':
    case 'team':
    case 'decision':
    case 'stage1Plan':
    case 'stage2Plan':
    case 'stage1Report':
    case 'stage2Report':
    case 'recommendation':
    case 'dossierReview':
      return 'stageAttachmentRole';
    case 'exchange':
    case 'reverification':
    case 'withdrawal':
      return 'discrepancyDocumentUnavailable';
  }
  return unexpected(kind);
}

/** A missing attestation of independence, in the words of each command. */
function attestationRefusal(kind: MutationKind): CertificationMessageKey {
  switch (kind) {
    case 'decision':
      return 'teamDecisionAttestationRequired';
    case 'dossierReview':
      return 'dossierAttestationRequired';
    case 'certificateDraft':
    case 'clientOpinion':
    case 'draftApproval':
    case 'certificate':
    case 'certificateRevision':
      return 'certificateAttestationRequired';
    case 'certificationDecision':
    case 'open':
    case 'application':
    case 'review':
    case 'duration':
    case 'attach':
    case 'agreement':
    case 'team':
    case 'finding':
    case 'stage1Plan':
    case 'stage2Plan':
    case 'stage1Report':
    case 'stage2Report':
    case 'recommendation':
    case 'certificateData':
    case 'discrepancy':
    case 'discrepancyResolution':
    case 'exchange':
    case 'reverification':
    case 'withdrawal':
      return 'decisionAttestationRequired';
  }
  return unexpected(kind);
}

/**
 * The server's unmet decision preconditions in plain language; an unknown
 * list is never shown as the server's reasons.
 */
function preconditionsRefusal(result: ApiResult<unknown>): Feedback {
  const failures = parseDecisionFailures(conflictFailures(result));
  const named = parseBlockingDiscrepancies(conflictDiscrepancies(result));
  return failures
    ? {
        status: 'unmet',
        source: 'server',
        failures,
        discrepancies: named ?? [],
      }
    : refusedWith('decisionPreconditionsUnknown', true);
}

function hexadecimal(digest: ArrayBuffer): string {
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/** Why the proposal read gave no proposal, in plain language. */
function proposalRefusal(result: ApiResult<unknown>): CertificationMessageKey {
  switch (result.status) {
    case 'forbidden':
    case 'unauthorized':
      return 'denied';
    case 'notFound':
      return 'unavailable';
    case 'validation':
      return 'invalid';
    case 'conflict':
      return conflictCode(result) === 'CERTIFICATION_APPLICATION_NOT_ACCEPTED'
        ? 'durationNotAccepted'
        : 'proposalUnavailable';
    case 'ok':
    case 'error':
      return 'proposalUnavailable';
  }
  return unexpected(result);
}

function confirmationMessage(
  check: Exclude<ConfirmationCheck, { status: 'valid' }>,
): CertificationMessageKey {
  switch (check.status) {
    case 'invalidValues':
      return 'durationValuesValidation';
    case 'stagesMismatch':
      return 'durationStagesMismatch';
    case 'justificationRequired':
      return 'durationJustificationRequired';
    case 'acting':
      return 'actingValidation';
    case 'reasonRequired':
      return 'reasonRequired';
  }
  return unexpected(check);
}

/**
 * The detail and its timeline must describe the same recorded versions, and
 * no Finding record shares the revision of a step version.
 */
function timelineMatches(detail: CaseDetail, timeline: CaseTimeline) {
  const last = timeline.entries.at(-1);
  const recorded = (id: string, version: number) =>
    timeline.entries.some(
      (entry) => entry.id === id && entry.version === version,
    );
  const steps = new Set(timeline.entries.map((entry) => entry.caseRevision));
  return (
    (last === undefined || last.caseRevision <= detail.revision) &&
    [
      ...detail.release.drafts,
      ...detail.release.opinions,
      ...detail.release.approvals,
    ].every((version) => recorded(version.id, version.version)) &&
    detail.release.revisions.every((revision) => {
      const decision = timeline.entries.find(
        (entry) => entry.id === revision.decisionVersionId,
      );
      const data = timeline.entries.find(
        (entry) => entry.id === revision.certificateDataVersionId,
      );
      return (
        !steps.has(revision.caseRevision) &&
        decision?.step === 'decision' &&
        decision.value.decision === 'granted' &&
        decision.caseRevision < revision.caseRevision &&
        data?.step === 'certificate_data' &&
        data.caseRevision < revision.caseRevision &&
        certificateTextDifferences(revision.texts, decision.value.grantedTexts)
          .length === 0 &&
        certificateTextDifferences(revision.texts, data.value.texts).length ===
          0
      );
    }) &&
    detail.findings.every((finding) =>
      finding.records.every((record) => !steps.has(record.caseRevision)),
    ) &&
    (detail.application === null ||
      recorded(detail.application.id, detail.application.version)) &&
    (detail.applicationReview === null ||
      recorded(
        detail.applicationReview.id,
        detail.applicationReview.version,
      )) &&
    (detail.duration === null ||
      recorded(detail.duration.id, detail.duration.version)) &&
    (detail.agreement === null ||
      recorded(detail.agreement.id, detail.agreement.version)) &&
    (detail.team === null || recorded(detail.team.id, detail.team.version)) &&
    (detail.teamDecision === null ||
      recorded(detail.teamDecision.id, detail.teamDecision.version)) &&
    [
      detail.stage1Plan,
      detail.stage1Report,
      detail.stage2Plan,
      detail.stage2Report,
      detail.recommendation,
      detail.dossierReview,
      detail.decision,
      detail.certificateData,
    ].every(
      (version) => version === null || recorded(version.id, version.version),
    ) &&
    // Each decision concerns a team version the timeline records before it.
    timeline.entries.every(
      (entry, index) =>
        entry.step !== 'team_decision' ||
        timeline.entries
          .slice(0, index)
          .some(
            (earlier) =>
              earlier.step === 'team' &&
              earlier.version === entry.value.teamVersion,
          ),
    )
  );
}

/**
 * The register belongs to the same Case read: no attachment beyond the Case
 * revision or at the revision of a step or Finding record, every recorded
 * agreement refers to an attachment with the agreement role attached before
 * it, every Stage record to attachments with the roles of their slots
 * attached before it, every Finding record to evidence of this Case attached
 * before it, every decision form and Certificate data form to an attachment
 * with its role attached before it, every signed form of an act on behalf
 * of the certification body and every evidence of an impartiality analysis
 * to an attachment of any role attached before it, and the Certificate to
 * an attachment with the Certificate role.
 */
function registerMatches(
  detail: CaseDetail,
  timeline: CaseTimeline,
  register: DocumentRegister,
) {
  const certificateAttachments = [
    detail.certificate?.attachmentId,
    ...detail.release.revisions.map((revision) => revision.attachmentId),
  ];
  const certificateVersions = certificateAttachments.flatMap((id) =>
    register.items
      .filter((item) => item.id === id)
      .map((item) => item.versionId),
  );
  const findingRecords = detail.findings.flatMap((finding) => finding.records);
  const steps = new Set([
    ...timeline.entries.map((entry) => entry.caseRevision),
    ...findingRecords.map((record) => record.caseRevision),
  ]);
  return (
    findingRecords.every((record) =>
      recordEvidence(record).every((attachmentId) =>
        register.items.some(
          (item) =>
            item.id === attachmentId && item.caseRevision < record.caseRevision,
        ),
      ),
    ) &&
    register.items.every(
      (item) =>
        item.caseRevision <= detail.revision && !steps.has(item.caseRevision),
    ) &&
    timeline.entries.every(
      (entry) =>
        entry.step !== 'agreement' ||
        register.items.some(
          (item) =>
            item.id === entry.value.attachmentId &&
            item.role === 'agreement' &&
            item.caseRevision < entry.caseRevision,
        ),
    ) &&
    timeline.entries.every((entry) =>
      stageAttachmentsOf(entry).every(({ slot, attachmentId }) =>
        register.items.some(
          (item) =>
            item.id === attachmentId &&
            slotRoles(slot).includes(item.role) &&
            item.caseRevision < entry.caseRevision,
        ),
      ),
    ) &&
    timeline.entries.every((entry) =>
      closingAttachmentsOf(entry).every(({ role, attachmentId }) =>
        register.items.some(
          (item) =>
            item.id === attachmentId &&
            item.role === role &&
            item.caseRevision < entry.caseRevision,
        ),
      ),
    ) &&
    timeline.entries.every((entry) =>
      citedAttachmentsOf(entry).every((attachmentId) =>
        register.items.some(
          (item) =>
            item.id === attachmentId && item.caseRevision < entry.caseRevision,
        ),
      ),
    ) &&
    new Set(certificateVersions).size === certificateVersions.length &&
    detail.release.revisions.every((revision) => {
      const transmission = revision.transmission;
      return (
        transmission === null ||
        (!transmission.attachmentIds.includes(
          detail.certificate?.attachmentId ?? '',
        ) &&
          transmission.attachmentIds.every((id) =>
            register.items.some(
              (item) =>
                item.id === id && item.caseRevision < transmission.caseRevision,
            ),
          ))
      );
    }) &&
    detail.release.revisions.every(
      (revision) =>
        register.items.some(
          (item) =>
            item.id === revision.attachmentId &&
            item.role === 'certificate' &&
            item.caseRevision < revision.caseRevision,
        ) &&
        (revision.onBehalf?.formAttachmentId == null ||
          register.items.some(
            (item) =>
              item.id === revision.onBehalf?.formAttachmentId &&
              item.caseRevision < revision.caseRevision,
          )),
    ) &&
    (detail.certificate === null ||
      register.items.some(
        (item) =>
          item.id === detail.certificate?.attachmentId &&
          item.role === 'certificate',
      ))
  );
}

/** The forms a closing step cites, each with the role it must carry. */
function closingAttachmentsOf(
  entry: CaseTimeline['entries'][number],
): { role: CertificationDocumentRole; attachmentId: string }[] {
  switch (entry.step) {
    case 'decision': {
      const form = entry.value.decisionFormAttachmentId;
      return form === null
        ? []
        : [{ role: 'decision_form', attachmentId: form }];
    }
    case 'certificate_draft':
      return [
        { role: 'certificate_draft', attachmentId: entry.value.attachmentId },
      ];
    case 'client_opinion':
    case 'certificate_draft_approval':
      return [];
    case 'certificate_data':
      return [
        {
          role: 'certificate_data',
          attachmentId: entry.value.agreementAttachmentId,
        },
      ];
    case 'application':
    case 'application_review':
    case 'duration':
    case 'agreement':
    case 'team':
    case 'team_decision':
    case 'stage_1_plan':
    case 'stage_1_report':
    case 'stage_2_plan':
    case 'stage_2_report':
    case 'recommendation':
    case 'dossier_review':
      return [];
  }
  return unexpected(entry);
}

/**
 * The attachments of any role a timeline entry cites: the signed forms of
 * its acts on behalf of the certification body and the evidence of a
 * team's impartiality analysis.
 */
function citedAttachmentsOf(entry: CaseTimeline['entries'][number]): string[] {
  const form = (...acts: (ActAttribution | null)[]) =>
    acts.flatMap((act) =>
      act?.formAttachmentId ? [act.formAttachmentId] : [],
    );
  switch (entry.step) {
    case 'application_review':
    case 'duration':
    case 'team_decision':
      return form(entry.value.onBehalf);
    case 'dossier_review':
      return form(entry.value.reviewedBy, entry.value.approvedBy);
    case 'team':
      return entry.value.impartialityAnalysis?.evidenceAttachmentIds ?? [];
    case 'certificate_draft_approval':
      return form(entry.value.onBehalf);
    case 'application':
    case 'agreement':
    case 'stage_1_plan':
    case 'stage_1_report':
    case 'stage_2_plan':
    case 'stage_2_report':
    case 'recommendation':
    case 'decision':
    case 'certificate_data':
    case 'certificate_draft':
    case 'client_opinion':
      return [];
  }
  return unexpected(entry);
}

/** The attachments a timeline entry refers to by slot; none outside Stages. */
function stageAttachmentsOf(entry: CaseTimeline['entries'][number]) {
  switch (entry.step) {
    case 'stage_1_plan':
    case 'stage_1_report':
    case 'stage_2_plan':
    case 'stage_2_report':
      return stageAttachmentReferences(entry.value);
    case 'application':
    case 'application_review':
    case 'duration':
    case 'agreement':
    case 'team':
    case 'team_decision':
    case 'recommendation':
    case 'dossier_review':
    case 'decision':
    case 'certificate_data':
    case 'certificate_draft':
    case 'client_opinion':
    case 'certificate_draft_approval':
      return [];
  }
  return unexpected(entry);
}

function reuse(feedback: Feedback, next: Omit<Intent, 'key'>): Intent {
  return feedback.status === 'uncertain' &&
    feedback.intent.path === next.path &&
    feedback.intent.body === next.body
    ? feedback.intent
    : { ...next, key: crypto.randomUUID() };
}

function blockedUntilReload(feedback: Feedback): boolean {
  return feedback.status === 'refused' && feedback.reload;
}

function refusedWith(
  message: CertificationMessageKey,
  reload = false,
): Feedback {
  return { status: 'refused', message, reload };
}

/** Only input refusals name fields; stale, denied and other state alerts do not. */
function exchangeFieldFeedback({
  kind,
  feedback,
  id,
}: {
  kind: 'exchange' | 'reverification' | 'withdrawal';
  feedback: Feedback;
  id: string;
}): ExchangeFieldFeedback {
  if (feedback.status !== 'refused') return null;
  switch (feedback.message) {
    case 'exchangeInFuture':
      return { id, field: 'businessDate' };
    case 'exchangeNoteRequired':
      return { id, field: 'note' };
    case 'exchangeReasonRequired':
    case 'withdrawalReasonRequired':
      return { id, field: 'reason' };
    case 'discrepancyDocumentUnavailable':
      return kind === 'exchange' ? { id, field: 'attachmentIds' } : null;
    case 'exchangeValidation':
    case 'reverificationValidation':
    case 'invalid':
      return { id, field: 'draft' };
    default:
      return null;
  }
}

/** A refused or failed command, in the plain language of its reason. */
function commandFeedback(
  kind: MutationKind,
  result: ApiResult<unknown>,
  intent: Intent,
): Feedback {
  switch (result.status) {
    case 'forbidden':
      // Attaching also needs the Document rights; the Case stays readable.
      return refusedWith(kind === 'attach' ? 'documentsDenied' : 'denied');
    case 'unauthorized':
      return refusedWith('denied');
    case 'notFound':
      return refusedWith(
        kind === 'open'
          ? 'entityUnavailable'
          : kind === 'attach'
            ? 'attachUnavailable'
            : 'unavailable',
      );
    case 'validation':
      switch (result.code) {
        case 'CERTIFICATION_REVIEW_CRITERIA_NOT_MET':
          return refusedWith('criteriaNotMet');
        case 'CERTIFICATION_DURATION_JUSTIFICATION_REQUIRED':
          return refusedWith('durationJustificationRequired');
        case 'CERTIFICATION_DURATION_STAGES_MISMATCH':
          return refusedWith('durationStagesMismatch');
        case 'CERTIFICATION_DURATION_REFUSED':
          return refusedWith('durationRefused');
        case 'CERTIFICATION_TEAM_LEADER':
          return refusedWith('teamLeaderRule');
        case 'CERTIFICATION_TEAM_CATEGORY':
          return refusedWith('teamCategoryRule');
        case 'CERTIFICATION_TEAM_CONFLICT_NOTE':
          return refusedWith('teamConflictNoteRequired');
        case 'CERTIFICATION_TEAM_MEMBER_UNKNOWN':
          return refusedWith('teamMemberUnknown');
        case 'CERTIFICATION_STAGE_DATES':
          return refusedWith('stageDatesRule');
        case 'CERTIFICATION_STAGE_DEVIATION_NOTE':
          // The client mirrors the rule: the confirmed duration has changed.
          return refusedWith('stageDeviationNoteRule', true);
        case 'CERTIFICATION_DOCUMENT_REVIEW_INCOMPLETE':
          return refusedWith('stageDocumentReviewRequired');
        case 'CERTIFICATION_FINDING_CLAUSE_REQUIRED':
          return refusedWith('findingClauseRequired');
        case 'CERTIFICATION_FINDING_CLASSIFICATION_STAGE':
          return refusedWith('findingClassificationStage');
        case 'CERTIFICATION_FINDING_EVIDENCE_REQUIRED':
          return refusedWith('findingEvidenceRequired');
        case 'CERTIFICATION_INDEPENDENCE_ATTESTATION':
          return refusedWith(attestationRefusal(kind));
        case 'CERTIFICATION_TEAM_ANALYSIS_REQUIRED':
          return refusedWith('teamAnalysisRequired');
        case 'CERTIFICATION_EXCHANGE_NOTE_REQUIRED':
          return refusedWith('exchangeNoteRequired');
        default:
          return refusedWith('invalid');
      }
    case 'conflict':
      switch (conflictCode(result)) {
        case 'STALE_VERSION':
          return refusedWith('stale', true);
        case 'CERTIFICATION_APPLICATION_NOT_ACCEPTED':
          return refusedWith('durationNotAccepted', true);
        case 'CERTIFICATION_ORDER_REFERENCE_TAKEN':
          return refusedWith('referenceTaken');
        case 'CERTIFICATION_DISCREPANCY_NOT_OPEN':
          return refusedWith('discrepancyNotOpen', true);
        case 'CERTIFICATION_DISCREPANCY_CRITICAL':
          return refusedWith('discrepancyCritical', true);
        case 'CERTIFICATION_DISCREPANCY_CORRECTED_BY_RECORD':
          return refusedWith('discrepancyCorrectedByRecord', true);
        case 'CERTIFICATION_NOT_ON_TEAM':
          return refusedWith('discrepancyNotOnTeam', true);
        case 'CERTIFICATION_CORRECTING_RECORD_UNKNOWN':
          return refusedWith('discrepancyCorrectionUnknown', true);
        case 'CERTIFICATION_DISCREPANCIES_OPEN':
          return refusedWith('certificateDiscrepanciesOpen', true);
        case 'CERTIFICATION_APPLICATION_MISSING':
          return refusedWith('blockedReviewBeforeApplication', true);
        case 'CERTIFICATION_APPLICATION_ALREADY_REVIEWED':
          return refusedWith('blockedAlreadyReviewed', true);
        case 'CERTIFICATION_CASE_CLOSED':
          return refusedWith(
            closing(kind) ? 'caseClosedRefusal' : 'blockedClosed',
            true,
          );
        case 'CERTIFICATION_CORRECTION_REASON':
          return refusedWith(correctionReasonRefusal(kind), true);
        case 'CERTIFICATION_DOCUMENT_ALREADY_ATTACHED':
          return refusedWith('attachDuplicate', true);
        case 'CERTIFICATION_DURATION_MISSING':
          return refusedWith('blockedAgreementBeforeDuration', true);
        case 'CERTIFICATION_AGREEMENT_DOCUMENT':
          return refusedWith('agreementDocumentRole', true);
        case 'CERTIFICATION_AGREEMENT_IN_FUTURE':
          return refusedWith('agreementInFuture');
        case 'CERTIFICATION_ACT_IN_FUTURE':
          return refusedWith('actInFuture');
        case 'CERTIFICATION_AGREEMENT_MISSING':
          return refusedWith('blockedTeamBeforeAgreement', true);
        case 'CERTIFICATION_TEAM_NOT_PENDING':
          return refusedWith('blockedTeamNotPending', true);
        case 'CERTIFICATION_INDEPENDENCE':
          return independenceRefusal(kind);
        case 'CERTIFICATION_TEAM_CONFLICT_DECLARED':
          return refusedWith('teamConflictDeclared');
        case 'CERTIFICATION_CORRECTION_UNCHANGED':
          return refusedWith('blockedCorrectionUnchanged');
        case 'CERTIFICATION_TEAM_NOT_APPROVED':
          return refusedWith('blockedStagePlanTeamNotApproved', true);
        case 'CERTIFICATION_STAGE_1_NOT_READY':
          return refusedWith('blockedStage2NotReady', true);
        case 'CERTIFICATION_STAGE_1_NONCONFORMITY_OPEN':
          return refusedWith('blockedStage2NonconformityOpen', true);
        case 'CERTIFICATION_STAGE_CLOSED':
          return refusedWith('blockedFindingStageClosed', true);
        case 'CERTIFICATION_FINDING_NOT_OPEN':
          return refusedWith('findingNotOpen', true);
        case 'CERTIFICATION_FINDING_NO_RESPONSE':
          return refusedWith('findingNoResponse', true);
        case 'CERTIFICATION_FINDING_PLAN_NOT_ADEQUATE':
          return refusedWith('findingPlanNotAdequate', true);
        case 'CERTIFICATION_FINDING_LIMIT_PASSED':
          return refusedWith('findingLimitPassed', true);
        case 'CERTIFICATION_STAGE_DATES':
          // A Stage 2 start, or a report date, against the read Case.
          return refusedWith(
            kind === 'stage1Plan' || kind === 'stage2Plan'
              ? 'stage2StartRule'
              : 'stageReportDateRule',
          );
        case 'CERTIFICATION_STAGE_NOT_PLANNED':
          return refusedWith(
            kind === 'finding'
              ? 'blockedFindingStageNotPlanned'
              : 'blockedStageReportBeforePlan',
            true,
          );
        case 'CERTIFICATION_NOT_TEAM_LEADER':
          return refusedWith(
            kind === 'finding'
              ? 'blockedFindingNotTeamLeader'
              : kind === 'recommendation'
                ? 'blockedRecommendationNotTeamLeader'
                : 'blockedNotTeamLeader',
            true,
          );
        case 'CERTIFICATION_ATTACHMENT_ROLE':
          return refusedWith(attachmentRoleRefusal(kind), true);
        case 'CERTIFICATION_STAGE_2_NOT_REPORTED':
          return refusedWith(
            kind === 'certificateData'
              ? 'blockedCertificateDataBeforeStage2'
              : 'blockedRecommendationBeforeStage2',
            true,
          );
        case 'CERTIFICATION_FINDINGS_OPEN':
          return refusedWith('blockedRecommendationFindingsOpen', true);
        case 'CERTIFICATION_RECOMMENDATION_MISSING':
          return refusedWith('blockedDossierBeforeRecommendation', true);
        case 'CERTIFICATION_DECIDED':
          return refusedWith('blockedDecided', true);
        case 'CERTIFICATION_ISSUED_DECISION_FIXED':
          return refusedWith('issuedDecisionFixed', true);
        case 'CERTIFICATION_DECISION_OUTCOME_FIXED':
          return refusedWith('decisionOutcomeFixedRefusal', true);
        case 'CERTIFICATION_DECISION_PRECONDITIONS':
          return preconditionsRefusal(result);
        case 'CERTIFICATION_NOT_GRANTED':
          return refusedWith('blockedCertificateNotGranted', true);
        case 'CERTIFICATION_CERTIFICATE_DATA_MISSING':
          return refusedWith('blockedCertificateDataMissing', true);
        case 'CERTIFICATION_CERTIFICATE_DATA_DIFFERS':
          return refusedWith('certificateDataDiffers', true);
        case 'CERTIFICATION_CERTIFICATE_APPROVAL_REQUIRED':
        case 'CERTIFICATION_DRAFT_APPROVAL_PRECONDITIONS':
        case 'CERTIFICATION_DRAFT_OUTDATED':
          return refusedWith('blockedCertificateApprovalMissing', true);
        case 'CERTIFICATION_CERTIFICATE_NUMBER_DIFFERS':
        case 'CERTIFICATION_CERTIFICATE_ISSUE_DATE':
          return refusedWith('certificateValidation');
        case 'CERTIFICATION_CERTIFICATE_PDF_REUSED':
          return refusedWith('certificatePdfReused', true);
        case 'CERTIFICATION_CERTIFICATE_NUMBER_TAKEN':
          return refusedWith('certificateNumberTaken');
        case 'CERTIFICATION_EXCHANGE_IN_FUTURE':
          return refusedWith('exchangeInFuture');
        case 'CERTIFICATION_REVERIFICATION_SOURCE_UNKNOWN':
          return refusedWith('reverificationSourceUnknown', true);
        case 'CERTIFICATION_REVERIFICATION_AUTOMATIC':
        case 'CERTIFICATION_REVERIFICATION_WITHDRAWN':
          return refusedWith('reverificationNotWithdrawable', true);
        default:
          return refusedWith('conflict', kind !== 'open');
      }
    case 'ok':
    case 'error':
      // A transport failure or unexpected status may hide a recorded command.
      return { status: 'uncertain', intent };
  }
  return unexpected(result);
}

function refusal(
  result: ApiResult<unknown>,
): 'error' | 'denied' | 'unavailable' {
  return result.status === 'forbidden' || result.status === 'unauthorized'
    ? 'denied'
    : result.status === 'notFound'
      ? 'unavailable'
      : 'error';
}

function unexpected(value: never): never {
  throw new Error(`Unexpected Certification state: ${String(value)}`);
}
