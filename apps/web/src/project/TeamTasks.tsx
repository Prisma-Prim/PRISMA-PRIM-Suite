import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import { useScopedOperation } from '../api/use-scoped-operation';
import { SectionVisibility } from '../production-shell/section-visibility';
import { useContext, useLayoutEffect, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import { grantOf, holds } from '../access/company-grants';
import type { BrowserIdentity } from '../access-composition';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import { canReadTasks } from './MyTasks';
import {
  defaultTeamTaskFilters,
  readTeamTasks,
  teamTasksPath,
  type TeamTaskFilters,
} from './team-tasks-response';
import { useTeamTasksCopy } from './team-tasks.copy';
import { TeamTaskCriteria } from './TeamTaskCriteria';
import { TeamTaskRows } from './TeamTaskRows';
import { useProjectTaskCopy } from './task.copy';
import './task-discovery.css';
import './team-tasks.css';
type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  onOpenTask?: (target: {
    projectId: string;
    taskId: string;
    sourceSignal?: AbortSignal;
  }) => void;
  onActorRevalidated: (actor: ActorContext) => void | Promise<void>;
  onCompanyContextRejected: (id: string) => void;
  onWorkspaceAccessRejected: () => void;
};
/** Only authority consumed by this Company read. Unrelated grants preserve its live owner. */
export function teamTaskAuthority(actor: ActorContext) {
  const c = actor.activeCompany;
  const task = grantOf(c, 'company_task_manager');
  const project = grantOf(c, 'company_project_access');
  const client = grantOf(c, 'company_director_client_access');
  return JSON.stringify([
    actor.active,
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    c?.id,
    task?.assignmentId,
    task?.permissionSetVersion,
    holds(c, 'company_task_manager', 'task.read'),
    project?.assignmentId,
    project?.permissionSetVersion,
    holds(c, 'company_project_access', 'project.read'),
    actor.workspacePermissions.includes('client.manage'),
    client?.assignmentId,
    client?.permissionSetVersion,
    holds(c, 'company_director_client_access', 'client.read'),
  ]);
}
export function TeamTasks(props: Props) {
  const owner = useRequestLifetime(
    props.identity,
    teamTaskAuthority(props.actor),
  );
  return <TeamTasksOwner key={owner} {...props} />;
}
type Load =
  | { kind: 'idle' | 'loading' | 'denied' | 'error' | 'malformed' }
  | { kind: 'ready'; page: ReturnType<typeof readTeamTasks> };
