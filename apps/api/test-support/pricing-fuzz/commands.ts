import { randomUUID } from 'node:crypto';
import * as fc from 'fast-check';
import {
  canonical,
  expectDenial,
  short,
  type Reply,
} from '../model-fuzz/checks.js';
import {
  checkStep,
  COMPANIES,
  denialInvariant,
  effectiveFrom,
  granted,
  integer,
  InvariantViolation,
  MEMBERS,
  MISSING_ID,
  object,
  setGrant,
  text,
  type CompanyKey,
  type ExpectedEvent,
  type MemberKey,
  type Model,
  type PricingApi,
  type Scope,
  type StepOutcome,
} from './world.js';

type FuzzCommand = fc.AsyncCommand<Model, PricingApi>;
const NOTHING: StepOutcome = { events: [] };
const PATH = '/company-pricing-configuration-assignments';

abstract class Step implements FuzzCommand {
  check(model: Readonly<Model>): boolean {
    return model.scopes.length > 0;
  }
  async run(model: Model, api: PricingApi): Promise<void> {
    await checkStep(model, api, await this.act(model, api));
  }
  protected abstract act(model: Model, api: PricingApi): Promise<StepOutcome>;
  abstract toString(): string;
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
function scopeOf(model: Model, company: CompanyKey) {
  return model.scopes.find((scope) => scope.company === company);
}
function adopt(scope: Scope, reply: Reply, kind: 'rule' | 'tariff') {
  if (reply.status !== 201)
    throw new InvariantViolation(
      'versions-grow',
      `${kind} returned ${short(reply)}`,
    );
  const body = object(reply.body, kind);
  if (body.outcome !== 'PUBLISHED')
    throw new InvariantViolation(
      'versions-grow',
      `${kind} outcome ${canonical(body.outcome)}`,
    );
  const version = object(body.version, 'version');
  const number = integer(version.versionNumber, 'version number');
  const id = text(version.id, 'version id');
  const head = kind === 'rule' ? scope.ruleHead : scope.tariffHead;
  if (number !== head + 1)
    throw new InvariantViolation('versions-grow', `${kind} number ${number}`);
  if (kind === 'rule') {
    scope.ruleHead = number;
    scope.ruleIds.push(id);
    scope.events.push('pricing_rule_version.published');
  } else {
    scope.tariffHead = number;
    scope.tariffIds.push(id);
    scope.events.push('tariff_version.published');
  }
  return { outcome: 'PUBLISHED', versionId: id, versionNumber: number };
}

class PublishRule extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
  ) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    const scope = model.scopes.find((item) => item.company === this.company);
    return Boolean(scope && scope.ruleHead < 3);
  }
  protected async act(model: Model, api: PricingApi) {
    const scope = scopeOf(model, this.company);
    if (!scope || scope.ruleHead >= 3) return NOTHING;
    const key = api.nextKey();
    const path = '/pricing-configuration/rule-versions';
    const body = {
      label: `Fictional rule ${this.company} ${scope.ruleHead + 1}`,
      effectiveFrom: effectiveFrom(scope.ruleHead),
      expectedActiveVersionNumber: scope.ruleHead === 0 ? null : scope.ruleHead,
    };
    const reply = await api.send(this.member, path, {
      method: 'POST',
      company: this.company,
      key,
      body,
    });
    if (!granted(model, this.member, this.company)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(model, this.member, this.company),
        what: `${this.member} publishes a rule`,
      });
      return NOTHING;
    }
    const recorded = adopt(scope, reply, 'rule');
    model.committed.push({
      member: this.member,
      company: this.company,
      key,
      path,
      body,
      status: 201,
      ...recorded,
    });
    return NOTHING;
  }
  toString() {
    return `rule(${this.member} ${this.company})`;
  }
}

