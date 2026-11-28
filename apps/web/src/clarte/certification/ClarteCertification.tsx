import {
  ArrowLeft,
  Check,
  Download,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  invalidField,
  blank,
  wrongText,
} from '../../certification/certification-fields';
import { CERTIFICATION_LIMITS } from '../../certification/certification-response';
import type { CaseStatus } from '../../certification/certification-response';
import { useConsistencyCopy } from '../../certification/certification-consistency.copy';
import { useExchangeCopy } from '../../certification/certification-exchanges.copy';
import {
  NextStepLabel,
  caseStepStates,
  statusLabel,
} from '../../certification/CertificationViews';
import {
  useCertificationRegistry,
  type CertificationRegistry,
  type CertificationWorkspaceProps,
} from '../../certification/use-certification-registry';
import type { CertificationCaseView } from '../../certification/certification-command';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { formatMessage } from '../../localization/messages';
import { Select } from '../../presentation/Select';
import { ClarteBadge, type ClarteTone } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import { ClarteField } from '../components/ClarteField';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import {
  caseRegisters,
  caseStepStatuses,
  caseSteps,
  landingStep,
  type CaseRegisterId,
  type CaseRegisterLabel,
  type CaseStepId,
  type CaseStepStatus,
} from './case-steps';
import { useClarteCertificationCopy } from './clarte-certification.copy';
import './clarte-certification.css';
import './clarte-case-workflow.css';

/** The step or register the Case page shows, pinned to the Case it was chosen on. */
type Shown = Readonly<{
  caseId: string;
  target:
    { kind: 'step'; id: CaseStepId } | { kind: 'register'; id: CaseRegisterId };
}>;

/**
 * Missions and audits › a Project › Certification in Clarté (#1538): the
 * Project's Certification Cases, then one Case as a page with its ordered
 * steps, one step at a time. The owner, reads, commands, drafts and gates
 * are the Certification module's own; this screen only lays them out.
 */
export function ClarteCertification(
  props: CertificationWorkspaceProps & { scope: string },
) {
  const registry = useCertificationRegistry(props);
  return (
    <div className="clarte-certification">
      {registry.selectedId === undefined ? (
        <CaseList registry={registry} />
      ) : (
        <CasePage
          registry={registry}
          projectTitle={props.projectTitle}
          projectSources={props.projectSources}
        />
      )}
      {registry.opening ? (
        <OpenCasePanel registry={registry} />
      ) : (
        registry.openFeedbackMessage()
      )}
    </div>
  );
}

function CaseList({ registry }: { registry: CertificationRegistry }) {
  const { copy, list, busy, authority } = registry;
  const clarte = useClarteCertificationCopy();
  const refresh = (
    <ClarteButton
      variant="secondary"
      size="small"
      disabled={busy}
      onClick={() => void registry.loadList()}
    >
      <RefreshCw aria-hidden="true" />
      {copy('refresh')}
    </ClarteButton>
  );
  return (
    <ClarteCard
      title={clarte('casesHeading')}
      actions={
        <>
          {refresh}
          {authority.manage && list.status !== 'denied' && (
            <ClarteButton
              variant="primary"
              size="small"
              disabled={busy}
              onClick={registry.startOpening}
            >
              <Plus aria-hidden="true" />
              {copy('openToggle')}
            </ClarteButton>
          )}
        </>
      }
    >
      {list.status === 'loading' && (
        <ClarteLoadingState label={copy('loading')} />
      )}
      {list.status === 'denied' && <ClarteErrorState title={copy('denied')} />}
      {list.status === 'unavailable' && (
        <ClarteErrorState title={copy('listUnavailable')} />
      )}
      {list.status === 'error' && <ClarteErrorState title={copy('error')} />}
      {list.status === 'ready' &&
        (list.value.cases.length === 0 ? (
          <ClarteEmptyState title={copy('empty')} />
        ) : (
          <>
            <p className="clarte-certification-count">
              {formatMessage(clarte('casesCount'), {
                count: list.value.total,
              })}
            </p>
            <ul className="clarte-list clarte-certification-cases">
              {list.value.cases.map((item) => (
                <li key={item.id}>
                  <ShieldCheck
                    className="clarte-certification-case-icon"
                    aria-hidden="true"
                  />
                  <span className="clarte-certification-case-name">
                    <button
                      type="button"
                      className="clarte-certification-case-link"
                      disabled={busy}
                      onClick={(event) =>
                        void registry.openCase(item.id, {
                          trigger: event.currentTarget,
                        })
                      }
                    >
                      {item.orderReference}
                    </button>
                    <small>{item.clientLegalEntity.legalName}</small>
                  </span>
                  <span className="clarte-certification-case-next">
                    {copy('nextStep')}: <NextStepLabel step={item.nextStep} />
                  </span>
                  <ClarteBadge tone={statusTone(item.status)}>
                    {copy(statusLabel(item.status))}
                  </ClarteBadge>
                </li>
              ))}
            </ul>
          </>
        ))}
    </ClarteCard>
  );
}

