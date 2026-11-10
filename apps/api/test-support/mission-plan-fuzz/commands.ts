import { randomUUID } from 'node:crypto';
import * as fc from 'fast-check';
import {
  canonical,
  expectDenial,
  short,
  type Reply,
} from '../model-fuzz/checks.js';
import {
  activityBody,
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
  type MissionPlanApi,
  type Model,
  type PlanModel,
  type StepOutcome,
} from './world.js';

type FuzzCommand = fc.AsyncCommand<Model, MissionPlanApi>;
const NOTHING: StepOutcome = { events: [] };

abstract class Step implements FuzzCommand {
  check(model: Readonly<Model>): boolean {
    return model.plans.length >= 0;
  }
  async run(model: Model, api: MissionPlanApi): Promise<void> {
    await checkStep(model, api, await this.act(model, api));
  }
  protected abstract act(
    model: Model,
    api: MissionPlanApi,
  ): Promise<StepOutcome>;
  abstract toString(): string;
}

function holders(model: Readonly<Model>, company: CompanyKey, bundle: Bundle) {
  return MEMBERS.filter((member) => granted(model, member, company, bundle));
}
function readers(model: Readonly<Model>, company: CompanyKey) {
  return MEMBERS.filter(
    (member) =>
      granted(model, member, company, 'configuration') ||
      granted(model, member, company, 'user'),
  );
}
function event(
  action: string,
  company: CompanyKey,
  member: MemberKey,
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
function content(title: string) {
  return { title, activities: [activityBody('Fictional activity')] };
}
function remember(
  model: Model,
  member: MemberKey,
  company: CompanyKey,
  key: string,
  path: string,
  body: unknown,
  receipt: unknown,
  status: number,
) {
  model.committed.push({ member, company, key, path, body, receipt, status });
}
function adopt(
  plan: PlanModel | undefined,
  reply: Reply,
  title: string,
): PlanModel {
  if (reply.status !== 201)
    throw new InvariantViolation(
      'versions-grow',
      `publish returned ${short(reply)}`,
    );
  const version = object(object(reply.body, 'publication').version, 'version');
  const number = integer(version.versionNumber, 'version number');
  const id = text(version.planId, 'plan id');
  const versionId = text(version.id, 'version id');
  if (plan) {
    if (id !== plan.id || number !== plan.headNumber + 1)
      throw new InvariantViolation(
        'versions-grow',
        `successor is ${number} of ${id}`,
      );
    plan.headNumber = number;
    plan.headId = versionId;
    plan.title = title;
    return plan;
  }
  if (number !== 1)
    throw new InvariantViolation('versions-grow', `first version is ${number}`);
  return {
    id,
    company: 'A',
    headNumber: 1,
    headId: versionId,
    title,
    frozenTitle: title,
  };
}

class Publish extends Step {
  constructor(private readonly company: CompanyKey) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return (
      model.plans.filter((plan) => plan.company === this.company).length < 3 &&
      holders(model, this.company, 'configuration').length > 0
    );
  }
  protected async act(model: Model, api: MissionPlanApi) {
    const member = holders(model, this.company, 'configuration')[0];
    if (!member) return NOTHING;
    model.serial += 1;
    const title = `Fictional plan ${model.serial}`;
    const key = api.nextKey();
    const body = content(title);
    const reply = await api.send(member, '/mission-plans', {
      method: 'POST',
      company: this.company,
      key,
      body,
    });
    const plan = adopt(undefined, reply, title);
    plan.company = this.company;
    model.plans.push(plan);
    remember(
      model,
      member,
      this.company,
      key,
      '/mission-plans',
      body,
      reply.body,
      201,
    );
    return {
      events: [event('mission_plan.version.published', this.company, member)],
    };
  }
  toString() {
    return `publish(${this.company})`;
  }
}

class Successor extends Step {
  constructor(private readonly index: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.plans.some(
      (plan) => holders(model, plan.company, 'configuration').length > 0,
    );
  }
  protected async act(model: Model, api: MissionPlanApi) {
    const ready = model.plans.filter(
      (plan) => holders(model, plan.company, 'configuration').length > 0,
    );
    const plan = ready[this.index % ready.length];
    if (!plan) return NOTHING;
    const member = holders(model, plan.company, 'configuration')[0];
    if (!member) return NOTHING;
    const previousId = plan.headId;
    const previousTitle = plan.title;
    const title = `Fictional plan head ${plan.headNumber + 1}`;
    const key = api.nextKey();
    const path = `/mission-plans/${plan.id}/versions`;
    const body = { expectedHeadVersion: plan.headNumber, ...content(title) };
    const reply = await api.send(member, path, {
      method: 'POST',
      company: plan.company,
      key,
      body,
    });
    adopt(plan, reply, title);
    const old = await api.send(
      member,
      `/mission-plans/${plan.id}/versions/${previousId}`,
      { company: plan.company },
    );
    if (old.status !== 200)
      throw new InvariantViolation(
        'immutable-version',
        `old version missing: ${short(old)}`,
      );
    const oldVersion = object(old.body, 'old version');
    const shown = object(oldVersion.version ?? oldVersion, 'old version body');
    if (shown.title !== previousTitle)
      throw new InvariantViolation(
        'immutable-version',
        `old title became ${canonical(shown.title)}`,
      );
    remember(model, member, plan.company, key, path, body, reply.body, 201);
    return {
      events: [event('mission_plan.version.published', plan.company, member)],
    };
  }
  toString() {
    return `successor(#${this.index})`;
  }
}

