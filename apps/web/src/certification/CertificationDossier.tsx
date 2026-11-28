import { useState, type FormEvent } from 'react';
import {
  useScopedOperation,
  type ScopedOperation,
} from '../api/use-scoped-operation';
import { formatMessage } from '../localization/messages';
import { linkedToAnyTeamVersion } from './certification-team-draft';
import { type CaseDetail } from './certification-response';
import {
  emptyManualDraft,
  manualFromDraft,
  resolutionFromDraft,
  type ConsistencyRoles,
  type ManualDraft,
  type ResolutionDraft,
} from './certification-consistency';
import { useConsistencyCopy } from './certification-consistency.copy';
import { ConsistencyRegion, ruleLabel } from './CertificationConsistency';
import { DeadlineAdministration } from './CertificationExchanges';
import { useDeadlineAdministration } from './use-deadline-administration';

import {
  useCertificationExchangeRegister,
  type ExchangeMutationKind,
} from './CertificationExchangeRegister';
import {
  IDLE,
  retryUncertainCommand,
  reuse,
  blockedUntilReload,
  clearReloadedFeedback,
  describedFeedbackId,
  refusedWith,
  unexpected,
  type Intent,
  type Feedback,
  type NamedDiscrepancy,
} from './certification-command';

import type { CertificationCaseView as CaseView } from './certification-command';

import type {
  CertificationQuery,
  CertificationWorkflowContext,
} from './certification-command';

type ConsistencyKind = 'discrepancy' | 'discrepancyResolution';
interface DossierContext extends Omit<
  CertificationWorkflowContext<ConsistencyKind | ExchangeMutationKind>,
  'copy'
