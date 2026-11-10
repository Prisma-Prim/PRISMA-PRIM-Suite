import { randomUUID } from 'node:crypto';
import * as fc from 'fast-check';
import {
  canonical,
  expectDenial,
  short,
  type Reply,
} from '../model-fuzz/checks.js';
import {
  assignmentAction,
  bundleAssignments,
  BUNDLES,
  checkStep,
  COMPANIES,
  denialInvariant,
  granted,
  integer,
  InvariantViolation,
  MEMBERS,
  MISSING_ID,
  object,
  setGrant,
  text,
  type Bundle,
  type CompanyKey,
  type ExpectedEvent,
  type MemberKey,
  type Model,
  type Phase,
  type ProjectApi,
  type ProjectModel,
  type Status,
  type StepOutcome,
} from './world.js';

type FuzzCommand = fc.AsyncCommand<Model, ProjectApi>;
const NOTHING: StepOutcome = { events: [] };
const DECLARATION = {
  approvedOffer: 'missing',
  contractOrPrecontract: 'missing',
  projectPlan: 'missing',
  initialDocuments: 'missing',
  deadlines: 'missing',
  financialConditions: 'missing',
  risks: 'missing',
};

abstract class Step implements FuzzCommand {
  check(model: Readonly<Model>): boolean {
    return model.projects.length >= 0;
  }
  async run(model: Model, api: ProjectApi): Promise<void> {
    await checkStep(model, api, await this.act(model, api));
  }
  protected abstract act(model: Model, api: ProjectApi): Promise<StepOutcome>;
  abstract toString(): string;
}

function holders(
  model: Readonly<Model>,
  company: CompanyKey,
  role: Bundle,
): MemberKey[] {
  return MEMBERS.filter((member) => granted(model, member, company, role));
}
function approvers(model: Readonly<Model>, company: CompanyKey): MemberKey[] {
  return MEMBERS.filter(
    (member) =>
      granted(model, member, company, 'project') &&
      granted(model, member, company, 'approver'),
  );
}
function event(
  action: string,
  company: CompanyKey,
  member: MemberKey | 'owner',
): ExpectedEvent {
  return { action, company, member };
}
function codeOf(reply: Reply) {
  if (
    !reply.body ||
    typeof reply.body !== 'object' ||
    Array.isArray(reply.body)
  )
    return undefined;
  const code = Object.fromEntries(Object.entries(reply.body)).code;
  return typeof code === 'string' ? code : undefined;
}
function messageOf(reply: Reply) {
  if (
    !reply.body ||
    typeof reply.body !== 'object' ||
    Array.isArray(reply.body)
  )
    return undefined;
  const message = Object.fromEntries(Object.entries(reply.body)).message;
  return typeof message === 'string' ? message : undefined;
}
function remember(
  model: Model,
  member: MemberKey,
  company: CompanyKey,
  key: string,
  path: string,
  method: 'POST' | 'PUT',
  body: unknown,
  receipt: unknown,
  status: number,
) {
  model.committed.push({
    member,
    company,
    key,
    path,
    method,
    body,
    receipt,
    status,
  });
}

class CreateProject extends Step {
  constructor(private readonly company: CompanyKey) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return (
      model.projects.filter((project) => project.company === this.company)
        .length < 3 && holders(model, this.company, 'project').length > 0
    );
  }
  protected async act(model: Model, api: ProjectApi) {
    const member = holders(model, this.company, 'project')[0];
    if (!member) return NOTHING;
    model.serial[this.company] += 1;
    const title = `Fictional Project ${this.company} ${model.serial[this.company]}`;
    const key = api.nextKey();
    const body = { title, clientAccountId: api.world.clientIds[this.company] };
    const reply = await api.send(member, '/projects', {
      method: 'POST',
      company: this.company,
      key,
      body,
    });
    if (reply.status !== 201)
      throw new InvariantViolation(
        'model-agreement',
        `create failed: ${short(reply)}`,
      );
    const created = object(reply.body, 'the Project');
    const project: ProjectModel = {
      id: text(created.id, 'id'),
      company: this.company,
      title,
      phase: 'created',
      status: 'preparatory',
      lifecycleRevision: 0,
      responsibilityRevision: 0,
    };
    if (
      created.status !== 'preparatory' ||
      api.companyOf(created.companyId) !== this.company
    )
      throw new InvariantViolation(
        'lifecycle',
        `create returned ${short(reply)}`,
      );
    model.projects.push(project);
    remember(
      model,
      member,
      this.company,
      key,
      '/projects',
      'POST',
      body,
      reply.body,
      201,
    );
    return { events: [event('project.created', this.company, member)] };
  }
  toString() {
    return `create(${this.company})`;
  }
}

