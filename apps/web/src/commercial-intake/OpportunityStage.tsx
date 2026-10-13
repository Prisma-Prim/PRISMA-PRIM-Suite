import { useState } from 'react';
import { formatApplicationDateTime } from '../presentation/date-time';
import { Select } from '../presentation/Select';
import { formatMessage } from '../localization/messages';
import { commercialIntakeCopy as copy } from './commercial-intake.copy';
import { useSalesStageCopy } from './sales-stage.copy';
import {
  continuesStageHistory,
  NO_STAGE_SELECTION,
  type RecordedSalesStage,
  type StageEdit,
  type StageHistoryEntry,
  type StageHistoryPage,
} from './sales-stage';

export type StageEditor = {
  edit: StageEdit;
  /** Another Opportunity editor is open, so this one cannot start. */
  blocked: boolean;
  onOpen: () => void;
  onSelect: (selection: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onReloadList: () => void;
  onReloadRequest: () => void;
};

/**
 * The Request detail's Sales Stage control (section 24.6). The workspace owns
 * its state and commands, so the one-open-editor rule and the section 16.6
 * protections apply to it as to the other Opportunity editors.
 */
export function OpportunityStage({
  editor,
  pending,
}: {
  editor: StageEditor;
  pending: boolean;
}) {
  const stageCopy = useSalesStageCopy();
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
          {stageCopy('changeStage')}
        </button>
      );
    case 'conflict':
      return (
        <button
          type="button"
          onClick={editor.onReloadRequest}
          disabled={pending}
        >
          {copy.reloadRequest}
        </button>
      );
    case 'loading':
    case 'load-error':
    case 'unavailable':
      return (
        <div className="commercial-intake-stage">
          {edit.kind === 'loading' ? (
            <p role="status">{stageCopy('stageListLoading')}</p>
          ) : null}
          <div className="commercial-intake-next-action-actions">
            {edit.kind === 'loading' ? null : (
              <button type="button" onClick={editor.onReloadList}>
                {stageCopy('stageReloadList')}
              </button>
            )}
            <button type="button" onClick={editor.onCancel}>
              {stageCopy('cancelStage')}
            </button>
          </div>
        </div>
      );
    case 'choosing':
    case 'saving':
    case 'uncertain': {
      const saving = edit.kind === 'saving';
      return (
        <form
          className="commercial-intake-stage"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            editor.onSave();
          }}
        >
          {edit.stages.length === 0 ? (
            <p>{stageCopy('stageNoneConfigured')}</p>
          ) : (
            <>
              <label htmlFor="commercial-intake-stage-choice">
                {stageCopy('stageChoice')}
              </label>
              <Select
                id="commercial-intake-stage-choice"
                value={edit.selection}
                options={[
                  { value: NO_STAGE_SELECTION, label: stageCopy('stageNone') },
                  ...edit.stages.map((stage) => ({
                    value: stage.id,
                    label: stage.label,
                  })),
                ]}
                onValueChange={editor.onSelect}
                disabled={saving || edit.kind === 'uncertain'}
              />
            </>
          )}
          {saving ? <p role="status">{stageCopy('stageSaving')}</p> : null}
          <div className="commercial-intake-next-action-actions">
            {edit.stages.length === 0 ? null : (
              <button
                type="submit"
                className="commercial-intake-primary-action"
                disabled={pending}
              >
                {edit.kind === 'uncertain'
                  ? stageCopy('retryStage')
                  : stageCopy('saveStage')}
              </button>
            )}
            <button
              type="button"
              className="commercial-intake-secondary-action"
              onClick={editor.onCancel}
              disabled={saving}
            >
              {stageCopy('cancelStage')}
            </button>
          </div>
        </form>
      );
    }
    default:
      return assertNeverStageEdit(edit);
  }
}

function assertNeverStageEdit(edit: never): never {
  throw new Error(`Unexpected Sales Stage edit state: ${JSON.stringify(edit)}`);
}

export type OlderStageHistory = (
  cursor: string,
) => Promise<StageHistoryPage | undefined>;

/**
 * The Sales Stage history: the newest page read with the Request, then each
 * older page on request. A remount keyed on the Opportunity version retires
 * pages read for an earlier version. Labels are those captured at the change.
 */
export function OpportunityStageHistory({
  page,
  loadOlder,
}: {
  page: StageHistoryPage;
  loadOlder: OlderStageHistory;
}) {
  const stageCopy = useSalesStageCopy();
  const stageLabel = (stage: RecordedSalesStage | null): string =>
    stage === null ? stageCopy('stageNone') : stage.label;
  const [older, setOlder] = useState<{
    entries: StageHistoryEntry[];
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
      continuesStageHistory(
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
      <h5>{stageCopy('stageHistory')}</h5>
      {entries.length === 0 ? (
        <p>{stageCopy('stageHistoryEmpty')}</p>
      ) : (
        <ol aria-label={stageCopy('stageHistory')}>
          {entries.map((entry) => (
            <li key={entry.version}>
              <strong>
                {formatMessage(stageCopy('stageHistoryChange'), {
                  previous: stageLabel(entry.previousStage),
                  next: stageLabel(entry.newStage),
                })}
              </strong>
              <small>
                <time dateTime={entry.changedAt}>
                  {formatApplicationDateTime(entry.changedAt)}
                </time>{' '}
                · {entry.actor.displayLabel}
              </small>
            </li>
          ))}
        </ol>
      )}
      {older.state === 'loading' ? (
        <p role="status">{stageCopy('stageHistoryOlderLoading')}</p>
      ) : null}
      {older.state === 'error' ? (
        <p role="alert">{stageCopy('stageHistoryOlderError')}</p>
      ) : null}
      {nextCursor ? (
        <button
          type="button"
          disabled={older.state === 'loading'}
          onClick={() => void showOlder(nextCursor)}
        >
          {stageCopy('stageHistoryOlder')}
        </button>
      ) : null}
    </div>
  );
}
