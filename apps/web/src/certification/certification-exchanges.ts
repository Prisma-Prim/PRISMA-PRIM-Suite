import type { CertificationActorReference } from './certification-response';

/**
 * The exchange register of one Certification Case as the server publishes
 * it: the Exchange Records, the procedure deadline states derived on read
 * and the Re-verification Items, plus what the register's commands accept.
 * The server stays authoritative; this module parses strictly and mirrors
 * the bounds only to say what is missing before sending.
 */
export const EXCHANGE_DIRECTIONS = ['received', 'sent'] as const;
export type ExchangeDirection = (typeof EXCHANGE_DIRECTIONS)[number];

export const EXCHANGE_ITEM_KINDS = [
  'application',
  'agreement',
  'team_notice',
  'stage_plan',
  'stage_report',
  'participant_list',
  'nonconformity_response',
  'client_data_confirmation',
  'audit_dossier',
  'certificate_data_form',
  'certificate_draft',
  'client_opinion',
  'decision_form',
  'certificate',
  'other',
] as const;
export type ExchangeItemKind = (typeof EXCHANGE_ITEM_KINDS)[number];

export const EXCHANGE_COUNTERPART_KINDS = [
  'client',
  'certification_body',
  'audit_team_member',
  'other',
] as const;
export type ExchangeCounterpartKind =
  (typeof EXCHANGE_COUNTERPART_KINDS)[number];

export const EXCHANGE_CHANNELS = [
  'email',
  'platform',
  'courier',
  'hand_delivery',
  'other',
] as const;
export type ExchangeChannel = (typeof EXCHANGE_CHANNELS)[number];

export const DEADLINE_KINDS = [
  'stage_plan_sent',
  'audit_dossier_transmitted',
  'stage_2_report_released',
] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

export const DEADLINE_STATES = [
  'due',
  'met',
  'met_late',
  'overdue',
  'sent_too_early',
] as const;
export type DeadlineState = (typeof DEADLINE_STATES)[number];

/** The server's bounds for the register's commands. */
export const EXCHANGE_LIMITS = {
  counterpartName: 200,
  reference: 64,
  note: 2000,
  reason: 2000,
  attachments: 20,
  text: 2000,
  days: 365,
} as const;

export interface ExchangeVersion {
  id: string;
  sequence: number;
  version: number;
  caseRevision: number;
  direction: ExchangeDirection;
  itemKind: ExchangeItemKind;
  counterpart: { kind: ExchangeCounterpartKind; name: string };
  businessDate: string;
  channel: ExchangeChannel;
  reference: string | null;
  note: string | null;
  attachmentIds: string[];
  reason: string | null;
  recordedBy: CertificationActorReference;
  recordedAt: string;
}

export interface ExchangeRecord {
  sequence: number;
  current: ExchangeVersion;
  versions: ExchangeVersion[];
}

export type DeadlineDays = Record<DeadlineKind, number | null>;

export interface DeadlineSetVersion {
  version: number;
  days: DeadlineDays;
  configuredBy: CertificationActorReference;
  configuredAt: string;
}

export interface DeadlineEntry {
  kind: DeadlineKind;
  stage: 'stage_1' | 'stage_2' | null;
  direction: 'before' | 'after' | 'not_before';
  days: number;
  anchor: string | null;
  dueDate: string | null;
  /** `null` while the deadline's anchor is not recorded. */
  state: DeadlineState | null;
  record: { sequence: number; version: number; businessDate: string } | null;
}

export type ReverificationSource =
  | { kind: 'finding'; findingId: string; sequence: number }
  | { kind: 'discrepancy'; discrepancyId: string }
  | { kind: 'exchange'; sequence: number }
  | {
      kind: 'attachment';
      attachmentId: string;
      sourceTitle: string;
      versionNumber: number;
    };

type ItemBase = {
  id: string;
  caseRevision: number;
  source: ReverificationSource | null;
};
export type ReverificationItem =
  | (ItemBase & {
      origin: 'automatic';
      sequence: null;
      text: null;
      addedBy: null;
      addedAt: null;
      status: 'open';
      withdrawal: null;
    })
  | (ItemBase & {
      origin: 'manual' | 'discrepancy';
      sequence: number;
      text: string;
      addedBy: CertificationActorReference;
      addedAt: string;
    } & (
        | { status: 'open'; withdrawal: null }
        | {
            status: 'withdrawn';
            withdrawal: {
              caseRevision: number;
              reason: string;
              by: CertificationActorReference;
              at: string;
            };
          }
      ));

