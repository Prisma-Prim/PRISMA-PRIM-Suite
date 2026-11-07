import type { ReactNode } from 'react';
import { useInterfaceLocale } from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import { useCertificationCopy } from './certification.copy';
import { DurationView } from './CertificationDurationViews';
import {
  REVIEW_CRITERIA,
  type ApplicationFacts,
  type ApplicationReview,
  type CaseDetail,
  type CaseTimeline,
  type CertificationNextStep,
  type StepVersion,
} from './certification-response';

/** Every recorded application fact, missing optional values stated as such. */
export function FactsView({ facts }: { facts: ApplicationFacts }) {
  const copy = useCertificationCopy();
  const { formatNumber } = useInterfaceLocale();
  const optional = (value: string | null) => value ?? copy('notProvided');
  return (
    <dl className="certification-facts">
      <dt>{copy('declaredLegalName')}</dt>
      <dd>{facts.declaredLegalName}</dd>
      <dt>{copy('declaredAddress')}</dt>
      <dd>{facts.declaredAddress}</dd>
      <dt>{copy('sites')}</dt>
      <dd>
        <ol>
          {facts.sites.map((site, index) => (
            <li key={index}>
              {site.address} — {site.activity}
            </li>
          ))}
        </ol>
      </dd>
      <dt>{copy('requestedScope')}</dt>
      <dd>{facts.requestedScope}</dd>
      <dt>{copy('foodChainSubcategories')}</dt>
      <dd>{facts.foodChainSubcategories.join(', ')}</dd>
      <dt>{copy('haccpStudyCount')}</dt>
      <dd>{formatNumber(facts.haccpStudyCount)}</dd>
      <dt>{copy('totalHeadcount')}</dt>
      <dd>{formatNumber(facts.totalHeadcount)}</dd>
      <dt>{copy('effectiveFte')}</dt>
      <dd>{formatNumber(facts.effectiveFte)}</dd>
      <dt>{copy('shiftCount')}</dt>
      <dd>{formatNumber(facts.shiftCount)}</dd>
      <dt>{copy('seasonalActivity')}</dt>
      <dd>{optional(facts.seasonalActivity)}</dd>
      <dt>{copy('otherCertifiedSystems')}</dt>
      <dd>{optional(facts.otherCertifiedSystems)}</dd>
      <dt>{copy('outsourcedProcesses')}</dt>
      <dd>{optional(facts.outsourcedProcesses)}</dd>
      <dt>{copy('consultant')}</dt>
      <dd>
        {facts.consultant.used ? facts.consultant.name : copy('consultantNone')}
      </dd>
      <dt>{copy('auditLanguages')}</dt>
      <dd>{facts.auditLanguages.join(', ')}</dd>
      <dt>{copy('preferredAuditPeriod')}</dt>
      <dd>{optional(facts.preferredAuditPeriod)}</dd>
    </dl>
  );
}

/** The four explicit answers with their notes, then the outcome. */
export function ReviewView({ review }: { review: ApplicationReview }) {
  const copy = useCertificationCopy();
  return (
    <dl className="certification-facts">
      {REVIEW_CRITERIA.map((criterion) => (
        <div key={criterion}>
          <dt>{copy(criterion)}</dt>
          <dd>
            <strong>
              {copy(review.criteria[criterion].answer === 'yes' ? 'yes' : 'no')}
            </strong>{' '}
            — {review.criteria[criterion].note}
          </dd>
        </div>
      ))}
      <div>
        <dt>{copy('outcome')}</dt>
        <dd>
          <span
            className={`certification-status certification-status-${review.outcome}`}
          >
            {copy(review.outcome)}
          </span>
        </dd>
      </div>
      {review.outcome === 'rejected' && (
        <div>
          <dt>{copy('rejectionReason')}</dt>
          <dd>{review.rejectionReason}</dd>
        </div>
      )}
    </dl>
  );
}

