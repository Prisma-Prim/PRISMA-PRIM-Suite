import {
  json,
  object,
  string,
  type InternalTaskFixture,
} from '../../src/internal-task/internal-task.test-support.js';

/**
 * The invariants checked after every fuzz step, each with its authority.
 * Only public seams prove them: REST answers, the Task's own history and the
 * generic Activity Log. Internal-Task Activity Log events are private by
 * PRD release-1-project-task §36.5, so the fuzzer observes them through the
 * public Task history: the deferred `ict_history_coupling` constraint trigger
 * (migration 0092) commits each history fact with exactly one event. Counts
 * are left out: no internal-Task route exposes a total (§36.4).
 */
export const INVARIANTS = {
  'company-isolation':
    'A request reads no record, list entry or event of a Company other than the one it selected, and an actor without a grant in a Company reads nothing of it (AGENTS.md Workspace and Company isolation; ADR 0006; PRD release-1-project-task §36.2, §36.5).',
  'identical-denial':
    'A hidden record and a missing one produce the identical denial (AGENTS.md Workspace and Company isolation; ADR 0006; PRD release-1-project-task §36.2).',
  'revocation-denies':
    "After a revocation or a suspension, the member's next request is denied (AGENTS.md Authorization; ADR 0006; PRD release-1-project-task §36.2).",
  'history-once':
    'Every successful command writes its history and Activity Log fact once; denied, failed, no-op and replayed commands write none (AGENTS.md Activity Log; PRD release-1-project-task §36.5; PRD tenant-company-client-authorization §8).',
  'versions-grow':
    'Versions never decrease (PRD release-1-project-task §36.3, §36.5).',
  'model-agreement':
    'Every other answer is the outcome the PRD predicts (PRD release-1-project-task §36.3-§36.5).',
} as const;
export type Invariant = keyof typeof INVARIANTS;

export class InvariantViolation extends Error {
  readonly invariant: Invariant;
  constructor(invariant: Invariant, detail: string) {
    super(`${invariant}: ${detail}`);
    this.name = 'InvariantViolation';
    this.invariant = invariant;
  }
}

export const COMPANIES = ['A', 'B'] as const;
export type CompanyKey = (typeof COMPANIES)[number];
export const MEMBERS = ['ana', 'bogdan', 'cora', 'dan'] as const;
export type MemberKey = (typeof MEMBERS)[number];
export const BUNDLES = ['context', 'internal-task-manager'] as const;
export type Bundle = (typeof BUNDLES)[number];
export const STATUSES = [
  'todo',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
] as const;
export type Status = (typeof STATUSES)[number];
export const PRIORITIES = ['normal', 'important', 'critical'] as const;
export type Priority = (typeof PRIORITIES)[number];
/** Few titles, so that edits often repeat the current value (a no-op). */
export const TITLES = [
  'Fuzz inventory DEMO',
  'Fuzz audit DEMO',
  'Fuzz review DEMO',
] as const;
export type HistoryKind = 'CREATE' | 'EDIT' | 'MOVE';
type Grant = 'never' | 'active' | 'revoked';
/** `auditor` only observes, with permanent grants in both Companies. */
type Observer = MemberKey | 'auditor';
export type Actor = Observer | 'owner';

const SUBJECTS: Record<Observer, string> = {
  ana: 'manager',
  bogdan: 'colleague',
  cora: 'candidate-0',
  dan: 'outsider',
  auditor: 'candidate-1',
};
const INITIAL_COMPANIES: Record<Observer, readonly CompanyKey[]> = {
  ana: ['A'],
  bogdan: ['B'],
  cora: ['A', 'B'],
  dan: ['A', 'B'],
  auditor: ['A', 'B'],
};
/** A UUID no record ever has: the twin of every hidden target. */
export const MISSING_ID = '00000000-0000-4000-8000-00000000f022';

export interface TaskModel {
  id: string;
  company: CompanyKey;
  version: number;
  status: Status;
  title: string;
  priority: Priority;
  /** The expected history kinds, oldest first: one per version. */
  kinds: HistoryKind[];
}