class Advance extends Step {
  constructor(private readonly index: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.projects.some(
      (project) => nextRole(project) !== undefined && can(model, project),
    );
  }
  protected async act(model: Model, api: ProjectApi) {
    const ready = model.projects.filter(
      (project) => nextRole(project) !== undefined && can(model, project),
    );
    const project = ready[this.index % ready.length];
    if (!project) return NOTHING;
    const role = nextRole(project);
    if (!role) return NOTHING;
    const eligible =
      role === 'project'
        ? holders(model, project.company, 'project')
        : approvers(model, project.company);
    const member = eligible[0];
    if (!member) return NOTHING;
    if (project.phase === 'created') return assign(model, api, project, member);
    return transition(model, api, project, member, nextAction(project));
  }
  toString() {
    return `advance(#${this.index})`;
  }
}
function nextRole(project: ProjectModel): Bundle | undefined {
  if (project.phase === 'closed') return undefined;
  return project.phase === 'created' ? 'project' : 'approver';
}
function can(model: Readonly<Model>, project: ProjectModel) {
  const role = nextRole(project);
  if (!role) return false;
  return role === 'project'
    ? holders(model, project.company, 'project').length > 0
    : approvers(model, project.company).length > 0;
}
function nextAction(
  project: ProjectModel,
): 'activate' | 'hold' | 'resume' | 'complete' {
  if (project.phase === 'assigned') return 'activate';
  if (project.phase === 'active') return 'hold';
  if (project.phase === 'held') return 'resume';
  return 'complete';
}

async function assign(
  model: Model,
  api: ProjectApi,
  project: ProjectModel,
  member: MemberKey,
) {
  const key = api.nextKey();
  const path = `/projects/${project.id}/responsible`;
  const body = {
    expectedRevision: project.responsibilityRevision,
    workspaceMembershipId: api.world.membershipIds.owner,
  };
  const reply = await api.send(member, path, {
    method: 'PUT',
    company: project.company,
    key,
    body,
  });
  if (reply.status !== 200)
    throw new InvariantViolation('lifecycle', `assign failed: ${short(reply)}`);
  const receipt = object(reply.body, 'responsibility');
  project.responsibilityRevision = integer(receipt.revision, 'revision');
  project.phase = 'assigned';
  remember(
    model,
    member,
    project.company,
    key,
    path,
    'PUT',
    body,
    reply.body,
    200,
  );
  return {
    events: [event('project.responsible.changed', project.company, member)],
  };
}

async function transition(
  model: Model,
  api: ProjectApi,
  project: ProjectModel,
  member: MemberKey,
  action: 'activate' | 'hold' | 'resume' | 'complete' | 'cancel',
) {
  const key = api.nextKey();
  const path = `/projects/${project.id}/lifecycle-transitions`;
  const body = transitionBody(project, action, api.world.membershipIds.owner);
  const reply = await api.send(member, path, {
    method: 'POST',
    company: project.company,
    key,
    body,
  });
  if (reply.status !== 200)
    throw new InvariantViolation(
      'lifecycle',
      `${action} failed: ${short(reply)}`,
    );
  const receipt = object(reply.body, 'transition');
  const next = after(project.phase, action);
  if (
    receipt.to !== next.status ||
    integer(receipt.lifecycleRevision, 'revision') !==
      project.lifecycleRevision + 1
  )
    throw new InvariantViolation(
      'lifecycle',
      `${action} returned ${short(reply)}`,
    );
  project.lifecycleRevision += 1;
  project.phase = next.phase;
  project.status = next.status;
  remember(
    model,
    member,
    project.company,
    key,
    path,
    'POST',
    body,
    reply.body,
    200,
  );
  return {
    events: [event('project.lifecycle.changed', project.company, member)],
  };
}
function transitionBody(
  project: ProjectModel,
  action: 'activate' | 'hold' | 'resume' | 'complete' | 'cancel',
  ownerId: string,
) {
  const expectedLifecycleRevision = project.lifecycleRevision;
  if (action === 'activate')
    return {
      action,
      expectedLifecycleRevision,
      declaration: DECLARATION,
      startException: {
        reason: 'Fictional preparation exception.',
        completionMembershipId: ownerId,
        completionDueDate: '2035-06-01',
      },
    };
  if (action === 'hold')
    return { action, expectedLifecycleRevision, reason: 'Fictional hold.' };
  if (action === 'complete')
    return { action, expectedLifecycleRevision, note: 'Fictional completion.' };
  if (action === 'cancel')
    return {
      action,
      expectedLifecycleRevision,
      reason: 'Fictional cancellation.',
    };
  return { action, expectedLifecycleRevision };
}
function after(
  phase: Phase,
  action: 'activate' | 'hold' | 'resume' | 'complete' | 'cancel',
): { phase: Phase; status: Status } {
  if (action === 'activate') return { phase: 'active', status: 'active' };
  if (action === 'hold') return { phase: 'held', status: 'on_hold' };
  if (action === 'resume') return { phase: 'resumed', status: 'active' };
  return {
    phase: 'closed',
    status: action === 'complete' ? 'completed' : 'cancelled',
  };
}

