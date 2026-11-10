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
  BUNDLES,
  bundlePath,
  checkStep,
  COMPANIES,
  denialInvariant,
  granted,
  grantKey,
  integer,
  InvariantViolation,
  MEMBERS,
  MISSING_ID,
  object,
  setGrant,
  text,
  type Bundle,
  type CompanyKey,
  type Committed,
  type ExpectedEvent,
  type MemberKey,
  type Model,
  type OfferApi,
  type OfferCase,
  type StepOutcome,
} from './world.js';

type FuzzCommand = fc.AsyncCommand<Model, OfferApi>;
const NOTHING: StepOutcome = { events: [] };
const RECEIVED_AT = '2026-11-10T12:00:00.000Z';

abstract class Step implements FuzzCommand {
  check(model: Readonly<Model>): boolean {
    return model.cases.length > 0;
  }
  async run(model: Model, api: OfferApi): Promise<void> {
    await checkStep(model, api, await this.act(model, api));
  }
  protected abstract act(model: Model, api: OfferApi): Promise<StepOutcome>;
  abstract toString(): string;
}

function event(
  action: string,
  company: CompanyKey,
  member: MemberKey,
): ExpectedEvent {
  return { action, company, member };
}
function readDenial(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
) {
  const preparer = model.grants.get(grantKey(member, company, 'preparer'));
  const approver = model.grants.get(grantKey(member, company, 'approver'));
  return preparer === 'revoked' || approver === 'revoked'
    ? 'revocation-denies'
    : 'command-authority';
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
function remember(model: Model, committed: Committed) {
  model.committed.push(committed);
}
function grow(item: OfferCase, reply: Reply, action: string) {
  const revision = integer(
    object(reply.body, 'result').offerRevision,
    'revision',
  );
  if (revision !== item.revision + 1)
    throw new InvariantViolation(
      'revisions-grow',
      `${action} returned revision ${revision}`,
    );
  item.revision = revision;
  item.events.push(action);
}

class CreateOffer extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
  ) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.cases.some(
      (item) => item.company === this.company && item.decision === 'none',
    );
  }
  protected async act(model: Model, api: OfferApi) {
    const item = model.cases.find(
      (candidate) =>
        candidate.company === this.company && candidate.decision === 'none',
    );
    if (!item) return NOTHING;
    const key = api.nextKey();
    const path = `/offers/opportunities/${item.opportunityId}`;
    const body = {
      pricingSnapshotId: item.snapshotId,
      recipient: { kind: 'PRIMARY' },
    };
    const reply = await api.send(this.member, path, {
      method: 'POST',
      company: this.company,
      key,
      body,
    });
    if (!granted(model, this.member, this.company, 'preparer')) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(
          model,
          this.member,
          this.company,
          'preparer',
        ),
        what: `${this.member} creates an Offer`,
      });
      return NOTHING;
    }
    if (reply.status !== 201)
      throw new InvariantViolation(
        'model-agreement',
        `create returned ${short(reply)}`,
      );
    const created = object(reply.body, 'offer');
    const version = object(created.version, 'version');
    item.offerId = text(created.id, 'offer id');
    item.versionId = text(version.id, 'version id');
    item.revision = integer(created.revision, 'revision');
    if (item.revision !== 1)
      throw new InvariantViolation(
        'revisions-grow',
        `first revision is ${item.revision}`,
      );
    item.decision = 'pending';
    item.events.push('offer.created', 'offer_version.created');
    remember(model, {
      member: this.member,
      company: this.company,
      bundle: 'preparer',
      key,
      path,
      body,
      receipt: reply.body,
      status: 201,
      kind: 'create',
    });
    return NOTHING;
  }
  toString() {
    return `create(${this.member} ${this.company})`;
  }
}

class Approve extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
  ) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.cases.some(
      (item) => item.company === this.company && item.decision === 'pending',
    );
  }
  protected async act(model: Model, api: OfferApi) {
    const item = model.cases.find(
      (candidate) =>
        candidate.company === this.company &&
        candidate.decision === 'pending' &&
        candidate.versionId,
    );
    if (!item?.versionId) return NOTHING;
    const key = api.nextKey();
    const path = `/offers/opportunities/${item.opportunityId}/versions/${item.versionId}/approve`;
    const body = {
      expectedOfferRevision: item.revision,
      acknowledgedWarningCodes: [],
    };
    const reply = await api.send(this.member, path, {
      method: 'POST',
      company: this.company,
      key,
      body,
    });
    if (!granted(model, this.member, this.company, 'approver')) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(
          model,
          this.member,
          this.company,
          'approver',
        ),
        what: `${this.member} approves`,
      });
      return NOTHING;
    }
    if (reply.status !== 201)
      throw new InvariantViolation(
        'step-order',
        `approve returned ${short(reply)}`,
      );
    grow(item, reply, 'offer_version.approved');
    item.decision = 'approved';
    remember(model, {
      member: this.member,
      company: this.company,
      bundle: 'approver',
      key,
      path,
      body,
      receipt: reply.body,
      status: 201,
      kind: 'approve',
    });
    return NOTHING;
  }
  toString() {
    return `approve(${this.member} ${this.company})`;
  }
}

