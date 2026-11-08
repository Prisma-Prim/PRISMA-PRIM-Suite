import { randomUUID } from 'node:crypto';
import * as fc from 'fast-check';
import type { PaymentValues } from '../../src/payment/payment.input.js';
import {
  canonical,
  expectDenial,
  short,
  type Reply,
} from '../model-fuzz/checks.js';
import {
  assignmentAction,
  authorsOf,
  BUNDLES,
  bundleAssignments,
  canRead,
  checkStep,
  COMPANIES,
  denialInvariant,
  expectFacts,
  expectInventory,
  expectSummary,
  granted,
  integer,
  InvariantViolation,
  list,
  MEMBERS,
  MISSING_ID,
  NOTES,
  object,
  observeRevision,
  readHistory,
  readInventory,
  REASONS,
  setGrant,
  terminal,
  text,
  VALUES,
  type Action,
  type Bundle,
  type Command,
  type Committed,
  type CompanyKey,
  type Invariant,
  type MemberKey,
  type Model,
  type PaymentApi,
  type PaymentModel,
  type PaymentState,
  type Snapshot,
  type SourceModel,
  type StepOutcome,
} from './world.js';

type FuzzCommand = fc.AsyncCommand<Model, PaymentApi>;

const NOTHING: StepOutcome = { touched: [], events: [] };

/** What a step needs to exist before it can run. */
type Requirement = 'nothing' | 'payment' | 'committed';

/** Every step acts, then the world checks every invariant. */
abstract class Step implements FuzzCommand {
  protected readonly requires: Requirement = 'nothing';
  check(model: Readonly<Model>): boolean {
    switch (this.requires) {
      case 'nothing':
        return true;
      case 'payment':
        return model.payments.length > 0;
      case 'committed':
        return model.committed.length > 0;
    }
  }
  async run(model: Model, api: PaymentApi): Promise<void> {
    await checkStep(model, api, await this.act(model, api));
  }
  protected abstract act(model: Model, api: PaymentApi): Promise<StepOutcome>;
  abstract toString(): string;
}

function otherCompany(company: CompanyKey): CompanyKey {
  return company === 'A' ? 'B' : 'A';
}

function noValues(): never {
  throw new Error('The fuzz world defines too few values.');
}

function valuesAt(index: number): PaymentValues {
  return VALUES[index % VALUES.length] ?? noValues();
}

/** Literal values other than `current`, for a material change (§7). */
function otherValues(current: unknown): PaymentValues {
  return (
    VALUES.find((values) => canonical(values) !== canonical(current)) ??
    noValues()
  );
}

/**
 * Which Payment or source a step aims at: `index` modulo those of the
 * member's current Company, or of the other Company when `foreign`; a
 * Payment step falls back to every Payment when that Company has none.
 */
interface Target {
  index: number;
  foreign: boolean;
}

/** A Payment target that prefers one the change may succeed on when `fit`. */
interface PaymentTarget extends Target {
  fit: boolean;
}

function aim(target: Target | PaymentTarget, noun: string) {
  return `${target.foreign ? 'foreign ' : ''}${'fit' in target && target.fit ? 'fit ' : ''}${noun}#${target.index}`;
}

function pickPayment(
  model: Readonly<Model>,
  member: MemberKey,
  target: PaymentTarget,
  fits: (payment: PaymentModel) => boolean = () => true,
): PaymentModel {
  const own = model.context[member];
  const scoped = model.payments.filter(
    (payment) => (payment.company === own) !== target.foreign,
  );
  const fitting = scoped.filter(fits);
  const pool =
    target.fit && fitting.length > 0
      ? fitting
      : scoped.length > 0
        ? scoped
        : model.payments;
  const payment = pool[target.index % pool.length];
  if (!payment) throw new Error('The fuzz precondition admitted no Payment.');
  return payment;
}

function pickSource(
  api: PaymentApi,
  company: CompanyKey,
  target: Target,
): SourceModel {
  const pool =
    api.world.sources[target.foreign ? otherCompany(company) : company];
  const source = pool[target.index % pool.length];
  if (!source) throw new Error('The fuzz world prepared no source.');
  return source;
}

/**
 * Who sends a command: a named member, or the `able`-th member whose
 * current Company grants the command's bundle (and Evidence Access when the
 * command consumes its source), so that commands often succeed.
 */
type Who = MemberKey | { able: number };

function describeWho(who: Who) {
  return typeof who === 'string' ? who : `able#${who.able}`;
}

function resolveWho(model: Readonly<Model>, who: Who, action: Action) {
  if (typeof who === 'string') return who;
  const bundle = actionBundle(action);
  const able = MEMBERS.filter((member) => {
    const company = model.context[member];
    return (
      granted(model, member, company, bundle) &&
      (!consumesSource(action) || granted(model, member, company, 'evidence'))
    );
  });
  const pool = able.length > 0 ? able : MEMBERS;
  const member = pool[who.able % pool.length];
  if (!member) throw new Error('The fuzz world defines no member.');
  return member;
}

/** Whether the command needs the Evidence Access family gate (§6). */
function consumesSource(action: Action) {
  return (
    action === 'CREATE' || action === 'CORRECT_DRAFT' || action === 'CONFIRM'
  );
}

/** The predecessor a CREATE names (§7, §8). */
type PredecessorChoice =
  | { kind: 'none' }
  | { kind: 'terminal' }
  | { kind: 'pick'; index: number; foreign: boolean };

function describePredecessor(choice: PredecessorChoice) {
  switch (choice.kind) {
    case 'none':
    case 'terminal':
      return choice.kind;
    case 'pick':
      return aim(choice, 'payment');
  }
}

function resolvePredecessor(
  model: Readonly<Model>,
  company: CompanyKey,
  choice: PredecessorChoice,
): PaymentModel | null {
  switch (choice.kind) {
    case 'none':
      return null;
    case 'terminal':
      // The latest terminal Payment, replaced or not.
      return (
        model.payments
          .filter(
            (payment) =>
              payment.company === company && terminal(payment.snapshot.state),
          )
          .at(-1) ?? null
      );
    case 'pick': {
      const pool = model.payments.filter(
        (payment) => (payment.company === company) !== choice.foreign,
      );
      return pool[choice.index % pool.length] ?? null;
    }
  }
}

function pathOf(command: Command) {
  return command.action === 'CREATE'
    ? '/payments'
    : `/payments/${command.payment.id}/commands`;
}

