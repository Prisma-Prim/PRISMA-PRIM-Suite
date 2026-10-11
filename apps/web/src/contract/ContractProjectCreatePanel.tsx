import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  conflictCode,
  type ApiResult,
} from '../api/authenticated-api-client';
import { useContractProjectCreateCopy } from './contract-project-create.copy';
import { contractPath, type ContractView } from './contract-response';
import {
  readCreatedContractProject,
  type ContractProjectLink,
  type ProjectSummary,
} from './contract-projects-response';
type Feedback =
  | 'idle'
  | 'running'
  | 'uncertain'
  | 'changed'
  | 'limit'
  | 'capacity'
  | 'invalid'
  | 'denied'
  | 'unavailable'
  | 'stale'
  | 'conflict'
  | 'success';
export function ContractProjectCreatePanel({
  identity,
  companyId,
  opportunityId,
  contractId,
  contractKind,
  revision,
  initialTitle,
  candidates,
  protectedCommand,
  reject,
  onCreated,
  onCandidatesChanged,
  onProtectionChange,
}: {
  identity: BrowserIdentity;
  companyId: string;
  opportunityId: string;
  contractId: string;
  contractKind: ContractView['kind'];
  revision: number;
  initialTitle: string;
  candidates: readonly ProjectSummary[] | undefined;
  protectedCommand: boolean;
  reject: (
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ) => Promise<'unauthorized' | 'forbidden' | undefined>;
  onCreated: (link: ContractProjectLink, project: ProjectSummary) => void;
  onCandidatesChanged: () => void;
  onProtectionChange: (value: boolean) => void;
}) {
  const copy = useContractProjectCreateCopy();
  const [title, setTitle] = useState(initialTitle),
    [acknowledgedSet, setAcknowledgedSet] = useState<string | undefined>(
      undefined,
    ),
    [feedback, setFeedback] = useState<Feedback>('idle');
  const setStamp =
    candidates === undefined
      ? undefined
      : JSON.stringify(candidates.map((project) => project.id).sort());
  const acknowledged = setStamp !== undefined && acknowledgedSet === setStamp;
  const attempt = useRef<
      { body: string; key: string; revision: number } | undefined
    >(undefined),
    pending = useRef<AbortController | undefined>(undefined);
  const busy =
    feedback === 'running' || feedback === 'uncertain' || protectedCommand;
  const terminal = [
    'denied',
    'unavailable',
    'stale',
    'conflict',
    'limit',
    'capacity',
    'success',
  ].includes(feedback);
  useEffect(() => {
    onProtectionChange(feedback === 'running' || feedback === 'uncertain');
  }, [feedback, onProtectionChange]);
  useEffect(
    () => () => {
      pending.current?.abort();
      onProtectionChange(false);
    },
    [onProtectionChange],
  );

  async function execute(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (feedback === 'running' || protectedCommand || terminal) return;
    if (
      !attempt.current &&
      (!acknowledged ||
        !title.trim() ||
        title.trim().length > 200 ||
        !candidates)
    ) {
      setFeedback('invalid');
      return;
    }
    const command = attempt.current ?? {
      key: crypto.randomUUID(),
      revision,
      body: JSON.stringify({
        title,
        acknowledgedCandidateProjectIds:
          candidates?.map((project) => project.id) ?? [],
        expectedContractRevision: revision,
      }),
    };
    attempt.current = command;
    const controller = new AbortController();
    pending.current = controller;
    setFeedback('running');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(
        `${contractPath(opportunityId, { id: contractId, kind: contractKind })}/projects/create`,
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
        const { project, link } = readCreatedContractProject(result.value);
        if (
          link.contractId !== contractId ||
          link.revision !== command.revision + 1
        )
          throw new Error('Mismatched created Project result.');
        attempt.current = undefined;
        setFeedback('success');
        onCreated(link, project);
      } else if (result.status === 'validation') {
        attempt.current = undefined;
        setFeedback('invalid');
      } else if (result.status === 'notFound') {
        attempt.current = undefined;
        setFeedback('unavailable');
      } else if (result.status === 'conflict') {
        attempt.current = undefined;
        switch (conflictCode(result)) {
          case 'PROJECT_CANDIDATES_CHANGED':
            setAcknowledgedSet(undefined);
            setFeedback('changed');
            onCandidatesChanged();
            break;
          case 'PROJECT_CANDIDATE_LIMIT':
            setFeedback('limit');
            break;
          case 'STALE_CONTRACT_REVISION':
            setFeedback('stale');
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
  return (
    <section aria-label={copy('title')}>
      <h6>{copy('title')}</h6>
      <form onSubmit={(event) => void execute(event)}>
        <fieldset disabled={busy || terminal || candidates === undefined}>
          <label>
            {copy('projectTitle')}
            <input
              type="text"
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="contract-warning-acknowledgement">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) =>
                setAcknowledgedSet(event.target.checked ? setStamp : undefined)
              }
            />
            {copy('acknowledge')}
          </label>
          <button type="submit" disabled={!acknowledged || !title.trim()}>
            {copy('confirm')}
          </button>
        </fieldset>
      </form>
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
    </section>
  );
}