class Transmit extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
  ) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.cases.some(
      (item) =>
        item.company === this.company && item.versionId && !item.transmitted,
    );
  }
  protected async act(model: Model, api: OfferApi) {
    const item = model.cases.find(
      (candidate) =>
        candidate.company === this.company &&
        candidate.versionId &&
        !candidate.transmitted,
    );
    if (!item?.versionId) return NOTHING;
    const key = api.nextKey();
    const path = `/offers/opportunities/${item.opportunityId}/versions/${item.versionId}/transmission`;
    const body = {
      expectedOfferRevision: item.revision,
      acknowledgedWarningCodes: [],
    };
    const reply = await api.send(this.member, path, {
      method: 'POST',
      company: this.company,
      key,
      body,
    });
    if (!granted(model, this.member, this.company, 'preparer')) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(
          model,
          this.member,
          this.company,
          'preparer',
        ),
        what: `${this.member} transmits`,
      });
      return NOTHING;
    }
    if (item.decision !== 'approved') {
      if (
        reply.status !== 409 ||
        codeOf(reply) !== 'OFFER_VERSION_NOT_APPROVED'
      )
        throw new InvariantViolation(
          'step-order',
          `early transmission returned ${short(reply)}`,
        );
      return NOTHING;
    }
    if (reply.status !== 201)
      throw new InvariantViolation(
        'step-order',
        `transmission returned ${short(reply)}`,
      );
    grow(item, reply, 'offer_version.transmission_recorded');
    item.transmitted = true;
    remember(model, {
      member: this.member,
      company: this.company,
      bundle: 'preparer',
      key,
      path,
      body,
      receipt: reply.body,
      status: 201,
      kind: 'transmit',
    });
    return NOTHING;
  }
  toString() {
    return `transmit(${this.member} ${this.company})`;
  }
}

class Respond extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
  ) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.cases.some(
      (item) =>
        item.company === this.company && item.versionId && !item.responded,
    );
  }
  protected async act(model: Model, api: OfferApi) {
    const item = model.cases.find(
      (candidate) =>
        candidate.company === this.company &&
        candidate.versionId &&
        !candidate.responded,
    );
    if (!item?.versionId) return NOTHING;
    const key = api.nextKey();
    const path = `/offers/opportunities/${item.opportunityId}/versions/${item.versionId}/client-response`;
    const body = {
      expectedOfferRevision: item.revision,
      outcome: 'ACCEPTED',
      receivedAt: RECEIVED_AT,
    };
    const reply = await api.send(this.member, path, {
      method: 'POST',
      company: this.company,
      key,
      body,
    });
    if (!granted(model, this.member, this.company, 'approver')) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(
          model,
          this.member,
          this.company,
          'approver',
        ),
        what: `${this.member} records a response`,
      });
      return NOTHING;
    }
    if (!item.transmitted) {
      if (
        reply.status !== 409 ||
        codeOf(reply) !== 'OFFER_VERSION_NOT_TRANSMITTED'
      )
        throw new InvariantViolation(
          'step-order',
          `early response returned ${short(reply)}`,
        );
      return NOTHING;
    }
    if (reply.status !== 201)
      throw new InvariantViolation(
        'step-order',
        `response returned ${short(reply)}`,
      );
    grow(item, reply, 'offer_version.client_response_recorded');
    item.responded = true;
    remember(model, {
      member: this.member,
      company: this.company,
      bundle: 'approver',
      key,
      path,
      body,
      receipt: reply.body,
      status: 201,
      kind: 'respond',
    });
    return NOTHING;
  }
  toString() {
    return `respond(${this.member} ${this.company})`;
  }
}

class StaleRevision extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
  ) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.cases.some(
      (item) => item.company === this.company && item.decision === 'pending',
    );
  }
  protected async act(model: Model, api: OfferApi) {
    const item = model.cases.find(
      (candidate) =>
        candidate.company === this.company &&
        candidate.decision === 'pending' &&
        candidate.versionId,
    );
    if (!item?.versionId) return NOTHING;
    const reply = await api.send(
      this.member,
      `/offers/opportunities/${item.opportunityId}/versions/${item.versionId}/approve`,
      {
        method: 'POST',
        company: this.company,
        key: api.nextKey(),
        body: {
          expectedOfferRevision: item.revision + 1,
          acknowledgedWarningCodes: [],
        },
      },
    );
    if (!granted(model, this.member, this.company, 'approver')) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(
          model,
          this.member,
          this.company,
          'approver',
        ),
        what: `${this.member} uses a stale revision`,
      });
      return NOTHING;
    }
    if (reply.status !== 409 || codeOf(reply) !== 'STALE_OFFER_REVISION')
      throw new InvariantViolation(
        'revisions-grow',
        `stale approval returned ${short(reply)}`,
      );
    return NOTHING;
  }
  toString() {
    return `stale(${this.member} ${this.company})`;
  }
}

