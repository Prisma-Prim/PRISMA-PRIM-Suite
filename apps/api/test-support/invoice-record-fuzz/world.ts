import { randomUUID } from 'node:crypto';
import {
  fictionalInvoiceValues,
  prepareAdditionalInvoiceRecordSource,
  prepareInvoiceRecordSource,
  type InvoiceRecordProofFixture,
} from '../../src/invoice-record/invoice-record.proof-support.js';
import {
  ESTIMATE_OFFER_DIRECTOR,
  ESTIMATE_OFFER_OWNER,
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  ESTIMATE_OFFER_WORKSPACE,
  responseRecord,
  responseString,
} from '../../src/offer/offer-estimate-preparation.test-support.js';
import {
  canonical,
  InvariantViolation as ModelInvariantViolation,
  readReply,
  short,
  type Reply,
} from '../model-fuzz/checks.js';

/**
 * The invariants checked after every fuzz step, each with its authority:
 * PRD release-5-external-invoice-record §6 (captured bundles and action
 * matrix), §8 (commands, receipts and replay) and §9 (reads, history and
 * atomicity). REST answers and the Record's own history prove them. The
 * restricted `invoice_record.*` events have no public read (§9), so the
 * fuzzer reads their table, and the command receipts', without writing.
 */
export const INVARIANTS = {
  'company-isolation':
    'A request reads no Record, inventory entry, source or event of a Company other than the one it selected, and an actor without a grant in a Company reads nothing of it (AGENTS.md Workspace and Company isolation; ADR 0006; PRD release-5-external-invoice-record §6, §9).',
  'identical-denial':
    'A foreign or hidden Record gets the same safe not-found as a missing one (ADR 0006; PRD release-5-external-invoice-record §8.3).',
  'revocation-denies':
    "After a revocation, the member's next request relying on the revoked capture is refused, with no effect (AGENTS.md Authorization; PRD release-5-external-invoice-record §6, §9).",
  'history-once':
    'Each successful command adds exactly one revision, one receipt and one restricted event; a refusal, a no-op, a stale revision or a replay adds none (AGENTS.md Activity Log; PRD release-5-external-invoice-record §8.3, §9).',
  'revisions-grow':
    'Revisions never decrease (PRD release-5-external-invoice-record §7, §9).',
  'single-active-entry':
    'At most one RECORDED entry names a given financial Document, whatever the key (PRD release-5-external-invoice-record §8.1).',
  'replacement-chain':
    'A replacement names only a withdrawn same-Company predecessor, which has at most one direct replacement (PRD release-5-external-invoice-record §8.1).',
  'stale-or-no-op-refused':
    'A stale expectedRevision or a no-op CORRECT is refused with no effect (PRD release-5-external-invoice-record §8.2).',
  'withdrawal-terminal':
    'A withdrawn entry refuses further CORRECT and WITHDRAW_ENTRY (PRD release-5-external-invoice-record §7, §8.2).',
  'replay-receipt':
    'The exact replay of a committed key returns the same receipt; the same key with a different intent conflicts (PRD release-5-external-invoice-record §8.3).',
  'inventory-order':
    'The inventory lists RECORDED and WITHDRAWN entries by creation instant then Record id, newest first (PRD release-5-external-invoice-record §9).',
  'model-agreement':
    'Every other answer is the outcome the PRD predicts (PRD release-5-external-invoice-record §6-§9).',
} as const;
export type Invariant = keyof typeof INVARIANTS;

export class InvariantViolation extends ModelInvariantViolation<Invariant> {}

export const COMPANIES = ['A', 'B'] as const;
export type CompanyKey = (typeof COMPANIES)[number];
/** `ana` prepared both Companies' sources; the others hold equal native grants. */
export const MEMBERS = ['ana', 'bogdan', 'cora'] as const;
export type MemberKey = (typeof MEMBERS)[number];
/** The three fuzzed Invoice bundles; every native grant stays constant. */
export const BUNDLES = ['reader', 'recorder', 'external'] as const;
export type Bundle = (typeof BUNDLES)[number];
/** `owner` administers grants and audits, with permanent Reader in both. */
export type Actor = MemberKey | 'owner';

const HEADERS: Record<Actor, Readonly<Record<string, string>>> = {
  ana: ESTIMATE_OFFER_PREPARER,
  bogdan: ESTIMATE_OFFER_DIRECTOR,
  cora: ESTIMATE_OFFER_READER,
  owner: ESTIMATE_OFFER_OWNER,
};
const BUNDLE_NOUNS: Record<Bundle, string> = {
  reader: 'company-invoice-reader',
  recorder: 'company-invoice-recorder',
  external: 'company-external-invoice-access',
};
/** Each run starts from these grants; every other fuzzed grant is revoked. */
const INITIAL_GRANTS: Record<
  MemberKey,
  Record<CompanyKey, readonly Bundle[]>