export type ExchangeSending = Pick<
  ExchangeVersion,
  | 'sequence'
  | 'version'
  | 'businessDate'
  | 'channel'
  | 'counterpart'
  | 'attachmentIds'
>;

export interface ExchangePage {
  records: ExchangeRecord[];
  total: number;
  nextCursor: string | null;
}

export interface Exchanges extends ExchangePage {
  sendings: ExchangeSending[];
  deadlines: { set: DeadlineSetVersion | null; entries: DeadlineEntry[] };
  reverification: {
    items: ReverificationItem[];
    firstSurveillanceBy: string | null;
  };
}

/** A Company's procedure deadline set and its history, latest first. */
export interface DeadlineHistory {
  current: DeadlineSetVersion | null;
  history: DeadlineSetVersion[];
}

/** The register's two filters; `all` keeps every record. */
export type ExchangeFilter = {
  direction: ExchangeDirection | 'all';
  itemKind: ExchangeItemKind | 'all';
};

export function filterExchanges(
  records: readonly ExchangeRecord[],
  filter: ExchangeFilter,
): ExchangeRecord[] {
  return records.filter(
    (record) =>
      (filter.direction === 'all' ||
        record.current.direction === filter.direction) &&
      (filter.itemKind === 'all' ||
        record.current.itemKind === filter.itemKind),
  );
}

/**
 * The sent Exchange Records that carry a Version of a Document, the
 * sendings a step shows for its own document.
 */
export function sendingsOf(
  records: readonly ExchangeSending[],
  documentId: string,
  attachments: readonly { id: string; documentId: string }[],
): ExchangeSending[] {
  return records.filter((record) =>
    record.attachmentIds.some(
      (id) =>
        attachments.find((attachment) => attachment.id === id)?.documentId ===
        documentId,
    ),
  );
}

export type ExchangeDraft = {
  direction: ExchangeDirection | '';
  itemKind: ExchangeItemKind | '';
  attachmentIds: string[];
  counterpartKind: ExchangeCounterpartKind | '';
  counterpartName: string;
  businessDate: string;
  channel: ExchangeChannel | '';
  reference: string;
  note: string;
  /** Corrections only. */
  reason: string;
};

export function emptyExchangeDraft(): ExchangeDraft {
  return {
    direction: '',
    itemKind: '',
    attachmentIds: [],
    counterpartKind: '',
    counterpartName: '',
    businessDate: '',
    channel: '',
    reference: '',
    note: '',
    reason: '',
  };
}

/** A correction starts from the record's current version. */
export function draftFromExchange(version: ExchangeVersion): ExchangeDraft {
  return {
    direction: version.direction,
    itemKind: version.itemKind,
    attachmentIds: [...version.attachmentIds],
    counterpartKind: version.counterpart.kind,
    counterpartName: version.counterpart.name,
    businessDate: version.businessDate,
    channel: version.channel,
    reference: version.reference ?? '',
    note: version.note ?? '',
    reason: '',
  };
}

export type ExchangeCheck =
  | { status: 'valid'; body: Record<string, unknown> }
  | { status: 'noteRequired' | 'reasonRequired' | 'invalid' };

/** The Exchange Record command, every Version attached to this Case. */
export function exchangeFromDraft(
  draft: ExchangeDraft,
  options: { attachments: readonly { id: string }[]; correcting: boolean },
): ExchangeCheck {
  const bounded = (value: string, limit: number) =>
    value.trim().length > 0 && value.length <= limit;
  const optional = (value: string, limit: number) =>
    value.trim() === '' || value.length <= limit;
  if (
    draft.direction === '' ||
    draft.itemKind === '' ||
    draft.counterpartKind === '' ||
    draft.channel === '' ||
    draft.attachmentIds.length === 0 ||
    draft.attachmentIds.length > EXCHANGE_LIMITS.attachments ||
    draft.attachmentIds.some(
      (id) => !options.attachments.some((entry) => entry.id === id),
    ) ||
    !bounded(draft.counterpartName, EXCHANGE_LIMITS.counterpartName) ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(draft.businessDate) ||
    !optional(draft.reference, EXCHANGE_LIMITS.reference) ||
    !optional(draft.note, EXCHANGE_LIMITS.note)
  )
    return { status: 'invalid' };
  if (draft.channel === 'other' && draft.note.trim() === '')
    return { status: 'noteRequired' };
  if (
    options.correcting &&
    (draft.reason.trim() === '' || draft.reason.length > EXCHANGE_LIMITS.reason)
  )
    return { status: 'reasonRequired' };
  const nullable = (value: string) => (value.trim() === '' ? null : value);
  return {
    status: 'valid',
    body: {
      direction: draft.direction,
      itemKind: draft.itemKind,
      attachmentIds: draft.attachmentIds,
      counterpart: { kind: draft.counterpartKind, name: draft.counterpartName },
      businessDate: draft.businessDate,
      channel: draft.channel,
      reference: nullable(draft.reference),
      note: nullable(draft.note),
      ...(options.correcting ? { reason: draft.reason } : {}),
    },
  };
}

