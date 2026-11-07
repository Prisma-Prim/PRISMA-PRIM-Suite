import './certification.css';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  conflictCode,
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import {
  useScopedOperation,
  type ScopedOperation,
} from '../api/use-scoped-operation';
import { receivedAuditSourceNativeAuthority } from '../documents/received-audit-source-access';
import { useInterfaceLocale } from '../localization/interface-locale';
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
  utcToday,
  type AgreementCheck,
  type AgreementDraft,
} from './certification-documents-draft';
import {
  useCertificationCopy,
  type CertificationMessageKey,
} from './certification.copy';
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
  type DecisionDraft,
  type TeamCheck,
  type TeamDraft,
} from './certification-team-draft';
import { teamWithoutConflict } from './certification-team';
import {
  CERTIFICATION_LIMITS,
  parseCaseDetail,
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
  type DocumentRegister,
  type EligibleDocuments,
  type LegalEntityOption,
} from './certification-response';
import { AgreementForm, AttachForm } from './CertificationDocumentForms';
import { AgreementView, DossierRegister } from './CertificationDocumentViews';
import { DurationForm } from './CertificationDurationForm';
import { DurationView } from './CertificationDurationViews';
import { ApplicationForm, ReviewForm } from './CertificationForms';
import { DecisionForm, TeamForm } from './CertificationTeamForms';
import {
  DecisionView,
  TeamView,
  type KnownPeople,
} from './CertificationTeamViews';
import {
  FactsView,
  NextStepLabel,
  ReviewView,
  StepRail,
  TimelineView,
  VersionAttribution,
} from './CertificationViews';

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
  | { status: 'refused'; message: CertificationMessageKey; reload: boolean };
type MutationKind =
  | 'open'
  | 'application'
  | 'review'
  | 'duration'
  | 'attach'
  | 'agreement'
  | 'team'
  | 'decision';
/** A Workspace member the read Case names, offered as a team member link. */
type CasePerson = CertificationActorReference & { self: boolean };
/**
 * Whose authority a call needs. Reading the Case needs none of the Document
 * rights, so a refused Document call leaves the Case to the authority recheck.
 */
