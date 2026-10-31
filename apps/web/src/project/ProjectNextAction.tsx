import { useEffect, useId, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { clientReadAuthority } from './project-authority';
import {
  isClosedProjectStatus,
  type ProjectStatus,
} from './project-lifecycle-response';
import { useProjectNextActionCopy } from './project-next-action.copy';
import {
  readNextAction,
  type NextActionScope,
  type NextActionSnapshot,
} from './project-next-action-response';
import {
  NextActionEditor,
  type NextActionRecovery,
} from './ProjectNextActionEditor';
import { Attribution, NextActionValue } from './ProjectNextActionViews';
import './project-next-action.css';

interface Props {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string;
  originalClientId: string;
  originalClientGeneration?: number;
  projectStatus: ProjectStatus;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected?: (companyId: string) => void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
}
export function nextActionReadAuthority(actor: ActorContext) {
  const c = actor.activeCompany;
  return [
    actor.active,
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    c?.id,
    clientReadAuthority(actor),
    c?.projectPermissions?.includes('project.read'),
    c?.projectPermissionAssignmentId,
    c?.projectPermissionSetVersion,
  ];
}
function writeAuthority(actor: ActorContext) {
  const c = actor.activeCompany;
  return JSON.stringify([
    c?.projectNextActionPermissions,
    c?.projectNextActionCoordinatorAssignmentId,
    c?.projectNextActionCoordinatorPermissionSetVersion,
  ]);
}
export function canCoordinateNextAction(actor: ActorContext) {
  const c = actor.activeCompany;
  return Boolean(
    c &&
    typeof c.projectNextActionCoordinatorAssignmentId === 'string' &&
    c.projectNextActionCoordinatorAssignmentId.length > 0 &&
    c.projectNextActionCoordinatorPermissionSetVersion === 'v1' &&
    Array.isArray(c.projectNextActionPermissions) &&
    c.projectNextActionPermissions.length === 1 &&
    c.projectNextActionPermissions[0] === 'project.next_action.update',
  );
}
export function ProjectNextAction(props: Props) {
  const captureRecovery = useAuthorityLifetime(
    JSON.stringify(props.actor),
    props.identity,
  );
  const key = JSON.stringify([
    nextActionReadAuthority(props.actor),
    props.projectId,
    props.originalClientId,
  ]);
  return (
    <NextActionReader key={key} {...props} captureRecovery={captureRecovery} />
  );
}
type ReadState =
  | 'loading'
  | 'ready'
  | 'error'
  | 'malformed'
  | 'unsupported'
  | 'unavailable'
  | 'denied';
function NextActionReader(
  props: Props & { captureRecovery: () => () => boolean },
) {
  const copy = useProjectNextActionCopy(),
    id = useId(),
    companyId = props.actor.activeCompany?.id;
  const scope: NextActionScope = {
    workspaceId: props.actor.workspaceId,
    companyId: companyId ?? '',
    projectId: props.projectId,
    originalClientAccountId: props.originalClientId,
  };
  const path = `/projects/${encodeURIComponent(props.projectId)}/next-action`;
  const capture = useAuthorityLifetime(JSON.stringify(scope), props.identity);
  const protection = useRef({ retired: false }),
    request = useRef<AbortController | undefined>(undefined);
  const historyHeading = useRef<HTMLHeadingElement>(null),
    pendingHistoryFocus = useRef<(() => boolean) | undefined>(undefined);
  const [state, setState] = useState<ReadState>('loading'),
    [snapshot, setSnapshot] = useState<NextActionSnapshot | null>(null),
    [before, setBefore] = useState<number | undefined>(undefined),
    [refresh, setRefresh] = useState(0),
    [review, setReview] = useState(0);
  function localCapture() {
    const live = capture(),
      owner = protection.current;
    return () => live() && !owner.retired;
  }
  const recover: NextActionRecovery = async (
    result,
    valid,
    recoveryValid,
    signal,
  ) => {
    if (!valid() || !recoveryValid()) return;
    await handleAuthenticatedAccessRejection({
      result,
      identity: props.identity,
      companyContextId: companyId,
      signal,
      isCurrent: () => valid() && recoveryValid(),
      onActorRevalidated: props.onActorRevalidated ?? (() => undefined),
      onCompanyContextRejected:
        props.onCompanyContextRejected ?? (() => undefined),
      onWorkspaceAccessRejected: props.onWorkspaceAccessRejected,
    });
  };
  function deny() {
    protection.current.retired = true;
    request.current?.abort();
    setSnapshot(null);
    setState('denied');
  }
  async function rejectRead(
    result: ApiResult<unknown>,
    recoveryValid: () => boolean,
  ) {
    const valid = localCapture();
    if (!valid()) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const live = () => valid() && !controller.signal.aborted;
    // Retire protected rendering immediately. Recovery belongs to this reader,
    // so removing its writer cannot cancel or revive shared session effects.
    setSnapshot(null);
    setState('denied');
    try {
      await recover(result, live, recoveryValid, controller.signal);
    } finally {
      if (live()) deny();
    }
  }
  async function load(
    target:
      | { kind: 'current'; review: boolean }
      | { kind: 'history'; beforeRevision: number | undefined } = {
      kind: 'current',
      review: false,
    },
  ) {
    const cursor =
      target.kind === 'history' ? target.beforeRevision : undefined;
    const valid = localCapture(),
      recoveryValid = props.captureRecovery();
    if (!valid()) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const live = () => valid() && !controller.signal.aborted;
    setState('loading');
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!live()) return;
      const result = await api.request<unknown>(
        path + (cursor === undefined ? '' : `?beforeRevision=${cursor}`),
        { companyContextId: companyId, signal: controller.signal },
      );
      if (!live()) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        await rejectRead(result, recoveryValid);
        return;
      }
      if (result.status !== 'ok') {
        if (result.status === 'notFound') setSnapshot(null);
        setState(result.status === 'notFound' ? 'unavailable' : 'error');
        return;
      }
      let parsed: ReturnType<typeof readNextAction>;
      try {
        parsed = readNextAction(result.value, scope, cursor);
      } catch {
        setSnapshot(null);
        setState('malformed');
        return;
      }
      if (!parsed) {
        setSnapshot(null);
        setState('unsupported');
        return;
      }
      if (target.kind === 'history') pendingHistoryFocus.current = live;
      setSnapshot(parsed);
      setBefore(cursor);
      setState('ready');
      setRefresh((value) => value + 1);
      if (target.kind === 'current' && target.review)
        setReview((value) => value + 1);
    } catch {
      if (live()) setState('error');
    }
  }
  useEffect(() => {
    void load();
    return () => request.current?.abort();
    // Revalidate an original Client's visibility without replacing an otherwise
    // valid read/write owner or abandoning its historical confirmation intent.
  }, [props.originalClientGeneration]);
  useEffect(() => {
    if (pendingHistoryFocus.current?.()) historyHeading.current?.focus();
    pendingHistoryFocus.current = undefined;
  }, [refresh]);
  const writer = canCoordinateNextAction(props.actor),
    closed = isClosedProjectStatus(props.projectStatus);
  return (
    <section className="project-next-action" aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`}>{copy('title')}</h4>
      {state !== 'ready' && (
        <p role={state === 'loading' ? 'status' : 'alert'}>{copy(state)}</p>
      )}
      {snapshot && state !== 'denied' && (
        <>
          <NextActionValue record={snapshot.current} />
          <section aria-labelledby={`${id}-history`}>
            <h5 id={`${id}-history`} ref={historyHeading} tabIndex={-1}>
              {copy('history')}
            </h5>
            {snapshot.history.entries.length === 0 && (
              <p>{copy('emptyHistory')}</p>
            )}
            <ol>
              {snapshot.history.entries.map((entry) => (
                <li key={entry.revision}>
                  <article aria-label={`${copy('revision')} ${entry.revision}`}>
                    <h6>
                      {copy('revision')} {entry.revision}
                    </h6>
                    <dl>
                      <dt>{copy('before')}</dt>
                      <dd className="next-action-literal">
                        {entry.before ??
                          copy(
                            entry.predecessorRevision === 0
                              ? 'missing'
                              : 'cleared',
                          )}
                      </dd>
                      <dt>{copy('after')}</dt>
                      <dd className="next-action-literal">
                        {entry.after ?? copy('cleared')}
                      </dd>
                    </dl>
                    <Attribution value={entry.attribution} />
                  </article>
                </li>
              ))}
            </ol>
            {snapshot.history.nextBeforeRevision !== null && (
              <button
                type="button"
                disabled={state === 'loading'}
                onClick={() =>
                  void load({
                    kind: 'history',
                    beforeRevision:
                      snapshot.history.nextBeforeRevision ?? undefined,
                  })
                }
              >
                {copy('older')}
              </button>
            )}
            {before !== undefined && (
              <button
                type="button"
                disabled={state === 'loading'}
                onClick={() =>
                  void load({ kind: 'history', beforeRevision: undefined })
                }
              >
                {copy('newest')}
              </button>
            )}
          </section>
        </>
      )}
      <button
        type="button"
        disabled={state === 'loading' || state === 'denied'}
        onClick={() => void load({ kind: 'current', review: true })}
      >
        {copy('refresh')}
      </button>
      {closed && <p>{copy('closed')}</p>}
      {writer && state !== 'denied' && state !== 'unavailable' ? (
        <NextActionEditor
          key={writeAuthority(props.actor)}
          identity={props.identity}
          projectStatus={props.projectStatus}
          scope={scope}
          path={path}
          snapshot={snapshot}
          ready={state === 'ready'}
          refresh={refresh}
          review={review}
          capture={localCapture}
          captureRecovery={props.captureRecovery}
          recover={recover}
          onReadRejected={rejectRead}
          onConfirmed={() => load()}
        />
      ) : (
        !writer &&
        !closed &&
        state !== 'denied' &&
        state !== 'unavailable' && <p>{copy('readOnly')}</p>
      )}
    </section>
  );
}
