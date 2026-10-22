import { useId, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { AttentionTaskList } from './AttentionTaskList';
import { AttentionTasksPanel } from './AttentionTasksPanel';
import { useInterfaceLocale } from '../localization/interface-locale';
import type { MyAttention as AttentionView } from './operational-home-response';
import { useOperationalHomeCopy } from './operational-home-localized.copy';

type Props = {
  attention: AttentionView;
  company: { id: string; displayName: string };
  today: string;
  onOpenTask?: (task: { projectId: string; taskId: string }) => void;
  onOpenMyTasks: () => void;
  identity: BrowserIdentity;
  workspaceMembershipId: string;
};

/** The bounded queue already composed into the one operational-home read. */
export function MyAttention({
  attention,
  company,
  today,
  onOpenTask,
  onOpenMyTasks,
  identity,
  workspaceMembershipId,
}: Props) {
  const copy = useOperationalHomeCopy();
  const { formatDate, formatNumber } = useInterfaceLocale();
  const titleId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <section className="operational-home-attention" aria-labelledby={titleId}>
      <header className="operational-home-attention-heading">
        <h3 id={titleId}>{copy.attention.title}</h3>
        <div className="operational-home-attention-actions">
          <button
            type="button"
            ref={trigger}
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            onClick={() => {
              if (open) heading.current?.focus();
              else setOpen(true);
            }}
          >
            {copy.attention.seeAll}
          </button>
          <button type="button" onClick={onOpenMyTasks}>
            {copy.attention.openMyTasks}
          </button>
        </div>
      </header>
      {attention.tasks.length === 0 ? (
        <p className="operational-home-attention-note">
          {copy.attention.empty({
            company: company.displayName,
            today: formatDate(today),
          })}
        </p>
      ) : (
        <>
          <p className="operational-home-attention-note">
            {copy.attention.truncated({
              shown: formatNumber(attention.tasks.length),
              total: formatNumber(attention.matchingCount),
            })}
          </p>
          <AttentionTaskList tasks={attention.tasks} onOpenTask={onOpenTask} />
        </>
      )}
      {open && (
        <AttentionTasksPanel
          company={company}
          identity={identity}
          workspaceMembershipId={workspaceMembershipId}
          panelId={panelId}
          headingRef={heading}
          onOpenTask={onOpenTask}
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        />
      )}
    </section>
  );
}
