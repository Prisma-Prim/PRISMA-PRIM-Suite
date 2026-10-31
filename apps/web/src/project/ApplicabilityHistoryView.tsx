import { useEffect, useRef } from 'react';
import { ApplicabilityFactView } from './ApplicabilityFactView';
import { useMissionApplicabilityCopy } from './mission-applicability.copy';
import type { useApplicabilityHistory } from './use-applicability-history';

export function ApplicabilityHistoryView({
  history,
}: {
  history: ReturnType<typeof useApplicabilityHistory>;
}) {
  const copy = useMissionApplicabilityCopy(),
    heading = useRef<HTMLHeadingElement>(null),
    target = useRef<HTMLHeadingElement>(null),
    inspection = history.inspection;
  useEffect(() => {
    if (
      inspection.kind !== 'found' ||
      !inspection.context.valid() ||
      !inspection.requestFocus
    )
      return;
    const active = document.activeElement;
    if (
      active !== inspection.focusFrom &&
      !(active === document.body && !inspection.focusFrom.isConnected)
    )
      return;
    if (
      inspection.context.valid() &&
      target.current?.isConnected &&
      !target.current.closest('[hidden]')
    )
      target.current.focus();
  }, [inspection]);
  function close() {
    if (inspection.kind === 'closed') return;
    const context = inspection.context,
      destination = context.returnTo;
    history.close();
    if (!context.scopeValid()) return;
    if (destination.isConnected && !destination.closest('[hidden]'))
      destination.focus();
    else if (
      heading.current?.isConnected &&
      !heading.current.closest('[hidden]')
    )
      heading.current.focus();
  }
  return (
    <section aria-label={copy('history')}>
      <h5 ref={heading} tabIndex={-1}>
        {copy('history')}
      </h5>
      {history.state.kind === 'loading' && (
        <p role="status">{copy('historyLoading')}</p>
      )}
      {history.state.kind === 'error' && (
        <p role="alert">{copy('historyError')}</p>
      )}
      {history.state.kind === 'unavailable' && <p>{copy('unavailable')}</p>}
      {inspection.kind !== 'closed' && (
        <section aria-label={copy('relationInspection')}>
          <h6 ref={target} tabIndex={-1}>
            {copy('relationInspection')}
          </h6>
          <p>{copy('relationOrigin')}</p>
          <ApplicabilityFactView
            fact={inspection.context.origin}
            knownFacts={history.knownFacts}
          />
          {inspection.kind === 'reading' && (
            <p role="status">{copy('relationLoading')}</p>
          )}
          {inspection.kind === 'more' && <p>{copy('relationContinue')}</p>}
          {inspection.kind === 'unverified' && (
            <p role="alert">{copy('relationUnverified')}</p>
          )}
          {inspection.kind === 'error' && (
            <p role="alert">{copy('relationError')}</p>
          )}
          {inspection.kind === 'found' && (
            <ApplicabilityFactView
              fact={inspection.target}
              knownFacts={history.knownFacts}
              onInspect={history.inspect}
            />
          )}
          {(inspection.kind === 'more' || inspection.kind === 'error') && (
            <button
              type="button"
              onClick={(event) =>
                history.continueInspection(event.currentTarget)
              }
            >
              {copy(inspection.kind === 'error' ? 'retry' : 'olderRelated')}
            </button>
          )}
          <button type="button" onClick={close}>
            {copy('closeInspection')}
          </button>
        </section>
      )}
      {history.page && (
        <>
          {history.page.facts.length === 0 && <p>{copy('historyEmpty')}</p>}
          {history.page.facts.map((fact) => (
            <ApplicabilityFactView
              key={fact.id}
              fact={fact}
              knownFacts={history.knownFacts}
              onInspect={history.inspect}
            />
          ))}
          <button type="button" onClick={() => void history.loadPage()}>
            {copy('newest')}
          </button>
          {history.page.nextBeforeRevision !== null && (
            <button
              type="button"
              onClick={() =>
                void history.loadPage(
                  history.page?.nextBeforeRevision ?? undefined,
                )
              }
            >
              {copy('older')}
            </button>
          )}
        </>
      )}
    </section>
  );
}
