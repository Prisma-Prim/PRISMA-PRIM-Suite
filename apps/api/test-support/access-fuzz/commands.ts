import { randomUUID } from 'node:crypto';
import * as fc from 'fast-check';
import { canonical, expectDenial, short } from '../model-fuzz/checks.js';
import {
  assignmentAction,
  bundleAssignments,
  BUNDLES,
  checkStep,
  COMPANIES,
  granted,
  InvariantViolation,
  MEMBERS,
  MISSING_ID,
  object,
  setGrant,
  text,
  type AccessApi,
  type Bundle,
  type CompanyKey,
  type Committed,
  type ExpectedEvent,
  type MemberKey,
  type Model,
  type StepOutcome,
} from './world.js';

type FuzzCommand = fc.AsyncCommand<Model, AccessApi>;
const NOTHING: StepOutcome = { events: [] };

abstract class Step implements FuzzCommand {
  check(model: Readonly<Model>): boolean {
    // The model is always usable. Subclasses add a real precondition.
    return model.suspended.size >= 0;
  }
  async run(model: Model, api: AccessApi): Promise<void> {
    await checkStep(model, api, await this.act(model, api));
  }
  protected abstract act(model: Model, api: AccessApi): Promise<StepOutcome>;
  abstract toString(): string;
}

function event(
  action: string,
  company: CompanyKey | undefined,
  member: MemberKey,
): ExpectedEvent {
  return { action, company, member };
}
function remember(model: Model, committed: Committed) {
  model.committed.push(committed);
}
class GrantBundle extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
    private readonly bundle: Bundle,
  ) {
    super();
  }
  protected async act(model: Model, api: AccessApi) {
    const key = randomUUID();
    const path = bundleAssignments(this.bundle);
    const body = {
      companyId: api.world.companyIds[this.company],
      workspaceMembershipId: api.world.membershipIds[this.member],
    };
    const reply = await api.send('owner', path, { method: 'POST', key, body });
    if (model.suspended.has(this.member)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: 'revocation-denies',
        what: `grant to suspended ${this.member}`,
      });
      return NOTHING;
    }
    if (reply.status !== 201)
      throw new InvariantViolation(
        'model-agreement',
        `grant failed: ${short(reply)}`,
      );
    const changed = !granted(model, this.member, this.company, this.bundle);
    setGrant(model, this.member, this.company, this.bundle, 'active');
    remember(model, {
      member: 'owner',
      company: this.company,
      key,
      path,
      method: 'POST',
      body,
      receipt: reply.body,
      status: 201,
    });
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
  protected async act(model: Model, api: AccessApi) {
    const key = randomUUID();
    const path = `${bundleAssignments(this.bundle)}/${api.world.membershipIds[this.member]}/${api.world.companyIds[this.company]}`;
    const reply = await api.send('owner', path, { method: 'DELETE', key });
    if (model.suspended.has(this.member)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: 'revocation-denies',
        what: `revoke from suspended ${this.member}`,
      });
      return NOTHING;
    }
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `revoke failed: ${short(reply)}`,
      );
    const changed = granted(model, this.member, this.company, this.bundle);
    if (changed)
      setGrant(model, this.member, this.company, this.bundle, 'revoked');
    remember(model, {
      member: 'owner',
      company: this.company,
      key,
      path,
      method: 'DELETE',
      body: null,
      receipt: reply.body,
      status: 200,
    });
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

class ReadActor extends Step {
  constructor(private readonly member: MemberKey) {
    super();
  }
  protected async act(model: Model, api: AccessApi) {
    const reply = await api.send(this.member, '/access/current-actor', {
      company: model.context[this.member],
    });
    if (model.suspended.has(this.member)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: 'revocation-denies',
        what: `${this.member} reads the actor`,
      });
      return NOTHING;
    }
    if (reply.status !== 200)
      throw new InvariantViolation(
        'actor-identity',
        `current actor failed: ${short(reply)}`,
      );
    const body = object(reply.body, 'current actor');
    if (
      text(body.workspaceMembershipId, 'membership') !==
      api.world.membershipIds[this.member]
    )
      throw new InvariantViolation(
        'actor-identity',
        `${this.member} read another membership`,
      );
    return NOTHING;
  }
  toString() {
    return `actor(${this.member})`;
  }
}

class ListClients extends Step {
  constructor(private readonly member: MemberKey) {
    super();
  }
  protected async act(model: Model, api: AccessApi) {
    const company = model.context[this.member];
    const reply = await api.send(this.member, '/clients', { company });
    if (model.suspended.has(this.member)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: 'revocation-denies',
        what: `${this.member} lists clients`,
      });
      return NOTHING;
    }
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `client list failed: ${short(reply)}`,
      );
    if (!Array.isArray(reply.body))
      throw new InvariantViolation(
        'model-agreement',
        'client list is not a list',
      );
    const names = reply.body.map(
      (item) => object(item, 'a client').displayName,
    );
    const own = `Fictional Access Client ${company}`;
    const other = `Fictional Access Client ${company === 'A' ? 'B' : 'A'}`;
    if (names.includes(other) || !names.includes(own))
      throw new InvariantViolation(
        'company-isolation',
        `${this.member} in Company ${company} sees [${names.join(', ')}]`,
      );
    return NOTHING;
  }
  toString() {
    return `clients(${this.member})`;
  }
}