/** A committed Task command, kept to replay its exact request later. */
export interface Confirmation {
  member: MemberKey;
  company: CompanyKey;
  path: string;
  body: unknown;
  key: string;
  status: number;
  receipt: string;
}

export interface Model {
  grants: Map<string, Grant>;
  suspended: Set<MemberKey>;
  /** The Company each member's requests currently select. */
  context: Record<MemberKey, CompanyKey>;
  tasks: TaskModel[];
  confirmations: Confirmation[];
  /** The highest version any fresh read or command showed per Task. */
  versions: Map<string, number>;
  /** Generic Activity Log event ids already seen. */
  events: Set<string>;
}

export interface ExpectedEvent {
  action: string;
  company: CompanyKey | null;
  member: MemberKey;
}

export interface StepOutcome {
  touched: TaskModel[];
  events: ExpectedEvent[];
}

export interface Reply {
  status: number;
  text: string;
  body: unknown;
}

export class FuzzApi {
  private keys = 0;
  constructor(
    private readonly fixture: InternalTaskFixture,
    readonly companyIds: Readonly<Record<CompanyKey, string>>,
    readonly membershipIds: Readonly<Record<Observer, string>>,
  ) {}

  /** Deterministic keys: each run starts from a truncated database. */
  nextKey() {
    this.keys += 1;
    return `fuzz-${this.keys}`;
  }

  async send(
    actor: Actor,
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE';
      body?: unknown;
      company?: CompanyKey;
      key?: string;
    } = {},
  ): Promise<Reply> {
    const response = await this.fixture.request(path, {
      method: options.method,
      body: options.body,
      key: options.key,
      companyId:
        options.company === undefined
          ? undefined
          : this.companyIds[options.company],
      subject: actor === 'owner' ? undefined : SUBJECTS[actor],
    });
    const text = await response.text();
    return { status: response.status, text, body: parse(text) };
  }

  companyOf(companyId: string): CompanyKey | undefined {
    return COMPANIES.find((company) => this.companyIds[company] === companyId);
  }
}

function parse(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return undefined;
  }
}

/** Order-insensitive JSON, to compare a replayed receipt with the original. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}

export function grantKey(
  member: MemberKey,
  company: CompanyKey,
  bundle: Bundle,
) {
  return `${member}/${company}/${bundle}`;
}

export function grantOf(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
  bundle: Bundle,
): Grant {
  return model.grants.get(grantKey(member, company, bundle)) ?? 'never';
}

/** Company selection: an active member with the context bundle (ADR 0006). */
export function canEnter(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
) {
  return (
    !model.suspended.has(member) &&
    grantOf(model, member, company, 'context') === 'active'
  );
}

/** Internal-Task read and manage: context plus the captured bundle (§36.2). */
export function canWork(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
) {
  return (
    canEnter(model, member, company) &&
    grantOf(model, member, company, 'internal-task-manager') === 'active'
  );
}

/** The invariant a wrongly admitted request breaks. */
export function denialInvariant(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
): Invariant {
  return model.suspended.has(member) ||
    BUNDLES.some(
      (bundle) => grantOf(model, member, company, bundle) === 'revoked',
    )
    ? 'revocation-denies'
    : 'company-isolation';
}

export function isOpen(status: Status) {
  return status === 'todo' || status === 'in_progress' || status === 'blocked';
}

export function short(reply: Reply) {
  return `${reply.status} ${reply.text.slice(0, 200)}`;
}

/**
 * Expects `reply` to be the denial `status` and, for a request aimed at a
 * record, its twin aimed at a missing record to be byte-identical.
 */
export async function expectDenial(input: {
  reply: Reply;
  status: 403 | 404;
  invariant: Invariant;
  what: string;
  twin?: () => Promise<Reply>;
}) {
  if (input.reply.status !== input.status)
    throw new InvariantViolation(
      input.invariant,
      `${input.what}: expected ${input.status}, got ${short(input.reply)}`,
    );
  if (!input.twin) return;
  const twin = await input.twin();
  if (twin.status !== input.reply.status || twin.text !== input.reply.text)
    throw new InvariantViolation(
      'identical-denial',
      `${input.what}: the existing record got ${short(input.reply)}, a missing one got ${short(twin)}`,
    );
}