class PublishTariff extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
  ) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    const scope = model.scopes.find((item) => item.company === this.company);
    return Boolean(scope && scope.tariffHead < 3);
  }
  protected async act(model: Model, api: PricingApi) {
    const scope = scopeOf(model, this.company);
    if (!scope || scope.tariffHead >= 3) return NOTHING;
    const key = api.nextKey();
    const path = `/pricing-configuration/offerings/${scope.offeringId}/tariff-versions`;
    const next = scope.tariffHead + 1;
    const body = {
      unit: 'fictional-unit',
      unitAmount: `${100 + next}.0000`,
      currency: 'EUR',
      taxRatePercent: '15.00',
      taxLabel: 'Fictional tax',
      effectiveFrom: effectiveFrom(scope.tariffHead),
      expectedActiveVersionNumber:
        scope.tariffHead === 0 ? null : scope.tariffHead,
    };
    const reply = await api.send(this.member, path, {
      method: 'POST',
      company: this.company,
      key,
      body,
    });
    if (!granted(model, this.member, this.company)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(model, this.member, this.company),
        what: `${this.member} publishes a tariff`,
      });
      return NOTHING;
    }
    const recorded = adopt(scope, reply, 'tariff');
    model.committed.push({
      member: this.member,
      company: this.company,
      key,
      path,
      body,
      status: 201,
      ...recorded,
    });
    return NOTHING;
  }
  toString() {
    return `tariff(${this.member} ${this.company})`;
  }
}

class StaleHead extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
    private readonly kind: 'rule' | 'tariff',
  ) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    const scope = model.scopes.find((item) => item.company === this.company);
    return Boolean(
      scope && (this.kind === 'rule' ? scope.ruleHead : scope.tariffHead) > 0,
    );
  }
  protected async act(model: Model, api: PricingApi) {
    const scope = scopeOf(model, this.company);
    if (!scope) return NOTHING;
    const head = this.kind === 'rule' ? scope.ruleHead : scope.tariffHead;
    if (head === 0) return NOTHING;
    const expected = head > 1 ? head + 1 : null;
    const path =
      this.kind === 'rule'
        ? '/pricing-configuration/rule-versions'
        : `/pricing-configuration/offerings/${scope.offeringId}/tariff-versions`;
    const body =
      this.kind === 'rule'
        ? {
            label: 'Fictional stale rule',
            effectiveFrom: effectiveFrom(head),
            expectedActiveVersionNumber: expected,
          }
        : {
            unit: 'fictional-unit',
            unitAmount: '9.0000',
            currency: 'EUR',
            taxRatePercent: '15.00',
            taxLabel: 'Fictional tax',
            effectiveFrom: effectiveFrom(head),
            expectedActiveVersionNumber: expected,
          };
    const reply = await api.send(this.member, path, {
      method: 'POST',
      company: this.company,
      key: api.nextKey(),
      body,
    });
    if (!granted(model, this.member, this.company)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(model, this.member, this.company),
        what: `${this.member} uses a stale head`,
      });
      return NOTHING;
    }
    if (reply.status !== 409 || codeOf(reply) !== 'STALE_ACTIVE_VERSION')
      throw new InvariantViolation(
        'versions-grow',
        `stale ${this.kind} returned ${short(reply)}`,
      );
    return NOTHING;
  }
  toString() {
    return `stale-${this.kind}(${this.member} ${this.company})`;
  }
}

class ReadRule extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
  ) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.scopes.some((scope) => scope.ruleIds.length > 0);
  }
  protected async act(model: Model, api: PricingApi) {
    const scope =
      model.scopes.find(
        (item) => item.company === this.company && item.ruleIds.length > 0,
      ) ?? model.scopes.find((item) => item.ruleIds.length > 0);
    const versionId = scope?.ruleIds[0];
    if (!scope || !versionId) return NOTHING;
    const company = model.context[this.member];
    const reply = await api.send(
      this.member,
      `/pricing-configuration/rule-versions/${versionId}`,
      { company },
    );
    const missing = () =>
      api.send(
        this.member,
        `/pricing-configuration/rule-versions/${MISSING_ID}`,
        { company, key: api.nextKey() },
      );
    if (!granted(model, this.member, company)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(model, this.member, company),
        what: `${this.member} reads a rule`,
        twin: missing,
      });
      return NOTHING;
    }
    if (scope.company !== company) {
      await expectDenial({
        reply,
        status: 404,
        invariant: 'identical-denial',
        what: `${this.member} reads ${versionId}`,
        twin: missing,
      });
      return NOTHING;
    }
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `read returned ${short(reply)}`,
      );
    return NOTHING;
  }
  toString() {
    return `read(${this.member} ${this.company})`;
  }
}