/** Opening a Case: the Client's legal entity and the order reference. */
function OpenCasePanel({ registry }: { registry: CertificationRegistry }) {
  const {
    copy,
    busy,
    entities,
    entityId,
    orderReference,
    openFeedback,
    openDescribedBy,
  } = registry;
  const formId = useId();
  return (
    <ClarteSidePanel
      title={copy('openTitle')}
      description={copy('openHelp')}
      icon={<ShieldCheck />}
      dismissible={!busy}
      onClose={registry.cancelOpening}
      footer={
        <>
          <ClarteButton
            variant="secondary"
            disabled={busy}
            onClick={registry.cancelOpening}
          >
            {copy('cancel')}
          </ClarteButton>
          <ClarteButton
            variant="primary"
            type="submit"
            form={formId}
            disabled={busy}
          >
            {openFeedback.status === 'saving'
              ? copy('saving')
              : copy('openSubmit')}
          </ClarteButton>
        </>
      }
    >
      <form
        id={formId}
        className="clarte-certification-open"
        aria-label={copy('openTitle')}
        noValidate
        onSubmit={registry.submitOpen}
      >
        {registry.openFeedbackMessage()}
        {entities?.status === 'loading' && (
          <ClarteLoadingState label={copy('legalEntitiesLoading')} />
        )}
        {(entities?.status === 'error' ||
          entities?.status === 'unavailable') && (
          <ClarteErrorState
            title={copy('legalEntitiesUnavailable')}
            action={
              <ClarteButton
                size="small"
                disabled={busy}
                onClick={() => void registry.loadEntities()}
              >
                {copy('retry')}
              </ClarteButton>
            }
          />
        )}
        {entities?.status === 'ready' && entities.value.length === 0 && (
          <ClarteEmptyState title={copy('legalEntitiesEmpty')} />
        )}
        <ClarteField label={copy('legalEntity')}>
          {(control) => (
            <Select
              id={control.id}
              value={entityId}
              placeholder={copy('selectLegalEntity')}
              disabled={busy || entities?.status !== 'ready'}
              invalid={invalidField(openDescribedBy, blank(entityId))}
              describedBy={openDescribedBy}
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
              onValueChange={registry.chooseEntity}
            />
          )}
        </ClarteField>
        <ClarteField label={copy('orderReference')}>
          {(control) => (
            <input
              id={control.id}
              className="clarte-input"
              value={orderReference}
              maxLength={CERTIFICATION_LIMITS.orderReference}
              disabled={busy}
              required
              aria-invalid={invalidField(
                openDescribedBy,
                wrongText(orderReference, CERTIFICATION_LIMITS.orderReference),
              )}
              aria-describedby={openDescribedBy}
              onChange={(event) =>
                registry.typeOrderReference(event.target.value)
              }
            />
          )}
        </ClarteField>
      </form>
    </ClarteSidePanel>
  );
}

function CasePage({
  registry,
  projectTitle,
  projectSources,
}: {
  registry: CertificationRegistry;
  projectTitle: string | undefined;
  projectSources: ReactNode;
}) {
  const { copy, busy, detail, caseView, selectedId, prefix, heading } =
    registry;
  // Held here, so the choice survives the reload that follows each command.
  const [shown, setShown] = useState<Shown | null>(null);
  const readyCase = caseView?.caseDetail;
  useEffect(() => {
    if (readyCase === undefined) return;
    // The Case opens on its current step and then stays where it is put.
    setShown((held) =>
      held?.caseId === readyCase.id
        ? held
        : {
            caseId: readyCase.id,
            target: { kind: 'step', id: landingStep(readyCase) },
          },
    );
    // The list entry that opened the Case is gone: focus its heading instead.
    if (document.activeElement === document.body) heading.current?.focus();
    // Once per opened Case: a reload of the same Case keeps the choice.
  }, [readyCase?.id]);
  const reload = () => {
    if (selectedId !== undefined)
      void registry.openCase(selectedId, { reload: true });
  };
  return (
    <article
      className="clarte-certification-page"
      aria-labelledby={caseView ? `${prefix}-case-title` : undefined}
      aria-label={caseView ? undefined : copy('title')}
    >
      <ClarteButton
        variant="quiet"
        size="small"
        className="clarte-certification-back"
        disabled={busy}
        onClick={registry.closeCase}
      >
        <ArrowLeft aria-hidden="true" />
        {copy('back')}
      </ClarteButton>
      {detail?.status === 'loading' && (
        <ClarteLoadingState label={copy('caseLoading')} />
      )}
      {(detail?.status === 'error' ||
        detail?.status === 'unavailable' ||
        detail?.status === 'denied') && (
        <ClarteErrorState
          title={copy(detail.status === 'error' ? 'error' : detail.status)}
          action={
            detail.status === 'denied' ? undefined : (
              <ClarteButton size="small" disabled={busy} onClick={reload}>
                {copy('reload')}
              </ClarteButton>
            )
          }
        />
      )}
      {caseView && (
        <CaseContent
          registry={registry}
          view={caseView}
          projectTitle={projectTitle}
          projectSources={projectSources}
          onReload={reload}
          target={
            shown?.caseId === caseView.caseDetail.id
              ? shown.target
              : { kind: 'step', id: landingStep(caseView.caseDetail) }
          }
          onChoose={(target) =>
            setShown({ caseId: caseView.caseDetail.id, target })
          }
        />
      )}
    </article>
  );
}

