import type { PlanVersion } from './mission-plan-response';
import { useMissionPlanCopy } from './mission-plan.copy';
import { useInterfaceLocale } from '../localization/interface-locale';
export function MissionPlanContent({
  version,
  onOpenTask,
  tasks,
}: {
  version: PlanVersion;
  tasks?: readonly { taskId: string }[];
  onOpenTask?: (id: string) => void;
}) {
  const c = useMissionPlanCopy(),
    { formatNumber, formatDateTime } = useInterfaceLocale();
  return (
    <article className="mission-plan-content">
      <h4>
        {version.title} · {c('version')} {formatNumber(version.versionNumber)}
      </h4>
      <p>
        {version.actor.displayName} · {formatDateTime(version.publishedAt)}
      </p>
      <p>{c('help')}</p>
      <ol>
        {version.activities.map((a, n) => (
          <li key={a.key}>
            <h5>{a.title}</h5>
            <dl>
              <dt>{c('activity')}</dt>
              <dd>{a.activity}</dd>
              <dt>{c('result')}</dt>
              <dd>{a.intendedResult}</dd>
            </dl>
            {tasks?.[n] && onOpenTask && (
              <button
                type="button"
                onClick={() => {
                  const t = tasks[n];
                  if (t) onOpenTask(t.taskId);
                }}
              >
                {c('openTask')}: {a.title}
              </button>
            )}
          </li>
        ))}
      </ol>
    </article>
  );
}