function TeamTasksOwner(props: Props) {
  const copy = useTeamTasksCopy(),
    native = useProjectTaskCopy();
  const [load, setLoad] = useState<Load>({ kind: 'idle' }),
    [applied, setApplied] = useState({
      filters: defaultTeamTaskFilters,
      offset: 0,
    });
  const ordinary = useScopedOperation('team-task-list');
  const observation = useActorObservation(props.actor);
  const recovery = useScopedOperation(String(observation));
  const navigation = useScopedOperation('team-task-navigation');
  const [sourceSignal, setSourceSignal] = useState<AbortSignal | null>(null);
  const current = useRef(props);
  const request = useRef(applied);
  useLayoutEffect(() => {
    current.current = props;
  });
  function read(filters: TeamTaskFilters, offset: number) {
    const signal = ordinary.begin();
    if (!signal) return;
    recovery.retire();
    request.current = { filters, offset };
    setApplied(request.current);
    setLoad({ kind: 'loading' });
    const companyId = props.actor.activeCompany?.id;
    if (!companyId || !canReadTasks(props.actor)) {
      setLoad({ kind: 'denied' });
      return;
    }
    void runLatestAuthenticatedRequest({
      signal,
      identity: props.identity,
      execute: (api, signal) =>
        api.request(teamTasksPath(filters, offset), {
          companyContextId: companyId,
          signal,
        }),
      onResult: (result) => {
        if (result.status === 'ok') {
          try {
            setLoad({
              kind: 'ready',
              page: readTeamTasks(result.value, { companyId, offset, filters }),
            });
          } catch {
            setLoad({ kind: 'malformed' });
          }
          return;
        }
        if (result.status === 'unauthorized' || result.status === 'forbidden') {
          setLoad({ kind: 'denied' });
          const recoverySignal = recovery.begin();
          if (!recoverySignal) return;
          const live = () => !recoverySignal.aborted;
          void handleAuthenticatedAccessRejection({
            result,
            identity: props.identity,
            companyContextId: companyId,
            signal: recoverySignal,
            isCurrent: live,
            onActorRevalidated: (actor) =>
              live() ? current.current.onActorRevalidated(actor) : undefined,
            onCompanyContextRejected: (id) => {
              if (live()) current.current.onCompanyContextRejected(id);
            },
            onWorkspaceAccessRejected: () => {
              if (live()) current.current.onWorkspaceAccessRejected();
            },
          }).catch(() => undefined);
        } else setLoad({ kind: 'error' });
      },
      onError: () => setLoad({ kind: 'error' }),
    });
  }
  const latestRead = useRef(read);
  useLayoutEffect(() => {
    latestRead.current = read;
  });
  const active = useContext(SectionVisibility),
    wasActive = useRef(false);
  useLayoutEffect(() => {
    setSourceSignal(navigation.begin());
    wasActive.current = false;
    return () => {
      wasActive.current = false;
    };
  }, [navigation]);
  useLayoutEffect(() => {
    if (active && !wasActive.current) {
      const r = request.current;
      latestRead.current(r.filters, r.offset);
    }
    wasActive.current = active;
  }, [active]);
  const busy = load.kind === 'loading',
    f = applied.filters;
  return (
    <section
      id="team-tasks"
      tabIndex={-1}
      className="task-discovery team-tasks"
      aria-label={copy('title')}
    >
      <header className="task-discovery-heading">
        <div>
          <h2>{copy('title')}</h2>
          <p className="task-discovery-company">
            {props.actor.activeCompany?.displayName}
          </p>
        </div>
        <button type="button" disabled={busy} onClick={() => read(f, 0)}>
          {copy('refresh')}
        </button>
      </header>
      <p className="task-discovery-note">{copy('note')}</p>
      <TeamTaskCriteria
        pending={busy}
        onApply={(filters) => read(filters, 0)}
      />
      <div className="team-task-applied" aria-label={copy('applied')}>
        <strong>{copy('applied')}: </strong>
        {f.state === 'open' || f.state === 'all'
          ? copy(f.state)
          : native.states[f.state]}{' '}
        · {copy(f.responsibility)}
        {f.assigneeName !== null && <> · {f.assigneeName}</>}
        {f.dueFrom !== null && (
          <>
            {' '}
            · {copy('dueFrom')}: {f.dueFrom}
          </>
        )}
        {f.dueThrough !== null && (
          <>
            {' '}
            · {copy('dueThrough')}: {f.dueThrough}
          </>
        )}
      </div>
      {load.kind === 'ready' ? (
        load.page.tasks.length ? (
          <TeamTaskRows
            tasks={load.page.tasks}
            onOpen={(task) => {
              if (sourceSignal && !sourceSignal.aborted)
                current.current.onOpenTask?.({
                  projectId: task.projectId,
                  taskId: task.id,
                  sourceSignal,
                });
            }}
          />
        ) : (
          <p className="task-discovery-state" role="status">
            {copy(applied.offset === 0 ? 'empty' : 'outOfRange')}
          </p>
        )
      ) : (
        load.kind !== 'idle' && (
          <div className="task-discovery-state">
            <p role={busy ? 'status' : 'alert'}>{copy(load.kind)}</p>
            {(load.kind === 'error' || load.kind === 'malformed') && (
              <button type="button" onClick={() => read(f, applied.offset)}>
                {copy('retry')}
              </button>
            )}
          </div>
        )
      )}
      <div className="task-discovery-pagination">
        <button
          type="button"
          disabled={busy || applied.offset === 0}
          onClick={() => read(f, Math.max(0, applied.offset - 25))}
        >
          {copy('previous')}
        </button>
        <button
          type="button"
          disabled={
            load.kind !== 'ready' ||
            !load.page.hasNextPage ||
            applied.offset > Number.MAX_SAFE_INTEGER - 25
          }
          onClick={() => read(f, applied.offset + 25)}
        >
          {copy('next')}
        </button>
      </div>
    </section>
  );
}