> = {
  ana: { A: ['recorder', 'external'], B: ['recorder', 'external'] },
  bogdan: { A: ['recorder', 'external'], B: ['recorder'] },
  cora: { A: ['reader'], B: ['reader', 'external'] },
};
const INITIAL_CONTEXT: Record<MemberKey, CompanyKey> = {
  ana: 'A',
  bogdan: 'A',
  cora: 'B',
};
/**
 * The native grants that let a member qualify a source (§4, §6), granted
 * once to `bogdan` and `cora`; `ana` holds them from the preparation.
 */
const NATIVE_SOURCE_GRANTS = [
  '/company-director-client-assignments',
  '/company-document-registrar-assignments',
  '/company-document-content-reader-assignments',
  '/company-contract-approver-assignments',
] as const;
/** A UUID no record ever has: the twin of every hidden target. */
export const MISSING_ID = '00000000-0000-4000-8000-00000000f211';

export interface Values {
  externalSystem: string;
  externalNumber: string;
  issuedOn: string;
  dueOn: string | null;
  currency: string;
  grossMinor: string;
  netMinor: string | null;
  taxMinor: string | null;
}
/** Few transcriptions, so that corrections often repeat the current one. */
export const VALUES: readonly Values[] = [
  fictionalInvoiceValues(),
  {
    ...fictionalInvoiceValues(),
    externalNumber: 'SYN-INV-002',
    dueOn: '2026-02-14',
    grossMinor: '125550',
    netMinor: '100000',
    taxMinor: '25550',
  },
  {
    ...fictionalInvoiceValues(),
    externalSystem: '  Fictional ledger 😀 DEMO  ',
    currency: 'EUR',
    grossMinor: '99999999999999',
    netMinor: '0',
    taxMinor: null,
  },
];
export const REASONS = [
  'Fictional transcription review DEMO',
  '  Revue fictive 😀 DEMO  ',
] as const;

export type EntryState = 'RECORDED' | 'WITHDRAWN';
export type Action = 'CREATE' | 'CORRECT' | 'WITHDRAW_ENTRY';
export interface Snapshot {
  entryState: EntryState;
  values: Values;
}

/** One prepared exact source tuple of a Company's financial Documents. */
export interface SourceModel {
  name: string;
  company: CompanyKey;
  documentId: string;
  tuple: {
    documentId: string;
    documentVersionId: string;
    representationId: string;
  };
  state: 'superseded' | 'official' | 'draft';
  /** The copied context its selection lists; none for a draft. */
  copiedContext: string | null;
}

export interface Fact {
  action: Action;
  member: MemberKey;
  key: string;
  before: Snapshot | null;
  after: Snapshot;
  reason: string | null;
  commandId: string;
  recordedAt: string;
}

export interface RecordModel {
  id: string;
  company: CompanyKey;
  source: SourceModel;
  revision: number;
  entryState: EntryState;
  values: Values;
  replaces: string | null;
  replacement: string | null;
  createdAt: string;
  /** One per revision, oldest first. */
  facts: Fact[];
}

/** A committed command, kept to replay its exact request later. */
export interface Confirmation {
  member: MemberKey;
  company: CompanyKey;
  action: Action;
  path: string;
  body: Record<string, unknown>;
  key: string;
  recordId: string;
  receipt: string;
}

type GrantState = 'active' | 'absent' | 'revoked';

export interface Model {
  grants: Map<string, GrantState>;
  /** The Company each member's requests currently select. */
  context: Record<MemberKey, CompanyKey>;
  /** Every Record, in creation order. */
  records: RecordModel[];
  confirmations: Confirmation[];
  /** Keys a refused command did not reserve, free for a later command. */
  refused: Array<{ member: MemberKey; key: string }>;
  /** The highest revision any fresh read or receipt showed per Record. */
  revisions: Map<string, number>;
  /** Generic Activity Log event ids already seen. */
  events: Set<string>;
}

export interface ExpectedEvent {
  action: string;
  company: CompanyKey;
  member: MemberKey;
}

export interface StepOutcome {
  touched: RecordModel[];
  events: ExpectedEvent[];
}

/** The prepared Workspace, shared by every run of a test file. */
export interface InvoiceWorld {
  fixture: InvoiceRecordProofFixture;
  companyIds: Readonly<Record<CompanyKey, string>>;
  membershipIds: Readonly<Record<Actor, string>>;
  sources: Readonly<Record<CompanyKey, readonly SourceModel[]>>;
}

