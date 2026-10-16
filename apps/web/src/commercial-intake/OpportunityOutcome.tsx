import { useState } from 'react';
import { useInterfaceLocale } from '../localization/interface-locale';
import { Select } from '../presentation/Select';
import { useOpportunityOutcomeCopy } from './opportunity-outcome.copy';
import {
  OPPORTUNITY_LOSS_REASON_CODES,
  continuesOutcomeHistory,
  outcomeTransitionInput,
  permittedOutcomeTransitions,
  type OpportunityOutcomeStatus,
  type OutcomeDraft,
  type OutcomeEdit,
  type OutcomeHistoryEntry,
  type OutcomeHistoryPage,
} from './opportunity-outcome';

export type OutcomeEditor = {
  edit: OutcomeEdit;
  current: OpportunityOutcomeStatus;
  /** Another Opportunity editor is open, so this one cannot start. */
  blocked: boolean;
  onOpen: () => void;
  onDraftChange: (draft: OutcomeDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onReload: () => void;
};

/**
 * The Request detail's outcome status control. The workspace owns its state
 * and command, so the other Opportunity editors' protections apply to it. It
 * offers only the transitions permitted from the current status and asks for
 * exactly the fields the chosen one requires.
 */
export function OpportunityOutcome({
  editor,
  pending,
}: {
  editor: OutcomeEditor;
  pending: boolean;
}) {
  const copy = useOpportunityOutcomeCopy();
  const { edit } = editor;
  switch (edit.kind) {
    case 'idle':
      return (
        <button
          type="button"
          className="commercial-intake-secondary-action"
          onClick={editor.onOpen}
          disabled={pending || editor.blocked}
        >
          {copy.changeOutcome}
        </button>
      );
    case 'conflict':
      return (
        <button type="button" onClick={editor.onReload} disabled={pending}>
          {copy.reloadRequest}
        </button>
      );
    case 'editing':
    case 'saving':
    case 'uncertain':
      return (
        <OutcomeForm
          editor={editor}
          kind={edit.kind}
          draft={edit.draft}
          pending={pending}
        />
      );
    default:
      return assertNeverOutcomeEdit(edit);
  }
}

function OutcomeForm({
  editor,
  kind,
  draft,
  pending,
}: {
  editor: OutcomeEditor;
  kind: 'editing' | 'saving' | 'uncertain';
  draft: OutcomeDraft;
  pending: boolean;
}) {
  const copy = useOpportunityOutcomeCopy();
  // An uncertain outcome keeps its payload for the explicit retry.
  const locked = kind !== 'editing';
  const input = draft.transition
    ? outcomeTransitionInput(draft.transition)
    : 'none';
  return (
    <form
      className="commercial-intake-outcome"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        editor.onSave();
      }}
    >
      <label htmlFor="commercial-intake-outcome-transition">
        {copy.outcomeTransition}
      </label>
      <Select
        id="commercial-intake-outcome-transition"
        value={draft.transition}
        placeholder={copy.outcomeSelectTransition}
        options={permittedOutcomeTransitions(editor.current).map(
          (transition) => ({
            value: transition,
            label: copy.outcomeTransitionLabels[transition],
          }),
        )}
        onValueChange={(value) => {
          const transition = permittedOutcomeTransitions(editor.current).find(
            (candidate) => candidate === value,
          );
          if (transition) editor.onDraftChange({ ...draft, transition });
        }}
        disabled={locked}
      />
      {input === 'reason' ? (
        <label>
          {copy.outcomeReason}
          <textarea
            value={draft.reason}
            onChange={(event) =>
              editor.onDraftChange({ ...draft, reason: event.target.value })
            }
            required
            maxLength={500}
            disabled={locked}
          />
        </label>
      ) : null}
      {input === 'loss' ? (
        <>
          <label htmlFor="commercial-intake-outcome-loss-reason">
            {copy.outcomeLossReason}
          </label>
          <Select
            id="commercial-intake-outcome-loss-reason"
            value={draft.lossReasonCode}
            placeholder={copy.outcomeSelectLossReason}
            options={OPPORTUNITY_LOSS_REASON_CODES.map((code) => ({
              value: code,
              label: copy.lossReasonLabels[code],
            }))}
            onValueChange={(value) => {
              const lossReasonCode = OPPORTUNITY_LOSS_REASON_CODES.find(
                (code) => code === value,
              );
              if (lossReasonCode)
                editor.onDraftChange({ ...draft, lossReasonCode });
            }}
            disabled={locked}
          />
          <label>
            {copy.outcomeNote}
            <textarea
              value={draft.note}
              onChange={(event) =>
                editor.onDraftChange({ ...draft, note: event.target.value })
              }
              maxLength={500}
              disabled={locked}
            />
          </label>
        </>
      ) : null}
      {kind === 'saving' ? <p role="status">{copy.outcomeSaving}</p> : null}
      <div className="commercial-intake-next-action-actions">
        <button
          type="submit"
          className="commercial-intake-primary-action"
          disabled={pending}
        >
          {kind === 'uncertain' ? copy.retryOutcome : copy.saveOutcome}
        </button>
        <button
          type="button"
          className="commercial-intake-secondary-action"
          onClick={editor.onCancel}
          disabled={kind === 'saving'}
        >
          {copy.cancelOutcome}
        </button>
      </div>
    </form>
  );
}

