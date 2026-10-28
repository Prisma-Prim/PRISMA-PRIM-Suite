import { MissionPlanAccessLifetime } from './mission-plan-access-lifetime';
import { useState, type ReactNode } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import {
  missionPlanAuthority,
  type PlanAuthority,
} from './mission-plan-authority';
import { MissionPlanPicker } from './MissionPlanPicker';
import { MissionPlanContent } from './MissionPlanContent';
import { MissionPlanForm } from './MissionPlanForm';
import { readVersion, type PlanVersion } from './mission-plan-response';
import { useMissionPlanCopy } from './mission-plan.copy';
import { useMissionPlanCommand, type PlanContext } from './use-mission-plan-io';
import './mission-plan.css';
export type MissionPlanProps = Omit<PlanContext, 'authority'> & {
  actor: ActorContext;
  onActivityRecorded?: () => void | Promise<void>;
};
export function MissionPlanBoundary({
  actor,
  identity,
  purpose,
  children,
  ...handlers
}: Omit<PlanContext, 'authority'> & {
  actor: ActorContext;
  identity: BrowserIdentity;
  purpose: 'configure' | 'create' | 'copy';
  children: (authority: PlanAuthority) => ReactNode;
}) {
  const [session, setSession] = useState({ identity, generation: 0 });
  if (session.identity !== identity) {
    setSession({ identity, generation: session.generation + 1 });
    return null;
  }
  const authority = missionPlanAuthority(actor, purpose);
  return authority ? (
    <div
      className="mission-plan-region"
      key={`${session.generation}:${authority.key}`}
    >
      <MissionPlanAccessLifetime
        actor={actor}
        context={{ identity, authority, ...handlers }}
      >
        {children(authority)}
      </MissionPlanAccessLifetime>
    </div>
  ) : null;
}
export function MissionPlanWorkspace(props: MissionPlanProps) {
  return (
    <MissionPlanBoundary {...props} purpose="configure">
      {(authority) => <Configuration {...props} authority={authority} />}
    </MissionPlanBoundary>
  );
}
function Configuration({
  authority,
  onActivityRecorded,
  ...props
}: MissionPlanProps & { authority: PlanAuthority }) {
  const context = { ...props, authority },
    c = useMissionPlanCopy();
  const [selected, setSelected] = useState<PlanVersion | null>(null),
    [editor, setEditor] = useState<{ basis: PlanVersion | null } | null>(null),
    [revision, setRevision] = useState(0);
  const command = useMissionPlanCommand<PlanVersion>(
    context,
    (version) => {
      setSelected(version);
      setEditor(null);
      setRevision((n) => n + 1);
      void onActivityRecorded?.();
    },
    'saved',
  );
  return (
    <section aria-label={c('heading')}>
      <h3>{c('heading')}</h3>
      <p>{c('help')}</p>
      <MissionPlanPicker
        key={revision}
        context={context}
        disabled={command.blocked}
        onSelected={(v) => {
          setSelected(v);
          setEditor(null);
        }}
      />
      {selected && <MissionPlanContent version={selected} />}
      {authority.canPublish && (
        <div className="mission-plan-actions">
          <button
            type="button"
            disabled={command.blocked}
            onClick={() => setEditor({ basis: null })}
          >
            {c('new')}
          </button>
          {selected && (
            <button
              type="button"
              disabled={command.blocked}
              onClick={() => setEditor({ basis: selected })}
            >
              {c('edit')}
            </button>
          )}
        </div>
      )}
      {editor && (
        <MissionPlanForm
          key={editor.basis?.id ?? 'new'}
          initial={editor.basis}
          disabled={command.blocked}
          onCancel={() => setEditor(null)}
          onPublish={(content) => {
            const basis = editor.basis,
              payload = basis
                ? { ...content, expectedHeadVersion: basis.versionNumber }
                : content;
            command.start(
              basis
                ? `/mission-plans/${basis.planId}/versions`
                : '/mission-plans',
              payload,
              (value) => {
                const v = readVersion(value, authority);
                if (
                  v.actor.membershipId !== authority.membershipId ||
                  v.versionNumber !== (basis?.versionNumber ?? 0) + 1 ||
                  (basis && v.planId !== basis.planId) ||
                  v.title !== content.title ||
                  JSON.stringify(v.activities) !==
                    JSON.stringify(content.activities)
                )
                  throw new Error('Unexpected publication receipt.');
                return v;
              },
            );
          }}
        />
      )}
      <MissionPlanCommandStatus command={command} />
    </section>
  );
}
export function MissionPlanCommandStatus({
  command,
}: {
  command: {
    state:
      | { kind: 'idle'; notice: string | null; error: string | null }
      | { kind: 'pending' | 'uncertain' };
    retry: () => void;
  };
}) {
  const c = useMissionPlanCopy(),
    s = command.state;
  return (
    <>
      {s.kind === 'pending' && <p role="status">{c('pending')}</p>}
      {s.kind === 'uncertain' && (
        <>
          <p role="alert">{c('uncertain')}</p>
          <button type="button" onClick={command.retry}>
            {c('retry')}
          </button>
        </>
      )}
      {s.kind === 'idle' && (
        <>
          {s.notice && (s.notice === 'saved' || s.notice === 'created') && (
            <p role="status">{c(s.notice)}</p>
          )}
          {s.error &&
            (s.error === 'invalid' ||
              s.error === 'stale' ||
              s.error === 'conflict' ||
              s.error === 'denied' ||
              s.error === 'missing') && <p role="alert">{c(s.error)}</p>}
        </>
      )}
    </>
  );
}
