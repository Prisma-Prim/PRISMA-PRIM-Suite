import * as fc from 'fast-check';
import {
  object,
  string,
} from '../../src/internal-task/internal-task.test-support.js';
import {
  canonical,
  expectDenial,
  short,
  type Reply,
} from '../model-fuzz/checks.js';
import {
  BUNDLES,
  canEnter,
  canWork,
  checkStep,
  COMPANIES,
  denialInvariant,
  expectList,
  expectTask,
  grantKey,
  grantOf,
  InvariantViolation,
  isOpen,
  MEMBERS,
  MISSING_ID,
  PRIORITIES,
  readList,
  SESSION_REVOCATION_OUTCOME,
  STATUSES,
  taskView,
  TITLES,
  type Bundle,
  type CompanyKey,
  type FuzzApi,
  type HistoryKind,
  type MemberKey,
  type Model,
  type Priority,
  type Status,
  type StepOutcome,
  type TaskModel,
} from './world.js';

type FuzzCommand = fc.AsyncCommand<Model, FuzzApi>;

const NOTHING: StepOutcome = { touched: [], events: [] };

/** What a step needs to exist before it can run. */
type Requirement = 'nothing' | 'task' | 'confirmation';

/** Every step acts, then the world checks every invariant. */
abstract class Step implements FuzzCommand {
  protected readonly requires: Requirement = 'nothing';
  check(model: Readonly<Model>): boolean {
    switch (this.requires) {
      case 'nothing':
        return true;
      case 'task':
        return model.tasks.length > 0;
      case 'confirmation':
        return model.confirmations.length > 0;
    }
  }
  async run(model: Model, api: FuzzApi): Promise<void> {
    await checkStep(model, api, await this.act(model, api));
  }
  protected abstract act(model: Model, api: FuzzApi): Promise<StepOutcome>;
  abstract toString(): string;
}

/**
 * Which Task a step aims at: `index` modulo the Tasks of the member's
 * current Company, or of the other Company when `foreign`; when that
 * Company has none yet, modulo every Task.
 */
interface Target {
  index: number;
  foreign: boolean;
}

/** A step aimed at one Task. */
abstract class TaskStep extends Step {
  protected override readonly requires: Requirement = 'task';
  constructor(protected readonly target: Target) {
    super();
  }
  protected task(model: Model, member: MemberKey): TaskModel {
    const own = model.context[member];
    const scoped = model.tasks.filter(
      (task) => (task.company === own) !== this.target.foreign,
    );
    const pool = scoped.length > 0 ? scoped : model.tasks;
    const task = pool[this.target.index % pool.length];
    if (!task) throw new Error('The fuzz precondition admitted no Task.');
    return task;
  }
  protected get aim() {
    return `${this.target.foreign ? 'foreign ' : ''}task#${this.target.index}`;
  }
}

/** Selects a Company for the member's next requests (ADR 0006). */
class SwitchCompany extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
  ) {
    super();
  }
  protected async act(model: Model, api: FuzzApi) {
    const reply = await api.send(this.member, '/access/current-actor', {
      company: this.company,
    });
    const what = `${this.member} selecting Company ${this.company}`;
    if (canEnter(model, this.member, this.company)) {
      if (reply.status !== 200)
        throw new InvariantViolation(
          'model-agreement',
          `${what}: expected 200, got ${short(reply)}`,
        );
      const company = object(object(reply.body).activeCompany);
      if (company.id !== api.companyIds[this.company])
        throw new InvariantViolation(
          'company-isolation',
          `${what}: the server selected ${canonical(company.id)}`,
        );
    } else
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(model, this.member, this.company),
        what,
      });
    model.context[this.member] = this.company;
    return NOTHING;
  }
  toString() {
    return `switch(${this.member} to ${this.company})`;
  }
}

