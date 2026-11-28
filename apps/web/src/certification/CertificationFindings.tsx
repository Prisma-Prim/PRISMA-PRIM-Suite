import { unexpected } from './certification-command';
import { findingRoles, type FindingRoles } from './certification-audit-roles';
import { useState, type FormEvent, type ReactNode } from 'react';
import { formatMessage } from '../localization/messages';
import { type CertificationMessageKey } from './certification.copy';
import {
  findingCommands,
  type ClassificationRefusal,
  type Finding,
  type FindingCommand,
} from './certification-findings';
import {
  classificationFromDraft,
  correctionDraftFor,
  correctionFromDraft,
  emptyClassificationDraft,
  emptyFindingDraft,
  emptyPlanJudgmentDraft,
  emptyResponseDraft,
  emptyVerificationDraft,
  findingFromDraft,
  judgmentFromDraft,
  responseFromDraft,
  verificationFromDraft,
  type ClassificationDraft,
  type FindingCorrectionDraft,
  type FindingDraft,
  type PlanJudgmentDraft,
  type ResponseDraft,
  type VerificationDraft,
} from './certification-findings-draft';
import { approvedTeam, type AuditStage } from './certification-stages';
import { type RegisterDownload } from './CertificationDocumentViews';
import {
  ClassificationForm,
  FindingCorrectionForm,
  FindingRecordForm,
  PlanJudgmentForm,
  ResponseForm,
  VerificationForm,
} from './CertificationFindingForms';
import {
  FindingFacts,
  FindingHistory,
  FindingHold,
  useFindingHeading,
} from './CertificationFindingViews';

import {
  IDLE,
  retryUncertainCommand,
  reuse,
  blockedUntilReload,
  clearReloadedFeedback,
  describedFeedbackId,
  refusedWith,
  type Intent,
  type Feedback,
} from './certification-command';

import type {
  CertificationCaseView as CaseView,
  CertificationWorkflowContext,
} from './certification-command';

/**
 * The one Finding form open in the Case, with its draft: a new Finding of a
 * Stage, or a later version of one Finding.
 */
type FindingForm =
  | { command: 'record'; stage: AuditStage; draft: FindingDraft }
  | { command: 'correction'; findingId: string; draft: FindingCorrectionDraft }
  | {
      command: 'classification' | 'reclassification';
      findingId: string;
      draft: ClassificationDraft;
    }
  | { command: 'response'; findingId: string; draft: ResponseDraft }
  | { command: 'planJudgment'; findingId: string; draft: PlanJudgmentDraft }
  | { command: 'verification'; findingId: string; draft: VerificationDraft };
/** The serialized Finding command, or why the draft is refused. */
type FindingSubmission =
  | { status: 'ready'; path: string; body: string }
  | { status: 'refused'; message: CertificationMessageKey }
  /** The actor no longer holds the role: nothing is offered or sent. */
  | { status: 'unavailable' };
interface FindingsContext extends CertificationWorkflowContext<'finding'> {
  registerDownload: (view: CaseView) => RegisterDownload | undefined;
}

export type FindingPresentation = {
  history: (finding: Finding, register: CaseView['register']) => ReactNode;
  empty: (message: string) => ReactNode;
  form: (props: {
    title: string;
    busy: boolean;
    reloadRequired: boolean;
    onClose: () => void;
    children: ReactNode;
  }) => ReactNode;
};

