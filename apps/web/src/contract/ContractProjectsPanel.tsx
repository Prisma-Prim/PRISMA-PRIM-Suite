import {
  ContractMissionPlanCreatePanel,
  type ContractMissionPlanContext,
} from './ContractMissionPlanCreatePanel';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useRequestLifetime } from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import type { BrowserIdentity } from '../access-composition';
import type { ApiResult } from '../api/authenticated-api-client';
import {
  conflictCode,
  createAuthenticatedApiClient,
} from '../api/authenticated-api-client';
import { useInterfaceLocale } from '../localization/interface-locale';
import { useProjectLifecycleCopy } from '../project/project-lifecycle-localized.copy';
import { contractPath, type ContractView } from './contract-response';
import { ContractProjectCreatePanel } from './ContractProjectCreatePanel';
import { useContractProjectsCopy } from './contract-projects.copy';
import {
  readContractProjectCandidates,
  readContractProjectLink,
  type ContractProjectCandidate,
  type ContractProjectLink,
  type ProjectSummary,
} from './contract-projects-response';

type Load =
  | { kind: 'loading' | 'error' | 'denied' | 'unavailable' }
  | { kind: 'ready'; items: ContractProjectCandidate[] };
type Feedback =
  | 'idle'
  | 'running'
  | 'uncertain'
  | 'invalid'
  | 'denied'
  | 'unavailable'
  | 'stale'
  | 'ineligible'
  | 'already'
  | 'capacity'
  | 'conflict'
  | 'success';