class CreateTask extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly title: number,
    private readonly priority: Priority,
  ) {
    super();
  }
  protected async act(model: Model, api: FuzzApi) {
    const company = model.context[this.member];
    const path = '/company-internal-tasks';
    const body = { title: TITLES[this.title], priority: this.priority };
    const key = api.nextKey();
    const reply = await api.send(this.member, path, {
      method: 'POST',
      body,
      company,
      key,
    });
    const what = `${this.member} creating a Task in Company ${company}`;
    if (!canWork(model, this.member, company)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(model, this.member, company),
        what,
      });
      return NOTHING;
    }
    if (reply.status !== 201)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: expected 201, got ${short(reply)}`,
      );
    const receipt = readReceipt(reply);
    if (receipt.task.companyId !== api.companyIds[company])
      throw new InvariantViolation(
        'company-isolation',
        `${what}: the Task belongs to ${api.companyOf(receipt.task.companyId) ?? 'an unknown Company'}`,
      );
    const task: TaskModel = {
      id: receipt.task.id,
      company,
      version: 1,
      status: 'todo',
      title: body.title,
      priority: this.priority,
      kinds: ['CREATE'],
    };
    model.tasks.push(task);
    expectReceipt({ model, api, receipt, task, kind: 'CREATE', what });
    model.confirmations.push({
      member: this.member,
      company,
      path,
      body,
      key,
      status: reply.status,
      receipt: canonical(reply.body),
    });
    return { touched: [task], events: [] };
  }
  toString() {
    return `create(${this.member} title=${this.title} ${this.priority})`;
  }
}

type Change =
  | { kind: 'EDIT'; title?: string; priority?: Priority }
  | { kind: 'MOVE'; status: Status; reason?: string };

type Outcome = 'denied' | 'hidden' | 'conflict' | 'unchanged' | 'changed';

/** The PRD §36.3-§36.5 outcome of one change, in the service's order. */
function predict(input: {
  model: Readonly<Model>;
  member: MemberKey;
  company: CompanyKey;
  task: TaskModel;
  change: Change;
  stale: boolean;
}): Outcome {
  const { model, member, company, task, change } = input;
  if (!canWork(model, member, company)) return 'denied';
  if (task.company !== company) return 'hidden';
  if (input.stale) return 'conflict';
  if (change.kind === 'EDIT') {
    if (!isOpen(task.status)) return 'conflict';
    return (change.title ?? task.title) === task.title &&
      (change.priority ?? task.priority) === task.priority
      ? 'unchanged'
      : 'changed';
  }
  return change.status === task.status ||
    (!isOpen(task.status) && change.status !== 'todo')
    ? 'conflict'
    : 'changed';
}

function apply(task: TaskModel, change: Change) {
  task.version += 1;
  if (change.kind === 'EDIT') {
    task.title = change.title ?? task.title;
    task.priority = change.priority ?? task.priority;
    task.kinds.push('EDIT');
  } else {
    task.status = change.status;
    task.kinds.push('MOVE');
  }
}

interface ChangeRequest {
  member: MemberKey;
  company: CompanyKey;
  task: TaskModel;
  change: Change;
  stale: boolean;
  path: string;
  body: Record<string, unknown>;
  key: string;
  outcome: Outcome;
}

function changeRequest(input: {
  model: Model;
  api: FuzzApi;
  member: MemberKey;
  task: TaskModel;
  change: Change;
  stale: boolean;
}): ChangeRequest {
  const company = input.model.context[input.member];
  return {
    member: input.member,
    company,
    task: input.task,
    change: input.change,
    stale: input.stale,
    path: `/company-internal-tasks/${input.task.id}/changes`,
    // One past the current version is never current: a stale observation.
    body: {
      ...input.change,
      expectedVersion: input.task.version + (input.stale ? 1 : 0),
    },
    key: input.api.nextKey(),
    outcome: predict({ ...input, company }),
  };
}

function sendChange(api: FuzzApi, request: ChangeRequest) {
  return api.send(request.member, request.path, {
    method: 'POST',
    body: request.body,
    company: request.company,
    key: request.key,
  });
}

/** Checks one change reply against its predicted outcome. */
async function settleChange(input: {
  model: Model;
  api: FuzzApi;
  request: ChangeRequest;
  reply: Reply;
  outcome: Outcome;
}): Promise<void> {
  const { model, api, request, reply } = input;
  const what = `${request.member} sending ${request.change.kind} on Task ${request.task.id} of Company ${request.task.company} from Company ${request.company}`;
  const twin = () =>
    api.send(request.member, `/company-internal-tasks/${MISSING_ID}/changes`, {
      method: 'POST',
      body: request.body,
      company: request.company,
      key: api.nextKey(),
    });
  switch (input.outcome) {
    case 'denied':
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(model, request.member, request.company),
        what,
        twin,
      });
      return;
    case 'hidden':
      await expectDenial({
        reply,
        status: 404,
        invariant: 'company-isolation',
        what,
        twin,
      });
      return;
    case 'conflict':
      if (reply.status !== 409)
        throw new InvariantViolation(
          reply.status === 200 ? 'history-once' : 'model-agreement',
          `${what}: expected 409, got ${short(reply)}`,
        );
      return;
    case 'unchanged':
    case 'changed': {
      if (reply.status !== 200)
        throw new InvariantViolation(
          'model-agreement',
          `${what}: expected 200, got ${short(reply)}`,
        );
      const receipt = readReceipt(reply);
      if (input.outcome === 'changed') apply(request.task, request.change);
      expectReceipt({
        model,
        api,
        receipt,
        task: request.task,
        kind: input.outcome === 'changed' ? request.change.kind : null,
        what,
      });
      model.confirmations.push({
        member: request.member,
        company: request.company,
        path: request.path,
        body: request.body,
        key: request.key,
        status: reply.status,
        receipt: canonical(reply.body),
      });
      return;
    }
  }
}

class ChangeTask extends TaskStep {
  constructor(
    private readonly member: MemberKey,
    target: Target,
    private readonly change: Change,
    private readonly stale: boolean,
  ) {
    super(target);
  }
  protected async act(model: Model, api: FuzzApi) {
    const request = changeRequest({
      model,
      api,
      member: this.member,
      task: this.task(model, this.member),
      change: this.change,
      stale: this.stale,
    });
    const reply = await sendChange(api, request);
    await settleChange({
      model,
      api,
      request,
      reply,
      outcome: request.outcome,
    });
    return { touched: [request.task], events: [] };
  }
  toString() {
    const change = this.change;
    const label =
      change.kind === 'EDIT'
        ? `edit(title=${change.title === undefined ? '-' : TITLES.findIndex((title) => title === change.title)} priority=${change.priority ?? '-'}`
        : `move(to=${change.status}`;
    return `${label} ${this.member} ${this.aim}${this.stale ? ' stale' : ''})`;
  }
}

/** Two edits of one version race; exactly one material edit wins (§36.5). */
class ConcurrentEdits extends TaskStep {
  constructor(
    private readonly first: MemberKey,
    private readonly second: MemberKey,
    target: Target,
  ) {
    super(target);
  }
  protected async act(model: Model, api: FuzzApi) {
    const task = this.task(model, this.first);
    // Two titles that differ from the current one and from each other, so
    // that both edits are material.
    const [one, two] = TITLES.filter((title) => title !== task.title);
    const requests = [
      changeRequest({
        model,
        api,
        member: this.first,
        task,
        change: { kind: 'EDIT', title: one },
        stale: false,
      }),
      changeRequest({
        model,
        api,
        member: this.second,
        task,
        change: { kind: 'EDIT', title: two },
        stale: false,
      }),
    ] as const;
    const replies = await Promise.all(
      requests.map((request) => sendChange(api, request)),
    );
    const racing = requests.filter((request) => request.outcome === 'changed');
    // A race of two material edits: the winner answers 200, the loser 409.
    const winner =
      racing.length === 2
        ? requests[replies.findIndex((reply) => reply.status === 200)]
        : undefined;
    if (racing.length === 2 && !winner)
      throw new InvariantViolation(
        'model-agreement',
        `two racing edits of Task ${task.id}: no winner (${replies.map(short).join(' | ')})`,
      );
    for (const [index, request] of requests.entries()) {
      const reply = replies[index];
      if (!reply) throw new Error('A concurrent reply is missing.');
      const outcome =
        racing.length === 2 && request !== winner
          ? 'conflict'
          : request.outcome;
      await settleChange({ model, api, request, reply, outcome });
    }
    return { touched: [task], events: [] };
  }
  toString() {
    return `concurrent-edits(${this.first} ${this.second} ${this.aim})`;
  }
}

class ReadTask extends TaskStep {
  constructor(
    private readonly member: MemberKey,
    target: Target,
  ) {
    super(target);
  }
  protected async act(model: Model, api: FuzzApi) {
    const task = this.task(model, this.member);
    const company = model.context[this.member];
    const read = (id: string) =>
      api.send(this.member, `/company-internal-tasks/${id}`, { company });
    const reply = await read(task.id);
    const what = `${this.member} reading Task ${task.id} of Company ${task.company} from Company ${company}`;
    if (!canWork(model, this.member, company)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(model, this.member, company),
        what,
        twin: () => read(MISSING_ID),
      });
      return NOTHING;
    }
    if (task.company !== company) {
      await expectDenial({
        reply,
        status: 404,
        invariant: 'company-isolation',
        what,
        twin: () => read(MISSING_ID),
      });
      // A hidden Task is no list cursor either (§36.4).
      const cursor = (id: string) =>
        api.send(
          this.member,
          `/company-internal-tasks?status=all&beforeTaskId=${id}`,
          { company },
        );
      await expectDenial({
        reply: await cursor(task.id),
        status: 404,
        invariant: 'company-isolation',
        what: `${what} as a list cursor`,
        twin: () => cursor(MISSING_ID),
      });
      return NOTHING;
    }
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: expected 200, got ${short(reply)}`,
      );
    expectTask({
      model,
      api,
      view: taskView(object(reply.body).task),
      company,
      where: `${this.member}'s detail`,
    });
    return NOTHING;
  }
  toString() {
    return `read(${this.member} ${this.aim})`;
  }
}

