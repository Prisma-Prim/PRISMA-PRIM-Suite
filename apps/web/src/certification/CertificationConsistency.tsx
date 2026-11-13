import type { FormEvent, ReactNode } from 'react';
import { useInterfaceLocale } from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import { Select } from '../presentation/Select';
import {
  CONSISTENCY_LIMITS,
  DISCREPANCY_VERDICTS,
  canAccept,
  canCorrect,
  canRecordDiscrepancy,
  type ConsistencyDossierItem,
  type ConsistencyRoles,
  type ConsistencyRule,
  type DateFact,
  type Discrepancy,
  type DiscrepancyResolution,
  type DiscrepancySide,
  type DiscrepancySource,
  type DiscrepancyState,
  type DiscrepancySubject,
  type DiscrepancyValue,
  type DiscrepancyVerdict,
  type ManualDraft,
  type ResolutionDraft,
  type SourceStep,
} from './certification-consistency';
import {
  useConsistencyCopy,
  type ConsistencyMessageKey,
} from './certification-consistency.copy';
import { blank, invalidField } from './certification-fields';
import type {
  CaseDetail,
  CaseTimeline,
  DocumentRegister,
} from './certification-response';

/** One command form of the region: its draft, feedback and description. */
type FormState<Draft> = {
  draft: Draft;
  /** The rendered refusal, uncertainty or saving message, if any. */
  feedback: ReactNode;
  saving: boolean;
  describedBy: string | undefined;
};

export interface ConsistencyRegionProps {
  prefix: string;
  detail: CaseDetail;
  register: DocumentRegister;
  timeline: CaseTimeline;
  roles: ConsistencyRoles;
  busy: boolean;
  manual: (FormState<ManualDraft> & { open: boolean }) | null;
  onManualOpen: (open: boolean) => void;
  onManualDraft: (draft: ManualDraft) => void;
  onManualSubmit: (event: FormEvent) => void;
  resolution: FormState<ResolutionDraft | null>;
  onResolutionDraft: (draft: ResolutionDraft | null) => void;
  onResolutionSubmit: (event: FormEvent) => void;
}

/**
 * The "Dossier consistency" region of a Case: counts per verdict, the open
 * Discrepancies with both values, their sources and the act each blocks,
 * the acceptance and manual forms, and the resolved list with its history.
 * Every command is offered only to the roles that may record it.
 */