function bodyOf(command: Command): Record<string, unknown> {
  switch (command.action) {
    case 'CREATE':
      return {
        source: command.source.tuple,
        values: command.values,
        acknowledgeObservedDeclaration: true,
        replacesClosedPaymentId: command.replaces?.id ?? null,
      };
    case 'CORRECT_DRAFT':
      return {
        action: command.action,
        expectedRevision: command.expectedRevision,
        values: command.values,
        reason: command.reason,
      };
    case 'WITHDRAW_DRAFT':
    case 'REVERSE':
      return {
        action: command.action,
        expectedRevision: command.expectedRevision,
        reason: command.reason,
      };
    case 'CONFIRM':
      return {
        action: command.action,
        expectedRevision: command.expectedRevision,
        acknowledgeReviewedObservation: true,
        confirmationNote: command.note,
      };
  }
}

function describeCommand(command: Command) {
  return command.action === 'CREATE'
    ? `CREATE from ${command.source.name}${command.replaces ? ` replacing ${command.replaces.id}` : ''}`
    : `${command.action} on Payment ${command.payment.id} of Company ${command.payment.company} at revision ${command.expectedRevision}`;
}

/** The one bundle each command needs (§6). */
function actionBundle(action: Action): Bundle {
  switch (action) {
    case 'CREATE':
    case 'CORRECT_DRAFT':
    case 'WITHDRAW_DRAFT':
      return 'recorder';
    case 'CONFIRM':
      return 'confirmer';
    case 'REVERSE':
      return 'reverser';
  }
}

/** The public 409 codes of §8-§9 refusals. */
type ConflictCode =
  | 'IDEMPOTENCY_CONFLICT'
  | 'STALE_PAYMENT'
  | 'PAYMENT_NO_CHANGE'
  | 'PAYMENT_PREDECESSOR_CONFLICT'
  | 'PAYMENT_SOURCE_INELIGIBLE';
const AUTHOR_REFUSAL = 'PAYMENT_AUTHOR_CANNOT_CONFIRM';

type Prediction =
  /**
   * A 403. `blind` when it precedes the target lookup, so that a missing
   * target gets the identical answer; the family gate of CORRECT_DRAFT and
   * CONFIRM follows the lookup of a Payment its actor may read.
   */
  | { kind: 'denied'; invariant: Invariant; blind: boolean }
  /** A 404, identical to the one a missing Payment or predecessor gets. */
  | { kind: 'hidden'; twin: 'target' | 'predecessor' }
  /** A 409; an ineligible source answers like a missing one. */
  | {
      kind: 'conflict';
      invariant: Invariant;
      code: ConflictCode;
      twin: 'source' | null;
    }
  /** The independent-author refusal of CONFIRM, a 403 (§8). */
  | { kind: 'author' }
  | { kind: 'replay'; committed: Committed }
  | { kind: 'commit' };

/**
 * The §6 authority checks, in the service's order: the command's own
 * bundle, then the target (a foreign Payment is not found), with the
 * Evidence Access family gate before the source of CREATE and after the
 * target of CORRECT_DRAFT and CONFIRM. WITHDRAW_DRAFT and REVERSE consume no
 * source authority. A command that passes them reaches its key, then its
 * lifecycle checks.
 */
function authority(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
  command: Command,
): Prediction | undefined {
  const bundle = actionBundle(command.action);
  if (!granted(model, member, company, bundle))
    return {
      kind: 'denied',
      invariant: denialInvariant(model, member, company, [bundle]),
      blind: true,
    };
  const family = (blind: boolean): Prediction | undefined =>
    granted(model, member, company, 'evidence')
      ? undefined
      : {
          kind: 'denied',
          invariant: denialInvariant(model, member, company, ['evidence']),
          blind,
        };
  switch (command.action) {
    case 'CREATE': {
      const denied = family(true);
      if (denied) return denied;
      const { source } = command;
      if (source.company === company && source.state !== 'draft')
        return undefined;
      return {
        kind: 'conflict',
        invariant:
          source.company === company ? 'model-agreement' : 'company-isolation',
        code: 'PAYMENT_SOURCE_INELIGIBLE',
        twin: 'source',
      };
    }
    case 'CORRECT_DRAFT':
    case 'CONFIRM':
      return command.payment.company === company
        ? family(false)
        : { kind: 'hidden', twin: 'target' };
    case 'WITHDRAW_DRAFT':
    case 'REVERSE':
      return command.payment.company === company
        ? undefined
        : { kind: 'hidden', twin: 'target' };
  }
}

/** The state a change starts from (§8). */
function admits(action: Action): (state: PaymentState) => boolean {
  return action === 'REVERSE'
    ? (state) => state === 'CONFIRMED'
    : (state) => state === 'DRAFT';
}

/** The §8 lifecycle outcome of a fresh key, in the service's order. */
function lifecycle(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
  command: Command,
): Prediction {
  if (command.action === 'CREATE') {
    const { replaces } = command;
    if (replaces === null) return { kind: 'commit' };
    if (replaces.company !== company)
      return { kind: 'hidden', twin: 'predecessor' };
    if (!terminal(replaces.snapshot.state) || replaces.replacement !== null)
      return {
        kind: 'conflict',
        invariant: 'replacement-chain',
        code: 'PAYMENT_PREDECESSOR_CONFLICT',
        twin: null,
      };
    return { kind: 'commit' };
  }
  const { payment } = command;
  if (!admits(command.action)(payment.snapshot.state))
    return {
      kind: 'conflict',
      invariant: 'state-machine',
      code: 'STALE_PAYMENT',
      twin: null,
    };
  if (command.expectedRevision !== payment.revision)
    return {
      kind: 'conflict',
      invariant: 'stale-or-no-op-refused',
      code: 'STALE_PAYMENT',
      twin: null,
    };
  if (
    command.action === 'CORRECT_DRAFT' &&
    canonical(command.values) === canonical(payment.snapshot.values)
  )
    return {
      kind: 'conflict',
      invariant: 'stale-or-no-op-refused',
      code: 'PAYMENT_NO_CHANGE',
      twin: null,
    };
  if (command.action === 'CONFIRM' && authorsOf(payment).has(member))
    return { kind: 'author' };
  return { kind: 'commit' };
}

interface Request {
  member: MemberKey;
  company: CompanyKey;
  command: Command;
  path: string;
  body: Record<string, unknown>;
  key: string;
  prediction: Prediction;
}

/** A fresh command: a new key, or a key a refused command left free. */
function freshRequest(input: {
  model: Model;
  api: PaymentApi;
  member: MemberKey;
  command: Command;
  keyPick: number | null;
}): Request {
  const { model, api, member, command } = input;
  const company = model.context[member];
  const free = model.refused.filter((entry) => entry.member === member);
  const reused =
    input.keyPick === null ? undefined : free[input.keyPick % free.length];
  return {
    member,
    company,
    command,
    path: pathOf(command),
    body: bodyOf(command),
    key: reused?.key ?? api.nextKey(),
    prediction:
      authority(model, member, company, command) ??
      lifecycle(model, member, company, command),
  };
}

function send(api: PaymentApi, request: Request) {
  return api.send(request.member, request.path, {
    method: 'POST',
    body: request.body,
    company: request.company,
    key: request.key,
  });
}