export function ContractProjectsPanel({
  identity,
  companyId,
  opportunityId,
  contract,
  mayLink,
  mayCreate,
  opportunityTitle,
  protectedCommand,
  reject,
  onLinked,
  onProtectionChange,
  onReload,
  onOpenProject,
  missionPlan,
}: {
  missionPlan?: ContractMissionPlanContext;
  identity: BrowserIdentity;
  companyId: string;
  opportunityId: string;
  contract: Pick<
    ContractView,
    'id' | 'kind' | 'revision' | 'linkedProjects'
  > & { version: Pick<ContractView['version'], 'executionState'> };
  mayLink: boolean;
  mayCreate: boolean;
  opportunityTitle: string;
  protectedCommand: boolean;
  reject: (
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ) => Promise<'unauthorized' | 'forbidden' | undefined>;
  onLinked: (
    link: ContractProjectLink,
    project: ContractProjectCandidate,
  ) => void;
  onProtectionChange: (protectedCommand: boolean) => void;
  onReload: () => void;
  onOpenProject?: (projectId: string) => void;
}) {
  const copy = useContractProjectsCopy(),
    { formatDateTime } = useInterfaceLocale(),
    { statusLabels } = useProjectLifecycleCopy();
  const [load, setLoad] = useState<Load>({ kind: 'loading' }),
    [selected, setSelected] = useState(''),
    [feedback, setFeedback] = useState<Feedback>('idle');
  const [plannedProtected, setPlannedProtected] = useState(false),
    [creationProtected, setCreationProtected] = useState(false),
    [candidateRefresh, setCandidateRefresh] = useState(0);
  const attempt = useRef<
    | {
        body: string;
        key: string;
        project: ContractProjectCandidate;
        revision: number;
      }
    | undefined
  >(undefined);
  const eligible = mayLink && contract.version.executionState === 'EXECUTED';
  const lifetime = useRequestLifetime(
    identity,
    JSON.stringify([
      identity.loaded,
      identity.signedIn,
      companyId,
      opportunityId,
      contract.id,
      contract.kind,
    ]),
  );
  const reads = useScopedOperationGroup(JSON.stringify([lifetime, eligible]));
  const writes = useScopedOperationGroup(String(lifetime));
  const callbacks = useRef({ reject, onLinked });
  useLayoutEffect(() => {
    callbacks.current = { reject, onLinked };
  });
  const busy =
    feedback === 'running' ||
    feedback === 'uncertain' ||
    protectedCommand ||
    creationProtected ||
    plannedProtected;
  const terminal = [
    'denied',
    'unavailable',
    'stale',
    'ineligible',
    'already',
    'capacity',
    'conflict',
  ].includes(feedback);
  useEffect(() => {
    if (!eligible) return;
    const controller = reads.beginLatest();
    if (!controller) return;
    const rejected = callbacks.current.reject;
    setLoad({ kind: 'loading' });
    const loadCandidates = async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (controller.signal.aborted) return;
        const result = await api.request(
          `${contractPath(opportunityId, contract)}/project-candidates`,
          { companyContextId: companyId, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const denied = await rejected(result, controller.signal);
        if (controller.signal.aborted) return;
        if (denied) setLoad({ kind: 'denied' });
        else if (result.status === 'notFound') setLoad({ kind: 'unavailable' });
        else if (result.status === 'ok')
          setLoad({
            kind: 'ready',
            items: readContractProjectCandidates(result.value),
          });
        else setLoad({ kind: 'error' });
      } catch {
        if (!controller.signal.aborted) setLoad({ kind: 'error' });
      } finally {
        controller.release();
      }
    };
    void loadCandidates();
    return controller.retire;
    // The parent keys this session by actor, Company and all captured authority.
    // Revision changes after our own successful link retain feedback and selection.
  }, [identity, companyId, opportunityId, eligible, candidateRefresh, reads]);
  useEffect(() => {
    onProtectionChange(
      feedback === 'running' ||
        feedback === 'uncertain' ||
        creationProtected ||
        plannedProtected,
    );
  }, [feedback, creationProtected, plannedProtected, onProtectionChange]);
  useEffect(
    () => () => {
      onProtectionChange(false);
    },
    [onProtectionChange],
  );

  async function execute(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (
      writes.isPending() ||
      !eligible ||
      feedback === 'running' ||
      protectedCommand ||
      creationProtected ||
      plannedProtected ||
      terminal
    )
      return;
    const project =
      load.kind === 'ready'
        ? load.items.find((item) => item.id === selected && !item.alreadyLinked)
        : undefined;
    if (!attempt.current && !project) {
      setFeedback('invalid');
      return;
    }
    const command =
      attempt.current ??
      (project
        ? {
            key: crypto.randomUUID(),
            body: JSON.stringify({
              projectId: project.id,
              expectedContractRevision: contract.revision,
            }),
            project,
            revision: contract.revision,
          }
        : undefined);
    if (!command) return;
    attempt.current = command;
    const controller = writes.begin();
    if (!controller) return;
    const rejected = callbacks.current.reject;
    setFeedback('running');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request(
        `${contractPath(opportunityId, contract)}/projects`,
        {
          method: 'POST',
          companyContextId: companyId,
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.key,
          },
          body: command.body,
        },
      );
      if (controller.signal.aborted) return;
      const denied = await rejected(result, controller.signal);
      if (controller.signal.aborted) return;
      if (denied) {
        attempt.current = undefined;
        setFeedback('denied');
      } else if (result.status === 'ok') {
        const link = readContractProjectLink(result.value);
        if (
          link.contractId !== contract.id ||
          link.projectId !== command.project.id ||
          link.revision !== command.revision + 1
        )
          throw new Error('Mismatched Project link result.');
        attempt.current = undefined;
        setFeedback('success');
        setLoad((current) =>
          current.kind === 'ready'
            ? {
                kind: 'ready',
                items: current.items.map((item) =>
                  item.id === link.projectId
                    ? { ...item, alreadyLinked: true }
                    : item,
                ),
              }
            : current,
        );
        controller.release();
        callbacks.current.onLinked(link, command.project);
      } else if (result.status === 'validation') {
        attempt.current = undefined;
        setFeedback('invalid');
      } else if (result.status === 'notFound') {
        attempt.current = undefined;
        setFeedback('unavailable');
      } else if (result.status === 'conflict') {
        attempt.current = undefined;
        switch (conflictCode(result)) {
          case 'STALE_CONTRACT_REVISION':
            setFeedback('stale');
            break;
          case 'PROJECT_NOT_ELIGIBLE':
            setFeedback('ineligible');
            break;
          case 'CONTRACT_PROJECT_ALREADY_LINKED':
            setFeedback('already');
            break;
          case 'CONTRACT_PROJECT_LINK_CAPACITY_EXCEEDED':
            setFeedback('capacity');
            break;
          default:
            setFeedback('conflict');
        }
      } else setFeedback('uncertain');
    } catch {
      if (!controller.signal.aborted) setFeedback('uncertain');
    } finally {
      controller.release();
    }
  }
  function created(link: ContractProjectLink, project: ProjectSummary) {
    const candidate = { ...project, alreadyLinked: true, otherContracts: [] };
    setLoad((current) =>
      current.kind === 'ready'
        ? {
            kind: 'ready',
            items: [
              candidate,
              ...current.items.filter((item) => item.id !== project.id),
            ].slice(0, 50),
          }
        : current,
    );
    onLinked(link, candidate);
  }
  if (!eligible && contract.linkedProjects.length === 0) return null;
  return (
    <section
      className="contract-projects contract-decision"
      aria-label={copy('title')}
    >
      <h5>{copy('title')}</h5>
      <h6>{copy('linked')}</h6>
      {contract.linkedProjects.length === 0 ? (
        <p>{copy('noLinked')}</p>
      ) : (
        <ul>
          {contract.linkedProjects.map((project) => (
            <li key={project.id}>
              <strong>{project.title}</strong> · {statusLabels[project.status]}{' '}
              ·{' '}
              <time dateTime={project.link.linkedAt}>
                {formatDateTime(project.link.linkedAt)}
              </time>
              {onOpenProject && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onOpenProject(project.id)}
                >
                  {copy('openProject')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {eligible && (
        <>
          {load.kind === 'ready' ? (
            load.items.length === 0 ? (
              <p>{copy('empty')}</p>
            ) : (
              <form onSubmit={(event) => void execute(event)}>
                <fieldset disabled={busy || terminal}>
                  <legend>{copy('candidates')}</legend>
                  {load.items.map((project) => (
                    <label key={project.id} className="contract-project-choice">
                      <input
                        type="radio"
                        name="contract-project"
                        value={project.id}
                        disabled={project.alreadyLinked}
                        checked={selected === project.id}
                        onChange={() => setSelected(project.id)}
                      />
                      <span>
                        <strong>{project.title}</strong> ·{' '}
                        {statusLabels[project.status]} ·{' '}
                        <time dateTime={project.createdAt}>
                          {formatDateTime(project.createdAt)}
                        </time>
                        {project.alreadyLinked && (
                          <span> · {copy('alreadyLinked')}</span>
                        )}
                        {project.otherContracts.length > 0 && (
                          <span>
                            {' '}
                            ·{' '}
                            {project.otherContracts
                              .map(
                                (other) =>
                                  `${copy(other.kind === 'PRECONTRACT' ? 'precontractReference' : 'reference')} ${other.illustrativeReference}`,
                              )
                              .join(', ')}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </fieldset>
                <button
                  type="submit"
                  disabled={
                    busy ||
                    terminal ||
                    !selected ||
                    load.items.some(
                      (item) => item.id === selected && item.alreadyLinked,
                    )
                  }
                >
                  {copy('link')}
                </button>
              </form>
            )
          ) : (
            <p role="status">
              {copy(
                load.kind === 'loading'
                  ? 'loading'
                  : load.kind === 'error'
                    ? 'error'
                    : load.kind,
              )}
            </p>
          )}
          {feedback !== 'idle' && <p role="status">{copy(feedback)}</p>}
          {mayCreate && (
            <ContractProjectCreatePanel
              identity={identity}
              companyId={companyId}
              opportunityId={opportunityId}
              contractId={contract.id}
              contractKind={contract.kind}
              revision={contract.revision}
              initialTitle={opportunityTitle}
              candidates={load.kind === 'ready' ? load.items : undefined}
              protectedCommand={
                protectedCommand ||
                feedback === 'running' ||
                feedback === 'uncertain' ||
                plannedProtected
              }
              reject={reject}
              onProtectionChange={setCreationProtected}
              onCandidatesChanged={() =>
                setCandidateRefresh((current) => current + 1)
              }
              onCreated={created}
            />
          )}
          {mayCreate && missionPlan && (
            <ContractMissionPlanCreatePanel
              missionPlan={missionPlan}
              identity={identity}
              companyId={companyId}
              opportunityId={opportunityId}
              contractId={contract.id}
              contractKind={contract.kind}
              revision={contract.revision}
              initialTitle={opportunityTitle}
              candidates={load.kind === 'ready' ? load.items : undefined}
              protectedCommand={
                protectedCommand ||
                creationProtected ||
                feedback === 'running' ||
                feedback === 'uncertain'
              }
              onProtectionChange={setPlannedProtected}
              onCandidatesChanged={() => setCandidateRefresh((n) => n + 1)}
              onCreated={created}
            />
          )}
          <button
            type="button"
            disabled={
              protectedCommand ||
              creationProtected ||
              feedback === 'running' ||
              feedback === 'uncertain' ||
              load.kind === 'loading'
            }
            onClick={() => setCandidateRefresh((n) => n + 1)}
          >
            {copy('refreshCandidates')}
          </button>
          {feedback === 'uncertain' && (
            <button
              type="button"
              disabled={protectedCommand}
              onClick={() => void execute()}
            >
              {copy('retry')}
            </button>
          )}
          <button type="button" disabled={busy} onClick={onReload}>
            {copy('reload')}
          </button>
        </>
      )}
    </section>
  );
}
