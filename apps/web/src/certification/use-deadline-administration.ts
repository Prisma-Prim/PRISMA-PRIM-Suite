import { useCallback, useLayoutEffect, useState } from 'react';
import { conflictCode, type ApiResult } from '../api/authenticated-api-client';
import {
  useScopedOperation,
  type ScopedOperation,
} from '../api/use-scoped-operation';
import {
  deadlinesFromDraft,
  draftFromDeadlines,
  parseDeadlineHistory,
  parseDeadlineSet,
  type DeadlineDraft,
} from './certification-exchanges';
import type {
  DeadlineAdministrationView,
  DeadlineFeedback,
} from './CertificationExchanges';

const path = '/certification-procedure-deadlines';

/** Reads or posts the deadline set in the caller's access scope. */
export type DeadlineQuery = (
  slot: ScopedOperation,
  signal: AbortSignal,
  path: string,
  post?: { body: string; key: string },
) => Promise<ApiResult<unknown>>;

/**
 * The Company's procedure deadline configuration for a member who assigns
 * the certification bundles, shared by the Case dossier and the Settings
 * console: the set and its history, a draft of the three values, and a save
 * of the next version whose unanswered request is retried with its key.
 */
export function useDeadlineAdministration({
  scope,
  enabled,
  query,
  onSaved,
}: Readonly<{
  scope: string;
  enabled: boolean;
  query: DeadlineQuery;
  onSaved: () => void;
}>) {
  const operation = useScopedOperation(JSON.stringify([scope, enabled]));
  const [view, setView] = useState<DeadlineAdministrationView>({
    status: 'closed',
  });
  const [draft, setDraft] = useState<DeadlineDraft>(() =>
    draftFromDeadlines(null),
  );
  const [feedback, setFeedback] = useState<DeadlineFeedback>({
    status: 'idle',
  });
  const close = useCallback(() => {
    operation.retire();
    setView({ status: 'closed' });
    setDraft(draftFromDeadlines(null));
    setFeedback({ status: 'idle' });
  }, [operation]);
  useLayoutEffect(() => {
    if (!enabled) close();
  }, [enabled, close]);

  /** Reads the Company's procedure deadline set and its history. */
  async function load() {
    const signal = operation.begin();
    if (!signal) return;
    setView({ status: 'loading' });
    setFeedback({ status: 'idle' });
    try {
      const result = await query(operation, signal, path);
      if (signal.aborted) return;
      if (result.status !== 'ok') {
        setView({
          status:
            result.status === 'forbidden' || result.status === 'unauthorized'
              ? 'denied'
              : 'unavailable',
        });
        return;
      }
      const history = parseDeadlineHistory(result.value);
      setView({ status: 'ready', history });
      setDraft(draftFromDeadlines(history.current));
    } catch {
      if (!signal.aborted) setView({ status: 'unavailable' });
    }
  }

  /**
   * Saves the next version of the deadline set. Only an unanswered save of
   * the same values is sent again unchanged, with its key.
   */
  async function save({ retry, busy }: { retry: boolean; busy: boolean }) {
    if (busy || view.status !== 'ready') return;
    const check = deadlinesFromDraft(draft, view.history.current?.version ?? 0);
    if (check.status !== 'valid') {
      setFeedback({ status: 'invalid' });
      return;
    }
    const body = JSON.stringify(check.body);
    const key =
      retry && feedback.status === 'uncertain' && feedback.body === body
        ? feedback.key
        : crypto.randomUUID();
    const signal = operation.begin();
    if (!signal) return;
    setFeedback({ status: 'saving', key, body });
    try {
      const result = await query(operation, signal, path, { body, key });
      if (signal.aborted) return;
      if (result.status === 'ok') {
        const saved = parseDeadlineSet(result.value);
        setFeedback({ status: 'saved', version: saved.version });
        const history = view.history;
        setView({
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
        onSaved();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'unauthorized') {
        setView({ status: 'denied' });
        setFeedback({ status: 'idle' });
      } else if (result.status === 'conflict')
        setFeedback({
          status:
            conflictCode(result) === 'CERTIFICATION_DEADLINES_UNCHANGED'
              ? 'unchanged'
              : 'stale',
        });
      else if (result.status === 'validation')
        setFeedback({ status: 'invalid' });
      else setFeedback({ status: 'uncertain', key, body });
    } catch {
      if (!signal.aborted) setFeedback({ status: 'uncertain', key, body });
    }
  }

  return {
    view,
    draft,
    feedback,
    load,
    save,
    close,
    /** Edits the draft; a definite outcome no longer applies to it. */
    editDraft: (next: DeadlineDraft) => {
      setDraft(next);
      if (
        feedback.status === 'invalid' ||
        feedback.status === 'unchanged' ||
        feedback.status === 'saved'
      )
        setFeedback({ status: 'idle' });
    },
  };
}
