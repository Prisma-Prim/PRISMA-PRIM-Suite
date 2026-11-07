import type { ReactNode } from 'react';
import { useInterfaceLocale } from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import { useCertificationCopy } from './certification.copy';
import { VersionAttribution } from './CertificationAttribution';
import { AgreementView } from './CertificationDocumentViews';
import { DurationView } from './CertificationDurationViews';
import {
  FindingTimelineItem,
  findingTimelineEntries,
} from './CertificationFindingViews';
import { findingBlocks, type Finding } from './certification-findings';
import {
  Stage1ReportView,
  Stage2ReportView,
  StagePlanView,
  conclusionLabel,
} from './CertificationStageViews';
import { approvedTeam } from './certification-stages';
import {
  DecisionView,
  TeamView,
  decisionLabel,
  type KnownPeople,
} from './CertificationTeamViews';
import {
  REVIEW_CRITERIA,
  type ApplicationFacts,
  type ApplicationReview,
  type CaseDetail,
  type CaseTimeline,
  type CertificationNextStep,
  type DocumentRegister,
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
  const agreement = closed
    ? copy('stepClosed')
    : detail.agreement
      ? formatMessage(copy('stepRecorded'), {
          version: detail.agreement.version,
        })
      : detail.duration
        ? copy('stepToRecord')
        : copy('stepWaitingDuration');
  const team = closed
    ? copy('stepClosed')
    : detail.team
      ? formatMessage(copy('stepRecorded'), { version: detail.team.version })
      : detail.agreement
        ? copy('stepToRecord')
        : copy('stepWaitingAgreement');
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
      <li data-current={detail.nextStep === 'team'}>
        <strong>{copy('stepTeam')}</strong> {team}
      </li>
      <li data-current={detail.nextStep === 'team_decision'}>
        <strong>{copy('stepTeamDecision')}</strong> {teamDecisionState(detail)}
      </li>
      <li
        data-current={
          detail.nextStep === 'stage_1_plan' ||
          detail.nextStep === 'stage_1_report'
        }
      >
        <strong>{copy('stepStage1')}</strong> {stage1State(detail)}
      </li>
      <li
        data-current={
          detail.nextStep === 'stage_2_plan' ||
          detail.nextStep === 'stage_2_report'
        }
      >
        <strong>{copy('stepStage2')}</strong> {stage2State(detail)}
      </li>
      <li data-current={detail.nextStep === 'findings_follow_up'}>
        <strong>{copy('stepFindings')}</strong> {findingsState(detail)}
      </li>
    </ol>
  );

  /**
   * Once Stage 2 is reported: the nonconformities that still hold the
   * recommendation, by the server's rule, or completed.
   */
  function findingsState(current: CaseDetail): string {
    if (closed) return copy('stepClosed');
    if (!current.stage2Report) return copy('stepWaitingStage2Report');
    const open = current.findings.filter(findingBlocks).length;
    return open > 0
      ? formatMessage(copy('stepFindingsOpen'), { count: open })
      : copy('stepFindingsDone');
  }

  /** The latest Stage 1 report's conclusion, its plan, or what it waits for. */
  function stage1State(current: CaseDetail): string {
    if (closed) return copy('stepClosed');
    const { stage1Plan: plan, stage1Report: report } = current;
    if (report)
      return formatMessage(
        copy(
          report.value.conclusion === 'ready'
            ? 'stepStageReady'
            : 'stepStageNotReady',
        ),
        { version: report.version },
      );
    if (plan)
      return formatMessage(copy('stepPlanned'), { version: plan.version });
    return approvedTeam(current)
      ? copy('stepToRecord')
      : copy('stepWaitingTeamApproval');
  }

  /** The latest Stage 2 report, its plan, or what it waits for. */
  function stage2State(current: CaseDetail): string {
    if (closed) return copy('stepClosed');
    const { stage2Plan: plan, stage2Report: report } = current;
    if (report)
      return formatMessage(copy('stepReported'), { version: report.version });
    if (plan)
      return formatMessage(copy('stepPlanned'), { version: plan.version });
    return current.stage1Report?.value.conclusion === 'ready'
      ? copy('stepToRecord')
      : copy('stepWaitingStage1Ready');
  }

  /** The decision on the latest team version, or what it waits for. */
  function teamDecisionState(current: CaseDetail): string {
    if (closed) return copy('stepClosed');
    const { team: proposed, teamDecision: decided } = current;
    if (!proposed) return copy('stepWaitingTeam');
    const version = { version: proposed.version };
    if (decided?.value.teamVersion !== proposed.version)
      return formatMessage(copy('stepToDecide'), version);
    return formatMessage(
      copy(
        decided.value.decision === 'approved' ? 'stepApproved' : 'stepReturned',
      ),
      version,
    );
  }
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
    case 'team':
      return <>{copy('nextTeam')}</>;
    case 'team_decision':
      return <>{copy('nextTeamDecision')}</>;
    case 'stage_1_plan':
      return <>{copy('nextStage1Plan')}</>;
    case 'stage_1_report':
      return <>{copy('nextStage1Report')}</>;
    case 'stage_2_plan':
      return <>{copy('nextStage2Plan')}</>;
    case 'stage_2_report':
      return <>{copy('nextStage2Report')}</>;
    case 'findings_follow_up':
      return <>{copy('nextFindingsFollowUp')}</>;
    case 'recommendation':
      return <>{copy('nextRecommendation')}</>;
    case null:
      return <>{copy('nextNone')}</>;
  }
  return unexpected(step);
}