class CancelProject extends Step {
  constructor(private readonly index: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.projects.some(
      (project) =>
        project.phase !== 'closed' &&
        project.phase !== 'created' &&
        approvers(model, project.company).length > 0 &&
        holders(model, project.company, 'project').length > 0,
    );
  }
  protected async act(model: Model, api: ProjectApi) {
    const ready = model.projects.filter(
      (project) =>
        project.phase !== 'closed' &&
        project.phase !== 'created' &&
        approvers(model, project.company).length > 0 &&
        holders(model, project.company, 'project').length > 0,
    );
    const project = ready[this.index % ready.length];
    if (!project) return NOTHING;
    const member = approvers(model, project.company)[0];
    if (!member) return NOTHING;
    return transition(model, api, project, member, 'cancel');
  }
  toString() {
    return `cancel(#${this.index})`;
  }
}

class Premature extends Step {
  constructor(private readonly index: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.projects.some(
      (project) =>
        (project.status === 'preparatory' || project.phase === 'closed') &&
        approvers(model, project.company).length > 0 &&
        holders(model, project.company, 'project').length > 0,
    );
  }
  protected async act(model: Model, api: ProjectApi) {
    const ready = model.projects.filter(
      (project) =>
        (project.status === 'preparatory' || project.phase === 'closed') &&
        approvers(model, project.company).length > 0 &&
        holders(model, project.company, 'project').length > 0,
    );
    const project = ready[this.index % ready.length];
    if (!project) return NOTHING;
    const member = approvers(model, project.company)[0];
    if (!member) return NOTHING;
    const key = api.nextKey();
    const reply = await api.send(
      member,
      `/projects/${project.id}/lifecycle-transitions`,
      {
        method: 'POST',
        company: project.company,
        key,
        body: {
          action: 'hold',
          expectedLifecycleRevision: project.lifecycleRevision,
          reason: 'Fictional early hold.',
        },
      },
    );
    await expectDenial({
      reply,
      status: 409,
      invariant: 'lifecycle',
      what: 'early hold',
    });
    if (codeOf(reply) !== 'project_lifecycle_transition_invalid')
      throw new InvariantViolation(
        'lifecycle',
        `early hold returned ${short(reply)}`,
      );
    return NOTHING;
  }
  toString() {
    return `early(#${this.index})`;
  }
}

class StaleRevision extends Step {
  constructor(private readonly index: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.projects.some(
      (project) =>
        project.lifecycleRevision > 0 &&
        approvers(model, project.company).length > 0 &&
        holders(model, project.company, 'project').length > 0,
    );
  }
  protected async act(model: Model, api: ProjectApi) {
    const ready = model.projects.filter(
      (project) =>
        project.lifecycleRevision > 0 &&
        approvers(model, project.company).length > 0 &&
        holders(model, project.company, 'project').length > 0,
    );
    const project = ready[this.index % ready.length];
    if (!project) return NOTHING;
    const member = approvers(model, project.company)[0];
    if (!member) return NOTHING;
    const reply = await api.send(
      member,
      `/projects/${project.id}/lifecycle-transitions`,
      {
        method: 'POST',
        company: project.company,
        key: api.nextKey(),
        body: {
          action: 'hold',
          expectedLifecycleRevision: project.lifecycleRevision - 1,
          reason: 'Fictional stale hold.',
        },
      },
    );
    if (reply.status !== 409 || codeOf(reply) !== 'project_lifecycle_conflict')
      throw new InvariantViolation(
        'revisions-grow',
        `stale revision returned ${short(reply)}`,
      );
    return NOTHING;
  }
  toString() {
    return `stale(#${this.index})`;
  }
}

