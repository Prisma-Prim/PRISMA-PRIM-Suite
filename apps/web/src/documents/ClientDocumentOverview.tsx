import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import { formatApplicationDateTime } from '../presentation/date-time';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  documentFamilyCaptureKey,
  hasDocumentFamilyAccess,
} from './document-family-access';
import type { DocumentFamily } from './document-response';
import type { DocumentOpenTarget } from './DocumentWorkspace';
import { useDocumentsCopy } from './documents.copy';
import { useMissionDeliverableCopy } from './mission-deliverable.copy';
import { useReceivedContractCopy } from './received-contract.copy';
import {
  readClientDocumentItems,
  type ClientDocumentItem,
} from './client-document-overview-response';
import { useClientDocumentOverviewCopy } from './client-document-overview.copy';
import './client-document-overview.css';

type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  clientDossierId: string;
  clientIdentityRevision: number;
  onOpenDocument: (target: DocumentOpenTarget) => void;
  onCompanyContextRejected: (companyId: string) => void;
  onActorRevalidated: (actor: ActorContext) => void | Promise<void>;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
};
function captures(company: ActorContext['activeCompany']) {
  return {
    questionnaire: documentFamilyCaptureKey(company, 'questionnaire'),
    'mission-deliverable': documentFamilyCaptureKey(
      company,
      'mission-deliverable',
    ),
    'received-contract': documentFamilyCaptureKey(company, 'received-contract'),
  } satisfies Record<DocumentFamily, string>;
}
type View =
  | { kind: 'loading' | 'error' | 'denied' }
  | {
      kind: 'ready';
      items: ClientDocumentItem[];
      captures: ReturnType<typeof captures>;
      refreshFailed: boolean;
    };

export function ClientDocumentOverview(props: Props) {
  const session = useRef({ identity: props.identity, generation: 0 });
  if (session.current.identity !== props.identity)
    session.current = {
      identity: props.identity,
      generation: session.current.generation + 1,
    };
  const company = props.actor.activeCompany;
  const workspaceClientRead =
    props.actor.workspacePermissions.includes('client.manage');
  if (
    !props.actor.active ||
    !props.identity.loaded ||
    !props.identity.signedIn ||
    !company ||
    (!workspaceClientRead &&
      (!company.clientPermissions?.includes('client.read') ||
        !company.clientPermissionAssignmentId ||
        !['v1', 'v2'].includes(company.clientPermissionSetVersion ?? ''))) ||
    !company.documentPermissions?.includes('document.read') ||
    !company.documentPermissionAssignmentId ||
    !['v1', 'v2', 'v3'].includes(company.documentPermissionSetVersion ?? '')
  )
    return null;
  const clientAuthority = workspaceClientRead
    ? ['workspace-client-manage']
    : [
        company.clientPermissionAssignmentId,
        company.clientPermissionSetVersion,
        company.clientPermissions?.includes('client.read') === true,
      ];
  const context = [
    session.current.generation,
    props.actor.internalUserId,
    props.actor.workspaceMembershipId,
    props.actor.workspaceId,
    company.id,
    clientAuthority,
    company.documentPermissionAssignmentId,
    company.documentPermissionSetVersion,
    props.clientDossierId,
    props.clientIdentityRevision,
  ];
  return (
    <DocumentOverviewOwner
      key={JSON.stringify(context)}
      {...props}
      company={company}
    />
  );
}

