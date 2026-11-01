import { useId, useRef, useState } from 'react';
import { opportunityFollowUpAuthority } from '../access/opportunity-follow-up-authority';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  followsDiscoveryRow,
  isCalendarDate,
  readFollowUpDiscovery,
  type FollowUpDiscoveryPage,
} from './follow-up-contract';
import { useFollowUpCopy } from './follow-up.copy';
import {
  useFollowUpLifetime,
  useFollowUpOwner,
  type FollowUpAccessProps,
  type FollowUpAuthority,
} from './follow-up-owner';
import './follow-up.css';

export type OpportunityFollowUpDiscoveryProps = FollowUpAccessProps & {
  clientProjectionAuthority: string;
  onOpenRequest: (requestId: string) => void;
  disabled: boolean;
};
type Discovery =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'denied' }
  | { kind: 'ready'; page: FollowUpDiscoveryPage };

export function OpportunityFollowUpDiscovery(
  props: OpportunityFollowUpDiscoveryProps,
) {
  const authority = opportunityFollowUpAuthority(props.actor);
  const generation = useFollowUpLifetime(
    props,
    JSON.stringify([
      authority?.key,
      props.clientProjectionAuthority,
      props.identity.loaded,
      props.identity.signedIn,
    ]),
  );
  if (!authority || !props.identity.loaded || !props.identity.signedIn)
    return null;
  return <DiscoveryOwner key={generation} {...props} authority={authority} />;
}

function DiscoveryOwner(
  props: OpportunityFollowUpDiscoveryProps & { authority: FollowUpAuthority },
) {
  const owner = useFollowUpOwner(props, props.authority);
  const copy = useFollowUpCopy();
  const { formatDate, formatDateTime } = useInterfaceLocale();
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [through, setThrough] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [state, setState] = useState<Discovery>({ kind: 'idle' });
  const positions = useRef(new Set<string>());
  const sequence = useRef(0);
  async function load(cursor?: string) {
    if (!isCalendarDate(through)) {
      setInvalid(true);
      return;
    }
    const generation = ++sequence.current;
    const previous =
      state.kind === 'ready' ? state.page.items.at(-1) : undefined;
    if (cursor !== undefined) positions.current.add(cursor);
    else positions.current.clear();
    setState({ kind: 'loading' });
    const result = await owner.request(
      `/commercial-intake/opportunity-follow-ups?through=${encodeURIComponent(through)}${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
    );
    if (
      !owner.isLive() ||
      sequence.current !== generation ||
      result.status === 'retired'
    )
      return;
    if (
      result.status === 'forbidden' ||
      result.status === 'unauthorized' ||
      result.status === 'notFound'
    ) {
      setState({ kind: 'denied' });
      return;
    }
    const page =
      result.status === 'ok' ? readFollowUpDiscovery(result.value) : undefined;
    const first = page?.items[0];
    if (
      !page ||
      page.through !== through ||
      (page.nextCursor !== null && positions.current.has(page.nextCursor)) ||
      (cursor !== undefined &&
        previous &&
        first &&
        !followsDiscoveryRow(previous, first))
    ) {
      setState({ kind: 'error' });
      return;
    }
    setState({ kind: 'ready', page });
    heading.current?.focus();
  }
  const loading = state.kind === 'loading';
  return (
    <section className="opportunity-follow-up" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} ref={heading} tabIndex={-1}>
        {copy('discovery')}
      </h3>
      <form
        noValidate
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          if (!props.disabled && !loading && state.kind !== 'denied')
            void load();
        }}
      >
        <label htmlFor={`${id}-through`}>{copy('through')}</label>
        <input
          id={`${id}-through`}
          type="text"
          value={through}
          aria-describedby={`${id}-hint${invalid ? ` ${id}-error` : ''}`}
          aria-invalid={invalid}
          disabled={props.disabled || state.kind === 'denied'}
          onChange={(event) => {
            sequence.current += 1;
            owner.retireRequest();
            positions.current.clear();
            setThrough(event.target.value);
            setInvalid(false);
            setState({ kind: 'idle' });
          }}
        />
        <p id={`${id}-hint`}>{copy('throughHint')}</p>
        {invalid ? (
          <p role="alert" id={`${id}-error`}>
            {copy('validation')}
          </p>
        ) : null}
        <button
          type="submit"
          className="commercial-intake-primary-action"
          disabled={props.disabled || loading || state.kind === 'denied'}
        >
          {copy('find')}
        </button>
      </form>
      {loading ? <p role="status">{copy('loading')}</p> : null}
      {state.kind === 'denied' ? <p role="alert">{copy('denied')}</p> : null}
      {state.kind === 'error' ? (
        <>
          <p role="alert">{copy('discoveryError')}</p>
          <button
            type="button"
            className="commercial-intake-secondary-action"
            disabled={props.disabled}
            onClick={() => void load()}
          >
            {copy('restart')}
          </button>
        </>
      ) : null}
      {state.kind === 'ready' ? (
        <>
          <p>{copy('pageNote')}</p>
          {state.page.items.length === 0 ? (
            <p>{copy('discoveryEmpty')}</p>
          ) : (
            <ul className="opportunity-follow-up-results">
              {state.page.items.map((row) => (
                <li key={row.opportunityId}>
                  <p className="opportunity-follow-up-literal">{row.title}</p>
                  {row.clientDisplayName !== undefined ? (
                    <p className="opportunity-follow-up-literal">
                      {row.clientDisplayName}
                    </p>
                  ) : null}
                  <time dateTime={row.followUpOn}>
                    {formatDate(row.followUpOn)}
                  </time>
                  <p className="opportunity-follow-up-literal">
                    {row.recordedBy.displayLabel}
                  </p>
                  <time dateTime={row.recordedAt}>
                    {formatDateTime(row.recordedAt)}
                  </time>
                  <button
                    type="button"
                    className="commercial-intake-secondary-action"
                    disabled={props.disabled}
                    onClick={() => props.onOpenRequest(row.requestId)}
                  >
                    {copy('openRequest')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {state.page.nextCursor !== null ? (
            <button
              type="button"
              className="commercial-intake-secondary-action"
              disabled={props.disabled}
              onClick={() => {
                if (state.page.nextCursor !== null)
                  void load(state.page.nextCursor);
              }}
            >
              {copy('next')}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
