import './certification.css';
import { useMemo } from 'react';
import { ClarteCertification } from '../clarte/certification/ClarteCertification';
import { useInterfacePreference } from '../clarte/InterfacePreferenceProvider';
import { useInterfaceLocale } from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import { Select } from '../presentation/Select';
import {
  certificationAuthority,
  certificationContextKey,
} from './certification-access';
import { CERTIFICATION_LIMITS } from './certification-response';
import { invalidField, blank, wrongText } from './certification-fields';
import {
  NextStepLabel,
  StepRail,
  TimelineView,
  statusLabel,
} from './CertificationViews';
import {
  useCertificationRegistry,
  type CertificationWorkspaceProps,
} from './use-certification-registry';

export type { CertificationWorkspaceProps } from './use-certification-registry';

/**
 * The Project's Certification Cases. Identity, Project and every captured
 * Certification grant key the owner, so a change retires drafts, retry
 * intents and late replies of the previous authority. The Clarté interface
 * shows the same owner as one Case page with its steps (#1538).
 */
export function CertificationWorkspace(props: CertificationWorkspaceProps) {
  const { preference } = useInterfacePreference();
  const identityScope = useMemo(() => crypto.randomUUID(), [props.identity]);
  if (!certificationAuthority(props.actor).read) return null;
  const scope = JSON.stringify([
    identityScope,
    props.projectId,
    certificationContextKey(props.actor),
  ]);
  return preference === 'clarte' ? (
    <ClarteCertification key={scope} scope={scope} {...props} />
  ) : (
    <CertificationRegistry key={scope} scope={scope} {...props} />
  );
}

function CertificationRegistry(
  props: CertificationWorkspaceProps & { scope: string },
) {
  const registry = useCertificationRegistry(props);
  const {
    authority,
    copy,
    prefix,
    heading,
    busy,
    list,
    selectedId,
    detail,
    caseView,
    opening,
    entities,
    entityId,
    orderReference,
    openFeedback,
    openDescribedBy,
    intake,
    documents,
    team,
    findings,
    closing: closingWorkflow,
    stages,
    dossier,
  } = registry;
  const { formatDateTime, formatNumber } = useInterfaceLocale();

  return (
    <section
      className="certification-workspace"
      aria-labelledby={`${prefix}-title`}
    >
      <header>
        <h3 id={`${prefix}-title`}>{copy('title')}</h3>
        <button
          type="button"
          disabled={busy}
          onClick={() => void registry.loadList()}
        >
          {copy('refresh')}
        </button>
      </header>
      <p>{copy('introduction')}</p>
      {authority.manage && list.status !== 'denied' && (
        <div className="certification-open">
          {registry.openFeedbackMessage()}
          {!opening ? (
            <button
              type="button"
              className="certification-primary"
              disabled={busy}
              onClick={registry.startOpening}
            >
              {copy('openToggle')}
            </button>
          ) : (
            <form
              className="certification-form"
              aria-labelledby={`${prefix}-open-title`}
              noValidate
              onSubmit={registry.submitOpen}
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
                    onClick={() => void registry.loadEntities()}
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
                  openDescribedBy,
                  wrongText(
                    orderReference,
                    CERTIFICATION_LIMITS.orderReference,
                  ),
                )}
                aria-describedby={openDescribedBy}
                onChange={(event) =>
                  registry.typeOrderReference(event.target.value)
                }
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
                  onClick={registry.cancelOpening}
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
                    void registry.openCase(item.id, {
                      trigger: event.currentTarget,
                    })
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
              onClick={() =>
                void registry.openCase(selectedId, { reload: true })
              }
            >
              {copy('reload')}
            </button>
            <button type="button" disabled={busy} onClick={registry.closeCase}>
              {copy('back')}
            </button>
          </div>
          {registry.saved && <p role="status">{copy('saveConfirmed')}</p>}
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
