import { useEffect, useRef } from 'react';
import { useInterfaceLocale } from '../localization/interface-locale';
import { useProjectTaskCopy } from '../project/task.copy';
import { useTaskResultCopy } from '../project/task-results.copy';
import { useMissionPlanCopy } from './mission-plan.copy';
import { useCurrentWorkCopy } from './current-work.copy';
import type { CurrentWork } from './current-work-response';
export function CurrentWorkView({
  value,
  page,
  onPage,
  onOpenTask,
  focusTask,
}: {
  value: CurrentWork;
  page: number;
  onPage: (page: number) => void;
  onOpenTask: (id: string) => void;
  focusTask: string | null;
}) {
  const { c, window: windowLabel } = useCurrentWorkCopy(),
    sourceCopy = useMissionPlanCopy(),
    taskCopy = useProjectTaskCopy(),
    resultCopy = useTaskResultCopy(),
    locale = useInterfaceLocale();
  const heading = useRef<HTMLParagraphElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (focusTask) buttons.current.get(focusTask)?.focus();
  }, [focusTask]);
  const from = page * 25,
    through = Math.min(from + 25, value.activities.length);
  return (
    <>
      <p>
        {value.plan.version.title} · {sourceCopy('version')}{' '}
        {value.plan.version.versionNumber}
      </p>
      <nav aria-label={c('heading')} className="mission-plan-actions">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => {
            onPage(page - 1);
            heading.current?.focus();
          }}
        >
          {c('previous')}
        </button>
        <button
          type="button"
          disabled={through === value.activities.length}
          onClick={() => {
            onPage(page + 1);
            heading.current?.focus();
          }}
        >
          {c('next')}
        </button>
      </nav>
      <p ref={heading} tabIndex={-1} aria-live="polite">
        {windowLabel(from + 1, through, value.activities.length)}
      </p>
      <ol start={from + 1} className="current-work-activities">
        {value.activities.slice(from, through).map((row) => {
          const source = row.source;
          const declaration =
            row.task.status === 'blocked'
              ? row.task.blockage
              : row.task.status === 'cancelled'
                ? row.task.cancellation
                : row.task.status === 'done'
                  ? row.task.completion
                  : null;
          return (
            <li key={row.activityKey}>
              <h4>
                {c('initial')}: {source.title}
              </h4>
              <dl>
                <dt>{sourceCopy('activity')}</dt>
                <dd className="mission-plan-literal">{source.activity}</dd>
                <dt>{sourceCopy('result')}</dt>
                <dd className="mission-plan-literal">
                  {source.intendedResult}
                </dd>
              </dl>
              <h4>
                {c('current')}: {row.task.title}
              </h4>
              <dl>
                <dt>{taskCopy.statusFilterLabel}</dt>
                <dd>{taskCopy.states[row.task.status]}</dd>
                <dt>{taskCopy.assignee}</dt>
                <dd>
                  {row.task.assignee?.displayLabel ?? taskCopy.unassigned}
                </dd>
                <dt>{taskCopy.dueDate}</dt>
                <dd>
                  {row.task.dueDate ? (
                    <time dateTime={row.task.dueDate}>{row.task.dueDate}</time>
                  ) : (
                    taskCopy.noDate
                  )}
                </dd>
                <dt>{taskCopy.priority}</dt>
                <dd>{taskCopy.priorities[row.task.priority]}</dd>
              </dl>
              {declaration && (
                <div className="current-work-declaration">
                  {'reason' in declaration &&
                    typeof declaration.reason === 'string' && (
                      <p className="mission-plan-literal">
                        {declaration.reason}
                      </p>
                    )}
                  <p>
                    {declaration.actor.displayName} ·{' '}
                    <time dateTime={declaration.occurredAt}>
                      {locale.formatDateTime(declaration.occurredAt)}
                    </time>
                  </p>
                </div>
              )}
              <h4>{c('result')}</h4>
              {row.result.kind === 'unavailable' ? (
                <p>{c('resultUnavailable')}</p>
              ) : row.result.current === null ? (
                <p>{c('resultEmpty')}</p>
              ) : (
                <div>
                  <p className="mission-plan-literal">
                    {row.result.current.declaration}
                  </p>
                  {row.result.current.kind === 'corrected' && (
                    <p className="mission-plan-literal">
                      {resultCopy.t('reason')}: {row.result.current.reason}
                    </p>
                  )}
                  <p>
                    {row.result.current.actor.displayName} ·{' '}
                    <time dateTime={row.result.current.occurredAt}>
                      {locale.formatDateTime(row.result.current.occurredAt)}
                    </time>
                  </p>
                  <p>
                    {row.result.current.reference.title} ·{' '}
                    {sourceCopy('version')}{' '}
                    {row.result.current.reference.versionNumber} ·{' '}
                    {resultCopy.t(row.result.current.reference.status)}
                  </p>
                </div>
              )}
              <button
                type="button"
                ref={(node) => {
                  if (node) buttons.current.set(row.task.id, node);
                  else buttons.current.delete(row.task.id);
                }}
                onClick={() => onOpenTask(row.task.id)}
              >
                {c('open')}: {row.task.title}
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}