class ReadProject extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly index: number,
  ) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.projects.length > 0;
  }
  protected async act(model: Model, api: ProjectApi) {
    const project = model.projects[this.index % model.projects.length];
    if (!project) return NOTHING;
    const company = model.context[this.member];
    const reply = await api.send(
      this.member,
      `/projects/${project.id}/lifecycle`,
      { company },
    );
    const hidden = project.company !== company;
    const denied = !granted(model, this.member, company, 'project');
    if (denied || hidden) {
      await expectDenial({
        reply,
        status: denied ? 403 : 404,
        invariant: denied
          ? denialInvariant(model, this.member, company, ['project'])
          : 'identical-denial',
        what: `${this.member} reads ${project.id}`,
        twin: () =>
          api.send(this.member, `/projects/${MISSING_ID}/lifecycle`, {
            company,
            key: api.nextKey(),
          }),
      });
      return NOTHING;
    }
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `read failed: ${short(reply)}`,
      );
    const body = object(reply.body, 'lifecycle');
    if (body.status !== project.status)
      throw new InvariantViolation(
        'lifecycle',
        `read status ${canonical(body.status)}`,
      );
    return NOTHING;
  }
  toString() {
    return `read(${this.member} #${this.index})`;
  }
}

class Replay extends Step {
  constructor(private readonly pick: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.committed.length > 0;
  }
  protected async act(model: Model, api: ProjectApi) {
    const committed = model.committed[this.pick % model.committed.length];
    if (!committed) return NOTHING;
    const reply = await api.send(committed.member, committed.path, {
      method: committed.method,
      company: committed.company,
      key: committed.key,
      body: committed.body,
    });
    const needsApprover = committed.path.includes('lifecycle');
    const denied = denialInvariant(
      model,
      committed.member,
      committed.company,
      needsApprover ? ['project', 'approver'] : ['project'],
    );
    const missing =
      !granted(model, committed.member, committed.company, 'project') ||
      (needsApprover &&
        !granted(model, committed.member, committed.company, 'approver'));
    if (missing) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denied,
        what: 'replay',
      });
      return NOTHING;
    }
    if (reply.status !== committed.status)
      throw new InvariantViolation(
        'replay-receipt',
        `replay returned ${short(reply)}`,
      );
    // Creation replay returns the live Project. A later transition changes
    // its status, so only the id is frozen. Lifecycle and responsibility
    // replays return the stored receipt.
    if (committed.path === '/projects') {
      const saved = object(committed.receipt, 'saved Project');
      const again = object(reply.body, 'replayed Project');
      if (again.id !== saved.id)
        throw new InvariantViolation(
          'replay-receipt',
          'replay named another Project',
        );
      return NOTHING;
    }
    if (canonical(reply.body) !== canonical(committed.receipt))
      throw new InvariantViolation(
        'replay-receipt',
        `replay returned ${short(reply)}`,
      );
    return NOTHING;
  }
  toString() {
    return `replay(#${this.pick})`;
  }
}

class ReuseKey extends Step {
  constructor(private readonly pick: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.committed.length > 0;
  }
  protected async act(model: Model, api: ProjectApi) {
    const committed = model.committed[this.pick % model.committed.length];
    if (!committed) return NOTHING;
    const body = object(committed.body, 'body');
    const next =
      'title' in body
        ? { ...body, title: 'Fictional other Project title' }
        : 'expectedRevision' in body
          ? {
              ...body,
              expectedRevision: integer(body.expectedRevision, 'revision') + 1,
            }
          : {
              ...body,
              expectedLifecycleRevision:
                integer(body.expectedLifecycleRevision, 'revision') + 1,
            };
    const reply = await api.send(committed.member, committed.path, {
      method: committed.method,
      company: committed.company,
      key: committed.key,
      body: next,
    });
    const needsApprover = committed.path.includes('lifecycle');
    if (
      !granted(model, committed.member, committed.company, 'project') ||
      (needsApprover &&
        !granted(model, committed.member, committed.company, 'approver'))
    ) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(
          model,
          committed.member,
          committed.company,
          needsApprover ? ['project', 'approver'] : ['project'],
        ),
        what: 'key reuse',
      });
      return NOTHING;
    }
    if (
      reply.status !== 409 ||
      !messageOf(reply)?.startsWith('Idempotency-Key was already used')
    )
      throw new InvariantViolation(
        'replay-receipt',
        `key reuse returned ${short(reply)}`,
      );
    return NOTHING;
  }
  toString() {
    return `reuse(#${this.pick})`;
  }
}