/**
 * A refused command reserves no key (§9): a later command of the same
 * member may use it. A committed key stays reserved.
 */
function release(model: Model, request: Request) {
  const same = (entry: { member: MemberKey; key: string }) =>
    entry.member === request.member && entry.key === request.key;
  if (!model.committed.some(same) && !model.refused.some(same))
    model.refused.push({ member: request.member, key: request.key });
}

/** A refusal's public code, when its body carries one. */
function codeOf(reply: Reply): unknown {
  const { body } = reply;
  return typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    'code' in body
    ? body.code
    : undefined;
}

interface Receipt {
  commandId: string;
  paymentId: string;
  revision: number;
  recordedAt: string;
}

/** The closed §9 receipt of a committed command. */
function readReceipt(reply: Reply, action: Action, what: string): Receipt {
  const body = object(reply.body, `the receipt of ${what}`);
  if (
    canonical(Object.keys(body).sort()) !==
      canonical([
        'action',
        'commandId',
        'format',
        'paymentId',
        'recordedAt',
        'revision',
      ]) ||
    body.format !== 'PAYMENT_COMMAND/1' ||
    body.action !== action
  )
    throw new InvariantViolation(
      'model-agreement',
      `${what}: the receipt is not closed: ${short(reply)}`,
    );
  return {
    commandId: text(body.commandId, `the command id of ${what}`),
    paymentId: text(body.paymentId, `the Payment id of ${what}`),
    revision: integer(body.revision, `the revision of ${what}`),
    recordedAt: text(body.recordedAt, `the instant of ${what}`),
  };
}

/** The §8 successor of a committed change's snapshot. */
function nextSnapshot(input: {
  snapshot: Snapshot;
  command: Exclude<Command, { action: 'CREATE' }>;
  member: MemberKey;
  recordedAt: string;
}): Snapshot {
  const { snapshot, command } = input;
  switch (command.action) {
    case 'CORRECT_DRAFT':
      return { state: 'DRAFT', values: command.values, confirmation: null };
    case 'WITHDRAW_DRAFT':
      return {
        state: 'WITHDRAWN',
        values: snapshot.values,
        confirmation: null,
      };
    case 'CONFIRM':
      return {
        state: 'CONFIRMED',
        values: snapshot.values,
        confirmation: {
          member: input.member,
          recordedAt: input.recordedAt,
          note: command.note,
        },
      };
    case 'REVERSE':
      if (snapshot.state !== 'CONFIRMED')
        throw new Error('The model reversed an unconfirmed Payment.');
      return {
        state: 'REVERSED',
        values: snapshot.values,
        confirmation: snapshot.confirmation,
      };
  }
}

function reasonOf(command: Command): string | null {
  switch (command.action) {
    case 'CREATE':
    case 'CONFIRM':
      return null;
    case 'CORRECT_DRAFT':
    case 'WITHDRAW_DRAFT':
    case 'REVERSE':
      return command.reason;
  }
}

