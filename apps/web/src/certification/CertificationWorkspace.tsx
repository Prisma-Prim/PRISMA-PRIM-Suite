import { describedFeedbackId, unexpected } from './certification-command';
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
import { useCertificationCopy } from './certification.copy';
import {
  CERTIFICATION_LIMITS,
  parseCaseDetail,
  parseCaseList,
  parseDocumentRegister,
  parseCaseDetailRead,
  parseFindingHistory,
  parseLegalEntityOptions,
  parseTimeline,
  type CaseDetail,
  type CaseList,
  type LegalEntityOption,
} from './certification-response';
import { invalidField, blank, wrongText } from './certification-fields';
import {
  NextStepLabel,
  StepRail,
  TimelineView,
  statusLabel,
} from './CertificationViews';
import { PreconditionList } from './CertificationDecisionViews';

import { useCertificationStages } from './CertificationStages';
import {
  IDLE,
  retryUncertainCommand,
  reuse,
  refusedWith,
  type Intent,
  type Feedback,
  type NamedDiscrepancy,
} from './certification-command';

import { useCertificationFindings } from './CertificationFindings';
import { useCertificationTeam } from './CertificationTeam';
import { useCertificationClosing } from './CertificationClosing';
import type {
  CertificationCommand,
  CertificationCaseView as CaseView,
} from './certification-command';

import { useCertificationIntake } from './CertificationIntake';
import { useCertificationDocuments } from './CertificationDocuments';
import {
  commandFeedback,
  type MutationKind,
} from './certification-command-feedback';
import {
  loadCaseHistory,
  timelineMatches,
  registerMatches,
  refusal,
  type View,
} from './certification-case-view';
import type { CertificationAccess as Access } from './certification-command';

import { useCertificationDossier } from './CertificationDossier';