export class InvoiceApi {
  private keys = 0;
  constructor(readonly world: InvoiceWorld) {}

  /** Deterministic keys: each run starts from emptied Invoice tables. */
  nextKey() {
    this.keys += 1;
    return `fuzz-${this.keys}`;
  }

  get companyIds() {
    return this.world.companyIds;
  }

  get membershipIds() {
    return this.world.membershipIds;
  }

  async send(
    actor: Actor,
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE';
      body?: unknown;
      company?: CompanyKey;
      key?: string;
    } = {},
  ): Promise<Reply> {
    const headers: Record<string, string> = {};
    if (options.body !== undefined)
      headers['content-type'] = 'application/json';
    if (options.key !== undefined) headers['idempotency-key'] = options.key;
    const response = await this.world.fixture.request({
      path,
      companyId:
        options.company === undefined
          ? undefined
          : this.world.companyIds[options.company],
      headers: HEADERS[actor],
      init: {
        method: options.method ?? 'GET',
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      },
    });
    return readReply(response);
  }

  companyOf(companyId: unknown): CompanyKey | undefined {
    return COMPANIES.find((company) => this.companyIds[company] === companyId);
  }

  memberOf(membershipId: unknown): MemberKey | undefined {
    return MEMBERS.find(
      (member) => this.membershipIds[member] === membershipId,
    );
  }
}

export function grantKey(
  member: MemberKey,
  company: CompanyKey,
  bundle: Bundle,
) {
  return `${member}/${company}/${bundle}`;
}

function grantState(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
  bundle: Bundle,
): GrantState {
  return model.grants.get(grantKey(member, company, bundle)) ?? 'absent';
}

export function granted(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
  bundle: Bundle,
) {
  return grantState(model, member, company, bundle) === 'active';
}

/** Read copied Records, the inventory and history: Reader or Recorder (§6). */
export function canRead(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
) {
  return (
    granted(model, member, company, 'reader') ||
    granted(model, member, company, 'recorder')
  );
}

/** Any command, and WITHDRAW_ENTRY alone: Recorder (§6). */
export function canRecord(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
) {
  return granted(model, member, company, 'recorder');
}

/** The financial Document family gate (§6). */
export function canReachSource(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
) {
  return granted(model, member, company, 'external');
}

/** The invariant a wrongly admitted request breaks. */
export function denialInvariant(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
  bundles: readonly Bundle[],
): Invariant {
  return bundles.some(
    (bundle) => grantState(model, member, company, bundle) === 'revoked',
  )
    ? 'revocation-denies'
    : 'company-isolation';
}

export function setGrant(
  model: Model,
  member: MemberKey,
  company: CompanyKey,
  bundle: Bundle,
  state: 'active' | 'revoked',
) {
  model.grants.set(grantKey(member, company, bundle), state);
}

export function bundleAssignments(bundle: Bundle) {
  return `/${BUNDLE_NOUNS[bundle]}-assignments`;
}

/** The bundle's event action (PRD tenant-company-client-authorization §8). */
export function assignmentAction(
  bundle: Bundle,
  operation: 'granted' | 'revoked',
) {
  return `${BUNDLE_NOUNS[bundle].replaceAll('-', '_')}_assignment.${operation}`;
}

export function eventAction(action: Action) {
  switch (action) {
    case 'CREATE':
      return 'invoice_record.created';
    case 'CORRECT':
      return 'invoice_record.transcription.corrected';
    case 'WITHDRAW_ENTRY':
      return 'invoice_record.entry.withdrawn';
  }
}

export function object(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new InvariantViolation(
      'model-agreement',
      `${what} is no object: ${canonical(value)}`,
    );
  return Object.fromEntries(Object.entries(value));
}

export function list(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value))
    throw new InvariantViolation(
      'model-agreement',
      `${what} is no list: ${canonical(value)}`,
    );
  return value;
}

export function text(value: unknown, what: string): string {
  if (typeof value !== 'string')
    throw new InvariantViolation(
      'model-agreement',
      `${what} is no string: ${canonical(value)}`,
    );
  return value;
}

export function integer(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new InvariantViolation(
      'model-agreement',
      `${what} is no integer: ${canonical(value)}`,
    );
  return value;
}

export function observeRevision(
  model: Model,
  recordId: string,
  revision: number,
  where: string,
) {
  const highest = model.revisions.get(recordId) ?? 0;
  if (revision < highest)
    throw new InvariantViolation(
      'revisions-grow',
      `${where} shows Record ${recordId} at revision ${revision} after revision ${highest}`,
    );
  model.revisions.set(recordId, revision);
}