/** Applies a committed command to the model, from its receipt. */
function commit(input: {
  model: Model;
  request: Request;
  reply: Reply;
  what: string;
}): PaymentModel[] {
  const { model, request, reply, what } = input;
  const { command } = request;
  const receipt = readReceipt(reply, command.action, what);
  const touched: PaymentModel[] = [];
  let payment: PaymentModel;
  let before: Snapshot | null = null;
  if (command.action === 'CREATE') {
    if (model.payments.some((known) => known.id === receipt.paymentId))
      throw new InvariantViolation(
        'history-once',
        `${what}: the receipt names the existing Payment ${receipt.paymentId}`,
      );
    payment = {
      id: receipt.paymentId,
      company: request.company,
      source: command.source,
      revision: 1,
      snapshot: { state: 'DRAFT', values: command.values, confirmation: null },
      replaces: command.replaces?.id ?? null,
      replacement: null,
      createdAt: receipt.recordedAt,
      facts: [],
    };
    model.payments.push(payment);
    if (command.replaces) {
      command.replaces.replacement = payment.id;
      touched.push(command.replaces);
    }
  } else {
    payment = command.payment;
    if (receipt.paymentId !== payment.id)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: the receipt names Payment ${receipt.paymentId}`,
      );
    before = payment.snapshot;
    payment.revision += 1;
    payment.snapshot = nextSnapshot({
      snapshot: before,
      command,
      member: request.member,
      recordedAt: receipt.recordedAt,
    });
  }
  if (receipt.revision !== payment.revision)
    throw new InvariantViolation(
      'history-once',
      `${what}: the receipt reports revision ${receipt.revision}; expected ${payment.revision}`,
    );
  observeRevision(
    model,
    payment.id,
    receipt.revision,
    `the receipt of ${what}`,
  );
  payment.facts.push({
    action: command.action,
    member: request.member,
    key: request.key,
    before,
    after: payment.snapshot,
    reason: reasonOf(command),
    commandId: receipt.commandId,
    recordedAt: receipt.recordedAt,
  });
  model.committed.push({
    member: request.member,
    company: request.company,
    command,
    path: request.path,
    body: request.body,
    key: request.key,
    paymentId: payment.id,
    receipt: canonical(reply.body),
  });
  model.refused = model.refused.filter(
    (entry) => entry.member !== request.member || entry.key !== request.key,
  );
  return [payment, ...touched];
}

/** Checks one command reply against its predicted outcome. */
async function settle(input: {
  model: Model;
  api: PaymentApi;
  request: Request;
  reply: Reply;
  prediction: Prediction;
}): Promise<PaymentModel[]> {
  const { model, api, request, reply, prediction } = input;
  const { command } = request;
  const what = `${request.member} sending ${describeCommand(command)} from Company ${request.company}`;
  // The same command aimed at a missing target: a missing Payment, a
  // missing source Document or a missing predecessor.
  const twin =
    (body: Record<string, unknown>, path = request.path) =>
    () =>
      api.send(request.member, path, {
        method: 'POST',
        body,
        company: request.company,
        key: api.nextKey(),
      });
  const missingTarget =
    command.action === 'CREATE'
      ? twin({
          ...request.body,
          source: { ...command.source.tuple, documentId: MISSING_ID },
        })
      : twin(request.body, `/payments/${MISSING_ID}/commands`);
  const touched =
    command.action === 'CREATE'
      ? command.replaces
        ? [command.replaces]
        : []
      : [command.payment];
  // Past the denials, the actor holds every bundle the command needs: a
  // plain 403 then refuses a granted bundle (§6).
  const refusedBundle =
    reply.status === 403 && codeOf(reply) !== AUTHOR_REFUSAL;
  switch (prediction.kind) {
    case 'denied':
      await expectDenial({
        reply,
        status: 403,
        invariant: prediction.invariant,
        what,
        twin: prediction.blind ? missingTarget : undefined,
      });
      if (codeOf(reply) === AUTHOR_REFUSAL)
        throw new InvariantViolation(
          prediction.invariant,
          `${what}: the authorship of a command its actor may not send was checked: ${short(reply)}`,
        );
      release(model, request);
      return touched;
    case 'hidden':
      await expectDenial({
        reply,
        status: 404,
        invariant: refusedBundle
          ? 'bundle-matrix'
          : prediction.twin === 'target'
            ? 'company-isolation'
            : 'replacement-chain',
        what,
        twin:
          prediction.twin === 'target'
            ? missingTarget
            : twin({ ...request.body, replacesClosedPaymentId: MISSING_ID }),
      });
      release(model, request);
      return touched;
    case 'conflict':
      await expectDenial({
        reply,
        status: 409,
        invariant:
          reply.status === 201
            ? prediction.invariant
            : refusedBundle
              ? 'bundle-matrix'
              : 'model-agreement',
        what,
        twin: prediction.twin === 'source' ? missingTarget : undefined,
      });
      if (codeOf(reply) !== prediction.code)
        throw new InvariantViolation(
          prediction.invariant,
          `${what}: expected the refusal ${prediction.code}, got ${short(reply)}`,
        );
      release(model, request);
      return touched;
    case 'author':
      if (reply.status !== 403 || codeOf(reply) !== AUTHOR_REFUSAL)
        throw new InvariantViolation(
          refusedBundle ? 'bundle-matrix' : 'independent-author',
          `${what}: a draft author of this Payment expected ${AUTHOR_REFUSAL}, got ${short(reply)}`,
        );
      release(model, request);
      return touched;
    case 'replay':
      if (
        reply.status !== 201 ||
        canonical(reply.body) !== prediction.committed.receipt
      )
        throw new InvariantViolation(
          refusedBundle ? 'bundle-matrix' : 'replay-receipt',
          `${what}: expected the saved receipt ${prediction.committed.receipt}, got ${short(reply)}`,
        );
      return touched;
    case 'commit':
      if (reply.status !== 201)
        throw new InvariantViolation(
          refusedBundle
            ? 'bundle-matrix'
            : codeOf(reply) === AUTHOR_REFUSAL
              ? 'independent-author'
              : 'model-agreement',
          `${what}: expected 201, got ${short(reply)}`,
        );
      return commit({ model, request, reply, what });
  }
}

class CreatePayment extends Step {
  constructor(
    private readonly who: Who,
    private readonly target: Target,
    private readonly predecessor: PredecessorChoice,
    private readonly values: number,
    private readonly keyPick: number | null,
  ) {
    super();
  }
  protected async act(model: Model, api: PaymentApi) {
    const member = resolveWho(model, this.who, 'CREATE');
    const company = model.context[member];
    const request = freshRequest({
      model,
      api,
      member,
      keyPick: this.keyPick,
      command: {
        action: 'CREATE',
        source: pickSource(api, company, this.target),
        values: valuesAt(this.values),
        replaces: resolvePredecessor(model, company, this.predecessor),
      },
    });
    const reply = await send(api, request);
    const touched = await settle({
      model,
      api,
      request,
      reply,
      prediction: request.prediction,
    });
    return { touched, events: [] };
  }
  toString() {
    return `create(${describeWho(this.who)} ${aim(this.target, 'source')} replaces=${describePredecessor(this.predecessor)} values=${this.values}${this.keyPick === null ? '' : ` refused-key#${this.keyPick}`})`;
  }
}

/** A draft correction, withdrawal, confirmation or reversal (§7, §8). */
type Change =
  | { action: 'CORRECT_DRAFT'; values: number; reason: number }
  | { action: 'WITHDRAW_DRAFT' | 'REVERSE'; reason: number }
  | { action: 'CONFIRM'; note: number };

function changeCommand(
  payment: PaymentModel,
  change: Change,
  stale: boolean,
): Exclude<Command, { action: 'CREATE' }> {
  // A stale observation: an earlier revision, or one past the current.
  const expectedRevision = stale
    ? payment.revision > 1
      ? payment.revision - 1
      : payment.revision + 1
    : payment.revision;
  switch (change.action) {
    case 'CORRECT_DRAFT':
      return {
        action: change.action,
        payment,
        expectedRevision,
        values: valuesAt(change.values),
        reason: REASONS[change.reason % REASONS.length] ?? REASONS[0],
      };
    case 'WITHDRAW_DRAFT':
    case 'REVERSE':
      return {
        action: change.action,
        payment,
        expectedRevision,
        reason: REASONS[change.reason % REASONS.length] ?? REASONS[0],
      };
    case 'CONFIRM':
      return {
        action: change.action,
        payment,
        expectedRevision,
        note: NOTES[change.note % NOTES.length] ?? NOTES[0],
      };
  }
}

function describeChange(change: Change) {
  switch (change.action) {
    case 'CORRECT_DRAFT':
      return `correct(values=${change.values} reason=${change.reason}`;
    case 'WITHDRAW_DRAFT':
      return `withdraw(reason=${change.reason}`;
    case 'REVERSE':
      return `reverse(reason=${change.reason}`;
    case 'CONFIRM':
      return `confirm(note=${change.note}`;
  }
}

/**
 * A Payment the change may succeed on: its state admits the change and,
 * for CONFIRM, the member authored none of it (§8).
 */
function fits(action: Action, member: MemberKey) {
  return (payment: PaymentModel) =>
    admits(action)(payment.snapshot.state) &&
    (action !== 'CONFIRM' || !authorsOf(payment).has(member));
}

class ChangePayment extends Step {
  protected override readonly requires: Requirement = 'payment';
  constructor(
    private readonly who: Who,
    private readonly target: PaymentTarget,
    private readonly change: Change,
    private readonly stale: boolean,
    private readonly keyPick: number | null,
  ) {
    super();
  }
  protected async act(model: Model, api: PaymentApi) {
    const member = resolveWho(model, this.who, this.change.action);
    const payment = pickPayment(
      model,
      member,
      this.target,
      fits(this.change.action, member),
    );
    const request = freshRequest({
      model,
      api,
      member,
      keyPick: this.keyPick,
      command: changeCommand(payment, this.change, this.stale),
    });
    const reply = await send(api, request);
    const touched = await settle({
      model,
      api,
      request,
      reply,
      prediction: request.prediction,
    });
    return { touched, events: [] };
  }
  toString() {
    return `${describeChange(this.change)} ${describeWho(this.who)} ${aim(this.target, 'payment')}${this.stale ? ' stale' : ''}${this.keyPick === null ? '' : ` refused-key#${this.keyPick}`})`;
  }
}

/** A lifecycle refusal that a concurrent commit turns into a stale one. */
function overtaken(prediction: Prediction) {
  return (
    prediction.kind === 'author' ||
    (prediction.kind === 'conflict' &&
      (prediction.code === 'STALE_PAYMENT' ||
        prediction.code === 'PAYMENT_NO_CHANGE'))
  );
}

/**
 * Two fresh commands race. When both would commit alone and exclude each
 * other, exactly one commits and the other is refused (§8, §9): two changes
 * of one revision, or two creations of one replacement. A lifecycle refusal
 * racing a commit may instead see the committed revision, and be stale.
 */
async function race(
  model: Model,
  api: PaymentApi,
  requests: readonly [Request, Request],
): Promise<PaymentModel[]> {
  const replies = await Promise.all(
    requests.map((request) => send(api, request)),
  );
  const [one, two] = requests;
  const exclusive =
    one.prediction.kind === 'commit' &&
    two.prediction.kind === 'commit' &&
    (one.command.action !== 'CREATE' || one.command.replaces !== null);
  const winners = replies.filter((reply) => reply.status === 201).length;
  if (exclusive && winners !== 1)
    throw new InvariantViolation(
      winners === 0
        ? 'model-agreement'
        : one.command.action === 'CREATE'
          ? 'replacement-chain'
          : 'stale-or-no-op-refused',
      `two racing commands (${requests.map((request) => `${request.member}: ${describeCommand(request.command)}`).join('; ')}) gave ${replies.map(short).join(' | ')}`,
    );
  // A commit settles first, so that the model holds it for the other.
  const order =
    replies[1]?.status === 201 && replies[0]?.status !== 201 ? [1, 0] : [0, 1];
  const touched: PaymentModel[] = [];
  for (const index of order) {
    const request = requests[index === 0 ? 0 : 1];
    const other = requests[index === 0 ? 1 : 0];
    const reply = replies[index];
    const otherReply = replies[index === 0 ? 1 : 0];
    if (!reply || !otherReply)
      throw new Error('A concurrent reply is missing.');
    const stale: Prediction = {
      kind: 'conflict',
      invariant: 'stale-or-no-op-refused',
      code: 'STALE_PAYMENT',
      twin: null,
    };
    let prediction = request.prediction;
    if (exclusive && index === order[1])
      prediction =
        request.command.action === 'CREATE'
          ? {
              kind: 'conflict',
              invariant: 'replacement-chain',
              code: 'PAYMENT_PREDECESSOR_CONFLICT',
              twin: null,
            }
          : stale;
    else if (
      other.prediction.kind === 'commit' &&
      otherReply.status === 201 &&
      overtaken(request.prediction) &&
      reply.status === 409 &&
      codeOf(reply) === 'STALE_PAYMENT'
    )
      prediction = stale;
    touched.push(...(await settle({ model, api, request, reply, prediction })));
  }
  return touched;
}

class ConcurrentChanges extends Step {
  protected override readonly requires: Requirement = 'payment';
  constructor(
    private readonly first: Who,
    private readonly second: Who,
    private readonly target: PaymentTarget,
    private readonly changes: readonly [Change, Change],
  ) {
    super();
  }
  protected async act(model: Model, api: PaymentApi) {
    const [one, two] = this.changes;
    const first = resolveWho(model, this.first, one.action);
    const second = resolveWho(model, this.second, two.action);
    const payment = pickPayment(
      model,
      first,
      this.target,
      fits(one.action, first),
    );
    const requests = [
      freshRequest({
        model,
        api,
        member: first,
        keyPick: null,
        command: changeCommand(payment, one, false),
      }),
      freshRequest({
        model,
        api,
        member: second,
        keyPick: null,
        command: changeCommand(payment, two, false),
      }),
    ] as const;
    return { touched: await race(model, api, requests), events: [] };
  }
  toString() {
    return `concurrent(${describeWho(this.first)} ${describeChange(this.changes[0])}) | ${describeWho(this.second)} ${describeChange(this.changes[1])}) ${aim(this.target, 'payment')})`;
  }
}

/** Two members create the replacement of the latest terminal Payment. */
class ConcurrentCreates extends Step {
  constructor(
    private readonly first: Who,
    private readonly second: Who,
    private readonly target: Target,
    private readonly values: number,
  ) {
    super();
  }
  protected async act(model: Model, api: PaymentApi) {
    const first = resolveWho(model, this.first, 'CREATE');
    const second = resolveWho(model, this.second, 'CREATE');
    const company = model.context[first];
    // The latest terminal Payment still without a replacement, if any.
    const replaces =
      model.payments
        .filter(
          (payment) =>
            payment.company === company &&
            terminal(payment.snapshot.state) &&
            payment.replacement === null,
        )
        .at(-1) ?? null;
    const command: Command = {
      action: 'CREATE',
      source: pickSource(api, company, this.target),
      values: valuesAt(this.values),
      replaces,
    };
    const requests = [
      freshRequest({ model, api, member: first, keyPick: null, command }),
      freshRequest({ model, api, member: second, keyPick: null, command }),
    ] as const;
    return { touched: await race(model, api, requests), events: [] };
  }
  toString() {
    return `concurrent-create(${describeWho(this.first)} ${describeWho(this.second)} ${aim(this.target, 'source')} values=${this.values})`;
  }
}

function committedAt(model: Readonly<Model>, pick: number) {
  const committed = model.committed[pick % model.committed.length];
  if (!committed) throw new Error('The fuzz precondition admitted no command.');
  const payment = model.payments.find(
    (candidate) => candidate.id === committed.paymentId,
  );
  if (!payment) throw new Error('A committed command names no Payment.');
  return { committed, payment };
}

/**
 * Resends a committed command with its key: the exact saved receipt under
 * live authority, else a denial, and never a new write (§8, §9).
 */
class ReplayCommand extends Step {
  protected override readonly requires: Requirement = 'committed';
  constructor(private readonly pick: number) {
    super();
  }
  protected async act(model: Model, api: PaymentApi) {
    const { committed, payment } = committedAt(model, this.pick);
    const request: Request = {
      member: committed.member,
      company: committed.company,
      command: committed.command,
      path: committed.path,
      body: committed.body,
      key: committed.key,
      prediction: authority(
        model,
        committed.member,
        committed.company,
        committed.command,
      ) ?? { kind: 'replay', committed },
    };
    const reply = await send(api, request);
    await settle({
      model,
      api,
      request,
      reply,
      prediction: request.prediction,
    });
    return { touched: [payment], events: [] };
  }
  toString() {
    return `replay(#${this.pick})`;
  }
}

/** How a reused key changes its committed command's intent (§9). */
type Reuse = 'input' | 'action' | 'target' | 'company';

/** A literal of `options` other than `current`. */
function otherText(options: readonly string[], current: string): string {
  const other = options.find((option) => option !== current);
  if (other === undefined)
    throw new Error('The fuzz world defines too few literals.');
  return other;
}

/** The same command with other literal input. */
function otherInput(command: Command): Command {
  switch (command.action) {
    case 'CREATE':
      return { ...command, values: otherValues(command.values) };
    case 'CORRECT_DRAFT':
      return { ...command, values: otherValues(command.values) };
    case 'WITHDRAW_DRAFT':
    case 'REVERSE':
      return { ...command, reason: otherText(REASONS, command.reason) };
    case 'CONFIRM':
      return { ...command, note: otherText(NOTES, command.note) };
  }
}

/** Another action on the same Payment. */
function otherAction(command: Command, payment: PaymentModel): Command {
  const expectedRevision = payment.revision;
  switch (command.action) {
    case 'CREATE':
    case 'CORRECT_DRAFT':
      return {
        action: 'WITHDRAW_DRAFT',
        payment,
        expectedRevision,
        reason: REASONS[0],
      };
    case 'WITHDRAW_DRAFT':
      return {
        action: 'CORRECT_DRAFT',
        payment,
        expectedRevision,
        values: otherValues(payment.snapshot.values),
        reason: command.reason,
      };
    case 'CONFIRM':
      return {
        action: 'REVERSE',
        payment,
        expectedRevision,
        reason: REASONS[0],
      };
    case 'REVERSE':
      return { action: 'CONFIRM', payment, expectedRevision, note: NOTES[0] };
  }
}

/**
 * The same action and input aimed at another target of `company`: another
 * eligible source, or another Payment. None when that Company has none.
 */
function retarget(
  model: Readonly<Model>,
  api: PaymentApi,
  command: Command,
  company: CompanyKey,
): Command | undefined {
  if (command.action === 'CREATE') {
    const source = api.world.sources[company].find(
      (candidate) =>
        candidate.state !== 'draft' &&
        canonical(candidate.tuple) !== canonical(command.source.tuple),
    );
    return source && { ...command, source, replaces: null };
  }
  const payment = model.payments.find(
    (candidate) =>
      candidate.company === company && candidate.id !== command.payment.id,
  );
  return payment && { ...command, payment };
}

/**
 * Reuses a committed key with another Company, target, input or action. It
 * conflicts under live authority and writes nothing (§9).
 */
class ReuseKey extends Step {
  protected override readonly requires: Requirement = 'committed';
  constructor(
    private readonly pick: number,
    private readonly reuse: Reuse,
  ) {
    super();
  }
  protected async act(model: Model, api: PaymentApi) {
    const { committed, payment } = committedAt(model, this.pick);
    const original = committed.command;
    let company = committed.company;
    let changed: Command | undefined;
    switch (this.reuse) {
      case 'input':
        changed = otherInput(original);
        break;
      case 'action':
        changed = otherAction(original, payment);
        break;
      case 'target':
        changed = retarget(model, api, original, company);
        break;
      case 'company':
        company = otherCompany(company);
        changed = retarget(model, api, original, company);
        if (!changed) company = committed.company;
        break;
    }
    // Without another target, the input changes instead.
    changed ??= otherInput(original);
    const request: Request = {
      member: committed.member,
      company,
      command: changed,
      path: pathOf(changed),
      body: bodyOf(changed),
      key: committed.key,
      prediction: authority(model, committed.member, company, changed) ?? {
        kind: 'conflict',
        invariant: 'replay-receipt',
        code: 'IDEMPOTENCY_CONFLICT',
        twin: null,
      },
    };
    const reply = await send(api, request);
    const touched = await settle({
      model,
      api,
      request,
      reply,
      prediction: request.prediction,
    });
    return { touched: [payment, ...touched], events: [] };
  }
  toString() {
    return `reuse-key(#${this.pick} ${this.reuse})`;
  }
}

/** Reads a Payment's detail, history and source PDF. */
class ReadPayment extends Step {
  protected override readonly requires: Requirement = 'payment';
  constructor(
    private readonly member: MemberKey,
    private readonly target: PaymentTarget,
  ) {
    super();
  }
  protected async act(model: Model, api: PaymentApi) {
    const payment = pickPayment(model, this.member, this.target);
    const company = model.context[this.member];
    const read = (path: string) => () =>
      api.send(this.member, path, { company });
    const paths = (id: string) => ({
      detail: `/payments/${id}`,
      history: `/payments/${id}/history`,
      source: `/payments/${id}/source`,
    });
    const own = paths(payment.id);
    const missing = paths(MISSING_ID);
    const what = `${this.member} reading Payment ${payment.id} of Company ${payment.company} from Company ${company}`;
    const readable = canRead(model, this.member, company);
    if (!readable || payment.company !== company) {
      for (const part of ['detail', 'history', 'source'] as const)
        await expectDenial({
          reply: await read(own[part])(),
          status: readable ? 404 : 403,
          invariant: readable
            ? 'company-isolation'
            : denialInvariant(model, this.member, company, [
                'reader',
                'recorder',
                'confirmer',
                'reverser',
              ]),
          what: `${what} (${part})`,
          twin: read(missing[part]),
        });
      return NOTHING;
    }
    const detail = await read(own.detail)();
    if (detail.status !== 200)
      throw new InvariantViolation(
        detail.status === 403 ? 'bundle-matrix' : 'model-agreement',
        `${what}: expected 200, got ${short(detail)}`,
      );
    const body = object(detail.body, `${what}'s detail`);
    if (body.companyId !== api.companyIds[company])
      throw new InvariantViolation(
        'company-isolation',
        `${what}: the detail answers for ${canonical(body.companyId)}`,
      );
    expectSummary({
      model,
      api,
      value: body.payment,
      company,
      where: `${this.member}'s detail`,
    });
    // The head revision's attribution.
    const head = payment.facts.at(-1);
    const actor = object(body.actor, `${what}'s head actor`);
    if (
      !head ||
      api.memberOf(actor.membershipId) !== head.member ||
      body.recordedAt !== head.recordedAt
    )
      throw new InvariantViolation(
        'model-agreement',
        `${what}: the head is by ${canonical(actor)} at ${canonical(body.recordedAt)}, expected ${head?.member ?? 'none'} at ${head?.recordedAt ?? 'none'}`,
      );
    this.expectCapabilities(model, payment, company, body.capabilities, what);
    // The live source and its content follow the family gate (§6).
    const family = granted(model, this.member, company, 'evidence');
    const live = object(body.liveSource, `${what}'s live source`);
    const shown =
      live.kind === 'AVAILABLE'
        ? canonical([
            live.documentId,
            live.documentVersionId,
            object(live.content, `${what}'s live content`).representationId,
          ])
        : canonical(live);
    const expected = family
      ? canonical([
          payment.source.tuple.documentId,
          payment.source.tuple.documentVersionId,
          payment.source.tuple.representationId,
        ])
      : canonical({ kind: 'UNAVAILABLE' });
    if (shown !== expected)
      throw new InvariantViolation(
        live.kind === 'AVAILABLE' && !family
          ? denialInvariant(model, this.member, company, ['evidence'])
          : 'model-agreement',
        `${what}: the live source is ${shown}, expected ${expected}`,
      );
    // The original Client link follows the members' constant Client read.
    const client = object(body.client, `${what}'s Client`);
    if (
      client.kind !== 'AVAILABLE' ||
      client.clientId !== payment.source.clientId
    )
      throw new InvariantViolation(
        'model-agreement',
        `${what}: the Client link is ${canonical(client)}, expected Client ${payment.source.clientId}`,
      );
    const embedded = object(body.history, `${what}'s first history page`);
    expectFacts({
      model,
      api,
      payment,
      items: list(embedded.items, `${what}'s first history page`),
      headRevision: payment.revision,
      complete: false,
      where: `${this.member}'s detail history`,
    });
    const history = await readHistory(api, this.member, company, payment.id);
    if (history.first.status !== 200 || history.headRevision === null)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: the history answered ${short(history.first)}`,
      );
    expectFacts({
      model,
      api,
      payment,
      items: history.items,
      headRevision: history.headRevision,
      complete: true,
      where: `${this.member}'s history`,
    });
    // Source bytes need the family gate too (§6); without it, any refusal.
    const pdf = await read(own.source)();
    if (
      family
        ? pdf.status !== 200 || !pdf.text.startsWith('%PDF-')
        : pdf.status !== 403 && pdf.status !== 404
    )
      throw new InvariantViolation(
        family
          ? 'model-agreement'
          : denialInvariant(model, this.member, company, ['evidence']),
        `${what}: the source PDF answered ${pdf.status}, expected ${family ? '200 with a PDF' : 'a refusal'}`,
      );
    return NOTHING;
  }
  /**
   * Capabilities follow the current captures, the state and authorship
   * (§6, §8). A replacement offer is only checked to be possible.
   */
  private expectCapabilities(
    model: Readonly<Model>,
    payment: PaymentModel,
    company: CompanyKey,
    value: unknown,
    what: string,
  ) {
    const has = (bundle: Bundle) =>
      granted(model, this.member, company, bundle);
    const { state } = payment.snapshot;
    const draft = state === 'DRAFT';
    const author = authorsOf(payment).has(this.member);
    const capabilities = object(value, `${what}'s capabilities`);
    const expected = {
      canCorrect: draft && has('recorder') && has('evidence'),
      canWithdraw: draft && has('recorder'),
      canConfirm: draft && has('confirmer') && has('evidence') && !author,
      canReverse: state === 'CONFIRMED' && has('reverser'),
    };
    const seen = {
      canCorrect: capabilities.canCorrect,
      canWithdraw: capabilities.canWithdraw,
      canConfirm: capabilities.canConfirm,
      canReverse: capabilities.canReverse,
    };
    if (canonical(seen) !== canonical(expected))
      throw new InvariantViolation(
        seen.canConfirm !== expected.canConfirm &&
          draft &&
          has('confirmer') &&
          has('evidence')
          ? 'independent-author'
          : 'model-agreement',
        `${what}: capabilities ${canonical(seen)}, expected ${canonical(expected)}`,
      );
    if (
      capabilities.canReplace !== false &&
      (capabilities.canReplace !== true ||
        !terminal(state) ||
        payment.replacement !== null ||
        !has('recorder'))
    )
      throw new InvariantViolation(
        'replacement-chain',
        `${what}: offers replacement ${canonical(capabilities.canReplace)} of a ${state} Payment replaced by ${payment.replacement ?? 'none'}`,
      );
  }
  toString() {
    return `read(${this.member} ${aim(this.target, 'payment')})`;
  }
}