class ListTasks extends Step {
  constructor(private readonly member: MemberKey) {
    super();
  }
  protected async act(model: Model, api: FuzzApi) {
    const company = model.context[this.member];
    const list = await readList(api, this.member, company);
    const what = `${this.member} listing Company ${company}`;
    if (!canWork(model, this.member, company)) {
      await expectDenial({
        reply: list.first,
        status: 403,
        invariant: denialInvariant(model, this.member, company),
        what,
      });
      return NOTHING;
    }
    if (list.first.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: expected 200, got ${short(list.first)}`,
      );
    expectList({ model, api, company, tasks: list.tasks, who: this.member });
    return NOTHING;
  }
  toString() {
    return `list(${this.member})`;
  }
}

/** Eligible assignees are exactly the Company's current granted members. */
class ListAssignees extends Step {
  constructor(private readonly member: MemberKey) {
    super();
  }
  protected async act(model: Model, api: FuzzApi) {
    const company = model.context[this.member];
    const reply = await api.send(
      this.member,
      '/company-internal-tasks/eligible-assignees',
      { company },
    );
    const what = `${this.member} listing assignees of Company ${company}`;
    if (!canWork(model, this.member, company)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(model, this.member, company),
        what,
      });
      return NOTHING;
    }
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: expected 200, got ${short(reply)}`,
      );
    const page = object(reply.body);
    if (!Array.isArray(page.members))
      throw new InvariantViolation(
        'model-agreement',
        `${what}: ${short(reply)}`,
      );
    const seen = page.members
      .map((member) => string(object(member).membershipId))
      .sort();
    const expected = [
      api.membershipIds.auditor,
      ...MEMBERS.filter((member) => canWork(model, member, company)).map(
        (member) => api.membershipIds[member],
      ),
    ].sort();
    if (canonical(seen) !== canonical(expected)) {
      // A member listed without a live grant leaks eligibility; a missing
      // one is a disagreement.
      const extra = MEMBERS.find(
        (member) =>
          seen.includes(api.membershipIds[member]) &&
          !expected.includes(api.membershipIds[member]),
      );
      throw new InvariantViolation(
        extra === undefined
          ? 'model-agreement'
          : denialInvariant(model, extra, company),
        `${what}: got ${seen.length} members${extra === undefined ? '' : ` including ${extra}`}, expected ${expected.length}`,
      );
    }
    return NOTHING;
  }
  toString() {
    return `assignees(${this.member})`;
  }
}