export function ConsistencyRegion(props: ConsistencyRegionProps) {
  const t = useConsistencyCopy();
  const { formatDateTime, formatNumber } = useInterfaceLocale();
  const { detail } = props;
  const consistency = detail.consistency;
  const titleId = `${props.prefix}-consistency-title`;
  const empty =
    consistency.open.length === 0 && consistency.resolved.length === 0;
  const resolvable =
    detail.status === 'open' ||
    detail.status === 'refused' ||
    detail.status === 'certified';

  function value(entry: DiscrepancyValue): string {
    switch (entry.kind) {
      case 'days':
        return formatMessage(t('valueDays'), { days: entry.days });
      case 'capacity':
        return formatMessage(t('valueCapacity'), {
          calendarDays: formatNumber(entry.calendarDays),
          auditors: formatNumber(entry.auditors),
        });
      case 'percent':
        return formatMessage(t('valuePercent'), {
          percent: formatNumber(entry.percent),
        });
      case 'date':
        return entry.date;
      case 'text':
        return entry.text;
      case 'numbers':
        return entry.numbers.length
          ? entry.numbers.join(', ')
          : t('valueNoNumbers');
      case 'version':
        return formatMessage(t('valueVersion'), { version: entry.version });
      case 'state':
        return t(stateLabel(entry.state));
    }
    return unexpected(entry);
  }

  function source(entry: DiscrepancySource): string {
    const document = entry.attachment
      ? formatMessage(t('sourceDocument'), {
          title: entry.attachment.sourceTitle,
          version: entry.attachment.versionNumber,
        })
      : null;
    let record: string | null;
    switch (entry.kind) {
      case 'step':
        record = formatMessage(t('sourceStep'), {
          step: t(stepLabel(entry.step)),
          version: entry.version,
        });
        break;
      case 'finding':
        record = formatMessage(t('sourceFinding'), {
          sequence: entry.sequence,
          version: entry.version,
        });
        break;
      case 'company_certificate_number':
        record = formatMessage(t('sourceCompanyCertificateNumber'), {
          number: entry.number,
        });
        break;
      case 'certificate':
        record = formatMessage(t('sourceCertificate'), {
          number: entry.number,
        });
        break;
      case 'exchange':
        record = formatMessage(t('sourceExchange'), {
          sequence: entry.sequence,
          version: entry.version,
        });
        break;
      case 'attachment':
        record = null;
        break;
      default:
        return unexpected(entry);
    }
    return [record, document].filter((part) => part !== null).join(' — ');
  }

  function subject(entry: DiscrepancySubject): string {
    switch (entry.kind) {
      case 'certificate_number':
        return t('subjectCertificateNumber');
      case 'duration_proposal':
        return t('subjectDurationProposal');
      case 'prior_certification_reduction':
        return t('subjectPriorCertification');
      case 'stage_share':
        return formatMessage(t('subjectStageShare'), {
          stage: t(entry.stage === 'stage_1' ? 'stage1' : 'stage2'),
        });
      case 'stage_capacity':
        return formatMessage(t('subjectStageCapacity'), {
          stage: t(entry.stage === 'stage_1' ? 'stage1' : 'stage2'),
        });
      case 'date_order':
        return formatMessage(t('subjectDateOrder'), {
          earlier: t(dateLabel(entry.earlier)),
          later: t(dateLabel(entry.later)),
        });
      case 'dossier_item':
        return formatMessage(t('subjectDossierItem'), {
          item: t(itemLabel(entry.item)),
        });
      case 'certificate_text':
        return formatMessage(t('subjectCertificateText'), {
          language: entry.language,
          field: t(
            entry.field === 'holderName'
              ? 'fieldHolderName'
              : entry.field === 'address'
                ? 'fieldAddress'
                : entry.field === 'scope'
                  ? 'fieldScope'
                  : 'fieldLanguage',
          ),
        });
      case 'address_numbers':
        return formatMessage(t('subjectAddressNumbers'), {
          language: entry.language,
        });
      case 'document_version':
        return t('subjectDocumentVersion');
      case 'plan_sending':
        return formatMessage(t('subjectPlanSending'), {
          stage: t(entry.stage === 'stage_1' ? 'stage1' : 'stage2'),
        });
      case 'exchange_reference':
        return formatMessage(t('subjectExchangeReference'), {
          reference: entry.reference,
          first: entry.first,
          second: entry.second,
        });
      case 'exchange_deadline':
        return formatMessage(t('subjectExchangeDeadline'), {
          sequence: entry.sequence,
        });
    }
    return unexpected(entry);
  }

  function sideView(label: ConsistencyMessageKey, entry: DiscrepancySide) {
    return (
      <div>
        <dt>{t(label)}</dt>
        <dd>
          <strong>{value(entry.value)}</strong>
          {entry.detail !== null && <> ({entry.detail})</>}
          {entry.source !== null && (
            <>
              <br />
              {t('from')}: {source(entry.source)}
            </>
          )}
        </dd>
      </div>
    );
  }

  function resolutionView(entry: DiscrepancyResolution) {
    let line: string;
    switch (entry.via) {
      case 'acceptance':
        line = t('resolvedAccepted');
        break;
      case 'justification':
        line = formatMessage(t('resolvedJustified'), {
          source: entry.source ? source(entry.source) : '—',
        });
        break;
      case 'record':
        line = formatMessage(t('resolvedCorrectedRecord'), {
          source: entry.source ? source(entry.source) : '—',
          revision: entry.caseRevision,
        });
        break;
      case 'resolution':
        line = formatMessage(t('resolvedCorrectedResolution'), {
          source: entry.source ? source(entry.source) : '—',
        });
        break;
      default:
        return unexpected(entry);
    }
    return (
      <>
        <p>
          <span aria-hidden="true">✓ </span>
          {line}
          {entry.by !== null && entry.at !== null && (
            <>
              {' — '}
              {formatMessage(t('resolvedBy'), {
                by: entry.by.displayName,
                at: formatDateTime(entry.at),
              })}
            </>
          )}
        </p>
        {entry.reason !== null && (
          <p>{formatMessage(t('resolvedReason'), { reason: entry.reason })}</p>
        )}
      </>
    );
  }

  function item(entry: Discrepancy) {
    // An identity may come back after it ended: each occurrence has its own.
    const headingId = `${props.prefix}-discrepancy-${entry.id}-${String(entry.openedRevision)}`;
    const heading =
      entry.origin === 'rule'
        ? `${entry.rule} — ${t(ruleLabel(entry.rule))}`
        : formatMessage(t('manualHeading'), {
            sequence: entry.sequence,
            subject: entry.subject,
          });
    const editing =
      props.resolution.draft?.discrepancyId === entry.id
        ? props.resolution.draft
        : null;
    const acceptable = resolvable && canAccept(entry, props.roles);
    const correctable = resolvable && canCorrect(entry, props.roles);
    const contributor =
      props.roles.manager ||
      props.roles.independentApprover ||
      props.roles.auditorOnTeam;
    return (
      <li
        key={`${entry.id}-${String(entry.openedRevision)}`}
        aria-labelledby={headingId}
      >
        <p id={headingId} className="certification-discrepancy-heading">
          <strong>{heading}</strong> <VerdictLabel verdict={entry.verdict} />
        </p>
        <dl className="certification-summary">
          {entry.origin === 'rule' && (
            <div>
              <dt>{t('compared')}</dt>
              <dd>{subject(entry.subject)}</dd>
            </div>
          )}
          {sideView('firstValue', entry.left)}
          {sideView('secondValue', entry.right)}
          {entry.origin === 'manual' && entry.note !== null && (
            <div>
              <dt>{t('note')}</dt>
              <dd>{entry.note}</dd>
            </div>
          )}
        </dl>
        <p>
          {entry.opened
            ? formatMessage(t('openedSince'), {
                revision: entry.openedRevision,
                by: entry.opened.by.displayName,
                at: formatDateTime(entry.opened.at),
              })
            : formatMessage(t('openedAtRevision'), {
                revision: entry.openedRevision,
              })}
        </p>
        {entry.status === 'open' ? (
          <p
            className={
              entry.blocks ? 'certification-blocked' : 'certification-note'
            }
          >
            {entry.verdict === 'to_clarify'
              ? t('neverBlocks')
              : entry.blocks === 'decision'
                ? t('blocksDecision')
                : entry.blocks === 'certificate_draft_approval'
                  ? t('blocksCertificate')
                  : t('blocksNothing')}
          </p>
        ) : (
          resolutionView(entry.resolution)
        )}
        {/* A correction by a record already names the revision it ended at. */}
        {entry.endedRevision !== null && entry.resolution?.via !== 'record' && (
          <p>
            {formatMessage(t('endedSince'), {
              revision: entry.endedRevision,
            })}
          </p>
        )}
        {entry.status === 'open' && contributor && resolvable && (
          <>
            {entry.verdict === 'critical' && (
              <p className="certification-note">
                {t('criticalOnlyCorrection')}
              </p>
            )}
            {entry.verdict === 'error' && !acceptable && (
              <p className="certification-note">{t('errorApproverOnly')}</p>
            )}
            {editing === null && (acceptable || correctable) && (
              <div className="certification-actions">
                {acceptable && (
                  <button
                    type="button"
                    disabled={props.busy}
                    aria-describedby={headingId}
                    onClick={() =>
                      props.onResolutionDraft({
                        discrepancyId: entry.id,
                        resolution: 'accepted',
                        reason: '',
                        correctedBy: '',
                        reverify: false,
                      })
                    }
                  >
                    {t('acceptAction')}
                  </button>
                )}
                {correctable && (
                  <button
                    type="button"
                    disabled={props.busy}
                    aria-describedby={headingId}
                    onClick={() =>
                      props.onResolutionDraft({
                        discrepancyId: entry.id,
                        resolution: 'corrected',
                        reason: '',
                        correctedBy: '',
                        reverify: false,
                      })
                    }
                  >
                    {t('correctAction')}
                  </button>
                )}
              </div>
            )}
            {editing !== null && resolutionForm(editing)}
          </>
        )}
      </li>
    );
  }

  function resolutionForm(draft: ResolutionDraft) {
    const formId = `${props.prefix}-resolution`;
    const title =
      draft.resolution === 'accepted'
        ? t('acceptFormTitle')
        : t('correctFormTitle');
    const corrections = [
      ...props.register.items.map((attachment) => ({
        value: `attachment:${attachment.id}`,
        label: formatMessage(t('sourceDocument'), {
          title: attachment.sourceTitle,
          version: attachment.versionNumber,
        }),
      })),
      ...props.timeline.entries.map((entry) => ({
        value: `step:${entry.id}`,
        label: formatMessage(t('sourceStep'), {
          step: t(stepLabel(entry.step)),
          version: entry.version,
        }),
      })),
    ];
    return (
      <form
        className="certification-form"
        aria-label={title}
        noValidate
        onSubmit={props.onResolutionSubmit}
      >
        {props.resolution.feedback}
        {draft.resolution === 'corrected' && (
          <>
            <label htmlFor={`${formId}-correction`}>{t('correctedBy')}</label>
            <Select
              id={`${formId}-correction`}
              value={draft.correctedBy}
              placeholder={t('selectCorrection')}
              disabled={props.busy}
              invalid={invalidField(
                props.resolution.describedBy,
                draft.correctedBy === '',
              )}
              describedBy={props.resolution.describedBy}
              options={corrections}
              onValueChange={(correctedBy) =>
                props.onResolutionDraft({ ...draft, correctedBy })
              }
            />
          </>
        )}
        <label htmlFor={`${formId}-reason`}>{t('reason')}</label>
        <textarea
          id={`${formId}-reason`}
          value={draft.reason}
          maxLength={CONSISTENCY_LIMITS.reason}
          required
          disabled={props.busy}
          aria-invalid={invalidField(
            props.resolution.describedBy,
            blank(draft.reason),
          )}
          aria-describedby={props.resolution.describedBy}
          onChange={(event) =>
            props.onResolutionDraft({ ...draft, reason: event.target.value })
          }
        />
        {draft.resolution === 'accepted' && (
          <label>
            <input
              type="checkbox"
              checked={draft.reverify}
              disabled={props.busy}
              onChange={(event) =>
                props.onResolutionDraft({
                  ...draft,
                  reverify: event.target.checked,
                })
              }
            />{' '}
            {t('reverifyFlag')}
          </label>
        )}
        <div className="certification-actions">
          <button
            type="submit"
            className="certification-primary"
            disabled={props.busy}
          >
            {props.resolution.saving
              ? t('saving')
              : draft.resolution === 'accepted'
                ? t('acceptSubmit')
                : t('correctSubmit')}
          </button>
          <button
            type="button"
            disabled={props.busy}
            onClick={() => props.onResolutionDraft(null)}
          >
            {t('cancel')}
          </button>
        </div>
      </form>
    );
  }

  function manualForm(manual: FormState<ManualDraft> & { open: boolean }) {
    const formId = `${props.prefix}-manual`;
    const draft = manual.draft;
    const set = (patch: Partial<ManualDraft>) =>
      props.onManualDraft({ ...draft, ...patch });
    const documents = props.register.items.map((attachment) => ({
      value: attachment.id,
      label: formatMessage(t('sourceDocument'), {
        title: attachment.sourceTitle,
        version: attachment.versionNumber,
      }),
    }));
    const stated = (sideKey: 'left' | 'right') => {
      const left = sideKey === 'left';
      const legend = left ? 'manualFirstValue' : 'manualSecondValue';
      const side = left
        ? {
            value: draft.leftValue,
            attachmentId: draft.leftAttachmentId,
            location: draft.leftLocation,
          }
        : {
            value: draft.rightValue,
            attachmentId: draft.rightAttachmentId,
            location: draft.rightLocation,
          };
      const setSide = (patch: Partial<typeof side>) =>
        set(
          left
            ? {
                leftValue: patch.value ?? side.value,
                leftAttachmentId: patch.attachmentId ?? side.attachmentId,
                leftLocation: patch.location ?? side.location,
              }
            : {
                rightValue: patch.value ?? side.value,
                rightAttachmentId: patch.attachmentId ?? side.attachmentId,
                rightLocation: patch.location ?? side.location,
              },
        );
      return (
        <fieldset>
          <legend>{t(legend)}</legend>
          <label htmlFor={`${formId}-${sideKey}-value`}>
            {t('manualValue')}
          </label>
          <input
            id={`${formId}-${sideKey}-value`}
            value={side.value}
            maxLength={CONSISTENCY_LIMITS.value}
            required
            disabled={props.busy}
            aria-invalid={invalidField(manual.describedBy, blank(side.value))}
            aria-describedby={manual.describedBy}
            onChange={(event) => setSide({ value: event.target.value })}
          />
          <label htmlFor={`${formId}-${sideKey}-document`}>
            {t('manualDocument')}
          </label>
          <Select
            id={`${formId}-${sideKey}-document`}
            value={side.attachmentId}
            placeholder={t('selectDocument')}
            disabled={props.busy}
            invalid={invalidField(manual.describedBy, side.attachmentId === '')}
            describedBy={manual.describedBy}
            options={documents}
            onValueChange={(attachmentId) => setSide({ attachmentId })}
          />
          <label htmlFor={`${formId}-${sideKey}-location`}>
            {t('manualLocation')}
          </label>
          <input
            id={`${formId}-${sideKey}-location`}
            value={side.location}
            maxLength={CONSISTENCY_LIMITS.location}
            disabled={props.busy}
            aria-describedby={manual.describedBy}
            onChange={(event) => setSide({ location: event.target.value })}
          />
        </fieldset>
      );
    };
    return (
      <form
        className="certification-form"
        aria-label={t('manualFormTitle')}
        noValidate
        onSubmit={props.onManualSubmit}
      >
        <p>{t('manualHelp')}</p>
        {manual.feedback}
        <label htmlFor={`${formId}-subject`}>{t('manualSubject')}</label>
        <input
          id={`${formId}-subject`}
          value={draft.subject}
          maxLength={CONSISTENCY_LIMITS.subject}
          required
          disabled={props.busy}
          aria-invalid={invalidField(manual.describedBy, blank(draft.subject))}
          aria-describedby={manual.describedBy}
          onChange={(event) => set({ subject: event.target.value })}
        />
        <fieldset aria-describedby={manual.describedBy}>
          <legend>{t('manualVerdict')}</legend>
          {DISCREPANCY_VERDICTS.map((verdict) => (
            <label key={verdict}>
              <input
                type="radio"
                name={`${formId}-verdict`}
                value={verdict}
                checked={draft.verdict === verdict}
                disabled={props.busy}
                onChange={() => set({ verdict })}
              />{' '}
              {t(verdictLabel(verdict))}
            </label>
          ))}
        </fieldset>
        {stated('left')}
        {stated('right')}
        <label htmlFor={`${formId}-note`}>{t('manualNote')}</label>
        <textarea
          id={`${formId}-note`}
          value={draft.note}
          maxLength={CONSISTENCY_LIMITS.note}
          disabled={props.busy}
          aria-describedby={manual.describedBy}
          onChange={(event) => set({ note: event.target.value })}
        />
        <div className="certification-actions">
          <button
            type="submit"
            className="certification-primary"
            disabled={props.busy}
          >
            {manual.saving ? t('saving') : t('manualSubmit')}
          </button>
          <button
            type="button"
            disabled={props.busy}
            onClick={() => props.onManualOpen(false)}
          >
            {t('cancel')}
          </button>
        </div>
      </form>
    );
  }

  const manual = props.manual;
  return (
    <section aria-labelledby={titleId} className="certification-consistency">
      <h5 id={titleId}>{t('title')}</h5>
      <p>{t('introduction')}</p>
      <p>
        {formatMessage(t('ruleSet'), { version: consistency.ruleSetVersion })}
      </p>
      <ul
        aria-label={t('countsLabel')}
        className="certification-consistency-counts"
      >
        {(
          [
            ['critical', consistency.counts.critical],
            ['error', consistency.counts.error],
            ['to_clarify', consistency.counts.toClarify],
          ] as const
        ).map(([verdict, total]) => (
          <li key={verdict}>
            <VerdictLabel verdict={verdict} />: {formatNumber(total)}
          </li>
        ))}
      </ul>
      {empty ? (
        <p>
          {formatMessage(t('empty'), { version: consistency.ruleSetVersion })}
        </p>
      ) : (
        consistency.open.length === 0 && <p>{t('noneOpen')}</p>
      )}
      {consistency.open.length > 0 && (
        <>
          <h6>{t('openTitle')}</h6>
          <ol className="certification-discrepancies">
            {consistency.open.map(item)}
          </ol>
        </>
      )}
      {props.resolution.draft === null && props.resolution.feedback}
      {manual !== null &&
        detail.status === 'open' &&
        canRecordDiscrepancy(props.roles) &&
        (manual.open ? (
          manualForm(manual)
        ) : (
          <div className="certification-actions">
            {manual.feedback}
            <button
              type="button"
              disabled={props.busy}
              onClick={() => props.onManualOpen(true)}
            >
              {t('manualToggle')}
            </button>
          </div>
        ))}
      {consistency.resolved.length > 0 && (
        <>
          <h6>{t('resolvedTitle')}</h6>
          {consistency.resolvedTotal > consistency.resolved.length && (
            <p>
              {formatMessage(t('resolvedPartial'), {
                shown: consistency.resolved.length,
                total: consistency.resolvedTotal,
              })}
            </p>
          )}
          <ol className="certification-discrepancies">
            {consistency.resolved.map(item)}
          </ol>
        </>
      )}
    </section>
  );
}

