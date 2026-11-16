import type { PlanVersion } from '../mission-plan/mission-plan-response';
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
  source = { kind: 'empty' },
}: {
  source?:
    { kind: 'empty' } | { kind: 'missionPlan'; selected: PlanVersion | null };
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
  const attempt = useRef<
    { body: string; key: string; revision: number; path: string } | undefined
  >(undefined);
  const lifetime = useRequestLifetime(
    identity,
    JSON.stringify([
      identity.loaded,
      identity.signedIn,
      companyId,
      opportunityId,
      contractId,
      contractKind,
    ]),
  );
  const writes = useScopedOperationGroup(String(lifetime));
  const callbacks = useRef({ reject, onCreated, onCandidatesChanged });
  useLayoutEffect(() => {
    callbacks.current = { reject, onCreated, onCandidatesChanged };
  });
  const acknowledged =
    attempt.current !== undefined ||
    (setStamp !== undefined && acknowledgedSet === setStamp);
  const sourceMissing =
    source.kind === 'missionPlan' && source.selected === null;
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
      onProtectionChange(false);
    },
    [onProtectionChange],
  );

  async function execute(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (
      writes.isPending() ||
      feedback === 'running' ||
      protectedCommand ||
      terminal
    )
      return;
    if (
      !attempt.current &&
      (sourceMissing ||
        !acknowledged ||
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
      path: `${contractPath(opportunityId, { id: contractId, kind: contractKind })}/projects/${source.kind === 'empty' ? 'create' : 'create-from-mission-plan'}`,
      body: JSON.stringify({
        title,
        acknowledgedCandidateProjectIds:
          candidates?.map((project) => project.id) ?? [],
        expectedContractRevision: revision,
        ...(source.kind === 'missionPlan' && source.selected
          ? {
              missionPlan: {
                planId: source.selected.planId,
                versionId: source.selected.id,
                versionNumber: source.selected.versionNumber,
              },
            }
          : {}),
      }),
    };
    attempt.current = command;
    const controller = writes.begin();
    if (!controller) return;
    const rejected = callbacks.current.reject;
    setFeedback('running');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request(command.path, {
        method: 'POST',
        companyContextId: companyId,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': command.key,
        },
        body: command.body,
      });
      if (controller.signal.aborted) return;
      const denied = await rejected(result, controller.signal);
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
        controller.release();
        callbacks.current.onCreated(link, project);
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
            controller.release();
            callbacks.current.onCandidatesChanged();
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
    } finally {
      controller.release();
    }
  }
  return (
    <section
      aria-label={copy(source.kind === 'empty' ? 'title' : 'plannedTitle')}
    >
      <h6>{copy(source.kind === 'empty' ? 'title' : 'plannedTitle')}</h6>
      <form onSubmit={(event) => void execute(event)}>
        <fieldset
          disabled={
            busy || terminal || candidates === undefined || sourceMissing
          }
        >
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
            {copy(source.kind === 'empty' ? 'confirm' : 'plannedConfirm')}
          </button>
        </fieldset>
      </form>
      {feedback !== 'idle' && (
        <p role="status">
          {copy(
            feedback === 'uncertain' && source.kind === 'missionPlan'
              ? 'plannedUncertain'
              : feedback,
          )}
        </p>
      )}
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
