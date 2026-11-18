import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import type { CommercialIntakeWorkspace } from './CommercialIntakeWorkspace';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import {
  parseClientCommercialPage,
  type ClientCommercialPage,
} from './client-commercial-response';
import { grantOf, holds } from '../access/company-grants';
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import {
  useScopedOperationGroup,
  type PendingOperation,
} from '../api/use-scoped-operation';
import { useClientCommercialCopy } from './client-commercial.copy';
import { useCommercialRequestCopy } from './commercial-request.copy';
import { useSalesStageCopy } from './sales-stage.copy';
import './client-commercial.css';

type Props = Pick<
  ComponentProps<typeof CommercialIntakeWorkspace>,
  | 'actor'
  | 'identity'
  | 'onCompanyContextRejected'
  | 'onActorRevalidated'
  | 'onWorkspaceAccessRejected'
> & {
  clientDossierId: string;
  clientIdentityRevision: number;
  onOpenRequest: (clientRequestId: string, sourceSignal: AbortSignal) => void;
};
type View =
  | { kind: 'loading' | 'error' | 'denied' }
  | { kind: 'ready'; page: ClientCommercialPage };

export function ClientCommercialOverview(props: Props) {
  const identity = useRequestLifetime(
    props.identity,
    JSON.stringify([props.identity.loaded, props.identity.signedIn]),
  );
  const company = props.actor.activeCompany;
  // A live grant always carries a non-blank assignment and a registry version.
  const clientGrant = grantOf(company, 'company_director_client_access');
  const intakeGrant = grantOf(company, 'company_commercial_intake');
  if (
    !props.identity.loaded ||
    !props.identity.signedIn ||
    !company ||
    !clientGrant ||
    !intakeGrant ||
    !holds(company, 'company_director_client_access', 'client.read') ||
    !holds(company, 'company_commercial_intake', 'commercial.request.read') ||
    !holds(company, 'company_commercial_intake', 'commercial.opportunity.read')
  )
    return null;
  const capture = [
    props.actor.internalUserId,
    props.actor.workspaceMembershipId,
    props.actor.workspaceId,
    company.id,
    clientGrant.assignmentId,
    clientGrant.permissionSetVersion,
    [...clientGrant.permissions].sort(),
    intakeGrant.assignmentId,
    intakeGrant.permissionSetVersion,
    [...intakeGrant.permissions].sort(),
    props.clientDossierId,
    props.clientIdentityRevision,
    identity,
  ];
  return (
    <CommercialOwner
      key={JSON.stringify(capture)}
      {...props}
      company={company}
    />
  );
}

