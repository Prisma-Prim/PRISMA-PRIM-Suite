import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ApiResult } from '../api/authenticated-api-client';
import {
  conflictCode,
  createAuthenticatedApiClient,
} from '../api/authenticated-api-client';
import { useInterfaceLocale } from '../localization/interface-locale';
import { useProjectLifecycleCopy } from '../project/project-lifecycle-localized.copy';
import type { ContractView } from './contract-response';
import { useContractProjectsCopy } from './contract-projects.copy';
import {
  readContractProjectCandidates,
  readContractProjectLink,
  type ContractProjectCandidate,
  type ContractProjectLink,
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
  protectedCommand,
  reject,
  onLinked,
  onProtectionChange,
  onReload,
  onOpenProject,
}: {
  identity: BrowserIdentity;
  companyId: string;
  opportunityId: string;
  contract: ContractView;
  mayLink: boolean;
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
  const read = useRef<AbortController | undefined>(undefined),
    pending = useRef<AbortController | undefined>(undefined),
    attempt = useRef<
      | { body: string; key: string; project: ContractProjectCandidate }
      | undefined
    >(undefined);
  const eligible = mayLink && contract.version.executionState === 'EXECUTED';
  const busy =
    feedback === 'running' || feedback === 'uncertain' || protectedCommand;
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
    const controller = new AbortController();
    read.current = controller;
    async function loadCandidates() {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (controller.signal.aborted) return;
        const result = await api.request<unknown>(
          `/contracts/opportunities/${encodeURIComponent(opportunityId)}/project-candidates`,
          { companyContextId: companyId, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const denied = await reject(result, controller.signal);
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
      }
    }
    void loadCandidates();
    return () => controller.abort();
    // The parent keys this session by actor, Company and all captured authority.
    // Revision changes after our own successful link retain feedback and selection.
  }, [identity, companyId, opportunityId, eligible]);
  useEffect(() => {
    onProtectionChange(feedback === 'running' || feedback === 'uncertain');
  }, [feedback, onProtectionChange]);
  useEffect(
    () => () => {
      read.current?.abort();
      pending.current?.abort();
      onProtectionChange(false);
    },
    [onProtectionChange],
  );

  async function execute(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!eligible || feedback === 'running' || protectedCommand || terminal)
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
          }
        : undefined);
    if (!command) return;
    attempt.current = command;
    const controller = new AbortController();
    pending.current = controller;
    setFeedback('running');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(
        `/contracts/opportunities/${encodeURIComponent(opportunityId)}/projects`,
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
      const denied = await reject(result, controller.signal);
      if (controller.signal.aborted) return;
      if (denied) {
        attempt.current = undefined;
        setFeedback('denied');
      } else if (result.status === 'ok') {
        const link = readContractProjectLink(result.value);
        if (
          link.contractId !== contract.id ||
          link.projectId !== command.project.id ||
          link.revision !== contract.revision + 1
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
        onLinked(link, command.project);
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
    }
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
                                  `${copy('reference')} ${other.illustrativeReference}`,
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
