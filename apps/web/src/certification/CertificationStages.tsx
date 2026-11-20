import {
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { ActorContext } from '../access-types';
import { dossierAnalysisAuthority } from '../dossier-analysis/analysis-access';
import type { certificationAuthority } from './certification-access';
import { VersionAttribution } from './CertificationAttribution';
import { CertificationDraftPreparation } from './CertificationDraftPreparation';
import { StepSendings } from './CertificationExchanges';
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
import {
  IDLE,
  blockedUntilReload,
  clearReloadedFeedback,
  describedFeedbackId,
  refusedWith,
  reuse,
  type Feedback,
  type Intent,
} from './certification-command';
import { isNonconformity } from './certification-findings';
import type { CaseDetail, DocumentRegister } from './certification-response';
import {
  approvedTeam,
  leadsTeam,
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
import type {
  CertificationMessageKey,
  useCertificationCopy,
} from './certification.copy';
import type { StageDraftStep } from './draft-preparation-response';

const STAGE_KINDS = [
  'stage1Plan',
  'stage2Plan',
  'stage1Report',
  'stage2Report',
] as const;
export type StageMutationKind = (typeof STAGE_KINDS)[number];

type StageCase = { caseDetail: CaseDetail; register: DocumentRegister };
interface StageContext {
  view: StageCase | undefined;
  actor: ActorContext;
  authority: Pick<
    ReturnType<typeof certificationAuthority>,
    'manage' | 'audit'
  >;
  projectId: string;
  scope: string;
  prefix: string;
  copy: ReturnType<typeof useCertificationCopy>;
  readPreparation: ComponentProps<typeof CertificationDraftPreparation>['read'];
  commit: (command: {
    kind: StageMutationKind;
    intent: Intent;
    setFeedback: (next: Feedback) => void;
    confirmed: () => void;
  }) => Promise<void>;
  renderFeedback: (presentation: {
    kind: StageMutationKind;
    feedback: Feedback;
    id: string;
    retry: () => void;
  }) => ReactNode;
}

/** Keeps the four Stage records' editing state alive while the Case reloads. */
export function useCertificationStages({
  view,
  actor,
  authority,
  projectId,
  scope,
  prefix,
  copy,
  readPreparation,
  commit,
  renderFeedback,
}: StageContext) {
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
  const stageFeedback: Record<StageMutationKind, Feedback> = {
    stage1Plan: stage1PlanFeedback,
    stage2Plan: stage2PlanFeedback,
    stage1Report: stage1ReportFeedback,
    stage2Report: stage2ReportFeedback,
  };
  const feedbackSetters = {
    stage1Plan: setStage1PlanFeedback,
    stage2Plan: setStage2PlanFeedback,
    stage1Report: setStage1ReportFeedback,
    stage2Report: setStage2ReportFeedback,
  };
  const feedbackIds = {
    stage1Plan: `${prefix}-stage-1-plan-feedback`,
    stage2Plan: `${prefix}-stage-2-plan-feedback`,
    stage1Report: `${prefix}-stage-1-report-feedback`,
    stage2Report: `${prefix}-stage-2-report-feedback`,
  } satisfies Record<StageMutationKind, string>;

  function reset() {
    for (const kind of STAGE_KINDS) {
      resetStageDraft(kind);
      feedbackSetters[kind](IDLE);
    }
  }

  function clearRefusals() {
    for (const kind of STAGE_KINDS)
      feedbackSetters[kind](clearReloadedFeedback);
  }

  function execute(kind: StageMutationKind, intent: Intent) {
    return commit({
      kind,
      intent,
      setFeedback: feedbackSetters[kind],
      confirmed: () => resetStageDraft(kind),
    });
  }

  function feedbackMessage(kind: StageMutationKind, feedback: Feedback) {
    return renderFeedback({
      kind,
      feedback,
      id: feedbackIds[kind],
      retry: () => {
        if (feedback.status === 'uncertain')
          void execute(kind, feedback.intent);
      },
    });
  }

  /** Closes a Stage form: its draft is dropped, a first record starts empty. */
  function resetStageDraft(kind: StageMutationKind) {
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

  /** The draft of a Stage plan, null until edited or opened. */
  function planDraftOf(stage: AuditStage): StagePlanDraft | null {
    return stage === 'stage_1' ? stage1PlanDraft : stage2PlanDraft;
  }

  function setPlanDraft(stage: AuditStage, draft: StagePlanDraft) {
    if (stage === 'stage_1') setStage1PlanDraft(draft);
    else setStage2PlanDraft(draft);
  }

  /** The programme manager plans a Stage; the server rechecks every rule. */
  function submitStagePlan(stage: AuditStage, event: FormEvent, busy: boolean) {
    event.preventDefault();
    const kind = planKind(stage);
    const feedback = stageFeedback[kind];
    if (busy || !authority.manage || !view || blockedUntilReload(feedback))
      return;
    const { caseDetail: current, register } = view;
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
      feedbackSetters[kind](refusedWith(planMessage(check)));
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
  function submitStageReport(
    stage: AuditStage,
    event: FormEvent,
    busy: boolean,
  ) {
    event.preventDefault();
    const kind = reportKind(stage);
    const feedback = stageFeedback[kind];
    if (busy || !authority.audit || !view || blockedUntilReload(feedback))
      return;
    const { caseDetail: current, register } = view;
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
      feedbackSetters[kind](refusedWith(reportMessage(check, stage)));
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

  /** One Stage: its latest plan and report, their forms or why they wait. */
  function stageSection(
    view: StageCase,
    stage: AuditStage,
    busy: boolean,
    renderFindings: (stage: AuditStage) => ReactNode,
  ) {
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
        {stagePlanStep(view, stage, busy)}
        <h6>{copy('stageReportTitle')}</h6>
        {stageReportView(view, stage)}
        {feedbackMessage(reportKind(stage), stageFeedback[reportKind(stage)])}
        {stageReportStep(view, stage, busy)}
        {plan && renderFindings(stage)}
      </section>
    );
  }

  function stageReportView(view: StageCase, stage: AuditStage) {
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

  function stagePreparation(
    current: CaseDetail,
    step: StageDraftStep,
    draft: string,
    onApply: (input: { value: string; expected: string }) => void,
    disabled: boolean,
  ) {
    if (!dossierAnalysisAuthority(actor)) return null;
    const ownerScope = JSON.stringify([
      scope,
      actor,
      current.id,
      current.revision,
      step,
    ]);
    return (
      <CertificationDraftPreparation
        key={ownerScope}
        kind="stage"
        step={step}
        scope={ownerScope}
        caseId={current.id}
        projectId={projectId}
        revision={current.revision}
        draft={draft}
        disabled={disabled}
        read={readPreparation}
        onApply={onApply}
      />
    );
  }

  /**
   * The plan form for a programme manager, the entry to a new version, or
   * the plain reason the Stage cannot be planned yet.
   */
  function stagePlanStep(view: StageCase, stage: AuditStage, busy: boolean) {
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
            feedbackSetters[kind](IDLE);
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
      <>
        {stagePreparation(
          current,
          `${stage}_plan`,
          (draft ?? stagePlanDraftFor(null)).scope,
          ({ value, expected }) => {
            const setter =
              stage === 'stage_1' ? setStage1PlanDraft : setStage2PlanDraft;
            setter((held) => {
              const actual = held ?? stagePlanDraftFor(null);
              return actual.scope === expected
                ? { ...actual, scope: value }
                : held;
            });
          },
          busy || blockedUntilReload(feedback),
        )}
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
          feedbackId={describedFeedbackId(feedback, feedbackIds[kind])}
          onChange={(next) => {
            setPlanDraft(stage, next);
            if (
              feedback.status === 'saved' ||
              (feedback.status === 'refused' && !feedback.reload)
            )
              feedbackSetters[kind](IDLE);
          }}
          onSubmit={(event) => submitStagePlan(stage, event, busy)}
          onCancel={
            recorded
              ? () => {
                  resetStageDraft(kind);
                  feedbackSetters[kind](IDLE);
                }
              : undefined
          }
        />
      </>
    );
  }

  /**
   * The report form for the leader of the approved team holding the auditor
   * role, the entry to a new version, or the plain reason it is not offered.
   */
  function stageReportStep(view: StageCase, stage: AuditStage, busy: boolean) {
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
            feedbackSetters[kind](IDLE);
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
      feedbackId: describedFeedbackId(feedback, feedbackIds[kind]),
      reports,
      participantLists: slotAttachments(view.register.items, 'participantList'),
      documents: view.register.items,
      onSubmit: (event: FormEvent) => submitStageReport(stage, event, busy),
      onCancel: reported
        ? () => {
            resetStageDraft(kind);
            feedbackSetters[kind](IDLE);
          }
        : undefined,
    };
    const edited = () => {
      if (
        feedback.status === 'saved' ||
        (feedback.status === 'refused' && !feedback.reload)
      )
        feedbackSetters[kind](IDLE);
    };
    return (
      <>
        {stagePreparation(
          current,
          `${stage}_report`,
          stage === 'stage_1'
            ? ''
            : (stage2ReportDraft ?? stage2ReportDraftFor(null)).summary,
          ({ value, expected }) => {
            if (stage === 'stage_2')
              setStage2ReportDraft((held) => {
                const actual = held ?? stage2ReportDraftFor(null);
                return actual.summary === expected
                  ? { ...actual, summary: value }
                  : held;
              });
          },
          busy || blockedUntilReload(feedback),
        )}
        {stage === 'stage_1' ? (
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
        )}
      </>
    );
  }

  function render(
    busy: boolean,
    renderFindings: (stage: AuditStage) => ReactNode,
  ) {
    if (!view) return null;
    const { caseDetail } = view;
    return (
      <>
        {(caseDetail.stage1Plan !== null ||
          approvedTeam(caseDetail) !== undefined) &&
          stageSection(view, 'stage_1', busy, renderFindings)}
        {caseDetail.stage1Plan !== null &&
          stageSection(view, 'stage_2', busy, renderFindings)}
      </>
    );
  }

  return {
    saving: Object.values(stageFeedback).some(
      (feedback) => feedback.status === 'saving',
    ),
    saved: Object.values(stageFeedback).some(
      (feedback) => feedback.status === 'saved',
    ),
    reset,
    clearRefusals,
    render,
  };
}

function planKind(stage: AuditStage): StageMutationKind {
  return stage === 'stage_1' ? 'stage1Plan' : 'stage2Plan';
}

function reportKind(stage: AuditStage): StageMutationKind {
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

function unexpected(value: never): never {
  throw new Error(`Unexpected Certification state: ${String(value)}`);
}
