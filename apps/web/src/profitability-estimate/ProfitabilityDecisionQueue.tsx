import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { useInterfaceLocale } from '../localization/interface-locale';
import { ProfitabilityEstimatePanel } from './ProfitabilityEstimatePanel';
import {
  profitabilityAuthority,
  profitabilityContextKey,
} from './profitability-contract';
import {
  parseDecisionQueue,
  type DecisionQueuePage,
  type DecisionQueueItem,
} from './profitability-decision-queue-response';
import { useDecisionQueueCopy } from './profitability-decision-queue.copy';
import './profitability-estimate.css';

type Props = Pick<
  ComponentProps<typeof ProfitabilityEstimatePanel>,
  | 'actor'
  | 'identity'
  | 'onCompanyContextRejected'
  | 'onActorRevalidated'
  | 'onWorkspaceAccessRejected'
>;
type View =
  | { kind: 'loading' | 'error' | 'denied' }
  | { kind: 'ready'; page: DecisionQueuePage };

export function ProfitabilityDecisionQueue(props: Props) {
  const generation = useRef({ identity: props.identity, n: 0 });
  if (generation.current.identity !== props.identity)
    generation.current = {
      identity: props.identity,
      n: generation.current.n + 1,
    };
  if (
    !props.identity.loaded ||
    !props.identity.signedIn ||
    !props.actor.activeCompany ||
    !profitabilityAuthority(props.actor).decide
  )
    return null;
  return (
    <QueueOwner
      key={`${profitabilityContextKey(props.actor)}:${generation.current.n}`}
      {...props}
      company={props.actor.activeCompany}
    />
  );
}
function QueueOwner(
  props: Props & { company: NonNullable<Props['actor']['activeCompany']> },
) {
  const copy = useDecisionQueueCopy();
  const { formatDateTime } = useInterfaceLocale();
  const id = useId();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [selected, setSelected] = useState<DecisionQueueItem>();
  const pending = useRef<AbortController | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const retire = useCallback(() => {
    pending.current?.abort();
    setView({ kind: 'denied' });
    setSelected(undefined);
  }, []);
  const load = useCallback(
    async (cursor: string | undefined, focus = false) => {
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      setView({ kind: 'loading' });
      setSelected(undefined);
      try {
        const api = await createAuthenticatedApiClient(
          callbacks.current.identity,
        );
        if (controller.signal.aborted) return;
        const result = await api.request<unknown>(
          `/profitability-estimate-decision-queue${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
          { companyContextId: props.company.id, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (
          result.status === 'unauthorized' ||
          result.status === 'forbidden' ||
          result.status === 'notFound'
        ) {
          setView({ kind: 'denied' });
          await handleAuthenticatedAccessRejection({
            result,
            identity: callbacks.current.identity,
            companyContextId: props.company.id,
            signal: controller.signal,
            onCompanyContextRejected:
              callbacks.current.onCompanyContextRejected,
            onActorRevalidated:
              callbacks.current.onActorRevalidated ?? (() => undefined),
            onWorkspaceAccessRejected:
              callbacks.current.onWorkspaceAccessRejected,
          });
          return;
        }
        if (result.status !== 'ok') {
          setView({ kind: 'error' });
          return;
        }
        setView({
          kind: 'ready',
          page: parseDecisionQueue(result.value, {
            workspaceId: props.actor.workspaceId,
            companyId: props.company.id,
          }),
        });
      } catch {
        if (!controller.signal.aborted) setView({ kind: 'error' });
      } finally {
        if (!controller.signal.aborted && focus) heading.current?.focus();
        if (pending.current === controller) pending.current = undefined;
      }
    },
    [props.actor.workspaceId, props.company.id],
  );
  const cursor = cursors.at(-1);
  useEffect(() => {
    void load(undefined);
    return () => pending.current?.abort();
  }, [load]);
  function move(next: (string | undefined)[]) {
    setCursors(next);
    void load(next.at(-1), true);
  }
  return (
    <section
      className="profitability-decision-queue"
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`} tabIndex={-1} ref={heading}>
        {copy.title}
      </h2>
      <p>{props.company.displayName}</p>
      <p>{copy.introduction}</p>
      {selected ? (
        <>
          <button type="button" onClick={() => void load(cursor, true)}>
            {copy.back}
          </button>
          <p>
            {selected.opportunityTitle} — {copy.version}{' '}
            {selected.versionNumber}
          </p>
          <ProfitabilityEstimatePanel
            {...props}
            opportunityId={selected.opportunityId}
            requestedVersionId={selected.versionId}
            onProtectedAccessRejected={retire}
          />
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={view.kind === 'loading'}
            onClick={() => move([undefined])}
          >
            {copy.refresh}
          </button>
          <p role="status">
            {copy.page} {cursors.length}
            {view.kind === 'loading' ? ` — ${copy.loading}` : ''}
          </p>
          {view.kind === 'error' || view.kind === 'denied' ? (
            <>
              <p role="alert">
                {view.kind === 'error' ? copy.error : copy.denied}
              </p>
              <button type="button" onClick={() => void load(cursor, true)}>
                {copy.retry}
              </button>
            </>
          ) : null}
          {view.kind === 'ready' ? (
            <>
              <p>{copy.loaded}</p>
              {view.page.items.length === 0 ? (
                <p>{copy.empty}</p>
              ) : (
                <ol className="profitability-history">
                  {view.page.items.map((item) => (
                    <li key={item.versionId}>
                      <strong>{item.opportunityTitle}</strong>
                      <p>
                        {copy.version} {item.versionNumber} —{' '}
                        {item.versionNumber === item.latestVersionNumber
                          ? copy.latest
                          : copy.earlier}
                      </p>
                      <p>
                        {copy.submitted}: {formatDateTime(item.createdAt)}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          heading.current?.focus();
                          setSelected(item);
                        }}
                      >
                        {copy.open} {item.versionNumber}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <div className="profitability-queue-pages">
                <button
                  type="button"
                  disabled={cursors.length < 2}
                  onClick={() => move(cursors.slice(0, -1))}
                >
                  {copy.previous}
                </button>
                <button
                  type="button"
                  disabled={!view.page.nextCursor}
                  onClick={() => {
                    if (view.page.nextCursor)
                      move([...cursors, view.page.nextCursor]);
                  }}
                >
                  {copy.next}
                </button>
              </div>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
