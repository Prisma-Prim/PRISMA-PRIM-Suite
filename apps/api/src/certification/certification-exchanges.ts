import type { AuditStage } from './certification-stages.js';
import type {
  CertificationActorReference,
  CertificationAttachment,
  CertificationStepVersion,
} from './certification.types.js';

/**
 * The exchange register of a Certification Case (dossier control PRD §§8.2,
 * 8.3, 9.2): versioned human declarations of what was received and sent,
 * with the exact Document Versions exchanged, and the procedure deadline
 * states derived from them on read. Nothing here refuses a command.
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

/** A closed list: "other" requires a note. */
export const EXCHANGE_CHANNELS = [
  'email',
  'platform',
  'courier',
  'hand_delivery',
  'other',
] as const;
export type ExchangeChannel = (typeof EXCHANGE_CHANNELS)[number];

export const EXCHANGE_LIMITS = {
  counterpartName: 200,
  reference: 64,
  note: 2000,
  reason: 2000,
  attachments: 20,
} as const;

/** One immutable version of one Exchange Record; a correction adds one. */
export interface ExchangeRecordVersion {
  id: string;
  /** The record's number in its Case, kept by every correction. */
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
  /** The exact Document Versions attached to the Case that were exchanged. */
  attachmentIds: string[];
  reason: string | null;
  recordedBy: CertificationActorReference;
  recordedAt: string;
}

/** The latest version of each Exchange Record, in sequence order. */
export function currentExchanges(
  versions: readonly ExchangeRecordVersion[],
): ExchangeRecordVersion[] {
  const latest = new Map<number, ExchangeRecordVersion>();
  for (const version of versions) {
    const known = latest.get(version.sequence);
    if (!known || version.version > known.version)
      latest.set(version.sequence, version);
  }
  return [...latest.values()].sort(
    (left, right) => left.sequence - right.sequence,
  );
}

/** The deadline kinds of the certification body's procedure (PRD §8.2). */
export const DEADLINE_KINDS = [
  'stage_plan_sent',
  'audit_dossier_transmitted',
  'stage_2_report_released',
] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

/** Calendar days per kind, or `null` when the kind is not configured. */
export type DeadlineDays = Record<DeadlineKind, number | null>;

/** The bounds of a configured value, in whole calendar days. */
export const DEADLINE_DAYS_LIMIT = 365;

/** How each kind's due date stands to its anchor. */
export const DEADLINE_DIRECTIONS: Record<
  DeadlineKind,
  'before' | 'after' | 'not_before'
> = {
  stage_plan_sent: 'before',
  audit_dossier_transmitted: 'after',
  stage_2_report_released: 'not_before',
};

/** One version of a Company's procedure deadline set. */
export interface DeadlineSetVersion {
  version: number;
  days: DeadlineDays;
  configuredBy: CertificationActorReference;
  configuredAt: string;
}

export const DEADLINE_STATES = [
  'due',
  'met',
  'met_late',
  'overdue',
  'sent_too_early',
] as const;
export type DeadlineState = (typeof DEADLINE_STATES)[number];

/** The Case dates and Documents the procedure deadlines are anchored on. */
export interface DeadlineCaseFacts {
  /** Each recorded Stage plan: its first day and its plan's Document. */
  plans: { stage: AuditStage; startDate: string; documentId: string | null }[];
  /** S2: the last day of Stage 2, once its plan is recorded. */
  stage2End: string | null;
  /** The Document of the recorded Stage 2 report, if any. */
  stage2ReportDocumentId: string | null;
  /** D, and the Case revision at which the first decision version was recorded. */
  decision: { date: string; firstRevision: number } | null;
}

/** A current Exchange Record as the deadlines read it. */
export interface DeadlineExchange {
  sequence: number;
  version: number;
  /**
   * The Case revision at which its current transmission facts were first
   * recorded: a correction of only its reference or note keeps it.
   */
  caseRevision: number;
  direction: ExchangeDirection;
  itemKind: ExchangeItemKind;
  counterpartKind: ExchangeCounterpartKind;
  businessDate: string;
  /** The Documents of its exchanged Versions. */
  documentIds: string[];
}

