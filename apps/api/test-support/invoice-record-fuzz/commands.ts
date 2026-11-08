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
  bundleAssignments,
  canRead,
  canReachSource,
  canRecord,
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
  object,
  observeRevision,
  readHistory,
  readInventory,
  REASONS,
  setGrant,
  text,
  VALUES,
  type Action,
  type Bundle,
  type CompanyKey,
  type Confirmation,
  type Invariant,
  type InvoiceApi,
  type MemberKey,
  type Model,
  type RecordModel,
  type SourceModel,
  type StepOutcome,
  type Values,
} from './world.js';

type FuzzCommand = fc.AsyncCommand<Model, InvoiceApi>;

const NOTHING: StepOutcome = { touched: [], events: [] };

/** What a step needs to exist before it can run. */
type Requirement = 'nothing' | 'record' | 'confirmation';

/** Every step acts, then the world checks every invariant. */
abstract class Step implements FuzzCommand {
  protected readonly requires: Requirement = 'nothing';
  check(model: Readonly<Model>): boolean {
    switch (this.requires) {
      case 'nothing':
        return true;
      case 'record':
        return model.records.length > 0;
      case 'confirmation':
        return model.confirmations.length > 0;
    }
  }
  async run(model: Model, api: InvoiceApi): Promise<void> {
    await checkStep(model, api, await this.act(model, api));
  }
  protected abstract act(model: Model, api: InvoiceApi): Promise<StepOutcome>;
  abstract toString(): string;
}

function otherCompany(company: CompanyKey): CompanyKey {
  return company === 'A' ? 'B' : 'A';
}

/**
 * Which Record or source a step aims at: `index` modulo those of the
 * member's current Company, or of the other Company when `foreign`; a
 * Record step falls back to every Record when that Company has none.
 */
interface Target {
  index: number;
  foreign: boolean;
}

/** A Record target that prefers a RECORDED entry when `live`. */
interface RecordTarget extends Target {
  live: boolean;
}

function aim(target: Target | RecordTarget, noun: string) {
  return `${target.foreign ? 'foreign ' : ''}${'live' in target && target.live ? 'live ' : ''}${noun}#${target.index}`;
}

function pickRecord(
  model: Readonly<Model>,
  member: MemberKey,
  target: RecordTarget,
): RecordModel {
  const own = model.context[member];
  const scoped = model.records.filter(
    (record) => (record.company === own) !== target.foreign,
  );
  const live = scoped.filter((record) => record.entryState === 'RECORDED');
  const pool =
    target.live && live.length > 0
      ? live
      : scoped.length > 0
        ? scoped
        : model.records;
  const record = pool[target.index % pool.length];
  if (!record) throw new Error('The fuzz precondition admitted no Record.');
  return record;
}

function pickSource(
  api: InvoiceApi,
  company: CompanyKey,
  target: Target,
): SourceModel {
  const pool =
    api.world.sources[target.foreign ? otherCompany(company) : company];
  const source = pool[target.index % pool.length];
  if (!source) throw new Error('The fuzz world prepared no source.');
  return source;
}

/** The predecessor a CREATE names (§8.1). */
type PredecessorChoice =
  | { kind: 'none' }
  | { kind: 'latest' }
  | { kind: 'pick'; index: number; foreign: boolean };

function describePredecessor(choice: PredecessorChoice) {
  switch (choice.kind) {
    case 'none':
      return 'none';
    case 'latest':
      return 'latest';
    case 'pick':
      return aim(choice, 'record');
  }
}

function resolvePredecessor(
  model: Readonly<Model>,
  company: CompanyKey,
  source: SourceModel,
  choice: PredecessorChoice,
): RecordModel | null {
  switch (choice.kind) {
    case 'none':
      return null;
    case 'latest':
      return (
        model.records
          .filter((record) => record.source.documentId === source.documentId)
          .at(-1) ?? null
      );
    case 'pick': {
      const pool = model.records.filter(
        (record) => (record.company === company) !== choice.foreign,
      );
      return pool[choice.index % pool.length] ?? null;
    }
  }
}