/** Owns the one open Finding form, its command and the two Stage Findings panels. */
export function useCertificationFindings({
  view,
  actor,
  authority,
  prefix,
  copy,
  commit,
  renderFeedback,
  registerDownload,
}: FindingsContext) {
  /** Null while no Finding form is open; kept through a reload. */
  const [findingForm, setFindingForm] = useState<FindingForm | null>(null);
  const [findingFeedback, setFindingFeedback] = useState<Feedback>(IDLE);
  const findingHeading = useFindingHeading();
  const feedbackId = `${prefix}-finding-feedback`;
  function execute(intent: Intent) {
    return commit({
      kind: 'finding',
      intent,
      setFeedback: setFindingFeedback,
      confirmed: () => setFindingForm(null),
    });
  }
  function feedbackMessage() {
    return renderFeedback({
      kind: 'finding',
      feedback: findingFeedback,
      id: feedbackId,
      retry: () => retryUncertainCommand(findingFeedback, execute),
    });
  }
  function render(
    stage: AuditStage,
    busy: boolean,
    presentation?: FindingPresentation,
  ) {
    if (!view) return null;
    const caseView = view;
    /** Records the open Finding form; the server rechecks every rule. */
    function submitFinding(event: FormEvent) {
      event.preventDefault();
      if (busy || !findingForm || blockedUntilReload(findingFeedback)) return;
      const view = caseView;
      const submission = findingSubmission(
        findingForm,
        view,
        findingRoles(view, actor.workspaceMembershipId, authority),
      );
      switch (submission.status) {
        case 'unavailable':
          return;
        case 'refused':
          setFindingFeedback(refusedWith(submission.message));
          return;
        case 'ready':
          void execute(
            reuse(findingFeedback, {
              path: submission.path,
              body: submission.body,
              caseId: view.caseDetail.id,
            }),
          );
          return;
      }
      unexpected(submission);
    }

    function openFindingForm(finding: Finding, command: FindingCommand) {
      const findingId = finding.id;
      switch (command) {
        case 'correction':
          setFindingForm({
            command,
            findingId,
            draft: correctionDraftFor(finding.statement),
          });
          break;
        case 'classification':
        case 'reclassification':
          setFindingForm({
            command,
            findingId,
            draft: emptyClassificationDraft(),
          });
          break;
        case 'response':
          setFindingForm({ command, findingId, draft: emptyResponseDraft() });
          break;
        case 'planJudgment':
          setFindingForm({
            command,
            findingId,
            draft: emptyPlanJudgmentDraft(),
          });
          break;
        case 'verification':
          setFindingForm({
            command,
            findingId,
            draft: emptyVerificationDraft(),
          });
          break;
        default:
          unexpected(command);
      }
      setFindingFeedback(IDLE);
    }

    /** Keeps an edited Finding draft; an edit clears a refusal it may answer. */
    function editFindingForm(next: FindingForm) {
      setFindingForm(next);
      if (
        findingFeedback.status === 'saved' ||
        (findingFeedback.status === 'refused' && !findingFeedback.reload)
      )
        setFindingFeedback(IDLE);
    }

    function closeFindingForm() {
      setFindingForm(null);
      setFindingFeedback(IDLE);
    }

    /**
     * The Findings of a planned Stage in sequence order, each with its exact
     * evidence, the server's dates and its history, the commands this actor
     * may record, and the entry to a new Finding or why it is not offered.
     */
    function findingsSection(view: CaseView, stage: AuditStage) {
      const titleId = `${prefix}-${stage}-findings-title`;
      const findings = view.caseDetail.findings.filter(
        (entry) => entry.stage === stage,
      );
      const roles = findingRoles(view, actor.workspaceMembershipId, authority);
      const active = activeFindingForm(view, roles);
      return (
        <section
          aria-labelledby={titleId}
          className={presentation ? 'clarte-case-findings' : undefined}
        >
          <h6 id={titleId}>
            {copy(
              stage === 'stage_1'
                ? 'stage1FindingsTitle'
                : 'stage2FindingsTitle',
            )}
          </h6>
          <p>{copy('findingsHelp')}</p>
          {findings.length === 0 ? (
            (presentation?.empty(copy('findingsEmpty')) ?? (
              <p>{copy('findingsEmpty')}</p>
            ))
          ) : (
            <ol className="certification-findings">
              {findings.map((finding) =>
                findingItem(view, finding, roles, active),
              )}
            </ol>
          )}
          {view.caseDetail.status === 'open' &&
            authority.approve &&
            !roles.independentApprover &&
            findings.length > 0 && (
              <p className="certification-blocked">
                {copy('findingIndependence')}
              </p>
            )}
          {recordFindingStep(view, stage, roles, active)}
        </section>
      );
    }

    /**
     * The open Finding form while the read Case still lets this actor record
     * it; otherwise none is open and its draft no longer holds the panel.
     */
    function activeFindingForm(
      view: CaseView,
      roles: FindingRoles,
    ): FindingForm | null {
      if (!findingForm) return null;
      switch (findingForm.command) {
        case 'record':
          return roles.leader &&
            (findingForm.stage === 'stage_2' ||
              view.caseDetail.stage2Plan === null)
            ? findingForm
            : null;
        case 'reclassification':
          return roles.independentApprover ? findingForm : null;
        case 'correction':
        case 'classification':
        case 'response':
        case 'planJudgment':
        case 'verification':
          return roles.leader ? findingForm : null;
      }
      return unexpected(findingForm);
    }

    function findingItem(
      view: CaseView,
      finding: Finding,
      roles: FindingRoles,
      active: FindingForm | null,
    ) {
      const headingId = `${prefix}-finding-${finding.id}`;
      const open =
        active !== null &&
        active.command !== 'record' &&
        active.findingId === finding.id
          ? active
          : null;
      const commands = findingCommands(finding, roles);
      return (
        <li key={finding.id} aria-labelledby={headingId}>
          <strong id={headingId}>{findingHeading(finding)}</strong>
          <FindingFacts
            finding={finding}
            register={view.register}
            download={registerDownload(view)}
          />
          <FindingHold finding={finding} />
          {presentation?.history(finding, view.register) ?? (
            <FindingHistory finding={finding} register={view.register} />
          )}
          {open &&
            presentForm(
              findingCommandTitle(open.command, finding),
              findingFormFor(view, finding, open),
            )}
          {(!open || presentation) && commands.length > 0 && (
            <div className="certification-actions">
              {commands.map((command) => (
                <button
                  key={command}
                  type="button"
                  disabled={
                    busy || (active !== null && open?.command !== command)
                  }
                  onClick={() => openFindingForm(finding, command)}
                >
                  {findingCommandTitle(command, finding)}
                </button>
              ))}
            </div>
          )}
        </li>
      );
    }

    function presentForm(title: string, form: ReactNode) {
      const children = (
        <>
          {feedbackMessage()}
          {form}
        </>
      );
      return (
        presentation?.form({
          title,
          busy,
          reloadRequired: blockedUntilReload(findingFeedback),
          onClose: closeFindingForm,
          children,
        }) ?? children
      );
    }

    function findingCommandTitle(command: FindingCommand, finding: Finding) {
      return formatMessage(copy(findingCommandLabel(command)), {
        sequence: finding.sequence,
      });
    }

    /** The open form of a later version of one Finding. */
    function findingFormFor(
      view: CaseView,
      finding: Finding,
      open: Exclude<FindingForm, { command: 'record' }>,
    ) {
      const shared = {
        idPrefix: `${prefix}-finding-${finding.id}-${open.command}`,
        title: findingCommandTitle(open.command, finding),
        disabled: busy,
        submitting: findingFeedback.status === 'saving',
        submitBlocked: blockedUntilReload(findingFeedback),
        feedbackId: describedFeedbackId(findingFeedback, feedbackId),
        onSubmit: submitFinding,
        onCancel: closeFindingForm,
      };
      const register = view.register.items;
      switch (open.command) {
        case 'correction':
          return (
            <FindingCorrectionForm
              {...shared}
              draft={open.draft}
              register={register}
              onChange={(draft) => editFindingForm({ ...open, draft })}
            />
          );
        case 'classification':
        case 'reclassification':
          return (
            <ClassificationForm
              {...shared}
              draft={open.draft}
              stage={finding.stage}
              by={
                open.command === 'reclassification' ? 'approver' : 'team_leader'
              }
              onChange={(draft) => editFindingForm({ ...open, draft })}
            />
          );
        case 'response':
          return (
            <ResponseForm
              {...shared}
              draft={open.draft}
              register={register}
              onChange={(draft) => editFindingForm({ ...open, draft })}
            />
          );
        case 'planJudgment':
          return (
            <PlanJudgmentForm
              {...shared}
              draft={open.draft}
              onChange={(draft) => editFindingForm({ ...open, draft })}
            />
          );
        case 'verification':
          return (
            <VerificationForm
              {...shared}
              draft={open.draft}
              register={register}
              onChange={(draft) => editFindingForm({ ...open, draft })}
            />
          );
      }
      return unexpected(open);
    }

    /**
     * The new-Finding form for the leader of the approved team holding the
     * auditor role, or the plain reason it is not offered.
     */
    function recordFindingStep(
      view: CaseView,
      stage: AuditStage,
      roles: FindingRoles,
      active: FindingForm | null,
    ) {
      const current = view.caseDetail;
      if (current.status !== 'open' || !authority.audit) return null;
      if (!approvedTeam(current))
        return (
          <p className="certification-blocked">
            {copy('blockedFindingTeamNotApproved')}
          </p>
        );
      // The server refuses a Finding by anyone but the approved team's leader.
      if (!roles.leader)
        return (
          <p className="certification-blocked">
            {copy('blockedFindingNotTeamLeader')}
          </p>
        );
      if (stage === 'stage_1' && current.stage2Plan)
        return (
          <p className="certification-note">
            {copy('blockedFindingStageClosed')}
          </p>
        );
      const title = copy(
        stage === 'stage_1' ? 'recordStage1Finding' : 'recordStage2Finding',
      );
      const open =
        active?.command === 'record' && active.stage === stage ? active : null;
      return (
        <>
          {(!open || presentation) && (
            <button
              type="button"
              disabled={busy || (active !== null && open === null)}
              onClick={() => {
                setFindingForm({
                  command: 'record',
                  stage,
                  draft: emptyFindingDraft(),
                });
                setFindingFeedback(IDLE);
              }}
            >
              {title}
            </button>
          )}
          {open &&
            presentForm(
              title,
              <FindingRecordForm
                idPrefix={`${prefix}-${stage}-finding`}
                title={title}
                stage={stage}
                draft={open.draft}
                register={view.register.items}
                disabled={busy}
                submitting={findingFeedback.status === 'saving'}
                submitBlocked={blockedUntilReload(findingFeedback)}
                feedbackId={describedFeedbackId(findingFeedback, feedbackId)}
                onChange={(draft) => editFindingForm({ ...open, draft })}
                onSubmit={submitFinding}
                onCancel={closeFindingForm}
              />,
            )}
        </>
      );
    }
    return findingsSection(view, stage);
  }
  return {
    render,
    reset: () => {
      setFindingForm(null);
      setFindingFeedback(IDLE);
    },
    clearRefusals: () => setFindingFeedback(clearReloadedFeedback),
    saving: findingFeedback.status === 'saving',
    saved: findingFeedback.status === 'saved',
  };
}