function DocumentOverviewOwner(
  props: Props & { company: NonNullable<ActorContext['activeCompany']> },
) {
  const copy = useClientDocumentOverviewCopy(),
    id = useId();
  const { formatNumber } = useInterfaceLocale();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [offset, setOffset] = useState(0);
  const pending = useRef<AbortController | undefined>(undefined);
  const callbacks = useRef(props);
  callbacks.current = props;
  const heading = useRef<HTMLHeadingElement>(null);
  const familyCaptures = captures(props.company);
  const familyKey = JSON.stringify(familyCaptures);
  const currentFamilyKey = useRef(familyKey);
  currentFamilyKey.current = familyKey;
  const load = useCallback(
    (keepReady = false) => {
      const expectedCaptures = captures(callbacks.current.company);
      const expectedKey = JSON.stringify(expectedCaptures);
      if (!keepReady) {
        setOffset(0);
        setView({ kind: 'loading' });
      }
      return runLatestAuthenticatedRequest({
        pending,
        identity: callbacks.current.identity,
        execute: (api, signal) =>
          api.request<unknown>('/documents', {
            companyContextId: props.company.id,
            signal,
          }),
        onResult: async (result, signal) => {
          if (expectedKey !== currentFamilyKey.current) return;
          if (
            result.status === 'unauthorized' ||
            result.status === 'forbidden' ||
            result.status === 'notFound'
          ) {
            setView({ kind: 'denied' });
            await handleAuthenticatedAccessRejection({
              result,
              signal,
              identity: callbacks.current.identity,
              companyContextId: props.company.id,
              onCompanyContextRejected:
                callbacks.current.onCompanyContextRejected,
              onActorRevalidated: callbacks.current.onActorRevalidated,
              onWorkspaceAccessRejected:
                callbacks.current.onWorkspaceAccessRejected,
            });
          } else if (result.status === 'ok') {
            const items = readClientDocumentItems(
              result.value,
              props.company.id,
            );
            setView({
              kind: 'ready',
              items,
              captures: expectedCaptures,
              refreshFailed: false,
            });
          } else throw new Error('Document discovery failed');
        },
        onError: () =>
          setView((old) =>
            keepReady && old.kind === 'ready'
              ? { ...old, refreshFailed: true }
              : { kind: 'error' },
          ),
      });
    },
    [props.company.id],
  );
  useEffect(() => {
    void load(true);
    return () => pending.current?.abort();
  }, [load, familyKey]);
  const matching =
    view.kind === 'ready'
      ? view.items.filter(
          (item) =>
            item.clientDossierId === props.clientDossierId &&
            view.captures[item.type] === familyCaptures[item.type] &&
            hasDocumentFamilyAccess(props.company, item.type),
        )
      : [];
  const visible = matching.slice(offset, offset + 25);
  const changeWindow = (next: number) => {
    setOffset(next);
    heading.current?.focus();
  };
  return (
    <section
      className="client-document-overview"
      aria-labelledby={`${id}-title`}
    >
      <h4 id={`${id}-title`} tabIndex={-1} ref={heading}>
        {copy('title')}
      </h4>
      <p>
        {copy('company')}: {props.company.displayName}
      </p>
      <p>{copy('hint')}</p>
      <div className="client-document-overview-actions">
        <button
          type="button"
          disabled={view.kind === 'loading'}
          onClick={() => void load()}
        >
          {copy('refresh')}
        </button>
        <span>
          {copy('page')} {formatNumber(offset / 25 + 1)}
        </span>
      </div>
      {view.kind === 'loading' && <p role="status">{copy('loading')}</p>}
      {view.kind === 'denied' && <p role="alert">{copy('denied')}</p>}
      {(view.kind === 'error' ||
        (view.kind === 'ready' && view.refreshFailed)) && (
        <div role="alert">
          <p>{copy('error')}</p>
          <button type="button" onClick={() => void load()}>
            {copy('retry')}
          </button>
        </div>
      )}
      {view.kind === 'ready' && (
        <>
          {visible.length === 0 && !view.refreshFailed && (
            <p role="status">{copy(offset ? 'outOfRange' : 'empty')}</p>
          )}
          <ul key={offset}>
            {visible.map((item) => (
              <DocumentEntry
                key={JSON.stringify([item.id, familyCaptures[item.type]])}
                item={item}
                onOpenDocument={props.onOpenDocument}
              />
            ))}
          </ul>
          <div className="client-document-overview-actions">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => changeWindow(Math.max(0, offset - 25))}
            >
              {copy('previous')}
            </button>
            <button
              type="button"
              disabled={offset + 25 >= matching.length}
              onClick={() => changeWindow(offset + 25)}
            >
              {copy('next')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function DocumentEntry({
  item,
  onOpenDocument,
}: {
  item: ClientDocumentItem;
  onOpenDocument: Props['onOpenDocument'];
}) {
  const copy = useClientDocumentOverviewCopy(),
    documents = useDocumentsCopy();
  const mission = useMissionDeliverableCopy(),
    received = useReceivedContractCopy();
  const lifetime = useRef<AbortController | undefined>(undefined);
  useLayoutEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      controller.abort();
      lifetime.current = undefined;
    };
  }, []);
  const status = {
    questionnaire: documents[item.version.status],
    'mission-deliverable': mission.t(item.version.status),
    'received-contract': received.t(item.version.status),
  } satisfies Record<DocumentFamily, string>;
  return (
    <li>
      <h5>{item.title}</h5>
      <p>{status[item.type]}</p>
      <p>
        {documents.client}: {item.clientDisplayName}
      </p>
      <p>
        {documents.registrationTime}:{' '}
        <time dateTime={item.createdAt}>
          {formatApplicationDateTime(item.createdAt)}
        </time>
      </p>
      <button
        type="button"
        onClick={() => {
          const sourceSignal = lifetime.current?.signal;
          if (sourceSignal && !sourceSignal.aborted)
            onOpenDocument({
              documentId: item.id,
              focus: 'document',
              sourceSignal,
            });
        }}
      >
        {copy('open')}
      </button>
    </li>
  );
}