class Replay extends Step {
  constructor(private readonly pick: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.committed.length > 0;
  }
  protected async act(model: Model, api: PricingApi) {
    const committed = model.committed[this.pick % model.committed.length];
    if (!committed) return NOTHING;
    const reply = await api.send(committed.member, committed.path, {
      method: 'POST',
      company: committed.company,
      key: committed.key,
      body: committed.body,
    });
    if (!granted(model, committed.member, committed.company)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(model, committed.member, committed.company),
        what: 'replay',
      });
      return NOTHING;
    }
    if (reply.status !== committed.status)
      throw new InvariantViolation(
        'replay-receipt',
        `replay returned ${short(reply)}`,
      );
    const body = object(reply.body, 'replay');
    const version = object(body.version, 'version');
    if (
      body.outcome !== committed.outcome ||
      version.id !== committed.versionId ||
      integer(version.versionNumber, 'number') !== committed.versionNumber
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
  protected async act(model: Model, api: PricingApi) {
    const committed = model.committed[this.pick % model.committed.length];
    if (!committed) return NOTHING;
    const body = object(committed.body, 'body');
    const changed =
      'label' in body
        ? { ...body, label: 'Fictional other rule' }
        : { ...body, unitAmount: '7.0000' };
    const reply = await api.send(committed.member, committed.path, {
      method: 'POST',
      company: committed.company,
      key: committed.key,
      body: changed,
    });
    if (!granted(model, committed.member, committed.company)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(model, committed.member, committed.company),
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

class GrantConfiguration extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
  ) {
    super();
  }
  protected async act(model: Model, api: PricingApi) {
    const reply = await api.send('owner', PATH, {
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
    const changed = !granted(model, this.member, this.company);
    setGrant(model, this.member, this.company, 'active');
    return {
      events: changed
        ? [
            event(
              'company_pricing_configuration_assignment.granted',
              this.company,
              this.member,
            ),
          ]
        : [],
    };
  }
  toString() {
    return `grant(${this.member} ${this.company})`;
  }
}

class RevokeConfiguration extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
  ) {
    super();
  }
  protected async act(model: Model, api: PricingApi) {
    const reply = await api.send(
      'owner',
      `${PATH}/${api.world.membershipIds[this.member]}/${api.world.companyIds[this.company]}`,
      { method: 'DELETE', key: randomUUID() },
    );
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `revoke failed: ${short(reply)}`,
      );
    const changed = granted(model, this.member, this.company);
    if (changed) setGrant(model, this.member, this.company, 'revoked');
    return {
      events: changed
        ? [
            event(
              'company_pricing_configuration_assignment.revoked',
              this.company,
              this.member,
            ),
          ]
        : [],
    };
  }
  toString() {
    return `revoke(${this.member} ${this.company})`;
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
  const who = fc.tuple(member, company);
  const weighted: Array<[number, fc.Arbitrary<FuzzCommand>]> = [
    [4, who.map((args) => new PublishRule(...args))],
    [4, who.map((args) => new PublishTariff(...args))],
    [1, who.map((args) => new StaleHead(...args, 'rule'))],
    [1, who.map((args) => new StaleHead(...args, 'tariff'))],
    [1, who.map((args) => new ReadRule(...args))],
    [2, fc.nat({ max: 5 }).map((index) => new Replay(index))],
    [1, fc.nat({ max: 5 }).map((index) => new ReuseKey(index))],
    [1, who.map((args) => new SwitchCompany(...args))],
    [1, who.map((args) => new GrantConfiguration(...args))],
    [1, who.map((args) => new RevokeConfiguration(...args))],
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