export interface TaskView {
  id: string;
  companyId: string;
  version: number;
  status: string;
  title: string;
  priority: string;
}

export function taskView(value: unknown): TaskView {
  const task = object(value);
  const version = task.version;
  if (typeof version !== 'number' || !Number.isSafeInteger(version))
    throw new InvariantViolation(
      'model-agreement',
      `a Task carries no integer version: ${canonical(value)}`,
    );
  return {
    id: string(task.id),
    companyId: string(task.companyId),
    version,
    status: string(task.status),
    title: string(task.title),
    priority: string(task.priority),
  };
}

export function observeVersion(model: Model, view: TaskView, where: string) {
  const highest = model.versions.get(view.id) ?? 0;
  if (view.version < highest)
    throw new InvariantViolation(
      'versions-grow',
      `${where} shows Task ${view.id} at version ${view.version} after version ${highest}`,
    );
  model.versions.set(view.id, view.version);
}

/** Compares one fresh Task read with the model, in the Company it was read. */
export function expectTask(input: {
  model: Model;
  api: FuzzApi;
  view: TaskView;
  company: CompanyKey;
  where: string;
}) {
  const { model, api, view, company, where } = input;
  const owned = model.tasks.find((task) => task.id === view.id);
  if (
    !owned ||
    owned.company !== company ||
    view.companyId !== api.companyIds[company]
  )
    throw new InvariantViolation(
      'company-isolation',
      `${where} in Company ${company} shows Task ${view.id} of Company ${owned?.company ?? api.companyOf(view.companyId) ?? 'unknown'}`,
    );
  observeVersion(model, view, where);
  if (view.version !== owned.version)
    throw new InvariantViolation(
      'history-once',
      `${where} shows Task ${view.id} at version ${view.version}; its successful commands make ${owned.version}`,
    );
  if (
    view.status !== owned.status ||
    view.title !== owned.title ||
    view.priority !== owned.priority
  )
    throw new InvariantViolation(
      'model-agreement',
      `${where} shows Task ${view.id} as ${view.status}/${view.title}/${view.priority}; expected ${owned.status}/${owned.title}/${owned.priority}`,
    );
}

/** Reads every page of a Company's Task list (status `all`). */
export async function readList(
  api: FuzzApi,
  actor: Actor,
  company: CompanyKey,
): Promise<{ first: Reply; tasks: TaskView[] }> {
  const tasks: TaskView[] = [];
  let cursor: string | null = null;
  let first: Reply | undefined;
  do {
    const reply = await api.send(
      actor,
      '/company-internal-tasks?status=all' +
        (cursor === null ? '' : '&beforeTaskId=' + cursor),
      { company },
    );
    if (!first) first = reply;
    if (reply.status !== 200) {
      if (reply === first) return { first, tasks };
      throw new InvariantViolation(
        'model-agreement',
        `a later list page in Company ${company} failed: ${short(reply)}`,
      );
    }
    const page = object(reply.body);
    if (!Array.isArray(page.tasks))
      throw new InvariantViolation(
        'model-agreement',
        `a list page has no tasks: ${short(reply)}`,
      );
    tasks.push(...page.tasks.map(taskView));
    cursor =
      page.nextBeforeTaskId === null ? null : string(page.nextBeforeTaskId);
  } while (cursor !== null);
  return { first, tasks };
}

/** The list a granted reader sees is exactly the Company's Tasks. */
export function expectList(input: {
  model: Model;
  api: FuzzApi;
  company: CompanyKey;
  tasks: TaskView[];
  who: string;
}) {
  const where = `${input.who}'s list`;
  for (const view of input.tasks)
    expectTask({ ...input, view, company: input.company, where });
  const seen = input.tasks.map((task) => task.id).sort();
  const expected = input.model.tasks
    .filter((task) => task.company === input.company)
    .map((task) => task.id)
    .sort();
  if (canonical(seen) !== canonical(expected))
    throw new InvariantViolation(
      'model-agreement',
      `${where} in Company ${input.company} has ${seen.length} Tasks, expected ${expected.length}`,
    );
}