/**
 * The Finding command an open form records, mirroring the server's checks
 * on the read Case; the server rechecks every rule and the actor's role.
 */
function findingSubmission(
  form: FindingForm,
  view: CaseView,
  roles: FindingRoles,
): FindingSubmission {
  const { caseDetail: current, register } = view;
  const findingsPath = `/certification-cases/${encodeURIComponent(current.id)}/findings`;
  const expectedRevision = current.revision;
  const ready = (path: string, body: object): FindingSubmission => ({
    status: 'ready',
    path,
    body: JSON.stringify({ expectedRevision, ...body }),
  });
  const refused = (message: CertificationMessageKey): FindingSubmission => ({
    status: 'refused',
    message,
  });
  if (form.command === 'record') {
    if (!roles.leader) return { status: 'unavailable' };
    const check = findingFromDraft(form.draft, {
      stage: form.stage,
      register: register.items,
    });
    if (check.status !== 'valid')
      return refused(findingCheckMessage(check.status, 'findingValidation'));
    return ready(findingsPath, {
      stage: form.stage,
      classification: check.classification,
      ...check.statement,
    });
  }
  const finding = current.findings.find((entry) => entry.id === form.findingId);
  const role =
    form.command === 'reclassification'
      ? roles.independentApprover
      : roles.leader;
  if (!finding || !role) return { status: 'unavailable' };
  const path = (update: string) =>
    `${findingsPath}/${encodeURIComponent(finding.id)}/${update}`;
  switch (form.command) {
    case 'correction': {
      const check = correctionFromDraft(form.draft, {
        finding,
        register: register.items,
      });
      if (check.status === 'reasonRequired') return refused('reasonRequired');
      if (check.status !== 'valid')
        return refused(
          findingCheckMessage(check.status, 'findingStatementValidation'),
        );
      return ready(path('correction'), {
        reason: check.reason,
        ...check.statement,
      });
    }
    case 'classification':
    case 'reclassification': {
      const check = classificationFromDraft(form.draft, finding);
      if (check.status === 'unchanged')
        return refused('classificationUnchanged');
      if (check.status !== 'valid')
        return refused(
          findingCheckMessage(check.status, 'classificationValidation'),
        );
      return ready(path(form.command), {
        reason: check.reason,
        classification: check.classification,
      });
    }
    case 'response': {
      const check = responseFromDraft(form.draft, register.items);
      return check.status === 'valid'
        ? ready(path('response'), check.value)
        : refused('responseValidation');
    }
    case 'planJudgment': {
      const check = judgmentFromDraft(form.draft);
      return check.status === 'valid'
        ? ready(path('plan-judgment'), check.value)
        : refused('judgmentValidation');
    }
    case 'verification': {
      const check = verificationFromDraft(form.draft, register.items);
      return check.status === 'valid'
        ? ready(path('verification'), check.value)
        : refused('verificationValidation');
    }
  }
  return unexpected(form);
}

/** A Finding draft's refusal: incomplete, or one of the classification rules. */
function findingCheckMessage(
  status: 'incomplete' | ClassificationRefusal,
  incomplete: CertificationMessageKey,
): CertificationMessageKey {
  switch (status) {
    case 'incomplete':
      return incomplete;
    case 'clauseRequired':
      return 'findingClauseRequired';
    case 'classificationStage':
      return 'findingClassificationStage';
    case 'evidenceRequired':
      return 'findingEvidenceRequired';
  }
  return unexpected(status);
}

/** The button and form title of each later Finding version. */
function findingCommandLabel(command: FindingCommand): CertificationMessageKey {
  switch (command) {
    case 'response':
      return 'recordResponse';
    case 'planJudgment':
      return 'judgePlan';
    case 'verification':
      return 'verifyFinding';
    case 'correction':
      return 'correctFinding';
    case 'classification':
      return 'changeClassification';
    case 'reclassification':
      return 'reclassifyFinding';
  }
  return unexpected(command);
}
