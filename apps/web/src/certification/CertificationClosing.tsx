import { unexpected } from './certification-command';
import { findingRoles } from './certification-audit-roles';
import {
  CertificateReleaseRegion,
  useCertificateReleaseForm,
} from './CertificationRelease';
import { useState, type FormEvent, type ReactNode } from 'react';
import { formatMessage } from '../localization/messages';
import { type CertificationMessageKey } from './certification.copy';
import { latestBusinessDate } from './certification-attribution';
import { linkedToAnyTeamVersion } from './certification-team-draft';
import { findingBlocks } from './certification-findings';
import { approvedTeam } from './certification-stages';
import { type CaseDetail } from './certification-response';
import { type RegisterDownload } from './CertificationDocumentViews';
import { VersionAttribution } from './CertificationAttribution';
import {
  certificateTextDifferences,
  decisionPreconditions,
} from './certification-decision';
import {
  attachmentsWithRole,
  certificateDataDraftFor,
  certificateDataFromDraft,
  certificateFromDraft,
  certificationDecisionDraftFor,
  certificationDecisionFromDraft,
  dossierReviewDraftFor,
  dossierReviewFromDraft,
  emptyCertificateDraft,
  emptyCertificationDecisionDraft,
  recommendationDraftFor,
  recommendationFromDraft,
  type CertificateDataDraft,
  type CertificateDraft,
  type CertificationDecisionDraft,
  type DossierReviewCheck,
  type DossierReviewDraft,
  type RecommendationDraft,
} from './certification-decision-draft';
import {
  CertificateDataForm,
  CertificateForm,
  CertificationDecisionForm,
  DossierReviewForm,
  RecommendationForm,
} from './CertificationDecisionForms';
import {
  CertificateDataView,
  CertificateTextDifferences,
  CertificateView,
  CertificationDecisionView,
  DossierReviewView,
  PreconditionList,
  RecommendationView,
} from './CertificationDecisionViews';
import { blockingDecision } from './certification-consistency';

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
  type NamedDiscrepancy,
} from './certification-command';

import type {
  CertificationCaseView as CaseView,
  CertificationWorkflowContext,
} from './certification-command';

const CLOSING_KINDS = [
  'recommendation',
  'dossierReview',
  'certificationDecision',
  'certificateData',
  'certificate',
  'certificateDraft',
  'clientOpinion',
  'draftApproval',
  'certificateRevision',
] as const;
export type ClosingKind = (typeof CLOSING_KINDS)[number];
/** Whether a command records one of the closing steps. */
export function isClosingCommand(kind: string): boolean {
  return CLOSING_KINDS.some((entry) => entry === kind);
}