class ListInventory extends Step {
  constructor(private readonly member: MemberKey) {
    super();
  }
  protected async act(model: Model, api: PaymentApi) {
    const company = model.context[this.member];
    const inventory = await readInventory(api, this.member, company);
    const what = `${this.member} listing Company ${company}`;
    if (!canRead(model, this.member, company)) {
      await expectDenial({
        reply: inventory.first,
        status: 403,
        invariant: denialInvariant(model, this.member, company, [
          'reader',
          'recorder',
          'confirmer',
          'reverser',
        ]),
        what,
      });
      return NOTHING;
    }
    if (inventory.first.status !== 200)
      throw new InvariantViolation(
        inventory.first.status === 403 ? 'bundle-matrix' : 'model-agreement',
        `${what}: expected 200, got ${short(inventory.first)}`,
      );
    expectInventory({
      model,
      api,
      company,
      items: inventory.items,
      who: this.member,
    });
    return NOTHING;
  }
  toString() {
    return `inventory(${this.member})`;
  }
}

/** The eligible source selector: Recorder and Evidence Access (§6, §10). */
function canSelectSources(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
) {
  return (
    granted(model, member, company, 'recorder') &&
    granted(model, member, company, 'evidence')
  );
}

/**
 * The selector lists exactly the Company's official and superseded tuples,
 * never its draft, with their copied context (§5, §10).
 */