class ListProjects extends Step {
  constructor(private readonly member: MemberKey) {
    super();
  }
  protected async act(model: Model, api: AccessApi) {
    const company = model.context[this.member];
    const reply = await api.send(this.member, '/projects', { company });
    const allowed =
      !model.suspended.has(this.member) &&
      granted(model, this.member, company, 'project');
    if (!allowed) {
      await expectDenial({
        reply,
        status: 403,
        invariant: model.suspended.has(this.member)
          ? 'revocation-denies'
          : 'revocation-denies',
        what: `${this.member} lists projects`,
      });
      return NOTHING;
    }
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `project list failed: ${short(reply)}`,
      );
    return NOTHING;
  }
  toString() {
    return `projects(${this.member})`;
  }
}

class SuspendMember extends Step {
  constructor(private readonly member: MemberKey) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return !model.suspended.has(this.member);
  }
  protected async act(model: Model, api: AccessApi) {
    const key = api.nextKey();
    const path = '/workspace-membership-suspensions';
    const body = {
      workspaceMembershipId: api.world.membershipIds[this.member],
    };
    const reply = await api.send('owner', path, { method: 'POST', key, body });
    if (reply.status !== 201)
      throw new InvariantViolation(
        'model-agreement',
        `suspend failed: ${short(reply)}`,
      );
    const recorded = object(reply.body, 'suspension');
    if (recorded.status !== 'inactive')
      throw new InvariantViolation(
        'revocation-denies',
        `suspension returned ${short(reply)}`,
      );
    model.suspended.add(this.member);
    remember(model, {
      member: 'owner',
      company: null,
      key,
      path,
      method: 'POST',
      body,
      receipt: reply.body,
      status: 201,
    });
    return {
      events: [
        event('workspace_membership.suspended', undefined, this.member),
        event(
          'workspace_sessions.revocation_retry_required',
          undefined,
          this.member,
        ),
      ],
    };
  }
  toString() {
    return `suspend(${this.member})`;
  }
}

class Replay extends Step {
  constructor(private readonly pick: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.committed.length > 0;
  }
  protected async act(model: Model, api: AccessApi) {
    const committed = model.committed[this.pick % model.committed.length];
    if (!committed) return NOTHING;
    const reply = await api.send(committed.member, committed.path, {
      method: committed.method,
      company: committed.company,
      key: committed.key,
      ...(committed.body === null ? {} : { body: committed.body }),
    });
    if (
      reply.status !== committed.status ||
      canonical(reply.body) !== canonical(committed.receipt)
    )
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
    return model.committed.some(
      (item) => item.method === 'POST' && item.body !== null,
    );
  }
  protected async act(model: Model, api: AccessApi) {
    const pool = model.committed.filter(
      (item) => item.method === 'POST' && item.body !== null,
    );
    const committed = pool[this.pick % pool.length];
    if (!committed) return NOTHING;
    const body = object(committed.body, 'body');
    const next = {
      ...body,
      workspaceMembershipId: MISSING_ID,
    };
    const reply = await api.send(committed.member, committed.path, {
      method: 'POST',
      company: committed.company,
      key: committed.key,
      body: next,
    });
    const message =
      reply.body && typeof reply.body === 'object' && !Array.isArray(reply.body)
        ? Object.fromEntries(Object.entries(reply.body)).message
        : undefined;
    if (
      reply.status !== 400 ||
      (message !== 'Idempotency-Key was already used for another command.' &&
        message !== 'Idempotency-Key was already used for another suspension.')
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

export function fuzzCommands(options: {
  steps: number;
  replayPath: string | undefined;
}) {
  const member = fc.constantFrom(...MEMBERS);
  const company = fc.constantFrom(...COMPANIES);
  const bundle = fc.constantFrom(...BUNDLES);
  const weighted: Array<[number, fc.Arbitrary<FuzzCommand>]> = [
    [
      3,
      fc.tuple(member, company, bundle).map((args) => new GrantBundle(...args)),
    ],
    [
      3,
      fc
        .tuple(member, company, bundle)
        .map((args) => new RevokeBundle(...args)),
    ],
    [2, fc.tuple(member, company).map((args) => new SwitchCompany(...args))],
    [2, member.map((who) => new ReadActor(who))],
    [2, member.map((who) => new ListClients(who))],
    [2, member.map((who) => new ListProjects(who))],
    [1, member.map((who) => new SuspendMember(who))],
    [2, fc.nat({ max: 5 }).map((index) => new Replay(index))],
    [1, fc.nat({ max: 5 }).map((index) => new ReuseKey(index))],
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