export interface DeadlineRecordReference {
  sequence: number;
  version: number;
  businessDate: string;
}

/**
 * One configured deadline of a Case. `state` is `null` while its anchor is
 * not recorded; a "not before" deadline is then still breached by any
 * sending (PRD §8.1 R16).
 */
export interface DeadlineEntry {
  kind: DeadlineKind;
  stage: AuditStage | null;
  direction: 'before' | 'after' | 'not_before';
  days: number;
  anchor: string | null;
  dueDate: string | null;
  state: DeadlineState | null;
  /** The record that met, met late or breached it. */
  record: DeadlineRecordReference | null;
}

/**
 * The deadline states of one Case, derived with the given calendar date
 * (UTC). A kind without a value produces no entry; a state never refuses.
 */
export function deadlineStates(input: {
  facts: DeadlineCaseFacts;
  exchanges: readonly DeadlineExchange[];
  days: DeadlineDays | null;
  today: string;
}): DeadlineEntry[] {
  const { facts, exchanges, days, today } = input;
  if (days === null) return [];
  const entries: DeadlineEntry[] = [];
  const planDays = days.stage_plan_sent;
  if (planDays !== null)
    for (const stage of ['stage_1', 'stage_2'] as const) {
      const plan = facts.plans.find((entry) => entry.stage === stage);
      const documentId = plan?.documentId ?? null;
      const meeting =
        documentId === null
          ? []
          : exchanges.filter(
              (exchange) =>
                exchange.direction === 'sent' &&
                exchange.counterpartKind === 'client' &&
                exchange.documentIds.includes(documentId),
            );
      entries.push(
        dueBy({
          kind: 'stage_plan_sent',
          stage,
          days: planDays,
          anchor: plan?.startDate ?? null,
          dueDate: plan ? addDays(plan.startDate, -planDays) : null,
          meeting,
          today,
        }),
      );
    }
  const dossierDays = days.audit_dossier_transmitted;
  if (dossierDays !== null)
    entries.push(
      dueBy({
        kind: 'audit_dossier_transmitted',
        stage: null,
        days: dossierDays,
        anchor: facts.stage2End,
        dueDate:
          facts.stage2End === null
            ? null
            : addDays(facts.stage2End, dossierDays),
        meeting: exchanges.filter(
          (exchange) =>
            exchange.direction === 'sent' &&
            exchange.itemKind === 'audit_dossier' &&
            exchange.counterpartKind === 'certification_body',
        ),
        today,
      }),
    );
  const releaseDays = days.stage_2_report_released;
  if (releaseDays !== null) {
    const releases = stage2Releases(facts, exchanges, releaseDays);
    const early = releases.filter((release) => release.early);
    const shown = earliest(early.length ? early : releases);
    entries.push({
      kind: 'stage_2_report_released',
      stage: null,
      direction: 'not_before',
      days: releaseDays,
      anchor: facts.decision?.date ?? null,
      dueDate: facts.decision
        ? addDays(facts.decision.date, releaseDays)
        : null,
      state: early.length
        ? 'sent_too_early'
        : releases.length
          ? 'met'
          : facts.decision
            ? 'due'
            : null,
      record: shown ? reference(shown.exchange) : null,
    });
  }
  return entries;
}

/** A sending of the Stage 2 report to the client and whether it was early. */
export interface Stage2Release {
  exchange: DeadlineExchange;
  early: boolean;
  /**
   * Recorded while no decision existed: early whatever the decision's date
   * turns out to be. Otherwise early when dated before `earliestOn`.
   */
  recordedBeforeDecision: boolean;
  earliestOn: string | null;
}

/**
 * Every sending of a Version of the Stage 2 report to the client, against
 * the "not before" deadline: early when recorded while no decision existed,
 * or dated before the decision date plus the configured days.
 */
