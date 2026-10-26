import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import type { ClientMissionOverview } from './ClientMissionOverview';
import type { ClientProjectPage } from './client-mission-response';
import { canReadTasks } from './MyTasks';
import { readTaskList, type TaskView } from './task-response';
import { TaskCalendarDate } from './TaskPresentation';
import { useProjectTaskCopy } from './task.copy';
import { useClientMissionCopy } from './client-mission.copy';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';

type Props = Pick<
  ComponentProps<typeof ClientMissionOverview>,
  | 'actor'
  | 'identity'
  | 'onOpenProject'
  | 'onActorRevalidated'
  | 'onCompanyContextRejected'
  | 'onWorkspaceAccessRejected'
> & {
  project: ClientProjectPage['items'][number];
  sourceSignal: AbortSignal;
};
type View =
  | { kind: 'loading' | 'error' | 'denied' }
  | { kind: 'ready'; tasks: TaskView[] };

/** Task capture changes retire only this selected preview, never its Project directory. */
export function ClientMissionTasks(props: Props) {
  if (!canReadTasks(props.actor)) return null;
  const company = props.actor.activeCompany;
  const capture = [
    props.project.id,
    company?.taskPermissionAssignmentId,
    company?.taskPermissionSetVersion,
    company?.taskPermissions,
  ];
  return <TaskOwner key={JSON.stringify(capture)} {...props} />;
}
function TaskOwner(props: Props) {
  const copy = useClientMissionCopy(),
    tasksCopy = useProjectTaskCopy(),
    id = useId();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [offset, setOffset] = useState(0);
  const pending = useRef<AbortController | undefined>(undefined);
  const lifetime = useRef<AbortController | undefined>(undefined);
  const callbacks = useRef(props);
  callbacks.current = props;
  const heading = useRef<HTMLHeadingElement>(null);
  const load = useCallback(() => {
    if (props.sourceSignal.aborted) return;
    lifetime.current?.abort();
    lifetime.current = undefined;
    setView({ kind: 'loading' });
    setOffset(0);
    return runLatestAuthenticatedRequest({
      pending,
      identity: callbacks.current.identity,
      execute: (api, signal) =>
        api.request<unknown>(
          `/projects/${encodeURIComponent(props.project.id)}/tasks`,
          { companyContextId: props.project.companyId, signal },
        ),
      onResult: async (result, signal) => {
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
            companyContextId: props.project.companyId,
            onCompanyContextRejected:
              callbacks.current.onCompanyContextRejected,
            onActorRevalidated: callbacks.current.onActorRevalidated,
            onWorkspaceAccessRejected:
              callbacks.current.onWorkspaceAccessRejected,
          });
        } else if (result.status === 'ok') {
          const { tasks } = readTaskList(result.value, {
            companyId: props.project.companyId,
            projectId: props.project.id,
          });
          if (
            new Set(tasks.map((task) => task.id)).size !== tasks.length ||
            tasks.some(
              (task) => task.clientAccountId !== props.project.clientAccountId,
            )
          )
            throw new Error('Mismatched Client Task preview.');
          lifetime.current = new AbortController();
          setView({ kind: 'ready', tasks });
        } else setView({ kind: 'error' });
      },
      onError: () => setView({ kind: 'error' }),
    });
  }, [
    props.project.id,
    props.project.companyId,
    props.project.clientAccountId,
    props.sourceSignal,
  ]);
  useEffect(() => {
    const retire = () => {
      pending.current?.abort();
      lifetime.current?.abort();
    };
    props.sourceSignal.addEventListener('abort', retire, { once: true });
    void load();
    return () => {
      props.sourceSignal.removeEventListener('abort', retire);
      retire();
    };
  }, [load, props.sourceSignal]);
  function move(next: number) {
    lifetime.current?.abort();
    lifetime.current = new AbortController();
    setOffset(next);
    heading.current?.focus();
  }
  return (
    <section
      className="client-mission-task-preview"
      aria-labelledby={`${id}-title`}
    >
      <h5 id={`${id}-title`} ref={heading} tabIndex={-1}>
        {copy('tasksFor')}: {props.project.title}
      </h5>
      <p>{copy('taskHint')}</p>
      <button
        type="button"
        disabled={view.kind === 'loading'}
        onClick={() => void load()}
      >
        {tasksCopy.reload}
      </button>
      {view.kind === 'ready' ? (
        <>
          {view.tasks.length === 0 ? (
            <p>{tasksCopy.empty}</p>
          ) : (
            <ul className="client-mission-list">
              {view.tasks.slice(offset, offset + 25).map((task) => (
                <li key={task.id}>
                  <h6>{task.title}</h6>
                  <p>
                    {tasksCopy.states[task.status]} ·{' '}
                    {tasksCopy.priorities[task.priority]}
                  </p>
                  <p>
                    <strong>{tasksCopy.assignee}: </strong>
                    <span>
                      {task.assignee?.displayLabel ?? tasksCopy.unassigned}
                    </span>
                  </p>
                  <p>
                    <strong>{tasksCopy.dueDate}: </strong>
                    <TaskCalendarDate value={task.dueDate} />
                  </p>
                  <button
                    type="button"
                    aria-label={`${copy('openTask')}: ${task.title}`}
                    onClick={() => {
                      const signal = lifetime.current?.signal;
                      if (
                        signal &&
                        !signal.aborted &&
                        !props.sourceSignal.aborted
                      )
                        callbacks.current.onOpenProject(
                          {
                            projectId: props.project.id,
                            taskId: task.id,
                            focus: 'task',
                          },
                          signal,
                        );
                    }}
                  >
                    {copy('openTask')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="client-mission-actions">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => move(Math.max(0, offset - 25))}
            >
              {copy('previousTasks')}
            </button>
            <button
              type="button"
              disabled={offset + 25 >= view.tasks.length}
              onClick={() => move(offset + 25)}
            >
              {copy('nextTasks')}
            </button>
          </div>
        </>
      ) : (
        <p role={view.kind === 'loading' ? 'status' : 'alert'}>
          {tasksCopy[view.kind]}
        </p>
      )}
    </section>
  );
}