export type ReverificationDraft = {
  text: string;
  /** `finding:<id>`, `exchange:<n>`, `attachment:<id>` or '' for none. */
  source: string;
};

export type ReverificationCheck =
  { status: 'valid'; body: Record<string, unknown> } | { status: 'invalid' };

export function reverificationFromDraft(
  draft: ReverificationDraft,
): ReverificationCheck {
  if (!draft.text.trim() || draft.text.length > EXCHANGE_LIMITS.text)
    return { status: 'invalid' };
  const [kind, id = ''] = draft.source.split(/:(.*)/su);
  let source: Record<string, unknown> | null = null;
  if (kind === 'finding') source = { findingId: id };
  else if (kind === 'attachment') source = { attachmentId: id };
  else if (kind === 'exchange' && /^[1-9]\d*$/u.test(id))
    source = { exchangeSequence: Number(id) };
  else if (kind === 'discrepancy') source = { discrepancyId: id };
  else if (draft.source !== '') return { status: 'invalid' };
  return { status: 'valid', body: { text: draft.text, source } };
}

export type DeadlineDraft = Record<DeadlineKind, string>;

export function draftFromDeadlines(
  set: DeadlineSetVersion | null,
): DeadlineDraft {
  const shown = (kind: DeadlineKind) => {
    const value = set?.days[kind] ?? null;
    return value === null ? '' : String(value);
  };
  return {
    stage_plan_sent: shown('stage_plan_sent'),
    audit_dossier_transmitted: shown('audit_dossier_transmitted'),
    stage_2_report_released: shown('stage_2_report_released'),
  };
}

export type DeadlineCheck =
  { status: 'valid'; body: Record<string, unknown> } | { status: 'invalid' };

/** Every kind: whole calendar days from 0 to 365, or empty for none. */
export function deadlinesFromDraft(
  draft: DeadlineDraft,
  expectedVersion: number,
): DeadlineCheck {
  const days: Partial<DeadlineDays> = {};
  for (const kind of DEADLINE_KINDS) {
    const value = draft[kind].trim();
    if (value === '') {
      days[kind] = null;
      continue;
    }
    if (!/^\d{1,3}$/u.test(value) || Number(value) > EXCHANGE_LIMITS.days)
      return { status: 'invalid' };
    days[kind] = Number(value);
  }
  return { status: 'valid', body: { expectedVersion, days } };
}

/** The Case read's exchange section, exactly as the server publishes it. */
export function parseExchanges(value: unknown): Exchanges {
  const body = object(value);
  const deadlines = object(body.deadlines);
  const reverification = object(body.reverification);
  const page = parseExchangePage(body);
  if (
    page.records.length !== Math.min(200, page.total) ||
    (page.nextCursor === null) !== page.total <= 200
  )
    invalid();
  const parsed: Exchanges = {
    ...page,
    sendings: collection(body.sendings).map(exchangeSending),
    deadlines: {
      set: deadlines.set === null ? null : deadlineSet(deadlines.set),
      entries: list(deadlines.entries).map(deadlineEntry),
    },
    reverification: {
      items: list(reverification.items).map(reverificationItem),
      firstSurveillanceBy:
        reverification.firstSurveillanceBy === null
          ? null
          : calendar(reverification.firstSurveillanceBy),
    },
  };
  if (
    new Set(parsed.sendings.map((entry) => entry.sequence)).size !==
    parsed.sendings.length
  )
    invalid();
  return parsed;
}

