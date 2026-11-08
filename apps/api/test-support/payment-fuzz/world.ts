import { randomUUID } from 'node:crypto';
import {
  paymentNoticePdf,
  paymentRecord,
  paymentText,
  type PaymentEvidenceFixture,
  type PaymentEvidenceIdentity,
} from '../../src/documents/payment-evidence.test-support.js';
import {
  authorSourceJson,
  authorSourceValues,
  prepareAuthorSource,
  prepareAuthorSourceWithDraft,
  type AuthorSourceCompany,
} from '../../src/payment/payment-observation-author-source.test-support.js';
import type {
  PaymentSource,
  PaymentValues,
} from '../../src/payment/payment.input.js';
import {
  canonical,
  InvariantViolation as ModelInvariantViolation,
  readReply,
  short,
  type Reply,
} from '../model-fuzz/checks.js';

/**
 * The invariants checked after every fuzz step, each with its authority:
 * PRD release-5-manual-payment-observation §6 (five captured bundles and the
 * operation matrix), §7 (closed command grammar), §8 (state machine,
 * non-autoconfirmation and replacement), §9 (receipts, history and
 * atomicity) and §10 (reads and privacy). REST answers and the Payment's own
 * history prove them. The restricted `payment.*` events have no public read
 * (§10), so the fuzzer reads their table, and the command receipts', without
 * writing.
 */
export const INVARIANTS = {
  'company-isolation':
    'A request reads no Payment, inventory entry, source or event of a Company other than the one it selected, an actor without a Payment grant in a Company reads nothing of it, and the generic Activity Log never shows a payment.* event (AGENTS.md Workspace and Company isolation; ADR 0006; PRD release-5-manual-payment-observation §6, §10).',
  'identical-denial':
    'A foreign or hidden Payment, source or predecessor gets the same safe answer as a missing one (ADR 0006; PRD release-5-manual-payment-observation §7, §10).',
  'revocation-denies':
    "After a revocation, the member's next request relying on the revoked capture is refused, with no effect (AGENTS.md Authorization; PRD release-5-manual-payment-observation §6, §9).",
  'bundle-matrix':
    'Each command needs its own bundle: CREATE, CORRECT_DRAFT and WITHDRAW_DRAFT Recorder, CONFIRM Confirmer and not Recorder, REVERSE Reverser only; CREATE, CORRECT_DRAFT and CONFIRM also Evidence Access, which alone reads nothing (PRD release-5-manual-payment-observation §6).',
  'independent-author':
    'A member who authored the CREATE or any CORRECT_DRAFT of a Payment never confirms it, even after a later correction by someone else; a member who authored none may (PRD release-5-manual-payment-observation §8).',
  'history-once':
    'Each successful command adds exactly one revision, one receipt and one restricted event; a refusal, a no-op, a stale revision or a replay adds none (AGENTS.md Activity Log; PRD release-5-manual-payment-observation §9, §10).',
  'revisions-grow':
    'Revisions never decrease (PRD release-5-manual-payment-observation §7, §9).',
  'state-machine':
    'Only the §8 transitions happen: CREATE gives DRAFT revision 1, CORRECT_DRAFT keeps DRAFT, WITHDRAW_DRAFT gives WITHDRAWN, CONFIRM gives CONFIRMED and REVERSE gives REVERSED; WITHDRAWN and REVERSED are terminal and nothing confirms itself (PRD release-5-manual-payment-observation §8).',
  'confirmation-kept':
    'A confirmation, once made, stays unchanged through REVERSE (PRD release-5-manual-payment-observation §8, §9).',
  'replacement-chain':
    'A replacement names only a terminal same-Company predecessor, which gets at most one direct replacement, even when two members create it at the same time (PRD release-5-manual-payment-observation §7, §8).',
  'stale-or-no-op-refused':
    'A stale expectedRevision or a CORRECT_DRAFT that changes no value is refused with no effect (PRD release-5-manual-payment-observation §7, §8).',
  'replay-receipt':
    'The exact replay of a committed key returns the same receipt; the same key with another Company, target, input or action conflicts; a refused command reserves no key (PRD release-5-manual-payment-observation §9).',
  'inventory-order':
    'The inventory lists all four states, newest first by creation instant then Payment id (PRD release-5-manual-payment-observation §10).',
  'model-agreement':
    'Every other answer is the outcome the PRD predicts (PRD release-5-manual-payment-observation §6-§10).',
} as const;
export type Invariant = keyof typeof INVARIANTS;

export class InvariantViolation extends ModelInvariantViolation<Invariant> {}

