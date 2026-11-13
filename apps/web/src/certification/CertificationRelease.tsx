import { useCertificationCopy } from './certification.copy';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useInterfaceLocale } from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import { ActingFieldset, VersionAttribution } from './CertificationAttribution';
import { useAttachmentReference } from './CertificationDocumentViews';
import {
  actingFromDraft,
  emptyActingDraft,
  latestBusinessDate,
} from './certification-attribution';
import {
  isCalendarDate,
  type CaseDetail,
  type DocumentRegister,
} from './certification-response';
import { useReleaseCopy } from './certification-release.copy';
import { useExchangeCopy } from './certification-exchanges.copy';
import {
  type ReleaseCommand,
  type OpinionSkipReason,
} from './certification-release';

type CommandKind = ReleaseCommand['kind'];
interface Props {
  form: ReturnType<typeof useCertificateReleaseForm>;
  current: CaseDetail;
  register: DocumentRegister;
  manage: boolean;
  approve: boolean;
  disabled: boolean;
  blocked: Record<CommandKind, boolean>;
  feedback: Record<CommandKind, ReactNode>;
  onCommand: (command: ReleaseCommand) => void;
  issuance: ReactNode;
}

const emptyDraft = () => ({
  attachmentId: '',
  decisionVersionId: '',
  certificateDataVersionId: '',
  number: '',
  draftedOn: '',
  reason: '',
});
const emptyOpinion = () => ({
  draftVersionId: '',
  businessDate: '',
  outcome: '',
  exchangeRecordId: '',
  requestedChange: '',
  skipReason: '',
  note: '',
  reason: '',
});
const emptyApproval = () => ({
  draftVersionId: '',
  opinionVersionId: '',
  approvedOn: '',
  textsConfirmed: false,
  numberConfirmed: false,
  validityConfirmed: false,
  independenceAttested: false,
  reason: '',
  onBehalf: emptyActingDraft(),
});

/** Lives beside the selected Case so loading/reloading never discards typed drafts. */
export function useCertificateReleaseForm() {
  const [draft, setDraft] = useState(emptyDraft);
  const [opinion, setOpinion] = useState(emptyOpinion);
  const [approval, setApproval] = useState(emptyApproval);
  const [invalid, setInvalid] = useState<CommandKind | null>(null);
  return {
    draft,
    setDraft,
    opinion,
    setOpinion,
    approval,
    setApproval,
    invalid,
    setInvalid,
    reset(kind: CommandKind) {
      if (kind === 'certificateDraft') setDraft(emptyDraft());
      else if (kind === 'clientOpinion') setOpinion(emptyOpinion());
      else setApproval(emptyApproval());
      setInvalid(null);
    },
  };
}