class ReadOffer extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
  ) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.cases.some((item) => item.offerId);
  }
  protected async act(model: Model, api: OfferApi) {
    const item =
      model.cases.find(
        (candidate) => candidate.company === this.company && candidate.offerId,
      ) ?? model.cases.find((candidate) => candidate.offerId);
    if (!item?.offerId) return NOTHING;
    const company = model.context[this.member];
    const reply = await api.send(
      this.member,
      `/offers/opportunities/${item.opportunityId}`,
      { company },
    );
    const canRead =
      granted(model, this.member, company, 'preparer') ||
      granted(model, this.member, company, 'approver');
    const missing = () =>
      api.send(this.member, `/offers/opportunities/${MISSING_ID}`, {
        company,
        key: api.nextKey(),
      });
    if (!canRead) {
      await expectDenial({
        reply,
        status: 403,
        invariant: readDenial(model, this.member, company),
        what: `${this.member} reads ${item.offerId}`,
        twin: missing,
      });
      return NOTHING;
    }
    if (item.company !== company) {
      await expectDenial({
        reply,
        status: 404,
        invariant: 'identical-denial',
        what: `${this.member} reads ${item.offerId}`,
        twin: missing,
      });
      return NOTHING;
    }
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `read returned ${short(reply)}`,
      );
    const offer = object(object(reply.body, 'page').offer, 'offer');
    if (integer(offer.revision, 'revision') !== item.revision)
      throw new InvariantViolation(
        'revisions-grow',
        `read revision ${canonical(offer.revision)}`,
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
  protected async act(model: Model, api: OfferApi) {
    const committed = model.committed[this.pick % model.committed.length];
    if (!committed) return NOTHING;
    const reply = await api.send(committed.member, committed.path, {
      method: 'POST',
      company: committed.company,
      key: committed.key,
      body: committed.body,
    });
    if (
      !granted(model, committed.member, committed.company, committed.bundle)
    ) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(
          model,
          committed.member,
          committed.company,
          committed.bundle,
        ),
        what: 'replay',
      });
      return NOTHING;
    }
    if (reply.status !== committed.status)
      throw new InvariantViolation(
        'replay-receipt',
        `replay returned ${short(reply)}`,
      );
    if (committed.kind === 'create') {
      const again = object(reply.body, 'creation replay');
      const saved = object(committed.receipt, 'saved creation');
      const againVersion = text(
        object(again.version, 'replay version').id,
        'replay version id',
      );
      const savedVersion = text(
        object(saved.version, 'saved version').id,
        'saved version id',
      );
      if (again.id !== saved.id || againVersion !== savedVersion)
        throw new InvariantViolation(
          'replay-receipt',
          `creation replay returned ${short(reply)}`,
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
  protected async act(model: Model, api: OfferApi) {
    const committed = model.committed[this.pick % model.committed.length];
    if (!committed) return NOTHING;
    const body = object(committed.body, 'body');
    const changed =
      committed.kind === 'create'
        ? { ...body, scopeNote: 'Fictional other scope' }
        : committed.kind === 'respond'
          ? { ...body, outcome: 'REJECTED' }
          : { ...body, note: 'Fictional other note' };
    const reply = await api.send(committed.member, committed.path, {
      method: 'POST',
      company: committed.company,
      key: committed.key,
      body: changed,
    });
    if (
      !granted(model, committed.member, committed.company, committed.bundle)
    ) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(
          model,
          committed.member,
          committed.company,
          committed.bundle,
        ),
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
  protected async act(model: Model, api: OfferApi) {
    const reply = await api.send('owner', bundlePath(this.bundle), {
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
  protected async act(model: Model, api: OfferApi) {
    const reply = await api.send(
      'owner',
      `${bundlePath(this.bundle)}/${api.world.membershipIds[this.member]}/${api.world.companyIds[this.company]}`,
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
  const who = fc.tuple(member, company);
  const weighted: Array<[number, fc.Arbitrary<FuzzCommand>]> = [
    [3, who.map((args) => new CreateOffer(...args))],
    [3, who.map((args) => new Approve(...args))],
    [2, who.map((args) => new Transmit(...args))],
    [2, who.map((args) => new Respond(...args))],
    [1, who.map((args) => new StaleRevision(...args))],
    [1, who.map((args) => new ReadOffer(...args))],
    [2, fc.nat({ max: 5 }).map((index) => new Replay(index))],
    [1, fc.nat({ max: 5 }).map((index) => new ReuseKey(index))],
    [1, who.map((args) => new SwitchCompany(...args))],
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