/** One Invoice Record command, before it has a key. */
type Command =
  | {
      action: 'CREATE';
      source: SourceModel;
      values: Values;
      replaces: RecordModel | null;
    }
  | {
      action: 'CORRECT';
      record: RecordModel;
      expectedRevision: number;
      values: Values;
      reason: string;
    }
  | {
      action: 'WITHDRAW_ENTRY';
      record: RecordModel;
      expectedRevision: number;
      reason: string;
    };

function pathOf(command: Command, recordId?: string) {
  return command.action === 'CREATE'
    ? '/invoice-records'
    : `/invoice-records/${recordId ?? command.record.id}/commands`;
}

function bodyOf(command: Command): Record<string, unknown> {
  switch (command.action) {
    case 'CREATE':
      return {
        source: command.source.tuple,
        values: command.values,
        acknowledgeExternalDeclaration: true,
        replacesWithdrawnRecordId: command.replaces?.id ?? null,
      };
    case 'CORRECT':
      return {
        action: 'CORRECT',
        expectedRevision: command.expectedRevision,
        values: command.values,
        reason: command.reason,
      };
    case 'WITHDRAW_ENTRY':
      return {
        action: 'WITHDRAW_ENTRY',
        expectedRevision: command.expectedRevision,
        reason: command.reason,
      };
  }
}

function describeCommand(command: Command) {
  return command.action === 'CREATE'
    ? `CREATE from ${command.source.name}${command.replaces ? ` replacing ${command.replaces.id}` : ''}`
    : `${command.action} on Record ${command.record.id} of Company ${command.record.company} at revision ${command.expectedRevision}`;
}

type Prediction =
  /**
   * A 403. `blind` when it precedes the target lookup, so that a missing
   * target gets the identical answer; the family gate of a CORRECT follows
   * the lookup of a Record its actor may read.
   */
  | { kind: 'denied'; invariant: Invariant; blind: boolean }
  | { kind: 'hidden' }
  | { kind: 'conflict'; invariant: Invariant }
  | { kind: 'replay'; confirmation: Confirmation }
  | { kind: 'commit' };

/**
 * The §6 authority checks, in the service's order: the Recorder capture,
 * then the target (a foreign source or Record is not found), with the
 * financial Document family gate for CREATE and CORRECT. A command that
 * passes them reaches its key, then its lifecycle checks.
 */
function authority(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
  command: Command,
): Prediction | undefined {
  if (!canRecord(model, member, company))
    return {
      kind: 'denied',
      invariant: denialInvariant(model, member, company, ['recorder']),
      blind: true,
    };
  const family = (): Prediction | undefined =>
    canReachSource(model, member, company)
      ? undefined
      : {
          kind: 'denied',
          invariant: denialInvariant(model, member, company, ['external']),
          blind: command.action === 'CREATE',
        };
  if (command.action === 'CREATE')
    return (
      family() ??
      (command.source.company === company ? undefined : { kind: 'hidden' })
    );
  if (command.record.company !== company) return { kind: 'hidden' };
  return command.action === 'CORRECT' ? family() : undefined;
}

/** The §8.1-§8.2 lifecycle outcome of a fresh key. */
function lifecycle(
  model: Readonly<Model>,
  company: CompanyKey,
  command: Command,
): Prediction {
  if (command.action === 'CREATE') {
    const { source, replaces } = command;
    if (source.state === 'draft')
      return { kind: 'conflict', invariant: 'model-agreement' };
    const sameDocument = model.records.filter(
      (record) =>
        record.company === company &&
        record.source.documentId === source.documentId,
    );
    if (sameDocument.some((record) => record.entryState === 'RECORDED'))
      return { kind: 'conflict', invariant: 'single-active-entry' };
    const latest = sameDocument.at(-1);
    if (
      (latest && latest !== replaces) ||
      (replaces &&
        (replaces.company !== company ||
          replaces.entryState !== 'WITHDRAWN' ||
          replaces.replacement !== null))
    )
      return { kind: 'conflict', invariant: 'replacement-chain' };
    return { kind: 'commit' };
  }
  const { record } = command;
  if (record.entryState === 'WITHDRAWN')
    return { kind: 'conflict', invariant: 'withdrawal-terminal' };
  if (command.expectedRevision !== record.revision)
    return { kind: 'conflict', invariant: 'stale-or-no-op-refused' };
  if (
    command.action === 'CORRECT' &&
    canonical(command.values) === canonical(record.values)
  )
    return { kind: 'conflict', invariant: 'stale-or-no-op-refused' };
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
  api: InvoiceApi;
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
      lifecycle(model, company, command),
  };
}

