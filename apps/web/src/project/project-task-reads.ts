import { useLayoutEffect, useRef } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiResult,
  type AuthenticatedApiClient,
} from '../api/authenticated-api-client';
import { isProject } from './project-directory';
import { isClosedProjectStatus } from './project-lifecycle-response';
import {
  readAssignees,
  readTaskDetail,
  readTaskHistory,
  readTaskList,
  type TaskScope,
} from './task-response';

export class ProjectTaskReadFailure extends Error {
  constructor(readonly kind: 'denied' | 'error' | 'missing') {
    super(kind);
  }
}

type TaskDetailRead =
  | { kind: 'missing' }
  | ({
      kind: 'ready';
      events: ReturnType<typeof readTaskHistory>;
    } & ReturnType<typeof readTaskDetail>);

/** Both Task views read under the same Project and committed Client revision. */
export function useProjectTaskReads({
  identity,
  scope,
  clientIdentityRevision,
}: {
  identity: BrowserIdentity;
  scope: TaskScope;
  clientIdentityRevision: number;
}) {
  const committedRevision = useRef(clientIdentityRevision);
  useLayoutEffect(() => {
    committedRevision.current = clientIdentityRevision;
  }, [clientIdentityRevision]);

  function capture({
    signal,
    recoveryCurrent,
  }: {
    signal: AbortSignal;
    recoveryCurrent: () => boolean;
  }) {
    const revision = committedRevision.current;
    const current = () =>
      !signal.aborted && committedRevision.current === revision;
    const options = { companyContextId: scope.companyId, signal };
    const project = `/projects/${encodeURIComponent(scope.projectId)}`;
    let client: Promise<AuthenticatedApiClient> | undefined;

    async function request(path: string) {
      if (!current()) return null;
      const api = await (client ??= createAuthenticatedApiClient(identity));
      return current() ? api.request(path, options) : null;
    }

    async function required(
      result: ApiResult<unknown>,
      notFound: 'denied' | 'missing' = 'denied',
    ): Promise<unknown> {
      if (result.status === 'unauthorized') {
        if (!current() || !recoveryCurrent())
          throw new ProjectTaskReadFailure('error');
        await identity.rejectSession().catch(() => undefined);
        throw new ProjectTaskReadFailure('denied');
      }
      if (result.status === 'forbidden')
        throw new ProjectTaskReadFailure('denied');
      if (result.status === 'notFound')
        throw new ProjectTaskReadFailure(notFound);
      if (result.status !== 'ok') throw new ProjectTaskReadFailure('error');
      return result.value;
    }

    return {
      current,
      revision,
      async listing() {
        try {
          const result = await request(`${project}/tasks`);
          if (!result || !current()) return null;
          const value = await required(result);
          return current() ? readTaskList(value, scope) : null;
        } catch (error) {
          if (!current()) return null;
          throw error;
        }
      },
      async detail(taskId: string): Promise<TaskDetailRead | null> {
        try {
          const task = `/tasks/${encodeURIComponent(taskId)}`;
          const [detail, history] = await Promise.all([
            request(task),
            request(`${task}/history`),
          ]);
          if (!detail || !history || !current()) return null;
          const taskValue = await required(detail, 'missing');
          if (!current()) return null;
          const historyValue = await required(history, 'missing');
          if (!current()) return null;
          return {
            kind: 'ready',
            ...readTaskDetail(taskValue, scope, taskId),
            events: readTaskHistory(historyValue, scope, taskId),
          };
        } catch (error) {
          if (!current()) return null;
          if (
            error instanceof ProjectTaskReadFailure &&
            error.kind === 'missing'
          )
            return { kind: 'missing' };
          throw error;
        }
      },
      async eligibleMembers() {
        try {
          const result = await request(`${project}/eligible-task-assignees`);
          if (
            !result ||
            !current() ||
            result.status === 'forbidden' ||
            result.status === 'notFound'
          )
            return null;
          const value = await required(result);
          return current() ? readAssignees(value) : null;
        } catch (error) {
          if (
            current() &&
            error instanceof ProjectTaskReadFailure &&
            error.kind === 'denied'
          )
            throw error;
          return null;
        }
      },
      async readOnlyReason() {
        // A read-only Task listing can mean either Project closure or a historical original Client.
        const result = await request(project);
        if (!result || !current()) return null;
        const value = await required(result);
        if (!current()) return null;
        if (
          !isProject(value) ||
          value.id !== scope.projectId ||
          value.companyId !== scope.companyId
        )
          throw new ProjectTaskReadFailure('error');
        return isClosedProjectStatus(value.status) ? 'closed' : 'historical';
      },
    };
  }

  return { identity, scope, clientIdentityRevision, capture };
}

export type ProjectTaskReads = ReturnType<typeof useProjectTaskReads>;