export function stage2Releases(
  facts: DeadlineCaseFacts,
  exchanges: readonly DeadlineExchange[],
  releaseDays: number,
): Stage2Release[] {
  const documentId = facts.stage2ReportDocumentId;
  if (documentId === null) return [];
  const decision = facts.decision;
  const earliestOn = decision ? addDays(decision.date, releaseDays) : null;
  return exchanges
    .filter(
      (exchange) =>
        exchange.direction === 'sent' &&
        exchange.counterpartKind === 'client' &&
        exchange.documentIds.includes(documentId),
    )
    .map((exchange) => {
      const recordedBeforeDecision =
        decision === null || exchange.caseRevision < decision.firstRevision;
      return {
        exchange,
        recordedBeforeDecision,
        earliestOn,
        early:
          recordedBeforeDecision ||
          (earliestOn !== null && exchange.businessDate < earliestOn),
      };
    });
}

/** The anchors of a Case's deadlines, from its recorded versions. */
export function deadlineFacts(
  steps: readonly CertificationStepVersion[],
  attachments: readonly CertificationAttachment[],
): DeadlineCaseFacts {
  const documentOf = (attachmentId: string) =>
    attachments.find((attachment) => attachment.id === attachmentId)
      ?.documentId ?? null;
  const plans: DeadlineCaseFacts['plans'] = [];
  let stage2End: string | null = null;
  let stage2ReportDocumentId: string | null = null;
  let decision: DeadlineCaseFacts['decision'] = null;
  let firstDecision: number | null = null;
  for (const version of steps)
    switch (version.step) {
      case 'stage_1_plan':
      case 'stage_2_plan': {
        const stage = version.step === 'stage_1_plan' ? 'stage_1' : 'stage_2';
        const entry = {
          stage,
          startDate: version.value.startDate,
          documentId: documentOf(version.value.planAttachmentId),
        } as const;
        const index = plans.findIndex((plan) => plan.stage === stage);
        if (index >= 0) plans.splice(index, 1, entry);
        else plans.push(entry);
        if (stage === 'stage_2') stage2End = version.value.endDate;
        break;
      }
      case 'stage_2_report':
        stage2ReportDocumentId = documentOf(version.value.reportAttachmentId);
        break;
      case 'decision':
        firstDecision ??= version.caseRevision;
        decision = {
          date: version.value.decidedOn,
          firstRevision: firstDecision,
        };
        break;
      default:
        break;
    }
  return { plans, stage2End, stage2ReportDocumentId, decision };
}

/** The current Exchange Records as the deadlines read them. */
export function deadlineExchanges(
  versions: readonly ExchangeRecordVersion[],
  attachments: readonly CertificationAttachment[],
): DeadlineExchange[] {
  return currentExchanges(versions).map((exchange) => ({
    sequence: exchange.sequence,
    version: exchange.version,
    caseRevision: transmittedAt(exchange, versions),
    direction: exchange.direction,
    itemKind: exchange.itemKind,
    counterpartKind: exchange.counterpart.kind,
    businessDate: exchange.businessDate,
    documentIds: exchange.attachmentIds.flatMap((attachmentId) => {
      const attachment = attachments.find((entry) => entry.id === attachmentId);
      return attachment ? [attachment.documentId] : [];
    }),
  }));
}

/**
 * The revision of the earliest version in the unbroken run of versions,
 * ending with the current one, that state the same transmission facts:
 * direction, item kind, exact Versions, counterpart, date and channel.
 */
function transmittedAt(
  current: ExchangeRecordVersion,
  versions: readonly ExchangeRecordVersion[],
): number {
  const history = versions
    .filter((version) => version.sequence === current.sequence)
    .sort((left, right) => left.version - right.version);
  let revision = current.caseRevision;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const version = history[index];
    if (!version || !sameTransmission(version, current)) break;
    revision = version.caseRevision;
  }
  return revision;
}