/**
 * The Task's complete public history: one fact per version, newest first,
 * each of the expected kind and inside the Task's Company.
 */
export async function expectHistory(
  model: Model,
  api: FuzzApi,
  task: TaskModel,
) {
  const facts: Array<{ version: number; kind: string }> = [];
  let before: number | null = null;
  do {
    const reply = await api.send(
      'auditor',
      `/company-internal-tasks/${task.id}` +
        (before === null ? '' : `?beforeVersion=${before}`),
      { company: task.company },
    );
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `the auditor cannot read Task ${task.id}: ${short(reply)}`,
      );
    const detail = object(reply.body);
    if (before === null)
      expectTask({
        model,
        api,
        view: taskView(detail.task),
        company: task.company,
        where: 'the auditor detail',
      });
    if (!Array.isArray(detail.history))
      throw new InvariantViolation(
        'model-agreement',
        `Task ${task.id} detail has no history: ${short(reply)}`,
      );
    for (const value of detail.history) {
      const fact = object(value);
      if (
        fact.taskId !== task.id ||
        fact.companyId !== api.companyIds[task.company]
      )
        throw new InvariantViolation(
          'company-isolation',
          `Task ${task.id} history holds a fact of ${canonical(fact.taskId)} in ${canonical(fact.companyId)}`,
        );
      const version = fact.version;
      if (typeof version !== 'number')
        throw new InvariantViolation(
          'model-agreement',
          `a history fact has no version: ${canonical(fact)}`,
        );
      facts.push({ version, kind: string(fact.kind) });
    }
    const next = detail.nextBeforeVersion;
    before = typeof next === 'number' ? next : null;
  } while (before !== null);
  const expected = task.kinds
    .map((kind, index) => ({ version: index + 1, kind }))
    .reverse();
  if (canonical(facts) !== canonical(expected))
    throw new InvariantViolation(
      'history-once',
      `Task ${task.id} history is ${describeFacts(facts)}; its successful commands make ${describeFacts(expected)}`,
    );
}

function describeFacts(facts: Array<{ version: number; kind: string }>) {
  return facts.length === 0
    ? 'empty'
    : facts.map((fact) => `v${fact.version} ${fact.kind}`).join(' ');
}

interface GenericEvent {
  id: string;
  action: string;
  companyId: string | null;
  membershipId: string | null;
}

async function genericActivity(api: FuzzApi): Promise<GenericEvent[]> {
  const reply = await api.send('owner', '/activity-log');
  if (reply.status !== 200)
    throw new InvariantViolation(
      'model-agreement',
      `the owner cannot read the Activity Log: ${short(reply)}`,
    );
  const page = object(reply.body);
  if (!Array.isArray(page.events))
    throw new InvariantViolation(
      'model-agreement',
      `the Activity Log has no events: ${short(reply)}`,
    );
  return page.events.map((value) => {
    const event = object(value);
    const target = object(event.target);
    const action = string(event.action);
    if (action.startsWith('internal_task.'))
      throw new InvariantViolation(
        'company-isolation',
        `the generic Activity Log shows the private event ${action}`,
      );
    return {
      id: string(event.id),
      action,
      companyId: typeof target.companyId === 'string' ? target.companyId : null,
      membershipId:
        typeof target.workspaceMembershipId === 'string'
          ? target.workspaceMembershipId
          : null,
    };
  });
}

/**
 * A suspension's session revocation records one outcome: revoked, or retry
 * required when the identity provider cannot confirm it (the test mode).
 */
export const SESSION_REVOCATION_OUTCOME = 'workspace_sessions.<outcome>';
const SESSION_REVOCATION_OUTCOMES = new Set([
  'workspace_sessions.revoked',
  'workspace_sessions.revocation_retry_required',
]);

