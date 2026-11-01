import type { RefObject } from 'react';
import type { FollowUpHistoryEntry } from './follow-up-contract';
import { FollowUpFact } from './FollowUpFact';
import { useFollowUpCopy } from './follow-up.copy';

export type HistoryReadState = 'idle' | 'loading' | 'error' | 'changed';
export function FollowUpHistory({
  id,
  heading,
  entries,
  nextCursor,
  state,
  disabled,
  onOlder,
}: {
  id: string;
  heading: RefObject<HTMLHeadingElement | null>;
  entries: FollowUpHistoryEntry[];
  nextCursor: string | null;
  state: HistoryReadState;
  disabled: boolean;
  onOlder: (cursor: string) => void;
}) {
  const copy = useFollowUpCopy();
  return (
    <section aria-labelledby={id}>
      <h5 id={id} ref={heading} tabIndex={-1}>
        {copy('history')}
      </h5>
      {entries.length === 0 ? (
        <p>{copy('historyEmpty')}</p>
      ) : (
        <ol className="opportunity-follow-up-history">
          {entries.map((entry) => (
            <li key={entry.revision}>
              <p>{copy('before')}</p>
              <FollowUpFact fact={entry.before} />
              <p>{copy('after')}</p>
              <FollowUpFact fact={entry.after} />
              <p className="opportunity-follow-up-literal">
                {entry.reason === null ? copy('noReason') : entry.reason}
              </p>
            </li>
          ))}
        </ol>
      )}
      {state === 'changed' ? (
        <p role="alert">{copy('historyChanged')}</p>
      ) : null}
      {state === 'error' ? <p role="alert">{copy('historyError')}</p> : null}
      {state === 'loading' ? (
        <p role="status">{copy('historyLoading')}</p>
      ) : null}
      {nextCursor !== null ? (
        <button
          type="button"
          className="commercial-intake-secondary-action"
          disabled={disabled || state === 'changed'}
          onClick={() => onOlder(nextCursor)}
        >
          {copy('historyOlder')}
        </button>
      ) : entries.length > 0 ? (
        <p>{copy('historyEnd')}</p>
      ) : null}
    </section>
  );
}