function send(api: InvoiceApi, request: Request) {
  return api.send(request.member, request.path, {
    method: 'POST',
    body: request.body,
    company: request.company,
    key: request.key,
  });
}

/**
 * A refused command reserves no key (§8.2, §8.3): a later command of the
 * same member may use it. A committed key stays reserved.
 */
function release(model: Model, request: Request) {
  const same = (entry: { member: MemberKey; key: string }) =>
    entry.member === request.member && entry.key === request.key;
  if (!model.confirmations.some(same) && !model.refused.some(same))
    model.refused.push({ member: request.member, key: request.key });
}

interface Receipt {
  commandId: string;
  recordId: string;
  revision: number;
  recordedAt: string;
}

/** The closed §8.3 receipt of a committed command. */
function readReceipt(reply: Reply, action: Action, what: string): Receipt {
  const body = object(reply.body, `the receipt of ${what}`);
  if (
    canonical(Object.keys(body).sort()) !==
      canonical([
        'action',
        'commandId',
        'format',
        'recordId',
        'recordedAt',
        'revision',
      ]) ||
    body.format !== 'EXTERNAL_INVOICE_COMMAND/1' ||
    body.action !== action
  )
    throw new InvariantViolation(
      'model-agreement',
      `${what}: the receipt is not closed: ${short(reply)}`,
    );
  return {
    commandId: text(body.commandId, `the command id of ${what}`),
    recordId: text(body.recordId, `the Record id of ${what}`),
    revision: integer(body.revision, `the revision of ${what}`),
    recordedAt: text(body.recordedAt, `the instant of ${what}`),
  };
}