/** Owns the five release steps; the workspace owns authenticated serialization/retry. */
export function CertificateReleaseRegion(props: Props) {
  const { current, register } = props;
  const release = current.release;
  const t = useReleaseCopy();
  const copy = useCertificationCopy();
  const exchanges = useExchangeCopy();
  const { formatDate, formatDateTime } = useInterfaceLocale();
  const attachmentName = useAttachmentReference();
  const prefix = useId();
  const attachedDraftName = (attachmentId: string) => {
    const attached = register.items.find((item) => item.id === attachmentId);
    return attached ? attachmentName(attached) : t('draftPdf');
  };
  const {
    draft,
    setDraft: setDraftState,
    opinion,
    setOpinion: setOpinionState,
    approval,
    setApproval: setApprovalState,
    invalid,
    setInvalid,
  } = props.form;
  const latestDraft = release.drafts.at(-1);
  const applicableOpinion = release.opinions
    .filter((entry) => entry.value.draftVersionId === latestDraft?.id)
    .at(-1);
  const setDraft = (next: typeof draft) =>
    setDraftState({
      ...next,
      decisionVersionId: next.decisionVersionId || current.decision?.id || '',
      certificateDataVersionId:
        next.certificateDataVersionId || current.certificateData?.id || '',
    });
  const setOpinion = (next: typeof opinion) =>
    setOpinionState({
      ...next,
      draftVersionId: next.draftVersionId || latestDraft?.id || '',
    });
  const setApproval = (next: typeof approval) =>
    setApprovalState({
      ...next,
      draftVersionId: next.draftVersionId || latestDraft?.id || '',
      opinionVersionId: next.opinionVersionId || applicableOpinion?.id || '',
    });
  const draftChanged =
    draft.decisionVersionId !== '' &&
    (draft.decisionVersionId !== current.decision?.id ||
      draft.certificateDataVersionId !== current.certificateData?.id);
  const opinionChanged =
    opinion.draftVersionId !== '' && opinion.draftVersionId !== latestDraft?.id;
  const approvalChanged =
    approval.draftVersionId !== '' &&
    (approval.draftVersionId !== latestDraft?.id ||
      approval.opinionVersionId !== applicableOpinion?.id);
  const restart = (kind: CommandKind, changed: boolean) =>
    changed ? (
      <div role="alert">
        <p>
          {t(
            kind === 'draftApproval'
              ? 'approvalContextChanged'
              : 'draft_outdated',
          )}
        </p>
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => props.form.reset(kind)}
        >
          {t('restart')}
        </button>
      </div>
    ) : null;
  const openGrant =
    current.status === 'open' && current.decision?.value.decision === 'granted';
  const id = (field: string) => `${prefix}-${field}`;
  const onInvalid = (kind: CommandKind) => {
    setInvalid(kind);
  };
  const required = (value: string, max = 2000) =>
    value.trim().length > 0 && value.trim().length <= max;
  const reasonFor = (reason: string, count: number) =>
    count === 0 || required(reason);
  const reasonValue = (reason: string, count: number) =>
    count === 0 ? {} : { reason: reason.trim() };
  const blocked = (kind: CommandKind) => props.disabled || props.blocked[kind];
  const dateField = (
    field: string,
    label: string,
    value: string,
    change: (next: string) => void,
  ) => (
    <div className="certification-field">
      <label htmlFor={id(field)}>{label}</label>
      <input
        id={id(field)}
        type="date"
        max={latestBusinessDate()}
        required
        value={value}
        disabled={props.disabled}
        onChange={(event) => change(event.target.value)}
      />
    </div>
  );
  const textField = (
    field: string,
    label: string,
    value: string,
    change: (next: string) => void,
    max = 2000,
  ) => (
    <div className="certification-field">
      <label htmlFor={id(field)}>{label}</label>
      <input
        id={id(field)}
        value={value}
        maxLength={max}
        required
        disabled={props.disabled}
        onChange={(event) => change(event.target.value)}
      />
    </div>
  );
  const reasonField = (
    kind: CommandKind,
    value: string,
    count: number,
    change: (next: string) => void,
  ) =>
    count === 0
      ? null
      : textField(`${kind}-reason`, t('reason'), value, change);
  const confirmation = (
    field:
      | 'textsConfirmed'
      | 'numberConfirmed'
      | 'validityConfirmed'
      | 'independenceAttested',
    label: string,
  ) => (
    <label className="certification-choice">
      <input
        type="checkbox"
        checked={approval[field]}
        disabled={props.disabled}
        onChange={(event) =>
          setApproval({ ...approval, [field]: event.target.checked })
        }
      />
      {label}
    </label>
  );
  const errors = (kind: CommandKind) => (
    <>
      {invalid === kind && <p role="alert">{t('validation')}</p>}
      {props.feedback[kind]}
    </>
  );
  const businessDate = (value: string) => (
    <time dateTime={value}>{formatDate(value)}</time>
  );
  const skippedReason = (reason: OpinionSkipReason) =>
    t(
      reason === 'texts_already_agreed'
        ? 'skipTexts'
        : reason === 'no_answer'
          ? 'skipNoAnswer'
          : 'skipOther',
    );

  function submitDraft(event: FormEvent) {
    event.preventDefault();
    const decision = current.decision;
    const data = current.certificateData;
    if (
      blocked('certificateDraft') ||
      draftChanged ||
      !openGrant ||
      !decision ||
      !data
    )
      return;
    if (
      !register.items.some(
        (entry) =>
          entry.id === draft.attachmentId && entry.role === 'certificate_draft',
      ) ||
      !required(draft.number, 64) ||
      !isCalendarDate(draft.draftedOn) ||
      !reasonFor(draft.reason, release.drafts.length)
    )
      return onInvalid('certificateDraft');
    setInvalid(null);
    props.onCommand({
      kind: 'certificateDraft',
      path: 'certificate-draft',
      value: {
        attachmentId: draft.attachmentId,
        number: draft.number.trim(),
        draftedOn: draft.draftedOn,
        decisionVersionId: draft.decisionVersionId,
        certificateDataVersionId: draft.certificateDataVersionId,
        ...reasonValue(draft.reason, release.drafts.length),
      },
    });
  }
  function submitOpinion(event: FormEvent) {
    event.preventDefault();
    if (
      blocked('clientOpinion') ||
      opinionChanged ||
      !openGrant ||
      !latestDraft
    )
      return;
    if (
      !isCalendarDate(opinion.businessDate) ||
      !reasonFor(opinion.reason, release.opinions.length)
    )
      return onInvalid('clientOpinion');
    const base = {
      draftVersionId: opinion.draftVersionId,
      businessDate: opinion.businessDate,
      ...reasonValue(opinion.reason, release.opinions.length),
    };
    let command: ReleaseCommand;
    if (opinion.outcome === 'skipped') {
      const reason = opinion.skipReason;
      if (
        (reason !== 'texts_already_agreed' &&
          reason !== 'no_answer' &&
          reason !== 'other') ||
        (reason === 'other' && !required(opinion.note))
      )
        return onInvalid('clientOpinion');
      command = {
        kind: 'clientOpinion',
        path: 'client-opinion',
        value: {
          ...base,
          outcome: 'skipped',
          skipReason: reason,
          note: opinion.note.trim() || null,
        },
      };
    } else if (
      (opinion.outcome === 'agreed' ||
        opinion.outcome === 'changes_requested') &&
      opinion.exchangeRecordId
    ) {
      if (opinion.outcome === 'changes_requested') {
        if (!required(opinion.requestedChange))
          return onInvalid('clientOpinion');
        command = {
          kind: 'clientOpinion',
          path: 'client-opinion',
          value: {
            ...base,
            outcome: 'changes_requested',
            exchangeRecordId: opinion.exchangeRecordId,
            requestedChange: opinion.requestedChange.trim(),
          },
        };
      } else
        command = {
          kind: 'clientOpinion',
          path: 'client-opinion',
          value: {
            ...base,
            outcome: 'agreed',
            exchangeRecordId: opinion.exchangeRecordId,
          },
        };
    } else return onInvalid('clientOpinion');
    setInvalid(null);
    props.onCommand(command);
  }
  function submitApproval(event: FormEvent) {
    event.preventDefault();
    if (
      blocked('draftApproval') ||
      approvalChanged ||
      !openGrant ||
      !latestDraft ||
      release.approvalBlockers.length
    )
      return;
    const onBehalf = actingFromDraft(approval.onBehalf, register.items);
    if (
      !isCalendarDate(approval.approvedOn) ||
      !approval.textsConfirmed ||
      !approval.numberConfirmed ||
      !approval.validityConfirmed ||
      !approval.independenceAttested ||
      onBehalf === undefined ||
      !reasonFor(approval.reason, release.approvals.length)
    )
      return onInvalid('draftApproval');
    setInvalid(null);
    props.onCommand({
      kind: 'draftApproval',
      path: 'certificate-draft-approval',
      value: {
        draftVersionId: approval.draftVersionId,
        approvedOn: approval.approvedOn,
        textsConfirmed: true,
        numberConfirmed: true,
        validityConfirmed: true,
        independenceAttested: true,
        onBehalf,
        ...reasonValue(approval.reason, release.approvals.length),
      },
    });
  }
  return (
    <section aria-labelledby={id('title')} className="certification-release">
      <h5 id={id('title')}>{t('title')}</h5>
      {!props.manage && !props.approve && (
        <p className="certification-note">{t('readonly')}</p>
      )}
      <ol className="certification-release-steps">
        <li>
          <h6>{t('draft')}</h6>
          {release.drafts.length === 0 && <p>{t('noDraft')}</p>}
          {release.drafts.map((entry) => (
            <div key={entry.id}>
              <VersionAttribution version={entry} />
              <p>
                {entry.value.number} · {businessDate(entry.value.draftedOn)} ·{' '}
                {entry.id === release.currentDraftId
                  ? t(release.outdated ? 'outdated' : 'current')
                  : null}
              </p>
              <p>{attachedDraftName(entry.value.attachmentId)}</p>
            </div>
          ))}
          {props.manage && openGrant && (
            <form
              aria-label={t('recordDraft')}
              onSubmit={submitDraft}
              noValidate
            >
              <h6>{t('recordDraft')}</h6>
              {restart('certificateDraft', draftChanged)}
              <div className="certification-field">
                <label htmlFor={id('draft-pdf')}>{t('draftPdf')}</label>
                <select
                  id={id('draft-pdf')}
                  required
                  value={draft.attachmentId}
                  disabled={props.disabled}
                  onChange={(event) =>
                    setDraft({ ...draft, attachmentId: event.target.value })
                  }
                >
                  <option value="">—</option>
                  {register.items
                    .filter((entry) => entry.role === 'certificate_draft')
                    .map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {attachmentName(entry)}
                      </option>
                    ))}
                </select>
              </div>
              {textField(
                'draft-number',
                t('number'),
                draft.number,
                (number) => setDraft({ ...draft, number }),
                64,
              )}
              {dateField(
                'draft-date',
                t('draftDate'),
                draft.draftedOn,
                (draftedOn) => setDraft({ ...draft, draftedOn }),
              )}
              {reasonField(
                'certificateDraft',
                draft.reason,
                release.drafts.length,
                (reason) => setDraft({ ...draft, reason }),
              )}
              {errors('certificateDraft')}
              <button
                disabled={blocked('certificateDraft') || draftChanged}
                type="submit"
              >
                {t('recordDraft')}
              </button>
            </form>
          )}
        </li>
        <li>
          <h6>{t('opinion')}</h6>
          {release.opinions.length === 0 && <p>{t('notRecorded')}</p>}
          {release.opinions.map((entry) => (
            <div key={entry.id}>
              <VersionAttribution version={entry} />
              <p>
                {t(
                  entry.value.outcome === 'agreed'
                    ? 'agreed'
                    : entry.value.outcome === 'changes_requested'
                      ? 'changesRequested'
                      : 'skipped',
                )}{' '}
                · {businessDate(entry.value.businessDate)}
              </p>
              {entry.value.outcome === 'changes_requested' && (
                <p>{entry.value.requestedChange}</p>
              )}
              {entry.value.outcome === 'skipped' && (
                <p>
                  {skippedReason(entry.value.skipReason)}
                  {entry.value.note ? ` — ${entry.value.note}` : ''}
                </p>
              )}
            </div>
          ))}
          {props.manage &&
            openGrant &&
            latestDraft &&
            !release.outdated &&
            applicableOpinion?.value.outcome !== 'changes_requested' && (
              <form
                aria-label={t('recordOpinion')}
                onSubmit={submitOpinion}
                noValidate
              >
                <h6>{t('recordOpinion')}</h6>
                {restart('clientOpinion', opinionChanged)}
                <p>{t('sendHint')}</p>
                {dateField(
                  'opinion-date',
                  t('opinionDate'),
                  opinion.businessDate,
                  (businessDate) => setOpinion({ ...opinion, businessDate }),
                )}
                <div className="certification-field">
                  <label htmlFor={id('opinion-outcome')}>{t('outcome')}</label>
                  <select
                    id={id('opinion-outcome')}
                    value={opinion.outcome}
                    disabled={props.disabled}
                    onChange={(event) =>
                      setOpinion({ ...opinion, outcome: event.target.value })
                    }
                  >
                    <option value="">—</option>
                    <option value="agreed">{t('agreed')}</option>
                    <option value="changes_requested">
                      {t('changesRequested')}
                    </option>
                    <option value="skipped">{t('skipped')}</option>
                  </select>
                </div>
                {opinion.outcome === 'skipped' ? (
                  <>
                    <div className="certification-field">
                      <label htmlFor={id('skip-reason')}>
                        {t('skipReason')}
                      </label>
                      <select
                        id={id('skip-reason')}
                        value={opinion.skipReason}
                        disabled={props.disabled}
                        onChange={(event) =>
                          setOpinion({
                            ...opinion,
                            skipReason: event.target.value,
                          })
                        }
                      >
                        <option value="">—</option>
                        <option value="texts_already_agreed">
                          {t('skipTexts')}
                        </option>
                        <option value="no_answer">{t('skipNoAnswer')}</option>
                        <option value="other">{t('skipOther')}</option>
                      </select>
                    </div>
                    {opinion.skipReason === 'other' &&
                      textField('skip-note', t('note'), opinion.note, (note) =>
                        setOpinion({ ...opinion, note }),
                      )}
                  </>
                ) : (
                  <>
                    <div className="certification-field">
                      <label htmlFor={id('opinion-exchange')}>
                        {t('opinionExchange')}
                      </label>
                      <select
                        id={id('opinion-exchange')}
                        value={opinion.exchangeRecordId}
                        disabled={props.disabled}
                        onChange={(event) =>
                          setOpinion({
                            ...opinion,
                            exchangeRecordId: event.target.value,
                          })
                        }
                      >
                        <option value="">—</option>
                        {current.exchanges.records
                          .filter(
                            (entry) =>
                              entry.current.direction === 'received' &&
                              entry.current.itemKind === 'client_opinion' &&
                              entry.current.counterpart.kind === 'client',
                          )
                          .map((entry) => (
                            <option
                              key={entry.current.id}
                              value={entry.current.id}
                            >
                              {entry.sequence} ·{' '}
                              {formatDate(entry.current.businessDate)} ·{' '}
                              {entry.current.counterpart.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    {opinion.outcome === 'changes_requested' &&
                      textField(
                        'requested-change',
                        t('requestedChange'),
                        opinion.requestedChange,
                        (requestedChange) =>
                          setOpinion({ ...opinion, requestedChange }),
                      )}
                  </>
                )}
                {reasonField(
                  'clientOpinion',
                  opinion.reason,
                  release.opinions.length,
                  (reason) => setOpinion({ ...opinion, reason }),
                )}
                {errors('clientOpinion')}
                <button
                  disabled={blocked('clientOpinion') || opinionChanged}
                  type="submit"
                >
                  {t('recordOpinion')}
                </button>
              </form>
            )}
        </li>
        <li>
          <h6>{t('approval')}</h6>
          {release.validity && (
            <dl className="certification-facts">
              <div>
                <dt>{copy('certificateValidFrom')}</dt>
                <dd>{businessDate(release.validity.validFrom)}</dd>
              </div>
              <div>
                <dt>{copy('certificateValidUntil')}</dt>
                <dd>{businessDate(release.validity.validUntil)}</dd>
              </div>
              <div>
                <dt>{copy('certificateFirstSurveillanceBy')}</dt>
                <dd>{businessDate(release.validity.firstSurveillanceBy)}</dd>
              </div>
            </dl>
          )}
          {release.approvals.length === 0 && <p>{t('notRecorded')}</p>}
          {release.approvals.map((entry) => (
            <div key={entry.id}>
              <VersionAttribution version={entry} />
              <p>
                {businessDate(entry.value.approvedOn)}
                {entry.value.onBehalf
                  ? ` · ${entry.value.onBehalf.actedBy} · ${entry.value.onBehalf.actedByFunction}`
                  : ''}
              </p>
            </div>
          ))}
          {!current.certificate && release.approvalBlockers.length > 0 && (
            <ul>
              {release.approvalBlockers.map((blocker) => (
                <li key={blocker}>{t(blocker)}</li>
              ))}
            </ul>
          )}
          {props.approve &&
            openGrant &&
            latestDraft &&
            release.issuanceBlockers.includes('approval_missing') &&
            release.approvalBlockers.length === 0 && (
              <form
                aria-label={t('approve')}
                onSubmit={submitApproval}
                noValidate
              >
                <h6>{t('approve')}</h6>
                {restart('draftApproval', approvalChanged)}
                {dateField(
                  'approval-date',
                  t('approvalDate'),
                  approval.approvedOn,
                  (approvedOn) => setApproval({ ...approval, approvedOn }),
                )}
                {confirmation('textsConfirmed', t('textsConfirmation'))}
                {confirmation('numberConfirmed', t('numberConfirmation'))}
                {confirmation('validityConfirmed', t('validityConfirmation'))}
                {confirmation('independenceAttested', t('independence'))}
                <ActingFieldset
                  idPrefix={id('approval-acting')}
                  legend="approvalOnBehalf"
                  draft={approval.onBehalf}
                  documents={register.items}
                  disabled={props.disabled}
                  onChange={(onBehalf) =>
                    setApproval({ ...approval, onBehalf })
                  }
                />
                {reasonField(
                  'draftApproval',
                  approval.reason,
                  release.approvals.length,
                  (reason) => setApproval({ ...approval, reason }),
                )}
                {errors('draftApproval')}
                <button
                  disabled={blocked('draftApproval') || approvalChanged}
                  type="submit"
                >
                  {t('approve')}
                </button>
              </form>
            )}
        </li>
        <li>
          <h6>{t('issuance')}</h6>
          {release.legacyIssuance && <p>{t('legacy')}</p>}
          {current.certificate?.issuedOn && (
            <p>
              {businessDate(current.certificate.issuedOn)} ·{' '}
              {current.certificate.recordedBy.displayName}
            </p>
          )}
          {props.issuance ?? <p>{t('notRecorded')}</p>}
          {!current.certificate && release.issuanceBlockers.length > 0 && (
            <ul>
              {release.issuanceBlockers.map((blocker) => (
                <li key={blocker}>{t(blocker)}</li>
              ))}
            </ul>
          )}
        </li>
        <li>
          <h6>{t('transmission')}</h6>
          {release.transmission ? (
            <p>
              {businessDate(release.transmission.businessDate)} ·{' '}
              {release.transmission.recordedBy.displayName} ·{' '}
              {exchanges(
                release.transmission.channel === 'email'
                  ? 'channelEmail'
                  : release.transmission.channel === 'courier'
                    ? 'channelCourier'
                    : release.transmission.channel === 'platform'
                      ? 'channelPlatform'
                      : release.transmission.channel === 'hand_delivery'
                        ? 'channelHandDelivery'
                        : 'channelOther',
              )}{' '}
              · {formatDateTime(release.transmission.recordedAt)}
            </p>
          ) : (
            <>
              <p>{t('notRecorded')}</p>
              {release.daysSinceIssuance !== null && (
                <p role="status">
                  {formatMessage(t('pendingDays'), {
                    days: release.daysSinceIssuance,
                  })}
                </p>
              )}
              {props.manage && current.certificate && (
                <p>{t('transmitHint')}</p>
              )}
            </>
          )}
        </li>
      </ol>
    </section>
  );
}
