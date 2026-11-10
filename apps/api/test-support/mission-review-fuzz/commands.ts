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
  granted,
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
  type ReviewApi,
  type ReviewCase,
  type StepOutcome,
} from './world.js';

type FuzzCommand = fc.AsyncCommand<Model, ReviewApi>;
const NOTHING: StepOutcome = { events: [] };

abstract class Step implements FuzzCommand {
  check(model: Readonly<Model>): boolean {
    return model.cases.length >= 0;
  }
  async run(model: Model, api: ReviewApi): Promise<void> {
    await checkStep(model, api, await this.act(model, api));
  }
  protected abstract act(model: Model, api: ReviewApi): Promise<StepOutcome>;
  abstract toString(): string;
}

function reviewers(model: Readonly<Model>, company: CompanyKey) {
  return MEMBERS.filter((member) => granted(model, member, company));
}
function event(
  action: string,
  company: CompanyKey,
  member: MemberKey,
): ExpectedEvent {
  return { action, company, member };
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
function reviewBody(item: ReviewCase, revision = item.revision) {
  return {
    expectedReviewRevision: revision,
    outcome: 'ACCEPTED_BY_REVIEWER',
    basis: `Fictional review ${revision} of the intended result against the named record.`,
    items: [
      {
        taskId: item.taskId,
        expectedTaskVersion: item.done ? 2 : 1,
        expectedResultRevision: 0,
        evidence: {
          kind: 'EXTERNAL_REPORTED',
          reference: `Fictional register ${item.taskId}`,
        },
      },
    ],
  };
}

class CompleteTask extends Step {
  constructor(private readonly index: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.cases.some((item) => !item.done);
  }
  protected async act(model: Model, api: ReviewApi) {
    const ready = model.cases.filter((item) => !item.done);
    const item = ready[this.index % ready.length];
    if (!item) return NOTHING;
    const reply = await api.send('owner', `/tasks/${item.taskId}/complete`, {
      method: 'POST',
      company: item.company,
      key: api.nextKey(),
      body: { expectedVersion: 1 },
    });
    if (reply.status !== 201)
      throw new InvariantViolation(
        'review-state',
        `complete failed: ${short(reply)}`,
      );
    item.done = true;
    return NOTHING;
  }
  toString() {
    return `complete(#${this.index})`;
  }
}

class RecordReview extends Step {
  constructor(private readonly index: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.cases.some(
      (item) => reviewers(model, item.company).length > 0,
    );
  }
  protected async act(model: Model, api: ReviewApi) {
    const ready = model.cases.filter(
      (item) => reviewers(model, item.company).length > 0,
    );
    const item = ready[this.index % ready.length];
    if (!item) return NOTHING;
    const member = reviewers(model, item.company)[0];
    if (!member) return NOTHING;
    const key = api.nextKey();
    const path = `/projects/${item.projectId}/mission-result-reviews`;
    const body = reviewBody(item);
    const reply = await api.send(member, path, {
      method: 'POST',
      company: item.company,
      key,
      body,
    });
    if (!item.done) {
      if (
        reply.status !== 409 ||
        !messageOf(reply)?.includes('Task or result changed')
      )
        throw new InvariantViolation(
          'review-state',
          `early review returned ${short(reply)}`,
        );
      return NOTHING;
    }
    if (reply.status !== 201)
      throw new InvariantViolation(
        'review-state',
        `review returned ${short(reply)}`,
      );
    const receipt = object(reply.body, 'review receipt');
    if (
      text(receipt.action, 'action') !== 'recorded' ||
      receipt.reviewRevision !== item.revision + 1
    )
      throw new InvariantViolation(
        'revisions-grow',
        `review returned ${short(reply)}`,
      );
    item.revision += 1;
    model.committed.push({
      member,
      company: item.company,
      key,
      path,
      body,
      receipt: reply.body,
      status: 201,
    });
    return NOTHING;
  }
  toString() {
    return `review(#${this.index})`;
  }
}

class StaleReview extends Step {
  constructor(private readonly index: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.cases.some(
      (item) =>
        item.revision > 0 &&
        item.done &&
        reviewers(model, item.company).length > 0,
    );
  }
  protected async act(model: Model, api: ReviewApi) {
    const ready = model.cases.filter(
      (item) =>
        item.revision > 0 &&
        item.done &&
        reviewers(model, item.company).length > 0,
    );
    const item = ready[this.index % ready.length];
    if (!item) return NOTHING;
    const member = reviewers(model, item.company)[0];
    if (!member) return NOTHING;
    const reply = await api.send(
      member,
      `/projects/${item.projectId}/mission-result-reviews`,
      {
        method: 'POST',
        company: item.company,
        key: api.nextKey(),
        body: reviewBody(item, item.revision - 1),
      },
    );
    if (
      reply.status !== 409 ||
      !messageOf(reply)?.includes('review history changed')
    )
      throw new InvariantViolation(
        'revisions-grow',
        `stale review returned ${short(reply)}`,
      );
    return NOTHING;
  }
  toString() {
    return `stale(#${this.index})`;
  }
}

class ReadReview extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly index: number,
  ) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.cases.length > 0;
  }
  protected async act(model: Model, api: ReviewApi) {
    const item = model.cases[this.index % model.cases.length];
    if (!item) return NOTHING;
    const company = model.context[this.member];
    const reply = await api.send(
      this.member,
      `/projects/${item.projectId}/mission-result-reviews`,
      { company },
    );
    if (item.company !== company) {
      await expectDenial({
        reply,
        status: 404,
        invariant: 'identical-denial',
        what: `${this.member} reads ${item.projectId}`,
        twin: () =>
          api.send(
            this.member,
            `/projects/${MISSING_ID}/mission-result-reviews`,
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
    const revision = object(
      object(reply.body, 'page').review,
      'review',
    ).revision;
    if (revision !== item.revision)
      throw new InvariantViolation(
        'revisions-grow',
        `read revision ${canonical(revision)}`,
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
  protected async act(model: Model, api: ReviewApi) {
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
        invariant: 'revocation-denies',
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
  protected async act(model: Model, api: ReviewApi) {
    const committed = model.committed[this.pick % model.committed.length];
    if (!committed) return NOTHING;
    const body = object(committed.body, 'body');
    const reply = await api.send(committed.member, committed.path, {
      method: 'POST',
      company: committed.company,
      key: committed.key,
      body: { ...body, outcome: 'NEEDS_WORK' },
    });
    if (!granted(model, committed.member, committed.company)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: 'revocation-denies',
        what: 'key reuse',
      });
      return NOTHING;
    }
    if (
      reply.status !== 409 ||
      !messageOf(reply)?.includes('another review intent')
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

class GrantReviewer extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
  ) {
    super();
  }
  protected async act(model: Model, api: ReviewApi) {
    const reply = await api.send(
      'owner',
      '/company-mission-result-reviewer-assignments',
      {
        method: 'POST',
        key: randomUUID(),
        body: {
          companyId: api.world.companyIds[this.company],
          workspaceMembershipId: api.world.membershipIds[this.member],
        },
      },
    );
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
              'company_mission_result_reviewer_assignment.granted',
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

class RevokeReviewer extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
  ) {
    super();
  }
  protected async act(model: Model, api: ReviewApi) {
    const reply = await api.send(
      'owner',
      `/company-mission-result-reviewer-assignments/${api.world.membershipIds[this.member]}/${api.world.companyIds[this.company]}`,
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
              'company_mission_result_reviewer_assignment.revoked',
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
  const weighted: Array<[number, fc.Arbitrary<FuzzCommand>]> = [
    [2, fc.nat({ max: 3 }).map((index) => new CompleteTask(index))],
    [4, fc.nat({ max: 3 }).map((index) => new RecordReview(index))],
    [1, fc.nat({ max: 3 }).map((index) => new StaleReview(index))],
    [
      1,
      fc
        .tuple(member, fc.nat({ max: 3 }))
        .map((args) => new ReadReview(...args)),
    ],
    [2, fc.nat({ max: 4 }).map((index) => new Replay(index))],
    [1, fc.nat({ max: 4 }).map((index) => new ReuseKey(index))],
    [1, fc.tuple(member, company).map((args) => new SwitchCompany(...args))],
    [1, fc.tuple(member, company).map((args) => new GrantReviewer(...args))],
    [1, fc.tuple(member, company).map((args) => new RevokeReviewer(...args))],
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
