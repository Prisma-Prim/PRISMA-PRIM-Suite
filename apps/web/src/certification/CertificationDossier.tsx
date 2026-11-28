import { useCallback, useLayoutEffect, useState, type FormEvent } from 'react';
import { conflictCode } from '../api/authenticated-api-client';
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
import {
  deadlinesFromDraft,
  draftFromDeadlines,
  parseDeadlineHistory,
  parseDeadlineSet,
  type DeadlineDraft,
} from './certification-exchanges';
import {
  DeadlineAdministration,
  type DeadlineAdministrationView,
  type DeadlineFeedback,
} from './CertificationExchanges';

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
  const deadlineOperation = useScopedOperation(
    JSON.stringify([scope, administersDeadlines]),
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
  const [deadlineView, setDeadlineView] = useState<DeadlineAdministrationView>({
    status: 'closed',
  });
  const [deadlineDraft, setDeadlineDraft] = useState<DeadlineDraft>(() =>
    draftFromDeadlines(null),
  );
  const [deadlineFeedback, setDeadlineFeedback] = useState<DeadlineFeedback>({
    status: 'idle',
  });
  const closeDeadlines = useCallback(() => {
    deadlineOperation.retire();
    setDeadlineView({ status: 'closed' });
    setDeadlineDraft(draftFromDeadlines(null));
    setDeadlineFeedback({ status: 'idle' });
  }, [deadlineOperation]);
  useLayoutEffect(() => {
    if (!administersDeadlines) closeDeadlines();
  }, [administersDeadlines, closeDeadlines]);
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

  /**
   * The Dossier Consistency Check, then the exchange register; the Clarté
   * Case page shows each as its own register.
   */
  function render(
    busy: boolean,
    part: 'consistency' | 'exchanges' | 'all' = 'all',
  ) {
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

    /** Reads the Company's procedure deadline set and its history. */
    async function loadDeadlines() {
      const signal = deadlineOperation.begin();
      if (!signal) return;
      setDeadlineView({ status: 'loading' });
      setDeadlineFeedback({ status: 'idle' });
      try {
        const result = await query(
          deadlineOperation,
          signal,
          '/certification-procedure-deadlines',
          undefined,
          'administration',
        );
        if (signal.aborted) return;
        if (result.status !== 'ok') {
          setDeadlineView({
            status:
              result.status === 'forbidden' || result.status === 'unauthorized'
                ? 'denied'
                : 'unavailable',
          });
          return;
        }
        const history = parseDeadlineHistory(result.value);
        setDeadlineView({ status: 'ready', history });
        setDeadlineDraft(draftFromDeadlines(history.current));
      } catch {
        if (!signal.aborted) setDeadlineView({ status: 'unavailable' });
      }
    }

    /**
     * Saves the next version of the deadline set. An unanswered request is
     * retried with the same key; the Case then reads the new states.
     */
    async function saveDeadlines(retry: boolean) {
      if (busy || deadlineView.status !== 'ready') return;
      const check = deadlinesFromDraft(
        deadlineDraft,
        deadlineView.history.current?.version ?? 0,
      );
      if (check.status !== 'valid') {
        setDeadlineFeedback({ status: 'invalid' });
        return;
      }
      const body = JSON.stringify(check.body);
      // Only an unanswered save of the same values is sent again unchanged.
      const key =
        retry &&
        deadlineFeedback.status === 'uncertain' &&
        deadlineFeedback.body === body
          ? deadlineFeedback.key
          : crypto.randomUUID();
      const signal = deadlineOperation.begin();
      if (!signal) return;
      setDeadlineFeedback({ status: 'saving', key, body });
      try {
        const result = await query(
          deadlineOperation,
          signal,
          '/certification-procedure-deadlines',
          { body, key },
          'administration',
        );
        if (signal.aborted) return;
        if (result.status === 'ok') {
          const saved = parseDeadlineSet(result.value);
          setDeadlineFeedback({ status: 'saved', version: saved.version });
          const history = deadlineView.history;
          setDeadlineView({
            status: 'ready',
            history: {
              current: saved,
              history: [
                saved,
                ...history.history.filter(
                  (entry) => entry.version !== saved.version,
                ),
              ],
            },
          });
          reload(caseView.caseDetail.id);
          return;
        }
        if (result.status === 'forbidden' || result.status === 'unauthorized') {
          setDeadlineView({ status: 'denied' });
          setDeadlineFeedback({ status: 'idle' });
        } else if (result.status === 'conflict')
          setDeadlineFeedback({
            status:
              conflictCode(result) === 'CERTIFICATION_DEADLINES_UNCHANGED'
                ? 'unchanged'
                : 'stale',
          });
        else if (result.status === 'validation')
          setDeadlineFeedback({ status: 'invalid' });
        else setDeadlineFeedback({ status: 'uncertain', key, body });
      } catch {
        if (!signal.aborted)
          setDeadlineFeedback({ status: 'uncertain', key, body });
      }
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
            view={deadlineView}
            feedback={deadlineFeedback}
            draft={deadlineDraft}
            busy={busy}
            onOpen={() => void loadDeadlines()}
            onClose={closeDeadlines}
            onReload={() => void loadDeadlines()}
            onDraft={(draft) => {
              setDeadlineDraft(draft);
              if (
                deadlineFeedback.status === 'invalid' ||
                deadlineFeedback.status === 'unchanged' ||
                deadlineFeedback.status === 'saved'
              )
                setDeadlineFeedback({ status: 'idle' });
            }}
            onSubmit={(event) => {
              event.preventDefault();
              void saveDeadlines(false);
            }}
            onRetry={() => void saveDeadlines(true)}
          />
        ) : null,
      });
    }
    return (
      <>
        {part !== 'exchanges' && consistencySection(caseView)}
        {part !== 'consistency' && exchangesSection(caseView)}
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
      closeDeadlines();
    },
    saving:
      exchangeRegister.saving ||
      deadlineFeedback.status === 'saving' ||
      feedback.some((item) => item.status === 'saving'),
    saved:
      exchangeRegister.saved ||
      feedback.some((item) => item.status === 'saved'),
  };
}