/** The bundle's event action (PRD tenant-company-client-authorization §8). */
function assignmentAction(bundle: Bundle, operation: 'granted' | 'revoked') {
  return `company_${bundle.replaceAll('-', '_')}_assignment.${operation}`;
}

/** The Workspace owner grants one bundle through Access administration. */
class GrantBundle extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
    private readonly bundle: Bundle,
  ) {
    super();
  }
  protected async act(model: Model, api: FuzzApi) {
    const reply = await api.send(
      'owner',
      `/company-${this.bundle}-assignments`,
      {
        method: 'POST',
        key: api.nextKey(),
        body: {
          companyId: api.companyIds[this.company],
          workspaceMembershipId: api.membershipIds[this.member],
        },
      },
    );
    const what = `granting ${this.member} ${this.bundle} in Company ${this.company}`;
    if (model.suspended.has(this.member)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: 'revocation-denies',
        what,
      });
      return NOTHING;
    }
    if (reply.status !== 201)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: expected 201, got ${short(reply)}`,
      );
    const changed =
      grantOf(model, this.member, this.company, this.bundle) !== 'active';
    model.grants.set(
      grantKey(this.member, this.company, this.bundle),
      'active',
    );
    return {
      touched: [],
      events: changed
        ? [
            {
              action: assignmentAction(this.bundle, 'granted'),
              company: this.company,
              member: this.member,
            },
          ]
        : [],
    };
  }
  toString() {
    return `grant(${this.member} ${this.company} ${this.bundle})`;
  }
}

/** The owner revokes one bundle; the member's next request is denied. */
class RevokeBundle extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
    private readonly bundle: Bundle,
  ) {
    super();
  }
  protected async act(model: Model, api: FuzzApi) {
    const reply = await api.send(
      'owner',
      `/company-${this.bundle}-assignments/${api.membershipIds[this.member]}/${api.companyIds[this.company]}`,
      { method: 'DELETE', key: api.nextKey() },
    );
    const what = `revoking ${this.member} ${this.bundle} in Company ${this.company}`;
    const before = grantOf(model, this.member, this.company, this.bundle);
    // Access denies a suspended target and a bundle never granted.
    if (model.suspended.has(this.member) || before === 'never') {
      await expectDenial({
        reply,
        status: 403,
        invariant: 'model-agreement',
        what,
      });
      return NOTHING;
    }
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: expected 200, got ${short(reply)}`,
      );
    model.grants.set(
      grantKey(this.member, this.company, this.bundle),
      'revoked',
    );
    const next = await api.send(
      this.member,
      '/company-internal-tasks?status=all',
      { company: this.company },
    );
    await expectDenial({
      reply: next,
      status: 403,
      invariant: 'revocation-denies',
      what: `${this.member}'s next request after ${what}`,
    });
    return {
      touched: [],
      events:
        before === 'active'
          ? [
              {
                action: assignmentAction(this.bundle, 'revoked'),
                company: this.company,
                member: this.member,
              },
            ]
          : [],
    };
  }
  toString() {
    return `revoke(${this.member} ${this.company} ${this.bundle})`;
  }
}

