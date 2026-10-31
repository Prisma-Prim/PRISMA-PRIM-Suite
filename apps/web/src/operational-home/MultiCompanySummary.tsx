import { useEffect, useId, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  createMultiCompanySummaryReader,
  type MultiCompanySummaryDestination,
  type MultiCompanySummaryRow,
  type MultiCompanySummaryState,
} from './multi-company-summary-contract';
import { useMultiCompanySummaryCopy } from './multi-company-summary.copy';
import { useOperationalHomeCopy } from './operational-home-localized.copy';
import './multi-company-summary.css';

type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  onContinue: (
    destination: MultiCompanySummaryDestination,
  ) => Promise<'opened' | 'not-opened'>;
  onCancelNavigation: () => void;
  onWorkspaceAccessRejected: () => void;
};
type Reader = ReturnType<typeof createMultiCompanySummaryReader>;
type ReadyRow = Extract<MultiCompanySummaryRow, { kind: 'ready' }>;
type Choice = {
  row: ReadyRow;
  kind: MultiCompanySummaryDestination['kind'];
  state: 'confirm' | 'pending' | 'failed';
};

/** App additionally keys this owner by session and all consumed captured authority. */
export function MultiCompanySummary(props: Props) {
  const [browserScope, setBrowserScope] = useState({
    identity: props.identity,
    generation: 0,
  });
  if (browserScope.identity !== props.identity) {
    // Retire the previous identity's subtree before committing a render with
    // the new identity, even while its Actor projection is still unchanged.
    setBrowserScope({
      identity: props.identity,
      generation: browserScope.generation + 1,
    });
    return null;
  }
  const scope = JSON.stringify([
    props.actor.internalUserId,
    props.actor.workspaceId,
    props.actor.workspaceMembershipId,
    props.actor.workspacePermissions,
    props.actor.activeCompany,
  ]);
  return (
    <SummaryRegion key={`${browserScope.generation}:${scope}`} {...props} />
  );
}