/**
 * The generic Activity Log events written since the last step are exactly
 * the expected ones: one per actual grant, revoke or suspension (plus its
 * session revocation outcome), none for Task commands, reads, no-ops,
 * replays or denials.
 */
async function expectActivity(
  model: Model,
  api: FuzzApi,
  expected: ExpectedEvent[],
) {
  const fresh = (await genericActivity(api)).filter(
    (event) => !model.events.has(event.id),
  );
  for (const event of fresh) model.events.add(event.id);
  const seen = fresh
    .map(
      (event) =>
        `${SESSION_REVOCATION_OUTCOMES.has(event.action) ? SESSION_REVOCATION_OUTCOME : event.action} ${api.companyOf(event.companyId ?? '') ?? '-'} ${memberOf(api, event.membershipId) ?? '-'}`,
    )
    .sort();
  const wanted = expected
    .map((event) => `${event.action} ${event.company ?? '-'} ${event.member}`)
    .sort();
  if (canonical(seen) !== canonical(wanted))
    throw new InvariantViolation(
      'history-once',
      `the generic Activity Log gained [${seen.join('; ')}], expected [${wanted.join('; ')}]`,
    );
}

function memberOf(api: FuzzApi, membershipId: string | null) {
  return MEMBERS.find((member) => api.membershipIds[member] === membershipId);
}

/** The checks run after every step. */
export async function checkStep(
  model: Model,
  api: FuzzApi,
  outcome: StepOutcome,
) {
  await expectActivity(model, api, outcome.events);
  for (const company of COMPANIES) {
    const list = await readList(api, 'auditor', company);
    if (list.first.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `the auditor cannot list Company ${company}: ${short(list.first)}`,
      );
    expectList({ model, api, company, tasks: list.tasks, who: 'the auditor' });
  }
  for (const task of outcome.touched) await expectHistory(model, api, task);
}

/** After a sequence: every Task's complete history. */
export async function checkEnd(model: Model, api: FuzzApi) {
  for (const task of model.tasks) await expectHistory(model, api, task);
}

/**
 * A fresh world per sequence: the fixture truncates the database and grants
 * `ana` Company A; then Company B and the other members' grants follow
 * through public endpoints only.
 */
export async function openWorld(
  fixture: InternalTaskFixture,
): Promise<{ model: Model; api: FuzzApi }> {
  const first = await fixture.setup();
  const companyB = string(
    (
      await fixture.created('/companies', {
        displayName: 'Fuzz Company B DEMO',
      })
    ).id,
  );
  const membership = async (subject: string) =>
    string(
      (await json(await fixture.request('/access/current-actor', { subject })))
        .workspaceMembershipId,
    );
  const api = new FuzzApi(
    fixture,
    { A: first.companyId, B: companyB },
    {
      ana: first.membershipId,
      bogdan: await membership(SUBJECTS.bogdan),
      cora: await membership(SUBJECTS.cora),
      dan: await membership(SUBJECTS.dan),
      auditor: await membership(SUBJECTS.auditor),
    },
  );
  const model: Model = {
    grants: new Map(),
    suspended: new Set(),
    context: { ana: 'A', bogdan: 'B', cora: 'A', dan: 'B' },
    tasks: [],
    confirmations: [],
    versions: new Map(),
    events: new Set(),
  };
  for (const observer of [...MEMBERS, 'auditor'] as const)
    for (const company of INITIAL_COMPANIES[observer])
      for (const bundle of BUNDLES) {
        if (observer !== 'ana' || company !== 'A') {
          const reply = await api.send(
            'owner',
            `/company-${bundle}-assignments`,
            {
              method: 'POST',
              key: api.nextKey(),
              body: {
                companyId: api.companyIds[company],
                workspaceMembershipId: api.membershipIds[observer],
              },
            },
          );
          if (reply.status !== 201)
            throw new Error(`Fuzz setup grant failed: ${short(reply)}`);
        }
        if (observer !== 'auditor')
          model.grants.set(grantKey(observer, company, bundle), 'active');
      }
  for (const event of await genericActivity(api)) model.events.add(event.id);
  return { model, api };
}