/**
 * The model's Records of a Company in inventory order: creation instant,
 * then Record id, both descending. The ISO instants and lowercase UUIDs
 * compare by code unit as PostgreSQL compares the timestamps and UUIDs.
 */
export function inventoryOrder(model: Readonly<Model>, company: CompanyKey) {
  const key = (record: RecordModel) => `${record.createdAt}/${record.id}`;
  return model.records
    .filter((record) => record.company === company)
    .sort((left, right) =>
      key(left) === key(right) ? 0 : key(left) < key(right) ? 1 : -1,
    );
}

/** Compares one fresh Record summary with the model, in the Company read. */
export function expectSummary(input: {
  model: Model;
  api: InvoiceApi;
  value: unknown;
  company: CompanyKey;
  where: string;
}): RecordModel {
  const { model, company, where } = input;
  const summary = object(input.value, `${where}'s Record`);
  const id = text(summary.id, `${where}'s Record id`);
  const record = model.records.find((candidate) => candidate.id === id);
  if (!record || record.company !== company)
    throw new InvariantViolation(
      'company-isolation',
      `${where} in Company ${company} shows Record ${id} of ${record ? `Company ${record.company}` : 'no known Company'}`,
    );
  const revision = integer(summary.revision, `${where}'s revision`);
  observeRevision(model, id, revision, where);
  if (revision !== record.revision)
    throw new InvariantViolation(
      'history-once',
      `${where} shows Record ${id} at revision ${revision}; its successful commands make ${record.revision}`,
    );
  if (
    summary.replacesWithdrawnRecordId !== record.replaces ||
    summary.replacementRecordId !== record.replacement
  )
    throw new InvariantViolation(
      'replacement-chain',
      `${where} shows Record ${id} replacing ${canonical(summary.replacesWithdrawnRecordId)} and replaced by ${canonical(summary.replacementRecordId)}; expected ${record.replaces ?? 'none'} and ${record.replacement ?? 'none'}`,
    );
  const expected = {
    entryState: record.entryState,
    values: record.values,
    createdAt: record.createdAt,
    copiedContext: record.source.copiedContext,
  };
  const seen = {
    entryState: summary.entryState,
    values: summary.values,
    createdAt: summary.createdAt,
    copiedContext: canonical(summary.copiedContext),
  };
  if (canonical(seen) !== canonical(expected))
    throw new InvariantViolation(
      'model-agreement',
      `${where} shows Record ${id} as ${canonical(seen)}; expected ${canonical(expected)}`,
    );
  return record;
}