/** One-way Workspace suspension; every later request is denied. */
class SuspendMember extends Step {
  constructor(private readonly member: MemberKey) {
    super();
  }
  protected async act(model: Model, api: FuzzApi) {
    const reply = await api.send('owner', '/workspace-membership-suspensions', {
      method: 'POST',
      key: api.nextKey(),
      body: { workspaceMembershipId: api.membershipIds[this.member] },
    });
    const what = `suspending ${this.member}`;
    if (model.suspended.has(this.member)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: 'model-agreement',
        what,
      });
      return NOTHING;
    }
    if (reply.status !== 201)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: expected 201, got ${short(reply)}`,
      );
    model.suspended.add(this.member);
    const company = model.context[this.member];
    const next = await api.send(
      this.member,
      '/company-internal-tasks?status=all',
      { company },
    );
    await expectDenial({
      reply: next,
      status: 403,
      invariant: 'revocation-denies',
      what: `${this.member}'s next request after ${what}`,
    });
    return {
      touched: [],
      events: [
        {
          action: 'workspace_membership.suspended',
          company: null,
          member: this.member,
        },
        {
          action: SESSION_REVOCATION_OUTCOME,
          company: null,
          member: this.member,
        },
      ],
    };
  }
  toString() {
    return `suspend(${this.member})`;
  }
}

