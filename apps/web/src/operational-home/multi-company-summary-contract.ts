import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { readCurrentActor } from '../access/current-actor';
import {
  createAuthenticatedApiClient,
  type AuthenticatedApiClient,
} from '../api/authenticated-api-client';
import { canReadTasks } from '../project/MyTasks';
import {
  readOperationalHome,
  type CompanySummary,
  type CompanySummaryKind,
} from './operational-home-response';

type Company = { id: string; displayName: string };
export type MultiCompanySummaryRow =
  | { kind: 'qualifying' | 'loading' | 'error' | 'omitted'; company: Company }
  | {
      kind: 'ready';
      company: Company;
      today: string;
      summaries: CompanySummary[];
    };
export type MultiCompanySummaryState =
  | { kind: 'loading' | 'error' | 'denied' }
  | {
      kind: 'ready';
      visibility: 'current' | 'error';
      rows: MultiCompanySummaryRow[];
    };
export type MultiCompanySummaryDestination = {
  companyId: string;
  kind: CompanySummaryKind;
};

/** Same existing predicates consumed by the ordinary Home and its destinations. */
function readableSummaries(
  actor: ActorContext,
): Record<CompanySummaryKind, boolean> {
  const company = actor.activeCompany;
  const clients =
    actor.workspacePermissions.includes('client.manage') ||
    company?.clientPermissions?.includes('client.read') === true;
  return {
    active_clients: clients,
    open_projects:
      clients && company?.projectPermissions?.includes('project.read') === true,
    overdue_tasks: canReadTasks(actor),
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Consume the established minimal Company-list contract, accepting additive fields. */
function readCompanies(value: unknown, workspaceId: string): Company[] {
  if (!Array.isArray(value)) throw new Error('Invalid Company discovery');
  const ids = new Set<string>();
  return value.map((item: unknown) => {
    if (
      !record(item) ||
      typeof item.id !== 'string' ||
      !item.id.trim() ||
      typeof item.displayName !== 'string' ||
      !item.displayName.trim() ||
      ids.has(item.id) ||
      (item.workspaceId !== undefined && item.workspaceId !== workspaceId) ||
      (item.status !== undefined && item.status !== 'active')
    )
      throw new Error('Invalid Company discovery');
    ids.add(item.id);
    return { id: item.id, displayName: item.displayName };
  });
}

function actorMatches({
  candidate,
  owner,
  companyId,
}: {
  candidate: ActorContext;
  owner: ActorContext;
  companyId: string;
}): boolean {
  return (
    workspaceMatches({ candidate, owner }) &&
    candidate.activeCompany?.id === companyId
  );
}

function workspaceMatches({
  candidate,
  owner,
}: {
  candidate: ActorContext;
  owner: ActorContext;
}): boolean {
  return (
    candidate.active &&
    candidate.internalUserId === owner.internalUserId &&
    candidate.workspaceId === owner.workspaceId &&
    candidate.workspaceMembershipId === owner.workspaceMembershipId
  );
}

type Job = { company: Company; controller: AbortController };
type Collection = {
  controller: AbortController;
  api: AuthenticatedApiClient;
  jobs: Map<string, Job>;
  queue: Job[];
  visibilityRequest: number;
  state: Extract<MultiCompanySummaryState, { kind: 'ready' }>;
};

/**
 * Private scoped read composition. At most two active Company pipelines, including
 * retired transports that ignore abort. No sibling Actor is published to the shell.
 */
export function createMultiCompanySummaryReader({
  actor,
  identity,
  onChange,
  onWorkspaceAccessRejected,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onChange: (state: MultiCompanySummaryState) => void;
  onWorkspaceAccessRejected: () => void;
}) {
  let lifetime: AbortController | undefined;
  let collection: Collection | undefined;
  let disposed = false;
  let active = 0;

  function current(scope: Collection, job?: Job): boolean {
    return (
      !disposed &&
      collection === scope &&
      !scope.controller.signal.aborted &&
      (!job ||
        (!job.controller.signal.aborted &&
          scope.jobs.get(job.company.id) === job))
    );
  }
  function publish(scope: Collection) {
    if (current(scope))
      onChange({ ...scope.state, rows: [...scope.state.rows] });
  }
  function row(scope: Collection, job: Job, next: MultiCompanySummaryRow) {
    if (!current(scope, job)) return;
    scope.state.rows = scope.state.rows.map((existing) =>
      existing.company.id === job.company.id ? next : existing,
    );
    publish(scope);
  }
  function retire() {
    lifetime?.abort();
    if (collection) {
      collection.controller.abort();
      for (const job of collection.jobs.values()) job.controller.abort();
    }
    collection = undefined;
  }
  async function reject(scope: Collection, job?: Job) {
    if (!current(scope, job)) return;
    // Currentness precedes this external side effect, not only the state update.
    retire();
    onChange({ kind: 'denied' });
    await identity.rejectSession();
  }
  async function recoverWorkspace({
    api,
    signal,
    isCurrent,
  }: {
    api: AuthenticatedApiClient;
    signal: AbortSignal;
    isCurrent: () => boolean;
  }): Promise<'handled' | 'denied' | 'error'> {
    const workspace = await readCurrentActor({ api, signal });
    if (!isCurrent()) return 'handled';
    if (workspace.status === 'unauthorized') {
      retire();
      onChange({ kind: 'denied' });
      await identity.rejectSession();
      return 'handled';
    }
    if (workspace.status === 'forbidden') {
      retire();
      onChange({ kind: 'denied' });
      // Only the captured native owner can retire global Workspace access.
      // A private sibling Actor is never replayed into that owner.
      onWorkspaceAccessRejected();
      return 'handled';
    }
    return workspace.status === 'ok' &&
      workspaceMatches({ candidate: workspace.value, owner: actor })
      ? 'denied'
      : 'error';
  }
  function enqueue(scope: Collection, company: Company) {
    scope.jobs.get(company.id)?.controller.abort();
    const job = { company, controller: new AbortController() };
    scope.jobs.set(company.id, job);
    scope.queue.push(job);
    row(scope, job, { kind: 'qualifying', company });
    pump(scope);
  }
  function pump(scope: Collection) {
    while (current(scope) && active < 2 && scope.queue.length > 0) {
      const job = scope.queue.shift();
      if (!job || !current(scope, job)) continue;
      active += 1;
      void load(scope, job).finally(() => {
        active -= 1;
        if (collection) pump(collection);
      });
    }
  }

  async function recheckVisibility(scope: Collection) {
    if (!current(scope)) return;
    const request = ++scope.visibilityRequest;
    const result = await scope.api.request<unknown>('/companies', {
      signal: scope.controller.signal,
    });
    if (!current(scope) || request !== scope.visibilityRequest) return;
    if (result.status === 'unauthorized') return reject(scope);
    if (result.status === 'forbidden') {
      const recovered = await recoverWorkspace({
        api: scope.api,
        signal: scope.controller.signal,
        isCurrent: () => current(scope) && request === scope.visibilityRequest,
      });
      if (recovered === 'handled' || !current(scope)) return;
      retire();
      onChange({ kind: recovered });
      return;
    }
    if (result.status !== 'ok') {
      scope.state.visibility = 'error';
      publish(scope);
      return;
    }
    let companies: Company[];
    try {
      companies = readCompanies(result.value, actor.workspaceId);
    } catch {
      // Recovery discovery is a boundary too. Never let the caller's error
      // handler restore an already denied Company or retain unbound counts.
      retire();
      onChange({ kind: 'error' });
      return;
    }
    const previous = new Map(
      scope.state.rows.map((item) => [item.company.id, item]),
    );
    const visible = new Set(companies.map((company) => company.id));
    for (const [id, job] of scope.jobs) {
      if (!visible.has(id)) {
        job.controller.abort();
        scope.jobs.delete(id);
      }
    }
    scope.state.rows = companies.map((company) => {
      const existing = previous.get(company.id);
      return existing?.company.displayName === company.displayName
        ? existing
        : { kind: 'qualifying', company };
    });
    scope.state.visibility = 'current';
    publish(scope);
    for (const company of companies) {
      const existing = previous.get(company.id);
      if (!existing || existing.company.displayName !== company.displayName)
        enqueue(scope, company);
    }
  }

  async function load(scope: Collection, job: Job) {
    const { company, controller } = job;
    try {
      const qualified = await readCurrentActor({
        api: scope.api,
        companyContextId: company.id,
        signal: controller.signal,
      });
      if (!current(scope, job)) return;
      if (qualified.status === 'unauthorized') return await reject(scope, job);
      if (qualified.status === 'forbidden') {
        row(scope, job, { kind: 'omitted', company });
        await recheckVisibility(scope);
        return;
      }
      if (
        qualified.status !== 'ok' ||
        !actorMatches({
          candidate: qualified.value,
          owner: actor,
          companyId: company.id,
        })
      ) {
        row(scope, job, { kind: 'error', company });
        return;
      }
      let available = readableSummaries(qualified.value);
      if (!Object.values(available).some(Boolean)) {
        row(scope, job, { kind: 'omitted', company });
        return;
      }
      row(scope, job, { kind: 'loading', company });
      let result = await scope.api.request<unknown>('/operational-home', {
        companyContextId: company.id,
        signal: controller.signal,
      });
      if (!current(scope, job)) return;
      if (result.status === 'unauthorized') return await reject(scope, job);
      if (result.status === 'forbidden') {
        // Retire counts immediately; privately requalify only this Company.
        row(scope, job, { kind: 'qualifying', company });
        const refreshed = await readCurrentActor({
          api: scope.api,
          companyContextId: company.id,
          signal: controller.signal,
        });
        if (!current(scope, job)) return;
        if (refreshed.status === 'unauthorized')
          return await reject(scope, job);
        if (refreshed.status === 'forbidden') {
          row(scope, job, { kind: 'omitted', company });
          await recheckVisibility(scope);
          return;
        }
        if (
          refreshed.status !== 'ok' ||
          !actorMatches({
            candidate: refreshed.value,
            owner: actor,
            companyId: company.id,
          })
        ) {
          row(scope, job, { kind: 'error', company });
          return;
        }
        available = readableSummaries(refreshed.value);
        if (!Object.values(available).some(Boolean)) {
          row(scope, job, { kind: 'omitted', company });
          return;
        }
        row(scope, job, { kind: 'loading', company });
        // One bounded owning-read retry under the freshly qualified authority;
        // repeated denial is an error, never an automatic retry loop.
        result = await scope.api.request<unknown>('/operational-home', {
          companyContextId: company.id,
          signal: controller.signal,
        });
        if (!current(scope, job)) return;
        if (result.status === 'unauthorized') return await reject(scope, job);
      }
      if (result.status !== 'ok') {
        row(scope, job, { kind: 'error', company });
        return;
      }
      const view = readOperationalHome(result.value, {
        companyId: company.id,
        workspaceMembershipId: actor.workspaceMembershipId,
      });
      if (view.summaries.some((summary) => !available[summary.kind]))
        throw new Error('Summary authority changed');
      row(
        scope,
        job,
        view.summaries.length === 0
          ? { kind: 'omitted', company }
          : {
              kind: 'ready',
              company,
              today: view.today,
              summaries: view.summaries,
            },
      );
    } catch {
      row(scope, job, { kind: 'error', company });
    }
  }

  async function refresh() {
    retire();
    if (disposed) return;
    const controller = new AbortController();
    lifetime = controller;
    onChange({ kind: 'loading' });
    const active = () =>
      !disposed && lifetime === controller && !controller.signal.aborted;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!active()) return;
      const result = await api.request<unknown>('/companies', {
        signal: controller.signal,
      });
      if (!active()) return;
      if (result.status === 'unauthorized') {
        retire();
        onChange({ kind: 'denied' });
        await identity.rejectSession();
        return;
      }
      if (result.status !== 'ok') {
        if (result.status === 'forbidden') {
          const recovered = await recoverWorkspace({
            api,
            signal: controller.signal,
            isCurrent: active,
          });
          if (recovered !== 'handled' && active())
            onChange({ kind: recovered });
        } else onChange({ kind: 'error' });
        return;
      }
      const companies = readCompanies(result.value, actor.workspaceId);
      const scope: Collection = {
        controller,
        api,
        jobs: new Map(),
        queue: [],
        visibilityRequest: 0,
        state: {
          kind: 'ready',
          visibility: 'current',
          rows: companies.map((company) => ({ kind: 'qualifying', company })),
        },
      };
      collection = scope;
      publish(scope);
      for (const company of companies) enqueue(scope, company);
    } catch {
      if (active()) onChange({ kind: 'error' });
    }
  }

  return {
    refresh,
    retry(companyId: string) {
      const scope = collection;
      if (!scope || !current(scope)) return;
      const existing = scope.state.rows.find(
        (item) => item.company.id === companyId,
      );
      if (existing) enqueue(scope, existing.company);
    },
    dispose() {
      disposed = true;
      retire();
    },
  };
}
