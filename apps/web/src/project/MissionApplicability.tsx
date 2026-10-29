import { useApplicabilityHistory } from './use-applicability-history';
import { ApplicabilityHistoryView } from './ApplicabilityHistoryView';
import { clientReadAuthority } from './project-authority';
import { useEffect, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { Select } from '../presentation/Select';
import type { CopiedPilotTemplatePlan } from './project-template-response';
import { useProjectTaskCopy } from './task.copy';
import { useMissionApplicabilityCopy } from './mission-applicability.copy';
import {
  readApplicabilityReceipt,
  readMissionApplicability,
  type ApplicabilityIntent,
  type ApplicabilitySnapshot,
} from './mission-applicability-response';
import { ApplicabilityProposalForm } from './ApplicabilityProposalForm';
import { ApplicabilityDecisionForm } from './ApplicabilityDecisionForm';
import { ApplicabilityFactView } from './ApplicabilityFactView';
import './mission-applicability.css';

interface Props {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string;
  plan: CopiedPilotTemplatePlan;
  originalClientGeneration?: number;
  onOpenTask?: (taskId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected?: (companyId: string) => void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
  onActivityRecorded?: () => Promise<void> | void;
}
function readAuthority(actor: ActorContext) {
  const c = actor.activeCompany;
  return [
    actor.active,
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    clientReadAuthority(actor),
    c?.id,
    c?.projectPermissions?.includes('project.read'),
    c?.projectPermissionAssignmentId,
    c?.projectPermissionSetVersion,
    c?.taskPermissions?.includes('task.read'),
    c?.taskPermissionAssignmentId,
    c?.taskPermissionSetVersion,
    c?.projectTemplatePermissions?.includes('project.template.read'),
    c?.projectTemplatePermissions?.includes('project.template.pilot.read'),
    c?.projectTemplatePermissionAssignmentId,
    c?.projectTemplatePermissionSetVersion,
    c?.documentPermissions?.includes('document.read'),
    c?.documentPermissionAssignmentId,
    c?.documentPermissionSetVersion,
    c?.documentPermissions?.includes('document.content.read'),
    c?.documentContentReaderAssignmentId,
    c?.documentContentReaderPermissionSetVersion,
    c?.documentPermissions?.includes('document.mission_deliverable.access'),
    c?.missionDeliverableAccessAssignmentId,
    c?.missionDeliverableAccessPermissionSetVersion,
  ];
}
function coordinatorAuthority(actor: ActorContext) {
  const c = actor.activeCompany;
  return JSON.stringify([
    c?.missionApplicabilityProposalPermissions,
    c?.missionApplicabilityCoordinatorAssignmentId,
    c?.missionApplicabilityCoordinatorPermissionSetVersion,
  ]);
}
function approverAuthority(actor: ActorContext) {
  const c = actor.activeCompany;
  return JSON.stringify([
    c?.missionApplicabilityDecisionPermissions,
    c?.missionApplicabilityApproverAssignmentId,
    c?.missionApplicabilityApproverPermissionSetVersion,
  ]);
}
function canCoordinate(actor: ActorContext) {
  const c = actor.activeCompany;
  return Boolean(
    c?.missionApplicabilityCoordinatorAssignmentId &&
    c.missionApplicabilityCoordinatorPermissionSetVersion === 'v1' &&
    c.missionApplicabilityProposalPermissions?.includes(
      'project.mission_applicability.propose',
    ),
  );
}
function canDecide(actor: ActorContext) {
  const c = actor.activeCompany;
  return Boolean(
    c?.missionApplicabilityApproverAssignmentId &&
    c.missionApplicabilityApproverPermissionSetVersion === 'v1' &&
    c.missionApplicabilityDecisionPermissions?.includes(
      'project.mission_applicability.decide',
    ) &&
    c.missionApplicabilityDecisionPermissions.includes(
      'project.mission_applicability.restore',
    ),
  );
}

/** A full Actor recovery consumes more than this independent protected business reader. */
export function MissionApplicability(props: Props) {
  const [renewal, setRenewal] = useState(0);
  const captureRecovery = useAuthorityLifetime(
    JSON.stringify(props.actor),
    props.identity,
  );
  const key = JSON.stringify([
    readAuthority(props.actor),
    props.projectId,
    props.plan,
    props.originalClientGeneration,
    renewal,
  ]);
  return (
    <ApplicabilityReader
      key={key}
      {...props}
      captureRecovery={captureRecovery}
      onRenew={() => setRenewal((value) => value + 1)}
    />
  );
}
type Command = {
  path: string;
  body: string;
  key: string;
  consumer: 'proposal' | 'decision';
  valid: () => boolean;
  recoveryValid: () => boolean;
  controller: AbortController;
};
type Mutation =
  | { kind: 'idle' }
  | {
      kind: 'pending' | 'uncertain' | 'denied' | 'conflict' | 'invalid';
      command: Command;
    }
  | {
      kind: 'confirmed';
      command: Command;
      receipt: ReturnType<typeof readApplicabilityReceipt>;
    };
type ReadState =
  | 'loading'
  | 'ready'
  | 'error'
  | 'malformed'
  | 'denied'
  | 'unavailable'
  | 'unsupported'
  | 'missing';

function ApplicabilityReader(
  props: Props & { captureRecovery: () => () => boolean; onRenew: () => void },
) {
  const copy = useMissionApplicabilityCopy(),
    taskCopy = useProjectTaskCopy(),
    path = `/projects/${props.projectId}/mission-applicability`,
    companyId = props.actor.activeCompany?.id;
  const captureRead = useAuthorityLifetime(props.projectId, props.identity),
    coordinatorKey = coordinatorAuthority(props.actor),
    approverKey = approverAuthority(props.actor);
  const captureCoordinator = useAuthorityLifetime(
      coordinatorKey,
      props.identity,
    ),
    captureApprover = useAuthorityLifetime(approverKey, props.identity);
  const protection = useRef({ retired: false }),
    readRequest = useRef<AbortController | undefined>(undefined),
    writeRequest = useRef<AbortController | undefined>(undefined);
  const [state, setState] = useState<ReadState>('loading'),
    [snapshot, setSnapshot] = useState<ApplicabilitySnapshot | null>(null),
    [selected, setSelected] = useState(props.plan.activities[0]?.taskId ?? ''),
    [mutation, setMutation] = useState<Mutation>({ kind: 'idle' }),
    [denied, setDenied] = useState({ proposal: '', decision: '' });
  function localCapture() {
    const owner = protection.current,
      live = captureRead();
    return () => live() && !owner.retired;
  }
  function writeCapture(kind: 'proposal' | 'decision') {
    const read = localCapture(),
      write = (kind === 'proposal' ? captureCoordinator : captureApprover)();
    return () => read() && write();
  }
  if (mutation.kind !== 'idle' && !mutation.command.valid())
    setMutation({ kind: 'idle' });
  async function recover(
    result: ApiResult<unknown>,
    valid: () => boolean,
    recoveryValid: () => boolean,
    signal: AbortSignal,
  ) {
    if (!valid() || !recoveryValid()) return;
    await handleAuthenticatedAccessRejection({
      result,
      identity: props.identity,
      companyContextId: companyId,
      onActorRevalidated: props.onActorRevalidated ?? (() => undefined),
      onCompanyContextRejected:
        props.onCompanyContextRejected ?? (() => undefined),
      onWorkspaceAccessRejected: props.onWorkspaceAccessRejected,
      signal,
      isCurrent: () => valid() && recoveryValid(),
    });
  }
  function retire(next: ReadState) {
    protection.current.retired = true;
    readRequest.current?.abort();
    writeRequest.current?.abort();
    setSnapshot(null);
    history.clear();
    setMutation({ kind: 'idle' });
    setState(next);
  }
  const history = useApplicabilityHistory({
    path,
    identity: props.identity,
    companyId,
    plan: props.plan,
    snapshot,
    capture: localCapture,
    captureRecovery: props.captureRecovery,
    recover,
    onDenied: () => retire('denied'),
  });
  async function load() {
    const valid = localCapture(),
      recoveryValid = props.captureRecovery();
    if (!valid()) return;
    history.close();
    readRequest.current?.abort();
    const controller = new AbortController();
    readRequest.current = controller;
    const live = () => valid() && !controller.signal.aborted;
    setState('loading');
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!live()) return;
      const result = await api.request<unknown>(path, {
        companyContextId: companyId,
        signal: controller.signal,
      });
      if (!live()) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        await recover(result, live, recoveryValid, controller.signal);
        if (live()) retire('denied');
        return;
      }
      if (result.status === 'notFound') {
        retire('missing');
        return;
      }
      if (result.status !== 'ok') {
        setState('error');
        return;
      }
      let value: ReturnType<typeof readMissionApplicability>;
      try {
        value = readMissionApplicability(result.value, {
          projectId: props.projectId,
          plan: props.plan,
        });
      } catch {
        setState('malformed');
        return;
      }
      if (!value) {
        setSnapshot(null);
        history.clear();
        setState('unsupported');
        return;
      }
      if (value.kind === 'unavailable') {
        retire('unavailable');
        return;
      }
      setSnapshot(value);
      setState('ready');
      setMutation((current) =>
        current.kind === 'conflict' || current.kind === 'invalid'
          ? { kind: 'idle' }
          : current,
      );

      if (live()) await history.loadPage();
    } catch {
      if (live()) setState('error');
    }
  }
  useEffect(() => {
    void load();
    return () => {
      readRequest.current?.abort();
      writeRequest.current?.abort();
    };
    // Authority changes replace this owner; locale and unrelated grants preserve its reads.
  }, []);
  async function execute(command: Command) {
    if (!command.valid()) return;
    setMutation({ kind: 'pending', command });
    writeRequest.current = command.controller;
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!command.valid() || command.controller.signal.aborted) return;
      const result = await api.request<unknown>(command.path, {
        method: 'POST',
        body: command.body,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': command.key,
        },
        companyContextId: companyId,
        signal: command.controller.signal,
      });
      if (!command.valid() || command.controller.signal.aborted) return;
      if (result.status === 'ok') {
        let receipt: ReturnType<typeof readApplicabilityReceipt>;
        try {
          receipt = readApplicabilityReceipt(result.value, props.projectId);
        } catch {
          setMutation({ kind: 'uncertain', command });
          return;
        }
        setMutation({ kind: 'confirmed', command, receipt });
        if (command.recoveryValid() && props.onActivityRecorded) {
          try {
            await props.onActivityRecorded();
          } catch {
            // A separate Activity refresh cannot undo the confirmed command receipt.
          }
          if (!command.valid()) return;
        }
        if (command.valid()) await load();
        return;
      }
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        setDenied((current) => ({
          ...current,
          [command.consumer]:
            command.consumer === 'proposal' ? coordinatorKey : approverKey,
        }));
        setMutation({ kind: 'denied', command });
        await recover(
          result,
          command.valid,
          command.recoveryValid,
          command.controller.signal,
        );
        return;
      }
      if (result.status === 'notFound') {
        retire('missing');
        return;
      }
      if (result.status === 'conflict') {
        setMutation({ kind: 'conflict', command });
        return;
      }
      if (result.status === 'validation') {
        setMutation({ kind: 'invalid', command });
        return;
      }
      setMutation({ kind: 'uncertain', command });
    } catch {
      if (command.valid() && !command.controller.signal.aborted)
        setMutation({ kind: 'uncertain', command });
    }
  }
  function record(
    body: ApplicabilityIntent,
    consumer: 'proposal' | 'decision',
  ) {
    if (
      mutation.kind === 'pending' ||
      mutation.kind === 'uncertain' ||
      mutation.kind === 'conflict' ||
      state !== 'ready'
    )
      return;
    const valid = writeCapture(consumer);
    if (!valid()) return;
    void execute({
      path,
      body: JSON.stringify(body),
      key: crypto.randomUUID(),
      consumer,
      valid,
      recoveryValid: props.captureRecovery(),
      controller: new AbortController(),
    });
  }
  const knownFacts = history.knownFacts;
  const activity = snapshot?.activities.find((row) => row.task.id === selected),
    busy = mutation.kind === 'pending' || mutation.kind === 'uncertain',
    blocked =
      busy ||
      mutation.kind === 'conflict' ||
      state !== 'ready' ||
      !snapshot?.mutable;
  const status =
    mutation.kind === 'confirmed'
      ? mutation.receipt.action === 'unchanged'
        ? 'unchanged'
        : 'confirmed'
      : mutation.kind === 'idle'
        ? null
        : mutation.kind;
  const selectId = `applicability-activity-${props.projectId}`;
  return (
    <section
      className="project-template-plan mission-applicability"
      aria-label={copy('title')}
    >
      <h4>{copy('title')}</h4>
      <p>{copy('notice')}</p>
      <p>{copy('reportedNotice')}</p>
      <p className="project-warning">{copy('certificationHold')}</p>
      {state !== 'ready' && (
        <p role={state === 'loading' ? 'status' : 'alert'}>{copy(state)}</p>
      )}
      <button
        type="button"
        onClick={() =>
          protection.current.retired ? props.onRenew() : void load()
        }
      >
        {copy('reload')}
      </button>
      {status && (
        <p
          role={
            mutation.kind === 'confirmed' || mutation.kind === 'pending'
              ? 'status'
              : 'alert'
          }
        >
          {copy(status)}
        </p>
      )}
      {mutation.kind === 'uncertain' && (
        <button
          type="button"
          onClick={() => {
            if (mutation.command.valid()) void execute(mutation.command);
          }}
        >
          {copy('retry')}
        </button>
      )}
      {snapshot && (
        <>
          {!snapshot.mutable && <p>{copy('closed')}</p>}
          {snapshot.revision === 0 && <p>{copy('empty')}</p>}
          <label htmlFor={selectId}>{copy('select')}</label>
          <Select
            id={selectId}
            value={selected}
            options={snapshot.activities.map((row) => ({
              value: row.task.id,
              label: row.key + ' — ' + row.title,
            }))}
            onValueChange={(value) => {
              history.close();
              setSelected(value);
            }}
            disabled={busy}
          />
          {activity && (
            <div className="applicability-activity">
              <h5>
                {activity.key} — {activity.title}
              </h5>
              <p className="applicability-literal">{activity.activity}</p>
              <p className="applicability-literal">{activity.intendedResult}</p>
              <p>
                {copy('currentTask')}: {activity.task.title} —{' '}
                {taskCopy.states[activity.task.status]}
              </p>
              <strong>{copy(activity.applicability)}</strong>
              {props.onOpenTask && (
                <button
                  type="button"
                  onClick={() => {
                    const live = localCapture();
                    if (live()) props.onOpenTask?.(activity.task.id);
                  }}
                >
                  {copy('openTask')}
                </button>
              )}
              {activity.pendingProposal ? (
                <ApplicabilityFactView
                  fact={activity.pendingProposal}
                  knownFacts={knownFacts}
                  onInspect={history.inspect}
                />
              ) : (
                <p>{copy('noProposal')}</p>
              )}
              {activity.activeApproval && (
                <ApplicabilityFactView
                  fact={activity.activeApproval}
                  knownFacts={knownFacts}
                  onInspect={history.inspect}
                />
              )}
              {activity.lastDecision && !activity.activeApproval && (
                <ApplicabilityFactView
                  fact={activity.lastDecision}
                  knownFacts={knownFacts}
                  onInspect={history.inspect}
                />
              )}
              {activity.lastRestoration && (
                <ApplicabilityFactView
                  fact={activity.lastRestoration}
                  knownFacts={knownFacts}
                  onInspect={history.inspect}
                />
              )}
              {canCoordinate(props.actor) &&
                !activity.activeApproval &&
                (denied.proposal === coordinatorKey ? (
                  <p role="alert">{copy('denied')}</p>
                ) : (
                  <ApplicabilityProposalForm
                    key={`proposal:${selected}:${coordinatorKey}:${activity.pendingProposal?.id ?? 'new'}`}
                    snapshot={snapshot}
                    activity={activity}
                    disabled={blocked}
                    capture={() => writeCapture('proposal')}
                    onRecord={(body) => record(body, 'proposal')}
                  />
                ))}
              {canDecide(props.actor) &&
                (activity.pendingProposal || activity.activeApproval) &&
                (denied.decision === approverKey ? (
                  <p role="alert">{copy('denied')}</p>
                ) : (
                  <ApplicabilityDecisionForm
                    key={`decision:${selected}:${approverKey}:${activity.pendingProposal?.id ?? activity.activeApproval?.id}`}
                    snapshot={snapshot}
                    activity={activity}
                    disabled={blocked}
                    capture={() => writeCapture('decision')}
                    onRecord={(body) => record(body, 'decision')}
                  />
                ))}
            </div>
          )}
          <ApplicabilityHistoryView history={history} />
        </>
      )}
    </section>
  );
}