/**
 * Every recorded version in Case order, each with its exact values: the step
 * versions of the timeline and the Finding records of the Case read, one
 * line per command. Agreements, Stage records and Findings name their PDFs
 * from the Case's register; a team names the Workspace members known in the
 * Case.
 */
export function TimelineView({
  timeline,
  findings,
  register,
  people,
}: {
  timeline: CaseTimeline;
  findings: readonly Finding[];
  register: DocumentRegister;
  people: KnownPeople;
}) {
  const copy = useCertificationCopy();
  const lines = [
    ...timeline.entries.map((entry) => ({
      key: entry.id,
      caseRevision: entry.caseRevision,
      line: <TimelineEntry entry={entry} register={register} people={people} />,
    })),
    ...findingTimelineEntries(findings).map((entry) => ({
      key: entry.key,
      caseRevision: entry.caseRevision,
      line: <FindingTimelineItem entry={entry} register={register} />,
    })),
  ].sort((left, right) => left.caseRevision - right.caseRevision);
  if (lines.length === 0) return <p>{copy('timelineEmpty')}</p>;
  return (
    <ol className="certification-timeline">
      {lines.map(({ key, line }) => (
        <li key={key}>{line}</li>
      ))}
    </ol>
  );
}

function TimelineEntry({
  entry,
  register,
  people,
}: {
  entry: StepVersion;
  register: DocumentRegister;
  people: KnownPeople;
}) {
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
    case 'agreement':
      return values(
        formatMessage(copy('timelineAgreement'), { version: entry.version }),
        <AgreementView agreement={entry.value} register={register} />,
      );
    case 'team':
      return values(
        formatMessage(copy('timelineTeam'), { version: entry.version }),
        <TeamView team={entry.value} people={people} />,
      );
    case 'team_decision':
      return values(
        formatMessage(copy('timelineTeamDecision'), {
          decision: copy(decisionLabel(entry.value.decision)),
          version: entry.value.teamVersion,
        }),
        <DecisionView decision={entry.value} />,
      );
    case 'stage_1_plan':
      return values(
        formatMessage(copy('timelineStage1Plan'), { version: entry.version }),
        <StagePlanView plan={entry.value} register={register} />,
      );
    case 'stage_1_report':
      return values(
        formatMessage(copy('timelineStage1Report'), {
          conclusion: copy(conclusionLabel(entry.value.conclusion)),
          version: entry.version,
        }),
        <Stage1ReportView report={entry.value} register={register} />,
      );
    case 'stage_2_plan':
      return values(
        formatMessage(copy('timelineStage2Plan'), { version: entry.version }),
        <StagePlanView plan={entry.value} register={register} />,
      );
    case 'stage_2_report':
      return values(
        formatMessage(copy('timelineStage2Report'), {
          version: entry.version,
        }),
        <Stage2ReportView report={entry.value} register={register} />,
      );
  }
  return unexpected(entry);
}

function unexpected(value: never): never {
  throw new Error(`Unexpected Certification step: ${String(value)}`);
}