export const COMPANIES = ['A', 'B'] as const;
export type CompanyKey = (typeof COMPANIES)[number];
/**
 * Three distinct Internal Users, so that the independent-author rule always
 * leaves someone to confirm. They hold equal native grants in both
 * Companies; only their five Payment bundles are fuzzed.
 */
export const MEMBERS = ['ana', 'bogdan', 'cora'] as const;
export type MemberKey = (typeof MEMBERS)[number];
/** The five fuzzed Payment bundles (§6). */
export const BUNDLES = [
  'reader',
  'recorder',
  'confirmer',
  'reverser',
  'evidence',
] as const;
export type Bundle = (typeof BUNDLES)[number];
/** The bundles carrying `payment.read` (§6). */
const READ_BUNDLES = ['reader', 'recorder', 'confirmer', 'reverser'] as const;
/**
 * `owner` prepared every source, administers grants and audits, with
 * permanent Payment Reader in both Companies.
 */
export type Actor = MemberKey | 'owner';

/**
 * The fixture's deterministic identities. Their fixture names describe its
 * own proofs, not the grants this fuzz gives them.
 */
const IDENTITIES: Record<Actor, PaymentEvidenceIdentity> = {
  ana: 'reader',
  bogdan: 'confirmer',
  cora: 'reverser',
  owner: 'owner',
};
const BUNDLE_NOUNS: Record<Bundle, string> = {
  reader: 'company-payment-reader',
  recorder: 'company-payment-recorder',
  confirmer: 'company-payment-confirmer',
  reverser: 'company-payment-reverser',
  evidence: 'company-payment-evidence-access',
};
/**
 * Each run starts from these grants; every other fuzzed grant is revoked.
 * In Company A, `ana` records and may try to confirm her own drafts, while
 * `bogdan` confirms and reverses without Recorder. In Company B, `cora`
 * records, `ana` confirms without authoring and `bogdan` reverses with
 * Reverser alone; `cora` only reads in A.
 */
const INITIAL_GRANTS: Record<
  MemberKey,
  Record<CompanyKey, readonly Bundle[]>
> = {
  ana: {
    A: ['recorder', 'confirmer', 'evidence'],
    B: ['confirmer', 'evidence'],
  },
  bogdan: { A: ['confirmer', 'reverser', 'evidence'], B: ['reverser'] },
  cora: { A: ['reader'], B: ['recorder', 'evidence'] },
};
const INITIAL_CONTEXT: Record<MemberKey, CompanyKey> = {
  ana: 'A',
  bogdan: 'A',
  cora: 'B',
};
/** The native grants every member holds in Company B, as in Company A. */
const NATIVE_GRANTS = [
  '/company-context-assignments',
  '/company-director-client-assignments',
  '/company-document-registrar-assignments',
  '/company-document-content-reader-assignments',
] as const;
/** What the owner also needs in Company B to prepare and audit sources. */
const OWNER_GRANTS = [
  '/company-payment-reader-assignments',
  '/company-payment-recorder-assignments',
  '/company-payment-evidence-access-assignments',
  '/company-document-content-uploader-assignments',
  '/company-document-approver-assignments',
] as const;
/** A UUID no record ever has: the twin of every hidden target. */
export const MISSING_ID = '00000000-0000-4000-8000-00000000f218';

/** Few literal value sets, so that corrections often repeat the current one. */
export const VALUES: readonly PaymentValues[] = [
  authorSourceValues,
  {
    amountMinor: '125550',
    currency: 'EUR',
    effectiveOn: '2026-02-14',
    method: 'Fictional transfer notice DEMO',
    externalReference: null,
    observationBasis: 'Fictional notice read by a human — not bank proof',
  },
  {
    amountMinor: '99999999999999',
    currency: 'USD',
    effectiveOn: '9999-12-31',
    method: '  Méthode fictive 😀  ',
    externalReference: 'FICT-REF-1218',
    observationBasis: '  Observation fictive DEMO  ',
  },
];
export const REASONS = [
  'Fictional transcription review DEMO',
  '  Revue fictive 😀 DEMO  ',
] as const;
export const NOTES = [
  'Independent fictional review DEMO',
  '  Revue indépendante 😀  ',
] as const;

export type PaymentState = 'DRAFT' | 'CONFIRMED' | 'WITHDRAWN' | 'REVERSED';
export type Action =
  'CREATE' | 'CORRECT_DRAFT' | 'WITHDRAW_DRAFT' | 'CONFIRM' | 'REVERSE';