/** Applies a committed command to the model, from its receipt. */
function commit(input: {
  model: Model;
  request: Request;
  reply: Reply;
  what: string;
}): RecordModel[] {
  const { model, request, reply, what } = input;
  const { command } = request;
  const receipt = readReceipt(reply, command.action, what);
  let record: RecordModel;
  const touched: RecordModel[] = [];
  if (command.action === 'CREATE') {
    if (model.records.some((known) => known.id === receipt.recordId))
      throw new InvariantViolation(
        'history-once',
        `${what}: the receipt names the existing Record ${receipt.recordId}`,
      );
    record = {
      id: receipt.recordId,
      company: request.company,
      source: command.source,
      revision: 1,
      entryState: 'RECORDED',
      values: command.values,
      replaces: command.replaces?.id ?? null,
      replacement: null,
      createdAt: receipt.recordedAt,
      facts: [],
    };
    model.records.push(record);
    if (command.replaces) {
      command.replaces.replacement = record.id;
      touched.push(command.replaces);
    }
  } else {
    record = command.record;
    if (receipt.recordId !== record.id)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: the receipt names Record ${receipt.recordId}`,
      );
    record.revision += 1;
  }
  if (receipt.revision !== record.revision)
    throw new InvariantViolation(
      'history-once',
      `${what}: the receipt reports revision ${receipt.revision}; expected ${record.revision}`,
    );
  observeRevision(model, record.id, receipt.revision, `the receipt of ${what}`);
  const before =
    command.action === 'CREATE'
      ? null
      : { entryState: record.entryState, values: record.values };
  if (command.action === 'CORRECT') record.values = command.values;
  if (command.action === 'WITHDRAW_ENTRY') record.entryState = 'WITHDRAWN';
  record.facts.push({
    action: command.action,
    member: request.member,
    key: request.key,
    before,
    after: { entryState: record.entryState, values: record.values },
    reason: command.action === 'CREATE' ? null : command.reason,
    commandId: receipt.commandId,
    recordedAt: receipt.recordedAt,
  });
  model.confirmations.push({
    member: request.member,
    company: request.company,
    action: command.action,
    path: pathOf(command, record.id),
    body: request.body,
    key: request.key,
    recordId: record.id,
    receipt: canonical(reply.body),
  });
  model.refused = model.refused.filter(
    (entry) => entry.member !== request.member || entry.key !== request.key,
  );
  return [record, ...touched];
}

/** Checks one command reply against its predicted outcome. */
async function settle(input: {
  model: Model;
  api: InvoiceApi;
  request: Request;
  reply: Reply;
  prediction: Prediction;
}): Promise<RecordModel[]> {
  const { model, api, request, reply, prediction } = input;
  const { command } = request;
  const what = `${request.member} sending ${describeCommand(command)} from Company ${request.company}`;
  // The same command aimed at a missing target: a missing Record, a
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
      : twin(request.body, `/invoice-records/${MISSING_ID}/commands`);
  const touched = command.action === 'CREATE' ? [] : [command.record];
  switch (prediction.kind) {
    case 'denied':
      await expectDenial({
        reply,
        status: 403,
        invariant: prediction.invariant,
        what,
        twin: prediction.blind ? missingTarget : undefined,
      });
      release(model, request);
      return touched;
    case 'hidden':
      await expectDenial({
        reply,
        status: 404,
        invariant: 'company-isolation',
        what,
        twin: missingTarget,
      });
      release(model, request);
      return touched;
    case 'conflict': {
      // A foreign predecessor is refused like a missing one (§8.1).
      const foreignPredecessor =
        command.action === 'CREATE' &&
        command.replaces !== null &&
        command.replaces.company !== request.company;
      await expectDenial({
        reply,
        status: 409,
        invariant:
          reply.status === 201 ? prediction.invariant : 'model-agreement',
        what,
        twin: foreignPredecessor
          ? twin({ ...request.body, replacesWithdrawnRecordId: MISSING_ID })
          : undefined,
      });
      release(model, request);
      return command.action === 'CREATE' && command.replaces
        ? [command.replaces]
        : touched;
    }
    case 'replay':
      if (
        reply.status !== 201 ||
        canonical(reply.body) !== prediction.confirmation.receipt
      )
        throw new InvariantViolation(
          'replay-receipt',
          `${what}: expected the saved receipt ${prediction.confirmation.receipt}, got ${short(reply)}`,
        );
      return touched;
    case 'commit':
      if (reply.status !== 201)
        throw new InvariantViolation(
          'model-agreement',
          `${what}: expected 201, got ${short(reply)}`,
        );
      return commit({ model, request, reply, what });
  }
}

class CreateRecord extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly target: Target,
    private readonly predecessor: PredecessorChoice,
    private readonly values: number,
    private readonly keyPick: number | null,
  ) {
    super();
  }
  protected async act(model: Model, api: InvoiceApi) {
    const company = model.context[this.member];
    const source = pickSource(api, company, this.target);
    const request = freshRequest({
      model,
      api,
      member: this.member,
      keyPick: this.keyPick,
      command: {
        action: 'CREATE',
        source,
        values: VALUES[this.values % VALUES.length] ?? noValues(),
        replaces: resolvePredecessor(model, company, source, this.predecessor),
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
    return `create(${this.member} ${aim(this.target, 'source')} replaces=${describePredecessor(this.predecessor)} values=${this.values}${this.keyPick === null ? '' : ` refused-key#${this.keyPick}`})`;
  }
}

function noValues(): never {
  throw new Error('The fuzz world defines no values.');
}

/** A transcription correction or an entry withdrawal (§8.2). */
type Change =
  | { action: 'CORRECT'; values: number; reason: number }
  | { action: 'WITHDRAW_ENTRY'; reason: number };

function changeCommand(
  record: RecordModel,
  change: Change,
  stale: boolean,
): Command {
  // A stale observation: an earlier revision, or one past the first.
  const expectedRevision = stale
    ? record.revision > 1
      ? record.revision - 1
      : record.revision + 1
    : record.revision;
  const reason = REASONS[change.reason % REASONS.length] ?? REASONS[0];
  return change.action === 'CORRECT'
    ? {
        action: 'CORRECT',
        record,
        expectedRevision,
        values: VALUES[change.values % VALUES.length] ?? noValues(),
        reason,
      }
    : { action: 'WITHDRAW_ENTRY', record, expectedRevision, reason };
}

function describeChange(change: Change) {
  return change.action === 'CORRECT'
    ? `correct(values=${change.values} reason=${change.reason}`
    : `withdraw(reason=${change.reason}`;
}

class ChangeRecord extends Step {
  protected override readonly requires: Requirement = 'record';
  constructor(
    private readonly member: MemberKey,
    private readonly target: RecordTarget,
    private readonly change: Change,
    private readonly stale: boolean,
    private readonly keyPick: number | null,
  ) {
    super();
  }
  protected async act(model: Model, api: InvoiceApi) {
    const record = pickRecord(model, this.member, this.target);
    const request = freshRequest({
      model,
      api,
      member: this.member,
      keyPick: this.keyPick,
      command: changeCommand(record, this.change, this.stale),
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
    return `${describeChange(this.change)} ${this.member} ${aim(this.target, 'record')}${this.stale ? ' stale' : ''}${this.keyPick === null ? '' : ` refused-key#${this.keyPick}`})`;
  }
}

/**
 * Two fresh commands race. When both would commit alone, exactly one
 * commits and the other is refused (§8.1, §9): two corrections or a
 * correction and a withdrawal of one revision, or two creations naming one
 * Document.
 */
async function race(
  model: Model,
  api: InvoiceApi,
  requests: readonly [Request, Request],
): Promise<RecordModel[]> {
  const replies = await Promise.all(
    requests.map((request) => send(api, request)),
  );
  const racing = requests.every(
    (request) => request.prediction.kind === 'commit',
  );
  const winners = replies.filter((reply) => reply.status === 201).length;
  if (racing && winners !== 1)
    throw new InvariantViolation(
      winners === 0
        ? 'model-agreement'
        : requests[0].command.action === 'CREATE'
          ? 'single-active-entry'
          : 'stale-or-no-op-refused',
      `two racing commands (${requests.map((request) => `${request.member}: ${describeCommand(request.command)}`).join('; ')}) gave ${replies.map(short).join(' | ')}`,
    );
  const order = racing && replies[1]?.status === 201 ? [1, 0] : [0, 1];
  const touched: RecordModel[] = [];
  for (const index of order) {
    const request = requests[index === 0 ? 0 : 1];
    const reply = replies[index];
    if (!reply) throw new Error('A concurrent reply is missing.');
    const prediction: Prediction =
      racing && index === order[1]
        ? {
            kind: 'conflict',
            invariant:
              request.command.action === 'CREATE'
                ? 'single-active-entry'
                : 'stale-or-no-op-refused',
          }
        : request.prediction;
    touched.push(...(await settle({ model, api, request, reply, prediction })));
  }
  return touched;
}

class ConcurrentChanges extends Step {
  protected override readonly requires: Requirement = 'record';
  constructor(
    private readonly first: MemberKey,
    private readonly second: MemberKey,
    private readonly target: RecordTarget,
    private readonly changes: readonly [Change, Change],
  ) {
    super();
  }
  protected async act(model: Model, api: InvoiceApi) {
    const record = pickRecord(model, this.first, this.target);
    const [one, two] = this.changes;
    const requests = [
      freshRequest({
        model,
        api,
        member: this.first,
        keyPick: null,
        command: changeCommand(record, one, false),
      }),
      freshRequest({
        model,
        api,
        member: this.second,
        keyPick: null,
        command: changeCommand(record, two, false),
      }),
    ] as const;
    return { touched: await race(model, api, requests), events: [] };
  }
  toString() {
    return `concurrent(${this.first} ${describeChange(this.changes[0])}) | ${this.second} ${describeChange(this.changes[1])}) ${aim(this.target, 'record')})`;
  }
}

class ConcurrentCreates extends Step {
  constructor(
    private readonly first: MemberKey,
    private readonly second: MemberKey,
    private readonly target: Target,
    private readonly predecessor: PredecessorChoice,
    private readonly values: number,
  ) {
    super();
  }
  protected async act(model: Model, api: InvoiceApi) {
    const company = model.context[this.first];
    const source = pickSource(api, company, this.target);
    const replaces = resolvePredecessor(
      model,
      company,
      source,
      this.predecessor,
    );
    const values = VALUES[this.values % VALUES.length] ?? noValues();
    const requests = [this.first, this.second].map((member) =>
      freshRequest({
        model,
        api,
        member,
        keyPick: null,
        command: { action: 'CREATE', source, values, replaces },
      }),
    );
    const [one, two] = requests;
    if (!one || !two) throw new Error('A concurrent request is missing.');
    return { touched: await race(model, api, [one, two]), events: [] };
  }
  toString() {
    return `concurrent-create(${this.first} ${this.second} ${aim(this.target, 'source')} replaces=${describePredecessor(this.predecessor)} values=${this.values})`;
  }
}

/** The command a committed confirmation's target allows checking again. */
function confirmedCommand(
  model: Readonly<Model>,
  confirmation: Confirmation,
): { record: RecordModel; command: (action: Action) => Command } {
  const record = model.records.find(
    (candidate) => candidate.id === confirmation.recordId,
  );
  if (!record) throw new Error('A confirmation names no known Record.');
  const reason =
    typeof confirmation.body.reason === 'string'
      ? confirmation.body.reason
      : REASONS[0];
  const values = VALUES.find(
    (candidate) => canonical(candidate) !== canonical(confirmation.body.values),
  );
  if (!values) throw new Error('The fuzz world defines too few values.');
  return {
    record,
    command: (action) =>
      action === 'CREATE'
        ? { action, source: record.source, values, replaces: null }
        : action === 'CORRECT'
          ? {
              action,
              record,
              expectedRevision: record.revision,
              values,
              reason,
            }
          : {
              action,
              record,
              expectedRevision: record.revision,
              reason: REASONS.find((other) => other !== reason) ?? reason,
            },
  };
}

/**
 * Resends a committed command with its key: the exact saved receipt under
 * live authority, else a denial, and never a new write (§8.3).
 */
class ReplayCommand extends Step {
  protected override readonly requires: Requirement = 'confirmation';
  constructor(private readonly pick: number) {
    super();
  }
  protected async act(model: Model, api: InvoiceApi) {
    const original =
      model.confirmations[this.pick % model.confirmations.length];
    if (!original)
      throw new Error('The fuzz precondition admitted no command.');
    const { record, command } = confirmedCommand(model, original);
    // Only its authority target matters: the replay resends the body.
    const target = command(original.action);
    const request: Request = {
      member: original.member,
      company: original.company,
      command: target,
      path: original.path,
      body: original.body,
      key: original.key,
      prediction: authority(
        model,
        original.member,
        original.company,
        target,
      ) ?? { kind: 'replay', confirmation: original },
    };
    const reply = await send(api, request);
    await settle({
      model,
      api,
      request,
      reply,
      prediction: request.prediction,
    });
    return { touched: [record], events: [] };
  }
  toString() {
    return `replay(#${this.pick})`;
  }
}