function CommercialOwner(
  props: Props & { company: NonNullable<Props['actor']['activeCompany']> },
) {
  const copy = useClientCommercialCopy();
  const commercial = useCommercialRequestCopy();
  const stage = useSalesStageCopy();
  const id = useId();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const reads = useScopedOperationGroup('Client commercial pages');
  const navigations = useScopedOperationGroup('Client commercial navigation');
  const navigation = useRef<PendingOperation | null>(null);
  useLayoutEffect(() => {
    navigation.current = navigations.beginLatest();
    return () => {
      navigation.current = null;
    };
  }, [navigations]);
  const observation = useActorObservation(props.actor);
  const recoveries = useScopedOperationGroup(String(observation));
  const callbacks = useRef({ props, recoveries });
  useLayoutEffect(() => {
    callbacks.current = { props, recoveries };
  });
  const heading = useRef<HTMLHeadingElement>(null);
  const load = useCallback(
    async (cursor: string | undefined, focus = false) => {
      const operation = reads.beginLatest();
      if (!operation) return;
      const captured = callbacks.current;
      setView({ kind: 'loading' });
      try {
        await runLatestAuthenticatedRequest({
          signal: operation.signal,
          identity: captured.props.identity,
          execute: (api, signal) =>
            api.request(
              `/commercial-intake/requests?clientDossierId=${encodeURIComponent(props.clientDossierId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
              { companyContextId: props.company.id, signal },
            ),
          onResult: async (result, signal) => {
            if (
              result.status === 'unauthorized' ||
              result.status === 'forbidden' ||
              result.status === 'notFound'
            ) {
              navigations.retire();
              setView({ kind: 'denied' });
              const recovery = captured.recoveries.begin();
              if (!recovery) return;
              const current = () =>
                captured.recoveries.isLive() &&
                !recovery.signal.aborted &&
                !signal.aborted;
              signal.addEventListener('abort', recovery.retire, { once: true });
              try {
                await handleAuthenticatedAccessRejection({
                  result,
                  signal: recovery.signal,
                  isCurrent: current,
                  identity: captured.props.identity,
                  companyContextId: props.company.id,
                  onCompanyContextRejected: (companyId) => {
                    if (current())
                      callbacks.current.props.onCompanyContextRejected(
                        companyId,
                      );
                  },
                  onActorRevalidated: (actor) =>
                    current()
                      ? callbacks.current.props.onActorRevalidated?.(actor)
                      : undefined,
                  onWorkspaceAccessRejected: () =>
                    current()
                      ? callbacks.current.props.onWorkspaceAccessRejected?.()
                      : undefined,
                });
              } finally {
                signal.removeEventListener('abort', recovery.retire);
                recovery.release();
              }
            } else if (result.status === 'ok') {
              const page = parseClientCommercialPage(
                result.value,
                props.clientDossierId,
              );
              if (!navigation.current || navigation.current.signal.aborted)
                navigation.current = navigations.beginLatest();
              setView({
                kind: 'ready',
                page,
              });
            } else setView({ kind: 'error' });
          },
          onError: () => setView({ kind: 'error' }),
          onSettled: () => {
            if (focus) heading.current?.focus();
          },
        });
      } finally {
        operation.release();
      }
    },
    [props.company.id, props.clientDossierId, reads, navigations],
  );
  useEffect(() => {
    void load(undefined);
    return reads.retire;
  }, [load, reads]);
  function move(next: (string | undefined)[]) {
    setCursors(next);
    void load(next.at(-1), true);
  }
  return (
    <section className="client-commercial-work" aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`} tabIndex={-1} ref={heading}>
        {copy('title')}
      </h4>
      <p>{props.company.displayName}</p>
      <p>{copy('hint')}</p>
      <button
        type="button"
        className="client-secondary-action"
        disabled={view.kind === 'loading'}
        onClick={() => move([undefined])}
      >
        {copy('refresh')}
      </button>
      <p role="status">
        {copy('page')} {cursors.length}
        {view.kind === 'loading' ? ` — ${copy('loading')}` : ''}
      </p>
      {view.kind === 'error' || view.kind === 'denied' ? (
        <>
          <p role="alert">{copy(view.kind)}</p>
          <button
            type="button"
            className="client-secondary-action"
            onClick={() => void load(cursors.at(-1), true)}
          >
            {copy('retry')}
          </button>
        </>
      ) : null}
      {view.kind === 'ready' ? (
        <>
          {view.page.items.length === 0 ? (
            <p>{copy('empty')}</p>
          ) : (
            <ul className="client-commercial-affairs-list">
              {view.page.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="client-secondary-action"
                    aria-label={`${copy('open')}: ${item.title}`}
                    onClick={() => {
                      const source = navigation.current;
                      if (source && !source.signal.aborted)
                        props.onOpenRequest(item.id, source.signal);
                    }}
                  >
                    {item.title}
                  </button>
                  <dl>
                    <div>
                      <dt>{commercial.responsible}</dt>
                      <dd>{item.responsibleDisplayName}</dd>
                    </div>
                    <div>
                      <dt>{commercial.status}</dt>
                      <dd>{commercial.opportunityStatusLabels[item.status]}</dd>
                    </div>
                    {item.salesStage ? (
                      <div>
                        <dt>{stage('salesStage')}</dt>
                        <dd>{item.salesStage.label}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>{commercial.nextAction}</dt>
                      <dd>{item.nextAction}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
          <div className="client-commercial-pages">
            <button
              type="button"
              className="client-secondary-action"
              disabled={cursors.length < 2}
              onClick={() => move(cursors.slice(0, -1))}
            >
              {copy('previous')}
            </button>
            <button
              type="button"
              className="client-secondary-action"
              disabled={!view.page.nextCursor}
              onClick={() => {
                if (view.page.nextCursor)
                  move([...cursors, view.page.nextCursor]);
              }}
            >
              {copy('next')}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