/**
 * Resends a committed Task command with its key: the exact saved receipt
 * under live authority, else a denial, and never a new write (§36.3-§36.5).
 */
class ReplayCommand extends Step {
  protected override readonly requires: Requirement = 'confirmation';
  constructor(private readonly pick: number) {
    super();
  }
  protected async act(model: Model, api: FuzzApi) {
    const original =
      model.confirmations[this.pick % model.confirmations.length];
    if (!original)
      throw new Error('The fuzz precondition admitted no command.');
    const reply = await api.send(original.member, original.path, {
      method: 'POST',
      body: original.body,
      company: original.company,
      key: original.key,
    });
    const what = `${original.member} replaying ${original.path} in Company ${original.company}`;
    if (!canWork(model, original.member, original.company)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(model, original.member, original.company),
        what,
      });
      return NOTHING;
    }
    if (
      reply.status !== original.status ||
      canonical(reply.body) !== original.receipt
    )
      throw new InvariantViolation(
        reply.status === original.status ? 'history-once' : 'model-agreement',
        `${what}: expected the saved ${original.status} receipt, got ${short(reply)}`,
      );
    return NOTHING;
  }
  toString() {
    return `replay(#${this.pick})`;
  }
}

interface Receipt {
  task: ReturnType<typeof taskView>;
  changed: boolean;
  historyKind: string | null;
  historyVersion: number | null;
}

function readReceipt(reply: Reply): Receipt {
  const body = object(reply.body);
  const history = body.history === null ? null : object(body.history);
  if (typeof body.changed !== 'boolean')
    throw new InvariantViolation(
      'model-agreement',
      `a receipt has no changed flag: ${short(reply)}`,
    );
  return {
    task: taskView(body.task),
    changed: body.changed,
    historyKind: history === null ? null : string(history.kind),
    historyVersion:
      history === null || typeof history.version !== 'number'
        ? null
        : history.version,
  };
}

/** A fresh receipt is the model's Task and appends one fact, or none. */
function expectReceipt(input: {
  model: Model;
  api: FuzzApi;
  receipt: Receipt;
  task: TaskModel;
  kind: HistoryKind | null;
  what: string;
}) {
  const { receipt, task, kind, what } = input;
  expectTask({
    model: input.model,
    api: input.api,
    view: receipt.task,
    company: task.company,
    where: `the receipt of ${what}`,
  });
  if (
    receipt.changed !== (kind !== null) ||
    receipt.historyKind !== kind ||
    receipt.historyVersion !== (kind === null ? null : task.version)
  )
    throw new InvariantViolation(
      'history-once',
      `${what}: the receipt reports changed=${receipt.changed} with ${receipt.historyKind ?? 'no'} fact v${receipt.historyVersion ?? '-'}, expected ${kind ?? 'no'} fact v${task.version}`,
    );
}