> {
  scope: string;
  query: CertificationQuery;
  updateCase: (update: (current: CaseDetail) => CaseDetail) => void;
  reload: (caseId: string) => void;
  isBusy: () => boolean;
}
/** Owns dossier consistency, exchanges and procedure-deadline editing for the workspace. */
export function useCertificationDossier({
  scope,
  view,
  actor,
  authority,
  prefix,
  query,
  commit,
  updateCase,
  reload,
  isBusy,
  renderFeedback,
}: DossierContext) {
  const administersDeadlines = actor.workspacePermissions.includes(
    'company.assignment.manage',
  );
  const exchangePageOperation = useScopedOperation(scope);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState<ManualDraft>(emptyManualDraft);
  const [manualFeedback, setManualFeedback] = useState<Feedback>(IDLE);
  /** The one acceptance or correction form open in the region, if any. */
  const [resolutionDraft, setResolutionDraft] =
    useState<ResolutionDraft | null>(null);
  const [resolutionFeedback, setResolutionFeedback] = useState<Feedback>(IDLE);
  /** The Company's procedure deadline configuration, for its administrator. */
  const deadlines = useDeadlineAdministration({
    scope,
    enabled: administersDeadlines,
    query: (slot, signal, path, post) =>
      query(slot, signal, path, post, 'administration'),
    onSaved: () => {
      if (view) reload(view.caseDetail.id);
    },
  });
  const consistencyCopy = useConsistencyCopy();
  const exchangeRegister = useCertificationExchangeRegister({
    view,
    pageOperation: exchangePageOperation,
    queryPage: (signal, path) => query(exchangePageOperation, signal, path),
    commit,
    updateCase,
    reload,
    isBusy,
    renderFeedback,
  });
  const feedbackIds = {
    discrepancy: `${prefix}-discrepancy-feedback`,
    discrepancyResolution: `${prefix}-discrepancy-resolution-feedback`,
  };
  const feedbackSetters = {
    discrepancy: setManualFeedback,
    discrepancyResolution: setResolutionFeedback,
  };
  function execute(kind: ConsistencyKind, intent: Intent) {
    return commit({
      kind,
      intent,
      setFeedback: feedbackSetters[kind],
      confirmed: () => {
        switch (kind) {
          case 'discrepancy':
            setManualDraft(emptyManualDraft());
            setManualOpen(false);
            return;
          case 'discrepancyResolution':
            return setResolutionDraft(null);
        }
        return unexpected(kind);
      },
    });
  }
  function feedbackMessage(kind: ConsistencyKind, feedback: Feedback) {
    return renderFeedback({
      kind,
      feedback,
      id: feedbackIds[kind],
      retry: () =>
        retryUncertainCommand(feedback, (intent) => execute(kind, intent)),
    });
  }
  function describedFeedback(kind: ConsistencyKind, feedback: Feedback) {
    return describedFeedbackId(feedback, feedbackIds[kind]);
  }
  /** The Discrepancies a decision is refused for, each by its rule or subject. */
  function namedDiscrepancies(named: readonly NamedDiscrepancy[]) {
    if (named.length === 0) return null;
    const open = view?.caseDetail.consistency.open ?? [];
    return (
      <ul aria-label={consistencyCopy('openTitle')}>
        {named.map((entry) => {
          const read = open.find((view) => view.id === entry.id);
          return (
            <li key={entry.id}>
              {entry.rule === 'manual'
                ? read?.origin === 'manual'
                  ? formatMessage(consistencyCopy('manualHeading'), {
                      sequence: read.sequence,
                      subject: read.subject,
                    })
                  : consistencyCopy('manualFormTitle')
                : `${entry.rule} — ${consistencyCopy(ruleLabel(entry.rule))}`}
            </li>
          );
        })}
      </ul>
    );
  }

  function render(busy: boolean) {
    if (!view) return null;
    const caseView = view;
    /** Who may record or resolve Discrepancies on the read Case. */
    function consistencyRoles(view: CaseView): ConsistencyRoles {
      const linked = linkedToAnyTeamVersion(
        view.timeline,
        actor.workspaceMembershipId,
      );
      return {
        manager: authority.manage,
        independentApprover: authority.approve && !linked,
        auditorOnTeam: authority.audit && linked,
      };
    }

    /** Records a manual Discrepancy; the server rechecks every rule. */
    function submitManual(event: FormEvent) {
      event.preventDefault();
      if (busy || blockedUntilReload(manualFeedback)) return;
      const { caseDetail: current, register } = caseView;
      if (current.status !== 'open') return;
      const check = manualFromDraft(manualDraft, register.items);
      if (check.status !== 'valid') {
        setManualFeedback(refusedWith('discrepancyValidation'));
        return;
      }
      void execute(
        'discrepancy',
        reuse(manualFeedback, {
          path: `/certification-cases/${encodeURIComponent(current.id)}/discrepancies`,
          body: JSON.stringify({
            expectedRevision: current.revision,
            ...check.body,
          }),
          caseId: current.id,
        }),
      );
    }

    /** Accepts a Discrepancy, or closes a manual one as corrected. */
    function submitResolution(event: FormEvent) {
      event.preventDefault();
      if (
        busy ||
        resolutionDraft === null ||
        blockedUntilReload(resolutionFeedback)
      )
        return;
      const { caseDetail: current, register, timeline } = caseView;
      const check = resolutionFromDraft(resolutionDraft, {
        attachments: register.items,
        versions: timeline.entries,
      });
      if (check.status !== 'valid') {
        setResolutionFeedback(
          refusedWith(
            check.status === 'reasonRequired'
              ? 'discrepancyReasonRequired'
              : 'discrepancyCorrectionRequired',
          ),
        );
        return;
      }
      void execute(
        'discrepancyResolution',
        reuse(resolutionFeedback, {
          path: `/certification-cases/${encodeURIComponent(current.id)}/discrepancy-resolutions`,
          body: JSON.stringify({
            expectedRevision: current.revision,
            ...check.body,
          }),
          caseId: current.id,
        }),
      );
    }

    /** The Dossier consistency region of the read Case. */
    function consistencySection(view: CaseView) {
      const roles = consistencyRoles(view);
      const formState = <Draft,>(
        kind: 'discrepancy' | 'discrepancyResolution',
        feedback: Feedback,
        draft: Draft,
      ) => ({
        draft,
        feedback: feedbackMessage(kind, feedback),
        saving: feedback.status === 'saving',
        describedBy: describedFeedback(kind, feedback),
      });
      const clearRefusal = (
        feedback: Feedback,
        set: (next: Feedback) => void,
      ) => {
        if (
          feedback.status === 'saved' ||
          (feedback.status === 'refused' && !feedback.reload)
        )
          set(IDLE);
      };
      return (
        <ConsistencyRegion
          prefix={prefix}
          detail={view.caseDetail}
          register={view.register}
          timeline={view.timeline}
          roles={roles}
          busy={busy}
          manual={{
            ...formState('discrepancy', manualFeedback, manualDraft),
            open: manualOpen,
          }}
          onManualOpen={(open) => {
            setManualOpen(open);
            if (!open) setManualDraft(emptyManualDraft());
            setManualFeedback(IDLE);
          }}
          onManualDraft={(draft) => {
            setManualDraft(draft);
            clearRefusal(manualFeedback, setManualFeedback);
          }}
          onManualSubmit={submitManual}
          resolution={formState(
            'discrepancyResolution',
            resolutionFeedback,
            resolutionDraft,
          )}
          onResolutionDraft={(draft) => {
            const reopened =
              draft === null ||
              draft.discrepancyId !== resolutionDraft?.discrepancyId ||
              draft.resolution !== resolutionDraft.resolution;
            setResolutionDraft(draft);
            if (reopened) setResolutionFeedback(IDLE);
            else clearRefusal(resolutionFeedback, setResolutionFeedback);
          }}
          onResolutionSubmit={submitResolution}
        />
      );
    }

    function exchangesSection(view: CaseView) {
      const roles = consistencyRoles(view);
      return exchangeRegister.render({
        prefix,
        busy,
        roles: {
          manager: authority.manage,
          contributor:
            roles.manager || roles.auditorOnTeam || roles.independentApprover,
        },
        administration: administersDeadlines ? (
          <DeadlineAdministration
            prefix={prefix}
            view={deadlines.view}
            feedback={deadlines.feedback}
            draft={deadlines.draft}
            busy={busy}
            onOpen={() => void deadlines.load()}
            onClose={deadlines.close}
            onReload={() => void deadlines.load()}
            onDraft={deadlines.editDraft}
            onSubmit={(event) => {
              event.preventDefault();
              void deadlines.save({ retry: false, busy });
            }}
            onRetry={() => void deadlines.save({ retry: true, busy })}
          />
        ) : null,
      });
    }
    return (
      <>
        {consistencySection(caseView)}
        {exchangesSection(caseView)}
      </>
    );
  }
  const feedback = [manualFeedback, resolutionFeedback];
  return {
    render,
    namedDiscrepancies,
    reset: () => {
      setManualOpen(false);
      setManualDraft(emptyManualDraft());
      setManualFeedback(IDLE);
      setResolutionDraft(null);
      setResolutionFeedback(IDLE);
      exchangeRegister.reset();
    },
    clearRefusals: () => {
      setManualFeedback(clearReloadedFeedback);
      setResolutionFeedback(clearReloadedFeedback);
    },
    prepareRead: (options: { reload?: boolean }) => {
      exchangePageOperation.retire();
      exchangeRegister.prepareRead(options);
    },
    retirePage: exchangePageOperation.retire,
    retireAccess: (except: ScopedOperation) => {
      if (exchangePageOperation !== except) exchangePageOperation.retire();
      deadlines.close();
    },
    saving:
      exchangeRegister.saving ||
      deadlines.feedback.status === 'saving' ||
      feedback.some((item) => item.status === 'saving'),
    saved:
      exchangeRegister.saved ||
      feedback.some((item) => item.status === 'saved'),
  };
}
