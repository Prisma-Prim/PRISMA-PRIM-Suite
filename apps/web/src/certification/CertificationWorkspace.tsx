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
import { useInterfaceLocale } from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import { Select } from '../presentation/Select';
import {
  certificationAuthority,
  certificationContextKey,
} from './certification-access';
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
  CERTIFICATION_LIMITS,
  parseCaseDetail,
  parseCaseList,
  parseLegalEntityOptions,
  parseTimeline,
  type CaseDetail,
  type CaseList,
  type CaseTimeline,
  type LegalEntityOption,
} from './certification-response';
import { ApplicationForm, ReviewForm } from './CertificationForms';
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
type CaseView = { caseDetail: CaseDetail; timeline: CaseTimeline };
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
type MutationKind = 'open' | 'application' | 'review';

const IDLE: Feedback = { status: 'idle' };
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
  const mutating = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const openingTrigger = useRef<Element | null>(null);
  const busy = [openFeedback, applicationFeedback, reviewFeedback].some(
    (feedback) => feedback.status === 'saving',
  );
  const projectPath = `/projects/${encodeURIComponent(projectId)}`;

  function feedbackSetter(kind: MutationKind) {
    switch (kind) {
      case 'open':
        return setOpenFeedback;
      case 'application':
        return setApplicationFeedback;
      case 'review':
        return setReviewFeedback;
    }
    return unexpected(kind);
  }

  function resetCaseDrafts() {
    setApplicationDraft(emptyApplicationDraft());
    setApplicationOpen(false);
    setApplicationFeedback(IDLE);
    setReviewDraft(emptyReviewDraft());
    setReviewFeedback(IDLE);
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

  async function query(
    slot: ScopedOperation,
    signal: AbortSignal,
    path: string,
    command?: Intent,
  ): Promise<ApiResult<unknown>> {
    const api = await createAuthenticatedApiClient(identity);
    if (signal.aborted) return ABANDONED;
    const result = await api.request<unknown>(
      path,
      command
        ? {
            companyContextId: companyId,
            signal,
            method: 'POST',
            body: command.body,
            headers: {
              'idempotency-key': command.key,
              'content-type': 'application/json',
            },
          }
        : { companyContextId: companyId, signal, cache: 'no-store' },
    );
    if (signal.aborted) return ABANDONED;
    if (result.status === 'unauthorized' || result.status === 'forbidden') {
      for (const other of [
        listOperation,
        detailOperation,
        entitiesOperation,
        mutationOperation,
      ])
        if (other !== slot) other.retire();
      retirePrivateState();
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
    return result;
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
    }
    selected.current = caseId;
    setSelectedId(caseId);
    openingTrigger.current = options.trigger ?? null;
    setDetail({ status: 'loading' });
    const casePath = `/certification-cases/${encodeURIComponent(caseId)}`;
    try {
      const [record, history] = await Promise.all([
        query(detailOperation, signal, casePath),
        query(detailOperation, signal, `${casePath}/timeline`),
      ]);
      if (signal.aborted) return;
      if (record.status === 'ok' && history.status === 'ok') {
        const caseDetail = parseCaseDetail(record.value, {
          companyId,
          projectId,
          caseId,
        });
        const timeline = parseTimeline(history.value, caseId);
        if (!timelineMatches(caseDetail, timeline))
          throw new Error('The Certification Case changed during the read.');
        setDetail({ status: 'ready', value: { caseDetail, timeline } });
        return;
      }
      const status = refusal(record.status === 'ok' ? history : record);
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
      default:
        unexpected(kind);
    }
    void loadList();
    void openCase(confirmed.id, { reload: true });
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

  function retry(kind: MutationKind, feedback: Feedback) {
    if (feedback.status === 'uncertain') void execute(kind, feedback.intent);
  }

  const feedbackIds = {
    open: `${prefix}-open-feedback`,
    application: `${prefix}-application-feedback`,
    review: `${prefix}-review-feedback`,
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
          {(applicationFeedback.status === 'saved' ||
            reviewFeedback.status === 'saved') && (
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
              {caseView.caseDetail.nextStep === 'duration' && (
                <p className="certification-note">
                  {copy('nextDurationPending')}
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
              <section aria-labelledby={`${prefix}-timeline-title`}>
                <h5 id={`${prefix}-timeline-title`}>{copy('timelineTitle')}</h5>
                <TimelineView timeline={caseView.timeline} />
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
      recorded(detail.applicationReview.id, detail.applicationReview.version))
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
    case 'unauthorized':
      return refusedWith('denied');
    case 'notFound':
      return refusedWith(kind === 'open' ? 'entityUnavailable' : 'unavailable');
    case 'validation':
      return refusedWith(
        result.code === 'CERTIFICATION_REVIEW_CRITERIA_NOT_MET'
          ? 'criteriaNotMet'
          : 'invalid',
      );
    case 'conflict':
      switch (conflictCode(result)) {
        case 'STALE_VERSION':
          return refusedWith('stale', true);
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
          return refusedWith('blockedCorrectionReason', true);
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