/** A verdict by text and icon, never by colour alone. */
function VerdictLabel({ verdict }: { verdict: DiscrepancyVerdict }) {
  const t = useConsistencyCopy();
  const icon = verdict === 'critical' ? '⛔' : verdict === 'error' ? '⚠' : 'ℹ';
  return (
    <span
      className={`certification-verdict certification-verdict-${verdict.replace('_', '-')}`}
    >
      <span aria-hidden="true">{icon} </span>
      {t(verdictLabel(verdict))}
    </span>
  );
}

function verdictLabel(verdict: DiscrepancyVerdict): ConsistencyMessageKey {
  switch (verdict) {
    case 'critical':
      return 'verdictCritical';
    case 'error':
      return 'verdictError';
    case 'to_clarify':
      return 'verdictToClarify';
  }
  return unexpected(verdict);
}

export function ruleLabel(rule: ConsistencyRule): ConsistencyMessageKey {
  switch (rule) {
    case 'R01':
      return 'ruleR01';
    case 'R02':
      return 'ruleR02';
    case 'R03':
      return 'ruleR03';
    case 'R04':
      return 'ruleR04';
    case 'R05':
      return 'ruleR05';
    case 'R06':
      return 'ruleR06';
    case 'R07':
      return 'ruleR07';
    case 'R08':
      return 'ruleR08';
    case 'R09':
      return 'ruleR09';
    case 'R10':
      return 'ruleR10';
    case 'R11':
      return 'ruleR11';
    case 'R12':
      return 'ruleR12';
    case 'R13':
      return 'ruleR13';
    case 'R14':
      return 'ruleR14';
    case 'R15':
      return 'ruleR15';
    case 'R16':
      return 'ruleR16';
  }
  return unexpected(rule);
}