/** The command arbitraries, repeated by weight. */
export function fuzzCommands(options: {
  steps: number;
  replayPath: string | undefined;
}) {
  const member = fc.constantFrom(...MEMBERS);
  const company = fc.constantFrom(...COMPANIES);
  const bundle = fc.constantFrom(...BUNDLES);
  const pick = fc.nat({ max: 7 });
  // One step in four aims at the other Company's Tasks, and one change in
  // four observed a stale version.
  const target: fc.Arbitrary<Target> = fc.record({
    index: pick,
    foreign: fc.nat({ max: 3 }).map((roll) => roll === 3),
  });
  const stale = fc.nat({ max: 3 }).map((roll) => roll === 3);
  const create = fc
    .tuple(
      member,
      fc.nat({ max: TITLES.length - 1 }),
      fc.constantFrom(...PRIORITIES),
    )
    .map(([who, title, priority]) => new CreateTask(who, title, priority));
  const edit = fc
    .tuple(
      member,
      target,
      fc.option(fc.constantFrom(...TITLES), { nil: undefined }),
      fc.option(fc.constantFrom(...PRIORITIES), { nil: undefined }),
      stale,
    )
    .map(
      ([who, aim, title, priority, old]) =>
        new ChangeTask(
          who,
          aim,
          title === undefined && priority === undefined
            ? { kind: 'EDIT', title: TITLES[0] }
            : {
                kind: 'EDIT',
                ...(title === undefined ? {} : { title }),
                ...(priority === undefined ? {} : { priority }),
              },
          old,
        ),
    );
  const move = fc
    .tuple(member, target, fc.constantFrom(...STATUSES), stale)
    .map(
      ([who, aim, status, old]) =>
        new ChangeTask(
          who,
          aim,
          status === 'blocked' || status === 'cancelled'
            ? { kind: 'MOVE', status, reason: 'Synthetic fuzz reason' }
            : { kind: 'MOVE', status },
          old,
        ),
    );
  const weighted: Array<[number, fc.Arbitrary<FuzzCommand>]> = [
    [4, create],
    [4, edit],
    [3, move],
    [2, fc.tuple(member, target).map(([who, aim]) => new ReadTask(who, aim))],
    [1, member.map((who) => new ListTasks(who))],
    [1, member.map((who) => new ListAssignees(who))],
    [2, fc.tuple(member, company).map(([who, c]) => new SwitchCompany(who, c))],
    [
      2,
      fc
        .tuple(member, company, bundle)
        .map(([who, c, b]) => new GrantBundle(who, c, b)),
    ],
    [
      2,
      fc
        .tuple(member, company, bundle)
        .map(([who, c, b]) => new RevokeBundle(who, c, b)),
    ],
    // Suspension is one-way: only `dan` may lose the Workspace, so that a
    // sequence keeps members to fuzz with.
    [1, fc.constant(new SuspendMember('dan'))],
    [2, pick.map((index) => new ReplayCommand(index))],
    [
      2,
      fc
        .tuple(member, member, target)
        .map(([first, second, aim]) => new ConcurrentEdits(first, second, aim)),
    ],
  ];
  const steps = weighted.flatMap(([weight, step]) =>
    Array.from({ length: weight }, () => step),
  );
  return fc.commands(steps, {
    // Without `size`, fast-check caps generation at its small default.
    size: 'max',
    maxCommands: options.steps,
    ...(options.replayPath === undefined
      ? {}
      : { replayPath: options.replayPath }),
  });
}