class GrantBundle extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
    private readonly bundle: Bundle,
  ) {
    super();
  }
  protected async act(model: Model, api: ProjectApi) {
    const reply = await api.send('owner', bundleAssignments(this.bundle), {
      method: 'POST',
      key: randomUUID(),
      body: {
        companyId: api.world.companyIds[this.company],
        workspaceMembershipId: api.world.membershipIds[this.member],
      },
    });
    if (reply.status !== 201)
      throw new InvariantViolation(
        'model-agreement',
        `grant failed: ${short(reply)}`,
      );
    const changed = !granted(model, this.member, this.company, this.bundle);
    setGrant(model, this.member, this.company, this.bundle, 'active');
    return {
      events: changed
        ? [
            event(
              assignmentAction(this.bundle, 'granted'),
              this.company,
              this.member,
            ),
          ]
        : [],
    };
  }
  toString() {
    return `grant(${this.member} ${this.company} ${this.bundle})`;
  }
}

class RevokeBundle extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
    private readonly bundle: Bundle,
  ) {
    super();
  }
  protected async act(model: Model, api: ProjectApi) {
    const reply = await api.send(
      'owner',
      `${bundleAssignments(this.bundle)}/${api.world.membershipIds[this.member]}/${api.world.companyIds[this.company]}`,
      { method: 'DELETE', key: randomUUID() },
    );
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `revoke failed: ${short(reply)}`,
      );
    const changed = granted(model, this.member, this.company, this.bundle);
    if (changed)
      setGrant(model, this.member, this.company, this.bundle, 'revoked');
    return {
      events: changed
        ? [
            event(
              assignmentAction(this.bundle, 'revoked'),
              this.company,
              this.member,
            ),
          ]
        : [],
    };
  }
  toString() {
    return `revoke(${this.member} ${this.company} ${this.bundle})`;
  }
}

class SwitchCompany extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
  ) {
    super();
  }
  protected async act(model: Model) {
    model.context[this.member] = this.company;
    return NOTHING;
  }
  toString() {
    return `company(${this.member} ${this.company})`;
  }
}

export function fuzzCommands(options: {
  steps: number;
  replayPath: string | undefined;
}) {
  const member = fc.constantFrom(...MEMBERS);
  const company = fc.constantFrom(...COMPANIES);
  const bundle = fc.constantFrom(...BUNDLES);
  const weighted: Array<[number, fc.Arbitrary<FuzzCommand>]> = [
    [3, company.map((chosen) => new CreateProject(chosen))],
    [5, fc.nat({ max: 5 }).map((index) => new Advance(index))],
    [1, fc.nat({ max: 5 }).map((index) => new CancelProject(index))],
    [2, fc.nat({ max: 5 }).map((index) => new Premature(index))],
    [1, fc.nat({ max: 5 }).map((index) => new StaleRevision(index))],
    [
      1,
      fc
        .tuple(member, fc.nat({ max: 5 }))
        .map((args) => new ReadProject(...args)),
    ],
    [2, fc.nat({ max: 5 }).map((index) => new Replay(index))],
    [1, fc.nat({ max: 5 }).map((index) => new ReuseKey(index))],
    [1, fc.tuple(member, company).map((args) => new SwitchCompany(...args))],
    [
      1,
      fc.tuple(member, company, bundle).map((args) => new GrantBundle(...args)),
    ],
    [
      1,
      fc
        .tuple(member, company, bundle)
        .map((args) => new RevokeBundle(...args)),
    ],
  ];
  const steps = weighted.flatMap(([weight, step]) =>
    Array.from({ length: weight }, () => step),
  );
  return fc.commands(steps, {
    size: 'max',
    maxCommands: options.steps,
    ...(options.replayPath === undefined
      ? {}
      : { replayPath: options.replayPath }),
  });
}
