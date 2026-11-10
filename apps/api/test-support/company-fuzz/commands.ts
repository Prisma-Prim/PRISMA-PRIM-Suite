import * as fc from 'fast-check';
import { canonical, expectDenial, short } from '../model-fuzz/checks.js';
import {
  checkStep,
  InvariantViolation,
  MEMBERS,
  MISSING_ID,
  object,
  text,
  type Actor,
  type CompanyApi,
  type CompanyModel,
  type ExpectedEvent,
  type MemberKey,
  type Model,
  type StepOutcome,
} from './world.js';

type FuzzCommand = fc.AsyncCommand<Model, CompanyApi>;
const NOTHING: StepOutcome = { events: [] };

abstract class Step implements FuzzCommand {
  check(model: Readonly<Model>): boolean {
    return model.companies.length >= 0;
  }
  async run(model: Model, api: CompanyApi): Promise<void> {
    await checkStep(model, api, await this.act(model, api));
  }
  protected abstract act(model: Model, api: CompanyApi): Promise<StepOutcome>;
  abstract toString(): string;
}

function event(
  action: string,
  companyId: string | undefined,
  member: Actor | undefined,
): ExpectedEvent {
  return { action, companyId, member };
}

class RegisterCompany extends Step {
  constructor(private readonly member: Actor) {
    super();
  }
  protected async act(model: Model, api: CompanyApi) {
    const key = api.nextKey();
    model.serial += 1;
    const displayName = `Fictional Company ${model.serial}`;
    const body = { displayName };
    const reply = await api.send(this.member, '/companies', {
      method: 'POST',
      key,
      body,
    });
    if (this.member !== 'owner') {
      await expectDenial({
        reply,
        status: 403,
        invariant: 'identical-denial',
        what: `${this.member} registers a Company`,
      });
      model.serial -= 1;
      return NOTHING;
    }
    if (reply.status !== 201)
      throw new InvariantViolation(
        'model-agreement',
        `register failed: ${short(reply)}`,
      );
    const created = object(reply.body, 'the Company');
    const company: CompanyModel = {
      id: text(created.id, 'id'),
      displayName,
      holders: [],
    };
    if (created.displayName !== displayName || created.status !== 'active')
      throw new InvariantViolation(
        'model-agreement',
        `register returned ${short(reply)}`,
      );
    model.companies.push(company);
    model.committed.push({
      key,
      path: '/companies',
      method: 'POST',
      body,
      receipt: reply.body,
      status: 201,
    });
    // The public Company event names the Company. The acting membership is
    // not on that target, so the fact is matched by action and Company.
    return { events: [event('company.registered', company.id, undefined)] };
  }
  toString() {
    return `register(${this.member})`;
  }
}

class GrantContext extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly index: number,
  ) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.companies.length > 0;
  }
  protected async act(model: Model, api: CompanyApi) {
    const company = model.companies[this.index % model.companies.length];
    if (!company) return NOTHING;
    const key = api.nextKey();
    const body = {
      companyId: company.id,
      workspaceMembershipId: api.world.membershipIds[this.member],
    };
    const reply = await api.send('owner', '/company-context-assignments', {
      method: 'POST',
      key,
      body,
    });
    if (reply.status !== 201)
      throw new InvariantViolation(
        'model-agreement',
        `grant failed: ${short(reply)}`,
      );
    const changed = !company.holders.includes(this.member);
    if (changed) company.holders.push(this.member);
    return {
      events: changed
        ? [event('company_context_assignment.granted', company.id, this.member)]
        : [],
    };
  }
  toString() {
    return `grant(${this.member} #${this.index})`;
  }
}

class RevokeContext extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly index: number,
  ) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.companies.some((company) =>
      company.holders.includes(this.member),
    );
  }
  protected async act(model: Model, api: CompanyApi) {
    const held = model.companies.filter((company) =>
      company.holders.includes(this.member),
    );
    const company = held[this.index % held.length];
    if (!company) return NOTHING;
    const reply = await api.send(
      'owner',
      `/company-context-assignments/${api.world.membershipIds[this.member]}/${company.id}`,
      { method: 'DELETE', key: api.nextKey() },
    );
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `revoke failed: ${short(reply)}`,
      );
    company.holders = company.holders.filter(
      (holder) => holder !== this.member,
    );
    return {
      events: [
        event('company_context_assignment.revoked', company.id, this.member),
      ],
    };
  }
  toString() {
    return `revoke(${this.member} #${this.index})`;
  }
}