function sameTransmission(
  left: ExchangeRecordVersion,
  right: ExchangeRecordVersion,
): boolean {
  return (
    left.direction === right.direction &&
    left.itemKind === right.itemKind &&
    left.counterpart.kind === right.counterpart.kind &&
    left.counterpart.name === right.counterpart.name &&
    left.businessDate === right.businessDate &&
    left.channel === right.channel &&
    left.attachmentIds.length === right.attachmentIds.length &&
    left.attachmentIds.every((id) => right.attachmentIds.includes(id))
  );
}

/** A calendar date moved by whole days, in UTC. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dueBy(input: {
  kind: 'stage_plan_sent' | 'audit_dossier_transmitted';
  stage: AuditStage | null;
  days: number;
  anchor: string | null;
  dueDate: string | null;
  meeting: readonly DeadlineExchange[];
  today: string;
}): DeadlineEntry {
  const first = earliest(input.meeting.map((exchange) => ({ exchange })));
  const base = {
    kind: input.kind,
    stage: input.stage,
    direction: DEADLINE_DIRECTIONS[input.kind],
    days: input.days,
    anchor: input.anchor,
    dueDate: input.dueDate,
  };
  if (input.dueDate === null)
    return {
      ...base,
      state: null,
      record: first ? reference(first.exchange) : null,
    };
  if (first)
    return {
      ...base,
      state: first.exchange.businessDate <= input.dueDate ? 'met' : 'met_late',
      record: reference(first.exchange),
    };
  // Overdue from the calendar day after the due date, in UTC.
  return {
    ...base,
    state: input.today > input.dueDate ? 'overdue' : 'due',
    record: null,
  };
}

function earliest<T extends { exchange: DeadlineExchange }>(
  candidates: readonly T[],
): T | undefined {
  let found: T | undefined;
  for (const candidate of candidates)
    if (
      !found ||
      candidate.exchange.businessDate < found.exchange.businessDate ||
      (candidate.exchange.businessDate === found.exchange.businessDate &&
        candidate.exchange.sequence < found.exchange.sequence)
    )
      found = candidate;
  return found;
}

function reference(exchange: DeadlineExchange): DeadlineRecordReference {
  return {
    sequence: exchange.sequence,
    version: exchange.version,
    businessDate: exchange.businessDate,
  };
}

/** One Exchange Record with its current version and every version. */
export interface ExchangeRecordView {
  sequence: number;
  current: ExchangeRecordVersion;
  versions: ExchangeRecordVersion[];
}

/** The register keeps its latest records; the total says how many exist. */
export const EXCHANGE_LIMIT = 200;

/** The register part of the Case read: records, then deadline states. */
export interface ExchangeRegister {
  records: ExchangeRecordView[];
  total: number;
  deadlines: {
    set: DeadlineSetVersion | null;
    entries: DeadlineEntry[];
  };
}

/** The register in business-date order, with the deadlines derived today. */
export function exchangeRegister(input: {
  steps: readonly CertificationStepVersion[];
  attachments: readonly CertificationAttachment[];
  versions: readonly ExchangeRecordVersion[];
  set: DeadlineSetVersion | null;
  today: string;
}): ExchangeRegister {
  const current = currentExchanges(input.versions);
  const records = current
    .slice(-EXCHANGE_LIMIT)
    .map((exchange) => ({
      sequence: exchange.sequence,
      current: exchange,
      versions: input.versions
        .filter((version) => version.sequence === exchange.sequence)
        .sort((left, right) => left.version - right.version),
    }))
    .sort(
      (left, right) =>
        left.current.businessDate.localeCompare(right.current.businessDate) ||
        left.sequence - right.sequence,
    );
  return {
    records,
    total: current.length,
    deadlines: {
      set: input.set,
      entries: deadlineStates({
        facts: deadlineFacts(input.steps, input.attachments),
        exchanges: deadlineExchanges(input.versions, input.attachments),
        days: input.set?.days ?? null,
        today: input.today,
      }),
    },
  };
}
