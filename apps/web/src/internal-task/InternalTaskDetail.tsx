import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { TaskEditor } from './InternalTaskEditor';
import { TaskTime, TaskValues } from './InternalTaskValues';
import { useInternalTaskCopy } from './internal-task.copy';
import {
  readDetail,
  type Detail,
  type Member,
  type Scope,
} from './internal-task-response';
import {
  formatFailure,
  responseState,
  type Request,
  type ViewState,
} from './internal-task-request';
interface Props {
  taskId: string;
  selected: boolean;
  selection: number;
  focusFrom: HTMLElement | undefined;
  identity: BrowserIdentity;
  scope: Scope;
  members: Member[];
  request: Request;
  capture: () => () => boolean;
  captureRecovery: () => () => boolean;
  onChanged: () => Promise<void>;
}
/** One stable Task owner survives same-Company navigation; only its presentation is hidden. */
export function InternalTaskDetail(props: Props) {
  const copy = useInternalTaskCopy(),
    captureTarget = useAuthorityLifetime(props.taskId, props.identity),
    heading = useRef<HTMLHeadingElement>(null),
    serial = useRef(0);
  const [detail, setDetail] = useState<Detail>(),
    [state, setState] = useState<ViewState>('loading'),
    [review, setReview] = useState(0);
  async function load(before?: number, replaceDraft = false): Promise<boolean> {
    const current = ++serial.current,
      scopeLive = props.capture(),
      targetLive = captureTarget(),
      live = () => scopeLive() && targetLive();
    setState('loading');
    const result = await props.request(
      '/company-internal-tasks/' +
        props.taskId +
        (before ? '?beforeVersion=' + before : ''),
      { live },
    );
    if (!live() || current !== serial.current || !result) return false;
    if (result.status !== 'ok') {
      setState(responseState(result, 'missing'));
      return false;
    }
    try {
      const next = readDetail(result.value, props.scope, props.taskId, before);
      if (before && detail?.task.version !== next.task.version) return load();
      setDetail((previous) =>
        before && previous?.task.version === next.task.version
          ? { ...next, history: [...previous.history, ...next.history] }
          : next,
      );
      setState('ready');
      if (replaceDraft) setReview((value) => value + 1);
      return true;
    } catch (error) {
      setState(formatFailure(error));
      return false;
    }
  }
  useEffect(() => {
    if (!props.selected) return;
    void load();
    const destination = heading.current;
    if (
      destination &&
      document.activeElement === props.focusFrom &&
      !destination.closest('[hidden]')
    )
      destination.focus();
  }, [props.selected, props.selection]);
  async function changed() {
    const live = props.capture(),
      targetLive = captureTarget();
    await Promise.all([load(), props.onChanged()]);
    if (!live() || !targetLive()) return;
  }
  return (
    <div className="internal-task-panel" hidden={!props.selected}>
      <h3 ref={heading} tabIndex={-1}>
        {detail?.task.title ?? copy('title')}
      </h3>
      {state !== 'ready' && (
        <p role={state === 'loading' ? 'status' : 'alert'}>{copy(state)}</p>
      )}
      {detail && (
        <>
          {props.selected && <TaskValues task={detail.task} />}
          <TaskEditor
            task={detail.task}
            review={review}
            ready={state === 'ready'}
            identity={props.identity}
            scope={props.scope}
            members={props.members}
            request={props.request}
            capture={props.capture}
            captureRecovery={props.captureRecovery}
            onConfirmed={changed}
            onReload={() => load(undefined, true)}
          />
          {props.selected && (
            <>
              <h4>{copy('history')}</h4>
              <ol className="internal-task-history">
                {detail.history.map((fact) => (
                  <li key={fact.version}>
                    <p>
                      {copy('version')} {fact.version} ·{' '}
                      {copy(
                        fact.kind === 'CREATE'
                          ? 'create'
                          : fact.kind === 'EDIT'
                            ? 'save'
                            : 'move',
                      )}
                    </p>
                    <p>
                      {copy('actor')}: {fact.actorMembershipId} ·{' '}
                      <TaskTime value={fact.recordedAt} />
                    </p>
                    {fact.before && (
                      <details>
                        <summary>{copy('before')}</summary>
                        <TaskValues task={fact.before} />
                      </details>
                    )}
                    <details open>
                      <summary>{copy('after')}</summary>
                      <TaskValues task={fact.after} />
                    </details>
                  </li>
                ))}
              </ol>
              {detail.nextBeforeVersion !== null && (
                <button
                  type="button"
                  disabled={state === 'loading'}
                  onClick={() =>
                    void load(detail.nextBeforeVersion ?? undefined)
                  }
                >
                  {copy('older')}
                </button>
              )}
            </>
          )}
        </>
      )}
      {!detail && (
        <button
          type="button"
          disabled={state === 'loading'}
          onClick={() => void load()}
        >
          {copy('reload')}
        </button>
      )}
    </div>
  );
}