/**
 * Reuses a committed key for a different intent: another value or reason
 * of the same action, or another action on the same Record. It conflicts
 * under live authority and writes nothing (§8.3).
 */
class ReuseKey extends Step {
  protected override readonly requires: Requirement = 'confirmation';
  constructor(
    private readonly pick: number,
    private readonly otherAction: boolean,
  ) {
    super();
  }
  protected async act(model: Model, api: InvoiceApi) {
    const original =
      model.confirmations[this.pick % model.confirmations.length];
    if (!original)
      throw new Error('The fuzz precondition admitted no command.');
    const { record, command } = confirmedCommand(model, original);
    const action: Action = !this.otherAction
      ? original.action
      : original.action === 'WITHDRAW_ENTRY'
        ? 'CORRECT'
        : 'WITHDRAW_ENTRY';
    const changed = command(action);
    const request: Request = {
      member: original.member,
      company: original.company,
      command: changed,
      path: pathOf(changed),
      body: bodyOf(changed),
      key: original.key,
      prediction: authority(
        model,
        original.member,
        original.company,
        changed,
      ) ?? { kind: 'conflict', invariant: 'replay-receipt' },
    };
    const reply = await send(api, request);
    await settle({
      model,
      api,
      request,
      reply,
      prediction: request.prediction,
    });
    return { touched: [record], events: [] };
  }
  toString() {
    return `reuse-key(#${this.pick}${this.otherAction ? ' other-action' : ''})`;
  }
}

