import { useState } from 'react';
import {
  catalogue,
  history,
  readVersion,
  type PlanVersion,
} from './mission-plan-response';
import { useMissionPlanRead, type PlanContext } from './use-mission-plan-io';
import { useMissionPlanCopy } from './mission-plan.copy';
import { useInterfaceLocale } from '../localization/interface-locale';
export function MissionPlanPicker({
  context,
  disabled,
  onSelected,
}: {
  context: PlanContext;
  disabled: boolean;
  onSelected: (version: PlanVersion) => void;
}) {
  const c = useMissionPlanCopy(),
    { formatNumber } = useInterfaceLocale();
  const [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<{
      planId: string;
      versionId: string;
    } | null>(null),
    [historyPlan, setHistoryPlan] = useState<string | null>(null);
  const read = useMissionPlanRead(
    context,
    '/mission-plans' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
    (v) => catalogue(v, context.authority),
  );
  return (
    <div className="mission-plan-picker">
      <fieldset disabled={disabled}>
        <legend>{c('heading')}</legend>
        <button type="button" onClick={read.load}>
          {c('refresh')}
        </button>
        {cursor && (
          <button type="button" onClick={() => setCursor(null)}>
            {c('first')}
          </button>
        )}
        <PlanReadStatus state={read.state.kind} />
        {read.state.kind === 'ready' && (
          <>
            {read.state.value.items.length === 0 && <p>{c('empty')}</p>}
            <ul>
              {read.state.value.items.map((item) => (
                <li key={item.planId}>
                  <span>
                    {item.head.title} · {c('version')}{' '}
                    {formatNumber(item.head.versionNumber)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected({
                        planId: item.planId,
                        versionId: item.head.id,
                      })
                    }
                  >
                    {c('inspect')}: {item.head.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryPlan(item.planId)}
                  >
                    {c('history')}: {item.head.title}
                  </button>
                </li>
              ))}
            </ul>
            {read.state.value.next && (
              <button
                type="button"
                onClick={() => {
                  if (read.state.kind === 'ready')
                    setCursor(read.state.value.next);
                }}
              >
                {c('next')}
              </button>
            )}
          </>
        )}
        {historyPlan && (
          <VersionHistory
            key={historyPlan}
            context={context}
            planId={historyPlan}
            onSelect={(versionId) =>
              setSelected({ planId: historyPlan, versionId })
            }
          />
        )}
        {selected && (
          <ExactSelection
            key={`${selected.planId}:${selected.versionId}`}
            context={context}
            selected={selected}
            onSelected={onSelected}
          />
        )}
      </fieldset>
    </div>
  );
}
function ExactSelection({
  context,
  selected,
  onSelected,
}: {
  context: PlanContext;
  selected: { planId: string; versionId: string };
  onSelected: (v: PlanVersion) => void;
}) {
  const read = useMissionPlanRead(
    context,
    `/mission-plans/${selected.planId}/versions/${selected.versionId}`,
    (value) => {
      const version = readVersion(value, context.authority);
      if (
        version.planId !== selected.planId ||
        version.id !== selected.versionId
      )
        throw new Error('Unexpected selected Version.');
      return version;
    },
  );
  const c = useMissionPlanCopy();
  // Selection is explicit after the complete exact source was validated.
  return (
    <>
      <button type="button" onClick={read.load}>
        {c('retryVersion')}
      </button>
      <PlanReadStatus state={read.state.kind} />
      {read.state.kind === 'ready' && (
        <button
          type="button"
          onClick={() => {
            if (read.state.kind === 'ready') onSelected(read.state.value);
          }}
        >
          {c('inspect')}: {read.state.value.title} · {c('version')}{' '}
          {read.state.value.versionNumber}
        </button>
      )}
    </>
  );
}
function VersionHistory({
  context,
  planId,
  onSelect,
}: {
  context: PlanContext;
  planId: string;
  onSelect: (id: string) => void;
}) {
  const [before, setBefore] = useState<string | undefined>(undefined),
    c = useMissionPlanCopy(),
    { formatNumber } = useInterfaceLocale();
  const read = useMissionPlanRead(
    context,
    `/mission-plans/${planId}/versions` +
      (before ? '?beforeVersion=' + before : ''),
    (v) => history(v, context.authority, planId, before),
  );
  return (
    <div>
      <h4>{c('history')}</h4>
      <button
        type="button"
        onClick={() => {
          if (before) setBefore(undefined);
          else read.load();
        }}
      >
        {c('refresh')}
      </button>
      <PlanReadStatus state={read.state.kind} />
      {read.state.kind === 'ready' && (
        <>
          {read.state.value.items.length === 0 && <p>{c('empty')}</p>}
          <ul>
            {read.state.value.items.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => onSelect(v.id)}>
                  {c('version')} {formatNumber(v.versionNumber)} · {v.title}
                </button>
              </li>
            ))}
          </ul>
          {read.state.value.next && (
            <button
              type="button"
              onClick={() => {
                if (read.state.kind === 'ready')
                  setBefore(read.state.value.next ?? undefined);
              }}
            >
              {c('next')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
export function PlanReadStatus({ state }: { state: string }) {
  const c = useMissionPlanCopy();
  switch (state) {
    case 'loading':
      return <p role="status">{c('loading')}</p>;
    case 'error':
    case 'denied':
    case 'missing':
      return <p role="alert">{c(state)}</p>;
    default:
      return null;
  }
}