export interface CertificationWorkspaceProps {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string;
  onActorRevalidated?: (actor: ActorContext) => void | Promise<void>;
  onCompanyContextRejected?: (companyId: string) => void;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
}

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
  const callbacks = useRef(props);
  callbacks.current = props;
  const listOperation = useScopedOperation(props.scope);
  const accessRecoveryOperation = useScopedOperation(props.scope);
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
  const openFeedbackId = `${prefix}-open-feedback`;
  const mutating = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const openingTrigger = useRef<Element | null>(null);
  const caseView = detail?.status === 'ready' ? detail.value : undefined;
  const commit = (command: CertificationCommand<MutationKind>) =>
    performCommand(command.kind, command.intent, command);
  const intake = useCertificationIntake({
    view: caseView,
    actor,
    authority,
    prefix,
    copy,
    commit,
    renderFeedback,
    projectId,
    scope: props.scope,
    query,
  });
  const documents = useCertificationDocuments({
    view: caseView,
    actor,
    authority,
    prefix,
    copy,
    commit,
    renderFeedback,
    identity,
    companyId,
    scope: props.scope,
    locale,
    query,
    rejectAccess,
  });
  function registerDownload(view: CaseView) {
    return documents.registerDownload(view, busy);
  }
  const team = useCertificationTeam({
    view: caseView,
    actor,
    authority,
    prefix,
    copy,
    commit,
    renderFeedback,
    scope: props.scope,
    selectedId,
    readCandidates: query,
  });
  const findings = useCertificationFindings({
    view: caseView,
    actor,
    authority,
    prefix,
    copy,
    commit,
    renderFeedback,
    registerDownload,
  });
  const closingWorkflow = useCertificationClosing({
    view: caseView,
    actor,
    authority,
    prefix,
    copy,
    commit,
    renderFeedback,
    registerDownload,
    namedDiscrepancies,
  });
  const stages = useCertificationStages({
    view: caseView,
    actor,
    authority,
    projectId,
    scope: props.scope,
    prefix,
    copy,
    commit,
    readPreparation: (owner, signal, path) =>
      query(owner, signal, path, undefined, 'documents'),
    renderFeedback,
  });
  const dossier = useCertificationDossier({
    scope: props.scope,
    view: caseView,
    actor,
    authority,
    prefix,
    query,
    commit,
    updateCase: (update) =>
      setDetail((latest) =>
        latest?.status === 'ready'
          ? {
              status: 'ready',
              value: {
                ...latest.value,
                caseDetail: update(latest.value.caseDetail),
              },
            }
          : latest,
      ),
    reload: (caseId) => {
      if (selected.current === caseId) void openCase(caseId, { reload: true });
    },
    isBusy: () => busy,
    renderFeedback,
  });
  function namedDiscrepancies(named: readonly NamedDiscrepancy[]) {
    return dossier.namedDiscrepancies(named);
  }
  const busy =
    dossier.saving ||
    stages.saving ||
    team.saving ||
    findings.saving ||
    closingWorkflow.saving ||
    intake.saving ||
    documents.saving ||
    openFeedback.status === 'saving';
  const projectPath = `/projects/${encodeURIComponent(projectId)}`;

  function resetCaseDrafts() {
    intake.reset();
    documents.reset();
    team.reset();
    stages.reset();
    findings.reset();
    dossier.reset();
    closingWorkflow.reset();
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
    if (
      signal.aborted ||
      (result.status !== 'unauthorized' && result.status !== 'forbidden')
    )
      return;
    if (result.status === 'unauthorized' || access === 'certification') {
      for (const other of [
        listOperation,
        detailOperation,
        entitiesOperation,
        mutationOperation,
      ])
        if (other !== slot) other.retire();
      dossier.retireAccess(slot);
      intake.retire(slot);
      documents.retire(slot);
      retirePrivateState();
    }
    // A refused Case read can close that Case before actor recovery settles.
    // Recovery stays live for this registry and retires with its authority.
    const recoverySignal = accessRecoveryOperation.begin();
    if (!recoverySignal) return;
    void handleAuthenticatedAccessRejection({
      result,
      identity,
      companyContextId: companyId || undefined,
      signal: recoverySignal,
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
    dossier.prepareRead(options);
    const signal = detailOperation.begin();
    if (!signal) return;
    if (selected.current !== caseId) resetCaseDrafts();
    else if (options.reload) {
      // A reload keeps drafts and an uncertain intent; it resolves refusals.
      intake.clearRefusals();
      documents.clearRefusals();
      team.clearRefusals();
      findings.clearRefusals();
      dossier.clearRefusals();
      stages.clearRefusals();
      closingWorkflow.clearRefusals();
    }
    selected.current = caseId;
    setSelectedId(caseId);
    openingTrigger.current = options.trigger ?? null;
    setDetail({ status: 'loading' });
    const casePath = `/certification-cases/${encodeURIComponent(caseId)}`;
    try {
      const read = (path: string) => query(detailOperation, signal, path);
      const record = await read(`${casePath}?findingHistory=paged`);
      if (signal.aborted) return;
      if (record.status !== 'ok') {
        const status = refusal(record);
        if (status !== 'denied') setDetail({ status });
        return;
      }
      const detailRead = parseCaseDetailRead(record.value, {
        companyId,
        projectId,
        caseId,
      });
      let caseDetail: CaseDetail;
      if (detailRead.kind === 'complete') caseDetail = detailRead.detail;
      else {
        const findingHistory = await loadCaseHistory(
          read,
          `${casePath}/finding-history`,
          detailRead.revision,
          (value) => parseFindingHistory(value, caseId),
        );
        if (signal.aborted) return;
        if (findingHistory.status !== 'ok') {
          if (findingHistory.status !== 'denied')
            setDetail({ status: findingHistory.status });
          return;
        }
        caseDetail = detailRead.complete(findingHistory.items);
      }
      const [history, documents] = await Promise.all([
        loadCaseHistory(
          read,
          `${casePath}/timeline`,
          caseDetail.revision,
          (value) => {
            const timeline = parseTimeline(value, caseId);
            return { items: timeline.entries, page: timeline.page };
          },
        ),
        loadCaseHistory(
          read,
          `${casePath}/documents`,
          caseDetail.revision,
          (value) => parseDocumentRegister(value, caseId),
        ),
      ]);
      if (signal.aborted) return;
      if (history.status !== 'ok' || documents.status !== 'ok') {
        const status =
          history.status !== 'ok' ? history.status : documents.status;
        if (status !== 'denied' && status !== 'ok') setDetail({ status });
        return;
      }
      const timeline = { caseId, entries: history.items };
      const register = { caseId, items: documents.items };
      if (
        !timelineMatches(caseDetail, timeline) ||
        !registerMatches(caseDetail, timeline, register)
      )
        throw new Error('The Certification Case changed during the read.');
      setDetail({ status: 'ready', value: { caseDetail, timeline, register } });
    } catch {
      if (!signal.aborted) setDetail({ status: 'error' });
    }
  }

  function closeCase() {
    if (mutating.current) return;
    detailOperation.retire();
    dossier.retirePage();
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

  function executeOpen(intent: Intent) {
    return performCommand('open', intent, {
      setFeedback: setOpenFeedback,
      confirmed: () => {
        setOpening(false);
        setEntityId('');
        setOrderReference('');
      },
    });
  }

  async function performCommand(
    kind: MutationKind,
    intent: Intent,
    owner: {
      setFeedback: (next: Feedback) => void;
      confirmed: () => void;
    },
  ) {
    if (mutating.current) return;
    const signal = mutationOperation.begin();
    if (!signal) return;
    mutating.current = true;
    const setFeedback = owner.setFeedback;
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
        // The reply is the Case as this command recorded it, in the
        // current read shape; the live Case is then reloaded.
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
    owner.confirmed();
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
    void executeOpen(reuse(openFeedback, { path, body, caseId: null }));
  }

  function openFeedbackMessage() {
    return renderFeedback({
      kind: 'open',
      feedback: openFeedback,
      id: openFeedbackId,
      retry: () => retryUncertainCommand(openFeedback, executeOpen),
    });
  }

  function renderFeedback({
    kind,
    feedback,
    id,
    retry,
  }: {
    kind: MutationKind;
    feedback: Feedback;
    id: string;
    retry: () => void;
  }) {
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
          <div role="alert" id={id}>
            <p>{copy('uncertain')}</p>
            <button type="button" disabled={busy} onClick={retry}>
              {copy('retry')}
            </button>
          </div>
        );
      case 'refused':
        return (
          <p role="alert" id={id}>
            {copy(feedback.message)}
          </p>
        );
      case 'unmet':
        return (
          <div role="alert" id={id}>
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
          {openFeedbackMessage()}
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
                  describedFeedbackId(openFeedback, openFeedbackId),
                  blank(entityId),
                )}
                describedBy={describedFeedbackId(openFeedback, openFeedbackId)}
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
                  describedFeedbackId(openFeedback, openFeedbackId),
                  wrongText(
                    orderReference,
                    CERTIFICATION_LIMITS.orderReference,
                  ),
                )}
                aria-describedby={describedFeedbackId(
                  openFeedback,
                  openFeedbackId,
                )}
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
          {(dossier.saved ||
            stages.saved ||
            team.saved ||
            findings.saved ||
            closingWorkflow.saved ||
            intake.saved ||
            documents.saved) && <p role="status">{copy('saveConfirmed')}</p>}
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
              {dossier.render(busy)}
              {intake.render(busy, 'preparation')}
              {documents.render(busy)}
              {intake.render(busy, 'agreement')}
              {team.render(busy)}
              {stages.render(busy, (stage) => findings.render(stage, busy))}
              {closingWorkflow.render(busy)}
              {documents.renderRegister(busy)}
              <section aria-labelledby={`${prefix}-timeline-title`}>
                <h5 id={`${prefix}-timeline-title`}>{copy('timelineTitle')}</h5>
                <TimelineView
                  timeline={caseView.timeline}
                  findings={caseView.caseDetail.findings}
                  certificate={caseView.caseDetail.certificate}
                  register={caseView.register}
                  people={team.knownPeople(caseView)}
                />
              </section>
            </>
          )}
        </article>
      )}
    </section>
  );
}