/** Reads a Record's detail, history and source PDF. */
class ReadRecord extends Step {
  protected override readonly requires: Requirement = 'record';
  constructor(
    private readonly member: MemberKey,
    private readonly target: RecordTarget,
  ) {
    super();
  }
  protected async act(model: Model, api: InvoiceApi) {
    const record = pickRecord(model, this.member, this.target);
    const company = model.context[this.member];
    const read = (path: string) => () =>
      api.send(this.member, path, { company });
    const paths = (id: string) => ({
      detail: `/invoice-records/${id}`,
      history: `/invoice-records/${id}/history`,
      source: `/invoice-records/${id}/source`,
    });
    const own = paths(record.id);
    const missing = paths(MISSING_ID);
    const what = `${this.member} reading Record ${record.id} of Company ${record.company} from Company ${company}`;
    if (!canRead(model, this.member, company) || record.company !== company) {
      const readable = canRead(model, this.member, company);
      for (const part of ['detail', 'history', 'source'] as const)
        await expectDenial({
          reply: await read(own[part])(),
          status: readable ? 404 : 403,
          invariant: readable
            ? 'company-isolation'
            : denialInvariant(model, this.member, company, [
                'reader',
                'recorder',
              ]),
          what: `${what} (${part})`,
          twin: read(missing[part]),
        });
      return NOTHING;
    }
    const detail = await read(own.detail)();
    if (detail.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: expected 200, got ${short(detail)}`,
      );
    const body = object(detail.body, `${what}'s detail`);
    expectSummary({
      model,
      api,
      value: body.record,
      company,
      where: `${this.member}'s detail`,
    });
    // Capabilities and the live source follow the current captures (§6).
    const recorded = record.entryState === 'RECORDED';
    const family = canReachSource(model, this.member, company);
    const capabilities = {
      canCorrect: recorded && canRecord(model, this.member, company) && family,
      canWithdraw: recorded && canRecord(model, this.member, company),
    };
    if (canonical(body.capabilities) !== canonical(capabilities))
      throw new InvariantViolation(
        'model-agreement',
        `${what}: capabilities ${canonical(body.capabilities)}, expected ${canonical(capabilities)}`,
      );
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
          record.source.tuple.documentId,
          record.source.tuple.documentVersionId,
          record.source.tuple.representationId,
        ])
      : canonical({ kind: 'UNAVAILABLE' });
    if (shown !== expected)
      throw new InvariantViolation(
        live.kind === 'AVAILABLE' && !family
          ? denialInvariant(model, this.member, company, ['external'])
          : 'model-agreement',
        `${what}: the live source is ${shown}, expected ${expected}`,
      );
    const history = await readHistory(api, this.member, company, record.id);
    if (history.first.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: the history answered ${short(history.first)}`,
      );
    expectFacts({
      model,
      api,
      record,
      items: history.items,
      headRevision: history.headRevision,
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
          : denialInvariant(model, this.member, company, ['external']),
        `${what}: the source PDF answered ${pdf.status}, expected ${family ? '200 with a PDF' : 'a refusal'}`,
      );
    return NOTHING;
  }
  toString() {
    return `read(${this.member} ${aim(this.target, 'record')})`;
  }
}

class ListInventory extends Step {
  constructor(private readonly member: MemberKey) {
    super();
  }
  protected async act(model: Model, api: InvoiceApi) {
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
        ]),
        what,
      });
      return NOTHING;
    }
    if (inventory.first.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
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

function canSelectSources(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
) {
  return (
    canRecord(model, member, company) && canReachSource(model, member, company)
  );
}

/** The source selector lists exactly the Company's eligible tuples (§8.1). */
class ListSources extends Step {
  constructor(private readonly member: MemberKey) {
    super();
  }
  protected async act(model: Model, api: InvoiceApi) {
    const company = model.context[this.member];
    const reply = await api.send(this.member, '/invoice-records/sources', {
      company,
    });
    const what = `${this.member} listing the sources of Company ${company}`;
    if (!canSelectSources(model, this.member, company)) {
      await expectDenial({
        reply,
        status: 403,
        invariant: denialInvariant(model, this.member, company, [
          'recorder',
          'external',
        ]),
        what,
      });
      return NOTHING;
    }
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: expected 200, got ${short(reply)}`,
      );
    const page = object(reply.body, `${what}'s page`);
    const seen = list(page.items, `${what}'s items`)
      .map((item) => canonical(object(item, `${what}'s item`).source))
      .sort();
    const expected = api.world.sources[company]
      .filter((source) => source.state !== 'draft')
      .map((source) => canonical(source.tuple))
      .sort();
    if (canonical(seen) !== canonical(expected)) {
      const foreign = api.world.sources[otherCompany(company)].some((source) =>
        seen.includes(canonical(source.tuple)),
      );
      throw new InvariantViolation(
        foreign ? 'company-isolation' : 'model-agreement',
        `${what}: lists ${seen.length} sources, expected ${expected.length}`,
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
  protected async act(model: Model, api: InvoiceApi) {
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
  protected async act(model: Model, api: InvoiceApi) {
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
  protected async act(model: Model, api: InvoiceApi) {
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
        path: '/invoice-records',
        allowed: canRead(model, this.member, this.company),
        bundles: ['reader', 'recorder'] as const,
      },
      {
        path: '/invoice-records/sources',
        allowed: canSelectSources(model, this.member, this.company),
        bundles: ['recorder', 'external'] as const,
      },
    ];
    for (const probe of probes) {
      const next = await api.send(this.member, probe.path, {
        company: this.company,
      });
      if (next.status !== (probe.allowed ? 200 : 403))
        throw new InvariantViolation(
          probe.allowed
            ? 'model-agreement'
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
  // Commands come mostly from the members whose initial grants let them
  // commit, so that Records accumulate revisions, withdrawals and chains.
  const recorder: fc.Arbitrary<MemberKey> = fc.oneof(
    { arbitrary: fc.constant('ana' as const), weight: 3 },
    { arbitrary: fc.constant('bogdan' as const), weight: 2 },
    { arbitrary: fc.constant('cora' as const), weight: 1 },
  );
  const company = fc.constantFrom(...COMPANIES);
  const bundle = fc.constantFrom(...BUNDLES);
  const pick = fc.nat({ max: 7 });
  const oneIn = (n: number) => fc.nat({ max: n - 1 }).map((roll) => roll === 0);
  // One step in four aims at the other Company, three Record steps in four
  // prefer a RECORDED entry, one source in seven is the draft, one change in
  // four observed a stale revision and one command in four reuses a key
  // that a refused command left free.
  const source: fc.Arbitrary<Target> = fc.record({
    index: fc.nat({ max: 6 }),
    foreign: oneIn(4),
  });
  const record: fc.Arbitrary<RecordTarget> = fc.record({
    index: pick,
    foreign: oneIn(4),
    live: oneIn(4).map((roll) => !roll),
  });
  const keyPick: fc.Arbitrary<number | null> = fc.oneof(
    { arbitrary: fc.constant(null), weight: 3 },
    { arbitrary: pick, weight: 1 },
  );
  const values = fc.nat({ max: VALUES.length - 1 });
  const reason = fc.nat({ max: REASONS.length - 1 });
  const predecessor: fc.Arbitrary<PredecessorChoice> = fc.oneof(
    { arbitrary: fc.constant({ kind: 'none' } as const), weight: 4 },
    { arbitrary: fc.constant({ kind: 'latest' } as const), weight: 3 },
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
        action: fc.constant('CORRECT' as const),
        values,
        reason,
      }),
      weight: 3,
    },
    {
      arbitrary: fc.record({
        action: fc.constant('WITHDRAW_ENTRY' as const),
        reason,
      }),
      weight: 1,
    },
  );
  const weighted: Array<[number, fc.Arbitrary<FuzzCommand>]> = [
    [
      5,
      fc
        .tuple(recorder, source, predecessor, values, keyPick)
        .map((args) => new CreateRecord(...args)),
    ],
    [
      7,
      fc
        .tuple(recorder, record, change, oneIn(4), keyPick)
        .map((args) => new ChangeRecord(...args)),
    ],
    [2, fc.tuple(member, record).map((args) => new ReadRecord(...args))],
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
    [2, fc.tuple(pick, fc.boolean()).map((args) => new ReuseKey(...args))],
    [
      1,
      fc
        .tuple(recorder, recorder, record, fc.tuple(change, change))
        .map((args) => new ConcurrentChanges(...args)),
    ],
    [
      1,
      fc
        .tuple(recorder, recorder, source, predecessor, values)
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