export interface ConfirmationModel {
  member: MemberKey;
  recordedAt: string;
  note: string;
}
/** A revision's `{state, values, confirmation}` (§9). */
export type Snapshot =
  | {
      state: 'DRAFT' | 'WITHDRAWN';
      values: PaymentValues;
      confirmation: null;
    }
  | {
      state: 'CONFIRMED' | 'REVERSED';
      values: PaymentValues;
      confirmation: ConfirmationModel;
    };

export function terminal(state: PaymentState) {
  return state === 'WITHDRAWN' || state === 'REVERSED';
}

/** One prepared exact source tuple of a Company's payment evidence. */
export interface SourceModel {
  name: string;
  company: CompanyKey;
  clientId: string;
  tuple: PaymentSource;
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

export interface PaymentModel {
  id: string;
  company: CompanyKey;
  source: SourceModel;
  revision: number;
  snapshot: Snapshot;
  replaces: string | null;
  replacement: string | null;
  createdAt: string;
  /** One per revision, oldest first. */
  facts: Fact[];
}

/** The members who authored the CREATE or a CORRECT_DRAFT (§8). */
export function authorsOf(payment: PaymentModel): ReadonlySet<MemberKey> {
  return new Set(
    payment.facts
      .filter(
        (fact) => fact.action === 'CREATE' || fact.action === 'CORRECT_DRAFT',
      )
      .map((fact) => fact.member),
  );
}

/** One Payment command, before it has a key (§7). */
export type Command =
  | {
      action: 'CREATE';
      source: SourceModel;
      values: PaymentValues;
      replaces: PaymentModel | null;
    }
  | {
      action: 'CORRECT_DRAFT';
      payment: PaymentModel;
      expectedRevision: number;
      values: PaymentValues;
      reason: string;
    }
  | {
      action: 'WITHDRAW_DRAFT' | 'REVERSE';
      payment: PaymentModel;
      expectedRevision: number;
      reason: string;
    }
  | {
      action: 'CONFIRM';
      payment: PaymentModel;
      expectedRevision: number;
      note: string;
    };

/** A committed command, kept to replay its exact request later. */
export interface Committed {
  member: MemberKey;
  company: CompanyKey;
  command: Command;
  path: string;
  body: Record<string, unknown>;
  key: string;
  paymentId: string;
  receipt: string;
}

type GrantState = 'active' | 'absent' | 'revoked';

export interface Model {
  grants: Map<string, GrantState>;
  /** The Company each member's requests currently select. */
  context: Record<MemberKey, CompanyKey>;
  /** Every Payment, in creation order. */
  payments: PaymentModel[];
  committed: Committed[];
  /** Keys a refused command did not reserve, free for a later command. */
  refused: Array<{ member: MemberKey; key: string }>;
  /** The highest revision any fresh read or receipt showed per Payment. */
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
  touched: PaymentModel[];
  events: ExpectedEvent[];
}

/** The prepared Workspace, shared by every run of a test file. */
export interface PaymentWorld {
  fixture: PaymentEvidenceFixture;
  companyIds: Readonly<Record<CompanyKey, string>>;
  membershipIds: Readonly<Record<Actor, string>>;
  sources: Readonly<Record<CompanyKey, readonly SourceModel[]>>;
}

export class PaymentApi {
  private keys = 0;
  constructor(readonly world: PaymentWorld) {}

  /** Deterministic keys: each run starts from emptied Payment tables. */
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

