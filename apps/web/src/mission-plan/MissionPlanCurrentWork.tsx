import { useCallback, useEffect, useRef, useState } from 'react';
import { runLatestAuthenticatedRequest } from '../api/latest-authenticated-request';
import { grantOf } from '../access/company-grants';
import {
  MissionPlanAccessLifetime,
  useMissionPlanRejection,
} from './mission-plan-access-lifetime';
import {
  missionPlanAuthority,
  uuid,
  type PlanAuthority,
} from './mission-plan-authority';
import type { MissionPlanProps } from './MissionPlanWorkspace';
import { readCurrentWork, type CurrentWork } from './current-work-response';
import { useCurrentWorkCopy } from './current-work.copy';
import { CurrentWorkView } from './CurrentWorkView';
import './current-work.css';
type Props = MissionPlanProps & {
  projectId: string;
  clientAccountId: string;
  onOpenTask: (id: string) => void;
};
function resultAuthority(actor: Props['actor']) {
  const c = actor.activeCompany;
  return JSON.stringify([
    grantOf(c, 'company_document_registrar'),
    grantOf(c, 'company_document_content_reader'),
    grantOf(c, 'company_mission_deliverable_access'),
  ]);
}
function baseAuthority(actor: Props['actor']) {
  const c = actor.activeCompany;
  if (
    !uuid(grantOf(c, 'company_task_manager')?.assignmentId) ||
    !uuid(grantOf(c, 'company_project_access')?.assignmentId) ||
    (!actor.workspacePermissions.includes('client.manage') &&
      !uuid(grantOf(c, 'company_director_client_access')?.assignmentId))
  )
    return null;
  return missionPlanAuthority(actor, 'copy');
}
/** Base and optional evidence lifetimes are independent. Every observed transition permanently retires its generation. */
export function MissionPlanCurrentWork(props: Props) {
  const authority = baseAuthority(props.actor),
    { c } = useCurrentWorkCopy();
  const key = JSON.stringify([
    authority?.key,
    props.projectId,
    props.clientAccountId,
  ]);
  const owner = useRef({ key, identity: props.identity, generation: 0 });
  if (owner.current.key !== key || owner.current.identity !== props.identity)
    owner.current = {
      key,
      identity: props.identity,
      generation: owner.current.generation + 1,
    };
  return authority ? (
    <div
      className="mission-plan-region current-work"
      key={owner.current.generation}
    >
      <MissionPlanAccessLifetime
        actor={props.actor}
        context={{
          ...props,
          // Rejection work consumes result authority without remounting the valid base projection.
          authority: {
            ...authority,
            key: JSON.stringify([authority.key, resultAuthority(props.actor)]),
          },
        }}
      >
        <CurrentWorkOwner {...props} authority={authority} />
      </MissionPlanAccessLifetime>
    </div>
  ) : (
    <p role="status">{c('denied')}</p>
  );
}
type Read =
  | { kind: 'loading' | 'error' | 'missing' | 'denied' }
  | { kind: 'ready'; value: CurrentWork | null };
function withoutResults(value: CurrentWork | null): CurrentWork | null {
  return (
    value && {
      ...value,
      activities: value.activities.map((row) => ({
        ...row,
        result: { kind: 'unavailable' },
      })),
    }
  );
}
function CurrentWorkOwner({
  authority,
  ...props
}: Props & { authority: PlanAuthority }) {
  const { c } = useCurrentWorkCopy(),
    reject = useMissionPlanRejection();
  const [state, setState] = useState<Read>({ kind: 'loading' }),
    [page, setPage] = useState(0),
    [returnTask, setReturnTask] = useState<string | null>(null),
    [focusTask, setFocusTask] = useState<string | null>(null);
  const pending = useRef<AbortController | undefined>(undefined),
    source = useRef<string | null>(null);
  const resultKey = resultAuthority(props.actor);
  const resultGeneration = useRef({ key: resultKey, generation: 0 });
  const current = useRef({ reject, resultKey });
  current.current = { reject, resultKey };
  if (resultGeneration.current.key !== resultKey) {
    resultGeneration.current = {
      key: resultKey,
      generation: resultGeneration.current.generation + 1,
    };
    pending.current?.abort();
    if (state.kind === 'ready')
      setState({ kind: 'ready', value: withoutResults(state.value) });
  }
  const { identity, projectId, clientAccountId } = props;
  const callbacks = useRef(props);
  callbacks.current = props;
  const load = useCallback(
    (optionalOnly = false, restoreTask: string | null = null) => {
      const generation = resultGeneration.current.generation;
      if (!optionalOnly) setState({ kind: 'loading' });
      setFocusTask(null);
      void runLatestAuthenticatedRequest({
        pending,
        identity,
        execute: (api, signal) =>
          api.request(`/projects/${projectId}/mission-plan/current-work`, {
            companyContextId: authority.companyId,
            signal,
          }),
        onResult: (result) => {
          if (generation !== resultGeneration.current.generation) return;
          if (result.status === 'ok') {
            const value = readCurrentWork(result.value, {
              workspaceId: authority.workspaceId,
              companyId: authority.companyId,
              projectId,
              clientAccountId,
            });
            if (
              source.current !== null &&
              source.current !== value?.plan.version.id
            )
              throw new Error('Changed immutable copied source.');
            source.current = value?.plan.version.id ?? null;
            setState({ kind: 'ready', value });
            setFocusTask(restoreTask);
            if (value)
              setPage((page) =>
                Math.min(page, Math.floor((value.activities.length - 1) / 25)),
              );
          } else if (
            result.status === 'unauthorized' ||
            result.status === 'forbidden'
          ) {
            setState({ kind: 'denied' });
            current.current.reject(result);
          } else
            setState({
              kind: result.status === 'notFound' ? 'missing' : 'error',
            });
        },
        onError: () => setState({ kind: 'error' }),
      });
    },
    [
      identity,
      projectId,
      clientAccountId,
      authority.companyId,
      authority.workspaceId,
    ],
  );
  const initial = useRef(true);
  useEffect(() => {
    load(!initial.current);
    initial.current = false;
    return () => pending.current?.abort();
  }, [load, resultKey]);
  const ready = state.kind === 'ready';
  return (
    <section aria-label={c('heading')}>
      <h3>{c('heading')}</h3>
      <p>{c('help')}</p>
      <div className="mission-plan-actions">
        <button type="button" onClick={() => load()}>
          {c(ready ? 'refresh' : 'retry')}
        </button>
        {returnTask && (
          <button
            type="button"
            onClick={() => {
              load(false, returnTask);
              setReturnTask(null);
            }}
          >
            {c('return')}
          </button>
        )}
      </div>
      {ready ? (
        state.value === null ? (
          <p>{c('empty')}</p>
        ) : (
          <CurrentWorkView
            value={state.value}
            page={page}
            onPage={setPage}
            focusTask={focusTask}
            onOpenTask={(id) => {
              setReturnTask(id);
              callbacks.current.onOpenTask(id);
            }}
          />
        )
      ) : (
        <p role={state.kind === 'loading' ? 'status' : 'alert'}>
          {c(state.kind)}
        </p>
      )}
    </section>
  );
}