class StaleHead extends Step {
  constructor(private readonly index: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.plans.some(
      (plan) => holders(model, plan.company, 'configuration').length > 0,
    );
  }
  protected async act(model: Model, api: MissionPlanApi) {
    const ready = model.plans.filter(
      (plan) => holders(model, plan.company, 'configuration').length > 0,
    );
    const older = ready.filter((plan) => plan.headNumber > 1);
    const pool = older.length > 0 ? older : ready;
    const plan = pool[this.index % pool.length];
    if (!plan) return NOTHING;
    const member = holders(model, plan.company, 'configuration')[0];
    if (!member) return NOTHING;
    // An older head is the lost-update case. A future number covers a plan
    // that still has only Version 1.
    const expectedHeadVersion =
      plan.headNumber > 1 ? plan.headNumber - 1 : plan.headNumber + 1;
    const reply = await api.send(member, `/mission-plans/${plan.id}/versions`, {
      method: 'POST',
      company: plan.company,
      key: api.nextKey(),
      body: {
        expectedHeadVersion,
        ...content('Fictional stale head'),
      },
    });
    if (reply.status !== 409 || codeOf(reply) !== 'STALE_VERSION')
      throw new InvariantViolation(
        'versions-grow',
        `stale head returned ${short(reply)}`,
      );
    return NOTHING;
  }
  toString() {
    return `stale(#${this.index})`;
  }
}

class ReadVersion extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly index: number,
  ) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.plans.length > 0;
  }
  protected async act(model: Model, api: MissionPlanApi) {
    const plan = model.plans[this.index % model.plans.length];
    if (!plan) return NOTHING;
    const company = model.context[this.member];
    const reply = await api.send(
      this.member,
      `/mission-plans/${plan.id}/versions/${plan.headId}`,
      { company },
    );
    const hidden = plan.company !== company;
    const denied =
      readers(model, company).length === 0 ||
      !readers(model, company).includes(this.member);
    if (denied || hidden) {
      await expectDenial({
        reply,
        status: denied ? 403 : 404,
        invariant: denied
          ? denialInvariant(model, this.member, company, [
              'configuration',
              'user',
            ])
          : 'identical-denial',
        what: `${this.member} reads ${plan.id}`,
        twin: () =>
          api.send(
            this.member,
            `/mission-plans/${MISSING_ID}/versions/${MISSING_ID}`,
            { company, key: api.nextKey() },
          ),
      });
      return NOTHING;
    }
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `read failed: ${short(reply)}`,
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
  protected async act(model: Model, api: MissionPlanApi) {
    const committed = model.committed[this.pick % model.committed.length];
    if (!committed) return NOTHING;
    const reply = await api.send(committed.member, committed.path, {
      method: 'POST',
      company: committed.company,
      key: committed.key,
      body: committed.body,
    });
    if (!granted(model, committed.member, committed.company, 'configuration')) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(model, committed.member, committed.company, [
          'configuration',
        ]),
        what: 'replay',
      });
      return NOTHING;
    }
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
    return model.committed.length > 0;
  }
  protected async act(model: Model, api: MissionPlanApi) {
    const committed = model.committed[this.pick % model.committed.length];
    if (!committed) return NOTHING;
    const body = object(committed.body, 'body');
    const reply = await api.send(committed.member, committed.path, {
      method: 'POST',
      company: committed.company,
      key: committed.key,
      body: { ...body, title: 'Fictional other plan title' },
    });
    if (!granted(model, committed.member, committed.company, 'configuration')) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(model, committed.member, committed.company, [
          'configuration',
        ]),
        what: 'key reuse',
      });
      return NOTHING;
    }
    if (reply.status !== 409 || codeOf(reply) !== 'IDEMPOTENCY_CONFLICT')
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
  protected async act(model: Model, api: MissionPlanApi) {
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
  protected async act(model: Model, api: MissionPlanApi) {
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
    [4, company.map((chosen) => new Publish(chosen))],
    [3, fc.nat({ max: 5 }).map((index) => new Successor(index))],
    [2, fc.nat({ max: 5 }).map((index) => new StaleHead(index))],
    [
      1,
      fc
        .tuple(member, fc.nat({ max: 5 }))
        .map((args) => new ReadVersion(...args)),
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