function stateLabel(state: DiscrepancyState): ConsistencyMessageKey {
  switch (state) {
    case 'present':
      return 'statePresent';
    case 'missing':
      return 'stateMissing';
    case 'not_applicable':
      return 'stateNotApplicable';
    case 'recorded':
      return 'stateRecorded';
    case 'not_recorded':
      return 'stateNotRecorded';
    case 'not_declared':
      return 'stateNotDeclared';
    case 'not_computable':
      return 'stateNotComputable';
  }
  return unexpected(state);
}

function dateLabel(fact: DateFact): ConsistencyMessageKey {
  switch (fact) {
    case 'agreement_signed':
      return 'dateAgreementSigned';
    case 'team_approved':
      return 'dateTeamApproved';
    case 'stage_1_start':
      return 'dateStage1Start';
    case 'stage_1_end':
      return 'dateStage1End';
    case 'stage_1_report':
      return 'dateStage1Report';
    case 'stage_2_end':
      return 'dateStage2End';
    case 'stage_2_report':
      return 'dateStage2Report';
    case 'recommendation':
      return 'dateRecommendation';
    case 'dossier_reviewed':
      return 'dateDossierReviewed';
    case 'dossier_approved':
      return 'dateDossierApproved';
    case 'decision':
      return 'dateDecision';
    case 'draft_sent':
      return 'dateDraftSent';
    case 'client_opinion':
      return 'dateClientOpinion';
  }
  return unexpected(fact);
}