/** Who recorded a version, when, and why when it corrects an earlier one. */
export function VersionAttribution({ version }: { version: StepVersion }) {
  const copy = useCertificationCopy();
  const { formatDateTime } = useInterfaceLocale();
  return (
    <p className="certification-attribution">
      {formatMessage(copy('version'), { version: version.version })} ·{' '}
      {copy('recordedBy')}: {version.recordedBy.displayName} ·{' '}
      {copy('recordedAt')}:{' '}
      <time dateTime={version.recordedAt}>
        {formatDateTime(version.recordedAt)}
      </time>
      {version.reason !== null && (
        <>
          <br />
          {copy('correctionReason')}: {version.reason}
        </>
      )}
    </p>
  );
}

/** The state of each step of this slice, derived only from the read Case. */
export function StepRail({ detail }: { detail: CaseDetail }) {
  const copy = useCertificationCopy();
  const closed = detail.status === 'rejected';
  const application = detail.application
    ? formatMessage(copy('stepRecorded'), {
        version: detail.application.version,
      })
    : closed
      ? copy('stepClosed')
      : copy('stepToRecord');
  const review = detail.applicationReview
    ? copy(
        detail.applicationReview.value.outcome === 'accepted'
          ? 'stepAccepted'
          : 'stepRejected',
      )
    : detail.application
      ? copy('stepToRecord')
      : copy('stepWaiting');
  const duration = closed
    ? copy('stepClosed')
    : detail.duration
      ? formatMessage(copy('stepRecorded'), {
          version: detail.duration.version,
        })
      : detail.applicationReview?.value.outcome === 'accepted'
        ? copy('stepToRecord')
        : copy('stepWaitingReview');
  const agreement = closed ? copy('stepClosed') : copy('stepNotAvailable');
  return (
    <ol className="certification-steps" aria-label={copy('steps')}>
      <li data-current={detail.nextStep === 'application'}>
        <strong>{copy('stepApplication')}</strong> {application}
      </li>
      <li data-current={detail.nextStep === 'application_review'}>
        <strong>{copy('stepReview')}</strong> {review}
      </li>
      <li data-current={detail.nextStep === 'duration'}>
        <strong>{copy('stepDuration')}</strong> {duration}
      </li>
      <li data-current={detail.nextStep === 'agreement'}>
        <strong>{copy('stepAgreement')}</strong> {agreement}
      </li>
    </ol>
  );
}

export function NextStepLabel({ step }: { step: CertificationNextStep }) {
  const copy = useCertificationCopy();
  switch (step) {
    case 'application':
      return <>{copy('nextApplication')}</>;
    case 'application_review':
      return <>{copy('nextApplicationReview')}</>;
    case 'duration':
      return <>{copy('nextDuration')}</>;
    case 'agreement':
      return <>{copy('nextAgreement')}</>;
    case null:
      return <>{copy('nextNone')}</>;
  }
  return unexpected(step);
}

/** Every recorded version in server order, each with its exact values. */
export function TimelineView({ timeline }: { timeline: CaseTimeline }) {
  const copy = useCertificationCopy();
  if (timeline.entries.length === 0) return <p>{copy('timelineEmpty')}</p>;
  return (
    <ol className="certification-timeline">
      {timeline.entries.map((entry) => (
        <li key={entry.id}>
          <TimelineEntry entry={entry} />
        </li>
      ))}
    </ol>
  );
}

function TimelineEntry({ entry }: { entry: StepVersion }) {
  const copy = useCertificationCopy();
  const values = (title: string, recorded: ReactNode) => (
    <>
      <strong>{title}</strong>
      <VersionAttribution version={entry} />
      <details>
        <summary>{copy('showValues')}</summary>
        {recorded}
      </details>
    </>
  );
  switch (entry.step) {
    case 'application':
      return values(
        formatMessage(copy('timelineApplication'), { version: entry.version }),
        <FactsView facts={entry.value} />,
      );
    case 'application_review':
      return values(
        formatMessage(copy('timelineReview'), {
          outcome: copy(entry.value.outcome),
        }),
        <ReviewView review={entry.value} />,
      );
    case 'duration':
      return values(
        formatMessage(copy('timelineDuration'), { version: entry.version }),
        <DurationView determination={entry.value} />,
      );
  }
  return unexpected(entry);
}

function unexpected(value: never): never {
  throw new Error(`Unexpected Certification step: ${String(value)}`);
}