/** A bounded page of current records and their complete histories. */
export function parseExchangePage(value: unknown): ExchangePage {
  const body = object(value);
  const records = list(body.records).map(exchangeRecord);
  const total = count(body.total);
  const nextCursor =
    body.nextCursor === null ? null : text(body.nextCursor, 128);
  if (
    records.length > 200 ||
    total < records.length ||
    new Set(records.map((entry) => entry.sequence)).size !== records.length ||
    (nextCursor !== null && (records.length === 0 || total <= records.length))
  )
    invalid();
  return { records, total, nextCursor };
}

function exchangeSending(value: unknown): ExchangeSending {
  const body = object(value),
    counterpart = object(body.counterpart);
  const attachmentIds = list(body.attachmentIds).map((id) => text(id, 64));
  if (attachmentIds.length === 0) invalid();
  return {
    sequence: positive(body.sequence),
    version: positive(body.version),
    businessDate: calendar(body.businessDate),
    channel: oneOf(EXCHANGE_CHANNELS, body.channel),
    counterpart: {
      kind: oneOf(EXCHANGE_COUNTERPART_KINDS, counterpart.kind),
      name: text(counterpart.name, EXCHANGE_LIMITS.counterpartName),
    },
    attachmentIds,
  };
}

/** The deadline set history the Company administrator reads. */
export function parseDeadlineHistory(value: unknown): DeadlineHistory {
  const body = object(value);
  const history = list(body.history).map(deadlineSet);
  const current = body.current === null ? null : deadlineSet(body.current);
  if ((current?.version ?? null) !== (history[0]?.version ?? null)) invalid();
  return { current, history };
}

export function parseDeadlineSet(value: unknown): DeadlineSetVersion {
  return deadlineSet(value);
}

function exchangeRecord(value: unknown): ExchangeRecord {
  const body = object(value);
  const current = exchangeVersion(body.current);
  const versions = collection(body.versions).map(exchangeVersion);
  const sequence = positive(body.sequence);
  if (
    current.sequence !== sequence ||
    versions.some((version) => version.sequence !== sequence) ||
    versions.at(-1)?.id !== current.id
  )
    invalid();
  return { sequence, current, versions };
}

function exchangeVersion(value: unknown): ExchangeVersion {
  const body = object(value);
  const counterpart = object(body.counterpart);
  const version = positive(body.version);
  const reason =
    body.reason === null ? null : text(body.reason, EXCHANGE_LIMITS.reason);
  if ((version === 1) !== (reason === null)) invalid();
  const channel = oneOf(EXCHANGE_CHANNELS, body.channel);
  const note =
    body.note === null ? null : text(body.note, EXCHANGE_LIMITS.note);
  if (channel === 'other' && note === null) invalid();
  const ids = list(body.attachmentIds).map((entry) => text(entry, 64));
  if (ids.length === 0) invalid();
  return {
    id: text(body.id, 64),
    sequence: positive(body.sequence),
    version,
    caseRevision: positive(body.caseRevision),
    direction: oneOf(EXCHANGE_DIRECTIONS, body.direction),
    itemKind: oneOf(EXCHANGE_ITEM_KINDS, body.itemKind),
    counterpart: {
      kind: oneOf(EXCHANGE_COUNTERPART_KINDS, counterpart.kind),
      name: text(counterpart.name, EXCHANGE_LIMITS.counterpartName),
    },
    businessDate: calendar(body.businessDate),
    channel,
    reference:
      body.reference === null
        ? null
        : text(body.reference, EXCHANGE_LIMITS.reference),
    note,
    attachmentIds: ids,
    reason,
    recordedBy: actor(body.recordedBy),
    recordedAt: instant(body.recordedAt),
  };
}

function deadlineSet(value: unknown): DeadlineSetVersion {
  const body = object(value);
  const days = object(body.days);
  const day = (entry: unknown) => {
    if (entry === null) return null;
    const parsed = count(entry);
    if (parsed > EXCHANGE_LIMITS.days) invalid();
    return parsed;
  };
  return {
    version: positive(body.version),
    days: {
      stage_plan_sent: day(days.stage_plan_sent),
      audit_dossier_transmitted: day(days.audit_dossier_transmitted),
      stage_2_report_released: day(days.stage_2_report_released),
    },
    configuredBy: actor(body.configuredBy),
    configuredAt: instant(body.configuredAt),
  };
}