function assertNeverOutcomeEdit(edit: never): never {
  throw new Error(`Unexpected outcome edit state: ${JSON.stringify(edit)}`);
}

export type OlderOutcomeHistory = (
  cursor: string,
) => Promise<OutcomeHistoryPage | undefined>;

/**
 * The outcome history below the status: the newest page read with the
 * Request, then each older page on request. A remount keyed on the Opportunity
 * version retires pages read for an earlier version.
 */
export function OpportunityOutcomeHistory({
  page,
  loadOlder,
}: {
  page: OutcomeHistoryPage;
  loadOlder: OlderOutcomeHistory;
}) {
  const copy = useOpportunityOutcomeCopy();
  const { formatDateTime } = useInterfaceLocale();
  const [older, setOlder] = useState<{
    entries: OutcomeHistoryEntry[];
    nextCursor?: string;
    state: 'idle' | 'loading' | 'error';
  }>({ entries: [], nextCursor: page.nextCursor, state: 'idle' });
  const entries = [...page.entries, ...older.entries];
  const { nextCursor } = older;

  async function showOlder(cursor: string): Promise<void> {
    setOlder((current) => ({ ...current, state: 'loading' }));
    const result = await loadOlder(cursor);
    setOlder((current) =>
      result &&
      continuesOutcomeHistory(
        [...page.entries, ...current.entries],
        result.entries,
      )
        ? {
            entries: [...current.entries, ...result.entries],
            nextCursor: result.nextCursor,
            state: 'idle',
          }
        : { ...current, state: 'error' },
    );
  }

  return (
    <div className="commercial-intake-outcome-history">
      <h5>{copy.outcomeHistory}</h5>
      {entries.length === 0 ? (
        <p>{copy.outcomeHistoryEmpty}</p>
      ) : (
        <ol aria-label={copy.outcomeHistory}>
          {entries.map((entry) => (
            <li key={entry.version}>
              <strong>
                {copy.outcomeHistoryChange(
                  copy.opportunityStatusLabels[entry.previousStatus],
                  copy.opportunityStatusLabels[entry.newStatus],
                )}
              </strong>
              <small>
                <time dateTime={entry.changedAt}>
                  {formatDateTime(entry.changedAt)}
                </time>{' '}
                · {entry.actor.displayLabel}
              </small>
              {entry.lossReasonCode ? (
                <span>
                  {copy.outcomeLossReason}:{' '}
                  {copy.lossReasonLabels[entry.lossReasonCode]}
                </span>
              ) : null}
              {entry.reason !== null ? (
                <span>
                  {copy.outcomeReason}: {entry.reason}
                </span>
              ) : null}
              {entry.note !== null ? (
                <span>
                  {copy.outcomeHistoryNote}: {entry.note}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {older.state === 'loading' ? (
        <p role="status">{copy.outcomeHistoryOlderLoading}</p>
      ) : null}
      {older.state === 'error' ? (
        <p role="alert">{copy.outcomeHistoryOlderError}</p>
      ) : null}
      {nextCursor ? (
        <button
          type="button"
          disabled={older.state === 'loading'}
          onClick={() => void showOlder(nextCursor)}
        >
          {copy.outcomeHistoryOlder}
        </button>
      ) : null}
    </div>
  );
}
