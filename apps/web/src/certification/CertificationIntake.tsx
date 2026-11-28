import { unexpected } from './certification-command';
import { useState, type FormEvent } from 'react';
import { conflictCode, type ApiResult } from '../api/authenticated-api-client';
import {
  useScopedOperation,
  type ScopedOperation,
} from '../api/use-scoped-operation';
import {
  agreementAttachments,
  agreementDraftFor,
  agreementFromDraft,
  type AgreementCheck,
  type AgreementDraft,
} from './certification-documents-draft';
import { type CertificationMessageKey } from './certification.copy';
import { latestBusinessDate } from './certification-attribution';
import {
  correctionReason,
  draftFromFacts,
  emptyApplicationDraft,
  emptyReviewDraft,
  factsFromDraft,
  reviewFromDraft,
} from './certification-draft';
import {
  proposedConfirmation,
  type DurationResult,
} from './certification-duration';
import {
  confirmationFromDraft,
  durationDraftFor,
  durationInputsFromDraft,
  type ConfirmationCheck,
  type DurationDraft,
} from './certification-duration-draft';
import {
  parseDurationResult,
  type CaseDetail,
  type DocumentRegister,
} from './certification-response';
import { AgreementForm } from './CertificationDocumentForms';
import { AgreementView } from './CertificationDocumentViews';
import { DurationForm } from './CertificationDurationForm';
import { DurationView } from './CertificationDurationViews';
import { ApplicationForm, ReviewForm } from './CertificationForms';
import { dossierAnalysisAuthority } from '../dossier-analysis/analysis-access';
import { CertificationDraftPreparation } from './CertificationDraftPreparation';
import { unchangedDraft } from './draft-preparation-response';
import { VersionAttribution } from './CertificationAttribution';
import { FactsView, ReviewView } from './CertificationViews';

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
  CertificationWorkflowContext,
  CertificationQuery,
} from './certification-command';
const INTAKE_KINDS = [
  'application',
  'review',
  'duration',
  'agreement',
] as const;
export type IntakeKind = (typeof INTAKE_KINDS)[number];
/** The intake sections one render shows. */
export type IntakeSection =
  'preparation' | 'application' | 'review' | 'duration' | 'agreement';
/**
 * The duration-proposal read, keyed by the serialized inputs it computed so a
 * later edit of the inputs makes it outdated instead of confirmable.
 */
type Proposal =
  | { status: 'idle' }
  | { status: 'computing'; inputs: string }
  | { status: 'ready'; inputs: string; result: DurationResult }
  | { status: 'refused'; message: CertificationMessageKey };