interface ClosingContext extends CertificationWorkflowContext<ClosingKind> {
  registerDownload: (view: CaseView) => RegisterDownload | undefined;
  namedDiscrepancies: (named: readonly NamedDiscrepancy[]) => ReactNode;
}
/** Owns closing drafts and feedback through Case reload, review and Certificate release. */
export function useCertificationClosing({
  view,
  actor,
  authority,
  prefix,
  copy,
  commit,
  renderFeedback,
  registerDownload,
  namedDiscrepancies,
}: ClosingContext) {
  const releaseForm = useCertificateReleaseForm();
  /**
   * Null until opened for a correction or edited: a first record then
   * starts empty. Kept through a reload, like the other drafts.
   */
  const [recommendationDraft, setRecommendationDraft] =
    useState<RecommendationDraft | null>(null);
  const [recommendationFeedback, setRecommendationFeedback] =
    useState<Feedback>(IDLE);
  const [dossierDraft, setDossierDraft] = useState<DossierReviewDraft | null>(
    null,
  );
  const [dossierFeedback, setDossierFeedback] = useState<Feedback>(IDLE);
  /**
   * Null until edited or opened for a correction: a first decision then
   * starts empty, a correction from the latest decision's values.
   */
  const [certificationDecisionDraft, setCertificationDecisionDraft] =
    useState<CertificationDecisionDraft | null>(null);
  const [certificationDecisionFeedback, setCertificationDecisionFeedback] =
    useState<Feedback>(IDLE);
  const [certificateDataDraft, setCertificateDataDraft] =
    useState<CertificateDataDraft | null>(null);
  const [certificateDataFeedback, setCertificateDataFeedback] =
    useState<Feedback>(IDLE);
  const [certificateDraft, setCertificateDraft] = useState<CertificateDraft>(
    emptyCertificateDraft,
  );
  const [certificateFeedback, setCertificateFeedback] =
    useState<Feedback>(IDLE);
  const [certificateDraftFeedback, setCertificateDraftFeedback] =
    useState<Feedback>(IDLE);
  const [clientOpinionFeedback, setClientOpinionFeedback] =
    useState<Feedback>(IDLE);
  const [draftApprovalFeedback, setDraftApprovalFeedback] =
    useState<Feedback>(IDLE);
  const [certificateRevisionFeedback, setCertificateRevisionFeedback] =
    useState<Feedback>(IDLE);
  const closingFeedback: Record<ClosingKind, Feedback> = {
    recommendation: recommendationFeedback,
    dossierReview: dossierFeedback,
    certificationDecision: certificationDecisionFeedback,
    certificateData: certificateDataFeedback,
    certificate: certificateFeedback,
    certificateDraft: certificateDraftFeedback,
    clientOpinion: clientOpinionFeedback,
    draftApproval: draftApprovalFeedback,
    certificateRevision: certificateRevisionFeedback,
  };
  function feedbackSetter(kind: ClosingKind) {
    switch (kind) {
      case 'recommendation':
        return setRecommendationFeedback;
      case 'dossierReview':
        return setDossierFeedback;
      case 'certificationDecision':
        return setCertificationDecisionFeedback;
      case 'certificateData':
        return setCertificateDataFeedback;
      case 'certificate':
        return setCertificateFeedback;
      case 'certificateDraft':
        return setCertificateDraftFeedback;
      case 'clientOpinion':
        return setClientOpinionFeedback;
      case 'draftApproval':
        return setDraftApprovalFeedback;
      case 'certificateRevision':
        return setCertificateRevisionFeedback;
    }
    return unexpected(kind);
  }
  function execute(kind: ClosingKind, intent: Intent) {
    return commit({
      kind,
      intent,
      setFeedback: feedbackSetter(kind),
      confirmed: () => resetClosingDraft(kind),
    });
  }
  function reset() {
    for (const kind of CLOSING_KINDS) {
      resetClosingDraft(kind);
      feedbackSetter(kind)(IDLE);
    }
  }
  function clearRefusals() {
    for (const kind of CLOSING_KINDS)
      feedbackSetter(kind)(clearReloadedFeedback);
  }
  const feedbackIds = {
    recommendation: `${prefix}-recommendation-feedback`,
    dossierReview: `${prefix}-dossier-review-feedback`,
    certificationDecision: `${prefix}-certification-decision-feedback`,
    certificateData: `${prefix}-certificate-data-feedback`,
    certificate: `${prefix}-certificate-feedback`,
    certificateDraft: `${prefix}-certificate-draft-feedback`,
    clientOpinion: `${prefix}-client-opinion-feedback`,
    draftApproval: `${prefix}-draft-approval-feedback`,
    certificateRevision: `${prefix}-certificate-revision-feedback`,
  } satisfies Record<ClosingKind, string>;
  function feedbackMessage(kind: ClosingKind, feedback: Feedback) {
    return renderFeedback({
      kind,
      feedback,
      id: feedbackIds[kind],
      retry: () =>
        retryUncertainCommand(feedback, (intent) => execute(kind, intent)),
    });
  }
  function describedFeedback(kind: ClosingKind, feedback: Feedback) {
    return describedFeedbackId(feedback, feedbackIds[kind]);
  }
  /** Closes a closing-step form: a first record starts empty again. */
  function resetClosingDraft(kind: ClosingKind) {
    switch (kind) {
      case 'recommendation':
        return setRecommendationDraft(null);
      case 'dossierReview':
        return setDossierDraft(null);
      case 'certificationDecision':
        return setCertificationDecisionDraft(null);
      case 'certificateData':
        return setCertificateDataDraft(null);
      case 'certificate':
        return setCertificateDraft(emptyCertificateDraft());
      case 'certificateDraft':
      case 'clientOpinion':
      case 'draftApproval':
      case 'certificateRevision':
        return releaseForm.reset(kind);
    }
    return unexpected(kind);
  }

  function render(busy: boolean) {
    if (!view) return null;
    const caseView = view;
    /** Sends one closing-step command for the read Case, reusing an uncertain key. */
    function sendClosing(
      kind: ClosingKind,
      current: CaseDetail,
      path: string,
      body: object,
    ) {
      void execute(
        kind,
        reuse(closingFeedback[kind], {
          path: `/certification-cases/${encodeURIComponent(current.id)}/${path}`,
          body: JSON.stringify({ expectedRevision: current.revision, ...body }),
          caseId: current.id,
        }),
      );
    }

    /** The view of the read Case while a closing-step command may be sent. */
    function closingView(kind: ClosingKind): CaseView | undefined {
      return !busy && !blockedUntilReload(closingFeedback[kind])
        ? caseView
        : undefined;
    }

    /** The leader of the approved team recommends until the decision. */
    function submitRecommendation(event: FormEvent) {
      event.preventDefault();
      const view = closingView('recommendation');
      if (!view || !recommendationOffered(view)) return;
      const recorded = view.caseDetail.recommendation;
      const check = recommendationFromDraft(
        recommendationDraft ?? recommendationDraftFor(null),
        recorded !== null,
      );
      if (check.status !== 'valid') {
        setRecommendationFeedback(
          refusedWith(
            check.status === 'reasonRequired'
              ? 'reasonRequired'
              : 'recommendationValidation',
          ),
        );
        return;
      }
      sendClosing('recommendation', view.caseDetail, 'recommendation', {
        ...(check.reason === null ? {} : { reason: check.reason }),
        ...check.value,
      });
    }

    /** An approver outside the team reviews the dossier until the decision. */
    function submitDossierReview(event: FormEvent) {
      event.preventDefault();
      const view = closingView('dossierReview');
      if (!view || !undecidedApprover(view)) return;
      const current = view.caseDetail;
      if (!current.recommendation) return;
      const check = dossierReviewFromDraft(
        dossierDraft ?? dossierReviewDraftFor(null),
        {
          correcting: current.dossierReview !== null,
          register: view.register.items,
          timeline: view.timeline,
        },
      );
      if (check.status !== 'valid') {
        setDossierFeedback(refusedWith(dossierReviewMessage(check.status)));
        return;
      }
      sendClosing('dossierReview', current, 'dossier-review', {
        ...(check.reason === null ? {} : { reason: check.reason }),
        ...check.value,
      });
    }

    /**
     * An approver outside the team records the decision, or corrects its
     * texts and references while the Case is open, after the draft is
     * complete and attested and the read Case meets every precondition the
     * web can mirror; the server rechecks them all and keeps the outcome.
     */
    function submitCertificationDecision(event: FormEvent) {
      event.preventDefault();
      const view = closingView('certificationDecision');
      if (!view || !decisionOffered(view)) return;
      const recorded = view.caseDetail.decision;
      if (recorded && !certificationDecisionDraft) return;
      const check = certificationDecisionFromDraft(
        certificationDecisionDraft ??
          emptyCertificationDecisionDraft(
            view.caseDetail.certificateData?.value ?? null,
          ),
        {
          register: view.register.items,
          correcting: recorded?.value.decision ?? null,
          frozen:
            view.caseDetail.status === 'certified'
              ? recorded?.value
              : undefined,
        },
      );
      if (check.status !== 'valid') {
        setCertificationDecisionFeedback(
          refusedWith(
            check.status === 'attestation'
              ? 'decisionAttestationRequired'
              : check.status === 'reasonRequired'
                ? 'reasonRequired'
                : 'certificationDecisionValidation',
          ),
        );
        return;
      }
      const failures = decisionPreconditions(
        view.caseDetail,
        check.value.decision,
      );
      if (failures.length > 0) {
        setCertificationDecisionFeedback({
          status: 'unmet',
          source: 'case',
          failures,
          discrepancies: blockingDecision(view.caseDetail.consistency).map(
            (entry) => ({ id: entry.id, rule: entry.rule ?? 'manual' }),
          ),
        });
        return;
      }
      sendClosing('certificationDecision', view.caseDetail, 'decision', {
        ...(check.reason === null ? {} : { reason: check.reason }),
        ...check.value,
      });
    }

    /** A programme manager agrees the Certificate data while the Case is open. */
    function submitCertificateData(event: FormEvent) {
      event.preventDefault();
      const view = closingView('certificateData');
      const current = view?.caseDetail;
      if (
        !view ||
        !current ||
        !authority.manage ||
        (current.status !== 'open' && current.status !== 'certified') ||
        !current.stage2Report
      )
        return;
      const check = certificateDataFromDraft(
        certificateDataDraft ?? certificateDataDraftFor(null),
        {
          register: view.register.items,
          correcting: current.certificateData !== null,
        },
      );
      if (check.status !== 'valid') {
        setCertificateDataFeedback(
          refusedWith(
            check.status === 'reasonRequired'
              ? 'reasonRequired'
              : 'certificateDataValidation',
          ),
        );
        return;
      }
      sendClosing('certificateData', current, 'certificate-data', {
        ...(check.reason === null ? {} : { reason: check.reason }),
        ...check.value,
      });
    }

    /** An approver outside the team records the Certificate of a grant. */
    function submitCertificate(event: FormEvent) {
      event.preventDefault();
      const view = closingView('certificate');
      if (!view || certificateHold(view) !== null) return;
      const check = certificateFromDraft(
        {
          ...certificateDraft,
          number: view.caseDetail.release.drafts.at(-1)?.value.number ?? '',
        },
        view.register.items,
      );
      if (check.status !== 'valid') {
        setCertificateFeedback(
          refusedWith(
            check.status === 'attestation'
              ? 'certificateAttestationRequired'
              : 'certificateValidation',
          ),
        );
        return;
      }
      sendClosing('certificate', view.caseDetail, 'certificate', {
        ...check.value,
        independenceAttested: true,
      });
    }

    /**
     * The server's rule: the leader of the approved team recommends once
     * Stage 2 is reported and no Finding holds the Case, until the decision.
     */
    function recommendationOffered(view: CaseView): boolean {
      const current = view.caseDetail;
      return (
        findingRoles(view, actor.workspaceMembershipId, authority).leader &&
        current.stage2Report !== null &&
        current.decision === null &&
        !current.findings.some(findingBlocks)
      );
    }

    /** An approver linked to no team version, while the Case is undecided. */
    function undecidedApprover(view: CaseView): boolean {
      return (
        findingRoles(view, actor.workspaceMembershipId, authority)
          .independentApprover && view.caseDetail.decision === null
      );
    }

    /**
     * An approver linked to no team version records the decision, or corrects
     * its permitted fields. Issuance restricts corrections to granted texts.
     */
    function decisionOffered(view: CaseView): boolean {
      return (
        (view.caseDetail.status === 'open' ||
          view.caseDetail.status === 'refused' ||
          view.caseDetail.status === 'certified') &&
        authority.approve &&
        !linkedToAnyTeamVersion(view.timeline, actor.workspaceMembershipId)
      );
    }

    /**
     * Why this actor cannot record the Certificate now, in the server's
     * order, or null: an approver outside the team, a granting decision, the
     * agreed data stating exactly what it grants, and a Certificate PDF.
     */
    function certificateHold(view: CaseView): CertificationMessageKey | null {
      const current = view.caseDetail;
      const decided = current.decision?.value;
      if (current.status !== 'open' || decided?.decision !== 'granted')
        return 'blockedCertificateNotGranted';
      if (!authority.approve) return 'certificateAwaitingApprover';
      if (
        !findingRoles(view, actor.workspaceMembershipId, authority)
          .independentApprover
      )
        return 'certificateApproverIndependence';
      const data = current.certificateData;
      if (!data) return 'blockedCertificateDataMissing';
      if (
        certificateTextDifferences(decided.grantedTexts, data.value.texts)
          .length
      )
        return 'blockedCertificateDataDiffers';
      if (current.release.issuanceBlockers.length > 0)
        return 'blockedCertificateApprovalMissing';
      if (attachmentsWithRole(view.register.items, 'certificate').length === 0)
        return 'certificateNoPdf';
      return null;
    }

    /** Keeps an edited closing-step draft; an edit clears a refusal it may answer. */
    function edited(kind: ClosingKind) {
      const feedback = closingFeedback[kind];
      if (
        feedback.status === 'saved' ||
        feedback.status === 'unmet' ||
        (feedback.status === 'refused' && !feedback.reload)
      )
        feedbackSetter(kind)(IDLE);
    }

    /** The shared props of an open closing-step form. */
    function closingForm(kind: ClosingKind, idPrefix: string) {
      const feedback = closingFeedback[kind];
      return {
        idPrefix: `${prefix}-${idPrefix}`,
        disabled: busy,
        submitting: feedback.status === 'saving',
        submitBlocked: blockedUntilReload(feedback),
        feedbackId: describedFeedback(kind, feedback),
      };
    }

    /** A closing-step panel: its title, latest record and the step below. */
    function closingSection(
      kind: ClosingKind,
      title: CertificationMessageKey,
      record: ReactNode,
      step: ReactNode,
    ) {
      const titleId = `${prefix}-${kind}-title`;
      return (
        <section aria-labelledby={titleId}>
          <h5 id={titleId}>{copy(title)}</h5>
          {record}
          {feedbackMessage(kind, closingFeedback[kind])}
          {step}
        </section>
      );
    }

    /** The latest recommendation, then its form, correction or who records it. */
    function recommendationSection(view: CaseView) {
      const recorded = view.caseDetail.recommendation;
      return closingSection(
        'recommendation',
        'recommendationTitle',
        recorded ? (
          <>
            <VersionAttribution version={recorded} />
            <RecommendationView recommendation={recorded.value} />
          </>
        ) : (
          <p>{copy('recommendationMissing')}</p>
        ),
        recommendationStep(view),
      );
    }

    function recommendationStep(view: CaseView) {
      const current = view.caseDetail;
      const recorded = current.recommendation;
      if (current.status !== 'open' || current.decision) return null;
      if (!recommendationOffered(view)) {
        // Nonconformities still holding the Case are explained above it.
        if (recorded || current.findings.some(findingBlocks)) return null;
        return authority.audit && approvedTeam(current) ? (
          <p className="certification-blocked">
            {copy('blockedRecommendationNotTeamLeader')}
          </p>
        ) : (
          <p className="certification-note">
            {copy('recommendationAwaitingLeader')}
          </p>
        );
      }
      if (recorded && !recommendationDraft)
        return (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setRecommendationDraft(recommendationDraftFor(recorded.value));
              setRecommendationFeedback(IDLE);
            }}
          >
            {copy('correctRecommendation')}
          </button>
        );
      return (
        <RecommendationForm
          {...closingForm('recommendation', 'recommendation')}
          draft={recommendationDraft ?? recommendationDraftFor(null)}
          correcting={recorded !== null}
          onChange={(draft) => {
            setRecommendationDraft(draft);
            edited('recommendation');
          }}
          onSubmit={submitRecommendation}
          onCancel={
            recorded
              ? () => {
                  resetClosingDraft('recommendation');
                  setRecommendationFeedback(IDLE);
                }
              : undefined
          }
        />
      );
    }

    /** The latest dossier review, then its form or who reviews the dossier. */
    function dossierSection(view: CaseView) {
      const recorded = view.caseDetail.dossierReview;
      return closingSection(
        'dossierReview',
        'dossierReviewTitle',
        recorded ? (
          <>
            <VersionAttribution version={recorded} />
            <DossierReviewView
              review={recorded.value}
              register={view.register}
            />
          </>
        ) : (
          <p>{copy('dossierReviewMissing')}</p>
        ),
        dossierStep(view),
      );
    }

    function dossierStep(view: CaseView) {
      const current = view.caseDetail;
      const recorded = current.dossierReview;
      if (current.status !== 'open' || current.decision) return null;
      if (!authority.approve)
        return recorded ? null : (
          <p className="certification-note">
            {copy('dossierAwaitingApprover')}
          </p>
        );
      // The server refuses a review by anyone linked to any team version.
      if (!undecidedApprover(view))
        return (
          <p className="certification-blocked">{copy('dossierIndependence')}</p>
        );
      if (recorded && !dossierDraft)
        return (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDossierDraft(dossierReviewDraftFor(recorded.value));
              setDossierFeedback(IDLE);
            }}
          >
            {copy('correctDossierReview')}
          </button>
        );
      return (
        <DossierReviewForm
          {...closingForm('dossierReview', 'dossier-review')}
          draft={dossierDraft ?? dossierReviewDraftFor(null)}
          correcting={recorded !== null}
          documents={view.register.items}
          onChange={(draft) => {
            setDossierDraft(draft);
            edited('dossierReview');
          }}
          onSubmit={submitDossierReview}
          onCancel={
            recorded
              ? () => {
                  resetClosingDraft('dossierReview');
                  setDossierFeedback(IDLE);
                }
              : undefined
          }
        />
      );
    }

    /**
     * The latest decision with its earlier versions; before it, the
     * preconditions the read Case shows unmet and the decision form for an
     * approver outside the team, or who decides. While the Case is open, that
     * approver may correct the decided texts and references.
     */
    function decisionSection(view: CaseView) {
      const recorded = view.caseDetail.decision;
      const earlier = view.timeline.entries
        .flatMap((entry) =>
          entry.step === 'decision' && entry.id !== recorded?.id ? [entry] : [],
        )
        .reverse();
      return closingSection(
        'certificationDecision',
        'certificationDecisionTitle',
        recorded ? (
          <>
            <VersionAttribution version={recorded} />
            <CertificationDecisionView
              decision={recorded.value}
              register={view.register}
            />
            {earlier.length > 0 && (
              <details className="certification-history">
                <summary>
                  {formatMessage(copy('decisionEarlierVersions'), {
                    count: earlier.length,
                  })}
                </summary>
                <ol>
                  {earlier.map((entry) => (
                    <li key={entry.id}>
                      <VersionAttribution version={entry} />
                      <CertificationDecisionView
                        decision={entry.value}
                        register={view.register}
                      />
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </>
        ) : (
          <p>{copy('certificationDecisionMissing')}</p>
        ),
        certificationDecisionStep(view),
      );
    }

    function certificationDecisionStep(view: CaseView) {
      const current = view.caseDetail;
      const recorded = current.decision;
      if (
        current.status !== 'open' &&
        current.status !== 'refused' &&
        current.status !== 'certified'
      )
        return null;
      if (!authority.approve)
        return recorded ? null : (
          <p className="certification-note">
            {copy('certificationDecisionAwaitingApprover')}
          </p>
        );
      // The server refuses a decision by anyone linked to any team version.
      if (!decisionOffered(view))
        return recorded ? null : (
          <p className="certification-blocked">
            {copy('certificationDecisionIndependence')}
          </p>
        );
      if (recorded && !certificationDecisionDraft)
        return (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setCertificationDecisionDraft(
                certificationDecisionDraftFor(recorded.value),
              );
              setCertificationDecisionFeedback(IDLE);
            }}
          >
            {copy('correctDecisionTexts')}
          </button>
        );
      const draft =
        certificationDecisionDraft ??
        emptyCertificationDecisionDraft(current.certificateData?.value ?? null);
      const outcome = recorded?.value.decision ?? null;
      const unmet = decisionPreconditions(current, outcome ?? draft.decision);
      // A blocked submit's alert lists them; the standing notice then yields.
      const announced =
        closingFeedback.certificationDecision.status === 'unmet';
      return (
        <>
          {unmet.length > 0 && !announced && (
            <div className="certification-blocked">
              <p>{copy('decisionPreconditionsTitle')}</p>
              <PreconditionList failures={unmet} />
              {namedDiscrepancies(
                blockingDecision(current.consistency).map((entry) => ({
                  id: entry.id,
                  rule: entry.rule ?? 'manual',
                })),
              )}
            </div>
          )}
          <CertificationDecisionForm
            {...closingForm('certificationDecision', 'certification-decision')}
            draft={draft}
            correcting={outcome}
            textsOnly={current.status === 'certified'}
            forms={attachmentsWithRole(view.register.items, 'decision_form')}
            today={latestBusinessDate()}
            onChange={(next) => {
              setCertificationDecisionDraft(next);
              edited('certificationDecision');
            }}
            onSubmit={submitCertificationDecision}
            onCancel={
              recorded
                ? () => {
                    resetClosingDraft('certificationDecision');
                    setCertificationDecisionFeedback(IDLE);
                  }
                : undefined
            }
          />
        </>
      );
    }

    /**
     * The latest agreed data, how they differ from a grant, then their form,
     * correction or who agrees them.
     */
    function certificateDataSection(view: CaseView) {
      const current = view.caseDetail;
      const recorded = current.certificateData;
      const granted = current.decision?.value;
      const differences =
        recorded && granted?.decision === 'granted'
          ? certificateTextDifferences(
              granted.grantedTexts,
              recorded.value.texts,
            )
          : [];
      return closingSection(
        'certificateData',
        'certificateDataTitle',
        recorded ? (
          <>
            <VersionAttribution version={recorded} />
            <CertificateDataView
              data={recorded.value}
              register={view.register}
            />
            {differences.length > 0 && (
              <CertificateTextDifferences differences={differences} />
            )}
          </>
        ) : (
          <p>{copy('certificateDataMissing')}</p>
        ),
        certificateDataStep(view),
      );
    }

    function certificateDataStep(view: CaseView) {
      const current = view.caseDetail;
      const recorded = current.certificateData;
      if (current.status !== 'open' && current.status !== 'certified')
        return null;
      if (!authority.manage)
        return recorded ? null : (
          <p className="certification-note">
            {copy('certificateDataAwaitingManager')}
          </p>
        );
      if (recorded && !certificateDataDraft)
        return (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setCertificateDataDraft(certificateDataDraftFor(recorded.value));
              setCertificateDataFeedback(IDLE);
            }}
          >
            {copy('correctCertificateData')}
          </button>
        );
      const forms = attachmentsWithRole(
        view.register.items,
        'certificate_data',
      );
      if (forms.length === 0)
        return (
          <p className="certification-blocked">
            {copy('certificateDataNoDocument')}
          </p>
        );
      return (
        <CertificateDataForm
          {...closingForm('certificateData', 'certificate-data')}
          draft={certificateDataDraft ?? certificateDataDraftFor(null)}
          correcting={recorded !== null}
          forms={forms}
          onChange={(draft) => {
            setCertificateDataDraft(draft);
            edited('certificateData');
          }}
          onSubmit={submitCertificateData}
          onCancel={
            recorded
              ? () => {
                  resetClosingDraft('certificateData');
                  setCertificateDataFeedback(IDLE);
                }
              : undefined
          }
        />
      );
    }

    /**
     * The recorded Certificate with its server-computed validity; before it,
     * the form for an approver outside the team or why it waits.
     */
    function certificateSection(view: CaseView) {
      const recorded = view.caseDetail.certificate;
      return closingSection(
        'certificate',
        'certificateTitle',
        recorded ? (
          <CertificateView
            certificate={recorded}
            register={view.register}
            download={registerDownload(view)}
          />
        ) : (
          <p>{copy('certificateMissing')}</p>
        ),
        certificateStep(view),
      );
    }

    function certificateStep(view: CaseView) {
      if (view.caseDetail.status !== 'open') return null;
      const hold = certificateHold(view);
      if (hold === 'certificateAwaitingApprover')
        return <p className="certification-note">{copy(hold)}</p>;
      if (hold !== null)
        return <p className="certification-blocked">{copy(hold)}</p>;
      return (
        <CertificateForm
          {...closingForm('certificate', 'certificate')}
          notBefore={view.caseDetail.decision?.value.decidedOn}
          draft={{
            ...certificateDraft,
            number: view.caseDetail.release.drafts.at(-1)?.value.number ?? '',
          }}
          pdfs={attachmentsWithRole(view.register.items, 'certificate')}
          onChange={(draft) => {
            setCertificateDraft(draft);
            edited('certificate');
          }}
          onSubmit={submitCertificate}
        />
      );
    }
    return (
      <>
        {caseView.caseDetail.stage2Report !== null &&
          recommendationSection(caseView)}
        {(caseView.caseDetail.certificateData !== null ||
          (caseView.caseDetail.stage2Report !== null &&
            caseView.caseDetail.status === 'open')) &&
          certificateDataSection(caseView)}
        {caseView.caseDetail.recommendation !== null && (
          <>
            {dossierSection(caseView)}
            {decisionSection(caseView)}
          </>
        )}
        <CertificateReleaseRegion
          form={releaseForm}
          key={caseView.caseDetail.id}
          current={caseView.caseDetail}
          register={caseView.register}
          manage={authority.manage}
          approve={
            authority.approve &&
            !linkedToAnyTeamVersion(
              caseView.timeline,
              actor.workspaceMembershipId,
            )
          }
          disabled={busy}
          blocked={{
            certificateDraft: blockedUntilReload(certificateDraftFeedback),
            clientOpinion: blockedUntilReload(clientOpinionFeedback),
            draftApproval: blockedUntilReload(draftApprovalFeedback),
            certificateRevision: blockedUntilReload(
              certificateRevisionFeedback,
            ),
          }}
          feedback={{
            certificateDraft: feedbackMessage(
              'certificateDraft',
              certificateDraftFeedback,
            ),
            clientOpinion: feedbackMessage(
              'clientOpinion',
              clientOpinionFeedback,
            ),
            draftApproval: feedbackMessage(
              'draftApproval',
              draftApprovalFeedback,
            ),
            certificateRevision: feedbackMessage(
              'certificateRevision',
              certificateRevisionFeedback,
            ),
          }}
          onCommand={(command) =>
            sendClosing(
              command.kind,
              caseView.caseDetail,
              command.path,
              command.value,
            )
          }
          download={registerDownload(caseView)}
          issuance={
            caseView.caseDetail.decision?.value.decision === 'granted'
              ? certificateSection(caseView)
              : null
          }
        />
      </>
    );
  }
  const feedback = Object.values(closingFeedback);
  return {
    render,
    reset,
    clearRefusals,
    saving: feedback.some((item) => item.status === 'saving'),
    saved: feedback.some((item) => item.status === 'saved'),
  };
}

/** Why a dossier review draft is refused before it is sent. */
function dossierReviewMessage(
  status: Exclude<DossierReviewCheck, { status: 'valid' }>['status'],
): CertificationMessageKey {
  switch (status) {
    case 'incomplete':
      return 'dossierReviewValidation';
    case 'acting':
      return 'actingValidation';
    case 'actingOnTeam':
      return 'actingOnTeam';
    case 'attestation':
      return 'dossierAttestationRequired';
    case 'reasonRequired':
      return 'reasonRequired';
  }
  return unexpected(status);
}