function deadlineEntry(value: unknown): DeadlineEntry {
  const body = object(value);
  const kind = oneOf(DEADLINE_KINDS, body.kind);
  const record = body.record === null ? null : object(body.record);
  return {
    kind,
    stage:
      body.stage === null
        ? null
        : oneOf(['stage_1', 'stage_2'] as const, body.stage),
    direction: oneOf(
      ['before', 'after', 'not_before'] as const,
      body.direction,
    ),
    days: count(body.days),
    anchor: body.anchor === null ? null : calendar(body.anchor),
    dueDate: body.dueDate === null ? null : calendar(body.dueDate),
    state: body.state === null ? null : oneOf(DEADLINE_STATES, body.state),
    record: record
      ? {
          sequence: positive(record.sequence),
          version: positive(record.version),
          businessDate: calendar(record.businessDate),
        }
      : null,
  };
}

function reverificationItem(value: unknown): ReverificationItem {
  const body = object(value);
  const base: ItemBase = {
    id: text(body.id, 80),
    caseRevision: positive(body.caseRevision),
    source: body.source === null ? null : reverificationSource(body.source),
  };
  if (body.origin === 'automatic') {
    if (
      body.status !== 'open' ||
      body.sequence !== null ||
      body.text !== null ||
      body.withdrawal !== null
    )
      invalid();
    return {
      ...base,
      origin: 'automatic',
      sequence: null,
      text: null,
      addedBy: null,
      addedAt: null,
      status: 'open',
      withdrawal: null,
    };
  }
  const stored = {
    ...base,
    origin: oneOf(['manual', 'discrepancy'] as const, body.origin),
    sequence: positive(body.sequence),
    text: text(body.text, EXCHANGE_LIMITS.text),
    addedBy: actor(body.addedBy),
    addedAt: instant(body.addedAt),
  };
  if (body.status === 'open') {
    if (body.withdrawal !== null) invalid();
    return { ...stored, status: 'open', withdrawal: null };
  }
  if (body.status !== 'withdrawn') return invalid();
  const withdrawal = object(body.withdrawal);
  return {
    ...stored,
    status: 'withdrawn',
    withdrawal: {
      caseRevision: positive(withdrawal.caseRevision),
      reason: text(withdrawal.reason, EXCHANGE_LIMITS.reason),
      by: actor(withdrawal.by),
      at: instant(withdrawal.at),
    },
  };
}

function reverificationSource(value: unknown): ReverificationSource {
  const body = object(value);
  switch (body.kind) {
    case 'finding':
      return {
        kind: 'finding',
        findingId: text(body.findingId, 64),
        sequence: positive(body.sequence),
      };
    case 'discrepancy':
      return {
        kind: 'discrepancy',
        discrepancyId: text(body.discrepancyId, 80),
      };
    case 'exchange':
      return { kind: 'exchange', sequence: positive(body.sequence) };
    case 'attachment':
      return {
        kind: 'attachment',
        attachmentId: text(body.attachmentId, 64),
        sourceTitle: text(body.sourceTitle),
        versionNumber: positive(body.versionNumber),
      };
    default:
      return invalid();
  }
}

function actor(value: unknown): CertificationActorReference {
  const body = object(value);
  return {
    workspaceMembershipId: text(body.workspaceMembershipId),
    displayName: text(body.displayName),
  };
}

function calendar(value: unknown): string {
  const raw = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(raw)) invalid();
  return raw;
}

function instant(value: unknown): string {
  const raw = text(value, 40);
  if (!Number.isFinite(Date.parse(raw))) invalid();
  return raw;
}

function oneOf<const T extends readonly string[]>(
  values: T,
  value: unknown,
): T[number] {
  const found = values.find((entry) => entry === value);
  if (found === undefined) invalid();
  return found;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return Object.fromEntries(Object.entries(value));
}

/** Histories and complete current sending facts have no record-count cap. */
function collection(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid();
  return value;
}

function list(value: unknown): unknown[] {
  const values = collection(value);
  if (values.length > 1000) invalid();
  return values;
}

function text(value: unknown, max = 4000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    invalid();
  return value;
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    invalid();
  return value;
}

function positive(value: unknown): number {
  const parsed = count(value);
  if (parsed < 1) invalid();
  return parsed;
}

function invalid(): never {
  throw new Error('Invalid Certification exchange register response.');
}