function itemLabel(item: ConsistencyDossierItem): ConsistencyMessageKey {
  switch (item) {
    case 'application':
      return 'itemApplication';
    case 'application_review':
      return 'itemApplicationReview';
    case 'duration':
      return 'itemDuration';
    case 'agreement':
      return 'itemAgreement';
    case 'team_approval':
      return 'itemTeamApproval';
    case 'stage_1_plan':
      return 'itemStage1Plan';
    case 'stage_1_report':
      return 'itemStage1Report';
    case 'stage_2_plan':
      return 'itemStage2Plan';
    case 'stage_2_report':
      return 'itemStage2Report';
    case 'participant_lists':
      return 'itemParticipantLists';
    case 'findings_follow_up':
      return 'itemFindingsFollowUp';
    case 'recommendation':
      return 'itemRecommendation';
    case 'certificate_data':
      return 'itemCertificateData';
  }
  return unexpected(item);
}

function stepLabel(step: SourceStep): ConsistencyMessageKey {
  switch (step) {
    case 'application':
      return 'stepApplication';
    case 'application_review':
      return 'stepApplicationReview';
    case 'duration':
      return 'stepDuration';
    case 'agreement':
      return 'stepAgreement';
    case 'team':
      return 'stepTeam';
    case 'team_decision':
      return 'stepTeamDecision';
    case 'stage_1_plan':
      return 'stepStage1Plan';
    case 'stage_1_report':
      return 'stepStage1Report';
    case 'stage_2_plan':
      return 'stepStage2Plan';
    case 'stage_2_report':
      return 'stepStage2Report';
    case 'recommendation':
      return 'stepRecommendation';
    case 'dossier_review':
      return 'stepDossierReview';
    case 'decision':
      return 'stepDecision';
    case 'certificate_data':
      return 'stepCertificateData';
    case 'certificate_draft':
      return 'stepCertificateDraft';
    case 'client_opinion':
      return 'stepClientOpinion';
    case 'certificate_draft_approval':
      return 'stepCertificateDraftApproval';
  }
  return unexpected(step);
}

function unexpected(value: never): never {
  throw new Error(`Unexpected consistency view value: ${String(value)}`);
}