class ListCompanies extends Step {
  constructor(private readonly member: Actor) {
    super();
  }
  protected async act(model: Model, api: CompanyApi) {
    const reply = await api.send(this.member, '/companies');
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `list failed: ${short(reply)}`,
      );
    if (!Array.isArray(reply.body))
      throw new InvariantViolation('model-agreement', 'list is not a list');
    const ids = reply.body
      .map((item) => text(object(item, 'a company').id, 'id'))
      .sort();
    const member = this.member;
    const wanted = (
      member === 'owner'
        ? model.companies
        : model.companies.filter((company) => company.holders.includes(member))
    )
      .map((company) => company.id)
      .sort();
    if (canonical(ids) !== canonical(wanted))
      throw new InvariantViolation(
        'company-isolation',
        `${this.member} sees [${ids.join(', ')}], expected [${wanted.join(', ')}]`,
      );
    return NOTHING;
  }
  toString() {
    return `list(${this.member})`;
  }
}

class ReadCompany extends Step {
  constructor(
    private readonly member: Actor,
    private readonly index: number,
    private readonly missing: boolean,
  ) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return this.missing || model.companies.length > 0;
  }
  protected async act(model: Model, api: CompanyApi) {
    const company = this.missing
      ? undefined
      : model.companies[this.index % model.companies.length];
    const id = company?.id ?? MISSING_ID;
    const reply = await api.send(this.member, `/companies/${id}`);
    if (this.member !== 'owner') {
      await expectDenial({
        reply,
        status: 403,
        invariant: 'identical-denial',
        what: `${this.member} reads ${id}`,
        twin: () =>
          api.send(this.member, `/companies/${MISSING_ID}`, {
            key: api.nextKey(),
          }),
      });
      return NOTHING;
    }
    if (this.missing) {
      if (reply.status !== 404)
        throw new InvariantViolation(
          'model-agreement',
          `missing Company returned ${short(reply)}`,
        );
      return NOTHING;
    }
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `read failed: ${short(reply)}`,
      );
    const body = object(reply.body, 'the Company');
    if (body.displayName !== company?.displayName || body.status !== 'active')
      throw new InvariantViolation(
        'model-agreement',
        `read returned ${short(reply)}`,
      );
    return NOTHING;
  }
  toString() {
    return `read(${this.member} ${this.missing ? 'missing' : `#${this.index}`})`;
  }
}

class Replay extends Step {
  constructor(private readonly pick: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.committed.length > 0;
  }
  protected async act(model: Model, api: CompanyApi) {
    const committed = model.committed[this.pick % model.committed.length];
    if (!committed) return NOTHING;
    const reply = await api.send('owner', committed.path, {
      method: committed.method,
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
    return model.committed.length > 0;
  }
  protected async act(model: Model, api: CompanyApi) {
    const committed = model.committed[this.pick % model.committed.length];
    if (!committed) return NOTHING;
    const body = object(committed.body, 'body');
    const reply = await api.send('owner', committed.path, {
      method: 'POST',
      key: committed.key,
      body: { ...body, displayName: 'Fictional other Company name' },
    });
    const message =
      reply.body && typeof reply.body === 'object' && !Array.isArray(reply.body)
        ? Object.fromEntries(Object.entries(reply.body)).message
        : undefined;
    if (
      reply.status !== 400 ||
      message !== 'Idempotency-Key was already used for another command.'
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
  const actor = fc.constantFrom<Actor>('owner', ...MEMBERS);
  const member = fc.constantFrom(...MEMBERS);
  const weighted: Array<[number, fc.Arbitrary<FuzzCommand>]> = [
    [4, actor.map((who) => new RegisterCompany(who))],
    [
      3,
      fc
        .tuple(member, fc.nat({ max: 5 }))
        .map((args) => new GrantContext(...args)),
    ],
    [
      2,
      fc
        .tuple(member, fc.nat({ max: 5 }))
        .map((args) => new RevokeContext(...args)),
    ],
    [2, actor.map((who) => new ListCompanies(who))],
    [
      2,
      fc
        .tuple(actor, fc.nat({ max: 5 }), fc.boolean())
        .map((args) => new ReadCompany(...args)),
    ],
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