function SummaryRegion({
  actor,
  identity,
  onContinue,
  onCancelNavigation,
  onWorkspaceAccessRejected,
}: Props) {
  const { message: m, format } = useMultiCompanySummaryCopy();
  const ordinary = useOperationalHomeCopy();
  const { formatDate, formatNumber } = useInterfaceLocale();
  const id = useId();
  const [state, setState] = useState<MultiCompanySummaryState | 'closed'>(
    'closed',
  );
  const [choice, setChoice] = useState<Choice>();
  const choiceRef = useRef<Choice | undefined>(undefined);
  const reader = useRef<Reader | undefined>(undefined);
  const opener = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const chosenAction = useRef<HTMLButtonElement | undefined>(undefined);
  const confirmation = useRef<HTMLHeadingElement>(null);
  const focusOpener = useRef(false);
  const focusRegion = useRef(false);
  const navigation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      navigation.current += 1;
      reader.current?.dispose();
      reader.current = undefined;
      // An intentional Company switch remounts this owner. Its checked parent
      // continuation must survive that switch; unmount is not a user Cancel.
    };
  }, [identity]);
  useEffect(() => {
    if (state === 'closed' && focusOpener.current) {
      focusOpener.current = false;
      opener.current?.focus();
    }
    if (state !== 'closed' && focusRegion.current) {
      focusRegion.current = false;
      heading.current?.focus();
    }
  }, [state]);
  useEffect(() => {
    if (choice?.state === 'confirm') confirmation.current?.focus();
  }, [choice]);

  function clearChoice(restoreFocus: boolean) {
    navigation.current += 1;
    choiceRef.current = undefined;
    setChoice(undefined);
    onCancelNavigation();
    if (restoreFocus && chosenAction.current?.isConnected)
      chosenAction.current.focus();
  }
  function open() {
    reader.current?.dispose();
    const owned = createMultiCompanySummaryReader({
      actor,
      identity,
      onWorkspaceAccessRejected,
      onChange(next) {
        if (!mounted.current) return;
        const staged = choiceRef.current;
        if (
          staged &&
          (next.kind !== 'ready' || !next.rows.includes(staged.row))
        ) {
          if (
            confirmation.current?.parentElement?.contains(
              document.activeElement,
            )
          )
            focusRegion.current = true;
          clearChoice(false);
        }
        setState(next);
      },
    });
    reader.current = owned;
    void owned.refresh();
  }
  function close() {
    clearChoice(false);
    reader.current?.dispose();
    reader.current = undefined;
    focusOpener.current = true;
    focusRegion.current = false;
    setState('closed');
  }
  function refresh() {
    clearChoice(false);
    void reader.current?.refresh();
  }
  async function proceed() {
    const staged = choiceRef.current;
    if (!staged || staged.state === 'pending') return;
    const pending = { ...staged, state: 'pending' } satisfies Choice;
    choiceRef.current = pending;
    setChoice(pending);
    const request = ++navigation.current;
    let result: 'opened' | 'not-opened' = 'not-opened';
    try {
      result = await onContinue({
        companyId: staged.row.company.id,
        kind: staged.kind,
      });
    } catch {
      /* The normal selection owner retains recovery and privacy semantics. */
    }
    if (!mounted.current || navigation.current !== request) return;
    if (result === 'not-opened') {
      const failed = { ...staged, state: 'failed' } satisfies Choice;
      choiceRef.current = failed;
      setChoice(failed);
    } else {
      choiceRef.current = undefined;
      setChoice(undefined);
    }
  }

  const visibleRows =
    state !== 'closed' && state.kind === 'ready'
      ? state.rows.filter((row) => row.kind !== 'omitted')
      : [];
  return (
    <div className="multi-company-summary-entry">
      <button
        ref={opener}
        type="button"
        onClick={open}
        disabled={state !== 'closed'}
      >
        {m('title')}
      </button>
      {state !== 'closed' && (
        <section
          className="multi-company-summary"
          aria-labelledby={`${id}-title`}
        >
          <header className="multi-company-summary-heading">
            <div>
              <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>
                {m('title')}
              </h2>
              <p>
                {format('note', {
                  workspace: actor.workspaceName,
                  company: actor.activeCompany?.displayName ?? '',
                })}
              </p>
            </div>
            <div className="multi-company-summary-actions">
              <button type="button" onClick={refresh}>
                {m('refresh')}
              </button>
              <button type="button" onClick={close}>
                {m('close')}
              </button>
            </div>
          </header>
          {state.kind === 'loading' && <p role="status">{m('loading')}</p>}
          {(state.kind === 'error' || state.kind === 'denied') && (
            <div>
              <p role="alert">{m(state.kind)}</p>
              <button type="button" onClick={refresh}>
                {m('retry')}
              </button>
            </div>
          )}
          {state.kind === 'ready' && (
            <>
              {state.visibility === 'error' && (
                <p role="alert">{m('visibilityError')}</p>
              )}
              {visibleRows.length === 0 && state.visibility === 'current' && (
                <p role="status">{m('empty')}</p>
              )}
              <div className="multi-company-summary-rows">
                {visibleRows.map((row, index) => (
                  <section
                    key={row.company.id}
                    className="multi-company-summary-row"
                    aria-labelledby={`${id}-company-${index}`}
                  >
                    <h3 id={`${id}-company-${index}`}>
                      {row.company.displayName}
                    </h3>
                    {row.kind === 'ready' ? (
                      <>
                        <p>{format('date', { date: formatDate(row.today) })}</p>
                        <div className="multi-company-summary-cards">
                          {row.summaries.map((summary) => {
                            const description =
                              ordinary.summaries[summary.kind];
                            return (
                              <button
                                key={summary.kind}
                                type="button"
                                aria-label={format('card', {
                                  company: row.company.displayName,
                                  label: description.label,
                                  count: formatNumber(summary.count),
                                  destination: description.destination,
                                })}
                                onClick={(event) => {
                                  clearChoice(false);
                                  chosenAction.current = event.currentTarget;
                                  const selected = {
                                    row,
                                    kind: summary.kind,
                                    state: 'confirm',
                                  } satisfies Choice;
                                  choiceRef.current = selected;
                                  setChoice(selected);
                                }}
                              >
                                <span>{description.label}</span>
                                <strong>{formatNumber(summary.count)}</strong>
                                <span>
                                  {description.definition({
                                    company: row.company.displayName,
                                    today: formatDate(row.today),
                                  })}
                                </span>
                                <span>{description.destination}</span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : row.kind === 'error' ? (
                      <>
                        <p role="alert">{m('rowError')}</p>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              choiceRef.current?.row.company.id ===
                              row.company.id
                            )
                              clearChoice(false);
                            reader.current?.retry(row.company.id);
                          }}
                        >
                          {format('retryCompany', {
                            company: row.company.displayName,
                          })}
                        </button>
                      </>
                    ) : (
                      <p role="status">
                        {m(
                          row.kind === 'qualifying'
                            ? 'qualifying'
                            : 'loadingRow',
                        )}
                      </p>
                    )}
                  </section>
                ))}
              </div>
            </>
          )}
          {choice && (
            <section
              role="dialog"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  clearChoice(true);
                }
              }}
              aria-labelledby={`${id}-confirmation`}
              className="multi-company-summary-confirmation"
            >
              <h3 id={`${id}-confirmation`} ref={confirmation} tabIndex={-1}>
                {m('confirmation')}
              </h3>
              <p>
                {format('confirmationNote', {
                  destination: ordinary.summaries[choice.kind].destination,
                  company: choice.row.company.displayName,
                })}
              </p>
              {choice.state === 'pending' && (
                <p role="status">{m('continuing')}</p>
              )}
              {choice.state === 'failed' && (
                <p role="alert">{m('selectionFailed')}</p>
              )}
              <div className="multi-company-summary-actions">
                <button
                  type="button"
                  disabled={choice.state === 'pending'}
                  onClick={() => {
                    void proceed();
                  }}
                >
                  {m('continue')}
                </button>
                <button type="button" onClick={() => clearChoice(true)}>
                  {m('cancel')}
                </button>
              </div>
            </section>
          )}
        </section>
      )}
    </div>
  );
}