/** Reads every page of a Company's inventory. */
export async function readInventory(
  api: InvoiceApi,
  actor: Actor,
  company: CompanyKey,
): Promise<{ first: Reply; items: unknown[] }> {
  const items: unknown[] = [];
  let cursor: string | null = null;
  let first: Reply | undefined;
  do {
    const reply = await api.send(
      actor,
      '/invoice-records' +
        (cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`),
      { company },
    );
    if (!first) first = reply;
    if (reply.status !== 200) {
      if (reply === first) return { first, items };
      throw new InvariantViolation(
        'model-agreement',
        `a later inventory page in Company ${company} failed: ${short(reply)}`,
      );
    }
    const page = object(reply.body, 'an inventory page');
    if (page.companyId !== api.companyIds[company])
      throw new InvariantViolation(
        'company-isolation',
        `an inventory read in Company ${company} answers for ${api.companyOf(page.companyId) ?? canonical(page.companyId)}`,
      );
    items.push(...list(page.items, 'an inventory page'));
    cursor =
      page.nextCursor === null
        ? null
        : text(page.nextCursor, 'an inventory cursor');
  } while (cursor !== null);
  return { first, items };
}

/**
 * A granted reader's inventory is exactly the Company's Records, RECORDED
 * and WITHDRAWN, newest first, with no Document twice RECORDED and every
 * replacement naming its own withdrawn predecessor once.
 */
export function expectInventory(input: {
  model: Model;
  api: InvoiceApi;
  company: CompanyKey;
  items: unknown[];
  who: string;
}) {
  const where = `${input.who}'s inventory`;
  const records = input.items.map((value) =>
    expectSummary({ ...input, value, where }),
  );
  const recorded = new Set<string>();
  const predecessors = new Set<string>();
  for (const record of records) {
    if (record.entryState === 'RECORDED') {
      if (recorded.has(record.source.documentId))
        throw new InvariantViolation(
          'single-active-entry',
          `${where} in Company ${input.company} holds two RECORDED entries of Document ${record.source.name}`,
        );
      recorded.add(record.source.documentId);
    }
    if (record.replaces !== null) {
      const predecessor = records.find(
        (candidate) => candidate.id === record.replaces,
      );
      if (
        !predecessor ||
        predecessor.entryState !== 'WITHDRAWN' ||
        predecessors.has(predecessor.id)
      )
        throw new InvariantViolation(
          'replacement-chain',
          `${where} in Company ${input.company} shows Record ${record.id} replacing ${record.replaces}, which is no withdrawn same-Company entry of one replacement`,
        );
      predecessors.add(predecessor.id);
    }
  }
  const seen = records.map((record) => record.id);
  const expected = inventoryOrder(input.model, input.company).map(
    (record) => record.id,
  );
  if (canonical(seen) === canonical(expected)) return;
  throw new InvariantViolation(
    canonical([...seen].sort()) === canonical([...expected].sort())
      ? 'inventory-order'
      : 'model-agreement',
    `${where} in Company ${input.company} lists [${seen.join(', ')}], expected [${expected.join(', ')}]`,
  );
}

/** Reads every page of a Record's history. */
export async function readHistory(
  api: InvoiceApi,
  actor: Actor,
  company: CompanyKey,
  recordId: string,
): Promise<{ first: Reply; items: unknown[]; headRevision: number | null }> {
  const items: unknown[] = [];
  let cursor: string | null = null;
  let first: Reply | undefined;
  let headRevision: number | null = null;
  do {
    const reply = await api.send(
      actor,
      `/invoice-records/${recordId}/history` +
        (cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`),
      { company },
    );
    if (!first) first = reply;
    if (reply.status !== 200) {
      if (reply === first) return { first, items, headRevision };
      throw new InvariantViolation(
        'model-agreement',
        `a later history page of Record ${recordId} failed: ${short(reply)}`,
      );
    }
    const page = object(reply.body, 'a history page');
    if (
      page.companyId !== api.companyIds[company] ||
      page.recordId !== recordId
    )
      throw new InvariantViolation(
        'company-isolation',
        `a history read of Record ${recordId} in Company ${company} answers for ${canonical(page.recordId)} in ${api.companyOf(page.companyId) ?? canonical(page.companyId)}`,
      );
    headRevision = integer(page.headRevision, 'a history head');
    items.push(...list(page.items, 'a history page'));
    cursor =
      page.nextCursor === null
        ? null
        : text(page.nextCursor, 'a history cursor');
  } while (cursor !== null);
  return { first, items, headRevision };
}

/**
 * A Record's complete history is one fact per successful command, newest
 * first, each with its receipt's command and instant, its actor, its exact
 * before and after snapshots and its reason.
 */
export function expectFacts(input: {
  model: Model;
  api: InvoiceApi;
  record: RecordModel;
  items: unknown[];
  headRevision: number | null;
  where: string;
}) {
  const { model, api, record, where } = input;
  if (input.headRevision !== null)
    observeRevision(model, record.id, input.headRevision, where);
  const seen = input.items.map((value) => {
    const fact = object(value, `${where}'s fact`);
    if (fact.recordId !== record.id)
      throw new InvariantViolation(
        'company-isolation',
        `${where} of Record ${record.id} holds a fact of ${canonical(fact.recordId)}`,
      );
    const revision = integer(fact.revision, `${where}'s fact revision`);
    const actor = object(fact.actor, `${where}'s fact actor`);
    return {
      format: fact.format,
      revision,
      action: fact.action,
      commandId: fact.commandId,
      member: api.memberOf(actor.membershipId) ?? canonical(actor),
      recordedAt: fact.recordedAt,
      before: fact.before,
      after: fact.after,
      reason: fact.reason,
    };
  });
  const expected = record.facts
    .map((fact, index) => ({
      format: 'EXTERNAL_INVOICE_REVISION/1',
      revision: index + 1,
      action: fact.action,
      commandId: fact.commandId,
      member: fact.member,
      recordedAt: fact.recordedAt,
      before: fact.before,
      after: fact.after,
      reason: fact.reason,
    }))
    .reverse();
  if (
    input.headRevision !== record.revision ||
    seen.map((fact) => fact.revision).join() !==
      expected.map((fact) => fact.revision).join()
  )
    throw new InvariantViolation(
      'history-once',
      `${where} of Record ${record.id} has head ${input.headRevision ?? '-'} and revisions [${seen.map((fact) => fact.revision).join(' ')}]; its successful commands make [${expected.map((fact) => fact.revision).join(' ')}]`,
    );
  if (canonical(seen) !== canonical(expected))
    throw new InvariantViolation(
      'model-agreement',
      `${where} of Record ${record.id} is ${canonical(seen)}; expected ${canonical(expected)}`,
    );
}

async function expectHistory(
  model: Model,
  api: InvoiceApi,
  record: RecordModel,
) {
  const history = await readHistory(api, 'owner', record.company, record.id);
  if (history.first.status !== 200)
    throw new InvariantViolation(
      'model-agreement',
      `the auditor cannot read the history of Record ${record.id}: ${short(history.first)}`,
    );
  expectFacts({
    model,
    api,
    record,
    items: history.items,
    headRevision: history.headRevision,
    where: 'the auditor history',
  });
}

/**
 * The restricted events and command receipts are exactly one per
 * successful command: none for a refusal, a no-op, a stale revision or a
 * replay, and no key reserved by a refused command.
 */
async function expectRestrictedEffects(model: Model, api: InvoiceApi) {
  const read = async (sql: string) => {
    const result = await api.world.fixture.pool.query<{ entries: unknown }>(
      sql,
    );
    return canonical(result.rows[0]?.entries ?? null);
  };
  const facts = model.records.flatMap((record) =>
    record.facts.map((fact, index) => ({ record, fact, revision: index + 1 })),
  );
  // PostgreSQL orders UUIDs as their lowercase text by code unit.
  const ordered = facts.sort((left, right) =>
    left.record.id === right.record.id
      ? left.revision - right.revision
      : left.record.id < right.record.id
        ? -1
        : 1,
  );
  const events = await read(
    `SELECT coalesce(jsonb_agg(jsonb_build_array(company_id, record_id, revision, action, actor_membership_id) ORDER BY record_id, revision), '[]'::jsonb) AS entries FROM invoice_record_events`,
  );
  const expectedEvents = canonical(
    ordered.map(({ record, fact, revision }) => [
      api.companyIds[record.company],
      record.id,
      revision,
      eventAction(fact.action),
      api.membershipIds[fact.member],
    ]),
  );
  if (events !== expectedEvents)
    throw new InvariantViolation(
      'history-once',
      `the restricted Invoice Record events are ${events}; the successful commands make ${expectedEvents}`,
    );
  const commands = await read(
    `SELECT coalesce(jsonb_agg(jsonb_build_array(actor_membership_id, idempotency_key, record_id, revision, id) ORDER BY record_id, revision), '[]'::jsonb) AS entries FROM invoice_record_commands`,
  );
  const expectedCommands = canonical(
    ordered.map(({ record, fact, revision }) => [
      api.membershipIds[fact.member],
      fact.key,
      record.id,
      revision,
      fact.commandId,
    ]),
  );
  if (commands !== expectedCommands)
    throw new InvariantViolation(
      'history-once',
      `the committed Invoice Record commands are ${commands}; the successful commands make ${expectedCommands}`,
    );
}

interface GenericEvent {
  id: string;
  action: string;
  companyId: unknown;
  membershipId: unknown;
}

async function genericActivity(api: InvoiceApi): Promise<GenericEvent[]> {
  const reply = await api.send('owner', '/activity-log');
  if (reply.status !== 200)
    throw new InvariantViolation(
      'model-agreement',
      `the owner cannot read the Activity Log: ${short(reply)}`,
    );
  const page = object(reply.body, 'the Activity Log');
  return list(page.events, 'the Activity Log').map((value) => {
    const event = object(value, 'an Activity Log event');
    const target = object(event.target, 'an Activity Log target');
    const action = text(event.action, 'an Activity Log action');
    if (action.startsWith('invoice_record'))
      throw new InvariantViolation(
        'company-isolation',
        `the generic Activity Log shows the restricted event ${action}`,
      );
    return {
      id: text(event.id, 'an Activity Log id'),
      action,
      companyId: target.companyId,
      membershipId: target.workspaceMembershipId,
    };
  });
}

/**
 * The generic Activity Log events written since the last step are exactly
 * one per actual grant or revocation; Invoice Record commands, reads,
 * no-ops, replays and denials write none there (§9).
 */
async function expectActivity(
  model: Model,
  api: InvoiceApi,
  expected: ExpectedEvent[],
) {
  const fresh = (await genericActivity(api)).filter(
    (event) => !model.events.has(event.id),
  );
  for (const event of fresh) model.events.add(event.id);
  const seen = fresh
    .map(
      (event) =>
        `${event.action} ${api.companyOf(event.companyId) ?? '-'} ${api.memberOf(event.membershipId) ?? '-'}`,
    )
    .sort();
  const wanted = expected
    .map((event) => `${event.action} ${event.company} ${event.member}`)
    .sort();
  if (canonical(seen) !== canonical(wanted))
    throw new InvariantViolation(
      'history-once',
      `the generic Activity Log gained [${seen.join('; ')}], expected [${wanted.join('; ')}]`,
    );
}

/** The checks run after every step. */
export async function checkStep(
  model: Model,
  api: InvoiceApi,
  outcome: StepOutcome,
) {
  await expectActivity(model, api, outcome.events);
  await expectRestrictedEffects(model, api);
  for (const company of COMPANIES) {
    const inventory = await readInventory(api, 'owner', company);
    if (inventory.first.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `the auditor cannot list Company ${company}: ${short(inventory.first)}`,
      );
    expectInventory({
      model,
      api,
      company,
      items: inventory.items,
      who: 'the auditor',
    });
  }
  for (const record of new Set(outcome.touched))
    await expectHistory(model, api, record);
}

/** After a sequence: every Record's complete history. */
export async function checkEnd(model: Model, api: InvoiceApi) {
  for (const record of model.records) await expectHistory(model, api, record);
}

async function expectStatus(
  response: Response,
  status: number,
  what: string,
): Promise<Record<string, unknown>> {
  const reply = await readReply(response);
  if (reply.status !== status)
    throw new Error(`Fuzz setup ${what} failed: ${short(reply)}`);
  return responseRecord(reply.body);
}

/**
 * Prepares one Company's sources through native commands: Document 1 with a
 * superseded, an official and an uploaded draft Version, and Document 2
 * with one official Version, on the same executed Contract.
 */
async function prepareCompany(
  fixture: InvoiceRecordProofFixture,
  company: CompanyKey,
) {
  const first = await prepareInvoiceRecordSource(fixture, {
    clientTaxId: `FICTIONAL-FUZZ-1211-${company}`,
  });
  const nextVersion = async (expectedRevision: number) =>
    responseString(
      await expectStatus(
        await first.mutate('/versions', { expectedRevision }),
        201,
        'successor Version',
      ),
      'versionId',
    );
  const upload = async (versionId: string, expectedRevision: number) =>
    responseString(
      await expectStatus(
        await first.upload(versionId, expectedRevision, first.bytes),
        201,
        'upload',
      ),
      'representationId',
    );
  const second = await nextVersion(3);
  const secondRepresentation = await upload(second, 4);
  await expectStatus(
    await first.mutate(`/versions/${second}/official-designation`, {
      expectedRevision: 5,
    }),
    200,
    'official designation',
  );
  const draft = await nextVersion(6);
  const draftRepresentation = await upload(draft, 7);
  const other = await prepareAdditionalInvoiceRecordSource(fixture, {
    target: first.target,
    body: first.body,
    title: 'Second fictional external invoice — not a fiscal document',
  });
  const documentId = first.source.documentId;
  const source = (
    index: number,
    state: SourceModel['state'],
    tuple: SourceModel['tuple'],
  ): SourceModel => ({
    name: `${company}${tuple.documentId === documentId ? 1 : 2}.${index}`,
    company,
    documentId: tuple.documentId,
    tuple,
    state,
    copiedContext: null,
  });
  return {
    companyId: first.companyId,
    memberships: {
      ana: first.f.ready.source.preparerMembershipId,
      bogdan: first.f.ready.source.directorMembershipId,
      cora: first.f.ready.source.readerMembershipId,
    },
    // The draft comes last: source picks reach it least often.
    sources: [
      source(1, 'superseded', first.source),
      source(2, 'official', {
        documentId,
        documentVersionId: second,
        representationId: secondRepresentation,
      }),
      source(1, 'official', other.source),
      source(3, 'draft', {
        documentId,
        documentVersionId: draft,
        representationId: draftRepresentation,
      }),
    ],
  };
}

function tupleKey(tuple: SourceModel['tuple']) {
  return `${tuple.documentId}/${tuple.documentVersionId}/${tuple.representationId}`;
}

/**
 * Prepares the Workspace once per test file: two Companies, each with four
 * source tuples; equal native source grants for the three members; the
 * owner's permanent Reader grant in both Companies; and every fuzzed grant
 * issued once, so that each run starts from known assignment history.
 */
export async function openInvoiceWorld(
  fixture: InvoiceRecordProofFixture,
): Promise<InvoiceWorld> {
  const prepared = {
    A: await prepareCompany(fixture, 'A'),
    B: await prepareCompany(fixture, 'B'),
  };
  const owner = responseString(
    responseRecord(await fixture.read({ path: '/access/current-actor' })),
    'workspaceMembershipId',
  );
  const membershipIds = { ...prepared.A.memberships, owner };
  if (canonical(prepared.A.memberships) !== canonical(prepared.B.memberships))
    throw new Error('Fuzz setup found different members per Company.');
  const companyIds = { A: prepared.A.companyId, B: prepared.B.companyId };
  for (const company of COMPANIES) {
    const companyId = companyIds[company];
    for (const member of ['bogdan', 'cora'] as const)
      for (const path of NATIVE_SOURCE_GRANTS)
        await fixture.grant({
          path,
          companyId,
          membershipId: membershipIds[member],
        });
    for (const path of [
      '/company-context-assignments',
      bundleAssignments('reader'),
    ])
      await fixture.grant({ path, companyId, membershipId: owner });
    for (const member of MEMBERS)
      for (const bundle of BUNDLES)
        await fixture.grant({
          path: bundleAssignments(bundle),
          companyId,
          membershipId: membershipIds[member],
        });
  }
  const sources = { A: prepared.A.sources, B: prepared.B.sources };
  for (const company of COMPANIES) {
    const listed = responseRecord(
      await fixture.read({
        path: '/invoice-records/sources',
        companyId: companyIds[company],
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    const items = Array.isArray(listed.items) ? listed.items : [];
    for (const item of items) {
      const selectable = responseRecord(item);
      const key = tupleKey({
        documentId: responseString(
          responseRecord(selectable.source),
          'documentId',
        ),
        documentVersionId: responseString(
          responseRecord(selectable.source),
          'documentVersionId',
        ),
        representationId: responseString(
          responseRecord(selectable.source),
          'representationId',
        ),
      });
      const source = sources[company].find(
        (candidate) => tupleKey(candidate.tuple) === key,
      );
      if (!source || source.state === 'draft')
        throw new Error(`Fuzz setup lists an unexpected source ${key}.`);
      source.copiedContext = canonical(selectable.copiedContext);
    }
    if (items.length !== 3)
      throw new Error(
        `Fuzz setup expected three selectable sources in Company ${company}, got ${items.length}.`,
      );
  }
  return { fixture, companyIds, membershipIds, sources };
}

/**
 * A fresh run on the prepared Workspace: the Invoice Record family's own
 * tables are emptied (no business path deletes their immutable rows), then
 * the fuzzed grants return to their initial state through the public
 * assignment endpoints.
 */
export async function openRun(
  world: InvoiceWorld,
): Promise<{ model: Model; api: InvoiceApi }> {
  const { fixture } = world;
  await fixture.pool.query(
    'TRUNCATE invoice_record_events, invoice_record_history, invoice_record_commands, invoice_records, invoice_record_cursor_keys',
  );
  const active = await fixture.pool.query<{ entries: unknown }>(
    `SELECT coalesce(jsonb_agg(jsonb_build_array(workspace_membership_id, company_id, bundle::text)), '[]'::jsonb) AS entries
     FROM company_role_assignments
     WHERE workspace_id = $1 AND revoked_at IS NULL
       AND bundle::text IN ('company_invoice_reader', 'company_invoice_recorder', 'company_external_invoice_access')`,
    [ESTIMATE_OFFER_WORKSPACE],
  );
  const activeKeys = new Set(
    list(active.rows[0]?.entries, 'the active Invoice grants').map((row) =>
      canonical(row),
    ),
  );
  const model: Model = {
    grants: new Map(),
    context: { ...INITIAL_CONTEXT },
    records: [],
    confirmations: [],
    refused: [],
    revisions: new Map(),
    events: new Set(),
  };
  for (const member of MEMBERS)
    for (const company of COMPANIES)
      for (const bundle of BUNDLES) {
        const wanted = INITIAL_GRANTS[member][company].includes(bundle);
        const isActive = activeKeys.has(
          canonical([
            world.membershipIds[member],
            world.companyIds[company],
            BUNDLE_NOUNS[bundle].replaceAll('-', '_'),
          ]),
        );
        model.grants.set(
          grantKey(member, company, bundle),
          wanted ? 'active' : 'absent',
        );
        if (wanted === isActive) continue;
        const assignments = bundleAssignments(bundle);
        const response = await fixture.request({
          path: wanted
            ? assignments
            : `${assignments}/${world.membershipIds[member]}/${world.companyIds[company]}`,
          init: {
            method: wanted ? 'POST' : 'DELETE',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': randomUUID(),
            },
            body: wanted
              ? JSON.stringify({
                  companyId: world.companyIds[company],
                  workspaceMembershipId: world.membershipIds[member],
                })
              : undefined,
          },
        });
        await expectStatus(response, wanted ? 201 : 200, 'grant reset');
      }
  const api = new InvoiceApi(world);
  for (const event of await genericActivity(api)) model.events.add(event.id);
  return { model, api };
}
