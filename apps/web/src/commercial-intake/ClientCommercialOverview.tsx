import {
  useCallback,
  useEffect,
  useId,
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
  const identity = useRef({ value: props.identity, generation: 0 });
  if (identity.current.value !== props.identity)
    identity.current = {
      value: props.identity,
      generation: identity.current.generation + 1,
    };
  const company = props.actor.activeCompany;
  if (
    !props.identity.loaded ||
    !props.identity.signedIn ||
    !company ||
    !company.clientPermissions?.includes('client.read') ||
    !company.clientPermissionAssignmentId ||
    !['v1', 'v2'].includes(company.clientPermissionSetVersion ?? '') ||
    !company.commercialIntakePermissions?.includes('commercial.request.read') ||
    !company.commercialIntakePermissions.includes(
      'commercial.opportunity.read',
    ) ||
    !company.commercialIntakePermissionAssignmentId ||
    !['v1', 'v2', 'v3', 'v4'].includes(
      company.commercialIntakePermissionSetVersion ?? '',
    )
  )
    return null;
  const capture = [
    props.actor.internalUserId,
    props.actor.workspaceMembershipId,
    props.actor.workspaceId,
    company.id,
    company.clientPermissionAssignmentId,
    company.clientPermissionSetVersion,
    [...company.clientPermissions].sort(),
    company.commercialIntakePermissionAssignmentId,
    company.commercialIntakePermissionSetVersion,
    [...company.commercialIntakePermissions].sort(),
    props.clientDossierId,
    props.clientIdentityRevision,
    identity.current.generation,
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
  const pending = useRef<AbortController | undefined>(undefined);
  const lifetime = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    lifetime.current = new AbortController();
    return () => {
      lifetime.current?.abort();
      lifetime.current = undefined;
    };
  }, []);
  const callbacks = useRef(props);
  callbacks.current = props;
  const heading = useRef<HTMLHeadingElement>(null);
  const load = useCallback(
    (cursor: string | undefined, focus = false) => {
      setView({ kind: 'loading' });
      return runLatestAuthenticatedRequest({
        pending,
        identity: callbacks.current.identity,
        execute: (api, signal) =>
          api.request<unknown>(
            `/commercial-intake/requests?clientDossierId=${encodeURIComponent(props.clientDossierId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
            { companyContextId: props.company.id, signal },
          ),
        onResult: async (result, signal) => {
          if (
            result.status === 'unauthorized' ||
            result.status === 'forbidden' ||
            result.status === 'notFound'
          ) {
            lifetime.current?.abort();
            setView({ kind: 'denied' });
            await handleAuthenticatedAccessRejection({
              result,
              signal,
              identity: callbacks.current.identity,
              companyContextId: props.company.id,
              onCompanyContextRejected:
                callbacks.current.onCompanyContextRejected,
              onActorRevalidated:
                callbacks.current.onActorRevalidated ?? (() => undefined),
              onWorkspaceAccessRejected:
                callbacks.current.onWorkspaceAccessRejected,
            });
          } else if (result.status === 'ok') {
            const page = parseClientCommercialPage(
              result.value,
              props.clientDossierId,
            );
            if (lifetime.current?.signal.aborted)
              lifetime.current = new AbortController();
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
    },
    [props.company.id, props.clientDossierId],
  );
  useEffect(() => {
    void load(undefined);
    return () => pending.current?.abort();
  }, [load]);
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
                      if (lifetime.current)
                        props.onOpenRequest(item.id, lifetime.current.signal);
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
