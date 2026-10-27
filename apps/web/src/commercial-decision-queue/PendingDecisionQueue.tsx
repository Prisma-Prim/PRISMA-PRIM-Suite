import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { useInterfaceLocale } from '../localization/interface-locale';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import './pending-decision-queue.css';

export type PendingDecisionContext = {
  actor: ActorContext;
  identity: BrowserIdentity;
  onCompanyContextRejected: (companyId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
};
type Row = {
  versionId: string;
  opportunityTitle: string;
  illustrativeReference: number;
  versionNumber: number;
  createdAt: string;
};
type Page<Item> = { items: Item[]; nextCursor?: string };
export type PendingDecisionCopy = Record<
  | 'title'
  | 'introduction'
  | 'empty'
  | 'laterEmpty'
  | 'loading'
  | 'error'
  | 'denied'
  | 'refresh'
  | 'retry'
  | 'next'
  | 'previous'
  | 'version'
  | 'reference'
  | 'submitted'
  | 'back'
  | 'page'
  | 'loaded',
  string
>;
type Props<Item extends Row> = PendingDecisionContext & {
  read: boolean;
  authorityKey: string;
  endpoint: '/offer-decision-queue' | '/contract-decision-queue';
  className: 'offer-decision-queue' | 'contract-decision-queue';
  copy: PendingDecisionCopy;
  parsePage: (value: unknown) => Page<Item>;
  renderVariant: (item: Item) => ReactNode;
  actionLabel: (item: Item) => string;
  renderSelected: (
    item: Item,
    reportProtectedWork: (locked: boolean) => void,
  ) => ReactNode;
};
type View<Item> =
  | { kind: 'loading' | 'error' | 'denied' }
  | { kind: 'ready'; page: Page<Item> };

export function PendingDecisionQueue<Item extends Row>(props: Props<Item>) {
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
    !props.read
  )
    return null;
  return (
    <QueueOwner
      key={`${props.authorityKey}:${generation.current.n}`}
      {...props}
      company={props.actor.activeCompany}
    />
  );
}
function QueueOwner<Item extends Row>(
  props: Props<Item> & {
    company: NonNullable<PendingDecisionContext['actor']['activeCompany']>;
  },
) {
  const { copy } = props;
  const { formatDateTime } = useInterfaceLocale();
  const id = useId();
  const [view, setView] = useState<View<Item>>({ kind: 'loading' });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [selected, setSelected] = useState<Item>();
  const [protectedWork, setProtectedWork] = useState(false);
  const protectedRef = useRef(false);
  const reportProtectedWork = useCallback((locked: boolean) => {
    protectedRef.current = locked;
    setProtectedWork(locked);
  }, []);
  const pending = useRef<AbortController | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const load = useCallback(
    async (cursor: string | undefined, focus = false) => {
      if (protectedRef.current) return;
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
          `${props.endpoint}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
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
          page: callbacks.current.parsePage(result.value),
        });
      } catch {
        if (!controller.signal.aborted) setView({ kind: 'error' });
      } finally {
        if (!controller.signal.aborted && focus) heading.current?.focus();
        if (pending.current === controller) pending.current = undefined;
      }
    },
    [props.actor.workspaceId, props.company.id, props.endpoint],
  );
  const cursor = cursors.at(-1);
  useEffect(() => {
    void load(undefined);
    return () => pending.current?.abort();
  }, [load]);
  function move(next: (string | undefined)[]) {
    if (protectedRef.current) return;
    setCursors(next);
    void load(next.at(-1), true);
  }
  return (
    <section
      className={`pending-decision-queue ${props.className}`}
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`} tabIndex={-1} ref={heading}>
        {copy.title}
      </h2>
      <p>{props.company.displayName}</p>
      <p>{copy.introduction}</p>
      {selected ? (
        <>
          <button
            type="button"
            disabled={protectedWork}
            onClick={() => move([undefined])}
          >
            {copy.back}
          </button>
          <p>
            {selected.opportunityTitle} — {copy.version}{' '}
            {selected.versionNumber}
          </p>
          {props.renderSelected(selected, reportProtectedWork)}
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
                <p>{cursors.length > 1 ? copy.laterEmpty : copy.empty}</p>
              ) : (
                <ol className="decision-queue-items">
                  {view.page.items.map((item) => (
                    <li key={item.versionId}>
                      <strong>{item.opportunityTitle}</strong>
                      <p>
                        {copy.reference} {item.illustrativeReference} —{' '}
                        {copy.version} {item.versionNumber}
                      </p>
                      {props.renderVariant(item)}
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
                        {props.actionLabel(item)}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <div className="decision-queue-pages">
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