function CaseContent({
  registry,
  view,
  projectTitle,
  projectSources,
  onReload,
  target,
  onChoose,
}: {
  registry: CertificationRegistry;
  view: CertificationCaseView;
  projectTitle: string | undefined;
  projectSources: ReactNode;
  onReload: () => void;
  target: Shown['target'];
  onChoose: (target: Shown['target']) => void;
}) {
  const { copy, busy, prefix, authority, heading } = registry;
  const clarte = useClarteCertificationCopy();
  const exchangeCopy = useExchangeCopy();
  const consistencyCopy = useConsistencyCopy();
  const { formatDate } = useInterfaceLocale();
  const detail = view.caseDetail;
  const states = caseStepStates(detail, copy);
  const statuses = caseStepStatuses(detail);
  const position = caseSteps.findIndex((step) =>
    step.covers.some((covered) => covered === detail.nextStep),
  );
  const download = registry.documents.registerPdfDownload(busy);
  const context = { registry, view, busy, reload: onReload, projectSources };
  const registerLabel = (label: CaseRegisterLabel) => {
    switch (label.catalogue) {
      case 'certification':
        return copy(label.key);
      case 'exchanges':
        return exchangeCopy(label.key);
      case 'consistency':
        return consistencyCopy(label.key);
    }
    return unexpectedLabel(label);
  };
  let body: ReactNode;
  let title: string;
  let lead: string | undefined;
  if (target.kind === 'step') {
    const step = caseSteps.find((entry) => entry.id === target.id);
    if (!step) throw new Error('Unknown Certification Case step.');
    title = copy(step.label);
    lead = step.state(states, detail);
    body = step.render(context);
  } else {
    const register = caseRegisters.find((entry) => entry.id === target.id);
    if (!register) throw new Error('Unknown Certification Case register.');
    title = registerLabel(register.label);
    body = register.render(context);
  }

  return (
    <>
      <header className="clarte-certification-head">
        <div className="clarte-certification-head-text">
          <h4 id={`${prefix}-case-title`} ref={heading} tabIndex={-1}>
            {formatMessage(copy('caseHeading'), {
              reference: detail.orderReference,
            })}
          </h4>
          <p>
            {[
              detail.clientLegalEntity.legalName,
              copy('standardValue'),
              copy('auditTypeValue'),
              ...(projectTitle === undefined
                ? []
                : [
                    formatMessage(clarte('projectNamed'), {
                      title: projectTitle,
                    }),
                  ]),
            ].join(' · ')}
          </p>
          <p className="clarte-certification-meta">
            <ClarteBadge tone={statusTone(detail.status)}>
              {copy(statusLabel(detail.status))}
            </ClarteBadge>
            {position >= 0 && (
              <span>
                {formatMessage(clarte('stepPosition'), {
                  position: position + 1,
                  total: caseSteps.length,
                })}
              </span>
            )}
            <span>
              {formatMessage(clarte('caseOpened'), {
                date: formatDate(detail.openedAt),
                name: detail.openedBy.displayName,
              })}
            </span>
          </p>
        </div>
        <div className="clarte-certification-head-actions">
          {download && (
            <>
              <ClarteButton
                size="small"
                disabled={download.disabled || download.status === 'pending'}
                aria-describedby={`${prefix}-clarte-register-help`}
                onClick={download.onDownload}
              >
                <Download aria-hidden="true" />
                {copy('registerPdfDownload')}
              </ClarteButton>
              <span
                id={`${prefix}-clarte-register-help`}
                className="clarte-visually-hidden"
              >
                {copy('registerPdfHelp')}
              </span>
            </>
          )}
          <ClarteButton size="small" disabled={busy} onClick={onReload}>
            <RefreshCw aria-hidden="true" />
            {copy('reload')}
          </ClarteButton>
        </div>
      </header>
      {download?.status === 'pending' && (
        <p role="status">{copy('registerPdfDownloading')}</p>
      )}
      {download?.status === 'failed' && (
        <p role="alert">{copy('registerPdfFailed')}</p>
      )}
      {download?.status === 'unavailable' && (
        <p role="alert">{copy('registerPdfUnavailable')}</p>
      )}
      {registry.saved && <p role="status">{copy('saveConfirmed')}</p>}
      {!authority.manage && (
        <p className="certification-note">{copy('readOnly')}</p>
      )}
      {detail.status === 'rejected' && (
        <p className="certification-blocked">{copy('blockedClosed')}</p>
      )}
      {detail.status === 'refused' && (
        <p className="certification-blocked">{copy('caseRefusedNote')}</p>
      )}
      {detail.status === 'certified' && (
        <p className="certification-note">{copy('caseCertifiedNote')}</p>
      )}
      <div className="clarte-certification-console">
        <nav
          className="clarte-certification-rail"
          aria-label={clarte('stepsNavigation')}
        >
          <p
            className="clarte-certification-rail-title"
            id={`${prefix}-clarte-steps`}
          >
            {copy('steps')}
          </p>
          <ol
            className="clarte-certification-steps"
            aria-labelledby={`${prefix}-clarte-steps`}
          >
            {caseSteps.map((step, index) => {
              const status: CaseStepStatus =
                statuses.get(step.id) ?? 'upcoming';
              const selected = target.kind === 'step' && target.id === step.id;
              return (
                <li key={step.id} data-status={status}>
                  <button
                    type="button"
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => onChoose({ kind: 'step', id: step.id })}
                  >
                    <span
                      className="clarte-certification-step-dot"
                      aria-hidden="true"
                    >
                      {status === 'done' ? <Check /> : index + 1}
                    </span>
                    <span className="clarte-certification-step-text">
                      <b>{copy(step.label)}</b>
                      <small>{step.state(states, detail)}</small>
                    </span>
                    <span className="clarte-visually-hidden">
                      {clarte(statusKey(status))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p
            className="clarte-certification-rail-title"
            id={`${prefix}-clarte-registers`}
          >
            {clarte('registersGroup')}
          </p>
          <ul
            className="clarte-certification-registers"
            aria-labelledby={`${prefix}-clarte-registers`}
          >
            {caseRegisters.map((register) => {
              const Icon = register.icon;
              return (
                <li key={register.id}>
                  <button
                    type="button"
                    aria-current={
                      target.kind === 'register' && target.id === register.id
                        ? 'true'
                        : undefined
                    }
                    onClick={() =>
                      onChoose({ kind: 'register', id: register.id })
                    }
                  >
                    <Icon aria-hidden="true" />
                    <span>{registerLabel(register.label)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        {/* Not a region: the step's own sections are the named regions. */}
        <div className="clarte-certification-step">
          <header className="clarte-certification-step-head">
            <h5>{title}</h5>
            {lead !== undefined && <p>{lead}</p>}
          </header>
          <div className="clarte-certification-step-body" data-step={target.id}>
            {body ?? <ClarteEmptyState title={clarte('stepWaiting')} />}
          </div>
        </div>
      </div>
    </>
  );
}

function statusKey(status: CaseStepStatus) {
  switch (status) {
    case 'done':
      return 'stepDone';
    case 'current':
      return 'stepCurrent';
    case 'upcoming':
      return 'stepUpcoming';
    case 'notReached':
      return 'stepNotReached';
  }
  return unexpectedStatus(status);
}

function statusTone(status: CaseStatus): ClarteTone {
  switch (status) {
    case 'open':
      return 'info';
    case 'certified':
      return 'success';
    case 'rejected':
    case 'refused':
      return 'danger';
  }
  return unexpectedCaseStatus(status);
}

function unexpectedStatus(value: never): never {
  throw new Error(`Unexpected Certification step status: ${String(value)}`);
}

function unexpectedCaseStatus(value: never): never {
  throw new Error(`Unexpected Certification Case status: ${String(value)}`);
}

function unexpectedLabel(value: never): never {
  throw new Error(`Unexpected Certification register: ${String(value)}`);
}