  /** One request; without `company` it selects no Company context. */
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
    const response = await this.world.fixture.call(path, {
      method: options.method ?? 'GET',
      body: options.body,
      company:
        options.company === undefined
          ? null
          : this.world.companyIds[options.company],
      key: options.key,
      identity: IDENTITIES[actor],
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

/** Copied inventory, detail and history: any `payment.read` bundle (§6). */
export function canRead(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
) {
  return READ_BUNDLES.some((bundle) => granted(model, member, company, bundle));
}

/**
 * The invariant a wrongly admitted request breaks: a revocation of a
 * required bundle, another Payment bundle standing in for it, or no Payment
 * authority at all in that Company.
 */
export function denialInvariant(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
  required: readonly Bundle[],
): Invariant {
  if (
    required.some(
      (bundle) => grantState(model, member, company, bundle) === 'revoked',
    )
  )
    return 'revocation-denies';
  return BUNDLES.some((bundle) => granted(model, member, company, bundle))
    ? 'bundle-matrix'
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

/** The restricted event of each command (§10). */
export function eventAction(action: Action) {
  switch (action) {
    case 'CREATE':
      return 'payment.observation.recorded';
    case 'CORRECT_DRAFT':
      return 'payment.draft.corrected';
    case 'WITHDRAW_DRAFT':
      return 'payment.draft.withdrawn';
    case 'CONFIRM':
      return 'payment.confirmed';
    case 'REVERSE':
      return 'payment.reversed';
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

/** A closed object of exactly `keys` (§7, §9, §10). */
function closed(
  value: unknown,
  keys: readonly string[],
  what: string,
): Record<string, unknown> {
  const record = object(value, what);
  if (canonical(Object.keys(record).sort()) !== canonical([...keys].sort()))
    throw new InvariantViolation(
      'model-agreement',
      `${what} is not closed: ${canonical(record)}`,
    );
  return record;
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
  paymentId: string,
  revision: number,
  where: string,
) {
  const highest = model.revisions.get(paymentId) ?? 0;
  if (revision < highest)
    throw new InvariantViolation(
      'revisions-grow',
      `${where} shows Payment ${paymentId} at revision ${revision} after revision ${highest}`,
    );
  model.revisions.set(paymentId, revision);
}

/**
 * A public `{state, values, confirmation}` with its confirming actor named
 * by member, comparable with the model's snapshots.
 */
function seenSnapshot(api: PaymentApi, value: unknown, what: string): unknown {
  if (value === null) return null;
  const snapshot = closed(value, ['state', 'values', 'confirmation'], what);
  return {
    state: snapshot.state,
    values: snapshot.values,
    confirmation: seenConfirmation(api, snapshot.confirmation, what),
  };
}

function seenConfirmation(api: PaymentApi, value: unknown, what: string) {
  if (value === null) return null;
  const confirmation = closed(
    value,
    ['actor', 'recordedAt', 'note'],
    `${what}'s confirmation`,
  );
  const actor = closed(
    confirmation.actor,
    ['membershipId', 'displayName'],
    `${what}'s confirming actor`,
  );
  return {
    member: api.memberOf(actor.membershipId) ?? canonical(actor),
    recordedAt: confirmation.recordedAt,
    note: confirmation.note,
  };
}

/**
 * The model's Payments of a Company in inventory order: creation instant,
 * then Payment id, both descending. The ISO instants and lowercase UUIDs
 * compare by code unit as PostgreSQL compares the timestamps and UUIDs.
 */
export function inventoryOrder(model: Readonly<Model>, company: CompanyKey) {
  const key = (payment: PaymentModel) => `${payment.createdAt}/${payment.id}`;
  return model.payments
    .filter((payment) => payment.company === company)
    .sort((left, right) =>
      key(left) === key(right) ? 0 : key(left) < key(right) ? 1 : -1,
    );
}

/** Compares one fresh Payment summary with the model, in the Company read. */
export function expectSummary(input: {
  model: Model;
  api: PaymentApi;
  value: unknown;
  company: CompanyKey;
  where: string;
}): PaymentModel {
  const { model, api, company, where } = input;
  const summary = closed(
    input.value,
    [
      'id',
      'revision',
      'state',
      'values',
      'confirmation',
      'copiedContext',
      'createdAt',
      'replacesClosedPaymentId',
      'replacementPaymentId',
    ],
    `${where}'s Payment`,
  );
  const id = text(summary.id, `${where}'s Payment id`);
  const payment = model.payments.find((candidate) => candidate.id === id);
  if (!payment || payment.company !== company)
    throw new InvariantViolation(
      'company-isolation',
      `${where} in Company ${company} shows Payment ${id} of ${payment ? `Company ${payment.company}` : 'no known Company'}`,
    );
  const revision = integer(summary.revision, `${where}'s revision`);
  observeRevision(model, id, revision, where);
  if (revision !== payment.revision)
    throw new InvariantViolation(
      'history-once',
      `${where} shows Payment ${id} at revision ${revision}; its successful commands make ${payment.revision}`,
    );
  if (
    summary.replacesClosedPaymentId !== payment.replaces ||
    summary.replacementPaymentId !== payment.replacement
  )
    throw new InvariantViolation(
      'replacement-chain',
      `${where} shows Payment ${id} replacing ${canonical(summary.replacesClosedPaymentId)} and replaced by ${canonical(summary.replacementPaymentId)}; expected ${payment.replaces ?? 'none'} and ${payment.replacement ?? 'none'}`,
    );
  if (summary.state !== payment.snapshot.state)
    throw new InvariantViolation(
      'state-machine',
      `${where} shows Payment ${id} ${canonical(summary.state)}; its successful commands make it ${payment.snapshot.state}`,
    );
  const confirmation = seenConfirmation(
    api,
    summary.confirmation,
    `${where}'s Payment ${id}`,
  );
  if (canonical(confirmation) !== canonical(payment.snapshot.confirmation))
    throw new InvariantViolation(
      payment.snapshot.state === 'REVERSED'
        ? 'confirmation-kept'
        : 'state-machine',
      `${where} shows Payment ${id} confirmed as ${canonical(confirmation)}; expected ${canonical(payment.snapshot.confirmation)}`,
    );
  const expected = {
    values: payment.snapshot.values,
    createdAt: payment.createdAt,
    copiedContext: payment.source.copiedContext,
  };
  const seen = {
    values: summary.values,
    createdAt: summary.createdAt,
    copiedContext: canonical(summary.copiedContext),
  };
  if (canonical(seen) !== canonical(expected))
    throw new InvariantViolation(
      'model-agreement',
      `${where} shows Payment ${id} as ${canonical(seen)}; expected ${canonical(expected)}`,
    );
  return payment;
}

/** Reads every page of a Company's inventory. */
export async function readInventory(
  api: PaymentApi,
  actor: Actor,
  company: CompanyKey,
): Promise<{ first: Reply; items: unknown[] }> {
  const items: unknown[] = [];
  let cursor: string | null = null;
  let first: Reply | undefined;
  do {
    const reply = await api.send(
      actor,
      '/payments' +
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
 * A granted reader's inventory is exactly the Company's Payments in all four
 * states, newest first, every replacement naming its own terminal
 * predecessor, and no predecessor replaced twice.
 */
export function expectInventory(input: {
  model: Model;
  api: PaymentApi;
  company: CompanyKey;
  items: unknown[];
  who: string;
}) {
  const where = `${input.who}'s inventory`;
  const payments = input.items.map((value) =>
    expectSummary({ ...input, value, where }),
  );
  const predecessors = new Set<string>();
  for (const payment of payments) {
    if (payment.replaces === null) continue;
    const predecessor = payments.find(
      (candidate) => candidate.id === payment.replaces,
    );
    if (
      !predecessor ||
      !terminal(predecessor.snapshot.state) ||
      predecessors.has(predecessor.id)
    )
      throw new InvariantViolation(
        'replacement-chain',
        `${where} in Company ${input.company} shows Payment ${payment.id} replacing ${payment.replaces}, which is no terminal same-Company Payment of one replacement`,
      );
    predecessors.add(predecessor.id);
  }
  const seen = payments.map((payment) => payment.id);
  const expected = inventoryOrder(input.model, input.company).map(
    (payment) => payment.id,
  );
  if (canonical(seen) === canonical(expected)) return;
  throw new InvariantViolation(
    canonical([...seen].sort()) === canonical([...expected].sort())
      ? 'inventory-order'
      : 'model-agreement',
    `${where} in Company ${input.company} lists [${seen.join(', ')}], expected [${expected.join(', ')}]`,
  );
}

/** Reads every page of a Payment's history. */
export async function readHistory(
  api: PaymentApi,
  actor: Actor,
  company: CompanyKey,
  paymentId: string,
): Promise<{ first: Reply; items: unknown[]; headRevision: number | null }> {
  const items: unknown[] = [];
  let cursor: string | null = null;
  let first: Reply | undefined;
  let headRevision: number | null = null;
  do {
    const reply = await api.send(
      actor,
      `/payments/${paymentId}/history` +
        (cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`),
      { company },
    );
    if (!first) first = reply;
    if (reply.status !== 200) {
      if (reply === first) return { first, items, headRevision };
      throw new InvariantViolation(
        'model-agreement',
        `a later history page of Payment ${paymentId} failed: ${short(reply)}`,
      );
    }
    const page = object(reply.body, 'a history page');
    if (
      page.companyId !== api.companyIds[company] ||
      page.paymentId !== paymentId
    )
      throw new InvariantViolation(
        'company-isolation',
        `a history read of Payment ${paymentId} in Company ${company} answers for ${canonical(page.paymentId)} in ${api.companyOf(page.companyId) ?? canonical(page.companyId)}`,
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
 * A Payment's history is one closed revision per successful command, newest
 * first, each with its receipt's command and instant, its actor, its exact
 * before and after snapshots and its reason. `complete` is false for the
 * first page that a detail embeds.
 */
export function expectFacts(input: {
  model: Model;
  api: PaymentApi;
  payment: PaymentModel;
  items: unknown[];
  headRevision: number;
  complete: boolean;
  where: string;
}) {
  const { model, api, payment, where } = input;
  observeRevision(model, payment.id, input.headRevision, where);
  const seen = input.items.map((value) => {
    const fact = closed(
      value,
      [
        'format',
        'paymentId',
        'revision',
        'action',
        'commandId',
        'actor',
        'recordedAt',
        'before',
        'after',
        'reason',
      ],
      `${where}'s revision`,
    );
    if (fact.paymentId !== payment.id)
      throw new InvariantViolation(
        'company-isolation',
        `${where} of Payment ${payment.id} holds a revision of ${canonical(fact.paymentId)}`,
      );
    const revision = integer(fact.revision, `${where}'s revision number`);
    const actor = closed(
      fact.actor,
      ['membershipId', 'displayName'],
      `${where}'s actor`,
    );
    const before = seenSnapshot(api, fact.before, `${where}'s before`);
    const after = seenSnapshot(api, fact.after, `${where}'s after`);
    if (
      fact.action === 'REVERSE' &&
      canonical(object(after, `${where}'s after`).confirmation) !==
        canonical(object(before, `${where}'s before`).confirmation)
    )
      throw new InvariantViolation(
        'confirmation-kept',
        `${where} of Payment ${payment.id} reverses confirmation ${canonical(before)} into ${canonical(after)}`,
      );
    return {
      format: fact.format,
      revision,
      action: fact.action,
      commandId: fact.commandId,
      member: api.memberOf(actor.membershipId) ?? canonical(actor),
      recordedAt: fact.recordedAt,
      before,
      after,
      reason: fact.reason,
    };
  });
  const all = payment.facts
    .map((fact, index) => ({
      format: 'PAYMENT_REVISION/1',
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
  const expected = input.complete ? all : all.slice(0, 25);
  if (
    input.headRevision !== payment.revision ||
    seen.map((fact) => fact.revision).join() !==
      expected.map((fact) => fact.revision).join()
  )
    throw new InvariantViolation(
      'history-once',
      `${where} of Payment ${payment.id} has head ${input.headRevision} and revisions [${seen.map((fact) => fact.revision).join(' ')}]; its successful commands make [${expected.map((fact) => fact.revision).join(' ')}]`,
    );
  if (canonical(seen) !== canonical(expected))
    throw new InvariantViolation(
      'model-agreement',
      `${where} of Payment ${payment.id} is ${canonical(seen)}; expected ${canonical(expected)}`,
    );
}

async function expectHistory(
  model: Model,
  api: PaymentApi,
  payment: PaymentModel,
) {
  const history = await readHistory(api, 'owner', payment.company, payment.id);
  if (history.first.status !== 200 || history.headRevision === null)
    throw new InvariantViolation(
      'model-agreement',
      `the auditor cannot read the history of Payment ${payment.id}: ${short(history.first)}`,
    );
  expectFacts({
    model,
    api,
    payment,
    items: history.items,
    headRevision: history.headRevision,
    complete: true,
    where: 'the auditor history',
  });
}

/**
 * The restricted events and command receipts are exactly one per
 * successful command: none for a refusal, a no-op, a stale revision or a
 * replay, and no key reserved by a refused command.
 */
async function expectRestrictedEffects(model: Model, api: PaymentApi) {
  const read = async (sql: string) => {
    const result = await api.world.fixture.pool.query<{ entries: unknown }>(
      sql,
    );
    return canonical(result.rows[0]?.entries ?? null);
  };
  const facts = model.payments.flatMap((payment) =>
    payment.facts.map((fact, index) => ({
      payment,
      fact,
      revision: index + 1,
    })),
  );
  // PostgreSQL orders UUIDs as their lowercase text by code unit.
  const ordered = facts.sort((left, right) =>
    left.payment.id === right.payment.id
      ? left.revision - right.revision
      : left.payment.id < right.payment.id
        ? -1
        : 1,
  );
  const events = await read(
    `SELECT coalesce(jsonb_agg(jsonb_build_array(company_id, payment_id, revision, action, actor_membership_id, command_id) ORDER BY payment_id, revision), '[]'::jsonb) AS entries FROM payment_events`,
  );
  const expectedEvents = canonical(
    ordered.map(({ payment, fact, revision }) => [
      api.companyIds[payment.company],
      payment.id,
      revision,
      eventAction(fact.action),
      api.membershipIds[fact.member],
      fact.commandId,
    ]),
  );
  if (events !== expectedEvents)
    throw new InvariantViolation(
      'history-once',
      `the restricted Payment events are ${events}; the successful commands make ${expectedEvents}`,
    );
  const commands = await read(
    `SELECT coalesce(jsonb_agg(jsonb_build_array(actor_membership_id, idempotency_key, payment_id, revision, id) ORDER BY payment_id, revision), '[]'::jsonb) AS entries FROM payment_commands`,
  );
  const expectedCommands = canonical(
    ordered.map(({ payment, fact, revision }) => [
      api.membershipIds[fact.member],
      fact.key,
      payment.id,
      revision,
      fact.commandId,
    ]),
  );
  if (commands !== expectedCommands)
    throw new InvariantViolation(
      'history-once',
      `the committed Payment commands are ${commands}; the successful commands make ${expectedCommands}`,
    );
}

interface GenericEvent {
  id: string;
  action: string;
  companyId: unknown;
  membershipId: unknown;
}

async function genericActivity(api: PaymentApi): Promise<GenericEvent[]> {
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
    if (action.startsWith('payment.'))
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
 * one per actual grant or revocation; Payment commands, reads, no-ops,
 * replays and denials write none there (§10).
 */
async function expectActivity(
  model: Model,
  api: PaymentApi,
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
  api: PaymentApi,
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
  for (const payment of new Set(outcome.touched))
    await expectHistory(model, api, payment);
}

/** After a sequence: every Payment's complete history. */
export async function checkEnd(model: Model, api: PaymentApi) {
  for (const payment of model.payments)
    await expectHistory(model, api, payment);
}

async function expectStatus(
  response: Response,
  status: number,
  what: string,
): Promise<Reply> {
  const reply = await readReply(response);
  if (reply.status !== status)
    throw new Error(`Fuzz setup ${what} failed: ${short(reply)}`);
  return reply;
}

/**
 * Prepares one Company's sources through the native proof fixtures:
 * Document 1 with a superseded, an official and an uploaded draft Version,
 * and Document 2 with one official Version, both of the Company's Client.
 */
async function prepareCompany(
  fixture: PaymentEvidenceFixture,
  key: CompanyKey,
  company: AuthorSourceCompany,
): Promise<SourceModel[]> {
  const bytes = await paymentNoticePdf(`fuzz 1218 ${key}`);
  const first = await prepareAuthorSourceWithDraft(fixture, bytes, company);
  const { documentId } = first.official;
  // Designating the draft supersedes Version 1; Version 3 is the new draft.
  await authorSourceJson(
    await fixture.call(
      `/documents/${documentId}/versions/${first.draft.documentVersionId}/official-designation`,
      { method: 'POST', company: company.id, body: { expectedRevision: 5 } },
    ),
  );
  const successor = await authorSourceJson(
    await fixture.call(`/documents/${documentId}/versions`, {
      method: 'POST',
      company: company.id,
      body: { expectedRevision: 6 },
    }),
    201,
  );
  const draftVersionId = paymentText(successor.versionId);
  const uploaded = await authorSourceJson(
    await fixture.upload({
      documentId,
      versionId: draftVersionId,
      revision: 7,
      bytes,
      company: company.id,
    }),
    201,
  );
  const second = await prepareAuthorSource(fixture, {
    // The fixture's ADDITIONAL payer belongs to Company A's Client.
    payerKind: key === 'A' ? 'ADDITIONAL' : 'PRIMARY',
    bytes: await paymentNoticePdf(`fuzz 1218 ${key} second`),
    company: key === 'A' ? undefined : company,
  });
  const source = (
    name: string,
    state: SourceModel['state'],
    tuple: PaymentSource,
  ): SourceModel => ({
    name: `${key}${name}`,
    company: key,
    clientId: company.clientId,
    tuple,
    state,
    copiedContext: null,
  });
  // The draft comes last: source picks reach it least often.
  return [
    source('1.1', 'superseded', first.official),
    source('1.2', 'official', first.draft),
    source('2.1', 'official', second.source),
    source('1.3', 'draft', {
      documentId,
      documentVersionId: draftVersionId,
      representationId: paymentText(uploaded.representationId),
    }),
  ];
}

/**
 * Prepares the Workspace once per test file: the fixture's Company A and a
 * second Company B with its own Client, the members' equal native grants in
 * both, the owner's permanent Payment Reader in both, every fuzzed grant
 * issued once, and four source tuples per Company whose listed copies the
 * owner reads once.
 */
export async function openPaymentWorld(
  fixture: PaymentEvidenceFixture,
): Promise<PaymentWorld> {
  const ready = await fixture.reset();
  const membershipIds: Record<Actor, string> = {
    ana: ready.membershipIds[IDENTITIES.ana],
    bogdan: ready.membershipIds[IDENTITIES.bogdan],
    cora: ready.membershipIds[IDENTITIES.cora],
    owner: ready.membershipIds.owner,
  };
  const second = paymentText(
    (
      await authorSourceJson(
        await fixture.call('/companies', {
          method: 'POST',
          company: null,
          body: { displayName: 'Fictional second receiving Company 1218' },
        }),
        201,
      )
    ).id,
  );
  const grant = async (input: {
    path: string;
    companyId: string;
    membershipId: string;
  }) =>
    authorSourceJson(
      await fixture.call(input.path, {
        method: 'POST',
        company: null,
        body: {
          companyId: input.companyId,
          workspaceMembershipId: input.membershipId,
        },
      }),
      201,
    );
  for (const actor of [...MEMBERS, 'owner'] as const)
    for (const path of NATIVE_GRANTS)
      await grant({
        path,
        companyId: second,
        membershipId: membershipIds[actor],
      });
  for (const path of OWNER_GRANTS)
    await grant({ path, companyId: second, membershipId: membershipIds.owner });
  // Every fuzzed grant is issued once: a revocation then always has an
  // assignment history to answer from, and each run starts from it.
  for (const companyId of [ready.companyId, second])
    for (const member of MEMBERS)
      for (const bundle of BUNDLES)
        await grant({
          path: bundleAssignments(bundle),
          companyId,
          membershipId: membershipIds[member],
        });
  const client = await authorSourceJson(
    await fixture.call('/clients', {
      method: 'POST',
      company: second,
      body: {
        displayName: 'Fictional Payer of Company B',
        taxId: 'FICT-PAYER-1218-B',
        address: '1218 Fictional Street',
      },
    }),
    201,
  );
  const companies: Record<CompanyKey, AuthorSourceCompany> = {
    A: { id: ready.companyId, clientId: ready.clientId },
    B: { id: second, clientId: paymentText(client.id) },
  };
  const sources: Record<CompanyKey, SourceModel[]> = {
    A: await prepareCompany(fixture, 'A', companies.A),
    B: await prepareCompany(fixture, 'B', companies.B),
  };
  for (const company of COMPANIES) {
    const listed = await authorSourceJson(
      await fixture.call('/payments/sources', {
        company: companies[company].id,
      }),
    );
    const items = Array.isArray(listed.items) ? listed.items : [];
    for (const item of items) {
      const selectable = paymentRecord(item);
      const key = canonical(selectable.source);
      const source = sources[company].find(
        (candidate) => canonical(candidate.tuple) === key,
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
  return {
    fixture,
    companyIds: { A: companies.A.id, B: companies.B.id },
    membershipIds,
    sources,
  };
}

/**
 * A fresh run on the prepared Workspace: the Payment family's own tables are
 * emptied (no business path deletes their immutable rows; the per-Company
 * cursor keys stay), then the fuzzed grants return to their initial state
 * through the public assignment endpoints.
 */
export async function openRun(
  world: PaymentWorld,
): Promise<{ model: Model; api: PaymentApi }> {
  const { fixture } = world;
  await fixture.pool.query(
    'TRUNCATE payment_events, payment_history, payment_commands, payments',
  );
  const active = await fixture.pool.query<{ entries: unknown }>(
    `SELECT coalesce(jsonb_agg(jsonb_build_array(workspace_membership_id, company_id, bundle::text)), '[]'::jsonb) AS entries
     FROM company_role_assignments
     WHERE company_id = ANY($1::uuid[]) AND revoked_at IS NULL
       AND bundle::text IN ('company_payment_reader', 'company_payment_recorder', 'company_payment_confirmer', 'company_payment_reverser', 'company_payment_evidence_access')`,
    [[world.companyIds.A, world.companyIds.B]],
  );
  const activeKeys = new Set(
    list(active.rows[0]?.entries, 'the active Payment grants').map((row) =>
      canonical(row),
    ),
  );
  const model: Model = {
    grants: new Map(),
    context: { ...INITIAL_CONTEXT },
    payments: [],
    committed: [],
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
        const response = await fixture.call(
          wanted
            ? assignments
            : `${assignments}/${world.membershipIds[member]}/${world.companyIds[company]}`,
          {
            method: wanted ? 'POST' : 'DELETE',
            company: null,
            key: randomUUID(),
            body: wanted
              ? {
                  companyId: world.companyIds[company],
                  workspaceMembershipId: world.membershipIds[member],
                }
              : undefined,
          },
        );
        await expectStatus(response, wanted ? 201 : 200, 'grant reset');
      }
  const api = new PaymentApi(world);
  for (const event of await genericActivity(api)) model.events.add(event.id);
  return { model, api };
}