class ListSources extends Step {
  constructor(private readonly member: MemberKey) {
    super();
  }
  protected async act(model: Model, api: PaymentApi) {
    const company = model.context[this.member];
    const reply = await api.send(this.member, '/payments/sources', {
      company,
    });
    const what = `${this.member} listing the sources of Company ${company}`;
    if (!canSelectSources(model, this.member, company)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(model, this.member, company, [
          'recorder',
          'evidence',
        ]),
        what,
      });
      return NOTHING;
    }
    if (reply.status !== 200)
      throw new InvariantViolation(
        reply.status === 403 ? 'bundle-matrix' : 'model-agreement',
        `${what}: expected 200, got ${short(reply)}`,
      );
    const page = object(reply.body, `${what}'s page`);
    const seen = list(page.items, `${what}'s items`)
      .map((value) => {
        const item = object(value, `${what}'s item`);
        return canonical([
          canonical(item.source),
          item.versionState,
          canonical(item.copiedContext),
        ]);
      })
      .sort();
    const expected = api.world.sources[company]
      .filter((source) => source.state !== 'draft')
      .map((source) =>
        canonical([
          canonical(source.tuple),
          source.state,
          source.copiedContext,
        ]),
      )
      .sort();
    if (canonical(seen) !== canonical(expected)) {
      const foreign = api.world.sources[otherCompany(company)].some((source) =>
        seen.some((item) => item.includes(source.tuple.documentId)),
      );
      throw new InvariantViolation(
        foreign ? 'company-isolation' : 'model-agreement',
        `${what}: lists ${canonical(seen)}, expected ${canonical(expected)}`,
      );
    }
    return NOTHING;
  }
  toString() {
    return `sources(${this.member})`;
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
  protected async act(model: Model, api: PaymentApi) {
    const reply = await api.send(this.member, '/access/current-actor', {
      company: this.company,
    });
    const what = `${this.member} selecting Company ${this.company}`;
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: expected 200, got ${short(reply)}`,
      );
    const active = object(
      object(reply.body, `${what}'s actor`).activeCompany,
      `${what}'s Company`,
    );
    if (active.id !== api.companyIds[this.company])
      throw new InvariantViolation(
        'company-isolation',
        `${what}: the server selected ${canonical(active.id)}`,
      );
    model.context[this.member] = this.company;
    return NOTHING;
  }
  toString() {
    return `switch(${this.member} to ${this.company})`;
  }
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
  protected async act(model: Model, api: PaymentApi) {
    const reply = await api.send('owner', bundleAssignments(this.bundle), {
      method: 'POST',
      key: randomUUID(),
      body: {
        companyId: api.companyIds[this.company],
        workspaceMembershipId: api.membershipIds[this.member],
      },
    });
    if (reply.status !== 201)
      throw new InvariantViolation(
        'model-agreement',
        `granting ${this.member} ${this.bundle} in Company ${this.company}: expected 201, got ${short(reply)}`,
      );
    const changed = !granted(model, this.member, this.company, this.bundle);
    setGrant(model, this.member, this.company, this.bundle, 'active');
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

/**
 * The owner revokes one bundle; the member's next inventory and source
 * selection follow the remaining captures at once (§6, §9).
 */
class RevokeBundle extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
    private readonly bundle: Bundle,
  ) {
    super();
  }
  protected async act(model: Model, api: PaymentApi) {
    const reply = await api.send(
      'owner',
      `${bundleAssignments(this.bundle)}/${api.membershipIds[this.member]}/${api.companyIds[this.company]}`,
      { method: 'DELETE', key: randomUUID() },
    );
    const what = `revoking ${this.member} ${this.bundle} in Company ${this.company}`;
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: expected 200, got ${short(reply)}`,
      );
    const changed = granted(model, this.member, this.company, this.bundle);
    if (changed)
      setGrant(model, this.member, this.company, this.bundle, 'revoked');
    const probes = [
      {
        path: '/payments',
        allowed: canRead(model, this.member, this.company),
        bundles: ['reader', 'recorder', 'confirmer', 'reverser'] as const,
      },
      {
        path: '/payments/sources',
        allowed: canSelectSources(model, this.member, this.company),
        bundles: ['recorder', 'evidence'] as const,
      },
    ];
    for (const probe of probes) {
      const next = await api.send(this.member, probe.path, {
        company: this.company,
      });
      if (next.status !== (probe.allowed ? 200 : 403))
        throw new InvariantViolation(
          probe.allowed
            ? 'bundle-matrix'
            : denialInvariant(model, this.member, this.company, probe.bundles),
          `${this.member}'s next ${probe.path} after ${what}: expected ${probe.allowed ? 200 : 403}, got ${short(next)}`,
        );
    }
    return {
      touched: [],
      events: changed
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

/** The command arbitraries, repeated by weight. */
export function fuzzCommands(options: {
  steps: number;
  replayPath: string | undefined;
}) {
  const member = fc.constantFrom(...MEMBERS);
  // Half the commands come from a member able to send them, so that
  // Payments accumulate revisions, confirmations, terminal states and
  // replacement chains; the other half from any member, mostly refused.
  const who: fc.Arbitrary<Who> = fc.oneof(
    member,
    fc.record({ able: fc.nat({ max: 2 }) }),
  );
  const company = fc.constantFrom(...COMPANIES);
  const bundle = fc.constantFrom(...BUNDLES);
  const pick = fc.nat({ max: 7 });
  const oneIn = (n: number) => fc.nat({ max: n - 1 }).map((roll) => roll === 0);
  // One step in four aims at the other Company, three Payment steps in four
  // prefer one the change may succeed on, one source in seven is the
  // draft, one change in four observed a stale revision and one command in
  // four reuses a key that a refused command left free.
  const source: fc.Arbitrary<Target> = fc.record({
    index: fc.nat({ max: 6 }),
    foreign: oneIn(4),
  });
  const payment: fc.Arbitrary<PaymentTarget> = fc.record({
    index: pick,
    foreign: oneIn(4),
    fit: oneIn(4).map((roll) => !roll),
  });
  const keyPick: fc.Arbitrary<number | null> = fc.oneof(
    { arbitrary: fc.constant(null), weight: 3 },
    { arbitrary: pick, weight: 1 },
  );
  const values = fc.nat({ max: VALUES.length - 1 });
  const reason = fc.nat({ max: REASONS.length - 1 });
  const note = fc.nat({ max: NOTES.length - 1 });
  const predecessor: fc.Arbitrary<PredecessorChoice> = fc.oneof(
    { arbitrary: fc.constant({ kind: 'none' } as const), weight: 4 },
    { arbitrary: fc.constant({ kind: 'terminal' } as const), weight: 3 },
    {
      arbitrary: fc.record({
        kind: fc.constant('pick' as const),
        index: pick,
        foreign: oneIn(4),
      }),
      weight: 2,
    },
  );
  const change: fc.Arbitrary<Change> = fc.oneof(
    {
      arbitrary: fc.record({
        action: fc.constant('CORRECT_DRAFT' as const),
        values,
        reason,
      }),
      weight: 3,
    },
    {
      arbitrary: fc.record({
        action: fc.constant('WITHDRAW_DRAFT' as const),
        reason,
      }),
      weight: 1,
    },
    {
      arbitrary: fc.record({ action: fc.constant('CONFIRM' as const), note }),
      weight: 3,
    },
    {
      arbitrary: fc.record({
        action: fc.constant('REVERSE' as const),
        reason,
      }),
      weight: 2,
    },
  );
  const reuse = fc.constantFrom<Reuse>('input', 'action', 'target', 'company');
  const weighted: Array<[number, fc.Arbitrary<FuzzCommand>]> = [
    [
      5,
      fc
        .tuple(who, source, predecessor, values, keyPick)
        .map((args) => new CreatePayment(...args)),
    ],
    [
      8,
      fc
        .tuple(who, payment, change, oneIn(4), keyPick)
        .map((args) => new ChangePayment(...args)),
    ],
    [2, fc.tuple(member, payment).map((args) => new ReadPayment(...args))],
    [1, member.map((who) => new ListInventory(who))],
    [1, member.map((who) => new ListSources(who))],
    [2, fc.tuple(member, company).map((args) => new SwitchCompany(...args))],
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
    [2, pick.map((index) => new ReplayCommand(index))],
    [2, fc.tuple(pick, reuse).map((args) => new ReuseKey(...args))],
    [
      1,
      fc
        .tuple(who, who, payment, fc.tuple(change, change))
        .map((args) => new ConcurrentChanges(...args)),
    ],
    [
      1,
      fc
        .tuple(who, who, source, values)
        .map((args) => new ConcurrentCreates(...args)),
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
