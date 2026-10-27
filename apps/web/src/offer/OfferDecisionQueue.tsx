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
import { OfferPanel } from './OfferPanel';
import { offerDecisionQueueAuthority } from './offer-decision-queue-authority';
import {
  parseOfferDecisionQueue,
  type OfferDecisionQueuePage,
  type OfferDecisionQueueItem,
} from './offer-decision-queue-response';
import { useOfferDecisionQueueCopy } from './offer-decision-queue.copy';
import './offer-decision-queue.css';

type Props = Pick<
  ComponentProps<typeof OfferPanel>,
  | 'actor'
  | 'identity'
  | 'onCompanyContextRejected'
  | 'onActorRevalidated'
  | 'onWorkspaceAccessRejected'
>;
type View =
  | { kind: 'loading' | 'error' | 'denied' }
  | { kind: 'ready'; page: OfferDecisionQueuePage };

export function OfferDecisionQueue(props: Props) {
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
    !offerDecisionQueueAuthority(props.actor).read
  )
    return null;
  return (
    <QueueOwner
      key={`${offerDecisionQueueAuthority(props.actor).key}:${generation.current.n}`}
      {...props}
      company={props.actor.activeCompany}
    />
  );
}
function QueueOwner(
  props: Props & { company: NonNullable<Props['actor']['activeCompany']> },
) {
  const copy = useOfferDecisionQueueCopy();
  const { formatDateTime } = useInterfaceLocale();
  const id = useId();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [selected, setSelected] = useState<OfferDecisionQueueItem>();
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
          `/offer-decision-queue${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
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
          page: parseOfferDecisionQueue(result.value, {
            workspaceId: props.actor.workspaceId,
            companyId: props.company.id,
            modelDecision: offerDecisionQueueAuthority(callbacks.current.actor)
              .modelDecision,
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
    if (protectedRef.current) return;
    setCursors(next);
    void load(next.at(-1), true);
  }
  return (
    <section className="offer-decision-queue" aria-labelledby={`${id}-title`}>
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
          <OfferPanel
            {...props}
            opportunityId={selected.opportunityId}
            requestedVersionId={selected.versionId}
            expectedOfferId={selected.offerId}
            onProtectedWorkChange={reportProtectedWork}
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
                <p>{cursors.length > 1 ? copy.laterEmpty : copy.empty}</p>
              ) : (
                <ol className="offer-decision-items">
                  {view.page.items.map((item) => (
                    <li key={item.versionId}>
                      <strong>{item.opportunityTitle}</strong>
                      <p>
                        {copy.reference} {item.illustrativeReference} —{' '}
                        {copy.version} {item.versionNumber}
                      </p>
                      <p>
                        {item.provenance === 'ILLUSTRATIVE'
                          ? copy.illustrative
                          : copy.model}
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
                        {copy.open} {item.illustrativeReference},{' '}
                        {copy.version.toLowerCase()} {item.versionNumber}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <div className="offer-decision-pages">
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