type Access = 'certification' | 'documents';
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
const NO_PROPOSAL: Proposal = { status: 'idle' };
const NO_DOWNLOAD: Download = { status: 'idle' };
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
  const { formatDateTime, formatNumber } = useInterfaceLocale();
  const prefix = useId();
  const callbacks = useRef(props);
  callbacks.current = props;
  const listOperation = useScopedOperation(props.scope);
  const detailOperation = useScopedOperation(props.scope);
  const entitiesOperation = useScopedOperation(props.scope);
  const mutationOperation = useScopedOperation(props.scope);
  const proposalOperation = useScopedOperation(props.scope);
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
  const [download, setDownload] = useState<Download>(NO_DOWNLOAD);
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
    ].some((feedback) => feedback.status === 'saving');
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
    contentOperation.retire();
    setDownload(NO_DOWNLOAD);
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
    const result = await api.request<unknown>(
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
        entitiesOperation,
        mutationOperation,
        proposalOperation,
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
    const signal = detailOperation.begin();
    if (!signal) return;
    if (selected.current !== caseId) resetCaseDrafts();
    else if (options.reload) {
      // A reload keeps drafts and an uncertain intent; it resolves refusals.
      const clear = (feedback: Feedback) =>
        feedback.status === 'refused' ? IDLE : feedback;
      setApplicationFeedback(clear);
      setReviewFeedback(clear);
      setDurationFeedback(clear);
      setAttachFeedback(clear);
      setAgreementFeedback(clear);
      setTeamFeedback(clear);
      setDecisionFeedback(clear);
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
    let confirmed: CaseDetail | undefined;
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
        confirmed = parseCaseDetail(result.value, {
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
        today: utcToday(),
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
    });
    if (check.status !== 'valid') {
      setTeamFeedback(refusedWith(teamMessage(check)));
      return;
    }
    const body = JSON.stringify({
      expectedRevision: current.revision,
      ...(check.reason === null ? {} : { reason: check.reason }),
      members: check.team.members,
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
    const current = detail.value.caseDetail;
    const team = current.team;
    if (!team || current.nextStep !== 'team_decision') return;
    const check = decisionFromDraft(decisionDraft, team.value);
    if (check.status !== 'valid') {
      setDecisionFeedback(
        refusedWith(
          check.status === 'conflictDeclared'
            ? 'decisionConflictOnly'
            : 'decisionValidation',
        ),
      );
      return;
    }
    const body = JSON.stringify({
      expectedRevision: current.revision,
      teamVersion: team.version,
      decision: check.decision,
      ...(check.decision === 'returned' ? { reason: check.reason } : {}),
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
    const current = detail.value.caseDetail;
    const check = reviewFromDraft(reviewDraft);
    if (check.status !== 'valid') {
      // Mirrors the server: never send an acceptance with a "no" answer.
      setReviewFeedback(
        refusedWith(
          check.status === 'criteriaNotMet'
            ? 'criteriaNotMet'
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
  };

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
    }
    return unexpected(feedback);
  }

  function describedFeedback(kind: MutationKind, feedback: Feedback) {
    return feedback.status === 'refused' || feedback.status === 'uncertain'
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
                invalid={openFeedback.status === 'refused'}
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
                aria-invalid={openFeedback.status === 'refused'}
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
                  {copy(
                    item.status === 'open' ? 'statusOpen' : 'statusRejected',
                  )}
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
                      {copy(
                        caseView.caseDetail.status === 'open'
                          ? 'statusOpen'
                          : 'statusRejected',
                      )}
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
              {caseView.caseDetail.nextStep === 'stage_1_plan' && (
                <p className="certification-note">
                  {copy('nextStagePlanPending')}
                </p>
              )}
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
                    />
                  </>
                ) : (
                  <p>{copy('reviewMissing')}</p>
                )}
                {authority.manage && (
                  <>
                    {feedbackMessage('review', reviewFeedback)}
                    {reviewStep(caseView.caseDetail)}
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
                      />
                    </>
                  ) : (
                    <p>{copy('durationMissing')}</p>
                  )}
                  {authority.manage && (
                    <>
                      {feedbackMessage('duration', durationFeedback)}
                      {durationStep(caseView.caseDetail)}
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
                  download={
                    documentRights
                      ? {
                          pendingId:
                            download.status === 'pending' &&
                            download.rights === documentRights
                              ? download.attachmentId
                              : undefined,
                          disabled: busy,
                          onDownload: (attachment) =>
                            void downloadAttachment(
                              caseView.caseDetail.id,
                              attachment,
                            ),
                        }
                      : undefined
                  }
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
              <section aria-labelledby={`${prefix}-timeline-title`}>
                <h5 id={`${prefix}-timeline-title`}>{copy('timelineTitle')}</h5>
                <TimelineView
                  timeline={caseView.timeline}
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
    if (current.applicationReview)
      return (
        <p className="certification-blocked">
          {copy('blockedApplicationReviewed')}
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
  function reviewStep(current: CaseDetail) {
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
  function durationStep(current: CaseDetail) {
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
    if (current.status !== 'open') return null;
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
        today={utcToday()}
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
    case 'open':
    case 'application':
    case 'review':
    case 'attach':
    case 'decision':
      return 'blockedCorrectionReason';
  }
  return unexpected(kind);
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
    case 'reasonRequired':
      return 'reasonRequired';
  }
  return unexpected(check);
}

/** The detail and its timeline must describe the same recorded versions. */
function timelineMatches(detail: CaseDetail, timeline: CaseTimeline) {
  const last = timeline.entries.at(-1);
  const recorded = (id: string, version: number) =>
    timeline.entries.some(
      (entry) => entry.id === id && entry.version === version,
    );
  return (
    (last === undefined || last.caseRevision <= detail.revision) &&
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
 * revision or at a step's revision, and every recorded agreement refers to
 * an attachment with the agreement role attached before it.
 */
function registerMatches(
  detail: CaseDetail,
  timeline: CaseTimeline,
  register: DocumentRegister,
) {
  const steps = new Set(timeline.entries.map((entry) => entry.caseRevision));
  return (
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
    )
  );
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
        case 'CERTIFICATION_APPLICATION_REVIEWED':
          return refusedWith('blockedApplicationReviewed', true);
        case 'CERTIFICATION_APPLICATION_MISSING':
          return refusedWith('blockedReviewBeforeApplication', true);
        case 'CERTIFICATION_APPLICATION_ALREADY_REVIEWED':
          return refusedWith('blockedAlreadyReviewed', true);
        case 'CERTIFICATION_CASE_CLOSED':
          return refusedWith('blockedClosed', true);
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
        case 'CERTIFICATION_AGREEMENT_MISSING':
          return refusedWith('blockedTeamBeforeAgreement', true);
        case 'CERTIFICATION_TEAM_NOT_PENDING':
          return refusedWith('blockedTeamNotPending', true);
        case 'CERTIFICATION_INDEPENDENCE':
          return refusedWith('teamIndependence', true);
        case 'CERTIFICATION_TEAM_CONFLICT_DECLARED':
          return refusedWith('teamConflictDeclared');
        case 'CERTIFICATION_CORRECTION_UNCHANGED':
          return refusedWith('blockedCorrectionUnchanged');
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