const NO_PROPOSAL: Proposal = { status: 'idle' };
interface IntakeContext extends CertificationWorkflowContext<IntakeKind> {
  projectId: string;
  scope: string;
  query: CertificationQuery;
}
/** Owns the application, its review, duration and agreement for the selected Case. */
export function useCertificationIntake({
  view,
  actor,
  authority,
  copy,
  prefix,
  projectId,
  scope,
  query,
  commit,
  renderFeedback,
}: IntakeContext) {
  const proposalOperation = useScopedOperation(scope);
  const [applicationDraft, setApplicationDraft] = useState(
    emptyApplicationDraft,
  );
  /** The user is editing the application (a first draft or a correction). */
  const [applicationOpen, setApplicationOpen] = useState(false);
  const [applicationFeedback, setApplicationFeedback] =
    useState<Feedback>(IDLE);
  const [reviewDraft, setReviewDraft] = useState(emptyReviewDraft);
  const [reviewFeedback, setReviewFeedback] = useState<Feedback>(IDLE);
  /** Null until edited: the panel then derives it from the read Case. */
  const [durationDraft, setDurationDraft] = useState<DurationDraft | null>(
    null,
  );
  /** The user is editing the duration (a first determination or a correction). */
  const [durationOpen, setDurationOpen] = useState(false);
  const [durationFeedback, setDurationFeedback] = useState<Feedback>(IDLE);
  const [proposal, setProposal] = useState<Proposal>(NO_PROPOSAL);
  /** Null until edited: a first agreement starts empty. */
  const [agreementDraft, setAgreementDraft] = useState<AgreementDraft | null>(
    null,
  );
  /** The user is editing the agreement (a first record or a correction). */
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [agreementFeedback, setAgreementFeedback] = useState<Feedback>(IDLE);
  function resetDurationDraft() {
    proposalOperation.retire();
    setDurationDraft(null);
    setDurationOpen(false);
    setProposal(NO_PROPOSAL);
  }

  function resetAgreementDraft() {
    setAgreementDraft(null);
    setAgreementOpen(false);
  }

  const feedbackSetters = {
    application: setApplicationFeedback,
    review: setReviewFeedback,
    duration: setDurationFeedback,
    agreement: setAgreementFeedback,
  };
  const feedbackIds = {
    application: `${prefix}-application-feedback`,
    review: `${prefix}-review-feedback`,
    duration: `${prefix}-duration-feedback`,
    agreement: `${prefix}-agreement-feedback`,
  };
  function resetDraft(kind: IntakeKind) {
    switch (kind) {
      case 'application':
        setApplicationDraft(emptyApplicationDraft());
        setApplicationOpen(false);
        return;
      case 'review':
        setReviewDraft(emptyReviewDraft());
        return;
      case 'duration':
        resetDurationDraft();
        return;
      case 'agreement':
        resetAgreementDraft();
        return;
    }
    return unexpected(kind);
  }
  function execute(kind: IntakeKind, intent: Intent) {
    return commit({
      kind,
      intent,
      setFeedback: feedbackSetters[kind],
      confirmed: () => resetDraft(kind),
    });
  }
  function feedbackMessage(kind: IntakeKind, feedback: Feedback) {
    return renderFeedback({
      kind,
      feedback,
      id: feedbackIds[kind],
      retry: () =>
        retryUncertainCommand(feedback, (intent) => execute(kind, intent)),
    });
  }
  function describedFeedback(kind: IntakeKind, feedback: Feedback) {
    return describedFeedbackId(feedback, feedbackIds[kind]);
  }
  /**
   * The intake sections: `preparation` is the application, its review and,
   * once accepted, the duration; the Clarté Case page asks for one at a time.
   */
  function render(busy: boolean, section: IntakeSection) {
    if (!view) return null;
    const caseView = view;
    function submitAgreement(event: FormEvent) {
      event.preventDefault();
      if (busy || !authority.manage || blockedUntilReload(agreementFeedback))
        return;
      const { caseDetail: current, register } = caseView;
      const check = agreementFromDraft(
        agreementDraft ?? agreementDraftFor(null),
        {
          register: register.items,
          correcting: current.agreement !== null,
          today: latestBusinessDate(),
        },
      );
      if (check.status !== 'valid') {
        setAgreementFeedback(refusedWith(agreementMessage(check)));
        return;
      }
      const body = JSON.stringify({
        expectedRevision: current.revision,
        ...(check.reason === null ? {} : { reason: check.reason }),
        signedOn: check.agreement.signedOn,
        attachmentId: check.agreement.attachmentId,
      });
      void execute(
        'agreement',
        reuse(agreementFeedback, {
          path: `/certification-cases/${encodeURIComponent(current.id)}/agreement`,
          body,
          caseId: current.id,
        }),
      );
    }

    function submitApplication(event: FormEvent) {
      event.preventDefault();
      if (busy || !authority.manage || blockedUntilReload(applicationFeedback))
        return;
      const current = caseView.caseDetail;
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
      if (busy || !authority.manage || blockedUntilReload(reviewFeedback))
        return;
      const { caseDetail: current, register } = caseView;
      const check = reviewFromDraft(reviewDraft, register.items);
      if (check.status !== 'valid') {
        // Mirrors the server: never send an acceptance with a "no" answer.
        setReviewFeedback(
          refusedWith(
            check.status === 'criteriaNotMet'
              ? 'criteriaNotMet'
              : check.status === 'acting'
                ? 'actingValidation'
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
        ...(review.onBehalf === null ? {} : { onBehalf: review.onBehalf }),
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

    /** The duration draft being edited, or the one the read Case starts from. */
    function currentDurationDraft(current: CaseDetail): DurationDraft | null {
      if (durationDraft) return durationDraft;
      const application = current.application;
      return application
        ? durationDraftFor({
            facts: application.value,
            current: current.duration?.value ?? null,
          })
        : null;
    }

    /** A read: the server computes the proposal for the inputs as typed. */
    async function computeProposal(event: FormEvent) {
      event.preventDefault();
      if (busy || !authority.manage) return;
      const current = caseView.caseDetail;
      const draft = currentDurationDraft(current);
      if (!current.application || !draft) return;
      const check = durationInputsFromDraft(draft, current.application.value);
      if (check.status !== 'valid') {
        setProposal({
          status: 'refused',
          message:
            check.status === 'studiesMismatch'
              ? 'haccpStudiesMismatch'
              : 'durationInputsValidation',
        });
        return;
      }
      const signal = proposalOperation.begin();
      if (!signal) return;
      const body = JSON.stringify(check.inputs);
      setProposal({ status: 'computing', inputs: body });
      try {
        const result = await query(
          proposalOperation,
          signal,
          `/certification-cases/${encodeURIComponent(current.id)}/duration-proposal`,
          { body },
        );
        if (signal.aborted) return;
        if (result.status !== 'ok') {
          setProposal({ status: 'refused', message: proposalRefusal(result) });
          return;
        }
        const computed = parseDurationResult(result.value);
        setProposal({ status: 'ready', inputs: body, result: computed });
        setDurationOpen(true);
        // A new proposal restarts the confirmation from its rounded values.
        setDurationDraft(
          computed.kind === 'proposal'
            ? { ...draft, confirmed: proposedConfirmation(computed.proposal) }
            : draft,
        );
      } catch {
        if (!signal.aborted)
          setProposal({ status: 'refused', message: 'proposalUnavailable' });
      }
    }

    function submitDuration(event: FormEvent) {
      event.preventDefault();
      if (busy || !authority.manage || blockedUntilReload(durationFeedback))
        return;
      const current = caseView.caseDetail;
      const draft = currentDurationDraft(current);
      if (!current.application || !draft) return;
      const check = durationInputsFromDraft(draft, current.application.value);
      if (
        check.status !== 'valid' ||
        proposal.status !== 'ready' ||
        proposal.inputs !== JSON.stringify(check.inputs) ||
        proposal.result.kind === 'refused'
      ) {
        setDurationFeedback(refusedWith('proposalOutdated'));
        return;
      }
      const correcting = current.duration !== null;
      const confirmation = confirmationFromDraft(draft, {
        inputs: check.inputs,
        computation: proposal.result,
        correcting,
        documents: caseView.register.items,
      });
      if (confirmation.status !== 'valid') {
        setDurationFeedback(refusedWith(confirmationMessage(confirmation)));
        return;
      }
      const body = JSON.stringify({
        expectedRevision: current.revision,
        ...(correcting ? { reason: confirmation.reason } : {}),
        inputs: check.inputs,
        confirmed: confirmation.confirmed,
        ...(confirmation.justification === null
          ? {}
          : { justification: confirmation.justification }),
        ...(confirmation.onBehalf === null
          ? {}
          : { onBehalf: confirmation.onBehalf }),
      });
      void execute(
        'duration',
        reuse(durationFeedback, {
          path: `/certification-cases/${encodeURIComponent(current.id)}/duration`,
          body,
          caseId: current.id,
        }),
      );
    }

    function applicationStep(current: CaseDetail) {
      if (current.status === 'rejected') return null;
      if (current.decision !== null || current.status !== 'open')
        return (
          <p className="certification-blocked">
            {copy('blockedApplicationDecided')}
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
        <>
          {dossierAnalysisAuthority(actor) && (
            <CertificationDraftPreparation
              key={JSON.stringify([scope, actor, current.id, current.revision])}
              scope={JSON.stringify([
                scope,
                actor,
                current.id,
                current.revision,
              ])}
              projectId={projectId}
              caseId={current.id}
              revision={current.revision}
              draft={applicationDraft}
              disabled={busy || blockedUntilReload(applicationFeedback)}
              read={(owner, signal, path) =>
                query(owner, signal, path, undefined, 'documents')
              }
              onApply={({ values, expected }) => {
                setApplicationDraft((currentDraft) =>
                  unchangedDraft(currentDraft, expected)
                    ? { ...currentDraft, ...values }
                    : currentDraft,
                );
                setApplicationOpen(true);
                if (
                  applicationFeedback.status === 'saved' ||
                  (applicationFeedback.status === 'refused' &&
                    !applicationFeedback.reload)
                )
                  setApplicationFeedback(IDLE);
              }}
            />
          )}
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
        </>
      );
    }

    /** The review form, or the plain-language reason it is unavailable. */
    function reviewStep(current: CaseDetail, register: DocumentRegister) {
      if (current.status === 'rejected' || current.applicationReview)
        return null;
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
          documents={register.items}
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

    /** The duration inputs, proposal and confirmation, or the correction entry. */
    function durationStep(current: CaseDetail, register: DocumentRegister) {
      const application = current.application;
      const recorded = current.duration;
      if (current.status !== 'open' || !application) return null;
      if (recorded && !durationOpen)
        return (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              resetDurationDraft();
              setDurationDraft(
                durationDraftFor({
                  facts: application.value,
                  current: recorded.value,
                }),
              );
              setDurationOpen(true);
              setDurationFeedback(IDLE);
            }}
          >
            {copy('correctDuration')}
          </button>
        );
      const draft =
        durationDraft ??
        durationDraftFor({
          facts: application.value,
          current: recorded?.value ?? null,
        });
      const check = durationInputsFromDraft(draft, application.value);
      const typed =
        check.status === 'valid' ? JSON.stringify(check.inputs) : undefined;
      return (
        <DurationForm
          idPrefix={`${prefix}-duration`}
          facts={application.value}
          draft={draft}
          documents={register.items}
          correcting={recorded !== null}
          disabled={busy}
          computing={proposal.status === 'computing'}
          submitting={durationFeedback.status === 'saving'}
          submitBlocked={blockedUntilReload(durationFeedback)}
          proposal={
            proposal.status === 'ready'
              ? { result: proposal.result, current: proposal.inputs === typed }
              : undefined
          }
          inputsRefusal={
            proposal.status === 'refused'
              ? { id: `${prefix}-proposal-feedback`, message: proposal.message }
              : undefined
          }
          feedbackId={describedFeedback('duration', durationFeedback)}
          onChange={(next) => {
            setDurationDraft(next);
            setDurationOpen(true);
            if (proposal.status === 'refused') setProposal(NO_PROPOSAL);
            if (
              durationFeedback.status === 'saved' ||
              (durationFeedback.status === 'refused' &&
                !durationFeedback.reload)
            )
              setDurationFeedback(IDLE);
          }}
          onCompute={(event) => void computeProposal(event)}
          onSubmit={submitDuration}
          onCancel={
            recorded
              ? () => {
                  resetDurationDraft();
                  setDurationFeedback(IDLE);
                }
              : undefined
          }
        />
      );
    }

    /** The state of the last download, under the Document rights it began with. */
    function agreementStep(current: CaseDetail, register: DocumentRegister) {
      const recorded = current.agreement;
      if (current.status !== 'open' || !current.duration) return null;
      if (recorded && !agreementOpen)
        return (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setAgreementDraft(agreementDraftFor(recorded));
              setAgreementOpen(true);
              setAgreementFeedback(IDLE);
            }}
          >
            {copy('correctAgreement')}
          </button>
        );
      const attachments = agreementAttachments(register.items);
      if (attachments.length === 0)
        return (
          <p className="certification-blocked">{copy('agreementNoDocument')}</p>
        );
      return (
        <AgreementForm
          idPrefix={`${prefix}-agreement`}
          draft={agreementDraft ?? agreementDraftFor(null)}
          attachments={attachments}
          correcting={recorded !== null}
          today={latestBusinessDate()}
          disabled={busy}
          submitting={agreementFeedback.status === 'saving'}
          submitBlocked={blockedUntilReload(agreementFeedback)}
          feedbackId={describedFeedback('agreement', agreementFeedback)}
          onChange={(draft) => {
            setAgreementDraft(draft);
            setAgreementOpen(true);
            if (
              agreementFeedback.status === 'saved' ||
              (agreementFeedback.status === 'refused' &&
                !agreementFeedback.reload)
            )
              setAgreementFeedback(IDLE);
          }}
          onSubmit={submitAgreement}
          onCancel={
            recorded
              ? () => {
                  resetAgreementDraft();
                  setAgreementFeedback(IDLE);
                }
              : undefined
          }
        />
      );
    }
    function agreementSection() {
      if (!caseView.caseDetail.duration) return null;
      return (
        <section aria-labelledby={`${prefix}-agreement-title`}>
          <h5 id={`${prefix}-agreement-title`}>{copy('agreementTitle')}</h5>
          {caseView.caseDetail.agreement ? (
            <>
              <VersionAttribution version={caseView.caseDetail.agreement} />
              <AgreementView
                agreement={caseView.caseDetail.agreement.value}
                register={caseView.register}
              />
            </>
          ) : (
            <p>{copy('agreementMissing')}</p>
          )}
          {authority.manage && (
            <>
              {feedbackMessage('agreement', agreementFeedback)}
              {agreementStep(caseView.caseDetail, caseView.register)}
            </>
          )}
        </section>
      );
    }
    function applicationSection() {
      return (
        <section aria-labelledby={`${prefix}-application-title`}>
          <h5 id={`${prefix}-application-title`}>{copy('applicationTitle')}</h5>
          {caseView.caseDetail.application ? (
            <>
              <VersionAttribution version={caseView.caseDetail.application} />
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
      );
    }
    function reviewSection() {
      return (
        <section aria-labelledby={`${prefix}-review-title`}>
          <h5 id={`${prefix}-review-title`}>{copy('reviewTitle')}</h5>
          {caseView.caseDetail.applicationReview ? (
            <>
              <VersionAttribution
                version={caseView.caseDetail.applicationReview}
              />
              <ReviewView
                review={caseView.caseDetail.applicationReview.value}
                register={caseView.register}
              />
            </>
          ) : (
            <p>{copy('reviewMissing')}</p>
          )}
          {authority.manage && (
            <>
              {feedbackMessage('review', reviewFeedback)}
              {reviewStep(caseView.caseDetail, caseView.register)}
            </>
          )}
        </section>
      );
    }
    function durationSection() {
      if (caseView.caseDetail.applicationReview?.value.outcome !== 'accepted')
        return null;
      return (
        <section aria-labelledby={`${prefix}-duration-title`}>
          <h5 id={`${prefix}-duration-title`}>{copy('durationTitle')}</h5>
          {caseView.caseDetail.duration ? (
            <>
              <VersionAttribution version={caseView.caseDetail.duration} />
              <DurationView
                determination={caseView.caseDetail.duration.value}
                register={caseView.register}
              />
            </>
          ) : (
            <p>{copy('durationMissing')}</p>
          )}
          {authority.manage && (
            <>
              {feedbackMessage('duration', durationFeedback)}
              {durationStep(caseView.caseDetail, caseView.register)}
            </>
          )}
        </section>
      );
    }
    switch (section) {
      case 'preparation':
        return (
          <>
            {applicationSection()}
            {reviewSection()}
            {durationSection()}
          </>
        );
      case 'application':
        return applicationSection();
      case 'review':
        return reviewSection();
      case 'duration':
        return durationSection();
      case 'agreement':
        return agreementSection();
    }
    return unexpected(section);
  }
  const feedback = [
    applicationFeedback,
    reviewFeedback,
    durationFeedback,
    agreementFeedback,
  ];
  return {
    render,
    reset: () => {
      for (const kind of INTAKE_KINDS) {
        resetDraft(kind);
        feedbackSetters[kind](IDLE);
      }
    },
    clearRefusals: () => {
      for (const kind of INTAKE_KINDS)
        feedbackSetters[kind](clearReloadedFeedback);
    },
    retire: (except: ScopedOperation) => {
      if (proposalOperation !== except) proposalOperation.retire();
    },
    saving:
      proposal.status === 'computing' ||
      feedback.some((item) => item.status === 'saving'),
    saved: feedback.some((item) => item.status === 'saved'),
  };
}
function agreementMessage(
  check: Exclude<AgreementCheck, { status: 'valid' }>,
): CertificationMessageKey {
  switch (check.status) {
    case 'incomplete':
      return 'agreementValidation';
    case 'future':
      return 'agreementInFuture';
    case 'reasonRequired':
      return 'reasonRequired';
  }
  return unexpected(check.status);
}

/** Why the proposal read gave no proposal, in plain language. */
function proposalRefusal(result: ApiResult<unknown>): CertificationMessageKey {
  switch (result.status) {
    case 'forbidden':
    case 'unauthorized':
      return 'denied';
    case 'notFound':
      return 'unavailable';
    case 'validation':
      return 'invalid';
    case 'conflict':
      return conflictCode(result) === 'CERTIFICATION_APPLICATION_NOT_ACCEPTED'
        ? 'durationNotAccepted'
        : 'proposalUnavailable';
    case 'ok':
    case 'error':
      return 'proposalUnavailable';
  }
  return unexpected(result);
}

function confirmationMessage(
  check: Exclude<ConfirmationCheck, { status: 'valid' }>,
): CertificationMessageKey {
  switch (check.status) {
    case 'invalidValues':
      return 'durationValuesValidation';
    case 'stagesMismatch':
      return 'durationStagesMismatch';
    case 'justificationRequired':
      return 'durationJustificationRequired';
    case 'acting':
      return 'actingValidation';
    case 'reasonRequired':
      return 'reasonRequired';
  }
  return unexpected(check);
}
